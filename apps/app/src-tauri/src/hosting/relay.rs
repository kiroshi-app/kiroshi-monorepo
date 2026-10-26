use std::collections::hash_map::RandomState;
use std::future::Future;
use std::hash::{BuildHasher, Hasher};
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::Value;
use tauri::http::{header, HeaderValue};
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpStream;
use tokio::sync::{watch, Mutex};
use tokio::task::JoinSet;
use tokio::time::{interval_at, sleep, timeout, Instant};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::{Error as SocketError, Message};
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use super::bridge::{self, LocalApi};
use super::contract::{HostingFailureKind, HostingState};
use super::devices::Revocation;
use super::replay::{self, LastSent, Relaying, Ring, Stamped};
use super::roster::{self, Rostered};
use super::wire::{self, Dropped, HostKeys, Opened as OpenedFrame, Refusal, Wire};
use super::{admission, devices, entered, handover, members, Hosting};
use crate::account::cloud::{retry_after, Cloud, DeviceRegisterError, MeError, RegisterError};
use crate::account::session::{self, AccountSession};
use crate::db::repositories::conversations::AvatarBlot;
use crate::db::{self, Database};
use crate::host_api::events::{FELL_BEHIND, SEND_PATIENCE};
use crate::missions::github::installed_tls_provider;
use crate::spaces::commands::ready;
use crate::spaces::contract::SpaceError;

pub(crate) const PING_EVERY: Duration = Duration::from_secs(30);

pub(crate) const SILENCE_BOUND: Duration = Duration::from_secs(90);

const FIRST_BACKOFF: Duration = Duration::from_secs(1);

const BACKOFF_CAP: Duration = Duration::from_secs(60);

const STEADY_OPEN: Duration = Duration::from_secs(30);

const CONNECT_BOUND: Duration = Duration::from_secs(20);

const HOST_REPLACED: u16 = 4001;

const SERVER_RESTARTING: u16 = 4005;

const DEVICE_REVOKED: u16 = 4006;

pub(crate) type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(crate) type Sink = SplitSink<Socket, Message>;

#[derive(Default, Clone, Copy)]
struct LastFrames {
	received: Option<usize>,
	sent: Option<usize>,
}

struct MeasuredSink<'a> {
	sink: Sink,
	frames: &'a mut LastFrames,
}

impl MeasuredSink<'_> {
	fn heard(&mut self, frame: &Message) {
		if carries_data(frame) {
			self.frames.received = Some(frame.len());
		}
	}

	async fn sent(&mut self, message: Message) -> Result<(), String> {
		if carries_data(&message) {
			self.frames.sent = Some(message.len());
		}
		sent(&mut self.sink, message).await
	}
}

fn carries_data(frame: &Message) -> bool {
	frame.is_text() || frame.is_binary()
}

fn dropped_reason(reason: &str, frames: LastFrames) -> String {
	let weighed = |frame: Option<usize>| {
		frame.map_or_else(|| "none".to_owned(), |bytes| format!("{bytes} bytes"))
	};
	format!(
		"{reason} (last frame received: {}, last frame sent: {})",
		weighed(frames.received),
		weighed(frames.sent)
	)
}

pub(super) struct Hosted {
	pub(super) space_id: String,
	pub(super) name: String,
	pub(super) colour: Option<AvatarBlot>,
	pub(super) instance_id: Option<String>,
}

#[derive(Clone, Copy)]
struct Serving<'a> {
	local: &'a LocalApi,
	keys: &'a HostKeys,
}

