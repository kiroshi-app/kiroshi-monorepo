mod common;

use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::avatars::{self, Avatars};
use kiroshi_app::bundles;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::environment::contract::EnvOwner;
use kiroshi_app::environment::store;
use kiroshi_app::file_store::FileStore;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const ATTACHMENT: &[u8] = b"the bytes of a note that travels with its conversation";
const SPACE_SECRET: (&str, &str) = ("SPACE_TOKEN", "space-value");
const BOT_SECRET: (&str, &str) = ("BOT_TOKEN", "bot-value");
const SPACE_SERVER_SECRET: (&str, &str) = ("CLOCK_REGION", "space-server-value");
const BOT_SERVER_SECRET: (&str, &str) = ("CLOCK_KEY", "bot-server-value");
const SERVER: &str = "clock";

struct Home {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	dir: PathBuf,
}

impl Home {
	fn new() -> Self {
		let app =
			an_app_of_its_own("space-bundle", mock_builder().invoke_handler(invoke_handler()));
		let dir = app.path().app_data_dir().expect("data dir");
		app.manage(db::bootstrap(app.handle()));
		let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
			.build()
			.expect("window");
		Self { app, window, dir }
	}

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

	fn id_of(&self, cmd: &str, body: Value) -> String {
		self.call(cmd, body).unwrap_or_else(|error| panic!("{cmd} failed: {error}"))["id"]
			.as_str()
			.expect("an id")
			.to_owned()
	}

	fn count(&self, sql: &'static str) -> i64 {
		let state = self.app.state::<db::DatabaseState>();
		let database = state.inner().as_ref().expect("the database opened");
		tauri::async_runtime::block_on(
			database.call(move |connection| Ok(connection.query_row(sql, [], |row| row.get(0))?)),
		)
		.expect("the count")
	}

	fn table_counts(&self) -> BTreeMap<String, i64> {
		let state = self.app.state::<db::DatabaseState>();
		let database = state.inner().as_ref().expect("the database opened");
		tauri::async_runtime::block_on(database.call(|connection| {
			let mut statement = connection.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
					AND name NOT LIKE 'message_search_%'",
			)?;
			let names: Vec<String> =
				statement.query_map([], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?;
			let mut counts = BTreeMap::new();
			for name in names {
				let count: i64 =
					connection
						.query_row(&format!("SELECT count(*) FROM {name}"), [], |row| row.get(0))?;
				counts.insert(name, count);
			}
			Ok(counts)
		}))
		.expect("the counts")
	}

	fn files(&self) -> BTreeMap<PathBuf, Vec<u8>> {
		let mut files = BTreeMap::new();
		walked(&self.dir, &self.dir, &mut files);
		files
	}

	fn bots_of(&self, space_id: &str) -> Vec<Value> {
		self.call("conversation_bots", json!({ "spaceId": space_id }))
			.expect("the bots")
			.as_array()
			.expect("a list")
			.clone()
	}

	fn topics_of(&self, space_id: &str) -> Vec<Value> {
		self.call("conversation_list", json!({ "spaceId": space_id }))
			.expect("the conversations")
			.as_array()
			.expect("a list")
			.clone()
	}

	fn env_root(&self) -> PathBuf {
		store::root(self.app.handle()).expect("an env root")
	}

	fn env_entries(&self, scope: Value) -> Vec<(String, bool)> {
		let listed = self.call("env_list", json!({ "scope": scope })).expect("the env lists");
		listed
			.as_array()
			.expect("a list")
			.iter()
			.map(|entry| {
				let name = entry["name"].as_str().expect("a name").to_owned();
				(name, entry["isUnset"] == json!(true))
			})
			.collect()
	}

	fn bot_root(&self) -> PathBuf {
		bundles::root(self.app.handle()).expect("a bot root")
	}

	fn avatar_dir(&self) -> PathBuf {
		Avatars::dir(self.app.handle()).expect("an avatar dir")
	}

	fn avatar_of(&self, space_id: &str, bot_id: &str) -> Value {
		self.bots_of(space_id)
			.into_iter()
			.find(|bot| bot["id"] == json!(bot_id))
			.expect("the bot is listed")["avatarImagePath"]
			.clone()
	}
}

