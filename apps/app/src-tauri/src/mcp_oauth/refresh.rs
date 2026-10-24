use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tokio::sync::Mutex;

use super::credentials::{self, ServedGrant};
use crate::agent::contract::TransportError;
use crate::agent::protocol::{Authorized, OauthCredentials, OauthFailure, RefreshRequest};
use crate::agent::sidecar::Sidecar;
use crate::agent::translate::now_ms;
use crate::bundles::{self, McpServer};
use crate::environment::contract::{
	EnvError, EnvOwner, EnvScope, Values, OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
	OAUTH_REDIRECT_URI, OAUTH_REFRESH_TOKEN,
};
use crate::environment::store;

const REFRESH_AHEAD_MS: i64 = 60_000;

const NO_REASON: &str = "no reason was given";

const NOT_STORED: &str = "the refreshed grant could not be stored";

type ServerUrls = BTreeMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Renewal {
	Renewed,
	Awaiting { reason: Option<String> },
}

pub type Renewals = BTreeMap<String, Renewal>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum Renewed {
	Granted {
		#[serde(rename = "accessToken")]
		access_token: String,
	},
	NeedsAuth,
	Unchanged,
}

enum Standing {
	Served,
	Expired,
	Refreshable(RefreshRequest),
}

enum Cost {
	Tokens,
	Everything,
}

static REFRESHING: Mutex<()> = Mutex::const_new(());

pub async fn before_open(
	root: &Path,
	owner: &EnvOwner,
	serving: &[PathBuf],
	sidecar: &Sidecar,
) -> BTreeSet<String> {
	let _refreshing = REFRESHING.lock().await;
	let exchange =
		move |request: RefreshRequest| async move { sidecar.refresh_oauth(&request).await };
	renewals(root, owner, &server_urls(serving), now_ms(), exchange).await.map_or_else(
		|error| {
			eprintln!("the grants served to this session could not be read: {error:?}");
			BTreeSet::new()
		},
		awaiting,
	)
}

pub async fn on_rejection<F, Exchanged>(
	root: &Path,
	owner: &EnvOwner,
	name: &str,
	servers: &[McpServer],
	exchange: F,
) -> Result<Renewed, EnvError>
where
	F: Fn(RefreshRequest) -> Exchanged,
	Exchanged: Future<Output = Result<Authorized, TransportError>>,
{
	let _refreshing = REFRESHING.lock().await;
	renewed_grant(root, owner, name, &declared_urls(servers), exchange).await
}

async fn renewed_grant<F, Exchanged>(
	root: &Path,
	owner: &EnvOwner,
	name: &str,
	urls: &ServerUrls,
	exchange: F,
) -> Result<Renewed, EnvError>
where
	F: Fn(RefreshRequest) -> Exchanged,
	Exchanged: Future<Output = Result<Authorized, TransportError>>,
{
	let (Some(url), Some(ServedGrant { scope, held })) =
		(urls.get(name), credentials::served(root, owner)?.remove(name))
	else {
		return Ok(Renewed::Unchanged);
	};
	if !held.contains_key(OAUTH_ACCESS_TOKEN) {
		return Ok(Renewed::Unchanged);
	}
	let Some(request) = refreshable(&held, url) else {
		return Ok(Renewed::NeedsAuth);
	};
	let answer = exchange(request).await;
	let granted = granted_token(&answer);
	Ok(match renewal(root, &scope, &held, answer) {
		Some(Renewal::Renewed) => {
			granted.map_or(Renewed::Unchanged, |access_token| Renewed::Granted { access_token })
		}
		Some(Renewal::Awaiting { .. }) => Renewed::NeedsAuth,
		None => Renewed::Unchanged,
	})
}

fn granted_token(answer: &Result<Authorized, TransportError>) -> Option<String> {
	Some(answer.as_ref().ok()?.credentials.as_ref()?.access_token.clone())
}

pub async fn before_reading<F, Exchanged>(
	root: &Path,
	owner: &EnvOwner,
	servers: &[McpServer],
	exchange: F,
) -> Result<Renewals, EnvError>
where
	F: Fn(RefreshRequest) -> Exchanged,
	Exchanged: Future<Output = Result<Authorized, TransportError>>,
{
	let _refreshing = REFRESHING.lock().await;
	renewals(root, owner, &declared_urls(servers), now_ms(), exchange).await
}

