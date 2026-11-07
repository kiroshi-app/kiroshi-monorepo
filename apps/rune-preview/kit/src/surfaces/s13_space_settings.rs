use std::f32::consts::{FRAC_PI_2, TAU};

use rune::{
	Color, Cursor, El, Icon, LiveRegion, Shape, TextEdit, TextStyle, canvas, col, el, icon, row,
	text, text_input,
};

use crate::avatar::Face;
use crate::hues::{Preset, Role};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::scrim;
use crate::primitives::skeleton::skeleton;
use crate::primitives::switch::{SwitchSize, switch};
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::primitives::{
	DISABLED_OPACITY, FOCUS_RING_WIDTH, elevated, instant, popup_motion, ring_tint, tight,
};
use crate::scenes::SceneState;
use crate::strings::{Key, Language, bots, common, settings};
use crate::tokens::{
	RADIUS_2XL, RADIUS_CONTROL, RADIUS_MD, RADIUS_XL, SIDEBAR_RAIL, SPACING, TEXT_BASE_MEDIUM,
	TEXT_BASE_SEMIBOLD, TEXT_COMPACT, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded, tone,
};
use crate::widgets::not_drawn;

#[derive(Clone, Debug, PartialEq)]
pub enum SpaceEvent {
	Close,
	Select(Entry),
	Save,
	PickColour(Option<f32>),
	Export,
	Import,
	Invite,
	Resend(String),
	Withdraw(String),
	Remove(String),
	ConfirmRemove,
	CancelRemove,
	Share(bool),
	SignIn,
	AskDanger,
	Delete,
	Leave,
	CancelDanger,
	Open,
	Accept,
	Decline,
	Back,
	SelectAgent(String),
	CreateAgent,
}

pub struct Wiring<S> {
	pub emit: fn(&mut S, SpaceEvent),
	pub name: fn(&mut S) -> &mut TextEdit,
	pub email: fn(&mut S) -> &mut TextEdit,
}

impl<S> Clone for Wiring<S> {
	fn clone(&self) -> Self {
		*self
	}
}

impl<S> Copy for Wiring<S> {}

impl<S: 'static> Wiring<S> {
	fn on(self, control: El, event: SpaceEvent) -> El {
		let emit = self.emit;
		control.on_press(move |s: &mut S| emit(s, event.clone()))
	}

	fn on_submit(self, control: El) -> El {
		let emit = self.emit;
		control.on_submit(move |s: &mut S, _| emit(s, SpaceEvent::Save))
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
	Space,
	Members,
	Agents,
	Secrets,
	Skills,
	Applications,
	History,
	Danger,
}

impl Entry {
	fn label(self, invitation: bool) -> &'static str {
		say(match self {
			Entry::Space if invitation => settings::rail::INVITATION,
			Entry::Space => settings::rail::SPACE,
			Entry::Members => settings::rail::MEMBERS,
			Entry::Agents => settings::rail::AGENTS,
			Entry::Secrets => settings::rail::SECRETS,
			Entry::Skills => settings::rail::SKILLS,
			Entry::Applications => settings::rail::APPLICATIONS,
			Entry::History => settings::rail::HISTORY,
			Entry::Danger => settings::rail::DANGER,
		})
	}

	fn glyph(self, selected: bool) -> &'static Icon {
		match (self, selected) {
			(Entry::Space, false) => &icons::FOLDER,
			(Entry::Space, true) => &icons::FOLDER_FILL,
			(Entry::Members, false) => &icons::USERS,
			(Entry::Members, true) => &icons::USERS_FILL,
			(Entry::Agents, false) => &icons::HEXAGONS,
			(Entry::Agents, true) => &icons::HEXAGONS_FILL,
			(Entry::Secrets, false) => &icons::CODE,
			(Entry::Secrets, true) => &icons::CODE_FILL,
			(Entry::Skills, false) => &icons::SPARKLES,
			(Entry::Skills, true) => &icons::SPARKLES_FILL,
			(Entry::Applications, false) => &icons::SERVER,
			(Entry::Applications, true) => &icons::SERVER_FILL,
			(Entry::History, false) => &icons::HISTORY,
			(Entry::History, true) => &icons::HISTORY_FILL,
			(Entry::Danger, false) => &icons::TRIANGLE_ALERT,
			(Entry::Danger, true) => &icons::TRIANGLE_ALERT_FILL,
		}
	}

	fn drawn_elsewhere(self) -> Option<&'static str> {
		match self {
			Entry::Secrets => Some("S11 secrets panel"),
			Entry::Skills => Some("S10 skills panel"),
			Entry::Applications => Some("S11 applications panel"),
			Entry::History => Some("S10 history panel"),
			_ => None,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpaceValue<'a> {
	pub name: &'a str,
	pub colour: Option<f32>,
}

impl SpaceValue<'_> {
	fn shown_name(&self) -> &str {
		match self.name.trim() {
			"" => say(settings::space::UNTITLED),
			name => name,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MemberStatus<'a> {
	Host,
	Joined,
	NeedsInvitation,
	Pending { expires_in_days: Option<u32> },
	Expired { sent: Option<&'a str> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Member<'a> {
	pub id: &'a str,
	pub name: Option<&'a str>,
	pub email: &'a str,
	pub status: MemberStatus<'a>,
}

impl Member<'_> {
	fn shown(&self) -> &str {
		self.name.unwrap_or(self.email)
	}

	fn first_name(&self) -> &str {
		self.shown().split_whitespace().next().unwrap_or_default()
	}

	fn is_invitation(&self) -> bool {
		matches!(self.status, MemberStatus::Pending { .. } | MemberStatus::Expired { .. })
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
	Invited,
	OwnAddress,
	Malformed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Blocker {
	SignedOut,
	HostOffline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reason {
	NotHosting,
	NotOwner,
	NeedsSignIn,
	Unreachable,
	Generic,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InviteReason<'a> {
	Common(Reason),
	LimitReached,
	Offline,
	TimedOut,
	Unsent,
	RelayStatus(Option<u16>),
	RelayConflict(Option<&'a str>),
	UnreadableConflict,
	UnreadableList,
	ListNotReadBack,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WithdrawReason {
	Common(Reason),
	Gone,
	Joined,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemoveReason {
	Common(Reason),
	Gone,
	Pending,
	Host,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure<'a> {
	Invite { reason: InviteReason<'a>, email: &'a str },
	Withdraw { reason: WithdrawReason, member: Member<'a> },
	Remove { reason: RemoveReason, member: Member<'a> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sharing {
	Off,
	Connecting,
	Online,
	SignedOut,
}

pub struct Members<'a> {
	pub space: &'a str,
	pub members: &'a [Member<'a>],
	pub loading: bool,
	pub email: &'a TextEdit,
	pub refusal: Option<Refusal>,
	pub failure: Option<Failure<'a>>,
	pub hosted: bool,
	pub blocked_by: Option<Blocker>,
	pub viewer: Option<&'a str>,
	pub removing: Option<Member<'a>>,
	pub inviting_again: Option<&'a str>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
	Ask,
	AcceptEdits,
	Plan,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Agent<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub hue: Option<f32>,
	pub title: Option<&'a str>,
	pub instructions: &'a str,
	pub skills: Option<u32>,
	pub applications: Option<u32>,
	pub mode: Mode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Danger {
	Delete { deletable: bool },
	Leave,
}

pub struct SpaceSettings<'a> {
	pub value: SpaceValue<'a>,
	pub name: &'a TextEdit,
	pub joined_host: Option<&'a str>,
	pub transfer: bool,
	pub danger: Danger,
	pub members: Option<Members<'a>>,
	pub sharing: Option<Sharing>,
	pub agents: Option<&'a [Agent<'a>]>,
	pub entry: Entry,
	pub asking: bool,
	pub notices: Vec<Notice>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
	pub failed: bool,
	pub title: String,
	pub description: String,
}

fn say(key: Key) -> &'static str {
	key.text(Language::En)
}

fn fill(key: Key, args: &[(&str, &str)]) -> String {
	args.iter().fold(say(key).to_owned(), |copy, (name, value)| {
		copy.replace(&format!("{{{{{name}}}}}"), value)
	})
}

fn ring(t: &Tokens, control: El) -> El {
	control.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}

fn field_label(t: &Tokens, label: &str) -> El {
	text(label.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground)
}

fn helper(t: &Tokens, copy: &str, failed: bool) -> El {
	let line = text(copy.to_owned())
		.font(TEXT_XS)
		.color(if failed { t.destructive } else { t.muted_foreground })
		.wrap_anywhere();
	if failed { line.role("status").live_region(LiveRegion::Polite) } else { line }
}

const FIELD_HEIGHT: f32 = SPACING * 9.5;

fn field_box<S: 'static>(
	t: &Tokens,
	edit: &TextEdit,
	label: &str,
	placeholder: &str,
	access: fn(&mut S) -> &mut TextEdit,
) -> El {
	let style = TextStyle { line_height: TEXT_SM.size, ..TEXT_SM };
	let control = text_input(edit, style)
		.single_line()
		.key(format!("field-{label}"))
		.w_full()
		.h(FIELD_HEIGHT)
		.px(SPACING * 3.0)
		.py((FIELD_HEIGHT - style.size) / 2.0)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.input)
		.fill(t.muted)
		.color(t.foreground)
		.placeholder(placeholder, t.muted_foreground)
		.caret(t.foreground, t.selection)
		.label(label)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
		.on_edit(access);
	instant(control)
}

fn read_only_box(t: &Tokens, value: &str, label: &str) -> El {
	row()
		.w_full()
		.h(FIELD_HEIGHT)
		.px(SPACING * 3.0)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.input)
		.center_y()
		.role("textbox")
		.label(label)
		.read_only(true)
		.focusable(true)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
		.child(text(value.to_owned()).font(TEXT_SM).color(t.foreground).max_lines(1).truncate())
}

pub fn space_tint(t: &Tokens, hue: Option<f32>, side: f32) -> El {
	let dot = el().size(side, side).radius(side / 2.0).a11y_hidden();
	match hue {
		Some(hue) => {
			let tinted = t.in_space(Some(hue));
			dot.fill(tinted.user_bubble).border(1.0, tinted.primary_strong)
		}
		None => dot.fill(t.muted).border(1.0, t.border),
	}
}

const RAINBOW_WEDGES: usize = 48;
const LAST_HUE: f32 = 359.0;
const OWN_HUE_BY_DEFAULT: f32 = 320.0;

fn rainbow_disc(t: &Tokens, side: f32) -> El {
	let centre = side / 2.0;
	let point = |turn: f32| {
		let angle = turn * TAU - FRAC_PI_2;
		[centre + centre * angle.cos(), centre + centre * angle.sin()]
	};
	let shape = (0..RAINBOW_WEDGES).fold(Shape::new().view_box(side, side), |shape, at| {
		let from = at as f32 / RAINBOW_WEDGES as f32;
		let to = (at + 1) as f32 / RAINBOW_WEDGES as f32;
		let ink = tone(from * LAST_HUE, t.dark, Role::Accent);
		shape.fill(vec![[centre, centre], point(from), point(to + 0.002)], ink)
	});
	el().size(side, side)
		.radius(side / 2.0)
		.clip_rounded(side / 2.0)
		.child(canvas(shape).size(side, side))
}

fn rainbow_track(t: &Tokens, track: El) -> El {
	let stops: Vec<(f32, Color)> = (0..8)
		.map(|at| {
			let share = at as f32 / 7.0;
			(share, tone(share * LAST_HUE, t.dark, Role::Accent))
		})
		.collect();
	track.linear_gradient(FRAC_PI_2, stops)
}

#[derive(Clone, Copy, PartialEq)]
enum Swatch {
	None,
	Preset(Preset),
	Own,
}

const SWATCH_ORDER: [Preset; 8] = [
	Preset::Red,
	Preset::Yellow,
	Preset::Green,
	Preset::Cyan,
	Preset::Blue,
	Preset::Purple,
	Preset::Pink,
	Preset::Orange,
];

fn preset_of(hue: f32) -> Option<Preset> {
	Preset::ALL.into_iter().find(|preset| preset.hue() == hue)
}

fn swatch_label(swatch: Swatch) -> &'static str {
	say(match swatch {
		Swatch::None => bots::identity::colour::NONE,
		Swatch::Own => bots::identity::colour::OWN,
		Swatch::Preset(preset) => match preset {
			Preset::Red => bots::identity::colour::option::RED,
			Preset::Orange => bots::identity::colour::option::ORANGE,
			Preset::Yellow => bots::identity::colour::option::YELLOW,
			Preset::Green => bots::identity::colour::option::GREEN,
			Preset::Cyan => bots::identity::colour::option::CYAN,
			Preset::Blue => bots::identity::colour::option::BLUE,
			Preset::Purple => bots::identity::colour::option::PURPLE,
			Preset::Pink => bots::identity::colour::option::PINK,
		},
	})
}

const SWATCH: (f32, f32) = (SPACING * 12.0, SPACING * 10.0);
const SWATCH_MARK: f32 = SPACING * 6.0;

fn swatch<S: 'static>(t: &Tokens, option: Swatch, own: f32, picked: bool, w: Wiring<S>) -> El {
	let (mark, hue) = match option {
		Swatch::None => (space_tint(t, None, SWATCH_MARK), None),
		Swatch::Preset(preset) => {
			(space_tint(t, Some(preset.hue()), SWATCH_MARK), Some(preset.hue()))
		}
		Swatch::Own => {
			let accent = t.in_space(Some(own)).primary;
			let pip_side = SPACING * 3.0;
			let pip = el()
				.size(pip_side, pip_side)
				.radius(pip_side / 2.0)
				.fill(accent)
				.outline(2.0, 0.0, t.card)
				.absolute((SWATCH_MARK - pip_side) / 2.0, (SWATCH_MARK - pip_side) / 2.0);
			let mark = rainbow_disc(t, SWATCH_MARK).child(pip).a11y_hidden();
			(mark, Some(own))
		}
	};
	let label = swatch_label(option);
	let control = row()
		.key(format!("swatch-{label}"))
		.size(SWATCH.0, SWATCH.1)
		.radius(RADIUS_MD)
		.center()
		.role("radio")
		.label(label)
		.checked(picked)
		.focus_selected(picked)
		.child(mark);
	let control = if picked {
		control.border(1.5, t.foreground).fill(t.muted)
	} else {
		control.border(1.0, t.border).hover(t.muted)
	};
	ring(t, w.on(instant(control), SpaceEvent::PickColour(hue)))
}

fn own_hue_box<S: 'static>(t: &Tokens, hue: f32, w: Wiring<S>) -> El {
	let tinted = t.in_space(Some(hue));
	let readout = row()
		.h(SPACING * 7.0)
		.px(SPACING * 2.5)
		.gap(SPACING * 0.5)
		.radius(RADIUS_MD)
		.border(1.0, t.border)
		.center_y()
		.a11y_hidden()
		.child(text(format!("{hue:.0}")).font(TEXT_COMPACT_MONO).color(t.foreground))
		.child(
			text(say(bots::identity::colour::DEGREE).to_owned())
				.font(TEXT_COMPACT_MONO)
				.color(t.muted_foreground),
		);
	let thumb_side = SPACING * 6.0;
	let thumb = el()
		.key("own-hue/thumb")
		.size(thumb_side, thumb_side)
		.radius(thumb_side / 2.0)
		.fill(tinted.primary)
		.border(3.0, Color::WHITE)
		.outline(1.0, 0.0, Color::BLACK.alpha(0.12))
		.shadow(1.0, 3.0, Color::BLACK.alpha(0.2))
		.a11y_hidden();
	let share = hue / LAST_HUE;
	let track = rainbow_track(t, el().w_full().h(SPACING * 4.0).radius(RADIUS_MD));
	let slider = row()
		.key("own-hue")
		.w_full()
		.h(thumb_side)
		.center_y()
		.role("slider")
		.label(say(bots::identity::colour::OWN))
		.range_value(f64::from(hue), 0.0, f64::from(LAST_HUE))
		.child(row().w_full().h(thumb_side).center_y().absolute(0.0, 0.0).child(track))
		.child(el().grow(share))
		.child(thumb)
		.child(el().grow(1.0 - share));
	col()
		.w_full()
		.gap(SPACING * 2.5)
		.padding(SPACING * 3.5)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.border)
		.child(
			row()
				.w_full()
				.center_y()
				.justify_between()
				.gap(SPACING * 3.0)
				.child(
					text(say(bots::identity::colour::OWN).to_owned())
						.font(TEXT_COMPACT_MEDIUM)
						.color(t.foreground),
				)
				.child(readout),
		)
		.child(ring(t, w.on(slider, SpaceEvent::PickColour(Some(hue)))))
		.child(helper(t, say(settings::space::colour::HINT), false))
}

