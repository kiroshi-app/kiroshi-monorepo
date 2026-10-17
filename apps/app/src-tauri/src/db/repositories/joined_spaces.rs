use std::sync::LazyLock;

use rusqlite::types::Type;
use rusqlite::{Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::settings::Settings;
use crate::db::{Access, DatabaseError};

const JOINED_SPACES_KEY: &str = "app.joined_spaces";

const UNREADABLE_LIST: &str = "the joined spaces setting does not read as a list of records";

static SETTINGS: LazyLock<Settings> = LazyLock::new(|| Settings::new("app_settings", None));

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpace {
	pub id: String,
	#[serde(flatten)]
	pub reach: JoinedReach,
	pub remote_space_id: Option<String>,
	pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JoinedReach {
	#[serde(rename_all = "camelCase")]
	Relay { instance_id: String },
}

impl JoinedSpace {
	fn reaches_the_same_space_as(&self, other: &JoinedSpace) -> bool {
		let (JoinedReach::Relay { instance_id }, JoinedReach::Relay { instance_id: other_id }) =
			(&self.reach, &other.reach);
		instance_id == other_id
	}
}

pub struct JoinedSpacesRepository {
	access: Access,
}

impl JoinedSpacesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn list(&self) -> Result<Vec<JoinedSpace>, DatabaseError> {
		self.access.call(stored_in).await
	}

	pub async fn find(&self, id: String) -> Result<Option<JoinedSpace>, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(stored_in(connection)?.into_iter().find(|joined| joined.id == id))
			})
			.await
	}

	pub async fn join(&self, candidate: JoinedSpace) -> Result<JoinedSpace, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction =
					connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
				let mut stored = stored_in(&transaction)?;
				let joined =
					match stored.iter_mut().find(|held| held.reaches_the_same_space_as(&candidate))
					{
						Some(held) => {
							held.reach = candidate.reach;
							held.name = candidate.name;
							held.remote_space_id =
								candidate.remote_space_id.or(held.remote_space_id.take());
							held.clone()
						}
						None => {
							stored.push(candidate.clone());
							candidate
						}
					};
				write_in(&transaction, &stored)?;
				transaction.commit()?;
				Ok(joined)
			})
			.await
	}

	pub async fn learned(
		&self,
		id: String,
		remote_space_id: String,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction =
					connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
				let mut stored = stored_in(&transaction)?;
				let Some(held) = stored.iter_mut().find(|joined| joined.id == id) else {
					return Ok(false);
				};
				held.remote_space_id = Some(remote_space_id);
				write_in(&transaction, &stored)?;
				transaction.commit()?;
				Ok(true)
			})
			.await
	}

	pub async fn remove(&self, id: String) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction =
					connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
				let mut stored = stored_in(&transaction)?;
				let held = stored.len();
				stored.retain(|joined| joined.id != id);
				if stored.len() == held {
					return Ok(false);
				}
				write_in(&transaction, &stored)?;
				super::joined_space_members::forgotten_in(&transaction, &id)?;
				transaction.commit()?;
				Ok(true)
			})
			.await
	}
}

pub(super) fn stored_in(connection: &Connection) -> Result<Vec<JoinedSpace>, DatabaseError> {
	let Some(stored) = SETTINGS.read(connection, None, JOINED_SPACES_KEY)? else {
		return Ok(Vec::new());
	};
	let records: Vec<Value> = serde_json::from_str(&stored).map_err(|_| unreadable_list())?;
	records
		.into_iter()
		.filter(|record| !is_link_reached(record))
		.map(|record| serde_json::from_value(record).map_err(|_| unreadable_list()))
		.collect()
}

fn is_link_reached(record: &Value) -> bool {
	["hostUrl", "token"].iter().all(|key| record.get(key).is_some())
		&& record.get("instanceId").is_none()
}

fn write_in(connection: &Connection, joined: &[JoinedSpace]) -> Result<(), DatabaseError> {
	let stored = serde_json::to_string(joined)
		.map_err(|error| rusqlite::Error::ToSqlConversionFailure(error.into()))?;
	SETTINGS.write(connection, None, JOINED_SPACES_KEY, &stored)
}

