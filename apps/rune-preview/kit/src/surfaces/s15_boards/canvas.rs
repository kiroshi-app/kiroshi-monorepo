use std::collections::HashMap;
use std::rc::Rc;

use rune::{Color, Cursor, El, Key, Phase, TextEdit, el, row, text, text_input};

use super::chrome::{
	Picker, SELECTION_BAR_HEIGHT, SELECTION_BAR_WIDTH, connector_flyout, dock, dock_skeleton,
	empty_hint, file_drop, library_ghost, library_picker, selection_bar, zoom_control,
	zoom_skeleton,
};
use super::lines::{Ink, LABEL_MIDDLE, Line, Look, dot_grid};
use super::model::{
	ArrowGesture, Connector, Content, Corner, Editing, End, Event, Frame, Gesture, GestureKind,
	Hover, Item, ItemKind, LibraryItem, Object, Outline, OutlineState, Point, PointerPlacement,
	Rect, Routing, ShapeStyle, Side, Size, Tool, Viewport,
};
use super::objects::content;
use super::presence::{outlined, owner_colour, pointer};
use super::route::{
	Arrow, ConnectorEnd, Obstacles, Route, SIDES, anchor_of, bend_through, crossed_rects,
	exact_point_of, fraction_nearest, route_connector, route_connectors, section_title_box,
};
use super::selection::{
	arrow_direction_of, in_reading_order, moved_rect, resized_from_corner, rounded_rect,
	scale_point, to_screen_rect,
};
use super::viewport::{
	cull, grid_screen_pitch, pan_by, pinch_zoom, zoom_around, zoom_step_in, zoom_step_out,
};
use super::{Emit, say};
use crate::primitives::{FOCUS_RING_WIDTH, ring_tint};
use crate::strings::common::board;
use crate::tokens::{SPACING, TEXT_COMPACT_MEDIUM, Tokens};

const FRAME_OUTSET: f64 = 4.0;
const MOVING_OUTSET: f64 = 3.0;
const FOCUS_OUTSET: f32 = 6.0;
const BAR_GAP: f64 = 16.0;
const HANDLE: f32 = 10.0;
const HANDLE_OVERHANG: f32 = 6.0;
const ANCHOR: f32 = 10.0;
const END_HANDLE_RADIUS: f32 = 4.0;
const MIDDLE_HANDLE_RADIUS: f32 = 5.5;
const KEY_STEP: f64 = 1.0;
const KEY_STEP_LARGE: f64 = 10.0;
const PAN_STEP: f64 = 48.0;
const LABEL_SNAP_DISTANCE: f64 = 8.0;
const LABEL_MAX_WIDTH: f32 = 240.0;
const LABEL_HEIGHT: f32 = 24.0;
const CONNECTOR_HIT: f64 = 12.0;
const FLYOUT_SAMPLES: usize = 16;
const FLYOUT_SPAN: f32 = 480.0;
const FLYOUT_HEIGHT: f32 = 36.0;
const OPENING_MARGIN: f64 = 64.0;
#[cfg(test)]
mod tests;

const LABEL_CHIP: rune::TextStyle = rune::TextStyle { line_height: 16.0, ..TEXT_COMPACT_MEDIUM };

pub struct Editor<'a, S> {
	pub edit: &'a TextEdit,
	pub access: fn(&mut S) -> &mut TextEdit,
}

pub struct Board<'a> {
	pub objects: &'a [Object],
	pub viewport: Viewport,
	pub area: Size,
	pub frame: &'a Frame,
	pub tool: Tool,
	pub is_connecting: bool,
	pub is_loading: bool,
	pub pointers: &'a [PointerPlacement],
	pub outlines: &'a [Outline],
	pub library: &'a [LibraryItem],
}

pub fn opening_margin() -> f64 {
	f64::from(super::chrome::CHROME_INSET) + super::chrome::DOCK_SIZE.height + OPENING_MARGIN
}

#[derive(Clone)]
struct Placed {
	id: String,
	rect: Rect,
	z_order: i32,
	kind: ItemKind,
}

struct Shown {
	connector: Connector,
	bounds: Rect,
	route: Route,
	passes_under: Vec<Rect>,
}

struct Scene<'a> {
	board: &'a Board<'a>,
	live: Vec<Object>,
	items: HashMap<&'a str, &'a Item>,
	placed: Rc<Vec<Placed>>,
	routes: HashMap<String, Route>,
	obstacles: Obstacles,
}

fn live_bounds(frame: &Frame, item: &Item) -> Rect {
	match &frame.gesture {
		Some(gesture) if gesture.id == item.id => gesture.rect,
		_ => item.rect,
	}
}

fn end_of(items: &HashMap<&str, &Item>, frame: &Frame, end: &End) -> Option<ConnectorEnd> {
	if let Some(point) = end.point {
		return Some(ConnectorEnd::pointed(Rect::at(point), point));
	}
	let item = items.get(end.item.as_str())?;
	let rect = live_bounds(frame, item);
	Some(ConnectorEnd {
		rect,
		side: end.side,
		point: end.anchor.map(|anchor| exact_point_of(rect, anchor)),
	})
}

fn obstacles_of(items: &[&Item], frame: &Frame) -> Obstacles {
	let mut obstacles = Obstacles::default();
	for item in items {
		let rect = live_bounds(frame, item);
		if item.kind() == ItemKind::Section {
			obstacles.titles.push(section_title_box(rect, item.content.text()));
			obstacles.frames.push(rect);
		} else {
			obstacles.blocks.push(rect);
		}
	}
	obstacles
}

