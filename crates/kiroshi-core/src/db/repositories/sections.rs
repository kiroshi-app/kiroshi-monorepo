use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use uuid::Uuid;

use super::bot_spaces;
use crate::db::{Access, DatabaseError};

const SELECT_SECTION: &str =
	"SELECT id, space_id, name, position, created_at FROM sections WHERE id = ?1";

const SELECT_SECTIONS: &str = "SELECT id, space_id, name, position, created_at FROM sections
	WHERE space_id = ?1
	ORDER BY position ASC, id ASC";

const NEXT_PIN: &str = "SELECT COALESCE(MAX(rank), -1) + 1 FROM (
		SELECT position AS rank FROM sections WHERE space_id = ?1
		UNION ALL SELECT pin_position FROM bot_spaces WHERE space_id = ?1
		UNION ALL SELECT pin_position FROM conversations WHERE space_id = ?1)";

const UNPIN_BOTS: &str =
	"UPDATE bot_spaces SET pin_position = NULL, section_id = NULL WHERE space_id = ?1";

const UNPIN_CONVERSATIONS: &str =
	"UPDATE conversations SET pin_position = NULL, section_id = NULL WHERE space_id = ?1";

const SPACE_OF_SECTION: &str = "SELECT space_id FROM sections WHERE id = ?1";

#[derive(Debug)]
pub enum SectionError {
	Database(DatabaseError),
	UnknownSection { id: String },
	UnknownBot { id: String },
	SeveralSpaces { id: String },
	ForeignSpace { id: String },
	ForeignSection { id: String },
}

impl From<DatabaseError> for SectionError {
	fn from(error: DatabaseError) -> Self {
		Self::Database(error)
	}
}

impl From<rusqlite::Error> for SectionError {
	fn from(error: rusqlite::Error) -> Self {
		Self::Database(DatabaseError::Sqlite(error))
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RosterPin {
	pub id: String,
	pub section_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Section {
	pub id: String,
	pub space_id: String,
	pub name: String,
	pub position: i64,
	pub created_at: i64,
}

pub struct SectionsRepository {
	access: Access,
}

impl SectionsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn list(&self, space_id: String) -> Result<Vec<Section>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(SELECT_SECTIONS)?;
				let rows = statement.query_map([space_id], section)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
	}

	pub async fn create(&self, space_id: String, name: String) -> Result<Section, SectionError> {
		self.access.call_mut(move |connection| Ok(created(connection, &space_id, &name))).await?
	}

	pub async fn rename(&self, id: String, name: String) -> Result<Section, SectionError> {
		self.access.call_mut(move |connection| Ok(renamed(connection, &id, &name))).await?
	}

	pub async fn pin(&self, space_id: String, pins: Vec<RosterPin>) -> Result<(), SectionError> {
		self.access.call_mut(move |connection| Ok(pinned(connection, &space_id, &pins))).await?
	}

	pub async fn delete(&self, id: String) -> Result<(), SectionError> {
		self.access.call_mut(move |connection| Ok(deleted(connection, &id))).await?
	}

	pub async fn move_bot(
		&self,
		bot_id: String,
		section_id: Option<String>,
		space_id: Option<String>,
	) -> Result<(), SectionError> {
		self.access
			.call_mut(move |connection| {
				Ok(moved_bot(connection, &bot_id, section_id.as_deref(), space_id.as_deref()))
			})
			.await?
	}
}

fn created(
	connection: &mut Connection,
	space_id: &str,
	name: &str,
) -> Result<Section, SectionError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	transaction.execute(
		"INSERT INTO sections (id, space_id, name, position, created_at)
			VALUES (?1, ?2, ?3,
				(SELECT COALESCE(MAX(position) + 1, 0) FROM sections WHERE space_id = ?2), ?4)",
		params![id, space_id, name, now()],
	)?;
	let created = transaction.query_row(SELECT_SECTION, [&id], section)?;
	transaction.commit()?;
	Ok(created)
}

