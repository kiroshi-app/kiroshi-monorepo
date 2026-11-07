use kiroshi_core::board::{BoardEdit, ElementChange};
use kiroshi_core::library::link_preview::contract::LibraryLinkPreview;
use serde_json::{Map, Value, json};

use kiroshi_rune_kit::surfaces::s15_boards::model::{
	Connector, End, Point, Rect, Routing, ShapeFill, ShapeKind, ShapeStyle, Side, Size, Tool,
};

use super::session::Held;

const Z: &str = "z";

const Z_DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const LIBRARY_FOLDER: &str = "Library";

const ENDS: [&str; 2] = ["from", "to"];

const TIES: [&str; 3] = ["Node", "Side", "Anchor"];

const ARROW_FIELDS: [&str; 12] = [
	"fromNode",
	"fromSide",
	"fromAnchor",
	"fromPoint",
	"toNode",
	"toSide",
	"toAnchor",
	"toPoint",
	"routing",
	"bend",
	"label",
	"labelPosition",
];

#[derive(Clone, Debug, PartialEq)]
pub enum LibraryObject {
	Image { item: String },
	LibraryCard { item: String },
	LinkCard { url: String },
}

impl LibraryObject {
	fn size(&self) -> Size {
		match self {
			LibraryObject::Image { .. } => Size::new(220.0, 146.0),
			LibraryObject::LibraryCard { .. } => Size::new(236.0, 131.0),
			LibraryObject::LinkCard { .. } => Size::new(300.0, 178.0),
		}
	}

	fn fields(&self) -> Map<String, Value> {
		let fields = match self {
			LibraryObject::Image { item } => {
				json!({ "kind": "image", "item": item, "file": library_file(item) })
			}
			LibraryObject::LibraryCard { item } => {
				json!({ "kind": "libraryCard", "item": item, "file": library_file(item) })
			}
			LibraryObject::LinkCard { url } => json!({ "kind": "linkCard", "url": url }),
		};
		object_of(fields)
	}
}

fn library_file(item: &str) -> String {
	format!("{LIBRARY_FOLDER}/{item}")
}

fn object_of(value: Value) -> Map<String, Value> {
	match value {
		Value::Object(entries) => entries,
		_ => Map::new(),
	}
}

fn whole(value: f64) -> Value {
	Value::from(value.round() as i64)
}

fn number(value: f64) -> Value {
	if value.fract() == 0.0 { Value::from(value as i64) } else { json!(value) }
}

fn pair(point: Point) -> Value {
	json!({ "x": number(point.x), "y": number(point.y) })
}

fn z_at(index: usize) -> String {
	let base = Z_DIGITS.len();
	let mut digits = vec![Z_DIGITS[index % base]];
	let mut rest = index / base;
	while rest > 0 {
		digits.insert(0, Z_DIGITS[rest % base]);
		rest /= base;
	}
	String::from_utf8_lossy(&digits).into_owned()
}

fn z_keys(held: &Held) -> Vec<String> {
	let mut keys: Vec<String> = held
		.nodes
		.values()
		.filter_map(|node| node.get(Z).and_then(Value::as_str).map(str::to_owned))
		.collect();
	keys.sort();
	keys
}

fn z_above(held: &Held) -> String {
	let keys = z_keys(held);
	let next = z_at(keys.len());
	match keys.last() {
		Some(top) if next <= *top => format!("{top}{}", char::from(Z_DIGITS[0])),
		_ => next,
	}
}

fn z_below(held: &Held) -> String {
	let keys = z_keys(held);
	let Some(bottom) = keys.first() else { return z_at(0) };
	let lowest = Z_DIGITS[0];
	let Some(at) = bottom.bytes().position(|digit| digit != lowest) else {
		return bottom.clone();
	};
	let digit = bottom.as_bytes()[at];
	let lower =
		Z_DIGITS.iter().position(|each| *each == digit).map_or(lowest, |at| Z_DIGITS[at - 1]);
	let highest = Z_DIGITS[Z_DIGITS.len() - 1];
	format!("{}{}{}", &bottom[..at], char::from(lower), char::from(highest))
}

fn placed_fields(rect: Rect, z: String) -> Map<String, Value> {
	object_of(json!({
		"x": whole(rect.x),
		"y": whole(rect.y),
		"width": whole(rect.width),
		"height": whole(rect.height),
		"z": z,
	}))
}

fn kind_fields(tool: Tool, author: &str) -> Option<Value> {
	match tool {
		Tool::Sticky => Some(json!({
			"kind": "sticky",
			"text": "",
			"fill": "yellow",
			"author": { "kind": "person", "id": author },
		})),
		Tool::Text => Some(json!({ "kind": "text", "text": "" })),
		Tool::Shape => Some(json!({ "kind": "shape", "text": "", "shape": "rectangle" })),
		Tool::Section => Some(json!({ "kind": "section" })),
		Tool::Select | Tool::Hand | Tool::Connector | Tool::Image | Tool::Library => None,
	}
}

