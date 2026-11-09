use kiroshi_core::joined_spaces::contract::{
	JoinedSpace, JoinedSpaceRemovalReason, JoinedSpaceState, JoinedSpaceWaitReason,
};

use kiroshi_rune_kit::surfaces::s06_composer::space_access::{AccessReason, WaitReason};

#[cfg(test)]
mod tests;

pub fn wait_reason_of(reason: JoinedSpaceWaitReason) -> WaitReason {
	match reason {
		JoinedSpaceWaitReason::RelayUnreachable => WaitReason::RelayUnreachable,
		JoinedSpaceWaitReason::RekeySendFailed => WaitReason::RekeySendFailed,
		JoinedSpaceWaitReason::HostSilent => WaitReason::HostSilent,
		JoinedSpaceWaitReason::SocketClosed => WaitReason::SocketClosed,
		JoinedSpaceWaitReason::RekeyNotVerified => WaitReason::RekeyNotVerified,
		JoinedSpaceWaitReason::NotMember => WaitReason::NotMember,
		JoinedSpaceWaitReason::UnknownInstance => WaitReason::UnknownInstance,
		JoinedSpaceWaitReason::DeviceKeysUnreadable => WaitReason::DeviceKeysUnreadable,
		JoinedSpaceWaitReason::DeviceAwaitingApproval => WaitReason::DeviceAwaitingApproval,
		JoinedSpaceWaitReason::SocketUrlFailed => WaitReason::SocketUrlFailed,
		JoinedSpaceWaitReason::RosterMissing => WaitReason::RosterMissing,
		JoinedSpaceWaitReason::KeychainReadFailed => WaitReason::KeychainReadFailed,
	}
}

pub fn access_reason_of(
	joined: &JoinedSpace,
	departure: Option<JoinedSpaceRemovalReason>,
) -> Option<AccessReason> {
	match (departure, joined.state) {
		(Some(JoinedSpaceRemovalReason::Removed), _) => Some(AccessReason::Removed),
		(Some(JoinedSpaceRemovalReason::Deleted), _) => Some(AccessReason::Deleted),
		(Some(JoinedSpaceRemovalReason::Unknown), _) => Some(AccessReason::Unknown),
		(Some(JoinedSpaceRemovalReason::Left) | None, JoinedSpaceState::WaitingForHost) => {
			let wait = joined.wait.as_ref().map(|wait| wait_reason_of(wait.reason));
			Some(AccessReason::Offline(wait))
		}
		(Some(JoinedSpaceRemovalReason::Left) | None, JoinedSpaceState::Online) => None,
	}
}
