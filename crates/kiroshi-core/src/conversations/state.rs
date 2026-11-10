use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use crate::core_context::Managed;
use tokio::sync::Mutex;

use super::contract::{
	state_in, AgentRoomsChanged, ConversationState, ConversationStateChanged, ObservedState,
	PendingPrompt, States, TranscriptStoreError,
};
use crate::db;
use crate::db::repositories::conversations::{Activity, StoredPrompt};
use crate::events::{AGENT_ROOMS_CHANGED, CONVERSATION_STATE_CHANGED};
use crate::missions::contract::MissionLiveness;
use crate::missions::liveness::observed as mission_observed;

#[derive(Default)]
struct Observed(Mutex<States>);

#[derive(Default)]
struct AnnouncedRooms(Mutex<HashMap<String, BTreeMap<String, Vec<String>>>>);

pub async fn listed(
	core: &crate::core_context::Core,
	database: &db::Database,
	ids: Vec<String>,
) -> Result<States, TranscriptStoreError> {
	let states = states_of(core, database, ids).await?;
	let held = observed(core);
	let mut observed = held.0.lock().await;
	for (id, state) in &states {
		observed.entry(id.clone()).or_insert_with(|| state.clone());
	}
	Ok(states)
}

pub async fn observe(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: &str,
) -> Result<ObservedState, TranscriptStoreError> {
	let held = observed(core);
	let mut observed = held.0.lock().await;
	let activity = database.conversations().activity_of(vec![conversation_id.to_owned()]).await?;
	let Some(activity) = activity.into_iter().next() else {
		return Err(TranscriptStoreError::UnknownConversation { id: conversation_id.to_owned() });
	};
	let space_id = activity.space_id.clone();
	let state = observed_state(activity, &origins_needing_you(core, database).await?);
	if state_in(&observed, conversation_id) != state {
		let changed = ConversationStateChanged {
			conversation_id: conversation_id.to_owned(),
			space_id: space_id.clone(),
			observed: state.clone(),
		};
		match core.emit(CONVERSATION_STATE_CHANGED, changed) {
			Ok(()) => {
				observed.insert(conversation_id.to_owned(), state.clone());
			}
			Err(failure) => {
				log::warn!(
					"the state of conversation {conversation_id} was not announced: {failure}"
				)
			}
		}
	}
	if let Some(space_id) = space_id {
		observe_agent_rooms(core, database, &space_id).await;
	}
	Ok(state)
}

pub async fn observe_agent_rooms(
	core: &crate::core_context::Core,
	database: &db::Database,
	space_id: &str,
) {
	if let Err(failure) = announce_agent_rooms(core, database, space_id).await {
		log::warn!("the rooms of the agents of space {space_id} did not read: {failure:?}");
	}
}

async fn announce_agent_rooms(
	core: &crate::core_context::Core,
	database: &db::Database,
	space_id: &str,
) -> Result<(), TranscriptStoreError> {
	let held = announced_rooms(core);
	let mut announced = held.0.lock().await;
	let working = database.conversations().rooms_of_working_bots(space_id.to_owned()).await?;
	let seen = announced.entry(space_id.to_owned()).or_default();
	let bot_ids: BTreeSet<String> = seen.keys().chain(working.keys()).cloned().collect();
	for bot_id in bot_ids {
		let conversation_ids = working.get(&bot_id).cloned().unwrap_or_default();
		if seen.get(&bot_id).map_or(&[][..], Vec::as_slice) == conversation_ids.as_slice() {
			continue;
		}
		let changed = AgentRoomsChanged {
			bot_id: bot_id.clone(),
			space_id: space_id.to_owned(),
			conversation_ids: conversation_ids.clone(),
		};
		match core.emit(AGENT_ROOMS_CHANGED, changed) {
			Ok(()) if conversation_ids.is_empty() => {
				seen.remove(&bot_id);
			}
			Ok(()) => {
				seen.insert(bot_id, conversation_ids);
			}
			Err(failure) => {
				log::warn!("the rooms of agent {bot_id} were not announced: {failure}")
			}
		}
	}
	Ok(())
}

pub async fn observe_reporting(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: &str,
) {
	if let Err(failure) = observe(core, database, conversation_id).await {
		log::warn!("the state of conversation {conversation_id} did not read: {failure:?}");
	}
}

pub fn observe_later(core: &crate::core_context::Core, conversation_id: String) {
	let core = core.clone();
	core.clone().spawn(async move {
		let Some(database) = core.try_state::<db::DatabaseState>() else {
			return log::warn!("the state of conversation {conversation_id} has no database");
		};
		match database.inner() {
			Ok(database) => observe_reporting(&core, database, &conversation_id).await,
			Err(failure) => {
				log::warn!("the state of conversation {conversation_id} did not read: {failure:?}")
			}
		}
	});
}

