use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
use crate::events;
use crate::menu_contract::FileMenuAction;
#[cfg(target_os = "macos")]
use crate::menu_contract::FileMenuChosen;
use crate::window_controls;
#[cfg(target_os = "macos")]
use std::{
	collections::HashMap,
	sync::{Mutex, MutexGuard, PoisonError},
};
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::WindowEvent;
#[cfg(target_os = "macos")]
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "macos")]
const WEBSITE: &str = "https://kiroshi.app";

#[cfg(target_os = "macos")]
const WINDOW_MENU: &str = "window-menu";

#[cfg(target_os = "macos")]
const FOCUS_WINDOW: &str = "focus-window:";

const ACTUAL_SIZE_PERCENT: u16 = 100;

const ZOOM_PERCENTS: &[u16] = &[50, 67, 75, 80, 90, ACTUAL_SIZE_PERCENT, 110, 125, 150, 175, 200];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Entry {
	About,
	Hide,
	HideOthers,
	ShowAll,
	Quit,
	NewTab,
	NewWindow,
	ReopenClosedTab,
	CloseTab,
	Undo,
	Redo,
	Cut,
	Copy,
	Paste,
	SelectAll,
	Reload,
	ActualSize,
	ZoomIn,
	ZoomOut,
	EnterFullScreen,
	Minimize,
	Zoom,
	CloseWindow,
	Website,
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

const FILE_ENTRIES: &[Entry] = &[
	Entry::NewTab,
	Entry::NewWindow,
	Entry::ReopenClosedTab,
	Entry::Separator,
	Entry::CloseTab,
	Entry::CloseWindow,
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

const VIEW_ENTRIES: &[Entry] = &[
	Entry::Reload,
	Entry::Separator,
	Entry::ActualSize,
	Entry::ZoomIn,
	Entry::ZoomOut,
	Entry::Separator,
	Entry::EnterFullScreen,
];

const WINDOW_ENTRIES: &[Entry] =
	&[Entry::Minimize, Entry::Zoom, Entry::Separator, Entry::CloseWindow];

const HELP_ENTRIES: &[Entry] = &[Entry::Website];

const CHOSEN_ENTRIES: &[Entry] = &[
	Entry::NewTab,
	Entry::NewWindow,
	Entry::ReopenClosedTab,
	Entry::CloseTab,
	Entry::Reload,
	Entry::ActualSize,
	Entry::ZoomIn,
	Entry::ZoomOut,
	Entry::EnterFullScreen,
	Entry::CloseWindow,
	Entry::Website,
];

impl Entry {
	fn accelerator(self) -> Option<&'static str> {
		match self {
			Entry::Hide => Some("CmdOrCtrl+H"),
			Entry::HideOthers => Some("Alt+CmdOrCtrl+H"),
			Entry::Quit => Some("CmdOrCtrl+Q"),
			Entry::NewTab => Some("CmdOrCtrl+T"),
			Entry::NewWindow => Some("Shift+CmdOrCtrl+N"),
			Entry::ReopenClosedTab => Some("Shift+CmdOrCtrl+T"),
			Entry::CloseTab => Some("CmdOrCtrl+W"),
			Entry::CloseWindow => Some("Shift+CmdOrCtrl+W"),
			Entry::Undo => Some("CmdOrCtrl+Z"),
			Entry::Redo => Some("Shift+CmdOrCtrl+Z"),
			Entry::Cut => Some("CmdOrCtrl+X"),
			Entry::Copy => Some("CmdOrCtrl+C"),
			Entry::Paste => Some("CmdOrCtrl+V"),
			Entry::SelectAll => Some("CmdOrCtrl+A"),
			Entry::Reload => Some("CmdOrCtrl+R"),
			Entry::ActualSize => Some("CmdOrCtrl+0"),
			Entry::ZoomIn => Some("CmdOrCtrl+="),
			Entry::ZoomOut => Some("CmdOrCtrl+-"),
			Entry::Minimize => Some("CmdOrCtrl+M"),
			Entry::About
			| Entry::ShowAll
			| Entry::EnterFullScreen
			| Entry::Zoom
			| Entry::Website
			| Entry::Separator => None,
		}
	}

	fn chosen_as(self) -> Option<(&'static str, &'static str)> {
		match self {
			Entry::NewTab => Some(("new-tab", "New Tab")),
			Entry::NewWindow => Some(("new-window", "New Window")),
			Entry::ReopenClosedTab => Some(("reopen-closed-tab", "Reopen Closed Tab")),
			Entry::CloseTab => Some(("close-tab", "Close Tab")),
			Entry::Reload => Some(("reload", "Reload")),
			Entry::ActualSize => Some(("actual-size", "Actual Size")),
			Entry::ZoomIn => Some(("zoom-in", "Zoom In")),
			Entry::ZoomOut => Some(("zoom-out", "Zoom Out")),
			Entry::EnterFullScreen => Some(("enter-full-screen", "Enter Full Screen")),
			Entry::CloseWindow => Some(("close-window", "Close Window")),
			Entry::Website => Some(("kiroshi-website", "Kiroshi Website")),
			_ => None,
		}
	}

	fn chosen_by(id: &str) -> Option<Entry> {
		CHOSEN_ENTRIES
			.iter()
			.copied()
			.find(|entry| entry.chosen_as().is_some_and(|(entry_id, _)| entry_id == id))
	}

	fn file_action(self) -> Option<FileMenuAction> {
		match self {
			Entry::NewTab => Some(FileMenuAction::NewTab),
			Entry::NewWindow => Some(FileMenuAction::NewWindow),
			Entry::ReopenClosedTab => Some(FileMenuAction::ReopenClosedTab),
			Entry::CloseTab => Some(FileMenuAction::CloseTab),
			_ => None,
		}
	}

	#[cfg(target_os = "macos")]
	fn item<R: Runtime>(self, app: &AppHandle<R>) -> tauri::Result<MenuItemKind<R>> {
		if let Some((id, title)) = self.chosen_as() {
			return MenuItem::with_id(app, id, title, true, self.accelerator())
				.map(MenuItemKind::MenuItem);
		}
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
			_ => PredefinedMenuItem::separator(app),
		};
		native.map(MenuItemKind::Predefined)
	}
}

