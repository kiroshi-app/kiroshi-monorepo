use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use reqwest::StatusCode;
use serde_json::{json, Value};
use tokio::sync::watch;

use crate::db::repositories::member_call_answers::{
	KeptCall, MemberCallAnswersRepository, MemberCallKey,
};
use crate::db::{DatabaseError, DatabaseState};

pub(super) const ANSWERS_KEPT_PER_DEVICE: u32 = 1024;

pub(super) const NO_ANSWER_KEPT: &str = "this call already ran and the host keeps no answer for it";

const REFUSED_BEFORE_INVOKE: [StatusCode; 5] = [
	StatusCode::BAD_REQUEST,
	StatusCode::UNAUTHORIZED,
	StatusCode::FORBIDDEN,
	StatusCode::NOT_FOUND,
	StatusCode::PAYLOAD_TOO_LARGE,
];

const FIRST_RUN_LOST: &str = "the first run of this call ended without an answer";

pub(super) const RECORD_UNUSABLE: &str = "the host could not use its record of this call";

pub(super) type Answered = (StatusCode, Value);

pub(super) enum Ran {
	Answered(Answered),
	Unreached(Answered),
}

impl Ran {
	pub(super) fn into_answered(self) -> Answered {
		match self {
			Ran::Answered(answered) | Ran::Unreached(answered) => answered,
		}
	}
}

type Watching = watch::Receiver<Option<Answered>>;

#[derive(Default)]
pub(super) struct KeyedCalls(Mutex<HashMap<MemberCallKey, Watching>>);

pub(super) enum Claim {
	Running(Watching),
	First(FirstRun),
}

pub(super) struct FirstRun {
	calls: Arc<KeyedCalls>,
	key: MemberCallKey,
	told: watch::Sender<Option<Answered>>,
	watching: Watching,
}

impl KeyedCalls {
	pub(super) fn claim(self: &Arc<Self>, key: MemberCallKey) -> Claim {
		let mut running = self.running();
		if let Some(watching) = running.get(&key) {
			return Claim::Running(watching.clone());
		}
		let (told, watching) = watch::channel(None);
		running.insert(key.clone(), watching.clone());
		Claim::First(FirstRun { calls: self.clone(), key, told, watching })
	}

	fn running(&self) -> MutexGuard<'_, HashMap<MemberCallKey, Watching>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

impl FirstRun {
	pub(super) fn watching(&self) -> Watching {
		self.watching.clone()
	}

	pub(super) async fn answered_once(
		self,
		database: &DatabaseState,
		run: impl Future<Output = Ran>,
	) {
		let answered = match database {
			Ok(database) => self.kept_or_run(database.member_call_answers(), run).await,
			Err(error) => unrecorded(error),
		};
		self.told.send_replace(Some(answered));
	}

	async fn kept_or_run(
		&self,
		answers: &MemberCallAnswersRepository,
		run: impl Future<Output = Ran>,
	) -> Answered {
		match answers.claimed(self.key.clone()).await {
			Ok(None) => self.ran_and_recorded(answers, run).await,
			Ok(Some(kept)) => repeated(kept),
			Err(error) => unrecorded(&error),
		}
	}

	async fn ran_and_recorded(
		&self,
		answers: &MemberCallAnswersRepository,
		run: impl Future<Output = Ran>,
	) -> Answered {
		let ran = run.await;
		let recorded = match &ran {
			Ran::Answered((status, body)) if !REFUSED_BEFORE_INVOKE.contains(status) => {
				let kept = body.clone();
				answers
					.answered(self.key.clone(), status.as_u16(), kept, ANSWERS_KEPT_PER_DEVICE)
					.await
			}
			_ => answers.unclaimed(self.key.clone()).await,
		};
		let (status, body) = ran.into_answered();
		if let Err(error) = recorded {
			log::error!(
				"a keyed member call answered {status} but its record was not updated: {error:?}"
			);
		}
		(status, body)
	}