impl<'a> Scene<'a> {
	fn new(board: &'a Board<'a>) -> Scene<'a> {
		let frame = board.frame;
		let changed =
			frame.arrow.as_ref().filter(|gesture| !gesture.is_new).map(|gesture| &gesture.arrow);
		let live: Vec<Object> = board
			.objects
			.iter()
			.map(|object| match (object, changed) {
				(Object::Connector(connector), Some(arrow)) if connector.id == arrow.id => {
					Object::Connector(arrow.clone())
				}
				_ => object.clone(),
			})
			.collect();
		let items: HashMap<&str, &Item> = board
			.objects
			.iter()
			.filter_map(Object::as_item)
			.map(|item| (item.id.as_str(), item))
			.collect();
		let all: Vec<&Item> = board.objects.iter().filter_map(Object::as_item).collect();
		let obstacles = obstacles_of(&all, frame);
		let placed = Rc::new(
			all.iter()
				.map(|item| Placed {
					id: item.id.clone(),
					rect: live_bounds(frame, item),
					z_order: item.z_order,
					kind: item.kind(),
				})
				.collect(),
		);
		let mut ids = Vec::new();
		let mut arrows = Vec::new();
		for connector in live.iter().filter_map(Object::as_connector) {
			if let (Some(source), Some(target)) =
				(end_of(&items, frame, &connector.from), end_of(&items, frame, &connector.to))
			{
				ids.push(connector.id.clone());
				arrows.push(Arrow {
					source,
					target,
					routing: connector.routing,
					bend: connector.bend,
				});
			}
		}
		let routes = ids.into_iter().zip(route_connectors(&arrows, &obstacles)).collect();
		Scene { board, live, items, placed, routes, obstacles }
	}

	fn passes_under(&self, connector: &Connector, route: &Route) -> Vec<Rect> {
		if connector.routing != Routing::Straight {
			return Vec::new();
		}
		let rects: Vec<Rect> = self
			.items
			.values()
			.filter(|item| {
				matches!(item.kind(), ItemKind::Sticky | ItemKind::Shape | ItemKind::Text)
					&& item.id != connector.from.item
					&& item.id != connector.to.item
			})
			.map(|item| live_bounds(self.board.frame, item))
			.collect();
		crossed_rects(route, &rects)
	}

	fn draft_route(&self, arrow: &Connector) -> Option<(Route, Point)> {
		let side = arrow.from.side?;
		let source = end_of(&self.items, self.board.frame, &End::sided(&arrow.from.item, side))?;
		let target =
			end_of(&self.items, self.board.frame, &End { side: None, ..arrow.to.clone() })?;
		let route = route_connector(&source, &target, arrow.routing, 0.0, &self.obstacles, &[]);
		Some((route, anchor_of(source.rect, side)))
	}
}

fn item_at(placed: &[Placed], point: Point, except: &str) -> Option<Placed> {
	placed
		.iter()
		.filter(|item| item.id != except && item.rect.contains(point))
		.max_by_key(|item| (item.kind != ItemKind::Section, item.z_order))
		.cloned()
}

fn kind_label(kind: ItemKind) -> Option<String> {
	let key = match kind {
		ItemKind::Sticky => board::object::kind::STICKY,
		ItemKind::Text => board::object::kind::TEXT,
		ItemKind::Shape => board::object::kind::SHAPE,
		ItemKind::Section => board::object::kind::SECTION,
		ItemKind::Image => board::object::kind::IMAGE,
		ItemKind::Link => board::object::kind::LINK,
		ItemKind::Library | ItemKind::Foreign => return None,
	};
	Some(say(key))
}

fn name_of(item: &Item) -> String {
	let text = item.content.text();
	match kind_label(item.kind()) {
		Some(kind) if text.is_empty() => kind,
		Some(kind) => {
			say(board::object::NAMED).replace("{{kind}}", &kind).replace("{{text}}", text)
		}
		None => text.to_owned(),
	}
}

fn screen_point(viewport: Viewport, point: Point) -> (f32, f32) {
	let at = viewport.to_screen(point);
	(at.x as f32, at.y as f32)
}

fn local(drag_x: f32, drag_y: f32) -> Point {
	Point::new(f64::from(drag_x), f64::from(drag_y))
}

fn with_frame(frame: &Frame, change: impl FnOnce(&mut Frame)) -> Event {
	let mut next = frame.clone();
	change(&mut next);
	Event::Frame(Box::new(next))
}

fn caret_of(item: &Item, outline: Option<&Outline>) -> Option<Color> {
	match (&item.content, outline) {
		(Content::Sticky { .. }, Some(outline)) if outline.state == OutlineState::Writing => {
			Some(owner_colour(&outline.owner))
		}
		_ => None,
	}
}

fn without_text(content: &Content) -> Content {
	match content {
		Content::Sticky { colour, author, .. } => {
			Content::Sticky { colour: *colour, text: String::new(), author: author.clone() }
		}
		Content::Text { .. } => Content::Text { heading: None, body: None },
		Content::Shape { style, .. } => Content::Shape { style: *style, label: String::new() },
		other => other.clone(),
	}
}

