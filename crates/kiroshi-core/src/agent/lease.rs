use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::time::Instant;

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
pub const RUN_SILENCE_BOUND: Duration = Duration::from_secs(60);
pub const INTERRUPT_ANSWER_BOUND: Duration = Duration::from_secs(15);
pub const TASKS_PENDING_BOUND: Duration = Duration::from_secs(10 * 60);

const _: () = assert!(RUN_SILENCE_BOUND.as_secs() >= 3 * HEARTBEAT_INTERVAL.as_secs());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunLease {
	pub silence: Duration,
	pub interrupt_answer: Duration,
	pub tasks_pending: Duration,
}

impl Default for RunLease {
	fn default() -> Self {
		Self {
			silence: RUN_SILENCE_BOUND,
			interrupt_answer: INTERRUPT_ANSWER_BOUND,
			tasks_pending: TASKS_PENDING_BOUND,
		}
	}
}

impl RunLease {
	pub fn bound_of(&self, lapse: Lapse) -> Duration {
		match lapse {
			Lapse::Silent => self.silence,
			Lapse::InterruptUnanswered => self.interrupt_answer,
			Lapse::TasksPending => self.tasks_pending,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Lapse {
	Silent,
	InterruptUnanswered,
	TasksPending,
}

impl fmt::Display for Lapse {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Lapse::Silent => {
				write!(f, "the agent lost its liveness: no frame within the silence bound")
			}
			Lapse::InterruptUnanswered => {
				write!(f, "the agent lost its liveness: no result within the interrupt bound")
			}
			Lapse::TasksPending => {
				write!(f, "the agent held its turn unsettled past the background task bound")
			}
		}
	}
}

#[derive(Debug, Clone, Copy)]
pub struct Liveness {
	heard_at: Instant,
	interrupted_at: Option<Instant>,
	result_held_since: Option<Instant>,
}

impl Liveness {
	pub fn since(now: Instant) -> Self {
		Self { heard_at: now, interrupted_at: None, result_held_since: None }
	}

	pub fn heard(&mut self, now: Instant) {
		self.heard_at = now;
	}

	pub fn interrupted(&mut self, now: Instant) {
		self.interrupted_at.get_or_insert(now);
	}

	pub fn result_held(&mut self, now: Instant) {
		self.result_held_since.get_or_insert(now);
	}

	pub fn deadline(&self, lease: RunLease, waiting_on_person: bool) -> Option<(Instant, Lapse)> {
		let unanswered = self.interrupted_at.map(|interrupted_at| {
			(interrupted_at + lease.interrupt_answer, Lapse::InterruptUnanswered)
		});
		let silent = (!waiting_on_person).then(|| (self.heard_at + lease.silence, Lapse::Silent));
		let outlasted = self
			.result_held_since
			.map(|held_since| (held_since + lease.tasks_pending, Lapse::TasksPending));
		unanswered.into_iter().chain(silent).chain(outlasted).min_by_key(|(at, _)| *at)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const LEASE: RunLease = RunLease {
		silence: Duration::from_secs(60),
		interrupt_answer: Duration::from_secs(15),
		tasks_pending: Duration::from_secs(600),
	};

	fn after(start: Instant, seconds: u64) -> Instant {
		start + Duration::from_secs(seconds)
	}

	#[test]
	fn a_run_heard_within_the_silence_bound_keeps_its_lease() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.heard(after(start, 50));

		assert_eq!(liveness.deadline(LEASE, false), Some((after(start, 110), Lapse::Silent)));
	}

	#[test]
	fn an_unanswered_interrupt_lapses_before_the_silence_bound_whatever_else_is_heard() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.interrupted(after(start, 5));
		liveness.heard(after(start, 19));

		assert_eq!(
			liveness.deadline(LEASE, false),
			Some((after(start, 20), Lapse::InterruptUnanswered))
		);
	}

	#[test]
	fn a_run_waiting_on_the_person_never_lapses_for_silence_but_still_for_an_interrupt() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		assert_eq!(liveness.deadline(LEASE, true), None);

		liveness.interrupted(after(start, 600));
		assert_eq!(
			liveness.deadline(LEASE, true),
			Some((after(start, 615), Lapse::InterruptUnanswered))
		);
	}

	#[test]
	fn a_second_interrupt_keeps_the_bound_of_the_first() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.interrupted(start);
		liveness.interrupted(after(start, 10));

		assert_eq!(
			liveness.deadline(LEASE, false),
			Some((after(start, 15), Lapse::InterruptUnanswered))
		);
	}

	#[test]
	fn a_held_result_lapses_at_its_bound_counted_from_the_first_result_of_the_turn() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.result_held(after(start, 30));
		liveness.result_held(after(start, 200));
		liveness.heard(after(start, 610));

		assert_eq!(liveness.deadline(LEASE, false), Some((after(start, 630), Lapse::TasksPending)));
	}

	#[test]
	fn a_held_result_lapses_even_while_the_person_is_asked() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.result_held(after(start, 20));

		assert_eq!(liveness.deadline(LEASE, true), Some((after(start, 620), Lapse::TasksPending)));
	}

	#[test]
	fn each_lapse_is_bounded_by_its_own_bound() {
		assert_eq!(LEASE.bound_of(Lapse::Silent), Duration::from_secs(60));
		assert_eq!(LEASE.bound_of(Lapse::InterruptUnanswered), Duration::from_secs(15));
		assert_eq!(LEASE.bound_of(Lapse::TasksPending), Duration::from_secs(600));
	}
}
