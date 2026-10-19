use tauri::{AppHandle, Runtime};

use super::contract::{Invitation, InvitationError};
use crate::joined_spaces::contract::{JoinedSpace, JoinedSpaceError};

#[tauri::command]
#[specta::specta]
pub async fn invitations_list<R: Runtime>(
	app: AppHandle<R>,
) -> Result<Vec<Invitation>, InvitationError> {
	super::read(&app).await
}

#[tauri::command]
#[specta::specta]
pub async fn invitation_accept<R: Runtime>(
	app: AppHandle<R>,
	invitation_id: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	super::accept(&app, invitation_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn invitation_decline<R: Runtime>(
	app: AppHandle<R>,
	invitation_id: String,
) -> Result<(), InvitationError> {
	super::decline(&app, invitation_id).await
}
