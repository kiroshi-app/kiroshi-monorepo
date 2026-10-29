use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::SystemTime;

use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};

use super::contract::{
	ClaudeImportOutcome, ClaudeImportResult, ClaudeImportSkip, ClaudeInventory, ClaudeItem,
	PROGRESS_EVENT,
};
use super::import::Importer;
use super::inventory::inventory;
use super::source::{source_of, Source};
use crate::bundles;
use crate::companions::contract::CREATED_EVENT;
use crate::conversations::commands::create_drafted_bot;
use crate::conversations::contract::BotDraft;
use crate::db;
use crate::db::connection::temp_dir;
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const SPACE: &str = "personal";

const REVIEWER: &str = "---\nname: Reviewer\ndescription: Reads a diff and says what is wrong\ntools: Read, Grep\n---\nRead the diff before the summary.\n";
const SCRIBE: &str = "---\ndescription: Writes the release note\n---\nKeep it short.\n";
const PDF_SKILL: &str = "---\nname: pdf\ndescription: Fills PDF forms\n---\nUse the forms guide.\n";
const NOTES_SKILL: &str = "---\nname: Meeting notes\ndescription: Turns a transcript into notes\n---\nLead with the decisions.\n";
const CLAUDE_MD: &str = "Answer in English.\n";

fn a_claude_root() -> RemovedOnDrop {
	let root = temp_dir();
	let write = |relative: &str, text: &[u8]| {
		let path = root.join(relative);
		fs::create_dir_all(path.parent().expect("a parent")).expect("the parent stands");
		fs::write(path, text).expect("the file stands");
	};
	write("agents/reviewer.md", REVIEWER.as_bytes());
	write("agents/scribe.md", SCRIBE.as_bytes());
	write("agents/notes.txt", b"not an agent");
	write("skills/pdf/SKILL.md", PDF_SKILL.as_bytes());
	write("skills/pdf/forms.md", b"Field one is the name.\n");
	write("skills/pdf/scripts/fill.py", b"print('filled')\n");
	write("skills/notes/SKILL.md", NOTES_SKILL.as_bytes());
	write("skills/empty/README.md", b"no skill here");
	write("CLAUDE.md", CLAUDE_MD.as_bytes());
	write("plugins/installed_plugins.json", b"{}");
	write("plugins/cache/tool/agents/hidden.md", REVIEWER.as_bytes());
	write("commands/deploy.md", b"Deploy it.\n");
	write(".claude.json", b"{\"mcpServers\":{}}");
	root
}

fn a_host(name: &str) -> AppOfItsOwn {
	let app = an_app_of_its_own(&format!("claude-import-{name}"), mock_builder());
	app.manage(db::bootstrap(app.handle()));
	let person = bundles::user::path(app.handle()).expect("the person plugin has a home");
	bundles::user::lay_down(&person).expect("the person plugin is laid down");
	app
}

fn database_of(app: &App<MockRuntime>) -> &db::Database {
	app.state::<db::DatabaseState>().inner().as_ref().expect("the database opens")
}

fn person_of(app: &App<MockRuntime>) -> PathBuf {
	bundles::user::laid_down(app.handle()).expect("the person plugin is laid down")
}

async fn imported(app: &App<MockRuntime>, root: &Path, keys: &[&str]) -> Vec<ClaudeImportOutcome> {
	let person = person_of(app);
	let importer = Importer {
		app: app.handle(),
		database: database_of(app),
		root,
		person: Some(&person),
		space_id: SPACE,
	};
	importer.run(keys.iter().map(|key| (*key).to_owned()).collect()).await.expect("the run")
}

async fn listed(app: &App<MockRuntime>, root: &Path) -> ClaudeInventory {
	inventory(root, &database_of(app).user().claude_imported().await.expect("the mark"))
}

async fn names_in_space(app: &App<MockRuntime>) -> Vec<String> {
	let bots = database_of(app).conversations().bots(Some(SPACE.to_owned())).await;
	bots.expect("the roster reads").into_iter().map(|bot| bot.name).collect()
}

