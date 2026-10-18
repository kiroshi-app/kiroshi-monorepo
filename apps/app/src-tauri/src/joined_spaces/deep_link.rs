use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, Url};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::events::{self, JOIN_LINK_OPENED};
use crate::window_controls;

pub const OPENED_EVENT: &str = "join-link://opened";

const SCHEME: &str = "kiroshi";

const JOIN_HOST: &str = "join";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinLinkOpened {
	pub link: String,
}

#[derive(Default)]
pub struct JoinLinks(Mutex<Inbox>);

#[derive(Default)]
struct Inbox {
	is_listened: bool,
	held: Vec<String>,
}

impl JoinLinks {
	fn inbox(&self) -> MutexGuard<'_, Inbox> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

pub fn install<R: Runtime>(app: &AppHandle<R>) {
	app.manage(JoinLinks::default());
	let deep_link = app.deep_link();
	#[cfg(any(windows, target_os = "linux"))]
	if let Err(failure) = deep_link.register_all() {
		eprintln!("the kiroshi scheme was not registered with the system: {failure}");
	}
	match deep_link.get_current() {
		Ok(Some(launched)) => received(app, join_links_of(&launched)),
		Ok(None) => {}
		Err(failure) => eprintln!("the link that launched the app did not read: {failure}"),
	}
	let handle = app.clone();
	deep_link.on_open_url(move |event| {
		let links = join_links_of(&event.urls());
		if links.is_empty() {
			return;
		}
		window_controls::raise_main(&handle);
		received(&handle, links);
	});
}

fn join_links_of(urls: &[Url]) -> Vec<String> {
	urls.iter()
		.filter(|url| url.scheme() == SCHEME && url.host_str() == Some(JOIN_HOST))
		.map(|url| url.as_str().to_owned())
		.collect()
}

fn received<R: Runtime>(app: &AppHandle<R>, links: Vec<String>) {
	let Some(join_links) = app.try_state::<JoinLinks>() else {
		return eprintln!("a join link arrived before its inbox was installed");
	};
	let mut inbox = join_links.inbox();
	if !inbox.is_listened {
		for link in links {
			if !inbox.held.contains(&link) {
				inbox.held.push(link);
			}
		}
		return;
	}
	drop(inbox);
	links.into_iter().for_each(|link| announced(app, link));
}

pub(super) fn listened<R: Runtime>(app: &AppHandle<R>) {
	let Some(join_links) = app.try_state::<JoinLinks>() else {
		return eprintln!("the front listens for join links before their inbox was installed");
	};
	let held = {
		let mut inbox = join_links.inbox();
		inbox.is_listened = true;
		std::mem::take(&mut inbox.held)
	};
	held.into_iter().for_each(|link| announced(app, link));
}

fn announced<R: Runtime>(app: &AppHandle<R>, link: String) {
	if let Err(failure) = events::emit(app, JOIN_LINK_OPENED, JoinLinkOpened { link }) {
		eprintln!("a join link did not reach the front: {failure}");
	}
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc::{channel, Receiver};

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener};

	use super::*;
	use crate::test_app::an_app_of_its_own;

	const LINK: &str = "kiroshi://join#instance-1.aGVsbG8.c2VjcmV0";

	fn heard(app: &App<MockRuntime>) -> Receiver<String> {
		let (told, hearing) = channel();
		app.listen_any(OPENED_EVENT, move |event| {
			let opened: serde_json::Value =
				serde_json::from_str(event.payload()).expect("a json payload");
			told.send(opened["link"].as_str().expect("a link").to_owned()).expect("the test hears");
		});
		hearing
	}

	fn urls(links: &[&str]) -> Vec<Url> {
		links.iter().map(|link| Url::parse(link).expect("a url")).collect()
	}

	#[test]
	fn a_link_that_arrives_before_the_front_listens_is_announced_once_it_listens() {
		let app = an_app_of_its_own("join-links-held", mock_builder());
		app.manage(JoinLinks::default());
		let hearing = heard(&app);

		received(app.handle(), join_links_of(&urls(&[LINK, LINK])));
		let before = hearing.try_recv().ok();
		listened(app.handle());

		assert_eq!(before, None);
		assert_eq!(hearing.try_iter().collect::<Vec<_>>(), vec![LINK.to_owned()]);
	}

	#[test]
	fn a_link_opened_while_the_front_listens_is_announced_with_its_fragment_intact() {
		let app = an_app_of_its_own("join-links-live", mock_builder());
		app.manage(JoinLinks::default());
		let hearing = heard(&app);
		listened(app.handle());

		received(app.handle(), join_links_of(&urls(&[LINK])));

		assert_eq!(hearing.try_iter().collect::<Vec<_>>(), vec![LINK.to_owned()]);
	}

	#[test]
	fn only_a_kiroshi_join_url_is_a_join_link() {
		let links = join_links_of(&urls(&[
			"kiroshi://settings#x",
			"https://kiroshi.app/join#x",
			"kiroshi://join#x.y.z",
		]));

		assert_eq!(links, vec!["kiroshi://join#x.y.z".to_owned()]);
	}
}
