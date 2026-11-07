use rune::image::Image;
use rune::{Color, El, Icon, Span, TextStyle, col, el, icon, rich, row, text};

use super::blocks::{
	GROUP_GAP, HAIRLINE, boxed, detail, group, hairline, link_row, rows, sections, setting_row,
	switch_row, title, toggle,
};
use super::{Emit, Look, SettingsEvent, control, pressed};
use crate::avatar::{Face, Person};
use crate::icons;
use crate::primitives::badge::{BadgeVariant, badge};
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::{DialogContent, dialog, scrim};
use crate::primitives::skeleton::skeleton;
use crate::primitives::tight;
use crate::strings::{Language, settings};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_LG, RADIUS_MD, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

const OPTION_GAP: f32 = SPACING * 1.5;
const OPTION_INSET: f32 = SPACING * 3.0;
const OPTION_GLYPH: f32 = SPACING * 4.0;
const LANGUAGE_GAP: f32 = SPACING;
const LANGUAGE_INSET: f32 = SPACING * 2.0;
const CHECK_COLUMN: f32 = SPACING * 4.0;
const CHECK_GLYPH: f32 = SPACING * 3.5;
const SWITCHES_GAP: f32 = SPACING * 2.0;
const DIAGNOSTICS_GAP: f32 = SPACING * 4.0;
const STATUS_GLYPH: f32 = SPACING * 3.0;
const STATUS_GAP: f32 = SPACING * 1.5;
const STATUS_HINT_INDENT: f32 = STATUS_GLYPH + STATUS_GAP;
const PROGRESS_TRACK: (f32, f32) = (SPACING * 30.0, SPACING);
const PROGRESS_VALUE: f32 = SPACING * 8.0;
const PROGRESS_GAP: f32 = SPACING * 2.5;
const CHANNEL_INSET: f32 = SPACING * 0.5;
const CHANNEL_OPTION: (f32, f32) = (SPACING * 15.0, SPACING * 6.0);
const NOTICE_GAP: f32 = SPACING * 2.5;
const NOTICE_GLYPH: f32 = SPACING * 4.0;
const NOTICE_TINT: f32 = 0.08;
const NOTICE_EDGE: f32 = 0.3;
const SPIN_PERIOD: f64 = 0.8;
const ACCOUNT_INSET: f32 = SPACING * 3.0;
const ACCOUNT_GAP: f32 = SPACING * 5.0;
const INTRO_MEASURE: f32 = SPACING * 120.0;
const INTRO_GAP: f32 = SPACING;
const ACTIONS_GAP: f32 = SPACING * 2.0;
const CARD_INSET: f32 = SPACING * 3.5;
const CARD_GAP: f32 = SPACING * 3.0;
pub const ACCOUNT_AVATAR: f32 = SPACING * 10.0;
const PLAN_GAP: f32 = SPACING * 1.5;
const DEVICE_GLYPH: f32 = SPACING * 5.0;
const DEVICE_INSET: f32 = SPACING * 3.0;
const DEVICES_GAP: f32 = SPACING * 4.0;
const DEVICE_LABEL_GAP: f32 = SPACING * 1.5;
const REMOVE_COLUMN: f32 = SPACING * 18.0;
const CONFIRM_GAP: f32 = SPACING * 2.5;
const CONFIRM_INDENT: f32 = DEVICE_GLYPH + DEVICE_INSET;
const CONFIRM_TINT: f32 = 0.1;
const FAILURE_GLYPH: f32 = SPACING * 3.5;
const SKELETON_NAME: f32 = SPACING * 2.5;
const SKELETON_ACTIVITY: f32 = SPACING * 2.0;
const SKELETON_CARD_BARS: [f32; 2] = [SPACING * 35.0, SPACING * 50.0];
const SKELETON_ROWS: [(f32, f32); 3] = [
	(SPACING * 24.0, SPACING * 30.0),
	(SPACING * 32.0, SPACING * 25.0),
	(SPACING * 21.0, SPACING * 33.0),
];
const SKELETON_BAR: f32 = SPACING * 3.0;
const SKELETON_FAINT_BAR: f32 = SPACING * 2.25;
const PICTURE_SIDE: f32 = SPACING * 10.0;
const PICTURE_GLYPH: f32 = SPACING * 6.0;
const TABULAR: &str = "'tnum' 1";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColorScheme {
	Light,
	Dark,
	System,
}

impl ColorScheme {
	const ALL: [ColorScheme; 3] = [ColorScheme::Light, ColorScheme::Dark, ColorScheme::System];

	fn glyph(self) -> &'static Icon {
		match self {
			ColorScheme::Light => &icons::SUN,
			ColorScheme::Dark => &icons::MOON,
			ColorScheme::System => &icons::MONITOR,
		}
	}

	fn label(self) -> crate::strings::Key {
		match self {
			ColorScheme::Light => settings::appearance::scheme::option::LIGHT,
			ColorScheme::Dark => settings::appearance::scheme::option::DARK,
			ColorScheme::System => settings::appearance::scheme::option::SYSTEM,
		}
	}
}