fn object_view<S: 'static>(
	t: &Tokens,
	scene: &Scene,
	item: &Item,
	rank: usize,
	editor: Option<&Editor<S>>,
	emit: impl Emit<S>,
) -> El {
	let board = scene.board;
	let frame = board.frame;
	let rect = live_bounds(frame, item);
	let size = (rect.width as f32, rect.height as f32);
	let outline = board.outlines.iter().find(|outline| outline.object_id == item.id);
	let is_edited = frame.editing.as_ref().is_some_and(|editing| editing.id == item.id);
	let shown = if is_edited { without_text(&item.content) } else { item.content.clone() };
	let mut face = content(t, &shown, size, caret_of(item, outline)).clip_rounded(0.0);
	if let Some(outline) = outline {
		face = outlined(face, outline);
	}
	let mut object = el()
		.key(format!("board-object-{}", item.id))
		.absolute(rect.x as f32, rect.y as f32)
		.size(size.0, size.1)
		.role("option")
		.label(name_of(item))
		.checked(frame.selected.as_deref() == Some(item.id.as_str()))
		.tab_index(rank as i32 + 2)
		.focusable(true)
		.focus_ring(FOCUS_RING_WIDTH, FOCUS_OUTSET, ring_tint(t, 0.3))
		.child(face);
	if is_edited && let Some(editor) = editor {
		object = object.child(text_editor(t, item, editor, frame, emit.clone()));
	}
	if board.tool != Tool::Select || board.is_loading {
		return object;
	}
	let id = item.id.clone();
	let select = emit.clone();
	let selected = frame.clone();
	object = object.cursor(Cursor::Pointer).on_press(move |s: &mut S| {
		select(
			s,
			with_frame(&selected, |next| {
				next.selected = Some(id.clone());
				next.editing = None;
			}),
		)
	});
	if item.has_text() {
		let id = item.id.clone();
		let text = item.content.text().to_owned();
		let open = emit.clone();
		let opened = frame.clone();
		object = object.on_double_press(move |s: &mut S| {
			open(
				s,
				with_frame(&opened, |next| {
					next.selected = Some(id.clone());
					next.editing = Some(Editing { id: id.clone(), text: text.clone() });
				}),
			)
		});
	}
	let zoom = board.viewport.zoom;
	let resting = item.rect;
	let id = item.id.clone();
	let drag_emit = emit.clone();
	let dragged = frame.clone();
	object = object.on_drag(move |s: &mut S, drag, _| {
		let delta = Point::new(f64::from(drag.dx) / zoom, f64::from(drag.dy) / zoom);
		let moved = moved_rect(resting, delta);
		match drag.phase {
			Phase::Down | Phase::Move => drag_emit(
				s,
				with_frame(&dragged, |next| {
					next.selected = Some(id.clone());
					next.editing = None;
					next.gesture =
						Some(Gesture { id: id.clone(), rect: moved, kind: GestureKind::Move });
				}),
			),
			Phase::Up => {
				if !drag.cancelled() && moved != resting {
					let rect = rounded_rect(moved);
					drag_emit(
						s,
						Event::Move { id: id.clone(), position: Point::new(rect.x, rect.y) },
					);
				}
				drag_emit(
					s,
					with_frame(&dragged, |next| {
						next.selected = Some(id.clone());
						next.gesture = None;
					}),
				);
			}
		}
	});
	let keyed = item.clone();
	let key_frame = frame.clone();
	object.on_key(move |s: &mut S, key, _| {
		let Some(event) = key_event(&keyed, &key_frame, &key.key, key.mods.shift, key.mods.alt)
		else {
			return false;
		};
		for each in event {
			emit(s, each);
		}
		true
	})
}

fn key_event(item: &Item, frame: &Frame, key: &Key, shift: bool, alt: bool) -> Option<Vec<Event>> {
	if let Some(direction) = arrow_direction_of(key) {
		let delta = scale_point(direction, if shift { KEY_STEP_LARGE } else { KEY_STEP });
		let selected = with_frame(frame, |next| next.selected = Some(item.id.clone()));
		if alt {
			let rect = resized_from_corner(item.rect, Corner::BottomRight, delta);
			return Some(vec![selected, Event::Resize { id: item.id.clone(), rect }]);
		}
		let rect = moved_rect(item.rect, delta);
		return Some(vec![
			selected,
			Event::Move { id: item.id.clone(), position: Point::new(rect.x, rect.y) },
		]);
	}
	match key {
		Key::Enter if item.has_text() => Some(vec![with_frame(frame, |next| {
			next.selected = Some(item.id.clone());
			next.editing =
				Some(Editing { id: item.id.clone(), text: item.content.text().to_owned() });
		})]),
		Key::Delete | Key::Backspace => Some(vec![
			Event::Delete(item.id.clone()),
			with_frame(frame, |next| next.selected = None),
		]),
		Key::Escape => Some(vec![with_frame(frame, |next| {
			next.selected = None;
			next.editing = None;
		})]),
		_ => None,
	}
}

fn text_editor<S: 'static>(
	t: &Tokens,
	item: &Item,
	editor: &Editor<S>,
	frame: &Frame,
	emit: impl Emit<S>,
) -> El {
	let ink = match item.kind() {
		ItemKind::Sticky => t.board_sticky_foreground,
		_ => t.board_foreground,
	};
	let id = item.id.clone();
	let access = editor.access;
	let editing = frame.clone();
	text_input(editor.edit, super::objects::STICKY_TEXT)
		.key(format!("board-text-editor-{}", item.id))
		.pin(Some(16.0), Some(16.0), Some(16.0), None)
		.color(ink)
		.caret(ink, t.selection)
		.label(say(board::object::EDIT_TEXT))
		.tab_index(1)
		.on_edit(access)
		.on_key(move |s: &mut S, key, _| {
			if key.key != Key::Escape {
				return false;
			}
			let text = access(s).text.clone();
			emit(s, Event::EditText { id: id.clone(), text });
			emit(s, with_frame(&editing, |next| next.editing = None));
			true
		})
}

