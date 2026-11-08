use kiroshi_core::applications::contract::Application;
use kiroshi_core::conversations::contract::McpServer;
use kiroshi_core::environment::contract::{EnvEntry, EnvOwner, EnvScope};
use kiroshi_rune_kit::surfaces::s11_applications::catalogue::{CatalogueEvent, Category};
use kiroshi_rune_kit::surfaces::s11_applications::install::InstallEvent;
use kiroshi_rune_kit::surfaces::s11_applications::panel::{
	ApplicationsEvent, Connection, ConnectionReason,
};
use kiroshi_rune_kit::surfaces::s11_applications::search::SEARCH_TEXT;
use kiroshi_rune_kit::surfaces::s11_applications::secrets::{Scope as SecretScope, SecretsEvent};
use serde_json::{Value, json};

use super::calls::{
	Answer, Call, Concealed, Found, InstallFailure, InstallOutcome, StatusRow, refusal_text,
};
use super::secrets::{Dialog, is_secret_name};
use super::{Notice, Scope, State, Which};
use crate::host::HostError;

const SPACE_ID: &str = "space-1";

fn agent_owner() -> EnvOwner {
	EnvOwner::Bot { id: "bot-1".to_owned(), space_id: SPACE_ID.to_owned() }
}

fn space_owner() -> EnvOwner {
	EnvOwner::Space { id: SPACE_ID.to_owned() }
}

fn opened() -> State {
	let mut state = State::default();
	state.opened(
		SPACE_ID.to_owned(),
		vec![
			Scope::new(Which::Agent, agent_owner(), "Rei".to_owned()),
			Scope::new(Which::Space, space_owner(), "Atlas".to_owned()),
			Scope::new(Which::Person, EnvOwner::User, String::new()),
		],
	);
	state.queued.clear();
	state
}

fn taken(state: &mut State) -> Vec<Call> {
	std::mem::take(&mut state.queued)
}

fn refused(body: Value) -> HostError {
	HostError::CommandFailed { command: "call".to_owned(), status: 500, body: body.to_string() }
}

fn application(name: &str, install: Value) -> Application {
	serde_json::from_value(json!({
		"name": name,
		"title": format!("{name} title"),
		"description": format!("Reads {name}"),
		"config": { "url": format!("https://{name}.example") },
		"install": install,
	}))
	.expect("an application")
}

fn server(name: &str) -> McpServer {
	serde_json::from_value(
		json!({ "name": name, "config": { "url": format!("https://{name}.example") } }),
	)
	.expect("a server")
}

fn entry(name: &str, defined_in: Value, served_from: Value) -> EnvEntry {
	serde_json::from_value(
		json!({ "name": name, "definedIn": defined_in, "servedFrom": served_from }),
	)
	.expect("an entry")
}

fn installed(state: &mut State, which: Which, names: &[&str]) {
	let servers = names.iter().map(|name| server(name)).collect();
	state.answered(Answer::Servers(which, Ok(servers)));
}

fn status(name: &str, status: &str) -> StatusRow {
	StatusRow { name: name.to_owned(), status: status.to_owned(), reason: None }
}

fn browsing(state: &mut State, which: Which, applications: Vec<Application>) {
	state.applications_event(which, ApplicationsEvent::Add);
	state.answered(Answer::Catalogue(Ok(applications)));
	let found = Found { applications: Vec::new(), registry_failure: None, is_stale: None };
	state.answered(Answer::Searched { generation: 0, found: Ok(found) });
	state.queued.clear();
}

fn panel(state: &State, which: Which) -> &super::Installed {
	&state.scope(which).expect("the scope").installed
}

#[test]
fn opening_reads_the_applications_status_and_secrets_of_each_scope() {
	let mut state = State::default();
	let scopes = vec![
		Scope::new(Which::Space, space_owner(), "Atlas".to_owned()),
		Scope::new(Which::Person, EnvOwner::User, String::new()),
	];
	state.opened(SPACE_ID.to_owned(), scopes);
	assert_eq!(
		taken(&mut state),
		vec![
			Call::ReadServers(Which::Space, space_owner()),
			Call::ReadStatus(Which::Space, space_owner()),
			Call::ReadSecrets(Which::Space, EnvScope::Space { id: SPACE_ID.to_owned() }),
			Call::ReadServers(Which::Person, EnvOwner::User),
			Call::ReadStatus(Which::Person, EnvOwner::User),
			Call::ReadSecrets(Which::Person, EnvScope::User),
		]
	);
}

