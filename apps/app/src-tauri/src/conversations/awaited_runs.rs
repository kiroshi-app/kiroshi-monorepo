use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, Runtime, State, Webview, Window, WindowEvent};

use super::contract::TranscriptStoreError;
use super::host_turn;
use crate::agent::AgentState;
use crate::db;
use crate::db::repositories::conversations::MISSION_KIND;
use crate::db::repositories::messages::AwaitedRun;
use crate::routines::runner::database;

#[derive(Default)]
pub struct TurnWindows(Mutex<Windows>);

#[derive(Default)]
struct Windows {
	submitted: HashMap<String, String>,
	orphaned: HashSet<String>,
	drivers: HashSet<String>,
}

impl TurnWindows {
	fn held(&self) -> MutexGuard<'_, Windows> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub(crate) fn submitted_from(&self, window: &str, turn_id: &str) {
		let mut held = self.held();
		held.orphaned.remove(turn_id);
		held.submitted.insert(turn_id.to_owned(), window.to_owned());
	}

	fn start_driving(&self, window: &str) {
		self.held().drivers.insert(window.to_owned());
	}

	pub(crate) fn forget_window(&self, window: &str) {
		let mut held = self.held();
		let Windows { submitted, orphaned, drivers } = &mut *held;
		drivers.remove(window);
		submitted.retain(|turn_id, submitter| {
			let is_left = submitter == window;
			if is_left {
				orphaned.insert(turn_id.clone());
			}
			!is_left
		});
	}

	fn is_left_to_the_host(&self, turn_id: &str) -> bool {
		let held = self.held();
		!held.drivers.is_empty() && held.orphaned.contains(turn_id)
	}

	fn served(&self, turn_id: &str) {
		self.held().orphaned.remove(turn_id);
	}

	fn tracked(&self) -> Vec<String> {
		let held = self.held();
		held.submitted.keys().chain(held.orphaned.iter()).cloned().collect()
	}

	fn forget_settled(&self, tracked: &[String], open: &HashSet<String>) {
		let mut held = self.held();
		for turn_id in tracked.iter().filter(|turn_id| !open.contains(*turn_id)) {
			held.submitted.remove(turn_id);
			held.orphaned.remove(turn_id);
		}
	}
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_serve_awaited_runs<R: Runtime>(
	app: AppHandle<R>,
	webview: Webview<R>,
	windows: State<'_, TurnWindows>,
	agent: State<'_, AgentState>,
) -> Result<(), TranscriptStoreError> {
	serve_on_driving(&app, &windows, &agent, webview.window().label()).await
}

pub(crate) async fn serve_on_driving<R: Runtime>(
	app: &AppHandle<R>,
	windows: &TurnWindows,
	agent: &AgentState,
	window: &str,
) -> Result<(), TranscriptStoreError> {
	windows.start_driving(window);
	let awaited = database(app)?.messages().awaited_runs().await?;
	let mut turns: Vec<(String, String)> =
		awaited.into_iter().map(|run| (run.conversation_id, run.turn_id)).collect();
	turns.dedup();
	for (conversation_id, turn_id) in turns {
		if let Err(error) = serve_turn(app, windows, agent, &conversation_id, &turn_id).await {
			log::warn!(
				"turn {turn_id} of conversation {conversation_id} could not serve its awaited runs: {error:?}"
			);
		}
	}
	Ok(())
}

pub(crate) async fn forget_settled_turns<R: Runtime>(app: &AppHandle<R>) {
	let Some(windows) = app.try_state::<TurnWindows>() else {
		return;
	};
	let tracked = windows.tracked();
	if tracked.is_empty() {
		return;
	}
	match open_run_turns(app).await {
		Ok(open) => windows.forget_settled(&tracked, &open),
		Err(error) => log::warn!("the turns whose runs all ended could not be read: {error:?}"),
	}
}

