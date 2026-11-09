use std::collections::HashSet;

use kiroshi_core::library::contract::{LibraryPresenceAt, LibraryWriter, LibraryWriterKind};
use rune::TextEdit;

use kiroshi_rune_kit::surfaces::s14_library::{BLOCK_GAP, LibraryBlockType};

use super::blocks::{
	self, Block, Format, continued_line, converted, field_of, field_texts_of, fresh_id, has_fields,
	is_editable, lead_of, line_count, markdown_before_caret, markdown_of, markdown_of_field,
	rewritten, row_start, texts_of, with_line_after, without_line,
};
use super::session::Session;
use super::worker::Target;

const SENTENCE_ENDS: [char; 4] = ['.', '!', '?', '…'];

pub enum Phase {
	Opening,
	Failed,
	Open(Session),
}

pub struct Field {
	pub block: String,
	pub row: usize,
	pub edit: TextEdit,
	built_from: String,
}

struct Seat {
	id: String,
	start: String,
	first_seen: i64,
	last_seen: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cut {
	pub row: usize,
	pub from: usize,
	pub to: usize,
}

pub struct Card {
	pub agent_id: String,
	pub name: Option<String>,
	pub block: String,
	pub elapsed_seconds: u32,
	pub sentences: usize,
	pub section: String,
}

pub struct Document {
	pub target: Target,
	pub format: Format,
	pub title: TextEdit,
	pub phase: Phase,
	pub lead: String,
	pub blocks: Vec<Block>,
	pub fields: Vec<Field>,
	pub writers: Vec<LibraryWriter>,
	seats: Vec<Seat>,
	is_dirty: bool,
	heard_early: Vec<String>,
}

pub fn title_of(name: &str) -> &str {
	match name.rfind('.') {
		Some(at) if at > 0 => &name[..at],
		_ => name,
	}
}

fn named_as(name: &str, title: &str) -> String {
	format!("{title}{}", &name[title_of(name).len()..])
}

fn empty_paragraph(taken: &HashSet<String>, gap: String) -> Block {
	Block { id: fresh_id(taken), source: String::new(), marker: String::new(), gap }
}

fn sentence_count(text: &str) -> usize {
	text.split_inclusive(SENTENCE_ENDS).filter(|sentence| !sentence.trim().is_empty()).count()
}

fn section_before(markdown: &str, offset: usize) -> Option<String> {
	let before = markdown.get(..offset)?;
	before.lines().rev().find_map(|line| {
		let hashes = line.len() - line.trim_start_matches('#').len();
		let heading = line[hashes..].strip_prefix(' ')?;
		((1..=6).contains(&hashes) && !heading.trim().is_empty()).then(|| heading.trim().to_owned())
	})
}

impl Document {
	pub fn new(target: Target) -> Document {
		let title = TextEdit::new(title_of(&target.name));
		Document {
			format: Format::of(&target.name),
			target,
			title,
			phase: Phase::Opening,
			lead: String::new(),
			blocks: Vec::new(),
			fields: Vec::new(),
			writers: Vec::new(),
			seats: Vec::new(),
			is_dirty: false,
			heard_early: Vec::new(),
		}
	}

	pub fn session(&self) -> Option<&Session> {
		match &self.phase {
			Phase::Open(session) => Some(session),
			Phase::Opening | Phase::Failed => None,
		}
	}

	fn session_mut(&mut self) -> Option<&mut Session> {
		match &mut self.phase {
			Phase::Open(session) => Some(session),
			Phase::Opening | Phase::Failed => None,
		}
	}

	pub fn opened(&mut self, state: Result<String, String>) -> Result<(), String> {
		let mut session = match state.and_then(|update| Session::opened(&update)) {
			Ok(session) => session,
			Err(failure) => {
				self.phase = Phase::Failed;
				return Err(failure);
			}
		};
		let caught_up = std::mem::take(&mut self.heard_early)
			.iter()
			.try_for_each(|update| session.received(update));
		self.phase = Phase::Open(session);
		self.is_dirty = false;
		self.project();
		caught_up
	}

