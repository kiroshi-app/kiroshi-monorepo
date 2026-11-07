use tauri::{AppHandle, Runtime, State};

use super::contract::{AccountDevice, DeviceApproval, DeviceError};
use super::Devices;

#[tauri::command]
#[specta::specta]
pub fn device_approval(core: State<'_, crate::core_context::Core>) -> DeviceApproval {
	let devices = core.state::<Devices>();
	devices.current()
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_retry<R: Runtime>(
	app: AppHandle<R>,
) -> Result<DeviceApproval, DeviceError> {
	super::retried(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_code_request<R: Runtime>(
	app: AppHandle<R>,
) -> Result<(), DeviceError> {
	super::code_requested(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_code_submit<R: Runtime>(
	app: AppHandle<R>,
	code: String,
) -> Result<(), DeviceError> {
	super::code_submitted(crate::events::core(&app), &code).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approve<R: Runtime>(
	app: AppHandle<R>,
	device_id: String,
) -> Result<(), DeviceError> {
	super::approved(crate::events::core(&app), &device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_refuse<R: Runtime>(
	app: AppHandle<R>,
	device_id: String,
) -> Result<(), DeviceError> {
	super::refused(crate::events::core(&app), &device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn devices_list<R: Runtime>(
	app: AppHandle<R>,
) -> Result<Vec<AccountDevice>, DeviceError> {
	super::listed(crate::events::core(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_remove<R: Runtime>(
	app: AppHandle<R>,
	device_id: String,
) -> Result<(), DeviceError> {
	super::removed(crate::events::core(&app), &device_id).await
}
