use rusqlite::{params, Connection, OptionalExtension};

use super::conversations::Hue;
use super::spaces::{colour_of, SpaceError};
use crate::db::{Access, DatabaseError};

const SELECT_REGISTRATION: &str = "SELECT spaces.name, spaces.colour, space_hosting.instance_id
	FROM spaces LEFT JOIN space_hosting ON space_hosting.space_id = spaces.id
	WHERE spaces.id = ?1";

const UPSERT_INSTANCE: &str = "INSERT INTO space_hosting (space_id, instance_id, is_hosted)
	VALUES (?1, ?2, 1)
	ON CONFLICT (space_id) DO UPDATE SET instance_id = excluded.instance_id";

const UPSERT_HOSTED: &str = "INSERT INTO space_hosting (space_id, instance_id, is_hosted)
	VALUES (?1, NULL, ?2)
	ON CONFLICT (space_id) DO UPDATE SET is_hosted = excluded.is_hosted";

const SELECT_HOSTED: &str =
	"SELECT space_id FROM space_hosting WHERE is_hosted = 1 ORDER BY space_id ASC";

const SELECT_HOSTINGS: &str =
	"SELECT space_id, instance_id, is_hosted FROM space_hosting ORDER BY space_id ASC";

const SELECT_REGISTERED_INSTANCES: &str =
	"SELECT instance_id FROM space_hosting WHERE instance_id IS NOT NULL ORDER BY instance_id ASC";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Registration {
	pub name: String,
	pub colour: Option<Hue>,
	pub instance_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hosting {
	pub space_id: String,
	pub instance_id: Option<String>,
	pub is_hosted: bool,
}

pub struct SpaceHostingRepository {
	access: Access,
}

impl SpaceHostingRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn registration(&self, space_id: String) -> Result<Registration, SpaceError> {
		self.access.call(move |connection| Ok(registration_of(connection, &space_id))).await?
	}

	pub async fn registered(
		&self,
		space_id: String,
		instance_id: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				connection.execute(UPSERT_INSTANCE, params![space_id, instance_id])?;
				Ok(())
			})
			.await
	}

	pub async fn set_hosted(&self, space_id: String, is_hosted: bool) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				connection.execute(UPSERT_HOSTED, params![space_id, is_hosted])?;
				Ok(())
			})
			.await
	}

	pub async fn hosted_space_ids(&self) -> Result<Vec<String>, DatabaseError> {
		self.access
			.call(|connection| {
				let mut statement = connection.prepare_cached(SELECT_HOSTED)?;
				let ids = statement.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?;
				Ok(ids)
			})
			.await
	}

	pub async fn hostings(&self) -> Result<Vec<Hosting>, DatabaseError> {
		self.access
			.call(|connection| {
				let mut statement = connection.prepare_cached(SELECT_HOSTINGS)?;
				let hostings = statement
					.query_map([], |row| {
						Ok(Hosting {
							space_id: row.get(0)?,
							instance_id: row.get(1)?,
							is_hosted: row.get(2)?,
						})
					})?
					.collect::<Result<_, _>>()?;
				Ok(hostings)
			})
			.await
	}

	pub async fn registered_instance_ids(&self) -> Result<Vec<String>, DatabaseError> {
		self.access
			.call(|connection| {
				let mut statement = connection.prepare_cached(SELECT_REGISTERED_INSTANCES)?;
				let ids = statement.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?;
				Ok(ids)
			})
			.await
	}
}

