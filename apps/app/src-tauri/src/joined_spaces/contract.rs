use std::fmt;

use serde::{Deserialize, Serialize};

use crate::account::cloud::Cloud;
use crate::conversations::contract::StorageFailure;
use crate::db::repositories::joined_spaces::{self, JoinedReach};
use crate::db::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpace {
	pub id: String,
	pub host_url: String,
	pub remote_space_id: Option<String>,
	pub name: String,
	pub state: JoinedSpaceState,
	#[specta(optional)]
	pub wait: Option<JoinedSpaceWait>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum JoinedSpaceState {
	Online,
	WaitingForHost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum JoinedSpaceWaitReason {
	RelayUnreachable,
	RekeySendFailed,
	HostSilent,
	SocketClosed,
	RekeyNotVerified,
	NotMember,
	UnknownInstance,
	DeviceKeysUnreadable,
	DeviceAwaitingApproval,
	SocketUrlFailed,
	RosterMissing,
	KeychainReadFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceWait {
	pub reason: JoinedSpaceWaitReason,
	pub detail: String,
}

impl JoinedSpace {
	pub fn presented(
		joined: joined_spaces::JoinedSpace,
		cloud: &Cloud,
		wait: Option<JoinedSpaceWait>,
	) -> Self {
		let JoinedReach::Relay { instance_id } = joined.reach;
		let host_url = cloud.member_relay_url(&instance_id);
		let state = match wait {
			None => JoinedSpaceState::Online,
			Some(_) => JoinedSpaceState::WaitingForHost,
		};
		Self {
			id: joined.id,
			host_url,
			remote_space_id: joined.remote_space_id,
			name: joined.name,
			state,
			wait,
		}
	}
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceConnection {
	pub id: String,
	pub host_url: String,
	pub token: String,
	pub remote_space_id: Option<String>,
	pub name: String,
}

impl JoinedSpaceConnection {
	pub fn over(joined: joined_spaces::JoinedSpace, host_url: String, token: String) -> Self {
		Self {
			id: joined.id,
			host_url,
			token,
			remote_space_id: joined.remote_space_id,
			name: joined.name,
		}
	}
}

impl fmt::Debug for JoinedSpaceConnection {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter
			.debug_struct("JoinedSpaceConnection")
			.field("id", &self.id)
			.field("host_url", &self.host_url)
			.field("token", &"[redacted]")
			.field("remote_space_id", &self.remote_space_id)
			.field("name", &self.name)
			.finish()
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum JoinedSpaceError {
	#[serde(rename_all = "camelCase")]
	Unavailable {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Storage {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	UnknownJoinedSpace {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	Undeliverable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	HostOffline {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	ProxyUnavailable {
		detail: String,
	},
	OwnerNotRemovable,
	NeedsSignIn,
	SessionRevoked,
	#[serde(rename_all = "camelCase")]
	SessionStore {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RelayUnreachable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RelayRefused {
		detail: String,
	},
	InvitationExpired,
	InvitationWithdrawn,
	InvitationUsed,
	InvitationOtherEmail,
	#[serde(rename_all = "camelCase")]
	CouldNotAccept {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	NoInvitation {
		inviter_email: Option<String>,
	},
	NotInRoster,
	BadSignature,
	RemovedByRotation,
	#[serde(rename_all = "camelCase")]
	WaitingForHost {
		id: String,
		instance_id: String,
		reason: JoinedSpaceWaitReason,
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	KeyStore {
		detail: String,
	},
}

impl From<DatabaseError> for JoinedSpaceError {
	fn from(error: DatabaseError) -> Self {
		JoinedSpaceError::Storage { failure: (&error).into() }
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_debug_output_of_a_joined_space_connection_carries_no_token() {
		let connection = JoinedSpaceConnection {
			id: "a".to_owned(),
			host_url: "http://a.test".to_owned(),
			token: "the-secret-token".to_owned(),
			remote_space_id: None,
			name: "a.test".to_owned(),
		};

		let printed = format!("{connection:?}");

		assert!(!printed.contains("the-secret-token"));
		assert!(printed.contains("http://a.test"));
	}
}
