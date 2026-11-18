use std::sync::Arc;
use std::time::Duration;

use tokio::sync::oneshot;
use tokio::time::timeout;

use super::contract::LiveHtmlError;
#[cfg(target_os = "macos")]
use super::contract::{LiveHtmlAppearance, LiveHtmlCorners, LiveHtmlRectangle, LiveHtmlTheme};
#[cfg(target_os = "macos")]
use super::server::tests::fetched;
use super::server::ContentServer;
use super::watch::LoggedWatch;
use super::LiveViews;

const LOCK_WAIT: Duration = Duration::from_secs(1);
#[cfg(target_os = "macos")]
const SQUARE: LiveHtmlCorners =
	LiveHtmlCorners { top_left: 0.0, top_right: 0.0, bottom_right: 0.0, bottom_left: 0.0 };
#[cfg(target_os = "macos")]
const DARK: LiveHtmlTheme = LiveHtmlTheme { appearance: LiveHtmlAppearance::Dark, hue: None };

async fn show(views: &LiveViews, id: &str) {
	let server = ContentServer::open(id, String::new(), None, Arc::new(LoggedWatch))
		.expect("the content server opens");
	views.servers.lock().await.insert(id.to_owned(), server);
}

async fn held_answer(released: oneshot::Receiver<String>) -> Result<String, LiveHtmlError> {
	released.await.map_err(|_| LiveHtmlError::Unplaced {
		detail: "the test dropped the script answer".to_owned(),
	})
}

#[tokio::test(start_paused = true)]
async fn a_live_html_view_is_added_while_another_view_waits_for_its_script_answer() {
	let views = LiveViews::default();
	show(&views, "a").await;
	let (ask, asked) = oneshot::channel();
	let (release, released) = oneshot::channel();

	let evaluation = views.answered_outside_the_lock("a".to_owned(), |_id| {
		ask.send(()).expect("the test waits for the script");
		held_answer(released)
	});
	let adding_while_pending = async {
		asked.await.expect("the script is sent");
		let added = timeout(LOCK_WAIT, show(&views, "b")).await;
		release.send("undefined".to_owned()).expect("the evaluation waits for its answer");
		added
	};
	let (answer, added) = tokio::join!(evaluation, adding_while_pending);

	assert!(added.is_ok(), "adding view b waited on the lock held by view a's script");
	assert_eq!(answer, Ok("undefined".to_owned()));
}

#[tokio::test(start_paused = true)]
async fn a_live_html_script_answer_landing_after_its_view_is_removed_reports_an_unknown_view() {
	let views = LiveViews::default();
	show(&views, "a").await;
	let (ask, asked) = oneshot::channel();
	let (release, released) = oneshot::channel();

	let evaluation = views.answered_outside_the_lock("a".to_owned(), |_id| {
		ask.send(()).expect("the test waits for the script");
		held_answer(released)
	});
	let removing_while_pending = async {
		asked.await.expect("the script is sent");
		let removed = timeout(LOCK_WAIT, async { views.servers.lock().await.remove("a") }).await;
		release.send("undefined".to_owned()).expect("the evaluation waits for its answer");
		removed
	};
	let (answer, removed) = tokio::join!(evaluation, removing_while_pending);

	assert!(
		matches!(removed, Ok(Some(_))),
		"removing view a waited on the lock held by its own script"
	);
	assert_eq!(answer, Err(LiveHtmlError::UnknownView { id: "a".to_owned() }));
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn a_live_html_corner_radius_that_is_negative_or_not_finite_is_refused() {
	let app = tauri::test::mock_app();
	let views = LiveViews::default();
	show(&views, "a").await;

	for radius in [-1.0, f64::NAN, f64::INFINITY] {
		for corners in [
			LiveHtmlCorners { top_left: radius, ..SQUARE },
			LiveHtmlCorners { top_right: radius, ..SQUARE },
			LiveHtmlCorners { bottom_right: radius, ..SQUARE },
			LiveHtmlCorners { bottom_left: radius, ..SQUARE },
		] {
			let rounded = views.round(app.handle(), "a".to_owned(), corners).await;

			assert_eq!(rounded, Err(LiveHtmlError::InvalidRadius), "{corners:?} was taken");
		}
	}
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn a_live_html_theme_naming_an_unknown_view_is_refused_like_its_placement() {
	let app = tauri::test::mock_app();
	let views = LiveViews::default();
	show(&views, "a").await;
	let rectangle = LiveHtmlRectangle { x: 0.0, y: 0.0, width: 480.0, height: 300.0 };

	let themed = views.theme(app.handle(), "missing".to_owned(), DARK).await;
	let placed = views.place(app.handle(), "missing".to_owned(), rectangle, None).await;

	assert_eq!(themed, Err(LiveHtmlError::UnknownView { id: "missing".to_owned() }));
	assert_eq!(themed, placed);
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn a_live_html_theme_for_a_view_with_no_native_webview_yet_succeeds_and_is_served_next() {
	let app = tauri::test::mock_app();
	let views = LiveViews::default();
	show(&views, "a").await;

	let themed = views.theme(app.handle(), "a".to_owned(), DARK).await;

	assert_eq!(themed, Ok(()));
	let url = views.servers.lock().await.get("a").expect("the shown view").content_url();
	let served = fetched(&url).await.expect("the content answers");
	assert!(served.contains("--kiroshi-appearance: dark; --kiroshi-background: #000000;"));
	assert!(!served.contains("prefers-color-scheme"), "{served}");
}
