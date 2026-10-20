use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};
use tokio_tungstenite::tungstenite::protocol::CloseFrame;

use super::contract::{JoinedSpaceError, JoinedSpaceWait, JoinedSpaceWaitReason};
use super::relay::RelayGuests;

#[derive(Debug)]
pub(super) enum Stall {
	Unreachable(String),
	Forbidden,
	Unknown,
	AskNotSent(String),
	Asked,
	Silent(Duration),
	Closed(Option<CloseFrame>),
	SocketFailed(String),
	SocketEnded,
	RekeyDropped(JoinedSpaceError),
	DeviceKeys(JoinedSpaceError),
	AwaitingApproval,
	SocketUrl(JoinedSpaceError),
	KeyRead(JoinedSpaceError),
	RosterMissing,
	NoRekeyYet,
}

pub(super) fn wait_of(stall: Stall) -> JoinedSpaceWait {
	use JoinedSpaceWaitReason as Reason;
	let (reason, detail) = match stall {
		Stall::Unreachable(detail) => (Reason::RelayUnreachable, detail),
		Stall::Forbidden => {
			(Reason::NotMember, "the account is not a member of this instance (403)".to_owned())
		}
		Stall::Unknown => {
			(Reason::UnknownInstance, "the relay knows no such instance (404)".to_owned())
		}
		Stall::AskNotSent(detail) => {
			(Reason::RekeySendFailed, format!("the missed rekey frame did not leave: {detail}"))
		}
		Stall::Asked => (
			Reason::HostSilent,
			"the missed rekey frame left and no verified rekey answered it yet".to_owned(),
		),
		Stall::Silent(bound) => {
			(Reason::HostSilent, format!("no verified rekey came within {bound:?}"))
		}
		Stall::Closed(frame) => {
			(Reason::SocketClosed, format!("the relay closed the socket: {frame:?}"))
		}
		Stall::SocketFailed(detail) => {
			(Reason::SocketClosed, format!("the socket failed: {detail}"))
		}
		Stall::SocketEnded => (Reason::SocketClosed, "the socket ended".to_owned()),
		Stall::RekeyDropped(failure) => {
			(Reason::RekeyNotVerified, format!("a rekey was dropped: {failure:?}"))
		}
		Stall::DeviceKeys(failure) => (Reason::DeviceKeysUnreadable, format!("{failure:?}")),
		Stall::AwaitingApproval => (
			Reason::DeviceAwaitingApproval,
			"this device awaits its approval by another device of the account".to_owned(),
		),
		Stall::SocketUrl(JoinedSpaceError::RelayUnreachable { detail }) => {
			(Reason::RelayUnreachable, detail)
		}
		Stall::SocketUrl(failure) => (Reason::SocketUrlFailed, format!("{failure:?}")),
		Stall::KeyRead(failure) => (Reason::KeychainReadFailed, format!("{failure:?}")),
		Stall::RosterMissing => {
			(Reason::RosterMissing, "the space key is held but no verified roster is".to_owned())
		}
		Stall::NoRekeyYet => (
			Reason::HostSilent,
			"no verified rekey from the host has reached this device yet".to_owned(),
		),
	};
	JoinedSpaceWait { reason, detail }
}

pub(super) fn waited<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	stall: Stall,
) -> JoinedSpaceWait {
	let wait = wait_of(stall);
	log::warn!(
		"joined space of instance {instance_id} waits for its host ({:?}): {}",
		wait.reason,
		wait.detail
	);
	if let Some(guests) = app.try_state::<RelayGuests>() {
		guests.waited(instance_id, wait.clone());
	}
	wait
}

pub(super) fn last_wait<R: Runtime>(app: &AppHandle<R>, instance_id: &str) -> JoinedSpaceWait {
	app.try_state::<RelayGuests>()
		.and_then(|guests| guests.last_wait(instance_id))
		.unwrap_or_else(|| wait_of(Stall::NoRekeyYet))
}

#[cfg(test)]
mod tests {
	use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

	use super::*;

	#[test]
	fn every_http_answer_socket_end_and_local_failure_maps_to_its_wait_reason() {
		use JoinedSpaceWaitReason as Reason;
		let key_store = || JoinedSpaceError::KeyStore { detail: "the keychain refused".to_owned() };
		let absent = CloseFrame { code: CloseCode::from(4002), reason: "".into() };
		let rows = [
			(Stall::Unreachable("the relay answered 503".to_owned()), Reason::RelayUnreachable),
			(Stall::Forbidden, Reason::NotMember),
			(Stall::Unknown, Reason::UnknownInstance),
			(Stall::AskNotSent("broken pipe".to_owned()), Reason::RekeySendFailed),
			(Stall::Asked, Reason::HostSilent),
			(Stall::Silent(Duration::from_secs(15)), Reason::HostSilent),
			(Stall::Closed(Some(absent)), Reason::SocketClosed),
			(Stall::SocketFailed("reset".to_owned()), Reason::SocketClosed),
			(Stall::SocketEnded, Reason::SocketClosed),
			(Stall::RekeyDropped(JoinedSpaceError::BadSignature), Reason::RekeyNotVerified),
			(Stall::DeviceKeys(key_store()), Reason::DeviceKeysUnreadable),
			(Stall::AwaitingApproval, Reason::DeviceAwaitingApproval),
			(
				Stall::SocketUrl(JoinedSpaceError::RelayUnreachable { detail: "down".to_owned() }),
				Reason::RelayUnreachable,
			),
			(Stall::SocketUrl(JoinedSpaceError::NeedsSignIn), Reason::SocketUrlFailed),
			(Stall::KeyRead(key_store()), Reason::KeychainReadFailed),
			(Stall::RosterMissing, Reason::RosterMissing),
			(Stall::NoRekeyYet, Reason::HostSilent),
		];

		for (stall, expected) in rows {
			let named = format!("{stall:?}");
			let wait = wait_of(stall);
			assert_eq!(wait.reason, expected, "{named}");
			assert!(!wait.detail.is_empty(), "{named}");
		}
	}
}
