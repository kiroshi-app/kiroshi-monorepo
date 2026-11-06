use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row, Transaction};
use uuid::Uuid;

const ARRIVAL_COLUMNS: &str =
	"SELECT id, conversation_id, bot_id, invited_by_bot_id, last_message_seq, created_at
	FROM conversation_arrivals";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arrival {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub invited_by_bot_id: Option<String>,
	pub last_message_seq: i64,
	pub created_at: i64,
}

pub(in crate::db) struct SeqSpan {
	pub(in crate::db) lowest: i64,
	pub(in crate::db) highest: i64,
}

pub(in crate::db) fn record(
	transaction: &Transaction<'_>,
	conversation_id: &str,
	bot_id: &str,
	invited_by_bot_id: Option<&str>,
) -> rusqlite::Result<Arrival> {
	transaction.query_row(
		"INSERT INTO conversation_arrivals
			(id, conversation_id, bot_id, invited_by_bot_id, last_message_seq, created_at)
			VALUES (?1, ?2, ?3, ?4,
				(SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?2), ?5)
			RETURNING id, conversation_id, bot_id, invited_by_bot_id, last_message_seq, created_at",
		params![Uuid::new_v4().to_string(), conversation_id, bot_id, invited_by_bot_id, now()],
		arrival,
	)
}

pub(in crate::db) fn within(
	connection: &Connection,
	conversation_id: &str,
	span: SeqSpan,
) -> rusqlite::Result<Vec<Arrival>> {
	let mut statement = connection.prepare_cached(&format!(
		"{ARRIVAL_COLUMNS} WHERE conversation_id = ?1
			AND last_message_seq >= ?2 AND last_message_seq <= ?3
			ORDER BY last_message_seq ASC, created_at ASC, id ASC"
	))?;
	let rows = statement.query_map(params![conversation_id, span.lowest, span.highest], arrival)?;
	rows.collect()
}

fn arrival(row: &Row<'_>) -> rusqlite::Result<Arrival> {
	Ok(Arrival {
		id: row.get("id")?,
		conversation_id: row.get("conversation_id")?,
		bot_id: row.get("bot_id")?,
		invited_by_bot_id: row.get("invited_by_bot_id")?,
		last_message_seq: row.get("last_message_seq")?,
		created_at: row.get("created_at")?,
	})
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
