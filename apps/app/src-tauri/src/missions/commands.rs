use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

use super::checkout;
use super::contract::{
	ConversationMissions, HookedMission, Mission, MissionAnswer, MissionClosing, MissionDetail,
	MissionDraft, MissionEntry, MissionError, MissionEventKind, MissionHandoff, MissionInSpace,
	MissionNote, MissionOnBoard, MissionOpened, MissionSpacePage, MissionState, MissionUpdate,
	MissionWatch, MissionWatching,
};
use super::{github, hook};
use crate::avatars;
use crate::bundles;
use crate::companions::host::picked;
use crate::conversations::commands::{bot_row, ready, seat_participant};
use crate::conversations::contract::{Bot, CompanionSpoke};
use crate::db;
use crate::db::repositories::keyset;
use crate::events::{self, COMPANION_SPOKE, MISSION_CHANGED};
use crate::file_store::FileStore;
use crate::routines::webhook::{Webhook, HEADER};

pub const CHANGED_EVENT: &str = "mission://changed";

const BOT: &str = "bot";

const PERSON: &str = "person";

const HEARD: &str =
	"the agent hook is installed in the checkout of this mission, so what the agent does there \
	reaches its thread";

const CARRIES_ON: &str = "the work of this mission carries on in the thread this answer names, \
	where the person follows it";

const ACKNOWLEDGE: &str = "end the turn you are answering in with a single line saying the \
	mission is open, and nothing more";

const HANDED_OVER: &str = "this mission is yours now, carry it out:";

const UNHEARD: &str = "no agent reaches this mission, it moves only on the lines, the escalations \
	and the closing its bot writes";

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionChanged {
	pub mission_id: String,
	pub space_id: Option<String>,
	pub state: MissionState,
	pub state_seq: i64,
	pub is_agent_running: bool,
	pub last_activity_at: Option<i64>,
}

#[derive(Default)]
pub struct AnnouncedRunning(Mutex<HashMap<String, bool>>);

impl AnnouncedRunning {
	fn kept(&self) -> MutexGuard<'_, HashMap<String, bool>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

pub(super) fn announce_change<R: Runtime>(
	app: &AppHandle<R>,
	mission: &Mission,
) -> Result<(), MissionError> {
	events::emit(
		app,
		MISSION_CHANGED,
		MissionChanged {
			mission_id: mission.id.clone(),
			space_id: mission.space_id.clone(),
			state: mission.state,
			state_seq: mission.state_seq,
			is_agent_running: mission.is_agent_running,
			last_activity_at: mission.last_activity_at,
		},
	)
	.map_err(|error| MissionError::Undeliverable { detail: error.to_string() })?;
	remember_running(app, mission);
	Ok(())
}

fn remember_running<R: Runtime>(app: &AppHandle<R>, mission: &Mission) {
	let Some(announced) = app.try_state::<AnnouncedRunning>() else {
		return;
	};
	let mut kept = announced.kept();
	match mission.closed_at {
		Some(_) => kept.remove(&mission.id),
		None => kept.insert(mission.id.clone(), mission.is_agent_running),
	};
}

pub(super) fn announced_running<R: Runtime>(app: &AppHandle<R>, mission_id: &str) -> Option<bool> {
	app.try_state::<AnnouncedRunning>()?.kept().get(mission_id).copied()
}

fn refuse_blank(field: &str, held: &str) -> Result<(), MissionError> {
	match held.trim().is_empty() {
		true => Err(MissionError::BlankField { field: field.to_owned() }),
		false => Ok(()),
	}
}

fn refused_draft(draft: &MissionDraft) -> Result<(), MissionError> {
	refuse_blank("objective", &draft.objective)?;
	refuse_blank("ticket.platform", &draft.ticket.platform)?;
	refuse_blank("ticket.externalId", &draft.ticket.external_id)?;
	refuse_blank("source", &draft.source)?;
	refused_workspace(draft.workspace_path.as_deref())
}

pub async fn mission_open<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	draft: MissionDraft,
) -> Result<MissionOpened, MissionError> {
	let draft = MissionDraft { workspace_path: trimmed(draft.workspace_path), ..draft };
	refused_draft(&draft)?;
	let workspace = draft.workspace_path.clone();
	let key = uuid::Uuid::new_v4().to_string();
	let opened = ready(&state)?.missions().open(draft, key.clone()).await?;
	announce_change(&app, &opened)?;
	let reach = match workspace {
		Some(workspace) => reach_of(&app, &opened.id, &workspace, &key),
		None => UNHEARD.to_owned(),
	};
	Ok(MissionOpened {
		mission: opened,
		reach,
		carries_on: CARRIES_ON.to_owned(),
		acknowledge: ACKNOWLEDGE.to_owned(),
	})
}

fn reach_of<R: Runtime>(
	app: &AppHandle<R>,
	mission_id: &str,
	workspace: &str,
	key: &str,
) -> String {
	match install(app, mission_id, workspace, key) {
		Ok(()) => HEARD.to_owned(),
		Err(MissionError::Undeliverable { detail }) => format!("{UNHEARD}: {detail}"),
		Err(failure) => {
			report_unhooked(mission_id, &failure);
			UNHEARD.to_owned()
		}
	}
}

