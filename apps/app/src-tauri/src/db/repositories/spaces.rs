use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use super::conversations::AvatarBlot;
use super::{bot_spaces, conversations, sections};
use crate::db::{Access, DatabaseError};

const SELECT_SPACE: &str =
	"SELECT id, name, colour, position, created_at FROM spaces WHERE id = ?1";

const SELECT_SPACES: &str = "SELECT id, name, colour, position, created_at FROM spaces
	ORDER BY position ASC, id ASC";

const BOTS_OF_ONLY_THIS_SPACE: &str = "SELECT bot_id FROM bot_spaces
	WHERE space_id = ?1 AND bot_id NOT IN
		(SELECT bot_id FROM bot_spaces WHERE space_id <> ?1)
	ORDER BY bot_id ASC";

#[derive(Debug)]
pub enum SpaceError {
	Database(DatabaseError),
	UnknownSpace { id: String },
	UnknownBot { id: String },
	IncompleteOrder,
	LastSpace,
	LastSpaceOfBot { id: String },
	ForeignSection { id: String },
}

impl From<DatabaseError> for SpaceError {
	fn from(error: DatabaseError) -> Self {
		Self::Database(error)
	}
}

impl From<rusqlite::Error> for SpaceError {
	fn from(error: rusqlite::Error) -> Self {
		Self::Database(DatabaseError::Sqlite(error))
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Space {
	pub id: String,
	pub name: String,
	pub colour: Option<AvatarBlot>,
	pub position: i64,
	pub created_at: i64,
}

pub struct SpacesRepository {
	access: Access,
}

impl SpacesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn list(&self) -> Result<Vec<Space>, DatabaseError> {
		self.access
			.call(|connection| {
				let mut statement = connection.prepare_cached(SELECT_SPACES)?;
				let rows = statement.query_map([], space)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
	}

	pub async fn create(&self, name: String) -> Result<Space, SpaceError> {
		self.access.call_mut(move |connection| Ok(created(connection, &name))).await?
	}

	pub async fn update(
		&self,
		id: String,
		name: String,
		colour: Option<AvatarBlot>,
	) -> Result<Space, SpaceError> {
		self.access.call_mut(move |connection| Ok(updated(connection, &id, &name, colour))).await?
	}

	pub async fn reorder(&self, ids: Vec<String>) -> Result<(), SpaceError> {
		self.access.call_mut(move |connection| Ok(reordered(connection, &ids))).await?
	}

	pub async fn delete(&self, id: String) -> Result<Vec<String>, SpaceError> {
		self.access.call_mut(move |connection| Ok(deleted(connection, &id))).await?
	}

	pub async fn move_bot(&self, bot_id: String, space_id: String) -> Result<(), SpaceError> {
		self.access
			.call_mut(move |connection| Ok(moved_bot(connection, &bot_id, &space_id)))
			.await?
	}

	pub async fn add_bot(
		&self,
		bot_id: String,
		space_id: String,
		section_id: Option<String>,
	) -> Result<(), SpaceError> {
		self.access
			.call_mut(move |connection| {
				Ok(added_bot(connection, &bot_id, &space_id, section_id.as_deref()))
			})
			.await?
	}

	pub async fn remove_bot(&self, bot_id: String, space_id: String) -> Result<(), SpaceError> {
		self.access
			.call_mut(move |connection| Ok(removed_bot(connection, &bot_id, &space_id)))
			.await?
	}
}

fn created(connection: &mut Connection, name: &str) -> Result<Space, SpaceError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	transaction.execute(
		"INSERT INTO spaces (id, name, position, created_at)
			VALUES (?1, ?2, (SELECT COALESCE(MAX(position) + 1, 0) FROM spaces), ?3)",
		params![id, name, now()],
	)?;
	let created = transaction.query_row(SELECT_SPACE, [&id], space)?;
	transaction.commit()?;
	Ok(created)
}

fn updated(
	connection: &mut Connection,
	id: &str,
	name: &str,
	colour: Option<AvatarBlot>,
) -> Result<Space, SpaceError> {
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE spaces SET name = ?2, colour = ?3 WHERE id = ?1",
		params![id, name, colour],
	)?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_SPACE, [id], space)?;
	transaction.commit()?;
	Ok(stored)
}