pub fn colour_field<S: 'static>(t: &Tokens, hue: Option<f32>, w: Wiring<S>) -> El {
	let picked = match hue {
		None => Swatch::None,
		Some(hue) => preset_of(hue).map_or(Swatch::Own, Swatch::Preset),
	};
	let own = match picked {
		Swatch::Own => hue.unwrap_or(OWN_HUE_BY_DEFAULT),
		_ => OWN_HUE_BY_DEFAULT,
	};
	let options = std::iter::once(Swatch::None)
		.chain(SWATCH_ORDER.map(Swatch::Preset))
		.chain(std::iter::once(Swatch::Own));
	let mut field = col().w_full().gap(SPACING * 3.0).child(
		col()
			.w_full()
			.gap(SPACING * 2.0)
			.child(
				text(say(bots::identity::colour::LABEL).to_owned())
					.font(TEXT_XS_MEDIUM)
					.color(t.muted_foreground),
			)
			.child(
				row()
					.w_full()
					.gap(SPACING)
					.flex_wrap()
					.role("radiogroup")
					.label(say(bots::identity::colour::LABEL))
					.focus_group()
					.children(options.map(|option| swatch(t, option, own, option == picked, w))),
			),
	);
	if picked == Swatch::Own {
		field = field.child(own_hue_box(t, own, w));
	}
	field
}

pub fn space_fields<S: 'static>(
	t: &Tokens,
	value: SpaceValue,
	name: &TextEdit,
	w: Wiring<S>,
) -> El {
	let name_field = col()
		.w_full()
		.gap(SPACING * 1.5)
		.child(field_label(t, say(settings::space::name::LABEL)))
		.child(w.on_submit(field_box(
			t,
			name,
			say(settings::space::name::LABEL),
			say(settings::space::name::PLACEHOLDER),
			w.name,
		)));
	col().w_full().gap(SPACING * 5.0).child(name_field).child(colour_field(t, value.colour, w))
}

pub fn joined_fields(t: &Tokens, value: SpaceValue, host: &str) -> El {
	let unnamed = value.name.trim().is_empty();
	col()
		.w_full()
		.gap(SPACING * 5.0)
		.child(
			col()
				.w_full()
				.gap(SPACING * 1.5)
				.child(field_label(t, say(settings::space::name::LABEL)).role("term"))
				.child(
					text(value.shown_name().to_owned())
						.font(TEXT_SM)
						.color(if unnamed { t.muted_foreground } else { t.foreground })
						.wrap_anywhere()
						.role("definition"),
				),
		)
		.child(
			col()
				.w_full()
				.gap(SPACING * 1.5)
				.child(field_label(t, say(settings::space::host::LABEL)))
				.child(read_only_box(t, host, say(settings::space::host::LABEL)))
				.child(helper(t, say(settings::space::host::HINT), false)),
		)
}

fn transfer<S: 'static>(t: &Tokens, w: Wiring<S>) -> El {
	let button = |key: Key, event: SpaceEvent| {
		w.on(
			Button::new(say(key)).variant(ButtonVariant::Outline).size(ButtonSize::Sm).view(t),
			event,
		)
	};
	row()
		.gap(SPACING * 2.0)
		.flex_wrap()
		.child(button(settings::space::transfer::EXPORT, SpaceEvent::Export))
		.child(button(settings::space::transfer::IMPORT, SpaceEvent::Import))
}

fn danger_copy(danger: Danger) -> (&'static str, &'static str, &'static Icon) {
	match danger {
		Danger::Delete { deletable } => (
			say(settings::space::danger::DELETE),
			say(if deletable {
				settings::space::danger::DESCRIPTION
			} else {
				settings::space::danger::LAST
			}),
			&icons::BIN,
		),
		Danger::Leave => (
			say(common::spaces::leave::ACTION),
			say(common::spaces::leave::DESCRIPTION),
			&icons::BRACKET_ARROW_RIGHT,
		),
	}
}

pub fn danger_zone<S: 'static>(t: &Tokens, danger: Danger, w: Wiring<S>) -> El {
	let (action, description, glyph) = danger_copy(danger);
	let disabled = danger == Danger::Delete { deletable: false };
	let trigger = Button::new(action)
		.leading(glyph)
		.variant(ButtonVariant::Destructive)
		.size(ButtonSize::Sm)
		.disabled(disabled)
		.view(t);
	let trigger = if disabled { trigger } else { w.on(trigger, SpaceEvent::AskDanger) };
	col()
		.w_full()
		.gap(SPACING * 3.0)
		.padding(SPACING * 4.0)
		.radius(RADIUS_XL)
		.border(1.0, faded(t.destructive, 0.3))
		.child(
			col()
				.w_full()
				.gap(SPACING)
				.child(text(action.to_owned()).font(TEXT_SM_MEDIUM).color(t.destructive))
				.child(text(description.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap()),
		)
		.child(trigger)
}

struct Question<'a> {
	title: &'a str,
	description: &'a str,
	confirm: &'a str,
	confirm_event: SpaceEvent,
	cancel_event: SpaceEvent,
}

const QUESTION_WIDTH: f32 = SPACING * 88.0;

fn question<S: 'static>(t: &Tokens, asked: Question, w: Wiring<S>) -> El {
	let cancel = Button::new(say(common::confirm::CANCEL))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Sm)
		.view(t);
	let confirm =
		Button::new(asked.confirm).variant(ButtonVariant::Destructive).size(ButtonSize::Sm).view(t);
	let panel = col()
		.key(format!("question-{}", asked.title))
		.w(QUESTION_WIDTH)
		.padding(SPACING * 5.0)
		.gap(SPACING * 4.0)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.role("alertdialog")
		.label(asked.title)
		.description(asked.description)
		.transition(popup_motion(t))
		.child(
			col()
				.w_full()
				.gap(SPACING)
				.child(
					text(asked.title.to_owned())
						.font(TEXT_BASE_MEDIUM)
						.color(t.popover_foreground)
						.role("heading"),
				)
				.child(
					text(asked.description.to_owned())
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.wrap(),
				),
		)
		.child(
			row()
				.w_full()
				.gap(SPACING * 2.0)
				.justify_end()
				.child(w.on(cancel, asked.cancel_event.clone()))
				.child(w.on(confirm, asked.confirm_event)),
		);
	let emit = w.emit;
	let cancel_event = asked.cancel_event;
	el().absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.center()
		.modal(true, move |s: &mut S| emit(s, cancel_event.clone()))
		.child(elevated(t, panel))
}

fn danger_question<S: 'static>(t: &Tokens, danger: Danger, name: &str, w: Wiring<S>) -> El {
	let (action, _, _) = danger_copy(danger);
	let (title, description, event) = match danger {
		Danger::Delete { .. } => (
			fill(settings::space::danger::confirm::TITLE, &[("name", name)]),
			say(settings::space::danger::DESCRIPTION),
			SpaceEvent::Delete,
		),
		Danger::Leave => (
			fill(common::spaces::leave::TITLE, &[("name", name)]),
			say(common::spaces::leave::DESCRIPTION),
			SpaceEvent::Leave,
		),
	};
	question(
		t,
		Question {
			title: &title,
			description,
			confirm: action,
			confirm_event: event,
			cancel_event: SpaceEvent::CancelDanger,
		},
		w,
	)
}

fn remove_question<S: 'static>(t: &Tokens, space: &str, member: &Member, w: Wiring<S>) -> El {
	let name = member.first_name();
	let title = fill(settings::space::members::confirm::TITLE, &[("name", name), ("space", space)]);
	let description = fill(settings::space::members::confirm::DESCRIPTION, &[("name", name)]);
	question(
		t,
		Question {
			title: &title,
			description: &description,
			confirm: say(settings::space::members::REMOVE),
			confirm_event: SpaceEvent::ConfirmRemove,
			cancel_event: SpaceEvent::CancelRemove,
		},
		w,
	)
}

fn status_line(t: &Tokens, sharing: Sharing) -> Option<El> {
	let line = row().gap(SPACING * 1.5).center_y().pt(SPACING).role("status");
	match sharing {
		Sharing::Connecting => Some(
			line.child(
				icon(&icons::LOADER_CIRCLE, SPACING * 3.0).color(t.muted_foreground).a11y_hidden(),
			)
			.child(
				text(say(settings::space::hosting::CONNECTING).to_owned())
					.font(TEXT_XS_MEDIUM)
					.color(t.muted_foreground),
			),
		),
		Sharing::Online => Some(
			line.child(
				el().size(SPACING * 2.0, SPACING * 2.0).radius(SPACING).fill(t.bot_badge_done),
			)
			.child(
				text(say(settings::space::hosting::ONLINE).to_owned())
					.font(TEXT_XS_MEDIUM)
					.color(t.foreground),
			),
		),
		Sharing::Off | Sharing::SignedOut => None,
	}
}

pub fn share_card<S: 'static>(t: &Tokens, name: &str, sharing: Sharing, w: Wiring<S>) -> El {
	let title = fill(settings::space::hosting::LABEL, &[("name", name)]);
	let description = match sharing {
		Sharing::SignedOut => say(settings::space::hosting::SIGNED_OUT).to_owned(),
		_ => fill(settings::space::hosting::DESCRIPTION, &[("name", name)]),
	};
	let mut words = col().grow(1.0).shrink().child(
		col()
			.gap(SPACING)
			.child(text(title.clone()).font(TEXT_SM_MEDIUM).color(t.foreground).wrap_anywhere())
			.child(
				text(description.clone())
					.font(TextStyle { line_height: 18.0, ..TEXT_XS })
					.color(t.muted_foreground)
					.wrap(),
			),
	);
	if let Some(line) = status_line(t, sharing) {
		words = words.child(line);
	}
	let control = match sharing {
		Sharing::SignedOut => w.on(
			Button::new(say(settings::space::hosting::SIGN_IN))
				.trailing(&icons::EXTERNAL_LINK)
				.view(t)
				.description(description),
			SpaceEvent::SignIn,
		),
		_ => {
			let on = sharing != Sharing::Off;
			w.on(switch(t, &title, on, false, SwitchSize::Default), SpaceEvent::Share(!on))
		}
	};
	row()
		.w_full()
		.gap(SPACING * 4.0)
		.padding(SPACING * 3.5)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.border)
		.child(words)
		.child(control)
}

