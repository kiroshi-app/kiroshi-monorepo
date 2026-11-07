use tauri::State;

use super::contract::{RosterPin, Section, SectionError};

#[tauri::command]
#[specta::specta]
pub async fn section_list(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<Section>, SectionError> {
	kiroshi_core::sections::commands::section_list(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn section_create(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<Section, SectionError> {
	kiroshi_core::sections::commands::section_create(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn section_rename(
	core: State<'_, crate::core_context::Core>,
	id: String,
	name: String,
) -> Result<Section, SectionError> {
	kiroshi_core::sections::commands::section_rename(core.inner(), id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn roster_pin(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	pins: Vec<RosterPin>,
) -> Result<(), SectionError> {
	kiroshi_core::sections::commands::roster_pin(core.inner(), space_id, pins).await
}

#[tauri::command]
#[specta::specta]
pub async fn section_delete(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<(), SectionError> {
	kiroshi_core::sections::commands::section_delete(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn bot_move_to_section(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	section_id: Option<String>,
	space_id: Option<String>,
) -> Result<(), SectionError> {
	kiroshi_core::sections::commands::bot_move_to_section(
		core.inner(),
		bot_id,
		section_id,
		space_id,
	)
	.await
}
