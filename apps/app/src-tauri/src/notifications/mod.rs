pub mod commands;
#[cfg(target_os = "macos")]
mod macos;

use tauri::{AppHandle, Runtime};

use crate::events::{self, NOTIFICATION_ACTIVATED};
use crate::window_controls;
use commands::NotificationTarget;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn activated<R: Runtime>(app: &AppHandle<R>, target: NotificationTarget) {
	let window = window_controls::receiving_window(app);
	if let Err(failure) = events::emit_to(app, &window, NOTIFICATION_ACTIVATED, target) {
		eprintln!("the notification activation did not reach the window {window}: {failure}");
	}
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc::{channel, Receiver};

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener, WebviewWindow, WebviewWindowBuilder};

	use super::commands::{NotificationKind, ACTIVATED_EVENT};
	use super::*;
	use crate::test_app::an_app_of_its_own;

	fn heard_by(window: &WebviewWindow<MockRuntime>) -> Receiver<String> {
		let (told, hearing) = channel();
		window.listen(ACTIVATED_EVENT, move |event| {
			told.send(event.payload().to_owned()).expect("the test hears");
		});
		hearing
	}

	fn opened(app: &App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(app, label, Default::default()).build().expect("window builds")
	}

	#[test]
	fn a_clicked_notification_reaches_main_alone_when_no_app_window_is_focused() {
		let app = an_app_of_its_own("notification-one-window", mock_builder());
		let main = heard_by(&opened(&app, window_controls::MAIN_WINDOW));
		let secondary = heard_by(&opened(&app, "window-1"));

		activated(
			app.handle(),
			NotificationTarget { kind: NotificationKind::Conversation, id: "c-1".to_owned() },
		);

		assert_eq!(
			main.try_iter().collect::<Vec<_>>(),
			vec![r#"{"kind":"conversation","id":"c-1"}"#.to_owned()]
		);
		assert_eq!(secondary.try_iter().count(), 0);
	}
}
