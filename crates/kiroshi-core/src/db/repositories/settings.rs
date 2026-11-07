use rusqlite::{params_from_iter, Connection, OptionalExtension};

use crate::db::DatabaseError;

pub struct Settings {
	read: String,
	write: String,
	clear: String,
}

impl Settings {
	pub fn new(table: &str, scope_column: Option<&str>) -> Self {
		let columns = scope_column.map_or("key".to_owned(), |scope| format!("{scope}, key"));
		let matched =
			scope_column.map_or("key = ?".to_owned(), |scope| format!("{scope} = ? AND key = ?"));
		let placeholders = scope_column.map_or("?, ?", |_| "?, ?, ?");
		Self {
			read: format!("SELECT value FROM {table} WHERE {matched}"),
			write: format!(
				"INSERT INTO {table} ({columns}, value) VALUES ({placeholders})
	ON CONFLICT ({columns}) DO UPDATE SET value = excluded.value"
			),
			clear: format!("DELETE FROM {table} WHERE {matched}"),
		}
	}

	pub fn read(
		&self,
		connection: &Connection,
		scope: Option<&str>,
		key: &str,
	) -> Result<Option<String>, DatabaseError> {
		let bound = params_from_iter(scope.into_iter().chain([key]));
		Ok(connection.query_row(&self.read, bound, |row| row.get(0)).optional()?)
	}

	pub fn write(
		&self,
		connection: &Connection,
		scope: Option<&str>,
		key: &str,
		value: &str,
	) -> Result<(), DatabaseError> {
		connection.execute(&self.write, params_from_iter(scope.into_iter().chain([key, value])))?;
		Ok(())
	}

	pub fn clear(
		&self,
		connection: &Connection,
		scope: Option<&str>,
		key: &str,
	) -> Result<(), DatabaseError> {
		connection.execute(&self.clear, params_from_iter(scope.into_iter().chain([key])))?;
		Ok(())
	}
}
