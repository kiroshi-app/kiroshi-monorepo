pub use kiroshi_core::missions::run_claims::*;

use tauri::{Runtime, State, Webview};

#[tauri::command]
#[specta::specta]
pub fn mission_run_claim<R: Runtime>(
	webview: Webview<R>,
	core: State<'_, crate::core_context::Core>,
	mission_id: String,
) -> MissionRunClaim {
	kiroshi_core::missions::run_claims::mission_run_claim(
		core.inner(),
		&crate::events::client_of(&webview.window()),
		mission_id,
	)
}

#[tauri::command]
#[specta::specta]
pub fn mission_run_release(core: State<'_, crate::core_context::Core>, token: String) {
	kiroshi_core::missions::run_claims::mission_run_release(core.inner(), token)
}

#[cfg(test)]
mod tests {
	use serde_json::{json, Value};
	use tauri::ipc::CallbackFn;
	use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
	use tauri::webview::InvokeRequest;
	use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

	use super::*;
	use crate::test_app::an_app_of_its_own;

	fn invoked(window: &WebviewWindow<MockRuntime>, command: &str, body: Value) -> Value {
		get_ipc_response(
			window,
			InvokeRequest {
				cmd: command.into(),
				callback: CallbackFn(0),
				error: CallbackFn(1),
				url: "tauri://localhost".parse().expect("a url"),
				body: body.into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		)
		.unwrap_or_else(|error| panic!("{command} was refused: {error:?}"))
		.deserialize::<Value>()
		.expect("the answer is JSON")
	}

	#[test]
	fn a_claim_holds_the_calling_window_and_goes_when_that_window_is_destroyed() {
		let app = an_app_of_its_own(
			"mission-run-claims",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		crate::events::core(app.app_handle()).manage_client_scoped(MissionRunClaims::default());
		let window_of = |label: &str| {
			WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
				.build()
				.expect("the window opens")
		};
		let (main, second) = (window_of("main"), window_of("second"));

		let claimed = invoked(&second, "mission_run_claim", json!({ "missionId": "m1" }));
		let refused = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));
		crate::events::clear_client_on_destroyed(
			&second.as_ref().window(),
			&WindowEvent::Focused(false),
		);
		let still_held = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));
		crate::events::clear_client_on_destroyed(
			&second.as_ref().window(),
			&WindowEvent::Destroyed,
		);
		let reclaimed = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));

		assert_eq!(claimed["kind"], "claimed", "the first claim answered {claimed}");
		assert!(claimed["token"].is_string(), "the claim carries no token: {claimed}");
		assert_eq!(refused, json!({ "kind": "alreadyRunning" }));
		assert_eq!(
			still_held,
			json!({ "kind": "alreadyRunning" }),
			"a focus change freed the claim"
		);
		assert_eq!(reclaimed["kind"], "claimed", "the destroyed window kept its claim");
	}
}
