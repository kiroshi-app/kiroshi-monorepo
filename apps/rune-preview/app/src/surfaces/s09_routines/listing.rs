use kiroshi_core::routines::contract::{Routine, TriggerSource};

use super::calls::Listed;
use super::failure_text;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Held {
	pub routines: Vec<Routine>,
	pub known: Vec<(String, TriggerSource)>,
	pub offered: Vec<TriggerSource>,
	pub has_failed: bool,
}

impl Held {
	pub fn routine(&self, id: &str) -> Option<&Routine> {
		self.routines.iter().find(|routine| routine.id == id)
	}

	pub fn known_source(&self, bot_id: &str, source_id: &str) -> Option<&TriggerSource> {
		self.known
			.iter()
			.find(|(held_bot, source)| held_bot == bot_id && source.id == source_id)
			.map(|(_, source)| source)
	}

	pub fn trigger_title<'a>(&'a self, routine: &'a Routine) -> &'a str {
		self.known_source(&routine.bot_id, &routine.trigger_source_id)
			.map_or(routine.trigger_source_id.as_str(), |source| source.title.as_str())
	}

	pub fn hold(&mut self, written: Routine) {
		match self.routines.iter_mut().find(|routine| routine.id == written.id) {
			Some(routine) => *routine = written,
			None => self.routines.push(written),
		}
	}

	pub fn replace(&mut self, written: Routine) {
		if let Some(routine) = self.routines.iter_mut().find(|routine| routine.id == written.id) {
			*routine = written;
		}
	}

	pub fn remove(&mut self, id: &str) {
		self.routines.retain(|routine| routine.id != id);
	}
}

pub fn stopped_itself(routine: &Routine) -> bool {
	!routine.is_enabled && routine.consecutive_failures > 0
}

fn known_of(listed: &Listed) -> Vec<(String, TriggerSource)> {
	let mut known = Vec::new();
	for (bot_id, declared) in &listed.sources {
		match declared {
			Ok(sources) => {
				known.extend(sources.iter().map(|source| (bot_id.clone(), source.clone())))
			}
			Err(failure) => {
				eprintln!(
					"the trigger sources of {bot_id} were not read: {}",
					failure_text(failure)
				)
			}
		}
	}
	known
}

pub fn landed(previous: Option<Held>, listed: Listed, lead_bot_id: Option<&str>) -> Held {
	let lead = lead_bot_id
		.and_then(|lead| listed.sources.iter().find(|(bot_id, _)| bot_id == lead))
		.map(|(_, declared)| declared);
	let has_lead_failed = matches!(lead, Some(Err(_)));
	let offered = match lead {
		Some(Ok(sources)) => sources.clone(),
		_ => Vec::new(),
	};
	let known = known_of(&listed);
	match listed.routines {
		Err(failure) => {
			eprintln!("the routines were not read: {}", failure_text(&failure));
			Held { offered, has_failed: true, ..previous.unwrap_or_default() }
		}
		Ok(routines) => Held { routines, known, offered, has_failed: has_lead_failed },
	}
}
