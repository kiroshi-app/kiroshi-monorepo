mod common;
mod event_log;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use event_log::EventLog;
use kiroshi_app::agent::commands::EVENT_CHANNEL;
use kiroshi_app::agent::contract::{AgentEvent, EvolvedBundle, RuntimeScope, ScopedEvent};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::bundles;
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
const NAME: &str = "Camille";
const FRENCH: &str = "Answer only in French.";
const DUTCH: &str = "Answer only in Dutch.";
const SPANISH: &str = "Answer only in Spanish.";
const DESK: &str = "TICKET_DESK";

struct Harness {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	log: Arc<EventLog<ScopedEvent>>,
}

fn launch() -> Harness {
	launch_as("runtime-identity")
}

fn launch_as(name: &str) -> Harness {
	let app = an_app_of_its_own(
		name,
		mock_builder().manage(AgentState::default()).invoke_handler(invoke_handler()),
	);
	app.manage(db::bootstrap(app.handle()));
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
		agent_events(&self.log.held())
	}

	fn forget_events(&self) {
		self.log.forget();
	}

	fn wait_for<T>(&self, expected: &str, ready: impl Fn(&[AgentEvent]) -> Option<T>) -> T {
		self.log.until(DEADLINE, |scoped| ready(&agent_events(scoped))).unwrap_or_else(|| {
			panic!("waited {DEADLINE:?} for {expected} and only saw {:#?}", self.events())
		})
	}

	fn create_bot(&self) -> String {
		self.call("conversation_create_bot", json!({ "identity": an_identity(None) }))
			.expect("the bot is created")["id"]
			.as_str()
			.expect("the bot holds an id")
			.to_owned()
	}

	fn describe(&self, bot: &str, instructions: &str) {
		self.call(
			"conversation_update_bot",
			json!({ "id": bot, "identity": an_identity(Some(instructions)) }),
		)
		.expect("the bot is described");
	}

	fn first_space(&self) -> String {
		self.call("space_list", json!({})).expect("the spaces")[0]["id"]
			.as_str()
			.expect("the space holds an id")
			.to_owned()
	}

	fn create_space(&self, name: &str) -> String {
		self.call("space_create", json!({ "name": name })).expect("the space is created")["id"]
			.as_str()
			.expect("the space holds an id")
			.to_owned()
	}

	fn solo_thread(&self, bot: &str, space: Option<&str>) -> String {
		let opened = self
			.call("conversation_main_chat", json!({ "botId": bot, "spaceId": space }))
			.expect("the solo thread");
		let conversation = opened["id"].as_str().expect("the thread holds an id").to_owned();
		self.call(
			"conversation_start_turn",
			json!({
				"turn": { "id": format!("{TURN}-{conversation}"),
					"conversationId": &conversation, "startedAt": 1 }
			}),
		)
		.expect("the turn is started");
		conversation
	}

	fn define(&self, space: &str, value: &str) {
		self.call(
			"env_set",
			json!({
				"scope": { "kind": "space", "id": space },
				"name": DESK,
				"value": value
			}),
		)
		.expect("the variable is set");
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

	fn start(&self, scope: &RuntimeScope, cwd: Value) {
		assert_eq!(
			self.call(
				"agent_start_or_resume_session",
				json!({ "scope": scope, "resume": Value::Null, "cwd": cwd }),
			),
			Ok(json!({ "resumed": false })),
			"the run did not start"
		);
	}

	fn runtime_of(&self, conversation: &str, bot: &str, at: i64) -> Answer {
		self.runtime_in(conversation, bot, at, json!(std::env::temp_dir()))
	}

	fn runtime_in(&self, conversation: &str, bot: &str, at: i64, cwd: Value) -> Answer {
		let scope = self.started(conversation, bot, at, cwd);
		self.answer_of(&scope)
	}

	fn started(&self, conversation: &str, bot: &str, at: i64, cwd: Value) -> RuntimeScope {
		self.forget_events();
		let scope = self.open_run(conversation, bot, at);
		self.start(&scope, cwd);
		scope
	}

	fn answer_of(&self, scope: &RuntimeScope) -> Answer {
		self.call("agent_submit_prompt", json!({ "scope": scope, "text": "who are you?" }))
			.expect("the prompt is taken");
		self.wait_for("the child to say what it was started as", answered)
	}
}

