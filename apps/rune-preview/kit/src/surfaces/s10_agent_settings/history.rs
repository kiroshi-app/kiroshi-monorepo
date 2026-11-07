use rune::{Cursor, El, TextEdit, TextStyle, col, icon, row, text};

use super::parts::{
	Density, PANEL_GAP, PANEL_INSET, SMALL_GLYPH, bar, button, empty, notice, rule, skeleton_rows,
	spacer_line,
};
use super::shell::{RailItem, pushed};
use super::{Event, Field, Host, counted, fill, say};
use crate::avatar::{Face, Person};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::input::{InputSize, input};
use crate::primitives::skeleton::skeleton;
use crate::primitives::{FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::bots::history;
use crate::tokens::{
	RADIUS_LG, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM,
	TEXT_XS_MONO, Tokens, faded,
};

const AUTHOR_MARK: f32 = SPACING * 5.0;
const TIME_WIDTH: f32 = SPACING * 10.0;
const ROW_INSET: f32 = SPACING * 2.0;
const DIFF_TINT: f32 = 0.15;
const GUTTER: f32 = SPACING * 8.0;
const TABULAR: &str = "'tnum' 1";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Author {
	Agent,
	You,
}

pub struct Change<'a> {
	pub id: &'a str,
	pub author: Author,
	pub sentence: &'a str,
	pub detail: Option<&'a str>,
	pub time: &'a str,
	pub retouches: usize,
	pub undone: bool,
}

pub struct Day<'a> {
	pub label: &'a str,
	pub changes: &'a [Change<'a>],
}

pub struct Authors<'a> {
	pub agent: &'a str,
	pub hue: Option<f32>,
	pub reader: &'a str,
}

pub struct HistoryList<'a> {
	pub days: Option<&'a [Day<'a>]>,
	pub failed: bool,
	pub oldest: &'a str,
	pub authors: Authors<'a>,
	pub search: Option<&'a TextEdit>,
	pub openable: bool,
}

fn tabular(style: TextStyle) -> TextStyle {
	TextStyle { features: TABULAR, ..style }
}

pub fn history_panel<S: Host>(t: &Tokens, density: Density, list: &HistoryList) -> El {
	if list.failed {
		return empty(
			t,
			&icons::TRIANGLE_ALERT,
			t.destructive,
			None,
			say(history::UNAVAILABLE),
			None,
		);
	}
	let Some(days) = list.days else {
		return skeleton_rows(Some(bar(t, SPACING * 80.0, SPACING * 4.0)), || {
			row()
				.w_full()
				.padding(ROW_INSET)
				.gap(SPACING * 2.5)
				.center_y()
				.child(skeleton(t).size(AUTHOR_MARK, AUTHOR_MARK))
				.child(col().grow(1.0).gap(SPACING).child(bar(t, SPACING * 64.0, SPACING * 3.5)))
				.child(bar(t, TIME_WIDTH, SPACING * 3.0))
		});
	};
	let count: usize = days.iter().map(|day| day.changes.len()).sum();
	if count == 0 && list.search.is_none() {
		return empty(t, &icons::HISTORY, t.muted_foreground, None, say(history::EMPTY), None);
	}
	let head = match list.search {
		Some(edit) => row()
			.w_full()
			.gap(SPACING * 3.0)
			.center_y()
			.child(row().grow(1.0).child(input(
				t,
				edit,
				say(history::search::PLACEHOLDER),
				InputSize::Sm,
				|s: &mut S| s.edit(Field::HistorySearch),
			)))
			.child(
				Button::icon(&icons::CLOSE, say(history::search::CLEAR))
					.variant(ButtonVariant::Ghost)
					.size(ButtonSize::IconSm)
					.view(t)
					.on_press(|s: &mut S| s.emit(Event::CloseSearch)),
			),
		None => row()
			.w_full()
			.gap(SPACING * 3.0)
			.center_y()
			.child(
				text(counted(
					history::SUMMARY_ONE,
					history::SUMMARY_OTHER,
					count,
					&[("date", list.oldest)],
				))
				.font(if density == Density::Page { TEXT_COMPACT } else { TEXT_XS })
				.color(t.muted_foreground)
				.grow(1.0)
				.wrap(),
			)
			.child(
				Button::icon(&icons::SEARCH, say(history::search::LABEL))
					.variant(ButtonVariant::Ghost)
					.size(ButtonSize::IconSm)
					.view(t)
					.on_press(|s: &mut S| s.emit(Event::OpenSearch)),
			),
	};
	let mut entries = col().w_full().gap(SPACING * 4.0);
	if count == 0 {
		let searched = list.search.map_or("", |edit| edit.text.as_str());
		entries = entries.child(
			text(fill(history::NO_MATCH, &[("text", searched)]))
				.font(TEXT_SM)
				.color(t.muted_foreground)
				.padding(ROW_INSET),
		);
	}
	entries = entries.children(days.iter().filter(|day| !day.changes.is_empty()).map(|day| {
		col()
			.w_full()
			.gap(SPACING)
			.child(
				row()
					.w_full()
					.py(SPACING)
					.gap(SPACING * 2.0)
					.center_y()
					.child(
						text(day.label.to_owned())
							.font(TEXT_XS_MEDIUM)
							.color(t.muted_foreground)
							.role("heading"),
					)
					.child(spacer_line(t)),
			)
			.child(col().w_full().gap(SPACING).role("list").children(
				day.changes.iter().map(|change| change_row::<S>(t, density, list, change)),
			))
	}));
	col().w_full().grow(1.0).gap(PANEL_GAP).child(head).child(entries)
}

