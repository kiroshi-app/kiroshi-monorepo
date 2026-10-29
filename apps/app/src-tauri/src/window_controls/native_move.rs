use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, State, WebviewWindow};

use super::secondary::ScreenPosition;
use crate::events::{self, NATIVE_MOVE_ENDED};

pub const NATIVE_MOVE_ENDED_EVENT: &str = "window://native-move-ended";

const PROBE_INTERVAL: Duration = Duration::from_millis(16);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NativeMoveEnded {
	pub label: String,
	pub point: ScreenPosition,
}

pub(super) enum PrimaryButton {
	#[cfg_attr(target_os = "macos", allow(dead_code))]
	Pressed,
	Released(PhysicalPosition<f64>),
}

pub(super) struct Unobservable {
	platform: &'static str,
	reason: String,
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
		mut probe: impl FnMut() -> Result<PrimaryButton, Unobservable>,
	) {
		while self.is_live() {
			match probe() {
				Ok(PrimaryButton::Pressed) => thread::sleep(PROBE_INTERVAL),
				Ok(PrimaryButton::Released(at)) => return self.ended_at(at),
				Err(unobservable) => return unobservable.report(&self.label),
			}
		}
	}

	fn ended_at(self, at: PhysicalPosition<f64>) {
		let Some(window) = self.app.get_webview_window(&self.label) else {
			return;
		};
		let announced = window.scale_factor().and_then(|scale| {
			let at = at.to_logical::<f64>(scale);
			let point = ScreenPosition { x: at.x.round() as i32, y: at.y.round() as i32 };
			let ended = NativeMoveEnded { label: self.label.clone(), point };
			events::emit_to(&self.app, &self.label, NATIVE_MOVE_ENDED, ended)
		});
		if let Err(failure) = announced {
			eprintln!("the native move of the window {} ended unannounced: {failure}", self.label);
		}
	}
}

impl Unobservable {
	fn report(&self, label: &str) {
		eprintln!(
			"the end of the native move of the window {label} is not observable on {}: {}",
			self.platform, self.reason
		);
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
pub(super) fn follow_release<R: Runtime>(watch: Watch<R>) {
	let app = watch.app.clone();
	watch.until_released(|| {
		app.cursor_position().map(PrimaryButton::Released).map_err(|failure| Unobservable {
			platform: "macos",
			reason: format!("the cursor position could not be read: {failure}"),
		})
	});
}

#[cfg(any(windows, target_os = "linux"))]
pub(super) fn follow_release<R: Runtime>(watch: Watch<R>) {
	let label = watch.label.clone();
	let spawned = thread::Builder::new().name("native-move-watch".to_owned()).spawn(move || {
		#[cfg(windows)]
		watch.until_released(win32::primary_button);
		#[cfg(target_os = "linux")]
		{
			let app = watch.app.clone();
			watch.until_released(|| x11::primary_button(&app));
		}
	});
	if let Err(failure) = spawned {
		Unobservable { platform: std::env::consts::OS, reason: failure.to_string() }.report(&label);
	}
}

fn watched_moves<R: Runtime>(app: &AppHandle<R>) -> State<'_, WatchedMoves> {
	if app.try_state::<WatchedMoves>().is_none() {
		app.manage(WatchedMoves::default());
	}
	app.state::<WatchedMoves>()
}

#[cfg(windows)]
mod win32 {
	use tauri::PhysicalPosition;
	use windows::Win32::Foundation::POINT;
	use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
	use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, SM_SWAPBUTTON};

	use super::{PrimaryButton, Unobservable};

	const IS_DOWN: i16 = i16::MIN;

	pub(super) fn primary_button() -> Result<PrimaryButton, Unobservable> {
		let primary =
			if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } == 0 { VK_LBUTTON } else { VK_RBUTTON };
		if unsafe { GetAsyncKeyState(i32::from(primary.0)) } & IS_DOWN != 0 {
			return Ok(PrimaryButton::Pressed);
		}
		let mut at = POINT::default();
		unsafe { GetCursorPos(&mut at) }.map_err(|failure| Unobservable {
			platform: "windows",
			reason: format!("the cursor position could not be read: {failure}"),
		})?;
		Ok(PrimaryButton::Released(PhysicalPosition::new(f64::from(at.x), f64::from(at.y))))
	}
}

#[cfg(target_os = "linux")]
mod x11 {
	use std::sync::mpsc;
	use std::time::Duration;

	use gtk::gdk::prelude::*;
	use gtk::gdk::{Display, ModifierType};
	use tauri::{AppHandle, LogicalPosition, Runtime};

	use super::{PrimaryButton, Unobservable};

	const MAIN_THREAD_ANSWER: Duration = Duration::from_secs(1);

	pub(super) fn primary_button<R: Runtime>(
		app: &AppHandle<R>,
	) -> Result<PrimaryButton, Unobservable> {
		let (told, heard) = mpsc::channel();
		app.run_on_main_thread(move || {
			if told.send(probed()).is_err() {
				eprintln!("the native move watcher stopped before the pointer was probed");
			}
		})
		.map_err(|failure| {
			unobservable("linux", format!("the pointer was not probed: {failure}"))
		})?;
		heard.recv_timeout(MAIN_THREAD_ANSWER).map_err(|failure| {
			unobservable("linux", format!("the pointer probe did not answer: {failure}"))
		})?
	}

