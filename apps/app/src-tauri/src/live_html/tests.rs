use std::sync::Arc;
use std::time::Duration;

use tokio::sync::oneshot;
use tokio::time::timeout;

use super::contract::LiveHtmlError;
use super::server::ContentServer;
use super::watch::LoggedWatch;
use super::LiveViews;

const LOCK_WAIT: Duration = Duration::from_secs(1);

async fn show(views: &LiveViews, id: &str) {
	let server = ContentServer::open(id, String::new(), Arc::new(LoggedWatch))
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