fn selectable_option(t: &Tokens, is_checked: bool, option: El) -> El {
	option
		.radius(RADIUS_XL)
		.fill(if is_checked { t.selection } else { Color::TRANSPARENT })
		.hover(if is_checked { t.selection } else { t.muted })
		.press(if is_checked { t.selection } else { t.muted })
		.role("radio")
		.checked(is_checked)
}

fn option_ink(t: &Tokens, is_checked: bool) -> Color {
	if is_checked { t.foreground } else { t.muted_foreground }
}

pub fn appearance<S: 'static>(look: Look, scheme: ColorScheme, emit: Emit<S, SettingsEvent>) -> El {
	let t = look.t;
	let tiles = ColorScheme::ALL.map(|option| {
		let is_checked = option == scheme;
		let label = look.say(option.label());
		let ink = option_ink(t, is_checked);
		let style = if is_checked { TEXT_XS_MEDIUM } else { TEXT_XS };
		let tile = col()
			.key(format!("scheme-{label}"))
			.grow(1.0)
			.padding(OPTION_INSET)
			.gap(OPTION_GAP)
			.items_center()
			.label(label)
			.child(icon(option.glyph(), OPTION_GLYPH).color(if is_checked {
				t.primary
			} else {
				ink
			}))
			.child(text(label.to_owned()).font(style).color(ink).group_color(t.foreground));
		pressed(
			control(t, selectable_option(t, is_checked, tile)),
			emit,
			SettingsEvent::ColorScheme(option),
		)
	});
	group(
		t,
		look.say(settings::appearance::scheme::LABEL),
		0.0,
		[row().w_full().gap(OPTION_GAP).role("radiogroup").children(tiles)],
	)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Notified {
	Question,
	Permission,
	Turn,
	Sound,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Notifications {
	pub question: bool,
	pub permission: bool,
	pub turn: bool,
	pub sound: bool,
}

impl Notifications {
	pub const ALL_ON: Notifications =
		Notifications { question: true, permission: true, turn: true, sound: true };
}

pub fn notifications<S: 'static>(
	look: Look,
	notified: Notifications,
	emit: Emit<S, SettingsEvent>,
) -> El {
	use settings::notifications::{event, sound};
	let t = look.t;
	let events = [
		(
			Notified::Question,
			event::question::LABEL,
			event::question::DESCRIPTION,
			notified.question,
		),
		(
			Notified::Permission,
			event::permission::LABEL,
			event::permission::DESCRIPTION,
			notified.permission,
		),
		(Notified::Turn, event::turn::LABEL, event::turn::DESCRIPTION, notified.turn),
	];
	sections([
		group(
			t,
			look.say(settings::notifications::LABEL),
			SWITCHES_GAP,
			events.map(|(which, label, description, is_on)| {
				switch_row(
					t,
					look.say(label),
					look.say(description),
					is_on,
					emit,
					SettingsEvent::Notify(which, !is_on),
				)
			}),
		),
		group(
			t,
			look.say(sound::LABEL),
			SWITCHES_GAP,
			[switch_row(
				t,
				look.say(sound::SWITCH),
				look.say(sound::DESCRIPTION),
				notified.sound,
				emit,
				SettingsEvent::Notify(Notified::Sound, !notified.sound),
			)],
		),
	])
}

const LANGUAGE_NAMES: [(Language, &str); 2] =
	[(Language::En, "English"), (Language::Fr, "Français")];

pub fn language<S: 'static>(
	look: Look,
	chosen: Option<Language>,
	emit: Emit<S, SettingsEvent>,
) -> El {
	let t = look.t;
	let machine = (None, look.say(settings::language::MACHINE));
	let options = std::iter::once(machine)
		.chain(LANGUAGE_NAMES.iter().map(|&(id, name)| (Some(id), name)))
		.map(|(id, name)| {
			let is_checked = chosen == id;
			let check = el().size(CHECK_COLUMN, CHECK_COLUMN).center();
			let check = if is_checked {
				check.child(icon(&icons::CHECK, CHECK_GLYPH).color(t.primary))
			} else {
				check
			};
			let option = row()
				.key(format!("language-{name}"))
				.w_full()
				.padding(LANGUAGE_INSET)
				.gap(LANGUAGE_INSET)
				.center_y()
				.label(name)
				.child(check)
				.child(
					text(name.to_owned())
						.font(TEXT_SM)
						.color(option_ink(t, is_checked))
						.group_color(t.foreground)
						.truncate(),
				);
			pressed(
				control(t, selectable_option(t, is_checked, option)),
				emit,
				SettingsEvent::Language(id),
			)
		});
	group(t, look.say(settings::language::LABEL), LANGUAGE_GAP, options)
}

