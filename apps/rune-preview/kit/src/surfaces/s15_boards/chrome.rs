use rune::{
	Align, Color, Cursor, El, Icon, LineCap, Phase, Shape, TextStyle, canvas, col, el, icon, row,
	text,
};

use super::model::{
	Event, FileKind, Frame, LibraryDrag, LibraryFace, LibraryItem, Point, Routing, ShapeFill,
	ShapeKind, ShapeStyle, Size, Tool, Viewport,
};
use super::objects::{LIBRARY_CARD_WIDTH, library_card, shape_fill};
use super::viewport::{is_at_zoom_max, is_at_zoom_min};
use super::{Emit, counted, say};
use crate::icons;
use crate::primitives::{FOCUS_RING_WIDTH, Paint, elevated, instant, ring_tint};
use crate::strings::common::board;
use crate::tokens::{
	RADIUS_LG, SPACING, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_SEMIBOLD, TEXT_SM, TEXT_XS,
	TEXT_XS_MEDIUM, Tokens,
};

pub const DOCK_SIZE: Size = Size::new(409.0, 52.0);
pub const ZOOM_SIZE: Size = Size::new(112.0, 36.0);
pub const CHROME_INSET: f32 = SPACING * 5.0;
const TOOL_SIDE: f32 = SPACING * 10.0;
const TOOL_RADIUS: f32 = 10.0;
const TOOL_GLYPH: f32 = SPACING * 5.0;
const STICKY_SWATCH: f32 = 22.0;
const DOCK_PADDING: f32 = SPACING * 1.5;
const DOCK_RADIUS: f32 = 14.0;
const DIVIDER_HEIGHT: f32 = SPACING * 6.0;
const PICKER_WIDTH: f32 = 328.0;
const PICKER_GAP: f32 = SPACING * 3.0;
const TILE: (f32, f32) = (94.0, 70.0);
const TILE_GAP: f32 = SPACING * 2.0;
const TILES_PER_ROW: usize = 3;
const TILE_RADIUS: f32 = 8.0;
const TILE_SHEET_INSET: (f32, f32) = (14.0, 10.0);
const TILE_TITLE: TextStyle = TextStyle { line_height: 9.0, ..TextStyle::new(7.0, 600.0) };
const ZOOM_BUTTON: f32 = 28.0;
const ZOOM_BUTTON_RADIUS: f32 = 7.0;
const ZOOM_GLYPH: f32 = 14.0;
const ZOOM_LEVEL_WIDTH: f32 = 44.0;
const BAR_HEIGHT: f32 = SPACING * 10.0;
const BAR_RADIUS: f32 = 12.0;
const BAR_CONTROL: f32 = 28.0;
const BAR_CONTROL_RADIUS: f32 = 8.0;
const BAR_SWATCH: f32 = 20.0;
const BAR_SEPARATOR: f32 = SPACING * 5.0;
const FLYOUT_RADIUS: f32 = 10.0;
const OPTION_RADIUS: f32 = 7.0;
const OPTION_GLYPH: f32 = SPACING * 4.0;
const HINT_STICKY: f32 = 52.0;
const HINT_TITLE: TextStyle = TextStyle { line_height: 24.0, ..TextStyle::new(17.0, 600.0) };
const HINT_WIDTH: f32 = 400.0;
const DROP_INSET: f32 = SPACING * 2.0;
const DROP_THUMBNAIL: (f32, f32) = (132.0, 92.0);
const DROP_TILTS: [f32; 3] = [-3.0, 2.0, 7.0];
const DROP_GLYPH: f32 = SPACING * 6.0;
const DEGREE: f32 = std::f32::consts::PI / 180.0;

fn tool_label(tool: Tool) -> String {
	say(match tool {
		Tool::Select => board::dock::tool::SELECT,
		Tool::Hand => board::dock::tool::HAND,
		Tool::Sticky => board::dock::tool::STICKY,
		Tool::Shape => board::dock::tool::SHAPE,
		Tool::Text => board::dock::tool::TEXT,
		Tool::Connector => board::dock::tool::CONNECTOR,
		Tool::Section => board::dock::tool::SECTION,
		Tool::Image => board::dock::tool::IMAGE,
		Tool::Library => board::dock::tool::LIBRARY,
	})
}