#[test]
fn a_panel_loads_until_its_applications_land_with_their_connection_state() {
	let mut state = opened();
	assert!(panel(&state, Which::Space).is_loading());
	installed(&mut state, Which::Space, &["linear", "github"]);
	state.answered(Answer::Status(Which::Space, Ok(vec![status("linear", "connected")])));
	let rows = panel(&state, Which::Space).rows(&[], None, None);
	assert!(!panel(&state, Which::Space).is_loading());
	assert_eq!(rows.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(), ["linear", "github"]);
	assert_eq!(rows[0].connection, Some(Connection::Connected));
	assert_eq!(rows[1].connection, None);
	assert!(panel(&state, Which::Agent).is_loading());
}

#[test]
fn a_panel_whose_read_fails_shows_the_failure_and_never_an_empty_list() {
	let mut state = opened();
	state.answered(Answer::Servers(Which::Person, Err(refused(json!({ "kind": "unreadable" })))));
	assert!(panel(&state, Which::Person).has_failed());
	assert!(!panel(&state, Which::Person).is_loading());
}

#[test]
fn the_catalogue_loads_then_fails_with_a_retry_that_reads_again() {
	let mut state = opened();
	state.applications_event(Which::Space, ApplicationsEvent::Add);
	assert_eq!(
		taken(&mut state),
		vec![Call::ReadCatalogue, Call::Search { generation: 0, query: String::new() }]
	);
	let catalogue = state.catalogue.as_ref().expect("the catalogue");
	assert!(catalogue.is_loading());
	state.answered(Answer::Catalogue(Err(refused(json!({ "kind": "catalogueUnreadable" })))));
	state.answered(Answer::Searched { generation: 0, found: Err(refused(json!({}))) });
	let catalogue = state.catalogue.as_ref().expect("the catalogue");
	assert!(catalogue.has_failed());
	assert!(!catalogue.is_loading());
	assert_eq!(
		state.notice.as_ref().map(|(_, notice)| notice),
		Some(&Notice::CatalogueUnavailable)
	);
	state.queued.clear();
	state.catalogue_event(CatalogueEvent::Retry);
	assert_eq!(
		taken(&mut state),
		vec![Call::ReadCatalogue, Call::Search { generation: 1, query: String::new() }]
	);
	assert!(state.catalogue.as_ref().expect("the catalogue").is_loading());
}

#[test]
fn typing_in_the_catalogue_queries_the_core_and_drops_an_older_answer() {
	let mut state = opened();
	browsing(&mut state, Which::Space, Vec::new());
	let catalogue = state.catalogue.as_mut().expect("the catalogue");
	catalogue.query = rune::TextEdit::new("lin");
	state.typed();
	let catalogue = state.catalogue.as_mut().expect("the catalogue");
	catalogue.query = rune::TextEdit::new("linear");
	state.typed();
	state.typed();
	assert_eq!(
		taken(&mut state),
		vec![
			Call::Search { generation: 1, query: "lin".to_owned() },
			Call::Search { generation: 2, query: "linear".to_owned() },
		]
	);
	let stale = Found {
		applications: vec![application("lint", json!({ "kind": "nothing" }))],
		registry_failure: None,
		is_stale: None,
	};
	state.answered(Answer::Searched { generation: 1, found: Ok(stale) });
	assert!(state.catalogue.as_ref().expect("the catalogue").directory.is_empty());
	let current = Found {
		applications: vec![application("linear", json!({ "kind": "nothing" }))],
		registry_failure: None,
		is_stale: None,
	};
	state.answered(Answer::Searched { generation: 2, found: Ok(current) });
	let catalogue = state.catalogue.as_ref().expect("the catalogue");
	let shown: Vec<&str> = catalogue.visible(&[]).iter().map(|held| held.name.as_str()).collect();
	assert_eq!(shown, ["linear"]);
}

