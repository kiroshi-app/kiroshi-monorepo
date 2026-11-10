use rusqlite::types::{FromSql, FromSqlResult, ToSql, ToSqlOutput, ValueRef};

const HOST_OWNER: &str = "host";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChatOwner {
	Host,
	Member(String),
}

impl ToSql for ChatOwner {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(match self {
			ChatOwner::Host => HOST_OWNER,
			ChatOwner::Member(account_id) => account_id.as_str(),
		}))
	}
}

impl FromSql for ChatOwner {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		Ok(match value.as_str()? {
			HOST_OWNER => ChatOwner::Host,
			account_id => ChatOwner::Member(account_id.to_owned()),
		})
	}
}
