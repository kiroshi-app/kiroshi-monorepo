use tauri::{AppHandle, Runtime, WebviewWindow};

use super::contract::LiveHtmlError;
use super::placement::Placement;
use super::ViewToMount;

pub fn ensure_available() -> Result<(), LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn top_inset<R: Runtime>(_main_window: &WebviewWindow<R>) -> Result<f64, LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn mount<R: Runtime>(
	_main_window: WebviewWindow<R>,
	_view: ViewToMount,
	_placement: Placement,
) -> Result<(), LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn place<R: Runtime>(
	_app: &AppHandle<R>,
	_id: String,
	_placement: Placement,
) -> Result<(), LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub fn replace_all<R: Runtime>(_app: &AppHandle<R>) {}

pub async fn still<R: Runtime>(_app: &AppHandle<R>, _id: String) -> Result<String, LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn round<R: Runtime>(
	_app: &AppHandle<R>,
	_id: String,
	_radius: f64,
) -> Result<(), LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn set_drawn<R: Runtime>(
	_app: &AppHandle<R>,
	_id: String,
	_is_drawn: bool,
) -> Result<(), LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn detach<R: Runtime>(_app: &AppHandle<R>, _id: String) -> Result<(), LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn url<R: Runtime>(_app: &AppHandle<R>, _id: String) -> Result<String, LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}

pub async fn evaluate<R: Runtime>(
	_app: &AppHandle<R>,
	_id: String,
	_script: String,
) -> Result<String, LiveHtmlError> {
	Err(LiveHtmlError::NotAvailableHere)
}