fn renamed(connection: &mut Connection, id: &str, name: &str) -> Result<Section, SectionError> {
	let transaction = write_transaction(connection)?;
	let written =
		transaction.execute("UPDATE sections SET name = ?2 WHERE id = ?1", params![id, name])?;
	refuse_if_untouched(written, id)?;
	let stored = transaction.query_row(SELECT_SECTION, [id], section)?;
	transaction.commit()?;
	Ok(stored)
}

fn pinned(
	connection: &mut Connection,
	space_id: &str,
	pins: &[RosterPin],
) -> Result<(), SectionError> {
	let transaction = write_transaction(connection)?;
	transaction.execute(UNPIN_BOTS, [space_id])?;
	transaction.execute(UNPIN_CONVERSATIONS, [space_id])?;
	for (position, pin) in pins.iter().enumerate() {
		let rank = position as i64;
		let touched = transaction.execute(
			"UPDATE sections SET position = ?3 WHERE id = ?1 AND space_id = ?2",
			params![pin.id, space_id, rank],
		)? + transaction.execute(
			"UPDATE bot_spaces SET pin_position = ?3, section_id = ?4
				WHERE bot_id = ?1 AND space_id = ?2",
			params![pin.id, space_id, rank, pin.section_id],
		)? + transaction.execute(
			"UPDATE conversations SET pin_position = ?3, section_id = ?4
				WHERE id = ?1 AND space_id = ?2",
			params![pin.id, space_id, rank, pin.section_id],
		)?;
		refuse_if_untouched(touched, &pin.id)?;
	}
	transaction.commit()?;
	Ok(())
}

fn deleted(connection: &mut Connection, id: &str) -> Result<(), SectionError> {
	let transaction = write_transaction(connection)?;
	let dropped = transaction.execute("DELETE FROM sections WHERE id = ?1", [id])?;
	refuse_if_untouched(dropped, id)?;
	transaction.commit()?;
	Ok(())
}

fn moved_bot(
	connection: &mut Connection,
	bot_id: &str,
	section_id: Option<&str>,
	space_id: Option<&str>,
) -> Result<(), SectionError> {
	let transaction = write_transaction(connection)?;
	let home = home_of_move(&transaction, bot_id, section_id, space_id)?;
	let pin = match section_id {
		Some(_) => Some(next_pin(&transaction, &home)?),
		None => None,
	};
	transaction.execute(
		"UPDATE bot_spaces SET section_id = ?3, pin_position = ?4
			WHERE bot_id = ?1 AND space_id = ?2",
		params![bot_id, home, section_id, pin],
	)?;
	transaction.commit()?;
	Ok(())
}

fn home_of_move(
	connection: &Connection,
	bot_id: &str,
	section_id: Option<&str>,
	space_id: Option<&str>,
) -> Result<String, SectionError> {
	let Some(section_id) = section_id else {
		return match space_id {
			Some(space_id) => space_the_bot_holds(connection, bot_id, space_id),
			None => only_space_of(connection, bot_id),
		};
	};
	let owner = space_of(connection, section_id)?
		.ok_or_else(|| SectionError::UnknownSection { id: section_id.to_owned() })?;
	match bot_spaces::held(connection, bot_id, &owner)? {
		true => Ok(owner),
		false => Err(SectionError::ForeignSection { id: section_id.to_owned() }),
	}
}

fn space_the_bot_holds(
	connection: &Connection,
	bot_id: &str,
	space_id: &str,
) -> Result<String, SectionError> {
	match bot_spaces::held(connection, bot_id, space_id)? {
		true => Ok(space_id.to_owned()),
		false => Err(SectionError::ForeignSpace { id: space_id.to_owned() }),
	}
}

fn only_space_of(connection: &Connection, bot_id: &str) -> Result<String, SectionError> {
	match bot_spaces::spaces_of(connection, bot_id)?.as_slice() {
		[] => Err(SectionError::UnknownBot { id: bot_id.to_owned() }),
		[only] => Ok(only.clone()),
		_ => Err(SectionError::SeveralSpaces { id: bot_id.to_owned() }),
	}
}

