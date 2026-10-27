use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params, params_from_iter, Connection, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};

use super::conversations::Hue;
use crate::db::{Access, DatabaseError};

type Row = Map<String, Value>;

pub type MintedIds = HashMap<String, String>;

const EXPORTED: &str = "WITH
	exported_conversations(id) AS (SELECT id FROM conversations WHERE space_id = ?1),
	exported_bots(id) AS (
		SELECT bot_id FROM bot_spaces WHERE space_id = ?1
		UNION SELECT bot_id FROM conversation_participants
			WHERE conversation_id IN exported_conversations
	)";

struct Table {
	name: &'static str,
	scope: &'static str,
	identities: &'static [&'static str],
	references: &'static [&'static str],
	embedding: &'static [&'static str],
	detached: &'static [&'static str],
	hued: Option<&'static str>,
}

impl Table {
	const fn new(name: &'static str, scope: &'static str) -> Self {
		Self {
			name,
			scope,
			identities: &[],
			references: &[],
			embedding: &[],
			detached: &[],
			hued: None,
		}
	}

	fn is_mapped(&self, column: &str) -> bool {
		self.identities.contains(&column) || self.references.contains(&column)
	}
}

const TABLES: &[Table] = &[
	Table { identities: &["id"], hued: Some("colour"), ..Table::new("spaces", "id = ?1") },
	Table {
		references: &["space_id"],
		embedding: &["value"],
		..Table::new("space_settings", "space_id = ?1")
	},
	Table { identities: &["id"], references: &["space_id"], ..Table::new("sections", "space_id = ?1") },
	Table {
		identities: &["id"],
		hued: Some("avatar_color"),
		..Table::new("bots", "id IN exported_bots")
	},
	Table {
		references: &["bot_id", "space_id", "section_id"],
		..Table::new("bot_spaces", "space_id = ?1")
	},
	Table {
		identities: &["id"],
		references: &["space_id", "section_id"],
		hued: Some("color"),
		..Table::new("conversations", "id IN exported_conversations")
	},
	Table {
		references: &["conversation_id", "bot_id"],
		..Table::new("conversation_participants", "conversation_id IN exported_conversations")
	},
	Table {
		identities: &["id"],
		references: &["conversation_id"],
		..Table::new("turns", "conversation_id IN exported_conversations")
	},
	Table {
		identities: &["id"],
		references: &["conversation_id", "turn_id", "author_bot_id", "replied_to_message_id"],
		detached: &["runtime_session_id"],
		..Table::new("messages", "conversation_id IN exported_conversations")
	},
	Table {
		references: &["conversation_id", "message_id"],
		..Table::new("message_pins", "conversation_id IN exported_conversations")
	},
	Table {
		identities: &["id"],
		references: &["turn_id"],
		..Table::new(
			"activities",
			"turn_id IN (SELECT id FROM turns WHERE conversation_id IN exported_conversations)",
		)
	},
	Table {
		identities: &["id"],
		references: &["conversation_id", "bot_id"],
		..Table::new(
			"context_checkpoints",
			"conversation_id IN exported_conversations AND runtime_session_id IS NULL",
		)
	},
	Table {
		identities: &["id"],
		references: &["conversation_id", "bot_id", "invited_by_bot_id"],
		..Table::new("conversation_arrivals", "conversation_id IN exported_conversations")
	},
	Table {
		identities: &["id"],
		references: &["conversation_id", "destination_id"],
		..Table::new("application_installs", "conversation_id IN exported_conversations")
	},
	Table {
		identities: &["id", "trigger_key"],
		references: &["conversation_id", "bot_id"],
		..Table::new("routines", "conversation_id IN exported_conversations")
	},
	Table {
		identities: &["id"],
		references: &["routine_id", "reported_turn_id"],
		..Table::new(
			"routine_runs",
			"routine_id IN (SELECT id FROM routines WHERE conversation_id IN exported_conversations)",
		)
	},
	Table {
		references: &["routine_id"],
		..Table::new(
			"routine_dedupe_values",
			"routine_id IN (SELECT id FROM routines WHERE conversation_id IN exported_conversations)",
		)
	},
	Table {
		identities: &["id", "delivery_key"],
		references: &["origin_conversation_id", "bot_id", "thread_conversation_id", "reported_turn_id"],
		..Table::new(
			"missions",
			"origin_conversation_id IN exported_conversations
				AND thread_conversation_id IN exported_conversations",
		)
	},
	Table {
		identities: &["id"],
		references: &["mission_id"],
		..Table::new(
			"mission_events",
			"mission_id IN (SELECT id FROM missions
				WHERE origin_conversation_id IN exported_conversations
					AND thread_conversation_id IN exported_conversations)",
		)
	},
];