fn small_button<S: 'static>(
	t: &Tokens,
	label: &str,
	variant: ButtonVariant,
	emit: Emit<S, SettingsEvent>,
	event: SettingsEvent,
) -> El {
	pressed(Button::new(label).variant(variant).size(ButtonSize::Sm).view(t), emit, event)
}

pub fn diagnostics<S: 'static>(look: Look, emit: Emit<S, SettingsEvent>) -> El {
	use settings::diagnostics::{COPY, DESCRIPTION, LABEL, REVEAL, clear};
	let t = look.t;
	group(
		t,
		look.say(LABEL),
		DIAGNOSTICS_GAP,
		[
			text(look.say(DESCRIPTION).to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap(),
			row()
				.gap(ACTIONS_GAP)
				.flex_wrap()
				.child(small_button(
					t,
					look.say(COPY),
					ButtonVariant::Outline,
					emit,
					SettingsEvent::CopyDiagnostics,
				))
				.child(small_button(
					t,
					look.say(REVEAL),
					ButtonVariant::Outline,
					emit,
					SettingsEvent::RevealLog,
				))
				.child(small_button(
					t,
					look.say(clear::ACTION),
					ButtonVariant::Outline,
					emit,
					SettingsEvent::AskClearLog,
				)),
		],
	)
}

