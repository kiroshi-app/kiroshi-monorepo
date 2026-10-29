use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tauri::{AppHandle, Runtime};
use tokio::time;

use super::commands::announce_conversation;
use super::contract::TranscriptStoreError;
use super::summons::{self, SummonsDropReason, SummonsRun};
use crate::agent::translate::now_ms;
use crate::events::CONVERSATION_UPDATED;
use crate::routines::runner::{database, managed};

pub(crate) const AWAITED_TURN_RUN_START_DEADLINE: Duration = Duration::from_secs(60);

const NO_DEADLINES: &str = "the host holds no turn run deadlines";

type TurnRun = (String, String);

pub struct TurnRunDeadlines {
	start_within: Duration,
	armed: Arc<Mutex<Armed>>,
}

#[derive(Default)]
struct Armed {
	last_hold: u64,
	holds: HashMap<TurnRun, u64>,
}

impl Default for TurnRunDeadlines {
	fn default() -> Self {
		Self::after(AWAITED_TURN_RUN_START_DEADLINE)
	}
}

impl TurnRunDeadlines {
	pub fn after(start_within: Duration) -> Self {
		Self { start_within, armed: Arc::default() }
	}
}

impl Armed {
	fn hold(&mut self, run: TurnRun) -> u64 {
		self.last_hold += 1;
		self.holds.insert(run, self.last_hold);
		self.last_hold
	}

	fn suspend(&mut self, run: &TurnRun) {
		self.holds.remove(run);
	}

	fn disarm(&mut self, run: &TurnRun, hold: u64) -> bool {
		if self.holds.get(run) != Some(&hold) {
			return false;
		}
		self.holds.remove(run);
		true
	}
}

pub(crate) fn arm_start_deadlines<R: Runtime>(
	app: &AppHandle<R>,
	conversation_id: &str,
	turn_id: &str,
	bot_ids: &[String],
) {
	if bot_ids.is_empty() {
		return;
	}
	let held = HeldTurn {
		app: app.clone(),
		conversation_id: conversation_id.to_owned(),
		turn_id: turn_id.to_owned(),
	};
	let deadlines = match managed::<R, TurnRunDeadlines>(app, NO_DEADLINES) {
		Ok(deadlines) => deadlines,
		Err(missing) => {
			eprintln!(
				"{} could not arm the start deadline of {bot_ids:?}: {missing}",
				held.label()
			);
			return;
		}
	};
	let armed = deadlines.armed.clone();
	let holds: Vec<(String, u64)> = {
		let mut held_runs = locked(&armed);
		bot_ids
			.iter()
			.map(|bot_id| (bot_id.clone(), held_runs.hold((turn_id.to_owned(), bot_id.clone()))))
			.collect()
	};
	let start_within = deadlines.start_within;
	tauri::async_runtime::spawn(async move {
		time::sleep(start_within).await;
		for (bot_id, hold) in holds {
			let run = (held.turn_id.clone(), bot_id);
			if locked(&armed).disarm(&run, hold) {
				held.release(&run.1).await;
			}
		}
	});
}

pub(crate) fn suspend_start_deadline<R: Runtime>(app: &AppHandle<R>, turn_id: &str, bot_id: &str) {
	match managed::<R, TurnRunDeadlines>(app, NO_DEADLINES) {
		Ok(deadlines) => locked(&deadlines.armed).suspend(&(turn_id.to_owned(), bot_id.to_owned())),
		Err(missing) => {
			eprintln!("turn {turn_id} could not suspend the start deadline of {bot_id}: {missing}")
		}
	}
}

fn locked(armed: &Mutex<Armed>) -> MutexGuard<'_, Armed> {
	armed.lock().unwrap_or_else(PoisonError::into_inner)
}

struct HeldTurn<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	turn_id: String,
}

impl<R: Runtime> HeldTurn<R> {
	async fn release(&self, bot_id: &str) {
		if let Err(error) = self.released(bot_id).await {
			eprintln!(
				"{} could not release the awaited run of {bot_id} at its start deadline: {error:?}",
				self.label()
			);
		}
	}

	async fn released(&self, bot_id: &str) -> Result<(), TranscriptStoreError> {
		let database = database(&self.app)?;
		let expired = database
			.messages()
			.expire_awaited_run(self.turn_id.clone(), bot_id.to_owned(), now_ms())
			.await?;
		if expired {
			let run = SummonsRun {
				conversation_id: &self.conversation_id,
				turn_id: &self.turn_id,
				bot_id,
			};
			summons::note_dropped(&run, SummonsDropReason::NeverStarted);
			announce_conversation(&self.app, database, CONVERSATION_UPDATED, &self.conversation_id)
				.await;
		}
		Ok(())
	}

	fn label(&self) -> String {
		format!("turn {} of conversation {}", self.turn_id, self.conversation_id)
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, Value};
	use tauri::test::mock_builder;
	use tauri::{Listener, Manager};
	use tokio::sync::mpsc;

	use super::*;
	use crate::conversations::contract::UPDATED_EVENT;
	use crate::db;
	use crate::db::repositories::conversations::DEFAULT_BOT_ID;
	use crate::db::repositories::messages::NewTurn;
	use crate::test_app::an_app_of_its_own;

	fn run_of(bot_id: &str) -> TurnRun {
		("t1".to_owned(), bot_id.to_owned())
	}

	#[test]
	fn a_later_hold_of_the_same_turn_run_disarms_the_earlier_deadline() {
		let mut armed = Armed::default();

		let earlier = armed.hold(run_of("ada"));
		let later = armed.hold(run_of("ada"));

		assert!(!armed.disarm(&run_of("ada"), earlier), "the earlier deadline fired");
		assert!(armed.disarm(&run_of("ada"), later), "the later deadline was lost");
		assert!(!armed.disarm(&run_of("ada"), later), "the deadline fired twice");
	}

	#[tokio::test]
	async fn a_turn_run_started_before_its_start_deadline_keeps_running_and_announces_nothing() {
		let app = an_app_of_its_own("turn-run-deadline", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(TurnRunDeadlines::after(Duration::ZERO));
		let database = database(app.handle()).expect("the database opens");
		database.conversations().ensure_default_bot().await.expect("the bot is seeded");
		let chat = database
			.conversations()
			.ensure_chat(DEFAULT_BOT_ID.to_owned(), None)
			.await
			.expect("the chat is seeded");
		let messages = database.messages();
		let turn =
			|| NewTurn { id: "t1".to_owned(), conversation_id: chat.id.clone(), started_at: 1 };
		messages.start_turn(turn()).await.expect("the turn opens");
		let both = vec!["early".to_owned(), "late".to_owned()];
		messages.await_runs("t1".to_owned(), both.clone()).await.expect("the runs wait");
		messages.start_run(turn(), "early".to_owned()).await.expect("the early run starts");
		let (announced, mut updates) = mpsc::unbounded_channel();
		app.handle().listen(UPDATED_EVENT, move |event| {
			let payload: Value =
				serde_json::from_str(event.payload()).expect("the payload is JSON");
			announced
				.send(payload["conversation"]["activeTurn"].clone())
				.expect("the test listens");
		});

		arm_start_deadlines(app.handle(), &chat.id, "t1", &both);
		let first = time::timeout(Duration::from_secs(60), updates.recv())
			.await
			.expect("the late release announced in time");

		assert_eq!(first, Some(json!({ "bots": [{ "botId": "early", "startedAt": 1 }] })));
		assert!(updates.try_recv().is_err(), "the started run announced an update");
	}
}
