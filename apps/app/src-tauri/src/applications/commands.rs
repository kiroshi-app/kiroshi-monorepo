use tauri::State;

use super::contract::{
	Application, ApplicationCallError, ApplicationInstall, ApplicationSearch, ApplicationsError,
	InstallRefusal,
};
use crate::json::JsonValue;

#[tauri::command]
#[specta::specta]
pub async fn application_catalogue(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<Application>, ApplicationsError> {
	kiroshi_core::applications::commands::application_catalogue(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_search(
	core: State<'_, crate::core_context::Core>,
	query: String,
) -> Result<ApplicationSearch, ApplicationsError> {
	kiroshi_core::applications::commands::application_search(core.inner(), query).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_named(
	core: State<'_, crate::core_context::Core>,
	name: String,
) -> Result<Option<Application>, ApplicationsError> {
	kiroshi_core::applications::commands::application_named(core.inner(), name).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_installs(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<ApplicationInstall>, ApplicationCallError> {
	kiroshi_core::applications::commands::application_installs(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn application_runnable(config: JsonValue) -> Option<InstallRefusal> {
	kiroshi_core::applications::commands::application_runnable(config).await
}
