use std::path::PathBuf;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::board::{BoardEdit, ElementChange, edit_board};
use kiroshi_core::library::contract::{
	LibraryBoardBounds, LibraryBoardFileReplaced, LibraryBoardNode, LibraryBoardPoint,
	LibraryBoardSummary, LibraryDocumentPresence, LibraryDocumentRenamed, LibraryDocumentState,
	LibraryDocumentUpdated, LibraryImport, LibraryItem, LibraryItemKind, LibraryPresenceAt,
	LibraryWriter, LibraryWriterKind,
};
use kiroshi_core::library::link_preview::contract::LibraryLinkPreview;
use rune::{Key, KeyEvent, Mods};
use serde_json::{Map, Value, json};
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map as _, ReadTxn, StateVector, Transact, Update};

use kiroshi_rune_kit::primitives::toast::ToastType;
use kiroshi_rune_kit::surfaces::s15_boards::canvas::opening_margin;
use kiroshi_rune_kit::surfaces::s15_boards::card::Summary as CardSummary;
use kiroshi_rune_kit::surfaces::s15_boards::model::{
	Connector, Content, Editing, End, Event, Frame, Object, Owner, Point, Rect, Routing, ShapeFill,
	ShapeKind, ShapeStyle, Side, Size, StickyColour, Tool, Viewport,
};
use kiroshi_rune_kit::surfaces::s15_boards::viewport::opening_viewport;

use super::presence::{SHARE_INTERVAL, shown};
use super::projection::{domain_of, objects_of, snapshot_of};
use super::view::summary_of;
use super::worker::{Answer, Call, Target};
use super::{Heard, Phase, State, heard_of, leave_board, open_board, show_board, title_of};
use crate::app::{App, Person, Ready, Workspace};
use crate::host::{Host, HostError};
use crate::model::Space;
use crate::navigation::Route;
use crate::source::Source;

const SPACE: &str = "space-1";

const BOARD: &str = "Plan.canvas";

fn target() -> Target {
	Target { space_id: SPACE.to_owned(), name: BOARD.to_owned() }
}

fn node(kind: &str, x: i64, y: i64, z: &str, extra: Value) -> Map<String, Value> {
	let mut node = json!({ "kind": kind, "x": x, "y": y, "width": 200, "height": 120, "z": z })
		.as_object()
		.cloned()
		.unwrap_or_default();
	node.extend(extra.as_object().cloned().unwrap_or_default());
	node
}

fn sticky(x: i64, y: i64, z: &str) -> Map<String, Value> {
	node(
		"sticky",
		x,
		y,
		z,
		json!({ "text": "Hello", "fill": "yellow", "author": { "kind": "person", "id": "p-1" } }),
	)
}

fn shape(x: i64, y: i64, z: &str) -> Map<String, Value> {
	node("shape", x, y, z, json!({ "text": "Box", "shape": "rectangle" }))
}

struct Core {
	doc: Doc,
}

impl Core {
	fn holding(nodes: Vec<(&str, Map<String, Value>)>) -> Core {
		let doc = Doc::new();
		let added_nodes = nodes.into_iter().map(|(id, node)| (id.to_owned(), node)).collect();
		edit_board(&doc, &BoardEdit { added_nodes, ..BoardEdit::default() });
		Core { doc }
	}

	fn state(&self) -> String {
		let txn = self.doc.transact();
		BASE64_STANDARD.encode(txn.encode_state_as_update_v1(&StateVector::default()))
	}

	fn applied(&self, update: &str) {
		let bytes = BASE64_STANDARD.decode(update).expect("a base64 update");
		let update = Update::decode_v1(&bytes).expect("a yrs update");
		self.doc.transact_mut().apply_update(update).expect("an applied update");
	}

	fn agent_edit(&self, edit: &BoardEdit) -> String {
		let before = self.doc.transact().state_vector();
		edit_board(&self.doc, edit);
		BASE64_STANDARD.encode(self.doc.transact().encode_state_as_update_v1(&before))
	}

