use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Runtime, State, Webview, Window, WindowEvent};

use crate::agent::AgentState;
use crate::routines::runner::database;

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
	window: Option<String>,
}

#[derive(Default)]
pub struct MissionRunClaims(Mutex<HashMap<String, Claim>>);

impl MissionRunClaims {
	fn held(&self) -> MutexGuard<'_, HashMap<String, Claim>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn claim(&self, mission_id: String, window: &str) -> MissionRunClaim {
		let mut held = self.held();
		if held.get(&mission_id).is_some_and(|claim| claim.window.is_some()) {
			return MissionRunClaim::AlreadyRunning;
		}
		let token = uuid::Uuid::new_v4().to_string();
		held.insert(mission_id, Claim { token: token.clone(), window: Some(window.to_owned()) });
		MissionRunClaim::Claimed { token }
	}

	fn is_left_by_its_page(&self, mission_id: &str) -> bool {
		self.held().get(mission_id).is_some_and(|claim| claim.window.is_none())
	}

	fn release(&self, token: &str) {
		self.held().retain(|_, claim| claim.token != token);
	}

	fn forget_window(&self, window: &str) {
		for claim in self.held().values_mut() {
			if claim.window.as_deref() == Some(window) {
				claim.window = None;
			}
		}
	}
}

#[tauri::command]
#[specta::specta]
pub async fn mission_run_claim<R: Runtime>(
	app: AppHandle<R>,
	webview: Webview<R>,
	mission_id: String,
) -> MissionRunClaim {
	let claims = app.state::<MissionRunClaims>();
	if claims.is_left_by_its_page(&mission_id) && is_still_running(&app, &mission_id).await {
		return MissionRunClaim::AlreadyRunning;
	}
	claims.claim(mission_id, webview.window().label())
}

async fn is_still_running<R: Runtime>(app: &AppHandle<R>, mission_id: &str) -> bool {
	let Some(agent) = app.try_state::<AgentState>() else {
		return false;
	};
	let database = match database(app) {
		Ok(database) => database,
		Err(failure) => {
			log::warn!("mission {mission_id} keeps the claim its page left, the database is unready: {failure:?}");
			return true;
		}
	};
	match database.missions().held(mission_id.to_owned()).await {
		Ok(Some(mission)) => agent.thread_signs(&mission.thread_conversation_id).is_turn_running,
		Ok(None) => false,
		Err(failure) => {
			log::warn!("mission {mission_id} keeps the claim its page left, it could not be read: {failure:?}");
			true
		}
	}
}

#[tauri::command]
#[specta::specta]
pub fn mission_run_release(claims: State<'_, MissionRunClaims>, token: String) {
	claims.release(&token);
}

pub fn forget_on_page_event<R: Runtime>(window: &Window<R>, event: PageLoadEvent) {
	if event == PageLoadEvent::Started {
		forget(window);
	}
}

pub fn forget_on_destroyed<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
	if matches!(event, WindowEvent::Destroyed) {
		forget(window);
	}
}

fn forget<R: Runtime>(window: &Window<R>) {
	if let Some(claims) = window.try_state::<MissionRunClaims>() {
		claims.forget_window(window.label());
	}
}

#[cfg(test)]
mod tests {
	use std::sync::{Arc, Barrier};
	use std::thread;

	use serde_json::{json, Value};
	use tauri::ipc::CallbackFn;
	use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
	use tauri::webview::InvokeRequest;
	use tauri::{WebviewUrl, WebviewWindow, WebviewWindowBuilder};

	use super::*;
	use crate::agent::commands::a_run_held_by_the_app;
	use crate::agent::contract::{AgentEvent, RuntimeScope, TurnState};
	use crate::agent::reply_writer::TurnSink;
	use crate::db;
	use crate::test_app::an_app_of_its_own;

	fn token_of(claim: MissionRunClaim) -> String {
		match claim {
			MissionRunClaim::Claimed { token } => token,
			MissionRunClaim::AlreadyRunning => panic!("the mission was already running"),
		}
	}

