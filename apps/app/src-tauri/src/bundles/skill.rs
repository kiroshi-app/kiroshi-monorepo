use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::front::{
	as_flag, as_list, as_text, body, checked_front, front_value, mapped_lines, quoted, rendered,
	split_frontmatter, with_key, without_key, written_front,
};
use super::{
	dir, recorded, rewrite_agent, serialised, slug, unrecorded, AGENT_KEY, ALLOWED_TOOLS_KEY,
	ARGUMENTS_KEY, ARGUMENT_HINT_KEY, BACKGROUND_KEY, BOT_SUBJECT, COMPATIBILITY_KEY, CONTEXT_KEY,
	DESCRIPTION_KEY, DISALLOWED_TOOLS_KEY, EFFORT_KEY, HOOKS_KEY, INVOCATION_KEY, KIROSHI_KEY,
	LICENSE_KEY, MARKED, METADATA_KEY, MODEL_KEY, NAME_KEY, PATHS_KEY, PRELOAD_KEY, SHELL_KEY,
	SKILLS_DIR, SKILL_FILE_SUBJECT, SKILL_NAME, SKILL_SUBJECT, SYSTEM_KEY, USER_INVOCABLE_KEY,
	WHEN_TO_USE_KEY,
};
use crate::db::repositories::conversations::Bot;
use crate::private_files;

pub(super) fn preloaded(root: &Path, bot_id: &str) -> Vec<Skill> {
	skills(root, bot_id).into_iter().filter(|skill| skill.is_preloaded).collect()
}

fn skill_dirs(bundle: &Path) -> Vec<PathBuf> {
	let mut directories: Vec<PathBuf> = fs::read_dir(bundle.join(SKILLS_DIR))
		.into_iter()
		.flatten()
		.flatten()
		.map(|entry| entry.path())
		.collect();
	directories.sort();
	directories
}

pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
	pub is_system: bool,
	pub files: Vec<String>,
	pub front: SkillFront,
}

pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
	pub front: SkillFront,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct SkillFront {
	pub when_to_use: Option<String>,
	pub argument_hint: Option<String>,
	pub arguments: Option<Vec<String>>,
	pub disable_model_invocation: Option<bool>,
	pub user_invocable: Option<bool>,
	pub allowed_tools: Option<Vec<String>>,
	pub disallowed_tools: Option<Vec<String>>,
	pub model: Option<String>,
	pub effort: Option<String>,
	pub context: Option<String>,
	pub agent: Option<String>,
	pub background: Option<bool>,
	#[specta(type = Option<crate::json::JsonValue>)]
	pub hooks: Option<serde_json::Value>,
	pub paths: Option<Vec<String>>,
	pub shell: Option<String>,
	#[specta(type = Option<crate::json::JsonValue>)]
	pub metadata: Option<serde_json::Value>,
	pub license: Option<String>,
	#[specta(type = Option<crate::json::JsonValue>)]
	pub compatibility: Option<serde_json::Value>,
}

pub fn skills(root: &Path, bot_id: &str) -> Vec<Skill> {
	dir(root, bot_id).map(|bundle| skills_at(&bundle)).unwrap_or_default()
}

pub fn skills_at(bundle: &Path) -> Vec<Skill> {
	skill_dirs(bundle).iter().filter_map(|path| read_skill(path)).collect()
}

pub fn is_system_skill(root: &Path, bot_id: &str, skill_id: &str) -> bool {
	dir(root, bot_id)
		.and_then(|bundle| skill_dir(&bundle, skill_id))
		.is_ok_and(|path| front_value(&held_skill(&path), SYSTEM_KEY).as_deref() == Some(MARKED))
}

pub fn create_skill(root: &Path, bot: &Bot, draft: &SkillDraft) -> std::io::Result<Skill> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	let path = free_skill_dir(&bundle, &draft.name);
	let skill = written_skill(root, bot, &path, drafted(None, draft)?)?;
	recorded(&bundle, SKILL_SUBJECT, &skill.name, "created from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn write_skills(root: &Path, bot: &Bot, skills: &[(&str, &[u8])]) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	for (id, body) in skills {
		private_files::replace(&bundle.join(SKILLS_DIR).join(id).join(SKILL_NAME), body)?;
	}
	rewrite_agent(root, bot)?;
	recorded(&bundle, BOT_SUBJECT, &bot.name, "created at first launch").map_err(unrecorded)
}

pub fn create_skill_at(bundle: &Path, draft: &SkillDraft) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let skill = kept_skill(&free_skill_dir(bundle, &draft.name), drafted(None, draft)?)?;
	recorded(bundle, SKILL_SUBJECT, &skill.name, "created from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn create_skill_with_files_at(
	bundle: &Path,
	draft: &SkillDraft,
	files: &[(String, Vec<u8>)],
	reason: &str,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let path = free_skill_dir(bundle, &draft.name);
	let recorded_skill = kept_skill_with_files(&path, draft, files).and_then(|skill| {
		recorded(bundle, SKILL_SUBJECT, &skill.name, reason).map_err(unrecorded)?;
		Ok(skill)
	});
	recorded_skill.map_err(|failure| withdrawn_skill(&path, failure))
}

