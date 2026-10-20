use serde::{Deserialize, Serialize};

use crate::account::cloud::{CloudMember, MemberCallError, MemberRole, MembershipState};
use crate::crypto::contract::DeviceKeysError;
use crate::spaces::contract::SpaceError;

pub const CHANGED_EVENT: &str = "hosting://changed";

pub const MEMBERS_CHANGED_EVENT: &str = "hosting://members-changed";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HostingState {
	#[default]
	Off,
	Connecting,
	Online,
	#[serde(rename_all = "camelCase")]
	Failed {
		failure: HostingFailureKind,
		detail: String,
	},
	NeedsSignIn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum HostingFailureKind {
	NotOwner,
	InstanceUnknownAfterReregistration,
	InstanceGoneAfterReregistration,
	DeviceRefused,
	DeviceAwaitingApproval,
	DeviceKeysNotLoaded,
	SpaceKeyNotRead,
	LocalHostApiNotListening,
	AccountSessionStoreFailed,
	TakenOverByAnotherHost,
	SealingFailed,
	LocalEventStreamClosed,
	DatabaseUnavailable,
}

impl HostingState {
	pub fn is_running(&self) -> bool {
		matches!(self, HostingState::Connecting | HostingState::Online)
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HostingChanged {
	pub space_id: String,
	pub state: HostingState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MemberStatus {
	Host,
	Pending,
	Joined,
	NeedsInvitation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Member {
	pub user_id: String,
	pub name: Option<String>,
	pub email: String,
	pub status: MemberStatus,
}

impl From<CloudMember> for Member {
	fn from(member: CloudMember) -> Self {
		let status = match (member.role, member.state) {
			(MemberRole::Owner, _) => MemberStatus::Host,
			(MemberRole::Member, MembershipState::Pending) => MemberStatus::Pending,
			(MemberRole::Member, MembershipState::Joined) => MemberStatus::Joined,
		};
		Self { user_id: member.user_id, name: member.name, email: member.email, status }
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum InvitationState {
	Invited,
	Expired,
	Withdrawn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpaceInvitation {
	pub id: String,
	pub email: String,
	pub sent_at: String,
	pub expires_at: String,
	pub state: InvitationState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpaceMembers {
	pub members: Vec<Member>,
	pub invitations: Vec<SpaceInvitation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MembersChanged {
	pub space_id: String,
	pub members: Vec<Member>,
	pub invitations: Vec<SpaceInvitation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RosterDevice {
	pub device_id: String,
	pub fingerprint: Vec<String>,
	pub added_at: i64,
	pub is_host: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccountDevices {
	pub account_id: String,
	pub devices: Vec<RosterDevice>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MembersError {
	NotHosting,
	NotAnEmail,
	OwnAccount,
	AlreadyInvited,
	LimitReached,
	UnknownMember,
	UnknownInvitation,
	NotPending,
	NotJoined,
	NotNeedingInvitation,
	HostNotRemovable,
	NotOwner,
	NeedsSignIn,
	UnknownDevice,
	HostDeviceNotRemovable,
	#[serde(rename_all = "camelCase")]
	KeyNotRotated {
		reason: String,
	},
	#[serde(rename_all = "camelCase")]
	DeviceKeys {
		error: DeviceKeysError,
	},
	#[serde(rename_all = "camelCase")]
	Unreachable {
		reason: UnreachableReason,
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	SessionStore {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Space {
		error: SpaceError,
	},
	#[serde(rename_all = "camelCase")]
	RemovedButNotInvited {
		cause: Box<MembersError>,
	},
	#[serde(rename_all = "camelCase")]
	InvitedButNotListed {
		cause: Box<MembersError>,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UnreachableReason {
	#[serde(rename_all = "camelCase")]
	Transport {
		failure: TransportFailure,
	},
	#[serde(rename_all = "camelCase")]
	RelayStatus {
		status: u16,
	},
	#[serde(rename_all = "camelCase")]
	RelayConflict {
		code: String,
	},
	UnreadableList,
	#[serde(rename_all = "camelCase")]
	ListNotReadBack {
		cause: Box<UnreachableReason>,
	},
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TransportFailure {
	Offline,
	TimedOut,
	Unsent,
}

impl From<SpaceError> for MembersError {
	fn from(error: SpaceError) -> Self {
		MembersError::Space { error }
	}
}

impl From<MemberCallError> for MembersError {
	fn from(error: MemberCallError) -> Self {
		match error {
			MemberCallError::Revoked => MembersError::NeedsSignIn,
			MemberCallError::Forbidden => MembersError::NotOwner,
			MemberCallError::InvalidEmail => MembersError::NotAnEmail,
			MemberCallError::AlreadyMember => MembersError::AlreadyInvited,
			MemberCallError::LimitReached => MembersError::LimitReached,
			MemberCallError::UnknownMember => MembersError::UnknownMember,
			MemberCallError::UnknownInvitation => MembersError::UnknownInvitation,
			MemberCallError::OwnerNotRemovable => MembersError::HostNotRemovable,
			MemberCallError::Unreachable { reason, detail } => {
				MembersError::Unreachable { reason, detail }
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn a_change_crosses_with_the_space_and_its_state_tagged_on_kind() {
		let changed = HostingChanged {
			space_id: "personal".to_owned(),
			state: HostingState::Failed {
				failure: HostingFailureKind::TakenOverByAnotherHost,
				detail: "replaced".to_owned(),
			},
		};

		assert_eq!(
			to_value(changed).expect("the change serializes"),
			json!({
				"spaceId": "personal",
				"state": { "kind": "failed", "failure": "takenOverByAnotherHost", "detail": "replaced" }
			})
		);
		assert_eq!(
			to_value(HostingState::NeedsSignIn).expect("the state serializes"),
			json!({ "kind": "needsSignIn" })
		);
	}

	#[test]
	fn a_members_change_crosses_with_each_status_and_invitation_state_as_a_plain_name() {
		let changed = MembersChanged {
			space_id: "personal".to_owned(),
			members: vec![Member {
				user_id: "u1".to_owned(),
				name: None,
				email: "ada@example.com".to_owned(),
				status: MemberStatus::Pending,
			}],
			invitations: vec![SpaceInvitation {
				id: "i1".to_owned(),
				email: "bob@example.com".to_owned(),
				sent_at: "2026-10-01T00:00:00.000Z".to_owned(),
				expires_at: "2026-10-08T00:00:00.000Z".to_owned(),
				state: InvitationState::Expired,
			}],
		};

		assert_eq!(
			to_value(changed).expect("the change serializes"),
			json!({
				"spaceId": "personal",
				"members": [{ "userId": "u1", "name": null, "email": "ada@example.com", "status": "pending" }],
				"invitations": [{
					"id": "i1",
					"email": "bob@example.com",
					"sentAt": "2026-10-01T00:00:00.000Z",
					"expiresAt": "2026-10-08T00:00:00.000Z",
					"state": "expired"
				}]
			})
		);
	}

	#[test]
	fn an_unreachable_refusal_crosses_with_its_reason_tagged_on_kind_and_its_detail() {
		let relay_status = UnreachableReason::RelayStatus { status: 404 };
		for (reason, crossed) in [
			(
				UnreachableReason::Transport { failure: TransportFailure::Offline },
				json!({ "kind": "transport", "failure": "offline" }),
			),
			(
				UnreachableReason::Transport { failure: TransportFailure::TimedOut },
				json!({ "kind": "transport", "failure": "timedOut" }),
			),
			(
				UnreachableReason::Transport { failure: TransportFailure::Unsent },
				json!({ "kind": "transport", "failure": "unsent" }),
			),
			(relay_status.clone(), json!({ "kind": "relayStatus", "status": 404 })),
			(
				UnreachableReason::RelayConflict { code: "ALREADY_INVITED".to_owned() },
				json!({ "kind": "relayConflict", "code": "ALREADY_INVITED" }),
			),
			(UnreachableReason::UnreadableList, json!({ "kind": "unreadableList" })),
			(
				UnreachableReason::ListNotReadBack { cause: Box::new(relay_status) },
				json!({
					"kind": "listNotReadBack",
					"cause": { "kind": "relayStatus", "status": 404 }
				}),
			),
		] {
			assert_eq!(
				to_value(MembersError::Unreachable { reason, detail: "body".to_owned() })
					.expect("the refusal serializes"),
				json!({ "kind": "unreachable", "reason": crossed, "detail": "body" })
			);
		}
	}

	#[test]
	fn a_members_refusal_crosses_tagged_on_kind() {
		assert_eq!(
			to_value(MembersError::OwnAccount).expect("the refusal serializes"),
			json!({ "kind": "ownAccount" })
		);
		assert_eq!(
			to_value(MembersError::from(SpaceError::LastSpace)).expect("the refusal serializes"),
			json!({ "kind": "space", "error": { "kind": "lastSpace" } })
		);
		assert_eq!(
			to_value(MembersError::RemovedButNotInvited {
				cause: Box::new(MembersError::LimitReached)
			})
			.expect("the refusal serializes"),
			json!({ "kind": "removedButNotInvited", "cause": { "kind": "limitReached" } })
		);
		assert_eq!(
			to_value(MemberStatus::NeedsInvitation).expect("the status serializes"),
			json!("needsInvitation")
		);
	}
}
