use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{mpsc, watch};
use tokio::time::{interval_at, sleep, sleep_until, timeout, Instant};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

use super::commands::{announce_change, announce_reconnection, announce_removal, ready};
use super::contract::{JoinedSpace, JoinedSpaceConnection, JoinedSpaceError};
use super::member_link::{MemberLink, Presence, Resync, LEARN_BOUND};
use super::proxy;
use crate::account::cloud::{Cloud, CloudInstance, InstancesError, MemberCallError};
use crate::account::session::{self, AccountSession};
use crate::db;
use crate::db::repositories::joined_spaces::{self, JoinedReach};
use crate::host_api::token::HostToken;
use crate::hosting::bridge::SHARED_SPACE_COMMAND;
use crate::hosting::relay::{
	opened, sent, until_stopped, Backoff, Opened, Socket, PING_EVERY, SILENCE_BOUND,
};

const HOST_ABSENT: u16 = 4002;

const MEMBERSHIP_ENDED: u16 = 4003;

const SERVER_RESTARTING: u16 = 4005;

const CALLS_IN_FLIGHT: usize = 64;

pub struct RelayGuests {
	cloud: Cloud,
	guests: Mutex<HashMap<String, Guest>>,
	turn: tokio::sync::Mutex<()>,
}

struct Guest {
	origin: String,
	token: Arc<HostToken>,
	link: Arc<MemberLink>,
	stop: watch::Sender<bool>,
	run: JoinHandle<()>,
}

struct Reached {
	origin: String,
	token: String,
	link: Arc<MemberLink>,
}

struct Linked {
	id: String,
	instance_id: String,
	link: Arc<MemberLink>,
}

enum Ended {
	Stopped,
	Evicted,
	SignedOut(&'static str),
	Dropped(String),
}

#[derive(Debug)]
pub enum RelayJoinError {
	SignedOut,
	Account(String),
	Joined(JoinedSpaceError),
}

impl From<JoinedSpaceError> for RelayJoinError {
	fn from(error: JoinedSpaceError) -> Self {
		RelayJoinError::Joined(error)
	}
}

impl From<db::DatabaseError> for RelayJoinError {
	fn from(error: db::DatabaseError) -> Self {
		RelayJoinError::Joined(error.into())
	}
}

impl RelayGuests {
	pub fn new(api_url: &str) -> Self {
		Self {
			cloud: Cloud::new(api_url),
			guests: Mutex::new(HashMap::new()),
			turn: tokio::sync::Mutex::new(()),
		}
	}

	pub fn cloud(&self) -> &Cloud {
		&self.cloud
	}

	pub fn is_joined(&self) -> bool {
		!self.guests().is_empty()
	}

	fn guests(&self) -> MutexGuard<'_, HashMap<String, Guest>> {
		self.guests.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn reached(&self, id: &str) -> Option<Reached> {
		self.guests().get(id).map(|guest| Reached {
			origin: guest.origin.clone(),
			token: guest.token.bearer().to_owned(),
			link: Arc::clone(&guest.link),
		})
	}

	fn left(&self, id: &str, link: &Arc<MemberLink>) -> Option<Guest> {
		let mut guests = self.guests();
		let is_this_guest = guests.get(id).is_some_and(|guest| Arc::ptr_eq(&guest.link, link));
		is_this_guest.then(|| guests.remove(id)).flatten()
	}

	#[cfg(test)]
	pub(crate) fn is_running(&self, id: &str) -> bool {
		self.guests().contains_key(id)
	}

	#[cfg(test)]
	pub(crate) fn turn(&self) -> &tokio::sync::Mutex<()> {
		&self.turn
	}

	#[cfg(test)]
	pub(crate) fn stopping(&self, id: &str) -> Option<watch::Receiver<bool>> {
		self.guests().get(id).map(|guest| guest.stop.subscribe())
	}

	#[cfg(test)]
	pub(crate) fn link_dropped(&self, id: &str) -> impl std::future::Future<Output = ()> {
		let presence = self.reached(id).map(|reached| reached.link.presence());
		async move {
			let mut presence = presence.expect("a guest runs");
			let dropped = presence.wait_for(|now| *now == Presence::Down).await;
			dropped.map(drop).expect("the link is held");
		}
	}
}

fn is_signed_in<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
	app.state::<AccountSession>()
		.bearer()
		.map(|bearer| bearer.is_some())
		.map_err(|error| format!("the account session store failed: {error:?}"))
}

