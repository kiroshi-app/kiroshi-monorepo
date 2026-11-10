use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use serde_json::{json, Value};
use uuid::Uuid;

use super::messages::conversation_of_turn;

use crate::db::{Access, DatabaseError};
use crate::routines::contract::{
	ReportedRun, Routine, RoutineDraft, RoutineEdit, RoutineError, RoutineRun, RoutineRuns,
	RunCause, RunClosing, RunOutcome, RunRequested, SkipReason, TriggerDecision, TriggerEvent,
	LEASE_EXPIRED,
};
use crate::routines::core::{
	self, Dedupe, Facts, Verdict, DEDUPE_RETENTION_MS, FAILURES_BEFORE_DISABLE, HOUR_MS, LEASE_MS,
};

impl ToSql for RunOutcome {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(serialized(self)?))
	}
}

impl FromSql for RunOutcome {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		serde_json::from_value(Value::String(value.as_str()?.to_owned()))
			.map_err(|error| FromSqlError::Other(Box::new(error)))
	}
}

fn serialized(outcome: &RunOutcome) -> rusqlite::Result<String> {
	match serde_json::to_value(outcome) {
		Ok(Value::String(text)) => Ok(text),
		held => Err(rusqlite::Error::ToSqlConversionFailure(
			format!("a run outcome did not serialise as a name: {held:?}").into(),
		)),
	}
}

pub const MAX_RUNS_PER_PAGE: u32 = 200;

const SELECT_ROUTINE: &str = "SELECT id, conversation_id, bot_id, title, instruction,
	trigger_source_id, event_filter, trigger_config, is_enabled, consecutive_failures, created_at
	FROM routines WHERE id = ?1";

const SELECT_ROUTINES_OF_CONVERSATION: &str =
	"SELECT id, conversation_id, bot_id, title, instruction,
	trigger_source_id, event_filter, trigger_config, is_enabled, consecutive_failures, created_at
	FROM routines WHERE conversation_id = ?1 ORDER BY created_at, id";

const SELECT_ROUTINE_ON_KEY: &str = "SELECT id, conversation_id, bot_id, title, instruction,
	trigger_source_id, event_filter, trigger_config, is_enabled, consecutive_failures, created_at
	FROM routines WHERE trigger_key = ?1 AND trigger_source_id = ?2";

const SELECT_ENABLED_ON_SOURCE: &str = "SELECT id, conversation_id, bot_id, title, instruction,
	trigger_source_id, event_filter, trigger_config, is_enabled, consecutive_failures, created_at,
	last_occurrence_at
	FROM routines WHERE trigger_source_id = ?1 AND is_enabled = 1 ORDER BY created_at, id";

const RECORD_OCCURRENCE: &str = "UPDATE routines SET last_occurrence_at = ?2 WHERE id = ?1";

const SELECT_RUN: &str = "SELECT id, routine_id, started_at, ended_at, outcome, reason,
	cost_usd, model_usage FROM routine_runs WHERE id = ?1";

const SELECT_RUNS_OF_ROUTINE: &str = "SELECT id, routine_id, started_at, ended_at, outcome, reason,
	cost_usd, model_usage FROM routine_runs WHERE routine_id = ?1
	ORDER BY started_at DESC, id DESC LIMIT ?2";

const SELECT_RUNS_OF_SPACE: &str = "SELECT routine_runs.id, routine_runs.routine_id,
	routine_runs.started_at, routine_runs.ended_at, routine_runs.outcome, routine_runs.reason,
	routine_runs.cost_usd, routine_runs.model_usage, routines.id
	FROM routines
	JOIN conversations ON conversations.id = routines.conversation_id
	LEFT JOIN routine_runs ON routine_runs.id IN (
		SELECT newest.id FROM routine_runs AS newest WHERE newest.routine_id = routines.id
		ORDER BY newest.started_at DESC, newest.id DESC LIMIT ?2)
	WHERE conversations.space_id = ?1
	ORDER BY routines.id, routine_runs.started_at DESC, routine_runs.id DESC";

const INSERT_RUN: &str = "INSERT INTO routine_runs
	(id, routine_id, started_at, ended_at, outcome, reason, lease_renewed_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?3)";

const OPEN_LEASE: &str =
	"SELECT lease_renewed_at FROM routine_runs WHERE routine_id = ?1 AND ended_at IS NULL";

const COUNT_STARTED_SINCE: &str = "SELECT count(*) FROM routine_runs
	WHERE routine_id = ?1 AND started_at > ?2 AND (outcome IS NULL OR outcome <> 'skipped')";

const CLOSE_RUN: &str = "UPDATE routine_runs
	SET ended_at = ?2, outcome = ?3, reason = ?4, cost_usd = ?5, model_usage = ?6,
		reported_turn_id = ?7
	WHERE id = ?1 AND ended_at IS NULL";

const CONVERSATION_OF_OPEN_RUN: &str = "SELECT routines.conversation_id
	FROM routine_runs JOIN routines ON routines.id = routine_runs.routine_id
	WHERE routine_runs.id = ?1 AND routine_runs.ended_at IS NULL";

const RUN_REPORTING_IN_TURN: &str = "SELECT id FROM routine_runs WHERE reported_turn_id = ?1";

const SELECT_REPORTED_RUNS: &str = "SELECT routine_runs.reported_turn_id, routines.title,
	routines.trigger_source_id
	FROM routine_runs JOIN routines ON routines.id = routine_runs.routine_id
	WHERE routines.conversation_id = ?1 AND routine_runs.reported_turn_id IS NOT NULL
	ORDER BY routine_runs.started_at, routine_runs.id";

const PRUNE_DEDUPE_VALUES: &str = "DELETE FROM routine_dedupe_values WHERE seen_at <= ?1";

const HAS_DEDUPE_VALUE: &str =
	"SELECT 1 FROM routine_dedupe_values WHERE routine_id = ?1 AND value = ?2";

const RECORD_DEDUPE_VALUE: &str =
	"INSERT INTO routine_dedupe_values (routine_id, value, seen_at) VALUES (?1, ?2, ?3)
	ON CONFLICT (routine_id, value) DO UPDATE SET seen_at = excluded.seen_at";

#[derive(Debug, PartialEq)]
pub struct EnabledRoutine {
	pub routine: Routine,
	pub last_occurrence_at: Option<i64>,
}

#[derive(Debug)]
pub struct Admitted {
	pub decision: TriggerDecision,
	pub requested: Option<RunRequested>,
}

pub struct RoutinesRepository {
	access: Access,
}