fn heard(app: &App<MockRuntime>, event: &'static str) -> Receiver<Value> {
	let (sender, received) = channel();
	app.handle().listen(event, move |heard| {
		let payload = serde_json::from_str(heard.payload()).expect("the payload reads");
		sender.send(payload).expect("the test still listens");
	});
	received
}

fn item(key: &str, name: &str, description: &str, already_imported: bool) -> ClaudeItem {
	ClaudeItem {
		key: key.to_owned(),
		name: name.to_owned(),
		description: description.to_owned(),
		already_imported,
	}
}

fn the_five(imported: &[&str]) -> ClaudeInventory {
	let marked = |key: &str| imported.contains(&key);
	ClaudeInventory::Found {
		agents: vec![
			item(
				"agents/reviewer.md",
				"Reviewer",
				"Reads a diff and says what is wrong",
				marked("agents/reviewer.md"),
			),
			item(
				"agents/scribe.md",
				"scribe",
				"Writes the release note",
				marked("agents/scribe.md"),
			),
		],
		skills: vec![
			item(
				"skills/notes",
				"Meeting notes",
				"Turns a transcript into notes",
				marked("skills/notes"),
			),
			item("skills/pdf", "pdf", "Fills PDF forms", marked("skills/pdf")),
		],
		claude_md: Some(item("CLAUDE.md", "CLAUDE.md", "", marked("CLAUDE.md"))),
	}
}

fn imported_named(outcome: &ClaudeImportOutcome) -> &str {
	match &outcome.result {
		ClaudeImportResult::Imported { name, .. } => name,
		other => panic!("{} was not imported: {other:?}", outcome.key),
	}
}

fn cause_of(outcome: &ClaudeImportOutcome) -> &str {
	match &outcome.result {
		ClaudeImportResult::Failed { cause } => cause,
		other => panic!("{} did not fail: {other:?}", outcome.key),
	}
}

fn tree(root: &Path) -> BTreeMap<PathBuf, (Option<Vec<u8>>, SystemTime)> {
	let mut held = BTreeMap::new();
	gather(root, root, &mut held);
	held
}

fn gather(root: &Path, dir: &Path, held: &mut BTreeMap<PathBuf, (Option<Vec<u8>>, SystemTime)>) {
	for entry in fs::read_dir(dir).expect("the dir reads") {
		let path = entry.expect("an entry").path();
		let metadata = fs::symlink_metadata(&path).expect("the metadata reads");
		let modified = metadata.modified().expect("an mtime");
		let relative = path.strip_prefix(root).expect("under the root").to_owned();
		if metadata.is_dir() {
			held.insert(relative, (None, modified));
			gather(root, &path, held);
		} else {
			held.insert(relative, (Some(fs::read(&path).expect("the file reads")), modified));
		}
	}
}

#[tokio::test]
async fn the_inventory_lists_the_agents_the_skills_and_claude_md_and_nothing_else() {
	let app = a_host("inventory");
	let root = a_claude_root();

	assert_eq!(listed(&app, &root).await, the_five(&[]));
}

#[test]
fn a_missing_root_is_absent() {
	let root = temp_dir();

	assert_eq!(inventory(&root.join(".claude"), &BTreeSet::new()), ClaudeInventory::Absent);
}

#[test]
fn a_root_without_agents_or_skills_lists_nothing() {
	let root = temp_dir();

	assert_eq!(
		inventory(&root, &BTreeSet::new()),
		ClaudeInventory::Found { agents: Vec::new(), skills: Vec::new(), claude_md: None }
	);
}

#[test]
fn the_inventory_serialises_as_a_tagged_result() {
	let refused = ClaudeInventory::Refused { cause: "Permission denied".to_owned() };
	let found = ClaudeInventory::Found {
		agents: vec![item("agents/a.md", "a", "", true)],
		skills: Vec::new(),
		claude_md: None,
	};

	assert_eq!(
		serde_json::to_value(ClaudeInventory::Absent).expect("json"),
		json!({ "kind": "absent" })
	);
	assert_eq!(
		serde_json::to_value(refused).expect("json"),
		json!({ "kind": "refused", "cause": "Permission denied" })
	);
	assert_eq!(
		serde_json::to_value(found).expect("json"),
		json!({
			"kind": "found",
			"agents": [{ "key": "agents/a.md", "name": "a", "description": "", "alreadyImported": true }],
			"skills": [],
			"claudeMd": null,
		})
	);
	assert_eq!(
		serde_json::to_value(ClaudeImportResult::Skipped {
			reason: ClaudeImportSkip::AlreadyImported
		})
		.expect("json"),
		json!({ "kind": "skipped", "reason": "alreadyImported" })
	);
}