#[test]
fn the_catalogue_narrows_by_category_and_lists_title_matches_first() {
	let mut state = opened();
	let mut described = application("notes", json!({ "kind": "nothing" }));
	described.description = "Syncs linear issues".to_owned();
	let mut titled = application("linear", json!({ "kind": "nothing" }));
	titled.categories = vec!["Productivity".to_owned()];
	browsing(&mut state, Which::Space, vec![described, titled]);
	let catalogue = state.catalogue.as_mut().expect("the catalogue");
	catalogue.query = rune::TextEdit::new("LINEAR");
	let shown: Vec<String> = catalogue.visible(&[]).iter().map(|held| held.name.clone()).collect();
	assert_eq!(shown, ["linear", "notes"]);
	catalogue.category = Category::Productivity;
	let shown: Vec<String> = catalogue.visible(&[]).iter().map(|held| held.name.clone()).collect();
	assert_eq!(shown, ["linear"]);
	catalogue.category = Category::OnThisMachine;
	let shown: Vec<String> =
		catalogue.visible(&["notes".to_owned()]).iter().map(|held| held.name.clone()).collect();
	assert_eq!(shown, ["notes"]);
}

#[test]
fn installing_writes_in_the_chosen_scope_only_and_shows_it_installed_once_read() {
	let mut state = opened();
	installed(&mut state, Which::Space, &[]);
	browsing(&mut state, Which::Space, vec![application("linear", json!({ "kind": "nothing" }))]);
	state.catalogue_event(CatalogueEvent::Pick("linear".to_owned()));
	state.install_event(InstallEvent::Install);
	let calls = taken(&mut state);
	let [Call::Install(Which::Space, run)] = calls.as_slice() else {
		panic!("one install, got {calls:?}")
	};
	assert_eq!(run.owner, space_owner());
	assert_eq!(
		state.catalogue.as_ref().expect("the catalogue").installing.as_deref(),
		Some("linear")
	);
	state.install_event(InstallEvent::Install);
	assert!(taken(&mut state).is_empty());
	let outcome = InstallOutcome { refusal: None, rollback_refusal: None };
	state.answered(Answer::Installed { which: Which::Space, name: "linear".to_owned(), outcome });
	assert_eq!(
		taken(&mut state),
		vec![
			Call::ReadServers(Which::Space, space_owner()),
			Call::ReadStatus(Which::Space, space_owner())
		]
	);
	assert!(state.catalogue.as_ref().expect("the catalogue").installing.is_some());
	installed(&mut state, Which::Space, &["linear"]);
	assert!(state.catalogue.as_ref().expect("the catalogue").installing.is_none());
	assert!(panel(&state, Which::Space).declares("linear"));
	assert!(!panel(&state, Which::Agent).declares("linear"));
}

#[test]
fn a_refused_install_shows_the_refusal_and_its_rollback_notice() {
	let mut state = opened();
	installed(&mut state, Which::Agent, &[]);
	browsing(&mut state, Which::Agent, vec![application("linear", json!({ "kind": "nothing" }))]);
	state.catalogue_event(CatalogueEvent::Pick("linear".to_owned()));
	state.install_event(InstallEvent::Install);
	state.queued.clear();
	let outcome = InstallOutcome {
		refusal: Some(InstallFailure::Refused("npx is missing".to_owned())),
		rollback_refusal: Some("store: locked".to_owned()),
	};
	state.answered(Answer::Installed { which: Which::Agent, name: "linear".to_owned(), outcome });
	let catalogue = state.catalogue.as_ref().expect("the catalogue");
	assert_eq!(catalogue.failure, Some(InstallFailure::Refused("npx is missing".to_owned())));
	assert!(catalogue.installing.is_none());
	assert_eq!(
		state.notice.as_ref().map(|(_, notice)| notice),
		Some(&Notice::RolledBack {
			name: "linear title".to_owned(),
			reason: "store: locked".to_owned()
		})
	);
}

