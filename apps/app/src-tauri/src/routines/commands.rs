pub use kiroshi_core::routines::commands::*;

use tauri::State;

use super::contract::{
	BotTriggerSources, ReportedRun, Routine, RoutineDraft, RoutineEdit, RoutineError, RoutineKey,
	RoutineRun, RoutineRuns, RunClosing, TriggerDecision, TriggerSource,
};
use crate::conversations::contract::TranscriptStoreError;

#[tauri::command]
#[specta::specta]
pub async fn routine_trigger_sources(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	kiroshi_core::routines::commands::routine_trigger_sources(core.inner(), bot_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_trigger_sources_of_space(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<BotTriggerSources>, TranscriptStoreError> {
	kiroshi_core::routines::commands::routine_trigger_sources_of_space(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_create(
	core: State<'_, crate::core_context::Core>,
	draft: RoutineDraft,
) -> Result<Routine, RoutineError> {
	kiroshi_core::routines::commands::routine_create(core.inner(), draft).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_update(
	core: State<'_, crate::core_context::Core>,
	id: String,
	edit: RoutineEdit,
) -> Result<Routine, RoutineError> {
	kiroshi_core::routines::commands::routine_update(core.inner(), id, edit).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_delete(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<(), RoutineError> {
	kiroshi_core::routines::commands::routine_delete(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_list(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<Routine>, RoutineError> {
	kiroshi_core::routines::commands::routine_list(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_runs(
	core: State<'_, crate::core_context::Core>,
	routine_id: String,
	limit: u32,
) -> Result<Vec<RoutineRun>, RoutineError> {
	kiroshi_core::routines::commands::routine_runs(core.inner(), routine_id, limit).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_runs_of_space(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	limit: u32,
) -> Result<Vec<RoutineRuns>, RoutineError> {
	kiroshi_core::routines::commands::routine_runs_of_space(core.inner(), space_id, limit).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_reported_runs(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<ReportedRun>, RoutineError> {
	kiroshi_core::routines::commands::routine_reported_runs(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_run_now(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<TriggerDecision, RoutineError> {
	kiroshi_core::routines::commands::routine_run_now(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_renew_lease(
	core: State<'_, crate::core_context::Core>,
	run_id: String,
) -> Result<(), RoutineError> {
	kiroshi_core::routines::commands::routine_renew_lease(core.inner(), run_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_close_run(
	core: State<'_, crate::core_context::Core>,
	run_id: String,
	closing: RunClosing,
) -> Result<RoutineRun, RoutineError> {
	kiroshi_core::routines::commands::routine_close_run(core.inner(), run_id, closing).await
}

#[tauri::command]
#[specta::specta]
pub async fn routine_key(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<RoutineKey, RoutineError> {
	kiroshi_core::routines::commands::routine_key(core.inner(), id).await
}
