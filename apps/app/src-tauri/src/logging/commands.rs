use tauri::{AppHandle, Runtime, State};

use super::contract::{Diagnostics, LogFileError};

#[tauri::command]
#[specta::specta]
pub async fn diagnostics<R: Runtime>(app: AppHandle<R>) -> Diagnostics {
	kiroshi_core::logging::commands::diagnostics(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn log_tail(
	core: State<'_, crate::core_context::Core>,
	lines: u32,
) -> Result<Vec<String>, LogFileError> {
	kiroshi_core::logging::commands::log_tail(core.inner(), lines).await
}

#[tauri::command]
#[specta::specta]
pub async fn log_reveal(core: State<'_, crate::core_context::Core>) -> Result<(), LogFileError> {
	kiroshi_core::logging::commands::log_reveal(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn log_clear(core: State<'_, crate::core_context::Core>) -> Result<(), LogFileError> {
	kiroshi_core::logging::commands::log_clear(core.inner()).await
}
