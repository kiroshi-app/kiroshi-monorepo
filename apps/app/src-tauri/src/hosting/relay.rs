use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use reqwest::StatusCode;
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
use super::contract::HostingState;
use super::replay::{self, LastSent, Relaying, Ring, Stamped};
use super::roster::{self, Rostered};
use super::wire::{self, HostKeys, Opened as OpenedFrame, Refusal, Wire};
use super::{entered, members, Hosting};
use crate::account::cloud::{DeviceRegisterError, MeError, RegisterError};
use crate::account::session::{self, AccountSession};
use crate::db::{self, Database};
use crate::host_api::events::{FELL_BEHIND, SEND_PATIENCE};
use crate::missions::github::installed_tls_provider;
use crate::spaces::commands::ready;
use crate::spaces::contract::SpaceError;

pub(crate) const PING_EVERY: Duration = Duration::from_secs(30);

pub(crate) const SILENCE_BOUND: Duration = Duration::from_secs(90);

const FIRST_BACKOFF: Duration = Duration::from_secs(1);

const BACKOFF_CAP: Duration = Duration::from_secs(60);

const CONNECT_BOUND: Duration = Duration::from_secs(20);

const HOST_REPLACED: u16 = 4001;

const SERVER_RESTARTING: u16 = 4005;

const DEVICE_REVOKED: u16 = 4006;

pub(crate) type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(crate) type Sink = SplitSink<Socket, Message>;

pub(super) struct Hosted {
	pub(super) space_id: String,
	pub(super) name: String,
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
	Unreachable(String),
}

enum Ended {
	Stopped,
	Replaced,
	DeviceRevoked,
	Dropped(String),
	Failed(String),
}

enum Next {
	Reregister,
	Retry(String),
	Settled(HostingState),
	Stopped,
}

pub(crate) struct Backoff(Duration);

impl Backoff {
	pub(crate) fn first() -> Self {
		Self(FIRST_BACKOFF)
	}

	pub(crate) fn reset(&mut self) {
		self.0 = FIRST_BACKOFF;
	}

	pub(crate) fn step(&mut self) -> Duration {
		let waited = self.0;
		self.0 = (waited * 2).min(BACKOFF_CAP);
		waited
	}
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
		Err(reason) => {
			let instance_id = hosted.instance_id.as_deref();
			return entered(&app, &space_id, instance_id, HostingState::Failed { reason });
		}
	};
	let serving = Serving { local: &local, keys: &keys };
	tokio::select! {
		() = attempts(&app, &mut hosted, serving, &mut stop, &ring) => return,
		() = replay::recorded(&app, &space_id, &ring) => {}
	}
	let reason = "the local event stream closed".to_owned();
	entered(&app, &space_id, hosted.instance_id.as_deref(), HostingState::Failed { reason });
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
				eprintln!(
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
			return Next::Settled(HostingState::Failed {
				reason: format!("the account session store failed: {error:?}"),
			})
		}
	};
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
	let url = app.state::<Hosting>().cloud.host_relay_url(&instance_id, &relay_device_id);
	let opened = until_stopped(stop, opened(url, &bearer)).await;
	match opened {
		None => Next::Stopped,
		Some(Opened::Socket(socket)) => {
			*replaced = None;
			backoff.reset();
			entered(app, &hosted.space_id, Some(&instance_id), HostingState::Online);
			let ids = Ids { space_id: &hosted.space_id, instance_id: &instance_id };
			let ended = tokio::select! {
				ended = online(app, *socket, serving, stop, ids, relaying) => ended,
				never = members::polled(app, &hosted.space_id, &instance_id) => match never {},
			};
			match ended {
				Ended::Stopped => Next::Stopped,
				Ended::Replaced => Next::Settled(HostingState::Failed {
					reason: "another host took this instance over (relay close 4001)".to_owned(),
				}),
				Ended::DeviceRevoked => {
					session::device_revoked(app, &bearer);
					Next::Settled(HostingState::NeedsSignIn)
				}
				Ended::Dropped(reason) => Next::Retry(reason),
				Ended::Failed(reason) => failed(reason),
			}
		}
		Some(Opened::Revoked) => {
			session::revoked(app, &bearer);
			Next::Settled(HostingState::NeedsSignIn)
		}
		Some(Opened::Forbidden) => Next::Settled(HostingState::Failed {
			reason: "the account does not own this instance (relay answered 403)".to_owned(),
		}),
		Some(Opened::Unknown) if replaced.is_none() => {
			*replaced = hosted.instance_id.take();
			Next::Reregister
		}
		Some(Opened::Unknown) => Next::Settled(HostingState::Failed {
			reason: "kiroshi-cloud knows no instance under the id it just registered (relay answered 404)"
				.to_owned(),
		}),
		Some(Opened::Unreachable(reason)) => Next::Retry(reason),
	}
}