	pub fn heard_update(&mut self, update: String) -> Result<Option<String>, String> {
		if self.session().is_none() {
			self.heard_early.push(update);
			return Ok(None);
		}
		let pending = self.flushed();
		if let Some(session) = self.session_mut() {
			session.received(&update)?;
		}
		self.project();
		Ok(pending)
	}

	pub fn markdown(&self) -> String {
		markdown_of(&self.lead, &self.blocks, self.format)
	}

	fn project(&mut self) {
		let Some(markdown) = self.session().map(Session::markdown) else { return };
		self.lead = lead_of(&markdown).to_owned();
		self.blocks = blocks::blocks_of(&markdown, &self.blocks);
		if self.blocks.is_empty() {
			self.blocks.push(empty_paragraph(&HashSet::new(), String::new()));
		}
		self.rebuild_fields();
	}

	fn rebuild_fields(&mut self) {
		let mut held: Vec<Field> = std::mem::take(&mut self.fields);
		for block in &self.blocks {
			let kind = block.kind();
			if !has_fields(kind) {
				continue;
			}
			for (row, text) in field_texts_of(&block.source).iter().enumerate() {
				let kept = held.iter().position(|field| {
					field.block == block.id && field.row == row && field.built_from == block.source
				});
				let edit = match kept {
					Some(at) => held.swap_remove(at).edit,
					None => field_of(kind, text),
				};
				let built_from = block.source.clone();
				self.fields.push(Field { block: block.id.clone(), row, edit, built_from });
			}
		}
	}

	pub fn field_mut(&mut self, block: &str, row: usize) -> Option<&mut TextEdit> {
		let field = self.fields.iter_mut().find(|field| field.block == block && field.row == row);
		field.map(|field| &mut field.edit)
	}

	pub fn field(&self, block: &str, row: usize) -> Option<&TextEdit> {
		let field = self.fields.iter().find(|field| field.block == block && field.row == row);
		field.map(|field| &field.edit)
	}

	pub fn focused(&self) -> Option<&Field> {
		self.fields.iter().find(|field| field.edit.focused)
	}

	pub fn block_at(&self, block: &str) -> Option<usize> {
		self.blocks.iter().position(|held| held.id == block)
	}

	pub fn focus_cell(&mut self, block: &str, field: usize) {
		for held in &mut self.fields {
			held.edit.focused = false;
		}
		if let Some(edit) = self.field_mut(block, field) {
			edit.focused = true;
			edit.set_selection(0, edit.text.len());
		}
	}

	fn focus(&mut self, block: &str, row: usize) {
		for field in &mut self.fields {
			field.edit.focused = false;
		}
		if let Some(edit) = self.field_mut(block, row) {
			edit.focused = true;
			edit.set_caret(edit.text.len());
		}
	}

	pub fn flushed(&mut self) -> Option<String> {
		if !self.is_dirty {
			return None;
		}
		self.is_dirty = false;
		let markdown = self.markdown();
		self.session_mut()?.edited(&markdown)
	}

	pub fn typed(&mut self, block: &str, row: usize) {
		let Some(at) = self.block_at(block) else { return };
		let kind = self.blocks[at].kind();
		let Some(text) = self.field(block, row).map(|edit| markdown_of_field(kind, edit)) else {
			return;
		};
		let source = rewritten(&self.blocks[at].source, row, &text);
		self.blocks[at].source.clone_from(&source);
		for field in self.fields.iter_mut().filter(|field| field.block == block) {
			field.built_from.clone_from(&source);
		}
		self.is_dirty = true;
	}

	pub fn entered(&mut self, block: &str, row: usize) -> Option<String> {
		let at = self.block_at(block)?;
		let source = self.blocks[at].source.clone();
		if let Some(line) = continued_line(&source, row) {
			self.blocks[at].source = with_line_after(&source, row, &line);
			self.rebuild_fields();
			self.focus(block, row + 1);
			self.is_dirty = true;
			return self.flushed();
		}
		let taken: HashSet<String> = self.blocks.iter().map(|held| held.id.clone()).collect();
		let gap = std::mem::replace(&mut self.blocks[at].gap, BLOCK_GAP.to_owned());
		let added = empty_paragraph(&taken, gap);
		let id = added.id.clone();
		self.blocks.insert(at + 1, added);
		self.rebuild_fields();
		self.focus(&id, 0);
		self.is_dirty = true;
		self.flushed()
	}

