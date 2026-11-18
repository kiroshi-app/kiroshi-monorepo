use rusqlite::types::Type;
use rusqlite::{params, Row, TransactionBehavior};
use serde_json::Value;

use crate::agent::contract::{RuntimeScope, SubmittedTurn};
use crate::agent::session::StrandedTurn;
use crate::db::{Access, DatabaseError};

const INSERT_KEPT: &str = "INSERT OR IGNORE INTO turn_replays (
	turn_id, bot_id, conversation_id, runtime_session_id, epoch, prompt_id, sdk_session_id,
	prompt, cwd, output_schema, denied_tools, permission_mode, base_url, prompted_at, stranded_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)";

const PENDING_HOSTS: &str =
	"SELECT DISTINCT base_url FROM turn_replays WHERE replayed_at IS NULL ORDER BY base_url";

const PENDING_ON: &str = "SELECT turn_id, bot_id, conversation_id, runtime_session_id, epoch,
	prompt_id, sdk_session_id, prompt, cwd, output_schema, denied_tools, permission_mode, base_url,
	prompted_at,
	EXISTS (
		SELECT 1 FROM messages
		WHERE messages.conversation_id = turn_replays.conversation_id
			AND messages.role = 'user'
			AND messages.created_at > turn_replays.prompted_at
			AND messages.turn_id IS NOT turn_replays.turn_id
	)
	FROM turn_replays WHERE base_url = ?1 AND replayed_at IS NULL";

const CLAIM_ON: &str =
	"UPDATE turn_replays SET replayed_at = ?2 WHERE base_url = ?1 AND replayed_at IS NULL";

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
	pub base_url: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClaimedTurn {
	pub kept: KeptTurn,
	pub is_superseded: bool,
}

