use tauri::State;

use super::contract::*;

#[tauri::command]
#[specta::specta]
pub async fn remote_image_read(
	core: State<'_, crate::core_context::Core>,
	url: String,
) -> Result<RemoteImage, RemoteImageError> {
	kiroshi_core::remote_image::commands::remote_image_read(core.inner(), url).await
}
