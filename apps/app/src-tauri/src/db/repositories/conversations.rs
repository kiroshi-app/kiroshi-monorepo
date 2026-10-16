use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use super::arrivals::{self, Arrival};
use super::bot_spaces;
use super::sections;
use crate::agent::contract::AgentCommand;
use crate::bundles::BotPermissions;
use crate::db::{Access, DatabaseError};

mod avatar;
mod bots;
mod effort;
mod page;

pub use avatar::AvatarBlot;
pub use bots::{Bot, BotIdentity};
pub use page::{ActiveConversation, ActivePage, ActiveTurn, LastWord};

use bots::{
	bot, bot_at, bot_in, bots_of, counted_bots, created_bot, deleted_bot, ensured_default_bot,
	oldest_space_of, pinned_bot, seed_default_bot, set_avatar_image_path, set_memory,
	set_permissions, stored_default_bot, updated_bot, BOT_COLUMNS, LIVE_BOT,
	RANKED_BY_PRESENCE_IN_SPACE,
};

pub(in crate::db::repositories) use bots::{deleted_chat_in, retired_bot};

pub const DEFAULT_BOT_ID: &str = "default";
const DEFAULT_BOT_NAME: &str = "Claude";
pub const DEFAULT_BOT_MODEL: &str = "opus";
const PARTICIPANT_ROLE: &str = "assistant";
const LEAD_ROLE: &str = "lead";
const CHAT_TITLE: &str = "Chat";
const CHAT_KIND: &str = "main";
pub const TOPIC_KIND: &str = "topic";
pub const MISSION_KIND: &str = "mission";

#[derive(Debug)]
pub enum ConversationError {
	Database(DatabaseError),
	UnknownBot { id: String },
	UnknownConversation { id: String },
	ForeignBot { id: String },
	SeveralSpaces { id: String },
	UnknownParticipant { conversation_id: String, bot_id: String },
	BlankIcon,
}

impl From<DatabaseError> for ConversationError {
	fn from(error: DatabaseError) -> Self {
		Self::Database(error)
	}
}

impl From<rusqlite::Error> for ConversationError {
	fn from(error: rusqlite::Error) -> Self {
		Self::Database(DatabaseError::Sqlite(error))
	}
}

