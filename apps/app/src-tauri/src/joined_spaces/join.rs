use base64::prelude::{Engine as _, BASE64_STANDARD};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

use super::commands::ready;
use super::contract::{JoinedSpace, JoinedSpaceError};
use super::held::{self, device_keys};
use super::join_link::{self, JoinLink};
use super::relay::{self, RelayGuests, RelayJoinError};
use super::roster_set::{verified_handover, Handed};
use crate::account::cloud::{
	Cloud, DeviceRegisterError, InstancesError, InvitationCallError, MeError,
};
use crate::account::session::{self, AccountSession};
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::frame::VERSION;
use crate::crypto::join;
use crate::db;
use crate::devices;
use crate::hosting::handover::KeyHandover;
use crate::hosting::relay::{opened, Opened, Socket};
use crate::invitations::{self, contract::InvitationError};

const MEMBERSHIP_ENDED: u16 = 4003;

enum Answered {
	Joined(Vec<u8>),
	Refused(String),
}

pub(super) async fn joined_by_link<R: Runtime>(
	app: &AppHandle<R>,
	link: &str,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let link = join_link::parsed(link).ok_or(JoinedSpaceError::MalformedLink)?;
	let device = device_keys(app)?;
	let sealed = join::seal(link.secret.as_slice(), &device, &link.host)
		.map_err(|_| JoinedSpaceError::MalformedLink)?;
	let bearer = bearer_of(app)?;
	if devices::is_awaiting_approval(app) {
		return Err(JoinedSpaceError::RelayRefused {
			detail: "this device awaits its approval by another device of the account".to_owned(),
		});
	}
	let guests = app.state::<RelayGuests>();
	let cloud = guests.cloud();
	let name = admitted(app, cloud, &bearer, &link.instance_id).await?;
	let relay_device_id = relay_device_of(app, cloud, &bearer, &device).await?;
	let frame = json!({
		"v": VERSION,
		"instance": link.instance_id,
		"join": BASE64_STANDARD.encode(sealed),
	});
	let url = relay::member_socket_url(cloud, &link.instance_id, &relay_device_id);
	let answered = answered(app, url, &bearer, frame.to_string(), &link.instance_id).await?;
	let joined = match answered {
		Answered::Joined(joined) => joined,
		Answered::Refused(refusal) => return Err(refused(&link.instance_id, &refusal)),
	};
	let handed = handed(&link, &device, &joined)?;
	if !held::kept(app, &link.instance_id, &handed).await? {
		eprintln!(
			"the join of instance {} answered a roster older than the one held",
			link.instance_id
		);
		return Err(JoinedSpaceError::BadSignature);
	}
	relay::joined(app, link.instance_id, name).await.map_err(|failure| match failure {
		RelayJoinError::SignedOut => JoinedSpaceError::NeedsSignIn,
		RelayJoinError::Account(detail) => JoinedSpaceError::SessionStore { detail },
		RelayJoinError::Joined(failure) => failure,
	})
}

fn bearer_of<R: Runtime>(app: &AppHandle<R>) -> Result<String, JoinedSpaceError> {
	match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(JoinedSpaceError::NeedsSignIn),
		Err(error) => Err(JoinedSpaceError::SessionStore { detail: format!("{error:?}") }),
	}
}

fn revoked<R: Runtime>(app: &AppHandle<R>, bearer: &str) -> JoinedSpaceError {
	session::revoked(app, bearer);
	JoinedSpaceError::SessionRevoked
}

async fn admitted<R: Runtime>(
	app: &AppHandle<R>,
	cloud: &Cloud,
	bearer: &str,
	instance_id: &str,
) -> Result<Option<String>, JoinedSpaceError> {
	let pending = match cloud.invitations(bearer).await {
		Ok(listed) => listed.into_iter().find(|invitation| invitation.instance_id == instance_id),
		Err(InvitationCallError::Revoked) => return Err(revoked(app, bearer)),
		Err(InvitationCallError::Offline(detail) | InvitationCallError::Unreachable(detail)) => {
			return Err(JoinedSpaceError::RelayUnreachable { detail })
		}
		Err(refusal) => {
			return Err(JoinedSpaceError::RelayRefused { detail: format!("{refusal:?}") })
		}
	};
	if let Some(invitation) = pending {
		return match invitations::accept(app, instance_id.to_owned()).await {
			Ok(joined) => Ok(Some(joined.name)),
			Err(InvitationError::Withdrawn | InvitationError::UnknownInvitation) => {
				Err(JoinedSpaceError::NoInvitation {
					inviter_email: Some(invitation.inviter_email),
				})
			}
			Err(failure) => Err(acceptance_failed(failure)),
		};
	}
	let instances = match cloud.instances(bearer).await {
		Ok(instances) => instances,
		Err(InstancesError::Revoked) => return Err(revoked(app, bearer)),
		Err(InstancesError::Unreachable(detail)) => {
			return Err(JoinedSpaceError::RelayUnreachable { detail })
		}
	};
	instances
		.into_iter()
		.find(|instance| instance.id == instance_id)
		.map(|instance| Some(instance.name))
		.ok_or(JoinedSpaceError::NoInvitation { inviter_email: None })
}

