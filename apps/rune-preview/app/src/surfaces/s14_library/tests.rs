use std::fs::File;
use std::path::PathBuf;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use kiroshi_core::library::contract::{
	LibraryChanged, LibraryDocumentPresence, LibraryDocumentRenamed, LibraryDocumentState,
	LibraryDocumentUpdated, LibraryError, LibraryImport, LibraryItem, LibraryItemKind,
	LibraryPresenceAt, LibraryWriter, LibraryWriterKind,
};
use serde_json::json;
use yrs::{Doc, ReadTxn, Text, Transact};

use kiroshi_rune_kit::surfaces::s14_library::{
	BlockEvent, DOCUMENT_PANEL_MAX_WIDTH, DOCUMENT_PANEL_MIN_WIDTH, DocumentPanelEvent, ItemAction,
	ItemEvent, LibraryEvent, NewDocumentEvent, NewDocumentTemplate,
};

use super::blocks::{self, Format};
use super::document::Phase;
use super::imports::{self, HOSTED_LIMIT, JOINED_LIMIT};
use super::session::Session;
use super::worker::{Answer, Call, Target, free_name};
use super::{Dialog, Heard, Listing, Shown, State, heard_of};
use crate::host::HostError;

const SPACE: &str = "space-1";

fn state_of(markdown: &str) -> String {
	let doc = Doc::new();
	let text = doc.get_or_insert_text("markdown");
	text.insert(&mut doc.transact_mut(), 0, markdown);
	BASE64_STANDARD.encode(doc.transact().encode_state_as_update_v1(&yrs::StateVector::default()))
}

fn item(name: &str, kind: LibraryItemKind) -> LibraryItem {
	LibraryItem {
		name: name.to_owned(),
		kind,
		path: name.to_owned(),
		bytes: 120,
		modified_at: 0,
		created_at: None,
	}
}

fn target(name: &str) -> Target {
	Target { space_id: SPACE.to_owned(), name: name.to_owned() }
}

fn refused() -> HostError {
	HostError::CommandFailed { command: "library".to_owned(), status: 500, body: "{}".to_owned() }
}

fn no_image(_: &[u8]) -> Option<rune::image::Image> {
	None
}

fn answer(state: &mut State, answer: Answer) {
	state.answered(answer, &no_image);
}

fn calls(state: &mut State) -> Vec<Call> {
	std::mem::take(&mut state.queued)
}

fn library_with(items: Vec<LibraryItem>) -> State {
	let mut state = State::default();
	state.enter_space(SPACE, false);
	state.show_library();
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items: Ok(items) });
	calls(&mut state);
	state
}

fn opened_document(name: &str, markdown: &str) -> State {
	opened_from(name, &state_of(markdown))
}

fn opened_from(name: &str, initial: &str) -> State {
	let mut state = library_with(vec![item(name, LibraryItemKind::Document)]);
	state.handle_library(LibraryEvent::Open(name.to_owned()));
	calls(&mut state);
	let opened = LibraryDocumentState { name: name.to_owned(), update: initial.to_owned() };
	answer(&mut state, Answer::Opened { target: target(name), state: Ok(opened) });
	state
}

fn shown_markdown(state: &State) -> Option<String> {
	state.shown_document().and_then(|document| document.session()).map(Session::markdown)
}

fn first_block(state: &State) -> String {
	state.shown_document().expect("an open document").blocks[0].id.clone()
}

fn saved_markdown(initial: &str, calls: &[Call]) -> String {
	let mut session = Session::opened(initial).expect("a session");
	for call in calls {
		if let Call::Apply { update, .. } = call {
			session.received(update).expect("an update the session applies");
		}
	}
	session.markdown()
}

fn type_into(state: &mut State, block: &str, text: &str) {
	state.field_mut(false, block, 0).replace_text(text);
	state.handle_block(false, BlockEvent::Typed { block: block.to_owned(), field: 0 });
}