fn failure_text(failure: &Failure, space: &str, viewer: Option<&str>) -> String {
	use settings::space::members::failure::{invite, remove, withdraw};
	match *failure {
		Failure::Invite { reason, email } => {
			let (key, status, code) = match reason {
				InviteReason::Common(reason) => (
					match reason {
						Reason::NotHosting => invite::NOT_HOSTING,
						Reason::NotOwner => invite::NOT_OWNER,
						Reason::NeedsSignIn => invite::NEEDS_SIGN_IN,
						Reason::Unreachable => invite::UNREACHABLE,
						Reason::Generic => invite::GENERIC,
					},
					String::new(),
					"",
				),
				InviteReason::LimitReached => (invite::LIMIT_REACHED, String::new(), ""),
				InviteReason::Offline => (invite::OFFLINE, String::new(), ""),
				InviteReason::TimedOut => (invite::TIMED_OUT, String::new(), ""),
				InviteReason::Unsent => (invite::UNSENT, String::new(), ""),
				InviteReason::RelayStatus(Some(status)) => {
					(invite::RELAY_STATUS, status.to_string(), "")
				}
				InviteReason::RelayStatus(None) => (invite::UNREACHABLE, String::new(), ""),
				InviteReason::RelayConflict(Some(code)) => {
					(invite::RELAY_CONFLICT, String::new(), code)
				}
				InviteReason::RelayConflict(None) | InviteReason::UnreadableConflict => {
					(invite::UNREADABLE_CONFLICT, String::new(), "")
				}
				InviteReason::UnreadableList => (invite::UNREADABLE_LIST, String::new(), ""),
				InviteReason::ListNotReadBack => (invite::LIST_NOT_READ_BACK, String::new(), ""),
			};
			fill(key, &[("space", space), ("email", email), ("status", &status), ("code", code)])
		}
		Failure::Withdraw { reason, member } => {
			let key = match reason {
				WithdrawReason::Gone => withdraw::GONE,
				WithdrawReason::Joined => withdraw::JOINED,
				WithdrawReason::Common(Reason::NotHosting) => withdraw::NOT_HOSTING,
				WithdrawReason::Common(Reason::NotOwner) => withdraw::NOT_OWNER,
				WithdrawReason::Common(Reason::NeedsSignIn) => withdraw::NEEDS_SIGN_IN,
				WithdrawReason::Common(Reason::Unreachable) => withdraw::UNREACHABLE,
				WithdrawReason::Common(Reason::Generic) => withdraw::GENERIC,
			};
			fill(key, &[("space", space), ("email", member.email), ("name", member.shown())])
		}
		Failure::Remove { reason, member } => {
			let key = match reason {
				RemoveReason::Gone => remove::GONE,
				RemoveReason::Pending => remove::PENDING,
				RemoveReason::Host if viewer.is_some_and(|viewer| viewer != member.id) => {
					remove::HOSTED_BY
				}
				RemoveReason::Host => remove::HOST,
				RemoveReason::Common(Reason::NotHosting) => remove::NOT_HOSTING,
				RemoveReason::Common(Reason::NotOwner) => remove::NOT_OWNER,
				RemoveReason::Common(Reason::NeedsSignIn) => remove::NEEDS_SIGN_IN,
				RemoveReason::Common(Reason::Unreachable) => remove::UNREACHABLE,
				RemoveReason::Common(Reason::Generic) => remove::GENERIC,
			};
			fill(key, &[("space", space), ("email", member.email), ("name", member.shown())])
		}
	}
}

fn invite_field<S: 'static>(t: &Tokens, m: &Members, host: &str, w: Wiring<S>) -> El {
	let blocked = !m.hosted || m.blocked_by.is_some();
	let empty = m.email.text.trim().is_empty();
	let message = match (m.refusal, &m.failure) {
		(Some(refusal), _) => Some(match refusal {
			Refusal::Invited => fill(
				settings::space::members::invite::refusal::INVITED,
				&[("email", &m.email.text)],
			),
			Refusal::OwnAddress => say(settings::space::members::invite::refusal::SELF).to_owned(),
			Refusal::Malformed => {
				say(settings::space::members::invite::refusal::MALFORMED).to_owned()
			}
		}),
		(None, Some(failure @ Failure::Invite { .. })) => {
			Some(failure_text(failure, m.space, None))
		}
		_ => None,
	};
	let hint = match m.blocked_by {
		Some(Blocker::HostOffline) => fill(
			settings::space::members::invite::HOST_OFFLINE,
			&[("name", m.space), ("host", host)],
		),
		Some(Blocker::SignedOut) => say(settings::space::members::invite::SIGNED_OUT).to_owned(),
		None if m.hosted => say(settings::space::members::invite::HINT).to_owned(),
		None => fill(settings::space::members::invite::NOT_SHARED, &[("name", m.space)]),
	};
	let label = say(settings::space::members::invite::LABEL);
	let input =
		field_box(t, m.email, label, say(settings::space::members::invite::PLACEHOLDER), w.email)
			.invalid(message.is_some())
			.description(message.clone().unwrap_or_else(|| hint.clone()));
	let input = if blocked { input.disabled(true).opacity(DISABLED_OPACITY) } else { input };
	let invite = Button::new(say(settings::space::members::invite::ACTION))
		.disabled(blocked || empty)
		.view(t);
	let invite = if blocked || empty { invite } else { w.on(invite, SpaceEvent::Invite) };
	let label = field_label(t, label);
	col()
		.w_full()
		.gap(SPACING * 1.5)
		.child(if blocked { label.opacity(DISABLED_OPACITY) } else { label })
		.child(
			row()
				.w_full()
				.gap(SPACING * 1.5)
				.items_start()
				.child(col().grow(1.0).shrink().child(input))
				.child(invite),
		)
		.child(match message {
			Some(message) => helper(t, &message, true),
			None => helper(t, &hint, false),
		})
}

const MEMBER_AVATAR: f32 = SPACING * 7.0;

fn member_avatar(t: &Tokens, member: &Member) -> El {
	let circle = el().size(MEMBER_AVATAR, MEMBER_AVATAR).radius(MEMBER_AVATAR / 2.0).a11y_hidden();
	if member.is_invitation() {
		return circle
			.border(1.0, t.input)
			.border_dash(3.0, 2.0)
			.center()
			.child(icon(&icons::MAIL, SPACING * 3.5).color(t.muted_foreground));
	}
	let initial: String = member.shown().chars().take(1).flat_map(char::to_uppercase).collect();
	circle.fill(t.muted).border(1.0, t.border).center().child(
		text(initial).font(tight(TextStyle { weight: 600.0, ..TEXT_XS })).color(t.foreground),
	)
}

fn settings_tag(t: &Tokens, label: &str, ink: Color) -> El {
	row()
		.px(SPACING * 2.0)
		.py(SPACING * 0.5)
		.radius(RADIUS_2XL)
		.fill(t.muted)
		.child(text(label.to_owned()).font(TEXT_XS_MEDIUM).color(ink))
}

struct RowState {
	failure: String,
	viewer: bool,
	disabled: bool,
	inviting_again: bool,
}

fn member_row<S: 'static>(t: &Tokens, member: &Member, state: RowState, w: Wiring<S>) -> El {
	let name = member.shown();
	let subline = match member.status {
		MemberStatus::Host | MemberStatus::Joined => Some(member.email.to_owned()),
		MemberStatus::NeedsInvitation => {
			Some(say(settings::space::members::NEEDS_INVITATION).to_owned())
		}
		MemberStatus::Pending { expires_in_days } => expires_in_days.map(|days| {
			let key = if days == 1 {
				settings::space::members::PENDING_ONE
			} else {
				settings::space::members::PENDING_OTHER
			};
			fill(key, &[("count", &days.to_string())])
		}),
		MemberStatus::Expired { sent } => {
			sent.map(|date| fill(settings::space::members::EXPIRED, &[("date", date)]))
		}
	};
	let shown_name = if state.viewer {
		fill(settings::space::members::YOU, &[("name", name)])
	} else {
		name.to_owned()
	};
	let mut words = col()
		.grow(1.0)
		.shrink()
		.min_w(0.0)
		.child(text(shown_name).font(TEXT_SM).color(t.foreground).max_lines(1).truncate());
	if let Some(subline) = subline {
		words = words
			.child(text(subline).font(TEXT_XS).color(t.muted_foreground).max_lines(1).truncate());
	}
	if !state.failure.is_empty() {
		words = words.child(helper(t, &state.failure, true));
	}
	let mut line = row()
		.key(format!("member-{}", member.id))
		.w_full()
		.gap(SPACING * 2.5)
		.py(SPACING * 2.0)
		.pl(SPACING * 3.0)
		.pr(SPACING * 2.0)
		.center_y()
		.role("listitem")
		.label(name)
		.child(member_avatar(t, member))
		.child(words);
	match member.status {
		MemberStatus::Host => {
			line = line.child(settings_tag(
				t,
				say(settings::space::members::status::HOST),
				t.foreground,
			));
		}
		MemberStatus::Expired { .. } => {
			line = line.child(settings_tag(
				t,
				say(settings::space::members::status::EXPIRED),
				t.muted_foreground,
			));
		}
		_ => {}
	}
	let again_label =
		fill(settings::space::members::INVITE_AGAIN_LABEL, &[("email", member.email)]);
	if member.status == MemberStatus::NeedsInvitation && !state.viewer {
		let disabled = state.disabled || state.inviting_again;
		let again = Button::new(say(settings::space::members::INVITE_MEMBER_AGAIN))
			.variant(ButtonVariant::Outline)
			.size(ButtonSize::Sm)
			.disabled(disabled)
			.view(t)
			.description(again_label.clone());
		line = line.child(if disabled {
			again
		} else {
			w.on(again, SpaceEvent::Resend(member.id.to_owned()))
		});
	}
	let action = match member.status {
		_ if state.viewer => None,
		MemberStatus::Pending { .. } => Some((
			&icons::CLOSE,
			fill(settings::space::members::WITHDRAW_LABEL, &[("email", member.email)]),
			SpaceEvent::Withdraw(member.id.to_owned()),
		)),
		MemberStatus::Expired { .. } => {
			Some((&icons::REFRESH_CW, again_label, SpaceEvent::Resend(member.id.to_owned())))
		}
		MemberStatus::Joined | MemberStatus::NeedsInvitation => Some((
			&icons::BIN,
			fill(settings::space::members::REMOVE_LABEL, &[("name", name)]),
			SpaceEvent::Remove(member.id.to_owned()),
		)),
		MemberStatus::Host => None,
	};
	line.child(match action {
		Some((glyph, label, event)) => {
			let button = Button::icon(glyph, &label)
				.variant(ButtonVariant::Ghost)
				.size(ButtonSize::IconSm)
				.disabled(state.disabled)
				.view(t);
			if state.disabled { button } else { w.on(button, event) }
		}
		None => el().size(SPACING * 7.0, SPACING * 7.0).a11y_hidden(),
	})
}

fn members_list(t: &Tokens, label: &str, rows: Vec<El>) -> El {
	let count = rows.len();
	let rows = rows.into_iter().enumerate().map(|(at, line)| {
		if at + 1 < count {
			col().w_full().child(line).child(el().w_full().h(1.0).fill(t.border))
		} else {
			line
		}
	});
	col().w_full().gap(SPACING * 1.5).child(field_label(t, label)).child(
		col()
			.w_full()
			.radius(RADIUS_XL)
			.border(1.0, t.border)
			.role("list")
			.label(label)
			.children(rows),
	)
}

const SKELETON_ROWS: usize = 12;
const SKELETON_TITLE: [f32; 3] = [SPACING * 21.0, SPACING * 18.0, SPACING * 24.0];
const SKELETON_SUB: [f32; 3] = [SPACING * 30.0, SPACING * 33.0, SPACING * 27.5];

fn skeleton_row(t: &Tokens, at: usize) -> El {
	let bar = |w: f32, h: f32, faint: bool| {
		let bar = skeleton(t).size(w, h).radius(h / 2.0);
		if faint { bar.opacity(0.6) } else { bar }
	};
	row()
		.w_full()
		.gap(SPACING * 2.5)
		.py(SPACING * 2.0)
		.pl(SPACING * 3.0)
		.pr(SPACING * 2.0)
		.center_y()
		.child(el().size(MEMBER_AVATAR, MEMBER_AVATAR).radius(MEMBER_AVATAR / 2.0).fill(t.border))
		.child(
			col()
				.grow(1.0)
				.child(row().h(SPACING * 5.0).center_y().child(bar(
					SKELETON_TITLE[at % 3],
					10.0,
					false,
				)))
				.child(row().h(SPACING * 4.0).center_y().child(bar(
					SKELETON_SUB[at % 3],
					8.0,
					true,
				))),
		)
		.child(el().size(SPACING * 7.0, SPACING * 7.0))
}

fn members_skeleton(t: &Tokens) -> El {
	col()
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.gap(SPACING * 1.5)
		.child(field_label(t, say(settings::space::members::LIST)))
		.child(
			col()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.radius(RADIUS_XL)
				.border(1.0, t.border)
				.clip_rounded(RADIUS_XL)
				.role("progressbar")
				.label(say(settings::space::members::LIST))
				.children((0..SKELETON_ROWS).map(|at| {
					col()
						.w_full()
						.child(skeleton_row(t, at))
						.child(el().w_full().h(1.0).fill(t.border))
				})),
		)
}

