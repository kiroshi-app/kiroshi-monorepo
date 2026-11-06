use std::collections::BTreeMap;
use std::fmt;
use std::sync::LazyLock;

use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Deserialize)]
pub struct Roots {
	pub nodes: String,
	pub edges: String,
	pub board: String,
	pub canvas: String,
}

#[derive(Deserialize)]
pub struct ZOrder {
	pub field: String,
	pub digits: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Placement {
	Canvas,
	Kiroshi,
	Verbatim,
}

#[derive(Deserialize)]
pub struct FieldSpec {
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

pub struct Fields(pub Vec<(String, FieldSpec)>);

impl Fields {
	pub fn get(&self, name: &str) -> Option<&FieldSpec> {
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
pub struct KindField {
	pub field: String,
}

#[derive(Deserialize)]
pub struct NodeSchema {
	pub kind: KindField,
	pub fields: Fields,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KindSpec {
	pub size: Option<Size>,
	pub canvas_type: Option<String>,
	pub fields: Fields,
	pub fill: Option<FillPairing>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Size {
	pub width: i64,
	pub height: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FillPairing {
	pub field: String,
	pub colour: String,
	pub presets: BTreeMap<String, String>,
	pub from_colour: BTreeMap<String, String>,
}

impl FillPairing {
	pub fn preset_of(&self, fill: Option<&Value>) -> Option<&str> {
		fill.and_then(Value::as_str).and_then(|fill| self.presets.get(fill)).map(String::as_str)
	}
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageImport {
	pub kind: String,
	pub canvas_type: String,
	pub extensions: Vec<String>,
}

#[derive(Deserialize)]
pub struct PlainImport {
	pub kinds: BTreeMap<String, String>,
	pub image: ImageImport,
}

#[derive(Deserialize)]
pub struct EdgeSchema {
	pub fields: Fields,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardSchema {
	pub doc: Roots,
	pub extras: String,
	pub verbatim: String,
	pub z_order: ZOrder,
	pub node: NodeSchema,
	pub kinds: BTreeMap<String, KindSpec>,
	pub plain_import: PlainImport,
	pub edge: EdgeSchema,
}

pub static SCHEMA: LazyLock<BoardSchema> = LazyLock::new(|| {
	serde_json::from_str(include_str!("../../../../packages/shared/board/board.schema.json"))
		.expect("the embedded board schema names its roots, kinds and fields")
});