#[test]
fn the_library_shows_the_skeleton_then_the_grid_of_the_space_items() {
	let mut state = State::default();
	state.enter_space(SPACE, false);

	state.show_library();
	let is_loading = matches!(state.listing, Listing::Loading);
	let listed = calls(&mut state);
	let items = vec![
		item("brief.md", LibraryItemKind::Document),
		item("dunes.png", LibraryItemKind::Image),
		item("plan.canvas", LibraryItemKind::Board),
	];
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items: Ok(items) });

	assert!(is_loading);
	assert_eq!(listed, vec![Call::List { space_id: SPACE.to_owned() }]);
	let names: Vec<&str> = state.items().iter().map(|item| item.name.as_str()).collect();
	assert_eq!(names, ["brief.md", "dunes.png"]);
	assert_eq!(
		calls(&mut state),
		vec![Call::Excerpt(target("brief.md")), Call::Thumbnail(target("dunes.png"))]
	);
}

#[test]
fn an_empty_space_lists_no_item_and_a_failure_offers_a_retry() {
	let empty = library_with(Vec::new());
	let mut failed = State::default();
	failed.enter_space(SPACE, false);
	failed.show_library();
	answer(&mut failed, Answer::Listed { space_id: SPACE.to_owned(), items: Err(refused()) });
	let has_failed = matches!(failed.listing, Listing::Failed);
	calls(&mut failed);

	failed.retry_list();

	assert!(matches!(empty.listing, Listing::Loaded(ref items) if items.is_empty()));
	assert!(has_failed);
	assert!(matches!(failed.listing, Listing::Loading));
	assert_eq!(calls(&mut failed), vec![Call::List { space_id: SPACE.to_owned() }]);
}

#[test]
fn a_document_opens_in_the_block_editor_from_a_click_or_its_menu() {
	let mut clicked = library_with(vec![item("brief.md", LibraryItemKind::Document)]);
	let mut chosen = library_with(vec![item("brief.md", LibraryItemKind::Document)]);

	clicked.handle_library(LibraryEvent::Open("brief.md".to_owned()));
	chosen.act("brief.md", ItemAction::Open);

	for state in [&mut clicked, &mut chosen] {
		assert!(
			matches!(&state.shown, Some(Shown::Document(document)) if matches!(document.phase, Phase::Opening))
		);
		assert_eq!(calls(state), vec![Call::Open(target("brief.md"))]);
	}
	let state = opened_document("brief.md", "# Brief\n\nOne line.");
	assert_eq!(shown_markdown(&state).as_deref(), Some("# Brief\n\nOne line."));
	assert_eq!(state.shown_document().map(|document| document.fields.len()), Some(2));
}

#[test]
fn an_image_opens_in_the_lightbox_from_a_click_or_its_menu() {
	let images = || {
		vec![item("dunes.png", LibraryItemKind::Image), item("fern.png", LibraryItemKind::Image)]
	};
	let mut clicked = library_with(images());
	let mut chosen = library_with(images());

	clicked.handle_library(LibraryEvent::Open("dunes.png".to_owned()));
	chosen.act("dunes.png", ItemAction::Open);

	for state in [&mut clicked, &mut chosen] {
		assert!(
			matches!(&state.shown, Some(Shown::Image(lightbox)) if lightbox.name == "dunes.png")
		);
		assert_eq!(calls(state), vec![Call::Image(target("dunes.png"))]);
	}
	clicked.handle_lightbox(kiroshi_rune_kit::surfaces::s14_library::LightboxEvent::Next);
	assert!(matches!(&clicked.shown, Some(Shown::Image(lightbox)) if lightbox.name == "fern.png"));
}

#[test]
fn open_in_new_tab_shows_the_item_once_the_library_lists_it() {
	let mut state = library_with(Vec::new());

	state.act("brief.md", ItemAction::OpenInNewTab);
	let before = state.shown.is_some();
	let relisted = calls(&mut state);
	let items = Ok(vec![item("brief.md", LibraryItemKind::Document)]);
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items });

	assert!(!before);
	assert_eq!(relisted, vec![Call::List { space_id: SPACE.to_owned() }]);
	assert!(
		matches!(&state.shown, Some(Shown::Document(document)) if document.target.name == "brief.md")
	);
	assert!(state.take_library_wish());
}

#[test]
fn open_in_new_tab_names_an_item_the_library_no_longer_lists() {
	let mut state = library_with(Vec::new());

	state.act("gone.md", ItemAction::OpenInNewTab);
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items: Ok(Vec::new()) });

	assert!(state.shown.is_none());
	assert!(state.notice.is_some());
	assert!(!state.take_library_wish());
}

