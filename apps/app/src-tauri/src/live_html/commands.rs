use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use super::attachment::AttachedPage;
use super::contract::{LiveHtmlCorners, LiveHtmlError, LiveHtmlRectangle, LiveHtmlTheme};
use super::server::Page;
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
	theme: Option<LiveHtmlTheme>,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().mount(&app, id, Page::Written(html), rectangle, theme).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_mount_attachment<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	path: String,
	rectangle: LiveHtmlRectangle,
	theme: Option<LiveHtmlTheme>,
) -> Result<(), LiveHtmlError> {
	super::native::ensure_available()?;
	let attachments = Attachments::dir(&app).ok_or_else(|| LiveHtmlError::Unreadable {
		detail: "the attachments folder has no location".to_owned(),
	})?;
	let page = AttachedPage::checked(attachments, PathBuf::from(path))?;
	app.state::<LiveViews>().mount(&app, id, Page::Attached(page), rectangle, theme).await
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
pub async fn live_html_theme<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	theme: LiveHtmlTheme,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().theme(&app, id, theme).await
}

#[tauri::command]
#[specta::specta]
pub async fn live_html_round<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	corners: LiveHtmlCorners,
) -> Result<(), LiveHtmlError> {
	app.state::<LiveViews>().round(&app, id, corners).await
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