pub async fn joined<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: String,
	name: Option<String>,
) -> Result<JoinedSpace, RelayJoinError> {
	let guests = app.state::<RelayGuests>();
	let _turn = guests.turn.lock().await;
	if !is_signed_in(app).map_err(RelayJoinError::Account)? {
		return Err(RelayJoinError::SignedOut);
	}
	let state = app.state::<db::DatabaseState>();
	let repository = ready(&state)?.joined_spaces();
	let reach = JoinedReach::Relay { instance_id: instance_id.clone() };
	let held_name = repository
		.list()
		.await?
		.into_iter()
		.find(|joined| joined.reach == reach)
		.map(|joined| joined.name);
	let candidate = joined_spaces::JoinedSpace {
		id: uuid::Uuid::new_v4().to_string(),
		reach,
		remote_space_id: None,
		name: name.or(held_name).unwrap_or(instance_id),
	};
	let joined = repository.join(candidate).await?;
	announce_change(app, joined.id.clone())?;
	Ok(JoinedSpace::presented(joined, guests.cloud()))
}

pub async fn reconciled<R: Runtime>(app: &AppHandle<R>) {
	let Some(guests) = app.try_state::<RelayGuests>() else {
		return;
	};
	let _turn = guests.turn.lock().await;
	if let Err(failure) = memberships_followed(app, &guests).await {
		eprintln!("the joined spaces did not follow the cloud memberships: {failure}");
	}
}

async fn memberships_followed<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
) -> Result<(), String> {
	let bearer = app
		.state::<AccountSession>()
		.bearer()
		.map_err(|error| format!("the account session store failed: {error:?}"))?;
	let Some(bearer) = bearer else {
		return Ok(());
	};
	let listed = match guests.cloud.instances(&bearer).await {
		Ok(listed) => listed,
		Err(InstancesError::Revoked) => {
			session::revoked(app, &bearer);
			return Err("the cloud refused the account (401)".to_owned());
		}
		Err(InstancesError::Unreachable(reason)) => return Err(reason),
	};
	let state = app.state::<db::DatabaseState>();
	let database = ready(&state).map_err(described)?;
	let hosted = database.space_hosting().registered_instance_ids().await.map_err(described)?;
	let repository = database.joined_spaces();
	let held = repository.list().await.map_err(described)?;
	for instance in &listed {
		listed_followed(app, repository, &held, &hosted, instance).await?;
	}
	for (id, instance_id) in held.iter().map(relay_instance) {
		if !listed.iter().any(|instance| instance.id == instance_id) {
			unlisted_dropped(app, guests, id).await?;
		}
	}
	Ok(())
}

fn relay_instance(joined: &joined_spaces::JoinedSpace) -> (&str, &str) {
	let JoinedReach::Relay { instance_id } = &joined.reach;
	(&joined.id, instance_id)
}

async fn listed_followed<R: Runtime>(
	app: &AppHandle<R>,
	repository: &joined_spaces::JoinedSpacesRepository,
	held: &[joined_spaces::JoinedSpace],
	hosted: &[String],
	instance: &CloudInstance,
) -> Result<(), String> {
	let reach = JoinedReach::Relay { instance_id: instance.id.clone() };
	let entry = match held.iter().find(|joined| joined.reach == reach) {
		Some(entry) if entry.name == instance.name => return Ok(()),
		Some(entry) => joined_spaces::JoinedSpace { name: instance.name.clone(), ..entry.clone() },
		None if hosted.contains(&instance.id) => return Ok(()),
		None => joined_spaces::JoinedSpace {
			id: uuid::Uuid::new_v4().to_string(),
			reach,
			remote_space_id: None,
			name: instance.name.clone(),
		},
	};
	let joined = repository.join(entry).await.map_err(described)?;
	announce_change(app, joined.id).map_err(described)
}

async fn unlisted_dropped<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
	id: &str,
) -> Result<(), String> {
	let guest = guests.guests().remove(id);
	if let Some(guest) = guest {
		finished(id, guest).await;
	}
	entry_evicted(app, id).await.map_err(described)
}

fn described(failure: impl std::fmt::Debug) -> String {
	format!("{failure:?}")
}