impl RoutinesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn create(
		&self,
		draft: RoutineDraft,
		key: String,
		now: i64,
	) -> Result<Routine, RoutineError> {
		self.access.call_mut(move |connection| Ok(created(connection, &draft, &key, now))).await?
	}

	pub async fn update(&self, id: String, edit: RoutineEdit) -> Result<Routine, RoutineError> {
		self.access.call_mut(move |connection| Ok(updated(connection, &id, &edit))).await?
	}

	pub async fn delete(&self, id: String) -> Result<(), RoutineError> {
		self.access.call_mut(move |connection| Ok(deleted(connection, &id))).await?
	}

	pub async fn of_conversation(
		&self,
		conversation_id: String,
	) -> Result<Vec<Routine>, RoutineError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(SELECT_ROUTINES_OF_CONVERSATION)?;
				let rows = statement.query_map([&conversation_id], routine)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn enabled_on_source(
		&self,
		trigger_source_id: String,
	) -> Result<Vec<EnabledRoutine>, RoutineError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(SELECT_ENABLED_ON_SOURCE)?;
				let rows = statement.query_map([&trigger_source_id], enabled_routine)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn record_occurrence(&self, id: String, at: i64) -> Result<(), RoutineError> {
		self.access.call_mut(move |connection| Ok(recorded_occurrence(connection, &id, at))).await?
	}

	pub async fn held(&self, id: String) -> Result<Option<Routine>, RoutineError> {
		Ok(self
			.access
			.call(move |connection| {
				Ok(connection.query_row(SELECT_ROUTINE, [&id], routine).optional()?)
			})
			.await?)
	}

	pub async fn keyed_on_source(
		&self,
		key: String,
		trigger_source_id: String,
	) -> Result<Option<Routine>, RoutineError> {
		Ok(self
			.access
			.call(move |connection| {
				Ok(connection
					.query_row(SELECT_ROUTINE_ON_KEY, params![key, trigger_source_id], routine)
					.optional()?)
			})
			.await?)
	}

	pub async fn key_of(&self, id: String) -> Result<String, RoutineError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.query_row("SELECT trigger_key FROM routines WHERE id = ?1", [&id], |row| {
						row.get::<_, String>(0)
					})
					.optional()?
					.ok_or(id))
			})
			.await?
			.map_err(|id| RoutineError::UnknownRoutine { id })
	}

	pub async fn runs(
		&self,
		routine_id: String,
		limit: u32,
	) -> Result<Vec<RoutineRun>, RoutineError> {
		let page = runs_page(limit);
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(SELECT_RUNS_OF_ROUTINE)?;
				let rows = statement.query_map(params![routine_id, page], run)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn runs_of_space(
		&self,
		space_id: String,
		limit: u32,
	) -> Result<Vec<RoutineRuns>, RoutineError> {
		let page = runs_page(limit);
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(SELECT_RUNS_OF_SPACE)?;
				let rows = statement.query_map(params![space_id, page], routine_and_run)?;
				let mut grouped: Vec<RoutineRuns> = Vec::new();
				for row in rows {
					let (routine_id, ran) = row?;
					match grouped.last_mut() {
						Some(held) if held.routine_id == routine_id => held.runs.extend(ran),
						_ => grouped
							.push(RoutineRuns { routine_id, runs: ran.into_iter().collect() }),
					}
				}
				Ok(grouped)
			})
			.await?)
	}

	pub async fn renew_lease(&self, run_id: String, now: i64) -> Result<(), RoutineError> {
		self.access.call_mut(move |connection| Ok(renewed(connection, &run_id, now))).await?
	}

	pub async fn close_run(
		&self,
		run_id: String,
		closing: RunClosing,
		now: i64,
	) -> Result<RoutineRun, RoutineError> {
		self.access
			.call_mut(move |connection| Ok(closed(connection, &run_id, &closing, now)))
			.await?
	}

	pub async fn reported(
		&self,
		conversation_id: String,
	) -> Result<Vec<ReportedRun>, RoutineError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(SELECT_REPORTED_RUNS)?;
				let rows = statement.query_map([&conversation_id], reported_run)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn admit(&self, event: TriggerEvent, now: i64) -> Result<Admitted, RoutineError> {
		self.access.call_mut(move |connection| Ok(admitted(connection, &event, now))).await?
	}

	pub async fn admit_run_now(
		&self,
		routine_id: String,
		now: i64,
	) -> Result<Admitted, RoutineError> {
		self.access
			.call_mut(move |connection| Ok(admitted_for_run_now(connection, &routine_id, now)))
			.await?
	}
}

fn created(
	connection: &mut Connection,
	draft: &RoutineDraft,
	key: &str,
	now: i64,
) -> Result<Routine, RoutineError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	transaction
		.execute(
			"INSERT INTO routines (id, conversation_id, bot_id, title, instruction,
				trigger_source_id, event_filter, trigger_config, trigger_key, created_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
			params![
				id,
				draft.conversation_id,
				draft.bot_id,
				draft.title,
				draft.instruction,
				draft.trigger_source_id,
				as_text(&draft.filter)?,
				as_text(&draft.trigger_config)?,
				key,
				now,
			],
		)
		.map_err(|error| unknown_participant(error, &draft.conversation_id, &draft.bot_id))?;
	let stored = transaction.query_row(SELECT_ROUTINE, [&id], routine)?;
	transaction.commit()?;
	Ok(stored)
}

fn updated(
	connection: &mut Connection,
	id: &str,
	edit: &RoutineEdit,
) -> Result<Routine, RoutineError> {
	let transaction = write_transaction(connection)?;
	let held = transaction.query_row(SELECT_ROUTINE, [id], routine).optional()?;
	let held = held.ok_or_else(|| RoutineError::UnknownRoutine { id: id.to_owned() })?;
	let revived = edit.is_enabled && !held.is_enabled;
	transaction.execute(
		"UPDATE routines SET title = ?2, instruction = ?3, event_filter = ?4, trigger_config = ?5,
			is_enabled = ?6,
			consecutive_failures = CASE WHEN ?7 THEN 0 ELSE consecutive_failures END,
			last_failed_at = CASE WHEN ?7 THEN NULL ELSE last_failed_at END
			WHERE id = ?1",
		params![
			id,
			edit.title,
			edit.instruction,
			as_text(&edit.filter)?,
			as_text(&edit.trigger_config)?,
			edit.is_enabled,
			revived,
		],
	)?;
	let stored = transaction.query_row(SELECT_ROUTINE, [id], routine)?;
	transaction.commit()?;
	Ok(stored)
}

fn deleted(connection: &mut Connection, id: &str) -> Result<(), RoutineError> {
	let transaction = write_transaction(connection)?;
	let removed = transaction.execute("DELETE FROM routines WHERE id = ?1", [id])?;
	if removed == 0 {
		return Err(RoutineError::UnknownRoutine { id: id.to_owned() });
	}
	transaction.commit()?;
	Ok(())
}

fn recorded_occurrence(connection: &mut Connection, id: &str, at: i64) -> Result<(), RoutineError> {
	let transaction = write_transaction(connection)?;
	let recorded = transaction.execute(RECORD_OCCURRENCE, params![id, at])?;
	if recorded == 0 {
		return Err(RoutineError::UnknownRoutine { id: id.to_owned() });
	}
	transaction.commit()?;
	Ok(())
}

fn renewed(connection: &mut Connection, run_id: &str, now: i64) -> Result<(), RoutineError> {
	let transaction = write_transaction(connection)?;
	let renewed = transaction.execute(
		"UPDATE routine_runs SET lease_renewed_at = ?2 WHERE id = ?1 AND ended_at IS NULL",
		params![run_id, now],
	)?;
	if renewed == 0 {
		return Err(closed_or_unknown(&transaction, run_id)?);
	}
	transaction.commit()?;
	Ok(())
}