pub fn members_panel<S: 'static>(t: &Tokens, m: &Members, w: Wiring<S>) -> El {
	let host = m
		.members
		.iter()
		.find(|member| member.status == MemberStatus::Host)
		.map_or("", Member::first_name);
	let row_failure = match m.failure {
		Some(Failure::Withdraw { member, .. } | Failure::Remove { member, .. }) => Some(member.id),
		_ => None,
	};
	let rows = |shown: Vec<&Member>| -> Vec<El> {
		shown
			.into_iter()
			.map(|member| {
				let failure = match (&m.failure, row_failure) {
					(Some(failure), Some(id)) if id == member.id => {
						failure_text(failure, m.space, m.viewer)
					}
					_ => String::new(),
				};
				member_row(
					t,
					member,
					RowState {
						failure,
						viewer: m.viewer == Some(member.id),
						disabled: m.blocked_by == Some(Blocker::HostOffline),
						inviting_again: m.inviting_again == Some(member.id),
					},
					w,
				)
			})
			.collect()
	};
	let mut panel =
		col().w_full().grow(1.0).min_h(0.0).gap(SPACING * 6.0).child(invite_field(t, m, host, w));
	if m.loading {
		return panel.child(members_skeleton(t));
	}
	let invitations: Vec<&Member> =
		m.members.iter().filter(|member| member.is_invitation()).collect();
	let people: Vec<&Member> = m.members.iter().filter(|member| !member.is_invitation()).collect();
	if !invitations.is_empty() {
		panel = panel.child(members_list(
			t,
			say(settings::space::members::INVITATIONS),
			rows(invitations),
		));
	}
	panel.child(members_list(t, say(settings::space::members::LIST), rows(people)))
}

fn counts_of(agent: &Agent) -> Option<String> {
	use settings::space::agents;
	let counted = |count: u32, zero: Key, one: Key, other: Key| {
		let key = match count {
			0 => zero,
			1 => one,
			_ => other,
		};
		fill(key, &[("count", &count.to_string())])
	};
	let skills = agent
		.skills
		.map(|count| counted(count, agents::SKILLS_ZERO, agents::SKILLS_ONE, agents::SKILLS_OTHER));
	let applications = agent.applications.map(|count| {
		counted(
			count,
			agents::APPLICATIONS_ZERO,
			agents::APPLICATIONS_ONE,
			agents::APPLICATIONS_OTHER,
		)
	});
	match (skills, applications) {
		(Some(skills), Some(applications)) => {
			Some(fill(agents::COUNTS, &[("skills", &skills), ("applications", &applications)]))
		}
		(skills, applications) => skills.or(applications),
	}
}

fn mode_label(mode: Mode) -> &'static str {
	say(match mode {
		Mode::Ask => bots::approvals::mode::option::default::LABEL,
		Mode::AcceptEdits => bots::approvals::mode::option::accept_edits::LABEL,
		Mode::Plan => bots::approvals::mode::option::plan::LABEL,
	})
}

const AGENT_AVATAR: f32 = SPACING * 9.0;
const AGENT_CARD_MIN: f32 = SPACING * 78.0;

fn agent_card<S: 'static>(t: &Tokens, agent: &Agent, w: Wiring<S>) -> El {
	let mut identity = row().grow(1.0).shrink().gap(SPACING * 2.0).center_y().child(
		text(agent.name.to_owned())
			.font(TEXT_SM_MEDIUM)
			.color(t.foreground)
			.max_lines(1)
			.truncate(),
	);
	if let Some(title) = agent.title {
		identity = identity.child(
			row()
				.shrink()
				.px(SPACING * 2.0)
				.py(SPACING * 0.5)
				.radius(RADIUS_2XL)
				.fill(t.muted)
				.child(
					text(title.to_owned())
						.font(TEXT_XS_MEDIUM)
						.color(t.muted_foreground)
						.max_lines(1)
						.truncate(),
				),
		);
	}
	let mut foot = row().w_full().gap(SPACING * 3.0).pt(SPACING * 3.0).center_y();
	if let Some(counts) = counts_of(agent) {
		foot = foot
			.child(text(counts).font(TEXT_XS).color(t.muted_foreground).max_lines(1).truncate());
	}
	foot = foot
		.child(row().grow(1.0))
		.child(text(mode_label(agent.mode).to_owned()).font(TEXT_XS).color(t.muted_foreground));
	let card = col()
		.key(format!("agent-{}", agent.id))
		.w_full()
		.gap(SPACING * 3.5)
		.padding(SPACING * 4.0)
		.radius(RADIUS_XL)
		.border(1.0, t.border)
		.fill(faded(t.muted, 0.4))
		.hover(t.muted)
		.role("button")
		.label(agent.name)
		.child(
			row()
				.w_full()
				.gap(SPACING * 3.0)
				.center_y()
				.child(Face::still(agent.name, agent.hue).draw(AGENT_AVATAR, t))
				.child(identity),
		)
		.child(
			text(agent.instructions.to_owned())
				.font(TextStyle { line_height: 20.0, ..TEXT_COMPACT })
				.color(faded(t.foreground, 0.85))
				.max_lines(2)
				.h(SPACING * 10.0),
		)
		.child(col().w_full().child(el().w_full().h(1.0).fill(t.border)).child(foot));
	ring(t, w.on(instant(card), SpaceEvent::SelectAgent(agent.id.to_owned())))
}

pub fn agents_section<S: 'static>(
	t: &Tokens,
	space: &str,
	agents: &[Agent],
	width: f32,
	w: Wiring<S>,
) -> El {
	let create = Button::new(say(settings::space::agents::CREATE))
		.leading(&icons::PLUS)
		.variant(ButtonVariant::Outline)
		.view(t);
	let head = row()
		.w_full()
		.gap(SPACING * 4.0)
		.flex_wrap()
		.items_end()
		.justify_between()
		.child(
			col()
				.shrink()
				.gap(SPACING)
				.child(
					text(say(settings::space::agents::TITLE).to_owned())
						.font(TEXT_SM_MEDIUM)
						.color(t.muted_foreground)
						.role("heading"),
				)
				.child(
					text(fill(settings::space::agents::CAPTION, &[("space", space)]))
						.font(TEXT_COMPACT)
						.color(t.muted_foreground)
						.wrap(),
				),
		)
		.child(w.on(create, SpaceEvent::CreateAgent));
	let body =
		if agents.is_empty() {
			text(say(settings::space::agents::EMPTY).to_owned())
				.font(TextStyle { line_height: 20.0, ..TEXT_COMPACT })
				.color(t.muted_foreground)
		} else {
			let gap = SPACING * 4.0;
			let columns = (((width + gap) / (AGENT_CARD_MIN + gap)).floor() as usize).max(1);
			let card_width = (width - gap * (columns - 1) as f32) / columns as f32;
			row().w_full().gaps(gap, gap).flex_wrap().role("list").children(
				agents.iter().map(|agent| col().w(card_width).child(agent_card(t, agent, w))),
			)
		};
	col().w_full().gap(SPACING * 8.0).child(head).child(body)
}

const DIALOG_SIZE: (f32, f32) = (832.0, 544.0);
const DIALOG_TITLE: TextStyle = TextStyle { line_height: 20.0, ..TEXT_BASE_SEMIBOLD };
const DIALOG_RAIL: f32 = SPACING * 52.0;
const RAIL_ITEM_RADIUS: f32 = RADIUS_XL;

fn dialog_entries(settings: &SpaceSettings) -> Vec<Entry> {
	let mut entries = vec![Entry::Space];
	if settings.members.is_some() {
		entries.push(Entry::Members);
	}
	if settings.agents.is_some() {
		entries.push(Entry::Agents);
	}
	entries.extend([
		Entry::Secrets,
		Entry::Skills,
		Entry::Applications,
		Entry::History,
		Entry::Danger,
	]);
	entries
}

fn rail_item<S: 'static>(t: &Tokens, entry: Entry, selected: bool, w: Wiring<S>) -> El {
	let danger = entry == Entry::Danger;
	let (rest_ink, picked_fill, picked_ink) = if danger {
		(t.destructive, t.destructive_tint, t.destructive_tint_foreground)
	} else {
		(t.muted_foreground, t.muted, t.foreground)
	};
	let label = entry.label(false);
	let ink = if selected { picked_ink } else { rest_ink };
	let item = row()
		.key(format!("rail-{label}"))
		.w_full()
		.px(SPACING * 2.5)
		.py(SPACING * 2.0)
		.gap(SPACING * 2.5)
		.radius(RAIL_ITEM_RADIUS)
		.center_y()
		.role("tab")
		.label(label)
		.checked(selected)
		.focus_selected(selected)
		.child(icon(entry.glyph(selected), SPACING * 4.0).color(ink))
		.child(
			text(label.to_owned()).font(if selected { TEXT_SM_MEDIUM } else { TEXT_SM }).color(ink),
		);
	let item = if selected {
		item.fill(picked_fill)
	} else {
		item.hover(picked_fill).group_color(picked_ink)
	};
	ring(t, w.on(instant(item.hover_group()), SpaceEvent::Select(entry)))
}

fn entry_panel<S: 'static>(t: &Tokens, settings: &SpaceSettings, width: f32, w: Wiring<S>) -> El {
	let name = settings.value.shown_name();
	match settings.entry {
		Entry::Space => match settings.joined_host {
			Some(host) => joined_fields(t, settings.value, host),
			None => {
				let fields = space_fields(t, settings.value, settings.name, w);
				if settings.transfer {
					col().w_full().gap(SPACING * 4.0).child(fields).child(transfer(t, w))
				} else {
					fields
				}
			}
		},
		Entry::Members => {
			let mut panel = col().w_full().grow(1.0).min_h(0.0).gap(SPACING * 6.0);
			if let Some(sharing) = settings.sharing {
				panel = panel.child(share_card(t, name, sharing, w));
			}
			match &settings.members {
				Some(members) => panel.child(members_panel(t, members, w)),
				None => panel,
			}
		}
		Entry::Agents => agents_section(t, name, settings.agents.unwrap_or_default(), width, w),
		Entry::Danger => danger_zone(t, settings.danger, w),
		other => not_drawn(t, other.label(false), other.drawn_elsewhere().unwrap_or_default()),
	}
}

fn layers<S: 'static>(t: &Tokens, settings: &SpaceSettings, w: Wiring<S>) -> Vec<El> {
	let mut layers = Vec::new();
	if settings.asking {
		layers.push(danger_question(t, settings.danger, settings.value.shown_name(), w));
	}
	if let Some(Members { removing: Some(member), space, .. }) = &settings.members {
		layers.push(remove_question(t, space, member, w));
	}
	if !settings.notices.is_empty() {
		layers.push(notices(t, &settings.notices));
	}
	layers
}

const NOTICE_INSET: f32 = SPACING * 4.0;

fn notices(t: &Tokens, shown: &[Notice]) -> El {
	col().gap(SPACING * 2.0).pin(None, None, Some(NOTICE_INSET), Some(NOTICE_INSET)).children(
		shown.iter().map(|notice| {
			toast(
				t,
				Toast {
					kind: if notice.failed { ToastType::Error } else { ToastType::Success },
					title: &notice.title,
					description: &notice.description,
					action: None,
				},
			)
			.role(if notice.failed { "alert" } else { "status" })
		}),
	)
}

pub fn space_settings_dialog<S: 'static>(t: &Tokens, settings: &SpaceSettings, w: Wiring<S>) -> El {
	let t = &t.in_space(settings.value.colour);
	let name = settings.value.shown_name();
	let breadcrumb = say(settings::breadcrumb::TITLE);
	let close = Button::icon(&icons::CLOSE, say(common::dialog::CLOSE))
		.variant(ButtonVariant::Ghost)
		.size(ButtonSize::IconSm)
		.view(t);
	let header = row()
		.w_full()
		.gap(SPACING * 2.5)
		.py(SPACING * 4.0)
		.pl(SPACING * 4.0)
		.pr(SPACING * 14.0)
		.center_y()
		.child(space_tint(t, settings.value.colour, SPACING * 5.0))
		.child(
			row()
				.shrink()
				.min_w(0.0)
				.gap(SPACING * 1.5)
				.center_y()
				.role("heading")
				.child(
					text(name.to_owned())
						.font(DIALOG_TITLE)
						.color(t.popover_foreground)
						.max_lines(1)
						.truncate(),
				)
				.child(icon(&icons::NEXT, SPACING * 3.5).color(t.muted_foreground))
				.child(text(breadcrumb.to_owned()).font(DIALOG_TITLE).color(t.muted_foreground)),
		);
	let entries = dialog_entries(settings);
	let rail = col()
		.w(DIALOG_RAIL)
		.h_full()
		.padding(SPACING * 2.0)
		.gap(SPACING)
		.role("tablist")
		.focus_group()
		.children(entries.iter().flat_map(|&entry| {
			let separator = (entry == Entry::Danger).then(|| {
				el().h(1.0).self_stretch().mx(SPACING).my(SPACING).fill(t.border).a11y_hidden()
			});
			separator.into_iter().chain(std::iter::once(rail_item(
				t,
				entry,
				entry == settings.entry,
				w,
			)))
		}));
	let panel_width = DIALOG_SIZE.0 - DIALOG_RAIL - 1.0 - SPACING * 10.0;
	let panel = col()
		.grow(1.0)
		.shrink()
		.h_full()
		.min_h(0.0)
		.padding(SPACING * 5.0)
		.gap(SPACING * 4.0)
		.role("tabpanel")
		.label(settings.entry.label(false))
		.child(entry_panel(t, settings, panel_width, w));
	let surface = col()
		.key(format!("space-settings-{name}"))
		.size(DIALOG_SIZE.0, DIALOG_SIZE.1)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.clip_rounded(RADIUS_2XL)
		.role("dialog")
		.label(format!("{name} {breadcrumb}"))
		.transition(popup_motion(t))
		.child(w.on(close, SpaceEvent::Close).pin(
			None,
			Some(SPACING * 4.0),
			Some(SPACING * 4.0),
			None,
		))
		.child(header)
		.child(el().w_full().h(1.0).fill(t.border))
		.child(
			row()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.child(rail)
				.child(el().w(1.0).h_full().fill(t.border))
				.child(panel),
		);
	let dialog = el()
		.absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.center()
		.modal(true, move |s: &mut S| (w.emit)(s, SpaceEvent::Close))
		.child(elevated(t, surface));
	let mut all = vec![scrim(t), dialog];
	all.extend(layers(t, settings, w));
	rune_kit::root(el().w_full().h_full().fill(t.background), all)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Presence {
	Local,
	Shared,
	Up,
	Down,
	Connecting,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Standing<'a> {
	Yours { shared: bool },
	Joined { host_name: &'a str, connected: bool, connecting: bool },
	Invitation { host_email: &'a str, expires: &'a str },
}

impl Standing<'_> {
	fn presence(self) -> Option<Presence> {
		match self {
			Standing::Yours { shared: false } => Some(Presence::Local),
			Standing::Yours { shared: true } => Some(Presence::Shared),
			Standing::Joined { connecting: true, .. } => Some(Presence::Connecting),
			Standing::Joined { connected: true, .. } => Some(Presence::Up),
			Standing::Joined { connected: false, .. } => Some(Presence::Down),
			Standing::Invitation { .. } => None,
		}
	}

	fn subtitle(self) -> String {
		match self {
			Standing::Yours { shared: false } => say(settings::space::standing::YOURS).to_owned(),
			Standing::Yours { shared: true } => {
				say(settings::space::standing::YOURS_SHARED).to_owned()
			}
			Standing::Joined { host_name, connected: true, .. } => {
				fill(settings::space::standing::JOINED, &[("host", host_name)])
			}
			Standing::Joined { host_name, .. } => {
				fill(settings::space::standing::JOINED_NOT_CONNECTED, &[("host", host_name)])
			}
			Standing::Invitation { host_email, expires } => fill(
				settings::space::standing::INVITATION,
				&[("email", host_email), ("date", expires)],
			),
		}
	}
}

