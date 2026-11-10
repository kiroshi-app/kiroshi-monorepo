use std::rc::Rc;

use rune::{Cursor, El, TextStyle, col, el, icon, row, text};

use super::turn::{author_name, retry};
use super::{Agent, Context, ThreadEvent, fill};
use crate::avatar::{Activity, Face, Motion};
use crate::icons;
use crate::primitives::{FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::{Key, chat};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_SM, SPACING, TEXT_COMPACT, TEXT_COMPACT_SEMIBOLD, TEXT_XS,
	TEXT_XS_MEDIUM, Tokens,
};

const LINE: f32 = SPACING * 5.0;
const LINE_XS: TextStyle = TextStyle { line_height: LINE, ..TEXT_XS };
const LINE_XS_MEDIUM: TextStyle = TextStyle { line_height: LINE, ..TEXT_XS_MEDIUM };
const LINE_COMPACT: TextStyle = TextStyle { line_height: LINE, ..TEXT_COMPACT };
const LINE_COMPACT_SEMIBOLD: TextStyle = TextStyle { line_height: LINE, ..TEXT_COMPACT_SEMIBOLD };
const GLYPH: f32 = SPACING * 3.5;
const BUBBLE_INSET: f32 = SPACING * 4.5;

pub fn day_separator(t: &Tokens, label: &str) -> El {
	row()
		.w_full()
		.justify_center()
		.child(text(label.to_owned()).font(LINE_XS_MEDIUM).color(t.muted_foreground))
}

pub fn new_messages(t: &Tokens, label: &str) -> El {
	row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.child(el().h(1.0).grow(1.0).fill(t.transcript_new_mark).a11y_hidden())
		.child(text(label.to_owned()).font(LINE_XS_MEDIUM).color(t.transcript_new_mark))
		.child(el().h(1.0).grow(1.0).fill(t.transcript_new_mark).a11y_hidden())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkState {
	Thinking,
	Writing,
	Tool,
	UpNext,
	Waiting,
	Failed,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WorkingAgent {
	pub agent: Agent,
	pub state: WorkState,
	pub label: Option<String>,
	pub elapsed: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WorkLine {
	pub id: String,
	pub agents: Vec<WorkingAgent>,
	pub open: bool,
}

pub fn work_line<S: 'static>(cx: &Context<S>, line: &WorkLine) -> El {
	let t = cx.t;
	let (failed, working): (Vec<&WorkingAgent>, Vec<&WorkingAgent>) =
		line.agents.iter().partition(|agent| agent.state == WorkState::Failed);
	let mut lines = col().w_full().min_w(0.0).gap(SPACING * 2.0).pl(BUBBLE_INSET);
	for agent in failed {
		lines = lines.child(failed_line(cx, agent));
	}
	if working.is_empty() {
		return lines;
	}
	let mut head = row().h(LINE).w_full().min_w(0.0).gap(SPACING * 2.0).center_y();
	head = head.child(faces(t, &working));
	head = headline(cx, head, &working);
	if working.len() > 1
		&& let Some(parts) = breakdown(cx, &working)
	{
		head = head.child(text(parts).font(LINE_XS).color(t.muted_foreground).truncate());
	}
	if let Some(elapsed) = working.first().and_then(|agent| agent.elapsed.as_ref()) {
		head = head.child(text(elapsed.clone()).font(LINE_XS).color(t.muted_foreground));
	}
	if working.len() > 1 {
		head = head.child(el().grow(1.0)).child(toggle(cx, line));
	}
	lines = lines.child(head);
	if line.open && working.len() > 1 {
		lines = lines.child(detail(cx, &working));
	}
	lines
}

const PILE_SHOWN: usize = 2;

fn faces(t: &Tokens, working: &[&WorkingAgent]) -> El {
	let shown = if working.len() > PILE_SHOWN + 1 { PILE_SHOWN } else { working.len() };
	let mut pile =
		row().gap(-SPACING).center_y().children(working.iter().take(shown).map(|agent| {
			let motion = match agent.state {
				WorkState::Thinking => Motion::Running { activity: Activity::Thinking, at_ms: 0.0 },
				WorkState::Writing => Motion::Running { activity: Activity::Writing, at_ms: 0.0 },
				WorkState::Tool => Motion::Running { activity: Activity::Working, at_ms: 0.0 },
				_ => Motion::Still,
			};
			Face { name: &agent.agent.name, hue: agent.agent.hue, image: None, motion }
				.draw(LINE, t)
		}));
	let hidden = working.len() - shown;
	if hidden > 0 {
		let more = format!("+{hidden}");
		pile = pile.child(
			row()
				.h(LINE)
				.min_w(LINE)
				.px(SPACING)
				.radius(LINE / 2.0)
				.fill(t.conversation_pile_overflow)
				.center()
				.label(&more)
				.child(
					text(more.clone())
						.font(LINE_XS_MEDIUM)
						.color(t.conversation_pile_overflow_foreground),
				),
		);
	}
	pile
}

fn breakdown<S>(cx: &Context<S>, working: &[&WorkingAgent]) -> Option<String> {
	use chat::work_line::breakdown;
	let order = [
		(WorkState::Writing, breakdown::WRITING_ONE, breakdown::WRITING_OTHER),
		(WorkState::Tool, breakdown::TOOL_ONE, breakdown::TOOL_OTHER),
		(WorkState::Thinking, breakdown::THINKING_ONE, breakdown::THINKING_OTHER),
		(WorkState::UpNext, breakdown::UP_NEXT_ONE, breakdown::UP_NEXT_OTHER),
	];
	let parts: Vec<String> = order
		.into_iter()
		.filter_map(|(state, one, other)| {
			let count = working.iter().filter(|agent| agent.state == state).count();
			let key = if count == 1 { one } else { other };
			(count > 0).then(|| fill(cx.say(key), &[("count", &count.to_string())]))
		})
		.collect();
	let separator = cx.say(chat::working::line::SEPARATOR);
	(!parts.is_empty()).then(|| {
		parts.iter().map(|part| format!("{separator} {part}")).collect::<Vec<_>>().join(" ")
	})
}

fn verb(state: WorkState) -> Key {
	match state {
		WorkState::Thinking => chat::working::verb::THINKING,
		WorkState::Writing => chat::working::verb::WRITING,
		WorkState::Waiting => chat::working::verb::WAITING,
		_ => chat::working::verb::WORKING,
	}
}

fn state_text<S>(cx: &Context<S>, agent: &WorkingAgent) -> String {
	let line = match agent.state {
		WorkState::UpNext => cx.say(chat::working::line::UP_NEXT).to_owned(),
		state => fill(cx.say(chat::working::line::STATE), &[("verb", cx.say(verb(state)))]),
	};
	match &agent.label {
		Some(label) => format!("{line} {} {label}", cx.say(chat::working::line::SEPARATOR)),
		None => line,
	}
}

fn headline<S>(cx: &Context<S>, head: El, working: &[&WorkingAgent]) -> El {
	let t = cx.t;
	let soft = |words: String| text(words).font(LINE_COMPACT).color(t.soft_foreground).truncate();
	match working {
		[only] => {
			let ink = if only.state == WorkState::Waiting {
				t.waiting_foreground
			} else {
				t.soft_foreground
			};
			head.child(author_name(t, &only.agent))
				.child(text(state_text(cx, only)).font(LINE_COMPACT).color(ink).truncate())
		}
		[first, second] => head
			.child(author_name(t, &first.agent))
			.child(soft(cx.say(chat::work_line::AND).to_owned()))
			.child(author_name(t, &second.agent))
			.child(soft(cx.say(chat::work_line::STATE_OTHER).to_owned())),
		many => {
			let count = many.len().to_string();
			head.child(
				text(fill(cx.say(chat::work_line::AGENTS_OTHER), &[("count", &count)]))
					.font(LINE_COMPACT_SEMIBOLD)
					.color(t.foreground),
			)
			.child(soft(cx.say(chat::work_line::STATE_OTHER).to_owned()))
		}
	}
}

fn toggle<S: 'static>(cx: &Context<S>, line: &WorkLine) -> El {
	let t = cx.t;
	let emit = Rc::clone(cx.emit);
	let id = line.id.clone();
	let glyph = if line.open { &icons::CHEVRON_UP } else { &icons::CHEVRON_DOWN };
	instant(
		el().size(LINE, LINE)
			.radius(RADIUS_SM)
			.center()
			.hover(t.muted)
			.hover_group()
			.role("button")
			.label(cx.say(chat::work_line::TOGGLE))
			.expanded(line.open)
			.child(icon(glyph, GLYPH).color(t.muted_foreground).group_color(t.foreground)),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, ThreadEvent::ToggleWork(id.clone())))
}

