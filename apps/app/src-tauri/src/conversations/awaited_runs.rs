use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, Runtime, State, Webview, Window, WindowEvent};

use super::contract::TranscriptStoreError;
use super::host_turn;
use crate::agent::AgentState;
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
		held.drivers.remove(window);
		let left: Vec<String> = held
			.submitted
			.iter()
			.filter(|(_, submitter)| *submitter == window)
			.map(|(turn_id, _)| turn_id.clone())
			.collect();
		for turn_id in left {
			held.submitted.remove(&turn_id);
			held.orphaned.insert(turn_id);
		}
	}

	fn is_left_to_the_host(&self, turn_id: &str) -> bool {
		let held = self.held();
		!held.drivers.is_empty() && held.orphaned.contains(turn_id)
	}

	fn served(&self, turn_id: &str) {
		self.held().orphaned.remove(turn_id);
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
		serve_turn(app, windows, agent, &conversation_id, &turn_id).await?;
	}
	Ok(())
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
	let held = match agent.host_turns().hold(conversation_id, turn_id) {
		Ok(held) => held,
		Err(TranscriptStoreError::TurnAlreadyRunning { .. }) => return Ok(()),
		Err(refused) => return Err(refused),
	};
	let awaited: Vec<AwaitedRun> = database(app)?
		.messages()
		.awaited_runs()
		.await?
		.into_iter()
		.filter(|run| run.turn_id == turn_id)
		.collect();
	if awaited.is_empty() {
		return Ok(());
	}
	windows.served(turn_id);
	log::info!(
		"turn {turn_id} of conversation {conversation_id} lost the window that ran it, the host serves its awaited runs"
	);
	tauri::async_runtime::spawn(host_turn::serve_awaited(app.clone(), held, awaited));
	Ok(())
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
	use super::TurnWindows;

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