fn change_row<S: Host>(t: &Tokens, density: Density, list: &HistoryList, change: &Change) -> El {
	let authors = &list.authors;
	let (mark, name) = match change.author {
		Author::Agent => {
			(Face::still(authors.agent, authors.hue).draw(AUTHOR_MARK, t), authors.agent)
		}
		Author::You => (
			Person { name: authors.reader, image: None }.draw(AUTHOR_MARK, t),
			say(history::author::USER),
		),
	};
	let sentence_ink = if density == Density::Page { t.muted_foreground } else { t.foreground };
	let mut line = row()
		.w_full()
		.gap(SPACING * 1.25)
		.child(text(name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
		.child(
			text(change.sentence.to_owned()).font(TEXT_SM).color(sentence_ink).shrink().truncate(),
		);
	if change.retouches > 0 {
		line = line.child(
			text(counted(history::RETOUCHES_ONE, history::RETOUCHES_OTHER, change.retouches, &[]))
				.font(TEXT_SM)
				.color(t.foreground),
		);
	}
	if change.undone {
		line = line.child(
			text(format!("· {}", say(history::UNDONE))).font(TEXT_SM).color(t.muted_foreground),
		);
	}
	let mut copy = col().grow(1.0).shrink().gap(SPACING * 0.5).child(line);
	if let Some(detail) = change.detail {
		copy =
			copy.child(text(detail.to_owned()).font(TEXT_XS).color(t.muted_foreground).truncate());
	}
	let undo_label = fill(history::undo::LABEL, &[("title", change.sentence)]);
	let id = change.id.to_owned();
	let undo = (!change.undone).then(|| {
		let undo = Button::icon(&icons::ROTATE_CW, &undo_label)
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::IconXs)
			.view(t)
			.on_press(move |s: &mut S| s.emit(Event::Undo(id.clone())));
		if density == Density::Dialog { undo.group_opacity(0.0, 1.0) } else { undo }
	});
	let time = text(change.time.to_owned())
		.font(tabular(TEXT_XS))
		.color(t.muted_foreground)
		.w(TIME_WIDTH)
		.align(rune::Align::End);
	let trailing = match density {
		Density::Dialog => row().gap(SPACING * 2.0).center_y().children(undo).child(time),
		Density::Page => row().gap(SPACING * 2.0).center_y().child(time).children(undo),
	};
	let item = row()
		.key(format!("history-change-{}", change.id))
		.w_full()
		.padding(ROW_INSET)
		.gap(SPACING * 2.5)
		.items_start()
		.radius(RADIUS_LG)
		.hover(t.muted)
		.role("listitem")
		.label(change.sentence)
		.child(mark)
		.child(copy)
		.child(trailing);
	let item = instant(item.hover_group());
	if !list.openable {
		return item;
	}
	let id = change.id.to_owned();
	item.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
		.on_press(move |s: &mut S| s.emit(Event::OpenChange(id.clone())))
}

pub struct ChangeFile<'a> {
	pub path: &'a str,
	pub patch: &'a str,
}

pub struct ChangePage<'a> {
	pub title: &'a str,
	pub author: &'a str,
	pub date: &'a str,
	pub reason: Option<&'a str>,
	pub retouches: usize,
	pub files: Option<&'a [ChangeFile<'a>]>,
	pub failed: bool,
	pub chosen: Option<&'a str>,
}

