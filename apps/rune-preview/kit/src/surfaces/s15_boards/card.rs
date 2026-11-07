use rune::{Cursor, El, TextStyle, col, el, icon, row, text};

use super::lines::dot_grid;
use super::model::{Item, Outline, OutlineState, Owner, Point, PointerPlacement, Rect, Size};
use super::objects::content;
use super::presence::{outlined, pointer};
use super::viewport::fit_bounds;
use super::{counted, say};
use crate::icons;
use crate::primitives::skeleton::skeleton;
use crate::primitives::{FOCUS_RING_WIDTH, Paint, ring_tint};
use crate::strings::common::board;
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_MD, RADIUS_SM, SPACING, TEXT_COMPACT, TEXT_READING, TEXT_XS, Tokens,
};

#[cfg(test)]
mod tests;

const MINIATURE_MARGIN: f64 = 20.0;
const MINIATURE_GRID_PITCH: f64 = 12.0;
pub const PREVIEW_HEIGHT: f32 = 184.0;
const GLYPH_TILE: f32 = SPACING * 7.0;
const LINE_SKELETON: (f32, f32) = (160.0, 16.0);
const TITLE: TextStyle = TextStyle { line_height: 20.0, weight: 600.0, ..TEXT_READING };
const LINE: TextStyle = TextStyle { features: "'tnum' 1", ..TEXT_XS };
const OPEN: TextStyle = TextStyle { line_height: 16.0, ..TEXT_COMPACT };

pub struct Snapshot<'a> {
	pub bounds: Rect,
	pub objects: &'a [Item],
}

pub fn miniature(
	t: &Tokens,
	snapshot: &Snapshot,
	area: Size,
	pointers: &[PointerPlacement],
	outlines: &[Outline],
) -> El {
	let mut frame = el()
		.size(area.width as f32, area.height as f32)
		.clip_rounded(0.0)
		.a11y_hidden()
		.child(dot_grid(t, area, Point::default(), MINIATURE_GRID_PITCH));
	if snapshot.objects.is_empty() {
		return frame;
	}
	let fitted = fit_bounds(snapshot.bounds, area, MINIATURE_MARGIN);
	let mut layer = el()
		.absolute(fitted.offset.x as f32, fitted.offset.y as f32)
		.size(0.0, 0.0)
		.origin(0.0, 0.0)
		.scale(fitted.zoom as f32);
	for item in snapshot.objects {
		let size = (item.rect.width as f32, item.rect.height as f32);
		let mut face = content(t, &item.content, size, None);
		if let Some(outline) = outlines.iter().find(|outline| outline.object_id == item.id) {
			face = outlined(face, outline);
		}
		layer = layer.child(
			el().absolute(item.rect.x as f32, item.rect.y as f32).size(size.0, size.1).child(face),
		);
	}
	frame = frame.child(layer);
	for placement in pointers {
		let at = fitted.to_screen(placement.position);
		frame = frame.child(pointer(t, &placement.owner, Point::new(at.x.round(), at.y.round())));
	}
	frame
}

pub enum Summary<'a> {
	Loading,
	Failed,
	Loaded { item_count: usize, snapshot: Snapshot<'a> },
}

pub struct Drawing<'a> {
	pub agent: &'a Owner,
	pub object_id: Option<&'a str>,
}

pub struct Card<'a> {
	pub title: &'a str,
	pub summary: Summary<'a>,
	pub drawing: Option<Drawing<'a>>,
	pub edited: &'a str,
	pub pointers: &'a [PointerPlacement],
	pub is_open_beside: bool,
}

fn line_of(card: &Card, item_count: usize) -> String {
	match &card.drawing {
		Some(drawing) => counted(board::card::DRAWING_ONE, board::card::DRAWING_OTHER, item_count)
			.replace("{{name}}", &drawing.agent.name),
		None => counted(board::card::AT_REST_ONE, board::card::AT_REST_OTHER, item_count)
			.replace("{{edited}}", card.edited),
	}
}

