use tauri::{AppHandle, Runtime, State};

use super::contract::{HostingState, Member, MembersError};
use super::{members, Hosting};
use crate::spaces::contract::SpaceError;

#[tauri::command]
#[specta::specta]
pub async fn hosting_start<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	super::start(&app, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_stop<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	super::stop(&app, space_id).await
}

#[tauri::command]
#[specta::specta]
pub fn hosting_state(hosting: State<'_, Hosting>, space_id: String) -> HostingState {
	hosting.current(&space_id)
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_members<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<Vec<Member>, MembersError> {
	members::list(&app, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_invite_member<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	email: String,
) -> Result<Member, MembersError> {
	members::invite(&app, space_id, email).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_withdraw_invitation<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<Vec<Member>, MembersError> {
	members::withdraw(&app, space_id, user_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_remove_member<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<Vec<Member>, MembersError> {
	members::remove(&app, space_id, user_id).await
}
