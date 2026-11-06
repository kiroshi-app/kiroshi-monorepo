use std::borrow::Cow;
use std::time::{SystemTime, UNIX_EPOCH};

use rune::{
	Chrome, Color, Cursor, El, GrowthSpec, Icon, ScrollSpec, SurfaceFit, TextStyle, col, el, icon,
	row, text,
};
use rune_kit::Kit;
use rune_kit::markdown::{Markdown, MarkdownStyle};

use crate::app::{App, Ready, Thread, Workspace};
use crate::avatar::{Face, Motion};
use crate::composer;
use crate::content::{self, Run, Segment};
use crate::host::{DEV_START_COMMAND, HostError, Profile};
use crate::hues::Role as HueRole;
use crate::icons;
use crate::images::Slot;
use crate::math::Mode;
use crate::model::{Conversation, Role};
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_LG, SPACING, TEXT_10_MEDIUM, TEXT_BUBBLE, TEXT_COMPACT,
	TEXT_COMPACT_MONO, TEXT_COMPACT_SEMIBOLD, TEXT_SM, TEXT_SM_MEDIUM, TEXT_TITLE, TEXT_XS_MEDIUM,
	Tokens, conversation_icon, srgb, tone,
};
use crate::widgets::{Pill, not_drawn, spinner};

pub const CHROME: Chrome =
	Chrome { full_size_content: true, traffic_lights: Some((16.0, 14.0)), drag_regions: true };

const TITLE_BAR: f32 = 40.0;
const RAIL: f32 = 60.0;
const SHELL_INSET: f32 = 8.0;
const ROSTER: f32 = 304.0;
const ROSTER_PAD: f32 = 9.0;
const ROW: f32 = 52.0;
const ROW_GAP: f32 = 2.0;
const HEADER: f32 = 48.0;
const COLUMN: f32 = 720.0;
const COLUMN_INSET: f32 = 20.0;
const IMAGE_MAX_WIDTH: f32 = 420.0;

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

const ANCHORED_ROWS: usize = 40;

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
		.min_h(0.0)
		.mr(SHELL_INSET)
		.mb(SHELL_INSET)
		.radius(12.0)
		.clip_rounded(12.0)
		.fill(t.card)
		.border(1.0, t.shell_border)
		.child(roster(ready, t))
		.child(el().w(1.0).h_full().fill(t.shell_divider))
		.child(thread_column(s, k, t, viewport));
	col()
		.w_full()
		.h_full()
		.fill(t.background)
		.child(title_bar(s, t, viewport.inset))
		.child(row().w_full().grow(1.0).min_h(0.0).child(rail(ready, t)).child(card))
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

fn rail(ready: &Ready, t: &Tokens) -> El {
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
	let person: String = ready.person.as_deref().map_or_else(
		|| "?".to_owned(),
		|email| email.chars().take(2).collect::<String>().to_uppercase(),
	);
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
		.child(slot(&icons::CONVERSATIONS, true))
		.child(slot(&icons::MISSIONS, false))
		.child(el().grow(1.0))
		.child(
			el().size(28.0, 28.0)
				.radius(14.0)
				.fill(t.person_avatar)
				.center()
				.child(text(person).font(TEXT_10_MEDIUM).color(t.foreground)),
		)
}

fn roster(ready: &Ready, t: &Tokens) -> El {
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
	let tokens = *t;
	let now = now_ms();
	let rows = col().key("roster-rows").w_full().growth(GrowthSpec::default()).virtual_rows(
		ready.conversations.len(),
		ROW + ROW_GAP,
		|s: &App, i| {
			s.ready()
				.and_then(|ready| ready.conversations.get(i))
				.map_or(Cow::Borrowed("missing"), |held| Cow::Borrowed(held.id.as_str()))
		},
		move |s: &App, i| roster_row(s, i, &tokens, now),
	);
	col().w(ROSTER).h_full().padding(ROSTER_PAD).gap(SPACING * 2.0).child(header).child(
		col()
			.key("roster")
			.w_full()
			.grow(1.0)
			.min_h(0.0)
			.scroll(ScrollSpec { stick_bottom: false })
			.child(rows),
	)
}