#[derive(Debug)]
struct Answer {
	spoken: String,
	from: String,
}

fn answered(seen: &[AgentEvent]) -> Option<Answer> {
	seen.iter().find_map(|event| match event {
		AgentEvent::MessageCompleted { message } if !message.text.is_empty() => {
			Some(Answer { spoken: message.text.clone(), from: message.id.clone() })
		}
		_ => None,
	})
}

fn bot_write_recorded(seen: &[AgentEvent]) -> Option<()> {
	seen.iter()
		.any(|event| matches!(event, AgentEvent::BotEvolved { bundle: EvolvedBundle::Bot, .. }))
		.then_some(())
}

fn an_identity(instructions: Option<&str>) -> Value {
	json!({
		"name": NAME,
		"title": "",
		"model": "sonnet",
		"avatarBlot": Value::Null,
		"avatarImagePath": Value::Null,
		"instructions": instructions.unwrap_or_default(),
		"deniedTools": []
	})
}

fn bundle_name_of(harness: &Harness, bot: &str) -> String {
	bundle_of(harness, bot)
		.file_name()
		.expect("the bundle directory")
		.to_string_lossy()
		.into_owned()
}

fn bundle_of(harness: &Harness, bot: &str) -> PathBuf {
	let root = bundles::root(harness.app.handle()).expect("the bundle root");
	bundles::dir(&root, bot).expect("the bundle is held")
}

fn a_bot_plugin(bot_id: &str) -> Value {
	json!({ "kind": "bot", "id": bot_id })
}

fn stored_bot(harness: &Harness, bot: &str) -> Value {
	let listed = harness.call("conversation_bots", json!({})).expect("the roster");
	listed
		.as_array()
		.and_then(|bots| bots.iter().find(|listed| listed["id"] == bot).cloned())
		.expect("the bot is on the roster")
}

fn rewrite_the_brief(agent: &Path, brief: &str) {
	let text = std::fs::read_to_string(agent).expect("the agent file is there");
	let (front, _) = text.rsplit_once("---").expect("the closing fence");
	std::fs::write(agent, format!("{front}---\n\n{brief}\n")).expect("the hand edit lands");
}

fn listed_plugins(harness: &Harness) -> Vec<(String, String)> {
	let root = bundles::root(harness.app.handle()).expect("the bundle root");
	let text = std::fs::read_to_string(bundles::marketplace_file(&root)).unwrap_or_default();
	let listed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
	listed["plugins"]
		.as_array()
		.map(|plugins| {
			plugins
				.iter()
				.map(|plugin| {
					(
						plugin["name"].as_str().unwrap_or_default().to_owned(),
						plugin["source"].as_str().unwrap_or_default().to_owned(),
					)
				})
				.collect()
		})
		.unwrap_or_default()
}

fn as_the_child_sees_it(dir: &Path) -> String {
	dir.canonicalize().unwrap_or_else(|_| dir.to_owned()).display().to_string()
}

fn briefed(brief: &str) -> String {
	format!("system<{brief}>")
}

fn told() -> String {
	format!("told<You are {NAME}.")
}

fn serial() -> MutexGuard<'static, ()> {
	static SIDECAR_SETTINGS: Mutex<()> = Mutex::new(());
	SIDECAR_SETTINGS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn scenario(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-fake-scenario-{}.txt", std::process::id())),
	);
	let staged = path.with_extension(format!("{:?}.staging", std::thread::current().id()));
	std::fs::write(&staged, name).expect("the scenario is written");
	std::fs::rename(&staged, &path).expect("the scenario is put in place");
	std::env::set_var(SCENARIO_ENV, &*path);
	path
}

