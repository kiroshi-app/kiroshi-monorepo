use rune::{AppHandle, MenuItem, Shortcut, Tx};

use crate::app::App;
use crate::surfaces::s01_chrome;

const WEBSITE: &str = "https://kiroshi.app";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Act {
	Platform,
	Nothing,
	CloseWindow,
	OpenWebsite,
	NewTab,
	NewWindow,
	ReopenClosedTab,
	CloseTab,
}

#[derive(Clone, Copy)]
enum Line {
	Item(&'static str, Option<&'static str>, Act),
	PlatformSeparator,
	Separator,
}

use Line::{Item, PlatformSeparator, Separator};

const MENUS: [(&str, &[Line]); 6] = [
	(
		"Kiroshi",
		&[
			Item("About Kiroshi", None, Act::Platform),
			PlatformSeparator,
			Item("Hide Kiroshi", Some("cmd+h"), Act::Platform),
			Item("Hide Others", Some("alt+cmd+h"), Act::Platform),
			Item("Show All", None, Act::Platform),
			PlatformSeparator,
			Item("Quit Kiroshi", Some("cmd+q"), Act::Platform),
		],
	),
	(
		"File",
		&[
			Item("New Tab", Some("cmd+t"), Act::NewTab),
			Item("New Window", Some("shift+cmd+n"), Act::NewWindow),
			Item("Reopen Closed Tab", Some("shift+cmd+t"), Act::ReopenClosedTab),
			Separator,
			Item("Close Tab", Some("cmd+w"), Act::CloseTab),
			Item("Close Window", Some("shift+cmd+w"), Act::CloseWindow),
		],
	),
	(
		"Edit",
		&[
			Item("Undo", Some("cmd+z"), Act::Platform),
			Item("Redo", Some("shift+cmd+z"), Act::Platform),
			PlatformSeparator,
			Item("Cut", Some("cmd+x"), Act::Platform),
			Item("Copy", Some("cmd+c"), Act::Platform),
			Item("Paste", Some("cmd+v"), Act::Platform),
			Item("Select All", Some("cmd+a"), Act::Platform),
		],
	),
	(
		"View",
		&[
			Item("Reload", Some("cmd+r"), Act::Nothing),
			Separator,
			Item("Actual Size", Some("cmd+0"), Act::Nothing),
			Item("Zoom In", Some("cmd+="), Act::Nothing),
			Item("Zoom Out", Some("cmd+-"), Act::Nothing),
			Separator,
			Item("Enter Full Screen", None, Act::Nothing),
		],
	),
	(
		"Window",
		&[
			Item("Minimize", Some("cmd+m"), Act::Platform),
			Item("Zoom", None, Act::Nothing),
			Separator,
			Item("Close Window", Some("shift+cmd+w"), Act::CloseWindow),
		],
	),
	("Help", &[Item("Kiroshi Website", None, Act::OpenWebsite)]),
];

pub fn install(app: &AppHandle<App>) {
	if !cfg!(target_os = "macos") {
		return;
	}
	if let Err(failure) = app.set_menu(items()) {
		eprintln!("the menu bar was not installed: {failure}");
	}
}

fn items() -> Vec<MenuItem<App>> {
	MENUS
		.iter()
		.flat_map(|(menu, lines)| lines.iter().filter_map(move |line| item(menu, *line)))
		.collect()
}

fn item(menu: &str, line: Line) -> Option<MenuItem<App>> {
	match line {
		PlatformSeparator => None,
		Separator => Some(MenuItem::separator().menu(menu)),
		Item(title, shortcut, act) => {
			let item = MenuItem::new(title, action(act)?).id(format!("{menu}/{title}")).menu(menu);
			Some(match shortcut.map(str::parse::<Shortcut>) {
				None => item,
				Some(Ok(shortcut)) => item.key_equivalent(shortcut),
				Some(Err(failure)) => {
					eprintln!("the menu item {menu}/{title} has no shortcut: {failure}");
					item
				}
			})
		}
	}
}

fn action(act: Act) -> Option<fn(&mut App, &mut Tx)> {
	match act {
		Act::Platform => None,
		Act::Nothing => Some(|_, _| {}),
		Act::CloseWindow => Some(|_, tx| tx.close_window()),
		Act::OpenWebsite => Some(open_website),
		Act::NewTab => Some(|app, _| s01_chrome::new_tab(app)),
		Act::NewWindow => Some(|app, _| s01_chrome::new_window(app)),
		Act::ReopenClosedTab => Some(|app, _| s01_chrome::reopen_closed_tab(app)),
		Act::CloseTab => Some(|app, _| s01_chrome::close_tab(app)),
	}
}

fn open_website(_: &mut App, tx: &mut Tx) {
	if let Err(failure) = tx.open_url(WEBSITE) {
		eprintln!("the menu item Help/Kiroshi Website did not open {WEBSITE}: {failure}");
	}
}

#[cfg(test)]
mod tests {
	use super::{Act, Line, MENUS, Shortcut};

	const SEPARATOR: &str = "---";