fn closed(
	connection: &mut Connection,
	run_id: &str,
	closing: &RunClosing,
	now: i64,
) -> Result<RoutineRun, RoutineError> {
	let transaction = write_transaction(connection)?;
	refuse_unreportable_turn(&transaction, run_id, closing)?;
	let written = transaction.execute(
		CLOSE_RUN,
		params![
			run_id,
			now,
			closing.outcome,
			closing.reason,
			closing.cost_usd,
			closing.model_usage.as_ref().map(as_text).transpose()?,
			closing.reported_turn_id,
		],
	)?;
	if written == 0 {
		return Err(closed_or_unknown(&transaction, run_id)?);
	}
	let stored = transaction.query_row(SELECT_RUN, [run_id], run)?;
	settle_failures(&transaction, &stored.routine_id, closing.outcome, now)?;
	transaction.commit()?;
	Ok(stored)
}

fn refuse_unreportable_turn(
	transaction: &Transaction<'_>,
	run_id: &str,
	closing: &RunClosing,
) -> Result<(), RoutineError> {
	let Some(turn_id) = closing.reported_turn_id.as_deref() else {
		return Ok(());
	};
	if closing.outcome != RunOutcome::Ok {
		return Err(RoutineError::TurnWithoutReport {
			turn_id: turn_id.to_owned(),
			outcome: closing.outcome,
		});
	}
	let of_run: Option<String> =
		transaction.query_row(CONVERSATION_OF_OPEN_RUN, [run_id], |row| row.get(0)).optional()?;
	let Some(of_run) = of_run else {
		return Ok(());
	};
	let Some(conversation_id) = conversation_of_turn(transaction, turn_id)? else {
		return Err(RoutineError::UnknownTurn { id: turn_id.to_owned() });
	};
	if conversation_id != of_run {
		return Err(RoutineError::TurnOfAnotherConversation {
			turn_id: turn_id.to_owned(),
			conversation_id,
		});
	}
	let reported_by: Option<String> =
		transaction.query_row(RUN_REPORTING_IN_TURN, [turn_id], |row| row.get(0)).optional()?;
	if let Some(run_id) = reported_by {
		return Err(RoutineError::TurnAlreadyReported { turn_id: turn_id.to_owned(), run_id });
	}
	Ok(())
}

fn admitted(
	connection: &mut Connection,
	event: &TriggerEvent,
	now: i64,
) -> Result<Admitted, RoutineError> {
	let transaction = write_transaction(connection)?;
	let held = prepared(&transaction, &event.routine_id, now)?;
	let dedupe = match core::dedupe_value(&event.source, &event.payload) {
		None => Dedupe::Missing,
		Some(value) if seen(&transaction, &event.routine_id, &value)? => Dedupe::Seen,
		Some(value) => Dedupe::Fresh(value),
	};
	let facts = facts(&transaction, &held, dedupe, now)?;
	let verdict = core::verdict(&facts, event, now);
	if let (Verdict::Start, Dedupe::Fresh(value)) = (&verdict, &facts.dedupe) {
		transaction.execute(RECORD_DEDUPE_VALUE, params![held.id, value, now])?;
	}
	let admitted =
		applied(&transaction, &held, verdict, RunCause::Trigger, event.payload.clone(), now)?;
	transaction.commit()?;
	Ok(admitted)
}

fn admitted_for_run_now(
	connection: &mut Connection,
	routine_id: &str,
	now: i64,
) -> Result<Admitted, RoutineError> {
	let transaction = write_transaction(connection)?;
	let held = prepared(&transaction, routine_id, now)?;
	let facts = facts(&transaction, &held, Dedupe::Missing, now)?;
	let verdict = core::verdict_for_run_now(&facts, now);
	let admitted = applied(&transaction, &held, verdict, RunCause::RunNow, json!({}), now)?;
	transaction.commit()?;
	Ok(admitted)
}

fn prepared(
	transaction: &Transaction<'_>,
	routine_id: &str,
	now: i64,
) -> Result<Routine, RoutineError> {
	transaction.execute(PRUNE_DEDUPE_VALUES, [now - DEDUPE_RETENTION_MS])?;
	expire_stale_lease(transaction, routine_id, now)?;
	transaction
		.query_row(SELECT_ROUTINE, [routine_id], routine)
		.optional()?
		.ok_or_else(|| RoutineError::UnknownRoutine { id: routine_id.to_owned() })
}

fn expire_stale_lease(
	transaction: &Transaction<'_>,
	routine_id: &str,
	now: i64,
) -> Result<(), RoutineError> {
	let stale = transaction.execute(
		"UPDATE routine_runs SET ended_at = ?2, outcome = 'failed', reason = ?3
			WHERE routine_id = ?1 AND ended_at IS NULL AND lease_renewed_at <= ?4",
		params![routine_id, now, LEASE_EXPIRED, now - LEASE_MS],
	)?;
	if stale > 0 {
		settle_failures(transaction, routine_id, RunOutcome::Failed, now)?;
	}
	Ok(())
}

fn settle_failures(
	transaction: &Transaction<'_>,
	routine_id: &str,
	outcome: RunOutcome,
	now: i64,
) -> Result<(), RoutineError> {
	if outcome.clears_failures() {
		transaction.execute(
			"UPDATE routines SET consecutive_failures = 0, last_failed_at = NULL WHERE id = ?1",
			[routine_id],
		)?;
		return Ok(());
	}
	if !outcome.is_failure() {
		return Ok(());
	}
	transaction.execute(
		"UPDATE routines SET consecutive_failures = consecutive_failures + 1, last_failed_at = ?2,
			is_enabled = CASE WHEN consecutive_failures + 1 >= ?3 THEN 0 ELSE is_enabled END
			WHERE id = ?1",
		params![routine_id, now, FAILURES_BEFORE_DISABLE],
	)?;
	Ok(())
}

fn facts(
	transaction: &Transaction<'_>,
	held: &Routine,
	dedupe: Dedupe,
	now: i64,
) -> Result<Facts, RoutineError> {
	Ok(Facts {
		is_enabled: held.is_enabled,
		filter: held.filter.clone(),
		dedupe,
		lease_renewed_at: open_lease(transaction, &held.id)?,
		started_in_last_hour: transaction.query_row(
			COUNT_STARTED_SINCE,
			params![held.id, now - HOUR_MS],
			|row| row.get(0),
		)?,
		consecutive_failures: held.consecutive_failures,
		last_failed_at: transaction.query_row(
			"SELECT last_failed_at FROM routines WHERE id = ?1",
			[&held.id],
			|row| row.get(0),
		)?,
	})
}

fn applied(
	transaction: &Transaction<'_>,
	held: &Routine,
	verdict: Verdict,
	cause: RunCause,
	payload: Value,
	now: i64,
) -> Result<Admitted, RoutineError> {
	match verdict {
		Verdict::Refuse(by) => {
			Ok(Admitted { decision: TriggerDecision::Refused { by }, requested: None })
		}
		Verdict::Skip(reason) => {
			let run_id = write_run(transaction, &held.id, now, Some((reason, now)))?;
			Ok(Admitted { decision: TriggerDecision::Skipped { run_id, reason }, requested: None })
		}
		Verdict::Start => {
			let run_id = write_run(transaction, &held.id, now, None)?;
			Ok(Admitted {
				decision: TriggerDecision::Started { run_id: run_id.clone() },
				requested: Some(RunRequested {
					cause,
					title: held.title.clone(),
					instruction: held.instruction.clone(),
					routine_id: held.id.clone(),
					run_id,
					bot_id: held.bot_id.clone(),
					conversation_id: held.conversation_id.clone(),
					trigger_source_id: held.trigger_source_id.clone(),
					payload,
				}),
			})
		}
	}
}