const SPACE_AVATAR_ROUNDING: f32 = 0.3;
const SPACE_BADGE_SHARE: f32 = 0.4;

pub fn space_avatar(t: &Tokens, value: SpaceValue, standing: Standing, side: f32) -> El {
	let radius = side * SPACE_AVATAR_ROUNDING;
	let tile = el().size(side, side).radius(radius).role("img").label(value.shown_name());
	let initial: String = value.shown_name().chars().take(1).flat_map(char::to_uppercase).collect();
	let Some(presence) = standing.presence() else {
		let outline =
			value.colour.map_or(t.muted_foreground, |hue| tone(hue, t.dark, Role::Accent));
		return tile.border(1.5, outline).border_dash(4.0, 3.0);
	};
	let (ground, ink) = crate::tokens::conversation_icon(value.colour, t.dark);
	let face =
		tile.fill(ground).border(1.0, t.border).center().child(
			text(initial).font(tight(TextStyle::new((side * 0.42).round(), 600.0))).color(ink),
		);
	let badge = (side * SPACE_BADGE_SHARE).round();
	let dot = el()
		.size(badge, badge)
		.radius(badge / 2.0)
		.outline(2.0, 0.0, t.card)
		.center()
		.a11y_hidden()
		.absolute(side - badge * 0.75, side - badge * 0.75);
	let dot = match presence {
		Presence::Local => {
			dot.fill(t.muted_foreground).child(icon(&icons::LAPTOP, badge * 0.6).color(t.card))
		}
		Presence::Shared | Presence::Up => dot.fill(t.presence_online),
		Presence::Down => dot.fill(t.presence_offline),
		Presence::Connecting => {
			dot.fill(t.card).border(1.5, t.presence_online).border_dash(2.0, 2.0)
		}
	};
	face.child(dot)
}

fn not_shared_card<S: 'static>(t: &Tokens, name: &str, w: Wiring<S>) -> El {
	let share = Button::new(say(settings::space::not_shared::SHARE))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Sm)
		.view(t);
	col()
		.w_full()
		.gap(SPACING * 3.0)
		.padding(SPACING * 4.0)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.shell_divider)
		.fill(t.card_raised)
		.role("region")
		.label(say(settings::space::not_shared::TITLE))
		.child(
			col()
				.w_full()
				.gap(SPACING * 1.5)
				.child(
					text(say(settings::space::not_shared::TITLE).to_owned())
						.font(TEXT_SM_MEDIUM)
						.color(t.foreground)
						.role("heading"),
				)
				.child(
					text(fill(settings::space::not_shared::DESCRIPTION, &[("name", name)]))
						.font(TEXT_COMPACT)
						.color(t.soft_foreground)
						.wrap_anywhere(),
				),
		)
		.child(row().child(w.on(share, SpaceEvent::Share(true))))
}

fn inverse_button<S: 'static>(
	t: &Tokens,
	label: &str,
	shortcut: Option<String>,
	event: SpaceEvent,
	w: Wiring<S>,
) -> El {
	let mut button = row()
		.key(format!("button-{label}"))
		.h(SPACING * 8.0)
		.px(SPACING * 3.5)
		.gap(SPACING * 2.0)
		.radius(9.0)
		.center()
		.fill(t.foreground)
		.hover(faded(t.foreground, 0.85))
		.role("button")
		.label(match &shortcut {
			Some(shortcut) => format!("{label} {shortcut}"),
			None => label.to_owned(),
		})
		.child(text(label.to_owned()).font(tight(TEXT_COMPACT_MEDIUM)).color(t.background));
	if let Some(shortcut) = shortcut {
		button = button.child(text(shortcut).font(tight(TEXT_XS)).color(crate::tokens::mix(
			t.background,
			t.foreground,
			0.6,
		)));
	}
	ring(t, w.on(instant(button), event))
}

pub struct SpacePage<'a> {
	pub value: SpaceValue<'a>,
	pub name: &'a TextEdit,
	pub standing: Standing<'a>,
	pub rank: Option<u32>,
	pub transfer: bool,
}

pub fn focused_space_page<S: 'static>(t: &Tokens, page: &SpacePage, w: Wiring<S>) -> El {
	let name = page.value.shown_name();
	let mut header = row()
		.w_full()
		.gap(SPACING * 3.5)
		.center_y()
		.child(space_avatar(t, page.value, page.standing, SPACING * 12.0))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.gap(SPACING * 0.5)
				.child(
					text(name.to_owned())
						.font(TextStyle {
							tracking: -0.2,
							line_height: 26.0,
							..TextStyle::new(20.0, 600.0)
						})
						.color(t.foreground)
						.wrap_anywhere()
						.role("heading"),
				)
				.child(
					text(page.standing.subtitle())
						.font(TextStyle { line_height: 18.0, ..TEXT_COMPACT })
						.color(t.muted_foreground)
						.wrap_anywhere(),
				),
		);
	header = match page.standing {
		Standing::Invitation { .. } => header.child(inverse_button(
			t,
			say(bots::spaces::invitations::ACCEPT),
			None,
			SpaceEvent::Accept,
			w,
		)),
		_ => match page.rank {
			Some(rank) => header.child(inverse_button(
				t,
				say(settings::space::OPEN),
				Some(fill(bots::spaces::SHORTCUT, &[("rank", &rank.to_string())])),
				SpaceEvent::Open,
				w,
			)),
			None => header,
		},
	};
	let mut column = col().w_full().gap(SPACING * 6.0).child(header);
	let name_shown =
		matches!(page.standing, Standing::Yours { .. } | Standing::Joined { connected: true, .. });
	if name_shown {
		column = column.child(space_fields(t, page.value, page.name, w));
	}
	if page.standing == (Standing::Yours { shared: false }) {
		column = column.child(not_shared_card(t, name, w));
	}
	if page.transfer && matches!(page.standing, Standing::Yours { .. }) {
		column = column.child(transfer(t, w));
	}
	column
}

pub struct SpaceScreen<'a> {
	pub settings: SpaceSettings<'a>,
	pub standing: Standing<'a>,
	pub rank: Option<u32>,
	pub menu_width: f32,
	pub session_unavailable: bool,
	pub leaving: bool,
}

pub const MENU_WIDTH: f32 = 304.0;
const TITLE_BAR: f32 = 41.0;
const WINDOW_INSET: f32 = 9.0;
const CONTENT_HEADER: f32 = 47.0;
const MENU_ROW: f32 = SPACING * 9.0;

struct MenuRow<'a> {
	glyph: &'static Icon,
	label: &'a str,
	trailing: Option<String>,
	tone: MenuTone,
	disabled: bool,
	event: SpaceEvent,
}

fn menu_row<S: 'static>(t: &Tokens, item: MenuRow, w: Wiring<S>) -> El {
	let MenuRow { glyph, label, trailing, tone, disabled, event } = item;
	let selected = tone == MenuTone::Selected;
	let (ink, fill_on, ink_on) = match tone {
		MenuTone::Danger | MenuTone::DangerSelected => {
			(t.destructive, t.destructive_tint, t.destructive_tint_foreground)
		}
		MenuTone::Quiet => (t.soft_foreground, t.muted, t.foreground),
		MenuTone::Rest | MenuTone::Selected => (t.muted_foreground, t.muted, t.foreground),
	};
	let picked = selected || tone == MenuTone::DangerSelected;
	let ink = if picked { ink_on } else { ink };
	let glyph_ink = if tone == MenuTone::Quiet { t.muted_foreground } else { ink };
	let mut item = row()
		.key(format!("menu-{label}"))
		.w_full()
		.h(MENU_ROW)
		.px(SPACING * 2.0)
		.gap(SPACING * 2.5)
		.radius(RADIUS_CONTROL)
		.center_y()
		.role("button")
		.label(match &trailing {
			Some(count) => format!("{label} {count}"),
			None => label.to_owned(),
		})
		.child(icon(icons::stroked(glyph, 1.8), SPACING * 4.0).color(glyph_ink))
		.child(
			text(label.to_owned())
				.font(if picked && tone != MenuTone::DangerSelected {
					TEXT_SM_MEDIUM
				} else {
					TEXT_SM
				})
				.color(ink)
				.grow(1.0)
				.max_lines(1)
				.truncate(),
		);
	if let Some(count) = trailing {
		item = item.child(
			row()
				.h(SPACING * 5.5)
				.min_w(SPACING * 5.5)
				.px(SPACING * 1.5)
				.radius(SPACING * 2.75)
				.border(1.0, t.border)
				.fill(t.card)
				.center()
				.child(text(count).font(tight(TEXT_XS)).color(t.muted_foreground)),
		);
	}
	item = if picked {
		item.fill(fill_on).checked(true)
	} else {
		item.hover(fill_on).group_color(ink_on)
	};
	if disabled {
		return item.disabled(true).opacity(0.4);
	}
	ring(t, w.on(instant(item.hover_group()), event))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MenuTone {
	Rest,
	Selected,
	Danger,
	DangerSelected,
	Quiet,
}

