use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::private_files;

const DIR_NAME: &str = "system";

const PLUGIN_NAME: &str = "kiroshi";

const MANIFEST: &str = ".claude-plugin/plugin.json";

const LEARN: &str = "skills/learn/SKILL.md";

const ROUTINES: &str = "skills/routines/SKILL.md";

const MISSIONS: &str = "skills/missions/SKILL.md";

const CONVERSATIONS: &str = "skills/conversations/SKILL.md";

const INSTALLS: &str = "skills/applications/SKILL.md";

const TRIGGERS: &str = ".triggers.json";

const FILES: [(&str, &[u8]); 10] = [
	(MANIFEST, include_bytes!("../../plugins/kiroshi/.claude-plugin/plugin.json")),
	(TRIGGERS, include_bytes!("../../plugins/kiroshi/.triggers.json")),
	(LEARN, include_bytes!("../../plugins/kiroshi/skills/learn/SKILL.md")),
	(ROUTINES, include_bytes!("../../plugins/kiroshi/skills/routines/SKILL.md")),
	(INSTALLS, include_bytes!("../../plugins/kiroshi/skills/applications/SKILL.md")),
	(MISSIONS, include_bytes!("../../plugins/kiroshi/skills/missions/SKILL.md")),
	(CONVERSATIONS, include_bytes!("../../plugins/kiroshi/skills/conversations/SKILL.md")),
	(
		"skills/learn/references/skills.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/skills.md"),
	),
	(
		"skills/learn/references/mcp.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/mcp.md"),
	),
	(
		"skills/learn/references/determinism.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/determinism.md"),
	),
];

pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(PLUGIN_NAME))
}

pub fn write(path: &Path) -> std::io::Result<()> {
	for (name, bytes) in FILES {
		private_files::replace(&path.join(name), bytes)?;
	}
	prune(path, &embedded_paths(path));
	Ok(())
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	path(app).filter(|path| path.join(MANIFEST).is_file())
}

fn embedded_paths(path: &Path) -> HashSet<PathBuf> {
	FILES.iter().map(|(name, _)| path.join(name)).collect()
}

