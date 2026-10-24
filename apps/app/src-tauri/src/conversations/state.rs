use std::collections::HashSet;

use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::Mutex;

use super::contract::{
	state_in, ConversationState, ConversationStateChanged, States, TranscriptStoreError,
};
use crate::db;
use crate::db::repositories::conversations::Activity;
use crate::events::{self, CONVERSATION_STATE_CHANGED};
use crate::missions::contract::Mission;

#[derive(Default)]
struct Observed(Mutex<States>);

pub(crate) async fn listed<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	ids: Vec<String>,
) -> Result<States, TranscriptStoreError> {
	let states = states_of(database, ids).await?;
	let held = observed(app);
	let mut observed = held.0.lock().await;
	for (id, state) in &states {
		observed.entry(id.clone()).or_insert(*state);
	}
	Ok(states)
}

pub(crate) async fn observe<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: &str,
) -> Result<ConversationState, TranscriptStoreError> {
	let held = observed(app);
	let mut observed = held.0.lock().await;
	let activity = database.conversations().activity_of(vec![conversation_id.to_owned()]).await?;
	let Some(activity) = activity.into_iter().next() else {
		return Err(TranscriptStoreError::UnknownConversation { id: conversation_id.to_owned() });
	};
	let state = ranked(&activity, &origins_needing_you(database).await?);
	if state_in(&observed, conversation_id) == state {
		return Ok(state);
	}
	let changed = ConversationStateChanged {
		conversation_id: activity.conversation_id,
		space_id: activity.space_id,
		state,
	};
	match events::emit(app, CONVERSATION_STATE_CHANGED, changed) {
		Ok(()) => {
			observed.insert(conversation_id.to_owned(), state);
		}
		Err(failure) => {
			log::warn!("the state of conversation {conversation_id} was not announced: {failure}")
		}
	}
	Ok(state)
}

pub(crate) async fn observe_reporting<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: &str,
) {
	if let Err(failure) = observe(app, database, conversation_id).await {
		log::warn!("the state of conversation {conversation_id} did not read: {failure:?}");
	}
}

pub(crate) fn observe_later<R: Runtime>(app: &AppHandle<R>, conversation_id: String) {
	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		let Some(database) = app.try_state::<db::DatabaseState>() else {
			return log::warn!("the state of conversation {conversation_id} has no database");
		};
		match database.inner() {
			Ok(database) => observe_reporting(&app, database, &conversation_id).await,
			Err(failure) => {
				log::warn!("the state of conversation {conversation_id} did not read: {failure:?}")
			}
		}
	});
}

async fn states_of(
	database: &db::Database,
	ids: Vec<String>,
) -> Result<States, TranscriptStoreError> {
	let activities = database.conversations().activity_of(ids).await?;
	let needing_you = origins_needing_you(database).await?;
	Ok(activities
		.iter()
		.map(|activity| (activity.conversation_id.clone(), ranked(activity, &needing_you)))
		.collect())
}

async fn origins_needing_you(
	database: &db::Database,
) -> Result<HashSet<String>, TranscriptStoreError> {
	let open = database.missions().still_open().await?;
	Ok(open
		.into_iter()
		.filter(Mission::needs_you)
		.map(|mission| mission.origin_conversation_id)
		.collect())
}

fn ranked(activity: &Activity, origins_needing_you: &HashSet<String>) -> ConversationState {
	if activity.has_pending_prompt || origins_needing_you.contains(&activity.conversation_id) {
		return ConversationState::NeedsYou;
	}
	if activity.has_open_turn {
		return ConversationState::Working;
	}
	ConversationState::Idle
}

fn observed<R: Runtime>(app: &AppHandle<R>) -> State<'_, Observed> {
	if app.try_state::<Observed>().is_none() {
		app.manage(Observed::default());
	}
	app.state::<Observed>()
}

#[cfg(test)]
mod tests {
	use std::sync::{Arc, Mutex as Held};

