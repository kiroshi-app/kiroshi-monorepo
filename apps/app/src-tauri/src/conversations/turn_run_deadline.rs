pub use kiroshi_core::conversations::turn_run_deadline::*;

use crate::conversations::contract::TranscriptStoreError;
use crate::conversations::summons::SummonsDropReason;
use tauri::{AppHandle, Runtime};

#[tauri::command]
#[specta::specta]
pub async fn conversation_drop_summons<R: Runtime>(
	app: AppHandle<R>,
	conversation_id: String,
	turn_id: String,
	bot_id: String,
	reason: SummonsDropReason,
) -> Result<bool, TranscriptStoreError> {
	kiroshi_core::conversations::turn_run_deadline::conversation_drop_summons(
		crate::events::core(&app),
		conversation_id,
		turn_id,
		bot_id,
		reason,
	)
	.await
}