#[test]
fn a_refused_application_shows_its_reason_without_calling_the_core() {
	let mut state = opened();
	installed(&mut state, Which::Space, &[]);
	let refusal = json!({ "kind": "refused", "field": "command", "reason": "uvx is missing" });
	browsing(&mut state, Which::Space, vec![application("local", refusal)]);
	state.catalogue_event(CatalogueEvent::Pick("local".to_owned()));
	state.install_event(InstallEvent::Install);
	assert!(taken(&mut state).is_empty());
	let failure = state.catalogue.as_ref().and_then(|catalogue| catalogue.failure.clone());
	assert_eq!(failure, Some(InstallFailure::Refused("uvx is missing".to_owned())));
}

#[test]
fn a_key_is_asked_then_stored_as_a_secret_of_that_scope_and_never_printed() {
	let mut state = opened();
	installed(&mut state, Which::Person, &[]);
	let fields = json!({ "kind": "key", "fields": [{ "name": "API key", "secret": "LINEAR_KEY", "concealed": true }] });
	browsing(&mut state, Which::Person, vec![application("linear", fields)]);
	state.catalogue_event(CatalogueEvent::Pick("linear".to_owned()));
	state.install_event(InstallEvent::Install);
	assert!(taken(&mut state).is_empty());
	let failure = state.catalogue.as_ref().and_then(|catalogue| catalogue.failure.clone());
	assert_eq!(failure, Some(InstallFailure::Missing(vec!["API key".to_owned()])));
	*state.catalogue.as_mut().expect("the catalogue").key_mut(0) =
		rune::TextEdit::new("lin_secret_42");
	state.install_event(InstallEvent::Install);
	let calls = taken(&mut state);
	let [Call::Install(Which::Person, run)] = calls.as_slice() else {
		panic!("one install, got {calls:?}")
	};
	assert_eq!(run.owner, EnvOwner::User);
	assert_eq!(run.keys, vec![("LINEAR_KEY".to_owned(), Concealed("lin_secret_42".to_owned()))]);
	assert!(!format!("{calls:?}").contains("lin_secret_42"));
	assert!(state.catalogue.as_ref().expect("the catalogue").failure.is_none());
}

#[test]
fn revealing_a_key_field_toggles_only_that_field() {
	let mut state = opened();
	let fields = json!({ "kind": "key", "fields": [
		{ "name": "Key", "secret": "A_KEY", "concealed": true },
		{ "name": "Team", "secret": "A_TEAM", "concealed": false },
	] });
	browsing(&mut state, Which::Space, vec![application("linear", fields)]);
	state.catalogue_event(CatalogueEvent::Pick("linear".to_owned()));
	state.install_event(InstallEvent::Reveal(0));
	let picked =
		state.catalogue.as_ref().and_then(|catalogue| catalogue.picked.as_ref()).expect("picked");
	assert_eq!(picked.revealed, [true, false]);
}

#[test]
fn connect_shows_connecting_can_be_cancelled_and_settles_on_the_core_answer() {
	let mut state = opened();
	installed(&mut state, Which::Space, &["linear"]);
	state.applications_event(Which::Space, ApplicationsEvent::Connect("linear".to_owned()));
	assert_eq!(
		taken(&mut state),
		vec![Call::Connect {
			which: Which::Space,
			owner: space_owner(),
			name: "linear".to_owned(),
			url: "https://linear.example".to_owned(),
		}]
	);
	let rows = panel(&state, Which::Space).rows(&[], Some("linear"), None);
	assert_eq!(rows[0].connection, Some(Connection::Connecting));
	assert!(state.escape());
	assert_eq!(taken(&mut state), vec![Call::CancelConnect]);
	let cancelled = refused(json!({ "kind": "cancelled" }));
	state.answered(Answer::Connected {
		which: Which::Space,
		name: "linear".to_owned(),
		outcome: Err(cancelled),
	});
	assert!(state.connecting.is_none());
	assert!(state.connect_failure.is_none());
	assert_eq!(
		taken(&mut state),
		vec![
			Call::ReadServers(Which::Space, space_owner()),
			Call::ReadStatus(Which::Space, space_owner())
		]
	);
}

