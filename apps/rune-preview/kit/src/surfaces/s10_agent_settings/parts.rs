use rune::{Cursor, El, Icon, TextEdit, col, el, icon, row, text, text_input};

use super::{Event, Field, Host, say};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::{DialogContent, dialog};
use crate::primitives::dropdown_menu::{Mark, MenuItem, MenuRow, dropdown_menu};
use crate::primitives::skeleton::skeleton;
use crate::primitives::switch::{SwitchSize, switch};
use crate::primitives::{FOCUS_RING_WIDTH, equal_padding, instant, ring_tint, tight};
use crate::strings::common;
use crate::tokens::{
	RADIUS_2XL, RADIUS_CONTROL, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS,
	TEXT_XS_MEDIUM, TEXT_XS_MONO, Tokens, mix,
};

pub(super) const PANEL_INSET: f32 = SPACING * 5.0;
pub(super) const PANEL_GAP: f32 = SPACING * 4.0;
const CONTROL_HEIGHT: f32 = SPACING * 9.0;
const CONTROL_GLYPH: f32 = SPACING * 4.0;
const AREA_INSET: f32 = SPACING * 3.0;
const ROW_INSET: f32 = SPACING * 3.0;
const TAG_HEIGHT: f32 = SPACING * 5.0;
const EMPTY_GLYPH: f32 = SPACING * 8.0;
const EMPTY_MEASURE: f32 = SPACING * 80.0;
const SKELETON_ROWS: usize = 14;
const PICKER_GAP: f32 = SPACING * 1.5;
pub(super) const SMALL_GLYPH: f32 = SPACING * 3.5;
pub(super) const ROW_GLYPH: f32 = SPACING * 4.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Density {
	#[default]
	Dialog,
	Page,
}

impl Density {
	fn field_gap(self) -> f32 {
		match self {
			Density::Dialog => SPACING * 1.5,
			Density::Page => SPACING * 2.0,
		}
	}

	fn hint(self) -> rune::TextStyle {
		match self {
			Density::Dialog => TEXT_XS,
			Density::Page => TEXT_COMPACT,
		}
	}

	pub(super) fn row_radius(self) -> f32 {
		match self {
			Density::Dialog => RADIUS_XL,
			Density::Page => RADIUS_CONTROL,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Picker {
	Model,
	Effort,
	OutputStyle,
	Mode,
	SkillEffort,
	SkillContext,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Lines {
	One,
	Rows(usize),
	Fill,
	Height(f32),
}

pub(super) struct TextField<'a> {
	pub label: &'a str,
	pub edit: &'a TextEdit,
	pub field: Field,
	pub placeholder: &'a str,
	pub hint: Option<&'a str>,
	pub error: Option<&'a str>,
	pub lines: Lines,
	pub read_only: bool,
	pub mono: bool,
	pub labelled: bool,
	pub invalid: bool,
}

impl<'a> TextField<'a> {
	pub(super) fn new(label: &'a str, edit: &'a TextEdit, field: Field) -> TextField<'a> {
		TextField {
			label,
			edit,
			field,
			placeholder: "",
			hint: None,
			error: None,
			lines: Lines::One,
			read_only: false,
			mono: false,
			labelled: true,
			invalid: false,
		}
	}

	pub(super) fn placeholder(self, placeholder: &'a str) -> TextField<'a> {
		TextField { placeholder, ..self }
	}

	pub(super) fn hint(self, hint: &'a str) -> TextField<'a> {
		TextField { hint: Some(hint), ..self }
	}

	pub(super) fn error(self, error: Option<&'a str>) -> TextField<'a> {
		TextField { error, ..self }
	}

	pub(super) fn lines(self, lines: Lines) -> TextField<'a> {
		TextField { lines, ..self }
	}

	pub(super) fn read_only(self) -> TextField<'a> {
		TextField { read_only: true, ..self }
	}

	pub(super) fn unlabelled(self) -> TextField<'a> {
		TextField { labelled: false, ..self }
	}

	pub(super) fn invalid(self, invalid: bool) -> TextField<'a> {
		TextField { invalid, ..self }
	}

	pub(super) fn mono(self) -> TextField<'a> {
		TextField { mono: true, ..self }
	}