async fn open_run_turns<R: Runtime>(
	app: &AppHandle<R>,
) -> Result<HashSet<String>, TranscriptStoreError> {
	Ok(database(app)?.messages().open_run_turns().await?.into_iter().collect())
}

pub(crate) async fn serve_handed<R: Runtime>(
	app: &AppHandle<R>,
	conversation_id: &str,
	turn_id: &str,
) -> Result<(), TranscriptStoreError> {
	let Some(windows) = app.try_state::<TurnWindows>() else {
		return Ok(());
	};
	let Some(agent) = app.try_state::<AgentState>() else {
		log::error!("turn {turn_id} of conversation {conversation_id} found no agent state to serve its awaited runs");
		return Ok(());
	};
	serve_turn(app, &windows, &agent, conversation_id, turn_id).await
}

async fn serve_turn<R: Runtime>(
	app: &AppHandle<R>,
	windows: &TurnWindows,
	agent: &AgentState,
	conversation_id: &str,
	turn_id: &str,
) -> Result<(), TranscriptStoreError> {
	if !windows.is_left_to_the_host(turn_id) {
		return Ok(());
	}
	let database = database(app)?;
	if is_a_mission_thread(database, conversation_id).await? {
		log::info!(
			"turn {turn_id} of conversation {conversation_id} is on a mission thread, its awaited runs stay with the mission run driver"
		);
		return Ok(());
	}
	let held = match agent.host_turns().hold(conversation_id, turn_id) {
		Ok(held) => held,
		Err(TranscriptStoreError::TurnAlreadyRunning { .. }) => return Ok(()),
		Err(refused) => return Err(refused),
	};
	let claimed = claimed_runs_of(database, turn_id).await?;
	if claimed.is_empty() {
		return Ok(());
	}
	windows.served(turn_id);
	log::info!(
		"turn {turn_id} of conversation {conversation_id} lost the window that ran it, the host serves its awaited runs"
	);
	tauri::async_runtime::spawn(host_turn::serve_awaited(app.clone(), held, claimed));
	Ok(())
}

async fn is_a_mission_thread(
	database: &db::Database,
	conversation_id: &str,
) -> Result<bool, TranscriptStoreError> {
	let kind = database.conversations().kind(conversation_id.to_owned()).await?;
	Ok(kind.as_deref() == Some(MISSION_KIND))
}

async fn claimed_runs_of(
	database: &db::Database,
	turn_id: &str,
) -> Result<Vec<AwaitedRun>, TranscriptStoreError> {
	let messages = database.messages();
	let mut claimed = Vec::new();
	for run in messages.awaited_runs().await?.into_iter().filter(|run| run.turn_id == turn_id) {
		if messages.claim_awaited_run(run.turn_id.clone(), run.bot_id.clone()).await? {
			claimed.push(run);
		}
	}
	Ok(claimed)
}

pub fn forget_on_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
	if payload.event() == PageLoadEvent::Started {
		forget(&webview.window());
	}
}

pub fn forget_on_destroyed<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
	if matches!(event, WindowEvent::Destroyed) {
		forget(window);
	}
}