#[test]
fn a_failed_connection_shows_its_reason_on_the_row() {
	let mut state = opened();
	installed(&mut state, Which::Space, &["linear"]);
	state.applications_event(Which::Space, ApplicationsEvent::Connect("linear".to_owned()));
	let timed_out = refused(json!({ "kind": "flowTimedOut", "timeoutMs": 1 }));
	state.answered(Answer::Connected {
		which: Which::Space,
		name: "linear".to_owned(),
		outcome: Err(timed_out),
	});
	let failure = state.connect_failure.as_ref().map(|(_, failure)| failure);
	let rows = panel(&state, Which::Space).rows(&[], None, failure);
	assert_eq!(rows[0].connection, Some(Connection::Failed));
	assert_eq!(rows[0].reason, Some(ConnectionReason::TimedOut));
	state.applications_event(Which::Space, ApplicationsEvent::Connect("linear".to_owned()));
	state.answered(Answer::Connected {
		which: Which::Space,
		name: "linear".to_owned(),
		outcome: Ok(()),
	});
	assert!(state.connect_failure.is_none());
}

#[test]
fn an_unknown_refusal_reads_its_detail() {
	let mut state = opened();
	installed(&mut state, Which::Space, &["linear"]);
	state.applications_event(Which::Space, ApplicationsEvent::Connect("linear".to_owned()));
	let denied = refused(json!({ "kind": "denied", "detail": "access_denied" }));
	state.answered(Answer::Connected {
		which: Which::Space,
		name: "linear".to_owned(),
		outcome: Err(denied),
	});
	let failure = state.connect_failure.as_ref().map(|(_, failure)| failure);
	let rows = panel(&state, Which::Space).rows(&[], None, failure);
	assert_eq!(rows[0].reason, Some(ConnectionReason::Unknown("denied: access_denied".to_owned())));
}

#[test]
fn a_refused_disconnect_keeps_the_row_and_raises_a_notice() {
	let mut state = opened();
	installed(&mut state, Which::Space, &["linear"]);
	state.disconnect(Which::Space, "linear".to_owned());
	assert_eq!(
		taken(&mut state),
		vec![Call::Disconnect {
			which: Which::Space,
			owner: space_owner(),
			name: "linear".to_owned(),
			url: "https://linear.example".to_owned(),
		}]
	);
	let outcome = Err(refused(json!({ "kind": "store" })));
	state.answered(Answer::Disconnected {
		which: Which::Space,
		name: "linear".to_owned(),
		outcome,
	});
	assert!(panel(&state, Which::Space).declares("linear"));
	assert_eq!(state.notice.as_ref().map(|(_, notice)| notice), Some(&Notice::Failed));
	assert!(taken(&mut state).contains(&Call::ReadStatus(Which::Space, space_owner())));
}

#[test]
fn removing_calls_the_core_and_keeps_the_row_with_a_notice_on_refusal() {
	let mut state = opened();
	installed(&mut state, Which::Agent, &["linear"]);
	state.remove(Which::Agent, "linear".to_owned());
	assert_eq!(
		taken(&mut state),
		vec![Call::Remove { which: Which::Agent, owner: agent_owner(), name: "linear".to_owned() }]
	);
	let outcome = Err(refused(json!({ "kind": "notFound" })));
	state.answered(Answer::Removed { which: Which::Agent, name: "linear".to_owned(), outcome });
	assert!(panel(&state, Which::Agent).declares("linear"));
	assert_eq!(state.notice.as_ref().map(|(_, notice)| notice), Some(&Notice::Failed));
	state.queued.clear();
	state.remove(Which::Agent, "linear".to_owned());
	state.answered(Answer::Removed {
		which: Which::Agent,
		name: "linear".to_owned(),
		outcome: Ok(()),
	});
	assert!(taken(&mut state).contains(&Call::ReadServers(Which::Agent, agent_owner())));
}

