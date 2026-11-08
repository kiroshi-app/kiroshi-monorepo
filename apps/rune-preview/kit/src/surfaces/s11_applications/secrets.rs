use rune::{Align, Color, El, TextEdit, col, el, icon, row, text, text_input};

use super::{
	HAIRLINE, PANEL_GAP, empty_description, empty_state, empty_title, fill, inset, kit_ring, mono,
	outlined, round, say, skeleton_bar, skeleton_list,
};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::SCRIM_SHARE;
use crate::primitives::{elevated, instant, tight};
use crate::strings::{Language, bots, common};
use crate::tokens::{
	RADIUS_2XL, RADIUS_CONTROL, RADIUS_XL, SPACING, TEXT_BASE_SEMIBOLD, TEXT_SM, TEXT_SM_MEDIUM,
	TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
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
const WRITE_WIDTH: f32 = SPACING * 100.0;
const REMOVE_WIDTH: f32 = SPACING * 88.0;
const DESCRIPTION_MEASURE: f32 = SPACING * 80.0;
const CLOSE_INSET: f32 = SPACING * 4.0;
const FIELD_HEIGHT: f32 = SPACING * 9.5;

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

pub struct SecretWrite<'a> {
	pub replacing: Option<&'a str>,
	pub name: &'a TextEdit,
	pub value: &'a TextEdit,
	pub is_refused: bool,
	pub has_failed: bool,
	pub is_writing: bool,
}

pub struct SecretRemoval<'a> {
	pub name: &'a str,
	pub has_failed: bool,
	pub is_removing: bool,
}

pub enum SecretsDialog<'a> {
	Write(SecretWrite<'a>),
	Remove(SecretRemoval<'a>),
}

pub struct Secrets<'a> {
	pub scope: Scope,
	pub entries: &'a [Secret],
	pub is_pending: bool,
	pub has_failed_to_read: bool,
	pub dialog: Option<SecretsDialog<'a>>,
	pub language: Language,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SecretField {
	Name,
	Value,
}

pub type SecretFieldAccess<S> = for<'a> fn(&'a mut S, SecretField) -> &'a mut TextEdit;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SecretsEvent {
	Add,
	Replace(String),
	Remove(String),
	Save,
	CloseWrite,
	ConfirmRemove,
	CancelRemove,
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

pub fn secrets_dialog<S: 'static>(
	t: &Tokens,
	panel: &Secrets,
	access: SecretFieldAccess<S>,
	emit: fn(&mut S, SecretsEvent),
) -> Option<El> {
	let language = panel.language;
	let (surface, dismissed) = match panel.dialog.as_ref()? {
		SecretsDialog::Write(write) => {
			(write_dialog(t, write, language, access, emit), SecretsEvent::CloseWrite)
		}
		SecretsDialog::Remove(removal) => {
			(remove_question(t, removal, language, emit), SecretsEvent::CancelRemove)
		}
	};
	Some(
		el().absolute(0.0, 0.0)
			.w_full()
			.h_full()
			.padding(SPACING * 4.0)
			.center()
			.modal(true, move |s: &mut S| emit(s, dismissed.clone()))
			.child(el().absolute(0.0, 0.0).w_full().h_full().fill(Color::BLACK.alpha(SCRIM_SHARE)))
			.child(elevated(t, surface)),
	)
}

fn heading(t: &Tokens, title: &str, description: &str, end_room: f32) -> El {
	col()
		.w_full()
		.gap(SPACING)
		.pr(end_room)
		.child(
			text(title.to_owned())
				.font(tight(TEXT_BASE_SEMIBOLD))
				.color(t.popover_foreground)
				.role("heading")
				.wrap_anywhere(),
		)
		.child(
			text(description.to_owned())
				.font(TEXT_SM)
				.color(t.muted_foreground)
				.wrap()
				.max_w(DESCRIPTION_MEASURE),
		)
}

fn failure(t: &Tokens, copy: &str) -> El {
	text(copy.to_owned()).font(TEXT_XS).color(t.destructive).wrap().role("alert")
}