	pub fn backspaced(&mut self, block: &str, row: usize) -> Option<String> {
		let is_empty = self.field(block, row).is_some_and(|edit| edit.text.is_empty());
		let at = self.block_at(block)?;
		if !is_empty {
			return None;
		}
		let source = self.blocks[at].source.clone();
		if line_count(&source) > 1 {
			self.blocks[at].source = without_line(&source, row);
			self.rebuild_fields();
			self.focus(block, row.saturating_sub(1));
			self.is_dirty = true;
			return self.flushed();
		}
		if at == 0 {
			return None;
		}
		let removed = self.blocks.remove(at);
		self.blocks[at - 1].gap = removed.gap;
		let previous = self.blocks[at - 1].id.clone();
		let last_row = texts_of(&self.blocks[at - 1].source).len().saturating_sub(1);
		self.rebuild_fields();
		self.focus(&previous, last_row);
		self.is_dirty = true;
		self.flushed()
	}

	fn restructured(&mut self) -> Option<String> {
		self.rebuild_fields();
		self.is_dirty = true;
		self.flushed()
	}

	fn inserted_after(&mut self, at: usize, source: String) -> String {
		let taken: HashSet<String> = self.blocks.iter().map(|held| held.id.clone()).collect();
		let gap = std::mem::replace(&mut self.blocks[at].gap, BLOCK_GAP.to_owned());
		let added = Block { source, ..empty_paragraph(&taken, gap) };
		let id = added.id.clone();
		self.blocks.insert(at + 1, added);
		id
	}

	pub fn insert_below(&mut self, block: &str) -> Option<String> {
		let at = self.block_at(block)?;
		let id = self.inserted_after(at, String::new());
		let update = self.restructured();
		self.focus(&id, 0);
		update
	}

	pub fn duplicate(&mut self, block: &str) -> Option<String> {
		let at = self.block_at(block)?;
		let source = self.blocks[at].source.clone();
		self.inserted_after(at, source);
		self.restructured()
	}

	pub fn move_block(&mut self, from: usize, to: usize) -> Option<String> {
		if from == to || from >= self.blocks.len() || to >= self.blocks.len() {
			return None;
		}
		let gaps: Vec<String> = self.blocks.iter().map(|block| block.gap.clone()).collect();
		let moved = self.blocks.remove(from);
		self.blocks.insert(to, moved);
		for (block, gap) in self.blocks.iter_mut().zip(gaps) {
			block.gap = gap;
		}
		self.restructured()
	}

	pub fn remove_block(&mut self, block: &str) -> Option<String> {
		let at = self.block_at(block)?;
		let removed = self.blocks.remove(at);
		match self.blocks.len() {
			0 => self.blocks.push(empty_paragraph(&HashSet::new(), removed.gap)),
			left if at == left => self.blocks[at - 1].gap = removed.gap,
			_ => {}
		}
		self.restructured()
	}

	pub fn convert(&mut self, block: &str, kind: LibraryBlockType, cut: Option<Cut>) {
		let Some(at) = self.block_at(block) else { return };
		let current = self.blocks[at].kind();
		if !is_editable(current) {
			return;
		}
		let rows: Vec<String> = texts_of(&self.blocks[at].source)
			.iter()
			.enumerate()
			.map(|(row, text)| match self.field(block, row) {
				Some(edit) => cut_markdown(current, edit, cut.filter(|cut| cut.row == row)),
				None => text.clone(),
			})
			.collect();
		let kind = if current == kind { LibraryBlockType::Paragraph } else { kind };
		self.blocks[at].source = converted(kind, &rows);
		self.rebuild_fields();
		self.focus(block, 0);
		self.is_dirty = true;
	}

	pub fn new_name(&self) -> Option<String> {
		let renamed = named_as(&self.target.name, &self.title.text);
		(renamed != self.target.name && !self.title.text.trim().is_empty()).then_some(renamed)
	}