	fn node(&self, id: &str) -> Option<Value> {
		let txn = self.doc.transact();
		let nodes = txn.get_map("nodes")?;
		let read = serde_json::to_value(yrs::types::ToJson::to_json(&nodes, &txn)).ok()?;
		read.get(id).cloned()
	}
}

fn opened_on(core: &Core) -> State {
	let mut state = State::default();
	state.open(SPACE, BOARD, "main");
	state.queued.clear();
	state.answered(
		Answer::Opened {
			target: target(),
			state: Ok(LibraryDocumentState { name: BOARD.to_owned(), update: core.state() }),
		},
		Instant::now(),
	);
	state
}

fn held_node(state: &State, id: &str) -> Option<Value> {
	let open = state.board.as_ref()?;
	match &open.phase {
		Phase::Open(session) => session.held().nodes.get(id).cloned(),
		Phase::Opening | Phase::Failed(_) => None,
	}
}

fn held_edge(state: &State, id: &str) -> Option<Value> {
	let open = state.board.as_ref()?;
	match &open.phase {
		Phase::Open(session) => session.held().edges.get(id).cloned(),
		Phase::Opening | Phase::Failed(_) => None,
	}
}

fn objects(state: &State) -> Vec<Object> {
	let Some(open) = state.board.as_ref() else { return Vec::new() };
	match &open.phase {
		Phase::Open(session) => objects_of(session.held(), &|_, id| Owner::person(id, "", None)),
		Phase::Opening | Phase::Failed(_) => Vec::new(),
	}
}

fn sent_updates(state: &mut State) -> Vec<String> {
	state
		.queued
		.drain(..)
		.filter_map(|call| match call {
			Call::Apply { update, .. } => Some(update),
			_ => None,
		})
		.collect()
}

fn notice_title(state: &State) -> Option<String> {
	state.board.as_ref()?.notice.as_ref().map(|notice| notice.title.clone())
}

fn field(value: &Option<Value>, name: &str) -> Value {
	value.as_ref().and_then(|value| value.get(name)).cloned().unwrap_or(Value::Null)
}

fn failed(command: &str) -> HostError {
	HostError::CommandFailed {
		command: command.to_owned(),
		status: 500,
		body: "refused".to_owned(),
	}
}

#[test]
fn opening_a_board_shows_the_loading_state_and_asks_the_core() {
	let mut state = State::default();
	state.open(SPACE, BOARD, "main");
	let open = state.board.as_ref().expect("an open board");
	assert!(matches!(open.phase, Phase::Opening));
	assert!(state.queued.contains(&Call::Open(target())));
	assert!(state.queued.contains(&Call::List { space_id: SPACE.to_owned() }));
}

#[test]
fn the_board_shows_what_the_core_answers_at_the_opening_viewport() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1")), ("b", shape(400, 300, "2"))]);
	let state = opened_on(&core);
	let objects = objects(&state);
	let ids: Vec<&str> = objects.iter().map(Object::id).collect();
	assert_eq!(ids, vec!["a", "b"]);
	let area = Size::new(1200.0, 800.0);
	let open = state.board.as_ref().expect("an open board");
	assert_eq!(
		open.viewport_in(&objects, area),
		opening_viewport(&objects, area, opening_margin())
	);
}

#[test]
fn the_opening_viewport_is_kept_once_the_person_touches_the_board() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	let pinned = Viewport::new(10.0, 20.0, 1.0);
	state.pin_viewport(pinned);
	state.pin_viewport(Viewport::new(99.0, 99.0, 2.0));
	let open = state.board.as_ref().expect("an open board");
	assert_eq!(open.viewport_in(&objects(&state), Size::new(800.0, 600.0)), pinned);
}

#[test]
fn a_failed_open_shows_the_failed_state_with_the_error() {
	let mut state = State::default();
	state.open(SPACE, BOARD, "main");
	state.answered(
		Answer::Opened { target: target(), state: Err(failed("library_open_document")) },
		Instant::now(),
	);
	let open = state.board.as_ref().expect("an open board");
	let Phase::Failed(failure) = &open.phase else { panic!("the board should have failed") };
	assert!(failure.contains("refused"));
	assert_eq!(
		notice_title(&state).as_deref(),
		Some("Couldn’t open the board. Open it again from the Library.")
	);
}

