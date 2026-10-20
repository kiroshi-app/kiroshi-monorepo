use futures_util::StreamExt;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch;
use tokio::time::{interval_at, sleep, Instant};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

use super::commands::{announce_change, ready};
use super::contract::JoinedSpaceError;
use super::held::{self, device_keys};
use super::join::{
	bearer_of, kept_answer, member_socket_of, missed_rekey_frame, rekey_handed, revoked,
};
use super::members;
use super::relay::{self, RelayGuests};
use super::wait_reason::{wait_ended, waited, Stall};
use crate::crypto::device_keys::DeviceKeys;
use crate::db;
use crate::db::repositories::joined_spaces::JoinedReach;
use crate::devices;
use crate::hosting::relay::{
	opened, sent, until_stopped, Backoff, Departure, Opened, Socket, SILENCE_BOUND,
};

pub(super) struct WaitingJoin {
	instance_id: String,
	stop: watch::Sender<bool>,
	run: JoinHandle<()>,
}

impl WaitingJoin {
	pub(super) async fn finished(self, id: &str) {
		self.stop.send_replace(true);
		if let Err(error) = self.run.await {
			log::error!(
				"the waiting join of joined space {id} (instance {}) ended abnormally: {error}",
				self.instance_id
			);
		}
	}
}

enum Attempt {
	Joined,
	Departed(Departure),
	Ended(String),
	Dropped(Stall),
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
		if held::wait_or_unread(app, &joined.id, &instance_id).is_none() {
			continue;
		}
		let mut waiting = guests.waiting();
		if waiting.contains_key(&joined.id) {
			continue;
		}
		let (stop, stopped) = watch::channel(false);
		let run = tauri::async_runtime::spawn(waited_for_host(
			app.clone(),
			joined.id.clone(),
			instance_id.clone(),
			stopped,
		));
		waiting.insert(joined.id, WaitingJoin { instance_id, stop, run });
	}
	Ok(())
}

async fn waited_for_host<R: Runtime>(
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
				log::info!(
					"joined space {id} (instance {instance_id}) kept its rekey and comes online"
				);
				return joined_announced(&app, &id, &instance_id).await;
			}
			Some(Attempt::Departed(departure)) => {
				left(&app, &id, &stop);
				let reason = relay::reason_of(departure);
				if let Err(failure) = relay::entry_evicted(&app, &id, reason).await {
					log::error!(
						"joined space {id} (instance {instance_id}) whose membership ended was not evicted: {failure:?}"
					);
				}
				return;
			}
			Some(Attempt::Ended(reason)) => {
				left(&app, &id, &stop);
				return log::error!(
					"joined space {id} (instance {instance_id}) stopped waiting for its host: {reason}"
				);
			}
			Some(Attempt::Dropped(stall)) => {
				waited(&app, &instance_id, stall);
			}
		}
		let step = backoff.step();
		log::warn!("joined space {id} (instance {instance_id}) retries its wait in {step:?}");
		if until_stopped(&mut stop, sleep(step)).await.is_none() {
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
		Err(failure) => return Attempt::Dropped(Stall::KeyRead(failure)),
	};
	if devices::is_awaiting_approval(app) {
		return Attempt::Dropped(Stall::AwaitingApproval);
	}
	let device = match device_keys(app) {
		Ok(device) => device,
		Err(failure) => return Attempt::Dropped(Stall::DeviceKeys(failure)),
	};
	let url = match member_socket_of(app, &bearer, &device, instance_id).await {
		Ok(url) => url,
		Err(JoinedSpaceError::SessionRevoked) => {
			return Attempt::Ended("the cloud refused the account (401)".to_owned())
		}
		Err(failure) => return Attempt::Dropped(Stall::SocketUrl(failure)),
	};
	match opened(url, &bearer).await {
		Opened::Socket(socket) => {
			log::info!("the waiting join of instance {instance_id} opened its member socket");
			backoff.reset();
			listened(app, *socket, instance_id, &device).await
		}
		Opened::Revoked => {
			revoked(app, &bearer);
			Attempt::Ended("the relay refused the account (401)".to_owned())
		}
		Opened::Gone(Some(departure)) => Attempt::Departed(departure),
		Opened::Forbidden | Opened::Gone(None) => Attempt::Dropped(Stall::Forbidden),
		Opened::Unknown => Attempt::Dropped(Stall::Unknown),
		Opened::Unreachable(reason) => Attempt::Dropped(Stall::Unreachable(reason)),
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
		Err(failure) => return Attempt::Dropped(Stall::AskNotSent(format!("{failure:?}"))),
	};
	let (mut sink, mut stream) = socket.split();
	if let Err(reason) = sent(&mut sink, Message::text(asked.clone())).await {
		return Attempt::Dropped(Stall::AskNotSent(reason));
	}
	waited(app, instance_id, Stall::Asked);
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
								log::warn!("a joined socket of instance {instance_id} was left without its close: {reason}");
							}
							return Attempt::Joined;
						}
					}
					Some(Ok(Message::Close(frame))) => return Attempt::Dropped(Stall::Closed(frame)),
					Some(Ok(_)) => {}
					Some(Err(error)) => return Attempt::Dropped(Stall::SocketFailed(error.to_string())),
					None => return Attempt::Dropped(Stall::SocketEnded),
				}
			}
			_ = beats.tick() => {
				for beat in [Message::text(asked.clone()), Message::Ping(Vec::new().into())] {
					if let Err(reason) = sent(&mut sink, beat).await {
						return Attempt::Dropped(Stall::AskNotSent(reason));
					}
				}
			}
			_ = &mut silence => {
				return Attempt::Dropped(Stall::PongMissing(SILENCE_BOUND));
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
			log::error!("the waiting join of instance {instance_id} dropped a rekey: {failure:?}");
			waited(app, instance_id, Stall::RekeyDropped(failure));
			return false;
		}
	};
	match kept_answer(app, instance_id, &handed).await {
		Ok(()) => {
			wait_ended(app, instance_id);
			log::info!(
				"the waiting join of instance {instance_id} kept a rekey: space key_id {}",
				handed.space.key_id
			);
			true
		}
		Err(failure) => {
			log::error!("the waiting join of instance {instance_id} dropped a rekey: {failure:?}");
			waited(app, instance_id, Stall::RekeyDropped(failure));
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

async fn joined_announced<R: Runtime>(app: &AppHandle<R>, id: &str, instance_id: &str) {
	if let Err(failure) = members_read(app, id).await {
		log::warn!(
			"the members of joined space {id} (instance {instance_id}) were not read after its join: {failure:?}"
		);
	}
	if let Err(failure) = announce_change(app, id.to_owned()) {
		log::error!(
			"joined space {id} (instance {instance_id}) came online and the front was not told: {failure:?}"
		);
	}
}

async fn members_read<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	if let Some(joined) = ready(&state)?.joined_spaces().find(id.to_owned()).await? {
		members::read_soon(app, &joined);
	}
	Ok(())
}