pub fn clear_log_confirm<S: 'static>(look: Look, emit: Emit<S, SettingsEvent>) -> Vec<El> {
	use settings::diagnostics::clear;
	let t = look.t;
	let content = DialogContent {
		title: look.say(clear::TITLE),
		description: look.say(clear::DESCRIPTION),
		footer: vec![
			small_button(
				t,
				look.say(settings::account::waiting::CANCEL),
				ButtonVariant::Outline,
				emit,
				SettingsEvent::CancelClearLog,
			),
			small_button(
				t,
				look.say(clear::ACTION),
				ButtonVariant::Destructive,
				emit,
				SettingsEvent::ClearLog,
			),
		],
	};
	vec![scrim(t), dialog(t, content, move |s: &mut S| emit(s, SettingsEvent::CancelClearLog))]
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Channel {
	Stable,
	Beta,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Update<'a> {
	UpToDate { checked: &'a str },
	Checking,
	Available { version: &'a str },
	Downloading { version: &'a str, progress: f32 },
	Ready { version: &'a str, running: usize },
	Failed { version: &'a str },
}

impl Update<'_> {
	pub fn is_pending(&self) -> bool {
		!matches!(self, Update::UpToDate { .. } | Update::Checking)
	}
}

#[derive(Clone, Copy)]
pub struct About<'a> {
	pub version: &'a str,
	pub channel: Channel,
	pub update: Update<'a>,
	pub shows_whats_new: bool,
	pub getting_started: Option<bool>,
}

struct StatusLine {
	glyph: &'static Icon,
	tone: Color,
	is_emphasized: bool,
	is_spinning: bool,
	words: String,
	hint: Option<String>,
}

fn status_line(look: Look, update: Update) -> StatusLine {
	use settings::about::status;
	let t = look.t;
	let line = |glyph, tone, is_emphasized, words| StatusLine {
		glyph,
		tone,
		is_emphasized,
		is_spinning: false,
		words,
		hint: None,
	};
	match update {
		Update::UpToDate { checked } => line(
			&icons::CIRCLE_CHECK,
			t.success,
			false,
			look.fill(status::UP_TO_DATE, &[("when", checked)]),
		),
		Update::Checking => StatusLine {
			is_spinning: true,
			..line(
				&icons::LOADER_CIRCLE,
				t.muted_foreground,
				false,
				look.say(status::CHECKING).to_owned(),
			)
		},
		Update::Available { version } => line(
			&icons::ARROW_UP,
			t.sidebar_primary,
			true,
			look.fill(status::AVAILABLE, &[("version", version)]),
		),
		Update::Downloading { version, .. } => StatusLine {
			is_spinning: true,
			..line(
				&icons::LOADER_CIRCLE,
				t.sidebar_primary,
				false,
				look.fill(status::DOWNLOADING, &[("version", version)]),
			)
		},
		Update::Ready { version, running } => {
			let key = if running > 0 { status::READY_HELD } else { status::READY };
			let count = running.to_string();
			let hint = match running {
				0 => None,
				1 => Some(look.fill(status::RUNNING_ONE, &[("count", &count)])),
				_ => Some(look.fill(status::RUNNING_OTHER, &[("count", &count)])),
			};
			StatusLine {
				hint,
				..line(
					&icons::REFRESH_CW,
					t.sidebar_primary,
					true,
					look.fill(key, &[("version", version)]),
				)
			}
		}
		Update::Failed { version } => StatusLine {
			hint: Some(look.say(status::FAILED_HINT).to_owned()),
			..line(
				&icons::TRIANGLE_ALERT,
				t.destructive,
				true,
				look.fill(status::FAILED, &[("version", version)]),
			)
		},
	}
}

fn spinning(t: &Tokens, glyph: El) -> El {
	if t.reduced_motion {
		glyph
	} else {
		glyph.looping(rune_motion::LoopSpec::rotation(SPIN_PERIOD))
	}
}

fn update_status(look: Look, update: Update) -> El {
	let t = look.t;
	let line = status_line(look, update);
	let glyph = icon(line.glyph, STATUS_GLYPH).color(line.tone);
	let glyph = if line.is_spinning { spinning(t, glyph) } else { glyph };
	let (style, ink) = if line.is_emphasized {
		(TEXT_XS_MEDIUM, line.tone)
	} else {
		(TEXT_XS, t.muted_foreground)
	};
	let mut status = col().gap(ROW_TEXT_GAP).role("status").child(
		row()
			.gap(STATUS_GAP)
			.items_start()
			.child(el().h(TEXT_XS.line_height).center_y().child(glyph))
			.child(text(line.words).font(style).color(ink).wrap().shrink()),
	);
	if let Some(hint) = line.hint {
		status = status.child(
			text(hint).font(TEXT_XS).color(t.muted_foreground).wrap().pl(STATUS_HINT_INDENT),
		);
	}
	status
}

const ROW_TEXT_GAP: f32 = SPACING * 0.5;

fn update_action<S: 'static>(look: Look, update: Update, emit: Emit<S, SettingsEvent>) -> El {
	use settings::about::action;
	let t = look.t;
	let button = |label, variant, disabled, event| {
		let view =
			Button::new(label).variant(variant).size(ButtonSize::Sm).disabled(disabled).view(t);
		pressed(view.radius(RADIUS_LG), emit, event)
	};
	match update {
		Update::UpToDate { .. } | Update::Checking => button(
			look.say(action::CHECK),
			ButtonVariant::Outline,
			update == Update::Checking,
			SettingsEvent::Check,
		),
		Update::Available { .. } => button(
			look.say(action::DOWNLOAD),
			ButtonVariant::Default,
			false,
			SettingsEvent::Download,
		),
		Update::Downloading { progress, .. } => {
			let share = progress.clamp(0.0, 100.0) / 100.0;
			let (width, height) = PROGRESS_TRACK;
			let value = TextStyle { features: TABULAR, ..TEXT_XS_MEDIUM };
			row()
				.gap(PROGRESS_GAP)
				.center_y()
				.role("progressbar")
				.child(
					el().size(width, height)
						.radius(height / 2.0)
						.fill(t.border)
						.clip_rounded(height / 2.0)
						.child(el().size(width * share, height).fill(t.primary)),
				)
				.child(
					text(format!("{}%", progress.round()))
						.font(value)
						.color(t.foreground)
						.align(rune::Align::End)
						.w(PROGRESS_VALUE),
				)
		}
		Update::Ready { running, .. } => button(
			look.say(action::RESTART),
			ButtonVariant::Default,
			running > 0,
			SettingsEvent::Restart,
		),
		Update::Failed { .. } => button(
			look.say(action::DOWNLOAD_AGAIN),
			ButtonVariant::Destructive,
			false,
			SettingsEvent::Download,
		),
	}
}

fn channel_control<S: 'static>(look: Look, channel: Channel, emit: Emit<S, SettingsEvent>) -> El {
	use settings::about::channel::option;
	let t = look.t;
	let style = tight(TEXT_XS_MEDIUM);
	let (min_width, height) = CHANNEL_OPTION;
	let options =
		[(Channel::Stable, option::STABLE), (Channel::Beta, option::BETA)].map(|(which, key)| {
			let label = look.say(key);
			let is_checked = which == channel;
			let segment = row()
				.key(format!("channel-{label}"))
				.min_w(min_width)
				.h(height)
				.padding(crate::primitives::equal_padding(height, style.size))
				.radius(RADIUS_MD)
				.center()
				.fill(if is_checked { t.selection } else { Color::TRANSPARENT })
				.hover(if is_checked { t.selection } else { t.background })
				.role("radio")
				.label(label)
				.checked(is_checked)
				.child(
					text(label.to_owned())
						.font(style)
						.color(option_ink(t, is_checked))
						.group_color(t.foreground),
				);
			pressed(control(t, segment), emit, SettingsEvent::Channel(which))
		});
	row()
		.padding(CHANNEL_INSET)
		.gap(CHANNEL_INSET)
		.radius(RADIUS_LG)
		.fill(t.muted)
		.role("radiogroup")
		.children(options)
}

fn beta_notice(look: Look) -> El {
	use settings::about::beta_notice;
	let t = look.t;
	row()
		.w_full()
		.padding(OPTION_INSET)
		.gap(NOTICE_GAP)
		.items_start()
		.radius(RADIUS_XL)
		.border(HAIRLINE, faded(t.primary, NOTICE_EDGE))
		.fill(faded(t.primary, NOTICE_TINT))
		.child(icon(&icons::INFO, NOTICE_GLYPH).color(t.sidebar_primary))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.gap(ROW_TEXT_GAP)
				.child(title(t, look.say(beta_notice::TITLE)))
				.child(detail(t, look.say(beta_notice::DESCRIPTION))),
		)
}

