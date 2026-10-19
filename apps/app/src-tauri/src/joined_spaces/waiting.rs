use futures_util::StreamExt;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch;
use tokio::time::{interval_at, sleep, Instant};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

use super::commands::{announce_change, ready};
use super::contract::{JoinedSpaceError, JoinedSpaceState};
use super::held::{self, device_keys};
use super::join::{
	bearer_of, kept_answer, member_socket_of, missed_rekey_frame, rekey_handed, revoked,
};
use super::members;
use super::relay::{self, RelayGuests};
use crate::crypto::device_keys::DeviceKeys;
use crate::db;
use crate::db::repositories::joined_spaces::JoinedReach;
use crate::devices;
use crate::hosting::relay::{
	opened, sent, until_stopped, Backoff, Departure, Opened, Socket, SILENCE_BOUND,
};

pub(super) struct WaitingJoin {
	stop: watch::Sender<bool>,
	run: JoinHandle<()>,
}

impl WaitingJoin {
	pub(super) async fn finished(self, id: &str) {
		self.stop.send_replace(true);
		if let Err(error) = self.run.await {
			eprintln!("the waiting join of joined space {id} ended abnormally: {error}");
		}
	}
}

enum Attempt {
	Joined,
	Departed(Departure),
	Ended(String),
	Dropped(String),
}

pub(super) async fn joins_started<R: Runtime>(
	app: &AppHandle<R>,
	guests: &RelayGuests,
) -> Result<(), JoinedSpaceError> {
	match bearer_of(app) {
		Ok(_) => {}
		Err(JoinedSpaceError::NeedsSignIn) => return Ok(()),
		Err(failure) => return Err(failure),
	}
	let state = app.state::<db::DatabaseState>();
	for joined in ready(&state)?.joined_spaces().list().await? {
		let JoinedReach::Relay { instance_id } = joined.reach;
		if held::state_or_waiting(app, &joined.id, &instance_id) == JoinedSpaceState::Online {
			continue;
		}
		let mut waiting = guests.waiting();
		if waiting.contains_key(&joined.id) {
			continue;
		}
		let (stop, stopped) = watch::channel(false);
		let run = tauri::async_runtime::spawn(waited(
			app.clone(),
			joined.id.clone(),
			instance_id,
			stopped,
		));
		waiting.insert(joined.id, WaitingJoin { stop, run });
	}
	Ok(())
}

async fn waited<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	instance_id: String,
	mut stop: watch::Receiver<bool>,
) {
	let mut backoff = Backoff::first();
	loop {
		match until_stopped(&mut stop, attempted(&app, &instance_id, &mut backoff)).await {
			None => return,
			Some(Attempt::Joined) => {
				left(&app, &id, &stop);
				return joined_announced(&app, &id).await;
			}
			Some(Attempt::Departed(departure)) => {
				left(&app, &id, &stop);
				let reason = relay::reason_of(departure);
				if let Err(failure) = relay::entry_evicted(&app, &id, reason).await {
					eprintln!(
						"joined space {id} whose membership ended was not evicted: {failure:?}"
					);
				}
				return;
			}
			Some(Attempt::Ended(reason)) => {
				left(&app, &id, &stop);
				return eprintln!("joined space {id} stopped waiting for its host: {reason}");
			}
			Some(Attempt::Dropped(reason)) => {
				eprintln!("joined space {id} lost the socket it waits for its host on: {reason}")
			}
		}
		if until_stopped(&mut stop, sleep(backoff.step())).await.is_none() {
			return;
		}
	}
}

