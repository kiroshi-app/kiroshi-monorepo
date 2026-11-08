use std::collections::HashSet;

use kiroshi_core::library::contract::{LibraryPresenceAt, LibraryWriter, LibraryWriterKind};
use rune::TextEdit;

use kiroshi_rune_kit::surfaces::s14_library::{BLOCK_GAP, LibraryBlockType, inline_field};

use super::blocks::{
	self, Block, Format, continued_line, fresh_id, inline_markdown, is_editable, line_count,
	markdown_of, rewritten, texts_of, with_line_after, without_line,
};
use super::session::Session;
use super::worker::Target;

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

pub struct Document {
	pub target: Target,
	pub format: Format,
	pub title: TextEdit,
	pub phase: Phase,
	pub blocks: Vec<Block>,
	pub fields: Vec<Field>,
	pub writers: Vec<LibraryWriter>,
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

fn field_edit(kind: LibraryBlockType, text: &str) -> TextEdit {
	match kind {
		LibraryBlockType::Code => TextEdit::new(text),
		_ => inline_field(text),
	}
}

fn field_text(kind: LibraryBlockType, edit: &TextEdit) -> String {
	match kind {
		LibraryBlockType::Code => edit.text.clone(),
		_ => inline_markdown(edit),
	}
}

fn empty_paragraph(taken: &HashSet<String>, gap: String) -> Block {
	Block { id: fresh_id(taken), source: String::new(), marker: String::new(), gap }
}

impl Document {
	pub fn new(target: Target) -> Document {
		let title = TextEdit::new(title_of(&target.name));
		Document {
			format: Format::of(&target.name),
			target,
			title,
			phase: Phase::Opening,
			blocks: Vec::new(),
			fields: Vec::new(),
			writers: Vec::new(),
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
		self.project();
		caught_up
	}

	pub fn heard_update(&mut self, update: String) -> Result<(), String> {
		let Some(session) = self.session_mut() else {
			self.heard_early.push(update);
			return Ok(());
		};
		session.received(&update)?;
		self.project();
		Ok(())
	}

	pub fn markdown(&self) -> String {
		markdown_of(&self.blocks, self.format)
	}

	fn project(&mut self) {
		let Some(markdown) = self.session().map(Session::markdown) else { return };
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
			if !is_editable(kind) {
				continue;
			}
			for (row, text) in texts_of(&block.source).iter().enumerate() {
				let kept = held.iter().position(|field| {
					field.block == block.id && field.row == row && field.built_from == block.source
				});
				let edit = match kept {
					Some(at) => held.swap_remove(at).edit,
					None => field_edit(kind, text),
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

	fn block_at(&self, block: &str) -> Option<usize> {
		self.blocks.iter().position(|held| held.id == block)
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

	fn saved(&mut self) -> Option<String> {
		let markdown = self.markdown();
		self.session_mut()?.edited(&markdown)
	}

	pub fn typed(&mut self, block: &str, row: usize) -> Option<String> {
		let at = self.block_at(block)?;
		let kind = self.blocks[at].kind();
		let text = field_text(kind, self.field(block, row)?);
		let source = rewritten(&self.blocks[at].source, row, &text);
		self.blocks[at].source.clone_from(&source);
		for field in self.fields.iter_mut().filter(|field| field.block == block) {
			field.built_from.clone_from(&source);
		}
		self.saved()
	}

	pub fn entered(&mut self, block: &str, row: usize) -> Option<String> {
		let at = self.block_at(block)?;
		let source = self.blocks[at].source.clone();
		if let Some(line) = continued_line(&source, row) {
			self.blocks[at].source = with_line_after(&source, row, &line);
			self.rebuild_fields();
			self.focus(block, row + 1);
			return self.saved();
		}
		let taken: HashSet<String> = self.blocks.iter().map(|held| held.id.clone()).collect();
		let gap = std::mem::replace(&mut self.blocks[at].gap, BLOCK_GAP.to_owned());
		let added = empty_paragraph(&taken, gap);
		let id = added.id.clone();
		self.blocks.insert(at + 1, added);
		self.rebuild_fields();
		self.focus(&id, 0);
		self.saved()
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
			return self.saved();
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
		self.saved()
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

	pub fn writers_heard(&mut self, writers: Vec<LibraryWriter>) {
		self.writers =
			writers.into_iter().filter(|writer| writer.kind != LibraryWriterKind::Person).collect();
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

	pub fn block_of_writer(&self, writer: &LibraryWriter) -> Option<&str> {
		let LibraryPresenceAt::Text { anchor } = &writer.at else { return None };
		let offset = self.session()?.offset_of(anchor)?;
		let mut start = 0;
		for block in &self.blocks {
			start += block.source.len() + block.marker.len() + block.gap.len();
			if offset <= start {
				return Some(block.id.as_str());
			}
		}
		self.blocks.last().map(|block| block.id.as_str())
	}
}