fn open_button<S: 'static>(t: &Tokens, on_open: impl Fn(&mut S) + 'static) -> El {
	let paint = Paint {
		fill: t.card.alpha(0.0),
		ink: t.foreground,
		hover_fill: t.foreground.alpha(0.08),
		hover_ink: t.foreground,
	};
	paint
		.apply(
			row()
				.key("board-card-open")
				.padding(SPACING * 1.5)
				.gap(SPACING * 1.5)
				.center_y()
				.radius(999.0)
				.role("button")
				.label(say(board::card::OPEN))
				.cursor(Cursor::Pointer)
				.press(t.foreground.alpha(0.12))
				.child(icon(&icons::PANEL_RIGHT, 14.0).color(t.foreground))
				.child(text(say(board::card::OPEN)).font(OPEN).color(t.foreground).mr(SPACING))
				.on_press(on_open),
		)
		.focusable(true)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
}

fn preview(t: &Tokens, card: &Card, snapshot: &Snapshot, width: f32) -> El {
	let outlines: Vec<Outline> = card
		.drawing
		.as_ref()
		.and_then(|drawing| {
			drawing.object_id.map(|id| Outline {
				object_id: id.to_owned(),
				owner: drawing.agent.clone(),
				state: OutlineState::Drawing,
			})
		})
		.into_iter()
		.collect();
	let pointers: Vec<PointerPlacement> = match &card.drawing {
		Some(drawing) => card
			.pointers
			.iter()
			.filter(|placement| placement.owner.id == drawing.agent.id)
			.cloned()
			.collect(),
		None => Vec::new(),
	};
	el().w(width)
		.h(PREVIEW_HEIGHT)
		.radius(RADIUS_MD)
		.clip_rounded(RADIUS_MD)
		.fill(t.board_surface)
		.border(1.0, t.foreground.alpha(0.06))
		.child(miniature(
			t,
			snapshot,
			Size::new(f64::from(width), f64::from(PREVIEW_HEIGHT)),
			&pointers,
			&outlines,
		))
}

pub fn board_card<S: 'static>(
	t: &Tokens,
	card: &Card,
	width: f32,
	on_open: impl Fn(&mut S) + 'static,
) -> El {
	let (border, padding) = if card.is_open_beside { (2.0, 11.0) } else { (1.0, SPACING * 3.0) };
	let border_colour = if card.is_open_beside { t.primary } else { t.border };
	let inner = width - padding * 2.0;
	let line = match &card.summary {
		Summary::Loading => {
			skeleton(t).size(LINE_SKELETON.0, LINE_SKELETON.1).radius(RADIUS_SM).fill(t.border)
		}
		Summary::Failed => {
			text(say(board::card::FAILED)).font(LINE).color(t.muted_foreground).wrap()
		}
		Summary::Loaded { item_count, .. } => {
			text(line_of(card, *item_count)).font(LINE).color(t.muted_foreground).wrap()
		}
	};
	let mut column = col()
		.key("board-card")
		.w(width)
		.padding(padding)
		.gap(SPACING * 3.0)
		.radius(RADIUS_CONTROL)
		.fill(t.card)
		.border(border, border_colour)
		.role("article")
		.label(card.title.to_owned())
		.child(
			row()
				.items_start()
				.gap(SPACING * 2.5)
				.child(
					row()
						.size(GLYPH_TILE, GLYPH_TILE)
						.center()
						.radius(RADIUS_MD)
						.fill(t.muted)
						.a11y_hidden()
						.child(icon(&icons::STICKY_NOTE, SPACING * 4.0).color(t.foreground)),
				)
				.child(
					col()
						.grow(1.0)
						.min_w(0.0)
						.child(
							text(card.title.to_owned())
								.font(TITLE)
								.color(t.foreground)
								.wrap_anywhere(),
						)
						.child(line),
				)
				.child(open_button(t, on_open)),
		);
	match &card.summary {
		Summary::Loaded { snapshot, .. } => {
			column = column.child(preview(t, card, snapshot, inner))
		}
		Summary::Loading => {
			column = column
				.child(skeleton(t).w(inner).h(PREVIEW_HEIGHT).radius(RADIUS_MD).fill(t.border))
		}
		Summary::Failed => {}
	}
	column
}