fn added_node(id: &str, node: Map<String, Value>) -> BoardEdit {
	BoardEdit { added_nodes: vec![(id.to_owned(), node)], ..BoardEdit::default() }
}

fn change_of(element: &Value, changes: Value) -> Option<ElementChange> {
	let mut element = element.as_object()?.clone();
	let changes = object_of(changes);
	let fields = changes.keys().cloned().collect();
	for (name, value) in changes {
		if value.is_null() {
			element.remove(&name);
		} else {
			element.insert(name, value);
		}
	}
	Some(ElementChange { id: String::new(), element, fields })
}

fn changed_node(held: &Held, id: &str, changes: Value) -> Option<BoardEdit> {
	let change = change_of(held.nodes.get(id)?, changes)?;
	Some(BoardEdit {
		changed_nodes: vec![ElementChange { id: id.to_owned(), ..change }],
		..BoardEdit::default()
	})
}

fn kind_of<'a>(held: &'a Held, id: &str) -> Option<&'a str> {
	held.nodes.get(id)?.get("kind")?.as_str()
}

pub fn placed(held: &Held, id: &str, tool: Tool, rect: Rect, author: &str) -> Option<BoardEdit> {
	let kind = kind_fields(tool, author)?;
	let z = if tool == Tool::Section { z_below(held) } else { z_above(held) };
	let mut node = placed_fields(rect, z);
	node.extend(object_of(kind));
	Some(added_node(id, node))
}

pub fn library_placed(held: &Held, id: &str, object: &LibraryObject, centre: Point) -> BoardEdit {
	let size = object.size();
	let rect = Rect::new(
		centre.x - size.width / 2.0,
		centre.y - size.height / 2.0,
		size.width,
		size.height,
	);
	let mut node = placed_fields(rect, z_above(held));
	node.extend(object.fields());
	added_node(id, node)
}

pub fn moved(held: &Held, id: &str, position: Point) -> Option<BoardEdit> {
	changed_node(held, id, json!({ "x": whole(position.x), "y": whole(position.y) }))
}

pub fn resized(held: &Held, id: &str, rect: Rect) -> Option<BoardEdit> {
	changed_node(
		held,
		id,
		json!({
			"x": whole(rect.x),
			"y": whole(rect.y),
			"width": whole(rect.width),
			"height": whole(rect.height),
		}),
	)
}

pub fn retexted(held: &Held, id: &str, text: &str) -> Option<BoardEdit> {
	match kind_of(held, id) {
		Some("sticky" | "text" | "shape") => changed_node(held, id, json!({ "text": text })),
		Some("section") => changed_node(held, id, json!({ "label": text })),
		Some(_) => None,
		None => {
			let change = change_of(held.edges.get(id)?, json!({ "label": text }))?;
			Some(BoardEdit {
				changed_edges: vec![ElementChange { id: id.to_owned(), ..change }],
				..BoardEdit::default()
			})
		}
	}
}

fn fill_name(fill: ShapeFill) -> Option<&'static str> {
	match fill {
		ShapeFill::Surface => None,
		ShapeFill::Yellow => Some("yellow"),
		ShapeFill::Green => Some("green"),
		ShapeFill::Blue => Some("blue"),
		ShapeFill::Pink => Some("pink"),
	}
}

fn preset_of(fill: ShapeFill) -> Option<&'static str> {
	match fill {
		ShapeFill::Surface => None,
		ShapeFill::Yellow => Some("3"),
		ShapeFill::Green => Some("4"),
		ShapeFill::Blue => Some("5"),
		ShapeFill::Pink => Some("1"),
	}
}

fn schema_shape(shape: ShapeKind) -> &'static str {
	match shape {
		ShapeKind::Ellipse => "ellipse",
		ShapeKind::RoundedRectangle => "rectangle",
	}
}

fn colour_change(fill: ShapeFill) -> Value {
	preset_of(fill).map_or(Value::Null, Value::from)
}

pub fn restyled(held: &Held, id: &str, style: ShapeStyle) -> Option<BoardEdit> {
	match kind_of(held, id)? {
		"sticky" => changed_node(held, id, json!({ "fill": fill_name(style.fill)? })),
		"shape" => changed_node(
			held,
			id,
			json!({ "shape": schema_shape(style.shape), "color": colour_change(style.fill) }),
		),
		"foreign" => None,
		_ => changed_node(held, id, json!({ "color": colour_change(style.fill) })),
	}
}

fn side_name(side: Side) -> &'static str {
	match side {
		Side::Top => "top",
		Side::Right => "right",
		Side::Bottom => "bottom",
		Side::Left => "left",
	}
}

fn routing_name(routing: Routing) -> &'static str {
	match routing {
		Routing::Straight => "straight",
		Routing::Elbow => "elbow",
	}
}

