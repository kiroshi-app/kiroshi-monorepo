use tauri::State;

use super::contract::*;

#[tauri::command]
#[specta::specta]
pub async fn invitations_list(
	core: State<'_, crate::core_context::Core>,
) -> Result<Vec<Invitation>, InvitationError> {
	kiroshi_core::invitations::commands::invitations_list(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn invitation_accept(
	core: State<'_, crate::core_context::Core>,
	invitation_id: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	kiroshi_core::invitations::commands::invitation_accept(core.inner(), invitation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn invitation_decline(
	core: State<'_, crate::core_context::Core>,
	invitation_id: String,
) -> Result<(), InvitationError> {
	kiroshi_core::invitations::commands::invitation_decline(core.inner(), invitation_id).await
}
