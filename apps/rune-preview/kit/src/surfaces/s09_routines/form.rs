use rune::{Cursor, El, TextEdit, col, edit_access, row, text, text_input};

use super::{BORDER, Emit, RoutinesEvent, emits, glyph, icon_button, say};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::{DISABLED_OPACITY, FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::{Key, Language, chat};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_XL, SPACING, TEXT_SM, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

use chat::routines::form as copy;

pub type EditOf<S> = fn(&mut S, FormField) -> &mut TextEdit;

const CONTROL_X: f32 = SPACING * 3.0 + BORDER;
const CONTROL_Y: f32 = SPACING * 2.0 + BORDER;
const SELECT_END: f32 = SPACING * 2.5 + BORDER;
const CHEVRON: f32 = SPACING * 4.0;
const INSTRUCTION_ROWS: f32 = 5.0;
const FILTER_ROW_INSET: f32 = SPACING * 2.5 + BORDER;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormField {
	Title,
	Instruction,
	Expression,
	Path,
	FilterPath(usize),
	FilterValue(usize),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Picker {
	Trigger,
	MatchMode,
	Field(usize),
	Operator(usize),
	Value(usize),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebhookPart {
	Address,
	Key,
	Header,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormRefusal {
	BlankTitle,
	BlankInstruction,
	UnreadableExpression,
}

#[derive(Clone, Copy, Debug)]
pub enum TriggerField<'a> {
	Picking(Option<&'a str>),
	Tied(&'a str),
}

#[derive(Clone, Copy, Debug)]
pub struct WebhookValues<'a> {
	pub address: &'a str,
	pub key: &'a str,
	pub header: &'a str,
}

#[derive(Clone, Copy, Debug)]
pub enum Webhook<'a> {
	Unwritten,
	Reading,
	Unreadable,
	Read(WebhookValues<'a>),
}

#[derive(Clone, Copy)]
pub enum Configuration<'a> {
	Nothing,
	Schedule(&'a TextEdit),
	WatchedPath(&'a TextEdit),
	Webhook(Webhook<'a>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchMode {
	All,
	Any,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operator {
	Exists,
	NotExists,
	Equals,
	NotEquals,
	Contains,
	NotContains,
	StartsWith,
	EndsWith,
	Gt,
	Lt,
}

impl Operator {
	fn word(self) -> Key {
		use copy::filter::operators as words;
		match self {
			Operator::Exists => words::EXISTS,
			Operator::NotExists => words::NOT_EXISTS,
			Operator::Equals => words::EQUALS,
			Operator::NotEquals => words::NOT_EQUALS,
			Operator::Contains => words::CONTAINS,
			Operator::NotContains => words::NOT_CONTAINS,
			Operator::StartsWith => words::STARTS_WITH,
			Operator::EndsWith => words::ENDS_WITH,
			Operator::Gt => words::GT,
			Operator::Lt => words::LT,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FieldType {
	Text,
	Number,
	Boolean,
	Date,
}

impl FieldType {
	fn word(self) -> Key {
		use copy::filter::field_types as words;
		match self {
			FieldType::Text => words::STRING,
			FieldType::Number => words::NUMBER,
			FieldType::Boolean => words::BOOLEAN,
			FieldType::Date => words::DATETIME,
		}
	}
}

#[derive(Clone, Copy)]
pub enum FieldPick<'a> {
	Declared(&'a str),
	OtherPath(&'a TextEdit),
}

#[derive(Clone, Copy)]
pub enum Value<'a> {
	Unasked,
	Text(&'a TextEdit),
	Number(&'a TextEdit),
	Boolean(bool),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperatorError {
	Untyped,
	Unsupported(Operator, FieldType),
}

#[derive(Clone, Copy)]
pub struct FilterRow<'a> {
	pub field: FieldPick<'a>,
	pub operator: Operator,
	pub value: Value<'a>,
	pub operator_error: Option<OperatorError>,
	pub value_missing: bool,
}

#[derive(Clone, Copy)]
pub struct Filter<'a> {
	pub match_mode: MatchMode,
	pub rows: &'a [FilterRow<'a>],
}

#[derive(Clone, Copy)]
pub struct RoutineForm<'a> {
	pub written: bool,
	pub title: &'a TextEdit,
	pub instruction: &'a TextEdit,
	pub trigger: TriggerField<'a>,
	pub configuration: Configuration<'a>,
	pub refusal: Option<FormRefusal>,
	pub filter: Filter<'a>,
	pub saving: bool,
}

struct Wiring<S: 'static> {
	emit: Emit<S>,
	edit_of: EditOf<S>,
}

impl<S> Clone for Wiring<S> {
	fn clone(&self) -> Self {
		*self
	}
}

impl<S> Copy for Wiring<S> {}

fn label(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground)
}

fn hint(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap()
}

fn error_line(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS).color(t.destructive).wrap().role("alert")
}

fn field_stack(t: &Tokens, words: &str, control: El, notes: impl IntoIterator<Item = El>) -> El {
	col().w_full().gap(SPACING * 1.5).child(label(t, words)).child(control).children(notes)
}

fn control_frame(t: &Tokens, control: El, error: Option<&str>) -> El {
	let invalid = error.is_some();
	let control = match error {
		Some(words) => control.description(words),
		None => control,
	};
	let edge = if invalid { t.destructive } else { t.input };
	let ring = if invalid { faded(t.destructive, 0.3) } else { ring_tint(t, 0.3) };
	instant(
		control
			.w_full()
			.px(CONTROL_X)
			.py(CONTROL_Y)
			.radius(RADIUS_CONTROL)
			.border(BORDER, edge)
			.fill(t.muted)
			.invalid(invalid)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring),
	)
}

struct TextField<'a> {
	key: String,
	label: &'a str,
	edit: &'a TextEdit,
	field: FormField,
	placeholder: &'a str,
	error: Option<&'a str>,
	lines: Option<f32>,
}

fn text_field<S: 'static>(t: &Tokens, field: TextField, edit_of: EditOf<S>) -> El {
	let target = field.field;
	let input = text_input(field.edit, TEXT_SM)
		.key(field.key)
		.color(t.foreground)
		.caret(t.foreground, t.selection)
		.label(field.label)
		.on_edit(edit_access(move |s: &mut S| edit_of(s, target)));
	let input = if field.edit.text.is_empty() {
		input.placeholder(field.placeholder, t.muted_foreground)
	} else {
		input
	};
	let input = match field.lines {
		Some(lines) => input.wrap().h(lines * TEXT_SM.line_height + CONTROL_Y * 2.0),
		None => input.single_line(),
	};
	field_stack(
		t,
		field.label,
		control_frame(t, input, field.error),
		field.error.map(|words| error_line(t, words)),
	)
}

fn read_only_box(t: &Tokens, value: &str) -> El {
	row()
		.w_full()
		.min_w(0.0)
		.px(CONTROL_X)
		.py(CONTROL_Y)
		.radius(RADIUS_CONTROL)
		.border(BORDER, t.input)
		.read_only(true)
		.child(text(value.to_owned()).font(TEXT_SM).color(t.foreground).truncate())
}

struct Select<'a> {
	key: String,
	label: &'a str,
	shown: Option<&'a str>,
	placeholder: &'a str,
	error: Option<String>,
	picker: Picker,
}

fn select<S: 'static>(t: &Tokens, select: Select, emit: Emit<S>) -> El {
	let value = match select.shown {
		Some(shown) => text(shown.to_owned()).font(TEXT_SM).color(t.foreground),
		None => text(select.placeholder.to_owned()).font(TEXT_SM).color(t.muted_foreground),
	};
	let trigger = row()
		.key(select.key)
		.justify_between()
		.center_y()
		.gap(SPACING * 2.0)
		.role("combobox")
		.label(select.label)
		.child(value.truncate().min_w(0.0))
		.child(glyph(t, &icons::CHEVRON_DOWN, CHEVRON));
	let trigger =
		control_frame(t, trigger, select.error.as_deref()).pr(SELECT_END).cursor(Cursor::Pointer);
	let trigger = emits(trigger.focusable(true), emit, RoutinesEvent::Pick(select.picker));
	let error = select.error.map(|words| error_line(t, &words));
	field_stack(t, select.label, trigger, error)
}

fn trigger_field<S: 'static>(t: &Tokens, lang: Language, field: TriggerField, emit: Emit<S>) -> El {
	let words = say(copy::source::LABEL, lang);
	match field {
		TriggerField::Tied(title) => {
			let tied = say(copy::source::TIED, lang);
			field_stack(
				t,
				words,
				read_only_box(t, title).label(words).description(tied),
				[hint(t, tied)],
			)
		}
		TriggerField::Picking(picked) => select(
			t,
			Select {
				key: "routine-trigger".to_owned(),
				label: words,
				shown: picked,
				placeholder: say(copy::source::PLACEHOLDER, lang),
				error: None,
				picker: Picker::Trigger,
			},
			emit,
		),
	}
}