fn registration_of(connection: &Connection, space_id: &str) -> Result<Registration, SpaceError> {
	connection
		.query_row(SELECT_REGISTRATION, [space_id], |row| {
			Ok(Registration {
				name: row.get(0)?,
				colour: colour_of(row, 1)?,
				instance_id: row.get(2)?,
			})
		})
		.optional()?
		.ok_or_else(|| SpaceError::UnknownSpace { id: space_id.to_owned() })
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::open;

	const PERSONAL: &str = "personal";

	#[tokio::test]
	async fn a_space_never_hosted_reads_its_name_its_colour_and_no_instance() {
		let dir = temp_dir();
		let database = open(&dir);

		let read = database.space_hosting().registration(PERSONAL.to_owned()).await;

		assert_eq!(
			read.expect("the registration reads"),
			Registration { name: "Personal".to_owned(), colour: None, instance_id: None }
		);
	}

	#[tokio::test]
	async fn an_unknown_space_is_named_as_unknown() {
		let dir = temp_dir();
		let database = open(&dir);

		let read = database.space_hosting().registration("missing".to_owned()).await;

		assert!(matches!(read, Err(SpaceError::UnknownSpace { id }) if id == "missing"));
	}

	#[tokio::test]
	async fn a_cleared_flag_survives_a_replaced_instance() {
		let dir = temp_dir();
		let database = open(&dir);
		let hosting = database.space_hosting();

		hosting.registered(PERSONAL.to_owned(), "i1".to_owned()).await.expect("stored");
		let hosted = hosting.hosted_space_ids().await.expect("listed");
		hosting.set_hosted(PERSONAL.to_owned(), false).await.expect("cleared");
		let cleared = hosting.hosted_space_ids().await.expect("listed");
		hosting.registered(PERSONAL.to_owned(), "i2".to_owned()).await.expect("replaced");

		assert_eq!(hosted, vec![PERSONAL.to_owned()]);
		assert!(cleared.is_empty());
		assert_eq!(
			hosting.registration(PERSONAL.to_owned()).await.expect("read").instance_id.as_deref(),
			Some("i2")
		);
		assert!(hosting.hosted_space_ids().await.expect("listed").is_empty());
	}

	#[tokio::test]
	async fn an_intent_is_hosted_without_an_instance_until_one_is_registered() {
		let dir = temp_dir();
		let database = open(&dir);
		let hosting = database.space_hosting();

		hosting.set_hosted(PERSONAL.to_owned(), true).await.expect("the intent is kept");
		let intended = hosting.registration(PERSONAL.to_owned()).await.expect("read");
		hosting.registered(PERSONAL.to_owned(), "i1".to_owned()).await.expect("stored");

		assert_eq!(intended.instance_id, None);
		assert_eq!(hosting.hosted_space_ids().await.expect("listed"), vec![PERSONAL.to_owned()]);
		assert_eq!(
			hosting.registration(PERSONAL.to_owned()).await.expect("read").instance_id.as_deref(),
			Some("i1")
		);
	}

	#[tokio::test]
	async fn only_a_space_with_a_registered_instance_lists_its_instance() {
		let dir = temp_dir();
		let database = open(&dir);
		let hosting = database.space_hosting();

		hosting.set_hosted(PERSONAL.to_owned(), true).await.expect("the intent is kept");
		let intended = hosting.registered_instance_ids().await.expect("listed");
		hosting.registered(PERSONAL.to_owned(), "i1".to_owned()).await.expect("stored");

		assert!(intended.is_empty());
		assert_eq!(hosting.registered_instance_ids().await.expect("listed"), vec!["i1".to_owned()]);
	}

	#[tokio::test]
	async fn a_hosting_keeps_its_instance_once_the_space_stops_being_hosted() {
		let dir = temp_dir();
		let database = open(&dir);
		let hosting = database.space_hosting();

		let untouched = hosting.hostings().await.expect("listed");
		hosting.registered(PERSONAL.to_owned(), "i1".to_owned()).await.expect("stored");
		hosting.set_hosted(PERSONAL.to_owned(), false).await.expect("cleared");

		assert!(untouched.is_empty());
		assert_eq!(
			hosting.hostings().await.expect("listed"),
			vec![Hosting {
				space_id: PERSONAL.to_owned(),
				instance_id: Some("i1".to_owned()),
				is_hosted: false
			}]
		);
	}
}
