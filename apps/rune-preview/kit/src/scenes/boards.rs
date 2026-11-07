use rune::{El, col, el, row, text};

use super::{SceneState, stage};
use crate::hues::Preset;
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::strings::common;
use crate::surfaces::s15_boards::canvas::{Board, Editor, board_view, opening_margin};
use crate::surfaces::s15_boards::card::{Card, Drawing, Snapshot, Summary, board_card, miniature};
use crate::surfaces::s15_boards::chrome::{
	Picker, connector_flyout, dock, library_picker, selection_bar,
};
use crate::surfaces::s15_boards::model::{
	ArrowGesture, Connector, Content, Editing, End, Event, FileDrag, FileKind, Frame, Gesture,
	GestureKind, LibraryDrag, Object, Outline, OutlineState, Owner, Point, PointerPlacement, Rect,
	Routing, SectionTint, ShapeFill, ShapeKind, ShapeStyle, Side, Size, StickyColour, Tool,
	Viewport,
};
use crate::surfaces::s15_boards::objects::{
	Sticky, board_text, image, library_card, link_card, section, shape, sticky,
};
use crate::surfaces::s15_boards::palette::palette;
use crate::surfaces::s15_boards::presence::presence_header;
use crate::surfaces::s15_boards::say;
use crate::surfaces::s15_boards::viewport::opening_viewport;
use crate::tokens::{SPACING, Tokens};

pub mod fixtures;

use fixtures::*;

pub const CANVAS: (f32, f32) = (1180.0, 640.0);
pub const EDITED_TEXT: &str = "Draft the launch plan before Friday today";
pub const LAPTOP: (f32, f32) = (1280.0, 640.0);
pub const DOCK_FRAME: (f32, f32) = (1180.0, 520.0);
pub const PRESENCE: (f32, f32) = (1180.0, 640.0);
pub const ANSWER: (f32, f32) = (760.0, 420.0);
pub const NARROW_ANSWER: (f32, f32) = (520.0, 440.0);
pub const COLOURS: (f32, f32) = (960.0, 300.0);
pub const PALETTE: (f32, f32) = (880.0, 420.0);
pub const SECTION: (f32, f32) = (560.0, 360.0);
const AT_ORIGIN: Viewport = Viewport::new(24.0, 24.0, 1.0);
const AT_BOARD_ORIGIN: Viewport = Viewport::new(0.0, 0.0, 1.0);
const PRESENCE_ORIGIN: Viewport = Viewport::new(40.0, 40.0, 1.0);
const HEADER_HEIGHT: f32 = SPACING * 12.0;
const ANSWER_WIDTH: f32 = 680.0;
const NARROW_WIDTH: f32 = 432.0;
const MINIATURE: (f32, f32) = (271.0, 180.0);

fn ignore(_: &mut SceneState, _: Event) {}

fn pictures(s: &SceneState) -> Pictures {
	Pictures::of(&s.board_pictures)
}

struct Spec {
	objects: Vec<Object>,
	viewport: Option<Viewport>,
	area: (f32, f32),
	frame: Frame,
	tool: Tool,
	is_connecting: bool,
	is_loading: bool,
	pointers: Vec<PointerPlacement>,
	outlines: Vec<Outline>,
	edits: bool,
	padding: f32,
}

impl Spec {
	fn new(area: (f32, f32), objects: Vec<Object>) -> Spec {
		Spec {
			objects,
			viewport: Some(AT_ORIGIN),
			area,
			frame: Frame::default(),
			tool: Tool::Select,
			is_connecting: false,
			is_loading: false,
			pointers: Vec::new(),
			outlines: Vec::new(),
			edits: false,
			padding: 0.0,
		}
	}

	fn at(self, viewport: Viewport) -> Spec {
		Spec { viewport: Some(viewport), ..self }
	}

	fn framed(self, frame: Frame) -> Spec {
		Spec { frame, ..self }
	}

	fn selecting(self, id: &str) -> Spec {
		let frame = Frame { selected: Some(id.to_owned()), ..self.frame.clone() };
		Spec { frame, ..self }
	}

	fn tool(self, tool: Tool) -> Spec {
		Spec { tool, ..self }
	}

	fn connecting(self) -> Spec {
		Spec { is_connecting: true, ..self }
	}

	fn routing(self, routing: Routing) -> Spec {
		let frame = Frame { routing, ..self.frame.clone() };
		Spec { frame, ..self }
	}

	fn draw(self, t: &Tokens, s: &SceneState) -> El {
		let inner = Size::new(
			f64::from(self.area.0 - self.padding * 2.0),
			f64::from(self.area.1 - self.padding * 2.0),
		);
		let viewport = self
			.viewport
			.unwrap_or_else(|| opening_viewport(&self.objects, inner, opening_margin()));
		let library = library_items(&pictures(s));
		let board = Board {
			objects: &self.objects,
			viewport,
			area: inner,
			frame: &self.frame,
			tool: self.tool,
			is_connecting: self.is_connecting,
			is_loading: self.is_loading,
			pointers: &self.pointers,
			outlines: &self.outlines,
			library: &library,
		};
		let editor = self
			.edits
			.then_some(Editor { edit: &s.edit, access: |s: &mut SceneState| &mut s.edit });
		rune_kit::root(
			row()
				.w_full()
				.h_full()
				.fill(t.board_surface)
				.padding(self.padding)
				.child(board_view(t, &board, editor, ignore)),
			Vec::new(),
		)
	}
}

fn objects(items: Vec<Object>, connectors: Vec<Connector>) -> Vec<Object> {
	items.into_iter().chain(connectors.into_iter().map(Object::Connector)).collect()
}

fn moved(object: &Object, rect: Rect) -> Gesture {
	Gesture { id: object.id().to_owned(), rect, kind: GestureKind::Move }
}

fn rect_of(object: &Object) -> Rect {
	object.as_item().map_or(Rect::default(), |item| item.rect)
}

