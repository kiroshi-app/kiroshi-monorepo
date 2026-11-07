use tauri::{Runtime, State, Webview};

use super::contract::*;
use crate::hosting::authorship::CommandCaller;

#[tauri::command]
#[specta::specta]
pub async fn library_list(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<LibraryItem>, LibraryError> {
	kiroshi_core::library::commands::library_list(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_document(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryDocument, LibraryError> {
	kiroshi_core::library::commands::library_read_document(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_save(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<Option<String>, LibraryError> {
	kiroshi_core::library::commands::library_save(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_copy(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	kiroshi_core::library::commands::library_copy(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_reveal(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	kiroshi_core::library::commands::library_reveal(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_image(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryImage, LibraryError> {
	kiroshi_core::library::commands::library_read_image(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_file(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryFile, LibraryError> {
	kiroshi_core::library::commands::library_read_file(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_save_bytes(
	core: State<'_, crate::core_context::Core>,
	name: String,
	content: String,
) -> Result<Option<String>, LibraryError> {
	kiroshi_core::library::commands::library_save_bytes(core.inner(), name, content).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_copy_bytes(
	core: State<'_, crate::core_context::Core>,
	name: String,
	content: String,
) -> Result<(), LibraryError> {
	kiroshi_core::library::commands::library_copy_bytes(core.inner(), name, content).await
}

#[tauri::command]
#[specta::specta]
pub fn library_templates(
	,
) -> Vec<LibraryTemplate> {
	kiroshi_core::library::commands::library_templates()
}

#[tauri::command]
#[specta::specta]
pub async fn library_create_document(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
	template_id: Option<String>,
) -> Result<LibraryItem, LibraryError> {
	kiroshi_core::library::commands::library_create_document(core.inner(), space_id, name, template_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_create_board(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryItem, LibraryError> {
	kiroshi_core::library::commands::library_create_board(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_board_summary(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryBoardSummary, LibraryError> {
	kiroshi_core::library::commands::library_board_summary(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_open_document(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryDocumentState, LibraryError> {
	kiroshi_core::library::commands::library_open_document(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_apply_update(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
	update: String,
) -> Result<(), LibraryError> {
	kiroshi_core::library::commands::library_apply_update(core.inner(), space_id, name, update).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_share_presence<R: Runtime>(
	webview: Webview<R>,
	core: State<'_, crate::core_context::Core>,
	caller: CommandCaller,
	space_id: String,
	name: String,
	at: Option<LibraryPresenceAt>,
) -> Result<(), LibraryError> {
	kiroshi_core::library::commands::library_share_presence(core.inner(), &crate::events::client_of(&webview.window()), caller.0, space_id, name, at).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_stop_writers(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
	agent_id: Option<String>,
) -> Result<CancelOutcome, LibraryError> {
	kiroshi_core::library::commands::library_stop_writers(core.inner(), space_id, name, agent_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_thumbnail(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<LibraryImage, LibraryError> {
	kiroshi_core::library::commands::library_read_thumbnail(core.inner(), space_id, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_import(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
	content: String,
) -> Result<LibraryItem, LibraryError> {
	kiroshi_core::library::commands::library_import(core.inner(), space_id, name, content).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_import_url(
	core: State<'_, crate::core_context::Core>,
	caller: CommandCaller,
	space_id: String,
	url: String,
) -> Result<LibraryItem, LibraryImportUrlError> {
	kiroshi_core::library::commands::library_import_url(core.inner(), caller.0, space_id, url).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_import_paths(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	paths: Vec<PathBuf>,
) -> Result<Vec<LibraryImport>, LibraryError> {
	kiroshi_core::library::commands::library_import_paths(core.inner(), space_id, paths).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_picked_image(
	path: PathBuf,
) -> Result<LibraryImage, LibraryError> {
	kiroshi_core::library::commands::library_read_picked_image(path).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_rename_document(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
	new_name: String,
) -> Result<LibraryItem, LibraryError> {
	kiroshi_core::library::commands::library_rename_document(core.inner(), space_id, name, new_name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_rename_board(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
	new_name: String,
) -> Result<LibraryItem, LibraryError> {
	kiroshi_core::library::commands::library_rename_board(core.inner(), space_id, name, new_name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_save_message(
	core: State<'_, crate::core_context::Core>,
	conversation_id: String,
	message_id: String,
) -> Result<LibraryItem, LibraryError> {
	kiroshi_core::library::commands::library_save_message(core.inner(), conversation_id, message_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_delete(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	kiroshi_core::library::commands::library_delete(core.inner(), space_id, name).await
}


#[tauri::command]
#[specta::specta]
pub fn library_screenshot_job<R: Runtime>(
	webview: Webview<R>,
	core: State<'_, crate::core_context::Core>,
) -> Result<ScreenshotJob, ScreenshotRequestError> {
	kiroshi_core::library::host::screenshot::library_screenshot_job(core.inner(), &crate::events::client_of(&webview.window()))
}

#[tauri::command]
#[specta::specta]
pub fn library_screenshot_answer<R: Runtime>(
	webview: Webview<R>,
	core: State<'_, crate::core_context::Core>,
	request_id: String,
	answer: ScreenshotRendered,
) -> Result<(), ScreenshotRequestError> {
	kiroshi_core::library::host::screenshot::library_screenshot_answer(core.inner(), &crate::events::client_of(&webview.window()), request_id, answer)
}


#[tauri::command]
#[specta::specta]
pub async fn library_read_link_preview(
	url: String,
) -> Result<LibraryLinkPreview, LibraryLinkPreviewError> {
	kiroshi_core::library::link_preview::commands::library_read_link_preview(url).await
}

