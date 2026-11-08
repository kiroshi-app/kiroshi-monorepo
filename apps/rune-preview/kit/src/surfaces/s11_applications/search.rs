use rune::{El, TextEdit, TextStyle, icon, row, text_input};

use super::{HAIRLINE, ringed_field, say};
use crate::icons;
use crate::primitives::instant;
use crate::strings::{Language, bots};
use crate::tokens::{RADIUS_CONTROL, SPACING, TEXT_SM, Tokens};

pub const SEARCH_HEIGHT: f32 = SPACING * 9.0;
pub const SEARCH_TEXT: TextStyle = TextStyle { line_height: TEXT_SM.size, ..TEXT_SM };
const GLYPH: f32 = SPACING * 4.0;
const INSET: f32 = SPACING * 3.0;
const GLYPH_GAP: f32 = SPACING * 2.0;

pub fn search_field<S: 'static>(
	t: &Tokens,
	edit: &TextEdit,
	style: TextStyle,
	language: Language,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
) -> El {
	let label = say(bots::applications::SEARCH, language);
	let field = ringed_field(
		t,
		instant(
			text_input(edit, style)
				.single_line()
				.key("applications-search")
				.w_full()
				.min_h(SEARCH_HEIGHT.max(style.line_height + 2.0 * HAIRLINE))
				.py(((SEARCH_HEIGHT - style.line_height) / 2.0).max(HAIRLINE))
				.pl(INSET + GLYPH + GLYPH_GAP)
				.pr(INSET)
				.fill(t.muted)
				.border(HAIRLINE, t.input)
				.color(t.foreground)
				.placeholder(label, t.muted_foreground)
				.caret(t.foreground, t.selection)
				.label(label)
				.on_edit(access),
		),
		RADIUS_CONTROL,
	);
	let glyph = row()
		.pin(Some(INSET), Some(0.0), None, Some(0.0))
		.center_y()
		.child(icon(&icons::SEARCH, GLYPH).color(t.muted_foreground))
		.a11y_hidden();
	row().grow(1.0).min_w(0.0).child(field).child(glyph)
}
