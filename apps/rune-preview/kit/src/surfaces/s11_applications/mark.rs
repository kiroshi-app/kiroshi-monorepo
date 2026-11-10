use rune::image::Image;
use rune::{El, Icon, SurfaceFit, el, icon};

use super::{HAIRLINE, outlined};
use crate::icons;
use crate::tokens::{RADIUS_MD, RADIUS_SM, SPACING, Tokens};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MarkSize {
	#[default]
	Md,
	Card,
	Sm,
	Xsm,
	Inline,
	Xs,
}

impl MarkSize {
	fn slot(self) -> (f32, f32, f32) {
		match self {
			MarkSize::Md => (SPACING * 9.0, RADIUS_MD, SPACING * 4.0),
			MarkSize::Card => (SPACING * 8.0, RADIUS_MD, SPACING * 4.0),
			MarkSize::Sm => (SPACING * 7.0, RADIUS_MD, SPACING * 3.5),
			MarkSize::Xsm => (SPACING * 6.0, RADIUS_SM, SPACING * 3.0),
			MarkSize::Inline => (SPACING * 5.5, RADIUS_SM, SPACING * 3.0),
			MarkSize::Xs => (SPACING * 5.0, RADIUS_SM, SPACING * 3.0),
		}
	}
}

#[derive(Clone, Copy)]
pub enum Mark<'a> {
	Picture(&'a Image),
	Drawn(&'static Icon),
	Absent,
	Blank,
}

pub fn mark(t: &Tokens, mark: Mark, size: MarkSize) -> El {
	let (side, radius, glyph) = size.slot();
	let slot = el().size(side, side).center().a11y_hidden();
	let on_surface = |slot: El| outlined(t, slot.fill(t.muted), radius);
	match mark {
		Mark::Picture(image) if image.error().is_none() => slot
			.radius(radius)
			.clip_rounded(radius)
			.pixels_fit(image.pixels(), SurfaceFit::Fill)
			.outline(HAIRLINE, -HAIRLINE, t.image_outline),
		Mark::Drawn(drawing) => on_surface(slot).child(icon(drawing, glyph).color(t.foreground)),
		Mark::Blank => on_surface(slot),
		Mark::Picture(_) | Mark::Absent => {
			on_surface(slot).child(icon(&icons::SERVER, glyph).color(t.muted_foreground))
		}
	}
}
