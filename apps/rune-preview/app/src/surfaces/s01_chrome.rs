use kiroshi_core::core_context::RenderWindow;
use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::strings::common::title_bar::{move_tab_failed, reopen_window_failed};
use kiroshi_rune_kit::strings::common::window_controls::failure as window_failure;
use kiroshi_rune_kit::surfaces::s01_chrome::{ChromeEvent, Lift};
use serde::{Deserialize, Serialize};

use crate::navigation::{MAIN_WINDOW, Navigation, Route, WindowId};

pub mod connection;
mod desk;
mod tabs;
#[cfg(test)]
mod tests;
mod view;

pub use desk::{
	close_tab, new_tab, new_window, on_chrome, reopen_closed_tab, reopen_kept_windows, restore,
};
pub use tabs::{KeptTabs, Tab, Tabs};
pub use view::{Measured, view};

pub const LANGUAGE: Language = Language::En;

const MAIN_LABEL: &str = "main";

const TAB_PAGE: &str = "/";

pub const WINDOW_SIZE: (f32, f32) = (1180.0, 780.0);

const UNRESTORED: &str = "Couldn't restore your tabs.";

const UNSAVED: &str = "Couldn't save your tabs.";

const UNREADABLE: &str = "its kept tabs were unreadable";

pub trait Windows {
	fn open(&self, window: &RenderWindow) -> Result<(), String>;
	fn close(&self, label: &str) -> Result<(), String>;
}

pub trait Shelf {
	fn read(&self) -> Result<Option<String>, String>;
	fn write(&self, kept: &str) -> Result<(), String>;
}

pub struct Desk<'a> {
	pub navigation: &'a mut Navigation,
	pub windows: &'a dyn Windows,
	pub shelf: &'a dyn Shelf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Failure {
	pub title: String,
	pub description: Option<String>,
}

impl Failure {
	fn titled(title: &str, description: Option<String>) -> Failure {
		Failure { title: title.to_owned(), description }
	}

	fn with_reason(title: &str, described: &str, reason: &str) -> Failure {
		Failure::titled(title, Some(described.replace("{{reason}}", reason)))
	}

	fn moved(reason: &str) -> Failure {
		Failure::with_reason(
			move_tab_failed::TITLE.text(LANGUAGE),
			move_tab_failed::DESCRIPTION_WITH_REASON.text(LANGUAGE),
			reason,
		)
	}

	fn new_window(reason: &str) -> Failure {
		Failure::titled(move_tab_failed::TITLE.text(LANGUAGE), Some(reason.to_owned()))
	}

	fn reopened(reason: &str) -> Failure {
		Failure::with_reason(
			reopen_window_failed::TITLE.text(LANGUAGE),
			reopen_window_failed::DESCRIPTION_WITH_REASON.text(LANGUAGE),
			reason,
		)
	}

	fn closed(reason: &str) -> Failure {
		Failure::titled(window_failure::CLOSE.text(LANGUAGE), Some(reason.to_owned()))
	}
}

#[derive(Clone, Debug, PartialEq)]
pub enum Menu {
	Tab { id: String, at: (f32, f32) },
	Overflow,
}

#[derive(Serialize, Deserialize)]
struct Kept {
	main: KeptTabs,
	others: Vec<KeptTabs>,
}

struct Window {
	id: WindowId,
	label: String,
	tabs: Tabs,
}

pub struct State {
	windows: Vec<Window>,
	waiting: Vec<KeptTabs>,
	pub lift: Option<Lift>,
	pub menu: Option<Menu>,
	pub revealed_close: Option<String>,
	pub failure: Option<Failure>,
}

impl Default for State {
	fn default() -> State {
		State {
			windows: vec![Window {
				id: MAIN_WINDOW,
				label: MAIN_LABEL.to_owned(),
				tabs: Tabs::default(),
			}],
			waiting: Vec::new(),
			lift: None,
			menu: None,
			revealed_close: None,
			failure: None,
		}
	}
}

impl State {
	pub fn tabs_of(&self, window: WindowId) -> Option<&Tabs> {
		self.window(window).map(|held| &held.tabs)
	}

	fn window(&self, window: WindowId) -> Option<&Window> {
		self.windows.iter().find(|held| held.id == window)
	}

	fn tabs_mut(&mut self, window: WindowId) -> Option<&mut Tabs> {
		self.windows.iter_mut().find(|held| held.id == window).map(|held| &mut held.tabs)
	}

