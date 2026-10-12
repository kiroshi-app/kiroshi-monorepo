use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_opener::Opener;

use super::contract::{AccountError, AccountState};
use super::session::{self, AccountSession};

#[tauri::command]
#[specta::specta]
pub fn account_state(session: State<'_, AccountSession>) -> AccountState {
	session.current()
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_in<R: Runtime>(app: AppHandle<R>) -> Result<(), AccountError> {
	session::sign_in(&app, |url| match app.try_state::<Opener<R>>() {
		Some(opener) => opener.open_url(url, None::<&str>).map_err(|error| error.to_string()),
		None => Err("the opener plugin is not installed".to_owned()),
	})
	.await
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_out<R: Runtime>(app: AppHandle<R>) -> Result<(), AccountError> {
	session::sign_out(&app).await
}
