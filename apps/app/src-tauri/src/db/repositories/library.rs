use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;

use super::conversations::{open_comment_room, ConversationError};
use super::messages::rename_document_links;
use crate::db::connection::Located;
use crate::db::{Access, DatabaseError};
use crate::library::contract::{
	LibraryBoardPoint, LibraryComment, LibraryCommentAgentTurn, LibraryCommentAgentTurnState,
	LibraryCommentAgentTurnsChanged, LibraryCommentAnchor, LibraryCommentCount,
	LibraryCommentParty, LibraryCommentPartyKind, LibraryCommentThreadState,
	LibraryCommentTurnFailure,
};

const THREADS: &str = "library_comment_threads";

const INSERT_THREAD: &str = "INSERT INTO library_comment_threads
		(id, space_id, item_name, anchor, created_at, last_board_x, last_board_y)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";

const INSERT_COMMENT: &str = "INSERT INTO library_comments
		(thread_id, position, author_kind, author_id, created_at, text, mentions)
	VALUES (?1, (SELECT COUNT(*) FROM library_comments WHERE thread_id = ?1), ?2, ?3, ?4, ?5, ?6)";

const SELECT_THREADS_OF_ITEM: &str = "SELECT id, space_id, item_name, anchor, state,
		resolved_by_kind, resolved_by_id, resolved_at, last_board_x, last_board_y
	FROM library_comment_threads WHERE space_id = ?1 AND item_name = ?2
	ORDER BY created_at, rowid";

const SELECT_THREAD: &str = "SELECT id, space_id, item_name, anchor, state,
		resolved_by_kind, resolved_by_id, resolved_at, last_board_x, last_board_y
	FROM library_comment_threads WHERE space_id = ?1 AND item_name = ?2 AND id = ?3";

const SELECT_ANCHORS_OF_ITEM: &str =
	"SELECT id, anchor FROM library_comment_threads WHERE space_id = ?1 AND item_name = ?2";

const SELECT_COMMENTS: &str = "SELECT author_kind, author_id, created_at, text, mentions
	FROM library_comments WHERE thread_id = ?1 ORDER BY position";

const RESOLVE_OPEN_THREAD: &str = "UPDATE library_comment_threads
	SET state = 'resolved', resolved_by_kind = ?4, resolved_by_id = ?5, resolved_at = ?6
	WHERE space_id = ?1 AND item_name = ?2 AND id = ?3 AND state = 'open'";

const REOPEN_THREAD: &str = "UPDATE library_comment_threads
	SET state = 'open', resolved_by_kind = NULL, resolved_by_id = NULL, resolved_at = NULL
	WHERE space_id = ?1 AND item_name = ?2 AND id = ?3";

const SET_LAST_BOARD_POINT: &str =
	"UPDATE library_comment_threads SET last_board_x = ?2, last_board_y = ?3 WHERE id = ?1";

const AGENT_TURNS: &str = "library_comment_agent_turns";

const START_IN_A_NEW_ROOM: &str = "INSERT INTO library_comment_agent_turns
		(thread_id, agent_id, running_since, conversation_id)
	VALUES (?1, ?2, ?3, ?4)
	ON CONFLICT (thread_id, agent_id) DO UPDATE
		SET conversation_id = excluded.conversation_id, failure = NULL, failed_at = NULL,
			running_since = excluded.running_since";

const START_IN_ITS_ROOM: &str = "UPDATE library_comment_agent_turns
	SET failure = NULL, failed_at = NULL, running_since = ?3
	WHERE thread_id = ?1 AND agent_id = ?2 AND conversation_id IS NOT NULL
	RETURNING conversation_id";

const SET_TURN_FAILURE: &str =
	"INSERT INTO library_comment_agent_turns (thread_id, agent_id, failure, failed_at)
	VALUES (?1, ?2, ?3, ?4)
	ON CONFLICT (thread_id, agent_id) DO UPDATE
		SET failure = excluded.failure, failed_at = excluded.failed_at, running_since = NULL";

const CLEAR_RUNNING: &str = "UPDATE library_comment_agent_turns SET running_since = NULL
	WHERE thread_id = ?1 AND agent_id = ?2";

const SELECT_RUNNING_TURNS: &str = "SELECT threads.space_id, turns.thread_id, turns.agent_id
	FROM library_comment_agent_turns AS turns
	JOIN library_comment_threads AS threads ON threads.id = turns.thread_id
	WHERE turns.running_since IS NOT NULL
	ORDER BY turns.thread_id, turns.agent_id";