#[test]
fn a_document_opened_from_a_thread_takes_the_widest_room_then_the_width_last_dragged() {
	let mut state = library_with(Vec::new());

	state.open_beside("brief.md");
	let widest = (state.panel_width(10_000.0), state.panel_width(700.0));
	state.dragged_panel(DOCUMENT_PANEL_MIN_WIDTH + 40.0);

	assert!(state.beside.is_some());
	assert_eq!(calls(&mut state), vec![Call::Open(target("brief.md"))]);
	assert_eq!(widest, (DOCUMENT_PANEL_MAX_WIDTH, 700.0));
	assert_eq!(state.panel_width(10_000.0), DOCUMENT_PANEL_MIN_WIDTH + 40.0);
}

#[test]
fn open_in_library_closes_the_panel_and_shows_the_document_in_its_tab() {
	let mut state = library_with(Vec::new());
	state.open_beside("brief.md");
	calls(&mut state);

	state.handle_panel(DocumentPanelEvent::OpenInLibrary);

	assert!(state.beside.is_none());
	assert!(
		matches!(&state.shown, Some(Shown::Document(document)) if document.target.name == "brief.md")
	);
	assert!(state.take_library_wish());
	assert!(!calls(&mut state).iter().any(|call| matches!(call, Call::Share { .. })));
}

#[test]
fn closing_or_switching_the_panel_stops_listening_to_the_previous_document() {
	let mut state = library_with(Vec::new());
	state.open_beside("brief.md");
	calls(&mut state);

	state.open_beside("notes.md");
	let switched = calls(&mut state);
	state.handle_panel(DocumentPanelEvent::Close);
	let closed = calls(&mut state);

	assert_eq!(
		switched,
		vec![Call::Share { target: target("brief.md"), at: None }, Call::Open(target("notes.md")),]
	);
	assert_eq!(closed, vec![Call::Share { target: target("notes.md"), at: None }]);
	assert!(state.beside.is_none());
}

#[test]
fn an_edit_saves_a_markdown_document_with_its_block_markers() {
	let initial = state_of("First line.\n\n- one\n- two");
	let mut state = opened_from("brief.md", &initial);
	let block = first_block(&state);

	type_into(&mut state, &block, "First line, edited.");
	let sent = calls(&mut state);

	let saved = saved_markdown(&initial, &sent);
	let ids: Vec<String> = state
		.shown_document()
		.expect("an open document")
		.blocks
		.iter()
		.map(|block| block.id.clone())
		.collect();
	assert_eq!(saved, format!("First line, edited. ^{}\n\n- one\n- two\n\n^{}", ids[0], ids[1]));
	assert!(
		matches!(sent.as_slice(), [Call::Apply { target: sent, .. }] if *sent == target("brief.md"))
	);
}

#[test]
fn an_edit_saves_a_plain_document_with_no_block_marker() {
	let initial = state_of("First line ^abc123\n\nSecond line.");
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);

	type_into(&mut state, &block, "First line, edited.");

	assert_eq!(saved_markdown(&initial, &calls(&mut state)), "First line, edited.\n\nSecond line.");
}

#[test]
fn existing_markers_keep_their_ids_and_their_place() {
	let markdown = "# Brief ^head01\n\n```ts\nship()\n```\n\n^code01\n\nTail.";

	let parsed = blocks::blocks_of(markdown, &[]);

	let ids: Vec<&str> = parsed.iter().map(|block| block.id.as_str()).collect();
	assert_eq!(&ids[..2], ["head01", "code01"]);
	assert_eq!(blocks::markdown_of(&parsed, Format::Markdown), format!("{markdown} ^{}", ids[2]));
	assert_eq!(
		blocks::markdown_of(&parsed, Format::Plain),
		"# Brief\n\n```ts\nship()\n```\n\nTail."
	);
}

#[test]
fn enter_continues_a_list_and_backspace_removes_an_empty_row() {
	let initial = state_of("- one");
	let mut state = opened_from("list.md", &initial);
	let block = first_block(&state);

	state.handle_block(false, BlockEvent::Enter { block: block.clone(), field: 0 });
	let rows = state.shown_document().map(|document| document.fields.len());
	let is_handled =
		state.handle_block(false, BlockEvent::Backspace { block: block.clone(), field: 1 });

	assert_eq!(rows, Some(2));
	assert!(is_handled);
	assert_eq!(saved_markdown(&initial, &calls(&mut state)), format!("- one\n\n^{block}"));
}