pub async fn connected<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
) -> Result<JoinedSpaceConnection, JoinedSpaceError> {
	let (mut found, reached) = started(app, &id).await?;
	if found.remote_space_id.is_none() {
		found.remote_space_id = Some(learned(app, &found.id, &reached.link).await?);
	}
	Ok(JoinedSpaceConnection::over(found, reached.origin, reached.token))
}

async fn started<R: Runtime>(
	app: &AppHandle<R>,
	id: &str,
) -> Result<(joined_spaces::JoinedSpace, Reached), JoinedSpaceError> {
	let guests = app.state::<RelayGuests>();
	let _turn = guests.turn.lock().await;
	let state = app.state::<db::DatabaseState>();
	let found = ready(&state)?.joined_spaces().find(id.to_owned()).await?;
	let unknown = || JoinedSpaceError::UnknownJoinedSpace { id: id.to_owned() };
	let found = found.ok_or_else(unknown)?;
	let JoinedReach::Relay { instance_id } = found.reach.clone();
	let is_signed_in = is_signed_in(app).unwrap_or_else(|reason| {
		eprintln!("joined space {id} was not connected: {reason}");
		false
	});
	if !is_signed_in {
		return Err(JoinedSpaceError::HostOffline { id: id.to_owned() });
	}
	if let Some(reached) = guests.reached(id) {
		return Ok((found, reached));
	}
	let link = Arc::new(MemberLink::new());
	let token = Arc::new(HostToken::random());
	let (stop, stopped) = watch::channel(false);
	let reread = {
		let (app, id) = (app.clone(), id.to_owned());
		Arc::new(move || reread_announced(&app, &id))
	};
	let origin = proxy::served(Arc::clone(&link), Arc::clone(&token), reread, stopped.clone())
		.await
		.map_err(|error| JoinedSpaceError::ProxyUnavailable { detail: error.to_string() })?;
	let linked = Linked { id: id.to_owned(), instance_id, link: Arc::clone(&link) };
	let run = tauri::async_runtime::spawn(guest_linked(app.clone(), linked, stopped));
	let reached = Reached {
		origin: origin.clone(),
		token: token.bearer().to_owned(),
		link: Arc::clone(&link),
	};
	guests.guests().insert(id.to_owned(), Guest { origin, token, link, stop, run });
	Ok((found, reached))
}

async fn learned<R: Runtime>(
	app: &AppHandle<R>,
	id: &str,
	link: &MemberLink,
) -> Result<String, JoinedSpaceError> {
	let offline = || JoinedSpaceError::HostOffline { id: id.to_owned() };
	match link.settled().await {
		Presence::Online => {}
		Presence::Ended => return Err(JoinedSpaceError::UnknownJoinedSpace { id: id.to_owned() }),
		Presence::Connecting | Presence::Down => return Err(offline()),
	}
	let answer = timeout(LEARN_BOUND, link.called(SHARED_SPACE_COMMAND, json!({})))
		.await
		.ok()
		.flatten()
		.filter(|answer| answer.status == 200)
		.ok_or_else(offline)?;
	let space_id = answer.body.get("spaceId").and_then(Value::as_str).ok_or_else(offline)?;
	let state = app.state::<db::DatabaseState>();
	ready(&state)?.joined_spaces().learned(id.to_owned(), space_id.to_owned()).await?;
	Ok(space_id.to_owned())
}

pub async fn left<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), JoinedSpaceError> {
	let guests = app.state::<RelayGuests>();
	let _turn = guests.turn.lock().await;
	let state = app.state::<db::DatabaseState>();
	let repository = ready(&state)?.joined_spaces();
	let unknown = || JoinedSpaceError::UnknownJoinedSpace { id: id.to_owned() };
	let found = repository.find(id.to_owned()).await?.ok_or_else(unknown)?;
	let JoinedReach::Relay { instance_id } = &found.reach;
	membership_ended(app, &guests.cloud, instance_id).await?;
	if !repository.remove(id.to_owned()).await? {
		return Err(unknown());
	}
	let guest = guests.guests().remove(id);
	if let Some(guest) = guest {
		finished(id, guest).await;
	}
	Ok(())
}

