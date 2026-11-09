use std::fs::File;
use std::path::PathBuf;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use kiroshi_core::library::contract::{
	LibraryChanged, LibraryDocumentPresence, LibraryDocumentRenamed, LibraryDocumentState,
	LibraryDocumentUpdated, LibraryDocumentWriterFinished, LibraryError, LibraryImport,
	LibraryItem, LibraryItemKind, LibraryPresenceAt, LibraryWriteOutcome, LibraryWriter,
	LibraryWriterKind,
};
use serde::Serialize;
use serde_json::json;
use yrs::{Doc, ReadTxn, Text, Transact};

use kiroshi_rune_kit::surfaces::s14_library::{
	BlockEvent, BlockMenuAction, DOCUMENT_PANEL_MIN_WIDTH, DOCUMENT_PANEL_OPENING_WIDTH,
	DocumentPanelEvent, Format as Toolbar, GalleryEvent, HandleEvent, ImageMenu, ItemAction,
	ItemEvent, LibraryBlockType, LibraryEvent, LightboxEvent, LinkEvent, MORE_KEY,
	NewDocumentEvent, NewDocumentTemplate, TableEvent, panel_max_width, tile_more_key,
};

use super::blocks::{self, Format};
use super::document::Phase;
use super::editing::SEND_INTERVAL;
use super::imports::{self, HOSTED_LIMIT, JOINED_LIMIT};
use super::item_menu::MenuPlace;
use super::rich::GalleryAdd;
use super::session::Session;
use super::worker::{Answer, Call, Due, Target, free_name};
use kiroshi_rune_kit::surfaces::s14_library::THREAD_MIN_WIDTH;

use super::{Dialog, Heard, Listing, Shown, State, heard_of};
use crate::app::{App, Person, Ready, Workspace};
use crate::events::{HostEvent, parsed};
use crate::host::{Host, HostError};
use crate::model;
use crate::source::Source;

const SPACE: &str = "space-1";

const NOW: i64 = 1_794_139_200_000;

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

fn flush_due(state: &mut State) {
	answer(state, Answer::Due(Due::Flush));
}

fn applies(calls: &[Call]) -> usize {
	calls.iter().filter(|call| matches!(call, Call::Apply { .. })).count()
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
	clicked.handle_lightbox(LightboxEvent::Next);
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
	assert!(!state.to_raise.is_empty());
	assert!(!state.take_library_wish());
}

#[test]
fn a_document_opened_from_a_thread_takes_the_widest_room_then_the_width_last_dragged() {
	let mut state = library_with(Vec::new());

	state.open_beside("brief.md");
	let widest = (state.panel_width(10_000.0), state.panel_width(1_000.0));
	state.dragged_panel(DOCUMENT_PANEL_MIN_WIDTH + 40.0);

	assert!(state.beside.is_some());
	assert_eq!(calls(&mut state), vec![Call::Open(target("brief.md"))]);
	assert_eq!(widest, (DOCUMENT_PANEL_OPENING_WIDTH, 680.0));
	assert_eq!(state.panel_width(10_000.0), DOCUMENT_PANEL_MIN_WIDTH + 40.0);
}

#[test]
fn the_panel_leaves_the_thread_its_320_unless_the_panel_would_fall_under_its_floor() {
	let mut state = library_with(Vec::new());
	state.open_beside("brief.md");

	assert_eq!(state.panel_width(1_000.0), 680.0);
	assert_eq!(
		state.panel_width(THREAD_MIN_WIDTH + DOCUMENT_PANEL_MIN_WIDTH),
		DOCUMENT_PANEL_MIN_WIDTH
	);
	assert_eq!(state.panel_width(600.0), DOCUMENT_PANEL_MIN_WIDTH);
	assert_eq!(
		state.panel_width(THREAD_MIN_WIDTH + DOCUMENT_PANEL_OPENING_WIDTH + 1.0),
		DOCUMENT_PANEL_OPENING_WIDTH
	);

	state.dragged_panel(DOCUMENT_PANEL_OPENING_WIDTH);
	assert_eq!(state.panel_width(1_000.0), 680.0);
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
	flush_due(&mut state);
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
	assert_eq!(applies(&sent), 1);
	assert!(
		sent.iter().any(
			|call| matches!(call, Call::Apply { target: to, .. } if *to == target("brief.md"))
		)
	);
}

#[test]
fn an_edit_saves_a_plain_document_with_no_block_marker() {
	let initial = state_of("First line ^abc123\n\nSecond line.");
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);

	type_into(&mut state, &block, "First line, edited.");
	flush_due(&mut state);

	assert_eq!(saved_markdown(&initial, &calls(&mut state)), "First line, edited.\n\nSecond line.");
}