const FAIL_RUNNING_TURNS: &str = "UPDATE library_comment_agent_turns
	SET running_since = NULL, failure = 'turnFailed', failed_at = ?1
	WHERE running_since IS NOT NULL";

const SELECT_FAILED_TURNS_OF_SPACE: &str = "SELECT turns.thread_id, turns.agent_id, turns.failure,
		turns.failed_at
	FROM library_comment_threads AS threads
	JOIN library_comment_agent_turns AS turns ON turns.thread_id = threads.id
	WHERE threads.space_id = ?1 AND turns.failure IS NOT NULL
	ORDER BY turns.failed_at, turns.thread_id, turns.agent_id";

const SELECT_AGENT_REPLIED_FROM: &str = "SELECT EXISTS (SELECT 1 FROM library_comments
	WHERE thread_id = ?1 AND author_kind = 'agent' AND author_id = ?2 AND position >= ?3)";

const COUNT_OPEN_THREADS: &str = "SELECT item_name, COUNT(*) FROM library_comment_threads
	WHERE space_id = ?1 AND state = 'open' GROUP BY item_name ORDER BY item_name";

const MOVE_THREADS: &str = "UPDATE library_comment_threads SET item_name = ?3
	WHERE space_id = ?1 AND item_name = ?2";

const DELETE_THREADS: &str =
	"DELETE FROM library_comment_threads WHERE space_id = ?1 AND item_name = ?2";

pub struct NewThread {
	pub id: String,
	pub space_id: String,
	pub item_name: String,
	pub anchor: LibraryCommentAnchor,
	pub opening: LibraryComment,
	pub last_board_point: Option<LibraryBoardPoint>,
}

