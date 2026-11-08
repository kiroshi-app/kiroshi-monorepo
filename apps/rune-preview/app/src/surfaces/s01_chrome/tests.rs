use std::cell::RefCell;

use kiroshi_core::core_context::RenderWindow;
use kiroshi_rune_kit::surfaces::s01_chrome::{ChromeEvent, Landing, Lift};

use kiroshi_rune_kit::surfaces::s02_rail::{RailMessage, RailPanel};

use super::desk::with_desk_on;
use super::{Desk, Failure, Menu, Shelf, State, Windows};
use crate::app::App;
use crate::navigation::{MAIN_WINDOW, Navigation, Route, WindowId};
use crate::scenes;
use crate::surfaces::s02_rail;

#[derive(Default)]
struct FakeWindows {
	refuses_open: Option<String>,
	refuses_close: Option<String>,
	opened: RefCell<Vec<String>>,
	closed: RefCell<Vec<String>>,
}

impl Windows for FakeWindows {
	fn open(&self, window: &RenderWindow) -> Result<(), String> {
		if let Some(reason) = &self.refuses_open {
			return Err(reason.clone());
		}
		self.opened.borrow_mut().push(window.label.clone());
		Ok(())
	}

	fn close(&self, label: &str) -> Result<(), String> {
		if let Some(reason) = &self.refuses_close {
			return Err(reason.clone());
		}
		self.closed.borrow_mut().push(label.to_owned());
		Ok(())
	}
}

#[derive(Default)]
struct FakeShelf {
	kept: RefCell<Option<String>>,
	refuses: Option<String>,
}

impl Shelf for FakeShelf {
	fn read(&self) -> Result<Option<String>, String> {
		match &self.refuses {
			Some(reason) => Err(reason.clone()),
			None => Ok(self.kept.borrow().clone()),
		}
	}

	fn write(&self, kept: &str) -> Result<(), String> {
		if let Some(reason) = &self.refuses {
			return Err(reason.clone());
		}
		*self.kept.borrow_mut() = Some(kept.to_owned());
		Ok(())
	}
}

struct Bench {
	state: State,
	navigation: Navigation,
	windows: FakeWindows,
	shelf: FakeShelf,
}

impl Bench {
	fn new() -> Bench {
		Bench::with(FakeWindows::default(), FakeShelf::default())
	}

	fn with(windows: FakeWindows, shelf: FakeShelf) -> Bench {
		Bench {
			state: State::default(),
			navigation: Navigation::new(Route::Conversations),
			windows,
			shelf,
		}
	}

	fn hear(&mut self, window: WindowId, event: ChromeEvent) {
		self.act(|state, desk| state.heard(window, event, desk));
	}

	fn act(&mut self, act: impl FnOnce(&mut State, &mut Desk)) {
		let mut desk =
			Desk { navigation: &mut self.navigation, windows: &self.windows, shelf: &self.shelf };
		act(&mut self.state, &mut desk);
	}

	fn ids(&self, window: WindowId) -> Vec<String> {
		self.state
			.tabs_of(window)
			.map(|tabs| tabs.tabs().iter().map(|tab| tab.id.clone()).collect())
			.unwrap_or_default()
	}

	fn active(&self, window: WindowId) -> String {
		self.state.tabs_of(window).map(|tabs| tabs.active().to_owned()).unwrap_or_default()
	}

	fn open_tabs(&mut self, count: usize) -> Vec<String> {
		(0..count).for_each(|_| self.hear(MAIN_WINDOW, ChromeEvent::NewTab));
		self.ids(MAIN_WINDOW)
	}

	fn windows(&self) -> Vec<WindowId> {
		self.navigation.windows().map(|window| window.id).collect()
	}

	fn second_window(&self) -> WindowId {
		self.windows()[1]
	}
}

#[test]
fn new_tab_opens_a_focused_tab_after_the_active_one() {
	let mut bench = Bench::new();
	let first = bench.active(MAIN_WINDOW);

	bench.hear(MAIN_WINDOW, ChromeEvent::NewTab);

	let ids = bench.ids(MAIN_WINDOW);
	assert_eq!(ids.len(), 2);
	assert_eq!(ids[0], first);
	assert_eq!(bench.active(MAIN_WINDOW), ids[1]);
}

