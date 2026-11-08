use std::rc::Rc;

use rune::{
	Align, Color, Cursor, El, Icon, Key as KeyName, PointerPress, Side, Span, TextStyle, col, el,
	icon, rich, row, spacer, text,
};

use crate::avatar::{Activity, Face, Motion};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::context_menu::{Mark, MenuItem, MenuRow, wired_context_menu, wired_submenu};
use crate::primitives::skeleton::skeleton;
use crate::primitives::{FOCUS_RING_WIDTH, instant, ring_tint, tight};
use crate::strings::{Key, Language, chat};
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_LG, RADIUS_SM, SPACING, TEXT_10_MEDIUM, TEXT_11, TEXT_BUBBLE,
	TEXT_COMPACT_SEMIBOLD, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MissionState {
	Working,
	WaitingBot,
	WaitingHuman,
	ReadyToMerge,
	Failed,
	Done,
	Closed,
	Unrecognised,
}

impl MissionState {
	pub const ALL: [MissionState; 8] = [
		MissionState::Working,
		MissionState::WaitingBot,
		MissionState::WaitingHuman,
		MissionState::ReadyToMerge,
		MissionState::Failed,
		MissionState::Done,
		MissionState::Closed,
		MissionState::Unrecognised,
	];

	pub fn parse(state: &str) -> MissionState {
		match state {
			"working" => MissionState::Working,
			"waiting_bot" => MissionState::WaitingBot,
			"waiting_human" => MissionState::WaitingHuman,
			"ready_to_merge" => MissionState::ReadyToMerge,
			"failed" => MissionState::Failed,
			"done" => MissionState::Done,
			"closed" => MissionState::Closed,
			_ => MissionState::Unrecognised,
		}
	}

	fn word(self) -> Option<Key> {
		match self {
			MissionState::WaitingHuman => Some(chat::missions::state::WAITING_HUMAN),
			MissionState::ReadyToMerge => Some(chat::missions::state::READY_TO_MERGE),
			MissionState::Failed => Some(chat::missions::state::FAILED),
			MissionState::Done => Some(chat::missions::state::DONE),
			MissionState::Closed => Some(chat::missions::state::CLOSED),
			MissionState::Working | MissionState::WaitingBot | MissionState::Unrecognised => None,
		}
	}

	fn mark(self, t: &Tokens) -> Option<(&'static Icon, Color)> {
		match self {
			MissionState::WaitingHuman => Some((&icons::BELL, t.warning)),
			MissionState::ReadyToMerge => Some((&icons::CHECK, t.bot_badge_done)),
			MissionState::Failed => Some((&icons::ERROR, t.bot_badge_failed)),
			MissionState::Done => Some((&icons::SUCCESS, t.bot_badge_done)),
			MissionState::Closed => Some((&icons::CLOSE, t.muted_foreground)),
			MissionState::Working | MissionState::WaitingBot | MissionState::Unrecognised => None,
		}
	}

	fn row_dot(self, t: &Tokens) -> Option<Color> {
		match self {
			MissionState::WaitingHuman => Some(t.warning),
			MissionState::ReadyToMerge => Some(t.bot_badge_done),
			MissionState::Failed => Some(t.bot_badge_failed),
			_ => None,
		}
	}

	fn avatar_dot(self, t: &Tokens) -> Option<Color> {
		(self == MissionState::WaitingHuman).then_some(t.warning)
	}

	pub fn is_closed(self) -> bool {
		matches!(self, MissionState::Done | MissionState::Failed | MissionState::Closed)
	}

	fn runs_an_agent(self) -> bool {
		matches!(self, MissionState::Working | MissionState::WaitingBot)
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bot<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub title: &'a str,
	pub hue: Option<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Ticket<'a> {
	pub platform: &'a str,
	pub external_id: &'a str,
	pub title: &'a str,
	pub url: &'a str,
}

impl Ticket<'_> {
	fn is_named(&self) -> bool {
		!self.external_id.is_empty() || !self.title.is_empty()
	}

	fn is_ticketed(&self) -> bool {
		!self.platform.is_empty() || self.is_named()
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Status<'a> {
	pub text: &'a str,
	pub written_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ToolCall<'a> {
	pub tool: &'a str,
	pub target: &'a str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PullRequest<'a> {
	pub url: &'a str,
	pub number: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Mission<'a> {
	pub id: &'a str,
	pub bot: Bot<'a>,
	pub objective: &'a str,
	pub ticket: Ticket<'a>,
	pub tools: &'a [&'a str],
	pub state: MissionState,
	pub is_working: bool,
	pub is_closed: bool,
	pub timestamp: &'a str,
	pub now: Option<i64>,
	pub clock_ms: f64,
	pub status: Option<Status<'a>>,
	pub commits_ahead: u32,
	pub pull_request: Option<PullRequest<'a>>,
	pub last_activity: Option<ToolCall<'a>>,
}

impl<'a> Mission<'a> {
	fn shown_status(&self) -> Option<(Status<'a>, i64)> {
		let status = self.status.filter(|status| !status.text.trim().is_empty())?;
		Some((status, self.now?))
	}

	fn live_activity(&self) -> Option<ToolCall<'a>> {
		self.last_activity.filter(|_| self.is_working)
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CopyKind {
	IssueId,
	Branch,
	PullRequestUrl,
	WorkspacePath,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuSource {
	Card,
	Row,
}

impl MenuSource {
	fn key(self, mission: &str) -> String {
		match self {
			MenuSource::Card => format!("mission-card-{mission}"),
			MenuSource::Row => format!("mission-row-{mission}"),
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuAction {
	Open,
	OpenPullRequest,
	MessageAgent,
	StopAgent,
	Answer,
	Close,
	Reopen,
}

#[derive(Clone, Debug, PartialEq)]
pub enum MissionsEvent {
	Open { mission: String, conversation: Option<String> },
	OpenUrl(String),
	Back,
	ToggleEarlierToday,
	MenuRequested { mission: String, source: MenuSource, at: PointerPress },
	MenuChosen { mission: String, action: MenuAction },
	CopyChoicesShown { mission: String, is_shown: bool },
	MenuCopied { mission: String, kind: CopyKind },
	MenuDismissed,
}

pub type Emit<S> = Rc<dyn Fn(&mut S, MissionsEvent)>;

fn emitting<S: 'static>(control: El, emit: &Emit<S>, event: MissionsEvent) -> El {
	let emit = Rc::clone(emit);
	control.on_press(move |s: &mut S| emit(s, event.clone()))
}

fn requesting_menu<S: 'static>(
	control: El,
	emit: &Emit<S>,
	mission: &str,
	source: MenuSource,
) -> El {
	let (emit, mission) = (Rc::clone(emit), mission.to_owned());
	control.on_secondary_press(move |s: &mut S, at, _| {
		emit(s, MissionsEvent::MenuRequested { mission: mission.clone(), source, at })
	})
}

fn on_arrow<S: 'static>(control: El, emit: &Emit<S>, arrow: KeyName, event: MissionsEvent) -> El {
	let emit = Rc::clone(emit);
	control.on_key(move |s: &mut S, key: &rune::KeyEvent, _| {
		let is_arrow = key.key == arrow;
		if is_arrow {
			emit(s, event.clone());
		}
		is_arrow
	})
}

fn filled(key: Key, language: Language, values: &[(&str, &str)]) -> String {
	values.iter().fold(key.text(language).to_owned(), |line, (name, value)| {
		line.replace(&format!("{{{{{name}}}}}"), value)
	})
}

const RELATIVE_UNITS: [(&str, i64); 6] = [
	("year", 31_536_000_000),
	("month", 2_592_000_000),
	("week", 604_800_000),
	("day", 86_400_000),
	("hour", 3_600_000),
	("minute", 60_000),
];

pub fn relative_time(at: i64, now: i64) -> String {
	let elapsed = at - now;
	for (unit, span) in RELATIVE_UNITS {
		if elapsed.abs() < span {
			continue;
		}
		let count = (elapsed as f64 / span as f64 + 0.5).floor() as i64;
		let is_clock_unit = unit == "hour" || unit == "minute";
		return match (count, unit) {
			(-1, "day") => "yesterday".to_owned(),
			(1, "day") => "tomorrow".to_owned(),
			(-1, _) if !is_clock_unit => format!("last {unit}"),
			(1, _) if !is_clock_unit => format!("next {unit}"),
			(count, _) if count < 0 => format!("{} {unit}{} ago", -count, plural(-count)),
			(count, _) => format!("in {count} {unit}{}", plural(count)),
		};
	}
	"now".to_owned()
}

fn plural(count: i64) -> &'static str {
	if count == 1 { "" } else { "s" }
}

fn mark_key(name: &str) -> String {
	name.trim().to_lowercase()
}

fn named_tool_mark(tool: &str) -> Option<&'static Icon> {
	match mark_key(tool).as_str() {
		"github" => Some(&icons::GITHUB),
		"paper" => Some(&icons::PAPER),
		"superset" => Some(&icons::SUPERSET),
		_ => None,
	}
}

fn tool_glyph(tool: &str) -> &'static Icon {
	named_tool_mark(tool).unwrap_or(&icons::TOOL)
}