fn install<R: Runtime>(
	app: &AppHandle<R>,
	mission_id: &str,
	workspace: &str,
	key: &str,
) -> Result<(), MissionError> {
	hook::installed(&hook::dir(app, mission_id)?, workspace, &hook_url(app)?, key)
}

pub async fn install_hooks_at_launch<R: Runtime>(app: &AppHandle<R>) {
	let missions = match at_launch(app).await {
		Ok(missions) => missions,
		Err(failure) => {
			return eprintln!("the open missions holding a checkout were not read: {failure:?}")
		}
	};
	for mission in missions {
		if let Err(failure) =
			install(app, &mission.id, &mission.workspace_path, &mission.delivery_key)
		{
			report_unhooked(&mission.id, &failure);
		}
	}
}

async fn at_launch<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<HookedMission>, MissionError> {
	let state = app.state::<db::DatabaseState>();
	ready(&state)?.missions().hooked().await
}

fn report_unhooked(mission_id: &str, failure: &MissionError) {
	eprintln!("the agent hook of {mission_id} was not installed: {failure:?}");
}

pub async fn mission_note<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	entry: MissionEntry,
) -> Result<Mission, MissionError> {
	appended(&app, &state, mission_id, entry).await
}

pub async fn mission_status<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	source: String,
	text: String,
) -> Result<Mission, MissionError> {
	refuse_blank("text", &text)?;
	let entry = MissionEntry {
		kind: MissionEventKind::Status,
		source,
		payload: serde_json::json!({ "text": text }),
	};
	appended(&app, &state, mission_id, entry).await
}

pub async fn mission_escalate<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	note: MissionNote,
) -> Result<Mission, MissionError> {
	appended(&app, &state, mission_id, MissionEntry::of(MissionEventKind::Escalated, note)).await
}

pub async fn mission_conclude<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	closing: MissionClosing,
) -> Result<Mission, MissionError> {
	refuse_blank("source", &closing.source)?;
	let written = ready(&state)?.missions().close(mission_id, closing).await?;
	announce_change(&app, &written)?;
	Ok(written)
}

#[tauri::command]
#[specta::specta]
pub async fn mission_close<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
) -> Result<Mission, MissionError> {
	let written = ready(&state)?.missions().dismiss(mission_id, PERSON.to_owned()).await?;
	announce_change(&app, &written)?;
	Ok(written)
}

#[tauri::command]
#[specta::specta]
pub async fn mission_reopen<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
) -> Result<Mission, MissionError> {
	let written = ready(&state)?.missions().reopen(mission_id, PERSON.to_owned()).await?;
	announce_change(&app, &written)?;
	Ok(written)
}

pub async fn mission_reopen_unmerged<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	source: String,
) -> Result<Mission, MissionError> {
	let database = ready(&state)?;
	refuse_a_merged_mission(database, &mission_id).await?;
	let written = database.missions().reopen(mission_id, source).await?;
	announce_change(&app, &written)?;
	Ok(written)
}

async fn refuse_a_merged_mission(
	database: &db::Database,
	mission_id: &str,
) -> Result<(), MissionError> {
	let held = mission_row(database, mission_id).await?;
	let stored = database
		.missions()
		.fingerprint(held.id.clone())
		.await?
		.ok_or_else(|| MissionError::UnknownMission { id: held.id.clone() })?;
	match github::merged_pull_request(&stored)? {
		Some(pull_request) => Err(MissionError::PullRequestMerged {
			id: held.id,
			pull_request,
			url: held.pull_request_url,
		}),
		None => Ok(()),
	}
}

pub async fn mission_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	update: MissionUpdate,
	source: String,
) -> Result<Mission, MissionError> {
	refused_update(&mission_id, &update)?;
	let written = ready(&state)?.missions().update(mission_id, update, source).await?;
	announce_change(&app, &written)?;
	Ok(written)
}

fn refused_update(mission_id: &str, update: &MissionUpdate) -> Result<(), MissionError> {
	if update.fields().is_empty() {
		return Err(MissionError::NothingToUpdate { id: mission_id.to_owned() });
	}
	if let Some(objective) = &update.objective {
		refuse_blank("objective", objective)?;
	}
	if let Some(ticket) = &update.ticket {
		refuse_blank("ticket.platform", &ticket.platform)?;
		refuse_blank("ticket.externalId", &ticket.external_id)?;
	}
	Ok(())
}

struct Successor {
	id: String,
	name: String,
}

pub async fn mission_handoff<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	from_bot_id: String,
	companion: String,
) -> Result<Mission, MissionError> {
	let database = ready(&state)?;
	let held = mission_row(database, &mission_id).await?;
	let successor = successor_of(database, &held, &companion).await?;
	seat_participant(
		&app,
		database,
		held.origin_conversation_id.clone(),
		successor.id.clone(),
		Some(from_bot_id.clone()),
	)
	.await?;
	let handoff = MissionHandoff {
		from_bot_id: from_bot_id.clone(),
		to_bot_id: successor.id.clone(),
		source: BOT.to_owned(),
	};
	let written = database.missions().hand_off(mission_id, handoff).await?;
	announce_change(&app, &written)?;
	if written.closed_at.is_none() {
		summon(&app, &written, from_bot_id, &successor.name)?;
	}
	Ok(written)
}