fn moved_to(object: Object, x: f64, y: f64) -> Object {
	match object {
		Object::Item(item) => Object::Item(crate::surfaces::s15_boards::model::Item {
			rect: Rect { x, y, ..item.rect },
			..item
		}),
		other => other,
	}
}

fn drawing_arrow(arrow: Connector, ring: Option<&str>, marker: Option<Point>) -> ArrowGesture {
	ArrowGesture {
		has_end: ring.is_some(),
		arrow,
		is_new: true,
		ring: ring.map(str::to_owned),
		marker,
		is_label_sliding: false,
	}
}

pub(super) fn canvas_empty(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, Vec::new()).draw(t, s)
}

pub(super) fn canvas_loading(t: &Tokens, s: &SceneState) -> El {
	let mut spec = Spec::new(CANVAS, five_hundred_objects());
	spec.is_loading = true;
	spec.draw(t, s)
}

pub(super) fn canvas_loaded_with_objects(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, notes(3)).draw(t, s)
}

pub(super) fn canvas_five_hundred_objects(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, five_hundred_objects()).draw(t, s)
}

pub(super) fn canvas_opens_framed_on_spread_content(t: &Tokens, s: &SceneState) -> El {
	Spec { viewport: None, ..Spec::new(CANVAS, spread_board()) }.draw(t, s)
}

pub(super) fn canvas_opens_framed_through_consumer_padding(t: &Tokens, s: &SceneState) -> El {
	Spec { viewport: None, padding: SPACING * 10.0, ..Spec::new(CANVAS, spread_board()) }.draw(t, s)
}

pub(super) fn canvas_opens_at_full_size_on_two_stickies(t: &Tokens, s: &SceneState) -> El {
	Spec { viewport: None, ..Spec::new(CANVAS, two_stickies_board()) }.draw(t, s)
}

pub(super) fn canvas_zoom_at_minimum(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, five_hundred_objects()).at(Viewport::new(24.0, 24.0, 0.1)).draw(t, s)
}

pub(super) fn canvas_zoom_at_maximum(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, five_hundred_objects()).at(Viewport::new(-240.0, -160.0, 4.0)).draw(t, s)
}

pub(super) fn canvas_shape_selected(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board()).selecting("research").draw(t, s)
}

pub(super) fn canvas_sticky_selected(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board()).selecting("plan").draw(t, s)
}

pub(super) fn canvas_move_by_pointer(t: &Tokens, s: &SceneState) -> El {
	let gesture = moved(&plan(), Rect::new(90.0, 70.0, 160.0, 160.0));
	let frame =
		Frame { selected: Some("plan".to_owned()), gesture: Some(gesture), ..Frame::default() };
	Spec::new(LAPTOP, small_board()).at(Viewport::new(24.0, 24.0, 2.0)).framed(frame).draw(t, s)
}

pub(super) fn canvas_resize_by_pointer(t: &Tokens, s: &SceneState) -> El {
	let gesture = Gesture {
		id: "research".to_owned(),
		rect: Rect::new(200.0, 32.0, 224.0, 120.0),
		kind: GestureKind::Resize,
	};
	let frame =
		Frame { selected: Some("research".to_owned()), gesture: Some(gesture), ..Frame::default() };
	Spec::new(LAPTOP, small_board()).at(Viewport::new(24.0, 24.0, 0.5)).framed(frame).draw(t, s)
}

pub(super) fn canvas_edit(t: &Tokens, s: &SceneState) -> El {
	let frame = Frame {
		selected: Some("plan".to_owned()),
		editing: Some(Editing { id: "plan".to_owned(), text: STICKY_TEXT.to_owned() }),
		..Frame::default()
	};
	Spec { edits: true, ..Spec::new(LAPTOP, small_board()).framed(frame) }.draw(t, s)
}

pub(super) fn canvas_move_by_keyboard(t: &Tokens, s: &SceneState) -> El {
	let board = vec![
		moved_to(plan(), 41.0, 50.0),
		research(),
		small_board()[2].clone(),
		small_board()[3].clone(),
	];
	Spec::new(LAPTOP, board).selecting("plan").draw(t, s)
}

pub(super) fn canvas_resize_by_keyboard(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board()).selecting("research").draw(t, s)
}

pub(super) fn canvas_tile_dragged(t: &Tokens, s: &SceneState) -> El {
	let frame = Frame {
		library_drag: Some(LibraryDrag {
			id: "launch-brief".to_owned(),
			at: Point::new(420.0, 260.0),
		}),
		..Frame::default()
	};
	Spec::new(CANVAS, Vec::new()).tool(Tool::Library).framed(frame).draw(t, s)
}

pub(super) fn canvas_library_picker(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, Vec::new()).tool(Tool::Library).draw(t, s)
}

fn pasted(content: Content, size: (f64, f64)) -> Object {
	let centre =
		AT_ORIGIN.to_board(Point::new(f64::from(LAPTOP.0) / 2.0, f64::from(LAPTOP.1) / 2.0));
	Object::Item(item(
		"pasted-3",
		Rect::new(centre.x - size.0 / 2.0, centre.y - size.1 / 2.0, size.0, size.1),
		3,
		content,
	))
}

pub(super) fn canvas_link_pasted(t: &Tokens, s: &SceneState) -> El {
	let link = pasted(Content::Link(fixtures::link_card(&pictures(s))), (300.0, 178.0));
	Spec::new(LAPTOP, vec![plan(), research(), link]).selecting("pasted-3").draw(t, s)
}

pub(super) fn canvas_image_pasted(t: &Tokens, s: &SceneState) -> El {
	let picture = Content::Image {
		picture: pictures(s).terrace,
		alt: "terrace.png".to_owned(),
		source: Some(PASTED_IMAGE_SOURCE.to_owned()),
	};
	Spec::new(LAPTOP, vec![plan(), research(), pasted(picture, (200.0, 136.0))])
		.selecting("pasted-3")
		.draw(t, s)
}

fn dragging_files(kinds: Vec<FileKind>) -> Frame {
	Frame { file_drag: Some(FileDrag { kinds, at: Point::new(590.0, 320.0) }), ..Frame::default() }
}