impl ClaimedTurn {
	fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
		let turn_id: String = row.get(0)?;
		let handed = row
			.get::<_, Option<String>>(5)?
			.map(|prompt_id| SubmittedTurn { turn_id: turn_id.clone(), prompt_id });
		let kept = KeptTurn {
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
				prompted_at: row.get(13)?,
			},
			base_url: row.get(12)?,
		};
		Ok(Self { kept, is_superseded: row.get(14)? })
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
				let KeptTurn { scope, run, stranded, base_url } = kept;
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
						base_url,
						stranded.prompted_at,
						stranded_at,
					],
				)?;
				Ok(inserted == 1)
			})
			.await
	}

	pub async fn pending_hosts(&self) -> Result<Vec<String>, DatabaseError> {
		self.access
			.call(|connection| {
				let hosts = connection
					.prepare_cached(PENDING_HOSTS)?
					.query_map([], |row| row.get(0))?
					.collect::<rusqlite::Result<Vec<String>>>()?;
				Ok(hosts)
			})
			.await
	}

	pub async fn claim_pending_on(
		&self,
		base_url: &str,
		claimed_at: i64,
	) -> Result<Vec<ClaimedTurn>, DatabaseError> {
		let base_url = base_url.to_owned();
		self.access
			.call_mut(move |connection| {
				let transaction =
					connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
				let claimed = transaction
					.prepare(PENDING_ON)?
					.query_map(params![base_url], ClaimedTurn::read)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				transaction.execute(CLAIM_ON, params![base_url, claimed_at])?;
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

	const HOST: &str = "https://api.anthropic.com";
	const LOCAL_HOST: &str = "http://127.0.0.1:9";
	const PROMPT: &str = "summarise the release";

	const A_CONVERSATION: &str = "
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'Chat', 1, 1);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 90);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'summarise the release', 'complete', 90);
	";

	async fn with_a_conversation(database: &Database) {
		run(database, A_CONVERSATION).await;
	}

	async fn run(database: &Database, statements: &'static str) {
		database
			.call_mut(move |connection| Ok(connection.execute_batch(statements)?))
			.await
			.expect("the fixture is written");
	}

	fn a_kept_turn(turn_id: &str, base_url: &str) -> KeptTurn {
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
				prompt: PROMPT.to_owned(),
				sdk_session_id: Some("sdk-1".to_owned()),
				prompted_at: 100,
			},
			base_url: base_url.to_owned(),
		}
	}

	fn claimed(kept: KeptTurn, is_superseded: bool) -> ClaimedTurn {
		ClaimedTurn { kept, is_superseded }
	}

	#[tokio::test]
	async fn a_stranded_turn_is_kept_once_and_claimed_back_whole() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		let replays = database.turn_replays();

		assert!(replays.keep(a_kept_turn("t1", HOST), 110).await.expect("kept"));
		assert!(!replays.keep(a_kept_turn("t1", HOST), 111).await.expect("kept"), "kept twice");

		assert_eq!(replays.pending_hosts().await.expect("read"), vec![HOST.to_owned()]);
		assert_eq!(
			replays.claim_pending_on(HOST, 120).await.expect("claimed"),
			vec![claimed(a_kept_turn("t1", HOST), false)]
		);
	}

	#[tokio::test]
	async fn a_claimed_turn_is_claimed_once_and_never_kept_again() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		let replays = database.turn_replays();
		replays.keep(a_kept_turn("t1", HOST), 110).await.expect("kept");

		let first = replays.claim_pending_on(HOST, 120).await.expect("claimed");
		let second = replays.claim_pending_on(HOST, 125).await.expect("claimed");
		let kept_again = replays.keep(a_kept_turn("t1", HOST), 130).await.expect("kept");

		assert_eq!(first.len(), 1);
		assert!(second.is_empty(), "the turn was claimed twice: {second:?}");
		assert!(!kept_again, "a replayed turn stranded again was kept anew");
		assert!(replays.pending_hosts().await.expect("read").is_empty());
	}

	#[tokio::test]
	async fn a_turn_claimed_before_a_restart_is_not_claimed_after_it() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			with_a_conversation(&database).await;
			database.turn_replays().keep(a_kept_turn("t1", HOST), 110).await.expect("kept");
			database.turn_replays().keep(a_kept_turn("t2", HOST), 111).await.expect("kept");
			database.turn_replays().claim_pending_on(HOST, 120).await.expect("claimed");
		}

		let restarted = open(&dir);

		assert!(restarted.turn_replays().pending_hosts().await.expect("read").is_empty());
		assert!(restarted
			.turn_replays()
			.claim_pending_on(HOST, 130)
			.await
			.expect("read")
			.is_empty());
	}

	#[tokio::test]
	async fn a_turn_kept_before_a_restart_is_still_pending_after_it() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			with_a_conversation(&database).await;
			database.turn_replays().keep(a_kept_turn("t1", HOST), 110).await.expect("kept");
		}

		let restarted = open(&dir);

		assert_eq!(
			restarted.turn_replays().pending_hosts().await.expect("read"),
			vec![HOST.to_owned()]
		);
	}

	#[tokio::test]
	async fn a_turn_the_person_sent_again_by_hand_is_claimed_as_superseded() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		database.turn_replays().keep(a_kept_turn("t1", HOST), 110).await.expect("kept");
		run(
			&database,
			"INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t2', 'c1', 2, 115);
			INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m2', 'c1', 't2', 2, 'user', 'summarise the release', 'complete', 115);",
		)
		.await;

		let claimed_turns =
			database.turn_replays().claim_pending_on(HOST, 120).await.expect("claimed");

		assert_eq!(claimed_turns, vec![claimed(a_kept_turn("t1", HOST), true)]);
		assert!(database.turn_replays().pending_hosts().await.expect("read").is_empty());
	}

	#[tokio::test]
	async fn neither_the_turn_own_message_nor_a_newer_reply_supersedes_it() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		database.turn_replays().keep(a_kept_turn("t1", HOST), 110).await.expect("kept");
		run(
			&database,
			"INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t2', 'c1', 2, 115);
			INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m2', 'c1', 't1', 2, 'user', 'and a follow-up', 'complete', 105),
					('m3', 'c1', 't2', 3, 'assistant', 'a report', 'complete', 115);",
		)
		.await;

		let claimed_turns =
			database.turn_replays().claim_pending_on(HOST, 120).await.expect("claimed");

		assert_eq!(claimed_turns, vec![claimed(a_kept_turn("t1", HOST), false)]);
	}

	#[tokio::test]
	async fn a_claim_on_one_host_leaves_the_turns_of_another_host_pending() {
		let dir = temp_dir();
		let database = open(&dir);
		with_a_conversation(&database).await;
		let replays = database.turn_replays();
		replays.keep(a_kept_turn("t1", HOST), 110).await.expect("kept");
		replays.keep(a_kept_turn("t2", LOCAL_HOST), 111).await.expect("kept");

		let on_local = replays.claim_pending_on(LOCAL_HOST, 120).await.expect("claimed");

		assert_eq!(on_local, vec![claimed(a_kept_turn("t2", LOCAL_HOST), false)]);
		assert_eq!(replays.pending_hosts().await.expect("read"), vec![HOST.to_owned()]);
	}
}
