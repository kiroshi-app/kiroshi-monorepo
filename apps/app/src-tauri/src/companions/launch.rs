use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use super::contract::{CompanionCreated, CompanionSeedRefused, LaunchOutcome};
use crate::events::{self, Event, COMPANION_CREATED, SEED_REFUSED};

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
pub fn companion_launch_outcome(state: State<'_, LaunchOutcomeState>) -> LaunchOutcome {
	state.read()
}

pub fn settle<R: Runtime>(
	app: &AppHandle<R>,
	created: Option<CompanionCreated>,
	reasons: Vec<String>,
) {
	let outcome = LaunchOutcome {
		created,
		refused: (!reasons.is_empty())
			.then(|| CompanionSeedRefused { reason: reasons.join(REASON_SEPARATOR) }),
	};
	match app.try_state::<LaunchOutcomeState>() {
		Some(state) => state.record(outcome.clone()),
		None => log::warn!(
			"the launch outcome was not kept for a later read: created={} refused={}",
			outcome.created.is_some(),
			outcome.refused.is_some()
		),
	}
	if let Some(created) = outcome.created {
		announce(app, COMPANION_CREATED, created);
	}
	if let Some(refused) = outcome.refused {
		announce(app, SEED_REFUSED, refused);
	}
}

pub(crate) fn announce<R: Runtime, P: Serialize + Clone>(
	app: &AppHandle<R>,
	event: Event<P>,
	payload: P,
) {
	if let Err(failure) = events::emit(app, event, payload.clone()) {
		log::warn!("{} was not announced: {failure}", event.name());
	}
}

#[cfg(test)]
mod tests {
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::App;

	use super::*;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	fn a_host() -> AppOfItsOwn {
		let app = an_app_of_its_own("companion-launch", mock_builder());
		app.manage(LaunchOutcomeState::default());
		app
	}

	fn read_of(app: &App<MockRuntime>) -> LaunchOutcome {
		companion_launch_outcome(app.state::<LaunchOutcomeState>())
	}

	fn shoto() -> CompanionCreated {
		CompanionCreated { id: "b1".to_owned(), name: "Shoto".to_owned() }
	}

	#[test]
	fn a_launch_that_planted_and_gathered_a_reason_answers_both() {
		let app = a_host();

		settle(app.handle(), Some(shoto()), vec!["the system plugin was not laid down".to_owned()]);

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
		settle(app.handle(), Some(shoto()), vec!["the personal space is missing".to_owned()]);

		let first = read_of(&app);

		assert_eq!(read_of(&app), first, "a read emptied what the next one needed");
	}

	#[test]
	fn a_launch_that_gathered_several_reasons_answers_them_in_one() {
		let app = a_host();

		settle(app.handle(), None, vec!["the first".to_owned(), "the second".to_owned()]);

		assert_eq!(
			read_of(&app).refused,
			Some(CompanionSeedRefused { reason: "the first; the second".to_owned() })
		);
	}

	#[test]
	fn a_launch_that_did_nothing_answers_nothing() {
		let app = a_host();

		settle(app.handle(), None, Vec::new());

		assert_eq!(read_of(&app), LaunchOutcome::default());
	}
}
