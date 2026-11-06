use std::collections::HashSet;
use std::ops::Range;

use serde::Serialize;
use uuid::Uuid;

const ID_LENGTH: usize = 6;

const ID_ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";

const MARKER_LENGTH: usize = ID_LENGTH + 1;

const PREVIEW_CHARS: usize = 60;

const BLOCK_GAP: &str = "\n\n";

const TASK_BOXES: [&str; 3] = ["[ ]", "[x]", "[X]"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum BlockKind {
	Heading,
	Paragraph,
	List,
	Checklist,
	Quote,
	Code,
	Table,
	Rule,
	Image,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Block {
	pub(crate) id: Option<String>,
	pub(crate) kind: BlockKind,
	pub(crate) level: Option<u8>,
	pub(crate) content: Range<usize>,
	id_at: Option<Range<usize>>,
	is_marked_inline: bool,
	open_fence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Splice {
	pub(crate) range: Range<usize>,
	pub(crate) text: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Written {
	pub(crate) text: String,
	pub(crate) ids: Vec<String>,
}

impl Block {
	pub(crate) fn end(&self) -> usize {
		self.id_at.as_ref().map_or(self.content.end, |id_at| id_at.end)
	}

	pub(crate) fn span(&self) -> Range<usize> {
		self.content.start..self.end()
	}

	fn marker(&self, id: &str) -> String {
		if self.is_marked_inline {
			return format!(" ^{id}");
		}
		let closing =
			self.open_fence.as_ref().map(|fence| format!("\n{fence}")).unwrap_or_default();
		format!("{closing}{BLOCK_GAP}^{id}")
	}
}

pub(crate) fn blocks_of(text: &str) -> Vec<Block> {
	let lines = lines_of(text);
	let mut blocks: Vec<Block> = Vec::new();
	for raw in raw_blocks(&lines) {
		let start = lines[raw.first].start;
		let last = &lines[raw.last];
		let end = last.start + last.text.trim_end().len();
		let source = &text[start..end];
		let marker = raw.carries_inline.then(|| trailing_marker(source)).flatten();
		let is_only_a_marker = raw.kind == BlockKind::Paragraph
			&& marker.is_some_and(|at| source[..at].trim().is_empty());
		if is_only_a_marker {
			if let Some(previous) = blocks.last_mut().filter(|block| block.id_at.is_none()) {
				previous.id = Some(text[end - ID_LENGTH..end].to_owned());
				previous.id_at = Some(end - ID_LENGTH..end);
			}
			continue;
		}
		let content_end = marker.map_or(end, |at| start + source[..at].trim_end().len());
		let id_at = marker.map(|at| start + at + 1..end);
		let kind = match raw.kind {
			BlockKind::Paragraph if is_image(&text[start..content_end]) => BlockKind::Image,
			kind => kind,
		};
		blocks.push(Block {
			id: id_at.clone().map(|id_at| text[id_at].to_owned()),
			kind,
			level: raw.level,
			content: start..content_end,
			id_at,
			is_marked_inline: raw.carries_inline
				&& !(raw.kind == BlockKind::Heading && has_closing_sequence(source)),
			open_fence: raw.open_fence,
		});
	}
	blocks
}

pub(crate) fn backfill(text: &str) -> Vec<Splice> {
	let blocks = blocks_of(text);
	let mut taken: HashSet<String> = blocks.iter().filter_map(|block| block.id.clone()).collect();
	let mut seen = HashSet::new();
	let mut splices = Vec::new();
	for block in &blocks {
		match (&block.id, &block.id_at) {
			(Some(id), Some(_)) if seen.insert(id.clone()) => {}
			(Some(_), Some(id_at)) => {
				splices.push(Splice { range: id_at.clone(), text: fresh_id(&mut taken) });
			}
			_ => {
				let mut marker = block.marker(&fresh_id(&mut taken));
				if !block.is_marked_inline {
					marker.push_str(separator(&text[block.content.end..]));
				}
				let at = block.content.end;
				splices.push(Splice { range: at..at, text: marker });
			}
		}
	}
	splices
}

pub(crate) fn written(
	markdown: &str,
	kept_id: Option<&str>,
	taken: &mut HashSet<String>,
) -> Option<Written> {
	let blocks = blocks_of(markdown);
	let mut ids = Vec::new();
	let mut parts = Vec::new();
	for block in &blocks {
		let id = match (ids.is_empty(), kept_id) {
			(true, Some(kept)) => kept.to_owned(),
			_ => fresh_id(taken),
		};
		let source = without_trailing_markers(&markdown[block.content.clone()]);
		if source.trim().is_empty() {
			continue;
		}
		parts.push(format!("{source}{}", block.marker(&id)));
		ids.push(id);
	}
	(!ids.is_empty()).then(|| Written { text: parts.join(BLOCK_GAP), ids })
}

pub(crate) fn separated(before: &str, inserted: &str, after: &str) -> String {
	let leading = if before.trim().is_empty() {
		""
	} else {
		gap_for(newlines(&before[before.trim_end().len()..]))
	};
	format!("{leading}{inserted}{}", separator(after))
}

pub(crate) fn removal(text: &str, spans: &[Range<usize>], run: Range<usize>) -> Splice {
	let (first, last) = (&spans[run.start], &spans[run.end - 1]);
	let previous = run.start.checked_sub(1).map(|index| spans[index].end);
	let next = spans.get(run.end).map(|span| span.start);
	let (range, text) = match (previous, next) {
		(None, None) => (first.start..last.end, ""),
		(None, Some(next)) => (first.start..next, ""),
		(Some(previous), None) => (previous..last.end, ""),
		(Some(previous), Some(next)) if newlines(&text[previous..first.start]) >= 2 => {
			(first.start..next, "")
		}
		(Some(previous), Some(next)) => (previous..next, BLOCK_GAP),
	};
	Splice { range, text: text.to_owned() }
}

pub(crate) fn preview(kind: BlockKind, source: &str) -> String {
	let shown: Vec<&str> = source.lines().filter_map(|line| shown_line(kind, line)).collect();
	let shown = shown.join(" ");
	let shown = if kind == BlockKind::Table { shown.replace('|', " ") } else { shown };
	first_words(&shown)
}

pub(crate) fn fresh_id(taken: &mut HashSet<String>) -> String {
	loop {
		let random = Uuid::new_v4();
		let id: String = random.as_bytes()[..ID_LENGTH]
			.iter()
			.map(|byte| char::from(ID_ALPHABET[usize::from(*byte) % ID_ALPHABET.len()]))
			.collect();
		if taken.insert(id.clone()) {
			return id;
		}
	}
}

fn without_trailing_markers(source: &str) -> &str {
	let mut source = source;
	while let Some(at) = trailing_marker(source) {
		source = source[..at].trim_end();
	}
	source
}

fn trailing_marker(source: &str) -> Option<usize> {
	let at = source.len().checked_sub(MARKER_LENGTH)?;
	let marker = source.get(at..)?;
	let is_marker =
		marker.starts_with('^') && marker[1..].bytes().all(|byte| ID_ALPHABET.contains(&byte));
	let is_apart = source[..at].chars().next_back().is_none_or(char::is_whitespace);
	(is_marker && is_apart).then_some(at)
}

fn has_closing_sequence(source: &str) -> bool {
	let line = source.trim_end();
	let before = line.trim_end_matches('#');
	before.len() < line.len() && before.ends_with([' ', '\t'])
}

fn is_image(source: &str) -> bool {
	let source = source.trim();
	!source.contains('\n')
		&& source.starts_with("![")
		&& source.ends_with(')')
		&& source.contains("](")
}

fn separator(after: &str) -> &'static str {
	if after.trim().is_empty() {
		return "";
	}
	gap_for(newlines(&after[..after.len() - after.trim_start().len()]))
}

fn gap_for(newlines: usize) -> &'static str {
	match newlines {
		0 => BLOCK_GAP,
		1 => "\n",
		_ => "",
	}
}

fn newlines(space: &str) -> usize {
	space.matches('\n').count()
}

fn shown_line(kind: BlockKind, line: &str) -> Option<&str> {
	let line = line.trim();
	match kind {
		BlockKind::Heading => {
			(setext_level(line).is_none()).then(|| line.trim_start_matches('#').trim_start())
		}
		BlockKind::List | BlockKind::Checklist => Some(without_task_box(without_list_marker(line))),
		BlockKind::Quote => Some(line.trim_start_matches(['>', ' ', '\t'])),
		BlockKind::Code => fence_opening(line).is_none().then_some(line),
		BlockKind::Table => (!is_delimiter_row(line)).then_some(line),
		BlockKind::Rule => None,
		BlockKind::Paragraph | BlockKind::Image => Some(line),
	}
}

fn without_list_marker(line: &str) -> &str {
	list_item(line).map_or(line, |item| line[item.marker_end..].trim_start())
}

fn without_task_box(line: &str) -> &str {
	TASK_BOXES.iter().find_map(|task_box| line.strip_prefix(task_box)).map_or(line, str::trim_start)
}

fn first_words(text: &str) -> String {
	let mut said = String::new();
	for word in text.split_whitespace() {
		let wanted = said.chars().count() + usize::from(!said.is_empty()) + word.chars().count();
		if wanted > PREVIEW_CHARS {
			if said.is_empty() {
				said = word.chars().take(PREVIEW_CHARS).collect();
			}
			said.push('…');
			return said;
		}
		if !said.is_empty() {
			said.push(' ');
		}
		said.push_str(word);
	}
	said
}

struct Line<'a> {
	start: usize,
	text: &'a str,
}

struct Raw {
	kind: BlockKind,
	level: Option<u8>,
	first: usize,
	last: usize,
	carries_inline: bool,
	open_fence: Option<String>,
}

impl Raw {
	fn of(kind: BlockKind, lines: Range<usize>) -> Self {
		Self {
			kind,
			level: None,
			first: lines.start,
			last: lines.end - 1,
			carries_inline: false,
			open_fence: None,
		}
	}
}

#[derive(Clone, Copy)]
struct Fence {
	mark: char,
	length: usize,
}

#[derive(Clone, Copy)]
struct ListItem {
	delimiter: char,
	marker_end: usize,
	content_indent: usize,
	can_interrupt: bool,
	is_task: bool,
}

fn lines_of(text: &str) -> Vec<Line<'_>> {
	let mut lines = Vec::new();
	let mut start = 0;
	for line in text.split('\n') {
		lines.push(Line { start, text: line.strip_suffix('\r').unwrap_or(line) });
		start += line.len() + 1;
	}
	lines
}