#[test]
fn an_unreadable_board_state_fails_the_open() {
	let mut state = State::default();
	state.open(SPACE, BOARD, "main");
	let unreadable = LibraryDocumentState { name: BOARD.to_owned(), update: "%%%".to_owned() };
	state.answered(Answer::Opened { target: target(), state: Ok(unreadable) }, Instant::now());
	assert!(matches!(state.board.as_ref().map(|open| &open.phase), Some(Phase::Failed(_))));
}

#[test]
fn the_failed_state_offers_the_way_back_to_the_library_to_open_it_again() {
	let mut app = App::new();
	show_board(&mut app, SPACE, BOARD);
	assert!(matches!(app.navigation.main_route(), Route::Boards));
	leave_board(&mut app);
	assert!(app.surfaces.s15_boards.board.is_none());
	assert!(matches!(app.navigation.main_route(), Route::Library));
}

#[test]
fn placing_an_object_shows_it_at_once_and_sends_it_as_a_yrs_update() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	let rect = Rect::new(100.4, 200.6, 200.0, 200.0);
	state.handle(Event::Place { tool: Tool::Sticky, rect }, Instant::now());
	let placed: Vec<Object> =
		objects(&state).into_iter().filter(|object| object.id() != "a").collect();
	let [Object::Item(item)] = placed.as_slice() else { panic!("one placed sticky") };
	assert_eq!(item.rect, Rect::new(100.0, 201.0, 200.0, 200.0));
	assert!(matches!(item.content, Content::Sticky { colour: StickyColour::Yellow, .. }));
	for update in sent_updates(&mut state) {
		core.applied(&update);
	}
	assert_eq!(field(&core.node(&item.id), "kind"), json!("sticky"));
}

#[test]
fn a_section_is_placed_below_every_object() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.handle(
		Event::Place { tool: Tool::Section, rect: Rect::new(0.0, 0.0, 640.0, 400.0) },
		Instant::now(),
	);
	let first = objects(&state).into_iter().next().expect("objects");
	assert_ne!(first.id(), "a");
}

#[test]
fn moving_and_resizing_land_on_the_board_and_in_the_core() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.handle(
		Event::Move { id: "a".to_owned(), position: Point::new(30.0, 40.0) },
		Instant::now(),
	);
	assert_eq!(field(&held_node(&state, "a"), "x"), json!(30));
	state.handle(
		Event::Resize { id: "a".to_owned(), rect: Rect::new(10.0, 10.0, 300.0, 150.0) },
		Instant::now(),
	);
	assert_eq!(field(&held_node(&state, "a"), "width"), json!(300));
	for update in sent_updates(&mut state) {
		core.applied(&update);
	}
	let stored = core.node("a");
	assert_eq!((field(&stored, "x"), field(&stored, "height")), (json!(10), json!(150)));
}

#[test]
fn restyling_and_retexting_land_on_the_board_and_in_the_core() {
	let core = Core::holding(vec![("a", shape(0, 0, "1")), ("s", sticky(300, 0, "2"))]);
	let mut state = opened_on(&core);
	let style = ShapeStyle { shape: ShapeKind::Ellipse, fill: ShapeFill::Blue };
	state.handle(Event::Style { id: "a".to_owned(), style }, Instant::now());
	state
		.handle(Event::EditText { id: "a".to_owned(), text: "Renamed".to_owned() }, Instant::now());
	state.handle(
		Event::Style { id: "s".to_owned(), style: ShapeStyle { fill: ShapeFill::Pink, ..style } },
		Instant::now(),
	);
	let shown = objects(&state);
	let Some(Object::Item(item)) = shown.iter().find(|object| object.id() == "a") else {
		panic!("the shape")
	};
	assert_eq!(item.content, Content::Shape { style, label: "Renamed".to_owned() });
	for update in sent_updates(&mut state) {
		core.applied(&update);
	}
	let stored = core.node("a");
	assert_eq!(
		(field(&stored, "shape"), field(&stored, "color"), field(&stored, "text")),
		(json!("ellipse"), json!("5"), json!("Renamed"))
	);
	assert_eq!(field(&core.node("s"), "fill"), json!("pink"));
}