fn selection_frame<S: 'static>(t: &Tokens, board: &Board, item: &Item, emit: impl Emit<S>) -> El {
	let frame = board.frame;
	let rect = to_screen_rect(live_bounds(frame, item), board.viewport);
	let outset = FRAME_OUTSET;
	let box_size = ((rect.width + outset * 2.0) as f32, (rect.height + outset * 2.0) as f32);
	let mut chrome = el()
		.absolute((rect.x - outset) as f32, (rect.y - outset) as f32)
		.size(box_size.0, box_size.1)
		.radius(2.0)
		.border(2.0, t.user_bubble)
		.a11y_hidden();
	if frame.editing.is_some() {
		return chrome;
	}
	for corner in Corner::ALL {
		let left =
			if corner.is_left() { -HANDLE_OVERHANG } else { box_size.0 - HANDLE + HANDLE_OVERHANG };
		let top =
			if corner.is_top() { -HANDLE_OVERHANG } else { box_size.1 - HANDLE + HANDLE_OVERHANG };
		let id = item.id.clone();
		let resting = item.rect;
		let zoom = board.viewport.zoom;
		let dragged = frame.clone();
		let resize = emit.clone();
		chrome = chrome.child(
			el().absolute(left, top)
				.size(HANDLE, HANDLE)
				.radius(2.0)
				.fill(t.card)
				.border(2.0, t.user_bubble)
				.cursor(Cursor::Crosshair)
				.on_drag(move |s: &mut S, drag, _| {
					let delta = Point::new(f64::from(drag.dx) / zoom, f64::from(drag.dy) / zoom);
					let rect = resized_from_corner(resting, corner, delta);
					match drag.phase {
						Phase::Down | Phase::Move => resize(
							s,
							with_frame(&dragged, |next| {
								next.gesture = Some(Gesture {
									id: id.clone(),
									rect,
									kind: GestureKind::Resize,
								});
							}),
						),
						Phase::Up => {
							if !drag.cancelled() && rect != resting {
								resize(
									s,
									Event::Resize { id: id.clone(), rect: rounded_rect(rect) },
								);
							}
							resize(s, with_frame(&dragged, |next| next.gesture = None));
						}
					}
				}),
		);
	}
	chrome
}

fn moving_outline(t: &Tokens, rect: Rect) -> El {
	el().absolute((rect.x - MOVING_OUTSET) as f32, (rect.y - MOVING_OUTSET) as f32)
		.size((rect.width + MOVING_OUTSET * 2.0) as f32, (rect.height + MOVING_OUTSET * 2.0) as f32)
		.radius(6.0)
		.border(1.5, t.user_bubble)
		.a11y_hidden()
}

fn move_ghost(t: &Tokens, rect: Rect) -> El {
	el().absolute(rect.x as f32, rect.y as f32)
		.size(rect.width as f32, rect.height as f32)
		.radius(4.0)
		.border(1.5, t.board_move_ghost)
		.border_dash(4.0, 3.0)
		.a11y_hidden()
}

fn anchor_frame<S: 'static>(
	t: &Tokens,
	scene: &Scene,
	target: &Placed,
	active: Option<Side>,
	has_anchors: bool,
	emit: impl Emit<S>,
) -> El {
	let board = scene.board;
	let rect = to_screen_rect(target.rect, board.viewport);
	let mut frame = el()
		.absolute(rect.x as f32, rect.y as f32)
		.size(rect.width as f32, rect.height as f32)
		.a11y_hidden()
		.child(
			el().absolute(-4.0, -4.0)
				.size(rect.width as f32 + 8.0, rect.height as f32 + 8.0)
				.radius(7.0)
				.border(2.0, t.user_bubble),
		);
	if !has_anchors {
		return frame;
	}
	for side in SIDES {
		let at = anchor_of(Rect::new(0.0, 0.0, rect.width, rect.height), side);
		let is_active = active == Some(side);
		let mut dot = el()
			.absolute(at.x as f32 - ANCHOR / 2.0, at.y as f32 - ANCHOR / 2.0)
			.size(ANCHOR, ANCHOR)
			.radius(ANCHOR / 2.0)
			.border(2.0, t.user_bubble)
			.fill(if is_active { t.user_bubble } else { t.board_surface })
			.cursor(Cursor::Crosshair);
		if is_active {
			dot = dot.outline(3.0, 0.0, t.user_bubble.alpha(0.25));
		}
		frame = frame.child(dot.on_drag(draw_from(scene, target, side, emit.clone())));
	}
	frame
}

fn draw_from<S: 'static>(
	scene: &Scene,
	source: &Placed,
	side: Side,
	emit: impl Emit<S>,
) -> impl Fn(&mut S, &mut rune::Drag, &mut rune::Tx) + 'static {
	let board = scene.board;
	let frame = board.frame.clone();
	let placed = scene.placed.clone();
	let viewport = board.viewport;
	let from = End::sided(&source.id, side);
	let origin = anchor_of(source.rect, side);
	let source_id = source.id.clone();
	move |s: &mut S, drag, _| {
		let at = Point::new(
			origin.x + f64::from(drag.dx) / viewport.zoom,
			origin.y + f64::from(drag.dy) / viewport.zoom,
		);
		let target = item_at(&placed, at, &source_id);
		let to = target.as_ref().map_or(End::loose(at), |target| End::of(&target.id));
		let arrow = Connector::between("", from.clone(), to, frame.routing);
		match drag.phase {
			Phase::Down | Phase::Move => emit(
				s,
				with_frame(&frame, |next| {
					next.arrow = Some(ArrowGesture {
						arrow,
						is_new: true,
						has_end: target.is_some(),
						ring: target.map(|target| target.id),
						marker: None,
						is_label_sliding: false,
					});
				}),
			),
			Phase::Up => {
				for event in arrow_release(&frame, arrow, target.is_some(), drag.cancelled()) {
					emit(s, event);
				}
			}
		}
	}
}

