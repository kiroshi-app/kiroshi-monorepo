use std::any::TypeId;

use serde::{Deserialize, Serialize};
use tauri::utils::config::WindowConfig;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub use secondary::is_secondary;

#[cfg(target_os = "macos")]
pub use macos::center_in_header;

#[cfg(any(windows, test))]
mod overlays;
#[cfg(any(windows, test))]
mod pointer;
pub(crate) mod secondary;
#[cfg(windows)]
mod win32;
#[cfg(windows)]
use win32::declare_maximize_button;
#[cfg(windows)]
pub use win32::frame;

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MaximizeButtonBounds {
	#[specta(type = u32)]
	pub x: f64,
	#[specta(type = u32)]
	pub y: f64,
	#[specta(type = u32)]
	pub width: f64,
	#[specta(type = u32)]
	pub height: f64,
}

pub const MAXIMIZE_BUTTON_EVENT: &str = "window-maximize-button";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum MaximizeButtonState {
	Idle,
	Hover,
	Pressed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct MaximizeButtonPointer {
	pub state: MaximizeButtonState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[cfg_attr(not(windows), allow(dead_code))]
pub enum WindowFrameError {
	#[cfg_attr(windows, allow(dead_code))]
	Unsupported,
	InvalidBounds,
	Unavailable,
	OverlayFailed,
}

#[tauri::command]
#[specta::specta]
pub async fn window_declare_maximize_button<R: Runtime>(
	window: WebviewWindow<R>,
	bounds: Option<MaximizeButtonBounds>,
) -> Result<(), WindowFrameError> {
	declare_maximize_button(window, bounds).await
}

#[cfg(not(windows))]
async fn declare_maximize_button<R: Runtime>(
	_window: WebviewWindow<R>,
	_bounds: Option<MaximizeButtonBounds>,
) -> Result<(), WindowFrameError> {
	eprintln!("the maximize button is declared only on Windows");
	Err(WindowFrameError::Unsupported)
}

#[cfg(not(target_os = "macos"))]
pub fn center_in_header<R: Runtime>(_window: &WebviewWindow<R>) {}

pub const MAIN_WINDOW: &str = "main";

const HEADLESS_FLAG: &str = "--headless";

pub fn is_headless(args: impl IntoIterator<Item = String>) -> bool {
	args.into_iter().any(|arg| arg == HEADLESS_FLAG)
}

pub fn is_app_window(label: &str) -> bool {
	label == MAIN_WINDOW || secondary::is_secondary(label)
}

pub fn focused_app_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
	app.webview_windows().into_iter().filter(|(label, _)| is_app_window(label)).find_map(
		|(_, window)| match window.is_focused() {
			Ok(is_focused) => is_focused.then_some(window),
			Err(failure) => {
				eprintln!(
					"the focus of the window {} could not be read: {failure}",
					window.label()
				);
				None
			}
		},
	)
}

pub fn receiving_window<R: Runtime>(app: &AppHandle<R>) -> String {
	if let Some(focused) = focused_app_window(app) {
		return focused.label().to_owned();
	}
	raise_main(app);
	MAIN_WINDOW.to_owned()
}

#[derive(Debug, PartialEq, Eq)]
enum Closing {
	Hidden,
	Closed,
	Quit,
}

fn closing_on(os: &str, label: &str, has_another_app_window: bool) -> Closing {
	match (os == "macos", label == MAIN_WINDOW, has_another_app_window) {
		(true, true, _) => Closing::Hidden,
		(true, false, _) | (false, _, true) => Closing::Closed,
		(false, _, false) => Closing::Quit,
	}
}

pub fn raise_main<R: Runtime>(app: &AppHandle<R>) {
	let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
		return open_main(app);
	};
	if let Err(failure) =
		window.unminimize().and_then(|()| window.show()).and_then(|()| window.set_focus())
	{
		eprintln!("the main window was not raised: {failure}");
	}
}

pub fn open_main<R: Runtime>(app: &AppHandle<R>) {
	let Some(config) = main_config(app) else {
		return eprintln!("the config declares no main window");
	};
	if let Err(failure) = built(app, &config) {
		eprintln!("the main window did not open: {failure}");
	}
}

fn main_config<R: Runtime>(app: &AppHandle<R>) -> Option<WindowConfig> {
	app.config().app.windows.iter().find(|window| window.label == MAIN_WINDOW).cloned()
}

