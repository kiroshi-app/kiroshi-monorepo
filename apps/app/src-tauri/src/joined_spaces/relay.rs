use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::{json, Value};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{mpsc, watch};
use tokio::time::{interval_at, sleep, sleep_until, timeout, Instant};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

use super::commands::{
	announce_change, announce_reconnection, announce_removal, ready, JoinedSpaceRemovalReason,
	JoinedSpaceRemoved,
};
use super::contract::{JoinedSpace, JoinedSpaceConnection, JoinedSpaceError, JoinedSpaceWait};
use super::held::{self, Held};
use super::member_link::{MemberLink, Presence, Resync, LEARN_BOUND};
use super::member_wire::{Heard, MemberWire};
use super::members;
use super::proxy;
use super::roster_set::HeldRoster;
use super::wait_reason::wait_ended;
use super::waiting::{self, WaitingJoin};
use crate::account::cloud::{Cloud, CloudInstance, InstancesError, LeaveCallError};
use crate::account::session::{self, AccountSession};
use crate::db;
use crate::db::repositories::joined_spaces::{self, JoinedReach};
use crate::devices;
use crate::host_api::token::HostToken;
use crate::hosting::bridge::SHARED_SPACE_COMMAND;
use crate::hosting::relay::{
	opened_unpaused, sent, until_stopped, Backoff, Departure, Opened, Sink, Socket, PING_EVERY,
	SILENCE_BOUND,
};

const HOST_ABSENT: u16 = 4002;

const MEMBERSHIP_ENDED: u16 = 4003;

const SERVER_RESTARTING: u16 = 4005;

const SPACE_DELETED: u16 = 4007;

const CALLS_IN_FLIGHT: usize = 64;

const HOST_ANSWER_BOUND: Duration = Duration::from_secs(15);

const LEAVE_BOUND: Duration = Duration::from_secs(5);

pub struct RelayGuests {
	cloud: Cloud,
	guests: Mutex<HashMap<String, Guest>>,
	removed: Mutex<HashSet<String>>,
	unlisted: Mutex<HashSet<String>>,
	waiting: Mutex<HashMap<String, WaitingJoin>>,
	waits: Mutex<HashMap<String, JoinedSpaceWait>>,
	turn: tokio::sync::Mutex<()>,
	gestures: AtomicU64,
	known_relay_device: Mutex<Option<KnownRelayDevice>>,
	members_reading: Mutex<HashMap<String, bool>>,
	answer_bound: Duration,
	resend_every: Duration,
}

struct KnownRelayDevice {
	bearer: String,
	device_id: String,
	relay_device_id: String,
}

pub(super) struct MembersReading<'a> {
	reading: &'a Mutex<HashMap<String, bool>>,
	id: String,
	is_done: bool,
}

impl MembersReading<'_> {
	pub(super) fn is_asked_again(&mut self) -> bool {
		let mut reading = self.reading.lock().unwrap_or_else(PoisonError::into_inner);
		if let Some(asked_again) = reading.get_mut(&self.id).filter(|asked_again| **asked_again) {
			*asked_again = false;
			return true;
		}
		reading.remove(&self.id);
		self.is_done = true;
		false
	}
}

impl Drop for MembersReading<'_> {
	fn drop(&mut self) {
		if !self.is_done {
			self.reading.lock().unwrap_or_else(PoisonError::into_inner).remove(&self.id);
		}
	}
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
	joined: joined_spaces::JoinedSpace,
}

