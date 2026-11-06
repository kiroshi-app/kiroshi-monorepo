use std::path::{Path, PathBuf};

use super::{
	bot_recorded, bot_write_failed, drafted, git, learned, unrecorded, ApplicationMark, Author,
	ChangedFile, Evolved, HistoryEntry, McpServer, Skill, SkillDraft, SkillFront, KIROSHI_KEY,
	MANIFEST_DIR, MANIFEST_NAME, PRELOAD_KEY, SERVER_SUBJECT, SKILLS_DIR, SKILL_NAME, VERSION,
};
use crate::private_files;

pub struct Descriptor {
	pub dir_name: &'static str,
	pub plugin_name: &'static str,
	pub description: &'static str,
	pub about_id: &'static str,
	pub about_description: &'static str,
	pub written_title: &'static str,
	pub laid_down_title: &'static str,
}

pub fn lay_down(descriptor: &Descriptor, path: &Path) -> std::io::Result<()> {
	kept(&about_file(descriptor, path), about(descriptor)?.as_bytes())?;
	kept(&manifest_file(path), manifest(descriptor).as_bytes())?;
	let _serialised = super::serialised(path);
	git::init(path).map_err(unrecorded)?;
	git::commit(path, Author::User, descriptor.laid_down_title, "").map(|_| ()).map_err(unrecorded)
}

pub fn laid_down(path: Option<PathBuf>) -> Option<PathBuf> {
	path.filter(|path| manifest_file(path).is_file())
}

pub fn evolve(descriptor: &Descriptor, path: &Path) -> Evolved {
	let _serialised = super::serialised(path);
	let changed = match git::changes(path) {
		Ok(changed) => changed,
		Err(error) => return bot_write_failed(path, error),
	};
	if changed.is_empty() {
		return Evolved::Unchanged;
	}
	let (title, body) =
		learned(path).unwrap_or_else(|| (descriptor.written_title.to_owned(), changed.join("\n")));
	bot_recorded(path, title, &body)
}

pub fn skills(path: &Path) -> Vec<Skill> {
	super::skills_at(path)
}

pub fn create_skill(path: &Path, draft: &SkillDraft) -> std::io::Result<Skill> {
	super::create_skill_at(path, draft)
}

pub fn update_skill(path: &Path, skill_id: &str, draft: &SkillDraft) -> std::io::Result<Skill> {
	super::update_skill_at(path, skill_id, draft)
}

pub fn set_skill_preloaded(
	path: &Path,
	skill_id: &str,
	is_preloaded: bool,
) -> std::io::Result<Skill> {
	super::set_skill_preloaded_at(path, skill_id, is_preloaded)
}

pub fn remove_skill(path: &Path, skill_id: &str) -> std::io::Result<()> {
	super::remove_skill_at(path, skill_id)
}

pub fn skill_file(path: &Path, skill_id: &str, relative: &str) -> std::io::Result<String> {
	super::skill_file_at(path, skill_id, relative)
}

pub fn write_skill_file(
	path: &Path,
	skill_id: &str,
	relative: &str,
	text: &str,
) -> std::io::Result<Skill> {
	super::write_skill_file_at(path, skill_id, relative, text)
}

pub fn remove_skill_file(path: &Path, skill_id: &str, relative: &str) -> std::io::Result<()> {
	super::remove_skill_file_at(path, skill_id, relative)
}

pub fn mcp_servers(path: &Path) -> Vec<McpServer> {
	super::mcp_servers_at(path)
}

pub fn set_mcp_server(
	path: &Path,
	name: &str,
	config: &serde_json::Value,
	mark: Option<&ApplicationMark>,
) -> std::io::Result<McpServer> {
	let _serialised = super::serialised(path);
	let server = super::set_mcp_server_at(path, name, config, mark)?;
	super::rewrite_declared_servers(path)?;
	super::recorded(path, SERVER_SUBJECT, name, "saved from settings").map_err(unrecorded)?;
	Ok(server)
}

