use tauri::{AppHandle, Runtime, State};

use super::contract::{UserPreferences, UserPreferencesError};
use crate::avatars;
use crate::db;
use crate::file_store::FileStore;
use crate::updates;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, UserPreferencesError> {
	state.as_ref().map_err(|failure| UserPreferencesError::Unavailable { failure: failure.into() })
}

#[tauri::command]
#[specta::specta]
pub async fn user_preferences<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
) -> Result<UserPreferences, UserPreferencesError> {
	let dir = avatars::Avatars::dir(&app);
	let stored = ready(&state)?.user().preferences().await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

#[tauri::command]
#[specta::specta]
pub async fn user_set_preferences<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	preferences: UserPreferences,
) -> Result<UserPreferences, UserPreferencesError> {
	let dir = avatars::Avatars::dir(&app);
	let database = ready(&state)?;
	let previous_channel = database.user().preferences().await?.update_channel;
	let stored = database.user().set_preferences(preferences.into()).await?;
	if stored.update_channel != previous_channel {
		updates::check_on(&app, stored.update_channel.into());
	}
	avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

#[tauri::command]
#[specta::specta]
pub async fn user_set_profile_picture<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bytes: Vec<u8>,
) -> Result<UserPreferences, UserPreferencesError> {
	let normalised = avatars::picture::normalised(&bytes)?;
	let database = ready(&state)?;
	let dir = avatars::Avatars::dir(&app).ok_or(avatars::Rejection::Unwritable {
		detail: "there is no application data directory to store avatars in".to_owned(),
	})?;
	let path = avatars::minted_path(&dir);
	let recorded = path.to_string_lossy().into_owned();
	let swapped = database.user().swap_avatar_image_path(Some(recorded)).await?;
	if let Err(rejection) = avatars::write(&path, &normalised) {
		let _ = database.user().swap_avatar_image_path(swapped.previous).await;
		avatars::Avatars::sweep_referenced(database, Some(&dir)).await;
		return Err(rejection.into());
	}
	avatars::Avatars::sweep_referenced(database, Some(&dir)).await;
	Ok(UserPreferences::of(swapped.stored, Some(&dir)))
}
