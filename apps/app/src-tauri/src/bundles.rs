use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard, PoisonError};

use tauri::{AppHandle, Manager, Runtime};

use crate::db::repositories::conversations::{AvatarBlot, Bot};
use crate::descriptors;
use crate::private_files;

mod effort;
mod front;
mod git;
mod mcp;
mod permissions;
pub mod plugin;
pub mod shoto;
mod skill;
pub mod space;
pub mod system;
pub mod user;

use front::{
	below_front, body, checked_front, front_value, marked_bot_id, quoted, rendered, unquoted,
	with_key, without_key, Parts,
};
use skill::preloaded;

pub use effort::{supported_effort, EffortLevel};
pub use git::{Author, ChangedFile, FileChange, HistoryEntry};
pub use mcp::{
	mcp_servers, mcp_servers_at, remove_mcp_server, remove_mcp_server_at, set_mcp_server,
	set_mcp_server_at, ApplicationMark, AuthorizationWithheld, McpServer,
};
pub use permissions::{permissions, set_permissions, BotPermissions};
pub(in crate::bundles) use skill::drafted;
pub use skill::{
	create_skill, create_skill_at, is_system_skill, remove_skill, remove_skill_at,
	remove_skill_file, remove_skill_file_at, set_skill_preloaded, set_skill_preloaded_at,
	skill_file, skill_file_at, skills, skills_at, update_skill, update_skill_at, write_skill_file,
	write_skill_file_at, write_skills, Skill, SkillDraft, SkillFront,
};

const DIR_NAME: &str = "bots";

const PLUGINS_DIR: &str = "plugins";

const MANIFEST_DIR: &str = ".claude-plugin";
const MANIFEST_NAME: &str = "plugin.json";
const MARKETPLACE_NAME: &str = "marketplace.json";
const AGENTS_DIR: &str = "agents";
const AGENT_NAME: &str = "agent";
const AGENT_EXTENSION: &str = "md";

const SKILLS_DIR: &str = "skills";
const SKILL_NAME: &str = "SKILL.md";

const HOOKS_DIR: &str = "hooks";
const HOOKS_NAME: &str = "hooks.json";
const SESSION_START_NAME: &str = "session-start.sh";

const LEARNED_NAME: &str = ".learned.md";

const EVOLVED_TITLE: &str = "The bot changed its files";

const LEARN_ID: &str = "learn";

const SETTINGS_NAME: &str = "settings.json";

const PERMISSIONS_KEY: &str = "permissions";
const DEFAULT_MODE_KEY: &str = "defaultMode";
const DIRECTORIES_KEY: &str = "additionalDirectories";
const ALLOW_KEY: &str = "allow";
const ASK_KEY: &str = "ask";
const DENY_KEY: &str = "deny";
const AUTO_MODE: &str = "auto";

pub const PERMISSION_MODES: [&str; 5] = ["default", "acceptEdits", "plan", AUTO_MODE, "dontAsk"];

const MCP_NAME: &str = ".mcp.json";
const SERVERS_KEY: &str = "mcpServers";
const MCP_SOURCE: &str = "./.mcp.json";

const MARKS_NAME: &str = ".applications.json";
const MARKS_KEY: &str = "applications";

const MARKETPLACE: &str = "kiroshi-bots";
const OWNER: &str = "Kiroshi";

const VERSION: &str = "0.1.0";

const UNNAMED: &str = "bot";

const STAMP_LENGTH: usize = 8;

const BOT_SUBJECT: &str = "Bot";
const SKILL_SUBJECT: &str = "Skill";
const SKILL_FILE_SUBJECT: &str = "Skill file";
const SERVER_SUBJECT: &str = "MCP server";

const OWNER_KEY: &str = "kiroshiBotId";

const MODEL_KEY: &str = "model";

const OUTPUT_STYLE_KEY: &str = "outputStyle";

pub const DEFAULT_OUTPUT_STYLE: &str = "Concise";

const COLOR_KEY: &str = "color";

const DISALLOWED_KEY: &str = "disallowedTools";

pub const CHANGING_TOOLS: [&str; 4] = ["Bash", "Edit", "Write", "NotebookEdit"];

const DELEGATION_TOOL: &str = "Task";

const MCP_PREFIX: &str = "mcp__";

const PRELOAD_KEY: &str = "preload";
const METADATA_KEY: &str = "metadata";
const KIROSHI_KEY: &str = "kiroshi";

const SYSTEM_KEY: &str = "system";

const INVOCATION_KEY: &str = "disable-model-invocation";

const NAME_KEY: &str = "name";
const DESCRIPTION_KEY: &str = "description";

const WHEN_TO_USE_KEY: &str = "when_to_use";
const ARGUMENT_HINT_KEY: &str = "argument-hint";
const ARGUMENTS_KEY: &str = "arguments";
const USER_INVOCABLE_KEY: &str = "user-invocable";
const ALLOWED_TOOLS_KEY: &str = "allowed-tools";
const DISALLOWED_TOOLS_KEY: &str = "disallowed-tools";
const EFFORT_KEY: &str = "effort";
const CONTEXT_KEY: &str = "context";
const AGENT_KEY: &str = "agent";
const BACKGROUND_KEY: &str = "background";
const HOOKS_KEY: &str = "hooks";
const PATHS_KEY: &str = "paths";
const SHELL_KEY: &str = "shell";
const LICENSE_KEY: &str = "license";
const COMPATIBILITY_KEY: &str = "compatibility";

const MARKED: &str = "true";

const INDENT: usize = 2;

const CARRIED_OPEN: &str = "<!-- kiroshi: generated from this bot's skills, do not edit -->";
const CARRIED_CLOSE: &str = "<!-- kiroshi: end of generated skills -->";

const MEMORY_OPEN: &str = "<!-- kiroshi: what the bot learned, the bot keeps this -->";
const MEMORY_CLOSE: &str = "<!-- kiroshi: end of what the bot learned -->";

const IDENTITY_CLOSE: &str = "<!-- kiroshi: end of generated identity -->";

const IDENTITY_STANCE: &str = "You are a bot with your own personality, and you accompany the person you talk to.
You are not Claude Code, and you never present yourself as such.
You do not narrate your own machinery — plugin, skills, files, sessions — unprompted, but when you are asked what you are or what you can do, you say so plainly.
The brief below is who you are for that person.";

const MAX_HEADING: usize = 6;

const FENCE: &str = "---";
const CLOSING_FENCE: &str = "\n---";

static COMMITS: LazyLock<Mutex<HashMap<PathBuf, &'static Mutex<()>>>> =
	LazyLock::new(|| Mutex::new(HashMap::new()));

fn commits(bundle: &Path) -> &'static Mutex<()> {
	let mut held = COMMITS.lock().unwrap_or_else(PoisonError::into_inner);
	held.entry(bundle.to_path_buf()).or_insert_with(|| Box::leak(Box::new(Mutex::new(()))))
}

pub(super) fn serialised(bundle: &Path) -> MutexGuard<'static, ()> {
	commits(bundle).lock().unwrap_or_else(PoisonError::into_inner)
}

fn serialised_both(
	source: &Path,
	target: &Path,
) -> (MutexGuard<'static, ()>, Option<MutexGuard<'static, ()>>) {
	if source == target {
		return (serialised(source), None);
	}
	let (first, second) = if source < target { (source, target) } else { (target, source) };
	(serialised(first), Some(serialised(second)))
}

pub fn root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME))
}

pub fn lookup(root: &Path, bot_id: &str) -> std::io::Result<Option<PathBuf>> {
	let plugins = root.join(PLUGINS_DIR);
	held_dir(&plugins, bot_id).inspect_err(|error| descriptors::note_exhaustion(error, &plugins))
}

pub fn dir(root: &Path, bot_id: &str) -> std::io::Result<PathBuf> {
	lookup(root, bot_id)?.ok_or_else(|| absent(bot_id))
}

fn absent(bot_id: &str) -> std::io::Error {
	std::io::Error::new(std::io::ErrorKind::NotFound, format!("bot {bot_id} has no bundle"))
}

fn held_dir(plugins: &Path, bot_id: &str) -> std::io::Result<Option<PathBuf>> {
	let by_id = plugins.join(bot_id);
	if is_held(&by_id)? {
		return Ok(Some(by_id));
	}
	let entries = match fs::read_dir(plugins) {
		Ok(entries) => entries,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
		Err(error) => return Err(error),
	};
	let suffix = format!("-{}", stamp(bot_id));
	for entry in entries {
		let path = entry?.path();
		let is_named =
			path.file_name().is_some_and(|name| name.to_string_lossy().ends_with(&suffix));
		if is_named && is_held(&path)? {
			return Ok(Some(path));
		}
	}
	Ok(None)
}

fn is_held(path: &Path) -> std::io::Result<bool> {
	match fs::metadata(path) {
		Ok(metadata) => Ok(metadata.is_dir()),
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
		Err(error) => Err(error),
	}
}

pub fn dir_name(bot: &Bot) -> String {
	named(&bot.name, &bot.id)
}

fn named(name: &str, bot_id: &str) -> String {
	format!("{}-{}", slug(name), stamp(bot_id))
}

fn stamp(bot_id: &str) -> String {
	bot_id.chars().take(STAMP_LENGTH).collect()
}

pub fn placed_dir(root: &Path, bot_id: &str, name: &str) -> std::io::Result<PathBuf> {
	Ok(lookup(root, bot_id)?.unwrap_or_else(|| root.join(PLUGINS_DIR).join(named(name, bot_id))))
}

pub fn lay_down(root: &Path, bot: &Bot) -> std::io::Result<PathBuf> {
	let _serialised = serialised(&placed_dir(root, &bot.id, &bot.name)?);
	laid_out(root, bot)
}

fn laid_out(root: &Path, bot: &Bot) -> std::io::Result<PathBuf> {
	match lookup(root, &bot.id)? {
		Some(held) => Ok(held),
		None => created(root, bot),
	}
}

fn created(root: &Path, bot: &Bot) -> std::io::Result<PathBuf> {
	let bundle = root.join(PLUGINS_DIR).join(dir_name(bot));
	private_files::create_dir(&bundle)?;
	git::init(&bundle).map_err(unrecorded)?;
	Ok(bundle)
}

fn settled(root: &Path, bot: &Bot, held: PathBuf) -> PathBuf {
	let target = root.join(PLUGINS_DIR).join(dir_name(bot));
	if held == target || target.exists() {
		return held;
	}
	match fs::rename(&held, &target) {
		Ok(()) => target,
		Err(error) => {
			eprintln!(
				"the bundle of bot {} stays at {} and was not renamed to {}: {error}",
				bot.id,
				held.display(),
				target.display()
			);
			held
		}
	}
}

pub fn slug(name: &str) -> String {
	let mut slug = String::new();
	for character in name.chars() {
		if character.is_ascii_alphanumeric() {
			slug.push(character.to_ascii_lowercase());
		} else if !slug.is_empty() && !slug.ends_with('-') {
			slug.push('-');
		}
	}
	let trimmed = slug.trim_end_matches('-');
	if trimmed.is_empty() {
		UNNAMED.to_owned()
	} else {
		trimmed.to_owned()
	}
}

pub fn agent_ref(bot: &Bot) -> String {
	format!("{}:{AGENT_NAME}", dir_name(bot))
}

fn generated_agent(root: &Path, bot_id: &str) -> Option<PathBuf> {
	owned_agent(&dir(root, bot_id).ok()?, bot_id)
}

fn owned_agent(bundle: &Path, bot_id: &str) -> Option<PathBuf> {
	fs::read_dir(bundle.join(AGENTS_DIR)).ok()?.flatten().find_map(|entry| {
		let path = entry.path();
		let text = fs::read_to_string(&path).ok()?;
		(marked_bot_id(&text)? == bot_id).then_some(path)
	})
}

pub fn marketplace_file(root: &Path) -> PathBuf {
	root.join(MANIFEST_DIR).join(MARKETPLACE_NAME)
}

pub fn agent_file(root: &Path, bot_id: &str) -> Option<PathBuf> {
	generated_agent(root, bot_id)
}

pub fn settings_file(root: &Path, bot_id: &str) -> Option<PathBuf> {
	let path = settings_path(root, bot_id).ok()?;
	if !path.is_file() {
		return None;
	}
	forget_directories(&path);
	Some(path)
}

fn forget_directories(path: &Path) {
	let mut kept = object_at(path);
	let Some(serde_json::Value::Object(declared)) = kept.get_mut(PERMISSIONS_KEY) else {
		return;
	};
	if declared.remove(DIRECTORIES_KEY).is_none() {
		return;
	}
	let _ = private_files::replace(path, serde_json::Value::Object(kept).to_string().as_bytes());
}

fn settings_path(root: &Path, bot_id: &str) -> std::io::Result<PathBuf> {
	Ok(dir(root, bot_id)?.join(SETTINGS_NAME))
}

pub struct Generated {
	pub instructions: String,
	pub memory: String,
	pub model: Option<String>,
	pub blot: Option<AvatarBlot>,
	pub denied_tools: Vec<String>,
	pub output_style: String,
	pub effort: Option<EffortLevel>,
}

pub fn generated(root: &Path, bot_id: &str) -> Option<Generated> {
	let text = fs::read_to_string(agent_file(root, bot_id)?).ok()?;
	let model = front_value(&text, MODEL_KEY)
		.map(|found| found.trim().to_owned())
		.filter(|found| !found.is_empty());
	let blot = front_value(&text, COLOR_KEY).and_then(|found| AvatarBlot::parse(found.trim()));
	let denied_tools = front_denials(&text);
	let output_style = front_output_style(&text);
	let effort = front_value(&text, EFFORT_KEY).and_then(|found| EffortLevel::parse(found.trim()));
	Some(Generated {
		instructions: body(&text).to_owned(),
		memory: remembered(&text).to_owned(),
		model,
		blot,
		denied_tools,
		output_style,
		effort,
	})
}