pub(super) fn canvas_files_images(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, Vec::new()).framed(dragging_files(vec![FileKind::Image; 3])).draw(t, s)
}

pub(super) fn canvas_files_mixed(t: &Tokens, s: &SceneState) -> El {
	let kinds = vec![FileKind::Image, FileKind::File, FileKind::Image];
	Spec::new(CANVAS, Vec::new()).framed(dragging_files(kinds)).draw(t, s)
}

pub(super) fn canvas_files_one(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, Vec::new()).framed(dragging_files(vec![FileKind::File])).draw(t, s)
}

pub(super) fn canvas_files_unknown(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, Vec::new()).framed(dragging_files(Vec::new())).draw(t, s)
}

pub(super) fn canvas_url_dragged_over(t: &Tokens, s: &SceneState) -> El {
	Spec::new(CANVAS, vec![terrace_item(&pictures(s))])
		.framed(dragging_files(vec![FileKind::Image]))
		.draw(t, s)
}

fn connector_board() -> Vec<Object> {
	vec![plan(), review()]
}

pub(super) fn canvas_create_connector(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, objects(connector_board(), vec![drawn_plan_to_review(Routing::Elbow)]))
		.connecting()
		.draw(t, s)
}

pub(super) fn canvas_connector_being_drawn(t: &Tokens, s: &SceneState) -> El {
	let arrow = drawn_plan_to_review(Routing::Elbow);
	let frame =
		Frame { arrow: Some(drawing_arrow(arrow, Some("review"), None)), ..Frame::default() };
	Spec::new(LAPTOP, connector_board()).connecting().framed(frame).draw(t, s)
}

pub(super) fn canvas_create_straight_connector(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, objects(connector_board(), vec![drawn_plan_to_review(Routing::Straight)]))
		.connecting()
		.routing(Routing::Straight)
		.draw(t, s)
}

pub(super) fn canvas_switch_connector_routing(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, objects(connector_board(), vec![plan_to_review(Routing::Elbow)]))
		.selecting("plan-to-review")
		.draw(t, s)
}

pub(super) fn canvas_move_connected_object(t: &Tokens, s: &SceneState) -> El {
	let gesture = moved(&review(), Rect::new(400.0, 320.0, 144.0, 80.0));
	let frame =
		Frame { selected: Some("review".to_owned()), gesture: Some(gesture), ..Frame::default() };
	Spec::new(LAPTOP, objects(connector_board(), vec![plan_to_review(Routing::Straight)]))
		.framed(frame)
		.draw(t, s)
}

pub(super) fn canvas_connector_by_keyboard(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, objects(connector_board(), vec![plan_to_review(Routing::Straight)]))
		.selecting("plan-to-review")
		.draw(t, s)
}

pub(super) fn canvas_cancel_draft_by_escape(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, connector_board()).connecting().draw(t, s)
}

pub(super) fn canvas_connector_with_presence_outline(t: &Tokens, s: &SceneState) -> El {
	let outline = Outline {
		object_id: "plan-to-review".to_owned(),
		owner: Owner::agent("agent-atlas", "Atlas", Some(220.0)),
		state: OutlineState::Writing,
	};
	let mut spec =
		Spec::new(LAPTOP, objects(connector_board(), vec![plan_to_review(Routing::Straight)]));
	spec.outlines = vec![outline];
	spec.draw(t, s)
}

fn arrows(area: (f32, f32), objects: Vec<Object>) -> Spec {
	Spec::new(area, objects).at(AT_BOARD_ORIGIN)
}

fn brief_to_draft(more: impl FnOnce(&mut Connector)) -> Object {
	let mut line = arrow("brief-to-draft", End::of("brief"), End::of("draft"));
	more(&mut line);
	Object::Connector(line)
}

pub(super) fn arrow_quick_release(t: &Tokens, s: &SceneState) -> El {
	arrows(CANVAS, vec![brief(), draft(), brief_to_draft(|_| {})]).draw(t, s)
}

pub(super) fn arrow_exact_point(t: &Tokens, s: &SceneState) -> El {
	let line = brief_to_draft(|line| line.to.anchor = Some(Point::new(0.25, 0.5)));
	arrows(CANVAS, vec![brief(), draft(), line]).draw(t, s)
}

pub(super) fn arrow_curve(t: &Tokens, s: &SceneState) -> El {
	arrows(CANVAS, vec![brief(), draft(), brief_to_draft(|line| line.bend = 66.0)]).draw(t, s)
}

pub(super) fn arrow_elbow(t: &Tokens, s: &SceneState) -> El {
	let line =
		Connector::between("brief-to-launch", End::of("brief"), End::of("launch"), Routing::Elbow);
	arrows(CANVAS, vec![brief(), draft(), launch(), Object::Connector(line)]).draw(t, s)
}

pub(super) fn arrow_label(t: &Tokens, s: &SceneState) -> El {
	let line = brief_to_draft(|line| line.text = "Hands over".to_owned());
	arrows(CANVAS, vec![brief(), draft(), line]).draw(t, s)
}

pub(super) fn arrow_head_sizes(t: &Tokens, s: &SceneState) -> El {
	arrows(CANVAS, head_size_board()).draw(t, s)
}

pub(super) fn arrows_after_board(t: &Tokens, s: &SceneState) -> El {
	arrows(LAPTOP, after_board()).draw(t, s)
}

pub(super) fn arrow_loose_end(t: &Tokens, s: &SceneState) -> El {
	let line = arrow("brief-to-point", End::of("brief"), End::loose(Point::new(480.0, 426.0)));
	arrows(CANVAS, vec![brief(), Object::Connector(line)]).draw(t, s)
}

pub(super) fn arrow_crossing_shape(t: &Tokens, s: &SceneState) -> El {
	let line = arrow("brief-to-launch", End::of("brief"), End::of("launch"));
	arrows(CANVAS, vec![brief(), draft(), launch(), Object::Connector(line)]).draw(t, s)
}