pub fn change_page<S: Host>(t: &Tokens, page: &ChangePage) -> El {
	let files = page.files.unwrap_or_default();
	let chosen = files.iter().find(|file| Some(file.path) == page.chosen).or_else(|| files.first());
	let rail = files
		.iter()
		.map(|file| {
			RailItem {
				glyphs: (&icons::FILE, &icons::FILE_TEXT_FILL),
				label: file.path,
				active: chosen.is_some_and(|shown| shown.path == file.path),
				danger: false,
				event: Event::ChangeFile(file.path.to_owned()),
			}
			.view::<S>(t)
		})
		.collect();
	let mut meta = vec![page.author.to_owned(), page.date.to_owned()];
	if page.retouches > 0 {
		meta.push(counted(history::RETOUCHES_ONE, history::RETOUCHES_OTHER, page.retouches, &[]));
	}
	let header = col()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 0.5)
		.child(
			text(page.title.to_owned())
				.font(TEXT_SM)
				.color(t.foreground)
				.role("heading")
				.truncate(),
		)
		.child(text(meta.join(" · ")).font(TEXT_XS).color(t.muted_foreground));
	let body = match (page.files, chosen) {
		(None, _) if !page.failed => col()
			.w_full()
			.grow(1.0)
			.h_full()
			.padding(PANEL_INSET)
			.gap(SPACING * 4.0)
			.a11y_hidden()
			.child(bar(t, SPACING * 64.0, SPACING * 3.5))
			.child(skeleton(t).w_full().grow(1.0).radius(RADIUS_XL)),
		(_, Some(file)) if !page.failed => {
			let mut body = col().w_full().grow(1.0).padding(PANEL_INSET).gap(SPACING * 4.0);
			if let Some(reason) = page.reason {
				body = body.child(text(reason.to_owned()).font(TEXT_SM).color(t.foreground).wrap());
			}
			body.child(
				row()
					.w_full()
					.gap(SPACING * 2.0)
					.child(
						text(file.path.to_owned())
							.font(TEXT_XS_MONO)
							.color(t.foreground)
							.shrink()
							.wrap_anywhere(),
					)
					.child(text(changed_lines(file.patch)).font(TEXT_XS).color(t.muted_foreground)),
			)
			.child(commit_diff(t, file.patch))
		}
		_ => col().w_full().grow(1.0).padding(PANEL_INSET).child(notice::<S>(
			t,
			say(history::change::UNAVAILABLE),
			None,
		)),
	};
	let consequence = if files.is_empty() {
		say(history::change::consequence::UNCOUNTED).to_owned()
	} else {
		counted(
			history::change::consequence::COUNTED_ONE,
			history::change::consequence::COUNTED_OTHER,
			files.len(),
			&[],
		)
	};
	let foot = row()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 3.5)
		.center_y()
		.child(button::<S>(
			t,
			Button::new(say(history::undo::CONFIRM))
				.leading(&icons::ROTATE_CW)
				.variant(ButtonVariant::Outline),
			Event::ConfirmUndo,
		))
		.child(text(consequence).font(TEXT_XS).color(t.muted_foreground).grow(1.0).wrap());
	let column = col()
		.w_full()
		.grow(1.0)
		.h_full()
		.child(header)
		.child(rule(t))
		.child(body)
		.child(rule(t))
		.child(foot);
	pushed::<S>(t, say(history::change::BACK), rail, column)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Line {
	Context,
	Added,
	Removed,
}

struct DiffLine<'a> {
	kind: Line,
	old: Option<usize>,
	new: Option<usize>,
	text: &'a str,
}

struct Patch<'a> {
	path: &'a str,
	lines: Vec<DiffLine<'a>>,
}

fn hunk_start(header: &str) -> Option<(usize, usize)> {
	let mut ranges = header.trim_start_matches("@@").split_whitespace();
	let old = ranges.next()?.trim_start_matches('-').split(',').next()?.parse().ok()?;
	let new = ranges.next()?.trim_start_matches('+').split(',').next()?.parse().ok()?;
	Some((old, new))
}

fn parse(patch: &str) -> Option<Patch<'_>> {
	let mut path = None;
	let mut lines = Vec::new();
	let mut at = None;
	let mut files = 0;
	for line in patch.lines() {
		if line.starts_with("diff --git") {
			files += 1;
			continue;
		}
		if let Some(target) = line.strip_prefix("+++ ") {
			path = Some(target.trim_start_matches("b/"));
			continue;
		}
		if line.starts_with("--- ") || line.starts_with("index ") || line.starts_with("new file") {
			continue;
		}
		if line.starts_with("@@") {
			at = Some(hunk_start(line)?);
			continue;
		}
		let Some((old, new)) = at.as_mut() else { continue };
		let (kind, text) = match line.chars().next() {
			Some('+') => (Line::Added, &line[1..]),
			Some('-') => (Line::Removed, &line[1..]),
			_ => (Line::Context, line.get(1..).unwrap_or_default()),
		};
		let numbers = match kind {
			Line::Added => (None, Some(*new)),
			Line::Removed => (Some(*old), None),
			Line::Context => (Some(*old), Some(*new)),
		};
		if numbers.0.is_some() {
			*old += 1;
		}
		if numbers.1.is_some() {
			*new += 1;
		}
		lines.push(DiffLine { kind, old: numbers.0, new: numbers.1, text });
	}
	(files == 1 && !lines.is_empty()).then_some(Patch { path: path?, lines })
}