pub(crate) enum Opened {
	Socket(Box<Socket>),
	Revoked,
	Forbidden,
	Unknown,
	Gone(Option<Departure>),
	RateLimited(Duration),
	Unreachable(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum Departure {
	SpaceDeleted,
	MemberRemoved,
	MemberLeft,
}

#[derive(Deserialize)]
struct GoneBody {
	error: GoneCode,
}

#[derive(Deserialize)]
struct GoneCode {
	code: Departure,
}

enum Ended {
	Stopped,
	Replaced,
	DeviceRevoked,
	Dropped(String),
	Failed(HostingFailureKind, String),
}

enum Next {
	Reregister,
	Retry(String),
	Settled(HostingState),
	Stopped,
}

pub(crate) struct Backoff {
	next: Duration,
	opened_at: Option<Instant>,
}

impl Backoff {
	pub(crate) fn first() -> Self {
		Self { next: FIRST_BACKOFF, opened_at: None }
	}

	pub(crate) fn socket_opened(&mut self) {
		self.opened_at = Some(Instant::now());
	}

	pub(crate) fn step(&mut self) -> Duration {
		if self.opened_at.take().is_some_and(|opened_at| opened_at.elapsed() >= STEADY_OPEN) {
			self.next = FIRST_BACKOFF;
		}
		let full = self.next;
		self.next = (full * 2).min(BACKOFF_CAP);
		jittered(full)
	}
}

fn jittered(step: Duration) -> Duration {
	let drawn = RandomState::new().build_hasher().finish() as f64 / u64::MAX as f64;
	step + (step / 2).mul_f64(drawn)
}

pub(super) async fn hosted<R: Runtime>(
	app: AppHandle<R>,
	mut hosted: Hosted,
	local: LocalApi,
	mut stop: watch::Receiver<bool>,
) {
	let ring = watch::channel(Ring::started()).0;
	let space_id = hosted.space_id.clone();
	let keys = match wire::host_keys(&app, &space_id).await {
		Ok(keys) => keys,
		Err((failure, detail)) => {
			let instance_id = hosted.instance_id.as_deref();
			return entered(&app, &space_id, instance_id, HostingState::Failed { failure, detail });
		}
	};
	if let Some(instance_id) = &hosted.instance_id {
		let described = super::described(&app, instance_id, &hosted.name, hosted.colour);
		if until_stopped(&mut stop, described).await.is_none() {
			return;
		}
	}
	let serving = Serving { local: &local, keys: &keys };
	tokio::select! {
		() = attempts(&app, &mut hosted, serving, &mut stop, &ring) => return,
		() = replay::recorded(&app, &space_id, &ring) => {}
	}
	let closed = HostingState::Failed {
		failure: HostingFailureKind::LocalEventStreamClosed,
		detail: "the local event stream closed".to_owned(),
	};
	entered(&app, &space_id, hosted.instance_id.as_deref(), closed);
}

async fn attempts<R: Runtime>(
	app: &AppHandle<R>,
	hosted: &mut Hosted,
	serving: Serving<'_>,
	stop: &mut watch::Receiver<bool>,
	ring: &watch::Sender<Ring>,
) {
	let mut backoff = Backoff::first();
	let mut replaced = None;
	let mut relaying = Relaying::from_the_start_of(ring);
	loop {
		let next =
			attempted(app, hosted, serving, stop, &mut backoff, &mut replaced, &mut relaying).await;
		let instance_id = hosted.instance_id.as_deref();
		match next {
			Next::Stopped => return,
			Next::Reregister => continue,
			Next::Settled(state) => return entered(app, &hosted.space_id, instance_id, state),
			Next::Retry(reason) => {
				log::warn!(
					"hosting of space {} (instance {}) lost its relay: {reason}",
					hosted.space_id,
					instance_id.unwrap_or("none")
				);
				entered(app, &hosted.space_id, instance_id, HostingState::Connecting);
				if until_stopped(stop, sleep(backoff.step())).await.is_none() {
					return;
				}
			}
		}
	}
}

async fn attempted<R: Runtime>(
	app: &AppHandle<R>,
	hosted: &mut Hosted,
	serving: Serving<'_>,
	stop: &mut watch::Receiver<bool>,
	backoff: &mut Backoff,
	replaced: &mut Option<String>,
	relaying: &mut Relaying<'_>,
) -> Next {
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => return Next::Settled(HostingState::NeedsSignIn),
		Err(error) => {
			let detail = format!("the account session store failed: {error:?}");
			return failed(HostingFailureKind::AccountSessionStoreFailed, detail);
		}
	};
	let cloud = &app.state::<Hosting>().cloud;
	if until_stopped(stop, cloud.unpaused()).await.is_none() {
		return Next::Stopped;
	}
	let relay_device_id = match relay_device(app, &bearer, &hosted.space_id, serving.keys).await {
		Ok(relay_device_id) => relay_device_id,
		Err(next) => return next,
	};
	let instance_id = match hosted.instance_id.clone() {
		Some(instance_id) => instance_id,
		None => match registered(app, &bearer, hosted, replaced.as_deref()).await {
			Ok(_) if *stop.borrow() => return Next::Stopped,
			Ok(instance_id) => instance_id,
			Err(next) => return next,
		},
	};
	let url = cloud.host_relay_url(&instance_id, &relay_device_id);
	let opened = until_stopped(stop, opened_unpaused(cloud, url, &bearer)).await;
	match opened {
		None => Next::Stopped,
		Some(Opened::Socket(socket)) => {
			*replaced = None;
			backoff.socket_opened();
			entered(app, &hosted.space_id, Some(&instance_id), HostingState::Online);
			let ids = Ids { space_id: &hosted.space_id, instance_id: &instance_id };
			let mut frames = LastFrames::default();
			let ended = tokio::select! {
				ended = online(app, *socket, serving, stop, ids, relaying, &mut frames) => ended,
				never = members::polled(app, &hosted.space_id, &instance_id) => match never {},
			};
			match ended {
				Ended::Stopped => Next::Stopped,
				Ended::Replaced => failed(
					HostingFailureKind::TakenOverByAnotherHost,
					"another host took this instance over (relay close 4001)".to_owned(),
				),
				Ended::DeviceRevoked => {
					session::device_revoked(app, &bearer);
					Next::Settled(HostingState::NeedsSignIn)
				}
				Ended::Dropped(reason) => Next::Retry(dropped_reason(&reason, frames)),
				Ended::Failed(failure, detail) => failed(failure, detail),
			}
		}
		Some(Opened::Revoked) => {
			session::revoked(app, &bearer);
			Next::Settled(HostingState::NeedsSignIn)
		}
		Some(Opened::Forbidden) => failed(
			HostingFailureKind::NotOwner,
			"the account does not own this instance (relay answered 403)".to_owned(),
		),
		Some(Opened::Unknown | Opened::Gone(_)) if replaced.is_none() => {
			*replaced = hosted.instance_id.take();
			Next::Reregister
		}
		Some(Opened::Unknown) => failed(
			HostingFailureKind::InstanceUnknownAfterReregistration,
			"kiroshi-cloud knows no instance under the id it just registered (relay answered 404)"
				.to_owned(),
		),
		Some(Opened::Gone(_)) => failed(
			HostingFailureKind::InstanceGoneAfterReregistration,
			"kiroshi-cloud answered the instance it just registered as gone (relay answered 410)"
				.to_owned(),
		),
		Some(Opened::RateLimited(retry_after)) => {
			Next::Retry(format!("the relay rate limited the host socket for {retry_after:?}"))
		}
		Some(Opened::Unreachable(reason)) => Next::Retry(reason),
	}
}

fn failed(failure: HostingFailureKind, detail: String) -> Next {
	Next::Settled(HostingState::Failed { failure, detail })
}

fn database_failed(detail: String) -> Next {
	failed(HostingFailureKind::DatabaseUnavailable, detail)
}

fn sealing_failed(detail: String) -> Ended {
	Ended::Failed(HostingFailureKind::SealingFailed, detail)
}

async fn relay_device<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	space_id: &str,
	keys: &HostKeys,
) -> Result<String, Next> {
	let cloud = &app.state::<Hosting>().cloud;
	let account_id = match cloud.me(bearer).await {
		Ok(account) => account.id,
		Err(MeError::Revoked) => {
			session::revoked(app, bearer);
			return Err(Next::Settled(HostingState::NeedsSignIn));
		}
		Err(MeError::Unreachable(reason)) => return Err(Next::Retry(reason)),
	};
	let state = app.state::<db::DatabaseState>();
	let database = ready(&state)
		.map_err(|failure| database_failed(format!("the database is unavailable: {failure:?}")))?;
	let relay_device_id = held_or_registered(app, bearer, database, &account_id, keys).await?;
	roster::host_rostered(database, space_id, &keys.device, &relay_device_id, &account_id)
		.await
		.map_err(|failure| {
			database_failed(format!("the host roster row was not stored: {failure:?}"))
		})?;
	Ok(relay_device_id)
}

