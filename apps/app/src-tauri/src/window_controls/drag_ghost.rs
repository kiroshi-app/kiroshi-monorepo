use serde::{Deserialize, Serialize};
use tauri::{
	AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, WebviewUrl, WebviewWindow,
	WebviewWindowBuilder,
};

use super::secondary::{ScreenPosition, WindowSize};
use crate::events;

pub const DRAG_GHOST: &str = "drag-ghost";

pub const DRAG_GHOST_ROUTE: &str = "/drag-ghost.html";

pub const TAB_EVENT: &str = "drag-ghost-tab";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DragGhostTab {
	pub tab_id: String,
	pub href: String,
	pub title: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub struct DragGhostSupport {
	pub supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DragGhostError {
	Unavailable,
}

const UNSUPPORTED: DragGhostSupport = DragGhostSupport { supported: false };

const SUPPORTED: DragGhostSupport = DragGhostSupport { supported: true };

#[tauri::command]
#[specta::specta]
pub fn drag_ghost_show<R: Runtime>(
	app: AppHandle<R>,
	at: ScreenPosition,
	size: WindowSize,
	tab: DragGhostTab,
) -> Result<DragGhostSupport, DragGhostError> {
	if !is_supported() {
		return Ok(UNSUPPORTED);
	}
	let ghost = ghost_of(&app)?;
	events::emit_to(&app, DRAG_GHOST, events::DRAG_GHOST_TAB, tab)
		.map_err(|failure| unavailable("handed its tab", &failure))?;
	ghost
		.set_size(LogicalSize::new(f64::from(size.width), f64::from(size.height)))
		.and_then(|()| ghost.set_position(logical(at)))
		.and_then(|()| ghost.show())
		.map_err(|failure| unavailable("shown", &failure))?;
	Ok(SUPPORTED)
}

#[tauri::command]
#[specta::specta]
pub fn drag_ghost_move<R: Runtime>(
	app: AppHandle<R>,
	at: ScreenPosition,
) -> Result<DragGhostSupport, DragGhostError> {
	if !is_supported() {
		return Ok(UNSUPPORTED);
	}
	ghost_of(&app)?.set_position(logical(at)).map_err(|failure| unavailable("moved", &failure))?;
	Ok(SUPPORTED)
}

#[tauri::command]
#[specta::specta]
pub fn drag_ghost_hide<R: Runtime>(app: AppHandle<R>) -> Result<DragGhostSupport, DragGhostError> {
	if !is_supported() {
		return Ok(UNSUPPORTED);
	}
	ghost_of(&app)?.hide().map_err(|failure| unavailable("hidden", &failure))?;
	Ok(SUPPORTED)
}

pub fn open<R: Runtime>(app: &AppHandle<R>) {
	if !is_supported() {
		return;
	}
	let ghost = match built(app) {
		Ok(ghost) => ghost,
		Err(failure) => return eprintln!("the drag ghost did not open: {failure}"),
	};
	if let Err(failure) = ghost.set_ignore_cursor_events(true) {
		eprintln!("the drag ghost could not let clicks through, it is closed: {failure}");
		if let Err(failure) = ghost.destroy() {
			eprintln!("the drag ghost that catches clicks was not closed: {failure}");
		}
		return;
	}
	#[cfg(debug_assertions)]
	rehearsal::run_when_asked(app);
}

fn built<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
	let route = DRAG_GHOST_ROUTE.trim_start_matches('/');
	WebviewWindowBuilder::new(app, DRAG_GHOST, WebviewUrl::App(route.into()))
		.visible(false)
		.transparent(true)
		.decorations(false)
		.shadow(false)
		.resizable(false)
		.always_on_top(true)
		.skip_taskbar(true)
		.focusable(false)
		.focused(false)
		.build()
}

fn is_supported() -> bool {
	supports_drag_ghost(std::env::consts::OS)
}

fn supports_drag_ghost(os: &str) -> bool {
	matches!(os, "macos" | "windows")
}

fn ghost_of<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, DragGhostError> {
	app.get_webview_window(DRAG_GHOST).ok_or_else(|| {
		eprintln!("the drag ghost is not open");
		DragGhostError::Unavailable
	})
}

fn logical(at: ScreenPosition) -> LogicalPosition<f64> {
	LogicalPosition::new(f64::from(at.x), f64::from(at.y))
}

fn unavailable(gesture: &str, failure: &tauri::Error) -> DragGhostError {
	eprintln!("the drag ghost was not {gesture}: {failure}");
	DragGhostError::Unavailable
}

#[cfg(debug_assertions)]
mod rehearsal {
	use std::thread;
	use std::time::Duration;

	use tauri::window::Color;
	use tauri::{AppHandle, Manager, Runtime};

	use super::{drag_ghost_hide, drag_ghost_move, drag_ghost_show, DragGhostTab, DRAG_GHOST};
	use crate::window_controls::secondary::{ScreenPosition, WindowSize};

	const FLAG: &str = "KIROSHI_DRAG_GHOST_REHEARSAL";
	const SETTLING: Duration = Duration::from_secs(3);
	const FRAME: Duration = Duration::from_millis(16);
	const FRAMES: u32 = 300;
	const SIZE: WindowSize = WindowSize { width: 320, height: 200 };
	const TINT: Color = Color(255, 64, 64, 96);
	const CLEAR: Color = Color(0, 0, 0, 0);

	pub(super) fn run_when_asked<R: Runtime>(app: &AppHandle<R>) {
		if std::env::var_os(FLAG).is_none() {
			return;
		}
		let app = app.clone();
		thread::spawn(move || {
			thread::sleep(SETTLING);
			if let Err(failure) = rehearse(&app) {
				eprintln!("the drag ghost rehearsal stopped: {failure}");
			}
		});
	}

	fn rehearse<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
		let ghost = app.get_webview_window(DRAG_GHOST).ok_or("the drag ghost is not open")?;
		ghost.set_background_color(Some(TINT)).map_err(|failure| failure.to_string())?;
		let tab = DragGhostTab {
			tab_id: "rehearsal".to_owned(),
			href: "/".to_owned(),
			title: "Rehearsal".to_owned(),
		};
		drag_ghost_show(app.clone(), pointer(app)?, SIZE, tab)
			.map_err(|failure| format!("{failure:?}"))?;
		for _ in 0..FRAMES {
			thread::sleep(FRAME);
			drag_ghost_move(app.clone(), pointer(app)?)
				.map_err(|failure| format!("{failure:?}"))?;
		}
		drag_ghost_hide(app.clone()).map_err(|failure| format!("{failure:?}"))?;
		ghost.set_background_color(Some(CLEAR)).map_err(|failure| failure.to_string())
	}

	fn pointer<R: Runtime>(app: &AppHandle<R>) -> Result<ScreenPosition, String> {
		let scale = app
			.get_webview_window(DRAG_GHOST)
			.ok_or("the drag ghost is not open")?
			.scale_factor()
			.map_err(|failure| failure.to_string())?;
		let at =
			app.cursor_position().map_err(|failure| failure.to_string())?.to_logical::<f64>(scale);
		Ok(ScreenPosition { x: at.x.round() as i32, y: at.y.round() as i32 })
	}
}

#[cfg(test)]
mod tests {
	use super::{supports_drag_ghost, DRAG_GHOST};
	use crate::window_controls::is_app_window;

	#[test]
	fn the_drag_ghost_is_supported_on_macos_and_windows() {
		assert!(supports_drag_ghost("macos"));
		assert!(supports_drag_ghost("windows"));
	}

	#[test]
	fn the_drag_ghost_is_unsupported_on_linux_and_anywhere_else() {
		for os in ["linux", "freebsd", ""] {
			assert!(!supports_drag_ghost(os), "{os} was supported");
		}
	}

	#[test]
	fn the_drag_ghost_is_no_app_window() {
		assert!(!is_app_window(DRAG_GHOST));
	}
}
