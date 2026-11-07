use rune::{Color, Cursor, El, Icon, TextStyle, Tx, col, el, icon, oklcha, row, text};

use crate::app::{App, Board, OpenMission};
use crate::conversations::title_badge;
use crate::model::{Agent, Mission, MissionEvent, MissionState, Ticket};
use kiroshi_rune_kit::avatar::{Activity, Face, Motion};
use kiroshi_rune_kit::icons;
use kiroshi_rune_kit::tokens::{
	RADIUS_BUBBLE, SPACING, TEXT_11, TEXT_BUBBLE, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM,
	Tokens,
};

const HEADER: f32 = 48.0;
const HEADER_AVATAR: f32 = 24.0;
const BAND: f32 = 34.0;
const BAND_INSET: f32 = 50.0;
const TURN_AVATAR: f32 = 40.0;
const TURN_GAP: f32 = 8.0;
const MARK: f32 = 16.0;
const TIMESTAMP: TextStyle = TextStyle { line_height: 20.0, ..TextStyle::new(11.0, 400.0) };
const PILL_HEIGHT: f32 = 20.0;
const BADGE_DOT: f32 = 8.0;

const RELATIVE_UNITS: [(&str, i64); 6] = [
	("year", 31_536_000_000),
	("month", 2_592_000_000),
	("week", 604_800_000),
	("day", 86_400_000),
	("hour", 3_600_000),
	("minute", 60_000),
];

const SUMMONS: [&str; 3] = [
	"Carry out this mission.",
	"The coding session of this mission is blocked and waiting on you.",
	"The coding agent of this mission is blocked and waiting on you.",
];

pub fn is_summons(content: &str) -> bool {
	SUMMONS.contains(&content)
}

pub fn relative_time(at: i64, now: i64) -> String {
	let elapsed = at - now;
	for (unit, span) in RELATIVE_UNITS {
		if elapsed.abs() < span {
			continue;
		}
		let count = (elapsed as f64 / span as f64).round() as i64;
		return match (count, unit) {
			(-1, "day") => "yesterday".to_owned(),
			(-1, _) if unit != "hour" && unit != "minute" => format!("last {unit}"),
			(1, "day") => "tomorrow".to_owned(),
			(1, _) if unit != "hour" && unit != "minute" => format!("next {unit}"),
			(count, _) if count < 0 => format!("{} {unit}{} ago", -count, plural(-count)),
			(count, _) => format!("in {count} {unit}{}", plural(count)),
		};
	}
	"now".to_owned()
}

fn plural(count: i64) -> &'static str {
	if count == 1 { "" } else { "s" }
}

fn motion_of(mission: &Mission, clock_ms: f64) -> Motion {
	if mission.is_agent_running {
		return Motion::Running { activity: Activity::Working, at_ms: clock_ms };
	}
	Motion::Still
}

fn avatar(mission: &Mission, bot: &Agent, size: f32, s: &App, t: &Tokens) -> El {
	let face =
		Face { name: &bot.name, hue: bot.avatar_blot, motion: motion_of(mission, s.clock_ms) };
	let drawn = face.draw(size, t);
	if mission.state != MissionState::WaitingHuman {
		return drawn;
	}
	let dot = el()
		.size(BADGE_DOT, BADGE_DOT)
		.radius(BADGE_DOT / 2.0)
		.fill(t.primary)
		.border(1.5, t.card)
		.absolute(size - BADGE_DOT, size - BADGE_DOT);
	el().size(size, size).child(drawn).child(dot)
}

struct StateMark {
	glyph: &'static Icon,
	ink: Color,
	label: &'static str,
}

fn done_ink() -> Color {
	oklcha(0.68, 0.17, 148.0, 1.0)
}