fn failed(reason: String) -> Next {
	Next::Settled(HostingState::Failed { reason })
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
		.map_err(|failure| failed(format!("the database is unavailable: {failure:?}")))?;
	let relay_device_id = held_or_registered(app, bearer, database, &account_id, keys).await?;
	roster::host_rostered(database, space_id, &keys.device, &relay_device_id, &account_id)
		.await
		.map_err(|failure| failed(format!("the host roster row was not stored: {failure:?}")))?;
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
	let held = devices
		.relay_device_id(account_id.to_owned(), device_id.clone())
		.await
		.map_err(|failure| failed(format!("the relay device id did not read: {failure:?}")))?;
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
			return Err(failed(format!("the relay refused this device: {refusal}")))
		}
		Err(DeviceRegisterError::Unreachable(reason)) => return Err(Next::Retry(reason)),
	};
	eprintln!(
		"the device registered with the relay as {} (transferred {})",
		registered.id, registered.transferred
	);
	devices
		.registered(account_id.to_owned(), device_id, registered.id.clone())
		.await
		.map_err(|failure| failed(format!("the relay device id was not stored: {failure:?}")))?;
	Ok(registered.id)
}

async fn registered<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	hosted: &mut Hosted,
	replaced: Option<&str>,
) -> Result<String, Next> {
	let cloud = &app.state::<Hosting>().cloud;
	let instance_id = match cloud.register_instance(bearer, &hosted.name).await {
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
		return Err(Next::Settled(HostingState::Failed {
			reason: format!("the registered instance {instance_id} was not stored: {failure:?}"),
		}));
	}
	eprintln!(
		"space {} registered instance {instance_id} in place of instance {}",
		hosted.space_id,
		replaced.unwrap_or("none")
	);
	hosted.instance_id = Some(instance_id.clone());
	Ok(instance_id)
}

