use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{Mutex, OwnedMutexGuard};

use super::contract::SkipReason;
use super::core::{Clock, HOUR_MS, LEASE_MS};

type Held = Arc<Mutex<Option<i64>>>;

#[derive(Default)]
pub struct Silence {
	held: Mutex<HashMap<String, Held>>,
}

pub struct Turn {
	until: OwnedMutexGuard<Option<i64>>,
	now: i64,
}

impl Silence {
	pub async fn turn(&self, routine_id: &str, clock: &dyn Clock) -> Turn {
		let held = self.reached(routine_id, clock.now_ms()).await;
		let until = held.lock_owned().await;
		Turn { until, now: clock.now_ms() }
	}

	async fn reached(&self, routine_id: &str, now: i64) -> Held {
		let mut held = self.held.lock().await;
		held.retain(|_, entry| reached_by_a_call(entry) || silenced(entry, now));
		held.entry(routine_id.to_owned()).or_default().clone()
	}

	#[cfg(test)]
	async fn held_routines(&self) -> Vec<String> {
		let mut named: Vec<String> = self.held.lock().await.keys().cloned().collect();
		named.sort();
		named
	}
}

impl Turn {
	pub fn holds(&self) -> bool {
		self.until.is_some_and(|moment| moment > self.now)
	}

	pub fn hold(&mut self, reason: SkipReason) {
		*self.until = Some(self.now + span(reason));
	}
}

fn reached_by_a_call(entry: &Held) -> bool {
	Arc::strong_count(entry) > 1
}

fn silenced(entry: &Held, now: i64) -> bool {
	entry.try_lock().is_ok_and(|until| until.is_some_and(|moment| moment > now))
}

fn span(reason: SkipReason) -> i64 {
	match reason {
		SkipReason::HourlyCap => HOUR_MS,
		SkipReason::LeaseHeld | SkipReason::BackingOff => LEASE_MS,
	}
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicI64, Ordering};

	use super::*;

	const NOON: i64 = 1_800_000_000_000;

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Self {
			Ticking(AtomicI64::new(now))
		}

		fn moved_by(&self, elapsed: i64) {
			self.0.fetch_add(elapsed, Ordering::SeqCst);
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	async fn holding(silence: &Silence, routine_id: &str, reason: SkipReason, clock: &Ticking) {
		let mut turn = silence.turn(routine_id, clock).await;
		turn.hold(reason);
	}

	async fn holds(silence: &Silence, routine_id: &str, clock: &Ticking) -> bool {
		silence.turn(routine_id, clock).await.holds()
	}

	#[tokio::test]
	async fn a_routine_held_for_the_hourly_cap_stays_silent_until_the_hour_has_passed() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();

		holding(&silence, "r1", SkipReason::HourlyCap, &clock).await;

		assert!(holds(&silence, "r1", &clock).await);
		clock.moved_by(HOUR_MS - 1);
		assert!(holds(&silence, "r1", &clock).await);
		clock.moved_by(1);
		assert!(!holds(&silence, "r1", &clock).await);
	}

	#[tokio::test]
	async fn a_routine_held_for_a_lease_or_a_backoff_stays_silent_for_the_length_of_a_lease() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();

		holding(&silence, "r1", SkipReason::LeaseHeld, &clock).await;
		holding(&silence, "r2", SkipReason::BackingOff, &clock).await;

		clock.moved_by(LEASE_MS - 1);
		assert!(holds(&silence, "r1", &clock).await);
		assert!(holds(&silence, "r2", &clock).await);
		clock.moved_by(1);
		assert!(!holds(&silence, "r1", &clock).await);
		assert!(!holds(&silence, "r2", &clock).await);
	}

	#[tokio::test]
	async fn one_routine_held_silent_leaves_another_routine_free() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();

		holding(&silence, "r1", SkipReason::HourlyCap, &clock).await;

		assert!(holds(&silence, "r1", &clock).await);
		assert!(!holds(&silence, "r2", &clock).await);
	}

	#[tokio::test]
	async fn a_routine_whose_silence_has_passed_is_dropped_when_a_call_reaches_another_one() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();
		holding(&silence, "r1", SkipReason::HourlyCap, &clock).await;
		assert_eq!(silence.held_routines().await, ["r1"]);

		clock.moved_by(HOUR_MS);
		holds(&silence, "r2", &clock).await;

		assert_eq!(silence.held_routines().await, ["r2"]);
	}

	#[tokio::test]
	async fn a_call_waits_for_the_turn_another_call_of_the_same_routine_holds() {
		let clock = Arc::new(Ticking::at(NOON));
		let silence = Arc::new(Silence::default());
		let mut first = silence.turn("r1", clock.as_ref()).await;

		let waiting = tokio::spawn({
			let (silence, clock) = (silence.clone(), clock.clone());
			async move { silence.turn("r1", clock.as_ref()).await.holds() }
		});
		tokio::task::yield_now().await;
		assert!(!waiting.is_finished());

		first.hold(SkipReason::LeaseHeld);
		drop(first);

		assert!(waiting.await.expect("the waiting turn is taken"));
	}

	#[tokio::test]
	async fn a_fresh_silence_holds_no_routine() {
		let silence = Silence::default();

		assert!(silence.held_routines().await.is_empty());
	}
}