fn state_mark(state: MissionState, t: &Tokens) -> Option<StateMark> {
	let warning =
		if t.dark { oklcha(0.76, 0.16, 72.0, 1.0) } else { oklcha(0.64, 0.16, 60.0, 1.0) };
	let (glyph, ink, label) = match state {
		MissionState::WaitingHuman => (&icons::BELL, warning, "Blocked on you"),
		MissionState::ReadyToMerge => (&icons::CHECK, done_ink(), "Ready to merge"),
		MissionState::Failed => (&icons::ERROR, oklcha(0.62, 0.22, 27.0, 1.0), "Blocked"),
		MissionState::Done => (&icons::SUCCESS, done_ink(), "Completed"),
		MissionState::Closed => (&icons::CLOSE, t.muted_foreground, "Closed"),
		MissionState::Working | MissionState::WaitingBot => return None,
	};
	Some(StateMark { glyph, ink, label })
}

pub fn state_pill(state: MissionState, t: &Tokens) -> Option<El> {
	let mark = state_mark(state, t)?;
	Some(
		row()
			.key(format!("mission-state-{}", mark.label))
			.h(PILL_HEIGHT)
			.pl(SPACING * 1.5)
			.pr(SPACING * 2.0)
			.gap(SPACING)
			.center_y()
			.radius(PILL_HEIGHT / 2.0)
			.border(1.0, t.border)
			.child(icon(mark.glyph, 12.0).color(mark.ink))
			.child(text(mark.label).font(TEXT_XS_MEDIUM).color(t.foreground)),
	)
}

fn tool_mark(tool: &str) -> &'static Icon {
	match tool.to_lowercase().as_str() {
		"github" => &icons::GITHUB,
		"paper" => &icons::PAPER,
		"superset" => &icons::SUPERSET,
		_ => &icons::TOOL,
	}
}

fn platform_mark(platform: Option<&str>) -> &'static Icon {
	match platform.map(str::to_lowercase).as_deref() {
		Some("github") => &icons::GITHUB,
		Some("linear") => &icons::LINEAR,
		_ => &icons::BOOKMARK,
	}
}

fn has_ticket(ticket: &Ticket) -> bool {
	ticket.external_id.as_deref().is_some_and(|id| !id.is_empty())
		|| ticket.title.as_deref().is_some_and(|title| !title.is_empty())
}

fn ticket_line(ticket: &Ticket, t: &Tokens, in_band: bool) -> El {
	let mark = if in_band { 11.0 } else { 12.0 };
	let identifier_ink = if in_band { t.foreground } else { t.muted_foreground };
	let mut line = row().shrink().min_w(0.0).gap(SPACING * 1.5).child(
		icon(platform_mark(ticket.platform.as_deref()), mark)
			.color(t.muted_foreground)
			.mt(if in_band { 0.0 } else { 2.0 }),
	);
	line = if in_band { line.center_y() } else { line.items_start() };
	if let Some(id) = ticket.external_id.as_deref().filter(|id| !id.is_empty()) {
		line = line.child(text(id.to_owned()).font(TEXT_XS_MEDIUM).color(identifier_ink));
	}
	if let Some(title) = ticket.title.as_deref().filter(|title| !title.is_empty()) {
		let title = text(title.to_owned()).font(TEXT_XS).color(t.muted_foreground);
		line = line.child(if in_band {
			title.truncate().shrink().min_w(0.0)
		} else {
			title.wrap().grow(1.0).shrink().min_w(0.0)
		});
	}
	let Some(url) = ticket.url.clone().filter(|url| url.starts_with("https://")) else {
		return line;
	};
	line.cursor(Cursor::Pointer).role("link").on_press_tx(move |s: &mut App, tx: &mut Tx| {
		if let Err(failure) = tx.open_url(&url) {
			s.notice = Some(format!("Couldn't open the ticket: {failure}"));
		}
	})
}

fn band_rule(t: &Tokens) -> El {
	el().size(1.0, 12.0).fill(t.border)
}

