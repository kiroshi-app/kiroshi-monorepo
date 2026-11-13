mod arrange;
mod canvas;
mod doc;
mod draw;
#[cfg(test)]
mod fixtures;
mod hierarchy;
mod read;
mod schema;
#[cfg(test)]
mod tests;

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use serde_json::{Map, Value};

pub use arrange::{duplicated, moved, written, Group, Moved, WriteMode};
pub use canvas::{export_canvas, import_canvas};
pub use doc::{edit_board, read_board, write_board, BoardEdit, ElementChange};
pub use draw::{
	deleted, updated, ArrowPatch, ChangedNode, DrawRefusal, DrawnArrow, DrawnNode, Touched,
};
pub use read::{
	content_hash, find, framed, holds_node, info, node_file, node_info, tree, under, BoardDetail,
	BoardInfo, BoardTree, Frame, Framed, Sought,
};
use schema::{FieldSpec, Fields, KindSpec, Placement, SCHEMA};

pub type JsonObject = Map<String, Value>;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Board {
	nodes: BTreeMap<String, JsonObject>,
	edges: BTreeMap<String, JsonObject>,
	#[serde(skip_serializing_if = "Map::is_empty")]
	kiroshi: JsonObject,
	#[serde(skip_serializing_if = "Map::is_empty")]
	canvas: JsonObject,
}

impl Board {
	fn kept(
		&self,
		keeps_node: impl Fn(&str) -> bool,
		keeps_edge: impl Fn(&JsonObject) -> bool,
	) -> Self {
		let entries = |map: &BTreeMap<String, JsonObject>,
		               keeps: &dyn Fn(&String, &JsonObject) -> bool| {
			map.iter()
				.filter(|(id, element)| keeps(id, element))
				.map(|(id, element)| (id.clone(), element.clone()))
				.collect()
		};
		Self {
			nodes: entries(&self.nodes, &|id, _| keeps_node(id)),
			edges: entries(&self.edges, &|_, edge| keeps_edge(edge)),
			kiroshi: self.kiroshi.clone(),
			canvas: self.canvas.clone(),
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Element {
	Node,
	Edge,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BoardError {
	#[serde(rename_all = "camelCase")]
	NotJson { reason: String },
	#[serde(rename_all = "camelCase")]
	InvalidRoot { field: &'static str },
	#[serde(rename_all = "camelCase")]
	MissingId { element: Element, index: usize },
	#[serde(rename_all = "camelCase")]
	DuplicateId { element: Element, id: String },
	#[serde(rename_all = "camelCase")]
	InvalidField { element: Element, id: String, field: String },
	#[serde(rename_all = "camelCase")]
	DanglingEdge { id: String, field: &'static str, node: String },
}

#[derive(Clone, Copy)]
struct Located<'a> {
	element: Element,
	id: &'a str,
}

impl Located<'_> {
	fn refused(self, field: &str) -> BoardError {
		BoardError::InvalidField {
			element: self.element,
			id: self.id.to_owned(),
			field: field.to_owned(),
		}
	}
}

const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

const FIRST_Z_HEAD: u8 = b'a';

const ENDS: [End; 2] = [
	End { node: "fromNode", side: "fromSide", anchor: "fromAnchor", point: "fromPoint" },
	End { node: "toNode", side: "toSide", anchor: "toAnchor", point: "toPoint" },
];

const COORDINATES: [&str; 2] = ["x", "y"];

static COLOUR: LazyLock<Regex> = LazyLock::new(|| {
	Regex::new("^(?:[1-6]|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6})$").expect("the colour pattern compiles")
});

fn verbatim_key() -> &'static str {
	&SCHEMA.verbatim
}

fn extras_key() -> &'static str {
	&SCHEMA.extras
}

fn kind_key() -> &'static str {
	&SCHEMA.node.kind.field
}

fn z_key() -> &'static str {
	&SCHEMA.z_order.field
}

fn is_z(value: &Value) -> bool {
	value.as_str().is_some_and(|key| {
		!key.is_empty() && key.chars().all(|digit| SCHEMA.z_order.digits.contains(digit))
	})
}

