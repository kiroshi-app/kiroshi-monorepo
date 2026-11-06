use std::fs::File;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, SystemTime};

use image::{DynamicImage, ImageFormat, Rgb, RgbImage};

use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener as _};
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Doc, GetString, IndexedSequence, Map, ReadTxn, Text, Transact, Update};

use super::*;
use crate::agent::contract::CancelOutcome;
use crate::agent::AgentState;
use crate::conversations::contract::TranscriptMessage;
use crate::db::repositories::messages::{AccountAuthor, MessagePageQuery};
use crate::library::commands::library_stop_writers;
use crate::library::contract::{
	LibraryBoardPoint, LibraryChanged, LibraryDocumentPresence, LibraryDocumentRenamed,
	LibraryOverwritten, LibraryPresenceAt, LibraryWriter, LibraryWriterKind,
};
use crate::library::presence::{hue_of, share_presence, Identity, Presences, AGENT_BOARD_LEASE};
use crate::library::{apply_update, open_document, read_thumbnail};
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const A_CONVERSATION: &str = "
	INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Bean', 'sonnet', 1);
	INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
	INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
		VALUES ('c1', 'topic', 'personal', 'Notes', 1, 1);
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('c1', 'b1', 'assistant', 1, 0);
	INSERT INTO spaces (id, name, colour, position, created_at) VALUES ('work', 'Work', 257, 1, 1);
";

const SPACE: &str = "personal";

const PERSON_CLIENT: u64 = 7;

async fn a_host(name: &str) -> (AppOfItsOwn, PathBuf) {
	a_host_built(name, mock_builder()).await
}

async fn a_host_built(name: &str, builder: tauri::Builder<MockRuntime>) -> (AppOfItsOwn, PathBuf) {
	let app = an_app_of_its_own(&format!("library-host-{name}"), builder);
	app.manage(db::bootstrap(app.handle()));
	ready(&app.state::<db::DatabaseState>())
		.expect("the database opens")
		.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
		.await
		.expect("the conversation is planted");
	let root = root(app.handle()).expect("the library resolves");
	(app, root)
}

fn put(root: &Path, space_id: &str, name: &str, text: &str) {
	let dir = root.join(space_id);
	std::fs::create_dir_all(&dir).expect("the space folder lands");
	std::fs::write(dir.join(name), text).expect("the document lands");
}

fn on_disk(root: &Path, name: &str) -> String {
	std::fs::read_to_string(root.join(SPACE).join(name)).expect("the document reads")
}

fn the_host(app: &App<MockRuntime>) -> LibraryHost<MockRuntime> {
	the_host_of(app, "b1")
}

fn the_host_of(app: &App<MockRuntime>, bot_id: &str) -> LibraryHost<MockRuntime> {
	let scope = RuntimeScope {
		conversation_id: "c1".to_owned(),
		bot_id: bot_id.to_owned(),
		runtime_session_id: format!("r-{bot_id}"),
		epoch: 0,
	};
	LibraryHost::new(app.handle().clone(), scope)
}

fn heard<P: DeserializeOwned + Send + 'static>(
	app: &App<MockRuntime>,
	event: &'static str,
) -> Receiver<P> {
	let (told, heard) = channel();
	app.listen_any(event, move |event| {
		let payload = serde_json::from_str(event.payload()).expect("a payload of the event");
		told.send(payload).expect("the test listens");
	});
	heard
}

fn all_of<P>(heard: &Receiver<P>) -> Vec<P> {
	heard.try_iter().collect()
}

fn refusal_kind(answer: Result<Value, DocumentRefusal>) -> Value {
	refusal_of(answer)["kind"].clone()
}

fn refusal_of(answer: Result<Value, DocumentRefusal>) -> Value {
	serde_json::to_value(answer.expect_err("the call is refused")).expect("the refusal serializes")
}

fn caret_of_a_member(app: &App<MockRuntime>, name: &str) -> LibraryPresenceAt {
	let state = open_document(app.handle(), &root(app.handle()).expect("root"), SPACE, name)
		.expect("the document opens")
		.update;
	let doc = Doc::new();
	let update = BASE64_STANDARD.decode(state).expect("base64");
	doc.transact_mut().apply_update(Update::decode_v1(&update).expect("yjs")).expect("applies");
	let text = doc.get_or_insert_text("markdown");
	let caret = text.sticky_index(&doc.transact(), 0, yrs::Assoc::After).expect("a caret");
	LibraryPresenceAt::Text { anchor: BASE64_STANDARD.encode(caret.encode_v1()) }
}

async fn tree_of(host: &LibraryHost<MockRuntime>, name: &str) -> Vec<Value> {
	let tree = host.served(Operation::DocumentTree, json!({ "name": name })).await.expect("reads");
	tree["blocks"].as_array().expect("the tree lists its blocks").clone()
}

async fn ids_of(host: &LibraryHost<MockRuntime>, name: &str) -> Vec<String> {
	tree_of(host, name)
		.await
		.iter()
		.map(|block| block["id"].as_str().expect("a block id").to_owned())
		.collect()
}

fn ids_in(answer: &Value) -> Vec<String> {
	answer["ids"]
		.as_array()
		.expect("the answer lists ids")
		.iter()
		.map(|id| id.as_str().expect("an id").to_owned())
		.collect()
}

fn sources_on_disk(root: &Path, name: &str) -> Vec<String> {
	let text = on_disk(root, name);
	blocks_of(&text).into_iter().map(|block| text[block.content].to_owned()).collect()
}

fn ana() -> Identity {
	Identity { name: Some("Ana".to_owned()), hue: Some(hue_of("u2")) }
}

fn named(writers: &[LibraryWriter]) -> Vec<(LibraryWriterKind, Option<&str>)> {
	writers.iter().map(|writer| (writer.kind, writer.name.as_deref())).collect()
}

#[tokio::test]
async fn an_agent_and_a_member_are_published_with_their_names_then_the_agent_finishes() {
	let (app, root) = a_host("presence").await;
	put(&root, SPACE, "notes.md", "Notes.");
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let finishes = heard::<LibraryDocumentWriterFinished>(
		&app,
		events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(),
	);
	let caret = caret_of_a_member(&app, "notes.md");
	share_presence(
		app.handle(),
		&root,
		SPACE,
		"notes.md",
		Seat::Member("u2".to_owned()),
		ana(),
		caret,
	)
	.expect("the member caret is published");

	let host = the_host(&app);
	let notes = ids_of(&host, "notes.md").await;
	let written = host
		.served(
			Operation::DocumentInsertAfter,
			json!({ "name": "notes.md", "after": notes[0], "markdown": "Bean wrote this." }),
		)
		.await
		.expect("the agent writes");

	let published = all_of(&presences);
	let both = published
		.iter()
		.find(|presence| presence.writers.len() == 2)
		.expect("both writers stood in the document at once");
	assert_eq!(
		named(&both.writers),
		[(LibraryWriterKind::Member, Some("Ana")), (LibraryWriterKind::Agent, Some("Bean"))]
	);
	assert_eq!((both.space_id.as_str(), both.name.as_str()), (SPACE, "notes.md"));
	assert_eq!(
		all_of(&finishes),
		[LibraryDocumentWriterFinished {
			space_id: SPACE.to_owned(),
			name: "notes.md".to_owned(),
			agent_id: "b1".to_owned(),
			agent_name: "Bean".to_owned(),
			outcome: LibraryWriteOutcome::Finished,
		}]
	);
	let last = published.last().expect("a presence was published");
	assert_eq!(named(&last.writers), [(LibraryWriterKind::Member, Some("Ana"))]);
	let bean = &ids_in(&written)[0];
	assert_eq!(
		on_disk(&root, "notes.md"),
		format!("Notes. ^{}\n\nBean wrote this. ^{bean}", notes[0])
	);
}

#[tokio::test]
async fn a_write_lands_in_more_than_one_update_with_the_caret_after_what_it_wrote() {
	let (app, root) = a_host("steps").await;
	put(&root, SPACE, "notes.md", "# Title\n\nEnd.");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());

	let host = the_host(&app);
	let held = ids_of(&host, "notes.md").await;
	let written = host
		.served(
			Operation::DocumentInsertAfter,
			json!({ "name": "notes.md", "after": held[0], "markdown": "A paragraph." }),
		)
		.await
		.expect("the agent writes");

	let new = &ids_in(&written)[0];
	let up_to_the_new_block = format!("# Title ^{}\n\nA paragraph. ^{new}", held[0]);
	assert_eq!(on_disk(&root, "notes.md"), format!("{up_to_the_new_block}\n\nEnd. ^{}", held[1]));
	assert!(all_of(&updates).len() > 1);
	let carets: Vec<String> = all_of(&presences)
		.into_iter()
		.filter_map(|presence| presence.writers.into_iter().next())
		.filter_map(|writer| match writer.at {
			LibraryPresenceAt::Text { anchor } => Some(anchor),
			LibraryPresenceAt::Board { .. } => None,
		})
		.collect();
	let held = Doc::new();
	let state = std::fs::read(root.join(".documents").join(SPACE).join("notes.md.yjs"))
		.expect("the shared state is stored");
	held.transact_mut().apply_update(Update::decode_v1(&state).expect("yjs")).expect("applies");
	let last = carets.last().expect("the agent caret was published");
	let caret = yrs::StickyIndex::decode_v1(&BASE64_STANDARD.decode(last).expect("base64"))
		.expect("a relative position");
	let at = caret.get_offset(&held.transact()).expect("the caret resolves").index;
	assert_eq!(at as usize, up_to_the_new_block.len());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_write_interleaved_with_a_person_keeps_every_character_of_both() {
	let (app, root) = a_host("interleaved").await;
	put(&root, SPACE, "notes.md", "Base.");
	let agent_text: String = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(3);
	let host = the_host(&app);
	let base = ids_of(&host, "notes.md").await.remove(0);
	let asked = json!({ "name": "notes.md", "after": base, "markdown": agent_text });
	let writing =
		tokio::spawn(async move { host.served(Operation::DocumentInsertAfter, asked).await });
	let person = Doc::with_client_id(PERSON_CLIENT);
	let mut typed = 0;
	while !writing.is_finished() {
		tokio::time::sleep(Duration::from_millis(15)).await;
		typed += 1;
		person_typed_at_the_start(&app, &root, &person);
	}
	let written = writing.await.expect("the write ends").expect("the agent writes");
	person_typed_at_the_start(&app, &root, &person);
	typed += 1;

	let text = on_disk(&root, "notes.md");
	let new = &ids_in(&written)[0];
	let expected = format!("Base. ^{base}\n\n{agent_text} ^{new}");
	assert!(typed > 2, "the person typed only {typed} times");
	assert_eq!(text.matches('#').count(), typed, "{text}");
	assert_eq!(text.len(), expected.len() + typed, "{text}");
	let without_the_person: String = text.chars().filter(|char| *char != '#').collect();
	assert_eq!(without_the_person, expected);
}

fn person_typed_at_the_start(app: &App<MockRuntime>, root: &Path, person: &Doc) {
	person_typed(app, root, person, |_| 0);
}

fn person_typed_at_the_end(app: &App<MockRuntime>, root: &Path, person: &Doc) {
	person_typed(app, root, person, str::len);
}

fn person_typed(app: &App<MockRuntime>, root: &Path, person: &Doc, at: fn(&str) -> usize) {
	let state = open_document(app.handle(), root, SPACE, "notes.md").expect("opens").update;
	let update = BASE64_STANDARD.decode(state).expect("base64");
	person.transact_mut().apply_update(Update::decode_v1(&update).expect("yjs")).expect("applies");
	let before = person.transact().state_vector();
	let text = person.get_or_insert_text("markdown");
	let mut txn = person.transact_mut();
	let index = at(&text.get_string(&txn)) as u32;
	text.insert(&mut txn, index, "#");
	drop(txn);
	let typed = person.transact().encode_state_as_update_v1(&before);
	apply_update(app.handle(), root, SPACE, "notes.md", &BASE64_STANDARD.encode(typed))
		.expect("the person update merges");
}

#[tokio::test]
async fn a_block_id_absent_from_the_document_is_refused_by_name_and_writes_nothing() {
	let (app, root) = a_host("absent").await;
	put(&root, SPACE, "notes.md", "# Plan\n\nBody.");
	open_document(app.handle(), &root, SPACE, "notes.md").expect("opens");
	let published = heard_in_order(&app);
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let host = the_host(&app);
	let absent = json!({
		"kind": "blockNotFound",
		"id": "zzzzzz",
		"detail": "no block of this document holds this id: call document_tree for the ids it holds",
	});

	for (operation, asked) in [
		(Operation::DocumentReadBlock, json!({ "name": "notes.md", "id": "zzzzzz" })),
		(
			Operation::DocumentInsertAfter,
			json!({ "name": "notes.md", "after": "zzzzzz", "markdown": "New." }),
		),
		(
			Operation::DocumentReplaceBlock,
			json!({ "name": "notes.md", "id": "zzzzzz", "markdown": "New." }),
		),
		(Operation::DocumentDeleteBlock, json!({ "name": "notes.md", "ids": ["zzzzzz"] })),
	] {
		assert_eq!(refusal_of(host.served(operation, asked).await), absent);
	}

	assert_eq!(on_disk(&root, "notes.md"), "# Plan\n\nBody.");
	assert_eq!(all_of(&published), []);
	assert_eq!(all_of(&updates), Vec::<Value>::new());
}

#[tokio::test]
async fn a_delete_naming_one_absent_id_among_present_ones_removes_nothing() {
	let (app, root) = a_host("absent-among").await;
	put(&root, SPACE, "notes.md", "One.\n\nTwo.");
	let host = the_host(&app);
	let held = ids_of(&host, "notes.md").await;
	let before = on_disk(&root, "notes.md");

	let refused = host
		.served(
			Operation::DocumentDeleteBlock,
			json!({ "name": "notes.md", "ids": [held[0], "zzzzzz"] }),
		)
		.await;

	assert_eq!(refusal_of(refused)["id"], "zzzzzz");
	assert_eq!(on_disk(&root, "notes.md"), before);
}