#[test]
fn existing_markers_keep_their_ids_and_their_place() {
	let markdown = "# Brief ^head01\n\n```ts\nship()\n```\n\n^code01\n\nTail.";

	let parsed = blocks::blocks_of(markdown, &[]);

	let ids: Vec<&str> = parsed.iter().map(|block| block.id.as_str()).collect();
	assert_eq!(&ids[..2], ["head01", "code01"]);
	assert_eq!(
		blocks::markdown_of("", &parsed, Format::Markdown),
		format!("{markdown} ^{}", ids[2])
	);
	assert_eq!(
		blocks::markdown_of("", &parsed, Format::Plain),
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
	state.handle_new_document(NewDocumentEvent::Select(NewDocumentTemplate::MeetingNotes), NOW);

	state.handle_new_document(NewDocumentEvent::Create(NewDocumentTemplate::MeetingNotes), NOW);
	let created = calls(&mut state);
	let item = item("Meeting notes.md", LibraryItemKind::Document);
	answer(&mut state, Answer::Created { space_id: SPACE.to_owned(), item: Ok(item) });

	assert!(
		matches!(created.as_slice(), [Call::Create(new)] if new.title == "Meeting notes, 8 November" && new.body.contains("## Decisions"))
	);
	assert!(state.dialog.is_none());
	assert!(
		matches!(&state.shown, Some(Shown::Document(document)) if document.target.name == "Meeting notes.md")
	);
	assert_eq!(
		calls(&mut state),
		vec![Call::Open(target("Meeting notes.md")), Call::List { space_id: SPACE.to_owned() },]
	);
	assert_eq!(free_name("Untitled", 2, ".md"), "Untitled 2.md");
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

	assert!(!state.to_raise.is_empty());
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
	assert!(!state.to_raise.is_empty());
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
	let refusal = state.to_raise.first().and_then(|notice| notice.description.clone());
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
	assert!(state.to_raise.last().is_some_and(|notice| notice.title.contains("small.png")));
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

	state.heard(
		Heard::Updated(LibraryDocumentUpdated {
			space_id: SPACE.to_owned(),
			name: "brief.md".to_owned(),
			update,
		}),
		NOW,
	);
	state.heard(
		Heard::Presence(LibraryDocumentPresence {
			space_id: SPACE.to_owned(),
			name: "brief.md".to_owned(),
			writers: vec![agent_writer(String::new())],
		}),
		NOW,
	);
	state.stop_all(false);

	assert_eq!(shown_markdown(&state).as_deref(), Some("Body.\n\nAn agent sentence."));
	assert_eq!(state.shown_document().map(|document| document.agents().count()), Some(1));
	assert_eq!(calls(&mut state), vec![Call::Stop(target("brief.md"))]);
}

#[test]
fn a_library_or_title_change_refreshes_without_closing_the_open_document() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);

	state.heard(
		Heard::Changed(LibraryChanged { space_id: SPACE.to_owned(), overwritten: None }),
		NOW,
	);
	state.heard(
		Heard::Renamed(LibraryDocumentRenamed {
			space_id: SPACE.to_owned(),
			former_name: "brief.md".to_owned(),
			name: "Launch brief.md".to_owned(),
		}),
		NOW,
	);

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

#[test]
fn ten_keystrokes_inside_the_send_interval_make_one_write() {
	let initial = state_of("Draft.");
	let mut state = opened_from("brief.md", &initial);
	calls(&mut state);
	let block = first_block(&state);

	for count in 1..=10 {
		type_into(&mut state, &block, &format!("Draft{}", ".".repeat(count)));
	}
	let typed = calls(&mut state);
	flush_due(&mut state);
	let flushed = calls(&mut state);

	assert_eq!(typed, vec![Call::Wake(SEND_INTERVAL, Due::Flush)]);
	assert_eq!(applies(&flushed), 1);
	assert_eq!(saved_markdown(&initial, &flushed), format!("Draft.......... ^{block}"));
}

#[test]
fn a_close_mid_batch_still_writes_the_pending_edit() {
	let initial = state_of("Draft.");
	let mut state = opened_from("brief.md", &initial);
	let block = first_block(&state);
	type_into(&mut state, &block, "Draft, closed.");
	calls(&mut state);

	state.handle_document_bar(ItemEvent::Back);
	let closed = calls(&mut state);
	flush_due(&mut state);

	assert!(matches!(closed.first(), Some(Call::Apply { .. })));
	assert!(closed.contains(&Call::Share { target: target("brief.md"), at: None }));
	assert_eq!(saved_markdown(&initial, &closed), format!("Draft, closed. ^{block}"));
	assert!(calls(&mut state).is_empty());
}

#[test]
fn a_panel_switch_or_a_space_change_mid_batch_writes_the_pending_edit() {
	let initial = state_of("Beside.");
	let mut state = library_with(Vec::new());
	state.open_beside("notes.md");
	let opened = LibraryDocumentState { name: "notes.md".to_owned(), update: initial.clone() };
	answer(&mut state, Answer::Opened { target: target("notes.md"), state: Ok(opened) });
	let block = state.beside.as_ref().expect("the panel document").blocks[0].id.clone();
	state.field_mut(true, &block, 0).replace_text("Beside, switched.");
	state.handle_block(true, BlockEvent::Typed { block: block.clone(), field: 0 });
	calls(&mut state);

	state.open_beside("other.md");
	let switched = calls(&mut state);
	let mut moved = opened_document("brief.md", "Body.");
	let moved_block = first_block(&moved);
	type_into(&mut moved, &moved_block, "Body, moved.");
	calls(&mut moved);
	moved.enter_space("space-2", false);

	assert_eq!(saved_markdown(&initial, &switched), format!("Beside, switched. ^{block}"));
	assert_eq!(applies(&calls(&mut moved)), 1);
}

#[test]
fn enter_and_a_backspace_merge_flush_the_pending_edit_with_them() {
	let initial = state_of("One.\n\nTwo.");
	let mut state = opened_from("notes.txt", &initial);
	let (first, second) = {
		let blocks = &state.shown_document().expect("an open document").blocks;
		(blocks[0].id.clone(), blocks[1].id.clone())
	};
	type_into(&mut state, &first, "One, typed.");
	calls(&mut state);

	state.handle_block(false, BlockEvent::Enter { block: first.clone(), field: 0 });
	let entered = calls(&mut state);
	state.field_mut(false, &second, 0).replace_text("");
	state.handle_block(false, BlockEvent::Typed { block: second.clone(), field: 0 });
	state.handle_block(false, BlockEvent::Backspace { block: second, field: 0 });
	let merged = calls(&mut state);

	assert_eq!(applies(&entered), 1);
	assert_eq!(saved_markdown(&initial, &entered), "One, typed.\n\n\n\nTwo.");
	assert_eq!(applies(&merged), 1);
}

#[test]
fn open_then_save_with_no_edit_leaves_a_markdown_document_unchanged() {
	let markdown = "\n\n# Plan ^head01\n\nBody line. ^body01\n";
	let mut state = opened_document("plan.md", markdown);
	calls(&mut state);

	flush_due(&mut state);
	let saved = state.shown_document().map(|document| document.markdown());
	state.handle_document_bar(ItemEvent::Back);

	assert_eq!(saved.as_deref(), Some(markdown));
	assert_eq!(applies(&calls(&mut state)), 0);
}

#[test]
fn open_then_save_with_no_edit_leaves_a_plain_document_unchanged() {
	let text = "\n\n\nFirst line.\n\nSecond line.\n";
	let mut state = opened_document("notes.txt", text);
	calls(&mut state);

	flush_due(&mut state);
	let saved = state.shown_document().map(|document| document.markdown());
	state.handle_document_bar(ItemEvent::Back);

	assert_eq!(saved.as_deref(), Some(text));
	assert_eq!(applies(&calls(&mut state)), 0);
}

