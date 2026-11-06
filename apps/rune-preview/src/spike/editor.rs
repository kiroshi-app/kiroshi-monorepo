use rune::{Block, Key, KeyEvent, Mark, MarkRange, TextEdit};

use super::inline;
use super::model::{
	BLOCK_GAP, LibraryBlock, LibraryBlockDocument, LibraryBlockType, as_cell, block_type_of,
	cells_of, closes_fence, fence_marker, parse_blocks, row_marker_len, serialize_blocks,
	table_source_of,
};

const HISTORY_LIMIT: usize = 200;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Shape {
	Paragraph,
	Rows { kind: LibraryBlockType, head: Option<String>, markers: Vec<String> },
	Code { open: String, close: Option<String> },
	Table { columns: usize, delimiter: Vec<String> },
	Opaque(String),
}

#[derive(Clone, Debug)]
pub struct EditorBlock {
	pub id: String,
	pub shape: Shape,
	pub fields: Vec<TextEdit>,
	pub gap: String,
}

impl EditorBlock {
	fn open(block: &LibraryBlock) -> EditorBlock {
		let (shape, fields) = shape_of(&block.source);
		EditorBlock { id: block.id.clone(), shape, fields, gap: block.gap.clone() }
	}

	pub fn source(&self) -> String {
		let markdown = |edit: &TextEdit| inline::serialize(&edit.text, edit.marks());
		match &self.shape {
			Shape::Paragraph => self.fields.iter().map(markdown).collect(),
			Shape::Rows { head, markers, .. } => head
				.iter()
				.cloned()
				.chain(
					markers
						.iter()
						.zip(&self.fields)
						.map(|(marker, edit)| marker.clone() + &markdown(edit)),
				)
				.collect::<Vec<_>>()
				.join("\n"),
			Shape::Code { open, close } => {
				let body = self
					.fields
					.first()
					.map(|edit| edit.text.as_str())
					.filter(|body| !body.is_empty());
				[Some(open.as_str()), body, close.as_deref()]
					.into_iter()
					.flatten()
					.collect::<Vec<_>>()
					.join("\n")
			}
			Shape::Table { columns, delimiter } => {
				let mut rows: Vec<Vec<String>> = self
					.fields
					.chunks(*columns)
					.map(|row| row.iter().map(|cell| as_cell(&markdown(cell))).collect())
					.collect();
				rows.insert(1.min(rows.len()), delimiter.clone());
				table_source_of(&rows)
			}
			Shape::Opaque(source) => source.clone(),
		}
	}

	fn is_text(&self) -> bool {
		matches!(self.shape, Shape::Paragraph | Shape::Rows { .. })
	}

	fn plain_text(&self) -> String {
		self.fields.iter().map(|edit| edit.text.as_str()).collect::<Vec<_>>().join("\n")
	}
}

fn shape_of(source: &str) -> (Shape, Vec<TextEdit>) {
	let lines: Vec<&str> = source.split('\n').collect();
	match block_type_of(source) {
		LibraryBlockType::Paragraph => (Shape::Paragraph, vec![rich_field(source)]),
		kind @ (LibraryBlockType::Heading
		| LibraryBlockType::List
		| LibraryBlockType::Checklist
		| LibraryBlockType::Quote) => rows_of(kind, None, &lines),
		LibraryBlockType::Callout => {
			rows_of(LibraryBlockType::Callout, Some(lines[0].to_owned()), &lines[1..])
		}
		LibraryBlockType::Code if !lines[0].starts_with([' ', '\t']) => {
			let last = lines[lines.len() - 1];
			let closed = lines.len() > 1
				&& fence_marker(lines[0]).is_some_and(|fence| closes_fence(last, fence));
			let body_end = if closed { lines.len() - 1 } else { lines.len() };
			let shape =
				Shape::Code { open: lines[0].to_owned(), close: closed.then(|| last.to_owned()) };
			(shape, vec![TextEdit::new(lines[1..body_end].join("\n"))])
		}
		LibraryBlockType::Table => {
			let mut rows: Vec<Vec<String>> = lines.iter().map(|line| cells_of(line)).collect();
			let delimiter = rows.remove(1);
			let columns = rows[0].len();
			let fields = rows
				.into_iter()
				.flat_map(|mut row| {
					row.resize(columns, String::new());
					row.into_iter().map(|cell| rich_field(&cell))
				})
				.collect();
			(Shape::Table { columns, delimiter }, fields)
		}
		_ => (Shape::Opaque(source.to_owned()), Vec::new()),
	}
}