async fn held_or_registered<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	database: &Database,
	account_id: &str,
	keys: &HostKeys,
) -> Result<String, Next> {
	let devices = database.relay_devices();
	let device_id = keys.device.device_id().to_string();
	let held = devices.relay_device_id(account_id.to_owned(), device_id.clone()).await.map_err(
		|failure| database_failed(format!("the relay device id did not read: {failure:?}")),
	)?;
	if let Some(relay_device_id) = held {
		return Ok(relay_device_id);
	}
	let cloud = &app.state::<Hosting>().cloud;
	let registered = match cloud.register_device(bearer, account_id, &keys.device).await {
		Ok(registered) => registered,
		Err(DeviceRegisterError::Revoked) => {
			session::revoked(app, bearer);
			return Err(Next::Settled(HostingState::NeedsSignIn));
		}
		Err(DeviceRegisterError::Refused(refusal)) => {
			let detail = format!("the relay refused this device: {refusal}");
			return Err(failed(HostingFailureKind::DeviceRefused, detail));
		}
		Err(DeviceRegisterError::Unreachable(reason)) => return Err(Next::Retry(reason)),
	};
	log::info!(
		"the device registered with the relay as {} (transferred {})",
		registered.id,
		registered.transferred
	);
	devices.registered(account_id.to_owned(), device_id, registered.id.clone()).await.map_err(
		|failure| database_failed(format!("the relay device id was not stored: {failure:?}")),
	)?;
	Ok(registered.id)
}

