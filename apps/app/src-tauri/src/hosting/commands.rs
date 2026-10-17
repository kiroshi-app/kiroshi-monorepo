use tauri::{AppHandle, Runtime, State};

use super::contract::{AccountDevices, HostingState, Member, MembersError};
use super::{devices, links, members, Hosting};
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

#[tauri::command]
#[specta::specta]
pub async fn hosting_join_link<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<String, MembersError> {
	links::join_link(&app, space_id, user_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_device_link<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<String, MembersError> {
	links::device_link(&app, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_devices<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	devices::devices(&app, space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn hosting_remove_device<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	device_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	devices::remove_device(&app, space_id, device_id).await
}
