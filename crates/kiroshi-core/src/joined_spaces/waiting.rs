use futures_util::StreamExt;
use serde_json::Value;
use tokio::sync::watch;
use tokio::task::JoinHandle;
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
use crate::hosting::handover::NOT_ADMITTED;
use crate::hosting::relay::{
	opened_unpaused, sent, until_stopped, Backoff, Departure, Opened, Socket, SILENCE_BOUND,
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

pub(super) async fn joins_started(
	core: &crate::core_context::Core,
	guests: &RelayGuests,
) -> Result<(), JoinedSpaceError> {
	match bearer_of(core) {
		Ok(_) => {}
		Err(JoinedSpaceError::NeedsSignIn) => return Ok(()),
		Err(failure) => return Err(failure),
	}
	let state = core.state::<db::DatabaseState>();
	for joined in ready(&state)?.joined_spaces().list().await? {
		let JoinedReach::Relay { instance_id } = joined.reach;
		if held::wait_or_unread(core, &joined.id, &instance_id).is_none() {
			continue;
		}
		let mut waiting = guests.waiting();
		if waiting.contains_key(&joined.id) {
			continue;
		}
		let (stop, stopped) = watch::channel(false);
		let run = core.spawn(waited_for_host(
			core.clone(),
			joined.id.clone(),
			instance_id.clone(),
			stopped,
		));
		waiting.insert(joined.id, WaitingJoin { instance_id, stop, run });
	}
	Ok(())
}

pub(super) async fn waited_for_host(
	core: crate::core_context::Core,
	id: String,
	instance_id: String,
	mut stop: watch::Receiver<bool>,
) {
	let mut backoff = Backoff::first();
	loop {
		match until_stopped(&mut stop, attempted(&core, &instance_id, &mut backoff)).await {
			None => return,
			Some(Attempt::Joined) => {
				left(&core, &id, &stop);
				log::info!(
					"joined space {id} (instance {instance_id}) kept its rekey and comes online"
				);
				return joined_announced(&core, &id, &instance_id).await;
			}
			Some(Attempt::Departed(departure)) => {
				left(&core, &id, &stop);
				let reason = relay::reason_of(departure);
				if let Err(failure) = relay::entry_evicted(&core, &id, reason).await {
					log::error!(
						"joined space {id} (instance {instance_id}) whose membership ended was not evicted: {failure:?}"
					);
				}
				return;
			}
			Some(Attempt::Ended(reason)) => {
				left(&core, &id, &stop);
				return log::error!(
					"joined space {id} (instance {instance_id}) stopped waiting for its host: {reason}"
				);
			}
			Some(Attempt::Dropped(stall)) => {
				waited(&core, &instance_id, stall);
			}
		}
		let step = backoff.step();
		log::warn!("joined space {id} (instance {instance_id}) retries its wait in {step:?}");
		if until_stopped(&mut stop, sleep(step)).await.is_none() {
			return;
		}
	}
}

async fn attempted(
	core: &crate::core_context::Core,
	instance_id: &str,
	backoff: &mut Backoff,
) -> Attempt {
	let bearer = match bearer_of(core) {
		Ok(bearer) => bearer,
		Err(JoinedSpaceError::NeedsSignIn) => {
			return Attempt::Ended("no account is signed in".to_owned())
		}
		Err(failure) => return Attempt::Dropped(Stall::KeyRead(failure)),
	};
	if devices::is_awaiting_approval(core) {
		return Attempt::Dropped(Stall::AwaitingApproval);
	}
	let device = match device_keys(core) {
		Ok(device) => device,
		Err(failure) => return Attempt::Dropped(Stall::DeviceKeys(failure)),
	};
	let guests = core.state::<RelayGuests>().inner();
	let cloud = guests.cloud();
	cloud.unpaused().await;
	let url = match member_socket_of(core, &bearer, &device, instance_id).await {
		Ok(url) => url,
		Err(JoinedSpaceError::SessionRevoked) => {
			return Attempt::Ended("the cloud refused the account (401)".to_owned())
		}
		Err(failure) => return Attempt::Dropped(Stall::SocketUrl(failure)),
	};
	let opened = opened_unpaused(cloud, url, &bearer).await;
	guests.relay_device_forgotten_on_refusal(&opened);
	match opened {
		Opened::Socket(socket) => {
			log::info!("the waiting join of instance {instance_id} opened its member socket");
			backoff.socket_opened();
			listened(core, *socket, instance_id, &device).await
		}
		Opened::Revoked => {
			revoked(core, &bearer);
			Attempt::Ended("the relay refused the account (401)".to_owned())
		}
		Opened::Gone(Some(departure)) => Attempt::Departed(departure),
		Opened::Forbidden | Opened::Gone(None) => Attempt::Dropped(Stall::Forbidden),
		Opened::Unknown => Attempt::Dropped(Stall::Unknown),
		Opened::RateLimited(retry_after) => Attempt::Dropped(Stall::RateLimited(retry_after)),
		Opened::Unreachable(reason) => Attempt::Dropped(Stall::Unreachable(reason)),
	}
}

async fn listened(
	core: &crate::core_context::Core,
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
	waited(core, instance_id, Stall::Asked);
	let mut is_refused = false;
	let every = core.state::<RelayGuests>().resend_every();
	let mut beats = interval_at(Instant::now() + every, every);
	let silence = sleep(SILENCE_BOUND);
	tokio::pin!(silence);
	loop {
		tokio::select! {
			frame = stream.next() => {
				silence.as_mut().reset(Instant::now() + SILENCE_BOUND);
				match frame {
					Some(Ok(Message::Text(text))) if is_not_admitted(text.as_str()) => {
						if !is_refused {
							is_refused = true;
							waited(core, instance_id, Stall::NotAdmitted);
						}
					}
					Some(Ok(Message::Text(text))) => {
						if is_kept(core, instance_id, device, text.as_str()).await {
							let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
							if let Err(reason) = sent(&mut sink, Message::Close(Some(close))).await {
								log::warn!("a joined socket of instance {instance_id} was left without its close: {reason}");
							}
							return Attempt::Joined;
						}
					}
					Some(Ok(Message::Close(frame))) => return closed(core, instance_id, frame),
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

fn is_not_admitted(text: &str) -> bool {
	serde_json::from_str::<Value>(text).is_ok_and(|envelope| envelope["refused"] == NOT_ADMITTED)
}

async fn is_kept(
	core: &crate::core_context::Core,
	instance_id: &str,
	device: &DeviceKeys,
	text: &str,
) -> bool {
	let handed = match rekey_handed(device, instance_id, text) {
		None => return false,
		Some(Ok(handed)) => handed,
		Some(Err(failure)) => {
			log::error!("the waiting join of instance {instance_id} dropped a rekey: {failure:?}");
			waited(core, instance_id, Stall::RekeyDropped(failure));
			return false;
		}
	};
	match kept_answer(core, instance_id, &handed).await {
		Ok(()) => {
			wait_ended(core, instance_id);
			log::info!(
				"the waiting join of instance {instance_id} kept a rekey: space key_id {}",
				handed.space.key_id
			);
			true
		}
		Err(failure) => {
			log::error!("the waiting join of instance {instance_id} dropped a rekey: {failure:?}");
			waited(core, instance_id, Stall::RekeyDropped(failure));
			false
		}
	}
}

fn closed(
	core: &crate::core_context::Core,
	instance_id: &str,
	frame: Option<CloseFrame>,
) -> Attempt {
	let Some(departure) = frame.as_ref().and_then(relay::departure_closing) else {
		return Attempt::Dropped(Stall::Closed(frame));
	};
	waited(core, instance_id, Stall::Departed(departure));
	Attempt::Departed(departure)
}

fn left(core: &crate::core_context::Core, id: &str, stop: &watch::Receiver<bool>) {
	let guests = core.state::<RelayGuests>();
	let mut waiting = guests.waiting();
	if waiting.get(id).is_some_and(|entry| entry.stop.subscribe().same_channel(stop)) {
		waiting.remove(id);
	}
}

async fn joined_announced(core: &crate::core_context::Core, id: &str, instance_id: &str) {
	if let Err(failure) = members_read(core, id).await {
		log::warn!(
			"the members of joined space {id} (instance {instance_id}) were not read after its join: {failure:?}"
		);
	}
	if let Err(failure) = announce_change(core, id.to_owned()).await {
		log::error!(
			"joined space {id} (instance {instance_id}) came online and the front was not told: {failure:?}"
		);
	}
}

async fn members_read(core: &crate::core_context::Core, id: &str) -> Result<(), JoinedSpaceError> {
	let state = core.state::<db::DatabaseState>();
	if let Some(joined) = ready(&state)?.joined_spaces().find(id.to_owned()).await? {
		members::read_soon(core, &joined);
	}
	Ok(())
}
