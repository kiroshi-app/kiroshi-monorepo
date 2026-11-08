use std::collections::HashMap;

use crate::surfaces::s04_boot::Step;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Route {
	Onboarding(Step),
	Conversations,
	BlockSpike,
	Roster,
	Boot,
	Thread,
	Composer,
	Approvals,
	Missions,
	Routines,
	AgentSettings,
	Applications,
	PersonSettings,
	SpaceSettings,
	Library,
	Boards,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowId(u32);

pub const MAIN_WINDOW: WindowId = WindowId(0);

#[derive(Debug, PartialEq, Eq)]
pub enum NavigationError {
	NotOpen(WindowId),
	MainWindowStaysOpen,
}

#[derive(Clone, PartialEq)]
pub struct Window {
	pub id: WindowId,
	pub route: Route,
}

#[derive(Clone, PartialEq)]
struct TabPage {
	route: Route,
	conversation_id: Option<String>,
}

#[derive(Clone, PartialEq)]
pub struct Navigation {
	main: Route,
	secondary: Vec<Window>,
	next_id: u32,
	left_tabs: HashMap<String, TabPage>,
}

impl Navigation {
	pub fn new(main: Route) -> Navigation {
		Navigation {
			main,
			secondary: Vec::new(),
			next_id: MAIN_WINDOW.0 + 1,
			left_tabs: HashMap::new(),
		}
	}

	pub fn switch_tab(
		&mut self,
		leaving: &str,
		held_conversation: Option<String>,
		entering: &str,
	) -> Option<String> {
		let left = TabPage { route: self.main, conversation_id: held_conversation };
		self.left_tabs.insert(leaving.to_owned(), left);
		let entered = self.left_tabs.remove(entering);
		self.main = entered.as_ref().map_or(Route::Conversations, |page| page.route);
		entered.and_then(|page| page.conversation_id)
	}

	pub fn main_route(&self) -> Route {
		self.main
	}

	pub fn navigate_main(&mut self, route: Route) {
		self.main = route;
	}

	pub fn open(&mut self, route: Route) -> WindowId {
		let id = WindowId(self.next_id);
		self.next_id += 1;
		self.secondary.push(Window { id, route });
		id
	}

	pub fn navigate(&mut self, id: WindowId, route: Route) -> Result<(), NavigationError> {
		if id == MAIN_WINDOW {
			self.navigate_main(route);
			return Ok(());
		}
		let window = self
			.secondary
			.iter_mut()
			.find(|window| window.id == id)
			.ok_or(NavigationError::NotOpen(id))?;
		window.route = route;
		Ok(())
	}

	pub fn close(&mut self, id: WindowId) -> Result<(), NavigationError> {
		if id == MAIN_WINDOW {
			return Err(NavigationError::MainWindowStaysOpen);
		}
		let at = self
			.secondary
			.iter()
			.position(|window| window.id == id)
			.ok_or(NavigationError::NotOpen(id))?;
		self.secondary.remove(at);
		Ok(())
	}

	pub fn windows(&self) -> impl Iterator<Item = Window> + '_ {
		let main = Window { id: MAIN_WINDOW, route: self.main };
		std::iter::once(main).chain(self.secondary.iter().cloned())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn routes_of(navigation: &Navigation) -> Vec<(WindowId, Route)> {
		navigation.windows().map(|window| (window.id, window.route)).collect()
	}

	#[test]
	fn a_new_navigation_holds_only_the_main_window_on_its_route() {
		let navigation = Navigation::new(Route::Conversations);

		assert!(routes_of(&navigation) == vec![(MAIN_WINDOW, Route::Conversations)]);
	}

	#[test]
	fn open_adds_a_window_on_its_route_under_a_new_id() {
		let mut navigation = Navigation::new(Route::Conversations);

		let settings = navigation.open(Route::AgentSettings);
		let library = navigation.open(Route::Library);

		assert_ne!(settings, MAIN_WINDOW);
		assert_ne!(settings, library);
		assert!(
			routes_of(&navigation)
				== vec![
					(MAIN_WINDOW, Route::Conversations),
					(settings, Route::AgentSettings),
					(library, Route::Library),
				]
		);
	}

	#[test]
	fn a_closed_window_id_is_never_given_again() {
		let mut navigation = Navigation::new(Route::Conversations);
		let first = navigation.open(Route::Boards);
		navigation.close(first).expect("the window is open");

		let second = navigation.open(Route::Boards);

		assert_ne!(first, second);
	}

	#[test]
	fn navigate_changes_the_route_of_that_window_only() {
		let mut navigation = Navigation::new(Route::Conversations);
		let settings = navigation.open(Route::AgentSettings);
		let library = navigation.open(Route::Library);

		navigation.navigate(settings, Route::Applications).expect("the window is open");

		assert!(
			routes_of(&navigation)
				== vec![
					(MAIN_WINDOW, Route::Conversations),
					(settings, Route::Applications),
					(library, Route::Library),
				]
		);
	}

	#[test]
	fn navigate_on_the_main_window_changes_the_main_route() {
		let mut navigation = Navigation::new(Route::Onboarding(Step::first()));

		navigation.navigate(MAIN_WINDOW, Route::Conversations).expect("the main window is open");

		assert!(navigation.main_route() == Route::Conversations);
	}

	#[test]
	fn navigate_main_changes_the_main_route() {
		let mut navigation = Navigation::new(Route::Onboarding(Step::first()));

		navigation.navigate_main(Route::Conversations);

		assert!(navigation.main_route() == Route::Conversations);
	}

	#[test]
	fn close_removes_that_window_only() {
		let mut navigation = Navigation::new(Route::Conversations);
		let settings = navigation.open(Route::AgentSettings);
		let library = navigation.open(Route::Library);

		navigation.close(settings).expect("the window is open");

		assert!(
			routes_of(&navigation)
				== vec![(MAIN_WINDOW, Route::Conversations), (library, Route::Library)]
		);
	}

	#[test]
	fn navigate_to_a_window_that_is_not_open_fails_and_changes_nothing() {
		let mut navigation = Navigation::new(Route::Conversations);
		let closed = navigation.open(Route::Missions);
		navigation.close(closed).expect("the window is open");
		let before = navigation.clone();

		let navigated = navigation.navigate(closed, Route::Routines);

		assert_eq!(navigated, Err(NavigationError::NotOpen(closed)));
		assert!(navigation == before);
	}

	#[test]
	fn close_on_a_window_that_is_not_open_fails_and_changes_nothing() {
		let mut navigation = Navigation::new(Route::Conversations);
		let closed = navigation.open(Route::Missions);
		navigation.close(closed).expect("the window is open");
		let before = navigation.clone();

		let closed_again = navigation.close(closed);

		assert_eq!(closed_again, Err(NavigationError::NotOpen(closed)));
		assert!(navigation == before);
	}

	#[test]
	fn a_new_tab_enters_on_conversations_with_no_conversation() {
		let mut navigation = Navigation::new(Route::Library);

		let entered = navigation.switch_tab("first", Some("c-1".to_owned()), "second");

		assert_eq!(entered, None);
		assert!(navigation.main_route() == Route::Conversations);
	}

	#[test]
	fn a_tab_entered_again_gets_back_the_page_it_left() {
		let mut navigation = Navigation::new(Route::Library);
		navigation.switch_tab("first", Some("c-1".to_owned()), "second");
		navigation.navigate_main(Route::SpaceSettings);

		let entered = navigation.switch_tab("second", None, "first");

		assert_eq!(entered.as_deref(), Some("c-1"));
		assert!(navigation.main_route() == Route::Library);
		assert_eq!(navigation.switch_tab("first", None, "second"), None);
		assert!(navigation.main_route() == Route::SpaceSettings);
	}

	#[test]
	fn the_main_window_cannot_be_closed() {
		let mut navigation = Navigation::new(Route::Conversations);
		let before = navigation.clone();

		let closed = navigation.close(MAIN_WINDOW);

		assert_eq!(closed, Err(NavigationError::MainWindowStaysOpen));
		assert!(navigation == before);
	}
}