fn settings_menu<S: 'static>(t: &Tokens, screen: &SpaceScreen, w: Wiring<S>) -> El {
	let settings = &screen.settings;
	let invitation = matches!(screen.standing, Standing::Invitation { .. });
	let unreachable = matches!(screen.standing, Standing::Joined { connected: false, .. });
	let session_bound = |entry: Entry| {
		matches!(entry, Entry::Secrets | Entry::Skills | Entry::Applications | Entry::History)
	};
	let entries: Vec<Entry> = if invitation {
		vec![Entry::Space]
	} else {
		dialog_entries(settings).into_iter().filter(|entry| *entry != Entry::Danger).collect()
	};
	let back = row()
		.key("menu-back")
		.h(SPACING * 8.0)
		.px(SPACING * 2.0)
		.gap(SPACING * 2.5)
		.radius(RADIUS_CONTROL)
		.center_y()
		.role("button")
		.label(say(settings::screen::BACK_TO_SETTINGS))
		.hover(t.muted)
		.child(icon(&icons::PREVIOUS, SPACING * 4.0).color(t.muted_foreground))
		.child(
			text(say(settings::screen::BACK_TO_SETTINGS).to_owned())
				.font(TextStyle { line_height: 18.0, ..TEXT_COMPACT_MEDIUM })
				.color(t.muted_foreground),
		);
	let identity = row()
		.w_full()
		.px(SPACING * 2.0)
		.gap(SPACING * 2.5)
		.center_y()
		.child(space_avatar(t, settings.value, screen.standing, SPACING * 9.0))
		.child(
			col()
				.shrink()
				.min_w(0.0)
				.child(
					text(settings.value.shown_name().to_owned())
						.font(TEXT_SM_SEMIBOLD)
						.color(t.foreground)
						.max_lines(1)
						.truncate(),
				)
				.child(
					text(
						say(if invitation {
							settings::screen::subtitle::INVITATION
						} else {
							settings::screen::subtitle::SPACE
						})
						.to_owned(),
					)
					.font(TEXT_XS)
					.color(t.muted_foreground),
				),
		);
	let group = col()
		.w_full()
		.gap(SPACING * 0.5)
		.role("list")
		.label(say(settings::screen::group::SETTINGS))
		.child(
			row().h(SPACING * 8.0).px(SPACING * 2.0).pb(SPACING).center_y().child(
				text(say(settings::screen::group::SETTINGS).to_owned())
					.font(TEXT_XS_MEDIUM)
					.color(t.muted_foreground),
			),
		)
		.children(entries.iter().map(|&entry| {
			let count = (entry == Entry::Agents)
				.then(|| settings.agents.map(|agents| agents.len().to_string()))
				.flatten();
			menu_row(
				t,
				MenuRow {
					glyph: entry.glyph(entry == settings.entry),
					label: entry.label(invitation),
					trailing: count,
					tone: if entry == settings.entry { MenuTone::Selected } else { MenuTone::Rest },
					disabled: entry != Entry::Space
						&& (unreachable || (screen.session_unavailable && session_bound(entry))),
					event: SpaceEvent::Select(entry),
				},
				w,
			)
		}));
	let pinned = match screen.standing {
		Standing::Invitation { .. } => menu_row(
			t,
			MenuRow {
				glyph: &icons::CLOSE,
				label: say(bots::spaces::invitations::DECLINE),
				trailing: None,
				tone: MenuTone::Quiet,
				disabled: false,
				event: SpaceEvent::Decline,
			},
			w,
		),
		Standing::Joined { .. } => menu_row(
			t,
			MenuRow {
				glyph: &icons::BRACKET_ARROW_RIGHT,
				label: say(common::spaces::leave::ACTION),
				trailing: None,
				tone: MenuTone::Danger,
				disabled: false,
				event: SpaceEvent::AskDanger,
			},
			w,
		),
		Standing::Yours { .. } => menu_row(
			t,
			MenuRow {
				glyph: Entry::Danger.glyph(settings.entry == Entry::Danger),
				label: Entry::Danger.label(false),
				trailing: None,
				tone: if settings.entry == Entry::Danger {
					MenuTone::DangerSelected
				} else {
					MenuTone::Danger
				},
				disabled: false,
				event: SpaceEvent::Select(Entry::Danger),
			},
			w,
		),
	};
	col()
		.w(screen.menu_width)
		.h_full()
		.pt(SPACING * 2.0)
		.pb(SPACING * 3.0)
		.px(SPACING * 2.0)
		.gap(SPACING * 2.0)
		.role("navigation")
		.label(say(settings::screen::MENU))
		.child(row().child(ring(t, w.on(instant(back), SpaceEvent::Back))))
		.child(identity)
		.child(group)
		.child(el().grow(1.0))
		.child(pinned)
}

pub fn space_settings_screen<S: 'static>(t: &Tokens, screen: &SpaceScreen, w: Wiring<S>) -> El {
	let settings = &screen.settings;
	let t = &t.in_space(settings.value.colour);
	let invitation = matches!(screen.standing, Standing::Invitation { .. });
	let page = SpacePage {
		value: settings.value,
		name: settings.name,
		standing: screen.standing,
		rank: screen.rank,
		transfer: settings.transfer,
	};
	let content_width = 1180.0 - SIDEBAR_RAIL - screen.menu_width - WINDOW_INSET - SPACING * 12.0;
	let body = match settings.entry {
		Entry::Space => focused_space_page(t, &page, w),
		_ => entry_panel(t, settings, content_width, w),
	};
	let content = col()
		.grow(1.0)
		.shrink()
		.h_full()
		.role("main")
		.child(
			row().w_full().h(CONTENT_HEADER).pl(SPACING * 6.0).center_y().child(
				text(settings.entry.label(invitation).to_owned())
					.font(TEXT_SM_SEMIBOLD)
					.color(t.foreground)
					.role("heading"),
			),
		)
		.child(el().w_full().h(1.0).fill(t.border))
		.child(
			col()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.pt(SPACING * 8.0)
				.px(SPACING * 6.0)
				.gap(SPACING * 6.0)
				.child(body),
		);
	let card = row()
		.grow(1.0)
		.h_full()
		.radius(RADIUS_CONTROL)
		.fill(t.card)
		.border(1.0, t.shell_border)
		.clip_rounded(RADIUS_CONTROL)
		.child(settings_menu(t, screen, w))
		.child(el().w(1.0).h_full().fill(t.shell_divider))
		.child(content);
	let frame = row()
		.w_full()
		.h_full()
		.fill(t.background)
		.pt(TITLE_BAR)
		.pr(WINDOW_INSET)
		.pb(WINDOW_INSET)
		.child(el().w(SIDEBAR_RAIL - WINDOW_INSET).h_full().a11y_hidden())
		.child(card);
	let mut layers = layers(t, settings, w);
	if screen.leaving {
		layers.push(scrim(t));
		layers.push(danger_question(t, Danger::Leave, settings.value.shown_name(), w));
	}
	rune_kit::root(frame, layers)
}

pub const DIALOG_SCENE: (f32, f32) = (1180.0, 800.0);
pub const SCREEN_SCENE: (f32, f32) = (1180.0, 800.0);
pub const SHORT_SCREEN_SCENE: (f32, f32) = (1024.0, 360.0);
pub const FIELDS_SCENE: (f32, f32) = (720.0, 520.0);
pub const PAGE_SCENE: (f32, f32) = (1180.0, 720.0);
pub const COPY_SCENE: (f32, f32) = (720.0, 1880.0);
pub const REGIONS_SCENE: (f32, f32) = (720.0, 1180.0);

pub const INVITE_FAILED_STORIES: [&str; 11] = [
	"settings-space-spacesettingsdialog--members-invite-failed",
	"settings-space-spacesettingsdialog--members-invite-failed-offline",
	"settings-space-spacesettingsdialog--members-invite-failed-timed-out",
	"settings-space-spacesettingsdialog--members-invite-failed-unsent",
	"settings-space-spacesettingsdialog--members-invite-failed-relay-status",
	"settings-space-spacesettingsdialog--members-invite-failed-relay-conflict",
	"settings-space-spacesettingsdialog--members-invite-failed-unreadable-conflict",
	"settings-space-spacesettingsdialog--members-invite-failed-unreadable-list",
	"settings-space-spacesettingsdialog--members-invite-failed-list-not-read-back",
	"settings-space-spacesettingsdialog--members-invite-failed-relay-status-unknown",
	"settings-space-spacesettingsdialog--members-invite-failed-relay-conflict-unknown",
];

pub const SHARE_FAILED_STORIES: [&str; 8] = [
	"settings-space-spacesettingsdialog--members-share-failed",
	"settings-space-spacesettingsdialog--members-share-failed-not-owner",
	"settings-space-spacesettingsdialog--members-share-failed-device-awaiting-approval",
	"settings-space-spacesettingsdialog--members-share-failed-device-refused",
	"settings-space-spacesettingsdialog--members-share-failed-keys-missing",
	"settings-space-spacesettingsdialog--members-share-failed-instance-gone",
	"settings-space-spacesettingsdialog--members-share-failed-taken-over",
	"settings-space-spacesettingsdialog--members-share-failed-stream-closed",
];

const SCENE: Wiring<SceneState> = Wiring { emit: unheard, name: scene_edit, email: scene_edit };

fn unheard(_: &mut SceneState, _: SpaceEvent) {}

fn scene_edit(s: &mut SceneState) -> &mut TextEdit {
	&mut s.edit
}

const RELEASE_DESK: SpaceValue = SpaceValue { name: "Release desk", colour: Some(257.0) };
const STUDIO: &str = "Studio";
const PERSONAL: &str = "Personal";
const JOINED_HOST: &str = "http://192.168.1.24:45367";

const STEVE: Member = Member {
	id: "steve",
	name: Some("Steve"),
	email: "steve@example.com",
	status: MemberStatus::Host,
};
const NOA: Member = Member {
	id: "noa",
	name: Some("Noa Lambert"),
	email: "noa@example.com",
	status: MemberStatus::Host,
};
const MAYA: Member = Member {
	id: "maya",
	name: Some("Maya Chen"),
	email: "maya@example.com",
	status: MemberStatus::Joined,
};
const TOM: Member = Member {
	id: "tom",
	name: Some("Tom Okafor"),
	email: "tom@example.com",
	status: MemberStatus::Joined,
};
const TOM_PENDING: Member = Member {
	id: "tom",
	name: None,
	email: "tom@example.com",
	status: MemberStatus::Pending { expires_in_days: Some(6) },
};
const SAM_PENDING: Member = Member {
	id: "sam",
	name: None,
	email: "sam@example.com",
	status: MemberStatus::Pending { expires_in_days: Some(6) },
};
const SAM_INVITED: Member = Member {
	id: "sam",
	name: None,
	email: "sam@example.com",
	status: MemberStatus::Pending { expires_in_days: Some(7) },
};
const SAM_CARTER: Member = Member {
	id: "sam",
	name: Some("Sam Carter"),
	email: "sam@example.com",
	status: MemberStatus::Joined,
};
const LEA: Member =
	Member { id: "lea", name: Some("Lea"), email: "lea@example.com", status: MemberStatus::Joined };
const ADA: Member = Member {
	id: "ada",
	name: Some("Ada Lovelace"),
	email: "ada@example.com",
	status: MemberStatus::NeedsInvitation,
};
const ALEX: Member = Member {
	id: "alex",
	name: Some("Alex Moreau"),
	email: "alex@example.com",
	status: MemberStatus::Joined,
};
const JO_PENDING: Member = Member {
	id: "jo",
	name: None,
	email: "jo@example.com",
	status: MemberStatus::Pending { expires_in_days: None },
};
const LONG_EMAIL: &str = "maximiliana.konstantinopoulou-vanderberghe@example-long-domain.com";
const LONG_MEMBER: Member = Member {
	id: "long",
	name: Some("Maximiliana Konstantinopoulou-Vanderberghe de la Fontaine"),
	email: LONG_EMAIL,
	status: MemberStatus::Joined,
};
const LONG_PENDING: Member = Member {
	id: "long-pending",
	name: None,
	email: LONG_EMAIL,
	status: MemberStatus::Pending { expires_in_days: None },
};
const STUDIO_MEMBERS: [Member; 4] = [NOA, MAYA, TOM_PENDING, SAM_INVITED];
const MEMBER_VIEW: [Member; 4] = [NOA, MAYA, TOM, SAM_INVITED];

const AGENTS: [Agent; 4] = [
	Agent {
		id: "juniper",
		name: "Juniper",
		hue: Some(296.0),
		title: Some("Writer"),
		instructions: "You write release notes and changelogs for the Studio team. Group changes by area, link every pull request, and keep each entry to one plain sentence a customer can read.",
		skills: Some(3),
		applications: Some(2),
		mode: Mode::AcceptEdits,
	},
	Agent {
		id: "atlas",
		name: "Atlas",
		hue: Some(257.0),
		title: Some("Planner"),
		instructions: "You turn a goal into a plan the team can run: milestones, owners and the first three steps.",
		skills: Some(5),
		applications: Some(1),
		mode: Mode::Plan,
	},
	Agent {
		id: "pico",
		name: "Pico",
		hue: Some(132.0),
		title: Some("Builder"),
		instructions: "You ship small changes to the Studio site. Run the checks before you say it works.",
		skills: Some(8),
		applications: Some(3),
		mode: Mode::Ask,
	},
	Agent {
		id: "mira",
		name: "Mira",
		hue: Some(358.0),
		title: Some("Designer"),
		instructions: "You draw screens from what the product really does, and name every state you leave out.",
		skills: Some(2),
		applications: Some(0),
		mode: Mode::AcceptEdits,
	},
];

fn members<'a>(s: &'a SceneState, space: &'a str, list: &'a [Member<'a>]) -> Members<'a> {
	Members {
		space,
		members: list,
		loading: false,
		email: &s.edit,
		refusal: None,
		failure: None,
		hosted: true,
		blocked_by: None,
		viewer: None,
		removing: None,
		inviting_again: None,
	}
}

fn space<'a>(value: SpaceValue<'a>, name: &'a TextEdit) -> SpaceSettings<'a> {
	SpaceSettings {
		value,
		name,
		joined_host: None,
		transfer: false,
		danger: Danger::Delete { deletable: true },
		members: None,
		sharing: None,
		agents: None,
		entry: Entry::Space,
		asking: false,
		notices: Vec::new(),
	}
}

fn dialog_of(t: &Tokens, settings: SpaceSettings) -> El {
	space_settings_dialog(t, &settings, SCENE)
}

fn on_entry(
	t: &Tokens,
	s: &SceneState,
	entry: Entry,
	tweak: impl FnOnce(&mut SpaceSettings),
) -> El {
	let mut settings = SpaceSettings { entry, ..space(RELEASE_DESK, &s.edit) };
	tweak(&mut settings);
	dialog_of(t, settings)
}

pub fn dialog_default(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Space, |_| {})
}

pub fn dialog_free_hue(t: &Tokens, s: &SceneState) -> El {
	let value = SpaceValue { colour: Some(210.0), ..RELEASE_DESK };
	dialog_of(t, space(value, &s.edit))
}

pub fn dialog_transfer(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Space, |settings| settings.transfer = true)
}

pub fn dialog_secrets(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Secrets, |_| {})
}

pub fn dialog_skills(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Skills, |_| {})
}

pub fn dialog_applications(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Applications, |_| {})
}

pub fn dialog_history(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::History, |_| {})
}

pub fn dialog_danger(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Danger, |settings| settings.asking = true)
}

pub fn dialog_last_space(t: &Tokens, s: &SceneState) -> El {
	on_entry(t, s, Entry::Danger, |settings| settings.danger = Danger::Delete { deletable: false })
}