pub fn output_style(root: &Path, bot_id: &str) -> String {
	generated(root, bot_id)
		.map_or_else(|| DEFAULT_OUTPUT_STYLE.to_owned(), |written| written.output_style)
}

fn front_output_style(text: &str) -> String {
	styled(&front_value(text, OUTPUT_STYLE_KEY).unwrap_or_default()).to_owned()
}

fn instructions(root: &Path, bot_id: &str) -> Option<String> {
	Some(generated(root, bot_id)?.instructions)
}

pub fn write(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let _serialised = serialised(&placed_dir(root, &bot.id, &bot.name)?);
	let bundle = laid_out(root, bot)?;
	rewritten(root, bot, bundle)
}

fn rewritten(root: &Path, bot: &Bot, bundle: PathBuf) -> std::io::Result<()> {
	let effort = held_effort(bot, generated(root, &bot.id).as_ref());
	write_styled_into(root, bot, bundle, &output_style(root, &bot.id), effort)
}

pub fn write_styled(
	root: &Path,
	bot: &Bot,
	output_style: &str,
	effort: Option<EffortLevel>,
) -> std::io::Result<()> {
	let _serialised = serialised(&placed_dir(root, &bot.id, &bot.name)?);
	let bundle = laid_out(root, bot)?;
	write_styled_into(root, bot, bundle, output_style, effort)
}

fn write_styled_into(
	root: &Path,
	bot: &Bot,
	held: PathBuf,
	output_style: &str,
	effort: Option<EffortLevel>,
) -> std::io::Result<()> {
	write_briefed(
		root,
		bot,
		Written {
			brief: &bot.instructions,
			memory: &kept_memory(root, bot),
			output_style,
			denied: &bot.denied_tools,
			effort,
		},
	)?;
	let bundle = settled(root, bot, held);
	recorded(&bundle, BOT_SUBJECT, &bot.name, "saved from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn write_remembered(root: &Path, bot: &Bot, memory: &str) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	rewrite_agent_holding(root, bot, memory)?;
	recorded(&bundle, BOT_SUBJECT, &bot.name, "memory saved from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn inherit(root: &Path, source_id: &str, bot: &Bot) -> std::io::Result<()> {
	let Some(source) = lookup(root, source_id)? else {
		return Ok(());
	};
	let target = placed_dir(root, &bot.id, &bot.name)?;
	let _serialised = serialised_both(&source, &target);
	copied_tree(&source, &target)?;
	reowned(&target, source_id, &bot.id)
}

pub fn reowned(bundle: &Path, source_id: &str, bot_id: &str) -> std::io::Result<()> {
	let Some(path) = owned_agent(bundle, source_id) else {
		return Ok(());
	};
	let mut parts = checked_front(&fs::read_to_string(&path)?)?;
	parts.front = with_key(&parts.front, &[METADATA_KEY, OWNER_KEY], &quoted(bot_id));
	private_files::replace(&path, rendered(&parts).as_bytes())
}

fn copied_tree(source: &Path, target: &Path) -> std::io::Result<()> {
	if !source.is_dir() {
		return Ok(());
	}
	private_files::create_dir(target)?;
	for entry in fs::read_dir(source)? {
		let entry = entry?;
		let path = entry.path();
		let into = target.join(entry.file_name());
		if path.is_dir() {
			copied_tree(&path, &into)?;
		} else {
			copied_file(&path, &into)?;
		}
	}
	Ok(())
}

fn copied_file(source: &Path, target: &Path) -> std::io::Result<()> {
	if !source.is_file() {
		return Ok(());
	}
	private_files::replace(target, &fs::read(source)?)
}

fn recorded(bundle: &Path, subject: &str, name: &str, verb: &str) -> Result<(), git2::Error> {
	let title = format!("{subject} \"{}\" {verb}", name.trim());
	git::commit(bundle, Author::User, &title, "").map(|_| ())
}

pub(super) fn unrecorded(error: git2::Error) -> std::io::Error {
	std::io::Error::other(error)
}

fn unfound(error: std::io::Error) -> git2::Error {
	git2::Error::from_str(&error.to_string())
}

struct Written<'a> {
	brief: &'a str,
	memory: &'a str,
	output_style: &'a str,
	denied: &'a [String],
	effort: Option<EffortLevel>,
}

fn write_briefed(root: &Path, bot: &Bot, written: Written) -> std::io::Result<()> {
	let generated = generated_agent(root, &bot.id);
	let agent_path = agent_path(root, &bot.id)?;
	let parts = checked_front(&held_agent(generated.as_deref()))?;

	unequip(root, &bot.id)?;
	rewrite_manifest(root, bot)?;
	private_files::replace(&agent_path, agent(parts, root, bot, written).as_bytes())?;
	if let Some(generated) = generated.filter(|path| path != &agent_path) {
		let _ = fs::remove_file(generated);
	}
	Ok(())
}

fn held_agent(path: Option<&Path>) -> String {
	path.and_then(|path| fs::read_to_string(path).ok()).unwrap_or_default()
}

fn unequip(root: &Path, bot_id: &str) -> std::io::Result<()> {
	let bundle = dir(root, bot_id)?;
	let hooks = bundle.join(HOOKS_DIR);
	let declared = hooks.join(HOOKS_NAME);
	if generated_hooks(&declared) {
		let _ = fs::remove_file(declared);
		let _ = fs::remove_file(hooks.join(SESSION_START_NAME));
		let _ = fs::remove_dir(hooks);
	}
	if is_system_skill(root, bot_id, LEARN_ID) {
		let _ = fs::remove_dir_all(bundle.join(SKILLS_DIR).join(LEARN_ID));
	}
	Ok(())
}

fn generated_hooks(path: &Path) -> bool {
	fs::read_to_string(path).is_ok_and(|text| text.contains(SESSION_START_NAME))
}

fn agent_path(root: &Path, bot_id: &str) -> std::io::Result<PathBuf> {
	Ok(dir(root, bot_id)?.join(AGENTS_DIR).join(format!("{AGENT_NAME}.{AGENT_EXTENSION}")))
}

#[derive(Debug)]
pub struct BundleUnavailable {
	pub bot_id: String,
	pub cause: std::io::Error,
}

impl std::fmt::Display for BundleUnavailable {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(f, "the bundle of bot {} is unavailable: {}", self.bot_id, self.cause)
	}
}

impl std::error::Error for BundleUnavailable {
	fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
		Some(&self.cause)
	}
}

pub fn ensure(root: &Path, bot: &Bot) -> Result<PathBuf, BundleUnavailable> {
	ensured(root, bot).map_err(|cause| BundleUnavailable { bot_id: bot.id.clone(), cause })
}