fn end_fields(name: &str, end: &End) -> Map<String, Value> {
	let mut fields = Map::new();
	let mut put = |field: &str, value: Option<Value>| {
		if let Some(value) = value {
			fields.insert(format!("{name}{field}"), value);
		}
	};
	put("Node", (!end.item.is_empty()).then(|| Value::from(end.item.as_str())));
	put("Side", end.side.map(|side| Value::from(side_name(side))));
	put("Anchor", end.anchor.map(pair));
	put("Point", end.point.map(pair));
	fields
}

fn arrow_fields(arrow: &Connector) -> Map<String, Value> {
	let mut fields = end_fields("from", &arrow.from);
	fields.extend(end_fields("to", &arrow.to));
	fields.insert("routing".to_owned(), Value::from(routing_name(arrow.routing)));
	fields.insert("bend".to_owned(), number(arrow.bend));
	if !arrow.text.is_empty() {
		fields.insert("label".to_owned(), Value::from(arrow.text.as_str()));
	}
	if let Some(position) = arrow.label_position {
		fields.insert("labelPosition".to_owned(), number(position));
	}
	fields
}

fn is_tied_to_held_node(held: &Held, end: &End) -> bool {
	end.item.is_empty() || held.nodes.contains_key(&end.item)
}

pub fn arrow_set(held: &Held, arrow: &Connector) -> Option<BoardEdit> {
	if !is_tied_to_held_node(held, &arrow.from) || !is_tied_to_held_node(held, &arrow.to) {
		return None;
	}
	let fields = arrow_fields(arrow);
	let Some(edge) = held.edges.get(&arrow.id).and_then(Value::as_object) else {
		let mut added = object_of(json!({ "fromEnd": "none", "toEnd": "arrow" }));
		added.extend(fields);
		return Some(BoardEdit {
			added_edges: vec![(arrow.id.clone(), added)],
			..BoardEdit::default()
		});
	};
	let mut element = edge.clone();
	for name in ARROW_FIELDS {
		element.remove(name);
	}
	element.extend(fields);
	let change = ElementChange {
		id: arrow.id.clone(),
		element,
		fields: ARROW_FIELDS.iter().map(|name| (*name).to_owned()).collect(),
	};
	Some(BoardEdit { changed_edges: vec![change], ..BoardEdit::default() })
}

fn fraction_of(edge: &Map<String, Value>, end: &str) -> Point {
	let anchor = edge.get(&format!("{end}Anchor")).and_then(|anchor| {
		Some(Point::new(anchor.get("x")?.as_f64()?, anchor.get("y")?.as_f64()?))
	});
	let side = edge.get(&format!("{end}Side")).and_then(Value::as_str);
	anchor.unwrap_or(match side {
		Some("top") => Point::new(0.5, 0.0),
		Some("right") => Point::new(1.0, 0.5),
		Some("bottom") => Point::new(0.5, 1.0),
		Some("left") => Point::new(0.0, 0.5),
		_ => Point::new(0.5, 0.5),
	})
}

fn point_in(node: &Value, fraction: Point) -> Point {
	let field = |name: &str| node.get(name).and_then(Value::as_f64).unwrap_or_default();
	Point::new(field("x") + fraction.x * field("width"), field("y") + fraction.y * field("height"))
}

fn loosened(id: &str, node: &Value, edge_id: &str, edge: &Value) -> Option<ElementChange> {
	let edge = edge.as_object()?;
	let mut element = edge.clone();
	let mut fields = Vec::new();
	for end in ENDS {
		if edge.get(&format!("{end}Node")).and_then(Value::as_str) != Some(id) {
			continue;
		}
		let point = format!("{end}Point");
		element.insert(point.clone(), pair(point_in(node, fraction_of(edge, end))));
		fields.push(point);
		for tie in TIES {
			let name = format!("{end}{tie}");
			element.remove(&name);
			fields.push(name);
		}
	}
	(!fields.is_empty()).then(|| ElementChange { id: edge_id.to_owned(), element, fields })
}

pub fn deleted(held: &Held, id: &str) -> Option<BoardEdit> {
	let Some(node) = held.nodes.get(id) else {
		return held
			.edges
			.contains_key(id)
			.then(|| BoardEdit { removed_edges: vec![id.to_owned()], ..BoardEdit::default() });
	};
	let changed_edges =
		held.edges.iter().filter_map(|(edge_id, edge)| loosened(id, node, edge_id, edge)).collect();
	Some(BoardEdit { changed_edges, removed_nodes: vec![id.to_owned()], ..BoardEdit::default() })
}

pub fn link_described(held: &Held, id: &str, preview: &LibraryLinkPreview) -> Option<BoardEdit> {
	if kind_of(held, id) != Some("linkCard") {
		return None;
	}
	let mut changes = Map::new();
	let mut put = |field: &str, value: Option<&str>| {
		if let Some(value) = value.filter(|value| !value.is_empty()) {
			changes.insert(field.to_owned(), Value::from(value));
		}
	};
	put("title", Some(&preview.title));
	put("preview", preview.image.as_deref());
	put("description", preview.description.as_deref());
	if changes.is_empty() {
		return None;
	}
	changed_node(held, id, Value::Object(changes))
}