fn awaiting(renewals: Renewals) -> BTreeSet<String> {
	renewals
		.into_iter()
		.filter_map(|(name, renewal)| matches!(renewal, Renewal::Awaiting { .. }).then_some(name))
		.collect()
}

fn declared_urls(servers: &[McpServer]) -> ServerUrls {
	servers
		.iter()
		.filter_map(|server| Some((server.name.clone(), server.url()?.to_owned())))
		.collect()
}

fn server_urls(serving: &[PathBuf]) -> ServerUrls {
	serving
		.iter()
		.flat_map(|bundle| bundles::mcp_servers_at(bundle))
		.filter_map(|server| Some((server.name.clone(), server.url()?.to_owned())))
		.collect()
}

async fn renewals<F, Exchanged>(
	root: &Path,
	owner: &EnvOwner,
	urls: &ServerUrls,
	now: i64,
	exchange: F,
) -> Result<Renewals, EnvError>
where
	F: Fn(RefreshRequest) -> Exchanged,
	Exchanged: Future<Output = Result<Authorized, TransportError>>,
{
	let mut renewals = Renewals::new();
	for (name, ServedGrant { scope, held }) in credentials::served(root, owner)? {
		let Some(url) = urls.get(&name) else {
			continue;
		};
		let settled = match standing(&held, url, now) {
			Standing::Served => None,
			Standing::Expired => Some(Renewal::Awaiting { reason: None }),
			Standing::Refreshable(request) => renewal(root, &scope, &held, exchange(request).await),
		};
		if let Some(settled) = settled {
			renewals.insert(name, settled);
		}
	}
	Ok(renewals)
}

fn refreshable(held: &Values, url: &str) -> Option<RefreshRequest> {
	Some(RefreshRequest {
		url: url.to_owned(),
		refresh_token: held.get(OAUTH_REFRESH_TOKEN)?.clone(),
		client_id: held.get(OAUTH_CLIENT_ID).cloned(),
		client_secret: held.get(OAUTH_CLIENT_SECRET).cloned(),
	})
}

fn standing(held: &Values, url: &str, now: i64) -> Standing {
	if !held.contains_key(OAUTH_ACCESS_TOKEN) {
		return Standing::Served;
	}
	match (refreshable(held, url), credentials::expires_at(held)) {
		(Some(request), None) => Standing::Refreshable(request),
		(Some(request), Some(expires_at)) if expires_at <= now + REFRESH_AHEAD_MS => {
			Standing::Refreshable(request)
		}
		(None, Some(expires_at)) if expires_at <= now => Standing::Expired,
		_ => Standing::Served,
	}
}

fn renewal(
	root: &Path,
	scope: &EnvScope,
	sent: &Values,
	answer: Result<Authorized, TransportError>,
) -> Option<Renewal> {
	match answer {
		Ok(Authorized { credentials: Some(grant), .. }) => Some(stored(root, scope, sent, &grant)),
		Ok(Authorized { error, .. }) => refused(root, scope, sent, error),
		Err(error) => {
			eprintln!("the grant of {scope:?} was not refreshed: {error:?}");
			None
		}
	}
}

fn stored(root: &Path, scope: &EnvScope, sent: &Values, grant: &OauthCredentials) -> Renewal {
	let renewed = OauthCredentials {
		redirect_uri: sent.get(OAUTH_REDIRECT_URI).cloned(),
		refresh_token: grant
			.refresh_token
			.clone()
			.or_else(|| sent.get(OAUTH_REFRESH_TOKEN).cloned()),
		..grant.clone()
	};
	let Err(error) = credentials::store(root, scope, &renewed) else {
		return Renewal::Renewed;
	};
	let lost = credentials::scrubbed(format!("{NOT_STORED}: {error:?}"), sent);
	eprintln!("the refreshed grant of {scope:?} was lost: {lost}");
	Renewal::Awaiting { reason: Some(lost) }
}

fn cost_of(failure: &OauthFailure) -> Option<Cost> {
	if failure.refuses_the_grant() {
		return Some(Cost::Tokens);
	}
	failure.refuses_the_client().then_some(Cost::Everything)
}