fn prune(dir: &Path, embedded: &HashSet<PathBuf>) {
	let Ok(entries) = fs::read_dir(dir) else {
		return;
	};
	for found in entries.flatten().map(|entry| entry.path()) {
		if found.is_dir() {
			prune(&found, embedded);
			let _ = fs::remove_dir(&found);
		} else if !embedded.contains(&found) {
			let _ = fs::remove_file(&found);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::super::{MEMORY_CLOSE, MEMORY_OPEN, SKILL_NAME};
	use super::*;
	use crate::db::connection::fixture_root;
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_path(name: &str) -> RemovedOnDrop {
		fixture_root(&format!("system-{name}"))
	}

	fn committed() -> PathBuf {
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join(PLUGIN_NAME)
	}

	fn committed_files(dir: &Path) -> Vec<PathBuf> {
		let Ok(entries) = fs::read_dir(dir) else {
			return Vec::new();
		};
		entries
			.flatten()
			.map(|entry| entry.path())
			.flat_map(|path| if path.is_dir() { committed_files(&path) } else { vec![path] })
			.collect()
	}

	fn embedded(name: &str) -> &'static [u8] {
		FILES
			.iter()
			.find(|(held, _)| *held == name)
			.map(|(_, bytes)| *bytes)
			.unwrap_or_else(|| panic!("{name} is embedded"))
	}

	#[test]
	fn the_manifest_carries_the_crate_version() {
		let manifest: serde_json::Value =
			serde_json::from_slice(embedded(MANIFEST)).expect("the manifest is JSON");

		assert_eq!(manifest["name"], PLUGIN_NAME);
		assert_eq!(manifest["version"], env!("CARGO_PKG_VERSION"));
	}

	#[test]
	fn the_learn_skill_carries_its_frontmatter_and_the_memory_markers() {
		let text = String::from_utf8_lossy(embedded(LEARN));

		assert!(text.contains("disable-model-invocation: true"), "got {text}");
		assert!(text.contains("preload: true"), "got {text}");
		assert!(text.contains(MEMORY_OPEN), "got {text}");
		assert!(text.contains(MEMORY_CLOSE), "got {text}");
	}

	#[test]
	fn the_learn_skill_bounds_what_the_space_directory_takes() {
		let text = String::from_utf8_lossy(embedded(LEARN));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		for said in [
			"## What the space directory takes",
			"never what it is working on",
			"Never keep a journal, a changelog or a log of the work",
			"Keep SKILL.md under 200 lines",
			"a rule that no longer holds is removed, never dated as closed",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_learn_skill_writes_the_own_directory_through_bundle_write_alone() {
		let text = String::from_utf8_lossy(embedded(LEARN));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		for said in [
			"through the `bundle_write` tool only, never through Edit, Write or Bash",
			"the `title` and `summary` fields of `bundle_write` say it, and replace `.learned.md`",
			"If the block is not there yet, `bundle_write` creates it on your first write",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_routines_skill_is_preloaded_and_says_when_to_ask_before_it_writes() {
		let text = String::from_utf8_lossy(embedded(ROUTINES));

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"List first.",
			"wait for their yes",
			"never a cron expression",
			"Routines panel",
			"works there exactly as anywhere else",
		] {
			assert!(text.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_missions_skill_is_preloaded_and_says_when_a_mission_closes() {
		let text = String::from_utf8_lossy(embedded(MISSIONS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"`working`",
			"`waiting_bot`",
			"`waiting_human`",
			"`ready_to_merge`",
			"`failed`",
			"`done`",
			"`mission_list`, every mission of this conversation, of every companion, open and closed,",
			"Narrow it to another conversation of the space, to the whole space, to a state or to a companion.",
			"`mission_read`, one mission of the space read in full, whoever carries it",
			"`mission_list` and `mission_read` are open to every companion of the space.",
			"The other six act only on a mission of yours",
			"Close every mission you opened that nothing else closed, once the work is over.",
			"When the pull request of a watched mission is merged, the mission closes as done on its",
			"A mission reaches `ready_to_merge` and `done` from its checkout only while its branch is",
			"A red CI, a failing test and a coding agent that is blocked are work still to do in the",
			"Ask, never guess.",
			"`mission_open`",
			"`mission_note`",
			"`mission_watch`",
			"`mission_escalate`",
			"`mission_close`",
			"`mission_list`",
			"`mission_read`",
			"`mission_status`",
			"You hold eight tools for them, on the `kiroshi` server.",
			"## What the conversation it came from hears",
			"`mission_status`, where the mission stands, written every time you stop working on it.",
			"Every time you stop working on a mission, you write its status yourself with `mission_status`, whether the work is over or only paused.",
			"Nothing writes it in your place: the conversation that mission came from hears only the status you write.",
			"It names, by name, whoever picks the work up next",
			"A status says where the mission stands, what moved since the last one, what is waiting, and on whom.",
			"Whoever reads that conversation followed nothing of the mission thread.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_status_section_of_the_missions_skill_says_nothing_of_the_work_and_orders_no_step() {
		let text = String::from_utf8_lossy(embedded(MISSIONS));
		let section = text
			.split("## What the conversation it came from hears")
			.nth(1)
			.expect("the status section is there")
			.split("\n## ")
			.next()
			.expect("the section ends");

		for unsaid in ["merge", "ticket", "pull request", "1."] {
			assert!(!section.contains(unsaid), "{unsaid} is said in {section}");
		}
	}

	#[test]
	fn the_conversations_skill_is_preloaded_and_says_when_a_room_is_worth_opening() {
		let text = String::from_utf8_lossy(embedded(CONVERSATIONS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"`conversation_open`, a new room led by you, answering the id of that room, its title and the companions seated in it.",
			"`conversation_say`, one message in a room you already hold a seat in, answering the id of that room and its title.",
			"`companion_list`, every companion of this space, answering for each one its id, its name and its job.",
			"`conversation_update` seats companions with `add` and takes them out with `remove`, in this conversation, and in another room of the caller when a room id is passed.",
			"The subject belongs to companions who are not in this conversation.",
			"The work runs long and does not belong in the thread it was raised in.",
			"A question you can answer on the spot opens no room",
			"No room is opened for the convenience of the companion opening it.",
			"The title is the subject in a few words, read by someone who followed none of it.",
			"It takes the title and the icon of the room in the same call.",
			"A room is opened with its title and its icon chosen together, the icon picked from `packages/shared/conversation-icons.json` for the subject the title names.",
			"A title change carries its icon in the same call, never the title alone.",
			"The first message is written by you in your own words, and it is read in your name.",
			"A companion is seated by `with`, and it is summoned by an at sign followed by its exact name inside the message.",
			"A room opened with nobody mentioned is a room where nothing happens.",
			"A companion passed to `with`, `add` and `remove` is named by its name or by its id.",
			"A name two companions of this space share is refused, and the refusal answers their ids: pass the id of the one you want in place of that name.",
			"The room id answered by `conversation_open` is the only way back into that room, and nothing lists it later.",
			"You speak only in a room you hold a seat in, and you seat yourself in no room.",
			"The person does not read the new room unless they open it.",
			"Whatever the person decides is asked in the conversation the person is talking in.",
			"Opening a room is reported in one line carrying its title, in the conversation the room was opened from.",
			"`conversation_attach`, one file shown to the person, here or in a room you hold a seat in, answering the path it was stored under and the id of that conversation.",
			"Reading an image with `Read` shows it to you and never to the person.",
			"To show a file, call `conversation_attach`.",
			"You hold six tools for them, on the `kiroshi` server.",
			"`conversation_update`, the title, the icon, the colour and the seats of a conversation you hold a seat in, every field given landing in one call or none of them, answering that conversation as it stands after the call.",
			"The colour is a hue, a whole number from 0 to 359 around the colour wheel, or one of red, orange, yellow, green, cyan, blue, purple or pink for the hue that name stands for, or null to give the room back its default colour.",
			"`conversation_close`, the archive of a room you lead once its subject is settled, answering the id of that room, its title and whether it is archived.",
			"A main conversation and the thread of a mission still open are never closed.",
			"An archived room comes back with `archived` false on `conversation_update`, and `archived` true there is refused: only `conversation_close` archives.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
		for retired in ["companion_invite", "conversation_describe"] {
			assert!(!text.contains(retired), "{retired} is still named");
		}
	}

	#[test]
	fn the_applications_skill_is_preloaded_and_says_where_an_install_goes_and_what_follows() {
		let text = String::from_utf8_lossy(embedded(INSTALLS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"applies when the person asks for an application or asks for one to be installed",
			"go to `When no tool of yours does it`",
			"Search before you install.",
			"`AskUserQuestion`",
			"`metadata.source` set to `application-scope:`",
			"exactly as it answered it",
			"`companion`, you",
			"`space`, every companion of",
			"`user`, the person",
			"Install only in the destination the person picked",
			"Never ask for a key",
			"never repeat one",
			"there is nothing left to do",
			"the name of the secret",
			"Settings panel of that destination",
			"Connect lives in the Settings panel of that destination",
			"## When no tool of yours does it The person asks for something no tool of this session does: a capability none of your tools holds.",
			"Not a refusal of scope, not a rule you follow, not something the person already ruled out.",
			"call `application_search` on that capability. Never ask the person whether to look.",
			"no match, you name the capability that is out of reach, you say you cannot do it, and the search stays unmentioned.",
			"a match, you name one application and say in one line what it unblocks, and that the person installs it from Settings.",
			"One offer per subject, never a second application.",
			"Never call `application_install` here.",
			"When the person has turned an offer down, you never raise it again in this conversation.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn every_committed_file_is_embedded() {
		let root = committed();

		for file in committed_files(&root) {
			let name = file
				.strip_prefix(&root)
				.expect("the file sits under the plugin")
				.to_string_lossy()
				.replace('\\', "/");
			assert_eq!(embedded(&name), fs::read(&file).expect("it reads"), "got {name}");
		}
	}

	#[test]
	fn the_written_plugin_is_the_embedded_directory() {
		let path = a_path("written");

		write(&path).expect("the plugin is written");

		for (name, bytes) in FILES {
			assert_eq!(fs::read(path.join(name)).expect("it reads"), bytes, "got {name}");
		}

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_write_overwrites_a_hand_edit_and_drops_a_stray_file() {
		let path = a_path("rewritten");
		write(&path).expect("the plugin is written");
		private_files::replace(&path.join(MANIFEST), b"{\"name\":\"mine\"}")
			.expect("the hand edit lands");
		let stray = path.join("skills").join("mine").join(SKILL_NAME);
		private_files::replace(&stray, b"mine").expect("the stray file lands");

		write(&path).expect("the plugin is written again");

		for (name, bytes) in FILES {
			assert_eq!(fs::read(path.join(name)).expect("it reads"), bytes, "got {name}");
		}
		assert!(!stray.exists(), "the stray file is gone");
		assert!(!stray.parent().expect("it has a directory").exists(), "the directory is gone");

		let _ = fs::remove_dir_all(&path);
	}
}
