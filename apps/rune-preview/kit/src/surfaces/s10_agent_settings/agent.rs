use rune::image::Image;
use rune::{Cursor, El, TextEdit, col, row, text};

use super::parts::{
	Density, Lines, PANEL_GAP, PickerOption, Select, TextField, below_trigger, button, hint, label,
	picker_menu,
};
use super::{Event, Field, Host, Picker, RuleList, fill, say};
use crate::avatar::{Activity, Face, Motion};
use crate::hues::Preset;
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::slider::slider;
use crate::primitives::{FOCUS_RING_WIDTH, equal_padding, instant, ring_tint, tight};
use crate::strings::bots::{approvals, danger, dialog, identity, runtime};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_MD, RADIUS_XL, SPACING, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, TEXT_XS_MONO, Tokens, faded,
};

const PREVIEW_AVATAR: f32 = SPACING * 16.0;
const OPTION_AVATAR: f32 = SPACING * 13.0;
const PICTURE_AVATAR: f32 = SPACING * 10.0;
const OPTION_INSET: f32 = SPACING * 1.5;
const OWN_HUE_INSET: f32 = SPACING * 3.5;
const READOUT_HEIGHT: f32 = SPACING * 7.0;
const HUE_TURN: f32 = 360.0;
const TALL_BOX: f32 = SPACING * 55.0;
const MEDIUM_BOX: f32 = SPACING * 33.0;
const MEMORY_ROWS: usize = 6;
const RULE_INSET: f32 = SPACING;
const DANGER_INSET: f32 = SPACING * 4.0;
const DANGER_BORDER_SHARE: f32 = 0.3;
const DANGER_PAGE_BORDER_SHARE: f32 = 0.25;
const DANGER_PAGE_FILL_SHARE: f32 = 0.05;
const READOUT_FIGURES: &str = "'tnum' 1";

pub fn panel(gap: f32, children: impl IntoIterator<Item = El>) -> El {
	col().w_full().gap(gap).children(children)
}

pub struct General<'a> {
	pub name: &'a TextEdit,
	pub title: &'a TextEdit,
}

pub fn general<S: Host>(t: &Tokens, density: Density, value: &General) -> El {
	panel(
		PANEL_GAP,
		[
			TextField::new(say(dialog::name::LABEL), value.name, Field::Name)
				.placeholder(say(dialog::name::PLACEHOLDER))
				.view::<S>(t, density),
			TextField::new(say(dialog::title::LABEL), value.title, Field::Title)
				.placeholder(say(dialog::title::PLACEHOLDER))
				.view::<S>(t, density),
		],
	)
}

pub struct Identity<'a> {
	pub name: &'a str,
	pub hue: Option<f32>,
	pub picture: Option<&'a Image>,
	pub working: bool,
}

impl Identity<'_> {
	pub fn avatar(&self, t: &Tokens, size: f32) -> El {
		let motion = if self.working {
			Motion::Running { activity: Activity::Writing, at_ms: 0.0 }
		} else {
			Motion::Still
		};
		Face { name: self.name, hue: self.hue, image: None, motion }.draw(size, t)
	}
}

#[derive(Clone, Copy, PartialEq)]
enum Colour {
	None,
	Preset(Preset),
	Own(f32),
}

impl Colour {
	fn of(hue: Option<f32>) -> Colour {
		match hue {
			None => Colour::None,
			Some(hue) => Preset::ALL
				.into_iter()
				.find(|preset| preset.hue() == hue)
				.map_or(Colour::Own(hue), Colour::Preset),
		}
	}

	fn hue(self) -> Option<f32> {
		match self {
			Colour::None => None,
			Colour::Preset(preset) => Some(preset.hue()),
			Colour::Own(hue) => Some(hue),
		}
	}

	fn label(self) -> String {
		match self {
			Colour::None => say(identity::colour::NONE).to_owned(),
			Colour::Preset(preset) => say(preset_label(preset)).to_owned(),
			Colour::Own(hue) => fill(identity::colour::OWN_VALUE, &[("hue", &format!("{hue:.0}"))]),
		}
	}
}

fn preset_label(preset: Preset) -> crate::strings::Key {
	match preset {
		Preset::Red => identity::colour::option::RED,
		Preset::Orange => identity::colour::option::ORANGE,
		Preset::Yellow => identity::colour::option::YELLOW,
		Preset::Green => identity::colour::option::GREEN,
		Preset::Cyan => identity::colour::option::CYAN,
		Preset::Blue => identity::colour::option::BLUE,
		Preset::Purple => identity::colour::option::PURPLE,
		Preset::Pink => identity::colour::option::PINK,
	}
}