fn getting_started<S: 'static>(look: Look, can_import: bool, emit: Emit<S, SettingsEvent>) -> El {
	use settings::about::getting_started::{
		LABEL, import_from_claude_code as import, replay_onboarding as replay,
	};
	let t = look.t;
	let import_row = if can_import {
		link_row(
			t,
			look.say(import::LABEL),
			Some(look.say(import::DESCRIPTION)),
			&icons::CHEVRON_RIGHT,
			emit,
			SettingsEvent::ImportFromClaudeCode,
		)
	} else {
		setting_row(
			text(look.say(import::LABEL).to_owned())
				.font(TEXT_XS_MEDIUM)
				.color(t.muted_foreground)
				.wrap(),
			Some(detail(t, look.say(import::NOTHING_TO_IMPORT))),
			None,
		)
	};
	group(
		t,
		look.say(LABEL),
		GROUP_GAP,
		[rows(
			t,
			[
				import_row,
				link_row(
					t,
					look.say(replay::LABEL),
					Some(look.say(replay::DESCRIPTION)),
					&icons::CHEVRON_RIGHT,
					emit,
					SettingsEvent::ReplayOnboarding,
				),
			],
		)],
	)
}

pub fn about<S: 'static>(look: Look, about: About, emit: Emit<S, SettingsEvent>) -> El {
	use settings::about::{channel, kiroshi, updates, whats_new};
	let t = look.t;
	let version = [("version", about.version)];
	let mut updates_group = vec![rows(
		t,
		[
			setting_row(
				title(t, &look.fill(settings::about::VERSION, &version)),
				Some(update_status(look, about.update)),
				Some(update_action(look, about.update, emit)),
			),
			setting_row(
				title(t, look.say(channel::LABEL)),
				Some(detail(t, look.say(channel::DESCRIPTION))),
				Some(channel_control(look, about.channel, emit)),
			),
			setting_row(
				title(t, look.say(whats_new::LABEL)),
				Some(detail(t, look.say(whats_new::DESCRIPTION))),
				Some(toggle(
					t,
					look.say(whats_new::LABEL),
					about.shows_whats_new,
					emit,
					SettingsEvent::ShowsWhatsNew(!about.shows_whats_new),
				)),
			),
		],
	)];
	if about.channel == Channel::Beta {
		updates_group.push(beta_notice(look));
	}
	let mut groups = vec![group(t, look.say(updates::LABEL), GROUP_GAP, updates_group)];
	if let Some(can_import) = about.getting_started {
		groups.push(getting_started(look, can_import, emit));
	}
	groups.push(group(
		t,
		look.say(kiroshi::LABEL),
		GROUP_GAP,
		[rows(
			t,
			[
				link_row(
					t,
					&look.fill(kiroshi::WHATS_NEW, &version),
					None,
					&icons::CHEVRON_RIGHT,
					emit,
					SettingsEvent::WhatsNew,
				),
				link_row(
					t,
					look.say(kiroshi::RELEASE_NOTES),
					None,
					&icons::SQUARE_ARROW_UP_RIGHT,
					emit,
					SettingsEvent::ReleaseNotes,
				)
				.label(look.say(kiroshi::RELEASE_NOTES_NAME)),
			],
		)],
	));
	sections(groups)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Plan {
	Free,
	Pro,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Account<'a> {
	SignedOut,
	Waiting,
	SignedIn { name: &'a str, email: &'a str, plan: Option<Plan> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeviceKind {
	Laptop,
	Phone,
	Desktop,
}

impl DeviceKind {
	fn glyph(self) -> &'static Icon {
		match self {
			DeviceKind::Laptop => &icons::LAPTOP,
			DeviceKind::Phone => &icons::SMARTPHONE,
			DeviceKind::Desktop => &icons::MONITOR,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Device<'a> {
	pub id: &'a str,
	pub kind: DeviceKind,
	pub name: &'a str,
	pub activity: Option<&'a str>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RemovalStatus {
	Removing,
	Failed,
}

#[derive(Clone, Copy)]
pub struct Devices<'a> {
	pub email: &'a str,
	pub this_device: Device<'a>,
	pub others: &'a [Device<'a>],
	pub is_pending: bool,
	pub confirming: Option<&'a str>,
	pub removal: Option<RemovalStatus>,
}

fn action_button<S: 'static>(
	t: &Tokens,
	button: Button,
	emit: Emit<S, SettingsEvent>,
	event: SettingsEvent,
) -> El {
	pressed(button.size(ButtonSize::Lg).view(t).radius(RADIUS_CONTROL), emit, event)
}