fn acceptance_failed(failure: InvitationError) -> JoinedSpaceError {
	match failure {
		InvitationError::NotSignedIn => JoinedSpaceError::NeedsSignIn,
		InvitationError::Offline { reason } | InvitationError::ServersUnreachable { reason } => {
			JoinedSpaceError::RelayUnreachable { detail: reason }
		}
		InvitationError::Storage { detail } => JoinedSpaceError::SessionStore { detail },
		InvitationError::Withdrawn | InvitationError::UnknownInvitation => {
			JoinedSpaceError::NoInvitation { inviter_email: None }
		}
	}
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
	frame: String,
	instance_id: &str,
) -> Result<Answered, JoinedSpaceError> {
	let mut socket = match opened(url, bearer).await {
		Opened::Socket(socket) => socket,
		Opened::Revoked => return Err(revoked(app, bearer)),
		Opened::Forbidden | Opened::Unknown => {
			return Err(JoinedSpaceError::NoInvitation { inviter_email: None })
		}
		Opened::Unreachable(detail) => return Err(JoinedSpaceError::RelayUnreachable { detail }),
	};
	if let Err(failure) = socket.send(Message::text(frame)).await {
		return Err(JoinedSpaceError::RelayUnreachable {
			detail: format!("the join frame did not leave: {failure}"),
		});
	}
	let bound = app.state::<RelayGuests>().answer_bound();
	let offline = || JoinedSpaceError::HostOffline { id: instance_id.to_owned() };
	let answered = timeout(bound, next_answer(&mut socket, instance_id))
		.await
		.unwrap_or_else(|_| Err(offline()));
	let close = CloseFrame { code: CloseCode::Normal, reason: "".into() };
	if let Err(failure) = socket.send(Message::Close(Some(close))).await {
		eprintln!(
			"the join socket of instance {instance_id} was left without its close: {failure}"
		);
	}
	answered
}

async fn next_answer(socket: &mut Socket, instance_id: &str) -> Result<Answered, JoinedSpaceError> {
	while let Some(frame) = socket.next().await {
		match frame {
			Ok(Message::Text(text)) => {
				if let Some(answered) = answer_of(text.as_str()) {
					return answered;
				}
			}
			Ok(Message::Close(Some(close))) if u16::from(close.code) == MEMBERSHIP_ENDED => {
				return Err(JoinedSpaceError::NoInvitation { inviter_email: None })
			}
			Ok(Message::Close(close)) => {
				eprintln!("the relay closed the join socket of instance {instance_id}: {close:?}");
				return Err(JoinedSpaceError::HostOffline { id: instance_id.to_owned() });
			}
			Ok(_) => {}
			Err(failure) => {
				return Err(JoinedSpaceError::RelayUnreachable {
					detail: format!("the join socket failed: {failure}"),
				})
			}
		}
	}
	Err(JoinedSpaceError::RelayUnreachable { detail: "the join socket ended".to_owned() })
}

fn answer_of(text: &str) -> Option<Result<Answered, JoinedSpaceError>> {
	let envelope: Value = serde_json::from_str(text).ok()?;
	if let Some(refusal) = envelope.get("join_refused").and_then(Value::as_str) {
		return Some(Ok(Answered::Refused(refusal.to_owned())));
	}
	let joined = envelope.get("joined")?;
	let decoded = joined.as_str().and_then(|joined| BASE64_STANDARD.decode(joined).ok());
	Some(decoded.map(Answered::Joined).ok_or(JoinedSpaceError::BadSignature))
}