async fn states_of(
	core: &crate::core_context::Core,
	database: &db::Database,
	ids: Vec<String>,
) -> Result<States, TranscriptStoreError> {
	let activities = database.conversations().activity_of(ids).await?;
	let needing_you = origins_needing_you(core, database).await?;
	Ok(activities
		.into_iter()
		.map(|activity| (activity.conversation_id.clone(), observed_state(activity, &needing_you)))
		.collect())
}

async fn origins_needing_you(
	core: &crate::core_context::Core,
	database: &db::Database,
) -> Result<HashSet<String>, TranscriptStoreError> {
	let open = database.missions().still_open().await?;
	Ok(open
		.into_iter()
		.map(|mission| mission_observed(core, mission))
		.filter(|mission| mission.liveness == MissionLiveness::NeedsYou)
		.map(|mission| mission.origin_conversation_id)
		.collect())
}

fn observed_state(activity: Activity, origins_needing_you: &HashSet<String>) -> ObservedState {
	ObservedState {
		state: ranked(&activity, origins_needing_you),
		pending_prompt: activity
			.pending_prompt
			.and_then(|stored| shown_prompt(&activity.conversation_id, stored)),
		working_bot_ids: activity.working_bot_ids,
	}
}

fn shown_prompt(conversation_id: &str, stored: StoredPrompt) -> Option<PendingPrompt> {
	match stored {
		StoredPrompt::Readable(prompt) => Some(prompt.into()),
		StoredPrompt::Undecodable { prompt_id, kind, failure } => {
			log::warn!(
				"the pending prompt {prompt_id} of conversation {conversation_id} did not decode: {failure}"
			);
			kind.map(|kind| PendingPrompt { prompt_id, kind: kind.into(), text: String::new() })
		}
	}
}

fn ranked(activity: &Activity, origins_needing_you: &HashSet<String>) -> ConversationState {
	if activity.pending_prompt.is_some() || origins_needing_you.contains(&activity.conversation_id)
	{
		return ConversationState::NeedsYou;
	}
	if activity.has_open_turn {
		return ConversationState::Working;
	}
	ConversationState::Idle
}

fn observed(core: &crate::core_context::Core) -> Managed<'_, Observed> {
	if core.try_state::<Observed>().is_none() {
		core.manage(Observed::default());
	}
	core.state::<Observed>()
}

fn announced_rooms(core: &crate::core_context::Core) -> Managed<'_, AnnouncedRooms> {
	if core.try_state::<AnnouncedRooms>().is_none() {
		core.manage(AnnouncedRooms::default());
	}
	core.state::<AnnouncedRooms>()
}

#[cfg(test)]
mod tests {
	use crate::db::repositories::conversations::ChatOwner;
	use crate::hosting::authorship::Caller;
	use std::sync::{Arc, Mutex as Held};
	use std::time::Duration;

	use serde_json::{json, Value};
	use tokio::time::timeout;

	use super::*;
	use crate::agent::commands::a_run_held_by_the_app;
	use crate::agent::contract::{AgentEvent, PermissionDecision, PermissionRequest, RuntimeScope};
	use crate::agent::reply_writer::TurnSink;
	use crate::conversations::commands::ready;
	use crate::conversations::commands::{
		agent_rooms, conversations_page, delete_conversation, list_conversations, main_chat,
		solo_states,
	};
	use crate::conversations::contract::Chat;
	use crate::conversations::contract::{AGENT_ROOMS_CHANGED_EVENT, STATE_CHANGED_EVENT};
	use crate::db::repositories::conversations::{a_pending_prompt, PromptKind};
	use crate::db::repositories::messages::NewTurn;
	use crate::missions::contract::{
		Mission, MissionDraft, MissionEntry, MissionEventKind, MissionNote, Ticket,
	};
	use crate::test_core::{a_core_of_its_own, CoreOfItsOwn};

	const PATIENCE: Duration = Duration::from_secs(10);

