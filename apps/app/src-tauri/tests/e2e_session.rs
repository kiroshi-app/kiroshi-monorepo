mod bundled;
mod common;
mod event_log;

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use bundled::bundled_bots;
use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use event_log::EventLog;
use kiroshi_app::agent::commands::{terminate_session, EVENT_CHANNEL};
use kiroshi_app::agent::contract::{
	AgentEvent, CheckReport, ConnectionState, EventTurn, PermissionDecision, PermissionRequest,
	RuntimeScope, ScopedEvent, TransportError, TurnOutcome,
};
use kiroshi_app::agent::lease::{Lapse, RunLease};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::conversations::contract::{TranscriptMessage, TranscriptPage};
use kiroshi_app::db;
use kiroshi_app::db::repositories::messages::{MessagePageQuery, MessageState, StoredMessage};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const DEADLINE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(25);

struct Harness {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	log: Arc<EventLog<ScopedEvent>>,
	run: Mutex<RuntimeScope>,
}

fn a_run(epoch: i64) -> RuntimeScope {
	RuntimeScope {
		conversation_id: "c1".to_owned(),
		bot_id: "default".to_owned(),
		runtime_session_id: format!("r{epoch}"),
		epoch,
	}
}

fn invoke(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
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

fn serial() -> MutexGuard<'static, ()> {
	static SIDECAR_SETTINGS: Mutex<()> = Mutex::new(());
	SIDECAR_SETTINGS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn launch() -> Harness {
	let app = an_app_of_its_own(
		"e2e",
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &["default"]);
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");

	let log = Arc::new(EventLog::new());
	let sink = log.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.push(parsed);
		}
	});

	Harness { app, window, log, run: Mutex::new(a_run(0)) }
}

impl Harness {
	fn call(&self, cmd: &str, body: Value) -> Result<Value, Value> {
		invoke(&self.window, cmd, body)
	}

	fn quit(&self) {
		let runtime = tokio::runtime::Runtime::new().expect("runtime");
		runtime.block_on(terminate_session(self.app.handle(), &self.app.state::<AgentState>()));
	}

	fn scope(&self) -> Value {
		serde_json::to_value(&*self.run.lock().expect("run")).expect("the scope serializes")
	}

	fn start(&self, resume: Option<&str>) -> Result<Value, Value> {
		assert_eq!(
			self.call("agent_shutdown", json!({ "scope": self.scope() })),
			Ok(Value::Null),
			"the run this one is opened beside could not be shut down"
		);
		{
			let mut run = self.run.lock().expect("run");
			*run = a_run(run.epoch + 1);
		}
		self.call(
			"agent_start_or_resume_session",
			json!({ "scope": self.scope(), "resume": resume, "cwd": std::env::temp_dir() }),
		)
	}

	fn prompt(&self, text: &str) -> Result<Value, Value> {
		self.call("agent_submit_prompt", json!({ "scope": self.scope(), "text": text }))
	}

	fn events(&self) -> Vec<AgentEvent> {
		agent_events(&self.log.held())
	}

	fn scoped_events(&self) -> Vec<ScopedEvent> {
		self.log.held()
	}

	fn forget_events(&self) {
		self.log.forget();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[AgentEvent]) -> Option<T>) -> T {
		self.log.until(DEADLINE, |scoped| ready(&agent_events(scoped))).unwrap_or_else(|| {
			panic!("waited {DEADLINE:?} for {expected} and only saw {:#?}", self.events())
		})
	}
}

fn scenario(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-fake-scenario-{}.txt", std::process::id())),
	);
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, &*path);
	path
}

fn turn_outcome(seen: &[AgentEvent]) -> Option<TurnOutcome> {
	seen.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn session_ready(seen: &[AgentEvent]) -> Option<(String, bool)> {
	seen.iter().find_map(|event| match event {
		AgentEvent::SessionReady { session_id, resumed } => Some((session_id.clone(), *resumed)),
		_ => None,
	})
}

fn permission_request(seen: &[AgentEvent]) -> Option<PermissionRequest> {
	seen.iter().find_map(|event| match event {
		AgentEvent::PermissionRequested { request } => Some(request.clone()),
		_ => None,
	})
}

fn message_started(seen: &[AgentEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		AgentEvent::MessageStarted { .. } => Some(()),
		_ => None,
	})
}

fn resume_failure(seen: &[AgentEvent]) -> Option<bool> {
	seen.iter().find_map(|event| match event {
		AgentEvent::Failed { error: TransportError::ResumeFailed { forgot_session_id } } => {
			Some(*forgot_session_id)
		}
		_ => None,
	})
}

