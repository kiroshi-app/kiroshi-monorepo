use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use kiroshi_core::db::{connection, migrations};
use kiroshi_core::removed_on_drop::RemovedOnDrop;
use kiroshi_rune_preview::local::{DATA_ENV, IDENTIFIER, LocalCore};
use serde_json::{Value, json};

const PREVIEW: &str = env!("CARGO_BIN_EXE_kiroshi-rune-preview");

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

const SIDECAR_ENV: &str = "KIROSHI_AGENT_SIDECAR";

fn a_data_folder() -> RemovedOnDrop {
	RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-rune-preview-{}", uuid::Uuid::new_v4())),
	)
}

#[test]
fn the_window_model_opens_in_process_sends_and_hears_the_reply_as_a_core_event() {
	let data = a_data_folder();

	let ran = Command::new(PREVIEW)
		.args(["--local-send", "hello from the preview"])
		.env(SIDECAR_ENV, FAKE_SIDECAR)
		.env(DATA_ENV, &*data)
		.output()
		.expect("the preview runs");

	let printed = String::from_utf8_lossy(&ran.stdout);
	let complained = String::from_utf8_lossy(&ran.stderr);
	assert!(ran.status.success(), "the exchange failed: {printed}{complained}");
	assert!(printed.contains("opened "), "the window model did not open: {printed}");
	assert!(printed.contains("sent to conversation"), "{printed}");
	let reply: Vec<&str> =
		printed.lines().skip_while(|line| !line.starts_with("reply: ")).collect();
	assert!(!reply.is_empty(), "no reply event was heard: {printed}");
	assert!(
		reply.join("\n").contains("hello from the preview"),
		"the reply did not answer the message: {printed}"
	);
	assert!(
		printed.contains("stored reply: "),
		"the stored reply was not announced after its stream: {printed}"
	);
	assert!(
		data.join("conversations.sqlite3").is_file(),
		"the exchange did not land in the preview's own store"
	);
}

const A_PROFILE_OF_THE_TAURI_APP: &str = "
	INSERT INTO spaces (id, name, colour, position, created_at)
		VALUES ('studio', 'Studio', 210, 1, 1);
	INSERT INTO bots (id, name, model, created_at)
		VALUES ('ada', 'Ada', 'sonnet', 1), ('grace', 'Grace', 'sonnet', 1);
	INSERT INTO bot_spaces (bot_id, space_id, joined_at)
		VALUES ('ada', 'personal', 1), ('grace', 'studio', 1);
	INSERT INTO conversations (id, kind, title, created_at, updated_at, space_id, last_activity_at)
		VALUES ('launch-plan', 'topic', 'Launch plan', 1, 1, 'personal', 3),
			('weekly-notes', 'topic', 'Weekly notes', 1, 1, 'personal', 2),
			('logo-review', 'topic', 'Logo review', 1, 1, 'studio', 1);
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
		VALUES ('launch-plan', 'ada', 'member', 1), ('weekly-notes', 'ada', 'member', 1),
			('logo-review', 'grace', 'member', 1);
";

const SCHEMA_VERSION_OFFSET: usize = 60;

fn a_profile_of_the_tauri_app(data: &Path) -> PathBuf {
	let store = connection::file(data).expect("the profile folder is made");
	let mut written = connection::open(&store).expect("the profile store opens");
	migrations::apply(&mut written).expect("the profile reaches the shipped schema");
	written.execute_batch(A_PROFILE_OF_THE_TAURI_APP).expect("the profile is filled");
	drop(written);
	drop(opened(data));
	store
}

fn opened(data: &Path) -> LocalCore {
	LocalCore::open(data.to_path_buf())
		.unwrap_or_else(|failure| panic!("the core did not open the profile: {failure}"))
}

fn schema_version(store: &[u8]) -> u32 {
	let field = &store[SCHEMA_VERSION_OFFSET..SCHEMA_VERSION_OFFSET + 4];
	u32::from_be_bytes(field.try_into().expect("the header holds a schema version"))
}

fn ids(listed: &[Value]) -> BTreeSet<String> {
	listed.iter().map(|row| row["id"].as_str().expect("every row has an id").to_owned()).collect()
}

fn listed_by_space(core: &LocalCore) -> (BTreeSet<String>, BTreeSet<String>, BTreeSet<String>) {
	let spaces: Vec<Value> = core.invoke("space_list", json!({})).expect("the Spaces list");
	let (mut agents, mut conversations) = (BTreeSet::new(), BTreeSet::new());
	for space in &spaces {
		let space_id = &space["id"];
		let members: Vec<Value> = core
			.invoke("conversation_bots", json!({ "spaceId": space_id }))
			.expect("the agents of a Space list");
		agents.extend(ids(&members));
		let page: Value = core
			.invoke("conversation_page", json!({ "spaceId": space_id, "limit": 100 }))
			.expect("the conversations of a Space list");
		for part in ["pinned", "conversations"] {
			conversations.extend(ids(page[part].as_array().expect("the page holds its rows")));
		}
	}
	(ids(&spaces), agents, conversations)
}

#[test]
fn the_core_lists_every_row_of_an_existing_profile_and_writes_nothing_to_its_store() {
	let data = a_data_folder();
	let store = a_profile_of_the_tauri_app(&data);
	let before = std::fs::read(&store).expect("the profile store reads");

	let core = opened(&data);
	let (spaces, agents, conversations) = listed_by_space(&core);
	drop(core);

	let after = std::fs::read(&store).expect("the profile store reads again");
	let named = |names: &[&str]| names.iter().map(|name| (*name).to_owned()).collect();
	assert_eq!(spaces, named(&["personal", "studio"]));
	assert_eq!(agents, named(&["ada", "grace"]));
	assert_eq!(conversations, named(&["launch-plan", "logo-review", "weekly-notes"]));
	assert_eq!(schema_version(&before), migrations::latest_version());
	assert_eq!(schema_version(&after), schema_version(&before));
	assert!(after == before, "opening the profile changed its store");
}

#[cfg(not(debug_assertions))]
#[test]
fn a_release_build_opens_the_profile_of_the_installed_kiroshi() {
	assert_eq!(IDENTIFIER, "com.kiroshi.app");
}

#[cfg(debug_assertions)]
#[test]
fn a_dev_build_with_no_data_override_opens_the_dev_profile_of_kiroshi() {
	assert_eq!(IDENTIFIER, "com.kiroshi.app.dev");
	let home = a_data_folder();

	let ran = Command::new(PREVIEW)
		.args(["--local-send", "hello from the dev profile"])
		.env(SIDECAR_ENV, FAKE_SIDECAR)
		.env_remove(DATA_ENV)
		.env("HOME", &*home)
		.env("XDG_DATA_HOME", &*home)
		.env("APPDATA", &*home)
		.output()
		.expect("the preview runs");

	let complained = String::from_utf8_lossy(&ran.stderr);
	assert!(ran.status.success(), "the exchange failed: {complained}");
	let profile = data_root_under(&home).join("com.kiroshi.app.dev");
	assert!(
		profile.join("conversations.sqlite3").is_file(),
		"{} holds no store",
		profile.display()
	);
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn data_root_under(home: &Path) -> PathBuf {
	home.join("Library/Application Support")
}

#[cfg(all(debug_assertions, not(target_os = "macos")))]
fn data_root_under(home: &Path) -> PathBuf {
	home.to_path_buf()
}
