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
use yrs::{Doc, GetString, IndexedSequence, ReadTxn, Text, Transact, Update};

use super::*;
use crate::agent::contract::CancelOutcome;
use crate::agent::AgentState;
use crate::conversations::contract::TranscriptMessage;
use crate::db::repositories::messages::MessagePageQuery;
use crate::library::commands::library_stop_writers;
use crate::library::contract::{
	LibraryChanged, LibraryDocumentPresence, LibraryDocumentRenamed, LibraryOverwritten,
	LibraryWriter, LibraryWriterKind,
};
use crate::library::presence::{share_caret, Presences};
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
	let app = an_app_of_its_own(&format!("library-host-{name}"), mock_builder());
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

fn caret_of_a_member(app: &App<MockRuntime>, name: &str) -> String {
	let state = open_document(app.handle(), &root(app.handle()).expect("root"), SPACE, name)
		.expect("the document opens")
		.update;
	let doc = Doc::new();
	let update = BASE64_STANDARD.decode(state).expect("base64");
	doc.transact_mut().apply_update(Update::decode_v1(&update).expect("yjs")).expect("applies");
	let text = doc.get_or_insert_text("markdown");
	let caret = text.sticky_index(&doc.transact(), 0, yrs::Assoc::After).expect("a caret");
	BASE64_STANDARD.encode(caret.encode_v1())
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
	share_caret(
		app.handle(),
		&root,
		SPACE,
		"notes.md",
		Seat::Member("u2".to_owned()),
		Some("Ana".to_owned()),
		&caret,
	)
	.expect("the member caret is published");

	the_host(&app)
		.served(Operation::Write, json!({ "name": "notes.md", "text": " Bean wrote this." }))
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
	assert_eq!(on_disk(&root, "notes.md"), "Notes. Bean wrote this.");
}

#[tokio::test]
async fn a_write_lands_in_more_than_one_update_with_the_caret_after_what_it_wrote() {
	let (app, root) = a_host("steps").await;
	put(&root, SPACE, "notes.md", "# Title\n\nEnd.");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());

	the_host(&app)
		.served(
			Operation::Write,
			json!({ "name": "notes.md", "text": "\nA paragraph.", "after": "# Title" }),
		)
		.await
		.expect("the agent writes");

	assert_eq!(on_disk(&root, "notes.md"), "# Title\nA paragraph.\n\nEnd.");
	assert!(all_of(&updates).len() > 1);
	let carets: Vec<String> = all_of(&presences)
		.into_iter()
		.filter_map(|presence| presence.writers.into_iter().next())
		.map(|writer| writer.caret)
		.collect();
	let held = Doc::new();
	let state = std::fs::read(root.join(".documents").join(SPACE).join("notes.md.yjs"))
		.expect("the shared state is stored");
	held.transact_mut().apply_update(Update::decode_v1(&state).expect("yjs")).expect("applies");
	let last = carets.last().expect("the agent caret was published");
	let caret = yrs::StickyIndex::decode_v1(&BASE64_STANDARD.decode(last).expect("base64"))
		.expect("a relative position");
	let at = caret.get_offset(&held.transact()).expect("the caret resolves").index;
	assert_eq!(at as usize, "# Title\nA paragraph.".len());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_write_interleaved_with_a_person_keeps_every_character_of_both() {
	let (app, root) = a_host("interleaved").await;
	put(&root, SPACE, "notes.md", "Base.");
	let agent_text: String = "abcdefghijklmnopqrstuvwxyz".repeat(3);
	let host = the_host(&app);
	let asked = json!({ "name": "notes.md", "text": agent_text });
	let writing = tokio::spawn(async move { host.served(Operation::Write, asked).await });
	let person = Doc::with_client_id(PERSON_CLIENT);
	let mut typed = 0;
	while !writing.is_finished() {
		tokio::time::sleep(Duration::from_millis(15)).await;
		typed += 1;
		person_typed_at_the_end(&app, &root, &person);
	}
	writing.await.expect("the write ends").expect("the agent writes");
	person_typed_at_the_end(&app, &root, &person);
	typed += 1;

	let text = on_disk(&root, "notes.md");
	assert!(typed > 2, "the person typed only {typed} times");
	assert_eq!(text.matches('#').count(), typed, "{text}");
	assert_eq!(text.len(), "Base.".len() + agent_text.len() + typed, "{text}");
	let without_the_person: String = text.chars().filter(|char| *char != '#').collect();
	assert_eq!(without_the_person, format!("Base.{agent_text}"));
}