pub fn header(s: &App, open: &OpenMission, t: &Tokens, now: i64) -> El {
	let mission = &open.mission;
	let back = el()
		.size(32.0, 32.0)
		.radius(8.0)
		.center()
		.hover(t.muted)
		.cursor(Cursor::Pointer)
		.role("button")
		.label("Back to the conversation")
		.on_press(|s: &mut App| s.leave_mission())
		.child(icon(&icons::PREVIOUS, 16.0).color(t.foreground));
	let mut top = row()
		.w_full()
		.h(HEADER)
		.pl(6.0)
		.pr(10.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(back)
		.child(avatar(mission, &open.bot, HEADER_AVATAR, s, t))
		.child(
			row().grow(1.0).shrink().min_w(0.0).child(
				text(mission.objective.clone())
					.font(TEXT_SM_MEDIUM)
					.color(t.foreground)
					.truncate()
					.shrink()
					.min_w(0.0),
			),
		);
	if let Some(pill) = state_pill(mission.state, t) {
		top = top.child(pill);
	}
	let mut band =
		row().w_full().h(BAND).pl(BAND_INSET).pr(SPACING * 4.0).gap(SPACING * 2.0).center_y();
	let ticket = has_ticket(&mission.ticket);
	if ticket {
		band = band.child(ticket_line(&mission.ticket, t, true));
	}
	if !mission.tools.is_empty() {
		if ticket {
			band = band.child(band_rule(t));
		}
		band = band.child(row().gap(SPACING * 2.0).children(
			mission.tools.iter().map(|tool| icon(tool_mark(tool), 12.0).color(t.muted_foreground)),
		));
	}
	if let Some(status) = mission.status.as_ref().filter(|status| !status.text.trim().is_empty()) {
		if ticket || !mission.tools.is_empty() {
			band = band.child(band_rule(t));
		}
		band = band.child(
			row()
				.shrink()
				.min_w(0.0)
				.gap(SPACING * 1.5)
				.center_y()
				.child(
					text(status.text.clone())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.truncate()
						.shrink()
						.min_w(0.0),
				)
				.child(
					text(relative_time(status.written_at, now))
						.font(TEXT_XS)
						.color(t.muted_foreground),
				),
		);
	}
	band = band.child(el().grow(1.0)).child(
		text(format!("opened {}", relative_time(mission.opened_at, now)))
			.font(TEXT_11)
			.color(t.muted_foreground),
	);
	let mut header = col()
		.w_full()
		.child(top)
		.child(el().w_full().h(1.0).fill(t.shell_divider))
		.child(band)
		.child(el().w_full().h(1.0).fill(t.border));
	if let Some(activity) = activity_line(mission, t) {
		header = header
			.child(
				row().w_full().h(28.0).pl(BAND_INSET).pr(SPACING * 4.0).center_y().child(activity),
			)
			.child(el().w_full().h(1.0).fill(t.border));
	}
	if let Some(failure) = &open.failure {
		header = header.child(
			row().w_full().px(SPACING * 4.0).py(SPACING * 2.0).child(
				text(format!(
					"Couldn't read this mission. {}: {}",
					failure.title(),
					failure.detail()
				))
				.font(TEXT_XS)
				.color(t.destructive)
				.wrap(),
			),
		);
	}
	header
}

fn pull_request_number(url: &str) -> Option<&str> {
	let (_, number) = url.trim_end_matches('/').rsplit_once("/pull/")?;
	number.chars().all(|c| c.is_ascii_digit()).then_some(number)
}

fn activity_line(mission: &Mission, t: &Tokens) -> Option<El> {
	let commits = mission.commits_ahead.filter(|&count| count > 0);
	let pull = mission.pull_request_url.as_deref().and_then(pull_request_number);
	if commits.is_none() && pull.is_none() {
		return None;
	}
	let mut line = row().gap(SPACING).center_y();
	if let Some(count) = commits {
		let label = format!("{count} commit{} ahead", plural(count));
		line = line.child(text(label).font(TEXT_XS).color(t.muted_foreground));
	}
	if let Some(number) = pull {
		if commits.is_some() {
			line = line.child(text("·").font(TEXT_XS).color(t.muted_foreground));
		}
		line = line.child(text(format!("#{number}")).font(TEXT_XS_MEDIUM).color(t.foreground));
	}
	Some(line)
}

pub fn turn(
	s: &App,
	mission: &Mission,
	bot: &Agent,
	t: &Tokens,
	timestamp: String,
	now: i64,
) -> El {
	let mut title_row = row().w_full().gap(SPACING * 2.0).center_y().children(
		mission.tools.iter().map(|tool| icon(tool_mark(tool), MARK).color(t.muted_foreground)),
	);
	if let Some(pill) = state_pill(mission.state, t) {
		title_row = title_row.child(pill);
	}
	title_row = title_row
		.child(el().grow(1.0))
		.child(text(timestamp).font(TIMESTAMP).color(t.muted_foreground));
	let closed = mission.state == MissionState::Closed;
	let mut body = col().w_full().gap(SPACING).child(
		text(mission.objective.clone())
			.font(TEXT_BUBBLE)
			.color(if closed { t.muted_foreground } else { t.foreground })
			.wrap(),
	);
	if has_ticket(&mission.ticket) {
		body = body.child(ticket_line(&mission.ticket, t, false));
	}
	if let Some(activity) = mission.last_activity.as_ref().filter(|_| mission.is_agent_running) {
		body = body.child(
			text(format!("{} · {}", activity.tool, activity.target))
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.truncate()
				.shrink()
				.min_w(0.0),
		);
	}
	let mut card = col().w_full().gap(SPACING * 2.0).child(title_row).child(body);
	if let Some(status) = mission.status.as_ref().filter(|status| !status.text.trim().is_empty()) {
		card = card.child(
			col()
				.w_full()
				.child(
					text(status.text.clone())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.wrap()
						.max_lines(3),
				)
				.child(
					text(relative_time(status.written_at, now))
						.font(TEXT_XS)
						.color(t.muted_foreground),
				),
		);
	}
	if let Some(activity) = activity_line(mission, t) {
		card = card.child(activity);
	}
	let id = mission.id.clone();
	let bubble = col()
		.grow(1.0)
		.shrink()
		.min_w(0.0)
		.padding(18.0)
		.radius(RADIUS_BUBBLE)
		.fill(t.bubble)
		.hover(t.foreground.alpha(0.05))
		.cursor(Cursor::Pointer)
		.role("button")
		.label(format!("Open the mission: {}", mission.objective))
		.on_press(move |s: &mut App| s.open_mission_of_turn(&id))
		.child(card);
	let author = row()
		.pl(TURN_AVATAR + TURN_GAP + 18.0)
		.pb(SPACING)
		.gap(SPACING * 1.5)
		.center_y()
		.child(text(bot.name.clone()).font(TEXT_SM_MEDIUM).color(t.foreground))
		.child(if bot.title.is_empty() { el() } else { title_badge(t, &bot.title) });
	col().w_full().child(author).child(
		row()
			.w_full()
			.gap(TURN_GAP)
			.items_end()
			.child(avatar(mission, bot, TURN_AVATAR, s, t))
			.child(bubble),
	)
}

struct EventFace {
	line: &'static str,
	kind: &'static str,
}

fn event_face(kind: &str) -> Option<EventFace> {
	let (line, kind) = match kind {
		"opened" => ("Mission opened by {source}", "Opened"),
		"note" => ("Note recorded by {source}", "Note"),
		"agent_asked" => ("Question sent to the coding session by {source}", "Question"),
		"answered" => ("Answer sent to the coding session", "Answer"),
		"escalated" => ("Escalated to a human by {source}", "Escalated"),
		"ready" => ("Marked ready to merge by {source}", "Ready to merge"),
		"checks_failed" => ("Red checks reported by {source}", "Checks failed"),
		"failed" => ("Failure reported by {source}", "Failed"),
		"closed" => ("Mission closed by {source}", "Closed"),
		"dismissed" => ("Closed by you", "Closed"),
		"reopened" => ("Mission reopened by {source}", "Reopened"),
		_ => return None,
	};
	Some(EventFace { line, kind })
}

fn source_name(source: &str, open: &OpenMission) -> String {
	match source {
		"bot" => open.bot.name.clone(),
		"reader" => "You".to_owned(),
		"github" => "GitHub".to_owned(),
		_ => open
			.mission
			.tools
			.iter()
			.find(|tool| matches!(tool.as_str(), "github" | "paper" | "superset"))
			.map_or_else(|| "The coding session".to_owned(), |tool| capitalised(tool)),
	}
}

fn capitalised(word: &str) -> String {
	let mut chars = word.chars();
	chars.next().map_or_else(String::new, |first| first.to_uppercase().chain(chars).collect())
}

const SPOKEN_KEYS: [&str; 4] = ["line", "message", "question", "summary"];

fn spoken_text(payload: &serde_json::Value) -> Option<&str> {
	SPOKEN_KEYS.iter().find_map(|key| {
		payload.get(key).and_then(|value| value.as_str()).filter(|text| !text.is_empty())
	})
}

pub fn shows_event(event: &MissionEvent) -> bool {
	event_face(&event.kind).is_some()
}

pub fn event_row(s: &App, open: &OpenMission, event: &MissionEvent, t: &Tokens, now: i64) -> El {
	let Some(face) = event_face(&event.kind) else { return el() };
	let source = source_name(&event.source, open);
	let when = relative_time(event.created_at, now);
	let said = spoken_text(&event.payload);
	let Some(said) = said else {
		let line = face.line.replace("{source}", &source);
		return row()
			.w_full()
			.pl(TURN_AVATAR + TURN_GAP + 6.0)
			.py(SPACING * 1.5)
			.gap(SPACING * 2.0)
			.center_y()
			.child(el().size(5.0, 5.0).radius(2.5).fill(t.muted_foreground))
			.child(text(line).font(TEXT_XS).color(t.muted_foreground))
			.child(text(when).font(TEXT_XS).color(t.muted_foreground));
	};
	let chip_fill = if event.kind == "agent_asked" {
		oklcha(0.64, 0.16, 60.0, 0.18)
	} else {
		t.foreground.alpha(0.08)
	};
	let speaker = if event.source == "bot" {
		avatar(&open.mission, &open.bot, TURN_AVATAR, s, t)
	} else {
		el().size(TURN_AVATAR, TURN_AVATAR)
			.radius(TURN_AVATAR / 2.0)
			.fill(t.muted)
			.center()
			.child(icon(tool_mark(&source), MARK).color(t.muted_foreground))
	};
	let author = row()
		.pl(TURN_AVATAR + TURN_GAP)
		.pb(SPACING)
		.gap(SPACING * 1.5)
		.center_y()
		.child(text(source).font(TEXT_SM_MEDIUM).color(t.foreground))
		.child(
			el().px(6.0)
				.radius(5.0)
				.fill(chip_fill)
				.child(text(face.kind).font(TEXT_11).color(t.foreground)),
		)
		.child(text(when).font(TEXT_XS).color(t.muted_foreground));

	let bubble =
		col().max_w(560.0).shrink().padding(18.0).radius(RADIUS_BUBBLE).fill(t.bubble).child(
			text(said.to_owned()).font(TEXT_BUBBLE).color(t.foreground).wrap().selectable(true),
		);
	col()
		.w_full()
		.py(6.0)
		.child(author)
		.child(row().w_full().gap(TURN_GAP).items_end().child(speaker).child(bubble))
}

pub fn roster(s: &App, t: &Tokens, now: i64) -> El {
	let header = row().h(32.0).pl(SPACING * 2.0).center_y().child(
		text("Missions").font(kiroshi_rune_kit::tokens::TEXT_BASE_SEMIBOLD).color(t.foreground),
	);
	let list = match &s.board {
		Board::Unread | Board::Reading => col()
			.w_full()
			.pt(SPACING * 4.0)
			.items_center()
			.child(kiroshi_rune_kit::widgets::spinner(t.input, t.muted_foreground)),
		Board::Failed(failure) => col().w_full().padding(SPACING * 2.0).child(
			text(format!("Couldn't read the missions. {}: {}", failure.title(), failure.detail()))
				.font(TEXT_XS)
				.color(t.destructive)
				.wrap(),
		),
		Board::Read(board) if board.is_empty() => col()
			.w_full()
			.padding(SPACING * 2.0)
			.child(text("No open mission.").font(TEXT_SM).color(t.muted_foreground)),
		Board::Read(board) => col().w_full().gap(2.0).children(board.iter().map(|entry| {
			let selected =
				s.mission.as_ref().is_some_and(|open| open.mission.id == entry.mission.id);
			mission_row(s, &entry.mission, &entry.bot, selected, t, now)
		})),
	};
	col().w(304.0).h_full().padding(9.0).gap(SPACING * 2.0).child(header).child(list)
}

fn mission_row(
	s: &App,
	mission: &Mission,
	bot: &Agent,
	selected: bool,
	t: &Tokens,
	now: i64,
) -> El {
	let (opened, by) = (mission.clone(), bot.clone());
	let detail = mission
		.ticket
		.external_id
		.clone()
		.filter(|id| !id.is_empty())
		.unwrap_or_else(|| bot.name.clone());
	let mut second =
		row().w_full().gap(SPACING * 1.5).center_y().child(
			text(detail).font(TEXT_SM).color(t.muted_foreground).truncate().shrink().min_w(0.0),
		);
	if let Some(mark) = state_mark(mission.state, t) {
		second = second.child(icon(mark.glyph, 12.0).color(mark.ink));
	}
	let line = row()
		.w_full()
		.h(52.0)
		.px(SPACING * 2.0)
		.gap(SPACING * 3.0)
		.center_y()
		.radius(10.0)
		.cursor(Cursor::Pointer)
		.role("button")
		.label(mission.objective.clone())
		.on_press(move |s: &mut App| s.open_mission(&opened, &by))
		.child(avatar(mission, bot, 40.0, s, t))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.child(
					row()
						.w_full()
						.gap(SPACING * 2.0)
						.child(
							text(mission.objective.clone())
								.font(TEXT_SM_MEDIUM)
								.color(t.foreground)
								.truncate()
								.shrink()
								.min_w(0.0)
								.grow(1.0)
								.shrink(),
						)
						.child(
							text(relative_time(mission.opened_at, now))
								.font(TEXT_11)
								.color(t.muted_foreground),
						),
				)
				.child(second),
		);
	if selected { line.fill(t.muted) } else { line.hover(t.foreground.alpha(0.04)) }
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn relative_times_read_as_intl_with_numeric_auto() {
		let now = 1_000_000_000_000;
		assert_eq!(relative_time(now - 20_000, now), "now");
		assert_eq!(relative_time(now - 60_000, now), "1 minute ago");
		assert_eq!(relative_time(now - 4 * 60_000, now), "4 minutes ago");
		assert_eq!(relative_time(now - 3_600_000, now), "1 hour ago");
		assert_eq!(relative_time(now - 86_400_000, now), "yesterday");
		assert_eq!(relative_time(now - 3 * 86_400_000, now), "3 days ago");
		assert_eq!(relative_time(now - 604_800_000, now), "last week");
	}

	#[test]
	fn summons_and_pull_requests_are_recognised() {
		assert!(is_summons("Carry out this mission."));
		assert!(!is_summons("Carry out this mission"));
		assert_eq!(pull_request_number("https://github.com/o/r/pull/2112"), Some("2112"));
		assert_eq!(pull_request_number("https://github.com/o/r"), None);
	}
}
