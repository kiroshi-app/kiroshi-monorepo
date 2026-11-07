use tauri::{AppHandle, Runtime, State};

use super::contract::{AttachmentStoreError, SubmittedAttachment};
use super::{store, Attachments};
use crate::db;
use crate::file_store::FileStore;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, AttachmentStoreError> {
	state.as_ref().map_err(|failure| AttachmentStoreError::Unavailable { failure: failure.into() })
}

#[tauri::command]
#[specta::specta]
pub async fn chat_store_attachments<R: Runtime>(
	app: AppHandle<R>,
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	attachments: Vec<SubmittedAttachment>,
) -> Result<Vec<String>, AttachmentStoreError> {
	let state = core.state::<db::DatabaseState>();
	let known = ready(&state)?.conversations().conversation_ids().await?;
	if !known.iter().any(|id| id == &conversation_id) {
		return Err(AttachmentStoreError::UnknownConversation { id: conversation_id });
	}
	let root =
		Attachments::dir(crate::events::core(&app)).ok_or(AttachmentStoreError::Unwritable {
			detail: "there is no application data directory to store attachments in".to_owned(),
		})?;
	let stored = store(&root, &conversation_id, &attachments)?;
	Ok(stored.iter().map(|path| path.to_string_lossy().into_owned()).collect())
}
