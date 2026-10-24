#![cfg(unix)]

mod bundled;
mod common;

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use bundled::bundled_bots;
use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::{
	agent_shutdown, agent_start_or_resume_session, agent_submit_prompt, shutdown_session,
	terminate_session, EVENT_CHANNEL,
};
use kiroshi_app::agent::contract::{RuntimeScope, SessionHandle, SubmittedTurn, TransportError};
use kiroshi_app::agent::sidecar::live_groups;
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::conversations::contract::UPDATED_EVENT;
use kiroshi_app::db;
use serde_json::Value;
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const DEADLINE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(25);

const A_CONVERSATION: &str = "
	INSERT INTO conversations (id, kind, title, created_at, updated_at, space_id)
		VALUES ('c1', 'topic', 'Lifecycle', 1, 1, 'personal');
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('c1', 'default', 'lead', 1, 0);
";

type Heard = Arc<Mutex<Vec<(&'static str, Value)>>>;

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

fn app() -> AppOfItsOwn {
	let app = an_app_of_its_own(
		"lifecycle",
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &["default", "second"]);
	app
}

fn runtime() -> tokio::runtime::Runtime {
	tokio::runtime::Runtime::new().expect("runtime")
}

fn scope() -> RuntimeScope {
	RuntimeScope {
		conversation_id: "c1".to_owned(),
		bot_id: "default".to_owned(),
		runtime_session_id: "r1".to_owned(),
		epoch: 1,
	}
}

fn another_bots_scope() -> RuntimeScope {
	RuntimeScope {
		conversation_id: "c2".to_owned(),
		bot_id: "second".to_owned(),
		runtime_session_id: "r2".to_owned(),
		epoch: 1,
	}
}

async fn start_run(
	app: &App<MockRuntime>,
	scope: RuntimeScope,
) -> Result<SessionHandle, TransportError> {
	agent_start_or_resume_session(
		app.handle().clone(),
		app.state::<AgentState>(),
		app.state::<db::DatabaseState>(),
		scope,
		None,
		Some(std::env::temp_dir().to_string_lossy().into_owned()),
		None,
	)
	.await
}

async fn start(app: &App<MockRuntime>) -> Result<SessionHandle, TransportError> {
	start_run(app, scope()).await
}

async fn shutdown(app: &App<MockRuntime>) -> Result<(), TransportError> {
	agent_shutdown(app.handle().clone(), app.state::<AgentState>(), scope()).await
}

fn is_refused<T>(outcome: &Result<T, TransportError>) -> bool {
	matches!(outcome, Err(TransportError::TransitionInProgress))
}

#[cfg(unix)]
async fn opening_signalled(listener: &tokio::net::UnixListener) {
	tokio::time::timeout(DEADLINE, listener.accept())
		.await
		.expect("the restart began opening its session in time")
		.expect("the fake signalled its open");
}

async fn poll_until(expectation: &str, is_satisfied: impl Fn() -> bool) {
	let deadline = tokio::time::Instant::now() + DEADLINE;
	while !is_satisfied() {
		assert!(tokio::time::Instant::now() < deadline, "timed out waiting for {expectation}");
		tokio::time::sleep(POLL).await;
	}
}

fn recorded_pid(pid_file: &Path) -> Option<i32> {
	std::fs::read_to_string(pid_file).ok()?.trim().parse().ok()
}

fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

fn probe_file() -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-lifecycle-{}.pid", std::process::id())),
	);
	let _ = std::fs::remove_file(&path);
	path
}

#[test]
fn two_concurrent_starts_leave_one_session_and_one_sidecar() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);

	let app = app();
	runtime().block_on(async {
		let (first, second) = tokio::join!(start(&app), start(&app));

		assert!(
			first.is_ok() != second.is_ok(),
			"exactly one start must produce a session: {first:?} / {second:?}"
		);
		assert!(
			is_refused(&first) || is_refused(&second),
			"the losing start reported something other than a refusal: {first:?} / {second:?}"
		);
		assert_eq!(live_groups().len(), 1, "the refused start spawned a sidecar of its own");

		shutdown_session(app.handle(), app.state::<AgentState>().inner(), &scope()).await;
		terminate_session(app.handle(), app.state::<AgentState>().inner()).await;
		assert!(live_groups().is_empty(), "the sidecar outlived the host it served");
	});
}

