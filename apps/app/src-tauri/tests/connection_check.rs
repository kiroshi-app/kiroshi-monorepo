#[path = "../src/removed_on_drop.rs"]
mod removed_on_drop;

use kiroshi_app::agent::commands::{account, check, terminate_session, ENV_UNREADABLE};
use kiroshi_app::agent::contract::{Account, CheckReport, ConnectionState, TransportError};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::environment::connection;
use kiroshi_app::environment::contract::ConnectionKind;
use removed_on_drop::RemovedOnDrop;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

fn runtime() -> tokio::runtime::Runtime {
	tokio::runtime::Runtime::new().expect("runtime")
}

fn not_a_sidecar() -> &'static str {
	concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml")
}

#[test]
fn a_signed_in_check_crosses_no_identity() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;
		let crossed = serde_json::to_string(&report).expect("the report serializes");

		assert_eq!(report.connection, ConnectionState::Ready);
		assert!(report.authenticated);
		assert!(!crossed.contains('@'), "an email reached the check report: {crossed}");
		assert!(!crossed.contains("account"), "an account reached the check report: {crossed}");

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_signed_in_account_read_names_the_account_the_sidecar_named() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);

	let state = AgentState::default();
	runtime().block_on(async {
		let read = account(&state, None).await;

		assert_eq!(read.report, check(&state, None).await);
		assert_eq!(
			read.account,
			Some(Account {
				email: Some("bean@example.test".to_owned()),
				plan: Some("max".to_owned()),
			})
		);

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn an_account_read_naming_no_account_crosses_a_null_account() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SIGNED_OUT", "1");

	let state = AgentState::default();
	runtime().block_on(async {
		let read = account(&state, None).await;
		let crossed = serde_json::to_value(&read).expect("the account read serializes");

		assert_eq!(read.account, None);
		assert_eq!(read.report.error, Some(TransportError::NotAuthenticated));
		assert_eq!(crossed.get("account"), Some(&serde_json::Value::Null));
		assert_eq!(crossed.get("authenticated"), Some(&serde_json::Value::Bool(false)));

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var("FAKE_AGENT_SIGNED_OUT");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_signed_out_install_is_reported_as_a_sign_in_and_not_as_a_missing_sidecar() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SIGNED_OUT", "1");

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		assert!(!report.authenticated);
		assert_eq!(report.error, Some(TransportError::NotAuthenticated));
		assert_eq!(
			report.binary_version.as_deref(),
			Some("2.0.0-fake"),
			"a sidecar that answered was reported as one that never spoke"
		);

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var("FAKE_AGENT_SIGNED_OUT");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_host_with_no_sidecar_reports_neither_a_version_nor_a_sign_in() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, not_a_sidecar());

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		assert!(!report.authenticated);
		assert_eq!(report.binary_version, None, "a host with nothing to ask reported a version");
		assert!(
			!matches!(report.error, Some(TransportError::NotAuthenticated)),
			"a missing sidecar was reported as a sign-in: {:?}",
			report.error
		);
		assert!(report.error.is_some(), "a host with nothing to ask reported no failure");

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_sidecar_that_died_before_ready_is_reported_with_what_it_wrote() {
	let _serial = serial();
	let motive = "the bundled runtime is not installed";
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_STARTUP_STDERR", motive);

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		let Some(TransportError::Crashed { detail, .. }) = report.error else {
			panic!("a sidecar that died before ready was not reported as a crash");
		};
		let detail = detail.expect("the crash named no detail");
		assert!(
			detail.starts_with("the sidecar exited during startup"),
			"the startup failure was replaced: {detail}"
		);
		assert!(detail.contains(motive), "what the sidecar wrote was dropped: {detail}");

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var("FAKE_AGENT_STARTUP_STDERR");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_sidecar_that_died_before_ready_is_reported_with_its_exit_code() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_STARTUP_STDERR", "refusing to start");

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;

		assert_eq!(
			report.error,
			Some(TransportError::Crashed {
				code: Some(70),
				detail: Some("the sidecar exited during startup: refusing to start".into()),
			})
		);

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var("FAKE_AGENT_STARTUP_STDERR");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[cfg(unix)]
#[test]
fn a_sidecar_the_system_killed_at_launch_is_reported_with_the_signal() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_STARTUP_SIGKILL", "1");

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;

		assert_eq!(
			report.error,
			Some(TransportError::Crashed {
				code: None,
				detail: Some("the sidecar exited during startup: killed by signal 9".into()),
			})
		);

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var("FAKE_AGENT_STARTUP_SIGKILL");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_probe_that_could_not_run_is_reported_apart_from_a_refusal() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_CHECK_FAILS", "the credential store is unreadable");

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state, None).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		assert!(matches!(report.error, Some(TransportError::AuthCheckFailed { .. })));

		terminate_session(tauri::test::mock_app().handle(), &state).await;
	});

	std::env::remove_var("FAKE_AGENT_CHECK_FAILS");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

fn a_root(name: &str) -> RemovedOnDrop {
	let root = RemovedOnDrop(
		std::env::temp_dir()
			.join(format!("kiroshi-connection-check-{name}-{}", std::process::id())),
	);
	let _ = std::fs::remove_dir_all(&root);
	root
}

fn reported_with(root: &std::path::Path) -> CheckReport {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let state = AgentState::default();
	let report = runtime().block_on(async {
		let report = check(&state, Some(root)).await;
		terminate_session(tauri::test::mock_app().handle(), &state).await;
		report
	});
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
	report
}

#[test]
fn a_stored_api_key_reaches_the_probe_and_the_method_it_names_reaches_the_report() {
	let root = a_root("api-key");
	connection::hold(&root, ConnectionKind::ApiKey, "sk-stored").expect("the key is stored");

	let report = reported_with(&root);

	assert!(report.authenticated);
	assert_eq!(report.auth_method.as_deref(), Some("api_key"));
	assert_eq!(
		serde_json::to_value(&report).expect("the report serializes")["authMethod"],
		serde_json::json!("api_key")
	);
}

#[test]
fn a_replacing_token_is_the_only_source_the_probe_sees() {
	let root = a_root("token");
	connection::hold(&root, ConnectionKind::ApiKey, "sk-stored").expect("the key is stored");
	connection::hold(&root, ConnectionKind::SubscriptionToken, "token")
		.expect("the token is stored");

	let report = reported_with(&root);

	assert_eq!(report.auth_method.as_deref(), Some("oauth_token"));
}

#[test]
fn a_probe_naming_no_method_leaves_it_absent_and_the_verdict_as_it_stands() {
	let root = a_root("none");
	connection::hold(&root, ConnectionKind::ApiKey, "sk-stored").expect("the key is stored");
	connection::clear(&root).expect("the connection is cleared");

	let report = reported_with(&root);

	assert!(report.authenticated);
	assert_eq!(report.connection, ConnectionState::Ready);
	assert_eq!(report.auth_method, None);
	assert!(
		serde_json::to_value(&report).expect("the report serializes").get("authMethod").is_none(),
		"an absent method crossed to the front"
	);
}

#[test]
fn a_connection_store_that_cannot_be_read_fails_the_check_rather_than_probing_without_it() {
	let root = a_root("unreadable");
	std::fs::create_dir_all(root.join("person")).expect("the scope directory is made");
	std::fs::write(root.join("person/.env"), "ANTHROPIC_API_KEY=\"unterminated\n")
		.expect("the file is planted");

	let report = reported_with(&root);

	assert!(!report.authenticated);
	let Some(TransportError::AuthCheckFailed { detail }) = report.error else {
		panic!("a connection store that could not be read was not reported as a failed check");
	};
	assert!(detail.starts_with(ENV_UNREADABLE), "the read failure was replaced: {detail}");
}