#[test]
fn connecting_two_objects_draws_an_arrow_held_by_the_core() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1")), ("b", shape(400, 0, "2"))]);
	let mut state = opened_on(&core);
	let arrow = Connector::between(
		"e",
		End::sided("a", Side::Right),
		End::sided("b", Side::Left),
		Routing::Elbow,
	);
	state.handle(Event::SetArrow(arrow), Instant::now());
	let shown = objects(&state);
	let Some(Object::Connector(connector)) = shown.iter().find(|object| object.id() == "e") else {
		panic!("the arrow")
	};
	assert_eq!((connector.from.item.as_str(), connector.to.side), ("a", Some(Side::Left)));
	assert_eq!(connector.routing, Routing::Elbow);
	for update in sent_updates(&mut state) {
		core.applied(&update);
	}
	let txn = core.doc.transact();
	assert!(txn.get_map("edges").is_some_and(|edges| edges.len(&txn) == 1));
}

#[test]
fn deleting_an_object_loosens_its_arrows_onto_the_board() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1")), ("b", shape(400, 0, "2"))]);
	let mut state = opened_on(&core);
	let arrow =
		Connector::between("e", End::of("a"), End::sided("b", Side::Left), Routing::Straight);
	state.handle(Event::SetArrow(arrow), Instant::now());
	state.handle(Event::Delete("a".to_owned()), Instant::now());
	assert!(held_node(&state, "a").is_none());
	let edge = held_edge(&state, "e");
	assert_eq!(field(&edge, "fromPoint"), json!({ "x": 100, "y": 60 }));
	assert_eq!(field(&edge, "fromNode"), Value::Null);
	for update in sent_updates(&mut state) {
		core.applied(&update);
	}
	assert!(core.node("a").is_none());
}

#[test]
fn a_refused_update_shows_the_failure_and_reloads_the_board_the_core_holds() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.handle(
		Event::Move { id: "a".to_owned(), position: Point::new(500.0, 500.0) },
		Instant::now(),
	);
	state.queued.clear();
	state.answered(
		Answer::Applied { target: target(), outcome: Err(failed("library_apply_update")) },
		Instant::now(),
	);
	assert_eq!(
		notice_title(&state).as_deref(),
		Some(
			"Couldn’t save your last changes to the board. It shows what was saved, so make them again."
		)
	);
	assert_eq!(state.queued, vec![Call::Open(target())]);
	state.answered(
		Answer::Opened {
			target: target(),
			state: Ok(LibraryDocumentState { name: BOARD.to_owned(), update: core.state() }),
		},
		Instant::now(),
	);
	assert_eq!(field(&held_node(&state, "a"), "x"), json!(0));
}

#[test]
fn an_agent_edit_shows_live_without_losing_a_local_edit_in_flight() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1")), ("b", shape(400, 0, "2"))]);
	let mut state = opened_on(&core);
	state.handle(
		Event::Move { id: "a".to_owned(), position: Point::new(50.0, 60.0) },
		Instant::now(),
	);
	let agent_move = BoardEdit {
		changed_nodes: vec![ElementChange {
			id: "b".to_owned(),
			element: shape(900, 900, "2"),
			fields: vec!["x".to_owned(), "y".to_owned()],
		}],
		..BoardEdit::default()
	};
	let update = core.agent_edit(&agent_move);
	state.heard(Heard::Updated(LibraryDocumentUpdated {
		space_id: SPACE.to_owned(),
		name: BOARD.to_owned(),
		update,
	}));
	assert_eq!(field(&held_node(&state, "b"), "x"), json!(900));
	assert_eq!(field(&held_node(&state, "a"), "x"), json!(50));
	assert!(!state.queued.iter().any(|call| matches!(call, Call::Open(_))));
}