fn tool_glyph(tool: Tool) -> Option<&'static Icon> {
	match tool {
		Tool::Select => Some(&icons::CURSOR),
		Tool::Hand => Some(&icons::HAND_OPEN),
		Tool::Sticky => None,
		Tool::Shape => Some(&icons::SHAPES),
		Tool::Text => Some(&icons::TYPE),
		Tool::Connector => Some(&icons::ARROW_UP_RIGHT),
		Tool::Section => Some(&icons::FRAME),
		Tool::Image => Some(&icons::IMAGE),
		Tool::Library => Some(&icons::BOOK),
	}
}

fn focus_ring(t: &Tokens, control: El) -> El {
	control.focusable(true).focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
}

fn dock_tool<S: 'static>(t: &Tokens, tool: Tool, is_active: bool, emit: impl Emit<S>) -> El {
	let paint = if is_active {
		Paint {
			fill: t.user_bubble,
			ink: t.user_bubble_foreground,
			hover_fill: t.user_bubble_hover,
			hover_ink: t.user_bubble_foreground,
		}
	} else {
		Paint {
			fill: t.board_control.alpha(0.0),
			ink: t.board_control_foreground,
			hover_fill: t.muted,
			hover_ink: t.board_control_foreground,
		}
	};
	let glyph = match tool_glyph(tool) {
		Some(glyph) => paint.ink(icon(glyph, TOOL_GLYPH)),
		None => el().size(STICKY_SWATCH, STICKY_SWATCH).radius(3.0).fill(t.board_sticky_yellow),
	};
	let button = row()
		.key(format!("board-dock-{}", tool.name()))
		.size(TOOL_SIDE, TOOL_SIDE)
		.center()
		.radius(TOOL_RADIUS)
		.role("button")
		.label(tool_label(tool))
		.checked(is_active)
		.cursor(Cursor::Pointer)
		.press(if is_active { t.user_bubble_hover } else { t.input })
		.child(glyph)
		.on_press(move |s: &mut S| emit(s, Event::Tool(tool)));
	focus_ring(t, paint.apply(button))
}

fn dock_frame(fill: Color) -> El {
	row()
		.size(DOCK_SIZE.width as f32, DOCK_SIZE.height as f32)
		.padding(DOCK_PADDING)
		.gap(SPACING)
		.center_y()
		.radius(DOCK_RADIUS)
		.fill(fill)
}

fn bottom_centred(content: El) -> El {
	row().pin(Some(0.0), None, Some(0.0), Some(CHROME_INSET)).justify_center().child(content)
}

pub fn dock<S: 'static>(t: &Tokens, tool: Tool, emit: impl Emit<S>) -> El {
	let mut frame = dock_frame(t.board_control).role("toolbar").label(say(board::dock::LABEL));
	for each in Tool::ALL {
		frame = frame.child(dock_tool(t, each, each == tool, emit.clone()));
		if each == Tool::Hand {
			frame =
				frame.child(el().size(1.0, DIVIDER_HEIGHT).fill(t.board_card_border).a11y_hidden());
		}
	}
	bottom_centred(elevated(t, frame))
}

pub fn dock_skeleton(t: &Tokens) -> El {
	bottom_centred(dock_frame(t.border).a11y_hidden())
}

fn library_tool_centre(area: Size) -> f32 {
	((area.width + DOCK_SIZE.width) / 2.0) as f32 - DOCK_PADDING - TOOL_SIDE / 2.0
}

fn picker_origin(area: Size, tiles: usize) -> (f32, f32) {
	let rows = tiles.div_ceil(TILES_PER_ROW).max(1);
	let body = if tiles == 0 { 16.0 } else { rows as f32 * TILE.1 + (rows - 1) as f32 * TILE_GAP };
	let height = SPACING * 3.0 * 2.0 + 16.0 + PICKER_GAP + body;
	let bottom = area.height as f32 - CHROME_INSET - DOCK_SIZE.height as f32 - PICKER_GAP;
	(library_tool_centre(area) - PICKER_WIDTH / 2.0, bottom - height)
}

