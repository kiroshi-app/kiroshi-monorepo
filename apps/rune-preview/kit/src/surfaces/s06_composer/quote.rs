use rune::{Cursor, El, TextStyle, col, icon, row, text};

use super::{
	CONTROL, ComposerIntent, GLYPH, ROW_RING, Reach, RoundControl, SMALL_CONTROL, SMALL_GLYPH,
	Scope, filled, ghost_paint,
};
use crate::icons;
use crate::primitives::Paint;
use crate::strings::chat::{reply, selection_quote as selection};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_MD, SPACING, TEXT_COMPACT, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

const MEDIA: f32 = SPACING * 8.0;
const QUOTE_LINES: usize = 2;
const QUOTE_LINE: f32 = 18.0;
const REPLY_RADIUS: f32 = 29.0;
const REPLY_INSET_X: f32 = SPACING * 2.0 + 1.0;
const REPLY_GLYPH: f32 = SPACING * 4.0;
const QUOTE_GLYPH_OPACITY: f32 = 0.7;

pub struct SelectionQuote<'a> {
	pub agent: &'a str,
	pub text: &'a str,
}

fn glyph_box(t: &Tokens, glyph: &'static rune::Icon) -> El {
	row()
		.size(MEDIA, MEDIA)
		.radius(RADIUS_MD)
		.fill(faded(t.foreground, 0.08))
		.center()
		.a11y_hidden()
		.child(icon(glyph, GLYPH).color(t.muted_foreground))
}

pub fn selection_quote<S: 'static>(scope: Scope<S>, quote: &SelectionQuote, reach: Reach) -> El {
	let t = scope.t;
	let name = [("name", quote.agent)];
	let surface = if t.dark { faded(t.foreground, 0.04) } else { t.background };
	let quoted = TextStyle { line_height: QUOTE_LINE, ..TEXT_COMPACT };
	let remove = RoundControl {
		key: "selection-quote-remove",
		label: scope.say(selection::REMOVE),
		glyph: &icons::CLOSE,
		side: SMALL_CONTROL,
		glyph_side: SMALL_GLYPH,
		paint: Paint { hover_fill: t.background.alpha(0.0), ..ghost_paint(t, t.muted_foreground) },
		border: None,
		reach,
	}
	.view(scope, Some(ComposerIntent::RemoveQuote))
	.focus_ring(ROW_RING, ROW_RING, t.ring);
	row()
		.key("selection-quote")
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.padding(SPACING * 2.0)
		.radius(RADIUS_CONTROL)
		.fill(surface)
		.border(1.0, faded(t.foreground, 0.1))
		.role("group")
		.label(filled(scope.say(selection::GROUP), &name))
		.child(glyph_box(t, &icons::QUOTE))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.gap(SPACING * 0.5)
				.child(
					text(filled(scope.say(selection::LABEL), &name))
						.font(TEXT_XS_MEDIUM)
						.color(t.muted_foreground)
						.truncate(),
				)
				.child(
					text(quote.text.to_owned())
						.font(quoted)
						.color(t.foreground)
						.wrap_anywhere()
						.max_lines(QUOTE_LINES),
				),
		)
		.child(remove)
}

pub struct ReplyQuote<'a> {
	pub author: &'a str,
	pub excerpt: &'a str,
}

pub fn prompt_reply<S: 'static>(
	scope: Scope<S>,
	quote: Option<&ReplyQuote>,
	width: f32,
	composer: El,
) -> El {
	let t = scope.t;
	let Some(quote) = quote else {
		return col().w(width).child(composer);
	};
	let author = TextStyle { weight: 600.0, ..TEXT_XS };
	let jump = scope
		.on_press(
			col()
				.key("reply-jump")
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.radius(RADIUS_MD)
				.role("button")
				.label(filled(
					scope.say(reply::JUMP),
					&[("author", quote.author), ("excerpt", quote.excerpt)],
				))
				.child(text(quote.author.to_owned()).font(author).color(t.foreground).truncate())
				.child(
					text(quote.excerpt.to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.truncate(),
				),
			ComposerIntent::JumpToReply,
		)
		.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(ROW_RING, 0.0, t.foreground);
	let dismiss = RoundControl {
		key: "reply-dismiss",
		label: scope.say(reply::DISMISS),
		glyph: &icons::CLOSE,
		side: CONTROL,
		glyph_side: GLYPH,
		paint: ghost_paint(t, t.muted_foreground),
		border: None,
		reach: Reach::Live,
	}
	.view(scope, Some(ComposerIntent::DismissReply));
	col()
		.key("prompt-reply")
		.w(width)
		.gap(SPACING)
		.padding(SPACING)
		.radius(REPLY_RADIUS)
		.fill(faded(t.foreground, 0.05))
		.role("group")
		.label(filled(scope.say(reply::LABEL), &[("author", quote.author)]))
		.child(
			row()
				.w_full()
				.gap(SPACING * 3.0)
				.center_y()
				.px(REPLY_INSET_X)
				.py(SPACING * 2.0)
				.child(
					row().size(MEDIA, MEDIA).center().a11y_hidden().child(
						icon(&icons::REPLY, REPLY_GLYPH)
							.color(t.foreground)
							.opacity(QUOTE_GLYPH_OPACITY),
					),
				)
				.child(jump)
				.child(dismiss),
		)
		.child(composer)
}
