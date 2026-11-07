use rune::{Color, El, Icon, col, el, icon, row, text};

use super::{Emit, control, pressed};
use crate::primitives::switch::{SwitchSize, switch};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded};

pub const GROUP_GAP: f32 = SPACING * 2.0;
pub const SECTIONS_GAP: f32 = SPACING * 5.0;
const ROW_INSET: f32 = SPACING * 3.0;
const ROW_GAP: f32 = SPACING * 4.0;
const ROW_TEXT_GAP: f32 = SPACING * 0.5;
const SWITCH_TEXT_GAP: f32 = SPACING;
const TRAILING_GLYPH: f32 = SPACING * 4.0;
const BOX_SHARE: f32 = 0.4;
pub const HAIRLINE: f32 = 1.0;

pub fn boxed(t: &Tokens) -> Color {
	faded(t.muted, BOX_SHARE)
}

pub fn hairline(t: &Tokens) -> El {
	el().w_full().h(HAIRLINE).fill(t.border).a11y_hidden()
}

pub fn group(t: &Tokens, label: &str, gap: f32, children: impl IntoIterator<Item = El>) -> El {
	col()
		.w_full()
		.gap(GROUP_GAP)
		.role("group")
		.label(label)
		.child(text(label.to_owned()).font(TEXT_XS_MEDIUM).color(t.muted_foreground))
		.child(col().w_full().gap(gap).children(children))
}

pub fn sections(children: impl IntoIterator<Item = El>) -> El {
	col().w_full().gap(SECTIONS_GAP).children(children)
}

pub fn rows(t: &Tokens, children: impl IntoIterator<Item = El>) -> El {
	let mut list = col()
		.w_full()
		.radius(RADIUS_XL)
		.border(HAIRLINE, t.border)
		.fill(boxed(t))
		.clip_rounded(RADIUS_XL);
	for (at, child) in children.into_iter().enumerate() {
		if at > 0 {
			list = list.child(hairline(t));
		}
		list = list.child(child);
	}
	list
}

pub fn title(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground).wrap()
}

pub fn detail(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap()
}

pub fn setting_row(title: El, detail: Option<El>, trailing: Option<El>) -> El {
	let mut words = col().grow(1.0).shrink().gap(ROW_TEXT_GAP).child(title);
	if let Some(detail) = detail {
		words = words.child(detail);
	}
	let line = row().w_full().padding(ROW_INSET).gap(ROW_GAP).center_y().child(words);
	match trailing {
		Some(trailing) => line.child(trailing),
		None => line,
	}
}

pub fn link_row<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	label: &str,
	detail_words: Option<&str>,
	glyph: &'static Icon,
	emit: Emit<S, E>,
	event: E,
) -> El {
	let link = setting_row(
		title(t, label),
		detail_words.map(|words| detail(t, words)),
		Some(icon(glyph, TRAILING_GLYPH).color(t.muted_foreground)),
	)
	.key(format!("settings-link-{label}"))
	.hover(t.muted)
	.press(t.muted)
	.role("button")
	.label(label);
	pressed(control(t, link), emit, event)
}

pub fn toggle<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	label: &str,
	checked: bool,
	emit: Emit<S, E>,
	event: E,
) -> El {
	pressed(switch(t, label, checked, false, SwitchSize::Default), emit, event)
}

pub fn switch_row<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	label: &str,
	description: &str,
	checked: bool,
	emit: Emit<S, E>,
	event: E,
) -> El {
	row()
		.w_full()
		.padding(ROW_INSET)
		.gap(ROW_GAP)
		.items_start()
		.radius(RADIUS_XL)
		.border(HAIRLINE, t.border)
		.fill(boxed(t))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.gap(SWITCH_TEXT_GAP)
				.child(title(t, label))
				.child(detail(t, description)),
		)
		.child(toggle(t, label, checked, emit, event))
}
