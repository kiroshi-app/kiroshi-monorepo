use rune::{Cursor, El, col, text};

use super::{FOCUS_RING_WIDTH, ring_tint};
use crate::tokens::{SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens};

pub fn collapsible(t: &Tokens, title: &str, body: &str, open: bool) -> El {
	let trigger = text(title.to_owned())
		.key(format!("collapsible-{title}"))
		.font(TEXT_SM_MEDIUM)
		.color(t.foreground)
		.role("button")
		.label(title)
		.expanded(open)
		.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5));
	let mut collapsible = col().gap(SPACING * 2.0).child(trigger);
	if open {
		collapsible = collapsible.child(text(body.to_owned()).font(TEXT_SM).color(t.foreground));
	}
	collapsible
}