fn copy_field<S: 'static>(
	t: &Tokens,
	lang: Language,
	part: WebhookPart,
	value: &str,
	emit: Emit<S>,
) -> El {
	let words = say(
		match part {
			WebhookPart::Address => copy::webhook::URL,
			WebhookPart::Key => copy::webhook::KEY,
			WebhookPart::Header => copy::webhook::HEADER,
		},
		lang,
	);
	let mut line = row()
		.w_full()
		.gap(SPACING * 1.5)
		.center_y()
		.child(read_only_box(t, value).label(words).grow(1.0));
	if !value.is_empty() {
		let copy_label = super::fill(say(copy::webhook::COPY, lang), "field", words);
		line = line.child(icon_button(
			t,
			&icons::COPY,
			&copy_label,
			ButtonSize::IconSm,
			emit,
			RoutinesEvent::Copy(part),
		));
	}
	field_stack(t, words, line, None)
}

fn webhook_block<S: 'static>(t: &Tokens, lang: Language, webhook: Webhook, emit: Emit<S>) -> El {
	let (values, line) = match webhook {
		Webhook::Read(values) => (values, None),
		Webhook::Unwritten => {
			(WebhookValues { address: "", key: "", header: "" }, Some(copy::webhook::PENDING))
		}
		Webhook::Reading => {
			(WebhookValues { address: "", key: "", header: "" }, Some(copy::webhook::READING))
		}
		Webhook::Unreadable => {
			(WebhookValues { address: "", key: "", header: "" }, Some(copy::webhook::FAILURE))
		}
	};
	let ink =
		if matches!(webhook, Webhook::Unreadable) { t.destructive } else { t.muted_foreground };
	col()
		.w_full()
		.gap(SPACING * 2.0)
		.child(copy_field(t, lang, WebhookPart::Address, values.address, emit))
		.child(copy_field(t, lang, WebhookPart::Key, values.key, emit))
		.child(copy_field(t, lang, WebhookPart::Header, values.header, emit))
		.children(
			line.map(|key| text(say(key, lang)).font(TEXT_XS).color(ink).wrap().role("status")),
		)
}

