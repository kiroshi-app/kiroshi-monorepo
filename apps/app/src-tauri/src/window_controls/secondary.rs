use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::{Deserialize, Serialize};
use tauri::utils::config::WindowConfig;
use tauri::{
	AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime, State, WebviewWindow,
	WindowEvent,
};

use super::{built, is_app_window, main_config, tab_drag};
use crate::db::DatabaseState;

const SECONDARY_PREFIX: &str = "window-";

const CASCADE_OFFSET: f64 = 30.0;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WindowOpenError {
	NotAnAppPage,
	Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowIdentity {
	pub label: String,
	pub initial_href: Option<String>,
	pub space_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScreenPosition {
	pub x: i32,
	pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StripBounds {
	#[specta(type = u32)]
	pub x: f64,
	#[specta(type = u32)]
	pub y: f64,
	#[specta(type = u32)]
	pub width: f64,
	#[specta(type = u32)]
	pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StripTarget {
	pub label: String,
	pub space_id: Option<String>,
}

#[derive(Default)]
pub struct OpenedWindows(Mutex<Registry>);

impl OpenedWindows {
	fn registry(&self) -> MutexGuard<'_, Registry> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

#[derive(Default)]
struct Registry {
	windows: HashMap<String, OpenedWindow>,
	last_focus_rank: u64,
}

#[derive(Debug, Default)]
struct OpenedWindow {
	initial_href: Option<String>,
	space_id: Option<String>,
	strip: Option<Area>,
	focus_rank: u64,
}

struct Placed {
	label: String,
	is_shown: bool,
	x: f64,
	y: f64,
}

impl Registry {
	fn of(&mut self, label: &str) -> &mut OpenedWindow {
		self.windows.entry(label.to_owned()).or_default()
	}

	fn focused(&mut self, label: &str) {
		self.last_focus_rank += 1;
		let rank = self.last_focus_rank;
		self.of(label).focus_rank = rank;
	}

	fn strip_at(&self, point: ScreenPosition, placed: &[Placed]) -> Option<StripTarget> {
		placed
			.iter()
			.filter(|window| window.is_shown)
			.filter_map(|window| {
				let opened = self.windows.get(&window.label)?;
				let strip = opened.strip?;
				let on_screen = Area { x: window.x + strip.x, y: window.y + strip.y, ..strip };
				on_screen.holds(point).then_some((window, opened))
			})
			.max_by_key(|(_, opened)| opened.focus_rank)
			.map(|(window, opened)| StripTarget {
				label: window.label.clone(),
				space_id: opened.space_id.clone(),
			})
	}
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Placement {
	width: f64,
	height: f64,
	x: f64,
	y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Area {
	x: f64,
	y: f64,
	width: f64,
	height: f64,
}

impl Area {
	fn holds(&self, point: ScreenPosition) -> bool {
		let (x, y) = (f64::from(point.x), f64::from(point.y));
		(self.x..self.x + self.width).contains(&x) && (self.y..self.y + self.height).contains(&y)
	}
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Screen {
	bounds: Area,
	work_area: Area,
}

pub fn is_secondary(label: &str) -> bool {
	label
		.strip_prefix(SECONDARY_PREFIX)
		.is_some_and(|rank| !rank.is_empty() && rank.chars().all(|c| c.is_ascii_digit()))
}

#[tauri::command]
#[specta::specta]
pub async fn window_open<R: Runtime>(
	window: WebviewWindow<R>,
	href: String,
	position: Option<ScreenPosition>,
	origin_space_id: Option<String>,
) -> Result<(), WindowOpenError> {
	if !is_app_page(&href) {
		return Err(WindowOpenError::NotAnAppPage);
	}
	let app = window.app_handle();
	let Some(main) = main_config(app) else {
		eprintln!("the config declares no main window to open another one from");
		return Err(WindowOpenError::Unavailable);
	};
	let caller = placement_of(&window).map_err(|failure| {
		eprintln!("the geometry of the window {} could not be read: {failure}", window.label());
		WindowOpenError::Unavailable
	})?;
	let placement = position
		.and_then(|point| work_area_for(&window, point).map(|area| at(caller, point, area)))
		.unwrap_or_else(|| beside(caller));
	let config = secondary_config(main, fresh_label(app).await?, placement);
	let opened = OpenedWindow {
		initial_href: Some(href),
		space_id: origin_space_id,
		..OpenedWindow::default()
	};
	opened_windows(app).registry().windows.insert(config.label.clone(), opened);
	match built(app, &config) {
		Ok(_) => Ok(()),
		Err(failure) => {
			opened_windows(app).registry().windows.remove(&config.label);
			eprintln!("the window {} did not open: {failure}", config.label);
			Err(WindowOpenError::Unavailable)
		}
	}
}

#[tauri::command]
#[specta::specta]
pub fn window_identity<R: Runtime>(window: WebviewWindow<R>) -> WindowIdentity {
	let label = window.label().to_owned();
	let state = opened_windows(window.app_handle());
	let registry = state.registry();
	let opened = registry.windows.get(&label);
	WindowIdentity {
		initial_href: opened.and_then(|opened| opened.initial_href.clone()),
		space_id: opened.and_then(|opened| opened.space_id.clone()),
		label,
	}
}

#[tauri::command]
#[specta::specta]
pub fn window_report_space<R: Runtime>(window: WebviewWindow<R>, space_id: String) {
	opened_windows(window.app_handle()).registry().of(window.label()).space_id = Some(space_id);
}

#[tauri::command]
#[specta::specta]
pub fn window_report_strip<R: Runtime>(window: WebviewWindow<R>, bounds: StripBounds) {
	let strip = Area { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
	opened_windows(window.app_handle()).registry().of(window.label()).strip = Some(strip);
}

#[tauri::command]
#[specta::specta]
pub fn window_strip_at<R: Runtime>(
	window: WebviewWindow<R>,
	point: ScreenPosition,
) -> Option<StripTarget> {
	let app = window.app_handle();
	let others: Vec<Placed> = app
		.webview_windows()
		.into_iter()
		.filter(|(label, _)| label != window.label() && is_app_window(label))
		.filter_map(|(_, other)| placed(&other))
		.collect();
	opened_windows(app).registry().strip_at(point, &others)
}

pub(super) fn followed<R: Runtime>(window: &WebviewWindow<R>) {
	let subject = window.clone();
	window.on_window_event(move |event| follow(&subject, event));
}

fn follow<R: Runtime>(window: &WebviewWindow<R>, event: &WindowEvent) {
	match event {
		WindowEvent::Focused(true) => {
			opened_windows(window.app_handle()).registry().focused(window.label());
		}
		WindowEvent::Destroyed => {
			opened_windows(window.app_handle()).registry().windows.remove(window.label());
			tab_drag::cancel_when_origin_destroyed(window);
		}
		_ => {}
	}
}

fn placed<R: Runtime>(window: &WebviewWindow<R>) -> Option<Placed> {
	let read = || -> tauri::Result<Placed> {
		let scale = window.scale_factor()?;
		let origin = window.inner_position()?.to_logical::<f64>(scale);
		let is_shown = window.is_visible()? && !window.is_minimized()?;
		Ok(Placed { label: window.label().to_owned(), is_shown, x: origin.x, y: origin.y })
	};
	read()
		.inspect_err(|failure| {
			eprintln!("the place of the window {} could not be read: {failure}", window.label());
		})
		.ok()
}

fn is_app_page(href: &str) -> bool {
	href.starts_with('/')
		&& !href.starts_with("//")
		&& !href.chars().any(|letter| letter == '\\' || letter.is_control())
}

async fn fresh_label<R: Runtime>(app: &AppHandle<R>) -> Result<String, WindowOpenError> {
	let Some(state) = app.try_state::<DatabaseState>() else {
		eprintln!("no store is open to record the label of a new window");
		return Err(WindowOpenError::Unavailable);
	};
	let database = state.inner().as_ref().map_err(|failure| {
		eprintln!("the store of window labels did not open: {failure:?}");
		WindowOpenError::Unavailable
	})?;
	let rank = database.user().hand_out_window_rank().await.map_err(|failure| {
		eprintln!("the label of a new window could not be recorded: {failure:?}");
		WindowOpenError::Unavailable
	})?;
	Ok(secondary_label(rank))
}

fn secondary_label(rank: u64) -> String {
	format!("{SECONDARY_PREFIX}{rank}")
}

fn opened_windows<R: Runtime>(app: &AppHandle<R>) -> State<'_, OpenedWindows> {
	if app.try_state::<OpenedWindows>().is_none() {
		app.manage(OpenedWindows::default());
	}
	app.state::<OpenedWindows>()
}

fn placement_of<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<Placement> {
	let scale = window.scale_factor()?;
	let size = window.inner_size()?.to_logical::<f64>(scale);
	let position = window.outer_position()?.to_logical::<f64>(scale);
	Ok(Placement { width: size.width, height: size.height, x: position.x, y: position.y })
}

fn beside(caller: Placement) -> Placement {
	Placement { x: caller.x + CASCADE_OFFSET, y: caller.y + CASCADE_OFFSET, ..caller }
}

fn work_area_for<R: Runtime>(window: &WebviewWindow<R>, point: ScreenPosition) -> Option<Area> {
	let found = window.available_monitors().and_then(|monitors| {
		let screens: Vec<Screen> = monitors.iter().map(screen_of).collect();
		if let Some(area) = work_area_holding(point, &screens) {
			return Ok(Some(area));
		}
		Ok(window.current_monitor()?.as_ref().map(|monitor| screen_of(monitor).work_area))
	});
	match found {
		Ok(Some(area)) => Some(area),
		Ok(None) => {
			eprintln!("no monitor holds the window {}, it opens beside it", window.label());
			None
		}
		Err(failure) => {
			eprintln!("the monitors of the window {} could not be read: {failure}", window.label());
			None
		}
	}
}

fn screen_of(monitor: &Monitor) -> Screen {
	let scale = monitor.scale_factor();
	let work_area = monitor.work_area();
	Screen {
		bounds: logical_area(*monitor.position(), *monitor.size(), scale),
		work_area: logical_area(work_area.position, work_area.size, scale),
	}
}

fn logical_area(position: PhysicalPosition<i32>, size: PhysicalSize<u32>, scale: f64) -> Area {
	let position = position.to_logical::<f64>(scale);
	let size = size.to_logical::<f64>(scale);
	Area { x: position.x, y: position.y, width: size.width, height: size.height }
}

fn work_area_holding(point: ScreenPosition, screens: &[Screen]) -> Option<Area> {
	screens.iter().find(|screen| screen.bounds.holds(point)).map(|screen| screen.work_area)
}

fn at(caller: Placement, point: ScreenPosition, area: Area) -> Placement {
	Placement {
		x: clamped(f64::from(point.x), caller.width, area.x, area.width),
		y: clamped(f64::from(point.y), caller.height, area.y, area.height),
		..caller
	}
}

fn clamped(start: f64, length: f64, area_start: f64, area_length: f64) -> f64 {
	let farthest = area_start + (area_length - length).max(0.0);
	start.min(farthest).max(area_start)
}

fn secondary_config(main: WindowConfig, label: String, placement: Placement) -> WindowConfig {
	WindowConfig {
		label,
		width: placement.width,
		height: placement.height,
		x: Some(placement.x),
		y: Some(placement.y),
		center: false,
		visible: true,
		..main
	}
}

#[cfg(test)]
mod tests {
	use tauri::utils::config::WindowConfig;

	use serde_json::{json, Value};
	use tauri::ipc::CallbackFn;
	use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
	use tauri::webview::InvokeRequest;
	use tauri::{Listener, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

	use super::{
		at, beside, follow, is_app_page, is_secondary, secondary_config, secondary_label,
		work_area_holding, Area, OpenedWindow, Placed, Placement, Registry, Screen, ScreenPosition,
		StripTarget,
	};
	use crate::events::TAB_DRAG;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
	use crate::window_controls::is_app_window;

	const CALLER: Placement = Placement { width: 1400.0, height: 900.0, x: 120.0, y: 64.0 };

	const WORK_AREA: Area = Area { x: 0.0, y: 25.0, width: 1728.0, height: 1012.0 };

	const LAPTOP: Screen = Screen {
		bounds: Area { x: 0.0, y: 0.0, width: 1728.0, height: 1117.0 },
		work_area: WORK_AREA,
	};

	const EXTERNAL: Screen = Screen {
		bounds: Area { x: 1728.0, y: -200.0, width: 2560.0, height: 1440.0 },
		work_area: Area { x: 1728.0, y: -175.0, width: 2560.0, height: 1415.0 },
	};

	const fn point(x: i32, y: i32) -> ScreenPosition {
		ScreenPosition { x, y }
	}

	const fn placed(x: f64, y: f64) -> Placement {
		Placement { x, y, ..CALLER }
	}

	#[test]
	fn a_window_opened_at_a_point_keeps_the_size_of_its_caller_with_its_top_left_there() {
		assert_eq!(at(CALLER, point(200, 80), WORK_AREA), placed(200.0, 80.0));
	}

	#[test]
	fn a_window_crossing_the_right_or_bottom_edge_moves_back_inside_the_work_area() {
		assert_eq!(at(CALLER, point(1000, 80), WORK_AREA), placed(328.0, 80.0));
		assert_eq!(at(CALLER, point(200, 500), WORK_AREA), placed(200.0, 137.0));
		assert_eq!(at(CALLER, point(1700, 1100), WORK_AREA), placed(328.0, 137.0));
	}

	#[test]
	fn a_point_left_of_or_above_the_work_area_lands_on_its_left_or_top_edge() {
		assert_eq!(at(CALLER, point(-40, 80), WORK_AREA), placed(0.0, 80.0));
		assert_eq!(at(CALLER, point(200, 10), WORK_AREA), placed(200.0, 25.0));
	}

	#[test]
	fn a_window_larger_than_the_work_area_sits_on_its_left_and_top_edges() {
		let wide = Placement { width: 2000.0, height: 1200.0, ..CALLER };

		assert_eq!(at(wide, point(300, 300), WORK_AREA), Placement { x: 0.0, y: 25.0, ..wide });
	}

	#[test]
	fn the_work_area_is_the_one_of_the_monitor_the_point_falls_on() {
		let screens = [LAPTOP, EXTERNAL];

		assert_eq!(work_area_holding(point(400, 5), &screens), Some(WORK_AREA));
		assert_eq!(work_area_holding(point(2000, -150), &screens), Some(EXTERNAL.work_area));
	}

	#[test]
	fn a_point_on_no_monitor_finds_no_work_area_of_its_own() {
		assert_eq!(work_area_holding(point(-500, 400), &[LAPTOP, EXTERNAL]), None);
		assert_eq!(work_area_holding(point(1728, 1300), &[LAPTOP, EXTERNAL]), None);
		assert_eq!(work_area_holding(point(400, 400), &[]), None);
	}

	fn main_config() -> WindowConfig {
		WindowConfig {
			label: "main".to_owned(),
			title: "Kiroshi".to_owned(),
			min_width: Some(1024.0),
			min_height: Some(680.0),
			center: true,
			visible: false,
			hidden_title: true,
			..WindowConfig::default()
		}
	}

	#[test]
	fn a_window_opens_with_the_size_of_its_caller_thirty_points_right_and_down() {
		assert_eq!(beside(CALLER), Placement { width: 1400.0, height: 900.0, x: 150.0, y: 94.0 });
	}

	#[test]
	fn a_secondary_window_keeps_the_main_entry_and_takes_its_own_label_and_place() {
		let config = secondary_config(main_config(), "window-3".to_owned(), beside(CALLER));

		assert_eq!(
			config,
			WindowConfig {
				label: "window-3".to_owned(),
				width: 1400.0,
				height: 900.0,
				x: Some(150.0),
				y: Some(94.0),
				center: false,
				visible: true,
				..main_config()
			}
		);
	}

	#[test]
	fn every_secondary_label_is_an_app_window_and_main_is_none() {
		for rank in [1, 42, u64::MAX] {
			let label = secondary_label(rank);
			assert!(is_secondary(&label) && is_app_window(&label), "{label} is not secondary");
		}
		assert!(!is_secondary("main") && is_app_window("main"));
	}

	#[test]
	fn an_app_page_is_a_path_from_the_root_of_the_app() {
		for href in ["/", "/conversations/c1", "/spaces/s1/missions?tab=open#m2"] {
			assert!(is_app_page(href), "{href} was refused");
		}
	}

	#[test]
	fn anything_but_a_path_from_the_root_of_the_app_is_refused() {
		for href in [
			"",
			"conversations/c1",
			"//evil.example/x",
			"/\\evil.example",
			"https://evil.example/",
			"tauri://localhost/x",
			"/a\nb",
		] {
			assert!(!is_app_page(href), "{href:?} was accepted");
		}
	}

	fn app() -> AppOfItsOwn {
		an_app_of_its_own(
			"window-registry",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		)
	}

	fn window_of(app: &AppOfItsOwn, label: &str) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
			.build()
			.expect("the window opens")
	}

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
		.unwrap_or(Value::Null)
	}

	fn reported_strip(window: &WebviewWindow<MockRuntime>, x: f64, width: f64) {
		let bounds = json!({ "x": x, "y": 0.0, "width": width, "height": 40.0 });
		invoked(window, "window_report_strip", json!({ "bounds": bounds }));
	}

	fn strip_at(window: &WebviewWindow<MockRuntime>, x: i32) -> Value {
		invoked(window, "window_strip_at", json!({ "point": { "x": x, "y": 20 } }))
	}

	#[test]
	fn on_overlapping_strips_the_hit_test_answers_the_most_recently_focused_window() {
		let app = app();
		let (main, first, caller) =
			(window_of(&app, "main"), window_of(&app, "window-1"), window_of(&app, "window-2"));
		invoked(&main, "window_report_space", json!({ "spaceId": "s1" }));
		invoked(&first, "window_report_space", json!({ "spaceId": "s2" }));
		reported_strip(&main, 0.0, 800.0);
		reported_strip(&first, 100.0, 800.0);

		follow(&main, &WindowEvent::Focused(true));
		follow(&first, &WindowEvent::Focused(true));
		let first_on_top = strip_at(&caller, 300);
		follow(&first, &WindowEvent::Focused(false));
		follow(&main, &WindowEvent::Focused(true));
		let main_on_top = strip_at(&caller, 300);

		assert_eq!(first_on_top, json!({ "label": "window-1", "spaceId": "s2" }));
		assert_eq!(main_on_top, json!({ "label": "main", "spaceId": "s1" }));
		assert_eq!(strip_at(&caller, 50), json!({ "label": "main", "spaceId": "s1" }));
	}

	#[test]
	fn a_destroyed_window_leaves_its_space_its_strip_and_its_focus_behind() {
		let app = app();
		let (main, gone) = (window_of(&app, "main"), window_of(&app, "window-1"));
		invoked(&gone, "window_report_space", json!({ "spaceId": "s2" }));
		reported_strip(&gone, 0.0, 800.0);
		follow(&gone, &WindowEvent::Focused(true));

		follow(&gone, &WindowEvent::Destroyed);

		assert_eq!(strip_at(&main, 300), Value::Null);
		assert_eq!(invoked(&gone, "window_identity", json!({}))["spaceId"], Value::Null);
		assert!(super::opened_windows(app.handle()).registry().windows.is_empty());
	}

	#[test]
	fn destroying_the_origin_of_a_drag_cancels_it_for_every_remaining_window() {
		let app = app();
		let (main, origin) = (window_of(&app, "main"), window_of(&app, "window-1"));
		let (told, heard) = std::sync::mpsc::channel();
		main.listen(TAB_DRAG.name(), move |event| {
			told.send(event.payload().to_owned()).expect("the test listens");
		});
		invoked(&origin, "window_tab_drag_start", json!({ "tab": {}, "spaceId": "s1" }));

		follow(&main, &WindowEvent::Destroyed);
		follow(&origin, &WindowEvent::Destroyed);

		let heard: Vec<Value> =
			heard.try_iter().map(|payload| serde_json::from_str(&payload).expect("JSON")).collect();
		assert_eq!(heard.len(), 2, "heard {heard:?}");
		assert_eq!(heard[1], json!({ "kind": "cancelled", "originLabel": "window-1" }));
	}

	#[test]
	fn a_hidden_window_is_never_the_target_of_the_hit_test() {
		let strip = Area { x: 0.0, y: 0.0, width: 800.0, height: 40.0 };
		let mut registry = Registry::default();
		for label in ["main", "window-1"] {
			registry.windows.insert(
				label.to_owned(),
				OpenedWindow { strip: Some(strip), ..OpenedWindow::default() },
			);
		}
		registry.focused("main");
		let at = |label: &str, is_shown: bool| Placed {
			label: label.to_owned(),
			is_shown,
			x: 0.0,
			y: 0.0,
		};

		let behind = registry.strip_at(point(100, 20), &[at("main", false), at("window-1", true)]);
		let alone = registry.strip_at(point(100, 20), &[at("main", false)]);

		assert_eq!(behind, Some(StripTarget { label: "window-1".to_owned(), space_id: None }));
		assert_eq!(alone, None);
	}
}