	const ONE_SEATED_ROOM: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, space_id, kind, title, created_at, updated_at)
			VALUES ('c1', 'personal', 'topic', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	async fn a_host(name: &str) -> CoreOfItsOwn {
		let core = a_core_of_its_own(&format!("conversation-state-{name}"));
		crate::db::install(&core);
		database(&core)
			.call_mut(|connection| Ok(connection.execute_batch(ONE_SEATED_ROOM)?))
			.await
			.expect("the room is planted");
		core
	}

	fn database(core: &CoreOfItsOwn) -> &db::Database {
		ready(core.state::<db::DatabaseState>().inner()).expect("the database opens")
	}

	async fn listed_state(core: &CoreOfItsOwn) -> Result<ConversationState, TranscriptStoreError> {
		let rows = list_conversations(core, "personal".to_owned()).await?;
		let row = rows.into_iter().find(|row| row.conversation.id == "c1");
		Ok(row.expect("the room is listed").observed.state)
	}

	async fn paged_state(core: &CoreOfItsOwn) -> ConversationState {
		paged(core, "c1").await.state
	}

	async fn paged(core: &CoreOfItsOwn, conversation_id: &str) -> ObservedState {
		let page = conversations_page(core, Caller::Host, "personal".to_owned(), None, None)
			.await
			.expect("the page is read");
		let row = page.conversations.into_iter().find(|row| row.conversation.id == conversation_id);
		row.expect("the room is on the page").observed
	}

	async fn ask(core: &CoreOfItsOwn, kind: PromptKind) {
		database(core)
			.conversations()
			.hold_prompt(a_pending_prompt("c1", kind))
			.await
			.expect("the prompt is held");
	}

	async fn answer(core: &CoreOfItsOwn) {
		database(core)
			.conversations()
			.release_prompt("rs1".to_owned(), "p1".to_owned())
			.await
			.expect("the prompt is released");
	}

	async fn open_a_turn(core: &CoreOfItsOwn) {
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: "c1".to_owned(), started_at: 1 };
		database(core).messages().start_turn(turn).await.expect("the turn starts");
	}

	async fn complete_the_turn(core: &CoreOfItsOwn) {
		database(core).messages().complete_turn("t1".to_owned(), 2).await.expect("the turn ends");
	}

	async fn an_open_mission(core: &CoreOfItsOwn) -> Mission {
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
		database(core).missions().open(draft, "k1".to_owned()).await.expect("the mission opens")
	}

	async fn told(core: &CoreOfItsOwn, mission: &Mission, entry: MissionEntry) {
		database(core)
			.missions()
			.append(mission.id.clone(), entry)
			.await
			.expect("the mission moves");
	}

	fn a_hook_call(kind: MissionEventKind, payload: Value) -> MissionEntry {
		MissionEntry { kind, source: "agent-hook".to_owned(), payload }
	}

	fn a_permission_prompt() -> MissionEntry {
		a_hook_call(
			MissionEventKind::AgentAsked,
			json!({ "event": "Notification", "notification": "permission_prompt" }),
		)
	}

	fn an_escalation() -> MissionEntry {
		let note = MissionNote { source: "bot".to_owned(), payload: Value::Null };
		MissionEntry::of(MissionEventKind::Escalated, note)
	}

	fn the_thread_of(mission: &Mission) -> RuntimeScope {
		RuntimeScope {
			conversation_id: mission.thread_conversation_id.clone(),
			bot_id: mission.bot_id.clone(),
			runtime_session_id: "r1".to_owned(),
			epoch: 1,
		}
	}

	fn a_permission(id: &str) -> AgentEvent {
		AgentEvent::PermissionRequested {
			request: PermissionRequest {
				id: id.to_owned(),
				tool_name: "Bash".to_owned(),
				title: "Run a command".to_owned(),
				detail: None,
			},
		}
	}

	fn resolved(id: &str) -> AgentEvent {
		AgentEvent::PermissionResolved {
			id: id.to_owned(),
			decision: PermissionDecision::AllowOnce,
		}
	}

	fn a_change(state: &str) -> Value {
		a_change_of("c1", state, Value::Null, &[])
	}

	fn a_change_of(conversation_id: &str, state: &str, prompt: Value, working: &[&str]) -> Value {
		json!({
			"conversationId": conversation_id,
			"spaceId": "personal",
			"state": state,
			"pendingPrompt": prompt,
			"workingBotIds": working,
		})
	}

	fn the_question() -> Value {
		json!({ "promptId": "p1", "kind": "question", "text": "Which branch ships?" })
	}

	async fn heard_until(heard: &Held<Vec<Value>>, expected: &[Value]) {
		let waited = timeout(PATIENCE, async {
			while heard.lock().expect("the list is kept").as_slice() != expected {
				tokio::time::sleep(Duration::from_millis(10)).await;
			}
		})
		.await;
		assert!(waited.is_ok(), "heard {:?}", heard.lock().expect("the list is kept"));
	}

	fn heard_states(core: &CoreOfItsOwn) -> Arc<Held<Vec<Value>>> {
		heard_on(core, STATE_CHANGED_EVENT)
	}

	fn heard_on(core: &CoreOfItsOwn, event_name: &'static str) -> Arc<Held<Vec<Value>>> {
		let heard = Arc::new(Held::new(Vec::new()));
		let kept = heard.clone();
		core.listen_to(event_name, move |payload| {
			let payload = serde_json::from_str(payload).expect("the payload is JSON");
			kept.lock().expect("the list is kept").push(payload);
		});
		heard
	}

	async fn observed_state(core: &CoreOfItsOwn) -> ConversationState {
		observed_in(core, "c1").await.state
	}

	async fn observed_in(core: &CoreOfItsOwn, conversation_id: &str) -> ObservedState {
		observe(core, database(core), conversation_id).await.expect("the state reads")
	}

	async fn a_run_of(core: &CoreOfItsOwn, turn: (&str, &str, i64), bot_id: &str) {
		let (id, conversation_id, started_at) = turn;
		let turn =
			NewTurn { id: id.to_owned(), conversation_id: conversation_id.to_owned(), started_at };
		database(core).messages().start_run(turn, bot_id.to_owned()).await.expect("the run starts");
	}

	#[tokio::test]
	async fn a_room_with_nothing_running_is_idle() {
		let core = a_host("idle").await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::Idle));
		assert_eq!(paged_state(&core).await, ConversationState::Idle);
	}

	#[tokio::test]
	async fn an_open_turn_alone_is_working() {
		let core = a_host("working").await;
		open_a_turn(&core).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::Working));
		assert_eq!(paged_state(&core).await, ConversationState::Working);
	}

	#[tokio::test]
	async fn a_pending_question_alone_needs_you() {
		let core = a_host("question").await;
		ask(&core, PromptKind::Question).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&core).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn a_pending_permission_request_alone_needs_you() {
		let core = a_host("permission").await;
		ask(&core, PromptKind::Permission).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&core).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn a_mission_reads_needs_you_for_its_origin_only_through_its_observed_liveness() {
		let core = a_host("mission-observed").await;
		let opened = an_open_mission(&core).await;
		let run = a_run_held_by_the_app(&core, the_thread_of(&opened));
		let before = listed_state(&core).await;

		run.emit(a_permission("p1"), None);
		let prompted = listed_state(&core).await;
		run.emit(resolved("p1"), None);

		assert_eq!(
			[before, prompted, listed_state(&core).await],
			[
				Ok(ConversationState::Idle),
				Ok(ConversationState::NeedsYou),
				Ok(ConversationState::Idle)
			],
			"the stored mission reads idle, its live thread prompt needs you"
		);
	}

	#[tokio::test]
	async fn a_closed_mission_that_needed_you_leaves_its_origin_idle() {
		let core = a_host("mission-closed").await;
		let opened = an_open_mission(&core).await;
		told(&core, &opened, an_escalation()).await;
		let note = MissionNote { source: "bot".to_owned(), payload: Value::Null };
		told(&core, &opened, MissionEntry::of(MissionEventKind::Closed, note)).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::Idle));
	}

	#[tokio::test]
	async fn a_thread_move_that_moves_the_mission_liveness_re_observes_its_origin() {
		let core = a_host("mission-thread-move").await;
		let opened = an_open_mission(&core).await;
		let run = a_run_held_by_the_app(&core, the_thread_of(&opened));
		assert_eq!(listed_state(&core).await, Ok(ConversationState::Idle));
		let heard = heard_states(&core);

		run.emit(a_permission("p1"), None);
		heard_until(&heard, &[a_change("needs_you")]).await;
		run.emit(resolved("p1"), None);

		heard_until(&heard, &[a_change("needs_you"), a_change("idle")]).await;
	}

	#[tokio::test]
	async fn a_checkout_whose_last_hook_event_is_a_stop_leaves_its_origin_idle() {
		let core = a_host("mission-stopped").await;
		let opened = an_open_mission(&core).await;
		told(&core, &opened, a_permission_prompt()).await;
		let stop = json!({ "event": "Stop" });
		told(&core, &opened, a_hook_call(MissionEventKind::AgentStopped, stop.clone())).await;
		told(&core, &opened, a_hook_call(MissionEventKind::AgentAsked, stop)).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::Idle));
		assert_eq!(paged_state(&core).await, ConversationState::Idle);
	}

	#[tokio::test]
	async fn a_permission_prompt_of_the_checkout_makes_its_origin_need_you() {
		let core = a_host("mission-permission-prompt").await;
		let opened = an_open_mission(&core).await;
		told(&core, &opened, a_permission_prompt()).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&core).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn an_unanswered_escalation_makes_its_origin_need_you() {
		let core = a_host("mission-escalated").await;
		let opened = an_open_mission(&core).await;
		told(&core, &opened, an_escalation()).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::NeedsYou));
		assert_eq!(paged_state(&core).await, ConversationState::NeedsYou);
	}

	#[tokio::test]
	async fn a_pending_prompt_outranks_an_open_turn() {
		let core = a_host("precedence").await;
		open_a_turn(&core).await;
		ask(&core, PromptKind::Question).await;

		assert_eq!(listed_state(&core).await, Ok(ConversationState::NeedsYou));
		answer(&core).await;
		assert_eq!(listed_state(&core).await, Ok(ConversationState::Working));
	}

	#[tokio::test]
	async fn each_transition_is_announced_once_and_an_unchanged_recompute_never() {
		let core = a_host("transitions").await;
		let heard = heard_states(&core);

		assert_eq!(observed_state(&core).await, ConversationState::Idle);
		open_a_turn(&core).await;
		observed_state(&core).await;
		observed_state(&core).await;
		ask(&core, PromptKind::Question).await;
		observed_state(&core).await;
		ask(&core, PromptKind::Question).await;
		observed_state(&core).await;
		answer(&core).await;
		observed_state(&core).await;
		complete_the_turn(&core).await;
		observed_state(&core).await;
		observed_state(&core).await;

		assert_eq!(
			*heard.lock().expect("the list is kept"),
			[
				a_change("working"),
				a_change_of("c1", "needs_you", the_question(), &[]),
				a_change("working"),
				a_change("idle")
			]
		);
	}

	#[tokio::test]
	async fn a_list_read_seeds_the_state_so_a_recompute_after_it_announces_nothing() {
		let core = a_host("seeded").await;
		ask(&core, PromptKind::Question).await;
		let heard = heard_states(&core);

		assert_eq!(listed_state(&core).await, Ok(ConversationState::NeedsYou));
		observed_state(&core).await;

		assert!(heard.lock().expect("the list is kept").is_empty());
	}

	#[tokio::test]
	async fn a_relaunched_host_reports_idle_for_a_prompt_its_dead_session_left() {
		let before = a_host("before-relaunch").await;
		ask(&before, PromptKind::Permission).await;
		let file = before.data_dir().to_path_buf();

		let after = a_core_of_its_own("conversation-state-after-relaunch");
		after.manage(Ok::<_, db::DatabaseError>(db::open(&file)));

		assert_eq!(listed_state(&after).await, Ok(ConversationState::Idle));
	}

	#[tokio::test]
	async fn a_question_asked_after_a_crash_needs_you_until_it_is_answered() {
		let crashed = a_host("before-crash").await;
		ask(&crashed, PromptKind::Question).await;
		let file = crashed.data_dir().to_path_buf();
		let relaunched = a_core_of_its_own("conversation-state-after-crash");
		relaunched.manage(Ok::<_, db::DatabaseError>(db::open(&file)));
		assert_eq!(listed_state(&relaunched).await, Ok(ConversationState::Idle));

		ask(&relaunched, PromptKind::Question).await;
		let open = listed_state(&relaunched).await;
		answer(&relaunched).await;
		let answered = listed_state(&relaunched).await;

		assert_eq!(open, Ok(ConversationState::NeedsYou));
		assert_eq!(answered, Ok(ConversationState::Idle));
	}

	#[tokio::test]
	async fn deleting_a_conversation_deletes_its_prompts() {
		let core = a_host("deleted").await;
		ask(&core, PromptKind::Question).await;

		delete_conversation(&core, "c1".to_owned()).await.expect("the room is deleted");

		let left: i64 = database(&core)
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
		let core = a_host("unreadable").await;
		database(&core)
			.call(|connection| Ok(connection.execute_batch("DROP TABLE pending_prompts")?))
			.await
			.expect("the table is dropped");

		let refused = listed_state(&core).await;

		assert!(
			matches!(refused, Err(TranscriptStoreError::Storage { .. })),
			"the list answered {refused:?}"
		);
	}

	const A_MAIN_CONVERSATION: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b2', 'personal', 1);
		INSERT INTO conversations (id, space_id, kind, title, created_at, updated_at)
			VALUES ('c2', 'personal', 'topic', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c2', 'b2', 'lead', 1, 0);
	";

	async fn a_second_room(core: &CoreOfItsOwn) {
		database(core)
			.call_mut(|connection| Ok(connection.execute_batch(A_MAIN_CONVERSATION)?))
			.await
			.expect("the second room is planted");
	}

	async fn the_main_chat(core: &CoreOfItsOwn) -> Chat {
		main_chat(core, Caller::Host, "b1".to_owned(), Some("personal".to_owned()))
			.await
			.expect("the main conversation reads")
	}

	#[tokio::test]
	async fn the_main_conversation_answers_its_state_on_read_and_announces_its_change() {
		let core = a_host("main-conversation").await;
		let main = the_main_chat(&core).await;
		let heard = heard_states(&core);
		database(&core)
			.conversations()
			.hold_prompt(a_pending_prompt(&main.id, PromptKind::Question))
			.await
			.expect("the prompt is held");

		let read = the_main_chat(&core).await;
		observed_in(&core, &main.id).await;
		observed_in(&core, &main.id).await;

		assert_eq!(
			(main.state, main.pending_prompt, main.working_bot_ids),
			(ConversationState::Idle, None, vec![])
		);
		assert_eq!(read.state, ConversationState::NeedsYou);
		assert_eq!(serde_json::to_value(read.pending_prompt).ok(), Some(the_question()));
		heard_until(&heard, &[a_change_of(&main.id, "needs_you", the_question(), &[])]).await;
	}

	#[tokio::test]
	async fn a_pending_prompt_carries_its_text_in_the_state_and_in_its_event() {
		let core = a_host("prompt-text").await;
		let heard = heard_states(&core);
		ask(&core, PromptKind::Question).await;
		let asked = observed_in(&core, "c1").await;
		answer(&core).await;
		observed_in(&core, "c1").await;
		ask(&core, PromptKind::Permission).await;

		let permission = json!({ "promptId": "p1", "kind": "permission", "text": "Run git push" });
		assert_eq!(serde_json::to_value(&asked.pending_prompt).ok(), Some(the_question()));
		assert_eq!(
			serde_json::to_value(paged(&core, "c1").await.pending_prompt).ok(),
			Some(permission.clone())
		);
		observed_in(&core, "c1").await;
		heard_until(
			&heard,
			&[
				a_change_of("c1", "needs_you", the_question(), &[]),
				a_change("idle"),
				a_change_of("c1", "needs_you", permission, &[]),
			],
		)
		.await;
	}

	#[tokio::test]
	async fn two_companions_working_in_two_conversations_are_each_named_in_its_own_event() {
		let core = a_host("two-working").await;
		a_second_room(&core).await;
		let heard = heard_states(&core);

		a_run_of(&core, ("t1", "c1", 5), "b1").await;
		observed_in(&core, "c1").await;
		a_run_of(&core, ("t2", "c2", 3), "b2").await;
		observed_in(&core, "c2").await;
		a_run_of(&core, ("t3", "c1", 2), "b2").await;
		observed_in(&core, "c1").await;

		heard_until(
			&heard,
			&[
				a_change_of("c1", "working", Value::Null, &["b1"]),
				a_change_of("c2", "working", Value::Null, &["b2"]),
				a_change_of("c1", "working", Value::Null, &["b2", "b1"]),
			],
		)
		.await;
		assert_eq!(paged(&core, "c2").await.working_bot_ids, ["b2"]);
	}

	#[tokio::test]
	async fn a_solo_thread_absent_from_every_loaded_page_reads_needs_you_on_its_first_read() {
		let core = a_host("first-read").await;
		let conversations = database(&core).conversations();
		let solo = conversations
			.ensure_chat("b1".to_owned(), Some("personal".to_owned()), ChatOwner::Host)
			.await
			.expect("the solo thread is opened");
		conversations
			.hold_prompt(a_pending_prompt(&solo.id, PromptKind::Permission))
			.await
			.expect("the prompt is held");

		let read = the_main_chat(&core).await;

		assert_eq!(read.id, solo.id);
		assert_eq!(read.state, ConversationState::NeedsYou);
	}

	const THREE_COMPANIONS_AND_ONE_GONE: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b2', 'Second', 'sonnet', 2), ('b3', 'Third', 'sonnet', 3),
				('b4', 'Gone', 'sonnet', 4);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b2', 'personal', 1), ('b3', 'personal', 1);
		INSERT INTO conversations (id, space_id, kind, title, created_at, updated_at)
			VALUES ('c-gone', 'personal', 'main', 'Gone', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c-gone', 'b4', 'lead', 1, 0);
	";

	async fn a_solo_thread_of(core: &CoreOfItsOwn, bot_id: &str) -> String {
		database(core)
			.conversations()
			.ensure_chat(bot_id.to_owned(), Some("personal".to_owned()), ChatOwner::Host)
			.await
			.expect("the solo thread is opened")
			.id
	}

	async fn conversations_held(core: &CoreOfItsOwn) -> i64 {
		database(core)
			.call(|connection| {
				Ok(connection
					.query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))?)
			})
			.await
			.expect("the conversations are counted")
	}

	#[tokio::test]
	async fn the_solo_states_of_a_space_answer_each_held_solo_thread_and_open_none() {
		let core = a_host("solo-states").await;
		database(&core)
			.call_mut(|connection| Ok(connection.execute_batch(THREE_COMPANIONS_AND_ONE_GONE)?))
			.await
			.expect("the companions are planted");
		let asking = a_solo_thread_of(&core, "b1").await;
		let working = a_solo_thread_of(&core, "b2").await;
		database(&core)
			.conversations()
			.hold_prompt(a_pending_prompt(&asking, PromptKind::Question))
			.await
			.expect("the prompt is held");
		a_run_of(&core, ("t1", &working, 1), "b2").await;
		let held_before = conversations_held(&core).await;

		let read = solo_states(&core, Caller::Host, "personal".to_owned())
			.await
			.expect("the solo states read");

		assert_eq!(conversations_held(&core).await, held_before);
		let answered: Vec<(&str, &str, ConversationState, Vec<String>)> = read
			.iter()
			.map(|entry| {
				(
					entry.bot_id.as_str(),
					entry.conversation_id.as_str(),
					entry.observed.state,
					entry.observed.working_bot_ids.clone(),
				)
			})
			.collect();
		assert_eq!(
			answered,
			[
				("b1", asking.as_str(), ConversationState::NeedsYou, vec![]),
				("b2", working.as_str(), ConversationState::Working, vec!["b2".to_owned()]),
			]
		);
		assert_eq!(
			serde_json::to_value(&read[0].observed.pending_prompt).ok(),
			Some(the_question())
		);
		assert_eq!(read[0].observed, paged(&core, &asking).await);
		assert_eq!(read[1].observed, paged(&core, &working).await);
		let main = the_main_chat(&core).await;
		assert_eq!(
			(main.id, main.state, main.pending_prompt),
			(asking, read[0].observed.state, read[0].observed.pending_prompt.clone())
		);
	}

	const MALFORMED_PROMPTS: &str = "
		INSERT INTO conversations (id, space_id, kind, title, created_at, updated_at)
			VALUES ('c2', 'personal', 'topic', 'Old request', 1, 1),
				('c3', 'personal', 'topic', 'Unknown kind', 1, 1);
		INSERT INTO pending_prompts
				(runtime_session_id, prompt_id, conversation_id, kind, request, asked_at)
			VALUES ('rs2', 'p2', 'c2', 'permission', '{\"tool\": \"Bash\"}', 1);
		PRAGMA ignore_check_constraints = ON;
		INSERT INTO pending_prompts
				(runtime_session_id, prompt_id, conversation_id, kind, request, asked_at)
			VALUES ('rs3', 'p3', 'c3', 'survey', '{}', 1);
		PRAGMA ignore_check_constraints = OFF;
	";

	#[tokio::test]
	async fn an_undecodable_prompt_degrades_its_own_row_and_leaves_the_rest_of_the_page() {
		let core = a_host("malformed-prompts").await;
		ask(&core, PromptKind::Question).await;
		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		database(&core)
			.call_mut(|connection| Ok(connection.execute_batch(MALFORMED_PROMPTS)?))
			.await
			.expect("the malformed prompts are planted");

		let page = conversations_page(&core, Caller::Host, "personal".to_owned(), None, None)
			.await
			.expect("the page is read");

		let observed_of = |id: &str| {
			page.conversations
				.iter()
				.find(|row| row.conversation.id == id)
				.map(|row| serde_json::to_value(&row.observed).expect("the state serializes"))
		};
		assert_eq!(
			observed_of("c1"),
			Some(json!({
				"state": "needs_you",
				"pendingPrompt": the_question(),
				"workingBotIds": ["b1"],
			}))
		);
		assert_eq!(
			observed_of("c2"),
			Some(json!({
				"state": "needs_you",
				"pendingPrompt": { "promptId": "p2", "kind": "permission", "text": "" },
				"workingBotIds": [],
			}))
		);
		assert_eq!(
			observed_of("c3"),
			Some(json!({ "state": "needs_you", "pendingPrompt": null, "workingBotIds": [] }))
		);
	}

	const ROOMS_OF_TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('elsewhere', 'Elsewhere', 257, 1, 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'elsewhere', 2);
		INSERT INTO conversations (id, space_id, kind, title, created_at, updated_at)
			VALUES ('c3', 'personal', 'topic', 'Third', 1, 1),
				('e1', 'elsewhere', 'topic', 'Away', 1, 1);
	";

	async fn rooms_in_two_spaces(name: &str) -> CoreOfItsOwn {
		let core = a_host(name).await;
		a_second_room(&core).await;
		database(&core)
			.call_mut(|connection| Ok(connection.execute_batch(ROOMS_OF_TWO_SPACES)?))
			.await
			.expect("the rooms are planted");
		core
	}

	fn rooms_of(bot_id: &str, space_id: &str, conversation_ids: &[&str]) -> Value {
		json!({ "botId": bot_id, "spaceId": space_id, "conversationIds": conversation_ids })
	}

	fn heard_rooms(core: &CoreOfItsOwn) -> Arc<Held<Vec<Value>>> {
		heard_on(core, AGENT_ROOMS_CHANGED_EVENT)
	}

	async fn ends(core: &CoreOfItsOwn, turn_id: &str, conversation_id: &str) {
		database(core)
			.messages()
			.complete_turn(turn_id.to_owned(), 9)
			.await
			.expect("the turn ends");
		observed_in(core, conversation_id).await;
	}

	async fn agent_rooms_of(core: &CoreOfItsOwn, space_id: &str) -> Value {
		let rooms = agent_rooms(core, space_id.to_owned()).await.expect("the rooms read");
		serde_json::to_value(rooms).expect("the rooms serialize")
	}

	#[tokio::test]
	async fn an_agent_starting_in_a_second_room_is_announced_with_its_newest_room_first() {
		let core = rooms_in_two_spaces("rooms-grow").await;
		let heard = heard_rooms(&core);

		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		observed_in(&core, "c1").await;
		a_run_of(&core, ("t2", "c2", 2), "b1").await;
		observed_in(&core, "c2").await;

		heard_until(
			&heard,
			&[rooms_of("b1", "personal", &["c1"]), rooms_of("b1", "personal", &["c2", "c1"])],
		)
		.await;
	}

	#[tokio::test]
	async fn the_turns_of_an_agent_ending_shrink_its_rooms_then_empty_them() {
		let core = rooms_in_two_spaces("rooms-shrink").await;
		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		a_run_of(&core, ("t2", "c2", 2), "b1").await;
		observed_in(&core, "c2").await;
		let heard = heard_rooms(&core);

		ends(&core, "t2", "c2").await;
		ends(&core, "t1", "c1").await;

		heard_until(
			&heard,
			&[rooms_of("b1", "personal", &["c1"]), rooms_of("b1", "personal", &[])],
		)
		.await;
	}

	#[tokio::test]
	async fn a_state_change_that_leaves_the_rooms_of_an_agent_alone_announces_no_rooms() {
		let core = rooms_in_two_spaces("rooms-unchanged").await;
		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		observed_in(&core, "c1").await;
		let heard = heard_rooms(&core);
		let states = heard_states(&core);

		ask(&core, PromptKind::Question).await;
		observed_in(&core, "c1").await;
		answer(&core).await;
		observed_in(&core, "c1").await;
		observed_in(&core, "c3").await;

		heard_until(
			&states,
			&[
				a_change_of("c1", "needs_you", the_question(), &["b1"]),
				a_change_of("c1", "working", Value::Null, &["b1"]),
			],
		)
		.await;
		assert!(heard.lock().expect("the list is kept").is_empty());
	}

	#[tokio::test]
	async fn an_agent_working_in_two_spaces_is_announced_once_per_space_with_its_rooms_there() {
		let core = rooms_in_two_spaces("rooms-two-spaces").await;
		let heard = heard_rooms(&core);

		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		a_run_of(&core, ("t2", "e1", 2), "b1").await;
		observed_in(&core, "c1").await;
		observed_in(&core, "e1").await;

		heard_until(
			&heard,
			&[rooms_of("b1", "personal", &["c1"]), rooms_of("b1", "elsewhere", &["e1"])],
		)
		.await;
	}

	#[tokio::test]
	async fn the_rooms_read_lists_each_working_agent_newest_first_and_silences_no_later_change() {
		let core = rooms_in_two_spaces("rooms-read").await;
		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		a_run_of(&core, ("t2", "c3", 3), "b1").await;
		a_run_of(&core, ("t3", "c2", 2), "b2").await;
		a_run_of(&core, ("t4", "e1", 4), "b1").await;
		let heard = heard_rooms(&core);

		let read = agent_rooms_of(&core, "personal").await;
		observed_in(&core, "c2").await;

		assert_eq!(
			read,
			json!([
				{ "botId": "b1", "conversationIds": ["c3", "c1"] },
				{ "botId": "b2", "conversationIds": ["c2"] },
			])
		);
		heard_until(
			&heard,
			&[rooms_of("b1", "personal", &["c3", "c1"]), rooms_of("b2", "personal", &["c2"])],
		)
		.await;
	}

	#[tokio::test]
	async fn deleting_a_room_an_agent_works_in_announces_its_rooms_without_it() {
		let core = rooms_in_two_spaces("rooms-deleted").await;
		a_run_of(&core, ("t1", "c1", 1), "b1").await;
		a_run_of(&core, ("t2", "c2", 2), "b1").await;
		observed_in(&core, "c2").await;
		let heard = heard_rooms(&core);

		delete_conversation(&core, "c2".to_owned()).await.expect("the room is deleted");

		heard_until(&heard, &[rooms_of("b1", "personal", &["c1"])]).await;
	}
}
