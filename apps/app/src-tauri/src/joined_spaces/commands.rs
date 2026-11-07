use tauri::{Runtime, State, Webview};

use super::contract::*;

#[tauri::command]
#[specta::specta]
pub async fn joined_spaces_list(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<JoinedSpace>, JoinedSpaceError> {
	kiroshi_core::joined_spaces::commands::joined_spaces_list(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn joined_space_connect(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<JoinedSpaceConnection, JoinedSpaceError> {
	kiroshi_core::joined_spaces::commands::joined_space_connect(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn joined_space_remove(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<(), JoinedSpaceError> {
	kiroshi_core::joined_spaces::commands::joined_space_remove(core.inner(), id).await
}

#[tauri::command]
#[specta::specta]
pub async fn joined_space_describe(
	core: State<'_, crate::core_context::Core>,
	id: String,
	name: String,
	colour: Option<i64>,
) -> Result<JoinedSpace, JoinedSpaceError> {
	kiroshi_core::joined_spaces::commands::joined_space_describe(core.inner(), id, name, colour).await
}

#[tauri::command]
#[specta::specta]
pub fn join_link_listen<R: Runtime>(
	webview: Webview<R>,
	core: State<'_, crate::core_context::Core>,
) {
	kiroshi_core::joined_spaces::commands::join_link_listen(core.inner(), &crate::events::client_of(&webview.window()))
}


#[tauri::command]
#[specta::specta]
pub async fn joined_space_members(
	core: State<'_, crate::core_context::Core>,
	id: String,
) -> Result<Vec<JoinedSpaceMember>, JoinedSpaceError> {
	kiroshi_core::joined_spaces::members::joined_space_members(core.inner(), id).await
}

