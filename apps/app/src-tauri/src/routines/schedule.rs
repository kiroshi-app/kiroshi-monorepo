use std::str::FromStr;

use chrono::{DateTime, Local, Utc};
use croner::errors::CronError;
use croner::Cron;
use serde_json::{json, Value};

use super::contract::{Routine, RoutineError, TriggerDecision, TriggerEvent, TriggerSource};
use super::core::{self, Clock, RunSink};
use crate::db;
use crate::db::repositories::routines::EnabledRoutine;

pub const SOURCE_ID: &str = "schedule";

const EXPRESSION_FIELD: &str = "expression";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Occurrence {
	pub at: i64,
	pub expression: String,
}

fn declared(trigger_config: &Value) -> Result<&str, RoutineError> {
	trigger_config.get(EXPRESSION_FIELD).and_then(Value::as_str).ok_or_else(|| {
		RoutineError::UnreadableExpression {
			expression: String::new(),
			reason: format!("the routine declares no {EXPRESSION_FIELD}"),
		}
	})
}

pub fn validated(trigger_config: &Value) -> Result<(), RoutineError> {
	parsed(declared(trigger_config)?).map(|_| ())
}

fn parsed(expression: &str) -> Result<Cron, RoutineError> {
	Cron::from_str(expression).map_err(|error| unreadable(expression, &error))
}

fn due_occurrence(expression: &str, since: i64, now: i64) -> Result<Option<i64>, RoutineError> {
	let cron = parsed(expression)?;
	match cron.find_previous_occurrence(&wall_clock(now)?, true) {
		Ok(occurrence) => Ok(Some(occurrence.timestamp_millis()).filter(|at| *at > since)),
		Err(CronError::TimeSearchLimitExceeded) => Ok(None),
		Err(error) => Err(unreadable(expression, &error)),
	}
}

fn occurrence_id(routine_id: &str, at: i64) -> String {
	format!("{routine_id}:{at}")
}

fn payload(routine_id: &str, expression: &str, at: i64) -> Result<Value, RoutineError> {
	Ok(json!({
		"occurrenceId": occurrence_id(routine_id, at),
		"firedAt": core::moment(at)?,
		"expression": expression,
	}))
}

pub fn due_for(held: &EnabledRoutine, now: i64) -> Result<Option<Occurrence>, RoutineError> {
	let expression = declared(&held.routine.trigger_config)?;
	let since = held.last_occurrence_at.unwrap_or(held.routine.created_at);
	Ok(due_occurrence(expression, since, now)?
		.map(|at| Occurrence { at, expression: expression.to_owned() }))
}

pub async fn fire<S: RunSink + ?Sized>(
	database: &db::Database,
	sink: &S,
	clock: &dyn Clock,
	routine: &Routine,
	source: &TriggerSource,
	occurrence: &Occurrence,
) -> Result<TriggerDecision, RoutineError> {
	database.routines().record_occurrence(routine.id.clone(), occurrence.at).await?;
	let event = TriggerEvent {
		routine_id: routine.id.clone(),
		source: source.clone(),
		payload: payload(&routine.id, &occurrence.expression, occurrence.at)?,
	};
	core::on_trigger(database, sink, clock, event).await
}

fn wall_clock(at: i64) -> Result<DateTime<Local>, RoutineError> {
	Ok(instant(at)?.with_timezone(&Local))
}

fn instant(at: i64) -> Result<DateTime<Utc>, RoutineError> {
	DateTime::from_timestamp_millis(at)
		.ok_or_else(|| RoutineError::Unexpected { detail: format!("{at} is not an instant") })
}

fn unreadable(expression: &str, error: &CronError) -> RoutineError {
	RoutineError::UnreadableExpression {
		expression: expression.to_owned(),
		reason: error.to_string(),
	}
}

#[cfg(test)]
mod tests {
	use std::sync::Mutex;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::routines::contract::{
		FieldType, Filter, FilterMatchMode, PayloadField, RoutineDraft, RunCause, RunRequested,
		TriggerDecision,
	};

	const NOON: i64 = 1_800_000_000_000;
	const EVERY_MINUTE: &str = "* * * * *";

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	fn at(minutes: i64) -> i64 {
		NOON + minutes * 60 * 1000
	}

	struct At(i64);

	impl Clock for At {
		fn now_ms(&self) -> i64 {
			self.0
		}
	}

	#[derive(Default)]
	struct Announced(Mutex<Vec<RunRequested>>);

	impl RunSink for Announced {
		fn requested(&self, event: RunRequested) -> Result<(), RoutineError> {
			self.0.lock().expect("the sink is readable").push(event);
			Ok(())
		}
	}

	impl Announced {
		fn requests(&self) -> Vec<RunRequested> {
			self.0.lock().expect("the sink is readable").clone()
		}
	}

	fn the_source() -> TriggerSource {
		TriggerSource {
			id: SOURCE_ID.to_owned(),
			title: "On a schedule".to_owned(),
			payload: vec![
				PayloadField { name: "occurrenceId".to_owned(), field_type: FieldType::String },
				PayloadField { name: "firedAt".to_owned(), field_type: FieldType::Datetime },
				PayloadField { name: "expression".to_owned(), field_type: FieldType::String },
			],
			dedupe_key: "occurrenceId".to_owned(),
			header: None,
		}
	}