async fn successor_of(
	database: &db::Database,
	held: &Mission,
	companion: &str,
) -> Result<Successor, MissionError> {
	let roster = database.conversations().bots(held.space_id.clone()).await?;
	let picked = picked(&roster, companion)?;
	if picked.id == held.bot_id {
		return Err(MissionError::AlreadyTheOwner {
			id: held.id.clone(),
			bot_id: picked.id.clone(),
		});
	}
	Ok(Successor { id: picked.id.clone(), name: picked.name.clone() })
}

fn summon<R: Runtime>(
	app: &AppHandle<R>,
	mission: &Mission,
	from_bot_id: String,
	successor: &str,
) -> Result<(), MissionError> {
	let spoken = CompanionSpoke {
		conversation_id: mission.thread_conversation_id.clone(),
		author_bot_id: from_bot_id,
		text: format!("@{successor} {HANDED_OVER} {}", mission.objective),
	};
	events::emit(app, COMPANION_SPOKE, spoken)
		.map_err(|error| MissionError::Undeliverable { detail: error.to_string() })
}

async fn appended<R: Runtime>(
	app: &AppHandle<R>,
	state: &State<'_, db::DatabaseState>,
	mission_id: String,
	entry: MissionEntry,
) -> Result<Mission, MissionError> {
	refuse_blank("source", &entry.source)?;
	let written = ready(state)?.missions().append(mission_id, entry).await?;
	announce_change(app, &written)?;
	Ok(written)
}

#[tauri::command]
#[specta::specta]
pub async fn mission_answered<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	seq: i64,
) -> Result<Mission, MissionError> {
	match ready(&state)?.missions().answer(mission_id, seq, BOT.to_owned()).await? {
		MissionAnswer::Appended(written) => {
			announce_change(&app, &written)?;
			Ok(written)
		}
		MissionAnswer::Stale(stored) => Ok(stored),
	}
}

pub async fn mission_watch<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	watch: MissionWatch,
) -> Result<MissionWatching, MissionError> {
	let watch = normalised(watch);
	refused_watch(&watch)?;
	let url = hook_url(&app)?;
	let database = ready(&state)?;
	let (armed, key) =
		database.missions().arm(mission_id, watch, uuid::Uuid::new_v4().to_string()).await?;
	let mission = recounted_once(&app, database, armed).await;
	Ok(MissionWatching { mission, url, key, header: HEADER.to_owned() })
}

async fn recounted_once<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	armed: Mission,
) -> Mission {
	let mission = match counted_in_its_checkout(database, &armed.id).await {
		Ok(Some(written)) => written,
		Ok(None) => armed,
		Err(failure) => {
			eprintln!("mission {} was armed and its checkout not counted: {failure:?}", armed.id);
			armed
		}
	};
	checkout::told(app, &mission);
	mission
}

async fn counted_in_its_checkout(
	database: &db::Database,
	mission_id: &str,
) -> Result<Option<Mission>, MissionError> {
	let Some(workspace) = database.missions().workspace(mission_id.to_owned()).await? else {
		return Ok(None);
	};
	checkout::recounted(database, mission_id, &workspace).await
}

fn normalised(watch: MissionWatch) -> MissionWatch {
	MissionWatch {
		branch: watch.branch.trim().to_owned(),
		repository: watch.repository.trim().to_owned(),
	}
}

fn trimmed(path: Option<String>) -> Option<String> {
	path.map(|path| path.trim().to_owned()).filter(|path| !path.is_empty())
}

fn refused_workspace(workspace: Option<&str>) -> Result<(), MissionError> {
	match workspace {
		Some(workspace) => hook::checkout(workspace).map(|_| ()),
		None => Ok(()),
	}
}

fn refused_watch(watch: &MissionWatch) -> Result<(), MissionError> {
	refuse_blank("branch", &watch.branch)?;
	refuse_blank("repository", &watch.repository)?;
	refuse_unnamed(&watch.repository)
}

fn refuse_unnamed(repository: &str) -> Result<(), MissionError> {
	match repository.split('/').collect::<Vec<_>>().as_slice() {
		[owner, name] if !owner.is_empty() && !name.is_empty() => Ok(()),
		_ => Err(MissionError::Undeliverable {
			detail: "a repository is named owner then slash then name".to_owned(),
		}),
	}
}

fn hook_url<R: Runtime>(app: &AppHandle<R>) -> Result<String, MissionError> {
	app.try_state::<Webhook>().and_then(|webhook| webhook.mission_url()).ok_or_else(|| {
		MissionError::Undeliverable { detail: "the local server answers no call".to_owned() }
	})
}

