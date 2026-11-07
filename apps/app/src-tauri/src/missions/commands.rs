pub use kiroshi_core::missions::commands::*;

use crate::missions::contract::ConversationMissions;
use crate::missions::contract::Mission;
use crate::missions::contract::MissionDetail;
use crate::missions::contract::MissionError;
use crate::missions::contract::MissionInSpace;
use crate::missions::contract::MissionOnBoard;
use crate::missions::contract::MissionSpacePage;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn mission_close(
	core: State<'_, crate::core_context::Core>,
	mission_id: String,
) -> Result<Mission, MissionError> {
	kiroshi_core::missions::commands::mission_close(core.inner(), mission_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_reopen(
	core: State<'_, crate::core_context::Core>,
	mission_id: String,
) -> Result<Mission, MissionError> {
	kiroshi_core::missions::commands::mission_reopen(core.inner(), mission_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_answered(
	core: State<'_, crate::core_context::Core>,
	mission_id: String,
	seq: i64,
) -> Result<Mission, MissionError> {
	mark_answered(core.inner(), mission_id, seq).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_list(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
) -> Result<ConversationMissions, MissionError> {
	list_missions(core.inner(), conversation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_detail(
	core: State<'_, crate::core_context::Core>,
	mission_id: String,
) -> Result<MissionDetail, MissionError> {
	mission_detail_of(core.inner(), mission_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_board(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	missions_board(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_space_feed(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	closed_since: i64,
) -> Result<Vec<MissionInSpace>, MissionError> {
	space_feed(core.inner(), space_id, closed_since).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_space_page(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	closed_since: i64,
	cursor: Option<String>,
	limit: Option<u32>,
) -> Result<MissionSpacePage, MissionError> {
	space_page(core.inner(), space_id, closed_since, cursor, limit).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_unreported(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<MissionOnBoard>, MissionError> {
	unreported_missions(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn mission_reported(
	core: State<'_, crate::core_context::Core>,
	mission_id: String,
	turn_id: Option<String>,
) -> Result<Mission, MissionError> {
	mark_reported(core.inner(), mission_id, turn_id).await
}
