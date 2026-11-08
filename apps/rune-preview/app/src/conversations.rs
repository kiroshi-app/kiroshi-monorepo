use std::time::{SystemTime, UNIX_EPOCH};

use rune::{Chrome, Cursor, El, Icon, TextStyle, col, el, icon, row, text};
use rune_kit::Kit;

use kiroshi_rune_kit::avatar::Face;
use kiroshi_rune_kit::icons;
use kiroshi_rune_kit::surfaces::s05_thread::{Agent as ThreadAgent, ThreadKind};
use kiroshi_rune_kit::tokens::{
	RADIUS_LG, SPACING, TEXT_10_MEDIUM, TEXT_COMPACT, TEXT_COMPACT_MONO, TEXT_COMPACT_SEMIBOLD,
	TEXT_SM, TEXT_SM_MEDIUM, TEXT_TITLE, TEXT_XS_MEDIUM, Tokens, conversation_icon, srgb,
};
use kiroshi_rune_kit::widgets::{Pill, spinner};

use crate::app::{App, Pane, Person, Ready, Thread, Workspace};
use crate::composer;
use crate::host::{DEV_START_COMMAND, HostError, Profile};
use crate::model::{Agent, Conversation};
use crate::surfaces::{s03_roster, s05_thread, s08_missions};

pub const CHROME: Chrome =
	Chrome { full_size_content: true, traffic_lights: Some((16.0, 14.0)), drag_regions: true };

const TITLE_BAR: f32 = 40.0;
const RAIL: f32 = 60.0;

const SIGNED_OUT: &str = "Signed out.";

const ACCOUNT_UNREAD: &str = "Couldn't read your account. Restart the preview to try again.";
const SHELL_INSET: f32 = 8.0;
const ROSTER: f32 = 304.0;
const ROSTER_PAD: f32 = 9.0;
const HEADER: f32 = 48.0;

const PRESENCE_ONLINE: u32 = 0x207144;

const TIMESTAMP: TextStyle = TextStyle { line_height: 20.0, ..TextStyle::new(11.0, 500.0) };
const HEADER_TITLE: TextStyle =
	TextStyle { line_height: 18.0, tracking: -0.15, ..TextStyle::new(15.0, 600.0) };

pub struct Viewport {
	pub inset: f32,
	pub transcript_height: Option<f32>,
	pub composer: composer::Measured,
}

pub const TRANSCRIPT: &str = "transcript";

pub fn view(s: &App, k: &Kit, t: &Tokens, viewport: &Viewport) -> El {
	match &s.workspace {
		Workspace::Connecting => centred(
			t,
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.child(spinner(t.input, t.muted_foreground))
				.child(text("Reaching Kiroshi…").font(TEXT_COMPACT).color(t.muted_foreground)),
		),
		Workspace::Failed(failure) => host_failed(t, failure),
		Workspace::Ready(ready) => frame(s, ready, k, &t.in_space(ready.space.colour), viewport),
	}
}

fn centred(t: &Tokens, content: El) -> El {
	col().w_full().h_full().fill(t.background).center().child(content)
}

fn host_failed(t: &Tokens, failure: &HostError) -> El {
	let mut content = col()
		.w(480.0)
		.items_center()
		.gap(SPACING * 2.5)
		.child(text(failure.title()).font(TEXT_TITLE).color(t.foreground))
		.child(
			text(failure.detail())
				.font(TEXT_SM)
				.color(t.muted_foreground)
				.wrap()
				.align(rune::Align::Center),
		);
	if failure.profile() == Some(Profile::Dev) {
		content = content.child(
			el().mt(SPACING * 3.0).padding(SPACING * 3.0).radius(RADIUS_LG).fill(t.muted).child(
				text(DEV_START_COMMAND)
					.font(TEXT_COMPACT_MONO)
					.color(t.foreground)
					.selectable(true),
			),
		);
	}
	let retry = Pill::new("Try again").primary(t, |s: &mut App| s.connect());
	centred(t, col().items_center().gap(SPACING * 6.0).child(content).child(retry))
}

