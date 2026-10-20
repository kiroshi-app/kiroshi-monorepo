use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageRole {
	User,
	Assistant,
}

impl MessageRole {
	pub(super) fn as_sql(self) -> &'static str {
		match self {
			MessageRole::User => "user",
			MessageRole::Assistant => "assistant",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"user" => Some(MessageRole::User),
			"assistant" => Some(MessageRole::Assistant),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WrittenFrom {
	Here,
	Relay,
}

impl WrittenFrom {
	pub(super) fn as_sql(self) -> &'static str {
		match self {
			WrittenFrom::Here => "here",
			WrittenFrom::Relay => "relay",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"here" => Some(WrittenFrom::Here),
			"relay" => Some(WrittenFrom::Relay),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageState {
	Pending,
	Streaming,
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl MessageState {
	pub(super) fn as_sql(self) -> &'static str {
		match self {
			MessageState::Pending => "pending",
			MessageState::Streaming => "streaming",
			MessageState::Complete => "complete",
			MessageState::Cancelled => "cancelled",
			MessageState::Failed => "failed",
			MessageState::Interrupted => "interrupted",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"pending" => Some(MessageState::Pending),
			"streaming" => Some(MessageState::Streaming),
			"complete" => Some(MessageState::Complete),
			"cancelled" => Some(MessageState::Cancelled),
			"failed" => Some(MessageState::Failed),
			"interrupted" => Some(MessageState::Interrupted),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalState {
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl From<TerminalState> for MessageState {
	fn from(state: TerminalState) -> Self {
		match state {
			TerminalState::Complete => MessageState::Complete,
			TerminalState::Cancelled => MessageState::Cancelled,
			TerminalState::Failed => MessageState::Failed,
			TerminalState::Interrupted => MessageState::Interrupted,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityStatus {
	Pending,
	Running,
	Succeeded,
	Failed,
	Terminated,
}

impl ActivityStatus {
	pub(super) fn as_sql(self) -> &'static str {
		match self {
			ActivityStatus::Pending => "pending",
			ActivityStatus::Running => "running",
			ActivityStatus::Succeeded => "succeeded",
			ActivityStatus::Failed => "failed",
			ActivityStatus::Terminated => "terminated",
		}
	}

	fn parse(text: &str) -> Option<Self> {
		match text {
			"pending" => Some(ActivityStatus::Pending),
			"running" => Some(ActivityStatus::Running),
			"succeeded" => Some(ActivityStatus::Succeeded),
			"failed" => Some(ActivityStatus::Failed),
			"terminated" => Some(ActivityStatus::Terminated),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InitialStatus {
	Pending,
	Running,
}

impl From<InitialStatus> for ActivityStatus {
	fn from(status: InitialStatus) -> Self {
		match status {
			InitialStatus::Pending => ActivityStatus::Pending,
			InitialStatus::Running => ActivityStatus::Running,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalStatus {
	Succeeded,
	Failed,
	Terminated,
}

impl From<TerminalStatus> for ActivityStatus {
	fn from(status: TerminalStatus) -> Self {
		match status {
			TerminalStatus::Succeeded => ActivityStatus::Succeeded,
			TerminalStatus::Failed => ActivityStatus::Failed,
			TerminalStatus::Terminated => ActivityStatus::Terminated,
		}
	}
}

macro_rules! stored_as_text {
	($name:ident) => {
		impl ToSql for $name {
			fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
				Ok(ToSqlOutput::from(self.as_sql()))
			}
		}

		impl FromSql for $name {
			fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
				$name::parse(value.as_str()?).ok_or(FromSqlError::InvalidType)
			}
		}
	};
}

stored_as_text!(MessageRole);
stored_as_text!(MessageState);
stored_as_text!(WrittenFrom);
stored_as_text!(ActivityStatus);

pub(in crate::db) use stored_as_text;