async fn attempted<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	backoff: &mut Backoff,
) -> Attempt {
	let bearer = match bearer_of(app) {
		Ok(bearer) => bearer,
		Err(JoinedSpaceError::NeedsSignIn) => {
			return Attempt::Ended("no account is signed in".to_owned())
		}
		Err(failure) => return Attempt::Dropped(format!("{failure:?}")),
	};
	if devices::is_awaiting_approval(app) {
		return Attempt::Dropped(
			"this device awaits its approval by another device of the account".to_owned(),
		);
	}
	let device = match device_keys(app) {
		Ok(device) => device,
		Err(failure) => return Attempt::Dropped(format!("{failure:?}")),
	};
	let url = match member_socket_of(app, &bearer, &device, instance_id).await {
		Ok(url) => url,
		Err(JoinedSpaceError::SessionRevoked) => {
			return Attempt::Ended("the cloud refused the account (401)".to_owned())
		}
		Err(failure) => return Attempt::Dropped(format!("{failure:?}")),
	};
	match opened(url, &bearer).await {
		Opened::Socket(socket) => {
			backoff.reset();
			listened(app, *socket, instance_id, &device).await
		}
		Opened::Revoked => {
			revoked(app, &bearer);
			Attempt::Ended("the relay refused the account (401)".to_owned())
		}
		Opened::Gone(Some(departure)) => Attempt::Departed(departure),
		Opened::Forbidden | Opened::Gone(None) => {
			Attempt::Dropped("the account is not a member of this instance (403)".to_owned())
		}
		Opened::Unknown => Attempt::Dropped("the relay knows no such instance (404)".to_owned()),
		Opened::Unreachable(reason) => Attempt::Dropped(reason),
	}
}

async fn listened<R: Runtime>(
	app: &AppHandle<R>,
	socket: Socket,
	instance_id: &str,
	device: &DeviceKeys,
) -> Attempt {
	let asked = match missed_rekey_frame(device, instance_id) {
		Ok(asked) => asked,
		Err(failure) => return Attempt::Dropped(format!("{failure:?}")),
	};
	let (mut sink, mut stream) = socket.split();
	if let Err(reason) = sent(&mut sink, Message::text(asked.clone())).await {
		return Attempt::Dropped(reason);
	}
	let every = app.state::<RelayGuests>().resend_every();
	let mut beats = interval_at(Instant::now() + every, every);
	let silence = sleep(SILENCE_BOUND);
	tokio::pin!(silence);
	loop {
		tokio::select! {
			frame = stream.next() => {
				silence.as_mut().reset(Instant::now() + SILENCE_BOUND);
				match frame {
					Some(Ok(Message::Text(text))) => {
						if is_kept(app, instance_id, device, text.as_str()).await {
							let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
							if let Err(reason) = sent(&mut sink, Message::Close(Some(close))).await {
								eprintln!("a joined socket of instance {instance_id} was left without its close: {reason}");
							}
							return Attempt::Joined;
						}
					}
					Some(Ok(Message::Close(frame))) => {
						return Attempt::Dropped(format!("the relay closed the socket: {frame:?}"))
					}
					Some(Ok(_)) => {}
					Some(Err(error)) => return Attempt::Dropped(format!("the socket failed: {error}")),
					None => return Attempt::Dropped("the socket ended".to_owned()),
				}
			}
			_ = beats.tick() => {
				for beat in [Message::text(asked.clone()), Message::Ping(Vec::new().into())] {
					if let Err(reason) = sent(&mut sink, beat).await {
						return Attempt::Dropped(reason);
					}
				}
			}
			_ = &mut silence => {
				return Attempt::Dropped(format!("no frame or pong arrived for {SILENCE_BOUND:?}"));
			}
		}
	}
}

async fn is_kept<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	device: &DeviceKeys,
	text: &str,
) -> bool {
	let handed = match rekey_handed(device, instance_id, text) {
		None => return false,
		Some(Ok(handed)) => handed,
		Some(Err(failure)) => {
			eprintln!("joined space of instance {instance_id} dropped a rekey: {failure:?}");
			return false;
		}
	};
	match kept_answer(app, instance_id, &handed).await {
		Ok(()) => true,
		Err(failure) => {
			eprintln!("the rekey of instance {instance_id} was not kept: {failure:?}");
			false
		}
	}
}

fn left<R: Runtime>(app: &AppHandle<R>, id: &str, stop: &watch::Receiver<bool>) {
	let guests = app.state::<RelayGuests>();
	let mut waiting = guests.waiting();
	if waiting.get(id).is_some_and(|entry| entry.stop.subscribe().same_channel(stop)) {
		waiting.remove(id);
	}
}

async fn joined_announced<R: Runtime>(app: &AppHandle<R>, id: &str) {
	if let Err(failure) = members_read(app, id).await {
		eprintln!("the members of joined space {id} were not read after its join: {failure:?}");
	}
	if let Err(failure) = announce_change(app, id.to_owned()) {
		eprintln!("joined space {id} came online and the front was not told: {failure:?}");
	}
}

async fn members_read<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	if let Some(joined) = ready(&state)?.joined_spaces().find(id.to_owned()).await? {
		members::read_soon(app, &joined);
	}
	Ok(())
}
