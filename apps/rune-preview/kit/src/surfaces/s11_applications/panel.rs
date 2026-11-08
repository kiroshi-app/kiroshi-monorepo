use rune::{Color, Cursor, El, TextEdit, col, el, icon, row, text};

use super::mark::{Mark, MarkSize, mark};
use super::search::search_field;
use super::{
	HAIRLINE, PANEL_GAP, empty_description, empty_state, empty_title, fill, inset, kit_ring, mono,
	outlined, round, say,
};
use crate::icons;
use crate::primitives::Paint;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::skeleton::skeleton;
use crate::strings::{Key, Language, bots};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_SM_MEDIUM, TEXT_XS, Tokens};

const ROW_GAP: f32 = SPACING * 2.0;
const DOT: f32 = SPACING * 2.0;
const ACTION_LANE: (f32, f32) = (SPACING * 18.0, SPACING * 6.0);
const EMPTY_MEASURE: f32 = SPACING * 98.0;
const UNAVAILABLE_MEASURE: f32 = SPACING * 80.0;
const EMPTY_ART_OPACITY: f32 = 0.45;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Owner<'a> {
	Agent(&'a str),
	Space(&'a str),
	Profile,
}

struct OwnerCopy {
	intro: String,
	empty_title: String,
	empty_description: &'static str,
	footnote: Option<&'static str>,
}

impl Owner<'_> {
	fn copy(self, language: Language) -> OwnerCopy {
		use bots::applications::{empty, footnote, intro};
		match self {
			Owner::Profile => OwnerCopy {
				intro: say(intro::PROFILE, language).to_owned(),
				empty_title: say(empty::title::PROFILE, language).to_owned(),
				empty_description: say(empty::description::PROFILE, language),
				footnote: Some(say(footnote::PROFILE, language)),
			},
			Owner::Space(name) => OwnerCopy {
				intro: fill(intro::SPACE, language, &[("name", name)]),
				empty_title: fill(empty::title::SPACE, language, &[("name", name)]),
				empty_description: say(empty::description::SPACE, language),
				footnote: Some(say(footnote::SPACE, language)),
			},
			Owner::Agent(name) => OwnerCopy {
				intro: fill(intro::AGENT, language, &[("name", name)]),
				empty_title: say(empty::title::AGENT, language).to_owned(),
				empty_description: say(empty::description::AGENT, language),
				footnote: None,
			},
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Connection {
	Connected,
	NeedsAuthorization,
	Connecting,
	Failed,
}

impl Connection {
	fn state(self) -> Key {
		use bots::applications::connection::state;
		match self {
			Connection::Connected => state::CONNECTED,
			Connection::NeedsAuthorization => state::NEEDS_AUTHORIZATION,
			Connection::Connecting => state::CONNECTING,
			Connection::Failed => state::FAILED,
		}
	}

	fn dot(self, t: &Tokens) -> Color {
		match self {
			Connection::Connected => t.success,
			Connection::NeedsAuthorization => t.state_needs_authorization,
			Connection::Connecting => t.muted_foreground,
			Connection::Failed => t.destructive,
		}
	}

	fn action(self) -> Option<(Key, Key, ButtonVariant)> {
		use bots::applications::connection::{CONNECT, RETRY, row};
		match self {
			Connection::NeedsAuthorization => Some((CONNECT, row::CONNECT, ButtonVariant::Default)),
			Connection::Failed => Some((RETRY, row::RETRY, ButtonVariant::Outline)),
			Connection::Connected | Connection::Connecting => None,
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionReason {
	AlreadyRunning,
	Store,
	Transport,
	RefusedUrl,
	BrowserRefused,
	TimedOut,
	Unknown(String),
}

impl ConnectionReason {
	fn read(&self, language: Language) -> Option<String> {
		use bots::applications::connection::reason;
		let key = match self {
			ConnectionReason::Unknown(detail) if detail.trim().is_empty() => return None,
			ConnectionReason::Unknown(detail) => {
				return Some(fill(reason::UNKNOWN, language, &[("detail", detail)]));
			}
			ConnectionReason::AlreadyRunning => reason::ALREADY_RUNNING,
			ConnectionReason::Store => reason::STORE,
			ConnectionReason::Transport => reason::TRANSPORT,
			ConnectionReason::RefusedUrl => reason::REFUSED_URL,
			ConnectionReason::BrowserRefused => reason::BROWSER_REFUSED,
			ConnectionReason::TimedOut => reason::TIMED_OUT,
		};
		Some(say(key, language).to_owned())
	}
}

pub struct Application<'a> {
	pub name: &'a str,
	pub display_name: Option<&'a str>,
	pub mark: Mark<'a>,
	pub connection: Option<Connection>,
	pub reason: Option<ConnectionReason>,
}

pub struct Applications<'a> {
	pub owner: Owner<'a>,
	pub applications: &'a [Application<'a>],
	pub query: &'a TextEdit,
	pub has_failed_to_load: bool,
	pub can_connect: bool,
	pub language: Language,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ApplicationsEvent {
	Open(String),
	Connect(String),
	Add,
	Paste,
}

pub fn applications<S: 'static>(
	t: &Tokens,
	panel: &Applications,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
	emit: fn(&mut S, ApplicationsEvent),
) -> El {
	let language = panel.language;
	let column = col().w_full().h_full().gap(PANEL_GAP);
	if panel.has_failed_to_load {
		return column.child(empty_state(
			t,
			icon(&icons::TRIANGLE_ALERT, SPACING * 8.0).color(t.destructive),
			vec![empty_description(
				t,
				say(bots::applications::UNAVAILABLE, language),
				UNAVAILABLE_MEASURE,
			)],
			None,
		));
	}
	let copy = panel.owner.copy(language);
	let column = column.child(search_row(t, panel, access, emit));
	if panel.applications.is_empty() {
		return column.child(empty_state(
			t,
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.opacity(EMPTY_ART_OPACITY)
				.child(mark(t, Mark::Blank, MarkSize::Sm))
				.child(mark(t, Mark::Absent, MarkSize::Md))
				.child(mark(t, Mark::Blank, MarkSize::Sm)),
			vec![
				empty_title(t, &copy.empty_title),
				empty_description(t, copy.empty_description, EMPTY_MEASURE),
			],
			Some(add_button(t, language, ButtonVariant::Default, emit)),
		));
	}
	let intro = row()
		.w_full()
		.gap(SPACING * 3.0)
		.center_y()
		.justify_between()
		.child(text(copy.intro).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere().shrink())
		.child(add_button(t, language, ButtonVariant::Outline, emit));
	let list = col()
		.grow(1.0)
		.min_h(0.0)
		.w_full()
		.gap(ROW_GAP)
		.role("list")
		.children(
			panel
				.applications
				.iter()
				.map(|app| application_row(t, app, panel.can_connect, language, emit)),
		)
		.scroll(rune::ScrollSpec { stick_bottom: false });
	let column = column.child(intro).child(list);
	match copy.footnote {
		Some(footnote) => column.child(
			col()
				.w_full()
				.pt(SPACING * 3.0)
				.child(el().w_full().h(HAIRLINE).fill(t.border).absolute(0.0, 0.0))
				.child(
					text(footnote.to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.wrap_anywhere(),
				),
		),
		None => column,
	}
}

fn search_row<S: 'static>(
	t: &Tokens,
	panel: &Applications,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut TextEdit + 'static,
	emit: fn(&mut S, ApplicationsEvent),
) -> El {
	let paste = Button::icon(&icons::PLUS, say(bots::applications::PASTE, panel.language))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::IconLg)
		.view(t)
		.on_press(move |s: &mut S| emit(s, ApplicationsEvent::Paste));
	row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.child(search_field(t, panel.query, panel.language, access))
		.child(paste)
}

fn add_button<S: 'static>(
	t: &Tokens,
	language: Language,
	variant: ButtonVariant,
	emit: fn(&mut S, ApplicationsEvent),
) -> El {
	Button::new(say(bots::applications::ADD, language))
		.variant(variant)
		.size(ButtonSize::Sm)
		.leading(&icons::PLUS)
		.view(t)
		.on_press(move |s: &mut S| emit(s, ApplicationsEvent::Add))
}

fn application_row<S: 'static>(
	t: &Tokens,
	app: &Application,
	can_connect: bool,
	language: Language,
	emit: fn(&mut S, ApplicationsEvent),
) -> El {
	let name = app.display_name.unwrap_or(app.name);
	let title_style =
		if app.display_name.is_some() { TEXT_SM_MEDIUM } else { mono(TEXT_SM_MEDIUM) };
	let mut reading = col()
		.grow(1.0)
		.min_w(0.0)
		.gap(SPACING * 0.5)
		.child(text(name.to_owned()).font(title_style).color(t.foreground).truncate());
	let mut state = row().h(SPACING * 4.0).min_w(0.0).gap(SPACING * 1.5).center_y();
	if let Some(connection) = app.connection {
		let dot = if connection == Connection::Connecting { skeleton(t) } else { el() };
		state = state.child(round(dot.size(DOT, DOT).fill(connection.dot(t)), DOT)).child(
			text(say(connection.state(), language).to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.truncate(),
		);
	}
	reading = reading.child(state);
	let reason = (app.connection == Some(Connection::Failed))
		.then(|| app.reason.as_ref().and_then(|reason| reason.read(language)))
		.flatten();
	if let Some(reason) = reason {
		reading = reading.child(
			text(reason).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere().max_lines(2),
		);
	}
	let mut lane = row().w(ACTION_LANE.0).h(ACTION_LANE.1).center_y().justify_end();
	if let Some((label, row_label, variant)) = app.connection.and_then(Connection::action)
		&& can_connect
	{
		let connected = app.name.to_owned();
		lane = lane.child(
			Button::new(say(label, language))
				.variant(variant)
				.size(ButtonSize::Xs)
				.view(t)
				.label(fill(row_label, language, &[("name", name)]))
				.on_press(move |s: &mut S| emit(s, ApplicationsEvent::Connect(connected.clone()))),
		);
	}
	let opened = app.name.to_owned();
	let line = row()
		.w_full()
		.gap(SPACING * 3.0)
		.center_y()
		.key(format!("application-{}", app.name))
		.role("button")
		.label(fill(bots::applications::OPEN, language, &[("name", name)]))
		.child(mark(t, app.mark, MarkSize::Md))
		.child(reading)
		.child(lane)
		.child(icon(&icons::CHEVRON_RIGHT, SPACING * 4.0).color(t.muted_foreground).a11y_hidden());
	let line = outlined(t, inset(line, SPACING * 2.5, SPACING * 3.0, SPACING * 3.0), RADIUS_XL);
	let paint = Paint {
		fill: t.muted.alpha(0.0),
		ink: t.foreground,
		hover_fill: t.muted,
		hover_ink: t.foreground,
	};
	kit_ring(t, paint.apply(line).focusable(true).cursor(Cursor::Pointer))
		.on_press(move |s: &mut S| emit(s, ApplicationsEvent::Open(opened.clone())))
}