fn tile_origin(area: Size, tiles: usize, index: usize) -> (f32, f32) {
	let (left, top) = picker_origin(area, tiles);
	let column = (index % TILES_PER_ROW) as f32;
	let line = (index / TILES_PER_ROW) as f32;
	(
		left + SPACING * 3.0 + column * (TILE.0 + TILE_GAP),
		top + SPACING * 3.0 + 16.0 + PICKER_GAP + line * (TILE.1 + TILE_GAP),
	)
}

fn tile_face(t: &Tokens, item: &LibraryItem) -> El {
	match &item.face {
		LibraryFace::Image(picture) => {
			let face = el().size(TILE.0, TILE.1).fill(t.board_card_inset);
			match picture.as_ref().filter(|picture| picture.0.size().is_some()) {
				Some(picture) => face.pixels_fit(picture.0.pixels(), rune::SurfaceFit::Fill),
				None => face,
			}
		}
		LibraryFace::Document { .. } => el().size(TILE.0, TILE.1).fill(t.board_card_inset).child(
			col()
				.pin(
					Some(TILE_SHEET_INSET.0),
					Some(TILE_SHEET_INSET.1),
					Some(TILE_SHEET_INSET.0),
					Some(0.0),
				)
				.padding(SPACING * 1.5)
				.corners([3.0, 3.0, 0.0, 0.0])
				.fill(t.board_card_surface)
				.child(
					text(item.title.clone())
						.font(TILE_TITLE)
						.color(t.board_card_foreground)
						.wrap_anywhere()
						.max_lines(3),
				),
		),
	}
}

pub struct Picker<'a> {
	pub items: &'a [LibraryItem],
	pub area: Size,
	pub centre: Point,
	pub frame: &'a Frame,
	pub viewport: Viewport,
}

fn tile<S: 'static>(t: &Tokens, picker: &Picker, index: usize, emit: impl Emit<S>) -> El {
	let item = &picker.items[index];
	let is_dragged = picker.frame.library_drag.as_ref().is_some_and(|drag| drag.id == item.id);
	let id = item.id.clone();
	let centre = picker.centre;
	let pick = emit.clone();
	let (left, top) = tile_origin(picker.area, picker.items.len(), index);
	let frame = picker.frame.clone();
	let viewport = picker.viewport;
	let mut button = el()
		.key(format!("board-library-tile-{}", item.id))
		.size(TILE.0, TILE.1)
		.radius(TILE_RADIUS)
		.clip_rounded(TILE_RADIUS)
		.role("button")
		.label(item.title.clone())
		.cursor(Cursor::Pointer)
		.on_press({
			let id = id.clone();
			move |s: &mut S| pick(s, Event::LibraryPick { id: id.clone(), at: centre })
		})
		.on_drag(move |s: &mut S, drag, _| {
			let at = Point::new(f64::from(left + drag.x), f64::from(top + drag.y));
			let next = match drag.phase {
				Phase::Up => None,
				Phase::Down | Phase::Move => Some(LibraryDrag { id: id.clone(), at }),
			};
			if drag.phase == Phase::Up && !drag.cancelled() && frame.library_drag.is_some() {
				emit(s, Event::LibraryDrop { id: id.clone(), at: viewport.to_board(at) });
			}
			emit(s, Event::Frame(Box::new(Frame { library_drag: next, ..frame.clone() })));
		});
	button = if is_dragged {
		button.border(1.5, t.user_bubble).border_dash(4.0, 3.0).fill(t.user_bubble.alpha(0.06))
	} else {
		button.child(tile_face(t, item))
	};
	focus_ring(t, instant(button.hover_group()))
}