fn tally(patch: &Patch) -> (usize, usize) {
	patch.lines.iter().fold((0, 0), |(added, removed), line| match line.kind {
		Line::Added => (added + 1, removed),
		Line::Removed => (added, removed + 1),
		Line::Context => (added, removed),
	})
}

fn changed_lines(patch: &str) -> String {
	let (added, removed) = parse(patch).map_or((0, 0), |patch| tally(&patch));
	let mut parts = Vec::new();
	if added > 0 {
		parts.push(counted(history::change::ADDED_ONE, history::change::ADDED_OTHER, added, &[]));
	}
	if removed > 0 {
		parts.push(counted(
			history::change::REMOVED_ONE,
			history::change::REMOVED_OTHER,
			removed,
			&[],
		));
	}
	parts.join(", ")
}

fn number(t: &Tokens, at: Option<usize>) -> El {
	text(at.map_or_else(String::new, |at| at.to_string()))
		.font(tabular(TEXT_XS_MONO))
		.color(t.muted_foreground)
		.w(GUTTER)
		.align(rune::Align::End)
}

pub fn commit_diff(t: &Tokens, patch: &str) -> El {
	let frame = col()
		.w_full()
		.radius(RADIUS_XL)
		.border(1.0, t.border)
		.clip_rounded(RADIUS_XL)
		.role("group")
		.label(say(history::diff::FILENAME));
	let Some(parsed) = parse(patch) else {
		return frame
			.child(
				row()
					.w_full()
					.padding(SPACING * 3.0)
					.gap(SPACING * 2.0)
					.fill(t.muted)
					.center_y()
					.child(icon(&icons::FILE, SMALL_GLYPH).color(t.muted_foreground))
					.child(
						text(say(history::diff::FILENAME)).font(TEXT_XS).color(t.muted_foreground),
					),
			)
			.child(
				text(patch.to_owned())
					.font(TEXT_XS_MONO)
					.color(t.foreground)
					.padding(SPACING * 3.0)
					.wrap(),
			);
	};
	let (added, removed) = tally(&parsed);
	let header = row()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.fill(t.muted)
		.center_y()
		.child(icon(&icons::FILE, SMALL_GLYPH).color(t.muted_foreground))
		.child(
			text(parsed.path.to_owned())
				.font(TEXT_XS_MONO)
				.color(t.foreground)
				.grow(1.0)
				.truncate_head(),
		)
		.children(
			(removed > 0)
				.then(|| text(format!("-{removed}")).font(TEXT_XS_MONO).color(t.destructive)),
		)
		.children(
			(added > 0).then(|| text(format!("+{added}")).font(TEXT_XS_MONO).color(t.success)),
		);
	let lines = parsed.lines.iter().map(|line| {
		let (fill_colour, sign) = match line.kind {
			Line::Added => (faded(t.success, DIFF_TINT), "+"),
			Line::Removed => (faded(t.destructive, DIFF_TINT), "-"),
			Line::Context => (t.background.alpha(0.0), " "),
		};
		row()
			.w_full()
			.px(SPACING)
			.gap(SPACING * 2.0)
			.fill(fill_colour)
			.items_start()
			.child(number(t, line.old))
			.child(number(t, line.new))
			.child(text(sign).font(TEXT_XS_MONO).color(t.muted_foreground))
			.child(
				text(line.text.to_owned())
					.font(TEXT_XS_MONO)
					.color(t.foreground)
					.grow(1.0)
					.wrap_anywhere(),
			)
	});
	frame.child(header).child(col().w_full().py(SPACING * 2.0).children(lines))
}

#[cfg(test)]
mod tests {
	use super::*;

	const MODEL_PATCH: &str = "diff --git a/bot.json b/bot.json\nindex 9f2ad41..6d5be07 100644\n--- a/bot.json\n+++ b/bot.json\n@@ -1,5 +1,5 @@\n {\n   \"name\": \"Nest Keeper\",\n-  \"model\": \"haiku-4-5\",\n+  \"model\": \"sonnet-4-5\",\n   \"changesNothing\": false\n }";

	#[test]
	fn a_one_file_patch_reads_its_path_and_numbers() {
		let patch = parse(MODEL_PATCH).expect("one file");
		assert_eq!(patch.path, "bot.json");
		assert_eq!(patch.lines.len(), 6);
		assert_eq!((patch.lines[2].old, patch.lines[2].new), (Some(3), None));
		assert_eq!((patch.lines[3].old, patch.lines[3].new), (None, Some(3)));
	}

	#[test]
	fn prose_is_not_a_patch() {
		assert!(parse("restored from a snapshot").is_none());
	}

	#[test]
	fn changed_lines_counts_both_sides() {
		assert_eq!(changed_lines(MODEL_PATCH), "1 line added, 1 line removed");
	}
}
