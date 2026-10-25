use serde::{Deserialize, Serialize};

use super::Rejection;
use crate::conversations::contract::StorageFailure;
use crate::db::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SubmittedAttachment {
	pub name: String,
	#[serde(default)]
	#[specta(optional)]
	pub bytes: Option<Vec<u8>>,
	#[serde(default)]
	#[specta(optional)]
	pub base64: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AttachmentStoreError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	UnknownConversation { id: String },
	#[serde(rename_all = "camelCase")]
	TooMany { count: usize, limit: usize },
	#[serde(rename_all = "camelCase")]
	TooLarge { name: String, bytes: u64, limit: u64 },
	#[serde(rename_all = "camelCase")]
	TooLargeTogether { bytes: u64, limit: u64 },
	#[serde(rename_all = "camelCase")]
	Unreadable { name: String, detail: String },
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
}

impl AttachmentStoreError {
	pub fn exceeds_a_limit(&self) -> bool {
		matches!(
			self,
			AttachmentStoreError::TooMany { .. }
				| AttachmentStoreError::TooLarge { .. }
				| AttachmentStoreError::TooLargeTogether { .. }
		)
	}
}

impl From<Rejection> for AttachmentStoreError {
	fn from(rejection: Rejection) -> Self {
		match rejection {
			Rejection::TooMany { count, limit } => AttachmentStoreError::TooMany { count, limit },
			Rejection::TooLarge { name, bytes, limit } => {
				AttachmentStoreError::TooLarge { name, bytes, limit }
			}
			Rejection::TooLargeTogether { bytes, limit } => {
				AttachmentStoreError::TooLargeTogether { bytes, limit }
			}
			Rejection::Unreadable { name, detail } => {
				AttachmentStoreError::Unreadable { name, detail }
			}
			Rejection::Unwritable { detail } => AttachmentStoreError::Unwritable { detail },
		}
	}
}

impl From<DatabaseError> for AttachmentStoreError {
	fn from(error: DatabaseError) -> Self {
		AttachmentStoreError::Storage { failure: (&error).into() }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, Value};

	use super::*;

	fn crosses_as(error: AttachmentStoreError) -> Value {
		serde_json::to_value(&error).expect("the refusal serializes")
	}

	#[test]
	fn a_refusal_crosses_under_the_names_the_frontend_reads() {
		assert_eq!(
			crosses_as(AttachmentStoreError::UnknownConversation { id: "c1".to_owned() }),
			json!({ "kind": "unknownConversation", "id": "c1" })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::TooLarge {
				name: "huge.bin".to_owned(),
				bytes: 21,
				limit: 20
			}),
			json!({ "kind": "tooLarge", "name": "huge.bin", "bytes": 21, "limit": 20 })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::TooMany { count: 21, limit: 20 }),
			json!({ "kind": "tooMany", "count": 21, "limit": 20 })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::TooLargeTogether { bytes: 101, limit: 100 }),
			json!({ "kind": "tooLargeTogether", "bytes": 101, "limit": 100 })
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::Unreadable {
				name: "photo.jpg".to_owned(),
				detail: "carries neither base64 nor bytes".to_owned()
			}),
			json!({
				"kind": "unreadable",
				"name": "photo.jpg",
				"detail": "carries neither base64 nor bytes"
			})
		);
		assert_eq!(
			crosses_as(AttachmentStoreError::Unwritable { detail: "no space".to_owned() }),
			json!({ "kind": "unwritable", "detail": "no space" })
		);
	}

	#[test]
	fn only_a_limit_refusal_exceeds_a_limit() {
		let over = [
			AttachmentStoreError::TooMany { count: 21, limit: 20 },
			AttachmentStoreError::TooLarge { name: "a".to_owned(), bytes: 2, limit: 1 },
			AttachmentStoreError::TooLargeTogether { bytes: 2, limit: 1 },
		];
		let within = [
			AttachmentStoreError::Unreadable { name: "a".to_owned(), detail: "d".to_owned() },
			AttachmentStoreError::Unwritable { detail: "d".to_owned() },
			AttachmentStoreError::UnknownConversation { id: "c1".to_owned() },
		];

		assert!(over.iter().all(AttachmentStoreError::exceeds_a_limit));
		assert!(!within.iter().any(AttachmentStoreError::exceeds_a_limit));
	}

	#[test]
	fn a_submitted_file_is_read_from_the_shape_the_frontend_sends() {
		let submitted: SubmittedAttachment =
			serde_json::from_value(json!({ "name": "notes.md", "bytes": [1, 2, 3] }))
				.expect("the submission parses");

		assert_eq!(
			submitted,
			SubmittedAttachment {
				name: "notes.md".to_owned(),
				bytes: Some(vec![1, 2, 3]),
				base64: None
			}
		);
	}

	#[test]
	fn a_submitted_file_is_read_from_the_base64_shape_a_member_sends() {
		let submitted: SubmittedAttachment =
			serde_json::from_value(json!({ "name": "photo.jpg", "base64": "AQID" }))
				.expect("the submission parses");

		assert_eq!(
			submitted,
			SubmittedAttachment {
				name: "photo.jpg".to_owned(),
				bytes: None,
				base64: Some("AQID".to_owned())
			}
		);
	}
}