fn operator_error(lang: Language, error: OperatorError) -> String {
	match error {
		OperatorError::Untyped => say(copy::error::UNTYPED_COMPARISON, lang).to_owned(),
		OperatorError::Unsupported(operator, field_type) => {
			let sentence = say(copy::error::UNSUPPORTED_OPERATOR, lang);
			let sentence = super::fill(sentence, "operator", say(operator.word(), lang));
			super::fill(&sentence, "fieldType", say(field_type.word(), lang))
		}
	}
}

fn filter_row<S: 'static>(
	t: &Tokens,
	lang: Language,
	rank: usize,
	filter_row: &FilterRow,
	wiring: Wiring<S>,
) -> El {
	let other_path = say(copy::filter::field::OTHER_PATH, lang);
	let (shown_field, named) = match filter_row.field {
		FieldPick::Declared(name) => (name, name.to_owned()),
		FieldPick::OtherPath(path) if path.text.is_empty() => (other_path, other_path.to_owned()),
		FieldPick::OtherPath(path) => (other_path, path.text.clone()),
	};
	let mut group = col()
		.key(format!("routine-filter-row-{rank}"))
		.w_full()
		.gap(SPACING * 2.0)
		.padding(FILTER_ROW_INSET)
		.radius(RADIUS_XL)
		.border(BORDER, t.border)
		.role("group")
		.label(super::fill(say(copy::filter::ROW, lang), "rank", &(rank + 1).to_string()))
		.child(select(
			t,
			Select {
				key: format!("routine-filter-field-{rank}"),
				label: say(copy::filter::field::LABEL, lang),
				shown: Some(shown_field),
				placeholder: "",
				error: None,
				picker: Picker::Field(rank),
			},
			wiring.emit,
		));
	if let FieldPick::OtherPath(path) = filter_row.field {
		group = group.child(text_field(
			t,
			TextField {
				key: format!("routine-filter-path-{rank}"),
				label: say(copy::filter::path::LABEL, lang),
				edit: path,
				field: FormField::FilterPath(rank),
				placeholder: say(copy::filter::path::PLACEHOLDER, lang),
				error: None,
				lines: None,
			},
			wiring.edit_of,
		));
	}
	group = group.child(select(
		t,
		Select {
			key: format!("routine-filter-operator-{rank}"),
			label: say(copy::filter::operator::LABEL, lang),
			shown: Some(say(filter_row.operator.word(), lang)),
			placeholder: "",
			error: filter_row.operator_error.map(|error| operator_error(lang, error)),
			picker: Picker::Operator(rank),
		},
		wiring.emit,
	));
	let value_label = say(copy::filter::value::LABEL, lang);
	let value_error = filter_row.value_missing.then(|| say(copy::error::BLANK_VALUE, lang));
	group = match filter_row.value {
		Value::Unasked => group,
		Value::Boolean(holds) => group.child(select(
			t,
			Select {
				key: format!("routine-filter-value-{rank}"),
				label: value_label,
				shown: Some(say(
					if holds { copy::filter::value::TRUE } else { copy::filter::value::FALSE },
					lang,
				)),
				placeholder: "",
				error: value_error.map(str::to_owned),
				picker: Picker::Value(rank),
			},
			wiring.emit,
		)),
		Value::Text(edit) | Value::Number(edit) => group.child(text_field(
			t,
			TextField {
				key: format!("routine-filter-value-{rank}"),
				label: value_label,
				edit,
				field: FormField::FilterValue(rank),
				placeholder: "",
				error: value_error,
				lines: None,
			},
			wiring.edit_of,
		)),
	};
	let remove_label = super::fill(say(copy::filter::REMOVE, lang), "field", &named);
	group.child(
		icon_button(
			t,
			&icons::CLOSE,
			&remove_label,
			ButtonSize::IconSm,
			wiring.emit,
			RoutinesEvent::RemoveFilterRow(rank),
		)
		.self_end(),
	)
}