struct SpaceOwned {
	table: &'static str,
	column: &'static str,
	is_nullable: bool,
}

const SPACE_OWNED: &[SpaceOwned] = &[
	SpaceOwned { table: "spaces", column: "id", is_nullable: false },
	SpaceOwned { table: "space_settings", column: "space_id", is_nullable: false },
	SpaceOwned { table: "sections", column: "space_id", is_nullable: false },
	SpaceOwned { table: "bot_spaces", column: "space_id", is_nullable: false },
	SpaceOwned { table: "conversations", column: "space_id", is_nullable: true },
];

#[derive(Debug)]
pub enum SpaceRowsError {
	Database(DatabaseError),
	UnknownSpace { id: String },
	Unportable { table: &'static str, column: String },
	Malformed { detail: String },
}

impl From<DatabaseError> for SpaceRowsError {
	fn from(error: DatabaseError) -> Self {
		Self::Database(error)
	}
}

impl From<rusqlite::Error> for SpaceRowsError {
	fn from(error: rusqlite::Error) -> Self {
		Self::Database(DatabaseError::Sqlite(error))
	}
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SpaceRows {
	tables: BTreeMap<String, Vec<Row>>,
}

impl SpaceRows {
	fn of(&self, table: &str) -> &[Row] {
		self.tables.get(table).map_or(&[], Vec::as_slice)
	}

	fn texts(&self, table: &str, column: &str) -> Vec<String> {
		self.of(table)
			.iter()
			.filter_map(|row| row.get(column).and_then(Value::as_str).map(str::to_owned))
			.collect()
	}

	pub fn seated_bot_ids(&self) -> Vec<String> {
		self.texts("bot_spaces", "bot_id")
	}

	pub fn bot_name(&self, id: &str) -> Option<&str> {
		self.of("bots")
			.iter()
			.find(|row| row.get("id").and_then(Value::as_str) == Some(id))
			.and_then(|row| row.get("name")?.as_str())
	}

	pub fn conversation_ids(&self) -> Vec<String> {
		self.texts("conversations", "id")
	}

	pub fn avatar_paths(&self) -> Vec<String> {
		self.texts("bots", "avatar_image_path")
	}

	pub fn relocate_avatars(&mut self, relocated: impl Fn(&str) -> Option<String>) {
		let Some(bots) = self.tables.get_mut("bots") else {
			return;
		};
		for row in bots {
			if let Some(Value::String(path)) = row.get("avatar_image_path") {
				let placed = relocated(path).map_or(Value::Null, Value::String);
				row.insert("avatar_image_path".to_owned(), placed);
			}
		}
	}

	pub fn relocate_message_contents(&mut self, relocated: impl Fn(&str) -> String) {
		let Some(messages) = self.tables.get_mut("messages") else {
			return;
		};
		for row in messages {
			if let Some(Value::String(content)) = row.get_mut("content") {
				*content = relocated(content);
			}
		}
	}
}

pub struct SpaceRowsRepository {
	access: Access,
}

impl SpaceRowsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn read(&self, space_id: String) -> Result<SpaceRows, SpaceRowsError> {
		self.access.call_mut(move |connection| Ok(read(connection, &space_id))).await?
	}

	pub async fn held_ids(
		&self,
		rows: SpaceRows,
	) -> Result<(SpaceRows, HashSet<String>), SpaceRowsError> {
		self.access
			.call(move |connection| Ok(held_ids(connection, &rows).map(|held| (rows, held))))
			.await?
	}