fn intro(t: &Tokens, heading: &str, body: &str) -> El {
	col()
		.max_w(INTRO_MEASURE)
		.gap(INTRO_GAP)
		.child(
			text(heading.to_owned())
				.font(TEXT_SM_SEMIBOLD)
				.color(t.foreground)
				.role("heading")
				.wrap(),
		)
		.child(text(body.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap())
}

fn caption(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap()
}

fn sign_in<S: 'static>(look: Look, is_waiting: bool, emit: Emit<S, SettingsEvent>) -> El {
	use settings::account::{signed_out, waiting};
	let t = look.t;
	let actions = col().gap(ACTIONS_GAP).items_start();
	if !is_waiting {
		return actions
			.child(action_button(
				t,
				Button::new(look.say(signed_out::SIGN_IN)).trailing(&icons::SQUARE_ARROW_UP_RIGHT),
				emit,
				SettingsEvent::SignIn,
			))
			.child(caption(t, look.say(signed_out::CAPTION)));
	}
	let waiting_label = look.say(waiting::LABEL);
	let waiting_button = Button::new(waiting_label)
		.leading(&icons::LOADER_CIRCLE)
		.size(ButtonSize::Lg)
		.disabled(true)
		.view(t)
		.radius(RADIUS_CONTROL);
	let link_words = look.say(waiting::COPY_SIGN_IN_LINK);
	let link =
		rich(link_words.to_owned(), vec![Span::new(0, link_words.len()).underline(t.foreground)])
			.font(TEXT_XS)
			.color(t.foreground)
			.key("copy-sign-in-link")
			.role("button")
			.label(link_words);
	actions
		.child(row().gap(ACTIONS_GAP).flex_wrap().child(waiting_button).child(action_button(
			t,
			Button::new(look.say(waiting::CANCEL)).variant(ButtonVariant::Outline),
			emit,
			SettingsEvent::CancelSignIn,
		)))
		.child(caption(t, look.say(waiting::CAPTION)))
		.child(
			row()
				.gap(INTRO_GAP)
				.center_y()
				.flex_wrap()
				.child(caption(t, look.say(waiting::BROWSER_DID_NOT_OPEN)))
				.child(pressed(control(t, link), emit, SettingsEvent::CopySignInLink)),
		)
}

fn account_card(
	look: Look,
	name: &str,
	email: &str,
	plan: Option<Plan>,
	image: Option<&Image>,
) -> El {
	use settings::account::signed_in;
	let t = look.t;
	let mut card = row()
		.w_full()
		.padding(CARD_INSET)
		.gap(CARD_GAP)
		.center_y()
		.radius(RADIUS_XL)
		.border(HAIRLINE, t.border)
		.child(Person { name, image }.draw(ACCOUNT_AVATAR, t))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.child(
					text(name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).wrap_anywhere(),
				)
				.child(
					text(email.to_owned())
						.font(TEXT_COMPACT)
						.color(t.muted_foreground)
						.wrap_anywhere(),
				),
		);
	if let Some(plan) = plan {
		let mut plan_line = row().gap(PLAN_GAP).center_y();
		if plan == Plan::Pro {
			plan_line =
				plan_line.child(badge(t, look.say(signed_in::plan::BETA), BadgeVariant::Secondary));
		}
		let plan_name = match plan {
			Plan::Pro => signed_in::plan::PRO,
			Plan::Free => signed_in::plan::FREE,
		};
		card = card.child(
			plan_line.child(text(look.say(plan_name).to_owned()).font(TEXT_SM).color(t.foreground)),
		);
	}
	card
}

fn bone(width: f32, height: f32, fill: Color) -> El {
	el().size(width, height).radius(height / 2.0).fill(fill)
}

fn pulsing(t: &Tokens, content: El) -> El {
	skeleton(t).fill(Color::TRANSPARENT).radius(0.0).w_full().child(content)
}

fn account_card_skeleton(t: &Tokens) -> El {
	pulsing(
		t,
		row()
			.w_full()
			.padding(CARD_INSET)
			.gap(CARD_GAP)
			.center_y()
			.radius(RADIUS_XL)
			.border(HAIRLINE, t.border)
			.child(
				el().size(ACCOUNT_AVATAR, ACCOUNT_AVATAR)
					.radius(ACCOUNT_AVATAR / 2.0)
					.fill(t.border),
			)
			.child(
				col()
					.grow(1.0)
					.child(row().h(TEXT_SM.line_height).center_y().child(bone(
						SPACING * 24.0,
						SKELETON_BAR,
						t.border,
					)))
					.child(row().h(TEXT_COMPACT.line_height).center_y().child(bone(
						SPACING * 34.0,
						SKELETON_FAINT_BAR,
						faded(t.border, 0.6),
					))),
			),
	)
}