fn frame(s: &App, ready: &Ready, k: &Kit, t: &Tokens, viewport: &Viewport) -> El {
	let card = row()
		.grow(1.0)
		.min_w(0.0)
		.min_h(0.0)
		.mr(SHELL_INSET)
		.mb(SHELL_INSET)
		.radius(12.0)
		.clip_rounded(12.0)
		.fill(t.card)
		.border(1.0, t.shell_border)
		.child(match s.pane {
			Pane::Missions => s08_missions::panel(s, t),
			Pane::Conversations => roster(s, ready, t),
		})
		.child(el().w(1.0).h_full().fill(t.shell_divider))
		.child(thread_column(s, k, t, viewport));
	col()
		.w_full()
		.h_full()
		.fill(t.background)
		.child(title_bar(s, t, viewport.inset))
		.child(row().w_full().grow(1.0).min_h(0.0).child(rail(s, ready, t)).child(card))
}

fn title_bar(s: &App, t: &Tokens, inset: f32) -> El {
	let glyph = |glyph: &'static Icon| {
		el().size(24.0, 24.0)
			.radius(6.0)
			.center()
			.child(icon(glyph, 14.0).color(t.muted_foreground))
	};
	let title = s.thread.as_ref().map_or_else(String::new, |thread| shown_name(s, thread));
	let tab_placeholder = row()
		.h(28.0)
		.w(180.0)
		.px(SPACING * 3.0)
		.radius(8.0)
		.center_y()
		.fill(t.foreground.alpha(0.16))
		.child(text(title).font(TEXT_XS_MEDIUM).color(t.foreground).truncate());
	row()
		.w_full()
		.h(TITLE_BAR)
		.pl(inset.max(76.0))
		.gap(SPACING)
		.center_y()
		.window_drag()
		.child(glyph(&icons::PREVIOUS))
		.child(glyph(&icons::NEXT))
		.child(tab_placeholder)
		.child(glyph(&icons::PLUS))
}

fn rail(s: &App, ready: &Ready, t: &Tokens) -> El {
	let missions = matches!(s.pane, Pane::Missions);
	let (ground, ink) = conversation_icon(ready.space.colour, t.dark);
	let initial: String = ready.space.name.chars().take(1).collect();
	let space = el()
		.size(32.0, 32.0)
		.radius(10.0)
		.fill(ground)
		.center()
		.child(text(initial).font(TEXT_COMPACT_SEMIBOLD).color(ink));
	let slot = |glyph: &'static Icon, selected: bool| {
		let ink = if selected { t.foreground } else { t.muted_foreground };
		let tile = el().size(36.0, 36.0).radius(10.0).center().child(icon(glyph, 18.0).color(ink));
		if selected {
			tile.fill(t.rail_item_selected)
		} else {
			tile.hover(t.foreground.alpha(0.05))
		}
	};
	let person: String = match &ready.person {
		Person::SignedIn(email) => email.chars().take(2).collect::<String>().to_uppercase(),
		Person::SignedOut | Person::Unread => "?".to_owned(),
	};
	col()
		.w(RAIL)
		.h_full()
		.items_center()
		.pt(7.0)
		.pb(SHELL_INSET + 4.0)
		.gap(SPACING)
		.child(space)
		.child(el().h(SPACING * 2.0))
		.child(slot(&icons::SEARCH, false))
		.child(
			slot(&icons::CONVERSATIONS, !missions)
				.cursor(Cursor::Pointer)
				.on_press(|s: &mut App| s.show_conversations()),
		)
		.child(
			slot(&icons::MISSIONS, missions)
				.cursor(Cursor::Pointer)
				.on_press(|s: &mut App| s.show_missions()),
		)
		.child(el().grow(1.0))
		.child(
			el().size(28.0, 28.0)
				.radius(14.0)
				.fill(t.person_avatar)
				.center()
				.child(text(person).font(TEXT_10_MEDIUM).color(t.foreground)),
		)
}