#[test]
fn meeting_notes_carry_the_date_in_their_title() {
	assert_eq!(super::meeting_notes_title(NOW), "Meeting notes, 8 November");
	assert_eq!(super::meeting_notes_title(0), "Meeting notes, 1 January");
}

#[test]
fn the_slash_menu_turns_the_block_into_the_chosen_type() {
	let initial = state_of("Intro");
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);
	state.field_mut(false, &block, 0).set_caret(5);

	state.handle_block(false, BlockEvent::SlashOpened { block: block.clone(), field: 0 });
	let edit = state.field_mut(false, &block, 0);
	edit.replace_text("Intro/hea");
	edit.set_caret(9);
	state.handle_block(false, BlockEvent::Typed { block: block.clone(), field: 0 });
	let query = state.slash_query();
	let is_handled = state.handle_block(false, BlockEvent::SlashConfirmed);

	assert_eq!(query.as_deref(), Some("hea"));
	assert!(is_handled);
	assert!(state.slash.is_none());
	assert_eq!(saved_markdown(&initial, &calls(&mut state)), "# Intro");
}

#[test]
fn the_format_toolbar_marks_the_selection_and_turns_a_block_into_a_list() {
	let initial = state_of("Ship today");
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);
	let edit = state.field_mut(false, &block, 0);
	edit.focused = true;
	edit.set_selection(0, 4);

	state.handle_format(false, Toolbar::Bold);
	flush_due(&mut state);
	let bold = saved_markdown(&initial, &calls(&mut state));
	state.handle_format(false, Toolbar::List);

	assert_eq!(bold, "**Ship** today");
	assert_eq!(shown_markdown(&state).as_deref(), Some("- **Ship** today"));
}

#[test]
fn a_flush_shares_the_caret_of_the_focused_field() {
	let mut state = opened_document("notes.txt", "Body.");
	let block = first_block(&state);
	let edit = state.field_mut(false, &block, 0);
	edit.focused = true;
	edit.replace_text("Body, typed.");
	edit.set_caret(4);
	state.handle_block(false, BlockEvent::Typed { block, field: 0 });
	calls(&mut state);

	flush_due(&mut state);
	let sent = calls(&mut state);
	let anchor = sent.iter().find_map(|call| match call {
		Call::Share { at: Some(LibraryPresenceAt::Text { anchor }), .. } => Some(anchor.clone()),
		_ => None,
	});
	let offset = anchor.and_then(|anchor| state.shown_document()?.session()?.offset_of(&anchor));

	assert_eq!(offset, Some(4));
}

#[test]
fn download_and_copy_from_the_bar_and_the_lightbox_reach_the_core() {
	let mut state = opened_document("brief.md", "Body.");
	calls(&mut state);
	state.handle_document_bar(ItemEvent::Download);
	state.handle_document_bar(ItemEvent::Copy);
	let from_bar = calls(&mut state);
	answer(&mut state, Answer::Copied { target: target("brief.md"), outcome: Ok(()) });
	let is_copied = state.is_copied("brief.md");
	let copied_wake = calls(&mut state);
	answer(&mut state, Answer::Due(Due::Copied));
	let mut images = library_with(vec![item("dunes.png", LibraryItemKind::Image)]);
	images.handle_library(LibraryEvent::Open("dunes.png".to_owned()));
	calls(&mut images);
	images.handle_lightbox(LightboxEvent::Item(ItemEvent::Download));
	answer(&mut images, Answer::Downloaded(Err(refused())));

	assert_eq!(from_bar, vec![Call::Download(target("brief.md")), Call::Copy(target("brief.md"))]);
	assert!(is_copied);
	assert!(matches!(copied_wake.as_slice(), [Call::Wake(_, Due::Copied)]));
	assert!(!state.is_copied("brief.md"));
	assert_eq!(calls(&mut images), vec![Call::Download(target("dunes.png"))]);
	assert!(!images.to_raise.is_empty());
}

#[test]
fn import_opens_the_picker_and_new_board_creates_a_board_for_the_boards_surface() {
	let mut state = library_with(Vec::new());

	state.handle_library(LibraryEvent::Import);
	state.handle_library(LibraryEvent::NewBoard);
	let created = calls(&mut state);
	let board = item("Untitled.canvas", LibraryItemKind::Board);
	answer(&mut state, Answer::BoardCreated { space_id: SPACE.to_owned(), item: Ok(board) });

	assert_eq!(state.effects, vec![super::Effect::PickFile]);
	assert_eq!(
		created,
		vec![Call::CreateBoard { space_id: SPACE.to_owned(), untitled: "Untitled".to_owned() }]
	);
	assert_eq!(state.board_to_open.as_deref(), Some("Untitled.canvas"));
}

#[test]
fn an_agent_card_counts_its_sentences_under_its_section() {
	let initial = state_of("# Plan\n\nBody.");
	let mut state = opened_from("plan.md", &initial);
	calls(&mut state);
	let mut agent = Session::opened(&initial).expect("the agent session");
	let start = agent.anchor_at(13).expect("a start anchor");
	let update = agent.edited("# Plan\n\nBody. One. Two.").expect("an agent update");
	let end = agent.anchor_at(23).expect("an end anchor");
	let presence = |anchor: String| {
		Heard::Presence(LibraryDocumentPresence {
			space_id: SPACE.to_owned(),
			name: "plan.md".to_owned(),
			writers: vec![agent_writer(anchor)],
		})
	};

	state.heard(presence(start), NOW);
	state.heard(
		Heard::Updated(LibraryDocumentUpdated {
			space_id: SPACE.to_owned(),
			name: "plan.md".to_owned(),
			update,
		}),
		NOW,
	);
	state.heard(presence(end), NOW + 4_000);

	let cards = state.shown_document().expect("an open document").cards();
	assert_eq!(cards.len(), 1);
	assert_eq!((cards[0].sentences, cards[0].elapsed_seconds), (2, 4));
	assert_eq!(cards[0].section, "Plan");
}

