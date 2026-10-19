use serde::{Deserialize, Serialize};

use crate::account::cloud::InvitationCallError;

pub const CHANGED_EVENT: &str = "invitation://changed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Invitation {
	pub id: String,
	pub instance_id: String,
	pub instance_name: String,
	pub inviter_email: String,
	pub invited_at: String,
	pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct InvitationsChanged {
	pub invitations: Vec<Invitation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum InvitationError {
	NotSignedIn,
	#[serde(rename_all = "camelCase")]
	Offline {
		reason: String,
	},
	#[serde(rename_all = "camelCase")]
	ServersUnreachable {
		reason: String,
	},
	Withdrawn,
	UnknownInvitation,
	#[serde(rename_all = "camelCase")]
	Storage {
		detail: String,
	},
}

impl From<InvitationCallError> for InvitationError {
	fn from(error: InvitationCallError) -> Self {
		match error {
			InvitationCallError::Revoked => InvitationError::NotSignedIn,
			InvitationCallError::Offline(reason) => InvitationError::Offline { reason },
			InvitationCallError::Unreachable(reason) => {
				InvitationError::ServersUnreachable { reason }
			}
			InvitationCallError::Expired
			| InvitationCallError::Withdrawn
			| InvitationCallError::Used => InvitationError::Withdrawn,
			InvitationCallError::OtherEmail
			| InvitationCallError::Unknown
			| InvitationCallError::AlreadyJoined => InvitationError::UnknownInvitation,
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn an_invitation_refusal_crosses_tagged_on_kind() {
		assert_eq!(
			to_value(InvitationError::UnknownInvitation).expect("the refusal serializes"),
			json!({ "kind": "unknownInvitation" })
		);
		assert_eq!(
			to_value(InvitationError::Offline { reason: "no route".to_owned() })
				.expect("the refusal serializes"),
			json!({ "kind": "offline", "reason": "no route" })
		);
	}
}
