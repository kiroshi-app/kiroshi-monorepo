mod bundled;
mod common;
mod event_log;

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use bundled::bundled_bots;
use common::{an_app_of_its_own, AppOfItsOwn};
use event_log::EventLog;
use kiroshi_app::agent::commands::EVENT_CHANNEL;
use kiroshi_app::agent::contract::{AgentEvent, RuntimeScope, ScopedEvent, TurnOutcome};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::events::{self, Frame};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::broadcast::{self, error::RecvError};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const DEADLINE: Duration = Duration::from_secs(60);

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

fn a_run(epoch: i64) -> Value {
	json!({
		"conversationId": "c1",
		"botId": "default",
		"runtimeSessionId": format!("r{epoch}"),
		"epoch": epoch
	})
}

struct Harness {
	window: WebviewWindow<MockRuntime>,
	recorder: Arc<Recorder>,
	_app: AppOfItsOwn,
}

fn launch() -> Harness {
	let app = an_app_of_its_own(
		"scoped-runtime",
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &["default", "second"]);
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");

	let recorder = recording(events::subscribed(app.handle()));

	Harness { _app: app, window, recorder }
}

#[derive(Clone)]
enum Relayed {
	Event(Box<ScopedEvent>),
	RecorderStopped,
}

struct Recorder {
	log: EventLog<Relayed>,
	failure: OnceLock<String>,
}

fn recording(heard: broadcast::Receiver<Frame>) -> Arc<Recorder> {
	let recorder = Arc::new(Recorder { log: EventLog::new(), failure: OnceLock::new() });
	let writer = recorder.clone();
	std::thread::spawn(move || writer.record(heard));
	recorder
}

impl Recorder {
	fn record(&self, mut heard: broadcast::Receiver<Frame>) {
		let failure = loop {
			match heard.blocking_recv() {
				Ok(frame) => match agent_event(&frame) {
					Ok(Some(scoped)) => self.log.push(Relayed::Event(Box::new(scoped))),
					Ok(None) => {}
					Err(failure) => break failure,
				},
				Err(RecvError::Closed) => return,
				Err(RecvError::Lagged(missed)) => {
					break format!("the relay dropped {missed} frames")
				}
			}
		};
		self.failure.get_or_init(|| failure);
		self.log.push(Relayed::RecorderStopped);
	}

	fn events(&self) -> Vec<ScopedEvent> {
		heard(&self.log.held())
	}

	fn forget(&self) {
		self.log.forget();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[ScopedEvent]) -> Option<T>) -> T {
		let outcome = self.log.until(DEADLINE, |relayed| match self.failure.get() {
			Some(failure) => Some(Err(failure.clone())),
			None => ready(&heard(relayed)).map(Ok),
		});
		match outcome {
			Some(Ok(found)) => found,
			Some(Err(failure)) => panic!("the relay recorder failed before {expected}: {failure}"),
			None => panic!("waited {DEADLINE:?} for {expected} and only saw {:#?}", self.events()),
		}
	}
}

fn heard(relayed: &[Relayed]) -> Vec<ScopedEvent> {
	relayed
		.iter()
		.filter_map(|entry| match entry {
			Relayed::Event(scoped) => Some(scoped.as_ref().clone()),
			Relayed::RecorderStopped => None,
		})
		.collect()
}

fn agent_event(frame: &str) -> Result<Option<ScopedEvent>, String> {
	let mut framed: Value = serde_json::from_str(frame)
		.map_err(|error| format!("a relay frame is not json: {error}"))?;
	if framed["event"] != EVENT_CHANNEL {
		return Ok(None);
	}
	serde_json::from_value(framed["payload"].take())
		.map(Some)
		.map_err(|error| format!("an agent event does not parse: {error}"))
}

impl Harness {
	fn call(&self, cmd: &str, body: Value) -> Result<Value, Value> {
		tauri::test::get_ipc_response(
			&self.window,
			InvokeRequest {
				cmd: cmd.into(),
				callback: tauri::ipc::CallbackFn(0),
				error: tauri::ipc::CallbackFn(1),
				url: "tauri://localhost".parse().expect("url"),
				body: body.into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		)
		.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
		.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
	}

	fn start(&self, run: &Value) -> Result<Value, Value> {
		self.call(
			"agent_start_or_resume_session",
			json!({ "scope": run, "resume": Value::Null, "cwd": Value::Null }),
		)
	}

	fn prompt_is_taken(&self, run: &Value) {
		assert_eq!(
			self.call("agent_submit_prompt", json!({ "scope": run, "text": "bonjour" })),
			Ok(Value::Null),
			"the live run refused a prompt"
		);
	}

	fn events(&self) -> Vec<ScopedEvent> {
		self.recorder.events()
	}

	fn forget_events(&self) {
		self.recorder.forget();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[ScopedEvent]) -> Option<T>) -> T {
		self.recorder.wait_for(expected, ready)
	}
}

