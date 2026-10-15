use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use reqwest::StatusCode;
use tauri::http::{header, HeaderValue};
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpStream;
use tokio::sync::broadcast::error::RecvError;
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
use super::reach;
use super::{entered, members, Hosting};
use crate::account::cloud::RegisterError;
use crate::account::session::{self, AccountSession};
use crate::agent::commands::subscribed_with_pending_questions;
use crate::db;
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

pub(crate) type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(crate) type Sink = SplitSink<Socket, Message>;

pub(super) struct Hosted {
	pub(super) space_id: String,
	pub(super) name: String,
	pub(super) instance_id: Option<String>,
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
	Dropped(String),
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
	let mut backoff = Backoff::first();
	let mut replaced = None;
	loop {
		let next =
			attempted(&app, &mut hosted, &local, &mut stop, &mut backoff, &mut replaced).await;
		let instance_id = hosted.instance_id.as_deref();
		match next {
			Next::Stopped => return,
			Next::Reregister => continue,
			Next::Settled(state) => return entered(&app, &hosted.space_id, instance_id, state),
			Next::Retry(reason) => {
				eprintln!(
					"hosting of space {} (instance {}) lost its relay: {reason}",
					hosted.space_id,
					instance_id.unwrap_or("none")
				);
				entered(&app, &hosted.space_id, instance_id, HostingState::Connecting);
				if until_stopped(&mut stop, sleep(backoff.step())).await.is_none() {
					return;
				}
			}
		}
	}
}

async fn attempted<R: Runtime>(
	app: &AppHandle<R>,
	hosted: &mut Hosted,
	local: &LocalApi,
	stop: &mut watch::Receiver<bool>,
	backoff: &mut Backoff,
	replaced: &mut Option<String>,
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
	let instance_id = match hosted.instance_id.clone() {
		Some(instance_id) => instance_id,
		None => match registered(app, &bearer, hosted, replaced.as_deref()).await {
			Ok(_) if *stop.borrow() => return Next::Stopped,
			Ok(instance_id) => instance_id,
			Err(next) => return next,
		},
	};
	let url = app.state::<Hosting>().cloud.host_relay_url(&instance_id);
	let opened = until_stopped(stop, opened(url, &bearer)).await;
	match opened {
		None => Next::Stopped,
		Some(Opened::Socket(socket)) => {
			*replaced = None;
			backoff.reset();
			entered(app, &hosted.space_id, Some(&instance_id), HostingState::Online);
			let ids = Ids { space_id: &hosted.space_id, instance_id: &instance_id };
			let ended = tokio::select! {
				ended = online(app, *socket, local, stop, ids) => ended,
				never = members::polled(app, &hosted.space_id, &instance_id) => match never {},
			};
			match ended {
				Ended::Stopped => Next::Stopped,
				Ended::Replaced => Next::Settled(HostingState::Failed {
					reason: "another host took this instance over (relay close 4001)".to_owned(),
				}),
				Ended::Dropped(reason) => Next::Retry(reason),
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
	local: &LocalApi,
	stop: &mut watch::Receiver<bool>,
	ids: Ids<'_>,
) -> Ended {
	let (mut sink, mut stream) = socket.split();
	let (pending, mut heard) = subscribed_with_pending_questions(app);
	let mut guest_events = reach::GuestEvents::new(ids.space_id);
	for frame in pending {
		if !guest_events.reach_the_guest(app, &frame).await {
			continue;
		}
		if let Err(reason) = sent(&mut sink, Message::text(bridge::forwarded(&frame))).await {
			return Ended::Dropped(reason);
		}
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
				match received(frame, ids) {
					Received::Call(call) => {
						invokes.spawn(bridge::bridged(app.clone(), local.clone(), ids.space_id.to_owned(), call));
						continue;
					}
					Received::Avatar(call) => {
						avatars.spawn(bridge::avatar_bridged(app.clone(), local.clone(), ids.space_id.to_owned(), avatar_turn.clone(), call));
						continue;
					}
					Received::Answer(answer) => Message::text(answer),
					Received::Nothing => continue,
					Received::Ended(ended) => return ended,
				}
			}
			Some(answer) = invokes.join_next(), if !invokes.is_empty() => match answer {
				Ok(answer) => Message::text(answer),
				Err(failure) => {
					eprintln!("a relayed invoke of space {} ended abnormally: {failure}", ids.space_id);
					continue;
				}
			},
			Some(answer) = avatars.join_next(), if !avatars.is_empty() => match answer {
				Ok(answer) => {
					held_turn = Some(answer.turn);
					Message::text(answer.frame)
				}
				Err(failure) => {
					eprintln!("a relayed avatar of space {} ended abnormally: {failure}", ids.space_id);
					continue;
				}
			},
			frame = heard.recv() => match frame {
				Ok(frame) => {
					if !guest_events.reach_the_guest(app, &frame).await {
						continue;
					}
					Message::text(bridge::forwarded(&frame))
				}
				Err(RecvError::Lagged(missed)) => return fell_behind(&mut sink, missed).await,
				Err(RecvError::Closed) => return Ended::Dropped("the local event stream closed".to_owned()),
			},
			_ = pings.tick() => Message::Ping(Vec::new().into()),
			_ = &mut silence => {
				return Ended::Dropped(format!("no frame or pong arrived for {SILENCE_BOUND:?}"));
			}
		};
		if let Err(reason) = sent(&mut sink, outgoing).await {
			return Ended::Dropped(reason);
		}
		drop(held_turn);
	}
}

enum Received {
	Call(bridge::MemberCall),
	Avatar(bridge::AvatarCall),
	Answer(String),
	Nothing,
	Ended(Ended),
}

fn received(frame: Option<Result<Message, SocketError>>, ids: Ids<'_>) -> Received {
	match frame {
		Some(Ok(Message::Text(text))) => {
			if let Some(answer) = bridge::shared_space_answer(text.as_str(), ids.space_id) {
				return Received::Answer(answer);
			}
			match bridge::avatar_call(text.as_str()) {
				Some(Ok(call)) => return Received::Avatar(call),
				Some(Err(refusal)) => return Received::Answer(refusal),
				None => {}
			}
			match bridge::member_call(text.as_str()) {
				Ok(call) => Received::Call(call),
				Err(refusal) => Received::Answer(refusal),
			}
		}
		Some(Ok(Message::Binary(_))) => Received::Answer(bridge::refused(None)),
		Some(Ok(Message::Close(frame))) => Received::Ended(closed_by_relay(frame, ids)),
		Some(Ok(_)) => Received::Nothing,
		Some(Err(error)) => {
			Received::Ended(Ended::Dropped(format!("the relay socket failed: {error}")))
		}
		None => Received::Ended(Ended::Dropped("the relay socket ended".to_owned())),
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