pub(in crate::db) fn next_pin(connection: &Connection, space_id: &str) -> rusqlite::Result<i64> {
	connection.query_row(NEXT_PIN, [space_id], |row| row.get(0))
}

pub(in crate::db) fn space_of(
	connection: &Connection,
	section_id: &str,
) -> rusqlite::Result<Option<String>> {
	connection.query_row(SPACE_OF_SECTION, [section_id], |row| row.get(0)).optional()
}

fn refuse_if_untouched(rows: usize, id: &str) -> Result<(), SectionError> {
	match rows {
		0 => Err(SectionError::UnknownSection { id: id.to_owned() }),
		_ => Ok(()),
	}
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn section(row: &Row<'_>) -> rusqlite::Result<Section> {
	Ok(Section {
		id: row.get("id")?,
		space_id: row.get("space_id")?,
		name: row.get("name")?,
		position: row.get("position")?,
		created_at: row.get("created_at")?,
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
	use crate::db::open;
	use crate::db::repositories::conversations::{Bot, BotIdentity};
	use crate::db::Database;

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

	fn at_top(id: &str) -> RosterPin {
		RosterPin { id: id.to_owned(), section_id: None }
	}

	async fn a_bot(database: &Database, name: &str, space_id: &str) -> Bot {
		database
			.conversations()
			.create_bot(an_identity(name), Some(space_id.to_owned()), None)
			.await
			.expect("the bot")
	}

	async fn section_of(database: &Database, bot_id: &str) -> Option<String> {
		database
			.conversations()
			.bot(bot_id.to_owned())
			.await
			.expect("the bot")
			.expect("the bot is on the record")
			.section_id
	}

	async fn only_space(database: &Database) -> String {
		database.spaces().list().await.expect("the spaces")[0].id.clone()
	}

	#[tokio::test]
	async fn a_created_section_lands_last_in_its_own_space() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let elsewhere = database.spaces().create("Vocca".to_owned()).await.expect("the space");

		let first = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		let second =
			sections.create(home.clone(), "Readers".to_owned()).await.expect("the section");
		let alone = sections
			.create(elsewhere.id.clone(), "Builders".to_owned())
			.await
			.expect("the section");

		assert_eq!((first.position, second.position), (0, 1));
		assert_eq!(alone.position, 0, "a section counted the sections of another space");
		assert_eq!(
			sections
				.list(home)
				.await
				.expect("the sections")
				.into_iter()
				.map(|section| section.name)
				.collect::<Vec<_>>(),
			vec!["Writers".to_owned(), "Readers".to_owned()]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_section_is_renamed_where_it_stands() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		let held = sections.create(home, "Readers".to_owned()).await.expect("the section");

		let written =
			sections.rename(held.id.clone(), "Editors".to_owned()).await.expect("the section");

		assert_eq!(written.name, "Editors");
		assert_eq!(written.position, held.position, "renaming a section moved it");
		assert!(matches!(
			sections.rename("nobody".to_owned(), "Editors".to_owned()).await,
			Err(SectionError::UnknownSection { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pin_stores_the_order_it_was_given() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let first = sections.create(home.clone(), "One".to_owned()).await.expect("the section");
		let second = sections.create(home.clone(), "Two".to_owned()).await.expect("the section");
		let third = sections.create(home.clone(), "Three".to_owned()).await.expect("the section");

		sections
			.pin(home.clone(), vec![at_top(&third.id), at_top(&first.id), at_top(&second.id)])
			.await
			.expect("the order is stored");

		assert_eq!(
			sections
				.list(home.clone())
				.await
				.expect("the sections")
				.into_iter()
				.map(|section| (section.name, section.position))
				.collect::<Vec<_>>(),
			vec![("Three".to_owned(), 0), ("One".to_owned(), 1), ("Two".to_owned(), 2)]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pin_holds_the_rows_it_names_and_frees_the_rows_it_leaves_out() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let held = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		let inside = a_bot(&database, "Nyx", &home).await;
		let outside = a_bot(&database, "Ovid", &home).await;

		sections
			.pin(
				home.clone(),
				vec![
					at_top(&held.id),
					RosterPin { id: inside.id.clone(), section_id: Some(held.id.clone()) },
				],
			)
			.await
			.expect("the pins are stored");

		let bots = database.conversations().bots(Some(home.clone())).await.expect("the bots");
		let pinned = bots.iter().find(|bot| bot.id == inside.id).expect("the pinned bot");
		let loose = bots.iter().find(|bot| bot.id == outside.id).expect("the loose bot");
		assert_eq!(pinned.pin_position, Some(1));
		assert_eq!(pinned.section_id, Some(held.id.clone()));
		assert_eq!(loose.pin_position, None, "a row the pin left out stayed pinned");

		sections.pin(home.clone(), vec![at_top(&held.id)]).await.expect("the pins are stored");

		let unpinned = database
			.conversations()
			.bots(Some(home))
			.await
			.expect("the bots")
			.into_iter()
			.find(|bot| bot.id == inside.id)
			.expect("the bot");
		assert_eq!(unpinned.pin_position, None);
		assert_eq!(unpinned.section_id, None, "an unpinned row stayed in its section");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pin_naming_a_section_of_another_space_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let elsewhere = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let held = sections.create(home.clone(), "One".to_owned()).await.expect("the section");
		let foreign = sections.create(elsewhere.id, "Two".to_owned()).await.expect("the section");

		let refused = sections.pin(home.clone(), vec![at_top(&foreign.id), at_top(&held.id)]).await;

		assert!(matches!(refused, Err(SectionError::UnknownSection { .. })));
		assert_eq!(
			sections.list(home).await.expect("the sections")[0].position,
			held.position,
			"a refused pin moved a section"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_deleted_section_leaves_the_bots_it_held_with_none() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let held = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		let bot = a_bot(&database, "Nyx", &home).await;
		sections
			.move_bot(bot.id.clone(), Some(held.id.clone()), None)
			.await
			.expect("the bot moves");

		sections.delete(held.id).await.expect("the section is deleted");

		assert_eq!(section_of(&database, &bot.id).await, None);
		assert!(sections.list(home).await.expect("the sections").is_empty());
		assert!(matches!(
			sections.delete("nobody".to_owned()).await,
			Err(SectionError::UnknownSection { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_moves_into_a_section_of_its_space_and_back_out() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let held = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		let bot = a_bot(&database, "Nyx", &home).await;

		assert_eq!(bot.section_id, None, "a created bot landed in a section");

		sections
			.move_bot(bot.id.clone(), Some(held.id.clone()), None)
			.await
			.expect("the bot moves");
		assert_eq!(section_of(&database, &bot.id).await, Some(held.id));

		sections.move_bot(bot.id.clone(), None, None).await.expect("the bot moves out");
		assert_eq!(section_of(&database, &bot.id).await, None);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_can_be_created_straight_into_a_section() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let held = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");

		let created = database
			.conversations()
			.create_bot(an_identity("Nyx"), Some(home), Some(held.id.clone()))
			.await
			.expect("the bot");

		assert_eq!(created.section_id, Some(held.id.clone()));
		assert_eq!(section_of(&database, &created.id).await, Some(held.id));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_section_of_another_space_leaves_the_bot_where_it_was() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let elsewhere = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let held = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		let foreign =
			sections.create(elsewhere.id, "Builders".to_owned()).await.expect("the section");
		let bot = a_bot(&database, "Nyx", &home).await;
		sections
			.move_bot(bot.id.clone(), Some(held.id.clone()), None)
			.await
			.expect("the bot moves");

		let refused = sections.move_bot(bot.id.clone(), Some(foreign.id), None).await;

		assert!(matches!(refused, Err(SectionError::ForeignSection { .. })));
		assert_eq!(section_of(&database, &bot.id).await, Some(held.id));
		assert!(matches!(
			sections.move_bot("nobody".to_owned(), None, None).await,
			Err(SectionError::UnknownBot { .. })
		));
		assert!(matches!(
			sections.move_bot(bot.id, Some("nowhere".to_owned()), None).await,
			Err(SectionError::UnknownSection { .. })
		));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_deleted_space_takes_the_sections_it_held_with_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let dropped = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let kept = sections.create(home.clone(), "Writers".to_owned()).await.expect("the section");
		sections.create(dropped.id.clone(), "Builders".to_owned()).await.expect("the section");

		database.spaces().delete(dropped.id.clone()).await.expect("the space is deleted");

		assert!(sections.list(dropped.id).await.expect("the sections").is_empty());
		assert_eq!(sections.list(home).await.expect("the sections"), vec![kept]);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_holding_two_spaces_moves_into_a_section_of_the_space_that_section_belongs_to() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let elsewhere = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let held =
			sections.create(elsewhere.id.clone(), "Writers".to_owned()).await.expect("the section");
		let bot = a_bot(&database, "Nyx", &home).await;
		database
			.spaces()
			.add_bot(bot.id.clone(), elsewhere.id.clone(), None)
			.await
			.expect("the bot joins the second space");

		sections
			.move_bot(bot.id.clone(), Some(held.id.clone()), None)
			.await
			.expect("the bot moves");

		assert_eq!(
			membership_of(&database, &bot.id, &elsewhere.id).await,
			(Some(held.id), Some(1)),
			"the move wrote neither the section nor the pin of that space"
		);
		assert_eq!(
			membership_of(&database, &bot.id, &home).await,
			(None, None),
			"the move reached the membership of another space"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_move_into_a_section_of_a_space_the_bot_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let elsewhere = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let foreign =
			sections.create(elsewhere.id, "Writers".to_owned()).await.expect("the section");
		let bot = a_bot(&database, "Nyx", &home).await;

		let refused = sections.move_bot(bot.id.clone(), Some(foreign.id), None).await;

		assert!(matches!(refused, Err(SectionError::ForeignSection { .. })), "got {refused:?}");
		assert_eq!(
			membership_of(&database, &bot.id, &home).await,
			(None, None),
			"a refused move wrote a section"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_move_out_of_every_section_clears_the_membership_of_the_space_it_names() {
		let dir = temp_dir();
		let database = open(&dir);
		let sections = database.sections();
		let home = only_space(&database).await;
		let elsewhere = database.spaces().create("Vocca".to_owned()).await.expect("the space");
		let held =
			sections.create(elsewhere.id.clone(), "Writers".to_owned()).await.expect("the section");
		let bot = a_bot(&database, "Nyx", &home).await;
		database
			.spaces()
			.add_bot(bot.id.clone(), elsewhere.id.clone(), Some(held.id))
			.await
			.expect("the bot joins the second space");

		sections
			.move_bot(bot.id.clone(), None, Some(elsewhere.id.clone()))
			.await
			.expect("the bot moves out");

		assert_eq!(membership_of(&database, &bot.id, &elsewhere.id).await, (None, None));
		assert!(matches!(
			sections.move_bot(bot.id.clone(), None, None).await,
			Err(SectionError::SeveralSpaces { .. })
		));
		let refused = sections.move_bot(bot.id.clone(), None, Some("nowhere".to_owned())).await;
		assert!(matches!(refused, Err(SectionError::ForeignSpace { .. })), "got {refused:?}");
		assert_eq!(
			membership_of(&database, &bot.id, &home).await,
			(None, None),
			"a refused move out reached a membership of that bot"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn membership_of(
		database: &Database,
		bot_id: &str,
		space_id: &str,
	) -> (Option<String>, Option<i64>) {
		database
			.conversations()
			.bots(Some(space_id.to_owned()))
			.await
			.expect("the bots")
			.into_iter()
			.find(|bot| bot.id == bot_id)
			.map(|bot| (bot.section_id, bot.pin_position))
			.expect("the bot stands in that space")
	}
}