fn z_at(index: usize) -> String {
	let digits = SCHEMA.z_order.digits.as_bytes();
	let base = digits.len();
	let mut key = vec![digits[index % base]];
	let mut rest = index / base;
	while rest > 0 {
		key.insert(0, digits[rest % base]);
		rest /= base;
	}
	let head = char::from(FIRST_Z_HEAD + (key.len() - 1) as u8);
	format!("{head}{}", String::from_utf8_lossy(&key))
}

fn is_in_z_order(keys: &[Option<&Value>]) -> bool {
	let valid: Option<Vec<&str>> =
		keys.iter().map(|key| key.filter(|key| is_z(key)).and_then(Value::as_str)).collect();
	valid.is_some_and(|keys| keys.windows(2).all(|pair| pair[0] < pair[1]))
}

fn integer_of(value: &Value) -> Option<i64> {
	let integer = match value.as_i64() {
		Some(integer) => integer,
		None => {
			let float = value.as_f64()?;
			if float.fract() != 0.0 || float.abs() > MAX_SAFE_INTEGER as f64 {
				return None;
			}
			float as i64
		}
	};
	(integer.abs() <= MAX_SAFE_INTEGER).then_some(integer)
}

const IDENTITY_KEYS: [&str; 2] = ["id", "kind"];

fn is_identity(spec: &FieldSpec, value: &Value) -> bool {
	let Some(identity) = value.as_object() else {
		return false;
	};
	let kind = identity.get("kind").and_then(Value::as_str);
	let id = identity.get("id").and_then(Value::as_str);
	identity.keys().map(String::as_str).eq(IDENTITY_KEYS)
		&& kind.is_some_and(|kind| {
			spec.allowed.as_ref().is_some_and(|allowed| allowed.iter().any(|name| name == kind))
		})
		&& id.is_some_and(|id| !id.is_empty())
}

fn with_paired_fill(mut node: JsonObject, spec: &KindSpec) -> JsonObject {
	let Some(pairing) = &spec.fill else {
		return node;
	};
	if !node.contains_key(&pairing.field) {
		let derived = node
			.get(&pairing.colour)
			.and_then(Value::as_str)
			.and_then(|colour| pairing.from_colour.get(colour))
			.map(|fill| Value::from(fill.as_str()))
			.or_else(|| spec.fields.get(&pairing.field).and_then(|field| field.default.clone()));
		if let Some(fill) = derived {
			node.insert(pairing.field.clone(), fill);
		}
	}
	let preset = pairing.preset_of(node.get(&pairing.field));
	let colour = node.get(&pairing.colour).and_then(Value::as_str);
	if preset.is_some() && colour == preset {
		node.remove(&pairing.colour);
	}
	node
}

fn is_fraction(value: &Value) -> bool {
	value.as_f64().is_some_and(|number| (0.0..=1.0).contains(&number))
}

fn is_pair(value: &Value, fits_coordinate: fn(&Value) -> bool) -> bool {
	value.as_object().is_some_and(|pair| {
		pair.len() == COORDINATES.len()
			&& COORDINATES.iter().all(|name| pair.get(*name).is_some_and(fits_coordinate))
	})
}

fn fitted(spec: &FieldSpec, value: &Value) -> Option<Value> {
	let fits = match spec.value_type.as_str() {
		"integer" => return integer_of(value).map(Value::from),
		"number" => value.is_number(),
		"fraction" => is_fraction(value),
		"anchor" => is_pair(value, is_fraction),
		"point" => is_pair(value, Value::is_number),
		"colour" => value.as_str().is_some_and(|colour| COLOUR.is_match(colour)),
		"zOrder" => is_z(value),
		"json" => value.is_object(),
		"identity" => is_identity(spec, value),
		_ => value.as_str().is_some_and(|text| {
			spec.allowed.as_ref().is_none_or(|allowed| allowed.iter().any(|name| name == text))
		}),
	};
	fits.then(|| value.clone())
}

fn parsed_fields(
	fields: &Fields,
	source: &JsonObject,
	at: Located,
	into: &mut JsonObject,
) -> Result<(), BoardError> {
	for (name, spec) in &fields.0 {
		let value = match source.get(name) {
			Some(value) => value,
			None if spec.optional => continue,
			None => spec.default.as_ref().ok_or_else(|| at.refused(name))?,
		};
		if spec.placement == Placement::Verbatim && value.as_object().is_some_and(Map::is_empty) {
			continue;
		}
		let fitted = fitted(spec, value).ok_or_else(|| at.refused(name))?;
		into.insert(name.clone(), fitted);
	}
	Ok(())
}

