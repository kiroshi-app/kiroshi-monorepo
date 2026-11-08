use std::time::Duration;

use kiroshi_core::library::contract::LibraryPresenceAt;
use rune::Mark;

use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s14_library::{BlockEvent, Format, LibraryBlockType, Slash};

use super::State;
use super::document::Cut;
use super::worker::{Call, Due};

pub const SEND_INTERVAL: Duration = Duration::from_millis(250);

pub struct SlashState {
	pub is_beside: bool,
	pub block: String,
	pub field: usize,
	pub at: usize,
	pub active: usize,
}

fn mark_of(format: Format) -> Option<Mark> {
	match format {
		Format::Bold => Some(Mark::Bold),
		Format::Italic => Some(Mark::Italic),
		Format::Code => Some(Mark::Code),
		Format::Strikethrough | Format::Link | Format::Heading | Format::List => None,
	}
}

pub fn pressed_of(marks: &[Mark]) -> Vec<Format> {
	[Format::Bold, Format::Italic, Format::Code]
		.into_iter()
		.filter(|format| mark_of(*format).is_some_and(|mark| marks.contains(&mark)))
		.collect()
}

impl State {
	pub fn handle_block(&mut self, is_beside: bool, event: BlockEvent) -> bool {
		match event {
			BlockEvent::Typed { block, field } => {
				let Some(document) = self.document_mut(is_beside) else { return false };
				document.typed(&block, field);
				self.keep_slash_open();
				self.arm_flush();
				true
			}
			BlockEvent::Enter { block, field } => {
				let update = self
					.document_mut(is_beside)
					.and_then(|document| document.entered(&block, field));
				self.send(is_beside, update);
				true
			}
			BlockEvent::Backspace { block, field } => {
				let update = self
					.document_mut(is_beside)
					.and_then(|document| document.backspaced(&block, field));
				let is_handled = update.is_some();
				self.send(is_beside, update);
				is_handled
			}
			BlockEvent::SlashOpened { block, field } => {
				self.open_slash(is_beside, block, field);
				false
			}
			BlockEvent::SlashMoved(step) => {
				let count = self.slash_choices().len().max(1);
				if let Some(slash) = self.slash.as_mut() {
					let moved = slash.active as i64 + i64::from(step);
					slash.active = moved.rem_euclid(count as i64) as usize;
				}
				true
			}
			BlockEvent::SlashConfirmed => {
				let active = self.slash.as_ref().map_or(0, |slash| slash.active);
				if let Some(kind) = self.slash_choices().get(active).copied() {
					self.choose(kind);
				}
				true
			}
			BlockEvent::SlashChosen(kind) => {
				self.choose(kind);
				true
			}
			BlockEvent::SlashClosed => {
				self.slash = None;
				true
			}
		}
	}

	fn open_slash(&mut self, is_beside: bool, block: String, field: usize) {
		let Some(document) = self.document(is_beside) else { return };
		let Some(edit) = document.field(&block, field) else { return };
		let at = edit.focus.min(edit.text.len());
		self.slash = Some(SlashState { is_beside, block, field, at, active: 0 });
	}

	pub fn slash_query(&self) -> Option<String> {
		let slash = self.slash.as_ref()?;
		let edit = self.document(slash.is_beside)?.field(&slash.block, slash.field)?;
		let caret = edit.focus.min(edit.text.len());
		let typed = edit.text.get(slash.at..caret)?;
		typed.strip_prefix('/').map(str::to_owned)
	}

	pub fn slash_view<'a>(&'a self, query: &'a str) -> Option<Slash<'a>> {
		let slash = self.slash.as_ref()?;
		Some(Slash {
			block: &slash.block,
			field: slash.field,
			query,
			active: slash.active,
			is_above: false,
		})
	}

	fn slash_choices(&self) -> Vec<LibraryBlockType> {
		let query = self.slash_query().unwrap_or_default();
		self.slash_view(&query).map(|slash| slash.shown(Language::En)).unwrap_or_default()
	}

	fn keep_slash_open(&mut self) {
		if self.slash_query().is_none() {
			self.slash = None;
		}
	}

	fn choose(&mut self, kind: LibraryBlockType) {
		let Some(slash) = self.slash.take() else { return };
		let Some(document) = self.document_mut(slash.is_beside) else { return };
		let caret = document
			.field(&slash.block, slash.field)
			.map_or(slash.at, |edit| edit.focus.min(edit.text.len()));
		let cut = Cut { row: slash.field, from: slash.at, to: caret };
		document.convert(&slash.block, kind, Some(cut));
		let update = document.flushed();
		self.send(slash.is_beside, update);
	}

	pub fn handle_format(&mut self, is_beside: bool, format: Format) {
		let Some(document) = self.document_mut(is_beside) else { return };
		let Some((block, row)) = document.focused().map(|field| (field.block.clone(), field.row))
		else {
			return;
		};
		match (format, mark_of(format)) {
			(_, Some(mark)) => {
				if let Some(edit) = document.field_mut(&block, row) {
					edit.toggle_mark(mark);
				}
				document.typed(&block, row);
				self.arm_flush();
			}
			(Format::Heading | Format::List, None) => {
				let kind = if format == Format::Heading {
					LibraryBlockType::Heading
				} else {
					LibraryBlockType::List
				};
				document.convert(&block, kind, None);
				let update = document.flushed();
				self.send(is_beside, update);
			}
			_ => {
				eprintln!("the format toolbar forwards {format:?}, which this surface doesn't wire")
			}
		}
	}

	fn arm_flush(&mut self) {
		if self.is_flush_armed {
			return;
		}
		self.is_flush_armed = true;
		self.queue(Call::Wake(SEND_INTERVAL, Due::Flush));
		self.flush();
	}

	pub(super) fn flush_due(&mut self) {
		self.is_flush_armed = false;
		for is_beside in [false, true] {
			let update = self.document_mut(is_beside).and_then(|document| document.flushed());
			self.send(is_beside, update);
		}
	}

	fn send(&mut self, is_beside: bool, update: Option<String>) {
		let Some(update) = update else { return };
		let Some(document) = self.document(is_beside) else { return };
		let target = document.target.clone();
		let anchor =
			document.caret_offset().and_then(|offset| document.session()?.anchor_at(offset));
		self.queue(Call::Apply { target: target.clone(), update });
		if let Some(anchor) = anchor {
			self.queue(Call::Share { target, at: Some(LibraryPresenceAt::Text { anchor }) });
		}
		self.flush();
	}
}
