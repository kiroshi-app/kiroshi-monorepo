use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;

use crate::core_context::{ClientId, ClientScoped, Core};

#[derive(Debug, PartialEq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MissionRunClaim {
	#[serde(rename_all = "camelCase")]
	Claimed {
		token: String,
	},
	AlreadyRunning,
}

struct Claim {
	token: String,
	client: ClientId,
}

#[derive(Default)]
pub struct MissionRunClaims(Mutex<HashMap<String, Claim>>);

impl MissionRunClaims {
	fn held(&self) -> MutexGuard<'_, HashMap<String, Claim>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn claim(&self, mission_id: String, client: &ClientId) -> MissionRunClaim {
		let mut held = self.held();
		let Entry::Vacant(free) = held.entry(mission_id) else {
			return MissionRunClaim::AlreadyRunning;
		};
		let token = uuid::Uuid::new_v4().to_string();
		free.insert(Claim { token: token.clone(), client: client.clone() });
		MissionRunClaim::Claimed { token }
	}

	fn release(&self, token: &str) {
		self.held().retain(|_, claim| claim.token != token);
	}

	fn forget_window(&self, client: &ClientId) {
		self.held().retain(|_, claim| claim.client != *client);
	}
}

impl ClientScoped for MissionRunClaims {
	fn forget_client(&self, _: &Core, client: &ClientId) {
		self.forget_window(client);
	}
}

pub fn mission_run_claim(core: &Core, client: &ClientId, mission_id: String) -> MissionRunClaim {
	let claims = core.state::<MissionRunClaims>();
	claims.claim(mission_id, client)
}

pub fn mission_run_release(core: &Core, token: String) {
	let claims = core.state::<MissionRunClaims>();
	claims.release(&token);
}

#[cfg(test)]
mod tests {
	use std::sync::{Arc, Barrier};
	use std::thread;

	use super::*;

	fn token_of(claim: MissionRunClaim) -> String {
		match claim {
			MissionRunClaim::Claimed { token } => token,
			MissionRunClaim::AlreadyRunning => panic!("the mission was already running"),
		}
	}

	#[test]
	fn two_racing_claims_on_one_mission_hand_it_to_exactly_one() {
		let claims = Arc::new(MissionRunClaims::default());
		let start = Arc::new(Barrier::new(2));
		let racers: Vec<_> = ["main", "second"]
			.into_iter()
			.map(|window| {
				let (claims, start) = (Arc::clone(&claims), Arc::clone(&start));
				thread::spawn(move || {
					start.wait();
					claims.claim("m1".to_owned(), &ClientId::new(window))
				})
			})
			.collect();
		let answers: Vec<_> =
			racers.into_iter().map(|racer| racer.join().expect("the racer ends")).collect();

		let claimed = answers
			.iter()
			.filter(|answer| matches!(answer, MissionRunClaim::Claimed { .. }))
			.count();
		assert_eq!(claimed, 1, "the race answered {answers:?}");
		assert!(answers.contains(&MissionRunClaim::AlreadyRunning), "nobody lost: {answers:?}");
	}

	#[test]
	fn a_live_claim_refuses_every_other_window_until_its_token_releases_it() {
		let claims = MissionRunClaims::default();
		let token = token_of(claims.claim("m1".to_owned(), &ClientId::new("main")));

		assert_eq!(
			claims.claim("m1".to_owned(), &ClientId::new("main")),
			MissionRunClaim::AlreadyRunning
		);
		assert_eq!(
			claims.claim("m1".to_owned(), &ClientId::new("second")),
			MissionRunClaim::AlreadyRunning
		);
		token_of(claims.claim("m2".to_owned(), &ClientId::new("second")));

		claims.release(&token);

		token_of(claims.claim("m1".to_owned(), &ClientId::new("second")));
	}

	#[test]
	fn a_foreign_token_leaves_the_live_claim_in_place() {
		let claims = MissionRunClaims::default();
		let token = token_of(claims.claim("m1".to_owned(), &ClientId::new("main")));

		claims.release("not-the-live-claim");
		claims.release(&token);
		claims.release(&token);
		let next = token_of(claims.claim("m1".to_owned(), &ClientId::new("main")));
		claims.release(&token);

		assert_eq!(
			claims.claim("m1".to_owned(), &ClientId::new("main")),
			MissionRunClaim::AlreadyRunning
		);
		claims.release(&next);
		token_of(claims.claim("m1".to_owned(), &ClientId::new("main")));
	}

	#[test]
	fn forgetting_a_window_frees_its_claims_and_keeps_the_others() {
		let claims = MissionRunClaims::default();
		token_of(claims.claim("m1".to_owned(), &ClientId::new("second")));
		token_of(claims.claim("m2".to_owned(), &ClientId::new("second")));
		token_of(claims.claim("m3".to_owned(), &ClientId::new("main")));

		claims.forget_window(&ClientId::new("second"));

		token_of(claims.claim("m1".to_owned(), &ClientId::new("main")));
		token_of(claims.claim("m2".to_owned(), &ClientId::new("main")));
		assert_eq!(
			claims.claim("m3".to_owned(), &ClientId::new("second")),
			MissionRunClaim::AlreadyRunning
		);
	}
}
