use std::collections::BTreeMap;
use std::fmt;
use std::sync::LazyLock;

use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Deserialize)]
pub(super) struct Roots {
	pub nodes: String,
	pub edges: String,
	pub board: String,
}

#[derive(Deserialize)]
pub(super) struct ZOrder {
	pub field: String,
	pub digits: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Placement {
	Canvas,
	Kiroshi,
	Verbatim,
}

#[derive(Deserialize)]
pub(super) struct FieldSpec {
	#[serde(rename = "type")]
	pub value_type: String,
	#[serde(rename = "in")]
	pub placement: Placement,
	#[serde(rename = "enum")]
	pub allowed: Option<Vec<String>>,
	pub default: Option<Value>,
	#[serde(default)]
	pub optional: bool,
}

pub(super) struct Fields(pub Vec<(String, FieldSpec)>);

impl Fields {
	pub(super) fn get(&self, name: &str) -> Option<&FieldSpec> {
		self.0.iter().find(|(field, _)| field == name).map(|(_, spec)| spec)
	}
}

impl<'de> Deserialize<'de> for Fields {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		struct InSchemaOrder;

		impl<'de> Visitor<'de> for InSchemaOrder {
			type Value = Fields;

			fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
				formatter.write_str("an object of field specs")
			}

			fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Fields, A::Error> {
				let mut fields = Vec::new();
				while let Some(entry) = map.next_entry()? {
					fields.push(entry);
				}
				Ok(Fields(fields))
			}
		}

		deserializer.deserialize_map(InSchemaOrder)
	}
}

#[derive(Deserialize)]
pub(super) struct KindField {
	pub field: String,
}

#[derive(Deserialize)]
pub(super) struct NodeSchema {
	pub kind: KindField,
	pub fields: Fields,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct KindSpec {
	pub canvas_type: Option<String>,
	pub fields: Fields,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ImageImport {
	pub kind: String,
	pub canvas_type: String,
	pub extensions: Vec<String>,
}

#[derive(Deserialize)]
pub(super) struct PlainImport {
	pub kinds: BTreeMap<String, String>,
	pub image: ImageImport,
}

#[derive(Deserialize)]
pub(super) struct EdgeSchema {
	pub fields: Fields,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BoardSchema {
	pub doc: Roots,
	pub extras: String,
	pub z_order: ZOrder,
	pub node: NodeSchema,
	pub kinds: BTreeMap<String, KindSpec>,
	pub plain_import: PlainImport,
	pub edge: EdgeSchema,
}

pub(super) static SCHEMA: LazyLock<BoardSchema> = LazyLock::new(|| {
	serde_json::from_str(include_str!("../../../../../packages/shared/board/board.schema.json"))
		.expect("the embedded board schema names its roots, kinds and fields")
});
