use tauri::{AppHandle, Runtime, State};

use super::super::context;
use super::super::contract::{
	state_in, Chat, CompanionArrival, ContextCheckpoint, Conversation, ConversationDeleted,
	ConversationInList, ConversationInPage, ConversationPage, ConversationStored, ObservedState,
	RuntimeSession, SoloState, TranscriptStoreError,
};
use super::super::state as conversation_state;
use super::bot::ready;
use crate::avatars;
use crate::companions::launch;
use crate::db;
use crate::db::repositories::conversations::{
	Conversation as StoredConversation, ConversationDraft, ConversationEdit, Joined, MISSION_KIND,
};
use crate::db::repositories::keyset;
use crate::db::repositories::runtime_context::{Handover, ParticipantKey};
use crate::events::{
	self, Event, COMPANION_ARRIVED, CONVERSATION_CREATED, CONVERSATION_DELETED,
	CONVERSATION_UPDATED,
};
use crate::file_store::FileStore;

#[tauri::command]
#[specta::specta]
pub async fn conversation_main_chat<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: Option<String>,
) -> Result<Chat, TranscriptStoreError> {
	let database = ready(&state)?;
	let chat = database.conversations().ensure_chat(bot_id, space_id).await?;
	let states = conversation_state::listed(&app, database, vec![chat.id.clone()]).await?;
	let observed = state_in(&states, &chat.id);
	Ok(Chat::of(chat, observed))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_solo_states<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<SoloState>, TranscriptStoreError> {
	let database = ready(&state)?;
	let threads = database.conversations().solo_threads(space_id).await?;
	let ids = threads.iter().map(|thread| thread.conversation_id.clone()).collect();
	let states = conversation_state::listed(&app, database, ids).await?;
	Ok(threads
		.into_iter()
		.map(|thread| SoloState {
			observed: state_in(&states, &thread.conversation_id),
			bot_id: thread.bot_id,
			conversation_id: thread.conversation_id,
		})
		.collect())
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
	let draft = ConversationDraft { space_id, section_id, title, icon: None, bot_ids };
	let database = ready(&state)?;
	let created = drawn(&app, database.conversations().create_conversation(draft).await?);
	announce_conversation(&app, database, CONVERSATION_CREATED, &created.id).await;
	Ok(created)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_list<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<ConversationInList>, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let database = ready(&state)?;
	let stored = database.conversations().conversations(space_id).await?;
	let ids = stored.iter().map(|room| room.id.clone()).collect();
	let states = conversation_state::listed(&app, database, ids).await?;
	Ok(stored
		.into_iter()
		.map(|room| ConversationInList {
			observed: state_in(&states, &room.id),
			conversation: Conversation::of(room, dir.as_deref()),
		})
		.collect())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_mission_thread<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	let thread = ready(&state)?.conversations().mission_thread(conversation_id).await?;
	Ok(drawn(&app, thread))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_page<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	cursor: Option<String>,
	limit: Option<u32>,
) -> Result<ConversationPage, TranscriptStoreError> {
	let after = keyset::after(cursor)
		.map_err(|cursor| TranscriptStoreError::UnreadableCursor { cursor })?;
	let database = ready(&state)?;
	let read = database
		.conversations()
		.conversation_page(space_id, after, keyset::page_size(limit))
		.await?;
	let ids = read.pinned.iter().chain(&read.page.rows).map(|row| row.conversation.id.clone());
	let states = conversation_state::listed(&app, database, ids.collect()).await?;
	Ok(ConversationPage::of(read, &states, avatars::Avatars::dir(&app).as_deref()))
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
#[expect(
	clippy::too_many_arguments,
	reason = "each field is a flat argument of the shipped conversation_update wire shape"
)]
pub async fn conversation_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	title: String,
	instructions: String,
	section_id: Option<String>,
	icon: Option<String>,
	color: Option<String>,
) -> Result<Conversation, TranscriptStoreError> {
	let edit = ConversationEdit { title, instructions, section_id, icon, color };
	let database = ready(&state)?;
	let updated = database.conversations().update_conversation(conversation_id, edit).await?;
	let updated = drawn(&app, updated);
	announce_conversation(&app, database, CONVERSATION_UPDATED, &updated.id).await;
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
		announce_conversation(app, database, CONVERSATION_UPDATED, &joined.conversation.id).await;
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
	let database = ready(&state)?;
	let left = database.conversations().remove_participant(conversation_id, bot_id).await?;
	let left = drawn(&app, left);
	announce_conversation(&app, database, CONVERSATION_UPDATED, &left.id).await;
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
	let database = ready(&state)?;
	let led = database.conversations().set_lead(conversation_id, bot_id).await?;
	let led = drawn(&app, led);
	announce_conversation(&app, database, CONVERSATION_UPDATED, &led.id).await;
	Ok(led)
}

pub(crate) async fn announce_conversation<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	event: Event<ConversationStored>,
	conversation_id: &str,
) {
	let failure = match conversation_state::observe(app, database, conversation_id).await {
		Ok(observed) => match announced(app, database, event, conversation_id, observed).await {
			Ok(()) => return,
			Err(failure) => failure,
		},
		Err(failure) => format!("its state did not read: {failure:?}"),
	};
	eprintln!("{} was not announced for conversation {conversation_id}: {failure}", event.name());
}

async fn announced<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	event: Event<ConversationStored>,
	conversation_id: &str,
	observed: ObservedState,
) -> Result<(), String> {
	match database.conversations().conversation_in_page(conversation_id.to_owned()).await {
		Ok(Some(row)) => {
			let conversation =
				ConversationInPage::of(row, observed, avatars::Avatars::dir(app).as_deref());
			let space_id = conversation.conversation.space_id.clone();
			events::emit(app, event, ConversationStored { space_id, conversation })
				.map_err(|failure| failure.to_string())
		}
		Ok(None) => match database.conversations().kind(conversation_id.to_owned()).await {
			Ok(Some(kind)) if kind == MISSION_KIND => Ok(()),
			Ok(Some(_)) => Err("the conversation is outside the feed".to_owned()),
			Ok(None) => Err("the conversation was not found".to_owned()),
			Err(failure) => Err(format!("the conversation kind did not read: {failure:?}")),
		},
		Err(failure) => Err(format!("the conversation row did not read: {failure:?}")),
	}
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