pub struct ThreadOfItem {
	pub space_id: String,
	pub item_name: String,
	pub id: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StoredThread {
	pub id: String,
	pub space_id: String,
	pub item_name: String,
	pub anchor: LibraryCommentAnchor,
	pub state: LibraryCommentThreadState,
	pub comments: Vec<LibraryComment>,
	pub resolution: Option<Resolution>,
	pub last_board_point: Option<LibraryBoardPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolution {
	pub by: LibraryCommentParty,
	pub at: i64,
}

pub struct AgentOfThread {
	pub thread_id: String,
	pub agent_id: String,
}

pub struct LibraryRepository {
	access: Access,
}

impl LibraryRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn open_thread(&self, thread: NewThread) -> Result<StoredThread, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.prepare_cached(INSERT_THREAD)?.execute(params![
					thread.id,
					thread.space_id,
					thread.item_name,
					as_json(&thread.anchor)?,
					thread.opening.created_at,
					thread.last_board_point.map(|point| point.x),
					thread.last_board_point.map(|point| point.y)
				])?;
				store_comment(&transaction, &thread.id, &thread.opening)?;
				transaction.commit()?;
				Ok(StoredThread {
					id: thread.id,
					space_id: thread.space_id,
					item_name: thread.item_name,
					anchor: thread.anchor,
					state: LibraryCommentThreadState::Open,
					comments: vec![thread.opening],
					resolution: None,
					last_board_point: thread.last_board_point,
				})
			})
			.await
			.at("open_thread", THREADS)
	}

	pub async fn reply(
		&self,
		thread: ThreadOfItem,
		comment: LibraryComment,
	) -> Result<Option<StoredThread>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				if read_thread(&transaction, &thread)?.is_none() {
					return Ok(None);
				}
				store_comment(&transaction, &thread.id, &comment)?;
				let replied = read_thread(&transaction, &thread)?;
				transaction.commit()?;
				Ok(replied)
			})
			.await
			.at("reply", "library_comments")
	}

	pub async fn resolve(
		&self,
		thread: ThreadOfItem,
		resolution: Resolution,
	) -> Result<Option<StoredThread>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.prepare_cached(RESOLVE_OPEN_THREAD)?.execute(params![
					thread.space_id,
					thread.item_name,
					thread.id,
					party_kind_text(resolution.by.kind),
					resolution.by.id,
					resolution.at
				])?;
				let resolved = read_thread(&transaction, &thread)?;
				transaction.commit()?;
				Ok(resolved)
			})
			.await
			.at("resolve", THREADS)
	}

	pub async fn reopen(
		&self,
		thread: ThreadOfItem,
	) -> Result<Option<StoredThread>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.prepare_cached(REOPEN_THREAD)?.execute(params![
					thread.space_id,
					thread.item_name,
					thread.id
				])?;
				let reopened = read_thread(&transaction, &thread)?;
				transaction.commit()?;
				Ok(reopened)
			})
			.await
			.at("reopen", THREADS)
	}

	pub async fn follow_board_nodes(
		&self,
		space_id: String,
		item_name: String,
		point_of: impl Fn(&str) -> Option<LibraryBoardPoint> + Send + 'static,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let anchors = transaction
					.prepare_cached(SELECT_ANCHORS_OF_ITEM)?
					.query_map(params![space_id, item_name], |row| {
						Ok((row.get::<_, String>(0)?, from_json::<LibraryCommentAnchor>(row, 1)?))
					})?
					.collect::<Result<Vec<_>, _>>()?;
				for (thread_id, anchor) in anchors {
					let LibraryCommentAnchor::BoardNode { node_id } = anchor else {
						continue;
					};
					if let Some(point) = point_of(&node_id) {
						transaction
							.prepare_cached(SET_LAST_BOARD_POINT)?
							.execute(params![thread_id, point.x, point.y])?;
					}
				}
				transaction.commit()?;
				Ok(())
			})
			.await
			.at("follow_board_nodes", THREADS)
	}

	pub async fn threads(
		&self,
		space_id: String,
		item_name: String,
	) -> Result<Vec<StoredThread>, DatabaseError> {
		self.access
			.call(move |connection| {
				let threads = connection
					.prepare_cached(SELECT_THREADS_OF_ITEM)?
					.query_map(params![space_id, item_name], thread_without_comments)?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(threads
					.into_iter()
					.map(|thread| with_comments(connection, thread))
					.collect::<Result<_, _>>()?)
			})
			.await
			.at("threads", THREADS)
	}

	pub async fn open_thread_counts(
		&self,
		space_id: String,
	) -> Result<Vec<LibraryCommentCount>, DatabaseError> {
		self.access
			.call(move |connection| {
				let counts = connection
					.prepare_cached(COUNT_OPEN_THREADS)?
					.query_map(params![space_id], |row| {
						Ok(LibraryCommentCount {
							item_name: row.get(0)?,
							open_threads: row.get(1)?,
						})
					})?
					.collect::<Result<_, _>>()?;
				Ok(counts)
			})
			.await
			.at("open_thread_counts", THREADS)
	}

	pub async fn agent_turn_started(
		&self,
		thread: ThreadOfItem,
		agent_id: String,
		started_at: i64,
	) -> Result<Option<String>, ConversationError> {
		self.access
			.call_mut(move |connection| {
				Ok(room_of_started_turn(connection, &thread, &agent_id, started_at))
			})
			.await?
			.at("agent_turn_started", AGENT_TURNS)
	}

	pub async fn agent_turn_replied(&self, turn: AgentOfThread) -> Result<(), DatabaseError> {
		self.access
			.call(move |connection| {
				connection
					.prepare_cached(CLEAR_RUNNING)?
					.execute(params![turn.thread_id, turn.agent_id])?;
				Ok(())
			})
			.await
			.at("agent_turn_replied", AGENT_TURNS)
	}

	pub async fn fail_running_agent_turns(
		&self,
		failed_at: i64,
	) -> Result<Vec<LibraryCommentAgentTurnsChanged>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let running = transaction
					.prepare_cached(SELECT_RUNNING_TURNS)?
					.query_map([], |row| {
						Ok(LibraryCommentAgentTurnsChanged {
							space_id: row.get(0)?,
							thread_id: row.get(1)?,
							agent_id: row.get(2)?,
						})
					})?
					.collect::<Result<_, _>>()?;
				transaction.prepare_cached(FAIL_RUNNING_TURNS)?.execute(params![failed_at])?;
				transaction.commit()?;
				Ok(running)
			})
			.await
			.at("fail_running_agent_turns", AGENT_TURNS)
	}

	pub async fn agent_replied_from(
		&self,
		turn: AgentOfThread,
		position: u32,
	) -> Result<bool, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.prepare_cached(SELECT_AGENT_REPLIED_FROM)?
					.query_row(params![turn.thread_id, turn.agent_id, position], |row| {
						row.get(0)
					})?)
			})
			.await
			.at("agent_replied_from", "library_comments")
	}

	pub async fn agent_turn_failed(
		&self,
		turn: AgentOfThread,
		reason: LibraryCommentTurnFailure,
		failed_at: i64,
	) -> Result<(), DatabaseError> {
		self.access
			.call(move |connection| {
				connection.prepare_cached(SET_TURN_FAILURE)?.execute(params![
					turn.thread_id,
					turn.agent_id,
					failure_text(reason),
					failed_at
				])?;
				Ok(())
			})
			.await
			.at("agent_turn_failed", AGENT_TURNS)
	}

	pub async fn failed_agent_turns(
		&self,
		space_id: String,
	) -> Result<Vec<LibraryCommentAgentTurn>, DatabaseError> {
		self.access
			.call(move |connection| {
				let failed = connection
					.prepare_cached(SELECT_FAILED_TURNS_OF_SPACE)?
					.query_map(params![space_id], failed_turn)?
					.collect::<Result<_, _>>()?;
				Ok(failed)
			})
			.await
			.at("failed_agent_turns", AGENT_TURNS)
	}

	pub async fn item_renamed(
		&self,
		space_id: String,
		former_name: String,
		name: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				rename_document_links(&transaction, &space_id, &former_name, &name)?;
				transaction.prepare_cached(MOVE_THREADS)?.execute(params![
					space_id,
					former_name,
					name
				])?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.at("item_renamed", THREADS)
	}

	pub async fn item_deleted(
		&self,
		space_id: String,
		item_name: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call(move |connection| {
				connection.prepare_cached(DELETE_THREADS)?.execute(params![space_id, item_name])?;
				Ok(())
			})
			.await
			.at("item_deleted", THREADS)
	}
}