fn zoomed(percent: u16, entry: Entry) -> u16 {
	let first = ZOOM_PERCENTS[0];
	let last = ZOOM_PERCENTS[ZOOM_PERCENTS.len() - 1];
	match entry {
		Entry::ZoomIn => ZOOM_PERCENTS.iter().copied().find(|step| *step > percent).unwrap_or(last),
		Entry::ZoomOut => {
			ZOOM_PERCENTS.iter().rev().copied().find(|step| *step < percent).unwrap_or(first)
		}
		_ => ACTUAL_SIZE_PERCENT,
	}
}

fn submenus<R: Runtime>(app: &AppHandle<R>) -> [(String, &'static [Entry]); 6] {
	[
		(app.package_info().name.clone(), APP_ENTRIES),
		("File".to_owned(), FILE_ENTRIES),
		("Edit".to_owned(), EDIT_ENTRIES),
		("View".to_owned(), VIEW_ENTRIES),
		("Window".to_owned(), WINDOW_ENTRIES),
		("Help".to_owned(), HELP_ENTRIES),
	]
}

fn open_app_windows<R: Runtime>(
	app: &AppHandle<R>,
	departing: Option<&str>,
) -> Vec<(String, String)> {
	let mut open: Vec<(String, String)> = app
		.webview_windows()
		.into_iter()
		.filter(|(label, _)| {
			window_controls::is_app_window(label) && Some(label.as_str()) != departing
		})
		.filter_map(|(label, window)| match shown_title(&window) {
			Ok(title) => title.map(|title| (label, title)),
			Err(failure) => {
				eprintln!("the window {label} was left off the Window menu: {failure}");
				None
			}
		})
		.collect();
	open.sort();
	open
}

fn shown_title<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<Option<String>> {
	window.is_visible()?.then(|| window.title()).transpose()
}

#[cfg(target_os = "macos")]
#[derive(Default)]
struct ZoomPercents(Mutex<HashMap<String, u16>>);

#[cfg(target_os = "macos")]
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
	app.set_menu(build(app)?)?;
	app.on_menu_event(act_on_choice);
	Ok(())
}

#[cfg(target_os = "macos")]
fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
	let menu = Menu::new(app)?;
	for (title, entries) in submenus(app) {
		let submenu = if entries == WINDOW_ENTRIES {
			Submenu::with_id(app, WINDOW_MENU, title, true)?
		} else {
			Submenu::new(app, title, true)?
		};
		for entry in entries {
			submenu.append(&entry.item(app)?)?;
		}
		menu.append(&submenu)?;
	}
	Ok(menu)
}

#[cfg(target_os = "macos")]
pub fn follow_in_window_menu<R: Runtime>(window: &WebviewWindow<R>) {
	let app = window.app_handle().clone();
	let label = window.label().to_owned();
	window.on_window_event(move |event| match event {
		WindowEvent::Focused(_) => list_open_windows(&app, None),
		WindowEvent::Destroyed => {
			zoom_percents(&app).remove(&label);
			list_open_windows(&app, Some(&label));
		}
		_ => {}
	});
	list_open_windows(window.app_handle(), None);
}