fn unreadable_list() -> DatabaseError {
	rusqlite::Error::FromSqlConversionFailure(0, Type::Text, UNREADABLE_LIST.into()).into()
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};

	const LINK_RECORD: &str = r#"{"id":"link","hostUrl":"http://link.test","token":"token-of-link","remoteSpaceId":null,"name":"name-of-link"}"#;

	fn a_relay_space(id: &str, instance_id: &str) -> JoinedSpace {
		JoinedSpace {
			id: id.to_owned(),
			reach: JoinedReach::Relay { instance_id: instance_id.to_owned() },
			remote_space_id: None,
			name: format!("name-of-{id}"),
		}
	}

	fn with_remote(joined: JoinedSpace, remote_space_id: &str) -> JoinedSpace {
		JoinedSpace { remote_space_id: Some(remote_space_id.to_owned()), ..joined }
	}

	async fn write_raw(database: &Database, value: String) {
		database
			.call(move |connection| SETTINGS.write(connection, None, JOINED_SPACES_KEY, &value))
			.await
			.expect("the raw write");
	}

	async fn read_raw(database: &Database) -> Option<String> {
		database
			.call(|connection| SETTINGS.read(connection, None, JOINED_SPACES_KEY))
			.await
			.expect("the raw read")
	}

	async fn holding_a_link_and_a_relay_record(database: &Database) {
		let relay = serde_json::to_string(&a_relay_space("relay", "instance-1")).expect("json");
		write_raw(database, format!("[{LINK_RECORD},{relay}]")).await;
	}

	#[tokio::test]
	async fn joined_spaces_nobody_has_added_read_as_an_empty_list() {
		let dir = temp_dir();
		let database = open(&dir);

		assert!(database.joined_spaces().list().await.expect("the list").is_empty());
	}

	#[tokio::test]
	async fn joined_spaces_are_listed_in_insertion_order_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			for joined in [
				a_relay_space("b", "instance-b"),
				with_remote(a_relay_space("a", "instance-a"), "space-a"),
			] {
				database.joined_spaces().join(joined).await.expect("the join");
			}
		}

		let database = open(&dir);

		assert_eq!(
			database.joined_spaces().list().await.expect("the list"),
			vec![
				a_relay_space("b", "instance-b"),
				with_remote(a_relay_space("a", "instance-a"), "space-a"),
			]
		);
	}

	#[tokio::test]
	async fn a_joined_space_reaching_a_stored_one_replaces_its_name_and_keeps_its_id() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.joined_spaces();
		let first = with_remote(a_relay_space("first", "instance-a"), "s");
		repository.join(first.clone()).await.expect("first");
		repository.join(a_relay_space("other", "instance-b")).await.expect("other");

		let joined = repository
			.join(JoinedSpace {
				name: "Fresh".to_owned(),
				..with_remote(a_relay_space("second", "instance-a"), "s")
			})
			.await
			.expect("the second join");

		let replaced = JoinedSpace { name: "Fresh".to_owned(), ..first };
		assert_eq!(joined, replaced);
		assert_eq!(
			repository.list().await.expect("the list"),
			vec![replaced, a_relay_space("other", "instance-b")]
		);
	}

	#[tokio::test]
	async fn a_link_record_is_dropped_from_every_read_and_the_relay_record_beside_it_kept() {
		let dir = temp_dir();
		let database = open(&dir);
		holding_a_link_and_a_relay_record(&database).await;
		let repository = database.joined_spaces();

		assert_eq!(
			repository.list().await.expect("the list"),
			vec![a_relay_space("relay", "instance-1")]
		);
		assert_eq!(repository.find("link".to_owned()).await.expect("the find"), None);
		assert!(!repository.learned("link".to_owned(), "s".to_owned()).await.expect("learned"));
		assert!(!repository.remove("link".to_owned()).await.expect("the removal"));
	}

	#[tokio::test]
	async fn the_next_join_persists_the_list_without_the_link_record_nor_its_token() {
		let dir = temp_dir();
		let database = open(&dir);
		holding_a_link_and_a_relay_record(&database).await;

		database.joined_spaces().join(a_relay_space("next", "instance-2")).await.expect("the join");

		let stored = read_raw(&database).await.expect("the stored list");
		for dropped in ["\"link\"", "http://link.test", "token-of-link"] {
			assert!(!stored.contains(dropped), "{stored}");
		}
		assert_eq!(
			database.joined_spaces().list().await.expect("the list"),
			vec![a_relay_space("relay", "instance-1"), a_relay_space("next", "instance-2")]
		);
	}

	#[tokio::test]
	async fn a_relay_entry_is_stored_with_its_instance_and_rejoined_under_the_same_id() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.joined_spaces();
		repository.join(a_relay_space("first", "instance-1")).await.expect("the first join");
		assert!(repository
			.learned("first".to_owned(), "shared".to_owned())
			.await
			.expect("the learned space"));

		let rejoined = repository
			.join(JoinedSpace {
				name: "Renamed".to_owned(),
				..a_relay_space("second", "instance-1")
			})
			.await
			.expect("the second join");

		let expected = JoinedSpace {
			name: "Renamed".to_owned(),
			..with_remote(a_relay_space("first", "instance-1"), "shared")
		};
		assert_eq!(rejoined, expected);
		assert_eq!(repository.list().await.expect("the list"), vec![expected]);
		assert!(!repository.learned("z".to_owned(), "s".to_owned()).await.expect("no entry"));
	}

	#[tokio::test]
	async fn a_removed_joined_space_leaves_the_others_and_an_unknown_id_removes_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.joined_spaces();
		repository.join(a_relay_space("a", "instance-a")).await.expect("a");
		repository.join(a_relay_space("b", "instance-b")).await.expect("b");

		assert!(repository.remove("a".to_owned()).await.expect("the removal"));
		assert!(!repository.remove("a".to_owned()).await.expect("the second removal"));
		assert_eq!(
			repository.list().await.expect("the list"),
			vec![a_relay_space("b", "instance-b")]
		);
	}

	#[tokio::test]
	async fn a_joined_space_is_found_by_its_id_with_its_instance() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.joined_spaces();
		repository.join(a_relay_space("a", "instance-a")).await.expect("a");

		assert_eq!(
			repository.find("a".to_owned()).await.expect("the find"),
			Some(a_relay_space("a", "instance-a"))
		);
		assert_eq!(repository.find("z".to_owned()).await.expect("the find"), None);
	}

	#[tokio::test]
	async fn an_unreadable_joined_spaces_setting_fails_the_read_without_echoing_it() {
		let dir = temp_dir();
		let database = open(&dir);
		for unreadable in [
			r#"[{"token":"leaked-secret"}]"#.to_owned(),
			format!(r#"{{"leaked":{LINK_RECORD}}}"#),
			format!(r#"[{LINK_RECORD},{{"token":"leaked-secret"}}]"#),
		] {
			write_raw(&database, unreadable).await;

			let failure = database.joined_spaces().list().await.expect_err("the read fails");

			let printed = format!("{failure:?}");
			for secret in ["leaked-secret", "token-of-link", "http://link.test"] {
				assert!(!printed.contains(secret), "{printed}");
			}
			assert!(database.joined_spaces().join(a_relay_space("a", "instance-a")).await.is_err());
		}
	}
}
