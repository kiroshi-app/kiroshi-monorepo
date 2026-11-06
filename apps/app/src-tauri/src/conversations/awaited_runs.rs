use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::{AppHandle, Runtime, State, Webview};

use super::contract::{SummonsDropped, TranscriptStoreError};
use super::host_turn;
use crate::agent::AgentState;
use crate::core_context::{ClientId, ClientScoped, Core};
use crate::db;
use crate::db::repositories::messages::AwaitedRun;
use crate::routines::runner::database;

#[derive(Default)]
pub struct TurnWindows(Mutex<Windows>);

#[derive(Default)]
struct Windows {
	submitted: HashMap<String, ClientId>,
	orphaned: HashSet<String>,
	drivers: HashSet<ClientId>,
	unseen_drops: Vec<SummonsDropped>,
}

impl ClientScoped for TurnWindows {
	fn forget_client(&self, _: &Core, client: &ClientId) {
		self.forget_window(client);
	}
}

impl TurnWindows {
	fn held(&self) -> MutexGuard<'_, Windows> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub(crate) fn submitted_from(&self, client: &ClientId, turn_id: &str) {
		let mut held = self.held();
		held.orphaned.remove(turn_id);
		held.submitted.insert(turn_id.to_owned(), client.clone());
	}

	fn start_driving(&self, client: &ClientId) {
		self.held().drivers.insert(client.clone());
	}

	pub(crate) fn forget_window(&self, client: &ClientId) {
		let mut held = self.held();
		let Windows { submitted, orphaned, drivers, .. } = &mut *held;
		drivers.remove(client);
		submitted.retain(|turn_id, submitter| {
			let is_left = submitter == client;
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

	pub(crate) fn keep_unless_driven(&self, dropped: SummonsDropped) {
		let mut held = self.held();
		if held.drivers.is_empty() {
			held.unseen_drops.push(dropped);
		}
	}

	fn claim_unseen_drops(&self, conversation_id: &str) -> Vec<SummonsDropped> {
		let mut held = self.held();
		let (claimed, kept) = std::mem::take(&mut held.unseen_drops)
			.into_iter()
			.partition(|dropped| dropped.conversation_id == conversation_id);
		held.unseen_drops = kept;
		claimed
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
	core: State<'_, crate::core_context::Core>,
) -> Result<(), TranscriptStoreError> {
	let windows = core.state::<TurnWindows>();
	let agent = core.state::<AgentState>();
	serve_on_driving(
		crate::events::core(&app),
		&windows,
		&agent,
		&crate::events::client_of(&webview.window()),
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub fn conversation_claim_unseen_drops(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Vec<SummonsDropped> {
	let windows = core.state::<TurnWindows>();
	windows.claim_unseen_drops(&conversation_id)
}

pub(crate) async fn serve_on_driving(
	core: &crate::core_context::Core,
	windows: &TurnWindows,
	agent: &AgentState,
	client: &ClientId,
) -> Result<(), TranscriptStoreError> {
	windows.start_driving(client);
	let awaited = database(core)?.messages().awaited_runs().await?;
	let mut turns: Vec<(String, String)> =
		awaited.into_iter().map(|run| (run.conversation_id, run.turn_id)).collect();
	turns.dedup();
	for (conversation_id, turn_id) in turns {
		if let Err(error) = serve_turn(core, windows, agent, &conversation_id, &turn_id).await {
			log::warn!(
				"turn {turn_id} of conversation {conversation_id} could not serve its awaited runs: {error:?}"
			);
		}
	}
	Ok(())
}

pub(crate) async fn forget_settled_turns(core: &crate::core_context::Core) {
	let Some(windows) = core.try_state::<TurnWindows>() else {
		return;
	};
	let tracked = windows.tracked();
	if tracked.is_empty() {
		return;
	}
	match open_run_turns(core).await {
		Ok(open) => windows.forget_settled(&tracked, &open),
		Err(error) => log::warn!("the turns whose runs all ended could not be read: {error:?}"),
	}
}

async fn open_run_turns(
	core: &crate::core_context::Core,
) -> Result<HashSet<String>, TranscriptStoreError> {
	Ok(database(core)?.messages().open_run_turns().await?.into_iter().collect())
}

pub(crate) async fn serve_handed(
	core: &crate::core_context::Core,
	conversation_id: &str,
	turn_id: &str,
) -> Result<(), TranscriptStoreError> {
	let Some(windows) = core.try_state::<TurnWindows>() else {
		return Ok(());
	};
	let Some(agent) = core.try_state::<AgentState>() else {
		log::error!("turn {turn_id} of conversation {conversation_id} found no agent state to serve its awaited runs");
		return Ok(());
	};
	serve_turn(core, &windows, &agent, conversation_id, turn_id).await
}

async fn serve_turn(
	core: &crate::core_context::Core,
	windows: &TurnWindows,
	agent: &AgentState,
	conversation_id: &str,
	turn_id: &str,
) -> Result<(), TranscriptStoreError> {
	if !windows.is_left_to_the_host(turn_id) {
		return Ok(());
	}
	let database = database(core)?;
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
	core.spawn(host_turn::serve_awaited(core.clone(), held, claimed));
	Ok(())
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

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::webview::PageLoadEvent;
	use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder, WindowEvent};
	use tokio::time;

	use super::{forget_settled_turns, TurnWindows};
	use crate::conversations::summons::{self, SummonsDropReason, SummonsRun};
	use crate::conversations::turn_run_deadline::{arm_start_deadlines, TurnRunDeadlines};
	use crate::core_context::ClientId;
	use crate::db::repositories::conversations::DEFAULT_BOT_ID;
	use crate::db::repositories::messages::NewTurn;
	use crate::events::{clear_client_on_destroyed, clear_client_on_page_event};
	use crate::routines::runner::database;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	async fn a_chat_with_a_running_turn(
		name: &str,
		start_within: Duration,
	) -> (AppOfItsOwn, String) {
		let app = an_app_of_its_own(name, mock_builder());
		crate::db::install(crate::events::core(app.handle()));
		crate::events::core(app.app_handle()).manage_client_scoped(TurnWindows::default());
		crate::events::core(app.app_handle()).manage(TurnRunDeadlines::after(start_within));
		let database = database(crate::events::core(app.handle())).expect("the database opens");
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
		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		for turn_id in turn_ids {
			windows.submitted_from(&ClientId::new("main"), turn_id);
		}
		windows.forget_window(&ClientId::new("main"));
		windows.start_driving(&ClientId::new("main"));
	}

	#[tokio::test]
	async fn a_turn_left_with_no_run_is_forgotten_and_a_turn_with_a_run_is_kept() {
		let (app, chat_id) =
			a_chat_with_a_running_turn("forget-settled", Duration::from_secs(60)).await;
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: chat_id, started_at: 1 };
		let messages =
			database(crate::events::core(app.handle())).expect("the database opens").messages();
		messages.start_run(turn, DEFAULT_BOT_ID.to_owned()).await.expect("the run starts");
		left_after_a_reload(app.handle(), &["t1", "t-ended"]);

		forget_settled_turns(crate::events::core(app.handle())).await;

		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		assert!(windows.is_left_to_the_host("t1"), "a turn still running was forgotten");
		assert!(!windows.is_left_to_the_host("t-ended"), "a turn with no run was kept");
		assert!(windows.tracked().iter().all(|turn_id| turn_id == "t1"));
	}

	#[tokio::test]
	async fn a_turn_whose_last_awaited_run_expires_is_forgotten() {
		let (app, chat_id) = a_chat_with_a_running_turn("forget-expired", Duration::ZERO).await;
		let messages =
			database(crate::events::core(app.handle())).expect("the database opens").messages();
		let late = vec!["late".to_owned()];
		messages.await_runs("t1".to_owned(), late.clone()).await.expect("the run waits");
		left_after_a_reload(app.handle(), &["t1"]);

		arm_start_deadlines(crate::events::core(app.handle()), &chat_id, "t1", &late);
		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		time::timeout(Duration::from_secs(10), async {
			while !windows.tracked().is_empty() {
				time::sleep(Duration::from_millis(10)).await;
			}
		})
		.await
		.expect("the expired turn was forgotten");
	}

	fn a_window_that_ran_t1(name: &str) -> (AppOfItsOwn, WebviewWindow<MockRuntime>) {
		let app = an_app_of_its_own(name, mock_builder());
		crate::events::core(app.app_handle()).manage_client_scoped(TurnWindows::default());
		let main = WebviewWindowBuilder::new(&*app, "main", Default::default())
			.build()
			.expect("the window builds");
		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		windows.submitted_from(&ClientId::new("main"), "t1");
		windows.start_driving(&ClientId::new("main"));
		(app, main)
	}

	#[test]
	fn a_page_that_starts_loading_leaves_its_turns_to_the_host_and_a_finished_load_does_not() {
		let (app, main) = a_window_that_ran_t1("forget-page-load");
		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		windows.start_driving(&ClientId::new("window-1"));

		clear_client_on_page_event(&main.as_ref().window(), PageLoadEvent::Finished);
		let after_a_finished_load = windows.is_left_to_the_host("t1");
		clear_client_on_page_event(&main.as_ref().window(), PageLoadEvent::Started);

		assert!(!after_a_finished_load, "a finished load left the turn to the host");
		assert!(windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_destroyed_window_leaves_its_turns_to_the_host_and_another_event_does_not() {
		let (app, main) = a_window_that_ran_t1("forget-destroyed");
		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		windows.start_driving(&ClientId::new("window-1"));

		clear_client_on_destroyed(&main.as_ref().window(), &WindowEvent::Focused(false));
		let after_a_blur = windows.is_left_to_the_host("t1");
		clear_client_on_destroyed(&main.as_ref().window(), &WindowEvent::Destroyed);

		assert!(!after_a_blur, "a blur left the turn to the host");
		assert!(windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_whose_window_still_lives_is_left_to_that_window() {
		let windows = TurnWindows::default();
		windows.submitted_from(&ClientId::new("main"), "t1");
		windows.start_driving(&ClientId::new("main"));

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_whose_window_reloaded_is_left_to_the_host_only_once_a_window_drives() {
		let windows = TurnWindows::default();
		windows.submitted_from(&ClientId::new("main"), "t1");
		windows.start_driving(&ClientId::new("main"));

		windows.forget_window(&ClientId::new("main"));
		let while_reloading = windows.is_left_to_the_host("t1");
		windows.start_driving(&ClientId::new("main"));

		assert!(!while_reloading, "a turn was left to the host with no window driving");
		assert!(windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_never_submitted_from_a_window_is_never_left_to_the_host() {
		let windows = TurnWindows::default();
		windows.start_driving(&ClientId::new("main"));

		windows.forget_window(&ClientId::new("window-1"));

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_turn_submitted_again_from_a_live_window_is_that_window_s_again() {
		let windows = TurnWindows::default();
		windows.submitted_from(&ClientId::new("window-1"), "t1");
		windows.forget_window(&ClientId::new("window-1"));
		windows.start_driving(&ClientId::new("main"));

		windows.submitted_from(&ClientId::new("main"), "t1");

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_served_turn_is_no_longer_left_to_the_host() {
		let windows = TurnWindows::default();
		windows.submitted_from(&ClientId::new("main"), "t1");
		windows.forget_window(&ClientId::new("main"));
		windows.start_driving(&ClientId::new("window-1"));

		windows.served("t1");

		assert!(!windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn every_drop_the_room_notices_waits_for_it_only_while_no_window_drives() {
		let app = an_app_of_its_own("unseen-drops", mock_builder());
		crate::events::core(app.app_handle()).manage_client_scoped(TurnWindows::default());
		let windows = crate::events::core(app.app_handle()).state::<TurnWindows>();
		let run = SummonsRun { conversation_id: "c1", turn_id: "t1", bot_id: "b1" };
		let elsewhere = SummonsRun { conversation_id: "c2", ..run };

		for reason in SummonsDropReason::ALL {
			summons::note_dropped(crate::events::core(app.handle()), &run, reason, None);
		}
		summons::note_dropped(
			crate::events::core(app.handle()),
			&elsewhere,
			SummonsDropReason::StartFailed,
			None,
		);
		let kept: Vec<SummonsDropReason> =
			windows.claim_unseen_drops("c1").into_iter().map(|dropped| dropped.reason).collect();
		let claimed_again = windows.claim_unseen_drops("c1");
		windows.start_driving(&ClientId::new("main"));
		summons::note_dropped(
			crate::events::core(app.handle()),
			&run,
			SummonsDropReason::StartFailed,
			None,
		);

		let noticed: Vec<SummonsDropReason> = SummonsDropReason::ALL
			.into_iter()
			.filter(|reason| {
				![
					SummonsDropReason::SelfMention,
					SummonsDropReason::NotSeated,
					SummonsDropReason::Cancelled,
				]
				.contains(reason)
			})
			.collect();
		assert_eq!(kept, noticed);
		assert!(claimed_again.is_empty(), "a kept drop was handed to the room twice");
		assert!(
			windows.claim_unseen_drops("c1").is_empty(),
			"a drop under a driving window was kept"
		);
		assert_eq!(windows.claim_unseen_drops("c2").len(), 1, "another room lost its drop");
	}
}
