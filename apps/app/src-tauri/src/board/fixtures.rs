use serde_json::{json, Value};

use super::{parsed_board, Board, JsonObject};

pub(super) fn a_board(nodes: &[(&str, Value)], edges: &[(&str, Value)]) -> Board {
	let owned = |entries: &[(&str, Value)]| {
		entries.iter().map(|(id, value)| ((*id).to_owned(), value.clone())).collect()
	};
	parsed_board(owned(nodes), owned(edges), JsonObject::new(), JsonObject::new())
		.expect("the test board is valid")
}

pub(super) fn a_text(x: i64, y: i64, width: i64, height: i64, z: &str) -> Value {
	json!({ "kind": "text", "text": "", "x": x, "y": y, "width": width, "height": height, "z": z })
}

pub(super) fn a_section(x: i64, y: i64, width: i64, height: i64) -> Value {
	json!({ "kind": "section", "label": "Lane", "x": x, "y": y, "width": width, "height": height, "z": "a0" })
}