	use serde_json::Value;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener};

	use super::*;
	use crate::conversations::commands::ready;
	use crate::conversations::commands::{
		conversation_delete, conversation_list, conversation_page,
	};
	use crate::conversations::contract::STATE_CHANGED_EVENT;
	use crate::db::repositories::conversations::{a_pending_prompt, PromptKind};
	use crate::db::repositories::messages::NewTurn;
	use crate::missions::contract::{
		MissionDraft, MissionEntry, MissionEventKind, MissionNote, Ticket,
	};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const ONE_SEATED_ROOM: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, space_id, kind, title, created_at, updated_at)
			VALUES ('c1', 'personal', 'topic', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("conversation-state-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		database(&app)
			.call_mut(|connection| Ok(connection.execute_batch(ONE_SEATED_ROOM)?))
			.await
			.expect("the room is planted");
		app
	}

	fn database(app: &App<MockRuntime>) -> &db::Database {
		ready(app.state::<db::DatabaseState>().inner()).expect("the database opens")
	}

	async fn listed_state(
		app: &App<MockRuntime>,
	) -> Result<ConversationState, TranscriptStoreError> {
		let rows =
			conversation_list(app.handle().clone(), app.state(), "personal".to_owned()).await?;
		let row = rows.into_iter().find(|row| row.conversation.id == "c1");
		Ok(row.expect("the room is listed").state)
	}

	async fn paged_state(app: &App<MockRuntime>) -> ConversationState {
		let page =
			conversation_page(app.handle().clone(), app.state(), "personal".to_owned(), None, None)
				.await
				.expect("the page is read");
		let row = page.conversations.into_iter().find(|row| row.conversation.id == "c1");
		row.expect("the room is on the page").state
	}

	async fn ask(app: &App<MockRuntime>, kind: PromptKind) {
		database(app)
			.conversations()
			.hold_prompt(a_pending_prompt("c1", kind))
			.await
			.expect("the prompt is held");
	}

	async fn answer(app: &App<MockRuntime>) {
		database(app)
			.conversations()
			.release_prompt("rs1".to_owned(), "p1".to_owned())
			.await
			.expect("the prompt is released");
	}

	async fn open_a_turn(app: &App<MockRuntime>) {
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: "c1".to_owned(), started_at: 1 };
		database(app).messages().start_turn(turn).await.expect("the turn starts");
	}

	async fn complete_the_turn(app: &App<MockRuntime>) {
		database(app).messages().complete_turn("t1".to_owned(), 2).await.expect("the turn ends");
	}

	async fn a_mission_moved_to(app: &App<MockRuntime>, kind: MissionEventKind) {
		let draft = MissionDraft {
			origin_conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			objective: "Fix the crash".to_owned(),
			ticket: Ticket {
				platform: "github".to_owned(),
				external_id: "42".to_owned(),
				url: "https://kiroshi.test/tickets/42".to_owned(),
				title: "Crash on open".to_owned(),
			},
			tools: Vec::new(),
			source: "bot".to_owned(),
			workspace_path: None,
		};
		let missions = database(app).missions();
		let opened = missions.open(draft, "k1".to_owned()).await.expect("the mission opens");
		let note = MissionNote { source: "bot".to_owned(), payload: Value::Null };
		missions.append(opened.id, MissionEntry::of(kind, note)).await.expect("the mission moves");
	}

	fn heard_states(app: &App<MockRuntime>) -> Arc<Held<Vec<Value>>> {
		let heard = Arc::new(Held::new(Vec::new()));
		let kept = heard.clone();
		app.handle().listen(STATE_CHANGED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("the payload is JSON");
			kept.lock().expect("the list is kept").push(payload);
		});
		heard
	}

	async fn observed_state(app: &App<MockRuntime>) -> ConversationState {
		observe(app.handle(), database(app), "c1").await.expect("the state reads")
	}

	#[tokio::test]
	async fn a_room_with_nothing_running_is_idle() {
		let app = a_host("idle").await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::Idle));
		assert_eq!(paged_state(&app).await, ConversationState::Idle);
	}

	#[tokio::test]
	async fn an_open_turn_alone_is_working() {
		let app = a_host("working").await;
		open_a_turn(&app).await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::Working));
		assert_eq!(paged_state(&app).await, ConversationState::Working);
	}

	#[tokio::test]
	async fn a_pending_question_alone_needs_you() {
		let app = a_host("question").await;
		ask(&app, PromptKind::Question).await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&app).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn a_pending_permission_request_alone_needs_you() {
		let app = a_host("permission").await;
		ask(&app, PromptKind::Permission).await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&app).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn a_mission_waiting_on_a_human_makes_its_origin_need_you() {
		let app = a_host("mission-waiting-human").await;
		a_mission_moved_to(&app, MissionEventKind::Escalated).await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&app).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn a_mission_waiting_on_its_bot_leaves_its_origin_idle() {
		let app = a_host("mission-waiting-bot").await;
		a_mission_moved_to(&app, MissionEventKind::AgentAsked).await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::Idle));
	}

	#[tokio::test]
	async fn a_pending_prompt_outranks_an_open_turn() {
		let app = a_host("precedence").await;
		open_a_turn(&app).await;
		ask(&app, PromptKind::Question).await;

		assert_eq!(listed_state(&app).await, Ok(ConversationState::NeedsYou));
		answer(&app).await;
		assert_eq!(listed_state(&app).await, Ok(ConversationState::Working));
	}

	#[tokio::test]
	async fn each_transition_is_announced_once_and_an_unchanged_recompute_never() {
		let app = a_host("transitions").await;
		let heard = heard_states(&app);

		assert_eq!(observed_state(&app).await, ConversationState::Idle);
		open_a_turn(&app).await;
		observed_state(&app).await;
		observed_state(&app).await;
		ask(&app, PromptKind::Question).await;
		observed_state(&app).await;
		ask(&app, PromptKind::Question).await;
		observed_state(&app).await;
		answer(&app).await;
		observed_state(&app).await;
		complete_the_turn(&app).await;
		observed_state(&app).await;
		observed_state(&app).await;

		let announced = |state: &str| serde_json::json!({ "conversationId": "c1", "spaceId": "personal", "state": state });
		assert_eq!(
			*heard.lock().expect("the list is kept"),
			[announced("working"), announced("needs_you"), announced("working"), announced("idle")]
		);
	}

	#[tokio::test]
	async fn a_list_read_seeds_the_state_so_a_recompute_after_it_announces_nothing() {
		let app = a_host("seeded").await;
		ask(&app, PromptKind::Question).await;
		let heard = heard_states(&app);

		assert_eq!(listed_state(&app).await, Ok(ConversationState::NeedsYou));
		observed_state(&app).await;

		assert!(heard.lock().expect("the list is kept").is_empty());
	}

	#[tokio::test]
	async fn a_relaunched_host_reports_a_persisted_prompt_on_its_first_list_read() {
		let before = a_host("before-relaunch").await;
		ask(&before, PromptKind::Permission).await;
		let file = before.path().app_data_dir().expect("the data folder resolves");

		let after = an_app_of_its_own("conversation-state-after-relaunch", mock_builder());
		after.manage(Ok::<_, db::DatabaseError>(db::open(&file)));

		assert_eq!(listed_state(&after).await, Ok(ConversationState::NeedsYou));
	}

	#[tokio::test]
	async fn deleting_a_conversation_deletes_its_prompts() {
		let app = a_host("deleted").await;
		ask(&app, PromptKind::Question).await;

		conversation_delete(app.handle().clone(), app.state(), "c1".to_owned())
			.await
			.expect("the room is deleted");

		let left: i64 = database(&app)
			.call(|connection| {
				Ok(connection
					.query_row("SELECT COUNT(*) FROM pending_prompts", [], |row| row.get(0))?)
			})
			.await
			.expect("the prompts are counted");
		assert_eq!(left, 0);
	}

	#[tokio::test]
	async fn a_state_input_that_fails_to_read_fails_the_list_with_the_store_error() {
		let app = a_host("unreadable").await;
		database(&app)
			.call(|connection| Ok(connection.execute_batch("DROP TABLE pending_prompts")?))
			.await
			.expect("the table is dropped");

		let refused = listed_state(&app).await;

		assert!(
			matches!(refused, Err(TranscriptStoreError::Storage { .. })),
			"the list answered {refused:?}"
		);
	}
}