pub fn remove_mcp_server(path: &Path, name: &str) -> std::io::Result<()> {
	let _serialised = super::serialised(path);
	super::remove_mcp_server_at(path, name)?;
	super::rewrite_declared_servers(path)?;
	super::recorded(path, SERVER_SUBJECT, name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn history(path: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	super::history_at(path)
}

pub fn changed_files(
	path: &Path,
	oldest_commit_id: &str,
	newest_commit_id: &str,
) -> Result<Vec<ChangedFile>, git2::Error> {
	super::changed_files_at(path, oldest_commit_id, newest_commit_id)
}

pub fn revert(
	path: &Path,
	oldest_commit_id: &str,
	newest_commit_id: &str,
) -> Result<String, git2::Error> {
	super::revert_at(path, oldest_commit_id, newest_commit_id)
}

fn kept(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	match private_files::write(path, bytes) {
		Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
		outcome => outcome,
	}
}

fn about_file(descriptor: &Descriptor, path: &Path) -> PathBuf {
	path.join(SKILLS_DIR).join(descriptor.about_id).join(SKILL_NAME)
}

fn manifest_file(path: &Path) -> PathBuf {
	path.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

fn manifest(descriptor: &Descriptor) -> String {
	serde_json::json!({
		"name": descriptor.plugin_name,
		"version": VERSION,
		"description": descriptor.description,
	})
	.to_string()
}

fn about(descriptor: &Descriptor) -> std::io::Result<String> {
	let draft = SkillDraft {
		name: descriptor.about_id.to_owned(),
		description: descriptor.about_description.to_owned(),
		body: String::new(),
		front: SkillFront {
			metadata: Some(serde_json::json!({ KIROSHI_KEY: { PRELOAD_KEY: true } })),
			disable_model_invocation: Some(true),
			..SkillFront::default()
		},
	};
	drafted(None, &draft)
}

#[cfg(test)]
mod tests {
	use super::super::space::PLUGIN;
	use super::super::tests::{an_unreadable_index, read_only_objects, recorded};
	use super::super::user;
	use super::super::{INVOCATION_KEY, LEARNED_NAME};
	use super::*;
	use crate::db::connection::fixture_root;
	use crate::removed_on_drop::RemovedOnDrop;
	use std::fs;
	use std::thread;

	fn a_path(name: &str) -> RemovedOnDrop {
		fixture_root(&format!("plugin-{name}"))
	}

	fn about_file(path: &Path) -> PathBuf {
		super::about_file(&PLUGIN, path)
	}

	#[test]
	fn the_plugin_is_the_manifest_and_a_skill_with_nothing_in_it_yet() {
		let path = a_path("written");

		lay_down(&PLUGIN, &path).expect("the plugin is laid down");

		let manifest: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(manifest_file(&path)).expect("it reads"))
				.expect("the manifest is JSON");
		assert_eq!(manifest["name"], PLUGIN.plugin_name);

		let text = fs::read_to_string(about_file(&path)).expect("the skill reads");
		assert!(text.contains(&format!("name: \"{}\"", PLUGIN.about_id)), "got {text}");
		assert!(text.contains(&format!("{PRELOAD_KEY}: true")), "got {text}");
		assert!(text.contains(&format!("{INVOCATION_KEY}: true")), "got {text}");
		let (_, body) = text.rsplit_once("\n---\n").expect("the skill has frontmatter");
		assert!(body.trim().is_empty(), "got {body}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn the_person_and_the_space_each_lay_down_their_own_plugin() {
		for (name, descriptor) in [("own-person", &user::PLUGIN), ("own-space", &PLUGIN)] {
			let path = a_path(name);

			lay_down(descriptor, &path).expect("the plugin is laid down");

			let manifest: serde_json::Value =
				serde_json::from_str(&fs::read_to_string(manifest_file(&path)).expect("it reads"))
					.expect("the manifest is JSON");
			assert_eq!(manifest["name"], descriptor.plugin_name);
			assert!(super::about_file(descriptor, &path).is_file());

			let _ = fs::remove_dir_all(&path);
		}
	}

	#[test]
	fn a_plugin_whose_repository_refuses_the_commit_reports_the_failure() {
		let path = a_path("commit-refused");
		fs::create_dir_all(&path).expect("the plugin directory is there");
		fs::write(path.join(".git"), "not a repository").expect("the gitfile lands");

		let failure = lay_down(&PLUGIN, &path).expect_err("the commit is refused");
		assert_eq!(failure.kind(), std::io::ErrorKind::Other);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_launch_leaves_what_the_space_owns_as_it_was_left() {
		let path = a_path("kept");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		private_files::replace(&about_file(&path), b"ours").expect("the hand edit lands");

		lay_down(&PLUGIN, &path).expect("the plugin is laid down again");

		assert_eq!(fs::read_to_string(about_file(&path)).expect("the skill reads"), "ours");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_that_changed_nothing_writes_no_commit() {
		let path = a_path("quiet");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");

		assert_eq!(evolve(&PLUGIN, &path), Evolved::Unchanged);

		assert_eq!(git::history(&path).expect("the history reads").len(), 1);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_is_committed_under_the_title_the_bot_left_behind() {
		let path = a_path("learned");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		private_files::replace(&about_file(&path), b"The API lives in apps/api.")
			.expect("the write lands");
		private_files::replace(
			&path.join(LEARNED_NAME),
			b"I noted where the API lives\n\nThey pointed me at it.",
		)
		.expect("the note lands");

		let evolution = recorded(evolve(&PLUGIN, &path)).expect("the turn is recorded");

		let history = git::history(&path).expect("the history reads");
		assert_eq!(evolution.commit_id, history[0].id);
		assert_eq!(evolution.title, history[0].title);
		assert_eq!(history[0].title, "I noted where the API lives");
		assert_eq!(history[0].author, Author::Bot);
		assert!(!path.join(LEARNED_NAME).exists(), "the note is cleared");
		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"the plugin is left committed"
		);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_git_refuses_reports_the_error_and_is_recorded_once_git_is_repaired() {
		let path = a_path("objects-read-only");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		let skill = path.join(SKILLS_DIR).join("api").join(SKILL_NAME);
		private_files::replace(&skill, b"The API lives in apps/api.").expect("the write lands");
		private_files::replace(&path.join(LEARNED_NAME), b"I noted where the API lives\n")
			.expect("the note lands");

		let read_only = read_only_objects(&path);
		let refused = evolve(&PLUGIN, &path);
		drop(read_only);

		let Evolved::Failed(error) = refused else {
			panic!("the commit went through: {refused:?}");
		};
		assert!(!error.message().is_empty(), "the git error is carried");
		assert!(skill.is_file(), "the skill was thrown away");
		assert!(path.join(LEARNED_NAME).is_file(), "the note was thrown away");

		let evolution = recorded(evolve(&PLUGIN, &path)).expect("the turn is recorded");

		assert_eq!(evolution.title, "I noted where the API lives");
		assert_eq!(git::history(&path).expect("the history reads")[0].id, evolution.commit_id);
		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"the plugin is left committed"
		);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_turn_whose_status_git_cannot_read_reports_the_error_and_is_recorded_once_repaired() {
		let path = a_path("index-unreadable");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		let skill = path.join(SKILLS_DIR).join("api").join(SKILL_NAME);
		private_files::replace(&skill, b"The API lives in apps/api.").expect("the write lands");
		private_files::replace(&path.join(LEARNED_NAME), b"I noted where the API lives\n")
			.expect("the note lands");

		let index = an_unreadable_index(&path);
		let refused = evolve(&PLUGIN, &path);
		index.restore();

		assert!(matches!(refused, Evolved::Failed(_)), "got {refused:?}");
		assert!(skill.is_file(), "the skill was thrown away");
		assert!(path.join(LEARNED_NAME).is_file(), "the note was thrown away");

		let evolution = recorded(evolve(&PLUGIN, &path)).expect("the turn is recorded");

		assert_eq!(evolution.title, "I noted where the API lives");

		let _ = fs::remove_dir_all(&path);
	}

	fn a_draft(name: &str, body: &str) -> SkillDraft {
		SkillDraft {
			name: name.to_owned(),
			description: "How this project is laid out".to_owned(),
			body: body.to_owned(),
			front: SkillFront::default(),
		}
	}

	#[test]
	fn a_skill_written_in_the_space_is_kept_and_reaches_the_history() {
		let path = a_path("skilled");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");

		let created = create_skill(&path, &a_draft("how-we-ship", "Small commits."))
			.expect("the skill lands");

		assert_eq!(created.id, "how-we-ship");
		assert!(skills(&path).iter().any(|skill| skill.id == created.id));
		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"the skill reached the history"
		);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn undoing_a_change_puts_the_skill_back_as_it_was() {
		let path = a_path("undone");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		update_skill(
			&path,
			PLUGIN.about_id,
			&a_draft(PLUGIN.about_id, "The API lives in apps/api."),
		)
		.expect("the edit lands");
		let latest = history(&path).expect("the history reads")[0].id.clone();

		revert(&path, &latest, &latest).expect("the change is undone");

		let text = fs::read_to_string(about_file(&path)).expect("the skill reads");
		assert!(!text.contains("apps/api"), "got {text}");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_skill_removed_from_the_space_leaves_the_plugin() {
		let path = a_path("pruned");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		create_skill(&path, &a_draft("passing", "Gone soon.")).expect("the skill lands");

		remove_skill(&path, "passing").expect("the skill is removed");

		assert!(!skills(&path).iter().any(|skill| skill.id == "passing"));
		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"the removal reached the history"
		);

		let _ = fs::remove_dir_all(&path);
	}

	fn mcp_file(path: &Path) -> PathBuf {
		path.join(super::super::MCP_NAME)
	}

	fn declared_manifest(path: &Path) -> serde_json::Value {
		serde_json::from_str(&fs::read_to_string(manifest_file(path)).expect("it reads"))
			.expect("the manifest is JSON")
	}

	#[test]
	fn a_server_written_in_the_space_is_declared_by_the_manifest_and_reaches_the_history() {
		let path = a_path("served");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");

		let written =
			set_mcp_server(&path, "clock", &serde_json::json!({ "command": "clock" }), None)
				.expect("the server lands");

		assert_eq!(written.name, "clock");
		assert_eq!(mcp_servers(&path).len(), 1);
		assert_eq!(declared_manifest(&path)["mcpServers"], "./.mcp.json");
		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"the write reached the history"
		);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_server_that_is_not_an_object_is_refused_and_leaves_the_file_as_it_was() {
		let path = a_path("refused");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		set_mcp_server(&path, "clock", &serde_json::json!({ "command": "clock" }), None)
			.expect("the server lands");
		let held = fs::read_to_string(mcp_file(&path)).expect("the file reads");

		let refused = set_mcp_server(&path, "broken", &serde_json::json!("clock"), None);

		assert!(
			matches!(&refused, Err(error) if error.kind() == std::io::ErrorKind::InvalidInput),
			"the write is refused"
		);
		assert_eq!(fs::read_to_string(mcp_file(&path)).expect("the file reads"), held);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn the_last_server_removed_takes_the_file_and_its_declaration_with_it() {
		let path = a_path("unserved");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		set_mcp_server(&path, "clock", &serde_json::json!({ "command": "clock" }), None)
			.expect("the server lands");

		remove_mcp_server(&path, "clock").expect("the server is removed");

		assert!(mcp_servers(&path).is_empty());
		assert!(!mcp_file(&path).exists(), "the file is gone");
		assert!(declared_manifest(&path).get("mcpServers").is_none());
		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"the removal reached the history"
		);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn removing_a_server_the_space_never_declared_fails() {
		let path = a_path("absent");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");

		let refused = remove_mcp_server(&path, "clock");

		assert_eq!(refused.expect_err("it is refused").kind(), std::io::ErrorKind::NotFound);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn the_diff_of_a_commit_reads_the_files_that_commit_changed() {
		let path = a_path("diffed");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");
		update_skill(
			&path,
			PLUGIN.about_id,
			&a_draft(PLUGIN.about_id, "The API lives in apps/api."),
		)
		.expect("the edit lands");
		let latest = history(&path).expect("the history reads")[0].id.clone();

		let files = changed_files(&path, &latest, &latest).expect("the diff reads");

		let touched = files.iter().find(|file| file.path.contains(PLUGIN.about_id));
		let touched = touched.expect("the edited skill is among the files");
		assert!(touched.patch.contains("apps/api"), "got {}", touched.patch);

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn two_sessions_writing_at_once_both_reach_the_history() {
		let path = a_path("crowded");
		lay_down(&PLUGIN, &path).expect("the plugin is laid down");

		let writers: Vec<_> = ["one", "two"]
			.into_iter()
			.map(|name| {
				let path = path.to_path_buf();
				thread::spawn(move || {
					private_files::replace(
						&path.join(SKILLS_DIR).join(name).join(SKILL_NAME),
						name.as_bytes(),
					)
					.expect("the write lands");
					let _recorded = evolve(&PLUGIN, &path);
				})
			})
			.collect();
		for writer in writers {
			writer.join().expect("the session ends");
		}

		assert!(
			git::changes(&path).expect("the status reads").is_empty(),
			"every change reached the history"
		);

		let _ = fs::remove_dir_all(&path);
	}
}
