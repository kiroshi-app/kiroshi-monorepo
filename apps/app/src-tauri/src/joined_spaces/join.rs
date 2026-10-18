use base64::prelude::{Engine as _, BASE64_STANDARD};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
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
use crate::account::cloud::{Cloud, DeviceRegisterError, MeError};
use crate::account::session::{self, AccountSession};
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::frame::VERSION;
use crate::crypto::sealed_box;
use crate::db;
use crate::hosting::handover::KeyHandover;
use crate::hosting::relay::{opened, Opened, Socket};

const MEMBERSHIP_ENDED: u16 = 4003;

const PENDING: &str = "pending";

pub(super) enum Answer {
	Joined(Vec<u8>),
	Refused(String),
}

pub async fn joined<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: String,
	name: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let device = device_keys(app)?;
	let bearer = bearer_of(app)?;
	let url = member_socket_of(app, &bearer, &device, &instance_id).await?;
	if let Some(joined) = answered(app, url, &bearer, &instance_id).await? {
		kept_answer(app, &instance_id, &device, &joined).await?;
	}
	relay::joined(app, instance_id, Some(name)).await.map_err(|failure| match failure {
		RelayJoinError::SignedOut => JoinedSpaceError::NeedsSignIn,
		RelayJoinError::Account(detail) => JoinedSpaceError::SessionStore { detail },
		RelayJoinError::Joined(failure) => failure,
	})
}

pub(super) fn join_frame(instance_id: &str) -> String {
	json!({ "v": VERSION, "instance": instance_id, "join": {} }).to_string()
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
	let cloud = app.state::<RelayGuests>().inner().cloud();
	let relay_device_id = relay_device_of(app, cloud, bearer, device).await?;
	Ok(relay::member_socket_url(cloud, instance_id, &relay_device_id))
}

async fn relay_device_of<R: Runtime>(
	app: &AppHandle<R>,
	cloud: &Cloud,
	bearer: &str,
	device: &DeviceKeys,
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
	eprintln!(
		"the device registered with the relay as {} (transferred {}) to join a space",
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
) -> Result<Option<Vec<u8>>, JoinedSpaceError> {
	let mut socket = match opened(url, bearer).await {
		Opened::Socket(socket) => socket,
		Opened::Revoked => return Err(revoked(app, bearer)),
		Opened::Forbidden | Opened::Unknown => {
			return Err(JoinedSpaceError::NoInvitation { inviter_email: None })
		}
		Opened::Unreachable(reason) => return Ok(waiting(instance_id, &reason)),
	};
	let bound = app.state::<RelayGuests>().answer_bound();
	let answered = match socket.send(Message::text(join_frame(instance_id))).await {
		Err(failure) => {
			Ok(waiting(instance_id, &format!("the join frame did not leave: {failure}")))
		}
		Ok(()) => {
			timeout(bound, next_answer(&mut socket, instance_id)).await.unwrap_or_else(|_| {
				Ok(waiting(instance_id, &format!("no joined answer came within {bound:?}")))
			})
		}
	};
	let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
	if let Err(failure) = socket.send(Message::Close(Some(close))).await {
		eprintln!(
			"the join socket of instance {instance_id} was left without its close: {failure}"
		);
	}
	answered
}

fn waiting(instance_id: &str, reason: &str) -> Option<Vec<u8>> {
	eprintln!("the join of instance {instance_id} waits for its host: {reason}");
	None
}

async fn next_answer(
	socket: &mut Socket,
	instance_id: &str,
) -> Result<Option<Vec<u8>>, JoinedSpaceError> {
	while let Some(frame) = socket.next().await {
		match frame {
			Ok(Message::Text(text)) => match answer_of(text.as_str()).transpose()? {
				Some(Answer::Joined(joined)) => return Ok(Some(joined)),
				Some(Answer::Refused(refusal)) if is_pending(&refusal) => {
					return Ok(waiting(instance_id, "the host has not admitted this device yet"))
				}
				Some(Answer::Refused(refusal)) => return Err(refused(instance_id, &refusal)),
				None => {}
			},
			Ok(Message::Close(Some(close))) if u16::from(close.code) == MEMBERSHIP_ENDED => {
				return Err(JoinedSpaceError::NoInvitation { inviter_email: None })
			}
			Ok(Message::Close(close)) => {
				return Ok(waiting(instance_id, &format!("the relay closed the socket: {close:?}")))
			}
			Ok(_) => {}
			Err(failure) => {
				return Ok(waiting(instance_id, &format!("the join socket failed: {failure}")))
			}
		}
	}
	Ok(waiting(instance_id, "the join socket ended"))
}

pub(super) fn answer_of(text: &str) -> Option<Result<Answer, JoinedSpaceError>> {
	let envelope: Value = serde_json::from_str(text).ok()?;
	if let Some(refusal) = envelope.get("join_refused").and_then(Value::as_str) {
		return Some(Ok(Answer::Refused(refusal.to_owned())));
	}
	let joined = envelope.get("joined")?;
	let decoded = joined.as_str().and_then(|joined| BASE64_STANDARD.decode(joined).ok());
	Some(decoded.map(Answer::Joined).ok_or(JoinedSpaceError::BadSignature))
}

pub(super) fn is_pending(refusal: &str) -> bool {
	refusal == PENDING
}

fn refused(instance_id: &str, refusal: &str) -> JoinedSpaceError {
	eprintln!("the host of instance {instance_id} refused the join: {}", json!(refusal));
	JoinedSpaceError::RelayRefused { detail: format!("join_refused {}", json!(refusal)) }
}

pub(super) async fn kept_answer<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	device: &DeviceKeys,
	joined: &[u8],
) -> Result<(), JoinedSpaceError> {
	let handed = handed(device, joined)?;
	let held = held::roster(app, instance_id).await?;
	if held.is_some_and(|held| held.host != handed.roster.host) {
		eprintln!("the join of instance {instance_id} answered a host other than the one held");
		return Err(JoinedSpaceError::BadSignature);
	}
	if !held::kept(app, instance_id, &handed).await? {
		eprintln!("the join of instance {instance_id} answered a roster older than the one held");
		return Err(JoinedSpaceError::BadSignature);
	}
	Ok(())
}

