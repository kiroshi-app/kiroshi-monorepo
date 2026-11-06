use serde_json::{json, Value};

use super::*;
use crate::board::fixtures::{a_board, a_section, a_text};

const AGENT: &str = "b1";

fn node(value: Value) -> DrawnNode {
	serde_json::from_value(value).expect("a drawn node")
}

fn edge(value: Value) -> DrawnArrow {
	serde_json::from_value(value).expect("a drawn arrow")
}

fn an_empty_board() -> Board {
	a_board(&[], &[])
}

fn one_node_board() -> Board {
	a_board(&[("anchor", a_text(0, 0, 200, 100, "a0"))], &[])
}

fn drawn_ok(board: &Board, nodes: Vec<Value>, edges: Vec<Value>) -> Drawn {
	let nodes: Vec<DrawnNode> = nodes.into_iter().map(node).collect();
	let edges: Vec<DrawnArrow> = edges.into_iter().map(edge).collect();
	drawn(board, AGENT, &nodes, &edges).expect("the batch is drawn")
}

fn refusal(board: &Board, nodes: Vec<Value>, edges: Vec<Value>) -> DrawRefusal {
	let nodes: Vec<DrawnNode> = nodes.into_iter().map(node).collect();
	let edges: Vec<DrawnArrow> = edges.into_iter().map(edge).collect();
	drawn(board, AGENT, &nodes, &edges).expect_err("the batch is refused")
}

fn added<'a>(drawn: &'a Drawn, key: &str) -> &'a JsonObject {
	let id = &drawn.ids[key];
	drawn
		.edit
		.added_nodes
		.iter()
		.find(|(held, _)| held == id)
		.map(|(_, node)| node)
		.unwrap_or_else(|| panic!("{key} was added"))
}

fn rect_of(node: &JsonObject) -> (i64, i64, i64, i64) {
	let at = |field: &str| node[field].as_i64().expect("an integer");
	(at("x"), at("y"), at("width"), at("height"))
}

#[test]
fn a_node_placed_beside_another_lands_on_that_side_at_the_gap_centred_on_it() {
	let board = one_node_board();
	let beside = |side: &str| {
		let placed = json!({
			"key": "n", "kind": "text", "width": 100, "height": 40,
			"place": { "side": side, "of": "anchor" }
		});
		rect_of(added(&drawn_ok(&board, vec![placed], vec![]), "n"))
	};

	assert_eq!(beside("right"), (280, 30, 100, 40));
	assert_eq!(beside("left"), (-180, 30, 100, 40));
	assert_eq!(beside("below"), (50, 180, 100, 40));
	assert_eq!(beside("above"), (50, -120, 100, 40));
}

#[test]
fn a_node_placed_beside_a_node_of_the_same_batch_follows_it() {
	let drawn = drawn_ok(
		&an_empty_board(),
		vec![
			json!({ "key": "a", "kind": "text", "x": 0, "y": 0, "width": 100, "height": 100 }),
			json!({ "key": "b", "kind": "text", "width": 100, "height": 50, "place": { "side": "below", "of": "a" } }),
		],
		vec![],
	);

	assert_eq!(rect_of(added(&drawn, "b")), (0, 180, 100, 50));
}

#[test]
fn a_node_placed_beside_another_moves_past_a_node_already_there() {
	let board = a_board(
		&[("anchor", a_text(0, 0, 200, 100, "a0")), ("taken", a_text(260, 0, 100, 100, "a1"))],
		&[],
	);

	let drawn = drawn_ok(
		&board,
		vec![
			json!({ "key": "n", "kind": "text", "width": 100, "height": 40, "place": { "side": "right", "of": "anchor" } }),
		],
		vec![],
	);

	assert_eq!(rect_of(added(&drawn, "n")), (440, 30, 100, 40));
}