fn platform_mark(platform: &str) -> (&'static Icon, bool) {
	match mark_key(platform).as_str() {
		"github" => (&icons::GITHUB, true),
		"linear" => (&icons::LINEAR, true),
		_ => (&icons::BOOKMARK, false),
	}
}

fn agent_tool<'a>(tools: &[&'a str]) -> Option<&'a str> {
	tools.iter().copied().find(|tool| named_tool_mark(tool).is_some())
}

const TOOL_MARK: f32 = SPACING * 4.0;
const PILL_HEIGHT: f32 = SPACING * 5.0;
const PILL_MARK: f32 = SPACING * 3.0;
const ROW_GLYPH: f32 = 11.0;
const ROW_MARKS_GAP: f32 = 5.0;
const STAMP: TextStyle = TextStyle { line_height: SPACING * 5.0, ..TEXT_11 };
const SEPARATOR: &str = " · ";
const LINK_RING: f32 = 2.0;

pub fn tool_mark(t: &Tokens, tool: &str, side: f32) -> El {
	icon(tool_glyph(tool), side).color(t.muted_foreground).role("img").label(tool)
}

pub fn state_pill(t: &Tokens, language: Language, state: MissionState) -> Option<El> {
	let (glyph, ink) = state.mark(t)?;
	let word = state.word()?.text(language);
	let style = tight(TEXT_XS_MEDIUM);
	Some(
		row()
			.key(format!("mission-state-pill-{word}"))
			.h(PILL_HEIGHT)
			.px((PILL_HEIGHT - style.size) / 2.0)
			.gap(SPACING)
			.radius(PILL_HEIGHT / 2.0)
			.border(1.0, t.border)
			.center_y()
			.label(word)
			.child(icon(glyph, PILL_MARK).color(ink).a11y_hidden())
			.child(text(word.to_owned()).font(style).color(t.foreground)),
	)
}

fn link<S: 'static>(control: El, t: &Tokens, emit: &Emit<S>, url: &str) -> El {
	let control = control
		.role("link")
		.focusable(true)
		.cursor(Cursor::Pointer)
		.radius(RADIUS_SM)
		.focus_ring(LINK_RING, 0.0, t.ring);
	emitting(control, emit, MissionsEvent::OpenUrl(url.to_owned()))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkStyle {
	Plain,
	Underlined,
}

fn link_text(content: String, style: TextStyle, ink: Color, link_style: LinkStyle) -> El {
	let spans = match link_style {
		LinkStyle::Plain => Vec::new(),
		LinkStyle::Underlined => vec![Span::new(0, content.len()).underline(ink)],
	};
	rich(content, spans).font(style).color(ink)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TicketLayout {
	Wrap,
	Line,
}

pub fn ticket_line<S: 'static>(
	t: &Tokens,
	ticket: Ticket,
	layout: TicketLayout,
	link_style: LinkStyle,
	emit: &Emit<S>,
) -> El {
	let (glyph, _) = platform_mark(ticket.platform);
	let link_style = if ticket.url.is_empty() { LinkStyle::Plain } else { link_style };
	let mut line = match layout {
		TicketLayout::Wrap => row()
			.w_full()
			.flex_wrap()
			.gaps(0.0, SPACING * 1.5)
			.center_y()
			.child(icon(glyph, SPACING * 3.0).color(t.muted_foreground)),
		TicketLayout::Line => row()
			.shrink()
			.min_w(0.0)
			.gap(SPACING * 1.5)
			.center_y()
			.child(icon(glyph, ROW_GLYPH).color(t.muted_foreground)),
	};
	if !ticket.external_id.is_empty() {
		let ink = if layout == TicketLayout::Line { t.foreground } else { t.muted_foreground };
		line =
			line.child(link_text(ticket.external_id.to_owned(), TEXT_XS_MEDIUM, ink, link_style));
	}
	if !ticket.title.is_empty() {
		let title = link_text(ticket.title.to_owned(), TEXT_XS, t.muted_foreground, link_style);
		line = line.child(match layout {
			TicketLayout::Wrap => title.wrap_anywhere().shrink().min_w(0.0),
			TicketLayout::Line => title.truncate().shrink().min_w(0.0),
		});
	}
	let label = [ticket.external_id, ticket.title]
		.into_iter()
		.filter(|part| !part.is_empty())
		.collect::<Vec<_>>()
		.join(" ");
	let line = line.label(label);
	if ticket.url.is_empty() { line } else { link(line, t, emit, ticket.url) }
}

pub fn pull_request_link<S: 'static>(
	t: &Tokens,
	language: Language,
	pull_request: PullRequest,
	link_style: LinkStyle,
	emit: &Emit<S>,
) -> El {
	let number = pull_request.number.to_string();
	let shown = filled(chat::missions::pull_request::LABEL, language, &[("number", &number)]);
	let named = filled(chat::missions::pull_request::OPEN, language, &[("number", &number)]);
	let label = link_text(shown, TEXT_XS_MEDIUM, t.foreground, link_style);
	link(label, t, emit, pull_request.url).label(named)
}

pub fn host_link<S: 'static>(t: &Tokens, language: Language, url: &str, emit: &Emit<S>) -> El {
	let host = host_of(url);
	let named = filled(chat::missions::event::LINK, language, &[("host", host)]);
	link(text(host.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground), t, emit, url).label(named)
}

fn host_of(url: &str) -> &str {
	let Some((_, rest)) = url.split_once("://") else { return url };
	rest.split(['/', '?', '#']).next().unwrap_or(rest)
}

fn has_activity_line(commits_ahead: u32, pull_request: Option<PullRequest>) -> bool {
	commits_ahead > 0 || pull_request.is_some()
}

fn commits_ahead_line(language: Language, count: u32) -> String {
	let key = if count == 1 {
		chat::missions::activity::COMMITS_AHEAD_ONE
	} else {
		chat::missions::activity::COMMITS_AHEAD_OTHER
	};
	filled(key, language, &[("count", &count.to_string())])
}

pub fn activity_line<S: 'static>(
	t: &Tokens,
	language: Language,
	commits_ahead: u32,
	pull_request: Option<PullRequest>,
	link_style: LinkStyle,
	emit: &Emit<S>,
) -> El {
	let mut line = row().h(SPACING * 4.0).min_w(0.0).center_y();
	if commits_ahead > 0 {
		line = line.child(
			text(commits_ahead_line(language, commits_ahead))
				.font(TEXT_XS)
				.color(t.muted_foreground),
		);
	}
	if let Some(pull_request) = pull_request {
		if commits_ahead > 0 {
			line = line.child(text(SEPARATOR).font(TEXT_XS).color(t.muted_foreground));
		}
		line = line.child(pull_request_link(t, language, pull_request, link_style, emit));
	}
	line
}

fn live_activity(t: &Tokens, call: ToolCall) -> El {
	text(format!("{}{SEPARATOR}{}", call.tool, call.target))
		.font(TEXT_XS)
		.color(t.muted_foreground)
		.truncate()
		.shrink()
		.min_w(0.0)
}

fn status_time(t: &Tokens, status: Status, now: i64) -> El {
	text(relative_time(status.written_at, now)).font(TEXT_XS).color(t.muted_foreground)
}

const AVATAR_DOT_SHARE: f32 = 0.34;
const AVATAR_DOT_MAX: f32 = SPACING * 4.0;
const AVATAR_DOT_INSET: f32 = 0.06;
const AVATAR_DOT_RING: f32 = 2.0;
const ROW_DOT: f32 = SPACING * 2.0;

