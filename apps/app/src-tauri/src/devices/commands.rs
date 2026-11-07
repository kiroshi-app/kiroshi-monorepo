use tauri::State;

use super::contract::*;

#[tauri::command]
#[specta::specta]
pub fn device_approval(core: State<'_, crate::core_context::Core>) -> DeviceApproval {
	kiroshi_core::devices::commands::device_approval(core.inner())
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_retry(
	core: State<'_, crate::core_context::Core>,
) -> Result<DeviceApproval, DeviceError> {
	kiroshi_core::devices::commands::device_approval_retry(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_code_request(
	core: State<'_, crate::core_context::Core>,
) -> Result<(), DeviceError> {
	kiroshi_core::devices::commands::device_approval_code_request(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approval_code_submit(
	core: State<'_, crate::core_context::Core>,
	code: String,
) -> Result<(), DeviceError> {
	kiroshi_core::devices::commands::device_approval_code_submit(core.inner(), code).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_approve(
	core: State<'_, crate::core_context::Core>,
	device_id: String,
) -> Result<(), DeviceError> {
	kiroshi_core::devices::commands::device_approve(core.inner(), device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_refuse(
	core: State<'_, crate::core_context::Core>,
	device_id: String,
) -> Result<(), DeviceError> {
	kiroshi_core::devices::commands::device_refuse(core.inner(), device_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn devices_list(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<AccountDevice>, DeviceError> {
	kiroshi_core::devices::commands::devices_list(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn device_remove(
	core: State<'_, crate::core_context::Core>,
	device_id: String,
) -> Result<(), DeviceError> {
	kiroshi_core::devices::commands::device_remove(core.inner(), device_id).await
}
