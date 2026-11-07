use tauri::State;

use super::contract::{AccountError, AccountState};

#[tauri::command]
#[specta::specta]
pub fn account_state(core: State<'_, crate::core_context::Core>) -> AccountState {
	kiroshi_core::account::commands::account_state(core.inner())
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_in(
	core: State<'_, crate::core_context::Core>,
) -> Result<(), AccountError> {
	kiroshi_core::account::commands::account_sign_in(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_out(
	core: State<'_, crate::core_context::Core>,
) -> Result<(), AccountError> {
	kiroshi_core::account::commands::account_sign_out(core.inner()).await
}
