mod common;

use common::an_app_of_its_own;
use kiroshi_app::agent::commands::terminate_session;
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

fn window(app: &tauri::App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::default())
		.build()
		.expect("window builds")
}

fn ask_for_a_title(window: &WebviewWindow<MockRuntime>, text: &str) -> Value {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: "agent_title".into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: json!({ "text": text }).into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.expect("the title crosses")
}

const ICON_ENV: &str = "FAKE_AGENT_TITLE_ICON";

fn an_app_naming(name: &str) -> common::AppOfItsOwn {
	an_app_of_its_own(
		name,
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	)
}

#[test]
fn a_naming_crosses_without_a_session_and_nothing_crosses_when_the_runtime_answers_nothing() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::remove_var(ICON_ENV);

	let app = an_app_naming("title");
	let plain_window = window(&app);

	assert_eq!(
		ask_for_a_title(&plain_window, "Migrer la base de données vers Postgres"),
		json!({ "title": "Migrer la base de données vers Postgres", "icon": null }),
		"a title frame without an icon crossed changed"
	);

	assert_eq!(
		ask_for_a_title(&plain_window, "Rename every conversation"),
		json!({ "title": "Rename every conversation", "icon": null }),
		"a second ask read a cache instead of the runtime"
	);

	assert_eq!(
		ask_for_a_title(&plain_window, "   \n  "),
		Value::Null,
		"an empty answer crossed as a title"
	);

	tauri::async_runtime::block_on(terminate_session(app.state::<AgentState>().inner()));

	std::env::set_var(ICON_ENV, "Rocket");
	let iconed = an_app_naming("title-icon");
	let iconed_window = window(&iconed);

	assert_eq!(
		ask_for_a_title(&iconed_window, "Ship the release"),
		json!({ "title": "Ship the release", "icon": "Rocket" }),
		"the icon the runtime picked did not cross beside the title"
	);

	tauri::async_runtime::block_on(terminate_session(iconed.state::<AgentState>().inner()));
	std::env::remove_var(ICON_ENV);
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}
