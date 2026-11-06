use std::sync::Arc;

use tauri::State;

use super::contract::{
	Application, ApplicationCallError, ApplicationInstall, ApplicationSearch, ApplicationsError,
	InstallRefusal,
};
use super::directory::Directory;
use super::runnable::{refusal, Runners};
use crate::conversations::commands::ready;
use crate::db;
use crate::json::JsonValue;

#[tauri::command]
#[specta::specta]
pub async fn application_catalogue(
	directory: State<'_, Arc<Directory>>,
) -> Result<Vec<Application>, ApplicationsError> {
	directory.curated().await
}

#[tauri::command]
#[specta::specta]
pub async fn application_search(
	directory: State<'_, Arc<Directory>>,
	query: String,
) -> Result<ApplicationSearch, ApplicationsError> {
	directory.searched(&query).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_named(
	directory: State<'_, Arc<Directory>>,
	name: String,
) -> Result<Option<Application>, ApplicationsError> {
	directory.named(&name).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_runnable(config: JsonValue) -> Option<InstallRefusal> {
	refusal(&Runners::default(), &config.0).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_installs(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<ApplicationInstall>, ApplicationCallError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.application_installs().of_conversation(conversation_id).await?)
}
