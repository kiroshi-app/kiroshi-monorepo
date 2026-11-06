use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::State;

use super::contract::{CompanionCreated, CompanionSeedRefused, LaunchOutcome};
use crate::events::{Event, COMPANION_CREATED, SEED_REFUSED};

const REASON_SEPARATOR: &str = "; ";

#[derive(Debug, Default)]
pub struct LaunchOutcomeState(Mutex<LaunchOutcome>);

impl LaunchOutcomeState {
	pub fn read(&self) -> LaunchOutcome {
		self.0.lock().unwrap_or_else(PoisonError::into_inner).clone()
	}

	fn record(&self, outcome: LaunchOutcome) {
		*self.0.lock().unwrap_or_else(PoisonError::into_inner) = outcome;
	}
}

#[tauri::command]
#[specta::specta]
pub fn companion_launch_outcome(core: State<'_, crate::core_context::Core>) -> LaunchOutcome {
	launch_outcome(core.inner())
}

pub fn launch_outcome(core: &crate::core_context::Core) -> LaunchOutcome {
	core.state::<LaunchOutcomeState>().read()
}

pub fn settle(
	core: &crate::core_context::Core,
	created: Option<CompanionCreated>,
	reasons: Vec<String>,
) {
	let outcome = LaunchOutcome {
		created,
		refused: (!reasons.is_empty())
			.then(|| CompanionSeedRefused { reason: reasons.join(REASON_SEPARATOR) }),
	};
	match core.try_state::<LaunchOutcomeState>() {
		Some(state) => state.record(outcome.clone()),
		None => log::warn!(
			"the launch outcome was not kept for a later read: created={} refused={}",
			outcome.created.is_some(),
			outcome.refused.is_some()
		),
	}
	if let Some(created) = outcome.created {
		announce(core, COMPANION_CREATED, created);
	}
	if let Some(refused) = outcome.refused {
		announce(core, SEED_REFUSED, refused);
	}
}

pub(crate) fn announce<P: Serialize + Clone>(
	core: &crate::core_context::Core,
	event: Event<P>,
	payload: P,
) {
	if let Err(failure) = core.emit(event, payload.clone()) {
		log::warn!("{} was not announced: {failure}", event.name());
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::test_core::{a_core_of_its_own, CoreOfItsOwn};

	fn a_host() -> CoreOfItsOwn {
		let core = a_core_of_its_own("companion-launch");
		core.manage(LaunchOutcomeState::default());
		core
	}

	fn read_of(core: &CoreOfItsOwn) -> LaunchOutcome {
		launch_outcome(core)
	}

	fn shoto() -> CompanionCreated {
		CompanionCreated { id: "b1".to_owned(), name: "Shoto".to_owned() }
	}

	#[test]
	fn a_launch_that_planted_and_gathered_a_reason_answers_both() {
		let core = a_host();

		settle(&core, Some(shoto()), vec!["the system plugin was not laid down".to_owned()]);

		assert_eq!(
			read_of(&core),
			LaunchOutcome {
				created: Some(shoto()),
				refused: Some(CompanionSeedRefused {
					reason: "the system plugin was not laid down".to_owned()
				}),
			}
		);
	}

	#[test]
	fn the_outcome_answers_the_same_to_every_read() {
		let core = a_host();
		settle(&core, Some(shoto()), vec!["the personal space is missing".to_owned()]);

		let first = read_of(&core);

		assert_eq!(read_of(&core), first, "a read emptied what the next one needed");
	}

	#[test]
	fn a_launch_that_gathered_several_reasons_answers_them_in_one() {
		let core = a_host();

		settle(&core, None, vec!["the first".to_owned(), "the second".to_owned()]);

		assert_eq!(
			read_of(&core).refused,
			Some(CompanionSeedRefused { reason: "the first; the second".to_owned() })
		);
	}

	#[test]
	fn a_launch_that_did_nothing_answers_nothing() {
		let core = a_host();

		settle(&core, None, Vec::new());

		assert_eq!(read_of(&core), LaunchOutcome::default());
	}
}