fn bot_avatar(t: &Tokens, bot: Bot, side: f32, working: Option<f64>, dot: Option<Color>) -> El {
	let motion = match working {
		Some(at_ms) => Motion::Running { activity: Activity::Working, at_ms },
		None => Motion::Still,
	};
	let face = Face { name: bot.name, hue: bot.hue, motion }.draw(side, t);
	let Some(dot) = dot else { return face };
	let badge = (side * AVATAR_DOT_SHARE).min(AVATAR_DOT_MAX);
	let edge = side - side * AVATAR_DOT_INSET - badge;
	el().size(side, side).child(face).child(
		el().size(badge, badge)
			.radius(badge / 2.0)
			.fill(dot)
			.outline(AVATAR_DOT_RING, 0.0, t.sidebar)
			.absolute(edge, edge)
			.a11y_hidden(),
	)
}

fn working_clock(mission: &Mission) -> Option<f64> {
	mission.is_working.then_some(mission.clock_ms)
}

const ROW_AVATAR: f32 = SPACING * 8.0;
const ROW_STACK: f32 = SPACING * 9.0;
const ROW_INSET: f32 = SPACING * 1.5;
const ROW_END_INSET: f32 = SPACING * 3.0;
const ROW_GAP: f32 = SPACING * 2.5;
const ROW_STAMP: f32 = SPACING * 11.0;
const ROW_PREVIEW_END: f32 = SPACING * 3.5;
const ROW_PRESS_SCALE: f32 = 0.98;

fn row_preview(t: &Tokens, language: Language, mission: &Mission) -> El {
	let (platform_glyph, is_named) = platform_mark(mission.ticket.platform);
	let ticket_part = if is_named { mission.ticket.external_id } else { mission.ticket.title };
	let state_word = mission.state.word().map(|key| key.text(language));
	let parts: Vec<(&str, bool)> = [
		(ticket_part, is_named),
		(mission.bot.name, false),
		(state_word.unwrap_or_default(), false),
	]
	.into_iter()
	.filter(|(part, _)| !part.is_empty())
	.collect();
	let mut line = String::new();
	let mut spans = Vec::new();
	for (at, (part, is_identifier)) in parts.iter().enumerate() {
		if at > 0 {
			line.push_str(SEPARATOR);
		}
		if *is_identifier {
			spans.push(Span::new(line.len(), line.len() + part.len()).weight(500.0));
		}
		line.push_str(part);
	}
	if let Some((status, _)) = mission.shown_status() {
		if !line.is_empty() {
			line.push_str(SEPARATOR);
		}
		line.push_str(status.text);
	}
	let tool = agent_tool(mission.tools).or(mission.tools.first().copied());
	let mut preview = row().h(SPACING * 4.0).min_w(0.0).grow(1.0).shrink().center_y();
	if tool.is_some() || mission.ticket.is_ticketed() {
		let mut marks = row().gap(ROW_MARKS_GAP).mr(ROW_MARKS_GAP).center_y();
		if let Some(tool) = tool {
			marks = marks.child(tool_mark(t, tool, ROW_GLYPH));
		}
		if mission.ticket.is_ticketed() {
			marks = marks.child(icon(platform_glyph, ROW_GLYPH).color(t.muted_foreground));
		}
		preview = preview.child(marks);
	}
	preview.child(
		rich(line, spans).font(TEXT_XS).color(t.muted_foreground).truncate().shrink().min_w(0.0),
	)
}

pub fn mission_row<S: 'static>(
	t: &Tokens,
	language: Language,
	mission: &Mission,
	is_active: bool,
	emit: &Emit<S>,
	conversation: Option<&str>,
) -> El {
	let ink =
		if is_active { t.sidebar_accent_foreground } else { faded(t.sidebar_foreground, 0.7) };
	let name_ink = if mission.state == MissionState::Done { t.muted_foreground } else { ink };
	let name = text(mission.objective.to_owned())
		.font(TEXT_SM_MEDIUM)
		.color(name_ink)
		.group_color(if mission.state == MissionState::Done {
			t.muted_foreground
		} else {
			t.sidebar_accent_foreground
		})
		.truncate()
		.shrink()
		.min_w(0.0)
		.grow(1.0);
	let mut name_line = row().h(SPACING * 5.0).min_w(0.0).gap(SPACING * 1.5).center_y().child(name);
	name_line = name_line.child(
		text(mission.timestamp.to_owned())
			.font(STAMP)
			.color(t.muted_foreground)
			.align(rune::Align::End)
			.truncate()
			.w(ROW_STAMP),
	);
	let dot_slot = row().w(ROW_PREVIEW_END).h(SPACING * 4.0).justify_end().center_y();
	let dot_slot = match mission.state.row_dot(t) {
		Some(dot) => dot_slot
			.child(el().size(ROW_DOT, ROW_DOT).radius(ROW_DOT / 2.0).fill(dot).a11y_hidden()),
		None => dot_slot,
	};
	let preview_line = row()
		.h(SPACING * 4.0)
		.min_w(0.0)
		.center_y()
		.child(row_preview(t, language, mission))
		.child(dot_slot);
	let mut stack = col()
		.min_h(ROW_STACK)
		.min_w(0.0)
		.grow(1.0)
		.shrink()
		.justify_center()
		.child(name_line)
		.child(preview_line);
	if has_activity_line(mission.commits_ahead, mission.pull_request) {
		stack = stack.child(activity_line(
			t,
			language,
			mission.commits_ahead,
			mission.pull_request,
			LinkStyle::Plain,
			emit,
		));
	}
	let mut control = row()
		.key(format!("mission-row-{}", mission.id))
		.w_full()
		.pl(ROW_INSET)
		.py(ROW_INSET)
		.pr(ROW_END_INSET)
		.gap(ROW_GAP)
		.radius(RADIUS_LG)
		.center_y()
		.role("button")
		.label(mission.objective)
		.child(bot_avatar(t, mission.bot, ROW_AVATAR, working_clock(mission), None))
		.child(stack)
		.hover(t.sidebar_accent)
		.press(t.sidebar_accent)
		.press_scale(ROW_PRESS_SCALE)
		.hover_group();
	if is_active {
		control = control.fill(t.sidebar_accent).focus_selected(true);
	}
	let control = instant(control).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		t.sidebar_ring,
	);
	emitting(
		requesting_menu(control, emit, mission.id, MenuSource::Row),
		emit,
		MissionsEvent::Open {
			mission: mission.id.to_owned(),
			conversation: conversation.map(str::to_owned),
		},
	)
}

const CARD_INSET: f32 = SPACING * 4.5;
const CARD_MAX_WIDTH: f32 = SPACING * 145.0;
const CARD_PRESS_SCALE: f32 = 0.98;
const BUBBLE_SHARE: f32 = 0.85;
const AUTHOR_AVATAR: f32 = SPACING * 5.0;

pub fn soft_bubble(t: &Tokens, content: El) -> El {
	col()
		.max_w(CARD_MAX_WIDTH)
		.min_w(0.0)
		.shrink()
		.padding(CARD_INSET)
		.gap(SPACING * 2.0)
		.radius(RADIUS_BUBBLE)
		.fill(t.bubble)
		.child(content)
}

fn title_badge(t: &Tokens, title: &str) -> El {
	row()
		.h(SPACING * 5.0)
		.px(SPACING * 1.5)
		.radius(RADIUS_SM)
		.fill(faded(t.foreground, 0.08))
		.center_y()
		.child(text(title.to_owned()).font(TEXT_XS).color(t.soft_foreground).truncate())
}

pub fn author_line(t: &Tokens, bot: Bot, avatar: El) -> El {
	let mut line = row()
		.h(SPACING * 5.0)
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(row().size(AUTHOR_AVATAR, AUTHOR_AVATAR).center().child(avatar))
		.child(
			text(bot.name.to_owned())
				.font(TEXT_COMPACT_SEMIBOLD)
				.color(t.primary)
				.truncate()
				.shrink()
				.min_w(0.0),
		);
	if !bot.title.is_empty() {
		line = line.child(title_badge(t, bot.title));
	}
	line
}

fn title_row(t: &Tokens, language: Language, mission: &Mission) -> Option<El> {
	let pill = state_pill(t, language, mission.state);
	if mission.tools.is_empty() && pill.is_none() && mission.timestamp.is_empty() {
		return None;
	}
	let mut line = row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.children(mission.tools.iter().map(|tool| tool_mark(t, tool, TOOL_MARK)));
	if let Some(pill) = pill {
		line = line.child(pill);
	}
	Some(
		line.child(spacer())
			.child(text(mission.timestamp.to_owned()).font(STAMP).color(t.muted_foreground)),
	)
}

