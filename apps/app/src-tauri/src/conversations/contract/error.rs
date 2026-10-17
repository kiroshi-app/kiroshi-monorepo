use serde::{Deserialize, Serialize};

use crate::avatars;
use crate::db::repositories::{conversations, messages};
use crate::db::DatabaseError;
use crate::environment::contract::EnvError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StorageFailure {
	AppDataDir,
	#[serde(rename_all = "camelCase")]
	JournalMode {
		mode: String,
	},
	PoisonedConnection,
	CallInterrupted,
	StaleWrite,
	#[serde(rename_all = "camelCase")]
	Sqlite {
		detail: String,
	},
}

impl From<&DatabaseError> for StorageFailure {
	fn from(error: &DatabaseError) -> Self {
		match error {
			DatabaseError::AppDataDir => StorageFailure::AppDataDir,
			DatabaseError::JournalMode(mode) => StorageFailure::JournalMode { mode: mode.clone() },
			DatabaseError::PoisonedConnection => StorageFailure::PoisonedConnection,
			DatabaseError::CallInterrupted => StorageFailure::CallInterrupted,
			DatabaseError::Conflict => StorageFailure::StaleWrite,
			DatabaseError::Sqlite(failure) => {
				StorageFailure::Sqlite { detail: failure.to_string() }
			}
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TranscriptStoreError {
	#[serde(rename_all = "camelCase")]
	Unavailable {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Storage {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Conflict {
		id: String,
		field: String,
	},
	#[serde(rename_all = "camelCase")]
	InvalidTransition {
		id: String,
		from: String,
		to: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownBot {
		id: String,
	},
	NamelessBot,
	#[serde(rename_all = "camelCase")]
	UnknownConversation {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	ForeignBot {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	SeveralSpaces {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownParticipant {
		conversation_id: String,
		bot_id: String,
	},
	BlankIcon,
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
	UnknownMessage {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownMessageSeq {
		conversation_id: String,
		seq: i64,
	},
	#[serde(rename_all = "camelCase")]
	RejectedAvatarImage {
		reason: AvatarRejection,
	},
	#[serde(rename_all = "camelCase")]
	UnwritableBundle {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	UnwritableEnvironment {
		failure: EnvError,
	},
	#[serde(rename_all = "camelCase")]
	SystemSkill {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableHistory {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableSources {
		path: String,
		reason: String,
	},
	#[serde(rename_all = "camelCase")]
	TurnAlreadyRunning {
		conversation_id: String,
		turn_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableCursor {
		cursor: String,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AvatarRejection {
	UnknownFormat,
	#[serde(rename_all = "camelCase")]
	TooLarge {
		bytes: u64,
		limit: u64,
	},
	#[serde(rename_all = "camelCase")]
	Undecodable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unwritable {
		detail: String,
	},
}

impl From<avatars::Rejection> for AvatarRejection {
	fn from(rejection: avatars::Rejection) -> Self {
		match rejection {
			avatars::Rejection::UnknownFormat => AvatarRejection::UnknownFormat,
			avatars::Rejection::TooLarge { bytes, limit } => {
				AvatarRejection::TooLarge { bytes, limit }
			}
			avatars::Rejection::Undecodable { detail } => AvatarRejection::Undecodable { detail },
			avatars::Rejection::Unwritable { detail } => AvatarRejection::Unwritable { detail },
		}
	}
}

impl From<avatars::Rejection> for TranscriptStoreError {
	fn from(rejection: avatars::Rejection) -> Self {
		TranscriptStoreError::RejectedAvatarImage { reason: rejection.into() }
	}
}

impl From<messages::TranscriptError> for TranscriptStoreError {
	fn from(error: messages::TranscriptError) -> Self {
		match error {
			messages::TranscriptError::Conflict { id, field } => {
				TranscriptStoreError::Conflict { id, field: field.to_owned() }
			}
			messages::TranscriptError::InvalidTransition { id, from, to } => {
				TranscriptStoreError::InvalidTransition {
					id,
					from: from.to_owned(),
					to: to.to_owned(),
				}
			}
			messages::TranscriptError::UnknownMessage { id } => {
				TranscriptStoreError::UnknownMessage { id }
			}
			messages::TranscriptError::Database(failure) => {
				TranscriptStoreError::Storage { failure: (&failure).into() }
			}
		}
	}
}

impl From<DatabaseError> for TranscriptStoreError {
	fn from(error: DatabaseError) -> Self {
		TranscriptStoreError::Storage { failure: (&error).into() }
	}
}

impl From<conversations::ConversationError> for TranscriptStoreError {
	fn from(error: conversations::ConversationError) -> Self {
		match error {
			conversations::ConversationError::UnknownBot { id } => {
				TranscriptStoreError::UnknownBot { id }
			}
			conversations::ConversationError::UnknownConversation { id } => {
				TranscriptStoreError::UnknownConversation { id }
			}
			conversations::ConversationError::ForeignBot { id } => {
				TranscriptStoreError::ForeignBot { id }
			}
			conversations::ConversationError::SeveralSpaces { id } => {
				TranscriptStoreError::SeveralSpaces { id }
			}
			conversations::ConversationError::UnknownParticipant { conversation_id, bot_id } => {
				TranscriptStoreError::UnknownParticipant { conversation_id, bot_id }
			}
			conversations::ConversationError::BlankIcon => TranscriptStoreError::BlankIcon,
			conversations::ConversationError::UnlistedIcon { icon } => {
				TranscriptStoreError::UnlistedIcon {
					icon,
					accepted: conversations::conversation_icons().to_vec(),
				}
			}
			conversations::ConversationError::UnknownColour { colour } => {
				TranscriptStoreError::UnknownColour { colour, accepted: accepted_colours() }
			}
			conversations::ConversationError::Database(failure) => {
				TranscriptStoreError::Storage { failure: (&failure).into() }
			}
		}
	}
}

fn accepted_colours() -> Vec<String> {
	super::AvatarBlot::ALL
		.iter()
		.map(|&blot| conversations::AvatarBlot::from(blot).named().to_owned())
		.collect()
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::super::tests::assert_crosses_as;
	use super::*;

	#[test]
	fn a_lineage_failure_crosses_as_a_storage_refusal() {
		assert_eq!(
			TranscriptStoreError::from(DatabaseError::Conflict),
			TranscriptStoreError::Storage { failure: StorageFailure::StaleWrite }
		);
	}

	#[test]
	fn every_failure_crosses_as_a_tagged_camel_case_object() {
		for (failure, wire) in [
			(StorageFailure::AppDataDir, json!({ "kind": "appDataDir" })),
			(
				StorageFailure::JournalMode { mode: "delete".into() },
				json!({ "kind": "journalMode", "mode": "delete" }),
			),
			(StorageFailure::PoisonedConnection, json!({ "kind": "poisonedConnection" })),
			(StorageFailure::CallInterrupted, json!({ "kind": "callInterrupted" })),
			(StorageFailure::StaleWrite, json!({ "kind": "staleWrite" })),
			(
				StorageFailure::Sqlite { detail: "UNIQUE constraint failed".into() },
				json!({ "kind": "sqlite", "detail": "UNIQUE constraint failed" }),
			),
		] {
			assert_crosses_as(failure, wire);
		}

		for (refusal, wire) in [
			(
				TranscriptStoreError::Unavailable { failure: StorageFailure::AppDataDir },
				json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }),
			),
			(
				TranscriptStoreError::Storage { failure: StorageFailure::PoisonedConnection },
				json!({ "kind": "storage", "failure": { "kind": "poisonedConnection" } }),
			),
			(
				TranscriptStoreError::Conflict { id: "m1".into(), field: "content".into() },
				json!({ "kind": "conflict", "id": "m1", "field": "content" }),
			),
			(
				TranscriptStoreError::InvalidTransition {
					id: "m1".into(),
					from: "complete".into(),
					to: "failed".into(),
				},
				json!({
					"kind": "invalidTransition",
					"id": "m1",
					"from": "complete",
					"to": "failed"
				}),
			),
			(
				TranscriptStoreError::UnknownBot { id: "b1".into() },
				json!({ "kind": "unknownBot", "id": "b1" }),
			),
			(
				TranscriptStoreError::SeveralSpaces { id: "b1".into() },
				json!({ "kind": "severalSpaces", "id": "b1" }),
			),
			(
				TranscriptStoreError::SystemSkill { id: "learn".into() },
				json!({ "kind": "systemSkill", "id": "learn" }),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::UnknownFormat,
				},
				json!({ "kind": "rejectedAvatarImage", "reason": { "kind": "unknownFormat" } }),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::TooLarge { bytes: 6_000_000, limit: 5_242_880 },
				},
				json!({
					"kind": "rejectedAvatarImage",
					"reason": { "kind": "tooLarge", "bytes": 6_000_000, "limit": 5_242_880 }
				}),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::Undecodable { detail: "unexpected end".into() },
				},
				json!({
					"kind": "rejectedAvatarImage",
					"reason": { "kind": "undecodable", "detail": "unexpected end" }
				}),
			),
			(
				TranscriptStoreError::RejectedAvatarImage {
					reason: AvatarRejection::Unwritable { detail: "no space left".into() },
				},
				json!({
					"kind": "rejectedAvatarImage",
					"reason": { "kind": "unwritable", "detail": "no space left" }
				}),
			),
		] {
			assert_crosses_as(refusal, wire);
		}
	}

	#[test]
	fn every_reason_a_picture_is_refused_keeps_its_shape_on_the_way_out() {
		for (rejection, reason) in [
			(avatars::Rejection::UnknownFormat, AvatarRejection::UnknownFormat),
			(
				avatars::Rejection::TooLarge { bytes: 9, limit: 8 },
				AvatarRejection::TooLarge { bytes: 9, limit: 8 },
			),
			(
				avatars::Rejection::Undecodable { detail: "torn".into() },
				AvatarRejection::Undecodable { detail: "torn".into() },
			),
			(
				avatars::Rejection::Unwritable { detail: "read only".into() },
				AvatarRejection::Unwritable { detail: "read only".into() },
			),
		] {
			assert_eq!(
				TranscriptStoreError::from(rejection),
				TranscriptStoreError::RejectedAvatarImage { reason }
			);
		}
	}

	#[test]
	fn an_unusable_database_keeps_its_reason_on_the_way_to_the_frontend() {
		for (error, failure) in [
			(DatabaseError::AppDataDir, StorageFailure::AppDataDir),
			(
				DatabaseError::JournalMode("memory".into()),
				StorageFailure::JournalMode { mode: "memory".into() },
			),
			(DatabaseError::PoisonedConnection, StorageFailure::PoisonedConnection),
			(DatabaseError::CallInterrupted, StorageFailure::CallInterrupted),
			(DatabaseError::Conflict, StorageFailure::StaleWrite),
		] {
			assert_eq!(StorageFailure::from(&error), failure);
		}

		let sqlite = DatabaseError::Sqlite(rusqlite::Error::QueryReturnedNoRows);
		assert_eq!(
			StorageFailure::from(&sqlite),
			StorageFailure::Sqlite { detail: rusqlite::Error::QueryReturnedNoRows.to_string() },
			"a SQLite failure crossed as something other than its own account"
		);
	}
}