fn store_comment(
	connection: &Connection,
	thread_id: &str,
	comment: &LibraryComment,
) -> rusqlite::Result<()> {
	connection.prepare_cached(INSERT_COMMENT)?.execute(params![
		thread_id,
		party_kind_text(comment.author.kind),
		comment.author.id,
		comment.created_at,
		comment.text,
		as_json(&comment.mentions)?
	])?;
	Ok(())
}

fn room_of_started_turn(
	connection: &mut Connection,
	thread: &ThreadOfItem,
	agent_id: &str,
	started_at: i64,
) -> Result<Option<String>, ConversationError> {
	let transaction = connection.transaction()?;
	if read_thread(&transaction, thread)?.is_none() {
		return Ok(None);
	}
	let room = match started_in_its_room(&transaction, &thread.id, agent_id, started_at)? {
		Some(room) => room,
		None => {
			let room =
				open_comment_room(&transaction, &thread.space_id, agent_id, &thread.item_name)?;
			transaction
				.prepare_cached(START_IN_A_NEW_ROOM)?
				.execute(params![thread.id, agent_id, started_at, room])?;
			room
		}
	};
	transaction.commit()?;
	Ok(Some(room))
}

fn started_in_its_room(
	transaction: &Transaction<'_>,
	thread_id: &str,
	agent_id: &str,
	started_at: i64,
) -> rusqlite::Result<Option<String>> {
	transaction
		.prepare_cached(START_IN_ITS_ROOM)?
		.query_row(params![thread_id, agent_id, started_at], |row| row.get(0))
		.optional()
}

fn failed_turn(row: &Row<'_>) -> rusqlite::Result<LibraryCommentAgentTurn> {
	Ok(LibraryCommentAgentTurn {
		thread_id: row.get(0)?,
		agent_id: row.get(1)?,
		state: LibraryCommentAgentTurnState::Failed {
			reason: text_column(row, 2, turn_failure)?,
			failed_at: row.get(3)?,
		},
	})
}

fn failure_text(reason: LibraryCommentTurnFailure) -> &'static str {
	match reason {
		LibraryCommentTurnFailure::NoReply => "noReply",
		LibraryCommentTurnFailure::TurnFailed => "turnFailed",
	}
}

fn turn_failure(text: &str) -> Option<LibraryCommentTurnFailure> {
	match text {
		"noReply" => Some(LibraryCommentTurnFailure::NoReply),
		"turnFailed" => Some(LibraryCommentTurnFailure::TurnFailed),
		_ => None,
	}
}

fn read_thread(
	connection: &Connection,
	thread: &ThreadOfItem,
) -> rusqlite::Result<Option<StoredThread>> {
	connection
		.prepare_cached(SELECT_THREAD)?
		.query_row(params![thread.space_id, thread.item_name, thread.id], thread_without_comments)
		.optional()?
		.map(|thread| with_comments(connection, thread))
		.transpose()
}