fn built<R: Runtime>(app: &AppHandle<R>, config: &WindowConfig) -> tauri::Result<WebviewWindow<R>> {
	let window = WebviewWindowBuilder::from_config(app, config)?.build()?;
	closed_per_platform(&window);
	if draws_native_windows::<R>() {
		let dressed = window.clone();
		if let Err(failure) = window.run_on_main_thread(move || dress(&dressed)) {
			eprintln!("the window {} kept its default chrome: {failure}", window.label());
		}
	}
	Ok(window)
}

fn draws_native_windows<R: Runtime>() -> bool {
	TypeId::of::<R>() == TypeId::of::<tauri::Wry>()
}

fn dress<R: Runtime>(window: &WebviewWindow<R>) {
	center_in_header(window);
	#[cfg(windows)]
	frame(window);
}

fn has_another_app_window<R: Runtime>(window: &WebviewWindow<R>) -> bool {
	window
		.app_handle()
		.webview_windows()
		.keys()
		.any(|label| label != window.label() && is_app_window(label))
}

fn closed_per_platform<R: Runtime>(window: &WebviewWindow<R>) {
	let subject = window.clone();
	window.on_window_event(move |event| {
		let WindowEvent::CloseRequested { api, .. } = event else {
			return;
		};
		match closing_on(std::env::consts::OS, subject.label(), has_another_app_window(&subject)) {
			Closing::Closed => {}
			Closing::Hidden => {
				api.prevent_close();
				if let Err(failure) = subject.hide() {
					eprintln!("the main window was not hidden on close: {failure}");
				}
			}
			Closing::Quit => {
				api.prevent_close();
				subject.app_handle().exit(0);
			}
		}
	});
}

#[cfg(test)]
mod tests {
	use super::{closing_on, is_app_window, is_headless, Closing, MAIN_WINDOW};

	fn launched_with(args: &[&str]) -> bool {
		is_headless(args.iter().map(|arg| (*arg).to_owned()))
	}

	#[test]
	fn a_launch_carrying_the_headless_flag_is_headless() {
		assert!(launched_with(&["Kiroshi", "--headless"]));
	}

	#[test]
	fn a_launch_without_the_headless_flag_is_not_headless() {
		assert!(!launched_with(&["Kiroshi"]));
		assert!(!launched_with(&["Kiroshi", "--headless=false", "headless"]));
	}

	#[test]
	fn closing_the_main_window_on_macos_hides_it_whatever_else_is_open() {
		assert_eq!(closing_on("macos", MAIN_WINDOW, false), Closing::Hidden);
		assert_eq!(closing_on("macos", MAIN_WINDOW, true), Closing::Hidden);
	}

	#[test]
	fn closing_a_secondary_window_on_macos_closes_only_it() {
		assert_eq!(closing_on("macos", "window-1", true), Closing::Closed);
		assert_eq!(closing_on("macos", "window-1", false), Closing::Closed);
	}

	#[test]
	fn closing_the_last_app_window_elsewhere_quits() {
		for os in ["windows", "linux"] {
			assert_eq!(closing_on(os, MAIN_WINDOW, false), Closing::Quit);
			assert_eq!(closing_on(os, "window-1", false), Closing::Quit);
		}
	}

	#[test]
	fn closing_an_app_window_elsewhere_while_another_is_open_closes_only_it() {
		for os in ["windows", "linux"] {
			assert_eq!(closing_on(os, MAIN_WINDOW, true), Closing::Closed);
			assert_eq!(closing_on(os, "window-1", true), Closing::Closed);
		}
	}

	#[test]
	fn main_and_the_secondary_windows_are_app_windows_and_the_dispatcher_is_not() {
		assert!(is_app_window(MAIN_WINDOW));
		assert!(is_app_window("window-7"));
		assert!(!is_app_window("dispatcher"));
		assert!(!is_app_window("window-"));
	}
}

#[cfg(target_os = "macos")]
mod macos {
	use objc2::rc::Retained;
	use objc2::runtime::NSObject;
	use objc2::{define_class, msg_send, sel, AllocAnyThread};
	use objc2_app_kit::{
		NSButton, NSView, NSWindow, NSWindowButton, NSWindowDidExitFullScreenNotification,
		NSWindowStyleMask,
	};
	use objc2_foundation::{NSNotification, NSNotificationCenter, NSPoint};
	use tauri::{Runtime, WebviewWindow, WindowEvent};

	const LEADING_INSET: f64 = 12.0;
	// Mirrors TITLE_BAR (h-10) in packages/ui/src/components/app-sidebar.tsx.
	const TITLE_BAR_HEIGHT: f64 = 40.0;
	const CONTROL_DIAMETER: f64 = 14.0;