async fn registered<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	hosted: &mut Hosted,
	replaced: Option<&str>,
) -> Result<String, Next> {
	let cloud = &app.state::<Hosting>().cloud;
	let instance_id = match cloud.register_instance(bearer, &hosted.name, hosted.colour).await {
		Ok(instance_id) => instance_id,
		Err(RegisterError::Revoked) => {
			session::revoked(app, bearer);
			return Err(Next::Settled(HostingState::NeedsSignIn));
		}
		Err(RegisterError::Unreachable(reason)) => return Err(Next::Retry(reason)),
	};
	let state = app.state::<db::DatabaseState>();
	let stored = match ready(&state) {
		Ok(database) => database
			.space_hosting()
			.registered(hosted.space_id.clone(), instance_id.clone())
			.await
			.map_err(SpaceError::from),
		Err(failure) => Err(failure),
	};
	if let Err(failure) = stored {
		let detail = format!("the registered instance {instance_id} was not stored: {failure:?}");
		return Err(database_failed(detail));
	}
	log::info!(
		"space {} registered instance {instance_id} in place of instance {}",
		hosted.space_id,
		replaced.unwrap_or("none")
	);
	hosted.instance_id = Some(instance_id.clone());
	Ok(instance_id)
}

pub(crate) async fn opened_unpaused(cloud: &Cloud, url: String, bearer: &str) -> Opened {
	cloud.unpaused().await;
	opened(cloud, url, bearer).await
}

pub(crate) async fn opened(cloud: &Cloud, url: String, bearer: &str) -> Opened {
	let mut request = match url.into_client_request() {
		Ok(request) => request,
		Err(error) => return Opened::Unreachable(format!("the relay url is unusable: {error}")),
	};
	let Ok(authorization) = HeaderValue::from_str(&format!("Bearer {bearer}")) else {
		return Opened::Revoked;
	};
	request.headers_mut().insert(header::AUTHORIZATION, authorization);
	let path = request.uri().path().to_owned();
	installed_tls_provider();
	match timeout(CONNECT_BOUND, connect_async(request)).await {
		Err(_) => Opened::Unreachable(format!("the relay did not answer within {CONNECT_BOUND:?}")),
		Ok(Ok((socket, _))) => Opened::Socket(Box::new(socket)),
		Ok(Err(SocketError::Http(response)))
			if response.status() == StatusCode::TOO_MANY_REQUESTS =>
		{
			let retry_after = retry_after(response.headers());
			cloud.rate_limited(&path, retry_after);
			Opened::RateLimited(retry_after)
		}
		Ok(Err(SocketError::Http(response))) => {
			refused(&path, response.status(), response.body().as_deref())
		}
		Ok(Err(error)) => Opened::Unreachable(format!("the relay could not be reached: {error}")),
	}
}

fn refused(path: &str, status: StatusCode, body: Option<&[u8]>) -> Opened {
	log::warn!(
		"the relay answered GET {path} with {status}: {:?}",
		body.map(String::from_utf8_lossy)
	);
	match status {
		StatusCode::UNAUTHORIZED => Opened::Revoked,
		StatusCode::FORBIDDEN => Opened::Forbidden,
		StatusCode::NOT_FOUND => Opened::Unknown,
		StatusCode::GONE => Opened::Gone(departure(body)),
		status => Opened::Unreachable(format!("the relay answered {status}")),
	}
}

fn departure(body: Option<&[u8]>) -> Option<Departure> {
	let read = body.and_then(|body| serde_json::from_slice::<GoneBody>(body).ok());
	if read.is_none() {
		log::warn!(
			"the relay answered {} with a body naming no known departure: {:?}",
			StatusCode::GONE,
			body.map(String::from_utf8_lossy)
		);
	}
	read.map(|gone| gone.error.code)
}

struct HostedSpace<'a> {
	database: &'a Database,
	keys: &'a HostKeys,
	space_id: &'a str,
	instance_id: &'a str,
}

#[derive(Clone, Copy)]
struct Ids<'a> {
	space_id: &'a str,
	instance_id: &'a str,
}