pub fn library_picker<S: 'static>(t: &Tokens, picker: &Picker, emit: impl Emit<S>) -> El {
	let (left, top) = picker_origin(picker.area, picker.items.len());
	let body = if picker.items.is_empty() {
		text(say(board::picker::EMPTY)).font(TEXT_XS).color(t.muted_foreground)
	} else {
		row()
			.flex_wrap()
			.gap(TILE_GAP)
			.role("group")
			.children((0..picker.items.len()).map(|index| tile(t, picker, index, emit.clone())))
	};
	elevated(
		t,
		col()
			.absolute(left, top)
			.w(PICKER_WIDTH)
			.padding(SPACING * 3.0)
			.gap(PICKER_GAP)
			.radius(DOCK_RADIUS)
			.fill(t.board_control)
			.role("dialog")
			.label(say(board::picker::TITLE))
			.child(
				row()
					.justify_between()
					.gap(SPACING * 3.0)
					.center_y()
					.child(
						text(say(board::picker::TITLE))
							.font(lined(TEXT_COMPACT_SEMIBOLD, 16.0))
							.color(t.foreground),
					)
					.child(text(say(board::picker::HINT)).font(TEXT_XS).color(t.muted_foreground)),
			)
			.child(body),
	)
}

pub fn library_ghost(t: &Tokens, item: &LibraryItem, at: Point) -> El {
	let face = match &item.face {
		LibraryFace::Document { excerpt } => library_card(
			t,
			&super::model::LibraryCard { title: item.title.clone(), excerpt: excerpt.clone() },
			true,
			LIBRARY_CARD_WIDTH,
		),
		LibraryFace::Image(picture) => {
			let height = LIBRARY_CARD_WIDTH * 0.75;
			let face = el()
				.size(LIBRARY_CARD_WIDTH, height)
				.radius(RADIUS_LG)
				.border(1.0, t.board_card_border)
				.fill(t.board_card_inset);
			let face = match picture.as_ref().filter(|picture| picture.0.size().is_some()) {
				Some(picture) => face
					.clip_rounded(RADIUS_LG)
					.pixels_fit(picture.0.pixels(), rune::SurfaceFit::Fill),
				None => face,
			};
			face.rotate(-2.0 * DEGREE).opacity(0.94)
		}
	};
	el().absolute(at.x as f32 - LIBRARY_CARD_WIDTH / 2.0, at.y as f32 - 60.0)
		.a11y_hidden()
		.child(face)
}

fn zoom_button<S: 'static>(
	t: &Tokens,
	glyph: &'static Icon,
	label: String,
	is_disabled: bool,
	on_press: impl Fn(&mut S) + 'static,
) -> El {
	let ink = if is_disabled { t.disabled_foreground } else { t.board_control_foreground };
	let paint = Paint {
		fill: t.board_control.alpha(0.0),
		ink,
		hover_fill: if is_disabled { t.board_control.alpha(0.0) } else { t.muted },
		hover_ink: ink,
	};
	let mut button = row()
		.size(ZOOM_BUTTON, ZOOM_BUTTON)
		.center()
		.radius(ZOOM_BUTTON_RADIUS)
		.role("button")
		.label(label)
		.disabled(is_disabled)
		.child(paint.ink(icon(glyph, ZOOM_GLYPH)));
	if !is_disabled {
		button = button.press(t.input).cursor(Cursor::Pointer).on_press(on_press);
	}
	focus_ring(t, paint.apply(button))
}

pub fn zoom_level(zoom: f64) -> String {
	say(board::zoom::LEVEL).replace("{{percent}}", &((zoom * 100.0).round() as i64).to_string())
}

fn zoom_frame(fill: Color) -> El {
	row()
		.pin(None, None, Some(CHROME_INSET), Some(CHROME_INSET))
		.size(ZOOM_SIZE.width as f32, ZOOM_SIZE.height as f32)
		.padding(SPACING)
		.gap(2.0)
		.center_y()
		.radius(RADIUS_LG)
		.fill(fill)
}

fn level_text(t: &Tokens, zoom: f64) -> El {
	row()
		.w(ZOOM_LEVEL_WIDTH)
		.justify_center()
		.child(text(zoom_level(zoom)).font(ZOOM_LEVEL).color(t.board_control_foreground))
}

