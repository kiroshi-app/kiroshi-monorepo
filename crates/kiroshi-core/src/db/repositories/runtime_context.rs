use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::{Access, DatabaseError};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeSessionStatus {
	Active,
	Rotated,
	Ended,
	Failed,
}

impl RuntimeSessionStatus {
	fn from_column(text: &str) -> Option<Self> {
		match text {
			"active" => Some(Self::Active),
			"rotated" => Some(Self::Rotated),
			"ended" => Some(Self::Ended),
			"failed" => Some(Self::Failed),
			_ => None,
		}
	}

	fn as_column(self) -> &'static str {
		match self {
			Self::Active => "active",
			Self::Rotated => "rotated",
			Self::Ended => "ended",
			Self::Failed => "failed",
		}
	}
}

impl ToSql for RuntimeSessionStatus {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(self.as_column()))
	}
}

impl FromSql for RuntimeSessionStatus {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		let text = value.as_str()?;
		Self::from_column(text).ok_or_else(|| {
			FromSqlError::Other(
				format!("`{text}` is not a runtime session status this build knows").into(),
			)
		})
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Handover {
	pub session_id: String,
	pub reason: Option<String>,
}

impl Handover {
	fn status(&self) -> RuntimeSessionStatus {
		match self.reason {
			Some(_) => RuntimeSessionStatus::Rotated,
			None => RuntimeSessionStatus::Ended,
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParticipantKey {
	pub conversation_id: String,
	pub bot_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeSession {
	pub id: String,
	pub participant: ParticipantKey,
	pub provider_session_id: Option<String>,
	pub seq: i64,
	pub status: RuntimeSessionStatus,
	pub started_at: i64,
	pub ended_at: Option<i64>,
	pub rotation_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContextCheckpoint {
	pub id: String,
	pub participant: ParticipantKey,
	pub runtime_session_id: Option<String>,
	pub summary: String,
	pub last_message_seq: i64,
	pub token_count: i64,
	pub created_at: i64,
}

pub struct NewCheckpoint {
	pub participant: ParticipantKey,
	pub runtime_session_id: String,
	pub summary: String,
	pub last_message_seq: i64,
	pub token_count: i64,
	pub created_at: i64,
}

const HAND_OVER_SESSION: &str = "UPDATE runtime_sessions
	SET status = ?4, ended_at = ?5, rotation_reason = ?6
	WHERE id = ?1 AND conversation_id = ?2 AND bot_id = ?3 AND status = 'active'";

const OPEN_SESSION: &str = "INSERT INTO runtime_sessions
		(id, conversation_id, bot_id, seq, status, started_at)
	SELECT ?1, ?2, ?3, coalesce(max(seq), 0) + 1, 'active', ?4
		FROM runtime_sessions WHERE conversation_id = ?2 AND bot_id = ?3
	RETURNING seq";

const RECORD_PROVIDER_SESSION: &str = "UPDATE runtime_sessions SET provider_session_id = ?4
	WHERE id = ?1 AND conversation_id = ?2 AND bot_id = ?3
		AND status = 'active' AND provider_session_id IS NULL";

const FORGET_PROVIDER_SESSION: &str = "UPDATE runtime_sessions SET provider_session_id = NULL
	WHERE conversation_id = ?1 AND bot_id = ?2 AND provider_session_id = ?3";

const END_LIVE_SESSION: &str = "UPDATE runtime_sessions
	SET status = ?2, ended_at = ?3, rotation_reason = ?4
	WHERE id = ?1 AND status = 'active'";

const SESSION_BY_ID: &str = "SELECT * FROM runtime_sessions WHERE id = ?1";

const PARTICIPANTS_SESSION_BY_ID: &str =
	"SELECT * FROM runtime_sessions WHERE id = ?1 AND conversation_id = ?2 AND bot_id = ?3";

const ACTIVE_SESSION: &str = "SELECT * FROM runtime_sessions
	WHERE conversation_id = ?1 AND bot_id = ?2 AND status = 'active'
	ORDER BY seq
	LIMIT 1";

const SESSIONS_FOR: &str = "SELECT * FROM runtime_sessions
	WHERE conversation_id = ?1 AND bot_id = ?2
	ORDER BY seq";

const INSERT_CHECKPOINT: &str = "INSERT INTO context_checkpoints
	(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq, token_count,
		created_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)";

const LATEST_CHECKPOINT: &str = "SELECT * FROM context_checkpoints
	WHERE runtime_session_id = ?1
	ORDER BY last_message_seq DESC
	LIMIT 1";

const FORGET_CHECKPOINT: &str = "DELETE FROM context_checkpoints WHERE id = ?1";

const CHECKPOINTS_FOR: &str = "SELECT * FROM context_checkpoints
	WHERE conversation_id = ?1 AND bot_id = ?2
	ORDER BY last_message_seq";

pub struct RuntimeContextRepository {
	access: Access,
}

impl RuntimeContextRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	pub async fn open(
		&self,
		participant: ParticipantKey,
		started_at: i64,
		handover: Option<Handover>,
	) -> Result<RuntimeSession, DatabaseError> {
		let id = uuid::Uuid::new_v4().to_string();
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let handed_over = match handover.as_ref() {
					Some(handover) => {
						end_the_named_session(&transaction, &participant, handover, started_at)?
					}
					None => false,
				};
				let seq = transaction.query_row(
					OPEN_SESSION,
					params![id, participant.conversation_id, participant.bot_id, started_at],
					|row| row.get::<_, i64>(0),
				)?;
				if let Some(handover) = handover.as_ref().filter(|_| handed_over) {
					carry_the_checkpoint_forward(&transaction, &handover.session_id, &id)?;
				}
				transaction.commit()?;
				Ok(RuntimeSession {
					id,
					participant,
					provider_session_id: None,
					seq,
					status: RuntimeSessionStatus::Active,
					started_at,
					ended_at: None,
					rotation_reason: None,
				})
			})
			.await
	}

	pub async fn record_provider_session(
		&self,
		participant: ParticipantKey,
		session_id: String,
		provider_session_id: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let changed = transaction.execute(
					RECORD_PROVIDER_SESSION,
					params![
						session_id,
						participant.conversation_id,
						participant.bot_id,
						provider_session_id
					],
				)?;
				if changed == 1 {
					transaction.commit()?;
					return Ok(());
				}
				let stored = transaction
					.query_row(
						PARTICIPANTS_SESSION_BY_ID,
						params![session_id, participant.conversation_id, participant.bot_id],
						session_from,
					)
					.optional()?;
				let Some(stored) = stored else {
					return Err(no_such_session());
				};
				let is_replay = stored.status == RuntimeSessionStatus::Active
					&& stored.provider_session_id.as_deref() == Some(provider_session_id.as_str());
				if is_replay {
					return Ok(());
				}
				Err(DatabaseError::Conflict)
			})
			.await
	}