fn permission_resolutions(seen: &[AgentEvent]) -> Vec<(String, PermissionDecision)> {
	seen.iter()
		.filter_map(|event| match event {
			AgentEvent::PermissionResolved { id, decision } => Some((id.clone(), *decision)),
			_ => None,
		})
		.collect()
}

fn deltas(seen: &[AgentEvent]) -> String {
	seen.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn orphan_pid_file() -> RemovedOnDrop {
	RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-e2e-orphan-{}.pid", std::process::id())),
	)
}

#[cfg(unix)]
fn is_alive(pid: i32) -> bool {
	unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(unix)]
fn gone_in_time(pid: i32) -> bool {
	let deadline = Instant::now() + DEADLINE;
	while is_alive(pid) {
		if Instant::now() >= deadline {
			return false;
		}
		std::thread::sleep(POLL);
	}
	true
}

#[cfg(unix)]
fn shut_down_leaving_no_orphan(harness: &Harness) {
	let pid_file = orphan_pid_file();
	let _ = std::fs::remove_file(&pid_file);

	let _scenario = scenario("orphan");
	assert_eq!(harness.start(None), Ok(json!({ "resumed": false })));
	harness.forget_events();
	harness.prompt("lance un enfant").expect("prompt accepted");
	harness.wait_for("the orphan turn to start streaming", message_started);

	let orphan: i32 = std::fs::read_to_string(&pid_file)
		.expect("the fake recorded its grandchild")
		.trim()
		.parse()
		.expect("pid is a number");
	assert!(is_alive(orphan), "the grandchild must be running before the shutdown");

	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": harness.scope() })),
		Ok(Value::Null)
	);
	harness.quit();
	assert!(gone_in_time(orphan), "the grandchild outlived the quit");

	std::env::remove_var("FAKE_AGENT_PID_FILE");
	let _ = std::fs::remove_file(&pid_file);
}

#[cfg(not(unix))]
fn shut_down_leaving_no_orphan(harness: &Harness) {
	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": harness.scope() })),
		Ok(Value::Null)
	);
}

#[test]
fn a_session_streams_survives_a_relaunch_and_leaves_no_orphan() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let pid_file = orphan_pid_file();
	std::env::set_var("FAKE_AGENT_PID_FILE", &*pid_file);
	let _scenario = scenario("normal");

	let first = launch();

	let report: CheckReport = serde_json::from_value(
		first.call("agent_check", json!({ "scope": Value::Null })).expect("check reports"),
	)
	.expect("a check report");
	assert_eq!(report.connection, ConnectionState::Ready);
	assert!(report.authenticated);
	assert_eq!(report.binary_version.as_deref(), Some("2.0.0-fake"));
	assert_eq!(report.error, None);

	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));

	first.forget_events();
	first.prompt("bonjour").expect("prompt accepted");
	assert_eq!(first.wait_for("the first turn to end", turn_outcome), TurnOutcome::Completed);

	let streamed = first.events();
	assert_eq!(deltas(&streamed), "echo :: bonjour");
	let (session_id, resumed) = session_ready(&streamed).expect("the child announced its session");
	assert_eq!(session_id, "fake-session-0001");
	assert!(!resumed, "a fresh launch must not claim a resume");
	assert!(
		first.scoped_events().iter().all(|scoped| scoped.scope.as_ref() == Some(&a_run(1))),
		"an event crossed without naming the run it came from: {:#?}",
		first.scoped_events()
	);

	let _scenario = scenario("permission");
	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));
	first.forget_events();
	first.prompt("ecris un fichier").expect("prompt accepted");
	let request = first.wait_for("the permission request", permission_request);
	assert_eq!(request.tool_name, "Write");
	assert_eq!(
		first.call(
			"agent_respond_to_permission",
			json!({ "scope": first.scope(), "id": request.id, "decision": "allowOnce" })
		),
		Ok(Value::Null)
	);
	assert_eq!(first.wait_for("the approved turn to end", turn_outcome), TurnOutcome::Completed);
	assert_eq!(
		permission_resolutions(&first.events()),
		vec![(request.id, PermissionDecision::AllowOnce)]
	);

	let _scenario = scenario("slow");
	assert_eq!(first.start(None), Ok(json!({ "resumed": false })));
	first.forget_events();
	first.prompt("compte jusqu'a mille").expect("prompt accepted");
	first.wait_for("the slow turn to start streaming", message_started);
	assert_eq!(
		first.call("agent_cancel_turn", json!({ "scope": first.scope() })),
		Ok(json!({ "kind": "cancelled" }))
	);
	assert_eq!(first.wait_for("the cancelled turn to end", turn_outcome), TurnOutcome::Cancelled);
	first.prompt("encore").expect("a cancelled session still accepts a prompt");

	shut_down_leaving_no_orphan(&first);
	drop(first);

	let _scenario = scenario("normal");
	let second = launch();
	assert_eq!(second.start(Some(&session_id)), Ok(json!({ "resumed": true })));
	second.forget_events();
	second.prompt("et avant ?").expect("prompt accepted");
	assert_eq!(second.wait_for("the resumed turn to end", turn_outcome), TurnOutcome::Completed);
	assert_eq!(deltas(&second.events()), format!("resumed {session_id} :: et avant ?"));

	let _scenario = scenario("resume_crash");
	second.forget_events();
	assert_eq!(second.start(Some(&session_id)), Ok(json!({ "resumed": false })));
	assert!(
		second.wait_for("the refused resume to be reported", resume_failure),
		"the frontend was left holding an id the host gave up on"
	);

	assert_eq!(second.call("agent_shutdown", json!({ "scope": second.scope() })), Ok(Value::Null));
}

