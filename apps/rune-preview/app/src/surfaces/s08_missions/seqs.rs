use std::collections::HashMap;

use kiroshi_core::missions::contract::Mission;

#[derive(Default)]
pub struct MissionSeqs {
	last_applied: HashMap<String, i64>,
}

impl MissionSeqs {
	pub fn admits_change(&mut self, mission_id: &str, state_seq: i64) -> bool {
		let is_newer = self.last_applied.get(mission_id).is_none_or(|last| state_seq > *last);
		if is_newer {
			self.hold(mission_id, state_seq);
		}
		is_newer
	}

	pub fn ordered(&mut self, read: Mission, held: Option<&Mission>) -> Mission {
		let is_behind = self.last_applied.get(&read.id).is_some_and(|last| read.state_seq < *last);
		match held {
			Some(held) if is_behind => held.clone(),
			_ if is_behind => read,
			_ => {
				self.hold(&read.id, read.state_seq);
				read
			}
		}
	}

	fn hold(&mut self, mission_id: &str, state_seq: i64) {
		self.last_applied.insert(mission_id.to_owned(), state_seq);
	}
}