	fn shown() -> Vec<(&'static str, &'static str, Option<&'static str>)> {
		MENUS
			.iter()
			.flat_map(|(menu, lines)| {
				lines.iter().map(move |line| match *line {
					Line::Item(title, shortcut, _) => (*menu, title, shortcut),
					Line::PlatformSeparator | Line::Separator => (*menu, SEPARATOR, None),
				})
			})
			.collect()
	}

	#[test]
	fn the_menus_hold_the_tauri_items_with_their_shortcuts_in_order() {
		assert_eq!(
			shown(),
			[
				("Kiroshi", "About Kiroshi", None),
				("Kiroshi", SEPARATOR, None),
				("Kiroshi", "Hide Kiroshi", Some("cmd+h")),
				("Kiroshi", "Hide Others", Some("alt+cmd+h")),
				("Kiroshi", "Show All", None),
				("Kiroshi", SEPARATOR, None),
				("Kiroshi", "Quit Kiroshi", Some("cmd+q")),
				("File", "New Tab", Some("cmd+t")),
				("File", "New Window", Some("shift+cmd+n")),
				("File", "Reopen Closed Tab", Some("shift+cmd+t")),
				("File", SEPARATOR, None),
				("File", "Close Tab", Some("cmd+w")),
				("File", "Close Window", Some("shift+cmd+w")),
				("Edit", "Undo", Some("cmd+z")),
				("Edit", "Redo", Some("shift+cmd+z")),
				("Edit", SEPARATOR, None),
				("Edit", "Cut", Some("cmd+x")),
				("Edit", "Copy", Some("cmd+c")),
				("Edit", "Paste", Some("cmd+v")),
				("Edit", "Select All", Some("cmd+a")),
				("View", "Reload", Some("cmd+r")),
				("View", SEPARATOR, None),
				("View", "Actual Size", Some("cmd+0")),
				("View", "Zoom In", Some("cmd+=")),
				("View", "Zoom Out", Some("cmd+-")),
				("View", SEPARATOR, None),
				("View", "Enter Full Screen", None),
				("Window", "Minimize", Some("cmd+m")),
				("Window", "Zoom", None),
				("Window", SEPARATOR, None),
				("Window", "Close Window", Some("shift+cmd+w")),
				("Help", "Kiroshi Website", None),
			]
		);
	}

	#[test]
	fn every_shortcut_parses_and_cmd_w_closes_the_tab_alone() {
		let parsed: Vec<_> = shown()
			.into_iter()
			.filter_map(|(menu, title, shortcut)| {
				shortcut.map(|shortcut| (menu, title, shortcut.parse::<Shortcut>().unwrap()))
			})
			.collect();
		let bound_to = |chord: &str| {
			let chord = chord.parse::<Shortcut>().unwrap();
			parsed
				.iter()
				.filter(|(_, _, shortcut)| *shortcut == chord)
				.map(|(menu, title, _)| (*menu, *title))
				.collect::<Vec<_>>()
		};
		assert_eq!(bound_to("cmd+w"), [("File", "Close Tab")]);
		assert_eq!(bound_to("shift+cmd+w"), [("File", "Close Window"), ("Window", "Close Window")]);
	}

	#[test]
	fn each_item_is_the_platform_s_own_acts_on_the_tabs_closes_opens_or_does_nothing_yet() {
		let acts: Vec<_> = MENUS
			.iter()
			.flat_map(|(menu, lines)| lines.iter().map(move |line| (*menu, *line)))
			.filter_map(|(menu, line)| match line {
				Line::Item(title, _, act) => Some((menu, title, act)),
				Line::PlatformSeparator | Line::Separator => None,
			})
			.collect();
		assert_eq!(
			acts,
			[
				("Kiroshi", "About Kiroshi", Act::Platform),
				("Kiroshi", "Hide Kiroshi", Act::Platform),
				("Kiroshi", "Hide Others", Act::Platform),
				("Kiroshi", "Show All", Act::Platform),
				("Kiroshi", "Quit Kiroshi", Act::Platform),
				("File", "New Tab", Act::NewTab),
				("File", "New Window", Act::NewWindow),
				("File", "Reopen Closed Tab", Act::ReopenClosedTab),
				("File", "Close Tab", Act::CloseTab),
				("File", "Close Window", Act::CloseWindow),
				("Edit", "Undo", Act::Platform),
				("Edit", "Redo", Act::Platform),
				("Edit", "Cut", Act::Platform),
				("Edit", "Copy", Act::Platform),
				("Edit", "Paste", Act::Platform),
				("Edit", "Select All", Act::Platform),
				("View", "Reload", Act::Nothing),
				("View", "Actual Size", Act::Nothing),
				("View", "Zoom In", Act::Nothing),
				("View", "Zoom Out", Act::Nothing),
				("View", "Enter Full Screen", Act::Nothing),
				("Window", "Minimize", Act::Platform),
				("Window", "Zoom", Act::Nothing),
				("Window", "Close Window", Act::CloseWindow),
				("Help", "Kiroshi Website", Act::OpenWebsite),
			]
		);
	}
}