fn filter_block<S: 'static>(t: &Tokens, lang: Language, filter: Filter, wiring: Wiring<S>) -> El {
	let words = say(copy::filter::LABEL, lang);
	let lead = if filter.rows.is_empty() {
		text(say(copy::filter::EVERY_EVENT, lang)).font(TEXT_XS).color(t.muted_foreground).wrap()
	} else {
		let mode = match filter.match_mode {
			MatchMode::All => copy::filter::match_mode::ALL,
			MatchMode::Any => copy::filter::match_mode::ANY,
		};
		select(
			t,
			Select {
				key: "routine-filter-match".to_owned(),
				label: say(copy::filter::match_mode::LABEL, lang),
				shown: Some(say(mode, lang)),
				placeholder: "",
				error: None,
				picker: Picker::MatchMode,
			},
			wiring.emit,
		)
	};
	let add_label = say(copy::filter::ADD, lang);
	let add = Button::new(add_label)
		.variant(ButtonVariant::Outline)
		.leading(&icons::PLUS)
		.view(t)
		.w_full();
	col()
		.w_full()
		.gap(SPACING * 2.0)
		.role("group")
		.label(words)
		.child(label(t, words))
		.child(lead)
		.children(
			filter
				.rows
				.iter()
				.enumerate()
				.map(|(rank, row)| filter_row(t, lang, rank, row, wiring)),
		)
		.child(emits(add, wiring.emit, RoutinesEvent::AddFilterRow))
}

