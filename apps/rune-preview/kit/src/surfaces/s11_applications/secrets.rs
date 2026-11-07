use rune::{Align, El, col, icon, row, text};

use super::{
	HAIRLINE, PANEL_GAP, empty_description, empty_state, empty_title, fill, inset, mono, outlined,
	round, say, skeleton_bar, skeleton_list,
};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::strings::{Language, bots};
use crate::tokens::{
	RADIUS_2XL, RADIUS_XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

const ROW_GAP: f32 = SPACING * 2.0;
const NOTICE_MEASURE: f32 = SPACING * 96.0;
const EMPTY_MEASURE: f32 = SPACING * 80.0;
const EMPTY_ART: f32 = SPACING * 8.0;
const TAG_HEIGHT: f32 = SPACING * 5.0;
const SKELETON_ROW_HEIGHT: f32 = SPACING * 14.0;
const SKELETON_BARS: [(f32, f32); 3] = [
	(SPACING * 27.0, SPACING * 51.0),
	(SPACING * 31.0, SPACING * 59.0),
	(SPACING * 23.0, SPACING * 54.5),
];
const TITLE_BAR: f32 = SPACING * 3.0;
const SUB_BAR: f32 = SPACING * 2.25;
const FAILURE_FILL: f32 = 0.1;
const FAILURE_BORDER: f32 = 0.3;
const FAILURE_INK: f32 = 0.8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
	User,
	Space,
	Agent,
	Application,
}

impl Scope {
	fn name(self, language: Language) -> &'static str {
		say(
			match self {
				Scope::User => bots::secrets::scope::USER,
				Scope::Space => bots::secrets::scope::SPACE,
				Scope::Agent => bots::secrets::scope::BOT,
				Scope::Application => bots::secrets::scope::SERVER,
			},
			language,
		)
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Secret {
	pub name: String,
	pub defined_in: Scope,
	pub served_from: Scope,
	pub overrides: Option<Scope>,
	pub is_unset: bool,
}

pub struct Secrets<'a> {
	pub scope: Scope,
	pub entries: &'a [Secret],
	pub is_pending: bool,
	pub has_failed_to_read: bool,
	pub language: Language,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SecretsEvent {
	Add,
	Replace(String),
	Remove(String),
}

pub fn secrets<S: 'static>(t: &Tokens, panel: &Secrets, emit: fn(&mut S, SecretsEvent)) -> El {
	let language = panel.language;
	let is_listing = panel.is_pending || !panel.entries.is_empty();
	let column = col().w_full().h_full().gap(PANEL_GAP);
	if !is_listing && panel.has_failed_to_read {
		return column.child(unreadable(t, language));
	}
	if !is_listing {
		return column.child(empty(t, language, emit));
	}
	let column =
		if panel.has_failed_to_read { column.child(unreadable(t, language)) } else { column };
	let add = Button::new(say(bots::secrets::ADD, language))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Sm)
		.leading(&icons::PLUS)
		.view(t)
		.on_press(move |s: &mut S| emit(s, SecretsEvent::Add));
	let header = row()
		.w_full()
		.gap(SPACING * 3.0)
		.items_start()
		.justify_between()
		.child(
			text(say(bots::secrets::NOTICE, language).to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.wrap()
				.max_w(NOTICE_MEASURE)
				.shrink(),
		)
		.child(add);
	let list = if panel.is_pending {
		skeleton_list(t, ROW_GAP, |index| skeleton_row(t, SKELETON_BARS[index % 3]))
	} else {
		col()
			.grow(1.0)
			.min_h(0.0)
			.w_full()
			.gap(ROW_GAP)
			.role("list")
			.children(
				panel.entries.iter().map(|entry| secret_row(t, entry, panel.scope, language, emit)),
			)
			.scroll(rune::ScrollSpec { stick_bottom: false })
	};
	column.child(header).child(list)
}