#[test]
fn a_node_named_in_a_section_lands_inside_it_and_the_section_grows_to_hold_it() {
	let board = a_board(&[("lane", a_section(0, 0, 300, 200))], &[]);

	let drawn = drawn_ok(
		&board,
		vec![
			json!({ "key": "a", "kind": "sticky", "text": "One", "section": "lane" }),
			json!({ "key": "b", "kind": "sticky", "text": "Two", "section": "lane" }),
		],
		vec![],
	);

	assert_eq!(rect_of(added(&drawn, "a")), (40, 40, 200, 200));
	assert_eq!(rect_of(added(&drawn, "b")), (320, 40, 200, 200));
	let grown = &drawn.edit.changed_nodes;
	assert_eq!(grown.len(), 1);
	assert_eq!(grown[0].id, "lane");
	assert_eq!(rect_of(&grown[0].element), (0, 0, 560, 280));
	assert_eq!(grown[0].fields, ["x", "y", "width", "height"]);
}

#[test]
fn a_section_of_the_same_batch_grows_to_hold_its_nodes() {
	let drawn = drawn_ok(
		&an_empty_board(),
		vec![
			json!({ "key": "lane", "kind": "section", "text": "Lane", "x": 0, "y": 0, "width": 100, "height": 100 }),
			json!({ "key": "a", "kind": "text", "text": "One", "section": "lane" }),
		],
		vec![],
	);

	assert_eq!(rect_of(added(&drawn, "a")), (40, 40, 240, 80));
	assert_eq!(rect_of(added(&drawn, "lane")), (0, 0, 320, 160));
	assert_eq!(added(&drawn, "lane")["label"], "Lane");
}

#[test]
fn a_node_without_a_place_lands_right_of_the_previous_one_and_the_first_right_of_the_board() {
	let drawn = drawn_ok(
		&one_node_board(),
		vec![
			json!({ "key": "a", "kind": "shape", "text": "A" }),
			json!({ "key": "b", "kind": "shape", "text": "B" }),
		],
		vec![],
	);

	assert_eq!(rect_of(added(&drawn, "a")), (280, 0, 200, 120));
	assert_eq!(rect_of(added(&drawn, "b")), (560, 0, 200, 120));
}

#[test]
fn a_node_without_a_size_takes_the_default_of_its_kind_from_the_board_schema() {
	let drawn = drawn_ok(
		&an_empty_board(),
		["sticky", "text", "shape", "section"]
			.iter()
			.map(|kind| json!({ "key": kind, "kind": kind }))
			.collect(),
		vec![],
	);

	for (kind, size) in [
		("sticky", (200, 200)),
		("text", (240, 80)),
		("shape", (200, 120)),
		("section", (640, 400)),
	] {
		let (_, _, width, height) = rect_of(added(&drawn, kind));
		assert_eq!((width, height), size, "{kind}");
	}
}

#[test]
fn a_batch_arrow_joins_two_local_keys_and_an_arrow_may_name_a_node_of_the_board() {
	let drawn = drawn_ok(
		&one_node_board(),
		vec![json!({ "key": "a", "kind": "text" }), json!({ "key": "b", "kind": "text" })],
		vec![
			json!({ "key": "then", "fromNode": "a", "toNode": "b", "label": "then" }),
			json!({ "fromNode": "anchor", "toNode": "a", "routing": "straight" }),
		],
	);

	let edges = &drawn.edit.added_edges;
	assert_eq!(edges.len(), 2);
	assert_eq!(drawn.ids["then"], edges[0].0);
	assert_eq!(edges[0].1["fromNode"], Value::from(drawn.ids["a"].as_str()));
	assert_eq!(edges[0].1["toNode"], Value::from(drawn.ids["b"].as_str()));
	assert_eq!(edges[0].1["label"], "then");
	assert_eq!(edges[0].1["toEnd"], "arrow");
	assert_eq!(edges[1].1["fromNode"], "anchor");
	assert_eq!(edges[1].1["routing"], "straight");
	assert!(!edges[1].1.contains_key("fromSide") && !edges[1].1.contains_key("toSide"));
}

