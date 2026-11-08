use rune::{Align, El, Family, Span, TextStyle, col, el, text};

use crate::primitives::skeleton::skeleton;
use crate::primitives::{FOCUS_RING_WIDTH, ring_tint};
use crate::strings::{Key, Language};
use crate::tokens::{SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens, faded};

pub mod catalogue;
pub mod identity;
pub mod install;
pub mod mark;
pub mod panel;
pub mod search;
pub mod secrets;

pub const PANEL_GAP: f32 = SPACING * 4.0;
pub const HAIRLINE: f32 = 1.0;
const EMPTY_GAP: f32 = SPACING * 3.0;
const SKELETON_ROWS: usize = 16;
const FAINT_BAR_SHARE: f32 = 0.6;
const KIT_RING_SHARE: f32 = 0.3;

pub fn say(key: Key, language: Language) -> &'static str {
	key.text(language)
}

pub fn fill(key: Key, language: Language, values: &[(&str, &str)]) -> String {
	values.iter().fold(say(key, language).to_owned(), |copy, (name, value)| {
		copy.replace(&format!("{{{{{name}}}}}"), value)
	})
}

const HOST_OPEN: &str = "<host>";
const HOST_CLOSE: &str = "</host>";

pub fn hosted_sentence(key: Key, language: Language, host: &str) -> (String, Span) {
	let copy = say(key, language);
	let (before, rest) = copy.split_once(HOST_OPEN).unwrap_or((copy, ""));
	let after = rest.split_once(HOST_CLOSE).map_or("", |(_, after)| after);
	let sentence = format!("{before}{host}{after}");
	(sentence, Span::new(before.len(), before.len() + host.len()).mono())
}

pub const fn mono(style: TextStyle) -> TextStyle {
	TextStyle { family: Family::Mono, ..style }
}

pub fn round(control: El, height: f32) -> El {
	control.radius(height / 2.0)
}

pub fn kit_ring(t: &Tokens, control: El) -> El {
	control.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, KIT_RING_SHARE))
}

pub fn outlined(t: &Tokens, control: El, radius: f32) -> El {
	control.radius(radius).border(HAIRLINE, t.border)
}

pub fn inset(control: El, block: f32, start: f32, end: f32) -> El {
	control.py(block + HAIRLINE).pl(start + HAIRLINE).pr(end + HAIRLINE)
}

pub fn empty_state(t: &Tokens, art: El, words: Vec<El>, action: Option<El>) -> El {
	let mut empty = col()
		.grow(1.0)
		.w_full()
		.gap(EMPTY_GAP)
		.center()
		.child(art)
		.child(col().gap(SPACING).items_center().children(words));
	if let Some(action) = action {
		empty = empty.child(action);
	}
	empty.color(t.foreground)
}

pub fn empty_title(t: &Tokens, title: &str) -> El {
	text(title.to_owned())
		.font(TEXT_SM_MEDIUM)
		.color(t.foreground)
		.wrap_anywhere()
		.align(Align::Center)
}

pub fn empty_description(t: &Tokens, description: &str, measure: f32) -> El {
	text(description.to_owned())
		.font(TEXT_SM)
		.color(t.muted_foreground)
		.wrap()
		.align(Align::Center)
		.max_w(measure)
}

pub fn skeleton_bar(t: &Tokens, width: f32, height: f32, faint: bool) -> El {
	let ink = if faint { faded(t.border, FAINT_BAR_SHARE) } else { t.border };
	round(el().w(width).h(height).fill(ink), height)
}

pub fn skeleton_list(t: &Tokens, gap: f32, row_at: impl Fn(usize) -> El) -> El {
	let rows = col().w_full().gap(gap).children((0..SKELETON_ROWS).map(row_at));
	let pulsing = skeleton(t).fill(t.background.alpha(0.0)).radius(0.0).w_full().child(rows);
	col().grow(1.0).min_h(0.0).w_full().clip_rounded(0.0).a11y_hidden().child(pulsing)
}