#[tokio::test]
async fn a_read_gives_the_blocks_without_an_id_new_ids_once_and_keeps_the_ids_already_there() {
	let (app, root) = a_host("backfill").await;
	put(&root, SPACE, "notes.md", "# Plan ^aaaaaa\n\nBody.\n\n- one\n- two");
	let editor = an_open_editor(&app, &root, "notes.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let host = the_host(&app);

	let first = ids_of(&host, "notes.md").await;
	let filled = on_disk(&root, "notes.md");
	let seen_by_the_editor = caught_up(&editor, &updates);
	let again = ids_of(&host, "notes.md").await;

	assert_eq!(first[0], "aaaaaa");
	assert_eq!(first.len(), 3);
	assert_eq!(
		filled,
		format!("# Plan ^aaaaaa\n\nBody. ^{}\n\n- one\n- two\n\n^{}", first[1], first[2])
	);
	assert_eq!(seen_by_the_editor, filled);
	assert_eq!(again, first);
	assert_eq!(on_disk(&root, "notes.md"), filled);
	assert_eq!(all_of(&updates), Vec::<Value>::new());
}

#[tokio::test]
async fn the_info_answers_the_name_the_update_time_the_block_count_and_the_first_heading() {
	let (app, root) = a_host("info").await;
	put(&root, SPACE, "notes.md", "Intro.\n\n## Plan\n\n# Later");
	let host = the_host(&app);

	let info =
		host.served(Operation::DocumentInfo, json!({ "name": "notes.md" })).await.expect("info");
	let held = ids_of(&host, "notes.md").await;
	let listed = host.served(Operation::List, json!({})).await.expect("lists");

	assert_eq!(info["name"], "notes.md");
	assert_eq!(info["blocks"], 3);
	assert_eq!(info["firstHeading"], held[1].as_str());
	assert_eq!(info["updatedAt"], listed["items"][0]["updatedAt"]);
}

#[tokio::test]
async fn the_tree_answers_each_block_in_order_with_its_kind_its_level_and_its_first_words() {
	let (app, root) = a_host("tree").await;
	let long = "word ".repeat(40);
	put(
		&root,
		SPACE,
		"notes.md",
		&format!("## Launch plan\n\n{long}\n\n- [ ] ship\n\n```\ncode\n```\n\n---"),
	);
	let host = the_host(&app);

	let tree = tree_of(&host, "notes.md").await;

	let shown: Vec<(&str, Option<u64>, &str)> = tree
		.iter()
		.map(|block| {
			(
				block["kind"].as_str().expect("a kind"),
				block["level"].as_u64(),
				block["text"].as_str().expect("words"),
			)
		})
		.collect();
	assert_eq!(shown[0], ("heading", Some(2), "Launch plan"));
	assert_eq!(shown[1].0, "paragraph");
	assert!(shown[1].2.ends_with('…') && shown[1].2.chars().count() <= 61, "{}", shown[1].2);
	assert_eq!(shown[2], ("checklist", None, "ship"));
	assert_eq!(shown[3], ("code", None, "code"));
	assert_eq!(shown[4], ("rule", None, ""));
	assert!(tree.iter().all(|block| block["id"].as_str().is_some_and(|id| id.len() == 6)));
}

#[tokio::test]
async fn a_block_reads_out_as_its_markdown_without_its_id_marker() {
	let (app, root) = a_host("read-block").await;
	put(&root, SPACE, "notes.md", "# Plan\n\n- one\n- two");
	let host = the_host(&app);
	let held = ids_of(&host, "notes.md").await;

	let heading = host
		.served(Operation::DocumentReadBlock, json!({ "name": "notes.md", "id": held[0] }))
		.await
		.expect("reads");
	let list = host
		.served(Operation::DocumentReadBlock, json!({ "name": "notes.md", "id": held[1] }))
		.await
		.expect("reads");

	assert_eq!(
		heading,
		json!({ "name": "notes.md", "id": held[0], "kind": "heading", "markdown": "# Plan" })
	);
	assert_eq!(list["markdown"], "- one\n- two");
	assert_eq!(list["kind"], "list");
}

#[tokio::test]
async fn a_find_answers_each_block_holding_the_text_whatever_its_case_with_the_line_that_holds_it()
{
	let (app, root) = a_host("find").await;
	put(&root, SPACE, "notes.md", "# Launch\n\nNothing here.\n\n- first\n- the LAUNCH date");
	let host = the_host(&app);
	let held = ids_of(&host, "notes.md").await;

	let found = host
		.served(Operation::DocumentFind, json!({ "name": "notes.md", "text": "launch" }))
		.await
		.expect("finds");

	assert_eq!(
		found["matches"],
		json!([
			{ "id": held[0], "kind": "heading", "line": "# Launch" },
			{ "id": held[2], "kind": "list", "line": "- the LAUNCH date" },
		])
	);
}

#[tokio::test]
async fn an_insert_at_the_start_lands_before_the_first_block_and_answers_each_new_id() {
	let (app, root) = a_host("insert-start").await;
	put(&root, SPACE, "notes.md", "Body.");
	let host = the_host(&app);

	let written = host
		.served(
			Operation::DocumentInsertAfter,
			json!({ "name": "notes.md", "markdown": "# Title ^forged\n\nLead. ^abcdef" }),
		)
		.await
		.expect("inserts");

	let new = ids_in(&written);
	let held = ids_of(&host, "notes.md").await;
	assert_eq!(new.len(), 2);
	assert_eq!(held[..2], new[..]);
	assert!(!new.contains(&"abcdef".to_owned()) && !new.contains(&"forged".to_owned()));
	assert_eq!(sources_on_disk(&root, "notes.md"), ["# Title", "Lead.", "Body."]);
}

const FRONT_MATTER: &str = "---\ntitle: Launch ^abcdef\n---";

#[tokio::test]
async fn front_matter_is_no_block_of_the_tree_the_info_or_a_find_and_keeps_no_marker() {
	let (app, root) = a_host("front-matter").await;
	put(&root, SPACE, "notes.md", &format!("{FRONT_MATTER}\n\nLaunch day."));
	let host = the_host(&app);

	let held = ids_of(&host, "notes.md").await;
	let info =
		host.served(Operation::DocumentInfo, json!({ "name": "notes.md" })).await.expect("info");
	let found = host
		.served(Operation::DocumentFind, json!({ "name": "notes.md", "text": "launch" }))
		.await
		.expect("finds");
	let refused = host
		.served(Operation::DocumentReadBlock, json!({ "name": "notes.md", "id": "abcdef" }))
		.await;

	assert_eq!(held.len(), 1);
	assert_eq!(info["blocks"], 1);
	assert_eq!(info["firstHeading"], Value::Null);
	assert_eq!(
		found["matches"],
		json!([{ "id": held[0], "kind": "paragraph", "line": "Launch day." }])
	);
	assert_eq!(refusal_kind(refused), "blockNotFound");
	assert_eq!(on_disk(&root, "notes.md"), format!("{FRONT_MATTER}\n\nLaunch day. ^{}", held[0]));
}

#[tokio::test]
async fn an_insert_at_the_start_lands_after_the_front_matter() {
	let (app, root) = a_host("front-matter-start").await;
	let host = the_host(&app);
	for (name, body) in [("blocks.md", "\n\nBody."), ("empty.md", "")] {
		put(&root, SPACE, name, &format!("{FRONT_MATTER}{body}"));

		host.served(Operation::DocumentInsertAfter, json!({ "name": name, "markdown": "# Title" }))
			.await
			.expect("inserts");

		let text = on_disk(&root, name);
		assert!(text.starts_with(&format!("{FRONT_MATTER}\n\n# Title ^")), "{text}");
	}
}

#[tokio::test]
async fn a_find_of_empty_or_blank_text_is_refused_and_writes_nothing() {
	let (app, root) = a_host("empty-find").await;
	put(&root, SPACE, "notes.md", "Body.");
	let host = the_host(&app);

	for text in ["", "  \n\t"] {
		let refused =
			host.served(Operation::DocumentFind, json!({ "name": "notes.md", "text": text })).await;
		assert_eq!(refusal_kind(refused), "unreadableRequest");
	}
	assert_eq!(on_disk(&root, "notes.md"), "Body.");
}

#[tokio::test]
async fn markdown_holding_no_block_is_refused_and_writes_nothing() {
	let (app, root) = a_host("no-block").await;
	put(&root, SPACE, "notes.md", "Body. ^aaaaaa");
	let host = the_host(&app);

	let refused = host
		.served(
			Operation::DocumentReplaceBlock,
			json!({ "name": "notes.md", "id": "aaaaaa", "markdown": "\n^bbbbbb\n" }),
		)
		.await;

	assert_eq!(refusal_of(refused), json!({ "kind": "noBlock" }));
	assert_eq!(on_disk(&root, "notes.md"), "Body. ^aaaaaa");
}

#[tokio::test]
async fn every_id_a_call_does_not_delete_stays_the_same() {
	let (app, root) = a_host("stable").await;
	put(&root, SPACE, "notes.md", "# Plan\n\nOne.\n\nTwo.\n\nThree.");
	let host = the_host(&app);
	let held = ids_of(&host, "notes.md").await;
	let call = |operation: Operation, asked: Value| host.served(operation, asked);

	let inserted = call(
		Operation::DocumentInsertAfter,
		json!({ "name": "notes.md", "after": held[1], "markdown": "Between." }),
	)
	.await
	.expect("inserts");
	let replaced = call(
		Operation::DocumentReplaceBlock,
		json!({ "name": "notes.md", "id": held[2], "markdown": "Two again.\n\n- and a list" }),
	)
	.await
	.expect("replaces");
	call(Operation::DocumentDeleteBlock, json!({ "name": "notes.md", "ids": [held[3]] }))
		.await
		.expect("deletes");

	let now = ids_of(&host, "notes.md").await;
	let (between, list) = (ids_in(&inserted)[0].clone(), ids_in(&replaced)[1].clone());
	assert_eq!(now, [held[0].clone(), held[1].clone(), between, held[2].clone(), list]);
	assert_eq!(ids_in(&replaced)[0], held[2]);
	assert_eq!(
		sources_on_disk(&root, "notes.md"),
		["# Plan", "One.", "Between.", "Two again.", "- and a list"]
	);
}

#[tokio::test]
async fn every_tool_stays_in_the_space_of_the_conversation_and_writes_only_markdown() {
	let (app, root) = a_host("scope").await;
	let published = heard_in_order(&app);
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	put(&root, SPACE, "plain.txt", "plain");
	put(&root, "work", "elsewhere.md", "not yours");
	let host = the_host(&app);
	let named = |operation: Operation, name: &str| host.served(operation, json!({ "name": name }));
	let write = |name: &str| host.served(Operation::DocumentTree, json!({ "name": name }));
	let rename = |name: &str, new_name: &str| {
		host.served(Operation::Rename, json!({ "name": name, "newName": new_name }))
	};

	for operation in [Operation::Read, Operation::Delete, Operation::Create] {
		assert_eq!(refusal_kind(named(operation, "../work/elsewhere.md").await), "invalidName");
	}
	assert_eq!(refusal_kind(named(Operation::Read, "elsewhere.md").await), "missing");
	assert_eq!(refusal_kind(named(Operation::Delete, "elsewhere.md").await), "missing");
	assert_eq!(refusal_kind(write("elsewhere.md").await), "missing");
	assert_eq!(refusal_kind(write("../work/elsewhere.md").await), "invalidName");
	assert_eq!(refusal_kind(write("plain.txt").await), "notADocument");
	assert_eq!(refusal_kind(rename("elsewhere.md", "mine.md").await), "missing");
	assert_eq!(refusal_kind(rename("plain.txt", "../work/plain.txt").await), "invalidName");
	assert_eq!(std::fs::read_to_string(root.join("work/elsewhere.md")).expect("kept"), "not yours");
	assert_eq!(on_disk(&root, "plain.txt"), "plain");
	assert!(!root.join("work/plain.txt").exists());
	assert_eq!(all_of(&published), []);
	assert_eq!(all_of(&changes), []);
}

fn png_of(edge: u32) -> Vec<u8> {
	let mut png = Vec::new();
	DynamicImage::ImageRgb8(RgbImage::from_pixel(edge, edge, Rgb([200, 40, 40])))
		.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
		.expect("the image encodes");
	png
}

fn put_bytes(root: &Path, name: &str, bytes: &[u8]) {
	let dir = root.join(SPACE);
	std::fs::create_dir_all(&dir).expect("the space folder lands");
	std::fs::write(dir.join(name), bytes).expect("the file lands");
}

fn modified_at(root: &Path, name: &str, seconds: u64) {
	File::options()
		.write(true)
		.open(root.join(SPACE).join(name))
		.expect("the file opens")
		.set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(seconds))
		.expect("the modified time lands");
}

fn thumbnails(root: &Path) -> usize {
	std::fs::read_dir(root.join(SPACE).join(".thumbnails")).map_or(0, |found| found.count())
}

fn state_file(root: &Path, name: &str) -> PathBuf {
	root.join(".documents").join(SPACE).join(format!("{name}.yjs"))
}

fn names_in(answer: &Value) -> Vec<&str> {
	answer["items"]
		.as_array()
		.expect("a list of items")
		.iter()
		.map(|item| item["name"].as_str().expect("a name"))
		.collect()
}

#[tokio::test]
async fn a_list_runs_newest_first_by_kind_and_pages_on_its_cursor() {
	let (app, root) = a_host("list").await;
	put(&root, SPACE, "a.md", "A");
	put(&root, SPACE, "b.md", "B");
	put_bytes(&root, "c.png", &png_of(4));
	put(&root, "work", "elsewhere.md", "not yours");
	modified_at(&root, "a.md", 300);
	modified_at(&root, "b.md", 100);
	modified_at(&root, "c.png", 200);
	let host = the_host(&app);
	let list = |asked: Value| host.served(Operation::List, asked);

	let first = list(json!({ "limit": 2 })).await.expect("lists");
	let rest = list(json!({ "limit": 2, "cursor": first["cursor"] })).await.expect("lists");
	let documents = list(json!({ "kind": "document" })).await.expect("lists");

	assert_eq!(names_in(&first), ["a.md", "c.png"]);
	assert_eq!(
		first["items"][1],
		json!({ "name": "c.png", "kind": "image", "updatedAt": 200_000 })
	);
	assert_eq!(names_in(&rest), ["b.md"]);
	assert_eq!(rest["cursor"], Value::Null);
	assert_eq!(names_in(&documents), ["a.md", "b.md"]);
	assert_eq!(refusal_kind(list(json!({ "limit": 0 })).await), "limitOutOfRange");
	assert_eq!(refusal_kind(list(json!({ "cursor": "not a cursor" })).await), "unreadableCursor");
	assert_eq!(refusal_kind(list(json!({ "kind": "song" })).await), "unreadableRequest");
}

