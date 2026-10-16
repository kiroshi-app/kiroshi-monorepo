use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::avatars;
use crate::conversations::contract::{AvatarRejection, StorageFailure};
use crate::db::repositories::user;
use crate::db::DatabaseError;
use crate::updates::contract::UpdateChannel;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ColorScheme {
	System,
	Light,
	Dark,
}

impl From<user::ColorScheme> for ColorScheme {
	fn from(scheme: user::ColorScheme) -> Self {
		match scheme {
			user::ColorScheme::System => ColorScheme::System,
			user::ColorScheme::Light => ColorScheme::Light,
			user::ColorScheme::Dark => ColorScheme::Dark,
		}
	}
}

impl From<ColorScheme> for user::ColorScheme {
	fn from(scheme: ColorScheme) -> Self {
		match scheme {
			ColorScheme::System => user::ColorScheme::System,
			ColorScheme::Light => user::ColorScheme::Light,
			ColorScheme::Dark => user::ColorScheme::Dark,
		}
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SidebarTab {
	#[default]
	Conversations,
	Missions,
	Companions,
	Applications,
}

impl From<user::SidebarTab> for SidebarTab {
	fn from(tab: user::SidebarTab) -> Self {
		match tab {
			user::SidebarTab::Conversations => SidebarTab::Conversations,
			user::SidebarTab::Missions => SidebarTab::Missions,
			user::SidebarTab::Companions => SidebarTab::Companions,
			user::SidebarTab::Applications => SidebarTab::Applications,
		}
	}
}

impl From<SidebarTab> for user::SidebarTab {
	fn from(tab: SidebarTab) -> Self {
		match tab {
			SidebarTab::Conversations => user::SidebarTab::Conversations,
			SidebarTab::Missions => user::SidebarTab::Missions,
			SidebarTab::Companions => user::SidebarTab::Companions,
			SidebarTab::Applications => user::SidebarTab::Applications,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
	pub display_name: String,
	pub profile_picture_path: Option<String>,
	pub color_scheme: ColorScheme,
	pub language: Option<String>,
	pub notify_on_question: bool,
	pub notify_on_permission: bool,
	pub notify_on_finished_turn: bool,
	pub notify_with_sound: bool,
	pub sidebar_width: Option<u32>,
	#[serde(default)]
	pub sidebar_tab: SidebarTab,
	#[serde(default)]
	pub activity_panel_open: bool,
	#[serde(default)]
	pub first_run_done: bool,
	pub last_space_id: Option<String>,
	#[serde(default)]
	pub last_bot_id_by_space: BTreeMap<String, String>,
	#[serde(default)]
	pub update_channel: UpdateChannel,
	#[serde(default = "shows_whats_new_unless_told_otherwise")]
	pub show_whats_new: bool,
	#[serde(default)]
	pub last_seen_version: Option<String>,
}

fn shows_whats_new_unless_told_otherwise() -> bool {
	true
}

impl UserPreferences {
	pub fn of(preferences: user::Preferences, avatars: Option<&Path>) -> Self {
		let profile_picture_path = preferences
			.avatar_image_path
			.as_deref()
			.zip(avatars)
			.and_then(|(recorded, dir)| avatars::readable(dir, recorded))
			.map(|path| path.to_string_lossy().into_owned());
		Self {
			display_name: preferences.display_name,
			profile_picture_path,
			color_scheme: preferences.color_scheme.into(),
			language: preferences.language,
			notify_on_question: preferences.notify_on_question,
			notify_on_permission: preferences.notify_on_permission,
			notify_on_finished_turn: preferences.notify_on_finished_turn,
			notify_with_sound: preferences.notify_with_sound,
			sidebar_width: preferences.sidebar_width,
			sidebar_tab: preferences.sidebar_tab.into(),
			activity_panel_open: preferences.activity_panel_open,
			first_run_done: preferences.first_run_done,
			last_space_id: preferences.last_space_id,
			last_bot_id_by_space: preferences.last_bot_id_by_space,
			update_channel: preferences.update_channel.into(),
			show_whats_new: preferences.show_whats_new,
			last_seen_version: preferences.last_seen_version,
		}
	}
}

impl From<UserPreferences> for user::Preferences {
	fn from(preferences: UserPreferences) -> Self {
		Self {
			display_name: preferences.display_name,
			avatar_image_path: preferences.profile_picture_path,
			color_scheme: preferences.color_scheme.into(),
			language: preferences.language,
			notify_on_question: preferences.notify_on_question,
			notify_on_permission: preferences.notify_on_permission,
			notify_on_finished_turn: preferences.notify_on_finished_turn,
			notify_with_sound: preferences.notify_with_sound,
			sidebar_width: preferences.sidebar_width,
			sidebar_tab: preferences.sidebar_tab.into(),
			activity_panel_open: preferences.activity_panel_open,
			first_run_done: preferences.first_run_done,
			last_space_id: preferences.last_space_id,
			last_bot_id_by_space: preferences.last_bot_id_by_space,
			update_channel: preferences.update_channel.into(),
			show_whats_new: preferences.show_whats_new,
			last_seen_version: preferences.last_seen_version,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UserPreferencesError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	RejectedProfilePicture { reason: AvatarRejection },
}

impl From<DatabaseError> for UserPreferencesError {
	fn from(error: DatabaseError) -> Self {
		UserPreferencesError::Storage { failure: StorageFailure::from(&error) }
	}
}

impl From<avatars::Rejection> for UserPreferencesError {
	fn from(rejection: avatars::Rejection) -> Self {
		UserPreferencesError::RejectedProfilePicture { reason: rejection.into() }
	}
}
