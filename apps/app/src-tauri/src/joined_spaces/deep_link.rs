use tauri::{AppHandle, Manager, Runtime, Url};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::core_context::ClientId;
use crate::window_controls;
pub use kiroshi_core::joined_spaces::join_links::{self, JoinLinkOpened, JoinLinks};

pub use kiroshi_core::desktop_events::JOIN_LINK_OPENED_EVENT as OPENED_EVENT;

const SCHEME: &str = "kiroshi";

const JOIN_HOST: &str = "join";

const INVITATION_QUERY: &str = "invitation=";

const INVITATION_REF_LENGTH: usize = 128;

pub fn install<R: Runtime>(app: &AppHandle<R>) {
	crate::events::core(app).manage(JoinLinks::default());
	let deep_link = app.deep_link();
	#[cfg(any(windows, target_os = "linux"))]
	if let Err(failure) = deep_link.register_all() {
		log::warn!("the kiroshi scheme was not registered with the system: {failure}");
	}
	match deep_link.get_current() {
		Ok(Some(launched)) => received(app, invitations_of(&launched)),
		Ok(None) => {}
		Err(failure) => log::warn!("the link that launched the app did not read: {failure}"),
	}
	let handle = app.clone();
	deep_link.on_open_url(move |event| {
		let invitations = invitations_of(&event.urls());
		if invitations.is_empty() {
			return;
		}
		received(&handle, invitations);
	});
}

fn invitations_of(urls: &[Url]) -> Vec<String> {
	urls.iter()
		.filter(|url| url.scheme() == SCHEME && url.host_str() == Some(JOIN_HOST))
		.filter_map(|url| {
			let invitation = invitation_of(url);
			if invitation.is_none() {
				log::warn!("a kiroshi://join link that names no invitation was ignored");
			}
			invitation
		})
		.collect()
}

fn invitation_of(url: &Url) -> Option<String> {
	if !url.path().is_empty() || url.fragment().is_some() {
		return None;
	}
	let reference = url.query()?.strip_prefix(INVITATION_QUERY)?;
	let is_reference = (1..=INVITATION_REF_LENGTH).contains(&reference.len())
		&& reference.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
	is_reference.then(|| reference.to_owned())
}

fn received<R: Runtime>(app: &AppHandle<R>, invitations: Vec<String>) {
	let target = ClientId::new(window_controls::receiving_window(app));
	join_links::received(crate::events::core(app), invitations, &target);
}

#[cfg(test)]
pub(super) fn listened<R: Runtime>(app: &AppHandle<R>, listener: &str) {
	join_links::listened(crate::events::core(app), &ClientId::new(listener));
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc::{channel, Receiver};

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener, WebviewWindow, WebviewWindowBuilder};

	use super::*;
	use crate::test_app::an_app_of_its_own;

	const LINK: &str = "kiroshi://join?invitation=inv_3f9A-b2";

	const INVITATION: &str = "inv_3f9A-b2";

	fn heard(app: &App<MockRuntime>) -> Receiver<serde_json::Value> {
		let (told, hearing) = channel();
		app.listen_any(OPENED_EVENT, move |event| {
			let opened = serde_json::from_str(event.payload()).expect("a json payload");
			told.send(opened).expect("the test hears");
		});
		hearing
	}

	fn heard_by(window: &WebviewWindow<MockRuntime>) -> Receiver<String> {
		let (told, hearing) = channel();
		window.listen(OPENED_EVENT, move |event| {
			told.send(event.payload().to_owned()).expect("the test hears");
		});
		hearing
	}

	fn opened(app: &App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(app, label, Default::default()).build().expect("window builds")
	}

	fn urls(links: &[&str]) -> Vec<Url> {
		links.iter().map(|link| Url::parse(link).expect("a url")).collect()
	}

	#[test]
	fn an_invitation_link_opened_before_the_front_listens_is_announced_once_it_listens() {
		let app = an_app_of_its_own("join-links-held", mock_builder());
		crate::events::core(app).manage(JoinLinks::default());
		let hearing = heard(&app);

		received(app.handle(), invitations_of(&urls(&[LINK, LINK])));
		let before = hearing.try_recv().ok();
		listened(app.handle(), window_controls::MAIN_WINDOW);

		assert_eq!(before, None);
		assert_eq!(
			hearing.try_iter().collect::<Vec<_>>(),
			vec![serde_json::json!({ "invitationId": INVITATION })]
		);
	}

	#[test]
	fn an_invitation_link_opened_while_the_front_listens_is_announced_with_its_invitation() {
		let app = an_app_of_its_own("join-links-live", mock_builder());
		crate::events::core(app).manage(JoinLinks::default());
		let hearing = heard(&app);
		listened(app.handle(), window_controls::MAIN_WINDOW);

		received(app.handle(), invitations_of(&urls(&[LINK])));

		assert_eq!(
			hearing.try_iter().collect::<Vec<_>>(),
			vec![serde_json::json!({ "invitationId": INVITATION })]
		);
	}

	#[test]
	fn an_invitation_link_reaches_main_alone_when_no_app_window_is_focused() {
		let app = an_app_of_its_own("join-links-one-window", mock_builder());
		crate::events::core(app).manage(JoinLinks::default());
		let main = heard_by(&opened(&app, window_controls::MAIN_WINDOW));
		let secondary = heard_by(&opened(&app, "window-1"));
		listened(app.handle(), window_controls::MAIN_WINDOW);

		received(app.handle(), invitations_of(&urls(&[LINK])));

		assert_eq!(main.try_iter().count(), 1);
		assert_eq!(secondary.try_iter().count(), 0);
	}

	#[test]
	fn a_held_invitation_link_reaches_the_window_that_listens_alone() {
		let app = an_app_of_its_own("join-links-held-one-window", mock_builder());
		crate::events::core(app).manage(JoinLinks::default());
		let main = heard_by(&opened(&app, window_controls::MAIN_WINDOW));
		let secondary = heard_by(&opened(&app, "window-1"));

		received(app.handle(), invitations_of(&urls(&[LINK])));
		listened(app.handle(), "window-1");

		assert_eq!(main.try_iter().count(), 0);
		assert_eq!(secondary.try_iter().count(), 1);
	}

	#[test]
	fn any_other_kiroshi_join_url_names_no_invitation() {
		let too_long = format!("kiroshi://join?invitation={}", "a".repeat(129));
		let longest = format!("kiroshi://join?invitation={}", "a".repeat(128));

		let refused = invitations_of(&urls(&[
			"kiroshi://join#instance-1.aGVsbG8.c2VjcmV0",
			"kiroshi://join?invitation=",
			"kiroshi://join?invitation=a.b",
			"kiroshi://join?invitation=%41",
			"kiroshi://join?invitation=a&invitation=b",
			"kiroshi://join?other=a",
			"kiroshi://join/path?invitation=a",
			"kiroshi://join?invitation=a#x",
			too_long.as_str(),
			"kiroshi://settings?invitation=a",
			"https://kiroshi.app/join?invitation=a",
		]));

		assert_eq!(refused, Vec::<String>::new());
		assert_eq!(invitations_of(&urls(&[longest.as_str()])), vec!["a".repeat(128)]);
	}
}