fn library_app(initial: &str) -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: model::Space { id: SPACE.to_owned(), name: SPACE.to_owned(), colour: None },
		agents: Vec::new(),
		conversations: Vec::new(),
		person: Person::Unread,
		longest: None,
	});
	app.surfaces.s14_library = opened_from("brief.md", initial);
	super::open_beside(&mut app, "brief.md");
	let library = &mut app.surfaces.s14_library;
	let opened = LibraryDocumentState { name: "brief.md".to_owned(), update: initial.to_owned() };
	answer(library, Answer::Opened { target: target("brief.md"), state: Ok(opened) });
	calls(library);
	app
}

fn frame(event: &str, payload: impl Serialize) -> String {
	let payload = serde_json::to_value(payload).expect("a payload writes");
	json!({ "event": event, "payload": payload }).to_string()
}

fn heard_in(app: &mut App, text: &str) {
	match parsed(text) {
		Some(HostEvent::Library(heard)) => super::heard(app, heard),
		_ => panic!("the frame is heard as a library event"),
	}
}

fn open_documents(app: &App) -> [&super::Document; 2] {
	let library = &app.surfaces.s14_library;
	[
		library.shown_document().expect("the document stays open in the main view"),
		library.beside.as_ref().expect("the document stays open beside the thread"),
	]
}

fn markdown_of(document: &super::Document) -> Option<String> {
	document.session().map(Session::markdown)
}

#[test]
fn an_agent_write_from_the_event_loop_lands_in_the_main_view_and_beside_the_thread() {
	let initial = state_of("Body.");
	let mut app = library_app(&initial);
	let mut agent = Session::opened(&initial).expect("the agent session");
	let update = agent.edited("Body.\n\nAn agent sentence.").expect("an agent update");

	let updated =
		LibraryDocumentUpdated { space_id: SPACE.to_owned(), name: "brief.md".to_owned(), update };
	heard_in(&mut app, &frame("library://document-updated", updated));

	for document in open_documents(&app) {
		assert_eq!(markdown_of(document).as_deref(), Some("Body.\n\nAn agent sentence."));
	}
}

#[test]
fn a_writer_from_the_event_loop_shows_on_the_open_document_until_it_finishes() {
	let mut app = library_app(&state_of("Body."));
	let presence = LibraryDocumentPresence {
		space_id: SPACE.to_owned(),
		name: "brief.md".to_owned(),
		writers: vec![agent_writer(String::new())],
	};
	heard_in(&mut app, &frame("library://document-presence", presence));
	for document in open_documents(&app) {
		assert_eq!(document.agents().count(), 1);
	}

	let finished = LibraryDocumentWriterFinished {
		space_id: SPACE.to_owned(),
		name: "brief.md".to_owned(),
		agent_id: "atlas".to_owned(),
		agent_name: "Atlas".to_owned(),
		outcome: LibraryWriteOutcome::Finished,
	};
	heard_in(&mut app, &frame("library://document-writer-finished", finished));

	for document in open_documents(&app) {
		assert_eq!(document.agents().count(), 0);
		assert!(document.cards().is_empty());
	}
	assert!(crate::app::notice::shown(&app).is_empty());
}

#[test]
fn a_rename_from_the_event_loop_retitles_the_open_document_and_relists_the_library() {
	let mut app = library_app(&state_of("Body."));
	let renamed = LibraryDocumentRenamed {
		space_id: SPACE.to_owned(),
		former_name: "brief.md".to_owned(),
		name: "Launch brief.md".to_owned(),
	};
	heard_in(&mut app, &frame("library://document-renamed", renamed));

	for document in open_documents(&app) {
		assert_eq!(document.target.name, "Launch brief.md");
		assert_eq!(document.title.text, "Launch brief");
	}
	assert_eq!(
		calls(&mut app.surfaces.s14_library),
		vec![Call::List { space_id: SPACE.to_owned() }]
	);
}

#[test]
fn a_library_change_from_the_event_loop_relists_the_library() {
	let mut app = library_app(&state_of("Body."));
	let changed = LibraryChanged { space_id: SPACE.to_owned(), overwritten: None };
	heard_in(&mut app, &frame("library://changed", changed));

	assert_eq!(
		calls(&mut app.surfaces.s14_library),
		vec![Call::List { space_id: SPACE.to_owned() }]
	);
}

#[test]
fn an_unreadable_library_event_takes_the_unreadable_path() {
	for event in [
		"library://changed",
		"library://document-updated",
		"library://document-renamed",
		"library://document-presence",
		"library://document-writer-finished",
	] {
		let heard = parsed(&frame(event, json!({ "name": 4 })));
		assert!(
			matches!(&heard, Some(HostEvent::Unreadable { event: named, .. }) if named == event),
			"{event} is reported unreadable"
		);
	}
	assert!(matches!(
		parsed(&frame("library://changed", json!({ "spaceId": SPACE }))),
		Some(HostEvent::Library(Heard::Changed(_)))
	));
}

#[test]
fn a_failed_agent_write_raises_its_notice_through_the_app() {
	let mut app = library_app(&state_of("Body."));
	let finished = LibraryDocumentWriterFinished {
		space_id: SPACE.to_owned(),
		name: "brief.md".to_owned(),
		agent_id: "atlas".to_owned(),
		agent_name: "Atlas".to_owned(),
		outcome: LibraryWriteOutcome::Failed,
	};

	heard_in(&mut app, &frame("library://document-writer-finished", finished));

	let shown = crate::app::notice::shown(&app);
	assert!(shown.iter().any(|notice| notice.title.contains("Atlas")));
	assert!(app.surfaces.s14_library.to_raise.is_empty());
}

fn escape() -> rune::KeyEvent {
	rune::KeyEvent { key: rune::Key::Escape, mods: rune::Mods::default() }
}

fn tile_menu(state: &mut State, name: &str) {
	let anchor = tile_more_key(name);
	state.handle_library(LibraryEvent::Menu { id: name.to_owned(), anchor });
}

