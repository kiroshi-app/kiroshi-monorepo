use tauri::State;

use super::contract::{AttachmentStoreError, SubmittedAttachment};

#[tauri::command]
#[specta::specta]
pub async fn chat_store_attachments(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	attachments: Vec<SubmittedAttachment>,
) -> Result<Vec<String>, AttachmentStoreError> {
	kiroshi_core::attachments::commands::chat_store_attachments(
		core.inner(),
		conversation_id,
		attachments,
	)
	.await
}
