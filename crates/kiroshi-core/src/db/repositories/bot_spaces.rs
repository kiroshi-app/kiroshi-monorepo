use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Transaction};

pub(in crate::db) fn spaces_of(
	connection: &Connection,
	bot_id: &str,
) -> rusqlite::Result<Vec<String>> {
	let mut statement = connection.prepare_cached(
		"SELECT space_id FROM bot_spaces WHERE bot_id = ?1 ORDER BY joined_at ASC, space_id ASC",
	)?;
	let rows = statement.query_map([bot_id], |row| row.get(0))?;
	rows.collect()
}

pub(in crate::db) fn held(
	connection: &Connection,
	bot_id: &str,
	space_id: &str,
) -> rusqlite::Result<bool> {
	connection.query_row(
		"SELECT EXISTS (SELECT 1 FROM bot_spaces WHERE bot_id = ?1 AND space_id = ?2)",
		params![bot_id, space_id],
		|row| row.get(0),
	)
}

pub(in crate::db) fn join(
	transaction: &Transaction<'_>,
	bot_id: &str,
	space_id: &str,
	section_id: Option<&str>,
	pin_position: Option<i64>,
) -> rusqlite::Result<usize> {
	transaction.execute(
		"INSERT INTO bot_spaces (bot_id, space_id, section_id, pin_position, joined_at)
			VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (bot_id, space_id) DO NOTHING",
		params![bot_id, space_id, section_id, pin_position, now()],
	)
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
