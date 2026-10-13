use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State};

use super::contract::{
	Filter, ReportedRun, Routine, RoutineDraft, RoutineEdit, RoutineError, RoutineKey, RoutineRun,
	RunClosing, TriggerDecision, TriggerSource,
};
use super::core::{self, Clock, SystemClock};
use super::filter;
use super::runner::Runner;
use super::schedule;
use super::sources;
use super::webhook;
use crate::bundles;
use crate::conversations::commands::{oldest_space, ready, space_of_the_conversation};
use crate::conversations::contract::TranscriptStoreError;
use crate::db;
use crate::events::{self, ROUTINE_CHANGED};

pub const CHANGED_EVENT: &str = "routine://changed";

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RoutineChanged {
	pub conversation_id: String,
}

pub(crate) fn announce_change<R: Runtime>(
	app: &AppHandle<R>,
	conversation_id: &str,
) -> Result<(), RoutineError> {
	events::emit(
		app,
		ROUTINE_CHANGED,
		RoutineChanged { conversation_id: conversation_id.to_owned() },
	)
	.map_err(|error| RoutineError::Undeliverable { detail: error.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn routine_trigger_sources<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	let database = ready(&state)?;
	let space_id = oldest_space(database, &bot_id).await?;
	sources::stacked(&stacked_bundles(&app, &space_id, &bot_id))
}

fn stacked_bundles<R: Runtime>(app: &AppHandle<R>, space_id: &str, bot_id: &str) -> Vec<PathBuf> {
	[
		bundles::system::laid_down(app),
		bundles::space::laid_down(app, space_id),
		bundles::root(app).and_then(|root| bundles::dir(&root, bot_id).ok()),
	]
	.into_iter()
	.flatten()
	.collect()
}

pub(crate) async fn declared_source<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: &str,
	bot_id: &str,
	trigger_source_id: &str,
) -> Result<TriggerSource, RoutineError> {
	let space_id = space_of_the_conversation(database, conversation_id, bot_id).await?;
	let stacked = sources::stacked(&stacked_bundles(app, &space_id, bot_id))?;
	stacked
		.into_iter()
		.find(|source| source.id == trigger_source_id)
		.ok_or_else(|| RoutineError::UnknownSource { id: trigger_source_id.to_owned() })
}

async fn refuse_unsupported_rows<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: &str,
	bot_id: &str,
	trigger_source_id: &str,
	held: &Filter,
) -> Result<(), RoutineError> {
	let source = declared_source(app, database, conversation_id, bot_id, trigger_source_id).await?;
	filter::validate(&source.payload, held)
}

fn refuse_unreadable_expression(
	trigger_source_id: &str,
	trigger_config: &Value,
) -> Result<(), RoutineError> {
	if trigger_source_id != schedule::SOURCE_ID {
		return Ok(());
	}
	schedule::validated(trigger_config)
}

#[tauri::command]
#[specta::specta]
pub async fn routine_create<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	draft: RoutineDraft,
) -> Result<Routine, RoutineError> {
	let database = ready(&state)?;
	core::refuse_blank_task(&draft.title, &draft.instruction)?;
	refuse_unsupported_rows(
		&app,
		database,
		&draft.conversation_id,
		&draft.bot_id,
		&draft.trigger_source_id,
		&draft.filter,
	)
	.await?;
	refuse_unreadable_expression(&draft.trigger_source_id, &draft.trigger_config)?;
	let key = uuid::Uuid::new_v4().to_string();
	let stored = database.routines().create(draft, key, SystemClock.now_ms()).await?;
	announce_change(&app, &stored.conversation_id)?;
	Ok(stored)
}

#[tauri::command]
#[specta::specta]
pub async fn routine_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	edit: RoutineEdit,
) -> Result<Routine, RoutineError> {
	let database = ready(&state)?;
	core::refuse_blank_task(&edit.title, &edit.instruction)?;
	let held = routine_row(database, &id).await?;
	refuse_unsupported_rows(
		&app,
		database,
		&held.conversation_id,
		&held.bot_id,
		&held.trigger_source_id,
		&edit.filter,
	)
	.await?;
	refuse_unreadable_expression(&held.trigger_source_id, &edit.trigger_config)?;
	let stored = database.routines().update(id, edit).await?;
	announce_change(&app, &stored.conversation_id)?;
	Ok(stored)
}