const BOT: &str = "default";
const PROMPT: &str = "hello";
const STREAMED: &str = "echo :: hello";
const RESUMED: &str = "resumed fake-session-0001 :: hello";

struct Stored {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	conversation_id: String,
	log: Arc<EventLog<ScopedEvent>>,
	_scenario: RemovedOnDrop,
}

fn launch_stored(name: &str, played: &str) -> Stored {
	launch_stored_with(name, played, AgentState::default())
}

fn launch_stored_with(name: &str, played: &str, state: AgentState) -> Stored {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let scenario = scenario(played);
	let app = an_app_of_its_own(
		&format!("e2e-{name}"),
		mock_builder().manage(state).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	bundled_bots(&app, &["default"]);
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");
	let chat =
		invoke(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
	let log = Arc::new(EventLog::new());
	let sink = log.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.push(parsed);
		}
	});
	Stored { app, window, conversation_id, log, _scenario: scenario }
}

impl Stored {
	fn call(&self, cmd: &str, body: Value) -> Result<Value, Value> {
		invoke(&self.window, cmd, body)
	}

	fn scope(&self) -> Value {
		json!({ "conversationId": self.conversation_id, "botId": BOT, "runtimeSessionId": "r1", "epoch": 1 })
	}

	fn start(&self) {
		self.call(
			"agent_start_or_resume_session",
			json!({ "scope": self.scope(), "resume": null, "cwd": std::env::temp_dir() }),
		)
		.expect("the session starts");
	}

	fn submit(&self, turn_id: &str, prompt_id: &str) {
		self.store_prompt(turn_id, prompt_id);
		self.prompt(turn_id, prompt_id).expect("the prompt is accepted");
	}

	fn store_prompt(&self, turn_id: &str, prompt_id: &str) {
		self.call(
			"conversation_start_turn",
			json!({ "turn": { "id": turn_id, "conversationId": self.conversation_id, "startedAt": 1 } }),
		)
		.expect("the turn is started");
		self.call(
			"conversation_append_user_message",
			json!({ "message": {
				"id": prompt_id,
				"conversationId": self.conversation_id,
				"turnId": turn_id,
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": PROMPT,
				"createdAt": 1,
			} }),
		)
		.expect("the prompt is stored");
	}

	fn prompt(&self, turn_id: &str, prompt_id: &str) -> Result<Value, Value> {
		self.call(
			"agent_submit_prompt",
			json!({
				"scope": self.scope(),
				"text": PROMPT,
				"turn": { "turnId": turn_id, "promptId": prompt_id },
			}),
		)
	}

	fn database(&self) -> &db::Database {
		self.app.state::<db::DatabaseState>().inner().as_ref().expect("the database is open")
	}

	fn replies(&self) -> Vec<StoredMessage> {
		let query = MessagePageQuery {
			conversation_id: self.conversation_id.clone(),
			before_seq: None,
			limit: 50,
		};
		tauri::async_runtime::block_on(self.database().messages().page_messages(query))
			.expect("the transcript reads")
			.messages
			.into_iter()
			.filter(|message| message.author_bot_id.as_deref() == Some(BOT))
			.collect()
	}