#[test]
fn secrets_list_by_name_with_their_loading_and_empty_states() {
	let mut state = opened();
	let secrets = &state.scope(Which::Space).expect("the scope").secrets;
	assert!(secrets.is_pending());
	let space = json!({ "kind": "space", "id": SPACE_ID });
	let user = json!({ "kind": "user" });
	let entries = vec![
		entry("API_KEY", space.clone(), space.clone()),
		entry("API_KEY", user.clone(), space.clone()),
		entry("TOKEN", user.clone(), user),
	];
	state.answered(Answer::Secrets(Which::Space, Ok(entries)));
	let rows = state.scope(Which::Space).expect("the scope").secrets.rows();
	assert_eq!(rows.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(), ["API_KEY", "TOKEN"]);
	assert_eq!(rows[0].overrides, Some(SecretScope::User));
	assert_eq!(rows[1].defined_in, SecretScope::User);
	state.answered(Answer::Secrets(Which::Person, Ok(Vec::new())));
	let empty = &state.scope(Which::Person).expect("the scope").secrets;
	assert!(!empty.is_pending());
	assert!(empty.rows().is_empty());
	state.answered(Answer::Secrets(Which::Agent, Err(refused(json!({ "kind": "unreadable" })))));
	assert!(state.scope(Which::Agent).expect("the scope").secrets.has_failed());
}

#[test]
fn a_secret_name_follows_the_rule_of_apps_app() {
	assert!(is_secret_name("API_KEY"));
	assert!(is_secret_name("_TOKEN2"));
	assert!(!is_secret_name("api_key"));
	assert!(!is_secret_name("2FA"));
	assert!(!is_secret_name("API-KEY"));
	assert!(!is_secret_name(""));
}

fn write_dialog(state: &State) -> &super::secrets::Write {
	match state.dialog.as_ref() {
		Some((_, Dialog::Write(write))) => write,
		_ => panic!("the write dialog is closed"),
	}
}

#[test]
fn adding_a_secret_refuses_a_bad_name_writes_through_env_set_and_closes_only_on_success() {
	let mut state = opened();
	state.secrets_event(Which::Space, SecretsEvent::Add);
	if let Some((_, Dialog::Write(write))) = state.dialog.as_mut() {
		write.name = rune::TextEdit::new("api key");
		write.value = rune::TextEdit::new("s3cret");
	}
	state.secrets_event(Which::Space, SecretsEvent::Save);
	assert!(write_dialog(&state).is_refused);
	assert!(taken(&mut state).is_empty());
	if let Some((_, Dialog::Write(write))) = state.dialog.as_mut() {
		write.name = rune::TextEdit::new("  API_KEY ");
	}
	state.secrets_event(Which::Space, SecretsEvent::Save);
	let scope = EnvScope::Space { id: SPACE_ID.to_owned() };
	assert_eq!(
		taken(&mut state),
		vec![Call::SetSecret {
			which: Which::Space,
			scope: scope.clone(),
			name: "API_KEY".to_owned(),
			value: Concealed("s3cret".to_owned()),
		}]
	);
	assert!(write_dialog(&state).is_writing);
	state.secrets_event(Which::Space, SecretsEvent::CloseWrite);
	assert!(state.dialog.is_some());
	state.answered(Answer::SecretSet {
		which: Which::Space,
		outcome: Err(refused(json!({ "kind": "invalidName" }))),
	});
	assert!(write_dialog(&state).has_failed);
	assert!(!write_dialog(&state).is_writing);
	assert_eq!(taken(&mut state), vec![Call::ReadSecrets(Which::Space, scope)]);
	state.secrets_event(Which::Space, SecretsEvent::Save);
	state.answered(Answer::SecretSet { which: Which::Space, outcome: Ok(()) });
	assert!(state.dialog.is_none());
}

#[test]
fn editing_a_secret_keeps_its_name() {
	let mut state = opened();
	state.secrets_event(Which::Person, SecretsEvent::Replace("TOKEN".to_owned()));
	assert_eq!(write_dialog(&state).replacing.as_deref(), Some("TOKEN"));
	assert_eq!(write_dialog(&state).name.text, "TOKEN");
}

