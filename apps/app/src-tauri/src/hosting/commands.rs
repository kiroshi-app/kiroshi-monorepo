use tauri::{AppHandle, Runtime, State};

use super::contract::{AccountDevices, HostingState, MembersError, SpaceMembers};
use super::{devices, members, Hosting};
use crate::spaces::contract::SpaceError;

#[tauri::command]
#[specta::specta]
pub async fn hosting_start<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	super::start(crate::events::core(&app), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_stop<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	super::stop(crate::events::core(&app), space_id).await
}

#[tauri::command]
#[specta::specta]
pub fn hosting_state(core: State<'_, crate::core_context::Core>, space_id: String) -> HostingState {
	let hosting = core.state::<Hosting>();
	hosting.current(&space_id)
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_members<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::list(crate::events::core(&app), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_invite_member<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	email: String,
) -> Result<SpaceMembers, MembersError> {
	members::invite(crate::events::core(&app), space_id, email).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_withdraw_invitation<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::withdraw(crate::events::core(&app), space_id, invitation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_resend_invitation<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::resend(crate::events::core(&app), space_id, invitation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_remove_member<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::remove(crate::events::core(&app), space_id, user_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_invite_member_again<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::invite_again(crate::events::core(&app), space_id, user_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_devices<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	devices::devices(crate::events::core(&app), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_remove_device<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	device_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	devices::remove_device(crate::events::core(&app), space_id, device_id).await
}
