use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, LogicalPosition, Manager, Runtime, State, WebviewWindow};

use super::cursor::{self, Cursor, FollowFailure, Followed, Unobservable};
use super::secondary::ScreenPosition;
use super::tab_drag::NativeWindowError;
use crate::events::{self, NATIVE_MOVE_ENDED, NATIVE_MOVE_FAILED};

pub use kiroshi_core::desktop_events::NATIVE_MOVE_ENDED_EVENT;

pub use kiroshi_core::desktop_events::NATIVE_MOVE_FAILED_EVENT;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NativeMoveEnded {
	pub label: String,
	pub point: ScreenPosition,
	#[specta(optional)]
	pub position: ScreenPosition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NativeMoveFailed {
	pub label: String,
	pub error: NativeWindowError,
}

#[derive(Default)]
pub struct WatchedMoves(Mutex<HashSet<String>>);

impl WatchedMoves {
	fn held(&self) -> MutexGuard<'_, HashSet<String>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

pub(super) struct Watch<R: Runtime> {
	app: AppHandle<R>,
	label: String,
}

impl<R: Runtime> Drop for Watch<R> {
	fn drop(&mut self) {
		watched_moves(&self.app).held().remove(&self.label);
	}
}

impl<R: Runtime> Watch<R> {
	fn is_live(&self) -> bool {
		watched_moves(&self.app).held().contains(&self.label)
	}

	pub(super) fn until_released(
		self,
		probe: impl FnMut() -> Result<Cursor, Unobservable>,
		place: impl FnMut(&Cursor) -> tauri::Result<()>,
		position_at: impl FnOnce(&Cursor) -> tauri::Result<LogicalPosition<f64>>,
	) {
		match cursor::follow(|| self.is_live(), probe, place) {
			Followed::Stopped => {}
			Followed::Released(cursor) => match position_at(&cursor) {
				Ok(position) => self.ended_at(&cursor, position),
				Err(failure) => self.lost(FollowFailure::Unplaced(failure)),
			},
			Followed::Lost(failure) => self.lost(failure),
		}
	}

	fn ended_at(&self, cursor: &Cursor, position: LogicalPosition<f64>) {
		let ended = NativeMoveEnded {
			label: self.label.clone(),
			point: cursor.point(),
			position: cursor::rounded(position),
		};
		if let Err(failure) = events::emit_to(&self.app, &self.label, NATIVE_MOVE_ENDED, ended) {
			log::error!(
				"the native move of the window {} ended unannounced: {failure}",
				self.label
			);
		}
	}

	fn lost(&self, failure: FollowFailure) {
		log::error!("the native move of the window {} stopped: {failure}", self.label);
		let failed = NativeMoveFailed { label: self.label.clone(), error: failure.into() };
		if let Err(failure) = events::emit_to(&self.app, &self.label, NATIVE_MOVE_FAILED, failed) {
			log::error!(
				"the native move of the window {} failed unannounced: {failure}",
				self.label
			);
		}
	}
}

impl From<FollowFailure> for NativeWindowError {
	fn from(failure: FollowFailure) -> Self {
		match failure {
			FollowFailure::Unobservable(unobservable) => unobservable.into(),
			FollowFailure::Unplaced(failure) => Self::NotMoved { reason: failure.to_string() },
		}
	}
}

impl From<Unobservable> for NativeWindowError {
	fn from(unobservable: Unobservable) -> Self {
		Self::CursorUnreadable { reason: unobservable.to_string() }
	}
}

pub(super) fn watch<R: Runtime>(window: &WebviewWindow<R>) -> Option<Watch<R>> {
	let app = window.app_handle();
	let label = window.label().to_owned();
	watched_moves(app).held().insert(label.clone()).then(|| Watch { app: app.clone(), label })
}

pub(super) fn stop_when_destroyed<R: Runtime>(window: &WebviewWindow<R>) {
	watched_moves(window.app_handle()).held().remove(window.label());
}

#[cfg(target_os = "macos")]
pub(super) fn follow_cursor<R: Runtime>(
	window: &WebviewWindow<R>,
	watch: Watch<R>,
) -> Result<(), NativeWindowError> {
	let grab = grab_of(window, &cursor::read(window)?)?;
	let moved = window.clone();
	watched_apart(move || {
		watch.until_released(
			|| cursor::read(&moved),
			|cursor| moved.set_position(cursor.placement(grab)),
			|cursor| Ok(cursor.origin_at(grab)),
		);
	})
}

#[cfg(any(not(target_os = "macos"), test))]
pub(super) fn follow_native_drag<R: Runtime>(
	window: &WebviewWindow<R>,
	watch: Watch<R>,
) -> Result<(), NativeWindowError> {
	window
		.start_dragging()
		.map_err(|failure| NativeWindowError::NotMoved { reason: failure.to_string() })?;
	let moved = window.clone();
	watched_apart(move || released_natively(watch, &moved, || cursor::read(&moved)))
}

#[cfg(any(not(target_os = "macos"), test))]
fn released_natively<R: Runtime>(
	watch: Watch<R>,
	moved: &WebviewWindow<R>,
	probe: impl FnMut() -> Result<Cursor, Unobservable>,
) {
	watch.until_released(
		probe,
		|_| Ok(()),
		|cursor| Ok(moved.outer_position()?.to_logical(cursor.scale)),
	);
}

fn watched_apart(watching: impl FnOnce() + Send + 'static) -> Result<(), NativeWindowError> {
	thread::Builder::new()
		.name("native-move".to_owned())
		.spawn(watching)
		.map(drop)
		.map_err(|failure| NativeWindowError::NotMoved { reason: failure.to_string() })
}

#[cfg(target_os = "macos")]
fn grab_of<R: Runtime>(
	window: &WebviewWindow<R>,
	cursor: &Cursor,
) -> Result<LogicalPosition<f64>, NativeWindowError> {
	let origin = window
		.scale_factor()
		.and_then(|scale| Ok(window.outer_position()?.to_logical::<f64>(scale)))
		.map_err(|failure| NativeWindowError::NotMoved { reason: failure.to_string() })?;
	Ok(cursor.grab_from(origin))
}

fn watched_moves<R: Runtime>(app: &AppHandle<R>) -> State<'_, WatchedMoves> {
	if app.try_state::<WatchedMoves>().is_none() {
		app.manage(WatchedMoves::default());
	}
	app.state::<WatchedMoves>()
}

#[cfg(test)]
mod tests {
	use std::cell::RefCell;
	use std::sync::mpsc;
	use std::time::Duration;

	use serde_json::{json, Value};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{
		Listener, LogicalPosition, PhysicalPosition, WebviewUrl, WebviewWindow,
		WebviewWindowBuilder,
	};

	use super::{
		follow_native_drag, released_natively, stop_when_destroyed, watch, Cursor, Unobservable,
	};
	use crate::events::{NATIVE_MOVE_ENDED, NATIVE_MOVE_FAILED};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const GRAB: LogicalPosition<f64> = LogicalPosition { x: 120.0, y: 18.0 };

	fn app() -> AppOfItsOwn {
		an_app_of_its_own("native-move", mock_builder())
	}

	fn window_of(app: &AppOfItsOwn, label: &str) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
			.build()
			.expect("the window opens")
	}

	fn heard_by(window: &WebviewWindow<MockRuntime>, event: &'static str) -> mpsc::Receiver<Value> {
		let (told, heard) = mpsc::channel();
		window.listen(event, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("JSON");
			told.send(payload).expect("the test listens");
		});
		heard
	}

	fn cursor_at(x: f64, y: f64, is_primary_pressed: bool) -> Cursor {
		Cursor { physical: PhysicalPosition::new(x, y), scale: 2.0, is_primary_pressed }
	}

	fn probed(mut readings: Vec<Cursor>) -> impl FnMut() -> Result<Cursor, Unobservable> {
		readings.reverse();
		move || Ok(readings.pop().expect("the cursor is read until the release"))
	}

	#[test]
	fn native_move_places_the_window_from_the_cursor_then_tells_the_origin_alone_where_it_ended() {
		let app = app();
		let (main, origin) = (window_of(&app, "main"), window_of(&app, "window-1"));
		let heard_by_main = heard_by(&main, NATIVE_MOVE_ENDED.name());
		let heard_by_origin = heard_by(&origin, NATIVE_MOVE_ENDED.name());
		let placed = RefCell::new(Vec::new());

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		watched.until_released(
			probed(vec![
				cursor_at(1000.0, 400.0, true),
				cursor_at(1100.0, 420.0, true),
				cursor_at(1280.8, 425.2, false),
			]),
			|cursor| {
				placed.borrow_mut().push(cursor.origin_at(GRAB));
				Ok(())
			},
			|cursor| Ok(cursor.origin_at(GRAB)),
		);

		assert_eq!(
			placed.into_inner(),
			vec![
				LogicalPosition::new(380.0, 182.0),
				LogicalPosition::new(430.0, 192.0),
				LogicalPosition::new(520.4, 194.6),
			]
		);
		let heard: Vec<Value> = heard_by_origin.try_iter().collect();
		assert_eq!(
			heard,
			vec![json!({
				"label": "window-1",
				"point": { "x": 640, "y": 213 },
				"position": { "x": 520, "y": 195 },
			})]
		);
		assert_eq!(heard_by_main.try_iter().count(), 0);
		assert!(watch(&origin).is_some(), "the watch ended with the release");
	}

	#[test]
	fn native_move_is_watched_once_per_window_while_the_primary_button_is_held() {
		let app = app();
		let (main, origin) = (window_of(&app, "main"), window_of(&app, "window-1"));

		let watched = watch(&origin).expect("no move of the origin is watched yet");

		assert!(watch(&origin).is_none(), "a second watcher started for the origin");
		assert!(watch(&main).is_some(), "another window is watched on its own");
		drop(watched);
		assert!(watch(&origin).is_some(), "the watch outlived its watcher");
	}

	#[test]
	fn native_move_of_a_window_destroyed_before_the_release_stays_silent() {
		let app = app();
		let origin = window_of(&app, "window-1");
		let heard = heard_by(&origin, NATIVE_MOVE_ENDED.name());
		let destroyed = origin.clone();
		let mut readings = probed(vec![cursor_at(0.0, 0.0, true), cursor_at(0.0, 0.0, false)]);

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		watched.until_released(
			move || {
				let reading = readings();
				stop_when_destroyed(&destroyed);
				reading
			},
			|_| Ok(()),
			|cursor| Ok(cursor.origin_at(GRAB)),
		);

		assert_eq!(heard.try_iter().count(), 0);
		assert!(watch(&origin).is_some(), "the watcher outlived the window");
	}

	#[test]
	fn native_move_whose_cursor_cannot_be_read_ends_with_a_typed_failure_sent_to_the_origin() {
		let app = app();
		let origin = window_of(&app, "window-1");
		let ended = heard_by(&origin, NATIVE_MOVE_ENDED.name());
		let failed = heard_by(&origin, NATIVE_MOVE_FAILED.name());

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		watched.until_released(
			|| Err(Unobservable { platform: "test", reason: "no pointer".to_owned() }),
			|_| Ok(()),
			|cursor| Ok(cursor.origin_at(GRAB)),
		);

		assert_eq!(ended.try_iter().count(), 0);
		let heard: Vec<Value> = failed.try_iter().collect();
		assert_eq!(
			heard,
			vec![json!({
				"label": "window-1",
				"error": {
					"kind": "cursorUnreadable",
					"reason": "the cursor is not observable on test: no pointer",
				},
			})]
		);
		assert!(watch(&origin).is_some(), "the watcher outlived the unobservable release");
	}

	#[test]
	fn a_native_drag_is_watched_without_placing_and_ends_at_the_position_the_os_left_the_window() {
		let app = app();
		let origin = window_of(&app, "window-1");
		let heard = heard_by(&origin, NATIVE_MOVE_ENDED.name());

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		released_natively(
			watched,
			&origin,
			probed(vec![cursor_at(1000.0, 400.0, true), cursor_at(1280.8, 425.2, false)]),
		);

		let heard: Vec<Value> = heard.try_iter().collect();
		assert_eq!(
			heard,
			vec![json!({
				"label": "window-1",
				"point": { "x": 640, "y": 213 },
				"position": { "x": 0, "y": 0 },
			})]
		);
		assert!(watch(&origin).is_some(), "the watch ended with the release");
	}

	#[test]
	fn a_native_drag_whose_cursor_cannot_be_read_tells_the_origin_and_leaves_the_window_to_the_os()
	{
		let app = app();
		let origin = window_of(&app, "window-1");
		let ended = heard_by(&origin, NATIVE_MOVE_ENDED.name());
		let failed = heard_by(&origin, NATIVE_MOVE_FAILED.name());

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		follow_native_drag(&origin, watched).expect("the os drag starts");

		let failure = failed.recv_timeout(Duration::from_secs(5)).expect("the failure is told");
		assert_eq!(failure["label"], "window-1");
		assert_eq!(failure["error"]["kind"], "cursorUnreadable");
		assert_eq!(ended.try_iter().count(), 0);
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn native_move_refuses_with_a_typed_error_when_the_host_cannot_read_the_cursor() {
		use tauri::ipc::CallbackFn;
		use tauri::test::{get_ipc_response, INVOKE_KEY};
		use tauri::webview::InvokeRequest;

		let app = an_app_of_its_own(
			"native-move-command",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		let origin = window_of(&app, "window-1");
		let heard = heard_by(&origin, NATIVE_MOVE_ENDED.name());

		let answer = get_ipc_response(
			&origin,
			InvokeRequest {
				cmd: "window_start_native_move".into(),
				callback: CallbackFn(0),
				error: CallbackFn(1),
				url: "tauri://localhost".parse().expect("a url"),
				body: json!({}).into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		);

		let refusal = answer.expect_err("the mock runtime has no primary monitor to read under");
		assert_eq!(
			refusal,
			json!({
				"kind": "cursorUnreadable",
				"reason": "the cursor is not observable on macos: no primary monitor is attached",
			})
		);
		assert_eq!(heard.try_iter().count(), 0);
		assert!(watch(&origin).is_some(), "the watch outlived the refusal");
	}
}
