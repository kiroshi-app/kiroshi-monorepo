use std::collections::{HashMap, VecDeque};

use tokio::sync::Mutex;

use super::core::Clock;

pub const CALLS_PER_WINDOW: usize = 60;

pub const WINDOW_MS: i64 = 60 * 1000;

#[derive(Default)]
pub struct RateLimit {
	counted: Mutex<HashMap<String, VecDeque<i64>>>,
}

impl RateLimit {
	pub async fn admits(&self, key: &str, clock: &dyn Clock) -> bool {
		let now = clock.now_ms();
		let mut counted = self.counted.lock().await;
		counted.retain(|_, calls| {
			forget_before(calls, now - WINDOW_MS);
			!calls.is_empty()
		});
		let calls = counted.entry(key.to_owned()).or_default();
		if calls.len() >= CALLS_PER_WINDOW {
			return false;
		}
		calls.push_back(now);
		true
	}

	#[cfg(test)]
	async fn counted_keys(&self) -> usize {
		self.counted.lock().await.len()
	}
}

fn forget_before(calls: &mut VecDeque<i64>, floor: i64) {
	while calls.front().is_some_and(|counted| *counted <= floor) {
		calls.pop_front();
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

	async fn called(limit: &RateLimit, key: &str, clock: &Ticking, times: usize) -> usize {
		let mut admitted = 0;
		for _ in 0..times {
			if limit.admits(key, clock).await {
				admitted += 1;
			}
		}
		admitted
	}

	#[tokio::test]
	async fn a_key_is_admitted_sixty_times_inside_a_window_and_refused_beyond() {
		let clock = Ticking::at(NOON);
		let limit = RateLimit::default();

		let admitted = called(&limit, "r1", &clock, CALLS_PER_WINDOW + 10).await;

		assert_eq!(admitted, CALLS_PER_WINDOW);
	}

	#[tokio::test]
	async fn a_call_landing_once_the_oldest_one_left_the_window_is_admitted() {
		let clock = Ticking::at(NOON);
		let limit = RateLimit::default();
		called(&limit, "r1", &clock, CALLS_PER_WINDOW).await;
		assert!(!limit.admits("r1", &clock).await);

		clock.moved_by(WINDOW_MS);

		assert!(limit.admits("r1", &clock).await);
	}

	#[tokio::test]
	async fn the_count_of_one_key_leaves_another_key_admitted() {
		let clock = Ticking::at(NOON);
		let limit = RateLimit::default();
		called(&limit, "r1", &clock, CALLS_PER_WINDOW).await;

		assert!(!limit.admits("r1", &clock).await);
		assert!(limit.admits("r2", &clock).await);
	}

	#[tokio::test]
	async fn a_key_holding_no_call_inside_the_window_is_dropped_from_the_count() {
		let clock = Ticking::at(NOON);
		let limit = RateLimit::default();
		called(&limit, "r1", &clock, 3).await;
		assert_eq!(limit.counted_keys().await, 1);

		clock.moved_by(WINDOW_MS);
		limit.admits("r2", &clock).await;

		assert_eq!(limit.counted_keys().await, 1);
	}

	#[tokio::test]
	async fn a_fresh_limit_counts_no_call() {
		let limit = RateLimit::default();

		assert_eq!(limit.counted_keys().await, 0);
	}
}