pub fn appearance<S: Host>(t: &Tokens, density: Density, value: &Identity) -> El {
	let chosen = Colour::of(value.hue);
	let current = if value.picture.is_some() {
		say(identity::UPLOADED_IMAGE).to_owned()
	} else {
		chosen.label()
	};
	let preview = row().gap(SPACING * 4.0).center_y().child(value.avatar(t, PREVIEW_AVATAR)).child(
		col()
			.gap(SPACING)
			.child(text(say(identity::AVATAR)).font(TEXT_SM_MEDIUM).color(t.foreground))
			.child(text(current).font(TEXT_XS).color(t.muted_foreground).truncate()),
	);
	panel(
		SPACING * 6.0,
		[
			preview,
			colour_field::<S>(t, density, value, chosen),
			picture_field::<S>(t, density, value),
		],
	)
}

fn legend(t: &Tokens, density: Density, copy: &str) -> El {
	let ink = if density == Density::Page { t.foreground } else { t.muted_foreground };
	text(copy.to_owned()).font(TEXT_XS_MEDIUM).color(ink)
}

fn colour_field<S: Host>(t: &Tokens, density: Density, value: &Identity, chosen: Colour) -> El {
	let own = match chosen {
		Colour::Own(hue) => hue,
		_ => value.hue.unwrap_or(Preset::Blue.hue()),
	};
	let options = [Colour::None]
		.into_iter()
		.chain(Preset::ALL.map(Colour::Preset))
		.chain([Colour::Own(own)])
		.map(|option| {
			let selected = match (option, chosen) {
				(Colour::Own(_), Colour::Own(_)) => true,
				_ => option == chosen,
			};
			let label = match option {
				Colour::Own(_) => say(identity::colour::OWN).to_owned(),
				_ => option.label(),
			};
			let hue = option.hue();
			let tile = col()
				.key(format!("colour-{label}"))
				.padding(OPTION_INSET)
				.radius(RADIUS_XL)
				.hover(t.muted)
				.role("radio")
				.label(label)
				.checked(selected)
				.child(Face::still(value.name, hue).draw(OPTION_AVATAR, t));
			let tile = if selected { tile.fill(t.muted) } else { tile };
			instant(tile)
				.focusable(true)
				.cursor(Cursor::Pointer)
				.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
				.on_press(move |s: &mut S| s.emit(Event::Hue(hue)))
		});
	let mut field = col()
		.w_full()
		.gap(SPACING * 3.0)
		.role("radiogroup")
		.label(say(identity::colour::LABEL))
		.child(legend(t, density, say(identity::colour::LABEL)))
		.child(row().gap(SPACING).flex_wrap().children(options));
	if let Colour::Own(hue) = chosen {
		field = field.child(own_hue(t, hue));
	}
	field
}

fn own_hue(t: &Tokens, hue: f32) -> El {
	let readout = row()
		.padding(equal_padding(READOUT_HEIGHT, TEXT_COMPACT_MONO.size))
		.radius(RADIUS_MD)
		.border(1.0, t.border)
		.child(
			text(format!("{hue:.0}"))
				.font(rune::TextStyle { features: READOUT_FIGURES, ..tight(TEXT_COMPACT_MONO) })
				.color(t.foreground),
		)
		.child(
			text(say(identity::colour::DEGREE))
				.font(tight(TEXT_COMPACT_MONO))
				.color(t.muted_foreground),
		);
	col()
		.w_full()
		.padding(OWN_HUE_INSET)
		.gap(SPACING * 2.5)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.border)
		.child(
			row()
				.w_full()
				.justify_between()
				.center_y()
				.child(
					text(say(identity::colour::OWN)).font(TEXT_COMPACT_MEDIUM).color(t.foreground),
				)
				.child(readout),
		)
		.child(row().w_full().child(slider(
			t,
			say(identity::colour::OWN),
			hue / HUE_TURN,
			SPACING * 100.0,
			false,
		)))
}