fn roster(s: &App, ready: &Ready, t: &Tokens) -> El {
	let header = row()
		.h(32.0)
		.pl(SPACING * 2.0)
		.pr(2.0)
		.center_y()
		.justify_between()
		.child(text("Conversations").font(HEADER_TITLE).color(t.foreground))
		.child(
			el().size(28.0, 28.0)
				.radius(8.0)
				.center()
				.hover(t.muted)
				.child(icon(&icons::PLUS, 16.0).color(t.foreground)),
		);
	let account = match &ready.person {
		Person::SignedIn(email) => email.clone(),
		Person::SignedOut => SIGNED_OUT.to_owned(),
		Person::Unread => ACCOUNT_UNREAD.to_owned(),
	};
	col()
		.w(ROSTER)
		.h_full()
		.padding(ROSTER_PAD)
		.gap(SPACING * 2.0)
		.child(header)
		.child(s03_roster::view(s, t))
		.child(text(account).font(TIMESTAMP).color(t.muted_foreground).truncate())
}

struct SoloAgent {
	id: String,
	name: String,
	hue: Option<f32>,
}

impl SoloAgent {
	fn face<'a>(&'a self, s: &App, conversation_id: &str) -> Face<'a> {
		Face { name: &self.name, hue: self.hue, motion: s.motion(conversation_id, &self.id) }
	}
}

fn opened_conversation<'a>(s: &'a App, thread: &Thread) -> Option<&'a Conversation> {
	s.ready()?.conversations.iter().find(|held| held.id == thread.conversation_id)
}

fn shown_name(s: &App, thread: &Thread) -> String {
	opened_conversation(s, thread)
		.and_then(|conversation| solo_agent(s, conversation))
		.map_or_else(|| thread.title.clone(), |agent| agent.name)
}

fn solo_agent(s: &App, conversation: &Conversation) -> Option<SoloAgent> {
	let bot_id = conversation.solo_bot_id.as_deref()?;
	let agent = s.ready()?.agents.iter().find(|agent| agent.id == bot_id)?;
	Some(SoloAgent { id: agent.id.clone(), name: agent.name.clone(), hue: agent.avatar_blot })
}

fn subject_icon(conversation: &Conversation, size: f32, t: &Tokens) -> El {
	let (ground, ink) = conversation_icon(conversation.color, t.dark);
	el().size(size, size)
		.radius(size * 0.3)
		.fill(ground)
		.center()
		.child(icon(&icons::MESSAGE, size * 0.45).color(ink))
}

pub fn title_badge(t: &Tokens, title: &str) -> El {
	el().px(6.0).py(2.0).radius(7.0).fill(t.foreground.alpha(0.1)).shrink().child(
		text(title.to_owned()).font(TEXT_10_MEDIUM).color(t.foreground.alpha(0.8)).truncate(),
	)
}

pub fn now_ms() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as i64)
}

pub fn roster_timestamp(at: i64, now: i64) -> String {
	const MINUTE: i64 = 60_000;
	const HOUR: i64 = 60 * MINUTE;
	const DAY: i64 = 24 * HOUR;
	const WEEK: i64 = 7 * DAY;
	let age = now.saturating_sub(at);
	match age {
		_ if age < MINUTE => "now".to_owned(),
		_ if age < HOUR => format!("{}m", age / MINUTE),
		_ if age < DAY => format!("{}h", age / HOUR),
		_ if age < WEEK => format!("{}d", age / DAY),
		_ if age < 4 * WEEK => format!("{}w", age / WEEK),
		_ => month_and_day(at),
	}
}