	fn completed_at(&self, turn_id: &str) -> Option<i64> {
		let turn_id = turn_id.to_owned();
		tauri::async_runtime::block_on(self.database().messages().call(move |connection| {
			Ok(connection.query_row(
				"SELECT completed_at FROM turns WHERE id = ?1",
				[turn_id],
				|row| row.get(0),
			)?)
		}))
		.expect("the turn reads")
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&Self) -> Option<T>) -> T {
		let deadline = Instant::now() + DEADLINE;
		loop {
			if let Some(found) = ready(self) {
				return found;
			}
			assert!(
				Instant::now() < deadline,
				"waited {DEADLINE:?} for {expected}, the replies held {:#?} and the lapses {:?}",
				self.replies(),
				self.lapses()
			);
			std::thread::sleep(POLL);
		}
	}

	fn completed(&self, turn_id: &'static str) -> i64 {
		self.wait_for("the turn to be completed", |stored| stored.completed_at(turn_id))
	}

	fn only_reply(&self) -> StoredMessage {
		let replies = self.replies();
		assert_eq!(replies.len(), 1, "the host wrote other than one reply: {replies:#?}");
		replies.into_iter().next().expect("one reply")
	}

	fn close(self) {
		tauri::async_runtime::block_on(terminate_session(
			self.app.handle(),
			&self.app.state::<AgentState>(),
		));
	}

	fn turn_endings(&self) -> Vec<TurnOutcome> {
		agent_events(&self.log.held())
			.into_iter()
			.filter_map(|event| match event {
				AgentEvent::TurnEnded { ended } => Some(ended.outcome),
				_ => None,
			})
			.collect()
	}

	fn lapses(&self) -> Vec<Lapse> {
		agent_events(&self.log.held())
			.into_iter()
			.filter_map(|event| match event {
				AgentEvent::Failed { error: TransportError::RunLapsed { lapse, .. } } => {
					Some(lapse)
				}
				_ => None,
			})
			.collect()
	}

	fn holds_and_endings(&self) -> Vec<String> {
		agent_events(&self.log.held())
			.into_iter()
			.filter_map(|event| match event {
				AgentEvent::TurnHeld { hold: Some(hold) } => Some(format!("held {}", hold.count)),
				AgentEvent::TurnHeld { hold: None } => Some("released".to_owned()),
				AgentEvent::TurnEnded { ended } => Some(format!("ended {:?}", ended.outcome)),
				AgentEvent::Failed { error: TransportError::RunLapsed { lapse, .. } } => {
					Some(format!("lapsed {lapse:?}"))
				}
				_ => None,
			})
			.collect()
	}

	fn awaited_turn_endings(&self, expected: &[TurnOutcome]) -> Vec<TurnOutcome> {
		self.wait_for(&format!("the turn endings {expected:?}"), |stored| {
			let endings = stored.turn_endings();
			(endings.len() >= expected.len()).then_some(endings)
		})
	}

	fn awaited_lapses(&self, expected: &[Lapse]) -> Vec<Lapse> {
		self.wait_for(&format!("the lapses {expected:?}"), |stored| {
			let lapses = stored.lapses();
			(lapses.len() >= expected.len()).then_some(lapses)
		})
	}

	fn reply_of(&self, turn_id: &str) -> Option<StoredMessage> {
		self.replies().into_iter().find(|reply| reply.turn_id == turn_id)
	}

	fn completed_reply_reading(&self, text: &str) -> StoredMessage {
		self.wait_for(&format!("the completed reply {text:?}"), |stored| {
			stored
				.replies()
				.into_iter()
				.find(|reply| reply.content == text && reply.state == MessageState::Complete)
		})
	}

	fn transcript_after_a_relaunch(&self) -> Vec<TranscriptMessage> {
		let reopened = db::bootstrap(self.app.handle()).expect("the database reopens");
		let query = MessagePageQuery {
			conversation_id: self.conversation_id.clone(),
			before_seq: None,
			limit: 50,
		};
		let page = tauri::async_runtime::block_on(reopened.messages().page_messages(query))
			.expect("the transcript reads");
		TranscriptPage::of(self.conversation_id.clone(), page).messages
	}

	fn turn_named_for(&self, text: &str) -> Option<EventTurn> {
		self.log.held().into_iter().find_map(|scoped| match scoped.event {
			AgentEvent::MessageCompleted { message } if message.text == text => scoped.turn,
			_ => None,
		})
	}
}

const SHORT_LEASE: RunLease = RunLease {
	silence: Duration::from_millis(800),
	interrupt_answer: Duration::from_millis(200),
	tasks_pending: Duration::from_secs(600),
};