const NORTHWIND: SpaceValue = SpaceValue { name: "Northwind", colour: None };
const NORTHWIND_MEMBERS: [Member; 1] = [STEVE];

fn joined<'a>(
	s: &'a SceneState,
	value: SpaceValue<'a>,
	name: &'a TextEdit,
	entry: Entry,
) -> SpaceSettings<'a> {
	SpaceSettings {
		joined_host: Some(JOINED_HOST),
		danger: Danger::Leave,
		members: Some(members(s, value.name, &NORTHWIND_MEMBERS)),
		entry,
		..space(value, name)
	}
}

pub fn dialog_joined_space(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, joined(s, NORTHWIND, &s.edit, Entry::Space))
}

pub fn dialog_joined_danger(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, SpaceSettings { asking: true, ..joined(s, NORTHWIND, &s.edit, Entry::Danger) })
}

pub fn dialog_joined_themes(t: &Tokens, _: &SceneState) -> El {
	let panels = col()
		.w(SPACING * 140.0)
		.gap(SPACING * 5.0)
		.padding(SPACING * 6.0)
		.fill(t.card)
		.child(joined_fields(t, NORTHWIND, JOINED_HOST))
		.child(danger_zone(t, Danger::Leave, SCENE));
	rune_kit::root(
		col().w_full().h_full().fill(t.card).padding(SPACING * 4.0).child(panels),
		Vec::new(),
	)
}

fn members_dialog(t: &Tokens, m: Members, sharing: Option<Sharing>, notices: Vec<Notice>) -> El {
	let value = SpaceValue { name: m.space, colour: Some(257.0) };
	let unshown_name = m.email;
	dialog_of(
		t,
		SpaceSettings {
			entry: Entry::Members,
			members: Some(m),
			sharing,
			notices,
			..space(value, unshown_name)
		},
	)
}

fn hosted(t: &Tokens, m: Members) -> El {
	members_dialog(t, m, Some(Sharing::Online), Vec::new())
}

pub fn members_i_1(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, PERSONAL, &NORTHWIND_MEMBERS))
}

pub fn members_loading(t: &Tokens, s: &SceneState) -> El {
	hosted(t, Members { loading: true, ..members(s, STUDIO, &[]) })
}

fn notice(failed: bool, title: String, description: &str) -> Notice {
	Notice { failed, title, description: description.to_owned() }
}

pub fn members_i_3(t: &Tokens, s: &SceneState) -> El {
	let sent = notice(
		false,
		fill(settings::space::members::SENT, &[("email", SAM_INVITED.email)]),
		&fill(settings::space::members::SENT_DESCRIPTION, &[("date", "October 25")]),
	);
	members_dialog(t, members(s, STUDIO, &STUDIO_MEMBERS), Some(Sharing::Online), vec![sent])
}

pub fn members_i_4(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, PERSONAL, &[STEVE, SAM_CARTER]))
}

pub fn members_needs_invitation(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, PERSONAL, &[STEVE, ADA]))
}

pub fn members_inviting_again(t: &Tokens, s: &SceneState) -> El {
	hosted(t, Members { inviting_again: Some(ADA.id), ..members(s, PERSONAL, &[STEVE, ADA]) })
}

pub fn members_withdraw_pending(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, PERSONAL, &[STEVE, SAM_PENDING]))
}

pub fn members_i_5(t: &Tokens, s: &SceneState) -> El {
	let withdrawn = notice(
		false,
		fill(settings::space::members::WITHDRAWN, &[("email", TOM_PENDING.email)]),
		say(settings::space::members::WITHDRAWN_DESCRIPTION),
	);
	members_dialog(
		t,
		members(s, STUDIO, &[NOA, MAYA, SAM_INVITED]),
		Some(Sharing::Online),
		vec![withdrawn],
	)
}

pub fn members_remove_confirm(t: &Tokens, s: &SceneState) -> El {
	hosted(t, Members { removing: Some(MAYA), ..members(s, STUDIO, &[NOA, MAYA, TOM_PENDING]) })
}

pub fn members_i_7(t: &Tokens, s: &SceneState) -> El {
	hosted(
		t,
		Members {
			refusal: Some(Refusal::Invited),
			..members(s, STUDIO, &[NOA, MAYA, TOM_PENDING])
		},
	)
}

pub fn members_i_8(t: &Tokens, s: &SceneState) -> El {
	hosted(
		t,
		Members {
			refusal: Some(Refusal::OwnAddress),
			..members(s, PERSONAL, &[STEVE, SAM_PENDING])
		},
	)
}

pub fn members_i_9(t: &Tokens, s: &SceneState) -> El {
	hosted(
		t,
		Members {
			refusal: Some(Refusal::Malformed),
			..members(s, PERSONAL, &[STEVE, SAM_PENDING])
		},
	)
}

const INVITE_FAILURES: [InviteReason; 11] = [
	InviteReason::Common(Reason::Generic),
	InviteReason::Offline,
	InviteReason::TimedOut,
	InviteReason::Unsent,
	InviteReason::RelayStatus(Some(503)),
	InviteReason::RelayConflict(Some("ALREADY_INVITED")),
	InviteReason::UnreadableConflict,
	InviteReason::UnreadableList,
	InviteReason::ListNotReadBack,
	InviteReason::RelayStatus(None),
	InviteReason::RelayConflict(None),
];

pub fn members_invite_failed(t: &Tokens, s: &SceneState) -> El {
	let regions = INVITE_FAILURES.map(|reason| {
		let failure = Failure::Invite { reason, email: "sam@example.com" };
		invite_field(t, &Members { failure: Some(failure), ..members(s, STUDIO, &[]) }, "", SCENE)
	});
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.fill(t.card)
			.padding(SPACING * 4.0)
			.gap(SPACING * 6.0)
			.children(regions),
		Vec::new(),
	)
}

pub fn members_invite_failed_resend(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, STUDIO, &[NOA, MAYA, TOM_PENDING]))
}

pub fn members_withdraw_failed(t: &Tokens, s: &SceneState) -> El {
	let failure =
		Failure::Withdraw { reason: WithdrawReason::Common(Reason::Generic), member: SAM_PENDING };
	hosted(t, Members { failure: Some(failure), ..members(s, PERSONAL, &[STEVE, SAM_PENDING]) })
}

pub fn members_remove_failed(t: &Tokens, s: &SceneState) -> El {
	let failure =
		Failure::Remove { reason: RemoveReason::Common(Reason::Generic), member: SAM_CARTER };
	hosted(
		t,
		Members {
			failure: Some(failure),
			..members(s, PERSONAL, &[STEVE, ALEX, SAM_CARTER, JO_PENDING])
		},
	)
}

const COMMON_REASONS: [Reason; 4] =
	[Reason::NotHosting, Reason::NotOwner, Reason::NeedsSignIn, Reason::Unreachable];

fn failure_copy() -> Vec<Failure<'static>> {
	let email = "sam@example.com";
	let mut copy = vec![
		Failure::Invite { reason: InviteReason::Common(Reason::NotHosting), email },
		Failure::Invite { reason: InviteReason::LimitReached, email },
	];
	copy.extend(
		COMMON_REASONS[1..]
			.iter()
			.map(|&reason| Failure::Invite { reason: InviteReason::Common(reason), email }),
	);
	copy.push(Failure::Invite { reason: InviteReason::Common(Reason::Generic), email });
	copy.push(Failure::Withdraw { reason: WithdrawReason::Gone, member: SAM_PENDING });
	copy.push(Failure::Withdraw { reason: WithdrawReason::Joined, member: SAM_CARTER });
	copy.extend(COMMON_REASONS.map(|reason| Failure::Withdraw {
		reason: WithdrawReason::Common(reason),
		member: SAM_PENDING,
	}));
	copy.push(Failure::Withdraw {
		reason: WithdrawReason::Common(Reason::Generic),
		member: SAM_PENDING,
	});
	copy.push(Failure::Remove { reason: RemoveReason::Gone, member: SAM_CARTER });
	copy.push(Failure::Remove { reason: RemoveReason::Pending, member: SAM_PENDING });
	copy.push(Failure::Remove { reason: RemoveReason::Host, member: STEVE });
	copy.extend(COMMON_REASONS.map(|reason| Failure::Remove {
		reason: RemoveReason::Common(reason),
		member: SAM_CARTER,
	}));
	copy.push(Failure::Remove {
		reason: RemoveReason::Common(Reason::Generic),
		member: SAM_CARTER,
	});
	copy.push(Failure::Invite { reason: InviteReason::Common(Reason::Generic), email: LONG_EMAIL });
	copy.push(Failure::Remove {
		reason: RemoveReason::Common(Reason::Generic),
		member: LONG_MEMBER,
	});
	copy
}

fn failure_region(t: &Tokens, s: &SceneState, failure: Failure) -> El {
	let m = Members { failure: Some(failure), ..members(s, PERSONAL, &[]) };
	match failure {
		Failure::Invite { .. } => invite_field(t, &m, "", SCENE),
		Failure::Withdraw { member, .. } | Failure::Remove { member, .. } => {
			let line = member_row(
				t,
				&member,
				RowState {
					failure: failure_text(&failure, PERSONAL, None),
					viewer: false,
					disabled: false,
					inviting_again: false,
				},
				SCENE,
			);
			col().w_full().radius(RADIUS_XL).border(1.0, t.border).child(line)
		}
	}
}

pub fn members_failure_copy(t: &Tokens, s: &SceneState) -> El {
	let column = |failures: &[Failure]| {
		col()
			.w(SPACING * 80.0)
			.gap(SPACING * 4.0)
			.children(failures.iter().map(|&failure| failure_region(t, s, failure)))
	};
	let copy = failure_copy();
	let (left, right) = copy.split_at(copy.len().div_ceil(2));
	rune_kit::root(
		row()
			.w_full()
			.h_full()
			.fill(t.card)
			.padding(SPACING * 4.0)
			.gap(SPACING * 8.0)
			.items_start()
			.child(column(left))
			.child(column(right)),
		Vec::new(),
	)
}

pub fn members_failure_regions(t: &Tokens, s: &SceneState) -> El {
	let failure =
		Failure::Remove { reason: RemoveReason::Common(Reason::Generic), member: SAM_CARTER };
	let panel = members_panel(
		t,
		&Members { failure: Some(failure), ..members(s, PERSONAL, &[STEVE, SAM_CARTER]) },
		SCENE,
	);
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.fill(t.card)
			.padding(SPACING * 4.0)
			.child(col().w(SPACING * 140.0).child(panel)),
		Vec::new(),
	)
}

pub fn members_long_identity(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, PERSONAL, &[STEVE, LONG_MEMBER, LONG_PENDING]))
}

pub fn members_with_invitations(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, STUDIO, &STUDIO_MEMBERS))
}

fn member_view(t: &Tokens, s: &SceneState, tweak: impl FnOnce(Members) -> Members) -> El {
	let value = SpaceValue { name: STUDIO, colour: None };
	let m = tweak(Members { viewer: Some(TOM.id), ..members(s, STUDIO, &MEMBER_VIEW) });
	dialog_of(
		t,
		SpaceSettings {
			joined_host: Some(JOINED_HOST),
			danger: Danger::Leave,
			members: Some(m),
			entry: Entry::Members,
			..space(value, &s.edit)
		},
	)
}

pub fn members_member_view(t: &Tokens, s: &SceneState) -> El {
	member_view(t, s, |m| m)
}

pub fn members_member_view_remove_confirm(t: &Tokens, s: &SceneState) -> El {
	member_view(t, s, |m| Members { removing: Some(MAYA), ..m })
}

pub fn members_remove_host_refused(t: &Tokens, s: &SceneState) -> El {
	member_view(t, s, |m| Members {
		failure: Some(Failure::Remove { reason: RemoveReason::Host, member: NOA }),
		..m
	})
}

pub fn members_host_offline(t: &Tokens, s: &SceneState) -> El {
	member_view(t, s, |m| Members { blocked_by: Some(Blocker::HostOffline), ..m })
}

fn not_shared(t: &Tokens, s: &SceneState, sharing: Sharing, notices: Vec<Notice>) -> El {
	members_dialog(
		t,
		Members { hosted: false, ..members(s, STUDIO, &NORTHWIND_MEMBERS) },
		Some(sharing),
		notices,
	)
}

pub fn members_not_shared(t: &Tokens, s: &SceneState) -> El {
	not_shared(t, s, Sharing::Off, Vec::new())
}

pub fn members_sharing(t: &Tokens, s: &SceneState) -> El {
	not_shared(t, s, Sharing::Connecting, Vec::new())
}

pub fn members_shared(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, STUDIO, &NORTHWIND_MEMBERS))
}

pub fn members_joined_and_pending(t: &Tokens, s: &SceneState) -> El {
	hosted(t, members(s, STUDIO, &[STEVE, LEA, SAM_PENDING]))
}

pub fn members_signed_out(t: &Tokens, s: &SceneState) -> El {
	members_dialog(
		t,
		Members {
			hosted: false,
			blocked_by: Some(Blocker::SignedOut),
			..members(s, STUDIO, &NORTHWIND_MEMBERS)
		},
		Some(Sharing::SignedOut),
		Vec::new(),
	)
}

pub fn members_share_failed(t: &Tokens, s: &SceneState) -> El {
	use settings::space::hosting::failed::reasons;
	let title = fill(settings::space::hosting::failed::TITLE, &[("name", STUDIO)]);
	let notices = [
		reasons::UNKNOWN,
		reasons::NOT_OWNER,
		reasons::DEVICE_AWAITING_APPROVAL,
		reasons::DEVICE_REFUSED,
		reasons::KEYS_MISSING,
		reasons::INSTANCE_GONE,
		reasons::TAKEN_OVER,
		reasons::STREAM_CLOSED,
	]
	.map(|reason| notice(true, title.clone(), say(reason)))
	.to_vec();
	not_shared(t, s, Sharing::Off, notices)
}