fn walked(root: &Path, dir: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
	let Ok(entries) = fs::read_dir(dir) else {
		return;
	};
	for entry in entries.flatten() {
		let path = entry.path();
		let name = entry.file_name().to_string_lossy().into_owned();
		if name.starts_with(db::connection::FILE_NAME) {
			continue;
		}
		if path.is_dir() {
			files.insert(path.strip_prefix(root).expect("inside").to_path_buf(), Vec::new());
			walked(root, &path, files);
		} else {
			files.insert(
				path.strip_prefix(root).expect("inside").to_path_buf(),
				fs::read(&path).expect("a readable file"),
			);
		}
	}
}

fn an_identity(name: &str) -> Value {
	json!({
		"name": name,
		"title": "",
		"model": "sonnet",
		"avatarBlot": Value::Null,
		"avatarImagePath": Value::Null,
		"instructions": format!("{name} answers briefly."),
		"deniedTools": []
	})
}

fn a_png() -> Vec<u8> {
	let mut bytes = std::io::Cursor::new(Vec::new());
	image::RgbaImage::from_pixel(32, 32, image::Rgba([200, 80, 40, 255]))
		.write_to(&mut bytes, image::ImageFormat::Png)
		.expect("the picture encodes");
	bytes.into_inner()
}

fn worn_avatar(home: &Home, bot_id: &str) -> String {
	home.call("conversation_set_bot_avatar_image", json!({ "id": bot_id, "bytes": a_png() }))
		.expect("the avatar is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned()
}

struct Seeded {
	space_id: String,
	avatar: String,
	bot_ids: Vec<String>,
	conversation_id: String,
	attachment_name: String,
}

fn seeded(home: &Home) -> Seeded {
	let space_id = home.id_of("space_create", json!({ "name": "Travelling" }));
	let bot_ids: Vec<String> = ["Camille", "Sacha"]
		.iter()
		.map(|name| {
			home.id_of(
				"conversation_create_bot",
				json!({ "identity": an_identity(name), "spaceId": space_id }),
			)
		})
		.collect();
	let conversation_id = home.id_of(
		"conversation_create",
		json!({
			"spaceId": space_id,
			"sectionId": Value::Null,
			"title": "Plans",
			"botIds": bot_ids
		}),
	);
	let stored = home
		.call(
			"chat_store_attachments",
			json!({
				"conversationId": conversation_id,
				"attachments": [{ "name": "note.txt", "bytes": ATTACHMENT }]
			}),
		)
		.expect("the attachment is stored");
	let attachment = stored[0].as_str().expect("a path").to_owned();
	home.call(
		"conversation_start_turn",
		json!({ "turn": { "id": "t1", "conversationId": conversation_id, "startedAt": 1 } }),
	)
	.expect("the turn starts");
	home.call(
		"conversation_append_user_message",
		json!({ "message": {
			"id": "m1",
			"conversationId": conversation_id,
			"turnId": "t1",
			"authorBotId": Value::Null,
			"repliedToMessageId": Value::Null,
			"content": format!("Read this\n{attachment}"),
			"createdAt": 2
		}}),
	)
	.expect("the message lands");
	home.call(
		"conversation_open_runtime_session",
		json!({
			"conversationId": conversation_id,
			"botId": bot_ids[0],
			"startedAt": 3,
			"reason": Value::Null
		}),
	)
	.expect("a session opens");
	home.call(
		"env_set",
		json!({
			"scope": { "kind": "space", "id": space_id },
			"name": SPACE_SECRET.0,
			"value": SPACE_SECRET.1
		}),
	)
	.expect("the space env is written");
	home.call(
		"env_set",
		json!({
			"scope": { "kind": "bot", "id": bot_ids[0], "spaceId": space_id },
			"name": BOT_SECRET.0,
			"value": BOT_SECRET.1
		}),
	)
	.expect("the bot env is written");
	home.call(
		"env_set",
		json!({
			"scope": { "kind": "server", "name": SERVER, "owner": { "kind": "space", "id": space_id } },
			"name": SPACE_SERVER_SECRET.0,
			"value": SPACE_SERVER_SECRET.1
		}),
	)
	.expect("the space server env is written");
	home.call(
		"env_set",
		json!({
			"scope": {
				"kind": "server",
				"name": SERVER,
				"owner": { "kind": "bot", "id": bot_ids[0], "spaceId": space_id }
			},
			"name": BOT_SERVER_SECRET.0,
			"value": BOT_SERVER_SECRET.1
		}),
	)
	.expect("the bot server env is written");
	let attachment_name =
		Path::new(&attachment).file_name().expect("a name").to_string_lossy().into_owned();
	let avatar = worn_avatar(home, &bot_ids[0]);
	let lost_avatar = worn_avatar(home, &bot_ids[1]);
	fs::remove_file(lost_avatar).expect("the second avatar goes missing");
	Seeded { space_id, avatar, bot_ids, conversation_id, attachment_name }
}

fn exported(home: &Home, space_id: &str, into: &Path) -> PathBuf {
	let archive = into.join(format!("{space_id}.kiroshi"));
	home.call("space_export", json!({ "id": space_id, "path": archive.to_string_lossy() }))
		.expect("the space is exported");
	archive
}

fn imported(home: &Home, archive: &Path) -> Value {
	home.call("space_import", json!({ "path": archive.to_string_lossy() }))
		.expect("the space is imported")
}

fn history_ids(root: &Path, bot_id: &str) -> Vec<String> {
	bundles::history(root, bot_id).expect("a history").into_iter().map(|entry| entry.id).collect()
}

fn rewritten(archive: &Path, into: &Path, change: impl Fn(&str, Vec<u8>) -> Vec<u8>) -> PathBuf {
	let mut read = tar::Archive::new(fs::File::open(archive).expect("the archive opens"));
	let mut builder = tar::Builder::new(Vec::new());
	for entry in read.entries().expect("entries") {
		let mut entry = entry.expect("an entry");
		let path = entry.path().expect("a path").to_string_lossy().into_owned();
		let mut bytes = Vec::new();
		entry.read_to_end(&mut bytes).expect("the entry reads");
		let bytes = change(&path, bytes);
		let mut header = entry.header().clone();
		header.set_size(bytes.len() as u64);
		header.set_cksum();
		builder.append_data(&mut header, &path, bytes.as_slice()).expect("the entry is written");
	}
	let target = into.join("rewritten.kiroshi");
	fs::write(&target, builder.into_inner().expect("the archive")).expect("written");
	target
}

fn copied(archive: &Path, adjust: impl Fn(&mut tar::Header)) -> tar::Builder<Vec<u8>> {
	let mut read = tar::Archive::new(fs::File::open(archive).expect("the archive opens"));
	let mut builder = tar::Builder::new(Vec::new());
	for entry in read.entries().expect("entries") {
		let mut entry = entry.expect("an entry");
		let path = entry.path().expect("a path").to_string_lossy().into_owned();
		let mut bytes = Vec::new();
		entry.read_to_end(&mut bytes).expect("the entry reads");
		let mut header = entry.header().clone();
		adjust(&mut header);
		builder.append_data(&mut header, &path, bytes.as_slice()).expect("the entry is written");
	}
	builder
}

fn finished(builder: tar::Builder<Vec<u8>>, target: PathBuf) -> PathBuf {
	fs::write(&target, builder.into_inner().expect("the archive")).expect("written");
	target
}

fn remodeled(archive: &Path, into: &Path, mode: u32) -> PathBuf {
	let builder = copied(archive, |header| header.set_mode(mode));
	finished(builder, into.join("remodeled.kiroshi"))
}

fn extended(
	archive: &Path,
	into: &Path,
	extra: impl FnOnce(&mut tar::Builder<Vec<u8>>),
) -> PathBuf {
	let mut builder = copied(archive, |_| {});
	extra(&mut builder);
	finished(builder, into.join("extended.kiroshi"))
}

#[cfg(unix)]
fn assert_owner_only_under(dir: &Path) {
	use std::os::unix::fs::PermissionsExt;

	for entry in fs::read_dir(dir).expect("a readable dir") {
		let path = entry.expect("an entry").path();
		let metadata = fs::symlink_metadata(&path).expect("the metadata");
		let expected = if metadata.is_dir() { 0o700 } else { 0o600 };
		assert_eq!(
			metadata.permissions().mode() & 0o777,
			expected,
			"{} is not owner-only",
			path.display()
		);
		if metadata.is_dir() {
			assert_owner_only_under(&path);
		}
	}
}

fn space_scope(space_id: &str) -> Value {
	json!({ "kind": "space", "id": space_id })
}

fn bot_scope(space_id: &str, bot_id: &str) -> Value {
	json!({ "kind": "bot", "id": bot_id, "spaceId": space_id })
}

fn bot_server_scope(space_id: &str, bot_id: &str) -> Value {
	json!({ "kind": "server", "name": SERVER, "owner": bot_scope(space_id, bot_id) })
}

fn space_server_scope(space_id: &str) -> Value {
	json!({ "kind": "server", "name": SERVER, "owner": space_scope(space_id) })
}

fn unset(names: &[&str]) -> Vec<(String, bool)> {
	names.iter().map(|name| ((*name).to_owned(), true)).collect()
}

fn assert_names_arrived_unset(home: &Home, space_id: &str, bot_id: &str) {
	assert_eq!(home.env_entries(space_scope(space_id)), unset(&[SPACE_SECRET.0]));
	assert_eq!(
		home.env_entries(bot_scope(space_id, bot_id)),
		unset(&[BOT_SECRET.0, SPACE_SECRET.0])
	);
	assert_eq!(
		home.env_entries(space_server_scope(space_id)),
		unset(&[SPACE_SERVER_SECRET.0, SPACE_SECRET.0])
	);
	assert_eq!(
		home.env_entries(bot_server_scope(space_id, bot_id)),
		unset(&[BOT_SECRET.0, BOT_SERVER_SECRET.0, SPACE_SECRET.0])
	);
	let resolved = store::resolve(
		&home.env_root(),
		&EnvOwner::Bot { id: bot_id.to_owned(), space_id: space_id.to_owned() },
	)
	.expect("the bot env");
	assert!(resolved.base.is_empty(), "an unset name resolved: {:?}", resolved.base);
	assert!(resolved.per_server.is_empty(), "an unset name resolved: {:?}", resolved.per_server);
}

fn values() -> [&'static str; 4] {
	[SPACE_SECRET.1, BOT_SECRET.1, SPACE_SERVER_SECRET.1, BOT_SERVER_SECRET.1]
}

fn holds(haystack: &[u8], needle: &str) -> bool {
	haystack.windows(needle.len()).any(|window| window == needle.as_bytes())
}

fn appended_file(builder: &mut tar::Builder<Vec<u8>>, path: &str, bytes: &[u8]) {
	let mut header = tar::Header::new_gnu();
	header.set_entry_type(tar::EntryType::Regular);
	header.set_size(bytes.len() as u64);
	header.set_mode(0o600);
	builder.append_data(&mut header, path, bytes).expect("the file is written");
}

fn manifest_of(archive: &Path) -> Value {
	let mut read = tar::Archive::new(fs::File::open(archive).expect("the archive opens"));
	let mut entries = read.entries().expect("entries");
	let first = entries.next().expect("a first entry").expect("an entry");
	serde_json::from_reader(first).expect("the manifest is json")
}

fn archived_paths(archive: &Path) -> Vec<String> {
	let mut read = tar::Archive::new(fs::File::open(archive).expect("the archive opens"));
	read.entries()
		.expect("entries")
		.map(|entry| {
			entry.expect("an entry").path().expect("a path").to_string_lossy().into_owned()
		})
		.collect()
}

fn scratch() -> RemovedOnDrop {
	let dir = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-space-bundle-{}", uuid::Uuid::new_v4())),
	);
	fs::create_dir_all(&dir).expect("a scratch dir");
	dir
}

