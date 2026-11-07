use rune::{Cursor, El, el};

use super::{DISABLED_OPACITY, FOCUS_RING_WIDTH, focus_ring, instant};
use crate::tokens::{RADIUS_2XL, SPACING, Tokens, faded};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SwitchSize {
	Sm,
	#[default]
	Default,
}

const BORDER: f32 = 2.0;

impl SwitchSize {
	fn track(self) -> (f32, f32) {
		match self {
			SwitchSize::Sm => (SPACING * 6.0, SPACING * 4.0),
			SwitchSize::Default => (SPACING * 8.0, SPACING * 5.0),
		}
	}
}

pub fn switch(t: &Tokens, label: &str, checked: bool, disabled: bool, size: SwitchSize) -> El {
	let (w, h) = size.track();
	let thumb = h - BORDER * 2.0;
	let travel = if checked { w - BORDER * 2.0 - thumb } else { 0.0 };
	let thumb_fill = match (t.dark, checked) {
		(false, _) => t.background,
		(true, true) => t.primary_foreground,
		(true, false) => t.foreground,
	};
	let track = el()
		.key(format!("switch-{label}"))
		.size(w, h)
		.radius(RADIUS_2XL)
		.fill(if checked { t.primary } else { faded(t.input, 0.9) })
		.role("switch")
		.label(label)
		.checked(checked)
		.child(
			el().size(thumb, thumb)
				.radius(thumb / 2.0)
				.fill(thumb_fill)
				.shadow(1.0, 2.0, t.popover_shadow)
				.absolute(BORDER + travel, BORDER),
		);
	let track = instant(track);
	if disabled {
		return track.disabled(true).opacity(DISABLED_OPACITY);
	}
	track.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		focus_ring(t, 0.3),
	)
}
