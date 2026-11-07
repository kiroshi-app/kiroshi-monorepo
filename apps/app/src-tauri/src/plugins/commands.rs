pub use kiroshi_core::plugins::commands::*;

use tauri::State;

use super::contract::PluginScope;
use crate::bundles::ApplicationMark;
use crate::conversations::contract::{
	BotChangedFile, BotHistoryEntry, McpServer, Skill, SkillDraft, TranscriptStoreError,
};
use crate::json::JsonValue;

#[tauri::command]
#[specta::specta]
pub async fn plugin_skills(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
) -> Result<Vec<Skill>, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_skills(core.inner(), scope).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_create_skill(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_create_skill(core.inner(), scope, draft).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_update_skill(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	skill_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_update_skill(core.inner(), scope, skill_id, draft).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_set_skill_preloaded(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	skill_id: String,
	is_preloaded: bool,
) -> Result<Skill, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_set_skill_preloaded(
		core.inner(),
		scope,
		skill_id,
		is_preloaded,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_delete_skill(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	skill_id: String,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_delete_skill(core.inner(), scope, skill_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_skill_file(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	skill_id: String,
	path: String,
) -> Result<String, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_skill_file(core.inner(), scope, skill_id, path).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_write_skill_file(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	skill_id: String,
	path: String,
	text: String,
) -> Result<Skill, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_write_skill_file(
		core.inner(),
		scope,
		skill_id,
		path,
		text,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_delete_skill_file(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	skill_id: String,
	path: String,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_delete_skill_file(core.inner(), scope, skill_id, path)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_mcp_servers(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
) -> Result<Vec<McpServer>, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_mcp_servers(core.inner(), scope).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_set_mcp_server(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	name: String,
	config: JsonValue,
	mark: Option<ApplicationMark>,
) -> Result<McpServer, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_set_mcp_server(core.inner(), scope, name, config, mark)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_delete_mcp_server(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	name: String,
) -> Result<(), TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_delete_mcp_server(core.inner(), scope, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_history(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_history(core.inner(), scope).await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_history_diff(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	oldest_commit_id: String,
	newest_commit_id: String,
) -> Result<Vec<BotChangedFile>, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_history_diff(
		core.inner(),
		scope,
		oldest_commit_id,
		newest_commit_id,
	)
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_revert(
	core: State<'_, crate::core_context::Core>,
	scope: PluginScope,
	oldest_commit_id: String,
	newest_commit_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	kiroshi_core::plugins::commands::plugin_revert(
		core.inner(),
		scope,
		oldest_commit_id,
		newest_commit_id,
	)
	.await
}
