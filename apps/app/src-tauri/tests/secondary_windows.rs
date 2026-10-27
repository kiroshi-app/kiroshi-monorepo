mod common;

use std::collections::BTreeSet;

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::utils::config::WindowConfig;
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

const MAIN: &str = "main";

const PAGE: &str = "/spaces/s1/conversations/c1?message=m2";

struct DataDirectory(AppOfItsOwn);

impl DataDirectory {
	fn new() -> Self {
		Self(an_app_of_its_own("secondary-windows", mock_builder()))
	}

	fn launch(&self) -> App<MockRuntime> {
		let app = self.launch_without_a_store();
		app.manage(db::bootstrap(app.handle()));
		app
	}

	fn launch_without_a_store(&self) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		let config = context.config_mut();
		config.identifier = self.0.config().identifier.clone();
		config.app.windows.push(WindowConfig { label: MAIN.to_owned(), ..WindowConfig::default() });
		mock_builder().invoke_handler(invoke_handler()).build(context).expect("the app builds")
	}
}

fn main_window(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app, MAIN, Default::default()).build().expect("main builds")
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

fn labels(app: &App<MockRuntime>) -> Vec<String> {
	let mut labels: Vec<String> = app.webview_windows().into_keys().collect();
	labels.sort();
	labels
}

fn secondary_labels_after_opening(app: &App<MockRuntime>, count: usize) -> BTreeSet<String> {
	let main = main_window(app);
	for _ in 0..count {
		assert_eq!(call(&main, "window_open", json!({ "href": "/" })), Ok(Value::Null));
	}
	labels(app).into_iter().filter(|label| label != MAIN).collect()
}

fn secondary_of(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	app.webview_windows()
		.into_iter()
		.find_map(|(label, window)| (label != MAIN).then_some(window))
		.expect("a second window opened")
}

#[test]
fn a_window_opened_on_a_page_reads_back_its_label_and_that_page() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);

	assert_eq!(call(&main, "window_open", json!({ "href": PAGE })), Ok(Value::Null));

	let secondary = secondary_of(&app);
	assert!(
		secondary.label().starts_with("window-"),
		"{} is no secondary label",
		secondary.label()
	);
	assert_eq!(labels(&app).len(), 2);
	assert_eq!(
		call(&secondary, "window_identity", json!({})),
		Ok(json!({ "label": secondary.label(), "initialHref": PAGE }))
	);
	assert_eq!(
		call(&main, "window_identity", json!({})),
		Ok(json!({ "label": MAIN, "initialHref": null }))
	);
}

#[test]
fn every_window_opened_takes_a_label_never_given_before() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);

	for _ in 0..3 {
		assert_eq!(call(&main, "window_open", json!({ "href": "/" })), Ok(Value::Null));
	}

	assert_eq!(labels(&app).len(), 4);
}

#[test]
fn a_page_outside_the_app_opens_no_window() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);

	for href in ["https://evil.example/", "//evil.example/x", "conversations/c1"] {
		assert_eq!(
			call(&main, "window_open", json!({ "href": href })),
			Err(json!({ "kind": "notAnAppPage" }))
		);
	}

	assert_eq!(labels(&app), vec![MAIN.to_owned()]);
}

#[test]
fn closing_a_secondary_window_leaves_main_open() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	assert_eq!(call(&main, "window_open", json!({ "href": PAGE })), Ok(Value::Null));

	secondary_of(&app).close().expect("the secondary window closes");

	assert!(app.get_webview_window(MAIN).is_some());
	assert_eq!(
		call(&main, "window_identity", json!({})),
		Ok(json!({ "label": MAIN, "initialHref": null }))
	);
}

#[test]
fn a_later_launch_from_the_same_data_directory_never_hands_out_an_earlier_label() {
	let home = DataDirectory::new();
	let first = secondary_labels_after_opening(&home.launch(), 2);

	let second = secondary_labels_after_opening(&home.launch(), 2);

	assert_eq!(first, BTreeSet::from(["window-1".to_owned(), "window-2".to_owned()]));
	assert_eq!(second, BTreeSet::from(["window-3".to_owned(), "window-4".to_owned()]));
}

#[test]
fn windows_opened_at_once_each_take_a_label_of_their_own() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);

	let openings: Vec<_> = (0..4)
		.map(|_| {
			let caller = main.clone();
			std::thread::spawn(move || call(&caller, "window_open", json!({ "href": "/" })))
		})
		.collect();

	for opening in openings {
		assert_eq!(opening.join().expect("the opening ends"), Ok(Value::Null));
	}
	assert_eq!(labels(&app).len(), 5);
}

#[test]
fn a_launch_whose_label_store_did_not_open_opens_no_window() {
	let home = DataDirectory::new();
	let app = home.launch_without_a_store();
	app.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir));
	let main = main_window(&app);

	assert_eq!(
		call(&main, "window_open", json!({ "href": PAGE })),
		Err(json!({ "kind": "unavailable" }))
	);
	assert_eq!(labels(&app), vec![MAIN.to_owned()]);
}

#[test]
fn a_launch_with_no_label_store_opens_no_window() {
	let home = DataDirectory::new();
	let app = home.launch_without_a_store();
	let main = main_window(&app);

	assert_eq!(
		call(&main, "window_open", json!({ "href": PAGE })),
		Err(json!({ "kind": "unavailable" }))
	);
	assert_eq!(labels(&app), vec![MAIN.to_owned()]);
}
