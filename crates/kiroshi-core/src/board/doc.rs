use std::collections::HashMap;

use serde_json::Value;
use yrs::types::ToJson;
use yrs::{
	Any, Doc, In, Map, MapPrelim, MapRef, Number, Out, ReadTxn, Text, TextPrelim, Transact,
	TransactionMut,
};

use super::schema::{Fields, SCHEMA};
use super::{parsed_board, Board, BoardError, JsonObject};

#[derive(Debug, Default, Clone, PartialEq)]
pub struct BoardEdit {
	pub added_nodes: Vec<(String, JsonObject)>,
	pub changed_nodes: Vec<ElementChange>,
	pub removed_nodes: Vec<String>,
	pub added_edges: Vec<(String, JsonObject)>,
	pub changed_edges: Vec<ElementChange>,
	pub removed_edges: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ElementChange {
	pub id: String,
	pub element: JsonObject,
	pub fields: Vec<String>,
}

const TEXT: &str = "text";

fn number_of(number: Number) -> Value {
	match number.as_i64() {
		Some(integer) => Value::from(integer),
		None => number
			.as_f64()
			.and_then(serde_json::Number::from_f64)
			.map_or(Value::Null, Value::Number),
	}
}

fn json_of(any: &Any) -> Value {
	match any {
		Any::Null | Any::Undefined => Value::Null,
		Any::Bool(flag) => Value::from(*flag),
		Any::Number(number) => number_of(*number),
		Any::String(text) => Value::from(&**text),
		Any::Buffer(bytes) => bytes.iter().map(|byte| Value::from(*byte)).collect(),
		Any::Array(items) => items.iter().map(json_of).collect(),
		Any::Map(entries) => Value::Object(
			entries.iter().map(|(name, value)| (name.clone(), json_of(value))).collect(),
		),
	}
}

fn any_of(value: &Value) -> Any {
	match value {
		Value::Null => Any::Null,
		Value::Bool(flag) => Any::Bool(*flag),
		Value::Number(number) => match number.as_i64() {
			Some(integer) => Any::Number(Number::Int(integer)),
			None => number.as_f64().map_or(Any::Null, |float| Any::Number(Number::Float(float))),
		},
		Value::String(text) => Any::from(text.as_str()),
		Value::Array(items) => Any::from(items.iter().map(any_of).collect::<Vec<_>>()),
		Value::Object(entries) => Any::from(
			entries
				.iter()
				.map(|(name, value)| (name.clone(), any_of(value)))
				.collect::<HashMap<_, _>>(),
		),
	}
}

fn root_entries<T: ReadTxn>(txn: &T, name: &str) -> JsonObject {
	match txn.get_map(name).map(|map| json_of(&map.to_json(txn))) {
		Some(Value::Object(entries)) => entries,
		_ => JsonObject::new(),
	}
}

pub fn read_board(doc: &Doc) -> Result<Board, BoardError> {
	let txn = doc.transact();
	let roots = &SCHEMA.doc;
	parsed_board(
		root_entries(&txn, &roots.nodes).into_iter().collect(),
		root_entries(&txn, &roots.edges).into_iter().collect(),
		root_entries(&txn, &roots.board),
		root_entries(&txn, &roots.canvas),
	)
}

fn is_text(fields: &[&Fields], name: &str) -> bool {
	fields.iter().any(|fields| fields.get(name).is_some_and(|spec| spec.value_type == TEXT))
}

fn shared_element(element: &JsonObject, fields: &[&Fields]) -> MapPrelim {
	element.iter().map(|(name, value)| (name.as_str(), shared_value(value, fields, name))).collect()
}

fn node_fields(node: &JsonObject) -> Vec<&'static Fields> {
	let kind = node.get(&SCHEMA.node.kind.field).and_then(Value::as_str);
	let kind_fields = kind.and_then(|kind| SCHEMA.kinds.get(kind)).map(|spec| &spec.fields);
	std::iter::once(&SCHEMA.node.fields).chain(kind_fields).collect()
}

pub fn write_board(doc: &Doc, board: &Board) {
	let roots = &SCHEMA.doc;
	let nodes = doc.get_or_insert_map(roots.nodes.as_str());
	let edges = doc.get_or_insert_map(roots.edges.as_str());
	let extras = doc.get_or_insert_map(roots.board.as_str());
	let canvas = doc.get_or_insert_map(roots.canvas.as_str());
	let mut txn = doc.transact_mut();
	for root in [&nodes, &edges, &extras, &canvas] {
		root.clear(&mut txn);
	}
	for (id, node) in &board.nodes {
		nodes.insert(&mut txn, id.as_str(), shared_element(node, &node_fields(node)));
	}
	for (id, edge) in &board.edges {
		edges.insert(&mut txn, id.as_str(), shared_element(edge, &[&SCHEMA.edge.fields]));
	}
	for (name, value) in &board.kiroshi {
		extras.insert(&mut txn, name.as_str(), any_of(value));
	}
	for (name, value) in &board.canvas {
		canvas.insert(&mut txn, name.as_str(), any_of(value));
	}
}

fn shared_value(value: &Value, fields: &[&Fields], name: &str) -> In {
	match value {
		Value::String(text) if is_text(fields, name) => In::from(TextPrelim::new(text.as_str())),
		_ => In::Any(any_of(value)),
	}
}

fn changed_in_place(
	txn: &mut TransactionMut,
	element: &MapRef,
	change: &ElementChange,
	fields: &[&Fields],
) {
	for name in &change.fields {
		match (element.get(txn, name), change.element.get(name)) {
			(_, None) => {
				element.remove(txn, name);
			}
			(Some(Out::YText(text)), Some(Value::String(next))) => {
				let length = text.len(txn);
				text.remove_range(txn, 0, length);
				text.insert(txn, 0, next);
			}
			(_, Some(value)) => {
				element.insert(txn, name.as_str(), shared_value(value, fields, name));
			}
		}
	}
}

fn changed(txn: &mut TransactionMut, root: &MapRef, change: &ElementChange, fields: &[&Fields]) {
	match root.get(txn, &change.id) {
		Some(Out::YMap(element)) => changed_in_place(txn, &element, change, fields),
		_ => {
			root.insert(txn, change.id.as_str(), shared_element(&change.element, fields));
		}
	}
}

pub fn edit_board(doc: &Doc, edit: &BoardEdit) {
	let roots = &SCHEMA.doc;
	let nodes = doc.get_or_insert_map(roots.nodes.as_str());
	let edges = doc.get_or_insert_map(roots.edges.as_str());
	let mut txn = doc.transact_mut();
	for id in &edit.removed_edges {
		edges.remove(&mut txn, id);
	}
	for id in &edit.removed_nodes {
		nodes.remove(&mut txn, id);
	}
	for (id, node) in &edit.added_nodes {
		nodes.insert(&mut txn, id.as_str(), shared_element(node, &node_fields(node)));
	}
	for change in &edit.changed_nodes {
		changed(&mut txn, &nodes, change, &node_fields(&change.element));
	}
	for (id, edge) in &edit.added_edges {
		edges.insert(&mut txn, id.as_str(), shared_element(edge, &[&SCHEMA.edge.fields]));
	}
	for change in &edit.changed_edges {
		changed(&mut txn, &edges, change, &[&SCHEMA.edge.fields]);
	}
}
