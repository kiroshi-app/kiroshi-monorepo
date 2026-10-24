mod common;

use common::an_app_of_its_own;
use kiroshi_app::agent::commands::terminate_session;
use kiroshi_app::agent::protocol::OauthCredentials;
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::environment::contract::{EnvOwner, EnvScope, RESERVED_NAMES};
use kiroshi_app::environment::store;
use kiroshi_app::hosting::authorship::Caller;
use kiroshi_app::mcp_oauth::commands::{mcp_oauth_disconnect, McpOauthState};
use kiroshi_app::mcp_oauth::contract::Disconnected;
use kiroshi_app::mcp_oauth::credentials;
use kiroshi_app::mcp_oauth::reports::ApplicationReports;
use tauri::test::mock_builder;
use tauri::Manager;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

const URL: &str = "https://mcp.granola.test/mcp";

fn a_space_grant() -> OauthCredentials {
	OauthCredentials {
		access_token: "held-at-the-space".to_owned(),
		refresh_token: Some("renewable".to_owned()),
		expires_at: Some(4_000_000_000_000),
		client_id: "registered".to_owned(),
		client_secret: Some("confidential".to_owned()),
		redirect_uri: None,
	}
}

#[test]
fn a_bot_disconnect_revokes_and_deletes_the_grant_its_space_holds() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let app = an_app_of_its_own(
		"application-disconnect",
		mock_builder()
			.manage(AgentState::default())
			.manage(McpOauthState::default())
			.manage(ApplicationReports::default()),
	);
	let root = store::root(app.handle()).expect("the store root is named");
	let space = EnvScope::Server {
		name: "granola".to_owned(),
		owner: EnvOwner::Space { id: "s1".to_owned() },
	};
	credentials::store(&root, &space, &a_space_grant()).expect("the space grant is written");

	let settled = tauri::async_runtime::block_on(mcp_oauth_disconnect(
		app.handle().clone(),
		Caller::Host,
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		"granola".to_owned(),
		URL.to_owned(),
	));
	let kept = store::values(&root, &space).expect("the space scope is readable");
	tauri::async_runtime::block_on(terminate_session(
		app.handle(),
		app.state::<AgentState>().inner(),
	));
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);

	assert_eq!(settled, Ok(Disconnected { revoked: true, detail: None }));
	assert!(RESERVED_NAMES.iter().all(|name| !kept.contains_key(*name)));
}

#[test]
fn a_disconnect_of_a_scope_holding_a_client_and_no_token_deletes_every_reserved_name() {
	let app = an_app_of_its_own(
		"application-disconnect-client",
		mock_builder()
			.manage(AgentState::default())
			.manage(McpOauthState::default())
			.manage(ApplicationReports::default()),
	);
	let root = store::root(app.handle()).expect("the store root is named");
	let space = EnvScope::Server {
		name: "granola".to_owned(),
		owner: EnvOwner::Space { id: "s1".to_owned() },
	};
	credentials::store(&root, &space, &a_space_grant()).expect("the space grant is written");
	credentials::forget_tokens(&root, &space).expect("the tokens are deleted");
	credentials::remember_refusal(&root, &space, "invalid_grant").expect("the reason is written");

	let settled = tauri::async_runtime::block_on(mcp_oauth_disconnect(
		app.handle().clone(),
		Caller::Host,
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		"granola".to_owned(),
		URL.to_owned(),
	));
	let kept = store::values(&root, &space).expect("the space scope is readable");

	assert!(settled.is_ok());
	assert!(kept.is_empty());
}
