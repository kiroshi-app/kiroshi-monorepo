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
use kiroshi_app::conversations::commands::conversation_main_chat;
use kiroshi_app::conversations::contract::UPDATED_EVENT;
use kiroshi_app::db;
use kiroshi_app::db::repositories::messages::{MessagePageQuery, MessageState, StoredMessage};
use kiroshi_app::routines::commands::{routine_run_now, CHANGED_EVENT};
use kiroshi_app::routines::contract::{
	FieldType, Filter, FilterMatchMode, PayloadField, ReportedRun, Routine, RoutineDraft,
	RoutineRun, RunOutcome, TriggerDecision, TriggerSource,
};
use kiroshi_app::routines::core::{self, Clock, SystemClock};
use kiroshi_app::routines::runner::{RunTiming, Runner};
use kiroshi_app::routines::schedule::{self, Occurrence};
use serde_json::{json, Value};
use tauri::async_runtime::block_on;
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const BOT: &str = "default";
const EVERY_MINUTE: &str = "* * * * *";
const REPORT_TEXT: &str = "The shift log changed.";
const RUN_COST_USD: f64 = 0.0425;
const DEADLINE: Duration = Duration::from_secs(15);
const POLL: Duration = Duration::from_millis(25);

struct Host {
	app: AppOfItsOwn,
	conversation_id: String,
	routine: Routine,
	changed: Arc<Mutex<Vec<String>>>,
	updated: Arc<Mutex<Vec<Value>>>,
	_scenario: RemovedOnDrop,
}

fn serial() -> MutexGuard<'static, ()> {
	static SIDECAR_SETTINGS: Mutex<()> = Mutex::new(());
	SIDECAR_SETTINGS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn scenario(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-routine-scenario-{}.txt", std::process::id())),
	);
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, &*path);
	path
}

const A_ROOM: &str = "
	INSERT INTO bots (id, name, model, created_at) VALUES ('b-ada', 'Ada', 'sonnet', 1);
	INSERT INTO bots (id, name, model, created_at) VALUES ('b-grace', 'Grace Hopper', 'sonnet', 1);
	INSERT INTO conversations (id, kind, title, created_at, updated_at, space_id)
		VALUES ('room-1', 'topic', 'Shift room', 1, 1, 'personal');
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('room-1', 'default', 'assistant', 1, 0),
			('room-1', 'b-ada', 'assistant', 1, 1),
			('room-1', 'b-grace', 'assistant', 1, 2);
";

const REFUSED_TURNS: &str = "
	CREATE TRIGGER refuse_every_turn BEFORE INSERT ON turns
	BEGIN SELECT RAISE(ABORT, 'the turn is refused'); END;
";

fn launch(name: &str, played: &str) -> Host {
	let scenario = scenario(played);
	let app = booted(name);
	let chat = block_on(conversation_main_chat(app.state(), BOT.to_owned(), None))
		.expect("the main chat opens");
	hosting(app, scenario, name, chat.id)
}

fn launch_in_a_room(name: &str, played: &str) -> Host {
	let scenario = scenario(played);
	let app = booted(name);
	block_on(database_of(&app).conversations().ensure_default_bot()).expect("the default bot");
	planted(&app, A_ROOM);
	hosting(app, scenario, name, "room-1".to_owned())
}

fn planted(app: &App<MockRuntime>, statements: &'static str) {
	block_on(
		database_of(app).call_mut(move |connection| Ok(connection.execute_batch(statements)?)),
	)
	.expect("the fixture is planted");
}