fn kept_skill_with_files(
	path: &Path,
	draft: &SkillDraft,
	files: &[(String, Vec<u8>)],
) -> std::io::Result<Skill> {
	for (relative, bytes) in files {
		private_files::replace(&skill_file_path(path, relative)?, bytes)?;
	}
	kept_skill(path, drafted(None, draft)?)
}

fn withdrawn_skill(path: &Path, failure: std::io::Error) -> std::io::Error {
	match fs::remove_dir_all(path) {
		Ok(()) => failure,
		Err(leftover) if leftover.kind() == std::io::ErrorKind::NotFound => failure,
		Err(leftover) => std::io::Error::new(
			failure.kind(),
			format!("{failure}, and the half written skill was not taken back: {leftover}"),
		),
	}
}

pub fn update_skill(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	draft: &SkillDraft,
) -> std::io::Result<Skill> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	let path = skill_dir(&bundle, skill_id)?;
	let text = drafted(Some(&held_skill(&path)), draft)?;
	let path = moved_skill_dir(&bundle, path, &draft.name)?;
	let skill = written_skill(root, bot, &path, text)?;
	recorded(&bundle, SKILL_SUBJECT, &skill.name, "updated from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn update_skill_at(
	bundle: &Path,
	skill_id: &str,
	draft: &SkillDraft,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let path = skill_dir(bundle, skill_id)?;
	let text = drafted(Some(&held_skill(&path)), draft)?;
	let path = moved_skill_dir(bundle, path, &draft.name)?;
	let skill = kept_skill(&path, text)?;
	recorded(bundle, SKILL_SUBJECT, &skill.name, "updated from settings").map_err(unrecorded)?;
	Ok(skill)
}

pub fn set_skill_preloaded(
	root: &Path,
	bot: &Bot,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	let path = skill_dir(&bundle, skill_id)?;
	let skill = written_skill(root, bot, &path, marked(&held_skill(&path), is_preloaded)?)?;
	recorded(&bundle, SKILL_SUBJECT, &skill.name, marking(is_preloaded)).map_err(unrecorded)?;
	Ok(skill)
}

pub fn set_skill_preloaded_at(
	bundle: &Path,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let path = skill_dir(bundle, skill_id)?;
	let skill = kept_skill(&path, marked(&held_skill(&path), is_preloaded)?)?;
	recorded(bundle, SKILL_SUBJECT, &skill.name, marking(is_preloaded)).map_err(unrecorded)?;
	Ok(skill)
}

fn held_skill(path: &Path) -> String {
	fs::read_to_string(path.join(SKILL_NAME)).unwrap_or_default()
}

fn marking(is_preloaded: bool) -> &'static str {
	if is_preloaded {
		"added to the brief from settings"
	} else {
		"taken out of the brief from settings"
	}
}