	fn invoked(window: &WebviewWindow<MockRuntime>, command: &str, body: Value) -> Value {
		get_ipc_response(
			window,
			InvokeRequest {
				cmd: command.into(),
				callback: CallbackFn(0),
				error: CallbackFn(1),
				url: "tauri://localhost".parse().expect("a url"),
				body: body.into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		)
		.unwrap_or_else(|error| panic!("{command} was refused: {error:?}"))
		.deserialize::<Value>()
		.expect("the answer is JSON")
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
					claims.claim("m1".to_owned(), window)
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
		let token = token_of(claims.claim("m1".to_owned(), "main"));

		assert_eq!(claims.claim("m1".to_owned(), "main"), MissionRunClaim::AlreadyRunning);
		assert_eq!(claims.claim("m1".to_owned(), "second"), MissionRunClaim::AlreadyRunning);
		token_of(claims.claim("m2".to_owned(), "second"));

		claims.release(&token);

		token_of(claims.claim("m1".to_owned(), "second"));
	}

	#[test]
	fn a_foreign_token_leaves_the_live_claim_in_place() {
		let claims = MissionRunClaims::default();
		let token = token_of(claims.claim("m1".to_owned(), "main"));

		claims.release("not-the-live-claim");
		claims.release(&token);
		claims.release(&token);
		let next = token_of(claims.claim("m1".to_owned(), "main"));
		claims.release(&token);

		assert_eq!(claims.claim("m1".to_owned(), "main"), MissionRunClaim::AlreadyRunning);
		claims.release(&next);
		token_of(claims.claim("m1".to_owned(), "main"));
	}

	#[test]
	fn forgetting_a_window_frees_its_claims_and_keeps_the_others() {
		let claims = MissionRunClaims::default();
		token_of(claims.claim("m1".to_owned(), "second"));
		token_of(claims.claim("m2".to_owned(), "second"));
		token_of(claims.claim("m3".to_owned(), "main"));

		claims.forget_window("second");

		token_of(claims.claim("m1".to_owned(), "main"));
		token_of(claims.claim("m2".to_owned(), "main"));
		assert_eq!(claims.claim("m3".to_owned(), "second"), MissionRunClaim::AlreadyRunning);
	}

	#[test]
	fn a_claim_holds_the_calling_window_and_goes_when_that_window_is_destroyed() {
		let app = an_app_of_its_own(
			"mission-run-claims",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		app.manage(MissionRunClaims::default());
		let window_of = |label: &str| {
			WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
				.build()
				.expect("the window opens")
		};
		let (main, second) = (window_of("main"), window_of("second"));

		let claimed = invoked(&second, "mission_run_claim", json!({ "missionId": "m1" }));
		let refused = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));
		forget_on_destroyed(&second.as_ref().window(), &WindowEvent::Focused(false));
		let still_held = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));
		forget_on_destroyed(&second.as_ref().window(), &WindowEvent::Destroyed);
		let reclaimed = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));

		assert_eq!(claimed["kind"], "claimed", "the first claim answered {claimed}");
		assert!(claimed["token"].is_string(), "the claim carries no token: {claimed}");
		assert_eq!(refused, json!({ "kind": "alreadyRunning" }));
		assert_eq!(
			still_held,
			json!({ "kind": "alreadyRunning" }),
			"a focus change freed the claim"
		);
		assert_eq!(reclaimed["kind"], "claimed", "the destroyed window kept its claim");
	}

	const A_MISSION_IN_ITS_THREAD: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'Origin', 1, 1), ('c2', 'mission', 'Thread', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
		INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
			objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
			tools, opened_at)
			VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
				'https://kiroshi.test/tickets/42', 'Crash', '[]', 1);
	";

	fn the_turn_moves(run: &impl TurnSink, state: TurnState) {
		run.emit(AgentEvent::TurnChanged { state }, None);
	}

	#[test]
	fn a_reloaded_page_cannot_claim_again_a_mission_its_window_still_runs() {
		let app = an_app_of_its_own(
			"mission-run-claims-reload",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		app.manage(MissionRunClaims::default());
		app.manage(db::bootstrap(app.handle()));
		tauri::async_runtime::block_on(async {
			database(app.handle())
				.expect("the database opens")
				.call_mut(|connection| Ok(connection.execute_batch(A_MISSION_IN_ITS_THREAD)?))
				.await
				.expect("the mission is planted");
		});
		let thread = RuntimeScope {
			conversation_id: "c2".to_owned(),
			bot_id: "b1".to_owned(),
			runtime_session_id: "rs1".to_owned(),
			epoch: 1,
		};
		let run = a_run_held_by_the_app(app.handle(), thread);
		let main = WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::default())
			.build()
			.expect("the window opens");

		let claimed = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));
		the_turn_moves(&run, TurnState::Running);
		crate::forget_a_loading_page(&main.as_ref().window(), PageLoadEvent::Started);
		let while_running = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));
		the_turn_moves(&run, TurnState::Idle);
		let once_settled = invoked(&main, "mission_run_claim", json!({ "missionId": "m1" }));

		assert_eq!(claimed["kind"], "claimed", "the first claim answered {claimed}");
		assert_eq!(while_running, json!({ "kind": "alreadyRunning" }), "a second run was claimed");
		assert_eq!(once_settled["kind"], "claimed", "the settled mission stayed claimed");
	}
}
