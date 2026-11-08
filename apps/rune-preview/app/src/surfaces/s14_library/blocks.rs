use std::collections::HashSet;

use rune::{Mark, MarkRange, TextEdit};

use kiroshi_rune_kit::surfaces::s14_library::{
	BLOCK_GAP, BLOCK_ID_ALPHABET, BLOCK_ID_LENGTH, LibraryBlockType, block_type_of, is_block_id,
	parse_blocks, rows_of,
};

const PLAIN_EXTENSION: &str = ".txt";

const ESCAPED: [char; 7] = ['\\', '*', '_', '`', '~', '[', '<'];

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

	fn written_marker(&self, format: Format) -> String {
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

pub fn markdown_of(blocks: &[Block], format: Format) -> String {
	blocks
		.iter()
		.map(|block| format!("{}{}{}", block.source, block.written_marker(format), block.gap))
		.collect()
}

pub fn texts_of(source: &str) -> Vec<String> {
	rows_of(source).into_iter().map(|row| row.text).collect()
}

pub fn is_editable(kind: LibraryBlockType) -> bool {
	kind.is_text() || matches!(kind, LibraryBlockType::Callout | LibraryBlockType::Code)
}

fn closing_fence_of(lines: &[&str]) -> String {
	match lines {
		[_, .., last] => (*last).to_owned(),
		_ => String::new(),
	}
}

pub fn rewritten(source: &str, row: usize, text: &str) -> String {
	let kind = block_type_of(source);
	let lines: Vec<&str> = source.split('\n').collect();
	if kind == LibraryBlockType::Code {
		return format!("{}\n{text}\n{}", lines[0], closing_fence_of(&lines));
	}
	let line_at = row + usize::from(kind == LibraryBlockType::Callout);
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

fn opener(mark: &Mark) -> &'static str {
	match mark {
		Mark::Bold => "**",
		Mark::Italic => "*",
		Mark::Strike => "~~",
		Mark::Code => "`",
		Mark::Link(_) => "[",
		Mark::Pill(_) => "![",
		_ => "",
	}
}

fn closer(mark: &Mark) -> String {
	match mark {
		Mark::Link(url) | Mark::Pill(url) => format!("]({url})"),
		other => opener(other).to_owned(),
	}
}

fn marks_over(marks: &[MarkRange], from: usize, to: usize) -> Vec<&Mark> {
	let mut covering: Vec<&MarkRange> = marks
		.iter()
		.filter(|mark| mark.start <= from && mark.end >= to && !opener(&mark.mark).is_empty())
		.collect();
	covering.sort_by_key(|mark| (mark.mark == Mark::Code, mark.start, std::cmp::Reverse(mark.end)));
	covering.into_iter().map(|mark| &mark.mark).collect()
}

fn push_escaped(markdown: &mut String, segment: &str) {
	for character in segment.chars() {
		if ESCAPED.contains(&character) {
			markdown.push('\\');
		}
		markdown.push(character);
	}
}

pub fn inline_markdown(edit: &TextEdit) -> String {
	let (text, marks) = (edit.text.as_str(), edit.marks());
	let mut cuts: Vec<usize> = marks.iter().flat_map(|mark| [mark.start, mark.end]).collect();
	cuts.extend([0, text.len()]);
	cuts.retain(|cut| *cut <= text.len() && text.is_char_boundary(*cut));
	cuts.sort_unstable();
	cuts.dedup();
	let mut markdown = String::with_capacity(text.len());
	let mut open: Vec<&Mark> = Vec::new();
	for cut in cuts.windows(2) {
		let wanted = marks_over(marks, cut[0], cut[1]);
		let kept = open.iter().zip(&wanted).take_while(|(held, want)| held == want).count();
		while open.len() > kept {
			open.pop().into_iter().for_each(|mark| markdown.push_str(&closer(mark)));
		}
		for mark in &wanted[kept..] {
			markdown.push_str(opener(mark));
			open.push(mark);
		}
		let segment = &text[cut[0]..cut[1]];
		if open.contains(&&Mark::Code) {
			markdown.push_str(segment);
		} else {
			push_escaped(&mut markdown, segment);
		}
	}
	open.into_iter().rev().for_each(|mark| markdown.push_str(&closer(mark)));
	markdown
}
