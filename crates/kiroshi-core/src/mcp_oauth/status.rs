use serde::Serialize;

use super::credentials;
use super::reports::Standing;
use crate::environment::contract::{
	EnvScope, Values, OAUTH_ACCESS_TOKEN, OAUTH_REASON, OAUTH_REFRESH_TOKEN,
};
pub use crate::mcp_oauth::contract::ApplicationStatus;

const UNUSABLE_GRANT: &str =
	"the session could not use the stored authorization, which is still held";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationRow {
	pub name: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub scope: Option<EnvScope>,
	#[serde(flatten)]
	pub status: ApplicationStatus,
}

pub struct Evidence {
	pub is_authorizing: bool,
	pub refusal: Option<String>,
	pub reported: Option<Standing>,
	pub held: Values,
	pub asks_for_authorization: bool,
}

pub fn status(evidence: Evidence, now: i64) -> ApplicationStatus {
	if evidence.is_authorizing {
		return ApplicationStatus::Connecting;
	}
	if evidence.refusal.is_some() {
		return ApplicationStatus::NeedsAuthorization { reason: evidence.refusal };
	}
	if let Some(stored) = evidence.held.get(OAUTH_REASON) {
		return ApplicationStatus::NeedsAuthorization { reason: Some(stored.clone()) };
	}
	match evidence.reported {
		Some(Standing::Holding) => ApplicationStatus::Connected,
		Some(Standing::NeedsAuth { .. }) => needs_auth(&evidence.held, now),
		Some(Standing::LeftOut { .. }) if evidence.asks_for_authorization => {
			ApplicationStatus::NeedsAuthorization { reason: None }
		}
		Some(Standing::LeftOut { reason }) => ApplicationStatus::Failed {
			reason: reason.map(|reason| credentials::scrubbed(reason, &evidence.held)),
		},
		None => stored_status(&evidence.held, evidence.asks_for_authorization, now),
	}
}

pub fn reads_the_answer(evidence: &Evidence, now: i64) -> bool {
	!evidence.is_authorizing
		&& evidence.refusal.is_none()
		&& !evidence.held.contains_key(OAUTH_REASON)
		&& matches!(evidence.reported, None | Some(Standing::LeftOut { .. }))
		&& !holds_a_usable_grant(&evidence.held, now)
}

fn needs_auth(held: &Values, now: i64) -> ApplicationStatus {
	if !holds_a_usable_grant(held, now) {
		return ApplicationStatus::NeedsAuthorization { reason: None };
	}
	ApplicationStatus::Failed { reason: Some(UNUSABLE_GRANT.to_owned()) }
}

fn stored_status(held: &Values, asks_for_authorization: bool, now: i64) -> ApplicationStatus {
	match (holds_a_usable_grant(held, now), asks_for_authorization) {
		(true, _) => ApplicationStatus::Connected,
		(false, true) => ApplicationStatus::NeedsAuthorization { reason: None },
		(false, false) => ApplicationStatus::Unknown,
	}
}

fn holds_a_usable_grant(held: &Values, now: i64) -> bool {
	held.contains_key(OAUTH_ACCESS_TOKEN) && (is_live(held, now) || is_renewable(held))
}

fn is_live(held: &Values, now: i64) -> bool {
	credentials::expires_at(held).is_none_or(|expires_at| expires_at > now)
}