fn booted(name: &str) -> AppOfItsOwn {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let app = an_app_of_its_own(
		&format!("routine-runs-{name}"),
		mock_builder().manage(AgentState::default()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &["default"]);
	app
}

fn hosting(app: AppOfItsOwn, scenario: RemovedOnDrop, name: &str, conversation_id: String) -> Host {
	let changed: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
	let heard = changed.clone();
	app.listen(CHANGED_EVENT, move |event| {
		let announced: Value = serde_json::from_str(event.payload()).expect("the change is JSON");
		let conversation_id =
			announced["conversationId"].as_str().expect("the change names a room");
		heard.lock().expect("the change log").push(conversation_id.to_owned());
	});
	let updated: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(Vec::new()));
	let seen = updated.clone();
	app.listen(UPDATED_EVENT, move |event| {
		let announced: Value = serde_json::from_str(event.payload()).expect("the update is JSON");
		seen.lock().expect("the update log").push(announced);
	});

	let routine = block_on(database_of(&app).routines().create(
		RoutineDraft {
			conversation_id: conversation_id.clone(),
			bot_id: BOT.to_owned(),
			title: "Nightly report".to_owned(),
			instruction: "Read the shift log and report what changed.".to_owned(),
			trigger_source_id: schedule::SOURCE_ID.to_owned(),
			filter: Filter { match_mode: FilterMatchMode::All, rows: Vec::new() },
			trigger_config: json!({ "expression": EVERY_MINUTE }),
		},
		format!("routine-key-{name}"),
		SystemClock.now_ms(),
	))
	.expect("the routine is stored");
	Host { app, conversation_id, routine, changed, updated, _scenario: scenario }
}

fn database_of(app: &App<MockRuntime>) -> &db::Database {
	app.state::<db::DatabaseState>().inner().as_ref().expect("the database is open")
}

fn the_schedule_source() -> TriggerSource {
	TriggerSource {
		id: schedule::SOURCE_ID.to_owned(),
		title: "On a schedule".to_owned(),
		payload: vec![
			PayloadField { name: "occurrenceId".to_owned(), field_type: FieldType::String },
			PayloadField { name: "firedAt".to_owned(), field_type: FieldType::Datetime },
			PayloadField { name: "expression".to_owned(), field_type: FieldType::String },
		],
		dedupe_key: "occurrenceId".to_owned(),
		header: None,
	}
}

impl Host {
	fn database(&self) -> &db::Database {
		database_of(&self.app)
	}

	fn runner(&self) -> Runner<MockRuntime> {
		Runner::new(self.app.handle().clone())
	}

	fn fire_the_schedule(&self) -> TriggerDecision {
		let occurrence =
			Occurrence { at: SystemClock.now_ms(), expression: EVERY_MINUTE.to_owned() };
		block_on(schedule::fire(
			self.database(),
			&self.runner(),
			&SystemClock,
			&self.routine,
			&the_schedule_source(),
			&occurrence,
		))
		.expect("the schedule fires")
	}

	fn run_now(&self) -> TriggerDecision {
		block_on(routine_run_now(
			self.app.handle().clone(),
			self.app.state(),
			self.routine.id.clone(),
		))
		.expect("the routine runs now")
	}

	fn run_now_timed(&self, timing: RunTiming) -> TriggerDecision {
		let runner = Runner::timed(self.app.handle().clone(), timing);
		block_on(core::run_now(self.database(), &runner, &SystemClock, self.routine.id.clone()))
			.expect("the routine runs now")
	}

	fn closed_run(&self) -> RoutineRun {
		self.wait_for("the run to close", |host| {
			host.runs().into_iter().find(|run| run.ended_at.is_some())
		})
	}

	fn runs(&self) -> Vec<RoutineRun> {
		block_on(self.database().routines().runs(self.routine.id.clone(), 10))
			.expect("the runs read")
	}

	fn reported(&self) -> Vec<ReportedRun> {
		block_on(self.database().routines().reported(self.conversation_id.clone()))
			.expect("the reported runs read")
	}

	fn replies(&self) -> Vec<StoredMessage> {
		let query = MessagePageQuery {
			conversation_id: self.conversation_id.clone(),
			before_seq: None,
			limit: 50,
		};
		block_on(self.database().messages().page_messages(query))
			.expect("the transcript reads")
			.messages
			.into_iter()
			.filter(|message| message.author_bot_id.as_deref() == Some(BOT))
			.collect()
	}

	fn changes(&self) -> usize {
		let changed = self.changed.lock().expect("the change log");
		changed.iter().filter(|id| **id == self.conversation_id).count()
	}

	fn updates(&self) -> Vec<Value> {
		let updated = self.updated.lock().expect("the update log");
		updated
			.iter()
			.filter(|announced| {
				announced["conversation"]["id"].as_str() == Some(self.conversation_id.as_str())
			})
			.cloned()
			.collect()
	}