fn card_body<S: 'static>(t: &Tokens, language: Language, mission: &Mission, emit: &Emit<S>) -> El {
	let mut body = col().w_full().min_w(0.0).gap(SPACING * 2.0);
	if let Some(title_row) = title_row(t, language, mission) {
		body = body.child(title_row);
	}
	let objective_ink = if mission.is_closed { t.muted_foreground } else { t.foreground };
	let mut lead = col().w_full().min_w(0.0).gap(SPACING).child(
		text(mission.objective.to_owned()).font(TEXT_BUBBLE).color(objective_ink).wrap_anywhere(),
	);
	if mission.ticket.is_named() {
		lead = lead.child(ticket_line(
			t,
			mission.ticket,
			TicketLayout::Wrap,
			LinkStyle::Underlined,
			emit,
		));
	}
	if let Some(call) = mission.live_activity() {
		lead = lead.child(live_activity(t, call));
	}
	body = body.child(lead);
	if let Some((status, now)) = mission.shown_status() {
		body = body.child(
			col()
				.w_full()
				.min_w(0.0)
				.child(
					text(status.text.to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.wrap_anywhere()
						.max_lines(3),
				)
				.child(status_time(t, status, now)),
		);
	}
	if has_activity_line(mission.commits_ahead, mission.pull_request) {
		body = body.child(activity_line(
			t,
			language,
			mission.commits_ahead,
			mission.pull_request,
			LinkStyle::Underlined,
			emit,
		));
	}
	body
}

pub fn mission_card<S: 'static>(
	t: &Tokens,
	language: Language,
	mission: &Mission,
	emit: &Emit<S>,
) -> El {
	bubble_lane(card_bubble(t, language, mission, None, emit))
}

fn card_bubble<S: 'static>(
	t: &Tokens,
	language: Language,
	mission: &Mission,
	foot: Option<El>,
	emit: &Emit<S>,
) -> El {
	let mut bubble = soft_bubble(t, card_body(t, language, mission, emit))
		.key(format!("mission-card-{}", mission.id))
		.role("button")
		.label(filled(chat::missions::card::OPEN, language, &[("objective", mission.objective)]))
		.hover(t.bubble_hover)
		.press(t.bubble_hover)
		.press_scale(CARD_PRESS_SCALE);
	if let Some(foot) = foot {
		bubble = bubble.child(foot);
	}
	let bubble =
		instant(bubble).focusable(true).cursor(Cursor::Pointer).focus_ring(LINK_RING, 0.0, t.ring);
	emitting(
		requesting_menu(bubble, emit, mission.id, MenuSource::Card),
		emit,
		MissionsEvent::Open { mission: mission.id.to_owned(), conversation: None },
	)
}

fn bubble_lane(bubble: El) -> El {
	row().w_frac(BUBBLE_SHARE).min_w(0.0).items_start().child(bubble)
}

pub fn turn_lane(bubble: El) -> El {
	row().w_full().max_w(CARD_MAX_WIDTH).min_w(0.0).items_start().child(bubble)
}

pub fn mission_turn<S: 'static>(
	t: &Tokens,
	language: Language,
	mission: &Mission,
	emit: &Emit<S>,
) -> El {
	let avatar = bot_avatar(
		t,
		mission.bot,
		AUTHOR_AVATAR,
		working_clock(mission),
		mission.state.avatar_dot(t),
	);
	let foot = author_line(t, mission.bot, avatar);
	col()
		.w_full()
		.items_start()
		.role("article")
		.label(chat::transcript::message::MISSION.text(language))
		.child(turn_lane(card_bubble(t, language, mission, Some(foot), emit)))
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Header<'a> {
	pub bot: Bot<'a>,
	pub objective: &'a str,
	pub ticket: Ticket<'a>,
	pub tools: &'a [&'a str],
	pub state: MissionState,
	pub is_working: bool,
	pub clock_ms: f64,
	pub opened_at: i64,
	pub now: i64,
	pub status: Option<Status<'a>>,
	pub commits_ahead: u32,
	pub pull_request: Option<PullRequest<'a>>,
}

const HEADER_HEIGHT: f32 = SPACING * 12.0;
const HEADER_START: f32 = SPACING * 1.5;
const HEADER_END: f32 = SPACING * 2.5;
const HEADER_AVATAR: f32 = SPACING * 6.0;
const BAND_HEIGHT: f32 = SPACING * 8.5;
const BAND_START: f32 = SPACING * 12.5;
const BAND_END: f32 = SPACING * 4.0;
const BAND_MARK: f32 = SPACING * 3.0;
const ACTIVITY_BAND_HEIGHT: f32 = SPACING * 7.0;
const OPENED_STAMP: TextStyle = TextStyle { line_height: SPACING * 4.0, ..TEXT_11 };

fn back_button<S: 'static>(t: &Tokens, language: Language, emit: &Emit<S>) -> El {
	let back = Button::icon(&icons::PREVIOUS, chat::missions::header::BACK.text(language))
		.variant(ButtonVariant::Ghost)
		.size(ButtonSize::Icon)
		.view(t);
	emitting(back, emit, MissionsEvent::Back)
}

fn app_header(leading: El, trailing: Option<El>, t: &Tokens) -> El {
	let mut bar = row()
		.w_full()
		.h(HEADER_HEIGHT)
		.pt(1.0)
		.pl(HEADER_START)
		.pr(HEADER_END)
		.gap(SPACING * 3.0)
		.center_y()
		.child(leading);
	if let Some(trailing) = trailing {
		bar = bar.child(spacer()).child(row().gap(SPACING * 2.0).center_y().child(trailing));
	}
	col().w_full().child(bar).child(rule(t))
}

fn rule(t: &Tokens) -> El {
	el().w_full().h(1.0).fill(t.border)
}

fn band_rule(t: &Tokens) -> El {
	el().size(1.0, SPACING * 3.0).fill(t.border).a11y_hidden()
}

fn band(height: f32) -> El {
	row().w_full().h(height).pl(BAND_START).pr(BAND_END).gap(SPACING * 2.0).center_y()
}

