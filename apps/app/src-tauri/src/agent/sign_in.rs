pub use kiroshi_core::agent::sign_in::*;

use tauri::State;

use super::contract::SignInError;

#[tauri::command]
#[specta::specta]
pub async fn agent_sign_in(core: State<'_, crate::core_context::Core>) -> Result<(), SignInError> {
	kiroshi_core::agent::sign_in::agent_sign_in(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_sign_in_code(
	core: State<'_, crate::core_context::Core>,
	text: String,
) -> Result<(), SignInError> {
	kiroshi_core::agent::sign_in::agent_sign_in_code(core.inner(), text).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_sign_in_cancel(
	core: State<'_, crate::core_context::Core>,
) -> Result<(), SignInError> {
	kiroshi_core::agent::sign_in::agent_sign_in_cancel(core.inner()).await
}