#[test]
fn new_document_with_a_template_creates_the_document_then_opens_it() {
	let mut state = library_with(Vec::new());
	state.handle_library(LibraryEvent::NewDocument);
	state.handle_new_document(NewDocumentEvent::Select(NewDocumentTemplate::MeetingNotes));

	state.handle_new_document(NewDocumentEvent::Create(NewDocumentTemplate::MeetingNotes));
	let created = calls(&mut state);
	let item = item("Meeting notes.md", LibraryItemKind::Document);
	answer(&mut state, Answer::Created { space_id: SPACE.to_owned(), item: Ok(item) });

	assert!(
		matches!(created.as_slice(), [Call::Create(new)] if new.title == "Meeting notes" && new.body.contains("## Decisions"))
	);
	assert!(state.dialog.is_none());
	assert!(
		matches!(&state.shown, Some(Shown::Document(document)) if document.target.name == "Meeting notes.md")
	);
	assert_eq!(
		calls(&mut state),
		vec![Call::Open(target("Meeting notes.md")), Call::List { space_id: SPACE.to_owned() },]
	);
	assert_eq!(free_name("Untitled", 2), "Untitled 2.md");
}

#[test]
fn an_unchanged_rename_or_an_unconfirmed_delete_makes_no_core_call() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);

	state.confirm_title();
	state.act("brief.md", ItemAction::Delete);
	state.confirm_delete(false);

	assert!(calls(&mut state).is_empty());
	assert!(state.dialog.is_none());
}

#[test]
fn a_changed_title_renames_and_a_confirmed_delete_deletes() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);

	state.title_mut().replace_text("Launch brief");
	state.confirm_title();
	state.act("brief.md", ItemAction::Delete);
	state.confirm_delete(true);

	assert_eq!(
		calls(&mut state),
		vec![
			Call::Rename { target: target("brief.md"), new_name: "Launch brief.md".to_owned() },
			Call::Delete(target("brief.md")),
		]
	);
}

#[test]
fn a_refused_save_raises_a_notice_and_reads_the_document_back() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);

	answer(&mut state, Answer::Applied { target: target("brief.md"), outcome: Err(refused()) });

	assert!(state.notice.is_some());
	assert_eq!(calls(&mut state), vec![Call::Open(target("brief.md"))]);
}

#[test]
fn a_refused_rename_puts_the_title_back_and_a_refused_delete_keeps_the_item() {
	let mut state = opened_document("brief.md", "Body.");
	state.title_mut().replace_text("Launch brief");
	state.confirm_title();
	state.act("brief.md", ItemAction::Delete);
	state.confirm_delete(true);
	calls(&mut state);

	answer(&mut state, Answer::Renamed { target: target("brief.md"), item: Err(refused()) });
	let title = state.shown_document().map(|document| document.title.text.clone());
	answer(&mut state, Answer::Deleted { target: target("brief.md"), outcome: Err(refused()) });

	assert_eq!(title.as_deref(), Some("brief"));
	assert!(matches!(state.dialog, Some(Dialog::Delete { has_failed: true, .. })));
	assert!(state.shown.is_some());
	assert!(state.notice.is_some());
}

#[test]
fn a_drop_checks_the_size_limits_then_lists_each_import_and_names_each_refusal() {
	let folder = std::env::temp_dir().join(format!("s14-drop-{}", uuid::Uuid::new_v4()));
	std::fs::create_dir_all(&folder).expect("a scratch folder");
	let small = folder.join("small.png");
	let large = folder.join("large.png");
	File::create(&small).expect("a small file");
	File::create(&large).and_then(|file| file.set_len(HOSTED_LIMIT + 1)).expect("a large file");
	let mut state = library_with(Vec::new());

	state.dropped(&[small.clone(), large]);
	let importing = state.importing.clone();
	let refusal = state.notice.clone().map(|notice| notice.description);
	let sent = calls(&mut state);
	let error = LibraryError::Unsupported { name: "small.png".to_owned() };
	let imports = Ok(vec![LibraryImport::Refused { error }]);
	answer(
		&mut state,
		Answer::Imported { space_id: SPACE.to_owned(), paths: vec![small.clone()], imports },
	);
	std::fs::remove_dir_all(&folder).expect("the scratch folder removed");

	assert_eq!(importing, ["small.png"]);
	assert!(refusal.is_some_and(|line| line.starts_with("large.png: ")));
	assert_eq!(sent, vec![Call::Import { space_id: SPACE.to_owned(), paths: vec![small] }]);
	assert!(state.importing.is_empty());
	assert!(state.notice.is_some_and(|notice| notice.title.contains("small.png")));
}

