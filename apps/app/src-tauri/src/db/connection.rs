use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

pub const FILE_NAME: &str = "conversations.sqlite3";

const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);

#[derive(Debug)]
pub enum DatabaseError {
	AppDataDir,
	JournalMode(String),
	PoisonedConnection,
	CallInterrupted,
	Conflict,
	Sqlite(rusqlite::Error),
	SqliteAt { operation: &'static str, table: &'static str, failure: rusqlite::Error },
}

impl From<rusqlite::Error> for DatabaseError {
	fn from(error: rusqlite::Error) -> Self {
		DatabaseError::Sqlite(error)
	}
}

pub trait Located {
	fn at(self, operation: &'static str, table: &'static str) -> Self;
}

impl Located for DatabaseError {
	fn at(self, operation: &'static str, table: &'static str) -> Self {
		match self {
			DatabaseError::Sqlite(failure) => DatabaseError::SqliteAt { operation, table, failure },
			located => located,
		}
	}
}

impl<T, E: Located> Located for Result<T, E> {
	fn at(self, operation: &'static str, table: &'static str) -> Self {
		self.map_err(|error| error.at(operation, table))
	}
}

pub fn file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, DatabaseError> {
	let dir = app.path().app_data_dir().map_err(|_| DatabaseError::AppDataDir)?;
	fs::create_dir_all(&dir).map_err(|_| DatabaseError::AppDataDir)?;
	Ok(dir.join(FILE_NAME))
}

pub fn open(path: &Path) -> Result<Connection, DatabaseError> {
	let connection = Connection::open(path)?;
	restrict_to_owner(path).map_err(|_| DatabaseError::AppDataDir)?;
	connection.pragma_update(None, "foreign_keys", "ON")?;
	connection.busy_timeout(BUSY_TIMEOUT)?;
	connection.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
	require_wal(&connection)?;
	Ok(connection)
}

fn require_wal(connection: &Connection) -> Result<(), DatabaseError> {
	let mode: String = connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
	if !mode.eq_ignore_ascii_case("wal") {
		return Err(DatabaseError::JournalMode(mode));
	}
	Ok(())
}

#[cfg(unix)]
fn restrict_to_owner(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) -> std::io::Result<()> {
	Ok(())
}

#[cfg(test)]
pub fn temp_dir() -> crate::removed_on_drop::RemovedOnDrop {
	let dir = crate::removed_on_drop::RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-db-{}", uuid::Uuid::new_v4())),
	);
	fs::create_dir_all(&*dir).expect("temp dir");
	dir
}

#[cfg(test)]
pub fn is_busy(error: &DatabaseError) -> bool {
	matches!(
		error,
		DatabaseError::Sqlite(rusqlite::Error::SqliteFailure(code, _))
			if code.code == rusqlite::ErrorCode::DatabaseBusy
	)
}

#[cfg(test)]
mod tests {
	use std::time::Instant;

	use super::*;

	const SHORT_TIMEOUT: Duration = Duration::from_millis(50);
	const GIVES_UP_WITHIN: Duration = Duration::from_secs(60);

	#[test]
	fn a_write_the_file_is_busy_for_gives_up_instead_of_waiting_forever() {
		let dir = temp_dir();
		let holder = open(&dir.join(FILE_NAME)).expect("open");
		let contender = open(&dir.join(FILE_NAME)).expect("open");
		contender.busy_timeout(SHORT_TIMEOUT).expect("busy timeout");
		holder.execute_batch("BEGIN EXCLUSIVE;").expect("the write lock is held");

		let started = Instant::now();
		let refused = contender.execute_batch("CREATE TABLE contended (id TEXT PRIMARY KEY);");

		let error = DatabaseError::from(refused.expect_err("a contended write was accepted"));
		assert!(
			is_busy(&error),
			"a contended write failed as something other than busy: {error:?}"
		);
		assert!(started.elapsed() < GIVES_UP_WITHIN, "the wait outlived the timeout it was given");

		drop(contender);
		drop(holder);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_connection_that_is_not_in_wal_is_refused_by_its_own_mode() {
		let connection = Connection::open_in_memory().expect("in memory");

		let refused = require_wal(&connection);

		assert!(
			matches!(&refused, Err(DatabaseError::JournalMode(mode)) if mode == "memory"),
			"the check accepted a journal a crash mid-write would cost: {refused:?}"
		);
	}
}