fn picture_field<S: Host>(t: &Tokens, density: Density, value: &Identity) -> El {
	let pick =
		if value.picture.is_some() { identity::picture::CHANGE } else { identity::picture::ADD };
	let mut actions = row().gap(SPACING * 2.0).child(button::<S>(
		t,
		Button::new(say(pick)).leading(&icons::UPLOAD).variant(ButtonVariant::Outline),
		Event::AddPicture,
	));
	if value.picture.is_some() {
		actions = actions.child(button::<S>(
			t,
			Button::new(say(identity::picture::REMOVE)).variant(ButtonVariant::Ghost),
			Event::RemovePicture,
		));
	}
	col()
		.w_full()
		.gap(SPACING * 2.0)
		.child(legend(t, density, say(identity::picture::LABEL)))
		.child(
			row()
				.w_full()
				.padding(SPACING * 3.0)
				.gap(SPACING * 3.0)
				.radius(RADIUS_XL)
				.border(1.0, t.border)
				.fill(faded(t.muted, 0.4))
				.justify_between()
				.center_y()
				.child(value.avatar(t, PICTURE_AVATAR))
				.child(actions),
		)
}

pub struct Memory<'a> {
	pub edit: &'a TextEdit,
	pub saved: bool,
}

pub struct Instructions<'a> {
	pub instructions: &'a TextEdit,
	pub memory: Option<Memory<'a>>,
}

pub fn instructions<S: Host>(t: &Tokens, density: Density, value: &Instructions) -> El {
	let box_lines = if density == Density::Page { Lines::Height(TALL_BOX) } else { Lines::Fill };
	let prompt =
		TextField::new(say(dialog::instructions::LABEL), value.instructions, Field::Instructions)
			.placeholder(say(dialog::instructions::PLACEHOLDER))
			.lines(box_lines)
			.view::<S>(t, density);
	let mut fields = col().w_full().gap(PANEL_GAP).child(prompt);
	if density == Density::Dialog {
		fields = fields.grow(1.0);
	}
	fields.children(value.memory.as_ref().map(|memory| memory_panel::<S>(t, density, memory)))
}

fn memory_panel<S: Host>(t: &Tokens, density: Density, memory: &Memory) -> El {
	if memory.edit.text.is_empty() && memory.saved {
		return col()
			.w_full()
			.gap(SPACING * 1.5)
			.child(label(t, say(dialog::memory::LABEL)))
			.child(
				row()
					.w_full()
					.padding(equal_padding(SPACING * 9.0, TEXT_SM.size))
					.radius(RADIUS_CONTROL)
					.border(1.0, t.input)
					.child(
						text(say(dialog::memory::EMPTY))
							.font(tight(TEXT_SM))
							.color(t.muted_foreground),
					),
			);
	}
	let lines =
		if density == Density::Page { Lines::Height(MEDIUM_BOX) } else { Lines::Rows(MEMORY_ROWS) };
	col()
		.w_full()
		.gap(SPACING * 2.0)
		.child(
			TextField::new(say(dialog::memory::LABEL), memory.edit, Field::Memory)
				.hint(say(dialog::memory::HINT))
				.lines(lines)
				.view::<S>(t, density),
		)
		.child(
			row()
				.w_full()
				.gap(SPACING * 2.0)
				.justify_end()
				.child(button::<S>(
					t,
					Button::new(say(dialog::memory::clear::ACTION)).variant(ButtonVariant::Outline),
					Event::ClearMemory,
				))
				.child(button::<S>(
					t,
					Button::new(say(dialog::memory::SAVE)).disabled(memory.saved),
					Event::SaveMemory,
				)),
		)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
	Default,
	AcceptEdits,
	Plan,
	Auto,
	DontAsk,
}

impl Mode {
	pub const ALL: [Mode; 5] =
		[Mode::Default, Mode::AcceptEdits, Mode::Plan, Mode::Auto, Mode::DontAsk];

	pub fn value(self) -> &'static str {
		match self {
			Mode::Default => "default",
			Mode::AcceptEdits => "acceptEdits",
			Mode::Plan => "plan",
			Mode::Auto => "auto",
			Mode::DontAsk => "dontAsk",
		}
	}

	pub fn label(self) -> &'static str {
		say(match self {
			Mode::Default => approvals::mode::option::default::LABEL,
			Mode::AcceptEdits => approvals::mode::option::accept_edits::LABEL,
			Mode::Plan => approvals::mode::option::plan::LABEL,
			Mode::Auto => approvals::mode::option::auto::LABEL,
			Mode::DontAsk => approvals::mode::option::dont_ask::LABEL,
		})
	}

	fn hint(self) -> &'static str {
		say(match self {
			Mode::Default => approvals::mode::option::default::HINT,
			Mode::AcceptEdits => approvals::mode::option::accept_edits::HINT,
			Mode::Plan => approvals::mode::option::plan::HINT,
			Mode::Auto => approvals::mode::option::auto::HINT,
			Mode::DontAsk => approvals::mode::option::dont_ask::HINT,
		})
	}
}

