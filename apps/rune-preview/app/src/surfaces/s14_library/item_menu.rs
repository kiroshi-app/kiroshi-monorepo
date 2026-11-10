use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind};

use kiroshi_rune_kit::strings::common;
use kiroshi_rune_kit::surfaces::s14_library::{ImageMenu, ItemAction, MORE_KEY};
use rune::PointerPress;

use super::imports;
use super::worker::{Call, Target};
use super::{State, failure_text, said};
use crate::host::HostError;

const BAR_ACTIONS: [ItemAction; 4] =
	[ItemAction::OpenInNewTab, ItemAction::Rename, ItemAction::ShowInFolder, ItemAction::Delete];

const LIGHTBOX_ACTIONS: [ItemAction; 3] =
	[ItemAction::OpenInNewTab, ItemAction::ShowInFolder, ItemAction::Delete];

const PICTURE_ACTIONS: [ItemAction; 5] = [
	ItemAction::OpenInNewTab,
	ItemAction::Copy,
	ItemAction::Download,
	ItemAction::ShowInFolder,
	ItemAction::Delete,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuSurface {
	Tile,
	Bar,
	Lightbox,
	Picture,
}

#[derive(Clone, Debug, PartialEq)]
pub enum MenuPlace {
	Under(String),
	At(PointerPress),
}

#[derive(Clone, Debug, PartialEq)]
pub struct ItemMenu {
	pub name: String,
	pub place: MenuPlace,
	pub surface: MenuSurface,
}

fn tile_actions(kind: LibraryItemKind) -> Vec<ItemAction> {
	ItemAction::ALL
		.into_iter()
		.filter(|action| *action != ItemAction::Rename || kind == LibraryItemKind::Document)
		.collect()
}

impl State {
	pub(super) fn open_menu(&mut self, name: String, place: MenuPlace, surface: MenuSurface) {
		if self.listed(&name).is_none() {
			return;
		}
		self.menu = Some(ItemMenu { name, place, surface });
	}

	pub(super) fn open_bar_menu(&mut self, name: Option<String>, surface: MenuSurface) {
		let Some(name) = name else { return };
		self.open_menu(name, MenuPlace::Under(MORE_KEY.to_owned()), surface);
	}

	pub fn menu_actions(&self) -> Vec<ItemAction> {
		let Some(menu) = self.menu.as_ref() else { return Vec::new() };
		match menu.surface {
			MenuSurface::Tile => {
				self.listed(&menu.name).map_or_else(Vec::new, |item| tile_actions(item.kind))
			}
			MenuSurface::Bar => BAR_ACTIONS.to_vec(),
			MenuSurface::Lightbox => LIGHTBOX_ACTIONS.to_vec(),
			MenuSurface::Picture => PICTURE_ACTIONS.to_vec(),
		}
	}

	pub fn menu_image(&self) -> Option<ImageMenu> {
		let menu = self.menu.as_ref()?;
		(menu.surface == MenuSurface::Picture).then_some(ImageMenu { is_saving: false })
	}

	pub fn choose_in_menu(&mut self, action: ItemAction) {
		let Some(menu) = self.menu.take() else { return };
		self.act(&menu.name, action);
	}

	pub fn close_menu(&mut self) {
		self.menu = None;
	}

	pub(super) fn reveal(&mut self, name: &str) {
		let Some(target) = self.target_of(name) else { return };
		self.queue(Call::Reveal(target));
		self.flush();
	}

	pub(super) fn save_to_library(&mut self, name: &str) {
		let Some(target) = self.target_of(name) else { return };
		self.queue(Call::SaveToLibrary(target));
		self.flush();
	}

	pub(super) fn saved_to_library(
		&mut self,
		target: &Target,
		item: Result<LibraryItem, HostError>,
	) {
		if let Err(failure) = item {
			let refused = imports::refusals_of(std::slice::from_ref(&target.name), Err(failure));
			self.raise_refused_imports(&refused);
		}
		if self.space_id.as_deref() == Some(target.space_id.as_str()) {
			self.list();
		}
	}

	pub(super) fn revealed(&mut self, outcome: Result<(), HostError>) {
		if let Err(failure) = outcome {
			self.raise(said(common::library::failure::REVEAL), failure_text(&failure));
		}
	}
}