#[tauri::command]
#[specta::specta]
pub async fn mission_list(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<ConversationMissions, MissionError> {
	ready(&state)?.missions().of_conversation(conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_detail(
	state: State<'_, db::DatabaseState>,
	mission_id: String,
) -> Result<MissionDetail, MissionError> {
	ready(&state)?.missions().detail(mission_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_board<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	let database = ready(&state)?;
	with_their_bots(&app, database, database.missions().still_open().await?).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_space_feed(
	state: State<'_, db::DatabaseState>,
	space_id: String,
	closed_since: i64,
) -> Result<Vec<MissionInSpace>, MissionError> {
	ready(&state)?.missions().of_space(space_id, closed_since).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_space_page(
	state: State<'_, db::DatabaseState>,
	space_id: String,
	closed_since: i64,
	cursor: Option<String>,
	limit: Option<u32>,
) -> Result<MissionSpacePage, MissionError> {
	let after =
		keyset::after(cursor).map_err(|cursor| MissionError::UnreadableCursor { cursor })?;
	let page = ready(&state)?
		.missions()
		.space_page(space_id, closed_since, after, keyset::page_size(limit))
		.await?;
	Ok(MissionSpacePage {
		missions: page.rows,
		next_cursor: page.next.map(|keyset| keyset.encoded()),
	})
}

#[tauri::command]
#[specta::specta]
pub async fn mission_unreported<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	let database = ready(&state)?;
	with_their_bots(&app, database, database.missions().closed_without_report().await?).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_reported(
	state: State<'_, db::DatabaseState>,
	mission_id: String,
	turn_id: Option<String>,
) -> Result<Mission, MissionError> {
	ready(&state)?.missions().report(mission_id, turn_id).await
}

async fn with_their_bots<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	missions: Vec<Mission>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	let dir = avatars::Avatars::dir(app);
	let bundle_root = bundles::root(app);
	let mut board = Vec::new();
	for mission in missions {
		let bot = bot_row(database, &mission.bot_id).await?;
		board.push(MissionOnBoard {
			mission,
			bot: Bot::of(bot, dir.as_deref(), bundle_root.as_deref()),
		});
	}
	Ok(board)
}

pub(crate) async fn mission_row(
	database: &db::Database,
	id: &str,
) -> Result<Mission, MissionError> {
	database
		.missions()
		.held(id.to_owned())
		.await?
		.ok_or_else(|| MissionError::UnknownMission { id: id.to_owned() })
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::sync::mpsc::channel;

	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener as _};

	use super::super::contract::{MissionOutcome, Ticket};
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'work', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0), ('c2', 'b2', 'lead', 1, 0);
	";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("mission-commands-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the spaces are planted");
		app
	}

	fn a_draft(conversation_id: &str, bot_id: &str, objective: &str) -> MissionDraft {
		MissionDraft {
			origin_conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
			objective: objective.to_owned(),
			ticket: Ticket {
				platform: "github".to_owned(),
				external_id: "42".to_owned(),
				url: "https://kiroshi.test/tickets/42".to_owned(),
				title: "Crash on open".to_owned(),
			},
			tools: vec!["gh".to_owned()],
			source: "bot".to_owned(),
			workspace_path: None,
		}
	}

	async fn a_mission(app: &App<MockRuntime>, draft: MissionDraft) -> Mission {
		mission_open(app.handle().clone(), app.state(), draft)
			.await
			.expect("the mission opens")
			.mission
	}

	fn a_note() -> MissionNote {
		MissionNote { source: "human".to_owned(), payload: json!({}) }
	}

	fn a_closing(outcome: MissionOutcome) -> MissionClosing {
		MissionClosing {
			source: "human".to_owned(),
			outcome,
			summary: "The objective is settled".to_owned(),
		}
	}

	#[tokio::test]
	async fn the_board_holds_every_open_mission_of_every_space_with_its_bot_and_its_state() {
		let app = a_host("board").await;
		let here = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		let there = a_mission(&app, a_draft("c2", "b2", "Ship it")).await;
		let done = a_mission(&app, a_draft("c2", "b2", "Old work")).await;
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the store is open");
		db::opened_on(database, &here.id, 1).await;
		db::opened_on(database, &there.id, 2).await;
		db::opened_on(database, &done.id, 3).await;
		mission_escalate(app.handle().clone(), app.state(), here.id.clone(), a_note())
			.await
			.expect("the mission is escalated");
		mission_conclude(
			app.handle().clone(),
			app.state(),
			done.id,
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission is closed");

		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");

		assert_eq!(
			board
				.iter()
				.map(|held| (held.mission.id.clone(), held.bot.name.clone(), held.mission.state))
				.collect::<Vec<_>>(),
			vec![
				(here.id, "First".to_owned(), MissionState::WaitingHuman),
				(there.id, "Second".to_owned(), MissionState::Working),
			],
			"the board lost an open mission, its bot or its state"
		);
	}

	#[tokio::test]
	async fn a_closed_mission_owes_a_report_until_one_is_recorded_and_recording_stays_silent() {
		let app = a_host("unreported").await;
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		let open = a_mission(&app, a_draft("c1", "b1", "Ship it")).await;
		mission_conclude(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");
		a_turn_in(&app, "t1", "c1").await;
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let owed = mission_unreported(app.handle().clone(), app.state())
			.await
			.expect("the missions owing a report read");
		let recorded = mission_reported(app.state(), opened.id.clone(), Some("t1".to_owned()))
			.await
			.expect("the report is recorded");
		let settled = mission_unreported(app.handle().clone(), app.state())
			.await
			.expect("the missions owing a report read");

		assert_eq!(
			owed.iter().map(|held| held.mission.id.clone()).collect::<Vec<_>>(),
			vec![opened.id.clone()],
			"the closed mission is not the only one owing a report"
		);
		assert_eq!(owed[0].bot.name, "First", "the mission owing a report came without its bot");
		assert_eq!(recorded.reported_turn_id, Some("t1".to_owned()));
		assert!(recorded.reported_at.is_some(), "the recorded report carries no moment");
		assert!(settled.is_empty(), "a mission that reported still owes one");
		assert!(
			received.try_recv().is_err(),
			"recording a report told the front the mission moved"
		);
		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");
		assert_eq!(
			board.iter().map(|held| held.mission.id.clone()).collect::<Vec<_>>(),
			vec![open.id],
			"the board stopped answering open missions only"
		);
	}

	async fn a_turn_in(app: &App<MockRuntime>, id: &str, conversation_id: &str) {
		let statement = format!(
			"INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('{id}', '{conversation_id}', 1, 1)"
		);
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(move |connection| Ok(connection.execute_batch(&statement)?))
			.await
			.expect("the turn is planted");
	}

	#[tokio::test]
	async fn closing_on_a_failed_outcome_appends_failed_carries_the_summary_and_shuts_the_mission()
	{
		let app = a_host("failed-close").await;
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;

		let closed = mission_conclude(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Failed),
		)
		.await
		.expect("the mission closes");

		assert_eq!(closed.state, MissionState::Failed, "got {:?}", closed.state);
		assert!(closed.closed_at.is_some(), "the failed close left the mission open");
		let detail =
			mission_detail(app.state(), opened.id.clone()).await.expect("the mission detail reads");
		assert_eq!(detail.mission.closed_at, closed.closed_at, "the moment it closed moved");
		let last = detail.events.last().expect("the close event is there");
		assert_eq!(last.kind, MissionEventKind::Failed, "got {:?}", last.kind);
		assert_eq!(
			last.payload,
			json!({ "outcome": "failed", "summary": "The objective is settled" }),
			"the failed close lost its outcome or its summary"
		);

		let refused = mission_note(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			MissionEntry::of(MissionEventKind::Note, a_note()),
		)
		.await
		.expect_err("the closed mission refuses an event");
		assert_eq!(refused, MissionError::MissionAlreadyClosed { id: opened.id });
	}

	#[tokio::test]
	async fn closing_on_a_done_outcome_appends_closed_and_carries_the_summary() {
		let app = a_host("done-close").await;
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;

		let closed = mission_conclude(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");

		assert_eq!(closed.state, MissionState::Done, "got {:?}", closed.state);
		assert!(closed.closed_at.is_some(), "the done close left the mission open");
		let detail =
			mission_detail(app.state(), opened.id).await.expect("the mission detail reads");
		let last = detail.events.last().expect("the close event is there");
		assert_eq!(last.kind, MissionEventKind::Closed, "got {:?}", last.kind);
		assert_eq!(
			last.payload,
			json!({ "outcome": "done", "summary": "The objective is settled" }),
			"the done close lost its outcome or its summary"
		);
	}

	async fn an_agent_question(app: &App<MockRuntime>, mission_id: &str) -> Mission {
		mission_note(
			app.handle().clone(),
			app.state(),
			mission_id.to_owned(),
			MissionEntry::of(MissionEventKind::AgentAsked, a_note()),
		)
		.await
		.expect("the question is appended")
	}

	#[tokio::test]
	async fn the_answer_at_the_standing_seq_works_the_mission_again_and_a_new_question_waits_it() {
		let app = a_host("answered").await;
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let asked = an_agent_question(&app, &opened.id).await;
		let answered =
			mission_answered(app.handle().clone(), app.state(), opened.id.clone(), asked.state_seq)
				.await
				.expect("the answer is recorded");
		let asked_again = an_agent_question(&app, &opened.id).await;

		assert_eq!(
			[asked.state, answered.state, asked_again.state],
			[MissionState::WaitingBot, MissionState::Working, MissionState::WaitingBot],
			"the mission did not go back to working once its bot had answered"
		);
		assert!(
			asked.state_seq < answered.state_seq && answered.state_seq < asked_again.state_seq,
			"the seq of the state did not grow: {} then {} then {}",
			asked.state_seq,
			answered.state_seq,
			asked_again.state_seq
		);
		let announced: Vec<serde_json::Value> = received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect();
		assert_eq!(
			announced,
			vec![
				json!({
					"missionId": opened.id,
					"spaceId": "personal",
					"state": "waiting_bot",
					"stateSeq": asked.state_seq,
					"isAgentRunning": false,
					"lastActivityAt": null
				}),
				json!({
					"missionId": opened.id,
					"spaceId": "personal",
					"state": "working",
					"stateSeq": answered.state_seq,
					"isAgentRunning": false,
					"lastActivityAt": null
				}),
				json!({
					"missionId": opened.id,
					"spaceId": "personal",
					"state": "waiting_bot",
					"stateSeq": asked_again.state_seq,
					"isAgentRunning": false,
					"lastActivityAt": null
				}),
			],
			"the front was not told the mission waited, worked, then waited again"
		);
	}

	#[tokio::test]
	async fn an_answer_older_than_the_standing_seq_appends_nothing_and_says_nothing() {
		let app = a_host("stale-answer").await;
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		let asked = an_agent_question(&app, &opened.id).await;
		let before =
			mission_detail(app.state(), opened.id.clone()).await.expect("the detail reads");
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let answered = mission_answered(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			asked.state_seq - 1,
		)
		.await
		.expect("the stale answer is taken");

		let after = mission_detail(app.state(), opened.id).await.expect("the detail reads");
		assert_eq!(after.events.len(), before.events.len(), "the stale answer appended an event");
		assert_eq!(
			(answered.state, answered.state_seq),
			(asked.state, asked.state_seq),
			"the stale answer moved the mission"
		);
		assert!(received.try_recv().is_err(), "the stale answer told the front the mission moved");
	}

	#[tokio::test]
	async fn an_answer_at_the_standing_seq_of_a_closed_mission_appends_nothing_and_says_nothing() {
		let app = a_host("closed-answer").await;
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		let closed = mission_conclude(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");
		let before =
			mission_detail(app.state(), opened.id.clone()).await.expect("the detail reads");
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let answered = mission_answered(
			app.handle().clone(),
			app.state(),
			opened.id.clone(),
			closed.state_seq,
		)
		.await
		.expect("the closed mission takes the answer quietly");

		let after = mission_detail(app.state(), opened.id).await.expect("the detail reads");
		assert_eq!(
			after.events.len(),
			before.events.len(),
			"the answer of a closed mission appended an event"
		);
		assert_eq!(
			(answered.state, answered.state_seq),
			(closed.state, closed.state_seq),
			"the answer moved a closed mission"
		);
		assert!(
			received.try_recv().is_err(),
			"the answer of a closed mission told the front it moved"
		);
	}

	#[tokio::test]
	async fn a_write_tells_the_front_which_mission_moved_and_where_it_stands() {
		let app = a_host("announced").await;
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		mission_escalate(app.handle().clone(), app.state(), opened.id.clone(), a_note())
			.await
			.expect("the mission is escalated");

		let announced: Vec<serde_json::Value> = received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect();
		assert_eq!(
			announced,
			vec![
				json!({
					"missionId": opened.id,
					"spaceId": "personal",
					"state": "working",
					"stateSeq": 1,
					"isAgentRunning": false,
					"lastActivityAt": null,
				}),
				json!({
					"missionId": opened.id,
					"spaceId": "personal",
					"state": "waiting_human",
					"stateSeq": 2,
					"isAgentRunning": false,
					"lastActivityAt": null,
				}),
			],
			"the front was not told which mission moved and where it stands"
		);
		let read = mission_detail(app.state(), opened.id).await.expect("the mission detail reads");
		assert_eq!(
			read.mission.space_id.as_deref(),
			Some("personal"),
			"the mission read does not name the Space of its conversation"
		);
	}

	fn a_workspace(name: &str) -> RemovedOnDrop {
		let path = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-mission-hook-{name}-{}", std::process::id())),
		);
		let _ = fs::remove_dir_all(&path);
		fs::create_dir_all(&path).expect("the workspace is there");
		path
	}

	fn a_checkout(name: &str) -> RemovedOnDrop {
		let path = a_workspace(name);
		fs::write(path.join(".git"), "gitdir: /elsewhere/.git/worktrees/one")
			.expect("the git file lands");
		path
	}

	fn a_watch(branch: &str) -> MissionWatch {
		MissionWatch {
			branch: branch.to_owned(),
			repository: "shoto290/kiroshi-monorepo".to_owned(),
		}
	}

	fn drafted_in(objective: &str, workspace: Option<&std::path::Path>) -> MissionDraft {
		MissionDraft {
			workspace_path: workspace.map(|path| path.to_string_lossy().into_owned()),
			..a_draft("c1", "b1", objective)
		}
	}

	fn hooked_in(workspace: &std::path::Path) -> String {
		fs::read_to_string(workspace.join(".claude").join("settings.local.json"))
			.expect("the settings of the workspace read")
	}

	#[tokio::test]
	async fn opening_on_a_checkout_installs_the_hook_there_and_answers_that_the_agent_is_heard() {
		let app = a_host("opened-hook").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let workspace = a_checkout("opened-hook");

		let opened =
			mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", Some(&workspace)))
				.await
				.expect("the mission opens");

		assert_eq!(opened.reach, HEARD, "the answer did not tell the mission hears its agent");
		let settings = hooked_in(&workspace);
		assert!(settings.contains("kiroshi-agent-hook.sh"), "got {settings}");
		let hooked = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.missions()
			.hooked()
			.await
			.expect("the missions holding a checkout read");
		assert_eq!(
			hooked.iter().map(|held| held.id.clone()).collect::<Vec<_>>(),
			vec![opened.mission.id.clone()],
			"the mission did not keep the checkout its open call named"
		);
		assert!(!hooked[0].delivery_key.is_empty(), "the open call minted no delivery key");

		let armed = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.mission.id.clone(),
			a_watch("feature/ope-56"),
		)
		.await
		.expect("the mission is armed");

		assert_eq!(armed.key, hooked[0].delivery_key, "arming minted another key");
		let still = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.missions()
			.hooked()
			.await
			.expect("the missions holding a checkout read");
		assert_eq!(still, hooked, "arming lost the checkout or the key the open call wrote");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&workspace).expect("cleanup");
	}

	fn a_repository(name: &str) -> RemovedOnDrop {
		let path = a_workspace(name);
		for arguments in [
			&["init", "--quiet", "--initial-branch", "main"][..],
			&["commit", "--quiet", "--allow-empty", "-m", "base"],
			&["update-ref", "refs/remotes/origin/main", "HEAD"],
			&["commit", "--quiet", "--allow-empty", "-m", "ahead"],
		] {
			let ran = std::process::Command::new("git")
				.arg("-C")
				.arg(&*path)
				.args(arguments)
				.env("GIT_AUTHOR_NAME", "Kiroshi")
				.env("GIT_AUTHOR_EMAIL", "kiroshi@kiroshi.test")
				.env("GIT_COMMITTER_NAME", "Kiroshi")
				.env("GIT_COMMITTER_EMAIL", "kiroshi@kiroshi.test")
				.status()
				.expect("git runs");
			assert!(ran.success(), "git {arguments:?} failed");
		}
		fs::write(path.join(".gitignore"), ".claude/\n.gitignore\n").expect("the ignore lands");
		fs::write(path.join("loose"), "untracked").expect("the loose file lands");
		path
	}

	#[tokio::test]
	async fn arming_a_mission_counts_its_checkout_at_once() {
		let app = a_host("armed-counts").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let workspace = a_repository("armed-counts");
		let opened =
			mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", Some(&workspace)))
				.await
				.expect("the mission opens");

		let armed = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.mission.id.clone(),
			a_watch("feature/ope-56"),
		)
		.await
		.expect("the mission is armed");

		assert_eq!(
			(armed.mission.commits_ahead, armed.mission.dirty_files),
			(Some(1), Some(1)),
			"the checkout was not counted on arming"
		);

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&workspace).expect("cleanup");
	}

	async fn an_open_mission(
		name: &str,
		workspace: Option<&std::path::Path>,
	) -> (AppOfItsOwn, String) {
		let app = a_host(name).await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let opened =
			mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", workspace))
				.await
				.expect("the mission opens");
		(app, opened.mission.id)
	}

	async fn armed_and_announced(
		app: &AppOfItsOwn,
		mission_id: String,
	) -> (MissionWatching, Vec<serde_json::Value>) {
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			sender.send(event.payload().to_owned()).expect("the test hears the changes");
		});

		let armed = mission_watch(
			app.handle().clone(),
			app.state(),
			mission_id,
			a_watch("feature/ope-602"),
		)
		.await
		.expect("the mission is armed");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		let announced = received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect();
		(armed, announced)
	}

	fn assert_announced_once(armed: &MissionWatching, announced: &[serde_json::Value]) {
		assert_eq!(armed.mission.branch.as_deref(), Some("feature/ope-602"));
		assert_eq!(
			announced.iter().map(|change| change["missionId"].clone()).collect::<Vec<_>>(),
			vec![json!(armed.mission.id)],
			"arming did not announce the mission exactly once"
		);
	}

	#[tokio::test]
	async fn arming_a_mission_whose_checkout_is_gone_announces_it_once() {
		let workspace = a_repository("gone-checkout");
		let (app, mission_id) = an_open_mission("gone-checkout", Some(&workspace)).await;
		fs::remove_dir_all(&workspace).expect("the checkout is deleted");

		let (armed, announced) = armed_and_announced(&app, mission_id).await;

		assert_announced_once(&armed, &announced);
	}

	#[tokio::test]
	async fn arming_a_mission_opened_without_a_workspace_announces_it_once() {
		let (app, mission_id) = an_open_mission("bare-watch", None).await;

		let (armed, announced) = armed_and_announced(&app, mission_id).await;

		assert_announced_once(&armed, &announced);
	}

	#[tokio::test]
	async fn arming_a_mission_on_a_live_checkout_announces_it_once() {
		let workspace = a_repository("live-checkout");
		let (app, mission_id) = an_open_mission("live-checkout", Some(&workspace)).await;

		let (armed, announced) = armed_and_announced(&app, mission_id).await;

		assert_announced_once(&armed, &announced);
		fs::remove_dir_all(&workspace).expect("cleanup");
	}

	#[tokio::test]
	async fn opening_without_a_checkout_writes_the_mission_and_answers_that_no_agent_reaches_it() {
		let app = a_host("opened-bare").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));

		let opened = mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", None))
			.await
			.expect("the mission opens");

		assert_eq!(opened.reach, UNHEARD, "got {}", opened.reach);
		assert_eq!(opened.mission.state, MissionState::Working);
		let hooked = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.missions()
			.hooked()
			.await
			.expect("the missions holding a checkout read");
		assert!(hooked.is_empty(), "got {hooked:?}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
	}

	#[tokio::test]
	async fn opening_with_no_local_server_keeps_the_mission_and_answers_why_no_agent_reaches_it() {
		let app = a_host("opened-serverless").await;
		let workspace = a_checkout("opened-serverless");

		let opened =
			mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", Some(&workspace)))
				.await
				.expect("the mission opens");

		assert!(opened.reach.starts_with(UNHEARD), "got {}", opened.reach);
		assert!(opened.reach.contains("local server answers no call"), "got {}", opened.reach);
		assert!(!opened.reach.contains("Undeliverable"), "got {}", opened.reach);
		assert!(opened.mission.closed_at.is_none(), "the mission did not stay open");
		assert!(!workspace.join(".claude").exists(), "a hook landed without an address");

		fs::remove_dir_all(&workspace).expect("cleanup");
	}

	#[tokio::test]
	async fn opening_on_a_workspace_that_is_no_git_checkout_refuses_and_writes_no_mission() {
		let app = a_host("no-git").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let workspace = a_workspace("no-git");

		let refused =
			mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", Some(&workspace)))
				.await
				.expect_err("the workspace that is no git checkout is refused");

		assert!(matches!(refused, MissionError::Undeliverable { .. }), "got {refused:?}");
		assert!(!workspace.join(".claude").exists(), "the refused workspace was written in");
		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");
		assert!(board.is_empty(), "got {board:?}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&workspace).expect("cleanup");
	}

	async fn read_first(app: &App<MockRuntime>, mission_id: &str) {
		let statement = format!("UPDATE missions SET opened_at = 1 WHERE id = '{mission_id}'");
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(move |connection| Ok(connection.execute_batch(&statement)?))
			.await
			.expect("the mission is aged");
	}

	#[tokio::test]
	async fn a_launch_hooks_every_open_mission_holding_a_checkout_and_reports_the_one_that_is_gone()
	{
		let app = a_host("launch").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let gone = a_checkout("launch-gone");
		let here = a_checkout("launch-here");
		let leaving =
			mission_open(app.handle().clone(), app.state(), drafted_in("Ship it", Some(&gone)))
				.await
				.expect("the mission opens");
		mission_open(app.handle().clone(), app.state(), drafted_in("Fix it", Some(&here)))
			.await
			.expect("the mission opens");
		read_first(&app, &leaving.mission.id).await;
		fs::remove_dir_all(here.join(".claude")).expect("the settings are wiped");
		fs::remove_dir_all(&gone).expect("the checkout is gone");

		install_hooks_at_launch(app.handle()).await;

		let settings = hooked_in(&here);
		assert!(settings.contains("kiroshi-agent-hook.sh"), "got {settings}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&here).expect("cleanup");
	}

	#[tokio::test]
	async fn arming_refuses_an_unknown_mission_a_closed_one_and_a_repository_without_an_owner() {
		let app = a_host("refused").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let opened = a_mission(&app, a_draft("c1", "b1", "Fix it")).await;
		let done = a_mission(&app, a_draft("c1", "b1", "Old work")).await;
		mission_conclude(
			app.handle().clone(),
			app.state(),
			done.id.clone(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect("the mission closes");

		let unknown = mission_watch(
			app.handle().clone(),
			app.state(),
			"x9".to_owned(),
			a_watch("feature/ope-27"),
		)
		.await
		.expect_err("the unknown mission is refused");
		let closed = mission_watch(
			app.handle().clone(),
			app.state(),
			done.id.clone(),
			a_watch("feature/ope-27"),
		)
		.await
		.expect_err("the closed mission is refused");
		let unnamed = mission_watch(
			app.handle().clone(),
			app.state(),
			opened.id,
			MissionWatch { branch: "feature/ope-27".to_owned(), repository: "Kiroshi".to_owned() },
		)
		.await
		.expect_err("the repository without an owner is refused");

		assert_eq!(unknown, MissionError::UnknownMission { id: "x9".to_owned() });
		assert_eq!(closed, MissionError::MissionAlreadyClosed { id: done.id });
		assert!(matches!(unnamed, MissionError::Undeliverable { .. }), "got {unnamed:?}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
	}

	#[tokio::test]
	async fn a_command_naming_a_mission_no_row_holds_refuses_and_writes_nothing() {
		let app = a_host("unknown").await;

		let refused = mission_conclude(
			app.handle().clone(),
			app.state(),
			"x9".to_owned(),
			a_closing(MissionOutcome::Done),
		)
		.await
		.expect_err("the close is refused");

		assert_eq!(refused, MissionError::UnknownMission { id: "x9".to_owned() });
		let board =
			mission_board(app.handle().clone(), app.state()).await.expect("the board reads");
		assert!(board.is_empty(), "got {board:?}");
	}
}
