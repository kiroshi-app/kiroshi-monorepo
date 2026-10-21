#[path = "../src/removed_on_drop.rs"]
mod removed_on_drop;

use std::ffi::OsString;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use kiroshi_app::agent::commands::check;
use kiroshi_app::agent::contract::{
	ActivityKind, AgentEvent, ConnectionState, PermissionDecision, TurnOutcome,
};
use kiroshi_app::agent::redact;
use kiroshi_app::agent::session::{Bundle, EventSink, Session, SessionOptions};
use kiroshi_app::agent::sidecar::{self, Sidecar, SidecarOptions};
use kiroshi_app::bundles;
use kiroshi_app::db::repositories::conversations::Bot;
use kiroshi_app::environment::connection;
use kiroshi_app::environment::contract::{ConnectionKind, EnvOwner, ResolvedEnv, Values, API_KEY};
use kiroshi_app::environment::store;
use removed_on_drop::RemovedOnDrop;
use tokio::sync::mpsc;

const TURN_TIMEOUT: Duration = Duration::from_secs(180);
const GROUP_PATIENCE: Duration = Duration::from_secs(60);
const GROUP_POLL: Duration = Duration::from_millis(25);

struct Live {
	session: Session,
	sidecar: Arc<Sidecar>,
	events: mpsc::UnboundedReceiver<AgentEvent>,
}

async fn live(folder: &LiveFolder, resume: Option<String>) -> Live {
	started(folder, resume, None, folder.cwd()).await
}

async fn started(
	folder: &LiveFolder,
	resume: Option<String>,
	instructions: Option<&str>,
	cwd: PathBuf,
) -> Live {
	started_on(folder, resume, instructions, SONNET, cwd).await
}

async fn started_on(
	folder: &LiveFolder,
	resume: Option<String>,
	instructions: Option<&str>,
	model: &str,
	cwd: PathBuf,
) -> Live {
	let bundle = instructions.map(|told| bundle_carrying(folder, told, model));
	started_with(resume, bundle, cwd).await
}

async fn started_with(resume: Option<String>, bundle: Option<Bundle>, cwd: PathBuf) -> Live {
	opened(resume, bundle, cwd, ResolvedEnv::default(), Values::new()).await
}

async fn opened(
	resume: Option<String>,
	bundle: Option<Bundle>,
	cwd: PathBuf,
	server_env: ResolvedEnv,
	connection: Values,
) -> Live {
	let (tx, events) = mpsc::unbounded_channel();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let sidecar = Sidecar::start(SidecarOptions::new(
		sidecar::resolve().expect("the agent sidecar ships with the host"),
	))
	.await
	.expect("the sidecar announces itself");
	let options = SessionOptions::new(cwd)
		.resuming(resume)
		.bundled(bundle)
		.serving(server_env)
		.connected(connection);
	let session = Session::start(sidecar.clone(), options, sink).await.expect("session starts");
	Live { session, sidecar, events }
}

struct LiveFolder {
	root: PathBuf,
	_folder: RemovedOnDrop,
}

