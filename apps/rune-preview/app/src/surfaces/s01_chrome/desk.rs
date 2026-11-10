use std::io::ErrorKind;
use std::path::PathBuf;

use kiroshi_core::core_context::{RenderWindow, RenderWindowError};
use kiroshi_rune_kit::surfaces::s01_chrome::ChromeEvent;

use super::{Desk, Shelf, State, Windows};
use crate::app::App;
use crate::local;
use crate::navigation::MAIN_WINDOW;
use crate::source::Source;

const KEPT_TABS_FILE: &str = "rune-tabs.json";

const NOT_CONNECTED: &str = "Kiroshi isn't connected yet";

const HOST_API_OPENS_NO_WINDOW: &str = "the host API opens no window";

const NO_DESKTOP: &str = "no desktop is installed in the core";

struct CoreWindows(Option<Source>);

impl Windows for CoreWindows {
	fn open(&self, window: &RenderWindow) -> Result<(), String> {
		match &self.0 {
			Some(Source::InProcess(core)) => {
				core.open_render_window(window).map_err(|failure| match failure {
					RenderWindowError::NoDesktop => NO_DESKTOP.to_owned(),
					RenderWindowError::Refused(reason) => reason,
				})
			}
			Some(Source::Running(_)) => Err(HOST_API_OPENS_NO_WINDOW.to_owned()),
			None => Err(NOT_CONNECTED.to_owned()),
		}
	}

	fn close(&self, label: &str) -> Result<(), String> {
		match &self.0 {
			Some(Source::InProcess(core)) => core.close_window(label),
			Some(Source::Running(_)) => Err(HOST_API_OPENS_NO_WINDOW.to_owned()),
			None => Err(NOT_CONNECTED.to_owned()),
		}
	}
}

struct FileShelf;

impl FileShelf {
	fn path() -> Result<PathBuf, String> {
		local::data_folder()
			.map(|folder| folder.join(KEPT_TABS_FILE))
			.map_err(|failure| failure.to_string())
	}
}

impl Shelf for FileShelf {
	fn read(&self) -> Result<Option<String>, String> {
		match std::fs::read_to_string(FileShelf::path()?) {
			Ok(kept) => Ok(Some(kept)),
			Err(failure) if failure.kind() == ErrorKind::NotFound => Ok(None),
			Err(failure) => Err(failure.to_string()),
		}
	}

	fn write(&self, kept: &str) -> Result<(), String> {
		let path = FileShelf::path()?;
		if let Some(folder) = path.parent() {
			std::fs::create_dir_all(folder).map_err(|failure| failure.to_string())?;
		}
		std::fs::write(path, kept).map_err(|failure| failure.to_string())
	}
}

fn active_tab(app: &App) -> Option<String> {
	app.surfaces.s01_chrome.tabs_of(MAIN_WINDOW).map(|tabs| tabs.active().to_owned())
}

fn with_desk(app: &mut App, act: impl FnOnce(&mut State, &mut Desk)) {
	let windows = CoreWindows(app.ready().map(|ready| ready.source.clone()));
	with_desk_on(app, &windows, &FileShelf, act);
}

pub(super) fn with_desk_on(
	app: &mut App,
	windows: &dyn Windows,
	shelf: &dyn Shelf,
	act: impl FnOnce(&mut State, &mut Desk),
) {
	let leaving = active_tab(app);
	let mut desk = Desk { navigation: &mut app.navigation, windows, shelf };
	act(&mut app.surfaces.s01_chrome, &mut desk);
	if let (Some(leaving), Some(entering)) = (leaving, active_tab(app))
		&& leaving != entering
	{
		app.switch_tab(&leaving, &entering);
	}
	let restorable = restorable_tabs(app);
	app.navigation.keep_pages_of(&restorable);
}

fn restorable_tabs(app: &App) -> Vec<String> {
	let Some(tabs) = app.surfaces.s01_chrome.tabs_of(MAIN_WINDOW) else { return Vec::new() };
	let open = tabs.tabs().iter().map(|tab| tab.id.as_str());
	open.chain(tabs.closed_ids()).map(str::to_owned).collect()
}

pub fn on_chrome(app: &mut App, event: ChromeEvent) {
	with_desk(app, |state, desk| state.heard(MAIN_WINDOW, event, desk));
}

pub fn new_tab(app: &mut App) {
	with_desk(app, |state, desk| state.new_tab(MAIN_WINDOW, desk));
}

pub fn close_tab(app: &mut App) {
	with_desk(app, |state, desk| state.close_active_tab(MAIN_WINDOW, desk));
}

pub fn reopen_closed_tab(app: &mut App) {
	with_desk(app, |state, desk| state.reopen_closed_tab(MAIN_WINDOW, desk));
}

pub fn new_window(app: &mut App) {
	with_desk(app, State::new_window);
}

pub fn restore(app: &mut App) {
	app.surfaces.s01_chrome.restore(&FileShelf);
}

pub fn reopen_kept_windows(app: &mut App) {
	with_desk(app, State::reopen_kept_windows);
}