fn roster_row(s: &App, i: usize, t: &Tokens, now: i64) -> El {
	let Some(conversation) = s.ready().and_then(|ready| ready.conversations.get(i)) else {
		return el();
	};
	let selected =
		s.thread.as_ref().is_some_and(|thread| thread.conversation_id == conversation.id);
	let solo = solo_agent(s, conversation);
	let media = match &solo {
		Some(agent) => agent.face(s, &conversation.id).draw(40.0, t.dark),
		None => subject_icon(conversation, 40.0, t),
	};
	let name = solo.as_ref().map_or(conversation.title.clone(), |agent| agent.name.clone());
	let ink = if selected { t.foreground } else { t.foreground.alpha(0.7) };
	let mut name_line = row()
		.w_full()
		.h(20.0)
		.gap(SPACING * 1.5)
		.center_y()
		.child(text(name).font(TEXT_SM_MEDIUM).color(ink).truncate().shrink());
	if let Some(agent) = solo.as_ref().filter(|agent| !agent.title.is_empty()) {
		name_line = name_line.child(title_badge(t, &agent.title));
	}
	let stamp =
		conversation.last_activity_at.map_or_else(String::new, |at| roster_timestamp(at, now));
	name_line = name_line.child(el().grow(1.0)).child(
		el().w(44.0)
			.child(text(stamp).font(TIMESTAMP).color(t.muted_foreground).align(rune::Align::End)),
	);
	let preview = conversation
		.last_word
		.as_ref()
		.and_then(|word| word.text.as_deref())
		.map_or_else(String::new, |words| s.mention_names(words).replace('\n', " "));
	let id = conversation.id.clone();
	let tile = row()
		.key(format!("row-{}", conversation.id))
		.w_full()
		.h(ROW)
		.pl(6.0)
		.pr(12.0)
		.py(6.0)
		.gap(10.0)
		.center_y()
		.radius(10.0)
		.cursor(Cursor::Pointer)
		.role("button")
		.on_press(move |s: &mut App| s.open(&id))
		.child(media)
		.child(
			col().grow(1.0).shrink().min_w(0.0).justify_center().child(name_line).child(
				el().w_full()
					.pr(14.0)
					.child(text(preview).font(TEXT_XS_MEDIUM).color(t.muted_foreground).truncate()),
			),
		);
	let tile = if selected { tile.fill(t.muted) } else { tile.hover(t.muted) };
	el().w_full().pb(ROW_GAP).child(tile)
}

struct SoloAgent {
	id: String,
	name: String,
	hue: Option<f32>,
	title: String,
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
	Some(SoloAgent {
		id: agent.id.clone(),
		name: agent.name.clone(),
		hue: agent.avatar_blot,
		title: agent.title.clone(),
	})
}

fn subject_icon(conversation: &Conversation, size: f32, t: &Tokens) -> El {
	let (ground, ink) = conversation_icon(conversation.color, t.dark);
	el().size(size, size)
		.radius(size * 0.3)
		.fill(ground)
		.center()
		.child(icon(&icons::MESSAGE, size * 0.45).color(ink))
}

fn title_badge(t: &Tokens, title: &str) -> El {
	el().px(6.0).py(2.0).radius(7.0).fill(t.foreground.alpha(0.1)).shrink().child(
		text(title.to_owned()).font(TEXT_10_MEDIUM).color(t.foreground.alpha(0.8)).truncate(),
	)
}

fn now_ms() -> i64 {
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
		.child(thread_header(s, t))
		.child(thread_view(s, k, t, viewport.transcript_height))
		.child(composer::view(s, k, t, &viewport.composer))
}

