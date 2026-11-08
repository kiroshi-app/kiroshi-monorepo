pub use kiroshi_core::agent::commands::*;

use crate::agent::contract::{
	AccountReport, CancelOutcome, CheckReport, ConversationNaming, LiveSession, OfferedModel,
	PermissionDecision, RuntimeScope, ScopedEvent, SessionHandle, SubmittedTurn, TransportError,
};
use crate::conversations::contract::TranscriptStoreError;
use crate::hosting::authorship::CommandCaller;
use crate::json::JsonValue;
use std::collections::HashMap;
use tauri::{AppHandle, Runtime, State, Webview};

#[tauri::command]
#[specta::specta]
pub async fn agent_models<R: Runtime>(app: AppHandle<R>) -> Vec<OfferedModel> {
	kiroshi_core::agent::commands::agent_models(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_tools<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
	kiroshi_core::agent::commands::agent_tools(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_title<R: Runtime>(
	app: AppHandle<R>,
	text: String,
) -> Option<ConversationNaming> {
	kiroshi_core::agent::commands::agent_title(crate::events::core(&app), text).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_check<R: Runtime>(
	app: AppHandle<R>,
	scope: Option<RuntimeScope>,
) -> CheckReport {
	kiroshi_core::agent::commands::agent_check(crate::events::core(&app), scope).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_account<R: Runtime>(app: AppHandle<R>) -> AccountReport {
	kiroshi_core::agent::commands::agent_account(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_start_or_resume_session(
	core: State<'_, crate::core_context::Core>,
	scope: RuntimeScope,
	resume: Option<String>,
	cwd: Option<String>,
	output_schema: Option<JsonValue>,
) -> Result<SessionHandle, TransportError> {
	start_or_resume_session(core.inner(), scope, resume, cwd, output_schema).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_submit_prompt<R: Runtime>(
	webview: Webview<R>,
	caller: CommandCaller,
	core: State<'_, crate::core_context::Core>,
	scope: RuntimeScope,
	text: String,
	turn: Option<SubmittedTurn>,
) -> Result<(), TransportError> {
	kiroshi_core::agent::commands::agent_submit_prompt(
		core.inner(),
		&crate::events::client_of(&webview.window()),
		caller.0,
		scope,
		text,
		turn,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_cancel_turn(
	core: State<'_, crate::core_context::Core>,
	scope: RuntimeScope,
) -> Result<CancelOutcome, TransportError> {
	cancel_turn(core.inner(), scope).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_respond_to_permission(
	core: State<'_, crate::core_context::Core>,
	scope: RuntimeScope,
	id: String,
	decision: PermissionDecision,
) -> Result<(), TransportError> {
	kiroshi_core::agent::commands::agent_respond_to_permission(core.inner(), scope, id, decision)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_answer_question(
	core: State<'_, crate::core_context::Core>,
	scope: RuntimeScope,
	id: String,
	answers: HashMap<String, String>,
	annotations: Option<JsonValue>,
) -> Result<(), TransportError> {
	kiroshi_core::agent::commands::agent_answer_question(
		core.inner(),
		scope,
		id,
		answers,
		annotations,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_live_sessions(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<LiveSession>, TransportError> {
	kiroshi_core::agent::commands::agent_live_sessions(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_live_sessions_in_space(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<LiveSession>, TranscriptStoreError> {
	kiroshi_core::agent::commands::agent_live_sessions_in_space(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_pending_questions(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<ScopedEvent>, TransportError> {
	pending_questions(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_pending_prompts(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<Vec<ScopedEvent>, TransportError> {
	pending_prompts(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_pending_questions_in_space(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<ScopedEvent>, TranscriptStoreError> {
	kiroshi_core::agent::commands::agent_pending_questions_in_space(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_shutdown(
	core: State<'_, crate::core_context::Core>,
	scope: RuntimeScope,
) -> Result<(), TransportError> {
	shut_down_agent(core.inner(), scope).await
}