async fn online<R: Runtime>(
	app: &AppHandle<R>,
	socket: Socket,
	serving: Serving<'_>,
	stop: &mut watch::Receiver<bool>,
	ids: Ids<'_>,
	relaying: &mut Relaying<'_>,
	frames: &mut LastFrames,
) -> Ended {
	let state = app.state::<db::DatabaseState>();
	let database = match ready(&state) {
		Ok(database) => database,
		Err(failure) => {
			let detail = format!("the database is unavailable: {failure:?}");
			return Ended::Failed(HostingFailureKind::DatabaseUnavailable, detail);
		}
	};
	let mut wire = Wire::new(database, serving.keys, ids.space_id, ids.instance_id);
	let hosted = HostedSpace {
		database,
		keys: serving.keys,
		space_id: ids.space_id,
		instance_id: ids.instance_id,
	};
	let mut rotations = serving.keys.space.clone();
	rotations.borrow_and_update();
	if let Err(failure) = devices::settled_turn(app, ids.space_id).await {
		return Ended::Dropped(format!("the pending space key rotation failed: {failure:?}"));
	}
	let (sink, mut stream) = socket.split();
	let mut sink = MeasuredSink { sink, frames };
	let last_sent = &mut relaying.last_sent;
	let mut recorded = relaying.ring.subscribe();
	let unsent = recorded.borrow_and_update().rejoined(last_sent);
	if let Err(ended) = all_recorded_sent(&mut sink, &mut wire, unsent, last_sent).await {
		return ended;
	}
	let mut pings = interval_at(Instant::now() + PING_EVERY, PING_EVERY);
	let mut invokes = JoinSet::new();
	let mut avatars = JoinSet::new();
	let admission =
		|| admission::admitted(app.clone(), ids.space_id.to_owned(), ids.instance_id.to_owned());
	let mut admissions = JoinSet::new();
	admissions.spawn(admission());
	let avatar_turn = Arc::new(Mutex::new(()));
	let silence = sleep(SILENCE_BOUND);
	tokio::pin!(silence);
	loop {
		let mut held_turn = None;
		let outgoing = tokio::select! {
			_ = stop.changed() => return closed(&mut sink, ids).await,
			frame = stream.next() => {
				silence.as_mut().reset(Instant::now() + SILENCE_BOUND);
				if let Some(Ok(heard)) = &frame {
					sink.heard(heard);
				}
				let text = match frame {
					Some(Ok(Message::Text(text))) => text,
					unread => match unread_ended(unread, ids) {
						Some(ended) => return ended,
						None => continue,
					},
				};
				match relay_event_of(text.as_str()) {
					Some(RelayEvent::DeviceApproved) => {
						admissions.spawn(admission());
						continue;
					}
					Some(RelayEvent::DeviceRevoked { device_id, user_id }) => {
						if let Err(ended) = revocation_handled(app, ids.space_id, &device_id, &user_id).await {
							return ended;
						}
						continue;
					}
					None => {}
				}
				let opened = match wire.opened(text.as_str()).await {
					Ok(opened) => opened,
					Err(refusal) => {
						log::warn!("{}", wire::dropped_line(ids.space_id, &refusal));
						if let Err(ended) = stale_rekeyed(&mut sink, &hosted, &refusal).await {
							return ended;
						}
						continue;
					}
				};
				match received(&wire, opened, ids) {
					Received::Call(sender, call) => {
						let bridged = bridge::bridged(app.clone(), serving.local.clone(), ids.space_id.to_owned(), call);
						invokes.spawn(async move { (sender, bridged.await) });
						continue;
					}
					Received::Avatar(sender, call) => {
						let bridged = bridge::avatar_bridged(app.clone(), serving.local.clone(), ids.space_id.to_owned(), avatar_turn.clone(), call);
						avatars.spawn(async move { (sender, bridged.await) });
						continue;
					}
					Received::Answer(sender, answer) => Outgoing::Answer(sender, answer),
					Received::Hello(sender) => {
						if let Err(ended) = rekeys_sent(&mut sink, &hosted, |member| member.relay_device_id == sender.relay_device_id).await {
							return ended;
						}
						Outgoing::Hello(sender)
					}
					Received::Stale(sender) => Outgoing::Rechallenge(sender),
					Received::Resume(sender, call) => {
						let resumed = recorded.borrow().resumed(&call, last_sent.seq);
						if let Err(ended) = all_sent(&mut sink, &mut wire, &sender, resumed.frames).await {
							return ended;
						}
						Outgoing::Answer(sender, resumed.answer)
					}
				}
			}
			Some(answer) = invokes.join_next(), if !invokes.is_empty() => match answer {
				Ok((sender, answer)) => Outgoing::Answer(sender, answer),
				Err(failure) => {
					log::error!("a relayed invoke of space {} ended abnormally: {failure}", ids.space_id);
					continue;
				}
			},
			Some(admitted) = admissions.join_next(), if !admissions.is_empty() => {
				match admitted {
					Ok(Ok(admitted)) if !admitted.is_empty() => {
						if let Err(ended) = rekeys_sent(&mut sink, &hosted, |_| true).await {
							return ended;
						}
					}
					Ok(Ok(_)) => {}
					Ok(Err(failure)) => {
						log::warn!("the device list of space {} was not settled: {failure:?}", ids.space_id);
					}
					Err(failure) => {
						log::error!("an admission of space {} ended abnormally: {failure}", ids.space_id);
					}
				}
				continue;
			}
			Some(answer) = avatars.join_next(), if !avatars.is_empty() => match answer {
				Ok((sender, answer)) => {
					held_turn = Some(answer.turn);
					Outgoing::Answer(sender, answer.frame)
				}
				Err(failure) => {
					log::error!("a relayed avatar of space {} ended abnormally: {failure}", ids.space_id);
					continue;
				}
			},
			changed = recorded.changed() => {
				if changed.is_err() {
					return Ended::Dropped("the event recorder ended".to_owned());
				}
				let followed = recorded.borrow_and_update().followed(last_sent);
				let unsent = match followed {
					Ok(unsent) => unsent,
					Err(missed) => return fell_behind(&mut sink, missed).await,
				};
				if let Err(ended) = all_recorded_sent(&mut sink, &mut wire, unsent, last_sent).await {
					return ended;
				}
				continue;
			}
			Ok(()) = rotations.changed() => {
				rotations.borrow_and_update();
				if let Err(ended) = rekeys_sent(&mut sink, &hosted, |_| true).await {
					return ended;
				}
				continue;
			}
			_ = pings.tick() => Outgoing::Ping,
			_ = &mut silence => {
				return Ended::Dropped(format!("no frame or pong arrived for {SILENCE_BOUND:?}"));
			}
		};
		if let Err(ended) = delivered(&mut sink, &mut wire, outgoing).await {
			return ended;
		}
		drop(held_turn);
	}
}