#[cfg(target_os = "macos")]
fn list_open_windows<R: Runtime>(app: &AppHandle<R>, departing: Option<&str>) {
	if let Err(failure) = relist_open_windows(app, departing) {
		eprintln!("the Window menu did not list the open windows: {failure}");
	}
}

#[cfg(target_os = "macos")]
fn relist_open_windows<R: Runtime>(
	app: &AppHandle<R>,
	departing: Option<&str>,
) -> tauri::Result<()> {
	let Some(window_menu) = app.menu().and_then(|menu| menu.get(WINDOW_MENU)) else {
		return Ok(());
	};
	let Some(window_menu) = window_menu.as_submenu() else {
		return Ok(());
	};
	for listed in window_menu.items()?.iter().skip(WINDOW_ENTRIES.len()) {
		window_menu.remove(listed)?;
	}
	let open = open_app_windows(app, departing);
	if open.is_empty() {
		return Ok(());
	}
	window_menu.append(&PredefinedMenuItem::separator(app)?)?;
	for (label, title) in open {
		let id = format!("{FOCUS_WINDOW}{label}");
		window_menu.append(&MenuItem::with_id(app, id, title, true, None::<&str>)?)?;
	}
	Ok(())
}

#[cfg(target_os = "macos")]
fn act_on_choice<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
	let id = event.id().as_ref();
	if let Some(label) = id.strip_prefix(FOCUS_WINDOW) {
		return focus(app, label);
	}
	let Some(entry) = Entry::chosen_by(id) else {
		return;
	};
	if entry == Entry::Website {
		return open_website(app);
	}
	let Some(window) = window_controls::focused_app_window(app) else {
		return eprintln!("the menu item {id} found no focused app window to act on");
	};
	if let Err(failure) = act_on(&window, entry) {
		eprintln!("the menu item {id} did not act on the window {}: {failure}", window.label());
	}
}

#[cfg(target_os = "macos")]
fn act_on<R: Runtime>(window: &WebviewWindow<R>, entry: Entry) -> tauri::Result<()> {
	if let Some(action) = entry.file_action() {
		let app = window.app_handle();
		return events::emit_to(app, window.label(), events::FILE_MENU, FileMenuChosen { action });
	}
	match entry {
		Entry::CloseWindow => window.close(),
		Entry::Reload => window.reload(),
		Entry::EnterFullScreen => window.set_fullscreen(!window.is_fullscreen()?),
		Entry::ActualSize | Entry::ZoomIn | Entry::ZoomOut => zoom(window, entry),
		_ => Ok(()),
	}
}

#[cfg(target_os = "macos")]
fn zoom_percents<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, HashMap<String, u16>> {
	if app.try_state::<ZoomPercents>().is_none() {
		app.manage(ZoomPercents::default());
	}
	app.state::<ZoomPercents>().inner().0.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(target_os = "macos")]
fn zoom<R: Runtime>(window: &WebviewWindow<R>, entry: Entry) -> tauri::Result<()> {
	let mut percents = zoom_percents(window.app_handle());
	let current = percents.get(window.label()).copied().unwrap_or(ACTUAL_SIZE_PERCENT);
	let next = zoomed(current, entry);
	window.set_zoom(f64::from(next) / 100.0)?;
	percents.insert(window.label().to_owned(), next);
	Ok(())
}

#[cfg(target_os = "macos")]
fn focus<R: Runtime>(app: &AppHandle<R>, label: &str) {
	let Some(window) = app.get_webview_window(label) else {
		return eprintln!("the window {label} chosen from the Window menu is gone");
	};
	if let Err(failure) =
		window.unminimize().and_then(|()| window.show()).and_then(|()| window.set_focus())
	{
		eprintln!("the window {label} was not raised from the Window menu: {failure}");
	}
}

#[cfg(target_os = "macos")]
fn open_website<R: Runtime>(app: &AppHandle<R>) {
	if let Err(failure) = app.opener().open_url(WEBSITE, None::<&str>) {
		eprintln!("the Kiroshi website did not open from the Help menu: {failure}");
	}
}

#[cfg(test)]
mod tests {
	use tauri::test::mock_builder;
	use tauri::{WebviewUrl, WebviewWindowBuilder};

	use super::{open_app_windows, submenus, zoomed, Entry, FILE_ENTRIES};
	use crate::menu_contract::{FileMenuAction, FileMenuChosen};
	use crate::test_app::an_app_of_its_own;

