use std::sync::Arc;
use std::time::Duration;

use tokio::sync::oneshot;
use tokio::time::timeout;

#[cfg(target_os = "macos")]
use super::contract::{LiveHtmlAppearance, LiveHtmlCorners, LiveHtmlRectangle, LiveHtmlTheme};
use super::contract::{LiveHtmlError, LOADED_EVENT};
#[cfg(target_os = "macos")]
use super::server::tests::fetched;
use super::server::{ContentServer, Page};
use super::watch::LoggedWatch;
use super::LiveViews;

const LOCK_WAIT: Duration = Duration::from_secs(1);
#[cfg(target_os = "macos")]
const SQUARE: LiveHtmlCorners =
	LiveHtmlCorners { top_left: 0.0, top_right: 0.0, bottom_right: 0.0, bottom_left: 0.0 };
#[cfg(target_os = "macos")]
const DARK: LiveHtmlTheme = LiveHtmlTheme { appearance: LiveHtmlAppearance::Dark, hue: None };

fn served(id: &str) -> ContentServer {
	ContentServer::open(id, Page::Written(String::new()), None, Arc::new(LoggedWatch))
		.expect("the content server opens")
}

async fn show(views: &LiveViews, id: &str) {
	views.servers.lock().await.insert(id.to_owned(), served(id));
}

fn hearing_loads<R: tauri::Runtime>(
	app: &tauri::App<R>,
) -> std::sync::mpsc::Receiver<serde_json::Value> {
	let (told, hearing) = std::sync::mpsc::channel();
	tauri::Listener::listen_any(app, LOADED_EVENT, move |event| {
		let payload = serde_json::from_str(event.payload()).expect("a json payload");
		told.send(payload).expect("the test listens");
	});
	hearing
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

#[tokio::test(start_paused = true)]
async fn a_live_html_page_finishing_its_load_mid_mount_is_reported_only_once_the_mount_resolves() {
	let app = tauri::test::mock_app();
	let hearing = hearing_loads(&app);
	let views = LiveViews::default();
	let mounting = views.servers.lock().await;

	let reported = views.page_loaded(app.handle(), "a".to_owned());
	let mounted = async move {
		let mut mounting = mounting;
		tokio::time::sleep(LOCK_WAIT).await;
		let heard_mid_mount = hearing.try_recv().ok();
		mounting.insert("a".to_owned(), served("a"));
		drop(mounting);
		(heard_mid_mount, hearing)
	};
	let ((), (heard_mid_mount, hearing)) = tokio::join!(reported, mounted);

	assert_eq!(heard_mid_mount, None);
	assert_eq!(
		hearing.try_recv().expect("the load is reported once the mount resolves"),
		serde_json::json!({ "id": "a", "failure": null })
	);
	assert!(hearing.try_recv().is_err(), "the load was reported twice");
}

#[tokio::test]
async fn a_live_html_page_load_of_a_view_whose_mount_failed_is_not_reported() {
	let app = tauri::test::mock_app();
	let hearing = hearing_loads(&app);
	let views = LiveViews::default();

	views.page_loaded(app.handle(), "never-mounted".to_owned()).await;

	assert!(hearing.try_recv().is_err());
}

#[cfg(target_os = "macos")]
#[tokio::test]
async fn a_live_html_attached_page_missing_at_its_content_request_is_reported_as_a_typed_failure() {
	let app = tauri::test::mock_app();
	let hearing = hearing_loads(&app);
	let views = LiveViews::default();
	let attachments = crate::removed_on_drop::RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-live-html-{}", uuid::Uuid::new_v4())),
	);
	std::fs::create_dir_all(&*attachments).expect("the attachments folder");
	let path = attachments.join("page.html");
	std::fs::write(&path, "<p>gone soon</p>").expect("a written page");
	let page = super::attachment::AttachedPage::checked(attachments.to_path_buf(), path.clone())
		.expect("the page checks at mount");
	let server = ContentServer::open("a", Page::Attached(page), None, Arc::new(LoggedWatch))
		.expect("the content server opens");
	let url = server.content_url();
	views.servers.lock().await.insert("a".to_owned(), server);
	std::fs::remove_file(&path).expect("the page is removed");

	let answer = fetched(&url).await.expect("the server answers");
	views.page_loaded(app.handle(), "a".to_owned()).await;

	assert!(answer.starts_with("HTTP/1.1 500"), "{answer}");
	let loaded = hearing.try_recv().expect("the load is reported");
	assert_eq!(loaded["id"], "a");
	assert_eq!(loaded["failure"]["kind"], "unreadable");
}