#[test]
fn the_menu_new_tab_and_close_tab_act_like_the_title_bar() {
	let mut bench = Bench::new();
	let first = bench.active(MAIN_WINDOW);

	bench.act(|state, desk| state.new_tab(MAIN_WINDOW, desk));
	bench.act(|state, desk| state.close_active_tab(MAIN_WINDOW, desk));

	assert_eq!(bench.ids(MAIN_WINDOW), std::slice::from_ref(&first));
	assert_eq!(bench.active(MAIN_WINDOW), first);
}

#[test]
fn closing_a_tab_by_its_button_focuses_the_neighbour_after_it() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(2);
	bench.hear(MAIN_WINDOW, ChromeEvent::SelectTab(ids[1].clone()));

	bench.hear(MAIN_WINDOW, ChromeEvent::CloseTab(ids[1].clone()));

	assert_eq!(bench.ids(MAIN_WINDOW), [ids[0].clone(), ids[2].clone()]);
	assert_eq!(bench.active(MAIN_WINDOW), ids[2]);
}

#[test]
fn reopen_closed_tab_restores_it_at_its_former_position() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(2);
	bench.hear(MAIN_WINDOW, ChromeEvent::CloseTab(ids[1].clone()));

	bench.act(|state, desk| state.reopen_closed_tab(MAIN_WINDOW, desk));

	assert_eq!(bench.ids(MAIN_WINDOW), ids);
	assert_eq!(bench.active(MAIN_WINDOW), ids[1]);
}

#[test]
fn a_drag_lifts_the_tab_while_it_moves_and_reorders_on_release() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(2);
	let lift = Lift { id: ids[0].clone(), dx: 120.0, landing: Landing::Slot(2) };

	bench.hear(MAIN_WINDOW, ChromeEvent::LiftMoved(lift.clone()));
	assert_eq!(bench.state.lift, Some(lift));

	bench.hear(MAIN_WINDOW, ChromeEvent::LiftEnded(ids[0].clone()));
	let reordered = vec![ids[1].clone(), ids[2].clone(), ids[0].clone()];
	bench.hear(MAIN_WINDOW, ChromeEvent::ReorderTabs(reordered.clone()));

	assert_eq!(bench.state.lift, None);
	assert_eq!(bench.ids(MAIN_WINDOW), reordered);
}

#[test]
fn a_tab_torn_off_opens_in_a_new_window_and_leaves_the_source() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(1);

	bench.hear(MAIN_WINDOW, ChromeEvent::TearOffTab { id: ids[1].clone(), travel: (0.0, 300.0) });

	let torn_into = bench.second_window();
	assert_eq!(bench.ids(MAIN_WINDOW), [ids[0].clone()]);
	assert_eq!(bench.ids(torn_into), [ids[1].clone()]);
	assert_eq!(bench.active(torn_into), ids[1]);
	assert_eq!(bench.windows.opened.borrow().len(), 1);
	assert_eq!(bench.state.failure, None);
}

#[test]
fn the_only_tab_torn_off_stays_in_its_window() {
	let mut bench = Bench::new();
	let only = bench.active(MAIN_WINDOW);

	bench.hear(MAIN_WINDOW, ChromeEvent::TearOffTab { id: only.clone(), travel: (0.0, 300.0) });

	assert_eq!(bench.ids(MAIN_WINDOW), [only]);
	assert_eq!(bench.windows(), [MAIN_WINDOW]);
	assert!(bench.windows.opened.borrow().is_empty());
}

#[test]
fn a_refused_window_keeps_the_tabs_and_shows_why() {
	let windows =
		FakeWindows { refuses_open: Some("no room".to_owned()), ..FakeWindows::default() };
	let mut bench = Bench::with(windows, FakeShelf::default());
	let ids = bench.open_tabs(1);

	bench.hear(MAIN_WINDOW, ChromeEvent::TearOffTab { id: ids[1].clone(), travel: (0.0, 300.0) });

	assert_eq!(bench.ids(MAIN_WINDOW), ids);
	assert_eq!(bench.windows(), [MAIN_WINDOW]);
	assert_eq!(bench.state.failure, Some(Failure::moved("no room")));
}

