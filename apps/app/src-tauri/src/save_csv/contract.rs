use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SaveCsvError {
	#[serde(rename_all = "camelCase")]
	InvalidName { name: String },
	#[serde(rename_all = "camelCase")]
	Unwritable { detail: String },
}