#[test]
fn an_arrow_drawn_without_routing_is_an_elbow_tied_on_the_sides_that_face_each_other() {
	let board = a_board(
		&[
			("centre", a_text(0, 0, 100, 100, "a0")),
			("east", a_text(400, 50, 100, 100, "a1")),
			("north", a_text(20, -500, 100, 100, "a2")),
		],
		&[],
	);
	let sides = |from: &str, to: &str| {
		let drawn = drawn_ok(&board, vec![], vec![json!({ "fromNode": from, "toNode": to })]);
		let edge = drawn.edit.added_edges[0].1.clone();
		assert_eq!(edge["routing"], "elbow");
		assert_eq!((&edge["fromNode"], &edge["toNode"]), (&json!(from), &json!(to)));
		(edge["fromSide"].clone(), edge["toSide"].clone())
	};

	assert_eq!(sides("centre", "east"), (json!("right"), json!("left")));
	assert_eq!(sides("east", "centre"), (json!("left"), json!("right")));
	assert_eq!(sides("centre", "north"), (json!("top"), json!("bottom")));
	assert_eq!(sides("north", "centre"), (json!("bottom"), json!("top")));
	let anchored = drawn_ok(
		&board,
		vec![],
		vec![json!({ "fromNode": "centre", "fromAnchor": { "x": 0, "y": 0 }, "toNode": "east" })],
	);
	let edge = &anchored.edit.added_edges[0].1;
	assert_eq!((edge.get("fromSide"), &edge["toSide"]), (None, &json!("left")));
}

#[test]
fn a_sticky_is_signed_by_the_agent_and_every_node_lands_above_the_board() {
	let drawn = drawn_ok(
		&one_node_board(),
		vec![
			json!({ "key": "a", "kind": "sticky", "fill": "blue" }),
			json!({ "key": "b", "kind": "text" }),
		],
		vec![],
	);

	let sticky = added(&drawn, "a");
	assert_eq!(sticky["author"], json!({ "kind": "agent", "id": AGENT }));
	assert_eq!(sticky["fill"], "blue");
	let (a, b) = (sticky["z"].as_str().expect("z"), added(&drawn, "b")["z"].as_str().expect("z"));
	assert!("a0" < a && a < b, "{a} {b}");
}

#[test]
fn the_agent_is_touched_at_the_centre_of_the_last_node_of_the_batch() {
	let drawn = drawn_ok(
		&an_empty_board(),
		vec![
			json!({ "key": "a", "kind": "text", "x": 0, "y": 0, "width": 100, "height": 100 }),
			json!({ "key": "b", "kind": "text", "x": 400, "y": 0, "width": 100, "height": 60 }),
		],
		vec![],
	);

	assert_eq!(
		drawn.touched,
		Some(Touched { node_id: Some(drawn.ids["b"].clone()), x: 450, y: 30 })
	);
}