pub fn account<S: 'static>(
	look: Look,
	account: Account,
	is_pending: bool,
	image: Option<&Image>,
	devices: Option<Devices>,
	emit: Emit<S, SettingsEvent>,
) -> El {
	use settings::account::{signed_in, signed_out};
	let t = look.t;
	let panel = col().w_full().padding(ACCOUNT_INSET).gap(ACCOUNT_GAP);
	if is_pending {
		return panel.child(account_card_skeleton(t));
	}
	let Account::SignedIn { name, email, plan } = account else {
		return panel
			.child(intro(t, look.say(signed_out::TITLE), look.say(signed_out::BODY)))
			.child(sign_in(look, account == Account::Waiting, emit));
	};
	let actions = row()
		.gap(ACTIONS_GAP)
		.flex_wrap()
		.child(action_button(
			t,
			Button::new(look.say(signed_in::MANAGE))
				.variant(ButtonVariant::Outline)
				.trailing(&icons::SQUARE_ARROW_UP_RIGHT),
			emit,
			SettingsEvent::ManageAccount,
		))
		.child(action_button(
			t,
			Button::new(look.say(signed_in::SIGN_OUT)).variant(ButtonVariant::Ghost),
			emit,
			SettingsEvent::SignOut,
		));
	let panel = panel.child(account_card(look, name, email, plan, image)).child(actions);
	match devices {
		Some(devices) => panel.child(your_devices(look, devices, emit)),
		None => panel,
	}
}

fn device_summary(t: &Tokens, device: &Device, name: &str, is_strong: bool) -> El {
	let style = if is_strong { TEXT_SM_MEDIUM } else { TEXT_SM };
	let mut words = col()
		.grow(1.0)
		.shrink()
		.child(text(name.to_owned()).font(style).color(t.foreground).wrap());
	if let Some(activity) = device.activity {
		words =
			words.child(text(activity.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap());
	}
	row()
		.grow(1.0)
		.shrink()
		.gap(DEVICE_INSET)
		.center_y()
		.child(icon(device.kind.glyph(), DEVICE_GLYPH).color(t.foreground))
		.child(words)
}

fn device_label(t: &Tokens, words: &str) -> El {
	text(words.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground).role("heading")
}

fn device_row<S: 'static>(look: Look, device: &Device, emit: Emit<S, SettingsEvent>) -> El {
	let t = look.t;
	let label = look.say(settings::account::devices::REMOVE);
	let remove = row()
		.key(format!("remove-{}", device.id))
		.radius(RADIUS_MD)
		.role("button")
		.label(label)
		.child(
			text(label.to_owned())
				.font(TEXT_COMPACT)
				.color(t.muted_foreground)
				.group_color(t.foreground),
		);
	row()
		.w_full()
		.padding(DEVICE_INSET)
		.gap(DEVICE_INSET)
		.center_y()
		.child(device_summary(t, device, device.name, false))
		.child(row().w(REMOVE_COLUMN).justify_center().child(pressed(
			control(t, remove),
			emit,
			SettingsEvent::AskRemoval(device.id.to_owned()),
		)))
}

fn removal_confirm<S: 'static>(
	look: Look,
	device: &Device,
	status: Option<RemovalStatus>,
	emit: Emit<S, SettingsEvent>,
) -> El {
	use settings::account::devices::confirm;
	let t = look.t;
	let named = [("device", device.name)];
	let is_removing = status == Some(RemovalStatus::Removing);
	let summary = device_summary(t, device, &look.fill(confirm::TITLE, &named), true);
	let mut block = col()
		.w_full()
		.padding(DEVICE_INSET)
		.gap(CONFIRM_GAP)
		.fill(faded(t.destructive, CONFIRM_TINT))
		.role("group")
		.child(summary)
		.child(
			text(look.say(confirm::BODY).to_owned())
				.font(TEXT_COMPACT)
				.color(t.foreground)
				.wrap()
				.pl(CONFIRM_INDENT),
		);
	if status == Some(RemovalStatus::Failed) {
		block = block.child(
			row()
				.pl(CONFIRM_INDENT)
				.gap(STATUS_GAP)
				.items_start()
				.role("alert")
				.child(icon(&icons::CIRCLE_ALERT, FAILURE_GLYPH).color(t.destructive))
				.child(
					text(look.fill(confirm::FAILED, &named))
						.font(TEXT_COMPACT)
						.color(t.destructive)
						.wrap()
						.shrink(),
				),
		);
	}
	let remove_label = look.say(if is_removing { confirm::REMOVING } else { confirm::REMOVE });
	let buttons = [
		(remove_label, ButtonVariant::Destructive, SettingsEvent::Remove(device.id.to_owned())),
		(look.say(confirm::CANCEL), ButtonVariant::Secondary, SettingsEvent::CancelRemoval),
	]
	.map(|(label, variant, event)| {
		pressed(
			Button::new(label).variant(variant).size(ButtonSize::Sm).disabled(is_removing).view(t),
			emit,
			event,
		)
	});
	block.child(row().pl(CONFIRM_INDENT).gap(ACTIONS_GAP).children(buttons))
}