	pub fn restore_title(&mut self) {
		self.title = TextEdit::new(title_of(&self.target.name));
	}

	pub fn moved_to(&mut self, name: String) {
		self.target.name = name;
		if !self.title.focused {
			self.restore_title();
		}
	}

	pub fn writers_heard(&mut self, writers: Vec<LibraryWriter>, now: i64) {
		self.writers =
			writers.into_iter().filter(|writer| writer.kind != LibraryWriterKind::Person).collect();
		let held = std::mem::take(&mut self.seats);
		self.seats = self
			.agents()
			.filter_map(|writer| {
				let LibraryPresenceAt::Text { anchor } = &writer.at else { return None };
				let seated = held.iter().find(|seat| seat.id == writer.id);
				Some(Seat {
					id: writer.id.clone(),
					start: seated.map_or_else(|| anchor.clone(), |seat| seat.start.clone()),
					first_seen: seated.map_or(now, |seat| seat.first_seen),
					last_seen: now,
				})
			})
			.collect();
	}

	pub fn writer_finished(&mut self, agent_id: &str) {
		self.writers.retain(|writer| writer.id != agent_id);
		self.seats.retain(|seat| seat.id != agent_id);
	}

	pub fn agents(&self) -> impl Iterator<Item = &LibraryWriter> {
		self.writers.iter().filter(|writer| writer.kind == LibraryWriterKind::Agent)
	}

	pub fn people(&self) -> impl Iterator<Item = &str> {
		self.writers
			.iter()
			.filter(|writer| writer.kind == LibraryWriterKind::Member)
			.map(|writer| writer.name.as_deref().unwrap_or_default())
	}

	fn offset_of_anchor(&self, writer: &LibraryWriter) -> Option<usize> {
		let LibraryPresenceAt::Text { anchor } = &writer.at else { return None };
		self.session()?.offset_of(anchor)
	}

	fn block_at_offset(&self, offset: usize) -> Option<&str> {
		let mut end = self.lead.len();
		for block in &self.blocks {
			end += block.written_len(self.format);
			if offset <= end {
				return Some(block.id.as_str());
			}
		}
		self.blocks.last().map(|block| block.id.as_str())
	}

	pub fn block_of_writer(&self, writer: &LibraryWriter) -> Option<&str> {
		self.block_at_offset(self.offset_of_anchor(writer)?)
	}

	pub fn cards(&self) -> Vec<Card> {
		let Some(session) = self.session() else { return Vec::new() };
		let markdown = session.markdown();
		let title = title_of(&self.target.name);
		self.agents()
			.filter_map(|writer| {
				let seat = self.seats.iter().find(|seat| seat.id == writer.id)?;
				let end = self.offset_of_anchor(writer)?;
				let start = session.offset_of(&seat.start).unwrap_or(end).min(end);
				let written = markdown.get(start..end).unwrap_or_default();
				Some(Card {
					agent_id: writer.id.clone(),
					name: writer.name.clone(),
					block: self.block_at_offset(end)?.to_owned(),
					elapsed_seconds: ((seat.last_seen - seat.first_seen).max(0) / 1000) as u32,
					sentences: sentence_count(written),
					section: section_before(&markdown, start).unwrap_or_else(|| title.to_owned()),
				})
			})
			.collect()
	}

	pub fn caret_offset(&self) -> Option<usize> {
		let field = self.focused()?;
		let at = self.block_at(&field.block)?;
		let before: usize =
			self.blocks[..at].iter().map(|block| block.written_len(self.format)).sum();
		let block = &self.blocks[at];
		let in_row = markdown_before_caret(block.kind(), &field.edit);
		Some(self.lead.len() + before + row_start(&block.source, field.row) + in_row)
	}
}

fn cut_markdown(kind: LibraryBlockType, edit: &TextEdit, cut: Option<Cut>) -> String {
	let Some(Cut { from, to, .. }) = cut else { return markdown_of_field(kind, edit) };
	let mut kept = edit.clone();
	kept.set_selection(from, to.min(kept.text.len()));
	kept.insert("");
	markdown_of_field(kind, &kept)
}