fn a_run_whose_epoch_drifted() -> Value {
	json!({
		"conversationId": "c1",
		"botId": "default",
		"runtimeSessionId": "r1",
		"epoch": 5
	})
}

fn another_bots_run() -> Value {
	json!({
		"conversationId": "c2",
		"botId": "second",
		"runtimeSessionId": "r9",
		"epoch": 1
	})
}

fn named(run: &Value) -> RuntimeScope {
	serde_json::from_value(run.clone()).expect("the scope parses")
}

fn outcome_under(seen: &[ScopedEvent], run: &RuntimeScope) -> Option<TurnOutcome> {
	seen.iter().find_map(|scoped| match (&scoped.scope, &scoped.event) {
		(Some(scope), AgentEvent::TurnEnded { ended }) if scope == run => Some(ended.outcome),
		_ => None,
	})
}

fn spoke_under(seen: &[ScopedEvent], run: &RuntimeScope) -> bool {
	seen.iter().any(|scoped| {
		matches!((&scoped.scope, &scoped.event), (Some(scope), AgentEvent::MessageDelta { .. }) if scope == run)
	})
}

fn turn_outcome(seen: &[ScopedEvent]) -> Option<TurnOutcome> {
	seen.iter().find_map(|scoped| match scoped.event {
		AgentEvent::TurnEnded { ref ended } => Some(ended.outcome),
		_ => None,
	})
}

fn stale(runtime_session_id: &str) -> Result<Value, Value> {
	Err(json!({ "kind": "staleRuntimeSession", "runtimeSessionId": runtime_session_id }))
}

#[test]
fn two_runs_of_one_bot_answer_at_once_and_a_scope_naming_another_epoch_reaches_nothing() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "normal");

	let harness = launch();
	let first = a_run(1);
	let second = a_run(2);
	assert_eq!(harness.start(&first), Ok(json!({ "resumed": false })));
	assert_eq!(
		harness.start(&second),
		Ok(json!({ "resumed": false })),
		"a second instance of one bot was refused a session of its own"
	);

	let drifted = a_run_whose_epoch_drifted();
	assert_eq!(
		harness.call("agent_submit_prompt", json!({ "scope": drifted, "text": "salut" })),
		stale("r1"),
		"a scope naming another epoch submitted a prompt to the run holding its id"
	);
	assert_eq!(
		harness.call("agent_cancel_turn", json!({ "scope": drifted })),
		Ok(json!({ "kind": "failed", "failures": [{
			"botId": drifted["botId"],
			"reason": { "source": "session", "error": stale("r1").expect_err("a refusal") },
		}] })),
		"a scope naming another epoch was answered about the live run's turn"
	);
	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": drifted })),
		stale("r1"),
		"a scope naming another epoch shut down the run holding its id"
	);

	let one = named(&first);
	let other = named(&second);
	harness.forget_events();
	harness.prompt_is_taken(&first);
	harness.prompt_is_taken(&second);

	harness.wait_for("both instances to finish their turn", |seen| {
		outcome_under(seen, &one).zip(outcome_under(seen, &other))
	});
	let streamed = harness.events();
	assert!(
		spoke_under(&streamed, &one) && spoke_under(&streamed, &other),
		"an instance of the bot never streamed under its own run: {streamed:#?}"
	);
	assert!(
		streamed
			.iter()
			.all(|scoped| scoped.scope.as_ref() == Some(&one)
				|| scoped.scope.as_ref() == Some(&other)),
		"an event crossed under a run neither instance was started for: {streamed:#?}"
	);

	assert_eq!(harness.call("agent_shutdown", json!({ "scope": first })), Ok(Value::Null));
	harness.forget_events();
	harness.prompt_is_taken(&second);
	assert_eq!(
		harness.wait_for("the instance left running to finish its turn", |seen| {
			outcome_under(seen, &other)
		}),
		TurnOutcome::Completed,
		"ending one instance stopped the instance beside it"
	);
	assert_eq!(harness.call("agent_shutdown", json!({ "scope": second })), Ok(Value::Null));

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}