	pub(super) fn view<S: Host>(self, t: &Tokens, density: Density) -> El {
		let single = self.lines == Lines::One;
		let style = match (self.mono, single) {
			(true, _) => TEXT_XS_MONO,
			(false, true) => tight(TEXT_SM),
			(false, false) => TEXT_SM,
		};
		let inset = if single { equal_padding(CONTROL_HEIGHT, style.size) } else { AREA_INSET };
		let field = self.field;
		let invalid = self.invalid || self.error.is_some();
		let mut control = text_input(self.edit, style)
			.key(format!("field-{}", self.label))
			.w_full()
			.padding(inset)
			.radius(RADIUS_CONTROL)
			.border(1.0, if invalid { t.destructive } else { t.input })
			.color(t.foreground)
			.placeholder(self.placeholder, t.muted_foreground)
			.caret(t.foreground, t.selection)
			.label(self.label)
			.invalid(invalid)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3));
		control = if self.read_only {
			control.read_only(true)
		} else {
			control.fill(t.muted).on_edit(move |s: &mut S| s.edit(field))
		};
		control = match self.lines {
			Lines::One => control.single_line(),
			Lines::Rows(rows) => control.min_h(rows as f32 * style.line_height + AREA_INSET * 2.0),
			Lines::Fill => control.grow(1.0),
			Lines::Height(height) => control.h(height),
		};
		let mut block = col()
			.w_full()
			.gap(density.field_gap())
			.children(self.labelled.then(|| label(t, self.label)))
			.child(instant(control));
		if self.lines == Lines::Fill {
			block = block.grow(1.0);
		}
		block.children(self.hint.map(|copy| hint(t, density, copy))).children(
			self.error.map(|copy| text(copy.to_owned()).font(TEXT_XS).color(t.destructive).wrap()),
		)
	}
}

pub(super) fn label(t: &Tokens, copy: &str) -> El {
	text(copy.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground)
}

pub(super) fn hint(t: &Tokens, density: Density, copy: &str) -> El {
	text(copy.to_owned()).font(density.hint()).color(t.muted_foreground).wrap()
}

pub(super) struct Select<'a> {
	pub label: &'a str,
	pub shown: Option<&'a str>,
	pub placeholder: &'a str,
	pub hint: Option<&'a str>,
	pub disabled: bool,
	pub picker: Picker,
}

impl Select<'_> {
	pub(super) fn view<S: Host>(self, t: &Tokens, density: Density) -> El {
		let picker = self.picker;
		let (copy, ink) = match self.shown {
			Some(shown) => (shown, t.foreground),
			None => (self.placeholder, t.muted_foreground),
		};
		let trigger = row()
			.key(format!("select-{}", self.label))
			.w_full()
			.padding(equal_padding(CONTROL_HEIGHT, CONTROL_GLYPH))
			.gap(SPACING * 2.0)
			.radius(RADIUS_CONTROL)
			.fill(t.muted)
			.border(1.0, t.input)
			.hover(mix(t.muted, t.foreground, 0.95))
			.center_y()
			.role("combobox")
			.label(self.label)
			.child(text(copy.to_owned()).font(tight(TEXT_SM)).color(ink).grow(1.0).truncate())
			.child(icon(&icons::CHEVRON_DOWN, CONTROL_GLYPH).color(t.muted_foreground));
		let trigger = if self.disabled {
			instant(trigger).disabled(true).opacity(crate::primitives::DISABLED_OPACITY)
		} else {
			instant(trigger)
				.focusable(true)
				.cursor(Cursor::Pointer)
				.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
				.on_press(move |s: &mut S| s.emit(Event::OpenPicker(picker)))
		};
		col()
			.w_full()
			.gap(density.field_gap())
			.child(label(t, self.label))
			.child(trigger)
			.children(self.hint.map(|copy| hint(t, density, copy)))
	}
}

pub struct PickerOption<'a> {
	pub label: &'a str,
	pub value: &'a str,
}

pub fn picker_menu(t: &Tokens, label: &str, options: &[PickerOption], chosen: &str) -> El {
	dropdown_menu(
		t,
		label,
		options.iter().map(|option| {
			MenuRow::Item(MenuItem::new(option.label).mark(Mark::Check(option.value == chosen)))
		}),
	)
}

pub(super) fn below_trigger(menu: El) -> El {
	menu.mt(PICKER_GAP)
}

pub(super) fn switch_row<S: Host>(
	t: &Tokens,
	label_copy: &str,
	description: &str,
	checked: bool,
	event: Event,
) -> El {
	row()
		.w_full()
		.gap(SPACING * 3.0)
		.items_start()
		.child(
			col()
				.grow(1.0)
				.gap(SPACING * 0.5)
				.child(text(label_copy.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
				.child(text(description.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap()),
		)
		.child(
			switch(t, label_copy, checked, false, SwitchSize::Default)
				.on_press(move |s: &mut S| s.emit(event.clone())),
		)
}

pub(super) fn tag(t: &Tokens, copy: &str, ink: rune::Color) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	row()
		.padding(equal_padding(TAG_HEIGHT, style.size))
		.radius(RADIUS_2XL)
		.fill(t.muted)
		.child(text(copy.to_owned()).font(style).color(ink))
}

pub(super) struct ListRow<'a> {
	pub key: String,
	pub glyph: Option<&'static Icon>,
	pub title: &'a str,
	pub description: Option<&'a str>,
	pub tags: Vec<El>,
	pub event: Event,
}

impl ListRow<'_> {
	pub(super) fn view<S: Host>(self, t: &Tokens, density: Density) -> El {
		let event = self.event;
		let mut content = col().grow(1.0).gap(SPACING * 0.5).child(
			text(self.title.to_owned())
				.font(if self.description.is_some() || self.glyph.is_none() {
					TEXT_SM_MEDIUM
				} else {
					TEXT_SM
				})
				.color(t.foreground)
				.truncate(),
		);
		if let Some(description) = self.description {
			content = content.child(
				text(description.to_owned()).font(TEXT_XS).color(t.muted_foreground).truncate(),
			);
		}
		let row = row()
			.key(self.key)
			.w_full()
			.padding(ROW_INSET)
			.gap(SPACING * 3.0)
			.radius(density.row_radius())
			.border(1.0, t.border)
			.hover(t.muted)
			.center_y()
			.role("button")
			.label(self.title)
			.children(self.glyph.map(|glyph| icon(glyph, ROW_GLYPH).color(t.muted_foreground)))
			.child(content)
			.children(self.tags)
			.child(icon(&icons::NEXT, ROW_GLYPH).color(t.muted_foreground));
		instant(row)
			.focusable(true)
			.cursor(Cursor::Pointer)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
			.on_press(move |s: &mut S| s.emit(event.clone()))
	}
}

