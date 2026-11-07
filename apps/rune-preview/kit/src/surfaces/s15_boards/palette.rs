use rune::{El, col, row, text};

use super::model::{SectionTint, StickyColour};
use super::objects::{section_paint, sticky_fill};
use crate::tokens::{
	RADIUS_LG, RADIUS_MD, RADIUS_SM, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, Tokens,
};

const STICKY_SIDE: f32 = 144.0;
const SECTION_SIZE: (f32, f32) = (256.0, 128.0);

pub fn palette(t: &Tokens) -> El {
	col()
		.gap(SPACING * 8.0)
		.child(row().flex_wrap().gap(SPACING * 4.0).children(StickyColour::ALL.map(|colour| {
			col()
				.w(STICKY_SIDE)
				.min_h(STICKY_SIDE)
				.padding(SPACING * 3.0)
				.gap(SPACING * 3.0)
				.justify_between()
				.radius(RADIUS_SM)
				.fill(sticky_fill(t, colour))
				.child(
					text("Draft the launch plan")
						.font(TEXT_SM)
						.color(t.board_sticky_foreground)
						.wrap(),
				)
				.child(
					text(format!("Ada, {}", colour.name()))
						.font(TEXT_XS)
						.color(t.board_sticky_author_foreground),
				)
		})))
		.child(row().flex_wrap().gap(SPACING * 4.0).children(SectionTint::ALL.map(|tint| {
			let paint = section_paint(t, tint);
			col()
				.w(SECTION_SIZE.0)
				.min_h(SECTION_SIZE.1)
				.padding(SPACING * 3.0)
				.items_start()
				.radius(RADIUS_LG)
				.fill(paint.surface)
				.border(1.0, paint.border)
				.child(
					row().padding(SPACING * 1.5).radius(RADIUS_MD).fill(paint.chip).child(
						text(format!("Research, {}", tint.name()))
							.font(TEXT_SM_MEDIUM)
							.color(paint.title),
					),
				)
		})))
}
