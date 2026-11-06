use serde::{Deserialize, Serialize};

use crate::environment::contract::EnvError;
use std::fmt;

use reqwest::StatusCode;

use crate::hosting::contract::{TransportFailure, UnreachableReason};

pub const CHANGED_EVENT: &str = "account://changed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KiroshiAccount {
	pub id: String,
	pub email: String,
	pub created_at: String,
	pub plan: Option<AccountPlan>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AccountPlan {
	Free,
	Pro,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AccountFailure {
	Expired,
	Cancelled,
	Unreachable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SignedOutReason {
	SignedOutOnSite,
	DeviceRevoked,
	DeviceRefused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AccountState {
	#[serde(rename_all = "camelCase")]
	SignedOut {
		reason: Option<SignedOutReason>,
	},
	#[serde(rename_all = "camelCase")]
	Waiting {
		verification_url: String,
		expires_at: String,
	},
	SignedIn(KiroshiAccount),
	#[serde(rename_all = "camelCase")]
	Unreachable {
		reason: String,
	},
	#[serde(rename_all = "camelCase")]
	Failed {
		failure: AccountFailure,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AccountError {
	#[serde(rename_all = "camelCase")]
	Store {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Listener {
		detail: String,
	},
	SignedIn,
}

impl From<EnvError> for AccountError {
	fn from(error: EnvError) -> Self {
		AccountError::Store { detail: format!("{error:?}") }
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceCallError {
	Revoked,
	Refused { status: StatusCode, code: Option<String> },
	Unreachable(String),
}

impl fmt::Display for DeviceCallError {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			DeviceCallError::Revoked => write!(formatter, "the relay refused the session (401)"),
			DeviceCallError::Refused { status, code } => {
				write!(formatter, "the relay answered {}", status.as_u16())?;
				match code {
					Some(code) => write!(formatter, " {code}"),
					None => write!(formatter, " with no readable code"),
				}
			}
			DeviceCallError::Unreachable(reason) => write!(formatter, "{reason}"),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemberCallError {
	Revoked,
	Forbidden,
	InvalidEmail,
	AlreadyMember,
	LimitReached,
	UnknownMember,
	UnknownInvitation,
	OwnerNotRemovable,
	Unreachable { reason: UnreachableReason, detail: String },
}

impl MemberCallError {
	pub fn unsent(detail: String) -> Self {
		MemberCallError::Unreachable {
			reason: UnreachableReason::Transport { failure: TransportFailure::Unsent },
			detail,
		}
	}

	pub fn unreadable_list(error: reqwest::Error) -> Self {
		MemberCallError::Unreachable {
			reason: UnreachableReason::UnreadableList,
			detail: error.without_url().to_string(),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InvitationCallError {
	Revoked,
	Offline(String),
	Unreachable(String),
	Expired,
	Withdrawn,
	Used,
	OtherEmail,
	Unknown,
	AlreadyJoined,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudMember {
	pub user_id: String,
	pub email: String,
	pub name: Option<String>,
	pub role: MemberRole,
	pub state: MembershipState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MemberRole {
	Owner,
	Member,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MembershipState {
	Joined,
	Pending,
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn a_signed_in_state_crosses_with_the_account_beside_its_kind() {
		let state = AccountState::SignedIn(KiroshiAccount {
			id: "u1".to_owned(),
			email: "steve@example.com".to_owned(),
			created_at: "2026-10-01T00:00:00.000Z".to_owned(),
			plan: Some(AccountPlan::Pro),
		});

		assert_eq!(
			to_value(state).expect("the state serializes"),
			json!({
				"kind": "signedIn",
				"id": "u1",
				"email": "steve@example.com",
				"createdAt": "2026-10-01T00:00:00.000Z",
				"plan": "pro"
			})
		);
	}

	#[test]
	fn an_account_without_a_plan_crosses_with_a_null_plan() {
		let state = AccountState::SignedIn(KiroshiAccount {
			id: "u1".to_owned(),
			email: "steve@example.com".to_owned(),
			created_at: "2026-10-01T00:00:00.000Z".to_owned(),
			plan: None,
		});

		assert_eq!(to_value(state).expect("the state serializes")["plan"], json!(null));
	}

	#[test]
	fn a_failed_state_names_its_failure_in_camel_case() {
		assert_eq!(
			to_value(AccountState::Failed { failure: AccountFailure::Expired })
				.expect("the state serializes"),
			json!({ "kind": "failed", "failure": "expired" })
		);
		assert_eq!(
			to_value(AccountState::Waiting {
				verification_url: "https://kiroshi.app/authorize?request=r1".to_owned(),
				expires_at: "2026-10-12T10:10:00.000Z".to_owned(),
			})
			.expect("the state serializes"),
			json!({
				"kind": "waiting",
				"verificationUrl": "https://kiroshi.app/authorize?request=r1",
				"expiresAt": "2026-10-12T10:10:00.000Z"
			})
		);
	}

	#[test]
	fn a_signed_out_state_carries_its_reason_or_null() {
		assert_eq!(
			to_value(AccountState::SignedOut { reason: None }).expect("the state serializes"),
			json!({ "kind": "signedOut", "reason": null })
		);
		assert_eq!(
			to_value(AccountState::SignedOut { reason: Some(SignedOutReason::SignedOutOnSite) })
				.expect("the state serializes"),
			json!({ "kind": "signedOut", "reason": "signedOutOnSite" })
		);
		assert_eq!(
			to_value(AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRevoked) })
				.expect("the state serializes"),
			json!({ "kind": "signedOut", "reason": "deviceRevoked" })
		);
		assert_eq!(
			to_value(AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRefused) })
				.expect("the state serializes"),
			json!({ "kind": "signedOut", "reason": "deviceRefused" })
		);
	}
}
