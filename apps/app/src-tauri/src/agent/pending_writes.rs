use std::collections::HashMap;
use std::time::Duration;

use tokio::sync::watch;

const PATIENCE: Duration = Duration::from_secs(10);

#[derive(Clone, Default)]
pub(crate) struct PendingWrites(watch::Sender<HashMap<String, usize>>);

pub(crate) struct PendingWrite {
	writes: PendingWrites,
	bot_id: String,
}

impl PendingWrites {
	pub(crate) fn register(&self, bot_id: &str) -> PendingWrite {
		self.0.send_modify(|pending| *pending.entry(bot_id.to_owned()).or_default() += 1);
		PendingWrite { writes: self.clone(), bot_id: bot_id.to_owned() }
	}

	pub(crate) async fn settled_for(&self, bot_id: &str) {
		if !self.settled_within_patience(|pending| !pending.contains_key(bot_id)).await {
			log::warn!("the session of bot {bot_id} opens over a write pending for {PATIENCE:?}");
		}
	}

	pub(crate) async fn all_settled(&self) {
		if !self.settled_within_patience(|pending| pending.is_empty()).await {
			log::warn!(
				"the writes of bots {} were still pending at quit after {PATIENCE:?}",
				self.pending_bots().join(", ")
			);
		}
	}

	#[cfg(test)]
	pub(crate) fn is_pending(&self, bot_id: &str) -> bool {
		self.0.borrow().contains_key(bot_id)
	}

	async fn settled_within_patience(
		&self,
		is_settled: impl FnMut(&HashMap<String, usize>) -> bool,
	) -> bool {
		let mut pending = self.0.subscribe();
		tokio::time::timeout(PATIENCE, pending.wait_for(is_settled))
			.await
			.is_ok_and(|waited| waited.is_ok())
	}

	fn pending_bots(&self) -> Vec<String> {
		let mut bots: Vec<String> = self.0.borrow().keys().cloned().collect();
		bots.sort();
		bots
	}

	fn release(&self, bot_id: &str) {
		self.0.send_modify(|pending| match pending.get_mut(bot_id) {
			Some(held) if *held > 1 => *held -= 1,
			_ => {
				pending.remove(bot_id);
			}
		});
	}
}

impl Drop for PendingWrite {
	fn drop(&mut self) {
		if std::thread::panicking() {
			log::warn!("the evolution of bot {} panicked", self.bot_id);
		}
		self.writes.release(&self.bot_id);
	}
}

#[cfg(test)]
mod tests {
	use std::pin::pin;

	use super::*;
	use crate::test_log::{capturing, warnings_naming};

	const A_BEAT: Duration = Duration::from_millis(50);

	async fn stays_pending(waiting: impl std::future::Future<Output = ()>) {
		assert!(tokio::time::timeout(A_BEAT, waiting).await.is_err(), "the wait ended early");
	}

	#[tokio::test(start_paused = true)]
	async fn a_wait_stays_pending_until_the_registration_is_released() {
		let writes = PendingWrites::default();
		let write = writes.register("bot-released");
		let mut waiting = pin!(writes.settled_for("bot-released"));

		stays_pending(waiting.as_mut()).await;
		drop(write);

		waiting.await;
		assert!(!writes.is_pending("bot-released"));
	}

	#[tokio::test(start_paused = true)]
	async fn two_turns_of_one_bot_keep_it_pending_until_the_last_is_released() {
		let writes = PendingWrites::default();
		let first = writes.register("bot-twice");
		let second = writes.register("bot-twice");

		drop(first);
		assert!(writes.is_pending("bot-twice"), "the first release freed the second write");

		drop(second);
		assert!(!writes.is_pending("bot-twice"));
	}

	#[tokio::test(start_paused = true)]
	async fn a_second_bot_is_not_delayed() {
		let writes = PendingWrites::default();
		let _write = writes.register("bot-busy");
		let started = tokio::time::Instant::now();

		writes.settled_for("bot-free").await;

		assert_eq!(started.elapsed(), Duration::ZERO);
	}

	#[tokio::test]
	async fn a_panicking_evolution_releases_its_registration_and_leaves_a_trace() {
		capturing();
		let writes = PendingWrites::default();
		let write = writes.register("bot-panicking");

		let task = tokio::spawn(async move {
			let _write = write;
			panic!("the evolution broke");
		});

		assert!(task.await.expect_err("the task panics").is_panic());
		assert!(!writes.is_pending("bot-panicking"));
		assert_eq!(warnings_naming("bot-panicking").await.len(), 1);
	}

	#[tokio::test(start_paused = true)]
	async fn a_session_opens_after_ten_seconds_and_says_so() {
		capturing();
		let writes = PendingWrites::default();
		let _write = writes.register("bot-stuck-session");
		let started = tokio::time::Instant::now();

		writes.settled_for("bot-stuck-session").await;

		assert_eq!(started.elapsed(), PATIENCE);
		assert_eq!(warnings_naming("bot-stuck-session").await.len(), 1);
	}

	#[tokio::test(start_paused = true)]
	async fn a_quit_gives_up_after_ten_seconds_in_total_and_names_the_bots_still_pending() {
		capturing();
		let writes = PendingWrites::default();
		let _stuck = writes.register("bot-stuck-at-quit");
		let finishing = writes.register("bot-finishing-at-quit");
		let started = tokio::time::Instant::now();
		let mut waiting = pin!(writes.all_settled());

		stays_pending(waiting.as_mut()).await;
		drop(finishing);
		waiting.await;

		assert_eq!(started.elapsed(), PATIENCE);
		let traced = warnings_naming("bot-stuck-at-quit").await;
		assert_eq!(traced.len(), 1);
		assert!(!traced[0].contains("bot-finishing-at-quit"), "{}", traced[0]);
	}
}
