use std::ops::Range;
use std::rc::Rc;

use rune::{Color, El, TextStyle, col, el, row, text};
use rune_kit::markdown::{Highlight, Markdown, MarkdownStyle};

use super::{Agent, Context, ThreadEvent};
use crate::math::Mode;
use crate::tokens::{SPACING, TEXT_BUBBLE, TEXT_COMPACT_MONO, Tokens};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Surface {
	Agent,
	Own,
}

pub struct Body<'a> {
	pub turn: &'a str,
	pub source: &'a str,
	pub surface: Surface,
	pub streaming: bool,
}

pub fn body<S: 'static>(cx: &Context<S>, shown: &Body) -> El {
	let ink = Ink::on(cx.t, shown.surface);
	segments(shown.source).into_iter().fold(col().w_full().gap(SPACING * 2.0), |flow, segment| {
		flow.child(match segment {
			Segment::Markdown(source) => markdown(cx, shown, &ink, &source),
			Segment::Math(source) => display_math(cx, &ink, &source),
			Segment::Prose(runs) => prose_with_math(cx, &ink, &runs),
		})
	})
}

struct Ink {
	text: Color,
	muted: Color,
	link: Color,
	code: Color,
	mention: Color,
}

impl Ink {
	fn on(t: &Tokens, surface: Surface) -> Ink {
		match surface {
			Surface::Agent => Ink {
				text: t.foreground,
				muted: t.muted_foreground,
				link: t.primary,
				code: t.foreground.alpha(0.05),
				mention: t.foreground.alpha(0.1),
			},
			Surface::Own => Ink {
				text: t.user_bubble_foreground,
				muted: t.user_bubble_muted_foreground,
				link: t.user_bubble_foreground,
				code: t.user_bubble_foreground.alpha(0.2),
				mention: t.user_bubble_foreground.alpha(0.1),
			},
		}
	}
}

const DIAGRAM_FONT: TextStyle = TextStyle { line_height: 24.0, ..TextStyle::new(16.0, 400.0) };
const TABLE_CELL_PADDING: (f32, f32) = (SPACING * 3.0, SPACING * 2.0);

fn style(t: &Tokens, ink: &Ink) -> MarkdownStyle {
	MarkdownStyle::from_kit(&t.kit())
		.body_font(TEXT_BUBBLE)
		.text(ink.text)
		.muted(ink.muted)
		.link(ink.link)
		.code_block(ink.code, t.border)
		.code_block_font(TEXT_COMPACT_MONO)
		.inline_code_bg(ink.code)
		.rule(t.border)
		.quote_rule(t.border)
		.table(ink.text.alpha(0.15), ink.text.alpha(0.05))
		.table_rules(ink.text.alpha(0.1))
		.table_header_weight(600.0)
		.table_cell_padding(TABLE_CELL_PADDING.0, TABLE_CELL_PADDING.1)
		.table_min_column(0.0)
		.diagram(t.secondary, t.muted_foreground, t.soft_foreground)
		.diagram_surface(Color::TRANSPARENT, ink.text.alpha(0.15), t.secondary)
		.diagram_font(DIAGRAM_FONT)
		.selection(t.selection)
}

fn markdown<S: 'static>(cx: &Context<S>, shown: &Body, ink: &Ink, source: &str) -> El {
	let (named, mentions) = with_mentions(source, cx.roster);
	let chip = Highlight::new().bg(ink.mention).fg(ink.text);
	let emit = Rc::clone(cx.emit);
	let on_link = move |s: &mut S, url: &str| emit(s, ThreadEvent::OpenLink(url.to_owned()));
	let emit = Rc::clone(cx.emit);
	let turn = shown.turn.to_owned();
	let on_task = move |s: &mut S, _: &str, marker: usize, checked: bool| {
		emit(s, ThreadEvent::ToggleTask { turn: turn.clone(), marker, checked });
	};
	Markdown::new(named)
		.streaming(shown.streaming)
		.selectable(true)
		.highlights(mentions.into_iter().map(|range| (range, chip.clone())))
		.on_link(on_link)
		.on_task(on_task)
		.render(&style(cx.t, ink))
}

const MENTION_OPEN: &str = "<@";