	async fn a_scheduled_routine(expression: &str) -> (Database, RemovedOnDrop, String) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
			.await
			.expect("the participant is planted");
		let stored = database
			.routines()
			.create(
				RoutineDraft {
					conversation_id: "c1".to_owned(),
					bot_id: "b1".to_owned(),
					title: "Nightly report".to_owned(),
					instruction: "Read the shift log and report what changed.".to_owned(),
					trigger_source_id: SOURCE_ID.to_owned(),
					filter: Filter { match_mode: FilterMatchMode::All, rows: Vec::new() },
					trigger_config: json!({ "expression": expression }),
				},
				"a-generated-key".to_owned(),
				at(0),
			)
			.await
			.expect("the routine is created");
		(database, dir, stored.id)
	}

	async fn only_scheduled(database: &Database) -> EnabledRoutine {
		database
			.routines()
			.enabled_on_source(SOURCE_ID.to_owned())
			.await
			.expect("the scheduled routines read")
			.pop()
			.expect("the routine is enabled on the schedule source")
	}

	#[tokio::test]
	async fn three_occurrences_missed_while_the_app_was_closed_fire_once() {
		let (database, dir, routine_id) = a_scheduled_routine(EVERY_MINUTE).await;
		let sink = Announced::default();
		let reopened = At(at(3) + 30_000);

		let held = only_scheduled(&database).await;
		let occurrence =
			due_for(&held, reopened.0).expect("the cron reads").expect("an occurrence is due");
		let decision = fire(&database, &sink, &reopened, &held.routine, &the_source(), &occurrence)
			.await
			.expect("the occurrence fires");

		assert!(matches!(decision, TriggerDecision::Started { .. }), "got {decision:?}");
		let requests = sink.requests();
		assert_eq!(requests.len(), 1, "got {requests:?}");
		assert_eq!(requests[0].cause, RunCause::Trigger);
		assert_eq!(
			requests[0].payload.get("occurrenceId").and_then(Value::as_str),
			Some(occurrence_id(&routine_id, at(3)).as_str()),
			"the most recent missed occurrence is the one that fired"
		);
		assert_eq!(only_scheduled(&database).await.last_occurrence_at, Some(at(3)));

		let again = due_for(&only_scheduled(&database).await, reopened.0).expect("the cron reads");

		assert_eq!(again, None, "the occurrence already fired is not due again");
		assert_eq!(sink.requests().len(), 1);

		drop(database);
		let _ = std::fs::remove_dir_all(&dir);
	}

	#[tokio::test]
	async fn the_same_occurrence_delivered_twice_is_refused_by_the_engine() {
		let (database, dir, routine_id) = a_scheduled_routine(EVERY_MINUTE).await;
		let sink = Announced::default();
		let now = At(at(3) + 30_000);
		let held = only_scheduled(&database).await;
		let occurrence =
			due_for(&held, now.0).expect("the cron reads").expect("an occurrence is due");
		fire(&database, &sink, &now, &held.routine, &the_source(), &occurrence)
			.await
			.expect("the first pass fires");

		let replayed = core::on_trigger(
			&database,
			&sink,
			&now,
			TriggerEvent {
				routine_id: routine_id.clone(),
				source: the_source(),
				payload: payload(&routine_id, EVERY_MINUTE, at(3)).expect("the payload builds"),
			},
		)
		.await
		.expect("the replay is decided");

		assert!(matches!(replayed, TriggerDecision::Refused { .. }), "got {replayed:?}");
		assert_eq!(sink.requests().len(), 1);

		drop(database);
		let _ = std::fs::remove_dir_all(&dir);
	}

	#[test]
	fn an_expression_croner_refuses_is_named_with_its_reason() {
		let failure = parsed("every tuesday").expect_err("the expression is refused");

		let RoutineError::UnreadableExpression { expression, reason } = failure else {
			panic!("got {failure:?}");
		};
		assert_eq!(expression, "every tuesday");
		assert!(!reason.is_empty(), "the reason is carried");
	}

	#[test]
	fn the_occurrence_due_is_the_last_one_the_clock_walked_past() {
		let due = due_occurrence(EVERY_MINUTE, at(0), at(3) + 30_000).expect("the cron reads");

		assert_eq!(due, Some(at(3)), "three missed minutes collapse to the most recent one");
	}

	#[test]
	fn an_occurrence_already_recorded_is_not_due_again() {
		let due = due_occurrence(EVERY_MINUTE, at(3), at(3) + 30_000).expect("the cron reads");

		assert_eq!(due, None);
	}

	#[test]
	fn nothing_is_due_before_the_first_occurrence_after_the_routine_was_created() {
		let due = due_occurrence(EVERY_MINUTE, at(0), at(0) + 30_000).expect("the cron reads");

		assert_eq!(due, None);
	}

	#[test]
	fn a_routine_declaring_no_expression_is_refused_by_name() {
		let failure = validated(&json!({ "path": "/tmp" })).expect_err("the config is refused");

		assert!(
			matches!(failure, RoutineError::UnreadableExpression { ref expression, .. }
				if expression.is_empty()),
			"got {failure:?}"
		);
	}

	#[test]
	fn the_occurrence_id_holds_the_routine_and_the_instant() {
		assert_eq!(occurrence_id("r1", 7), "r1:7");
	}

	#[test]
	fn the_payload_carries_the_three_fields_the_source_declares() {
		let built = payload("r1", "0 * * * *", 1_800_000_000_000).expect("the payload builds");

		assert_eq!(
			built,
			json!({
				"occurrenceId": "r1:1800000000000",
				"firedAt": "2027-01-15T08:00:00.000Z",
				"expression": "0 * * * *",
			})
		);
	}
}
