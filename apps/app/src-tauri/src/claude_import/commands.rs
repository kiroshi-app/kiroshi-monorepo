use tauri::State;

use super::contract::{ClaudeImportOutcome, ClaudeInventory};
use crate::conversations::contract::TranscriptStoreError;

#[tauri::command]
#[specta::specta]
pub async fn claude_import_inventory(
	core: State<'_, crate::core_context::Core>,
) -> Result<ClaudeInventory, TranscriptStoreError> {
	kiroshi_core::claude_import::commands::claude_import_inventory(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn claude_import_run(
	core: State<'_, crate::core_context::Core>,
	selection: Vec<String>,
	space_id: String,
) -> Result<Vec<ClaudeImportOutcome>, TranscriptStoreError> {
	kiroshi_core::claude_import::commands::claude_import_run(core.inner(), selection, space_id)
		.await
}