#[test]
fn a_space_travels_to_another_root_whole_and_twice_without_colliding() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);

	let target = Home::new();
	let before = target.call("space_list", json!({})).expect("spaces");
	let seats_before = target.count("SELECT count(*) FROM bot_spaces");
	let first = imported(&target, &archive);
	let first_id = first["id"].as_str().expect("an id").to_owned();

	assert_eq!(first_id, seeded.space_id, "an id free on the target keeps its value");
	assert_eq!(first["name"], json!("Travelling"));
	let listed = target.call("space_list", json!({})).expect("spaces");
	assert_eq!(
		listed.as_array().expect("a list").len(),
		before.as_array().expect("a list").len() + 1
	);
	assert_eq!(listed.as_array().expect("a list").last().expect("a space")["id"], json!(first_id));

	let mut bots: Vec<String> = target
		.bots_of(&first_id)
		.iter()
		.map(|bot| bot["id"].as_str().expect("an id").to_owned())
		.collect();
	bots.sort();
	let mut expected_bots = seeded.bot_ids.clone();
	expected_bots.sort();
	assert_eq!(bots, expected_bots);
	for bot_id in &seeded.bot_ids {
		let history = history_ids(&target.bot_root(), bot_id);
		assert!(!history.is_empty(), "the plugin arrived without its git history");
		for commit in history_ids(&source.bot_root(), bot_id) {
			assert!(history.contains(&commit), "a commit of the source is missing on the target");
		}
	}
	assert_eq!(
		target.count("SELECT count(*) FROM bot_spaces"),
		seats_before + 2,
		"a bot was seated in a space other than the imported one"
	);
	assert!(target.dir.join("spaces").join(&first_id).is_dir(), "the space plugin is missing");
	let first_avatar =
		target.avatar_of(&first_id, &seeded.bot_ids[0]).as_str().expect("an avatar").to_owned();
	let resolved = avatars::readable(&target.avatar_dir(), &first_avatar)
		.expect("the avatar resolves under the target avatars dir");
	assert_eq!(fs::read(resolved).expect("the avatar"), fs::read(&seeded.avatar).expect("source"));
	assert_eq!(target.avatar_of(&first_id, &seeded.bot_ids[1]), Value::Null);

	assert_names_arrived_unset(&target, &first_id, &seeded.bot_ids[0]);

	let topics = target.topics_of(&first_id);
	assert_eq!(topics.len(), 1);
	assert_eq!(topics[0]["id"], json!(seeded.conversation_id));
	let page = target
		.call(
			"conversation_message_page",
			json!({ "conversationId": seeded.conversation_id, "beforeSeq": Value::Null, "limit": 50 }),
		)
		.expect("the page");
	let content = page["messages"][0]["content"].as_str().expect("a content").to_owned();
	let attachment_line = content.lines().last().expect("the attachment line");
	assert!(attachment_line.starts_with(&target.dir.to_string_lossy().into_owned()));
	assert_eq!(fs::read(attachment_line).expect("the attachment on the target"), ATTACHMENT);
	assert_eq!(target.count("SELECT count(*) FROM runtime_sessions"), 0);
	assert_eq!(
		target.count("SELECT count(*) FROM messages WHERE runtime_session_id IS NOT NULL"),
		0
	);

	let second = imported(&target, &archive);
	let second_id = second["id"].as_str().expect("an id").to_owned();
	assert_ne!(second_id, first_id, "the second import reused a taken space id");
	let second_bots: Vec<String> = target
		.bots_of(&second_id)
		.iter()
		.map(|bot| bot["id"].as_str().expect("an id").to_owned())
		.collect();
	assert_eq!(second_bots.len(), 2);
	assert!(second_bots.iter().all(|bot| !seeded.bot_ids.contains(bot)));
	assert_eq!(target.bots_of(&first_id).len(), 2, "the first space lost a bot");
	let second_topics = target.topics_of(&second_id);
	assert_eq!(second_topics.len(), 1);
	let second_conversation = second_topics[0]["id"].as_str().expect("an id").to_owned();
	assert_ne!(second_conversation, seeded.conversation_id);
	assert_eq!(target.topics_of(&first_id).len(), 1);
	for bot_id in &second_bots {
		assert!(!history_ids(&target.bot_root(), bot_id).is_empty());
	}
	let second_avatar = second_bots
		.iter()
		.find_map(|bot| target.avatar_of(&second_id, bot).as_str().map(str::to_owned))
		.expect("the second copy wears an avatar");
	assert_ne!(second_avatar, first_avatar, "the second avatar overwrote the first");
	assert!(avatars::readable(&target.avatar_dir(), &second_avatar).is_some());
	assert!(avatars::readable(&target.avatar_dir(), &first_avatar).is_some());
	let relocated =
		target.dir.join("attachments").join(&second_conversation).join(&seeded.attachment_name);
	assert_eq!(fs::read(relocated).expect("the second copy of the attachment"), ATTACHMENT);
	let reminted_bot = target
		.bots_of(&second_id)
		.into_iter()
		.find(|bot| bot["avatarImagePath"].is_string())
		.expect("the bot that held the secret")["id"]
		.as_str()
		.expect("an id")
		.to_owned();
	assert_names_arrived_unset(&target, &second_id, &reminted_bot);

	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn an_archive_written_before_hues_reads_the_hue_of_each_of_the_eight_names() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);
	let named = rewritten(&archive, &scratch, |path, bytes| match path {
		"rows.json" => {
			let mut rows: Value = serde_json::from_slice(&bytes).expect("rows");
			rows["spaces"][0]["colour"] = json!("purple");
			for bot in rows["bots"].as_array_mut().expect("the bots") {
				bot["avatar_color"] = json!("pink");
			}
			for conversation in rows["conversations"].as_array_mut().expect("the conversations") {
				conversation["color"] = json!("cyan");
			}
			serde_json::to_vec(&rows).expect("json")
		}
		_ => bytes,
	});
	let target = Home::new();

	let space = imported(&target, &named);

	let space_id = space["id"].as_str().expect("an id");
	assert_eq!(space["colour"], json!(296));
	let blots: Vec<Value> =
		target.bots_of(space_id).iter().map(|bot| bot["avatarBlot"].clone()).collect();
	assert_eq!(blots, vec![json!(358); seeded.bot_ids.len()]);
	let topics = target.topics_of(space_id);
	assert!(!topics.is_empty(), "the archive carried no conversation");
	assert!(topics.iter().all(|topic| topic["color"] == json!(186)), "{topics:?}");

	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn an_archive_of_another_version_or_that_fails_midway_leaves_the_target_untouched() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);
	let target = Home::new();
	imported(&target, &archive);
	let files = target.files();
	let counts = target.table_counts();

	let future = rewritten(&archive, &scratch, |path, bytes| match path {
		"manifest.json" => {
			let mut manifest: Value = serde_json::from_slice(&bytes).expect("a manifest");
			manifest["format_version"] = json!(999);
			serde_json::to_vec(&manifest).expect("json")
		}
		_ => bytes,
	});
	let refused = target
		.call("space_import", json!({ "path": future.to_string_lossy() }))
		.expect_err("a future archive is refused");
	assert_eq!(refused, json!({ "kind": "unsupportedArchive", "found": 999, "supported": 2 }));
	assert_eq!(target.files(), files);
	assert_eq!(target.table_counts(), counts);

	let broken = rewritten(&archive, &scratch, |path, bytes| match path {
		"rows.json" => {
			let mut rows: Value = serde_json::from_slice(&bytes).expect("rows");
			rows["messages"][0]["completion_state"] = json!("unheard-of");
			serde_json::to_vec(&rows).expect("json")
		}
		_ => bytes,
	});
	let broken_error = target
		.call("space_import", json!({ "path": broken.to_string_lossy() }))
		.expect_err("an archive whose rows break a constraint is refused");
	assert_eq!(broken_error["kind"], json!("storage"), "the import failed before its files landed");
	assert_eq!(target.files(), files);
	assert_eq!(target.table_counts(), counts);

	let _ = fs::remove_dir_all(scratch);
}