pub fn mission_header<S: 'static>(
	t: &Tokens,
	language: Language,
	header: &Header,
	emit: &Emit<S>,
) -> El {
	let avatar = bot_avatar(
		t,
		header.bot,
		HEADER_AVATAR,
		header.is_working.then_some(header.clock_ms),
		header.state.avatar_dot(t),
	);
	let leading = row()
		.min_w(0.0)
		.shrink()
		.gap(SPACING * 2.0)
		.center_y()
		.child(back_button(t, language, emit))
		.child(avatar)
		.child(
			text(header.objective.to_owned())
				.font(TEXT_SM_MEDIUM)
				.color(t.foreground)
				.truncate()
				.shrink()
				.min_w(0.0),
		);
	let top = app_header(leading, state_pill(t, language, header.state), t);
	let has_ticket = header.ticket.is_named();
	let has_tools = !header.tools.is_empty();
	let mut ticket_band = band(BAND_HEIGHT);
	if has_ticket {
		ticket_band = ticket_band.child(ticket_line(
			t,
			header.ticket,
			TicketLayout::Line,
			LinkStyle::Plain,
			emit,
		));
	}
	if has_ticket && has_tools {
		ticket_band = ticket_band.child(band_rule(t));
	}
	if has_tools {
		ticket_band = ticket_band.child(
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.role("list")
				.label(chat::missions::header::TOOLS.text(language))
				.children(header.tools.iter().map(|tool| tool_mark(t, tool, BAND_MARK))),
		);
	}
	if let Some(status) = header.status.filter(|status| !status.text.trim().is_empty()) {
		if has_ticket || has_tools {
			ticket_band = ticket_band.child(band_rule(t));
		}
		ticket_band = ticket_band.child(
			row()
				.min_w(0.0)
				.shrink()
				.gap(SPACING * 1.5)
				.center_y()
				.child(
					text(status.text.to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.truncate()
						.shrink()
						.min_w(0.0)
						.help_when_truncated(status.text),
				)
				.child(status_time(t, status, header.now)),
		);
	}
	let opened = filled(
		chat::missions::header::OPENED_AT,
		language,
		&[("time", &relative_time(header.opened_at, header.now))],
	);
	ticket_band = ticket_band
		.child(spacer())
		.child(text(opened).font(OPENED_STAMP).color(t.muted_foreground));
	let mut whole = col().w_full().child(top).child(ticket_band).child(rule(t));
	if has_activity_line(header.commits_ahead, header.pull_request) {
		whole = whole
			.child(band(ACTIVITY_BAND_HEIGHT).child(activity_line(
				t,
				language,
				header.commits_ahead,
				header.pull_request,
				LinkStyle::Plain,
				emit,
			)))
			.child(rule(t));
	}
	whole
}

const SKELETON_BAR: f32 = SPACING * 3.0;
const SKELETON_FAINT_BAR: f32 = SPACING * 2.25;
const SKELETON_FAINT_SHARE: f32 = 0.6;

pub static SKELETON_HEXAGON: Icon = Icon {
	name: "kit-skeleton-hexagon",
	view: 401.0,
	body: r#"<path fill="currentColor" d="M 393.14 171.16 A 58.68 58.68 0 0 1 393.14 229.84 L 322.23 352.66 A 58.68 58.68 0 0 1 271.41 382.00 L 129.59 382.00 A 58.68 58.68 0 0 1 78.77 352.66 L 7.86 229.84 A 58.68 58.68 0 0 1 7.86 171.16 L 78.77 48.34 A 58.68 58.68 0 0 1 129.59 19.00 L 271.41 19.00 A 58.68 58.68 0 0 1 322.23 48.34 Z"/>"#,
};

fn bar(t: &Tokens, width: f32) -> El {
	el().size(width, SKELETON_BAR).radius(SKELETON_BAR / 2.0).fill(t.border)
}

fn faint_bar(t: &Tokens, width: f32) -> El {
	el().size(width, SKELETON_FAINT_BAR)
		.radius(SKELETON_FAINT_BAR / 2.0)
		.fill(faded(t.border, SKELETON_FAINT_SHARE))
}

fn hexagon(t: &Tokens, side: f32) -> El {
	icon(&SKELETON_HEXAGON, side).color(t.border)
}

fn pulsing(t: &Tokens, shapes: El) -> El {
	skeleton(t).fill(t.border.alpha(0.0)).radius(0.0).child(shapes)
}

pub fn mission_header_skeleton<S: 'static>(t: &Tokens, language: Language, emit: &Emit<S>) -> El {
	let leading =
		row().min_w(0.0).gap(SPACING * 2.0).center_y().child(back_button(t, language, emit)).child(
			pulsing(
				t,
				row()
					.gap(SPACING * 2.0)
					.center_y()
					.child(hexagon(t, HEADER_AVATAR))
					.child(bar(t, SPACING * 48.0)),
			),
		);
	let ticket_band = band(BAND_HEIGHT).child(
		pulsing(
			t,
			row()
				.w_full()
				.gap(SPACING * 2.0)
				.center_y()
				.child(bar(t, SPACING * 40.0))
				.child(spacer())
				.child(faint_bar(t, SPACING * 16.0)),
		)
		.grow(1.0),
	);
	col()
		.w_full()
		.role("status")
		.child(app_header(leading, None, t))
		.child(ticket_band.grow(0.0).min_h(BAND_HEIGHT))
		.child(rule(t))
}

const EVENT_GUTTER: f32 = SPACING * 10.0;
const EVENT_GUTTER_MARK: f32 = 18.0;
const EVENT_DOT: f32 = SPACING * 1.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventKind {
	Opened,
	Note,
	AgentAsked,
	Answered,
	Escalated,
	Ready,
	ChecksFailed,
	Failed,
	Closed,
	Dismissed,
	Reopened,
}

impl EventKind {
	pub const ALL: [EventKind; 11] = [
		EventKind::Opened,
		EventKind::Note,
		EventKind::AgentAsked,
		EventKind::Answered,
		EventKind::Escalated,
		EventKind::Ready,
		EventKind::ChecksFailed,
		EventKind::Failed,
		EventKind::Closed,
		EventKind::Dismissed,
		EventKind::Reopened,
	];

	pub fn word(self) -> &'static str {
		match self {
			EventKind::Opened => "opened",
			EventKind::Note => "note",
			EventKind::AgentAsked => "agent asked",
			EventKind::Answered => "answered",
			EventKind::Escalated => "escalated",
			EventKind::Ready => "ready",
			EventKind::ChecksFailed => "checks failed",
			EventKind::Failed => "failed",
			EventKind::Closed => "closed",
			EventKind::Dismissed => "dismissed",
			EventKind::Reopened => "reopened",
		}
	}

	fn line(self) -> Key {
		use chat::missions::event::line;
		match self {
			EventKind::Opened => line::OPENED,
			EventKind::Note => line::NOTE,
			EventKind::AgentAsked => line::AGENT_ASKED,
			EventKind::Answered => line::ANSWERED,
			EventKind::Escalated => line::ESCALATED,
			EventKind::Ready => line::READY,
			EventKind::ChecksFailed => line::CHECKS_FAILED,
			EventKind::Failed => line::FAILED,
			EventKind::Closed => line::CLOSED,
			EventKind::Dismissed => line::DISMISSED,
			EventKind::Reopened => line::REOPENED,
		}
	}

	fn badge(self) -> Key {
		use chat::missions::event::kind;
		match self {
			EventKind::Opened => kind::OPENED,
			EventKind::Note => kind::NOTE,
			EventKind::AgentAsked => kind::AGENT_ASKED,
			EventKind::Answered => kind::ANSWERED,
			EventKind::Escalated => kind::ESCALATED,
			EventKind::Ready => kind::READY,
			EventKind::ChecksFailed => kind::CHECKS_FAILED,
			EventKind::Failed => kind::FAILED,
			EventKind::Closed => kind::CLOSED,
			EventKind::Dismissed => kind::DISMISSED,
			EventKind::Reopened => kind::REOPENED,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EventLink<'a> {
	pub url: &'a str,
	pub pull_request: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MissionEvent<'a> {
	pub id: &'a str,
	pub kind: EventKind,
	pub source: &'a str,
	pub created_at: i64,
	pub text: Option<&'a str>,
	pub link: Option<EventLink<'a>>,
}

struct EventFace {
	label: String,
	mark: Option<&'static Icon>,
}

fn event_face(language: Language, source: &str, tools: &[&str], bot: Option<Bot>) -> EventFace {
	use chat::missions::event::source as said_by;
	let named = |key: Key| EventFace {
		label: key.text(language).to_owned(),
		mark: Some(tool_glyph(source)),
	};
	match mark_key(source).as_str() {
		"bot" => EventFace {
			label: bot
				.map_or_else(|| said_by::BOT.text(language).to_owned(), |bot| bot.name.to_owned()),
			mark: None,
		},
		"agent-hook" => match agent_tool(tools) {
			Some(tool) => EventFace { label: tool.to_owned(), mark: Some(tool_glyph(tool)) },
			None => named(said_by::AGENT),
		},
		"human" | "person" => named(said_by::READER),
		"github" => named(said_by::GITHUB),
		_ => EventFace { label: source.to_owned(), mark: Some(tool_glyph(source)) },
	}
}

fn event_time(t: &Tokens, event: &MissionEvent, now: i64) -> El {
	text(relative_time(event.created_at, now)).font(tight(TEXT_XS)).color(t.muted_foreground)
}

fn event_link<S: 'static>(t: &Tokens, language: Language, link: EventLink, emit: &Emit<S>) -> El {
	match link.pull_request {
		Some(number) => pull_request_link(
			t,
			language,
			PullRequest { url: link.url, number },
			LinkStyle::Plain,
			emit,
		),
		None => host_link(t, language, link.url, emit),
	}
}

fn machine_line<S: 'static>(
	t: &Tokens,
	language: Language,
	event: &MissionEvent,
	label: &str,
	now: i64,
	emit: &Emit<S>,
) -> El {
	let dot = if event.kind == EventKind::Ready { t.success } else { t.muted_foreground };
	let style = tight(TEXT_XS);
	let mut line = row()
		.w_full()
		.h(SPACING * 5.0)
		.min_w(0.0)
		.px(SPACING)
		.gap(SPACING * 2.0)
		.center()
		.child(el().size(EVENT_DOT, EVENT_DOT).radius(EVENT_DOT / 2.0).fill(dot).a11y_hidden())
		.child(
			text(filled(event.kind.line(), language, &[("source", label)]))
				.font(style)
				.color(t.muted_foreground)
				.truncate()
				.shrink()
				.min_w(0.0),
		);
	if let Some(link) = event.link {
		line = line.child(event_link(t, language, link, emit));
	}
	line.child(event_time(t, event, now))
}