pub fn routine_form<S: 'static>(
	t: &Tokens,
	lang: Language,
	form: &RoutineForm,
	emit: Emit<S>,
	edit_of: EditOf<S>,
) -> El {
	let wiring = Wiring { emit, edit_of };
	let refused =
		|refusal: FormRefusal, key: Key| (form.refusal == Some(refusal)).then(|| say(key, lang));
	let heading = say(if form.written { copy::EDIT } else { copy::NEW }, lang);
	let configuration = match form.configuration {
		Configuration::Nothing => None,
		Configuration::Schedule(expression) => Some(text_field(
			t,
			TextField {
				key: "routine-expression".to_owned(),
				label: say(copy::expression::LABEL, lang),
				edit: expression,
				field: FormField::Expression,
				placeholder: say(copy::expression::PLACEHOLDER, lang),
				error: refused(
					FormRefusal::UnreadableExpression,
					copy::error::UNREADABLE_EXPRESSION,
				),
				lines: None,
			},
			edit_of,
		)),
		Configuration::WatchedPath(path) => Some(text_field(
			t,
			TextField {
				key: "routine-path".to_owned(),
				label: say(copy::path::LABEL, lang),
				edit: path,
				field: FormField::Path,
				placeholder: say(copy::path::PLACEHOLDER, lang),
				error: None,
				lines: None,
			},
			edit_of,
		)),
		Configuration::Webhook(webhook) => Some(webhook_block(t, lang, webhook, emit)),
	};
	let save = Button::new(say(copy::SAVE, lang)).view(t).key("routine-save").w_full();
	let save = if form.saving {
		save.opacity(DISABLED_OPACITY)
	} else {
		emits(save, emit, RoutinesEvent::Save)
	};
	col()
		.key("routine-form")
		.w_full()
		.gap(SPACING * 4.0)
		.role("form")
		.label(heading)
		.child(text_field(
			t,
			TextField {
				key: "routine-title".to_owned(),
				label: say(copy::title::LABEL, lang),
				edit: form.title,
				field: FormField::Title,
				placeholder: say(copy::title::PLACEHOLDER, lang),
				error: refused(FormRefusal::BlankTitle, copy::error::BLANK_TITLE),
				lines: None,
			},
			edit_of,
		))
		.child(text_field(
			t,
			TextField {
				key: "routine-instruction".to_owned(),
				label: say(copy::instruction::LABEL, lang),
				edit: form.instruction,
				field: FormField::Instruction,
				placeholder: say(copy::instruction::PLACEHOLDER, lang),
				error: refused(FormRefusal::BlankInstruction, copy::error::BLANK_INSTRUCTION),
				lines: Some(INSTRUCTION_ROWS),
			},
			edit_of,
		))
		.child(trigger_field(t, lang, form.trigger, emit))
		.children(configuration)
		.child(filter_block(t, lang, form.filter, wiring))
		.child(save)
}
