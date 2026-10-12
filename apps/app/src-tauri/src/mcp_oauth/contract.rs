use serde::Serialize;

use crate::agent::contract::TransportError;
use crate::agent::protocol::{OauthFailure, OauthFailureKind, OauthStep};
use crate::agent::sidecar::OauthFlowError;
use crate::bundles::AuthorizationWithheld;
use crate::environment::contract::EnvError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OauthError {
	AlreadyRunning,
	Cancelled,
	TimedOut,
	#[serde(rename_all = "camelCase")]
	Denied {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	BrowserRefused {
		url: String,
	},
	#[serde(rename_all = "camelCase")]
	NotAuthorizable {
		carries: AuthorizationWithheld,
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RefusedUrl {
		url: String,
	},
	#[serde(rename_all = "camelCase")]
	FlowTimedOut {
		timeout_ms: u64,
	},
	#[serde(rename_all = "camelCase")]
	Failed {
		detail: String,
		#[serde(skip_serializing_if = "Option::is_none")]
		step: Option<OauthStep>,
		#[serde(skip_serializing_if = "Option::is_none")]
		status: Option<u16>,
		#[serde(skip_serializing_if = "Option::is_none")]
		body: Option<String>,
	},
	#[serde(rename_all = "camelCase")]
	Transport {
		error: TransportError,
	},
	#[serde(rename_all = "camelCase")]
	Store {
		error: EnvError,
	},
	RefusedToAMember,
}

const NO_DETAIL: &str = "the authorization flow named no reason";

impl From<TransportError> for OauthError {
	fn from(error: TransportError) -> Self {
		Self::Transport { error }
	}
}

impl From<OauthFlowError> for OauthError {
	fn from(error: OauthFlowError) -> Self {
		match error {
			OauthFlowError::Outlasted { timeout_ms } => Self::FlowTimedOut { timeout_ms },
			OauthFlowError::Transport(error) => Self::Transport { error },
		}
	}
}

impl From<EnvError> for OauthError {
	fn from(error: EnvError) -> Self {
		Self::Store { error }
	}
}

impl From<OauthFailure> for OauthError {
	fn from(failure: OauthFailure) -> Self {
		let detail = || failure.detail.clone().unwrap_or_else(|| NO_DETAIL.to_owned());
		match failure.kind {
			OauthFailureKind::Cancelled => Self::Cancelled,
			OauthFailureKind::TimedOut => Self::TimedOut,
			OauthFailureKind::Denied => Self::Denied { detail: detail() },
			OauthFailureKind::Busy => Self::AlreadyRunning,
			OauthFailureKind::Rejected | OauthFailureKind::Failed => Self::Failed {
				detail: detail(),
				step: failure.step,
				status: failure.status,
				body: failure.body,
			},
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Disconnected {
	pub revoked: bool,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub detail: Option<String>,
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn a_refusal_to_a_member_crosses_with_the_kind_the_host_api_answers_403() {
		assert_eq!(
			to_value(OauthError::RefusedToAMember).expect("the error serializes"),
			json!({ "kind": crate::host_api::invoke::REFUSED_TO_A_MEMBER })
		);
	}

	#[test]
	fn a_refusal_of_a_second_flow_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(OauthError::AlreadyRunning).expect("the error serializes"),
			json!({ "kind": "alreadyRunning" })
		);
	}

	#[test]
	fn a_browser_that_would_not_open_crosses_with_the_url_the_person_needs() {
		assert_eq!(
			to_value(OauthError::BrowserRefused {
				url: "https://example.test/authorize".to_owned()
			})
			.expect("the error serializes"),
			json!({ "kind": "browserRefused", "url": "https://example.test/authorize" })
		);
	}

	#[test]
	fn a_url_no_browser_may_be_handed_crosses_with_the_url_that_was_refused() {
		assert_eq!(
			to_value(OauthError::RefusedUrl { url: "javascript:alert(1)".to_owned() })
				.expect("the error serializes"),
			json!({ "kind": "refusedUrl", "url": "javascript:alert(1)" })
		);
	}

	#[test]
	fn the_flow_deadline_and_a_sidecar_that_never_started_read_as_two_reasons() {
		let flow = to_value(OauthError::from(OauthFlowError::Outlasted { timeout_ms: 310_000 }))
			.expect("the error serializes");
		let never_started =
			to_value(OauthError::from(OauthFlowError::Transport(TransportError::StartupTimeout {
				timeout_ms: 310_000,
			})))
			.expect("the error serializes");

		assert_eq!(flow, json!({ "kind": "flowTimedOut", "timeoutMs": 310_000 }));
		assert_eq!(
			never_started,
			json!({
				"kind": "transport",
				"error": { "kind": "startupTimeout", "timeoutMs": 310_000 }
			})
		);
		assert_ne!(flow, never_started);
	}

	#[test]
	fn a_store_that_refused_the_write_carries_the_store_error_it_gave() {
		assert_eq!(
			to_value(OauthError::Store {
				error: EnvError::Unwritable { detail: "the disk is full".to_owned() }
			})
			.expect("the error serializes"),
			json!({
				"kind": "store",
				"error": { "kind": "unwritable", "detail": "the disk is full" }
			})
		);
	}

	#[test]
	fn every_failure_the_sidecar_names_becomes_a_kind_of_its_own() {
		let refused = |kind| {
			OauthError::from(OauthFailure {
				kind,
				detail: None,
				step: None,
				status: None,
				body: None,
				code: None,
			})
		};

		assert_eq!(refused(OauthFailureKind::Cancelled), OauthError::Cancelled);
		assert_eq!(refused(OauthFailureKind::TimedOut), OauthError::TimedOut);
		assert_eq!(refused(OauthFailureKind::Busy), OauthError::AlreadyRunning);
		assert_eq!(
			OauthError::from(OauthFailure {
				kind: OauthFailureKind::Denied,
				detail: Some("access_denied".to_owned()),
				step: None,
				status: None,
				body: None,
				code: None,
			}),
			OauthError::Denied { detail: "access_denied".to_owned() }
		);
	}

	#[test]
	fn a_refused_request_crosses_with_the_step_the_status_and_the_body_it_carried() {
		let failure: OauthFailure = serde_json::from_value(json!({
			"kind": "failed",
			"detail": "the registration endpoint answered 403",
			"step": "registration",
			"status": 403,
			"body": "Forbidden"
		}))
		.expect("the frame reads");

		assert_eq!(
			to_value(OauthError::from(failure)).expect("the error serializes"),
			json!({
				"kind": "failed",
				"detail": "the registration endpoint answered 403",
				"step": "registration",
				"status": 403,
				"body": "Forbidden"
			})
		);
	}

	#[test]
	fn a_step_the_app_knows_none_of_leaves_the_rest_of_the_failure_readable() {
		let failure: OauthFailure = serde_json::from_value(json!({
			"kind": "failed",
			"detail": "the introspection endpoint answered 418",
			"step": "introspection",
			"status": 418
		}))
		.expect("the frame reads");

		assert_eq!(
			to_value(OauthError::from(failure)).expect("the error serializes"),
			json!({
				"kind": "failed",
				"detail": "the introspection endpoint answered 418",
				"status": 418
			})
		);
	}

	#[test]
	fn a_failure_naming_no_refused_request_carries_no_step_and_no_status() {
		assert_eq!(
			to_value(OauthError::from(OauthFailure {
				kind: OauthFailureKind::Failed,
				detail: Some("no server url was named".to_owned()),
				step: None,
				status: None,
				body: None,
				code: None,
			}))
			.expect("the error serializes"),
			json!({ "kind": "failed", "detail": "no server url was named" })
		);
	}

	#[test]
	fn a_disconnect_that_revoked_nothing_says_why_without_naming_a_token() {
		assert_eq!(
			to_value(Disconnected {
				revoked: false,
				detail: Some(
					"the authorization server advertises no revocation endpoint".to_owned()
				)
			})
			.expect("the answer serializes"),
			json!({
				"revoked": false,
				"detail": "the authorization server advertises no revocation endpoint"
			})
		);
	}
}
