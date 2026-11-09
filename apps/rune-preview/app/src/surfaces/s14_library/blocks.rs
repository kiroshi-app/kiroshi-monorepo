use std::collections::HashSet;

use rune::{Block as Line, Mark, MarkRange, TextEdit};

use kiroshi_rune_kit::surfaces::s14_library::{
	BLOCK_GAP, BLOCK_ID_ALPHABET, BLOCK_ID_LENGTH, LibraryBlockType, Record, block_type_of,
	fence_body, field_of as record_field, is_block_id, parse_blocks, records_of, rows_of,
};

use crate::spike::inline;

const PLAIN_EXTENSION: &str = ".txt";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
	Markdown,
	Plain,
}

impl Format {
	pub fn of(name: &str) -> Format {
		if name.to_lowercase().ends_with(PLAIN_EXTENSION) {
			Format::Plain
		} else {
			Format::Markdown
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Block {
	pub id: String,
	pub source: String,
	pub marker: String,
	pub gap: String,
}

impl Block {
	pub fn kind(&self) -> LibraryBlockType {
		block_type_of(&self.source)
	}

	pub fn written_marker(&self, format: Format) -> String {
		if format == Format::Plain || self.source.trim().is_empty() {
			return String::new();
		}
		if !self.marker.is_empty() {
			return self.marker.clone();
		}
		match self.kind() {
			LibraryBlockType::Paragraph | LibraryBlockType::Heading => format!(" ^{}", self.id),
			_ => format!("{BLOCK_GAP}^{}", self.id),
		}
	}

	pub fn written_len(&self, format: Format) -> usize {
		self.source.len() + self.written_marker(format).len() + self.gap.len()
	}
}

pub fn fresh_id(taken: &HashSet<String>) -> String {
	let alphabet = BLOCK_ID_ALPHABET.as_bytes();
	loop {
		let seed = uuid::Uuid::new_v4();
		let id: String = seed.as_bytes()[..BLOCK_ID_LENGTH]
			.iter()
			.map(|byte| char::from(alphabet[usize::from(*byte) % alphabet.len()]))
			.collect();
		if !taken.contains(&id) {
			return id;
		}
	}
}

pub fn lead_of(markdown: &str) -> &str {
	let length = markdown
		.split_inclusive('\n')
		.take_while(|line| line.trim().is_empty() && line.ends_with('\n'))
		.map(str::len)
		.sum();
	&markdown[..length]
}

fn lone_marker(source: &str) -> Option<String> {
	let id = source.trim().strip_prefix('^')?;
	is_block_id(id).then(|| id.to_owned())
}

fn trailing_marker(source: &str) -> Option<(usize, String)> {
	let trimmed = source.trim_end();
	let at = trimmed.len().checked_sub(BLOCK_ID_LENGTH + 1)?;
	let id = trimmed.get(at + 1..)?;
	let is_marker = trimmed[at..].starts_with('^')
		&& is_block_id(id)
		&& (at == 0 || trimmed[..at].ends_with(char::is_whitespace));
	is_marker.then(|| (trimmed[..at].trim_end().len(), id.to_owned()))
}

fn split_marker(source: &str) -> (String, String, Option<String>) {
	let carries_inline =
		matches!(block_type_of(source), LibraryBlockType::Paragraph | LibraryBlockType::Heading);
	if let Some((end, id)) = trailing_marker(source).filter(|_| carries_inline) {
		return (source[..end].to_owned(), source[end..].to_owned(), Some(id));
	}
	let Some((above, last)) = source.rsplit_once('\n') else {
		return (source.to_owned(), String::new(), None);
	};
	match lone_marker(last) {
		Some(id) => (above.to_owned(), source[above.len()..].to_owned(), Some(id)),
		None => (source.to_owned(), String::new(), None),
	}
}

fn read_blocks(markdown: &str) -> Vec<(Block, Option<String>)> {
	let mut read: Vec<(Block, Option<String>)> = Vec::new();
	for parsed in parse_blocks(markdown, String::new) {
		if let Some(id) = lone_marker(&parsed.source)
			&& let Some((previous, held)) = read.last_mut().filter(|(_, held)| held.is_none())
		{
			previous.marker = format!("{}{}", previous.gap, parsed.source);
			previous.gap = parsed.gap;
			*held = Some(id);
			continue;
		}
		let (source, marker, id) = split_marker(&parsed.source);
		read.push((Block { id: String::new(), source, marker, gap: parsed.gap }, id));
	}
	read
}

pub fn blocks_of(markdown: &str, previous: &[Block]) -> Vec<Block> {
	let read = read_blocks(markdown);
	let mut taken: HashSet<String> = read.iter().filter_map(|(_, id)| id.clone()).collect();
	let mut named = HashSet::new();
	read.into_iter()
		.enumerate()
		.map(|(index, (mut block, id))| {
			block.id = match id {
				Some(id) if named.insert(id.clone()) => id,
				Some(_) => {
					block.marker.clear();
					adopted(previous.get(index), &mut taken)
				}
				None => adopted(previous.get(index), &mut taken),
			};
			block
		})
		.collect()
}

fn adopted(previous: Option<&Block>, taken: &mut HashSet<String>) -> String {
	let id = match previous.filter(|block| !taken.contains(&block.id)) {
		Some(block) => block.id.clone(),
		None => fresh_id(taken),
	};
	taken.insert(id.clone());
	id
}

pub fn markdown_of(lead: &str, blocks: &[Block], format: Format) -> String {
	let written = blocks
		.iter()
		.map(|block| format!("{}{}{}", block.source, block.written_marker(format), block.gap));
	std::iter::once(lead.to_owned()).chain(written).collect()
}

pub fn texts_of(source: &str) -> Vec<String> {
	rows_of(source).into_iter().map(|row| row.text).collect()
}

fn unescaped_pipes(line: &str) -> Vec<usize> {
	let mut previous = None;
	let mut pipes = Vec::new();
	for (at, character) in line.char_indices() {
		if character == '|' && previous != Some('\\') {
			pipes.push(at);
		}
		previous = Some(character);
	}
	pipes
}

fn cells_of(line: &str) -> Vec<String> {
	let line = line.trim();
	let line = line.strip_prefix('|').unwrap_or(line);
	let pipes = unescaped_pipes(line);
	let end = match pipes.last() {
		Some(last) if *last + 1 == line.len() => *last,
		_ => line.len(),
	};
	let starts = std::iter::once(0).chain(pipes.iter().map(|pipe| pipe + 1));
	let ends = pipes.iter().copied().filter(|pipe| *pipe < end).chain(std::iter::once(end));
	starts.zip(ends).map(|(start, end)| line[start..end].trim().to_owned()).collect()
}

fn table_rows_of(source: &str) -> Vec<Vec<String>> {
	source
		.split('\n')
		.enumerate()
		.filter(|(index, _)| *index != 1)
		.map(|(_, line)| cells_of(line))
		.collect()
}

pub fn gallery_records(source: &str) -> Vec<Record> {
	records_of(&fence_body(source).1)
}

fn record_lines(record: &Record) -> String {
	record
		.iter()
		.enumerate()
		.map(|(at, (key, value))| format!("{}{key}: {value}", if at == 0 { "- " } else { "  " }))
		.collect::<Vec<_>>()
		.join("\n")
}

pub fn with_records(source: &str, records: &[Record]) -> String {
	let open = source.split('\n').next().unwrap_or_default();
	let marker: String = open.trim_start().chars().take_while(|c| matches!(c, '`' | '~')).collect();
	let body = records.iter().map(record_lines).collect::<Vec<_>>();
	std::iter::once(open.to_owned()).chain(body).chain([marker]).collect::<Vec<_>>().join("\n")
}

fn with_caption(source: &str, index: usize, caption: &str) -> String {
	let mut records = gallery_records(source);
	let Some(record) = records.get_mut(index) else { return source.to_owned() };
	record.retain(|(key, _)| key != "caption");
	let value = one_line(caption);
	if !value.trim().is_empty() {
		record.push(("caption".to_owned(), value));
	}
	with_records(source, &records)
}

pub fn field_texts_of(source: &str) -> Vec<String> {
	match block_type_of(source) {
		LibraryBlockType::Gallery => gallery_records(source)
			.iter()
			.map(|record| record_field(record, "caption").to_owned())
			.collect(),
		LibraryBlockType::Table => {
			let columns = table_columns(source);
			table_rows_of(source)
				.into_iter()
				.flat_map(|mut cells| {
					cells.resize(columns, String::new());
					cells
				})
				.collect()
		}
		_ => texts_of(source),
	}
}

pub fn is_editable(kind: LibraryBlockType) -> bool {
	kind.is_text() || matches!(kind, LibraryBlockType::Callout | LibraryBlockType::Code)
}

pub fn has_fields(kind: LibraryBlockType) -> bool {
	is_editable(kind) || matches!(kind, LibraryBlockType::Table | LibraryBlockType::Gallery)
}

fn is_raw(kind: LibraryBlockType) -> bool {
	matches!(kind, LibraryBlockType::Code | LibraryBlockType::Gallery)
}

pub fn table_columns(source: &str) -> usize {
	table_rows_of(source).first().map_or(1, Vec::len).max(1)
}

fn one_line(value: &str) -> String {
	let pieces: Vec<&str> = value.split('\n').collect();
	let last = pieces.len() - 1;
	pieces
		.iter()
		.enumerate()
		.map(|(at, piece)| {
			let piece = if at < last { piece.trim_end_matches([' ', '\t', '\r']) } else { piece };
			if at > 0 { piece.trim_start_matches([' ', '\t']) } else { piece }
		})
		.collect::<Vec<_>>()
		.join(" ")
}

fn as_cell(value: &str) -> String {
	let mut cell = String::new();
	let mut previous = None;
	for character in one_line(value).chars() {
		if character == '|' && previous != Some('\\') {
			cell.push('\\');
		}
		cell.push(character);
		previous = Some(character);
	}
	cell
}

fn with_cell(source: &str, field: usize, text: &str) -> String {
	let columns = table_columns(source);
	let (row, column) = (field / columns, field % columns);
	let line_at = if row == 0 { 0 } else { row + 1 };
	source
		.split('\n')
		.enumerate()
		.map(|(index, line)| {
			if index != line_at {
				return line.to_owned();
			}
			let mut cells = cells_of(line);
			cells.resize(cells.len().max(column + 1), String::new());
			cells[column] = as_cell(text);
			format!("| {} |", cells.join(" | "))
		})
		.collect::<Vec<_>>()
		.join("\n")
}

pub fn field_of(kind: LibraryBlockType, markdown: &str) -> TextEdit {
	if is_raw(kind) {
		return TextEdit::new(markdown);
	}
	let (text, marks) = inline::parse(markdown);
	let lines = text.matches('\n').count() + 1;
	TextEdit::from_parts(text, marks, vec![Line::Paragraph; lines]).allow_marks([
		Mark::Bold,
		Mark::Italic,
		Mark::Code,
		Mark::Link(String::new()),
	])
}

pub fn markdown_of_field(kind: LibraryBlockType, edit: &TextEdit) -> String {
	match is_raw(kind) {
		true => edit.text.clone(),
		false => inline::serialize(&edit.text, edit.marks()),
	}
}

pub fn markdown_before_caret(kind: LibraryBlockType, edit: &TextEdit) -> usize {
	let caret = edit.focus.min(edit.text.len());
	if is_raw(kind) {
		return caret;
	}
	let marks: Vec<MarkRange> = edit
		.marks()
		.iter()
		.filter(|mark| mark.start < caret)
		.map(|mark| MarkRange::new(mark.start..mark.end.min(caret), mark.mark.clone()))
		.collect();
	inline::serialize(&edit.text[..caret], &marks).len()
}

fn row_line(kind: LibraryBlockType, row: usize) -> usize {
	match kind {
		LibraryBlockType::Code | LibraryBlockType::Callout => row + 1,
		_ => row,
	}
}

pub fn row_start(source: &str, row: usize) -> usize {
	let kind = block_type_of(source);
	let line_at = row_line(kind, row);
	let before: usize = source.split('\n').take(line_at).map(|line| line.len() + 1).sum();
	if kind == LibraryBlockType::Code {
		return before;
	}
	let line = source.split('\n').nth(line_at).unwrap_or_default();
	let text = rows_of(source).get(row).map_or(0, |row| row.text.len());
	before + line.len().saturating_sub(text)
}

fn closing_fence_of(lines: &[&str]) -> String {
	match lines {
		[_, .., last] => (*last).to_owned(),
		_ => String::new(),
	}
}

pub fn rewritten(source: &str, row: usize, text: &str) -> String {
	let kind = block_type_of(source);
	match kind {
		LibraryBlockType::Table => return with_cell(source, row, text),
		LibraryBlockType::Gallery => return with_caption(source, row, text),
		_ => {}
	}
	let lines: Vec<&str> = source.split('\n').collect();
	if kind == LibraryBlockType::Code {
		return format!("{}\n{text}\n{}", lines[0], closing_fence_of(&lines));
	}
	let line_at = row_line(kind, row);
	let rows = rows_of(source);
	let Some(old) = rows.get(row) else { return source.to_owned() };
	lines
		.iter()
		.enumerate()
		.map(|(index, line)| match index == line_at {
			true => format!("{}{text}", &line[..line.len() - old.text.len()]),
			false => (*line).to_owned(),
		})
		.collect::<Vec<_>>()
		.join("\n")
}

fn prefixed(prefix: &str, rows: &[String]) -> String {
	rows.iter().map(|row| format!("{prefix}{row}")).collect::<Vec<_>>().join("\n")
}

pub fn converted(kind: LibraryBlockType, rows: &[String]) -> String {
	let joined = rows.join(" ");
	match kind {
		LibraryBlockType::Heading => format!("# {joined}"),
		LibraryBlockType::List => prefixed("- ", rows),
		LibraryBlockType::Checklist => prefixed("- [ ] ", rows),
		LibraryBlockType::Quote => prefixed("> ", rows),
		LibraryBlockType::Callout => format!("> [!NOTE]\n{}", prefixed("> ", rows)),
		LibraryBlockType::Code => format!("```\n{}\n```", rows.join("\n")),
		LibraryBlockType::Table => format!("| {joined} |  |\n| --- | --- |\n|  |  |"),
		LibraryBlockType::Gallery => "```gallery\n```".to_owned(),
		LibraryBlockType::WebPage => format!("```web-page\nurl: {joined}\n```"),
		LibraryBlockType::Collapsible => format!("```collapsible\ntitle: {joined}\n```"),
		LibraryBlockType::Paragraph | LibraryBlockType::Other => rows.join("\n"),
	}
}

pub fn continued_line(source: &str, row: usize) -> Option<String> {
	let kind = block_type_of(source);
	if !matches!(kind, LibraryBlockType::List | LibraryBlockType::Checklist) {
		return None;
	}
	let line = source.split('\n').nth(row)?;
	let text = rows_of(source).get(row)?.text.clone();
	let marker = line[..line.len() - text.len()].replace("[x]", "[ ]").replace("[X]", "[ ]");
	Some(marker)
}

pub fn with_line_after(source: &str, row: usize, line: &str) -> String {
	let mut lines: Vec<&str> = source.split('\n').collect();
	lines.insert((row + 1).min(lines.len()), line);
	lines.join("\n")
}

pub fn without_line(source: &str, row: usize) -> String {
	let lines: Vec<&str> = source.split('\n').collect();
	lines
		.iter()
		.enumerate()
		.filter(|(index, _)| *index != row)
		.map(|(_, line)| *line)
		.collect::<Vec<_>>()
		.join("\n")
}

pub fn line_count(source: &str) -> usize {
	source.split('\n').count()
}