fn hand_board() -> Vec<Object> {
	vec![start(), finish(120.0)]
}

fn hand_draft(to: End, ring: Option<&str>, marker: Option<Point>) -> Frame {
	let line = Connector { from: End::sided("start", Side::Right), to, ..start_to_finish() };
	Frame {
		arrow: Some(drawing_arrow(line, ring, marker)),
		routing: Routing::Straight,
		..Frame::default()
	}
}

pub(super) fn arrow_aimed_at_shape(t: &Tokens, s: &SceneState) -> El {
	arrows(CANVAS, hand_board())
		.connecting()
		.framed(hand_draft(End::of("finish"), Some("finish"), None))
		.draw(t, s)
}

pub(super) fn arrow_released_on_centre(t: &Tokens, s: &SceneState) -> El {
	let line = Connector { from: End::sided("start", Side::Right), ..start_to_finish() };
	arrows(CANVAS, objects(hand_board(), vec![line]))
		.connecting()
		.routing(Routing::Straight)
		.draw(t, s)
}

pub(super) fn arrow_held_on_exact_point(t: &Tokens, s: &SceneState) -> El {
	let to = End::anchored("finish", Point::new(0.25, 0.75));
	let frame = hand_draft(to, Some("finish"), Some(Point::new(440.0, 240.0)));
	arrows(CANVAS, hand_board()).connecting().framed(frame).draw(t, s)
}

pub(super) fn arrow_drawn_with_alt(t: &Tokens, s: &SceneState) -> El {
	let to = End::anchored("finish", Point::new(0.4375, 0.6875));
	arrows(CANVAS, hand_board())
		.connecting()
		.framed(hand_draft(to, Some("finish"), None))
		.draw(t, s)
}

pub(super) fn arrow_drawn_with_ctrl(t: &Tokens, s: &SceneState) -> El {
	let mut frame = hand_draft(End::loose(Point::new(470.0, 230.0)), None, None);
	if let Some(gesture) = frame.arrow.as_mut() {
		gesture.has_end = true;
	}
	arrows(CANVAS, hand_board()).connecting().framed(frame).draw(t, s)
}

pub(super) fn arrow_bent_by_hand(t: &Tokens, s: &SceneState) -> El {
	let line = Connector { bend: 66.0, ..start_to_finish() };
	arrows(CANVAS, objects(hand_board(), vec![line])).selecting("start-to-finish").draw(t, s)
}

pub(super) fn arrow_rerouted_by_hand(t: &Tokens, s: &SceneState) -> El {
	let line = Connector {
		from: End::sided("start", Side::Right),
		to: End::sided("finish", Side::Left),
		routing: Routing::Elbow,
		..start_to_finish()
	};
	arrows(CANVAS, objects(vec![start(), finish(360.0)], vec![line]))
		.selecting("start-to-finish")
		.draw(t, s)
}

pub(super) fn arrow_follows_moved_shape(t: &Tokens, s: &SceneState) -> El {
	let resting = rect_of(&finish(120.0));
	let gesture = moved(&finish(120.0), Rect { y: resting.y + 140.0, ..resting });
	let frame =
		Frame { selected: Some("finish".to_owned()), gesture: Some(gesture), ..Frame::default() };
	arrows(CANVAS, objects(hand_board(), vec![labelled("Hands over", Some(0.3), 40.0)]))
		.framed(frame)
		.draw(t, s)
}

pub(super) fn arrow_label_edited(t: &Tokens, s: &SceneState) -> El {
	arrows(CANVAS, objects(hand_board(), vec![labelled("Hands over to review", None, 0.0)]))
		.selecting("start-to-finish")
		.draw(t, s)
}

pub(super) fn arrow_label_slid(t: &Tokens, s: &SceneState) -> El {
	let slid = labelled("Hands over", Some(0.3), 0.0);
	let frame = Frame {
		selected: Some("start-to-finish".to_owned()),
		arrow: Some(ArrowGesture {
			arrow: slid,
			is_new: false,
			has_end: true,
			ring: None,
			marker: None,
			is_label_sliding: true,
		}),
		..Frame::default()
	};
	arrows(CANVAS, objects(hand_board(), vec![labelled("Hands over", None, 0.0)]))
		.framed(frame)
		.draw(t, s)
}

pub(super) fn arrow_gesture_cancelled(t: &Tokens, s: &SceneState) -> El {
	arrows(CANVAS, objects(hand_board(), vec![labelled("Hands over", Some(0.25), 0.0)]))
		.selecting("start-to-finish")
		.draw(t, s)
}

pub(super) fn canvas_selected_object_removed_elsewhere(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board().into_iter().skip(1).collect()).draw(t, s)
}

fn placed_with(id: &str, rect: Rect, z_order: i32, content: Content) -> Vec<Object> {
	let mut board = small_board();
	board.push(Object::Item(item(id, rect, z_order, content)));
	board
}

pub(super) fn canvas_place_sticky(t: &Tokens, s: &SceneState) -> El {
	let content = sticky_of(StickyColour::Yellow, "", person_author());
	Spec::new(LAPTOP, placed_with("created", Rect::new(600.0, 380.0, 200.0, 200.0), 5, content))
		.selecting("created")
		.draw(t, s)
}

pub(super) fn canvas_place_shape(t: &Tokens, s: &SceneState) -> El {
	let content = shape_of(ShapeKind::RoundedRectangle, "");
	Spec::new(LAPTOP, placed_with("created", Rect::new(600.0, 420.0, 200.0, 120.0), 5, content))
		.selecting("created")
		.draw(t, s)
}

pub(super) fn canvas_place_text(t: &Tokens, s: &SceneState) -> El {
	let board =
		placed_with("created", Rect::new(580.0, 440.0, 240.0, 80.0), 5, text_of(None, Some("")));
	let frame = Frame {
		selected: Some("created".to_owned()),
		editing: Some(Editing { id: "created".to_owned(), text: String::new() }),
		..Frame::default()
	};
	Spec { edits: true, ..Spec::new(LAPTOP, board).framed(frame) }.draw(t, s)
}

