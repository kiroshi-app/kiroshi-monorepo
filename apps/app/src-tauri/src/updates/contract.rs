use serde::{Deserialize, Serialize};

use crate::db::repositories::user;

pub const CHANGED_EVENT: &str = "update://changed";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum UpdateChannel {
	#[default]
	Stable,
	Beta,
}

impl From<user::UpdateChannel> for UpdateChannel {
	fn from(channel: user::UpdateChannel) -> Self {
		match channel {
			user::UpdateChannel::Stable => UpdateChannel::Stable,
			user::UpdateChannel::Beta => UpdateChannel::Beta,
		}
	}
}

impl From<UpdateChannel> for user::UpdateChannel {
	fn from(channel: UpdateChannel) -> Self {
		match channel {
			UpdateChannel::Stable => user::UpdateChannel::Stable,
			UpdateChannel::Beta => user::UpdateChannel::Beta,
		}
	}
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UpdateState {
	#[default]
	UpToDate,
	Checking,
	#[serde(rename_all = "camelCase")]
	Available {
		version: String,
	},
	#[serde(rename_all = "camelCase")]
	Downloading {
		downloaded_bytes: u64,
		total_bytes: Option<u64>,
	},
	#[serde(rename_all = "camelCase")]
	ReadyToRestart {
		version: String,
	},
	#[serde(rename_all = "camelCase")]
	Failed {
		message: String,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotes {
	pub version: String,
	pub body: Option<String>,
	pub visual_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReleaseNotesError {
	#[serde(rename_all = "camelCase")]
	InvalidVersion { version: String },
	#[serde(rename_all = "camelCase")]
	Unavailable { version: String, detail: String },
}
