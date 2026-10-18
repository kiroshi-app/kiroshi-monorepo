use tauri::{AppHandle, Runtime, State};

use super::contract::{AccountDevice, DeviceApproval, DeviceError};
use super::Devices;

#[tauri::command]
#[specta::specta]
pub fn device_approval(devices: State<'_, Devices>) -> DeviceApproval {
	devices.current()
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_retry<R: Runtime>(
	app: AppHandle<R>,
) -> Result<DeviceApproval, DeviceError> {
	super::retried(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_code_request<R: Runtime>(
	app: AppHandle<R>,
) -> Result<(), DeviceError> {
	super::code_requested(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_code_submit<R: Runtime>(
	app: AppHandle<R>,
	code: String,
) -> Result<(), DeviceError> {
	super::code_submitted(&app, &code).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approve<R: Runtime>(
	app: AppHandle<R>,
	device_id: String,
) -> Result<(), DeviceError> {
	super::approved(&app, &device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_refuse<R: Runtime>(
	app: AppHandle<R>,
	device_id: String,
) -> Result<(), DeviceError> {
	super::refused(&app, &device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn devices_list<R: Runtime>(
	app: AppHandle<R>,
) -> Result<Vec<AccountDevice>, DeviceError> {
	super::listed(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_remove<R: Runtime>(
	app: AppHandle<R>,
	device_id: String,
) -> Result<(), DeviceError> {
	super::removed(&app, &device_id).await
}
