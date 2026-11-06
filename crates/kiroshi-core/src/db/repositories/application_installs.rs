use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Row};
use serde_json::Value;
use uuid::Uuid;

use super::missions::oldest_first;
use crate::applications::contract::{ApplicationInstall, Destination, InstallCase, InstallDraft};
use crate::db::{Access, DatabaseError};

const MAX_INSTALLS_PER_READ: u32 = 200;

const INSTALL_COLUMNS: &str = "SELECT id, conversation_id, application, title, logo, logo_url,
	description, scope, destination_id, install_kind, secret_name, last_message_seq, created_at
	FROM application_installs";

const INSERT_INSTALL: &str = "INSERT INTO application_installs
	(id, conversation_id, application, title, logo, logo_url, description, scope,
		destination_id, install_kind, secret_name, last_message_seq, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
		(SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?2), ?12)
	RETURNING id, conversation_id, application, title, logo, logo_url, description, scope,
		destination_id, install_kind, secret_name, last_message_seq, created_at";

const NOTHING: &str = "nothing";
const KEY: &str = "key";
const OAUTH: &str = "oauth";

const SECRET_SEPARATOR: &str = ",";

impl ToSql for Destination {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(named(*self)?))
	}
}

impl FromSql for Destination {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		serde_json::from_value(Value::String(value.as_str()?.to_owned()))
			.map_err(|error| FromSqlError::Other(Box::new(error)))
	}
}

fn named(destination: Destination) -> rusqlite::Result<String> {
	match serde_json::to_value(destination) {
		Ok(Value::String(text)) => Ok(text),
		held => Err(rusqlite::Error::ToSqlConversionFailure(
			format!("a destination did not serialise as a name: {held:?}").into(),
		)),
	}
}

pub struct ApplicationInstallsRepository {
	access: Access,
}

impl ApplicationInstallsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn record(&self, draft: InstallDraft) -> Result<ApplicationInstall, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection.query_row(
					INSERT_INSTALL,
					params![
						Uuid::new_v4().to_string(),
						draft.conversation_id,
						draft.application,
						draft.title,
						draft.logo,
						draft.logo_url,
						draft.description,
						draft.scope,
						draft.destination_id,
						kind_of(&draft.install),
						secrets_of(&draft.install),
						now(),
					],
					install,
				)?)
			})
			.await
	}

	pub async fn of_conversation(
		&self,
		conversation_id: String,
	) -> Result<Vec<ApplicationInstall>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{INSTALL_COLUMNS} WHERE conversation_id = ?1
					ORDER BY created_at DESC, id DESC LIMIT ?2"
				))?;
				let rows = statement
					.query_map(params![conversation_id, MAX_INSTALLS_PER_READ], install)?;
				Ok(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?))
			})
			.await
	}
}

fn kind_of(install: &InstallCase) -> &'static str {
	match install {
		InstallCase::Nothing => NOTHING,
		InstallCase::Key { .. } => KEY,
		InstallCase::Oauth => OAUTH,
	}
}

fn secrets_of(install: &InstallCase) -> Option<String> {
	match install {
		InstallCase::Key { secrets } => Some(secrets.join(SECRET_SEPARATOR)),
		InstallCase::Nothing | InstallCase::Oauth => None,
	}
}

fn case(kind: &str, secret_name: Option<String>) -> rusqlite::Result<InstallCase> {
	match (kind, secret_name) {
		(NOTHING, _) => Ok(InstallCase::Nothing),
		(OAUTH, _) => Ok(InstallCase::Oauth),
		(KEY, Some(names)) => Ok(InstallCase::Key {
			secrets: names.split(SECRET_SEPARATOR).map(str::to_owned).collect(),
		}),
		(held, _) => Err(rusqlite::Error::FromSqlConversionFailure(
			0,
			rusqlite::types::Type::Text,
			format!("an install case stored as {held} names no secret").into(),
		)),
	}
}