fn month_and_day(at: i64) -> String {
	let days = at.div_euclid(86_400_000) + 719_468;
	let era = days.div_euclid(146_097);
	let day_of_era = days - era * 146_097;
	let year_of_era =
		(day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
	let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
	let shifted_month = (5 * day_of_year + 2) / 153;
	let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
	let month = if shifted_month < 10 { shifted_month + 3 } else { shifted_month - 9 };
	format!("{month}/{day}")
}

fn thread_column(s: &App, k: &Kit, t: &Tokens, viewport: &Viewport) -> El {
	col()
		.key("conversation")
		.grow(1.0)
		.h_full()
		.min_w(0.0)
		.fill(t.background)
		.child(match &s.mission {
			Some(opened) => s08_missions::header(s, t, opened),
			None => thread_header(s, t),
		})
		.child(thread_body(s, t))
		.child(composer::view(s, k, t, &viewport.composer))
}

fn thread_agent(agent: &Agent) -> ThreadAgent {
	ThreadAgent {
		id: agent.id.clone(),
		name: agent.name.clone(),
		hue: agent.avatar_blot,
		badge: Some(agent.title.clone()).filter(|title| !title.is_empty()),
	}
}

fn thread_roster(s: &App) -> Vec<ThreadAgent> {
	s.ready().map(|ready| ready.agents.iter().map(thread_agent).collect()).unwrap_or_default()
}

fn thread_kind(s: &App, roster: &[ThreadAgent]) -> ThreadKind {
	if let Some(opened) = &s.mission {
		let mission = opened.mission();
		return ThreadKind::Mission {
			objective: mission.map(|mission| mission.objective.clone()).unwrap_or_default(),
			tools: mission.map(|mission| mission.tools.clone()).unwrap_or_default(),
			bot: roster.iter().find(|agent| agent.id == opened.bot_id).cloned(),
			now: now_ms(),
		};
	}
	let conversation =
		s.surfaces.s05_thread.conversation_id().and_then(|id| {
			s.ready()?.conversations.iter().find(|conversation| conversation.id == id)
		});
	let solo = conversation
		.and_then(|conversation| conversation.solo_bot_id.as_deref())
		.and_then(|bot_id| roster.iter().find(|agent| agent.id == bot_id));
	match (solo, conversation) {
		(Some(agent), _) => ThreadKind::Solo(agent.clone()),
		(None, Some(conversation)) => ThreadKind::Group { title: conversation.title.clone() },
		(None, None) => ThreadKind::Group { title: String::new() },
	}
}

fn thread_body(s: &App, t: &Tokens) -> El {
	let roster = thread_roster(s);
	let kind = thread_kind(s, &roster);
	let space_hue = s.ready().and_then(|ready| ready.space.colour);
	s05_thread::view(s, t, kind, roster, space_hue).unwrap_or_else(|| no_thread(t))
}

fn no_thread(t: &Tokens) -> El {
	col()
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.center()
		.child(text("Pick a conversation.").font(TEXT_SM).color(t.muted_foreground))
}

fn thread_header(s: &App, t: &Tokens) -> El {
	let identity = s.thread.as_ref().map(|thread| {
		let conversation = opened_conversation(s, thread);
		let solo = conversation.and_then(|conversation| solo_agent(s, conversation));
		let media = match (&solo, conversation) {
			(Some(agent), _) => agent.face(s, &thread.conversation_id).draw(24.0, t),
			(None, Some(conversation)) => subject_icon(conversation, 24.0, t),
			(None, None) => el(),
		};
		let name = solo.map_or_else(|| thread.title.clone(), |agent| agent.name);
		row()
			.h(36.0)
			.pl(6.0)
			.pr(10.0)
			.gap(SPACING * 2.0)
			.center_y()
			.radius(10.0)
			.hover(t.muted)
			.child(media)
			.child(text(name).font(TEXT_SM_MEDIUM).color(t.foreground))
			.child(el().size(6.0, 6.0).radius(3.0).fill(srgb(PRESENCE_ONLINE)))
			.child(icon(&icons::SETTINGS, 14.0).color(t.muted_foreground))
	});
	let header = row()
		.w_full()
		.h(HEADER)
		.pl(6.0)
		.pr(10.0)
		.pt(1.0)
		.center_y()
		.justify_between()
		.child(identity.unwrap_or_else(el))
		.child(s05_thread::pinned_panel(s, t, &thread_roster(s)));
	col().w_full().child(header).child(el().w_full().h(1.0).fill(t.shell_divider))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn roster_stamps_follow_the_age_rule_of_main() {
		let now = 1_762_400_000_000;
		assert_eq!(roster_timestamp(now - 30_000, now), "now");
		assert_eq!(roster_timestamp(now - 5 * 60_000, now), "5m");
		assert_eq!(roster_timestamp(now - 3 * 3_600_000, now), "3h");
		assert_eq!(roster_timestamp(now - 2 * 86_400_000, now), "2d");
		assert_eq!(roster_timestamp(now - 15 * 86_400_000, now), "2w");
		assert_eq!(roster_timestamp(1_757_980_800_000, now), "9/16");
	}
}