#[test]
fn more_on_a_tile_opens_the_item_menu_at_it_with_the_rows_of_its_kind() {
	let mut state = library_with(vec![
		item("brief.md", LibraryItemKind::Document),
		item("dunes.png", LibraryItemKind::Image),
	]);

	tile_menu(&mut state, "brief.md");
	let document_rows = state.menu_actions();
	let place = state.menu.as_ref().map(|menu| menu.place.clone());
	tile_menu(&mut state, "dunes.png");

	assert_eq!(document_rows, ItemAction::ALL);
	assert_eq!(place, Some(MenuPlace::Under(tile_more_key("brief.md"))));
	assert!(!state.menu_actions().contains(&ItemAction::Rename));
	assert_eq!(state.menu_actions().len(), ItemAction::ALL.len() - 1);
}

#[test]
fn more_on_the_document_bar_and_the_lightbox_opens_their_menu_under_more() {
	let mut document = opened_document("brief.md", "Body.");
	let mut images = library_with(vec![item("dunes.png", LibraryItemKind::Image)]);
	images.handle_library(LibraryEvent::Open("dunes.png".to_owned()));

	document.handle_document_bar(ItemEvent::More);
	images.handle_lightbox(LightboxEvent::Item(ItemEvent::More));

	for state in [&document, &images] {
		let place = state.menu.as_ref().map(|menu| menu.place.clone());
		assert_eq!(place, Some(MenuPlace::Under(MORE_KEY.to_owned())));
	}
	assert_eq!(
		document.menu_actions(),
		[
			ItemAction::OpenInNewTab,
			ItemAction::Rename,
			ItemAction::ShowInFolder,
			ItemAction::Delete
		]
	);
	assert_eq!(
		images.menu_actions(),
		[ItemAction::OpenInNewTab, ItemAction::ShowInFolder, ItemAction::Delete]
	);
}

#[test]
fn a_chosen_row_reaches_the_core_and_delete_asks_first() {
	let mut state = library_with(vec![item("dunes.png", LibraryItemKind::Image)]);
	let mut chosen = Vec::new();
	for action in [ItemAction::ShowInFolder, ItemAction::Copy, ItemAction::Download] {
		tile_menu(&mut state, "dunes.png");
		state.choose_in_menu(action);
		chosen.extend(calls(&mut state));
	}
	tile_menu(&mut state, "dunes.png");
	state.choose_in_menu(ItemAction::Delete);

	assert_eq!(
		chosen,
		vec![
			Call::Reveal(target("dunes.png")),
			Call::Copy(target("dunes.png")),
			Call::Download(target("dunes.png")),
		]
	);
	assert!(state.menu.is_none());
	assert!(
		matches!(&state.dialog, Some(Dialog::Delete { target: asked, .. }) if asked.name == "dunes.png")
	);
	assert!(calls(&mut state).is_empty());
}

#[test]
fn escape_or_a_click_outside_closes_the_item_menu_without_acting() {
	let mut state = library_with(vec![item("brief.md", LibraryItemKind::Document)]);

	tile_menu(&mut state, "brief.md");
	let is_handled = state.key_pressed(&escape());
	let after_escape = state.menu.is_none();
	tile_menu(&mut state, "brief.md");
	state.close_menu();

	assert!(is_handled && after_escape);
	assert!(state.menu.is_none());
	assert!(state.shown.is_none() && state.dialog.is_none());
	assert!(calls(&mut state).is_empty());
}

#[test]
fn a_refused_show_in_folder_keeps_the_library_and_raises_a_notice() {
	let mut state = library_with(vec![item("brief.md", LibraryItemKind::Document)]);
	tile_menu(&mut state, "brief.md");
	state.choose_in_menu(ItemAction::ShowInFolder);
	calls(&mut state);

	answer(&mut state, Answer::Revealed(Err(refused())));

	assert!(matches!(state.listing, Listing::Loaded(ref items) if items.len() == 1));
	assert!(state.to_raise.iter().any(|notice| notice.title.contains("folder")));
}

#[test]
fn retry_on_a_failed_library_reloads_it_showing_loading_then_the_items_or_the_failure() {
	let mut state = State::default();
	state.enter_space(SPACE, false);
	state.show_library();
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items: Err(refused()) });
	calls(&mut state);

	state.handle_library(LibraryEvent::Retry);
	let is_loading = matches!(state.listing, Listing::Loading);
	let relisted = calls(&mut state);
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items: Err(refused()) });
	let has_failed_again = matches!(state.listing, Listing::Failed);
	state.handle_library(LibraryEvent::Retry);
	let items = Ok(vec![item("brief.md", LibraryItemKind::Document)]);
	answer(&mut state, Answer::Listed { space_id: SPACE.to_owned(), items });

	assert!(is_loading);
	assert_eq!(relisted, vec![Call::List { space_id: SPACE.to_owned() }]);
	assert!(has_failed_again);
	assert!(matches!(state.listing, Listing::Loaded(ref items) if items.len() == 1));
}

#[test]
fn a_resized_panel_keeps_its_width_within_the_room_across_a_reopen() {
	let mut state = library_with(Vec::new());
	state.open_beside("brief.md");

	state.handle_panel(DocumentPanelEvent::Resize(DOCUMENT_PANEL_MIN_WIDTH + 80.0));
	state.handle_panel(DocumentPanelEvent::Close);
	state.open_beside("notes.md");
	let reopened = state.panel_width(10_000.0);
	state.handle_panel(DocumentPanelEvent::Resize(5_000.0));
	let widest = state.panel_width(1_000.0);
	state.handle_panel(DocumentPanelEvent::Resize(10.0));

	assert_eq!(reopened, DOCUMENT_PANEL_MIN_WIDTH + 80.0);
	assert_eq!(widest, panel_max_width(1_000.0));
	assert_eq!(state.panel_width(10_000.0), DOCUMENT_PANEL_MIN_WIDTH);
}

fn selected(state: &mut State, from: usize, to: usize) -> String {
	let block = first_block(state);
	let edit = state.field_mut(false, &block, 0);
	edit.focused = true;
	edit.set_selection(from, to);
	block
}

#[test]
fn the_link_button_shows_the_link_field_and_confirm_links_the_selection_then_saves() {
	let initial = state_of("Ship today");
	let mut state = opened_from("notes.txt", &initial);
	selected(&mut state, 0, 4);

	state.handle_format(false, Toolbar::Link);
	let is_shown = state.link.as_ref().is_some_and(|link| link.edit.text.is_empty());
	state.link_mut().replace_text("https://kiroshi.app/a b");
	let url = state.link_mut().text.clone();
	state.handle_link(LinkEvent::Confirm(url));

	assert!(is_shown);
	assert!(state.link.is_none());
	assert_eq!(
		saved_markdown(&initial, &calls(&mut state)),
		"[Ship](https://kiroshi.app/a%20b) today"
	);
}