fn refused(
	root: &Path,
	scope: &EnvScope,
	sent: &Values,
	failure: Option<OauthFailure>,
) -> Option<Renewal> {
	let cost = failure.as_ref().and_then(cost_of);
	let refusal = credentials::scrubbed(told(failure), sent);
	let Some(cost) = cost else {
		eprintln!("the grant of {scope:?} was not refreshed: {refusal}");
		return None;
	};
	eprintln!("the authorization server refused to refresh {scope:?}: {refusal}");
	match store::values(root, scope) {
		Ok(held) if held.get(OAUTH_REFRESH_TOKEN) == sent.get(OAUTH_REFRESH_TOKEN) => {
			paid(root, scope, cost, &refusal);
			Some(Renewal::Awaiting { reason: Some(refusal) })
		}
		Ok(_) => None,
		Err(error) => {
			eprintln!("the grant of {scope:?} could not be read again, so it stands: {error:?}");
			None
		}
	}
}

fn paid(root: &Path, scope: &EnvScope, cost: Cost, refusal: &str) {
	let forgotten = match cost {
		Cost::Tokens => credentials::forget_tokens(root, scope),
		Cost::Everything => credentials::forget(root, scope),
	};
	let remembered = forgotten.and_then(|()| credentials::remember_refusal(root, scope, refusal));
	if let Err(error) = remembered {
		eprintln!("the refusal of {scope:?} could not be written to the store: {error:?}");
	}
}

fn reason(detail: Option<String>) -> String {
	detail.unwrap_or_else(|| NO_REASON.to_owned())
}

fn told(failure: Option<OauthFailure>) -> String {
	let Some(failure) = failure else {
		return reason(None);
	};
	let detail = reason(failure.detail);
	match failure.body {
		Some(body) => format!("{detail}: {body}"),
		None => detail,
	}
}

#[cfg(test)]
mod tests {
	use std::cell::Cell;

	use super::*;
	use crate::agent::protocol::{OauthFailureKind, OauthStep};
	use crate::db::connection::fixture_root;
	use crate::environment::contract::{OAUTH_EXPIRES_AT, OAUTH_REASON};
	use crate::removed_on_drop::RemovedOnDrop;

	const NOW: i64 = 1_800_000_000_000;
	const REFUSED_DETAIL: &str = "the token endpoint answered 400: invalid_grant";
	const EXPIRED_ON: &str = "Refresh token expired on 2026-09-01";
	const URL: &str = "https://mcp.granola.test/mcp";
	const INVALID_GRANT: &str = "invalid_grant";
	const GRANT_NAMES: usize = 6;
	const REGISTERED_REDIRECT: &str = "http://127.0.0.1:53682/oauth/callback";

	async fn awaiting_authorization<F, Exchanged>(
		root: &Path,
		owner: &EnvOwner,
		urls: &ServerUrls,
		now: i64,
		exchange: F,
	) -> Result<BTreeSet<String>, EnvError>
	where
		F: Fn(RefreshRequest) -> Exchanged,
		Exchanged: Future<Output = Result<Authorized, TransportError>>,
	{
		renewals(root, owner, urls, now, exchange).await.map(awaiting)
	}

	fn a_root(name: &str) -> RemovedOnDrop {
		fixture_root(&format!("mcp-refresh-{name}"))
	}