#[tokio::test]
async fn an_imported_agent_and_skills_land_once_and_are_then_marked() {
	let app = a_host("import");
	let root = a_claude_root();
	let created = heard(&app, CREATED_EVENT);
	let progress = heard(&app, PROGRESS_EVENT);
	let keys = ["agents/reviewer.md", "skills/pdf", "skills/notes", "CLAUDE.md"];

	let outcomes = imported(&app, &root, &keys).await;

	let names: Vec<&str> = outcomes.iter().map(imported_named).collect();
	assert_eq!(names, ["Reviewer", "pdf", "Meeting notes", "CLAUDE.md"]);
	let bots =
		database_of(&app).conversations().bots(Some(SPACE.to_owned())).await.expect("roster");
	let reviewer = bots.iter().find(|bot| bot.name == "Reviewer").expect("the companion landed");
	assert_eq!(reviewer.instructions, "Read the diff before the summary.");
	let announced: Vec<Value> = created.try_iter().collect();
	assert_eq!(announced, [json!({ "id": reviewer.id, "name": "Reviewer" })]);

	let skills = bundles::plugin::skills(&person_of(&app));
	let pdf = skills.iter().find(|skill| skill.name == "pdf").expect("the pdf skill landed");
	assert_eq!(pdf.description, "Fills PDF forms");
	assert_eq!(pdf.body.trim(), "Use the forms guide.");
	assert_eq!(pdf.files, ["forms.md", "scripts/fill.py"]);
	let fill = bundles::skill_file_at(&person_of(&app), &pdf.id, "scripts/fill.py");
	assert_eq!(fill.expect("the copied file reads"), "print('filled')\n");
	assert!(skills.iter().any(|skill| skill.name == "Meeting notes"));
	let claude_md =
		skills.iter().find(|skill| skill.name == "CLAUDE.md").expect("CLAUDE.md landed");
	assert_eq!(claude_md.body.trim(), CLAUDE_MD.trim());

	let heard_progress: Vec<Value> = progress.try_iter().collect();
	let counts: Vec<(Value, Value, Value)> = heard_progress
		.iter()
		.map(|frame| (frame["key"].clone(), frame["done"].clone(), frame["total"].clone()))
		.collect();
	assert_eq!(
		counts,
		keys.iter()
			.zip(1..)
			.map(|(key, done)| (json!(key), json!(done), json!(4)))
			.collect::<Vec<_>>()
	);
	assert_eq!(
		heard_progress[0]["result"],
		json!({ "kind": "imported", "id": reviewer.id, "name": "Reviewer" })
	);

	assert_eq!(listed(&app, &root).await, the_five(&keys));
}

#[tokio::test]
async fn a_key_already_imported_is_skipped_and_creates_nothing() {
	let app = a_host("skipped");
	let root = a_claude_root();
	imported(&app, &root, &["agents/reviewer.md", "skills/pdf"]).await;
	let skills_before = bundles::plugin::skills(&person_of(&app)).len();

	let outcomes = imported(&app, &root, &["agents/reviewer.md", "skills/pdf"]).await;

	let skipped = ClaudeImportResult::Skipped { reason: ClaudeImportSkip::AlreadyImported };
	assert!(outcomes.iter().all(|outcome| outcome.result == skipped), "{outcomes:?}");
	assert_eq!(names_in_space(&app).await.iter().filter(|name| *name == "Reviewer").count(), 1);
	assert_eq!(bundles::plugin::skills(&person_of(&app)).len(), skills_before);
}