fn kind_badge(t: &Tokens, language: Language, kind: EventKind) -> El {
	let fill = if kind == EventKind::AgentAsked {
		faded(t.warning, 0.18)
	} else {
		faded(t.foreground, 0.1)
	};
	row().px(SPACING * 1.5).py(SPACING * 0.5).radius(SPACING * 2.5).fill(fill).child(
		text(kind.badge().text(language).to_owned())
			.font(tight(TEXT_10_MEDIUM))
			.color(faded(t.foreground, 0.8))
			.truncate(),
	)
}

fn event_gutter(t: &Tokens, mark: Option<&'static Icon>, bot: Option<Bot>) -> El {
	match mark {
		Some(glyph) => row()
			.size(EVENT_GUTTER, EVENT_GUTTER)
			.radius(EVENT_GUTTER / 2.0)
			.fill(t.muted)
			.center()
			.child(icon(glyph, EVENT_GUTTER_MARK).color(t.muted_foreground).a11y_hidden()),
		None => bot_avatar(
			t,
			bot.unwrap_or(Bot { id: "", name: "", title: "", hue: None }),
			EVENT_GUTTER,
			None,
			None,
		),
	}
}

pub fn event_row<S: 'static>(
	t: &Tokens,
	language: Language,
	event: &MissionEvent,
	tools: &[&str],
	bot: Option<Bot>,
	now: i64,
	emit: &Emit<S>,
) -> El {
	let face = event_face(language, event.source, tools, bot);
	let Some(said) = event.text else {
		return machine_line(t, language, event, &face.label, now, emit);
	};
	let heading = row()
		.min_w(0.0)
		.px(SPACING)
		.gap(SPACING * 1.5)
		.center_y()
		.child(
			text(face.label.clone())
				.font(tight(TEXT_XS_MEDIUM))
				.color(faded(t.foreground, 0.8))
				.truncate()
				.shrink()
				.min_w(0.0),
		)
		.child(kind_badge(t, language, event.kind))
		.child(event_time(t, event, now));
	let bubble = soft_bubble(
		t,
		text(said.to_owned()).font(TEXT_BUBBLE).color(t.bubble_foreground).wrap_anywhere(),
	);
	let bubble = bubble_lane(bubble);
	row()
		.w_full()
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.items_end()
		.child(event_gutter(t, face.mark, bot))
		.child(col().grow(1.0).shrink().min_w(0.0).gap(SPACING).child(heading).child(bubble))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MenuFacts {
	pub state: MissionState,
	pub has_pull_request: bool,
	pub has_branch: bool,
	pub has_workspace_path: bool,
}

impl MenuFacts {
	pub fn copy_kinds(self) -> Vec<CopyKind> {
		[
			(CopyKind::IssueId, true),
			(CopyKind::Branch, self.has_branch),
			(CopyKind::PullRequestUrl, self.has_pull_request),
			(CopyKind::WorkspacePath, self.has_workspace_path),
		]
		.into_iter()
		.filter_map(|(kind, shown)| shown.then_some(kind))
		.collect()
	}
}

fn copy_word(kind: CopyKind) -> Key {
	use chat::missions::menu::copy_kind;
	match kind {
		CopyKind::IssueId => copy_kind::ISSUE_ID,
		CopyKind::Branch => copy_kind::BRANCH,
		CopyKind::PullRequestUrl => copy_kind::PULL_REQUEST_URL,
		CopyKind::WorkspacePath => copy_kind::WORKSPACE_PATH,
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MenuEntry {
	Chosen(MenuAction),
	CopyChoices,
}

fn menu_entries(facts: MenuFacts) -> Vec<Option<MenuEntry>> {
	let mut entries = vec![Some(MenuEntry::Chosen(MenuAction::Open))];
	if facts.has_pull_request {
		entries.push(Some(MenuEntry::Chosen(MenuAction::OpenPullRequest)));
	}
	entries.push(Some(MenuEntry::CopyChoices));
	if facts.state.runs_an_agent() {
		entries.push(None);
		entries.push(Some(MenuEntry::Chosen(MenuAction::MessageAgent)));
		entries.push(Some(MenuEntry::Chosen(MenuAction::StopAgent)));
	}
	if facts.state == MissionState::WaitingHuman {
		entries.push(None);
		entries.push(Some(MenuEntry::Chosen(MenuAction::Answer)));
	}
	entries.push(None);
	entries.push(Some(MenuEntry::Chosen(if facts.state.is_closed() {
		MenuAction::Reopen
	} else {
		MenuAction::Close
	})));
	entries
}

fn entry_look(entry: MenuEntry) -> (Key, &'static Icon) {
	use chat::missions::menu;
	match entry {
		MenuEntry::Chosen(MenuAction::Open) => (menu::OPEN, &icons::ARROW_RIGHT),
		MenuEntry::Chosen(MenuAction::OpenPullRequest) => {
			(menu::OPEN_PULL_REQUEST, &icons::EXTERNAL_LINK)
		}
		MenuEntry::CopyChoices => (menu::COPY, &icons::COPY),
		MenuEntry::Chosen(MenuAction::MessageAgent) => (menu::MESSAGE_AGENT, &icons::MESSAGE),
		MenuEntry::Chosen(MenuAction::StopAgent) => (menu::STOP_AGENT, &icons::SQUARE),
		MenuEntry::Chosen(MenuAction::Answer) => (menu::ANSWER, &icons::REPLY),
		MenuEntry::Chosen(MenuAction::Close) => (menu::CLOSE, &icons::CLOSE),
		MenuEntry::Chosen(MenuAction::Reopen) => (menu::REOPEN, &icons::ROTATE_CW),
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OpenMenu<'a> {
	pub mission: &'a str,
	pub source: MenuSource,
	pub at: PointerPress,
	pub facts: MenuFacts,
	pub is_copy_shown: bool,
}

const MENU_POINT_KEY: &str = "mission-menu-at";

pub fn mission_menu<S: 'static>(
	t: &Tokens,
	language: Language,
	menu: &OpenMenu,
	emit: &Emit<S>,
) -> Vec<El> {
	let dismiss = Rc::clone(emit);
	let point = el().key(MENU_POINT_KEY).absolute(menu.at.x, menu.at.y).a11y_hidden();
	let panel = menu_panel(t, language, menu, emit).anchored(
		MENU_POINT_KEY,
		Side::Bottom,
		Align::Start,
		0.0,
	);
	let mut panels = el().absolute(0.0, 0.0).child(panel);
	if menu.is_copy_shown {
		panels = panels.child(copy_choices(t, language, menu, emit));
	}
	let panels = panels
		.focus_return(menu.source.key(menu.mission))
		.modal(true, move |s: &mut S| dismiss(s, MissionsEvent::MenuDismissed));
	vec![point, panels]
}

fn menu_panel<S: 'static>(t: &Tokens, language: Language, menu: &OpenMenu, emit: &Emit<S>) -> El {
	let laid_out = menu_entries(menu.facts);
	let entries: Vec<MenuEntry> = laid_out.iter().flatten().copied().collect();
	let rows = laid_out.into_iter().map(|entry| match entry {
		None => MenuRow::Separator,
		Some(entry) => {
			let (key, glyph) = entry_look(entry);
			let item = MenuItem::new(key.text(language)).glyph(glyph);
			MenuRow::Item(match entry {
				MenuEntry::CopyChoices => item.mark(Mark::Submenu).highlighted(menu.is_copy_shown),
				MenuEntry::Chosen(_) => item,
			})
		}
	});
	let mission = menu.mission.to_owned();
	wired_context_menu(t, chat::missions::menu::LABEL.text(language), rows, |index, item| {
		match entries[index] {
			MenuEntry::Chosen(action) => {
				emitting(item, emit, MissionsEvent::MenuChosen { mission: mission.clone(), action })
			}
			MenuEntry::CopyChoices => {
				let shown =
					MissionsEvent::CopyChoicesShown { mission: mission.clone(), is_shown: true };
				on_arrow(emitting(item, emit, shown.clone()), emit, KeyName::Right, shown)
			}
		}
	})
}

fn copy_choices<S: 'static>(t: &Tokens, language: Language, menu: &OpenMenu, emit: &Emit<S>) -> El {
	let copy = chat::missions::menu::COPY.text(language);
	let kinds = menu.facts.copy_kinds();
	let rows =
		kinds.iter().map(|kind| MenuRow::Item(MenuItem::new(copy_word(*kind).text(language))));
	let mission = menu.mission.to_owned();
	let hidden = MissionsEvent::CopyChoicesShown { mission: mission.clone(), is_shown: false };
	let dismiss = Rc::clone(emit);
	wired_submenu(t, copy, rows, |index, item| {
		let copied = MissionsEvent::MenuCopied { mission: mission.clone(), kind: kinds[index] };
		on_arrow(emitting(item, emit, copied), emit, KeyName::Left, hidden.clone())
	})
	.anchored(format!("menu-item-{copy}"), Side::Right, Align::Start, 0.0)
	.modal(true, move |s: &mut S| dismiss(s, MissionsEvent::MenuDismissed))
}

pub const PANEL_WIDTH: f32 = SPACING * 76.0;
const PANEL_INSET_X: f32 = SPACING * 2.0;
const PANEL_INSET_Y: f32 = SPACING * 3.0;
const GROUP_HEAD: f32 = SPACING * 7.0;
const GROUP_GLYPH: f32 = SPACING * 3.5;
const LIST_GAP: f32 = SPACING * 0.5;
const EMPTY_MARK: f32 = SPACING * 8.0;
const EMPTY_TITLE: TextStyle = TextStyle::new(18.0, 600.0);
const EMPTY_TITLE_LINE: f32 = SPACING * 7.0;
const EMPTY_MEASURE: f32 = SPACING * 112.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PanelMission<'a> {
	pub mission: Mission<'a>,
	pub conversation: &'a str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListEnd {
	Complete,
	Idle,
	ReadingMore,
}

