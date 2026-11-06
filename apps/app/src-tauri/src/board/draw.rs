use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::doc::{BoardEdit, NodeChange};
use super::schema::{KindSpec, Size, SCHEMA};
use super::{
	kind_key, parsed_edge, parsed_node, z_at, z_key, Board, BoardError, Element, JsonObject,
};
use crate::library::image_media_type;

#[cfg(test)]
mod tests;

const GAP: i64 = 80;

const SECTION_PADDING: i64 = 40;

const SECTION: &str = "section";

const STICKY: &str = "sticky";

const TEXT: &str = "text";

const IMAGE: &str = "image";

const LIBRARY_ITEM: &str = "item";

const CANVAS_FILE: &str = "file";

const LABEL: &str = "label";

const AUTHOR: &str = "author";

const PROBE_AUTHOR: &str = "probe";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DrawnNode {
	pub key: String,
	pub kind: String,
	pub text: Option<String>,
	pub color: Option<String>,
	pub fill: Option<String>,
	pub shape: Option<String>,
	pub x: Option<i64>,
	pub y: Option<i64>,
	pub width: Option<i64>,
	pub height: Option<i64>,
	pub place: Option<Beside>,
	pub section: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Beside {
	pub side: String,
	pub of: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DrawnEdge {
	pub from: String,
	pub to: String,
	pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangedNode {
	pub id: String,
	pub text: Option<String>,
	pub color: Option<String>,
	pub fill: Option<String>,
	pub shape: Option<String>,
	pub x: Option<i64>,
	pub y: Option<i64>,
	pub width: Option<i64>,
	pub height: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum DrawFault {
	UnknownKind,
	DuplicateKey,
	PartialCoordinates,
	PlacementCycle,
	#[serde(rename_all = "camelCase")]
	UnknownSide {
		side: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownReference {
		reference: String,
	},
	#[serde(rename_all = "camelCase")]
	NotASection {
		reference: String,
	},
	#[serde(rename_all = "camelCase")]
	RefusedField {
		field: String,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawRefusal {
	pub element: Element,
	pub index: usize,
	#[serde(flatten)]
	pub fault: DrawFault,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Touched {
	pub node_id: Option<String>,
	pub x: i64,
	pub y: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Drawn {
	pub edit: BoardEdit,
	pub ids: BTreeMap<String, String>,
	pub touched: Option<Touched>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Changed {
	pub edit: BoardEdit,
	pub touched: Option<Touched>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeRead {
	pub id: String,
	pub kind: String,
	pub x: i64,
	pub y: i64,
	pub width: i64,
	pub height: i64,
	pub text: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub file: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub media_type: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub url: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub title: Option<String>,
	pub section: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeRead {
	pub id: String,
	pub from_node: String,
	pub to_node: String,
	pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardRead {
	pub nodes: Vec<NodeRead>,
	pub edges: Vec<EdgeRead>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct Rect {
	x: i64,
	y: i64,
	width: i64,
	height: i64,
}

impl Rect {
	fn of(node: &JsonObject) -> Self {
		let at = |field: &str| node.get(field).and_then(Value::as_i64).unwrap_or_default();
		Self { x: at("x"), y: at("y"), width: at("width"), height: at("height") }
	}

	fn sized(x: i64, y: i64, size: Size) -> Self {
		Self { x, y, width: size.width, height: size.height }
	}

	fn right(self) -> i64 {
		self.x + self.width
	}

	fn bottom(self) -> i64 {
		self.y + self.height
	}

	fn centre(self) -> (i64, i64) {
		(self.x + self.width / 2, self.y + self.height / 2)
	}

	fn size(self) -> Size {
		Size { width: self.width, height: self.height }
	}

	fn overlaps(self, other: Self) -> bool {
		self.x < other.right()
			&& other.x < self.right()
			&& self.y < other.bottom()
			&& other.y < self.bottom()
	}

	fn contains(self, other: Self) -> bool {
		self.x <= other.x
			&& self.y <= other.y
			&& other.right() <= self.right()
			&& other.bottom() <= self.bottom()
	}

	fn area(self) -> i64 {
		self.width.saturating_mul(self.height)
	}

	fn padded(self, padding: i64) -> Self {
		Self {
			x: self.x - padding,
			y: self.y - padding,
			width: self.width + 2 * padding,
			height: self.height + 2 * padding,
		}
	}

	fn joined(self, other: Self) -> Self {
		let (x, y) = (self.x.min(other.x), self.y.min(other.y));
		let (right, bottom) = (self.right().max(other.right()), self.bottom().max(other.bottom()));
		Self { x, y, width: right - x, height: bottom - y }
	}

	fn geometry(self) -> [(&'static str, i64); 4] {
		[("x", self.x), ("y", self.y), ("width", self.width), ("height", self.height)]
	}
}

#[derive(Debug, Clone, Copy)]
enum Side {
	Right,
	Left,
	Below,
	Above,
}

impl Side {
	fn named(name: &str) -> Option<Self> {
		match name {
			"right" => Some(Self::Right),
			"left" => Some(Self::Left),
			"below" => Some(Self::Below),
			"above" => Some(Self::Above),
			_ => None,
		}
	}

	fn beside(self, of: Rect, size: Size) -> Rect {
		let (centre_x, centre_y) = of.centre();
		let (across_x, across_y) = (centre_x - size.width / 2, centre_y - size.height / 2);
		match self {
			Self::Right => Rect::sized(of.right() + GAP, across_y, size),
			Self::Left => Rect::sized(of.x - GAP - size.width, across_y, size),
			Self::Below => Rect::sized(across_x, of.bottom() + GAP, size),
			Self::Above => Rect::sized(across_x, of.y - GAP - size.height, size),
		}
	}

	fn past(self, candidate: Rect, obstacle: Rect) -> Rect {
		let size = candidate.size();
		match self {
			Self::Right => Rect::sized(obstacle.right() + GAP, candidate.y, size),
			Self::Left => Rect::sized(obstacle.x - GAP - size.width, candidate.y, size),
			Self::Below => Rect::sized(candidate.x, obstacle.bottom() + GAP, size),
			Self::Above => Rect::sized(candidate.x, obstacle.y - GAP - size.height, size),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Reference {
	Batch(usize),
	Board(String),
}

enum Anchor {
	Coordinates(i64, i64),
	Beside(Side, Reference),
	InSection(Reference),
	AfterPrevious(usize),
	RightOfBoard,
}

struct Planned<'a> {
	kind: &'a str,
	size: Size,
	anchor: Anchor,
	section: Option<Reference>,
	look: JsonObject,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Progress {
	Waiting,
	Placing,
	Placed(Rect),
}

struct Layout<'a> {
	board: &'a Board,
	planned: Vec<Planned<'a>>,
	progress: Vec<Progress>,
	grown: HashMap<String, Rect>,
	stack: Vec<usize>,
}

pub fn drawn(
	board: &Board,
	author: &str,
	nodes: &[DrawnNode],
	edges: &[DrawnEdge],
) -> Result<Drawn, DrawRefusal> {
	let keys = batch_keys(nodes)?;
	let planned = nodes
		.iter()
		.enumerate()
		.map(|(index, node)| {
			planned(board, &keys, nodes, index, node)
				.map_err(|fault| refused(Element::Node, index, fault))
		})
		.collect::<Result<Vec<_>, _>>()?;
	let mut layout = Layout {
		board,
		progress: vec![Progress::Waiting; planned.len()],
		planned,
		grown: HashMap::new(),
		stack: Vec::new(),
	};
	for index in 0..nodes.len() {
		layout.placed(index)?;
	}
	let mut edit = BoardEdit::default();
	let mut z_keys: Vec<String> = board.nodes.values().filter_map(z_of).collect();
	let mut ids = BTreeMap::new();
	let mut added = Vec::new();
	for (index, node) in nodes.iter().enumerate() {
		let id = Uuid::new_v4().to_string();
		let z = z_above(&z_keys);
		z_keys.push(z.clone());
		let rect = layout.placed(index)?;
		let object = layout.planned[index].object(rect, author, z);
		let parsed = parsed_node(&id, Value::Object(object))
			.map_err(|error| refused(Element::Node, index, refused_field(error)))?;
		ids.insert(node.key.clone(), id.clone());
		added.push((id, parsed));
	}
	edit.changed_nodes = layout.grown_sections();
	let mut every_node = board.nodes.clone();
	every_node.extend(added.iter().cloned());
	for (index, drawn) in edges.iter().enumerate() {
		let id = Uuid::new_v4().to_string();
		let edge =
			drawn_edge(board, &ids, drawn).map_err(|fault| refused(Element::Edge, index, fault))?;
		let parsed = parsed_edge(&id, Value::Object(edge), &every_node)
			.map_err(|error| refused(Element::Edge, index, refused_field(error)))?;
		edit.added_edges.push((id, parsed));
	}
	let touched = match added.last() {
		Some((id, node)) => Some(touched_at(Some(id.as_str()), Rect::of(node))),
		None => edit.added_edges.last().and_then(|(_, edge)| {
			let id = edge.get("toNode").and_then(Value::as_str)?;
			every_node.get(id).map(|node| touched_at(Some(id), Rect::of(node)))
		}),
	};
	edit.added_nodes = added;
	Ok(Drawn { edit, ids, touched })
}

pub fn changed(board: &Board, changes: &[ChangedNode]) -> Result<Changed, DrawRefusal> {
	let mut edit = BoardEdit::default();
	for (index, change) in changes.iter().enumerate() {
		let node_change =
			node_changed(board, change).map_err(|fault| refused(Element::Node, index, fault))?;
		edit.changed_nodes.push(node_change);
	}
	let touched = edit
		.changed_nodes
		.last()
		.map(|change| touched_at(Some(change.id.as_str()), Rect::of(&change.node)));
	Ok(Changed { edit, touched })
}

pub fn removed(board: &Board, ids: &[String]) -> Result<Changed, DrawRefusal> {
	let mut edit = BoardEdit::default();
	for (index, id) in ids.iter().enumerate() {
		if !board.nodes.contains_key(id) {
			let fault = DrawFault::UnknownReference { reference: id.clone() };
			return Err(refused(Element::Node, index, fault));
		}
		if !edit.removed_nodes.contains(id) {
			edit.removed_nodes.push(id.clone());
		}
	}
	edit.removed_edges = board
		.edges
		.iter()
		.filter(|(_, edge)| {
			["fromNode", "toNode"].iter().any(|field| {
				let node = edge.get(*field).and_then(Value::as_str);
				node.is_some_and(|node| edit.removed_nodes.iter().any(|id| id == node))
			})
		})
		.map(|(id, _)| id.clone())
		.collect();
	let touched =
		ids.last().and_then(|id| board.nodes.get(id)).map(|node| touched_at(None, Rect::of(node)));
	Ok(Changed { edit, touched })
}

pub fn read_out(board: &Board) -> BoardRead {
	let sections: Vec<(&String, Rect)> = board
		.nodes
		.iter()
		.filter(|(_, node)| kind_of(node) == Some(SECTION))
		.map(|(id, node)| (id, Rect::of(node)))
		.collect();
	let mut ordered: Vec<(&String, &JsonObject)> = board.nodes.iter().collect();
	ordered.sort_by_cached_key(|(id, node)| (z_of(node), *id));
	let nodes = ordered
		.into_iter()
		.map(|(id, node)| {
			let rect = Rect::of(node);
			let section = sections
				.iter()
				.filter(|(section_id, section)| *section_id != id && section.contains(rect))
				.min_by_key(|(_, section)| section.area())
				.map(|(section_id, _)| (*section_id).clone());
			let file = library_file_of(node);
			let media_type = match kind_of(node) {
				Some(IMAGE) => file.as_deref().and_then(image_media_type).map(str::to_owned),
				_ => None,
			};
			NodeRead {
				id: id.clone(),
				kind: kind_of(node).unwrap_or_default().to_owned(),
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height,
				text: shown_text(node),
				file,
				media_type,
				url: text_of(node, "url"),
				title: text_of(node, "title"),
				section,
			}
		})
		.collect();
	let edges = board
		.edges
		.iter()
		.map(|(id, edge)| EdgeRead {
			id: id.clone(),
			from_node: text_of(edge, "fromNode").unwrap_or_default(),
			to_node: text_of(edge, "toNode").unwrap_or_default(),
			label: text_of(edge, LABEL),
		})
		.collect();
	BoardRead { nodes, edges }
}

impl Layout<'_> {
	fn placed(&mut self, index: usize) -> Result<Rect, DrawRefusal> {
		match self.progress[index] {
			Progress::Placed(rect) => return Ok(rect),
			Progress::Placing => {
				let start = self.stack.iter().position(|held| *held == index).unwrap_or_default();
				let first = self.stack[start..].iter().copied().min().unwrap_or(index);
				return Err(refused(Element::Node, first, DrawFault::PlacementCycle));
			}
			Progress::Waiting => {}
		}
		self.progress[index] = Progress::Placing;
		self.stack.push(index);
		let rect = self.laid_out(index)?;
		self.stack.pop();
		if let Some(section) = self.planned[index].section.clone() {
			let grown = self.rect_of(&section)?.joined(rect.padded(SECTION_PADDING));
			self.resized(&section, grown);
		}
		self.progress[index] = Progress::Placed(rect);
		Ok(rect)
	}

	fn laid_out(&mut self, index: usize) -> Result<Rect, DrawRefusal> {
		let size = self.planned[index].size;
		let (candidate, side, anchor) = match &self.planned[index].anchor {
			Anchor::Coordinates(x, y) => return Ok(Rect::sized(*x, *y, size)),
			Anchor::Beside(side, reference) => {
				let (side, reference) = (*side, reference.clone());
				let of = self.rect_of(&reference)?;
				(side.beside(of, size), side, of)
			}
			Anchor::AfterPrevious(previous) => {
				let of = self.placed(*previous)?;
				(Side::Right.beside(of, size), Side::Right, of)
			}
			Anchor::InSection(section) => {
				let section = section.clone();
				let held = self.rect_of(&section)?;
				let x = self
					.rects()
					.into_iter()
					.filter(|(_, rect)| *rect != held && held.contains(*rect))
					.map(|(_, rect)| rect.right() + GAP)
					.max()
					.unwrap_or(held.x + SECTION_PADDING);
				(Rect::sized(x, held.y + SECTION_PADDING, size), Side::Right, held)
			}
			Anchor::RightOfBoard => {
				let bounds = self.rects().into_iter().map(|(_, rect)| rect).reduce(Rect::joined);
				let at = bounds.map_or((0, 0), |bounds| (bounds.right() + GAP, bounds.y));
				let candidate = Rect::sized(at.0, at.1, size);
				(candidate, Side::Right, candidate)
			}
		};
		let obstacles: Vec<Rect> = self
			.rects()
			.into_iter()
			.filter(|(is_section, rect)| !(*is_section && rect.contains(anchor)))
			.map(|(_, rect)| rect)
			.collect();
		Ok(clear_of(candidate, side, &obstacles))
	}

	fn rects(&self) -> Vec<(bool, Rect)> {
		let on_board = self.board.nodes.iter().map(|(id, node)| {
			let rect = self.grown.get(id).copied().unwrap_or_else(|| Rect::of(node));
			(kind_of(node) == Some(SECTION), rect)
		});
		let in_batch =
			self.progress.iter().zip(&self.planned).filter_map(
				|(progress, planned)| match progress {
					Progress::Placed(rect) => Some((planned.kind == SECTION, *rect)),
					_ => None,
				},
			);
		on_board.chain(in_batch).collect()
	}

	fn rect_of(&mut self, reference: &Reference) -> Result<Rect, DrawRefusal> {
		match reference {
			Reference::Batch(index) => self.placed(*index),
			Reference::Board(id) => Ok(self
				.grown
				.get(id)
				.copied()
				.or_else(|| self.board.nodes.get(id).map(Rect::of))
				.unwrap_or_default()),
		}
	}

	fn resized(&mut self, section: &Reference, rect: Rect) {
		match section {
			Reference::Batch(index) => self.progress[*index] = Progress::Placed(rect),
			Reference::Board(id) => {
				self.grown.insert(id.clone(), rect);
			}
		}
	}

	fn grown_sections(&self) -> Vec<NodeChange> {
		let mut grown: Vec<_> = self.grown.iter().collect();
		grown.sort_by_key(|(id, _)| *id);
		grown
			.into_iter()
			.filter_map(|(id, rect)| {
				let mut node = self.board.nodes.get(id)?.clone();
				let mut fields = Vec::new();
				for (field, value) in rect.geometry() {
					node.insert(field.to_owned(), Value::from(value));
					fields.push(field.to_owned());
				}
				Some(NodeChange { id: id.clone(), node, fields })
			})
			.collect()
	}
}

impl Planned<'_> {
	fn object(&self, rect: Rect, author: &str, z: String) -> JsonObject {
		let mut object = self.look.clone();
		object.insert(kind_key().to_owned(), Value::from(self.kind));
		for (field, value) in rect.geometry() {
			object.insert(field.to_owned(), Value::from(value));
		}
		object.insert(z_key().to_owned(), Value::from(z));
		if self.kind == STICKY {
			object.insert(AUTHOR.to_owned(), json!({ "kind": "agent", "id": author }));
		}
		object
	}
}

fn clear_of(mut candidate: Rect, side: Side, obstacles: &[Rect]) -> Rect {
	while let Some(obstacle) = obstacles.iter().find(|obstacle| obstacle.overlaps(candidate)) {
		candidate = side.past(candidate, *obstacle);
	}
	candidate
}

fn batch_keys(nodes: &[DrawnNode]) -> Result<HashMap<&str, usize>, DrawRefusal> {
	let mut keys = HashMap::new();
	for (index, node) in nodes.iter().enumerate() {
		if keys.insert(node.key.as_str(), index).is_some() {
			return Err(refused(Element::Node, index, DrawFault::DuplicateKey));
		}
	}
	Ok(keys)
}

fn planned<'a>(
	board: &Board,
	keys: &HashMap<&str, usize>,
	nodes: &'a [DrawnNode],
	index: usize,
	node: &'a DrawnNode,
) -> Result<Planned<'a>, DrawFault> {
	let (kind, spec, default_size) = drawn_kind(&node.kind)?;
	let size = Size {
		width: node.width.unwrap_or(default_size.width),
		height: node.height.unwrap_or(default_size.height),
	};
	let section = node
		.section
		.as_deref()
		.map(|section| {
			let reference = resolved(board, keys, section)?;
			let is_a_section = match &reference {
				Reference::Batch(at) => nodes[*at].kind == SECTION,
				Reference::Board(id) => board.nodes.get(id).and_then(kind_of) == Some(SECTION),
			};
			if !is_a_section {
				return Err(DrawFault::NotASection { reference: section.to_owned() });
			}
			Ok(reference)
		})
		.transpose()?;
	let anchor = match (node.x, node.y, &node.place, &section) {
		(Some(x), Some(y), _, _) => Anchor::Coordinates(x, y),
		(Some(_), None, _, _) | (None, Some(_), _, _) => return Err(DrawFault::PartialCoordinates),
		(None, None, Some(beside), _) => {
			let side = Side::named(&beside.side)
				.ok_or_else(|| DrawFault::UnknownSide { side: beside.side.clone() })?;
			Anchor::Beside(side, resolved(board, keys, &beside.of)?)
		}
		(None, None, None, Some(section)) => Anchor::InSection(section.clone()),
		(None, None, None, None) if index > 0 => Anchor::AfterPrevious(index - 1),
		(None, None, None, None) => Anchor::RightOfBoard,
	};
	let look = looked(kind, spec, look_of(&node.text, &node.color, &node.fill, &node.shape))?;
	let planned = Planned { kind, size, anchor, section, look };
	let probe = planned.object(Rect::sized(0, 0, size), PROBE_AUTHOR, z_at(0));
	parsed_node(&node.key, Value::Object(probe)).map_err(refused_field)?;
	Ok(planned)
}

fn drawn_kind(kind: &str) -> Result<(&'static str, &'static KindSpec, Size), DrawFault> {
	let (name, spec) = SCHEMA.kinds.get_key_value(kind).ok_or(DrawFault::UnknownKind)?;
	let size = spec.size.ok_or(DrawFault::UnknownKind)?;
	Ok((name.as_str(), spec, size))
}

fn look_of<'a>(
	text: &'a Option<String>,
	color: &'a Option<String>,
	fill: &'a Option<String>,
	shape: &'a Option<String>,
) -> [(&'static str, Option<&'a String>); 4] {
	[
		(TEXT, text.as_ref()),
		("color", color.as_ref()),
		("fill", fill.as_ref()),
		("shape", shape.as_ref()),
	]
}

fn looked(
	kind: &str,
	spec: &KindSpec,
	look: [(&'static str, Option<&String>); 4],
) -> Result<JsonObject, DrawFault> {
	let mut fields = JsonObject::new();
	for (field, value) in look {
		let Some(value) = value else {
			continue;
		};
		let field = if field == TEXT && kind == SECTION { LABEL } else { field };
		if spec.fields.get(field).is_none() {
			return Err(DrawFault::RefusedField { field: field.to_owned() });
		}
		fields.insert(field.to_owned(), Value::from(value.as_str()));
	}
	Ok(fields)
}

fn node_changed(board: &Board, change: &ChangedNode) -> Result<NodeChange, DrawFault> {
	let unknown = || DrawFault::UnknownReference { reference: change.id.clone() };
	let current = board.nodes.get(&change.id).ok_or_else(unknown)?;
	let kind = kind_of(current).ok_or_else(unknown)?;
	let spec = SCHEMA.kinds.get(kind).ok_or_else(unknown)?;
	let mut fields =
		looked(kind, spec, look_of(&change.text, &change.color, &change.fill, &change.shape))?;
	let geometry =
		[("x", change.x), ("y", change.y), ("width", change.width), ("height", change.height)];
	for (field, value) in geometry {
		if let Some(value) = value {
			fields.insert(field.to_owned(), Value::from(value));
		}
	}
	let mut node = current.clone();
	node.extend(fields.clone());
	parsed_node(&change.id, Value::Object(node.clone())).map_err(refused_field)?;
	Ok(NodeChange { id: change.id.clone(), node, fields: fields.keys().cloned().collect() })
}

fn drawn_edge(
	board: &Board,
	ids: &BTreeMap<String, String>,
	edge: &DrawnEdge,
) -> Result<JsonObject, DrawFault> {
	let endpoint = |reference: &str| match ids.get(reference) {
		Some(id) => Ok(id.clone()),
		None if board.nodes.contains_key(reference) => Ok(reference.to_owned()),
		None => Err(DrawFault::UnknownReference { reference: reference.to_owned() }),
	};
	let mut object = JsonObject::new();
	object.insert("fromNode".to_owned(), Value::from(endpoint(&edge.from)?));
	object.insert("toNode".to_owned(), Value::from(endpoint(&edge.to)?));
	if let Some(label) = &edge.label {
		object.insert(LABEL.to_owned(), Value::from(label.as_str()));
	}
	Ok(object)
}

fn resolved(
	board: &Board,
	keys: &HashMap<&str, usize>,
	reference: &str,
) -> Result<Reference, DrawFault> {
	if let Some(index) = keys.get(reference) {
		return Ok(Reference::Batch(*index));
	}
	if board.nodes.contains_key(reference) {
		return Ok(Reference::Board(reference.to_owned()));
	}
	Err(DrawFault::UnknownReference { reference: reference.to_owned() })
}

fn z_above(keys: &[String]) -> String {
	let top = keys.iter().max();
	let next = z_at(keys.len());
	match top {
		Some(top) if next <= *top => format!("{top}{}", &SCHEMA.z_order.digits[..1]),
		_ => next,
	}
}

fn z_of(node: &JsonObject) -> Option<String> {
	node.get(z_key()).and_then(Value::as_str).map(str::to_owned)
}

fn kind_of(node: &JsonObject) -> Option<&str> {
	node.get(kind_key()).and_then(Value::as_str)
}

fn shown_text(node: &JsonObject) -> Option<String> {
	let field = if kind_of(node) == Some(SECTION) { LABEL } else { TEXT };
	text_of(node, field)
}

fn library_file_of(node: &JsonObject) -> Option<String> {
	let in_canvas_folder = || {
		let file = node.get(CANVAS_FILE).and_then(Value::as_str)?;
		file.rsplit('/').next().map(str::to_owned)
	};
	text_of(node, LIBRARY_ITEM).or_else(in_canvas_folder)
}

fn text_of(object: &JsonObject, field: &str) -> Option<String> {
	object.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn touched_at(node_id: Option<&str>, rect: Rect) -> Touched {
	let (x, y) = rect.centre();
	Touched { node_id: node_id.map(str::to_owned), x, y }
}

fn refused_field(error: BoardError) -> DrawFault {
	match error {
		BoardError::InvalidField { field, .. } => DrawFault::RefusedField { field },
		_ => DrawFault::RefusedField { field: kind_key().to_owned() },
	}
}

fn refused(element: Element, index: usize, fault: DrawFault) -> DrawRefusal {
	DrawRefusal { element, index, fault }
}
