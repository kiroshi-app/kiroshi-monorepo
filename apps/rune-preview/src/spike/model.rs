#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LibraryBlock {
	pub id: String,
	pub source: String,
	pub gap: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LibraryBlockDocument {
	pub lead: String,
	pub blocks: Vec<LibraryBlock>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryBlockType {
	Paragraph,
	Heading,
	List,
	Checklist,
	Quote,
	Callout,
	Table,
	Code,
	Other,
}

pub const BLOCK_GAP: &str = "\n\n";

const FENCED_OTHER: &[&str] = &[
	"gallery",
	"web-page",
	"collapsible",
	"options",
	"illustrated-list",
	"checklist",
	"interactive",
	"video",
	"map",
	"math",
	"mermaid",
];

const CALLOUT_TONES: &[&str] = &["[!NOTE]", "[!TIP]", "[!WARNING]"];

pub fn parse_blocks(markdown: &str, next_id: &mut impl FnMut() -> String) -> LibraryBlockDocument {
	let lines = line_spans(markdown);
	let mut ranges: Vec<(usize, usize)> = Vec::new();
	let mut at = skip_blank(markdown, &lines, 0);
	while at < lines.len() {
		let last = block_end(markdown, &lines, at);
		ranges.push((lines[at].0, lines[last].1));
		at = skip_blank(markdown, &lines, last + 1);
	}
	let Some(first) = ranges.first() else {
		return LibraryBlockDocument { lead: markdown.to_owned(), blocks: Vec::new() };
	};
	let blocks = ranges
		.iter()
		.enumerate()
		.map(|(index, &(from, to))| LibraryBlock {
			id: next_id(),
			source: markdown[from..to].to_owned(),
			gap: markdown[to..ranges.get(index + 1).map_or(markdown.len(), |next| next.0)]
				.to_owned(),
		})
		.collect();
	LibraryBlockDocument { lead: markdown[..first.0].to_owned(), blocks }
}

pub fn serialize_blocks(document: &LibraryBlockDocument) -> String {
	let mut markdown = document.lead.clone();
	for block in &document.blocks {
		markdown.push_str(&block.source);
		markdown.push_str(&block.gap);
	}
	markdown
}

fn line_spans(markdown: &str) -> Vec<(usize, usize)> {
	let mut spans = Vec::new();
	let mut start = 0;
	for (at, character) in markdown.char_indices() {
		if character == '\n' {
			spans.push((start, at));
			start = at + 1;
		}
	}
	if start < markdown.len() {
		spans.push((start, markdown.len()));
	}
	spans
}

fn skip_blank(markdown: &str, lines: &[(usize, usize)], from: usize) -> usize {
	let mut at = from;
	while lines.get(at).is_some_and(|&(start, end)| markdown[start..end].trim().is_empty()) {
		at += 1;
	}
	at
}

fn block_end(markdown: &str, lines: &[(usize, usize)], from: usize) -> usize {
	let line = |at: usize| &markdown[lines[at].0..lines[at].1];
	if let Some(fence) = fence_marker(line(from)) {
		let closing = (from + 1..lines.len()).find(|&at| closes_fence(line(at), fence));
		return closing.unwrap_or(lines.len() - 1);
	}
	let mut last = from;
	while last + 1 < lines.len() && !line(last + 1).trim().is_empty() {
		last += 1;
	}
	last
}

pub fn fence_marker(line: &str) -> Option<&str> {
	let trimmed = line.trim_start_matches([' ', '\t']);
	let fence = trimmed.chars().next().filter(|c| *c == '`' || *c == '~')?;
	let run = trimmed.len() - trimmed.trim_start_matches(fence).len();
	(run >= 3).then(|| &trimmed[..run])
}

pub fn closes_fence(line: &str, fence: &str) -> bool {
	fence_marker(line).is_some_and(|marker| {
		marker.starts_with(&fence[..1])
			&& marker.len() >= fence.len()
			&& line.trim().len() == marker.len()
	})
}

pub fn block_type_of(source: &str) -> LibraryBlockType {
	let first = source.split('\n').next().unwrap_or_default();
	if heading_marker_len(first).is_some() {
		return LibraryBlockType::Heading;
	}
	if let Some(fence) = fence_marker(first) {
		let info = first.trim_start()[fence.len()..].split_whitespace().next().unwrap_or_default();
		return if FENCED_OTHER.contains(&info) {
			LibraryBlockType::Other
		} else {
			LibraryBlockType::Code
		};
	}
	if first.starts_with("    ") || first.starts_with('\t') {
		return LibraryBlockType::Code;
	}
	if task_marker_len(first).is_some() {
		return LibraryBlockType::Checklist;
	}
	if list_marker_len(first).is_some() {
		return LibraryBlockType::List;
	}
	if quote_marker_len(first).is_some() {
		let rest = first.trim_start()[1..].trim_start();
		return if CALLOUT_TONES.iter().any(|tone| rest.starts_with(tone)) {
			LibraryBlockType::Callout
		} else {
			LibraryBlockType::Quote
		};
	}
	if is_table(source) {
		return LibraryBlockType::Table;
	}
	LibraryBlockType::Paragraph
}

fn is_table(source: &str) -> bool {
	let mut lines = source.split('\n');
	let header = lines.next().unwrap_or_default();
	let delimiter = lines.next().unwrap_or_default();
	header.trim_start().starts_with('|')
		&& delimiter.contains('-')
		&& delimiter.trim().chars().all(|c| matches!(c, '|' | '-' | ':' | ' ' | '\t'))
}

fn leading_space(line: &str) -> usize {
	line.len() - line.trim_start_matches([' ', '\t']).len()
}

fn spaces_after(line: &str, at: usize) -> usize {
	line[at..].len() - line[at..].trim_start_matches([' ', '\t']).len()
}

pub fn heading_marker_len(line: &str) -> Option<usize> {
	let hashes = line.len() - line.trim_start_matches('#').len();
	if !(1..=6).contains(&hashes) {
		return None;
	}
	let spaces = spaces_after(line, hashes);
	(spaces > 0 || hashes == line.len()).then_some(hashes + spaces)
}

pub fn list_marker_len(line: &str) -> Option<usize> {
	let indent = leading_space(line);
	let rest = &line[indent..];
	let digits = rest.len() - rest.trim_start_matches(|c: char| c.is_ascii_digit()).len();
	let marker = match rest[digits..].chars().next() {
		Some('-' | '*' | '+') if digits == 0 => 1,
		Some('.' | ')') if digits > 0 => digits + 1,
		_ => return None,
	};
	let spaces = spaces_after(line, indent + marker);
	(spaces > 0).then_some(indent + marker + spaces)
}

pub fn task_marker_len(line: &str) -> Option<usize> {
	let indent = leading_space(line);
	if !line[indent..].starts_with(['-', '*', '+']) {
		return None;
	}
	let spaces = spaces_after(line, indent + 1);
	let at = indent + 1 + spaces;
	let rest = &line[at..];
	let is_box = spaces > 0
		&& rest.len() >= 3
		&& rest.starts_with('[')
		&& matches!(&rest[1..2], " " | "x" | "X")
		&& &rest[2..3] == "]";
	if !is_box {
		return None;
	}
	let after = at + 3;
	Some(after + usize::from(line[after..].starts_with([' ', '\t'])))
}

pub fn quote_marker_len(line: &str) -> Option<usize> {
	let indent = leading_space(line);
	if !line[indent..].starts_with('>') {
		return None;
	}
	Some(indent + 1 + usize::from(line[indent + 1..].starts_with([' ', '\t'])))
}

pub fn row_marker_len(line: &str, kind: LibraryBlockType) -> usize {
	let marker = match kind {
		LibraryBlockType::Heading => heading_marker_len(line),
		LibraryBlockType::List => list_marker_len(line),
		LibraryBlockType::Checklist => task_marker_len(line).or_else(|| list_marker_len(line)),
		LibraryBlockType::Quote | LibraryBlockType::Callout => quote_marker_len(line),
		_ => None,
	};
	marker.unwrap_or(0)
}

pub fn cells_of(line: &str) -> Vec<String> {
	let trimmed = line.trim();
	let inner = trimmed.strip_prefix('|').unwrap_or(trimmed);
	let inner = match inner.strip_suffix('|') {
		Some(stripped) if !stripped.ends_with('\\') => stripped,
		_ => inner,
	};
	let mut cells = Vec::new();
	let mut cell = String::new();
	let mut escaped = false;
	for character in inner.chars() {
		if character == '|' && !escaped {
			cells.push(cell.trim().to_owned());
			cell.clear();
		} else {
			cell.push(character);
		}
		escaped = character == '\\' && !escaped;
	}
	cells.push(cell.trim().to_owned());
	cells
}

pub fn table_source_of(rows: &[Vec<String>]) -> String {
	rows.iter().map(|cells| format!("| {} |", cells.join(" | "))).collect::<Vec<_>>().join("\n")
}

pub fn as_cell(value: &str) -> String {
	let one_line = value.split('\n').map(str::trim).collect::<Vec<_>>().join(" ");
	let mut cell = String::with_capacity(one_line.len());
	let mut escaped = false;
	for character in one_line.chars() {
		if character == '|' && !escaped {
			cell.push('\\');
		}
		cell.push(character);
		escaped = character == '\\' && !escaped;
	}
	cell
}
