pub use kiroshi_core::conversations::awaited_runs::*;

use crate::conversations::contract::{SummonsDropped, TranscriptStoreError};
use tauri::{Runtime, State, Webview};

#[tauri::command]
#[specta::specta]
pub async fn conversation_serve_awaited_runs<R: Runtime>(
	webview: Webview<R>,
	core: State<'_, crate::core_context::Core>,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::conversations::awaited_runs::conversation_serve_awaited_runs(
		core.inner(),
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
	kiroshi_core::conversations::awaited_runs::conversation_claim_unseen_drops(
		core.inner(),
		conversation_id,
	)
}
