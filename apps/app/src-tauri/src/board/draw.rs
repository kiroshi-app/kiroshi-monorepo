use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::doc::{BoardEdit, ElementChange};
use super::hierarchy::Hierarchy;
use super::schema::{KindSpec, Placement, Size, SCHEMA};
use super::{
	kind_key, parsed_edge, parsed_node, z_at, z_key, Board, BoardError, End, JsonObject, ENDS,
};

#[cfg(test)]
mod tests;

pub(super) const GAP: i64 = 80;

pub(super) const SECTION_PADDING: i64 = 40;

pub(super) const SECTION: &str = "section";

const STICKY: &str = "sticky";

const TEXT: &str = "text";

const LABEL: &str = "label";

const ROUTING: &str = "routing";

const ELBOW: &str = "elbow";

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
#[serde(rename_all = "camelCase")]
pub struct DrawnArrow {
	pub key: Option<String>,
	#[serde(flatten)]
	pub fields: JsonObject,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrowPatch {
	pub id: String,
	#[serde(flatten)]
	pub fields: JsonObject,
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
	MissingParent,
	#[serde(rename_all = "camelCase")]
	NestedInItself {
		reference: String,
	},
	#[serde(rename_all = "camelCase")]
	RefusedField {
		field: String,
	},
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BoardItem {
	Node,
	Arrow,
	Parent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawRefusal {
	pub element: BoardItem,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub index: Option<usize>,
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

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize)]
pub(super) struct Rect {
	pub(super) x: i64,
	pub(super) y: i64,
	pub(super) width: i64,
	pub(super) height: i64,
}

impl Rect {
	pub(super) fn of(node: &JsonObject) -> Self {
		let at = |field: &str| node.get(field).and_then(Value::as_i64).unwrap_or_default();
		Self { x: at("x"), y: at("y"), width: at("width"), height: at("height") }
	}

	pub(super) fn sized(x: i64, y: i64, size: Size) -> Self {
		Self { x, y, width: size.width, height: size.height }
	}

	pub(super) fn right(self) -> i64 {
		self.x + self.width
	}

	pub(super) fn bottom(self) -> i64 {
		self.y + self.height
	}

	pub(super) fn centre(self) -> (i64, i64) {
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

	pub(super) fn contains(self, other: Self) -> bool {
		self.x <= other.x
			&& self.y <= other.y
			&& other.right() <= self.right()
			&& other.bottom() <= self.bottom()
	}

	pub(super) fn area(self) -> i64 {
		self.width.saturating_mul(self.height)
	}

	pub(super) fn padded(self, padding: i64) -> Self {
		Self {
			x: self.x - padding,
			y: self.y - padding,
			width: self.width + 2 * padding,
			height: self.height + 2 * padding,
		}
	}

	pub(super) fn joined(self, other: Self) -> Self {
		let (x, y) = (self.x.min(other.x), self.y.min(other.y));
		let (right, bottom) = (self.right().max(other.right()), self.bottom().max(other.bottom()));
		Self { x, y, width: right - x, height: bottom - y }
	}

	pub(super) fn geometry(self) -> [(&'static str, i64); 4] {
		[("x", self.x), ("y", self.y), ("width", self.width), ("height", self.height)]
	}
}

#[derive(Debug, Clone, Copy)]
pub(super) enum Side {
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
	arrows: &[DrawnArrow],
) -> Result<Drawn, DrawRefusal> {
	let keys = batch_keys(nodes)?;
	let planned = nodes
		.iter()
		.enumerate()
		.map(|(index, node)| {
			planned(board, &keys, nodes, index, node)
				.map_err(|fault| refused(BoardItem::Node, index, fault))
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
	let mut node_ids = BTreeMap::new();
	let mut added = Vec::new();
	for (index, node) in nodes.iter().enumerate() {
		let id = Uuid::new_v4().to_string();
		let z = z_above(&z_keys);
		z_keys.push(z.clone());
		let rect = layout.placed(index)?;
		let object = layout.planned[index].object(rect, author, z);
		let parsed = parsed_node(&id, Value::Object(object))
			.map_err(|error| refused(BoardItem::Node, index, refused_field(error)))?;
		node_ids.insert(node.key.clone(), id.clone());
		added.push((id, parsed));
	}
	edit.changed_nodes = layout.grown_sections();
	let mut every_node = board.nodes.clone();
	every_node.extend(
		edit.changed_nodes.iter().map(|change| (change.id.clone(), change.element.clone())),
	);
	every_node.extend(added.iter().cloned());
	let mut ids = node_ids.clone();
	for (index, arrow) in arrows.iter().enumerate() {
		let id = Uuid::new_v4().to_string();
		let at = |fault| refused(BoardItem::Arrow, index, fault);
		let edge = drawn_arrow(&every_node, &node_ids, arrow).map_err(at)?;
		let parsed = parsed_edge(&id, Value::Object(edge), &every_node)
			.map_err(|error| at(refused_field(error)))?;
		if let Some(key) = &arrow.key {
			if ids.insert(key.clone(), id.clone()).is_some() {
				return Err(at(DrawFault::DuplicateKey));
			}
		}
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

pub fn updated(
	board: &Board,
	nodes: &[ChangedNode],
	arrows: &[ArrowPatch],
) -> Result<Changed, DrawRefusal> {
	let mut edit = BoardEdit::default();
	for (index, change) in nodes.iter().enumerate() {
		let node_change =
			node_changed(board, change).map_err(|fault| refused(BoardItem::Node, index, fault))?;
		edit.changed_nodes.push(node_change);
	}
	for (index, patch) in arrows.iter().enumerate() {
		let arrow_change =
			arrow_changed(board, patch).map_err(|fault| refused(BoardItem::Arrow, index, fault))?;
		edit.changed_edges.push(arrow_change);
	}
	let touched = edit
		.changed_nodes
		.last()
		.map(|change| touched_at(Some(change.id.as_str()), Rect::of(&change.element)));
	Ok(Changed { edit, touched })
}

pub fn deleted(board: &Board, nodes: &[String], arrows: &[String]) -> Result<Changed, DrawRefusal> {
	known(nodes, BoardItem::Node, |id| board.nodes.contains_key(id))?;
	known(arrows, BoardItem::Arrow, |id| board.edges.contains_key(id))?;
	let removed_nodes = Hierarchy::of(board).with_descendants(nodes);
	let gone: BTreeSet<&str> = removed_nodes.iter().map(String::as_str).collect();
	let removed_edges = board
		.edges
		.iter()
		.filter(|(id, edge)| arrows.contains(id) || is_tied_to(edge, &gone))
		.map(|(id, _)| id.clone())
		.collect();
	let edit = BoardEdit { removed_nodes, removed_edges, ..BoardEdit::default() };
	let touched = nodes
		.last()
		.and_then(|id| board.nodes.get(id))
		.map(|node| touched_at(None, Rect::of(node)));
	Ok(Changed { edit, touched })
}

pub(super) fn known(
	ids: &[String],
	element: BoardItem,
	holds: impl Fn(&str) -> bool,
) -> Result<(), DrawRefusal> {
	match ids.iter().position(|id| !holds(id)) {
		Some(index) => {
			let fault = DrawFault::UnknownReference { reference: ids[index].clone() };
			Err(refused(element, index, fault))
		}
		None => Ok(()),
	}
}

pub(super) fn tied_ends(edge: &JsonObject) -> impl Iterator<Item = &str> {
	ENDS.iter().filter_map(|end| edge.get(end.node).and_then(Value::as_str))
}

pub(super) fn is_tied_to(edge: &JsonObject, nodes: &BTreeSet<&str>) -> bool {
	tied_ends(edge).any(|node| nodes.contains(node))
}

impl Layout<'_> {
	fn placed(&mut self, index: usize) -> Result<Rect, DrawRefusal> {
		match self.progress[index] {
			Progress::Placed(rect) => return Ok(rect),
			Progress::Placing => {
				let start = self.stack.iter().position(|held| *held == index).unwrap_or_default();
				let first = self.stack[start..].iter().copied().min().unwrap_or(index);
				return Err(refused(BoardItem::Node, first, DrawFault::PlacementCycle));
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

	fn grown_sections(&self) -> Vec<ElementChange> {
		let mut grown: Vec<_> = self.grown.iter().collect();
		grown.sort_by_key(|(id, _)| *id);
		grown
			.into_iter()
			.filter_map(|(id, rect)| Some(reshaped(id, self.board.nodes.get(id)?, *rect)))
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

pub(super) fn reshaped(id: &str, node: &JsonObject, rect: Rect) -> ElementChange {
	let mut element = node.clone();
	let mut fields = Vec::new();
	for (field, value) in rect.geometry() {
		element.insert(field.to_owned(), Value::from(value));
		fields.push(field.to_owned());
	}
	ElementChange { id: id.to_owned(), element, fields }
}

pub(super) fn clear_of(mut candidate: Rect, side: Side, obstacles: &[Rect]) -> Rect {
	while let Some(obstacle) = obstacles.iter().find(|obstacle| obstacle.overlaps(candidate)) {
		candidate = side.past(candidate, *obstacle);
	}
	candidate
}

fn batch_keys(nodes: &[DrawnNode]) -> Result<HashMap<&str, usize>, DrawRefusal> {
	let mut keys = HashMap::new();
	for (index, node) in nodes.iter().enumerate() {
		if keys.insert(node.key.as_str(), index).is_some() {
			return Err(refused(BoardItem::Node, index, DrawFault::DuplicateKey));
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

fn node_changed(board: &Board, change: &ChangedNode) -> Result<ElementChange, DrawFault> {
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
	Ok(ElementChange {
		id: change.id.clone(),
		element: node,
		fields: fields.keys().cloned().collect(),
	})
}

fn drawn_arrow(
	nodes: &BTreeMap<String, JsonObject>,
	keys: &BTreeMap<String, String>,
	arrow: &DrawnArrow,
) -> Result<JsonObject, DrawFault> {
	let mut edge = arrow_fields(&arrow.fields)?;
	for end in &ENDS {
		let Some(reference) = edge.get(end.node).and_then(Value::as_str) else {
			continue;
		};
		let id = match keys.get(reference) {
			Some(id) => id.clone(),
			None if nodes.contains_key(reference) => reference.to_owned(),
			None => return Err(DrawFault::UnknownReference { reference: reference.to_owned() }),
		};
		edge.insert(end.node.to_owned(), Value::from(id));
	}
	if !edge.contains_key(ROUTING) {
		edge.insert(ROUTING.to_owned(), Value::from(ELBOW));
		tied_facing(&mut edge, nodes);
	}
	Ok(edge)
}

fn arrow_fields(fields: &JsonObject) -> Result<JsonObject, DrawFault> {
	let is_arrow_field = |name: &str| {
		SCHEMA.edge.fields.get(name).is_some_and(|spec| spec.placement != Placement::Verbatim)
	};
	match fields.keys().find(|name| !is_arrow_field(name)) {
		Some(name) => Err(DrawFault::RefusedField { field: name.clone() }),
		None => Ok(fields.clone()),
	}
}

fn end_rect(edge: &JsonObject, end: &End, nodes: &BTreeMap<String, JsonObject>) -> Option<Rect> {
	if let Some(node) = edge.get(end.node).and_then(Value::as_str) {
		return nodes.get(node).map(Rect::of);
	}
	let point = edge.get(end.point)?;
	let at = |axis: &str| point.get(axis).and_then(Value::as_f64).map(|value| value.round() as i64);
	Some(Rect { x: at("x")?, y: at("y")?, width: 0, height: 0 })
}

fn facing_sides(from: Rect, to: Rect) -> [&'static str; 2] {
	let ((from_x, from_y), (to_x, to_y)) = (from.centre(), to.centre());
	let (across, down) = (to_x - from_x, to_y - from_y);
	match (across.abs() >= down.abs(), across >= 0, down >= 0) {
		(true, true, _) => ["right", "left"],
		(true, false, _) => ["left", "right"],
		(false, _, true) => ["bottom", "top"],
		(false, _, false) => ["top", "bottom"],
	}
}

fn tied_facing(edge: &mut JsonObject, nodes: &BTreeMap<String, JsonObject>) {
	let [Some(from), Some(to)] = ENDS.each_ref().map(|end| end_rect(edge, end, nodes)) else {
		return;
	};
	for (end, side) in ENDS.iter().zip(facing_sides(from, to)) {
		let is_loose = [end.side, end.anchor].iter().all(|tie| !edge.contains_key(*tie));
		if edge.contains_key(end.node) && is_loose {
			edge.insert(end.side.to_owned(), Value::from(side));
		}
	}
}

fn displaced_by(end: &End, field: &str) -> Vec<&'static str> {
	match field {
		_ if field == end.node => vec![end.point],
		_ if field == end.point => vec![end.node, end.side, end.anchor],
		_ if field == end.side => vec![end.anchor],
		_ if field == end.anchor => vec![end.side],
		_ => Vec::new(),
	}
}

fn arrow_changed(board: &Board, patch: &ArrowPatch) -> Result<ElementChange, DrawFault> {
	let unknown = |reference: &str| DrawFault::UnknownReference { reference: reference.to_owned() };
	let current = board.edges.get(&patch.id).ok_or_else(|| unknown(&patch.id))?;
	let fields = arrow_fields(&patch.fields)?;
	let mut edge = current.clone();
	let mut named = Vec::new();
	for end in &ENDS {
		if let Some(node) = fields.get(end.node).and_then(Value::as_str) {
			if !board.nodes.contains_key(node) {
				return Err(unknown(node));
			}
		}
		for given in fields.keys() {
			for displaced in displaced_by(end, given) {
				if !fields.contains_key(displaced) && edge.remove(displaced).is_some() {
					named.push(displaced.to_owned());
				}
			}
		}
	}
	edge.extend(fields.clone());
	named.extend(fields.keys().cloned());
	parsed_edge(&patch.id, Value::Object(edge.clone()), &board.nodes).map_err(refused_field)?;
	Ok(ElementChange { id: patch.id.clone(), element: edge, fields: named })
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

pub(super) fn z_above(keys: &[String]) -> String {
	let top = keys.iter().max();
	let next = z_at(keys.len());
	match top {
		Some(top) if next <= *top => format!("{top}{}", &SCHEMA.z_order.digits[..1]),
		_ => next,
	}
}

pub(super) fn z_of(node: &JsonObject) -> Option<String> {
	node.get(z_key()).and_then(Value::as_str).map(str::to_owned)
}

pub(super) fn kind_of(node: &JsonObject) -> Option<&str> {
	node.get(kind_key()).and_then(Value::as_str)
}

pub(super) fn shown_text(node: &JsonObject) -> Option<String> {
	let field = if kind_of(node) == Some(SECTION) { LABEL } else { TEXT };
	text_of(node, field)
}

pub(super) fn text_of(object: &JsonObject, field: &str) -> Option<String> {
	object.get(field).and_then(Value::as_str).map(str::to_owned)
}

pub(super) fn touched_at(node_id: Option<&str>, rect: Rect) -> Touched {
	let (x, y) = rect.centre();
	Touched { node_id: node_id.map(str::to_owned), x, y }
}

pub(super) fn refused_field(error: BoardError) -> DrawFault {
	match error {
		BoardError::InvalidField { field, .. } => DrawFault::RefusedField { field },
		_ => DrawFault::RefusedField { field: kind_key().to_owned() },
	}
}

pub(super) fn refused(element: BoardItem, index: usize, fault: DrawFault) -> DrawRefusal {
	DrawRefusal { element, index: Some(index), fault }
}

pub(super) fn refused_parent(fault: DrawFault) -> DrawRefusal {
	DrawRefusal { element: BoardItem::Parent, index: None, fault }
}
