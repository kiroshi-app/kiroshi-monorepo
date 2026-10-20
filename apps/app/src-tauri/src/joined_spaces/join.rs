use base64::prelude::{Engine as _, BASE64_STANDARD};
use ed25519_dalek::Signature;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;
use zeroize::Zeroizing;

use super::commands::ready;
use super::contract::{JoinedSpace, JoinedSpaceError};
use super::held::{self, device_keys};
use super::relay::{self, RelayGuests, RelayJoinError};
use super::roster_set::{verified_handover, Handed};
use super::wait_reason::{wait_ended, waited, Stall};
use crate::account::cloud::{Cloud, DeviceRegisterError, MeError};
use crate::account::session::{self, AccountSession};
use crate::crypto::device_keys::{verify, DeviceKeys};
use crate::crypto::frame::{self, Header};
use crate::crypto::sealed_box;
use crate::crypto::space_key::HeldSpaceKey;
use crate::crypto::subkey::Subkey;
use crate::db;
use crate::devices;
use crate::hosting::handover::{rekey_bytes, KeyHandover};
use crate::hosting::relay::{opened, Opened, Socket};
use crate::hosting::wire::{envelope_of, HELLO};

const MEMBERSHIP_ENDED: u16 = 4003;

const NO_KEY_ID: u32 = 0;

pub async fn joined<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: String,
	name: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	log::info!("the join of instance {instance_id} starts");
	let joined = attempted(app, &instance_id, name).await;
	if let Err(failure) = &joined {
		log::error!("the join of instance {instance_id} was refused: {failure:?}");
	}
	joined
}

async fn attempted<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	name: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let device = device_keys(app)?;
	let bearer = bearer_of(app)?;
	if devices::is_awaiting_approval(app) {
		return Err(JoinedSpaceError::RelayRefused {
			detail: "this device awaits its approval by another device of the account".to_owned(),
		});
	}
	let url = member_socket_of(app, &bearer, &device, instance_id).await?;
	if let Some(handed) = answered(app, url, &bearer, instance_id, &device).await? {
		kept_answer(app, instance_id, &handed).await?;
		wait_ended(app, instance_id);
		log::info!(
			"the join of instance {instance_id} kept a rekey: space key_id {}",
			handed.space.key_id
		);
	}
	relay::joined(app, instance_id.to_owned(), Some(name)).await.map_err(|failure| match failure {
		RelayJoinError::SignedOut => JoinedSpaceError::NeedsSignIn,
		RelayJoinError::Account(detail) => JoinedSpaceError::SessionStore { detail },
		RelayJoinError::Joined(failure) => failure,
	})
}

pub(super) fn missed_rekey_frame(
	device: &DeviceKeys,
	instance_id: &str,
) -> Result<String, JoinedSpaceError> {
	let failed = |failure| JoinedSpaceError::KeyStore { detail: format!("{failure:?}") };
	let unheld = HeldSpaceKey::under(NO_KEY_ID).map_err(failed)?;
	let from = device.device_id();
	let header = Header {
		instance: instance_id.to_owned(),
		from,
		to: None,
		key_id: NO_KEY_ID,
		ctr: 1,
		challenge: None,
	};
	let subkey = Subkey::derive(&unheld.key, NO_KEY_ID, &from);
	let sealed = frame::seal(header, HELLO.as_bytes(), &subkey, device).map_err(|failure| {
		JoinedSpaceError::KeyStore {
			detail: format!("the missed rekey frame did not seal: {failure:?}"),
		}
	})?;
	Ok(envelope_of(&sealed, None))
}

pub(super) fn bearer_of<R: Runtime>(app: &AppHandle<R>) -> Result<String, JoinedSpaceError> {
	match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(JoinedSpaceError::NeedsSignIn),
		Err(error) => Err(JoinedSpaceError::SessionStore { detail: format!("{error:?}") }),
	}
}

pub(super) fn revoked<R: Runtime>(app: &AppHandle<R>, bearer: &str) -> JoinedSpaceError {
	session::revoked(app, bearer);
	JoinedSpaceError::SessionRevoked
}

