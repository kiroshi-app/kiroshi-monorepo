mod common;

use std::collections::BTreeMap;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::terminate_session;
use kiroshi_app::agent::protocol::OauthCredentials;
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::environment::contract::{
	EnvOwner, EnvScope, Values, OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
	OAUTH_REASON, OAUTH_REDIRECT_URI, OAUTH_SERVER_URL,
};
use kiroshi_app::environment::store;
use kiroshi_app::mcp_oauth::commands::{mcp_oauth_connect, McpOauthState};
use kiroshi_app::mcp_oauth::contract::OauthError;
use kiroshi_app::mcp_oauth::credentials;
use kiroshi_app::mcp_oauth::reports::ApplicationReports;
use tauri::test::mock_builder;
use tauri::Manager;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

const HANDED_CLIENT_SETTLES: &str = "FAKE_AGENT_OAUTH_HANDED_CLIENT_SETTLES";

const REGISTRATION_SETTLES: &str = "FAKE_AGENT_OAUTH_REGISTRATION_SETTLES";

const AUTHORIZE_LOG: &str = "FAKE_AGENT_OAUTH_AUTHORIZE_LOG";

const STORED_FILE: &str = "FAKE_AGENT_OAUTH_STORED_FILE";

const EXCHANGE_MS: &str = "FAKE_AGENT_OAUTH_EXCHANGE_MS";

const URL: &str = "https://mcp.granola.test/mcp";

const HANDED_CLIENT: &str = "registered";

const HANDED_REDIRECT: &str = "http://127.0.0.1:53682/oauth/callback";

const HANDED: &str = "registered http://127.0.0.1:53682/oauth/callback";

const REGISTERED: &str = "-";

static ONE_SIDECAR_AT_A_TIME: Mutex<()> = Mutex::new(());

struct Connected {
	settled: Result<(), OauthError>,
	kept: Values,
	flows: Vec<String>,
	stored: serde_json::Value,
}

struct Staged {
	_one: MutexGuard<'static, ()>,
	app: AppOfItsOwn,
	root: PathBuf,
	scope: EnvScope,
	owner: EnvOwner,
	log: RemovedOnDrop,
	stored_file: RemovedOnDrop,
}

fn a_refused_grant() -> OauthCredentials {
	OauthCredentials {
		access_token: "held-access".to_owned(),
		refresh_token: Some("held-refresh".to_owned()),
		expires_at: Some(4_000_000_000_000),
		client_id: HANDED_CLIENT.to_owned(),
		client_secret: Some("confidential".to_owned()),
		redirect_uri: Some(HANDED_REDIRECT.to_owned()),
	}
}

fn connected_under(
	case: &str,
	handed_settles: &str,
	registration_settles: Option<&str>,
) -> Connected {
	connected_holding(case, &a_refused_grant(), Some(URL), handed_settles, registration_settles)
}

fn connected_holding(
	case: &str,
	held: &OauthCredentials,
	bound: Option<&str>,
	handed_settles: &str,
	registration_settles: Option<&str>,
) -> Connected {
	connected_from(&staged(case, held, bound, handed_settles, registration_settles))
}

fn a_temp_file(kind: &str, case: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-{kind}-{case}-{}", std::process::id())),
	);
	let _ = fs::remove_file(&path);
	path
}

fn staged(
	case: &str,
	held: &OauthCredentials,
	bound: Option<&str>,
	handed_settles: &str,
	registration_settles: Option<&str>,
) -> Staged {
	let one = ONE_SIDECAR_AT_A_TIME.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
	let log = a_temp_file("connect", case);
	let stored_file = a_temp_file("connect-stored", case);
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var(HANDED_CLIENT_SETTLES, handed_settles);
	std::env::set_var(AUTHORIZE_LOG, &*log);
	std::env::set_var(STORED_FILE, &*stored_file);
	std::env::remove_var(EXCHANGE_MS);
	match registration_settles {
		Some(settles) => std::env::set_var(REGISTRATION_SETTLES, settles),
		None => std::env::remove_var(REGISTRATION_SETTLES),
	}
	let app = an_app_of_its_own(
		&format!("application-connect-{case}"),
		mock_builder()
			.manage(AgentState::default())
			.manage(McpOauthState::default())
			.manage(ApplicationReports::default()),
	);
	let root = store::root(app.handle()).expect("the store root is named");
	let owner = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
	let scope = EnvScope::Server { name: "granola".to_owned(), owner: owner.clone() };
	credentials::store(&root, &scope, held).expect("the grant is written");
	if let Some(bound) = bound {
		credentials::bind(&root, &scope, bound).expect("the grant is bound");
	}
	credentials::forget_tokens(&root, &scope).expect("the tokens are deleted");
	credentials::remember_refusal(&root, &scope, "invalid_grant").expect("the reason is written");
	Staged { _one: one, app, root, scope, owner, log, stored_file }
}