#[test]
fn the_link_field_opens_on_the_link_already_there_and_an_empty_one_unlinks() {
	let initial = state_of("[Ship](https://kiroshi.app) today");
	let mut state = opened_from("notes.txt", &initial);
	selected(&mut state, 0, 4);

	state.handle_format(false, Toolbar::Link);
	let shown = state.link.as_ref().map(|link| link.edit.text.clone());
	state.handle_link(LinkEvent::Confirm("  ".to_owned()));

	assert_eq!(shown.as_deref(), Some("https://kiroshi.app"));
	assert_eq!(saved_markdown(&initial, &calls(&mut state)), "Ship today");
}

#[test]
fn cancel_closes_the_link_field_and_leaves_the_text_unchanged() {
	let mut state = opened_document("notes.txt", "Ship today");
	selected(&mut state, 0, 4);

	state.handle_format(false, Toolbar::Link);
	state.link_mut().replace_text("https://kiroshi.app");
	state.handle_link(LinkEvent::Cancel);

	assert!(state.link.is_none());
	assert!(calls(&mut state).is_empty());
	assert_eq!(shown_markdown(&state).as_deref(), Some("Ship today"));
	assert!(
		state.shown_document().is_some_and(|document| document.fields[0].edit.marks().is_empty())
	);
}

fn block_ids(state: &State) -> Vec<String> {
	let document = state.shown_document().expect("an open document");
	document.blocks.iter().map(|block| block.id.clone()).collect()
}

fn saved_after(initial: &str, change: impl FnOnce(&mut State, &[String])) -> String {
	let initial = state_of(initial);
	let mut state = opened_from("notes.txt", &initial);
	let ids = block_ids(&state);
	change(&mut state, &ids);
	assert!(state.block_menu.is_none());
	saved_markdown(&initial, &calls(&mut state))
}

fn chosen_on(state: &mut State, block: &str, action: BlockMenuAction) {
	state.handle_block_handle(false, block, HandleEvent::Press);
	state.handle_block_menu(action);
}

#[test]
fn pressing_a_handle_opens_the_block_menu_on_that_block_and_escape_closes_it() {
	let mut state = opened_document("notes.txt", "One\n\nTwo");
	let ids = block_ids(&state);

	state.handle_block_handle(false, &ids[1], HandleEvent::Press);
	let handled = state.handled_block(false).map(str::to_owned);
	let is_handled = state.key_pressed(&escape());

	assert_eq!(handled.as_deref(), Some(ids[1].as_str()));
	assert!(is_handled);
	assert!(state.block_menu.is_none());
	assert!(calls(&mut state).is_empty());
}

#[test]
fn each_block_menu_action_changes_the_document_and_saves_it() {
	let three = "One\n\nTwo\n\nThree";
	let duplicated =
		saved_after(three, |state, ids| chosen_on(state, &ids[0], BlockMenuAction::Duplicate));
	let up = saved_after(three, |state, ids| chosen_on(state, &ids[1], BlockMenuAction::MoveUp));
	let down =
		saved_after(three, |state, ids| chosen_on(state, &ids[1], BlockMenuAction::MoveDown));
	let deleted =
		saved_after(three, |state, ids| chosen_on(state, &ids[2], BlockMenuAction::Delete));
	let top = saved_after(three, |state, ids| chosen_on(state, &ids[0], BlockMenuAction::MoveUp));

	assert_eq!(duplicated, "One\n\nOne\n\nTwo\n\nThree");
	assert_eq!(up, "Two\n\nOne\n\nThree");
	assert_eq!(down, "One\n\nThree\n\nTwo");
	assert_eq!(deleted, "One\n\nTwo");
	assert_eq!(top, three);
}

#[test]
fn turn_into_opens_over_the_block_menu_and_a_new_type_converts_the_block_and_saves() {
	let initial = state_of("One\n\nTwo");
	let mut state = opened_from("notes.txt", &initial);
	let ids = block_ids(&state);

	chosen_on(&mut state, &ids[1], BlockMenuAction::TurnIntoShown);
	let is_shown = state.block_menu.as_ref().map(|menu| menu.is_turn_into_shown);
	state.handle_block_menu(BlockMenuAction::TurnIntoHidden);
	let is_hidden = state.block_menu.as_ref().map(|menu| !menu.is_turn_into_shown);
	state.handle_block_menu(BlockMenuAction::TurnIntoShown);
	state.handle_block_menu(BlockMenuAction::TurnInto(LibraryBlockType::Paragraph));
	let unchanged = calls(&mut state);
	let is_closed_on_same_type = state.block_menu.is_none();
	chosen_on(&mut state, &ids[1], BlockMenuAction::TurnIntoShown);
	state.handle_block_menu(BlockMenuAction::TurnInto(LibraryBlockType::Heading));

	assert_eq!(is_shown, Some(true));
	assert_eq!(is_hidden, Some(true));
	assert!(unchanged.is_empty());
	assert!(is_closed_on_same_type);
	assert!(state.block_menu.is_none());
	assert_eq!(saved_markdown(&initial, &calls(&mut state)), "One\n\n# Two");
}

#[test]
fn a_block_drag_holds_its_landing_until_drag_end_and_never_outlives_the_menu_or_the_document() {
	let initial = state_of("One\n\nTwo\n\nThree");
	let mut state = opened_from("notes.txt", &initial);
	let ids = block_ids(&state);
	let drag = HandleEvent::Drag { from: 0, offset: (4.0, 60.0), to: 1 };

	state.handle_block_handle(false, &ids[0], drag);
	let held = state.dragged(false).map(|held| (held.offset, held.landing()));
	let is_beside_free = state.dragged(true).is_none();
	state.handle_block_handle(false, &ids[0], HandleEvent::DragEnd);
	let is_ended = state.dragged(false).is_none();
	state.handle_block_handle(false, &ids[0], HandleEvent::Move { from: 0, to: 1 });
	let moved = saved_markdown(&initial, &calls(&mut state));
	state.handle_block_handle(false, &ids[0], drag);
	state.handle_block_handle(false, &ids[0], HandleEvent::Press);
	let is_ended_by_menu = state.dragged(false).is_none();
	state.close_block_menu();
	state.handle_block_handle(false, &ids[0], drag);
	state.handle_document_bar(ItemEvent::Close);

	assert_eq!(held, Some(((4.0, 60.0), 2)));
	assert!(is_beside_free);
	assert!(is_ended);
	assert_eq!(moved, "Two\n\nOne\n\nThree");
	assert!(is_ended_by_menu);
	assert!(state.dragged(false).is_none());
}

