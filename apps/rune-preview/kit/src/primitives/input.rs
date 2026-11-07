use rune::{El, TextEdit, text_input};

use super::{FOCUS_RING_WIDTH, equal_padding, focus_ring, instant, tight};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM, Tokens, faded};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum InputSize {
	Sm,
	#[default]
	Default,
}

impl InputSize {
	pub fn height(self) -> f32 {
		match self {
			InputSize::Sm => SPACING * 7.0,
			InputSize::Default => SPACING * 8.0,
		}
	}
}

pub fn input<S: 'static>(
	t: &Tokens,
	edit: &TextEdit,
	placeholder: &str,
	size: InputSize,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
) -> El {
	let style = tight(TEXT_SM);
	instant(
		text_input(edit, style)
			.single_line()
			.key(format!("input-{placeholder}"))
			.w_full()
			.padding(equal_padding(size.height(), style.size))
			.radius(RADIUS_2XL)
			.fill(faded(t.input, 0.5))
			.color(t.foreground)
			.placeholder(placeholder, t.muted_foreground)
			.caret(t.foreground, t.selection)
			.label(placeholder)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, focus_ring(t, 0.3))
			.on_edit(access),
	)
}