pub(super) fn canvas_place_section(t: &Tokens, s: &SceneState) -> El {
	let content = Content::Section { tint: SectionTint::Blue, title: String::new() };
	Spec::new(LAPTOP, placed_with("created", Rect::new(380.0, 280.0, 640.0, 400.0), -1, content))
		.selecting("created")
		.draw(t, s)
}

pub(super) fn canvas_place_images(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board()).tool(Tool::Image).draw(t, s)
}

pub(super) fn canvas_draw_connector_with_tool(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, objects(connector_board(), vec![drawn_plan_to_review(Routing::Elbow)]))
		.tool(Tool::Connector)
		.draw(t, s)
}

pub(super) fn canvas_pan_with_hand_tool(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board())
		.at(Viewport::new(144.0, -36.0, 1.0))
		.tool(Tool::Hand)
		.selecting("plan")
		.draw(t, s)
}

pub(super) fn canvas_tool_picked_while_selected(t: &Tokens, s: &SceneState) -> El {
	Spec::new(LAPTOP, small_board()).tool(Tool::Sticky).selecting("plan").draw(t, s)
}

fn presence_scene(
	t: &Tokens,
	_: &SceneState,
	outlines: Vec<Outline>,
	pointers: Vec<PointerPlacement>,
	people: Vec<Owner>,
	notice: Option<&str>,
) -> El {
	let cast = presence();
	let agents: Vec<Owner> = outlines.iter().map(|outline| outline.owner.clone()).collect();
	let mut spec = Spec::new((PRESENCE.0, PRESENCE.1 - HEADER_HEIGHT), presence_board(&cast))
		.at(PRESENCE_ORIGIN);
	spec.outlines = outlines;
	spec.pointers = pointers;
	let area = Size::new(f64::from(spec.area.0), f64::from(spec.area.1));
	let library = Vec::new();
	let board = Board {
		objects: &spec.objects,
		viewport: PRESENCE_ORIGIN,
		area,
		frame: &spec.frame,
		tool: Tool::Select,
		is_connecting: false,
		is_loading: false,
		pointers: &spec.pointers,
		outlines: &spec.outlines,
		library: &library,
	};
	let mut layers = Vec::new();
	if let Some(title) = notice {
		layers.push(
			row().pin(None, Some(SPACING * 4.0), Some(SPACING * 4.0), None).w(356.0).child(toast(
				t,
				Toast { kind: ToastType::Error, title, description: "", action: None },
			)),
		);
	}
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.fill(t.background)
			.child(
				row()
					.h(HEADER_HEIGHT)
					.w_full()
					.px(SPACING * 4.0)
					.justify_end()
					.center_y()
					.child(presence_header(t, &people, &agents)),
			)
			.child(board_view::<SceneState>(t, &board, None, ignore)),
		layers,
	)
}

pub(super) fn presence_one_agent(t: &Tokens, s: &SceneState) -> El {
	let cast = presence();
	presence_scene(
		t,
		s,
		vec![atlas_writing(&cast)],
		vec![placed(&cast.atlas, 132.0, 154.0)],
		Vec::new(),
		None,
	)
}

pub(super) fn presence_several_agents(t: &Tokens, s: &SceneState) -> El {
	let cast = presence();
	presence_scene(
		t,
		s,
		vec![atlas_writing(&cast), juniper_drawing(&cast)],
		vec![placed(&cast.atlas, 132.0, 154.0), placed(&cast.juniper, 756.0, 196.0)],
		Vec::new(),
		None,
	)
}

pub(super) fn presence_person_with_agents(t: &Tokens, s: &SceneState) -> El {
	let cast = presence();
	presence_scene(
		t,
		s,
		vec![atlas_writing(&cast), juniper_drawing(&cast)],
		vec![
			placed(&cast.atlas, 132.0, 154.0),
			placed(&cast.juniper, 756.0, 196.0),
			placed(&cast.lena, 300.0, 300.0),
		],
		vec![cast.lena.clone()],
		None,
	)
}

pub(super) fn presence_agents_finished(t: &Tokens, s: &SceneState) -> El {
	let cast = presence();
	presence_scene(
		t,
		s,
		Vec::new(),
		vec![placed(&cast.lena, 300.0, 300.0)],
		vec![cast.lena.clone()],
		None,
	)
}

pub(super) fn presence_long_content(t: &Tokens, s: &SceneState) -> El {
	let cast = presence();
	presence_scene(
		t,
		s,
		Vec::new(),
		vec![placed(&cast.maximilian, 300.0, 300.0)],
		vec![cast.maximilian.clone()],
		None,
	)
}

pub(super) fn presence_stop_all_failure(t: &Tokens, s: &SceneState) -> El {
	let cast = presence();
	let notice = say(common::library::failure::board::STOP_ALL);
	presence_scene(
		t,
		s,
		vec![atlas_writing(&cast), juniper_drawing(&cast)],
		vec![placed(&cast.atlas, 132.0, 154.0), placed(&cast.juniper, 756.0, 196.0)],
		Vec::new(),
		Some(&notice),
	)
}

fn dock_scene(
	t: &Tokens,
	_: &SceneState,
	tool: Tool,
	items: Vec<crate::surfaces::s15_boards::model::LibraryItem>,
) -> El {
	let area = Size::new(f64::from(DOCK_FRAME.0), f64::from(DOCK_FRAME.1));
	let frame = Frame::default();
	let mut board = el().w_full().h_full().fill(t.board_surface).child(dock(t, tool, ignore));
	if tool == Tool::Library {
		let picker = Picker {
			items: &items,
			area,
			centre: Point::default(),
			frame: &frame,
			viewport: AT_BOARD_ORIGIN,
		};
		board = board.child(library_picker(t, &picker, ignore));
	}
	rune_kit::root(board, Vec::new())
}