fn refused(instance_id: &str, refusal: &str) -> JoinedSpaceError {
	eprintln!("the host of instance {instance_id} refused the join: {}", json!(refusal));
	match refusal {
		"used" | "unknown" => JoinedSpaceError::LinkUsed,
		"malformed" => JoinedSpaceError::MalformedLink,
		other => {
			JoinedSpaceError::RelayRefused { detail: format!("join_refused {}", json!(other)) }
		}
	}
}

pub(super) fn handed(
	link: &JoinLink,
	device: &DeviceKeys,
	joined: &[u8],
) -> Result<Handed, JoinedSpaceError> {
	let answer = join::opened_answer(link.secret.as_slice(), device.agreement(), joined)
		.map_err(|_| JoinedSpaceError::BadSignature)?;
	let handover: KeyHandover =
		serde_json::from_slice(&answer).map_err(|_| JoinedSpaceError::BadSignature)?;
	let handed = verified_handover(handover, None, &device.device_id())?;
	if handed.roster.host.agreement != link.host {
		return Err(JoinedSpaceError::BadSignature);
	}
	Ok(handed)
}

#[cfg(test)]
mod tests {
	use zeroize::Zeroizing;

	use super::super::roster_set::fixtures::{handover_of, signed_set, Device};
	use super::*;
	use crate::crypto::sealed_box;
	use crate::crypto::space_key::HeldSpaceKey;

	const SECRET: [u8; 32] = [5; 32];

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

		fn link(&self, secret: [u8; 32]) -> JoinLink {
			JoinLink {
				instance_id: "instance-1".to_owned(),
				host: self.host.agreement_public(),
				secret: Zeroizing::new(secret),
			}
		}

		fn joined(&self, devices: &[Device<'_>]) -> Vec<u8> {
			let space = HeldSpaceKey::first().expect("randomness");
			let set = signed_set(&self.host, space.key_id, 1, devices);
			let answer = serde_json::to_vec(&handover_of(&space, set)).expect("a json handover");
			let boxed = [join::answer_mac(&SECRET, &answer).as_slice(), &answer].concat();
			sealed_box::seal(&self.member.agreement_public(), &boxed).expect("the box seals")
		}

		fn both(&self) -> [Device<'_>; 2] {
			[
				Device { keys: &self.host, relay_device_id: "r-host", account_id: "owner" },
				Device { keys: &self.member, relay_device_id: "r-member", account_id: "bob" },
			]
		}
	}

	#[test]
	fn a_joined_answer_under_the_link_secret_hands_the_key_and_the_roster() {
		let joining = Joining::new();

		let handed =
			handed(&joining.link(SECRET), &joining.member, &joining.joined(&joining.both()));

		let handed = handed.expect("the answer verifies");
		assert_eq!(handed.space.key_id, 1);
		assert_eq!(handed.roster.own.relay_device_id, "r-member");
	}

	#[test]
	fn a_joined_answer_another_secret_keyed_or_another_host_signed_fails_the_signature() {
		let joining = Joining::new();
		let joined = joining.joined(&joining.both());
		let mut elsewhere = joining.link(SECRET);
		elsewhere.host = DeviceKeys::generate().expect("randomness").agreement_public();

		let guessed = handed(&joining.link([6; 32]), &joining.member, &joined).err();
		let foreign = handed(&elsewhere, &joining.member, &joined).err();

		assert_eq!(guessed, Some(JoinedSpaceError::BadSignature));
		assert_eq!(foreign, Some(JoinedSpaceError::BadSignature));
	}

	#[test]
	fn a_joined_answer_whose_roster_omits_this_device_answers_not_in_roster() {
		let joining = Joining::new();
		let host_only = joining.joined(&joining.both()[..1]);

		let refused = handed(&joining.link(SECRET), &joining.member, &host_only).err();

		assert_eq!(refused, Some(JoinedSpaceError::NotInRoster));
	}

	#[test]
	fn every_join_refusal_maps_to_its_typed_error() {
		assert_eq!(refused("i", "used"), JoinedSpaceError::LinkUsed);
		assert_eq!(refused("i", "unknown"), JoinedSpaceError::LinkUsed);
		assert_eq!(refused("i", "malformed"), JoinedSpaceError::MalformedLink);
		assert!(matches!(refused("i", "later"), JoinedSpaceError::RelayRefused { .. }));
	}
}