const SHORT_TASK_BOUND: RunLease = RunLease {
	silence: Duration::from_secs(30),
	interrupt_answer: Duration::from_millis(200),
	tasks_pending: Duration::from_millis(400),
};

const FOLLOW_UP: &str = "the background shell finished";
const SECOND_FOLLOW_UP: &str = "the second background shell finished";

fn launch_leased(name: &str, played: &str) -> Stored {
	launch_stored_with(name, played, AgentState::leasing(SHORT_LEASE))
}

fn outlast_the_lease() {
	std::thread::sleep(SHORT_LEASE.silence * 2);
}

#[test]
fn a_query_that_never_answers_loses_its_lease_and_the_next_prompt_still_gets_a_whole_reply() {
	let _serial = serial();
	let stored = launch_leased("lease-hung", "hung_query");
	stored.start();

	stored.submit("t1", "p1");
	stored.wait_for("the streamed reply", |stored| stored.reply_of("t1"));
	stored.call("agent_cancel_turn", json!({ "scope": stored.scope() })).expect("cancelled");
	let failed_at = stored.completed("t1");
	let failed = stored.only_reply();
	assert_eq!(failed.state, MessageState::Failed);

	stored.submit("t2", "p2");
	stored.completed("t2");
	outlast_the_lease();

	assert_eq!(stored.completed_at("t1"), Some(failed_at));
	assert_eq!(stored.reply_of("t1"), Some(failed));
	let answered = stored.reply_of("t2").expect("the next turn replied");
	assert_eq!(answered.content, RESUMED);
	assert_eq!(answered.state, MessageState::Complete);
	assert_eq!(stored.turn_endings(), vec![TurnOutcome::Failed, TurnOutcome::Completed]);
	assert_eq!(
		stored.awaited_lapses(&[Lapse::InterruptUnanswered]),
		vec![Lapse::InterruptUnanswered]
	);
	stored.close();
}

#[test]
fn a_sidecar_silent_past_its_lease_then_replaying_its_query_changes_neither_turn() {
	let _serial = serial();
	let stored = launch_leased("lease-silent", "silent_replay");
	stored.start();

	stored.submit("t1", "p1");
	let failed_at = stored.completed("t1");
	let failed = stored.only_reply();
	assert_eq!(failed.content, STREAMED);
	assert_eq!(failed.state, MessageState::Failed);
	assert_eq!(stored.awaited_lapses(&[Lapse::Silent]), vec![Lapse::Silent]);

	stored.submit("t2", "p2");
	stored.completed("t2");
	outlast_the_lease();

	assert_eq!(stored.completed_at("t1"), Some(failed_at));
	assert_eq!(stored.reply_of("t1"), Some(failed));
	let replies: Vec<_> =
		stored.replies().into_iter().filter(|reply| reply.turn_id == "t2").collect();
	assert_eq!(replies.len(), 1, "the replayed query wrote into the next turn: {replies:#?}");
	assert_eq!(replies[0].content, RESUMED);
	assert_eq!(replies[0].state, MessageState::Complete);
	assert_eq!(stored.turn_endings(), vec![TurnOutcome::Failed, TurnOutcome::Completed]);
	assert!(
		permission_request(&agent_events(&stored.log.held())).is_none(),
		"the replayed permission reached the front"
	);
	assert_eq!(stored.awaited_lapses(&[Lapse::Silent]), vec![Lapse::Silent]);
	stored.close();
}

#[test]
fn a_run_ending_before_its_lease_stays_completed() {
	let _serial = serial();
	let stored = launch_leased("lease-answered", "normal");
	stored.start();

	stored.submit("t1", "p1");
	let completed_at = stored.completed("t1");
	outlast_the_lease();

	assert_eq!(stored.completed_at("t1"), Some(completed_at));
	assert_eq!(stored.only_reply().state, MessageState::Complete);
	assert_eq!(stored.turn_endings(), vec![TurnOutcome::Completed]);
	stored.close();
}

#[test]
fn a_result_with_no_background_task_settles_its_turn_as_before() {
	let _serial = serial();
	let stored = launch_stored("settled-at-once", "normal");
	stored.start();

	stored.submit("t1", "p1");
	stored.completed("t1");

	assert_eq!(
		stored.awaited_turn_endings(&[TurnOutcome::Completed]),
		vec![TurnOutcome::Completed]
	);
	assert_eq!(stored.only_reply().content, STREAMED);
	assert_eq!(stored.only_reply().state, MessageState::Complete);
	stored.close();
}