#[test]
fn the_first_invalid_item_is_refused_with_its_index_and_its_reason() {
	let board = one_node_board();
	let fine = json!({ "key": "ok", "kind": "text" });
	let cases = [
		(
			vec![fine.clone(), json!({ "key": "x", "kind": "circle" })],
			vec![],
			BoardItem::Node,
			1,
			json!({ "reason": "unknownKind" }),
		),
		(
			vec![fine.clone(), json!({ "key": "ok", "kind": "text" })],
			vec![],
			BoardItem::Node,
			1,
			json!({ "reason": "duplicateKey" }),
		),
		(
			vec![
				json!({ "key": "x", "kind": "text", "place": { "side": "right", "of": "ghost" } }),
			],
			vec![],
			BoardItem::Node,
			0,
			json!({ "reason": "unknownReference", "reference": "ghost" }),
		),
		(
			vec![
				json!({ "key": "x", "kind": "text", "place": { "side": "inside", "of": "anchor" } }),
			],
			vec![],
			BoardItem::Node,
			0,
			json!({ "reason": "unknownSide", "side": "inside" }),
		),
		(
			vec![json!({ "key": "x", "kind": "text", "section": "anchor" })],
			vec![],
			BoardItem::Node,
			0,
			json!({ "reason": "notASection", "reference": "anchor" }),
		),
		(
			vec![fine.clone(), json!({ "key": "x", "kind": "sticky", "fill": "purple" })],
			vec![],
			BoardItem::Node,
			1,
			json!({ "reason": "refusedField", "field": "fill" }),
		),
		(
			vec![json!({ "key": "x", "kind": "text", "shape": "ellipse" })],
			vec![],
			BoardItem::Node,
			0,
			json!({ "reason": "refusedField", "field": "shape" }),
		),
		(
			vec![json!({ "key": "x", "kind": "text", "x": 10 })],
			vec![],
			BoardItem::Node,
			0,
			json!({ "reason": "partialCoordinates" }),
		),
		(
			vec![
				fine.clone(),
				json!({ "key": "a", "kind": "text", "place": { "side": "right", "of": "b" } }),
				json!({ "key": "b", "kind": "text", "place": { "side": "below", "of": "a" } }),
			],
			vec![],
			BoardItem::Node,
			1,
			json!({ "reason": "placementCycle" }),
		),
		(
			vec![fine.clone()],
			vec![
				json!({ "fromNode": "ok", "toNode": "anchor" }),
				json!({ "fromNode": "ok", "toNode": "ghost" }),
			],
			BoardItem::Arrow,
			1,
			json!({ "reason": "unknownReference", "reference": "ghost" }),
		),
		(
			vec![fine.clone()],
			vec![json!({ "fromNode": "ok", "toNode": "anchor", "html": "<b>" })],
			BoardItem::Arrow,
			0,
			json!({ "reason": "refusedField", "field": "html" }),
		),
		(
			vec![fine.clone()],
			vec![json!({ "key": "ok", "fromNode": "ok", "toNode": "anchor" })],
			BoardItem::Arrow,
			0,
			json!({ "reason": "duplicateKey" }),
		),
	];

	for (nodes, edges, element, index, reason) in cases {
		let refused = refusal(&board, nodes, edges);
		let mut expected = json!({ "element": element, "index": index });
		expected
			.as_object_mut()
			.expect("an object")
			.extend(reason.as_object().expect("an object").clone());
		assert_eq!(serde_json::to_value(&refused).expect("serializes"), expected);
	}
}

#[test]
fn an_update_changes_only_the_fields_given_and_refuses_an_unknown_id() {
	let board =
		a_board(&[("n", a_text(0, 0, 200, 100, "a0")), ("lane", a_section(0, 0, 400, 400))], &[]);

	let updated = updated(
		&board,
		&[
			change(json!({ "id": "n", "text": "Ship", "x": 40 })),
			change(json!({ "id": "lane", "text": "Done" })),
		],
		&[],
	)
	.expect("the update applies");

	let first = &updated.edit.changed_nodes[0];
	assert_eq!(first.fields, ["text", "x"]);
	assert_eq!(
		(first.element["text"].clone(), first.element["x"].clone(), first.element["y"].clone()),
		(json!("Ship"), json!(40), json!(0))
	);
	assert_eq!(updated.edit.changed_nodes[1].fields, ["label"]);
	let refused = super::updated(
		&board,
		&[change(json!({ "id": "n", "text": "A" })), change(json!({ "id": "gone" }))],
		&[],
	)
	.expect_err("an unknown id is refused");
	assert_eq!(
		refused,
		DrawRefusal {
			element: BoardItem::Node,
			index: Some(1),
			fault: DrawFault::UnknownReference { reference: "gone".to_owned() }
		}
	);
	let refused = super::updated(&board, &[change(json!({ "id": "n", "fill": "blue" }))], &[])
		.expect_err("a fill on a text is refused");
	assert_eq!(refused.fault, DrawFault::RefusedField { field: "fill".to_owned() });
}

