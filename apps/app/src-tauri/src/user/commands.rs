use tauri::{AppHandle, Runtime, State};

use super::contract::{OnboardingStep, UserPreferences, UserPreferencesError};
use crate::updates;

#[tauri::command]
#[specta::specta]
pub async fn user_set_preferences<R: Runtime>(
	app: AppHandle<R>,
	core: State<'_, crate::core_context::Core>,
	preferences: UserPreferences,
) -> Result<UserPreferences, UserPreferencesError> {
	let previous = kiroshi_core::user::commands::user_preferences(core.inner()).await?;
	let stored =
		kiroshi_core::user::commands::user_set_preferences(core.inner(), preferences).await?;
	if stored.update_channel != previous.update_channel {
		updates::check_on(&app, stored.update_channel);
	}
	Ok(stored)
}

#[tauri::command]
#[specta::specta]
pub async fn user_preferences(
	core: State<'_, crate::core_context::Core>,
) -> Result<UserPreferences, UserPreferencesError> {
	kiroshi_core::user::commands::user_preferences(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn user_set_profile_picture(
	core: State<'_, crate::core_context::Core>,
	bytes: Vec<u8>,
) -> Result<UserPreferences, UserPreferencesError> {
	kiroshi_core::user::commands::user_set_profile_picture(core.inner(), bytes).await
}

#[tauri::command]
#[specta::specta]
pub async fn user_set_onboarding_step(
	core: State<'_, crate::core_context::Core>,
	step: OnboardingStep,
) -> Result<UserPreferences, UserPreferencesError> {
	kiroshi_core::user::commands::user_set_onboarding_step(core.inner(), step).await
}

#[tauri::command]
#[specta::specta]
pub async fn user_replay_onboarding(
	core: State<'_, crate::core_context::Core>,
) -> Result<UserPreferences, UserPreferencesError> {
	kiroshi_core::user::commands::user_replay_onboarding(core.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn user_set_onboarding_first_companion(
	core: State<'_, crate::core_context::Core>,
	bot_id: String,
) -> Result<UserPreferences, UserPreferencesError> {
	kiroshi_core::user::commands::user_set_onboarding_first_companion(core.inner(), bot_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn user_mark_onboarding_import_seen(
	core: State<'_, crate::core_context::Core>,
) -> Result<UserPreferences, UserPreferencesError> {
	kiroshi_core::user::commands::user_mark_onboarding_import_seen(core.inner()).await
}
