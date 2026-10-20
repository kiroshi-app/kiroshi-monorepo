use rusqlite::types::FromSql;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};

use super::arrivals::{self, Arrival, SeqSpan};
use crate::agent::translate::now_ms;
use crate::db::connection::Located;
use crate::db::{Access, DatabaseError};

mod activities;
mod state;

pub use activities::{NewActivity, StoredActivity};
pub(in crate::db) use state::stored_as_text;
pub use state::{
	ActivityStatus, InitialStatus, MessageRole, MessageState, TerminalState, TerminalStatus,
	WrittenFrom,
};

use activities::{advance_activity, read_activity, store_activity, ACTIVITIES_OF_TURN};

#[derive(Debug)]
pub enum TranscriptError {
	Conflict { id: String, field: &'static str },
	InvalidTransition { id: String, from: &'static str, to: &'static str },
	UnknownMessage { id: String },
	UnknownConversation { id: String },
	UnknownTurn { id: String },
	UnknownParticipant { conversation_id: String, bot_id: String },
	Database(DatabaseError),
}

impl Located for TranscriptError {
	fn at(self, operation: &'static str, table: &'static str) -> Self {
		match self {
			TranscriptError::Database(error) => {
				TranscriptError::Database(error.at(operation, table))
			}
			refused => refused,
		}
	}
}

impl From<DatabaseError> for TranscriptError {
	fn from(error: DatabaseError) -> Self {
		TranscriptError::Database(error)
	}
}

impl From<rusqlite::Error> for TranscriptError {
	fn from(error: rusqlite::Error) -> Self {
		TranscriptError::Database(error.into())
	}
}

pub struct NewTurn {
	pub id: String,
	pub conversation_id: String,
	pub started_at: i64,
}

pub struct EndedRun {
	pub turn_id: String,
	pub bot_id: String,
	pub handed_to: Vec<String>,
	pub ended_at: i64,
}

pub struct NewAssistantMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub created_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AccountAuthor {
	pub account_id: Option<String>,
	pub name: Option<String>,
}

pub struct NewUserMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub author: AccountAuthor,
	pub written_from: WrittenFrom,
	pub replied_to_message_id: Option<String>,
	pub content: String,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredMessage {
	pub id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub seq: i64,
	pub role: MessageRole,
	pub content: String,
	pub state: MessageState,
	pub created_at: i64,
	pub runtime_session_id: Option<String>,
	pub author: AccountAuthor,
	pub written_from: Option<WrittenFrom>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredPin {
	pub message: StoredMessage,
	pub block_index: i64,
	pub pinned_at: i64,
}

pub struct MessagePageQuery {
	pub conversation_id: String,
	pub before_seq: Option<i64>,
	pub limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessagePage {
	pub messages: Vec<StoredMessage>,
	pub arrivals: Vec<Arrival>,
	pub has_more: bool,
}

pub struct MessagesAroundQuery {
	pub conversation_id: String,
	pub seq: i64,
	pub limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessagesAround {
	pub messages: Vec<StoredMessage>,
	pub arrivals: Vec<Arrival>,
	pub has_older: bool,
	pub has_newer: bool,
}

pub struct MessageWindowQuery {
	pub conversation_id: String,
	pub after_seq: i64,
	pub before_seq: i64,
	pub limit: u32,
}

pub enum MessageAuthorship {
	Bot(String),
	AnyoneBut(String),
}

pub struct LatestMessageQuery {
	pub conversation_id: String,
	pub authorship: MessageAuthorship,
	pub not_after: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecoveryReport {
	pub completed_turns: usize,
	pub interrupted_messages: usize,
	pub terminated_activities: usize,
}

const CONVERSATION_EXISTS: &str = "SELECT EXISTS(SELECT 1 FROM conversations WHERE id = ?1)";
const TURN_IN_CONVERSATION_EXISTS: &str =
	"SELECT EXISTS(SELECT 1 FROM turns WHERE id = ?1 AND conversation_id = ?2)";
const SEAT_EXISTS: &str = "SELECT EXISTS(SELECT 1 FROM conversation_participants
	WHERE conversation_id = ?1 AND bot_id = ?2)";
const TURN_KEY: &str = "SELECT seq, conversation_id, started_at FROM turns WHERE id = ?1";
const CONVERSATION_OF_TURN: &str = "SELECT conversation_id FROM turns WHERE id = ?1";
const INSERT_TURN: &str = "INSERT INTO turns (id, conversation_id, seq, started_at)
	VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM turns WHERE conversation_id = ?2), ?3)
	RETURNING seq";
const COMPLETE_TURN: &str =
	"UPDATE turns SET completed_at = ?2 WHERE id = ?1 AND completed_at IS NULL";
const COMPLETE_EARLIER_UNANSWERED_TURNS: &str = "UPDATE turns SET completed_at = ?3
	WHERE conversation_id = ?1 AND id <> ?2 AND completed_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.turn_id = turns.id
			AND messages.role = 'assistant'
			AND messages.completion_state IN ('pending', 'streaming'))";
const COMPLETE_OPEN_TURNS: &str = "UPDATE turns SET completed_at = ?1 WHERE completed_at IS NULL";
const REOPEN_TURN: &str = "UPDATE turns SET completed_at = NULL WHERE id = ?1";
const COMPLETE_TURN_NO_BOT_RUNS_ON: &str = "UPDATE turns SET completed_at = ?2
	WHERE id = ?1 AND completed_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM turn_runs WHERE turn_runs.turn_id = turns.id)";
const HOLD_RUN: &str =
	"INSERT OR IGNORE INTO turn_runs (turn_id, bot_id, state) VALUES (?1, ?2, ?3)";
const RELEASE_RUN: &str = "DELETE FROM turn_runs WHERE turn_id = ?1 AND bot_id = ?2 AND state = ?3";
const CANCEL_OPEN_MESSAGES_OF_RUN: &str = "UPDATE messages SET completion_state = 'cancelled'
	WHERE turn_id = ?1 AND author_bot_id = ?2 AND completion_state IN ('pending', 'streaming')";
const RELEASE_EVERY_RUN: &str = "DELETE FROM turn_runs";
const AWAITED: &str = "awaited";
const RUNNING: &str = "running";
const OPEN_TURNS_WITHOUT_REPLY: &str = "SELECT id FROM turns
	WHERE conversation_id = ?1 AND completed_at IS NULL
		AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.turn_id = turns.id
			AND messages.role = 'assistant')
	ORDER BY seq";

const MESSAGE_KEY: &str = "SELECT seq, conversation_id, turn_id, author_bot_id,
		replied_to_message_id, role, created_at, content
	FROM messages WHERE id = ?1";
const MESSAGE_STATE: &str = "SELECT completion_state FROM messages WHERE id = ?1";
const INSERT_MESSAGE: &str = "INSERT INTO messages
	(id, conversation_id, turn_id, author_bot_id, replied_to_message_id, seq, role, content,
		completion_state, created_at, runtime_session_id, author_account_id, author_name,
		written_from)
	VALUES (?1, ?2, ?3, ?4, ?5,
		(SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?2),
		?6, ?7, ?8, ?9,
		(SELECT id FROM runtime_sessions
			WHERE conversation_id = ?2 AND status = 'active'
			ORDER BY seq DESC LIMIT 1),
		?10, ?11, ?12)
	RETURNING seq";
const APPEND_TEXT: &str =
	"UPDATE messages SET content = content || ?2, completion_state = 'streaming'
	WHERE id = ?1 AND completion_state IN ('pending', 'streaming')";
const FINALIZE_MESSAGE: &str =
	"UPDATE messages SET completion_state = ?2, content = COALESCE(?3, content)
	WHERE id = ?1 AND completion_state IN ('pending', 'streaming')";
const REPLACE_CONTENT: &str = "UPDATE messages SET content = ?2 WHERE id = ?1";
const REPLACE_INDEXED_CONTENT: &str =
	"UPDATE message_search SET content = ?2 WHERE message_id = ?1";
const MESSAGE_PAGE: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND seq < ?2 ORDER BY seq DESC LIMIT ?3";
const MESSAGE_AT_SEQ: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND seq = ?2";
const MESSAGES_AFTER_SEQ: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq,
		role, content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3";
const MESSAGE_OLDER_THAN_SEQ: &str =
	"SELECT EXISTS(SELECT 1 FROM messages WHERE conversation_id = ?1 AND seq < ?2)";
const MESSAGE_NEWER_THAN_SEQ: &str =
	"SELECT EXISTS(SELECT 1 FROM messages WHERE conversation_id = ?1 AND seq > ?2)";
const MESSAGE_BY_ID: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND id = ?2";
const MESSAGE_WINDOW: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND seq > ?2 AND seq < ?3
	ORDER BY seq DESC LIMIT ?4";
const LATEST_MESSAGE_ASIDE_BOT: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id,
		seq, role, content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND COALESCE(author_bot_id, '') <> ?2
		AND created_at <= ?3
		AND trim(content, char(32, 9, 10, 13)) <> '' ORDER BY seq DESC LIMIT 1";
const LATEST_MESSAGE_OF_BOT: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq,
		role, content, completion_state, created_at, runtime_session_id, author_account_id,
		author_name, written_from
	FROM messages WHERE conversation_id = ?1 AND author_bot_id = ?2 AND created_at <= ?3
		AND trim(content, char(32, 9, 10, 13)) <> '' ORDER BY seq DESC LIMIT 1";
const MESSAGE_OF_CONVERSATION: &str =
	"SELECT 1 FROM messages WHERE conversation_id = ?1 AND id = ?2";
const KEEP_MESSAGE_PIN: &str =
	"INSERT INTO message_pins (conversation_id, message_id, block_index, pinned_at)
	VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING";
const CLEAR_MESSAGE_PIN: &str = "DELETE FROM message_pins
	WHERE conversation_id = ?1 AND message_id = ?2 AND block_index = ?3";
const PINNED_MESSAGES: &str = "SELECT messages.id, messages.turn_id, messages.author_bot_id,
		messages.replied_to_message_id, messages.seq, messages.role, messages.content,
		messages.completion_state, messages.created_at, messages.runtime_session_id,
		messages.author_account_id, messages.author_name, messages.written_from,
		message_pins.block_index, message_pins.pinned_at
	FROM message_pins
	JOIN messages ON messages.id = message_pins.message_id
		AND messages.conversation_id = message_pins.conversation_id
	WHERE message_pins.conversation_id = ?1
	ORDER BY messages.seq DESC, message_pins.block_index ASC";