fn thread_header(s: &App, t: &Tokens) -> El {
	let identity = s.thread.as_ref().map(|thread| {
		let conversation = opened_conversation(s, thread);
		let solo = conversation.and_then(|conversation| solo_agent(s, conversation));
		let media = match (&solo, conversation) {
			(Some(agent), _) => agent.face(s, &thread.conversation_id).draw(24.0, t.dark),
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
		.child(el().size(28.0, 28.0).center().child(icon(&icons::PIN, 15.0).color(t.foreground)));
	col().w_full().child(header).child(el().w_full().h(1.0).fill(t.shell_divider))
}

fn thread_view(s: &App, k: &Kit, t: &Tokens, height: Option<f32>) -> El {
	let Some(thread) = s.thread.as_ref() else {
		return col()
			.w_full()
			.grow(1.0)
			.min_h(0.0)
			.center()
			.child(text("Pick a conversation.").font(TEXT_SM).color(t.muted_foreground));
	};
	if let Some(failure) = &thread.failure {
		return col().w_full().grow(1.0).min_h(0.0).center().padding(SPACING * 6.0).child(
			not_drawn(
				t,
				&format!("Couldn't read this conversation. {}", failure.title()),
				&failure.detail(),
			),
		);
	}
	if thread.is_loading() {
		return col()
			.w_full()
			.grow(1.0)
			.min_h(0.0)
			.center()
			.child(spinner(t.input, t.muted_foreground));
	}
	if thread.row_count() == 0 {
		return empty_thread(thread, t);
	}
	let scroller = col()
		.key(format!("thread-{}", thread.conversation_id))
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.scroll(ScrollSpec { stick_bottom: true })
		.scroll_edge_fade(16.0);
	let viewport = col().key(TRANSCRIPT).w_full().grow(1.0).min_h(0.0);
	if thread.row_count() <= ANCHORED_ROWS {
		let rows = (0..thread.row_count())
			.map(|i| message_row(s, i, k, t).key(row_key(s, i).into_owned()));
		let anchored = col()
			.key("thread-rows")
			.w_full()
			.min_h(height.unwrap_or(0.0))
			.justify_end()
			.pt(SPACING * 4.0)
			.children(rows);
		return viewport.child(scroller.child(anchored));
	}
	let kit = k.clone();
	let tokens = *t;
	let rows = col()
		.key("thread-rows")
		.w_full()
		.pt(SPACING * 4.0)
		.growth(GrowthSpec::default())
		.virtual_rows(thread.row_count(), 120.0, row_key, move |s: &App, i| {
			message_row(s, i, &kit, &tokens)
		});
	viewport.child(scroller.child(rows))
}

const EMPTY_NAME: TextStyle = TextStyle { line_height: 28.0, ..TextStyle::new(18.0, 600.0) };

fn empty_thread(thread: &Thread, t: &Tokens) -> El {
	let seat = thread.seats.first();
	let name = seat.map_or_else(|| thread.title.clone(), |seat| seat.name.clone());
	let identity = col()
		.items_center()
		.gap(SPACING * 2.0)
		.child(text(name.clone()).font(EMPTY_NAME).color(t.foreground))
		.child(
			text(format!("Kiroshi talks to {name} directly. Nothing leaves your device."))
				.font(TEXT_SM)
				.color(t.muted_foreground),
		);
	let hint = row()
		.gap(SPACING)
		.center_y()
		.child(text("Message an agent to start.").font(TEXT_XS_MEDIUM).color(t.muted_foreground))
		.child(icon(&icons::ARROW_DOWN, 12.0).color(t.muted_foreground));
	let state = col()
		.items_center()
		.gap(SPACING * 5.0)
		.py(48.0)
		.px(SPACING * 6.0)
		.child(Face::still(&name, seat.and_then(|seat| seat.hue)).draw(64.0, t.dark))
		.child(identity)
		.child(hint);
	col().w_full().grow(1.0).min_h(0.0).center().child(state)
}

fn row_key(s: &App, i: usize) -> Cow<'_, str> {
	let Some(thread) = s.thread.as_ref() else { return Cow::Borrowed("missing") };
	match thread.messages.get(i) {
		Some(message) => Cow::Borrowed(message.id.as_str()),
		None => thread
			.live
			.get(i - thread.messages.len())
			.map_or(Cow::Borrowed("missing"), |live| Cow::Owned(format!("live-{}", live.id))),
	}
}

struct Shown<'a> {
	role: Role,
	author: Option<String>,
	bot_id: Option<&'a str>,
	content: &'a str,
	streaming: bool,
}

fn shown(s: &App, i: usize) -> Option<Shown<'_>> {
	let thread = s.thread.as_ref()?;
	if let Some(message) = thread.messages.get(i) {
		let bot_id = message.author_bot_id.as_deref();
		let author = bot_id.and_then(|id| s.agent_name(id)).or_else(|| message.author_name.clone());
		return Some(Shown {
			role: message.role,
			author,
			bot_id,
			content: &message.content,
			streaming: false,
		});
	}
	let live = thread.live.get(i - thread.messages.len())?;
	Some(Shown {
		role: Role::Assistant,
		author: s.agent_name(&live.bot_id),
		bot_id: Some(&live.bot_id),
		content: &live.text,
		streaming: true,
	})
}

