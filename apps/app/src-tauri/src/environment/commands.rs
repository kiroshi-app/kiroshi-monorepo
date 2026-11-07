pub use kiroshi_core::environment::commands::*;

use tauri::State;

use super::contract::{ConnectionKind, EnvEntry, EnvError, EnvScope};
use crate::hosting::authorship::CommandCaller;

#[tauri::command]
#[specta::specta]
pub async fn env_set(
	core: State<'_, crate::core_context::Core>,
	scope: EnvScope,
	name: String,
	value: String,
) -> Result<(), EnvError> {
	kiroshi_core::environment::commands::env_set(core.inner(), scope, name, value).await
}

#[tauri::command]
#[specta::specta]
pub async fn env_delete(
	core: State<'_, crate::core_context::Core>,
	scope: EnvScope,
	name: String,
) -> Result<(), EnvError> {
	kiroshi_core::environment::commands::env_delete(core.inner(), scope, name).await
}

#[tauri::command]
#[specta::specta]
pub async fn connection_set(
	core: State<'_, crate::core_context::Core>,
	kind: ConnectionKind,
	value: String,
) -> Result<(), EnvError> {
	kiroshi_core::environment::commands::connection_set(core.inner(), kind, value).await
}
#[tauri::command]
#[specta::specta]
pub async fn env_list(
	core: State<'_, crate::core_context::Core>,
	caller: CommandCaller,
	scope: EnvScope,
) -> Result<Vec<EnvEntry>, EnvError> {
	kiroshi_core::environment::commands::env_list(core.inner(), caller.0, scope).await
}
