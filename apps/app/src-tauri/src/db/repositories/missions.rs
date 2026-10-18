use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use serde_json::Value;
use uuid::Uuid;

use super::conversations::open_thread_under;
use super::keyset::{paged, Keyset, Page};
use super::messages::conversation_of_turn;
use crate::db::{Access, DatabaseError};
use crate::missions::contract::{
	CheckoutCounts, ConversationMissions, HookedMission, Mission, MissionActivity, MissionAnswer,
	MissionClosing, MissionDetail, MissionDossier, MissionDraft, MissionEntry, MissionError,
	MissionEvent, MissionEventKind, MissionFilter, MissionInSpace, MissionInThread, MissionRecord,
	MissionScope, MissionState, MissionStatus, MissionWatch, Ticket, WatchedMission,
};

const MAX_MISSIONS_PER_READ: u32 = 200;
const MAX_EVENTS_PER_MISSION: u32 = 500;
pub const AGENT_FRESHNESS_MS: i64 = 120_000;

impl ToSql for MissionEventKind {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(named(*self)?))
	}
}

impl FromSql for MissionEventKind {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		serde_json::from_value(Value::String(value.as_str()?.to_owned()))
			.map_err(|error| FromSqlError::Other(Box::new(error)))
	}
}

fn named(kind: MissionEventKind) -> rusqlite::Result<String> {
	match serde_json::to_value(kind) {
		Ok(Value::String(text)) => Ok(text),
		held => Err(rusqlite::Error::ToSqlConversionFailure(
			format!("a mission event kind did not serialise as a name: {held:?}").into(),
		)),
	}
}

pub(in crate::db) const MISSION_COLUMNS: &str =
	"SELECT id, origin_conversation_id, bot_id, thread_conversation_id,
	objective, ticket_platform, ticket_external_id, ticket_url, ticket_title, tools,
	opened_at, closed_at, reported_at, reported_turn_id,
	COALESCE((SELECT kind FROM mission_events
		WHERE mission_events.mission_id = missions.id
			AND mission_events.kind NOT IN ('note', 'agent_started', 'agent_stopped', 'status')
		ORDER BY mission_events.seq DESC LIMIT 1), 'opened') AS state_kind,
	COALESCE((SELECT seq FROM mission_events
		WHERE mission_events.mission_id = missions.id
			AND mission_events.kind NOT IN ('note', 'agent_started', 'agent_stopped', 'status')
		ORDER BY mission_events.seq DESC LIMIT 1), 0) AS state_seq,
	(SELECT CASE mission_events.kind WHEN 'agent_started' THEN created_at END
		FROM mission_events
		WHERE mission_events.mission_id = missions.id
			AND mission_events.kind IN ('agent_started', 'agent_stopped')
		ORDER BY mission_events.seq DESC LIMIT 1) AS started_since_stop_at,
	(SELECT payload FROM mission_events
		WHERE mission_events.mission_id = missions.id AND mission_events.kind = 'status'
		ORDER BY mission_events.seq DESC LIMIT 1) AS status_payload,
	(SELECT created_at FROM mission_events
		WHERE mission_events.mission_id = missions.id AND mission_events.kind = 'status'
		ORDER BY mission_events.seq DESC LIMIT 1) AS status_at,
	last_activity_at, last_activity, commits_ahead, dirty_files, pull_request_url,
	(SELECT created_at FROM mission_events
		WHERE mission_events.mission_id = missions.id AND mission_events.kind = 'agent_stopped'
		ORDER BY mission_events.seq DESC LIMIT 1) AS agent_stopped_at,
	NULLIF(watch_branch, ''), NULLIF(watch_workspace_path, ''),
	(SELECT space_id FROM conversations
		WHERE conversations.id = missions.origin_conversation_id) AS origin_space_id
	FROM missions";

const INSERT_MISSION: &str = "INSERT INTO missions
	(id, origin_conversation_id, bot_id, thread_conversation_id, objective, ticket_platform,
		ticket_external_id, ticket_url, ticket_title, tools, opened_at,
		watch_workspace_path, delivery_key)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)";

const INSERT_EVENT: &str = "INSERT INTO mission_events
	(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT ?1, ?2, COALESCE(max(seq), 0) + 1, ?3, ?4, ?5, ?6, ?7
	FROM mission_events WHERE mission_id = ?2";

const COUNT_DELIVERY: &str = "SELECT count(*) FROM mission_events
	WHERE mission_id = ?1 AND delivery_id = ?2";

const WATCH_COLUMNS: &str = "SELECT id, watch_branch, watch_repository, github_fingerprint
	FROM missions";

const HOOK_COLUMNS: &str = "SELECT id, watch_workspace_path, delivery_key FROM missions";

const ARM_MISSION: &str = "UPDATE missions SET watch_branch = ?2, watch_repository = ?3,
	delivery_key = ?4 WHERE id = ?1";

const KEEP_FINGERPRINT: &str = "UPDATE missions SET github_fingerprint = ?2 WHERE id = ?1";

const KEEP_PULL_REQUEST_URL: &str = "UPDATE missions SET pull_request_url = ?2 WHERE id = ?1";

const KEEP_ACTIVITY: &str = "UPDATE missions SET last_activity_at = ?2, last_activity = ?3
	WHERE id = ?1 AND (last_activity_at IS NULL OR last_activity_at <= ?2)";

const KEEP_CHECKOUT: &str = "UPDATE missions SET commits_ahead = ?2, dirty_files = ?3
	WHERE id = ?1 AND closed_at IS NULL
		AND (commits_ahead IS NOT ?2 OR dirty_files IS NOT ?3)";

const SELECT_KEY: &str = "SELECT delivery_key FROM missions WHERE id = ?1";

const CLOSE_MISSION: &str = "UPDATE missions SET closed_at = ?2 WHERE id = ?1";

const REOPEN_MISSION: &str = "UPDATE missions
	SET closed_at = NULL, reported_at = NULL, reported_turn_id = NULL WHERE id = ?1";

const REPORT_MISSION: &str =
	"UPDATE missions SET reported_at = ?2, reported_turn_id = ?3 WHERE id = ?1";

const SELECT_EVENTS: &str = "SELECT id, mission_id, kind, source, payload, created_at
	FROM mission_events WHERE mission_id = ?1
		AND kind NOT IN ('agent_started', 'agent_stopped')
	ORDER BY seq DESC LIMIT ?2";

const WORKSPACE_OF_MISSION: &str =
	"SELECT NULLIF(watch_workspace_path, '') FROM missions WHERE id = ?1";

const OF_CONVERSATION: &str = "(origin_conversation_id = ?1 OR thread_conversation_id = ?1)";

const OF_SPACE: &str = "origin_conversation_id IN (
	SELECT id FROM conversations WHERE space_id = ?1 AND kind IN ('topic', 'main')
	UNION ALL SELECT id FROM conversations WHERE space_id = ?1 AND kind = 'mission')";

const BOT_AND_REPOSITORY: &str = "SELECT bots.name, NULLIF(missions.watch_repository, '')
	FROM missions JOIN bots ON bots.id = missions.bot_id WHERE missions.id = ?1";

const COUNT_EVENTS: &str = "SELECT count(*) FROM mission_events WHERE mission_id = ?1
	AND kind NOT IN ('agent_started', 'agent_stopped')";

pub struct MissionsRepository {
	access: Access,
}