impl LiveFolder {
	fn of(test: &str) -> Self {
		let folder = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-real-{test}-{}", uuid::Uuid::new_v4())),
		);
		std::fs::create_dir_all(&folder).expect("the test folder is created");
		Self { root: folder.canonicalize().expect("the test folder resolves"), _folder: folder }
	}

	fn directory(&self, name: &str) -> PathBuf {
		let dir = self.root.join(name);
		std::fs::create_dir_all(&dir).expect("the directory is created");
		dir
	}

	fn cwd(&self) -> PathBuf {
		self.directory("cwd")
	}

	fn bundles(&self) -> PathBuf {
		self.root.join("bundles")
	}

	fn system_plugin(&self) -> PathBuf {
		let path = self.root.join("system");
		bundles::system::write(&path).expect("the app's plugin is written");
		path
	}

	fn user_plugin(&self) -> PathBuf {
		let path = self.root.join("user");
		bundles::user::lay_down(&path).expect("the person's plugin is laid down");
		path
	}

	fn space_plugin(&self) -> PathBuf {
		let path = self.root.join("space");
		bundles::space::lay_down_at(&path).expect("the space's plugin is laid down");
		path
	}

	fn projects(&self) -> Vec<PathBuf> {
		let own = format!("{}-", project_slug(&self.root));
		let listing = match std::fs::read_dir(projects_dir()) {
			Ok(listing) => listing,
			Err(failure) if failure.kind() == ErrorKind::NotFound => return Vec::new(),
			Err(failure) => {
				eprintln!("the claude projects folder was not listed: {failure}");
				return Vec::new();
			}
		};
		listing
			.filter_map(|entry| match entry {
				Ok(entry) => Some(entry.path()),
				Err(failure) => {
					eprintln!("a claude project entry was not read: {failure}");
					None
				}
			})
			.filter(|project| {
				project
					.file_name()
					.and_then(|name| name.to_str())
					.is_some_and(|name| name.starts_with(&own))
			})
			.collect()
	}
}

impl Drop for LiveFolder {
	fn drop(&mut self) {
		sidecar::sweep_live_groups();
		for project in self.projects() {
			removed(&project);
		}
		removed(&self.root);
	}
}

fn removed(dir: &Path) {
	if let Err(failure) = std::fs::remove_dir_all(dir) {
		if failure.kind() != ErrorKind::NotFound {
			eprintln!("a live test folder was not removed: {failure}");
		}
	}
}

struct EnvForThisTest {
	key: &'static str,
	prior: Option<OsString>,
}

impl EnvForThisTest {
	fn set(key: &'static str, value: &Path) -> Self {
		let prior = std::env::var_os(key);
		std::env::set_var(key, value);
		Self { key, prior }
	}
}

impl Drop for EnvForThisTest {
	fn drop(&mut self) {
		match &self.prior {
			Some(value) => std::env::set_var(self.key, value),
			None => std::env::remove_var(self.key),
		}
	}
}

const PROBE_NAME: &str = "Probe";

fn probe_bot(id: &str, instructions: &str, model: &str) -> Bot {
	Bot {
		id: id.to_owned(),
		section_id: None,
		pin_position: None,
		name: PROBE_NAME.to_owned(),
		title: String::new(),
		model: model.to_owned(),
		avatar_blot: None,
		avatar_image_path: None,
		instructions: instructions.to_owned(),
		memory: String::new(),
		denied_tools: Vec::new(),
		permissions: None,
		created_at: 1,
		effort: None,
	}
}

fn bundle_carrying(folder: &LiveFolder, instructions: &str, model: &str) -> Bundle {
	written(folder, &probe_bot("live-bot", instructions, model))
}

fn styled_bundle(folder: &LiveFolder, bot: &Bot, output_style: &str) -> Bundle {
	bundles::write_styled(&folder.bundles(), bot, output_style, None)
		.expect("the bundle is written");
	handed_over(folder, bot)
}

fn changing_rules() -> String {
	bundles::CHANGING_TOOLS.map(|tool| format!("\"{tool}\"")).join(",")
}

