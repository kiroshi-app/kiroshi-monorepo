use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::Value;

use super::contract::{
	Filter, Refusal, RoutineError, RunRequested, SkipReason, TriggerDecision, TriggerEvent,
	TriggerSource,
};
use super::filter;
use crate::db;
use crate::db::repositories::routines::Admitted;

pub const LEASE_MS: i64 = 5 * 60 * 1000;
pub const HOUR_MS: i64 = 60 * 60 * 1000;
pub const HOURLY_CAP: u32 = 12;
pub const FAILURES_BEFORE_DISABLE: u32 = 5;
pub const DEDUPE_RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;

const BACKOFF_LADDER_MS: [i64; 5] = [30_000, 60_000, 300_000, 900_000, 3_600_000];

pub trait Clock: Send + Sync {
	fn now_ms(&self) -> i64;
}

pub struct SystemClock;

impl Clock for SystemClock {
	fn now_ms(&self) -> i64 {
		SystemTime::now()
			.duration_since(UNIX_EPOCH)
			.map(|elapsed| elapsed.as_millis() as i64)
			.unwrap_or_default()
	}
}

pub trait RunSink {
	fn requested(&self, event: RunRequested) -> Result<(), RoutineError>;
}

pub fn moment(at: i64) -> Result<String, RoutineError> {
	DateTime::<Utc>::from_timestamp_millis(at)
		.map(|instant| instant.to_rfc3339_opts(SecondsFormat::Millis, true))
		.ok_or_else(|| RoutineError::Unexpected { detail: format!("{at} is not an instant") })
}

pub fn backoff_ms(consecutive_failures: u32) -> i64 {
	match consecutive_failures {
		0 => 0,
		held => BACKOFF_LADDER_MS[(held as usize - 1).min(BACKOFF_LADDER_MS.len() - 1)],
	}
}

pub fn dedupe_value(source: &TriggerSource, payload: &Value) -> Option<String> {
	filter::at_path(payload, &source.dedupe_key).map(recorded)
}

fn recorded(value: &Value) -> String {
	match value {
		Value::String(text) => text.clone(),
		held => held.to_string(),
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Dedupe {
	Missing,
	Seen,
	Fresh(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Facts {
	pub is_enabled: bool,
	pub filter: Filter,
	pub dedupe: Dedupe,
	pub lease_renewed_at: Option<i64>,
	pub started_in_last_hour: u32,
	pub consecutive_failures: u32,
	pub last_failed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
	Start,
	Skip(SkipReason),
	Refuse(Refusal),
}

pub fn verdict(facts: &Facts, event: &TriggerEvent, now: i64) -> Verdict {
	if !facts.is_enabled {
		return Verdict::Refuse(Refusal::Disabled);
	}
	if !filter::admits(&facts.filter, &event.source.payload, &event.payload) {
		return Verdict::Refuse(Refusal::Filter);
	}
	match facts.dedupe {
		Dedupe::Missing => return Verdict::Refuse(Refusal::DedupeValueMissing),
		Dedupe::Seen => return Verdict::Refuse(Refusal::AlreadySeen),
		Dedupe::Fresh(_) => {}
	}
	if let Some(held) = leased_or_capped(facts, now) {
		return Verdict::Skip(held);
	}
	if backing_off(facts, now) {
		return Verdict::Skip(SkipReason::BackingOff);
	}
	Verdict::Start
}

pub fn verdict_for_run_now(facts: &Facts, now: i64) -> Verdict {
	if !facts.is_enabled {
		return Verdict::Refuse(Refusal::Disabled);
	}
	match leased_or_capped(facts, now) {
		Some(held) => Verdict::Skip(held),
		None => Verdict::Start,
	}
}

fn leased_or_capped(facts: &Facts, now: i64) -> Option<SkipReason> {
	if facts.lease_renewed_at.is_some_and(|renewed| now - renewed < LEASE_MS) {
		return Some(SkipReason::LeaseHeld);
	}
	(facts.started_in_last_hour >= HOURLY_CAP).then_some(SkipReason::HourlyCap)
}

fn backing_off(facts: &Facts, now: i64) -> bool {
	facts.last_failed_at.is_some_and(|failed| now - failed < backoff_ms(facts.consecutive_failures))
}

pub fn refuse_blank_task(title: &str, instruction: &str) -> Result<(), RoutineError> {
	for (field, text) in [("title", title), ("instruction", instruction)] {
		if text.trim().is_empty() {
			return Err(RoutineError::BlankField { field: field.to_owned() });
		}
	}
	Ok(())
}

pub async fn on_trigger<S: RunSink + ?Sized>(
	database: &db::Database,
	sink: &S,
	clock: &dyn Clock,
	event: TriggerEvent,
) -> Result<TriggerDecision, RoutineError> {
	let now = clock.now_ms();
	let admitted = database.routines().admit(event, now).await?;
	announce(sink, admitted)
}

pub async fn run_now<S: RunSink + ?Sized>(
	database: &db::Database,
	sink: &S,
	clock: &dyn Clock,
	routine_id: String,
) -> Result<TriggerDecision, RoutineError> {
	let now = clock.now_ms();
	let admitted = database.routines().admit_run_now(routine_id, now).await?;
	announce(sink, admitted)
}

fn announce<S: RunSink + ?Sized>(
	sink: &S,
	admitted: Admitted,
) -> Result<TriggerDecision, RoutineError> {
	if let Some(requested) = admitted.requested {
		sink.requested(requested)?;
	}
	Ok(admitted.decision)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_task_naming_both_fields_is_admitted_and_one_leaving_a_field_blank_names_it() {
		assert_eq!(refuse_blank_task("Daily report", "Write it up"), Ok(()));

		for (title, instruction, blank) in [
			("", "Write it up", "title"),
			("   ", "Write it up", "title"),
			("Daily report", "", "instruction"),
			("Daily report", "\n\t ", "instruction"),
		] {
			assert_eq!(
				refuse_blank_task(title, instruction),
				Err(RoutineError::BlankField { field: blank.to_owned() }),
				"a task with a blank {blank} was admitted"
			);
		}
	}

	#[test]
	fn the_backoff_ladder_climbs_and_then_holds_at_an_hour() {
		let held: Vec<i64> = (0..7).map(backoff_ms).collect();

		assert_eq!(held, [0, 30_000, 60_000, 300_000, 900_000, 3_600_000, 3_600_000]);
	}
}
