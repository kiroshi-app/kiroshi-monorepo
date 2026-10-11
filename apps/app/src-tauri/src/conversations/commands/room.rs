use tauri::{AppHandle, Runtime, State};

use super::super::context;
use super::super::contract::{
	Chat, CompanionArrival, ContextCheckpoint, Conversation, ConversationDeleted,
	ConversationStored, RuntimeSession, TranscriptStoreError,
};
use super::bot::ready;
use crate::avatars;
use crate::companions::launch;
use crate::db;
use crate::db::repositories::conversations::{
	Conversation as StoredConversation, ConversationDraft, ConversationEdit, Joined,
};
use crate::db::repositories::runtime_context::{Handover, ParticipantKey};
use crate::events::{
	Event, COMPANION_ARRIVED, CONVERSATION_CREATED, CONVERSATION_DELETED, CONVERSATION_UPDATED,
};
use crate::file_store::FileStore;

#[tauri::command]
#[specta::specta]
pub async fn conversation_main_chat(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: Option<String>,
) -> Result<Chat, TranscriptStoreError> {
	Ok(ready(&state)?.conversations().ensure_chat(bot_id, space_id).await?.into())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_create<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	section_id: Option<String>,
	title: String,
	bot_ids: Vec<String>,
) -> Result<Conversation, TranscriptStoreError> {
	let draft = ConversationDraft { space_id, section_id, title, bot_ids };
	let created = drawn(&app, ready(&state)?.conversations().create_conversation(draft).await?);
	announce_stored(&app, CONVERSATION_CREATED, &created);
	Ok(created)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_list<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<Conversation>, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let stored = ready(&state)?.conversations().conversations(space_id).await?;
	Ok(stored.into_iter().map(|room| Conversation::of(room, dir.as_deref())).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_local_ids(
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<String>, TranscriptStoreError> {
	let mut ids = ready(&state)?.conversations().conversation_ids().await?;
	ids.sort_unstable();
	Ok(ids)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	title: String,
	instructions: String,
	section_id: Option<String>,
) -> Result<Conversation, TranscriptStoreError> {
	let edit = ConversationEdit { title, instructions, section_id };
	let updated = ready(&state)?.conversations().update_conversation(conversation_id, edit).await?;
	let updated = drawn(&app, updated);
	announce_stored(&app, CONVERSATION_UPDATED, &updated);
	Ok(updated)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_delete<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<(), TranscriptStoreError> {
	let conversations = ready(&state)?.conversations();
	let space_id = conversations.space(conversation_id.clone()).await?;
	conversations.delete_conversation(conversation_id.clone()).await?;
	launch::announce(&app, CONVERSATION_DELETED, ConversationDeleted { space_id, conversation_id });
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_add_participant<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	invited_by_bot_id: Option<String>,
) -> Result<Conversation, TranscriptStoreError> {
	let joined =
		seat_participant(&app, ready(&state)?, conversation_id, bot_id, invited_by_bot_id).await?;
	Ok(drawn(&app, joined.conversation))
}

pub(crate) async fn seat_participant<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: String,
	bot_id: String,
	invited_by_bot_id: Option<String>,
) -> Result<Joined, TranscriptStoreError> {
	let joined = database
		.conversations()
		.add_participant(conversation_id, bot_id, invited_by_bot_id)
		.await?;
	if let Some(arrival) = &joined.arrival {
		launch::announce(app, COMPANION_ARRIVED, CompanionArrival::from(arrival.clone()));
		announce_stored(app, CONVERSATION_UPDATED, &drawn(app, joined.conversation.clone()));
	}
	Ok(joined)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_remove_participant<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	let left = ready(&state)?.conversations().remove_participant(conversation_id, bot_id).await?;
	let left = drawn(&app, left);
	announce_stored(&app, CONVERSATION_UPDATED, &left);
	Ok(left)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_set_lead<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	let led = ready(&state)?.conversations().set_lead(conversation_id, bot_id).await?;
	let led = drawn(&app, led);
	announce_stored(&app, CONVERSATION_UPDATED, &led);
	Ok(led)
}

fn announce_stored<R: Runtime>(
	app: &AppHandle<R>,
	event: Event<ConversationStored>,
	conversation: &Conversation,
) {
	let stored = ConversationStored {
		space_id: conversation.space_id.clone(),
		conversation: conversation.clone(),
	};
	launch::announce(app, event, stored);
}

fn drawn<R: Runtime>(app: &AppHandle<R>, room: StoredConversation) -> Conversation {
	Conversation::of(room, avatars::Avatars::dir(app).as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_open_runtime_session(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	started_at: i64,
	runtime_session_id: Option<String>,
	reason: Option<String>,
) -> Result<RuntimeSession, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	let handover = runtime_session_id.map(|session_id| Handover { session_id, reason });
	Ok(ready(&state)?.runtime_context().open(participant, started_at, handover).await?.into())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_record_provider_session(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	provider_session_id: String,
) -> Result<(), TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	Ok(ready(&state)?
		.runtime_context()
		.record_provider_session(participant, runtime_session_id, provider_session_id)
		.await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bounded_context(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	prompt_message_id: String,
) -> Result<String, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	context::bounded_context(ready(&state)?, participant, runtime_session_id, prompt_message_id)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_roster_block(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
) -> Result<Option<String>, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	context::roster_block(ready(&state)?, participant).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_capture_checkpoint(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	created_at: i64,
) -> Result<Option<ContextCheckpoint>, TranscriptStoreError> {
	let participant = ParticipantKey { conversation_id, bot_id };
	Ok(context::capture_checkpoint(ready(&state)?, participant, runtime_session_id, created_at)
		.await?
		.map(Into::into))
}