fn arrow_release(
	frame: &Frame,
	arrow: Connector,
	has_target: bool,
	is_cancelled: bool,
) -> Vec<Event> {
	let cleared = with_frame(frame, |next| next.arrow = None);
	if is_cancelled || !has_target {
		return vec![cleared];
	}
	vec![Event::SetArrow(arrow), cleared]
}

fn pointer_report(viewport: Viewport, at: Option<Point>) -> Event {
	Event::Pointer(at.map(|at| viewport.to_board(at)))
}

fn labels(t: &Tokens, board: &Board, shown: &[Shown]) -> Vec<El> {
	shown
		.iter()
		.filter(|line| !line.connector.text.is_empty())
		.map(|line| {
			let at = line.route.along(line.connector.label_position.unwrap_or(LABEL_MIDDLE));
			let (x, y) = screen_point(board.viewport, at);
			let is_selected = board.frame.selected.as_deref() == Some(line.connector.id.as_str());
			let mut chip = row()
				.max_w(LABEL_MAX_WIDTH)
				.padding(SPACING)
				.radius(4.0)
				.fill(t.board_surface)
				.child(
					text(line.connector.text.clone())
						.font(LABEL_CHIP)
						.color(t.board_foreground)
						.wrap_anywhere(),
				);
			if is_selected
				|| board
					.frame
					.label_editing
					.as_ref()
					.is_some_and(|editing| editing.id == line.connector.id)
			{
				chip = chip.outline(1.5, 0.0, t.user_bubble);
			}
			row()
				.absolute(x - LABEL_MAX_WIDTH / 2.0, y - LABEL_HEIGHT / 2.0)
				.w(LABEL_MAX_WIDTH)
				.justify_center()
				.a11y_hidden()
				.child(chip)
		})
		.collect()
}

fn screen_bounds(route: &Route, viewport: Viewport) -> Rect {
	let corners: Vec<Point> = route
		.points
		.iter()
		.copied()
		.chain((0..=FLYOUT_SAMPLES).map(|step| route.along(step as f64 / FLYOUT_SAMPLES as f64)))
		.collect();
	let (mut left, mut top, mut right, mut bottom) =
		(f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
	for corner in corners {
		left = left.min(corner.x);
		top = top.min(corner.y);
		right = right.max(corner.x);
		bottom = bottom.max(corner.y);
	}
	to_screen_rect(Rect::new(left, top, right - left, bottom - top), viewport)
}

fn arrow_handles<S: 'static>(
	t: &Tokens,
	scene: &Scene,
	line: &Shown,
	emit: impl Emit<S>,
) -> Vec<El> {
	let board = scene.board;
	let viewport = board.viewport;
	let route = &line.route;
	let mut handles = Vec::new();
	let ends = [(true, route.points[0]), (false, route.points[route.points.len() - 1])];
	for (is_from, at) in ends {
		let (x, y) = screen_point(viewport, at);
		let frame = board.frame.clone();
		let connector = line.connector.clone();
		let placed = scene.placed.clone();
		let reroute = emit.clone();
		handles.push(
			el().absolute(x - END_HANDLE_RADIUS, y - END_HANDLE_RADIUS)
				.size(END_HANDLE_RADIUS * 2.0, END_HANDLE_RADIUS * 2.0)
				.radius(END_HANDLE_RADIUS)
				.fill(t.board_surface)
				.border(1.5, t.user_bubble)
				.cursor(Cursor::Crosshair)
				.a11y_hidden()
				.on_drag(move |s: &mut S, drag, _| {
					let point = Point::new(
						at.x + f64::from(drag.dx) / viewport.zoom,
						at.y + f64::from(drag.dy) / viewport.zoom,
					);
					let other = if is_from { &connector.to.item } else { &connector.from.item };
					let end = item_at(&placed, point, other)
						.map_or(End::loose(point), |item| End::of(&item.id));
					let mut arrow = connector.clone();
					if is_from {
						arrow.from = end
					} else {
						arrow.to = end
					}
					held(s, &reroute, &frame, arrow, drag, false);
				}),
		);
	}
	let middle = route.along(LABEL_MIDDLE);
	let (x, y) = screen_point(viewport, middle);
	let mut knob = el()
		.absolute(x - MIDDLE_HANDLE_RADIUS, y - MIDDLE_HANDLE_RADIUS)
		.size(MIDDLE_HANDLE_RADIUS * 2.0, MIDDLE_HANDLE_RADIUS * 2.0)
		.radius(MIDDLE_HANDLE_RADIUS)
		.fill(t.user_bubble)
		.a11y_hidden();
	if line.connector.routing == Routing::Straight {
		let frame = board.frame.clone();
		let connector = line.connector.clone();
		let (from, to) = (route.points[0], route.points[route.points.len() - 1]);
		let bend = emit.clone();
		knob = knob.cursor(Cursor::Grab).on_drag(move |s: &mut S, drag, _| {
			let through = Point::new(
				middle.x + f64::from(drag.dx) / viewport.zoom,
				middle.y + f64::from(drag.dy) / viewport.zoom,
			);
			let arrow = Connector { bend: bend_through(from, to, through), ..connector.clone() };
			held(s, &bend, &frame, arrow, drag, false);
		});
	}
	handles.push(knob);
	if !line.connector.text.is_empty() {
		let at = route.along(line.connector.label_position.unwrap_or(LABEL_MIDDLE));
		let (x, y) = screen_point(viewport, at);
		let frame = board.frame.clone();
		let connector = line.connector.clone();
		let route = route.clone();
		let slide = emit.clone();
		handles.push(
			el().absolute(x - 24.0, y - LABEL_HEIGHT / 2.0)
				.size(48.0, LABEL_HEIGHT)
				.cursor(Cursor::Grab)
				.a11y_hidden()
				.on_drag(move |s: &mut S, drag, _| {
					let pointer = Point::new(
						at.x + f64::from(drag.dx) / viewport.zoom,
						at.y + f64::from(drag.dy) / viewport.zoom,
					);
					let position =
						snapped_label_position(&route, fraction_nearest(&route, pointer));
					let arrow = Connector { label_position: Some(position), ..connector.clone() };
					held(s, &slide, &frame, arrow, drag, true);
				}),
		);
	}
	handles
}