#[test]
fn a_turn_holding_a_background_task_ends_only_after_the_follow_up_turn_it_runs() {
	let _serial = serial();
	let stored = launch_stored("background-task", "background_task");
	stored.start();

	stored.submit("t1", "p1");
	stored.completed("t1");
	stored.awaited_turn_endings(&[TurnOutcome::Completed]);

	let events = agent_events(&stored.log.held());
	let follow_up_at = events
		.iter()
		.position(
			|event| matches!(event, AgentEvent::MessageCompleted { message } if message.text == FOLLOW_UP),
		)
		.expect("the follow-up turn reached the front");
	let ended_at = events
		.iter()
		.position(|event| matches!(event, AgentEvent::TurnEnded { .. }))
		.expect("the turn ended");
	assert!(follow_up_at < ended_at, "the turn ended before its follow-up: {events:#?}");
	let pending: Vec<u32> = events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::TasksPending { count } => Some(*count),
			_ => None,
		})
		.collect();
	assert_eq!(pending, vec![1, 0], "each tasks_pending frame reaches the listeners once");
	assert_eq!(stored.turn_endings(), vec![TurnOutcome::Completed]);
	assert!(stored.lapses().is_empty());
	assert_eq!(stored.holds_and_endings(), ["held 1", "released", "ended Completed"]);
	stored.close();
}

#[test]
fn a_follow_up_after_a_settled_turn_is_a_continuation_of_it_read_back_after_a_relaunch() {
	let _serial = serial();
	let stored = launch_stored("follow-up-settled", "follow_up_after_settle");
	stored.start();

	stored.submit("t1", "p1");
	stored.completed("t1");
	let follow_up = stored.completed_reply_reading(FOLLOW_UP);

	assert_ne!(follow_up.turn_id, "t1", "the follow-up was written into the settled turn");
	assert_eq!(follow_up.continues_turn_id.as_deref(), Some("t1"));
	assert_eq!(follow_up.replied_to_message_ids, ["p1"]);
	stored.wait_for("the continuation completed", |stored| stored.completed_at(&follow_up.turn_id));
	let named = stored.turn_named_for(FOLLOW_UP).expect("the follow-up names its turn");
	assert_eq!(named.turn_id, follow_up.turn_id);
	assert_eq!(named.continues_turn_id.as_deref(), Some("t1"));
	assert_eq!(stored.reply_of("t1").expect("the answer").content, STREAMED);

	let transcript = stored.transcript_after_a_relaunch();
	let read_back = transcript
		.iter()
		.find(|message| message.id == follow_up.id)
		.expect("the relaunch reads the follow-up");
	assert_eq!(read_back.continues_turn_id.as_deref(), Some("t1"));
	let answer = transcript
		.iter()
		.find(|message| message.turn_id == "t1" && message.author_bot_id.is_some());
	assert_eq!(answer.expect("the relaunch reads the answer").continues_turn_id, None);
	stored.close();
}

#[test]
fn a_prompt_sent_while_a_follow_up_streams_leaves_both_replies_whole() {
	let _serial = serial();
	let stored = launch_stored("follow-up-overtaken", "follow_up_then_prompt");
	stored.start();
	stored.submit("t1", "p1");
	stored.completed("t1");
	let streaming = stored.wait_for("the follow-up streaming", |stored| {
		stored.replies().into_iter().find(|reply| reply.turn_id != "t1")
	});

	stored.submit("t2", "p2");
	stored.completed("t2");

	let follow_up = stored.completed_reply_reading(FOLLOW_UP);
	assert_eq!(follow_up.id, streaming.id);
	assert_eq!(follow_up.turn_id, streaming.turn_id);
	assert_eq!(follow_up.continues_turn_id.as_deref(), Some("t1"));
	assert!(stored.completed_at(&follow_up.turn_id).is_some(), "the continuation was left open");
	let answer = stored.reply_of("t2").expect("the prompt sent during the follow-up is answered");
	assert_eq!(answer.content, STREAMED);
	assert_eq!(answer.state, MessageState::Complete);
	assert_eq!(answer.continues_turn_id, None);
	assert_eq!(
		stored.awaited_turn_endings(&[TurnOutcome::Completed; 3]),
		vec![TurnOutcome::Completed; 3]
	);
	stored.close();
}