const CONVERSATION_OF_MESSAGE: &str = "SELECT conversation_id FROM messages WHERE id = ?1";

const RUN_OF_TURN: &str = "SELECT runtime_session_id FROM messages
	WHERE turn_id = ?1 AND role = 'assistant' AND runtime_session_id IS NOT NULL
	ORDER BY seq LIMIT 1";
const LAST_MESSAGE_SEQ: &str =
	"SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?1";

const INTERRUPT_OPEN_MESSAGES: &str = "UPDATE messages SET completion_state = 'interrupted'
	WHERE completion_state IN ('pending', 'streaming')";
const TERMINATE_OPEN_ACTIVITIES: &str = "UPDATE activities SET status = 'terminated'
	WHERE status IN ('pending', 'running')";

pub struct MessagesRepository {
	access: Access,
}

impl MessagesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	pub async fn start_turn(&self, turn: NewTurn) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_turn(connection, turn)))
			.await?
			.at("start_turn", "turns")
	}

	pub async fn ensure_turn(&self, turn: NewTurn) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(keep_turn(connection, turn)))
			.await?
			.at("ensure_turn", "turns")
	}

	pub async fn start_run(&self, turn: NewTurn, bot_id: String) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(started_run(connection, &turn, &bot_id)))
			.await?
			.at("start_run", "turn_runs")
	}

	pub async fn end_run(&self, ended: EndedRun) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(ended_run(connection, &ended)))
			.await?
			.at("end_run", "turn_runs")
	}

	pub async fn await_runs(
		&self,
		turn_id: String,
		bot_ids: Vec<String>,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(awaited_runs(connection, &turn_id, &bot_ids)))
			.await?
			.at("await_runs", "turn_runs")
	}

	pub async fn abandon_run(
		&self,
		turn_id: String,
		bot_id: String,
		abandoned_at: i64,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(abandoned_run(connection, &turn_id, &bot_id, abandoned_at))
		})
		.await?
		.at("abandon_run", "turn_runs")
	}

	pub async fn cancel_run(
		&self,
		turn_id: String,
		bot_id: String,
		cancelled_at: i64,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(cancelled_run(connection, &turn_id, &bot_id, cancelled_at))
		})
		.await?
		.at("cancel_run", "turn_runs")
	}

	pub async fn expire_awaited_run(
		&self,
		turn_id: String,
		bot_id: String,
		expired_at: i64,
	) -> Result<bool, TranscriptError> {
		self.call_mut(move |connection| {
			Ok(expired_awaited_run(connection, &turn_id, &bot_id, expired_at))
		})
		.await?
		.at("expire_awaited_run", "turn_runs")
	}

	pub async fn complete_turn(
		&self,
		id: String,
		completed_at: i64,
	) -> Result<(), TranscriptError> {
		Ok(self
			.call(move |connection| {
				connection.prepare_cached(COMPLETE_TURN)?.execute(params![id, completed_at])?;
				Ok(())
			})
			.await
			.at("complete_turn", "turns")?)
	}

	pub async fn send_user_message(
		&self,
		message: NewUserMessage,
		completed_at: Option<i64>,
	) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(open_turn_with(connection, message, completed_at)))
			.await?
			.at("send_user_message", "messages")
	}

	pub async fn open_turns_without_reply(
		&self,
		conversation_id: String,
	) -> Result<Vec<String>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(OPEN_TURNS_WITHOUT_REPLY)?;
				let ids = statement
					.query_map(params![conversation_id], |row| row.get(0))?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(ids)
			})
			.await
			.at("open_turns_without_reply", "turns")?)
	}

	pub async fn open_assistant_message(
		&self,
		message: NewAssistantMessage,
	) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_message(connection, message.into())))
			.await?
			.at("open_assistant_message", "messages")
	}

	pub async fn append_user_message(
		&self,
		message: NewUserMessage,
	) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_message(connection, message.into())))
			.await?
			.at("append_user_message", "messages")
	}

	pub async fn append_text(&self, id: String, delta: String) -> Result<(), TranscriptError> {
		Ok(self
			.call(move |connection| {
				connection.prepare_cached(APPEND_TEXT)?.execute(params![id, delta])?;
				Ok(())
			})
			.await
			.at("append_text", "messages")?)
	}

	pub async fn finalize_message(
		&self,
		id: String,
		state: TerminalState,
		settled_text: Option<String>,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(close_message(connection, &id, state, settled_text.as_deref()))
		})
		.await?
		.at("finalize_message", "messages")
	}

	pub async fn replace_content(
		&self,
		id: String,
		content: String,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(rewrite_content(connection, &id, &content)))
			.await?
			.at("replace_content", "messages")
	}

	pub async fn page_messages(
		&self,
		query: MessagePageQuery,
	) -> Result<MessagePage, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let before_seq = query.before_seq.unwrap_or(i64::MAX);
				let limit = query.limit as usize;
				let mut statement = connection.prepare_cached(MESSAGE_PAGE)?;
				let mut rows = statement.query(params![
					query.conversation_id,
					before_seq,
					i64::from(query.limit) + 1
				])?;
				let mut messages = Vec::new();
				let mut has_more = false;
				while let Some(row) = rows.next()? {
					if messages.len() == limit {
						has_more = true;
						break;
					}
					messages.push(read_message(row)?);
				}
				messages.reverse();
				let span = SeqSpan {
					lowest: match has_more {
						true => messages.first().map_or(before_seq, |message| message.seq),
						false => i64::MIN,
					},
					highest: before_seq.saturating_sub(1),
				};
				let arrivals = arrivals::within(connection, &query.conversation_id, span)?;
				Ok(MessagePage { messages, arrivals, has_more })
			})
			.await
			.at("page_messages", "messages")?)
	}

	pub async fn messages_around(
		&self,
		query: MessagesAroundQuery,
	) -> Result<Option<MessagesAround>, TranscriptError> {
		Ok(self
			.call(move |connection| read_around(connection, &query))
			.await
			.at("messages_around", "messages")?)
	}

	pub async fn message(
		&self,
		conversation_id: String,
		id: String,
	) -> Result<Option<StoredMessage>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				Ok(connection
					.prepare_cached(MESSAGE_BY_ID)?
					.query_row(params![conversation_id, id], read_message)
					.optional()?)
			})
			.await
			.at("message", "messages")?)
	}

	pub async fn pin_message(
		&self,
		conversation_id: String,
		id: String,
		block_index: i64,
		pinned_at: i64,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(keep_pin(connection, &conversation_id, &id, block_index, pinned_at))
		})
		.await?
		.at("pin_message", "message_pins")
	}

	pub async fn unpin_message(
		&self,
		conversation_id: String,
		id: String,
		block_index: i64,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(clear_pin(connection, &conversation_id, &id, block_index))
		})
		.await?
		.at("unpin_message", "message_pins")
	}

	pub async fn pinned_messages(
		&self,
		conversation_id: String,
	) -> Result<Vec<StoredPin>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(PINNED_MESSAGES)?;
				let pins = statement
					.query_map(params![conversation_id], read_pin)?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(pins)
			})
			.await
			.at("pinned_messages", "message_pins")?)
	}

	pub async fn run_of_turn(&self, turn_id: String) -> Result<Option<String>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				Ok(connection
					.prepare_cached(RUN_OF_TURN)?
					.query_row(params![turn_id], |row| row.get(0))
					.optional()?)
			})
			.await
			.at("run_of_turn", "messages")?)
	}

	pub async fn conversation_of_message(
		&self,
		id: String,
	) -> Result<Option<String>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				Ok(connection
					.prepare_cached(CONVERSATION_OF_MESSAGE)?
					.query_row(params![id], |row| row.get(0))
					.optional()?)
			})
			.await
			.at("conversation_of_message", "messages")?)
	}

	pub async fn window_messages(
		&self,
		query: MessageWindowQuery,
	) -> Result<Vec<StoredMessage>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(MESSAGE_WINDOW)?;
				let mut messages = statement
					.query_map(
						params![
							query.conversation_id,
							query.after_seq,
							query.before_seq,
							query.limit
						],
						read_message,
					)?
					.collect::<Result<Vec<_>, _>>()?;
				messages.reverse();
				Ok(messages)
			})
			.await
			.at("window_messages", "messages")?)
	}

	pub async fn latest_message(
		&self,
		query: LatestMessageQuery,
	) -> Result<Option<StoredMessage>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let (statement, bot_id) = match &query.authorship {
					MessageAuthorship::Bot(bot_id) => (LATEST_MESSAGE_OF_BOT, bot_id),
					MessageAuthorship::AnyoneBut(bot_id) => (LATEST_MESSAGE_ASIDE_BOT, bot_id),
				};
				Ok(connection
					.prepare_cached(statement)?
					.query_row(
						params![query.conversation_id, bot_id, query.not_after],
						read_message,
					)
					.optional()?)
			})
			.await
			.at("latest_message", "messages")?)
	}

	pub async fn last_seq(&self, conversation_id: String) -> Result<i64, TranscriptError> {
		Ok(self
			.call(move |connection| {
				Ok(connection
					.prepare_cached(LAST_MESSAGE_SEQ)?
					.query_row(params![conversation_id], |row| row.get(0))?)
			})
			.await
			.at("last_seq", "messages")?)
	}

	pub async fn append_activity(&self, activity: NewActivity) -> Result<i64, TranscriptError> {
		self.call_mut(move |connection| Ok(store_activity(connection, activity)))
			.await?
			.at("append_activity", "activities")
	}

	pub async fn start_activity(&self, id: String) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| {
			Ok(advance_activity(connection, &id, ActivityStatus::Running))
		})
		.await?
		.at("start_activity", "activities")
	}

	pub async fn finish_activity(
		&self,
		id: String,
		status: TerminalStatus,
	) -> Result<(), TranscriptError> {
		self.call_mut(move |connection| Ok(advance_activity(connection, &id, status.into())))
			.await?
			.at("finish_activity", "activities")
	}

	pub async fn activities_for_turn(
		&self,
		turn_id: String,
	) -> Result<Vec<StoredActivity>, TranscriptError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(ACTIVITIES_OF_TURN)?;
				let activities = statement
					.query_map(params![turn_id], read_activity)?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(activities)
			})
			.await
			.at("activities_for_turn", "activities")?)
	}

	pub async fn recover_unfinished(&self) -> Result<RecoveryReport, TranscriptError> {
		Ok(self.call_mut(sweep_unfinished).await.at("recover_unfinished", "messages")?)
	}
}

