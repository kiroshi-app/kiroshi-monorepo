use serde::Serialize;

use crate::account::cloud::{CloudMember, MemberCallError, MemberRole, MembershipState};
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
		reason: String,
	},
	NeedsSignIn,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MembersChanged {
	pub space_id: String,
	pub members: Vec<Member>,
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
	NotPending,
	NotJoined,
	HostNotRemovable,
	NotOwner,
	NeedsSignIn,
	#[serde(rename_all = "camelCase")]
	Unreachable {
		reason: String,
	},
	#[serde(rename_all = "camelCase")]
	SessionStore {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Space {
		error: SpaceError,
	},
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
			MemberCallError::OwnerNotRemovable => MembersError::HostNotRemovable,
			MemberCallError::Unreachable(reason) => MembersError::Unreachable { reason },
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
			state: HostingState::Failed { reason: "replaced".to_owned() },
		};

		assert_eq!(
			to_value(changed).expect("the change serializes"),
			json!({ "spaceId": "personal", "state": { "kind": "failed", "reason": "replaced" } })
		);
		assert_eq!(
			to_value(HostingState::NeedsSignIn).expect("the state serializes"),
			json!({ "kind": "needsSignIn" })
		);
	}

	#[test]
	fn a_members_change_crosses_with_each_status_as_a_plain_name() {
		let changed = MembersChanged {
			space_id: "personal".to_owned(),
			members: vec![Member {
				user_id: "u1".to_owned(),
				name: None,
				email: "ada@example.com".to_owned(),
				status: MemberStatus::Pending,
			}],
		};

		assert_eq!(
			to_value(changed).expect("the change serializes"),
			json!({
				"spaceId": "personal",
				"members": [{ "userId": "u1", "name": null, "email": "ada@example.com", "status": "pending" }]
			})
		);
	}

	#[test]
	fn a_members_refusal_crosses_tagged_on_kind() {
		assert_eq!(
			to_value(MembersError::OwnAccount).expect("the refusal serializes"),
			json!({ "kind": "ownAccount" })
		);
		assert_eq!(
			to_value(MembersError::Unreachable { reason: "down".to_owned() })
				.expect("the refusal serializes"),
			json!({ "kind": "unreachable", "reason": "down" })
		);
		assert_eq!(
			to_value(MembersError::from(SpaceError::LastSpace)).expect("the refusal serializes"),
			json!({ "kind": "space", "error": { "kind": "lastSpace" } })
		);
	}
}