enum Ended {
	Stopped,
	Evicted(JoinedSpaceRemovalReason),
	Departed,
	Removed,
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
			removed: Mutex::new(HashSet::new()),
			unlisted: Mutex::new(HashSet::new()),
			waiting: Mutex::new(HashMap::new()),
			waits: Mutex::new(HashMap::new()),
			turn: tokio::sync::Mutex::new(()),
			gestures: AtomicU64::new(0),
			known_relay_device: Mutex::new(None),
			members_reading: Mutex::new(HashMap::new()),
			answer_bound: HOST_ANSWER_BOUND,
			resend_every: PING_EVERY,
		}
	}

	#[cfg(test)]
	pub(crate) fn answering_within(self, answer_bound: Duration) -> Self {
		Self { answer_bound, ..self }
	}

	pub fn cloud(&self) -> &Cloud {
		&self.cloud
	}

	#[cfg(test)]
	pub(crate) fn resending_every(self, resend_every: Duration) -> Self {
		Self { resend_every, ..self }
	}

	pub(super) fn answer_bound(&self) -> Duration {
		self.answer_bound
	}

	pub(super) fn resend_every(&self) -> Duration {
		self.resend_every
	}

	pub(super) fn known_relay_device(&self, bearer: &str, device_id: &str) -> Option<String> {
		let known = self.known_relay_device.lock().unwrap_or_else(PoisonError::into_inner);
		known
			.as_ref()
			.filter(|known| known.bearer == bearer && known.device_id == device_id)
			.map(|known| known.relay_device_id.clone())
	}

	pub(super) fn relay_device_known(&self, bearer: &str, device_id: &str, relay_device_id: &str) {
		*self.known_relay_device.lock().unwrap_or_else(PoisonError::into_inner) =
			Some(KnownRelayDevice {
				bearer: bearer.to_owned(),
				device_id: device_id.to_owned(),
				relay_device_id: relay_device_id.to_owned(),
			});
	}

	fn relay_device_forgotten(&self) {
		*self.known_relay_device.lock().unwrap_or_else(PoisonError::into_inner) = None;
	}

	pub(super) fn relay_device_forgotten_on_refusal(&self, opened: &Opened) {
		if matches!(opened, Opened::Unknown | Opened::Forbidden | Opened::Gone(_)) {
			self.relay_device_forgotten();
		}
	}

	pub(super) fn members_read_started(&self, id: &str) -> Option<MembersReading<'_>> {
		let mut reading = self.members_reading.lock().unwrap_or_else(PoisonError::into_inner);
		if let Some(asked_again) = reading.get_mut(id) {
			*asked_again = true;
			return None;
		}
		reading.insert(id.to_owned(), false);
		Some(MembersReading { reading: &self.members_reading, id: id.to_owned(), is_done: false })
	}

	fn removed(&self) -> MutexGuard<'_, HashSet<String>> {
		self.removed.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn unlisted(&self) -> MutexGuard<'_, HashSet<String>> {
		self.unlisted.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn gesture_made(&self) {
		self.gestures.fetch_add(1, Ordering::SeqCst);
	}

	fn gestures_made(&self) -> u64 {
		self.gestures.load(Ordering::SeqCst)
	}

	fn ended_error(&self, id: &str) -> JoinedSpaceError {
		if self.removed().contains(id) {
			return JoinedSpaceError::RemovedByRotation;
		}
		JoinedSpaceError::UnknownJoinedSpace { id: id.to_owned() }
	}

	pub fn is_joined(&self) -> bool {
		!self.guests().is_empty()
	}

	fn guests(&self) -> MutexGuard<'_, HashMap<String, Guest>> {
		self.guests.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub(super) fn waiting(&self) -> MutexGuard<'_, HashMap<String, WaitingJoin>> {
		self.waiting.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn waits(&self) -> MutexGuard<'_, HashMap<String, JoinedSpaceWait>> {
		self.waits.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub(super) fn waited(&self, instance_id: &str, wait: JoinedSpaceWait) {
		self.waits().insert(instance_id.to_owned(), wait);
	}

	pub(super) fn wait_ended(&self, instance_id: &str) {
		self.waits().remove(instance_id);
	}

	pub(super) fn last_wait(&self, instance_id: &str) -> Option<JoinedSpaceWait> {
		self.waits().get(instance_id).cloned()
	}

	async fn waiting_stopped(&self, id: &str) {
		let waiting = self.waiting().remove(id);
		if let Some(waiting) = waiting {
			waiting.finished(id).await;
		}
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
	pub(crate) fn is_waiting(&self, id: &str) -> bool {
		self.waiting().contains_key(id)
	}

	#[cfg(test)]
	pub(crate) fn is_removed(&self, id: &str) -> bool {
		self.removed().contains(id)
	}

	#[cfg(test)]
	pub(crate) fn is_unlisted(&self, id: &str) -> bool {
		self.unlisted().contains(id)
	}

	#[cfg(test)]
	pub(super) fn presence(&self, id: &str) -> Option<Presence> {
		self.reached(id).map(|reached| *reached.link.presence().borrow())
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
	session_bearer(app).map(|bearer| bearer.is_some())
}

fn session_bearer<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, String> {
	app.state::<AccountSession>()
		.bearer()
		.map_err(|error| format!("the account session store failed: {error:?}"))
}

pub(super) fn member_socket_url(cloud: &Cloud, instance_id: &str, relay_device_id: &str) -> String {
	format!("{}?device={relay_device_id}", cloud.member_relay_url(instance_id))
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
		name: name.or(held_name).unwrap_or_else(|| instance_id.clone()),
	};
	let wait = held::wait(app, &instance_id)?;
	let joined = repository.join(candidate).await?;
	guests.removed().remove(&joined.id);
	guests.unlisted().remove(&joined.id);
	guests.gesture_made();
	members::read_soon(app, &joined);
	announce_change(app, joined.id.clone())?;
	Ok(JoinedSpace::presented(joined, guests.cloud(), wait))
}