	fn probed() -> Result<PrimaryButton, Unobservable> {
		let display = Display::default()
			.ok_or_else(|| unobservable("linux", "no display is open".to_owned()))?;
		if !display.backend().is_x11() {
			return Err(unobservable(
				"linux wayland",
				"the compositor exposes no global cursor position".to_owned(),
			));
		}
		let pointer = display
			.default_seat()
			.and_then(|seat| seat.pointer())
			.ok_or_else(|| unobservable("linux x11", "no pointer is attached".to_owned()))?;
		let root = display
			.default_screen()
			.root_window()
			.ok_or_else(|| unobservable("linux x11", "the screen has no root window".to_owned()))?;
		let (_, x, y, held) = root.device_position_double(&pointer);
		if held.contains(ModifierType::BUTTON1_MASK) {
			return Ok(PrimaryButton::Pressed);
		}
		let scale = f64::from(display.default_group().scale_factor());
		Ok(PrimaryButton::Released(LogicalPosition::new(x, y).to_physical(scale)))
	}

	fn unobservable(platform: &'static str, reason: String) -> Unobservable {
		Unobservable { platform, reason }
	}
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc;

	use serde_json::{json, Value};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{Listener, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

	use super::{stop_when_destroyed, watch, PrimaryButton, Unobservable};
	use crate::events::NATIVE_MOVE_ENDED;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const RELEASE: PhysicalPosition<f64> = PhysicalPosition { x: 640.4, y: 212.6 };

	fn app() -> AppOfItsOwn {
		an_app_of_its_own("native-move", mock_builder())
	}

	fn window_of(app: &AppOfItsOwn, label: &str) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
			.build()
			.expect("the window opens")
	}

	fn heard_by(window: &WebviewWindow<MockRuntime>) -> mpsc::Receiver<Value> {
		let (told, heard) = mpsc::channel();
		window.listen(NATIVE_MOVE_ENDED.name(), move |event| {
			let payload = serde_json::from_str(event.payload()).expect("JSON");
			told.send(payload).expect("the test listens");
		});
		heard
	}

	fn probed(
		mut readings: Vec<PrimaryButton>,
	) -> impl FnMut() -> Result<PrimaryButton, Unobservable> {
		readings.reverse();
		move || Ok(readings.pop().expect("the probe is read until the release"))
	}

	#[test]
	fn native_move_ended_reaches_the_origin_alone_once_the_probed_primary_button_is_released() {
		let app = app();
		let (main, origin) = (window_of(&app, "main"), window_of(&app, "window-1"));
		let (heard_by_main, heard_by_origin) = (heard_by(&main), heard_by(&origin));

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		watched.until_released(probed(vec![
			PrimaryButton::Pressed,
			PrimaryButton::Pressed,
			PrimaryButton::Released(RELEASE),
		]));

		let heard: Vec<Value> = heard_by_origin.try_iter().collect();
		assert_eq!(heard, vec![json!({ "label": "window-1", "point": { "x": 640, "y": 213 } })]);
		assert_eq!(heard_by_main.try_iter().count(), 0);
		assert!(watch(&origin).is_some(), "the watch ended with the release");
	}

	#[test]
	fn native_move_is_watched_once_per_window_while_the_probed_primary_button_is_held() {
		let app = app();
		let (main, origin) = (window_of(&app, "main"), window_of(&app, "window-1"));

		let watched = watch(&origin).expect("no move of the origin is watched yet");

		assert!(watch(&origin).is_none(), "a second watcher started for the origin");
		assert!(watch(&main).is_some(), "another window is watched on its own");
		drop(watched);
		assert!(watch(&origin).is_some(), "the watch outlived its watcher");
	}

	#[test]
	fn native_move_of_a_window_destroyed_before_the_probed_primary_button_is_released_stays_silent()
	{
		let app = app();
		let origin = window_of(&app, "window-1");
		let heard = heard_by(&origin);
		let destroyed = origin.clone();
		let mut readings = probed(vec![PrimaryButton::Pressed, PrimaryButton::Released(RELEASE)]);

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		watched.until_released(move || {
			let reading = readings();
			stop_when_destroyed(&destroyed);
			reading
		});

		assert_eq!(heard.try_iter().count(), 0);
		assert!(watch(&origin).is_some(), "the watcher outlived the window");
	}

	#[test]
	fn native_move_whose_probed_primary_button_cannot_be_read_stays_silent() {
		let app = app();
		let origin = window_of(&app, "window-1");
		let heard = heard_by(&origin);

		let watched = watch(&origin).expect("no move of the origin is watched yet");
		watched.until_released(|| {
			Err(Unobservable { platform: "test", reason: "no pointer".to_owned() })
		});

		assert_eq!(heard.try_iter().count(), 0);
		assert!(watch(&origin).is_some(), "the watcher outlived the unobservable release");
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn native_move_ended_reaches_the_origin_once_start_dragging_returned_on_macos() {
		use tauri::ipc::CallbackFn;
		use tauri::test::{get_ipc_response, INVOKE_KEY};
		use tauri::webview::InvokeRequest;

		let app = an_app_of_its_own(
			"native-move-command",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		let origin = window_of(&app, "window-1");
		let heard = heard_by(&origin);

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

		assert!(answer.is_ok(), "the native move was refused: {answer:?}");
		let heard: Vec<Value> = heard.try_iter().collect();
		assert_eq!(heard, vec![json!({ "label": "window-1", "point": { "x": 0, "y": 0 } })]);
		assert!(watch(&origin).is_some(), "the watch ended with the release");
	}
}
