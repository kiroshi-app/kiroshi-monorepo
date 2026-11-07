use serde::{Deserialize, Serialize};

use crate::conversations::contract::StorageFailure;
use crate::db::repositories::sections;
use crate::db::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RosterPin {
	pub id: String,
	pub section_id: Option<String>,
}

impl From<RosterPin> for sections::RosterPin {
	fn from(pin: RosterPin) -> Self {
		Self { id: pin.id, section_id: pin.section_id }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Section {
	pub id: String,
	pub space_id: String,
	pub name: String,
	pub position: i64,
	pub created_at: i64,
}

impl From<sections::Section> for Section {
	fn from(section: sections::Section) -> Self {
		Self {
			id: section.id,
			space_id: section.space_id,
			name: section.name,
			position: section.position,
			created_at: section.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SectionError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	UnknownSection { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	#[serde(rename_all = "camelCase")]
	SeveralSpaces { id: String },
	#[serde(rename_all = "camelCase")]
	ForeignSpace { id: String },
	#[serde(rename_all = "camelCase")]
	ForeignSection { id: String },
}

impl From<DatabaseError> for SectionError {
	fn from(error: DatabaseError) -> Self {
		SectionError::Storage { failure: (&error).into() }
	}
}

impl From<sections::SectionError> for SectionError {
	fn from(error: sections::SectionError) -> Self {
		match error {
			sections::SectionError::UnknownSection { id } => SectionError::UnknownSection { id },
			sections::SectionError::UnknownBot { id } => SectionError::UnknownBot { id },
			sections::SectionError::SeveralSpaces { id } => SectionError::SeveralSpaces { id },
			sections::SectionError::ForeignSpace { id } => SectionError::ForeignSpace { id },
			sections::SectionError::ForeignSection { id } => SectionError::ForeignSection { id },
			sections::SectionError::Database(failure) => {
				SectionError::Storage { failure: (&failure).into() }
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn a_section_crosses_to_the_front_under_the_names_it_reads() {
		assert_eq!(
			to_value(Section {
				id: "n1".to_owned(),
				space_id: "s1".to_owned(),
				name: "Writers".to_owned(),
				position: 2,
				created_at: 7,
			})
			.expect("the section serializes"),
			json!({
				"id": "n1",
				"spaceId": "s1",
				"name": "Writers",
				"position": 2,
				"createdAt": 7
			})
		);
	}

	#[test]
	fn a_section_of_another_space_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(SectionError::from(sections::SectionError::ForeignSection {
				id: "n1".to_owned()
			}))
			.expect("the error"),
			json!({ "kind": "foreignSection", "id": "n1" })
		);
		assert_eq!(
			to_value(SectionError::from(sections::SectionError::UnknownSection {
				id: "n1".to_owned()
			}))
			.expect("the error"),
			json!({ "kind": "unknownSection", "id": "n1" })
		);
		assert_eq!(
			to_value(SectionError::from(sections::SectionError::UnknownBot {
				id: "b1".to_owned()
			}))
			.expect("the error"),
			json!({ "kind": "unknownBot", "id": "b1" })
		);
		assert_eq!(
			to_value(SectionError::from(sections::SectionError::SeveralSpaces {
				id: "b1".to_owned()
			}))
			.expect("the error"),
			json!({ "kind": "severalSpaces", "id": "b1" })
		);
		assert_eq!(
			to_value(SectionError::from(sections::SectionError::ForeignSpace {
				id: "s1".to_owned()
			}))
			.expect("the error"),
			json!({ "kind": "foreignSpace", "id": "s1" })
		);
	}
}
