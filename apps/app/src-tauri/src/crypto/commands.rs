pub use kiroshi_core::crypto::commands::*;

use crate::crypto::contract::{DeviceIdentity, DeviceKeysError};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn get_device_identity(
	core: State<'_, crate::core_context::Core>,
) -> Result<DeviceIdentity, DeviceKeysError> {
	kiroshi_core::crypto::commands::get_device_identity(core.inner())
}