fn write_dialog<S: 'static>(
	t: &Tokens,
	write: &SecretWrite,
	language: Language,
	access: SecretFieldAccess<S>,
	emit: fn(&mut S, SecretsEvent),
) -> El {
	use bots::secrets::set;
	let (title, description) = match write.replacing {
		Some(name) => (
			say(set::replace::TITLE, language).to_owned(),
			fill(set::replace::DESCRIPTION, language, &[("name", name)]),
		),
		None => (
			say(set::add::TITLE, language).to_owned(),
			say(set::add::DESCRIPTION, language).to_owned(),
		),
	};
	let close = Button::icon(&icons::CLOSE, say(common::dialog::CLOSE, language))
		.variant(ButtonVariant::Ghost)
		.size(ButtonSize::IconSm)
		.view(t)
		.on_press(move |s: &mut S| emit(s, SecretsEvent::CloseWrite))
		.pin(None, Some(CLOSE_INSET), Some(CLOSE_INSET), None);
	let name = field(
		t,
		FieldSpec {
			label: say(set::name::LABEL, language),
			hint: say(set::name::HINT, language),
			error: write.is_refused.then(|| say(set::name::INVALID, language)),
			placeholder: Some(say(set::name::PLACEHOLDER, language)),
			is_read_only: write.replacing.is_some(),
			is_masked: false,
		},
		write.name,
		move |s: &mut S| access(s, SecretField::Name),
	);
	let value = field(
		t,
		FieldSpec {
			label: say(set::value::LABEL, language),
			hint: say(set::value::HINT, language),
			error: None,
			placeholder: None,
			is_read_only: false,
			is_masked: true,
		},
		write.value,
		move |s: &mut S| access(s, SecretField::Value),
	);
	let mut form = col().w_full().gap(SPACING * 4.0).child(name).child(value);
	if write.has_failed {
		form = form.child(failure(t, say(set::FAILED, language)));
	}
	let save = Button::new(say(set::SUBMIT, language))
		.size(ButtonSize::Sm)
		.leading(&icons::CHECK)
		.disabled(write.is_writing)
		.view(t);
	let save = if write.is_writing {
		save
	} else {
		save.on_press(move |s: &mut S| emit(s, SecretsEvent::Save))
	};
	let form = form.child(row().w_full().justify_end().child(save));
	col()
		.key("secrets-write")
		.w(WRITE_WIDTH)
		.gap(SPACING * 4.0)
		.padding(SPACING * 6.0)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.role("dialog")
		.label(&title)
		.child(heading(t, &title, &description, SPACING * 8.0))
		.child(form)
		.child(close)
}

struct FieldSpec<'a> {
	label: &'a str,
	hint: &'a str,
	error: Option<&'a str>,
	placeholder: Option<&'a str>,
	is_read_only: bool,
	is_masked: bool,
}

fn field<S: 'static>(
	t: &Tokens,
	spec: FieldSpec,
	edit: &TextEdit,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
) -> El {
	let style = TEXT_SM;
	let border = if spec.error.is_some() { t.destructive } else { t.input };
	let ground = if spec.is_read_only { t.popover.alpha(0.0) } else { t.muted };
	let mut input = text_input(edit, style)
		.single_line()
		.key(format!("secrets-field-{}", spec.label))
		.w_full()
		.h(FIELD_HEIGHT)
		.py((FIELD_HEIGHT - style.line_height) / 2.0)
		.px(SPACING * 3.0 + HAIRLINE)
		.radius(RADIUS_CONTROL)
		.fill(ground)
		.border(HAIRLINE, border)
		.color(t.foreground)
		.caret(t.foreground, t.selection)
		.label(spec.label)
		.invalid(spec.error.is_some());
	if let Some(placeholder) = spec.placeholder
		&& edit.text.is_empty()
	{
		input = input.placeholder(placeholder, t.muted_foreground);
	}
	if spec.is_read_only {
		input = input.read_only(true);
	} else {
		input = input.on_edit(access);
	}
	if spec.is_masked {
		input = input.secure();
	}
	let mut column = col()
		.w_full()
		.gap(SPACING * 1.5)
		.child(text(spec.label.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground))
		.child(kit_ring(t, instant(input)))
		.child(text(spec.hint.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap());
	if let Some(error) = spec.error {
		column = column.child(failure(t, error));
	}
	column
}

fn remove_question<S: 'static>(
	t: &Tokens,
	removal: &SecretRemoval,
	language: Language,
	emit: fn(&mut S, SecretsEvent),
) -> El {
	use bots::secrets::remove;
	let title = fill(remove::TITLE, language, &[("name", removal.name)]);
	let cancel = Button::new(say(common::confirm::CANCEL, language))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Sm)
		.disabled(removal.is_removing)
		.view(t);
	let confirm = Button::new(say(remove::ACTION, language))
		.variant(ButtonVariant::Destructive)
		.size(ButtonSize::Sm)
		.disabled(removal.is_removing)
		.view(t);
	let (cancel, confirm) = if removal.is_removing {
		(cancel, confirm)
	} else {
		(
			cancel.on_press(move |s: &mut S| emit(s, SecretsEvent::CancelRemove)),
			confirm.on_press(move |s: &mut S| emit(s, SecretsEvent::ConfirmRemove)),
		)
	};
	let mut question = col()
		.key("secrets-remove")
		.w(REMOVE_WIDTH)
		.gap(SPACING * 4.0)
		.padding(SPACING * 5.0)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.role("alertdialog")
		.label(&title)
		.child(heading(t, &title, say(remove::DESCRIPTION, language), 0.0));
	if removal.has_failed {
		question = question.child(failure(t, say(remove::FAILED, language)));
	}
	question.child(row().w_full().gap(SPACING * 2.0).justify_end().child(cancel).child(confirm))
}