	fn stopped_running(&self) {
		let mut running = self.calls.running();
		if running.get(&self.key).is_some_and(|held| held.same_channel(&self.watching)) {
			running.remove(&self.key);
		}
	}
}

impl Drop for FirstRun {
	fn drop(&mut self) {
		self.stopped_running();
	}
}

fn repeated(kept: KeptCall) -> Answered {
	match kept {
		KeptCall::Answered { status, body } => match StatusCode::from_u16(status) {
			Ok(status) => (status, body),
			Err(error) => {
				log::error!("a kept member call answer holds no status: {error}");
				(StatusCode::INTERNAL_SERVER_ERROR, json!(RECORD_UNUSABLE))
			}
		},
		KeptCall::Unanswered => (StatusCode::GONE, json!(NO_ANSWER_KEPT)),
	}
}

fn unrecorded(error: &DatabaseError) -> Answered {
	log::error!("a keyed member call did not run, its record could not be claimed: {error:?}");
	(StatusCode::INTERNAL_SERVER_ERROR, json!(RECORD_UNUSABLE))
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
	use std::sync::atomic::{AtomicUsize, Ordering};

	use tokio::sync::Notify;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::removed_on_drop::RemovedOnDrop;

	struct Host {
		calls: Arc<KeyedCalls>,
		database: DatabaseState,
		runs: AtomicUsize,
		dir: RemovedOnDrop,
	}

	impl Host {
		fn new() -> Self {
			Self::over(temp_dir())
		}

		fn over(dir: RemovedOnDrop) -> Self {
			let database = Ok(crate::db::open(&dir));
			Self { calls: Arc::default(), database, runs: AtomicUsize::new(0), dir }
		}

		fn restarted(&self) -> Self {
			Self::over(RemovedOnDrop(self.dir.to_path_buf()))
		}

		async fn called(&self, key: MemberCallKey, answer: Answered) -> Answered {
			self.ran(key, Ran::Answered(answer)).await
		}

		async fn ran(&self, key: MemberCallKey, ran: Ran) -> Answered {
			let watching = match self.calls.claim(key) {
				Claim::Running(watching) => watching,
				Claim::First(first) => {
					let watching = first.watching();
					let run = async {
						self.runs.fetch_add(1, Ordering::SeqCst);
						ran
					};
					first.answered_once(&self.database, run).await;
					watching
				}
			};
			answered_by_the_first_run(watching).await
		}

		fn answers(&self) -> &MemberCallAnswersRepository {
			let Ok(database) = &self.database else { panic!("the database opens") };
			database.member_call_answers()
		}

		fn runs(&self) -> usize {
			self.runs.load(Ordering::SeqCst)
		}
	}

	fn a_key(call_key: &str) -> MemberCallKey {
		MemberCallKey {
			space_id: "personal".to_owned(),
			device_id: "d1".to_owned(),
			call_key: call_key.to_owned(),
		}
	}

	fn ok(body: &str) -> Answered {
		(StatusCode::OK, json!(body))
	}

	fn first(claim: Claim) -> FirstRun {
		match claim {
			Claim::First(first) => first,
			Claim::Running(_) => panic!("the call was not claimed as a first run"),
		}
	}

	#[tokio::test]
	async fn a_repeat_of_an_answered_key_gets_the_stored_answer_and_runs_nothing() {
		let host = Host::new();
		host.called(a_key("k1"), ok("one")).await;

		let repeated = host.called(a_key("k1"), ok("two")).await;

		assert_eq!(repeated, ok("one"));
		assert_eq!(host.runs(), 1);
	}

	#[tokio::test]
	async fn a_repeat_after_a_restart_gets_the_stored_answer_and_runs_nothing() {
		let host = Host::new();
		host.called(a_key("k1"), ok("one")).await;
		let restarted = host.restarted();

		let repeated = restarted.called(a_key("k1"), ok("two")).await;

		assert_eq!(repeated, ok("one"));
		assert_eq!(restarted.runs(), 0);
	}

	#[tokio::test]
	async fn a_repeat_past_the_answers_kept_is_refused_and_runs_nothing() {
		let host = Host::new();
		for n in 0..=ANSWERS_KEPT_PER_DEVICE {
			host.called(a_key(&format!("k{n}")), ok("kept")).await;
		}

		let refused = host.called(a_key("k0"), ok("again")).await;
		let kept = host.called(a_key("k1"), ok("again")).await;

		assert_eq!(refused, (StatusCode::GONE, json!(NO_ANSWER_KEPT)));
		assert_eq!(kept, ok("kept"));
		assert_eq!(host.runs(), usize::try_from(ANSWERS_KEPT_PER_DEVICE).expect("a count") + 1);
	}

	#[tokio::test]
	async fn the_same_key_from_another_device_or_another_space_runs_on_its_own() {
		let host = Host::new();
		let Ok(database) = &host.database else { panic!("the database opens") };
		let other_space = database.spaces().create("Writers".to_owned()).await.expect("a space");
		host.called(a_key("k1"), ok("one")).await;

		let other_device = MemberCallKey { device_id: "d2".to_owned(), ..a_key("k1") };
		let in_other_space = MemberCallKey { space_id: other_space.id, ..a_key("k1") };

		assert_eq!(host.called(other_device, ok("two")).await, ok("two"));
		assert_eq!(host.called(in_other_space, ok("three")).await, ok("three"));
		assert_eq!(host.runs(), 3);
	}

	#[tokio::test]
	async fn a_call_refused_before_invoke_leaves_no_row_and_its_repeat_runs() {
		let host = Host::new();
		for status in REFUSED_BEFORE_INVOKE {
			let key = a_key(&status.to_string());
			host.called(key.clone(), (status, json!("refused"))).await;

			assert_eq!(host.answers().kept(key.clone()).await.expect("read"), None, "{status}");
			assert_eq!(host.called(key, ok("passed")).await, ok("passed"), "{status}");
		}
	}

	#[tokio::test]
	async fn a_repeat_of_a_call_the_host_stopped_mid_run_answers_410_and_runs_nothing() {
		let host = Host::new();
		let started = Notify::new();
		let running = first(host.calls.claim(a_key("k1")));
		let never_answers = async {
			host.runs.fetch_add(1, Ordering::SeqCst);
			started.notify_one();
			std::future::pending().await
		};
		tokio::select! {
			() = running.answered_once(&host.database, never_answers) => panic!("the run answered"),
			() = started.notified() => {}
		}
		let restarted = host.restarted();

		let repeated = restarted.called(a_key("k1"), ok("again")).await;

		assert_eq!(repeated, (StatusCode::GONE, json!(NO_ANSWER_KEPT)));
		assert_eq!(host.runs() + restarted.runs(), 1);
	}

	#[tokio::test]
	async fn a_call_whose_claim_cannot_be_written_does_not_run_and_answers_500() {
		let host = Host::new();
		let Ok(database) = &host.database else { panic!("the database opens") };
		database
			.call(|connection| Ok(connection.pragma_update(None, "query_only", true)?))
			.await
			.expect("the database turns read-only");

		let answered = host.called(a_key("k1"), ok("one")).await;

		assert_eq!(answered, (StatusCode::INTERNAL_SERVER_ERROR, json!(RECORD_UNUSABLE)));
		assert_eq!(host.runs(), 0);
	}

	#[tokio::test]
	async fn a_failure_the_command_raised_is_kept_and_answers_the_repeat() {
		let host = Host::new();
		let failed = (StatusCode::INTERNAL_SERVER_ERROR, json!("stored, then failed"));
		host.called(a_key("k1"), failed.clone()).await;

		assert_eq!(host.called(a_key("k1"), ok("again")).await, failed);
		assert_eq!(host.runs(), 1);
	}

	#[tokio::test]
	async fn a_call_that_never_reached_the_host_api_leaves_no_row_and_its_repeat_runs() {
		let host = Host::new();
		let unreached = Ran::Unreached((StatusCode::BAD_GATEWAY, json!("not reached")));
		host.ran(a_key("k1"), unreached).await;

		assert_eq!(host.answers().kept(a_key("k1")).await.expect("read"), None);
		assert_eq!(host.called(a_key("k1"), ok("reached")).await, ok("reached"));
		assert_eq!(host.runs(), 2);
	}

	#[tokio::test]
	async fn a_502_that_timed_out_after_reaching_the_host_api_is_kept() {
		let host = Host::new();
		let timed_out = (StatusCode::BAD_GATEWAY, json!("timed out"));
		host.called(a_key("k1"), timed_out.clone()).await;

		assert_eq!(host.called(a_key("k1"), ok("again")).await, timed_out);
		assert_eq!(host.runs(), 1);
	}

	#[tokio::test]
	async fn a_repeat_held_while_the_first_run_is_in_flight_gets_its_answer_even_unkept() {
		let host = Host::new();
		let running = first(host.calls.claim(a_key("k1")));
		let Claim::Running(held) = host.calls.claim(a_key("k1")) else {
			panic!("the repeat was not held");
		};
		let unreached = (StatusCode::BAD_GATEWAY, json!("not reached"));

		running.answered_once(&host.database, async { Ran::Unreached(unreached.clone()) }).await;

		assert_eq!(answered_by_the_first_run(held).await, unreached);
		assert!(matches!(host.calls.claim(a_key("k1")), Claim::First(_)));
	}

	#[tokio::test]
	async fn a_repeat_held_while_the_first_run_is_in_flight_gets_its_answer() {
		let host = Host::new();
		let running = first(host.calls.claim(a_key("k1")));
		let Claim::Running(held) = host.calls.claim(a_key("k1")) else {
			panic!("the repeat was not held");
		};
		let waiting = tokio::spawn(answered_by_the_first_run(held));

		running.answered_once(&host.database, async { Ran::Answered(ok("one")) }).await;

		assert_eq!(waiting.await.expect("the repeat answers"), ok("one"));
	}

	#[tokio::test]
	async fn a_first_run_dropped_unanswered_frees_its_key_and_ends_the_held_repeat() {
		let host = Host::new();
		let running = first(host.calls.claim(a_key("k1")));
		let Claim::Running(held) = host.calls.claim(a_key("k1")) else {
			panic!("the repeat was not held");
		};

		drop(running);

		assert_eq!(answered_by_the_first_run(held).await.0, StatusCode::INTERNAL_SERVER_ERROR);
		assert!(matches!(host.calls.claim(a_key("k1")), Claim::First(_)));
	}
}