pub(in crate::db) fn conversation_of_turn(
	connection: &Connection,
	turn_id: &str,
) -> rusqlite::Result<Option<String>> {
	connection.query_row(CONVERSATION_OF_TURN, [turn_id], |row| row.get(0)).optional()
}

pub(in crate::db) fn sweep_unfinished(
	connection: &mut Connection,
) -> Result<RecoveryReport, DatabaseError> {
	let transaction = write_transaction(connection)?;
	let interrupted_messages = transaction.execute(INTERRUPT_OPEN_MESSAGES, [])?;
	let terminated_activities = transaction.execute(TERMINATE_OPEN_ACTIVITIES, [])?;
	let completed_turns = transaction.execute(COMPLETE_OPEN_TURNS, [now_ms()])?;
	transaction.execute(RELEASE_EVERY_RUN, [])?;
	transaction.commit()?;
	Ok(RecoveryReport { completed_turns, interrupted_messages, terminated_activities })
}

struct StoredTurnKey {
	seq: i64,
	conversation_id: String,
	started_at: i64,
}

impl StoredTurnKey {
	fn diverging_field(&self, turn: &NewTurn) -> Option<&'static str> {
		if self.conversation_id != turn.conversation_id {
			return Some("conversation_id");
		}
		if self.started_at != turn.started_at {
			return Some("started_at");
		}
		None
	}
}

struct AppendedMessage {
	id: String,
	conversation_id: String,
	turn_id: String,
	author_bot_id: Option<String>,
	replied_to_message_id: Option<String>,
	role: MessageRole,
	content: Option<String>,
	created_at: i64,
	author: AccountAuthor,
	written_from: Option<WrittenFrom>,
}

impl From<NewAssistantMessage> for AppendedMessage {
	fn from(message: NewAssistantMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			role: MessageRole::Assistant,
			content: None,
			created_at: message.created_at,
			author: AccountAuthor::default(),
			written_from: None,
		}
	}
}

impl From<NewUserMessage> for AppendedMessage {
	fn from(message: NewUserMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			role: MessageRole::User,
			content: Some(message.content),
			created_at: message.created_at,
			author: message.author,
			written_from: Some(message.written_from),
		}
	}
}

struct StoredMessageKey {
	seq: i64,
	conversation_id: String,
	turn_id: String,
	author_bot_id: Option<String>,
	replied_to_message_id: Option<String>,
	role: MessageRole,
	created_at: i64,
	content: Option<String>,
}

impl StoredMessageKey {
	fn diverging_field(&self, message: &AppendedMessage) -> Option<&'static str> {
		if self.conversation_id != message.conversation_id {
			return Some("conversation_id");
		}
		if self.turn_id != message.turn_id {
			return Some("turn_id");
		}
		if self.author_bot_id != message.author_bot_id {
			return Some("author_bot_id");
		}
		if self.replied_to_message_id != message.replied_to_message_id {
			return Some("replied_to_message_id");
		}
		if self.role != message.role {
			return Some("role");
		}
		if self.content != message.content {
			return Some("content");
		}
		if self.created_at != message.created_at {
			return Some("created_at");
		}
		None
	}
}

fn store_turn(connection: &mut Connection, turn: NewTurn) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(stored) = stored_turn_key(&transaction, &turn.id)? {
		if let Some(field) = stored.diverging_field(&turn) {
			return Err(TranscriptError::Conflict { id: turn.id, field });
		}
		return Ok(stored.seq);
	}
	refuse_unknown_conversation(&transaction, &turn.conversation_id)?;
	let seq = transaction.query_row(
		INSERT_TURN,
		params![turn.id, turn.conversation_id, turn.started_at],
		|row| row.get(0),
	)?;
	transaction.commit()?;
	Ok(seq)
}

fn keep_turn(connection: &mut Connection, turn: NewTurn) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	let seq = insert_turn_once(&transaction, &turn)?;
	transaction.commit()?;
	Ok(seq)
}

fn insert_turn_once(transaction: &Transaction<'_>, turn: &NewTurn) -> Result<i64, TranscriptError> {
	if let Some(stored) = stored_turn_key(transaction, &turn.id)? {
		if stored.conversation_id != turn.conversation_id {
			return Err(TranscriptError::Conflict {
				id: turn.id.clone(),
				field: "conversation_id",
			});
		}
		return Ok(stored.seq);
	}
	refuse_unknown_conversation(transaction, &turn.conversation_id)?;
	Ok(transaction.query_row(
		INSERT_TURN,
		params![turn.id, turn.conversation_id, turn.started_at],
		|row| row.get(0),
	)?)
}

fn started_run(
	connection: &mut Connection,
	turn: &NewTurn,
	bot_id: &str,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	insert_turn_once(&transaction, turn)?;
	transaction.execute(RELEASE_RUN, params![turn.id, bot_id, AWAITED])?;
	transaction.execute(HOLD_RUN, params![turn.id, bot_id, RUNNING])?;
	transaction.execute(REOPEN_TURN, [&turn.id])?;
	transaction.commit()?;
	Ok(())
}

fn ended_run(connection: &mut Connection, ended: &EndedRun) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	transaction.execute(RELEASE_RUN, params![ended.turn_id, ended.bot_id, RUNNING])?;
	for bot_id in &ended.handed_to {
		transaction.execute(HOLD_RUN, params![ended.turn_id, bot_id, AWAITED])?;
	}
	transaction.execute(COMPLETE_TURN_NO_BOT_RUNS_ON, params![ended.turn_id, ended.ended_at])?;
	transaction.commit()?;
	Ok(())
}

fn awaited_runs(
	connection: &mut Connection,
	turn_id: &str,
	bot_ids: &[String],
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	for bot_id in bot_ids {
		transaction.execute(HOLD_RUN, params![turn_id, bot_id, AWAITED])?;
	}
	transaction.commit()?;
	Ok(())
}

fn abandoned_run(
	connection: &mut Connection,
	turn_id: &str,
	bot_id: &str,
	abandoned_at: i64,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	transaction.execute(RELEASE_RUN, params![turn_id, bot_id, AWAITED])?;
	transaction.execute(COMPLETE_TURN_NO_BOT_RUNS_ON, params![turn_id, abandoned_at])?;
	transaction.commit()?;
	Ok(())
}

fn cancelled_run(
	connection: &mut Connection,
	turn_id: &str,
	bot_id: &str,
	cancelled_at: i64,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	transaction.execute(CANCEL_OPEN_MESSAGES_OF_RUN, params![turn_id, bot_id])?;
	transaction.execute(RELEASE_RUN, params![turn_id, bot_id, RUNNING])?;
	transaction.execute(COMPLETE_TURN_NO_BOT_RUNS_ON, params![turn_id, cancelled_at])?;
	transaction.commit()?;
	Ok(())
}

fn expired_awaited_run(
	connection: &mut Connection,
	turn_id: &str,
	bot_id: &str,
	expired_at: i64,
) -> Result<bool, TranscriptError> {
	let transaction = write_transaction(connection)?;
	let released = transaction.execute(RELEASE_RUN, params![turn_id, bot_id, AWAITED])? > 0;
	if released {
		transaction.execute(COMPLETE_TURN_NO_BOT_RUNS_ON, params![turn_id, expired_at])?;
	}
	transaction.commit()?;
	Ok(released)
}

fn open_turn_with(
	connection: &mut Connection,
	message: NewUserMessage,
	completed_at: Option<i64>,
) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	transaction.execute(
		COMPLETE_EARLIER_UNANSWERED_TURNS,
		params![message.conversation_id, message.turn_id, message.created_at],
	)?;
	let turn = NewTurn {
		id: message.turn_id.clone(),
		conversation_id: message.conversation_id.clone(),
		started_at: message.created_at,
	};
	insert_turn_once(&transaction, &turn)?;
	if let Some(completed_at) = completed_at {
		transaction.execute(COMPLETE_TURN, params![turn.id, completed_at])?;
	}
	let seq = insert_message_once(&transaction, message.into())?;
	transaction.commit()?;
	Ok(seq)
}

fn store_message(
	connection: &mut Connection,
	message: AppendedMessage,
) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	let seq = insert_message_once(&transaction, message)?;
	transaction.commit()?;
	Ok(seq)
}

fn insert_message_once(
	transaction: &Transaction<'_>,
	message: AppendedMessage,
) -> Result<i64, TranscriptError> {
	if let Some(stored) = stored_message_key(transaction, &message)? {
		if let Some(field) = stored.diverging_field(&message) {
			return Err(TranscriptError::Conflict { id: message.id, field });
		}
		return Ok(stored.seq);
	}
	refuse_unknown_parents(transaction, &message)?;
	let (content, state) = match message.content {
		Some(authored) => (authored, MessageState::Complete),
		None => (String::new(), MessageState::Pending),
	};
	Ok(transaction.query_row(
		INSERT_MESSAGE,
		params![
			message.id,
			message.conversation_id,
			message.turn_id,
			message.author_bot_id,
			message.replied_to_message_id,
			message.role,
			content,
			state,
			message.created_at,
			message.author.account_id,
			message.author.name,
			message.written_from,
		],
		|row| row.get(0),
	)?)
}

fn refuse_unknown_conversation(
	transaction: &Transaction<'_>,
	conversation_id: &str,
) -> Result<(), TranscriptError> {
	if !holds(transaction, CONVERSATION_EXISTS, params![conversation_id])? {
		return Err(TranscriptError::UnknownConversation { id: conversation_id.into() });
	}
	Ok(())
}