pub(super) async fn member_socket_of<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	device: &DeviceKeys,
	instance_id: &str,
) -> Result<String, JoinedSpaceError> {
	let guests = app.state::<RelayGuests>().inner();
	let device_id = device.device_id().to_string();
	let relay_device_id = match guests.known_relay_device(bearer, &device_id) {
		Some(known) => known,
		None => {
			let read = relay_device_of(app, guests.cloud(), bearer, device, instance_id).await?;
			guests.relay_device_known(bearer, &device_id, &read);
			read
		}
	};
	Ok(relay::member_socket_url(guests.cloud(), instance_id, &relay_device_id))
}

async fn relay_device_of<R: Runtime>(
	app: &AppHandle<R>,
	cloud: &Cloud,
	bearer: &str,
	device: &DeviceKeys,
	instance_id: &str,
) -> Result<String, JoinedSpaceError> {
	let account_id = match cloud.me(bearer).await {
		Ok(account) => account.id,
		Err(MeError::Revoked) => return Err(revoked(app, bearer)),
		Err(MeError::Unreachable(detail)) => {
			return Err(JoinedSpaceError::RelayUnreachable { detail })
		}
	};
	let state = app.state::<db::DatabaseState>();
	let devices = ready(&state)?.relay_devices();
	let device_id = device.device_id().to_string();
	if let Some(held) = devices.relay_device_id(account_id.clone(), device_id.clone()).await? {
		return Ok(held);
	}
	let registered = match cloud.register_device(bearer, &account_id, device).await {
		Ok(registered) => registered,
		Err(DeviceRegisterError::Revoked) => return Err(revoked(app, bearer)),
		Err(DeviceRegisterError::Refused(refusal)) => {
			return Err(JoinedSpaceError::RelayRefused { detail: refusal.to_string() })
		}
		Err(DeviceRegisterError::Unreachable(detail)) => {
			return Err(JoinedSpaceError::RelayUnreachable { detail })
		}
	};
	log::info!(
		"the device registered with the relay as {} (transferred {}) to join instance {instance_id}",
		registered.id, registered.transferred
	);
	devices.registered(account_id, device_id, registered.id.clone()).await?;
	Ok(registered.id)
}

async fn answered<R: Runtime>(
	app: &AppHandle<R>,
	url: String,
	bearer: &str,
	instance_id: &str,
	device: &DeviceKeys,
) -> Result<Option<Handed>, JoinedSpaceError> {
	let guests = app.state::<RelayGuests>().inner();
	let opened = opened(guests.cloud(), url, bearer).await;
	guests.relay_device_forgotten_on_refusal(&opened);
	let mut socket = match opened {
		Opened::Socket(socket) => socket,
		Opened::Revoked => return Err(revoked(app, bearer)),
		Opened::Forbidden | Opened::Unknown | Opened::Gone(_) => {
			return Err(JoinedSpaceError::NoInvitation { inviter_email: None })
		}
		Opened::RateLimited(retry_after) => {
			return Ok(waiting(app, instance_id, Stall::RateLimited(retry_after)))
		}
		Opened::Unreachable(reason) => {
			return Ok(waiting(app, instance_id, Stall::Unreachable(reason)))
		}
	};
	log::info!("the join of instance {instance_id} opened its member socket");
	let bound = app.state::<RelayGuests>().answer_bound();
	let asked = Message::text(missed_rekey_frame(device, instance_id)?);
	let answered = match socket.send(asked).await {
		Err(failure) => Ok(waiting(app, instance_id, Stall::AskNotSent(failure.to_string()))),
		Ok(()) => {
			let mut dropped = None;
			let answer =
				timeout(bound, next_rekey(app, &mut socket, instance_id, device, &mut dropped))
					.await;
			answer.unwrap_or_else(|_| {
				let stall = dropped.map_or(Stall::Silent(bound), Stall::RekeyDropped);
				Ok(waiting(app, instance_id, stall))
			})
		}
	};
	let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
	if let Err(failure) = socket.send(Message::Close(Some(close))).await {
		log::warn!(
			"the join socket of instance {instance_id} was left without its close: {failure}"
		);
	}
	answered
}