fn reordered(connection: &mut Connection, ids: &[String]) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	if distinct(ids) < counted(&transaction)? {
		return Err(SpaceError::IncompleteOrder);
	}
	for (position, id) in ids.iter().enumerate() {
		let written = transaction.execute(
			"UPDATE spaces SET position = ?2 WHERE id = ?1",
			params![id, position as i64],
		)?;
		refuse_if_untouched(written, id)?;
	}
	transaction.commit()?;
	Ok(())
}

fn deleted(connection: &mut Connection, id: &str) -> Result<Vec<String>, SpaceError> {
	let transaction = write_transaction(connection)?;
	if !held(&transaction, id)? {
		return Err(SpaceError::UnknownSpace { id: id.to_owned() });
	}
	if counted(&transaction)? <= 1 {
		return Err(SpaceError::LastSpace);
	}
	let cascaded = bots_of_only_this_space(&transaction, id)?;
	transaction.pragma_update(None, "defer_foreign_keys", true)?;
	for bot_id in &cascaded {
		transaction.execute(
			"DELETE FROM conversations WHERE (space_id = ?2 OR space_id IS NULL) AND id IN
				(SELECT conversation_id FROM conversation_participants WHERE bot_id = ?1)",
			params![bot_id, id],
		)?;
		conversations::retired_bot(&transaction, bot_id)?;
	}
	transaction.execute("DELETE FROM spaces WHERE id = ?1", [id])?;
	transaction.commit()?;
	Ok(cascaded)
}

fn bots_of_only_this_space(
	connection: &Connection,
	space_id: &str,
) -> Result<Vec<String>, SpaceError> {
	let mut statement = connection.prepare(BOTS_OF_ONLY_THIS_SPACE)?;
	let rows = statement.query_map([space_id], |row| row.get(0))?;
	Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn moved_bot(connection: &mut Connection, bot_id: &str, space_id: &str) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	let spaces = refuse_unknown_bot(&transaction, bot_id)?;
	if !held(&transaction, space_id)? {
		return Err(SpaceError::UnknownSpace { id: space_id.to_owned() });
	}
	bot_spaces::join(&transaction, bot_id, space_id, None, None)?;
	for left in spaces.iter().filter(|held| *held != space_id) {
		left_the_seats_of(&transaction, bot_id, left)?;
	}
	transaction.execute(
		"DELETE FROM bot_spaces WHERE bot_id = ?1 AND space_id <> ?2",
		params![bot_id, space_id],
	)?;
	transaction.commit()?;
	Ok(())
}

fn added_bot(
	connection: &mut Connection,
	bot_id: &str,
	space_id: &str,
	section_id: Option<&str>,
) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	refuse_unknown_bot(&transaction, bot_id)?;
	if !held(&transaction, space_id)? {
		return Err(SpaceError::UnknownSpace { id: space_id.to_owned() });
	}
	let pin = match section_id {
		Some(section_id) => {
			refuse_foreign_section(&transaction, space_id, section_id)?;
			Some(sections::next_pin(&transaction, space_id)?)
		}
		None => None,
	};
	bot_spaces::join(&transaction, bot_id, space_id, section_id, pin)?;
	transaction.commit()?;
	Ok(())
}

fn removed_bot(
	connection: &mut Connection,
	bot_id: &str,
	space_id: &str,
) -> Result<(), SpaceError> {
	let transaction = write_transaction(connection)?;
	let spaces = refuse_unknown_bot(&transaction, bot_id)?;
	if !spaces.iter().any(|held| held == space_id) {
		return Ok(());
	}
	if spaces.len() == 1 {
		return Err(SpaceError::LastSpaceOfBot { id: bot_id.to_owned() });
	}
	conversations::deleted_chat_in(&transaction, bot_id, space_id)?;
	left_the_seats_of(&transaction, bot_id, space_id)?;
	transaction.execute(
		"DELETE FROM bot_spaces WHERE bot_id = ?1 AND space_id = ?2",
		params![bot_id, space_id],
	)?;
	transaction.commit()?;
	Ok(())
}

