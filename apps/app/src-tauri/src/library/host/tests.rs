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
	crate::db::install(crate::events::core(app.handle()));
	ready(&crate::events::core(app.app_handle()).state::<db::DatabaseState>())
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

	let page = ready(&crate::events::core(app.app_handle()).state::<db::DatabaseState>())
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
	let page = ready(&crate::events::core(app.app_handle()).state::<db::DatabaseState>())
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
	ready(&crate::events::core(app.app_handle()).state::<db::DatabaseState>())
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
	let edges: Vec<Value> =
		keys.windows(2).map(|pair| json!({ "from": pair[0], "to": pair[1] })).collect();
	json!({ "name": BOARD, "nodes": nodes, "edges": edges })
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

	let added = host.served(Operation::BoardAdd, a_five_step_flow()).await.expect("drawn");
	let announced = all_of(&updates);
	let read = host.served(Operation::BoardRead, json!({ "name": BOARD })).await.expect("read");

	assert_eq!(announced.len(), 1);
	let ids: BTreeMap<String, String> =
		serde_json::from_value(added["nodes"].clone()).expect("a key map");
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
	let edges = read["edges"].as_array().expect("edges");
	assert_eq!(edges.len(), 4);
	assert!(edges
		.iter()
		.any(|edge| edge["fromNode"] == ids["brief"].as_str()
			&& edge["toNode"] == ids["draft"].as_str()));
}

#[tokio::test]
async fn a_refused_batch_leaves_the_board_byte_identical_and_announces_nothing() {
	let (app, root) = a_host("board-refused").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let state_before = open_document(app.handle(), &root, SPACE, BOARD).expect("opens").update;
	let updates = heard::<Value>(&app, events::LIBRARY_DOCUMENT_UPDATED.name());
	let batch = json!({
		"name": BOARD,
		"nodes": [
			{ "key": "fine", "kind": "text", "place": { "side": "below", "of": "a" } },
			{ "key": "wrong", "kind": "sticky", "fill": "purple" }
		],
		"edges": [{ "from": "fine", "to": "a" }]
	});

	let refused = the_host(&app).served(Operation::BoardAdd, batch).await;

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
	assert!(all_of(&updates).is_empty());
	assert_eq!(on_disk(&root, BOARD), A_BOARD_WITH_ONE_NODE);
	let state_after = open_document(app.handle(), &root, SPACE, BOARD).expect("opens").update;
	assert_eq!(state_after, state_before);
}

#[tokio::test]
async fn an_update_changes_a_node_in_place_and_a_removal_takes_its_edges_each_in_one_update() {
	let (app, root) = a_host("board-update-remove").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let host = the_host(&app);
	let batch = json!({
		"name": BOARD,
		"nodes": [{ "key": "b", "kind": "text", "text": "B", "place": { "side": "right", "of": "a" } }],
		"edges": [{ "from": "a", "to": "b" }]
	});
	let added = host.served(Operation::BoardAdd, batch).await.expect("drawn");
	let b = added["nodes"]["b"].as_str().expect("an id").to_owned();
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
			json!({ "name": BOARD, "nodes": [{ "id": "a", "text": "Brief", "y": 20 }] }),
		)
		.await
		.expect("updated");
	let announced_update = all_of(&updates);
	let unknown = host
		.served(
			Operation::BoardUpdate,
			json!({ "name": BOARD, "nodes": [{ "id": "a", "text": "No" }, { "id": "gone" }] }),
		)
		.await;
	let removed = host
		.served(Operation::BoardRemove, json!({ "name": BOARD, "ids": [b] }))
		.await
		.expect("removed");
	let announced_removal = all_of(&updates);

	assert_eq!(updated, json!({ "name": BOARD, "nodes": ["a"] }));
	assert_eq!(announced_update.len(), 1);
	board_caught_up(&editor, &announced_update);
	assert_eq!(text_of_a.get_string(&editor.transact()), "Brief");
	assert_eq!(refusal_of(unknown)["index"], 1);
	assert_eq!(announced_removal.len(), 1);
	assert_eq!(removed["nodes"], json!([b]));
	assert_eq!(removed["edges"].as_array().map(Vec::len), Some(1));
	let seen =
		serde_json::to_value(board_caught_up(&editor, &announced_removal)).expect("serializes");
	assert_eq!(seen["edges"], json!({}));
	let read = host.served(Operation::BoardRead, json!({ "name": BOARD })).await.expect("read");
	assert_eq!(read["nodes"].as_array().map(Vec::len), Some(1));
	let a = &read["nodes"][0];
	assert_eq!((&a["text"], &a["y"], &a["width"]), (&json!("Brief"), &json!(20), &json!(100)));
	assert_eq!(read["edges"], json!([]));
}

#[tokio::test(start_paused = true)]
async fn an_agent_board_seat_is_published_after_a_call_and_lapses_at_the_end_of_its_lease() {
	let (app, root) = a_host("board-presence").await;
	put(&root, SPACE, BOARD, A_BOARD_WITH_ONE_NODE);
	let presences =
		heard::<LibraryDocumentPresence>(&app, events::LIBRARY_DOCUMENT_PRESENCE.name());
	let host = the_host(&app);
	let batch = json!({
		"name": BOARD,
		"nodes": [{ "key": "b", "kind": "text", "place": { "side": "right", "of": "a" } }]
	});

	let added = host.served(Operation::BoardAdd, batch).await.expect("drawn");
	let b = added["nodes"]["b"].as_str().expect("an id").to_owned();
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
	let batch =
		json!({ "name": BOARD, "nodes": [{ "key": "b", "kind": "text", "x": 400, "y": 0 }] });
	host.served(Operation::BoardAdd, batch).await.expect("drawn");
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

	let page = ready(&crate::events::core(app.app_handle()).state::<db::DatabaseState>())
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
