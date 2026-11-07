use tauri::State;

use super::contract::{
	Catalogue, CatalogueChat, CatalogueError, MessageHit, MessageSearchError, MessageSearchQuery,
};

#[tauri::command]
#[specta::specta]
pub async fn search_messages(
	core: State<'_, crate::core_context::Core>,
	query: MessageSearchQuery,
) -> Result<Vec<MessageHit>, MessageSearchError> {
	kiroshi_core::search::commands::search_messages(core.inner(), query).await
}

#[tauri::command]
#[specta::specta]
pub async fn search_catalogue(
	core: State<'_, crate::core_context::Core>,
	query: String,
	space_id: String,
) -> Result<Catalogue, CatalogueError> {
	kiroshi_core::search::commands::search_catalogue(core.inner(), query, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn search_recent(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<CatalogueChat>, CatalogueError> {
	kiroshi_core::search::commands::search_recent(core.inner(), space_id).await
}
