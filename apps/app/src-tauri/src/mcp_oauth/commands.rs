pub use kiroshi_core::mcp_oauth::commands::*;

use crate::environment::contract::EnvError;
use crate::environment::contract::EnvOwner;
use crate::hosting::authorship::CommandCaller;
use crate::mcp_oauth::contract::Disconnected;
use crate::mcp_oauth::contract::OauthError;
use crate::mcp_oauth::status::ApplicationRow;
use tauri::AppHandle;
use tauri::Runtime;

#[tauri::command]
#[specta::specta]
pub async fn mcp_oauth_connect<R: Runtime>(
	app: AppHandle<R>,
	owner: EnvOwner,
	name: String,
	url: String,
) -> Result<(), OauthError> {
	connect_application(crate::events::core(&app), owner, name, url).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_oauth_cancel<R: Runtime>(app: AppHandle<R>) -> Result<(), OauthError> {
	kiroshi_core::mcp_oauth::commands::mcp_oauth_cancel(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_oauth_disconnect<R: Runtime>(
	app: AppHandle<R>,
	caller: CommandCaller,
	owner: EnvOwner,
	name: String,
	url: String,
) -> Result<Disconnected, OauthError> {
	disconnect_application(crate::events::core(&app), caller.0, owner, name, url).await
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_application_status<R: Runtime>(
	app: AppHandle<R>,
	caller: CommandCaller,
	owner: EnvOwner,
) -> Result<Vec<ApplicationRow>, EnvError> {
	application_status(crate::events::core(&app), caller.0, owner).await
}