pub struct Rules<'a> {
	pub items: &'a [&'a str],
	pub draft: &'a TextEdit,
	pub refused: bool,
}

pub struct Permissions<'a> {
	pub mode: Mode,
	pub allow: Rules<'a>,
	pub ask: Rules<'a>,
	pub deny: Rules<'a>,
	pub picking: bool,
}

pub fn permissions<S: Host>(t: &Tokens, density: Density, value: &Permissions) -> El {
	let mode = Select {
		label: say(approvals::mode::LABEL),
		shown: Some(value.mode.label()),
		placeholder: "",
		hint: Some(value.mode.hint()),
		disabled: false,
		picker: Picker::Mode,
	}
	.view::<S>(t, density);
	let mode = if value.picking {
		let options: Vec<PickerOption> = Mode::ALL
			.iter()
			.map(|mode| PickerOption { label: mode.label(), value: mode.value() })
			.collect();
		col().w_full().child(mode).child(below_trigger(picker_menu(
			t,
			say(approvals::mode::LABEL),
			&options,
			value.mode.value(),
		)))
	} else {
		mode
	};
	panel(
		PANEL_GAP,
		[mode].into_iter().chain(RuleList::ALL.into_iter().map(|list| {
			let rules = match list {
				RuleList::Allow => &value.allow,
				RuleList::Ask => &value.ask,
				RuleList::Deny => &value.deny,
			};
			rule_list::<S>(t, list, rules)
		})),
	)
}

fn rule_copy(list: RuleList) -> (&'static str, &'static str, &'static str) {
	match list {
		RuleList::Allow => (
			say(approvals::rule::allow::LABEL),
			say(approvals::rule::allow::HINT),
			say(approvals::rule::allow::EMPTY),
		),
		RuleList::Ask => (
			say(approvals::rule::ask::LABEL),
			say(approvals::rule::ask::HINT),
			say(approvals::rule::ask::EMPTY),
		),
		RuleList::Deny => (
			say(approvals::rule::deny::LABEL),
			say(approvals::rule::deny::HINT),
			say(approvals::rule::deny::EMPTY),
		),
	}
}

fn rule_list<S: Host>(t: &Tokens, list: RuleList, rules: &Rules) -> El {
	let (title, rule_hint, empty) = rule_copy(list);
	let draft = TextField::new(title, rules.draft, Field::Rule(list))
		.placeholder(say(approvals::rule::PLACEHOLDER))
		.invalid(rules.refused);
	let input = row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.child(row().grow(1.0).child(draft.unlabelled().view::<S>(t, Density::Dialog)))
		.child(button::<S>(
			t,
			Button::new(say(approvals::rule::ADD))
				.leading(&icons::PLUS)
				.variant(ButtonVariant::Outline),
			Event::AddRule(list),
		));
	let mut block = col().w_full().gap(SPACING * 1.5).child(label(t, title)).child(input);
	block = block.child(hint(t, Density::Dialog, rule_hint));
	if rules.refused {
		block = block
			.child(text(say(approvals::rule::INVALID)).font(TEXT_XS).color(t.destructive).wrap());
	}
	if rules.items.is_empty() {
		return block.child(text(empty).font(TEXT_XS).color(t.muted_foreground));
	}
	block.child(col().w_full().gap(SPACING).role("list").children(
		rules.items.iter().enumerate().map(|(at, rule)| {
			let remove = fill(approvals::rule::REMOVE, &[("rule", rule)]);
			row()
				.w_full()
				.padding(RULE_INSET)
				.gap(SPACING * 2.0)
				.radius(RADIUS_CONTROL)
				.border(1.0, t.input)
				.fill(t.muted)
				.center_y()
				.role("listitem")
				.child(
					text((*rule).to_owned())
						.font(TEXT_XS_MONO)
						.color(t.foreground)
						.ml(SPACING * 2.0)
						.grow(1.0)
						.truncate(),
				)
				.child(
					Button::icon(&icons::CLOSE, &remove)
						.variant(ButtonVariant::Ghost)
						.size(ButtonSize::IconXs)
						.view(t)
						.on_press(move |s: &mut S| s.emit(Event::RemoveRule(list, at))),
				)
		}),
	))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Effort {
	Low,
	Medium,
	High,
	XHigh,
	Max,
}

impl Effort {
	pub const ALL: [Effort; 5] =
		[Effort::Low, Effort::Medium, Effort::High, Effort::XHigh, Effort::Max];

	pub fn label(self) -> &'static str {
		say(match self {
			Effort::Low => runtime::effort::option::LOW,
			Effort::Medium => runtime::effort::option::MEDIUM,
			Effort::High => runtime::effort::option::HIGH,
			Effort::XHigh => runtime::effort::option::XHIGH,
			Effort::Max => runtime::effort::option::MAX,
		})
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputStyle {
	Concise,
	Standard,
}

impl OutputStyle {
	fn copy(self) -> (&'static str, &'static str) {
		match self {
			OutputStyle::Concise => (
				say(runtime::output_style::option::concise::LABEL),
				say(runtime::output_style::option::concise::HINT),
			),
			OutputStyle::Standard => (
				say(runtime::output_style::option::default::LABEL),
				say(runtime::output_style::option::default::HINT),
			),
		}
	}
}

pub struct Model<'a> {
	pub label: &'a str,
	pub value: &'a str,
	pub efforts: &'a [Effort],
}

pub struct Runtime<'a> {
	pub models: &'a [Model<'a>],
	pub model: &'a str,
	pub effort: Option<Effort>,
	pub output_style: OutputStyle,
	pub picking: Option<Picker>,
}