#[test]
fn a_start_racing_a_shutdown_never_interleaves() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_IGNORE_EOF", "1");

	let app = app();
	runtime().block_on(async {
		start(&app).await.expect("the session under test starts");

		let (stopped, started) = tokio::join!(shutdown(&app), start(&app));
		assert!(
			!is_refused(&stopped) || !is_refused(&started),
			"both transitions were refused, so neither ever held the seat: {stopped:?} / {started:?}"
		);
		assert!(live_groups().len() <= 1, "the two transitions each spawned a sidecar");

		shutdown_session(app.handle(), app.state::<AgentState>().inner(), &scope()).await;
		terminate_session(app.handle(), app.state::<AgentState>().inner()).await;
		assert!(live_groups().is_empty(), "a sidecar outlived both transitions");
	});

	std::env::remove_var("FAKE_AGENT_IGNORE_EOF");
}

#[test]
fn a_quit_during_a_start_sweeps_the_group_and_closes_the_gate_for_good() {
	let _serial = serial();
	let pid_file = probe_file();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "startup_timeout");
	std::env::set_var("FAKE_AGENT_ORPHAN_AT_STARTUP", "1");
	std::env::set_var("FAKE_AGENT_PID_FILE", &*pid_file);

	let app = app();
	runtime().block_on(async {
		let (started, ()) = tokio::join!(start(&app), async {
			poll_until("the fake to record its grandchild", || recorded_pid(&pid_file).is_some())
				.await;
			let orphan = recorded_pid(&pid_file).expect("the wait only returns once it is there");
			assert!(is_alive(orphan), "the grandchild must be running before the quit");

			terminate_session(app.handle(), app.state::<AgentState>().inner()).await;
			poll_until("the exit sweep to leave no orphan behind", || !is_alive(orphan)).await;
		});

		assert!(
			matches!(started, Err(TransportError::Crashed { .. })),
			"the swept start reported {started:?} instead of the death of its child"
		);
		assert!(live_groups().is_empty(), "the quit left a group behind");
		assert_eq!(
			agent_submit_prompt(app.state::<AgentState>(), scope(), "salut".into(), None).await,
			Err(TransportError::NotStarted),
			"a session reached the state after the quit"
		);

		let after_quit = start(&app).await;
		assert!(is_refused(&after_quit), "a start after the quit was not refused: {after_quit:?}");
		assert!(live_groups().is_empty(), "a start after the quit spawned a child");
	});

	std::env::remove_var("FAKE_AGENT_PID_FILE");
	std::env::remove_var("FAKE_AGENT_ORPHAN_AT_STARTUP");
	std::env::remove_var("FAKE_AGENT_SCENARIO");
	let _ = std::fs::remove_file(&pid_file);
}

#[cfg(unix)]
#[test]
fn a_quit_inside_a_restart_never_installs_the_session_it_was_building() {
	let _serial = serial();
	let opening = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-opening-{}.sock", std::process::id())),
	);
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_IGNORE_EOF", "1");
	std::env::set_var("FAKE_AGENT_SCENARIO", "slow_open");
	std::env::set_var("FAKE_AGENT_OPENING_SOCKET", &*opening);

	let app = app();
	runtime().block_on(async {
		start(&app).await.expect("the session the restart replaces starts");
		let listener = tokio::net::UnixListener::bind(&*opening).expect("the opening socket binds");

		let (restarted, ()) = tokio::join!(start(&app), async {
			opening_signalled(&listener).await;
			terminate_session(app.handle(), app.state::<AgentState>().inner()).await;
		});

		assert!(
			restarted.is_err(),
			"the restart installed a session into a quitting host: {restarted:?}"
		);
		assert!(live_groups().is_empty(), "the sidecar outlived the sweep");
		assert_eq!(
			agent_submit_prompt(app.state::<AgentState>(), scope(), "salut".into(), None).await,
			Err(TransportError::NotStarted),
			"a session reached the state after the quit"
		);
	});

	std::env::remove_var("FAKE_AGENT_SCENARIO");
	std::env::remove_var("FAKE_AGENT_IGNORE_EOF");
	std::env::remove_var("FAKE_AGENT_OPENING_SOCKET");
}

#[test]
fn a_quit_ends_every_bots_session_and_not_only_the_last_one_started() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_IGNORE_EOF", "1");

	let app = app();
	runtime().block_on(async {
		start(&app).await.expect("the first bot starts");
		start_run(&app, another_bots_scope()).await.expect("the second bot starts");

		let running = live_groups();
		assert_eq!(running.len(), 1, "the second bot was served from a sidecar of its own");
		assert!(
			running.iter().all(|pid| is_alive(*pid as i32)),
			"the sidecar the host believes it holds is not running: {running:?}"
		);
		assert_eq!(
			agent_submit_prompt(app.state::<AgentState>(), scope(), "salut".into(), None).await,
			Ok(()),
			"starting the second bot replaced the first one's session"
		);

		terminate_session(app.handle(), app.state::<AgentState>().inner()).await;

		assert!(live_groups().is_empty(), "the quit left a group behind");
		for pid in running {
			poll_until("the sidecar the quit ended to be gone", || !is_alive(pid as i32)).await;
		}
	});

	std::env::remove_var("FAKE_AGENT_IGNORE_EOF");
}

