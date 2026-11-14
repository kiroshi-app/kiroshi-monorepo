use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::draw::{
	end_rect, kind_of, known, shown_text, text_of, tied_ends, z_of, BoardItem, DrawRefusal, Rect,
	SECTION,
};
use super::hierarchy::{parent_section, Hierarchy};
use super::schema::{Fields, SCHEMA};
use super::{kind_key, Board, End, JsonObject, ENDS};

#[cfg(test)]
mod tests;

const EXCERPT_LENGTH: usize = 60;

const ELLIPSIS: char = '…';

const LIBRARY_ITEM: &str = "item";

const CANVAS_FILE: &str = "file";

const FRAME_MARGIN: i64 = 24;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInfo {
	pub kinds: BTreeMap<String, usize>,
	pub arrows: usize,
	bounds: Option<Rect>,
	pub sections: Vec<SectionInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionInfo {
	pub id: String,
	pub label: Option<String>,
	#[serde(flatten)]
	rect: Rect,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
	pub id: String,
	pub kind: String,
	pub text: Option<String>,
	#[serde(flatten)]
	rect: Rect,
	pub z: Option<String>,
	pub parent: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub unlisted_children: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeArrow {
	pub id: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub from_node: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub from_point: Option<Value>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub to_node: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub to_point: Option<Value>,
	pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardTree {
	pub nodes: Vec<TreeNode>,
	pub arrows: Vec<TreeArrow>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardDetail {
	pub nodes: Vec<JsonObject>,
	pub arrows: Vec<JsonObject>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sought {
	pub text: Option<String>,
	pub kind: Option<String>,
	pub color: Option<String>,
	pub fill: Option<String>,
	pub shape: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Framed {
	pub part: Board,
	pub frame: Option<Frame>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub struct Frame {
	pub x: i64,
	pub y: i64,
	pub width: i64,
	pub height: i64,
}

impl Frame {
	fn of(rect: Rect) -> Self {
		Self { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeFile {
	pub kind: String,
	pub file: Option<String>,
}

pub fn content_hash(board: &Board) -> Result<String, serde_json::Error> {
	let content = serde_json::to_vec(&(&board.nodes, &board.edges))?;
	Ok(format!("{:x}", Sha256::digest(content)))
}

pub fn info(board: &Board) -> BoardInfo {
	let mut kinds = BTreeMap::new();
	for node in board.nodes.values() {
		*kinds.entry(kind_of(node).unwrap_or_default().to_owned()).or_default() += 1;
	}
	let hierarchy = Hierarchy::of(board);
	let sections = hierarchy
		.children(None)
		.iter()
		.filter_map(|id| Some((*id, board.nodes.get(*id)?)))
		.filter(|(_, node)| kind_of(node) == Some(SECTION))
		.map(|(id, node)| SectionInfo {
			id: id.to_owned(),
			label: shown_text(node),
			rect: Rect::of(node),
		})
		.collect();
	BoardInfo {
		kinds,
		arrows: board.edges.len(),
		bounds: board.nodes.values().map(Rect::of).reduce(Rect::joined),
		sections,
	}
}

pub fn tree(
	board: &Board,
	parent: Option<&str>,
	depth: Option<usize>,
) -> Result<BoardTree, DrawRefusal> {
	let parent = parent_section(board, parent)?;
	let hierarchy = Hierarchy::of(board);
	let mut nodes = Vec::new();
	listed(board, &hierarchy, parent, depth, &mut nodes);
	let under: BTreeSet<&str> = hierarchy.under(parent).into_iter().collect();
	let holds = |edge: &JsonObject, end: &End| match edge.get(end.node).and_then(Value::as_str) {
		Some(node) => under.contains(node),
		None => {
			parent.is_none_or(|parent| point_is_inside(edge.get(end.point), &board.nodes[parent]))
		}
	};
	let arrows = board
		.edges
		.iter()
		.filter(|(_, edge)| ENDS.iter().all(|end| holds(edge, end)))
		.map(|(id, edge)| {
			let [from, to] =
				ENDS.each_ref().map(|end| (text_of(edge, end.node), edge.get(end.point).cloned()));
			TreeArrow {
				id: id.clone(),
				from_node: from.0,
				from_point: from.1,
				to_node: to.0,
				to_point: to.1,
				label: text_of(edge, "label"),
			}
		})
		.collect();
	Ok(BoardTree { nodes, arrows })
}

fn listed(
	board: &Board,
	hierarchy: &Hierarchy,
	parent: Option<&str>,
	depth: Option<usize>,
	into: &mut Vec<TreeNode>,
) {
	if depth == Some(0) {
		return;
	}
	let deeper = depth.map(|depth| depth - 1);
	for id in hierarchy.children(parent) {
		let Some(node) = board.nodes.get(*id) else {
			continue;
		};
		let children = hierarchy.children(Some(id)).len();
		into.push(TreeNode {
			id: (*id).to_owned(),
			kind: kind_of(node).unwrap_or_default().to_owned(),
			text: excerpt(node),
			rect: Rect::of(node),
			z: z_of(node),
			parent: parent.map(str::to_owned),
			unlisted_children: (deeper == Some(0)).then_some(children),
		});
		listed(board, hierarchy, Some(id), deeper, into);
	}
}

fn point_is_inside(point: Option<&Value>, section: &JsonObject) -> bool {
	let at = |axis: &str| point.and_then(|point| point.get(axis)).and_then(Value::as_f64);
	let (Some(x), Some(y)) = (at("x"), at("y")) else {
		return false;
	};
	let rect = Rect::of(section);
	let (left, top) = (rect.x as f64, rect.y as f64);
	(left..=rect.right() as f64).contains(&x) && (top..=rect.bottom() as f64).contains(&y)
}

fn excerpt(node: &JsonObject) -> Option<String> {
	let shown = shown_text(node)
		.filter(|text| !text.trim().is_empty())
		.or_else(|| library_file_of(node))
		.or_else(|| text_of(node, "title"))
		.or_else(|| text_of(node, "url"))?;
	let words = shown.split_whitespace().collect::<Vec<_>>().join(" ");
	if words.chars().count() <= EXCERPT_LENGTH {
		return Some(words);
	}
	let mut cut: String = words.chars().take(EXCERPT_LENGTH - 1).collect();
	cut.push(ELLIPSIS);
	Some(cut)
}

pub fn node_info(
	board: &Board,
	nodes: &[String],
	arrows: &[String],
) -> Result<BoardDetail, DrawRefusal> {
	known(nodes, BoardItem::Node, |id| board.nodes.contains_key(id))?;
	known(arrows, BoardItem::Arrow, |id| board.edges.contains_key(id))?;
	let detailed = |id: &String, stored: &JsonObject, fields: &[&Fields]| {
		let mut detail = JsonObject::new();
		detail.insert("id".to_owned(), Value::from(id.as_str()));
		for (name, spec) in fields.iter().flat_map(|fields| fields.0.iter()) {
			let value = stored.get(name).cloned().or_else(|| spec.default.clone());
			detail.insert(name.clone(), value.unwrap_or(Value::Null));
		}
		for (name, value) in stored {
			detail.entry(name.clone()).or_insert_with(|| value.clone());
		}
		detail
	};
	let node_detail = |id: &String| {
		let node = &board.nodes[id];
		let kind = kind_of(node).and_then(|kind| SCHEMA.kinds.get(kind));
		let fields: Vec<&Fields> =
			std::iter::once(&SCHEMA.node.fields).chain(kind.map(|spec| &spec.fields)).collect();
		detailed(id, node, &fields)
	};
	Ok(BoardDetail {
		nodes: nodes.iter().map(node_detail).collect(),
		arrows: arrows
			.iter()
			.map(|id| detailed(id, &board.edges[id], &[&SCHEMA.edge.fields]))
			.collect(),
	})
}

pub fn under(board: &Board, parent: Option<&str>) -> Result<Board, DrawRefusal> {
	let Some(parent) = parent_section(board, parent)? else {
		return Ok(board.clone());
	};
	Ok(with_descendants(board, parent))
}

pub fn framed(board: &Board, id: Option<&str>) -> Result<Framed, DrawRefusal> {
	let part = match id {
		Some(id) => {
			known(&[id.to_owned()], BoardItem::Node, |id| board.nodes.contains_key(id))?;
			with_descendants(board, id)
		}
		None => board.clone(),
	};
	let nodes = part.nodes.values().map(Rect::of);
	let ends = part
		.edges
		.values()
		.flat_map(|edge| ENDS.iter().filter_map(|end| end_rect(edge, end, &part.nodes)));
	let bounds = nodes.chain(ends).reduce(Rect::joined);
	let frame = bounds.map(|bounds| Frame::of(bounds.padded(FRAME_MARGIN)));
	Ok(Framed { part, frame })
}

fn with_descendants(board: &Board, id: &str) -> Board {
	let hierarchy = Hierarchy::of(board);
	let held: BTreeSet<&str> = std::iter::once(id).chain(hierarchy.descendants(id)).collect();
	board.kept(
		|id| held.contains(id),
		|edge| {
			let ends: Vec<&str> = tied_ends(edge).collect();
			ends.len() == ENDS.len() && ends.iter().all(|node| held.contains(node))
		},
	)
}

pub fn find(board: &Board, sought: &Sought) -> Vec<String> {
	let lowered = sought.text.as_deref().map(str::to_lowercase);
	let matches = |node: &JsonObject| {
		let is = |field: &str, wanted: &Option<String>| {
			wanted.as_deref().is_none_or(|wanted| text_of(node, field).as_deref() == Some(wanted))
		};
		let shows = lowered.as_deref().is_none_or(|wanted| {
			shown_text(node).is_some_and(|text| text.to_lowercase().contains(wanted))
		});
		shows
			&& is(kind_key(), &sought.kind)
			&& is("color", &sought.color)
			&& is("fill", &sought.fill)
			&& is("shape", &sought.shape)
	};
	let mut found: Vec<(&String, &JsonObject)> =
		board.nodes.iter().filter(|(_, node)| matches(node)).collect();
	found.sort_by_cached_key(|(id, node)| (z_of(node), *id));
	found.into_iter().map(|(id, _)| id.clone()).collect()
}

pub fn holds_node(board: &Board, id: &str) -> bool {
	board.nodes.contains_key(id)
}

pub fn node_position(board: &Board, id: &str) -> Option<(i64, i64)> {
	let rect = Rect::of(board.nodes.get(id)?);
	Some((rect.x, rect.y))
}

pub fn node_file(board: &Board, id: &str) -> Option<NodeFile> {
	let node = board.nodes.get(id)?;
	Some(NodeFile {
		kind: kind_of(node).unwrap_or_default().to_owned(),
		file: library_file_of(node),
	})
}

fn library_file_of(node: &JsonObject) -> Option<String> {
	let in_canvas_folder = || {
		let file = node.get(CANVAS_FILE).and_then(Value::as_str)?;
		file.rsplit('/').next().map(str::to_owned)
	};
	text_of(node, LIBRARY_ITEM).or_else(in_canvas_folder)
}