#[test]
fn move_to_new_window_from_the_menu_opens_it_there_and_closes_the_menu() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(1);
	bench.hear(MAIN_WINDOW, ChromeEvent::OpenTabMenu { id: ids[1].clone(), at: (10.0, 20.0) });
	assert_eq!(bench.state.menu, Some(Menu::Tab { id: ids[1].clone(), at: (10.0, 20.0) }));

	bench.hear(MAIN_WINDOW, ChromeEvent::MoveTabToNewWindow(ids[1].clone()));

	assert_eq!(bench.state.menu, None);
	assert_eq!(bench.ids(MAIN_WINDOW), [ids[0].clone()]);
	assert_eq!(bench.ids(bench.second_window()).len(), 1);
}

#[test]
fn every_tab_menu_item_runs_its_action() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(2);

	bench.hear(MAIN_WINDOW, ChromeEvent::PinTab(ids[2].clone()));
	assert_eq!(bench.ids(MAIN_WINDOW)[0], ids[2]);
	bench.hear(MAIN_WINDOW, ChromeEvent::UnpinTab(ids[2].clone()));
	assert_eq!(bench.ids(MAIN_WINDOW), [ids[2].clone(), ids[0].clone(), ids[1].clone()]);
	assert!(
		bench
			.state
			.tabs_of(MAIN_WINDOW)
			.is_some_and(|tabs| tabs.tabs().iter().all(|tab| !tab.is_pinned))
	);

	bench.hear(MAIN_WINDOW, ChromeEvent::DuplicateTab(ids[0].clone()));
	assert_eq!(bench.ids(MAIN_WINDOW).len(), 4);

	bench.hear(MAIN_WINDOW, ChromeEvent::CloseOtherTabs(ids[1].clone()));
	assert_eq!(bench.ids(MAIN_WINDOW), [ids[1].clone()]);

	bench.hear(MAIN_WINDOW, ChromeEvent::ReopenClosedTab);
	assert_eq!(bench.ids(MAIN_WINDOW).len(), 2);
}

#[test]
fn the_overflow_menu_toggles_and_any_other_gesture_closes_it() {
	let mut bench = Bench::new();
	let only = bench.active(MAIN_WINDOW);

	bench.hear(MAIN_WINDOW, ChromeEvent::OpenOverflow);
	assert_eq!(bench.state.menu, Some(Menu::Overflow));
	bench.hear(MAIN_WINDOW, ChromeEvent::OpenOverflow);
	assert_eq!(bench.state.menu, None);

	bench.hear(MAIN_WINDOW, ChromeEvent::OpenOverflow);
	bench.hear(MAIN_WINDOW, ChromeEvent::SelectTab(only));
	assert_eq!(bench.state.menu, None);
}

#[test]
fn new_window_opens_a_window_on_a_fresh_tab() {
	let mut bench = Bench::new();

	bench.act(State::new_window);

	assert_eq!(bench.windows().len(), 2);
	assert_eq!(bench.ids(bench.second_window()).len(), 1);
}

#[test]
fn a_refused_new_window_shows_the_failure_and_opens_nothing() {
	let windows =
		FakeWindows { refuses_open: Some("no room".to_owned()), ..FakeWindows::default() };
	let mut bench = Bench::with(windows, FakeShelf::default());

	bench.act(State::new_window);

	assert_eq!(bench.windows(), [MAIN_WINDOW]);
	assert_eq!(bench.state.failure, Some(Failure::new_window("no room")));
}

#[test]
fn closing_the_last_tab_of_a_second_window_closes_that_window() {
	let mut bench = Bench::new();
	bench.act(State::new_window);
	let second = bench.second_window();
	let only = bench.active(second);

	bench.hear(second, ChromeEvent::CloseTab(only));

	assert_eq!(bench.windows(), [MAIN_WINDOW]);
	assert_eq!(bench.windows.closed.borrow().len(), 1);
}