#[test]
fn an_agent_edit_heard_while_opening_is_shown_once_the_board_opens() {
	let core = Core::holding(vec![("b", shape(400, 0, "2"))]);
	let state_before = core.state();
	let agent_move = BoardEdit {
		changed_nodes: vec![ElementChange {
			id: "b".to_owned(),
			element: shape(10, 10, "2"),
			fields: vec!["x".to_owned()],
		}],
		..BoardEdit::default()
	};
	let mut state = State::default();
	state.open(SPACE, BOARD, "main");
	let update = core.agent_edit(&agent_move);
	state.heard(Heard::Updated(LibraryDocumentUpdated {
		space_id: SPACE.to_owned(),
		name: BOARD.to_owned(),
		update,
	}));
	state.answered(
		Answer::Opened {
			target: target(),
			state: Ok(LibraryDocumentState { name: BOARD.to_owned(), update: state_before }),
		},
		Instant::now(),
	);
	assert_eq!(field(&held_node(&state, "b"), "x"), json!(10));
}

fn writer(id: &str, kind: LibraryWriterKind, node_id: Option<&str>) -> LibraryWriter {
	LibraryWriter {
		id: id.to_owned(),
		kind,
		name: Some(format!("{id} name")),
		hue: Some(120),
		at: LibraryPresenceAt::Board {
			point: LibraryBoardPoint { x: 10, y: 20 },
			node_id: node_id.map(str::to_owned),
		},
	}
}

#[test]
fn a_drawing_agent_shows_its_presence_and_this_window_is_left_out() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.heard(Heard::Presence(LibraryDocumentPresence {
		space_id: SPACE.to_owned(),
		name: BOARD.to_owned(),
		writers: vec![
			writer("bot-1", LibraryWriterKind::Agent, Some("a")),
			writer("main", LibraryWriterKind::Person, None),
			writer("member-1", LibraryWriterKind::Member, None),
		],
	}));
	let open = state.board.as_ref().expect("an open board");
	let presence = shown(&open.writers, &|_| None);
	let drawers: Vec<&str> = presence.drawers.iter().map(|owner| owner.id.as_str()).collect();
	let people: Vec<&str> = presence.people.iter().map(|owner| owner.id.as_str()).collect();
	assert_eq!((drawers, people), (vec!["bot-1"], vec!["member-1"]));
	assert_eq!(presence.outlines.len(), 1);
	assert_eq!(presence.pointers.len(), 2);
}

#[test]
fn stopping_stops_the_drawers_of_this_board_only() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.stop_drawers();
	assert_eq!(state.queued, vec![Call::Stop(target())]);
	state.answered(
		Answer::Stopped(Ok(CancelOutcome::Failed { failures: Vec::new() })),
		Instant::now(),
	);
	assert_eq!(
		notice_title(&state).as_deref(),
		Some("Couldn’t stop the agents drawing on this board. Press Stop all to try again.")
	);
}

fn shares(state: &mut State) -> Vec<Call> {
	state
		.queued
		.drain(..)
		.filter(|call| matches!(call, Call::Share { .. } | Call::Wake(_)))
		.collect()
}

fn shared_at(x: i64, y: i64, node_id: Option<&str>) -> Call {
	Call::Share {
		target: target(),
		at: Some(LibraryPresenceAt::Board {
			point: LibraryBoardPoint { x, y },
			node_id: node_id.map(str::to_owned),
		}),
	}
}

