pub mod commands;
#[cfg(target_os = "macos")]
mod macos;

use std::fmt;

use tauri::{AppHandle, Manager, Runtime};

use crate::events::{self, LIBRARY_COMMENT_MENTION_OPENED, NOTIFICATION_ACTIVATED};
use crate::library::contract::LibraryCommentMentionOpened;
use crate::window_controls;
use commands::NotificationTarget;

pub(crate) enum Clicked {
	Target(NotificationTarget),
	CommentMention(LibraryCommentMentionOpened),
}

impl fmt::Display for Clicked {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Clicked::Target(target) => write!(formatter, "{:?} {}", target.kind, target.id),
			Clicked::CommentMention(mention) => write!(
				formatter,
				"comment thread {} of space {}",
				mention.thread_id, mention.space_id
			),
		}
	}
}

pub(crate) struct Notice {
	pub(crate) title: String,
	pub(crate) body: String,
	pub(crate) clicked: Clicked,
}

pub(crate) struct SystemNotifications {
	raise: Box<dyn Fn(Notice) + Send + Sync>,
}

impl SystemNotifications {
	pub(crate) fn raising_with(raise: impl Fn(Notice) + Send + Sync + 'static) -> Self {
		Self { raise: Box::new(raise) }
	}
}

pub(crate) fn raise<R: Runtime>(app: &AppHandle<R>, notice: Notice) {
	if window_controls::focused_app_window(app).is_some() {
		return;
	}
	if app.try_state::<SystemNotifications>().is_none() {
		let shown_by = app.clone();
		app.manage(SystemNotifications::raising_with(move |notice| {
			commands::show(shown_by.clone(), notice.clicked, notice.title, notice.body);
		}));
	}
	(app.state::<SystemNotifications>().raise)(notice);
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn activated<R: Runtime>(app: &AppHandle<R>, clicked: Clicked) {
	let window = window_controls::receiving_window(app);
	let emitted = match clicked {
		Clicked::Target(target) => events::emit_to(app, &window, NOTIFICATION_ACTIVATED, target),
		Clicked::CommentMention(mention) => {
			events::emit_to(app, &window, LIBRARY_COMMENT_MENTION_OPENED, mention)
		}
	};
	if let Err(failure) = emitted {
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

	fn clicked(app: &App<MockRuntime>) {
		let target =
			NotificationTarget { kind: NotificationKind::Conversation, id: "c-1".to_owned() };
		activated(app.handle(), Clicked::Target(target));
	}

	const CLICKED: &str = r#"{"kind":"conversation","id":"c-1"}"#;

	#[test]
	fn a_clicked_notification_reaches_the_secondary_it_raised_alone_when_main_is_absent() {
		let app = an_app_of_its_own("notification-secondary-alone", mock_builder());
		let secondary = heard_by(&opened(&app, "window-1"));
		let dispatcher = heard_by(&opened(&app, "dispatcher"));

		clicked(&app);

		assert_eq!(secondary.try_iter().collect::<Vec<_>>(), vec![CLICKED.to_owned()]);
		assert_eq!(dispatcher.try_iter().count(), 0);
	}

	#[test]
	fn a_clicked_notification_reaches_main_alone_when_main_is_the_only_window() {
		let app = an_app_of_its_own("notification-main-alone", mock_builder());
		let main = heard_by(&opened(&app, window_controls::MAIN_WINDOW));

		clicked(&app);

		assert_eq!(main.try_iter().collect::<Vec<_>>(), vec![CLICKED.to_owned()]);
	}
}
