use rusqlite::types::Type;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::de::DeserializeOwned;
use serde::Serialize;

use super::messages::rename_document_links;
use crate::db::connection::Located;
use crate::db::{Access, DatabaseError};
use crate::library::contract::{
	LibraryComment, LibraryCommentAnchor, LibraryCommentCount, LibraryCommentParty,
	LibraryCommentPartyKind, LibraryCommentThreadState,
};

const THREADS: &str = "library_comment_threads";

const INSERT_THREAD: &str =
	"INSERT INTO library_comment_threads (id, space_id, item_name, anchor, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5)";

const INSERT_COMMENT: &str = "INSERT INTO library_comments
		(thread_id, position, author_kind, author_id, created_at, text, mentions)
	VALUES (?1, (SELECT COUNT(*) FROM library_comments WHERE thread_id = ?1), ?2, ?3, ?4, ?5, ?6)";

const SELECT_THREADS_OF_ITEM: &str = "SELECT id, space_id, item_name, anchor, state
	FROM library_comment_threads WHERE space_id = ?1 AND item_name = ?2
	ORDER BY created_at, rowid";

const SELECT_THREAD: &str = "SELECT id, space_id, item_name, anchor, state
	FROM library_comment_threads WHERE space_id = ?1 AND item_name = ?2 AND id = ?3";

const SELECT_COMMENTS: &str = "SELECT author_kind, author_id, created_at, text, mentions
	FROM library_comments WHERE thread_id = ?1 ORDER BY position";

const SET_THREAD_STATE: &str = "UPDATE library_comment_threads SET state = ?4
	WHERE space_id = ?1 AND item_name = ?2 AND id = ?3";

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
					thread.opening.created_at
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

	pub async fn set_state(
		&self,
		thread: ThreadOfItem,
		state: LibraryCommentThreadState,
	) -> Result<Option<StoredThread>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.prepare_cached(SET_THREAD_STATE)?.execute(params![
					thread.space_id,
					thread.item_name,
					thread.id,
					state_text(state)
				])?;
				let settled = read_thread(&transaction, &thread)?;
				transaction.commit()?;
				Ok(settled)
			})
			.await
			.at("set_state", THREADS)
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
	})
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

fn state_text(state: LibraryCommentThreadState) -> &'static str {
	match state {
		LibraryCommentThreadState::Open => "open",
		LibraryCommentThreadState::Resolved => "resolved",
	}
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

	use super::{COUNT_OPEN_THREADS, SELECT_THREADS_OF_ITEM};
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