	pub async fn forget_provider_session(
		&self,
		participant: ParticipantKey,
		provider_session_id: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call(move |connection| {
				connection.execute(
					FORGET_PROVIDER_SESSION,
					params![participant.conversation_id, participant.bot_id, provider_session_id],
				)?;
				Ok(())
			})
			.await
	}

	pub async fn close(&self, session_id: String, ended_at: i64) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				end_live_session(
					connection,
					&session_id,
					RuntimeSessionStatus::Ended,
					ended_at,
					None,
				)
			})
			.await
	}

	pub async fn fail(
		&self,
		session_id: String,
		ended_at: i64,
		reason: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				end_live_session(
					connection,
					&session_id,
					RuntimeSessionStatus::Failed,
					ended_at,
					Some(&reason),
				)
			})
			.await
	}

	pub async fn session(&self, id: String) -> Result<Option<RuntimeSession>, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection.query_row(SESSION_BY_ID, params![id], session_from).optional()?)
			})
			.await
	}

	pub async fn active_session(
		&self,
		participant: ParticipantKey,
	) -> Result<Option<RuntimeSession>, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.query_row(
						ACTIVE_SESSION,
						params![participant.conversation_id, participant.bot_id],
						session_from,
					)
					.optional()?)
			})
			.await
	}

	pub async fn sessions_for(
		&self,
		participant: ParticipantKey,
	) -> Result<Vec<RuntimeSession>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare(SESSIONS_FOR)?;
				let sessions = statement
					.query_map(
						params![participant.conversation_id, participant.bot_id],
						session_from,
					)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(sessions)
			})
			.await
	}

	pub async fn checkpoint(
		&self,
		checkpoint: NewCheckpoint,
	) -> Result<ContextCheckpoint, DatabaseError> {
		let stored = ContextCheckpoint {
			id: uuid::Uuid::new_v4().to_string(),
			participant: checkpoint.participant,
			runtime_session_id: Some(checkpoint.runtime_session_id),
			summary: checkpoint.summary,
			last_message_seq: checkpoint.last_message_seq,
			token_count: checkpoint.token_count,
			created_at: checkpoint.created_at,
		};
		self.access
			.call(move |connection| {
				connection.execute(
					INSERT_CHECKPOINT,
					params![
						stored.id,
						stored.participant.conversation_id,
						stored.participant.bot_id,
						stored.runtime_session_id,
						stored.summary,
						stored.last_message_seq,
						stored.token_count,
						stored.created_at,
					],
				)?;
				Ok(stored)
			})
			.await
	}

	pub async fn latest_checkpoint(
		&self,
		runtime_session_id: String,
	) -> Result<Option<ContextCheckpoint>, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.query_row(LATEST_CHECKPOINT, params![runtime_session_id], checkpoint_from)
					.optional()?)
			})
			.await
	}

	pub async fn checkpoints_for(
		&self,
		participant: ParticipantKey,
	) -> Result<Vec<ContextCheckpoint>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare(CHECKPOINTS_FOR)?;
				let checkpoints = statement
					.query_map(
						params![participant.conversation_id, participant.bot_id],
						checkpoint_from,
					)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(checkpoints)
			})
			.await
	}
}

