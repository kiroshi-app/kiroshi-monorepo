use serde::{Deserialize, Serialize};

use crate::conversations::contract::{AvatarBlot, StorageFailure};
use crate::db::repositories::space_hosting::Hosting;
use crate::db::repositories::{space_rows, space_settings, spaces};
use crate::db::DatabaseError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Space {
	pub id: String,
	pub name: String,
	pub colour: Option<AvatarBlot>,
	pub position: i64,
	pub created_at: i64,
	pub shared: bool,
	pub instance_id: Option<String>,
}

impl Space {
	pub fn presented(space: spaces::Space, hostings: &[Hosting]) -> Self {
		let hosting = hostings.iter().find(|hosting| hosting.space_id == space.id);
		Self {
			shared: hosting.is_some_and(|hosting| hosting.is_hosted),
			instance_id: hosting.and_then(|hosting| hosting.instance_id.clone()),
			id: space.id,
			name: space.name,
			colour: space.colour.map(Into::into),
			position: space.position,
			created_at: space.created_at,
		}
	}
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpacePreferences {
	#[serde(default)]
	pub collapsed_section_ids: Vec<String>,
}

impl From<space_settings::Preferences> for SpacePreferences {
	fn from(preferences: space_settings::Preferences) -> Self {
		Self { collapsed_section_ids: preferences.collapsed_section_ids }
	}
}

impl From<SpacePreferences> for space_settings::Preferences {
	fn from(preferences: SpacePreferences) -> Self {
		Self { collapsed_section_ids: preferences.collapsed_section_ids }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionCounts {
	pub bot_id: String,
	pub skills_count: u64,
	pub applications_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SpaceError {
	#[serde(rename_all = "camelCase")]
	Unavailable {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Storage {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	UnknownSpace {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownBot {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnwritableBundle {
		detail: String,
	},
	IncompleteOrder,
	LastSpace,
	#[serde(rename_all = "camelCase")]
	LastSpaceOfBot {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	ForeignSection {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnsupportedArchive {
		found: Option<u32>,
		supported: u32,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableArchive {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	UnwritableArchive {
		detail: String,
	},
}

impl From<DatabaseError> for SpaceError {
	fn from(error: DatabaseError) -> Self {
		SpaceError::Storage { failure: (&error).into() }
	}
}

impl From<spaces::SpaceError> for SpaceError {
	fn from(error: spaces::SpaceError) -> Self {
		match error {
			spaces::SpaceError::UnknownSpace { id } => SpaceError::UnknownSpace { id },
			spaces::SpaceError::UnknownBot { id } => SpaceError::UnknownBot { id },
			spaces::SpaceError::IncompleteOrder => SpaceError::IncompleteOrder,
			spaces::SpaceError::LastSpace => SpaceError::LastSpace,
			spaces::SpaceError::LastSpaceOfBot { id } => SpaceError::LastSpaceOfBot { id },
			spaces::SpaceError::ForeignSection { id } => SpaceError::ForeignSection { id },
			spaces::SpaceError::Database(failure) => {
				SpaceError::Storage { failure: (&failure).into() }
			}
		}
	}
}

impl From<space_rows::SpaceRowsError> for SpaceError {
	fn from(error: space_rows::SpaceRowsError) -> Self {
		match error {
			space_rows::SpaceRowsError::Database(failure) => {
				SpaceError::Storage { failure: (&failure).into() }
			}
			space_rows::SpaceRowsError::UnknownSpace { id } => SpaceError::UnknownSpace { id },
			space_rows::SpaceRowsError::Unportable { table, column } => {
				SpaceError::UnwritableArchive {
					detail: format!("{table}.{column} holds a value an archive cannot carry"),
				}
			}
			space_rows::SpaceRowsError::Malformed { detail } => {
				SpaceError::UnreadableArchive { detail }
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	#[test]
	fn a_space_crosses_to_the_front_under_the_names_it_reads() {
		assert_eq!(
			to_value(Space {
				id: "s1".to_owned(),
				name: "Vocca".to_owned(),
				colour: Some(AvatarBlot::Cyan),
				position: 1,
				created_at: 3,
				shared: true,
				instance_id: Some("i1".to_owned()),
			})
			.expect("the space serializes"),
			json!({
				"id": "s1",
				"name": "Vocca",
				"colour": "cyan",
				"position": 1,
				"createdAt": 3,
				"shared": true,
				"instanceId": "i1"
			})
		);
	}

	#[test]
	fn a_space_wearing_no_colour_crosses_to_the_front_with_none() {
		assert_eq!(
			to_value(Space {
				id: "s1".to_owned(),
				name: "Vocca".to_owned(),
				colour: None,
				position: 1,
				created_at: 3,
				shared: false,
				instance_id: None,
			})
			.expect("the space serializes"),
			json!({
				"id": "s1",
				"name": "Vocca",
				"colour": null,
				"position": 1,
				"createdAt": 3,
				"shared": false,
				"instanceId": null
			})
		);
	}

	#[test]
	fn a_space_record_crosses_to_the_front_under_the_name_it_reads() {
		assert_eq!(
			to_value(SpacePreferences::from(space_settings::Preferences {
				collapsed_section_ids: vec!["one".to_owned()],
			}))
			.expect("the record serializes"),
			json!({ "collapsedSectionIds": ["one"] })
		);
	}

	#[test]
	fn a_space_record_without_a_list_reads_as_no_collapsed_section() {
		let read: SpacePreferences =
			serde_json::from_value(json!({})).expect("the record deserializes");

		assert_eq!(read, SpacePreferences::default());
	}

	#[test]
	fn the_refusal_to_drop_the_last_space_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::LastSpace)).expect("the error"),
			json!({ "kind": "lastSpace" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::UnknownSpace { id: "s1".to_owned() }))
				.expect("the error"),
			json!({ "kind": "unknownSpace", "id": "s1" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::UnknownBot { id: "b1".to_owned() }))
				.expect("the error"),
			json!({ "kind": "unknownBot", "id": "b1" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::IncompleteOrder)).expect("the error"),
			json!({ "kind": "incompleteOrder" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::LastSpaceOfBot { id: "b1".to_owned() }))
				.expect("the error"),
			json!({ "kind": "lastSpaceOfBot", "id": "b1" })
		);
		assert_eq!(
			to_value(SpaceError::from(spaces::SpaceError::ForeignSection { id: "n1".to_owned() }))
				.expect("the error"),
			json!({ "kind": "foreignSection", "id": "n1" })
		);
	}
}
