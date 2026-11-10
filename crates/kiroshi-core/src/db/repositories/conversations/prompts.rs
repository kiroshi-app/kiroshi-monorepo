use std::collections::BTreeMap;

use rusqlite::types::{Type, Value};
use rusqlite::{params, params_from_iter, Connection, Row};

use super::{ConversationError, ConversationsRepository};
use crate::agent::contract::{PermissionRequest, QuestionRequest};
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

	fn read(stored: &str) -> Option<Self> {
		match stored {
			"question" => Some(PromptKind::Question),
			"permission" => Some(PromptKind::Permission),
			_ => None,
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
	pub pending_prompt: Option<StoredPrompt>,
	pub working_bot_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoredPrompt {
	Readable(WaitingPrompt),
	Undecodable { prompt_id: String, kind: Option<PromptKind>, failure: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WaitingPrompt {
	pub prompt_id: String,
	pub kind: PromptKind,
	pub text: String,
}

const HOLD_PROMPT: &str = "INSERT INTO pending_prompts
	(runtime_session_id, prompt_id, conversation_id, kind, request, asked_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6)
	ON CONFLICT (runtime_session_id, prompt_id) DO NOTHING";

const RELEASE_PROMPT: &str =
	"DELETE FROM pending_prompts WHERE runtime_session_id = ?1 AND prompt_id = ?2";

const RELEASE_PROMPTS_OF_SESSION: &str =
	"DELETE FROM pending_prompts WHERE runtime_session_id = ?1";

const CLOSE_PROMPTS_OF_SESSION: &str =
	"DELETE FROM pending_prompts WHERE runtime_session_id = ?1 RETURNING prompt_id, kind";

const RELEASE_EVERY_PROMPT: &str = "DELETE FROM pending_prompts";

const RELEASE_ORPHAN_PROMPTS: &str = "DELETE FROM pending_prompts
	WHERE conversation_id = ?1 AND asked_at < ?2 AND runtime_session_id NOT IN";

pub const HAS_OPEN_TURN: &str = "EXISTS (SELECT 1 FROM turns AS open_turn
	WHERE open_turn.conversation_id = conversations.id AND open_turn.completed_at IS NULL)";

pub const OPEN_TURN_BOTS: &str =
	"(SELECT json_group_array(json_array(working.bot_id, working.started_at)) FROM (
		SELECT reply.author_bot_id AS bot_id, open_turn.started_at AS started_at
			FROM turns AS open_turn
			JOIN messages AS reply
				ON reply.turn_id = open_turn.id AND reply.role = 'assistant'
			WHERE open_turn.conversation_id = conversations.id
				AND open_turn.completed_at IS NULL AND reply.author_bot_id IS NOT NULL
		UNION ALL
		SELECT run.bot_id, open_turn.started_at FROM turns AS open_turn
			JOIN turn_runs AS run ON run.turn_id = open_turn.id
			WHERE open_turn.conversation_id = conversations.id
				AND open_turn.completed_at IS NULL) AS working)";

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

	pub async fn close_prompts_of_session(
		&self,
		runtime_session_id: String,
	) -> Result<Vec<(PromptKind, String)>, ConversationError> {
		Ok(self
			.call(move |connection| {
				let mut statement = connection.prepare_cached(CLOSE_PROMPTS_OF_SESSION)?;
				let rows = statement.query_map([runtime_session_id], held_prompt)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
			.at("close_prompts_of_session", "pending_prompts")?)
	}

	pub async fn release_every_prompt(&self) -> Result<(), ConversationError> {
		Ok(self
			.call(|connection| {
				release_every_prompt(connection)?;
				Ok(())
			})
			.await
			.at("release_every_prompt", "pending_prompts")?)
	}

	pub async fn release_orphan_prompts(
		&self,
		conversation_id: String,
		live_sessions: Vec<String>,
		asked_before: i64,
	) -> Result<(), ConversationError> {
		Ok(self
			.call(move |connection| {
				let slots: Vec<String> =
					(3..live_sessions.len() + 3).map(|slot| format!("?{slot}")).collect();
				let mut bound = vec![Value::Text(conversation_id), Value::Integer(asked_before)];
				bound.extend(live_sessions.into_iter().map(Value::Text));
				connection
					.prepare(&format!("{RELEASE_ORPHAN_PROMPTS} ({})", slots.join(", ")))?
					.execute(params_from_iter(bound))?;
				Ok(())
			})
			.await
			.at("release_orphan_prompts", "pending_prompts")?)
	}

	pub async fn activity_of(&self, ids: Vec<String>) -> Result<Vec<Activity>, ConversationError> {
		Ok(self
			.call(move |connection| activities(connection, &ids))
			.await
			.at("activity_of", "pending_prompts")?)
	}

	pub async fn rooms_of_working_bots(
		&self,
		space_id: String,
	) -> Result<BTreeMap<String, Vec<String>>, ConversationError> {
		Ok(self
			.call(move |connection| rooms_of_working_bots(connection, &space_id))
			.await
			.at("rooms_of_working_bots", "turns")?)
	}
}

pub(in crate::db) fn release_every_prompt(connection: &Connection) -> rusqlite::Result<usize> {
	connection.prepare_cached(RELEASE_EVERY_PROMPT)?.execute([])
}

fn activities(connection: &Connection, ids: &[String]) -> Result<Vec<Activity>, DatabaseError> {
	if ids.is_empty() {
		return Ok(Vec::new());
	}
	let slots: Vec<String> = (1..=ids.len()).map(|slot| format!("?{slot}")).collect();
	let mut statement = connection.prepare(&format!(
		"SELECT conversations.id, conversations.space_id, {HAS_OPEN_TURN},
			first_prompt.prompt_id, first_prompt.kind, first_prompt.request, {OPEN_TURN_BOTS}
		FROM conversations
		LEFT JOIN pending_prompts AS first_prompt ON first_prompt.rowid = (
			SELECT asked.rowid FROM pending_prompts AS asked
				WHERE asked.conversation_id = conversations.id
				ORDER BY asked.asked_at, asked.prompt_id LIMIT 1)
		WHERE conversations.id IN ({})",
		slots.join(", ")
	))?;
	let rows = statement.query_map(params_from_iter(ids), |row| {
		Ok(Activity {
			conversation_id: row.get(0)?,
			space_id: row.get(1)?,
			has_open_turn: row.get(2)?,
			pending_prompt: waiting_prompt(row)?,
			working_bot_ids: in_start_order(open_turn_starts(&row.get::<_, String>(6)?)?),
		})
	})?;
	Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn held_prompt(row: &Row<'_>) -> rusqlite::Result<(PromptKind, String)> {
	let stored_kind: String = row.get(1)?;
	let kind = PromptKind::read(&stored_kind).ok_or_else(|| {
		let failure = format!("its kind {stored_kind:?} is neither a question nor a permission");
		rusqlite::Error::FromSqlConversionFailure(1, Type::Text, failure.into())
	})?;
	Ok((kind, row.get(0)?))
}

fn rooms_of_working_bots(
	connection: &Connection,
	space_id: &str,
) -> Result<BTreeMap<String, Vec<String>>, DatabaseError> {
	let mut statement = connection.prepare_cached(&rooms_of_working_bots_statement())?;
	let rows = statement.query_map([space_id], |row| {
		Ok((row.get::<_, String>(0)?, open_turn_starts(&row.get::<_, String>(1)?)?))
	})?;
	let mut started: BTreeMap<String, Vec<(i64, String)>> = BTreeMap::new();
	for row in rows {
		let (conversation_id, starts) = row?;
		for (bot_id, started_at) in starts {
			started.entry(bot_id).or_default().push((started_at, conversation_id.clone()));
		}
	}
	Ok(started.into_iter().map(|(bot_id, rooms)| (bot_id, newest_first(rooms))).collect())
}

fn rooms_of_working_bots_statement() -> String {
	format!(
		"SELECT conversations.id, {OPEN_TURN_BOTS}
		FROM (SELECT DISTINCT conversation_id FROM turns WHERE completed_at IS NULL) AS open_room
		CROSS JOIN conversations ON conversations.id = open_room.conversation_id
		WHERE conversations.space_id = ?1"
	)
}

fn newest_first(mut rooms: Vec<(i64, String)>) -> Vec<String> {
	rooms.sort_by(|(left_at, left_id), (right_at, right_id)| {
		right_at.cmp(left_at).then_with(|| left_id.cmp(right_id))
	});
	rooms.into_iter().map(|(_, conversation_id)| conversation_id).collect()
}

fn waiting_prompt(row: &Row<'_>) -> rusqlite::Result<Option<StoredPrompt>> {
	let Some(prompt_id) = row.get::<_, Option<String>>(3)? else {
		return Ok(None);
	};
	let stored_kind: String = row.get(4)?;
	let Some(kind) = PromptKind::read(&stored_kind) else {
		let failure = format!("its kind {stored_kind:?} is neither a question nor a permission");
		return Ok(Some(StoredPrompt::Undecodable { prompt_id, kind: None, failure }));
	};
	let request: String = row.get(5)?;
	Ok(Some(match prompt_text(kind, &request) {
		Ok(text) => StoredPrompt::Readable(WaitingPrompt { prompt_id, kind, text }),
		Err(failure) => StoredPrompt::Undecodable {
			prompt_id,
			kind: Some(kind),
			failure: format!(
				"its request is not a {} ({:?} at line {} column {})",
				kind.stored(),
				failure.classify(),
				failure.line(),
				failure.column()
			),
		},
	}))
}

fn prompt_text(kind: PromptKind, request: &str) -> serde_json::Result<String> {
	Ok(match kind {
		PromptKind::Question => serde_json::from_str::<QuestionRequest>(request)?.text(),
		PromptKind::Permission => serde_json::from_str::<PermissionRequest>(request)?.title,
	})
}

pub fn open_turn_starts(links: &str) -> rusqlite::Result<BTreeMap<String, i64>> {
	let links: Vec<(String, i64)> = serde_json::from_str(links).map_err(|error| {
		rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error))
	})?;
	let mut earliest: BTreeMap<String, i64> = BTreeMap::new();
	for (bot_id, started_at) in links {
		let start = earliest.entry(bot_id).or_insert(started_at);
		*start = (*start).min(started_at);
	}
	Ok(earliest)
}

fn in_start_order(starts: BTreeMap<String, i64>) -> Vec<String> {
	let mut starts: Vec<(String, i64)> = starts.into_iter().collect();
	starts.sort_by(|(left_id, left_at), (right_id, right_at)| {
		left_at.cmp(right_at).then_with(|| left_id.cmp(right_id))
	});
	starts.into_iter().map(|(bot_id, _)| bot_id).collect()
}

#[cfg(any(test, feature = "test-support"))]
pub fn a_pending_prompt(conversation_id: &str, kind: PromptKind) -> PendingPrompt {
	PendingPrompt {
		runtime_session_id: "rs1".to_owned(),
		prompt_id: "p1".to_owned(),
		conversation_id: conversation_id.to_owned(),
		kind,
		request: a_request(kind),
		asked_at: 1,
	}
}

#[cfg(any(test, feature = "test-support"))]
fn a_request(kind: PromptKind) -> String {
	use crate::agent::contract::AskedQuestion;

	let request = match kind {
		PromptKind::Question => serde_json::to_value(QuestionRequest {
			id: "p1".to_owned(),
			questions: vec![AskedQuestion {
				header: "Branch".to_owned(),
				question: "Which branch ships?".to_owned(),
				options: Vec::new(),
				multi_select: false,
			}],
			subject: None,
		}),
		PromptKind::Permission => serde_json::to_value(PermissionRequest {
			id: "p1".to_owned(),
			tool_name: "Bash".to_owned(),
			title: "Run git push".to_owned(),
			detail: None,
		}),
	};
	request.expect("a request serializes").to_string()
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::open;

	#[tokio::test]
	async fn the_rooms_of_working_bots_are_read_from_the_open_turns_and_never_from_every_room() {
		let dir = temp_dir();
		let database = open(&dir);

		let plan = database
			.call(|connection| {
				let mut statement = connection.prepare(&format!(
					"EXPLAIN QUERY PLAN {}",
					rooms_of_working_bots_statement()
				))?;
				let steps = statement.query_map(["personal"], |row| row.get::<_, String>(3))?;
				Ok(steps.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
			.expect("the plan");

		assert!(
			plan.iter().any(|step| step.contains("turns_open_by_conversation")),
			"the open turns are read without their index: {plan:?}"
		);
		assert!(
			!plan.iter().any(|step| step.starts_with("SCAN conversations")),
			"every room of the space is scanned: {plan:?}"
		);
	}
}