fn write_run(
	transaction: &Transaction<'_>,
	routine_id: &str,
	now: i64,
	skipped: Option<(SkipReason, i64)>,
) -> Result<String, RoutineError> {
	let id = Uuid::new_v4().to_string();
	let (ended_at, outcome, reason) = match skipped {
		Some((reason, ended_at)) => {
			(Some(ended_at), Some(RunOutcome::Skipped), Some(reason.recorded()))
		}
		None => (None, None, None),
	};
	transaction.execute(INSERT_RUN, params![id, routine_id, now, ended_at, outcome, reason])?;
	Ok(id)
}

fn open_lease(
	transaction: &Transaction<'_>,
	routine_id: &str,
) -> Result<Option<i64>, RoutineError> {
	Ok(transaction.query_row(OPEN_LEASE, [routine_id], |row| row.get(0)).optional()?)
}

fn seen(
	transaction: &Transaction<'_>,
	routine_id: &str,
	value: &str,
) -> Result<bool, RoutineError> {
	Ok(transaction
		.query_row(HAS_DEDUPE_VALUE, params![routine_id, value], |_| Ok(()))
		.optional()?
		.is_some())
}

fn closed_or_unknown(
	transaction: &Transaction<'_>,
	run_id: &str,
) -> Result<RoutineError, RoutineError> {
	let held = transaction.query_row(SELECT_RUN, [run_id], run).optional()?;
	Ok(match held {
		Some(_) => RoutineError::RunAlreadyClosed { id: run_id.to_owned() },
		None => RoutineError::UnknownRun { id: run_id.to_owned() },
	})
}

fn unknown_participant(
	error: rusqlite::Error,
	conversation_id: &str,
	bot_id: &str,
) -> RoutineError {
	match error.sqlite_error_code() {
		Some(rusqlite::ErrorCode::ConstraintViolation) => RoutineError::UnknownParticipant {
			conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
		},
		_ => RoutineError::from(DatabaseError::Sqlite(error)),
	}
}

fn routine(row: &Row<'_>) -> rusqlite::Result<Routine> {
	Ok(Routine {
		id: row.get(0)?,
		conversation_id: row.get(1)?,
		bot_id: row.get(2)?,
		title: row.get(3)?,
		instruction: row.get(4)?,
		trigger_source_id: row.get(5)?,
		filter: from_text(row, 6)?,
		trigger_config: from_text(row, 7)?,
		is_enabled: row.get(8)?,
		consecutive_failures: row.get(9)?,
		created_at: row.get(10)?,
	})
}

fn enabled_routine(row: &Row<'_>) -> rusqlite::Result<EnabledRoutine> {
	Ok(EnabledRoutine { routine: routine(row)?, last_occurrence_at: row.get(11)? })
}

fn runs_page(limit: u32) -> u32 {
	limit.clamp(1, MAX_RUNS_PER_PAGE)
}

fn run(row: &Row<'_>) -> rusqlite::Result<RoutineRun> {
	Ok(RoutineRun {
		id: row.get(0)?,
		routine_id: row.get(1)?,
		started_at: row.get(2)?,
		ended_at: row.get(3)?,
		outcome: row.get(4)?,
		reason: row.get(5)?,
		cost_usd: row.get(6)?,
		model_usage: row.get::<_, Option<String>>(7)?.map(|text| parsed(&text)).transpose()?,
	})
}

fn routine_and_run(row: &Row<'_>) -> rusqlite::Result<(String, Option<RoutineRun>)> {
	let has_run = row.get::<_, Option<String>>(0)?.is_some();
	Ok((row.get(8)?, has_run.then(|| run(row)).transpose()?))
}

fn reported_run(row: &Row<'_>) -> rusqlite::Result<ReportedRun> {
	Ok(ReportedRun {
		turn_id: row.get(0)?,
		routine_title: row.get(1)?,
		trigger_source_id: row.get(2)?,
	})
}

fn from_text<T: serde::de::DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
	parsed(&row.get::<_, String>(index)?)
}

fn parsed<T: serde::de::DeserializeOwned>(text: &str) -> rusqlite::Result<T> {
	serde_json::from_str(text).map_err(|error| {
		rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
	})
}

