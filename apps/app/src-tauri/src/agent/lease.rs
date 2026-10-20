use std::fmt;
use std::time::Duration;

use tokio::time::Instant;

pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
pub const RUN_SILENCE_BOUND: Duration = Duration::from_secs(60);
pub const INTERRUPT_ANSWER_BOUND: Duration = Duration::from_secs(15);

const _: () = assert!(RUN_SILENCE_BOUND.as_secs() >= 3 * HEARTBEAT_INTERVAL.as_secs());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunLease {
	pub silence: Duration,
	pub interrupt_answer: Duration,
}

impl Default for RunLease {
	fn default() -> Self {
		Self { silence: RUN_SILENCE_BOUND, interrupt_answer: INTERRUPT_ANSWER_BOUND }
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lapse {
	Silent,
	InterruptUnanswered,
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
		}
	}
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Liveness {
	heard_at: Instant,
	interrupted_at: Option<Instant>,
}

impl Liveness {
	pub(crate) fn since(now: Instant) -> Self {
		Self { heard_at: now, interrupted_at: None }
	}

	pub(crate) fn heard(&mut self, now: Instant) {
		self.heard_at = now;
	}

	pub(crate) fn interrupted(&mut self, now: Instant) {
		self.interrupted_at.get_or_insert(now);
	}

	pub(crate) fn deadline(
		&self,
		lease: RunLease,
		waiting_on_person: bool,
	) -> Option<(Instant, Lapse)> {
		let unanswered = self.interrupted_at.map(|interrupted_at| {
			(interrupted_at + lease.interrupt_answer, Lapse::InterruptUnanswered)
		});
		let silent = (!waiting_on_person).then(|| (self.heard_at + lease.silence, Lapse::Silent));
		unanswered.into_iter().chain(silent).min_by_key(|(at, _)| *at)
	}

	pub(crate) fn lapse_due(
		&self,
		lease: RunLease,
		waiting_on_person: bool,
		now: Instant,
	) -> Option<Lapse> {
		self.deadline(lease, waiting_on_person).filter(|(at, _)| *at <= now).map(|(_, lapse)| lapse)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const LEASE: RunLease =
		RunLease { silence: Duration::from_secs(60), interrupt_answer: Duration::from_secs(15) };

	fn after(start: Instant, seconds: u64) -> Instant {
		start + Duration::from_secs(seconds)
	}

	#[test]
	fn a_run_heard_within_the_silence_bound_keeps_its_lease() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.heard(after(start, 50));

		assert_eq!(liveness.lapse_due(LEASE, false, after(start, 100)), None);
		assert_eq!(liveness.lapse_due(LEASE, false, after(start, 110)), Some(Lapse::Silent));
	}

	#[test]
	fn an_unanswered_interrupt_lapses_before_the_silence_bound_whatever_else_is_heard() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.interrupted(after(start, 5));
		liveness.heard(after(start, 19));

		assert_eq!(liveness.lapse_due(LEASE, false, after(start, 19)), None);
		assert_eq!(
			liveness.lapse_due(LEASE, false, after(start, 20)),
			Some(Lapse::InterruptUnanswered)
		);
	}

	#[test]
	fn a_run_waiting_on_the_person_never_lapses_for_silence_but_still_for_an_interrupt() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		assert_eq!(liveness.deadline(LEASE, true), None);

		liveness.interrupted(after(start, 600));
		assert_eq!(
			liveness.lapse_due(LEASE, true, after(start, 615)),
			Some(Lapse::InterruptUnanswered)
		);
	}

	#[test]
	fn a_second_interrupt_keeps_the_bound_of_the_first() {
		let start = Instant::now();
		let mut liveness = Liveness::since(start);

		liveness.interrupted(start);
		liveness.interrupted(after(start, 10));

		assert_eq!(
			liveness.lapse_due(LEASE, false, after(start, 15)),
			Some(Lapse::InterruptUnanswered)
		);
	}
}
