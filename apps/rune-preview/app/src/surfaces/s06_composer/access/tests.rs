use serde_json::json;

use super::*;

fn joined(state: &str, reason: Option<&str>) -> JoinedSpace {
	let wait = reason.map(|reason| json!({ "reason": reason, "detail": "" }));
	serde_json::from_value(json!({
		"id": "joined-1",
		"hostUrl": "https://relay.example",
		"remoteSpaceId": null,
		"name": "Studio",
		"state": state,
		"wait": wait,
		"hostedBy": "Ada",
		"colour": null,
		"instanceId": "instance-1",
	}))
	.expect("the joined Space reads")
}

#[test]
fn every_departure_shows_its_own_banner_whatever_the_host_does() {
	let cases = [
		(JoinedSpaceRemovalReason::Removed, AccessReason::Removed),
		(JoinedSpaceRemovalReason::Deleted, AccessReason::Deleted),
		(JoinedSpaceRemovalReason::Unknown, AccessReason::Unknown),
	];
	for (departure, reason) in cases {
		for state in ["online", "waitingForHost"] {
			assert_eq!(access_reason_of(&joined(state, None), Some(departure)), Some(reason));
		}
	}
}

#[test]
fn a_readable_or_left_space_shows_no_banner_and_a_waiting_one_shows_offline() {
	let left = Some(JoinedSpaceRemovalReason::Left);
	assert_eq!(access_reason_of(&joined("online", None), None), None);
	assert_eq!(access_reason_of(&joined("online", None), left), None);
	assert_eq!(
		access_reason_of(&joined("waitingForHost", None), None),
		Some(AccessReason::Offline(None))
	);
}

#[test]
fn every_wait_reason_shows_its_own_offline_banner() {
	let cases = [
		("relayUnreachable", WaitReason::RelayUnreachable),
		("rekeySendFailed", WaitReason::RekeySendFailed),
		("hostSilent", WaitReason::HostSilent),
		("socketClosed", WaitReason::SocketClosed),
		("rekeyNotVerified", WaitReason::RekeyNotVerified),
		("notMember", WaitReason::NotMember),
		("unknownInstance", WaitReason::UnknownInstance),
		("deviceKeysUnreadable", WaitReason::DeviceKeysUnreadable),
		("deviceAwaitingApproval", WaitReason::DeviceAwaitingApproval),
		("socketUrlFailed", WaitReason::SocketUrlFailed),
		("rosterMissing", WaitReason::RosterMissing),
		("keychainReadFailed", WaitReason::KeychainReadFailed),
	];
	for (core, wait) in cases {
		assert_eq!(
			access_reason_of(&joined("waitingForHost", Some(core)), None),
			Some(AccessReason::Offline(Some(wait))),
			"{core}"
		);
	}
}
