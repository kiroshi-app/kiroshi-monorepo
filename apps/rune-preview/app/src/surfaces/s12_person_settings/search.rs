use std::time::Duration;

use kiroshi_core::search::contract::{Catalogue, CatalogueChat, MAX_QUERY_CHARS, MessageHit};
use kiroshi_rune_kit::surfaces::s12_person_settings::search::SearchTab;

use super::calls::{Call, Due, Found, Scope};
use crate::host::HostError;

pub const QUIET: Duration = Duration::from_millis(150);

#[derive(Clone, Debug, PartialEq)]
pub struct Read {
	pub messages: Vec<MessageHit>,
	pub catalogue: Catalogue,
}

impl Default for Read {
	fn default() -> Read {
		let catalogue = Catalogue { chats: Vec::new(), missions: Vec::new(), routines: Vec::new() };
		Read { messages: Vec::new(), catalogue }
	}
}

pub struct Search {
	pub space_id: String,
	pub tab: SearchTab,
	pub read: Read,
	pub recents: Vec<CatalogueChat>,
	pub has_failed: bool,
	query: String,
	generation: u64,
	asked: Option<u64>,
	landing: u64,
	active: usize,
	active_landing: u64,
}

fn is_over_limit(query: &str) -> bool {
	query.chars().count() > MAX_QUERY_CHARS
}

fn wrapped(index: isize, count: usize) -> usize {
	if count == 0 {
		return 0;
	}
	index.rem_euclid(count as isize) as usize
}

impl Search {
	pub fn opened(space_id: String) -> (Search, Option<Call>) {
		let mut search = Search {
			space_id,
			tab: SearchTab::All,
			read: Read::default(),
			recents: Vec::new(),
			has_failed: false,
			query: String::new(),
			generation: 0,
			asked: None,
			landing: 0,
			active: 0,
			active_landing: 0,
		};
		let call = search.asked_now();
		(search, call)
	}

	pub fn query(&self) -> &str {
		&self.query
	}

	pub fn is_loading(&self) -> bool {
		self.asked == Some(self.generation)
	}

	fn asked_now(&mut self) -> Option<Call> {
		if is_over_limit(&self.query) {
			return None;
		}
		self.asked = Some(self.generation);
		Some(Call::Search(Scope {
			generation: self.generation,
			space_id: self.space_id.clone(),
			query: self.query.clone(),
		}))
	}

	pub fn typed(&mut self, text: &str) -> Option<Call> {
		if text == self.query {
			return None;
		}
		self.query = text.to_owned();
		self.active = 0;
		self.generation += 1;
		if self.query.is_empty() {
			return self.asked_now();
		}
		Some(Call::Wake(QUIET, Due::Search(self.generation)))
	}

	pub fn quiet(&mut self, generation: u64) -> Option<Call> {
		if generation != self.generation {
			return None;
		}
		self.asked_now()
	}

	pub fn searched(
		&mut self,
		scope: &Scope,
		found: Result<Found, HostError>,
	) -> Option<HostError> {
		if scope.generation != self.generation {
			return None;
		}
		self.asked = None;
		match found {
			Ok(found) => {
				self.read = Read { messages: found.messages, catalogue: found.catalogue };
				if let Some(recents) = found.recents {
					self.recents = recents;
				}
				self.landing += 1;
				self.has_failed = false;
				None
			}
			Err(failure) => {
				self.has_failed = true;
				Some(failure)
			}
		}
	}

	pub fn set_tab(&mut self, tab: SearchTab) {
		self.tab = tab;
		self.active = 0;
	}

	pub fn active_index(&self) -> usize {
		if self.active_landing == self.landing { self.active } else { 0 }
	}

	pub fn moved(&mut self, by: isize, count: usize) {
		self.active = wrapped(self.active_index() as isize + by, count);
		self.active_landing = self.landing;
	}
}