fn install(row: &Row<'_>) -> rusqlite::Result<ApplicationInstall> {
	Ok(ApplicationInstall {
		id: row.get("id")?,
		conversation_id: row.get("conversation_id")?,
		application: row.get("application")?,
		title: row.get("title")?,
		logo: row.get("logo")?,
		logo_url: row.get("logo_url")?,
		description: row.get("description")?,
		scope: row.get("scope")?,
		destination_id: row.get("destination_id")?,
		install: case(&row.get::<_, String>("install_kind")?, row.get("secret_name")?)?,
		last_message_seq: row.get("last_message_seq")?,
		created_at: row.get("created_at")?,
	})
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open};

	const A_CONVERSATION: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Shoto', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'main', 'Other', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c2', 'b1', 'assistant', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'add superset', 'complete', 1),
				('m2', 'c1', 't1', 2, 'assistant', 'where', 'complete', 2);
	";

	fn a_draft(application: &str, install: InstallCase) -> InstallDraft {
		InstallDraft {
			conversation_id: "c1".to_owned(),
			application: application.to_owned(),
			title: application.to_owned(),
			logo: None,
			logo_url: Some("https://logos.test/superset.png".to_owned()),
			description: Some("Run workspaces.".to_owned()),
			scope: Destination::Space,
			destination_id: Some("personal".to_owned()),
			install,
		}
	}

	async fn planted(database: &crate::db::Database, moments: Vec<(String, i64)>) {
		database
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				for (application, created_at) in &moments {
					transaction.execute(
						"INSERT INTO application_installs (id, conversation_id, application,
							title, scope, install_kind, last_message_seq, created_at)
							VALUES (?1, 'c1', ?1, ?1, 'user', 'oauth', 0, ?2)",
						params![application, created_at],
					)?;
				}
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the installs are planted");
	}

	fn named_at(moments: [(&str, i64); 3]) -> Vec<(String, i64)> {
		moments.into_iter().map(|(name, at)| (name.to_owned(), at)).collect()
	}

	async fn a_store(dir: &std::path::Path) -> crate::db::Database {
		let database = open(dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is planted");
		database
	}

	#[tokio::test]
	async fn a_recorded_install_carries_its_conversation_the_seq_it_landed_after_and_its_secret() {
		let dir = temp_dir();
		let database = a_store(&dir).await;

		let recorded = database
			.application_installs()
			.record(a_draft(
				"superset",
				InstallCase::Key { secrets: vec!["SUPERSET_API_KEY".to_owned()] },
			))
			.await
			.expect("the install is recorded");

		assert_eq!(recorded.conversation_id, "c1");
		assert_eq!(recorded.last_message_seq, 2);
		assert_eq!(recorded.logo, None);
		assert_eq!(recorded.logo_url.as_deref(), Some("https://logos.test/superset.png"));
		assert_eq!(recorded.description.as_deref(), Some("Run workspaces."));
		assert_eq!(recorded.scope, Destination::Space);
		assert_eq!(recorded.destination_id.as_deref(), Some("personal"));
		assert_eq!(
			recorded.install,
			InstallCase::Key { secrets: vec!["SUPERSET_API_KEY".to_owned()] }
		);
		assert!(recorded.created_at > 0, "the moment it was written is not held");
		assert_eq!(
			database.application_installs().of_conversation("c1".to_owned()).await.expect("read"),
			vec![recorded]
		);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_install_needing_several_variables_reads_back_every_name_it_recorded() {
		let dir = temp_dir();
		let database = a_store(&dir).await;
		let secrets = vec!["APIKEY".to_owned(), "TENANT".to_owned()];

		let recorded = database
			.application_installs()
			.record(a_draft("two-headers", InstallCase::Key { secrets: secrets.clone() }))
			.await
			.expect("the install is recorded");

		assert_eq!(recorded.install, InstallCase::Key { secrets });

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_install_recorded_with_one_variable_name_reads_back_that_one_name() {
		let dir = temp_dir();
		let database = a_store(&dir).await;
		database
			.call_mut(|connection| {
				Ok(connection.execute(
					"INSERT INTO application_installs (id, conversation_id, application,
						title, scope, install_kind, secret_name, last_message_seq, created_at)
						VALUES ('i1', 'c1', 'superset', 'Superset', 'user', 'key',
							'SUPERSET_API_KEY', 0, 1)",
					[],
				)?)
			})
			.await
			.expect("the row is planted");

		let read = database
			.application_installs()
			.of_conversation("c1".to_owned())
			.await
			.expect("the installs are read");

		assert_eq!(
			read[0].install,
			InstallCase::Key { secrets: vec!["SUPERSET_API_KEY".to_owned()] }
		);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_installs_of_one_conversation_read_oldest_first_and_leave_the_others_out() {
		let dir = temp_dir();
		let database = a_store(&dir).await;
		planted(&database, named_at([("linear", 20), ("granola", 30), ("paper", 10)])).await;

		let read = database
			.application_installs()
			.of_conversation("c1".to_owned())
			.await
			.expect("the installs read");

		assert_eq!(
			read.iter().map(|held| held.application.as_str()).collect::<Vec<_>>(),
			["paper", "linear", "granola"]
		);
		assert_eq!(
			database.application_installs().of_conversation("c2".to_owned()).await.expect("read"),
			Vec::new(),
			"a conversation with no install answered rows"
		);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_conversation_holding_more_installs_than_the_cap_reads_the_newest_ones_oldest_first()
	{
		let dir = temp_dir();
		let database = a_store(&dir).await;
		let planted_count = i64::from(MAX_INSTALLS_PER_READ) + 5;
		let moments =
			(1..=planted_count).map(|at| (format!("app-{at:04}"), at)).collect::<Vec<_>>();
		planted(&database, moments).await;

		let read = database
			.application_installs()
			.of_conversation("c1".to_owned())
			.await
			.expect("the installs read");

		assert_eq!(read.len(), MAX_INSTALLS_PER_READ as usize);
		assert_eq!(read.first().map(|held| held.application.as_str()), Some("app-0006"));
		assert_eq!(read.last().map(|held| held.application.as_str()), Some("app-0205"));
		assert!(
			read.windows(2).all(|pair| pair[0].created_at < pair[1].created_at),
			"the capped read did not answer oldest first"
		);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_installs_of_a_conversation_go_when_the_conversation_goes() {
		let dir = temp_dir();
		let database = a_store(&dir).await;
		database
			.application_installs()
			.record(a_draft("paper", InstallCase::Nothing))
			.await
			.expect("the install is recorded");

		database
			.call_mut(|connection| {
				Ok(connection.execute("DELETE FROM conversations WHERE id = 'c1'", [])?)
			})
			.await
			.expect("the conversation is removed");

		assert_eq!(count_of(&database, "application_installs").await, 0);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