fn change(value: Value) -> ChangedNode {
	serde_json::from_value(value).expect("a change")
}

fn patch(value: Value) -> ArrowPatch {
	serde_json::from_value(value).expect("an arrow patch")
}

fn three_in_a_row() -> Board {
	a_board(
		&[
			("a", a_text(0, 0, 10, 10, "a0")),
			("b", a_text(40, 0, 10, 10, "a1")),
			("c", a_text(80, 0, 10, 10, "a2")),
		],
		&[
			("ab", json!({ "fromNode": "a", "toNode": "b", "fromSide": "right", "label": "go" })),
			("bc", json!({ "fromNode": "b", "toNode": "c" })),
			("ca", json!({ "fromNode": "c", "toNode": "a" })),
		],
	)
}

#[test]
fn an_arrow_patch_keeps_every_field_it_does_not_name_and_frees_the_tie_it_replaces() {
	let board = three_in_a_row();

	let refused = |patches: Vec<Value>| {
		let patches: Vec<ArrowPatch> = patches.into_iter().map(patch).collect();
		updated(&board, &[], &patches).expect_err("the call is refused")
	};

	let both_ties =
		refused(vec![json!({ "id": "ca", "toAnchor": { "x": 0, "y": 1 }, "toSide": "top" })]);
	let unknown = refused(vec![json!({ "id": "ab", "label": "x" }), json!({ "id": "zz" })]);
	let to_ghost = refused(vec![json!({ "id": "ab", "toNode": "ghost" })]);
	let html = refused(vec![json!({ "id": "ab", "html": "<b>" })]);

	assert_eq!(both_ties.fault, DrawFault::RefusedField { field: "toAnchor".to_owned() });
	assert_eq!((unknown.element, unknown.index), (BoardItem::Arrow, Some(1)));
	assert_eq!(unknown.fault, DrawFault::UnknownReference { reference: "zz".to_owned() });
	assert_eq!(to_ghost.fault, DrawFault::UnknownReference { reference: "ghost".to_owned() });
	assert_eq!(html.fault, DrawFault::RefusedField { field: "html".to_owned() });
	let applied = updated(
		&board,
		&[],
		&[
			patch(json!({ "id": "ab", "toNode": "c", "routing": "elbow", "bend": 12 })),
			patch(json!({ "id": "bc", "fromPoint": { "x": 5, "y": 5 } })),
			patch(json!({ "id": "ca", "toSide": "top" })),
		],
	)
	.expect("the patches apply");
	let [ab, bc, ca] = &applied.edit.changed_edges[..] else {
		panic!("three arrows change");
	};
	assert_eq!(ab.fields, ["bend", "routing", "toNode"]);
	assert_eq!(
		(&ab.element["label"], &ab.element["fromSide"], &ab.element["toNode"]),
		(&json!("go"), &json!("right"), &json!("c"))
	);
	assert_eq!(bc.fields, ["fromNode", "fromPoint"]);
	assert_eq!(bc.element.get("fromNode"), None);
	assert_eq!(ca.fields, ["toSide"]);
	assert!(applied.edit.changed_nodes.is_empty());
}

