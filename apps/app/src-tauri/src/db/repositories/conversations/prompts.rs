use rusqlite::{params, params_from_iter, Connection};

use super::{ConversationError, ConversationsRepository};
use crate::db::connection::Located as _;
use crate::db::DatabaseError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptKind {
	Question,
	Permission,
}

impl PromptKind {
	fn stored(self) -> &'static str {
		match self {
			PromptKind::Question => "question",
			PromptKind::Permission => "permission",
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingPrompt {
	pub runtime_session_id: String,
	pub prompt_id: String,
	pub conversation_id: String,
	pub kind: PromptKind,
	pub request: String,
	pub asked_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Activity {
	pub conversation_id: String,
	pub space_id: Option<String>,
	pub has_open_turn: bool,
	pub has_pending_prompt: bool,
}

const HOLD_PROMPT: &str = "INSERT INTO pending_prompts
	(runtime_session_id, prompt_id, conversation_id, kind, request, asked_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6)
	ON CONFLICT (runtime_session_id, prompt_id) DO NOTHING";

const RELEASE_PROMPT: &str =
	"DELETE FROM pending_prompts WHERE runtime_session_id = ?1 AND prompt_id = ?2";

const RELEASE_PROMPTS_OF_SESSION: &str =
	"DELETE FROM pending_prompts WHERE runtime_session_id = ?1";

pub(super) const HAS_OPEN_TURN: &str = "EXISTS (SELECT 1 FROM turns AS open_turn
	WHERE open_turn.conversation_id = conversations.id AND open_turn.completed_at IS NULL)";

impl ConversationsRepository {
	pub async fn hold_prompt(&self, prompt: PendingPrompt) -> Result<(), ConversationError> {
		Ok(self
			.call(move |connection| {
				connection.prepare_cached(HOLD_PROMPT)?.execute(params![
					prompt.runtime_session_id,
					prompt.prompt_id,
					prompt.conversation_id,
					prompt.kind.stored(),
					prompt.request,
					prompt.asked_at,
				])?;
				Ok(())
			})
			.await
			.at("hold_prompt", "pending_prompts")?)
	}

	pub async fn release_prompt(
		&self,
		runtime_session_id: String,
		prompt_id: String,
	) -> Result<(), ConversationError> {
		Ok(self
			.call(move |connection| {
				connection
					.prepare_cached(RELEASE_PROMPT)?
					.execute(params![runtime_session_id, prompt_id])?;
				Ok(())
			})
			.await
			.at("release_prompt", "pending_prompts")?)
	}

	pub async fn release_prompts_of_session(
		&self,
		runtime_session_id: String,
	) -> Result<(), ConversationError> {
		Ok(self
			.call(move |connection| {
				connection
					.prepare_cached(RELEASE_PROMPTS_OF_SESSION)?
					.execute([runtime_session_id])?;
				Ok(())
			})
			.await
			.at("release_prompts_of_session", "pending_prompts")?)
	}

	pub async fn activity_of(&self, ids: Vec<String>) -> Result<Vec<Activity>, ConversationError> {
		Ok(self
			.call(move |connection| activities(connection, &ids))
			.await
			.at("activity_of", "pending_prompts")?)
	}
}

fn activities(connection: &Connection, ids: &[String]) -> Result<Vec<Activity>, DatabaseError> {
	if ids.is_empty() {
		return Ok(Vec::new());
	}
	let slots: Vec<String> = (1..=ids.len()).map(|slot| format!("?{slot}")).collect();
	let mut statement = connection.prepare(&format!(
		"SELECT conversations.id, conversations.space_id, {HAS_OPEN_TURN},
			EXISTS (SELECT 1 FROM pending_prompts
				WHERE pending_prompts.conversation_id = conversations.id)
		FROM conversations WHERE conversations.id IN ({})",
		slots.join(", ")
	))?;
	let rows = statement.query_map(params_from_iter(ids), |row| {
		Ok(Activity {
			conversation_id: row.get(0)?,
			space_id: row.get(1)?,
			has_open_turn: row.get(2)?,
			has_pending_prompt: row.get(3)?,
		})
	})?;
	Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
pub(crate) fn a_pending_prompt(conversation_id: &str, kind: PromptKind) -> PendingPrompt {
	PendingPrompt {
		runtime_session_id: "rs1".to_owned(),
		prompt_id: "p1".to_owned(),
		conversation_id: conversation_id.to_owned(),
		kind,
		request: "{}".to_owned(),
		asked_at: 1,
	}
}