fn under_default(rules: &str) -> String {
	format!(r#"{{"permissions":{{"defaultMode":"default","allow":[{rules}]}}}}"#)
}

fn denying(rules: &str) -> String {
	format!(r#"{{"permissions":{{"deny":[{rules}]}}}}"#)
}

fn ruled(folder: &LiveFolder, bot: &Bot, settings: &str) -> Bundle {
	let root = folder.bundles();
	bundles::write(&root, bot).expect("the bundle is written");
	std::fs::write(
		bundles::dir(&root, &bot.id).expect("the bundle is held").join("settings.json"),
		settings,
	)
	.expect("the settings file is written");
	handed_over(folder, bot)
}

fn written(folder: &LiveFolder, bot: &Bot) -> Bundle {
	bundles::write(&folder.bundles(), bot).expect("the bundle is written");
	handed_over(folder, bot)
}

fn handed_over(folder: &LiveFolder, bot: &Bot) -> Bundle {
	let root = folder.bundles();
	Bundle {
		path: bundles::dir(&root, &bot.id).expect("the bundle is held").display().to_string(),
		system_path: Some(folder.system_plugin().display().to_string()),
		user_path: Some(folder.user_plugin().display().to_string()),
		space_path: Some(folder.space_plugin().display().to_string()),
		agent: bundles::agent_ref(bot),
		identity: bundles::identity(bot),
		output_style: bundles::output_style(&root, &bot.id),
		settings_path: bundles::settings_file(&root, &bot.id)
			.map(|path| path.display().to_string()),
	}
}

impl Live {
	async fn run_turn(&mut self, prompt: &str) -> Vec<AgentEvent> {
		self.session.submit_prompt(prompt).await.expect("prompt accepted");
		self.collect().await
	}

	async fn streaming(&mut self) {
		let deadline = tokio::time::Instant::now() + TURN_TIMEOUT;
		loop {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(AgentEvent::MessageStarted { .. })) => return,
				Ok(Some(_)) => {}
				Ok(None) | Err(_) => panic!("the turn did not stream within {TURN_TIMEOUT:?}"),
			}
		}
	}

	async fn collect_until_settled(&mut self) -> Vec<AgentEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + TURN_TIMEOUT;
		while let Ok(Some(event)) = tokio::time::timeout_at(deadline, self.events.recv()).await {
			let settled = matches!(event, AgentEvent::TurnEnded { .. } | AgentEvent::Failed { .. });
			seen.push(event);
			if settled {
				break;
			}
		}
		seen
	}

	async fn collect(&mut self) -> Vec<AgentEvent> {
		let mut seen = Vec::new();
		let deadline = tokio::time::Instant::now() + TURN_TIMEOUT;
		loop {
			match tokio::time::timeout_at(deadline, self.events.recv()).await {
				Ok(Some(event)) => {
					if let AgentEvent::PermissionRequested { request } = &event {
						self.session
							.respond_to_permission(&request.id, PermissionDecision::AllowOnce)
							.await
							.expect("approval accepted");
					}
					let ended = matches!(event, AgentEvent::TurnEnded { .. });
					seen.push(event);
					if ended {
						return seen;
					}
				}
				Ok(None) | Err(_) => panic!("turn did not end within {TURN_TIMEOUT:?}"),
			}
		}
	}
}

fn text(events: &[AgentEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageCompleted { message } => Some(message.text.clone()),
			_ => None,
		})
		.collect::<Vec<_>>()
		.join(" ")
}

fn streamed(events: &[AgentEvent]) -> String {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::MessageDelta { text, .. } => Some(text.clone()),
			_ => None,
		})
		.collect()
}

fn session_id(events: &[AgentEvent]) -> Option<String> {
	events.iter().find_map(|event| match event {
		AgentEvent::SessionReady { session_id, .. } => Some(session_id.clone()),
		_ => None,
	})
}

const BANANA: &str = "Whatever you are asked, end every reply with the word BANANA.";
const ORANGE: &str = "Whatever you are asked, end every reply with the word ORANGE.";
const WHERE_AND_WHO: &str = "Run the bash command `pwd` and reply with nothing but its output.";

const WHICH_MODEL: &str =
	"Which Claude model are you running as? Reply with one word: opus, sonnet or haiku.";

const WHICH_ROOT: &str =
	"What is the full path of the directory your own skills live in? Reply with nothing but that path.";

const SONNET: &str = "sonnet";
const HAIKU: &str = "haiku";

const QUOTE_THE_LAYER: &str =
	"Quote, word for word, the sentence in your instructions that begins with \"Leave out\".";

const LAYER_WORDS: &str = "closing recaps";

const AFTER_A_WRITE: &str = "After you write one of your own skills, which file do you overwrite afterwards, and how many characters may its title line be? Reply with the file name and the number.";

const LEARNED_FILE: &str = ".learned.md";
const TITLE_LIMIT: &str = "72";