	define_class!(
		#[unsafe(super(NSObject))]
		#[name = "KiroshiFullscreenExitObserver"]
		struct FullscreenExitObserver;

		impl FullscreenExitObserver {
			#[unsafe(method(windowDidExitFullScreen:))]
			fn window_did_exit_full_screen(&self, notification: &NSNotification) {
				let Some(ns_window) =
					notification.object().and_then(|object| object.downcast::<NSWindow>().ok())
				else {
					return;
				};
				place(&ns_window);
			}
		}
	);

	impl FullscreenExitObserver {
		fn observe(ns_window: &NSWindow) -> Retained<Self> {
			let this = Self::alloc().set_ivars(());
			let observer: Retained<Self> = unsafe { msg_send![super(this), init] };
			unsafe {
				NSNotificationCenter::defaultCenter().addObserver_selector_name_object(
					&observer,
					sel!(windowDidExitFullScreen:),
					Some(NSWindowDidExitFullScreenNotification),
					Some(ns_window),
				);
			}
			observer
		}

		fn stop(&self) {
			unsafe { NSNotificationCenter::defaultCenter().removeObserver(self) };
		}
	}

	pub fn center_in_header<R: Runtime>(window: &WebviewWindow<R>) {
		let Some(ns_window) = main_window(window) else {
			return;
		};
		place(&ns_window);
		let exit_observer = FullscreenExitObserver::observe(&ns_window);
		let subject = window.clone();
		window.on_window_event(move |event| match event {
			WindowEvent::Resized(_) => {
				let replaced = subject.clone();
				let _ = subject.run_on_main_thread(move || {
					if let Some(ns_window) = main_window(&replaced) {
						place(&ns_window);
					}
				});
			}
			WindowEvent::Destroyed => exit_observer.stop(),
			_ => {}
		});
	}

	fn place(ns_window: &NSWindow) {
		if ns_window.styleMask().contains(NSWindowStyleMask::FullScreen) {
			return;
		}
		let Some(controls) = window_buttons(ns_window) else {
			return;
		};
		let Some(titlebar) = titlebar_of(&controls[0]) else {
			return;
		};

		let control = controls[0].frame();
		let spacing = controls[1].frame().origin.x - control.origin.x;
		let top = frame_top(control.size.height);
		let titlebar_height = fit_titlebar(ns_window, &titlebar, top + control.size.height);

		let origin_x = LEADING_INSET - visible_inset(control.size.width);
		let origin_y = titlebar_height - top - control.size.height;
		for (rank, button) in controls.iter().enumerate() {
			button.setFrameOrigin(NSPoint::new(origin_x + rank as f64 * spacing, origin_y));
		}
	}

	fn visible_inset(measured: f64) -> f64 {
		(measured - CONTROL_DIAMETER) / 2.0
	}

	fn frame_top(measured_height: f64) -> f64 {
		(TITLE_BAR_HEIGHT - CONTROL_DIAMETER) / 2.0 - visible_inset(measured_height)
	}

	fn fit_titlebar(ns_window: &NSWindow, titlebar: &NSView, height: f64) -> f64 {
		let mut frame = titlebar.frame();
		frame.origin.y = ns_window.frame().size.height - height;
		frame.size.height = height;
		titlebar.setFrame(frame);
		titlebar.frame().size.height
	}

	fn main_window<R: Runtime>(window: &WebviewWindow<R>) -> Option<Retained<NSWindow>> {
		let handle = window.ns_window().ok()?;
		unsafe { Retained::retain(handle.cast::<NSWindow>()) }
	}

	fn window_buttons(ns_window: &NSWindow) -> Option<[Retained<NSButton>; 3]> {
		Some([
			ns_window.standardWindowButton(NSWindowButton::CloseButton)?,
			ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton)?,
			ns_window.standardWindowButton(NSWindowButton::ZoomButton)?,
		])
	}

	fn titlebar_of(control: &NSButton) -> Option<Retained<NSView>> {
		unsafe { control.superview()?.superview() }
	}

	#[cfg(test)]
	mod tests {
		use super::frame_top;

		fn centre(measured_height: f64) -> f64 {
			frame_top(measured_height) + measured_height / 2.0
		}

		#[test]
		fn centres_a_button_measured_at_the_visible_diameter_on_the_title_bar() {
			assert_eq!(centre(14.0), 20.0);
		}

		#[test]
		fn centres_a_button_measured_with_padding_on_the_title_bar() {
			assert_eq!(centre(16.0), 20.0);
		}
	}
}
