use tauri::{State};

use super::contract::*;

#[tauri::command]
#[specta::specta]
pub async fn space_list(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<Space>, SpaceError> {
	kiroshi_core::spaces::commands::space_list(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_create(
	core: State<'_, crate::core_context::Core>,
	name: String,
) -> Result<Space, SpaceError> {
	kiroshi_core::spaces::commands::space_create(core.inner(), name).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_update(
	core: State<'_, crate::core_context::Core>,
	id: String,
	name: String,
	colour: Option<i64>,
) -> Result<Space, SpaceError> {
	kiroshi_core::spaces::commands::space_update(core.inner(), id, name, colour).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_reorder(
	core: State<'_, crate::core_context::Core>,
	ids: Vec<String>,
) -> Result<(), SpaceError> {
	kiroshi_core::spaces::commands::space_reorder(core.inner(), ids).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_delete(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<(), SpaceError> {
	kiroshi_core::spaces::commands::space_delete(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_export(
	core: State<'_, crate::core_context::Core>,
	id: String,
	path: String,
) -> Result<(), SpaceError> {
	kiroshi_core::spaces::commands::space_export(core.inner(), id, path).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_import(
	core: State<'_, crate::core_context::Core>,
	path: String,
) -> Result<Space, SpaceError> {
	kiroshi_core::spaces::commands::space_import(core.inner(), path).await
}

#[tauri::command]
#[specta::specta]
pub async fn bot_move_to_space(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	kiroshi_core::spaces::commands::bot_move_to_space(core.inner(), bot_id, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn bot_add_to_space(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	space_id: String,
	section_id: Option<String>,
) -> Result<(), SpaceError> {
	kiroshi_core::spaces::commands::bot_add_to_space(core.inner(), bot_id, space_id, section_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn bot_remove_from_space(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	kiroshi_core::spaces::commands::bot_remove_from_space(core.inner(), bot_id, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_preferences(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<SpacePreferences, SpaceError> {
	kiroshi_core::spaces::commands::space_preferences(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_set_preferences(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	preferences: SpacePreferences,
) -> Result<SpacePreferences, SpaceError> {
	kiroshi_core::spaces::commands::space_set_preferences(core.inner(), space_id, preferences).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_companion_counts(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<CompanionCounts>, SpaceError> {
	kiroshi_core::spaces::commands::space_companion_counts(core.inner(), space_id).await
}

