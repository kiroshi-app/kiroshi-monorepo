use super::contract::OauthError;
use super::credentials;
use crate::bundles::AuthorizationWithheld;
use crate::environment::contract::Values;

const SCHEMES: [&str; 2] = ["http://", "https://"];

const URL_ENDS: [char; 4] = ['"', '\'', '<', '>'];

const QUERY_OR_FRAGMENT: [char; 2] = ['?', '#'];

#[derive(Clone, Copy)]
pub enum Step {
	ReadingTheDeclaredServer,
	CheckingTheServer,
	ClaimingTheState,
	WritingTheStoreRoot,
	ReadingTheStoredClient,
	ReachingTheSidecar,
	StartingTheFlow,
	OpeningTheFlow,
	HandingTheUrl,
	OpeningTheBrowser,
	SettlingTheFlow,
	AskingTheAuthorizationServer,
	HandingTheStoredClient,
	ReadingTheSettlement,
	StoringTheGrant,
}

impl Step {
	pub fn refused(self, error: OauthError) -> Refused {
		Refused { step: self, error }
	}

	fn named(self) -> &'static str {
		match self {
			Self::ReadingTheDeclaredServer => "the declared server could not be read",
			Self::CheckingTheServer => "kiroshi does not authorize that server",
			Self::ClaimingTheState => "the authorization state could not be claimed",
			Self::WritingTheStoreRoot => "the store root could not be written",
			Self::ReadingTheStoredClient => "the stored client could not be read",
			Self::ReachingTheSidecar => "the sidecar could not be reached",
			Self::StartingTheFlow => "the authorization flow did not start",
			Self::OpeningTheFlow => "the authorization flow did not open",
			Self::HandingTheUrl => "the authorization url may be handed to no browser",
			Self::OpeningTheBrowser => "the browser refused the authorization url",
			Self::SettlingTheFlow => "the authorization flow did not settle",
			Self::AskingTheAuthorizationServer => "the authorization server refused",
			Self::HandingTheStoredClient => {
				"the stored client was not granted, so a new one is registered"
			}
			Self::ReadingTheSettlement => "the settlement carried no grant",
			Self::StoringTheGrant => "the grant could not be stored",
		}
	}
}

pub fn withheld_reason(carries: AuthorizationWithheld) -> &'static str {
	match carries {
		AuthorizationWithheld::ServedOverNoUrl => "it is served over no url",
		AuthorizationWithheld::LoopbackAddress => "it is served on a loopback address",
		AuthorizationWithheld::OwnAuthorizationHeader => "it carries its own authorization header",
		AuthorizationWithheld::UnexpandedPlaceholder => "it carries an unexpanded placeholder",
	}
}

pub struct Refused {
	pub step: Step,
	pub error: OauthError,
}

pub fn refusal_line(refused: &Refused, held: &Values) -> String {
	let reason = credentials::scrubbed(reason(&refused.error), held);
	format!("{}: {}", refused.step.named(), urls_cut(&on_one_line(&reason)))
}

fn reason(error: &OauthError) -> String {
	match error {
		OauthError::AlreadyRunning => "a flow is already running".to_owned(),
		OauthError::Cancelled => "it was cancelled".to_owned(),
		OauthError::TimedOut => "it timed out".to_owned(),
		OauthError::Denied { detail } => detail.clone(),
		OauthError::Failed { detail, body, .. } => match body {
			Some(body) => format!("{detail}: {body}"),
			None => detail.clone(),
		},
		OauthError::BrowserRefused { url } | OauthError::RefusedUrl { url } => url.clone(),
		OauthError::NotAuthorizable { detail, .. } => detail.clone(),
		OauthError::FlowTimedOut { timeout_ms } => format!("no answer within {timeout_ms}ms"),
		OauthError::Transport { error } => format!("{error:?}"),
		OauthError::Store { error } => format!("{error:?}"),
		OauthError::RefusedToAMember => "the grant belongs to the host".to_owned(),
	}
}