fn stage_of(t: &Tokens, width: f32, content: El) -> El {
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.fill(t.card)
			.padding(SPACING * 4.0)
			.child(col().w(width).child(content)),
		Vec::new(),
	)
}

const FIELDS_WIDTH: f32 = SPACING * 112.0;

fn fields_story(t: &Tokens, s: &SceneState, value: SpaceValue, width: f32) -> El {
	stage_of(t, width, space_fields(t, value, &s.edit, SCENE))
}

pub fn fields_default(t: &Tokens, s: &SceneState) -> El {
	fields_story(t, s, RELEASE_DESK, FIELDS_WIDTH)
}

pub fn fields_recoloured(t: &Tokens, s: &SceneState) -> El {
	fields_story(
		t,
		s,
		SpaceValue { colour: Some(Preset::Pink.hue()), ..RELEASE_DESK },
		FIELDS_WIDTH,
	)
}

pub fn fields_colourless(t: &Tokens, s: &SceneState) -> El {
	fields_story(t, s, SpaceValue { colour: None, ..RELEASE_DESK }, FIELDS_WIDTH)
}

pub fn fields_empty(t: &Tokens, s: &SceneState) -> El {
	fields_story(t, s, SpaceValue { name: "", colour: None }, FIELDS_WIDTH)
}

pub fn fields_own_hue(t: &Tokens, s: &SceneState) -> El {
	fields_story(t, s, SpaceValue { colour: Some(210.0), ..RELEASE_DESK }, FIELDS_WIDTH)
}

pub fn fields_own_hue_at_page_width(t: &Tokens, s: &SceneState) -> El {
	fields_story(t, s, SpaceValue { colour: Some(210.0), ..RELEASE_DESK }, SPACING * 170.0)
}

pub fn fields_narrow(t: &Tokens, s: &SceneState) -> El {
	fields_story(t, s, RELEASE_DESK, SPACING * 64.0)
}

pub fn fields_own_hue_over_a_preset(t: &Tokens, s: &SceneState) -> El {
	fields_story(
		t,
		s,
		SpaceValue { colour: Some(OWN_HUE_BY_DEFAULT), ..RELEASE_DESK },
		FIELDS_WIDTH,
	)
}

pub fn colour_preset(t: &Tokens, _: &SceneState) -> El {
	stage_of(t, FIELDS_WIDTH, colour_field(t, Some(257.0), SCENE))
}

pub fn colour_colourless(t: &Tokens, _: &SceneState) -> El {
	stage_of(t, FIELDS_WIDTH, colour_field(t, None, SCENE))
}

fn joined_story(t: &Tokens, value: SpaceValue) -> El {
	stage_of(t, FIELDS_WIDTH, joined_fields(t, value, JOINED_HOST))
}

pub fn joined_fields_default(t: &Tokens, _: &SceneState) -> El {
	joined_story(t, NORTHWIND)
}

pub fn joined_fields_empty_name(t: &Tokens, _: &SceneState) -> El {
	joined_story(t, SpaceValue { name: "", colour: None })
}

pub fn joined_fields_long_name(t: &Tokens, _: &SceneState) -> El {
	joined_story(
		t,
		SpaceValue {
			name: "Northwind-quarterly-release-planning-and-retrospective-archive-2026",
			colour: None,
		},
	)
}

const AGENTS_WIDTH: f32 = 640.0;

fn agents_story(t: &Tokens, agents: &[Agent]) -> El {
	rune_kit::root(
		col().w_full().h_full().fill(t.card).padding(SPACING * 4.0).items_center().child(
			col().w(AGENTS_WIDTH).child(agents_section(t, STUDIO, agents, AGENTS_WIDTH, SCENE)),
		),
		Vec::new(),
	)
}

pub fn agents_four(t: &Tokens, _: &SceneState) -> El {
	agents_story(t, &AGENTS)
}

pub fn agents_no_counts(t: &Tokens, _: &SceneState) -> El {
	agents_story(t, &AGENTS.map(|agent| Agent { skills: None, applications: None, ..agent }))
}

pub fn agents_one_count(t: &Tokens, _: &SceneState) -> El {
	agents_story(t, &AGENTS.map(|agent| Agent { applications: None, ..agent }))
}

pub fn agents_one(t: &Tokens, _: &SceneState) -> El {
	agents_story(t, &AGENTS[..1])
}

pub fn agents_free_hue(t: &Tokens, _: &SceneState) -> El {
	agents_story(t, &[Agent { hue: Some(210.0), ..AGENTS[0] }])
}

pub fn agents_none(t: &Tokens, _: &SceneState) -> El {
	agents_story(t, &[])
}

pub fn agents_long_name_and_title(t: &Tokens, _: &SceneState) -> El {
	agents_story(
		t,
		&[
			Agent {
				name: "Juniper-Konstantinopoulou-Vanderberghe",
				title: Some("Writer of every changelog and announcement"),
				..AGENTS[0]
			},
			AGENTS[1],
		],
	)
}

pub const AGENT_CARD_KEY: &str = "agent-juniper";

fn page_story(t: &Tokens, s: &SceneState, value: SpaceValue, standing: Standing, width: f32) -> El {
	let page = SpacePage { value, name: &s.edit, standing, rank: Some(2), transfer: false };
	stage_of(t, width, focused_space_page(t, &page, SCENE))
}

const PAGE_WIDTH: f32 = SPACING * 160.0;

pub fn page_yours(t: &Tokens, s: &SceneState) -> El {
	page_story(t, s, RELEASE_DESK, Standing::Yours { shared: false }, PAGE_WIDTH)
}

pub fn page_shared(t: &Tokens, s: &SceneState) -> El {
	page_story(t, s, RELEASE_DESK, Standing::Yours { shared: true }, PAGE_WIDTH)
}

const SAM_RIVERA: Standing =
	Standing::Joined { host_name: "Sam Rivera", connected: true, connecting: false };
const SAM_RIVERA_CONNECTING: Standing =
	Standing::Joined { host_name: "Sam Rivera", connected: true, connecting: true };

pub fn page_joined(t: &Tokens, s: &SceneState) -> El {
	page_story(
		t,
		s,
		SpaceValue { name: "Northwind", colour: Some(Preset::Green.hue()) },
		SAM_RIVERA,
		PAGE_WIDTH,
	)
}

pub fn page_long_name_narrow(t: &Tokens, s: &SceneState) -> El {
	page_story(
		t,
		s,
		SpaceValue {
			name: "The quarterly release desk for every product line we ship",
			colour: Some(257.0),
		},
		Standing::Yours { shared: true },
		SPACING * 90.0,
	)
}

pub fn page_connecting(t: &Tokens, s: &SceneState) -> El {
	page_story(
		t,
		s,
		SpaceValue { name: "Northwind", colour: Some(Preset::Green.hue()) },
		SAM_RIVERA_CONNECTING,
		PAGE_WIDTH,
	)
}

const SCREEN_MEMBERS: [Member; 2] = [STEVE, MAYA];

fn screen_of(t: &Tokens, screen: SpaceScreen) -> El {
	space_settings_screen(t, &screen, SCENE)
}

fn release_desk_screen<'a>(
	s: &'a SceneState,
	name: &'a TextEdit,
	value: SpaceValue<'a>,
	entry: Entry,
) -> SpaceScreen<'a> {
	SpaceScreen {
		settings: SpaceSettings {
			entry,
			members: Some(members(s, "Release desk", &SCREEN_MEMBERS)),
			..space(value, name)
		},
		standing: Standing::Yours { shared: true },
		rank: None,
		menu_width: MENU_WIDTH,
		session_unavailable: false,
		leaving: false,
	}
}

fn on_screen(t: &Tokens, s: &SceneState, value: SpaceValue, entry: Entry, width: f32) -> El {
	screen_of(t, SpaceScreen { menu_width: width, ..release_desk_screen(s, &s.edit, value, entry) })
}

pub fn screen_members(t: &Tokens, s: &SceneState) -> El {
	on_screen(t, s, RELEASE_DESK, Entry::Members, MENU_WIDTH)
}

pub fn screen_danger_zone(t: &Tokens, s: &SceneState) -> El {
	on_screen(t, s, RELEASE_DESK, Entry::Danger, MENU_WIDTH)
}

pub fn screen_members_free_hue(t: &Tokens, s: &SceneState) -> El {
	on_screen(t, s, SpaceValue { colour: Some(210.0), ..RELEASE_DESK }, Entry::Members, MENU_WIDTH)
}

pub fn screen_applications(t: &Tokens, s: &SceneState) -> El {
	on_screen(t, s, RELEASE_DESK, Entry::Applications, MENU_WIDTH)
}

pub fn screen_long_name(t: &Tokens, s: &SceneState) -> El {
	let value = SpaceValue {
		name: "The quarterly release desk for every product line we ship",
		colour: Some(Preset::Pink.hue()),
	};
	on_screen(t, s, value, Entry::Members, MENU_WIDTH)
}

pub fn screen_minimum_width(t: &Tokens, s: &SceneState) -> El {
	on_screen(t, s, RELEASE_DESK, Entry::Members, 224.0)
}

pub fn screen_maximum_width(t: &Tokens, s: &SceneState) -> El {
	on_screen(t, s, RELEASE_DESK, Entry::Members, 416.0)
}

fn studio_agents_screen(
	t: &Tokens,
	s: &SceneState,
	value: SpaceValue,
	agents: &[Agent],
	entry: Entry,
	standing: Standing,
) -> El {
	let base = release_desk_screen(s, &s.edit, value, entry);
	screen_of(
		t,
		SpaceScreen {
			settings: SpaceSettings { agents: Some(agents), transfer: false, ..base.settings },
			standing,
			rank: Some(2),
			..base
		},
	)
}

pub fn screen_agents(t: &Tokens, s: &SceneState) -> El {
	studio_agents_screen(
		t,
		s,
		SpaceValue { name: STUDIO, colour: Some(257.0) },
		&AGENTS,
		Entry::Agents,
		Standing::Yours { shared: true },
	)
}

pub fn screen_yours_not_shared(t: &Tokens, s: &SceneState) -> El {
	let value = SpaceValue { name: "Field notes", colour: Some(Preset::Purple.hue()) };
	studio_agents_screen(t, s, value, &AGENTS[..2], Entry::Space, Standing::Yours { shared: false })
}

pub fn screen_space_form_page(t: &Tokens, s: &SceneState) -> El {
	studio_agents_screen(
		t,
		s,
		RELEASE_DESK,
		&AGENTS[..2],
		Entry::Space,
		Standing::Yours { shared: false },
	)
}

pub fn screen_space_agents(t: &Tokens, s: &SceneState) -> El {
	studio_agents_screen(
		t,
		s,
		RELEASE_DESK,
		&AGENTS,
		Entry::Agents,
		Standing::Yours { shared: false },
	)
}

fn joined_screen(
	t: &Tokens,
	s: &SceneState,
	value: SpaceValue,
	standing: Standing,
	entry: Entry,
	rank: u32,
	unavailable: bool,
) -> El {
	let base = release_desk_screen(s, &s.edit, value, entry);
	screen_of(
		t,
		SpaceScreen {
			settings: SpaceSettings {
				agents: Some(&AGENTS[..3]),
				joined_host: Some(JOINED_HOST),
				danger: Danger::Leave,
				..base.settings
			},
			standing,
			rank: Some(rank),
			session_unavailable: unavailable,
			..base
		},
	)
}

const NORTHWIND_GREEN: SpaceValue = SpaceValue { name: "Northwind", colour: Some(132.0) };

pub fn screen_joined_host_online(t: &Tokens, s: &SceneState) -> El {
	joined_screen(t, s, NORTHWIND_GREEN, SAM_RIVERA, Entry::Space, 3, false)
}

pub fn screen_joined_host_not_connected(t: &Tokens, s: &SceneState) -> El {
	let value = SpaceValue { name: "Harbor", colour: Some(Preset::Orange.hue()) };
	let standing =
		Standing::Joined { host_name: "Jordan Lee", connected: false, connecting: false };
	joined_screen(t, s, value, standing, Entry::Space, 4, false)
}

pub fn screen_joined_session_unavailable(t: &Tokens, s: &SceneState) -> El {
	joined_screen(t, s, NORTHWIND_GREEN, SAM_RIVERA, Entry::Secrets, 3, true)
}

pub fn screen_joined_host_connecting(t: &Tokens, s: &SceneState) -> El {
	joined_screen(t, s, NORTHWIND_GREEN, SAM_RIVERA_CONNECTING, Entry::Space, 3, false)
}

pub fn screen_invitation(t: &Tokens, s: &SceneState) -> El {
	let value = SpaceValue { name: "Atelier", colour: Some(Preset::Yellow.hue()) };
	let base = release_desk_screen(s, &s.edit, value, Entry::Space);
	screen_of(
		t,
		SpaceScreen {
			settings: SpaceSettings { members: None, ..base.settings },
			standing: Standing::Invitation { host_email: "priya@example.com", expires: "Nov 2" },
			..base
		},
	)
}

pub const MEMBERS_INVITE_TABS: usize = 3;
pub const SCREEN_MENU_TABS: usize = 2;
pub const AGENT_CARD_TABS: usize = 2;
