use std::time::Duration;

use kiroshi_core::library::contract::LibraryItem;
use rune::Tx;
use rune::{FileDialogOptions, FileDialogResult};

use kiroshi_rune_kit::strings::common;

use super::rich::GalleryAdd;
use super::worker::{Call, Due, Target};
use super::{State, failure_text, said};
use crate::app::App;
use crate::host::HostError;
use crate::surfaces::s15_boards;

const COPIED_FOR: Duration = Duration::from_secs(2);

const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

const DOCUMENT_EXTENSIONS: [&str; 3] = ["md", "markdown", "txt"];

#[derive(Debug, PartialEq)]
pub enum Effect {
	PickFile,
	PickGalleryImage(GalleryAdd),
}

fn picker_options() -> FileDialogOptions {
	let title = said(common::library::bring_in::TITLE);
	FileDialogOptions { title, ..FileDialogOptions::default() }
		.filter(said(common::library::filters::IMAGES), &IMAGE_EXTENSIONS)
		.filter(said(common::library::filters::DOCUMENTS), &DOCUMENT_EXTENSIONS)
}

fn gallery_picker_options() -> FileDialogOptions {
	let title = said(common::library::bring_in::TITLE);
	FileDialogOptions { title, ..FileDialogOptions::default() }
		.filter(said(common::library::filters::IMAGES), &IMAGE_EXTENSIONS)
}

fn gallery_picked(app: &mut App, add: GalleryAdd, result: FileDialogResult) {
	let library = &mut app.surfaces.s14_library;
	match result {
		Ok(Some(path)) => library.import_into_gallery(add, path),
		Ok(None) => {}
		Err(failure) => {
			library.raise(said(common::library::failure::import::GENERIC), failure.to_string())
		}
	}
}

fn picked(app: &mut App, result: FileDialogResult) {
	let library = &mut app.surfaces.s14_library;
	match result {
		Ok(Some(path)) => library.dropped(&[path]),
		Ok(None) => {}
		Err(failure) => {
			library.raise(said(common::library::failure::import::GENERIC), failure.to_string())
		}
	}
}

pub fn perform(app: &mut App, tx: &mut Tx) -> bool {
	let effects = std::mem::take(&mut app.surfaces.s14_library.effects);
	let board = app.surfaces.s14_library.board_to_open.take();
	let has_effects = !effects.is_empty() || board.is_some();
	for effect in effects {
		match effect {
			Effect::PickFile => {
				tx.open_file(picker_options(), |app: &mut App, result, _| picked(app, result))
			}
			Effect::PickGalleryImage(add) => tx
				.open_file(gallery_picker_options(), move |app: &mut App, result, _| {
					gallery_picked(app, add, result)
				}),
		}
	}
	if let Some(name) = board {
		s15_boards::open_board(app, &name);
	}
	has_effects
}

impl State {
	pub(super) fn download(&mut self, name: &str) {
		let Some(target) = self.target_of(name) else { return };
		self.queue(Call::Download(target));
		self.flush();
	}

	pub(super) fn copy(&mut self, name: &str) {
		let Some(target) = self.target_of(name) else { return };
		self.queue(Call::Copy(target));
		self.flush();
	}

	pub(super) fn create_board(&mut self) {
		let Some(space_id) = self.space_id.clone() else { return };
		let untitled = said(common::library::editor::UNTITLED);
		self.queue(Call::CreateBoard { space_id, untitled });
		self.flush();
	}

	pub(super) fn downloaded(&mut self, outcome: Result<Option<String>, HostError>) {
		if let Err(failure) = outcome {
			self.raise(said(common::library::failure::SAVE), failure_text(&failure));
		}
	}

	pub(super) fn copied_answer(&mut self, target: &Target, outcome: Result<(), HostError>) {
		match outcome {
			Ok(()) => {
				self.copied = Some(target.name.clone());
				self.queue(Call::Wake(COPIED_FOR, Due::Copied));
			}
			Err(failure) => {
				self.raise(said(common::library::failure::COPY), failure_text(&failure))
			}
		}
	}

	pub(super) fn board_created(&mut self, space_id: &str, item: Result<LibraryItem, HostError>) {
		match item {
			Ok(item) if self.space_id.as_deref() == Some(space_id) => {
				self.board_to_open = Some(item.name);
				self.list();
			}
			Ok(_) => {}
			Err(failure) => {
				self.raise(said(common::library::failure::SAVE), failure_text(&failure))
			}
		}
	}

	pub fn is_copied(&self, name: &str) -> bool {
		self.copied.as_deref() == Some(name)
	}
}