fn heard(app: &App<MockRuntime>) -> Heard {
	let heard: Heard = Arc::default();
	for channel in [EVENT_CHANNEL, UPDATED_EVENT] {
		let kept = heard.clone();
		app.listen(channel, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("a json payload");
			kept.lock().expect("the log").push((channel, payload));
		});
	}
	heard
}

fn turn_outcomes(heard: &Heard) -> Vec<Value> {
	heard
		.lock()
		.expect("the log")
		.iter()
		.filter(|(channel, payload)| {
			*channel == EVENT_CHANNEL
				&& payload["event"]["type"] == "turnEnded"
				&& payload["scope"]["runtimeSessionId"] == "r1"
		})
		.map(|(_, payload)| payload["event"]["ended"]["outcome"].clone())
		.collect()
}

fn conversations_updated(heard: &Heard) -> usize {
	heard.lock().expect("the log").iter().filter(|(channel, _)| *channel == UPDATED_EVENT).count()
}

fn database_of(app: &App<MockRuntime>) -> &db::Database {
	app.state::<db::DatabaseState>().inner().as_ref().expect("the database is open")
}

async fn running_runs(app: &App<MockRuntime>) -> i64 {
	database_of(app)
		.call(|connection| {
			Ok(connection.query_row(
				"SELECT count(*) FROM turn_runs WHERE turn_id = 't1' AND state = 'running'",
				[],
				|row| row.get(0),
			)?)
		})
		.await
		.expect("the runs count")
}

async fn completed_at(app: &App<MockRuntime>) -> Option<i64> {
	database_of(app)
		.call(|connection| {
			Ok(connection.query_row(
				"SELECT completed_at FROM turns WHERE id = 't1'",
				[],
				|row| row.get(0),
			)?)
		})
		.await
		.expect("the turn reads")
}

async fn a_turn_running(app: &App<MockRuntime>) {
	database_of(app)
		.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
		.await
		.expect("the conversation is planted");
	start(app).await.expect("the session under test starts");
	let turn = SubmittedTurn { turn_id: "t1".to_owned(), prompt_id: "p1".to_owned() };
	agent_submit_prompt(app.state::<AgentState>(), scope(), "take your time".into(), Some(turn))
		.await
		.expect("the prompt is taken");
	let deadline = tokio::time::Instant::now() + DEADLINE;
	while running_runs(app).await == 0 {
		assert!(tokio::time::Instant::now() < deadline, "timed out waiting for the run to start");
		tokio::time::sleep(POLL).await;
	}
}

async fn assert_the_run_was_ended(app: &App<MockRuntime>, heard: &Heard, updated_before: usize) {
	assert!(completed_at(app).await.is_some(), "the turn of the ended run was left open");
	assert_eq!(running_runs(app).await, 0, "the ended run is still held as running");
	assert!(
		conversations_updated(heard) > updated_before,
		"the front was not told the conversation changed"
	);
	poll_until("the front to hear the run end", || !turn_outcomes(heard).is_empty()).await;
	assert_eq!(turn_outcomes(heard), ["cancelled"], "the front heard another end of the run");
}

fn ended_mid_turn(end: impl AsyncFnOnce(&App<MockRuntime>)) {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "slow");

	let app = app();
	let heard = heard(&app);
	runtime().block_on(async {
		a_turn_running(&app).await;
		let updated_before = conversations_updated(&heard);

		end(&app).await;

		assert_the_run_was_ended(&app, &heard, updated_before).await;
		shutdown_session(app.handle(), app.state::<AgentState>().inner(), &scope()).await;
		terminate_session(app.handle(), app.state::<AgentState>().inner()).await;
	});

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}

#[test]
fn a_session_replaced_mid_turn_ends_its_run_before_the_new_one_is_installed() {
	ended_mid_turn(async |app| {
		start_run(app, RuntimeScope { epoch: 2, ..scope() })
			.await
			.expect("the replacing session starts");
	});
}

#[test]
fn a_session_shut_down_mid_turn_ends_its_run_as_cancelled() {
	ended_mid_turn(async |app| {
		shutdown_session(app.handle(), app.state::<AgentState>().inner(), &scope()).await;
	});
}

#[test]
fn a_quit_mid_turn_ends_the_run_before_the_sidecar_is_terminated() {
	ended_mid_turn(async |app| {
		terminate_session(app.handle(), app.state::<AgentState>().inner()).await;
	});
}