#[test]
fn a_follow_up_landing_while_a_prompt_is_submitting_is_a_continuation_and_leaves_the_prompt_its_own_reply(
) {
	let _serial = serial();
	let stored = launch_stored("follow-up-racing", "follow_up_races_a_prompt");
	stored.start();
	stored.submit("t1", "p1");
	stored.completed("t1");
	stored.awaited_turn_endings(&[TurnOutcome::Completed]);

	stored.submit("t2", "p2");
	stored.completed("t2");

	let follow_up = stored.completed_reply_reading(FOLLOW_UP);
	assert_ne!(follow_up.turn_id, "t2", "the follow-up was written into the submitted turn");
	assert_eq!(follow_up.continues_turn_id.as_deref(), Some("t1"));
	let named = stored.turn_named_for(FOLLOW_UP).expect("the follow-up names its turn");
	assert_eq!(named.turn_id, follow_up.turn_id);
	let answers: Vec<_> =
		stored.replies().into_iter().filter(|reply| reply.turn_id == "t2").collect();
	assert_eq!(answers.len(), 1, "{answers:#?}");
	assert_eq!(answers[0].content, STREAMED);
	assert_eq!(answers[0].state, MessageState::Complete);
	assert_eq!(answers[0].continues_turn_id, None);
	assert_eq!(
		stored.awaited_turn_endings(&[TurnOutcome::Completed; 3]),
		vec![TurnOutcome::Completed; 3]
	);
	stored.close();
}

#[test]
fn two_queued_follow_ups_are_two_continuations_each_with_its_own_completion() {
	let _serial = serial();
	let stored = launch_stored("follow-ups-queued", "two_follow_ups");
	stored.start();

	stored.submit("t1", "p1");
	stored.completed("t1");
	let first = stored.completed_reply_reading(FOLLOW_UP);
	let second = stored.completed_reply_reading(SECOND_FOLLOW_UP);

	assert_ne!(first.turn_id, second.turn_id);
	for follow_up in [&first, &second] {
		assert_ne!(follow_up.turn_id, "t1");
		assert_eq!(follow_up.continues_turn_id.as_deref(), Some("t1"));
		stored.wait_for("the continuation completed", |stored| {
			stored.completed_at(&follow_up.turn_id)
		});
	}
	stored.close();
}

#[test]
fn a_background_task_that_never_ends_fails_the_run_at_its_bound_and_closes_the_session() {
	let _serial = serial();
	let stored =
		launch_stored_with("endless-task", "endless_task", AgentState::leasing(SHORT_TASK_BOUND));
	stored.start();

	stored.submit("t1", "p1");
	stored.completed("t1");

	assert_eq!(stored.awaited_turn_endings(&[TurnOutcome::Failed]), vec![TurnOutcome::Failed]);
	assert_eq!(stored.awaited_lapses(&[Lapse::TasksPending]), vec![Lapse::TasksPending]);
	assert_eq!(
		stored.holds_and_endings(),
		["held 1", "released", "ended Failed", "lapsed TasksPending"]
	);

	stored.submit("t2", "p2");
	stored.completed("t2");
	let answered = stored.reply_of("t2").expect("the reopened session replied");
	assert_eq!(answered.content, RESUMED);
	assert_eq!(
		stored.awaited_turn_endings(&[TurnOutcome::Failed, TurnOutcome::Completed]),
		vec![TurnOutcome::Failed, TurnOutcome::Completed]
	);
	stored.close();
}

#[test]
fn a_result_held_with_no_task_and_no_idle_fails_the_run_at_its_bound() {
	let _serial = serial();
	let stored = launch_stored_with(
		"unsettled-result",
		"unsettled_result",
		AgentState::leasing(SHORT_TASK_BOUND),
	);
	stored.start();

	stored.submit("t1", "p1");
	stored.completed("t1");

	assert_eq!(stored.awaited_turn_endings(&[TurnOutcome::Failed]), vec![TurnOutcome::Failed]);
	assert_eq!(stored.awaited_lapses(&[Lapse::TasksPending]), vec![Lapse::TasksPending]);
	stored.close();
}

#[test]
fn a_run_waiting_on_the_person_outlives_its_lease() {
	let _serial = serial();
	let stored = launch_leased("lease-permission", "permission");
	stored.start();

	stored.submit("t1", "p1");
	let request = stored.log.until(DEADLINE, |scoped| permission_request(&agent_events(scoped)));
	let request = request.expect("the permission is requested");
	outlast_the_lease();
	assert_eq!(stored.completed_at("t1"), None, "the lease ended a run waiting on the person");
	assert!(stored.turn_endings().is_empty());

	stored
		.call(
			"agent_respond_to_permission",
			json!({ "scope": stored.scope(), "id": request.id, "decision": "allowOnce" }),
		)
		.expect("the permission is answered");
	stored.completed("t1");
	assert_eq!(stored.turn_endings(), vec![TurnOutcome::Completed]);
	stored.close();
}