fn raw_blocks(lines: &[Line<'_>]) -> Vec<Raw> {
	let mut blocks = Vec::new();
	let mut at = 0;
	while at < lines.len() {
		if is_blank(lines[at].text) {
			at += 1;
			continue;
		}
		let raw = raw_block_at(lines, at);
		at = raw.last + 1;
		blocks.push(raw);
	}
	blocks
}

fn raw_block_at(lines: &[Line<'_>], at: usize) -> Raw {
	let line = lines[at].text;
	if let Some(fence) = fence_opening(line) {
		return fenced(lines, at, fence);
	}
	if let Some(level) = atx_level(line) {
		return Raw {
			level: Some(level),
			carries_inline: true,
			..Raw::of(BlockKind::Heading, at..at + 1)
		};
	}
	if is_rule(line) {
		return Raw::of(BlockKind::Rule, at..at + 1);
	}
	if is_quote(line) {
		return quote(lines, at);
	}
	if let Some(item) = list_item(line) {
		return list(lines, at, item);
	}
	if indent_of(line) >= 4 {
		return indented_code(lines, at);
	}
	if is_table_start(lines, at) {
		return table(lines, at);
	}
	paragraph(lines, at)
}

fn fenced(lines: &[Line<'_>], at: usize, fence: Fence) -> Raw {
	if let Some(close) = (at + 1..lines.len()).find(|&index| closes(lines[index].text, fence)) {
		return Raw::of(BlockKind::Code, at..close + 1);
	}
	let last = (at..lines.len()).rev().find(|&index| !is_blank(lines[index].text)).unwrap_or(at);
	let open_fence = Some(fence.mark.to_string().repeat(fence.length));
	Raw { open_fence, ..Raw::of(BlockKind::Code, at..last + 1) }
}

fn quote(lines: &[Line<'_>], at: usize) -> Raw {
	let last = (at + 1..lines.len())
		.take_while(|&index| {
			let line = lines[index].text;
			!is_blank(line) && (is_quote(line) || !starts_another_block(line))
		})
		.last()
		.unwrap_or(at);
	Raw::of(BlockKind::Quote, at..last + 1)
}

fn list(lines: &[Line<'_>], at: usize, first: ListItem) -> Raw {
	let kind = if first.is_task { BlockKind::Checklist } else { BlockKind::List };
	let mut content_indent = first.content_indent;
	let mut last = at;
	let mut next = at + 1;
	while next < lines.len() {
		let line = lines[next].text;
		if is_blank(line) {
			let Some(resumed) = (next..lines.len()).find(|&index| !is_blank(lines[index].text))
			else {
				break;
			};
			let resumed_line = lines[resumed].text;
			let is_same_list = !is_rule(resumed_line)
				&& list_item(resumed_line).is_some_and(|item| item.delimiter == first.delimiter);
			if indent_of(resumed_line) < content_indent && !is_same_list {
				break;
			}
			next = resumed;
			continue;
		}
		if indent_of(line) >= content_indent {
			last = next;
		} else if is_rule(line) {
			break;
		} else if let Some(item) = list_item(line) {
			if item.delimiter != first.delimiter {
				break;
			}
			content_indent = item.content_indent;
			last = next;
		} else if starts_another_block(line) || last + 1 != next {
			break;
		} else {
			last = next;
		}
		next += 1;
	}
	Raw::of(kind, at..last + 1)
}

fn indented_code(lines: &[Line<'_>], at: usize) -> Raw {
	let mut last = at;
	for (index, line) in lines.iter().enumerate().skip(at + 1) {
		if is_blank(line.text) {
			continue;
		}
		if indent_of(line.text) < 4 {
			break;
		}
		last = index;
	}
	Raw::of(BlockKind::Code, at..last + 1)
}

fn table(lines: &[Line<'_>], at: usize) -> Raw {
	let last = (at + 2..lines.len())
		.take_while(|&index| {
			let line = lines[index].text;
			!is_blank(line) && !starts_another_block(line)
		})
		.last()
		.unwrap_or(at + 1);
	Raw::of(BlockKind::Table, at..last + 1)
}

fn paragraph(lines: &[Line<'_>], at: usize) -> Raw {
	let mut last = at;
	for (index, line) in lines.iter().enumerate().skip(at + 1) {
		if is_blank(line.text) {
			break;
		}
		if let Some(level) = setext_level(line.text) {
			return Raw { level: Some(level), ..Raw::of(BlockKind::Heading, at..index + 1) };
		}
		if starts_another_block(line.text) {
			break;
		}
		last = index;
	}
	Raw { carries_inline: true, ..Raw::of(BlockKind::Paragraph, at..last + 1) }
}

fn is_blank(line: &str) -> bool {
	line.trim().is_empty()
}

fn indent_of(line: &str) -> usize {
	line.chars()
		.take_while(|char| matches!(char, ' ' | '\t'))
		.map(|char| if char == '\t' { 4 } else { 1 })
		.sum()
}

fn unindented(line: &str) -> Option<&str> {
	(indent_of(line) <= 3).then(|| line.trim_start_matches([' ', '\t']))
}

fn starts_another_block(line: &str) -> bool {
	atx_level(line).is_some()
		|| fence_opening(line).is_some()
		|| is_rule(line)
		|| is_quote(line)
		|| list_item(line).is_some_and(|item| item.can_interrupt)
}

fn atx_level(line: &str) -> Option<u8> {
	let rest = unindented(line)?;
	let level = rest.chars().take_while(|char| *char == '#').count();
	let after = &rest[level..];
	let is_apart = after.is_empty() || after.starts_with([' ', '\t']);
	((1..=6).contains(&level) && is_apart).then_some(level as u8)
}

fn setext_level(line: &str) -> Option<u8> {
	let rest = unindented(line)?.trim_end();
	let mark = rest.chars().next()?;
	let level = match mark {
		'=' => 1,
		'-' => 2,
		_ => return None,
	};
	rest.chars().all(|char| char == mark).then_some(level)
}

fn is_rule(line: &str) -> bool {
	let Some(rest) = unindented(line) else {
		return false;
	};
	let Some(mark) = rest.chars().next().filter(|char| matches!(char, '-' | '*' | '_')) else {
		return false;
	};
	let marks = rest.chars().filter(|char| *char == mark).count();
	marks >= 3 && rest.chars().all(|char| char == mark || matches!(char, ' ' | '\t'))
}

fn is_quote(line: &str) -> bool {
	unindented(line).is_some_and(|rest| rest.starts_with('>'))
}

fn fence_opening(line: &str) -> Option<Fence> {
	let rest = unindented(line)?;
	let mark = rest.chars().next().filter(|char| matches!(char, '`' | '~'))?;
	let length = rest.chars().take_while(|char| *char == mark).count();
	let info = &rest[length..];
	(length >= 3 && !(mark == '`' && info.contains('`'))).then_some(Fence { mark, length })
}

fn closes(line: &str, fence: Fence) -> bool {
	let Some(rest) = unindented(line) else {
		return false;
	};
	let length = rest.chars().take_while(|char| *char == fence.mark).count();
	length >= fence.length && rest[length..].trim().is_empty()
}

fn list_item(line: &str) -> Option<ListItem> {
	let indent = indent_of(line);
	let rest = unindented(line)?;
	let leading = line.len() - rest.len();
	let digits = rest.chars().take_while(char::is_ascii_digit).count();
	let (delimiter, marker_length) = match rest.chars().next()? {
		bullet @ ('-' | '*' | '+') => (bullet, 1),
		_ if (1..=9).contains(&digits) => match rest[digits..].chars().next()? {
			delimiter @ ('.' | ')') => (delimiter, digits + 1),
			_ => return None,
		},
		_ => return None,
	};
	let after = &rest[marker_length..];
	if !(after.is_empty() || after.starts_with([' ', '\t'])) {
		return None;
	}
	let spaces = indent_of(after);
	let is_empty = after.trim().is_empty();
	let gap = if is_empty || spaces > 4 { 1 } else { spaces };
	let is_first_number = digits == 0 || rest[..digits].trim_start_matches('0') == "1";
	let body = after.trim_start();
	Some(ListItem {
		delimiter,
		marker_end: leading + marker_length,
		content_indent: indent + marker_length + gap,
		can_interrupt: !is_empty && is_first_number,
		is_task: digits == 0 && TASK_BOXES.iter().any(|task| body.starts_with(task)),
	})
}

fn is_table_start(lines: &[Line<'_>], at: usize) -> bool {
	let header = lines[at].text;
	let Some(delimiter) = lines.get(at + 1).map(|line| line.text) else {
		return false;
	};
	header.contains('|') && is_delimiter_row(delimiter) && cells(header) == cells(delimiter)
}

fn is_delimiter_row(line: &str) -> bool {
	let inner = line.trim().trim_start_matches('|').trim_end_matches('|');
	!inner.is_empty()
		&& inner.split('|').all(|cell| {
			let cell = cell.trim().trim_start_matches(':').trim_end_matches(':');
			!cell.is_empty() && cell.chars().all(|char| char == '-')
		})
}

fn cells(row: &str) -> usize {
	let row = row.trim();
	let inner = row.strip_prefix('|').unwrap_or(row);
	let inner = inner.strip_suffix('|').filter(|inner| !inner.ends_with('\\')).unwrap_or(inner);
	let mut count = 1;
	let mut is_escaped = false;
	for char in inner.chars() {
		match char {
			'\\' => is_escaped = !is_escaped,
			'|' if !is_escaped => count += 1,
			_ => is_escaped = false,
		}
	}
	count
}

#[cfg(test)]
mod tests;
