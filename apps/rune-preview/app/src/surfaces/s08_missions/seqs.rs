use std::collections::HashMap;

use kiroshi_core::missions::contract::Mission;

#[derive(Default)]
pub struct MissionSeqs {
	last_applied: HashMap<String, i64>,
}

impl MissionSeqs {
	pub fn admits_change(&mut self, mission_id: &str, state_seq: i64) -> bool {
		if self.is_behind(mission_id, state_seq) {
			return false;
		}
		self.hold(mission_id, state_seq);
		true
	}

	pub fn ordered(&mut self, read: Mission, held: Option<&Mission>) -> Mission {
		if self.is_behind(&read.id, read.state_seq) {
			return held.cloned().unwrap_or(read);
		}
		self.hold(&read.id, read.state_seq);
		read
	}

	fn is_behind(&self, mission_id: &str, state_seq: i64) -> bool {
		self.last_applied.get(mission_id).is_some_and(|last| state_seq < *last)
	}

	fn hold(&mut self, mission_id: &str, state_seq: i64) {
		self.last_applied.insert(mission_id.to_owned(), state_seq);
	}
}
