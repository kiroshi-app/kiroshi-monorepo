use serde::{Deserialize, Serialize};

use crate::attachments::contract::AttachmentStoreError;
use crate::attachments::Rejection;
use crate::conversations::contract::{Bot, StorageFailure, TranscriptStoreError};
use crate::db::repositories::conversations::Bot as StoredBot;
use crate::db::DatabaseError;
use crate::missions::contract::MissionError;
use crate::search::contract::{CatalogueError, ConversationKind, MessageSearchError};

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
pub struct RosterCompanion {
	pub id: String,
	pub name: String,
	pub job: String,
}

impl From<StoredBot> for RosterCompanion {
	fn from(bot: StoredBot) -> Self {
		Self { id: bot.id, name: bot.name, job: bot.title }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeatedCompanion {
	pub id: String,
	pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastMessage {
	pub author: Option<String>,
	pub text: String,
	pub time: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
	pub conversation_id: String,
	pub kind: String,
	pub title: String,
	pub icon: Option<String>,
	pub colour: Option<String>,
	pub companions: Vec<SeatedCompanion>,
	pub last_message: Option<LastMessage>,
	pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationsListed {
	pub conversations: Vec<Conversation>,
	pub cursor: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthorKind {
	Person,
	Companion,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAuthor {
	pub kind: AuthorKind,
	pub id: Option<String>,
	pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadMessage {
	pub seq: i64,
	pub author: MessageAuthor,
	pub time: i64,
	pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRead {
	pub conversation: Conversation,
	pub messages: Vec<ReadMessage>,
	pub cursor: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationClosed {
	pub conversation_id: String,
	pub title: String,
	pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationAttached {
	pub path: String,
	pub conversation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundConversation {
	pub id: String,
	pub kind: ConversationKind,
	pub title: String,
	pub participants: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundMessage {
	pub conversation_id: String,
	pub conversation_title: String,
	pub message_id: String,
	pub author: Option<String>,
	pub created_at: i64,
	pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationsFound {
	pub conversations: Vec<FoundConversation>,
	pub messages: Vec<FoundMessage>,
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
	EmptyTitleField,
	EmptyMessageField,
	EmptyIconField,
	EmptyUpdate,
	EmptyQueryField,
	#[serde(rename_all = "camelCase")]
	QueryTooLong {
		limit: usize,
	},
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
	UnknownConversation {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownConversationKind {
		conversation_kind: String,
		accepted: Vec<String>,
	},
	#[serde(rename_all = "camelCase")]
	LimitOutOfRange {
		limit: i64,
		minimum: i64,
		maximum: i64,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableCursor {
		cursor: String,
	},
	#[serde(rename_all = "camelCase")]
	CallerNotLead {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnclosableConversation {
		conversation_id: String,
		conversation_kind: String,
	},
	#[serde(rename_all = "camelCase")]
	ArchiveThroughConversationClose {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	MissionStillOpen {
		conversation_id: String,
		mission_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableFile {
		path: String,
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	NotAnImage {
		path: String,
		accepted: Vec<String>,
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

impl From<MessageSearchError> for CompanionError {
	fn from(error: MessageSearchError) -> Self {
		match error {
			MessageSearchError::Unavailable { failure } => CompanionError::Unavailable { failure },
			MessageSearchError::Storage { failure } => CompanionError::Storage { failure },
			MessageSearchError::QueryTooLong { limit } => CompanionError::QueryTooLong { limit },
		}
	}
}

impl From<CatalogueError> for CompanionError {
	fn from(error: CatalogueError) -> Self {
		match error {
			CatalogueError::Unavailable { failure } => CompanionError::Unavailable { failure },
			CatalogueError::Storage { failure } => CompanionError::Storage { failure },
			CatalogueError::QueryTooLong { limit } => CompanionError::QueryTooLong { limit },
			CatalogueError::UnknownBot { id } => {
				CompanionError::Unexpected { detail: format!("the catalogue names no bot {id}") }
			}
		}
	}
}

impl From<MissionError> for CompanionError {
	fn from(error: MissionError) -> Self {
		match error {
			MissionError::Unavailable { failure } => CompanionError::Unavailable { failure },
			MissionError::Storage { failure } => CompanionError::Storage { failure },
			other => CompanionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

impl From<Rejection> for CompanionError {
	fn from(rejection: Rejection) -> Self {
		CompanionError::AttachmentRefused { refusal: rejection.into() }
	}
}
