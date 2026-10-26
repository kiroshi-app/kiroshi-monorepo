use tauri::{AppHandle, Runtime};

#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
const CLOSE_WINDOW: &str = "close-window";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Entry {
	About,
	Hide,
	HideOthers,
	ShowAll,
	Quit,
	Undo,
	Redo,
	Cut,
	Copy,
	Paste,
	SelectAll,
	Minimize,
	Zoom,
	CloseWindow,
	Separator,
}

const APP_ENTRIES: &[Entry] = &[
	Entry::About,
	Entry::Separator,
	Entry::Hide,
	Entry::HideOthers,
	Entry::ShowAll,
	Entry::Separator,
	Entry::Quit,
];

const EDIT_ENTRIES: &[Entry] = &[
	Entry::Undo,
	Entry::Redo,
	Entry::Separator,
	Entry::Cut,
	Entry::Copy,
	Entry::Paste,
	Entry::SelectAll,
];

const WINDOW_ENTRIES: &[Entry] =
	&[Entry::Minimize, Entry::Zoom, Entry::Separator, Entry::CloseWindow];

impl Entry {
	fn accelerator(self) -> Option<&'static str> {
		match self {
			Entry::Hide => Some("CmdOrCtrl+H"),
			Entry::HideOthers => Some("Alt+CmdOrCtrl+H"),
			Entry::Quit => Some("CmdOrCtrl+Q"),
			Entry::Undo => Some("CmdOrCtrl+Z"),
			Entry::Redo => Some("Shift+CmdOrCtrl+Z"),
			Entry::Cut => Some("CmdOrCtrl+X"),
			Entry::Copy => Some("CmdOrCtrl+C"),
			Entry::Paste => Some("CmdOrCtrl+V"),
			Entry::SelectAll => Some("CmdOrCtrl+A"),
			Entry::Minimize => Some("CmdOrCtrl+M"),
			Entry::About | Entry::ShowAll | Entry::Zoom | Entry::CloseWindow | Entry::Separator => {
				None
			}
		}
	}

	#[cfg(target_os = "macos")]
	fn item<R: Runtime>(self, app: &AppHandle<R>) -> tauri::Result<MenuItemKind<R>> {
		let native = match self {
			Entry::About => PredefinedMenuItem::about(app, None, None),
			Entry::Hide => PredefinedMenuItem::hide(app, None),
			Entry::HideOthers => PredefinedMenuItem::hide_others(app, None),
			Entry::ShowAll => PredefinedMenuItem::show_all(app, None),
			Entry::Quit => PredefinedMenuItem::quit(app, None),
			Entry::Undo => PredefinedMenuItem::undo(app, None),
			Entry::Redo => PredefinedMenuItem::redo(app, None),
			Entry::Cut => PredefinedMenuItem::cut(app, None),
			Entry::Copy => PredefinedMenuItem::copy(app, None),
			Entry::Paste => PredefinedMenuItem::paste(app, None),
			Entry::SelectAll => PredefinedMenuItem::select_all(app, None),
			Entry::Minimize => PredefinedMenuItem::minimize(app, None),
			Entry::Zoom => PredefinedMenuItem::maximize(app, None),
			Entry::Separator => PredefinedMenuItem::separator(app),
			Entry::CloseWindow => {
				return MenuItem::with_id(
					app,
					CLOSE_WINDOW,
					"Close Window",
					true,
					self.accelerator(),
				)
				.map(MenuItemKind::MenuItem);
			}
		};
		native.map(MenuItemKind::Predefined)
	}
}

fn submenus<R: Runtime>(app: &AppHandle<R>) -> [(String, &'static [Entry]); 3] {
	[
		(app.package_info().name.clone(), APP_ENTRIES),
		("Edit".to_owned(), EDIT_ENTRIES),
		("Window".to_owned(), WINDOW_ENTRIES),
	]
}

#[cfg(target_os = "macos")]
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
	app.set_menu(build(app)?)?;
	app.on_menu_event(close_window_when_chosen);
	Ok(())
}

