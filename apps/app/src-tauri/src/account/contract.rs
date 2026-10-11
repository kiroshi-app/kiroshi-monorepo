use serde::{Deserialize, Serialize};

use crate::environment::contract::EnvError;

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
	LinkInvalid,
	ServerError,
	TimedOut,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AccountState {
	#[default]
	SignedOut,
	#[serde(rename_all = "camelCase")]
	Waiting {
		email: String,
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
	#[serde(rename_all = "camelCase")]
	Rejected {
		code: String,
	},
	SignedIn,
}

impl From<EnvError> for AccountError {
	fn from(error: EnvError) -> Self {
		AccountError::Store { detail: format!("{error:?}") }
	}
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
			to_value(AccountState::Failed { failure: AccountFailure::LinkInvalid })
				.expect("the state serializes"),
			json!({ "kind": "failed", "failure": "linkInvalid" })
		);
		assert_eq!(
			to_value(AccountState::Waiting { email: "steve@example.com".to_owned() })
				.expect("the state serializes"),
			json!({ "kind": "waiting", "email": "steve@example.com" })
		);
	}
}