fn unserializable(error: serde_json::Error) -> ConversationError {
	ConversationError::from(rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

#[derive(Debug, PartialEq, Eq)]
pub struct Chat {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
}

#[derive(Debug, PartialEq, Eq, specta::Type)]
pub struct Participant {
	pub conversation_id: String,
	pub bot_id: String,
	pub joined_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conversation {
	pub id: String,
	pub space_id: Option<String>,
	pub section_id: Option<String>,
	pub pin_position: Option<i64>,
	pub title: String,
	pub instructions: String,
	pub icon: Option<String>,
	pub color: Option<AvatarBlot>,
	pub created_at: i64,
	pub updated_at: i64,
	pub seats: Vec<Seat>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Joined {
	pub conversation: Conversation,
	pub arrival: Option<Arrival>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Seat {
	pub bot_id: String,
	pub role: String,
	pub joined_at: i64,
	pub left_at: Option<i64>,
	pub name: String,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub is_deleted: bool,
}

impl Seat {
	pub fn is_lead(&self) -> bool {
		self.role == LEAD_ROLE
	}
}

#[derive(Debug, Clone)]
pub struct ConversationDraft {
	pub space_id: String,
	pub section_id: Option<String>,
	pub title: String,
	pub bot_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ConversationEdit {
	pub title: String,
	pub instructions: String,
	pub section_id: Option<String>,
	pub icon: Option<String>,
	pub color: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ConversationDescription {
	pub icon: Option<String>,
	pub color: Option<Option<String>>,
}

pub struct ConversationsRepository {
	access: Access,
}

impl ConversationsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub(in crate::db) async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub(in crate::db) async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	pub async fn ensure_default_bot(&self) -> Result<Bot, ConversationError> {
		self.call_mut(|connection| Ok(ensured_default_bot(connection))).await?
	}

	pub async fn default_bot(&self) -> Result<Option<Bot>, ConversationError> {
		self.call(|connection| Ok(stored_default_bot(connection))).await?
	}

	pub async fn ensure_chat(
		&self,
		bot_id: String,
		space_id: Option<String>,
	) -> Result<Chat, ConversationError> {
		self.call_mut(move |connection| Ok(ensured_chat(connection, &bot_id, space_id.as_deref())))
			.await?
	}

	pub async fn bot(&self, id: String) -> Result<Option<Bot>, ConversationError> {
		Ok(self.call(move |connection| Ok(bot_at(connection, &id)?)).await?)
	}

	pub async fn bot_in(
		&self,
		id: String,
		space_id: String,
	) -> Result<Option<Bot>, ConversationError> {
		Ok(self.call(move |connection| Ok(bot_in(connection, &id, &space_id)?)).await?)
	}

	pub async fn bots(&self, space_id: Option<String>) -> Result<Vec<Bot>, DatabaseError> {
		self.call(move |connection| Ok(bots_of(connection, space_id.as_deref())?)).await
	}

	pub async fn bots_by_presence(
		&self,
		space_id: String,
		excluded_conversation_id: Option<String>,
	) -> Result<Vec<Bot>, DatabaseError> {
		self.call(move |connection| {
			let mut statement = connection
				.prepare_cached(&format!("{BOT_COLUMNS} {RANKED_BY_PRESENCE_IN_SPACE}"))?;
			let rows = statement
				.query_map(params![space_id, excluded_conversation_id, TOPIC_KIND], bot)?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	pub async fn holds_a_bot(&self) -> Result<bool, DatabaseError> {
		self.call(|connection| Ok(counted_bots(connection)? > 0)).await
	}

	pub async fn create_bot(
		&self,
		identity: BotIdentity,
		space_id: Option<String>,
		section_id: Option<String>,
	) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| {
			Ok(created_bot(connection, &identity, space_id.as_deref(), section_id.as_deref()))
		})
		.await?
	}

	pub async fn update_bot(
		&self,
		id: String,
		identity: BotIdentity,
	) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(updated_bot(connection, &id, &identity))).await?
	}

	pub async fn delete_bot(&self, id: String) -> Result<(), ConversationError> {
		self.call_mut(move |connection| Ok(deleted_bot(connection, &id))).await?
	}

	pub async fn set_avatar_image_path(
		&self,
		id: String,
		path: Option<String>,
	) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(set_avatar_image_path(connection, &id, path.as_deref())))
			.await?
	}

	pub async fn set_memory(&self, id: String, memory: String) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(set_memory(connection, &id, &memory))).await?
	}

	pub async fn pin_bot(&self, id: String) -> Result<Bot, ConversationError> {
		self.call_mut(move |connection| Ok(pinned_bot(connection, &id))).await?
	}

	pub async fn adopt_instructions(
		&self,
		id: String,
		instructions: String,
	) -> Result<(), ConversationError> {
		self.call(move |connection| {
			let written = connection.execute(
				"UPDATE bots SET instructions = ?2 WHERE id = ?1",
				params![&id, instructions],
			)?;
			Ok(refuse_if_untouched(written, &id))
		})
		.await?
	}

	pub async fn set_permissions(
		&self,
		id: String,
		permissions: BotPermissions,
	) -> Result<Bot, ConversationError> {
		let ruled = serde_json::to_string(&permissions).map_err(unserializable)?;
		self.call_mut(move |connection| Ok(set_permissions(connection, &id, &ruled))).await?
	}

	pub async fn adopt_permissions(
		&self,
		id: String,
		permissions: BotPermissions,
	) -> Result<(), ConversationError> {
		let ruled = serde_json::to_string(&permissions).map_err(unserializable)?;
		self.call(move |connection| {
			connection.execute(
				"UPDATE bots SET permissions = ?2 WHERE id = ?1 AND permissions IS NULL",
				params![&id, ruled],
			)?;
			Ok(())
		})
		.await
		.map_err(Into::into)
	}

	pub async fn adopt_memory(&self, id: String, memory: String) -> Result<(), ConversationError> {
		self.call(move |connection| {
			let written = connection
				.execute("UPDATE bots SET memory = ?2 WHERE id = ?1", params![&id, memory])?;
			Ok(refuse_if_untouched(written, &id))
		})
		.await?
	}

	pub async fn record_bot_commands(
		&self,
		id: String,
		commands: Vec<AgentCommand>,
	) -> Result<(), ConversationError> {
		let listed = serde_json::to_string(&commands).map_err(unserializable)?;
		self.call(move |connection| {
			let written = connection
				.execute("UPDATE bots SET commands = ?2 WHERE id = ?1", params![&id, listed])?;
			Ok(refuse_if_untouched(written, &id))
		})
		.await?
	}

	pub async fn bot_commands(&self, id: String) -> Result<Vec<AgentCommand>, DatabaseError> {
		self.call(move |connection| {
			let stored: Option<String> = connection
				.query_row("SELECT commands FROM bots WHERE id = ?1", [id], |row| row.get(0))
				.optional()?;
			Ok(stored.and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default())
		})
		.await
	}

	pub async fn avatar_image_paths(&self) -> Result<Vec<String>, DatabaseError> {
		self.call(|connection| {
			let mut statement = connection.prepare_cached(
				"SELECT avatar_image_path FROM bots WHERE avatar_image_path IS NOT NULL",
			)?;
			let rows = statement.query_map([], |row| row.get(0))?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	pub async fn conversation_ids(&self) -> Result<Vec<String>, DatabaseError> {
		self.call(|connection| {
			let mut statement = connection.prepare_cached("SELECT id FROM conversations")?;
			let rows = statement.query_map([], |row| row.get(0))?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	pub async fn participants(
		&self,
		conversation_id: String,
	) -> Result<Vec<Participant>, DatabaseError> {
		self.call(move |connection| {
			let mut statement = connection.prepare(
				"SELECT conversation_id, bot_id, joined_at
					FROM conversation_participants
					WHERE conversation_id = ?1
					ORDER BY joined_at ASC, bot_id ASC",
			)?;
			let rows = statement.query_map([conversation_id], participant)?;
			Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
		})
		.await
	}

	pub async fn create_conversation(
		&self,
		draft: ConversationDraft,
	) -> Result<Conversation, ConversationError> {
		self.call_mut(move |connection| Ok(created_conversation(connection, &draft))).await?
	}

	pub async fn conversations(
		&self,
		space_id: String,
	) -> Result<Vec<Conversation>, ConversationError> {
		self.call(move |connection| Ok(conversations_of_space(connection, &space_id))).await?
	}

	pub async fn update_conversation(
		&self,
		id: String,
		edit: ConversationEdit,
	) -> Result<Conversation, ConversationError> {
		self.call_mut(move |connection| Ok(updated_conversation(connection, &id, &edit))).await?
	}

	pub async fn describe_conversation(
		&self,
		id: String,
		description: ConversationDescription,
	) -> Result<Conversation, ConversationError> {
		self.call_mut(move |connection| Ok(described_conversation(connection, &id, &description)))
			.await?
	}

	pub async fn delete_conversation(&self, id: String) -> Result<(), ConversationError> {
		self.call_mut(move |connection| Ok(deleted_conversation(connection, &id))).await?
	}

	pub async fn add_participant(
		&self,
		conversation_id: String,
		bot_id: String,
		invited_by_bot_id: Option<String>,
	) -> Result<Joined, ConversationError> {
		self.call_mut(move |connection| {
			Ok(added_participant(
				connection,
				&conversation_id,
				&bot_id,
				invited_by_bot_id.as_deref(),
			))
		})
		.await?
	}

	pub async fn remove_participant(
		&self,
		conversation_id: String,
		bot_id: String,
	) -> Result<Conversation, ConversationError> {
		self.call_mut(move |connection| {
			Ok(removed_participant(connection, &conversation_id, &bot_id))
		})
		.await?
	}

	pub async fn seats(&self, conversation_id: String) -> Result<Vec<Seat>, ConversationError> {
		self.call(move |connection| Ok(seats_of(connection, &conversation_id))).await?
	}

	pub async fn instructions(&self, conversation_id: String) -> Result<String, DatabaseError> {
		self.call(move |connection| {
			let stored: Option<String> = connection
				.prepare_cached("SELECT instructions FROM conversations WHERE id = ?1")?
				.query_row([conversation_id], |row| row.get(0))
				.optional()?;
			Ok(stored.unwrap_or_default())
		})
		.await
	}

	pub async fn space(&self, conversation_id: String) -> Result<Option<String>, DatabaseError> {
		self.call(move |connection| space_of_conversation(connection, &conversation_id)).await
	}

	pub async fn kind(&self, conversation_id: String) -> Result<Option<String>, DatabaseError> {
		self.call(move |connection| {
			Ok(connection
				.prepare_cached("SELECT kind FROM conversations WHERE id = ?1")?
				.query_row([conversation_id], |row| row.get(0))
				.optional()?)
		})
		.await
	}

	pub async fn title(&self, conversation_id: String) -> Result<Option<String>, DatabaseError> {
		self.call(move |connection| {
			Ok(connection
				.prepare_cached("SELECT title FROM conversations WHERE id = ?1")?
				.query_row([conversation_id], |row| row.get(0))
				.optional()?)
		})
		.await
	}

	pub async fn oldest_bot_space(&self, bot_id: String) -> Result<Option<String>, DatabaseError> {
		self.call(move |connection| Ok(oldest_space_of(connection, &bot_id)?)).await
	}

	pub async fn bot_space_ids(&self, bot_id: String) -> Result<Vec<String>, DatabaseError> {
		self.call(move |connection| Ok(bot_spaces::spaces_of(connection, &bot_id)?)).await
	}

	pub async fn set_lead(
		&self,
		conversation_id: String,
		bot_id: String,
	) -> Result<Conversation, ConversationError> {
		self.call_mut(move |connection| Ok(led_by(connection, &conversation_id, &bot_id))).await?
	}
}

const CONVERSATION_COLUMNS: &str = "SELECT id, space_id, section_id, pin_position,
		title, instructions, icon, color, created_at, updated_at
	FROM conversations";

const SEAT_COLUMNS: &str = "SELECT seat.conversation_id, seat.bot_id, seat.role, seat.joined_at,
		seat.left_at, bots.name, bots.avatar_color, bots.avatar_image_path,
		bots.deleted_at
	FROM conversation_participants AS seat
	JOIN bots ON bots.id = seat.bot_id";

const SELECT_FIRST_SPACE: &str = "SELECT id FROM spaces ORDER BY position ASC, id ASC LIMIT 1";

const SELECT_CHAT_OF_BOT: &str = "SELECT conversations.id,
		conversations.created_at, conversations.updated_at
	FROM conversation_participants
	JOIN conversations ON conversations.id = conversation_participants.conversation_id
	WHERE conversation_participants.bot_id = ?1
		AND conversations.kind = 'main' AND conversations.space_id = ?2
	ORDER BY conversations.created_at ASC, conversations.id ASC
	LIMIT 1";

fn space_of_conversation(
	connection: &Connection,
	conversation_id: &str,
) -> Result<Option<String>, DatabaseError> {
	let named: Option<Option<String>> = connection
		.prepare_cached("SELECT space_id FROM conversations WHERE id = ?1")?
		.query_row([conversation_id], |row| row.get(0))
		.optional()?;
	Ok(named.flatten())
}

fn ensured_chat(
	connection: &mut Connection,
	bot_id: &str,
	wanted_space_id: Option<&str>,
) -> Result<Chat, ConversationError> {
	if let Some(space_id) = solo_space_of(connection, bot_id, wanted_space_id)? {
		if let Some(held) = chat_of(connection, bot_id, &space_id)? {
			return Ok(held);
		}
	}
	let transaction = write_transaction(connection)?;
	let held = ensure_chat_in(&transaction, bot_id, wanted_space_id)?;
	transaction.commit()?;
	Ok(held)
}

pub(in crate::db) fn ensure_chat_in(
	transaction: &Transaction<'_>,
	bot_id: &str,
	wanted_space_id: Option<&str>,
) -> Result<Chat, ConversationError> {
	if bot_id == DEFAULT_BOT_ID {
		seed_default_bot(transaction)?;
	}
	let space_id = solo_space_of(transaction, bot_id, wanted_space_id)?
		.ok_or_else(|| ConversationError::UnknownBot { id: bot_id.to_owned() })?;
	match chat_of(transaction, bot_id, &space_id)? {
		Some(found) => Ok(found),
		None => insert_chat(transaction, bot_id, &space_id),
	}
}

fn solo_space_of(
	connection: &Connection,
	bot_id: &str,
	wanted_space_id: Option<&str>,
) -> Result<Option<String>, ConversationError> {
	let Some(space_id) = wanted_space_id else {
		return Ok(oldest_space_of(connection, bot_id)?);
	};
	match bot_spaces::held(connection, bot_id, space_id)? {
		true => Ok(Some(space_id.to_owned())),
		false => Err(ConversationError::ForeignBot { id: bot_id.to_owned() }),
	}
}

fn chat_of(
	connection: &Connection,
	bot_id: &str,
	space_id: &str,
) -> Result<Option<Chat>, ConversationError> {
	Ok(connection.query_row(SELECT_CHAT_OF_BOT, params![bot_id, space_id], chat).optional()?)
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn insert_chat(
	transaction: &Transaction<'_>,
	bot_id: &str,
	space_id: &str,
) -> Result<Chat, ConversationError> {
	let id = Uuid::new_v4().to_string();
	let at = now();
	let created = transaction.query_row(
		"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?5)
			RETURNING id, created_at, updated_at",
		params![id, CHAT_KIND, space_id, CHAT_TITLE, at],
		chat,
	)?;
	transaction.execute(
		"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES (?1, ?2, ?3, ?4, 0)",
		params![created.id, bot_id, PARTICIPANT_ROLE, at],
	)?;
	Ok(created)
}

pub(in crate::db) fn open_thread_under(
	transaction: &Transaction<'_>,
	origin_conversation_id: &str,
	bot_id: &str,
	title: &str,
) -> Result<String, ConversationError> {
	let space_id: Option<String> = transaction
		.query_row(
			"SELECT space_id FROM conversations WHERE id = ?1",
			[origin_conversation_id],
			|row| row.get(0),
		)
		.optional()?
		.ok_or_else(|| ConversationError::UnknownConversation {
			id: origin_conversation_id.to_owned(),
		})?;
	let id = Uuid::new_v4().to_string();
	let at = now();
	transaction.execute(
		"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
		params![id, MISSION_KIND, space_id, title, at],
	)?;
	transaction.execute(
		"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES (?1, ?2, ?3, ?4, 0)",
		params![id, bot_id, PARTICIPANT_ROLE, at],
	)?;
	Ok(id)
}

fn created_conversation(
	connection: &mut Connection,
	draft: &ConversationDraft,
) -> Result<Conversation, ConversationError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	let at = now();
	let pin = pin_within(&transaction, &draft.space_id, draft.section_id.as_deref())?;
	transaction.execute(
		"INSERT INTO conversations
			(id, kind, space_id, section_id, title, created_at, updated_at, pin_position)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)",
		params![id, TOPIC_KIND, draft.space_id, draft.section_id, draft.title, at, pin],
	)?;
	for (rank, bot_id) in draft.bot_ids.iter().enumerate() {
		let role = match rank {
			0 => LEAD_ROLE,
			_ => PARTICIPANT_ROLE,
		};
		seat(&transaction, &id, bot_id, Some(&draft.space_id), role)?;
	}
	let created = conversation_at(&transaction, &id)?;
	transaction.commit()?;
	Ok(created)
}

fn seat(
	transaction: &Transaction<'_>,
	conversation_id: &str,
	bot_id: &str,
	space_id: Option<&str>,
	role: &str,
) -> Result<(), ConversationError> {
	let is_live: bool = transaction.query_row(LIVE_BOT, [bot_id], |row| row.get(0))?;
	if !is_live {
		return Err(ConversationError::UnknownBot { id: bot_id.to_owned() });
	}
	let foreign = ConversationError::ForeignBot { id: bot_id.to_owned() };
	let Some(space_id) = space_id else {
		return Err(foreign);
	};
	if !bot_spaces::held(transaction, bot_id, space_id)? {
		return Err(foreign);
	}
	transaction.execute(
		"INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (conversation_id, bot_id)
			DO UPDATE SET left_at = NULL, role = excluded.role",
		params![conversation_id, bot_id, role, now(), next_join_seq(transaction, conversation_id)?],
	)?;
	Ok(())
}

fn conversations_of_space(
	connection: &Connection,
	space_id: &str,
) -> Result<Vec<Conversation>, ConversationError> {
	let mut statement = connection.prepare_cached(&format!(
		"{CONVERSATION_COLUMNS} WHERE kind = ?1 AND space_id = ?2 ORDER BY created_at ASC, id ASC"
	))?;
	let rows = statement.query_map(params![TOPIC_KIND, space_id], conversation)?;
	let mut rooms = rows.collect::<rusqlite::Result<Vec<_>>>()?;
	let mut seats = seats_of_space(connection, space_id)?;
	for room in &mut rooms {
		room.seats = seats.remove(&room.id).unwrap_or_default();
	}
	Ok(rooms)
}

fn seats_of_space(
	connection: &Connection,
	space_id: &str,
) -> Result<HashMap<String, Vec<Seat>>, ConversationError> {
	let mut statement = connection.prepare_cached(&format!(
		"{SEAT_COLUMNS} WHERE seat.conversation_id IN
			(SELECT id FROM conversations WHERE kind = ?1 AND space_id = ?2)
		ORDER BY seat.conversation_id ASC, seat.join_seq ASC"
	))?;
	seats_by_conversation(&mut statement, params![TOPIC_KIND, space_id])
}

fn seats_by_conversation(
	statement: &mut rusqlite::Statement<'_>,
	bound: impl rusqlite::Params,
) -> Result<HashMap<String, Vec<Seat>>, ConversationError> {
	let rows = statement
		.query_map(bound, |row| Ok((row.get::<_, String>("conversation_id")?, seated(row)?)))?;
	let mut held: HashMap<String, Vec<Seat>> = HashMap::new();
	for row in rows {
		let (conversation_id, seat) = row?;
		held.entry(conversation_id).or_default().push(seat);
	}
	Ok(held)
}

fn conversation_at(connection: &Connection, id: &str) -> Result<Conversation, ConversationError> {
	let mut room: Conversation = connection
		.prepare_cached(&format!("{CONVERSATION_COLUMNS} WHERE id = ?1 AND kind = ?2"))?
		.query_row(params![id, TOPIC_KIND], conversation)
		.optional()?
		.ok_or_else(|| ConversationError::UnknownConversation { id: id.to_owned() })?;
	room.seats = seats_of(connection, id)?;
	Ok(room)
}

fn conversation_of_any_kind_at(
	connection: &Connection,
	id: &str,
) -> Result<Conversation, ConversationError> {
	let mut room: Conversation = connection
		.prepare_cached(&format!("{CONVERSATION_COLUMNS} WHERE id = ?1"))?
		.query_row([id], conversation)
		.optional()?
		.ok_or_else(|| ConversationError::UnknownConversation { id: id.to_owned() })?;
	room.seats = seats_of(connection, id)?;
	Ok(room)
}

fn seats_of(
	connection: &Connection,
	conversation_id: &str,
) -> Result<Vec<Seat>, ConversationError> {
	let mut statement = connection.prepare_cached(&format!(
		"{SEAT_COLUMNS} WHERE seat.conversation_id = ?1 ORDER BY seat.join_seq ASC"
	))?;
	let rows = statement.query_map([conversation_id], seated)?;
	Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn pin_within(
	transaction: &Transaction<'_>,
	space_id: &str,
	section_id: Option<&str>,
) -> Result<Option<i64>, ConversationError> {
	match section_id {
		Some(_) => Ok(Some(sections::next_pin(transaction, space_id)?)),
		None => Ok(None),
	}
}

fn updated_conversation(
	connection: &mut Connection,
	id: &str,
	edit: &ConversationEdit,
) -> Result<Conversation, ConversationError> {
	refuse_blank_icon(edit.icon.as_deref())?;
	let transaction = write_transaction(connection)?;
	let home: Option<String> = transaction
		.query_row("SELECT space_id FROM conversations WHERE id = ?1", [id], |row| row.get(0))
		.optional()?
		.flatten();
	let pin = match home {
		Some(space_id) => pin_within(&transaction, &space_id, edit.section_id.as_deref())?,
		None => None,
	};
	let written = transaction.execute(
		"UPDATE conversations SET title = ?2, instructions = ?3, section_id = ?4, updated_at = ?5,
			pin_position = ?6, icon = ?7, color = ?8
			WHERE id = ?1",
		params![
			id,
			edit.title,
			edit.instructions,
			edit.section_id,
			now(),
			pin,
			edit.icon,
			edit.color
		],
	)?;
	refuse_unknown_conversation(written, id)?;
	let updated = conversation_of_any_kind_at(&transaction, id)?;
	transaction.commit()?;
	Ok(updated)
}

fn described_conversation(
	connection: &mut Connection,
	id: &str,
	description: &ConversationDescription,
) -> Result<Conversation, ConversationError> {
	refuse_blank_icon(description.icon.as_deref())?;
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE conversations SET icon = COALESCE(?2, icon),
			color = CASE WHEN ?3 THEN ?4 ELSE color END, updated_at = ?5
			WHERE id = ?1",
		params![
			id,
			description.icon,
			description.color.is_some(),
			description.color.clone().flatten(),
			now()
		],
	)?;
	refuse_unknown_conversation(written, id)?;
	let described = conversation_of_any_kind_at(&transaction, id)?;
	transaction.commit()?;
	Ok(described)
}

fn refuse_blank_icon(icon: Option<&str>) -> Result<(), ConversationError> {
	match icon {
		Some(icon) if icon.trim().is_empty() => Err(ConversationError::BlankIcon),
		_ => Ok(()),
	}
}

fn deleted_conversation(connection: &mut Connection, id: &str) -> Result<(), ConversationError> {
	let transaction = write_transaction(connection)?;
	let dropped = transaction.execute(
		"DELETE FROM conversations WHERE id = ?1 AND kind = ?2",
		params![id, TOPIC_KIND],
	)?;
	refuse_unknown_conversation(dropped, id)?;
	transaction.commit()?;
	Ok(())
}

fn added_participant(
	connection: &mut Connection,
	conversation_id: &str,
	bot_id: &str,
	invited_by_bot_id: Option<&str>,
) -> Result<Joined, ConversationError> {
	let transaction = write_transaction(connection)?;
	let room = conversation_at(&transaction, conversation_id)?;
	if let Some(inviter) = invited_by_bot_id.filter(|inviter| !is_present(&room, inviter)) {
		return Err(ConversationError::UnknownParticipant {
			conversation_id: conversation_id.to_owned(),
			bot_id: inviter.to_owned(),
		});
	}
	if is_present(&room, bot_id) {
		return Ok(Joined { conversation: room, arrival: None });
	}
	let role = match room.seats.iter().any(|seat| seat.role == LEAD_ROLE) {
		true => PARTICIPANT_ROLE,
		false => LEAD_ROLE,
	};
	seat(&transaction, conversation_id, bot_id, room.space_id.as_deref(), role)?;
	let arrival = arrivals::record(&transaction, conversation_id, bot_id, invited_by_bot_id)?;
	let conversation = conversation_at(&transaction, conversation_id)?;
	transaction.commit()?;
	Ok(Joined { conversation, arrival: Some(arrival) })
}

fn is_present(room: &Conversation, bot_id: &str) -> bool {
	room.seats.iter().any(|seat| seat.bot_id == bot_id && seat.left_at.is_none())
}

fn next_join_seq(
	transaction: &Transaction<'_>,
	conversation_id: &str,
) -> Result<i64, ConversationError> {
	Ok(transaction.query_row(
		"SELECT COALESCE(MAX(join_seq) + 1, 0) FROM conversation_participants
			WHERE conversation_id = ?1",
		[conversation_id],
		|row| row.get(0),
	)?)
}

fn removed_participant(
	connection: &mut Connection,
	conversation_id: &str,
	bot_id: &str,
) -> Result<Conversation, ConversationError> {
	let transaction = write_transaction(connection)?;
	let departed = transaction.execute(
		"UPDATE conversation_participants SET left_at = ?3, role = ?4
			WHERE conversation_id = ?1 AND bot_id = ?2 AND left_at IS NULL",
		params![conversation_id, bot_id, now(), PARTICIPANT_ROLE],
	)?;
	refuse_unknown_participant(departed, conversation_id, bot_id)?;
	transaction.execute(
		"UPDATE conversation_participants SET role = ?2
			WHERE conversation_id = ?1 AND left_at IS NULL
				AND NOT EXISTS (SELECT 1 FROM conversation_participants AS held
					WHERE held.conversation_id = ?1 AND held.role = ?2)
				AND join_seq = (SELECT MIN(join_seq) FROM conversation_participants AS present
					WHERE present.conversation_id = ?1 AND present.left_at IS NULL)",
		params![conversation_id, LEAD_ROLE],
	)?;
	let left = conversation_at(&transaction, conversation_id)?;
	transaction.commit()?;
	Ok(left)
}

fn led_by(
	connection: &mut Connection,
	conversation_id: &str,
	bot_id: &str,
) -> Result<Conversation, ConversationError> {
	let transaction = write_transaction(connection)?;
	transaction.execute(
		"UPDATE conversation_participants SET role = ?2 WHERE conversation_id = ?1 AND role = ?3",
		params![conversation_id, PARTICIPANT_ROLE, LEAD_ROLE],
	)?;
	let crowned = transaction.execute(
		"UPDATE conversation_participants SET role = ?3
			WHERE conversation_id = ?1 AND bot_id = ?2 AND left_at IS NULL",
		params![conversation_id, bot_id, LEAD_ROLE],
	)?;
	refuse_unknown_participant(crowned, conversation_id, bot_id)?;
	let led = conversation_at(&transaction, conversation_id)?;
	transaction.commit()?;
	Ok(led)
}

fn refuse_unknown_conversation(rows: usize, id: &str) -> Result<(), ConversationError> {
	match rows {
		0 => Err(ConversationError::UnknownConversation { id: id.to_owned() }),
		_ => Ok(()),
	}
}

fn refuse_unknown_participant(
	rows: usize,
	conversation_id: &str,
	bot_id: &str,
) -> Result<(), ConversationError> {
	match rows {
		0 => Err(ConversationError::UnknownParticipant {
			conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
		}),
		_ => Ok(()),
	}
}

fn space_of(connection: &Connection, wanted: Option<&str>) -> Result<String, ConversationError> {
	match wanted {
		Some(id) => Ok(id.to_owned()),
		None => Ok(connection.query_row(SELECT_FIRST_SPACE, [], |row| row.get(0))?),
	}
}

fn refuse_if_untouched(rows: usize, id: &str) -> Result<(), ConversationError> {
	match rows {
		0 => Err(ConversationError::UnknownBot { id: id.to_owned() }),
		_ => Ok(()),
	}
}

fn chat(row: &Row<'_>) -> rusqlite::Result<Chat> {
	Ok(Chat { id: row.get(0)?, created_at: row.get(1)?, updated_at: row.get(2)? })
}

fn participant(row: &Row<'_>) -> rusqlite::Result<Participant> {
	Ok(Participant { conversation_id: row.get(0)?, bot_id: row.get(1)?, joined_at: row.get(2)? })
}

fn conversation(row: &Row<'_>) -> rusqlite::Result<Conversation> {
	Ok(Conversation {
		id: row.get("id")?,
		space_id: row.get("space_id")?,
		section_id: row.get("section_id")?,
		pin_position: row.get("pin_position")?,
		title: row.get("title")?,
		instructions: row.get("instructions")?,
		icon: row.get("icon")?,
		color: row.get("color")?,
		created_at: row.get("created_at")?,
		updated_at: row.get("updated_at")?,
		seats: Vec::new(),
	})
}

fn seated(row: &Row<'_>) -> rusqlite::Result<Seat> {
	Ok(Seat {
		bot_id: row.get("bot_id")?,
		role: row.get("role")?,
		joined_at: row.get("joined_at")?,
		left_at: row.get("left_at")?,
		name: row.get("name")?,
		avatar_blot: row.get("avatar_color")?,
		avatar_image_path: row.get("avatar_image_path")?,
		is_deleted: row.get::<_, Option<i64>>("deleted_at")?.is_some(),
	})
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::messages::{
		MessagePage, MessagePageQuery, MessagesAroundQuery, NewAssistantMessage, NewTurn,
	};
	use crate::db::{count_of, open, Database};

	pub(super) fn an_identity(name: &str) -> BotIdentity {
		BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: DEFAULT_BOT_MODEL.to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: String::new(),
			denied_tools: Vec::new(),
			effort: None,
		}
	}

	pub(super) async fn spoke_in(database: &Database, conversation_id: &str, bot_id: &str) {
		let turn_id = Uuid::new_v4().to_string();
		database
			.messages()
			.start_turn(NewTurn {
				id: turn_id.clone(),
				conversation_id: conversation_id.to_owned(),
				started_at: now(),
			})
			.await
			.expect("the turn");
		database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				id: Uuid::new_v4().to_string(),
				conversation_id: conversation_id.to_owned(),
				turn_id,
				author_bot_id: Some(bot_id.to_owned()),
				replied_to_message_id: None,
				created_at: now(),
			})
			.await
			.expect("the message");
	}

	async fn said_in(database: &Database, conversation_id: &str) -> usize {
		database
			.messages()
			.page_messages(MessagePageQuery {
				conversation_id: conversation_id.to_owned(),
				before_seq: None,
				limit: 10,
			})
			.await
			.expect("the messages")
			.messages
			.len()
	}

	pub(super) async fn a_transcript_for(database: &Database, conversation_id: &str, bot_id: &str) {
		let conversation_id = conversation_id.to_owned();
		let bot_id = bot_id.to_owned();
		database
			.conversations()
			.call(move |connection| {
				connection.execute_batch(&format!(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t1', '{conversation_id}', 1, 1);
					INSERT INTO messages
						(id, conversation_id, turn_id, author_bot_id, seq, role, content,
							completion_state, created_at)
						VALUES ('m1', '{conversation_id}', 't1', NULL, 1, 'user', 'hello',
								'complete', 1),
							('m2', '{conversation_id}', 't1', '{bot_id}', 2, 'assistant',
								'hi there', 'complete', 2);
					INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
						VALUES ('a1', 't1', 'tool', 'succeeded', '{{}}', 1, 1);
					INSERT INTO runtime_sessions
						(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
						VALUES ('s1', '{conversation_id}', '{bot_id}', 'claude-1', 1, 'active', 1);
					INSERT INTO context_checkpoints
						(id, conversation_id, bot_id, runtime_session_id, summary,
							last_message_seq, token_count, created_at)
						VALUES ('k1', '{conversation_id}', '{bot_id}', 's1', 'so far', 1, 10, 1);"
				))?;
				Ok(())
			})
			.await
			.expect("the transcript is written")
	}

	pub(super) async fn assert_file_is_empty(database: &Database) {
		for table in [
			"bots",
			"conversations",
			"conversation_participants",
			"turns",
			"messages",
			"activities",
			"runtime_sessions",
			"context_checkpoints",
		] {
			assert_eq!(count_of(database, table).await, 0, "`{table}` was left holding a row");
		}
	}

	#[tokio::test]
	async fn asking_for_the_chat_again_gives_back_the_one_the_bot_already_has() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let first = repository.ensure_chat(DEFAULT_BOT_ID.into(), None).await.expect("the chat");
		let again =
			repository.ensure_chat(DEFAULT_BOT_ID.into(), None).await.expect("the same chat");

		assert_eq!(first, again, "a second ask minted another chat");
		assert_eq!(count_of(&database, "conversations").await, 1);
		let seats = repository.participants(first.id).await.expect("the participants");
		assert_eq!(seats.len(), 1, "the chat was left with nobody in it");
		assert_eq!(seats[0].bot_id, DEFAULT_BOT_ID);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_chat_a_bot_has_is_the_same_one_after_the_file_is_reopened() {
		let dir = temp_dir();
		let before = {
			let database = open(&dir);
			let repository = database.conversations();
			repository.ensure_chat(DEFAULT_BOT_ID.into(), None).await.expect("the chat")
		};

		let database = open(&dir);
		let after = database
			.conversations()
			.ensure_chat(DEFAULT_BOT_ID.into(), None)
			.await
			.expect("the chat");

		assert_eq!(after, before, "reopening the file minted another chat");
		assert_eq!(count_of(&database, "conversations").await, 1);
		assert_eq!(count_of(&database, "conversation_participants").await, 1);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	pub(super) async fn home_of(repository: &ConversationsRepository, bot: &Bot) -> String {
		repository
			.oldest_bot_space(bot.id.clone())
			.await
			.expect("the space is read")
			.expect("the bot holds a membership")
	}

	pub(super) fn a_draft(space_id: &str, bots: &[&Bot]) -> ConversationDraft {
		ConversationDraft {
			space_id: space_id.to_owned(),
			section_id: None,
			title: "Launch".to_owned(),
			bot_ids: bots.iter().map(|bot| bot.id.clone()).collect(),
		}
	}

	fn roster(room: &Conversation) -> Vec<(String, String, bool)> {
		room.seats
			.iter()
			.map(|seat| (seat.name.clone(), seat.role.clone(), seat.left_at.is_some()))
			.collect()
	}

	#[tokio::test]
	async fn the_bots_a_room_is_opened_with_take_their_seats_in_the_order_they_were_named() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let first = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let second = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");

		let room = repository
			.create_conversation(a_draft(&home_of(repository, &first).await, &[&first, &second]))
			.await
			.expect("the room is opened");
		let listed =
			repository.conversations(home_of(repository, &first).await).await.expect("the rooms");

		assert_eq!(
			roster(&room),
			vec![
				("Nyx".to_owned(), LEAD_ROLE.to_owned(), false),
				("Ada".to_owned(), PARTICIPANT_ROLE.to_owned(), false)
			],
			"the room seated its bots in an order nobody asked for"
		);
		assert_eq!(room.space_id, Some(home_of(repository, &first).await));
		assert_eq!(listed, vec![room], "the room the space holds is not the one that was opened");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_room_naming_a_bot_of_another_space_is_refused_and_seats_no_one() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let elsewhere = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let home = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let stranger = repository
			.create_bot(an_identity("Ada"), Some(elsewhere.id.clone()), None)
			.await
			.expect("the bot");

		let refused = repository
			.create_conversation(a_draft(&home_of(repository, &home).await, &[&home, &stranger]))
			.await;

		assert!(
			format!("{refused:?}").contains("ForeignBot"),
			"a bot of another space was let in: {refused:?}"
		);
		assert!(
			repository
				.conversations(home_of(repository, &home).await)
				.await
				.expect("the rooms")
				.is_empty(),
			"a refused room was written"
		);
		assert_eq!(
			count_of(&database, "conversation_participants").await,
			2,
			"a refused room seated a bot"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_that_leaves_a_room_keeps_its_seat_on_the_record_and_hands_the_lead_on() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let first = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let second = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &first).await, &[&first, &second]))
			.await
			.expect("the room is opened");
		a_transcript_for(&database, &room.id, &first.id).await;

		let left = repository
			.remove_participant(room.id.clone(), first.id.clone())
			.await
			.expect("the bot leaves");
		let back = repository
			.add_participant(room.id.clone(), first.id.clone(), None)
			.await
			.expect("the bot comes back")
			.conversation;

		assert_eq!(
			roster(&back),
			vec![
				("Nyx".to_owned(), PARTICIPANT_ROLE.to_owned(), false),
				("Ada".to_owned(), LEAD_ROLE.to_owned(), false)
			],
			"a bot that came back is still on the record as gone"
		);
		assert_eq!(
			roster(&left),
			vec![
				("Nyx".to_owned(), PARTICIPANT_ROLE.to_owned(), true),
				("Ada".to_owned(), LEAD_ROLE.to_owned(), false)
			],
			"the room came out of the departure without a lead"
		);
		assert_eq!(count_of(&database, "messages").await, 2, "a message left with its author");
		assert_eq!(count_of(&database, "runtime_sessions").await, 1, "a run left with its bot");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_coming_back_to_a_room_nobody_leads_takes_the_lead() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let first = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let second = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &first).await, &[&first, &second]))
			.await
			.expect("the room is opened");
		for leaving in [&first, &second] {
			repository
				.remove_participant(room.id.clone(), leaving.id.clone())
				.await
				.expect("the bot leaves");
		}

		let back = repository
			.add_participant(room.id, first.id, None)
			.await
			.expect("the bot comes back")
			.conversation;

		assert_eq!(
			roster(&back),
			vec![
				("Nyx".to_owned(), LEAD_ROLE.to_owned(), false),
				("Ada".to_owned(), PARTICIPANT_ROLE.to_owned(), true)
			],
			"the bot came back to a room that is still led by nobody"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn seating_a_bot_already_seated_leaves_every_role_and_join_order_as_they_stand() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;
		arrived(repository, &room, &bots[1]).await;
		let before = repository.seats(room.id.clone()).await.expect("the seats read");

		let seated_again = repository
			.add_participant(room.id.clone(), bots[0].id.clone(), Some(bots[1].id.clone()))
			.await
			.expect("the seated lead is seated again");

		assert_eq!(seated_again.arrival, None);
		assert_eq!(seated_again.conversation.seats, before, "a seat moved on a second seating");
		assert_eq!(repository.seats(room.id).await.expect("the seats read"), before);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_room_holds_one_lead_whoever_is_handed_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let first = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let second = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &first).await, &[&first, &second]))
			.await
			.expect("the room is opened");

		let led = repository
			.set_lead(room.id.clone(), second.id.clone())
			.await
			.expect("the lead is handed on");
		let refused = repository.set_lead(room.id, "missing".to_owned()).await;

		assert_eq!(
			roster(&led),
			vec![
				("Nyx".to_owned(), PARTICIPANT_ROLE.to_owned(), false),
				("Ada".to_owned(), LEAD_ROLE.to_owned(), false)
			]
		);
		assert!(
			format!("{refused:?}").contains("UnknownParticipant"),
			"the lead was handed to a bot that is not in the room: {refused:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_added_to_a_room_of_another_space_is_refused_and_one_of_its_own_sits_down() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let elsewhere = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let host = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let mate = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let stranger = repository
			.create_bot(an_identity("Rex"), Some(elsewhere.id), None)
			.await
			.expect("the bot");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &host).await, &[&host]))
			.await
			.expect("the room is opened");

		let refused = repository.add_participant(room.id.clone(), stranger.id, None).await;
		let joined = repository
			.add_participant(room.id, mate.id, None)
			.await
			.expect("the bot joins the room")
			.conversation;

		assert!(
			format!("{refused:?}").contains("ForeignBot"),
			"a bot of another space joined the room: {refused:?}"
		);
		assert_eq!(
			roster(&joined),
			vec![
				("Nyx".to_owned(), LEAD_ROLE.to_owned(), false),
				("Ada".to_owned(), PARTICIPANT_ROLE.to_owned(), false)
			]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_room_that_is_retitled_comes_back_retitled_and_later_than_it_was_opened() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let section = database
			.sections()
			.create(home_of(repository, &bot).await, "Writers".to_owned())
			.await
			.expect("the section");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &bot).await, &[&bot]))
			.await
			.expect("the room is opened");
		let backdated = room.id.clone();
		database
			.call(move |connection| {
				let sql = "UPDATE conversations SET updated_at = 1 WHERE id = ?1";
				Ok(connection.execute(sql, [backdated])?)
			})
			.await
			.expect("the room is backdated");

		let edited = repository
			.update_conversation(
				room.id.clone(),
				ConversationEdit {
					title: "Shipping".to_owned(),
					instructions: "stay on the release".to_owned(),
					section_id: Some(section.id.clone()),
					icon: None,
					color: None,
				},
			)
			.await
			.expect("the room is edited");
		let refused = repository
			.update_conversation(
				"missing".to_owned(),
				ConversationEdit {
					title: "Shipping".to_owned(),
					instructions: String::new(),
					section_id: None,
					icon: None,
					color: None,
				},
			)
			.await;

		assert_eq!(edited.title, "Shipping");
		assert_eq!(edited.instructions, "stay on the release");
		assert_eq!(edited.section_id, Some(section.id));
		assert!(edited.updated_at > 1, "an edited room kept its update time");
		assert!(
			format!("{refused:?}").contains("UnknownConversation"),
			"an edit on a room the file does not hold was accepted: {refused:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_look(icon: Option<&str>, color: Option<&str>) -> ConversationEdit {
		ConversationEdit {
			title: "Chat".to_owned(),
			instructions: String::new(),
			section_id: None,
			icon: icon.map(str::to_owned),
			color: color.map(str::to_owned),
		}
	}

	fn look_of(room: &Conversation) -> (Option<String>, Option<AvatarBlot>) {
		(room.icon.clone(), room.color)
	}

	#[tokio::test]
	async fn a_main_chat_takes_an_icon_and_a_colour_and_gives_them_back_when_cleared() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let home = home_of(repository, &bot).await;
		let chat =
			repository.ensure_chat(bot.id.clone(), Some(home.clone())).await.expect("the chat");

		let dressed = repository
			.update_conversation(chat.id.clone(), a_look(Some("Message"), Some("cyan")))
			.await
			.expect("the main chat is dressed");
		let listed = repository
			.conversation_in_page(chat.id.clone())
			.await
			.expect("the feed reads")
			.expect("the main chat is in the feed");
		let cleared = repository
			.update_conversation(chat.id.clone(), a_look(None, None))
			.await
			.expect("the main chat is cleared");

		assert_eq!(look_of(&dressed), (Some("Message".to_owned()), Some(AvatarBlot::Cyan)));
		assert_eq!(look_of(&listed.conversation), look_of(&dressed));
		assert_eq!(look_of(&cleared), (None, None));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_colour_outside_eight_or_a_blank_icon_is_refused_and_the_room_keeps_its_look() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &bot).await, &[&bot]))
			.await
			.expect("the room is opened");
		repository
			.update_conversation(room.id.clone(), a_look(Some("Message"), Some("red")))
			.await
			.expect("the room is dressed");

		let teal = repository
			.update_conversation(room.id.clone(), a_look(Some("Star"), Some("teal")))
			.await;
		let blank =
			repository.update_conversation(room.id.clone(), a_look(Some(" \t"), None)).await;
		let blank_description = repository
			.describe_conversation(
				room.id.clone(),
				ConversationDescription { icon: Some(String::new()), color: None },
			)
			.await;
		let kept = repository.conversations(home_of(repository, &bot).await).await.expect("list");

		assert!(
			matches!(teal, Err(ConversationError::Database(_))),
			"a colour outside the eight was accepted: {teal:?}"
		);
		assert!(matches!(blank, Err(ConversationError::BlankIcon)), "{blank:?}");
		assert!(
			matches!(blank_description, Err(ConversationError::BlankIcon)),
			"{blank_description:?}"
		);
		assert_eq!(look_of(&kept[0]), (Some("Message".to_owned()), Some(AvatarBlot::Red)));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_description_sets_what_it_names_and_leaves_the_rest_as_it_was() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &bot).await, &[&bot]))
			.await
			.expect("the room is opened");
		let described = |icon: Option<&str>, color: Option<Option<&str>>| {
			repository.describe_conversation(
				room.id.clone(),
				ConversationDescription {
					icon: icon.map(str::to_owned),
					color: color.map(|color| color.map(str::to_owned)),
				},
			)
		};

		let iconed = described(Some("Message"), None).await.expect("the icon is set");
		let coloured = described(None, Some(Some("pink"))).await.expect("the colour is set");
		let uncoloured = described(None, Some(None)).await.expect("the colour is cleared");
		let missing = repository
			.describe_conversation(
				"missing".to_owned(),
				ConversationDescription { icon: Some("Message".to_owned()), color: None },
			)
			.await;

		assert_eq!(look_of(&iconed), (Some("Message".to_owned()), None));
		assert_eq!(look_of(&coloured), (Some("Message".to_owned()), Some(AvatarBlot::Pink)));
		assert_eq!(look_of(&uncoloured), (Some("Message".to_owned()), None));
		assert_eq!(uncoloured.title, room.title, "a description moved the title");
		assert!(
			matches!(missing, Err(ConversationError::UnknownConversation { .. })),
			"{missing:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_bot_takes_its_own_chat_and_leaves_the_rooms_it_spoke_in() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let deleted = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let kept = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let home = home_of(repository, &deleted).await;
		let room = repository
			.create_conversation(a_draft(&home, &[&deleted, &kept]))
			.await
			.expect("the room is opened");
		a_transcript_for(&database, &room.id, &deleted.id).await;

		repository.delete_bot(deleted.id.clone()).await.expect("the bot is deleted");

		let rooms = repository.conversations(home.clone()).await.expect("the rooms");
		assert_eq!(rooms.len(), 1, "the room went with the bot that spoke in it");
		assert_eq!(
			roster(&rooms[0]),
			vec![
				("Nyx".to_owned(), LEAD_ROLE.to_owned(), false),
				("Ada".to_owned(), PARTICIPANT_ROLE.to_owned(), false)
			],
			"the deleted bot cannot be drawn in the room it spoke in"
		);
		assert_eq!(
			rooms[0].seats.iter().map(|seat| seat.is_deleted).collect::<Vec<_>>(),
			vec![true, false],
			"the room does not say which of its bots is gone"
		);
		assert_eq!(count_of(&database, "messages").await, 2, "a message went with its author");
		assert_eq!(
			count_of(&database, "conversations").await,
			2,
			"the chat of the deleted bot outlived it"
		);
		assert_eq!(
			repository
				.bots(Some(home))
				.await
				.expect("the bots")
				.into_iter()
				.map(|bot| bot.name)
				.collect::<Vec<_>>(),
			vec!["Ada".to_owned()],
			"a deleted bot is still offered by its space"
		);
		assert_eq!(room.id, rooms[0].id);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_seated_in_two_spaces_speaks_in_one_solo_thread_per_space() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let home = database.spaces().list().await.expect("the spaces")[0].id.clone();
		let joined = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let bot = repository
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");
		database
			.spaces()
			.add_bot(bot.id.clone(), joined.id.clone(), None)
			.await
			.expect("the bot joins the second space");

		let at_home = repository
			.ensure_chat(bot.id.clone(), Some(home.clone()))
			.await
			.expect("the thread of the first space");
		let away = repository
			.ensure_chat(bot.id.clone(), Some(joined.id.clone()))
			.await
			.expect("the thread of the second space");
		spoke_in(&database, &at_home.id, &bot.id).await;

		assert_ne!(at_home.id, away.id, "one thread was handed back for two spaces");
		assert_eq!(said_in(&database, &at_home.id).await, 1);
		assert_eq!(
			said_in(&database, &away.id).await,
			0,
			"a message written in one space was read in the other"
		);
		assert_eq!(
			repository.ensure_chat(bot.id.clone(), Some(home)).await.expect("the same thread").id,
			at_home.id,
			"asking again in the first space minted another thread"
		);
		assert_eq!(
			repository
				.ensure_chat(bot.id.clone(), Some(joined.id))
				.await
				.expect("the same thread")
				.id,
			away.id,
			"asking again in the second space minted another thread"
		);
		assert_eq!(
			repository.ensure_chat(bot.id, None).await.expect("the oldest thread").id,
			at_home.id,
			"asking without a space did not answer the thread of the oldest membership"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_solo_thread_asked_for_a_space_the_bot_is_out_of_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let foreign = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");

		let refused = repository.ensure_chat(bot.id.clone(), Some(foreign.id)).await;

		assert!(
			matches!(refused, Err(ConversationError::ForeignBot { .. })),
			"a bot was given a thread in a space it holds no membership in: {refused:?}"
		);
		assert_eq!(
			count_of(&database, "conversations").await,
			1,
			"the refused ask left a thread behind"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_solo_thread_of_a_bot_is_read_through_an_index() {
		let dir = temp_dir();
		let database = open(&dir);

		let plan = database
			.conversations()
			.call(|connection| {
				let mut statement =
					connection.prepare(&format!("EXPLAIN QUERY PLAN {SELECT_CHAT_OF_BOT}"))?;
				let steps = statement
					.query_map(params!["nobody", "personal"], |row| row.get::<_, String>(3))?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(steps)
			})
			.await
			.expect("the query plan");

		assert!(
			plan.iter().any(|step| step.contains("conversation_participants_of_bot")),
			"the solo thread lookup does not reach the seats through their index: {plan:?}"
		);
		assert!(
			!plan.iter().any(|step| step.contains("SCAN")),
			"the solo thread lookup scans a table: {plan:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_main_chat_of_a_bot_is_never_a_room_it_was_recruited_into() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let chat = repository.ensure_chat(bot.id.clone(), None).await.expect("the chat");
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &bot).await, &[&bot]))
			.await
			.expect("the room is opened");

		let again = repository.ensure_chat(bot.id, None).await.expect("the chat");
		repository.delete_conversation(room.id.clone()).await.expect("the room is deleted");
		let refused = repository.delete_conversation(chat.id.clone()).await;

		assert_eq!(again, chat, "the room was handed back as the chat of the bot");
		assert_ne!(again.id, room.id);
		assert!(
			format!("{refused:?}").contains("UnknownConversation"),
			"the chat of a bot was deleted as a room: {refused:?}"
		);
		assert_eq!(count_of(&database, "conversations").await, 1, "the room outlived its delete");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_room_seats_a_bot_holding_a_membership_of_its_space_and_refuses_one_holding_none() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let elsewhere = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let shared = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let stranger =
			repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		database
			.spaces()
			.add_bot(shared.id.clone(), elsewhere.id.clone(), None)
			.await
			.expect("the shared bot joins the second space");

		let room = repository
			.create_conversation(a_draft(&elsewhere.id, &[&shared]))
			.await
			.expect("the room seats the bot whose oldest membership is another space");
		let refused = repository.add_participant(room.id.clone(), stranger.id, None).await;

		assert_eq!(
			room.seats.iter().map(|seat| seat.bot_id.clone()).collect::<Vec<_>>(),
			vec![shared.id]
		);
		assert!(matches!(refused, Err(ConversationError::ForeignBot { .. })));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pin_named_without_a_space_is_refused_for_a_bot_holding_several() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let elsewhere = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let bot = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		database
			.spaces()
			.add_bot(bot.id.clone(), elsewhere.id.clone(), None)
			.await
			.expect("the bot joins the second space");

		let refused = repository.pin_bot(bot.id.clone()).await;

		assert!(matches!(refused, Err(ConversationError::SeveralSpaces { .. })));
		assert_eq!(
			repository
				.bots(Some(elsewhere.id))
				.await
				.expect("the bots")
				.into_iter()
				.map(|listed| listed.pin_position)
				.collect::<Vec<_>>(),
			vec![None],
			"a refused pin still landed on a membership"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn page_of(
		database: &Database,
		conversation_id: &str,
		before_seq: Option<i64>,
		limit: u32,
	) -> MessagePage {
		database
			.messages()
			.page_messages(MessagePageQuery {
				conversation_id: conversation_id.to_owned(),
				before_seq,
				limit,
			})
			.await
			.expect("the page is read")
	}

	async fn arrived(
		repository: &ConversationsRepository,
		room: &Conversation,
		bot: &Bot,
	) -> Arrival {
		repository
			.add_participant(room.id.clone(), bot.id.clone(), None)
			.await
			.expect("the bot joins the room")
			.arrival
			.expect("the arrival is recorded")
	}

	async fn arrived_again(
		repository: &ConversationsRepository,
		room: &Conversation,
		bot: &Bot,
	) -> Arrival {
		repository
			.remove_participant(room.id.clone(), bot.id.clone())
			.await
			.expect("the bot leaves");
		arrived(repository, room, bot).await
	}

	async fn a_room_of(database: &Database, names: &[&str]) -> (Conversation, Vec<Bot>) {
		let repository = database.conversations();
		let mut bots = Vec::new();
		for name in names {
			bots.push(repository.create_bot(an_identity(name), None, None).await.expect("the bot"));
		}
		let room = repository
			.create_conversation(a_draft(&home_of(repository, &bots[0]).await, &[&bots[0]]))
			.await
			.expect("the room is opened");
		(room, bots)
	}

	#[tokio::test]
	async fn an_arrival_comes_back_between_the_two_messages_around_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;
		spoke_in(&database, &room.id, &bots[0].id).await;
		spoke_in(&database, &room.id, &bots[0].id).await;
		let arrival = arrived(repository, &room, &bots[1]).await;
		spoke_in(&database, &room.id, &bots[0].id).await;

		let page = page_of(&database, &room.id, None, 10).await;
		let window = database
			.messages()
			.messages_around(MessagesAroundQuery {
				conversation_id: room.id.clone(),
				seq: 2,
				limit: 3,
			})
			.await
			.expect("the window is read")
			.expect("the window holds the message");

		assert_eq!((arrival.last_message_seq, arrival.invited_by_bot_id.clone()), (2, None));
		assert_eq!(page.messages.iter().map(|message| message.seq).collect::<Vec<_>>(), [1, 2, 3]);
		assert_eq!(page.arrivals, vec![arrival.clone()], "the page lost the arrival");
		assert_eq!(window.arrivals, vec![arrival], "the window lost the arrival");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn arrivals_at_the_same_place_come_back_in_the_same_order_on_every_read() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada", "Rex", "Kai"]).await;
		spoke_in(&database, &room.id, &bots[0].id).await;
		for bot in &bots[1..] {
			arrived(repository, &room, bot).await;
		}

		let first = page_of(&database, &room.id, None, 10).await.arrivals;
		let second = page_of(&database, &room.id, None, 10).await.arrivals;

		let mut ordered = first.clone();
		ordered.sort_by(|left, right| {
			(left.last_message_seq, left.created_at, &left.id).cmp(&(
				right.last_message_seq,
				right.created_at,
				&right.id,
			))
		});
		assert_eq!(first.len(), 3);
		assert_eq!(first, ordered, "the arrivals came back out of seq, time and id order");
		assert_eq!(first, second, "a second read reordered the arrivals");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_companion_arrives_again_only_after_it_left() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;

		arrived(repository, &room, &bots[1]).await;
		let seated_again = repository
			.add_participant(room.id.clone(), bots[1].id.clone(), None)
			.await
			.expect("the seated bot is seated again");
		let after_second_seat = page_of(&database, &room.id, None, 10).await.arrivals.len();
		arrived_again(repository, &room, &bots[1]).await;

		assert_eq!(seated_again.arrival, None, "a bot already seated arrived a second time");
		assert_eq!(after_second_seat, 1);
		assert_eq!(page_of(&database, &room.id, None, 10).await.arrivals.len(), 2);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_arrival_in_a_conversation_without_messages_comes_back_on_its_first_page() {
		let dir = temp_dir();
		let database = open(&dir);
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;

		let arrival = arrived(database.conversations(), &room, &bots[1]).await;
		let page = page_of(&database, &room.id, None, 20).await;

		assert_eq!(arrival.last_message_seq, 0);
		assert_eq!(page.arrivals, vec![arrival]);
		assert!(!page.has_more);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_walk_from_the_newest_page_returns_each_arrival_once() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;
		let mut written = vec![arrived(repository, &room, &bots[1]).await.id];
		for seq in 1..=7 {
			spoke_in(&database, &room.id, &bots[0].id).await;
			if [3, 4, 6, 7].contains(&seq) {
				written.push(arrived_again(repository, &room, &bots[1]).await.id);
			}
		}

		let mut walked = Vec::new();
		let mut before_seq = None;
		loop {
			let page = page_of(&database, &room.id, before_seq, 3).await;
			walked.extend(page.arrivals.into_iter().map(|arrival| arrival.id));
			if !page.has_more {
				break;
			}
			before_seq = page.messages.first().map(|message| message.seq);
		}

		written.sort();
		walked.sort();
		assert_eq!(walked, written, "the walk lost or repeated an arrival");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_window_with_messages_beyond_it_leaves_out_the_arrivals_beyond_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;
		arrived(repository, &room, &bots[1]).await;
		let mut inside = Vec::new();
		for seq in 1..=6 {
			spoke_in(&database, &room.id, &bots[0].id).await;
			match seq {
				3 => inside.push(arrived_again(repository, &room, &bots[1]).await),
				5 => {
					arrived_again(repository, &room, &bots[1]).await;
				}
				_ => {}
			}
		}

		let window = database
			.messages()
			.messages_around(MessagesAroundQuery {
				conversation_id: room.id.clone(),
				seq: 3,
				limit: 3,
			})
			.await
			.expect("the window is read")
			.expect("the window holds the message");

		assert_eq!(
			window.messages.iter().map(|message| message.seq).collect::<Vec<_>>(),
			[2, 3, 4]
		);
		assert!(window.has_older && window.has_newer);
		assert_eq!(window.arrivals, inside, "the window held an arrival beyond its messages");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_refused_seat_or_inviter_records_no_arrival_and_an_invitation_names_its_inviter() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;
		let elsewhere = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let stranger = repository
			.create_bot(an_identity("Rex"), Some(elsewhere.id), None)
			.await
			.expect("the bot");

		let foreign = repository.add_participant(room.id.clone(), stranger.id, None).await;
		let absent_inviter = repository
			.add_participant(room.id.clone(), bots[1].id.clone(), Some("nobody".to_owned()))
			.await;
		let arrivals_after_refusals = count_of(&database, "conversation_arrivals").await;
		let invited = repository
			.add_participant(room.id.clone(), bots[1].id.clone(), Some(bots[0].id.clone()))
			.await
			.expect("the bot is invited")
			.arrival
			.expect("the arrival is recorded");

		assert!(matches!(foreign, Err(ConversationError::ForeignBot { .. })));
		assert!(matches!(absent_inviter, Err(ConversationError::UnknownParticipant { .. })));
		assert_eq!(arrivals_after_refusals, 0, "a refused seat left an arrival behind");
		assert_eq!(invited.invited_by_bot_id, Some(bots[0].id.clone()));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_arrival_outlives_the_seat_of_the_companion_that_invited_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let (room, bots) = a_room_of(&database, &["Nyx", "Ada"]).await;
		let invited = repository
			.add_participant(room.id.clone(), bots[1].id.clone(), Some(bots[0].id.clone()))
			.await
			.expect("the bot is invited")
			.arrival
			.expect("the arrival is recorded");
		let (conversation_id, inviter_id) = (room.id.clone(), bots[0].id.clone());

		database
			.call_mut(move |connection| {
				Ok(connection.execute(
					"DELETE FROM conversation_participants
						WHERE conversation_id = ?1 AND bot_id = ?2",
					params![conversation_id, inviter_id],
				)?)
			})
			.await
			.expect("the inviter seat goes");

		assert_eq!(
			page_of(&database, &room.id, None, 10).await.arrivals,
			vec![invited],
			"the arrival went with the seat of its inviter"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
