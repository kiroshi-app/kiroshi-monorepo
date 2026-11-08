use serde::{Deserialize, Serialize};

const MAX_CLOSED_TABS: usize = 10;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tab {
	pub id: String,
	pub is_pinned: bool,
}

impl Tab {
	pub fn fresh() -> Tab {
		Tab { id: uuid::Uuid::new_v4().to_string(), is_pinned: false }
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ClosedTab {
	position: usize,
	tab: Tab,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeptTabs {
	tabs: Vec<Tab>,
	active: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tabs {
	tabs: Vec<Tab>,
	active: String,
	closed: Vec<ClosedTab>,
}

impl Default for Tabs {
	fn default() -> Tabs {
		Tabs::holding(Tab::fresh())
	}
}

impl Tabs {
	pub fn holding(tab: Tab) -> Tabs {
		Tabs { active: tab.id.clone(), tabs: vec![tab], closed: Vec::new() }
	}

	pub fn restored(kept: KeptTabs) -> Option<Tabs> {
		let is_whole = kept.tabs.iter().any(|tab| tab.id == kept.active)
			&& kept
				.tabs
				.iter()
				.enumerate()
				.all(|(at, tab)| kept.tabs[..at].iter().all(|before| before.id != tab.id));
		is_whole.then(|| Tabs {
			tabs: with_pinned_first(kept.tabs),
			active: kept.active,
			closed: Vec::new(),
		})
	}

	pub fn kept(&self) -> KeptTabs {
		KeptTabs { tabs: self.tabs.clone(), active: self.active.clone() }
	}

	pub fn tabs(&self) -> &[Tab] {
		&self.tabs
	}

	pub fn active(&self) -> &str {
		&self.active
	}

	pub fn tab(&self, id: &str) -> Option<&Tab> {
		self.tabs.iter().find(|tab| tab.id == id)
	}

	pub fn has_closed_tab(&self) -> bool {
		!self.closed.is_empty()
	}

	pub fn is_only_tab(&self, id: &str) -> bool {
		self.tabs.len() == 1 && self.tabs[0].id == id
	}

	pub fn closes_every_tab(&self, id: &str) -> bool {
		self.is_only_tab(id) && !self.tabs[0].is_pinned
	}

	fn position(&self, id: &str) -> Option<usize> {
		self.tabs.iter().position(|tab| tab.id == id)
	}

	pub fn select(&mut self, id: &str) {
		if self.position(id).is_some() {
			self.active = id.to_owned();
		}
	}

	fn insert_at(&mut self, position: usize, tab: Tab) {
		let mut tabs = std::mem::take(&mut self.tabs);
		tabs.insert(position.min(tabs.len()), tab);
		self.tabs = with_pinned_first(tabs);
	}

	pub fn open_empty(&mut self) -> String {
		let tab = Tab::fresh();
		let id = tab.id.clone();
		let after_active = self.position(&self.active).map_or(self.tabs.len(), |at| at + 1);
		self.insert_at(after_active, tab);
		self.active = id.clone();
		id
	}

	pub fn duplicate(&mut self, id: &str) {
		let Some(position) = self.position(id) else { return };
		let copy = Tab { is_pinned: self.tabs[position].is_pinned, ..Tab::fresh() };
		self.insert_at(position + 1, copy);
	}

	pub fn close(&mut self, id: &str) {
		let Some(position) = self.position(id) else { return };
		if self.tabs[position].is_pinned {
			return;
		}
		let closed = self.removed(position);
		self.keep_closed(vec![closed]);
	}

	pub fn close_active(&mut self) {
		let active = self.active.clone();
		self.close(&active);
	}

	pub fn remove_moved(&mut self, id: &str) {
		if let Some(position) = self.position(id) {
			self.removed(position);
		}
	}

	fn removed(&mut self, position: usize) -> ClosedTab {
		let tab = self.tabs.remove(position);
		if self.tabs.is_empty() {
			self.tabs.push(Tab::fresh());
		}
		if self.active == tab.id {
			let neighbour = position.min(self.tabs.len() - 1);
			self.active = self.tabs[neighbour].id.clone();
		}
		ClosedTab { position, tab }
	}

	pub fn close_others(&mut self, id: &str) {
		if self.position(id).is_none() {
			return;
		}
		let closed = self
			.tabs
			.iter()
			.enumerate()
			.filter(|(_, tab)| !tab.is_pinned && tab.id != id)
			.map(|(position, tab)| ClosedTab { position, tab: tab.clone() })
			.rev()
			.collect();
		self.tabs.retain(|tab| tab.is_pinned || tab.id == id);
		self.active = id.to_owned();
		self.keep_closed(closed);
	}

	fn keep_closed(&mut self, closed: Vec<ClosedTab>) {
		self.closed.extend(closed);
		let overflow = self.closed.len().saturating_sub(MAX_CLOSED_TABS);
		self.closed.drain(..overflow);
	}

	pub fn reopen(&mut self) {
		let Some(ClosedTab { position, tab }) = self.closed.pop() else { return };
		let id = tab.id.clone();
		self.insert_at(position, tab);
		self.active = id;
	}

	pub fn receive(&mut self, tab: Tab, position: usize) {
		let id = tab.id.clone();
		self.insert_at(position, tab);
		self.active = id;
	}

	pub fn reorder(&mut self, ids: &[String]) {
		let rank = |tab: &Tab| ids.iter().position(|id| *id == tab.id).unwrap_or(ids.len());
		let mut tabs = std::mem::take(&mut self.tabs);
		tabs.sort_by_key(rank);
		self.tabs = with_pinned_first(tabs);
	}

	pub fn pin(&mut self, id: &str) {
		self.set_pin(id, true);
	}

	pub fn unpin(&mut self, id: &str) {
		self.set_pin(id, false);
	}

	fn set_pin(&mut self, id: &str, is_pinned: bool) {
		let tabs = std::mem::take(&mut self.tabs);
		self.tabs = with_pinned_first(
			tabs.into_iter()
				.map(|tab| if tab.id == id { Tab { is_pinned, ..tab } } else { tab })
				.collect(),
		);
	}
}

fn with_pinned_first(tabs: Vec<Tab>) -> Vec<Tab> {
	let (mut pinned, unpinned): (Vec<Tab>, Vec<Tab>) =
		tabs.into_iter().partition(|tab| tab.is_pinned);
	pinned.extend(unpinned);
	pinned
}

#[cfg(test)]
mod tests {
	use super::*;

	fn tab(id: &str) -> Tab {
		Tab { id: id.to_owned(), is_pinned: false }
	}

	fn tabs_of(ids: &[&str], active: &str) -> Tabs {
		Tabs::restored(KeptTabs {
			tabs: ids.iter().map(|id| tab(id)).collect(),
			active: active.to_owned(),
		})
		.expect("the kept tabs are whole")
	}

	fn ids(tabs: &Tabs) -> Vec<&str> {
		tabs.tabs().iter().map(|tab| tab.id.as_str()).collect()
	}

	#[test]
	fn a_new_tab_opens_right_after_the_active_tab_and_takes_focus() {
		let mut tabs = tabs_of(&["a", "b", "c"], "a");

		let opened = tabs.open_empty();

		assert_eq!(ids(&tabs), ["a", opened.as_str(), "b", "c"]);
		assert_eq!(tabs.active(), opened);
	}

	#[test]
	fn closing_the_active_tab_focuses_the_tab_that_slides_into_its_place() {
		let mut tabs = tabs_of(&["a", "b", "c"], "b");

		tabs.close("b");

		assert_eq!(ids(&tabs), ["a", "c"]);
		assert_eq!(tabs.active(), "c");
	}

	#[test]
	fn closing_the_last_active_tab_focuses_the_one_before_it() {
		let mut tabs = tabs_of(&["a", "b", "c"], "c");

		tabs.close("c");

		assert_eq!(tabs.active(), "b");
	}

	#[test]
	fn closing_a_background_tab_keeps_the_focus() {
		let mut tabs = tabs_of(&["a", "b", "c"], "a");

		tabs.close("b");

		assert_eq!(ids(&tabs), ["a", "c"]);
		assert_eq!(tabs.active(), "a");
	}

	#[test]
	fn closing_the_only_tab_leaves_a_fresh_focused_tab() {
		let mut tabs = tabs_of(&["a"], "a");

		tabs.close("a");

		assert_eq!(tabs.tabs().len(), 1);
		assert_ne!(tabs.active(), "a");
		assert_eq!(tabs.active(), tabs.tabs()[0].id);
	}

	#[test]
	fn a_pinned_tab_does_not_close() {
		let mut tabs = tabs_of(&["a", "b"], "a");
		tabs.pin("a");
		let before = tabs.clone();

		tabs.close_active();

		assert_eq!(tabs, before);
	}

	#[test]
	fn reopen_restores_the_last_closed_tab_at_its_former_position_and_focuses_it() {
		let mut tabs = tabs_of(&["a", "b", "c"], "a");
		tabs.close("b");

		tabs.reopen();

		assert_eq!(ids(&tabs), ["a", "b", "c"]);
		assert_eq!(tabs.active(), "b");
		assert!(!tabs.has_closed_tab());
	}

	#[test]
	fn reopen_walks_back_through_closed_tabs_newest_first() {
		let mut tabs = tabs_of(&["a", "b", "c", "d"], "a");
		tabs.close("b");
		tabs.close("d");

		tabs.reopen();
		assert_eq!(ids(&tabs), ["a", "c", "d"]);
		tabs.reopen();
		assert_eq!(ids(&tabs), ["a", "b", "c", "d"]);
	}

	#[test]
	fn reopen_with_nothing_closed_changes_nothing() {
		let mut tabs = tabs_of(&["a", "b"], "b");
		let before = tabs.clone();

		tabs.reopen();

		assert_eq!(tabs, before);
	}

	#[test]
	fn only_the_ten_latest_closed_tabs_can_be_reopened() {
		let mut tabs = tabs_of(&["keep"], "keep");
		let opened: Vec<String> = (0..12).map(|_| tabs.open_empty()).collect();
		opened.iter().for_each(|id| tabs.close(id));

		(0..12).for_each(|_| tabs.reopen());

		assert_eq!(tabs.tabs().len(), 11);
		assert!(tabs.tab(&opened[0]).is_none());
		assert!(tabs.tab(&opened[1]).is_none());
	}

	#[test]
	fn close_others_keeps_the_pinned_tabs_and_the_chosen_one_and_reopens_them_in_place() {
		let mut tabs = tabs_of(&["a", "b", "c", "d"], "a");
		tabs.pin("a");

		tabs.close_others("c");
		assert_eq!(ids(&tabs), ["a", "c"]);
		assert_eq!(tabs.active(), "c");

		tabs.reopen();
		tabs.reopen();
		assert_eq!(ids(&tabs), ["a", "b", "c", "d"]);
	}

	#[test]
	fn reorder_follows_the_given_ids_with_pinned_tabs_first() {
		let mut tabs = tabs_of(&["a", "b", "c"], "a");
		tabs.pin("c");

		tabs.reorder(&["b".to_owned(), "a".to_owned(), "c".to_owned()]);

		assert_eq!(ids(&tabs), ["c", "b", "a"]);
		assert_eq!(tabs.active(), "a");
	}

	#[test]
	fn pinning_moves_the_tab_among_the_pinned_and_unpinning_leaves_it_first_of_the_rest() {
		let mut tabs = tabs_of(&["a", "b", "c", "d"], "a");
		tabs.pin("a");

		tabs.pin("d");
		assert_eq!(ids(&tabs), ["a", "d", "b", "c"]);
		tabs.unpin("a");
		assert_eq!(ids(&tabs), ["d", "a", "b", "c"]);
	}

	#[test]
	fn duplicate_adds_a_new_tab_right_after_the_original_without_focusing_it() {
		let mut tabs = tabs_of(&["a", "b"], "b");
		tabs.pin("a");

		tabs.duplicate("a");

		assert_eq!(tabs.tabs().len(), 3);
		assert_eq!(tabs.tabs()[0].id, "a");
		assert!(tabs.tabs()[1].is_pinned);
		assert_ne!(tabs.tabs()[1].id, "a");
		assert_eq!(tabs.active(), "b");
	}

	#[test]
	fn a_moved_tab_leaves_no_closed_tab_to_reopen() {
		let mut tabs = tabs_of(&["a", "b"], "a");

		tabs.remove_moved("a");

		assert_eq!(ids(&tabs), ["b"]);
		assert_eq!(tabs.active(), "b");
		assert!(!tabs.has_closed_tab());
	}

	#[test]
	fn a_received_tab_lands_at_its_slot_and_takes_focus() {
		let mut tabs = tabs_of(&["a", "b"], "a");

		tabs.receive(tab("x"), 1);

		assert_eq!(ids(&tabs), ["a", "x", "b"]);
		assert_eq!(tabs.active(), "x");
	}

	#[test]
	fn kept_tabs_restore_as_they_were_and_broken_ones_are_refused() {
		let tabs = tabs_of(&["a", "b"], "b");

		assert_eq!(Tabs::restored(tabs.kept()), Some(tabs));
		assert_eq!(
			Tabs::restored(KeptTabs { tabs: vec![tab("a")], active: "gone".to_owned() }),
			None
		);
		assert_eq!(
			Tabs::restored(KeptTabs { tabs: vec![tab("a"), tab("a")], active: "a".to_owned() }),
			None
		);
	}
}