#[tokio::test]
async fn a_list_by_the_board_kind_answers_only_the_canvas_items_of_the_space() {
	let (app, root) = a_host("list-boards").await;
	put(&root, SPACE, "notes.md", "A");
	put_bytes(&root, "cover.png", &png_of(4));
	put(&root, SPACE, "plan.canvas", r#"{"nodes":[],"edges":[]}"#);
	put(&root, SPACE, "broken.canvas", "{ not json");
	put(&root, "work", "elsewhere.canvas", r#"{"nodes":[],"edges":[]}"#);
	modified_at(&root, "plan.canvas", 200);
	modified_at(&root, "broken.canvas", 100);

	let boards =
		the_host(&app).served(Operation::List, json!({ "kind": "board" })).await.expect("lists");

	assert_eq!(names_in(&boards), ["plan.canvas", "broken.canvas"]);
	assert_eq!(
		boards["items"][0],
		json!({ "name": "plan.canvas", "kind": "board", "updatedAt": 200_000 })
	);
}

#[tokio::test]
async fn a_search_matches_a_name_or_a_document_text_whatever_its_case() {
	let (app, root) = a_host("search").await;
	put(&root, SPACE, "Roadmap.md", "Dates.");
	put(&root, SPACE, "notes.md", "The ROADMAP moved.");
	put(&root, SPACE, "other.txt", "Nothing here.");
	put_bytes(&root, "roadmap.png", &png_of(4));
	put(&root, "work", "roadmap.md", "not yours");
	modified_at(&root, "Roadmap.md", 300);
	modified_at(&root, "notes.md", 200);
	modified_at(&root, "roadmap.png", 100);

	let found = the_host(&app)
		.served(Operation::Search, json!({ "query": "roadMap" }))
		.await
		.expect("searches");

	assert_eq!(names_in(&found), ["Roadmap.md", "notes.md", "roadmap.png"]);
}

#[tokio::test]
async fn a_search_matches_a_document_without_readable_text_on_its_name_and_keeps_searching() {
	let (app, root) = a_host("search-unreadable").await;
	put_bytes(&root, "notes.txt", &[0xff, 0xfe, 0x00, 0x62]);
	put(&root, SPACE, "plan.md", "The budget moved.");
	let host = the_host(&app);
	let search = |query: &str| host.served(Operation::Search, json!({ "query": query }));

	let in_the_text = search("budget").await.expect("searches");
	let in_the_name = search("notes").await.expect("searches");

	assert_eq!(names_in(&in_the_text), ["plan.md"]);
	assert_eq!(names_in(&in_the_name), ["notes.txt"]);
}

#[tokio::test]
async fn a_search_matches_a_board_on_its_name_or_its_node_text_and_leaves_an_invalid_board_out() {
	let (app, root) = a_host("search-boards").await;
	let sprint = json!({
		"nodes": [
			{ "id": "t", "type": "text", "text": "Ship the ROADMAP", "x": 0, "y": 0, "width": 10, "height": 10 },
			{ "id": "g", "type": "group", "label": "Quarter one", "x": 0, "y": 0, "width": 10, "height": 10 },
			{ "id": "f", "type": "file", "file": "deck.pdf", "label": "Launch deck", "x": 0, "y": 0, "width": 10, "height": 10 },
			{ "id": "l", "type": "link", "url": "https://example.test", "label": "Spec page", "x": 0, "y": 0, "width": 10, "height": 10 }
		],
		"edges": []
	});
	put(&root, SPACE, "sprint.canvas", &sprint.to_string());
	put(&root, SPACE, "roadmap.canvas", r#"{"nodes":[],"edges":[]}"#);
	put(&root, SPACE, "roadmap draft.canvas", "{ not json");
	put(&root, SPACE, "quiet.canvas", r#"{"nodes":[],"edges":[]}"#);
	modified_at(&root, "sprint.canvas", 300);
	modified_at(&root, "roadmap.canvas", 200);
	modified_at(&root, "roadmap draft.canvas", 100);
	let host = the_host(&app);
	let search = |query: &str| host.served(Operation::Search, json!({ "query": query }));

	let on_name_or_text = search("roadMap").await.expect("searches");
	let on_a_group_label = search("QUARTER").await.expect("searches");
	let on_a_file_label = search("launch deck").await.expect("searches");
	let on_a_link_label = search("spec").await.expect("searches");
	let on_a_file_path = search("deck.pdf").await.expect("searches");

	assert_eq!(names_in(&on_name_or_text), ["sprint.canvas", "roadmap.canvas"]);
	assert_eq!(names_in(&on_a_group_label), ["sprint.canvas"]);
	assert_eq!(names_in(&on_a_file_label), ["sprint.canvas"]);
	assert_eq!(names_in(&on_a_link_label), ["sprint.canvas"]);
	assert!(names_in(&on_a_file_path).is_empty());
}

#[tokio::test]
async fn a_read_answers_a_document_text_an_image_or_what_an_image_too_large_to_show_is() {
	let (app, root) = a_host("read").await;
	put(&root, SPACE, "notes.md", "# Notes\n");
	put(&root, SPACE, "plain.txt", "plain");
	let png = png_of(4);
	put_bytes(&root, "cover.png", &png);
	let huge = vec![0; usize::try_from(MAX_SHOWN_IMAGE_BYTES).expect("fits") + 1];
	put_bytes(&root, "huge.png", &huge);
	let host = the_host(&app);
	let read = |name: &str| host.served(Operation::Read, json!({ "name": name }));

	assert_eq!(
		read("notes.md").await.expect("reads"),
		json!({ "form": "text", "name": "notes.md", "kind": "document", "text": "# Notes\n" })
	);
	assert_eq!(read("plain.txt").await.expect("reads")["text"], "plain");
	assert_eq!(
		read("cover.png").await.expect("reads"),
		json!({
			"form": "image",
			"name": "cover.png",
			"mimeType": "image/png",
			"content": BASE64_STANDARD.encode(&png)
		})
	);
	assert_eq!(
		read("huge.png").await.expect("reads"),
		json!({
			"form": "described",
			"name": "huge.png",
			"kind": "image",
			"mimeType": "image/png",
			"bytes": huge.len()
		})
	);
}

#[tokio::test]
async fn a_read_answers_the_text_as_it_stands_in_the_shared_document() {
	let (app, root) = a_host("read-shared").await;
	put(&root, SPACE, "notes.md", "Base.");
	person_typed_at_the_end(&app, &root, &Doc::with_client_id(PERSON_CLIENT));

	let answer =
		the_host(&app).served(Operation::Read, json!({ "name": "notes.md" })).await.expect("reads");

	assert_eq!(answer["text"], "Base.#");
}

#[tokio::test]
async fn a_create_writes_the_template_and_tells_the_library_it_changed() {
	let (app, root) = a_host("create").await;
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let host = the_host(&app);

	let created = host
		.served(Operation::Create, json!({ "name": "minutes.md", "template": "meeting-notes" }))
		.await
		.expect("creates");
	let again = host.served(Operation::Create, json!({ "name": "minutes.md" })).await;

	assert_eq!(created["name"], "minutes.md");
	assert_eq!(created["kind"], "document");
	assert_eq!(
		on_disk(&root, "minutes.md"),
		crate::library::templates::markdown_of("meeting-notes").expect("a template")
	);
	assert_eq!(refusal_kind(again), "alreadyExists");
	assert_eq!(
		all_of(&changes),
		[LibraryChanged { space_id: SPACE.to_owned(), overwritten: None }]
	);
}

#[tokio::test]
async fn an_import_copies_the_file_with_its_thumbnail_and_tells_the_library_it_changed() {
	let (app, root) = a_host("import").await;
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let produced = root.join("produced");
	std::fs::create_dir_all(&produced).expect("the folder lands");
	let source = produced.join("chart.png");
	std::fs::write(&source, png_of(8)).expect("the file lands");

	let imported =
		the_host(&app).served(Operation::Import, json!({ "path": source })).await.expect("imports");

	assert_eq!(imported["name"], "chart.png");
	assert_eq!(imported["kind"], "image");
	assert_eq!(std::fs::read(root.join(SPACE).join("chart.png")).expect("copied"), png_of(8));
	assert!(source.exists());
	assert_eq!(thumbnails(&root), 1);
	assert_eq!(
		all_of(&changes),
		[LibraryChanged { space_id: SPACE.to_owned(), overwritten: None }]
	);
}

#[tokio::test]
async fn a_rename_moves_the_document_and_its_shared_state_as_the_person_rename_does() {
	let (app, root) = a_host("rename").await;
	put(&root, SPACE, "notes.md", "Base.");
	put_bytes(&root, "cover.png", &png_of(4));
	person_typed_at_the_end(&app, &root, &Doc::with_client_id(PERSON_CLIENT));
	let renames = heard::<LibraryDocumentRenamed>(&app, events::LIBRARY_DOCUMENT_RENAMED.name());
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let host = the_host(&app);

	let renamed = host
		.served(Operation::Rename, json!({ "name": "notes.md", "newName": "final.md" }))
		.await
		.expect("renames");
	let image = host
		.served(Operation::Rename, json!({ "name": "cover.png", "newName": "front.png" }))
		.await;

	assert_eq!(renamed["name"], "final.md");
	assert!(!root.join(SPACE).join("notes.md").exists());
	assert_eq!(on_disk(&root, "final.md"), "Base.#");
	assert!(state_file(&root, "final.md").exists());
	assert!(!state_file(&root, "notes.md").exists());
	let opened = open_document(app.handle(), &root, SPACE, "final.md").expect("opens");
	let doc = Doc::new();
	let update = BASE64_STANDARD.decode(opened.update).expect("base64");
	doc.transact_mut().apply_update(Update::decode_v1(&update).expect("yjs")).expect("applies");
	assert_eq!(doc.get_or_insert_text("markdown").get_string(&doc.transact()), "Base.#");
	assert_eq!(
		all_of(&renames),
		[LibraryDocumentRenamed {
			space_id: SPACE.to_owned(),
			former_name: "notes.md".to_owned(),
			name: "final.md".to_owned(),
		}]
	);
	assert_eq!(refusal_kind(image), "notADocument");
	assert!(root.join(SPACE).join("cover.png").exists());
	assert_eq!(
		all_of(&changes),
		[LibraryChanged { space_id: SPACE.to_owned(), overwritten: None }]
	);
}

#[tokio::test]
async fn a_delete_removes_the_item_its_thumbnail_and_its_shared_state() {
	let (app, root) = a_host("delete").await;
	put(&root, SPACE, "notes.md", "Base.");
	person_typed_at_the_end(&app, &root, &Doc::with_client_id(PERSON_CLIENT));
	put_bytes(&root, "cover.png", &png_of(4));
	read_thumbnail(&root, SPACE, "cover.png").expect("the thumbnail lands");
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let host = the_host(&app);
	let delete = |name: &str| host.served(Operation::Delete, json!({ "name": name }));
	assert!(state_file(&root, "notes.md").exists());
	assert_eq!(thumbnails(&root), 1);

	assert_eq!(delete("notes.md").await.expect("deletes"), json!({ "name": "notes.md" }));
	assert_eq!(delete("cover.png").await.expect("deletes"), json!({ "name": "cover.png" }));
	let again = delete("notes.md").await;

	assert!(!root.join(SPACE).join("notes.md").exists());
	assert!(!root.join(SPACE).join("cover.png").exists());
	assert!(!state_file(&root, "notes.md").exists());
	assert_eq!(thumbnails(&root), 0);
	assert_eq!(refusal_kind(again), "missing");
	let changed = LibraryChanged { space_id: SPACE.to_owned(), overwritten: None };
	assert_eq!(all_of(&changes), [changed.clone(), changed]);
	put(&root, SPACE, "notes.md", "Fresh.");
	assert_eq!(
		open_document(app.handle(), &root, SPACE, "notes.md").map(|opened| opened.name),
		Ok("notes.md".to_owned())
	);
	assert_eq!(on_disk(&root, "notes.md"), "Fresh.");
}

fn an_open_editor(app: &App<MockRuntime>, root: &Path, name: &str) -> Doc {
	let state = open_document(app.handle(), root, SPACE, name).expect("opens").update;
	let editor = Doc::with_client_id(PERSON_CLIENT);
	let update = BASE64_STANDARD.decode(state).expect("base64");
	editor.transact_mut().apply_update(Update::decode_v1(&update).expect("yjs")).expect("applies");
	editor
}

fn caught_up(editor: &Doc, updates: &Receiver<Value>) -> String {
	for updated in all_of(updates) {
		let update = BASE64_STANDARD.decode(updated["update"].as_str().expect("an update"));
		let update = Update::decode_v1(&update.expect("base64")).expect("yjs");
		editor.transact_mut().apply_update(update).expect("applies");
	}
	editor.get_or_insert_text("markdown").get_string(&editor.transact())
}

#[tokio::test]
async fn a_replace_and_an_insert_land_live_in_an_open_editor_and_keep_one_document() {
	let (app, root) = a_host("replace").await;
	put(&root, SPACE, "notes.md", "# Draft\n\nIntro.\n\n## Plan\n\nShip it.");
	let host = the_host(&app);
	let held = ids_of(&host, "notes.md").await;
	let editor = an_open_editor(&app, &root, "notes.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());

	let retitled = host
		.served(
			Operation::DocumentReplaceBlock,
			json!({ "name": "notes.md", "id": held[0], "markdown": "# Launch plan" }),
		)
		.await
		.expect("the agent replaces");
	let added = host
		.served(
			Operation::DocumentInsertAfter,
			json!({ "name": "notes.md", "after": held[3], "markdown": "## Risks\n\nNone." }),
		)
		.await
		.expect("the agent adds a section");

	let [risks, none] = [&ids_in(&added)[0], &ids_in(&added)[1]];
	let expected = format!(
		"# Launch plan ^{}\n\nIntro. ^{}\n\n## Plan ^{}\n\nShip it. ^{}\n\n## Risks ^{risks}\n\nNone. ^{none}",
		held[0], held[1], held[2], held[3]
	);
	assert_eq!(on_disk(&root, "notes.md"), expected);
	assert_eq!(caught_up(&editor, &updates), expected);
	assert_eq!(retitled, json!({ "name": "notes.md", "ids": [held[0]] }));
	assert_eq!(added["name"], "notes.md");
	assert_eq!(
		names_in(&host.served(Operation::List, json!({})).await.expect("lists")),
		["notes.md"]
	);
}

#[tokio::test]
async fn a_delete_removes_its_blocks_live_and_nothing_else() {
	let (app, root) = a_host("remove").await;
	put(
		&root,
		SPACE,
		"notes.md",
		"Keep. ^aaaaaa\n\nDrop. ^bbbbbb\n\n- drop too\n\n^cccccc\n\nKeep too. ^dddddd",
	);
	let editor = an_open_editor(&app, &root, "notes.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());

	let removed = the_host(&app)
		.served(
			Operation::DocumentDeleteBlock,
			json!({ "name": "notes.md", "ids": ["cccccc", "bbbbbb", "cccccc"] }),
		)
		.await
		.expect("the agent removes");

	assert_eq!(removed, json!({ "name": "notes.md", "ids": ["bbbbbb", "cccccc"] }));
	assert_eq!(on_disk(&root, "notes.md"), "Keep. ^aaaaaa\n\nKeep too. ^dddddd");
	assert_eq!(caught_up(&editor, &updates), "Keep. ^aaaaaa\n\nKeep too. ^dddddd");
}

fn produced(root: &Path, name: &str, bytes: &[u8]) -> PathBuf {
	let produced = root.join("produced");
	std::fs::create_dir_all(&produced).expect("the folder lands");
	let source = produced.join(name);
	std::fs::write(&source, bytes).expect("the file lands");
	source
}

fn thumbnail_bytes(root: &Path) -> Vec<Vec<u8>> {
	std::fs::read_dir(root.join(SPACE).join(".thumbnails"))
		.expect("the thumbnails folder")
		.map(|entry| std::fs::read(entry.expect("an entry").path()).expect("a thumbnail"))
		.collect()
}

#[tokio::test]
async fn an_import_without_overwrite_still_lands_a_numbered_copy() {
	let (app, root) = a_host("import-copy").await;
	put_bytes(&root, "chart.png", &png_of(4));
	let source = produced(&root, "chart.png", &png_of(8));

	let imported =
		the_host(&app).served(Operation::Import, json!({ "path": source })).await.expect("imports");

	assert_eq!(imported["name"], "chart (2).png");
	assert_eq!(std::fs::read(root.join(SPACE).join("chart.png")).expect("kept"), png_of(4));
}

#[tokio::test]
async fn an_overwriting_import_of_a_document_changes_it_in_place_live() {
	let (app, root) = a_host("overwrite-document").await;
	put(&root, SPACE, "report.md", "# Report\n\nDraft.");
	let editor = an_open_editor(&app, &root, "report.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let source = produced(&root, "final.md", b"# Report\n\nFinal.");
	let host = the_host(&app);

	let overwritten = host
		.served(Operation::Import, json!({ "path": source, "overwrite": "report.md" }))
		.await
		.expect("overwrites");

	assert_eq!(overwritten["name"], "report.md");
	assert_eq!(on_disk(&root, "report.md"), "# Report\n\nFinal.");
	assert_eq!(caught_up(&editor, &updates), "# Report\n\nFinal.");
	assert_eq!(
		names_in(&host.served(Operation::List, json!({})).await.expect("lists")),
		["report.md"]
	);
	let modified_at = overwritten["updatedAt"].as_i64().expect("an update time");
	assert_eq!(
		all_of(&changes),
		[LibraryChanged {
			space_id: SPACE.to_owned(),
			overwritten: Some(LibraryOverwritten { name: "report.md".to_owned(), modified_at }),
		}]
	);
}

#[tokio::test]
async fn an_overwriting_import_of_an_image_changes_it_in_place_with_a_new_thumbnail() {
	let (app, root) = a_host("overwrite-image").await;
	put_bytes(&root, "chart.png", &png_of(4));
	modified_at(&root, "chart.png", 1_000);
	let former = read_thumbnail(&root, SPACE, "chart.png").expect("the thumbnail lands").content;
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let source = produced(&root, "chart-v2.png", &png_of(8));
	let host = the_host(&app);

	let overwritten = host
		.served(Operation::Import, json!({ "path": source, "overwrite": "chart.png" }))
		.await
		.expect("overwrites");

	assert_eq!(overwritten["name"], "chart.png");
	assert_eq!(std::fs::read(root.join(SPACE).join("chart.png")).expect("overwritten"), png_of(8));
	assert_eq!(
		names_in(&host.served(Operation::List, json!({})).await.expect("lists")),
		["chart.png"]
	);
	let current = read_thumbnail(&root, SPACE, "chart.png").expect("the thumbnail reads").content;
	assert_ne!(current, former);
	assert_eq!(thumbnail_bytes(&root), [BASE64_STANDARD.decode(current).expect("base64")]);
	let modified_at = overwritten["updatedAt"].as_i64().expect("an update time");
	assert!(modified_at > 1_000_000);
	assert_eq!(
		all_of(&changes),
		[LibraryChanged {
			space_id: SPACE.to_owned(),
			overwritten: Some(LibraryOverwritten { name: "chart.png".to_owned(), modified_at }),
		}]
	);
}

fn jpeg_of(edge: u32) -> Vec<u8> {
	let mut jpeg = Vec::new();
	DynamicImage::ImageRgb8(RgbImage::from_pixel(edge, edge, Rgb([40, 40, 200])))
		.write_to(&mut Cursor::new(&mut jpeg), ImageFormat::Jpeg)
		.expect("the image encodes");
	jpeg
}

#[tokio::test]
async fn an_overwriting_import_of_an_image_in_another_format_is_refused_naming_both() {
	let (app, root) = a_host("overwrite-format").await;
	put_bytes(&root, "chart.jpg", &jpeg_of(4));
	modified_at(&root, "chart.jpg", 1_000);
	read_thumbnail(&root, SPACE, "chart.jpg").expect("the thumbnail lands");
	let thumbnail = thumbnail_bytes(&root);
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let source = produced(&root, "chart.png", &png_of(8));
	let host = the_host(&app);

	let refused =
		host.served(Operation::Import, json!({ "path": source, "overwrite": "chart.jpg" })).await;

	assert_eq!(
		refusal_of(refused),
		json!({
			"kind": "formatMismatch",
			"name": "chart.jpg",
			"mimeType": "image/jpeg",
			"producedMimeType": "image/png",
		})
	);
	assert_eq!(std::fs::read(root.join(SPACE).join("chart.jpg")).expect("kept"), jpeg_of(4));
	assert_eq!(thumbnail_bytes(&root), thumbnail);
	let listed = host.served(Operation::List, json!({})).await.expect("lists");
	assert_eq!(listed["items"][0]["updatedAt"], 1_000_000);
	assert_eq!(all_of(&changes), []);
}

#[tokio::test]
async fn an_overwriting_import_into_another_kind_or_an_absent_name_changes_nothing() {
	let (app, root) = a_host("overwrite-refused").await;
	put(&root, SPACE, "notes.md", "Notes.");
	put_bytes(&root, "chart.png", &png_of(4));
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let image = produced(&root, "new.png", &png_of(8));
	let document = produced(&root, "new.md", b"New.");
	let host = the_host(&app);
	let overwrite = |path: &Path, name: &str| {
		host.served(Operation::Import, json!({ "path": path, "overwrite": name }))
	};

	assert_eq!(refusal_kind(overwrite(&image, "notes.md").await), "notAnImage");
	assert_eq!(refusal_kind(overwrite(&document, "chart.png").await), "notADocument");
	assert_eq!(refusal_kind(overwrite(&document, "gone.md").await), "missing");
	assert_eq!(refusal_kind(overwrite(&image, "gone.png").await), "missing");

	assert_eq!(on_disk(&root, "notes.md"), "Notes.");
	assert_eq!(std::fs::read(root.join(SPACE).join("chart.png")).expect("kept"), png_of(4));
	assert_eq!(names_in(&host.served(Operation::List, json!({})).await.expect("lists")).len(), 2);
	assert_eq!(all_of(&changes), []);
	assert_eq!(all_of(&updates), Vec::<Value>::new());
}

#[derive(Debug, PartialEq)]
enum Published {
	Writers(Vec<LibraryWriterKind>),
	Finished(LibraryWriteOutcome),
}

fn heard_in_order(app: &App<MockRuntime>) -> Receiver<Published> {
	let (told, heard) = channel();
	let told_finished = told.clone();
	app.listen_any(events::LIBRARY_DOCUMENT_PRESENCE.name(), move |event| {
		let presence: LibraryDocumentPresence =
			serde_json::from_str(event.payload()).expect("a presence");
		let kinds = presence.writers.iter().map(|writer| writer.kind).collect();
		told.send(Published::Writers(kinds)).expect("the test listens");
	});
	app.listen_any(events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(), move |event| {
		let finished: LibraryDocumentWriterFinished =
			serde_json::from_str(event.payload()).expect("a finish");
		told_finished.send(Published::Finished(finished.outcome)).expect("the test listens");
	});
	heard
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn two_writes_of_one_agent_at_once_run_one_after_the_other_and_each_finishes_once() {
	let (app, root) = a_host("queued").await;
	put(&root, SPACE, "notes.md", "Base. ^aaaaaa");
	let published = heard_in_order(&app);
	let first = "ABCDEFGHIJKLM".repeat(4);
	let second = "NOPQRSTUVWXYZ".repeat(4);
	let write = |text: &str| {
		let host = the_host(&app);
		let asked = json!({ "name": "notes.md", "markdown": text });
		tokio::spawn(async move { host.served(Operation::DocumentInsertAfter, asked).await })
	};

	let (one, two) = tokio::join!(write(&first), write(&second));
	one.expect("the first write ends").expect("the first write lands");
	two.expect("the second write ends").expect("the second write lands");

	let sources = sources_on_disk(&root, "notes.md");
	assert!(
		[[second.as_str(), first.as_str(), "Base."], [first.as_str(), second.as_str(), "Base."]]
			.iter()
			.any(|order| order.iter().copied().eq(sources.iter().map(String::as_str))),
		"{sources:?}"
	);
	let published = all_of(&published);
	let finished = Published::Finished(LibraryWriteOutcome::Finished);
	assert_eq!(published.iter().filter(|event| **event == finished).count(), 2);
	let (last, before) = published.split_last().expect("something was published");
	assert_eq!(*last, Published::Writers(vec![]));
	for event in before {
		assert_ne!(*event, Published::Writers(vec![]), "the agent left early: {published:?}");
	}
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_write_dropped_mid_way_publishes_one_failed_finish_and_leaves() {
	let (app, root) = a_host("dropped").await;
	put(&root, SPACE, "notes.md", "Base.");
	let published = heard_in_order(&app);
	let host = the_host(&app);
	let asked = json!({ "name": "notes.md", "markdown": "A".repeat(200) });
	let writing =
		tokio::spawn(async move { host.served(Operation::DocumentInsertAfter, asked).await });
	tokio::time::sleep(STEP_PAUSE * 3).await;

	writing.abort();
	assert!(writing.await.expect_err("the write is dropped").is_cancelled());

	let published = all_of(&published);
	let finishes: Vec<_> =
		published.iter().filter(|event| matches!(event, Published::Finished(_))).collect();
	assert_eq!(finishes, [&Published::Finished(LibraryWriteOutcome::Failed)]);
	assert_eq!(published.last(), Some(&Published::Writers(vec![])));
	assert!(on_disk(&root, "notes.md").matches('A').count() < 200);
}

#[tokio::test(start_paused = true)]
async fn a_member_caret_lapses_unless_it_is_sent_again() {
	let (app, root) = a_host("lease").await;
	put(&root, SPACE, "notes.md", "Notes.");
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let caret = caret_of_a_member(&app, "notes.md");
	let member = || Seat::Member("u2".to_owned());
	let shared =
		|| share_presence(app.handle(), &root, SPACE, "notes.md", member(), ana(), caret.clone());
	shared().expect("the caret is published");
	tokio::time::sleep(Duration::from_secs(20)).await;
	shared().expect("the caret is published again");
	tokio::time::sleep(Duration::from_secs(20)).await;
	assert!(all_of(&presences).iter().all(|presence| presence.writers.len() == 1));

	tokio::time::sleep(Duration::from_secs(15)).await;

	let lapsed = all_of(&presences);
	assert_eq!(lapsed.len(), 1);
	assert!(lapsed[0].writers.is_empty());
}

const BOARD: &str = "plan.canvas";

const EMPTY_BOARD: &str = r#"{"nodes":[],"edges":[]}"#;

const BOARD_PACE_PASSED: Duration = Duration::from_millis(60);

fn on_the_board(x: i64, y: i64, node_id: Option<&str>) -> LibraryPresenceAt {
	LibraryPresenceAt::Board {
		point: LibraryBoardPoint { x, y },
		node_id: node_id.map(str::to_owned),
	}
}

fn shared_by_a_member(
	app: &App<MockRuntime>,
	root: &Path,
	name: &str,
	at: LibraryPresenceAt,
) -> Result<(), LibraryError> {
	let member = Seat::Member("u2".to_owned());
	share_presence(app.handle(), root, SPACE, name, member, ana(), at)
}

fn positions(presences: &[LibraryDocumentPresence]) -> Vec<Vec<LibraryPresenceAt>> {
	presences
		.iter()
		.map(|presence| presence.writers.iter().map(|writer| writer.at.clone()).collect())
		.collect()
}

fn shared_through_the_command(
	window: &tauri::WebviewWindow<MockRuntime>,
	name: &str,
	at: &LibraryPresenceAt,
) -> Value {
	invoked_with(window, name, json!(at))
		.unwrap_or_else(|error| panic!("the presence was refused: {error:?}"))
}

fn invoked_with(
	window: &tauri::WebviewWindow<MockRuntime>,
	name: &str,
	at: Value,
) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		tauri::webview::InvokeRequest {
			cmd: "library_share_presence".into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("a url"),
			body: json!({ "spaceId": SPACE, "name": name, "at": at }).into(),
			headers: Default::default(),
			invoke_key: tauri::test::INVOKE_KEY.to_string(),
		},
	)
	.map(|answer| answer.deserialize::<Value>().expect("the answer reads"))
}

fn a_window_of(app: &App<MockRuntime>) -> tauri::WebviewWindow<MockRuntime> {
	tauri::WebviewWindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::default())
		.build()
		.expect("the window opens")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_text_anchor_and_a_board_point_shared_through_the_command_are_published() {
	let builder = mock_builder().invoke_handler(crate::commands::invoke_handler());
	let (app, root) = a_host_built("share-presence", builder).await;
	put(&root, SPACE, "notes.md", "Notes.");
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let window = a_window_of(&app);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let anchor = caret_of_a_member(&app, "notes.md");
	let point = on_the_board(12, -4, Some("n1"));

	shared_through_the_command(&window, "notes.md", &anchor);
	shared_through_the_command(&window, BOARD, &point);

	let wait = Duration::from_secs(5);
	let in_the_document = presences.recv_timeout(wait).expect("the anchor is published");
	let on_the_board = presences.recv_timeout(wait).expect("the point is published");
	assert_eq!(in_the_document.name, "notes.md");
	assert_eq!(positions(&[in_the_document]), [vec![anchor]]);
	assert_eq!(on_the_board.name, BOARD);
	assert_eq!(positions(&[on_the_board]), [vec![point]]);
}

fn hues(presence: &LibraryDocumentPresence) -> Vec<(LibraryWriterKind, Option<u16>)> {
	presence.writers.iter().map(|writer| (writer.kind, writer.hue)).collect()
}

#[test]
fn the_hue_of_an_account_is_pinned_across_releases() {
	assert_eq!(hue_of("u1"), 315);
	assert_eq!(hue_of("acc_7f3a91c2"), 157);
}

#[tokio::test(start_paused = true)]
async fn the_host_and_a_member_of_the_same_account_share_a_hue_and_an_agent_has_none() {
	let (app, root) = a_host("presence-hue").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let author = || AccountAuthor { account_id: Some("u1".to_owned()), ..AccountAuthor::default() };
	let window = Seat::Window("main".to_owned());
	let member = Seat::Member("u1".to_owned());
	let host = Identity::of_person(author(), &window);
	let joined = Identity::of_person(author(), &member);

	share_presence(app.handle(), &root, SPACE, BOARD, window, host, on_the_board(0, 0, None))
		.expect("the host pointer is seated");
	share_presence(app.handle(), &root, SPACE, BOARD, member, joined, on_the_board(5, 5, None))
		.expect("the member pointer is seated");
	seat_agent_on_board(app.handle(), SPACE, BOARD, "b1", "Bean", on_the_board(9, 9, None));
	tokio::time::sleep(BOARD_PACE_PASSED).await;

	let published = all_of(&presences);
	assert_eq!(
		published.iter().map(hues).collect::<Vec<_>>(),
		[vec![
			(LibraryWriterKind::Person, Some(315)),
			(LibraryWriterKind::Member, Some(315)),
			(LibraryWriterKind::Agent, None),
		]]
	);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_signed_out_host_is_hued_from_its_window_through_the_command() {
	let builder = mock_builder().invoke_handler(crate::commands::invoke_handler());
	let (app, root) = a_host_built("share-presence-hue", builder).await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let window = a_window_of(&app);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());

	shared_through_the_command(&window, BOARD, &on_the_board(1, 1, None));

	let published = presences.recv_timeout(Duration::from_secs(5)).expect("the point is published");
	assert_eq!(hues(&published), [(LibraryWriterKind::Person, Some(hue_of("main")))]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_seated_window_keeps_its_hue_when_it_shares_again_through_the_command() {
	let builder = mock_builder().invoke_handler(crate::commands::invoke_handler());
	let (app, root) = a_host_built("share-presence-kept-hue", builder).await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let window = a_window_of(&app);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let seated = Identity { name: Some("Kept".to_owned()), hue: Some(7) };
	let seat = Seat::Window("main".to_owned());
	share_presence(app.handle(), &root, SPACE, BOARD, seat, seated, on_the_board(0, 0, None))
		.expect("the window is seated");
	tokio::time::sleep(BOARD_PACE_PASSED).await;
	presences.try_iter().for_each(drop);

	shared_through_the_command(&window, BOARD, &on_the_board(1, 1, None));

	let shared_again =
		presences.recv_timeout(Duration::from_secs(5)).expect("the move is published");
	assert_eq!(hues(&shared_again), [(LibraryWriterKind::Person, Some(7))]);
	assert_eq!(named(&shared_again.writers), [(LibraryWriterKind::Person, Some("Kept"))]);
}

#[tokio::test(start_paused = true)]
async fn an_agent_board_seat_publishes_its_node_and_point_and_stays_after_it_finishes() {
	let (app, root) = a_host("board-seat").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let finishes = heard::<LibraryDocumentWriterFinished>(
		&app,
		events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(),
	);
	let agent = Agent { id: "b1".to_owned(), name: "Bean".to_owned() };
	let mut seat = BoardWriting::of(app.handle(), SPACE, BOARD, &agent);

	seat.at(&Touched { node_id: Some("n1".to_owned()), x: 40, y: 80 });
	tokio::time::sleep(BOARD_PACE_PASSED).await;

	let seated = all_of(&presences);
	assert_eq!(positions(&seated), [vec![on_the_board(40, 80, Some("n1"))]]);
	assert_eq!(named(&seated[0].writers), [(LibraryWriterKind::Agent, Some("Bean"))]);

	seat.writing.outcome = LibraryWriteOutcome::Finished;
	drop(seat);

	assert!(all_of(&presences).is_empty());
	assert_eq!(agent_seated(&app), Some(Some("Bean".to_owned())));
	assert_eq!(
		all_of(&finishes),
		[LibraryDocumentWriterFinished {
			space_id: SPACE.to_owned(),
			name: BOARD.to_owned(),
			agent_id: "b1".to_owned(),
			agent_name: "Bean".to_owned(),
			outcome: LibraryWriteOutcome::Finished,
		}]
	);
}

#[tokio::test(start_paused = true)]
async fn a_member_board_position_lapses_after_its_lease() {
	let (app, root) = a_host("board-lease").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());

	shared_by_a_member(&app, &root, BOARD, on_the_board(1, 2, None))
		.expect("the position is published");
	tokio::time::sleep(Duration::from_secs(29)).await;
	assert_eq!(positions(&all_of(&presences)), [vec![on_the_board(1, 2, None)]]);

	tokio::time::sleep(Duration::from_secs(2)).await;

	assert_eq!(positions(&all_of(&presences)), [vec![]]);
}

#[tokio::test(start_paused = true)]
async fn a_burst_of_board_positions_is_published_once_with_the_latest_of_every_seat() {
	let (app, root) = a_host("board-burst").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let window = Seat::Window("main".to_owned());
	let nameless = Identity { name: None, hue: None };
	share_presence(app.handle(), &root, SPACE, BOARD, window, nameless, on_the_board(0, 0, None))
		.expect("the window position is seated");

	for step in 1..=5 {
		let at = on_the_board(step, 0, Some("n1"));
		shared_by_a_member(&app, &root, BOARD, at).expect("the position is seated");
		tokio::time::sleep(Duration::from_millis(8)).await;
	}
	assert!(all_of(&presences).is_empty());
	tokio::time::sleep(BOARD_PACE_PASSED).await;

	assert_eq!(
		positions(&all_of(&presences)),
		[vec![on_the_board(0, 0, None), on_the_board(5, 0, Some("n1"))]]
	);
}

#[tokio::test(start_paused = true)]
async fn a_position_of_the_wrong_kind_for_the_item_is_refused_and_publishes_nothing() {
	let (app, root) = a_host("wrong-kind").await;
	put(&root, SPACE, "notes.md", "Notes.");
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let anchor = caret_of_a_member(&app, "notes.md");

	let on_a_board = shared_by_a_member(&app, &root, BOARD, anchor);
	let in_a_document = shared_by_a_member(&app, &root, "notes.md", on_the_board(1, 1, None));
	tokio::time::sleep(BOARD_PACE_PASSED).await;

	assert_eq!(on_a_board, Err(LibraryError::NotADocument { name: BOARD.to_owned() }));
	assert_eq!(in_a_document, Err(LibraryError::NotABoard { name: "notes.md".to_owned() }));
	assert!(all_of(&presences).is_empty());
}

#[tokio::test(start_paused = true)]
async fn a_negative_board_point_is_seated_and_published() {
	let (app, root) = a_host("negative-point").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());

	shared_by_a_member(&app, &root, BOARD, on_the_board(-120, -4, None))
		.expect("a negative point is seated");
	tokio::time::sleep(BOARD_PACE_PASSED).await;

	assert_eq!(positions(&all_of(&presences)), [vec![on_the_board(-120, -4, None)]]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_fractional_or_non_numeric_board_coordinate_is_refused_before_the_command_runs() {
	let builder = mock_builder().invoke_handler(crate::commands::invoke_handler());
	let (app, root) = a_host_built("fractional-point", builder).await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let window = a_window_of(&app);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let refused = [
		json!({ "kind": "board", "point": { "x": 12.5, "y": 0 }, "nodeId": null }),
		json!({ "kind": "board", "point": { "x": "12", "y": 0 }, "nodeId": null }),
	];

	for at in refused {
		let refusal = invoked_with(&window, BOARD, at).expect_err("the point is refused");
		assert!(
			refusal.as_str().is_some_and(|detail| detail.contains("invalid args `at`")),
			"got {refusal}"
		);
	}
	std::thread::sleep(BOARD_PACE_PASSED);

	assert!(all_of(&presences).is_empty());
}

#[tokio::test(start_paused = true)]
async fn a_board_position_with_an_oversized_node_is_refused_and_publishes_nothing() {
	let (app, root) = a_host("bad-point").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());

	let answer = shared_by_a_member(&app, &root, BOARD, on_the_board(0, 0, Some(&"n".repeat(257))));

	assert!(
		matches!(&answer, Err(LibraryError::Undecodable { name, .. }) if name == BOARD),
		"got {answer:?}"
	);
	shared_by_a_member(&app, &root, BOARD, on_the_board(0, 0, Some(&"n".repeat(256))))
		.expect("a node id of 256 bytes is seated");
	tokio::time::sleep(BOARD_PACE_PASSED).await;

	assert_eq!(positions(&all_of(&presences)), [vec![on_the_board(0, 0, Some(&"n".repeat(256)))]]);
}

#[test]
fn a_closed_window_leaves_every_document_it_stood_in() {
	let presences = Presences::default();
	let seated = |seat: Seat| Seated {
		seat,
		name: None,
		hue: None,
		at: LibraryPresenceAt::Text { anchor: String::new() },
		lease_ends_at: None,
	};
	presences.seated(SPACE, "a.md", seated(Seat::Window("main".to_owned())));
	presences.seated(SPACE, "b.md", seated(Seat::Window("main".to_owned())));
	presences.seated(SPACE, "b.md", seated(Seat::Window("second".to_owned())));

	let left = presences.window_closed("main");

	let mut remaining: Vec<_> = left
		.iter()
		.map(|presence| {
			(presence.name.as_str(), presence.writers.iter().map(|w| w.id.as_str()).collect())
		})
		.collect::<Vec<(&str, Vec<&str>)>>();
	remaining.sort();
	assert_eq!(remaining, [("a.md", vec![]), ("b.md", vec!["second"])]);
}

#[test]
fn a_text_splits_into_steps_on_char_boundaries_and_loses_nothing() {
	for text in ["", "é", "ab", "héllo wörld, a paragraph that runs on and on"] {
		let split = steps(text);
		assert_eq!(split.concat(), text);
		assert!(split.len() <= WRITE_STEPS);
		assert_eq!(split.len() > 1, text.chars().count() > 1, "{text}");
	}
	assert_eq!(steps(&"a".repeat(400)).len(), WRITE_STEPS);
}

#[tokio::test]
async fn an_agent_posts_a_document_of_the_space_as_its_own_message_announced_live() {
	let (app, root) = a_host("post-document").await;
	put(&root, SPACE, "notes.md", "Notes.");
	let stored = heard::<TranscriptMessage>(&app, events::MESSAGE_STORED.name());

	let posted = the_host(&app)
		.served(Operation::PostDocument, json!({ "name": "notes.md" }))
		.await
		.expect("the document is posted");

	let page = ready(&app.state::<db::DatabaseState>())
		.expect("the database opens")
		.messages()
		.page_messages(MessagePageQuery {
			conversation_id: "c1".to_owned(),
			before_seq: None,
			limit: 10,
		})
		.await
		.expect("the page reads");
	assert_eq!(page.messages.len(), 1);
	let message = &page.messages[0];
	assert_eq!(message.author_bot_id.as_deref(), Some("b1"));
	assert_eq!(message.documents, ["notes.md"]);
	assert_eq!(
		posted,
		json!({ "name": "notes.md", "conversationId": "c1", "messageId": message.id })
	);
	let announced = all_of(&stored);
	assert_eq!(announced.len(), 1);
	assert_eq!(
		(announced[0].id.as_str(), announced[0].documents.as_slice()),
		(message.id.as_str(), ["notes.md".to_owned()].as_slice())
	);
}

#[tokio::test]
async fn an_agent_posting_what_is_not_a_document_of_the_space_is_refused_by_name_and_posts_nothing()
{
	let (app, root) = a_host("post-refused").await;
	put(&root, "work", "theirs.md", "Theirs.");
	put_bytes(&root, "cover.png", &png_of(4));
	let host = the_host(&app);

	let missing = host.served(Operation::PostDocument, json!({ "name": "theirs.md" })).await;
	let image = host.served(Operation::PostDocument, json!({ "name": "cover.png" })).await;

	let refused = |answer: Result<Value, DocumentRefusal>| {
		serde_json::to_value(answer.expect_err("the post is refused")).expect("serializes")
	};
	assert_eq!(refused(missing), json!({ "kind": "missing", "name": "theirs.md" }));
	assert_eq!(refused(image), json!({ "kind": "notADocument", "name": "cover.png" }));
	let page = ready(&app.state::<db::DatabaseState>())
		.expect("the database opens")
		.messages()
		.page_messages(MessagePageQuery {
			conversation_id: "c1".to_owned(),
			before_seq: None,
			limit: 10,
		})
		.await
		.expect("the page reads");
	assert!(page.messages.is_empty());
}

const A_SECOND_AGENT_IN_THE_CONVERSATION: &str = "
	INSERT INTO bots (id, name, model, created_at) VALUES ('b2', 'Kit', 'sonnet', 1);
	INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b2', 'personal', 1);
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('c1', 'b2', 'assistant', 1, 1);
";

async fn two_agents_writing(name: &str) -> (AppOfItsOwn, PathBuf) {
	let (app, root) = a_host(name).await;
	app.manage(AgentState::default());
	ready(&app.state::<db::DatabaseState>())
		.expect("the database opens")
		.call_mut(|connection| Ok(connection.execute_batch(A_SECOND_AGENT_IN_THE_CONVERSATION)?))
		.await
		.expect("the second agent is planted");
	put(&root, SPACE, "notes.md", "Base. ^aaaaaa");
	(app, root)
}

fn writing(
	app: &App<MockRuntime>,
	bot_id: &str,
	text: String,
) -> tokio::task::JoinHandle<Result<Value, DocumentRefusal>> {
	let host = the_host_of(app, bot_id);
	let asked = json!({ "name": "notes.md", "markdown": text });
	tokio::spawn(async move { host.served(Operation::DocumentInsertAfter, asked).await })
}

async fn stopped(app: &App<MockRuntime>, agent_id: Option<&str>) -> CancelOutcome {
	library_stop_writers(
		app.handle().clone(),
		app.state(),
		app.state(),
		SPACE.to_owned(),
		"notes.md".to_owned(),
		agent_id.map(str::to_owned),
	)
	.await
	.expect("the stop is answered")
}

fn agent_finishes(
	heard: &Receiver<LibraryDocumentWriterFinished>,
) -> Vec<(String, LibraryWriteOutcome)> {
	let mut finishes: Vec<_> =
		heard.try_iter().map(|finished| (finished.agent_id, finished.outcome)).collect();
	finishes.sort_by(|one, other| one.0.cmp(&other.0));
	finishes
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_stop_without_an_agent_stops_every_agent_writing_and_leaves_the_member_seated() {
	let (app, root) = two_agents_writing("stop-all").await;
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let finishes = heard::<LibraryDocumentWriterFinished>(
		&app,
		events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(),
	);
	let caret = caret_of_a_member(&app, "notes.md");
	share_presence(
		app.handle(),
		&root,
		SPACE,
		"notes.md",
		Seat::Member("u2".to_owned()),
		ana(),
		caret,
	)
	.expect("the member caret is published");
	let bean = writing(&app, "b1", "A".repeat(200));
	let kit = writing(&app, "b2", "D".repeat(200));
	tokio::time::sleep(STEP_PAUSE * 3).await;

	assert_eq!(stopped(&app, None).await, CancelOutcome::Cancelled);

	let left = on_disk(&root, "notes.md");
	for write in [bean, kit] {
		let answer = write.await.expect("the write ends");
		assert_eq!(refusal_kind(answer), "stopped");
	}
	tokio::time::sleep(STEP_PAUSE * 3).await;
	assert_eq!(on_disk(&root, "notes.md"), left);
	assert!(left.matches(['A', 'D']).count() < 400, "{left}");
	assert_eq!(
		agent_finishes(&finishes),
		[
			("b1".to_owned(), LibraryWriteOutcome::Failed),
			("b2".to_owned(), LibraryWriteOutcome::Failed)
		]
	);
	let last = all_of(&presences).pop().expect("a presence was published");
	assert_eq!(named(&last.writers), [(LibraryWriterKind::Member, Some("Ana"))]);
	assert_eq!(stopped(&app, None).await, CancelOutcome::NothingToCancel);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_whole_rewrite_stopped_mid_way_keeps_the_old_text_and_answers_stopped() {
	let (app, root) = two_agents_writing("stop-whole").await;
	let host = the_host(&app);
	let asked = json!({ "name": "notes.md", "id": "aaaaaa", "markdown": "N".repeat(200) });
	let rewriting =
		tokio::spawn(async move { host.served(Operation::DocumentReplaceBlock, asked).await });
	tokio::time::sleep(STEP_PAUSE * 3).await;

	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::Cancelled);

	assert_eq!(refusal_kind(rewriting.await.expect("the stopped write ends")), "stopped");
	let text = on_disk(&root, "notes.md");
	assert!(text.contains("Base. ^aaaaaa"), "{text}");
	assert!(text.matches('N').count() < 200, "{text}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_stop_of_one_agent_leaves_the_other_of_the_same_conversation_writing_to_its_last_step() {
	let (app, root) = two_agents_writing("stop-one").await;
	let finishes = heard::<LibraryDocumentWriterFinished>(
		&app,
		events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(),
	);
	let bean = writing(&app, "b1", "A".repeat(200));
	let kit = writing(&app, "b2", "D".repeat(200));
	tokio::time::sleep(STEP_PAUSE * 3).await;

	assert_eq!(stopped(&app, Some("b9")).await, CancelOutcome::NothingToCancel);
	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::Cancelled);

	assert_eq!(refusal_kind(bean.await.expect("the stopped write ends")), "stopped");
	kit.await.expect("the other write ends").expect("the other write lands");
	let text = on_disk(&root, "notes.md");
	assert_eq!(text.matches('D').count(), 200, "{text}");
	assert!(text.matches('A').count() < 200, "{text}");
	assert_eq!(
		agent_finishes(&finishes),
		[
			("b1".to_owned(), LibraryWriteOutcome::Failed),
			("b2".to_owned(), LibraryWriteOutcome::Finished)
		]
	);
	assert_eq!(stopped(&app, Some("b2")).await, CancelOutcome::NothingToCancel);
}

#[tokio::test]
async fn a_stop_in_a_document_nobody_writes_in_has_nothing_to_cancel() {
	let (app, _root) = two_agents_writing("stop-nobody").await;

	assert_eq!(stopped(&app, None).await, CancelOutcome::NothingToCancel);
	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::NothingToCancel);
}

async fn enlisted_by(app: &App<MockRuntime>, agent_id: &str, count: usize) {
	let key = (SPACE.to_owned(), "notes.md".to_owned(), agent_id.to_owned());
	while writes(app.handle()).writing().get(&key).map_or(0, Vec::len) < count {
		tokio::time::sleep(Duration::from_millis(1)).await;
	}
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_stop_also_stops_the_write_queued_behind_the_running_one_before_it_writes() {
	let (app, root) = two_agents_writing("stop-queued").await;
	let published = heard_in_order(&app);
	let running = writing(&app, "b1", "A".repeat(200));
	tokio::time::sleep(STEP_PAUSE * 3).await;
	let queued = writing(&app, "b1", "D".repeat(200));
	enlisted_by(&app, "b1", 2).await;

	assert_eq!(stopped(&app, None).await, CancelOutcome::Cancelled);

	assert!(running.is_finished() && queued.is_finished(), "the stop answered before both left");
	for write in [running, queued] {
		assert_eq!(refusal_kind(write.await.expect("the write ends")), "stopped");
	}
	let text = on_disk(&root, "notes.md");
	assert!(!text.contains('D'), "{text}");
	let published = all_of(&published);
	let finishes: Vec<_> =
		published.iter().filter(|event| matches!(event, Published::Finished(_))).collect();
	let failed = Published::Finished(LibraryWriteOutcome::Failed);
	assert_eq!(finishes, [&failed, &failed]);
	assert_eq!(published.last(), Some(&Published::Writers(vec![])));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_write_of_the_stopped_agent_started_after_the_stop_lands_in_full() {
	let (app, root) = two_agents_writing("stop-then-write").await;
	let interrupted = writing(&app, "b1", "A".repeat(200));
	enlisted_by(&app, "b1", 1).await;
	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::Cancelled);
	assert_eq!(refusal_kind(interrupted.await.expect("the stopped write ends")), "stopped");

	writing(&app, "b1", "D".repeat(200))
		.await
		.expect("the new write ends")
		.expect("the new write lands");

	let text = on_disk(&root, "notes.md");
	assert_eq!(text.matches('D').count(), 200, "{text}");
}

const A_BOARD_WITH_ONE_NODE: &str = r#"{"nodes":[{"id":"a","type":"text","text":"A","x":0,"y":0,"width":100,"height":50}],"edges":[]}"#;

fn board_caught_up(editor: &Doc, updates: &[Value]) -> Board {
	for updated in updates {
		let update = BASE64_STANDARD.decode(updated["update"].as_str().expect("an update"));
		let update = Update::decode_v1(&update.expect("base64")).expect("yjs");
		editor.transact_mut().apply_update(update).expect("applies");
	}
	crate::board::read_board(editor).expect("the board reads")
}

fn a_step(key: &str, after: Option<&str>) -> Value {
	match after {
		Some(previous) => json!({
			"key": key, "kind": "shape", "text": key, "place": { "side": "right", "of": previous }
		}),
		None => json!({ "key": key, "kind": "shape", "text": key }),
	}
}

fn a_five_step_flow() -> Value {
	let keys = ["brief", "draft", "review", "ship", "learn"];
	let nodes: Vec<Value> = keys
		.iter()
		.enumerate()
		.map(|(index, key)| a_step(key, index.checked_sub(1).map(|previous| keys[previous])))
		.collect();
	let arrows: Vec<Value> =
		keys.windows(2).map(|pair| json!({ "fromNode": pair[0], "toNode": pair[1] })).collect();
	json!({ "name": BOARD, "mode": "insert", "nodes": nodes, "arrows": arrows })
}

fn written(nodes: Value, arrows: Value) -> Value {
	json!({ "name": BOARD, "mode": "insert", "nodes": nodes, "arrows": arrows })
}

fn agent_seated(app: &App<MockRuntime>) -> Option<Option<String>> {
	crate::library::presence::seated_identity(
		app.handle(),
		SPACE,
		BOARD,
		&Seat::Agent("b1".to_owned()),
	)
	.map(|identity| identity.name)
}

#[tokio::test]
async fn an_agent_creates_an_empty_board_and_a_taken_name_creates_nothing() {
	let (app, root) = a_host("board-create").await;
	let changes = heard::<LibraryChanged>(&app, events::LIBRARY_CHANGED.name());
	let host = the_host(&app);

	let created = host
		.served(Operation::BoardCreate, json!({ "name": BOARD }))
		.await
		.expect("the board is created");
	let changed = all_of(&changes);
	put(&root, SPACE, "notes.md", "Notes.");
	let taken = host.served(Operation::BoardCreate, json!({ "name": BOARD })).await;
	let not_a_board = host.served(Operation::BoardCreate, json!({ "name": "notes.md" })).await;

	assert_eq!((&created["name"], &created["kind"]), (&json!(BOARD), &json!("board")));
	assert!(created["updatedAt"].is_i64(), "{created}");
	assert_eq!(created["header"]["name"], BOARD);
	assert_eq!(created["header"]["updatedAt"], created["updatedAt"]);
	assert!(created["header"]["hash"].is_string(), "{created}");
	assert_eq!(changed.len(), 1);
	assert_eq!(on_disk(&root, BOARD), EMPTY_BOARD);
	assert_eq!(refusal_of(taken), json!({ "kind": "alreadyExists", "name": BOARD }));
	assert_eq!(refusal_kind(not_a_board), json!("invalidName"));
	assert_eq!(on_disk(&root, BOARD), EMPTY_BOARD);
	assert_eq!(on_disk(&root, "notes.md"), "Notes.");
}

#[tokio::test]
async fn a_five_step_flow_lands_in_one_call_as_one_announced_update() {
	let (app, root) = a_host("board-flow").await;
	let host = the_host(&app);
	host.served(Operation::BoardCreate, json!({ "name": BOARD })).await.expect("created");
	let editor = an_open_editor(&app, &root, BOARD);
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());

	let added = host.served(Operation::BoardWrite, a_five_step_flow()).await.expect("drawn");
	let announced = all_of(&updates);
	let read = host.served(Operation::BoardTree, json!({ "name": BOARD })).await.expect("read");

	assert_eq!(announced.len(), 1);
	let ids: BTreeMap<String, String> =
		serde_json::from_value(added["ids"].clone()).expect("a key map");
	assert_eq!(ids.keys().collect::<Vec<_>>(), ["brief", "draft", "learn", "review", "ship"]);
	let seen = serde_json::to_value(board_caught_up(&editor, &announced)).expect("serializes");
	assert_eq!(seen["nodes"].as_object().map(|nodes| nodes.len()), Some(5));
	assert_eq!(seen["edges"].as_object().map(|edges| edges.len()), Some(4));
	let nodes = read["nodes"].as_array().expect("nodes");
	let xs: Vec<i64> = nodes.iter().map(|node| node["x"].as_i64().expect("x")).collect();
	assert_eq!(xs, [0, 280, 560, 840, 1120]);
	assert!(nodes.iter().all(|node| node["y"] == 0 && node["kind"] == "shape"));
	assert_eq!(nodes[1]["text"], "draft");
	assert_eq!(nodes[1]["id"].as_str(), Some(ids["draft"].as_str()));
	let arrows = read["arrows"].as_array().expect("arrows");
	assert_eq!(arrows.len(), 4);
	assert!(arrows.iter().any(|arrow| arrow["fromNode"] == ids["brief"].as_str()
		&& arrow["toNode"] == ids["draft"].as_str()));
	assert_eq!(read["header"], added["header"]);
}

#[tokio::test]
async fn every_board_answer_carries_a_header_whose_hash_moves_only_with_the_content() {
	let (app, root) = a_host("board-header").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let host = the_host(&app);
	let named = json!({ "name": BOARD });

	let info = host.served(Operation::BoardInfo, named.clone()).await.expect("info");
	let again = host.served(Operation::BoardFind, named.clone()).await.expect("found");
	let refused = host
		.served(Operation::BoardUpdate, json!({ "name": BOARD, "nodes": [{ "id": "gone" }] }))
		.await;
	let unchanged = host.served(Operation::BoardCanvas, named.clone()).await.expect("canvas");
	let updated = host
		.served(Operation::BoardUpdate, json!({ "name": BOARD, "nodes": [{ "id": "a", "y": 9 }] }))
		.await
		.expect("updated");
	let after = host.served(Operation::BoardNodeInfo, named.clone()).await.expect("detail");

	let header = &info["header"];
	assert_eq!(header["name"], BOARD);
	assert!(header["updatedAt"].is_i64(), "{header}");
	assert_eq!(header["hash"].as_str().map(str::len), Some(64));
	assert_eq!(again["header"], *header);
	assert_eq!(unchanged["header"], *header);
	assert_eq!(refusal_of(refused)["reference"], "gone");
	assert_ne!(updated["header"]["hash"], header["hash"]);
	assert_eq!(after["header"]["hash"], updated["header"]["hash"]);
}

#[tokio::test]
async fn a_refused_batch_leaves_the_board_byte_identical_and_announces_nothing() {
	let (app, root) = a_host("board-refused").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let state_before = open_document(app.handle(), &root, SPACE, BOARD).expect("opens").update;
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let batch = written(
		json!([
			{ "key": "fine", "kind": "text", "place": { "side": "below", "of": "a" } },
			{ "key": "wrong", "kind": "sticky", "fill": "purple" }
		]),
		json!([{ "fromNode": "fine", "toNode": "a" }]),
	);
	let host = the_host(&app);

	let refused = host.served(Operation::BoardWrite, batch).await;
	let rootless_replace = host
		.served(Operation::BoardWrite, json!({ "name": BOARD, "mode": "replace", "nodes": [] }))
		.await;
	let unknown_ids = [
		host.served(Operation::BoardDelete, json!({ "name": BOARD, "nodes": ["a", "ghost"] }))
			.await,
		host.served(
			Operation::BoardMove,
			json!({ "name": BOARD, "nodes": ["ghost"], "x": 0, "y": 0 }),
		)
		.await,
		host.served(Operation::BoardDuplicate, json!({ "name": BOARD, "nodes": ["ghost"] })).await,
		host.served(Operation::BoardNodeInfo, json!({ "name": BOARD, "arrows": ["ghost"] })).await,
		host.served(Operation::BoardTree, json!({ "name": BOARD, "parent": "ghost" })).await,
		host.served(Operation::BoardCanvas, json!({ "name": BOARD, "parent": "ghost" })).await,
		host.served(
			Operation::BoardWrite,
			json!({ "name": BOARD, "parent": "ghost", "mode": "replace", "nodes": [] }),
		)
		.await,
	];

	assert_eq!(
		refusal_of(refused),
		json!({
			"kind": "invalidBoardItem",
			"element": "node",
			"index": 1,
			"reason": "refusedField",
			"field": "fill"
		})
	);
	assert_eq!(
		refusal_of(rootless_replace),
		json!({ "kind": "invalidBoardItem", "element": "parent", "reason": "missingParent" })
	);
	for answer in unknown_ids {
		let refusal = refusal_of(answer);
		assert_eq!(refusal["reason"], "unknownReference", "{refusal}");
		assert_eq!(refusal["reference"], "ghost", "{refusal}");
	}
	assert!(all_of(&updates).is_empty());
	assert_eq!(on_disk(&root, BOARD), A_BOARD_WITH_ONE_NODE);
	let state_after = open_document(app.handle(), &root, SPACE, BOARD).expect("opens").update;
	assert_eq!(state_after, state_before);
}

#[tokio::test]
async fn an_update_changes_a_node_in_place_and_a_deletion_takes_its_edges_each_in_one_update() {
	let (app, root) = a_host("board-update-remove").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let host = the_host(&app);
	let batch = written(
		json!([{ "key": "b", "kind": "text", "text": "B", "place": { "side": "right", "of": "a" } }]),
		json!([{ "key": "ab", "fromNode": "a", "toNode": "b" }]),
	);
	let added = host.served(Operation::BoardWrite, batch).await.expect("drawn");
	let (b, ab) = (added["ids"]["b"].clone(), added["ids"]["ab"].clone());
	let editor = an_open_editor(&app, &root, BOARD);
	let text_of_a = {
		let nodes = editor.get_or_insert_map("nodes");
		let txn = editor.transact();
		match nodes.get(&txn, "a") {
			Some(yrs::Out::YMap(node)) => match node.get(&txn, "text") {
				Some(yrs::Out::YText(text)) => text,
				held => panic!("the text of a node is a Y.Text, got {held:?}"),
			},
			held => panic!("the node is a Y.Map, got {held:?}"),
		}
	};
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());

	let updated = host
		.served(
			Operation::BoardUpdate,
			json!({
				"name": BOARD,
				"nodes": [{ "id": "a", "text": "Brief", "y": 20 }],
				"arrows": [{ "id": ab, "label": "then" }]
			}),
		)
		.await
		.expect("updated");
	let announced_update = all_of(&updates);
	let detail = host
		.served(Operation::BoardNodeInfo, json!({ "name": BOARD, "nodes": ["a"], "arrows": [ab] }))
		.await
		.expect("detailed");
	let removed = host
		.served(Operation::BoardDelete, json!({ "name": BOARD, "nodes": [b] }))
		.await
		.expect("removed");
	let announced_removal = all_of(&updates);

	assert_eq!((&updated["nodes"], &updated["arrows"]), (&json!(["a"]), &json!([ab])));
	assert_eq!(announced_update.len(), 1);
	board_caught_up(&editor, &announced_update);
	assert_eq!(text_of_a.get_string(&editor.transact()), "Brief");
	let (a, arrow) = (&detail["nodes"][0], &detail["arrows"][0]);
	assert_eq!(
		(&a["text"], &a["y"], &a["color"], &a["z"]),
		(&json!("Brief"), &json!(20), &Value::Null, &json!("a0"))
	);
	assert_eq!(
		(&arrow["label"], &arrow["routing"], &arrow["fromSide"]),
		(&json!("then"), &json!("elbow"), &json!("right"))
	);
	assert_eq!(
		(&arrow["labelPosition"], &arrow["bend"], &arrow["headSize"]),
		(&json!(0.5), &json!(0), &json!("medium"))
	);
	assert_eq!(announced_removal.len(), 1);
	assert_eq!(removed["nodes"], json!([b]));
	assert_eq!(removed["arrows"], json!([ab]));
	let seen =
		serde_json::to_value(board_caught_up(&editor, &announced_removal)).expect("serializes");
	assert_eq!(seen["edges"], json!({}));
	let read = host.served(Operation::BoardTree, json!({ "name": BOARD })).await.expect("read");
	assert_eq!(read["nodes"].as_array().map(Vec::len), Some(1));
	assert_eq!(read["arrows"], json!([]));
}

const A_LANE_AND_A_NOTE: &str = r#"{"nodes":[
	{"id":"lane","type":"group","label":"Lane","x":0,"y":0,"width":600,"height":400},
	{"id":"in","type":"text","text":"Inside","x":40,"y":40,"width":100,"height":50},
	{"id":"out","type":"text","text":"Outside","x":900,"y":0,"width":100,"height":50}
],"edges":[{"id":"e","fromNode":"in","toNode":"out"}]}"#;

#[tokio::test]
async fn a_replace_into_a_section_swaps_its_children_and_their_arrows_in_one_update() {
	let (app, root) = a_host("board-replace").await;
	put(&root, SPACE, BOARD, A_LANE_AND_A_NOTE);
	let host = the_host(&app);
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());

	let replaced = host
		.served(
			Operation::BoardWrite,
			json!({
				"name": BOARD,
				"parent": "lane",
				"mode": "replace",
				"nodes": [{ "key": "new", "kind": "sticky", "text": "Fresh" }],
				"arrows": [{ "fromNode": "new", "toNode": "out" }]
			}),
		)
		.await
		.expect("replaced");
	let announced = all_of(&updates);
	let lane = host
		.served(Operation::BoardTree, json!({ "name": BOARD, "parent": "lane" }))
		.await
		.expect("read");
	let canvas = host
		.served(Operation::BoardCanvas, json!({ "name": BOARD, "parent": "lane" }))
		.await
		.expect("canvas");

	assert_eq!(announced.len(), 1);
	let fresh = replaced["ids"]["new"].clone();
	let nodes = lane["nodes"].as_array().expect("nodes");
	assert_eq!(nodes.len(), 1);
	assert_eq!(
		(&nodes[0]["id"], &nodes[0]["text"], &nodes[0]["parent"]),
		(&fresh, &json!("Fresh"), &json!("lane"))
	);
	assert_eq!(lane["arrows"], json!([]));
	let canvas: Value =
		serde_json::from_str(canvas["canvas"].as_str().expect("a text")).expect("JSON Canvas");
	let ids: Vec<&Value> =
		canvas["nodes"].as_array().expect("nodes").iter().map(|node| &node["id"]).collect();
	assert_eq!(ids, [&json!("lane"), &fresh]);
	let whole = host.served(Operation::BoardTree, json!({ "name": BOARD })).await.expect("read");
	let arrow = &whole["arrows"][0];
	assert_eq!(whole["arrows"].as_array().map(Vec::len), Some(1));
	assert_eq!((&arrow["fromNode"], &arrow["toNode"]), (&fresh, &json!("out")));
}

#[tokio::test]
async fn a_move_into_a_section_that_grows_answers_the_moved_nodes_and_never_the_section() {
	let (app, root) = a_host("board-move-grow").await;
	put(&root, SPACE, BOARD, A_LANE_AND_A_NOTE);
	let host = the_host(&app);

	let moved = host
		.served(
			Operation::BoardMove,
			json!({ "name": BOARD, "nodes": ["out"], "parent": "lane", "x": 560, "y": 0 }),
		)
		.await
		.expect("moved");
	let lane = host
		.served(Operation::BoardTree, json!({ "name": BOARD, "parent": "lane" }))
		.await
		.expect("read");

	assert_eq!(moved["nodes"], json!(["out"]));
	let held: Vec<&Value> =
		lane["nodes"].as_array().expect("nodes").iter().map(|node| &node["id"]).collect();
	assert_eq!(held, [&json!("in"), &json!("out")]);
}

#[tokio::test]
async fn a_move_a_duplicate_and_a_find_keep_ids_and_arrows_and_answer_the_new_ids() {
	let (app, root) = a_host("board-arrange").await;
	put(&root, SPACE, BOARD, A_LANE_AND_A_NOTE);
	let host = the_host(&app);

	let moved = host
		.served(
			Operation::BoardMove,
			json!({ "name": BOARD, "nodes": ["lane"], "x": 100, "y": 500 }),
		)
		.await
		.expect("moved");
	let copies = host
		.served(
			Operation::BoardDuplicate,
			json!({ "name": BOARD, "nodes": ["lane", "out"], "x": 0, "y": 2000 }),
		)
		.await
		.expect("duplicated");
	let found = host
		.served(Operation::BoardFind, json!({ "name": BOARD, "text": "inSIDE", "kind": "text" }))
		.await
		.expect("found");
	let info = host.served(Operation::BoardInfo, json!({ "name": BOARD })).await.expect("info");

	assert_eq!(moved["nodes"], json!(["lane", "in"]));
	let copied = &copies["nodes"];
	let found: Vec<&str> =
		found["nodes"].as_array().expect("ids").iter().filter_map(Value::as_str).collect();
	assert_eq!(found, ["in", copied["in"].as_str().expect("a copy")]);
	assert_eq!(copies["arrows"]["e"].as_str().map(str::len), Some(36));
	assert_eq!(info["kinds"], json!({ "section": 2, "text": 4 }));
	assert_eq!(info["arrows"], 2);
	assert_eq!(info["bounds"], json!({ "x": 0, "y": 0, "width": 1000, "height": 2900 }));
	let sections: Vec<&Value> = info["sections"]
		.as_array()
		.expect("sections")
		.iter()
		.map(|section| &section["id"])
		.collect();
	assert_eq!(sections, [&json!("lane"), &copied["lane"]]);
	assert_eq!(
		info["sections"][0],
		json!({ "id": "lane", "label": "Lane", "x": 100, "y": 500, "width": 600, "height": 400 })
	);
}

#[tokio::test(start_paused = true)]
async fn an_agent_board_seat_is_published_after_a_call_and_lapses_at_the_end_of_its_lease() {
	let (app, root) = a_host("board-presence").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let host = the_host(&app);
	let batch = written(
		json!([{ "key": "b", "kind": "text", "place": { "side": "right", "of": "a" } }]),
		json!([]),
	);

	let added = host.served(Operation::BoardWrite, batch).await.expect("drawn");
	let b = added["ids"]["b"].as_str().expect("an id").to_owned();
	tokio::time::sleep(BOARD_PACE_PASSED).await;
	let after_the_pace = all_of(&presences);
	tokio::time::sleep(AGENT_BOARD_LEASE - BOARD_PACE_PASSED * 2).await;
	let before_the_lease_ends = all_of(&presences);
	let still_seated = agent_seated(&app);
	tokio::time::sleep(BOARD_PACE_PASSED * 2).await;
	let after_the_lease = all_of(&presences);

	assert_eq!(positions(&after_the_pace), [vec![on_the_board(300, 25, Some(&b))]]);
	assert_eq!(named(&after_the_pace[0].writers), [(LibraryWriterKind::Agent, Some("Bean"))]);
	assert!(before_the_lease_ends.is_empty());
	assert_eq!(still_seated, Some(Some("Bean".to_owned())));
	assert_eq!(positions(&after_the_lease), [vec![]]);
	assert_eq!(agent_seated(&app), None);
}

#[tokio::test(start_paused = true)]
async fn another_board_call_renews_the_lease_and_moves_the_one_seat_and_a_refusal_keeps_it() {
	let (app, root) = a_host("board-presence-renewed").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let finishes = heard::<LibraryDocumentWriterFinished>(
		&app,
		events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(),
	);
	let host = the_host(&app);
	let batch = written(json!([{ "key": "b", "kind": "text", "x": 400, "y": 0 }]), json!([]));
	host.served(Operation::BoardWrite, batch).await.expect("drawn");
	tokio::time::sleep(BOARD_PACE_PASSED).await;
	let first = all_of(&presences);
	tokio::time::sleep(AGENT_BOARD_LEASE / 2).await;

	let refused = host
		.served(Operation::BoardUpdate, json!({ "name": BOARD, "nodes": [{ "id": "gone" }] }))
		.await;
	tokio::time::sleep(BOARD_PACE_PASSED).await;
	let after_the_refusal = all_of(&presences);
	host.served(
		Operation::BoardUpdate,
		json!({ "name": BOARD, "nodes": [{ "id": "a", "text": "Brief" }] }),
	)
	.await
	.expect("updated");
	tokio::time::sleep(BOARD_PACE_PASSED).await;
	let moved = all_of(&presences);
	tokio::time::sleep(AGENT_BOARD_LEASE / 2).await;
	let past_the_first_lease = all_of(&presences);
	tokio::time::sleep(AGENT_BOARD_LEASE / 2).await;
	let past_the_renewed_lease = all_of(&presences);

	assert_eq!(first.len(), 1);
	assert_eq!(refusal_kind(refused), json!("invalidBoardItem"));
	assert!(after_the_refusal.is_empty());
	assert_eq!(positions(&moved), [vec![on_the_board(50, 25, Some("a"))]]);
	assert!(past_the_first_lease.is_empty());
	assert_eq!(positions(&past_the_renewed_lease), [vec![]]);
	let outcomes: Vec<_> = all_of(&finishes).into_iter().map(|finished| finished.outcome).collect();
	assert_eq!(
		outcomes,
		[LibraryWriteOutcome::Finished, LibraryWriteOutcome::Failed, LibraryWriteOutcome::Finished]
	);
}

#[tokio::test]
async fn an_agent_posts_a_board_of_the_space_as_its_own_message() {
	let (app, root) = a_host("post-board").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);

	let posted = the_host(&app)
		.served(Operation::PostDocument, json!({ "name": BOARD }))
		.await
		.expect("the board is posted");

	let page = ready(&app.state::<db::DatabaseState>())
		.expect("the database opens")
		.messages()
		.page_messages(MessagePageQuery {
			conversation_id: "c1".to_owned(),
			before_seq: None,
			limit: 10,
		})
		.await
		.expect("the page reads");
	assert_eq!(page.messages.len(), 1);
	assert_eq!(page.messages[0].author_bot_id.as_deref(), Some("b1"));
	assert_eq!(page.messages[0].documents, [BOARD]);
	assert_eq!(posted["name"], BOARD);
}

fn an_image_node(id: &str, item: &str, z: &str) -> Value {
	json!({
		"id": id, "type": "file", "file": format!("Library/{item}"),
		"x": 0, "y": 0, "width": 116, "height": 124,
		"kiroshi": { "kind": "image", "item": item, "z": z }
	})
}

#[tokio::test]
async fn a_board_view_shows_an_image_node_and_refuses_any_other_node_with_its_reason() {
	let (app, root) = a_host("board-view").await;
	let png = png_of(4);
	put_bytes(&root, "cover.png", &png);
	let huge = vec![0; usize::try_from(MAX_SHOWN_IMAGE_BYTES).expect("fits") + 1];
	put_bytes(&root, "huge.png", &huge);
	put(&root, "work", "secret.png", "not yours");
	put(&root, "work", "elsewhere.png", "not yours");
	put(&root, SPACE, "notes.md", "# Notes");
	put(&root, SPACE, "other.canvas", r#"{"nodes":[],"edges":[]}"#);
	let sticky = json!({
		"id": "note", "type": "text", "text": "Hi", "x": 0, "y": 200, "width": 200, "height": 200,
		"kiroshi": { "kind": "sticky", "z": "a1", "author": { "kind": "person", "id": "p1" } }
	});
	let canvas = json!({
		"nodes": [
			an_image_node("photo", "cover.png", "a0"),
			sticky,
			an_image_node("lost", "gone.png", "a2"),
			an_image_node("huge", "huge.png", "a3"),
			an_image_node("escape", "../work/secret.png", "a4"),
			an_image_node("elsewhere", "elsewhere.png", "a5"),
			an_image_node("notes", "notes.md", "a6"),
			an_image_node("nested", "other.canvas", "a7"),
		],
		"edges": []
	});
	put(&root, SPACE, BOARD, &canvas.to_string());
	let host = the_host(&app);
	let view = |id: &str| host.served(Operation::BoardView, json!({ "name": BOARD, "id": id }));

	let mut shown = view("photo").await.expect("shown");
	let header = shown.as_object_mut().and_then(|shown| shown.remove("header"));
	assert_eq!(header.as_ref().map(|header| &header["name"]), Some(&json!(BOARD)));
	assert_eq!(
		shown,
		json!({
			"form": "image",
			"name": "cover.png",
			"mimeType": "image/png",
			"content": BASE64_STANDARD.encode(&png)
		})
	);
	let refused = |id: &str, reason: Value| {
		let mut expected = json!({ "kind": "nodeNotShown", "id": id });
		expected
			.as_object_mut()
			.expect("an object")
			.extend(reason.as_object().expect("an object").clone());
		expected
	};
	assert_eq!(
		refusal_of(view("note").await),
		refused("note", json!({ "reason": "notAnImage", "nodeKind": "sticky" }))
	);
	assert_eq!(
		refusal_of(view("lost").await),
		refused("lost", json!({ "reason": "missingFile", "file": "gone.png" }))
	);
	assert_eq!(
		refusal_of(view("huge").await),
		refused(
			"huge",
			json!({ "reason": "tooLarge", "bytes": MAX_SHOWN_IMAGE_BYTES + 1, "limit": MAX_SHOWN_IMAGE_BYTES })
		)
	);
	assert_eq!(
		refusal_of(view("escape").await),
		refused("escape", json!({ "reason": "outsideLibrary", "file": "../work/secret.png" }))
	);
	assert_eq!(
		refusal_of(view("elsewhere").await),
		refused("elsewhere", json!({ "reason": "missingFile", "file": "elsewhere.png" }))
	);
	assert_eq!(
		refusal_of(view("notes").await),
		refused("notes", json!({ "reason": "notAnImageFile", "file": "notes.md" }))
	);
	assert_eq!(
		refusal_of(view("nested").await),
		refused("nested", json!({ "reason": "notAnImageFile", "file": "other.canvas" }))
	);
	assert_eq!(
		refusal_of(view("nowhere").await),
		refused("nowhere", json!({ "reason": "unknownNode" }))
	);
}

fn a_drawn_png() -> Vec<u8> {
	let mut png = Vec::new();
	let image =
		RgbImage::from_fn(4, 4, |x, _| if x == 0 { Rgb([20, 20, 20]) } else { Rgb([255; 3]) });
	DynamicImage::ImageRgb8(image)
		.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
		.expect("the image encodes");
	png
}

async fn the_page_renders(app: &AppHandle<MockRuntime>, png: &[u8]) -> screenshot::ScreenshotJob {
	let request_id = loop {
		if let Some(id) = screenshot::screenshots(app).held().keys().next().cloned() {
			break id;
		}
		tokio::time::sleep(Duration::from_millis(5)).await;
	};
	let window = app
		.get_webview_window(&screenshot::window_label(&request_id))
		.expect("the hidden window is open");
	let job = screenshot::library_screenshot_job(window.clone()).expect("the job is handed");
	let rendered = screenshot::ScreenshotRendered::Rendered { png: BASE64_STANDARD.encode(png) };
	screenshot::library_screenshot_answer(window, request_id, rendered).expect("the answer lands");
	job
}

fn no_render_asked(app: &App<MockRuntime>) -> bool {
	screenshot::screenshots(app.handle()).held().is_empty()
}

fn a_board_target(job: &screenshot::ScreenshotJob) -> (Value, crate::board::Frame) {
	let screenshot::ScreenshotTarget::Board { canvas, frame, .. } = &job.target else {
		panic!("a board target, got {:?}", job.target);
	};
	(serde_json::from_str(canvas).expect("the canvas is JSON"), *frame)
}

fn ids_of_canvas(canvas: &Value, field: &str) -> Vec<String> {
	let mut ids: Vec<String> = canvas[field]
		.as_array()
		.expect("a list")
		.iter()
		.map(|element| element["id"].as_str().expect("an id").to_owned())
		.collect();
	ids.sort_unstable();
	ids
}

#[tokio::test]
async fn a_board_screenshot_renders_every_node_and_arrow_on_disk_framed_with_a_24_px_margin() {
	let (app, root) = a_host("screenshot-board").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let host = the_host(&app);
	let keys = ["brief", "draft", "review", "ship"];
	let nodes: Vec<Value> = keys
		.iter()
		.enumerate()
		.map(|(index, key)| a_step(key, index.checked_sub(1).map(|previous| keys[previous])))
		.collect();
	let arrows: Vec<Value> =
		keys.windows(2).map(|pair| json!({ "fromNode": pair[0], "toNode": pair[1] })).collect();
	host.served(Operation::BoardWrite, written(json!(nodes), json!(arrows))).await.expect("drawn");
	let bounds = host.served(Operation::BoardInfo, json!({ "name": BOARD })).await.expect("info")
		["bounds"]
		.clone();
	let png = a_drawn_png();

	let (answer, job) = tokio::join!(
		host.served(Operation::Screenshot, json!({ "name": BOARD, "scale": 2 })),
		the_page_renders(app.handle(), &png),
	);

	let answer = answer.expect("the board is shown");
	let (canvas, frame) = a_board_target(&job);
	let at = |field: &str| bounds[field].as_i64().expect("a bound");
	assert_eq!(job.space_id, SPACE);
	assert_eq!(job.scale, 2);
	assert_eq!(ids_of_canvas(&canvas, "nodes").len(), 4);
	assert_eq!(ids_of_canvas(&canvas, "edges").len(), 3);
	assert_eq!(
		frame,
		crate::board::Frame {
			x: at("x") - 24,
			y: at("y") - 24,
			width: at("width") + 48,
			height: at("height") + 48,
		}
	);
	assert_eq!(answer["form"], "image");
	assert_eq!(answer["mimeType"], "image/png");
	assert_eq!(answer["content"], BASE64_STANDARD.encode(&png));
	assert_eq!(answer["rendered"], json!({ "width": 4, "height": 4, "scale": 2 }));
	assert_eq!(answer["header"]["name"], BOARD);
	assert!(answer["header"]["hash"].is_string());
	assert!(no_render_asked(&app));
}

#[tokio::test]
async fn a_node_screenshot_renders_that_node_and_its_descendants_only() {
	let (app, root) = a_host("screenshot-node").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let host = the_host(&app);
	let drawn = host
		.served(
			Operation::BoardWrite,
			written(
				json!([
					{ "key": "lane", "kind": "section", "text": "Lane", "x": 0, "y": 0 },
					{ "key": "a", "kind": "shape", "text": "A", "section": "lane" },
					{ "key": "b", "kind": "shape", "text": "B", "section": "lane" },
					{ "key": "out", "kind": "shape", "text": "Out", "x": 3000, "y": 3000 }
				]),
				json!([{ "fromNode": "a", "toNode": "b" }, { "fromNode": "b", "toNode": "out" }]),
			),
		)
		.await
		.expect("drawn");
	let id = |key: &str| drawn["ids"][key].as_str().expect("an id").to_owned();
	let mut held = vec![id("lane"), id("a"), id("b")];
	held.sort_unstable();
	let png = a_drawn_png();

	let (answer, job) = tokio::join!(
		host.served(Operation::Screenshot, json!({ "name": BOARD, "id": id("lane") })),
		the_page_renders(app.handle(), &png),
	);

	answer.expect("the section is shown");
	let (canvas, frame) = a_board_target(&job);
	assert_eq!(ids_of_canvas(&canvas, "nodes"), held);
	assert_eq!(ids_of_canvas(&canvas, "edges").len(), 1);
	assert_eq!(job.scale, 1);
	assert!(frame.x + frame.width < 3000);
}

#[tokio::test]
async fn a_screenshot_of_an_absent_node_or_of_an_empty_board_is_refused_before_rendering() {
	let (app, root) = a_host("screenshot-absent-node").await;
	put(&root, SPACE, BOARD, EMPTY_BOARD);
	let host = the_host(&app);

	let empty = host.served(Operation::Screenshot, json!({ "name": BOARD })).await;
	let absent = host.served(Operation::Screenshot, json!({ "name": BOARD, "id": "ghost" })).await;
	let scale = host.served(Operation::Screenshot, json!({ "name": BOARD, "scale": 3 })).await;

	assert_eq!(refusal_of(empty), json!({ "kind": "nothingToShow" }));
	assert_eq!(
		refusal_of(absent),
		json!({
			"kind": "invalidBoardItem",
			"element": "node",
			"index": 0,
			"reason": "unknownReference",
			"reference": "ghost"
		})
	);
	assert_eq!(refusal_of(scale)["kind"], "unreadableRequest");
	assert!(no_render_asked(&app));
}

#[tokio::test]
async fn a_document_screenshot_renders_one_block_by_id_or_every_block_and_refuses_an_absent_id() {
	let (app, root) = a_host("screenshot-document").await;
	put(&root, SPACE, "notes.md", "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n");
	let host = the_host(&app);
	let ids = ids_of(&host, "notes.md").await;
	let png = a_drawn_png();

	let (one, job_of_one) = tokio::join!(
		host.served(Operation::Screenshot, json!({ "name": "notes.md", "id": ids[2] })),
		the_page_renders(app.handle(), &png),
	);
	let (whole, job_of_whole) = tokio::join!(
		host.served(Operation::Screenshot, json!({ "name": "notes.md" })),
		the_page_renders(app.handle(), &png),
	);
	let absent =
		host.served(Operation::Screenshot, json!({ "name": "notes.md", "id": "ghost" })).await;

	let blocks_of = |job: &screenshot::ScreenshotJob| match &job.target {
		screenshot::ScreenshotTarget::Document { blocks, .. } => blocks
			.iter()
			.map(|block| (block.id.clone(), block.markdown.clone()))
			.collect::<Vec<_>>(),
		board @ screenshot::ScreenshotTarget::Board { .. } => panic!("a document, got {board:?}"),
	};
	assert_eq!(blocks_of(&job_of_one), [(ids[2].clone(), "Second paragraph.".to_owned())]);
	assert_eq!(
		blocks_of(&job_of_whole).iter().map(|(id, _)| id).collect::<Vec<_>>(),
		ids.iter().collect::<Vec<_>>()
	);
	let one = one.expect("the block is shown");
	assert_eq!(one["header"]["name"], "notes.md");
	assert_eq!(one["header"]["blocks"], 3);
	assert_eq!(one["form"], "image");
	whole.expect("the document is shown");
	let absent = refusal_of(absent);
	assert_eq!((&absent["kind"], &absent["id"]), (&json!("blockNotFound"), &json!("ghost")));
	assert!(no_render_asked(&app));
}
