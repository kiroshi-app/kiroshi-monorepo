use serde::{Deserialize, Serialize};

use crate::attachments::contract::AttachmentStoreError;
use crate::attachments::Rejection;
use crate::conversations::contract::{Bot, StorageFailure, TranscriptStoreError};
use crate::db::DatabaseError;

pub const CREATED_EVENT: &str = "companion://created";

pub const UPDATED_EVENT: &str = "companion://updated";

pub const DELETED_EVENT: &str = "companion://deleted";

pub const FIRST_RUN_DONE_EVENT: &str = "user://first-run-done";

pub const SEED_REFUSED_EVENT: &str = "companion://seed-refused";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionCreated {
	pub id: String,
	pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionUpdated {
	pub id: String,
	pub bot: Bot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionDeleted {
	pub id: String,
	pub space_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionInvited {
	pub id: String,
	pub name: String,
	pub already_seated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatedCompanion {
	pub id: String,
	pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationOpened {
	pub conversation_id: String,
	pub title: String,
	pub companions: Vec<SeatedCompanion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSaid {
	pub conversation_id: String,
	pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDescribed {
	pub conversation_id: String,
	pub title: String,
	pub icon: Option<String>,
	pub colour: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationAttached {
	pub path: String,
	pub conversation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSeedRefused {
	pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutcome {
	pub created: Option<CompanionCreated>,
	pub refused: Option<CompanionSeedRefused>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CompanionError {
	#[serde(rename_all = "camelCase")]
	Unavailable {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Storage {
		failure: StorageFailure,
	},
	NamelessCompanion,
	EmptyCompanionField,
	EmptyTitleField,
	EmptyMessageField,
	EmptyIconField,
	EmptyDescription,
	#[serde(rename_all = "camelCase")]
	UnlistedIcon {
		icon: String,
		accepted: Vec<String>,
	},
	#[serde(rename_all = "camelCase")]
	UnknownColour {
		colour: String,
		accepted: Vec<String>,
	},
	#[serde(rename_all = "camelCase")]
	AmbiguousCompanion {
		companion: String,
		ids: Vec<String>,
	},
	#[serde(rename_all = "camelCase")]
	UnknownCompanion {
		companion: String,
	},
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSeats {
		conversation_id: String,
		conversation_kind: String,
	},
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	CallerNotSeated {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableFile {
		path: String,
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	AttachmentRefused {
		refusal: AttachmentStoreError,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableRequest {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Undeliverable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unexpected {
		detail: String,
	},
}

impl From<DatabaseError> for CompanionError {
	fn from(error: DatabaseError) -> Self {
		CompanionError::Storage { failure: (&error).into() }
	}
}

impl From<TranscriptStoreError> for CompanionError {
	fn from(error: TranscriptStoreError) -> Self {
		match error {
			TranscriptStoreError::Unavailable { failure } => {
				CompanionError::Unavailable { failure }
			}
			TranscriptStoreError::Storage { failure } => CompanionError::Storage { failure },
			TranscriptStoreError::NamelessBot => CompanionError::NamelessCompanion,
			TranscriptStoreError::BlankIcon => CompanionError::EmptyIconField,
			TranscriptStoreError::UnlistedIcon { icon, accepted } => {
				CompanionError::UnlistedIcon { icon, accepted }
			}
			TranscriptStoreError::UnknownColour { colour, accepted } => {
				CompanionError::UnknownColour { colour, accepted }
			}
			other => CompanionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

impl From<Rejection> for CompanionError {
	fn from(rejection: Rejection) -> Self {
		CompanionError::AttachmentRefused { refusal: rejection.into() }
	}
}