pub async fn reconciled<R: Runtime>(app: &AppHandle<R>) {
	let Some(guests) = app.try_state::<RelayGuests>() else {
		return;
	};
	if let Err(failure) = memberships_followed(app, &guests).await {
		log::warn!(
			"the joined spaces of every instance did not follow the cloud memberships: {failure}"
		);
	}
	let _turn = guests.turn.lock().await;
	if let Err(failure) = waiting::joins_started(app, &guests).await {
		log::warn!(
			"the joined spaces of every instance waiting for their host were not all followed: {failure:?}"
		);
	}
}

struct Listing {
	bearer: String,
	instances: Vec<CloudInstance>,
	gestures: u64,
}

struct Unlisted {
	bearer: String,
	held: Vec<UnlistedEntry>,
}

struct UnlistedEntry {
	id: String,
	instance_id: String,
	was_running: bool,
}

async fn memberships_followed<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
) -> Result<(), String> {
	let Some(listing) = listing_read(app, guests).await? else {
		return Ok(());
	};
	let unlisted = {
		let _turn = guests.turn.lock().await;
		if is_outdated(app, guests, &listing)? {
			log::info!(
				"the cloud memberships were read while a join, a leave or a sign-out moved the joined spaces: the next reconciliation follows them"
			);
			return Ok(());
		}
		listed_followed_unlisted_stopped(app, guests, listing).await?
	};
	let departed = departures_read(app, guests.cloud(), &unlisted).await;
	let _turn = guests.turn.lock().await;
	departed_evicted(app, guests, &unlisted.bearer, departed).await
}

async fn departures_read<'a, R: Runtime>(
	app: &AppHandle<R>,
	cloud: &Cloud,
	unlisted: &'a Unlisted,
) -> Vec<(&'a UnlistedEntry, JoinedSpaceRemovalReason)> {
	let mut departed = Vec::new();
	for entry in &unlisted.held {
		let reason =
			unlisted_reason(app, cloud, &unlisted.bearer, &entry.id, &entry.instance_id).await;
		departed.push((entry, reason));
	}
	departed
}

async fn departed_evicted<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
	bearer: &str,
	departed: Vec<(&UnlistedEntry, JoinedSpaceRemovalReason)>,
) -> Result<(), String> {
	let still_unlisted: Vec<bool> = {
		let mut unlisted = guests.unlisted();
		departed.iter().map(|(entry, _)| unlisted.remove(&entry.id)).collect()
	};
	if session_bearer(app)?.as_deref() != Some(bearer) {
		return Ok(());
	}
	for ((entry, reason), is_still_unlisted) in departed.into_iter().zip(still_unlisted) {
		if is_still_unlisted {
			entry_evicted(app, &entry.id, reason).await.map_err(described)?;
		} else if entry.was_running {
			guest_restarted(app, guests, entry).await;
		}
	}
	Ok(())
}

async fn guest_restarted<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
	entry: &UnlistedEntry,
) {
	if let Err(failure) = started_in_turn(app, guests, &entry.id).await {
		log::warn!(
			"joined space {} (instance {}) was joined again while unlisted and its guest did not start again: {failure:?}",
			entry.id,
			entry.instance_id
		);
	}
}

async fn listing_read<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
) -> Result<Option<Listing>, String> {
	let gestures = guests.gestures_made();
	let Some(bearer) = session_bearer(app)? else {
		return Ok(None);
	};
	match guests.cloud.instances(&bearer).await {
		Ok(instances) => Ok(Some(Listing { bearer, instances, gestures })),
		Err(InstancesError::Revoked) => {
			session::revoked(app, &bearer);
			Err("the cloud refused the account (401)".to_owned())
		}
		Err(InstancesError::Unreachable(reason)) => Err(reason),
	}
}

fn is_outdated<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
	listing: &Listing,
) -> Result<bool, String> {
	let is_signed_in_as_listed = session_bearer(app)?.as_deref() == Some(listing.bearer.as_str());
	Ok(!is_signed_in_as_listed || guests.gestures_made() != listing.gestures)
}