	pub async fn write(
		&self,
		rows: SpaceRows,
		space_id: String,
		minted: MintedIds,
		now: i64,
	) -> Result<String, SpaceRowsError> {
		self.access
			.call_mut(move |connection| Ok(written(connection, &rows, &space_id, &minted, now)))
			.await?
	}
}

fn read(connection: &mut Connection, space_id: &str) -> Result<SpaceRows, SpaceRowsError> {
	let transaction = connection.transaction_with_behavior(TransactionBehavior::Deferred)?;
	let held: bool = transaction.query_row(
		"SELECT EXISTS (SELECT 1 FROM spaces WHERE id = ?1)",
		[space_id],
		|row| row.get(0),
	)?;
	if !held {
		return Err(SpaceRowsError::UnknownSpace { id: space_id.to_owned() });
	}
	let mut tables = BTreeMap::new();
	for table in TABLES {
		tables.insert(table.name.to_owned(), rows_of(&transaction, table, space_id)?);
	}
	transaction.commit()?;
	Ok(SpaceRows { tables })
}

fn rows_of(
	connection: &Connection,
	table: &Table,
	space_id: &str,
) -> Result<Vec<Row>, SpaceRowsError> {
	let sql =
		format!("{EXPORTED} SELECT * FROM {} WHERE {} ORDER BY rowid", table.name, table.scope);
	let mut statement = connection.prepare(&sql)?;
	let columns: Vec<String> = statement.column_names().into_iter().map(str::to_owned).collect();
	let mut rows = statement.query([space_id])?;
	let mut read = Vec::new();
	while let Some(row) = rows.next()? {
		let mut exported = Row::new();
		for (index, column) in columns.iter().enumerate() {
			let value = match table.detached.contains(&column.as_str()) {
				true => Value::Null,
				false => json_of(row.get_ref(index)?).ok_or_else(|| {
					SpaceRowsError::Unportable { table: table.name, column: column.clone() }
				})?,
			};
			exported.insert(column.clone(), value);
		}
		read.push(exported);
	}
	Ok(read)
}

fn json_of(value: ValueRef<'_>) -> Option<Value> {
	match value {
		ValueRef::Null => Some(Value::Null),
		ValueRef::Integer(integer) => Some(integer.into()),
		ValueRef::Real(real) => Number::from_f64(real).map(Value::Number),
		ValueRef::Text(text) => std::str::from_utf8(text).ok().map(|text| text.to_owned().into()),
		ValueRef::Blob(_) => None,
	}
}

fn held_ids(connection: &Connection, rows: &SpaceRows) -> Result<HashSet<String>, SpaceRowsError> {
	let mut held = HashSet::new();
	for table in TABLES {
		for column in table.identities {
			let mut statement = connection.prepare(&format!(
				"SELECT EXISTS (SELECT 1 FROM {} WHERE {column} = ?1)",
				table.name
			))?;
			for id in rows.texts(table.name, column).into_iter().filter(|id| !id.is_empty()) {
				if statement.query_row([&id], |row| row.get(0))? {
					held.insert(id);
				}
			}
		}
	}
	Ok(held)
}

fn written(
	connection: &mut Connection,
	rows: &SpaceRows,
	space_id: &str,
	minted: &MintedIds,
	now: i64,
) -> Result<String, SpaceRowsError> {
	refuse_foreign_rows(rows, space_id)?;
	let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
	transaction.pragma_update(None, "defer_foreign_keys", true)?;
	for table in TABLES {
		let columns = columns_of(&transaction, table.name)?;
		for row in rows.of(table.name) {
			inserted(&transaction, table, &columns, &rewritten(table, row, minted))?;
		}
	}
	let imported_space = mapped(space_id, minted);
	transaction.execute(
		"UPDATE spaces SET position = (SELECT COALESCE(MAX(position) + 1, 0) FROM spaces)
			WHERE id = ?1",
		[&imported_space],
	)?;
	retire_unseated(&transaction, rows, minted, now)?;
	transaction.commit()?;
	Ok(imported_space)
}

fn refuse_foreign_rows(rows: &SpaceRows, space_id: &str) -> Result<(), SpaceRowsError> {
	if rows.texts("spaces", "id") != [space_id] {
		return Err(malformed("the archive must hold exactly the space its manifest names"));
	}
	for SpaceOwned { table, column, is_nullable } in SPACE_OWNED {
		let foreign = rows.of(table).iter().any(|row| match row.get(*column) {
			Some(Value::String(owner)) => owner != space_id,
			Some(Value::Null) => !is_nullable,
			_ => true,
		});
		if foreign {
			return Err(malformed(&format!("a row of {table} belongs to another space")));
		}
	}
	Ok(())
}

fn columns_of(connection: &Connection, table: &str) -> Result<HashSet<String>, SpaceRowsError> {
	let mut statement = connection.prepare("SELECT name FROM pragma_table_info(?1)")?;
	let names = statement.query_map([table], |row| row.get(0))?;
	Ok(names.collect::<rusqlite::Result<HashSet<String>>>()?)
}

fn rewritten(table: &Table, row: &Row, minted: &MintedIds) -> Row {
	row.iter()
		.map(|(column, value)| {
			let rewritten = match value {
				Value::String(text) if table.is_mapped(column) => mapped(text, minted).into(),
				Value::String(text) if table.embedding.contains(&column.as_str()) => {
					embedded(text, minted).into()
				}
				Value::String(name) if table.hued == Some(column.as_str()) => {
					Hue::named(name).map_or_else(|| value.clone(), |hue| hue.value().into())
				}
				_ => value.clone(),
			};
			(column.clone(), rewritten)
		})
		.collect()
}

fn mapped(id: &str, minted: &MintedIds) -> String {
	minted.get(id).cloned().unwrap_or_else(|| id.to_owned())
}

fn embedded(text: &str, minted: &MintedIds) -> String {
	minted.iter().fold(text.to_owned(), |text, (held, fresh)| text.replace(held, fresh))
}

fn inserted(
	transaction: &Transaction<'_>,
	table: &Table,
	columns: &HashSet<String>,
	row: &Row,
) -> Result<(), SpaceRowsError> {
	if let Some(unknown) = row.keys().find(|column| !columns.contains(*column)) {
		return Err(malformed(&format!("{} has no column {unknown}", table.name)));
	}
	let names: Vec<&str> = row.keys().map(String::as_str).collect();
	let slots: Vec<String> = (1..=names.len()).map(|slot| format!("?{slot}")).collect();
	let values = row.values().map(sql_of).collect::<Result<Vec<_>, _>>()?;
	transaction.execute(
		&format!("INSERT INTO {} ({}) VALUES ({})", table.name, names.join(", "), slots.join(", ")),
		params_from_iter(values),
	)?;
	Ok(())
}

fn sql_of(value: &Value) -> Result<SqlValue, SpaceRowsError> {
	match value {
		Value::Null => Ok(SqlValue::Null),
		Value::String(text) => Ok(SqlValue::Text(text.clone())),
		Value::Number(number) => number
			.as_i64()
			.map(SqlValue::Integer)
			.or_else(|| number.as_f64().map(SqlValue::Real))
			.ok_or_else(|| malformed("a number does not fit a column")),
		Value::Bool(_) | Value::Array(_) | Value::Object(_) => {
			Err(malformed("a column holds neither text, a number nor null"))
		}
	}
}

fn retire_unseated(
	transaction: &Transaction<'_>,
	rows: &SpaceRows,
	minted: &MintedIds,
	now: i64,
) -> Result<(), SpaceRowsError> {
	for bot_id in rows.texts("bots", "id") {
		transaction.execute(
			"UPDATE bots SET deleted_at = ?2
				WHERE id = ?1 AND deleted_at IS NULL
					AND NOT EXISTS (SELECT 1 FROM bot_spaces WHERE bot_id = ?1)",
			params![mapped(&bot_id, minted), now],
		)?;
	}
	Ok(())
}

fn malformed(detail: &str) -> SpaceRowsError {
	SpaceRowsError::Malformed { detail: detail.to_owned() }
}