async fn membership_ended<R: Runtime>(
	app: &AppHandle<R>,
	cloud: &Cloud,
	instance_id: &str,
) -> Result<(), JoinedSpaceError> {
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => return Err(JoinedSpaceError::NeedsSignIn),
		Err(error) => return Err(JoinedSpaceError::SessionStore { detail: format!("{error:?}") }),
	};
	match cloud.leave_instance(&bearer, instance_id).await {
		Ok(()) | Err(MemberCallError::UnknownMember) => Ok(()),
		Err(MemberCallError::OwnerNotRemovable) => Err(JoinedSpaceError::OwnerNotRemovable),
		Err(MemberCallError::Revoked) => {
			session::revoked(app, &bearer);
			Err(JoinedSpaceError::SessionRevoked)
		}
		Err(MemberCallError::Unreachable(detail)) => {
			Err(JoinedSpaceError::RelayUnreachable { detail })
		}
		Err(refused) => Err(JoinedSpaceError::RelayUnreachable {
			detail: format!("the cloud refused to end the membership: {refused:?}"),
		}),
	}
}

pub async fn signed_out<R: Runtime>(app: &AppHandle<R>) -> Option<tokio::sync::MutexGuard<'_, ()>> {
	let guests = app.try_state::<RelayGuests>()?.inner();
	let turn = guests.turn.lock().await;
	let running: Vec<(String, Guest)> = guests.guests().drain().collect();
	for (id, guest) in running {
		finished(&id, guest).await;
	}
	if let Err(failure) = relay_entries_dropped(app).await {
		eprintln!("the relay spaces were not all dropped on sign out: {failure:?}");
	}
	Some(turn)
}

async fn relay_entries_dropped<R: Runtime>(app: &AppHandle<R>) -> Result<(), JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	let repository = ready(&state)?.joined_spaces();
	for joined in repository.list().await? {
		if repository.remove(joined.id.clone()).await? {
			announce_change(app, joined.id)?;
		}
	}
	Ok(())
}

async fn finished(id: &str, guest: Guest) {
	guest.stop.send_replace(true);
	if let Err(error) = guest.run.await {
		eprintln!("the member relay of joined space {id} ended abnormally: {error}");
	}
}

async fn guest_linked<R: Runtime>(
	app: AppHandle<R>,
	linked: Linked,
	mut stop: watch::Receiver<bool>,
) {
	let mut backoff = Backoff::first();
	loop {
		match attempted(&app, &linked, &mut stop, &mut backoff).await {
			Ended::Stopped => return linked.link.ended(Presence::Ended),
			Ended::Evicted => {
				linked.link.ended(Presence::Ended);
				return evicted(&app, &linked).await;
			}
			Ended::SignedOut(reason) => {
				linked.link.ended(Presence::Down);
				app.state::<RelayGuests>().left(&linked.id, &linked.link);
				return eprintln!(
					"joined space {} (instance {}) left its member relay: {reason}",
					linked.id, linked.instance_id
				);
			}
			Ended::Dropped(reason) => {
				linked.link.closed(Presence::Down);
				eprintln!(
					"joined space {} (instance {}) lost its member relay: {reason}",
					linked.id, linked.instance_id
				);
				if until_stopped(&mut stop, sleep(backoff.step())).await.is_none() {
					return linked.link.ended(Presence::Ended);
				}
				linked.link.connecting();
			}
		}
	}
}

async fn attempted<R: Runtime>(
	app: &AppHandle<R>,
	linked: &Linked,
	stop: &mut watch::Receiver<bool>,
	backoff: &mut Backoff,
) -> Ended {
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => return Ended::SignedOut("no account is signed in"),
		Err(error) => {
			return Ended::Dropped(format!("the account session store failed: {error:?}"))
		}
	};
	let url = app.state::<RelayGuests>().cloud.member_relay_url(&linked.instance_id);
	match until_stopped(stop, opened(url, &bearer)).await {
		None => Ended::Stopped,
		Some(Opened::Socket(socket)) => {
			backoff.reset();
			online(app, *socket, linked, stop).await
		}
		Some(Opened::Unknown) => Ended::Evicted,
		Some(Opened::Revoked) => {
			session::revoked(app, &bearer);
			Ended::SignedOut("the relay refused the account (401)")
		}
		Some(Opened::Forbidden) => {
			Ended::Dropped("the account is not a member of this instance (403)".to_owned())
		}
		Some(Opened::Unreachable(reason)) => Ended::Dropped(reason),
	}
}