enum Received {
	Call(Rostered, bridge::MemberCall),
	Avatar(Rostered, bridge::AvatarCall),
	Answer(Rostered, String),
	Resume(Rostered, replay::ResumeCall),
	Hello(Rostered),
	Stale(Rostered),
}

enum Outgoing {
	Answer(Rostered, String),
	Hello(Rostered),
	Rechallenge(Rostered),
	Ping,
}

fn received(wire: &Wire<'_>, opened: OpenedFrame, ids: Ids<'_>) -> Received {
	if opened.is_hello() {
		return Received::Hello(opened.sender);
	}
	if !wire.is_current(&opened) {
		return Received::Stale(opened.sender);
	}
	let OpenedFrame { sender, plaintext, .. } = opened;
	let text = plaintext.as_str();
	if let Some(answer) = bridge::shared_space_answer(text, ids.space_id) {
		return Received::Answer(sender, answer);
	}
	match replay::resume_call(text) {
		Some(Ok(call)) => return Received::Resume(sender, call),
		Some(Err(refusal)) => return Received::Answer(sender, refusal),
		None => {}
	}
	match bridge::avatar_call(text) {
		Some(Ok(call)) => return Received::Avatar(sender, call),
		Some(Err(refusal)) => return Received::Answer(sender, refusal),
		None => {}
	}
	match bridge::member_call(text, &sender.account_id) {
		Ok(call) => Received::Call(sender, call),
		Err(refusal) => Received::Answer(sender, refusal),
	}
}

fn unread_ended(frame: Option<Result<Message, SocketError>>, ids: Ids<'_>) -> Option<Ended> {
	match frame {
		Some(Ok(Message::Close(frame))) => Some(closed_by_relay(frame, ids)),
		Some(Ok(Message::Binary(_))) => {
			let refusal = Refusal { from: None, cause: wire::Dropped::NotV2 };
			log::warn!("{}", wire::dropped_line(ids.space_id, &refusal));
			None
		}
		Some(Ok(_)) => None,
		Some(Err(error)) => Some(Ended::Dropped(format!("the relay socket failed: {error}"))),
		None => Some(Ended::Dropped("the relay socket ended".to_owned())),
	}
}

fn closed_by_relay(frame: Option<CloseFrame>, ids: Ids<'_>) -> Ended {
	let code = frame.as_ref().map(|frame| u16::from(frame.code));
	log::info!(
		"the relay closed space {} (instance {}) with code {}",
		ids.space_id,
		ids.instance_id,
		code.map_or_else(|| "none".to_owned(), |code| code.to_string())
	);
	match code {
		Some(HOST_REPLACED) => Ended::Replaced,
		Some(DEVICE_REVOKED) => Ended::DeviceRevoked,
		Some(SERVER_RESTARTING) => {
			Ended::Dropped(format!("the relay is restarting (code {SERVER_RESTARTING})"))
		}
		_ => Ended::Dropped(format!("the relay closed the socket with code {code:?}")),
	}
}