pub fn runtime<S: Host>(t: &Tokens, density: Density, value: &Runtime) -> El {
	let current = value.models.iter().find(|model| model.value == value.model);
	let supported = current.map_or(&[][..], |model| model.efforts);
	let shown_effort = value.effort.filter(|effort| supported.contains(effort));
	let (style_label, style_hint) = value.output_style.copy();
	let model = Select {
		label: say(runtime::model::LABEL),
		shown: current.map(|model| model.label),
		placeholder: say(runtime::model::PLACEHOLDER),
		hint: None,
		disabled: false,
		picker: Picker::Model,
	}
	.view::<S>(t, density);
	let effort = Select {
		label: say(runtime::effort::LABEL),
		shown: Some(shown_effort.map_or(say(runtime::effort::option::DEFAULT), Effort::label)),
		placeholder: "",
		hint: None,
		disabled: supported.is_empty(),
		picker: Picker::Effort,
	}
	.view::<S>(t, density);
	let style = Select {
		label: say(runtime::output_style::LABEL),
		shown: Some(style_label),
		placeholder: "",
		hint: Some(style_hint),
		disabled: false,
		picker: Picker::OutputStyle,
	}
	.view::<S>(t, density);
	let model = match value.picking {
		Some(Picker::Model) => {
			let options: Vec<PickerOption> = value
				.models
				.iter()
				.map(|model| PickerOption { label: model.label, value: model.value })
				.collect();
			col().w_full().child(model).child(below_trigger(picker_menu(
				t,
				say(runtime::model::LABEL),
				&options,
				value.model,
			)))
		}
		_ => model,
	};
	panel(PANEL_GAP, [model, effort, style])
}

pub struct Danger<'a> {
	pub action: &'a str,
	pub description: &'a str,
	pub disabled_reason: Option<&'a str>,
}

impl Danger<'_> {
	pub fn agent() -> Danger<'static> {
		Danger {
			action: say(danger::DELETE),
			description: say(danger::DESCRIPTION),
			disabled_reason: None,
		}
	}
}

pub fn danger_zone<S: Host>(t: &Tokens, density: Density, value: &Danger) -> El {
	let block = col()
		.w_full()
		.padding(DANGER_INSET)
		.gap(SPACING * 3.0)
		.items_start()
		.radius(RADIUS_XL)
		.child(
			col()
				.gap(SPACING)
				.child(text(value.action.to_owned()).font(TEXT_SM_MEDIUM).color(t.destructive))
				.child(
					text(value.disabled_reason.unwrap_or(value.description).to_owned())
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.wrap(),
				),
		)
		.child(
			Button::new(value.action)
				.leading(&icons::BIN)
				.variant(ButtonVariant::Destructive)
				.size(ButtonSize::Sm)
				.disabled(value.disabled_reason.is_some())
				.view(t)
				.on_press(|s: &mut S| s.emit(Event::Delete)),
		);
	match density {
		Density::Dialog => block.border(1.0, faded(t.destructive, DANGER_BORDER_SHARE)),
		Density::Page => block
			.border(1.0, faded(t.destructive, DANGER_PAGE_BORDER_SHARE))
			.fill(faded(t.destructive, DANGER_PAGE_FILL_SHARE)),
	}
}