fn refuse_unknown_parents(
	transaction: &Transaction<'_>,
	message: &AppendedMessage,
) -> Result<(), TranscriptError> {
	refuse_unknown_conversation(transaction, &message.conversation_id)?;
	let turn = params![message.turn_id, message.conversation_id];
	if !holds(transaction, TURN_IN_CONVERSATION_EXISTS, turn)? {
		return Err(TranscriptError::UnknownTurn { id: message.turn_id.clone() });
	}
	let Some(bot_id) = &message.author_bot_id else {
		return Ok(());
	};
	if !holds(transaction, SEAT_EXISTS, params![message.conversation_id, bot_id])? {
		return Err(TranscriptError::UnknownParticipant {
			conversation_id: message.conversation_id.clone(),
			bot_id: bot_id.clone(),
		});
	}
	Ok(())
}

fn holds(
	transaction: &Transaction<'_>,
	exists: &str,
	params: impl rusqlite::Params,
) -> rusqlite::Result<bool> {
	transaction.query_row(exists, params, |row| row.get(0))
}

fn close_message(
	connection: &mut Connection,
	id: &str,
	state: TerminalState,
	settled_text: Option<&str>,
) -> Result<(), TranscriptError> {
	let target = MessageState::from(state);
	let transaction = write_transaction(connection)?;
	if let Some(current) = stored_state::<MessageState>(&transaction, MESSAGE_STATE, id)? {
		if current != target {
			if !matches!(current, MessageState::Pending | MessageState::Streaming) {
				return Err(TranscriptError::InvalidTransition {
					id: id.into(),
					from: current.as_sql(),
					to: target.as_sql(),
				});
			}
			transaction.execute(FINALIZE_MESSAGE, params![id, target, settled_text])?;
		}
	}
	transaction.commit()?;
	Ok(())
}

fn rewrite_content(
	connection: &mut Connection,
	id: &str,
	content: &str,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	if transaction.execute(REPLACE_CONTENT, params![id, content])? == 0 {
		return Err(TranscriptError::UnknownMessage { id: id.into() });
	}
	transaction.execute(REPLACE_INDEXED_CONTENT, params![id, content])?;
	transaction.commit()?;
	Ok(())
}

fn keep_pin(
	connection: &mut Connection,
	conversation_id: &str,
	id: &str,
	block_index: i64,
	pinned_at: i64,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	refuse_a_message_elsewhere(&transaction, conversation_id, id)?;
	transaction.execute(KEEP_MESSAGE_PIN, params![conversation_id, id, block_index, pinned_at])?;
	transaction.commit()?;
	Ok(())
}

fn clear_pin(
	connection: &mut Connection,
	conversation_id: &str,
	id: &str,
	block_index: i64,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	refuse_a_message_elsewhere(&transaction, conversation_id, id)?;
	transaction.execute(CLEAR_MESSAGE_PIN, params![conversation_id, id, block_index])?;
	transaction.commit()?;
	Ok(())
}

