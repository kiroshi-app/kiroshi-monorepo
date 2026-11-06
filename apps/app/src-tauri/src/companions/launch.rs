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
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::App;
	use tauri::Manager;

	use super::*;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	fn a_host() -> AppOfItsOwn {
		let app = an_app_of_its_own("companion-launch", mock_builder());
		crate::events::core(app.app_handle()).manage(LaunchOutcomeState::default());
		app
	}

	fn read_of(app: &App<MockRuntime>) -> LaunchOutcome {
		companion_launch_outcome(app.state())
	}

	fn shoto() -> CompanionCreated {
		CompanionCreated { id: "b1".to_owned(), name: "Shoto".to_owned() }
	}

	#[test]
	fn a_launch_that_planted_and_gathered_a_reason_answers_both() {
		let app = a_host();

		settle(
			crate::events::core(app.handle()),
			Some(shoto()),
			vec!["the system plugin was not laid down".to_owned()],
		);

		assert_eq!(
			read_of(&app),
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
		let app = a_host();
		settle(
			crate::events::core(app.handle()),
			Some(shoto()),
			vec!["the personal space is missing".to_owned()],
		);

		let first = read_of(&app);

		assert_eq!(read_of(&app), first, "a read emptied what the next one needed");
	}

	#[test]
	fn a_launch_that_gathered_several_reasons_answers_them_in_one() {
		let app = a_host();

		settle(
			crate::events::core(app.handle()),
			None,
			vec!["the first".to_owned(), "the second".to_owned()],
		);

		assert_eq!(
			read_of(&app).refused,
			Some(CompanionSeedRefused { reason: "the first; the second".to_owned() })
		);
	}

	#[test]
	fn a_launch_that_did_nothing_answers_nothing() {
		let app = a_host();

		settle(crate::events::core(app.handle()), None, Vec::new());

		assert_eq!(read_of(&app), LaunchOutcome::default());
	}
}
