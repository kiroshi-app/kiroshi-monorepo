use tauri::{State};

use super::contract::*;

#[tauri::command]
#[specta::specta]
pub async fn hosting_start(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	kiroshi_core::hosting::commands::hosting_start(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_stop(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	kiroshi_core::hosting::commands::hosting_stop(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub fn hosting_state(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> HostingState {
	kiroshi_core::hosting::commands::hosting_state(core.inner(), space_id)
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_members(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<SpaceMembers, MembersError> {
	kiroshi_core::hosting::commands::hosting_members(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_invite_member(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	email: String,
) -> Result<SpaceMembers, MembersError> {
	kiroshi_core::hosting::commands::hosting_invite_member(core.inner(), space_id, email).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_withdraw_invitation(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	kiroshi_core::hosting::commands::hosting_withdraw_invitation(core.inner(), space_id, invitation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_resend_invitation(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	kiroshi_core::hosting::commands::hosting_resend_invitation(core.inner(), space_id, invitation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_remove_member(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	kiroshi_core::hosting::commands::hosting_remove_member(core.inner(), space_id, user_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_invite_member_again(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	kiroshi_core::hosting::commands::hosting_invite_member_again(core.inner(), space_id, user_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_devices(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	kiroshi_core::hosting::commands::hosting_devices(core.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_remove_device(
	core: State<'_, crate::core_context::Core>,
	space_id: String,
	device_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	kiroshi_core::hosting::commands::hosting_remove_device(core.inner(), space_id, device_id).await
}