fn refuse_a_message_elsewhere(
	transaction: &Transaction<'_>,
	conversation_id: &str,
	id: &str,
) -> Result<(), TranscriptError> {
	let held: Option<u32> = transaction
		.query_row(MESSAGE_OF_CONVERSATION, params![conversation_id, id], |row| row.get(0))
		.optional()?;
	if held.is_none() {
		return Err(TranscriptError::UnknownMessage { id: id.into() });
	}
	Ok(())
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn stored_turn_key(
	transaction: &Transaction<'_>,
	id: &str,
) -> Result<Option<StoredTurnKey>, DatabaseError> {
	Ok(transaction
		.query_row(TURN_KEY, params![id], |row| {
			Ok(StoredTurnKey {
				seq: row.get(0)?,
				conversation_id: row.get(1)?,
				started_at: row.get(2)?,
			})
		})
		.optional()?)
}

fn stored_message_key(
	transaction: &Transaction<'_>,
	message: &AppendedMessage,
) -> Result<Option<StoredMessageKey>, DatabaseError> {
	Ok(transaction
		.query_row(MESSAGE_KEY, params![message.id], |row| {
			Ok(StoredMessageKey {
				seq: row.get(0)?,
				conversation_id: row.get(1)?,
				turn_id: row.get(2)?,
				author_bot_id: row.get(3)?,
				replied_to_message_id: row.get(4)?,
				role: row.get(5)?,
				created_at: row.get(6)?,
				content: message.content.is_some().then(|| row.get(7)).transpose()?,
			})
		})
		.optional()?)
}

fn stored_state<T: FromSql>(
	transaction: &Transaction<'_>,
	query: &str,
	id: &str,
) -> Result<Option<T>, DatabaseError> {
	Ok(transaction.query_row(query, params![id], |row| row.get(0)).optional()?)
}

fn read_around(
	connection: &Connection,
	query: &MessagesAroundQuery,
) -> Result<Option<MessagesAround>, DatabaseError> {
	let Some(centre) = connection
		.prepare_cached(MESSAGE_AT_SEQ)?
		.query_row(params![query.conversation_id, query.seq], read_message)
		.optional()?
	else {
		return Ok(None);
	};

	let conversation_id = &query.conversation_id;
	let budget = query.limit.saturating_sub(1);
	let mut older = read_older(connection, conversation_id, query.seq, budget / 2)?;
	let newer = read_newer(connection, conversation_id, query.seq, budget - older.len() as u32)?;
	let oldest_held = older.first().map_or(query.seq, |message| message.seq);
	let shortfall = budget - older.len() as u32 - newer.len() as u32;

	let mut messages = read_older(connection, conversation_id, oldest_held, shortfall)?;
	messages.append(&mut older);
	let first_seq = messages.first().map_or(query.seq, |message| message.seq);
	let last_seq = newer.last().map_or(query.seq, |message| message.seq);
	messages.push(centre);
	messages.extend(newer);

	let has_older = sits_beside(connection, MESSAGE_OLDER_THAN_SEQ, conversation_id, first_seq)?;
	let has_newer = sits_beside(connection, MESSAGE_NEWER_THAN_SEQ, conversation_id, last_seq)?;
	let span = SeqSpan {
		lowest: match has_older {
			true => first_seq,
			false => i64::MIN,
		},
		highest: match has_newer {
			true => last_seq,
			false => i64::MAX,
		},
	};
	Ok(Some(MessagesAround {
		messages,
		arrivals: arrivals::within(connection, conversation_id, span)?,
		has_older,
		has_newer,
	}))
}

fn read_older(
	connection: &Connection,
	conversation_id: &str,
	before_seq: i64,
	limit: u32,
) -> Result<Vec<StoredMessage>, DatabaseError> {
	if limit == 0 {
		return Ok(Vec::new());
	}
	let mut statement = connection.prepare_cached(MESSAGE_PAGE)?;
	let mut messages = statement
		.query_map(params![conversation_id, before_seq, limit], read_message)?
		.collect::<Result<Vec<_>, _>>()?;
	messages.reverse();
	Ok(messages)
}

fn read_newer(
	connection: &Connection,
	conversation_id: &str,
	after_seq: i64,
	limit: u32,
) -> Result<Vec<StoredMessage>, DatabaseError> {
	if limit == 0 {
		return Ok(Vec::new());
	}
	let mut statement = connection.prepare_cached(MESSAGES_AFTER_SEQ)?;
	let messages = statement
		.query_map(params![conversation_id, after_seq, limit], read_message)?
		.collect::<Result<Vec<_>, _>>()?;
	Ok(messages)
}

fn sits_beside(
	connection: &Connection,
	statement: &str,
	conversation_id: &str,
	seq: i64,
) -> Result<bool, DatabaseError> {
	Ok(connection
		.prepare_cached(statement)?
		.query_row(params![conversation_id, seq], |row| row.get(0))?)
}

fn read_message(row: &Row<'_>) -> rusqlite::Result<StoredMessage> {
	Ok(StoredMessage {
		id: row.get(0)?,
		turn_id: row.get(1)?,
		author_bot_id: row.get(2)?,
		replied_to_message_id: row.get(3)?,
		seq: row.get(4)?,
		role: row.get(5)?,
		content: row.get(6)?,
		state: row.get(7)?,
		created_at: row.get(8)?,
		runtime_session_id: row.get(9)?,
		author: AccountAuthor { account_id: row.get(10)?, name: row.get(11)? },
		written_from: row.get(12)?,
	})
}

fn read_pin(row: &Row<'_>) -> rusqlite::Result<StoredPin> {
	Ok(StoredPin {
		message: read_message(row)?,
		block_index: row.get(13)?,
		pinned_at: row.get(14)?,
	})
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::runtime_context::ParticipantKey;
	use crate::db::{open, Database};

	const FIXTURE: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1), ('c2', 'topic', 'Second', 1, 1);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c2', 'b1', 'assistant', 1, 0);
	";

	const LONG_CONVERSATION: usize = 205;
	const PAGE: u32 = 50;

	const ENDINGS: [TerminalState; 4] = [
		TerminalState::Complete,
		TerminalState::Cancelled,
		TerminalState::Failed,
		TerminalState::Interrupted,
	];
	pub(super) const TERMINATIONS: [TerminalStatus; 3] =
		[TerminalStatus::Succeeded, TerminalStatus::Failed, TerminalStatus::Terminated];

	pub(super) async fn seeded(dir: &Path) -> Database {
		let database = open(dir);
		database
			.call(|connection| Ok(connection.execute_batch(FIXTURE)?))
			.await
			.expect("the fixture is inserted");
		database
	}

	pub(super) async fn a_turn(database: &Database, id: &str, conversation: &str) -> i64 {
		database
			.messages()
			.start_turn(NewTurn {
				id: id.into(),
				conversation_id: conversation.into(),
				started_at: 1,
			})
			.await
			.expect("the turn is started")
	}

	async fn some_user_messages(database: &Database, count: usize) {
		for index in 0..count {
			database
				.messages()
				.append_user_message(a_user_message(&format!("m{index}"), "hello", 1))
				.await
				.expect("the message is appended");
		}
	}

	fn a_user_message(id: &str, content: &str, created_at: i64) -> NewUserMessage {
		NewUserMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: None,
			author: Default::default(),
			written_from: WrittenFrom::Here,
			replied_to_message_id: None,
			content: content.into(),
			created_at,
		}
	}

	async fn a_stored_reply(database: &Database, id: &str) {
		database
			.messages()
			.open_assistant_message(a_reply(id, None))
			.await
			.expect("the reply is opened");
	}

	async fn run_named_on(database: &Database, id: &str) -> Option<String> {
		database
			.messages()
			.message("c1".into(), id.into())
			.await
			.expect("the message")
			.expect("a stored message")
			.runtime_session_id
	}

	fn a_reply(id: &str, replied_to: Option<&str>) -> NewAssistantMessage {
		NewAssistantMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: Some("b1".into()),
			replied_to_message_id: replied_to.map(Into::into),
			created_at: 2,
		}
	}

	pub(super) fn an_activity(id: &str, status: InitialStatus) -> NewActivity {
		NewActivity {
			id: id.into(),
			turn_id: "t1".into(),
			kind: "tool".into(),
			status,
			payload: "{}".into(),
			created_at: 2,
		}
	}

	async fn page(database: &Database, before_seq: Option<i64>, limit: u32) -> MessagePage {
		database
			.messages()
			.page_messages(MessagePageQuery { conversation_id: "c1".into(), before_seq, limit })
			.await
			.expect("the page is read")
	}

	async fn around(
		database: &Database,
		conversation: &str,
		seq: i64,
		limit: u32,
	) -> Option<MessagesAround> {
		database
			.messages()
			.messages_around(MessagesAroundQuery {
				conversation_id: conversation.into(),
				seq,
				limit,
			})
			.await
			.expect("the window is read")
	}

	async fn whole_transcript(database: &Database, limit: u32) -> Vec<StoredMessage> {
		let mut collected: Vec<StoredMessage> = Vec::new();
		let mut before_seq = None;
		loop {
			let page = page(database, before_seq, limit).await;
			let oldest_held = oldest_seq(&page);
			let has_more = page.has_more;
			collected.splice(0..0, page.messages);
			match oldest_held {
				Some(seq) if has_more => before_seq = Some(seq),
				_ => return collected,
			}
		}
	}

	fn oldest_seq(page: &MessagePage) -> Option<i64> {
		page.messages.first().map(|message| message.seq)
	}

	fn seqs(messages: &[StoredMessage]) -> Vec<i64> {
		messages.iter().map(|message| message.seq).collect()
	}

	fn states(messages: &[StoredMessage]) -> Vec<MessageState> {
		messages.iter().map(|message| message.state).collect()
	}

	pub(super) async fn statuses(database: &Database) -> Vec<ActivityStatus> {
		database
			.messages()
			.activities_for_turn("t1".into())
			.await
			.expect("the activities")
			.iter()
			.map(|activity| activity.status)
			.collect()
	}

	#[derive(Debug, Clone, PartialEq, Eq)]
	struct StoredRow {
		id: String,
		conversation_id: String,
		turn_id: String,
		author_bot_id: Option<String>,
		replied_to_message_id: Option<String>,
		seq: i64,
		role: String,
		content: String,
		completion_state: String,
		created_at: i64,
	}

	async fn stored_row(database: &Database, id: &'static str) -> StoredRow {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT id, conversation_id, turn_id, author_bot_id, replied_to_message_id,
						seq, role, content, completion_state, created_at
					FROM messages WHERE id = ?1",
					params![id],
					|row| {
						Ok(StoredRow {
							id: row.get(0)?,
							conversation_id: row.get(1)?,
							turn_id: row.get(2)?,
							author_bot_id: row.get(3)?,
							replied_to_message_id: row.get(4)?,
							seq: row.get(5)?,
							role: row.get(6)?,
							content: row.get(7)?,
							completion_state: row.get(8)?,
							created_at: row.get(9)?,
						})
					},
				)?)
			})
			.await
			.expect("the message row is read")
	}

	async fn stored_turn(database: &Database, id: &'static str) -> (String, i64) {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT conversation_id, started_at FROM turns WHERE id = ?1",
					params![id],
					|row| Ok((row.get(0)?, row.get(1)?)),
				)?)
			})
			.await
			.expect("the turn is read")
	}

	fn assert_conflict(refused: &Result<i64, TranscriptError>, id: &str, field: &str) {
		assert!(
			matches!(
				refused,
				Err(TranscriptError::Conflict { id: stored, field: diverged })
					if stored == id && *diverged == field
			),
			"expected {id} to be refused as a conflict on {field}: {refused:?}"
		);
	}

	pub(super) fn assert_rejected(refused: &Result<(), TranscriptError>, from: &str, to: &str) {
		assert!(
			matches!(
				refused,
				Err(TranscriptError::InvalidTransition { from: held, to: asked, .. })
					if *held == from && *asked == to
			),
			"expected the move from {from} to {to} to be refused: {refused:?}"
		);
	}

	async fn pinned_ids(database: &Database, conversation_id: &str) -> Vec<(String, i64, i64)> {
		database
			.messages()
			.pinned_messages(conversation_id.into())
			.await
			.expect("the pins are read")
			.into_iter()
			.map(|pin| (pin.message.id, pin.block_index, pin.pinned_at))
			.collect()
	}

	fn assert_unknown(refused: &Result<(), TranscriptError>, id: &str) {
		assert!(
			matches!(refused, Err(TranscriptError::UnknownMessage { id: named }) if named == id),
			"expected {id} to be refused as a message the conversation does not hold: {refused:?}"
		);
	}

	#[tokio::test]
	async fn a_pin_stands_at_the_moment_its_bubble_was_first_pinned() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 3).await;

		for (block_index, pinned_at) in [(1, 10), (1, 20), (0, 30)] {
			database
				.messages()
				.pin_message("c1".into(), "m0".into(), block_index, pinned_at)
				.await
				.expect("the pin is stored");
		}

		assert_eq!(
			pinned_ids(&database, "c1").await,
			vec![("m0".to_owned(), 0, 30), ("m0".to_owned(), 1, 10)],
			"a bubble pinned twice moved its moment or crowded out the other bubble"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_pins_of_a_conversation_come_back_newest_first_and_only_its_own() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		some_user_messages(&database, 3).await;
		database
			.messages()
			.append_user_message(NewUserMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("m9", "hello", 1)
			})
			.await
			.expect("the other conversation is written");

		for (id, pinned_at) in [("m0", 10), ("m2", 30)] {
			database
				.messages()
				.pin_message("c1".into(), id.into(), 0, pinned_at)
				.await
				.expect("the pin is stored");
		}
		database
			.messages()
			.pin_message("c2".into(), "m9".into(), 0, 40)
			.await
			.expect("the other pin is stored");

		assert_eq!(
			pinned_ids(&database, "c1").await,
			vec![("m2".to_owned(), 0, 30), ("m0".to_owned(), 0, 10)],
			"the pins came back out of order or reached across conversations"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_unpin_clears_one_bubble_and_says_nothing_of_a_bubble_that_carries_no_pin() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 2).await;
		for block_index in [0, 1] {
			database
				.messages()
				.pin_message("c1".into(), "m0".into(), block_index, 10)
				.await
				.expect("the pin is stored");
		}

		database
			.messages()
			.unpin_message("c1".into(), "m0".into(), 0)
			.await
			.expect("the pin is cleared");
		database
			.messages()
			.unpin_message("c1".into(), "m1".into(), 0)
			.await
			.expect("a bubble with no pin was refused");

		assert_eq!(
			pinned_ids(&database, "c1").await,
			vec![("m0".to_owned(), 1, 10)],
			"clearing one bubble took the pin of another with it"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_pins_of_a_message_go_when_the_message_does() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 2).await;
		for block_index in [0, 1] {
			database
				.messages()
				.pin_message("c1".into(), "m0".into(), block_index, 10)
				.await
				.expect("the pin is stored");
		}

		database
			.call(|connection| {
				Ok(connection.execute("DELETE FROM conversations WHERE id = 'c1'", [])?)
			})
			.await
			.expect("the conversation is dropped");

		assert!(
			pinned_ids(&database, "c1").await.is_empty(),
			"the pins outlived the messages they were set on"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pin_naming_a_message_the_conversation_does_not_hold_changes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		some_user_messages(&database, 2).await;
		database
			.messages()
			.pin_message("c1".into(), "m0".into(), 0, 10)
			.await
			.expect("the pin is stored");

		let absent = database.messages().pin_message("c1".into(), "m7".into(), 0, 20).await;
		let elsewhere = database.messages().pin_message("c2".into(), "m0".into(), 0, 20).await;
		let unpinned_elsewhere =
			database.messages().unpin_message("c2".into(), "m0".into(), 0).await;

		assert_unknown(&absent, "m7");
		assert_unknown(&elsewhere, "m0");
		assert_unknown(&unpinned_elsewhere, "m0");
		assert_eq!(
			pinned_ids(&database, "c1").await,
			vec![("m0".to_owned(), 0, 10)],
			"a refused pin rewrote the pins the conversation holds"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_takes_the_run_its_chat_is_speaking_through_and_nothing_otherwise() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let participant = ParticipantKey { conversation_id: "c1".into(), bot_id: "b1".into() };

		a_stored_reply(&database, "before").await;
		let run =
			database.runtime_context().open(participant, 1, None).await.expect("the run opens");
		a_stored_reply(&database, "during").await;
		database
			.messages()
			.append_user_message(a_user_message("spoken", "hello", 1))
			.await
			.expect("the message is appended");
		database.runtime_context().close(run.id.clone(), 2).await.expect("the run ends");
		a_stored_reply(&database, "after").await;

		assert_eq!(
			run_named_on(&database, "before").await,
			None,
			"a reply older than the run took it"
		);
		assert_eq!(
			run_named_on(&database, "during").await,
			Some(run.id.clone()),
			"a reply forgot its run"
		);
		assert_eq!(
			run_named_on(&database, "spoken").await,
			Some(run.id.clone()),
			"a message the reader spoke into a live run forgot it"
		);
		assert_eq!(
			run_named_on(&database, "after").await,
			None,
			"a reply took a run that had ended"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_long_conversation_pages_through_every_message_exactly_once_in_order() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		for index in 0..LONG_CONVERSATION {
			let seq = database
				.messages()
				.append_user_message(a_user_message(
					&format!("m{index}"),
					&format!("line {index}"),
					1,
				))
				.await
				.expect("the message is appended");
			assert_eq!(seq, index as i64 + 1, "the database allocated a place out of order");
		}

		let newest = page(&database, None, PAGE).await;
		let transcript = whole_transcript(&database, PAGE).await;

		assert!(
			newest.messages.windows(2).all(|pair| pair[0].seq < pair[1].seq),
			"a page came back out of display order"
		);
		assert_eq!(transcript.len(), LONG_CONVERSATION, "paging lost or duplicated a message");
		assert_eq!(
			seqs(&transcript),
			(1..=LONG_CONVERSATION as i64).collect::<Vec<_>>(),
			"the pages did not join up into one sequence"
		);
		let ids: Vec<String> = transcript.into_iter().map(|message| message.id).collect();
		assert_eq!(
			ids,
			(0..LONG_CONVERSATION).map(|index| format!("m{index}")).collect::<Vec<_>>(),
			"the transcript came back in another order than it was written"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn messages_stamped_at_the_same_moment_still_come_back_in_the_order_they_were_written() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		for index in 0..5 {
			database
				.messages()
				.append_user_message(a_user_message(
					&format!("m{index}"),
					&format!("line {index}"),
					7,
				))
				.await
				.expect("the message is appended");
		}

		let transcript = whole_transcript(&database, 2).await;

		assert_eq!(seqs(&transcript), vec![1, 2, 3, 4, 5]);
		assert!(
			transcript.iter().all(|message| message.created_at == 7),
			"the fixture did not write one moment"
		);
		assert_eq!(
			transcript.iter().map(|message| message.content.as_str()).collect::<Vec<_>>(),
			vec!["line 0", "line 1", "line 2", "line 3", "line 4"]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_reply_names_a_message_of_its_own_conversation_and_nothing_else() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_user_message(NewUserMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("elsewhere", "hello", 1)
			})
			.await
			.expect("the other conversation's message is appended");

		database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("a reply inside its own conversation was refused");
		let across =
			database.messages().open_assistant_message(a_reply("m3", Some("elsewhere"))).await;

		assert!(across.is_err(), "a message quoted another conversation's message");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "the refused reply left a row behind");
		assert_eq!(transcript[1].replied_to_message_id.as_deref(), Some("m1"));
		assert_eq!(transcript[1].author_bot_id.as_deref(), Some("b1"));
		assert_eq!(transcript[0].replied_to_message_id, None);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_cursor_leaves_no_gap_and_no_duplicate_at_its_edges() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 6).await;

		let newest = page(&database, None, 3).await;
		let older = page(&database, oldest_seq(&newest), 3).await;
		let past_the_start = page(&database, Some(1), 3).await;
		let short = page(&database, Some(3), 4).await;

		assert_eq!(seqs(&newest.messages), vec![4, 5, 6]);
		assert!(newest.has_more, "a full page said there was nothing older");
		assert_eq!(
			seqs(&older.messages),
			vec![1, 2, 3],
			"the second page skipped or repeated a seq"
		);
		assert!(!older.has_more, "the last page promised more because it happened to fill");
		assert!(
			past_the_start.messages.is_empty() && !past_the_start.has_more,
			"a cursor past the oldest message came back with rows or promised more"
		);
		assert_eq!(seqs(&short.messages), vec![1, 2], "a partial page did not stop at the start");
		assert!(!short.has_more, "a partial page promised more");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_conversation_of_exactly_one_page_comes_back_whole_and_offers_no_cursor() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 4).await;

		let only = page(&database, None, 4).await;

		assert_eq!(
			seqs(&only.messages),
			vec![1, 2, 3, 4],
			"a page the size of the conversation came back short or out of display order"
		);
		assert!(
			!only.has_more,
			"a page that filled exactly sent the reader after messages that are not there"
		);
		assert_eq!(
			seqs(&whole_transcript(&database, 4).await),
			vec![1, 2, 3, 4],
			"the walk back over a page that filled exactly lost or repeated a message"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn one_message_more_than_a_page_offers_a_cursor_onto_the_rest() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		some_user_messages(&database, 5).await;

		let newest = page(&database, None, 4).await;
		let older = page(&database, oldest_seq(&newest), 4).await;

		assert_eq!(
			seqs(&newest.messages),
			vec![2, 3, 4, 5],
			"the first page was not the newest four messages"
		);
		assert!(newest.has_more, "a full page with a message behind it promised nothing older");
		assert_eq!(
			seqs(&older.messages),
			vec![1],
			"the page behind the cursor did not hold the one message left"
		);
		assert!(
			!older.has_more,
			"the page holding the oldest message promised something behind it"
		);
		assert_eq!(
			[seqs(&older.messages), seqs(&newest.messages)].concat(),
			vec![1, 2, 3, 4, 5],
			"the two pages did not join up into the whole transcript in order"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_window_centres_on_its_seq_and_leans_on_the_side_that_still_has_messages() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		some_user_messages(&database, LONG_CONVERSATION).await;
		for index in 0..3 {
			database
				.messages()
				.append_user_message(NewUserMessage {
					conversation_id: "c2".into(),
					turn_id: "t2".into(),
					..a_user_message(&format!("short{index}"), "hello", 1)
				})
				.await
				.expect("the short conversation's message is appended");
		}
		let last = LONG_CONVERSATION as i64;

		let middle = around(&database, "c1", 100, 11).await.expect("the centre message is there");
		let start = around(&database, "c1", 1, 11).await.expect("the first message is there");
		let end = around(&database, "c1", last, 11).await.expect("the last message is there");
		let alone = around(&database, "c1", 100, 1).await.expect("the centre message is there");
		let none = around(&database, "c1", last + 1, 11).await;
		let whole = around(&database, "c2", 2, 11).await.expect("the centre message is there");

		assert_eq!(
			seqs(&middle.messages),
			(95..=105).collect::<Vec<_>>(),
			"a centred window did not hold five messages on each side of its seq"
		);
		assert!(
			middle.has_older && middle.has_newer,
			"a window inside the transcript said it was at an edge"
		);
		assert_eq!(
			seqs(&start.messages),
			(1..=11).collect::<Vec<_>>(),
			"a window on the first seq did not take its whole share from the newer side"
		);
		assert!(!start.has_older, "a window holding the first message promised something older");
		assert!(start.has_newer, "a window with messages behind it promised nothing newer");
		assert_eq!(
			seqs(&end.messages),
			(last - 10..=last).collect::<Vec<_>>(),
			"a window on the last seq did not take its whole share from the older side"
		);
		assert!(end.has_older, "a window with messages before it promised nothing older");
		assert!(!end.has_newer, "a window holding the last message promised something newer");
		assert_eq!(
			seqs(&alone.messages),
			vec![100],
			"a window of one held anything other than the message it was centred on"
		);
		assert!(alone.has_older && alone.has_newer, "a window of one lost sight of both sides");
		assert!(none.is_none(), "a seq no row carries came back as a window");
		assert_eq!(
			seqs(&whole.messages),
			vec![1, 2, 3],
			"a conversation shorter than the limit did not come back whole"
		);
		assert!(
			!whole.has_older && !whole.has_newer,
			"a window holding the whole conversation promised messages on one of its sides"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn ensuring_a_turn_keeps_the_row_already_there_and_refuses_another_conversation() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let started = a_turn(&database, "t1", "c1").await;
		let later = NewTurn { id: "t1".into(), conversation_id: "c1".into(), started_at: 99 };

		let kept = database.messages().ensure_turn(later).await.expect("the turn is kept");
		let elsewhere = database
			.messages()
			.ensure_turn(NewTurn { id: "t1".into(), conversation_id: "c2".into(), started_at: 1 })
			.await;

		assert_eq!(kept, started);
		assert_eq!(stored_turn(&database, "t1").await, ("c1".to_owned(), 1));
		assert_conflict(&elsewhere, "t1", "conversation_id");
	}

	#[tokio::test]
	async fn ensuring_a_turn_no_row_holds_yet_starts_it() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let fresh = NewTurn { id: "t9".into(), conversation_id: "c1".into(), started_at: 7 };

		database.messages().ensure_turn(fresh).await.expect("the turn is started");

		assert_eq!(stored_turn(&database, "t9").await, ("c1".to_owned(), 7));
	}

	#[tokio::test]
	async fn a_cancelled_run_cancels_only_the_open_replies_of_its_bot_in_its_turn() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		database
			.call(|connection| {
				Ok(connection.execute_batch(
					"INSERT INTO bots (id, name, model, created_at)
						VALUES ('b2', 'Second', 'sonnet', 1);
					INSERT INTO conversation_participants
						(conversation_id, bot_id, role, joined_at, join_seq)
						VALUES ('c1', 'b2', 'assistant', 1, 1);",
				)?)
			})
			.await
			.expect("the second bot is seated");
		let turn = NewTurn { id: "t1".into(), conversation_id: "c1".into(), started_at: 1 };
		a_turn(&database, "t1", "c1").await;
		let messages = database.messages();
		messages.start_run(turn, "b1".into()).await.expect("the run starts");
		let others =
			NewAssistantMessage { author_bot_id: Some("b2".into()), ..a_reply("m3", None) };
		for reply in [a_reply("m1", None), a_reply("m2", None), others] {
			messages.open_assistant_message(reply).await.expect("the reply is opened");
		}
		for id in ["m1", "m3"] {
			messages.append_text(id.into(), "half".into()).await.expect("a delta");
		}
		messages
			.finalize_message("m2".into(), TerminalState::Complete, None)
			.await
			.expect("the reply settles");

		messages.cancel_run("t1".into(), "b1".into(), 3).await.expect("the run is cancelled");

		let stored = whole_transcript(&database, PAGE).await;
		assert_eq!(
			states(&stored),
			vec![MessageState::Cancelled, MessageState::Complete, MessageState::Streaming]
		);
	}

	#[tokio::test]
	async fn a_turn_the_host_died_under_is_closed_out_with_its_partial_text() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "half a ".into()).await.expect("a delta");
		database.messages().append_text("m2".into(), "thought".into()).await.expect("a delta");
		database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Running))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.append_activity(an_activity("a2", InitialStatus::Running))
			.await
			.expect("the finished activity is appended");
		database
			.messages()
			.finish_activity("a2".into(), TerminalStatus::Succeeded)
			.await
			.expect("the activity ends");

		let report = database.messages().recover_unfinished().await.expect("the sweep runs");
		let again = database.messages().recover_unfinished().await.expect("the sweep runs again");

		assert_eq!(
			report,
			RecoveryReport {
				completed_turns: 1,
				interrupted_messages: 1,
				terminated_activities: 1
			},
			"the sweep closed out something other than what was left open"
		);
		assert_eq!(
			again,
			RecoveryReport {
				completed_turns: 0,
				interrupted_messages: 0,
				terminated_activities: 0
			},
			"a second sweep rewrote what the first one had already closed out"
		);
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(transcript[1].state, MessageState::Interrupted);
		assert_eq!(transcript[1].content, "half a thought", "the partial text was not kept");
		assert_eq!(transcript[0].state, MessageState::Complete, "a finished message was swept");
		assert_eq!(
			statuses(&database).await,
			vec![ActivityStatus::Terminated, ActivityStatus::Succeeded]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn opening_the_database_closes_out_what_a_dead_host_left_open() {
		let dir = temp_dir();
		{
			let dying = seeded(&dir).await;
			a_turn(&dying, "t1", "c1").await;
			dying
				.messages()
				.append_user_message(a_user_message("m1", "hello", 1))
				.await
				.expect("the message is appended");
			dying
				.messages()
				.open_assistant_message(a_reply("m2", Some("m1")))
				.await
				.expect("the reply nothing ever streamed into is opened");
			dying
				.messages()
				.open_assistant_message(a_reply("m3", Some("m1")))
				.await
				.expect("the streaming reply is opened");
			dying.messages().append_text("m3".into(), "half a ".into()).await.expect("a delta");
			dying.messages().append_text("m3".into(), "thought".into()).await.expect("a delta");
			dying
				.messages()
				.append_activity(an_activity("a1", InitialStatus::Pending))
				.await
				.expect("the waiting step is appended");
			dying
				.messages()
				.append_activity(an_activity("a2", InitialStatus::Running))
				.await
				.expect("the running step is appended");
			dying
				.messages()
				.append_activity(an_activity("a3", InitialStatus::Running))
				.await
				.expect("the finished step is appended");
			dying
				.messages()
				.finish_activity("a3".into(), TerminalStatus::Succeeded)
				.await
				.expect("the step ends");
		}

		let relaunched = open(&dir);

		let restored = whole_transcript(&relaunched, PAGE).await;
		assert_eq!(
			states(&restored),
			vec![MessageState::Complete, MessageState::Interrupted, MessageState::Interrupted],
			"a launch handed out a reply still recorded as being written"
		);
		assert_eq!(restored[1].content, "", "a reply that never streamed a word gained text");
		assert_eq!(restored[2].content, "half a thought", "the partial text was not kept");
		let restored_activities = statuses(&relaunched).await;
		assert_eq!(
			restored_activities,
			vec![ActivityStatus::Terminated, ActivityStatus::Terminated, ActivityStatus::Succeeded],
			"a step nobody is running any more came back open, or a finished one was swept"
		);
		drop(relaunched);

		let again = open(&dir);

		assert_eq!(
			whole_transcript(&again, PAGE).await,
			restored,
			"a second launch rewrote a transcript that had nothing left open"
		);
		assert_eq!(
			statuses(&again).await,
			restored_activities,
			"a second launch swept a step again"
		);

		drop(again);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_settled_message_holds_the_text_it_was_finalized_with() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m1".into(), "over to @Nyx".into()).await.expect("a delta");

		database
			.messages()
			.finalize_message("m1".into(), TerminalState::Complete, Some("over to <@nyx>".into()))
			.await
			.expect("the message is finalized");
		database
			.messages()
			.finalize_message("m1".into(), TerminalState::Complete, Some("too late".into()))
			.await
			.expect("a replayed ending was refused");

		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(
			transcript.first().map(|message| message.content.as_str()),
			Some("over to <@nyx>"),
			"the settled text did not land on the message"
		);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_transcript_reads_back_identically_after_the_file_is_closed_and_reopened() {
		let dir = temp_dir();
		let (written, activities) = {
			let database = seeded(&dir).await;
			a_turn(&database, "t1", "c1").await;
			database
				.messages()
				.append_user_message(a_user_message("m1", "hello", 1))
				.await
				.expect("the message is appended");
			database
				.messages()
				.open_assistant_message(a_reply("m2", Some("m1")))
				.await
				.expect("the reply is appended");
			database.messages().append_text("m2".into(), "hi there".into()).await.expect("a delta");
			database
				.messages()
				.finalize_message("m2".into(), TerminalState::Complete, None)
				.await
				.expect("the message is finalized");
			database
				.messages()
				.append_activity(an_activity("a1", InitialStatus::Running))
				.await
				.expect("the activity is appended");
			database
				.messages()
				.finish_activity("a1".into(), TerminalStatus::Succeeded)
				.await
				.expect("the activity ends");
			database.messages().complete_turn("t1".into(), 9).await.expect("the turn ends");
			let written = whole_transcript(&database, PAGE).await;
			let activities =
				database.messages().activities_for_turn("t1".into()).await.expect("the activities");
			(written, activities)
		};

		let reopened = open(&dir);

		assert_eq!(
			whole_transcript(&reopened, PAGE).await,
			written,
			"the transcript came back changed"
		);
		assert_eq!(
			reopened.messages().activities_for_turn("t1".into()).await.expect("the activities"),
			activities
		);
		assert_eq!(written[1].content, "hi there");
		assert_eq!(written[1].state, MessageState::Complete);

		drop(reopened);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn replaying_a_write_changes_nothing_and_is_not_an_error() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let turn = a_turn(&database, "t1", "c1").await;
		let first = database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.open_assistant_message(a_reply("m2", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "hi".into()).await.expect("a delta");
		database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Running))
			.await
			.expect("the activity is appended");

		let replayed_turn = a_turn(&database, "t1", "c1").await;
		let replayed = database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("a replayed append was refused");
		let replayed_activity = database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Running))
			.await
			.expect("a replayed activity was refused");
		for ending in [TerminalState::Complete, TerminalState::Complete] {
			database
				.messages()
				.finalize_message("m2".into(), ending, None)
				.await
				.expect("a repeated ending was refused");
		}
		database
			.messages()
			.append_text("m2".into(), " and more".into())
			.await
			.expect("a late delta was refused");
		database
			.messages()
			.finish_activity("a1".into(), TerminalStatus::Succeeded)
			.await
			.expect("the activity ends");
		database
			.messages()
			.finish_activity("a1".into(), TerminalStatus::Succeeded)
			.await
			.expect("a repeated ending was refused");

		assert_eq!(replayed_turn, turn, "a replayed turn took a second place");
		assert_eq!(replayed, first, "a replayed message took a second place");
		assert_eq!(replayed_activity, 1, "a replayed activity took a second place");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "a replay wrote a second row");
		assert_eq!(transcript[0].content, "hello", "a replay rewrote a stored message");
		assert_eq!(transcript[1].state, MessageState::Complete);
		assert_eq!(transcript[1].content, "hi", "a delta after the ending was written anyway");
		assert_eq!(statuses(&database).await, vec![ActivityStatus::Succeeded]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_keeps_the_first_ending_it_reached_and_refuses_every_other_one() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let mut ended: Vec<(String, TerminalState)> = Vec::new();
		for (index, ending) in ENDINGS.into_iter().enumerate() {
			for id in [format!("p{index}"), format!("s{index}")] {
				database
					.messages()
					.open_assistant_message(a_reply(&id, None))
					.await
					.expect("the reply is appended");
				if id.starts_with('s') {
					database
						.messages()
						.append_text(id.clone(), "half a thought".into())
						.await
						.expect("a delta");
				}
				database
					.messages()
					.finalize_message(id.clone(), ending, None)
					.await
					.expect("an open message refused an ending");
				ended.push((id, ending));
			}
		}

		let mut refusals = Vec::new();
		for (id, ending) in &ended {
			database
				.messages()
				.finalize_message(id.clone(), *ending, None)
				.await
				.expect("the same ending reported twice was refused");
			for other in ENDINGS.into_iter().filter(|other| other != ending) {
				let refused = database.messages().finalize_message(id.clone(), other, None).await;
				assert_rejected(
					&refused,
					MessageState::from(*ending).as_sql(),
					MessageState::from(other).as_sql(),
				);
				refusals.push(refused);
			}
		}

		assert_eq!(refusals.len(), ended.len() * 3, "the matrix did not cover every ending");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(
			states(&transcript),
			ended.iter().map(|(_, ending)| MessageState::from(*ending)).collect::<Vec<_>>(),
			"a message did not keep the ending it reached first"
		);
		assert!(
			transcript
				.iter()
				.filter(|message| message.id.starts_with('s'))
				.all(|message| message.content == "half a thought"),
			"a streamed message lost its text when it ended"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_id_appended_again_describing_something_else_is_refused_and_writes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		a_turn(&database, "t2", "c2").await;
		a_turn(&database, "t3", "c1").await;
		database
			.messages()
			.append_user_message(a_user_message("m1", "hello", 1))
			.await
			.expect("the message is appended");
		database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Pending))
			.await
			.expect("the activity is appended");
		let before = stored_row(&database, "m1").await;

		let turn_elsewhere = database
			.messages()
			.start_turn(NewTurn { id: "t1".into(), conversation_id: "c2".into(), started_at: 5 })
			.await;
		assert_conflict(&turn_elsewhere, "t1", "conversation_id");
		let another_start = database
			.messages()
			.start_turn(NewTurn { id: "t1".into(), conversation_id: "c1".into(), started_at: 5 })
			.await;
		assert_conflict(&another_start, "t1", "started_at");
		let another_conversation = database
			.messages()
			.append_user_message(NewUserMessage {
				conversation_id: "c2".into(),
				turn_id: "t2".into(),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_conversation, "m1", "conversation_id");
		let another_turn = database
			.messages()
			.append_user_message(NewUserMessage {
				turn_id: "t3".into(),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_turn, "m1", "turn_id");
		let another_author = database
			.messages()
			.append_user_message(NewUserMessage {
				author_bot_id: Some("b1".into()),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_author, "m1", "author_bot_id");
		let another_quote = database
			.messages()
			.append_user_message(NewUserMessage {
				replied_to_message_id: Some("m1".into()),
				..a_user_message("m1", "hello", 1)
			})
			.await;
		assert_conflict(&another_quote, "m1", "replied_to_message_id");
		let another_role = database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				author_bot_id: None,
				created_at: 1,
				..a_reply("m1", None)
			})
			.await;
		assert_conflict(&another_role, "m1", "role");
		let another_content = database
			.messages()
			.append_user_message(a_user_message("m1", "something else", 1))
			.await;
		assert_conflict(&another_content, "m1", "content");
		let another_moment =
			database.messages().append_user_message(a_user_message("m1", "hello", 99)).await;
		assert_conflict(&another_moment, "m1", "created_at");
		let activity_of_another_turn = database
			.messages()
			.append_activity(NewActivity {
				turn_id: "t3".into(),
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&activity_of_another_turn, "a1", "turn_id");
		let another_kind = database
			.messages()
			.append_activity(NewActivity {
				kind: "thought".into(),
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&another_kind, "a1", "kind");
		let a_status_ahead =
			database.messages().append_activity(an_activity("a1", InitialStatus::Running)).await;
		assert_conflict(&a_status_ahead, "a1", "status");
		let another_payload = database
			.messages()
			.append_activity(NewActivity {
				payload: "{\"tool\":\"read\"}".into(),
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&another_payload, "a1", "payload");
		let another_activity_moment = database
			.messages()
			.append_activity(NewActivity {
				created_at: 99,
				..an_activity("a1", InitialStatus::Pending)
			})
			.await;
		assert_conflict(&another_activity_moment, "a1", "created_at");

		assert_eq!(
			stored_turn(&database, "t1").await,
			("c1".into(), 1),
			"a refused turn moved or restamped the row"
		);
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1], "a refused append left a row behind");
		assert_eq!(stored_row(&database, "m1").await, before, "a refused append rewrote the row");
		let activities =
			database.messages().activities_for_turn("t1".into()).await.expect("the activities");
		assert_eq!(activities.len(), 1, "a refused append left an activity behind");
		assert_eq!(activities[0].kind, "tool");
		assert_eq!(activities[0].payload, "{}");
		assert_eq!(
			activities[0].status,
			ActivityStatus::Pending,
			"a refused append moved the step"
		);
		assert_eq!(activities[0].created_at, 2, "a refused append restamped the step");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn replaying_an_append_after_the_row_moved_on_answers_the_place_it_already_holds() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let streamed = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m1".into(), "half a ".into()).await.expect("a delta");
		database.messages().append_text("m1".into(), "thought".into()).await.expect("a delta");
		let ended = database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m2".into(), "hi there".into()).await.expect("a delta");
		database
			.messages()
			.finalize_message("m2".into(), TerminalState::Complete, None)
			.await
			.expect("the message is finalized");
		let walked = database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Pending))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.start_activity("a1".into())
			.await
			.expect("a step refused to start running");
		database
			.messages()
			.finish_activity("a1".into(), TerminalStatus::Succeeded)
			.await
			.expect("a step refused to end");
		let mid_stream_row = stored_row(&database, "m1").await;
		let ended_row = stored_row(&database, "m2").await;

		let mid_stream = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("a replay of a message being streamed was refused");
		let after_the_ending = database
			.messages()
			.open_assistant_message(a_reply("m2", Some("m1")))
			.await
			.expect("a replay of a message that had ended was refused");
		let after_the_walk = database
			.messages()
			.append_activity(an_activity("a1", InitialStatus::Pending))
			.await
			.expect("a replay of a step that had ended was refused");

		assert_eq!(mid_stream, streamed, "a replay mid-stream took a second place");
		assert_eq!(after_the_ending, ended, "a replay after the ending took a second place");
		assert_eq!(after_the_walk, walked, "a replay after the walk took a second place");
		let transcript = whole_transcript(&database, PAGE).await;
		assert_eq!(seqs(&transcript), vec![1, 2], "a replay wrote a second row");
		assert_eq!(
			stored_row(&database, "m1").await,
			mid_stream_row,
			"a replay mid-stream rewrote the row"
		);
		assert_eq!(
			stored_row(&database, "m2").await,
			ended_row,
			"a replay after the ending rewrote the row"
		);
		assert_eq!(transcript[0].content, "half a thought", "a replay reset the streamed text");
		assert_eq!(transcript[0].state, MessageState::Streaming);
		assert_eq!(transcript[1].content, "hi there");
		assert_eq!(transcript[1].state, MessageState::Complete, "a replay reopened the ending");
		assert_eq!(statuses(&database).await, vec![ActivityStatus::Succeeded]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_is_replayed_on_what_created_it_and_never_on_the_text_it_grew() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let streamed = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("the reply is appended");
		database.messages().append_text("m1".into(), "some".into()).await.expect("a delta");
		database.messages().append_text("m1".into(), "thing".into()).await.expect("a delta");
		let authored = database
			.messages()
			.append_user_message(a_user_message("m2", "something", 1))
			.await
			.expect("the message is appended");
		let streamed_row = stored_row(&database, "m1").await;
		let authored_row = stored_row(&database, "m2").await;

		let replayed_reply = database
			.messages()
			.open_assistant_message(a_reply("m1", None))
			.await
			.expect("a replay of a streamed reply was refused");
		let replayed_message = database
			.messages()
			.append_user_message(a_user_message("m2", "something", 1))
			.await
			.expect("a replay of an authored message was refused");
		let a_prefix =
			database.messages().append_user_message(a_user_message("m2", "somethin", 1)).await;
		database.messages().append_text("m2".into(), " else".into()).await.expect("a late delta");

		assert_eq!(replayed_reply, streamed, "a replay of a streamed reply took a second place");
		assert_eq!(
			replayed_message, authored,
			"a replay of an authored message took a second place"
		);
		assert_conflict(&a_prefix, "m2", "content");
		assert_eq!(streamed_row.content, "something", "the fixture did not stream the whole word");
		assert_eq!(authored_row.completion_state, "complete", "an authored message was left open");
		assert_eq!(
			stored_row(&database, "m1").await,
			streamed_row,
			"a replay of a streamed reply rewrote the row"
		);
		assert_eq!(
			stored_row(&database, "m2").await,
			authored_row,
			"a late delta grew a message that had ended"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn rows_in(database: &Database, table: &'static str) -> i64 {
		database
			.call(move |connection| {
				Ok(connection
					.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))?)
			})
			.await
			.expect("the rows are counted")
	}

	fn a_turn_in(conversation: &str) -> NewTurn {
		NewTurn { id: "t9".into(), conversation_id: conversation.into(), started_at: 1 }
	}

	#[tokio::test]
	async fn a_turn_for_a_missing_conversation_names_it_and_writes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let turns_before = rows_in(&database, "turns").await;

		let started = database.messages().start_turn(a_turn_in("gone")).await;
		let ensured = database.messages().ensure_turn(a_turn_in("gone")).await;
		let run = database.messages().start_run(a_turn_in("gone"), "b1".into()).await;

		for refused in [started.map(|_| ()), ensured.map(|_| ()), run] {
			assert!(
				matches!(&refused, Err(TranscriptError::UnknownConversation { id }) if id == "gone"),
				"a turn for a missing conversation answered {refused:?}"
			);
		}
		assert_eq!(rows_in(&database, "turns").await, turns_before, "a refused turn left a row");
		assert_eq!(rows_in(&database, "turn_runs").await, 0, "a refused run left a row");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_for_a_missing_conversation_names_it_and_writes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let reply = NewAssistantMessage { conversation_id: "gone".into(), ..a_reply("r1", None) };
		let user_message =
			NewUserMessage { conversation_id: "gone".into(), ..a_user_message("m1", "hi", 1) };

		let opened = database.messages().open_assistant_message(reply).await;
		let appended = database.messages().append_user_message(user_message).await;

		for refused in [opened, appended] {
			assert!(
				matches!(&refused, Err(TranscriptError::UnknownConversation { id }) if id == "gone"),
				"a message for a missing conversation answered {refused:?}"
			);
		}
		assert_eq!(rows_in(&database, "messages").await, 0, "a refused message left a row");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_for_a_turn_missing_from_its_conversation_names_the_turn_and_writes_nothing()
	{
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c2").await;

		let refused = database.messages().open_assistant_message(a_reply("r1", None)).await;

		assert!(
			matches!(&refused, Err(TranscriptError::UnknownTurn { id }) if id == "t1"),
			"a message for a turn of another conversation answered {refused:?}"
		);
		assert_eq!(rows_in(&database, "messages").await, 0, "a refused message left a row");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_by_a_bot_without_a_seat_names_the_seat_and_writes_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let reply =
			NewAssistantMessage { author_bot_id: Some("unseated".into()), ..a_reply("r1", None) };

		let refused = database.messages().open_assistant_message(reply).await;

		assert!(
			matches!(
				&refused,
				Err(TranscriptError::UnknownParticipant { conversation_id, bot_id })
					if conversation_id == "c1" && bot_id == "unseated"
			),
			"a message by a bot without a seat answered {refused:?}"
		);
		assert_eq!(rows_in(&database, "messages").await, 0, "a refused message left a row");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_user_message_opening_a_turn_in_a_missing_conversation_writes_neither() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let message =
			NewUserMessage { conversation_id: "gone".into(), ..a_user_message("m1", "hi", 1) };

		let refused = database.messages().send_user_message(message, None).await;

		assert!(
			matches!(&refused, Err(TranscriptError::UnknownConversation { id }) if id == "gone"),
			"a user message for a missing conversation answered {refused:?}"
		);
		assert_eq!(rows_in(&database, "turns").await, 0, "a refused user message left a turn");
		assert_eq!(rows_in(&database, "messages").await, 0, "a refused user message left a row");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_foreign_key_failure_names_the_operation_and_the_table_it_hit() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;

		let refused = database
			.messages()
			.open_assistant_message(a_reply("r1", Some("no such message")))
			.await;

		assert!(
			matches!(
				&refused,
				Err(TranscriptError::Database(DatabaseError::SqliteAt {
					operation: "open_assistant_message",
					table: "messages",
					failure: rusqlite::Error::SqliteFailure(code, _),
				})) if code.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY
			),
			"a reply to a missing message answered {refused:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
