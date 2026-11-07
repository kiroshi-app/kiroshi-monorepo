use rune::{Cursor, El, Icon, icon, row, text};

use super::{FOCUS_RING_WIDTH, Paint, equal_padding, ring_tint, tight};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM_MEDIUM, Tokens};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ToggleVariant {
	#[default]
	Default,
	Outline,
}

#[derive(Clone, Copy, Debug)]
pub enum ToggleFace<'a> {
	Glyph(&'static Icon, &'a str),
	Label(&'a str),
}

const HEIGHT: f32 = SPACING * 8.0;
const GLYPH: f32 = SPACING * 4.0;

pub fn toggle(t: &Tokens, face: ToggleFace, variant: ToggleVariant, pressed: bool) -> El {
	let clear = t.background.alpha(0.0);
	let paint = Paint {
		fill: if pressed { t.muted } else { clear },
		ink: t.foreground,
		hover_fill: t.muted,
		hover_ink: t.foreground,
	};
	let style = tight(TEXT_SM_MEDIUM);
	let (name, content, glyph_size) = match face {
		ToggleFace::Glyph(glyph, name) => (name, paint.ink(icon(glyph, GLYPH)), GLYPH),
		ToggleFace::Label(name) => (name, paint.ink(text(name.to_owned()).font(style)), style.size),
	};
	let mut toggle = row()
		.key(format!("toggle-{name}"))
		.min_w(HEIGHT)
		.padding(equal_padding(HEIGHT, glyph_size))
		.gap(SPACING)
		.radius(RADIUS_2XL)
		.center()
		.role("toggle")
		.label(name)
		.checked(pressed)
		.child(content);
	if variant == ToggleVariant::Outline {
		toggle = toggle.border(1.0, t.input);
	}
	paint.apply(toggle).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}
