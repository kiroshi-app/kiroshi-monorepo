use serde::{Deserialize, Serialize};

use crate::conversations::contract::StorageFailure;
use crate::db::DatabaseError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryItemKind {
	Image,
	Document,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
	pub name: String,
	pub kind: LibraryItemKind,
	pub path: String,
	pub bytes: u64,
	pub modified_at: i64,
	pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryDocumentFormat {
	Markdown,
	Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocument {
	pub name: String,
	pub format: LibraryDocumentFormat,
	pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImage {
	pub name: String,
	pub mime_type: String,
	pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFile {
	pub name: String,
	pub mime_type: String,
	pub content: String,
}

pub const DOCUMENT_UPDATED_EVENT: &str = "library://document-updated";

pub const DOCUMENT_RENAMED_EVENT: &str = "library://document-renamed";

pub const CHANGED_EVENT: &str = "library://changed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTemplate {
	pub id: String,
	pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocumentState {
	pub name: String,
	pub update: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocumentUpdated {
	pub space_id: String,
	pub name: String,
	pub update: String,
}

pub const DOCUMENT_PRESENCE_EVENT: &str = "library://document-presence";

pub const DOCUMENT_WRITER_FINISHED_EVENT: &str = "library://document-writer-finished";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryWriterKind {
	Agent,
	Person,
	Member,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryWriter {
	pub id: String,
	pub kind: LibraryWriterKind,
	pub name: Option<String>,
	pub caret: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocumentPresence {
	pub space_id: String,
	pub name: String,
	pub writers: Vec<LibraryWriter>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryWriteOutcome {
	Finished,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocumentWriterFinished {
	pub space_id: String,
	pub name: String,
	pub agent_id: String,
	pub agent_name: String,
	pub outcome: LibraryWriteOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocumentRenamed {
	pub space_id: String,
	pub former_name: String,
	pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryChanged {
	pub space_id: String,
	#[specta(optional)]
	pub overwritten: Option<LibraryOverwritten>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryOverwritten {
	pub name: String,
	pub modified_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LibraryError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	UnknownSpace { id: String },
	#[serde(rename_all = "camelCase")]
	InvalidName { name: String },
	#[serde(rename_all = "camelCase")]
	Unsupported { name: String },
	#[serde(rename_all = "camelCase")]
	Missing { name: String },
	#[serde(rename_all = "camelCase")]
	AlreadyExists { name: String },
	#[serde(rename_all = "camelCase")]
	UnknownTemplate { id: String },
	#[serde(rename_all = "camelCase")]
	NotADocument { name: String },
	#[serde(rename_all = "camelCase")]
	NotAnImage { name: String },
	#[serde(rename_all = "camelCase")]
	NotUtf8 { name: String },
	#[serde(rename_all = "camelCase")]
	TooLarge { name: String, bytes: u64, limit: u64 },
	#[serde(rename_all = "camelCase")]
	Unreadable { detail: String },
	#[serde(rename_all = "camelCase")]
	Undecodable { name: String, detail: String },
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
	#[serde(rename_all = "camelCase")]
	ClipboardRefused { detail: String },
	#[serde(rename_all = "camelCase")]
	Unrevealed { detail: String },
	#[serde(rename_all = "camelCase")]
	UnknownMessage { conversation_id: String, message_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LibraryImport {
	#[serde(rename_all = "camelCase")]
	Imported { item: LibraryItem },
	#[serde(rename_all = "camelCase")]
	Refused { error: LibraryError },
}

impl From<DatabaseError> for LibraryError {
	fn from(error: DatabaseError) -> Self {
		LibraryError::Storage { failure: (&error).into() }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, Value};

	use super::*;

	fn crosses_as(value: impl Serialize) -> Value {
		serde_json::to_value(value).expect("the value serializes")
	}

	#[test]
	fn an_item_crosses_under_the_names_the_frontend_reads() {
		let item = LibraryItem {
			name: "cover.png".to_owned(),
			kind: LibraryItemKind::Image,
			path: "/data/library/s1/cover.png".to_owned(),
			bytes: 12,
			modified_at: 2,
			created_at: None,
		};

		assert_eq!(
			crosses_as(item),
			json!({
				"name": "cover.png",
				"kind": "image",
				"path": "/data/library/s1/cover.png",
				"bytes": 12,
				"modifiedAt": 2,
				"createdAt": null
			})
		);
	}

	#[test]
	fn a_refusal_crosses_under_the_names_the_frontend_reads() {
		assert_eq!(
			crosses_as(LibraryError::UnknownSpace { id: "s1".to_owned() }),
			json!({ "kind": "unknownSpace", "id": "s1" })
		);
		assert_eq!(
			crosses_as(LibraryError::TooLarge { name: "big.md".to_owned(), bytes: 6, limit: 5 }),
			json!({ "kind": "tooLarge", "name": "big.md", "bytes": 6, "limit": 5 })
		);
		assert_eq!(
			crosses_as(LibraryError::NotADocument { name: "cover.png".to_owned() }),
			json!({ "kind": "notADocument", "name": "cover.png" })
		);
	}

	#[test]
	fn an_import_outcome_crosses_under_the_names_the_frontend_reads() {
		let item = LibraryItem {
			name: "notes (2).md".to_owned(),
			kind: LibraryItemKind::Document,
			path: "/data/library/s1/notes (2).md".to_owned(),
			bytes: 3,
			modified_at: 2,
			created_at: Some(1),
		};

		assert_eq!(
			crosses_as(LibraryImport::Imported { item }),
			json!({
				"status": "imported",
				"item": {
					"name": "notes (2).md",
					"kind": "document",
					"path": "/data/library/s1/notes (2).md",
					"bytes": 3,
					"modifiedAt": 2,
					"createdAt": 1
				}
			})
		);
		assert_eq!(
			crosses_as(LibraryImport::Refused {
				error: LibraryError::Unsupported { name: "song.mp3".to_owned() }
			}),
			json!({ "status": "refused", "error": { "kind": "unsupported", "name": "song.mp3" } })
		);
	}

	#[test]
	fn a_refused_save_copy_or_reveal_crosses_under_the_names_the_frontend_reads() {
		assert_eq!(
			crosses_as(LibraryError::Undecodable {
				name: "cover.png".to_owned(),
				detail: "bad header".to_owned()
			}),
			json!({ "kind": "undecodable", "name": "cover.png", "detail": "bad header" })
		);
		assert_eq!(
			crosses_as(LibraryError::Unwritable { detail: "denied".to_owned() }),
			json!({ "kind": "unwritable", "detail": "denied" })
		);
		assert_eq!(
			crosses_as(LibraryError::ClipboardRefused { detail: "no display".to_owned() }),
			json!({ "kind": "clipboardRefused", "detail": "no display" })
		);
		assert_eq!(
			crosses_as(LibraryError::Unrevealed { detail: "no file manager".to_owned() }),
			json!({ "kind": "unrevealed", "detail": "no file manager" })
		);
	}
}
