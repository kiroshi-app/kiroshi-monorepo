mod common;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::EVENT_CHANNEL;
use kiroshi_app::agent::contract::{AgentEvent, EvolvedBundle, RuntimeScope, ScopedEvent};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::bundles;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::db::repositories::conversations::Bot as StoredBot;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const DEADLINE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(25);

const NAME: &str = "Camille";
const BRIEF: &str = "Answer only in French.";

struct Harness {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	log: Arc<Mutex<Vec<ScopedEvent>>>,
}

fn launch() -> Harness {
	let app = an_app_of_its_own(
		"bundle-evolution",
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
	let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
		.build()
		.expect("window builds");

	let log: Arc<Mutex<Vec<ScopedEvent>>> = Arc::new(Mutex::new(Vec::new()));
	let sink = log.clone();
	app.listen(EVENT_CHANNEL, move |event| {
		if let Ok(parsed) = serde_json::from_str::<ScopedEvent>(event.payload()) {
			sink.lock().expect("event log").push(parsed);
		}
	});

	Harness { app, window, log }
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
		self.log.lock().expect("event log").iter().map(|scoped| scoped.event.clone()).collect()
	}

	fn forget_events(&self) {
		self.log.lock().expect("event log").clear();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[AgentEvent]) -> Option<T>) -> T {
		let deadline = Instant::now() + DEADLINE;
		loop {
			let seen = self.events();
			if let Some(found) = ready(&seen) {
				return found;
			}
			assert!(
				Instant::now() < deadline,
				"waited {DEADLINE:?} for {expected} and only saw {seen:#?}"
			);
			std::thread::sleep(POLL);
		}
	}

	fn create_bot(&self) -> String {
		self.call("conversation_create_bot", json!({ "identity": an_identity() }))
			.expect("the bot is created")["id"]
			.as_str()
			.expect("the bot holds an id")
			.to_owned()
	}

	fn main_chat(&self, bot: &str) -> String {
		self.call("conversation_main_chat", json!({ "botId": bot })).expect("the chat")["id"]
			.as_str()
			.expect("the chat holds an id")
			.to_owned()
	}

	fn open_run(&self, conversation: &str, bot: &str, started_at: i64) -> RuntimeScope {
		let opened = self
			.call(
				"conversation_open_runtime_session",
				json!({
					"conversationId": conversation,
					"botId": bot,
					"startedAt": started_at,
					"reason": Value::Null
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

	fn start_run(&self, conversation: &str, bot: &str, at: i64) -> RuntimeScope {
		let scope = self.open_run(conversation, bot, at);
		self.call(
			"agent_start_or_resume_session",
			json!({ "scope": scope, "resume": Value::Null, "cwd": std::env::temp_dir() }),
		)
		.expect("the run starts");
		scope
	}

	fn end_turn(&self, scope: &RuntimeScope) {
		self.call("agent_submit_prompt", json!({ "scope": scope, "text": "learn something" }))
			.expect("the prompt is taken");
		self.wait_for("the turn to end", ended);
	}

	fn recorded_space(&self, bot: &str) -> String {
		let state = self.app.state::<db::DatabaseState>();
		let database = state.inner().as_ref().expect("the database is open");
		tokio::runtime::Runtime::new()
			.expect("runtime")
			.block_on(database.conversations().oldest_bot_space(bot.to_owned()))
			.expect("the space reads")
			.expect("the bot holds a membership")
	}

	fn recorded_bot(&self, bot: &str) -> StoredBot {
		let state = self.app.state::<db::DatabaseState>();
		let database = state.inner().as_ref().expect("the database is open");
		tokio::runtime::Runtime::new()
			.expect("runtime")
			.block_on(database.conversations().bot(bot.to_owned()))
			.expect("the bot reads")
			.expect("the bot is recorded")
	}
}

fn ended(seen: &[AgentEvent]) -> Option<()> {
	seen.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { .. } => Some(()),
		_ => None,
	})
}

fn evolutions(seen: &[AgentEvent]) -> Vec<AgentEvent> {
	seen.iter().filter(|event| matches!(event, AgentEvent::BotEvolved { .. })).cloned().collect()
}

fn all_three(seen: &[AgentEvent]) -> Option<()> {
	(evolutions(seen).len() == 3).then_some(())
}

fn evolution_of(seen: &[AgentEvent], wanted: EvolvedBundle) -> Option<(String, String)> {
	seen.iter().find_map(|event| match event {
		AgentEvent::BotEvolved { bundle, commit_id, title } if *bundle == wanted => {
			Some((commit_id.clone(), title.clone()))
		}
		_ => None,
	})
}

fn an_identity() -> Value {
	json!({
		"name": NAME,
		"title": "",
		"model": "sonnet",
		"avatarBlot": Value::Null,
		"avatarImagePath": Value::Null,
		"instructions": BRIEF,
		"deniedTools": []
	})
}

fn scenario(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-fake-scenario-{}.txt", std::process::id())),
	);
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, &*path);
	path
}

