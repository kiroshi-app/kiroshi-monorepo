mod bundled;
mod common;

use std::sync::{Arc, Mutex};

use bundled::bundled_bots;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::{
	agent_start_or_resume_session, shutdown_session, terminate_session, EVENT_CHANNEL,
};
use kiroshi_app::agent::contract::{AgentEvent, ConnectionState, RuntimeScope, ScopedEvent};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::db::connection::{open, FILE_NAME};
use kiroshi_app::db::migrations;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

fn app() -> AppOfItsOwn {
	let app = an_app_of_its_own(
		"commands",
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &["default", "other"]);
	app
}

fn a_scope() -> Value {
	json!({
		"conversationId": "c1",
		"botId": "default",
		"runtimeSessionId": "r1",
		"epoch": 1
	})
}

fn a_scope_value() -> RuntimeScope {
	serde_json::from_value(a_scope()).expect("the scope parses")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

#[test]
fn commands_are_registered_and_report_typed_errors_without_a_session() {
	let app = app();
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");

	assert_eq!(
		call(&window, "agent_cancel_turn", json!({ "scope": a_scope() })),
		Ok(json!({ "kind": "nothingToCancel" }))
	);
	assert_eq!(
		call(&window, "agent_submit_prompt", json!({ "scope": a_scope(), "text": "salut" })),
		Err(json!({ "kind": "notStarted" }))
	);
	assert_eq!(
		call(
			&window,
			"agent_respond_to_permission",
			json!({ "scope": a_scope(), "id": "x", "decision": "allowOnce" })
		),
		Err(json!({ "kind": "notStarted" }))
	);
}

#[test]
fn a_command_reaching_a_host_that_runs_nothing_says_so_whatever_run_it_names() {
	let app = app();
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");
	let another = json!({
		"conversationId": "c2",
		"botId": "other",
		"runtimeSessionId": "r9",
		"epoch": 7
	});

	assert_eq!(
		call(&window, "agent_submit_prompt", json!({ "scope": another, "text": "salut" })),
		Err(json!({ "kind": "notStarted" }))
	);
	assert_eq!(call(&window, "agent_shutdown", json!({ "scope": another })), Ok(Value::Null));
}

#[test]
fn shutdown_announces_the_connection_state_on_the_single_event_channel() {
	let app = app();
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");

	let seen: Arc<Mutex<Vec<ScopedEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = seen.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.lock().expect("log").push(parsed);
		}
	});

	assert_eq!(call(&window, "agent_shutdown", json!({ "scope": a_scope() })), Ok(Value::Null));

	let events = seen.lock().expect("log").clone();
	assert!(events.iter().any(|scoped| matches!(
		(&scoped.scope, &scoped.event),
		(Some(scope), AgentEvent::ConnectionChanged { state: ConnectionState::Checking })
			if scope == &a_scope_value()
	)));
}

#[cfg(unix)]
async fn frozen(state: &AgentState) {
	let sidecar = state.sidecar().await.expect("the sidecar runs");
	let group = -(sidecar.pid() as libc::pid_t);
	assert_eq!(unsafe { libc::kill(group, libc::SIGSTOP) }, 0, "the sidecar group stops");
}

#[test]
fn shutting_down_a_session_never_queues_behind_the_quit() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, env!("CARGO_BIN_EXE_fake_sidecar"));
	std::env::set_var("FAKE_AGENT_IGNORE_EOF", "1");

	let app = app();
	let runtime = tokio::runtime::Runtime::new().expect("runtime");

	let finished: Mutex<Vec<&str>> = Mutex::new(Vec::new());
	runtime.block_on(async {
		agent_start_or_resume_session(
			app.handle().clone(),
			app.state::<AgentState>(),
			app.state::<db::DatabaseState>(),
			a_scope_value(),
			None,
			Some(std::env::temp_dir().to_string_lossy().into_owned()),
			None,
		)
		.await
		.expect("session starts");

		let state = app.state::<AgentState>();
		#[cfg(unix)]
		frozen(&state).await;
		tokio::join!(
			async {
				shutdown_session(&state, &a_scope_value()).await;
				finished.lock().expect("order").push("shutdown");
			},
			async {
				terminate_session(&state).await;
				finished.lock().expect("order").push("terminate");
			},
		);
	});

	std::env::remove_var("FAKE_AGENT_IGNORE_EOF");
	assert_eq!(*finished.lock().expect("order"), ["shutdown", "terminate"]);
}

#[test]
fn bootstrapping_leaves_a_migrated_file_in_the_app_data_directory() {
	let app = app();

	let _database = db::bootstrap(app.handle()).expect("the database opens");

	let dir = app.path().app_data_dir().expect("data dir");
	let file = dir.join(FILE_NAME);
	assert!(file.exists(), "bootstrap created no file");
	let reopened = open(&file).expect("the file is a database");
	assert_eq!(
		migrations::version(&reopened).expect("version"),
		migrations::latest_version(),
		"the file was left short of the schema this build expects"
	);
}