#[cfg(unix)]
#[test]
fn an_archive_declaring_open_modes_lands_owner_only() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);
	let open = remodeled(&archive, &scratch, 0o666);
	let target = Home::new();

	let space_id = imported(&target, &open)["id"].as_str().expect("an id").to_owned();

	assert_owner_only_under(&target.env_root());
	assert_owner_only_under(&target.bot_root());
	assert_names_arrived_unset(&target, &space_id, &seeded.bot_ids[0]);

	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn an_archive_holding_a_link_is_refused_before_anything_lands() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);
	let linked = extended(&archive, &scratch, |builder| {
		let mut header = tar::Header::new_gnu();
		header.set_entry_type(tar::EntryType::Symlink);
		header.set_size(0);
		header.set_mode(0o777);
		builder
			.append_link(&mut header, format!("bots/{}/escape", seeded.bot_ids[0]), "/etc/passwd")
			.expect("the link is written");
	});
	let target = Home::new();
	let files = target.files();
	let counts = target.table_counts();

	let refused = target
		.call("space_import", json!({ "path": linked.to_string_lossy() }))
		.expect_err("an archive holding a link is refused");

	assert_eq!(
		refused,
		json!({ "kind": "unreadableArchive", "detail": "the archive holds a link or a device" })
	);
	assert_eq!(target.files(), files);
	assert_eq!(target.table_counts(), counts);
	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn an_archive_holding_a_path_outside_its_layout_is_refused() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);
	let foreign = extended(&archive, &scratch, |builder| {
		let token = b"a token the layout does not know";
		let mut header = tar::Header::new_gnu();
		header.set_entry_type(tar::EntryType::Regular);
		header.set_size(token.len() as u64);
		header.set_mode(0o600);
		builder
			.append_data(&mut header, "secrets/token", &token[..])
			.expect("the entry is written");
	});
	let target = Home::new();
	let files = target.files();
	let counts = target.table_counts();

	let refused = target
		.call("space_import", json!({ "path": foreign.to_string_lossy() }))
		.expect_err("an archive holding a foreign path is refused");

	assert_eq!(
		refused,
		json!({ "kind": "unreadableArchive", "detail": "the archive holds a path outside its layout" })
	);
	assert_eq!(target.files(), files);
	assert_eq!(target.table_counts(), counts);
	let _ = fs::remove_dir_all(scratch);
}

