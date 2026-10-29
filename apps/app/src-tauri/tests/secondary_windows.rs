mod common;

use std::collections::BTreeSet;
use std::sync::mpsc::{channel, Receiver};

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::events::{subscribed, TAB_DRAG};
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::utils::config::WindowConfig;
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

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

fn assert_no_window_opens(app: &App<MockRuntime>) {
	let main = main_window(app);
	assert_eq!(
		call(&main, "window_open", json!({ "href": PAGE })),
		Err(json!({ "kind": "unavailable" }))
	);
	assert_eq!(labels(app), vec![MAIN.to_owned()]);
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
		Ok(json!({ "label": secondary.label(), "initialHref": PAGE, "spaceId": null }))
	);
	assert_eq!(
		call(&main, "window_identity", json!({})),
		Ok(json!({ "label": MAIN, "initialHref": null, "spaceId": null }))
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
		Ok(json!({ "label": MAIN, "initialHref": null, "spaceId": null }))
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
	assert_no_window_opens(&app);
}

#[test]
fn a_launch_with_no_label_store_opens_no_window() {
	let home = DataDirectory::new();
	let app = home.launch_without_a_store();
	assert_no_window_opens(&app);
}

const TAB: &str = "/spaces/s1/conversations/c9";

fn heard_by(window: &WebviewWindow<MockRuntime>) -> Receiver<Value> {
	let (told, heard) = channel();
	window.listen(TAB_DRAG.name(), move |event| {
		let payload = serde_json::from_str(event.payload()).expect("the drag is JSON");
		told.send(payload).expect("the test listens");
	});
	heard
}

fn everything_in(heard: &Receiver<Value>) -> Vec<Value> {
	heard.try_iter().collect()
}

fn opened_from(
	app: &App<MockRuntime>,
	main: &WebviewWindow<MockRuntime>,
	body: Value,
) -> WebviewWindow<MockRuntime> {
	assert_eq!(call(main, "window_open", body), Ok(Value::Null));
	secondary_of(app)
}

#[test]
fn a_drag_reaches_every_open_window_and_no_joined_member() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let origin = opened_from(&app, &main, json!({ "href": TAB }));
	let (heard_by_main, heard_by_origin) = (heard_by(&main), heard_by(&origin));
	let mut members = subscribed(app.handle());
	let point = json!({ "x": 400, "y": 12 });

	for (cmd, body) in [
		("window_tab_drag_start", json!({ "tab": { "href": TAB }, "spaceId": "s1" })),
		("window_tab_drag_move", json!({ "point": point })),
		("window_tab_drag_drop", json!({ "point": point })),
	] {
		assert_eq!(call(&origin, cmd, body), Ok(Value::Null), "{cmd} was refused");
	}

	let label = origin.label();
	let announced = vec![
		json!({ "kind": "started", "originLabel": label, "originSpaceId": "s1", "tab": { "href": TAB } }),
		json!({ "kind": "moved", "originLabel": label, "point": point }),
		json!({ "kind": "dropped", "originLabel": label, "point": point }),
	];
	assert_eq!(everything_in(&heard_by_main), announced);
	assert_eq!(everything_in(&heard_by_origin), announced);
	assert!(members.try_recv().is_err(), "a joined member heard the drag");
}

#[test]
fn a_cancelled_drag_reaches_every_window_and_ends_the_drag() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let origin = opened_from(&app, &main, json!({ "href": TAB }));
	let heard = heard_by(&main);

	call(&origin, "window_tab_drag_start", json!({ "tab": {}, "spaceId": "s1" })).expect("started");
	assert_eq!(call(&origin, "window_tab_drag_cancel", json!({})), Ok(Value::Null));

	let heard = everything_in(&heard);
	assert_eq!(heard.last(), Some(&json!({ "kind": "cancelled", "originLabel": origin.label() })));
	assert_eq!(
		call(&origin, "window_tab_drag_move", json!({ "point": { "x": 1, "y": 1 } })),
		Err(json!({ "kind": "noDragInProgress" }))
	);
}

#[test]
fn a_second_drag_start_is_heard_as_the_cancel_of_the_first_then_its_own_start() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let first = opened_from(&app, &main, json!({ "href": TAB }));
	call(&first, "window_tab_drag_start", json!({ "tab": {}, "spaceId": "s1" })).expect("started");
	let heard = heard_by(&main);

	assert_eq!(
		call(&main, "window_tab_drag_start", json!({ "tab": { "href": "/" }, "spaceId": "s2" })),
		Ok(Value::Null)
	);

	assert_eq!(
		everything_in(&heard),
		vec![
			json!({ "kind": "cancelled", "originLabel": first.label() }),
			json!({
				"kind": "started",
				"originLabel": MAIN,
				"originSpaceId": "s2",
				"tab": { "href": "/" }
			}),
		]
	);
	assert_eq!(
		call(&first, "window_tab_drag_cancel", json!({})),
		Err(json!({ "kind": "notTheOrigin" }))
	);
}