	fn wait_for_changes(&self, expected: usize) {
		self.wait_for("routine://changed for the routine conversation", |host| {
			(host.changes() >= expected).then_some(())
		});
	}

	fn wait_for_no_live_session(&self) {
		self.wait_for("the run session to shut down", |host| {
			let live = block_on(agent_live_sessions(host.app.state())).expect("the sessions read");
			live.is_empty().then_some(())
		});
	}

	fn lease_renewed_at(&self, run_id: &str) -> Option<i64> {
		let run_id = run_id.to_owned();
		block_on(self.database().call(move |connection| {
			Ok(connection.query_row(
				"SELECT lease_renewed_at FROM routine_runs WHERE id = ?1",
				[run_id],
				|row| row.get(0),
			)?)
		}))
		.expect("the lease reads")
	}

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

	fn quit(self) {
		block_on(terminate_session(&self.app.state::<AgentState>()));
	}
}

fn is_started(decision: &TriggerDecision) -> bool {
	matches!(decision, TriggerDecision::Started { .. })
}

fn assert_reported(host: &Host, run: &RoutineRun) {
	assert_eq!(run.outcome, Some(RunOutcome::Ok), "the run closed as {run:?}");
	assert_eq!(run.reason, None);
	assert_eq!(run.cost_usd, Some(RUN_COST_USD));
	assert!(run.model_usage.is_some(), "the run closed without its model usage");

	let replies = host.replies();
	assert_eq!(replies.len(), 1, "the conversation holds {replies:#?}");
	let report = &replies[0];
	assert_eq!(report.content, REPORT_TEXT);
	assert_eq!(report.state, MessageState::Complete);
	assert_eq!(report.replied_to_message_id, None);

	let reported = host.reported();
	assert_eq!(reported.len(), 1, "the conversation reports {reported:?}");
	assert_eq!(reported[0].turn_id, report.turn_id, "the run names another turn than the report");
}

fn assert_the_row_announced_once(host: &Host) {
	let report = &host.replies()[0];
	let updates = host.updates();
	assert_eq!(updates.len(), 1, "the conversation was announced as {updates:#?}");
	let row = &updates[0]["conversation"];
	assert_eq!(row["lastWord"]["text"], REPORT_TEXT);
	assert_eq!(row["lastWord"]["authorBotId"], BOT);
	assert_eq!(row["lastWord"]["at"], report.created_at);
	assert_eq!(row["lastActivityAt"], report.created_at);
	assert_eq!(row["activeTurn"], Value::Null);
}

fn assert_failed(host: &Host, reason: &str) {
	let run = host.closed_run();
	assert_eq!(run.outcome, Some(RunOutcome::Failed), "the run closed as {run:?}");
	assert_eq!(run.reason.as_deref(), Some(reason));
	assert!(host.replies().is_empty(), "a failed run wrote {:#?}", host.replies());
	host.wait_for_no_live_session();
}

#[test]
fn a_schedule_fire_runs_in_the_host_and_writes_its_report() {
	let _serial = serial();
	let host = launch("schedule", "routine_report");

	assert!(is_started(&host.fire_the_schedule()));
	let run = host.closed_run();

	assert_reported(&host, &run);
	host.wait_for_changes(1);
	host.wait_for_no_live_session();
	assert_the_row_announced_once(&host);
	host.quit();
}

#[test]
fn a_run_now_runs_in_the_host_and_writes_its_report() {
	let _serial = serial();
	let host = launch("run-now", "routine_report");

	assert!(is_started(&host.run_now()));
	let run = host.closed_run();

	assert_reported(&host, &run);
	host.wait_for_changes(2);
	host.wait_for_no_live_session();
	host.quit();
}

#[test]
fn a_run_with_nothing_to_say_closes_nothing_and_writes_no_message() {
	let _serial = serial();
	let host = launch("nothing", "routine_nothing");

	assert!(is_started(&host.fire_the_schedule()));
	let run = host.closed_run();

	assert_eq!(run.outcome, Some(RunOutcome::Nothing), "the run closed as {run:?}");
	assert_eq!(run.reason, None);
	assert_eq!(run.cost_usd, Some(RUN_COST_USD));
	assert!(host.replies().is_empty(), "a quiet run wrote {:#?}", host.replies());
	assert!(host.reported().is_empty());
	host.wait_for_changes(1);
	host.wait_for_no_live_session();
	assert!(host.updates().is_empty(), "a quiet run announced {:#?}", host.updates());
	host.quit();
}