#[test]
fn the_host_persists_a_whole_turn_with_no_window_and_no_listener() {
	let _serial = serial();
	let stored = launch_stored("unheard", "normal");
	stored.start();

	stored.submit("t1", "p1");
	stored.window.destroy().expect("the window closes");
	stored.completed("t1");

	let reply = stored.only_reply();
	assert_eq!(reply.content, STREAMED);
	assert_eq!(reply.state, MessageState::Complete);
	assert_eq!(reply.turn_id, "t1");
	assert_eq!(reply.replied_to_message_ids, ["p1"]);
	stored.close();
}

#[test]
fn the_front_writing_a_reply_the_host_owns_changes_nothing() {
	let _serial = serial();
	let stored = launch_stored("owned", "stalled_reply");
	stored.start();

	stored.submit("t2", "p2");
	let streamed = stored.wait_for("the streamed reply", |stored| {
		stored.replies().into_iter().find(|reply| reply.content == STREAMED)
	});
	let id = streamed.id.clone();
	let front_writes = [
		(
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": id,
				"conversationId": stored.conversation_id,
				"turnId": "t2",
				"authorBotId": BOT,
				"repliedToMessageId": "p2",
				"createdAt": 2,
			} }),
		),
		("conversation_append_text", json!({ "id": id, "delta": STREAMED })),
		(
			"conversation_finalize_message",
			json!({ "id": id, "completion": "complete", "settledText": null }),
		),
		("conversation_complete_turn", json!({ "id": "t2", "completedAt": 5 })),
	];
	for (command, body) in front_writes {
		assert!(stored.call(command, body).is_ok(), "{command} refused a host-owned write");
	}

	assert_eq!(stored.only_reply(), streamed, "a front write moved the host-owned reply");
	assert_eq!(stored.completed_at("t2"), None, "the front completed a turn the host owns");

	stored.call("agent_cancel_turn", json!({ "scope": stored.scope() })).expect("cancelled");
	assert_ne!(stored.completed("t2"), 5);
	let settled = stored.only_reply();
	assert_eq!(settled.content, STREAMED);
	assert_eq!(settled.state, MessageState::Cancelled);
	stored.close();
}

#[test]
fn a_sidecar_dying_mid_reply_leaves_it_failed_and_the_turn_completed() {
	let _serial = serial();
	let stored = launch_stored("dying", "crash_mid_reply");
	stored.start();

	stored.submit("t3", "p3");
	stored.completed("t3");

	let reply = stored.only_reply();
	assert_eq!(reply.content, STREAMED);
	assert_eq!(reply.state, MessageState::Failed);
	stored.close();
}

#[test]
fn a_prompt_the_sidecar_never_received_leaves_its_turn_completed() {
	let _serial = serial();
	let stored = launch_stored("unsent", "normal");
	stored.start();
	let sidecar = tauri::async_runtime::block_on(stored.app.state::<AgentState>().sidecar())
		.expect("the sidecar runs");
	tauri::async_runtime::block_on(sidecar.shutdown());

	stored.store_prompt("t4", "p4");
	assert!(stored.prompt("t4", "p4").is_err(), "a sidecar that is gone accepted a prompt");

	stored.completed("t4");
	assert!(
		stored.replies().iter().all(|reply| reply.state != MessageState::Pending),
		"a reply of the refused turn was left pending"
	);
	stored.close();
}

#[test]
fn cancelling_a_live_session_before_any_submit_closes_the_turn_the_host_opened() {
	let _serial = serial();
	let stored = launch_stored("unsubmitted", "normal");
	stored.start();
	stored
		.call(
			"conversation_send_user_message",
			json!({ "message": {
				"id": "p1",
				"conversationId": stored.conversation_id,
				"turnId": "t1",
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": "hello",
				"createdAt": 1,
			}, "summoned": [BOT] }),
		)
		.expect("the message is sent");

	let cancelled = stored.call("agent_cancel_turn", json!({ "scope": stored.scope() }));

	assert_eq!(cancelled, Ok(json!({ "kind": "nothingToCancel" })));
	assert!(stored.completed_at("t1").is_some(), "the unsubmitted host turn was left open");
	stored.close();
}

fn agent_events(scoped: &[ScopedEvent]) -> Vec<AgentEvent> {
	scoped.iter().map(|scoped| scoped.event.clone()).collect()
}