#[test]
fn every_run_carries_the_identity_the_bot_holds_when_it_starts() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let _scenario = scenario("identity");

	let harness = launch();
	let bot = harness.create_bot();
	let conversation = harness.main_chat(&bot);
	harness
		.call(
			"conversation_start_turn",
			json!({ "turn": { "id": TURN, "conversationId": conversation, "startedAt": 1 } }),
		)
		.expect("the turn is started");

	harness.describe(&bot, FRENCH);
	let first = harness.runtime_of(&conversation, &bot, 1);
	assert!(first.spoken.contains(&briefed(FRENCH)), "got {}", first.spoken);
	assert!(
		first.spoken.contains(&told()),
		"the open request does not name the bot: {}",
		first.spoken
	);
	assert!(first.spoken.contains("You are not Claude Code"), "got {}", first.spoken);
	assert!(
		first.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&std::env::temp_dir()))),
		"got {}",
		first.spoken
	);

	harness.describe(&bot, DUTCH);
	let rotated = harness.runtime_in(&conversation, &bot, 2, Value::Null);
	assert!(rotated.spoken.contains(&briefed(DUTCH)), "got {}", rotated.spoken);
	let its_own = harness.app.path().app_data_dir().expect("the app data").join("runs").join(&bot);
	assert!(
		rotated.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&its_own))),
		"got {}",
		rotated.spoken
	);
	assert_ne!(rotated.from, first.from, "the new identity landed in the same process");

	harness.describe(&bot, "");
	let plain = harness.runtime_of(&conversation, &bot, 3);
	assert!(!plain.spoken.contains(DUTCH), "got {}", plain.spoken);
	assert!(plain.spoken.contains(&told()), "got {}", plain.spoken);
	assert!(
		plain.spoken.contains(&format!("cwd<{}>", as_the_child_sees_it(&std::env::temp_dir()))),
		"got {}",
		plain.spoken
	);

	harness.describe(&bot, DUTCH);
	let bundle = bundle_of(&harness, &bot);
	let agent = bundle.join("agents").join("agent.md");
	let written = std::fs::read_to_string(&agent).expect("the agent file is there");
	assert!(written.contains(DUTCH), "got {written}");
	assert!(
		!written.contains("You are not Claude Code"),
		"the host's text is in the bundle: {written}"
	);
	assert!(!written.contains("skills:"), "got {written}");
	assert!(!written.contains("permissionMode"), "got {written}");

	let named = bundle_name_of(&harness, &bot);
	assert_eq!(listed_plugins(&harness), vec![(named.clone(), format!("./plugins/{named}"))]);

	let skill = bundle.join("skills").join("baking").join("SKILL.md");
	std::fs::create_dir_all(skill.parent().expect("the skill directory")).expect("made");
	std::fs::write(&skill, "how to bake").expect("the skill is dropped in");
	rewrite_the_brief(&agent, FRENCH);
	harness.describe(&bot, DUTCH);
	assert_eq!(std::fs::read_to_string(&skill).ok().as_deref(), Some("how to bake"));
	let kept = std::fs::read_to_string(&agent).expect("the agent file is there");
	assert!(kept.contains(FRENCH), "the hand edited brief was written over: {kept}");

	rewrite_the_brief(&agent, SPANISH);
	let edited = harness.runtime_of(&conversation, &bot, 5);
	assert!(edited.spoken.contains(&briefed(SPANISH)), "got {}", edited.spoken);

	std::fs::rename(&bundle, bundle.with_file_name("taken-away"))
		.expect("the bundle is taken away");
	let unbundled = harness.open_run(&conversation, &bot, 6);
	let refused = harness
		.call(
			"agent_start_or_resume_session",
			json!({ "scope": unbundled, "resume": Value::Null, "cwd": Value::Null }),
		)
		.expect_err("the run that found no bundle is refused");
	assert_eq!(refused["kind"], "spawnFailed", "got {refused}");
	assert!(
		refused["detail"].as_str().is_some_and(|detail| detail.contains(&bot)),
		"got {refused}"
	);
	assert!(!bundle.exists(), "the run that found no bundle wrote one");
	harness.describe(&bot, SPANISH);
	assert!(agent.is_file(), "the save from settings did not lay the bundle down");

	harness
		.call(
			"plugin_set_mcp_server",
			json!({
				"scope": a_bot_plugin(&bot),
				"name": "atlas",
				"config": { "command": "atlas-mcp", "args": ["--stdio"] },
			}),
		)
		.expect("the server is written");
	let manifest = bundle.join(".claude-plugin").join("plugin.json");
	let declared: Value =
		serde_json::from_str(&std::fs::read_to_string(&manifest).expect("the manifest"))
			.expect("the manifest is json");
	assert_eq!(declared["mcpServers"], json!("./.mcp.json"));
	let served = harness.runtime_of(&conversation, &bot, 7);
	assert!(served.spoken.contains("mcp<atlas>"), "got {}", served.spoken);
	assert!(served.spoken.contains(&briefed(SPANISH)), "got {}", served.spoken);

	harness
		.call("plugin_delete_mcp_server", json!({ "scope": a_bot_plugin(&bot), "name": "atlas" }))
		.expect("the server is taken away");
	assert!(!bundle.join(".mcp.json").exists(), "an empty server file was left behind");
	let bare_run = harness.started(&conversation, &bot, 8, json!(std::env::temp_dir()));
	std::fs::create_dir_all(skill.parent().expect("the skill directory")).expect("made");
	std::fs::write(&skill, "how to bake bread").expect("the turn has a bot write to record");
	let bare = harness.answer_of(&bare_run);
	assert!(bare.spoken.contains("mcp<none>"), "got {}", bare.spoken);
	harness.wait_for("the bot write of the turn to be recorded", bot_write_recorded);

	let manifest_dir = bundle.join(".claude-plugin");
	std::fs::remove_dir_all(&manifest_dir).expect("the manifest directory is taken away");
	std::fs::write(&manifest_dir, "not a directory").expect("a file stands in its place");
	let mut renaming = an_identity(Some(SPANISH));
	renaming["name"] = json!("Renamed");
	let refused = harness
		.call("conversation_update_bot", json!({ "id": bot, "identity": renaming }))
		.expect_err("the save is refused");
	assert_eq!(refused["kind"], "unwritableBundle", "got {refused}");
	assert_eq!(stored_bot(&harness, &bot)["name"], NAME, "the refused save renamed the bot");
	std::fs::remove_file(&manifest_dir).expect("the stand-in is taken away");

	harness.call("conversation_delete_bot", json!({ "id": bot })).expect("the bot is deleted");
	assert!(!bundle.exists(), "a deleted bot left its bundle behind");
	assert_eq!(listed_plugins(&harness), Vec::new());
}

