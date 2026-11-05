use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::ser::PrettyFormatter;
use serde_json::{Serializer, Value};

use super::schema::{FieldSpec, Placement, SCHEMA};
use super::{
	extras_key, is_in_z_order, kind_key, parsed_board, z_at, z_key, Board, BoardError, Element,
	JsonObject, Located,
};

const FOREIGN: &str = "foreign";

const ID: &str = "id";

const TYPE: &str = "type";

const INDENT: &[u8] = b"\t";

struct Placed {
	top: JsonObject,
	kiroshi: JsonObject,
}

fn place<'a>(
	fields: impl Iterator<Item = &'a (String, FieldSpec)>,
	element: &JsonObject,
	into: &mut Placed,
) {
	for (name, spec) in fields {
		let Some(value) = element.get(name) else {
			continue;
		};
		match (spec.placement, value) {
			(Placement::Verbatim, Value::Object(entries)) => into.top.extend(entries.clone()),
			(Placement::Verbatim, _) => {}
			(Placement::Canvas, _) => {
				into.top.insert(name.clone(), value.clone());
			}
			(Placement::Kiroshi, _) => {
				into.kiroshi.insert(name.clone(), value.clone());
			}
		}
	}
}

fn placed_with_extras(id: &str, element: &JsonObject) -> Placed {
	let mut top = JsonObject::new();
	top.insert(ID.to_owned(), Value::from(id));
	let kiroshi = match element.get(extras_key()) {
		Some(Value::Object(extras)) => extras.clone(),
		_ => JsonObject::new(),
	};
	Placed { top, kiroshi }
}

fn finished(placed: Placed) -> Value {
	let Placed { mut top, kiroshi } = placed;
	top.insert(extras_key().to_owned(), Value::Object(kiroshi));
	Value::Object(top)
}

fn canvas_node(id: &str, node: &JsonObject) -> Value {
	let mut placed = placed_with_extras(id, node);
	let kind = node.get(kind_key()).and_then(Value::as_str);
	let spec = kind.and_then(|kind| SCHEMA.kinds.get_key_value(kind));
	if let Some((kind, spec)) = spec {
		if let Some(canvas_type) = &spec.canvas_type {
			placed.top.insert(TYPE.to_owned(), Value::from(canvas_type.as_str()));
			placed.kiroshi.insert(kind_key().to_owned(), Value::from(kind.as_str()));
		}
	}
	place(SCHEMA.node.fields.0.iter(), node, &mut placed);
	if let Some((_, spec)) = spec {
		place(spec.fields.0.iter(), node, &mut placed);
	}
	finished(placed)
}

fn canvas_edge(id: &str, edge: &JsonObject) -> Value {
	let mut placed = placed_with_extras(id, edge);
	place(SCHEMA.edge.fields.0.iter(), edge, &mut placed);
	finished(placed)
}

fn z_of(node: &JsonObject) -> Option<&str> {
	node.get(z_key()).and_then(Value::as_str)
}

fn canvas_of(board: &Board) -> Value {
	let mut nodes: Vec<_> = board.nodes.iter().collect();
	nodes.sort_by(|(left_id, left), (right_id, right)| {
		z_of(left).cmp(&z_of(right)).then_with(|| left_id.cmp(right_id))
	});
	let mut canvas = JsonObject::new();
	canvas.insert(
		"nodes".to_owned(),
		nodes.into_iter().map(|(id, node)| canvas_node(id, node)).collect(),
	);
	canvas.insert(
		"edges".to_owned(),
		board.edges.iter().map(|(id, edge)| canvas_edge(id, edge)).collect(),
	);
	if !board.kiroshi.is_empty() {
		canvas.insert(extras_key().to_owned(), Value::Object(board.kiroshi.clone()));
	}
	Value::Object(canvas)
}