#[test]
fn a_refused_window_close_keeps_its_tabs_and_shows_why() {
	let windows = FakeWindows { refuses_close: Some("busy".to_owned()), ..FakeWindows::default() };
	let mut bench = Bench::with(windows, FakeShelf::default());
	bench.act(State::new_window);
	let second = bench.second_window();
	let only = bench.active(second);

	bench.hear(second, ChromeEvent::CloseTab(only.clone()));

	assert_eq!(bench.ids(second), [only]);
	assert_eq!(bench.state.failure, Some(Failure::closed("busy")));
}

#[test]
fn a_tab_docked_onto_another_window_lands_at_its_slot_focused_and_leaves_the_source() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(1);
	bench.act(State::new_window);
	let second = bench.second_window();
	let held = bench.ids(second);

	bench.act(|state, desk| state.dock(MAIN_WINDOW, &ids[1], second, 0, desk));

	assert_eq!(bench.ids(MAIN_WINDOW), [ids[0].clone()]);
	assert_eq!(bench.ids(second), [ids[1].clone(), held[0].clone()]);
	assert_eq!(bench.active(second), ids[1]);
}

#[test]
fn docking_the_only_tab_of_a_second_window_closes_it() {
	let mut bench = Bench::new();
	bench.act(State::new_window);
	let second = bench.second_window();
	let only = bench.active(second);

	bench.act(|state, desk| state.dock(second, &only, MAIN_WINDOW, 1, desk));

	assert_eq!(bench.windows(), [MAIN_WINDOW]);
	assert_eq!(bench.ids(MAIN_WINDOW)[1], only);
	assert_eq!(bench.active(MAIN_WINDOW), only);
}

#[test]
fn a_refused_dock_keeps_both_windows_unchanged() {
	let windows = FakeWindows { refuses_close: Some("busy".to_owned()), ..FakeWindows::default() };
	let mut bench = Bench::with(windows, FakeShelf::default());
	bench.act(State::new_window);
	let second = bench.second_window();
	let only = bench.active(second);
	let main = bench.ids(MAIN_WINDOW);

	bench.act(|state, desk| state.dock(second, &only, MAIN_WINDOW, 1, desk));

	assert_eq!(bench.ids(MAIN_WINDOW), main);
	assert_eq!(bench.ids(second), [only]);
	assert_eq!(bench.state.failure, Some(Failure::closed("busy")));
}

#[test]
fn the_tabs_of_every_window_come_back_after_a_restart() {
	let mut bench = Bench::new();
	let ids = bench.open_tabs(2);
	bench.hear(MAIN_WINDOW, ChromeEvent::PinTab(ids[1].clone()));
	bench.hear(MAIN_WINDOW, ChromeEvent::TearOffTab { id: ids[2].clone(), travel: (0.0, 300.0) });
	let main = bench.state.tabs_of(MAIN_WINDOW).cloned();
	let kept = bench.shelf.kept.borrow().clone();

	let mut restarted =
		Bench::with(FakeWindows::default(), FakeShelf { kept: RefCell::new(kept), refuses: None });
	restarted.state.restore(&restarted.shelf);
	restarted.act(State::reopen_kept_windows);

	assert_eq!(restarted.state.tabs_of(MAIN_WINDOW).cloned(), main);
	assert_eq!(restarted.ids(restarted.second_window()), [ids[2].clone()]);
	assert_eq!(restarted.state.failure, None);
}

#[test]
fn a_window_that_cannot_reopen_after_a_restart_is_forgotten_and_named() {
	let mut bench = Bench::new();
	bench.act(State::new_window);
	let kept = bench.shelf.kept.borrow().clone();
	let windows =
		FakeWindows { refuses_open: Some("no room".to_owned()), ..FakeWindows::default() };

	let mut restarted = Bench::with(windows, FakeShelf { kept: RefCell::new(kept), refuses: None });
	restarted.state.restore(&restarted.shelf);
	restarted.act(State::reopen_kept_windows);

	assert_eq!(restarted.windows(), [MAIN_WINDOW]);
	assert_eq!(restarted.state.failure, Some(Failure::reopened("no room")));
	let rewritten = restarted.shelf.kept.borrow().clone().unwrap_or_default();
	assert!(rewritten.contains("\"others\":[]"));
}