#[test]
fn a_run_stacks_the_space_of_the_thread_it_speaks_in() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	let _scenario = scenario("identity");

	let harness = launch_as("runtime-identity-spaces");
	let bot = harness.create_bot();
	let home = harness.first_space();
	let elsewhere = harness.create_space("Writers");
	harness
		.call("bot_add_to_space", json!({ "botId": &bot, "spaceId": &elsewhere }))
		.expect("the bot joins the second space");

	let here = harness.solo_thread(&bot, None);
	let there = harness.solo_thread(&bot, Some(&elsewhere));
	harness.define(&home, "here");
	harness.define(&elsewhere, "there");
	let home_plugin = plugin_of(&harness, &home);
	let elsewhere_plugin = plugin_of(&harness, &elsewhere);

	let spoken = harness.runtime_of(&here, &bot, 1);
	assert!(spoken.spoken.contains(&plugged_into(&home_plugin)), "got {}", spoken.spoken);
	assert!(spoken.spoken.contains(&format!("env<{DESK}=here>")), "got {}", spoken.spoken);

	let elsewhere_spoken = harness.runtime_of(&there, &bot, 2);
	assert!(
		elsewhere_spoken.spoken.contains(&plugged_into(&elsewhere_plugin)),
		"got {}",
		elsewhere_spoken.spoken
	);
	assert!(
		elsewhere_spoken.spoken.contains(&format!("env<{DESK}=there>")),
		"got {}",
		elsewhere_spoken.spoken
	);
}

fn plugin_of(harness: &Harness, space: &str) -> PathBuf {
	let path = bundles::space::path(harness.app.handle(), space).expect("the space's plugin path");
	bundles::space::lay_down_at(&path).expect("the space's plugin is laid down");
	path
}

fn plugged_into(plugin: &Path) -> String {
	format!("space<{}>", plugin.display())
}

fn agent_events(scoped: &[ScopedEvent]) -> Vec<AgentEvent> {
	scoped.iter().map(|scoped| scoped.event.clone()).collect()
}