fn waiting<R: Runtime>(app: &AppHandle<R>, instance_id: &str, stall: Stall) -> Option<Handed> {
	waited(app, instance_id, stall);
	None
}

async fn next_rekey<R: Runtime>(
	app: &AppHandle<R>,
	socket: &mut Socket,
	instance_id: &str,
	device: &DeviceKeys,
	dropped: &mut Option<JoinedSpaceError>,
) -> Result<Option<Handed>, JoinedSpaceError> {
	while let Some(frame) = socket.next().await {
		match frame {
			Ok(Message::Text(text)) => {
				match rekey_handed(device, instance_id, text.as_str()) {
					Some(Ok(handed)) => return Ok(Some(handed)),
					Some(Err(JoinedSpaceError::BadSignature)) => {
						log::error!("the join of instance {instance_id} dropped a rekey that did not verify");
						*dropped = Some(JoinedSpaceError::BadSignature);
					}
					Some(Err(failure)) => return Err(failure),
					None => {}
				}
			}
			Ok(Message::Close(Some(close))) if u16::from(close.code) == MEMBERSHIP_ENDED => {
				return Err(JoinedSpaceError::NoInvitation { inviter_email: None })
			}
			Ok(Message::Close(close)) => {
				return Ok(waiting(app, instance_id, Stall::Closed(close)))
			}
			Ok(_) => {}
			Err(failure) => {
				return Ok(waiting(app, instance_id, Stall::SocketFailed(failure.to_string())))
			}
		}
	}
	Ok(waiting(app, instance_id, Stall::SocketEnded))
}

pub(super) fn rekey_handed(
	device: &DeviceKeys,
	instance_id: &str,
	text: &str,
) -> Option<Result<Handed, JoinedSpaceError>> {
	let envelope: Value = serde_json::from_str(text).ok()?;
	let sealed = envelope.get("rekey")?;
	Some(first_rekey_verified(device, instance_id, sealed, envelope.get("sig")))
}

fn first_rekey_verified(
	device: &DeviceKeys,
	instance_id: &str,
	sealed: &Value,
	sig: Option<&Value>,
) -> Result<Handed, JoinedSpaceError> {
	let decoded = |field: Option<&Value>| {
		let field = field.and_then(Value::as_str).ok_or(JoinedSpaceError::BadSignature)?;
		BASE64_STANDARD.decode(field).map_err(|_| JoinedSpaceError::BadSignature)
	};
	let sealed = decoded(Some(sealed))?;
	let sig = Signature::from_slice(&decoded(sig)?).map_err(|_| JoinedSpaceError::BadSignature)?;
	let opened = sealed_box::open(device.agreement(), &sealed)
		.map(Zeroizing::new)
		.map_err(|_| JoinedSpaceError::BadSignature)?;
	let handover: KeyHandover =
		serde_json::from_slice(&opened).map_err(|_| JoinedSpaceError::BadSignature)?;
	let own = device.device_id();
	let handed = verified_handover(handover, None, &own)?;
	let signed = rekey_bytes(instance_id, &own, &sealed);
	verify(&handed.roster.host.signing, &signed, &sig)
		.map_err(|_| JoinedSpaceError::BadSignature)?;
	Ok(handed)
}