fn forget<R: Runtime>(window: &Window<R>) {
	if let Some(windows) = window.try_state::<TurnWindows>() {
		windows.forget_window(window.label());
	}
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{AppHandle, Manager};
	use tokio::time;

	use super::{forget_settled_turns, TurnWindows};
	use crate::conversations::turn_run_deadline::{arm_start_deadlines, TurnRunDeadlines};
	use crate::db;
	use crate::db::repositories::conversations::DEFAULT_BOT_ID;
	use crate::db::repositories::messages::NewTurn;
	use crate::routines::runner::database;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	async fn a_chat_with_a_running_turn(
		name: &str,
		start_within: Duration,
	) -> (AppOfItsOwn, String) {
		let app = an_app_of_its_own(name, mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(TurnWindows::default());
		app.manage(TurnRunDeadlines::after(start_within));
		let database = database(app.handle()).expect("the database opens");
		database.conversations().ensure_default_bot().await.expect("the bot is seeded");
		let chat = database
			.conversations()
			.ensure_chat(DEFAULT_BOT_ID.to_owned(), None)
			.await
			.expect("the chat is seeded");
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: chat.id.clone(), started_at: 1 };
		database.messages().start_turn(turn).await.expect("the turn opens");
		(app, chat.id)
	}

	fn left_after_a_reload(app: &AppHandle<MockRuntime>, turn_ids: &[&str]) {
		let windows = app.state::<TurnWindows>();
		for turn_id in turn_ids {
			windows.submitted_from("main", turn_id);
		}
		windows.forget_window("main");
		windows.start_driving("main");
	}

	#[tokio::test]
	async fn a_turn_left_with_no_run_is_forgotten_and_a_turn_with_a_run_is_kept() {
		let (app, chat_id) =
			a_chat_with_a_running_turn("forget-settled", Duration::from_secs(60)).await;
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: chat_id, started_at: 1 };
		let messages = database(app.handle()).expect("the database opens").messages();
		messages.start_run(turn, DEFAULT_BOT_ID.to_owned()).await.expect("the run starts");
		left_after_a_reload(app.handle(), &["t1", "t-ended"]);

		forget_settled_turns(app.handle()).await;

		let windows = app.state::<TurnWindows>();
		assert!(windows.is_left_to_the_host("t1"), "a turn still running was forgotten");
		assert!(!windows.is_left_to_the_host("t-ended"), "a turn with no run was kept");
		assert!(windows.tracked().iter().all(|turn_id| turn_id == "t1"));
	}

	#[tokio::test]
	async fn a_turn_whose_last_awaited_run_expires_is_forgotten() {
		let (app, chat_id) = a_chat_with_a_running_turn("forget-expired", Duration::ZERO).await;
		let messages = database(app.handle()).expect("the database opens").messages();
		let late = vec!["late".to_owned()];
		messages.await_runs("t1".to_owned(), late.clone()).await.expect("the run waits");
		left_after_a_reload(app.handle(), &["t1"]);

		arm_start_deadlines(app.handle(), &chat_id, "t1", &late);
		let windows = app.state::<TurnWindows>();
		time::timeout(Duration::from_secs(10), async {
			while !windows.tracked().is_empty() {
				time::sleep(Duration::from_millis(10)).await;
			}
		})
		.await
		.expect("the expired turn was forgotten");
	}

	#[test]
	fn a_turn_whose_window_still_lives_is_left_to_that_window() {
		let windows = TurnWindows::default();
		windows.submitted_from("main", "t1");
		windows.start_driving("main");

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_whose_window_reloaded_is_left_to_the_host_only_once_a_window_drives() {
		let windows = TurnWindows::default();
		windows.submitted_from("main", "t1");
		windows.start_driving("main");

		windows.forget_window("main");
		let while_reloading = windows.is_left_to_the_host("t1");
		windows.start_driving("main");

		assert!(!while_reloading, "a turn was left to the host with no window driving");
		assert!(windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_never_submitted_from_a_window_is_never_left_to_the_host() {
		let windows = TurnWindows::default();
		windows.start_driving("main");

		windows.forget_window("window-1");

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_submitted_again_from_a_live_window_is_that_window_s_again() {
		let windows = TurnWindows::default();
		windows.submitted_from("window-1", "t1");
		windows.forget_window("window-1");
		windows.start_driving("main");

		windows.submitted_from("main", "t1");

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_served_turn_is_no_longer_left_to_the_host() {
		let windows = TurnWindows::default();
		windows.submitted_from("main", "t1");
		windows.forget_window("main");
		windows.start_driving("window-1");

		windows.served("t1");

		assert!(!windows.is_left_to_the_host("t1"));
	}
}