#[tauri::command]
#[specta::specta]
pub async fn routine_delete<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), RoutineError> {
	let database = ready(&state)?;
	let held = routine_row(database, &id).await?;
	database.routines().delete(id).await?;
	announce_change(&app, &held.conversation_id)
}

#[tauri::command]
#[specta::specta]
pub async fn routine_list(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Vec<Routine>, RoutineError> {
	ready(&state)?.routines().of_conversation(conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_runs(
	state: State<'_, db::DatabaseState>,
	routine_id: String,
	limit: u32,
) -> Result<Vec<RoutineRun>, RoutineError> {
	ready(&state)?.routines().runs(routine_id, limit).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_reported_runs(
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
) -> Result<Vec<ReportedRun>, RoutineError> {
	ready(&state)?.routines().reported(conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_run_now<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<TriggerDecision, RoutineError> {
	let database = ready(&state)?;
	let held = routine_row(database, &id).await?;
	let decision = core::run_now(database, &Runner::new(app.clone()), &SystemClock, id).await?;
	announce_change(&app, &held.conversation_id)?;
	Ok(decision)
}

#[tauri::command]
#[specta::specta]
pub async fn routine_renew_lease(
	state: State<'_, db::DatabaseState>,
	run_id: String,
) -> Result<(), RoutineError> {
	ready(&state)?.routines().renew_lease(run_id, SystemClock.now_ms()).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_close_run(
	state: State<'_, db::DatabaseState>,
	run_id: String,
	closing: RunClosing,
) -> Result<RoutineRun, RoutineError> {
	ready(&state)?.routines().close_run(run_id, closing, SystemClock.now_ms()).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_key<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<RoutineKey, RoutineError> {
	let database = ready(&state)?;
	let held = routine_row(database, &id).await?;
	let source = declared_source(
		&app,
		database,
		&held.conversation_id,
		&held.bot_id,
		&held.trigger_source_id,
	)
	.await?;
	let key = database.routines().key_of(id).await?;
	let url = called_at(&app, &held.trigger_source_id);
	Ok(RoutineKey { key, header: source.header, url })
}

fn called_at<R: Runtime>(app: &AppHandle<R>, trigger_source_id: &str) -> Option<String> {
	if trigger_source_id != webhook::SOURCE_ID {
		return None;
	}
	app.try_state::<webhook::Webhook>().and_then(|webhook| webhook.url())
}

pub(crate) async fn routine_row(
	database: &db::Database,
	id: &str,
) -> Result<Routine, RoutineError> {
	database
		.routines()
		.held(id.to_owned())
		.await?
		.ok_or_else(|| RoutineError::UnknownRoutine { id: id.to_owned() })
}

#[cfg(test)]
mod tests {
	use std::fs;

	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::App;

	use super::*;
	use crate::routines::contract::{FilterMatchMode, RoutineDraft};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("routine-commands-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		let system = bundles::system::path(app.handle()).expect("the system bundle is named");
		bundles::system::write(&system).expect("the system bundle lands");
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
			.await
			.expect("the participant is planted");
		app
	}

	fn a_draft(expression: &str) -> RoutineDraft {
		RoutineDraft {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			title: "Nightly report".to_owned(),
			instruction: "Read the shift log and report what changed.".to_owned(),
			trigger_source_id: "schedule".to_owned(),
			filter: Filter { match_mode: FilterMatchMode::All, rows: Vec::new() },
			trigger_config: json!({ "expression": expression }),
		}
	}

	fn a_called_draft() -> RoutineDraft {
		RoutineDraft {
			trigger_source_id: webhook::SOURCE_ID.to_owned(),
			trigger_config: json!({}),
			..a_draft("0 * * * *")
		}
	}

	#[tokio::test]
	async fn only_a_routine_the_local_route_fires_is_answered_the_url_it_is_called_on() {
		let app = a_host("called-at").await;
		app.manage(webhook::start(app.handle().clone()));
		let called = routine_create(app.handle().clone(), app.state(), a_called_draft())
			.await
			.expect("the called routine is created");
		let scheduled = routine_create(app.handle().clone(), app.state(), a_draft("0 * * * *"))
			.await
			.expect("the scheduled routine is created");

		let answered = routine_key(app.handle().clone(), app.state(), called.id)
			.await
			.expect("the called routine answers its key");
		let silent = routine_key(app.handle().clone(), app.state(), scheduled.id)
			.await
			.expect("the scheduled routine answers its key");

		assert_eq!(
			answered.url,
			app.state::<webhook::Webhook>().url(),
			"the answer names the address the listener bound"
		);
		assert!(answered.url.is_some_and(|url| url.starts_with("http://127.0.0.1:")));
		assert_eq!(silent.url, None, "a scheduled routine is handed no address");
		app.state::<webhook::Webhook>().stop();
	}

	#[tokio::test]
	async fn a_schedule_whose_expression_croner_refuses_is_named_and_never_stored() {
		let app = a_host("refused").await;

		let failure = routine_create(app.handle().clone(), app.state(), a_draft("every tuesday"))
			.await
			.expect_err("the routine is refused");

		let RoutineError::UnreadableExpression { expression, reason } = failure else {
			panic!("got {failure:?}");
		};
		assert_eq!(expression, "every tuesday");
		assert!(!reason.is_empty(), "the reason is carried");
		let stored = routine_list(app.state(), "c1".to_owned()).await.expect("the routines read");
		assert!(stored.is_empty(), "got {stored:?}");
	}

	#[tokio::test]
	async fn an_expression_croner_reads_is_stored_and_can_be_edited_but_not_broken() {
		let app = a_host("stored").await;

		let stored = routine_create(app.handle().clone(), app.state(), a_draft("0 * * * *"))
			.await
			.expect("the routine is created");

		let broken = routine_update(
			app.handle().clone(),
			app.state(),
			stored.id.clone(),
			RoutineEdit {
				title: stored.title.clone(),
				instruction: stored.instruction.clone(),
				filter: stored.filter.clone(),
				trigger_config: json!({ "expression": "not a cron" }),
				is_enabled: true,
			},
		)
		.await
		.expect_err("the edit is refused");

		assert!(
			matches!(broken, RoutineError::UnreadableExpression { ref expression, .. }
				if expression == "not a cron"),
			"got {broken:?}"
		);
		let held = routine_list(app.state(), "c1".to_owned()).await.expect("the routines read");
		assert_eq!(held.len(), 1, "got {held:?}");
		assert_eq!(held[0].trigger_config, json!({ "expression": "0 * * * *" }));
	}

	const A_SECOND_SPACE: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('writers', 'Writers', 'blue', 1, 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'writers', 2);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c2', 'main', 'writers', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c2', 'b1', 'assistant', 1, 0);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c3', 'main', 'personal', 'Oldest', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c3', 'b1', 'assistant', 1, 0);
	";

	const SHIFT_LOG: &str = "shift-log";

	fn declaring_shift_log(app: &App<MockRuntime>, space_id: &str) {
		bundles::space::lay_down(app.handle(), space_id).expect("the plugin is laid down");
		let plugin = bundles::space::path(app.handle(), space_id).expect("the plugin is named");
		let declaration = json!({
			"sources": [{
				"id": SHIFT_LOG,
				"title": "Shift log",
				"payload": [{ "name": "at", "type": "datetime" }],
				"dedupeKey": "at",
			}],
		});
		fs::write(plugin.join(".triggers.json"), declaration.to_string())
			.expect("the declaration lands");
	}

	#[tokio::test]
	async fn a_trigger_source_is_read_from_the_space_the_conversation_stands_in() {
		let app = a_host("second-space").await;
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_SECOND_SPACE)?))
			.await
			.expect("the second space is planted");
		declaring_shift_log(&app, "writers");

		let source_of =
			|conversation| declared_source(app.handle(), database, conversation, "b1", SHIFT_LOG);
		let found = source_of("c2").await.expect("the source of the second space is stacked");
		let in_the_oldest =
			source_of("c3").await.expect_err("the source of another space is stacked");
		let named_by_no_space =
			source_of("c1").await.expect_err("the source of another space is stacked");

		assert_eq!(found.id, SHIFT_LOG);
		assert!(
			matches!(in_the_oldest, RoutineError::UnknownSource { ref id } if id == SHIFT_LOG),
			"got {in_the_oldest:?}"
		);
		assert!(
			matches!(named_by_no_space, RoutineError::UnknownSource { ref id } if id == SHIFT_LOG),
			"got {named_by_no_space:?}"
		);
	}
}