pub fn export_canvas(board: &Board) -> Result<String, serde_json::Error> {
	let mut written = Vec::new();
	let mut serializer =
		Serializer::with_formatter(&mut written, PrettyFormatter::with_indent(INDENT));
	canvas_of(board).serialize(&mut serializer)?;
	written.push(b'\n');
	Ok(String::from_utf8_lossy(&written).into_owned())
}

fn list_at(root: &mut JsonObject, field: &'static str) -> Result<Vec<Value>, BoardError> {
	match root.remove(field) {
		None => Ok(Vec::new()),
		Some(Value::Array(list)) => Ok(list),
		Some(_) => Err(BoardError::InvalidRoot { field }),
	}
}

fn rest(source: &JsonObject, claimed: &[&str]) -> JsonObject {
	source
		.iter()
		.filter(|(name, _)| !claimed.contains(&name.as_str()))
		.map(|(name, value)| (name.clone(), value.clone()))
		.collect()
}

fn kiroshi_of(source: &JsonObject, at: Located) -> Result<JsonObject, BoardError> {
	match source.get(extras_key()) {
		None => Ok(JsonObject::new()),
		Some(Value::Object(kiroshi)) => Ok(kiroshi.clone()),
		Some(_) => Err(at.refused(extras_key())),
	}
}

struct Shaping<'a, F> {
	source: &'a JsonObject,
	kiroshi: &'a JsonObject,
	fields: F,
	claimed_kiroshi: Vec<&'a str>,
}

fn shaped<'a>(shaping: Shaping<'a, impl Iterator<Item = &'a (String, FieldSpec)>>) -> JsonObject {
	let Shaping { source, kiroshi, fields, mut claimed_kiroshi } = shaping;
	let mut shape = JsonObject::new();
	let mut claimed_top = vec![ID, extras_key()];
	let mut verbatim = Vec::new();
	for (name, spec) in fields {
		let (from, claimed) = match spec.placement {
			Placement::Verbatim => {
				verbatim.push(name);
				continue;
			}
			Placement::Canvas => (source, &mut claimed_top),
			Placement::Kiroshi => (kiroshi, &mut claimed_kiroshi),
		};
		claimed.push(name);
		if let Some(value) = from.get(name) {
			shape.insert(name.clone(), value.clone());
		}
	}
	for name in verbatim {
		shape.insert(name.clone(), Value::Object(rest(source, &claimed_top)));
	}
	let extras = rest(kiroshi, &claimed_kiroshi);
	if !extras.is_empty() {
		shape.insert(extras_key().to_owned(), Value::Object(extras));
	}
	shape
}

fn extension_of(file: Option<&Value>) -> String {
	let Some(file) = file.and_then(Value::as_str) else {
		return String::new();
	};
	let name = file.rsplit('/').next().unwrap_or(file);
	match name.rfind('.') {
		Some(dot) if dot > 0 => name[dot + 1..].to_lowercase(),
		_ => String::new(),
	}
}

fn plain_kind(canvas_type: &str, node: &JsonObject) -> Option<String> {
	let image = &SCHEMA.plain_import.image;
	if canvas_type == image.canvas_type
		&& image.extensions.contains(&extension_of(node.get("file")))
	{
		return Some(image.kind.clone());
	}
	SCHEMA.plain_import.kinds.get(canvas_type).cloned()
}

fn is_canvas_type(canvas_type: &str) -> bool {
	SCHEMA.kinds.values().any(|spec| spec.canvas_type.as_deref() == Some(canvas_type))
}

fn kind_of(node: &JsonObject, kiroshi: &JsonObject, at: Located) -> Result<String, BoardError> {
	let Some(canvas_type) = node.get(TYPE).and_then(Value::as_str) else {
		return Err(at.refused(TYPE));
	};
	if !is_canvas_type(canvas_type) {
		return Ok(FOREIGN.to_owned());
	}
	match kiroshi.get(kind_key()) {
		None => plain_kind(canvas_type, node).ok_or_else(|| at.refused(TYPE)),
		Some(Value::String(declared))
			if SCHEMA
				.kinds
				.get(declared)
				.is_some_and(|spec| spec.canvas_type.as_deref() == Some(canvas_type)) =>
		{
			Ok(declared.clone())
		}
		Some(_) => Err(at.refused(kind_key())),
	}
}

