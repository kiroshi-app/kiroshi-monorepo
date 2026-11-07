use rune::{Cursor, El, col, el};

use super::{DISABLED_OPACITY, FOCUS_RING_WIDTH, focus_ring, instant};
use crate::tokens::{SPACING, Tokens, faded};

const SIDE: f32 = SPACING * 4.0;

pub fn radio_group(label: &str, items: impl IntoIterator<Item = El>) -> El {
	col().gap(SPACING * 3.0).role("radiogroup").label(label).children(items)
}

pub fn radio_item(t: &Tokens, label: &str, checked: bool, disabled: bool) -> El {
	let mut ring = el()
		.key(format!("radio-{label}"))
		.size(SIDE, SIDE)
		.radius(SIDE / 2.0)
		.center()
		.role("radio")
		.label(label)
		.checked(checked);
	ring = if checked {
		let dot = if t.dark { SPACING * 2.5 } else { SPACING * 2.0 };
		ring.fill(t.primary).child(el().size(dot, dot).radius(dot / 2.0).fill(t.primary_foreground))
	} else {
		ring.fill(faded(t.input, 0.9))
	};
	let ring = instant(ring);
	if disabled {
		return ring.disabled(true).opacity(DISABLED_OPACITY);
	}
	ring.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		focus_ring(t, 0.3),
	)
}
