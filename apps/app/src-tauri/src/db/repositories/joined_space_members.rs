use std::sync::LazyLock;

use rusqlite::types::Type;
use rusqlite::{Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};

use super::joined_spaces::stored_in;
use super::settings::Settings;
use crate::db::{Access, DatabaseError};

const MEMBERS_KEY_PREFIX: &str = "app.joined_space_members.";

const UNREADABLE_ROSTER: &str = "the joined space roster setting does not read as a member list";

static SETTINGS: LazyLock<Settings> = LazyLock::new(|| Settings::new("app_settings", None));

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceMember {
	pub user_id: String,
	pub name: Option<String>,
	pub role: JoinedSpaceRole,
}

#[derive(
	Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
)]
#[serde(rename_all = "camelCase")]
pub enum JoinedSpaceRole {
	Host,
	Guest,
}

pub struct JoinedSpaceMembersRepository {
	access: Access,
}

impl JoinedSpaceMembersRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn members(&self, id: String) -> Result<Vec<JoinedSpaceMember>, DatabaseError> {
		self.access.call(move |connection| members_in(connection, &id)).await
	}

	pub async fn replaced(
		&self,
		id: String,
		members: Vec<JoinedSpaceMember>,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction =
					connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
				let is_held = stored_in(&transaction)?.iter().any(|joined| joined.id == id);
				if !is_held || members_in(&transaction, &id)? == members {
					return Ok(false);
				}
				let stored = serde_json::to_string(&members)
					.map_err(|error| rusqlite::Error::ToSqlConversionFailure(error.into()))?;
				SETTINGS.write(&transaction, None, &key_of(&id), &stored)?;
				transaction.commit()?;
				Ok(true)
			})
			.await
	}
}

pub(super) fn forgotten_in(connection: &Connection, id: &str) -> Result<(), DatabaseError> {
	SETTINGS.clear(connection, None, &key_of(id))
}

fn members_in(connection: &Connection, id: &str) -> Result<Vec<JoinedSpaceMember>, DatabaseError> {
	let Some(stored) = SETTINGS.read(connection, None, &key_of(id))? else {
		return Ok(Vec::new());
	};
	serde_json::from_str(&stored).map_err(|_| {
		rusqlite::Error::FromSqlConversionFailure(0, Type::Text, UNREADABLE_ROSTER.into()).into()
	})
}

fn key_of(id: &str) -> String {
	format!("{MEMBERS_KEY_PREFIX}{id}")
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::open;
	use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};

	fn a_member(user_id: &str, name: &str, role: JoinedSpaceRole) -> JoinedSpaceMember {
		JoinedSpaceMember { user_id: user_id.to_owned(), name: Some(name.to_owned()), role }
	}

	fn a_relay_space(id: &str) -> JoinedSpace {
		JoinedSpace {
			id: id.to_owned(),
			reach: JoinedReach::Relay { instance_id: format!("instance-of-{id}") },
			remote_space_id: None,
			name: format!("name-of-{id}"),
		}
	}

	#[tokio::test]
	async fn a_roster_never_stored_reads_as_an_empty_list() {
		let dir = temp_dir();
		let database = open(&dir);

		let members = database.joined_space_members().members("a".to_owned()).await;

		assert_eq!(members.expect("the read"), Vec::new());
	}

	#[tokio::test]
	async fn a_new_roster_is_stored_once_and_an_identical_one_changes_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		database.joined_spaces().join(a_relay_space("a")).await.expect("the join");
		let roster = vec![a_member("u1", "Ada", JoinedSpaceRole::Host)];
		let repository = database.joined_space_members();

		let first = repository.replaced("a".to_owned(), roster.clone()).await.expect("stored");
		let second = repository.replaced("a".to_owned(), roster.clone()).await.expect("compared");

		assert!(first);
		assert!(!second);
		assert_eq!(repository.members("a".to_owned()).await.expect("the read"), roster);
	}

	#[tokio::test]
	async fn the_roster_of_a_joined_space_not_held_is_never_stored() {
		let dir = temp_dir();
		let database = open(&dir);
		let roster = vec![a_member("u1", "Ada", JoinedSpaceRole::Host)];
		let repository = database.joined_space_members();

		let stored = repository.replaced("gone".to_owned(), roster).await.expect("compared");

		assert!(!stored);
		assert_eq!(repository.members("gone".to_owned()).await.expect("the read"), Vec::new());
	}

	#[tokio::test]
	async fn removing_a_joined_space_deletes_its_roster() {
		let dir = temp_dir();
		let database = open(&dir);
		database.joined_spaces().join(a_relay_space("a")).await.expect("the join");
		let repository = database.joined_space_members();
		let roster = vec![a_member("u1", "Ada", JoinedSpaceRole::Host)];
		repository.replaced("a".to_owned(), roster).await.expect("stored");

		database.joined_spaces().remove("a".to_owned()).await.expect("the removal");

		let raw = database
			.call(|connection| SETTINGS.read(connection, None, &key_of("a")))
			.await
			.expect("the raw read");
		assert_eq!(raw, None);
	}
}
