use serde_json::json;

use super::*;
use crate::board::fixtures::{a_board, a_section, a_text};

const AGENT: &str = "b1";

fn a_lane_board() -> Board {
	a_board(
		&[
			("lane", a_section(0, 0, 400, 300)),
			("in", a_text(40, 40, 100, 50, "a1")),
			("deep", a_text(60, 60, 10, 10, "a2")),
			("out", a_text(900, 0, 100, 50, "a3")),
			("far", a_text(1200, 0, 100, 50, "a4")),
		],
		&[
			("in-out", json!({ "fromNode": "in", "toNode": "out" })),
			("out-far", json!({ "fromNode": "out", "toNode": "far" })),
			("in-deep", json!({ "fromNode": "in", "toNode": "deep" })),
		],
	)
}

fn ids(values: &[&str]) -> Vec<String> {
	values.iter().map(|id| (*id).to_owned()).collect()
}

fn rect(element: &JsonObject) -> (i64, i64, i64, i64) {
	let Rect { x, y, width, height } = Rect::of(element);
	(x, y, width, height)
}

#[test]
fn a_write_into_a_section_lands_inside_it_and_a_replace_clears_its_children_and_their_arrows() {
	let board = a_lane_board();
	let nodes: Vec<DrawnNode> =
		vec![serde_json::from_value(json!({ "key": "new", "kind": "text" })).expect("a node")];
	let write = |mode| Group { parent: Some("lane"), mode, nodes: &nodes, arrows: &[] };

	let inserted = written(&board, AGENT, &write(WriteMode::Insert)).expect("inserted");
	let replaced = written(&board, AGENT, &write(WriteMode::Replace)).expect("replaced");

	assert!(inserted.edit.removed_nodes.is_empty() && inserted.edit.removed_edges.is_empty());
	assert_eq!(rect(&inserted.edit.added_nodes[0].1), (220, 40, 240, 80));
	assert_eq!(rect(&inserted.edit.changed_nodes[0].element), (0, 0, 500, 300));
	assert_eq!(replaced.edit.removed_nodes, ["in", "deep"]);
	assert_eq!(replaced.edit.removed_edges, ["in-deep", "in-out"]);
	assert_eq!(rect(&replaced.edit.added_nodes[0].1), (40, 40, 240, 80));
	assert_eq!(rect(&replaced.edit.changed_nodes[0].element), (0, 0, 400, 300));
}

#[test]
fn a_replace_without_a_parent_is_refused_for_its_missing_parent() {
	let board = a_lane_board();
	let group = Group { parent: None, mode: WriteMode::Replace, nodes: &[], arrows: &[] };

	let refused = written(&board, AGENT, &group).expect_err("refused");

	assert_eq!(
		serde_json::to_value(&refused).expect("serializes"),
		json!({ "element": "parent", "reason": "missingParent" })
	);
}

#[test]
fn a_replace_into_a_section_keeps_the_section_its_own_arrows_and_its_outer_section() {
	let board = a_board(
		&[
			("outer", a_section(0, 0, 1000, 1000)),
			(
				"lane",
				json!({ "kind": "section", "x": 100, "y": 100, "width": 400, "height": 300, "z": "a1" }),
			),
			("in", a_text(140, 140, 100, 50, "a2")),
			("beside", a_text(600, 100, 100, 50, "a3")),
		],
		&[
			("lane-beside", json!({ "fromNode": "lane", "toNode": "beside" })),
			("in-beside", json!({ "fromNode": "in", "toNode": "beside" })),
		],
	);
	let group = Group { parent: Some("lane"), mode: WriteMode::Replace, nodes: &[], arrows: &[] };

	let replaced = written(&board, AGENT, &group).expect("replaced");

	assert_eq!(replaced.edit.removed_nodes, ["in"]);
	assert_eq!(replaced.edit.removed_edges, ["in-beside"]);
}

#[test]
fn a_move_shifts_a_section_with_its_descendants_and_grows_the_target_section() {
	let board = a_board(
		&[
			("lane", a_section(0, 0, 400, 300)),
			("in", a_text(40, 40, 100, 50, "a1")),
			(
				"dock",
				json!({ "kind": "section", "x": 1000, "y": 0, "width": 200, "height": 200, "z": "a2" }),
			),
		],
		&[],
	);

	let moved = moved(&board, &ids(&["lane"]), Some("dock"), (1050, 50)).expect("moved");

	let changed: Vec<_> = moved
		.edit
		.changed_nodes
		.iter()
		.map(|change| (change.id.as_str(), rect(&change.element)))
		.collect();
	assert_eq!(
		changed,
		[
			("lane", (1050, 50, 400, 300)),
			("in", (1090, 90, 100, 50)),
			("dock", (1000, 0, 490, 390)),
		]
	);
	assert_eq!(moved.nodes, ["lane", "in"]);
	assert_eq!(moved.edit.changed_nodes[0].fields, ["x", "y"]);
	assert!(moved.edit.removed_edges.is_empty() && moved.edit.changed_edges.is_empty());
}

#[test]
fn a_section_moved_into_itself_or_a_node_it_does_not_hold_is_refused() {
	let board = a_lane_board();

	let into_itself = moved(&board, &ids(&["lane"]), Some("lane"), (0, 0)).expect_err("refused");
	let unknown = moved(&board, &ids(&["in", "ghost"]), None, (0, 0)).expect_err("refused");

	assert_eq!(into_itself.fault, DrawFault::NestedInItself { reference: "lane".to_owned() });
	assert_eq!((unknown.element, unknown.index), (BoardItem::Node, Some(1)));
}

#[test]
fn a_duplicate_copies_descendants_and_inner_arrows_right_of_the_originals_clear_of_the_board() {
	let board = a_lane_board();

	let copies = duplicated(&board, &ids(&["lane", "out"]), None).expect("copied");

	assert_eq!(copies.nodes.keys().collect::<Vec<_>>(), ["deep", "in", "lane", "out"]);
	assert_eq!(copies.arrows.keys().collect::<Vec<_>>(), ["in-deep", "in-out"]);
	let added: BTreeMap<&str, &JsonObject> =
		copies.edit.added_nodes.iter().map(|(id, node)| (id.as_str(), node)).collect();
	let copy_of = |id: &str| added[copies.nodes[id].as_str()];
	assert_eq!(rect(copy_of("lane")), (1380, 0, 400, 300));
	assert_eq!(rect(copy_of("out")), (2280, 0, 100, 50));
	let in_out = copies.edit.added_edges.iter().find(|(id, _)| *id == copies.arrows["in-out"]);
	let (_, in_out) = in_out.expect("the arrow is copied");
	assert_eq!(in_out["fromNode"], json!(copies.nodes["in"]));
	assert_eq!(in_out["toNode"], json!(copies.nodes["out"]));
	let zs: Vec<&str> =
		copies.edit.added_nodes.iter().filter_map(|(_, node)| node["z"].as_str()).collect();
	assert!(zs.iter().all(|z| *z > "a4") && zs.windows(2).all(|pair| pair[0] < pair[1]), "{zs:?}");
}

#[test]
fn a_duplicate_given_a_position_lands_its_bounds_there() {
	let copies = duplicated(&a_lane_board(), &ids(&["out"]), Some((-500, 700))).expect("copied");

	assert_eq!(rect(&copies.edit.added_nodes[0].1), (-500, 700, 100, 50));
}
