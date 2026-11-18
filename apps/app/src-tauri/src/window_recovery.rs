pub mod decision;
#[cfg(target_os = "linux")]
mod webkitgtk;
#[cfg(windows)]
mod webview2;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Runtime, State};

use decision::{Death, Deaths, Recovery, WindowRecovery};

use crate::window_controls::{open_main, MAIN_WINDOW};

#[cfg(target_os = "linux")]
pub(crate) use webkitgtk::watch;
#[cfg(windows)]
pub(crate) use webview2::watch;

#[derive(Default)]
pub struct WindowRecoveries {
	deaths: Mutex<Deaths>,
	is_rebuild_pending: AtomicBool,
}

#[tauri::command]
#[specta::specta]
pub fn window_recovery_read(recoveries: State<'_, WindowRecoveries>) -> Option<WindowRecovery> {
	recoveries.deaths.lock().unwrap_or_else(PoisonError::into_inner).last().cloned()
}

#[cfg(any(target_os = "macos", test))]
fn on_web_content_process_terminate<R: Runtime>(webview: &tauri::Webview<R>) {
	if webview.label() != MAIN_WINDOW {
		return log::warn!("the webview {} lost its page and is not reloaded", webview.label());
	}
	let death = Death {
		process: decision::DeadProcess::Render,
		reason: decision::WindowDeathReason::Unknown,
	};
	recover(webview.app_handle(), death);
}

fn recover<R: Runtime>(app: &AppHandle<R>, death: Death) {
	let recoveries = app.state::<WindowRecoveries>();
	let (recovery, deaths) = {
		let mut history = recoveries.deaths.lock().unwrap_or_else(PoisonError::into_inner);
		let (next, recovery) = history.after(death, now_ms());
		*history = next;
		(recovery, history.last().map_or(0, |fact| fact.deaths))
	};
	log::warn!(
		"the main window page died on {}: reason {:?}, {:?} process, death {deaths} within {} s",
		std::env::consts::OS,
		death.reason,
		death.process,
		decision::RUN_MS / 1000,
	);
	match recovery {
		Recovery::Reload => reload(app, &recoveries),
		Recovery::Rebuild => rebuild(app, &recoveries),
		Recovery::GiveUp => log::error!(
			"the main window is no longer reloaded after {deaths} deaths within {} s",
			decision::RUN_MS / 1000
		),
	}
}

fn reload<R: Runtime>(app: &AppHandle<R>, recoveries: &WindowRecoveries) {
	let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
		return rebuild(app, recoveries);
	};
	match window.reload() {
		Ok(()) => log::info!("the main window is reloaded"),
		Err(failure) => {
			log::warn!("the main window did not reload: {failure}");
			rebuild(app, recoveries);
		}
	}
}

fn rebuild<R: Runtime>(app: &AppHandle<R>, recoveries: &WindowRecoveries) {
	let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
		log::info!("the main window is rebuilt");
		return open_main(app);
	};
	recoveries.is_rebuild_pending.store(true, Ordering::SeqCst);
	match window.destroy() {
		Ok(()) => log::info!("the main window is rebuilt"),
		Err(failure) => {
			recoveries.is_rebuild_pending.store(false, Ordering::SeqCst);
			log::error!("the main window could not be closed to be rebuilt: {failure}");
		}
	}
}

pub fn rebuild_once_destroyed<R: Runtime>(app: &AppHandle<R>, label: &str) {
	if label != MAIN_WINDOW {
		return;
	}
	let Some(recoveries) = app.try_state::<WindowRecoveries>() else {
		return;
	};
	if recoveries.is_rebuild_pending.swap(false, Ordering::SeqCst) {
		open_main(app);
	}
}

fn now_ms() -> u64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
}

pub fn installed_on<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
	let builder = builder.manage(WindowRecoveries::default());
	#[cfg(target_os = "macos")]
	let builder = builder.on_web_content_process_terminate(on_web_content_process_terminate::<R>);
	builder
}

#[cfg(test)]
mod tests {
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, WebviewUrl, WebviewWindowBuilder};

	use super::decision::WindowDeathReason;
	use super::*;
	use crate::test_app::an_app_of_its_own;
	use crate::test_log::{capturing, logged_naming};

	const RENDER_CRASH: Death =
		Death { process: decision::DeadProcess::Render, reason: WindowDeathReason::Crashed };

	fn read(app: &App<MockRuntime>) -> Option<WindowRecovery> {
		window_recovery_read(app.state::<WindowRecoveries>())
	}

	#[test]
	fn deaths_of_the_main_window_page_reload_it_then_give_up_and_answer_the_fact() {
		capturing();
		let app = an_app_of_its_own("window-recovery", installed_on(mock_builder()));
		WebviewWindowBuilder::new(&*app, MAIN_WINDOW, WebviewUrl::default())
			.build()
			.expect("the main window builds");

		assert_eq!(read(&app), None);

		recover(app.handle(), RENDER_CRASH);
		recover(app.handle(), RENDER_CRASH);
		let reloaded = read(&app).expect("a fact after a death");
		assert_eq!((reloaded.deaths, reloaded.exhausted), (2, false));
		assert_eq!(read(&app), Some(reloaded));

		recover(app.handle(), RENDER_CRASH);
		let given_up = read(&app).expect("a fact after a death");
		assert_eq!((given_up.reason, given_up.deaths), (WindowDeathReason::Crashed, 3));
		assert!(given_up.exhausted);
		assert!(app.get_webview_window(MAIN_WINDOW).is_some());

		assert_eq!(logged_naming("the main window page died").len(), 3);
		assert_eq!(logged_naming("the main window is reloaded").len(), 2);
		assert_eq!(logged_naming("the main window is no longer reloaded after 3 deaths").len(), 1);
	}

	#[test]
	fn a_page_death_outside_the_main_window_is_logged_and_leaves_no_fact() {
		capturing();
		let app = an_app_of_its_own("window-recovery-other", installed_on(mock_builder()));
		let other = WebviewWindowBuilder::new(&*app, "screenshot-1", WebviewUrl::default())
			.build()
			.expect("the other window builds");

		on_web_content_process_terminate(other.as_ref());

		assert_eq!(read(&app), None);
		assert_eq!(
			logged_naming("the webview screenshot-1 lost its page and is not reloaded").len(),
			1
		);
	}
}