pub fn zoom_control<S: 'static>(
	t: &Tokens,
	zoom: f64,
	zoom_out: impl Fn(&mut S) + 'static,
	zoom_in: impl Fn(&mut S) + 'static,
) -> El {
	elevated(
		t,
		zoom_frame(t.board_control)
			.role("group")
			.label(say(board::zoom::CONTROLS))
			.child(zoom_button(
				t,
				&icons::MINUS,
				say(board::zoom::ZOOM_OUT),
				is_at_zoom_min(zoom),
				zoom_out,
			))
			.child(level_text(t, zoom))
			.child(zoom_button(
				t,
				&icons::PLUS,
				say(board::zoom::ZOOM_IN),
				is_at_zoom_max(zoom),
				zoom_in,
			)),
	)
}

pub fn zoom_skeleton(t: &Tokens) -> El {
	zoom_frame(t.border).a11y_hidden()
}

fn bar_control(t: &Tokens, control: El, rest: f32, hover: f32, press: f32) -> El {
	let ink = t.board_selection_bar_foreground;
	let paint = Paint { fill: ink.alpha(rest), ink, hover_fill: ink.alpha(hover), hover_ink: ink };
	focus_ring(
		t,
		paint.apply(
			control
				.radius(BAR_CONTROL_RADIUS)
				.center()
				.cursor(Cursor::Pointer)
				.press(ink.alpha(press)),
		),
	)
}

fn bar_separator(t: &Tokens) -> El {
	el().size(1.0, BAR_SEPARATOR).fill(t.board_selection_bar_foreground.alpha(0.15)).a11y_hidden()
}

fn fill_label(fill: ShapeFill) -> String {
	say(match fill {
		ShapeFill::Surface => board::selection_bar::fill::SURFACE,
		ShapeFill::Yellow => board::selection_bar::fill::YELLOW,
		ShapeFill::Green => board::selection_bar::fill::GREEN,
		ShapeFill::Blue => board::selection_bar::fill::BLUE,
		ShapeFill::Pink => board::selection_bar::fill::PINK,
	})
}

pub fn selection_bar<S: 'static>(
	t: &Tokens,
	style: ShapeStyle,
	on_style: impl Fn(&mut S, ShapeStyle) + Clone + 'static,
) -> El {
	let ink = t.board_selection_bar_foreground;
	let shape_glyph = match style.shape {
		ShapeKind::RoundedRectangle => &icons::SQUARE,
		ShapeKind::Ellipse => &icons::CIRCLE,
	};
	let next_shape = match style.shape {
		ShapeKind::RoundedRectangle => ShapeKind::Ellipse,
		ShapeKind::Ellipse => ShapeKind::RoundedRectangle,
	};
	let pick_shape = on_style.clone();
	let mut bar = row()
		.h(BAR_HEIGHT)
		.padding(SPACING * 1.5)
		.gap(SPACING)
		.center_y()
		.radius(BAR_RADIUS)
		.fill(t.board_selection_bar)
		.role("toolbar")
		.label(say(board::selection_bar::LABEL))
		.child(bar_control(
			t,
			row()
				.h(BAR_CONTROL)
				.padding(SPACING * 1.5)
				.gap(2.0)
				.role("button")
				.label(say(board::selection_bar::SHAPE_TYPE))
				.child(icon(shape_glyph, SPACING * 4.0).color(ink))
				.child(icon(&icons::CHEVRON_DOWN, SPACING * 3.0).color(ink))
				.on_press(move |s: &mut S| {
					pick_shape(s, ShapeStyle { shape: next_shape, ..style })
				}),
			0.12,
			0.18,
			0.24,
		))
		.child(bar_separator(t));
	for fill in ShapeFill::ALL {
		let is_picked = fill == style.fill;
		let ring = if is_picked {
			el().size(BAR_SWATCH, BAR_SWATCH)
				.radius(BAR_SWATCH / 2.0)
				.fill(shape_fill(t, fill))
				.outline(2.0, 0.0, ink)
		} else {
			el().size(BAR_SWATCH, BAR_SWATCH)
				.radius(BAR_SWATCH / 2.0)
				.fill(shape_fill(t, fill))
				.border(1.0, ink.alpha(0.15))
		};
		let pick = on_style.clone();
		bar = bar.child(bar_control(
			t,
			row()
				.size(BAR_CONTROL, BAR_CONTROL)
				.role("button")
				.label(fill_label(fill))
				.checked(is_picked)
				.child(ring)
				.on_press(move |s: &mut S| pick(s, ShapeStyle { fill, ..style })),
			0.0,
			0.10,
			0.20,
		));
	}
	bar.child(bar_separator(t))
		.child(bar_control(
			t,
			row()
				.h(BAR_CONTROL)
				.min_w(BAR_CONTROL)
				.px(SPACING * 1.5)
				.role("button")
				.label(format!(
					"{} {}",
					say(board::selection_bar::TEXT_SIZE),
					say(board::selection_bar::TEXT_SIZE_MEDIUM)
				))
				.child(
					text(say(board::selection_bar::TEXT_SIZE_MEDIUM))
						.font(TEXT_COMPACT_MEDIUM)
						.color(ink),
				),
			0.0,
			0.10,
			0.20,
		))
		.child(bar_control(
			t,
			row()
				.size(BAR_CONTROL, BAR_CONTROL)
				.role("button")
				.label(say(board::selection_bar::MORE))
				.child(icon(&icons::MORE_HORIZONTAL, SPACING * 4.0).color(ink)),
			0.0,
			0.10,
			0.20,
		))
}

