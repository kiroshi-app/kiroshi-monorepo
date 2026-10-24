mod common;

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::terminate_session;
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::bundles::{self, EffortLevel};
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

const OFFERED: &str = "sonnet=low+high,haiku";

fn host() -> AppOfItsOwn {
	let app = an_app_of_its_own(
		"companion-effort",
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	app
}

fn window(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::default())
		.build()
		.expect("window builds")
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

fn a_companion_on(model: &str, effort: &str) -> Value {
	json!({
		"name": "Nyx",
		"title": "Reviewer",
		"model": model,
		"avatarBlot": "red",
		"avatarImagePath": null,
		"instructions": "Answer briefly.",
		"deniedTools": [],
		"effort": effort
	})
}

fn written_effort(app: &App<MockRuntime>, bot: &Value) -> Option<EffortLevel> {
	let root = bundles::root(app.handle()).expect("the bundle root");
	let id = bot["id"].as_str().expect("the companion holds an id");
	bundles::generated(&root, id).expect("the agent file is written").effort
}

#[test]
fn the_agent_file_carries_only_an_effort_the_catalogue_offers_for_the_model() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_MODELS", OFFERED);
	let app = host();
	let window = window(&app);

	let unasked = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": a_companion_on("sonnet", "max") }),
	)
	.expect("a companion created before the catalogue answered");
	assert_eq!(
		written_effort(&app, &unasked),
		Some(EffortLevel::Max),
		"an effort was held back before the catalogue had answered"
	);

	call(&window, "agent_models", json!({})).expect("the catalogue answers");

	let unsupported = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": a_companion_on("sonnet", "max") }),
	)
	.expect("a companion on a level its model lacks");
	assert_eq!(unsupported["effort"], json!("max"), "the stored effort was dropped");
	assert_eq!(
		written_effort(&app, &unsupported),
		None,
		"a level the model lacks reached the file"
	);

	let supported = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": a_companion_on("sonnet", "high") }),
	)
	.expect("a companion on a level its model offers");
	assert_eq!(written_effort(&app, &supported), Some(EffortLevel::High));

	let effortless = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": a_companion_on("haiku", "low") }),
	)
	.expect("a companion on a model without effort");
	assert_eq!(written_effort(&app, &effortless), None, "a model without effort was given one");

	let unlisted = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": a_companion_on("fable", "low") }),
	)
	.expect("a companion on a model the catalogue does not list");
	assert_eq!(
		written_effort(&app, &unlisted),
		Some(EffortLevel::Low),
		"an effort was held back for a model the catalogue never answered for"
	);

	tauri::async_runtime::block_on(terminate_session(
		app.handle(),
		app.state::<AgentState>().inner(),
	));
	std::env::remove_var("FAKE_AGENT_MODELS");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}