	fn a_bot() -> EnvOwner {
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn granola() -> EnvScope {
		EnvScope::Server { name: "granola".to_owned(), owner: a_bot() }
	}

	fn declared() -> ServerUrls {
		[("granola".to_owned(), URL.to_owned())].into()
	}

	fn a_grant(expires_at: i64, refresh_token: Option<&str>) -> OauthCredentials {
		OauthCredentials {
			access_token: "held-access".to_owned(),
			refresh_token: refresh_token.map(str::to_owned),
			expires_at: Some(expires_at),
			client_id: "registered".to_owned(),
			client_secret: Some("confidential".to_owned()),
			redirect_uri: Some(REGISTERED_REDIRECT.to_owned()),
		}
	}

	fn rejected(body: Option<&str>) -> OauthFailure {
		OauthFailure {
			kind: OauthFailureKind::Rejected,
			detail: Some(REFUSED_DETAIL.to_owned()),
			step: Some(OauthStep::TokenExchange),
			status: Some(400),
			body: body.map(str::to_owned),
			code: Some(INVALID_GRANT.to_owned()),
		}
	}

	fn held(root: &Path) -> Values {
		store::values(root, &granola()).expect("the scope is readable")
	}

	fn answering(kind: OauthFailureKind, code: Option<&str>) -> Result<Authorized, TransportError> {
		Ok(Authorized {
			credentials: None,
			error: Some(OauthFailure {
				kind,
				detail: Some(format!("the token endpoint answered 400: {}", code.unwrap_or("-"))),
				step: None,
				status: None,
				body: None,
				code: code.map(str::to_owned),
			}),
		})
	}

	fn renewed() -> OauthCredentials {
		OauthCredentials {
			access_token: "renewed-access".to_owned(),
			refresh_token: Some("renewed-refresh".to_owned()),
			expires_at: Some(NOW + 3_600_000),
			client_id: "registered".to_owned(),
			client_secret: Some("confidential".to_owned()),
			redirect_uri: None,
		}
	}

	#[tokio::test]
	async fn a_refused_grant_deletes_the_tokens_and_keeps_the_client_and_the_reason() {
		let root = a_root("invalid-grant");
		store::set(&root, &granola(), "GRANOLA_REGION", "eu").expect("the name is written");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
			answering(OauthFailureKind::Rejected, Some(INVALID_GRANT))
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(awaiting, BTreeSet::from(["granola".to_owned()]));
		assert_eq!(
			held(&root),
			Values::from([
				("GRANOLA_REGION".to_owned(), "eu".to_owned()),
				(OAUTH_CLIENT_ID.to_owned(), "registered".to_owned()),
				(OAUTH_CLIENT_SECRET.to_owned(), "confidential".to_owned()),
				(OAUTH_REDIRECT_URI.to_owned(), REGISTERED_REDIRECT.to_owned()),
				(
					OAUTH_REASON.to_owned(),
					"the token endpoint answered 400: invalid_grant".to_owned()
				),
			])
		);
	}

	#[tokio::test]
	async fn a_refused_client_deletes_every_reserved_name_and_keeps_the_reason() {
		for code in ["invalid_client", "unauthorized_client"] {
			let root = a_root(code);
			store::set(&root, &granola(), "GRANOLA_REGION", "eu").expect("the name is written");
			credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
				.expect("the grant is written");

			let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
				answering(OauthFailureKind::Rejected, Some(code))
			})
			.await
			.expect("the pass reads the store");

			assert_eq!(awaiting, BTreeSet::from(["granola".to_owned()]));
			assert_eq!(
				held(&root),
				Values::from([
					("GRANOLA_REGION".to_owned(), "eu".to_owned()),
					(OAUTH_REASON.to_owned(), format!("the token endpoint answered 400: {code}")),
				])
			);
		}
	}

	#[tokio::test]
	async fn a_refusal_naming_another_code_leaves_the_six_names_as_they_stand() {
		let root = a_root("other-code");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");
		let before = held(&root);

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
			answering(OauthFailureKind::Failed, Some("temporarily_unavailable"))
		})
		.await
		.expect("the pass reads the store");

		assert!(awaiting.is_empty());
		assert_eq!(held(&root), before);
	}

	#[tokio::test]
	async fn a_stored_reason_reads_back_on_one_line_as_it_was_written() {
		let root = a_root("reason-one-line");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
			Ok(Authorized {
				credentials: None,
				error: Some(rejected(Some("the \"held-refresh\" token\nis gone \\ for good"))),
			})
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(
			held(&root).get(OAUTH_REASON).map(String::as_str),
			Some(
				format!("{REFUSED_DETAIL}: the \"[redacted]\" token is gone \\ for good").as_str()
			)
		);
	}

	#[tokio::test]
	async fn a_failed_refresh_leaves_the_six_names_as_they_stand() {
		let root = a_root("failed");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");
		let before = held(&root);

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
			answering(OauthFailureKind::Failed, None)
		})
		.await
		.expect("the pass reads the store");

		assert!(awaiting.is_empty());
		assert_eq!(held(&root), before);
		assert_eq!(before.len(), GRANT_NAMES);
	}

	#[tokio::test]
	async fn a_sidecar_that_never_answered_leaves_the_six_names_as_they_stand() {
		let root = a_root("transport");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");
		let before = held(&root);

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
			Err(TransportError::WriteFailed { detail: "the sidecar is gone".to_owned() })
		})
		.await
		.expect("the pass reads the store");

		assert!(awaiting.is_empty());
		assert_eq!(held(&root), before);
	}

	#[tokio::test]
	async fn a_granted_refresh_writes_over_the_six_names_it_carries() {
		let root = a_root("granted");
		credentials::store(&root, &granola(), &a_grant(NOW + 59_000, Some("held-refresh")))
			.expect("the grant is written");
		let asked = Cell::new(None);

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |request| {
			asked.set(Some(request));
			async { Ok(Authorized { credentials: Some(renewed()), error: None }) }
		})
		.await
		.expect("the pass reads the store");

		assert!(awaiting.is_empty());
		assert_eq!(
			asked.take(),
			Some(RefreshRequest {
				url: URL.to_owned(),
				refresh_token: "held-refresh".to_owned(),
				client_id: Some("registered".to_owned()),
				client_secret: Some("confidential".to_owned()),
			})
		);
		let kept = held(&root);
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("renewed-access"));
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN).map(String::as_str), Some("renewed-refresh"));
		let renewed_at = (NOW + 3_600_000).to_string();
		assert_eq!(kept.get(OAUTH_EXPIRES_AT), Some(&renewed_at));
		assert_eq!(kept.get(OAUTH_REDIRECT_URI).map(String::as_str), Some(REGISTERED_REDIRECT));
	}

	#[tokio::test]
	async fn an_expired_grant_holding_no_refresh_token_is_named_and_kept() {
		let root = a_root("expired");
		credentials::store(&root, &granola(), &a_grant(NOW, None)).expect("the grant is written");
		let before = held(&root);
		let asked = Cell::new(0);

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| {
			asked.set(asked.get() + 1);
			async { answering(OauthFailureKind::Rejected, Some(INVALID_GRANT)) }
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(awaiting, BTreeSet::from(["granola".to_owned()]));
		assert_eq!(held(&root), before);
		assert_eq!(asked.get(), 0);
	}

	#[tokio::test]
	async fn a_grant_expiring_beyond_the_minute_or_a_server_declaring_no_url_is_left_alone() {
		let root = a_root("left-alone");
		credentials::store(&root, &granola(), &a_grant(NOW + 61_000, Some("held-refresh")))
			.expect("the grant is written");
		let asked = Cell::new(0);
		let exchange = |_| {
			asked.set(asked.get() + 1);
			async { answering(OauthFailureKind::Rejected, Some(INVALID_GRANT)) }
		};

		let fresh = awaiting_authorization(&root, &a_bot(), &declared(), NOW, &exchange).await;
		let undeclared =
			awaiting_authorization(&root, &a_bot(), &ServerUrls::new(), NOW + 3_600_000, &exchange)
				.await;

		assert_eq!(fresh.expect("the pass reads the store"), BTreeSet::new());
		assert_eq!(undeclared.expect("the pass reads the store"), BTreeSet::new());
		assert_eq!(asked.get(), 0);
		assert_eq!(held(&root).len(), GRANT_NAMES);
	}

	fn granola_of_the_space() -> EnvScope {
		EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		}
	}

	#[tokio::test]
	async fn a_live_bot_grant_keeps_the_server_in_and_sends_no_refresh_for_the_space() {
		let root = a_root("space-shadowed");
		credentials::store(&root, &granola_of_the_space(), &a_grant(NOW, Some("space-refresh")))
			.expect("the space grant is written");
		credentials::store(&root, &granola(), &a_grant(NOW + 3_600_000, Some("held-refresh")))
			.expect("the bot grant is written");
		let space_before =
			store::values(&root, &granola_of_the_space()).expect("the scope is readable");
		let asked = Cell::new(0);

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| {
			asked.set(asked.get() + 1);
			async { answering(OauthFailureKind::Rejected, Some(INVALID_GRANT)) }
		})
		.await
		.expect("the pass reads the store");

		assert!(awaiting.is_empty());
		assert_eq!(asked.get(), 0);
		assert_eq!(
			store::values(&root, &granola_of_the_space()).expect("the scope is readable"),
			space_before
		);
	}

	#[tokio::test]
	async fn the_standing_is_read_from_the_served_bot_grant_and_not_the_live_space_one() {
		let root = a_root("bot-served");
		credentials::store(&root, &granola_of_the_space(), &a_grant(NOW + 3_600_000, None))
			.expect("the space grant is written");
		credentials::store(&root, &granola(), &a_grant(NOW, None))
			.expect("the bot grant is written");

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| async {
			answering(OauthFailureKind::Failed, None)
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(awaiting, BTreeSet::from(["granola".to_owned()]));
	}

	#[tokio::test]
	async fn a_refusal_leaves_a_grant_that_moved_under_the_refresh_as_it_stands() {
		let root = a_root("moved");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let awaiting = awaiting_authorization(&root, &a_bot(), &declared(), NOW, |_| {
			let connected = OauthCredentials {
				redirect_uri: Some(REGISTERED_REDIRECT.to_owned()),
				..renewed()
			};
			credentials::store(&root, &granola(), &connected).expect("a connect lands meanwhile");
			async { answering(OauthFailureKind::Rejected, Some(INVALID_GRANT)) }
		})
		.await
		.expect("the pass reads the store");

		assert!(awaiting.is_empty());
		let kept = held(&root);
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("renewed-access"));
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN).map(String::as_str), Some("renewed-refresh"));
		assert_eq!(kept.len(), GRANT_NAMES);
	}

	#[tokio::test]
	async fn a_refusal_names_the_server_awaiting_and_carries_the_reason_without_a_secret() {
		let root = a_root("refusal-reason");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |_| async {
			Ok(Authorized {
				credentials: None,
				error: Some(OauthFailure {
					kind: OauthFailureKind::Rejected,
					detail: Some(
						"held-refresh was revoked, held-access and confidential are void"
							.to_owned(),
					),
					step: None,
					status: None,
					body: None,
					code: Some(INVALID_GRANT.to_owned()),
				}),
			})
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(
			settled.get("granola"),
			Some(&Renewal::Awaiting {
				reason: Some(
					"[redacted] was revoked, [redacted] and [redacted] are void".to_owned()
				)
			})
		);
	}

	#[test]
	fn a_failure_that_is_no_rejection_is_told_with_its_body_after_its_detail() {
		let failure = |body: Option<&str>| {
			told(Some(OauthFailure {
				kind: OauthFailureKind::Failed,
				detail: Some("the token endpoint answered 503".to_owned()),
				step: None,
				status: Some(503),
				body: body.map(str::to_owned),
				code: None,
			}))
		};

		assert_eq!(
			failure(Some("the authority is down for maintenance")),
			"the token endpoint answered 503: the authority is down for maintenance"
		);
		assert_eq!(failure(None), "the token endpoint answered 503");
		assert_eq!(told(None), NO_REASON);
	}

	#[tokio::test]
	async fn a_rejection_carries_the_sentence_the_authority_wrote_after_its_detail() {
		let root = a_root("refusal-body");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |_| async {
			Ok(Authorized { credentials: None, error: Some(rejected(Some(EXPIRED_ON))) })
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(
			settled.get("granola"),
			Some(&Renewal::Awaiting { reason: Some(format!("{REFUSED_DETAIL}: {EXPIRED_ON}")) })
		);
	}

	#[tokio::test]
	async fn a_rejection_carrying_no_body_stores_the_detail_alone() {
		let root = a_root("refusal-no-body");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |_| async {
			Ok(Authorized { credentials: None, error: Some(rejected(None)) })
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(
			settled.get("granola"),
			Some(&Renewal::Awaiting { reason: Some(REFUSED_DETAIL.to_owned()) })
		);
	}

	#[tokio::test]
	async fn a_rejection_whose_body_names_the_refresh_token_sent_comes_out_redacted() {
		let root = a_root("refusal-body-secret");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |_| async {
			Ok(Authorized {
				credentials: None,
				error: Some(rejected(Some("held-refresh is no token of this client"))),
			})
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(
			settled.get("granola"),
			Some(&Renewal::Awaiting {
				reason: Some(format!("{REFUSED_DETAIL}: [redacted] is no token of this client"))
			})
		);
	}

	#[tokio::test]
	async fn a_granted_refresh_names_the_server_renewed() {
		let root = a_root("renewed-named");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |_| async {
			Ok(Authorized { credentials: Some(renewed()), error: None })
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(settled.get("granola"), Some(&Renewal::Renewed));
		assert!(awaiting(settled).is_empty());
	}

	fn a_grant_with_no_expiry(refresh_token: Option<&str>) -> OauthCredentials {
		OauthCredentials { expires_at: None, ..a_grant(NOW, refresh_token) }
	}

	#[tokio::test]
	async fn a_rejected_token_is_renewed_whatever_its_stored_expiry_says() {
		let root = a_root("rejected-live-expiry");
		credentials::store(&root, &granola(), &a_grant(NOW + 3_600_000, Some("held-refresh")))
			.expect("the grant is written");

		let renewed = renewed_grant(&root, &a_bot(), "granola", &declared(), |_| async {
			Ok(Authorized { credentials: Some(renewed()), error: None })
		})
		.await
		.expect("the renewal reads the store");

		assert_eq!(renewed, Renewed::Granted { access_token: "renewed-access".to_owned() });
		let kept = held(&root);
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("renewed-access"));
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN).map(String::as_str), Some("renewed-refresh"));
	}

	#[tokio::test]
	async fn a_renewed_grant_lands_in_the_scope_the_one_it_renewed_was_read_from() {
		let root = a_root("rejected-scope");
		credentials::store(&root, &granola_of_the_space(), &a_grant(NOW, Some("space-refresh")))
			.expect("the space grant is written");

		let renewed = renewed_grant(&root, &a_bot(), "granola", &declared(), |_| async {
			Ok(Authorized { credentials: Some(renewed()), error: None })
		})
		.await
		.expect("the renewal reads the store");

		assert_eq!(renewed, Renewed::Granted { access_token: "renewed-access".to_owned() });
		assert_eq!(
			store::values(&root, &granola_of_the_space())
				.expect("the scope is readable")
				.get(OAUTH_ACCESS_TOKEN)
				.map(String::as_str),
			Some("renewed-access")
		);
		assert!(held(&root).is_empty());
	}

	#[tokio::test]
	async fn a_token_response_naming_no_refresh_token_keeps_the_one_on_disk() {
		let root = a_root("kept-refresh");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");

		renewed_grant(&root, &a_bot(), "granola", &declared(), |_| async {
			Ok(Authorized {
				credentials: Some(OauthCredentials { refresh_token: None, ..renewed() }),
				error: None,
			})
		})
		.await
		.expect("the renewal reads the store");

		let kept = held(&root);
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("renewed-access"));
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN).map(String::as_str), Some("held-refresh"));
	}

	#[tokio::test]
	async fn a_rejected_token_holding_no_refresh_token_awaits_authorization() {
		let root = a_root("rejected-no-refresh");
		credentials::store(&root, &granola(), &a_grant_with_no_expiry(None))
			.expect("the grant is written");
		let before = held(&root);
		let asked = Cell::new(0);

		let renewed = renewed_grant(&root, &a_bot(), "granola", &declared(), |_| {
			asked.set(asked.get() + 1);
			async { Ok(Authorized { credentials: Some(renewed()), error: None }) }
		})
		.await
		.expect("the renewal reads the store");

		assert_eq!(renewed, Renewed::NeedsAuth);
		assert_eq!(asked.get(), 0);
		assert_eq!(held(&root), before);
	}

	#[tokio::test]
	async fn a_refused_renewal_awaits_authorization_and_forgets_the_tokens() {
		let root = a_root("rejected-refused");
		credentials::store(&root, &granola(), &a_grant(NOW + 3_600_000, Some("held-refresh")))
			.expect("the grant is written");

		let renewed = renewed_grant(&root, &a_bot(), "granola", &declared(), |_| async {
			answering(OauthFailureKind::Rejected, Some(INVALID_GRANT))
		})
		.await
		.expect("the renewal reads the store");

		assert_eq!(renewed, Renewed::NeedsAuth);
		let kept = held(&root);
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN), None);
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN), None);
		assert_eq!(
			kept.get(OAUTH_REASON).map(String::as_str),
			Some("the token endpoint answered 400: invalid_grant")
		);
	}

	#[tokio::test]
	async fn a_renewal_refused_for_another_reason_leaves_the_grant_and_the_server_as_they_stand() {
		let root = a_root("rejected-other");
		credentials::store(&root, &granola(), &a_grant(NOW + 3_600_000, Some("held-refresh")))
			.expect("the grant is written");
		let before = held(&root);

		let refused = renewed_grant(&root, &a_bot(), "granola", &declared(), |_| async {
			answering(OauthFailureKind::Failed, None)
		})
		.await
		.expect("the renewal reads the store");
		let gone = renewed_grant(&root, &a_bot(), "granola", &declared(), |_| async {
			Err(TransportError::WriteFailed { detail: "the sidecar is gone".to_owned() })
		})
		.await
		.expect("the renewal reads the store");

		assert_eq!((refused, gone), (Renewed::Unchanged, Renewed::Unchanged));
		assert_eq!(held(&root), before);
	}

	#[tokio::test]
	async fn a_server_the_store_holds_no_token_for_is_left_unchanged() {
		let root = a_root("rejected-nothing-held");
		credentials::store(&root, &granola(), &a_grant(NOW, Some("held-refresh")))
			.expect("the grant is written");
		credentials::forget_tokens(&root, &granola()).expect("the tokens are deleted");
		let asked = Cell::new(0);
		let exchange = |_| {
			asked.set(asked.get() + 1);
			async { Ok(Authorized { credentials: Some(renewed()), error: None }) }
		};

		let tokenless = renewed_grant(&root, &a_bot(), "granola", &declared(), &exchange).await;
		let undeclared =
			renewed_grant(&root, &a_bot(), "granola", &ServerUrls::new(), &exchange).await;
		let unknown = renewed_grant(&root, &a_bot(), "clock", &declared(), &exchange).await;

		assert_eq!(tokenless.expect("the renewal reads the store"), Renewed::Unchanged);
		assert_eq!(undeclared.expect("the renewal reads the store"), Renewed::Unchanged);
		assert_eq!(unknown.expect("the renewal reads the store"), Renewed::Unchanged);
		assert_eq!(asked.get(), 0);
	}

	#[tokio::test]
	async fn a_grant_holding_a_refresh_token_and_no_expiry_is_refreshed_when_a_session_opens() {
		let root = a_root("no-expiry-refreshable");
		credentials::store(&root, &granola(), &a_grant_with_no_expiry(Some("held-refresh")))
			.expect("the grant is written");
		let asked = Cell::new(None);

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |request| {
			asked.set(Some(request));
			async { Ok(Authorized { credentials: Some(renewed()), error: None }) }
		})
		.await
		.expect("the pass reads the store");

		assert_eq!(settled.get("granola"), Some(&Renewal::Renewed));
		assert_eq!(
			asked.take().map(|request| request.refresh_token),
			Some("held-refresh".to_owned())
		);
	}

	#[tokio::test]
	async fn a_grant_holding_no_refresh_token_and_no_expiry_stands_when_a_session_opens() {
		let root = a_root("no-expiry-served");
		credentials::store(&root, &granola(), &a_grant_with_no_expiry(None))
			.expect("the grant is written");
		let asked = Cell::new(0);

		let settled = renewals(&root, &a_bot(), &declared(), NOW, |_| {
			asked.set(asked.get() + 1);
			async { Ok(Authorized { credentials: Some(renewed()), error: None }) }
		})
		.await
		.expect("the pass reads the store");

		assert!(settled.is_empty());
		assert_eq!(asked.get(), 0);
	}

	#[test]
	fn the_url_of_a_server_is_read_from_the_bundles_serving_the_session() {
		let root = a_root("urls");
		let system = root.join("system");
		let bot = root.join("bot");
		let granola = serde_json::json!({ "url": "https://a" });
		bundles::set_mcp_server_at(&system, "granola", &granola, None)
			.expect("the server is declared");
		let mirrored = serde_json::json!({ "url": "https://b" });
		bundles::set_mcp_server_at(&bot, "granola", &mirrored, None)
			.expect("the server is declared");
		let clock = serde_json::json!({ "command": "run" });
		bundles::set_mcp_server_at(&bot, "clock", &clock, None).expect("the server is declared");

		assert_eq!(
			server_urls(&[system, bot]),
			ServerUrls::from([("granola".to_owned(), "https://b".to_owned())])
		);
	}
}
