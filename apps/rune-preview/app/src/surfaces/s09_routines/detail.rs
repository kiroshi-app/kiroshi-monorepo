use kiroshi_core::routines::contract::{Refusal, RoutineRun, TriggerDecision};

use super::calls::{Call, RUN_PAGE};
use super::failure_text;
use crate::host::HostError;

#[derive(Clone, Debug, PartialEq)]
pub struct RunsRead {
	pub runs: Vec<RoutineRun>,
	pub read_at: i64,
	pub is_full_page: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Detail {
	pub routine_id: String,
	pub opened: u64,
	pub generation: u64,
	pub is_reading: bool,
	pub read: Option<RunsRead>,
	pub has_failed: bool,
	pub is_running: bool,
	pub refusal: Option<Refusal>,
}

impl Detail {
	pub fn opened(routine_id: String, opened: u64) -> Detail {
		Detail {
			routine_id,
			opened,
			generation: 0,
			is_reading: false,
			read: None,
			has_failed: false,
			is_running: false,
			refusal: None,
		}
	}

	pub fn read_runs(&mut self, generation: u64) -> Call {
		self.generation = generation;
		self.is_reading = true;
		Call::ReadRuns { generation, routine_id: self.routine_id.clone() }
	}

	pub fn runs_read(
		&mut self,
		generation: u64,
		runs: Result<Vec<RoutineRun>, HostError>,
		now: i64,
	) {
		if generation != self.generation {
			return;
		}
		self.is_reading = false;
		match runs {
			Ok(runs) => {
				let is_full_page = runs.len() >= RUN_PAGE;
				self.read = Some(RunsRead { runs, read_at: now, is_full_page });
				self.has_failed = false;
			}
			Err(failure) => {
				eprintln!(
					"the runs of {} were not read: {}",
					self.routine_id,
					failure_text(&failure)
				);
				self.has_failed = true;
			}
		}
	}

	pub fn run_now(&mut self) -> Option<Call> {
		if self.is_running {
			return None;
		}
		self.is_running = true;
		self.refusal = None;
		Some(Call::RunNow { opened: self.opened, routine_id: self.routine_id.clone() })
	}

	pub fn decided(&mut self, decision: Option<&TriggerDecision>) {
		self.is_running = false;
		self.refusal = match decision {
			Some(TriggerDecision::Refused { by }) => Some(*by),
			_ => None,
		};
	}
}