fn thread_without_comments(row: &Row<'_>) -> rusqlite::Result<StoredThread> {
	Ok(StoredThread {
		id: row.get(0)?,
		space_id: row.get(1)?,
		item_name: row.get(2)?,
		anchor: from_json(row, 3)?,
		state: text_column(row, 4, thread_state)?,
		comments: Vec::new(),
		resolution: resolution(row)?,
		last_board_point: board_point(row.get(8)?, row.get(9)?),
	})
}

fn resolution(row: &Row<'_>) -> rusqlite::Result<Option<Resolution>> {
	let Some(at) = row.get(7)? else {
		return Ok(None);
	};
	let by = LibraryCommentParty { kind: text_column(row, 5, party_kind)?, id: row.get(6)? };
	Ok(Some(Resolution { by, at }))
}

fn board_point(x: Option<i64>, y: Option<i64>) -> Option<LibraryBoardPoint> {
	x.zip(y).map(|(x, y)| LibraryBoardPoint { x, y })
}

fn with_comments(connection: &Connection, thread: StoredThread) -> rusqlite::Result<StoredThread> {
	let comments = connection
		.prepare_cached(SELECT_COMMENTS)?
		.query_map(params![thread.id], read_comment)?
		.collect::<Result<_, _>>()?;
	Ok(StoredThread { comments, ..thread })
}

fn read_comment(row: &Row<'_>) -> rusqlite::Result<LibraryComment> {
	Ok(LibraryComment {
		author: LibraryCommentParty { kind: text_column(row, 0, party_kind)?, id: row.get(1)? },
		created_at: row.get(2)?,
		text: row.get(3)?,
		mentions: from_json(row, 4)?,
	})
}

fn thread_state(text: &str) -> Option<LibraryCommentThreadState> {
	match text {
		"open" => Some(LibraryCommentThreadState::Open),
		"resolved" => Some(LibraryCommentThreadState::Resolved),
		_ => None,
	}
}

fn party_kind_text(kind: LibraryCommentPartyKind) -> &'static str {
	match kind {
		LibraryCommentPartyKind::Person => "person",
		LibraryCommentPartyKind::Agent => "agent",
	}
}

fn party_kind(text: &str) -> Option<LibraryCommentPartyKind> {
	match text {
		"person" => Some(LibraryCommentPartyKind::Person),
		"agent" => Some(LibraryCommentPartyKind::Agent),
		_ => None,
	}
}

fn text_column<T>(
	row: &Row<'_>,
	index: usize,
	parsed: impl FnOnce(&str) -> Option<T>,
) -> rusqlite::Result<T> {
	let text: String = row.get(index)?;
	parsed(&text).ok_or_else(|| rusqlite::Error::InvalidColumnType(index, text, Type::Text))
}

fn as_json(value: &impl Serialize) -> rusqlite::Result<String> {
	serde_json::to_string(value)
		.map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn from_json<T: DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
	serde_json::from_str(&row.get::<_, String>(index)?).map_err(|error| {
		rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
	})
}

#[cfg(test)]
mod tests {
	use rusqlite::{params_from_iter, Connection};

	use super::{COUNT_OPEN_THREADS, SELECT_ANCHORS_OF_ITEM, SELECT_THREADS_OF_ITEM};
	use crate::db::connection::temp_dir;

	fn plan_of(
		connection: &Connection,
		statement: &str,
		bound: &[&str],
	) -> rusqlite::Result<Vec<String>> {
		connection
			.prepare(&format!("EXPLAIN QUERY PLAN {statement}"))?
			.query_map(params_from_iter(bound), |row| row.get("detail"))?
			.collect()
	}

	#[tokio::test]
	async fn the_threads_of_an_item_and_the_open_counts_are_read_through_the_item_index() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);

		let plans = database
			.call(|connection| {
				Ok([
					plan_of(connection, SELECT_THREADS_OF_ITEM, &["personal", "notes.md"])?,
					plan_of(connection, SELECT_ANCHORS_OF_ITEM, &["personal", "plan.canvas"])?,
					plan_of(connection, COUNT_OPEN_THREADS, &["personal"])?,
				])
			})
			.await
			.expect("the plans");

		for plan in plans {
			assert!(
				plan.iter().any(|step| step.contains("library_comment_threads_by_item")),
				"the read seeks the threads of the space: got {plan:?}"
			);
			assert!(
				!plan.iter().any(|step| step.starts_with("SCAN library_comment_threads")),
				"the read never scans every thread: got {plan:?}"
			);
		}
	}
}