fn connected_from(staged: &Staged) -> Connected {
	let Staged { app, root, scope, owner, log, stored_file, .. } = staged;
	let settled = tauri::async_runtime::block_on(async {
		let settled = mcp_oauth_connect(
			app.handle().clone(),
			owner.clone(),
			"granola".to_owned(),
			URL.to_owned(),
		)
		.await;
		let sidecar = app.state::<AgentState>().sidecar().await.expect("the sidecar runs");
		sidecar.checked(&Values::new()).await.expect("a later command is answered");
		settled
	});
	let kept = store::values(root, scope).expect("the scope is readable");
	tauri::async_runtime::block_on(terminate_session(
		app.handle(),
		app.state::<AgentState>().inner(),
	));
	let flows = fs::read_to_string(log).unwrap_or_default().lines().map(str::to_owned).collect();
	let stored = fs::read_to_string(stored_file)
		.ok()
		.and_then(|line| serde_json::from_str(&line).ok())
		.unwrap_or_default();
	Connected { settled, kept, flows, stored }
}

fn sealed(dir: &Path, mode: u32) {
	fs::set_permissions(dir, fs::Permissions::from_mode(mode)).expect("the mode is set");
}

fn bytes_under(dir: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
	fs::read_dir(dir)
		.expect("the scope directory is listed")
		.map(|entry| {
			let path = entry.expect("the entry is read").path();
			let bytes = fs::read(&path).expect("the stored file is read");
			(path, bytes)
		})
		.collect()
}

fn granted_anew() -> Values {
	Values::from([
		(OAUTH_ACCESS_TOKEN.to_owned(), "granted-anew".to_owned()),
		(OAUTH_CLIENT_ID.to_owned(), "registered-anew".to_owned()),
		(OAUTH_CLIENT_SECRET.to_owned(), "confidential-anew".to_owned()),
		(OAUTH_REDIRECT_URI.to_owned(), "http://127.0.0.1:61000/oauth/callback".to_owned()),
		(OAUTH_SERVER_URL.to_owned(), URL.to_owned()),
	])
}

fn flows(named: &[&str]) -> Vec<String> {
	named.iter().map(|flow| (*flow).to_owned()).collect()
}