fn with_mentions(source: &str, roster: &[Agent]) -> (String, Vec<Range<usize>>) {
	let mut written = String::with_capacity(source.len());
	let mut ranges = Vec::new();
	let mut rest = source;
	while let Some(at) = rest.find(MENTION_OPEN) {
		written.push_str(&rest[..at]);
		let after = &rest[at + MENTION_OPEN.len()..];
		let Some(end) = after.find('>').filter(|&end| is_agent_id(&after[..end])) else {
			written.push_str(MENTION_OPEN);
			rest = after;
			continue;
		};
		let id = &after[..end];
		let name = roster.iter().find(|agent| agent.id == id).map_or(id, |agent| &agent.name);
		let start = written.len();
		written.push('@');
		written.push_str(name);
		ranges.push(start..written.len());
		rest = &after[end + 1..];
	}
	written.push_str(rest);
	(written, ranges)
}

fn is_agent_id(id: &str) -> bool {
	!id.is_empty() && id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

const BUBBLE_TEXT_SIZE: f32 = 14.0;
const BUBBLE_BASELINE: f32 = 16.0;
const SPACE_WIDTH: f32 = 3.5;
const DISPLAY_MATH_MARGIN: f32 = 14.0;

fn display_math<S>(cx: &Context<S>, ink: &Ink, source: &str) -> El {
	let formula = match cx.math.formula(source, Mode::Display, ink.text, BUBBLE_TEXT_SIZE) {
		Ok(formula) => formula.view(source),
		Err(_) => unparsed_math(cx.t, source),
	};
	row().w_full().justify_center().py(DISPLAY_MATH_MARGIN).child(formula)
}

fn unparsed_math(t: &Tokens, source: &str) -> El {
	text(source.to_owned()).font(TEXT_BUBBLE).color(t.destructive).wrap()
}

fn prose_with_math<S>(cx: &Context<S>, ink: &Ink, runs: &[Run]) -> El {
	let mut flow = row().w_full().flex_wrap();
	let mut spaced = false;
	let gap = |spaced: bool| if spaced { SPACE_WIDTH } else { 0.0 };
	for run in runs {
		match run {
			Run::Math(source) => {
				let formula =
					match cx.math.formula(source, Mode::Inline, ink.text, BUBBLE_TEXT_SIZE) {
						Ok(formula) => el()
							.h(TEXT_BUBBLE.line_height)
							.child(formula.view(source).mt(BUBBLE_BASELINE - formula.baseline)),
						Err(_) => unparsed_math(cx.t, source),
					};
				flow = flow.child(formula.ml(gap(spaced)));
				spaced = false;
			}
			Run::Text(words) => {
				let (named, _) = with_mentions(words, cx.roster);
				spaced = spaced || named.starts_with(char::is_whitespace);
				let mut pieces = named.split(char::is_whitespace).peekable();
				while let Some(word) = pieces.next() {
					let plain = word.replace(['*', '`'], "");
					if !plain.is_empty() {
						flow = flow
							.child(text(plain).font(TEXT_BUBBLE).color(ink.text).ml(gap(spaced)));
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

#[derive(Clone, Debug, PartialEq, Eq)]
enum Segment {
	Markdown(String),
	Math(String),
	Prose(Vec<Run>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum Run {
	Text(String),
	Math(String),
}

const MATH_FENCE: &str = "$$";

fn segments(content: &str) -> Vec<Segment> {
	let mut built = Segments::default();
	let mut fence: Option<&str> = None;
	let mut math: Option<String> = None;
	for line in content.split_inclusive('\n') {
		let trimmed = line.trim();
		if let Some(open) = fence {
			built.text(line);
			if trimmed.starts_with(open) {
				fence = None;
			}
			continue;
		}
		if let Some(source) = math.as_mut() {
			if trimmed.ends_with(MATH_FENCE) {
				source.push_str(trimmed.trim_end_matches(MATH_FENCE));
				built.push(Segment::Math(source.trim().to_owned()));
				math = None;
			} else {
				source.push_str(line);
			}
			continue;
		}
		if let Some(open) = fence_opening(trimmed) {
			fence = Some(open);
			built.text(line);
			continue;
		}
		if let Some(inner) = trimmed.strip_prefix(MATH_FENCE) {
			match inner.strip_suffix(MATH_FENCE) {
				Some(single) => built.push(Segment::Math(single.trim().to_owned())),
				None => math = Some(format!("{inner}\n")),
			}
			continue;
		}
		match inline_runs(line).filter(|_| !trimmed.starts_with('|')) {
			Some(runs) => built.push(Segment::Prose(runs)),
			None => built.text(line),
		}
	}
	if let Some(unclosed) = math {
		built.text(&format!("{MATH_FENCE}{unclosed}"));
	}
	built.finish()
}

fn inline_runs(line: &str) -> Option<Vec<Run>> {
	let mut runs: Vec<Run> = Vec::new();
	let mut written = String::new();
	let mut rest = line.trim_end_matches('\n');
	while let Some(at) = rest.find(['`', '$', '\\']) {
		written.push_str(&rest[..at]);
		let from = &rest[at..];
		let mark = from.as_bytes()[0];
		if mark == b'\\' {
			let escaped = from.chars().take(2).collect::<String>();
			written.push_str(&escaped);
			rest = &from[escaped.len()..];
			continue;
		}
		let opening = from.bytes().take_while(|&byte| byte == mark).count();
		let Some((inner, after)) = closed_by(&from[opening..], mark, opening) else {
			written.push_str(&from[..opening]);
			rest = &from[opening..];
			continue;
		};
		if mark == b'`' {
			written.push_str(&from[..from.len() - after.len()]);
		} else {
			runs.push(Run::Text(std::mem::take(&mut written)));
			runs.push(Run::Math(inner.trim().to_owned()));
		}
		rest = after;
	}
	written.push_str(rest);
	if !runs.iter().any(|run| matches!(run, Run::Math(_))) {
		return None;
	}
	runs.push(Run::Text(written));
	runs.retain(|run| !matches!(run, Run::Text(held) if held.is_empty()));
	Some(runs)
}

fn closed_by(after: &str, mark: u8, size: usize) -> Option<(&str, &str)> {
	let bytes = after.as_bytes();
	let mut at = 0;
	while at < bytes.len() {
		if bytes[at] != mark {
			at += 1;
			continue;
		}
		let run = bytes[at..].iter().take_while(|&&byte| byte == mark).count();
		if run == size && at > 0 {
			return Some((&after[..at], &after[at + run..]));
		}
		at += run;
	}
	None
}

fn fence_opening(trimmed: &str) -> Option<&'static str> {
	["```", "~~~"].into_iter().find(|marker| trimmed.starts_with(marker))
}

#[derive(Default)]
struct Segments {
	done: Vec<Segment>,
	text: String,
}

impl Segments {
	fn text(&mut self, line: &str) {
		self.text.push_str(line);
	}

	fn push(&mut self, segment: Segment) {
		self.flush();
		self.done.push(segment);
	}

	fn flush(&mut self) {
		if !self.text.trim().is_empty() {
			self.done.push(Segment::Markdown(std::mem::take(&mut self.text)));
		}
		self.text.clear();
	}

	fn finish(mut self) -> Vec<Segment> {
		self.flush();
		self.done
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn inline_math_follows_remark_math_and_skips_code_spans() {
		assert_eq!(
			segments("costs 2,19 $/mois + volume 0,15 $/Go\n"),
			vec![Segment::Prose(vec![
				Run::Text("costs 2,19 ".into()),
				Run::Math("/mois + volume 0,15".into()),
				Run::Text("/Go".into()),
			])]
		);
		let table = "| a | $x$ |\n| --- | --- |\n";
		assert_eq!(segments(table), vec![Segment::Markdown(table.into())]);
		assert_eq!(
			segments("run `echo $A $B` now\n"),
			vec![Segment::Markdown("run `echo $A $B` now\n".into())]
		);
	}

	#[test]
	fn a_display_math_block_becomes_its_own_segment_but_stays_code_in_a_fence() {
		let split = segments("see\n$$\na^2 + b^2\n$$\ndone");
		assert_eq!(split[1], Segment::Math("a^2 + b^2".into()));
		assert_eq!(split.len(), 3);
		let fenced = "```md\n$$a$$\n```\n";
		assert_eq!(segments(fenced), vec![Segment::Markdown(fenced.into())]);
	}

	#[test]
	fn a_mention_reads_as_the_roster_name_and_marks_its_range() {
		let roster = [Agent { id: "b-1".into(), name: "Wren".into(), hue: None, badge: None }];
		let (named, ranges) = with_mentions("ask <@b-1> and <@b-2>", &roster);
		assert_eq!(named, "ask @Wren and @b-2");
		assert_eq!(ranges, vec![4..9, 14..18]);
	}
}