async fn listed_followed_unlisted_stopped<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
	listing: Listing,
) -> Result<Unlisted, String> {
	let Listing { bearer, instances: listed, .. } = listing;
	let state = app.state::<db::DatabaseState>();
	let database = ready(&state).map_err(described)?;
	let hosted = database.space_hosting().registered_instance_ids().await.map_err(described)?;
	let repository = database.joined_spaces();
	let held = repository.list().await.map_err(described)?;
	for instance in &listed {
		listed_followed(app, repository, &held, &hosted, instance).await?;
	}
	let mut unlisted = Vec::new();
	for (id, instance_id) in held.iter().map(relay_instance) {
		if !listed.iter().any(|instance| instance.id == instance_id) {
			let was_running = unlisted_stopped(guests, id).await;
			let (id, instance_id) = (id.to_owned(), instance_id.to_owned());
			unlisted.push(UnlistedEntry { id, instance_id, was_running });
		}
	}
	Ok(Unlisted { bearer, held: unlisted })
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

async fn unlisted_stopped(guests: &RelayGuests, id: &str) -> bool {
	guests.unlisted().insert(id.to_owned());
	let guest = guests.guests().remove(id);
	let was_running = guest.is_some();
	if let Some(guest) = guest {
		finished(id, guest).await;
	}
	guests.waiting_stopped(id).await;
	was_running
}

async fn unlisted_reason<R: Runtime>(
	app: &AppHandle<R>,
	cloud: &Cloud,
	bearer: &str,
	id: &str,
	instance_id: &str,
) -> JoinedSpaceRemovalReason {
	let roster = match held::roster(app, instance_id).await {
		Ok(Some(roster)) => roster,
		Ok(None) => return JoinedSpaceRemovalReason::Unknown,
		Err(failure) => {
			log::warn!(
				"joined space {id} (instance {instance_id}) could not ask the relay why it is unlisted: {failure:?}"
			);
			return JoinedSpaceRemovalReason::Unknown;
		}
	};
	let url = member_socket_url(cloud, instance_id, &roster.own.relay_device_id);
	match opened_unpaused(cloud, url, bearer).await {
		Opened::Gone(Some(departure)) => reason_of(departure),
		_ => JoinedSpaceRemovalReason::Unknown,
	}
}

pub(super) fn reason_of(departure: Departure) -> JoinedSpaceRemovalReason {
	match departure {
		Departure::SpaceDeleted => JoinedSpaceRemovalReason::Deleted,
		Departure::MemberRemoved => JoinedSpaceRemovalReason::Removed,
		Departure::MemberLeft => JoinedSpaceRemovalReason::Left,
	}
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
	started_in_turn(app, &guests, id).await
}

async fn started_in_turn<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
	id: &str,
) -> Result<(joined_spaces::JoinedSpace, Reached), JoinedSpaceError> {
	if guests.removed().contains(id) {
		return Err(JoinedSpaceError::RemovedByRotation);
	}
	let state = app.state::<db::DatabaseState>();
	let found = ready(&state)?.joined_spaces().find(id.to_owned()).await?;
	let unknown = || JoinedSpaceError::UnknownJoinedSpace { id: id.to_owned() };
	let found = found.ok_or_else(unknown)?;
	let JoinedReach::Relay { instance_id } = found.reach.clone();
	log::info!("joined space {id} (instance {instance_id}) connects from the front");
	let is_signed_in = is_signed_in(app).unwrap_or_else(|reason| {
		log::warn!("joined space {id} (instance {instance_id}) was not connected: {reason}");
		false
	});
	if !is_signed_in || devices::is_awaiting_approval(app) {
		log::warn!(
			"joined space {id} (instance {instance_id}) was not connected: no account is signed in or this device awaits its approval"
		);
		return Err(JoinedSpaceError::HostOffline { id: id.to_owned() });
	}
	if let Some(reached) = guests.reached(id) {
		return Ok((found, reached));
	}
	let held = match held::held(app, &instance_id).await? {
		Ok(held) => held,
		Err(wait) => return Err(waiting_for_host(id, &instance_id, wait)),
	};
	let link = Arc::new(MemberLink::new(&instance_id, session::this_computer().await.to_owned()));
	let token = Arc::new(HostToken::random());
	let (stop, stopped) = watch::channel(false);
	let reread = {
		let (app, id, instance_id) = (app.clone(), id.to_owned(), instance_id.clone());
		Arc::new(move || reread_announced(&app, &id, &instance_id))
	};
	let origin = proxy::served(Arc::clone(&link), Arc::clone(&token), reread, stopped.clone())
		.await
		.map_err(|error| JoinedSpaceError::ProxyUnavailable { detail: error.to_string() })?;
	let linked =
		Linked { id: id.to_owned(), instance_id, link: Arc::clone(&link), joined: found.clone() };
	let linked = guest_linked(app.clone(), linked, held, stopped);
	let run = tauri::async_runtime::spawn(members::alongside(app.clone(), &found, linked));
	let reached = Reached {
		origin: origin.clone(),
		token: token.bearer().to_owned(),
		link: Arc::clone(&link),
	};
	guests.guests().insert(id.to_owned(), Guest { origin, token, link, stop, run });
	Ok((found, reached))
}

