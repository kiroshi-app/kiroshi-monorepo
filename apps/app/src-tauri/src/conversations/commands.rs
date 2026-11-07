pub use kiroshi_core::conversations::commands::*;

use crate::agent::contract::AgentCommand;
use crate::conversations::contract::{
	Bot, BotDraft, BotIdentity, Chat, ContextCheckpoint, Conversation, ConversationInList,
	ConversationPage, MessageReference, NewAssistantMessage, NewTurn, NewUserMessage, PinnedBubble,
	RuntimeSession, SentMessage, SoloState, SuggestedBot, TerminalCompletion, TranscriptPage,
	TranscriptStoreError, TranscriptWindow,
};
use crate::hosting::authorship::CommandCaller;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn conversation_bots(
	core: State<'_, crate::core_context::Core>,
	space_id: Option<String>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_bots(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bots_by_presence(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	excluded_conversation_id: Option<String>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_bots_by_presence(
		core.inner(),
		space_id,
		excluded_conversation_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_create_bot(
	core: State<'_, crate::core_context::Core>,
	identity: BotIdentity,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_create_bot(core.inner(), identity, space_id)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_create_bot_from_draft(
	core: State<'_, crate::core_context::Core>,
	draft: BotDraft,
	space_id: String,
) -> Result<Bot, TranscriptStoreError> {
	create_bot_from_draft(core.inner(), draft, space_id).await
}

#[tauri::command]
#[specta::specta]
pub fn conversation_suggested_bots() -> Vec<SuggestedBot> {
	suggested_bots()
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_duplicate_bot(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_duplicate_bot(
		core.inner(),
		bot_id,
		space_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_update_bot(
	core: State<'_, crate::core_context::Core>,
	id: String,
	identity: BotIdentity,
) -> Result<Bot, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_update_bot(core.inner(), id, identity).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_set_bot_memory(
	core: State<'_, crate::core_context::Core>,
	id: String,
	memory: String,
) -> Result<Bot, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_set_bot_memory(core.inner(), id, memory)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_set_bot_avatar_image(
	core: State<'_, crate::core_context::Core>,
	id: String,
	bytes: Vec<u8>,
) -> Result<Bot, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_set_bot_avatar_image(
		core.inner(),
		id,
		bytes,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_delete_bot(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_delete_bot(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_record_bot_commands(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	commands: Vec<AgentCommand>,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_record_bot_commands(
		core.inner(),
		bot_id,
		commands,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bot_commands(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
) -> Result<Vec<AgentCommand>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_bot_commands(core.inner(), bot_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_main_chat(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	space_id: Option<String>,
) -> Result<Chat, TranscriptStoreError> {
	main_chat(core.inner(), bot_id, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_solo_states(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<SoloState>, TranscriptStoreError> {
	solo_states(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_create(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	section_id: Option<String>,
	title: String,
	bot_ids: Vec<String>,
) -> Result<Conversation, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_create(
		core.inner(),
		space_id,
		section_id,
		title,
		bot_ids,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_list(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<ConversationInList>, TranscriptStoreError> {
	list_conversations(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_mission_thread(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_mission_thread(
		core.inner(),
		conversation_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_page(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	cursor: Option<String>,
	limit: Option<u32>,
) -> Result<ConversationPage, TranscriptStoreError> {
	conversations_page(core.inner(), space_id, cursor, limit).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_local_ids(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<String>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_local_ids(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_update(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	title: String,
	instructions: String,
	section_id: Option<String>,
	icon: Option<String>,
	color: Option<i64>,
) -> Result<Conversation, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_update(
		core.inner(),
		conversation_id,
		title,
		instructions,
		section_id,
		icon,
		color,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_delete(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<(), TranscriptStoreError> {
	delete_conversation(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_add_participant(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
	invited_by_bot_id: Option<String>,
) -> Result<Conversation, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_add_participant(
		core.inner(),
		conversation_id,
		bot_id,
		invited_by_bot_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_remove_participant(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_remove_participant(
		core.inner(),
		conversation_id,
		bot_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_set_lead(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
) -> Result<Conversation, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_set_lead(
		core.inner(),
		conversation_id,
		bot_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_open_runtime_session(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
	started_at: i64,
	runtime_session_id: Option<String>,
	reason: Option<String>,
) -> Result<RuntimeSession, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_open_runtime_session(
		core.inner(),
		conversation_id,
		bot_id,
		started_at,
		runtime_session_id,
		reason,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_record_provider_session(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	provider_session_id: String,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_record_provider_session(
		core.inner(),
		conversation_id,
		bot_id,
		runtime_session_id,
		provider_session_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bounded_context(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	prompt_message_id: String,
) -> Result<String, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_bounded_context(
		core.inner(),
		conversation_id,
		bot_id,
		runtime_session_id,
		prompt_message_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_roster_block(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
) -> Result<Option<String>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_roster_block(
		core.inner(),
		conversation_id,
		bot_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_capture_checkpoint(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	created_at: i64,
) -> Result<Option<ContextCheckpoint>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_capture_checkpoint(
		core.inner(),
		conversation_id,
		bot_id,
		runtime_session_id,
		created_at,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_page(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	before_seq: Option<i64>,
	limit: u32,
) -> Result<TranscriptPage, TranscriptStoreError> {
	message_page(core.inner(), conversation_id, before_seq, limit).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_page_around(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	seq: i64,
	limit: u32,
) -> Result<TranscriptWindow, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_message_page_around(
		core.inner(),
		conversation_id,
		seq,
		limit,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_reference(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	message_id: String,
) -> Result<Option<MessageReference>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_message_reference(
		core.inner(),
		conversation_id,
		message_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_header(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	message_id: String,
) -> Result<String, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_message_header(
		core.inner(),
		conversation_id,
		message_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_pin_message(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	message_id: String,
	block_index: i64,
	pinned_at: i64,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_pin_message(
		core.inner(),
		conversation_id,
		message_id,
		block_index,
		pinned_at,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_unpin_message(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	message_id: String,
	block_index: i64,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_unpin_message(
		core.inner(),
		conversation_id,
		message_id,
		block_index,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_pinned_messages(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<PinnedBubble>, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_pinned_messages(
		core.inner(),
		conversation_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_start_turn(
	core: State<'_, crate::core_context::Core>,
	turn: NewTurn,
) -> Result<i64, TranscriptStoreError> {
	start_turn(core.inner(), turn).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_complete_turn(
	core: State<'_, crate::core_context::Core>,
	id: String,
	completed_at: i64,
) -> Result<(), TranscriptStoreError> {
	complete_turn(core.inner(), id, completed_at).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_append_user_message(
	core: State<'_, crate::core_context::Core>,
	caller: CommandCaller,
	message: NewUserMessage,
) -> Result<i64, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_append_user_message(
		core.inner(),
		caller.0,
		message,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_send_user_message(
	core: State<'_, crate::core_context::Core>,
	caller: CommandCaller,
	message: NewUserMessage,
	summoned: Vec<String>,
) -> Result<i64, TranscriptStoreError> {
	send_user_message(core.inner(), caller.0, message, summoned).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_send_turn(
	core: State<'_, crate::core_context::Core>,
	caller: CommandCaller,
	message: SentMessage,
	summoned: Vec<String>,
) -> Result<i64, TranscriptStoreError> {
	kiroshi_core::conversations::commands::conversation_send_turn(
		core.inner(),
		caller.0,
		message,
		summoned,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_open_assistant_message(
	core: State<'_, crate::core_context::Core>,
	message: NewAssistantMessage,
) -> Result<i64, TranscriptStoreError> {
	open_assistant_message(core.inner(), message).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_append_text(
	core: State<'_, crate::core_context::Core>,
	id: String,
	delta: String,
) -> Result<(), TranscriptStoreError> {
	append_text(core.inner(), id, delta).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_finalize_message(
	core: State<'_, crate::core_context::Core>,
	id: String,
	completion: TerminalCompletion,
	settled_text: Option<String>,
) -> Result<(), TranscriptStoreError> {
	finalize_message(core.inner(), id, completion, settled_text).await
}