fn secret_row<S: 'static>(
	t: &Tokens,
	entry: &Secret,
	scope: Scope,
	language: Language,
	emit: fn(&mut S, SecretsEvent),
) -> El {
	let is_owned = entry.defined_in == scope;
	let is_served_elsewhere = entry.served_from != entry.defined_in;
	let has_no_value = entry.is_unset && !is_served_elsewhere;
	let overridden_by = !entry.is_unset && is_owned && entry.served_from != scope;
	let overriding =
		(!entry.is_unset && entry.served_from == scope).then_some(entry.overrides).flatten();
	let defined = entry.defined_in.name(language);
	let reading = if has_no_value {
		fill(bots::secrets::row::NO_VALUE, language, &[("defined", defined)])
	} else {
		fill(
			bots::secrets::row::SCOPES,
			language,
			&[("defined", defined), ("served", entry.served_from.name(language))],
		)
	};
	let line = row().w_full().gap(SPACING * 3.0).center_y();
	let mut line = outlined(t, inset(line, SPACING * 2.0, SPACING * 3.0, SPACING * 2.0), RADIUS_XL)
		.role("listitem")
		.label(&entry.name)
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(SPACING * 0.5)
				.child(
					text(entry.name.clone())
						.font(mono(TEXT_SM_MEDIUM))
						.color(t.foreground)
						.truncate(),
				)
				.child(text(reading).font(TEXT_XS).color(t.muted_foreground).truncate()),
		);
	if has_no_value {
		line = line.child(tag(t, say(bots::secrets::row::NEEDS_VALUE, language), t.foreground));
	}
	if entry.is_unset && is_served_elsewhere {
		line =
			line.child(tag(t, say(bots::secrets::row::UNSET_HERE, language), t.muted_foreground));
	}
	if overridden_by {
		let by = entry.served_from.name(language);
		line = line.child(tag(
			t,
			&fill(bots::secrets::row::OVERRIDDEN, language, &[("scope", by)]),
			t.muted_foreground,
		));
	}
	if let Some(overridden) = overriding {
		line = line.child(tag(
			t,
			&fill(
				bots::secrets::row::OVERRIDING,
				language,
				&[("scope", overridden.name(language))],
			),
			t.muted_foreground,
		));
	}
	if is_owned {
		let name = entry.name.clone();
		let replace_label = fill(bots::secrets::row::REPLACE, language, &[("name", &name)]);
		let remove_label = fill(bots::secrets::row::REMOVE, language, &[("name", &name)]);
		let replaced = name.clone();
		line = line.child(
			row()
				.gap(SPACING)
				.center_y()
				.child(
					Button::icon(&icons::PEN, &replace_label)
						.variant(ButtonVariant::Ghost)
						.size(ButtonSize::IconXs)
						.view(t)
						.on_press(move |s: &mut S| {
							emit(s, SecretsEvent::Replace(replaced.clone()))
						}),
				)
				.child(
					Button::icon(&icons::BIN, &remove_label)
						.variant(ButtonVariant::Ghost)
						.size(ButtonSize::IconXs)
						.view(t)
						.on_press(move |s: &mut S| emit(s, SecretsEvent::Remove(name.clone()))),
				),
		);
	}
	line
}

fn tag(t: &Tokens, label: &str, ink: rune::Color) -> El {
	round(
		row()
			.px(SPACING * 2.0)
			.py(SPACING * 0.5)
			.center_y()
			.fill(t.muted)
			.child(text(label.to_owned()).font(TEXT_XS_MEDIUM).color(ink).max_lines(1)),
		TAG_HEIGHT,
	)
}

fn skeleton_row(t: &Tokens, (title, sub): (f32, f32)) -> El {
	let shell = col().w_full().min_h(SKELETON_ROW_HEIGHT).gap(SPACING * 0.5).justify_center();
	outlined(t, inset(shell, SPACING * 2.0, SPACING * 3.0, SPACING * 2.0), RADIUS_XL)
		.child(row().h(SPACING * 5.0).center_y().child(skeleton_bar(t, title, TITLE_BAR, false)))
		.child(row().h(SPACING * 4.0).center_y().child(skeleton_bar(t, sub, SUB_BAR, true)))
}

fn empty<S: 'static>(t: &Tokens, language: Language, emit: fn(&mut S, SecretsEvent)) -> El {
	let add = Button::new(say(bots::secrets::ADD, language))
		.size(ButtonSize::Sm)
		.leading(&icons::PLUS)
		.view(t)
		.on_press(move |s: &mut S| emit(s, SecretsEvent::Add));
	empty_state(
		t,
		icon(&icons::SHIELD, EMPTY_ART).color(t.muted_foreground),
		vec![
			empty_title(t, say(bots::secrets::empty::TITLE, language)),
			empty_description(t, say(bots::secrets::empty::DESCRIPTION, language), EMPTY_MEASURE),
		],
		Some(add),
	)
}

fn unreadable(t: &Tokens, language: Language) -> El {
	row()
		.w_full()
		.gap(SPACING * 3.0)
		.items_start()
		.padding(SPACING * 3.0 + HAIRLINE)
		.radius(RADIUS_2XL)
		.fill(faded(t.destructive, FAILURE_FILL))
		.border(HAIRLINE, faded(t.destructive, FAILURE_BORDER))
		.role("alert")
		.child(icon(&icons::TRIANGLE_ALERT, SPACING * 4.0).color(t.destructive).mt(SPACING * 0.5))
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(SPACING)
				.child(
					text(say(bots::secrets::unreadable::TITLE, language).to_owned())
						.font(TEXT_SM_MEDIUM)
						.color(t.foreground)
						.wrap(),
				)
				.child(
					text(say(bots::secrets::unreadable::DESCRIPTION, language).to_owned())
						.font(TEXT_SM)
						.color(faded(t.foreground, FAILURE_INK))
						.wrap()
						.align(Align::Start),
				),
		)
}