fn waiting_for_host(id: &str, instance_id: &str, wait: JoinedSpaceWait) -> JoinedSpaceError {
	log::warn!(
		"joined space {id} (instance {instance_id}) was not connected: it waits for its host ({:?}): {}",
		wait.reason,
		wait.detail
	);
	let JoinedSpaceWait { reason, detail } = wait;
	JoinedSpaceError::WaitingForHost {
		id: id.to_owned(),
		instance_id: instance_id.to_owned(),
		reason,
		detail,
	}
}

async fn learned<R: Runtime>(
	app: &AppHandle<R>,
	id: &str,
	link: &MemberLink,
) -> Result<String, JoinedSpaceError> {
	let offline = || JoinedSpaceError::HostOffline { id: id.to_owned() };
	match link.settled().await {
		Presence::Online => {}
		Presence::Ended => return Err(app.state::<RelayGuests>().ended_error(id)),
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
	guests.gesture_made();
	let guest = guests.guests().remove(id);
	if let Some(guest) = guest {
		finished(id, guest).await;
	}
	guests.waiting_stopped(id).await;
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
	// The leave stays under turn so that no join, reconciliation or sign-out interleaves between
	// the relay ending the membership and the entry leaving: LEAVE_BOUND caps their queue.
	let Ok(left) = timeout(LEAVE_BOUND, cloud.leave_instance(&bearer, instance_id)).await else {
		let detail = format!("the relay did not answer the leave within {LEAVE_BOUND:?}");
		return Err(JoinedSpaceError::RelayUnreachable { detail });
	};
	match left {
		Ok(()) | Err(LeaveCallError::UnknownMembership) => Ok(()),
		Err(LeaveCallError::OwnerNotRemovable) => Err(JoinedSpaceError::OwnerNotRemovable),
		Err(LeaveCallError::Revoked) => {
			session::revoked(app, &bearer);
			Err(JoinedSpaceError::SessionRevoked)
		}
		Err(LeaveCallError::Refused(detail)) => Err(JoinedSpaceError::RelayRefused { detail }),
		Err(LeaveCallError::Unreachable(detail)) => {
			Err(JoinedSpaceError::RelayUnreachable { detail })
		}
	}
}

pub async fn signed_out<R: Runtime>(app: &AppHandle<R>) -> Option<tokio::sync::MutexGuard<'_, ()>> {
	let guests = app.try_state::<RelayGuests>()?.inner();
	let turn = guests.turn.lock().await;
	guests.gesture_made();
	guests.removed().clear();
	guests.unlisted().clear();
	guests.relay_device_forgotten();
	let running: Vec<(String, Guest)> = guests.guests().drain().collect();
	for (id, guest) in running {
		finished(&id, guest).await;
	}
	let waiting: Vec<(String, WaitingJoin)> = guests.waiting().drain().collect();
	for (id, waiting) in waiting {
		waiting.finished(&id).await;
	}
	if let Err(failure) = relay_entries_dropped(app).await {
		log::error!(
			"the relay spaces of every instance were not all dropped on sign out: {failure:?}"
		);
	}
	Some(turn)
}

async fn relay_entries_dropped<R: Runtime>(app: &AppHandle<R>) -> Result<(), JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	let repository = ready(&state)?.joined_spaces();
	for joined in repository.list().await? {
		if repository.remove(joined.id.clone()).await? {
			let JoinedReach::Relay { instance_id } = &joined.reach;
			wait_ended(app, instance_id);
			announce_change(app, joined.id)?;
		}
	}
	Ok(())
}

async fn finished(id: &str, guest: Guest) {
	guest.stop.send_replace(true);
	if let Err(error) = guest.run.await {
		log::error!(
			"the member relay of joined space {id} (instance {}) ended abnormally: {error}",
			guest.link.instance_id()
		);
	}
}