#[cfg(unix)]
#[test]
fn an_export_that_fails_midway_leaves_no_file_behind() {
	use std::os::unix::fs::PermissionsExt;

	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let unreadable = bundles::dir(&source.bot_root(), &seeded.bot_ids[0])
		.expect("the bundle is held")
		.join("sealed.md");
	fs::write(&unreadable, "no one reads this").expect("written");
	fs::set_permissions(&unreadable, fs::Permissions::from_mode(0o000)).expect("sealed");
	let archive = scratch.join("broken.kiroshi");

	let refused = source
		.call("space_export", json!({ "id": seeded.space_id, "path": archive.to_string_lossy() }))
		.expect_err("an unreadable file fails the export");

	assert_eq!(refused["kind"], json!("unwritableArchive"));
	assert_eq!(fs::read_dir(&scratch).expect("the scratch dir").count(), 0);
	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn exporting_a_space_that_does_not_exist_writes_nothing() {
	let home = Home::new();
	let scratch = scratch();
	let archive = scratch.join("missing.kiroshi");

	let refused = home
		.call("space_export", json!({ "id": "missing", "path": archive.to_string_lossy() }))
		.expect_err("an unknown space is refused");

	assert_eq!(refused, json!({ "kind": "unknownSpace", "id": "missing" }));
	assert!(!archive.exists());
	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn an_export_carries_the_names_of_its_secrets_and_never_their_values() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();

	let archive = exported(&source, &seeded.space_id, &scratch);

	let bytes = fs::read(&archive).expect("the archive reads");
	for value in values() {
		assert!(!holds(&bytes, value), "the archive carries the value {value}");
	}
	assert!(archived_paths(&archive).iter().all(|path| !path.starts_with("env")));
	let manifest = manifest_of(&archive);
	assert_eq!(manifest["format_version"], json!(2));
	let quiet_bot = &seeded.bot_ids[1];
	assert_eq!(
		manifest["env"],
		json!({
			"space": { "names": [SPACE_SECRET.0], "servers": { SERVER: [SPACE_SERVER_SECRET.0] } },
			"bots": {
				seeded.bot_ids[0].clone(): {
					"names": [BOT_SECRET.0],
					"servers": { SERVER: [BOT_SERVER_SECRET.0] }
				},
				quiet_bot.clone(): { "names": [], "servers": {} }
			}
		})
	);
	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn an_imported_name_is_listed_unset_until_a_value_is_written_for_it() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let archive = exported(&source, &seeded.space_id, &scratch);
	let target = Home::new();

	let space_id = imported(&target, &archive)["id"].as_str().expect("an id").to_owned();
	let bot_id = seeded.bot_ids[0].clone();
	assert_names_arrived_unset(&target, &space_id, &bot_id);

	target
		.call(
			"env_set",
			json!({ "scope": bot_scope(&space_id, &bot_id), "name": BOT_SECRET.0, "value": "typed" }),
		)
		.expect("the value is written");
	assert_eq!(
		target.env_entries(bot_scope(&space_id, &bot_id)),
		vec![(BOT_SECRET.0.to_owned(), false), (SPACE_SECRET.0.to_owned(), true)]
	);
	let resolved = store::resolve(
		&target.env_root(),
		&EnvOwner::Bot { id: bot_id.clone(), space_id: space_id.clone() },
	)
	.expect("the bot env");
	assert_eq!(resolved.base, BTreeMap::from([(BOT_SECRET.0.to_owned(), "typed".to_owned())]));

	target
		.call("env_delete", json!({ "scope": space_scope(&space_id), "name": SPACE_SECRET.0 }))
		.expect("the declared name is dropped");
	assert_eq!(target.env_entries(space_scope(&space_id)), Vec::new());
	let _ = fs::remove_dir_all(scratch);
}

#[test]
fn a_version_1_archive_lands_the_names_of_its_env_files_and_none_of_their_values() {
	let source = Home::new();
	let seeded = seeded(&source);
	let scratch = scratch();
	let bot_id = seeded.bot_ids[0].clone();
	let current = exported(&source, &seeded.space_id, &scratch);
	let version_1 = rewritten(&current, &scratch, |path, bytes| match path {
		"manifest.json" => {
			serde_json::to_vec(&json!({ "format_version": 1, "space_id": seeded.space_id }))
				.expect("json")
		}
		_ => bytes,
	});
	let env_file = |name: &str, value: &str| format!("{name}=\"{value}\"\n").into_bytes();
	let carried = [
		("env/space/.env".to_owned(), env_file(SPACE_SECRET.0, SPACE_SECRET.1)),
		(
			format!("env/space-servers/{SERVER}/.env"),
			env_file(SPACE_SERVER_SECRET.0, SPACE_SERVER_SECRET.1),
		),
		(format!("env/bots/{bot_id}/.env"), env_file(BOT_SECRET.0, BOT_SECRET.1)),
		(
			format!("env/bot-servers/{bot_id}/{SERVER}/.env"),
			env_file(BOT_SERVER_SECRET.0, BOT_SERVER_SECRET.1),
		),
	];
	let target = Home::new();
	let current_with_files = extended(&current, &scratch, |builder| {
		let (path, bytes) = &carried[0];
		appended_file(builder, path, bytes);
	});
	assert_eq!(
		target
			.call("space_import", json!({ "path": current_with_files.to_string_lossy() }))
			.expect_err("a version 2 archive carrying an env file is refused"),
		json!({ "kind": "unreadableArchive", "detail": "the archive holds a path outside its layout" })
	);

	let version_1 = extended(&version_1, &scratch, |builder| {
		for (path, bytes) in &carried {
			appended_file(builder, path, bytes);
		}
	});

	let space_id = imported(&target, &version_1)["id"].as_str().expect("an id").to_owned();

	assert_names_arrived_unset(&target, &space_id, &bot_id);
	for (path, bytes) in target.files() {
		for value in values() {
			assert!(!holds(&bytes, value), "{} holds the value {value}", path.display());
		}
	}
	let _ = fs::remove_dir_all(scratch);
}