#[tokio::test]
async fn a_key_selected_twice_in_one_run_lands_once() {
	let app = a_host("twice");
	let root = a_claude_root();

	let outcomes = imported(&app, &root, &["agents/reviewer.md", "agents/reviewer.md"]).await;

	assert_eq!(imported_named(&outcomes[0]), "Reviewer");
	assert_eq!(
		outcomes[1].result,
		ClaudeImportResult::Skipped { reason: ClaudeImportSkip::AlreadyImported }
	);
}

#[tokio::test]
async fn an_agent_whose_name_is_worn_in_the_space_is_numbered() {
	let app = a_host("numbered");
	let root = a_claude_root();
	let shoto = "---\nname: Shoto\n---\nHelp.\n";
	fs::write(root.join("agents/shoto.md"), shoto).expect("the agent stands");
	fs::write(root.join("agents/shoto-again.md"), shoto).expect("the agent stands");
	let draft =
		BotDraft { name: "shoto".to_owned(), job: String::new(), description: String::new() };
	create_drafted_bot(app.handle(), database_of(&app), draft, SPACE.to_owned())
		.await
		.expect("the worn name lands");

	let outcomes = imported(&app, &root, &["agents/shoto.md", "agents/shoto-again.md"]).await;

	let names: Vec<&str> = outcomes.iter().map(imported_named).collect();
	assert_eq!(names, ["Shoto 2", "Shoto 3"]);
}

#[tokio::test]
async fn a_corrupted_agent_fails_alone() {
	let app = a_host("corrupted");
	let root = a_claude_root();
	fs::write(
		root.join("agents/broken.md"),
		"---\nname: Broken\nthis line names no key\n---\nBody.\n",
	)
	.expect("the broken agent stands");
	fs::write(root.join("agents/binary.md"), [0xff, 0xfe, 0x00]).expect("the binary agent stands");

	let outcomes = imported(
		&app,
		&root,
		&[
			"agents/broken.md",
			"agents/binary.md",
			"agents/gone.md",
			"agents/reviewer.md",
			"../CLAUDE.md",
		],
	)
	.await;

	assert!(cause_of(&outcomes[0]).contains("frontmatter"), "{outcomes:?}");
	assert!(cause_of(&outcomes[1]).starts_with("agents/binary.md did not read"), "{outcomes:?}");
	assert!(cause_of(&outcomes[2]).starts_with("agents/gone.md did not read"), "{outcomes:?}");
	assert_eq!(imported_named(&outcomes[3]), "Reviewer");
	assert_eq!(cause_of(&outcomes[4]), "the key names nothing that is imported");
	assert!(!names_in_space(&app).await.contains(&"Broken".to_owned()));
	let mark = database_of(&app).user().claude_imported().await.expect("the mark");
	assert_eq!(mark, BTreeSet::from(["agents/reviewer.md".to_owned()]));
}

const LOGO: [u8; 6] = [0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe];

fn titles_of(app: &App<MockRuntime>) -> Vec<String> {
	let history = bundles::plugin::history(&person_of(app)).expect("the history reads");
	history.into_iter().map(|entry| entry.title).collect()
}

#[tokio::test]
async fn a_skill_holding_a_file_that_is_not_text_imports_it_byte_for_byte() {
	let app = a_host("skill-binary");
	let root = a_claude_root();
	fs::write(root.join("skills/pdf/logo.png"), LOGO).expect("the image stands");

	let outcomes = imported(&app, &root, &["skills/pdf"]).await;

	let ClaudeImportResult::Imported { id, .. } = &outcomes[0].result else {
		panic!("the skill was not imported: {outcomes:?}");
	};
	let held = person_of(&app).join("skills").join(id);
	assert_eq!(fs::read(held.join("logo.png")).expect("the image reads"), LOGO);
	assert_eq!(
		fs::read(held.join("forms.md")).expect("the guide reads"),
		b"Field one is the name.\n"
	);
}

