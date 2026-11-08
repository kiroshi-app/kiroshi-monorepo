use rune::{El, TextEdit, icon, row, text_input};

use super::{HAIRLINE, kit_ring, say};
use crate::icons;
use crate::primitives::{instant, tight};
use crate::strings::{Language, bots};
use crate::tokens::{RADIUS_CONTROL, SPACING, TEXT_SM, Tokens};

pub const SEARCH_HEIGHT: f32 = SPACING * 9.0;
const GLYPH: f32 = SPACING * 4.0;
const INSET: f32 = SPACING * 3.0;
const GLYPH_GAP: f32 = SPACING * 2.0;

pub fn search_field<S: 'static>(
	t: &Tokens,
	edit: &TextEdit,
	language: Language,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
) -> El {
	let label = say(bots::applications::SEARCH, language);
	let style = tight(TEXT_SM);
	let field = kit_ring(
		t,
		instant(
			text_input(edit, style)
				.single_line()
				.key("applications-search")
				.w_full()
				.min_h(SEARCH_HEIGHT)
				.py((SEARCH_HEIGHT - style.size) / 2.0)
				.pl(INSET + GLYPH + GLYPH_GAP)
				.pr(INSET)
				.radius(RADIUS_CONTROL)
				.fill(t.muted)
				.border(HAIRLINE, t.input)
				.color(t.foreground)
				.placeholder(label, t.muted_foreground)
				.caret(t.foreground, t.selection)
				.label(label)
				.on_edit(access),
		),
	);
	let glyph = icon(&icons::SEARCH, GLYPH)
		.color(t.muted_foreground)
		.absolute(INSET, (SEARCH_HEIGHT - GLYPH) / 2.0)
		.a11y_hidden();
	row().grow(1.0).min_w(0.0).child(field).child(glyph)
}