fn parsed_extras(
	source: &JsonObject,
	at: Located,
	into: &mut JsonObject,
) -> Result<(), BoardError> {
	match source.get(extras_key()) {
		None => Ok(()),
		Some(Value::Object(extras)) if extras.is_empty() => Ok(()),
		Some(extras @ Value::Object(_)) => {
			into.insert(extras_key().to_owned(), extras.clone());
			Ok(())
		}
		Some(_) => Err(at.refused(extras_key())),
	}
}

fn object_of(value: Value) -> JsonObject {
	match value {
		Value::Object(object) => object,
		_ => JsonObject::new(),
	}
}

fn parsed_node(id: &str, node: Value) -> Result<JsonObject, BoardError> {
	let at = Located { element: Element::Node, id };
	let node = object_of(node);
	let kind = node.get(kind_key()).and_then(Value::as_str);
	let Some((kind, spec)) = kind.and_then(|kind| SCHEMA.kinds.get_key_value(kind)) else {
		return Err(at.refused(kind_key()));
	};
	let node = with_paired_fill(node, spec);
	let mut parsed = JsonObject::new();
	parsed.insert(kind_key().to_owned(), Value::from(kind.as_str()));
	parsed_fields(&SCHEMA.node.fields, &node, at, &mut parsed)?;
	parsed_fields(&spec.fields, &node, at, &mut parsed)?;
	parsed_extras(&node, at, &mut parsed)?;
	Ok(parsed)
}

fn parsed_edge(
	id: &str,
	edge: Value,
	nodes: &BTreeMap<String, JsonObject>,
) -> Result<JsonObject, BoardError> {
	let at = Located { element: Element::Edge, id };
	let edge = object_of(edge);
	let mut parsed = JsonObject::new();
	parsed_fields(&SCHEMA.edge.fields, &edge, at, &mut parsed)?;
	parsed_extras(&edge, at, &mut parsed)?;
	for end in &ENDS {
		end.checked(&parsed, nodes, at)?;
	}
	Ok(parsed)
}

struct End {
	node: &'static str,
	side: &'static str,
	anchor: &'static str,
	point: &'static str,
}

impl End {
	fn checked(
		&self,
		edge: &JsonObject,
		nodes: &BTreeMap<String, JsonObject>,
		at: Located,
	) -> Result<(), BoardError> {
		let ties = [self.side, self.anchor];
		let Some(node) = edge.get(self.node).and_then(Value::as_str) else {
			if !edge.contains_key(self.point) {
				return Err(at.refused(self.node));
			}
			return match ties.into_iter().find(|tie| edge.contains_key(*tie)) {
				Some(tie) => Err(at.refused(tie)),
				None => Ok(()),
			};
		};
		if !nodes.contains_key(node) {
			return Err(BoardError::DanglingEdge {
				id: at.id.to_owned(),
				field: self.node,
				node: node.to_owned(),
			});
		}
		if edge.contains_key(self.point) {
			return Err(at.refused(self.point));
		}
		if ties.iter().all(|tie| edge.contains_key(*tie)) {
			return Err(at.refused(self.anchor));
		}
		Ok(())
	}
}

pub(crate) fn parsed_board(
	nodes: BTreeMap<String, Value>,
	edges: BTreeMap<String, Value>,
	kiroshi: JsonObject,
	canvas: JsonObject,
) -> Result<Board, BoardError> {
	let nodes = nodes
		.into_iter()
		.map(|(id, node)| parsed_node(&id, node).map(|parsed| (id, parsed)))
		.collect::<Result<BTreeMap<_, _>, _>>()?;
	let edges = edges
		.into_iter()
		.map(|(id, edge)| parsed_edge(&id, edge, &nodes).map(|parsed| (id, parsed)))
		.collect::<Result<BTreeMap<_, _>, _>>()?;
	Ok(Board { nodes, edges, kiroshi, canvas })
}