	#[test]
	fn the_menu_holds_the_app_file_edit_view_window_and_help_submenus_in_order() {
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
					"File".to_owned(),
					vec![
						Entry::NewTab,
						Entry::NewWindow,
						Entry::ReopenClosedTab,
						Entry::Separator,
						Entry::CloseTab,
						Entry::CloseWindow,
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
					"View".to_owned(),
					vec![
						Entry::Reload,
						Entry::Separator,
						Entry::ActualSize,
						Entry::ZoomIn,
						Entry::ZoomOut,
						Entry::Separator,
						Entry::EnterFullScreen,
					],
				),
				(
					"Window".to_owned(),
					vec![Entry::Minimize, Entry::Zoom, Entry::Separator, Entry::CloseWindow],
				),
				("Help".to_owned(), vec![Entry::Website]),
			]
		);
	}

	#[test]
	fn the_file_view_and_help_items_carry_their_titles_and_shortcuts() {
		let laid_out: Vec<(&str, Option<&str>)> = [
			Entry::NewTab,
			Entry::NewWindow,
			Entry::ReopenClosedTab,
			Entry::CloseTab,
			Entry::CloseWindow,
			Entry::Reload,
			Entry::ActualSize,
			Entry::ZoomIn,
			Entry::ZoomOut,
			Entry::EnterFullScreen,
			Entry::Website,
		]
		.into_iter()
		.map(|entry| (entry.chosen_as().map_or("", |(_, title)| title), entry.accelerator()))
		.collect();

		assert_eq!(
			laid_out,
			vec![
				("New Tab", Some("CmdOrCtrl+T")),
				("New Window", Some("Shift+CmdOrCtrl+N")),
				("Reopen Closed Tab", Some("Shift+CmdOrCtrl+T")),
				("Close Tab", Some("CmdOrCtrl+W")),
				("Close Window", Some("Shift+CmdOrCtrl+W")),
				("Reload", Some("CmdOrCtrl+R")),
				("Actual Size", Some("CmdOrCtrl+0")),
				("Zoom In", Some("CmdOrCtrl+=")),
				("Zoom Out", Some("CmdOrCtrl+-")),
				("Enter Full Screen", None),
				("Kiroshi Website", None),
			]
		);
	}

	#[test]
	fn cmd_w_is_bound_to_close_tab_alone() {
		let app = an_app_of_its_own("menu", mock_builder());
		let bound_to_cmd_w: Vec<Entry> = submenus(app.handle())
			.into_iter()
			.flat_map(|(_, entries)| entries.iter().copied())
			.filter(|entry| entry.accelerator() == Some("CmdOrCtrl+W"))
			.collect();

		assert_eq!(bound_to_cmd_w, vec![Entry::CloseTab]);
	}

	#[test]
	fn every_chosen_item_is_found_again_by_its_id() {
		let app = an_app_of_its_own("menu", mock_builder());
		let entries =
			submenus(app.handle()).into_iter().flat_map(|(_, entries)| entries.iter().copied());
		for entry in entries {
			if let Some((id, _)) = entry.chosen_as() {
				assert_eq!(Entry::chosen_by(id), Some(entry), "the item {id} is not found again");
			}
		}
	}

	#[test]
	fn the_file_tab_items_name_their_action() {
		let actions: Vec<Option<FileMenuAction>> =
			FILE_ENTRIES.iter().map(|entry| entry.file_action()).collect();

		assert_eq!(
			actions,
			vec![
				Some(FileMenuAction::NewTab),
				Some(FileMenuAction::NewWindow),
				Some(FileMenuAction::ReopenClosedTab),
				None,
				Some(FileMenuAction::CloseTab),
				None,
			]
		);
	}

	#[test]
	fn the_file_tab_action_reaches_the_front_in_camel_case() {
		let chosen = FileMenuChosen { action: FileMenuAction::ReopenClosedTab };

		assert_eq!(
			serde_json::to_value(chosen).expect("the payload serializes"),
			serde_json::json!({ "action": "reopenClosedTab" })
		);
	}

	#[test]
	fn the_zoom_steps_along_its_ladder_and_stops_at_its_ends() {
		assert_eq!(zoomed(100, Entry::ZoomIn), 110);
		assert_eq!(zoomed(100, Entry::ZoomOut), 90);
		assert_eq!(zoomed(200, Entry::ZoomIn), 200);
		assert_eq!(zoomed(50, Entry::ZoomOut), 50);
		assert_eq!(zoomed(175, Entry::ActualSize), 100);
	}

	#[test]
	fn the_window_menu_lists_the_shown_app_windows_without_the_departing_one() {
		let app = an_app_of_its_own("menu", mock_builder());
		for label in ["window-3", "main", "dispatcher", "window-2"] {
			WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
				.build()
				.expect("the window opens");
		}

		let listed: Vec<String> = open_app_windows(app.handle(), Some("window-3"))
			.into_iter()
			.map(|(label, _)| label)
			.collect();

		assert_eq!(listed, vec!["main".to_owned(), "window-2".to_owned()]);
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
