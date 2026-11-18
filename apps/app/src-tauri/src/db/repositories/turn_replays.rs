use rusqlite::types::Type;
use rusqlite::{params, Row};
use serde_json::Value;

use crate::agent::contract::{RuntimeScope, SubmittedTurn};
use crate::agent::session::StrandedTurn;
use crate::db::{Access, DatabaseError};

const INSERT_KEPT: &str = "INSERT OR IGNORE INTO turn_replays (
	turn_id, bot_id, conversation_id, runtime_session_id, epoch, prompt_id, sdk_session_id,
	prompt, cwd, output_schema, denied_tools, permission_mode, stranded_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)";

const ANY_PENDING: &str = "SELECT EXISTS (SELECT 1 FROM turn_replays WHERE replayed_at IS NULL)";

const CLAIM_PENDING: &str = "UPDATE turn_replays SET replayed_at = ?1 WHERE replayed_at IS NULL
	RETURNING turn_id, bot_id, conversation_id, runtime_session_id, epoch, prompt_id,
		sdk_session_id, prompt, cwd, output_schema, denied_tools, permission_mode";

const UNREADABLE_JSON: &str = "a kept turn replay holds a column that is not json";

#[derive(Debug, Clone, PartialEq)]
pub struct ReplayedRun {
	pub cwd: Option<String>,
	pub output_schema: Option<Value>,
	pub denied_tools: Vec<String>,
	pub permission_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct KeptTurn {
	pub scope: RuntimeScope,
	pub run: ReplayedRun,
	pub stranded: StrandedTurn,
}

impl KeptTurn {
	fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
		let turn_id: String = row.get(0)?;
		let handed = row
			.get::<_, Option<String>>(5)?
			.map(|prompt_id| SubmittedTurn { turn_id: turn_id.clone(), prompt_id });
		Ok(Self {
			scope: RuntimeScope {
				bot_id: row.get(1)?,
				conversation_id: row.get(2)?,
				runtime_session_id: row.get(3)?,
				epoch: row.get(4)?,
			},
			run: ReplayedRun {
				cwd: row.get(8)?,
				output_schema: row
					.get::<_, Option<String>>(9)?
					.map(|schema| json_column(9, &schema))
					.transpose()?,
				denied_tools: json_column(10, &row.get::<_, String>(10)?)?,
				permission_mode: row.get(11)?,
			},
			stranded: StrandedTurn {
				turn_id,
				handed,
				sdk_session_id: row.get(6)?,
				prompt: row.get(7)?,
			},
		})
	}
}

fn json_column<T: serde::de::DeserializeOwned>(index: usize, text: &str) -> rusqlite::Result<T> {
	serde_json::from_str(text).map_err(|_| {
		rusqlite::Error::FromSqlConversionFailure(index, Type::Text, UNREADABLE_JSON.into())
	})
}

fn json_text(value: &impl serde::Serialize) -> rusqlite::Result<String> {
	serde_json::to_string(value)
		.map_err(|error| rusqlite::Error::ToSqlConversionFailure(error.into()))
}

pub struct TurnReplaysRepository {
	access: Access,
}

impl TurnReplaysRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn keep(&self, kept: KeptTurn, stranded_at: i64) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let KeptTurn { scope, run, stranded } = kept;
				let output_schema = run.output_schema.as_ref().map(json_text).transpose()?;
				let denied_tools = json_text(&run.denied_tools)?;
				let inserted = connection.execute(
					INSERT_KEPT,
					params![
						stranded.turn_id,
						scope.bot_id,
						scope.conversation_id,
						scope.runtime_session_id,
						scope.epoch,
						stranded.handed.map(|handed| handed.prompt_id),
						stranded.sdk_session_id,
						stranded.prompt,
						run.cwd,
						output_schema,
						denied_tools,
						run.permission_mode,
						stranded_at,
					],
				)?;
				Ok(inserted == 1)
			})
			.await
	}

	pub async fn any_pending(&self) -> Result<bool, DatabaseError> {
		self.access
			.call(|connection| {
				Ok(connection.prepare_cached(ANY_PENDING)?.query_row([], |row| row.get(0))?)
			})
			.await
	}

	pub async fn claim_pending(&self, claimed_at: i64) -> Result<Vec<KeptTurn>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let claimed = transaction
					.prepare(CLAIM_PENDING)?
					.query_map(params![claimed_at], KeptTurn::read)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				transaction.commit()?;
				Ok(claimed)
			})
			.await
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};

	const A_CONVERSATION: &str = "
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'Chat', 1, 1);
	";

	async fn with_a_conversation(database: &Database) {
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is written");
	}

	fn a_kept_turn(turn_id: &str) -> KeptTurn {
		KeptTurn {
			scope: RuntimeScope {
				conversation_id: "c1".to_owned(),
				bot_id: "b1".to_owned(),
				runtime_session_id: "rs1".to_owned(),
				epoch: 3,
			},
			run: ReplayedRun {
				cwd: Some("/workspace".to_owned()),
				output_schema: Some(json!({ "type": "object" })),
				denied_tools: vec!["Bash".to_owned()],
				permission_mode: Some("acceptEdits".to_owned()),
			},
			stranded: StrandedTurn {
				turn_id: turn_id.to_owned(),
				handed: Some(SubmittedTurn {
					turn_id: turn_id.to_owned(),
					prompt_id: "p1".to_owned(),
				}),
				prompt: "summarise the release".to_owned(),
				sdk_session_id: Some("sdk-1".to_owned()),
			},
		}
	}

	#[tokio::test]
	async fn a_stranded_turn_is_kept_once_and_claimed_back_whole() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		let replays = database.turn_replays();

		assert!(replays.keep(a_kept_turn("t1"), 10).await.expect("kept"));
		assert!(!replays.keep(a_kept_turn("t1"), 11).await.expect("kept"), "a second row was kept");

		assert!(replays.any_pending().await.expect("read"));
		assert_eq!(replays.claim_pending(20).await.expect("claimed"), vec![a_kept_turn("t1")]);
	}

	#[tokio::test]
	async fn a_claimed_turn_is_claimed_once_and_never_kept_again() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		let replays = database.turn_replays();
		replays.keep(a_kept_turn("t1"), 10).await.expect("kept");

		let first = replays.claim_pending(20).await.expect("claimed");
		let second = replays.claim_pending(25).await.expect("claimed");
		let kept_again = replays.keep(a_kept_turn("t1"), 30).await.expect("kept");

		assert_eq!(first.len(), 1);
		assert!(second.is_empty(), "the turn was claimed twice: {second:?}");
		assert!(!kept_again, "a replayed turn stranded again was kept anew");
		assert!(!replays.any_pending().await.expect("read"));
	}

	#[tokio::test]
	async fn a_turn_claimed_before_a_restart_is_not_claimed_after_it() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			with_a_conversation(&database).await;
			database.turn_replays().keep(a_kept_turn("t1"), 10).await.expect("kept");
			database.turn_replays().keep(a_kept_turn("t2"), 11).await.expect("kept");
			database.turn_replays().claim_pending(20).await.expect("claimed");
		}

		let restarted = open(&dir);

		assert!(!restarted.turn_replays().any_pending().await.expect("read"));
		assert!(restarted.turn_replays().claim_pending(30).await.expect("claimed").is_empty());
	}

	#[tokio::test]
	async fn a_turn_kept_before_a_restart_is_still_pending_after_it() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			with_a_conversation(&database).await;
			database.turn_replays().keep(a_kept_turn("t1"), 10).await.expect("kept");
		}

		let restarted = open(&dir);

		assert!(restarted.turn_replays().any_pending().await.expect("read"));
	}
}
