use rune::{Cursor, El, col, icon, row, text};

use super::{FOCUS_RING_WIDTH, instant, ring_tint};
use crate::icons;
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens, faded};

const INSET: f32 = SPACING * 4.0;
const GLYPH: f32 = SPACING * 4.0;

pub struct Section<'a> {
	pub title: &'a str,
	pub body: &'a str,
	pub open: bool,
}

pub fn accordion<'a>(t: &Tokens, sections: impl IntoIterator<Item = Section<'a>>) -> El {
	let sections: Vec<Section> = sections.into_iter().collect();
	let last = sections.len().saturating_sub(1);
	col().w_full().radius(RADIUS_2XL).border(1.0, t.border).clip_rounded(RADIUS_2XL).children(
		sections.into_iter().enumerate().map(|(at, section)| item(t, section, at == last)),
	)
}

fn item(t: &Tokens, section: Section, is_last: bool) -> El {
	let glyph = if section.open { &icons::CHEVRON_UP } else { &icons::CHEVRON_DOWN };
	let trigger = instant(
		row()
			.key(format!("accordion-{}", section.title))
			.w_full()
			.gap(SPACING * 6.0)
			.items_start()
			.justify_between()
			.role("button")
			.label(section.title)
			.expanded(section.open)
			.focusable(true)
			.cursor(Cursor::Pointer)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
			.child(text(section.title.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
			.child(icon(glyph, GLYPH).color(t.muted_foreground)),
	);
	let mut item = col().w_full().padding(INSET).gap(INSET).child(trigger);
	if section.open {
		item = item
			.fill(faded(t.muted, 0.5))
			.child(text(section.body.to_owned()).font(TEXT_SM).color(t.foreground).wrap());
	}
	if is_last {
		item
	} else {
		col().w_full().child(item).child(rune::el().w_full().h(1.0).fill(t.border))
	}
}
