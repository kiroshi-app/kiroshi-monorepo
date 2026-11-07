use rune::{Color, Cursor, El, Icon, icon, row};

use super::{ChromeEvent, Emit};
use crate::icons;
use crate::primitives::button::ButtonVariant;
use crate::primitives::{FOCUS_RING_WIDTH, Interaction, Paint, ring_tint};
use crate::strings::Language;
use crate::strings::common::window_controls as copy;
use crate::tokens::{SPACING, Tokens};

const CAPTION_WIDTH: f32 = SPACING * 11.5;
const GLYPH: f32 = SPACING * 2.5;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum CaptionState {
	#[default]
	Live,
	Idle,
	Hover,
	Pressed,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WindowControls {
	pub maximized: bool,
	pub maximize_state: CaptionState,
}

pub fn window_controls<S: 'static>(
	t: &Tokens,
	language: Language,
	controls: WindowControls,
	emit: Emit<S>,
) -> El {
	let ghost = ButtonVariant::Ghost.paint(t);
	let (maximize_glyph, maximize_label) = if controls.maximized {
		(&icons::COPY, copy::RESTORE)
	} else {
		(&icons::SQUARE, copy::MAXIMIZE)
	};
	let close = Paint { hover_fill: t.window_close, hover_ink: Color::WHITE, ..ghost };
	row().h_full().key("window-controls").children([
		caption(
			t,
			"caption-minimize",
			&icons::MINUS,
			copy::MINIMIZE.text(language),
			ghost,
			move |s: &mut S| emit(s, ChromeEvent::Minimize),
		),
		caption(
			t,
			"caption-maximize",
			maximize_glyph,
			maximize_label.text(language),
			forced(ghost, controls.maximize_state),
			move |s: &mut S| emit(s, ChromeEvent::ToggleMaximize),
		),
		caption(
			t,
			"caption-close",
			&icons::CLOSE,
			copy::CLOSE.text(language),
			close,
			move |s: &mut S| emit(s, ChromeEvent::CloseWindow),
		),
	])
}

fn forced(paint: Paint, state: CaptionState) -> Paint {
	match state {
		CaptionState::Live => paint,
		CaptionState::Idle => Paint::plain(paint.fill, paint.ink),
		CaptionState::Hover | CaptionState::Pressed => {
			let held = paint.resting(Interaction::Hover);
			Paint::plain(held.fill, held.ink)
		}
	}
}

fn caption<S: 'static>(
	t: &Tokens,
	key: &str,
	glyph: &'static Icon,
	label: &str,
	paint: Paint,
	on_press: impl Fn(&mut S) + 'static,
) -> El {
	let button = row().key(key).w(CAPTION_WIDTH).h_full().center().role("button").label(label);
	paint
		.apply(button.child(paint.ink(icon(glyph, GLYPH))))
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
		.on_press(on_press)
}