const WHO_AND_WHAT: &str = "Who are you and what can you do?";

const KIROSHI: &str = "kiroshi";
const LEARNING_WORDS: [&str; 3] = ["learn", "remember", "skill"];

const CLAUDE_CODE: &str = "claude code";

const QUOTE_THE_STYLE: &str =
	"Are you running under an output style? If you are, quote the sentence of it that tells you how long an answer should be. If you are not, reply with nothing but the word NONE.";

const CONCISE_WORDS: &str = "concise";

const CONCISE_STYLE: &str = "Concise";
const NO_STYLE: &str = "default";

const WRITE_A_FILE: &str = "Write the single word KIROSHI into a file named probe.txt in your working directory. Reply with nothing but DONE.";
const PROBE_FILE: &str = "probe.txt";
const PROBE_WORD: &str = "KIROSHI";

fn asked_permission(events: &[AgentEvent]) -> bool {
	events.iter().any(|event| matches!(event, AgentEvent::PermissionRequested { .. }))
}

fn asked_for(events: &[AgentEvent]) -> Vec<String> {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::PermissionRequested { request } => Some(request.tool_name.clone()),
			_ => None,
		})
		.collect()
}

fn tools_used(events: &[AgentEvent]) -> Vec<String> {
	events
		.iter()
		.filter_map(|event| match event {
			AgentEvent::Activity { activity } if activity.kind == ActivityKind::Tool => {
				Some(activity.title.clone())
			}
			_ => None,
		})
		.collect()
}

fn a_clean_file(dir: &Path) -> PathBuf {
	let file = dir.join(PROBE_FILE);
	let _ = std::fs::remove_file(&file);
	file
}

