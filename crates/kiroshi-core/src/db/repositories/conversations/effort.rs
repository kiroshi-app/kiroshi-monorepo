use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};

use super::super::messages::stored_as_text;
use crate::bundles::EffortLevel;

stored_as_text!(EffortLevel);
