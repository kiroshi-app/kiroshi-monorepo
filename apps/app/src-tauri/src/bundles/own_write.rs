use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{
	bot_recorded, dir, rewrite_agent_holding, serialised, Evolved, AGENTS_DIR, AGENT_EXTENSION,
	AGENT_NAME, HOOKS_DIR, MANIFEST_DIR, MARKS_NAME, MCP_NAME, SETTINGS_NAME, SKILLS_DIR,
};
use crate::db::repositories::conversations::Bot;
use crate::private_files;

const MAX_TITLE: usize = 72;

const GIT_DIR: &str = ".git";

const MARKDOWN: &str = ".md";

const KIROSHI_MARK: &str = "<!-- kiroshi:";

const RESERVED: [&str; 6] = [MANIFEST_DIR, MCP_NAME, MARKS_NAME, SETTINGS_NAME, HOOKS_DIR, GIT_DIR];

const UNRECORDED: &str =
	"the file was written but not recorded in your history; it is recorded when the turn ends";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleWrite {
	pub path: String,
	pub text: String,
	pub title: String,
	pub summary: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum BundleWritten {
	Unchanged,
	#[serde(rename_all = "camelCase")]
	Recorded {
		commit_id: String,
		title: String,
	},
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RefusalKind {
	ForbiddenPath,
	MarkerInText,
	InvalidTitle,
	WriteFailed,
	UnreadableRequest,
	Unexpected,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct BundleWriteRefusal {
	pub kind: RefusalKind,
	pub reason: String,
}

impl BundleWriteRefusal {
	pub fn new(kind: RefusalKind, reason: impl Into<String>) -> Self {
		Self { kind, reason: reason.into() }
	}
}

#[derive(Clone, Copy)]
enum Target {
	Skill,
	Memory,
}

pub fn write_own_file(
	root: &Path,
	bot: &Bot,
	asked: BundleWrite,
) -> Result<BundleWritten, BundleWriteRefusal> {
	let title = one_line_title(&asked.title)?;
	let relative = PathBuf::from(&asked.path);
	let target = target_of(&relative)?;
	let bundle = dir(root, &bot.id).map_err(failed_write)?;
	let _serialised = serialised(&bundle);
	refuse_a_link(&bundle, &relative)?;
	let file = bundle.join(&relative);
	let held = held_text(&file)?;
	match target {
		Target::Skill => write_skill(&file, &asked.text)?,
		Target::Memory => write_memory(root, bot, &asked.text)?,
	}
	if held_text(&file)? == held {
		return Ok(BundleWritten::Unchanged);
	}
	match bot_recorded(&bundle, title, asked.summary.trim()) {
		Evolved::Recorded(evolution) => {
			Ok(BundleWritten::Recorded { commit_id: evolution.commit_id, title: evolution.title })
		}
		Evolved::Unchanged => Ok(BundleWritten::Unchanged),
		Evolved::Failed(_) => Err(BundleWriteRefusal::new(RefusalKind::WriteFailed, UNRECORDED)),
	}
}

fn one_line_title(title: &str) -> Result<String, BundleWriteRefusal> {
	let title = title.trim();
	let refused = |reason: String| Err(BundleWriteRefusal::new(RefusalKind::InvalidTitle, reason));
	if title.is_empty() {
		return refused("the title is empty".to_owned());
	}
	if title.contains(['\n', '\r']) {
		return refused("the title is one line".to_owned());
	}
	if title.chars().count() > MAX_TITLE {
		return refused(format!("the title runs past {MAX_TITLE} characters"));
	}
	Ok(title.to_owned())
}

fn target_of(relative: &Path) -> Result<Target, BundleWriteRefusal> {
	if relative.is_absolute() {
		return Err(forbidden("the path is absolute; name it from your own directory"));
	}
	let names = named_components(relative)?;
	if let Some(reserved) = names.iter().find(|name| is_reserved(name)) {
		return Err(forbidden(format!("{reserved} is not yours to write")));
	}
	let agent_file = format!("{AGENT_NAME}.{AGENT_EXTENSION}");
	match names.as_slice() {
		[AGENTS_DIR, file] if *file == agent_file => Ok(Target::Memory),
		[AGENTS_DIR, ..] => Err(forbidden("under agents/, only agents/agent.md is yours to write")),
		[SKILLS_DIR, .., file] if file.ends_with(MARKDOWN) => Ok(Target::Skill),
		_ => Err(forbidden("only a .md file under skills/ or agents/agent.md is yours to write")),
	}
}

fn named_components(relative: &Path) -> Result<Vec<&str>, BundleWriteRefusal> {
	relative
		.components()
		.map(|component| match component {
			Component::Normal(name) => {
				name.to_str().ok_or_else(|| forbidden("the path is not valid UTF-8"))
			}
			Component::ParentDir => Err(forbidden("the path holds a .. segment")),
			_ => Err(forbidden("the path is not a plain relative path")),
		})
		.collect()
}

fn is_reserved(name: &str) -> bool {
	RESERVED.iter().any(|reserved| reserved.eq_ignore_ascii_case(name))
}

fn refuse_a_link(bundle: &Path, relative: &Path) -> Result<(), BundleWriteRefusal> {
	let mut reached = bundle.to_path_buf();
	for component in relative.components() {
		reached.push(component);
		match fs::symlink_metadata(&reached) {
			Ok(found) if found.file_type().is_symlink() => {
				return Err(forbidden("the path resolves through a symbolic link"));
			}
			Ok(_) => {}
			Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
			Err(error) => return Err(failed_write(error)),
		}
	}
	Ok(())
}

fn held_text(file: &Path) -> Result<Option<String>, BundleWriteRefusal> {
	match fs::read_to_string(file) {
		Ok(text) => Ok(Some(text)),
		Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
		Err(error) => Err(failed_write(error)),
	}
}

fn write_skill(file: &Path, text: &str) -> Result<(), BundleWriteRefusal> {
	if let Some(parent) = file.parent() {
		private_files::create_dir(parent).map_err(failed_write)?;
	}
	private_files::replace(file, text.as_bytes()).map_err(failed_write)
}

fn write_memory(root: &Path, bot: &Bot, memory: &str) -> Result<(), BundleWriteRefusal> {
	if memory.contains(KIROSHI_MARK) {
		return Err(BundleWriteRefusal::new(
			RefusalKind::MarkerInText,
			"the text holds a kiroshi marker line; write only what you learned",
		));
	}
	rewrite_agent_holding(root, bot, memory).map_err(failed_write)
}

fn forbidden(reason: impl Into<String>) -> BundleWriteRefusal {
	BundleWriteRefusal::new(RefusalKind::ForbiddenPath, reason)
}

fn failed_write(error: std::io::Error) -> BundleWriteRefusal {
	BundleWriteRefusal::new(RefusalKind::WriteFailed, error.to_string())
}

#[cfg(test)]
mod tests {
	use super::super::tests::{a_bot, a_root, drop_a_skill, written_agent};
	use super::super::{
		git, history, rewrite_agent, write, Author, CARRIED_OPEN, MEMORY_CLOSE, MEMORY_OPEN,
	};
	use super::*;

	const A_SKILL: &str = "skills/baking/SKILL.md";
	const THE_AGENT: &str = "agents/agent.md";

	fn asking(path: &str, text: &str, title: &str) -> BundleWrite {
		BundleWrite {
			path: path.to_owned(),
			text: text.to_owned(),
			title: title.to_owned(),
			summary: "They said so.".to_owned(),
		}
	}

	fn a_bot_that_learned(memory: &str) -> Bot {
		let mut bot = a_bot("Bean", "Answer briefly.");
		bot.memory = memory.to_owned();
		bot
	}

	fn laid_down(root: &Path, bot: &Bot) -> PathBuf {
		write(root, bot).expect("the bundle is written");
		dir(root, &bot.id).expect("the bundle is held")
	}

	fn commits(root: &Path, bot: &Bot) -> usize {
		history(root, &bot.id).expect("the history reads").len()
	}

	fn refused_kind(root: &Path, bot: &Bot, asked: BundleWrite) -> RefusalKind {
		write_own_file(root, bot, asked).expect_err("the write is refused").kind
	}

	fn assert_nothing_written(root: &Path, bot: &Bot, bundle: &Path, before: usize) {
		assert_eq!(commits(root, bot), before, "a commit was recorded");
		assert_eq!(git::changes(bundle).expect("the status reads"), Vec::<String>::new());
	}

	#[test]
	fn a_skill_is_written_whole_in_folders_it_creates_and_recorded_as_the_bot() {
		let root = a_root("own-write-skill");
		let bot = a_bot("Bean", "Answer briefly.");
		let bundle = laid_down(&root, &bot);

		let written =
			write_own_file(&root, &bot, asking(A_SKILL, "Bake at 220 degrees.", "Kept the oven"))
				.expect("the skill is written");

		assert_eq!(
			fs::read_to_string(bundle.join(A_SKILL)).expect("the skill reads"),
			"Bake at 220 degrees."
		);
		let entry = &history(&root, &bot.id).expect("the history reads")[0];
		assert_eq!(
			written,
			BundleWritten::Recorded {
				commit_id: entry.id.clone(),
				title: "Kept the oven".to_owned()
			}
		);
		assert_eq!(entry.author, Author::Bot);
		assert_eq!(entry.title, "Kept the oven");
		assert_eq!(entry.body, "They said so.");
		assert_eq!(entry.paths, vec![A_SKILL.to_owned()]);
	}

	#[test]
	fn the_agent_file_is_rendered_by_the_host_around_the_new_memory() {
		let root = a_root("own-write-memory");
		let bot = a_bot_that_learned("They bake on Sundays.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		laid_down(&root, &bot);
		let before = written_agent(&root, &bot.id);

		write_own_file(&root, &bot, asking(THE_AGENT, "They bake on Saturdays.", "Moved the day"))
			.expect("the memory is written");

		let after = written_agent(&root, &bot.id);
		let (above, _) = before.split_once(MEMORY_OPEN).expect("the block opens");
		let (_, below) = before.split_once(MEMORY_CLOSE).expect("the block closes");
		assert!(below.contains(CARRIED_OPEN), "got {before}");
		assert_eq!(
			after,
			format!("{above}{MEMORY_OPEN}\n\nThey bake on Saturdays.\n\n{MEMORY_CLOSE}{below}")
		);
		rewrite_agent(&root, &bot).expect("the host renders the agent file again");
		assert_eq!(written_agent(&root, &bot.id), after);
	}

	#[test]
	fn an_agent_file_with_no_memory_block_gets_one_between_the_brief_and_the_carried_skills() {
		let root = a_root("own-write-unmarked");
		let bot = a_bot("Bean", "Answer briefly.");
		drop_a_skill(&root, &bot.id, "baking", true, "Bake at 220 degrees.");
		laid_down(&root, &bot);
		assert!(!written_agent(&root, &bot.id).contains(MEMORY_OPEN));
		let before = commits(&root, &bot);

		let written =
			write_own_file(&root, &bot, asking(THE_AGENT, "They bake on Sundays.", "Kept the day"))
				.expect("the memory is written");

		let agent = written_agent(&root, &bot.id);
		assert_eq!(agent.matches(MEMORY_OPEN).count(), 1, "got {agent}");
		assert_eq!(agent.matches(MEMORY_CLOSE).count(), 1, "got {agent}");
		let brief = agent.find("Answer briefly.").expect("the brief is there");
		let open = agent.find(MEMORY_OPEN).expect("the block opens");
		let kept = agent.find("They bake on Sundays.").expect("the line is kept");
		let close = agent.find(MEMORY_CLOSE).expect("the block closes");
		let carried = agent.find(CARRIED_OPEN).expect("the skills are carried");
		assert!(brief < open && open < kept && kept < close && close < carried, "got {agent}");
		assert!(matches!(written, BundleWritten::Recorded { .. }));
		assert_eq!(commits(&root, &bot), before + 1);
		assert_eq!(history(&root, &bot.id).expect("the history reads")[0].title, "Kept the day");
	}

	#[test]
	fn an_empty_memory_renders_the_agent_file_without_a_block() {
		let root = a_root("own-write-forgotten");
		let bot = a_bot_that_learned("They bake on Sundays.");
		laid_down(&root, &bot);

		let written = write_own_file(&root, &bot, asking(THE_AGENT, "", "Forgot the day"))
			.expect("the memory is cleared");

		let agent = written_agent(&root, &bot.id);
		assert!(!agent.contains(MEMORY_OPEN), "got {agent}");
		assert!(!agent.contains(MEMORY_CLOSE), "got {agent}");
		assert!(!agent.contains("They bake on Sundays."), "got {agent}");
		assert!(matches!(written, BundleWritten::Recorded { .. }));
	}

	#[test]
	fn a_text_equal_to_the_file_answers_unchanged_and_records_nothing() {
		let root = a_root("own-write-unchanged");
		let bot = a_bot_that_learned("They bake on Sundays.");
		laid_down(&root, &bot);
		write_own_file(&root, &bot, asking(A_SKILL, "Bake at 220 degrees.", "Kept the oven"))
			.expect("the skill is written");
		let before = commits(&root, &bot);

		let skill = write_own_file(&root, &bot, asking(A_SKILL, "Bake at 220 degrees.", "Again"));
		let memory =
			write_own_file(&root, &bot, asking(THE_AGENT, "They bake on Sundays.", "Again"));

		assert_eq!(skill, Ok(BundleWritten::Unchanged));
		assert_eq!(memory, Ok(BundleWritten::Unchanged));
		assert_eq!(commits(&root, &bot), before);
	}

	#[test]
	fn a_path_out_of_reach_is_refused_and_nothing_is_written() {
		let root = a_root("own-write-forbidden");
		let bot = a_bot_that_learned("They bake on Sundays.");
		let bundle = laid_down(&root, &bot);
		let before = commits(&root, &bot);
		let absolute = bundle.join(A_SKILL).to_string_lossy().into_owned();

		for path in [
			absolute.as_str(),
			"skills/../agents/agent.md",
			"skills/baking/../../settings.json",
			".claude-plugin/plugin.json",
			".mcp.json",
			".applications.json",
			"settings.json",
			"hooks/hooks.json",
			".git/config",
			"skills/baking/hooks/notes.md",
			"skills/baking/.GIT/notes.md",
			"skills/settings.json",
			"skills/baking/notes.txt",
			"README.md",
			".learned.md",
			"",
		] {
			let refusal = write_own_file(&root, &bot, asking(path, "Bake.", "Kept"))
				.expect_err("the write is refused");
			assert_eq!(refusal.kind, RefusalKind::ForbiddenPath, "{path}");
			assert!(!refusal.reason.is_empty(), "{path}");
		}
		assert_nothing_written(&root, &bot, &bundle, before);
	}

	#[cfg(unix)]
	#[test]
	fn a_path_through_a_symbolic_link_is_refused_and_nothing_is_written() {
		let root = a_root("own-write-link");
		let bot = a_bot("Bean", "Answer briefly.");
		let bundle = laid_down(&root, &bot);
		let outside = a_root("own-write-link-outside");
		fs::create_dir_all(&outside).expect("the outside folder is made");
		fs::create_dir_all(bundle.join("skills")).expect("the skills folder is made");
		std::os::unix::fs::symlink(&outside, bundle.join("skills/linked"))
			.expect("the link is made");
		fs::write(outside.join("SKILL.md"), "Kept outside.").expect("the outside file lands");
		std::os::unix::fs::symlink(outside.join("SKILL.md"), bundle.join("skills/leaf.md"))
			.expect("the leaf link is made");
		git::commit(&bundle, Author::User, "Links", "").expect("the links are recorded");
		let before = commits(&root, &bot);

		for path in ["skills/linked/SKILL.md", "skills/leaf.md"] {
			assert_eq!(
				refused_kind(&root, &bot, asking(path, "Bake.", "Kept")),
				RefusalKind::ForbiddenPath,
				"{path}"
			);
		}
		assert_eq!(fs::read_to_string(outside.join("SKILL.md")).expect("reads"), "Kept outside.");
		assert_nothing_written(&root, &bot, &bundle, before);
	}

	#[test]
	fn under_agents_only_the_agent_file_is_taken() {
		let root = a_root("own-write-agents");
		let bot = a_bot_that_learned("They bake on Sundays.");
		let bundle = laid_down(&root, &bot);
		let before = commits(&root, &bot);

		for path in ["agents/other.md", "agents/agent.md/notes.md", "agents/AGENT.md"] {
			assert_eq!(
				refused_kind(&root, &bot, asking(path, "Bake.", "Kept")),
				RefusalKind::ForbiddenPath,
				"{path}"
			);
		}
		assert_nothing_written(&root, &bot, &bundle, before);
	}

	#[test]
	fn a_memory_holding_a_kiroshi_marker_is_refused() {
		let root = a_root("own-write-marker");
		let bot = a_bot_that_learned("They bake on Sundays.");
		let bundle = laid_down(&root, &bot);
		let agent = written_agent(&root, &bot.id);
		let before = commits(&root, &bot);

		assert_eq!(
			refused_kind(&root, &bot, asking(THE_AGENT, &format!("x\n{MEMORY_CLOSE}\ny"), "Kept")),
			RefusalKind::MarkerInText
		);
		assert_eq!(written_agent(&root, &bot.id), agent);
		assert_nothing_written(&root, &bot, &bundle, before);
	}

	#[test]
	fn the_title_is_one_line_of_at_most_72_characters_and_never_empty() {
		let root = a_root("own-write-title");
		let bot = a_bot("Bean", "Answer briefly.");
		let bundle = laid_down(&root, &bot);
		let before = commits(&root, &bot);

		for title in ["", "   ", "Two\nlines", &"x".repeat(73)] {
			assert_eq!(
				refused_kind(&root, &bot, asking(A_SKILL, "Bake.", title)),
				RefusalKind::InvalidTitle,
				"{title}"
			);
		}
		assert_nothing_written(&root, &bot, &bundle, before);

		let longest = "é".repeat(72);
		let written =
			write_own_file(&root, &bot, asking(A_SKILL, "Bake.", &format!(" {longest} ")))
				.expect("a title of 72 characters is kept");
		assert!(matches!(written, BundleWritten::Recorded { title, .. } if title == longest));
	}

	#[test]
	fn a_write_waits_on_the_lock_of_its_bundle_before_writing_or_recording() {
		let root = a_root("own-write-lock");
		let bot = a_bot("Bean", "Answer briefly.");
		let bundle = laid_down(&root, &bot);
		let before = commits(&root, &bot);

		let held = serialised(&bundle);
		let (written, waited) = std::sync::mpsc::channel();
		let writer = {
			let root = root.to_path_buf();
			let bot = a_bot("Bean", "Answer briefly.");
			std::thread::spawn(move || {
				let answer = write_own_file(&root, &bot, asking(A_SKILL, "Bake.", "Kept"));
				written.send(answer).expect("the answer is reported");
			})
		};
		assert!(waited.recv_timeout(std::time::Duration::from_millis(300)).is_err());
		assert!(!bundle.join(A_SKILL).exists(), "the skill landed while the lock was held");
		assert_eq!(commits(&root, &bot), before);
		drop(held);

		let answer = waited
			.recv_timeout(std::time::Duration::from_secs(60))
			.expect("the write ends once the lock is let go");
		writer.join().expect("the writer ends");
		assert!(matches!(answer, Ok(BundleWritten::Recorded { .. })));
		assert_eq!(commits(&root, &bot), before + 1);
	}

	#[test]
	fn the_request_names_no_bundle_and_no_bot() {
		let named: Result<BundleWrite, _> = serde_json::from_value(serde_json::json!({
			"path": A_SKILL,
			"text": "Bake.",
			"title": "Kept",
			"summary": "",
			"botId": "b2",
		}));

		assert!(named.is_err());
	}
}
