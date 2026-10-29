pub mod commands;
#[cfg(target_os = "windows")]
mod overlay;

use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::window_controls;

#[derive(Default)]
pub struct Badge(AtomicU32);

fn badge_count(count: u32) -> Option<i64> {
	(count > 0).then(|| i64::from(count))
}

pub fn wear<R: Runtime>(app: &AppHandle<R>, count: u32) -> Result<(), String> {
	app.state::<Badge>().0.store(count, Ordering::SeqCst);
	let failures: Vec<String> = app
		.webview_windows()
		.into_iter()
		.filter(|(label, _)| window_controls::is_app_window(label))
		.filter_map(|(label, window)| {
			worn_by(&window, badge_count(count)).err().map(|failure| format!("{label}: {failure}"))
		})
		.collect();
	if failures.is_empty() {
		return Ok(());
	}
	Err(failures.join("; "))
}

#[cfg(target_os = "windows")]
pub fn wear_on_opening<R: Runtime>(window: &WebviewWindow<R>) {
	let Some(badge) = window.try_state::<Badge>() else {
		return;
	};
	let count = badge.0.load(Ordering::SeqCst);
	if count == 0 {
		return;
	}
	if let Err(failure) = worn_by(window, badge_count(count)) {
		eprintln!("the badge {count} was not worn by the window {}: {failure}", window.label());
	}
}

#[cfg(target_os = "windows")]
fn worn_by<R: Runtime>(window: &WebviewWindow<R>, count: Option<i64>) -> Result<(), String> {
	overlay::worn_by(window, count)
}

#[cfg(not(target_os = "windows"))]
fn worn_by<R: Runtime>(window: &WebviewWindow<R>, count: Option<i64>) -> Result<(), String> {
	window.set_badge_count(count).map_err(|failure| failure.to_string())
}

#[cfg(test)]
mod tests {
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, WebviewWindowBuilder};

	use super::*;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	fn badged_app(name: &str) -> AppOfItsOwn {
		an_app_of_its_own(name, mock_builder().manage(Badge::default()))
	}

	fn stored(app: &App<MockRuntime>) -> u32 {
		app.state::<Badge>().0.load(Ordering::SeqCst)
	}

	#[test]
	fn a_badge_count_of_zero_clears_the_badge() {
		assert_eq!(badge_count(0), None);
	}

	#[test]
	fn a_badge_count_of_one_shows_one() {
		assert_eq!(badge_count(1), Some(1));
	}

	#[test]
	fn the_largest_badge_count_survives_the_platform_width() {
		assert_eq!(badge_count(u32::MAX), Some(i64::from(u32::MAX)));
	}

	#[test]
	fn a_badge_set_with_no_app_window_open_is_stored_and_succeeds() {
		let app = badged_app("badge-no-window");

		assert_eq!(wear(app.handle(), 3), Ok(()));
		assert_eq!(stored(&app), 3);
	}

	#[test]
	fn a_badge_set_reaches_every_open_app_window_and_is_stored() {
		let app = badged_app("badge-windows");
		for label in [window_controls::MAIN_WINDOW, "window-1"] {
			WebviewWindowBuilder::new(&*app, label, Default::default())
				.build()
				.expect("window builds");
		}

		assert_eq!(wear(app.handle(), 5), Ok(()));
		assert_eq!(wear(app.handle(), 0), Ok(()));
		assert_eq!(stored(&app), 0);
	}
}