pub(crate) async fn opened(url: String, bearer: &str) -> Opened {
	let mut request = match url.into_client_request() {
		Ok(request) => request,
		Err(error) => return Opened::Unreachable(format!("the relay url is unusable: {error}")),
	};
	let Ok(authorization) = HeaderValue::from_str(&format!("Bearer {bearer}")) else {
		return Opened::Revoked;
	};
	request.headers_mut().insert(header::AUTHORIZATION, authorization);
	installed_tls_provider();
	match timeout(CONNECT_BOUND, connect_async(request)).await {
		Err(_) => Opened::Unreachable(format!("the relay did not answer within {CONNECT_BOUND:?}")),
		Ok(Ok((socket, _))) => Opened::Socket(Box::new(socket)),
		Ok(Err(SocketError::Http(response))) => match response.status() {
			StatusCode::UNAUTHORIZED => Opened::Revoked,
			StatusCode::FORBIDDEN => Opened::Forbidden,
			StatusCode::NOT_FOUND => Opened::Unknown,
			status => Opened::Unreachable(format!("the relay answered {status}")),
		},
		Ok(Err(error)) => Opened::Unreachable(format!("the relay could not be reached: {error}")),
	}
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
) -> Ended {
	let state = app.state::<db::DatabaseState>();
	let database = match ready(&state) {
		Ok(database) => database,
		Err(failure) => return Ended::Failed(format!("the database is unavailable: {failure:?}")),
	};
	let mut wire = Wire::new(database, serving.keys, ids.space_id, ids.instance_id);
	let (mut sink, mut stream) = socket.split();
	let last_sent = &mut relaying.last_sent;
	let mut recorded = relaying.ring.subscribe();
	let unsent = recorded.borrow_and_update().rejoined(last_sent);
	if let Err(ended) = all_recorded_sent(&mut sink, &mut wire, unsent, last_sent).await {
		return ended;
	}
	let mut pings = interval_at(Instant::now() + PING_EVERY, PING_EVERY);
	let mut invokes = JoinSet::new();
	let mut avatars = JoinSet::new();
	let avatar_turn = Arc::new(Mutex::new(()));
	let silence = sleep(SILENCE_BOUND);
	tokio::pin!(silence);
	loop {
		let mut held_turn = None;
		let outgoing = tokio::select! {
			_ = stop.changed() => return closed(&mut sink, ids).await,
			frame = stream.next() => {
				silence.as_mut().reset(Instant::now() + SILENCE_BOUND);
				let text = match frame {
					Some(Ok(Message::Text(text))) => text,
					unread => match unread_ended(unread, ids) {
						Some(ended) => return ended,
						None => continue,
					},
				};
				let opened = match wire.opened(text.as_str()).await {
					Ok(opened) => opened,
					Err(refusal) => {
						eprintln!("{}", wire::dropped_line(ids.space_id, &refusal));
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
					Received::Hello(sender) => Outgoing::Hello(sender),
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
					eprintln!("a relayed invoke of space {} ended abnormally: {failure}", ids.space_id);
					continue;
				}
			},
			Some(answer) = avatars.join_next(), if !avatars.is_empty() => match answer {
				Ok((sender, answer)) => {
					held_turn = Some(answer.turn);
					Outgoing::Answer(sender, answer.frame)
				}
				Err(failure) => {
					eprintln!("a relayed avatar of space {} ended abnormally: {failure}", ids.space_id);
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
			eprintln!("{}", wire::dropped_line(ids.space_id, &refusal));
			None
		}
		Some(Ok(_)) => None,
		Some(Err(error)) => Some(Ended::Dropped(format!("the relay socket failed: {error}"))),
		None => Some(Ended::Dropped("the relay socket ended".to_owned())),
	}
}

fn closed_by_relay(frame: Option<CloseFrame>, ids: Ids<'_>) -> Ended {
	let code = frame.as_ref().map(|frame| u16::from(frame.code));
	eprintln!(
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

async fn closed(sink: &mut Sink, ids: Ids<'_>) -> Ended {
	let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
	match sent(sink, Message::Close(Some(close))).await {
		Ok(()) => eprintln!(
			"space {} (instance {}) closed its relay with code 1000",
			ids.space_id, ids.instance_id
		),
		Err(reason) => eprintln!(
			"space {} (instance {}) left its relay without the 1000 close frame: {reason}",
			ids.space_id, ids.instance_id
		),
	}
	Ended::Stopped
}

async fn fell_behind(sink: &mut Sink, missed: u64) -> Ended {
	let close = CloseFrame { code: CloseCode::Again, reason: FELL_BEHIND.into() };
	let reason = match sent(sink, Message::Close(Some(close))).await {
		Ok(()) => format!("it fell {missed} events behind and closed with code 1013"),
		Err(reason) => format!(
			"it fell {missed} events behind and the 1013 close frame was not delivered: {reason}"
		),
	};
	Ended::Dropped(reason)
}

async fn delivered(sink: &mut Sink, wire: &mut Wire<'_>, outgoing: Outgoing) -> Result<(), Ended> {
	let message = match outgoing {
		Outgoing::Ping => Message::Ping(Vec::new().into()),
		Outgoing::Answer(to, answer) => {
			Message::text(wire.sealed(&answer, Some(&to)).await.map_err(Ended::Failed)?)
		}
		Outgoing::Hello(to) => Message::text(wire.hello(&to).await.map_err(Ended::Failed)?),
		Outgoing::Rechallenge(to) => {
			Message::text(wire.rechallenged(&to).await.map_err(Ended::Failed)?)
		}
	};
	sent(sink, message).await.map_err(Ended::Dropped)
}

async fn sealed_sent(
	sink: &mut Sink,
	wire: &mut Wire<'_>,
	plaintext: &str,
	to: Option<&Rostered>,
) -> Result<(), Ended> {
	let sealed = wire.sealed(plaintext, to).await.map_err(Ended::Failed)?;
	sent(sink, Message::text(sealed)).await.map_err(Ended::Dropped)
}

async fn all_sent(
	sink: &mut Sink,
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
	sink: &mut Sink,
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
	fn the_backoff_doubles_from_one_second_to_a_minute_and_resets() {
		let mut backoff = Backoff(FIRST_BACKOFF);

		let waits: Vec<u64> = (0..8).map(|_| backoff.step().as_secs()).collect();
		backoff.reset();

		assert_eq!(waits, vec![1, 2, 4, 8, 16, 32, 60, 60]);
		assert_eq!(backoff.step(), FIRST_BACKOFF);
	}
}