fn rows_of(kind: LibraryBlockType, head: Option<String>, lines: &[&str]) -> (Shape, Vec<TextEdit>) {
	let (markers, fields) = lines
		.iter()
		.map(|line| {
			let marker = row_marker_len(line, kind);
			(line[..marker].to_owned(), rich_field(&line[marker..]))
		})
		.unzip();
	(Shape::Rows { kind, head, markers }, fields)
}

fn rich_field(markdown: &str) -> TextEdit {
	let (text, marks) = inline::parse(markdown);
	attributed(text, marks)
}

fn attributed(text: String, marks: Vec<MarkRange>) -> TextEdit {
	let lines = text.matches('\n').count() + 1;
	TextEdit::from_parts(text, marks, vec![Block::Paragraph; lines])
		.allow_marks([Mark::Bold, Mark::Italic, Mark::Code, Mark::Link(String::new())])
		.allow_blocks([Block::Paragraph])
}

fn joined(above: &TextEdit, below: &TextEdit) -> TextEdit {
	let join = above.text.len();
	let marks = above
		.marks()
		.iter()
		.cloned()
		.chain(
			below
				.marks()
				.iter()
				.map(|mark| MarkRange::new(mark.start + join..mark.end + join, mark.mark.clone())),
		)
		.collect();
	let mut edit = attributed(above.text.clone() + &below.text, marks);
	edit.focused = true;
	edit.set_caret(join);
	edit
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SlashChoice {
	Heading,
	Checklist,
	Code,
	Callout,
}

pub const SLASH_CHOICES: [SlashChoice; 4] =
	[SlashChoice::Heading, SlashChoice::Checklist, SlashChoice::Code, SlashChoice::Callout];

impl SlashChoice {
	fn skeleton(self) -> &'static str {
		match self {
			SlashChoice::Heading => "## ",
			SlashChoice::Checklist => "- [ ] ",
			SlashChoice::Code => "```\n```",
			SlashChoice::Callout => "> [!NOTE]\n> ",
		}
	}

	pub fn label(self) -> &'static str {
		match self {
			SlashChoice::Heading => "Heading",
			SlashChoice::Checklist => "Checklist",
			SlashChoice::Code => "Code",
			SlashChoice::Callout => "Callout",
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Slash {
	pub block: String,
	pub active: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Point {
	block: usize,
	at: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Selection {
	anchor: Point,
	focus: Point,
}

impl Selection {
	fn ordered(self) -> (Point, Point) {
		(self.anchor.min(self.focus), self.anchor.max(self.focus))
	}
}

#[derive(Debug, PartialEq, Eq)]
pub enum KeyOutcome {
	Passed,
	Consumed,
	Copied(String),
}

#[derive(Clone, Debug, Default)]
pub struct Editor {
	lead: String,
	pub blocks: Vec<EditorBlock>,
	pub slash: Option<Slash>,
	selection: Option<Selection>,
	undone: Vec<Vec<EditorBlock>>,
	redone: Vec<Vec<EditorBlock>>,
	settled: Vec<EditorBlock>,
	next_id: u64,
	detached: TextEdit,
}

impl Editor {
	pub fn from_markdown(markdown: &str) -> Editor {
		let mut count = 0;
		let document = parse_blocks(markdown, &mut || {
			count += 1;
			format!("block-{count}")
		});
		Editor::open(&document)
	}

	pub fn open(document: &LibraryBlockDocument) -> Editor {
		let blocks: Vec<EditorBlock> = document.blocks.iter().map(EditorBlock::open).collect();
		Editor {
			lead: document.lead.clone(),
			settled: blocks.clone(),
			next_id: blocks.len() as u64,
			blocks,
			..Editor::default()
		}
	}

	pub fn document(&self) -> LibraryBlockDocument {
		LibraryBlockDocument {
			lead: self.lead.clone(),
			blocks: self
				.blocks
				.iter()
				.map(|block| LibraryBlock {
					id: block.id.clone(),
					source: block.source(),
					gap: block.gap.clone(),
				})
				.collect(),
		}
	}

	pub fn markdown(&self) -> String {
		serialize_blocks(&self.document())
	}

	fn index_of(&self, id: &str) -> Option<usize> {
		self.blocks.iter().position(|block| block.id == id)
	}

	pub fn field_mut(&mut self, id: &str, field: usize) -> &mut TextEdit {
		let found = self.blocks.iter_mut().find(|block| block.id == id);
		match found.and_then(|block| block.fields.get_mut(field)) {
			Some(edit) => edit,
			None => &mut self.detached,
		}
	}

	pub fn focus(&mut self, block: usize, field: usize, caret: usize) {
		self.blocks
			.iter_mut()
			.flat_map(|block| &mut block.fields)
			.for_each(|edit| edit.focused = false);
		if let Some(edit) = self.blocks.get_mut(block).and_then(|block| block.fields.get_mut(field))
		{
			edit.focused = true;
			edit.set_caret(caret);
		}
	}

	pub fn input_key(&mut self, id: &str, field: usize, event: &KeyEvent) -> KeyOutcome {
		let Some(block) = self.index_of(id) else {
			return KeyOutcome::Passed;
		};
		if self.slash.as_ref().is_some_and(|slash| slash.block == id)
			&& let Some(outcome) = self.slash_key(event)
		{
			return outcome;
		}
		if event.is_command('z') {
			if event.mods.shift {
				self.redo()
			} else {
				self.undo()
			}
			return KeyOutcome::Consumed;
		}
		if self.selection.is_some()
			&& let Some(outcome) = self.selection_key(event)
		{
			return outcome;
		}
		let plain = event.mods == rune::Mods::default();
		match event.key {
			Key::Enter if plain => self.enter(block, field),
			Key::Backspace if plain => self.backspace(block, field),
			Key::Down if event.mods.shift => self.extend_selection(block, field, true),
			Key::Up if event.mods.shift => self.extend_selection(block, field, false),
			_ => KeyOutcome::Passed,
		}
	}

	pub fn changed(&mut self, id: &str) {
		let typed_slash = self
			.index_of(id)
			.map(|block| &self.blocks[block])
			.filter(|block| block.shape == Shape::Paragraph)
			.and_then(|block| block.fields.first())
			.map(|edit| edit.text.as_str());
		match typed_slash {
			Some("/") => self.slash = Some(Slash { block: id.to_owned(), active: 0 }),
			Some(text) if !text.starts_with('/') => {
				self.slash.take_if(|slash| slash.block == id);
			}
			_ => {}
		}
		self.commit();
	}

	pub fn choose(&mut self, choice: SlashChoice) {
		let Some(slash) = self.slash.take() else {
			return;
		};
		let Some(block) = self.index_of(&slash.block) else {
			return;
		};
		let gap = self.blocks[block].gap.clone();
		let source = choice.skeleton().to_owned();
		self.blocks[block] = EditorBlock::open(&LibraryBlock { id: slash.block, source, gap });
		let caret = self.blocks[block].fields.first().map_or(0, |edit| edit.text.len());
		self.focus(block, 0, caret);
		self.commit();
	}

	fn slash_key(&mut self, event: &KeyEvent) -> Option<KeyOutcome> {
		let slash = self.slash.as_mut()?;
		let count = SLASH_CHOICES.len();
		match event.key {
			Key::Down => slash.active = (slash.active + 1) % count,
			Key::Up => slash.active = (slash.active + count - 1) % count,
			Key::Enter => {
				let choice = SLASH_CHOICES[slash.active % count];
				self.choose(choice);
			}
			Key::Escape => self.slash = None,
			_ => return None,
		}
		Some(KeyOutcome::Consumed)
	}

	fn enter(&mut self, block: usize, field: usize) -> KeyOutcome {
		let current = &mut self.blocks[block];
		if matches!(current.shape, Shape::Code { .. }) {
			current.fields[field].insert("\n");
			self.commit();
			return KeyOutcome::Consumed;
		}
		let edit = &current.fields[field];
		let at_end = edit.range() == (edit.text.len(), edit.text.len());
		if !current.is_text() || field + 1 != current.fields.len() || !at_end {
			return KeyOutcome::Passed;
		}
		let gap = std::mem::replace(&mut current.gap, BLOCK_GAP.to_owned());
		let id = self.fresh_id();
		let below = EditorBlock { id, shape: Shape::Paragraph, fields: vec![rich_field("")], gap };
		self.blocks.insert(block + 1, below);
		self.focus(block + 1, 0, 0);
		self.commit();
		KeyOutcome::Consumed
	}

	fn backspace(&mut self, block: usize, field: usize) -> KeyOutcome {
		let current = &self.blocks[block];
		let at_start = current.fields.get(field).is_some_and(|edit| edit.range() == (0, 0));
		let mergeable = block > 0 && field == 0 && current.is_text() && current.fields.len() == 1;
		if !at_start || !mergeable || !self.blocks[block - 1].is_text() {
			return KeyOutcome::Passed;
		}
		self.merge_into_above(block);
		self.commit();
		KeyOutcome::Consumed
	}

	fn merge_into_above(&mut self, block: usize) {
		let removed = self.blocks.remove(block);
		let is_last = block == self.blocks.len();
		let above = &mut self.blocks[block - 1];
		let last = above.fields.len() - 1;
		above.fields[last] = joined(&above.fields[last], &removed.fields[0]);
		if is_last {
			above.gap = removed.gap;
		}
		let caret = above.fields[last].focus;
		self.focus(block - 1, last, caret);
	}

	fn extend_selection(&mut self, block: usize, field: usize, down: bool) -> KeyOutcome {
		let edit = &self.blocks[block].fields[field];
		let edge = if down { edit.text.len() } else { 0 };
		let anchor = match self.selection {
			Some(selection) => selection.anchor,
			None if edit.focus == edge && self.blocks[block].fields.len() == 1 => {
				Point { block, at: edit.anchor }
			}
			None => return KeyOutcome::Passed,
		};
		let from = self.selection.map_or(block, |selection| selection.focus.block);
		let target = if down { from + 1 } else { from.wrapping_sub(1) };
		let Some(reached) = self.blocks.get(target).filter(|reached| reached.fields.len() == 1)
		else {
			return KeyOutcome::Consumed;
		};
		let at = if down { reached.fields[0].text.len() } else { 0 };
		self.select(anchor, Point { block: target, at });
		KeyOutcome::Consumed
	}

	fn select(&mut self, anchor: Point, focus: Point) {
		let selection = Selection { anchor, focus };
		let (start, end) = selection.ordered();
		for index in start.block..=end.block {
			let Some(edit) = self.blocks[index].fields.first_mut() else {
				continue;
			};
			let from = if index == start.block { start.at } else { 0 };
			let to = if index == end.block { end.at } else { edit.text.len() };
			edit.set_selection(from, to);
		}
		self.selection = Some(selection);
	}

	fn selection_key(&mut self, event: &KeyEvent) -> Option<KeyOutcome> {
		if event.is_command('c') {
			return self.copy_selection().map(KeyOutcome::Copied);
		}
		if event.is_command('x') {
			let copied = self.copy_selection();
			self.delete_selection();
			return copied.map(KeyOutcome::Copied);
		}
		match event.key {
			Key::Backspace | Key::Delete => {
				self.delete_selection();
				Some(KeyOutcome::Consumed)
			}
			Key::Text(_) if !event.mods.cmd => {
				self.delete_selection();
				Some(KeyOutcome::Passed)
			}
			Key::Up | Key::Down if event.mods.shift => None,
			_ => {
				self.selection = None;
				None
			}
		}
	}

	fn copy_selection(&self) -> Option<String> {
		let (start, end) = self.selection?.ordered();
		let parts: Vec<String> = (start.block..=end.block)
			.map(|index| {
				let text = self.blocks[index].plain_text();
				let from = if index == start.block { start.at } else { 0 };
				let to = if index == end.block { end.at } else { text.len() };
				text.get(from..to).unwrap_or_default().to_owned()
			})
			.collect();
		Some(parts.join("\n"))
	}

	fn delete_selection(&mut self) {
		let Some((start, end)) = self.selection.take().map(Selection::ordered) else {
			return;
		};
		let head = &mut self.blocks[start.block].fields[0];
		head.set_selection(start.at, head.text.len());
		head.insert("");
		let tail = &mut self.blocks[end.block].fields[0];
		tail.set_selection(0, end.at);
		tail.insert("");
		self.blocks.drain(start.block + 1..end.block);
		self.merge_into_above(start.block + 1);
		self.commit();
	}

	pub fn undo(&mut self) {
		if let Some(previous) = self.undone.pop() {
			let left = self.caret();
			self.redone.push(std::mem::replace(&mut self.blocks, previous));
			self.restored(left);
		}
	}

	pub fn redo(&mut self) {
		if let Some(next) = self.redone.pop() {
			let left = self.caret();
			self.undone.push(std::mem::replace(&mut self.blocks, next));
			self.restored(left);
		}
	}

	fn caret(&self) -> Option<(String, usize, usize)> {
		self.blocks.iter().find_map(|block| {
			let field = block.fields.iter().position(|edit| edit.focused)?;
			Some((block.id.clone(), field, block.fields[field].focus))
		})
	}

	fn restored(&mut self, left: Option<(String, usize, usize)>) {
		self.slash = None;
		self.selection = None;
		if self.caret().is_none()
			&& let Some((id, field, caret)) = left
			&& let Some(block) = self.index_of(&id)
			&& let Some(edit) = self.blocks[block].fields.get(field)
		{
			let caret = if edit.text.is_char_boundary(caret) { caret } else { edit.text.len() };
			self.focus(block, field, caret);
		}
		self.settled = self.blocks.clone();
	}

	fn commit(&mut self) {
		let previous = std::mem::replace(&mut self.settled, self.blocks.clone());
		self.undone.push(previous);
		if self.undone.len() > HISTORY_LIMIT {
			self.undone.remove(0);
		}
		self.redone.clear();
	}

	fn fresh_id(&mut self) -> String {
		loop {
			self.next_id += 1;
			let id = format!("block-{}", self.next_id);
			if self.index_of(&id).is_none() {
				return id;
			}
		}
	}
}