fn message_row(s: &App, i: usize, k: &Kit, t: &Tokens) -> El {
	let Some(message) = shown(s, i) else { return el() };
	let named = s.mention_names(message.content);
	let width = COLUMN - 2.0 * COLUMN_INSET;
	let column = row().w(width).shrink();
	let frame = row().w_full().justify_center().px(COLUMN_INSET).py(6.0);
	if message.role == Role::User {
		let footer = row()
			.w_full()
			.justify_end()
			.gap(SPACING * 1.5)
			.center_y()
			.child(
				el().size(18.0, 18.0)
					.radius(9.0)
					.fill(t.user_bubble_foreground.alpha(0.2))
					.center()
					.child(text("Y").font(TEXT_10_MEDIUM).color(t.user_bubble_foreground)),
			)
			.child(text("You").font(TEXT_COMPACT_SEMIBOLD).color(t.user_bubble_foreground));
		let bubble = col()
			.max_w(width * 0.85)
			.padding(18.0)
			.gap(SPACING * 2.0)
			.radius(RADIUS_BUBBLE)
			.fill(t.user_bubble)
			.child(
				text(named)
					.font(TEXT_BUBBLE)
					.color(t.user_bubble_foreground)
					.wrap()
					.selectable(true),
			)
			.child(footer);
		return frame.child(column.justify_end().child(bubble));
	}
	let name = message.author.unwrap_or_else(|| "Agent".to_owned());
	let hue = message.bot_id.and_then(|id| s.agent_hue(id));
	let accent = hue.map_or(t.primary, |hue| tone(hue, t.dark, HueRole::Accent));
	let motion = match (message.streaming, message.bot_id, s.thread.as_ref()) {
		(true, Some(bot_id), Some(thread)) => s.motion(&thread.conversation_id, bot_id),
		_ => Motion::Still,
	};
	let footer = row()
		.gap(SPACING * 1.5)
		.center_y()
		.child(Face { name: &name, hue, motion }.draw(18.0, t.dark))
		.child(text(name).font(TEXT_COMPACT_SEMIBOLD).color(accent));
	let body = content::segments(&named)
		.into_iter()
		.fold(col().w_full().gap(SPACING * 2.0), |body, segment| {
			body.child(segment_view(s, segment, message.streaming, k, t))
		});
	let bubble = col()
		.max_w(width * 0.85)
		.padding(18.0)
		.gap(SPACING * 2.0)
		.radius(RADIUS_BUBBLE)
		.fill(t.bubble)
		.child(body)
		.child(footer);
	frame.child(column.child(bubble))
}

fn markdown_style(k: &Kit, t: &Tokens) -> MarkdownStyle {
	let diagram = mermaid_theme(t.dark);
	MarkdownStyle::from_kit(k)
		.body_font(TEXT_BUBBLE)
		.text(t.foreground)
		.muted(t.muted_foreground)
		.link(t.primary)
		.code_block(t.card, t.border)
		.code_block_font(TEXT_COMPACT_MONO)
		.inline_code_bg(t.foreground.alpha(0.06))
		.rule(t.border)
		.quote_rule(t.border)
		.table(t.foreground.alpha(0.15), t.foreground.alpha(0.05))
		.table_rules(t.foreground.alpha(0.1))
		.table_header_weight(600.0)
		.table_cell_padding(12.0, 8.0)
		.table_min_column(0.0)
		.diagram(diagram.node_fill, diagram.node_border, diagram.line)
		.diagram_surface(Color::TRANSPARENT, t.foreground.alpha(0.15), diagram.node_fill)
		.diagram_font(TextStyle { line_height: 24.0, ..TextStyle::new(16.0, 400.0) })
}

struct DiagramTheme {
	node_fill: Color,
	node_border: Color,
	line: Color,
}