#[cfg(target_os = "macos")]
fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
	let menu = Menu::new(app)?;
	for (title, entries) in submenus(app) {
		let submenu = Submenu::new(app, title, true)?;
		for entry in entries {
			submenu.append(&entry.item(app)?)?;
		}
		menu.append(&submenu)?;
	}
	Ok(menu)
}

#[cfg(target_os = "macos")]
fn close_window_when_chosen<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
	if event.id() != CLOSE_WINDOW {
		return;
	}
	for window in app.webview_windows().into_values() {
		match window.is_focused() {
			Ok(false) => {}
			Ok(true) => {
				if let Err(failure) = window.close() {
					eprintln!("the focused window was not closed from the menu: {failure}");
				}
				return;
			}
			Err(failure) => eprintln!("the focus of a window could not be read: {failure}"),
		}
	}
}

#[cfg(test)]
mod tests {
	use tauri::test::mock_builder;

	use super::{submenus, Entry};
	use crate::test_app::an_app_of_its_own;

	#[test]
	fn the_menu_holds_the_app_edit_and_window_submenus_in_order() {
		let app = an_app_of_its_own("menu", mock_builder());
		let entries_by_title: Vec<(String, Vec<Entry>)> = submenus(app.handle())
			.into_iter()
			.map(|(title, entries)| (title, entries.to_vec()))
			.collect();

		assert_eq!(
			entries_by_title,
			vec![
				(
					app.package_info().name.clone(),
					vec![
						Entry::About,
						Entry::Separator,
						Entry::Hide,
						Entry::HideOthers,
						Entry::ShowAll,
						Entry::Separator,
						Entry::Quit,
					],
				),
				(
					"Edit".to_owned(),
					vec![
						Entry::Undo,
						Entry::Redo,
						Entry::Separator,
						Entry::Cut,
						Entry::Copy,
						Entry::Paste,
						Entry::SelectAll,
					],
				),
				(
					"Window".to_owned(),
					vec![Entry::Minimize, Entry::Zoom, Entry::Separator, Entry::CloseWindow],
				),
			]
		);
	}

	#[test]
	fn no_menu_item_is_bound_to_cmd_w() {
		let app = an_app_of_its_own("menu", mock_builder());
		let bound_to_cmd_w: Vec<Entry> = submenus(app.handle())
			.into_iter()
			.flat_map(|(_, entries)| entries.iter().copied())
			.filter(|entry| entry.accelerator().is_some_and(|keys| keys.ends_with("+W")))
			.collect();

		assert_eq!(bound_to_cmd_w, Vec::new());
		assert_eq!(Entry::CloseWindow.accelerator(), None);
	}

	#[test]
	fn quit_hide_and_minimize_keep_their_shortcuts() {
		assert_eq!(Entry::Quit.accelerator(), Some("CmdOrCtrl+Q"));
		assert_eq!(Entry::Hide.accelerator(), Some("CmdOrCtrl+H"));
		assert_eq!(Entry::Minimize.accelerator(), Some("CmdOrCtrl+M"));
	}

	#[test]
	fn the_edit_items_keep_their_native_shortcuts() {
		assert_eq!(Entry::Undo.accelerator(), Some("CmdOrCtrl+Z"));
		assert_eq!(Entry::Redo.accelerator(), Some("Shift+CmdOrCtrl+Z"));
		assert_eq!(Entry::Cut.accelerator(), Some("CmdOrCtrl+X"));
		assert_eq!(Entry::Copy.accelerator(), Some("CmdOrCtrl+C"));
		assert_eq!(Entry::Paste.accelerator(), Some("CmdOrCtrl+V"));
		assert_eq!(Entry::SelectAll.accelerator(), Some("CmdOrCtrl+A"));
	}
}