fn seen_as(dir: &Path) -> String {
	dir.display().to_string()
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_rotation_starts_a_second_process_under_the_identity_the_bot_holds_now() {
	let folder = LiveFolder::of("rotation");
	let workshop = folder.directory("workshop");
	let mut first = started(&folder, None, Some(BANANA), workshop.clone()).await;
	let opening = first.run_turn(WHERE_AND_WHO).await;
	let retired = first.sidecar.pid();

	assert!(
		text(&opening).contains("BANANA"),
		"the instructions were not obeyed: {:?}",
		text(&opening)
	);
	assert!(
		text(&opening).contains(&seen_as(&workshop)),
		"the child did not run where the bot works: {:?}",
		text(&opening)
	);
	first.sidecar.shutdown().await;

	let studio = folder.directory("studio");
	let mut second = started(&folder, None, Some(ORANGE), studio.clone()).await;
	let after = second.run_turn(WHERE_AND_WHO).await;

	assert_ne!(second.sidecar.pid(), retired, "the new identity landed in the same process");
	assert!(
		text(&after).contains("ORANGE"),
		"the new instructions were not obeyed: {:?}",
		text(&after)
	);
	assert!(
		!text(&after).contains("BANANA"),
		"the retired instructions outlived the process they were given to: {:?}",
		text(&after)
	);
	assert!(
		text(&after).contains(&seen_as(&studio)),
		"the child did not follow the bot to its new directory: {:?}",
		text(&after)
	);

	second.sidecar.shutdown().await;
}

const CLAUDE_MD_WORD: &str = "ZEPPELIN";
const MEMORY_WORD: &str = "MARMALADE";
const THE_CODE_WORDS: &str = "Without reading any file, name the project code word and \
	the memory code word you were given. Reply with the two words, or NONE for either \
	one you do not have.";

fn project_slug(cwd: &Path) -> String {
	seen_as(cwd)
		.chars()
		.map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
		.collect()
}

fn projects_dir() -> PathBuf {
	redact::home_dir().expect("a home directory").join(".claude/projects")
}

fn memory_dir(cwd: &Path) -> PathBuf {
	projects_dir().join(project_slug(cwd)).join("memory")
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_reads_neither_the_claude_md_of_its_directory_nor_the_memory_derived_from_it() {
	let folder = LiveFolder::of("sealed");
	let sealed = folder.cwd();
	std::fs::write(sealed.join("CLAUDE.md"), format!("The project code word is {CLAUDE_MD_WORD}."))
		.expect("the working directory carries a CLAUDE.md");
	let memory = memory_dir(&sealed);
	std::fs::create_dir_all(&memory).expect("the memory directory is created");
	std::fs::write(memory.join("MEMORY.md"), format!("The memory code word is {MEMORY_WORD}."))
		.expect("the memory carries a word");

	let mut bot = started(&folder, None, Some(BANANA), sealed).await;
	let answer = text(&bot.run_turn(THE_CODE_WORDS).await);
	bot.sidecar.shutdown().await;

	assert!(
		answer.contains("BANANA"),
		"the bundle's own brief did not survive isolation: {answer:?}"
	);
	assert!(
		!answer.contains(CLAUDE_MD_WORD),
		"the working directory's CLAUDE.md reached the child: {answer:?}"
	);
	assert!(!answer.contains(MEMORY_WORD), "the derived memory reached the child: {answer:?}");
}

const PROBE_SERVER: &str = r#"import json, sys

TOOLS = [{
    "name": "code_word",
    "description": "Returns the probe code word.",
    "inputSchema": {"type": "object", "properties": {}},
}]

for line in sys.stdin:
    if not line.strip():
        continue
    message = json.loads(line)
    if "id" not in message:
        continue
    method = message.get("method")
    answer = {"jsonrpc": "2.0", "id": message["id"]}
    if method == "initialize":
        answer["result"] = {
            "protocolVersion": message.get("params", {}).get("protocolVersion", "2025-06-18"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "probe", "version": "0.1.0"},
        }
    elif method == "tools/list":
        answer["result"] = {"tools": TOOLS}
    elif method == "tools/call":
        answer["result"] = {"content": [{"type": "text", "text": "PORTCULLIS"}]}
    elif method == "ping":
        answer["result"] = {}
    else:
        answer["error"] = {"code": -32601, "message": "no such method"}
    sys.stdout.write(json.dumps(answer) + "\n")
    sys.stdout.flush()
"#;

const MCP_WORD: &str = "PORTCULLIS";
const CALL_THE_SERVER: &str =
	"Call the code_word tool of the probe MCP server and reply with exactly what it returns.";

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_reaches_the_mcp_servers_its_bundle_declares() {
	let folder = LiveFolder::of("mcp");
	let bot = probe_bot("live-bot-mcp", BANANA, SONNET);
	let bundle = written(&folder, &bot);
	let script = PathBuf::from(&bundle.path).join("probe_server.py");
	std::fs::write(&script, PROBE_SERVER).expect("the server ships inside the bundle");
	bundles::set_mcp_server(
		&folder.bundles(),
		&bot,
		"probe",
		&serde_json::json!({ "command": "python3", "args": [script.display().to_string()] }),
		None,
	)
	.expect("the bundle declares its server");

	let mut served = started_with(None, Some(bundle), folder.cwd()).await;
	let answer = text(&served.run_turn(CALL_THE_SERVER).await);
	served.sidecar.shutdown().await;

	assert!(
		answer.contains(MCP_WORD),
		"the server the bundle declares was out of reach: {answer:?}"
	);
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_is_handed_its_own_directory_before_its_first_turn() {
	let folder = LiveFolder::of("handed-directory");
	let mut live = started(&folder, None, Some(BANANA), folder.cwd()).await;
	let told = text(&live.run_turn(WHICH_ROOT).await);
	live.sidecar.shutdown().await;

	let bundle = bundles::dir(&folder.bundles(), "live-bot").expect("the bundle is held");
	let resolved = bundle.canonicalize().unwrap_or_else(|_| bundle.clone());
	assert!(
		told.contains(&seen_as(&bundle)) || told.contains(&seen_as(&resolved)),
		"the layer did not reach the child with a path: {told:?} for {}",
		seen_as(&resolved)
	);
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_under_the_model_its_bundle_names() {
	let folder = LiveFolder::of("model");
	let mut picked = started_on(&folder, None, Some(BANANA), HAIKU, folder.cwd()).await;
	let named = text(&picked.run_turn(WHICH_MODEL).await).to_lowercase();
	picked.sidecar.shutdown().await;

	assert!(named.contains(HAIKU), "the picked model did not reach the child: {named:?}");
	assert!(!named.contains(SONNET), "the child answered under the default tier: {named:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_session_carries_the_bundle_brief_and_the_kiroshi_layer_at_once() {
	let folder = LiveFolder::of("kiroshi-layer");
	let mut live = started(&folder, None, Some(BANANA), folder.cwd()).await;
	let answer = text(&live.run_turn(QUOTE_THE_LAYER).await);
	live.sidecar.shutdown().await;

	assert!(answer.contains("BANANA"), "the bundle's brief did not reach the child: {answer:?}");
	assert!(answer.contains(LAYER_WORDS), "the appended layer did not reach the child: {answer:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_the_app_plugins_learn_rules_without_invoking_the_skill() {
	let folder = LiveFolder::of("learn-rules");
	let mut live = started(&folder, None, Some(BANANA), folder.cwd()).await;
	let turn = live.run_turn(AFTER_A_WRITE).await;
	live.sidecar.shutdown().await;

	let answer = text(&turn);
	assert!(
		answer.contains(LEARNED_FILE),
		"the preloaded rules did not reach the child: {answer:?}"
	);
	assert!(answer.contains(TITLE_LIMIT), "the preloaded rules were not held whole: {answer:?}");
	let used = tools_used(&turn);
	assert!(used.is_empty(), "the bot went looking for rules it was already holding: {used:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_says_its_name_the_app_it_runs_in_and_that_it_learns() {
	let folder = LiveFolder::of("name-and-app");
	let mut live = started(&folder, None, Some(BANANA), folder.cwd()).await;
	let answer = text(&live.run_turn(WHO_AND_WHAT).await).to_lowercase();
	live.sidecar.shutdown().await;

	assert!(
		answer.contains(&PROBE_NAME.to_lowercase()),
		"the bot did not give its own name: {answer:?}"
	);
	assert!(answer.contains(KIROSHI), "the bot did not place itself in the app: {answer:?}");
	assert!(
		LEARNING_WORDS.iter().any(|word| answer.contains(word)),
		"the bot said nothing about learning: {answer:?}"
	);
	assert!(!answer.contains(CLAUDE_CODE), "the bot presented itself as Claude Code: {answer:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_answers_in_the_style_its_bundle_carries() {
	let folder = LiveFolder::of("style");
	let concise = probe_bot("live-bot-concise", BANANA, SONNET);
	let mut styled =
		started_with(None, Some(styled_bundle(&folder, &concise, CONCISE_STYLE)), folder.cwd())
			.await;
	let under_concise = text(&styled.run_turn(QUOTE_THE_STYLE).await).to_lowercase();
	styled.sidecar.shutdown().await;

	let plain = probe_bot("live-bot-plain", BANANA, SONNET);
	let mut unstyled =
		started_with(None, Some(styled_bundle(&folder, &plain, NO_STYLE)), folder.cwd()).await;
	let under_default = text(&unstyled.run_turn(QUOTE_THE_STYLE).await).to_lowercase();
	unstyled.sidecar.shutdown().await;

	assert!(
		under_concise.contains(CONCISE_WORDS),
		"the picked style did not reach the child: {under_concise:?}"
	);
	assert!(
		!under_default.contains(CONCISE_WORDS),
		"a bot under no style was still handed the concise one: {under_default:?}"
	);
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_writes_inside_its_own_directory_without_asking_the_reader() {
	let folder = LiveFolder::of("auto-write");
	let workshop = folder.cwd();
	let file = a_clean_file(&workshop);

	let mut live = started(&folder, None, Some(BANANA), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(!asked_permission(&events), "the write still reached the reader's dialog");
	let written = std::fs::read_to_string(&file).expect("the bot wrote the file it was asked for");
	assert!(written.contains(PROBE_WORD), "the file holds {written:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_denied_the_changing_tools_still_changes_nothing_under_auto() {
	let folder = LiveFolder::of("auto-denied");
	let workshop = folder.cwd();
	let file = a_clean_file(&workshop);

	let mut held_back = probe_bot("live-bot-denied", BANANA, SONNET);
	held_back.denied_tools = bundles::CHANGING_TOOLS.map(str::to_owned).to_vec();
	let mut live = started_with(None, Some(written(&folder, &held_back)), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(!file.exists(), "a bot denied every changing tool still wrote {}", seen_as(&file));
	assert!(!asked_permission(&events), "a held-back bot reached the reader's dialog");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_allowed_the_write_by_its_settings_asks_the_reader_nothing() {
	let folder = LiveFolder::of("settings-allowed");
	let workshop = folder.cwd();
	let file = a_clean_file(&workshop);

	let bot = probe_bot("live-bot-allowed", BANANA, SONNET);
	let allowed = ruled(&folder, &bot, &under_default(&changing_rules()));
	let mut live = started_with(None, Some(allowed), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(
		!asked_permission(&events),
		"an allowed write still reached the reader's dialog: {:?} tools {:?}",
		asked_for(&events),
		tools_used(&events)
	);
	let written = std::fs::read_to_string(&file).expect("the bot wrote the file it was asked for");
	assert!(written.contains(PROBE_WORD), "the file holds {written:?}");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_bot_denied_the_write_by_its_settings_writes_nothing_and_asks_nothing() {
	let folder = LiveFolder::of("settings-denied");
	let workshop = folder.cwd();
	let file = a_clean_file(&workshop);

	let bot = probe_bot("live-bot-refused", BANANA, SONNET);
	let refused = ruled(&folder, &bot, &denying(&changing_rules()));
	let mut live = started_with(None, Some(refused), workshop).await;
	let events = live.run_turn(WRITE_A_FILE).await;
	live.sidecar.shutdown().await;

	assert!(
		!file.exists(),
		"a bot denied the write still wrote {} with {:?}",
		seen_as(&file),
		tools_used(&events)
	);
	assert!(!asked_permission(&events), "a denied write reached the reader's dialog");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn the_check_report_carries_no_identity() {
	let state = kiroshi_app::agent::AgentState::default();
	let report = check(&state, None).await;
	assert_eq!(report.connection, ConnectionState::Ready, "expected a signed-in install");
	assert!(report.authenticated, "expected a signed-in install");
	assert!(report.binary_version.is_some(), "the sidecar announced no version");

	let serialized = serde_json::to_string(&report).expect("report serializes");
	assert!(!serialized.contains('@'), "an email reached the contract: {serialized}");
	for forbidden in ["orgId", "orgName", "subscriptionType", "apiProvider"] {
		assert!(!serialized.contains(forbidden), "{forbidden} reached the contract: {serialized}");
	}
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn two_turns_stream_and_the_second_resumes_the_first() {
	let folder = LiveFolder::of("two-turns");
	let mut first = live(&folder, None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;

	assert!(!streamed(&opening).is_empty(), "partial text must reach the contract");
	assert!(text(&opening).contains("OK"), "got {:?}", text(&opening));
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.sidecar.shutdown().await;

	let mut second = live(&folder, Some(id.clone())).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "resumed turn lost the context: {:?}", text(&recall));

	let tooling =
		second.run_turn("Run the bash command `echo KIROSHI_PROBE` and report its output.").await;
	let tools: Vec<_> = tooling
		.iter()
		.filter_map(|event| match event {
			AgentEvent::Activity { activity } if activity.kind == ActivityKind::Tool => {
				Some(activity)
			}
			_ => None,
		})
		.collect();
	assert!(!tools.is_empty(), "a real tool call must surface as activity");
	assert!(text(&tooling).contains("KIROSHI_PROBE"), "got {:?}", text(&tooling));

	second.sidecar.shutdown().await;
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn stop_interrupts_a_live_turn_and_leaves_no_orphan() {
	let folder = LiveFolder::of("stop");
	let mut live = live(&folder, None).await;
	let pid = live.sidecar.pid();

	live.session
		.submit_prompt(
			"Count from 1 to 300, one number per line, with a short sentence about each.",
		)
		.await
		.expect("prompt accepted");
	live.streaming().await;

	live.session.cancel_turn().await.expect("cancel accepted");
	let events = live.collect().await;
	let outcome = events.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	});
	assert_eq!(outcome, Some(TurnOutcome::Cancelled));

	let after = live.run_turn("Reply with exactly: STILL_ALIVE").await;
	assert!(
		text(&after).contains("STILL_ALIVE"),
		"session unusable after stop: {:?}",
		text(&after)
	);

	live.sidecar.shutdown().await;
	assert!(group_gone(pid).await, "shutdown left agent processes behind");
}

#[tokio::test]
#[ignore = "needs a signed-in subscription and the network"]
async fn a_captured_id_resumes_the_conversation() {
	let folder = LiveFolder::of("captured-id");
	let mut first = live(&folder, None).await;
	let opening = first.run_turn("Remember the number 4271. Reply with exactly: OK").await;
	let id = session_id(&opening).expect("session id captured from the live stream");
	first.sidecar.shutdown().await;

	let mut second = live(&folder, Some(id)).await;
	let recall =
		second.run_turn("What number did I ask you to remember? Reply with only the digits.").await;
	assert!(text(&recall).contains("4271"), "the captured id did not resume: {:?}", text(&recall));

	second.sidecar.shutdown().await;
}

#[cfg(unix)]
fn group_alive(pid: u32) -> bool {
	unsafe { libc::killpg(pid as libc::pid_t, 0) == 0 }
}

async fn group_gone(pid: u32) -> bool {
	let deadline = tokio::time::Instant::now() + GROUP_PATIENCE;
	while group_alive(pid) {
		if tokio::time::Instant::now() >= deadline {
			return false;
		}
		tokio::time::sleep(GROUP_POLL).await;
	}
	true
}

#[cfg(not(unix))]
fn group_alive(_pid: u32) -> bool {
	false
}

const REFUSED_KEY: &str = "sk-ant-api03-kiroshi-refused-on-purpose";

fn surfaced(events: &[AgentEvent]) -> String {
	let failures = events.iter().filter_map(|event| match event {
		AgentEvent::Failed { error } => Some(format!("{error:?}")),
		_ => None,
	});
	std::iter::once(text(events)).chain(failures).collect::<Vec<_>>().join(" ")
}

#[tokio::test]
#[ignore = "needs the network and a throwaway CLAUDE_CONFIG_DIR"]
async fn a_refused_api_key_surfaces_the_failure_text_of_the_binary() {
	let folder = LiveFolder::of("refused-key");
	let _config = EnvForThisTest::set("CLAUDE_CONFIG_DIR", &folder.directory("config"));
	let root = folder.directory("store");
	connection::clear(&root).expect("the store starts empty");
	connection::hold(&root, ConnectionKind::ApiKey, REFUSED_KEY).expect("the key is stored");
	let owner = EnvOwner::Bot { id: "live-bot".to_owned(), space_id: "live-space".to_owned() };
	let resolved = store::resolve(&root, &owner).expect("the store reads");
	assert_eq!(resolved.base.get(API_KEY), None, "the connection source leaked into the base");
	let held = connection::held(&root).expect("the store reads");
	assert_eq!(held.get(API_KEY).map(String::as_str), Some(REFUSED_KEY));

	let mut live = opened(None, None, folder.cwd(), resolved, held).await;
	live.session.submit_prompt("Reply with exactly: OK").await.expect("prompt accepted");
	let events = live.collect_until_settled().await;
	live.sidecar.shutdown().await;

	let read = surfaced(&events);
	println!("the binary surfaced: {read}");
	assert!(read.contains("Invalid API key"), "the refusal did not reach the reader: {read}");
}