#[test]
fn the_pointer_is_shared_at_the_throttled_rate_and_cleared_when_it_leaves() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	let start = Instant::now();
	state.handle(Event::Pointer(Some(Point::new(1.0, 2.0))), start);
	assert_eq!(shares(&mut state), vec![shared_at(1, 2, None)]);
	let soon = start + Duration::from_millis(10);
	state.handle(Event::Pointer(Some(Point::new(3.0, 4.0))), soon);
	state.handle(Event::Pointer(Some(Point::new(5.0, 6.0))), soon);
	assert_eq!(shares(&mut state), vec![Call::Wake(SHARE_INTERVAL - Duration::from_millis(10))]);
	state.answered(Answer::Due, start + SHARE_INTERVAL);
	assert_eq!(shares(&mut state), vec![shared_at(5, 6, None)]);
	let later = start + SHARE_INTERVAL * 3;
	state.handle(Event::Pointer(None), later);
	assert_eq!(shares(&mut state), vec![Call::Share { target: target(), at: None }]);
}

#[test]
fn a_selection_is_shared_with_the_pointer_at_once() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	let start = Instant::now();
	state.handle(Event::Pointer(Some(Point::new(1.0, 2.0))), start);
	shares(&mut state);
	let frame = Frame { selected: Some("a".to_owned()), ..Frame::default() };
	state.handle(Event::Frame(Box::new(frame)), start + Duration::from_millis(1));
	assert_eq!(shares(&mut state), vec![shared_at(1, 2, Some("a"))]);
}

#[test]
fn leaving_the_board_clears_the_shared_pointer() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.handle(Event::Pointer(Some(Point::new(1.0, 2.0))), Instant::now());
	shares(&mut state);
	state.leave();
	assert_eq!(shares(&mut state), vec![Call::Share { target: target(), at: None }]);
}

#[test]
fn a_board_file_replaced_on_disk_raises_the_notice() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.heard(Heard::Replaced(LibraryBoardFileReplaced {
		space_id: SPACE.to_owned(),
		name: BOARD.to_owned(),
	}));
	let notice = state.board.as_ref().and_then(|open| open.notice.clone()).expect("a notice");
	assert_eq!(notice.kind, ToastType::Info);
	assert_eq!(
		notice.title,
		"An edit to Plan made outside Kiroshi was replaced by the live board."
	);
}

#[test]
fn a_renamed_board_is_retitled_and_saves_under_its_new_name() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.heard(Heard::Renamed(LibraryDocumentRenamed {
		space_id: SPACE.to_owned(),
		former_name: BOARD.to_owned(),
		name: "Roadmap.canvas".to_owned(),
	}));
	let name = state.board.as_ref().map(|open| open.target.name.clone());
	assert_eq!(name.as_deref().map(title_of), Some("Roadmap"));
	state
		.handle(Event::Move { id: "a".to_owned(), position: Point::new(1.0, 1.0) }, Instant::now());
	let renamed = Target { space_id: SPACE.to_owned(), name: "Roadmap.canvas".to_owned() };
	assert!(matches!(state.queued.first(), Some(Call::Apply { target, .. }) if *target == renamed));
}

#[test]
fn library_events_are_read_from_their_frames() {
	let payload = json!({ "spaceId": SPACE, "name": BOARD, "update": "AA==" });
	let heard = heard_of("library://document-updated", payload).map(|read| read.ok());
	assert!(matches!(heard, Some(Some(Heard::Updated(_)))));
	assert!(heard_of("conversation://message-stored", json!({})).is_none());
}

#[test]
fn a_pasted_link_lands_as_a_link_card_at_the_point_and_reads_its_preview() {
	let core = Core::holding(vec![]);
	let mut state = opened_on(&core);
	let at = Point::new(500.0, 400.0);
	state
		.handle(Event::Paste { text: " https://example.com/page ".to_owned(), at }, Instant::now());
	let shown = objects(&state);
	let [Object::Item(item)] = shown.as_slice() else { panic!("a card") };
	assert_eq!(item.rect, Rect::new(350.0, 311.0, 300.0, 178.0));
	assert!(matches!(&item.content, Content::Link(card) if card.domain == "example.com"));
	let preview = LibraryLinkPreview {
		url: "https://example.com/page".to_owned(),
		title: "Example".to_owned(),
		site: "example.com".to_owned(),
		image: None,
		alt: None,
		description: Some("A page".to_owned()),
	};
	state.answered(Answer::Previewed { id: item.id.clone(), preview: Ok(preview) }, Instant::now());
	let described = objects(&state);
	let [Object::Item(described)] = described.as_slice() else { panic!("a card") };
	assert!(matches!(&described.content, Content::Link(card) if card.title == "Example"));
	state.handle(Event::Paste { text: "just words".to_owned(), at }, Instant::now());
	assert_eq!(objects(&state).len(), 1);
}