impl MissionsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn open(
		&self,
		draft: MissionDraft,
		minted_key: String,
	) -> Result<Mission, MissionError> {
		self.access.call_mut(move |connection| Ok(opened(connection, &draft, &minted_key))).await?
	}

	pub async fn append(
		&self,
		mission_id: String,
		entry: MissionEntry,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| {
				Ok(appended(connection, &mission_id, std::slice::from_ref(&entry), ""))
			})
			.await?
	}

	pub async fn answer(
		&self,
		mission_id: String,
		seq: i64,
		source: String,
	) -> Result<MissionAnswer, MissionError> {
		self.access
			.call_mut(move |connection| Ok(answered(connection, &mission_id, seq, &source)))
			.await?
	}

	pub async fn close(
		&self,
		mission_id: String,
		closing: MissionClosing,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(closed(connection, &mission_id, &closing.entry())))
			.await?
	}

	pub async fn dismiss(
		&self,
		mission_id: String,
		source: String,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(dismissed(connection, &mission_id, &source)))
			.await?
	}

	pub async fn reopen(
		&self,
		mission_id: String,
		source: String,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(reopened(connection, &mission_id, &source)))
			.await?
	}

	pub async fn arm(
		&self,
		mission_id: String,
		watch: MissionWatch,
		minted_key: String,
	) -> Result<(Mission, String), MissionError> {
		self.access
			.call_mut(move |connection| Ok(armed(connection, &mission_id, &watch, &minted_key)))
			.await?
	}

	pub async fn armed_on_key(&self, key: String) -> Result<Option<Mission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE delivery_key = ?1
						AND delivery_key <> ''"
				))?;
				Ok(statement.query_row([key], mission).optional()?)
			})
			.await?)
	}

	pub async fn append_delivery(
		&self,
		mission_id: String,
		entries: Vec<MissionEntry>,
		delivery_id: String,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| {
				Ok(appended(connection, &mission_id, &entries, &delivery_id))
			})
			.await?
	}

	pub async fn watched(&self) -> Result<Vec<WatchedMission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{WATCH_COLUMNS} WHERE closed_at IS NULL AND watch_repository <> ''
						AND watch_branch <> '' ORDER BY opened_at, id LIMIT ?1"
				))?;
				let rows = statement.query_map([MAX_MISSIONS_PER_READ], watched)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn hooked(&self) -> Result<Vec<HookedMission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{HOOK_COLUMNS} WHERE closed_at IS NULL AND delivery_key <> ''
						AND COALESCE(watch_workspace_path, '') <> ''
						ORDER BY opened_at, id LIMIT ?1"
				))?;
				let rows = statement.query_map([MAX_MISSIONS_PER_READ], hooked)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn record_github(
		&self,
		mission_id: String,
		entries: Vec<MissionEntry>,
		fingerprint: String,
		pull_request_url: Option<String>,
	) -> Result<Option<Mission>, MissionError> {
		self.access
			.call_mut(move |connection| {
				Ok(recorded(
					connection,
					&mission_id,
					&entries,
					&fingerprint,
					pull_request_url.as_deref(),
				))
			})
			.await?
	}

	pub async fn record_activity(
		&self,
		mission_id: String,
		activity: MissionActivity,
		at: i64,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(active(connection, &mission_id, &activity, at)))
			.await?
	}

	pub async fn record_checkout(
		&self,
		mission_id: String,
		counts: Option<CheckoutCounts>,
	) -> Result<Option<Mission>, MissionError> {
		self.access.call_mut(move |connection| Ok(counted(connection, &mission_id, counts))).await?
	}

	pub async fn workspace(&self, mission_id: String) -> Result<Option<String>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				Ok(connection
					.query_row(WORKSPACE_OF_MISSION, [&mission_id], |row| row.get(0))
					.optional()?
					.flatten())
			})
			.await?)
	}

	pub async fn of_conversation(
		&self,
		conversation_id: String,
	) -> Result<ConversationMissions, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE origin_conversation_id = ?1
					ORDER BY opened_at DESC, id DESC LIMIT ?2"
				))?;
				let rows = statement
					.query_map(params![conversation_id, MAX_MISSIONS_PER_READ], mission)?;
				Ok(parted(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?)))
			})
			.await?)
	}

	pub async fn listed(&self, filter: MissionFilter) -> Result<Vec<MissionRecord>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let (scope, scoped_on) = match &filter.scope {
					MissionScope::Conversation(id) => (OF_CONVERSATION, id),
					MissionScope::Space(id) => (OF_SPACE, id),
				};
				let mut statement = connection.prepare_cached(&listed_statement(scope))?;
				let rows = statement.query_map(
					params![
						scoped_on,
						filter.bot_id,
						filter.state.map(state_kinds).transpose()?,
						MAX_MISSIONS_PER_READ
					],
					mission_record,
				)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn dossier(&self, id: String) -> Result<MissionDossier, MissionError> {
		self.access
			.call(move |connection| {
				let Some(held) = held(connection, &id)? else {
					return Ok(Err(MissionError::UnknownMission { id }));
				};
				let (bot_name, repository) = connection
					.prepare_cached(BOT_AND_REPOSITORY)?
					.query_row([&id], |row| Ok((row.get(0)?, row.get(1)?)))?;
				let mut statement = connection.prepare_cached(SELECT_EVENTS)?;
				let rows = statement.query_map(params![id, MAX_EVENTS_PER_MISSION], event)?;
				let events = oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?);
				Ok(Ok(MissionDossier {
					record: MissionRecord { mission: held, bot_name },
					repository,
					events,
				}))
			})
			.await?
	}

	pub async fn in_thread(
		&self,
		conversation_id: String,
		events: u32,
	) -> Result<Option<MissionInThread>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE thread_conversation_id = ?1"
				))?;
				let Some(threaded) = statement.query_row([conversation_id], mission).optional()?
				else {
					return Ok(None);
				};
				let mut statement = connection.prepare_cached(SELECT_EVENTS)?;
				let rows = statement.query_map(params![threaded.id, events], event)?;
				let latest = oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?);
				let held: i64 =
					connection.query_row(COUNT_EVENTS, [&threaded.id], |row| row.get(0))?;
				let workspace_path: Option<String> =
					connection.query_row(WORKSPACE_OF_MISSION, [&threaded.id], |row| row.get(0))?;
				Ok(Some(MissionInThread {
					earlier_events: held - latest.len() as i64,
					workspace_path,
					mission: threaded,
					events: latest,
				}))
			})
			.await?)
	}

	pub async fn still_open(&self) -> Result<Vec<Mission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE closed_at IS NULL
					ORDER BY opened_at DESC, id DESC LIMIT ?1"
				))?;
				let rows = statement.query_map([MAX_MISSIONS_PER_READ], mission)?;
				Ok(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?))
			})
			.await?)
	}

	pub async fn of_space(
		&self,
		space_id: String,
		closed_since: i64,
	) -> Result<Vec<MissionInSpace>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"SELECT feed.*, conversations.title AS conversation_title
					FROM ({MISSION_COLUMNS} WHERE closed_at IS NULL OR closed_at >= ?2) AS feed
					JOIN conversations ON conversations.id = feed.origin_conversation_id
					WHERE conversations.space_id = ?1
					ORDER BY feed.opened_at DESC, feed.id DESC LIMIT ?3"
				))?;
				let rows = statement
					.query_map(params![space_id, closed_since, MAX_MISSIONS_PER_READ], in_space)?;
				Ok(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?))
			})
			.await?)
	}

	pub async fn space_page(
		&self,
		space_id: String,
		closed_since: i64,
		after: Option<Keyset>,
		size: u32,
	) -> Result<Page<MissionInSpace>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let after = after.as_ref();
				let mut statement = connection.prepare_cached(&space_page_statement(after))?;
				let rows = statement.query_map(
					params![
						space_id,
						closed_since,
						after.map(|keyset| keyset.sort_key),
						after.map(|keyset| keyset.id.as_str()),
						size + 1
					],
					in_space,
				)?;
				Ok(paged(rows.collect::<rusqlite::Result<Vec<_>>>()?, size, |entry| Keyset {
					sort_key: entry.mission.opened_at,
					id: entry.mission.id.clone(),
				}))
			})
			.await?)
	}

	pub async fn closed_without_report(&self) -> Result<Vec<Mission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE closed_at IS NOT NULL AND reported_at IS NULL
					ORDER BY closed_at, id LIMIT ?1"
				))?;
				let rows = statement.query_map([MAX_MISSIONS_PER_READ], mission)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn report(
		&self,
		mission_id: String,
		turn_id: Option<String>,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(reported(connection, &mission_id, turn_id.as_deref())))
			.await?
	}

	pub async fn held(&self, id: String) -> Result<Option<Mission>, MissionError> {
		Ok(self.access.call(move |connection| held(connection, &id)).await?)
	}

	pub async fn detail(&self, id: String) -> Result<MissionDetail, MissionError> {
		self.access
			.call(move |connection| {
				let Some(held) = held(connection, &id)? else {
					return Ok(Err(MissionError::UnknownMission { id }));
				};
				let mut statement = connection.prepare_cached(SELECT_EVENTS)?;
				let rows = statement.query_map(params![held.id, MAX_EVENTS_PER_MISSION], event)?;
				let events = oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?);
				Ok(Ok(MissionDetail { mission: held, events }))
			})
			.await?
	}
}

fn opened(
	connection: &mut Connection,
	draft: &MissionDraft,
	minted_key: &str,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	let thread = open_thread_under(
		&transaction,
		&draft.origin_conversation_id,
		&draft.bot_id,
		&draft.objective,
	)?;
	let id = Uuid::new_v4().to_string();
	let at = now();
	transaction
		.execute(
			INSERT_MISSION,
			params![
				id,
				draft.origin_conversation_id,
				draft.bot_id,
				thread,
				draft.objective,
				draft.ticket.platform,
				draft.ticket.external_id,
				draft.ticket.url,
				draft.ticket.title,
				as_text(&draft.tools)?,
				at,
				draft.workspace_path,
				minted_key,
			],
		)
		.map_err(|error| {
			unknown_participant(error, &draft.origin_conversation_id, &draft.bot_id)
		})?;
	let entry = MissionEntry {
		kind: MissionEventKind::Opened,
		source: draft.source.clone(),
		payload: serde_json::json!({}),
	};
	record(&transaction, &id, &entry, "", at)?;
	let stored = read(&transaction, &id)?;
	transaction.commit()?;
	Ok(stored)
}