fn shaped_node(node: &JsonObject, at: Located) -> Result<JsonObject, BoardError> {
	let kiroshi = kiroshi_of(node, at)?;
	let kind = kind_of(node, &kiroshi, at)?;
	let spec = SCHEMA.kinds.get(&kind).ok_or_else(|| at.refused(kind_key()))?;
	let claimed_kiroshi = if spec.canvas_type.is_some() { vec![kind_key()] } else { Vec::new() };
	let mut shape = shaped(Shaping {
		source: node,
		kiroshi: &kiroshi,
		fields: SCHEMA.node.fields.0.iter().chain(spec.fields.0.iter()),
		claimed_kiroshi,
	});
	shape.insert(kind_key().to_owned(), Value::from(kind));
	Ok(shape)
}

fn shaped_edge(edge: &JsonObject, at: Located) -> Result<JsonObject, BoardError> {
	let kiroshi = kiroshi_of(edge, at)?;
	Ok(shaped(Shaping {
		source: edge,
		kiroshi: &kiroshi,
		fields: SCHEMA.edge.fields.0.iter(),
		claimed_kiroshi: Vec::new(),
	}))
}

type Shape = fn(&JsonObject, Located) -> Result<JsonObject, BoardError>;

fn shaped_list(
	list: Vec<Value>,
	element: Element,
	shape: Shape,
) -> Result<Vec<(String, JsonObject)>, BoardError> {
	list.into_iter()
		.enumerate()
		.map(|(index, entry)| {
			let missing = BoardError::MissingId { element, index };
			let Value::Object(entry) = entry else {
				return Err(missing);
			};
			let Some(id) = entry.get(ID).and_then(Value::as_str).filter(|id| !id.is_empty()) else {
				return Err(missing);
			};
			let id = id.to_owned();
			let shaped = shape(&entry, Located { element, id: &id })?;
			Ok((id, shaped))
		})
		.collect()
}

fn in_array_z_order(mut nodes: Vec<(String, JsonObject)>) -> Vec<(String, JsonObject)> {
	let keys: Vec<_> = nodes.iter().map(|(_, node)| node.get(z_key())).collect();
	if is_in_z_order(&keys) {
		return nodes;
	}
	for (index, (_, node)) in nodes.iter_mut().enumerate() {
		node.insert(z_key().to_owned(), Value::from(z_at(index)));
	}
	nodes
}

fn keyed_by_id(
	entries: Vec<(String, JsonObject)>,
	element: Element,
) -> Result<BTreeMap<String, Value>, BoardError> {
	let mut by_id = BTreeMap::new();
	for (id, value) in entries {
		if by_id.contains_key(&id) {
			return Err(BoardError::DuplicateId { element, id });
		}
		by_id.insert(id, Value::Object(value));
	}
	Ok(by_id)
}

pub fn import_canvas(text: &str) -> Result<Board, BoardError> {
	let root: Value = serde_json::from_str(text)
		.map_err(|error| BoardError::NotJson { reason: error.to_string() })?;
	let Value::Object(mut root) = root else {
		return Err(BoardError::InvalidRoot { field: "root" });
	};
	let extras = match root.remove(extras_key()) {
		None => JsonObject::new(),
		Some(Value::Object(extras)) => extras,
		Some(_) => return Err(BoardError::InvalidRoot { field: "kiroshi" }),
	};
	let nodes =
		in_array_z_order(shaped_list(list_at(&mut root, "nodes")?, Element::Node, shaped_node)?);
	let edges = shaped_list(list_at(&mut root, "edges")?, Element::Edge, shaped_edge)?;
	parsed_board(keyed_by_id(nodes, Element::Node)?, keyed_by_id(edges, Element::Edge)?, extras)
}
