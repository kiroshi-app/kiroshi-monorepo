use tauri::{AppHandle, Manager, Runtime, State};

use super::super::contract::{
	MessageReference, NewAssistantMessage, NewTurn, NewUserMessage, PinnedBubble, SentMessage,
	TerminalCompletion, TranscriptMessage, TranscriptPage, TranscriptStoreError, TranscriptWindow,
	MESSAGE_STORED_EVENT, UPDATED_EVENT,
};
use super::super::{context, host_turn};
use super::bot::ready;
use super::room::announce_conversation;
use crate::agent::reply_writer::HostWrites;
use crate::agent::AgentState;
use crate::db;
use crate::db::repositories::messages::{MessagePageQuery, MessagesAroundQuery};
use crate::events::{self, CONVERSATION_UPDATED, MESSAGE_STORED};
use crate::hosting::authorship::Caller;

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_page(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	before_seq: Option<i64>,
	limit: u32,
) -> Result<TranscriptPage, TranscriptStoreError> {
	let query = MessagePageQuery { conversation_id: conversation_id.clone(), before_seq, limit };
	let page = ready(&state)?.messages().page_messages(query).await?;
	Ok(TranscriptPage::of(conversation_id, page))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_page_around(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	seq: i64,
	limit: u32,
) -> Result<TranscriptWindow, TranscriptStoreError> {
	let query = MessagesAroundQuery { conversation_id: conversation_id.clone(), seq, limit };
	let Some(around) = ready(&state)?.messages().messages_around(query).await? else {
		return Err(TranscriptStoreError::UnknownMessageSeq { conversation_id, seq });
	};
	Ok(TranscriptWindow::of(conversation_id, around))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_reference(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
) -> Result<Option<MessageReference>, TranscriptStoreError> {
	let database = ready(&state)?;
	let Some(stored) = database.messages().message(conversation_id.clone(), message_id).await?
	else {
		return Ok(None);
	};
	let run = context::run_behind(database, &stored).await?;
	Ok(Some(MessageReference::of(conversation_id, stored, run)))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_message_header(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
) -> Result<String, TranscriptStoreError> {
	context::message_header(ready(&state)?, conversation_id, message_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_pin_message(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
	block_index: i64,
	pinned_at: i64,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?
		.messages()
		.pin_message(conversation_id, message_id, block_index, pinned_at)
		.await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_unpin_message(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
	block_index: i64,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.messages().unpin_message(conversation_id, message_id, block_index).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_pinned_messages(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Vec<PinnedBubble>, TranscriptStoreError> {
	let stored = ready(&state)?.messages().pinned_messages(conversation_id.clone()).await?;
	Ok(stored.into_iter().map(|pin| PinnedBubble::of(&conversation_id, pin)).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_start_turn<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	turn: NewTurn,
) -> Result<i64, TranscriptStoreError> {
	let messages = ready(&state)?.messages();
	if owned_by_host(&app, |host| host.owns_turn(&turn.id)) {
		return Ok(messages.ensure_turn(turn.into()).await?);
	}
	Ok(messages.start_turn(turn.into()).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_complete_turn<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	completed_at: i64,
) -> Result<(), TranscriptStoreError> {
	let messages = ready(&state)?.messages();
	if owned_by_host(&app, |host| host.owns_turn(&id)) {
		return Ok(());
	}
	Ok(messages.complete_turn(id, completed_at).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_append_user_message<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	caller: Caller,
	message: NewUserMessage,
) -> Result<i64, TranscriptStoreError> {
	let database = ready(&state)?;
	let author = caller.author(&app, database).await?;
	let (conversation_id, id) = (message.conversation_id.clone(), message.id.clone());
	let seq = database.messages().append_user_message(message.written_by(author)).await?;
	announce_stored(&app, database, conversation_id.clone(), id).await;
	announce_conversation(&app, database, CONVERSATION_UPDATED, &conversation_id).await;
	Ok(seq)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_send_user_message<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	caller: Caller,
	message: NewUserMessage,
	summoned: Vec<String>,
) -> Result<i64, TranscriptStoreError> {
	store_sent(&app, ready(&state)?, caller, message, &summoned).await
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_send_turn<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	agent: State<'_, AgentState>,
	caller: Caller,
	message: SentMessage,
	summoned: Vec<String>,
) -> Result<i64, TranscriptStoreError> {
	let database = ready(&state)?;
	let held = agent.host_turns().hold(&message.conversation_id, &message.turn_id)?;
	let summoned = host_turn::summoned_for(database, &message, summoned).await?;
	let seq = store_sent(&app, database, caller, message.clone().into(), &summoned).await?;
	host_turn::run(app, held, message, summoned).await;
	Ok(seq)
}

async fn store_sent<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	caller: Caller,
	message: NewUserMessage,
	summoned: &[String],
) -> Result<i64, TranscriptStoreError> {
	let turn_id = message.turn_id.clone();
	let completed_at = summoned.is_empty().then_some(message.created_at);
	let author = caller.author(app, database).await?;
	let (conversation_id, id) = (message.conversation_id.clone(), message.id.clone());
	let seq =
		database.messages().send_user_message(message.written_by(author), completed_at).await?;
	if let Some(agent) = app.try_state::<AgentState>() {
		agent.host_writes().claim_turn(&turn_id);
	}
	announce_stored(app, database, conversation_id.clone(), id).await;
	announce_conversation(app, database, CONVERSATION_UPDATED, &conversation_id).await;
	Ok(seq)
}

async fn announce_stored<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: String,
	id: String,
) {
	let failure = match database.messages().message(conversation_id.clone(), id.clone()).await {
		Ok(Some(stored)) => {
			let message = TranscriptMessage::of(&conversation_id, stored);
			match events::emit(app, MESSAGE_STORED, message) {
				Ok(()) => return,
				Err(failure) => failure.to_string(),
			}
		}
		Ok(None) => "the stored message was not found again".to_owned(),
		Err(failure) => format!("the stored message did not read back: {failure:?}"),
	};
	eprintln!(
		"{MESSAGE_STORED_EVENT} was not announced for message {id} of conversation {conversation_id}: {failure}"
	);
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_open_assistant_message<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	message: NewAssistantMessage,
) -> Result<i64, TranscriptStoreError> {
	let database = ready(&state)?;
	let messages = database.messages();
	if !owned_by_host(&app, |host| host.owns_message(&message.id)) {
		let conversation_id = message.conversation_id.clone();
		let seq = messages.open_assistant_message(message.into()).await?;
		announce_conversation(&app, database, CONVERSATION_UPDATED, &conversation_id).await;
		return Ok(seq);
	}
	match messages.message(message.conversation_id, message.id.clone()).await? {
		Some(stored) => Ok(stored.seq),
		None => Err(TranscriptStoreError::UnknownMessage { id: message.id }),
	}
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_append_text<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	delta: String,
) -> Result<(), TranscriptStoreError> {
	let messages = ready(&state)?.messages();
	if owned_by_host(&app, |host| host.owns_message(&id)) {
		return Ok(());
	}
	Ok(messages.append_text(id, delta).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_finalize_message<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	completion: TerminalCompletion,
	settled_text: Option<String>,
) -> Result<(), TranscriptStoreError> {
	let database = ready(&state)?;
	let messages = database.messages();
	if owned_by_host(&app, |host| host.owns_message(&id)) {
		return Ok(());
	}
	messages.finalize_message(id.clone(), completion.into(), settled_text).await?;
	match messages.conversation_of_message(id.clone()).await {
		Ok(Some(conversation_id)) => {
			announce_conversation(&app, database, CONVERSATION_UPDATED, &conversation_id).await
		}
		Ok(None) => {
			eprintln!("{UPDATED_EVENT} was not announced for message {id}: it was not found")
		}
		Err(failure) => eprintln!(
			"{UPDATED_EVENT} was not announced for message {id}: its conversation did not read: {failure:?}"
		),
	}
	Ok(())
}

fn owned_by_host<R: Runtime>(app: &AppHandle<R>, owns: impl Fn(&HostWrites) -> bool) -> bool {
	app.try_state::<AgentState>().is_some_and(|agent| owns(agent.host_writes()))
}