#[test]
fn a_move_drop_or_cancel_with_no_drag_in_progress_is_refused_and_announces_nothing() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let heard = heard_by(&main);
	let point = json!({ "x": 1, "y": 1 });

	for (cmd, body) in [
		("window_tab_drag_move", json!({ "point": point })),
		("window_tab_drag_drop", json!({ "point": point })),
		("window_tab_drag_cancel", json!({})),
	] {
		assert_eq!(call(&main, cmd, body), Err(json!({ "kind": "noDragInProgress" })), "{cmd}");
	}
	assert_eq!(everything_in(&heard), Vec::<Value>::new());
}

#[test]
fn a_move_drop_or_cancel_from_a_window_other_than_the_origin_is_refused_and_announces_nothing() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let origin = opened_from(&app, &main, json!({ "href": TAB }));
	call(&origin, "window_tab_drag_start", json!({ "tab": {}, "spaceId": "s1" })).expect("started");
	let heard = heard_by(&main);
	let point = json!({ "x": 1, "y": 1 });

	for (cmd, body) in [
		("window_tab_drag_move", json!({ "point": point })),
		("window_tab_drag_drop", json!({ "point": point })),
		("window_tab_drag_cancel", json!({})),
	] {
		assert_eq!(call(&main, cmd, body), Err(json!({ "kind": "notTheOrigin" })), "{cmd}");
	}
	assert_eq!(everything_in(&heard), Vec::<Value>::new());
	assert_eq!(call(&origin, "window_tab_drag_cancel", json!({})), Ok(Value::Null));
}

#[test]
fn a_window_opened_from_a_space_and_a_window_reporting_one_each_read_back_their_space() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let opened = opened_from(&app, &main, json!({ "href": TAB, "originSpaceId": "s1" }));

	let first = call(&opened, "window_identity", json!({})).expect("an identity");
	assert_eq!(call(&main, "window_report_space", json!({ "spaceId": "s2" })), Ok(Value::Null));

	assert_eq!(first["spaceId"], "s1");
	assert_eq!(call(&main, "window_identity", json!({})).expect("an identity")["spaceId"], "s2");
	assert_eq!(call(&opened, "window_identity", json!({})).expect("an identity")["spaceId"], "s1");
}

#[test]
fn the_hit_test_finds_the_latest_strip_of_another_window_and_none_elsewhere() {
	let home = DataDirectory::new();
	let app = home.launch();
	let main = main_window(&app);
	let caller = opened_from(&app, &main, json!({ "href": TAB }));
	let strip_at = |x: i32, y: i32| {
		call(&caller, "window_strip_at", json!({ "point": { "x": x, "y": y } })).expect("answered")
	};
	call(&main, "window_report_space", json!({ "spaceId": "s2" })).expect("reported");
	call(&caller, "window_report_strip", json!({ "bounds": strip(0.0, 0.0, 900.0, 40.0) }))
		.expect("reported");

	assert_eq!(strip_at(100, 20), Value::Null, "the caller found its own strip");

	call(&main, "window_report_strip", json!({ "bounds": strip(80.0, 0.0, 600.0, 40.0) }))
		.expect("reported");
	let found = strip_at(100, 20);
	call(&main, "window_report_strip", json!({ "bounds": strip(200.0, 0.0, 600.0, 40.0) }))
		.expect("reported");

	assert_eq!(found, json!({ "label": MAIN, "spaceId": "s2" }));
	assert_eq!(strip_at(100, 20), Value::Null, "an earlier strip answered");
	assert_eq!(strip_at(300, 20), json!({ "label": MAIN, "spaceId": "s2" }));
	assert_eq!(strip_at(300, 60), Value::Null);
}

fn strip(x: f64, y: f64, width: f64, height: f64) -> Value {
	json!({ "x": x, "y": y, "width": width, "height": height })
}

const DRAG_GHOST: &str = "drag-ghost";

const GHOST_SUPPORTED: bool = cfg!(any(target_os = "macos", windows));

#[test]
fn the_drag_ghost_shows_moves_and_hides_then_stays_for_the_next_drag() {
	let directory = DataDirectory::new();
	let app = directory.launch_without_a_store();
	let main = main_window(&app);
	WebviewWindowBuilder::new(&app, DRAG_GHOST, Default::default())
		.visible(false)
		.build()
		.expect("the drag ghost builds");
	let support = Ok(json!({ "supported": GHOST_SUPPORTED }));
	let shown = json!({
		"at": { "x": 400, "y": 300 },
		"size": { "width": 320, "height": 200 },
		"tab": { "tabId": "t1", "href": PAGE, "title": "Conversation" },
	});

	assert_eq!(call(&main, "drag_ghost_show", shown), support);
	assert_eq!(call(&main, "drag_ghost_move", json!({ "at": { "x": 410, "y": 305 } })), support);
	assert_eq!(call(&main, "drag_ghost_hide", json!({})), support);
	assert!(app.get_webview_window(DRAG_GHOST).is_some(), "the drag ghost was not kept");
}

#[test]
fn a_drag_ghost_that_never_opened_is_unavailable_where_the_platform_supports_it() {
	let directory = DataDirectory::new();
	let app = directory.launch_without_a_store();
	let main = main_window(&app);
	let expected = if GHOST_SUPPORTED {
		Err(json!({ "kind": "unavailable" }))
	} else {
		Ok(json!({ "supported": false }))
	};

	assert_eq!(call(&main, "drag_ghost_move", json!({ "at": { "x": 0, "y": 0 } })), expected);
}