fn library_item(name: &str, kind: LibraryItemKind) -> LibraryItem {
	LibraryItem {
		name: name.to_owned(),
		kind,
		path: name.to_owned(),
		bytes: 1,
		modified_at: 0,
		created_at: None,
	}
}

#[test]
fn dropped_files_are_imported_then_placed_side_by_side() {
	let core = Core::holding(vec![]);
	let mut state = opened_on(&core);
	let paths =
		vec![PathBuf::from("/tmp/a.png"), PathBuf::from("/tmp/b.md"), PathBuf::from("/tmp/c.png")];
	let at = Point::new(0.0, 0.0);
	state.handle(Event::DropFiles { paths: paths.clone(), at }, Instant::now());
	assert_eq!(
		state.queued,
		vec![Call::Import { space_id: SPACE.to_owned(), paths: paths.clone(), at }]
	);
	let imports = vec![
		LibraryImport::Imported { item: library_item("a.png", LibraryItemKind::Image) },
		LibraryImport::Refused {
			error: kiroshi_core::library::contract::LibraryError::Unreadable {
				detail: "no".to_owned(),
			},
		},
		LibraryImport::Imported { item: library_item("c.png", LibraryItemKind::Image) },
	];
	state.answered(Answer::Imported { paths, at, imports: Ok(imports) }, Instant::now());
	let lefts: Vec<f64> = objects(&state)
		.iter()
		.filter_map(|object| object.as_item().map(|item| item.rect.x))
		.collect();
	assert_eq!(lefts.len(), 2);
	assert!(lefts.contains(&-110.0) && lefts.contains(&150.0));
	assert_eq!(notice_title(&state).as_deref(), Some("Couldn’t import b.md"));
}

#[test]
fn a_library_item_picked_or_dropped_lands_at_the_point() {
	let core = Core::holding(vec![]);
	let mut state = opened_on(&core);
	let items = vec![
		library_item("Notes.md", LibraryItemKind::Document),
		library_item(BOARD, LibraryItemKind::Board),
	];
	state.answered(Answer::Listed { space_id: SPACE.to_owned(), items: Ok(items) }, Instant::now());
	let shelf: Vec<&str> = state
		.board
		.as_ref()
		.map(|open| open.shelf.iter().map(|item| item.name.as_str()).collect())
		.unwrap_or_default();
	assert_eq!(shelf, vec!["Notes.md"]);
	state.handle(
		Event::LibraryDrop { id: "Notes.md".to_owned(), at: Point::new(118.0, 65.5) },
		Instant::now(),
	);
	let shown = objects(&state);
	let [Object::Item(item)] = shown.as_slice() else { panic!("a card") };
	assert_eq!(item.rect, Rect::new(0.0, 0.0, 236.0, 131.0));
	assert!(matches!(&item.content, Content::Library(card) if card.title == "Notes.md"));
}

#[test]
fn the_board_card_of_a_named_board_loads_then_shows_its_summary_or_failure() {
	let mut state = State::default();
	state.summarise(SPACE, BOARD);
	assert_eq!(state.queued, vec![Call::Summarise(target())]);
	assert!(matches!(summary_of(state.summaries.get(BOARD), &None), CardSummary::Loading));
	let summary = LibraryBoardSummary {
		name: BOARD.to_owned(),
		node_count: 1,
		nodes: vec![LibraryBoardNode {
			id: "n".to_owned(),
			node_type: "group".to_owned(),
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			colour: None,
		}],
		bounds: Some(LibraryBoardBounds { x: 0, y: 0, width: 10, height: 10 }),
	};
	state.answered(
		Answer::Summarised { target: target(), summary: Ok(summary.clone()) },
		Instant::now(),
	);
	let snapshot = Some(snapshot_of(&summary));
	let loaded = summary_of(state.summaries.get(BOARD), &snapshot);
	assert!(matches!(loaded, CardSummary::Loaded { item_count: 1, .. }));
	let other = Target { space_id: SPACE.to_owned(), name: "Other.canvas".to_owned() };
	state.answered(
		Answer::Summarised { target: other, summary: Err(failed("library_board_summary")) },
		Instant::now(),
	);
	assert!(matches!(summary_of(state.summaries.get("Other.canvas"), &None), CardSummary::Failed));
}