#[test]
fn a_failed_turn_closes_the_run_failed() {
	let _serial = serial();
	let host = launch("failed", "routine_failed");

	assert!(is_started(&host.fire_the_schedule()));

	assert_failed(&host, "the run's turn failed");
	host.wait_for_changes(1);
	host.quit();
}

#[test]
fn a_question_during_a_run_closes_it_failed() {
	let _serial = serial();
	let host = launch("question", "question");

	assert!(is_started(&host.fire_the_schedule()));

	assert_failed(&host, "a run cannot be asked a question");
	host.quit();
}

#[test]
fn a_permission_during_a_run_closes_it_failed() {
	let _serial = serial();
	let host = launch("permission", "permission");

	assert!(is_started(&host.fire_the_schedule()));

	assert_failed(&host, "a run cannot be asked for a permission");
	host.quit();
}

#[test]
fn a_turn_ending_with_no_structured_output_closes_the_run_failed() {
	let _serial = serial();
	let host = launch("unstructured", "routine_unstructured");

	assert!(is_started(&host.fire_the_schedule()));

	assert_failed(&host, "the run's turn ended with no structured output");
	host.quit();
}

#[test]
fn a_session_that_cannot_start_closes_the_run_failed_naming_the_error() {
	let _serial = serial();
	let host = launch("startup", "startup_crash");

	assert!(is_started(&host.fire_the_schedule()));
	let run = host.closed_run();

	assert_eq!(run.outcome, Some(RunOutcome::Failed), "the run closed as {run:?}");
	let reason = run.reason.expect("the run names why it failed");
	assert!(
		reason.starts_with("the run could not start: {\"kind\":"),
		"the run failed with {reason}"
	);
	host.wait_for_no_live_session();
	host.quit();
}

#[test]
fn a_run_that_outlives_its_deadline_is_cancelled_after_renewing_its_lease() {
	let _serial = serial();
	let host = launch("deadline", "slow");
	let timing =
		RunTiming { lease: Duration::from_millis(100), deadline: Duration::from_millis(800) };

	assert!(is_started(&host.run_now_timed(timing)));
	let run = host.closed_run();

	assert_eq!(run.outcome, Some(RunOutcome::Failed), "the run closed as {run:?}");
	assert_eq!(run.reason.as_deref(), Some("the run outlived its deadline"));
	let renewed = host.lease_renewed_at(&run.id).expect("the run holds a lease");
	assert!(renewed > run.started_at, "the lease was never renewed while the run was live");
	host.wait_for_no_live_session();
	host.quit();
}

#[test]
fn a_report_in_a_room_turns_the_name_of_a_seated_bot_into_its_token() {
	let _serial = serial();
	let host = launch_in_a_room("room", "routine_report_naming");

	assert!(is_started(&host.fire_the_schedule()));
	let run = host.closed_run();

	assert_eq!(run.outcome, Some(RunOutcome::Ok), "the run closed as {run:?}");
	let replies = host.replies();
	assert_eq!(replies.len(), 1, "the room holds {replies:#?}");
	assert_eq!(replies[0].content, "<@b-grace> the shift log changed.");
	host.wait_for_no_live_session();
	host.quit();
}

#[test]
fn a_report_that_cannot_be_written_closes_the_run_failed_and_writes_no_message() {
	let _serial = serial();
	let host = launch("unwritten", "routine_report");
	planted(&host.app, REFUSED_TURNS);

	assert!(is_started(&host.fire_the_schedule()));
	let run = host.closed_run();

	assert_eq!(run.outcome, Some(RunOutcome::Failed), "the run closed as {run:?}");
	let reason = run.reason.expect("the run names why it failed");
	assert!(
		reason.starts_with("the report could not be written: "),
		"the run failed with {reason}"
	);
	assert!(host.replies().is_empty(), "an unwritten report left {:#?}", host.replies());
	assert!(host.reported().is_empty());
	host.wait_for_changes(1);
	host.wait_for_no_live_session();
	assert!(host.updates().is_empty(), "an unwritten report announced {:#?}", host.updates());
	host.quit();
}