fn snapped_label_position(route: &Route, position: f64) -> f64 {
	let at = route.along(position);
	let middle = route.along(LABEL_MIDDLE);
	if (at.x - middle.x).hypot(at.y - middle.y) <= LABEL_SNAP_DISTANCE {
		LABEL_MIDDLE
	} else {
		position
	}
}

fn held<S>(
	s: &mut S,
	emit: &impl Emit<S>,
	frame: &Frame,
	arrow: Connector,
	drag: &rune::Drag,
	is_label: bool,
) {
	match drag.phase {
		Phase::Down | Phase::Move => emit(
			s,
			with_frame(frame, |next| {
				next.arrow = Some(ArrowGesture {
					arrow,
					is_new: false,
					has_end: true,
					ring: None,
					marker: None,
					is_label_sliding: is_label,
				});
			}),
		),
		Phase::Up => {
			if !drag.cancelled() {
				emit(s, Event::SetArrow(arrow));
			}
			emit(s, with_frame(frame, |next| next.arrow = None));
		}
	}
}

fn distance_to_route(route: &Route, point: Point) -> f64 {
	(0..=64)
		.map(|step| route.along(f64::from(step) / 64.0))
		.map(|at| (at.x - point.x).hypot(at.y - point.y))
		.fold(f64::INFINITY, f64::min)
}

fn canvas_events<S: 'static>(root: El, scene: &Scene, emit: impl Emit<S>) -> El {
	let board = scene.board;
	let viewport = board.viewport;
	let area = board.area;
	let centre = Point::new(area.width / 2.0, area.height / 2.0);
	let tool = board.tool;
	let frame = board.frame.clone();
	let routes: Rc<Vec<(String, Route)>> =
		Rc::new(scene.routes.iter().map(|(id, route)| (id.clone(), route.clone())).collect());
	let press = emit.clone();
	let pressed = frame.clone();
	let root = root.on_drag(move |s: &mut S, drag, _| {
		let at = viewport.to_board(local(drag.x, drag.y));
		match (tool, drag.phase) {
			(Tool::Hand, Phase::Down) => {
				press(s, with_frame(&pressed, |next| next.pan_origin = Some(viewport)))
			}
			(Tool::Hand, Phase::Move) => {
				let origin = pressed.pan_origin.unwrap_or(viewport);
				press(
					s,
					Event::Viewport(pan_by(
						origin,
						Point::new(-f64::from(drag.dx), -f64::from(drag.dy)),
					)),
				);
			}
			(Tool::Hand, Phase::Up) => {
				press(s, with_frame(&pressed, |next| next.pan_origin = None))
			}
			(Tool::Sticky | Tool::Shape | Tool::Text | Tool::Section, Phase::Up) => {
				if let Some(size) = tool.created_size() {
					let rect = Rect::new(
						(at.x - size.width / 2.0).round(),
						(at.y - size.height / 2.0).round(),
						size.width,
						size.height,
					);
					press(s, Event::Place { tool, rect });
					press(s, Event::Tool(Tool::Select));
				}
			}
			(Tool::Image, Phase::Up) => {
				press(s, Event::ChooseImages { at });
				press(s, Event::Tool(Tool::Select));
			}
			(Tool::Select | Tool::Connector, Phase::Down) => {
				let hit = routes
					.iter()
					.find(|(_, route)| {
						distance_to_route(route, at) * viewport.zoom <= CONNECTOR_HIT
					})
					.map(|(id, _)| id.clone());
				press(
					s,
					with_frame(&pressed, |next| {
						next.selected = hit.clone();
						next.editing = None;
						next.arrow = None;
					}),
				);
			}
			_ => {}
		}
	});
	let wheel = emit.clone();
	let magnify = emit.clone();
	let keys = emit.clone();
	let paste = emit.clone();
	let drop = emit.clone();
	let hover = emit.clone();
	let drop_move = emit.clone();
	let pointer = emit.clone();
	let key_frame = frame.clone();
	let drop_frame = frame.clone();
	let move_frame = frame.clone();
	let selected_connector = frame
		.selected
		.as_ref()
		.and_then(|id| {
			board
				.objects
				.iter()
				.filter_map(Object::as_connector)
				.find(|connector| &connector.id == id)
		})
		.cloned();
	root.on_wheel(move |s: &mut S, event, _| {
		let next = if event.mods.cmd {
			zoom_around(
				viewport,
				pinch_zoom(viewport.zoom, -f64::from(event.dy)),
				local(event.x, event.y),
			)
		} else {
			pan_by(viewport, Point::new(-f64::from(event.dx), -f64::from(event.dy)))
		};
		wheel(s, Event::Viewport(next));
		true
	})
	.on_magnify(move |s: &mut S, event, _| {
		let next = zoom_around(
			viewport,
			viewport.zoom * (1.0 + f64::from(event.delta)),
			local(event.x, event.y),
		);
		magnify(s, Event::Viewport(next));
		true
	})
	.on_key(move |s: &mut S, key, _| {
		if key.key == Key::Escape && (key_frame.arrow.is_some() || key_frame.selected.is_some()) {
			keys(
				s,
				with_frame(&key_frame, |next| {
					next.arrow = None;
					next.selected = None;
					next.editing = None;
				}),
			);
			return true;
		}
		if let Some(connector) = &selected_connector {
			match key.key {
				Key::Delete | Key::Backspace => {
					keys(s, Event::Delete(connector.id.clone()));
					keys(s, with_frame(&key_frame, |next| next.selected = None));
					return true;
				}
				Key::Enter => {
					keys(
						s,
						with_frame(&key_frame, |next| {
							next.label_editing = Some(Editing {
								id: connector.id.clone(),
								text: connector.text.clone(),
							});
						}),
					);
					return true;
				}
				_ => {}
			}
		}
		let Some(direction) = arrow_direction_of(&key.key) else { return false };
		keys(s, Event::Viewport(pan_by(viewport, scale_point(direction, PAN_STEP))));
		true
	})
	.on_paste(move |s: &mut S, pasted, _| {
		let link = pasted.trim();
		if link.starts_with("http://") || link.starts_with("https://") {
			paste(s, Event::Paste { text: link.to_owned(), at: viewport.to_board(centre) });
		}
	})
	.on_drop_files(move |s: &mut S, paths, tx| {
		let at = tx.drop_point().map_or(centre, |point| local(point.x, point.y));
		drop(s, Event::DropFiles { paths: paths.to_vec(), at: viewport.to_board(at) });
		drop(s, with_frame(&drop_frame, |next| next.file_drag = None));
	})
	.on_drop_hover(move |s: &mut S, is_over, _| {
		if !is_over {
			hover(s, with_frame(&frame, |next| next.file_drag = None));
		}
	})
	.on_drop_move(move |s: &mut S, at, _| {
		drop_move(
			s,
			with_frame(&move_frame, |next| {
				next.file_drag =
					Some(super::model::FileDrag { kinds: Vec::new(), at: local(at.x, at.y) });
			}),
		);
	})
	.on_pointer_move_local({
		let pointer = pointer.clone();
		move |s: &mut S, at, _| pointer(s, pointer_report(viewport, Some(local(at.x, at.y))))
	})
	.on_hover_change(move |s: &mut S, is_over, _| {
		if !is_over {
			pointer(s, pointer_report(viewport, None));
		}
	})
}

