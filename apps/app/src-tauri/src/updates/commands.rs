use tauri::{AppHandle, Manager, Runtime, State};

use super::contract::{ReleaseNotes, ReleaseNotesError, UpdateState};
use super::{flow, release_notes, Updates};
use crate::agent::AgentState;

#[tauri::command]
#[specta::specta]
pub fn update_state(updates: State<'_, Updates>) -> UpdateState {
	updates.state()
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_updates<R: Runtime>(app: AppHandle<R>) -> UpdateState {
	flow::check_stored_channel(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn install_update<R: Runtime>(app: AppHandle<R>) -> UpdateState {
	flow::install(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn release_notes<R: Runtime>(
	app: AppHandle<R>,
	version: String,
) -> Result<ReleaseNotes, ReleaseNotesError> {
	let cache = app.path().app_data_dir().ok().map(|dir| dir.join(release_notes::DIR_NAME));
	release_notes::release_notes(cache.as_deref(), &version, release_notes::fetched).await
}

#[tauri::command]
#[specta::specta]
pub fn running_companions(agent: State<'_, AgentState>) -> usize {
	agent.live_session_count()
}