pub(super) async fn kept_answer<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	handed: &Handed,
) -> Result<(), JoinedSpaceError> {
	let held = held::roster(app, instance_id).await?;
	if held.is_some_and(|held| held.host != handed.roster.host) {
		log::error!("the join of instance {instance_id} dropped a rekey: it came from a host other than the one pinned");
		return Err(JoinedSpaceError::BadSignature);
	}
	if !held::kept(app, instance_id, handed).await? {
		log::error!("the join of instance {instance_id} dropped a rekey: it carried a roster older than the one held");
		return Err(JoinedSpaceError::BadSignature);
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::super::roster_set::fixtures::{handover_of, signed_set, Device};
	use super::*;
	use crate::hosting::wire::fields_of;

	const INSTANCE: &str = "instance-1";

	struct Joining {
		host: DeviceKeys,
		member: DeviceKeys,
	}

	impl Joining {
		fn new() -> Self {
			Self {
				host: DeviceKeys::generate().expect("randomness"),
				member: DeviceKeys::generate().expect("randomness"),
			}
		}

		fn rekey(&self, devices: &[Device<'_>], signer: &DeviceKeys) -> String {
			let space = HeldSpaceKey::first().expect("randomness");
			let set = signed_set(&self.host, space.key_id, 1, devices);
			let handover = serde_json::to_vec(&handover_of(&space, set)).expect("a json handover");
			let sealed =
				sealed_box::seal(&self.member.agreement_public(), &handover).expect("sealed");
			let sig = signer.sign(&rekey_bytes(INSTANCE, &self.member.device_id(), &sealed));
			json!({
				"from": "r-host",
				"v": 2,
				"instance": INSTANCE,
				"to": "r-member",
				"rekey": BASE64_STANDARD.encode(sealed),
				"sig": BASE64_STANDARD.encode(sig.to_bytes()),
			})
			.to_string()
		}

		fn both(&self) -> [Device<'_>; 2] {
			[
				Device { keys: &self.host, relay_device_id: "r-host", account_id: "owner" },
				Device { keys: &self.member, relay_device_id: "r-member", account_id: "bob" },
			]
		}

		fn handed(&self, rekey: &str) -> Option<Result<Handed, JoinedSpaceError>> {
			rekey_handed(&self.member, INSTANCE, rekey)
		}
	}

	#[test]
	fn a_first_rekey_signed_by_the_host_of_its_roster_hands_the_key_and_pins_that_host() {
		let joining = Joining::new();

		let handed = joining.handed(&joining.rekey(&joining.both(), &joining.host));

		let handed = handed.expect("a rekey").expect("the rekey verifies");
		assert_eq!(handed.space.key_id, 1);
		assert_eq!(handed.roster.own.relay_device_id, "r-member");
		assert_eq!(handed.roster.host.signing, joining.host.signing_public());
	}

	#[test]
	fn a_rekey_signed_by_another_key_or_sealed_to_another_device_fails_the_signature() {
		let joining = Joining::new();
		let stranger = DeviceKeys::generate().expect("randomness");
		let forged = joining.rekey(&joining.both(), &stranger);
		let genuine = joining.rekey(&joining.both(), &joining.host);

		let refused = joining.handed(&forged).map(|handed| handed.err());
		let foreign = rekey_handed(&stranger, INSTANCE, &genuine).map(|handed| handed.err());
		let elsewhere = rekey_handed(&joining.member, "instance-2", &genuine).map(|h| h.err());

		assert_eq!(refused, Some(Some(JoinedSpaceError::BadSignature)));
		assert_eq!(foreign, Some(Some(JoinedSpaceError::BadSignature)));
		assert_eq!(elsewhere, Some(Some(JoinedSpaceError::BadSignature)));
	}

	#[test]
	fn a_rekey_whose_roster_omits_this_device_answers_not_in_roster() {
		let joining = Joining::new();
		let host_only = joining.rekey(&joining.both()[..1], &joining.host);

		let refused = joining.handed(&host_only).map(|handed| handed.err());

		assert_eq!(refused, Some(Some(JoinedSpaceError::NotInRoster)));
	}

	#[test]
	fn a_frame_that_carries_no_rekey_is_not_an_answer() {
		let joining = Joining::new();

		assert!(joining.handed(r#"{"v":2,"hello":{}}"#).is_none());
		assert!(joining.handed("not json").is_none());
	}

	#[test]
	fn the_missed_rekey_frame_reads_on_the_host_as_a_frame_under_no_key() {
		let joining = Joining::new();

		let frame = missed_rekey_frame(&joining.member, INSTANCE).expect("the frame seals");

		let envelope: Value = serde_json::from_str(&frame).expect("a json frame");
		let fields = fields_of(&envelope).expect("the host reads its fields");
		assert_eq!((fields.key_id, envelope.get("to")), (0, None));
		assert_eq!(envelope["instance"], INSTANCE);
	}
}