#[test]
fn deleting_the_only_block_leaves_an_empty_paragraph_to_write_in() {
	let mut state = opened_document("notes.txt", "Only");
	let ids = block_ids(&state);

	chosen_on(&mut state, &ids[0], BlockMenuAction::Delete);

	let document = state.shown_document().expect("an open document");
	assert_eq!(document.blocks.len(), 1);
	assert_eq!(document.markdown(), "");
	assert_eq!(applies(&calls(&mut state)), 1);
}

#[test]
fn insert_on_a_handle_adds_an_empty_paragraph_below_and_focuses_it() {
	let saved = saved_after("One\n\nTwo", |state, ids| {
		state.handle_block_handle(false, &ids[0], HandleEvent::Insert);
		let document = state.shown_document().expect("an open document");
		let focused = document.focused().map(|field| field.block.clone());
		assert_eq!(focused.as_ref(), document.blocks.get(1).map(|block| &block.id));
	});

	assert_eq!(saved, "One\n\n\n\nTwo");
}

#[test]
fn a_dragged_handle_moves_its_block_to_the_slot_and_saves() {
	let saved = saved_after("One\n\nTwo\n\nThree", |state, ids| {
		state.handle_block_handle(false, &ids[0], HandleEvent::Move { from: 0, to: 2 });
	});

	assert_eq!(saved, "Two\n\nThree\n\nOne");
}

const TABLE: &str = "| Name | Role |\n| --- | --- |\n| Ada | Lead |";

#[test]
fn an_edited_table_cell_is_written_into_its_table_and_saved() {
	let initial = state_of(TABLE);
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);

	state.field_mut(false, &block, 2).replace_text("Ada | Grace");
	state.handle_table(false, &block, TableEvent::Edited { row: 1, column: 0 });
	flush_due(&mut state);

	assert_eq!(
		saved_markdown(&initial, &calls(&mut state)),
		"| Name | Role |\n| --- | --- |\n| Ada \\| Grace | Lead |"
	);
}

#[test]
fn table_focus_moves_to_that_cell_with_its_text_selected() {
	let mut state = opened_document("notes.txt", TABLE);
	let block = first_block(&state);

	state.handle_table(false, &block, TableEvent::Focus { row: 1, column: 1 });

	let document = state.shown_document().expect("an open document");
	let focused = document.focused().map(|field| (field.row, field.edit.range()));
	assert_eq!(focused, Some((3, (0, 4))));
	assert_eq!(document.fields.iter().filter(|field| field.edit.focused).count(), 1);
}

#[test]
fn an_escaped_pipe_stays_inside_its_cell_on_the_next_edit() {
	let initial = state_of("| Name | Role |\n| --- | --- |\n| Ada \\| Grace | Lead |");
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);

	state.field_mut(false, &block, 3).replace_text("Leads");
	state.handle_table(false, &block, TableEvent::Edited { row: 1, column: 1 });
	flush_due(&mut state);

	assert_eq!(
		saved_markdown(&initial, &calls(&mut state)),
		"| Name | Role |\n| --- | --- |\n| Ada \\| Grace | Leads |"
	);
}

const GALLERY: &str =
	"```gallery\n- image: dunes.png\n  alt: Dunes\n- image: fern.png\n  alt: Fern\n```";

fn gallery_block(state: &State) -> String {
	let document = state.shown_document().expect("an open document");
	let gallery = document.blocks.iter().find(|block| block.kind() == LibraryBlockType::Gallery);
	gallery.expect("a gallery block").id.clone()
}

fn gallery_saved(initial: &str, event: GalleryEvent) -> String {
	let initial = state_of(initial);
	let mut state = opened_from("notes.txt", &initial);
	let block = gallery_block(&state);
	state.handle_gallery(false, &block, event);
	flush_due(&mut state);
	saved_markdown(&initial, &calls(&mut state))
}

#[test]
fn removing_or_moving_a_gallery_tile_changes_the_gallery_and_saves_it() {
	let removed = gallery_saved(GALLERY, GalleryEvent::Remove(0));
	let moved = gallery_saved(GALLERY, GalleryEvent::Move { from: 0, to: 1 });
	let last = gallery_saved(
		"Intro\n\n```gallery\n- image: dunes.png\n  alt: Dunes\n```",
		GalleryEvent::Remove(0),
	);

	assert_eq!(removed, "```gallery\n- image: fern.png\n  alt: Fern\n```");
	assert_eq!(
		moved,
		"```gallery\n- image: fern.png\n  alt: Fern\n- image: dunes.png\n  alt: Dunes\n```"
	);
	assert_eq!(last, "Intro");
}

#[test]
fn a_gallery_caption_is_written_into_its_tile_and_an_empty_one_drops_it() {
	let initial = state_of(GALLERY);
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);

	state.field_mut(false, &block, 1).replace_text("A fern, *close*");
	state.handle_gallery(false, &block, GalleryEvent::Caption(1));
	flush_due(&mut state);
	let captioned = saved_markdown(&initial, &calls(&mut state));
	state.field_mut(false, &block, 1).replace_text("  ");
	state.handle_gallery(false, &block, GalleryEvent::Caption(1));
	flush_due(&mut state);

	assert_eq!(
		captioned,
		"```gallery\n- image: dunes.png\n  alt: Dunes\n- image: fern.png\n  alt: Fern\n  caption: A fern, *close*\n```"
	);
	assert_eq!(shown_markdown(&state).as_deref(), Some(GALLERY));
}