fn end_the_named_session(
	transaction: &rusqlite::Transaction<'_>,
	participant: &ParticipantKey,
	handover: &Handover,
	ended_at: i64,
) -> Result<bool, DatabaseError> {
	let ended = transaction.execute(
		HAND_OVER_SESSION,
		params![
			handover.session_id,
			participant.conversation_id,
			participant.bot_id,
			handover.status(),
			ended_at,
			handover.reason
		],
	)?;
	Ok(ended == 1)
}

fn carry_the_checkpoint_forward(
	transaction: &rusqlite::Transaction<'_>,
	rotated_session_id: &str,
	opened_session_id: &str,
) -> Result<(), DatabaseError> {
	let carried = transaction
		.query_row(LATEST_CHECKPOINT, params![rotated_session_id], checkpoint_from)
		.optional()?;
	let Some(carried) = carried else {
		return Ok(());
	};
	transaction.execute(FORGET_CHECKPOINT, params![carried.id])?;
	transaction.execute(
		INSERT_CHECKPOINT,
		params![
			carried.id,
			carried.participant.conversation_id,
			carried.participant.bot_id,
			opened_session_id,
			carried.summary,
			carried.last_message_seq,
			carried.token_count,
			carried.created_at
		],
	)?;
	Ok(())
}

fn end_live_session(
	connection: &mut Connection,
	session_id: &str,
	status: RuntimeSessionStatus,
	ended_at: i64,
	reason: Option<&str>,
) -> Result<(), DatabaseError> {
	let transaction = connection.transaction()?;
	let changed =
		transaction.execute(END_LIVE_SESSION, params![session_id, status, ended_at, reason])?;
	if changed == 1 {
		transaction.commit()?;
		return Ok(());
	}
	let stored =
		transaction.query_row(SESSION_BY_ID, params![session_id], session_from).optional()?;
	let Some(stored) = stored else {
		return Err(no_such_session());
	};
	let is_replay = stored.status == status
		&& stored.ended_at == Some(ended_at)
		&& stored.rotation_reason.as_deref() == reason;
	if is_replay {
		return Ok(());
	}
	Err(DatabaseError::Conflict)
}

fn no_such_session() -> DatabaseError {
	DatabaseError::Sqlite(rusqlite::Error::QueryReturnedNoRows)
}

fn session_from(row: &Row<'_>) -> rusqlite::Result<RuntimeSession> {
	Ok(RuntimeSession {
		id: row.get("id")?,
		participant: ParticipantKey {
			conversation_id: row.get("conversation_id")?,
			bot_id: row.get("bot_id")?,
		},
		provider_session_id: row.get("provider_session_id")?,
		seq: row.get("seq")?,
		status: row.get("status")?,
		started_at: row.get("started_at")?,
		ended_at: row.get("ended_at")?,
		rotation_reason: row.get("rotation_reason")?,
	})
}