fn as_text<T: serde::Serialize>(value: &T) -> Result<String, RoutineError> {
	serde_json::to_string(value)
		.map_err(|error| RoutineError::Unexpected { detail: error.to_string() })
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open, Database};
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::routines::contract::{
		FieldType, Filter, FilterMatchMode, FilterOperator, FilterRow, PayloadField, Refusal,
		ReportedRun, TriggerSource,
	};
	use crate::routines::core::{HOURLY_CAP, LEASE_MS};

	const NOW: i64 = 1_800_000_000_000;
	const CONVERSATION: &str = "c1";
	const BOT: &str = "b1";
	const KEY: &str = "a-generated-key";
	const TITLE: &str = "Nightly report";
	const INSTRUCTION: &str = "Read the shift log and report what changed.";

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	const A_TURN: &str = "
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t1', 'c1', 1, 1);
	";

	const ANOTHER_CONVERSATION_WITH_A_TURN: &str = "
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c2', 'topic', 'Second', 1, 1);
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t2', 'c2', 1, 1);
	";

	async fn planted() -> (Database, RemovedOnDrop) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
			.await
			.expect("the participant is planted");
		(database, dir)
	}

	fn a_source() -> TriggerSource {
		TriggerSource {
			id: "schedule".to_owned(),
			title: "On a schedule".to_owned(),
			payload: vec![
				PayloadField { name: "firedAt".to_owned(), field_type: FieldType::Datetime },
				PayloadField { name: "shift".to_owned(), field_type: FieldType::String },
			],
			dedupe_key: "firedAt".to_owned(),
			header: None,
		}
	}

	fn an_event(at: &str) -> TriggerEvent {
		TriggerEvent {
			routine_id: String::new(),
			source: a_source(),
			payload: json!({ "firedAt": at, "shift": "night" }),
		}
	}

	fn a_draft(filter: Filter) -> RoutineDraft {
		RoutineDraft {
			conversation_id: CONVERSATION.to_owned(),
			bot_id: BOT.to_owned(),
			title: TITLE.to_owned(),
			instruction: INSTRUCTION.to_owned(),
			trigger_source_id: "schedule".to_owned(),
			filter,
			trigger_config: json!({ "every": "1h" }),
		}
	}

	fn no_filter() -> Filter {
		Filter { match_mode: FilterMatchMode::All, rows: Vec::new() }
	}

	async fn a_routine(database: &Database, filter: Filter) -> Routine {
		database
			.routines()
			.create(a_draft(filter), KEY.to_owned(), NOW)
			.await
			.expect("the routine is written")
	}

	async fn triggered(database: &Database, id: &str, at: &str, now: i64) -> Admitted {
		let mut event = an_event(at);
		event.routine_id = id.to_owned();
		database.routines().admit(event, now).await.expect("the decision is reached")
	}

	async fn runs_of(database: &Database, id: &str) -> Vec<RoutineRun> {
		database.routines().runs(id.to_owned(), 100).await.expect("the runs read")
	}

	fn closing(outcome: RunOutcome) -> RunClosing {
		RunClosing {
			outcome,
			reason: None,
			cost_usd: None,
			model_usage: None,
			reported_turn_id: None,
		}
	}

	fn reporting(turn_id: &str) -> RunClosing {
		RunClosing { reported_turn_id: Some(turn_id.to_owned()), ..closing(RunOutcome::Ok) }
	}

	async fn plant(database: &Database, statement: &'static str) {
		database
			.call_mut(move |connection| Ok(connection.execute_batch(statement)?))
			.await
			.expect("the rows are planted");
	}

	async fn open_runs(database: &Database, run_id: String) -> u32 {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM routine_runs WHERE id = ?1 AND ended_at IS NULL",
					[&run_id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the run reads")
	}

	async fn started(database: &Database, id: &str, at: &str, now: i64) -> String {
		let admitted = triggered(database, id, at, now).await;
		match admitted.decision {
			TriggerDecision::Started { run_id } => run_id,
			other => panic!("the event at {at} was not started: {other:?}"),
		}
	}

	async fn ended(database: &Database, run_id: String, outcome: RunOutcome, now: i64) {
		database.routines().close_run(run_id, closing(outcome), now).await.expect("the run closes");
	}

	async fn failing(database: &Database, id: &str, times: u32) -> i64 {
		let mut at = NOW;
		for step in 0..times {
			at = NOW + step as i64 * 2 * HOUR_MS;
			let fired = format!("2026-09-0{}T00:00:00Z", step + 1);
			let run_id = started(database, id, &fired, at).await;
			ended(database, run_id, RunOutcome::Failed, at).await;
		}
		at
	}

	#[tokio::test]
	async fn an_event_passing_every_check_leaves_one_started_run_and_one_request() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;

		let admitted = triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let TriggerDecision::Started { run_id } = admitted.decision else {
			panic!("got {:?}", admitted.decision);
		};
		let runs = runs_of(&database, &held.id).await;
		assert_eq!(runs.len(), 1);
		assert_eq!(runs[0].id, run_id);
		assert_eq!(runs[0].started_at, NOW);
		assert_eq!(runs[0].ended_at, None);
		assert_eq!(runs[0].outcome, None);
		assert_eq!(
			admitted.requested,
			Some(RunRequested {
				cause: RunCause::Trigger,
				title: TITLE.to_owned(),
				instruction: INSTRUCTION.to_owned(),
				routine_id: held.id.clone(),
				run_id,
				bot_id: BOT.to_owned(),
				conversation_id: CONVERSATION.to_owned(),
				trigger_source_id: "schedule".to_owned(),
				payload: json!({ "firedAt": "2026-09-02T10:00:00Z", "shift": "night" }),
			})
		);
	}

	#[tokio::test]
	async fn a_disabled_routine_writes_no_run() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		database
			.routines()
			.update(
				held.id.clone(),
				RoutineEdit {
					title: TITLE.to_owned(),
					instruction: INSTRUCTION.to_owned(),
					filter: no_filter(),
					trigger_config: held.trigger_config.clone(),
					is_enabled: false,
				},
			)
			.await
			.expect("the routine is disabled");

		let admitted = triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		assert_eq!(admitted.decision, TriggerDecision::Refused { by: Refusal::Disabled });
		assert!(admitted.requested.is_none());
		assert_eq!(runs_of(&database, &held.id).await, Vec::new());
	}

	#[tokio::test]
	async fn an_event_the_filter_refuses_writes_no_run() {
		let (database, _dir) = planted().await;
		let filter = Filter {
			match_mode: FilterMatchMode::All,
			rows: vec![FilterRow {
				field: "shift".to_owned(),
				operator: FilterOperator::Equals,
				value: Some(json!("day")),
			}],
		};
		let held = a_routine(&database, filter).await;

		let admitted = triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		assert_eq!(admitted.decision, TriggerDecision::Refused { by: Refusal::Filter });
		assert_eq!(runs_of(&database, &held.id).await, Vec::new());
	}

	#[tokio::test]
	async fn an_event_lacking_the_dedupe_field_writes_no_run() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let event = TriggerEvent {
			routine_id: held.id.clone(),
			source: a_source(),
			payload: json!({ "shift": "night" }),
		};

		let admitted =
			database.routines().admit(event, NOW).await.expect("the decision is reached");

		assert_eq!(admitted.decision, TriggerDecision::Refused { by: Refusal::DedupeValueMissing });
		assert_eq!(runs_of(&database, &held.id).await, Vec::new());
	}

	#[tokio::test]
	async fn a_dedupe_value_already_seen_writes_no_second_run() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;
		ended(&database, run_id, RunOutcome::Ok, NOW).await;

		let again = triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW + 1).await;

		assert_eq!(again.decision, TriggerDecision::Refused { by: Refusal::AlreadySeen });
		assert_eq!(runs_of(&database, &held.id).await.len(), 1);
	}

	#[tokio::test]
	async fn a_held_lease_writes_a_skipped_run_naming_the_previous_run() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let second = triggered(&database, &held.id, "2026-09-02T11:00:00Z", NOW + 1000).await;

		let TriggerDecision::Skipped { run_id, reason } = second.decision else {
			panic!("got {:?}", second.decision);
		};
		assert_eq!(reason, SkipReason::LeaseHeld);
		assert!(second.requested.is_none());
		let runs = runs_of(&database, &held.id).await;
		let skipped = runs.iter().find(|run| run.id == run_id).expect("the skipped run is held");
		assert_eq!(skipped.outcome, Some(RunOutcome::Skipped));
		assert_eq!(skipped.reason.as_deref(), Some("previous run still in progress"));
		assert_eq!(skipped.ended_at, Some(NOW + 1000));
	}

	#[tokio::test]
	async fn a_lease_nobody_renewed_for_five_minutes_ends_its_run_as_failed_and_frees_the_routine()
	{
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		triggered(&database, &held.id, "2026-09-02T11:00:00Z", NOW + LEASE_MS).await;

		let runs = runs_of(&database, &held.id).await;
		let expired = runs.iter().find(|run| run.id == run_id).expect("the first run is held");
		assert_eq!(expired.outcome, Some(RunOutcome::Failed));
		assert_eq!(expired.reason.as_deref(), Some("lease expired"));
		assert_eq!(expired.ended_at, Some(NOW + LEASE_MS));
		let freed =
			started(&database, &held.id, "2026-09-02T12:00:00Z", NOW + LEASE_MS + 30_000).await;
		assert!(!freed.is_empty());
	}

	#[tokio::test]
	async fn a_renewed_lease_holds_the_routine_past_five_minutes() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;
		database
			.routines()
			.renew_lease(run_id, NOW + LEASE_MS - 1)
			.await
			.expect("the lease is renewed");

		let later = triggered(&database, &held.id, "2026-09-02T11:00:00Z", NOW + LEASE_MS).await;

		assert_eq!(
			later.decision,
			TriggerDecision::Skipped {
				run_id: match later.decision.clone() {
					TriggerDecision::Skipped { run_id, .. } => run_id,
					other => panic!("got {other:?}"),
				},
				reason: SkipReason::LeaseHeld,
			}
		);
	}

	#[tokio::test]
	async fn a_thirteenth_event_within_the_hour_writes_a_skipped_run_reading_the_cap() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		for step in 0..HOURLY_CAP {
			let at = format!("2026-09-02T10:{step:02}:00Z");
			let run_id = started(&database, &held.id, &at, NOW + step as i64).await;
			ended(&database, run_id, RunOutcome::Ok, NOW + step as i64).await;
		}

		let capped = triggered(&database, &held.id, "2026-09-02T11:59:00Z", NOW + 1000).await;

		let TriggerDecision::Skipped { run_id, reason } = capped.decision else {
			panic!("got {:?}", capped.decision);
		};
		assert_eq!(reason, SkipReason::HourlyCap);
		let runs = runs_of(&database, &held.id).await;
		let skipped = runs.iter().find(|run| run.id == run_id).expect("the skipped run is held");
		assert_eq!(skipped.reason.as_deref(), Some("hourly cap"));
		assert_eq!(runs.len() as u32, HOURLY_CAP + 1);
	}

	#[tokio::test]
	async fn one_failure_holds_the_next_event_for_thirty_seconds() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let failed_at = failing(&database, &held.id, 1).await;

		let inside =
			triggered(&database, &held.id, "2026-09-02T20:00:00Z", failed_at + 29_999).await;
		let outside =
			triggered(&database, &held.id, "2026-09-02T21:00:00Z", failed_at + 30_000).await;

		let TriggerDecision::Skipped { run_id, reason } = inside.decision else {
			panic!("got {:?}", inside.decision);
		};
		assert_eq!(reason, SkipReason::BackingOff);
		let runs = runs_of(&database, &held.id).await;
		let skipped = runs.iter().find(|run| run.id == run_id).expect("the skipped run is held");
		assert_eq!(skipped.reason.as_deref(), Some("backing off"));
		assert!(matches!(outside.decision, TriggerDecision::Started { .. }), "{outside:?}");
	}

	#[tokio::test]
	async fn five_consecutive_failures_disable_the_routine() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;

		let failed_at = failing(&database, &held.id, 5).await;

		let after =
			triggered(&database, &held.id, "2026-09-02T23:00:00Z", failed_at + HOUR_MS).await;
		assert_eq!(after.decision, TriggerDecision::Refused { by: Refusal::Disabled });
		let stored = database
			.routines()
			.held(held.id.clone())
			.await
			.expect("the routine reads")
			.expect("the routine is held");
		assert!(!stored.is_enabled);
		assert_eq!(stored.consecutive_failures, 5);
	}

	#[tokio::test]
	async fn a_run_ending_ok_or_nothing_clears_the_failures() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let failed_at = failing(&database, &held.id, 1).await;

		let run_id =
			started(&database, &held.id, "2026-09-10T00:00:00Z", failed_at + HOUR_MS).await;
		ended(&database, run_id, RunOutcome::Nothing, failed_at + HOUR_MS).await;

		let cleared = database
			.routines()
			.held(held.id.clone())
			.await
			.expect("the routine reads")
			.expect("the routine is held");
		assert_eq!(cleared.consecutive_failures, 0);
	}

	#[tokio::test]
	async fn a_routine_reads_back_with_the_task_it_was_written_with() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;

		let listed = database
			.routines()
			.of_conversation(CONVERSATION.to_owned())
			.await
			.expect("the routines read");

		assert_eq!(held.title, TITLE);
		assert_eq!(held.instruction, INSTRUCTION);
		assert_eq!(listed, vec![held]);
	}

	#[tokio::test]
	async fn an_edit_carries_the_title_and_the_instruction_it_names() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;

		let stored = database
			.routines()
			.update(
				held.id.clone(),
				RoutineEdit {
					title: "Weekly digest".to_owned(),
					instruction: "Summarise the week.".to_owned(),
					filter: no_filter(),
					trigger_config: held.trigger_config.clone(),
					is_enabled: true,
				},
			)
			.await
			.expect("the routine is edited");

		assert_eq!(stored.title, "Weekly digest");
		assert_eq!(stored.instruction, "Summarise the week.");
	}

	#[tokio::test]
	async fn a_run_requested_by_a_trigger_after_an_edit_carries_the_task_read_at_that_moment() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		database
			.routines()
			.update(
				held.id.clone(),
				RoutineEdit {
					title: "Weekly digest".to_owned(),
					instruction: "Summarise the week.".to_owned(),
					filter: no_filter(),
					trigger_config: held.trigger_config.clone(),
					is_enabled: true,
				},
			)
			.await
			.expect("the routine is edited");

		let admitted = triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let requested = admitted.requested.expect("a run is requested");
		assert_eq!(requested.cause, RunCause::Trigger);
		assert_eq!(requested.title, "Weekly digest");
		assert_eq!(requested.instruction, "Summarise the week.");
	}

	#[tokio::test]
	async fn a_disabled_routine_enabled_again_clears_the_failures() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		failing(&database, &held.id, 5).await;

		let revived = database
			.routines()
			.update(
				held.id.clone(),
				RoutineEdit {
					title: TITLE.to_owned(),
					instruction: INSTRUCTION.to_owned(),
					filter: no_filter(),
					trigger_config: held.trigger_config.clone(),
					is_enabled: true,
				},
			)
			.await
			.expect("the routine is enabled again");

		assert!(revived.is_enabled);
		assert_eq!(revived.consecutive_failures, 0);
	}

	#[tokio::test]
	async fn a_dedupe_value_older_than_thirty_days_is_pruned_and_admits_the_event_again() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;
		ended(&database, run_id, RunOutcome::Ok, NOW).await;

		let later =
			triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW + DEDUPE_RETENTION_MS).await;

		assert!(matches!(later.decision, TriggerDecision::Started { .. }), "{later:?}");
		assert_eq!(count_of(&database, "routine_dedupe_values").await, 1);
	}

	#[tokio::test]
	async fn run_now_skips_the_filter_and_the_dedupe_key_and_names_its_cause() {
		let (database, _dir) = planted().await;
		let filter = Filter {
			match_mode: FilterMatchMode::All,
			rows: vec![FilterRow {
				field: "shift".to_owned(),
				operator: FilterOperator::Equals,
				value: Some(json!("day")),
			}],
		};
		let held = a_routine(&database, filter).await;

		let admitted = database
			.routines()
			.admit_run_now(held.id.clone(), NOW)
			.await
			.expect("the decision is reached");

		assert!(matches!(admitted.decision, TriggerDecision::Started { .. }), "{admitted:?}");
		let requested = admitted.requested.expect("a run is requested");
		assert_eq!(requested.cause, RunCause::RunNow);
		assert_eq!(requested.title, TITLE);
		assert_eq!(requested.instruction, INSTRUCTION);
		assert_eq!(requested.payload, json!({}));
		assert_eq!(count_of(&database, "routine_dedupe_values").await, 0);
	}

	#[tokio::test]
	async fn a_routine_goes_with_its_conversation_and_its_runs_go_with_it() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		triggered(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		database
			.call_mut(|connection| {
				Ok(connection.execute("DELETE FROM conversations WHERE id = 'c1'", [])?)
			})
			.await
			.expect("the conversation goes");

		assert_eq!(count_of(&database, "routines").await, 0);
		assert_eq!(count_of(&database, "routine_runs").await, 0);
		assert_eq!(count_of(&database, "routine_dedupe_values").await, 0);
	}

	#[tokio::test]
	async fn a_routine_goes_with_its_bot() {
		let (database, _dir) = planted().await;
		a_routine(&database, no_filter()).await;

		database
			.call_mut(|connection| Ok(connection.execute("DELETE FROM bots WHERE id = 'b1'", [])?))
			.await
			.expect("the bot goes");

		assert_eq!(count_of(&database, "routines").await, 0);
	}

	#[tokio::test]
	async fn a_closed_run_carries_its_cost_and_its_model_usage_back() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let closed = database
			.routines()
			.close_run(
				run_id.clone(),
				RunClosing {
					outcome: RunOutcome::Ok,
					reason: Some("done".to_owned()),
					cost_usd: Some(0.42),
					model_usage: Some(json!({ "sonnet": { "inputTokens": 120 } })),
					reported_turn_id: None,
				},
				NOW + 10,
			)
			.await
			.expect("the run closes");

		assert_eq!(closed.outcome, Some(RunOutcome::Ok));
		assert_eq!(closed.cost_usd, Some(0.42));
		assert_eq!(closed.model_usage, Some(json!({ "sonnet": { "inputTokens": 120 } })));
		let refused = database
			.routines()
			.close_run(run_id.clone(), closing(RunOutcome::Ok), NOW + 20)
			.await
			.expect_err("a closed run is not closed twice");
		assert_eq!(refused, RoutineError::RunAlreadyClosed { id: run_id });
	}

	#[tokio::test]
	async fn a_run_closed_naming_a_turn_of_its_conversation_is_answered_with_its_routine() {
		let (database, _dir) = planted().await;
		plant(&database, A_TURN).await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		database
			.routines()
			.close_run(run_id, reporting("t1"), NOW + 10)
			.await
			.expect("the run closes");

		assert_eq!(
			database
				.routines()
				.reported(CONVERSATION.to_owned())
				.await
				.expect("the reported runs read"),
			vec![ReportedRun {
				turn_id: "t1".to_owned(),
				routine_title: TITLE.to_owned(),
				trigger_source_id: "schedule".to_owned(),
			}]
		);
	}

	#[tokio::test]
	async fn a_run_closed_naming_no_turn_is_left_out_of_the_reported_runs() {
		let (database, _dir) = planted().await;
		plant(&database, A_TURN).await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		ended(&database, run_id, RunOutcome::Ok, NOW + 10).await;

		assert_eq!(
			database.routines().reported(CONVERSATION.to_owned()).await.expect("the answer reads"),
			Vec::new()
		);
	}

	#[tokio::test]
	async fn a_closing_naming_a_turn_nobody_wrote_is_refused_and_leaves_the_run_open() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let refused = database
			.routines()
			.close_run(run_id.clone(), reporting("nobody"), NOW + 10)
			.await
			.expect_err("a turn nobody wrote does not close a run");

		assert_eq!(refused, RoutineError::UnknownTurn { id: "nobody".to_owned() });
		assert_eq!(open_runs(&database, run_id).await, 1, "the refused closing ended the run");
	}

	#[tokio::test]
	async fn a_closing_naming_a_turn_of_another_conversation_is_refused_and_leaves_the_run_open() {
		let (database, _dir) = planted().await;
		plant(&database, ANOTHER_CONVERSATION_WITH_A_TURN).await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let refused = database
			.routines()
			.close_run(run_id.clone(), reporting("t2"), NOW + 10)
			.await
			.expect_err("a turn of another conversation does not close a run");

		assert_eq!(
			refused,
			RoutineError::TurnOfAnotherConversation {
				turn_id: "t2".to_owned(),
				conversation_id: "c2".to_owned(),
			}
		);
		assert_eq!(open_runs(&database, run_id).await, 1, "the refused closing ended the run");
	}

	#[tokio::test]
	async fn a_closing_naming_a_turn_another_run_reported_in_is_refused_and_leaves_both_runs_alone()
	{
		let (database, _dir) = planted().await;
		plant(&database, A_TURN).await;
		let held = a_routine(&database, no_filter()).await;
		let first = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;
		database
			.routines()
			.close_run(first.clone(), reporting("t1"), NOW + 10)
			.await
			.expect("the first run closes");
		let second = started(&database, &held.id, "2026-09-02T11:00:00Z", NOW + HOUR_MS).await;

		let refused = database
			.routines()
			.close_run(second.clone(), reporting("t1"), NOW + HOUR_MS + 10)
			.await
			.expect_err("a turn already reported in does not close a second run");

		assert_eq!(
			refused,
			RoutineError::TurnAlreadyReported { turn_id: "t1".to_owned(), run_id: first }
		);
		assert_eq!(open_runs(&database, second).await, 1, "the refused closing ended the run");
		assert_eq!(
			database
				.routines()
				.reported(CONVERSATION.to_owned())
				.await
				.expect("the reported runs read")
				.len(),
			1,
			"the turn is reported in by more than one run"
		);
	}

	#[tokio::test]
	async fn a_closing_naming_a_turn_without_the_outcome_ok_is_refused_and_leaves_the_run_open() {
		let (database, _dir) = planted().await;
		plant(&database, A_TURN).await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;

		let refused = database
			.routines()
			.close_run(
				run_id.clone(),
				RunClosing {
					reported_turn_id: Some("t1".to_owned()),
					..closing(RunOutcome::Nothing)
				},
				NOW + 10,
			)
			.await
			.expect_err("a run that wrote no report does not name a turn");

		assert_eq!(
			refused,
			RoutineError::TurnWithoutReport {
				turn_id: "t1".to_owned(),
				outcome: RunOutcome::Nothing,
			}
		);
		assert_eq!(open_runs(&database, run_id).await, 1, "the refused closing ended the run");
	}

	#[tokio::test]
	async fn a_reported_run_whose_routine_is_gone_is_left_out_of_the_reported_runs() {
		let (database, _dir) = planted().await;
		plant(&database, A_TURN).await;
		let held = a_routine(&database, no_filter()).await;
		let run_id = started(&database, &held.id, "2026-09-02T10:00:00Z", NOW).await;
		database
			.routines()
			.close_run(run_id, reporting("t1"), NOW + 10)
			.await
			.expect("the run closes");

		database.routines().delete(held.id).await.expect("the routine goes");

		assert_eq!(
			database.routines().reported(CONVERSATION.to_owned()).await.expect("the answer reads"),
			Vec::new()
		);
	}

	#[tokio::test]
	async fn the_key_is_readable_only_once_the_routine_is_written() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;

		assert_eq!(database.routines().key_of(held.id).await.expect("the key reads"), KEY);
		assert_eq!(
			database.routines().key_of("nobody".to_owned()).await,
			Err(RoutineError::UnknownRoutine { id: "nobody".to_owned() })
		);
	}

	#[tokio::test]
	async fn the_routines_of_a_conversation_read_back_with_their_filter_and_configuration() {
		let (database, _dir) = planted().await;
		let filter = Filter {
			match_mode: FilterMatchMode::Any,
			rows: vec![FilterRow {
				field: "shift".to_owned(),
				operator: FilterOperator::Equals,
				value: Some(json!("night")),
			}],
		};
		let held = a_routine(&database, filter.clone()).await;

		let listed = database
			.routines()
			.of_conversation(CONVERSATION.to_owned())
			.await
			.expect("the routines read");

		assert_eq!(listed, vec![held]);
		assert_eq!(listed[0].filter, filter);
		assert_eq!(listed[0].trigger_config, json!({ "every": "1h" }));
	}

	#[tokio::test]
	async fn only_the_enabled_routines_of_the_source_asked_for_are_read() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;
		let other = database
			.routines()
			.create(
				RoutineDraft { trigger_source_id: "file-watch".to_owned(), ..a_draft(no_filter()) },
				"another-key".to_owned(),
				NOW,
			)
			.await
			.expect("the watching routine is written");
		database
			.routines()
			.update(
				other.id.clone(),
				RoutineEdit {
					title: other.title.clone(),
					instruction: other.instruction.clone(),
					filter: no_filter(),
					trigger_config: other.trigger_config.clone(),
					is_enabled: false,
				},
			)
			.await
			.expect("the watching routine is disabled");

		let scheduled = database
			.routines()
			.enabled_on_source("schedule".to_owned())
			.await
			.expect("the scheduled routines read");
		let watching = database
			.routines()
			.enabled_on_source("file-watch".to_owned())
			.await
			.expect("the watching routines read");

		assert_eq!(scheduled, vec![EnabledRoutine { routine: held, last_occurrence_at: None }]);
		assert!(watching.is_empty(), "a disabled routine was read as enabled");
	}

	#[tokio::test]
	async fn the_occurrence_recorded_on_a_routine_is_read_back_with_it() {
		let (database, _dir) = planted().await;
		let held = a_routine(&database, no_filter()).await;

		database
			.routines()
			.record_occurrence(held.id.clone(), NOW + 60_000)
			.await
			.expect("the occurrence is recorded");

		let scheduled = database
			.routines()
			.enabled_on_source("schedule".to_owned())
			.await
			.expect("the scheduled routines read");
		assert_eq!(scheduled[0].last_occurrence_at, Some(NOW + 60_000));
	}

	#[tokio::test]
	async fn an_occurrence_of_a_routine_that_is_gone_is_refused() {
		let (database, _dir) = planted().await;

		let failure = database
			.routines()
			.record_occurrence("nowhere".to_owned(), NOW)
			.await
			.expect_err("the occurrence is refused");

		assert!(matches!(failure, RoutineError::UnknownRoutine { .. }), "got {failure:?}");
	}

	const ROUTINES_IN_TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 257, 1, 1), ('empty', 'Empty', 132, 2, 1);
		INSERT INTO bots (id, name, model, created_at) VALUES ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b2', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('p1', 'topic', 'personal', 'Mine', 1, 1),
				('w1', 'topic', 'work', 'Theirs', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('p1', 'b1', 'assistant', 1, 0), ('w1', 'b2', 'assistant', 1, 0);
		INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at, title, instruction)
			VALUES ('r-busy', 'p1', 'b1', 'schedule', '[]', '{}', 'k1', 2, 'Busy', 'Read'),
				('r-idle', 'p1', 'b1', 'schedule', '[]', '{}', 'k2', 1, 'Idle', 'Read'),
				('r-work', 'w1', 'b2', 'schedule', '[]', '{}', 'k3', 1, 'Work', 'Read');
		INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome, lease_renewed_at)
			VALUES ('run-1', 'r-busy', 1, 2, 'ok', 1),
				('run-2', 'r-busy', 2, 3, 'failed', 2),
				('run-3a', 'r-busy', 3, 4, 'nothing', 3),
				('run-3b', 'r-busy', 3, NULL, NULL, 3),
				('run-w', 'r-work', 1, 2, 'ok', 1);
	";

	async fn routines_in_two_spaces() -> (Database, RemovedOnDrop) {
		let (database, dir) = planted().await;
		plant(&database, ROUTINES_IN_TWO_SPACES).await;
		(database, dir)
	}

	async fn runs_of_space(database: &Database, space_id: &str, limit: u32) -> Vec<RoutineRuns> {
		database
			.routines()
			.runs_of_space(space_id.to_owned(), limit)
			.await
			.expect("the runs of the space read")
	}

	fn routines_answered(answered: &[RoutineRuns]) -> Vec<&str> {
		answered.iter().map(|entry| entry.routine_id.as_str()).collect()
	}

	#[tokio::test]
	async fn each_space_answers_only_its_routines_with_the_runs_routine_runs_answers() {
		let (database, _dir) = routines_in_two_spaces().await;

		for limit in [0, 2, 3, MAX_RUNS_PER_PAGE + 1] {
			let personal = runs_of_space(&database, "personal", limit).await;
			let work = runs_of_space(&database, "work", limit).await;

			assert_eq!(routines_answered(&personal), ["r-busy", "r-idle"], "limit {limit}");
			assert_eq!(routines_answered(&work), ["r-work"], "limit {limit}");
			for entry in personal.iter().chain(&work) {
				let alone = database
					.routines()
					.runs(entry.routine_id.clone(), limit)
					.await
					.expect("the runs of the routine read");
				assert_eq!(entry.runs, alone, "{} at limit {limit}", entry.routine_id);
			}
		}
		let capped = runs_of_space(&database, "personal", 2).await;
		let newest: Vec<&str> = capped[0].runs.iter().map(|run| run.id.as_str()).collect();
		assert_eq!(newest, ["run-3b", "run-3a"], "the busy routine is cut at the limit");
		assert!(capped[1].runs.is_empty(), "a routine with no run answers an empty list");
	}

	#[tokio::test]
	async fn a_space_with_no_routine_answers_an_empty_list() {
		let (database, _dir) = routines_in_two_spaces().await;

		assert!(runs_of_space(&database, "empty", 10).await.is_empty());
		assert!(runs_of_space(&database, "unknown", 10).await.is_empty());
	}

	#[tokio::test]
	async fn the_runs_of_a_space_are_read_through_the_index_on_the_routine() {
		let (database, _dir) = routines_in_two_spaces().await;

		let plan = database
			.call(|connection| {
				let mut statement =
					connection.prepare(&format!("EXPLAIN QUERY PLAN {SELECT_RUNS_OF_SPACE}"))?;
				let rows = statement
					.query_map(params!["personal", 10], |row| row.get::<_, String>("detail"))?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
			.expect("the plan");

		assert!(
			plan.iter().any(|step| step.contains("routine_runs_by_routine")),
			"the runs read seeks the runs of each routine: got {plan:?}"
		);
		assert!(
			!plan.iter().any(|step| step.starts_with("SCAN routine_runs")),
			"the runs read never scans every run: got {plan:?}"
		);
	}
}
