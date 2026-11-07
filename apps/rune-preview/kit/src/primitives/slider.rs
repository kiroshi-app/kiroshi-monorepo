use rune::{Color, Cursor, El, el};

use super::{DISABLED_OPACITY, focus_ring, instant};
use crate::tokens::{RADIUS_2XL, SPACING, Tokens, faded};

const TRACK: f32 = SPACING;
const THUMB: f32 = SPACING * 4.0;
const THUMB_RING: f32 = 4.0;

pub fn slider(t: &Tokens, label: &str, value: f32, width: f32, disabled: bool) -> El {
	let share = value.clamp(0.0, 1.0);
	let travel = (width - THUMB) * share;
	let thumb = el()
		.key(format!("slider-{label}/thumb"))
		.size(THUMB, THUMB)
		.radius(THUMB / 2.0)
		.fill(Color::WHITE)
		.outline(1.0, 0.0, Color::BLACK.alpha(0.1))
		.shadow(2.0, 6.0, t.popover_shadow)
		.focus_ring(THUMB_RING, 0.0, focus_ring(t, 0.3))
		.absolute(travel, 0.0);
	let slider = el()
		.key(format!("slider-{label}"))
		.size(width, THUMB)
		.role("slider")
		.label(label)
		.range_value(f64::from(share * 100.0), 0.0, 100.0)
		.child(
			el().w(width)
				.h(TRACK)
				.radius(RADIUS_2XL)
				.fill(faded(t.input, 0.9))
				.absolute(0.0, (THUMB - TRACK) / 2.0)
				.child(el().w(width * share).h(TRACK).radius(RADIUS_2XL).fill(t.primary)),
		)
		.child(thumb);
	let slider = instant(slider);
	if disabled {
		return slider.disabled(true).opacity(DISABLED_OPACITY);
	}
	slider.focusable(true).cursor(Cursor::Pointer)
}