#[test]
fn a_handed_client_settling_with_no_grant_is_followed_by_one_new_registration() {
	for (case, settles) in [
		("invalid-client", r#"{"kind":"rejected","code":"invalid_client"}"#),
		("timed-out", r#"{"kind":"timedOut"}"#),
		("failed", r#"{"kind":"failed","detail":"the flow broke"}"#),
		(
			"denied-client",
			r#"{"kind":"denied","detail":"unauthorized_client","code":"unauthorized_client"}"#,
		),
	] {
		let connected = connected_under(case, settles, None);

		assert_eq!(connected.settled, Ok(()), "{case}");
		assert_eq!(connected.kept, granted_anew(), "{case}");
		assert!(!connected.kept.contains_key(OAUTH_REASON), "{case}");
		assert_eq!(connected.flows, flows(&[HANDED, REGISTERED]), "{case}");
	}
}

#[test]
fn a_handed_client_cancelled_busy_or_denied_runs_no_second_flow() {
	for (case, settles) in [
		("cancelled", r#"{"kind":"cancelled"}"#),
		("busy", r#"{"kind":"busy"}"#),
		("denied", r#"{"kind":"denied","detail":"access_denied","code":"access_denied"}"#),
	] {
		let connected = connected_under(case, settles, None);

		assert!(connected.settled.is_err(), "{case}");
		assert_eq!(connected.flows, flows(&[HANDED]), "{case}");
		assert_eq!(
			connected.kept.get(OAUTH_CLIENT_ID).map(String::as_str),
			Some(HANDED_CLIENT),
			"{case}"
		);
		assert_eq!(
			connected.kept.get(OAUTH_REDIRECT_URI).map(String::as_str),
			Some(HANDED_REDIRECT),
			"{case}"
		);
	}
}

#[test]
fn a_new_registration_that_settles_with_no_grant_is_not_followed_by_another() {
	let connected = connected_under(
		"one-registration",
		r#"{"kind":"timedOut"}"#,
		Some(r#"{"kind":"timedOut"}"#),
	);

	assert_eq!(connected.settled, Err(OauthError::TimedOut));
	assert_eq!(connected.flows, flows(&[HANDED, REGISTERED]));
}

#[test]
fn a_stored_client_holding_no_redirect_uri_is_never_handed() {
	let unpaired = OauthCredentials { redirect_uri: None, ..a_refused_grant() };

	let connected =
		connected_holding("unpaired", &unpaired, Some(URL), r#"{"kind":"timedOut"}"#, None);

	assert_eq!(connected.settled, Ok(()));
	assert_eq!(connected.flows, flows(&[REGISTERED]));
	assert_eq!(connected.kept, granted_anew());
}

#[test]
fn a_stored_client_bound_to_another_url_is_never_handed() {
	let connected = connected_holding(
		"moved",
		&a_refused_grant(),
		Some("https://mcp.granola.test/elsewhere"),
		r#"{"kind":"timedOut"}"#,
		None,
	);

	assert_eq!(connected.settled, Ok(()));
	assert_eq!(connected.flows, flows(&[REGISTERED]));
	assert_eq!(connected.kept, granted_anew());
}

#[test]
fn a_stored_client_of_an_unbound_grant_is_never_handed() {
	let connected =
		connected_holding("unbound", &a_refused_grant(), None, r#"{"kind":"timedOut"}"#, None);

	assert_eq!(connected.settled, Ok(()));
	assert_eq!(connected.flows, flows(&[REGISTERED]));
	assert_eq!(connected.kept, granted_anew());
}

#[test]
fn a_stored_grant_tells_the_sidecar_it_was_stored() {
	let connected = connected_under("reported-stored", r#"{"kind":"timedOut"}"#, None);

	assert_eq!(connected.settled, Ok(()));
	assert_eq!(connected.stored, serde_json::json!({ "type": "mcp_oauth_stored", "stored": true }));
}

#[test]
fn a_grant_the_store_refuses_tells_the_sidecar_it_was_not_stored_and_why() {
	let staged =
		staged("reported-unstored", &a_refused_grant(), Some(URL), r#"{"kind":"timedOut"}"#, None);
	let scope_dir = staged.root.join("server").join("bot").join("b1").join("granola");
	sealed(&scope_dir, 0o500);

	let connected = connected_from(&staged);
	sealed(&scope_dir, 0o700);

	assert!(matches!(connected.settled, Err(OauthError::Store { .. })), "{:?}", connected.settled);
	assert_eq!(connected.stored["type"], "mcp_oauth_stored");
	assert_eq!(connected.stored["stored"], false);
	let detail = connected.stored["detail"].as_str().expect("the report names why");
	assert!(detail.starts_with("the grant could not be stored: "), "{detail}");
	assert!(!detail.contains("granted-anew"), "{detail}");
}

#[test]
fn a_connect_cancelled_during_the_exchange_leaves_the_store_untouched() {
	let staged = staged(
		"cancelled-mid-exchange",
		&a_refused_grant(),
		Some(URL),
		r#"{"kind":"cancelled"}"#,
		None,
	);
	std::env::set_var(EXCHANGE_MS, "300");
	let scope_dir = staged.root.join("server").join("bot").join("b1").join("granola");
	let before = bytes_under(&scope_dir);

	let connected = connected_from(&staged);

	assert_eq!(connected.settled, Err(OauthError::Cancelled));
	assert_eq!(bytes_under(&scope_dir), before);
	assert!(!connected.kept.contains_key(OAUTH_ACCESS_TOKEN));
	assert_eq!(connected.stored, serde_json::Value::Null);
	assert_eq!(connected.flows, flows(&[HANDED]));
}