fn ensured(root: &Path, bot: &Bot) -> std::io::Result<PathBuf> {
	let held = dir(root, &bot.id)?;
	let _serialised = serialised(&held);
	let bundle = settled(root, bot, held);
	if agent_file(root, &bot.id).is_none() {
		rewritten(root, bot, bundle.clone())?;
		return Ok(bundle);
	}
	rewrite_agent(root, bot)?;
	recorded(&bundle, BOT_SUBJECT, &bot.name, "added to the history").map_err(unrecorded)?;
	Ok(bundle)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Evolution {
	pub commit_id: String,
	pub title: String,
}

#[derive(Debug, PartialEq)]
pub enum Evolved {
	Unchanged,
	Recorded(Evolution),
	Failed(git2::Error),
}

pub fn evolve(root: &Path, bot: &Bot) -> Evolved {
	let bundle = match dir(root, &bot.id) {
		Ok(bundle) => bundle,
		Err(error) => return bot_write_failed(&root.join(PLUGINS_DIR), unfound(error)),
	};
	let _serialised = serialised(&bundle);
	evolve_serialised(root, bot, &bundle)
}

fn evolve_serialised(root: &Path, bot: &Bot, bundle: &Path) -> Evolved {
	let changed = match git::changes(bundle) {
		Ok(changed) => changed,
		Err(error) => return bot_write_failed(bundle, error),
	};
	if changed.is_empty() {
		return Evolved::Unchanged;
	}
	let _ = rewrite_agent(root, bot);
	let (title, body) =
		learned(bundle).unwrap_or_else(|| (EVOLVED_TITLE.to_owned(), changed.join("\n")));
	bot_recorded(bundle, title, &body)
}

fn bot_recorded(bundle: &Path, title: String, body: &str) -> Evolved {
	let recorded = match git::record(bundle, Author::Bot, &title, body) {
		Ok(recorded) => recorded,
		Err(error) => return bot_write_failed(bundle, error),
	};
	if let Err(error) = recorded.tightened {
		eprintln!("the bot write recorded under {} was left open: {error}", bundle.display());
	}
	let Some(commit_id) = recorded.id else {
		return Evolved::Unchanged;
	};
	let _ = fs::remove_file(bundle.join(LEARNED_NAME));
	Evolved::Recorded(Evolution { commit_id, title })
}

fn bot_write_failed(bundle: &Path, error: git2::Error) -> Evolved {
	eprintln!("the bot write under {} was not recorded: {error}", bundle.display());
	Evolved::Failed(error)
}

fn learned(bundle: &Path) -> Option<(String, String)> {
	let text = fs::read_to_string(bundle.join(LEARNED_NAME)).ok()?;
	let (title, body) = text.split_once('\n').unwrap_or((&text, ""));
	let title = title.trim();
	if title.is_empty() {
		return None;
	}
	Some((title.to_owned(), body.trim().to_owned()))
}

pub fn adopted(root: &Path, bot: &Bot) -> Option<String> {
	instructions(root, &bot.id).filter(|found| edited(found, &bot.instructions))
}

pub fn adopted_memory(root: &Path, bot: &Bot) -> Option<String> {
	generated(root, &bot.id).map(|held| held.memory).filter(|found| edited(found, &bot.memory))
}

pub fn edited(found: &str, stored: &str) -> bool {
	found != stored.trim()
}

pub fn reconciled(root: &Path, bot: &Bot, submitted: &str) -> String {
	if submitted != bot.instructions {
		return submitted.to_owned();
	}
	adopted(root, bot).unwrap_or_else(|| bot.instructions.clone())
}

pub fn history(root: &Path, bot_id: &str) -> Result<Vec<HistoryEntry>, git2::Error> {
	history_at(&dir(root, bot_id).map_err(unfound)?)
}

pub fn history_at(bundle: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	git::history(bundle)
}

pub fn changed_files(
	root: &Path,
	bot_id: &str,
	oldest_commit_id: &str,
	newest_commit_id: &str,
) -> Result<Vec<ChangedFile>, git2::Error> {
	changed_files_at(&dir(root, bot_id).map_err(unfound)?, oldest_commit_id, newest_commit_id)
}

pub fn changed_files_at(
	bundle: &Path,
	oldest_commit_id: &str,
	newest_commit_id: &str,
) -> Result<Vec<ChangedFile>, git2::Error> {
	git::changed_files(bundle, oldest_commit_id, newest_commit_id)
}

pub fn revert(
	root: &Path,
	bot_id: &str,
	oldest_commit_id: &str,
	newest_commit_id: &str,
) -> Result<String, git2::Error> {
	revert_at(&dir(root, bot_id).map_err(unfound)?, oldest_commit_id, newest_commit_id)
}

pub fn revert_at(
	bundle: &Path,
	oldest_commit_id: &str,
	newest_commit_id: &str,
) -> Result<String, git2::Error> {
	let _serialised = serialised(bundle);
	git::revert(bundle, oldest_commit_id, newest_commit_id)
}

pub fn remove(root: &Path, bot_id: &str) {
	match lookup(root, bot_id) {
		Ok(Some(bundle)) => {
			let _ = fs::remove_dir_all(bundle);
		}
		Ok(None) => {}
		Err(error) => eprintln!("the bundle of bot {bot_id} could not be found to remove: {error}"),
	}
}

pub fn write_marketplace(root: &Path, bots: &[Bot]) -> std::io::Result<()> {
	let plugins: Vec<serde_json::Value> = bots
		.iter()
		.map(|bot| {
			let named = dir_name(bot);
			serde_json::json!({
				"name": &named,
				"source": format!("./{PLUGINS_DIR}/{named}"),
				"description": describe(bot),
			})
		})
		.collect();
	let listed = serde_json::json!({
		"name": MARKETPLACE,
		"owner": { "name": OWNER },
		"plugins": plugins,
	});
	private_files::replace(&marketplace_file(root), indented_json(&listed).as_bytes())
}

fn describe(bot: &Bot) -> &str {
	if bot.title.trim().is_empty() {
		&bot.name
	} else {
		&bot.title
	}
}

fn manifest(path: &Path, bundle: &Path, bot: &Bot) -> String {
	let mut kept = object_at(path);
	kept.insert("name".to_owned(), dir_name(bot).into());
	kept.insert("version".to_owned(), VERSION.into());
	kept.insert("displayName".to_owned(), bot.name.clone().into());
	kept.insert("description".to_owned(), describe(bot).into());
	declare_servers(&mut kept, bundle);
	indented_json(&serde_json::Value::Object(kept))
}

fn indented_json(value: &serde_json::Value) -> String {
	serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn rewrite_manifest(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	let path = manifest_file(&bundle);
	private_files::replace(&path, manifest(&path, &bundle, bot).as_bytes())
}

fn manifest_file(bundle: &Path) -> PathBuf {
	bundle.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

fn declare_servers(kept: &mut serde_json::Map<String, serde_json::Value>, bundle: &Path) {
	if bundle.join(MCP_NAME).is_file() && !kept.contains_key(SERVERS_KEY) {
		kept.insert(SERVERS_KEY.to_owned(), MCP_SOURCE.into());
	}
}

fn rewrite_declared_servers(bundle: &Path) -> std::io::Result<()> {
	let path = manifest_file(bundle);
	let kept = object_at(&path);
	let mut rewritten = kept.clone();
	if bundle.join(MCP_NAME).is_file() {
		declare_servers(&mut rewritten, bundle);
	} else if rewritten.get(SERVERS_KEY).and_then(serde_json::Value::as_str) == Some(MCP_SOURCE) {
		rewritten.remove(SERVERS_KEY);
	}
	if rewritten == kept {
		return Ok(());
	}
	private_files::replace(&path, indented_json(&serde_json::Value::Object(rewritten)).as_bytes())
}

fn undeclare_servers(root: &Path, bot: &Bot) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	if bundle.join(MCP_NAME).is_file() {
		return Ok(());
	}
	let path = manifest_file(&bundle);
	let mut kept = object_at(&path);
	if kept.get(SERVERS_KEY).and_then(serde_json::Value::as_str) != Some(MCP_SOURCE) {
		return Ok(());
	}
	kept.remove(SERVERS_KEY);
	private_files::replace(&path, indented_json(&serde_json::Value::Object(kept)).as_bytes())
}

pub fn held_memory(written: Option<&Generated>, stored: &str) -> String {
	written
		.map(|held| held.memory.clone())
		.filter(|held| !held.is_empty())
		.unwrap_or_else(|| stored.trim().to_owned())
}

fn kept_memory(root: &Path, bot: &Bot) -> String {
	held_memory(generated(root, &bot.id).as_ref(), &bot.memory)
}

fn agent(mut parts: Parts, root: &Path, bot: &Bot, written: Written) -> String {
	parts.front = with_key(&parts.front, &[NAME_KEY], &quoted(AGENT_NAME));
	parts.front = with_key(&parts.front, &[DESCRIPTION_KEY], &quoted(describe(bot)));
	parts.front = keyed_line(&parts.front, MODEL_KEY, &model_value(&bot.model));
	parts.front = keyed_line(&parts.front, COLOR_KEY, &color_value(bot.avatar_blot));
	parts.front = keyed_line(&parts.front, DISALLOWED_KEY, &denial_value(written.denied));
	parts.front =
		keyed_line(&parts.front, EFFORT_KEY, written.effort.map_or("", EffortLevel::named));
	parts.front = with_key(&parts.front, &[METADATA_KEY, OWNER_KEY], &quoted(&bot.id));
	parts.front = with_key(
		&parts.front,
		&[METADATA_KEY, KIROSHI_KEY, OUTPUT_STYLE_KEY],
		&quoted(styled(written.output_style)),
	);
	parts.body =
		format!("\n{}\n", briefed_with_skills(root, &bot.id, written.brief, written.memory));
	rendered(&parts)
}

fn keyed_line(front: &str, key: &str, value: &str) -> String {
	if value.is_empty() {
		without_key(front, &[key])
	} else {
		with_key(front, &[key], value)
	}
}

fn styled(output_style: &str) -> &str {
	let named = output_style.trim();
	if named.is_empty() {
		DEFAULT_OUTPUT_STYLE
	} else {
		named
	}
}

pub fn identity(bot: &Bot) -> String {
	let name = one_line(&bot.name);
	let title = one_line(&bot.title);
	let named = if title.is_empty() {
		format!("You are {name}.")
	} else {
		format!("You are {name}, {title}.")
	};
	format!("{named}\n{IDENTITY_STANCE}")
}

fn one_line(text: &str) -> String {
	text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn briefed_with_skills(root: &Path, bot_id: &str, brief: &str, memory: &str) -> String {
	let remembered = block(MEMORY_OPEN, memory.trim(), MEMORY_CLOSE);
	let above = paragraphs(&[without_generated(brief), &remembered]);
	paragraphs(&[&above, &carried_skills(root, bot_id, &above)])
}

fn carried_skills(root: &Path, bot_id: &str, above: &str) -> String {
	let level = (deepest_heading(above) + 1).min(MAX_HEADING);
	let bodies: Vec<String> = preloaded(root, bot_id)
		.into_iter()
		.map(|skill| {
			format!("{} {}\n\n{}", "#".repeat(level), skill.name, demoted(&skill.body, level))
		})
		.collect();
	block(CARRIED_OPEN, &bodies.join("\n\n"), CARRIED_CLOSE)
}

fn block(open: &str, body: &str, close: &str) -> String {
	if body.is_empty() {
		return String::new();
	}
	format!("{open}\n\n{body}\n\n{close}")
}

fn paragraphs(parts: &[&str]) -> String {
	parts.iter().filter(|part| !part.is_empty()).copied().collect::<Vec<_>>().join("\n\n")
}

type Keyed = serde_json::Map<String, serde_json::Value>;

fn write_declared(path: &Path, key: &str, entries: Keyed) -> std::io::Result<()> {
	let mut kept = object_at(path);
	if entries.is_empty() {
		kept.remove(key);
		if kept.is_empty() {
			return match fs::remove_file(path) {
				Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
				_ => Ok(()),
			};
		}
	} else {
		kept.insert(key.to_owned(), serde_json::Value::Object(entries));
	}
	private_files::replace(path, serde_json::Value::Object(kept).to_string().as_bytes())
}

fn declared(path: &Path, key: &str) -> Keyed {
	match object_at(path).remove(key) {
		Some(serde_json::Value::Object(entries)) => entries,
		_ => serde_json::Map::new(),
	}
}

fn object_at(path: &Path) -> Keyed {
	fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str(&text).ok())
		.unwrap_or_default()
}

fn rewrite_agent(root: &Path, bot: &Bot) -> std::io::Result<()> {
	rewrite_agent_holding(root, bot, &kept_memory(root, bot))
}

fn rewrite_agent_holding(root: &Path, bot: &Bot, memory: &str) -> std::io::Result<()> {
	let held = generated(root, &bot.id);
	let brief = held.as_ref().map_or(&bot.instructions, |held| &held.instructions);
	let style = held.as_ref().map_or(DEFAULT_OUTPUT_STYLE, |held| held.output_style.as_str());
	let denied = also_denied(bot, held.as_ref());
	let effort = held_effort(bot, held.as_ref());
	write_briefed(
		root,
		bot,
		Written { brief, memory, output_style: style, denied: &denied, effort },
	)
}

fn held_effort(bot: &Bot, held: Option<&Generated>) -> Option<EffortLevel> {
	held.map_or(bot.effort, |held| held.effort)
}

fn also_denied(bot: &Bot, held: Option<&Generated>) -> Vec<String> {
	let mut kept = bot.denied_tools.clone();
	kept.extend(held.into_iter().flat_map(|held| held.denied_tools.iter().cloned()));
	kept
}

fn without_generated(text: &str) -> &str {
	let below = text.split_once(IDENTITY_CLOSE).map_or(text, |(_, brief)| brief);
	let above = below.split_once(MEMORY_OPEN).map_or(below, |(brief, _)| brief);
	above.split_once(CARRIED_OPEN).map_or(above, |(brief, _)| brief).trim()
}

fn remembered(text: &str) -> &str {
	let Some((_, kept)) = below_front(text).split_once(MEMORY_OPEN) else {
		return "";
	};
	let kept = kept.split_once(CARRIED_OPEN).map_or(kept, |(kept, _)| kept);
	kept.split_once(MEMORY_CLOSE).map_or(kept, |(kept, _)| kept).trim()
}

fn deepest_heading(text: &str) -> usize {
	headed_lines(text).filter_map(|(_, level)| level).max().unwrap_or(0)
}

fn demoted(text: &str, shift: usize) -> String {
	let lines: Vec<String> = headed_lines(text)
		.map(|(line, level)| match level {
			Some(level) => {
				format!("{}{line}", "#".repeat(shift.min(MAX_HEADING.saturating_sub(level))))
			}
			None => line.to_owned(),
		})
		.collect();
	lines.join("\n")
}

fn headed_lines(text: &str) -> impl Iterator<Item = (&str, Option<usize>)> {
	let mut fenced = false;
	text.lines().map(move |line| {
		if line.trim_start().starts_with("```") {
			fenced = !fenced;
			return (line, None);
		}
		(line, if fenced { None } else { heading_level(line) })
	})
}

fn heading_level(line: &str) -> Option<usize> {
	let level = line.len() - line.trim_start_matches('#').len();
	(level > 0 && line[level..].starts_with(' ')).then_some(level)
}

fn denial_value(denied: &[String]) -> String {
	let named = denials(denied);
	if named.is_empty() {
		return String::new();
	}
	serde_json::json!(named).to_string()
}

fn denials(denied: &[String]) -> Vec<String> {
	let mut named: Vec<String> = denied
		.iter()
		.map(|tool| tool.trim().to_owned())
		.filter(|tool| !tool.is_empty() && !tool.starts_with(MCP_PREFIX) && tool != DELEGATION_TOOL)
		.collect();
	if denies_changes(&named) {
		named.push(DELEGATION_TOOL.to_owned());
	}
	named.sort();
	named.dedup();
	named
}

pub fn denies_changes(denied: &[String]) -> bool {
	CHANGING_TOOLS.iter().all(|tool| denied.iter().any(|named| named == tool))
}

fn front_denials(text: &str) -> Vec<String> {
	let Some(named) = front_value(text, DISALLOWED_KEY) else {
		return Vec::new();
	};
	if let Ok(listed) = serde_json::from_str::<Vec<String>>(&named) {
		return listed;
	}
	named
		.trim_matches(|character| character == '[' || character == ']')
		.split(',')
		.map(|tool| unquoted(tool.trim()))
		.filter(|tool| !tool.is_empty())
		.collect()
}

fn model_value(model: &str) -> String {
	let named = model.trim();
	if named.is_empty() {
		return String::new();
	}
	quoted(named)
}

fn color_value(blot: Option<AvatarBlot>) -> String {
	blot.map_or_else(String::new, |blot| quoted(blot.named()))
}

#[cfg(test)]
mod tests {
	use super::front::parts;
	use super::*;
	use crate::db::repositories::conversations::Bot;
	use crate::removed_on_drop::RemovedOnDrop;

	pub(super) fn a_bot(name: &str, instructions: &str) -> Bot {
		Bot {
			id: "b1".to_owned(),
			section_id: None,
			pin_position: None,
			name: name.to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
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

	pub(super) fn rewrite_the_brief(agent: &Path, brief: &str) {
		let text = fs::read_to_string(agent).expect("the agent file is there");
		let (front, _) = text.rsplit_once(FENCE).expect("the closing fence");
		private_files::replace(agent, format!("{front}{FENCE}\n\n{brief}\n").as_bytes())
			.expect("the hand edit lands");
	}

	fn named_model(root: &Path, bot_id: &str) -> Option<String> {
		generated(root, bot_id)?.model
	}

	fn named_blot(root: &Path, bot_id: &str) -> Option<AvatarBlot> {
		generated(root, bot_id)?.blot
	}

	pub(super) fn a_root(name: &str) -> RemovedOnDrop {
		let root = RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-bundle-{name}")));
		let _ = fs::remove_dir_all(&root);
		root
	}

	#[test]
	fn a_name_is_reduced_to_something_an_agent_can_be_promoted_under() {
		assert_eq!(slug("Bean"), "bean");
		assert_eq!(slug("Mr. Bean  Jr."), "mr-bean-jr");
		assert_eq!(slug("  "), UNNAMED);
		assert_eq!(slug("🐈"), UNNAMED);
	}

	#[test]
	fn a_written_bundle_is_the_two_files_the_agent_loads() {
		let root = a_root("written");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let manifest = fs::read_to_string(
			dir(&root, &bot.id).expect("the bundle is held").join(MANIFEST_DIR).join(MANIFEST_NAME),
		)
		.expect("the manifest is there");
		assert!(manifest.contains("\"name\": \"bean-b1\""), "got {manifest}");
		assert!(manifest.contains("\"displayName\": \"Bean\""), "got {manifest}");
		assert_eq!(
			dir(&root, &bot.id).expect("the bundle is held").file_name().and_then(|it| it.to_str()),
			Some("bean-b1")
		);
		assert_eq!(agent_ref(&bot), "bean-b1:agent");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_written_bundle_names_the_model_the_bot_answers_under() {
		let root = a_root("modelled");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.model = "haiku".to_owned();
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(named_model(&root, &bot.id).as_deref(), Some("haiku"));

		bot.model = "claude-opus-4-1-20250805".to_owned();
		write(&root, &bot).expect("the bundle is rewritten");
		assert_eq!(named_model(&root, &bot.id).as_deref(), Some("claude-opus-4-1-20250805"));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_naming_no_model_writes_no_key() {
		let root = a_root("modelless");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.model = "  ".to_owned();
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		for line in written.lines() {
			assert!(!line.starts_with("model:"), "got {written}");
		}
		assert_eq!(named_model(&root, &bot.id), None);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_written_bundle_names_the_tint_the_bot_is_marked_with() {
		let root = a_root("tinted");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.avatar_blot = Some(AvatarBlot::Purple);
		write(&root, &bot).expect("the bundle is written");

		assert!(written_agent(&root, &bot.id).contains("color: \"purple\""));
		assert_eq!(named_blot(&root, &bot.id), Some(AvatarBlot::Purple));

		bot.avatar_blot = Some(AvatarBlot::Orange);
		write(&root, &bot).expect("the bundle is rewritten");
		assert_eq!(named_blot(&root, &bot.id), Some(AvatarBlot::Orange));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_marked_with_no_tint_writes_no_key() {
		let root = a_root("untinted");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		for line in written.lines() {
			assert!(!line.starts_with("color:"), "got {written}");
		}
		assert_eq!(named_blot(&root, &bot.id), None);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_colour_this_build_has_no_tint_for_is_left_alone_and_reported_as_no_tint() {
		let root = a_root("teal");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.avatar_blot = Some(AvatarBlot::Blue);
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		let text = fs::read_to_string(&agent)
			.expect("the agent file reads")
			.replace("color: \"blue\"", "color: teal");
		private_files::replace(&agent, text.as_bytes()).expect("the hand edit lands");

		assert_eq!(named_blot(&root, &bot.id), None);
		assert!(fs::read_to_string(&agent).expect("still there").contains("color: teal"));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_denied_a_tool_names_that_tool_and_no_other() {
		let root = a_root("denied-one");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["Bash".to_owned()];
		write(&root, &bot).expect("the bundle is written");

		assert!(
			written_agent(&root, &bot.id).contains(&format!("{DISALLOWED_KEY}: [\"Bash\"]")),
			"got {}",
			written_agent(&root, &bot.id)
		);
		let read_back = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(read_back.denied_tools, vec!["Bash".to_owned()]);
		assert!(!denies_changes(&read_back.denied_tools));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn denying_the_changing_tools_one_by_one_writes_the_change_nothing_file() {
		let root = a_root("denied-each");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["Write".to_owned(), "Bash".to_owned()];
		bot.denied_tools.push("NotebookEdit".to_owned());
		bot.denied_tools.push("Edit".to_owned());
		write(&root, &bot).expect("the bundle is written");
		let picked = written_agent(&root, &bot.id);

		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is rewritten");

		assert_eq!(picked, written_agent(&root, &bot.id));
		let read_back = generated(&root, &bot.id).expect("the file is read back");
		assert!(denies_changes(&read_back.denied_tools));
		for tool in CHANGING_TOOLS {
			assert!(picked.contains(&format!("\"{tool}\"")), "got {picked}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_that_changes_nothing_is_denied_delegation_too() {
		let root = a_root("denied-delegation");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(
			written.contains(&format!(
				"{DISALLOWED_KEY}: [\"Bash\",\"Edit\",\"NotebookEdit\",\"Task\",\"Write\"]"
			)),
			"got {written}"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn delegation_is_left_alone_wherever_the_changing_tools_are_allowed() {
		let root = a_root("allowed-delegation");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		bot.denied_tools = vec![DELEGATION_TOOL.to_owned(), "WebFetch".to_owned()];
		write(&root, &bot).expect("the bundle is rewritten");

		let freed = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(freed.denied_tools, vec!["WebFetch".to_owned()]);
		assert!(!denies_changes(&freed.denied_tools));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_locked_bundle_written_without_the_delegation_tool_is_given_it_when_ensured() {
		let root = a_root("older-delegation");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		let older = written_agent(&root, &bot.id).replace(",\"Task\"", "");
		fs::write(&agent, older).expect("the older file is dropped in");
		let held = generated(&root, &bot.id).expect("the older file reads");
		assert!(!held.denied_tools.iter().any(|tool| tool == DELEGATION_TOOL));
		assert!(denies_changes(&held.denied_tools));

		ensure(&root, &bot).expect("the bundle is completed");

		let given = written_agent(&root, &bot.id);
		assert!(given.contains(&format!("\"{DELEGATION_TOOL}\"")), "got {given}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_server_s_tool_is_never_denied() {
		let root = a_root("denied-server");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["mcp__helper__write".to_owned(), "Bash".to_owned()];
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains(&format!("{DISALLOWED_KEY}: [\"Bash\"]")), "got {written}");
		assert_eq!(
			generated(&root, &bot.id).expect("the file is read back").denied_tools,
			vec!["Bash".to_owned()]
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_tool_allowed_again_is_left_unnamed() {
		let root = a_root("allowed");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = CHANGING_TOOLS.map(str::to_owned).to_vec();
		write(&root, &bot).expect("the bundle is written");

		bot.denied_tools = vec!["Bash".to_owned()];
		write(&root, &bot).expect("the bundle is rewritten");
		let held_back = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(held_back.denied_tools, vec!["Bash".to_owned()]);
		assert!(!denies_changes(&held_back.denied_tools));

		bot.denied_tools = Vec::new();
		write(&root, &bot).expect("the bundle is rewritten again");
		let written = written_agent(&root, &bot.id);
		for line in written.lines() {
			assert!(!line.starts_with(DISALLOWED_KEY), "got {written}");
		}
		assert!(generated(&root, &bot.id).expect("the file is read back").denied_tools.is_empty());

		let _ = fs::remove_dir_all(&root);
	}

	fn hand_written_front(root: &Path, bot_id: &str, lines: &str) {
		let agent = agent_file(root, bot_id).expect("the agent file is there");
		let opening = format!("{FENCE}\n");
		let edited =
			written_agent(root, bot_id).replacen(&opening, &format!("{opening}{lines}"), 1);
		private_files::replace(&agent, edited.as_bytes()).expect("the hand edit lands");
	}

	#[test]
	fn a_hook_a_bot_writes_into_its_own_front_outlives_a_rewrite() {
		let root = a_root("kept-hooks");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let declared = "hooks:\n  PreToolUse:\n    - matcher: \"Bash\"\n      hooks:\n        - type: \"command\"\n          command: \"echo \\\"held\\\"\"";
		hand_written_front(&root, &bot.id, &format!("{declared}\n"));

		ensure(&root, &bot).expect("the bundle is rewritten");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains(declared), "got {written}");
		assert!(written.contains(&format!("{NAME_KEY}: {}", quoted(AGENT_NAME))), "got {written}");
		assert!(written.contains(&format!("{OWNER_KEY}: {}", quoted(&bot.id))), "got {written}");
		assert!(written.contains(&format!("{DESCRIPTION_KEY}: {}", quoted(&bot.name))));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_tool_a_bot_denies_itself_joins_the_ones_the_reader_denied() {
		let root = a_root("kept-denials");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.denied_tools = vec!["Bash".to_owned()];
		write(&root, &bot).expect("the bundle is written");

		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		let edited = written_agent(&root, &bot.id).replace(
			&format!("{DISALLOWED_KEY}: [\"Bash\"]"),
			&format!("{DISALLOWED_KEY}: [\"WebFetch\"]"),
		);
		private_files::replace(&agent, edited.as_bytes()).expect("the hand edit lands");

		ensure(&root, &bot).expect("the bundle is rewritten");

		assert_eq!(
			generated(&root, &bot.id).expect("the file is read back").denied_tools,
			vec!["Bash".to_owned(), "WebFetch".to_owned()]
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_front_naming_no_key_leaves_the_agent_file_alone() {
		let root = a_root("unreadable-front");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		hand_written_front(&root, &bot.id, "not a key at all\n");
		let held = written_agent(&root, &bot.id);

		ensure(&root, &bot).expect_err("the unreadable front is refused");

		assert_eq!(written_agent(&root, &bot.id), held);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_generated_agent_declares_neither_skills_nor_a_permission_mode() {
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "skills: everything\npermissionMode: bypassPermissions".to_owned();
		let written = agent(
			parts(""),
			Path::new("/nowhere"),
			&bot,
			Written {
				brief: &bot.instructions,
				memory: "",
				output_style: DEFAULT_OUTPUT_STYLE,
				denied: &bot.denied_tools,
				effort: None,
			},
		);

		for line in written.lines() {
			assert!(!line.starts_with("skills:"), "got {written}");
			assert!(!line.starts_with("permissionMode:"), "got {written}");
		}
	}

	#[test]
	fn the_style_a_reader_picks_is_the_style_the_file_carries() {
		let root = a_root("styled");
		let bot = a_bot("Bean", "Answer briefly.");
		write_styled(&root, &bot, "default", None).expect("the bundle is written");

		assert_eq!(output_style(&root, &bot.id), "default");
		assert_eq!(
			generated(&root, &bot.id).expect("the file is read back").output_style,
			"default"
		);

		let _ = fs::remove_dir_all(&root);
	}

	fn agent_text(root: &Path, bot_id: &str) -> String {
		fs::read_to_string(agent_file(root, bot_id).expect("the agent file")).expect("it reads")
	}

	#[test]
	fn an_effort_written_to_the_front_reads_back_as_the_same_level() {
		let root = a_root("effort-round-trip");
		let bot = a_bot("Bean", "Answer briefly.");

		for level in [
			EffortLevel::Low,
			EffortLevel::Medium,
			EffortLevel::High,
			EffortLevel::Xhigh,
			EffortLevel::Max,
		] {
			write_styled(&root, &bot, "default", Some(level)).expect("the bundle is written");

			let read = generated(&root, &bot.id).expect("the file is read back");
			assert_eq!(read.effort, Some(level));
			let line = format!("\neffort: {}\n", level.named());
			assert_eq!(agent_text(&root, &bot.id).matches(&line).count(), 1, "no single {line}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_cleared_effort_takes_the_key_out_of_the_front() {
		let root = a_root("effort-cleared");
		let bot = a_bot("Bean", "Answer briefly.");
		write_styled(&root, &bot, "default", Some(EffortLevel::High))
			.expect("the bundle is written");

		write_styled(&root, &bot, "default", None).expect("the bundle is written again");

		assert_eq!(generated(&root, &bot.id).expect("the file is read back").effort, None);
		assert!(!agent_text(&root, &bot.id).contains("effort:"), "the key outlived the clear");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_rewrite_that_names_no_effort_keeps_the_one_on_the_disk() {
		let root = a_root("effort-kept");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write_styled(&root, &bot, "default", Some(EffortLevel::Low))
			.expect("the bundle is written");

		bot.effort = Some(EffortLevel::Max);
		write(&root, &bot).expect("the bundle is written again");

		let read = generated(&root, &bot.id).expect("the file is read back");
		assert_eq!(read.effort, Some(EffortLevel::Low));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_write_that_names_no_style_keeps_the_one_on_the_disk() {
		let root = a_root("styled-kept");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write_styled(&root, &bot, "default", None).expect("the bundle is written");

		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		assert_eq!(output_style(&root, &bot.id), "default");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_carries_the_settings_file_lying_at_its_root_and_nothing_when_it_is_missing() {
		let root = a_root("settings");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(settings_file(&root, &bot.id), None);

		let path = dir(&root, &bot.id).expect("the bundle is held").join(SETTINGS_NAME);
		fs::write(&path, "{}").expect("the settings file is written");

		assert_eq!(settings_file(&root, &bot.id), Some(path));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn everything_that_names_no_style_reads_as_the_default_one() {
		let styleless = format!("{FENCE}\nname: \"bean\"\n{FENCE}\n\nA brief.\n");

		assert_eq!(front_output_style(&styleless), DEFAULT_OUTPUT_STYLE);
		assert_eq!(styled("  "), DEFAULT_OUTPUT_STYLE);
		let root = a_root("styleless");
		assert_eq!(output_style(&root, "b1"), DEFAULT_OUTPUT_STYLE);
	}

	#[test]
	fn a_write_leaves_everything_it_did_not_generate_alone() {
		let root = a_root("shared");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let held = dir(&root, &bot.id).expect("the bundle is held");
		let skill = held.join("skills").join("baking").join("SKILL.md");
		let handwritten = held.join(AGENTS_DIR).join("helper.md");
		let servers = held.join(".mcp.json");
		for (path, content) in
			[(&skill, "how to bake"), (&handwritten, "a subagent"), (&servers, "{}")]
		{
			private_files::replace(path, content.as_bytes()).expect("the file is written");
		}

		bot.name = "Fig".to_owned();
		bot.title = "Baker".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let moved = dir(&root, &bot.id).expect("the bundle is held");
		for (path, content) in [
			(skill.strip_prefix(&held).expect("under the bundle"), "how to bake"),
			(handwritten.strip_prefix(&held).expect("under the bundle"), "a subagent"),
			(servers.strip_prefix(&held).expect("under the bundle"), "{}"),
		] {
			assert_eq!(fs::read_to_string(moved.join(path)).ok().as_deref(), Some(content));
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_write_sets_the_keys_it_owns_and_keeps_every_other_one() {
		let root = a_root("manifest");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let path =
			dir(&root, &bot.id).expect("the bundle is held").join(MANIFEST_DIR).join(MANIFEST_NAME);
		let mut written: serde_json::Map<String, serde_json::Value> =
			serde_json::from_str(&fs::read_to_string(&path).expect("the manifest is there"))
				.expect("the manifest is json");
		written.insert("mcpServers".to_owned(), "./.mcp.json".into());
		private_files::replace(&path, serde_json::Value::Object(written).to_string().as_bytes())
			.expect("the reader's manifest lands");

		bot.title = "Baker".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let kept: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(&path).expect("the manifest is there"))
				.expect("the manifest is json");
		assert_eq!(kept["mcpServers"], "./.mcp.json");
		assert_eq!(kept["name"], "bean-b1");
		assert_eq!(kept["displayName"], "Bean");
		assert_eq!(kept["description"], "Baker");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_agent_generated_under_another_name_moves_to_the_one_every_bundle_uses() {
		let root = a_root("moved");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let agent = agent_path(&root, &bot.id).expect("the bundle is held");
		let dropped = agent.with_file_name("bean.md");
		fs::rename(&agent, &dropped).expect("the agent takes the old name");

		write(&root, &bot).expect("the bundle is written again");

		assert!(!dropped.exists(), "the old agent is still there");
		assert_eq!(agent_file(&root, &bot.id).as_ref(), Some(&agent));
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_renamed_bot_keeps_the_agent_file_it_already_had() {
		let root = a_root("renamed");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let taken = agent_path(&root, &bot.id).expect("the bundle is held");

		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let agent = agent_path(&root, &bot.id).expect("the bundle is held");
		assert!(!taken.exists(), "the bundle stayed under the old name");
		assert_eq!(agent_file(&root, &bot.id).as_ref(), Some(&agent));
		let written = fs::read_to_string(&agent).expect("the agent is there");
		assert!(written.contains("name: \"agent\""), "got {written}");
		assert_eq!(agent_ref(&bot), "fig-b1:agent");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_body_edited_by_hand_is_adopted_and_never_written_over() {
		let root = a_root("adopted");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		assert_eq!(adopted(&root, &bot), None, "a bundle nobody touched was reported as changed");

		let agent = agent_file(&root, &bot.id).expect("the agent is there");
		rewrite_the_brief(&agent, "Answer only in French.");
		assert_eq!(adopted(&root, &bot).as_deref(), Some("Answer only in French."));

		bot.instructions = reconciled(&root, &bot, "Answer briefly.");
		bot.name = "Fig".to_owned();
		write(&root, &bot).expect("the rename is written");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer only in French."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_brief_ending_in_a_space_is_not_taken_for_a_hand_edit() {
		let root = a_root("still-typing");
		let bot = a_bot("Bean", "Parles ");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(
			adopted(&root, &bot),
			None,
			"the space the reader typed was reported as a hand edit"
		);
		assert_eq!(
			reconciled(&root, &bot, "Parles "),
			"Parles ",
			"the space the reader typed was taken back out"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_brief_saved_with_windows_line_endings_is_read_as_the_body_it_is() {
		let by_hand = "---\r\nname: \"bean\"\r\n---\r\n\r\nAnswer only in French.\r\n";

		assert_eq!(body(by_hand), "Answer only in French.");
		assert_eq!(body("Answer only in French.\r\n"), "Answer only in French.");
	}

	#[test]
	fn a_brief_the_reader_changed_is_what_lands_over_the_file() {
		let root = a_root("reconciled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(reconciled(&root, &bot, "Answer at length."), "Answer at length.");
		assert_eq!(reconciled(&root, &bot, "Answer briefly."), "Answer briefly.");

		let _ = fs::remove_dir_all(&root);
	}

	fn tree_of(path: &Path) -> Vec<(PathBuf, Vec<u8>)> {
		let mut held = Vec::new();
		for entry in fs::read_dir(path).expect("the directory lists") {
			let path = entry.expect("the entry reads").path();
			if path.is_dir() {
				held.push((path.clone(), Vec::new()));
				held.extend(tree_of(&path));
			} else {
				held.push((path.clone(), fs::read(&path).expect("the file reads")));
			}
		}
		held.sort();
		held
	}

	#[test]
	fn a_bundle_that_is_not_there_is_refused_by_name_and_laid_down_nowhere() {
		let root = a_root("absent");
		write(&root, &Bot { id: "b2".to_owned(), ..a_bot("Sprout", "Answer at length.") })
			.expect("another bundle is written");
		let bot = a_bot("Bean", "Answer briefly.");
		let before = tree_of(&root.join(PLUGINS_DIR));

		assert!(lookup(&root, &bot.id).expect("the plugins list").is_none());
		let refused = ensure(&root, &bot).expect_err("the missing bundle is refused");

		assert_eq!(refused.bot_id, bot.id);
		assert_eq!(refused.cause.kind(), std::io::ErrorKind::NotFound);
		assert_eq!(tree_of(&root.join(PLUGINS_DIR)), before);
		assert_eq!(instructions(&root, &bot.id), None);
	}

	#[cfg(unix)]
	#[test]
	fn a_plugins_directory_that_cannot_be_listed_fails_the_lookup_and_lays_down_nothing() {
		use std::os::unix::fs::PermissionsExt;

		let root = a_root("unlisted");
		let bot = a_bot("Bean", "Answer briefly.");
		let plugins = root.join(PLUGINS_DIR);
		private_files::create_dir(&plugins).expect("the plugins directory stands");
		fs::set_permissions(&plugins, fs::Permissions::from_mode(0o000)).expect("it is sealed");

		let looked = lookup(&root, &bot.id);
		let ensured = ensure(&root, &bot);
		let written = write(&root, &bot);
		fs::set_permissions(&plugins, fs::Permissions::from_mode(0o700)).expect("it is unsealed");

		assert!(looked.is_err(), "the lookup answered {looked:?}");
		assert!(ensured.is_err_and(|refused| refused.bot_id == bot.id));
		assert!(written.is_err());
		assert!(!plugins.join(&bot.id).exists(), "a bundle was laid down under the bot id");
		assert_eq!(tree_of(&plugins), Vec::new());
	}

	#[test]
	fn a_created_bot_lays_its_bundle_under_its_name_and_never_under_its_id() {
		let root = a_root("created");
		let bot = a_bot("Bean Sprout", "Answer briefly.");

		write(&root, &bot).expect("the bundle is written");

		let plugins = root.join(PLUGINS_DIR);
		assert_eq!(
			lookup(&root, &bot.id).expect("the plugins list"),
			Some(plugins.join("bean-sprout-b1"))
		);
		assert!(!plugins.join(&bot.id).exists());
		assert_eq!(titles(&root, &bot.id), vec!["Bot \"Bean Sprout\" saved from settings"]);
	}

	#[test]
	fn a_removed_bundle_reads_as_none() {
		let root = a_root("removed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		remove(&root, &bot.id);

		assert_eq!(instructions(&root, &bot.id), None);
	}

	#[test]
	fn a_written_bundle_carries_neither_a_hook_nor_a_learn_skill() {
		let root = a_root("unhooked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		assert!(!bundle.join(HOOKS_DIR).exists(), "the bundle carries a hook");
		assert!(
			!bundle.join(SKILLS_DIR).join(LEARN_ID).exists(),
			"the bundle carries a learn copy"
		);
		assert!(skills(&root, &bot.id).is_empty(), "a bot nobody taught has a skill");
		assert!(!written_agent(&root, &bot.id).contains(CARRIED_OPEN), "something was carried");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_reads_as_the_hosts_while_it_carries_the_mark() {
		let root = a_root("system-mark");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let path = dir(&root, &bot.id)
			.expect("the bundle is held")
			.join(SKILLS_DIR)
			.join("remembering")
			.join(SKILL_NAME);
		let kept = format!(
			"{FENCE}\nname: remembering\nmetadata:\n  kiroshi:\n    system: true\n{FENCE}\n\nRewritten.\n"
		);
		private_files::replace(&path, kept.as_bytes()).expect("the older file lands");
		assert!(is_system_skill(&root, &bot.id, "remembering"), "the mark was not read back");

		let bare = format!("{FENCE}\nname: remembering\n{FENCE}\n\nMine now.\n");
		private_files::replace(&path, bare.as_bytes()).expect("the rewrite lands");
		assert!(
			!is_system_skill(&root, &bot.id, "remembering"),
			"a file that dropped the key still reads as the host's"
		);

		let ours = create_skill(
			&root,
			&bot,
			&SkillDraft {
				name: "Tone".into(),
				description: "How to answer.".into(),
				body: "Briefly.".into(),
				front: SkillFront::default(),
			},
		)
		.expect("the skill is created");
		assert!(!ours.is_system, "a skill a reader created reads as the host's");
		assert!(!is_system_skill(&root, &bot.id, "nothing-of-the-sort"));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_told_nothing_carries_its_skills_and_still_reads_as_told_nothing() {
		let root = a_root("untold");
		let bot = a_bot("Bean", "");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		assert!(written_agent(&root, &bot.id).contains(CARRIED_OPEN));
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(""));
		assert_eq!(adopted(&root, &bot), None, "an empty brief was read back as an edit");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bundle_from_before_the_system_plugin_has_the_hosts_files_taken_back() {
		let root = a_root("unequipped");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		let hooks = bundle.join(HOOKS_DIR);
		let declared = format!(
			r#"{{"hooks":{{"SessionStart":[{{"hooks":[{{"type":"command","command":"${{CLAUDE_PLUGIN_ROOT}}/{HOOKS_DIR}/{SESSION_START_NAME}"}}]}}]}}}}"#
		);
		private_files::replace(&hooks.join(HOOKS_NAME), declared.as_bytes())
			.expect("the older hook lands");
		private_files::replace(&hooks.join(SESSION_START_NAME), b"#!/bin/sh\n")
			.expect("the older script lands");
		private_files::replace(
			&bundle.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME),
			format!("{FENCE}\nname: learn\nmetadata:\n  kiroshi:\n    system: true\n{FENCE}\n\nOld rules.\n")
				.as_bytes(),
		)
		.expect("the older copy lands");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(&agent, "Answer at length.");

		ensure(&root, &bot).expect("the bundle is completed");

		assert!(!hooks.exists(), "the hook is still there");
		assert!(!bundle.join(SKILLS_DIR).join(LEARN_ID).exists(), "the learn copy is still there");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));
		let written = written_agent(&root, &bot.id);
		assert!(written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Old rules."), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_learn_a_reader_owns_and_a_hook_somebody_else_wrote_both_stay() {
		let root = a_root("kept");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		let mine = format!("{FENCE}\nname: learn\n{FENCE}\n\nMine now.\n");
		private_files::replace(
			&bundle.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME),
			mine.as_bytes(),
		)
		.expect("the reader's file lands");
		private_files::replace(&bundle.join(HOOKS_DIR).join("theirs.sh"), b"#!/bin/sh\n")
			.expect("their script lands");
		let theirs = r#"{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"${CLAUDE_PLUGIN_ROOT}/hooks/theirs.sh"}]}]}}"#;
		private_files::replace(&bundle.join(HOOKS_DIR).join(HOOKS_NAME), theirs.as_bytes())
			.expect("their declaration lands");

		ensure(&root, &bot).expect("the bundle is completed");

		assert_eq!(written_skill_file(&root, &bot.id, LEARN_ID), mine);
		assert!(bundle.join(HOOKS_DIR).join("theirs.sh").is_file(), "their script went");
		assert_eq!(
			fs::read_to_string(bundle.join(HOOKS_DIR).join(HOOKS_NAME)).expect("it reads"),
			theirs,
			"their declaration went"
		);

		let _ = fs::remove_dir_all(&root);
	}

	pub(super) fn a_held_bundle(root: &Path, bot_id: &str) -> PathBuf {
		let held = lookup(root, bot_id).expect("the plugins list");
		held.unwrap_or_else(|| {
			created(root, &Bot { id: bot_id.to_owned(), ..a_bot("Bean", "Answer briefly.") })
				.expect("the bundle is created")
		})
	}

	fn dropped_skill(root: &Path, bot_id: &str, skill_id: &str) -> PathBuf {
		a_held_bundle(root, bot_id).join(SKILLS_DIR).join(skill_id).join(SKILL_NAME)
	}

	pub(super) fn drop_a_skill(
		root: &Path,
		bot_id: &str,
		name: &str,
		preload: bool,
		body: &str,
	) -> PathBuf {
		let path = dropped_skill(root, bot_id, name);
		let mark = if preload { "metadata:\n  kiroshi:\n    preload: true\n" } else { "" };
		private_files::replace(
			&path,
			format!("{FENCE}\nname: {name}\n{mark}{FENCE}\n\n{body}\n").as_bytes(),
		)
		.expect("the skill is dropped in");
		path
	}

	pub(super) fn written_agent(root: &Path, bot_id: &str) -> String {
		fs::read_to_string(agent_file(root, bot_id).expect("the agent is there"))
			.expect("the agent file reads")
	}

	#[test]
	fn a_skill_marked_for_preloading_is_carried_in_the_agent_body() {
		let root = a_root("preloaded");
		let bot = a_bot("Bean", "Answer briefly.");
		let quiet = drop_a_skill(&root, &bot.id, "kneading", false, "Knead for ten minutes.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains(CARRIED_OPEN), "got {written}");
		assert!(written.contains(CARRIED_CLOSE), "got {written}");
		assert!(written.contains("# baking"), "got {written}");
		assert!(written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Knead for ten minutes."), "got {written}");
		assert!(
			dropped_skill(&root, &bot.id, "kneading").is_file(),
			"the unmarked skill was taken off the disk, it was at {}",
			quiet.display()
		);
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_agent_body_opens_on_the_brief_and_carries_no_identity() {
		let root = a_root("identity");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.title = "the baker".to_owned();
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.ends_with("Answer briefly.\n"), "got {written}");
		assert!(!written.contains("You are Bean"), "got {written}");
		assert!(!written.contains("You are not Claude Code"), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_identity_zone_an_older_build_wrote_is_taken_back_out() {
		let root = a_root("unidentified");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!("You are somebody else.\n\n{IDENTITY_CLOSE}\n\nAnswer at length."),
		);

		ensure(&root, &bot).expect("the bundle is completed");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains(IDENTITY_CLOSE), "got {written}");
		assert!(!written.contains("You are somebody else."), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));
		assert_eq!(adopted(&root, &bot).as_deref(), Some("Answer at length."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_that_learned_nothing_gets_an_agent_file_without_the_markers() {
		let root = a_root("unlearned");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains(MEMORY_OPEN), "got {written}");
		assert!(!written.contains(MEMORY_CLOSE), "got {written}");
		assert_eq!(generated(&root, &bot.id).expect("the file reads").memory, "");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn what_the_bot_learned_sits_under_the_brief_and_over_the_carried_skills() {
		let root = a_root("learned");
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.memory = "They bake on Sundays.".to_owned();
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		let brief = written.find("Answer briefly.").expect("the brief is there");
		let open = written.find(MEMORY_OPEN).expect("the block opens");
		let close = written.find(MEMORY_CLOSE).expect("the block closes");
		let carried = written.find(CARRIED_OPEN).expect("the skills are carried");
		assert!(brief < open && open < close && close < carried, "got {written}");
		assert!(written.contains("They bake on Sundays."), "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_save_from_settings_carries_the_block_the_bot_wrote_over_unchanged() {
		let root = a_root("carried-memory");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!("Answer briefly.\n\n{MEMORY_OPEN}\n\nThey bake on Sundays.\n\n{MEMORY_CLOSE}"),
		);

		assert_eq!(adopted_memory(&root, &bot).as_deref(), Some("They bake on Sundays."));
		bot.instructions = "Answer at length.".to_owned();
		write(&root, &bot).expect("the bundle is written again");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("They bake on Sundays."), "got {written}");
		assert_eq!(written.matches(MEMORY_OPEN).count(), 1, "got {written}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));

		bot.memory = "They bake on Sundays.".to_owned();
		assert_eq!(adopted_memory(&root, &bot), None, "an unchanged block was adopted again");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_memory_saved_from_settings_lands_in_the_block_and_clearing_it_empties_it_for_good() {
		let root = a_root("saved-memory");
		let mut bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		write_remembered(&root, &bot, "They bake on Sundays.").expect("the memory is saved");
		let held = generated(&root, &bot.id).expect("the file reads");
		assert_eq!(held.memory, "They bake on Sundays.");
		assert_eq!(held.instructions, "Answer briefly.");

		write_remembered(&root, &bot, "").expect("the memory is cleared");
		let cleared = written_agent(&root, &bot.id);
		assert!(!cleared.contains(MEMORY_OPEN), "got {cleared}");

		bot.instructions = "Answer at length.".to_owned();
		write(&root, &bot).expect("the bundle is written again");
		let saved = written_agent(&root, &bot.id);
		assert!(!saved.contains(MEMORY_OPEN), "got {saved}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer at length."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_block_the_bot_left_open_is_read_to_the_end_of_the_body() {
		let root = a_root("unclosed-memory");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let agent = agent_file(&root, &bot.id).expect("the agent file is there");
		rewrite_the_brief(
			&agent,
			&format!("Answer briefly.\n\n{MEMORY_OPEN}\n\nThey bake on Sundays."),
		);

		assert_eq!(
			generated(&root, &bot.id).expect("the file reads").memory,
			"They bake on Sundays."
		);
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_identity_names_the_bot_over_the_stance_the_host_owns() {
		let mut bot = a_bot("Bean", "Answer briefly.");
		assert!(identity(&bot).starts_with("You are Bean.\n"), "got {}", identity(&bot));

		bot.title = "the baker".to_owned();
		let told = identity(&bot);
		assert!(told.starts_with("You are Bean, the baker.\n"), "got {told}");
		assert!(told.contains("You are not Claude Code"), "got {told}");
		assert!(told.contains("plugin, skills, files, sessions"), "got {told}");
		assert!(told.contains("you say so plainly"), "got {told}");
	}

	#[test]
	fn a_brief_survives_two_consecutive_writes_with_a_skill_carried() {
		let root = a_root("twice");
		let mut bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");
		let first = written_agent(&root, &bot.id);

		bot.instructions = reconciled(&root, &bot, "Answer briefly.");
		write(&root, &bot).expect("the bundle is written again");
		let second = written_agent(&root, &bot.id);

		assert_eq!(first, second);
		assert_eq!(second.matches(CARRIED_OPEN).count(), 1, "got {second}");
		assert_eq!(second.matches("Bake at 220 degrees.").count(), 1, "got {second}");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some("Answer briefly."));
		assert_eq!(adopted(&root, &bot), None, "the carried region was reported as a brief");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_that_loses_its_mark_or_its_file_is_dropped_on_the_next_write() {
		let root = a_root("dropped");
		let bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		drop_a_skill(&root, &bot.id, "kneading", true, "Knead for ten minutes.");
		write(&root, &bot).expect("the bundle is written");

		drop_a_skill(&root, &bot.id, "baking", false, "Bake at 220 degrees.");
		let kneading = dropped_skill(&root, &bot.id, "kneading");
		fs::remove_dir_all(kneading.parent().expect("the skill directory")).expect("taken away");
		write(&root, &bot).expect("the bundle is written again");

		let written = written_agent(&root, &bot.id);
		assert!(!written.contains("Bake at 220 degrees."), "got {written}");
		assert!(!written.contains("Knead for ten minutes."), "got {written}");
		assert!(!written.contains("# baking"), "got {written}");
		assert!(!written.contains("# kneading"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_carried_skill_keeps_its_structure_under_the_brief() {
		let root = a_root("demoted");
		let bot = a_bot("Bean", "Answer briefly.\n\n# Rules\n\n## Tone\n\nWarm.");
		drop_a_skill(
			&root,
			&bot.id,
			"baking",
			true,
			"# Baking\n\n## Heat\n\n```sh\n# not a heading\n```",
		);
		write(&root, &bot).expect("the bundle is written");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("### baking"), "got {written}");
		assert!(written.contains("#### Baking"), "got {written}");
		assert!(written.contains("##### Heat"), "got {written}");
		assert!(written.contains("\n# not a heading\n"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	pub(super) fn a_draft(name: &str, description: &str, body: &str) -> SkillDraft {
		SkillDraft {
			name: name.to_owned(),
			description: description.to_owned(),
			body: body.to_owned(),
			front: SkillFront::default(),
		}
	}

	pub(super) fn written_skill_file(root: &Path, bot_id: &str, skill_id: &str) -> String {
		fs::read_to_string(dropped_skill(root, bot_id, skill_id)).expect("the skill file reads")
	}

	#[test]
	fn the_marketplace_lists_every_bot_by_id_and_relative_source() {
		let root = a_root("marketplace");
		let first = a_bot("Bean", "Answer briefly.");
		let mut second = a_bot("Fig", "Answer at length.");
		second.id = "b2".to_owned();
		write(&root, &first).expect("the first bundle is written");
		write_marketplace(&root, &[first, second]).expect("the marketplace is written");

		let listed: serde_json::Value = serde_json::from_str(
			&fs::read_to_string(marketplace_file(&root)).expect("the marketplace is there"),
		)
		.expect("the marketplace is json");

		assert_eq!(listed["name"], MARKETPLACE);
		assert_eq!(listed["plugins"][0]["name"], "bean-b1");
		assert_eq!(listed["plugins"][0]["source"], "./plugins/bean-b1");
		assert_eq!(listed["plugins"][1]["name"], "fig-b2");
		assert_eq!(listed["plugins"][1]["source"], "./plugins/fig-b2");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn both_files_the_marketplace_needs_are_written_a_reader_can_follow() {
		let root = a_root("indented");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		write_marketplace(&root, std::slice::from_ref(&bot)).expect("the marketplace is written");

		for path in [
			marketplace_file(&root),
			manifest_file(&dir(&root, &bot.id).expect("the bundle is held")),
		] {
			let text = fs::read_to_string(&path).expect("the file is there");
			let held: serde_json::Value = serde_json::from_str(&text).expect("the file is json");
			assert_eq!(text, indented_json(&held), "got {text}");
			assert!(text.contains("\n  \""), "got {text}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bundle_still_named_after_the_bot_id_moves_once_and_keeps_its_history() {
		let root = a_root("migrated");
		let bot = a_bot("Bean", "Answer briefly.");
		let legacy = root.join(PLUGINS_DIR).join(&bot.id);
		write_at_legacy_name(&root, &bot);
		let untracked = legacy.join(SKILLS_DIR).join("baking").join("notes.md");
		private_files::replace(&untracked, b"how to bake").expect("the loose file lands");

		ensure(&root, &bot).expect("the bundle is completed");

		let moved = dir(&root, &bot.id).expect("the bundle is held");
		assert_eq!(moved, root.join(PLUGINS_DIR).join("bean-b1"));
		assert!(!legacy.exists(), "the bundle stayed under the bot id");
		assert_eq!(
			fs::read_to_string(moved.join(SKILLS_DIR).join("baking").join("notes.md"))
				.ok()
				.as_deref(),
			Some("how to bake")
		);
		assert!(
			titles(&root, &bot.id).iter().any(|title| title.contains("Bean")),
			"the history did not travel"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[cfg(unix)]
	#[test]
	fn a_legacy_bundle_that_cannot_be_renamed_is_used_where_it_stands() {
		use std::os::unix::fs::PermissionsExt;

		let root = a_root("unrenamed");
		let bot = a_bot("Bean", "Answer briefly.");
		let legacy = root.join(PLUGINS_DIR).join(&bot.id);
		write_at_legacy_name(&root, &bot);
		let plugins = root.join(PLUGINS_DIR);
		fs::set_permissions(&plugins, fs::Permissions::from_mode(0o500)).expect("it is sealed");

		let settled_at = settled(&root, &bot, legacy.clone());
		let ensured = ensure(&root, &bot);
		fs::set_permissions(&plugins, fs::Permissions::from_mode(0o700)).expect("it is unsealed");

		assert_eq!(settled_at, legacy);
		assert_eq!(ensured.expect("the turn goes on with the held bundle"), legacy);
		assert!(!plugins.join(dir_name(&bot)).exists(), "the bundle moved");
	}

	#[test]
	fn a_bundle_whose_name_is_taken_stays_where_it_is() {
		let root = a_root("taken-name");
		let bot = a_bot("Bean", "Answer briefly.");
		let legacy = root.join(PLUGINS_DIR).join(&bot.id);
		write_at_legacy_name(&root, &bot);
		let squatter = root.join(PLUGINS_DIR).join("bean-b1");
		private_files::replace(&squatter.join("README.md"), b"somebody else").expect("it lands");

		ensure(&root, &bot).expect("the bundle is completed");

		assert_eq!(dir(&root, &bot.id).expect("the bundle is held"), legacy);
		assert!(agent_file(&root, &bot.id).is_some_and(|path| path.starts_with(&legacy)));
		assert_eq!(
			fs::read_to_string(squatter.join("README.md")).ok().as_deref(),
			Some("somebody else")
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_deleted_bot_takes_its_own_bundle_and_nothing_beside_it() {
		let root = a_root("deleted");
		let bot = a_bot("Bean", "Answer briefly.");
		let mut other = a_bot("Fig", "Answer at length.");
		other.id = "b2".to_owned();
		write(&root, &bot).expect("the first bundle is written");
		write(&root, &other).expect("the second bundle is written");

		remove(&root, &bot.id);

		assert!(!root.join(PLUGINS_DIR).join("bean-b1").exists());
		assert!(root.join(PLUGINS_DIR).join("fig-b2").is_dir());

		let _ = fs::remove_dir_all(&root);
	}

	fn write_at_legacy_name(root: &Path, bot: &Bot) {
		write(root, bot).expect("the bundle is written");
		fs::rename(
			dir(root, &bot.id).expect("the bundle is held"),
			root.join(PLUGINS_DIR).join(&bot.id),
		)
		.expect("the bundle takes the old name");
	}

	fn patch_of(root: &Path, bot_id: &str, commit_id: &str) -> String {
		changed_files(root, bot_id, commit_id, commit_id)
			.expect("the diff reads")
			.into_iter()
			.map(|file| file.patch)
			.collect()
	}

	fn titles(root: &Path, bot_id: &str) -> Vec<String> {
		history(root, bot_id)
			.expect("the history reads")
			.into_iter()
			.map(|entry| entry.title)
			.collect()
	}

	#[test]
	fn the_first_write_records_the_whole_bundle_under_one_title() {
		let root = a_root("git-first");
		let bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", false, "Bake at 220 degrees.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(titles(&root, &bot.id), vec!["Bot \"Bean\" saved from settings"]);
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.author, Author::User);
		assert!(entry.timestamp > 0, "got {}", entry.timestamp);
		assert!(entry.body.is_empty(), "got {}", entry.body);

		let shown = patch_of(&root, &bot.id, &entry.id);
		assert!(shown.contains("Bake at 220 degrees."), "got {shown}");
		assert!(shown.contains("plugin.json"), "got {shown}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn every_write_is_one_sentence_naming_what_it_changed() {
		let root = a_root("git-every");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let skill =
			create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
				.expect("the skill is created");
		update_skill(&root, &bot, &skill.id, &a_draft("Kneading", "How to knead.", "Twelve."))
			.expect("the skill is updated");
		set_skill_preloaded(&root, &bot, &skill.id, true).expect("the skill is marked");
		set_skill_preloaded(&root, &bot, &skill.id, false).expect("the skill is unmarked");
		set_mcp_server(&root, &bot, "clock", &serde_json::json!({ "command": "clock" }), None)
			.expect("the server is written");
		remove_mcp_server(&root, &bot, "clock").expect("the server is removed");
		remove_skill(&root, &bot, &skill.id).expect("the skill is removed");

		assert_eq!(
			titles(&root, &bot.id),
			vec![
				"Skill \"Kneading\" removed from settings",
				"MCP server \"clock\" removed from settings",
				"MCP server \"clock\" saved from settings",
				"Skill \"Kneading\" taken out of the brief from settings",
				"Skill \"Kneading\" added to the brief from settings",
				"Skill \"Kneading\" updated from settings",
				"Skill \"Kneading\" created from settings",
				"Bot \"Bean\" saved from settings",
			]
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_write_that_changes_nothing_records_nothing() {
		let root = a_root("git-unchanged");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		write(&root, &bot).expect("the bundle is written again");
		ensure(&root, &bot).expect("the bundle is ensured");

		assert_eq!(titles(&root, &bot.id).len(), 1);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bundle_with_no_repository_is_refused_when_it_is_ensured_and_left_without_one() {
		let root = a_root("git-ensured");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		fs::remove_dir_all(bundle.join(".git")).expect("the repository is dropped");

		let refused = ensure(&root, &bot).expect_err("the bundle is refused");

		assert_eq!(refused.bot_id, bot.id);
		assert!(!bundle.join(".git").exists(), "a repository was created");
	}

	#[test]
	fn what_the_bot_writes_for_itself_is_left_out_of_the_history() {
		let root = a_root("git-learned");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		private_files::replace(
			&dir(&root, &bot.id).expect("the bundle is held").join(".learned.md"),
			b"Bean likes figs.",
		)
		.expect("the memory lands");
		create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
			.expect("the skill is created");

		let excluded = fs::read_to_string(
			dir(&root, &bot.id).expect("the bundle is held").join(".git/info/exclude"),
		)
		.expect("the exclude file is there");
		assert!(excluded.lines().any(|line| line == ".learned.md"), "got {excluded}");
		for entry in history(&root, &bot.id).expect("the history reads") {
			let shown = patch_of(&root, &bot.id, &entry.id);
			assert!(!shown.contains("Bean likes figs."), "got {shown}");
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_duplicate_inherits_the_bundle_with_the_memory_and_the_history() {
		let root = a_root("inherit");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let source = dir(&root, &bot.id).expect("the bundle is held");
		drop_a_skill(&root, &bot.id, "kneading", true, "How to knead.");
		private_files::replace(&source.join(HOOKS_DIR).join("pre.sh"), b"echo figs")
			.expect("the hook lands");
		private_files::replace(&source.join(MCP_NAME), b"{\"mcpServers\":{}}")
			.expect("the servers land");
		private_files::replace(&source.join(LEARNED_NAME), b"Bean likes figs.")
			.expect("the memory lands");
		write_remembered(&root, &bot, "Bean bakes on Sundays.").expect("the block is written");

		let copied = Bot { id: "bot-copy".to_owned(), ..a_bot("Bean", "Answer briefly.") };
		inherit(&root, &bot.id, &copied).expect("the bundle is inherited");

		let copy = dir(&root, "bot-copy").expect("the bundle is held");
		assert!(
			skills(&root, "bot-copy")
				.iter()
				.any(|skill| skill.id == "kneading" && skill.body.contains("How to knead.")),
			"the skill came over"
		);
		assert_eq!(
			fs::read_to_string(copy.join(HOOKS_DIR).join("pre.sh")).expect("the hook came over"),
			"echo figs"
		);
		assert_eq!(
			fs::read_to_string(copy.join(MCP_NAME)).expect("the servers came over"),
			"{\"mcpServers\":{}}"
		);
		assert_eq!(
			fs::read_to_string(copy.join(LEARNED_NAME)).expect("the memory came over"),
			"Bean likes figs."
		);
		assert_eq!(
			generated(&root, "bot-copy").expect("the copy owns an agent file").memory,
			"Bean bakes on Sundays.",
			"the learned block did not come over"
		);
		assert_eq!(titles(&root, "bot-copy"), titles(&root, &bot.id), "the history came over");
		assert!(source.join(LEARNED_NAME).exists(), "the source lost its memory");
		assert_eq!(
			generated(&root, &bot.id).expect("the source owns its agent file").memory,
			"Bean bakes on Sundays.",
			"the source lost its learned block"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_undone_write_lands_on_the_disk_and_on_top_of_the_history() {
		let root = a_root("git-revert");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let skill =
			create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
				.expect("the skill is created");
		let created = history(&root, &bot.id).expect("the history reads")[0].id.clone();

		revert(&root, &bot.id, &created, &created).expect("the write is undone");

		let titles = titles(&root, &bot.id);
		assert_eq!(titles[0], "Change undone: Skill \"Kneading\" created from settings");
		assert_eq!(titles.len(), 3);
		assert!(skills(&root, &bot.id).is_empty(), "the skill is back on the disk");
		assert!(!dir(&root, &bot.id)
			.expect("the bundle is held")
			.join(SKILLS_DIR)
			.join(&skill.id)
			.exists());

		let _ = fs::remove_dir_all(&root);
	}

	fn a_bot_writes(root: &Path, bot_id: &str, name: &str, body: &str) {
		let path = a_held_bundle(root, bot_id).join(SKILLS_DIR).join(name).join(SKILL_NAME);
		let text = format!(
			"{FENCE}\n{NAME_KEY}: {name}\n{DESCRIPTION_KEY}: What {name} is for.\n{PRELOAD_KEY}: {MARKED}\n{FENCE}\n\n{body}\n"
		);
		private_files::replace(&path, text.as_bytes()).expect("the bot's write lands");
	}

	#[test]
	fn a_turn_that_left_the_bundle_alone_records_nothing() {
		let root = a_root("evolve-clean");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(evolve(&root, &bot), Evolved::Unchanged);
		assert_eq!(titles(&root, &bot.id).len(), 1);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn what_the_bot_wrote_is_recorded_under_what_it_said_about_it() {
		let root = a_root("evolve-learned");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME),
			b"Bean learned about figs\n\nThey said figs, not dates.\n",
		)
		.expect("the note lands");

		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert_eq!(evolution.title, "Bean learned about figs");
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.id, evolution.commit_id);
		assert_eq!(entry.author, Author::Bot);
		assert_eq!(entry.body, "They said figs, not dates.");
		assert!(
			!dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME).exists(),
			"the note is still there"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_write_keeps_its_evolution_when_the_owner_only_walk_fails() {
		let root = a_root("evolve-walk-stopped");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME),
			b"Bean learned about figs\n",
		)
		.expect("the note lands");

		git::stop_the_next_owner_only_walk();
		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.id, evolution.commit_id);
		assert!(
			!dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME).exists(),
			"the note is still there"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_recorded_turn_carries_the_agent_file_the_next_session_starts_on() {
		let root = a_root("evolve-agent");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");

		recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert!(written_agent(&root, &bot.id).contains("Bean likes figs."));
		assert!(
			git::changes(&dir(&root, &bot.id).expect("the bundle is held"))
				.expect("the status reads")
				.is_empty(),
			"the bundle is left uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_the_bot_said_nothing_about_is_recorded_under_the_paths_it_changed() {
		let root = a_root("evolve-silent");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");

		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert_eq!(evolution.title, EVOLVED_TITLE);
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert!(entry.body.contains("skills/figs/SKILL.md"), "got {}", entry.body);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_note_with_no_title_leaves_the_write_named_by_this_app() {
		let root = a_root("evolve-blank");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME),
			b"   \n\nFigs.\n",
		)
		.expect("the note lands");

		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert_eq!(evolution.title, EVOLVED_TITLE);

		let _ = fs::remove_dir_all(&root);
	}

	const AT_ONCE: [&str; 4] = ["figs", "dates", "plums", "pears"];

	fn nothing_prepared(_root: &Path, _bot: &Bot, _label: &str) {}

	#[test]
	fn a_bot_write_and_a_space_write_do_not_wait_on_each_other() {
		let root = a_root("locks-apart");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let elsewhere = a_root("locks-apart-space");
		space::lay_down_at(&elsewhere).expect("the space plugin is laid down");

		let held = serialised(&dir(&root, &bot.id).expect("the bundle is held"));
		let (written, waited) = std::sync::mpsc::channel();
		let space_path = elsewhere.to_path_buf();
		let writer = std::thread::spawn(move || {
			plugin::create_skill(&space_path, &a_draft("figs", "What it is for.", "How it goes."))
				.expect("the skill is created");
			written.send(()).expect("the write is reported");
		});
		waited
			.recv_timeout(std::time::Duration::from_secs(10))
			.expect("the space write finished while the bot bundle lock was held");
		drop(held);
		writer.join().expect("the space write ends");

		let _ = fs::remove_dir_all(&root);
		let _ = fs::remove_dir_all(&elsewhere);
	}

	fn commits_at_once(
		root_name: &str,
		prepare: fn(&Path, &Bot, &str),
		act: fn(&Path, &Bot, &str),
	) {
		let root = a_root(root_name);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		for label in AT_ONCE {
			prepare(&root, &bot, label);
		}
		let before = titles(&root, &bot.id).len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(AT_ONCE.len()));
		let writers: Vec<_> = AT_ONCE
			.into_iter()
			.map(|label| {
				let root = root.to_path_buf();
				let ready = std::sync::Arc::clone(&ready);
				std::thread::spawn(move || {
					ready.wait();
					act(&root, &a_bot("Bean", "Answer briefly."), label)
				})
			})
			.collect();
		for writer in writers {
			writer.join().expect("the write ran");
		}

		assert_eq!(
			titles(&root, &bot.id).len(),
			before + AT_ONCE.len(),
			"{root_name} lost a commit"
		);
		assert!(
			git::changes(&dir(&root, &bot.id).expect("the bundle is held"))
				.expect("the status reads")
				.is_empty(),
			"{root_name} left the bundle uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	fn a_skill_is_created(root: &Path, bot: &Bot, label: &str) {
		create_skill(root, bot, &a_draft(label, "What it is for.", "How it goes."))
			.expect("the skill is created");
	}

	fn a_skill_file_is_written(root: &Path, bot: &Bot, label: &str) {
		a_skill_is_created(root, bot, label);
		write_skill_file(root, &bot.id, label, "notes.md", label).expect("the file is written");
	}

	#[test]
	fn the_bot_files_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-write", nothing_prepared, |root, _bot, label| {
			write(root, &a_bot("Bean", label)).expect("the bundle is written");
		});
		commits_at_once("at-once-styled", nothing_prepared, |root, bot, label| {
			write_styled(root, bot, label, None).expect("the bundle is written");
		});
		commits_at_once("at-once-remembered", nothing_prepared, |root, bot, label| {
			write_remembered(root, bot, label).expect("the memory is written");
		});
		commits_at_once("at-once-ensure", nothing_prepared, |root, _bot, label| {
			let mut bot = a_bot("Bean", "Answer briefly.");
			bot.model = label.to_owned();
			ensure(root, &bot).expect("the bundle is ensured");
		});
	}

	#[test]
	fn the_skills_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-created", nothing_prepared, a_skill_is_created);
		commits_at_once("at-once-created-at", nothing_prepared, |root, bot, label| {
			create_skill_at(
				&dir(root, &bot.id).expect("the bundle is held"),
				&a_draft(label, "What it is for.", "How it goes."),
			)
			.expect("the skill is created");
		});
		commits_at_once("at-once-updated", a_skill_is_created, |root, bot, label| {
			update_skill(root, bot, label, &a_draft(label, "What it is for.", "How it now goes."))
				.expect("the skill is updated");
		});
		commits_at_once("at-once-updated-at", a_skill_is_created, |root, bot, label| {
			update_skill_at(
				&dir(root, &bot.id).expect("the bundle is held"),
				label,
				&a_draft(label, "What it is for.", "How it now goes."),
			)
			.expect("the skill is updated");
		});
		commits_at_once("at-once-preloaded", a_skill_is_created, |root, bot, label| {
			set_skill_preloaded(root, bot, label, true).expect("the skill is marked");
		});
		commits_at_once("at-once-preloaded-at", a_skill_is_created, |root, bot, label| {
			set_skill_preloaded_at(&dir(root, &bot.id).expect("the bundle is held"), label, true)
				.expect("the skill is marked");
		});
		commits_at_once("at-once-removed", a_skill_is_created, |root, bot, label| {
			remove_skill(root, bot, label).expect("the skill is removed");
		});
		commits_at_once("at-once-removed-at", a_skill_is_created, |root, bot, label| {
			remove_skill_at(&dir(root, &bot.id).expect("the bundle is held"), label)
				.expect("the skill is removed");
		});
	}

	#[test]
	fn the_skill_files_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-file", a_skill_is_created, |root, bot, label| {
			write_skill_file(root, &bot.id, label, "notes.md", label).expect("the file is written");
		});
		commits_at_once("at-once-file-at", a_skill_is_created, |root, bot, label| {
			write_skill_file_at(
				&dir(root, &bot.id).expect("the bundle is held"),
				label,
				"notes.md",
				label,
			)
			.expect("the file is written");
		});
		commits_at_once("at-once-file-gone", a_skill_file_is_written, |root, bot, label| {
			remove_skill_file(root, &bot.id, label, "notes.md").expect("the file is removed");
		});
		commits_at_once("at-once-file-gone-at", a_skill_file_is_written, |root, bot, label| {
			remove_skill_file_at(
				&dir(root, &bot.id).expect("the bundle is held"),
				label,
				"notes.md",
			)
			.expect("the file is removed");
		});
	}

	#[test]
	fn the_servers_saved_at_once_each_reach_the_history() {
		commits_at_once("at-once-server", nothing_prepared, |root, bot, label| {
			set_mcp_server(root, bot, label, &serde_json::json!({ "command": label }), None)
				.expect("the server is saved");
		});
		commits_at_once("at-once-server-gone", a_server_is_saved, |root, bot, label| {
			remove_mcp_server(root, bot, label).expect("the server is removed");
		});
	}

	fn a_server_is_saved(root: &Path, bot: &Bot, label: &str) {
		set_mcp_server(root, bot, label, &serde_json::json!({ "command": label }), None)
			.expect("the server is saved");
	}

	#[test]
	fn turns_ending_at_once_record_one_commit_for_the_one_that_wrote_it() {
		let root = a_root("evolve-at-once");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		let before = titles(&root, &bot.id).len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(AT_ONCE.len()));
		let turns: Vec<_> = AT_ONCE
			.into_iter()
			.map(|_| {
				let root = root.to_path_buf();
				let ready = std::sync::Arc::clone(&ready);
				std::thread::spawn(move || {
					ready.wait();
					evolve(&root, &a_bot("Bean", "Answer briefly."))
				})
			})
			.collect();
		let recorded: Vec<Evolution> = turns
			.into_iter()
			.filter_map(|turn| recorded(turn.join().expect("the turn ran")))
			.collect();

		assert_eq!(recorded.len(), 1, "got {recorded:?}");
		assert_eq!(titles(&root, &bot.id).len(), before + recorded.len());
		assert!(
			git::changes(&dir(&root, &bot.id).expect("the bundle is held"))
				.expect("the status reads")
				.is_empty(),
			"the bundle is uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_ending_while_a_skill_is_saved_leaves_both_in_the_history() {
		let root = a_root("evolve-and-settings");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		for label in AT_ONCE {
			a_bot_writes(&root, &bot.id, &format!("{label}-learned"), "Bean likes them.");
			let before = titles(&root, &bot.id).len();
			let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
			let turn = std::thread::spawn({
				let root = root.to_path_buf();
				let ready = std::sync::Arc::clone(&ready);
				move || {
					ready.wait();
					evolve(&root, &a_bot("Bean", "Answer briefly."))
				}
			});
			let saved = std::thread::spawn({
				let root = root.to_path_buf();
				let ready = std::sync::Arc::clone(&ready);
				move || {
					ready.wait();
					create_skill(
						&root,
						&a_bot("Bean", "Answer briefly."),
						&a_draft(&format!("{label}-saved"), "What it is for.", "How it goes."),
					)
					.expect("the skill is created");
				}
			});
			let evolved = usize::from(recorded(turn.join().expect("the turn ran")).is_some());
			saved.join().expect("the skill was saved");

			assert_eq!(titles(&root, &bot.id).len(), before + evolved + 1, "{label} lost a commit");
			assert!(
				git::changes(&dir(&root, &bot.id).expect("the bundle is held"))
					.expect("the status reads")
					.is_empty(),
				"{label} left work behind"
			);
		}

		let _ = fs::remove_dir_all(&root);
	}

	const BULK_SKILLS: usize = 24;
	const BULK_FILES: usize = 96;

	pub(super) fn recorded(evolved: Evolved) -> Option<Evolution> {
		match evolved {
			Evolved::Recorded(evolution) => Some(evolution),
			Evolved::Unchanged | Evolved::Failed(_) => None,
		}
	}

	pub(super) struct ReadOnlyObjects {
		objects: PathBuf,
		mode: u32,
	}

	impl Drop for ReadOnlyObjects {
		fn drop(&mut self) {
			use std::os::unix::fs::PermissionsExt;

			let restored = fs::Permissions::from_mode(self.mode);
			if let Err(error) = fs::set_permissions(&self.objects, restored) {
				eprintln!("{} stayed read-only: {error}", self.objects.display());
			}
		}
	}

	pub(super) fn read_only_objects(bundle: &Path) -> ReadOnlyObjects {
		use std::os::unix::fs::PermissionsExt;

		let objects = bundle.join(".git").join("objects");
		let mode =
			fs::metadata(&objects).expect("the objects directory reads").permissions().mode();
		fs::set_permissions(&objects, fs::Permissions::from_mode(0o500))
			.expect("the objects directory turns read-only");
		ReadOnlyObjects { objects, mode }
	}

	pub(super) struct UnreadableIndex {
		path: PathBuf,
		valid: Vec<u8>,
	}

	impl UnreadableIndex {
		pub(super) fn restore(self) {
			fs::write(&self.path, &self.valid).expect("the valid index is back");
		}
	}

	pub(super) fn an_unreadable_index(bundle: &Path) -> UnreadableIndex {
		let path = bundle.join(".git").join("index");
		let valid = fs::read(&path).expect("the index reads");
		fs::write(&path, b"not an index").expect("the index is overwritten");
		UnreadableIndex { path, valid }
	}

	fn a_locked_index(bundle: &Path) {
		private_files::replace(&bundle.join(".git").join("index.lock"), b"")
			.expect("the lock lands");
	}

	fn bulk_label(index: usize) -> String {
		format!("skill-{index}")
	}

	fn a_bulk_tree(root: &Path, bot_id: &str) {
		for index in 0..BULK_SKILLS {
			let label = bulk_label(index);
			a_bot_writes(root, bot_id, &label, "How it goes.");
			let held = dir(root, bot_id).expect("the bundle is held").join(SKILLS_DIR).join(&label);
			for file in 0..BULK_FILES {
				fs::write(held.join(format!("note-{file}.md")), b"Notes.").expect("the file lands");
			}
		}
	}

	fn whole_copy_or_none(root: &Path, bot_id: &str, commit_id: &str) {
		let patch = patch_of(root, bot_id, commit_id);
		let landed = (0..BULK_SKILLS)
			.filter(|index| patch.contains(&format!("{SKILLS_DIR}/{}/", bulk_label(*index))))
			.count();
		assert!(landed == 0 || landed == BULK_SKILLS, "{landed} skills of the copy landed");
	}

	#[test]
	fn a_skill_saved_while_a_bundle_is_inherited_lands_the_whole_copy_or_none_of_it() {
		let root = a_root("inherit-and-save");
		let source_id = "b0";
		a_bulk_tree(&root, source_id);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
		let copying = std::thread::spawn({
			let (root, source_id) = (root.to_path_buf(), source_id.to_owned());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				inherit(&root, &source_id, &a_bot("Bean", "Answer briefly."))
					.expect("the copy lands");
			}
		});
		let saving = std::thread::spawn({
			let root = root.to_path_buf();
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				create_skill(
					&root,
					&a_bot("Bean", "Answer briefly."),
					&a_draft("kneading", "How to knead.", "Ten minutes."),
				)
				.expect("the skill is created");
			}
		});
		copying.join().expect("the copy ran");
		saving.join().expect("the save ran");

		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert!(entry.title.contains("kneading"), "got {}", entry.title);
		whole_copy_or_none(&root, &bot.id, &entry.id);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_ending_while_a_bundle_is_inherited_lands_the_whole_copy_or_none_of_it() {
		let root = a_root("inherit-and-evolve");
		let source_id = "b0";
		a_bulk_tree(&root, source_id);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "learned", "Bean likes them.");

		let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
		let copying = std::thread::spawn({
			let (root, source_id) = (root.to_path_buf(), source_id.to_owned());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				inherit(&root, &source_id, &a_bot("Bean", "Answer briefly."))
					.expect("the copy lands");
			}
		});
		let turn = std::thread::spawn({
			let root = root.to_path_buf();
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				evolve(&root, &a_bot("Bean", "Answer briefly."))
			}
		});
		copying.join().expect("the copy ran");
		let evolution = recorded(turn.join().expect("the turn ran")).expect("the turn is recorded");

		whole_copy_or_none(&root, &bot.id, &evolution.commit_id);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_files_saved_while_undos_run_all_reach_the_history() {
		let root = a_root("undo-and-save");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("kneading", "How to knead.", "Ten minutes."))
			.expect("the skill is created");
		a_bulk_tree(&root, &bot.id);
		create_skill(&root, &bot, &a_draft("figs", "What it is for.", "How it goes."))
			.expect("the skill is created");
		let written = history(&root, &bot.id).expect("the history reads");
		let undone = written[0].id.clone();
		let saved = ["one.md", "two.md", "three.md", "four.md"];
		let before = written.len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(2));
		let saving = std::thread::spawn({
			let (root, bot_id) = (root.to_path_buf(), bot.id.clone());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				for file in saved {
					write_skill_file(&root, &bot_id, "kneading", file, "Notes.")
						.expect("the file is written");
				}
			}
		});
		let undoing = std::thread::spawn({
			let (root, bot_id) = (root.to_path_buf(), bot.id.clone());
			let ready = std::sync::Arc::clone(&ready);
			move || {
				ready.wait();
				revert(&root, &bot_id, &undone, &undone).expect("the write is undone");
			}
		});
		saving.join().expect("the save ran");
		undoing.join().expect("the undo ran");

		assert_eq!(titles(&root, &bot.id).len(), before + saved.len() + 1);
		assert!(
			git::changes(&dir(&root, &bot.id).expect("the bundle is held"))
				.expect("the status reads")
				.is_empty(),
			"the bundle is left uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn two_undos_at_once_both_reach_the_history() {
		let root = a_root("undo-at-once");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		for label in ["figs", "dates"] {
			create_skill(&root, &bot, &a_draft(label, "What it is for.", "How it goes."))
				.expect("the skill is created");
		}
		let written = history(&root, &bot.id).expect("the history reads");
		let undone = [written[0].id.clone(), written[1].id.clone()];
		let before = written.len();

		let ready = std::sync::Arc::new(std::sync::Barrier::new(undone.len()));
		let undoing: Vec<_> = undone
			.into_iter()
			.map(|commit_id| {
				let (root, bot_id) = (root.to_path_buf(), bot.id.clone());
				let ready = std::sync::Arc::clone(&ready);
				std::thread::spawn(move || {
					ready.wait();
					revert(&root, &bot_id, &commit_id, &commit_id).expect("the write is undone");
				})
			})
			.collect();
		for undo in undoing {
			undo.join().expect("the undo ran");
		}

		assert_eq!(titles(&root, &bot.id).len(), before + 2);
		assert!(
			git::changes(&dir(&root, &bot.id).expect("the bundle is held"))
				.expect("the status reads")
				.is_empty(),
			"the bundle is left uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_whose_commit_fails_reports_the_failure() {
		let root = a_root("commit-refused-skill");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_locked_index(&dir(&root, &bot.id).expect("the bundle is held"));

		let refused =
			create_skill(&root, &bot, &a_draft("figs", "What it is for.", "How it goes."));

		assert!(refused.is_err(), "the failed commit was reported as a success");
		let listed: Vec<String> = skills(&root, &bot.id).into_iter().map(|it| it.id).collect();
		assert_eq!(listed, vec!["figs"]);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_file_whose_commit_fails_reports_the_failure() {
		let root = a_root("commit-refused-file");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("figs", "What it is for.", "How it goes."))
			.expect("the skill is created");
		a_locked_index(&dir(&root, &bot.id).expect("the bundle is held"));

		let refused = write_skill_file(&root, &bot.id, "figs", "notes.md", "Notes.");

		assert!(refused.is_err(), "the failed commit was reported as a success");
		assert_eq!(
			skill_file(&root, &bot.id, "figs", "notes.md").expect("the file reads"),
			"Notes."
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_whose_commit_fails_keeps_the_note_on_disk() {
		let root = a_root("evolve-refused");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME),
			b"Bean learned about figs

They said figs, not dates.
",
		)
		.expect("the note lands");
		a_locked_index(&dir(&root, &bot.id).expect("the bundle is held"));

		assert!(matches!(evolve(&root, &bot), Evolved::Failed(_)));
		assert!(
			dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME).is_file(),
			"the note was thrown away"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_git_refuses_reports_the_error_and_is_recorded_once_git_is_repaired() {
		let root = a_root("evolve-objects-read-only");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		private_files::replace(&bundle.join(LEARNED_NAME), b"Bean learned about figs\n")
			.expect("the note lands");

		let read_only = read_only_objects(&bundle);
		let refused = evolve(&root, &bot);
		drop(read_only);

		let Evolved::Failed(error) = refused else {
			panic!("the commit went through: {refused:?}");
		};
		assert!(!error.message().is_empty(), "the git error is carried");
		assert!(bundle.join(SKILLS_DIR).join("figs").join(SKILL_NAME).is_file());
		assert!(bundle.join(LEARNED_NAME).is_file(), "the note was thrown away");

		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert_eq!(evolution.title, "Bean learned about figs");
		assert_eq!(history(&root, &bot.id).expect("the history reads")[0].id, evolution.commit_id);
		assert!(
			git::changes(&bundle).expect("the status reads").is_empty(),
			"the bundle is left uncommitted"
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_whose_status_git_cannot_read_reports_the_error_and_is_recorded_once_repaired() {
		let root = a_root("evolve-index-unreadable");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		private_files::replace(&bundle.join(LEARNED_NAME), b"Bean learned about figs\n")
			.expect("the note lands");

		let index = an_unreadable_index(&bundle);
		let refused = evolve(&root, &bot);
		index.restore();

		assert!(matches!(refused, Evolved::Failed(_)), "got {refused:?}");
		assert!(bundle.join(SKILLS_DIR).join("figs").join(SKILL_NAME).is_file());
		assert!(bundle.join(LEARNED_NAME).is_file(), "the note was thrown away");

		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert_eq!(evolution.title, "Bean learned about figs");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_turn_that_failed_keeps_its_note_for_the_next_turn() {
		let root = a_root("evolve-refused-then");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		a_bot_writes(&root, &bot.id, "figs", "Bean likes figs.");
		private_files::replace(
			&dir(&root, &bot.id).expect("the bundle is held").join(LEARNED_NAME),
			b"Bean learned about figs

They said figs, not dates.
",
		)
		.expect("the note lands");
		a_locked_index(&dir(&root, &bot.id).expect("the bundle is held"));
		assert!(matches!(evolve(&root, &bot), Evolved::Failed(_)));
		fs::remove_file(
			dir(&root, &bot.id).expect("the bundle is held").join(".git").join("index.lock"),
		)
		.expect("the lock is lifted");

		let evolution = recorded(evolve(&root, &bot)).expect("the turn is recorded");

		assert_eq!(evolution.title, "Bean learned about figs");
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(entry.body, "They said figs, not dates.");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_repository_is_never_taken_for_part_of_the_bundle() {
		let root = a_root("git-invisible");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Kneading", "How to knead.", "Ten minutes."))
			.expect("the skill is created");
		write_marketplace(&root, std::slice::from_ref(&bot)).expect("the marketplace is written");

		assert!(dir(&root, &bot.id).expect("the bundle is held").join(".git").is_dir());
		let listed: Vec<String> = skills(&root, &bot.id).into_iter().map(|it| it.id).collect();
		assert_eq!(listed, vec!["kneading"]);
		assert!(written_agent(&root, &bot.id).contains("Answer briefly."));
		let marketplace =
			fs::read_to_string(marketplace_file(&root)).expect("the marketplace is there");
		assert!(!marketplace.contains(".git"), "got {marketplace}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bundle_with_no_repository_reads_as_a_refusal_and_writes_anyway() {
		let root = a_root("git-missing");
		let bot = a_bot("Bean", "Answer briefly.");

		assert!(history(&root, &bot.id).is_err());
		let absent = "0000000000000000000000000000000000000000";
		assert!(changed_files(&root, &bot.id, absent, absent).is_err());
		assert!(revert(&root, &bot.id, absent, absent).is_err());

		let _ = fs::remove_dir_all(&root);
	}
}
