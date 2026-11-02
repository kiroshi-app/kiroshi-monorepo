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
	Missing { name: String },
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
