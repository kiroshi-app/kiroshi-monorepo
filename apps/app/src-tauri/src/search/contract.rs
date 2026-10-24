use serde::{Deserialize, Serialize};

use crate::conversations::contract::{
	ConversationState, ObservedState, PendingPrompt, StorageFailure, TranscriptStoreError,
};
use crate::db::DatabaseError;
use crate::missions::contract::{MissionLiveness, MissionPresence, MissionState};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ConversationKind {
	Main,
	Topic,
	Mission,
}

impl ConversationKind {
	pub fn parse(text: &str) -> Option<Self> {
		match text {
			"main" => Some(ConversationKind::Main),
			"topic" => Some(ConversationKind::Topic),
			"mission" => Some(ConversationKind::Mission),
			_ => None,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MessageSearchQuery {
	pub text: String,
	pub space_id: String,
	#[serde(default)]
	#[specta(optional)]
	pub kind: Option<ConversationKind>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SnippetPart {
	pub text: String,
	pub matched: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MessageHit {
	pub message_id: String,
	pub seq: i64,
	pub conversation_id: String,
	pub conversation_kind: ConversationKind,
	pub conversation_title: String,
	pub author_bot_id: Option<String>,
	pub created_at: i64,
	pub space_id: Option<String>,
	pub snippet: Vec<SnippetPart>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MessageSearchError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	QueryTooLong { limit: usize },
}

impl From<DatabaseError> for MessageSearchError {
	fn from(error: DatabaseError) -> Self {
		MessageSearchError::Storage { failure: (&error).into() }
	}
}

pub const MAX_QUERY_CHARS: usize = 200;
pub const MAX_MATCHES_PER_LIST: usize = 20;
pub const MAX_RECENT_CHATS: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ChatHit {
	pub conversation_id: String,
	pub kind: ConversationKind,
	pub title: String,
	pub bot_id: Option<String>,
	pub participants: Vec<String>,
	pub space_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueChat {
	#[serde(flatten)]
	pub hit: ChatHit,
	#[specta(optional)]
	pub state: ConversationState,
	#[specta(optional)]
	pub pending_prompt: Option<PendingPrompt>,
	#[specta(optional)]
	pub working_bot_ids: Vec<String>,
}

impl CatalogueChat {
	pub fn of(hit: ChatHit, observed: ObservedState) -> Self {
		Self {
			hit,
			state: observed.state,
			pending_prompt: observed.pending_prompt,
			working_bot_ids: observed.working_bot_ids,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueMission {
	pub id: String,
	pub thread_conversation_id: String,
	pub objective: String,
	pub ticket_platform: String,
	pub ticket_external_id: String,
	pub ticket_title: String,
	pub state: MissionState,
	#[specta(optional)]
	pub liveness: MissionLiveness,
	#[specta(optional)]
	pub pending_prompt: Option<PendingPrompt>,
	#[specta(optional)]
	pub working_bot_ids: Vec<String>,
	pub bot_id: String,
	pub space_id: String,
}

impl CatalogueMission {
	pub fn present(self, present: MissionPresence) -> Self {
		Self {
			liveness: present.liveness,
			pending_prompt: present.pending_prompt,
			working_bot_ids: present.working_bot_ids,
			..self
		}
	}

	pub fn stored_presence(&self) -> MissionPresence {
		MissionPresence {
			liveness: self.liveness,
			pending_prompt: self.pending_prompt.clone(),
			working_bot_ids: self.working_bot_ids.clone(),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueRoutine {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub title: String,
	pub trigger_source_id: String,
	pub is_enabled: bool,
	pub expression: Option<String>,
	pub space_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
	pub chats: Vec<CatalogueChat>,
	pub missions: Vec<CatalogueMission>,
	pub routines: Vec<CatalogueRoutine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueHits {
	pub chats: Vec<ChatHit>,
	pub missions: Vec<CatalogueMission>,
	pub routines: Vec<CatalogueRoutine>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogueScope {
	pub query: String,
	pub space_id: String,
	pub kind: Option<ConversationKind>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CatalogueError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	QueryTooLong { limit: usize },
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	#[serde(rename_all = "camelCase")]
	UnreadableState { detail: String },
}

impl From<TranscriptStoreError> for CatalogueError {
	fn from(error: TranscriptStoreError) -> Self {
		match error {
			TranscriptStoreError::Unavailable { failure } => {
				CatalogueError::Unavailable { failure }
			}
			TranscriptStoreError::Storage { failure } => CatalogueError::Storage { failure },
			other => CatalogueError::UnreadableState { detail: format!("{other:?}") },
		}
	}
}

impl From<DatabaseError> for CatalogueError {
	fn from(error: DatabaseError) -> Self {
		CatalogueError::Storage { failure: (&error).into() }
	}
}

impl From<rusqlite::Error> for CatalogueError {
	fn from(error: rusqlite::Error) -> Self {
		CatalogueError::from(DatabaseError::Sqlite(error))
	}
}