#[tokio::test]
async fn each_imported_skill_or_claude_md_lands_as_one_entry_named_as_an_import() {
	let app = a_host("one-entry");
	let root = a_claude_root();
	fs::write(root.join("skills/pdf/logo.png"), LOGO).expect("the image stands");
	let before = titles_of(&app);

	let outcomes = imported(&app, &root, &["skills/pdf", "CLAUDE.md"]).await;

	assert_eq!(outcomes.iter().map(imported_named).collect::<Vec<_>>(), ["pdf", "CLAUDE.md"]);
	let after = titles_of(&app);
	assert_eq!(
		after[..after.len() - before.len()],
		[
			"Skill \"CLAUDE.md\" imported from Claude Code".to_owned(),
			"Skill \"pdf\" imported from Claude Code".to_owned(),
		]
	);
}

#[tokio::test]
async fn an_imported_skill_never_replaces_one_the_person_holds() {
	let app = a_host("skill-held");
	let root = a_claude_root();
	let person = person_of(&app);
	let held = bundles::SkillDraft {
		name: "pdf".to_owned(),
		description: "The person's own".to_owned(),
		body: "Kept.".to_owned(),
		front: bundles::SkillFront::default(),
	};
	let kept = bundles::create_skill_at(&person, &held).expect("the held skill lands");

	let outcomes = imported(&app, &root, &["skills/pdf"]).await;

	let ClaudeImportResult::Imported { id, .. } = &outcomes[0].result else {
		panic!("the skill was not imported: {outcomes:?}");
	};
	assert_ne!(*id, kept.id);
	let skills = bundles::plugin::skills(&person);
	let still = skills.iter().find(|skill| skill.id == kept.id).expect("the held skill stays");
	assert_eq!((still.description.as_str(), still.body.trim()), ("The person's own", "Kept."));
}

#[tokio::test]
async fn the_claude_root_is_left_byte_for_byte_and_mtime_for_mtime() {
	let app = a_host("untouched");
	let root = a_claude_root();
	let before = tree(&root);

	listed(&app, &root).await;
	imported(
		&app,
		&root,
		&["agents/reviewer.md", "agents/scribe.md", "skills/pdf", "skills/notes", "CLAUDE.md"],
	)
	.await;
	listed(&app, &root).await;

	assert_eq!(tree(&root), before);
}

#[test]
fn a_key_reaching_out_of_its_directory_names_nothing() {
	let root = Path::new("/claude");

	for key in [
		"agents/../CLAUDE.md",
		"skills/../../etc",
		"agents/a/b.md",
		"agents/x.txt",
		"commands/a.md",
		"agents/",
	] {
		assert!(source_of(root, key).is_none(), "{key} resolved");
	}
	assert!(
		matches!(source_of(root, "skills/pdf"), Some(Source::Skill(dir)) if dir == root.join("skills/pdf"))
	);
}

#[cfg(unix)]
mod refused {
	use std::os::unix::fs::PermissionsExt;

	use super::*;

	struct Locked<'a>(&'a Path);

	impl Drop for Locked<'_> {
		fn drop(&mut self) {
			fs::set_permissions(self.0, fs::Permissions::from_mode(0o755)).expect("the lock lifts");
		}
	}

	fn locked(path: &Path) -> Locked<'_> {
		fs::set_permissions(path, fs::Permissions::from_mode(0o000)).expect("the lock holds");
		Locked(path)
	}

	fn is_refused_on_permission(found: &ClaudeInventory) -> bool {
		let denied = std::io::Error::from(std::io::ErrorKind::PermissionDenied).to_string();
		matches!(found, ClaudeInventory::Refused { cause } if cause.contains(&denied) || cause.contains("Permission denied"))
	}

	#[test]
	fn a_root_that_does_not_open_is_refused() {
		let root = a_claude_root();
		let _locked = locked(&root);

		let found = inventory(&root, &BTreeSet::new());

		assert!(is_refused_on_permission(&found), "{found:?}");
	}

	#[test]
	fn an_agents_or_skills_dir_that_does_not_open_is_refused() {
		let root = a_claude_root();
		for dir in ["agents", "skills"] {
			let held = root.join(dir);
			let _locked = locked(&held);

			let found = inventory(&root, &BTreeSet::new());

			assert!(is_refused_on_permission(&found), "{dir}: {found:?}");
		}
	}
}