#[test]
fn a_deletion_takes_the_descendants_of_a_section_and_every_arrow_tied_to_what_it_removes() {
	let board = a_board(
		&[
			("lane", a_section(0, 0, 400, 400)),
			(
				"inner",
				json!({ "kind": "section", "x": 10, "y": 10, "width": 200, "height": 200, "z": "a1" }),
			),
			("deep", a_text(20, 20, 10, 10, "a2")),
			("out", a_text(900, 0, 10, 10, "a3")),
			("other", a_text(1200, 0, 10, 10, "a4")),
		],
		&[
			("tied", json!({ "fromNode": "out", "toNode": "deep" })),
			("loose", json!({ "fromNode": "out", "toNode": "other" })),
			("kept", json!({ "fromPoint": { "x": 0, "y": 0 }, "toNode": "other" })),
		],
	);

	let gone = deleted(&board, &["inner".to_owned()], &["loose".to_owned()]).expect("deleted");
	let unknown = deleted(&board, &["lane".to_owned()], &["kept".to_owned(), "nope".to_owned()]);

	assert_eq!(gone.edit.removed_nodes, ["inner", "deep"]);
	assert_eq!(gone.edit.removed_edges, ["loose", "tied"]);
	assert_eq!(gone.touched, Some(Touched { node_id: None, x: 110, y: 110 }));
	let unknown = unknown.expect_err("an unknown arrow refuses the whole call");
	assert_eq!((unknown.element, unknown.index), (BoardItem::Arrow, Some(1)));
	assert_eq!(unknown.fault, DrawFault::UnknownReference { reference: "nope".to_owned() });
}

const PERSON: &str = "p1";

fn placed(fields: Value) -> Value {
	let mut node = json!({ "x": 0, "y": 0, "width": 116, "height": 124, "z": "a0" });
	node.as_object_mut().expect("an object").extend(fields.as_object().expect("an object").clone());
	node
}

fn a_person_image() -> Value {
	placed(json!({ "kind": "image", "file": "Library/cat.png", "item": "cat.png" }))
}

#[test]
fn an_image_a_person_dropped_names_its_file_then_moves_resizes_and_leaves_with_its_edges() {
	let card =
		placed(json!({ "kind": "libraryCard", "file": "Library/plan.md", "item": "plan.md" }));
	let sticky = placed(json!({
		"kind": "sticky", "text": "Note", "author": { "kind": "person", "id": PERSON }
	}));
	let plain = placed(json!({ "kind": "image", "file": "attachments/photo.JPG" }));
	let board = a_board(
		&[("photo", a_person_image()), ("card", card), ("note", sticky), ("plain", plain)],
		&[
			("to-card", json!({ "fromNode": "photo", "toNode": "card" })),
			("to-note", json!({ "fromNode": "note", "toNode": "photo" })),
		],
	);

	let updated = updated(
		&board,
		&[
			change(json!({ "id": "photo", "x": 300, "y": 40, "width": 232, "height": 248 })),
			change(json!({ "id": "card", "x": -80, "height": 90 })),
		],
		&[],
	)
	.expect("the geometry of a person's nodes applies");
	let looked = super::updated(&board, &[change(json!({ "id": "photo", "text": "A cat" }))], &[])
		.expect_err("an image carries no text");
	let gone = deleted(&board, &["photo".to_owned(), "card".to_owned(), "note".to_owned()], &[])
		.expect("a person's nodes are removed");

	let file = |id: &str| crate::board::node_file(&board, id).and_then(|node| node.file);
	assert_eq!(file("photo").as_deref(), Some("cat.png"));
	assert_eq!(file("plain").as_deref(), Some("photo.JPG"));
	let [moved, card] = &updated.edit.changed_nodes[..] else {
		panic!("two nodes change");
	};
	assert_eq!(moved.fields, ["height", "width", "x", "y"]);
	assert_eq!(rect_of(&moved.element), (300, 40, 232, 248));
	assert_eq!(moved.element["item"], "cat.png");
	assert_eq!(rect_of(&card.element), (-80, 0, 116, 90));
	assert_eq!(looked.fault, DrawFault::RefusedField { field: "text".to_owned() });
	assert_eq!(gone.edit.removed_nodes, ["photo", "card", "note"]);
	assert_eq!(gone.edit.removed_edges, ["to-card", "to-note"]);
}