#[test]
fn a_joined_space_takes_eight_mebibytes_and_a_hosted_one_twenty() {
	let sized = |bytes: u64| vec![(PathBuf::from("photo.png"), Ok(bytes))];

	let joined = imports::screened(sized(JOINED_LIMIT + 1), imports::limit_of(true));
	let hosted = imports::screened(sized(JOINED_LIMIT + 1), imports::limit_of(false));

	assert_eq!((joined.admitted.len(), joined.refused.len()), (0, 1));
	assert_eq!((hosted.admitted.len(), hosted.refused.len()), (1, 0));
	assert_eq!((JOINED_LIMIT, HOSTED_LIMIT), (8 * 1024 * 1024, 20 * 1024 * 1024));
}

fn agent_writer(anchor: String) -> LibraryWriter {
	LibraryWriter {
		id: "atlas".to_owned(),
		kind: LibraryWriterKind::Agent,
		name: Some("Atlas".to_owned()),
		hue: None,
		at: LibraryPresenceAt::Text { anchor },
	}
}

#[test]
fn an_agent_writing_the_open_document_lands_live_and_shows_as_a_writer() {
	let initial = state_of("Body.");
	let mut state = opened_from("brief.md", &initial);
	calls(&mut state);
	let mut agent = Session::opened(&initial).expect("the agent session");
	let update = agent.edited("Body.\n\nAn agent sentence.").expect("an agent update");

	state.heard(Heard::Updated(LibraryDocumentUpdated {
		space_id: SPACE.to_owned(),
		name: "brief.md".to_owned(),
		update,
	}));
	state.heard(Heard::Presence(LibraryDocumentPresence {
		space_id: SPACE.to_owned(),
		name: "brief.md".to_owned(),
		writers: vec![agent_writer(String::new())],
	}));
	state.stop_all(false);

	assert_eq!(shown_markdown(&state).as_deref(), Some("Body.\n\nAn agent sentence."));
	assert_eq!(state.shown_document().map(|document| document.agents().count()), Some(1));
	assert_eq!(calls(&mut state), vec![Call::Stop(target("brief.md"))]);
}

#[test]
fn a_library_or_title_change_refreshes_without_closing_the_open_document() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);

	state.heard(Heard::Changed(LibraryChanged { space_id: SPACE.to_owned(), overwritten: None }));
	state.heard(Heard::Renamed(LibraryDocumentRenamed {
		space_id: SPACE.to_owned(),
		former_name: "brief.md".to_owned(),
		name: "Launch brief.md".to_owned(),
	}));

	let document = state.shown_document().expect("the document stays open");
	assert_eq!(document.target.name, "Launch brief.md");
	assert_eq!(document.title.text, "Launch brief");
	assert_eq!(
		calls(&mut state),
		vec![Call::List { space_id: SPACE.to_owned() }, Call::List { space_id: SPACE.to_owned() },]
	);
}

#[test]
fn the_library_events_are_read_and_others_are_left() {
	let changed = heard_of("library://changed", json!({ "spaceId": SPACE }));

	assert!(matches!(changed, Some(Ok(Heard::Changed(_)))));
	assert!(heard_of("conversation://message-stored", json!({})).is_none());
}

#[test]
fn closing_the_shown_document_returns_to_the_grid() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);

	state.handle_document_bar(ItemEvent::Back);

	assert!(state.shown.is_none());
	assert_eq!(
		calls(&mut state),
		vec![
			Call::Share { target: target("brief.md"), at: None },
			Call::List { space_id: SPACE.to_owned() },
		]
	);
}