#[test]
fn removing_a_secret_asks_first_and_keeps_the_row_when_refused() {
	let mut state = opened();
	state.secrets_event(Which::Agent, SecretsEvent::Remove("TOKEN".to_owned()));
	assert!(matches!(state.dialog, Some((Which::Agent, Dialog::Remove(_)))));
	assert!(taken(&mut state).is_empty());
	state.secrets_event(Which::Agent, SecretsEvent::ConfirmRemove);
	let scope = EnvScope::Bot { id: "bot-1".to_owned(), space_id: SPACE_ID.to_owned() };
	assert_eq!(
		taken(&mut state),
		vec![Call::DeleteSecret {
			which: Which::Agent,
			scope: scope.clone(),
			name: "TOKEN".to_owned()
		}]
	);
	state.answered(Answer::SecretDeleted {
		which: Which::Agent,
		outcome: Err(refused(json!({ "kind": "unwritable" }))),
	});
	let Some((_, Dialog::Remove(removal))) = state.dialog.as_ref() else {
		panic!("the question closed")
	};
	assert!(removal.has_failed);
	assert!(!removal.is_removing);
	state.secrets_event(Which::Agent, SecretsEvent::CancelRemove);
	assert!(state.dialog.is_none());
}

#[test]
fn escape_steps_back_from_the_install_page_then_the_catalogue() {
	let mut state = opened();
	browsing(&mut state, Which::Space, vec![application("linear", json!({ "kind": "nothing" }))]);
	state.catalogue_event(CatalogueEvent::Pick("linear".to_owned()));
	assert!(state.escape());
	assert!(state.catalogue.as_ref().is_some_and(|catalogue| catalogue.picked.is_none()));
	assert!(state.escape());
	assert!(state.catalogue.is_none());
	assert!(!state.escape());
}

#[test]
fn a_refusal_reads_as_its_kind_and_detail() {
	assert_eq!(
		refusal_text(&refused(json!({ "kind": "store", "detail": "locked" }))),
		"store: locked"
	);
	assert_eq!(refusal_text(&refused(json!({ "kind": "timedOut" }))), "timedOut");
}

#[test]
fn an_oauth_install_left_unconnected_shows_the_connection_state_and_stops_connecting() {
	let mut state = opened();
	installed(&mut state, Which::Space, &[]);
	browsing(&mut state, Which::Space, vec![application("linear", json!({ "kind": "oauth" }))]);
	state.catalogue_event(CatalogueEvent::Pick("linear".to_owned()));
	state.install_event(InstallEvent::Install);
	assert_eq!(state.connecting, Some((Which::Space, "linear".to_owned())));
	let outcome = InstallOutcome {
		refusal: Some(InstallFailure::Unconnected(Connection::NeedsAuthorization)),
		rollback_refusal: None,
	};
	state.answered(Answer::Installed { which: Which::Space, name: "linear".to_owned(), outcome });
	assert!(state.connecting.is_none());
	let failure = state.catalogue.as_ref().and_then(|catalogue| catalogue.failure.clone());
	assert_eq!(failure, Some(InstallFailure::Unconnected(Connection::NeedsAuthorization)));
}

fn shown_names(state: &State, which: Which) -> Vec<String> {
	let scope = state.scope(which).expect("the scope");
	super::view::shown_rows(state, scope).into_iter().map(|row| row.name).collect()
}

#[test]
fn the_panel_search_shows_the_typed_text_in_the_kit_style_and_filters_then_clears() {
	let mut state = opened();
	installed(&mut state, Which::Space, &["linear", "github"]);
	let typed = rune::TextEdit::new("LIN");
	state.scope_mut(Which::Space).expect("the scope").installed.query = typed;
	assert_eq!(shown_names(&state, Which::Space), ["linear"]);
	let scope = state.scope(Which::Space).expect("the scope");
	let rows = super::view::shown_rows(&state, scope);
	let shown: Vec<_> = rows.iter().map(super::view::panel_application).collect();
	let panel = super::view::panel_of(scope, &shown, kiroshi_rune_kit::strings::Language::En);
	assert_eq!(panel.query.text, "LIN");
	assert_eq!(panel.search_text, SEARCH_TEXT);
	assert_eq!(panel.applications.iter().map(|row| row.name).collect::<Vec<_>>(), ["linear"]);
	state.scope_mut(Which::Space).expect("the scope").installed.query = rune::TextEdit::new("");
	assert_eq!(shown_names(&state, Which::Space), ["linear", "github"]);
	let scope = state.scope(Which::Space).expect("the scope");
	assert_eq!(
		super::view::panel_of(scope, &[], kiroshi_rune_kit::strings::Language::En).query.text,
		""
	);
}