pub struct Panel<'a> {
	pub open: &'a [PanelMission<'a>],
	pub earlier_today: &'a [PanelMission<'a>],
	pub open_mission: Option<&'a str>,
	pub is_earlier_today_open: bool,
	pub list_end: ListEnd,
}

fn group_head(t: &Tokens, title: &str, count: usize) -> El {
	row()
		.h(GROUP_HEAD)
		.px(SPACING * 1.5)
		.gap(SPACING * 1.5)
		.center_y()
		.child(text(title.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground).role("heading"))
		.child(text(count.to_string()).font(TEXT_XS).color(t.muted_foreground))
}

fn fold_head<S: 'static>(
	t: &Tokens,
	title: &str,
	count: usize,
	is_open: bool,
	emit: &Emit<S>,
) -> El {
	let chevron = icon(&icons::CHEVRON_DOWN, GROUP_GLYPH).color(t.foreground).a11y_hidden();
	let chevron = if is_open { chevron } else { chevron.rotate(-std::f32::consts::FRAC_PI_2) };
	let head = row()
		.w_full()
		.h(GROUP_HEAD)
		.px(SPACING * 1.5)
		.gap(SPACING * 1.5)
		.radius(RADIUS_LG)
		.center_y()
		.role("button")
		.label(title)
		.expanded(is_open)
		.hover(faded(t.muted, 0.5))
		.child(chevron)
		.child(text(title.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground))
		.child(text(count.to_string()).font(TEXT_XS).color(t.muted_foreground));
	let head = instant(head).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	);
	emitting(head, emit, MissionsEvent::ToggleEarlierToday)
}

fn panel_rows<S: 'static>(
	t: &Tokens,
	language: Language,
	missions: &[PanelMission],
	open_mission: Option<&str>,
	emit: &Emit<S>,
) -> El {
	col().w_full().gap(LIST_GAP).role("list").children(missions.iter().map(|entry| {
		mission_row(
			t,
			language,
			&entry.mission,
			open_mission == Some(entry.mission.id),
			emit,
			Some(entry.conversation),
		)
	}))
}

pub fn missions_panel_empty(t: &Tokens, language: Language) -> El {
	col()
		.w_full()
		.px(SPACING * 6.0)
		.py(SPACING * 12.0)
		.gap(SPACING * 5.0)
		.items_center()
		.child(icon(&icons::MISSIONS, EMPTY_MARK).color(t.muted_foreground).a11y_hidden())
		.child(
			col()
				.max_w(EMPTY_MEASURE)
				.gap(SPACING * 2.0)
				.items_center()
				.child(
					text(chat::missions::panel::empty::TITLE.text(language).to_owned())
						.font(TextStyle { line_height: EMPTY_TITLE_LINE, ..EMPTY_TITLE })
						.color(t.foreground)
						.align(rune::Align::Center)
						.wrap()
						.role("heading"),
				)
				.child(
					text(chat::missions::panel::empty::DESCRIPTION.text(language).to_owned())
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.align(rune::Align::Center)
						.wrap(),
				),
		)
}

pub fn missions_panel<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &Panel,
	emit: &Emit<S>,
) -> El {
	use chat::activity::missions::group;
	if panel.open.is_empty() && panel.earlier_today.is_empty() {
		return missions_panel_empty(t, language);
	}
	let groups = [
		(group::WAITING, &[MissionState::WaitingHuman, MissionState::ReadyToMerge][..]),
		(
			group::IN_PROGRESS,
			&[MissionState::Working, MissionState::WaitingBot, MissionState::Failed][..],
		),
	];
	let mut list = col().w_full().min_w(0.0).gap(SPACING * 3.0);
	for (title, states) in groups {
		let held: Vec<PanelMission> = panel
			.open
			.iter()
			.copied()
			.filter(|entry| states.contains(&entry.mission.state))
			.collect();
		if held.is_empty() {
			continue;
		}
		list = list.child(
			col()
				.w_full()
				.gap(LIST_GAP)
				.child(group_head(t, title.text(language), held.len()))
				.child(panel_rows(t, language, &held, panel.open_mission, emit)),
		);
	}
	if !panel.earlier_today.is_empty() {
		let mut earlier = col().w_full().gap(LIST_GAP).child(fold_head(
			t,
			group::EARLIER_TODAY.text(language),
			panel.earlier_today.len(),
			panel.is_earlier_today_open,
			emit,
		));
		if panel.is_earlier_today_open {
			earlier = earlier.child(panel_rows(
				t,
				language,
				panel.earlier_today,
				panel.open_mission,
				emit,
			));
		}
		list = list.child(earlier);
	}
	let is_folded = !panel.earlier_today.is_empty() && !panel.is_earlier_today_open;
	if panel.list_end == ListEnd::ReadingMore && !is_folded {
		list = list.child(pulsing(t, feed_skeleton_row(t, FEED_CYCLE[0].rows[0])));
	}
	list
}

pub fn panel_frame(t: &Tokens, body: El) -> El {
	col().w(PANEL_WIDTH).h_full().px(PANEL_INSET_X).py(PANEL_INSET_Y).fill(t.sidebar).child(body)
}

#[derive(Clone, Copy)]
struct FeedRow {
	title: f32,
	preview: f32,
}

#[derive(Clone, Copy)]
struct FeedGroup {
	head: f32,
	rows: &'static [FeedRow],
}

const FEED_CYCLE: [FeedGroup; 2] = [
	FeedGroup {
		head: SPACING * 23.0,
		rows: &[
			FeedRow { title: SPACING * 37.5, preview: SPACING * 42.5 },
			FeedRow { title: SPACING * 31.0, preview: SPACING * 37.5 },
		],
	},
	FeedGroup {
		head: SPACING * 17.5,
		rows: &[
			FeedRow { title: SPACING * 42.0, preview: SPACING * 46.0 },
			FeedRow { title: SPACING * 33.0, preview: SPACING * 24.0 },
			FeedRow { title: SPACING * 36.0, preview: SPACING * 40.0 },
		],
	},
];
const FEED_ROW_HEIGHT: f32 = ROW_INSET * 2.0 + ROW_AVATAR;
const FEED_GROUP_GAP: f32 = SPACING * 3.0;
const FEED_STAMP: f32 = SPACING * 7.0;

fn feed_skeleton_row(t: &Tokens, widths: FeedRow) -> El {
	row()
		.w_full()
		.pl(ROW_INSET)
		.py(ROW_INSET)
		.pr(ROW_END_INSET)
		.gap(ROW_GAP)
		.center_y()
		.child(hexagon(t, ROW_AVATAR))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.child(
					row()
						.w_full()
						.h(SPACING * 5.0)
						.center_y()
						.child(bar(t, widths.title))
						.child(spacer())
						.child(faint_bar(t, FEED_STAMP)),
				)
				.child(
					row().w_full().h(SPACING * 4.0).center_y().child(faint_bar(t, widths.preview)),
				),
		)
}

fn feed_group(t: &Tokens, group: FeedGroup) -> El {
	col()
		.w_full()
		.child(row().h(GROUP_HEAD).px(SPACING * 1.5).center_y().child(faint_bar(t, group.head)))
		.child(
			col()
				.w_full()
				.gap(LIST_GAP)
				.children(group.rows.iter().map(|widths| feed_skeleton_row(t, *widths))),
		)
}