fn user_plugin(harness: &Harness) -> PathBuf {
	let path = bundles::user::path(harness.app.handle()).expect("the person's plugin path");
	bundles::user::lay_down(&path).expect("the person's plugin is laid down");
	path
}

fn space_plugin(harness: &Harness, space: &str) -> PathBuf {
	let path = bundles::space::path(harness.app.handle(), space).expect("the space's plugin path");
	bundles::space::lay_down_at(&path).expect("the space's plugin is laid down");
	path
}

fn bot_bundle(harness: &Harness, bot: &str) -> PathBuf {
	let root = bundles::root(harness.app.handle()).expect("the bundle root");
	bundles::dir(&root, bot).expect("the bundle is held")
}

fn drop_a_skill(plugin: &Path, name: &str) {
	let skill = plugin.join("skills").join(name);
	std::fs::create_dir_all(&skill).expect("the skill directory is made");
	std::fs::write(skill.join("SKILL.md"), format!("what {name} taught")).expect("the skill lands");
}

fn rewrite_the_brief(agent: &Path, brief: &str) {
	let text = std::fs::read_to_string(agent).expect("the agent file is there");
	let (front, _) = text.rsplit_once("---").expect("the closing fence");
	std::fs::write(agent, format!("{front}---\n\n{brief}\n")).expect("the hand edit lands");
}

#[test]
fn every_bundle_the_turn_changed_is_announced_once() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let _scenario = scenario("evolution");

	let harness = launch();
	let bot = harness.create_bot();
	let conversation = harness.main_chat(&bot);
	let space = harness.recorded_space(&bot);

	let person = user_plugin(&harness);
	let project = space_plugin(&harness, &space);
	let bundle = bot_bundle(&harness, &bot);

	harness.forget_events();
	let first = harness.start_run(&conversation, &bot, 1);
	drop_a_skill(&person, "about-them");
	drop_a_skill(&project, "about-here");
	drop_a_skill(&bundle, "baking");
	let agent = bundle.join("agents").join("agent.md");
	rewrite_the_brief(&agent, "Answer only in Spanish.");
	harness.end_turn(&first);
	harness.wait_for("one event per changed bundle", all_three);

	let announced = harness.events();
	for wanted in [EvolvedBundle::Bot, EvolvedBundle::User, EvolvedBundle::Space] {
		let (commit_id, title) = evolution_of(&announced, wanted)
			.unwrap_or_else(|| panic!("{wanted:?} was not announced"));
		assert!(!commit_id.is_empty(), "{wanted:?} was announced without a commit");
		assert!(!title.is_empty(), "{wanted:?} was announced without a title");
	}
	assert_eq!(
		harness.recorded_bot(&bot).instructions,
		"Answer only in Spanish.",
		"the bot record kept the stale brief"
	);

	harness.forget_events();
	let later = harness.start_run(&conversation, &bot, 2);
	harness.end_turn(&later);
	drop_a_skill(&project, "about-later");
	harness.end_turn(&later);
	harness.wait_for("the turn that changed the space to be announced", |seen| {
		evolution_of(seen, EvolvedBundle::Space).map(drop)
	});

	assert_eq!(
		evolved_bundles(&harness.events()),
		[EvolvedBundle::Space],
		"a quiet turn was announced"
	);
}

fn evolved_bundles(seen: &[AgentEvent]) -> Vec<EvolvedBundle> {
	seen.iter()
		.filter_map(|event| match event {
			AgentEvent::BotEvolved { bundle, .. } => Some(*bundle),
			_ => None,
		})
		.collect()
}
