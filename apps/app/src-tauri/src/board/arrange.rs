use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use super::doc::ElementChange;
use super::draw::{
	clear_of, drawn, is_tied_to, kind_of, known, refused_parent, reshaped, tied_ends, touched_at,
	z_above, z_of, BoardItem, DrawFault, DrawRefusal, Drawn, DrawnArrow, DrawnNode, Rect, Side,
	Touched, GAP, SECTION, SECTION_PADDING,
};
use super::hierarchy::{parent_section, Hierarchy};
use super::{z_key, Board, BoardEdit, JsonObject, ENDS};

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WriteMode {
	Insert,
	Replace,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Duplicated {
	pub edit: BoardEdit,
	pub nodes: BTreeMap<String, String>,
	pub arrows: BTreeMap<String, String>,
	pub touched: Option<Touched>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Moved {
	pub edit: BoardEdit,
	pub nodes: Vec<String>,
	pub touched: Option<Touched>,
}

pub struct Group<'a> {
	pub parent: Option<&'a str>,
	pub mode: WriteMode,
	pub nodes: &'a [DrawnNode],
	pub arrows: &'a [DrawnArrow],
}

pub fn written(board: &Board, author: &str, write: &Group) -> Result<Drawn, DrawRefusal> {
	let parent = parent_section(board, write.parent)?;
	let cleared = match (write.mode, parent) {
		(WriteMode::Insert, _) => Vec::new(),
		(WriteMode::Replace, None) => return Err(refused_parent(DrawFault::MissingParent)),
		(WriteMode::Replace, Some(section)) => {
			Hierarchy::of(board).descendants(section).into_iter().map(str::to_owned).collect()
		}
	};
	let gone: BTreeSet<&str> = cleared.iter().map(String::as_str).collect();
	let kept = board.kept(|id| !gone.contains(id), |edge| !is_tied_to(edge, &gone));
	let nodes: Vec<DrawnNode> = write
		.nodes
		.iter()
		.cloned()
		.map(|mut node| {
			node.section = node.section.or_else(|| parent.map(str::to_owned));
			node
		})
		.collect();
	let mut drawn = drawn(&kept, author, &nodes, write.arrows)?;
	drawn.edit.removed_edges = board
		.edges
		.iter()
		.filter(|(_, edge)| is_tied_to(edge, &gone))
		.map(|(id, _)| id.clone())
		.collect();
	drawn.edit.removed_nodes = cleared;
	Ok(drawn)
}

pub fn moved(
	board: &Board,
	ids: &[String],
	parent: Option<&str>,
	at: (i64, i64),
) -> Result<Moved, DrawRefusal> {
	known(ids, BoardItem::Node, |id| board.nodes.contains_key(id))?;
	let parent = parent_section(board, parent)?;
	let moving = Hierarchy::of(board).with_descendants(ids);
	if let Some(parent) = parent.filter(|parent| moving.iter().any(|id| id == parent)) {
		return Err(refused_parent(DrawFault::NestedInItself { reference: parent.to_owned() }));
	}
	let Some(bounds) = bounds_of(board, ids) else {
		return Ok(Moved { edit: BoardEdit::default(), nodes: moving, touched: None });
	};
	let offset = (at.0 - bounds.x, at.1 - bounds.y);
	let mut edit = BoardEdit {
		changed_nodes: moving.iter().map(|id| shifted(id, &board.nodes[id], offset)).collect(),
		..BoardEdit::default()
	};
	if let Some(parent) = parent {
		let section = Rect::of(&board.nodes[parent]);
		let landed = shift(bounds, offset).padded(SECTION_PADDING);
		if !section.contains(landed) {
			edit.changed_nodes.push(reshaped(parent, &board.nodes[parent], section.joined(landed)));
		}
	}
	let touched = ids
		.last()
		.map(|id| touched_at(Some(id.as_str()), shift(Rect::of(&board.nodes[id]), offset)));
	Ok(Moved { edit, nodes: moving, touched })
}

pub fn duplicated(
	board: &Board,
	ids: &[String],
	at: Option<(i64, i64)>,
) -> Result<Duplicated, DrawRefusal> {
	known(ids, BoardItem::Node, |id| board.nodes.contains_key(id))?;
	let mut copied = Hierarchy::of(board).with_descendants(ids);
	copied.sort_by_cached_key(|id| (z_of(&board.nodes[id]), id.clone()));
	let Some(bounds) = bounds_of(board, ids) else {
		return Ok(Duplicated {
			edit: BoardEdit::default(),
			nodes: BTreeMap::new(),
			arrows: BTreeMap::new(),
			touched: None,
		});
	};
	let (x, y) = at.unwrap_or_else(|| {
		let candidate = Rect { x: bounds.right() + GAP, ..bounds };
		let obstacles: Vec<Rect> = board
			.nodes
			.values()
			.filter(|node| !(kind_of(node) == Some(SECTION) && Rect::of(node).contains(bounds)))
			.map(Rect::of)
			.collect();
		let landed = clear_of(candidate, Side::Right, &obstacles);
		(landed.x, landed.y)
	});
	let offset = (x - bounds.x, y - bounds.y);
	let mut z_keys: Vec<String> = board.nodes.values().filter_map(z_of).collect();
	let mut edit = BoardEdit::default();
	let mut nodes = BTreeMap::new();
	for id in &copied {
		let copy = Uuid::new_v4().to_string();
		let mut node = shifted(id, &board.nodes[id], offset).element;
		let z = z_above(&z_keys);
		z_keys.push(z.clone());
		node.insert(z_key().to_owned(), Value::from(z));
		nodes.insert(id.clone(), copy.clone());
		edit.added_nodes.push((copy, node));
	}
	let mut arrows = BTreeMap::new();
	for (id, edge) in &board.edges {
		let ends: Vec<&str> = tied_ends(edge).collect();
		if ends.len() < ENDS.len() || !ends.iter().all(|end| nodes.contains_key(*end)) {
			continue;
		}
		let mut copy = edge.clone();
		for end in &ENDS {
			if let Some(node) = edge.get(end.node).and_then(Value::as_str) {
				copy.insert(end.node.to_owned(), Value::from(nodes[node].as_str()));
			}
		}
		let copy_id = Uuid::new_v4().to_string();
		arrows.insert(id.clone(), copy_id.clone());
		edit.added_edges.push((copy_id, copy));
	}
	let touched = ids
		.last()
		.map(|id| touched_at(Some(nodes[id].as_str()), shift(Rect::of(&board.nodes[id]), offset)));
	Ok(Duplicated { edit, nodes, arrows, touched })
}

fn bounds_of(board: &Board, ids: &[String]) -> Option<Rect> {
	ids.iter().map(|id| Rect::of(&board.nodes[id])).reduce(Rect::joined)
}

fn shift(rect: Rect, (across, down): (i64, i64)) -> Rect {
	Rect { x: rect.x + across, y: rect.y + down, ..rect }
}

fn shifted(id: &str, node: &JsonObject, offset: (i64, i64)) -> ElementChange {
	let rect = shift(Rect::of(node), offset);
	let mut element = node.clone();
	element.insert("x".to_owned(), Value::from(rect.x));
	element.insert("y".to_owned(), Value::from(rect.y));
	ElementChange { id: id.to_owned(), element, fields: vec!["x".to_owned(), "y".to_owned()] }
}
