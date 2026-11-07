use tauri::State;

use super::contract::{RosterPin, Section, SectionError};
use crate::db;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, SectionError> {
	state.as_ref().map_err(|failure| SectionError::Unavailable { failure: failure.into() })
}

#[tauri::command]
#[specta::specta]
pub async fn section_list(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<Section>, SectionError> {
	let state = core.state::<db::DatabaseState>();
	let stored = ready(&state)?.sections().list(space_id).await?;
	Ok(stored.into_iter().map(Section::from).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn section_create(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<Section, SectionError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.sections().create(space_id, name).await.map(Section::from)?)
}

#[tauri::command]
#[specta::specta]
pub async fn section_rename(
	core: State<'_, crate::core_context::Core>,
	id: String,
	name: String,
) -> Result<Section, SectionError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.sections().rename(id, name).await.map(Section::from)?)
}

#[tauri::command]
#[specta::specta]
pub async fn roster_pin(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	pins: Vec<RosterPin>,
) -> Result<(), SectionError> {
	let state = core.state::<db::DatabaseState>();
	let held = pins.into_iter().map(Into::into).collect();
	Ok(ready(&state)?.sections().pin(space_id, held).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn section_delete(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<(), SectionError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.sections().delete(id).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn bot_move_to_section(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
	section_id: Option<String>,
	space_id: Option<String>,
) -> Result<(), SectionError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.sections().move_bot(bot_id, section_id, space_id).await?)
}