fn person_typed_at_the_end(app: &App<MockRuntime>, root: &Path, person: &Doc) {
	let state = open_document(app.handle(), root, SPACE, "notes.md").expect("opens").update;
	let update = BASE64_STANDARD.decode(state).expect("base64");
	person.transact_mut().apply_update(Update::decode_v1(&update).expect("yjs")).expect("applies");
	let before = person.transact().state_vector();
	let text = person.get_or_insert_text("markdown");
	let mut txn = person.transact_mut();
	let end = text.get_string(&txn).len() as u32;
	text.insert(&mut txn, end, "#");
	drop(txn);
	let typed = person.transact().encode_state_as_update_v1(&before);
	apply_update(app.handle(), root, SPACE, "notes.md", &BASE64_STANDARD.encode(typed))
		.expect("the person update merges");
}

#[tokio::test]
async fn a_passage_found_zero_or_many_times_writes_nothing_says_which_and_publishes_nothing() {
	let (app, root) = a_host("passage").await;
	put(&root, SPACE, "notes.md", "one, two, two");
	let published = heard_in_order(&app);

	let missing = the_host(&app)
		.served(Operation::Write, json!({ "name": "notes.md", "text": "!", "after": "three" }))
		.await;
	let repeated = the_host(&app)
		.served(Operation::Write, json!({ "name": "notes.md", "text": "!", "after": "two" }))
		.await;

	assert_eq!(refusal_kind(missing), "passageNotFound");
	assert_eq!(refusal_kind(repeated), "passageNotUnique");
	assert_eq!(on_disk(&root, "notes.md"), "one, two, two");
	assert_eq!(all_of(&published), []);
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
	let write = |name: &str| host.served(Operation::Write, json!({ "name": name, "text": "!" }));
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
async fn a_replace_swaps_the_passage_live_and_keeps_every_other_character() {
	let (app, root) = a_host("replace").await;
	put(&root, SPACE, "notes.md", "# Draft\n\nIntro.\n\n## Plan\n\nShip it.");
	let editor = an_open_editor(&app, &root, "notes.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let host = the_host(&app);

	let retitled = host
		.served(
			Operation::Write,
			json!({ "name": "notes.md", "replace": "# Draft", "text": "# Launch plan" }),
		)
		.await
		.expect("the agent replaces");
	let added = host
		.served(
			Operation::Write,
			json!({ "name": "notes.md", "after": "Ship it.", "text": "\n\n## Risks\n\nNone." }),
		)
		.await
		.expect("the agent adds a section");

	let expected = "# Launch plan\n\nIntro.\n\n## Plan\n\nShip it.\n\n## Risks\n\nNone.";
	assert_eq!(on_disk(&root, "notes.md"), expected);
	assert_eq!(caught_up(&editor, &updates), expected);
	assert_eq!(retitled["name"], "notes.md");
	assert_eq!(added["name"], "notes.md");
	assert_eq!(
		names_in(&host.served(Operation::List, json!({})).await.expect("lists")),
		["notes.md"]
	);
}

#[tokio::test]
async fn an_empty_replacement_removes_the_passage_and_nothing_else() {
	let (app, root) = a_host("remove").await;
	put(&root, SPACE, "notes.md", "Keep. Drop this. Keep too.");
	let editor = an_open_editor(&app, &root, "notes.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());

	the_host(&app)
		.served(
			Operation::Write,
			json!({ "name": "notes.md", "replace": "Drop this. ", "text": "" }),
		)
		.await
		.expect("the agent removes");

	assert_eq!(on_disk(&root, "notes.md"), "Keep. Keep too.");
	assert_eq!(caught_up(&editor, &updates), "Keep. Keep too.");
}

#[tokio::test]
async fn a_whole_replace_leaves_one_document_under_its_name_holding_the_new_text() {
	let (app, root) = a_host("whole").await;
	put(&root, SPACE, "notes.md", "# Old\n\nOld body.");
	let editor = an_open_editor(&app, &root, "notes.md");
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let host = the_host(&app);

	let written = host
		.served(Operation::Write, json!({ "name": "notes.md", "whole": true, "text": "# New" }))
		.await
		.expect("the agent rewrites");

	assert_eq!(written["name"], "notes.md");
	assert_eq!(on_disk(&root, "notes.md"), "# New");
	assert_eq!(caught_up(&editor, &updates), "# New");
	assert_eq!(
		names_in(&host.served(Operation::List, json!({})).await.expect("lists")),
		["notes.md"]
	);
}

#[tokio::test]
async fn a_replace_of_a_passage_found_zero_or_many_times_names_the_count_and_changes_nothing() {
	let (app, root) = a_host("replace-count").await;
	put(&root, SPACE, "notes.md", "two, two, two");
	open_document(app.handle(), &root, SPACE, "notes.md").expect("opens");
	let published = heard_in_order(&app);
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let host = the_host(&app);
	let replace = |passage: &str| {
		host.served(
			Operation::Write,
			json!({ "name": "notes.md", "replace": passage, "text": "!" }),
		)
	};

	assert_eq!(refusal_of(replace("three").await), json!({ "kind": "passageNotFound" }));
	assert_eq!(
		refusal_of(replace("two").await),
		json!({ "kind": "passageNotUnique", "occurrences": 3 })
	);
	assert_eq!(on_disk(&root, "notes.md"), "two, two, two");
	assert_eq!(all_of(&published), []);
	assert_eq!(all_of(&updates), Vec::<Value>::new());
}

#[tokio::test]
async fn a_write_asking_two_placements_at_once_is_refused_and_writes_nothing() {
	let (app, root) = a_host("placements").await;
	put(&root, SPACE, "notes.md", "Base.");

	let both = the_host(&app)
		.served(
			Operation::Write,
			json!({ "name": "notes.md", "after": "Base.", "whole": true, "text": "!" }),
		)
		.await;

	assert_eq!(refusal_kind(both), "unreadableRequest");
	assert_eq!(on_disk(&root, "notes.md"), "Base.");
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
	put(&root, SPACE, "notes.md", "Base.");
	let published = heard_in_order(&app);
	let first = "abcdefghijklmnopqrstuvwxyz".repeat(2);
	let second = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(2);
	let write = |text: &str| {
		let host = the_host(&app);
		let asked = json!({ "name": "notes.md", "text": text });
		tokio::spawn(async move { host.served(Operation::Write, asked).await })
	};

	let (one, two) = tokio::join!(write(&first), write(&second));
	one.expect("the first write ends").expect("the first write lands");
	two.expect("the second write ends").expect("the second write lands");

	let text = on_disk(&root, "notes.md");
	assert!(
		[format!("Base.{first}{second}"), format!("Base.{second}{first}")].contains(&text),
		"{text}"
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
	let asked = json!({ "name": "notes.md", "text": "a".repeat(200) });
	let writing = tokio::spawn(async move { host.served(Operation::Write, asked).await });
	tokio::time::sleep(STEP_PAUSE * 3).await;

	writing.abort();
	assert!(writing.await.expect_err("the write is dropped").is_cancelled());

	let published = all_of(&published);
	let finishes: Vec<_> =
		published.iter().filter(|event| matches!(event, Published::Finished(_))).collect();
	assert_eq!(finishes, [&Published::Finished(LibraryWriteOutcome::Failed)]);
	assert_eq!(published.last(), Some(&Published::Writers(vec![])));
	assert!(on_disk(&root, "notes.md").len() < "Base.".len() + 200);
}

#[tokio::test(start_paused = true)]
async fn a_member_caret_lapses_unless_it_is_sent_again() {
	let (app, root) = a_host("lease").await;
	put(&root, SPACE, "notes.md", "Notes.");
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let caret = caret_of_a_member(&app, "notes.md");
	let member = || Seat::Member("u2".to_owned());
	let shared = || {
		share_caret(
			app.handle(),
			&root,
			SPACE,
			"notes.md",
			member(),
			Some("Ana".to_owned()),
			&caret,
		)
	};
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

#[test]
fn a_closed_window_leaves_every_document_it_stood_in() {
	let presences = Presences::default();
	let seated =
		|seat: Seat| Seated { seat, name: None, caret: String::new(), lease_ends_at: None };
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
	put(&root, SPACE, "notes.md", "Base.");
	(app, root)
}

fn writing(
	app: &App<MockRuntime>,
	bot_id: &str,
	text: String,
) -> tokio::task::JoinHandle<Result<Value, DocumentRefusal>> {
	let host = the_host_of(app, bot_id);
	let asked = json!({ "name": "notes.md", "text": text });
	tokio::spawn(async move { host.served(Operation::Write, asked).await })
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
	share_caret(
		app.handle(),
		&root,
		SPACE,
		"notes.md",
		Seat::Member("u2".to_owned()),
		Some("Ana".to_owned()),
		&caret,
	)
	.expect("the member caret is published");
	let bean = writing(&app, "b1", "a".repeat(200));
	let kit = writing(&app, "b2", "b".repeat(200));
	tokio::time::sleep(STEP_PAUSE * 3).await;

	assert_eq!(stopped(&app, None).await, CancelOutcome::Cancelled);

	let left = on_disk(&root, "notes.md");
	for write in [bean, kit] {
		let answer = write.await.expect("the write ends");
		assert_eq!(refusal_kind(answer), "stopped");
	}
	tokio::time::sleep(STEP_PAUSE * 3).await;
	assert_eq!(on_disk(&root, "notes.md"), left);
	assert!(left.len() < "Base.".len() + 400, "{left}");
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
	let asked = json!({ "name": "notes.md", "whole": true, "text": "n".repeat(200) });
	let rewriting = tokio::spawn(async move { host.served(Operation::Write, asked).await });
	tokio::time::sleep(STEP_PAUSE * 3).await;

	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::Cancelled);

	assert_eq!(refusal_kind(rewriting.await.expect("the stopped write ends")), "stopped");
	let text = on_disk(&root, "notes.md");
	assert!(text.ends_with("Base."), "{text}");
	assert!(text.matches('n').count() < 200, "{text}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_stop_of_one_agent_leaves_the_other_of_the_same_conversation_writing_to_its_last_step() {
	let (app, root) = two_agents_writing("stop-one").await;
	let finishes = heard::<LibraryDocumentWriterFinished>(
		&app,
		events::LIBRARY_DOCUMENT_WRITER_FINISHED.name(),
	);
	let bean = writing(&app, "b1", "a".repeat(200));
	let kit = writing(&app, "b2", "b".repeat(200));
	tokio::time::sleep(STEP_PAUSE * 3).await;

	assert_eq!(stopped(&app, Some("b9")).await, CancelOutcome::NothingToCancel);
	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::Cancelled);

	assert_eq!(refusal_kind(bean.await.expect("the stopped write ends")), "stopped");
	kit.await.expect("the other write ends").expect("the other write lands");
	let text = on_disk(&root, "notes.md");
	assert_eq!(text.matches('b').count(), 200, "{text}");
	assert!(text.matches('a').count() < 200, "{text}");
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
	let running = writing(&app, "b1", "a".repeat(200));
	tokio::time::sleep(STEP_PAUSE * 3).await;
	let queued = writing(&app, "b1", "b".repeat(200));
	enlisted_by(&app, "b1", 2).await;

	assert_eq!(stopped(&app, None).await, CancelOutcome::Cancelled);

	assert!(running.is_finished() && queued.is_finished(), "the stop answered before both left");
	for write in [running, queued] {
		assert_eq!(refusal_kind(write.await.expect("the write ends")), "stopped");
	}
	let text = on_disk(&root, "notes.md");
	assert!(!text.contains('b'), "{text}");
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
	let interrupted = writing(&app, "b1", "a".repeat(200));
	enlisted_by(&app, "b1", 1).await;
	assert_eq!(stopped(&app, Some("b1")).await, CancelOutcome::Cancelled);
	assert_eq!(refusal_kind(interrupted.await.expect("the stopped write ends")), "stopped");

	writing(&app, "b1", "b".repeat(200))
		.await
		.expect("the new write ends")
		.expect("the new write lands");

	let text = on_disk(&root, "notes.md");
	assert_eq!(text.matches('b').count(), 200, "{text}");
}