fn appended(
	connection: &mut Connection,
	mission_id: &str,
	entries: &[MissionEntry],
	delivery_id: &str,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	refuse_a_shut_mission(&transaction, mission_id)?;
	if !already_delivered(&transaction, mission_id, delivery_id)? {
		let at = now();
		for (position, entry) in entries.iter().enumerate() {
			record(&transaction, mission_id, entry, carried_by(delivery_id, position), at)?;
			if entry.kind.closes() {
				transaction.execute(CLOSE_MISSION, params![mission_id, at])?;
				break;
			}
		}
	}
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn carried_by(delivery_id: &str, position: usize) -> &str {
	match position {
		0 => delivery_id,
		_ => "",
	}
}

fn answered(
	connection: &mut Connection,
	mission_id: &str,
	seq: i64,
	source: &str,
) -> Result<MissionAnswer, MissionError> {
	let transaction = write_transaction(connection)?;
	let standing = read(&transaction, mission_id)?;
	if standing.closed_at.is_some() || standing.state_seq != seq {
		return Ok(MissionAnswer::Stale(standing));
	}
	let entry = MissionEntry {
		kind: MissionEventKind::Answered,
		source: source.to_owned(),
		payload: serde_json::json!({}),
	};
	record(&transaction, mission_id, &entry, "", now())?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(MissionAnswer::Appended(stored))
}

fn refuse_a_shut_mission(
	transaction: &Transaction<'_>,
	mission_id: &str,
) -> Result<(), MissionError> {
	let Some(standing) = held(transaction, mission_id)? else {
		return Err(MissionError::UnknownMission { id: mission_id.to_owned() });
	};
	match standing.closed_at {
		Some(_) => Err(MissionError::MissionAlreadyClosed { id: mission_id.to_owned() }),
		None => Ok(()),
	}
}

fn closed(
	connection: &mut Connection,
	mission_id: &str,
	entry: &MissionEntry,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	shut(&transaction, mission_id, entry)?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn dismissed(
	connection: &mut Connection,
	mission_id: &str,
	source: &str,
) -> Result<Mission, MissionError> {
	let entry = MissionEntry {
		kind: MissionEventKind::Dismissed,
		source: source.to_owned(),
		payload: serde_json::json!({}),
	};
	let transaction = write_transaction(connection)?;
	let at = shut(&transaction, mission_id, &entry)?;
	transaction.execute(REPORT_MISSION, params![mission_id, at, None::<&str>])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn shut(
	transaction: &Transaction<'_>,
	mission_id: &str,
	entry: &MissionEntry,
) -> Result<i64, MissionError> {
	refuse_a_shut_mission(transaction, mission_id)?;
	let at = now();
	record(transaction, mission_id, entry, "", at)?;
	transaction.execute(CLOSE_MISSION, params![mission_id, at])?;
	Ok(at)
}

fn reopened(
	connection: &mut Connection,
	mission_id: &str,
	source: &str,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	let Some(standing) = held(&transaction, mission_id)? else {
		return Err(MissionError::UnknownMission { id: mission_id.to_owned() });
	};
	if standing.closed_at.is_none() {
		return Err(MissionError::MissionStillOpen { id: mission_id.to_owned() });
	}
	let entry = MissionEntry {
		kind: MissionEventKind::Reopened,
		source: source.to_owned(),
		payload: serde_json::json!({}),
	};
	record(&transaction, mission_id, &entry, "", now())?;
	transaction.execute(REOPEN_MISSION, [mission_id])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn reported(
	connection: &mut Connection,
	mission_id: &str,
	turn_id: Option<&str>,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	let Some(standing) = held(&transaction, mission_id)? else {
		return Err(MissionError::UnknownMission { id: mission_id.to_owned() });
	};
	if standing.closed_at.is_none() {
		return Err(MissionError::MissionStillOpen { id: mission_id.to_owned() });
	}
	if standing.reported_at.is_some() {
		return Err(MissionError::MissionAlreadyReported { id: mission_id.to_owned() });
	}
	refuse_an_unreportable_turn(&transaction, &standing.origin_conversation_id, turn_id)?;
	transaction.execute(REPORT_MISSION, params![mission_id, now(), turn_id])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn refuse_an_unreportable_turn(
	transaction: &Transaction<'_>,
	origin_conversation_id: &str,
	turn_id: Option<&str>,
) -> Result<(), MissionError> {
	let Some(turn_id) = turn_id else {
		return Ok(());
	};
	let Some(conversation_id) = conversation_of_turn(transaction, turn_id)? else {
		return Err(MissionError::UnknownTurn { id: turn_id.to_owned() });
	};
	if conversation_id != origin_conversation_id {
		return Err(MissionError::TurnOfAnotherConversation {
			turn_id: turn_id.to_owned(),
			conversation_id,
		});
	}
	Ok(())
}

fn armed(
	connection: &mut Connection,
	mission_id: &str,
	watch: &MissionWatch,
	minted_key: &str,
) -> Result<(Mission, String), MissionError> {
	let transaction = write_transaction(connection)?;
	refuse_a_shut_mission(&transaction, mission_id)?;
	let held_key: String = transaction.query_row(SELECT_KEY, [mission_id], |row| row.get(0))?;
	let key = match held_key.is_empty() {
		true => minted_key.to_owned(),
		false => held_key,
	};
	transaction.execute(ARM_MISSION, params![mission_id, watch.branch, watch.repository, key])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok((stored, key))
}

fn active(
	connection: &mut Connection,
	mission_id: &str,
	activity: &MissionActivity,
	at: i64,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	refuse_a_shut_mission(&transaction, mission_id)?;
	transaction.execute(KEEP_ACTIVITY, params![mission_id, at, as_text(activity)?])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn counted(
	connection: &mut Connection,
	mission_id: &str,
	counts: Option<CheckoutCounts>,
) -> Result<Option<Mission>, MissionError> {
	let transaction = write_transaction(connection)?;
	let moved = transaction.execute(
		KEEP_CHECKOUT,
		params![
			mission_id,
			counts.map(|counts| counts.commits_ahead),
			counts.map(|counts| counts.dirty_files),
		],
	)?;
	let stored = match moved {
		0 => None,
		_ => Some(read(&transaction, mission_id)?),
	};
	transaction.commit()?;
	Ok(stored)
}

fn recorded(
	connection: &mut Connection,
	mission_id: &str,
	entries: &[MissionEntry],
	fingerprint: &str,
	pull_request_url: Option<&str>,
) -> Result<Option<Mission>, MissionError> {
	let transaction = write_transaction(connection)?;
	let Some(standing) = held(&transaction, mission_id)? else {
		return Ok(None);
	};
	if standing.closed_at.is_some() {
		return Ok(None);
	}
	let at = now();
	let mut closed = false;
	for entry in entries {
		if closed {
			break;
		}
		record(&transaction, mission_id, entry, "", at)?;
		closed = entry.kind.closes();
	}
	if closed {
		transaction.execute(CLOSE_MISSION, params![mission_id, at])?;
	}
	transaction.execute(KEEP_FINGERPRINT, params![mission_id, fingerprint])?;
	if let Some(url) = pull_request_url {
		transaction.execute(KEEP_PULL_REQUEST_URL, params![mission_id, url])?;
	}
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(Some(stored))
}

fn already_delivered(
	transaction: &Transaction<'_>,
	mission_id: &str,
	delivery_id: &str,
) -> Result<bool, MissionError> {
	if delivery_id.is_empty() {
		return Ok(false);
	}
	let carried: i64 =
		transaction
			.query_row(COUNT_DELIVERY, params![mission_id, delivery_id], |row| row.get(0))?;
	Ok(carried > 0)
}

fn record(
	transaction: &Transaction<'_>,
	mission_id: &str,
	entry: &MissionEntry,
	delivery_id: &str,
	at: i64,
) -> Result<(), MissionError> {
	transaction.execute(
		INSERT_EVENT,
		params![
			Uuid::new_v4().to_string(),
			mission_id,
			entry.kind,
			entry.source,
			as_text(&entry.payload)?,
			at,
			delivery_id,
		],
	)?;
	Ok(())
}

fn held(connection: &Connection, id: &str) -> Result<Option<Mission>, DatabaseError> {
	let mut statement = connection.prepare_cached(&format!("{MISSION_COLUMNS} WHERE id = ?1"))?;
	Ok(statement.query_row([id], mission).optional()?)
}

fn read(transaction: &Transaction<'_>, id: &str) -> Result<Mission, MissionError> {
	held(transaction, id)?.ok_or_else(|| MissionError::UnknownMission { id: id.to_owned() })
}

fn listed_statement(scope: &str) -> String {
	format!(
		"SELECT feed.*, (SELECT name FROM bots WHERE bots.id = feed.bot_id) AS bot_name
		FROM ({MISSION_COLUMNS} WHERE {scope} AND (?2 IS NULL OR bot_id = ?2)) AS feed
		WHERE ?3 IS NULL OR feed.state_kind IN (SELECT value FROM json_each(?3))
		ORDER BY feed.opened_at DESC, feed.id DESC LIMIT ?4"
	)
}

fn state_kinds(state: MissionState) -> rusqlite::Result<String> {
	let kinds = MissionEventKind::ALL
		.into_iter()
		.filter(|kind| kind.state() == Some(state))
		.map(named)
		.collect::<rusqlite::Result<Vec<_>>>()?;
	serde_json::to_string(&kinds)
		.map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn space_page_statement(after: Option<&Keyset>) -> String {
	let past_the_cursor = match after {
		Some(_) => "AND (opened_at, id) < (?3, ?4)",
		None => "",
	};
	format!(
		"SELECT feed.*, conversations.title AS conversation_title
		FROM ({MISSION_COLUMNS} WHERE (closed_at IS NULL OR closed_at >= ?2) {past_the_cursor})
			AS feed
		CROSS JOIN conversations ON conversations.id = feed.origin_conversation_id
		WHERE conversations.space_id = ?1
		ORDER BY feed.opened_at DESC, feed.id DESC LIMIT ?5"
	)
}

pub(in crate::db) fn oldest_first<T>(mut newest_first: Vec<T>) -> Vec<T> {
	newest_first.reverse();
	newest_first
}

fn parted(missions: Vec<Mission>) -> ConversationMissions {
	let (done, open) =
		missions.into_iter().partition::<Vec<_>, _>(|mission| mission.closed_at.is_some());
	ConversationMissions { open, done }
}

fn unknown_participant(
	error: rusqlite::Error,
	conversation_id: &str,
	bot_id: &str,
) -> MissionError {
	match error.sqlite_error_code() {
		Some(rusqlite::ErrorCode::ConstraintViolation) => MissionError::UnknownParticipant {
			conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
		},
		_ => MissionError::from(DatabaseError::Sqlite(error)),
	}
}

pub(in crate::db) fn mission(row: &Row<'_>) -> rusqlite::Result<Mission> {
	Ok(Mission {
		id: row.get(0)?,
		origin_conversation_id: row.get(1)?,
		space_id: row.get(27)?,
		bot_id: row.get(2)?,
		thread_conversation_id: row.get(3)?,
		objective: row.get(4)?,
		ticket: Ticket {
			platform: row.get(5)?,
			external_id: row.get(6)?,
			url: row.get(7)?,
			title: row.get(8)?,
		},
		tools: from_text(row, 9)?,
		opened_at: row.get(10)?,
		closed_at: row.get(11)?,
		reported_at: row.get(12)?,
		reported_turn_id: row.get(13)?,
		state: derived(row.get(14)?)?,
		state_seq: row.get(15)?,
		is_agent_running: Liveness {
			closed_at: row.get(11)?,
			started_since_stop_at: row.get(16)?,
			activity_at: row.get(19)?,
			stopped_at: row.get(24)?,
		}
		.is_running(now()),
		status: last_status(row)?,
		last_activity_at: row.get(19)?,
		last_activity: row.get::<_, Option<String>>(20)?.map(|_| from_text(row, 20)).transpose()?,
		commits_ahead: row.get(21)?,
		dirty_files: row.get(22)?,
		pull_request_url: row.get(23)?,
		branch: row.get(25)?,
		workspace_path: row.get(26)?,
	})
}

fn mission_record(row: &Row<'_>) -> rusqlite::Result<MissionRecord> {
	Ok(MissionRecord { mission: mission(row)?, bot_name: row.get("bot_name")? })
}

fn in_space(row: &Row<'_>) -> rusqlite::Result<MissionInSpace> {
	let mission = mission(row)?;
	Ok(MissionInSpace {
		conversation_id: mission.origin_conversation_id.clone(),
		conversation_title: row.get("conversation_title")?,
		mission,
	})
}

struct Liveness {
	closed_at: Option<i64>,
	started_since_stop_at: Option<i64>,
	activity_at: Option<i64>,
	stopped_at: Option<i64>,
}

impl Liveness {
	fn is_running(&self, now: i64) -> bool {
		let is_in_a_turn = self.stopped_at.is_none() || self.started_since_stop_at.is_some();
		let activity_in_a_turn = self.activity_at.filter(|_| is_in_a_turn);
		self.closed_at.is_none()
			&& [self.started_since_stop_at, activity_in_a_turn]
				.into_iter()
				.flatten()
				.any(|at| now - at < AGENT_FRESHNESS_MS)
	}
}

#[derive(serde::Deserialize)]
struct StatusPayload {
	text: String,
}

fn last_status(row: &Row<'_>) -> rusqlite::Result<Option<MissionStatus>> {
	let Some(written_at) = row.get::<_, Option<i64>>(18)? else {
		return Ok(None);
	};
	let payload: StatusPayload = from_text(row, 17)?;
	Ok(Some(MissionStatus { text: payload.text, written_at }))
}

fn watched(row: &Row<'_>) -> rusqlite::Result<WatchedMission> {
	Ok(WatchedMission {
		id: row.get(0)?,
		branch: row.get(1)?,
		repository: row.get(2)?,
		fingerprint: row.get(3)?,
	})
}

fn hooked(row: &Row<'_>) -> rusqlite::Result<HookedMission> {
	Ok(HookedMission { id: row.get(0)?, workspace_path: row.get(1)?, delivery_key: row.get(2)? })
}

fn event(row: &Row<'_>) -> rusqlite::Result<MissionEvent> {
	Ok(MissionEvent {
		id: row.get(0)?,
		mission_id: row.get(1)?,
		kind: row.get(2)?,
		source: row.get(3)?,
		payload: from_text(row, 4)?,
		created_at: row.get(5)?,
	})
}

fn derived(kind: MissionEventKind) -> rusqlite::Result<MissionState> {
	kind.state().ok_or_else(|| {
		rusqlite::Error::FromSqlConversionFailure(
			12,
			rusqlite::types::Type::Text,
			format!("{kind:?} carries no mission state").into(),
		)
	})
}

fn from_text<T: serde::de::DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
	serde_json::from_str(&row.get::<_, String>(index)?).map_err(|error| {
		rusqlite::Error::FromSqlConversionFailure(
			index,
			rusqlite::types::Type::Text,
			Box::new(error),
		)
	})
}

fn as_text<T: serde::Serialize>(value: &T) -> Result<String, MissionError> {
	serde_json::to_string(value)
		.map_err(|error| MissionError::Unexpected { detail: error.to_string() })
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {

	use serde_json::json;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open, Database};
	use crate::missions::contract::{MissionNote, MissionOutcome};
	use crate::removed_on_drop::RemovedOnDrop;

	const TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'work', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0), ('c2', 'b2', 'lead', 1, 0);
	";

	async fn planted() -> (Database, RemovedOnDrop) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the spaces are planted");
		(database, dir)
	}

	fn a_draft(conversation_id: &str, bot_id: &str, objective: &str) -> MissionDraft {
		MissionDraft {
			origin_conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
			objective: objective.to_owned(),
			ticket: Ticket {
				platform: "github".to_owned(),
				external_id: "42".to_owned(),
				url: "https://kiroshi.test/tickets/42".to_owned(),
				title: "Crash on open".to_owned(),
			},
			tools: vec!["gh".to_owned()],
			source: "bot".to_owned(),
			workspace_path: None,
		}
	}

	fn a_key() -> String {
		Uuid::new_v4().to_string()
	}

	fn an_entry(kind: MissionEventKind) -> MissionEntry {
		MissionEntry::of(kind, MissionNote { source: "bot".to_owned(), payload: json!({}) })
	}

	fn a_status(text: &str) -> MissionEntry {
		MissionEntry::of(
			MissionEventKind::Status,
			MissionNote { source: "bot".to_owned(), payload: json!({ "text": text }) },
		)
	}

	async fn thread_of(database: &Database, id: String) -> (String, Option<String>, String, i64) {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT conversations.kind, conversations.space_id, conversations.title,
						(SELECT count(*) FROM conversation_participants
							WHERE conversation_id = conversations.id AND bot_id = 'b1')
						FROM conversations WHERE id = ?1",
					[&id],
					|row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
				)?)
			})
			.await
			.expect("the thread reads")
	}

	#[tokio::test]
	async fn opening_hangs_a_thread_under_the_conversation_the_work_came_in() {
		let (database, dir) = planted().await;

		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		assert_eq!(opened.state, MissionState::Working);
		assert_eq!(opened.tools, vec!["gh".to_owned()]);
		assert_eq!(opened.closed_at, None);
		assert_eq!(
			thread_of(&database, opened.thread_conversation_id.clone()).await,
			("mission".to_owned(), Some("personal".to_owned()), "Fix the crash".to_owned(), 1,),
			"the thread did not land in the space of the conversation with its bot seated"
		);
		let detail = database.missions().detail(opened.id).await.expect("the mission reads");
		assert_eq!(
			detail.events.iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened],
			"opening wrote something other than one opened event"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn every_kind_that_carries_a_state_moves_the_mission_to_it() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		let mut walked = Vec::new();
		let shut_last = MissionEventKind::ALL
			.into_iter()
			.filter(|kind| !kind.closes())
			.chain([MissionEventKind::Closed]);
		for kind in shut_last {
			let entry = match kind {
				MissionEventKind::Status => a_status("Paused on the review"),
				_ => an_entry(kind),
			};
			let written = database
				.missions()
				.append(opened.id.clone(), entry)
				.await
				.expect("the event is appended");
			walked.push((kind, written.state));
		}

		assert_eq!(
			walked,
			vec![
				(MissionEventKind::Opened, MissionState::Working),
				(MissionEventKind::Note, MissionState::Working),
				(MissionEventKind::AgentAsked, MissionState::WaitingBot),
				(MissionEventKind::AgentStarted, MissionState::WaitingBot),
				(MissionEventKind::AgentStopped, MissionState::WaitingBot),
				(MissionEventKind::Answered, MissionState::Working),
				(MissionEventKind::Escalated, MissionState::WaitingHuman),
				(MissionEventKind::Ready, MissionState::ReadyToMerge),
				(MissionEventKind::ChecksFailed, MissionState::WaitingBot),
				(MissionEventKind::Failed, MissionState::Failed),
				(MissionEventKind::Status, MissionState::Failed),
				(MissionEventKind::Reopened, MissionState::Working),
				(MissionEventKind::Closed, MissionState::Done),
			],
			"a kind moved the mission somewhere the contract does not name"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_status_is_read_back_as_the_last_one_written_and_moves_nothing_else() {
		let (database, dir) = planted().await;
		let escalated = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let escalated = database
			.missions()
			.append(escalated.id, an_entry(MissionEventKind::Escalated))
			.await
			.expect("the mission is escalated");

		let mut written = Vec::new();
		for text in ["Waiting on the person", "Still waiting on the person"] {
			written.push(
				database
					.missions()
					.append(escalated.id.clone(), a_status(text))
					.await
					.expect("the status is appended"),
			);
		}
		let reread = database
			.missions()
			.held(escalated.id.clone())
			.await
			.expect("the mission reads")
			.expect("the mission is there");

		assert_eq!(escalated.status, None);
		assert_eq!(
			written
				.iter()
				.map(|held| held.status.as_ref().map(|status| status.text.as_str()))
				.collect::<Vec<_>>(),
			vec![Some("Waiting on the person"), Some("Still waiting on the person")]
		);
		assert_eq!(reread.status, written[1].status);
		assert!(
			reread.status.as_ref().is_some_and(|status| status.written_at > 0),
			"got {reread:?}"
		);
		assert_eq!(
			(reread.state, reread.state_seq, reread.closed_at),
			(escalated.state, escalated.state_seq, escalated.closed_at),
			"a status moved the mission"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_liveness_of_a_mission_reads_idle_the_moment_its_agent_stops() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		let mut walked = vec![opened.is_agent_running];
		for kind in [
			MissionEventKind::AgentStarted,
			MissionEventKind::Note,
			MissionEventKind::AgentStopped,
			MissionEventKind::AgentStarted,
			MissionEventKind::AgentStopped,
		] {
			let written = database
				.missions()
				.append(opened.id.clone(), an_entry(kind))
				.await
				.expect("the event is appended");
			walked.push(written.is_agent_running);
		}
		let late_tail = database
			.missions()
			.record_activity(opened.id.clone(), an_activity("Edit", "/w/a.rs"), now() + 1_000)
			.await
			.expect("an activity landing after the stop is taken");
		walked.push(late_tail.is_agent_running);
		let restarted = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::AgentStarted))
			.await
			.expect("the agent starts again");
		walked.push(restarted.is_agent_running);
		let in_the_turn = database
			.missions()
			.record_activity(opened.id.clone(), an_activity("Read", "/w/b.rs"), now() + 2_000)
			.await
			.expect("an activity inside the turn lands");
		walked.push(in_the_turn.is_agent_running);
		let closed = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission closes");
		walked.push(closed.is_agent_running);

		assert_eq!(walked, vec![false, true, true, false, true, false, false, true, true, false]);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn liveness(started: Option<i64>, activity: Option<i64>, stopped: Option<i64>) -> Liveness {
		Liveness {
			closed_at: None,
			started_since_stop_at: started,
			activity_at: activity,
			stopped_at: stopped,
		}
	}

	#[test]
	fn an_agent_is_running_while_its_freshest_sign_inside_a_turn_is_under_the_window() {
		let at = 1_800_000_000_000;
		let under = at + AGENT_FRESHNESS_MS - 1;
		let stopped = Some(at - 10);

		assert!(liveness(None, Some(at), None).is_running(under), "no stop ever seen");
		assert!(
			liveness(Some(at - 5), Some(at), stopped).is_running(under),
			"a start after the stop"
		);
		assert!(!liveness(None, Some(at), stopped).is_running(at + 1), "the tail of an ended turn");
		assert!(liveness(Some(at), None, None).is_running(under));
		assert!(liveness(Some(at - AGENT_FRESHNESS_MS), Some(at), None).is_running(at + 1));
		assert!(!liveness(Some(at), Some(at), None).is_running(at + AGENT_FRESHNESS_MS));
		assert!(!liveness(None, None, None).is_running(at));
		assert!(
			!Liveness { closed_at: Some(at), ..liveness(Some(at), Some(at), None) }.is_running(at)
		);
	}

	fn an_activity(tool: &str, target: &str) -> MissionActivity {
		MissionActivity { tool: tool.to_owned(), target: target.to_owned() }
	}

	#[tokio::test]
	async fn an_activity_moves_forward_only_lands_on_the_row_and_appends_no_event() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let events_before = count_of(&database, "mission_events").await;
		let recent = now();

		let written = database
			.missions()
			.record_activity(opened.id.clone(), an_activity("Edit", "/w/a.rs"), recent)
			.await
			.expect("the activity lands");
		let older = database
			.missions()
			.record_activity(opened.id.clone(), an_activity("Read", "/w/b.rs"), recent - 1)
			.await
			.expect("the older activity is taken");

		assert_eq!(written.last_activity_at, Some(recent));
		assert_eq!(written.last_activity, Some(an_activity("Edit", "/w/a.rs")));
		assert!(written.is_agent_running);
		assert_eq!(
			(older.last_activity_at, older.last_activity),
			(Some(recent), Some(an_activity("Edit", "/w/a.rs"))),
			"an older activity moved the row back"
		);
		assert_eq!(count_of(&database, "mission_events").await, events_before);

		let stale = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the leak"), a_key())
			.await
			.expect("the mission opens");
		let long_ago = database
			.missions()
			.record_activity(stale.id, an_activity("Bash", "ls"), recent - AGENT_FRESHNESS_MS)
			.await
			.expect("the activity lands");
		assert!(!long_ago.is_agent_running, "an activity past the window read as running");

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_counts_of_a_checkout_answer_the_mission_only_when_they_moved() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let counts = CheckoutCounts { commits_ahead: 3, dirty_files: 2 };
		let record = |counts| database.missions().record_checkout(opened.id.clone(), counts);

		let first = record(Some(counts)).await.expect("the counts land");
		let again = record(Some(counts)).await.expect("the counts land again");
		let unread = record(None).await.expect("the counts are cleared");
		let still_unread = record(None).await.expect("the counts stay cleared");

		let first = first.expect("the first counts moved the mission");
		assert_eq!((first.commits_ahead, first.dirty_files), (Some(3), Some(2)));
		assert_eq!(again, None, "unmoved counts answered a mission");
		let unread = unread.expect("clearing the counts moved the mission");
		assert_eq!((unread.commits_ahead, unread.dirty_files), (None, None));
		assert_eq!(still_unread, None);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_liveness_events_stay_out_of_the_events_read_and_out_of_the_earlier_count() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		for kind in [
			MissionEventKind::AgentStarted,
			MissionEventKind::Note,
			MissionEventKind::AgentStopped,
			MissionEventKind::AgentAsked,
		] {
			database
				.missions()
				.append(opened.id.clone(), an_entry(kind))
				.await
				.expect("the event is appended");
		}

		let detail =
			database.missions().detail(opened.id.clone()).await.expect("the mission reads");
		let threaded = database
			.missions()
			.in_thread(opened.thread_conversation_id.clone(), 1)
			.await
			.expect("the thread reads")
			.expect("the thread carries the mission");

		assert_eq!(
			detail.events.iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened, MissionEventKind::Note, MissionEventKind::AgentAsked,],
		);
		assert_eq!(
			(
				threaded.events.iter().map(|event| event.kind).collect::<Vec<_>>(),
				threaded.earlier_events
			),
			(vec![MissionEventKind::AgentAsked], 2),
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_waiting_on_its_human_keeps_its_state_and_its_seq_through_the_liveness() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let escalated = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Escalated))
			.await
			.expect("the mission escalates");

		let mut walked = Vec::new();
		for kind in [MissionEventKind::AgentStarted, MissionEventKind::AgentStopped] {
			let written = database
				.missions()
				.append(opened.id.clone(), an_entry(kind))
				.await
				.expect("the event is appended");
			walked.push((written.state, written.state_seq));
		}

		assert_eq!(escalated.state, MissionState::WaitingHuman);
		assert_eq!(
			walked,
			vec![
				(MissionState::WaitingHuman, escalated.state_seq),
				(MissionState::WaitingHuman, escalated.state_seq),
			]
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn two_entries_of_one_delivery_land_together_and_a_repeat_of_it_lands_neither() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		for _ in 0..2 {
			database
				.missions()
				.append_delivery(
					opened.id.clone(),
					vec![
						an_entry(MissionEventKind::AgentStopped),
						an_entry(MissionEventKind::AgentAsked),
					],
					"delivery-1".to_owned(),
				)
				.await
				.expect("the delivery is appended");
		}

		assert_eq!(count_of(&database, "mission_events").await, 3);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_failed_mission_stays_open_until_its_bot_closes_it() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		let failed = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Failed))
			.await
			.expect("the failure is recorded");
		let while_failed =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");
		database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");
		let once_closed =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");

		assert_eq!(failed.state, MissionState::Failed);
		assert_eq!(failed.closed_at, None, "a failure closed the mission");
		assert_eq!(
			while_failed.open.iter().map(|held| held.id.clone()).collect::<Vec<_>>(),
			vec![opened.id.clone()],
			"a failed mission left the open list before it was closed"
		);
		assert!(while_failed.done.is_empty(), "got {:?}", while_failed.done);
		assert!(once_closed.open.is_empty(), "got {:?}", once_closed.open);
		assert_eq!(
			once_closed.done.iter().map(|held| held.state).collect::<Vec<_>>(),
			vec![MissionState::Done]
		);
		assert!(once_closed.done[0].closed_at.is_some(), "a closed mission carries no closing");

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_missions_of_a_conversation_come_back_open_apart_from_done() {
		let (database, dir) = planted().await;
		let still_open = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let done = database
			.missions()
			.open(a_draft("c1", "b1", "Ship the fix"), a_key())
			.await
			.expect("the mission opens");
		database
			.missions()
			.append(done.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");
		database
			.missions()
			.open(a_draft("c2", "b2", "Another room"), a_key())
			.await
			.expect("the mission opens");

		let held =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");

		assert_eq!(
			held.open.iter().map(|mission| mission.id.clone()).collect::<Vec<_>>(),
			vec![still_open.id],
			"the open list carried a mission of another conversation or a done one"
		);
		assert_eq!(
			held.done.iter().map(|mission| mission.id.clone()).collect::<Vec<_>>(),
			vec![done.id]
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn every_open_mission_of_every_space_comes_back_with_its_bot_and_its_state() {
		let (database, dir) = planted().await;
		let here = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let there = database
			.missions()
			.open(a_draft("c2", "b2", "Another room"), a_key())
			.await
			.expect("the mission opens");
		let closed = database
			.missions()
			.open(a_draft("c2", "b2", "Already done"), a_key())
			.await
			.expect("the mission opens");
		database
			.missions()
			.append(here.id.clone(), an_entry(MissionEventKind::Escalated))
			.await
			.expect("the escalation is recorded");
		database
			.missions()
			.append(closed.id, an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");

		let board = database.missions().still_open().await.expect("the board reads");

		assert_eq!(
			board
				.iter()
				.map(|mission| (mission.id.clone(), mission.bot_id.clone(), mission.state))
				.collect::<Vec<_>>(),
			vec![
				(here.id, "b1".to_owned(), MissionState::WaitingHuman),
				(there.id, "b2".to_owned(), MissionState::Working),
			],
			"the board dropped an open mission or misread its state"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn missions_opened_at(
		conversation_id: &str,
		bot_id: &str,
		ids: &[&str],
		opened_at: i64,
	) -> String {
		ids.iter()
			.map(|id| {
				format!(
					"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
						VALUES ('thread-{id}', 'mission', 'personal', '{id}', 1, 1);
					INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
						objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
						tools, opened_at)
						VALUES ('{id}', '{conversation_id}', '{bot_id}', 'thread-{id}', '{id}',
							'github', '{id}', 'https://kiroshi.test/tickets/{id}', 'Ticket', '[]',
							{opened_at});"
				)
			})
			.collect()
	}

	async fn walked_space(
		database: &Database,
		space_id: &str,
		closed_since: i64,
		size: u32,
	) -> Vec<Vec<String>> {
		let mut pages = Vec::new();
		let mut after = None;
		loop {
			let page = database
				.missions()
				.space_page(space_id.to_owned(), closed_since, after, size)
				.await
				.expect("the page reads");
			pages.push(page.rows.iter().map(|entry| entry.mission.id.clone()).collect());
			match page.next {
				Some(next) => after = Some(next),
				None => return pages,
			}
		}
	}

	#[tokio::test]
	async fn missions_sharing_their_opening_across_a_page_boundary_come_back_once_each() {
		let (database, _dir) = planted().await;
		let rows = format!(
			"{}{}UPDATE missions SET closed_at = 2 WHERE id = 'closed-early';",
			missions_opened_at("c1", "b1", &["m-1", "m-2", "m-3", "m-4", "m-5", "closed-early"], 5),
			missions_opened_at("c2", "b2", &["m-6", "m-7"], 5),
		);
		database
			.call_mut(move |connection| Ok(connection.execute_batch(&rows)?))
			.await
			.expect("the missions are planted");

		let pages = walked_space(&database, "personal", 3, 2).await;

		assert_eq!(pages, vec![vec!["m-5", "m-4"], vec!["m-3", "m-2"], vec!["m-1"]]);
	}

	#[tokio::test]
	async fn the_paged_space_read_walks_past_the_cap_of_the_other_reads() {
		let (database, _dir) = planted().await;
		database
			.call_mut(|connection| Ok(connection.execute_batch(MISSIONS_PAST_THE_CAP)?))
			.await
			.expect("the missions are planted");

		let pages = walked_space(&database, "personal", 0, 30).await;

		assert_eq!(pages.concat().len(), 205, "the paged read stopped at the cap");
		assert_eq!(pages.first().and_then(|page| page.first()).map(String::as_str), Some("m-205"));
	}

	#[tokio::test]
	async fn every_space_page_reads_its_missions_through_the_opening_index_with_no_sort() {
		let (database, _dir) = planted().await;
		let cursor = Keyset { sort_key: 1, id: "m-1".to_owned() };

		for after in [None, Some(cursor)] {
			let plan = database
				.call(move |connection| {
					let mut statement = connection.prepare(&format!(
						"EXPLAIN QUERY PLAN {}",
						space_page_statement(after.as_ref())
					))?;
					let steps = statement
						.query_map(params!["personal", 0, 1, "m-1", 31], |row| {
							row.get::<_, String>(3)
						})?
						.collect::<rusqlite::Result<Vec<_>>>()?;
					Ok(steps)
				})
				.await
				.expect("the query plan");

			assert!(
				plan.iter().any(|step| step.contains("missions_by_opening")),
				"the page does not read the missions through their opening index: {plan:?}"
			);
			assert!(
				!plan.iter().any(|step| step.contains("TEMP B-TREE")),
				"the page sorts its missions apart from the index: {plan:?}"
			);
		}
	}

	#[tokio::test]
	async fn the_listed_reads_of_a_conversation_and_of_a_space_scan_no_mission() {
		let (database, _dir) = planted().await;

		for scope in [OF_CONVERSATION, OF_SPACE] {
			let plan = database
				.call(move |connection| {
					let mut statement = connection
						.prepare(&format!("EXPLAIN QUERY PLAN {}", listed_statement(scope)))?;
					let steps = statement
						.query_map(params!["personal", "b1", "[\"opened\"]", 200], |row| {
							row.get::<_, String>(3)
						})?
						.collect::<rusqlite::Result<Vec<_>>>()?;
					Ok(steps)
				})
				.await
				.expect("the query plan");

			assert!(
				plan.iter().any(|step| step.starts_with("SEARCH missions USING INDEX")),
				"the read does not reach the missions through an index: {plan:?}"
			);
			assert!(
				!plan.iter().any(|step| step.starts_with("SCAN missions")
					|| step.starts_with("SCAN conversations")),
				"the read scans a whole table: {plan:?}"
			);
		}
	}

	#[tokio::test]
	async fn the_listed_reads_answer_newest_first_on_state_and_bot() {
		let (database, _dir) = planted().await;
		let rows = format!(
			"{}{}{}UPDATE missions SET closed_at = 9 WHERE id = 'm-2';
			INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				VALUES ('e-2', 'm-2', 1, 'closed', 'bot', '{{}}', 9);
			INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('thread-m-1', 'b1', 'lead', 1, 0);
			{}",
			missions_opened_at("c1", "b1", &["m-1"], 1),
			missions_opened_at("c1", "b1", &["m-2"], 2),
			missions_opened_at("c2", "b2", &["m-3"], 3),
			missions_opened_at("thread-m-1", "b1", &["m-4"], 4),
		);
		database
			.call_mut(move |connection| Ok(connection.execute_batch(&rows)?))
			.await
			.expect("the missions are planted");
		let listed = |scope: MissionScope, state: Option<MissionState>, bot_id: Option<&str>| {
			let filter = MissionFilter { scope, state, bot_id: bot_id.map(str::to_owned) };
			let missions = database.missions();
			async move {
				missions
					.listed(filter)
					.await
					.expect("the missions are listed")
					.into_iter()
					.map(|record| record.mission.id)
					.collect::<Vec<_>>()
			}
		};

		assert_eq!(
			listed(MissionScope::Conversation("c1".to_owned()), None, None).await,
			vec!["m-2", "m-1"]
		);
		assert_eq!(
			listed(MissionScope::Conversation("thread-m-3".to_owned()), None, None).await,
			vec!["m-3"]
		);
		assert_eq!(
			listed(MissionScope::Space("personal".to_owned()), None, None).await,
			vec!["m-4", "m-2", "m-1"]
		);
		assert_eq!(
			listed(MissionScope::Space("personal".to_owned()), Some(MissionState::Done), None)
				.await,
			vec!["m-2"]
		);
		assert_eq!(
			listed(MissionScope::Space("work".to_owned()), None, Some("b2")).await,
			vec!["m-3"]
		);
		assert!(listed(MissionScope::Space("work".to_owned()), None, Some("b1")).await.is_empty());
	}

	const MISSIONS_PAST_THE_CAP: &str = "
		WITH RECURSIVE counter(value) AS
			(SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 205)
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			SELECT 'thread-' || value, 'mission', 'personal', 'Objective ' || value, value, value
			FROM counter;

		WITH RECURSIVE counter(value) AS
			(SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 205)
		INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
			objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
			tools, opened_at)
			SELECT 'm-' || value, 'c1', 'b1', 'thread-' || value, 'Objective ' || value,
				'github', value, 'https://kiroshi.test/tickets/' || value, 'Ticket', '[]', value
			FROM counter;
	";

	fn events_past_the_cap(mission_id: &str) -> String {
		format!(
			"WITH RECURSIVE counter(value) AS
				(SELECT 2 UNION ALL SELECT value + 1 FROM counter WHERE value < 506)
			INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				SELECT 'e-' || value, '{mission_id}', value, 'note', 'bot',
					'{{\"seq\":' || value || '}}', value
				FROM counter;"
		)
	}

	#[tokio::test]
	async fn a_conversation_past_the_cap_answers_the_missions_opened_last() {
		let (database, dir) = planted().await;
		database
			.call_mut(|connection| Ok(connection.execute_batch(MISSIONS_PAST_THE_CAP)?))
			.await
			.expect("the missions are planted");

		let held =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");

		assert_eq!(held.open.len(), MAX_MISSIONS_PER_READ as usize, "the read went past its cap");
		assert_eq!(
			held.open.first().map(|mission| mission.objective.clone()),
			Some("Objective 6".to_owned()),
			"the capped read did not drop the oldest missions"
		);
		assert_eq!(
			held.open.last().map(|mission| mission.objective.clone()),
			Some("Objective 205".to_owned()),
			"the newest mission fell out of the read"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_past_the_cap_answers_the_events_written_last() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let planting = events_past_the_cap(&opened.id);
		database
			.call_mut(move |connection| Ok(connection.execute_batch(&planting)?))
			.await
			.expect("the events are planted");

		let detail = database.missions().detail(opened.id).await.expect("the mission reads");

		assert_eq!(
			detail.events.len(),
			MAX_EVENTS_PER_MISSION as usize,
			"the read went past its cap"
		);
		assert_eq!(
			detail.events.first().map(|event| event.payload.clone()),
			Some(json!({ "seq": 7 })),
			"the capped read did not drop the oldest events"
		);
		assert_eq!(
			detail.events.last().map(|event| event.payload.clone()),
			Some(json!({ "seq": 506 })),
			"the newest event fell out of the read"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_watch(branch: &str) -> MissionWatch {
		MissionWatch {
			branch: branch.to_owned(),
			repository: "shoto290/kiroshi-monorepo".to_owned(),
		}
	}

	#[tokio::test]
	async fn arming_a_mission_twice_keeps_the_key_its_open_call_wrote_and_carries_the_new_watch() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), "minted-at-open".to_owned())
			.await
			.expect("the mission opens");

		let (_, first) = database
			.missions()
			.arm(opened.id.clone(), a_watch("feature/one"), "minted-first".to_owned())
			.await
			.expect("the mission is armed");
		let (armed, second) = database
			.missions()
			.arm(opened.id.clone(), a_watch("feature/two"), "minted-second".to_owned())
			.await
			.expect("the mission is armed again");

		assert_eq!((first.as_str(), second.as_str()), ("minted-at-open", "minted-at-open"));
		assert_eq!(armed.id, opened.id);
		assert_eq!(
			database
				.missions()
				.watched()
				.await
				.expect("the watched missions read")
				.into_iter()
				.map(|held| (held.id, held.branch, held.repository, held.fingerprint))
				.collect::<Vec<_>>(),
			vec![(
				opened.id.clone(),
				"feature/two".to_owned(),
				"shoto290/kiroshi-monorepo".to_owned(),
				String::new(),
			)],
			"the second arming did not carry the branch it named"
		);
		assert_eq!(
			database
				.missions()
				.armed_on_key("minted-at-open".to_owned())
				.await
				.expect("the mission reads")
				.map(|held| held.id),
			Some(opened.id),
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_nobody_armed_is_neither_watched_nor_reachable_on_a_blank_key() {
		let (database, dir) = planted().await;
		database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		assert!(database.missions().watched().await.expect("the watched missions read").is_empty());
		assert_eq!(
			database.missions().armed_on_key(String::new()).await.expect("the mission reads"),
			None,
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_delivery_id_already_appended_leaves_the_mission_with_one_event() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");

		for _ in 0..2 {
			database
				.missions()
				.append_delivery(
					opened.id.clone(),
					vec![an_entry(MissionEventKind::AgentAsked)],
					"delivery-1".to_owned(),
				)
				.await
				.expect("the delivery is appended");
		}

		assert_eq!(
			database
				.missions()
				.detail(opened.id.clone())
				.await
				.expect("the mission reads")
				.events
				.iter()
				.filter(|event| event.kind == MissionEventKind::AgentAsked)
				.count(),
			1,
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_event_appended_to_a_closed_mission_is_refused_and_written_nowhere() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		let closed = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");

		let refused = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Failed))
			.await
			.expect_err("the event is refused");

		assert_eq!(refused, MissionError::MissionAlreadyClosed { id: opened.id.clone() });
		assert_eq!(count_of(&database, "mission_events").await, 2, "an event was written anyway");
		let detail = database.missions().detail(opened.id).await.expect("the mission reads");
		assert_eq!(detail.mission.state, MissionState::Done, "the refused event moved the state");
		assert_eq!(detail.mission.closed_at, closed.closed_at);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_event_for_a_mission_no_row_holds_is_refused_and_written_nowhere() {
		let (database, dir) = planted().await;

		let refused = database
			.missions()
			.append("x9".to_owned(), an_entry(MissionEventKind::Note))
			.await
			.expect_err("the event is refused");
		let read = database.missions().detail("x9".to_owned()).await.expect_err("the read refuses");

		assert_eq!(refused, MissionError::UnknownMission { id: "x9".to_owned() });
		assert_eq!(read, MissionError::UnknownMission { id: "x9".to_owned() });
		assert_eq!(count_of(&database, "mission_events").await, 0, "an event was written anyway");

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_thread_answers_with_its_mission_the_events_it_is_bounded_to_and_what_it_left_out() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"), a_key())
			.await
			.expect("the mission opens");
		for _ in 0..3 {
			database
				.missions()
				.append(opened.id.clone(), an_entry(MissionEventKind::Note))
				.await
				.expect("the event is appended");
		}

		let in_thread = database
			.missions()
			.in_thread(opened.thread_conversation_id.clone(), 2)
			.await
			.expect("the thread reads")
			.expect("a mission behind the thread");

		assert_eq!(in_thread.mission.id, opened.id);
		assert_eq!(
			in_thread.events.iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Note, MissionEventKind::Note],
			"the thread carried something other than its most recent events"
		);
		assert_eq!(in_thread.earlier_events, 2, "the events left out went miscounted");
		assert_eq!(
			database.missions().in_thread("c1".to_owned(), 2).await.expect("the read answers"),
			None,
			"a conversation holding a mission answered as its thread"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn a_turn_in(database: &Database, id: &str, conversation_id: &str) {
		let statement = format!(
			"INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('{id}', '{conversation_id}', 1, 1)"
		);
		database
			.call_mut(move |connection| Ok(connection.execute_batch(&statement)?))
			.await
			.expect("the turn is planted");
	}

	async fn a_closed_mission(database: &Database) -> Mission {
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix it"), a_key())
			.await
			.expect("the mission opens");
		database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission closes")
	}

	#[tokio::test]
	async fn a_report_refuses_a_mission_nobody_holds_one_still_open_and_one_already_reported() {
		let (database, dir) = planted().await;
		let open = database
			.missions()
			.open(a_draft("c1", "b1", "Ship it"), a_key())
			.await
			.expect("the mission opens");
		let closed = a_closed_mission(&database).await;

		let unknown = database
			.missions()
			.report("nobody".to_owned(), None)
			.await
			.expect_err("an unknown mission reports");
		let still_open = database
			.missions()
			.report(open.id.clone(), None)
			.await
			.expect_err("an open mission reports");
		let first = database
			.missions()
			.report(closed.id.clone(), None)
			.await
			.expect("the report is recorded");
		let again = database
			.missions()
			.report(closed.id.clone(), None)
			.await
			.expect_err("a second report lands");

		assert_eq!(unknown, MissionError::UnknownMission { id: "nobody".to_owned() });
		assert_eq!(still_open, MissionError::MissionStillOpen { id: open.id });
		assert_eq!(first.reported_turn_id, None, "a report without a turn named one");
		assert!(first.reported_at.is_some(), "the report carries no moment");
		assert_eq!(again, MissionError::MissionAlreadyReported { id: closed.id.clone() });
		assert_eq!(
			database
				.missions()
				.held(closed.id)
				.await
				.expect("the mission reads")
				.expect("the mission stands")
				.reported_at,
			first.reported_at,
			"the refused report moved the moment already stored"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_report_refuses_a_turn_nobody_holds_and_one_of_another_conversation() {
		let (database, dir) = planted().await;
		let closed = a_closed_mission(&database).await;
		a_turn_in(&database, "elsewhere", "c2").await;

		let unknown = database
			.missions()
			.report(closed.id.clone(), Some("nobody".to_owned()))
			.await
			.expect_err("an unknown turn reports");
		let elsewhere = database
			.missions()
			.report(closed.id.clone(), Some("elsewhere".to_owned()))
			.await
			.expect_err("a turn of another conversation reports");

		assert_eq!(unknown, MissionError::UnknownTurn { id: "nobody".to_owned() });
		assert_eq!(
			elsewhere,
			MissionError::TurnOfAnotherConversation {
				turn_id: "elsewhere".to_owned(),
				conversation_id: "c2".to_owned(),
			}
		);
		assert_eq!(
			database
				.missions()
				.closed_without_report()
				.await
				.expect("the missions owing a report read")
				.into_iter()
				.map(|mission| mission.id)
				.collect::<Vec<_>>(),
			vec![closed.id],
			"a refused report settled the mission anyway"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_turn_that_goes_leaves_the_mission_that_reported_in_it_naming_no_turn() {
		let (database, dir) = planted().await;
		let closed = a_closed_mission(&database).await;
		a_turn_in(&database, "t1", "c1").await;
		let reported = database
			.missions()
			.report(closed.id.clone(), Some("t1".to_owned()))
			.await
			.expect("the report is recorded");

		database
			.call_mut(|connection| {
				Ok(connection.execute_batch("DELETE FROM turns WHERE id = 't1'")?)
			})
			.await
			.expect("the turn goes");

		let held = database
			.missions()
			.held(closed.id)
			.await
			.expect("the mission reads")
			.expect("the mission stands");
		assert_eq!(held.reported_at, reported.reported_at, "the report lost its moment");
		assert_eq!(held.reported_turn_id, None, "the mission still names a turn nobody holds");

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_person_closing(outcome: MissionOutcome) -> MissionClosing {
		MissionClosing {
			source: "person".to_owned(),
			outcome,
			summary: "Settled by hand".to_owned(),
		}
	}

	async fn an_armed_mission_in(database: &Database, workspace: &str) -> Mission {
		let draft = MissionDraft {
			workspace_path: Some(workspace.to_owned()),
			..a_draft("c1", "b1", "Fix it")
		};
		let opened = database.missions().open(draft, a_key()).await.expect("the mission opens");
		let (armed, _) = database
			.missions()
			.arm(opened.id, a_watch("feature/reopen"), a_key())
			.await
			.expect("the mission is armed");
		armed
	}

	async fn reopened_after(database: &Database, outcome: MissionOutcome) -> (Mission, Mission) {
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix it"), a_key())
			.await
			.expect("the mission opens");
		database
			.missions()
			.close(opened.id.clone(), a_person_closing(outcome))
			.await
			.expect("the mission closes");
		let shut = database
			.missions()
			.report(opened.id.clone(), None)
			.await
			.expect("the report is recorded");
		let reopened = database
			.missions()
			.reopen(opened.id, "person".to_owned())
			.await
			.expect("the mission reopens");
		(shut, reopened)
	}

	async fn last_event_of(database: &Database, id: &str) -> (MissionEventKind, String) {
		let detail = database.missions().detail(id.to_owned()).await.expect("the mission reads");
		let last = detail.events.last().expect("the mission holds events");
		(last.kind, last.source.clone())
	}

	#[tokio::test]
	async fn a_close_by_the_person_is_read_back_with_that_source() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix it"), a_key())
			.await
			.expect("the mission opens");

		database
			.missions()
			.close(opened.id.clone(), a_person_closing(MissionOutcome::Done))
			.await
			.expect("the mission closes");

		assert_eq!(
			last_event_of(&database, &opened.id).await,
			(MissionEventKind::Closed, "person".to_owned()),
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn reopening_a_done_mission_appends_reopened_and_clears_its_closing_and_its_report() {
		let (database, dir) = planted().await;

		let (shut, reopened) = reopened_after(&database, MissionOutcome::Done).await;

		assert_eq!(shut.state, MissionState::Done);
		assert_eq!(reopened.state, MissionState::Working);
		assert!(reopened.state_seq > shut.state_seq, "the reopen did not move the state seq");
		assert_eq!(
			(reopened.closed_at, reopened.reported_at, reopened.reported_turn_id.clone()),
			(None, None, None),
			"the reopen left the mission closed or reported"
		);
		assert_eq!(
			last_event_of(&database, &reopened.id).await,
			(MissionEventKind::Reopened, "person".to_owned()),
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn owing_a_report(database: &Database) -> Vec<String> {
		database
			.missions()
			.closed_without_report()
			.await
			.expect("the missions owing a report read")
			.into_iter()
			.map(|mission| mission.id)
			.collect()
	}

	#[tokio::test]
	async fn a_mission_the_person_dismissed_owes_no_report_until_a_bot_closes_it_again() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix it"), a_key())
			.await
			.expect("the mission opens");

		let dismissed = database
			.missions()
			.dismiss(opened.id.clone(), "person".to_owned())
			.await
			.expect("the mission closes");

		assert_eq!(dismissed.state, MissionState::Closed);
		assert_eq!(
			(dismissed.reported_at, dismissed.reported_turn_id.clone()),
			(dismissed.closed_at, None),
			"the dismissal left a report owed"
		);
		assert_eq!(owing_a_report(&database).await, Vec::<String>::new());

		for outcome in [MissionOutcome::Done, MissionOutcome::Failed] {
			database
				.missions()
				.reopen(opened.id.clone(), "person".to_owned())
				.await
				.expect("the mission reopens");
			let closing = MissionClosing { source: "bot".to_owned(), ..a_person_closing(outcome) };
			let closed = database
				.missions()
				.close(opened.id.clone(), closing)
				.await
				.expect("the bot closes the mission");

			assert_eq!(closed.reported_at, None, "the bot close on {outcome:?} owes no report");
			assert_eq!(owing_a_report(&database).await, vec![opened.id.clone()]);
		}

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn reopening_a_failed_mission_brings_it_back_to_working() {
		let (database, dir) = planted().await;

		let (shut, reopened) = reopened_after(&database, MissionOutcome::Failed).await;

		assert_eq!(shut.state, MissionState::Failed);
		assert_eq!(reopened.state, MissionState::Working);
		assert!(reopened.state_seq > shut.state_seq, "the reopen did not move the state seq");
		assert_eq!(reopened.closed_at, None);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn reopening_a_mission_still_open_or_one_nobody_holds_is_refused_and_writes_nothing() {
		let (database, dir) = planted().await;
		let open = database
			.missions()
			.open(a_draft("c1", "b1", "Fix it"), a_key())
			.await
			.expect("the mission opens");

		let still_open = database
			.missions()
			.reopen(open.id.clone(), "person".to_owned())
			.await
			.expect_err("an open mission reopens");
		let unknown = database
			.missions()
			.reopen("nobody".to_owned(), "person".to_owned())
			.await
			.expect_err("an unknown mission reopens");

		assert_eq!(still_open, MissionError::MissionStillOpen { id: open.id.clone() });
		assert_eq!(unknown, MissionError::UnknownMission { id: "nobody".to_owned() });
		assert_eq!(
			database.missions().detail(open.id).await.expect("the mission reads").events.len(),
			1,
			"the refused reopen wrote an event"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_reads_back_the_branch_it_is_armed_on_and_the_workspace_it_opened_in() {
		let (database, dir) = planted().await;
		let bare = database
			.missions()
			.open(a_draft("c1", "b1", "Bare"), a_key())
			.await
			.expect("the mission opens");
		let armed = an_armed_mission_in(&database, "/work/kiroshi").await;

		let listed = database.missions().of_conversation("c1".to_owned()).await.expect("list");
		let on_board = database.missions().still_open().await.expect("board");
		let detail = database.missions().detail(armed.id.clone()).await.expect("detail");

		let carried = (Some("feature/reopen".to_owned()), Some("/work/kiroshi".to_owned()));
		assert_eq!((armed.branch.clone(), armed.workspace_path.clone()), carried);
		assert_eq!((detail.mission.branch, detail.mission.workspace_path), carried);
		for missions in [listed.open, on_board] {
			let mut read: Vec<_> = missions
				.into_iter()
				.map(|held| (held.id, held.branch, held.workspace_path))
				.collect();
			let mut expected = vec![
				(bare.id.clone(), None, None),
				(armed.id.clone(), carried.0.clone(), carried.1.clone()),
			];
			read.sort();
			expected.sort();
			assert_eq!(read, expected);
		}

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_reopened_armed_mission_is_watched_and_hooked_again() {
		let (database, dir) = planted().await;
		let armed = an_armed_mission_in(&database, "/work/kiroshi").await;
		database
			.missions()
			.close(armed.id.clone(), a_person_closing(MissionOutcome::Done))
			.await
			.expect("the mission closes");
		let watched_ids = || async {
			database
				.missions()
				.watched()
				.await
				.expect("watched")
				.into_iter()
				.map(|held| held.id)
				.collect::<Vec<_>>()
		};
		let hooked_ids = || async {
			database
				.missions()
				.hooked()
				.await
				.expect("hooked")
				.into_iter()
				.map(|held| held.id)
				.collect::<Vec<_>>()
		};
		assert!(watched_ids().await.is_empty(), "a closed mission is still watched");
		assert!(hooked_ids().await.is_empty(), "a closed mission is still hooked");

		database
			.missions()
			.reopen(armed.id.clone(), "person".to_owned())
			.await
			.expect("the mission reopens");

		assert_eq!(watched_ids().await, vec![armed.id.clone()]);
		assert_eq!(hooked_ids().await, vec![armed.id.clone()]);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