pub fn remove_skill(root: &Path, bot: &Bot, skill_id: &str) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	let name = deleted_skill(&bundle, skill_id)?;
	rewrite_agent(root, bot)?;
	recorded(&bundle, SKILL_SUBJECT, &name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn remove_skill_at(bundle: &Path, skill_id: &str) -> std::io::Result<()> {
	let _serialised = serialised(bundle);
	let name = deleted_skill(bundle, skill_id)?;
	recorded(bundle, SKILL_SUBJECT, &name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

fn deleted_skill(bundle: &Path, skill_id: &str) -> std::io::Result<String> {
	let path = skill_dir(bundle, skill_id)?;
	let name = read_skill(&path).map(|skill| skill.name).unwrap_or_else(|| skill_id.to_owned());
	fs::remove_dir_all(path)?;
	Ok(name)
}
fn written_skill(root: &Path, bot: &Bot, path: &Path, text: String) -> std::io::Result<Skill> {
	let skill = kept_skill(path, text)?;
	rewrite_agent(root, bot)?;
	Ok(skill)
}

fn kept_skill(path: &Path, text: String) -> std::io::Result<Skill> {
	private_files::replace(&path.join(SKILL_NAME), text.as_bytes())?;
	read_skill(path).ok_or_else(|| {
		std::io::Error::new(std::io::ErrorKind::NotFound, "the skill was not written")
	})
}
fn read_skill(path: &Path) -> Option<Skill> {
	let text = fs::read_to_string(path.join(SKILL_NAME)).ok()?;
	let id = path.file_name()?.to_string_lossy().into_owned();
	let named = front_value(&text, NAME_KEY).filter(|found| !found.is_empty());
	Some(Skill {
		name: named.unwrap_or_else(|| id.clone()),
		description: front_value(&text, DESCRIPTION_KEY).unwrap_or_default(),
		body: body(&text).to_owned(),
		is_preloaded: front_value(&text, PRELOAD_KEY).as_deref() == Some(MARKED),
		is_system: front_value(&text, SYSTEM_KEY).as_deref() == Some(MARKED),
		files: skill_files(path),
		front: read_front(&text),
		id,
	})
}

fn read_front(text: &str) -> SkillFront {
	let map = mapped_lines(split_frontmatter(text).map_or("", |(front, _)| front));
	let text_at = |key: &str| map.get(key).map(as_text);
	let list_at = |key: &str| map.get(key).map(as_list);
	let flag_at = |key: &str| map.get(key).and_then(as_flag);
	SkillFront {
		when_to_use: text_at(WHEN_TO_USE_KEY),
		argument_hint: text_at(ARGUMENT_HINT_KEY),
		arguments: list_at(ARGUMENTS_KEY),
		disable_model_invocation: flag_at(INVOCATION_KEY),
		user_invocable: flag_at(USER_INVOCABLE_KEY),
		allowed_tools: list_at(ALLOWED_TOOLS_KEY),
		disallowed_tools: list_at(DISALLOWED_TOOLS_KEY),
		model: text_at(MODEL_KEY),
		effort: text_at(EFFORT_KEY),
		context: text_at(CONTEXT_KEY),
		agent: text_at(AGENT_KEY),
		background: flag_at(BACKGROUND_KEY),
		hooks: map.get(HOOKS_KEY).cloned(),
		paths: list_at(PATHS_KEY),
		shell: text_at(SHELL_KEY),
		metadata: map.get(METADATA_KEY).cloned(),
		license: text_at(LICENSE_KEY),
		compatibility: map.get(COMPATIBILITY_KEY).cloned(),
	}
}

fn skill_files(path: &Path) -> Vec<String> {
	let mut held = Vec::new();
	collect_skill_files(path, Path::new(""), &mut held);
	held.sort();
	held
}

fn collect_skill_files(root: &Path, relative: &Path, held: &mut Vec<String>) {
	for entry in fs::read_dir(root.join(relative)).into_iter().flatten().flatten() {
		let found = relative.join(entry.file_name());
		if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
			collect_skill_files(root, &found, held);
		} else if found != Path::new(SKILL_NAME) {
			held.push(found.to_string_lossy().replace('\\', "/"));
		}
	}
}

fn skill_file_path(held: &Path, relative: &str) -> std::io::Result<PathBuf> {
	let found = Path::new(relative);
	let stays_inside = !relative.is_empty()
		&& found.components().all(|part| matches!(part, Component::Normal(_)))
		&& !links_away(held, found);
	if !stays_inside {
		return Err(std::io::Error::new(
			std::io::ErrorKind::InvalidInput,
			"a skill file path stays inside the skill",
		));
	}
	Ok(held.join(found))
}

fn links_away(held: &Path, relative: &Path) -> bool {
	let mut walked = held.to_path_buf();
	relative.components().any(|part| {
		walked.push(part);
		fs::symlink_metadata(&walked).is_ok_and(|found| found.file_type().is_symlink())
	})
}

pub fn skill_file(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
	relative: &str,
) -> std::io::Result<String> {
	skill_file_at(&dir(root, bot_id)?, skill_id, relative)
}

pub fn skill_file_at(bundle: &Path, skill_id: &str, relative: &str) -> std::io::Result<String> {
	fs::read_to_string(skill_file_path(&skill_dir(bundle, skill_id)?, relative)?)
}

pub fn write_skill_file(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
	relative: &str,
	text: &str,
) -> std::io::Result<Skill> {
	write_skill_file_at(&dir(root, bot_id)?, skill_id, relative, text)
}

pub fn write_skill_file_at(
	bundle: &Path,
	skill_id: &str,
	relative: &str,
	text: &str,
) -> std::io::Result<Skill> {
	let _serialised = serialised(bundle);
	let held = skill_dir(bundle, skill_id)?;
	private_files::replace(&skill_file_path(&held, relative)?, text.as_bytes())?;
	recorded(bundle, SKILL_FILE_SUBJECT, relative, "saved from settings").map_err(unrecorded)?;
	read_skill(&held).ok_or_else(|| {
		std::io::Error::new(std::io::ErrorKind::NotFound, "the skill file was not written")
	})
}

pub fn remove_skill_file(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
	relative: &str,
) -> std::io::Result<()> {
	remove_skill_file_at(&dir(root, bot_id)?, skill_id, relative)
}

pub fn remove_skill_file_at(bundle: &Path, skill_id: &str, relative: &str) -> std::io::Result<()> {
	let _serialised = serialised(bundle);
	fs::remove_file(skill_file_path(&skill_dir(bundle, skill_id)?, relative)?)?;
	recorded(bundle, SKILL_FILE_SUBJECT, relative, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

fn skill_dir(bundle: &Path, skill_id: &str) -> std::io::Result<PathBuf> {
	skill_dirs(bundle)
		.into_iter()
		.find(|path| path.file_name().is_some_and(|name| name == skill_id))
		.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no such skill"))
}

fn moved_skill_dir(bundle: &Path, path: PathBuf, name: &str) -> std::io::Result<PathBuf> {
	let held = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
	if holds_slug(&held, name) {
		return Ok(path);
	}
	let target = free_skill_dir(bundle, name);
	fs::rename(&path, &target)?;
	Ok(target)
}

fn holds_slug(directory: &str, name: &str) -> bool {
	let base = slug(name);
	directory == base
		|| directory
			.strip_prefix(&base)
			.and_then(|rest| rest.strip_prefix('-'))
			.is_some_and(|next| next.parse::<u32>().is_ok())
}

fn free_skill_dir(bundle: &Path, name: &str) -> PathBuf {
	let skills = bundle.join(SKILLS_DIR);
	let base = slug(name);
	let preferred = skills.join(&base);
	if !preferred.exists() {
		return preferred;
	}
	(2u32..)
		.map(|next| skills.join(format!("{base}-{next}")))
		.find(|path| !path.exists())
		.unwrap_or(preferred)
}

pub(super) fn drafted(existing: Option<&str>, draft: &SkillDraft) -> std::io::Result<String> {
	let existing = existing.unwrap_or_default();
	let mut parts = checked_front(existing)?;
	parts.front = with_key(&parts.front, &[NAME_KEY], &quoted(&draft.name));
	parts.front = with_key(&parts.front, &[DESCRIPTION_KEY], &quoted(&draft.description));
	for (key, value) in offered(&draft.front, existing) {
		parts.front = written_front(&parts.front, key, value.as_ref());
	}
	parts.body = format!("\n{}\n", draft.body.trim());
	Ok(rendered(&parts))
}

fn offered(front: &SkillFront, existing: &str) -> Vec<(&'static str, Option<serde_json::Value>)> {
	let text = |value: &Option<String>| value.clone().map(serde_json::Value::from);
	let list = |value: &Option<Vec<String>>| value.clone().map(serde_json::Value::from);
	let flag = |value: &Option<bool>| (*value).map(serde_json::Value::from);
	vec![
		(WHEN_TO_USE_KEY, text(&front.when_to_use)),
		(ARGUMENT_HINT_KEY, text(&front.argument_hint)),
		(ARGUMENTS_KEY, list(&front.arguments)),
		(INVOCATION_KEY, flag(&front.disable_model_invocation)),
		(USER_INVOCABLE_KEY, flag(&front.user_invocable)),
		(ALLOWED_TOOLS_KEY, list(&front.allowed_tools)),
		(DISALLOWED_TOOLS_KEY, list(&front.disallowed_tools)),
		(MODEL_KEY, text(&front.model)),
		(EFFORT_KEY, text(&front.effort)),
		(CONTEXT_KEY, text(&front.context)),
		(AGENT_KEY, text(&front.agent)),
		(BACKGROUND_KEY, flag(&front.background)),
		(HOOKS_KEY, front.hooks.clone()),
		(PATHS_KEY, list(&front.paths)),
		(SHELL_KEY, text(&front.shell)),
		(METADATA_KEY, front.metadata.clone().map(|held| remarked(held, existing))),
		(LICENSE_KEY, text(&front.license)),
		(COMPATIBILITY_KEY, front.compatibility.clone()),
	]
}

fn remarked(offered: serde_json::Value, existing: &str) -> serde_json::Value {
	let Some(mark) = front_value(existing, PRELOAD_KEY) else {
		return offered;
	};
	let mut map = match offered {
		serde_json::Value::Object(map) => map,
		_ => serde_json::Map::new(),
	};
	let mut nest = match map.remove(KIROSHI_KEY) {
		Some(serde_json::Value::Object(nest)) => nest,
		_ => serde_json::Map::new(),
	};
	nest.insert(PRELOAD_KEY.to_owned(), mark.into());
	map.insert(KIROSHI_KEY.to_owned(), serde_json::Value::Object(nest));
	serde_json::Value::Object(map)
}

fn marked(text: &str, is_preloaded: bool) -> std::io::Result<String> {
	let path = [METADATA_KEY, KIROSHI_KEY, PRELOAD_KEY];
	let mut parts = checked_front(text)?;
	parts.front = if is_preloaded {
		with_key(&with_key(&parts.front, &path, MARKED), &[INVOCATION_KEY], MARKED)
	} else {
		without_key(&without_key(&parts.front, &path), &[INVOCATION_KEY])
	};
	Ok(rendered(&parts))
}

#[cfg(test)]
mod tests {
	use super::super::tests::{
		a_bot, a_draft, a_held_bundle, a_root, drop_a_skill, rewrite_the_brief, written_agent,
		written_skill_file,
	};
	use super::super::{agent_file, instructions, write, FENCE};
	use super::*;

	fn a_written_bundle(name: &str) -> (crate::removed_on_drop::RemovedOnDrop, PathBuf) {
		let root = a_root(name);
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let bundle = dir(&root, &bot.id).expect("the bundle is held");
		(root, bundle)
	}

	fn titles_at(bundle: &Path) -> Vec<String> {
		let history = super::super::history_at(bundle).expect("the history reads");
		history.into_iter().map(|entry| entry.title).collect()
	}

	#[test]
	fn a_skill_created_with_its_files_lands_byte_for_byte_in_one_entry() {
		let (_root, bundle) = a_written_bundle("skill-with-files");
		let before = titles_at(&bundle);
		let files = vec![
			("forms.md".to_owned(), b"Fields.".to_vec()),
			("fonts/serif.ttf".to_owned(), vec![0x00, 0x01, 0xff, 0xfe]),
			("scripts/fill.py".to_owned(), b"print(1)".to_vec()),
		];

		let skill = create_skill_with_files_at(
			&bundle,
			&a_draft("pdf", "Fills forms.", "Use the guide."),
			&files,
			"imported from elsewhere",
		)
		.expect("the skill lands");

		let held = bundle.join(SKILLS_DIR).join(&skill.id);
		for (relative, bytes) in &files {
			assert_eq!(&fs::read(held.join(relative)).expect("the file reads"), bytes);
		}
		assert_eq!(skill.files, ["fonts/serif.ttf", "forms.md", "scripts/fill.py"]);
		let after = titles_at(&bundle);
		assert_eq!(after.len(), before.len() + 1);
		assert_eq!(after[0], format!("{SKILL_SUBJECT} \"pdf\" imported from elsewhere"));
	}

	#[test]
	fn a_skill_whose_file_does_not_land_leaves_no_directory_and_no_entry() {
		let (_root, bundle) = a_written_bundle("skill-with-files-refused");
		let before = titles_at(&bundle);
		let files = vec![
			("forms.md".to_owned(), b"Fields.".to_vec()),
			("../escape.md".to_owned(), b"Out.".to_vec()),
		];

		let refused = create_skill_with_files_at(
			&bundle,
			&a_draft("pdf", "Fills forms.", "Use the guide."),
			&files,
			"imported from elsewhere",
		);

		assert_eq!(
			refused.err().map(|failure| failure.kind()),
			Some(std::io::ErrorKind::InvalidInput)
		);
		assert!(!bundle.join(SKILLS_DIR).join("pdf").exists());
		assert!(!bundle.join("escape.md").exists());
		assert_eq!(titles_at(&bundle), before);
	}

	#[test]
	fn a_skill_reports_every_file_its_directory_holds_but_its_own() {
		let root = a_root("skill-files-listed");
		let bot = a_bot("Bean", "Answer briefly.");
		let held = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking");
		for (path, text) in [
			(held.join(SKILL_NAME), "---\nname: baking\n---\n\nBake.\n"),
			(held.join("reference").join("crumb.md"), "Open crumb."),
			(held.join("reference").join("deep").join("oven.md"), "Hot."),
			(held.join("scripts").join("proof.sh"), "sleep 1"),
		] {
			private_files::replace(&path, text.as_bytes()).expect("the file lands");
		}

		let listed = skills(&root, &bot.id);

		assert_eq!(
			listed[0].files,
			vec![
				"reference/crumb.md".to_owned(),
				"reference/deep/oven.md".to_owned(),
				"scripts/proof.sh".to_owned(),
			]
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_file_is_written_read_back_and_deleted_alone() {
		let root = a_root("skill-files-written");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");

		let written =
			write_skill_file(&root, &bot.id, "baking", "reference/crumb.md", "Open crumb.")
				.expect("the file lands");
		assert_eq!(written.name, "Baking");
		assert_eq!(written.files, vec!["reference/crumb.md".to_owned()]);

		write_skill_file(&root, &bot.id, "baking", "scripts/proof.sh", "sleep 1")
			.expect("the file lands");

		assert_eq!(
			skill_file(&root, &bot.id, "baking", "reference/crumb.md").expect("the file reads"),
			"Open crumb."
		);

		remove_skill_file(&root, &bot.id, "baking", "reference/crumb.md")
			.expect("the file is removed");

		assert_eq!(skills(&root, &bot.id)[0].files, vec!["scripts/proof.sh".to_owned()]);
		assert!(skill_file(&root, &bot.id, "baking", "reference/crumb.md").is_err());

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_path_leaving_the_skill_is_refused_and_writes_nothing() {
		let root = a_root("skill-files-refused");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");

		for leaving in ["../escaped.md", "/etc/passwd", "reference/../../escaped.md", ""] {
			assert!(skill_file(&root, &bot.id, "baking", leaving).is_err(), "read {leaving}");
			assert!(
				write_skill_file(&root, &bot.id, "baking", leaving, "no").is_err(),
				"wrote {leaving}"
			);
			assert!(
				remove_skill_file(&root, &bot.id, "baking", leaving).is_err(),
				"removed {leaving}"
			);
		}

		assert!(skills(&root, &bot.id)[0].files.is_empty());
		assert!(!a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("escaped.md").exists());

		let _ = fs::remove_dir_all(&root);
	}

	#[cfg(unix)]
	#[test]
	fn a_path_resolving_through_a_link_is_refused_and_leaves_the_disk_alone() {
		let root = a_root("skill-files-linked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");
		let outside = root.join("outside");
		private_files::replace(&outside.join("secret.md"), b"Not yours.").expect("the file lands");
		let held = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking");
		std::os::unix::fs::symlink(&outside, held.join("reference")).expect("the link lands");

		for linked in ["reference", "reference/secret.md"] {
			assert!(skill_file(&root, &bot.id, "baking", linked).is_err(), "read {linked}");
			assert!(
				write_skill_file(&root, &bot.id, "baking", linked, "no").is_err(),
				"wrote {linked}"
			);
			assert!(
				remove_skill_file(&root, &bot.id, "baking", linked).is_err(),
				"removed {linked}"
			);
		}

		assert_eq!(
			fs::read_to_string(outside.join("secret.md")).expect("the file reads"),
			"Not yours."
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_renamed_skill_carries_its_files_to_the_free_slug_of_its_new_name() {
		let root = a_root("skill-renamed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");
		write_skill_file(&root, &bot.id, "baking", "reference/crumb.md", "Open crumb.")
			.expect("the file lands");

		let renamed = update_skill(&root, &bot, "baking", &a_draft("Proofing", "Rise.", "Wait."))
			.expect("the skill is renamed");

		assert_eq!(renamed.id, "proofing");
		assert_eq!(renamed.files, vec!["reference/crumb.md".to_owned()]);
		assert!(!a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking").exists());
		assert_eq!(
			skill_file(&root, &bot.id, "proofing", "reference/crumb.md").expect("the file reads"),
			"Open crumb."
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_renamed_preloaded_skill_is_carried_in_the_agent_under_its_new_name() {
		let root = a_root("skill-renamed-carried");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill lands");
		set_skill_preloaded(&root, &bot, "baking", true).expect("the skill is carried");

		update_skill(&root, &bot, "baking", &a_draft("Proofing", "Rise.", "Wait."))
			.expect("the skill is renamed");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("Proofing"), "got {written}");
		assert!(!written.contains("Baking"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_skill_kept_under_a_numbered_slug_stays_where_it_is() {
		let root = a_root("skill-numbered");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "First."))
			.expect("the first skill lands");
		let second = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Second."))
			.expect("the second skill lands");
		assert_eq!(second.id, "baking-2");

		let updated =
			update_skill(&root, &bot, "baking-2", &a_draft("Baking", "How to.", "Again."))
				.expect("the skill is updated");

		assert_eq!(updated.id, "baking-2");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_created_skill_is_a_file_a_caller_reads_back_whole() {
		let root = a_root("skill-created");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		let created = create_skill(&root, &bot, &a_draft("Baking Bread", "How to bake.", "Bake."))
			.expect("the skill is written");

		assert_eq!(created.id, "baking-bread");
		assert_eq!(created.name, "Baking Bread");
		assert_eq!(created.description, "How to bake.");
		assert_eq!(created.body, "Bake.");
		assert!(!created.is_preloaded);

		let listed = skills(&root, &bot.id);
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].id, "baking-bread");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn an_edited_skill_keeps_every_key_this_app_does_not_own() {
		let root = a_root("skill-edited");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"description: old\n",
				"license: MIT\n",
				"allowed-tools:\n",
				"  - Read\n",
				"metadata:\n",
				"  author: someone\n",
				"---\n\n",
				"Old body.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let updated = update_skill(&root, &bot, "baking", &a_draft("Baking", "New.", "New body."))
			.expect("the skill is rewritten");

		assert_eq!(updated.name, "Baking");
		assert_eq!(updated.description, "New.");
		assert_eq!(updated.body, "New body.");

		let written = written_skill_file(&root, &bot.id, "baking");
		assert!(written.contains("license: MIT"), "got {written}");
		assert!(written.contains("allowed-tools:\n  - Read"), "got {written}");
		assert!(written.contains("  author: someone"), "got {written}");
		assert!(!written.contains("Old body."), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn every_frontmatter_key_a_skill_carries_is_read_back_whatever_the_file_spells() {
		let root = a_root("skill-front-read");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"description: How to bake.\n",
				"when_to_use: |\n",
				"  When the loaf is flat.\n",
				"  And when it is not.\n",
				"argument-hint: \"[loaf]\"\n",
				"arguments:\n",
				"  - flour\n",
				"  - water\n",
				"disable-model-invocation: true\n",
				"user-invocable: false\n",
				"allowed-tools: Read, Bash(git status:*)\n",
				"disallowed-tools: WebFetch WebSearch\n",
				"model: sonnet\n",
				"effort: high\n",
				"context: fresh\n",
				"agent: baker\n",
				"background: true\n",
				"hooks:\n",
				"  PreToolUse:\n",
				"    - matcher: Bash\n",
				"      command: echo\n",
				"paths:\n",
				"  - src\n",
				"shell: /bin/zsh\n",
				"metadata:\n",
				"  author: someone\n",
				"  kiroshi:\n",
				"    preload: true\n",
				"license: MIT\n",
				"compatibility:\n",
				"  claude-code: \">=2.0.0\"\n",
				"---\n\n",
				"Bake.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let read = read_skill(path.parent().expect("the skill directory")).expect("it reads");
		let front = read.front;

		assert_eq!(read.body, "Bake.");
		assert!(read.is_preloaded);
		assert_eq!(
			front.when_to_use.as_deref(),
			Some("When the loaf is flat.\nAnd when it is not.")
		);
		assert_eq!(front.argument_hint.as_deref(), Some("[loaf]"));
		assert_eq!(front.arguments, Some(vec!["flour".to_owned(), "water".to_owned()]));
		assert_eq!(front.disable_model_invocation, Some(true));
		assert_eq!(front.user_invocable, Some(false));
		assert_eq!(
			front.allowed_tools,
			Some(vec!["Read".to_owned(), "Bash(git status:*)".to_owned()])
		);
		assert_eq!(
			front.disallowed_tools,
			Some(vec!["WebFetch".to_owned(), "WebSearch".to_owned()])
		);
		assert_eq!(front.model.as_deref(), Some("sonnet"));
		assert_eq!(front.effort.as_deref(), Some("high"));
		assert_eq!(front.context.as_deref(), Some("fresh"));
		assert_eq!(front.agent.as_deref(), Some("baker"));
		assert_eq!(front.background, Some(true));
		assert_eq!(
			front.hooks,
			Some(serde_json::json!({ "PreToolUse": [{ "matcher": "Bash", "command": "echo" }] }))
		);
		assert_eq!(front.paths, Some(vec!["src".to_owned()]));
		assert_eq!(front.shell.as_deref(), Some("/bin/zsh"));
		assert_eq!(
			front.metadata,
			Some(serde_json::json!({ "author": "someone", "kiroshi": { "preload": true } }))
		);
		assert_eq!(front.license.as_deref(), Some("MIT"));
		assert_eq!(front.compatibility, Some(serde_json::json!({ "claude-code": ">=2.0.0" })));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_folded_block_a_hand_indented_survives_a_letter_that_is_not_ascii() {
		let root = a_root("skill-folded");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"when_to_use: |\n",
				"    Flat.\n",
				"  p\u{e2}te\n",
				"---\n\n",
				"Bake.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let read = read_skill(path.parent().expect("the skill directory")).expect("it reads");

		assert_eq!(read.front.when_to_use.as_deref(), Some("Flat.\np\u{e2}te"));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_draft_writes_what_it_offers_and_leaves_alone_what_it_does_not() {
		let root = a_root("skill-front-write");
		let bot = a_bot("Bean", "Answer briefly.");
		let path = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("baking").join(SKILL_NAME);
		private_files::replace(
			&path,
			concat!(
				"---\n",
				"name: baking\n",
				"description: old\n",
				"license: MIT\n",
				"effort: high\n",
				"homegrown: kept\n",
				"allowed-tools:\n",
				"  - Read\n",
				"---\n\n",
				"Old body.\n",
			)
			.as_bytes(),
		)
		.expect("the skill is dropped in");

		let draft = SkillDraft {
			front: SkillFront {
				allowed_tools: Some(vec!["Read".to_owned(), "Write".to_owned()]),
				model: Some("opus".to_owned()),
				user_invocable: Some(false),
				license: Some(String::new()),
				..SkillFront::default()
			},
			..a_draft("Baking", "New.", "New body.")
		};
		let updated = update_skill(&root, &bot, "baking", &draft).expect("the skill is rewritten");

		assert_eq!(updated.front.allowed_tools, Some(vec!["Read".to_owned(), "Write".to_owned()]));
		assert_eq!(updated.front.model.as_deref(), Some("opus"));
		assert_eq!(updated.front.user_invocable, Some(false));
		assert_eq!(updated.front.license, None);
		assert_eq!(updated.front.effort.as_deref(), Some("high"), "a key nobody offered moved");

		let written = written_skill_file(&root, &bot.id, "baking");
		assert!(written.contains("allowed-tools:\n  - \"Read\"\n  - \"Write\""), "got {written}");
		assert!(written.contains("model: \"opus\""), "got {written}");
		assert!(written.contains("user-invocable: false"), "got {written}");
		assert!(!written.contains("license"), "got {written}");
		assert!(written.contains("homegrown: kept"), "got {written}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn metadata_a_caller_writes_keeps_the_mark_the_bot_carries() {
		let root = a_root("skill-metadata");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let created = create_skill(&root, &bot, &a_draft("Baking", "How.", "Bake at 220 degrees."))
			.expect("the skill is written");
		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");

		let draft = SkillDraft {
			front: SkillFront {
				metadata: Some(serde_json::json!({ "author": "someone" })),
				..SkillFront::default()
			},
			..a_draft("Baking", "How.", "Bake at 220 degrees.")
		};
		let updated =
			update_skill(&root, &bot, &created.id, &draft).expect("the skill is rewritten");

		assert!(updated.is_preloaded, "the mark went with the map that carried it");
		assert_eq!(
			updated.front.metadata,
			Some(serde_json::json!({ "author": "someone", "kiroshi": { "preload": "true" } }))
		);
		let agent = written_agent(&root, &bot.id);
		assert!(agent.contains("Bake at 220 degrees."), "got {agent}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn frontmatter_this_app_cannot_read_refuses_the_write_and_leaves_the_file() {
		let root = a_root("skill-unreadable");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let unclosed = "---\nname: baking\nstill typing\n";
		let strange = "---\nname: kneading\njust some prose\n---\n\nKnead.\n";
		for (id, text) in [("baking", unclosed), ("kneading", strange)] {
			let path = a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join(id).join(SKILL_NAME);
			private_files::replace(&path, text.as_bytes()).expect("the skill is dropped in");

			let refused = update_skill(&root, &bot, id, &a_draft("Baking", "New.", "New body."));

			assert!(refused.is_err(), "{id} was rewritten");
			assert_eq!(written_skill_file(&root, &bot.id, id), text, "{id} was touched");
			assert!(
				set_skill_preloaded(&root, &bot, id, true).is_err(),
				"{id} took a mark it could not carry"
			);
			assert_eq!(
				written_skill_file(&root, &bot.id, id),
				text,
				"{id} was touched by the mark"
			);
		}

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn marking_a_skill_writes_both_marks_and_unmarking_takes_both_away() {
		let root = a_root("skill-marked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let created =
			create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake at 220 degrees."))
				.expect("the skill is written");

		let marked = set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		assert!(marked.is_preloaded);
		let written = written_skill_file(&root, &bot.id, &created.id);
		assert!(written.contains("preload: true"), "got {written}");
		assert!(written.contains(&format!("{INVOCATION_KEY}: true")), "got {written}");
		let agent = written_agent(&root, &bot.id);
		assert!(agent.contains("Bake at 220 degrees."), "got {agent}");

		let quiet = set_skill_preloaded(&root, &bot, &created.id, false).expect("the mark goes");
		assert!(!quiet.is_preloaded);
		let written = written_skill_file(&root, &bot.id, &created.id);
		assert!(!written.contains("preload"), "got {written}");
		assert!(!written.contains(INVOCATION_KEY), "got {written}");
		assert!(!written.contains(METADATA_KEY), "got {written}");
		let agent = written_agent(&root, &bot.id);
		assert!(!agent.contains("Bake at 220 degrees."), "got {agent}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_removed_skill_takes_its_own_directory_and_nothing_beside_it() {
		let root = a_root("skill-removed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let doomed = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("written");
		let kept = drop_a_skill(&root, &bot.id, "kneading", false, "Knead.");

		remove_skill(&root, &bot, &doomed.id).expect("the skill is taken away");

		assert!(!a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join(&doomed.id).exists());
		assert!(kept.is_file(), "the skill beside it was taken away too");
		assert!(remove_skill(&root, &bot, &doomed.id).is_err(), "a skill that is gone was removed");
		assert!(remove_skill(&root, &bot, "../..").is_err(), "an id named a path of its own");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_name_landing_on_a_directory_that_is_taken_is_written_beside_it() {
		let root = a_root("skill-collided");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		drop_a_skill(&root, &bot.id, "baking", false, "Dropped in by hand.");

		let created = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill is written");
		let again = create_skill(&root, &bot, &a_draft("Baking", "Again.", "Bake again."))
			.expect("the second skill is written");

		assert_eq!(created.id, "baking-2");
		assert_eq!(again.id, "baking-3");
		let handwritten = written_skill_file(&root, &bot.id, "baking");
		assert!(handwritten.contains("Dropped in by hand."), "got {handwritten}");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn marking_unmarking_and_removing_a_skill_leave_the_brief_untouched() {
		let root = a_root("skill-brief");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let brief = "Answer at length, in French.";
		rewrite_the_brief(&agent_file(&root, &bot.id).expect("the agent"), brief);

		let created =
			create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake at 220 degrees."))
				.expect("the skill is written");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		set_skill_preloaded(&root, &bot, &created.id, false).expect("the mark goes");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		remove_skill(&root, &bot, &created.id).expect("the skill is taken away");
		assert_eq!(instructions(&root, &bot.id).as_deref(), Some(brief));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_carried_skill_is_titled_by_the_name_it_declares() {
		let root = a_root("skill-titled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let created = create_skill(&root, &bot, &a_draft("Baking", "How to bake.", "Bake."))
			.expect("the skill is written");
		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		private_files::replace(
			&a_held_bundle(&root, &bot.id).join(SKILLS_DIR).join("kneading").join(SKILL_NAME),
			format!("{FENCE}\nmetadata:\n  kiroshi:\n    preload: true\n{FENCE}\n\nKnead.\n")
				.as_bytes(),
		)
		.expect("the nameless skill is dropped in");

		update_skill(&root, &bot, &created.id, &a_draft("Sourdough", "How to bake.", "Bake."))
			.expect("the skill is renamed");

		let written = written_agent(&root, &bot.id);
		assert!(written.contains("# Sourdough"), "got {written}");
		assert!(!written.contains("# baking"), "got {written}");
		assert!(written.contains("# kneading"), "got {written}");
		assert_eq!(created.id, "baking", "a rename moved the directory");

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_value_written_into_a_skill_comes_back_as_it_went_in() {
		let root = a_root("skill-quoted");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let name = "L'art du \"pain\": #1";
		let description = "Bake: quickly, at 220\nthen rest.";

		let created = create_skill(&root, &bot, &a_draft(name, description, "Bake."))
			.expect("the skill is written");
		let listed = skills(&root, &bot.id);

		assert_eq!(created.name, name);
		assert_eq!(created.description, description);
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, name);
		assert_eq!(listed[0].description, description);
		assert_eq!(listed[0].body, "Bake.");

		set_skill_preloaded(&root, &bot, &created.id, true).expect("the mark lands");
		assert!(skills(&root, &bot.id)[0].is_preloaded, "the mark was lost to the quoting");
		assert!(written_agent(&root, &bot.id).contains(name), "got a name the file spelled");

		let _ = fs::remove_dir_all(&root);
	}
}