	pub fn restore(&mut self, shelf: &dyn Shelf) {
		let kept = shelf.read().and_then(|read| match read {
			Some(json) => {
				serde_json::from_str::<Kept>(&json).map(Some).map_err(|failure| failure.to_string())
			}
			None => Ok(None),
		});
		match kept {
			Ok(Some(kept)) => self.restore_kept(kept),
			Ok(None) => {}
			Err(reason) => self.failure = Some(Failure::titled(UNRESTORED, Some(reason))),
		}
	}

	fn restore_kept(&mut self, kept: Kept) {
		match (Tabs::restored(kept.main), self.tabs_mut(MAIN_WINDOW)) {
			(Some(restored), Some(main)) => *main = restored,
			_ => self.failure = Some(Failure::titled(UNRESTORED, Some(UNREADABLE.to_owned()))),
		}
		self.waiting = kept.others;
	}

	pub fn reopen_kept_windows(&mut self, desk: &mut Desk) {
		for kept in std::mem::take(&mut self.waiting) {
			let Some(tabs) = Tabs::restored(kept) else {
				self.failure = Some(Failure::reopened(UNREADABLE));
				continue;
			};
			if let Err(reason) = self.open_window(desk, tabs) {
				self.failure = Some(Failure::reopened(&reason));
			}
		}
		self.save(desk.shelf);
	}

	pub fn heard(&mut self, window: WindowId, event: ChromeEvent, desk: &mut Desk) {
		let keeps_menu = matches!(
			event,
			ChromeEvent::OpenTabMenu { .. }
				| ChromeEvent::OpenOverflow
				| ChromeEvent::RevealClose(_)
				| ChromeEvent::LiftMoved(_)
		);
		if !keeps_menu {
			self.menu = None;
		}
		self.failure = None;
		match event {
			ChromeEvent::SelectTab(id) => self.change(window, desk, |tabs| tabs.select(&id)),
			ChromeEvent::CloseTab(id) => self.close_tab(window, &id, desk),
			ChromeEvent::RevealClose(id) => self.revealed_close = id,
			ChromeEvent::OpenTabMenu { id, at } => self.menu = Some(Menu::Tab { id, at }),
			ChromeEvent::OpenOverflow => self.toggle_overflow(),
			ChromeEvent::NewTab => self.new_tab(window, desk),
			ChromeEvent::PinTab(id) => self.change(window, desk, |tabs| tabs.pin(&id)),
			ChromeEvent::UnpinTab(id) => self.change(window, desk, |tabs| tabs.unpin(&id)),
			ChromeEvent::DuplicateTab(id) => self.change(window, desk, |tabs| tabs.duplicate(&id)),
			ChromeEvent::ReopenClosedTab => self.reopen_closed_tab(window, desk),
			ChromeEvent::CloseOtherTabs(id) => {
				self.change(window, desk, |tabs| tabs.close_others(&id))
			}
			ChromeEvent::MoveTabToNewWindow(id) => {
				self.move_to_new_window(window, &id, desk, false)
			}
			ChromeEvent::LiftMoved(lift) => self.lift = Some(lift),
			ChromeEvent::LiftEnded(_) => self.lift = None,
			ChromeEvent::ReorderTabs(ids) => self.change(window, desk, |tabs| tabs.reorder(&ids)),
			ChromeEvent::TearOffTab { id, .. } => self.tear_off(window, &id, desk),
			ChromeEvent::GoBack
			| ChromeEvent::GoForward
			| ChromeEvent::AnnounceMove { .. }
			| ChromeEvent::Minimize
			| ChromeEvent::ToggleMaximize
			| ChromeEvent::CloseWindow => {}
		}
	}

	fn toggle_overflow(&mut self) {
		self.menu = match self.menu {
			Some(Menu::Overflow) => None,
			_ => Some(Menu::Overflow),
		};
	}

	fn change(&mut self, window: WindowId, desk: &mut Desk, update: impl FnOnce(&mut Tabs)) {
		let Some(tabs) = self.tabs_mut(window) else { return };
		update(tabs);
		self.save(desk.shelf);
	}

	pub fn new_tab(&mut self, window: WindowId, desk: &mut Desk) {
		self.change(window, desk, |tabs| {
			tabs.open_empty();
		});
	}

	pub fn reopen_closed_tab(&mut self, window: WindowId, desk: &mut Desk) {
		self.change(window, desk, Tabs::reopen);
	}