pub(super) fn handed(device: &DeviceKeys, joined: &[u8]) -> Result<Handed, JoinedSpaceError> {
	let answer = sealed_box::open(device.agreement(), joined)
		.map(Zeroizing::new)
		.map_err(|_| JoinedSpaceError::BadSignature)?;
	let handover: KeyHandover =
		serde_json::from_slice(&answer).map_err(|_| JoinedSpaceError::BadSignature)?;
	verified_handover(handover, None, &device.device_id())
}

#[cfg(test)]
mod tests {
	use super::super::roster_set::fixtures::{handover_of, signed_set, Device};
	use super::*;
	use crate::crypto::space_key::HeldSpaceKey;

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

		fn joined(&self, devices: &[Device<'_>]) -> Vec<u8> {
			let space = HeldSpaceKey::first().expect("randomness");
			let set = signed_set(&self.host, space.key_id, 1, devices);
			let answer = serde_json::to_vec(&handover_of(&space, set)).expect("a json handover");
			sealed_box::seal(&self.member.agreement_public(), &answer).expect("the box seals")
		}

		fn both(&self) -> [Device<'_>; 2] {
			[
				Device { keys: &self.host, relay_device_id: "r-host", account_id: "owner" },
				Device { keys: &self.member, relay_device_id: "r-member", account_id: "bob" },
			]
		}
	}

	#[test]
	fn a_joined_answer_sealed_to_this_device_hands_the_key_and_the_roster() {
		let joining = Joining::new();

		let handed = handed(&joining.member, &joining.joined(&joining.both()));

		let handed = handed.expect("the answer verifies");
		assert_eq!(handed.space.key_id, 1);
		assert_eq!(handed.roster.own.relay_device_id, "r-member");
		assert_eq!(handed.roster.host.relay_device_id, "r-host");
	}

	#[test]
	fn a_joined_answer_sealed_to_another_device_or_unreadable_fails_the_signature() {
		let joining = Joining::new();
		let joined = joining.joined(&joining.both());
		let elsewhere = DeviceKeys::generate().expect("randomness");

		let foreign = handed(&elsewhere, &joined).err();
		let truncated = handed(&joining.member, &joined[..40]).err();

		assert_eq!(foreign, Some(JoinedSpaceError::BadSignature));
		assert_eq!(truncated, Some(JoinedSpaceError::BadSignature));
	}

	#[test]
	fn a_joined_answer_whose_roster_omits_this_device_answers_not_in_roster() {
		let joining = Joining::new();
		let host_only = joining.joined(&joining.both()[..1]);

		let refused = handed(&joining.member, &host_only).err();

		assert_eq!(refused, Some(JoinedSpaceError::NotInRoster));
	}

	#[test]
	fn the_join_frame_names_the_instance_and_carries_no_key() {
		let frame: Value = serde_json::from_str(&join_frame("instance-1")).expect("a json frame");

		assert_eq!(frame, json!({ "v": 2, "instance": "instance-1", "join": {} }));
	}

	#[test]
	fn a_pending_refusal_is_told_apart_from_any_other() {
		let pending = answer_of(r#"{"join_refused":"pending"}"#);
		let other = answer_of(r#"{"join_refused":"later"}"#);

		assert!(matches!(pending, Some(Ok(Answer::Refused(refusal))) if is_pending(&refusal)));
		assert!(matches!(other, Some(Ok(Answer::Refused(refusal))) if !is_pending(&refusal)));
		assert!(matches!(refused("i", "later"), JoinedSpaceError::RelayRefused { .. }));
		assert!(answer_of(r#"{"hello":{}}"#).is_none());
	}
}