async fn online<R: Runtime>(
	app: &AppHandle<R>,
	socket: Socket,
	linked: &Linked,
	stop: &mut watch::Receiver<bool>,
) -> Ended {
	let link = &linked.link;
	let (mut sink, mut stream) = socket.split();
	let (calls_in, mut calls) = mpsc::channel(CALLS_IN_FLIGHT);
	if let Some(resume) = resynced(app, linked, link.opened(calls_in)) {
		if let Err(reason) = sent(&mut sink, resume).await {
			return Ended::Dropped(reason);
		}
	}
	let mut pings = interval_at(Instant::now() + PING_EVERY, PING_EVERY);
	let silence = sleep(SILENCE_BOUND);
	tokio::pin!(silence);
	loop {
		let resume_deadline = link.resume_deadline();
		let outgoing = tokio::select! {
			_ = stop.changed() => {
				let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
				if let Err(reason) = sent(&mut sink, Message::Close(Some(close))).await {
					eprintln!("a member relay was left without its 1000 close frame: {reason}");
				}
				return Ended::Stopped;
			}
			frame = stream.next() => {
				silence.as_mut().reset(Instant::now() + SILENCE_BOUND);
				match frame {
					Some(Ok(Message::Text(text))) => match resynced(app, linked, link.received(text.as_str())) {
						Some(resume) => resume,
						None => continue,
					},
					Some(Ok(Message::Close(frame))) => return closed_by_relay(frame),
					Some(Ok(_)) => continue,
					Some(Err(error)) => return Ended::Dropped(format!("the member relay socket failed: {error}")),
					None => return Ended::Dropped("the member relay socket ended".to_owned()),
				}
			}
			Some(call) = calls.recv() => Message::text(call),
			_ = sleep_until(resume_deadline.unwrap_or_else(Instant::now)), if resume_deadline.is_some() => {
				eprintln!("joined space {} heard no answer to its relay resume", linked.id);
				resynced(app, linked, link.resume_lapsed());
				continue;
			}
			_ = pings.tick() => Message::Ping(Vec::new().into()),
			_ = &mut silence => {
				return Ended::Dropped(format!("no frame or pong arrived for {SILENCE_BOUND:?}"));
			}
		};
		if let Err(reason) = sent(&mut sink, outgoing).await {
			return Ended::Dropped(reason);
		}
	}
}

fn resynced<R: Runtime>(app: &AppHandle<R>, linked: &Linked, resync: Resync) -> Option<Message> {
	match resync {
		Resync::InStep => None,
		Resync::Resume(frame) => Some(Message::text(frame)),
		Resync::Reread => {
			reread_announced(app, &linked.id);
			None
		}
	}
}

fn reread_announced<R: Runtime>(app: &AppHandle<R>, id: &str) {
	if let Err(failure) = announce_reconnection(app, id.to_owned()) {
		eprintln!("joined space {id} must reread its host and the front was not told: {failure:?}");
	}
}

fn closed_by_relay(frame: Option<CloseFrame>) -> Ended {
	match frame.map(|frame| u16::from(frame.code)) {
		Some(MEMBERSHIP_ENDED) => Ended::Evicted,
		Some(HOST_ABSENT) => {
			Ended::Dropped(format!("the relay room has no host (code {HOST_ABSENT})"))
		}
		Some(SERVER_RESTARTING) => {
			Ended::Dropped(format!("the member relay is restarting (code {SERVER_RESTARTING})"))
		}
		code => Ended::Dropped(format!("the member relay closed the socket with code {code:?}")),
	}
}

async fn evicted<R: Runtime>(app: &AppHandle<R>, linked: &Linked) {
	let id = &linked.id;
	app.state::<RelayGuests>().left(id, &linked.link);
	if let Err(failure) = entry_evicted(app, id).await {
		eprintln!("joined space {id} whose membership ended was not evicted: {failure:?}");
	}
}

async fn entry_evicted<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	let repository = ready(&state)?.joined_spaces();
	let Some(found) = repository.find(id.to_owned()).await? else {
		return Ok(());
	};
	if !repository.remove(id.to_owned()).await? {
		return Ok(());
	}
	eprintln!("joined space {id} was removed: its membership ended");
	announce_change(app, id.to_owned())?;
	announce_removal(app, id.to_owned(), found.name)
}
