use std::path::PathBuf;

use kiroshi_core::library::contract::{LibraryImport, LibraryItem};
use kiroshi_rune_kit::strings::common;
use kiroshi_rune_kit::surfaces::s14_library::{GalleryEvent, TableEvent, cell_field};

use super::actions::Effect;
use super::blocks::{gallery_records, table_columns};
use super::document::title_of;
use super::imports;
use super::worker::{Call, Target};
use super::{State, said};
use crate::host::HostError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GalleryAdd {
	pub is_beside: bool,
	pub block: String,
}

fn image_record(item: LibraryItem, picked: &str) -> Vec<(String, String)> {
	vec![("image".to_owned(), item.name), ("alt".to_owned(), title_of(picked).to_owned())]
}

impl State {
	pub fn handle_table(&mut self, is_beside: bool, block: &str, event: TableEvent) {
		let Some(document) = self.document_mut(is_beside) else { return };
		let Some(at) = document.block_at(block) else { return };
		let columns = table_columns(&document.blocks[at].source);
		match event {
			TableEvent::Edited { row, column } => {
				document.typed(block, cell_field(columns, (row, column)));
				self.arm_flush();
			}
			TableEvent::Focus { row, column } => {
				document.focus_cell(block, cell_field(columns, (row, column)))
			}
		}
	}

	pub fn handle_gallery(&mut self, is_beside: bool, block: &str, event: GalleryEvent) {
		if event == GalleryEvent::Add {
			self.gallery_add_failed = None;
			let add = GalleryAdd { is_beside, block: block.to_owned() };
			self.effects.push(Effect::PickGalleryImage(add));
			return;
		}
		let Some(document) = self.document_mut(is_beside) else { return };
		let Some(at) = document.block_at(block) else { return };
		let count = gallery_records(&document.blocks[at].source).len();
		let update = match event {
			GalleryEvent::Caption(index) => {
				document.typed(block, index);
				return self.arm_flush();
			}
			GalleryEvent::Remove(_) if count == 1 => document.remove_block(block),
			GalleryEvent::Remove(index) if index < count => {
				document.edit_gallery(block, |records| {
					records.remove(index);
				})
			}
			GalleryEvent::Move { from, to } if from != to && from < count && to < count => document
				.edit_gallery(block, |records| {
					let moved = records.remove(from);
					records.insert(to, moved);
				}),
			GalleryEvent::Add | GalleryEvent::Remove(_) | GalleryEvent::Move { .. } => None,
		};
		self.send(is_beside, update);
	}

	pub fn has_gallery_add_failed(&self, is_beside: bool, block: &str) -> bool {
		self.gallery_add_failed.as_ref() == Some(&GalleryAdd { is_beside, block: block.to_owned() })
	}

	pub(super) fn import_into_gallery(&mut self, add: GalleryAdd, path: PathBuf) {
		let Some(document) = self.document(add.is_beside) else { return };
		let target = document.target.clone();
		self.queue(Call::GalleryImport { target, add, path });
		self.flush();
	}

	pub(super) fn gallery_imported(
		&mut self,
		target: &Target,
		add: GalleryAdd,
		path: &std::path::Path,
		imports: Result<Vec<LibraryImport>, HostError>,
	) {
		let picked = imports::file_name_of(path);
		if self.space_id.as_deref() == Some(target.space_id.as_str()) {
			self.list();
		}
		let names = std::slice::from_ref(&picked);
		let refused = match imports.map(|imported| imported.into_iter().next()) {
			Ok(Some(LibraryImport::Imported { item })) => {
				return self.added_to_gallery(target, add, item, &picked);
			}
			Ok(refusal) => imports::refusals_of(names, Ok(refusal.into_iter().collect())),
			Err(failure) => imports::refusals_of(names, Err(failure)),
		};
		self.gallery_add_failed = Some(add);
		match refused.is_empty() {
			true => self.raise(said(common::library::failure::import::GENERIC), String::new()),
			false => self.raise_refused_imports(&refused),
		}
	}

	fn added_to_gallery(
		&mut self,
		target: &Target,
		add: GalleryAdd,
		item: LibraryItem,
		picked: &str,
	) {
		let Some(document) =
			self.document_mut(add.is_beside).filter(|document| document.target == *target)
		else {
			return;
		};
		let record = image_record(item, picked);
		let update = document.edit_gallery(&add.block, |records| records.push(record));
		self.send(add.is_beside, update);
	}
}
