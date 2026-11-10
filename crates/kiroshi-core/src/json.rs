use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::datatype::DataType;
use specta::{Type, Types};

#[derive(Debug, Serialize, Deserialize)]
#[serde(transparent)]
pub struct JsonValue(pub serde_json::Value);

impl From<serde_json::Value> for JsonValue {
	fn from(value: serde_json::Value) -> Self {
		Self(value)
	}
}

impl From<JsonValue> for serde_json::Value {
	fn from(json: JsonValue) -> Self {
		json.0
	}
}

// specta declares `serde_json::Value` inline, and specta-typescript refuses an inline type
// that references itself. Json carries the same union under a name the exporter is allowed
// to recurse through.
#[derive(Serialize, Deserialize, Type)]
#[serde(untagged)]
enum Json {
	Null(()),
	Bool(bool),
	Number(f64),
	Text(String),
	List(Vec<Json>),
	Members(BTreeMap<String, Json>),
}

impl Type for JsonValue {
	fn definition(types: &mut Types) -> DataType {
		<Json as Type>::definition(types)
	}
}
