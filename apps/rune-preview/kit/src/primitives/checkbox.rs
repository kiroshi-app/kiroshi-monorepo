use rune::{Cursor, El, el, icon, row, text};

use super::{DISABLED_OPACITY, FOCUS_RING_WIDTH, instant, ring_tint};
use crate::icons;
use crate::tokens::{SPACING, TEXT_SM, Tokens, faded};

const SIDE: f32 = SPACING * 4.0;
const RADIUS: f32 = 5.0;
const GLYPH: f32 = SPACING * 3.5;

pub fn checkbox(t: &Tokens, label: &str, checked: bool, disabled: bool) -> El {
	let mut box_ = el()
		.key(format!("checkbox-{label}"))
		.size(SIDE, SIDE)
		.radius(RADIUS)
		.center()
		.role("checkbox")
		.label(label)
		.checked(checked);
	box_ = if checked {
		box_.fill(t.primary).child(icon(&icons::CHECK, GLYPH).color(t.primary_foreground))
	} else {
		box_.fill(faded(t.input, 0.9))
	};
	let box_ = instant(box_);
	if disabled {
		return box_.disabled(true).opacity(DISABLED_OPACITY);
	}
	box_.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}

pub fn labelled(t: &Tokens, control: El, label: &str) -> El {
	row()
		.gap(SPACING * 3.0)
		.center_y()
		.child(control)
		.child(text(label.to_owned()).font(TEXT_SM).color(t.foreground))
}