pub(super) fn list(rows: impl IntoIterator<Item = El>) -> El {
	col().w_full().gap(SPACING * 2.0).role("list").children(rows)
}

pub(super) fn empty(
	t: &Tokens,
	glyph: &'static Icon,
	ink: rune::Color,
	title: Option<&str>,
	description: &str,
	action: Option<El>,
) -> El {
	let mut copy = col().gap(SPACING).items_center();
	if let Some(title) = title {
		copy = copy.child(text(title.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground));
	}
	copy = copy.child(
		text(description.to_owned())
			.font(TEXT_SM)
			.color(t.muted_foreground)
			.align(rune::Align::Center)
			.max_w(EMPTY_MEASURE)
			.wrap(),
	);
	col()
		.w_full()
		.grow(1.0)
		.gap(SPACING * 3.0)
		.center()
		.child(icon(glyph, EMPTY_GLYPH).color(ink))
		.child(copy)
		.children(action)
}

pub(super) fn add_button<S: Host>(
	t: &Tokens,
	copy: &str,
	variant: ButtonVariant,
	event: Event,
) -> El {
	Button::new(copy)
		.leading(&icons::PLUS)
		.variant(variant)
		.size(ButtonSize::Sm)
		.view(t)
		.on_press(move |s: &mut S| s.emit(event.clone()))
}

pub(super) fn button<S: Host>(t: &Tokens, button: Button, event: Event) -> El {
	button.size(ButtonSize::Sm).view(t).on_press(move |s: &mut S| s.emit(event.clone()))
}

pub(super) fn notice<S: Host>(t: &Tokens, copy: &str, retry: Option<(&str, Event)>) -> El {
	row()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.radius(RADIUS_XL)
		.fill(t.destructive_tint)
		.center_y()
		.role("alert")
		.child(icon(&icons::CIRCLE_ALERT, ROW_GLYPH).color(t.destructive_tint_foreground))
		.child(
			text(copy.to_owned())
				.font(TEXT_SM)
				.color(t.destructive_tint_foreground)
				.grow(1.0)
				.wrap(),
		)
		.children(retry.map(|(copy, event)| {
			button::<S>(t, Button::new(copy).variant(ButtonVariant::Outline), event)
		}))
}

pub(super) fn confirm<S: Host>(
	t: &Tokens,
	title: &str,
	description: &str,
	action: &str,
	then: Event,
) -> El {
	let cancel = button::<S>(
		t,
		Button::new(say(common::confirm::CANCEL)).variant(ButtonVariant::Outline),
		Event::Dismiss,
	);
	let act = button::<S>(t, Button::new(action).variant(ButtonVariant::Destructive), then);
	dialog(t, DialogContent { title, description, footer: vec![cancel, act] }, |s: &mut S| {
		s.emit(Event::Dismiss)
	})
}

pub(super) fn skeleton_rows(head: Option<El>, row_of: impl Fn() -> El) -> El {
	col()
		.w_full()
		.grow(1.0)
		.h_full()
		.gap(SPACING * 2.0)
		.clip_rounded(0.0)
		.a11y_hidden()
		.children(head)
		.children((0..SKELETON_ROWS).map(|_| row_of()))
}

pub(super) fn bar(t: &Tokens, width: f32, height: f32) -> El {
	skeleton(t).w(width).h(height)
}

pub(super) fn outlined_skeleton_row(t: &Tokens, density: Density, bars: Vec<El>) -> El {
	row()
		.w_full()
		.padding(ROW_INSET)
		.gap(SPACING * 3.0)
		.radius(density.row_radius())
		.border(1.0, t.border)
		.center_y()
		.child(col().grow(1.0).gap(SPACING * 1.5).children(bars))
}

pub(super) fn spacer_line(t: &Tokens) -> El {
	el().h(1.0).grow(1.0).fill(t.border).a11y_hidden()
}
