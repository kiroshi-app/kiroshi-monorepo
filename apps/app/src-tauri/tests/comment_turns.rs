mod bundled;
mod common;

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use bundled::bundled_bots;
use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::{agent_live_sessions, terminate_session};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::db;
use kiroshi_app::hosting::authorship::Caller;
use kiroshi_app::library::commands::{
	library_comment_agent_turns, library_comment_create, library_comment_threads,
	library_create_board,
};
use kiroshi_app::library::contract::{
	LibraryBoardPoint, LibraryCommentAgentTurn, LibraryCommentAgentTurnState,
	LibraryCommentAgentTurnsChanged, LibraryCommentAnchor, LibraryCommentParty,
	LibraryCommentPartyKind, LibraryCommentThread, LibraryCommentTurnFailure,
	COMMENT_AGENT_TURNS_CHANGED_EVENT,
};
use tauri::async_runtime::block_on;
use tauri::test::mock_builder;
use tauri::{Listener, Manager};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const BOT: &str = "default";
const SPACE: &str = "personal";
const DEADLINE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(25);

struct Host {
	app: AppOfItsOwn,
	thread: LibraryCommentThread,
	changed: Arc<Mutex<Vec<LibraryCommentAgentTurnsChanged>>>,
	_scenario: RemovedOnDrop,
}

fn serial() -> MutexGuard<'static, ()> {
	static SIDECAR_SETTINGS: Mutex<()> = Mutex::new(());
	SIDECAR_SETTINGS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn scenario(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-comment-scenario-{}.txt", std::process::id())),
	);
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, &*path);
	path
}

fn mentioned(name: &str, played: &str) -> Host {
	let scenario = scenario(played);
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let app = an_app_of_its_own(
		&format!("comment-turns-{name}"),
		mock_builder().manage(AgentState::default()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &[BOT]);
	let changed: Arc<Mutex<Vec<LibraryCommentAgentTurnsChanged>>> = Arc::default();
	let heard = Arc::clone(&changed);
	app.listen(COMMENT_AGENT_TURNS_CHANGED_EVENT, move |event| {
		let announced = serde_json::from_str(event.payload()).expect("the change is JSON");
		heard.lock().expect("the change log").push(announced);
	});
	let board = block_on(library_create_board(
		app.handle().clone(),
		app.state(),
		SPACE.to_owned(),
		"plan".to_owned(),
	))
	.expect("the board is created");
	let thread = block_on(library_comment_create(
		app.handle().clone(),
		Caller::Host,
		app.state(),
		SPACE.to_owned(),
		board.name,
		LibraryCommentAnchor::BoardPoint { point: LibraryBoardPoint { x: 40, y: 80 } },
		"Lay this out".to_owned(),
		vec![LibraryCommentParty { kind: LibraryCommentPartyKind::Agent, id: BOT.to_owned() }],
	))
	.expect("the comment is stored");
	Host { app, thread, changed, _scenario: scenario }
}

impl Host {
	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&Self) -> Option<T>) -> T {
		let deadline = Instant::now() + DEADLINE;
		loop {
			if let Some(found) = ready(self) {
				return found;
			}
			assert!(Instant::now() < deadline, "waited {DEADLINE:?} for {expected}");
			std::thread::sleep(POLL);
		}
	}

	fn agent_turns(&self) -> Vec<LibraryCommentAgentTurn> {
		block_on(library_comment_agent_turns(
			self.app.handle().clone(),
			self.app.state(),
			SPACE.to_owned(),
		))
		.expect("the agent turns read")
	}

	fn failure(&self) -> LibraryCommentTurnFailure {
		self.wait_for("the turn to settle as failed", |host| {
			match host.agent_turns().as_slice() {
				[LibraryCommentAgentTurn {
					state: LibraryCommentAgentTurnState::Failed { reason, .. },
					..
				}] => Some(*reason),
				_ => None,
			}
		})
	}

	fn wait_for_no_live_session(&self) {
		self.wait_for("the turn session to shut down", |host| {
			let live = block_on(agent_live_sessions(host.app.state())).expect("the sessions read");
			live.is_empty().then_some(())
		});
	}

	fn assert_settled_on_the_thread(&self) {
		let turns = self.agent_turns();
		assert_eq!(turns.len(), 1, "the Space holds {turns:?}");
		assert_eq!(
			(turns[0].thread_id.as_str(), turns[0].agent_id.as_str()),
			(self.thread.id.as_str(), BOT)
		);
		let changes = self.wait_for("the working state and its end to be announced", |host| {
			let changes = host.changed.lock().expect("the change log").clone();
			(changes.len() >= 2).then_some(changes)
		});
		let changed = LibraryCommentAgentTurnsChanged {
			space_id: SPACE.to_owned(),
			thread_id: self.thread.id.clone(),
			agent_id: BOT.to_owned(),
		};
		assert_eq!(changes, [changed.clone(), changed]);
		let threads = block_on(library_comment_threads(
			self.app.handle().clone(),
			self.app.state(),
			SPACE.to_owned(),
			self.thread.item_name.clone(),
		))
		.expect("the threads read");
		assert_eq!(threads, [self.thread.clone()], "a failed turn left a comment in the thread");
	}

	fn listed_conversations(&self) -> usize {
		let state = self.app.state::<db::DatabaseState>();
		let database = state.inner().as_ref().expect("the database is open");
		block_on(database.conversations().conversations(SPACE.to_owned()))
			.expect("the conversations list")
			.len()
	}

	fn quit(self) {
		block_on(terminate_session(self.app.handle(), &self.app.state::<AgentState>()));
	}
}

#[test]
fn a_turn_ending_with_no_reply_records_it_on_the_thread_and_shuts_its_session_down() {
	let _serial = serial();
	let host = mentioned("no-reply", "routine_unstructured");

	assert_eq!(host.failure(), LibraryCommentTurnFailure::NoReply);

	host.assert_settled_on_the_thread();
	host.wait_for_no_live_session();
	assert_eq!(host.listed_conversations(), 0, "the turn listed a conversation of its own");
	host.quit();
}

#[test]
fn a_failed_turn_records_a_failure_on_the_thread() {
	let _serial = serial();
	let host = mentioned("failed", "routine_failed");

	assert_eq!(host.failure(), LibraryCommentTurnFailure::TurnFailed);

	host.assert_settled_on_the_thread();
	host.wait_for_no_live_session();
	host.quit();
}

#[test]
fn a_question_during_a_turn_cancels_it_and_records_a_failure_on_the_thread() {
	let _serial = serial();
	let host = mentioned("question", "question");

	assert_eq!(host.failure(), LibraryCommentTurnFailure::TurnFailed);

	host.assert_settled_on_the_thread();
	host.wait_for_no_live_session();
	host.quit();
}