async fn closed(sink: &mut MeasuredSink<'_>, ids: Ids<'_>) -> Ended {
	let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
	match sink.sent(Message::Close(Some(close))).await {
		Ok(()) => log::info!(
			"space {} (instance {}) closed its relay with code 1000",
			ids.space_id,
			ids.instance_id
		),
		Err(reason) => log::warn!(
			"space {} (instance {}) left its relay without the 1000 close frame: {reason}",
			ids.space_id,
			ids.instance_id
		),
	}
	Ended::Stopped
}

#[derive(Deserialize)]
#[serde(tag = "event")]
enum RelayEvent {
	#[serde(rename = "device.revoked", rename_all = "camelCase")]
	DeviceRevoked { device_id: String, user_id: String },
	#[serde(rename = "device.approved")]
	DeviceApproved,
}

fn relay_event_of(text: &str) -> Option<RelayEvent> {
	let envelope: Value = serde_json::from_str(text).ok()?;
	if envelope.get("from").is_some() {
		return None;
	}
	serde_json::from_value(envelope).ok()
}

async fn revocation_handled<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	device_id: &str,
	user_id: &str,
) -> Result<(), Ended> {
	match devices::device_left(app, space_id, device_id, user_id).await {
		Ok(Revocation::Applied) => Ok(()),
		Ok(Revocation::Ignored(reason)) => {
			log::warn!("device.revoked changed nothing in space {space_id}: {reason}");
			Ok(())
		}
		Err(failure) => Err(Ended::Dropped(format!(
			"device.revoked in space {space_id} was not settled: {failure:?}"
		))),
	}
}

async fn stale_rekeyed(
	sink: &mut MeasuredSink<'_>,
	hosted: &HostedSpace<'_>,
	refusal: &Refusal,
) -> Result<(), Ended> {
	match (&refusal.cause, refusal.from.as_deref()) {
		(Dropped::StaleKey(_), Some(from)) => {
			rekeys_sent(sink, hosted, |member| member.relay_device_id == from).await
		}
		_ => Ok(()),
	}
}

async fn rekeys_sent(
	sink: &mut MeasuredSink<'_>,
	hosted: &HostedSpace<'_>,
	is_recipient: impl Fn(&Rostered) -> bool,
) -> Result<(), Ended> {
	let space_id = hosted.space_id;
	let handover = match handover::current(hosted.database, hosted.keys, space_id).await {
		Ok(handover) => handover,
		Err(reason) => {
			log::warn!("hosted space {space_id} sent no rekey: {reason}");
			return Ok(());
		}
	};
	let recipients = handover.members(hosted.keys).filter(|member| is_recipient(member));
	for member in recipients {
		match handover.rekey_frame(hosted.keys, hosted.instance_id, member) {
			Ok(frame) => sink.sent(Message::text(frame)).await.map_err(Ended::Dropped)?,
			Err(reason) => log::warn!("hosted space {space_id} sent no rekey: {reason}"),
		}
	}
	Ok(())
}

async fn fell_behind(sink: &mut MeasuredSink<'_>, missed: u64) -> Ended {
	let close = CloseFrame { code: CloseCode::Again, reason: FELL_BEHIND.into() };
	let reason = match sink.sent(Message::Close(Some(close))).await {
		Ok(()) => format!("it fell {missed} events behind and closed with code 1013"),
		Err(reason) => format!(
			"it fell {missed} events behind and the 1013 close frame was not delivered: {reason}"
		),
	};
	Ended::Dropped(reason)
}

async fn delivered(
	sink: &mut MeasuredSink<'_>,
	wire: &mut Wire<'_>,
	outgoing: Outgoing,
) -> Result<(), Ended> {
	let message = match outgoing {
		Outgoing::Ping => Message::Ping(Vec::new().into()),
		Outgoing::Answer(to, answer) => {
			Message::text(wire.sealed(&answer, Some(&to)).await.map_err(sealing_failed)?)
		}
		Outgoing::Hello(to) => Message::text(wire.hello(&to).await.map_err(sealing_failed)?),
		Outgoing::Rechallenge(to) => {
			Message::text(wire.rechallenged(&to).await.map_err(sealing_failed)?)
		}
	};
	sink.sent(message).await.map_err(Ended::Dropped)
}