pub const SELECTION_BAR_WIDTH: f32 = 288.0;
pub const SELECTION_BAR_HEIGHT: f32 = BAR_HEIGHT;

fn elbow_glyph(ink: Color) -> El {
	let scale = OPTION_GLYPH / 24.0;
	let points: Vec<[f32; 2]> = [[3.0, 19.0], [12.0, 19.0], [12.0, 5.0], [21.0, 5.0]]
		.iter()
		.map(|[x, y]| [x * scale, y * scale])
		.collect();
	canvas(Shape::new().stroke_with(
		points,
		false,
		crate::tokens::ICON_STROKE * scale,
		LineCap::Round,
		ink,
	))
	.size(OPTION_GLYPH, OPTION_GLYPH)
	.a11y_hidden()
}

pub fn connector_flyout<S: 'static>(
	t: &Tokens,
	routing: Routing,
	on_routing: impl Fn(&mut S, Routing) + Clone + 'static,
) -> El {
	let option = |each: Routing| {
		let is_checked = each == routing;
		let ink = if is_checked { t.primary } else { t.board_control_foreground };
		let (glyph, label) = match each {
			Routing::Straight => (
				icon(&icons::SLASH, OPTION_GLYPH).color(ink),
				say(board::connector_flyout::routing::STRAIGHT),
			),
			Routing::Elbow => (elbow_glyph(ink), say(board::connector_flyout::routing::ELBOW)),
		};
		let font = if is_checked { TEXT_COMPACT_SEMIBOLD } else { TEXT_COMPACT_MEDIUM };
		let pick = on_routing.clone();
		let paint = Paint::plain(
			if is_checked { t.board_control_selected } else { t.board_control.alpha(0.0) },
			ink,
		);
		focus_ring(
			t,
			paint.apply(
				row()
					.key(format!("board-connector-option-{each:?}"))
					.px(SPACING * 2.0)
					.py(SPACING * 1.5)
					.gap(SPACING * 1.5)
					.center_y()
					.radius(OPTION_RADIUS)
					.role("radio")
					.checked(is_checked)
					.label(label.clone())
					.cursor(Cursor::Pointer)
					.child(glyph)
					.child(text(label).font(lined(font, 16.0)).color(ink))
					.on_press(move |s: &mut S| pick(s, each)),
			),
		)
	};
	elevated(
		t,
		row()
			.padding(SPACING)
			.gap(SPACING)
			.radius(FLYOUT_RADIUS)
			.fill(t.board_control)
			.role("radiogroup")
			.label(say(board::connector_flyout::LABEL))
			.child(option(Routing::Straight))
			.child(option(Routing::Elbow)),
	)
}