macro_rules! dock_scenes {
	($($name:ident => $tool:expr),* $(,)?) => {
		$(pub(super) fn $name(t: &Tokens, s: &SceneState) -> El {
			dock_scene(t, s, $tool, Vec::new())
		})*
	};
}

dock_scenes! {
	dock_select => Tool::Select,
	dock_hand => Tool::Hand,
	dock_sticky => Tool::Sticky,
	dock_shape => Tool::Shape,
	dock_text => Tool::Text,
	dock_connector => Tool::Connector,
	dock_section => Tool::Section,
	dock_image => Tool::Image,
	dock_library_empty => Tool::Library,
}

pub(super) fn dock_library(t: &Tokens, s: &SceneState) -> El {
	dock_scene(t, s, Tool::Library, library_items(&pictures(s)))
}

pub(super) fn flyout_straight(t: &Tokens, _: &SceneState) -> El {
	stage(t, connector_flyout(t, Routing::Straight, |_: &mut SceneState, _: Routing| {}))
}

pub(super) fn flyout_elbow(t: &Tokens, _: &SceneState) -> El {
	stage(t, connector_flyout(t, Routing::Elbow, |_: &mut SceneState, _: Routing| {}))
}

pub(super) fn flyout_elbow_in_yellow_space(t: &Tokens, _: &SceneState) -> El {
	let tinted = t.in_space(Some(Preset::Yellow.hue()));
	stage(t, connector_flyout(&tinted, Routing::Elbow, |_: &mut SceneState, _: Routing| {}))
}

pub(super) fn selection_bar_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, selection_bar(t, ShapeStyle::default(), |_: &mut SceneState, _: ShapeStyle| {}))
}

fn sticky_scene(t: &Tokens, colour: StickyColour, text: &str, author: &Owner, caret: bool) -> El {
	let caret = caret.then_some(t.board_sticky_foreground);
	stage(t, sticky(t, &Sticky { colour, text, author, caret }, (160.0, 160.0)))
}

const LONG_STICKY_TEXT: &str = "Draft the launch plan before Friday, list every open question for the pricing page, check the onboarding copy with the support team, and book a review with design for the new empty states.";

pub(super) fn sticky_colours(t: &Tokens, _: &SceneState) -> El {
	let author = agent_author();
	stage(
		t,
		row().gap(SPACING * 4.0).children(StickyColour::ALL.map(|colour| {
			sticky(
				t,
				&Sticky { colour, text: STICKY_TEXT, author: &author, caret: None },
				(160.0, 160.0),
			)
		})),
	)
}

pub(super) fn sticky_agent_author(t: &Tokens, _: &SceneState) -> El {
	sticky_scene(t, StickyColour::Yellow, STICKY_TEXT, &agent_author(), false)
}

pub(super) fn sticky_agent_writing(t: &Tokens, _: &SceneState) -> El {
	sticky_scene(t, StickyColour::Yellow, STICKY_TEXT, &agent_author(), true)
}

pub(super) fn sticky_person_author(t: &Tokens, _: &SceneState) -> El {
	sticky_scene(t, StickyColour::Green, STICKY_TEXT, &person_author(), false)
}

pub(super) fn sticky_long_content(t: &Tokens, _: &SceneState) -> El {
	sticky_scene(t, StickyColour::Pink, LONG_STICKY_TEXT, &agent_author(), false)
}

const HEADING: &str = "Launch week";
const BODY: &str =
	"Everything the team needs before Friday: the plan, the open questions and who owns each one.";

pub(super) fn text_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, board_text(t, Some(HEADING), Some(BODY), 300.0))
}

pub(super) fn text_heading_only(t: &Tokens, _: &SceneState) -> El {
	stage(t, board_text(t, Some(HEADING), None, 300.0))
}

pub(super) fn text_body_only(t: &Tokens, _: &SceneState) -> El {
	stage(t, board_text(t, None, Some(BODY), 300.0))
}

fn shape_scene(t: &Tokens, kind: ShapeKind, fill: ShapeFill, label: &str, size: (f32, f32)) -> El {
	stage(t, shape(t, kind, fill, label, size))
}

pub(super) fn shape_rounded_rectangle(t: &Tokens, _: &SceneState) -> El {
	shape_scene(t, ShapeKind::RoundedRectangle, ShapeFill::Surface, "Research", (144.0, 80.0))
}

pub(super) fn shape_ellipse(t: &Tokens, _: &SceneState) -> El {
	shape_scene(t, ShapeKind::Ellipse, ShapeFill::Surface, "Ship", (136.0, 88.0))
}

macro_rules! fill_scenes {
	($($name:ident => $fill:expr),* $(,)?) => {
		$(pub(super) fn $name(t: &Tokens, _: &SceneState) -> El {
			shape_scene(t, ShapeKind::RoundedRectangle, $fill, "Research", (144.0, 80.0))
		})*
	};
}

fill_scenes! {
	shape_fill_yellow => ShapeFill::Yellow,
	shape_fill_green => ShapeFill::Green,
	shape_fill_blue => ShapeFill::Blue,
	shape_fill_pink => ShapeFill::Pink,
}

pub(super) fn section_blue(t: &Tokens, _: &SceneState) -> El {
	stage(t, section(t, SectionTint::Blue, "Research", (420.0, 240.0)))
}

pub(super) fn section_purple(t: &Tokens, _: &SceneState) -> El {
	stage(t, section(t, SectionTint::Purple, "Ideas", (420.0, 240.0)))
}

pub(super) fn image_default(t: &Tokens, s: &SceneState) -> El {
	let terrace = pictures(s).terrace;
	stage(t, image(t, terrace.as_ref(), "A terrace over the river at dusk", None, (200.0, 136.0)))
}

pub(super) fn image_with_source(t: &Tokens, s: &SceneState) -> El {
	let terrace = pictures(s).terrace;
	stage(
		t,
		image(
			t,
			terrace.as_ref(),
			"A terrace over the river at dusk",
			Some(PASTED_IMAGE_SOURCE),
			(200.0, 136.0),
		),
	)
}