fn refuse_foreign_section(
	connection: &Connection,
	space_id: &str,
	section_id: &str,
) -> Result<(), SpaceError> {
	match sections::space_of(connection, section_id)?.as_deref() == Some(space_id) {
		true => Ok(()),
		false => Err(SpaceError::ForeignSection { id: section_id.to_owned() }),
	}
}

fn left_the_seats_of(
	transaction: &Transaction<'_>,
	bot_id: &str,
	space_id: &str,
) -> Result<(), SpaceError> {
	transaction.execute(
		"UPDATE conversation_participants SET left_at = ?3
			WHERE bot_id = ?1 AND left_at IS NULL AND conversation_id IN
				(SELECT id FROM conversations WHERE space_id = ?2)",
		params![bot_id, space_id, now()],
	)?;
	Ok(())
}

fn refuse_unknown_bot(connection: &Connection, bot_id: &str) -> Result<Vec<String>, SpaceError> {
	let spaces = bot_spaces::spaces_of(connection, bot_id)?;
	match spaces.is_empty() {
		true => Err(SpaceError::UnknownBot { id: bot_id.to_owned() }),
		false => Ok(spaces),
	}
}

pub(super) fn held(connection: &Connection, id: &str) -> Result<bool, SpaceError> {
	Ok(connection
		.query_row("SELECT EXISTS (SELECT 1 FROM spaces WHERE id = ?1)", [id], |row| row.get(0))?)
}

fn distinct(ids: &[String]) -> i64 {
	ids.iter().collect::<HashSet<_>>().len() as i64
}

fn counted(connection: &Connection) -> Result<i64, SpaceError> {
	Ok(connection.query_row("SELECT count(*) FROM spaces", [], |row| row.get(0))?)
}