#[test]
fn add_picks_an_image_imports_it_then_appends_its_tile_and_saves() {
	let initial = state_of(GALLERY);
	let mut state = opened_from("notes.txt", &initial);
	let block = first_block(&state);
	let add = GalleryAdd { is_beside: false, block: block.clone() };
	let path = PathBuf::from("/photos/Desert road.png");

	state.handle_gallery(false, &block, GalleryEvent::Add);
	let picks = std::mem::take(&mut state.effects);
	state.import_into_gallery(add.clone(), path.clone());
	let imported = calls(&mut state);
	let item = item("Desert road.png", LibraryItemKind::Image);
	let imports = Ok(vec![LibraryImport::Imported { item }]);
	answer(
		&mut state,
		Answer::GalleryImported { target: target("notes.txt"), add: add.clone(), path, imports },
	);
	let landed = calls(&mut state);

	assert_eq!(picks, vec![super::Effect::PickGalleryImage(add.clone())]);
	assert!(
		matches!(imported.as_slice(), [Call::GalleryImport { add: asked, .. }] if *asked == add)
	);
	assert!(landed.contains(&Call::List { space_id: SPACE.to_owned() }));
	assert_eq!(
		saved_markdown(&initial, &landed),
		"```gallery\n- image: dunes.png\n  alt: Dunes\n- image: fern.png\n  alt: Fern\n- image: Desert road.png\n  alt: Desert road\n```"
	);
}

#[test]
fn a_refused_gallery_import_keeps_the_gallery_marks_the_add_failed_and_raises_a_notice() {
	let mut state = opened_document("notes.txt", GALLERY);
	let block = first_block(&state);
	let add = GalleryAdd { is_beside: false, block: block.clone() };
	let path = PathBuf::from("/photos/huge.png");

	answer(
		&mut state,
		Answer::GalleryImported { target: target("notes.txt"), add, path, imports: Err(refused()) },
	);

	assert!(state.has_gallery_add_failed(false, &block));
	assert!(state.to_raise.iter().any(|notice| notice.title.contains("huge.png")));
	assert_eq!(applies(&calls(&mut state)), 0);
	assert_eq!(shown_markdown(&state).as_deref(), Some(GALLERY));
	state.handle_gallery(false, &block, GalleryEvent::Add);
	assert!(!state.has_gallery_add_failed(false, &block));
}

#[test]
fn copy_image_copies_and_save_to_library_saves_a_copy_through_the_core() {
	let mut state = library_with(vec![item("dunes.png", LibraryItemKind::Image)]);

	state.act("dunes.png", ItemAction::CopyImage);
	state.act("dunes.png", ItemAction::SaveToLibrary);
	let asked = calls(&mut state);
	let copy = item("dunes 2.png", LibraryItemKind::Image);
	answer(&mut state, Answer::SavedToLibrary { target: target("dunes.png"), item: Ok(copy) });

	assert_eq!(
		asked,
		vec![Call::Copy(target("dunes.png")), Call::SaveToLibrary(target("dunes.png"))]
	);
	assert_eq!(calls(&mut state), vec![Call::List { space_id: SPACE.to_owned() }]);
	assert!(state.to_raise.is_empty());
}

#[test]
fn a_refused_save_to_library_keeps_the_library_and_names_the_image() {
	let mut state = library_with(vec![item("dunes.png", LibraryItemKind::Image)]);

	answer(
		&mut state,
		Answer::SavedToLibrary { target: target("dunes.png"), item: Err(refused()) },
	);

	assert!(matches!(state.listing, Listing::Loaded(ref items) if items.len() == 1));
	assert!(state.to_raise.iter().any(|notice| notice.title.contains("dunes.png")));
}

#[test]
fn right_clicking_the_lightbox_picture_opens_the_image_menu_at_the_pointer() {
	let mut state = library_with(vec![item("dunes.png", LibraryItemKind::Image)]);
	state.handle_library(LibraryEvent::Open("dunes.png".to_owned()));
	calls(&mut state);
	let at = rune::PointerPress { x: 120.0, y: 80.0 };

	state.handle_lightbox(LightboxEvent::PictureMenuRequested { at });
	let place = state.menu.as_ref().map(|menu| menu.place.clone());
	let actions = state.menu_actions();
	let image = state.menu_image();
	state.choose_in_menu(ItemAction::SaveToLibrary);
	state.handle_lightbox(LightboxEvent::PictureMenuRequested { at });
	state.choose_in_menu(ItemAction::CopyImage);
	let asked = calls(&mut state);
	answer(
		&mut state,
		Answer::SavedToLibrary { target: target("dunes.png"), item: Err(refused()) },
	);

	assert_eq!(place, Some(MenuPlace::At(at)));
	assert_eq!(
		actions,
		[
			ItemAction::OpenInNewTab,
			ItemAction::Copy,
			ItemAction::Download,
			ItemAction::ShowInFolder,
			ItemAction::Delete
		]
	);
	assert_eq!(image, Some(ImageMenu { is_saving: false }));
	assert!(state.menu.is_none());
	assert_eq!(
		asked,
		vec![Call::SaveToLibrary(target("dunes.png")), Call::Copy(target("dunes.png"))]
	);
	assert!(state.to_raise.iter().any(|notice| notice.title.contains("dunes.png")));
}

fn app_showing(space_id: &str) -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: model::Space { id: space_id.to_owned(), name: "Studio".to_owned(), colour: None },
		agents: Vec::new(),
		conversations: Vec::new(),
		person: Person::Unread,
		longest: None,
	});
	let joined = serde_json::from_value(json!({
		"id": "joined-studio",
		"hostUrl": "https://relay.test/relay/member",
		"remoteSpaceId": null,
		"name": "Studio",
		"state": "online",
		"hostedBy": "Noa",
		"colour": null,
		"instanceId": "instance-studio",
	}))
	.expect("a joined Space fixture");
	app.surfaces.s02_rail.hold_joined(vec![joined]);
	app
}

#[test]
fn a_joined_space_enters_its_library_as_joined_and_a_hosted_one_as_hosted() {
	let mut joined = app_showing("joined-studio");
	assert!(super::entered(&mut joined));
	assert!(joined.surfaces.s14_library.is_joined);

	let mut hosted = app_showing(SPACE);
	assert!(super::entered(&mut hosted));
	assert!(!hosted.surfaces.s14_library.is_joined);
}
