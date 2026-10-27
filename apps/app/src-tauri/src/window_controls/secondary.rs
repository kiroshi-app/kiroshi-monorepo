use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use tauri::utils::config::WindowConfig;
use tauri::{AppHandle, Manager, Runtime, State, WebviewWindow, WindowEvent};

use super::{built, main_config};

const SECONDARY_PREFIX: &str = "window-";

const CASCADE_OFFSET: f64 = 30.0;

static NEXT_SECONDARY: AtomicU64 = AtomicU64::new(1);

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
}

#[derive(Default)]
pub struct OpenedWindows(Mutex<HashMap<String, String>>);

impl OpenedWindows {
	fn initial_hrefs(&self) -> MutexGuard<'_, HashMap<String, String>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Placement {
	width: f64,
	height: f64,
	x: f64,
	y: f64,
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
	let config = secondary_config(main, fresh_label(), beside(caller));
	opened_windows(app).initial_hrefs().insert(config.label.clone(), href);
	match built(app, &config) {
		Ok(opened) => {
			forgotten_once_destroyed(&opened);
			Ok(())
		}
		Err(failure) => {
			opened_windows(app).initial_hrefs().remove(&config.label);
			eprintln!("the window {} did not open: {failure}", config.label);
			Err(WindowOpenError::Unavailable)
		}
	}
}

#[tauri::command]
#[specta::specta]
pub fn window_identity<R: Runtime>(window: WebviewWindow<R>) -> WindowIdentity {
	let label = window.label().to_owned();
	let initial_href = opened_windows(window.app_handle()).initial_hrefs().get(&label).cloned();
	WindowIdentity { label, initial_href }
}

fn is_app_page(href: &str) -> bool {
	href.starts_with('/')
		&& !href.starts_with("//")
		&& !href.chars().any(|letter| letter == '\\' || letter.is_control())
}

fn fresh_label() -> String {
	format!("{SECONDARY_PREFIX}{}", NEXT_SECONDARY.fetch_add(1, Ordering::Relaxed))
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

fn forgotten_once_destroyed<R: Runtime>(window: &WebviewWindow<R>) {
	let subject = window.clone();
	window.on_window_event(move |event| {
		if matches!(event, WindowEvent::Destroyed) {
			opened_windows(subject.app_handle()).initial_hrefs().remove(subject.label());
		}
	});
}

#[cfg(test)]
mod tests {
	use tauri::utils::config::WindowConfig;

	use super::{beside, fresh_label, is_app_page, is_secondary, secondary_config, Placement};

	const CALLER: Placement = Placement { width: 1400.0, height: 900.0, x: 120.0, y: 64.0 };

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
	fn every_fresh_label_is_a_new_secondary_label() {
		let first = fresh_label();
		let second = fresh_label();

		assert_ne!(first, second);
		assert!(is_secondary(&first) && is_secondary(&second));
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
}
