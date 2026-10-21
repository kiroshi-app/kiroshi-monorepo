mod bundled;
mod common;
mod event_log;

use std::sync::Arc;
use std::time::Duration;

use bundled::bundled_bots;
use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use event_log::EventLog;
use kiroshi_app::agent::commands::EVENT_CHANNEL;
use kiroshi_app::agent::contract::{AgentEvent, RuntimeScope, ScopedEvent, TransportError};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const DEADLINE: Duration = Duration::from_secs(60);

const TURN: &str = "t1";
const BOT: &str = "default";
const SPOKEN: usize = 30;
const ANSWERED: &str = "m2";
const PROMPT: &str = "p1";
const PROMPT_TEXT: &str = "so where does that leave the roof?";

struct Harness {
	_app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	log: Arc<EventLog<ScopedEvent>>,
}

fn launch() -> Harness {
	let app = an_app_of_its_own(
		"bounded-rotation",
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

	Harness { _app: app, window, log }
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

	fn open_run(
		&self,
		conversation: &str,
		started_at: i64,
		rotating: Option<&RuntimeScope>,
		reason: Option<&str>,
	) -> RuntimeScope {
		let opened = self
			.call(
				"conversation_open_runtime_session",
				json!({
					"conversationId": conversation,
					"botId": BOT,
					"startedAt": started_at,
					"runtimeSessionId": rotating.map(|run| run.runtime_session_id.clone()),
					"reason": reason
				}),
			)
			.expect("the run opens");
		RuntimeScope {
			conversation_id: opened["conversationId"].as_str().expect("a conversation").to_owned(),
			bot_id: opened["botId"].as_str().expect("a bot").to_owned(),
			runtime_session_id: opened["id"].as_str().expect("an id").to_owned(),
			epoch: opened["seq"].as_i64().expect("a seq"),
		}
	}

	fn start(&self, scope: &RuntimeScope, resume: Option<&str>) -> Result<Value, Value> {
		self.call(
			"agent_start_or_resume_session",
			json!({
				"scope": scope,
				"resume": resume,
				"cwd": std::env::temp_dir()
			}),
		)
	}

	fn page(&self, conversation: &str) -> Vec<Value> {
		self.call(
			"conversation_message_page",
			json!({ "conversationId": conversation, "beforeSeq": null, "limit": 100 }),
		)
		.expect("the page")["messages"]
			.as_array()
			.expect("the page holds messages")
			.clone()
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

fn turn_ended(seen: &[AgentEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { .. } => Some(()),
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

fn deltas(seen: &[AgentEvent]) -> String {
	seen.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn occurrences(text: &str, needle: &str) -> usize {
	text.matches(needle).count()
}

fn a_chat_with_a_history(harness: &Harness) -> String {
	let chat = harness.call("conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();

	harness
		.call(
			"conversation_start_turn",
			json!({ "turn": { "id": TURN, "conversationId": conversation, "startedAt": 1 } }),
		)
		.expect("the turn is started");
	for index in 1..=SPOKEN {
		said(harness, &conversation, index);
	}
	conversation
}

fn said(harness: &Harness, conversation: &str, index: usize) {
	let id = format!("m{index}");
	let content = format!("message {index}");
	if index % 2 == 1 {
		harness
			.call(
				"conversation_append_user_message",
				json!({ "message": {
					"id": id,
					"conversationId": conversation,
					"turnId": TURN,
					"authorBotId": null,
					"repliedToMessageId": null,
					"content": content,
					"createdAt": index
				}}),
			)
			.expect("the message is appended");
		return;
	}
	harness
		.call(
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": id,
				"conversationId": conversation,
				"turnId": TURN,
				"authorBotId": BOT,
				"repliedToMessageId": null,
				"createdAt": index
			}}),
		)
		.expect("the reply is opened");
	harness
		.call("conversation_append_text", json!({ "id": id, "delta": content }))
		.expect("the reply streams");
	harness
		.call("conversation_finalize_message", json!({ "id": id, "completion": "complete" }))
		.expect("the reply ends");
}

#[test]
fn a_refused_provider_session_is_rotated_and_the_same_chat_carries_on() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);

	let harness = launch();
	let conversation = a_chat_with_a_history(&harness);
	let before = harness.page(&conversation);
	assert_eq!(before.len(), SPOKEN, "the history was not written as it was told");

	let _scenario = scenario("resume_crash");
	let refused_run = harness.open_run(&conversation, 1, None, None);
	assert_eq!(
		harness.start(&refused_run, Some("a session that is gone")),
		Ok(json!({ "resumed": false }))
	);
	assert!(
		harness.wait_for("the refused resume to be reported", resume_failure),
		"the host kept a provider id the child refused"
	);

	let checkpoint = harness
		.call(
			"conversation_capture_checkpoint",
			json!({
				"conversationId": conversation,
				"botId": BOT,
				"runtimeSessionId": refused_run.runtime_session_id,
				"createdAt": 2
			}),
		)
		.expect("the checkpoint is taken");
	assert_eq!(checkpoint["lastMessageSeq"], json!(10), "the checkpoint folded the tail as well");
	assert_eq!(checkpoint["runtimeSessionId"], json!(refused_run.runtime_session_id));
	assert!(checkpoint["tokenCount"].as_i64().is_some_and(|count| count > 0));

	let _scenario = scenario("normal");
	let live = harness.open_run(
		&conversation,
		3,
		Some(&refused_run),
		Some("the provider session was refused"),
	);
	assert_eq!(live.epoch, 2, "the rotation did not continue the lineage");
	assert_ne!(live.runtime_session_id, refused_run.runtime_session_id);
	assert_eq!(harness.start(&live, None), Ok(json!({ "resumed": false })));

	harness
		.call(
			"conversation_append_user_message",
			json!({ "message": {
				"id": PROMPT,
				"conversationId": conversation,
				"turnId": TURN,
				"authorBotId": null,
				"repliedToMessageId": ANSWERED,
				"content": PROMPT_TEXT,
				"createdAt": 4
			}}),
		)
		.expect("the prompt is appended");

	let folded = harness
		.call(
			"conversation_capture_checkpoint",
			json!({
				"conversationId": conversation,
				"botId": BOT,
				"runtimeSessionId": live.runtime_session_id,
				"createdAt": 5
			}),
		)
		.expect("the checkpoint is taken");
	assert_eq!(
		folded["lastMessageSeq"],
		json!(11),
		"the recovery point did not follow the message the tail could no longer reach"
	);

	let context = harness
		.call(
			"conversation_bounded_context",
			json!({
				"conversationId": conversation,
				"botId": BOT,
				"runtimeSessionId": live.runtime_session_id,
				"promptMessageId": PROMPT
			}),
		)
		.expect("the context is rebuilt");
	let context = context.as_str().expect("the context crosses as text").to_owned();

	harness.forget_events();
	harness
		.call("agent_submit_prompt", json!({ "scope": live, "text": context }))
		.expect("the prompt is accepted");
	harness.wait_for("the rebuilt turn to end", turn_ended);

	let told = deltas(&harness.events());
	assert_eq!(told, format!("echo :: {context}"), "the child was told something else");
	assert_eq!(occurrences(&told, PROMPT_TEXT), 1, "the rotation carried the prompt twice");
	assert_eq!(occurrences(&told, "message 3\n"), 1, "the summary lost what it folded");
	assert_eq!(occurrences(&told, "message 30\n"), 1, "the tail lost what was just said");
	assert!(
		told.contains("The message this one replies to:\nuri: kiroshi://c/"),
		"an answer to an earlier message lost the target it points at: {told}"
	);
	assert!(told.ends_with(PROMPT_TEXT), "the prompt was not the last thing the run was told");

	assert!(
		harness.scoped_events().iter().all(|scoped| scoped.scope.as_ref() == Some(&live)),
		"an event crossed under a run other than the one answering: {:#?}",
		harness.scoped_events()
	);
	assert_eq!(
		harness.call("agent_shutdown", json!({ "scope": refused_run })),
		Ok(Value::Null),
		"the run the rotation left behind could not be shut down"
	);
	assert_eq!(
		harness.call("agent_submit_prompt", json!({ "scope": refused_run, "text": "hello" })),
		Err(json!({ "kind": "notStarted" })),
		"a caller reached the run the rotation left behind after it was shut down"
	);

	let after = harness.page(&conversation);
	assert_eq!(after.len(), SPOKEN + 1, "the rotation changed what the reader can see");
	assert_eq!(after[..SPOKEN], before[..], "the rotation moved a row the reader had seen");
	assert_eq!(after[SPOKEN]["id"], json!(PROMPT));
	assert_eq!(after[SPOKEN]["content"], json!(PROMPT_TEXT));

	assert_eq!(harness.call("agent_shutdown", json!({ "scope": live })), Ok(Value::Null));
}

fn agent_events(scoped: &[ScopedEvent]) -> Vec<AgentEvent> {
	scoped.iter().map(|scoped| scoped.event.clone()).collect()
}
