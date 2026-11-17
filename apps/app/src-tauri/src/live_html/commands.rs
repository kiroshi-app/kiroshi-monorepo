use tauri::{AppHandle, Manager, Runtime};

use super::contract::{LiveHtmlError, LiveHtmlRectangle};
use super::LiveViews;

#[tauri::command]
#[specta::specta]
pub async fn live_html_mount<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	html: String,
	rectangle: LiveHtmlRectangle,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().mount(&app, id, html, rectangle).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_place<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	rectangle: LiveHtmlRectangle,
	clip: Option<LiveHtmlRectangle>,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().place(&app, id, rectangle, clip).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_hide<R: Runtime>(
	app: AppHandle<R>,
	id: String,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().set_drawn(&app, id, false).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_show<R: Runtime>(
	app: AppHandle<R>,
	id: String,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().set_drawn(&app, id, true).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_remove<R: Runtime>(
	app: AppHandle<R>,
	id: String,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().remove(&app, id).await
}