fn checkpoint_from(row: &Row<'_>) -> rusqlite::Result<ContextCheckpoint> {
	Ok(ContextCheckpoint {
		id: row.get("id")?,
		participant: ParticipantKey {
			conversation_id: row.get("conversation_id")?,
			bot_id: row.get("bot_id")?,
		},
		runtime_session_id: row.get("runtime_session_id")?,
		summary: row.get("summary")?,
		last_message_seq: row.get("last_message_seq")?,
		token_count: row.get("token_count")?,
		created_at: row.get("created_at")?,
	})
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use super::*;
	use crate::db::connection::{temp_dir, FILE_NAME};
	use crate::db::Database;

	const FIXTURE: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c1', 'b2', 'assistant', 1, 1);
	";

	fn participant(bot_id: &str) -> ParticipantKey {
		ParticipantKey { conversation_id: "c1".to_owned(), bot_id: bot_id.to_owned() }
	}

	fn opened(dir: &Path) -> Database {
		Database::open(&dir.join(FILE_NAME)).expect("the database opens")
	}

	async fn seeded(dir: &Path) -> Database {
		let database = opened(dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(FIXTURE)?))
			.await
			.expect("the fixture is inserted");
		database
	}

	async fn live_session_count(database: &Database) -> u32 {
		database
			.call(|connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM runtime_sessions WHERE status = 'active'",
					[],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("query")
	}

	async fn stored_session(database: &Database, bot_id: &str, id: &str) -> RuntimeSession {
		database
			.runtime_context()
			.sessions_for(participant(bot_id))
			.await
			.expect("the sessions")
			.into_iter()
			.find(|session| session.id == id)
			.expect("the session is still on the record")
	}

	async fn rows_named(database: &Database, id: String) -> u32 {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM runtime_sessions WHERE id = ?1",
					[id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("query")
	}

	async fn restore_point(database: &Database, runtime_session_id: &str) -> Option<i64> {
		database
			.runtime_context()
			.latest_checkpoint(runtime_session_id.to_owned())
			.await
			.expect("the restore point")
			.map(|checkpoint| checkpoint.last_message_seq)
	}

	fn rotating(session: &RuntimeSession) -> Option<Handover> {
		Some(Handover { session_id: session.id.clone(), reason: Some("context full".to_owned()) })
	}

	fn leaving(session: &RuntimeSession) -> Option<Handover> {
		Some(Handover { session_id: session.id.clone(), reason: None })
	}

	fn a_checkpoint_at(
		participant: ParticipantKey,
		runtime_session_id: String,
		last_message_seq: i64,
	) -> NewCheckpoint {
		NewCheckpoint {
			participant,
			runtime_session_id,
			summary: format!("the conversation up to message {last_message_seq}"),
			last_message_seq,
			token_count: 120,
			created_at: last_message_seq,
		}
	}

	#[tokio::test]
	async fn two_bots_in_one_conversation_keep_their_own_lineage() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let first = runtime.open(participant("b1"), 1, None).await.expect("b1 opens a session");
		let second = runtime.open(participant("b2"), 2, None).await.expect("b2 opens a session");
		runtime
			.open(participant("b1"), 3, rotating(&first))
			.await
			.expect("b1 opens a second session");

		assert_eq!(first.seq, 1, "the first bot's lineage did not start at 1");
		assert_eq!(second.seq, 1, "the second bot's lineage inherited the first one's numbering");
		assert_eq!(
			runtime.active_session(participant("b2")).await.expect("b2's live session"),
			Some(second),
			"a handover in one lineage moved another participant's live session"
		);
		assert_eq!(
			runtime.sessions_for(participant("b2")).await.expect("b2's sessions").len(),
			1,
			"a handover in one lineage added a row to another participant's"
		);
		assert_eq!(live_session_count(&database).await, 2, "one live session per participant");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_participants_sessions_are_numbered_in_the_order_they_opened() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let mut opened_seqs = Vec::new();
		let mut live = None;
		for started_at in 1..=3 {
			let session = runtime
				.open(participant("b1"), started_at, live.as_ref().and_then(rotating))
				.await
				.expect("the session opens");
			opened_seqs.push(session.seq);
			live = Some(session);
		}

		assert_eq!(opened_seqs, vec![1, 2, 3], "a reopen did not continue the lineage");
		assert_eq!(
			runtime
				.sessions_for(participant("b1"))
				.await
				.expect("the sessions")
				.iter()
				.map(|session| session.seq)
				.collect::<Vec<_>>(),
			vec![1, 2, 3],
			"the lineage came back in another order than it was opened in"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn opening_a_session_rotates_the_one_it_replaces() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let first = runtime.open(participant("b1"), 1, None).await.expect("the first session");

		let second =
			runtime.open(participant("b1"), 5, rotating(&first)).await.expect("the second session");

		let sessions = runtime.sessions_for(participant("b1")).await.expect("the sessions");
		let rotated = sessions.first().expect("the replaced session");
		assert_eq!(rotated.id, first.id);
		assert_eq!(
			rotated.status,
			RuntimeSessionStatus::Rotated,
			"the replaced session stayed live"
		);
		assert_eq!(rotated.ended_at, Some(5), "the replaced session never ended");
		assert_eq!(
			rotated.rotation_reason.as_deref(),
			Some("context full"),
			"the handover was recorded without its reason"
		);
		assert_eq!(
			runtime.active_session(participant("b1")).await.expect("the live session"),
			Some(second),
			"the new session is not the live one"
		);
		assert_eq!(
			live_session_count(&database).await,
			1,
			"the participant holds two live sessions"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn two_instances_of_one_bot_hold_a_live_session_each() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let first = runtime.open(participant("b1"), 1, None).await.expect("the first instance");
		let second = runtime.open(participant("b1"), 2, None).await.expect("the second instance");

		assert_eq!(second.seq, 2, "the second instance restarted the lineage");
		assert_eq!(live_session_count(&database).await, 2, "one instance lost its live session");
		assert_eq!(
			stored_session(&database, "b1", &first.id).await.status,
			RuntimeSessionStatus::Active,
			"the second instance rotated the first one out"
		);
		assert_eq!(
			runtime.active_session(participant("b1")).await.expect("the live session"),
			Some(first),
			"the participant's live session is not the one that opened first"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_rotation_leaves_the_other_instances_of_the_bot_alone() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let lineage = runtime.open(participant("b1"), 1, None).await.expect("the first instance");
		let beside_it =
			runtime.open(participant("b1"), 2, None).await.expect("the second instance");

		let rotated_in = runtime
			.open(participant("b1"), 3, rotating(&beside_it))
			.await
			.expect("the rotation opens a session");

		assert_eq!(
			stored_session(&database, "b1", &beside_it.id).await.status,
			RuntimeSessionStatus::Rotated,
			"the session the caller named at open stayed live"
		);
		assert_eq!(
			stored_session(&database, "b1", &lineage.id).await.status,
			RuntimeSessionStatus::Active,
			"the rotation ended an instance the caller never named"
		);
		assert_eq!(live_session_count(&database).await, 2, "the rotation lost a live session");
		assert_eq!(
			runtime.active_session(participant("b1")).await.expect("the live session"),
			Some(lineage),
			"the live session is not the earliest one still running"
		);
		assert_eq!(rotated_in.seq, 3, "the rotation restarted the lineage");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_rotation_naming_a_session_that_is_no_longer_live_ends_nothing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let live = runtime.open(participant("b1"), 1, None).await.expect("the live session");
		let gone = Handover {
			session_id: "a session of nobody's".to_owned(),
			reason: Some("context full".to_owned()),
		};

		let opened =
			runtime.open(participant("b1"), 2, Some(gone)).await.expect("the session opens");

		assert_eq!(
			stored_session(&database, "b1", &live.id).await.status,
			RuntimeSessionStatus::Active,
			"a rotation naming a session the file does not hold ended the live one"
		);
		assert_eq!(live_session_count(&database).await, 2, "the rotation lost a live session");
		assert_eq!(opened.seq, 2, "the session that was opened did not continue the lineage");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_restore_point_is_read_through_the_index_that_serves_it() {
		let dir = temp_dir();
		let database = seeded(&dir).await;

		let plan = database
			.call(|connection| {
				Ok(connection.query_row(
					&format!("EXPLAIN QUERY PLAN {LATEST_CHECKPOINT}"),
					params!["s1"],
					|row| row.get::<_, String>(3),
				)?)
			})
			.await
			.expect("the plan");

		assert!(
			plan.contains("context_checkpoints_per_session"),
			"a restore point is read without the index that serves it: {plan}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_start_naming_its_own_previous_session_ends_that_one_and_no_other() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let left_behind = runtime.open(participant("b1"), 1, None).await.expect("the first start");
		let beside_it =
			runtime.open(participant("b1"), 2, None).await.expect("the instance beside");

		runtime
			.open(participant("b1"), 3, leaving(&left_behind))
			.await
			.expect("the start that leaves the first one behind");

		let ended = stored_session(&database, "b1", &left_behind.id).await;
		assert_eq!(
			ended.status,
			RuntimeSessionStatus::Ended,
			"a start that named the session it left behind kept that row live"
		);
		assert_eq!(ended.ended_at, Some(3), "the session it left behind never ended");
		assert_eq!(ended.rotation_reason, None, "a start with no reason invented one");
		assert_eq!(
			stored_session(&database, "b1", &beside_it.id).await.status,
			RuntimeSessionStatus::Active,
			"the start ended an instance the caller never named"
		);
		assert_eq!(live_session_count(&database).await, 2, "the start lost a live session");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_start_naming_its_own_previous_session_opens_on_that_sessions_checkpoint() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let left_behind = runtime.open(participant("b1"), 1, None).await.expect("the first start");
		let beside_it =
			runtime.open(participant("b1"), 2, None).await.expect("the instance beside");
		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), left_behind.id.clone(), 4))
			.await
			.expect("the outgoing instance folds its own history");
		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), beside_it.id.clone(), 4))
			.await
			.expect("the instance beside it folds the same stretch");

		let opened = runtime
			.open(participant("b1"), 3, leaving(&left_behind))
			.await
			.expect("the start that leaves the first one behind");

		assert_eq!(
			restore_point(&database, &opened.id).await,
			Some(4),
			"the start opened on an empty transcript instead of what it left behind"
		);
		assert_eq!(
			restore_point(&database, &beside_it.id).await,
			Some(4),
			"the start carried away the restore point of an instance it never named"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn two_instances_of_one_bot_read_back_their_own_restore_point() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let first = runtime.open(participant("b1"), 1, None).await.expect("the first instance");
		let second = runtime.open(participant("b1"), 2, None).await.expect("the second instance");

		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), first.id.clone(), 4))
			.await
			.expect("the first instance folds its own history");
		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), second.id.clone(), 12))
			.await
			.expect("the second instance folds its own history");

		assert_eq!(
			restore_point(&database, &first.id).await,
			Some(4),
			"an instance was rebuilt from the checkpoint of the one beside it"
		);
		assert_eq!(
			restore_point(&database, &second.id).await,
			Some(12),
			"an instance lost its own restore point to the one beside it"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_session_opened_by_rotation_reads_back_the_checkpoint_of_the_one_it_replaced() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let rotated = runtime.open(participant("b1"), 1, None).await.expect("the first instance");
		let beside_it =
			runtime.open(participant("b1"), 2, None).await.expect("the second instance");
		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), rotated.id.clone(), 4))
			.await
			.expect("the outgoing instance folds its own history");
		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), beside_it.id.clone(), 12))
			.await
			.expect("the instance beside it folds its own history");

		let opened = runtime
			.open(participant("b1"), 3, rotating(&rotated))
			.await
			.expect("the rotation opens a session");

		assert_eq!(
			restore_point(&database, &opened.id).await,
			Some(4),
			"the rotation dropped the checkpoint taken on the session it replaced"
		);
		assert_eq!(
			restore_point(&database, &beside_it.id).await,
			Some(12),
			"the rotation carried away the restore point of an instance it never named"
		);
		assert_eq!(
			restore_point(&database, &rotated.id).await,
			None,
			"the checkpoint stayed under the session the rotation ended"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_failed_session_does_not_stand_in_the_way_of_the_next_one() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let first = runtime.open(participant("b1"), 1, None).await.expect("the first session");

		runtime
			.fail(first.id.clone(), 2, "the process died".to_owned())
			.await
			.expect("the failure is recorded");
		let reopened = runtime.open(participant("b1"), 3, None).await.expect("the next session");

		let sessions = runtime.sessions_for(participant("b1")).await.expect("the sessions");
		let failed = sessions.first().expect("the failed session");
		assert_eq!(failed.status, RuntimeSessionStatus::Failed, "the failure was not recorded");
		assert_eq!(failed.ended_at, Some(2), "the failed session never ended");
		assert_eq!(failed.rotation_reason.as_deref(), Some("the process died"));
		assert_eq!(reopened.seq, 2, "the lineage restarted instead of continuing");
		assert_eq!(
			runtime.active_session(participant("b1")).await.expect("the live session"),
			Some(reopened),
			"the session opened after a failure is not the live one"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_latest_checkpoint_is_the_furthest_one_into_the_transcript() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");

		for last_message_seq in [4, 12, 8] {
			runtime
				.checkpoint(a_checkpoint_at(
					participant("b1"),
					session.id.clone(),
					last_message_seq,
				))
				.await
				.expect("the checkpoint is stored");
		}

		assert_eq!(
			runtime
				.latest_checkpoint(session.id.clone())
				.await
				.expect("the latest checkpoint")
				.map(|checkpoint| checkpoint.last_message_seq),
			Some(12),
			"the checkpoint chosen is not the furthest into the transcript"
		);
		assert_eq!(
			runtime
				.checkpoints_for(participant("b1"))
				.await
				.expect("the checkpoints")
				.iter()
				.map(|checkpoint| checkpoint.last_message_seq)
				.collect::<Vec<_>>(),
			vec![4, 8, 12],
			"the checkpoints came back in the order they were written"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn sessions_and_checkpoints_are_read_back_as_they_were_written() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");
		runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");
		runtime
			.checkpoint(a_checkpoint_at(participant("b1"), session.id.clone(), 7))
			.await
			.expect("the checkpoint is stored");
		let sessions_before = runtime.sessions_for(participant("b1")).await.expect("the sessions");
		let checkpoints_before =
			runtime.checkpoints_for(participant("b1")).await.expect("the checkpoints");
		drop(database);

		let reopened = opened(&dir);

		assert_eq!(
			reopened.runtime_context().sessions_for(participant("b1")).await.expect("the sessions"),
			sessions_before,
			"a session did not come back as it was written"
		);
		assert_eq!(
			reopened
				.runtime_context()
				.checkpoints_for(participant("b1"))
				.await
				.expect("the checkpoints"),
			checkpoints_before,
			"a checkpoint did not come back as it was written"
		);

		drop(reopened);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_call_naming_a_session_the_file_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();

		let closed = runtime.close("no such session".to_owned(), 2).await;

		assert!(closed.is_err(), "closing a session that does not exist reported success");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn is_conflict(outcome: &Result<(), DatabaseError>) -> bool {
		matches!(outcome, Err(DatabaseError::Conflict))
	}

	#[tokio::test]
	async fn a_late_callback_never_rewrites_a_session_that_was_already_replaced() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let replaced = runtime.open(participant("b1"), 1, None).await.expect("the first session");
		runtime.open(participant("b1"), 5, rotating(&replaced)).await.expect("the second session");

		let closed = runtime.close(replaced.id.clone(), 9).await;
		let failed = runtime.fail(replaced.id.clone(), 9, "the process died".to_owned()).await;

		assert!(is_conflict(&closed), "a late close reached a replaced session: {closed:?}");
		assert!(is_conflict(&failed), "a late failure reached a replaced session: {failed:?}");
		let stored = stored_session(&database, "b1", &replaced.id).await;
		assert_eq!(
			stored.status,
			RuntimeSessionStatus::Rotated,
			"a refused write moved the status"
		);
		assert_eq!(stored.ended_at, Some(5), "a refused write moved the ending");
		assert_eq!(
			stored.rotation_reason.as_deref(),
			Some("context full"),
			"a refused write moved the reason"
		);
		assert_eq!(
			live_session_count(&database).await,
			1,
			"the participant holds two live sessions"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn two_endings_disagreeing_about_one_session_leave_the_first_one_standing() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let closed_first = runtime.open(participant("b1"), 1, None).await.expect("b1's session");
		let failed_first = runtime.open(participant("b2"), 1, None).await.expect("b2's session");

		runtime.close(closed_first.id.clone(), 4).await.expect("the session closes");
		let failed_after =
			runtime.fail(closed_first.id.clone(), 4, "the process died".to_owned()).await;
		runtime
			.fail(failed_first.id.clone(), 6, "the process died".to_owned())
			.await
			.expect("the failure is recorded");
		let closed_after = runtime.close(failed_first.id.clone(), 6).await;

		assert!(
			is_conflict(&failed_after),
			"a failure overtook a recorded close: {failed_after:?}"
		);
		assert!(
			is_conflict(&closed_after),
			"a close overtook a recorded failure: {closed_after:?}"
		);
		let closed = stored_session(&database, "b1", &closed_first.id).await;
		assert_eq!(closed.status, RuntimeSessionStatus::Ended, "a refused failure took the ending");
		assert_eq!(closed.rotation_reason, None, "a refused failure left its reason behind");
		let failed = stored_session(&database, "b2", &failed_first.id).await;
		assert_eq!(failed.status, RuntimeSessionStatus::Failed, "a refused close took the ending");
		assert_eq!(failed.rotation_reason.as_deref(), Some("the process died"));
		assert_eq!(live_session_count(&database).await, 0, "a session that ended stayed live");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_same_ending_arriving_twice_is_the_same_ending() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let closing = runtime.open(participant("b1"), 1, None).await.expect("b1's session");
		let failing = runtime.open(participant("b2"), 1, None).await.expect("b2's session");
		runtime.close(closing.id.clone(), 4).await.expect("the session closes");
		runtime
			.fail(failing.id.clone(), 6, "the process died".to_owned())
			.await
			.expect("the failure is recorded");

		let closed_again = runtime.close(closing.id.clone(), 4).await;
		let failed_again = runtime.fail(failing.id.clone(), 6, "the process died".to_owned()).await;

		assert!(closed_again.is_ok(), "the same close twice was refused: {closed_again:?}");
		assert!(failed_again.is_ok(), "the same failure twice was refused: {failed_again:?}");
		let closed = stored_session(&database, "b1", &closing.id).await;
		assert_eq!(closed.status, RuntimeSessionStatus::Ended);
		assert_eq!(closed.ended_at, Some(4), "a replay wrote a second ending");
		let failed = stored_session(&database, "b2", &failing.id).await;
		assert_eq!(failed.status, RuntimeSessionStatus::Failed);
		assert_eq!(failed.ended_at, Some(6), "a replay wrote a second ending");
		assert_eq!(live_session_count(&database).await, 0, "a session that ended stayed live");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_second_provider_session_id_never_replaces_the_first() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");
		runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");

		let replayed = runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await;
		let rewritten = runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-0000".to_owned(),
			)
			.await;

		assert!(replayed.is_ok(), "the same provider id twice was refused: {replayed:?}");
		assert!(is_conflict(&rewritten), "a provider id was rewritten: {rewritten:?}");
		let stored = stored_session(&database, "b1", &session.id).await;
		assert_eq!(
			stored.provider_session_id.as_deref(),
			Some("claude-9f3c"),
			"a refused write replaced the process the lineage follows"
		);
		assert_eq!(
			live_session_count(&database).await,
			1,
			"the participant holds two live sessions"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_session_that_is_no_longer_live_takes_no_provider_id() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let rotated = runtime.open(participant("b1"), 1, None).await.expect("b1's first session");
		runtime
			.record_provider_session(
				participant("b1"),
				rotated.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");
		let ended = runtime
			.open(participant("b1"), 5, rotating(&rotated))
			.await
			.expect("b1's second session");
		runtime.close(ended.id.clone(), 6).await.expect("the session closes");
		let failed = runtime.open(participant("b2"), 1, None).await.expect("b2's session");
		runtime
			.fail(failed.id.clone(), 2, "the process died".to_owned())
			.await
			.expect("the failure is recorded");

		let onto_rotated = runtime
			.record_provider_session(
				participant("b1"),
				rotated.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await;
		let onto_ended = runtime
			.record_provider_session(participant("b1"), ended.id.clone(), "claude-0000".to_owned())
			.await;
		let onto_failed = runtime
			.record_provider_session(participant("b2"), failed.id.clone(), "claude-1111".to_owned())
			.await;

		assert!(
			is_conflict(&onto_rotated),
			"a replaced session took its own id back: {onto_rotated:?}"
		);
		assert!(is_conflict(&onto_ended), "a closed session took a provider id: {onto_ended:?}");
		assert!(is_conflict(&onto_failed), "a failed session took a provider id: {onto_failed:?}");
		assert_eq!(
			stored_session(&database, "b1", &rotated.id).await.provider_session_id.as_deref(),
			Some("claude-9f3c")
		);
		assert_eq!(
			stored_session(&database, "b1", &ended.id).await.provider_session_id,
			None,
			"a refused write named the process of a session that had ended"
		);
		assert_eq!(
			stored_session(&database, "b2", &failed.id).await.provider_session_id,
			None,
			"a refused write named the process of a session that had failed"
		);
		assert_eq!(live_session_count(&database).await, 0, "a session that ended stayed live");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_recorded_provider_session_id_is_never_a_row_of_ours() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		let runtime = database.runtime_context();
		let session = runtime.open(participant("b1"), 1, None).await.expect("the session");
		assert_eq!(
			session.provider_session_id, None,
			"a session was opened already named by Claude"
		);

		runtime
			.record_provider_session(
				participant("b1"),
				session.id.clone(),
				"claude-9f3c".to_owned(),
			)
			.await
			.expect("the provider session is recorded");

		let live = runtime
			.active_session(participant("b1"))
			.await
			.expect("the live session")
			.expect("the session is still live");
		assert_eq!(live.provider_session_id.as_deref(), Some("claude-9f3c"));
		assert_eq!(live.id, session.id, "recording the provider id moved the row's own id");
		assert_ne!(live.id, "claude-9f3c", "the row took the provider's id for its own");
		assert_eq!(
			rows_named(&database, "claude-9f3c".to_owned()).await,
			0,
			"a provider id was stored as a session id"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