async fn guest_linked<R: Runtime>(
	app: AppHandle<R>,
	linked: Linked,
	mut held: Held,
	mut stop: watch::Receiver<bool>,
) {
	let mut backoff = Backoff::first();
	loop {
		let (ended, kept) = attempted(&app, &linked, held, &mut stop, &mut backoff).await;
		held = kept;
		match ended {
			Ended::Stopped => return linked.link.ended(Presence::Ended),
			Ended::Evicted(reason) => return evicted(&app, &linked, reason).await,
			Ended::Departed => {
				let Some(reason) = departure_asked(&app, &linked, &held, &mut stop).await else {
					return linked.link.ended(Presence::Ended);
				};
				return evicted(&app, &linked, reason).await;
			}
			Ended::Removed => {
				let guests = app.state::<RelayGuests>();
				guests.removed().insert(linked.id.clone());
				linked.link.ended(Presence::Ended);
				guests.left(&linked.id, &linked.link);
				return log::error!(
					"joined space {} (instance {}) heard no hello from its present host: the device left its roster",
					linked.id, linked.instance_id
				);
			}
			Ended::SignedOut(reason) => {
				linked.link.ended(Presence::Down);
				app.state::<RelayGuests>().left(&linked.id, &linked.link);
				return log::warn!(
					"joined space {} (instance {}) left its member relay: {reason}",
					linked.id,
					linked.instance_id
				);
			}
			Ended::Dropped(reason) => {
				linked.link.closed(Presence::Down);
				let step = backoff.step();
				log::warn!(
					"joined space {} (instance {}) lost its member relay and retries in {step:?}: {reason}",
					linked.id, linked.instance_id
				);
				if until_stopped(&mut stop, sleep(step)).await.is_none() {
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
	held: Held,
	stop: &mut watch::Receiver<bool>,
	backoff: &mut Backoff,
) -> (Ended, Held) {
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => return (Ended::SignedOut("no account is signed in"), held),
		Err(error) => {
			return (Ended::Dropped(format!("the account session store failed: {error:?}")), held)
		}
	};
	let cloud = &app.state::<RelayGuests>().cloud;
	let url = member_socket_url(cloud, &linked.instance_id, &held.roster.own.relay_device_id);
	match until_stopped(stop, opened_unpaused(cloud, url, &bearer)).await {
		None => (Ended::Stopped, held),
		Some(Opened::Socket(socket)) => {
			log::info!(
				"joined space {} (instance {}) opened its member relay socket",
				linked.id,
				linked.instance_id
			);
			backoff.socket_opened();
			online(app, *socket, linked, held, stop).await
		}
		Some(Opened::Unknown) => (Ended::Evicted(JoinedSpaceRemovalReason::Unknown), held),
		Some(Opened::Gone(Some(departure))) => (Ended::Evicted(reason_of(departure)), held),
		Some(Opened::Revoked) => {
			session::revoked(app, &bearer);
			(Ended::SignedOut("the relay refused the account (401)"), held)
		}
		Some(Opened::Forbidden | Opened::Gone(None)) => {
			(Ended::Dropped("the account is not a member of this instance (403)".to_owned()), held)
		}
		Some(Opened::RateLimited(retry_after)) => (
			Ended::Dropped(format!("the relay rate limited this device for {retry_after:?}")),
			held,
		),
		Some(Opened::Unreachable(reason)) => (Ended::Dropped(reason), held),
	}
}

async fn departure_asked<R: Runtime>(
	app: &AppHandle<R>,
	linked: &Linked,
	held: &Held,
	stop: &mut watch::Receiver<bool>,
) -> Option<JoinedSpaceRemovalReason> {
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		unasked => {
			log::warn!(
				"joined space {} (instance {}) could not ask the relay why its membership ended: {unasked:?}",
				linked.id, linked.instance_id
			);
			return Some(JoinedSpaceRemovalReason::Removed);
		}
	};
	let cloud = &app.state::<RelayGuests>().cloud;
	let url = member_socket_url(cloud, &linked.instance_id, &held.roster.own.relay_device_id);
	match until_stopped(stop, opened_unpaused(cloud, url, &bearer)).await? {
		Opened::Gone(Some(departure)) => Some(reason_of(departure)),
		_ => Some(JoinedSpaceRemovalReason::Removed),
	}
}

async fn online<R: Runtime>(
	app: &AppHandle<R>,
	socket: Socket,
	linked: &Linked,
	held: Held,
	stop: &mut watch::Receiver<bool>,
) -> (Ended, Held) {
	let state = app.state::<db::DatabaseState>();
	let database = match ready(&state) {
		Ok(database) => database,
		Err(failure) => {
			return (Ended::Dropped(format!("the database is unavailable: {failure:?}")), held)
		}
	};
	let mut wire = MemberWire::new(database.joined_space_relay(), &linked.instance_id, held);
	let ended = sealed_session(app, socket, linked, &mut wire, stop).await;
	(ended, wire.into_held())
}

enum Outgoing {
	Nothing,
	Hello,
	Sealed(String),
	Ping,
}

async fn sealed_session<R: Runtime>(
	app: &AppHandle<R>,
	socket: Socket,
	linked: &Linked,
	wire: &mut MemberWire<'_>,
	stop: &mut watch::Receiver<bool>,
) -> Ended {
	let link = &linked.link;
	let answer_bound = app.state::<RelayGuests>().answer_bound();
	let (mut sink, mut stream) = socket.split();
	let (calls_in, mut calls) = mpsc::channel(CALLS_IN_FLIGHT);
	let mut unopened = Some(calls_in);
	let mut hello_deadline = Instant::now() + answer_bound;
	let mut outgoing = Outgoing::Hello;
	let mut pings = interval_at(Instant::now() + PING_EVERY, PING_EVERY);
	let silence = sleep(SILENCE_BOUND);
	tokio::pin!(silence);
	loop {
		if matches!(outgoing, Outgoing::Hello) {
			hello_deadline = Instant::now() + answer_bound;
		}
		if let Err(reason) = delivered(&mut sink, wire, outgoing).await {
			return Ended::Dropped(reason);
		}
		let is_greeted = wire.is_greeted();
		let resume_deadline = link.resume_deadline();
		outgoing = tokio::select! {
			_ = stop.changed() => {
				let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
				if let Err(reason) = sent(&mut sink, Message::Close(Some(close))).await {
					log::warn!(
						"joined space {} (instance {}) left its member relay without its 1000 close frame: {reason}",
						linked.id, linked.instance_id
					);
				}
				return Ended::Stopped;
			}
			frame = stream.next() => {
				silence.as_mut().reset(Instant::now() + SILENCE_BOUND);
				match frame {
					Some(Ok(Message::Text(text))) => heard(app, linked, wire, text.as_str(), &mut unopened).await,
					Some(Ok(Message::Close(frame))) => return closed_by_relay(frame),
					Some(Ok(_)) => Outgoing::Nothing,
					Some(Err(error)) => return Ended::Dropped(format!("the member relay socket failed: {error}")),
					None => return Ended::Dropped("the member relay socket ended".to_owned()),
				}
			}
			Some(call) = calls.recv(), if is_greeted => Outgoing::Sealed(call),
			_ = sleep_until(hello_deadline), if !is_greeted => return Ended::Removed,
			_ = sleep_until(resume_deadline.unwrap_or_else(Instant::now)), if resume_deadline.is_some() => {
				log::warn!(
					"joined space {} (instance {}) heard no answer to its relay resume",
					linked.id, linked.instance_id
				);
				resynced(app, linked, link.resume_lapsed())
			}
			_ = pings.tick() => Outgoing::Ping,
			_ = &mut silence => {
				return Ended::Dropped(format!("no frame or pong arrived for {SILENCE_BOUND:?}"));
			}
		};
	}
}

async fn delivered(
	sink: &mut Sink,
	wire: &mut MemberWire<'_>,
	outgoing: Outgoing,
) -> Result<(), String> {
	let message = match outgoing {
		Outgoing::Nothing => return Ok(()),
		Outgoing::Hello => Message::text(wire.hello().await?),
		Outgoing::Sealed(plaintext) => Message::text(wire.sealed(&plaintext).await?),
		Outgoing::Ping => Message::Ping(Vec::new().into()),
	};
	sent(sink, message).await
}

async fn heard<R: Runtime>(
	app: &AppHandle<R>,
	linked: &Linked,
	wire: &mut MemberWire<'_>,
	text: &str,
	unopened: &mut Option<mpsc::Sender<String>>,
) -> Outgoing {
	let heard = match wire.opened(text).await {
		Ok(heard) => heard,
		Err(refusal) => {
			log::error!(
				"joined space {} (instance {}) dropped a relay frame: {refusal:?}",
				linked.id,
				linked.instance_id
			);
			return Outgoing::Nothing;
		}
	};
	match heard {
		Heard::Hello => match unopened.take() {
			Some(calls) => resynced(app, linked, linked.link.opened(calls)),
			None => Outgoing::Nothing,
		},
		Heard::Frame(plaintext) => resynced(app, linked, linked.link.received(&plaintext)),
		Heard::Roster(roster) => roster_taken(app, linked, wire, *roster).await,
		Heard::Current => Outgoing::Nothing,
		Heard::Rekey(handed) => match held::kept(app, &linked.instance_id, &handed).await {
			Ok(true) => {
				log::info!(
					"joined space {} (instance {}) kept a rekey: space key_id {}",
					linked.id,
					linked.instance_id,
					handed.space.key_id
				);
				wire.rekeyed(*handed);
				members::read_soon(app, &linked.joined);
				if wire.is_greeted() {
					Outgoing::Nothing
				} else {
					Outgoing::Hello
				}
			}
			Ok(false) => {
				log::error!(
					"joined space {} (instance {}) dropped a rekey: it carried an older roster",
					linked.id,
					linked.instance_id
				);
				Outgoing::Nothing
			}
			Err(failure) => {
				log::error!(
					"joined space {} (instance {}) dropped a rekey: it was not stored: {failure:?}",
					linked.id,
					linked.instance_id
				);
				Outgoing::Nothing
			}
		},
	}
}

async fn roster_taken<R: Runtime>(
	app: &AppHandle<R>,
	linked: &Linked,
	wire: &mut MemberWire<'_>,
	roster: HeldRoster,
) -> Outgoing {
	let version = roster.set.version;
	match held::roster_kept(app, &linked.instance_id, &roster).await {
		Ok(true) => {
			wire.roster_taken(roster);
			members::read_soon(app, &linked.joined);
		}
		Ok(false) => log::warn!(
			"joined space {} (instance {}) kept its roster: roster version {version} is not newer than the stored one",
			linked.id, linked.instance_id
		),
		Err(failure) => log::error!(
			"joined space {} (instance {}) kept its roster: roster version {version} was not stored: {failure:?}",
			linked.id, linked.instance_id
		),
	}
	Outgoing::Nothing
}

fn resynced<R: Runtime>(app: &AppHandle<R>, linked: &Linked, resync: Resync) -> Outgoing {
	match resync {
		Resync::InStep => Outgoing::Nothing,
		Resync::Resume(frame) => Outgoing::Sealed(frame),
		Resync::Reread => {
			reread_announced(app, &linked.id, &linked.instance_id);
			Outgoing::Nothing
		}
	}
}

fn reread_announced<R: Runtime>(app: &AppHandle<R>, id: &str, instance_id: &str) {
	if let Err(failure) = announce_reconnection(app, id.to_owned()) {
		log::error!(
			"joined space {id} (instance {instance_id}) must reread its host and the front was not told: {failure:?}"
		);
	}
}

pub(super) fn departure_closing(frame: &CloseFrame) -> Option<Departure> {
	match u16::from(frame.code) {
		MEMBERSHIP_ENDED => Some(Departure::MemberRemoved),
		SPACE_DELETED => Some(Departure::SpaceDeleted),
		_ => None,
	}
}

fn closed_by_relay(frame: Option<CloseFrame>) -> Ended {
	match frame.map(|frame| u16::from(frame.code)) {
		Some(SPACE_DELETED) => Ended::Evicted(JoinedSpaceRemovalReason::Deleted),
		Some(MEMBERSHIP_ENDED) => Ended::Departed,
		Some(HOST_ABSENT) => {
			Ended::Dropped(format!("the relay room has no host (code {HOST_ABSENT})"))
		}
		Some(SERVER_RESTARTING) => {
			Ended::Dropped(format!("the member relay is restarting (code {SERVER_RESTARTING})"))
		}
		code => Ended::Dropped(format!("the member relay closed the socket with code {code:?}")),
	}
}

async fn evicted<R: Runtime>(
	app: &AppHandle<R>,
	linked: &Linked,
	reason: JoinedSpaceRemovalReason,
) {
	let id = &linked.id;
	let guests = app.state::<RelayGuests>();
	guests.removed().insert(id.clone());
	linked.link.ended(Presence::Ended);
	guests.left(id, &linked.link);
	if let Err(failure) = entry_evicted(app, id, reason).await {
		log::error!(
			"joined space {id} (instance {}) whose membership ended was not evicted: {failure:?}",
			linked.instance_id
		);
	}
}

pub(super) async fn entry_evicted<R: Runtime>(
	app: &AppHandle<R>,
	id: &str,
	reason: JoinedSpaceRemovalReason,
) -> Result<(), JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	let repository = ready(&state)?.joined_spaces();
	let Some(found) = repository.find(id.to_owned()).await? else {
		return Ok(());
	};
	if !repository.remove(id.to_owned()).await? {
		return Ok(());
	}
	let JoinedReach::Relay { instance_id } = &found.reach;
	wait_ended(app, instance_id);
	log::warn!(
		"joined space {id} (instance {instance_id}) was removed: its membership ended ({reason:?})"
	);
	announce_change(app, id.to_owned())?;
	announce_removal(app, JoinedSpaceRemoved { id: id.to_owned(), name: found.name, reason })
}
