use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use reqwest::StatusCode;
use serde_json::{json, Value};
use tokio::sync::watch;

pub(super) const ANSWERS_KEPT_PER_DEVICE: usize = 1024;

const REFUSED_BEFORE_INVOKE: [StatusCode; 4] = [
	StatusCode::BAD_REQUEST,
	StatusCode::FORBIDDEN,
	StatusCode::NOT_FOUND,
	StatusCode::PAYLOAD_TOO_LARGE,
];

const FIRST_RUN_LOST: &str = "the first run of this call ended without an answer";

pub(super) type Answered = (StatusCode, Value);

type Watching = watch::Receiver<Option<Answered>>;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct CallingDevice {
	pub(super) space_id: String,
	pub(super) device_id: String,
}

#[derive(Default)]
pub(super) struct KeyedCalls(Mutex<HashMap<CallingDevice, DeviceCalls>>);

#[derive(Default)]
struct DeviceCalls {
	answered: HashMap<String, Answered>,
	oldest_first: VecDeque<String>,
	running: HashMap<String, Watching>,
}

impl DeviceCalls {
	fn kept(&mut self, key: String, answered: Answered) {
		if REFUSED_BEFORE_INVOKE.contains(&answered.0) {
			return;
		}
		self.oldest_first.push_back(key.clone());
		self.answered.insert(key, answered);
		while self.oldest_first.len() > ANSWERS_KEPT_PER_DEVICE {
			if let Some(forgotten) = self.oldest_first.pop_front() {
				self.answered.remove(&forgotten);
			}
		}
	}

	fn stopped_running(&mut self, key: &str, watching: &Watching) {
		if self.running.get(key).is_some_and(|running| running.same_channel(watching)) {
			self.running.remove(key);
		}
	}
}

pub(super) enum Claim {
	Answered(Answered),
	Running(Watching),
	First(FirstRun),
}

pub(super) struct FirstRun {
	calls: Arc<KeyedCalls>,
	device: CallingDevice,
	key: String,
	told: watch::Sender<Option<Answered>>,
	watching: Watching,
}

impl KeyedCalls {
	pub(super) fn claim(self: &Arc<Self>, device: CallingDevice, key: String) -> Claim {
		let mut held = self.held();
		let calls = held.entry(device.clone()).or_default();
		if let Some(answered) = calls.answered.get(&key) {
			return Claim::Answered(answered.clone());
		}
		if let Some(running) = calls.running.get(&key) {
			return Claim::Running(running.clone());
		}
		let (told, watching) = watch::channel(None);
		calls.running.insert(key.clone(), watching.clone());
		Claim::First(FirstRun { calls: self.clone(), device, key, told, watching })
	}

	fn held(&self) -> MutexGuard<'_, HashMap<CallingDevice, DeviceCalls>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

impl FirstRun {
	pub(super) fn watching(&self) -> Watching {
		self.watching.clone()
	}

	pub(super) fn settle(self, answered: Answered) {
		if let Some(calls) = self.calls.held().get_mut(&self.device) {
			calls.stopped_running(&self.key, &self.watching);
			calls.kept(self.key.clone(), answered.clone());
		}
		self.told.send_replace(Some(answered));
	}
}

impl Drop for FirstRun {
	fn drop(&mut self) {
		if let Some(calls) = self.calls.held().get_mut(&self.device) {
			calls.stopped_running(&self.key, &self.watching);
		}
	}
}

pub(super) async fn answered_by_the_first_run(mut watching: Watching) -> Answered {
	match watching.wait_for(Option::is_some).await {
		Ok(answered) => answered.clone().unwrap_or_else(lost),
		Err(_) => lost(),
	}
}

fn lost() -> Answered {
	(StatusCode::INTERNAL_SERVER_ERROR, json!(FIRST_RUN_LOST))
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_device() -> CallingDevice {
		CallingDevice { space_id: "s1".to_owned(), device_id: "d1".to_owned() }
	}

	fn first(claim: Claim) -> FirstRun {
		match claim {
			Claim::First(first) => first,
			_ => panic!("the call was not claimed as a first run"),
		}
	}

	fn ok(body: &str) -> Answered {
		(StatusCode::OK, json!(body))
	}

	#[test]
	fn a_repeat_of_an_answered_key_gets_the_stored_answer() {
		let calls = Arc::new(KeyedCalls::default());
		first(calls.claim(a_device(), "k1".to_owned())).settle(ok("one"));

		let repeated = calls.claim(a_device(), "k1".to_owned());

		assert!(matches!(repeated, Claim::Answered(answered) if answered == ok("one")));
	}

	#[test]
	fn the_same_key_from_another_device_or_another_space_runs_on_its_own() {
		let calls = Arc::new(KeyedCalls::default());
		first(calls.claim(a_device(), "k1".to_owned())).settle(ok("one"));
		let other_device = CallingDevice { device_id: "d2".to_owned(), ..a_device() };
		let other_space = CallingDevice { space_id: "s2".to_owned(), ..a_device() };

		assert!(matches!(calls.claim(other_device, "k1".to_owned()), Claim::First(_)));
		assert!(matches!(calls.claim(other_space, "k1".to_owned()), Claim::First(_)));
	}

	#[test]
	fn a_call_refused_before_invoke_keeps_no_answer() {
		let calls = Arc::new(KeyedCalls::default());
		for status in REFUSED_BEFORE_INVOKE {
			let key = status.to_string();
			first(calls.claim(a_device(), key.clone())).settle((status, json!("refused")));

			assert!(matches!(calls.claim(a_device(), key), Claim::First(_)), "{status}");
		}
	}

	#[test]
	fn the_oldest_answer_past_the_cap_is_forgotten() {
		let calls = Arc::new(KeyedCalls::default());
		for n in 0..=ANSWERS_KEPT_PER_DEVICE {
			first(calls.claim(a_device(), format!("k{n}"))).settle(ok("kept"));
		}

		let newest = format!("k{ANSWERS_KEPT_PER_DEVICE}");
		assert!(matches!(calls.claim(a_device(), newest), Claim::Answered(_)));
		assert!(matches!(calls.claim(a_device(), "k1".to_owned()), Claim::Answered(_)));
		assert!(matches!(calls.claim(a_device(), "k0".to_owned()), Claim::First(_)));
	}

	#[tokio::test]
	async fn a_repeat_held_while_the_first_run_is_in_flight_gets_its_answer() {
		let calls = Arc::new(KeyedCalls::default());
		let running = first(calls.claim(a_device(), "k1".to_owned()));
		let Claim::Running(held) = calls.claim(a_device(), "k1".to_owned()) else {
			panic!("the repeat was not held");
		};
		let waiting = tokio::spawn(answered_by_the_first_run(held));

		running.settle(ok("one"));

		assert_eq!(waiting.await.expect("the repeat answers"), ok("one"));
	}

	#[tokio::test]
	async fn a_first_run_dropped_unanswered_frees_its_key_and_ends_the_held_repeat() {
		let calls = Arc::new(KeyedCalls::default());
		let running = first(calls.claim(a_device(), "k1".to_owned()));
		let Claim::Running(held) = calls.claim(a_device(), "k1".to_owned()) else {
			panic!("the repeat was not held");
		};

		drop(running);

		assert_eq!(answered_by_the_first_run(held).await.0, StatusCode::INTERNAL_SERVER_ERROR);
		assert!(matches!(calls.claim(a_device(), "k1".to_owned()), Claim::First(_)));
	}
}