#[test]
fn an_unreadable_shelf_starts_on_a_fresh_tab_and_shows_why() {
	let shelf = FakeShelf { kept: RefCell::new(Some("{".to_owned())), refuses: None };
	let mut bench = Bench::with(FakeWindows::default(), shelf);

	bench.state.restore(&bench.shelf);

	assert_eq!(bench.ids(MAIN_WINDOW).len(), 1);
	assert!(bench.state.failure.is_some());
}

#[test]
fn a_refused_save_shows_why() {
	let shelf = FakeShelf { kept: RefCell::new(None), refuses: Some("disk full".to_owned()) };
	let mut bench = Bench::with(FakeWindows::default(), shelf);

	bench.hear(MAIN_WINDOW, ChromeEvent::NewTab);

	assert_eq!(bench.ids(MAIN_WINDOW).len(), 2);
	assert_eq!(
		bench.state.failure.as_ref().and_then(|failure| failure.description.clone()),
		Some("disk full".to_owned())
	);
}

#[test]
fn the_next_gesture_clears_a_shown_failure() {
	let windows =
		FakeWindows { refuses_open: Some("no room".to_owned()), ..FakeWindows::default() };
	let mut bench = Bench::with(windows, FakeShelf::default());
	bench.act(State::new_window);

	bench.hear(MAIN_WINDOW, ChromeEvent::NewTab);

	assert_eq!(bench.state.failure, None);
}

fn loaded_app() -> App {
	let mut app = App::new();
	let (_, thread) =
		scenes::SCENES.iter().find(|(name, _)| *name == "thread").expect("the thread scene");
	thread(&mut app);
	app
}

fn heard_by(app: &mut App, event: ChromeEvent) {
	let (windows, shelf) = (FakeWindows::default(), FakeShelf::default());
	with_desk_on(app, &windows, &shelf, |state, desk| state.heard(MAIN_WINDOW, event, desk));
}

fn active_of(app: &App) -> String {
	app.surfaces
		.s01_chrome
		.tabs_of(MAIN_WINDOW)
		.map(|tabs| tabs.active().to_owned())
		.unwrap_or_default()
}

fn opened_in(app: &App) -> Option<&str> {
	app.thread.as_ref().map(|thread| thread.conversation_id.as_str())
}

#[test]
fn a_new_tab_is_selected_and_shows_no_conversation_until_one_is_picked() {
	let mut app = loaded_app();
	let first = active_of(&app);

	heard_by(&mut app, ChromeEvent::NewTab);

	let second = active_of(&app);
	let tabs = app.surfaces.s01_chrome.tabs_of(MAIN_WINDOW).expect("the main window tabs");
	assert_ne!(first, second);
	assert_eq!(tabs.tabs().len(), 2);
	assert!(app.navigation.main_route() == Route::Conversations);
	assert_eq!(opened_in(&app), None);
}

#[test]
fn selecting_a_tab_shows_the_conversation_or_surface_it_holds() {
	let mut app = loaded_app();
	let first = active_of(&app);
	let first_conversation = opened_in(&app).map(str::to_owned);
	s02_rail::railed(&mut app, RailMessage::SelectPanel(RailPanel::Library));
	heard_by(&mut app, ChromeEvent::NewTab);
	let second = active_of(&app);
	app.open("chat-atlas");

	heard_by(&mut app, ChromeEvent::SelectTab(first));
	let on_first = (app.navigation.main_route(), opened_in(&app).map(str::to_owned));
	heard_by(&mut app, ChromeEvent::SelectTab(second));

	assert!(first_conversation.is_some());
	assert!(on_first == (Route::Library, first_conversation));
	assert!(app.navigation.main_route() == Route::Conversations);
	assert_eq!(opened_in(&app), Some("chat-atlas"));
}