#[test]
fn every_event_names_the_run_it_belongs_to_and_a_check_echoes_the_callers() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "normal");

	let harness = launch();
	let run = a_run(1);
	let named: RuntimeScope = serde_json::from_value(run.clone()).expect("the scope parses");

	harness.call("agent_check", json!({ "scope": Value::Null })).expect("the check reports");
	assert!(
		harness.events().iter().all(|scoped| scoped.scope.is_none()),
		"a check made before any run invented one: {:#?}",
		harness.events()
	);

	harness.forget_events();
	harness.call("agent_check", json!({ "scope": run })).expect("the check reports");
	let echoed = harness.events();
	assert!(
		!echoed.is_empty() && echoed.iter().all(|scoped| scoped.scope.as_ref() == Some(&named)),
		"a check answered under a run the caller never named: {echoed:#?}"
	);

	harness.forget_events();
	assert_eq!(harness.start(&run), Ok(json!({ "resumed": false })));
	harness.prompt_is_taken(&run);
	harness.wait_for("the turn to end", turn_outcome);
	let streamed = harness.events();
	assert!(
		streamed.iter().all(|scoped| scoped.scope.as_ref() == Some(&named)),
		"an event crossed under another run than the one that produced it: {streamed:#?}"
	);
	assert!(
		streamed.iter().any(|scoped| matches!(scoped.event, AgentEvent::MessageDelta { .. })),
		"the turn produced nothing to be scoped: {streamed:#?}"
	);

	assert_eq!(harness.call("agent_shutdown", json!({ "scope": run })), Ok(Value::Null));

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}

#[test]
fn two_bots_answer_at_once_and_each_stream_stays_under_its_own_run() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SCENARIO", "normal");

	let harness = launch();
	let first = a_run(1);
	let second = another_bots_run();
	assert_eq!(harness.start(&first), Ok(json!({ "resumed": false })));
	assert_eq!(harness.start(&second), Ok(json!({ "resumed": false })));

	let one = named(&first);
	let other = named(&second);
	harness.forget_events();
	harness.prompt_is_taken(&first);
	harness.prompt_is_taken(&second);

	harness.wait_for("both bots to finish their turn", |seen| {
		outcome_under(seen, &one).zip(outcome_under(seen, &other))
	});
	let streamed = harness.events();
	assert!(
		spoke_under(&streamed, &one) && spoke_under(&streamed, &other),
		"a bot answered under a run that was not its own: {streamed:#?}"
	);
	assert!(
		streamed
			.iter()
			.all(|scoped| scoped.scope.as_ref() == Some(&one)
				|| scoped.scope.as_ref() == Some(&other)),
		"an event crossed under a run neither bot was started for: {streamed:#?}"
	);

	assert_eq!(harness.call("agent_shutdown", json!({ "scope": first })), Ok(Value::Null));
	harness.forget_events();
	harness.prompt_is_taken(&second);
	assert_eq!(
		harness.wait_for("the bot left running to finish its turn", |seen| {
			outcome_under(seen, &other)
		}),
		TurnOutcome::Completed,
		"ending one bot's session stopped the bot beside it"
	);
	assert_eq!(harness.call("agent_shutdown", json!({ "scope": second })), Ok(Value::Null));

	std::env::remove_var("FAKE_AGENT_SCENARIO");
}

fn failure_of(recorder: &Recorder) -> String {
	let started = Instant::now();
	let failure = catch_unwind(AssertUnwindSafe(|| recorder.wait_for("an event", |_| None::<()>)))
		.expect_err("the wait fails once the recorder has failed");
	assert!(started.elapsed() < DEADLINE, "the wait outlived the recorder that failed");
	failure.downcast_ref::<String>().cloned().expect("the panic carries its reason")
}

fn a_recorder_fed(frames: &[&str], capacity: usize) -> Arc<Recorder> {
	let (relay, heard) = broadcast::channel(capacity);
	for frame in frames {
		relay.send(Frame::from(*frame)).expect("the recorder is subscribed");
	}
	recording(heard)
}

#[test]
fn a_relay_that_dropped_frames_fails_the_wait_with_their_count() {
	let frames = [r#"{"event":"other","payload":null}"#; 3];
	let recorder = a_recorder_fed(&frames, 1);
	recorder.forget();
	assert!(failure_of(&recorder).contains("dropped 2 frames"));
}

#[test]
fn a_frame_that_is_not_json_fails_the_wait_with_the_parse_failure() {
	let recorder = a_recorder_fed(&["not json"], 1);
	assert!(failure_of(&recorder).contains("a relay frame is not json"));
}

#[test]
fn an_agent_event_that_does_not_parse_fails_the_wait_with_the_parse_failure() {
	let recorder = a_recorder_fed(&[r#"{"event":"agent://event","payload":{"nope":1}}"#], 1);
	assert!(failure_of(&recorder).contains("an agent event does not parse"));
}