pub(super) fn link_card_default(t: &Tokens, s: &SceneState) -> El {
	stage(t, link_card(t, &fixtures::link_card(&pictures(s)), 300.0))
}

pub(super) fn link_card_long_content(t: &Tokens, s: &SceneState) -> El {
	let card = crate::surfaces::s15_boards::model::LinkCard {
		title: "Designing calm interfaces for busy teams who share one workspace across every timezone".to_owned(),
		description: "How quiet defaults, fewer modes and honest empty states keep a shared workspace readable as it grows, with notes from six teams who moved their planning onto one board and the habits that stuck.".to_owned(),
		..fixtures::link_card(&pictures(s))
	};
	stage(t, link_card(t, &card, 300.0))
}

pub(super) fn library_card_resting(t: &Tokens, _: &SceneState) -> El {
	stage(t, library_card(t, &library_document(), false, 236.0))
}

pub(super) fn library_card_dragging(t: &Tokens, _: &SceneState) -> El {
	stage(t, library_card(t, &library_document(), true, 236.0))
}

fn fitted(t: &Tokens, s: &SceneState, content: Content, size: (f64, f64)) -> El {
	let fit = Object::Item(item("fit", Rect::new(40.0, 40.0, size.0, size.1), 1, content));
	Spec::new(CANVAS, vec![fit]).at(AT_BOARD_ORIGIN).selecting("fit").draw(t, s)
}

fn fitted_image(p: &Pictures) -> Content {
	Content::Image {
		picture: p.terrace.clone(),
		alt: "A terrace over the river at dusk".to_owned(),
		source: Some(PASTED_IMAGE_SOURCE.to_owned()),
	}
}

fn fitted_library(_: &Pictures) -> Content {
	Content::Library(crate::surfaces::s15_boards::model::LibraryCard {
		title: "Terrace at dusk".to_owned(),
		excerpt: String::new(),
	})
}

fn fitted_sticky(_: &Pictures) -> Content {
	sticky_of(StickyColour::Yellow, STICKY_TEXT, agent_author())
}

fn fitted_text(_: &Pictures) -> Content {
	text_of(Some(HEADING), Some(BODY))
}

fn fitted_shape(_: &Pictures) -> Content {
	shape_of(ShapeKind::RoundedRectangle, "Research")
}

fn fitted_section(_: &Pictures) -> Content {
	Content::Section { tint: SectionTint::Blue, title: "Research".to_owned() }
}

fn fitted_link(p: &Pictures) -> Content {
	Content::Link(fixtures::link_card(p))
}

fn fitted_document(_: &Pictures) -> Content {
	Content::Library(library_document())
}

macro_rules! fitted_scenes {
	($($name:ident => ($content:ident, $width:expr, $height:expr)),* $(,)?) => {
		$(pub(super) fn $name(t: &Tokens, s: &SceneState) -> El {
			fitted(t, s, $content(&pictures(s)), ($width, $height))
		})*
	};
}

fitted_scenes! {
	objects_sticky_wider => (fitted_sticky, 320.0, 96.0),
	objects_sticky_narrower => (fitted_sticky, 96.0, 280.0),
	objects_text_wider => (fitted_text, 480.0, 56.0),
	objects_text_narrower => (fitted_text, 160.0, 240.0),
	objects_shape_wider => (fitted_shape, 288.0, 48.0),
	objects_shape_narrower => (fitted_shape, 96.0, 160.0),
	objects_section_wider => (fitted_section, 640.0, 200.0),
	objects_section_narrower => (fitted_section, 240.0, 420.0),
	objects_image_wider => (fitted_image, 400.0, 96.0),
	objects_image_narrower => (fitted_image, 120.0, 240.0),
	objects_link_card_wider => (fitted_link, 480.0, 120.0),
	objects_link_card_narrower => (fitted_link, 200.0, 280.0),
	objects_library_card_wider => (fitted_library, 400.0, 80.0),
	objects_library_card_narrower => (fitted_library, 136.0, 261.0),
	objects_document_card_wider => (fitted_document, 472.0, 64.0),
	objects_document_card_narrower => (fitted_document, 160.0, 240.0),
}

pub const EVERY_OBJECT: (f32, f32) = (1180.0, 720.0);

fn placed_at(x: f32, y: f32, face: El) -> El {
	el().absolute(x, y).child(face)
}

pub(super) fn objects_link_and_image_pasted(t: &Tokens, s: &SceneState) -> El {
	let p = pictures(s);
	let agent = agent_author();
	let person = person_author();
	let note = |colour, text: &str, author: &Owner| {
		sticky(t, &Sticky { colour, text, author, caret: None }, (160.0, 160.0))
	};
	let board = el()
		.size(1120.0, 680.0)
		.child(placed_at(40.0, 40.0, board_text(t, Some(HEADING), Some(BODY), 300.0)))
		.child(placed_at(40.0, 170.0, section(t, SectionTint::Blue, "Research", (560.0, 470.0))))
		.child(placed_at(64.0, 226.0, note(StickyColour::Yellow, STICKY_TEXT, &agent)))
		.child(placed_at(
			240.0,
			226.0,
			note(StickyColour::Green, "Ask support which onboarding step loses people", &person),
		))
		.child(placed_at(
			416.0,
			226.0,
			note(StickyColour::Pink, "Three teams asked for a calmer empty state", &agent),
		))
		.child(placed_at(64.0, 420.0, link_card(t, &fixtures::link_card(&p), 300.0)))
		.child(placed_at(
			384.0,
			420.0,
			image(t, p.pool.as_ref(), "A rooftop pool above the city", None, (200.0, 136.0)),
		))
		.child(placed_at(640.0, 40.0, section(t, SectionTint::Purple, "Ideas", (440.0, 300.0))))
		.child(placed_at(
			664.0,
			96.0,
			shape(t, ShapeKind::RoundedRectangle, ShapeFill::Surface, "Research", (144.0, 80.0)),
		))
		.child(placed_at(
			840.0,
			92.0,
			shape(t, ShapeKind::Ellipse, ShapeFill::Surface, "Ship", (136.0, 88.0)),
		))
		.child(placed_at(
			664.0,
			220.0,
			shape(t, ShapeKind::RoundedRectangle, ShapeFill::Surface, "Measure", (152.0, 72.0)),
		))
		.child(placed_at(
			640.0,
			380.0,
			image(
				t,
				p.terrace.as_ref(),
				"A terrace over the river at dusk",
				Some(PASTED_IMAGE_SOURCE),
				(200.0, 136.0),
			),
		))
		.child(placed_at(864.0, 380.0, library_card(t, &library_document(), false, 236.0)));
	rune_kit::root(
		row().w_full().h_full().fill(t.board_surface).padding(SPACING * 5.0).child(board),
		Vec::new(),
	)
}