pub fn board_view<S: 'static>(
	t: &Tokens,
	board: &Board,
	editor: Option<Editor<S>>,
	emit: impl Emit<S>,
) -> El {
	let area = board.area;
	let viewport = board.viewport;
	let frame = board.frame;
	let mut root = el()
		.key("board-canvas")
		.size(area.width as f32, area.height as f32)
		.fill(t.board_surface)
		.clip_rounded(0.0)
		.role("application")
		.label(say(board::canvas::LABEL))
		.child(dot_grid(t, area, viewport.offset, grid_screen_pitch(viewport.zoom)));
	if board.is_loading {
		return root
			.label(say(board::canvas::LOADING))
			.child(dock_skeleton(t))
			.child(zoom_skeleton(t));
	}
	let scene = Scene::new(board);
	let mounted = cull(&scene.live, viewport, area);
	let mut mounted_items: Vec<&Item> =
		mounted.iter().filter_map(|culled| culled.object.as_item()).collect();
	let reading: Vec<String> = in_reading_order(mounted_items.iter().copied())
		.iter()
		.map(|item| item.id.clone())
		.collect();
	mounted_items.sort_by_key(|item| item.z_order);
	let shown: Vec<Shown> = mounted
		.iter()
		.filter_map(|culled| Some((culled.object.as_connector()?, culled.bounds)))
		.filter_map(|(connector, bounds)| {
			let route = scene.routes.get(&connector.id)?.clone();
			let passes_under = scene.passes_under(connector, &route);
			Some(Shown { connector: connector.clone(), bounds, route, passes_under })
		})
		.collect();
	let moved = frame.gesture.as_ref().filter(|gesture| gesture.kind == GestureKind::Move);
	if let Some(item) = moved.and_then(|gesture| scene.items.get(gesture.id.as_str())) {
		root = root.child(move_ghost(t, to_screen_rect(item.rect, viewport)));
	}
	let mut layer = el()
		.absolute(viewport.offset.x as f32, viewport.offset.y as f32)
		.size(0.0, 0.0)
		.origin(0.0, 0.0)
		.scale(viewport.zoom as f32)
		.role("listbox")
		.label(say(board::canvas::OBJECTS));
	for item in &mounted_items {
		let rank = reading.iter().position(|id| *id == item.id).unwrap_or(0);
		layer = layer.child(object_view(t, &scene, item, rank, editor.as_ref(), emit.clone()));
	}
	for line in &shown {
		if let Some(outline) =
			board.outlines.iter().find(|outline| outline.object_id == line.connector.id)
		{
			let span = line.bounds;
			let ring = el()
				.absolute(span.x as f32, span.y as f32)
				.size(span.width as f32, span.height as f32);
			layer = layer.child(outlined(ring, outline));
		}
	}
	root = root.child(layer);
	let mut ink = Ink::new(viewport);
	for line in &shown {
		let is_selected = frame.selected.as_deref() == Some(line.connector.id.as_str());
		let held = frame
			.arrow
			.as_ref()
			.filter(|gesture| !gesture.is_new && gesture.arrow.id == line.connector.id);
		ink.line(
			t,
			&Line {
				route: &line.route,
				look: if is_selected { Look::Selected } else { Look::Rest },
				head: line.connector.head_size,
				passes_under: &line.passes_under,
				has_halo: is_selected,
				marker: held.and_then(|gesture| gesture.marker),
				has_middle_tick: held.is_some_and(|gesture| gesture.is_label_sliding),
			},
		);
	}
	let draft = frame.arrow.as_ref().filter(|gesture| gesture.is_new);
	if let Some(gesture) = draft
		&& let Some((route, source)) = scene.draft_route(&gesture.arrow)
	{
		let is_pointed = gesture.has_end
			&& (gesture.arrow.to.anchor.is_some() || gesture.arrow.to.point.is_some());
		ink.line(
			t,
			&Line {
				route: &route,
				look: Look::Draft,
				head: gesture.arrow.head_size,
				passes_under: &[],
				has_halo: is_pointed,
				marker: gesture.marker,
				has_middle_tick: false,
			},
		);
		ink.source_dot(t, source);
	}
	if !ink.is_empty() {
		root = root.child(ink.draw(area));
	}
	root = root.children(labels(t, board, &shown));
	let is_connecting = board.is_connecting || board.tool == Tool::Connector;
	let ringed = match &frame.arrow {
		Some(gesture) => gesture.ring.as_ref(),
		None if is_connecting => frame.hover.as_ref().map(|hover: &Hover| &hover.id),
		None => None,
	};
	let draft_source = draft.map(|gesture| gesture.arrow.from.item.clone());
	if let Some(target) = ringed.and_then(|id| scene.placed.iter().find(|placed| &placed.id == id))
		&& draft_source.as_deref() != Some(target.id.as_str())
	{
		let active = frame
			.hover
			.as_ref()
			.filter(|hover| hover.id == target.id)
			.and_then(|hover| hover.anchor);
		root = root.child(anchor_frame(
			t,
			&scene,
			target,
			active,
			frame.arrow.is_none(),
			emit.clone(),
		));
	}
	let selected = frame.selected.as_ref().and_then(|id| scene.items.get(id.as_str()).copied());
	if let Some(item) = selected {
		let rect = to_screen_rect(live_bounds(frame, item), viewport);
		let is_moving_shape =
			moved.is_some_and(|gesture| gesture.id == item.id) && item.kind() == ItemKind::Shape;
		root = root.child(if is_moving_shape {
			moving_outline(t, rect)
		} else {
			selection_frame(t, board, item, emit.clone())
		});
		if let Content::Shape { style, .. } = &item.content
			&& frame.gesture.is_none()
			&& frame.editing.is_none()
		{
			let id = item.id.clone();
			let restyle = emit.clone();
			let left = (rect.x + rect.width / 2.0) as f32 - SELECTION_BAR_WIDTH / 2.0;
			let top = (rect.y - FRAME_OUTSET - BAR_GAP) as f32 - SELECTION_BAR_HEIGHT;
			root = root.child(row().absolute(left, top).child(selection_bar(
				t,
				*style,
				move |s: &mut S, style: ShapeStyle| {
					restyle(s, Event::Style { id: id.clone(), style })
				},
			)));
		}
	}
	let selected_line =
		frame.selected.as_ref().and_then(|id| shown.iter().find(|line| &line.connector.id == id));
	if let Some(line) = selected_line {
		root = root.children(arrow_handles(t, &scene, line, emit.clone()));
	}
	if is_connecting || selected_line.is_some() {
		let routing = selected_line.map_or(frame.routing, |line| line.connector.routing);
		let pick_frame = frame.clone();
		let picked = selected_line.map(|line| line.connector.clone());
		let pick = emit.clone();
		let flyout =
			connector_flyout(t, routing, move |s: &mut S, routing: Routing| match &picked {
				Some(connector) => {
					pick(s, Event::SetArrow(Connector { routing, ..connector.clone() }))
				}
				None => pick(s, with_frame(&pick_frame, |next| next.routing = routing)),
			});
		let (centre_x, bottom) = match selected_line {
			Some(line) => {
				let above = screen_bounds(&line.route, viewport);
				((above.x + above.width / 2.0) as f32, (above.y - BAR_GAP) as f32)
			}
			None => ((area.width / 2.0) as f32, area.height as f32 - SPACING * 4.0),
		};
		root = root.child(
			row()
				.absolute(centre_x - FLYOUT_SPAN / 2.0, bottom - FLYOUT_HEIGHT)
				.w(FLYOUT_SPAN)
				.justify_center()
				.child(flyout),
		);
	}
	for placement in board.pointers {
		let (x, y) = screen_point(viewport, placement.position);
		root = root.child(pointer(t, &placement.owner, Point::new(f64::from(x), f64::from(y))));
	}
	if board.objects.is_empty() {
		root = root.child(empty_hint(t));
	}
	if let Some(drag) = &frame.file_drag {
		root = root.child(file_drop(t, &drag.kinds, drag.at));
	}
	root = root.child(dock(t, board.tool, emit.clone()));
	if board.tool == Tool::Library {
		let picker = Picker {
			items: board.library,
			area,
			centre: viewport.to_board(Point::new(area.width / 2.0, area.height / 2.0)),
			frame,
			viewport,
		};
		root = root.child(library_picker(t, &picker, emit.clone()));
	}
	let (zoom_out, zoom_in) = (emit.clone(), emit.clone());
	let centre = Point::new(area.width / 2.0, area.height / 2.0);
	root = root.child(zoom_control(
		t,
		viewport.zoom,
		move |s: &mut S| {
			zoom_out(
				s,
				Event::Viewport(zoom_around(viewport, zoom_step_out(viewport.zoom), centre)),
			)
		},
		move |s: &mut S| {
			zoom_in(s, Event::Viewport(zoom_around(viewport, zoom_step_in(viewport.zoom), centre)))
		},
	));
	if let Some(drag) = &frame.library_drag
		&& let Some(item) = board.library.iter().find(|item| item.id == drag.id)
	{
		root = root.child(library_ghost(t, item, drag.at));
	}
	canvas_events(root.focusable(true), &scene, emit)
}
