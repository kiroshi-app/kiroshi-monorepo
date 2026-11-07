use super::contract::{OnboardingStep, UserPreferences, UserPreferencesError};
use crate::account::session;
use crate::avatars;
use crate::db;
use crate::file_store::FileStore;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, UserPreferencesError> {
	state.as_ref().map_err(|failure| UserPreferencesError::Unavailable { failure: failure.into() })
}

pub async fn user_preferences(
	core: &crate::core_context::Core,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let dir = avatars::Avatars::dir(core);
	let stored = ready(&state)?.user().preferences().await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

pub async fn user_set_preferences(
	core: &crate::core_context::Core,
	preferences: UserPreferences,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let dir = avatars::Avatars::dir(core);
	let database = ready(&state)?;
	let previous = database.user().preferences().await?;
	let stored = database.user().set_preferences(preferences.into()).await?;
	if stored.display_name != previous.display_name {
		session::renamed_name_sent(core, stored.display_name.clone());
	}
	avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

pub async fn user_set_profile_picture(
	core: &crate::core_context::Core,
	bytes: Vec<u8>,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let normalised = avatars::picture::normalised(&bytes)?;
	let database = ready(&state)?;
	let dir = avatars::Avatars::dir(core).ok_or(avatars::Rejection::Unwritable {
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

pub async fn user_set_onboarding_step(
	core: &crate::core_context::Core,
	step: OnboardingStep,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let dir = avatars::Avatars::dir(core);
	let stored = ready(&state)?.user().set_onboarding_step(step.into()).await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

pub async fn user_replay_onboarding(
	core: &crate::core_context::Core,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let dir = avatars::Avatars::dir(core);
	let stored = ready(&state)?.user().replay_onboarding().await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

pub async fn user_set_onboarding_first_companion(
	core: &crate::core_context::Core,
	bot_id: String,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let dir = avatars::Avatars::dir(core);
	let stored = ready(&state)?.user().set_onboarding_first_companion(bot_id).await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}

pub async fn user_mark_onboarding_import_seen(
	core: &crate::core_context::Core,
) -> Result<UserPreferences, UserPreferencesError> {
	let state = core.state::<db::DatabaseState>();
	let dir = avatars::Avatars::dir(core);
	let stored = ready(&state)?.user().mark_onboarding_import_seen().await?;
	Ok(UserPreferences::of(stored, dir.as_deref()))
}