fn refuse_if_untouched(rows: usize, id: &str) -> Result<(), SpaceError> {
	match rows {
		0 => Err(SpaceError::UnknownSpace { id: id.to_owned() }),
		_ => Ok(()),
	}
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn space(row: &Row<'_>) -> rusqlite::Result<Space> {
	Ok(Space {
		id: row.get("id")?,
		name: row.get("name")?,
		colour: colour_of(row)?,
		position: row.get("position")?,
		created_at: row.get("created_at")?,
	})
}

fn colour_of(row: &Row<'_>) -> rusqlite::Result<Option<AvatarBlot>> {
	Ok(row.get::<_, Option<String>>("colour")?.as_deref().and_then(AvatarBlot::parse))
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::conversations::{Bot, BotIdentity, ConversationDraft};
	use crate::db::repositories::messages::{MessagePageQuery, NewAssistantMessage, NewTurn};
	use crate::db::{count_of, joined_on, open, Database};

	fn an_identity(name: &str) -> BotIdentity {
		BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: String::new(),
			denied_tools: Vec::new(),
			effort: None,
		}
	}

	async fn home_of(database: &Database, id: &str) -> String {
		database
			.conversations()
			.oldest_bot_space(id.to_owned())
			.await
			.expect("the space is read")
			.expect("the bot holds a membership")
	}

	async fn stored_bot(database: &Database, id: &str) -> Bot {
		database
			.conversations()
			.bot(id.to_owned())
			.await
			.expect("the bot")
			.expect("the bot is on the record")
	}

	#[tokio::test]
	async fn the_file_opens_holding_the_one_space_every_bot_belongs_to() {
		let dir = temp_dir();
		let database = open(&dir);

		let listed = database.spaces().list().await.expect("the spaces");

		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, "Personal");
		assert_eq!(listed[0].colour, Some(AvatarBlot::Red));
		assert_eq!(listed[0].position, 0);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_created_space_lands_after_the_last_one_wearing_no_tint() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();

		let second = repository.create("Vocca".to_owned()).await.expect("the space");
		let third = repository.create("Vacances".to_owned()).await.expect("the space");

		assert_eq!((second.position, second.colour), (1, None));
		assert_eq!((third.position, third.colour), (2, None));
		assert_eq!(
			repository
				.list()
				.await
				.expect("the spaces")
				.into_iter()
				.map(|space| space.name)
				.collect::<Vec<_>>(),
			vec!["Personal".to_owned(), "Vocca".to_owned(), "Vacances".to_owned()]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_space_wearing_a_colour_outside_the_palette_still_joins_the_listing() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call(|connection| {
				connection.execute_batch(
					"PRAGMA ignore_check_constraints = ON;
					UPDATE spaces SET colour = 'chartreuse' WHERE id = 'personal';",
				)?;
				Ok(())
			})
			.await
			.expect("the stained row");

		let listed = database.spaces().list().await.expect("the spaces");

		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].colour, None);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_space_is_renamed_and_retinted_in_one_go() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();
		let held = repository.create("Vocca".to_owned()).await.expect("the space");

		let written = repository
			.update(held.id.clone(), "Work".to_owned(), Some(AvatarBlot::Cyan))
			.await
			.expect("the space is written");

		assert_eq!((written.name.as_str(), written.colour), ("Work", Some(AvatarBlot::Cyan)));
		assert_eq!(written.position, held.position, "writing a space moved it");
		assert_eq!(
			repository
				.update(held.id.clone(), "Work".to_owned(), None)
				.await
				.expect("the space is written")
				.colour,
			None,
			"a space could not be stripped of its colour"
		);
		assert!(matches!(
			repository.update("nobody".to_owned(), "Work".to_owned(), None).await,
			Err(SpaceError::UnknownSpace { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn names_of(repository: &SpacesRepository) -> Vec<String> {
		repository.list().await.expect("the spaces").into_iter().map(|space| space.name).collect()
	}

	#[tokio::test]
	async fn a_written_order_ranks_the_spaces_and_leaves_the_next_one_last() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();
		let first = repository.list().await.expect("the spaces")[0].id.clone();
		let second = repository.create("Vocca".to_owned()).await.expect("the space");
		let third = repository.create("Vacances".to_owned()).await.expect("the space");

		repository
			.reorder(vec![third.id.clone(), first.clone(), second.id.clone()])
			.await
			.expect("the order is written");

		assert_eq!(
			repository
				.list()
				.await
				.expect("the spaces")
				.into_iter()
				.map(|space| (space.name, space.position))
				.collect::<Vec<_>>(),
			vec![("Vacances".to_owned(), 0), ("Personal".to_owned(), 1), ("Vocca".to_owned(), 2)]
		);

		let latest = repository.create("Perso".to_owned()).await.expect("the space");

		assert_eq!(latest.position, 3);

		repository.delete(first).await.expect("the space is deleted");

		assert_eq!(
			names_of(repository).await,
			vec!["Vacances".to_owned(), "Vocca".to_owned(), "Perso".to_owned()],
			"deleting a space shuffled the ones that remain"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_order_naming_a_stranger_or_leaving_a_space_out_writes_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.spaces();
		let second = repository.create("Vocca".to_owned()).await.expect("the space");

		assert!(matches!(
			repository.reorder(vec![second.id.clone(), "nobody".to_owned()]).await,
			Err(SpaceError::UnknownSpace { .. })
		));
		assert!(matches!(
			repository.reorder(vec![second.id.clone()]).await,
			Err(SpaceError::IncompleteOrder)
		));
		assert!(matches!(
			repository.reorder(vec![second.id.clone(), second.id.clone()]).await,
			Err(SpaceError::IncompleteOrder)
		));
		assert_eq!(
			names_of(repository).await,
			vec!["Personal".to_owned(), "Vocca".to_owned()],
			"a refused order moved the spaces"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_space_takes_its_bots_and_their_chats_with_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let kept = spaces.list().await.expect("the spaces")[0].id.clone();
		let dropped = spaces.create("Vocca".to_owned()).await.expect("the space");
		database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(kept), None)
			.await
			.expect("the kept bot");
		let held = database
			.conversations()
			.create_bot(an_identity("Ada"), Some(dropped.id.clone()), None)
			.await
			.expect("the bot of the space that goes");

		let cascaded = spaces.delete(dropped.id).await.expect("the space is deleted");

		assert_eq!(cascaded, vec![held.id]);

		assert_eq!(
			database
				.conversations()
				.bots(None)
				.await
				.expect("the bots")
				.into_iter()
				.map(|bot| bot.name)
				.collect::<Vec<_>>(),
			vec!["Nyx".to_owned()],
			"the bots of the space that went are still on the record"
		);
		assert_eq!(
			count_of(&database, "conversations").await,
			1,
			"the chats of the bots that went are still on the record"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_moved_bot_leaves_its_section_behind_and_keeps_everything_else() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let held = database
			.sections()
			.create(home.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), Some(held.id))
			.await
			.expect("the bot");

		spaces.move_bot(bot.id.clone(), elsewhere.id.clone()).await.expect("the bot moves");

		let moved = stored_bot(&database, &bot.id).await;
		assert_eq!(home_of(&database, &bot.id).await, elsewhere.id);
		assert_eq!(moved.section_id, None, "a moved bot carried a section of the space it left");
		assert_eq!(moved.name, bot.name, "a moved bot was renamed");
		assert!(
			database.conversations().bots(Some(home)).await.expect("the bots").is_empty(),
			"the space it left still lists it"
		);
		assert_eq!(
			database
				.conversations()
				.bots(Some(elsewhere.id))
				.await
				.expect("the bots")
				.into_iter()
				.map(|listed| listed.id)
				.collect::<Vec<_>>(),
			vec![bot.id],
			"the space it joined does not list it"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_moved_to_the_space_it_holds_stands_where_it_is() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let held = database
			.sections()
			.create(home.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), Some(held.id.clone()))
			.await
			.expect("the bot");

		spaces.move_bot(bot.id.clone(), home).await.expect("the bot stays");

		assert_eq!(
			stored_bot(&database, &bot.id).await.section_id,
			Some(held.id),
			"a bot moved to its own space lost its section"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_move_naming_no_bot_and_no_space_moves_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");

		assert!(matches!(
			spaces.move_bot("nobody".to_owned(), home.clone()).await,
			Err(SpaceError::UnknownBot { .. })
		));
		assert!(matches!(
			spaces.move_bot(bot.id.clone(), "nowhere".to_owned()).await,
			Err(SpaceError::UnknownSpace { .. })
		));
		assert_eq!(home_of(&database, &bot.id).await, home, "a refused move took the bot with it");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_last_space_standing_cannot_be_deleted() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let only = spaces.list().await.expect("the spaces")[0].id.clone();
		database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(only.clone()), None)
			.await
			.expect("the bot");

		let refused = spaces.delete(only.clone()).await;

		assert!(matches!(refused, Err(SpaceError::LastSpace)), "the last space was deleted");
		assert_eq!(spaces.list().await.expect("the spaces").len(), 1);
		assert_eq!(count_of(&database, "bots").await, 1, "a refused delete took a bot with it");
		assert!(matches!(
			spaces.delete("nobody".to_owned()).await,
			Err(SpaceError::UnknownSpace { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn memberships_of(database: &Database, bot_id: &str) -> Vec<String> {
		let bot_id = bot_id.to_owned();
		database
			.call(move |connection| Ok(bot_spaces::spaces_of(connection, &bot_id)?))
			.await
			.expect("the memberships")
	}

	async fn spoke_in(database: &Database, conversation_id: &str, bot_id: &str) {
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

	async fn roster_of(
		database: &Database,
		space_id: &str,
	) -> Vec<(String, Option<String>, Option<i64>)> {
		database
			.conversations()
			.bots(Some(space_id.to_owned()))
			.await
			.expect("the bots")
			.into_iter()
			.map(|bot| (bot.id, bot.section_id, bot.pin_position))
			.collect()
	}

	#[tokio::test]
	async fn a_bot_added_to_a_second_space_stands_in_both_rosters_under_its_own_section() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let writers = database
			.sections()
			.create(elsewhere.id.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");

		spaces
			.add_bot(bot.id.clone(), elsewhere.id.clone(), Some(writers.id.clone()))
			.await
			.expect("the bot joins the second space");
		joined_on(&database, &bot.id, &home, 1).await;
		joined_on(&database, &bot.id, &elsewhere.id, 2).await;

		assert_eq!(
			roster_of(&database, &elsewhere.id).await,
			vec![(bot.id.clone(), Some(writers.id), Some(1))],
			"the second space reads the bot without the section it joined under"
		);
		assert_eq!(
			roster_of(&database, &home).await,
			vec![(bot.id.clone(), None, None)],
			"joining a second space moved the bot in the first one"
		);
		assert_eq!(
			home_of(&database, &bot.id).await,
			home,
			"a bot read with no space named left its oldest membership"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_added_to_a_space_it_already_holds_keeps_that_membership_as_it_stands() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let writers = database
			.sections()
			.create(home.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), Some(writers.id.clone()))
			.await
			.expect("the bot");

		spaces.add_bot(bot.id.clone(), home.clone(), None).await.expect("the bot already belongs");

		assert_eq!(
			roster_of(&database, &home).await,
			vec![(bot.id.clone(), Some(writers.id), None)],
			"adding a bot again rewrote the membership it already held"
		);
		assert_eq!(memberships_of(&database, &bot.id).await, vec![home]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_removed_from_one_space_keeps_the_others_and_leaves_the_seats_it_held_there() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");
		spaces
			.add_bot(bot.id.clone(), elsewhere.id.clone(), None)
			.await
			.expect("the bot joins the second space");
		let room = database
			.conversations()
			.create_conversation(ConversationDraft {
				space_id: elsewhere.id.clone(),
				section_id: None,
				title: "Room".to_owned(),
				icon: None,
				bot_ids: vec![bot.id.clone()],
			})
			.await
			.expect("the room");

		spaces
			.remove_bot(bot.id.clone(), elsewhere.id.clone())
			.await
			.expect("the bot leaves the second space");

		assert_eq!(memberships_of(&database, &bot.id).await, vec![home.clone()]);
		assert!(roster_of(&database, &elsewhere.id).await.is_empty());
		let seats = database.conversations().seats(room.id).await.expect("the seats");
		assert!(
			seats.iter().all(|seat| seat.left_at.is_some()),
			"a seat of the space the bot left is still held: got {seats:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_removed_from_one_space_loses_the_solo_thread_it_held_there_and_no_other() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");
		spaces
			.add_bot(bot.id.clone(), elsewhere.id.clone(), None)
			.await
			.expect("the bot joins the second space");
		let kept = database
			.conversations()
			.ensure_chat(bot.id.clone(), Some(home))
			.await
			.expect("the thread of the first space");
		let dropped = database
			.conversations()
			.ensure_chat(bot.id.clone(), Some(elsewhere.id.clone()))
			.await
			.expect("the thread of the second space");
		spoke_in(&database, &dropped.id, &bot.id).await;

		spaces
			.remove_bot(bot.id.clone(), elsewhere.id.clone())
			.await
			.expect("the bot leaves the second space");

		let standing = database.conversations().conversation_ids().await.expect("the threads");
		assert!(
			!standing.contains(&dropped.id),
			"the solo thread of the space the bot left outlived the membership"
		);
		assert!(
			standing.contains(&kept.id),
			"the solo thread of the space the bot keeps went with the membership it lost"
		);
		assert_eq!(
			said_in(&database, &dropped.id).await,
			0,
			"the messages of the deleted thread are still readable"
		);
		assert_eq!(said_in(&database, &kept.id).await, 0);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_space_takes_the_solo_thread_a_surviving_bot_held_in_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let kept = spaces.list().await.expect("the spaces")[0].id.clone();
		let dropped = spaces.create("Vocca".to_owned()).await.expect("the space");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(kept.clone()), None)
			.await
			.expect("the bot");
		spaces
			.add_bot(bot.id.clone(), dropped.id.clone(), None)
			.await
			.expect("the bot joins the space that goes");
		let standing_thread = database
			.conversations()
			.ensure_chat(bot.id.clone(), Some(kept))
			.await
			.expect("the thread of the space that stays");
		let dying_thread = database
			.conversations()
			.ensure_chat(bot.id.clone(), Some(dropped.id.clone()))
			.await
			.expect("the thread of the space that goes");

		let cascaded = spaces.delete(dropped.id).await.expect("the space is deleted");

		let standing = database.conversations().conversation_ids().await.expect("the threads");
		assert!(cascaded.is_empty(), "a bot that holds another space was reported as cascaded");
		assert!(
			!standing.contains(&dying_thread.id),
			"the solo thread of the deleted space outlived it"
		);
		assert!(
			standing.contains(&standing_thread.id),
			"the solo thread of the space that stays went with the space that died"
		);
		assert_eq!(memberships_of(&database, &bot.id).await.len(), 1);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn removing_the_only_space_of_a_bot_is_refused_and_leaves_its_membership_standing() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");

		let refused = spaces.remove_bot(bot.id.clone(), home.clone()).await;

		assert!(matches!(refused, Err(SpaceError::LastSpaceOfBot { .. })), "got {refused:?}");
		assert_eq!(memberships_of(&database, &bot.id).await, vec![home]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn removing_a_bot_from_a_space_it_does_not_hold_writes_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");

		spaces.remove_bot(bot.id.clone(), elsewhere.id).await.expect("nothing to remove");

		assert_eq!(memberships_of(&database, &bot.id).await, vec![home]);
		assert!(matches!(
			spaces.remove_bot("nobody".to_owned(), "personal".to_owned()).await,
			Err(SpaceError::UnknownBot { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_space_a_shared_bot_holds_leaves_it_alive_in_the_one_that_remains() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let kept = spaces.list().await.expect("the spaces")[0].id.clone();
		let dropped = spaces.create("Vocca".to_owned()).await.expect("the space");
		let shared = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(kept.clone()), None)
			.await
			.expect("the shared bot");
		let alone = database
			.conversations()
			.create_bot(an_identity("Ada"), Some(dropped.id.clone()), None)
			.await
			.expect("the bot of the space that goes");
		spaces
			.add_bot(shared.id.clone(), dropped.id.clone(), None)
			.await
			.expect("the shared bot joins the space that goes");
		let main_chat = database
			.conversations()
			.ensure_chat(shared.id.clone(), None)
			.await
			.expect("the main chat of the shared bot");
		let kept_room = database
			.conversations()
			.create_conversation(ConversationDraft {
				space_id: kept.clone(),
				section_id: None,
				title: "Room".to_owned(),
				icon: None,
				bot_ids: vec![shared.id.clone()],
			})
			.await
			.expect("the room of the space that stays");

		let cascaded = spaces.delete(dropped.id).await.expect("the space is deleted");

		assert_eq!(cascaded, vec![alone.id], "the deletion answered a bot that is still alive");
		assert_eq!(memberships_of(&database, &shared.id).await, vec![kept.clone()]);
		assert!(
			database
				.conversations()
				.conversation_ids()
				.await
				.expect("the conversations")
				.contains(&main_chat.id),
			"the shared bot lost the main conversation it speaks in"
		);
		assert_eq!(
			database
				.conversations()
				.conversations(kept)
				.await
				.expect("the rooms")
				.into_iter()
				.map(|room| room.id)
				.collect::<Vec<_>>(),
			vec![kept_room.id],
			"the shared bot lost a conversation of the space that stays"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_added_under_a_section_of_another_space_is_refused_and_joins_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let foreign = database
			.sections()
			.create(home.clone(), "Writers".to_owned())
			.await
			.expect("the section");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");

		let refused = spaces.add_bot(bot.id.clone(), elsewhere.id.clone(), Some(foreign.id)).await;

		assert!(matches!(refused, Err(SpaceError::ForeignSection { .. })), "got {refused:?}");
		assert_eq!(memberships_of(&database, &bot.id).await, vec![home]);
		assert!(roster_of(&database, &elsewhere.id).await.is_empty());

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_space_spares_the_room_of_another_space_the_dying_bot_sat_in() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let dropped = spaces.list().await.expect("the spaces")[0].id.clone();
		let kept = spaces.create("Vocca".to_owned()).await.expect("the space");
		let dying = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(dropped.clone()), None)
			.await
			.expect("the bot of the space that goes");
		let standing = database
			.conversations()
			.create_bot(an_identity("Ada"), Some(kept.id.clone()), None)
			.await
			.expect("the bot of the space that stays");
		spaces
			.add_bot(dying.id.clone(), kept.id.clone(), None)
			.await
			.expect("the dying bot joins the space that stays");
		let room = database
			.conversations()
			.create_conversation(ConversationDraft {
				space_id: kept.id.clone(),
				section_id: None,
				title: "Room".to_owned(),
				icon: None,
				bot_ids: vec![dying.id.clone(), standing.id.clone()],
			})
			.await
			.expect("the room of the space that stays");
		spoke_in(&database, &room.id, &dying.id).await;
		let main_chat = database
			.conversations()
			.ensure_chat(dying.id.clone(), None)
			.await
			.expect("the main chat of the dying bot");
		spaces
			.remove_bot(dying.id.clone(), kept.id.clone())
			.await
			.expect("the dying bot leaves the space that stays");

		let cascaded = spaces.delete(dropped).await.expect("the space is deleted");

		assert_eq!(cascaded, vec![dying.id.clone()]);
		assert_eq!(
			database
				.conversations()
				.conversations(kept.id)
				.await
				.expect("the rooms")
				.into_iter()
				.map(|room| room.id)
				.collect::<Vec<_>>(),
			vec![room.id.clone()],
			"the room of the space that stays went with the space that died"
		);
		assert!(
			!database
				.conversations()
				.conversation_ids()
				.await
				.expect("the conversations")
				.contains(&main_chat.id),
			"the main chat of the dying bot outlived it"
		);
		assert_eq!(said_in(&database, &room.id).await, 1, "the room lost the words spoken in it");
		assert_eq!(
			database
				.conversations()
				.seats(room.id)
				.await
				.expect("the seats")
				.into_iter()
				.filter(|seat| seat.left_at.is_none())
				.map(|seat| seat.bot_id)
				.collect::<Vec<_>>(),
			vec![standing.id],
			"the seat the standing bot holds went with the space that died"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_moved_bot_holds_no_seat_in_the_rooms_of_the_space_it_left() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let elsewhere = spaces.create("Vocca".to_owned()).await.expect("the space");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home.clone()), None)
			.await
			.expect("the bot");
		let room = database
			.conversations()
			.create_conversation(ConversationDraft {
				space_id: home,
				section_id: None,
				title: "Room".to_owned(),
				icon: None,
				bot_ids: vec![bot.id.clone()],
			})
			.await
			.expect("the room of the space it leaves");

		spaces.move_bot(bot.id.clone(), elsewhere.id.clone()).await.expect("the bot moves");

		assert_eq!(memberships_of(&database, &bot.id).await, vec![elsewhere.id]);
		let seats = database.conversations().seats(room.id).await.expect("the seats");
		assert!(
			seats.iter().all(|seat| seat.left_at.is_some()),
			"a seat of the space the bot left is still held: got {seats:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_moved_bot_comes_out_holding_that_one_space() {
		let dir = temp_dir();
		let database = open(&dir);
		let spaces = database.spaces();
		let home = spaces.list().await.expect("the spaces")[0].id.clone();
		let second = spaces.create("Vocca".to_owned()).await.expect("the space");
		let third = spaces.create("Vacances".to_owned()).await.expect("the space");
		let bot = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home), None)
			.await
			.expect("the bot");
		spaces.add_bot(bot.id.clone(), second.id.clone(), None).await.expect("the bot joins");

		spaces.move_bot(bot.id.clone(), third.id.clone()).await.expect("the bot moves");

		assert_eq!(memberships_of(&database, &bot.id).await, vec![third.id]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