fn miniature_scene(
	t: &Tokens,
	bounds: Rect,
	items: &[crate::surfaces::s15_boards::model::Item],
) -> El {
	let area = Size::new(f64::from(MINIATURE.0), f64::from(MINIATURE.1));
	stage(
		t,
		el().size(MINIATURE.0, MINIATURE.1)
			.radius(crate::tokens::RADIUS_CONTROL)
			.clip_rounded(crate::tokens::RADIUS_CONTROL)
			.fill(t.board_surface)
			.border(1.0, t.shell_border)
			.child(miniature(t, &Snapshot { bounds, objects: items }, area, &[], &[])),
	)
}

pub(super) fn miniature_wide_board(t: &Tokens, _: &SceneState) -> El {
	let (bounds, items) = planning_snapshot();
	miniature_scene(t, bounds, &items)
}

pub(super) fn miniature_every_object_kind(t: &Tokens, s: &SceneState) -> El {
	let (bounds, items) = references_snapshot(&pictures(s));
	miniature_scene(t, bounds, &items)
}

pub(super) fn miniature_empty_board(t: &Tokens, _: &SceneState) -> El {
	miniature_scene(t, Rect::default(), &[])
}

const INTRO: &str = "I put the launch week on a board.";

fn answer(t: &Tokens, width: f32, card: El) -> El {
	stage(
		t,
		col()
			.w(width)
			.gap(SPACING * 3.0)
			.child(
				text(INTRO)
					.font(rune::TextStyle {
						line_height: 26.0,
						..rune::TextStyle::new(16.0, 400.0)
					})
					.color(t.foreground),
			)
			.child(card),
	)
}

struct CardSpec {
	title: &'static str,
	summary: CardSummary,
	drawing: Option<(Owner, Option<&'static str>)>,
	pointers: Vec<PointerPlacement>,
	is_open_beside: bool,
	width: f32,
}

enum CardSummary {
	Loading,
	Failed,
	Loaded(usize),
}

impl CardSpec {
	fn drawing() -> CardSpec {
		CardSpec {
			title: BOARD_CARD_TITLE,
			summary: CardSummary::Loaded(6),
			drawing: Some((drawing_agent(), Some("planning-ship"))),
			pointers: vec![drawing_agent_pointer()],
			is_open_beside: false,
			width: ANSWER_WIDTH,
		}
	}

	fn at_rest() -> CardSpec {
		CardSpec { summary: CardSummary::Loaded(14), drawing: None, ..CardSpec::drawing() }
	}

	fn draw(self, t: &Tokens) -> El {
		let (bounds, items) = planning_snapshot();
		let summary = match self.summary {
			CardSummary::Loading => Summary::Loading,
			CardSummary::Failed => Summary::Failed,
			CardSummary::Loaded(item_count) => {
				Summary::Loaded { item_count, snapshot: Snapshot { bounds, objects: &items } }
			}
		};
		let drawing = self
			.drawing
			.as_ref()
			.map(|(agent, object_id)| Drawing { agent, object_id: *object_id });
		let card = Card {
			title: self.title,
			summary,
			drawing,
			edited: "edited just now",
			pointers: &self.pointers,
			is_open_beside: self.is_open_beside,
		};
		answer(t, self.width, board_card(t, &card, self.width, |_: &mut SceneState| {}))
	}
}

pub(super) fn card_drawing(t: &Tokens, _: &SceneState) -> El {
	CardSpec::drawing().draw(t)
}

pub(super) fn card_at_rest(t: &Tokens, _: &SceneState) -> El {
	CardSpec::at_rest().draw(t)
}

pub(super) fn card_loading(t: &Tokens, _: &SceneState) -> El {
	CardSpec { summary: CardSummary::Loading, ..CardSpec::drawing() }.draw(t)
}

pub(super) fn card_failed(t: &Tokens, _: &SceneState) -> El {
	CardSpec { summary: CardSummary::Failed, ..CardSpec::drawing() }.draw(t)
}

pub(super) fn card_drawing_without_object(t: &Tokens, _: &SceneState) -> El {
	CardSpec { drawing: Some((drawing_agent(), None)), ..CardSpec::drawing() }.draw(t)
}

pub(super) fn card_owner_without_hue(t: &Tokens, _: &SceneState) -> El {
	let unpainted = Owner { hue: None, ..drawing_agent() };
	let pointer = PointerPlacement { owner: unpainted.clone(), ..drawing_agent_pointer() };
	CardSpec {
		drawing: Some((unpainted, Some("planning-ship"))),
		pointers: vec![pointer],
		..CardSpec::drawing()
	}
	.draw(t)
}

pub(super) fn card_open_beside(t: &Tokens, _: &SceneState) -> El {
	CardSpec { is_open_beside: true, ..CardSpec::drawing() }.draw(t)
}

pub(super) fn card_long_title(t: &Tokens, _: &SceneState) -> El {
	CardSpec {
		title: "Launch week plan for the spring release across support, sales and the docs team",
		width: NARROW_WIDTH,
		..CardSpec::drawing()
	}
	.draw(t)
}

pub(super) fn board_palette(t: &Tokens, _: &SceneState) -> El {
	stage(t, palette(t))
}