fn detail<S>(cx: &Context<S>, working: &[&WorkingAgent]) -> El {
	let t = cx.t;
	col()
		.w_full()
		.gap(SPACING * 2.0)
		.padding(SPACING * 3.0)
		.radius(RADIUS_CONTROL)
		.fill(t.foreground.alpha(0.04))
		.children(working.iter().map(|agent| {
			let mut line = row()
				.h(LINE)
				.min_w(0.0)
				.gap(SPACING * 2.0)
				.center_y()
				.child(Face::still(&agent.agent.name, agent.agent.hue).draw(LINE, t))
				.child(author_name(t, &agent.agent))
				.child(
					text(state_text(cx, agent))
						.font(LINE_COMPACT)
						.color(t.soft_foreground)
						.truncate(),
				);
			if let Some(elapsed) = &agent.elapsed {
				line = line.child(text(elapsed.clone()).font(LINE_XS).color(t.muted_foreground));
			}
			line
		}))
}

fn failed_line<S: 'static>(cx: &Context<S>, agent: &WorkingAgent) -> El {
	let t = cx.t;
	let label = fill(cx.say(chat::work_line::RETRY), &[("name", &agent.agent.name)]);
	row()
		.h(LINE)
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(Face::still(&agent.agent.name, agent.agent.hue).draw(LINE, t))
		.child(author_name(t, &agent.agent))
		.child(
			text(cx.say(chat::turn::footer::FAILED)).font(LINE_XS).color(t.destructive).truncate(),
		)
		.child(retry(cx, &agent.agent.id, &label))
}