async fn sealed_sent(
	sink: &mut MeasuredSink<'_>,
	wire: &mut Wire<'_>,
	plaintext: &str,
	to: Option<&Rostered>,
) -> Result<(), Ended> {
	let sealed = wire.sealed(plaintext, to).await.map_err(sealing_failed)?;
	sink.sent(Message::text(sealed)).await.map_err(Ended::Dropped)
}

async fn all_sent(
	sink: &mut MeasuredSink<'_>,
	wire: &mut Wire<'_>,
	to: &Rostered,
	frames: Vec<String>,
) -> Result<(), Ended> {
	for frame in frames {
		sealed_sent(sink, wire, &frame, Some(to)).await?;
	}
	Ok(())
}

async fn all_recorded_sent(
	sink: &mut MeasuredSink<'_>,
	wire: &mut Wire<'_>,
	unsent: Vec<Stamped>,
	last_sent: &mut LastSent,
) -> Result<(), Ended> {
	for stamped in unsent {
		sealed_sent(sink, wire, &stamped.frame, None).await?;
		last_sent.seq = stamped.seq;
	}
	Ok(())
}

pub(crate) async fn sent(sink: &mut Sink, message: Message) -> Result<(), String> {
	match timeout(SEND_PATIENCE, sink.send(message)).await {
		Ok(Ok(())) => Ok(()),
		Ok(Err(error)) => Err(format!("the relay socket refused a frame: {error}")),
		Err(_) => Err(format!("the relay socket stalled on a frame for {SEND_PATIENCE:?}")),
	}
}

pub(crate) async fn until_stopped<F: Future>(
	stop: &mut watch::Receiver<bool>,
	work: F,
) -> Option<F::Output> {
	if *stop.borrow() {
		return None;
	}
	tokio::select! {
		_ = stop.changed() => None,
		done = work => Some(done),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_dropped_line_carries_the_reason_and_the_size_of_the_last_frames_both_ways() {
		let measured = LastFrames { received: Some(10_485_760), sent: Some(412) };

		assert_eq!(
			dropped_reason("the relay socket ended", measured),
			"the relay socket ended (last frame received: 10485760 bytes, last frame sent: 412 bytes)"
		);
		assert_eq!(
			dropped_reason("the relay socket ended", LastFrames::default()),
			"the relay socket ended (last frame received: none, last frame sent: none)"
		);
	}

	#[test]
	fn only_a_frame_that_carries_data_is_weighed() {
		assert!(carries_data(&Message::text("{}")));
		assert!(carries_data(&Message::binary(vec![1u8])));
		assert!(!carries_data(&Message::Ping(Vec::new().into())));
		assert!(!carries_data(&Message::Close(None)));
	}

	fn is_drawn_within(waited: Duration, step_secs: u64) -> bool {
		let step = Duration::from_secs(step_secs);
		waited >= step && waited <= step + step / 2
	}

	#[test]
	fn every_wait_adds_up_to_half_of_a_doubled_step_capped_at_a_minute() {
		let mut backoff = Backoff::first();

		let waits: Vec<Duration> = (0..8).map(|_| backoff.step()).collect();

		let steps = [1, 2, 4, 8, 16, 32, 60, 60];
		assert!(
			waits.iter().zip(steps).all(|(waited, step)| is_drawn_within(*waited, step)),
			"{waits:?}"
		);
	}

	#[test]
	fn the_steps_are_drawn_rather_than_fixed() {
		let mut drawn = std::collections::HashSet::new();
		for _ in 0..20 {
			drawn.insert(Backoff::first().step());
		}

		assert!(drawn.len() > 1, "{drawn:?}");
	}

	#[tokio::test(start_paused = true)]
	async fn a_socket_closed_within_thirty_seconds_of_its_opening_keeps_doubling_the_step() {
		let mut backoff = Backoff::first();
		let first = [backoff.step(), backoff.step(), backoff.step()];

		backoff.socket_opened();
		tokio::time::advance(STEADY_OPEN - Duration::from_secs(1)).await;
		let after_a_short_socket = backoff.step();

		assert!(first.iter().zip([1, 2, 4]).all(|(waited, full)| is_drawn_within(*waited, full)));
		assert!(is_drawn_within(after_a_short_socket, 8), "{after_a_short_socket:?}");
	}

	#[tokio::test(start_paused = true)]
	async fn a_socket_open_thirty_seconds_resets_the_step_to_one_second() {
		let mut backoff = Backoff::first();
		for _ in 0..5 {
			backoff.step();
		}

		backoff.socket_opened();
		tokio::time::advance(STEADY_OPEN).await;
		let after_a_steady_socket = backoff.step();

		assert!(is_drawn_within(after_a_steady_socket, 1), "{after_a_steady_socket:?}");
	}
}