pub fn on_one_line(reason: &str) -> String {
	reason.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn urls_cut(reason: &str) -> String {
	let lowered = reason.to_ascii_lowercase();
	let mut cut = String::with_capacity(reason.len());
	let mut read = 0;
	while let Some(at) = scheme_at(&lowered[read..]) {
		let starts = read + at;
		let ends = past_the_url(&reason[starts..]);
		cut.push_str(&reason[read..starts]);
		cut.push_str(url_cut(&reason[starts..starts + ends]));
		read = starts + ends;
	}
	cut.push_str(&reason[read..]);
	cut
}

fn scheme_at(lowered: &str) -> Option<usize> {
	SCHEMES.iter().filter_map(|scheme| lowered.find(scheme)).min()
}

fn past_the_url(from_the_url: &str) -> usize {
	from_the_url
		.find(|held: char| held.is_whitespace() || URL_ENDS.contains(&held))
		.unwrap_or(from_the_url.len())
}

fn url_cut(url: &str) -> &str {
	url.find(QUERY_OR_FRAGMENT).map_or(url, |at| &url[..at])
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;

	use super::*;
	use crate::agent::contract::TransportError;
	use crate::agent::protocol::OauthStep;
	use crate::environment::contract::{
		EnvError, OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN,
	};

	const EVERY_STEP: [Step; 11] = [
		Step::ClaimingTheState,
		Step::WritingTheStoreRoot,
		Step::ReachingTheSidecar,
		Step::StartingTheFlow,
		Step::OpeningTheFlow,
		Step::HandingTheUrl,
		Step::OpeningTheBrowser,
		Step::SettlingTheFlow,
		Step::AskingTheAuthorizationServer,
		Step::ReadingTheSettlement,
		Step::StoringTheGrant,
	];

	fn a_grant() -> Values {
		[
			(OAUTH_ACCESS_TOKEN.to_owned(), "held-access".to_owned()),
			(OAUTH_REFRESH_TOKEN.to_owned(), "held-refresh".to_owned()),
			(OAUTH_CLIENT_SECRET.to_owned(), "held-secret".to_owned()),
		]
		.into()
	}

	#[test]
	fn each_step_a_connect_can_be_refused_at_names_itself_and_no_other() {
		let named = EVERY_STEP.map(Step::named);

		assert_eq!(named.iter().collect::<BTreeSet<_>>().len(), EVERY_STEP.len());
		assert!(named.iter().all(|name| !name.is_empty()));
	}

	#[test]
	fn the_line_names_the_step_and_carries_the_reason_it_gave() {
		assert_eq!(
			refusal_line(
				&Step::ReachingTheSidecar
					.refused(OauthError::Transport { error: TransportError::NotStarted }),
				&Values::new()
			),
			"the sidecar could not be reached: NotStarted"
		);
		assert_eq!(
			refusal_line(
				&Step::ClaimingTheState.refused(OauthError::AlreadyRunning),
				&Values::new()
			),
			"the authorization state could not be claimed: a flow is already running"
		);
		assert_eq!(
			refusal_line(
				&Step::AskingTheAuthorizationServer
					.refused(OauthError::Denied { detail: "access_denied".to_owned() }),
				&Values::new()
			),
			"the authorization server refused: access_denied"
		);
		assert_eq!(
			refusal_line(
				&Step::SettlingTheFlow.refused(OauthError::FlowTimedOut { timeout_ms: 310_000 }),
				&Values::new()
			),
			"the authorization flow did not settle: no answer within 310000ms"
		);
		assert_eq!(
			refusal_line(
				&Step::StoringTheGrant.refused(OauthError::Store {
					error: EnvError::Unwritable { detail: "the disk is full".to_owned() }
				}),
				&Values::new()
			),
			"the grant could not be stored: Unwritable { detail: \"the disk is full\" }"
		);
	}

	#[test]
	fn the_line_names_no_value_of_the_grant_in_hand() {
		let line = refusal_line(
			&Step::StoringTheGrant.refused(OauthError::Failed {
				detail: "held-access, held-refresh and held-secret were refused".to_owned(),
				step: None,
				status: None,
				body: None,
			}),
			&a_grant(),
		);

		assert_eq!(
			line,
			"the grant could not be stored: [redacted], [redacted] and [redacted] were refused"
		);
	}

	#[test]
	fn the_line_cuts_every_url_at_the_end_of_its_path() {
		assert_eq!(
			refusal_line(
				&Step::OpeningTheBrowser.refused(OauthError::BrowserRefused {
					url: "https://authority.test/authorize?state=held-state&code=held-code"
						.to_owned()
				}),
				&Values::new()
			),
			"the browser refused the authorization url: https://authority.test/authorize"
		);
		assert_eq!(
			refusal_line(
				&Step::AskingTheAuthorizationServer.refused(OauthError::Failed {
					detail: "https://authority.test/token#held-fragment answered 400".to_owned(),
					step: None,
					status: None,
					body: None
				}),
				&Values::new()
			),
			"the authorization server refused: https://authority.test/token answered 400"
		);
	}

	#[test]
	fn the_line_writes_the_refused_body_after_the_reason_scrubbed_and_cut() {
		assert_eq!(
			refusal_line(
				&Step::AskingTheAuthorizationServer.refused(OauthError::Failed {
					detail: "the registration endpoint answered 403".to_owned(),
					step: Some(OauthStep::Registration),
					status: Some(403),
					body: Some(
						"held-secret was refused at https://authority.test/register?held=1"
							.to_owned()
					)
				}),
				&a_grant()
			),
			"the authorization server refused: the registration endpoint answered 403: \
			 [redacted] was refused at https://authority.test/register"
		);
	}

	#[test]
	fn the_line_holds_no_line_break_and_no_run_of_whitespace() {
		assert_eq!(
			refusal_line(
				&Step::StoringTheGrant.refused(OauthError::Failed {
					detail: "  the disk\n\trefused   the write\n".to_owned(),
					step: None,
					status: None,
					body: None
				}),
				&Values::new()
			),
			"the grant could not be stored: the disk refused the write"
		);
	}

	#[test]
	fn a_cut_url_keeps_the_text_that_follows_it() {
		assert_eq!(
			refusal_line(
				&Step::AskingTheAuthorizationServer.refused(OauthError::Failed {
					detail: "\"https://authority.test/token?code=held-code\" answered 400"
						.to_owned(),
					step: None,
					status: None,
					body: None
				}),
				&Values::new()
			),
			"the authorization server refused: \"https://authority.test/token\" answered 400"
		);
		assert_eq!(
			urls_cut("<HTTPS://Authority.test/a?held>and http://b.test/c#held>then"),
			"<HTTPS://Authority.test/a>and http://b.test/c>then"
		);
	}

	#[test]
	fn the_line_leaves_a_reason_naming_no_url_whole() {
		assert_eq!(
			refusal_line(
				&Step::HandingTheUrl
					.refused(OauthError::RefusedUrl { url: "javascript:alert(1)".to_owned() }),
				&Values::new()
			),
			"the authorization url may be handed to no browser: javascript:alert(1)"
		);
		assert_eq!(urls_cut("was it refused? it was"), "was it refused? it was");
	}
}