fn ready_app() -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: Space { id: SPACE.to_owned(), name: "Personal".to_owned(), colour: None },
		agents: Vec::new(),
		conversations: Vec::new(),
		person: Person::Unread,
		longest: None,
	});
	app
}

#[test]
fn activating_a_board_card_opens_that_board() {
	let mut app = ready_app();
	open_board(&mut app, BOARD);
	assert!(matches!(app.navigation.main_route(), Route::Boards));
	let open = app.surfaces.s15_boards.board.as_ref().map(|open| open.target.clone());
	assert_eq!(open, Some(target()));
	assert!(app.surfaces.s15_boards.queued.contains(&Call::Open(target())));
}

fn command_z(shift: bool) -> KeyEvent {
	KeyEvent { key: Key::Command('z'), mods: Mods { shift, cmd: true, ..Mods::default() } }
}

#[test]
fn command_z_undoes_and_shift_command_z_redoes_the_last_local_edit() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	state.handle(
		Event::Move { id: "a".to_owned(), position: Point::new(80.0, 0.0) },
		Instant::now(),
	);
	sent_updates(&mut state).iter().for_each(|update| core.applied(update));
	assert!(state.key_pressed(&command_z(false)));
	assert_eq!(field(&held_node(&state, "a"), "x"), json!(0));
	sent_updates(&mut state).iter().for_each(|update| core.applied(update));
	assert_eq!(field(&core.node("a"), "x"), json!(0));
	assert!(state.key_pressed(&command_z(true)));
	assert_eq!(field(&held_node(&state, "a"), "x"), json!(80));
	let plain_z = KeyEvent { key: Key::Text("z".to_owned()), mods: Mods::default() };
	assert!(!state.key_pressed(&plain_z));
}

#[test]
fn an_agent_edit_is_not_undone_by_the_person() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	let agent_move = BoardEdit {
		changed_nodes: vec![ElementChange {
			id: "a".to_owned(),
			element: sticky(300, 0, "1"),
			fields: vec!["x".to_owned()],
		}],
		..BoardEdit::default()
	};
	let update = core.agent_edit(&agent_move);
	state.heard(Heard::Updated(LibraryDocumentUpdated {
		space_id: SPACE.to_owned(),
		name: BOARD.to_owned(),
		update,
	}));
	state.key_pressed(&command_z(false));
	assert_eq!(field(&held_node(&state, "a"), "x"), json!(300));
}

#[test]
fn editing_starts_from_the_text_of_the_object() {
	let core = Core::holding(vec![("a", sticky(0, 0, "1"))]);
	let mut state = opened_on(&core);
	let editing = Editing { id: "a".to_owned(), text: "Hello".to_owned() };
	let frame =
		Frame { selected: Some("a".to_owned()), editing: Some(editing), ..Frame::default() };
	state.handle(Event::Frame(Box::new(frame)), Instant::now());
	assert_eq!(state.edit.text, "Hello");
}

#[test]
fn board_titles_and_link_domains_read_as_apps_app_shows_them() {
	assert_eq!(title_of("Plan.canvas"), "Plan");
	assert_eq!(title_of("Plan.CANVAS"), "Plan");
	assert_eq!(title_of(".canvas"), ".canvas");
	assert_eq!(domain_of("https://user@example.com:8080/a?b"), "example.com");
	assert_eq!(domain_of("not a url"), "not a url");
}