	pub fn close_active_tab(&mut self, window: WindowId, desk: &mut Desk) {
		let Some(active) = self.tabs_of(window).map(|tabs| tabs.active().to_owned()) else {
			return;
		};
		self.close_tab(window, &active, desk);
	}

	pub fn close_tab(&mut self, window: WindowId, id: &str, desk: &mut Desk) {
		let Some(tabs) = self.tabs_of(window) else { return };
		if window != MAIN_WINDOW && tabs.closes_every_tab(id) {
			self.close_window(window, desk);
			return;
		}
		self.change(window, desk, |tabs| tabs.close(id));
	}

	pub fn new_window(&mut self, desk: &mut Desk) {
		match self.open_window(desk, Tabs::default()) {
			Ok(_) => self.save(desk.shelf),
			Err(reason) => self.failure = Some(Failure::new_window(&reason)),
		}
	}

	fn tear_off(&mut self, window: WindowId, id: &str, desk: &mut Desk) {
		if self.tabs_of(window).is_some_and(|tabs| !tabs.is_only_tab(id)) {
			self.move_to_new_window(window, id, desk, true);
		}
	}

	fn move_to_new_window(&mut self, window: WindowId, id: &str, desk: &mut Desk, carries: bool) {
		let Some(tabs) = self.tabs_of(window) else { return };
		let Some(tab) = tabs.tab(id) else { return };
		let moved = if carries { tab.clone() } else { Tab::fresh() };
		let empties_source = window != MAIN_WINDOW && tabs.is_only_tab(id);
		let opened = match self.open_window(desk, Tabs::holding(moved)) {
			Ok(opened) => opened,
			Err(reason) => {
				self.failure = Some(Failure::moved(&reason));
				return;
			}
		};
		if !empties_source {
			self.change(window, desk, |tabs| tabs.remove_moved(id));
			return;
		}
		if !self.close_window(window, desk) {
			self.close_window(opened, desk);
		}
	}

	pub fn dock(
		&mut self,
		from: WindowId,
		id: &str,
		to: WindowId,
		position: usize,
		desk: &mut Desk,
	) {
		if from == to || self.tabs_of(to).is_none() {
			return;
		}
		let Some(source) = self.tabs_of(from) else { return };
		let Some(tab) = source.tab(id).cloned() else { return };
		if from != MAIN_WINDOW && source.is_only_tab(id) {
			if !self.close_window(from, desk) {
				return;
			}
		} else if let Some(source) = self.tabs_mut(from) {
			source.remove_moved(id);
		}
		self.change(to, desk, |target| target.receive(tab, position));
	}

	fn open_window(&mut self, desk: &mut Desk, tabs: Tabs) -> Result<WindowId, String> {
		let label = format!("tabs-{}", uuid::Uuid::new_v4());
		let opening = RenderWindow {
			label: label.clone(),
			route: TAB_PAGE.to_owned(),
			width: f64::from(WINDOW_SIZE.0),
			height: f64::from(WINDOW_SIZE.1),
		};
		desk.windows.open(&opening)?;
		let id = desk.navigation.open(Route::Conversations);
		self.windows.push(Window { id, label, tabs });
		Ok(id)
	}

	fn close_window(&mut self, window: WindowId, desk: &mut Desk) -> bool {
		let Some(label) = self.window(window).map(|held| held.label.clone()) else {
			return false;
		};
		let closed = desk
			.windows
			.close(&label)
			.and_then(|()| desk.navigation.close(window).map_err(|failure| format!("{failure:?}")));
		if let Err(reason) = closed {
			self.failure = Some(Failure::closed(&reason));
			return false;
		}
		self.windows.retain(|held| held.id != window);
		self.save(desk.shelf);
		true
	}

	fn save(&mut self, shelf: &dyn Shelf) {
		let Some(main) = self.tabs_of(MAIN_WINDOW).map(Tabs::kept) else { return };
		let others = self
			.windows
			.iter()
			.filter(|held| held.id != MAIN_WINDOW)
			.map(|held| held.tabs.kept())
			.chain(self.waiting.iter().cloned())
			.collect();
		let written = serde_json::to_string(&Kept { main, others })
			.map_err(|failure| failure.to_string())
			.and_then(|json| shelf.write(&json));
		if let Err(reason) = written {
			self.failure = Some(Failure::titled(UNSAVED, Some(reason)));
		}
	}
}