pub fn empty_hint(t: &Tokens) -> El {
	let sticky = |fill: Color, left: f32, top: f32, degrees: f32| {
		el().absolute(left, top)
			.size(HINT_STICKY, HINT_STICKY)
			.radius(3.0)
			.fill(fill)
			.origin(0.0, 0.0)
			.rotate(degrees * DEGREE)
	};
	row()
		.pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
		.padding(SPACING * 6.0)
		.center()
		.a11y_hidden()
		.child(
			col()
				.w_full()
				.max_w(HINT_WIDTH)
				.gap(SPACING * 3.0)
				.items_center()
				.child(
					el().size(88.0, 72.0)
						.child(sticky(t.board_sticky_green, 30.0, 6.0, 8.0))
						.child(sticky(t.board_sticky_yellow, 10.0, 12.0, -5.0)),
				)
				.child(text(say(board::empty::TITLE)).font(HINT_TITLE).color(t.foreground))
				.child(
					text(say(board::empty::BODY))
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.wrap()
						.align(Align::Center),
				),
		)
}

fn drop_label(kinds: &[FileKind]) -> String {
	if kinds.is_empty() {
		return say(board::drop::UNKNOWN);
	}
	if kinds.iter().all(|kind| *kind == FileKind::Image) {
		return counted(board::drop::IMAGES_ONE, board::drop::IMAGES_OTHER, kinds.len());
	}
	counted(board::drop::FILES_ONE, board::drop::FILES_OTHER, kinds.len())
}

pub fn file_drop(t: &Tokens, kinds: &[FileKind], at: Point) -> El {
	let shown: Vec<FileKind> = if kinds.is_empty() { vec![FileKind::File] } else { kinds.to_vec() };
	let mut stack = el().size(DROP_THUMBNAIL.0, DROP_THUMBNAIL.1);
	for (kind, tilt) in shown.iter().zip(DROP_TILTS).rev() {
		let glyph = match kind {
			FileKind::Image => &icons::IMAGE,
			FileKind::File => &icons::FILE_TEXT,
		};
		stack = stack.child(
			row()
				.absolute(0.0, 0.0)
				.size(DROP_THUMBNAIL.0, DROP_THUMBNAIL.1)
				.center()
				.radius(6.0)
				.fill(t.board_card_surface)
				.border(1.0, t.board_card_border)
				.rotate(tilt * DEGREE)
				.child(icon(glyph, DROP_GLYPH).color(t.board_muted_foreground)),
		);
	}
	let ghost = col().gap(SPACING * 3.0).items_center().child(stack).child(
		row()
			.padding(SPACING * 2.0)
			.gap(SPACING * 1.5)
			.center_y()
			.radius(999.0)
			.fill(t.user_bubble)
			.child(icon(&icons::PLUS, 14.0).color(t.user_bubble_foreground))
			.child(
				text(drop_label(kinds))
					.font(lined(TEXT_COMPACT_SEMIBOLD, 16.0))
					.color(t.user_bubble_foreground),
			),
	);
	let ghost_height = DROP_THUMBNAIL.1 + SPACING * 3.0 + 32.0;
	el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
		.a11y_hidden()
		.child(
			el().pin(Some(DROP_INSET), Some(DROP_INSET), Some(DROP_INSET), Some(DROP_INSET))
				.radius(TOOL_RADIUS)
				.border(2.0, t.user_bubble)
				.border_dash(6.0, 4.0)
				.fill(t.user_bubble.alpha(0.04)),
		)
		.child(
			row()
				.absolute(at.x as f32 - 150.0, at.y as f32 - ghost_height / 2.0)
				.w(300.0)
				.justify_center()
				.child(ghost),
		)
}

fn lined(style: TextStyle, height: f32) -> TextStyle {
	TextStyle { line_height: height, ..style }
}

const ZOOM_LEVEL: TextStyle = TextStyle { features: "'tnum' 1", ..TEXT_XS_MEDIUM };