fn mermaid_theme(dark: bool) -> DiagramTheme {
	if dark {
		return DiagramTheme {
			node_fill: srgb(0x1f2020),
			node_border: srgb(0xcccccc),
			line: srgb(0xd3d3d3),
		};
	}
	DiagramTheme { node_fill: srgb(0xeeeeee), node_border: srgb(0x999999), line: srgb(0x666666) }
}

fn segment_view(s: &App, segment: Segment, streaming: bool, k: &Kit, t: &Tokens) -> El {
	match segment {
		Segment::Markdown(source) => Markdown::new(source)
			.streaming(streaming)
			.selectable(true)
			.render(&markdown_style(k, t)),
		Segment::Math(source) => display_math(s, &source, t),
		Segment::Prose(runs) => prose_with_math(s, &runs, t),
		Segment::Image { alt, url } => image_view(s, &alt, &url, t),
	}
}

const BUBBLE_TEXT_SIZE: f32 = 14.0;
const BUBBLE_BASELINE: f32 = 16.0;
const SPACE_WIDTH: f32 = 3.5;
const DISPLAY_MATH_MARGIN: f32 = 14.0;

fn display_math(s: &App, source: &str, t: &Tokens) -> El {
	let typeset = s.math.formula(source, Mode::Display, t.foreground, BUBBLE_TEXT_SIZE);
	let formula = match typeset {
		Ok(formula) => formula.view(source),
		Err(_) => unparsed_math(source, t),
	};
	row().w_full().justify_center().py(DISPLAY_MATH_MARGIN).child(formula)
}

fn unparsed_math(source: &str, t: &Tokens) -> El {
	text(source.to_owned()).font(TEXT_BUBBLE).color(t.destructive).wrap()
}

fn prose_with_math(s: &App, runs: &[Run], t: &Tokens) -> El {
	let mut flow = row().w_full().flex_wrap();
	let mut spaced = false;
	for run in runs {
		match run {
			Run::Math(source) => {
				let typeset = s.math.formula(source, Mode::Inline, t.foreground, BUBBLE_TEXT_SIZE);
				let formula = match typeset {
					Ok(formula) => el()
						.h(TEXT_BUBBLE.line_height)
						.child(formula.view(source).mt(BUBBLE_BASELINE - formula.baseline)),
					Err(_) => unparsed_math(source, t),
				};
				flow = flow.child(formula.ml(if spaced { SPACE_WIDTH } else { 0.0 }));
				spaced = false;
			}
			Run::Text(words) => {
				let mut pieces = words.split(char::is_whitespace).peekable();
				let leading = words.starts_with(char::is_whitespace);
				spaced = spaced || leading;
				while let Some(word) = pieces.next() {
					let plain = word.replace(['*', '`'], "");
					if !plain.is_empty() {
						flow = flow.child(
							text(plain).font(TEXT_BUBBLE).color(t.foreground).ml(if spaced {
								SPACE_WIDTH
							} else {
								0.0
							}),
						);
						spaced = false;
					}
					if pieces.peek().is_some() {
						spaced = true;
					}
				}
			}
		}
	}
	flow
}

fn image_view(s: &App, alt: &str, url: &str, t: &Tokens) -> El {
	match s.images.slot(url) {
		Some(Slot::Ready(image)) => match image.size() {
			Some([width, height]) if width > 0 => {
				let drawn_width = (width as f32 / 2.0).min(IMAGE_MAX_WIDTH);
				let drawn_height = drawn_width * height as f32 / width as f32;
				el().size(drawn_width, drawn_height)
					.radius(RADIUS_LG)
					.border(1.0, t.image_outline)
					.label(alt)
					.pixels_fit(image.pixels(), SurfaceFit::Fit)
			}
			_ => match image.error() {
				Some(failure) => not_drawn(t, &format!("Image not drawn: {alt}"), &failure.0),
				None => not_drawn(t, &format!("Loading {alt}…"), ""),
			},
		},
		Some(Slot::Failed(failure)) => not_drawn(t, &format!("Image not drawn: {alt}"), failure),
		Some(Slot::Loading) | None => not_drawn(t, &format!("Loading {alt}…"), ""),
	}
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
