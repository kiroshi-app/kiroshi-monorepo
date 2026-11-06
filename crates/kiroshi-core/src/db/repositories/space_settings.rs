use std::sync::LazyLock;

use rusqlite::{Connection, Transaction, TransactionBehavior};

use super::settings::Settings;
use super::spaces::{held, SpaceError};
use crate::db::{Access, DatabaseError};

const COLLAPSED_SECTION_IDS_KEY: &str = "space.collapsed_section_ids";

static SETTINGS: LazyLock<Settings> =
	LazyLock::new(|| Settings::new("space_settings", Some("space_id")));

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Preferences {
	pub collapsed_section_ids: Vec<String>,
}

pub struct SpaceSettingsRepository {
	access: Access,
}

impl SpaceSettingsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn preferences(&self, space_id: String) -> Result<Preferences, DatabaseError> {
		self.access.call(move |connection| stored_in(connection, &space_id)).await
	}

	pub async fn set_preferences(
		&self,
		space_id: String,
		preferences: Preferences,
	) -> Result<Preferences, SpaceError> {
		self.access
			.call_mut(move |connection| Ok(written(connection, &space_id, &preferences)))
			.await?
	}
}

fn written(
	connection: &mut Connection,
	space_id: &str,
	preferences: &Preferences,
) -> Result<Preferences, SpaceError> {
	let transaction = write_transaction(connection)?;
	if !held(&transaction, space_id)? {
		return Err(SpaceError::UnknownSpace { id: space_id.to_owned() });
	}
	let collapsed = serde_json::to_string(&preferences.collapsed_section_ids).unwrap_or_default();
	SETTINGS.write(&transaction, Some(space_id), COLLAPSED_SECTION_IDS_KEY, &collapsed)?;
	let stored = stored_in(&transaction, space_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn stored_in(connection: &Connection, space_id: &str) -> Result<Preferences, DatabaseError> {
	let stored = SETTINGS.read(connection, Some(space_id), COLLAPSED_SECTION_IDS_KEY)?;
	Ok(Preferences {
		collapsed_section_ids: stored
			.and_then(|value| serde_json::from_str(&value).ok())
			.unwrap_or_default(),
	})
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open, Database};

	const PERSONAL: &str = "personal";

	fn a_record() -> Preferences {
		Preferences {
			collapsed_section_ids: vec!["section-one".to_owned(), "section-two".to_owned()],
		}
	}

	async fn plant(database: &Database, value: &'static str) {
		database
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, Some(PERSONAL), COLLAPSED_SECTION_IDS_KEY, value)?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");
	}

	#[tokio::test]
	async fn a_space_nobody_has_written_to_reads_as_no_collapsed_section() {
		let dir = temp_dir();
		let database = open(&dir);

		let read =
			database.space_settings().preferences(PERSONAL.to_owned()).await.expect("the record");

		assert_eq!(read, Preferences { collapsed_section_ids: Vec::new() });
	}

	#[tokio::test]
	async fn a_written_record_is_answered_and_read_back_whole() {
		let dir = temp_dir();
		let database = open(&dir);

		let answered = database
			.space_settings()
			.set_preferences(PERSONAL.to_owned(), a_record())
			.await
			.expect("the write");

		assert_eq!(answered, a_record());
		assert_eq!(
			database.space_settings().preferences(PERSONAL.to_owned()).await.expect("the record"),
			a_record()
		);
	}

	#[tokio::test]
	async fn a_record_is_held_apart_for_every_space() {
		let dir = temp_dir();
		let database = open(&dir);
		let other = database.spaces().create("Second".to_owned()).await.expect("the space");

		database
			.space_settings()
			.set_preferences(PERSONAL.to_owned(), a_record())
			.await
			.expect("the write");

		let read = database.space_settings().preferences(other.id).await.expect("the other record");

		assert_eq!(read, Preferences::default());
	}

	#[tokio::test]
	async fn dropping_a_space_drops_the_settings_it_held() {
		let dir = temp_dir();
		let database = open(&dir);
		let other = database.spaces().create("Second".to_owned()).await.expect("the space");
		database
			.space_settings()
			.set_preferences(other.id.clone(), a_record())
			.await
			.expect("the write");

		database.spaces().delete(other.id).await.expect("the deletion");

		assert_eq!(count_of(&database, "space_settings").await, 0);
	}

	#[tokio::test]
	async fn a_value_that_cannot_be_read_reads_as_no_collapsed_section() {
		let dir = temp_dir();
		let database = open(&dir);
		plant(&database, "{not json").await;

		let read =
			database.space_settings().preferences(PERSONAL.to_owned()).await.expect("the record");

		assert_eq!(read.collapsed_section_ids, Vec::<String>::new());
	}

	#[tokio::test]
	async fn a_write_to_a_space_nobody_holds_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);

		let refused =
			database.space_settings().set_preferences("nowhere".to_owned(), a_record()).await;

		assert!(matches!(refused, Err(SpaceError::UnknownSpace { .. })));
		assert_eq!(count_of(&database, "space_settings").await, 0);
	}
}
