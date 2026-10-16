use tauri::{AppHandle, Manager, Runtime, State};

use super::contract::{ReleaseNotes, ReleaseNotesError, UpdateChannel, UpdateState};
use super::{flow, release_notes, Updates};
use crate::agent::AgentState;
use crate::db;

#[tauri::command]
#[specta::specta]
pub fn update_state(updates: State<'_, Updates>) -> UpdateState {
	updates.state()
}

#[tauri::command]
#[specta::specta]
pub async fn check_for_updates<R: Runtime>(app: AppHandle<R>) -> UpdateState {
	let channel = current_channel(&app).await;
	flow::check(&app, channel).await
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

async fn current_channel<R: Runtime>(app: &AppHandle<R>) -> Result<UpdateChannel, String> {
	let state = app.state::<db::DatabaseState>();
	let database = state.as_ref().map_err(|failure| format!("{failure:?}"))?;
	let preferences = database.user().preferences().await.map_err(|error| format!("{error:?}"))?;
	Ok(preferences.update_channel.into())
}