fn is_renewable(held: &Values) -> bool {
	held.get(OAUTH_REFRESH_TOKEN).is_some_and(|token| !token.is_empty())
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::environment::contract::{OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_EXPIRES_AT};

	const NOW: i64 = 1_800_000_000_000;
	const AWAITING: &str = "it is waiting for you to authorize it";
	const STORED_REASON: &str = "the token endpoint answered 400: invalid_grant";

	fn a_grant(expires_at: Option<i64>) -> Values {
		let mut held: Values = [
			(OAUTH_ACCESS_TOKEN.to_owned(), "held-access".to_owned()),
			(OAUTH_REFRESH_TOKEN.to_owned(), "held-refresh".to_owned()),
			(OAUTH_CLIENT_ID.to_owned(), "registered".to_owned()),
			(OAUTH_CLIENT_SECRET.to_owned(), "held-secret".to_owned()),
		]
		.into();
		if let Some(at) = expires_at {
			held.insert(OAUTH_EXPIRES_AT.to_owned(), at.to_string());
		}
		held
	}

	fn holding_no_refresh_token(expires_at: Option<i64>) -> Values {
		let mut held = a_grant(expires_at);
		held.insert(OAUTH_REFRESH_TOKEN.to_owned(), String::new());
		held
	}

	fn unreported(held: Values, asks_for_authorization: bool) -> Evidence {
		Evidence {
			is_authorizing: false,
			refusal: None,
			reported: None,
			held,
			asks_for_authorization,
		}
	}

	fn reported(standing: Standing) -> Evidence {
		Evidence {
			is_authorizing: false,
			refusal: None,
			reported: Some(standing),
			held: a_grant(Some(NOW + 1)),
			asks_for_authorization: false,
		}
	}

	const IT_DID_NOT_COME_UP: &str = "it read failed, stderr: connection refused";

	fn left_out_holding(held: Values) -> Evidence {
		Evidence {
			held,
			..reported(Standing::LeftOut { reason: Some(IT_DID_NOT_COME_UP.to_owned()) })
		}
	}

	#[test]
	fn a_running_flow_reads_as_connecting_over_every_other_answer() {
		let evidence =
			Evidence { is_authorizing: true, ..reported(Standing::NeedsAuth { reason: None }) };

		assert_eq!(status(evidence, NOW), ApplicationStatus::Connecting);
	}

	#[test]
	fn the_last_state_a_session_reported_decides_the_answer() {
		assert_eq!(status(reported(Standing::Holding), NOW), ApplicationStatus::Connected);
		assert_eq!(
			status(reported(Standing::LeftOut { reason: Some("it read failed".to_owned()) }), NOW),
			ApplicationStatus::Failed { reason: Some("it read failed".to_owned()) }
		);
		assert_eq!(
			status(reported(Standing::LeftOut { reason: None }), NOW),
			ApplicationStatus::Failed { reason: None }
		);
	}

	#[test]
	fn a_session_needing_authorization_reads_so_while_no_usable_grant_is_held() {
		let evidence = Evidence {
			held: Values::new(),
			..reported(Standing::NeedsAuth { reason: Some(AWAITING.to_owned()) })
		};

		assert_eq!(status(evidence, NOW), ApplicationStatus::NeedsAuthorization { reason: None });
	}

	#[test]
	fn a_session_needing_authorization_over_a_usable_grant_names_the_grant_it_could_not_use() {
		let live = reported(Standing::NeedsAuth { reason: Some(AWAITING.to_owned()) });
		let renewable = Evidence {
			held: a_grant(Some(NOW - 1)),
			..reported(Standing::NeedsAuth { reason: None })
		};
		let unusable = ApplicationStatus::Failed { reason: Some(UNUSABLE_GRANT.to_owned()) };

		assert_eq!(status(live, NOW), unusable);
		assert_eq!(status(renewable, NOW), unusable);
		assert!(UNUSABLE_GRANT.contains("stored authorization"));
		assert!(!UNUSABLE_GRANT.contains(AWAITING));
	}

	#[test]
	fn a_stored_reason_reads_as_needing_authorization_unless_the_pass_named_a_refusal() {
		let held = Values::from([
			(OAUTH_CLIENT_ID.to_owned(), "registered".to_owned()),
			(OAUTH_REASON.to_owned(), STORED_REASON.to_owned()),
		]);
		let stored = Evidence { held: held.clone(), ..reported(Standing::Holding) };
		let refused = Evidence {
			refusal: Some("refused on this pass".to_owned()),
			held,
			..reported(Standing::Holding)
		};

		assert_eq!(
			status(stored, NOW),
			ApplicationStatus::NeedsAuthorization { reason: Some(STORED_REASON.to_owned()) }
		);
		assert_eq!(
			status(refused, NOW),
			ApplicationStatus::NeedsAuthorization {
				reason: Some("refused on this pass".to_owned())
			}
		);
	}

	#[test]
	fn with_no_report_a_live_token_reads_as_connected() {
		assert_eq!(status(unreported(a_grant(None), true), NOW), ApplicationStatus::Connected);
		assert_eq!(
			status(unreported(a_grant(Some(NOW + 1)), false), NOW),
			ApplicationStatus::Connected
		);
	}

	#[test]
	fn with_no_report_an_expired_token_a_refresh_token_can_renew_reads_as_connected() {
		assert_eq!(status(unreported(a_grant(Some(NOW)), true), NOW), ApplicationStatus::Connected);
		assert_eq!(
			status(unreported(a_grant(Some(NOW - 86_400_000)), true), NOW),
			ApplicationStatus::Connected
		);
	}

	#[test]
	fn with_no_report_a_server_asking_for_authorization_and_holding_no_usable_grant_needs_it() {
		assert_eq!(
			status(unreported(Values::new(), true), NOW),
			ApplicationStatus::NeedsAuthorization { reason: None }
		);
		assert_eq!(
			status(unreported(holding_no_refresh_token(Some(NOW)), true), NOW),
			ApplicationStatus::NeedsAuthorization { reason: None }
		);
	}

	#[test]
	fn with_no_report_a_server_nothing_says_asks_for_authorization_is_unknown() {
		assert_eq!(status(unreported(Values::new(), false), NOW), ApplicationStatus::Unknown);
		assert_eq!(
			status(unreported(holding_no_refresh_token(Some(NOW)), false), NOW),
			ApplicationStatus::Unknown
		);
	}

	#[test]
	fn only_a_row_a_session_left_out_or_never_reported_reads_the_answer() {
		assert!(reads_the_answer(&unreported(Values::new(), false), NOW));
		assert!(reads_the_answer(&left_out_holding(Values::new()), NOW));

		let unread = [
			Evidence { is_authorizing: true, ..unreported(Values::new(), false) },
			Evidence {
				refusal: Some("invalid_grant".to_owned()),
				..unreported(Values::new(), false)
			},
			unreported(Values::from([(OAUTH_REASON.to_owned(), STORED_REASON.to_owned())]), false),
			unreported(a_grant(Some(NOW + 1)), false),
			left_out_holding(a_grant(Some(NOW - 1))),
			Evidence { held: Values::new(), ..reported(Standing::Holding) },
			Evidence { held: Values::new(), ..reported(Standing::NeedsAuth { reason: None }) },
		];
		for (each, evidence) in unread.iter().enumerate() {
			assert!(!reads_the_answer(evidence, NOW), "evidence {each}");
		}
	}

	#[test]
	fn a_server_a_session_left_out_answering_that_it_asks_for_authorization_needs_it() {
		let asking = Evidence { asks_for_authorization: true, ..left_out_holding(Values::new()) };

		assert_eq!(status(asking, NOW), ApplicationStatus::NeedsAuthorization { reason: None });
	}

	#[test]
	fn a_server_a_session_left_out_reads_failed_with_its_reason_whatever_grant_is_held() {
		let failed = ApplicationStatus::Failed { reason: Some(IT_DID_NOT_COME_UP.to_owned()) };

		assert_eq!(status(left_out_holding(Values::new()), NOW), failed);
		assert_eq!(status(left_out_holding(holding_no_refresh_token(Some(NOW))), NOW), failed);
		assert_eq!(status(left_out_holding(a_grant(Some(NOW + 1))), NOW), failed);
		assert_eq!(status(left_out_holding(a_grant(Some(NOW - 1))), NOW), failed);
	}

	#[test]
	fn a_refused_renewal_needs_authorization_and_carries_the_reason_over_every_stored_value() {
		let refused = Evidence {
			refusal: Some("invalid_grant".to_owned()),
			..unreported(a_grant(None), true)
		};

		assert_eq!(
			status(refused, NOW),
			ApplicationStatus::NeedsAuthorization { reason: Some("invalid_grant".to_owned()) }
		);
	}

	#[test]
	fn a_row_names_no_access_token_no_refresh_token_and_no_client_secret() {
		let quoting = Standing::LeftOut {
			reason: Some("it answered held-access, held-refresh and held-secret".to_owned()),
		};
		let rows = [
			ApplicationRow {
				name: "granola".to_owned(),
				scope: None,
				status: status(reported(quoting), NOW),
			},
			ApplicationRow {
				name: "notion".to_owned(),
				scope: None,
				status: status(unreported(a_grant(None), true), NOW),
			},
		];

		let crossed = serde_json::to_string(&rows).expect("the rows serialize");

		assert_eq!(
			serde_json::to_value(&rows[0]).expect("the row serializes"),
			serde_json::json!({
				"name": "granola",
				"status": "failed",
				"reason": "it answered [redacted], [redacted] and [redacted]"
			})
		);
		assert_eq!(
			serde_json::to_value(&rows[1]).expect("the row serializes"),
			serde_json::json!({ "name": "notion", "status": "connected" })
		);
		for secret in ["held-access", "held-refresh", "held-secret"] {
			assert!(!crossed.contains(secret));
		}
	}
}