fn devices_skeleton(t: &Tokens) -> El {
	let tile = || el().size(DEVICE_GLYPH, DEVICE_GLYPH).radius(RADIUS_MD).fill(t.muted);
	let [card_name, card_activity] = SKELETON_CARD_BARS;
	pulsing(
		t,
		col()
			.w_full()
			.gap(DEVICES_GAP)
			.a11y_hidden()
			.child(
				row()
					.w_full()
					.padding(DEVICE_INSET)
					.gap(DEVICE_INSET)
					.center_y()
					.radius(RADIUS_XL)
					.fill(boxed(t))
					.child(tile())
					.child(
						col()
							.gap(SPACING * 2.0)
							.child(bone(card_name, SKELETON_NAME, t.muted))
							.child(bone(card_activity, SKELETON_ACTIVITY, boxed(t))),
					),
			)
			.child(col().w_full().radius(RADIUS_XL).border(HAIRLINE, t.border).children(
				SKELETON_ROWS.map(|(name, activity)| {
					row()
						.w_full()
						.padding(DEVICE_INSET)
						.gap(DEVICE_INSET)
						.items_start()
						.child(tile())
						.child(
							col()
								.gap(STATUS_GAP)
								.child(bone(name, SKELETON_NAME, t.muted))
								.child(bone(activity, SKELETON_ACTIVITY, faded(t.muted, 0.65))),
						)
				}),
			)),
	)
}

pub fn your_devices<S: 'static>(look: Look, devices: Devices, emit: Emit<S, SettingsEvent>) -> El {
	use settings::account::devices as copy;
	let t = look.t;
	let section = col().w_full().gap(ACCOUNT_GAP).role("region").label(look.say(copy::TITLE));
	if devices.is_pending {
		return section.child(devices_skeleton(t));
	}
	let this_device = row()
		.w_full()
		.padding(DEVICE_INSET)
		.gap(DEVICE_INSET)
		.center_y()
		.radius(RADIUS_XL)
		.fill(boxed(t))
		.child(device_summary(t, &devices.this_device, devices.this_device.name, false))
		.child(text(look.say(copy::ACTIVE_NOW).to_owned()).font(TEXT_XS).color(t.muted_foreground));
	let others = if devices.others.is_empty() {
		text(look.fill(copy::EMPTY, &[("email", devices.email)]))
			.font(TEXT_COMPACT)
			.color(t.muted_foreground)
			.wrap()
			.w_full()
			.padding(SPACING * 4.0)
			.radius(RADIUS_XL)
			.border(HAIRLINE, t.input)
			.border_dash(4.0, 3.0)
	} else {
		let mut list =
			col().w_full().radius(RADIUS_XL).border(HAIRLINE, t.border).clip_rounded(RADIUS_XL);
		for (at, device) in devices.others.iter().enumerate() {
			if at > 0 {
				list = list.child(hairline(t));
			}
			list = list.child(if devices.confirming == Some(device.id) {
				removal_confirm(look, device, devices.removal, emit)
			} else {
				device_row(look, device, emit)
			});
		}
		list
	};
	section.child(
		col()
			.w_full()
			.gap(DEVICES_GAP)
			.child(
				col()
					.w_full()
					.gap(DEVICE_LABEL_GAP)
					.child(device_label(t, look.say(copy::THIS_DEVICE)))
					.child(this_device),
			)
			.child(
				col()
					.w_full()
					.gap(DEVICE_LABEL_GAP)
					.child(device_label(t, look.say(copy::OTHER_DEVICES)))
					.child(others),
			),
	)
}

pub enum Preview<'a> {
	Picture(&'a Image),
	Glyph,
	Face { seed: &'a str, hue: Option<f32> },
}

pub struct PictureField<'a> {
	pub preview: Preview<'a>,
	pub pick_label: &'a str,
	pub remove_label: Option<&'a str>,
}

pub fn profile_picture<S: 'static>(
	look: Look,
	field: PictureField,
	emit: Emit<S, SettingsEvent>,
) -> El {
	let t = look.t;
	let preview = match field.preview {
		Preview::Picture(image) => Person { name: "", image: Some(image) }.draw(PICTURE_SIDE, t),
		Preview::Glyph => el()
			.size(PICTURE_SIDE, PICTURE_SIDE)
			.radius(PICTURE_SIDE / 2.0)
			.center()
			.child(icon(&icons::USER, PICTURE_GLYPH).color(t.muted_foreground)),
		Preview::Face { seed, hue } => Face::still(seed, hue).draw(PICTURE_SIDE, t),
	};
	let mut buttons = row().gap(ACTIONS_GAP).center_y();
	if let Some(remove) = field.remove_label {
		buttons = buttons.child(pressed(
			Button::new(remove).variant(ButtonVariant::Ghost).view(t),
			emit,
			SettingsEvent::RemovePicture,
		));
	}
	row()
		.w_full()
		.padding(OPTION_INSET)
		.gap(CARD_GAP)
		.center_y()
		.justify_between()
		.radius(RADIUS_XL)
		.border(HAIRLINE, t.border)
		.fill(boxed(t))
		.child(preview)
		.child(buttons.child(pressed(
			Button::new(field.pick_label).variant(ButtonVariant::Outline).view(t),
			emit,
			SettingsEvent::PickPicture,
		)))
}
