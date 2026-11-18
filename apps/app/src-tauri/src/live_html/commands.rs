use std::path::Path;

use tauri::{AppHandle, Manager, Runtime};

use super::attachment::read_page;
use super::contract::{LiveHtmlError, LiveHtmlRectangle};
use super::LiveViews;
use crate::attachments::Attachments;
use crate::file_store::FileStore;

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
pub async fn live_html_mount_attachment<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	path: String,
	rectangle: LiveHtmlRectangle,
) -> Result<(), LiveHtmlError> {
	super::native::ensure_available()?;
	let attachments = Attachments::dir(&app).ok_or_else(|| LiveHtmlError::Unreadable {
		detail: "the attachments folder has no location".to_owned(),
	})?;
	let html = read_page(&attachments, Path::new(&path))?;
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
pub async fn live_html_round<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	radius: f64,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().round(&app, id, radius).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_still<R: Runtime>(
	app: AppHandle<R>,
	id: String,
) -> Result<String, LiveHtmlError> {
	app.state::<LiveViews>().still(&app, id).await
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
