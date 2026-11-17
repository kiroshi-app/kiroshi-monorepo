use std::path::Path;

use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Runtime};

use super::contract::{
	LibraryBoardBounds, LibraryBoardNode, LibraryBoardSummary, LibraryError, LibraryItem,
};
use super::{
	accepted_type, created, document_text, is_plain_name, rename_linked_document, resolve,
	AcceptedType, ResolvedItem,
};
use crate::board::import_canvas;
use crate::db::Database;

const EXTENSION: &str = "canvas";

const BLANK: &str = r#"{"nodes":[],"edges":[]}"#;

const SNAPSHOT_NODES: usize = 200;

#[derive(Deserialize)]
struct StoredBoard {
	nodes: Vec<StoredNode>,
}

#[derive(Deserialize)]
struct StoredNode {
	id: String,
	#[serde(rename = "type")]
	node_type: String,
	x: f64,
	y: f64,
	width: f64,
	height: f64,
	#[serde(flatten)]
	fields: Map<String, Value>,
}

impl StoredNode {
	fn searched_field(&self) -> Option<&str> {
		let field = match self.node_type.as_str() {
			"text" => "text",
			"group" | "file" | "link" => "label",
			_ => return None,
		};
		self.fields.get(field).and_then(Value::as_str)
	}

	fn snapshot(self) -> LibraryBoardNode {
		let colour = self.fields.get("color").and_then(Value::as_str).map(str::to_owned);
		LibraryBoardNode {
			id: self.id,
			node_type: self.node_type,
			x: self.x as i64,
			y: self.y as i64,
			width: self.width as i64,
			height: self.height as i64,
			colour,
		}
	}
}

struct Extent {
	left: f64,
	top: f64,
	right: f64,
	bottom: f64,
}

impl Extent {
	fn of(node: &StoredNode) -> Self {
		Self { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }
	}

	fn joined(self, other: Self) -> Self {
		Self {
			left: self.left.min(other.left),
			top: self.top.min(other.top),
			right: self.right.max(other.right),
			bottom: self.bottom.max(other.bottom),
		}
	}

	fn bounds(self) -> LibraryBoardBounds {
		LibraryBoardBounds {
			x: self.left as i64,
			y: self.top as i64,
			width: (self.right - self.left) as i64,
			height: (self.bottom - self.top) as i64,
		}
	}
}

pub(crate) fn create_board(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryItem, LibraryError> {
	let file_name = format!("{name}.{EXTENSION}");
	let is_a_board = matches!(accepted_type(&file_name), Some(AcceptedType::Board));
	if !is_a_board || !is_plain_name(&file_name) {
		return Err(LibraryError::InvalidName { name: file_name });
	}
	created(root, space_id, &file_name, BLANK.as_bytes())
}

pub(crate) async fn rename_board<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	space_id: &str,
	name: &str,
	new_name: &str,
) -> Result<LibraryItem, LibraryError> {
	a_board(root, space_id, name)?;
	rename_linked_document(app, database, root, space_id, name, new_name).await
}

pub(crate) fn summarise_board(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryBoardSummary, LibraryError> {
	let board = stored_board(&a_board(root, space_id, name)?, name)?;
	let bounds = board.nodes.iter().map(Extent::of).reduce(Extent::joined).map(Extent::bounds);
	Ok(LibraryBoardSummary {
		name: name.to_owned(),
		node_count: board.nodes.len() as u64,
		nodes: board.nodes.into_iter().take(SNAPSHOT_NODES).map(StoredNode::snapshot).collect(),
		bounds,
	})
}

pub(super) fn board_holds(
	item: &ResolvedItem,
	name: &str,
	query: &str,
) -> Result<bool, LibraryError> {
	let board = stored_board(item, name)?;
	let holds = |text: &str| text.to_lowercase().contains(query);
	Ok(holds(name) || board.nodes.iter().filter_map(StoredNode::searched_field).any(holds))
}

pub(super) fn a_board(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<ResolvedItem, LibraryError> {
	let item = resolve(root, space_id, name)?;
	match item.accepted {
		AcceptedType::Board => Ok(item),
		_ => Err(LibraryError::NotABoard { name: name.to_owned() }),
	}
}

fn stored_board(item: &ResolvedItem, name: &str) -> Result<StoredBoard, LibraryError> {
	let text = document_text(item, name)?;
	let invalid = |detail: String| LibraryError::InvalidBoard { name: name.to_owned(), detail };
	import_canvas(&text).map_err(|refusal| invalid(format!("{refusal:?}")))?;
	serde_json::from_str(&text).map_err(|error| invalid(error.to_string()))
}