fn feed_group_height(group: FeedGroup) -> f32 {
	let rows = group.rows.len() as f32;
	GROUP_HEAD + rows * FEED_ROW_HEIGHT + (rows - 1.0) * LIST_GAP
}

fn cycle_to_fill<T: Copy>(
	cycle: &[T],
	height_of: impl Fn(T) -> f32,
	gap: f32,
	room: f32,
) -> Vec<T> {
	let mut items = Vec::new();
	let mut reach = -gap;
	for item in cycle.iter().copied().cycle() {
		reach += height_of(item) + gap;
		items.push(item);
		if reach >= room {
			break;
		}
	}
	items
}

pub fn missions_feed_skeleton(t: &Tokens, height: f32) -> El {
	let groups = cycle_to_fill(&FEED_CYCLE, feed_group_height, FEED_GROUP_GAP, height);
	pulsing(
		t,
		col()
			.w_full()
			.h(height)
			.gap(FEED_GROUP_GAP)
			.children(groups.into_iter().map(|group| feed_group(t, group))),
	)
	.w_full()
	.h(height)
	.clip_rounded(0.0)
}

#[derive(Clone, Copy)]
enum DetailItem {
	LongAgent,
	ShortAgent,
	Event(f32),
}

const DETAIL_CYCLE: [DetailItem; 10] = [
	DetailItem::LongAgent,
	DetailItem::Event(SPACING * 41.0),
	DetailItem::Event(SPACING * 59.0),
	DetailItem::ShortAgent,
	DetailItem::Event(SPACING * 44.0),
	DetailItem::LongAgent,
	DetailItem::Event(SPACING * 41.0),
	DetailItem::Event(SPACING * 59.0),
	DetailItem::ShortAgent,
	DetailItem::Event(SPACING * 44.0),
];
const DETAIL_GAP: f32 = SPACING * 4.0;
const DETAIL_INSET_X: f32 = SPACING * 6.0;
const DETAIL_INSET_TOP: f32 = SPACING * 8.0;
const DETAIL_INSET_BOTTOM: f32 = SPACING * 4.0;
const AGENT_NAME_BAR: f32 = SPACING * 9.0;
const LONG_BUBBLE: (f32, f32) = (SPACING * 135.0, SPACING * 20.0);
const SHORT_BUBBLE: (f32, f32) = (SPACING * 155.0, SPACING * 11.0);
const BUBBLE_TAIL: f32 = SPACING * 1.5;
const EVENT_SKELETON_DOT: f32 = SPACING * 1.25;

fn detail_item_height(item: DetailItem) -> f32 {
	match item {
		DetailItem::LongAgent => SPACING * 5.0 + SPACING + LONG_BUBBLE.1,
		DetailItem::ShortAgent => SPACING * 5.0 + SPACING + SHORT_BUBBLE.1,
		DetailItem::Event(_) => SPACING * 5.0,
	}
}

fn agent_skeleton(t: &Tokens, bubble: (f32, f32)) -> El {
	row().w_full().gap(SPACING * 2.0).items_end().child(hexagon(t, EVENT_GUTTER)).child(
		col()
			.grow(1.0)
			.shrink()
			.min_w(0.0)
			.gap(SPACING)
			.child(
				row().h(SPACING * 5.0).px(SPACING * 3.5).center_y().child(bar(t, AGENT_NAME_BAR)),
			)
			.child(
				el().w(bubble.0)
					.shrink()
					.min_w(0.0)
					.h(bubble.1)
					.corners([RADIUS_BUBBLE, RADIUS_BUBBLE, RADIUS_BUBBLE, BUBBLE_TAIL])
					.fill(faded(t.border, SKELETON_FAINT_SHARE)),
			),
	)
}

fn event_skeleton(t: &Tokens, line: f32) -> El {
	row().w_full().pl(EVENT_GUTTER + SPACING * 2.0).child(
		row()
			.w_full()
			.h(SPACING * 5.0)
			.px(SPACING)
			.center_y()
			.child(
				row()
					.min_w(0.0)
					.gap(SPACING * 2.0)
					.center_y()
					.child(
						el().size(EVENT_SKELETON_DOT, EVENT_SKELETON_DOT)
							.radius(EVENT_SKELETON_DOT / 2.0)
							.fill(faded(t.border, SKELETON_FAINT_SHARE)),
					)
					.child(faint_bar(t, line)),
			)
			.child(spacer())
			.child(faint_bar(t, FEED_STAMP)),
	)
}

pub fn mission_detail_skeleton(t: &Tokens, height: f32) -> El {
	let room = height - DETAIL_INSET_TOP - DETAIL_INSET_BOTTOM;
	let items = cycle_to_fill(&DETAIL_CYCLE, detail_item_height, DETAIL_GAP, room);
	let column =
		col().w_full().px(DETAIL_INSET_X).pb(DETAIL_INSET_BOTTOM).gap(DETAIL_GAP).children(
			items.into_iter().rev().map(|item| match item {
				DetailItem::LongAgent => agent_skeleton(t, LONG_BUBBLE),
				DetailItem::ShortAgent => agent_skeleton(t, SHORT_BUBBLE),
				DetailItem::Event(line) => event_skeleton(t, line),
			}),
		);
	pulsing(t, col().w_full().h(height).justify_end().child(column))
		.w_full()
		.h(height)
		.clip_rounded(0.0)
}

#[cfg(test)]
mod menu_tests;

#[cfg(test)]
mod tests {
	use super::*;

	const NOW: i64 = 1_772_616_600_000;

	#[test]
	fn relative_times_read_as_intl_with_numeric_auto() {
		assert_eq!(relative_time(NOW - 20_000, NOW), "now");
		assert_eq!(relative_time(NOW - 60_000, NOW), "1 minute ago");
		assert_eq!(relative_time(NOW - 4 * 60_000, NOW), "4 minutes ago");
		assert_eq!(relative_time(NOW - 5_400_000, NOW), "1 hour ago");
		assert_eq!(relative_time(NOW - 330_000, NOW), "5 minutes ago");
		assert_eq!(relative_time(NOW - 86_400_000, NOW), "yesterday");
		assert_eq!(relative_time(NOW - 604_800_000, NOW), "last week");
	}

	#[test]
	fn catalogue_lines_take_their_values() {
		let line =
			filled(chat::missions::event::line::OPENED, Language::En, &[("source", "GitHub")]);
		assert_eq!(line, "Mission opened by GitHub");
		assert_eq!(commits_ahead_line(Language::En, 1), "1 commit ahead");
		assert_eq!(commits_ahead_line(Language::En, 3), "3 commits ahead");
	}

	#[test]
	fn only_five_states_carry_a_pill_and_three_a_row_dot() {
		let t = Tokens::new(false);
		let pills = MissionState::ALL.iter().filter(|state| state.word().is_some()).count();
		let dots = MissionState::ALL.iter().filter(|state| state.row_dot(&t).is_some()).count();
		assert_eq!(pills, 5);
		assert_eq!(dots, 3);
		assert_eq!(MissionState::parse("archived"), MissionState::Unrecognised);
		assert!(MissionState::Unrecognised.mark(&t).is_none());
	}

	#[test]
	fn copy_offers_only_what_the_mission_has() {
		let bare = MenuFacts {
			state: MissionState::Working,
			has_pull_request: false,
			has_branch: false,
			has_workspace_path: false,
		};
		assert_eq!(bare.copy_kinds(), vec![CopyKind::IssueId]);
		let every = MenuFacts {
			has_pull_request: true,
			has_branch: true,
			has_workspace_path: true,
			..bare
		};
		assert_eq!(
			every.copy_kinds(),
			vec![
				CopyKind::IssueId,
				CopyKind::Branch,
				CopyKind::PullRequestUrl,
				CopyKind::WorkspacePath
			]
		);
	}

	#[test]
	fn an_agent_hook_speaks_through_the_first_named_tool() {
		let face = event_face(Language::En, "agent-hook", &["Terminal", "GitHub"], None);
		assert_eq!(face.label, "GitHub");
		let face = event_face(Language::En, "agent-hook", &["Terminal"], None);
		assert_eq!(face.label, "The coding session");
		assert_eq!(event_face(Language::En, "person", &[], None).label, "You");
		assert_eq!(host_of("https://github.example/kiroshi/pull/482"), "github.example");
	}
}
