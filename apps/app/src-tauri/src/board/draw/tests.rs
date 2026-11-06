use serde_json::{json, Value};

use super::*;
use crate::board::parsed_board;

const AGENT: &str = "b1";

fn a_board(nodes: &[(&str, Value)], edges: &[(&str, Value)]) -> Board {
	let owned = |entries: &[(&str, Value)]| {
		entries.iter().map(|(id, value)| ((*id).to_owned(), value.clone())).collect()
	};
	parsed_board(owned(nodes), owned(edges), JsonObject::new(), JsonObject::new())
		.expect("the test board is valid")
}

fn a_text(x: i64, y: i64, width: i64, height: i64, z: &str) -> Value {
	json!({ "kind": "text", "text": "", "x": x, "y": y, "width": width, "height": height, "z": z })
}

fn a_section(x: i64, y: i64, width: i64, height: i64) -> Value {
	json!({ "kind": "section", "label": "Lane", "x": x, "y": y, "width": width, "height": height, "z": "a0" })
}

fn node(value: Value) -> DrawnNode {
	serde_json::from_value(value).expect("a drawn node")
}

fn edge(value: Value) -> DrawnEdge {
	serde_json::from_value(value).expect("a drawn edge")
}

fn an_empty_board() -> Board {
	a_board(&[], &[])
}

fn one_node_board() -> Board {
	a_board(&[("anchor", a_text(0, 0, 200, 100, "a0"))], &[])
}

fn drawn_ok(board: &Board, nodes: Vec<Value>, edges: Vec<Value>) -> Drawn {
	let nodes: Vec<DrawnNode> = nodes.into_iter().map(node).collect();
	let edges: Vec<DrawnEdge> = edges.into_iter().map(edge).collect();
	drawn(board, AGENT, &nodes, &edges).expect("the batch is drawn")
}

fn refusal(board: &Board, nodes: Vec<Value>, edges: Vec<Value>) -> DrawRefusal {
	let nodes: Vec<DrawnNode> = nodes.into_iter().map(node).collect();
	let edges: Vec<DrawnEdge> = edges.into_iter().map(edge).collect();
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
	assert_eq!(rect_of(&grown[0].node), (0, 0, 560, 280));
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
fn a_batch_edge_joins_two_local_keys_and_an_edge_may_name_a_node_of_the_board() {
	let drawn = drawn_ok(
		&one_node_board(),
		vec![json!({ "key": "a", "kind": "text" }), json!({ "key": "b", "kind": "text" })],
		vec![
			json!({ "from": "a", "to": "b", "label": "then" }),
			json!({ "from": "anchor", "to": "a" }),
		],
	);

	let edges = &drawn.edit.added_edges;
	assert_eq!(edges.len(), 2);
	assert_eq!(edges[0].1["fromNode"], Value::from(drawn.ids["a"].as_str()));
	assert_eq!(edges[0].1["toNode"], Value::from(drawn.ids["b"].as_str()));
	assert_eq!(edges[0].1["label"], "then");
	assert_eq!(edges[0].1["toEnd"], "arrow");
	assert_eq!(edges[1].1["fromNode"], "anchor");
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
			Element::Node,
			1,
			json!({ "reason": "unknownKind" }),
		),
		(
			vec![fine.clone(), json!({ "key": "ok", "kind": "text" })],
			vec![],
			Element::Node,
			1,
			json!({ "reason": "duplicateKey" }),
		),
		(
			vec![
				json!({ "key": "x", "kind": "text", "place": { "side": "right", "of": "ghost" } }),
			],
			vec![],
			Element::Node,
			0,
			json!({ "reason": "unknownReference", "reference": "ghost" }),
		),
		(
			vec![
				json!({ "key": "x", "kind": "text", "place": { "side": "inside", "of": "anchor" } }),
			],
			vec![],
			Element::Node,
			0,
			json!({ "reason": "unknownSide", "side": "inside" }),
		),
		(
			vec![json!({ "key": "x", "kind": "text", "section": "anchor" })],
			vec![],
			Element::Node,
			0,
			json!({ "reason": "notASection", "reference": "anchor" }),
		),
		(
			vec![fine.clone(), json!({ "key": "x", "kind": "sticky", "fill": "purple" })],
			vec![],
			Element::Node,
			1,
			json!({ "reason": "refusedField", "field": "fill" }),
		),
		(
			vec![json!({ "key": "x", "kind": "text", "shape": "ellipse" })],
			vec![],
			Element::Node,
			0,
			json!({ "reason": "refusedField", "field": "shape" }),
		),
		(
			vec![json!({ "key": "x", "kind": "text", "x": 10 })],
			vec![],
			Element::Node,
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
			Element::Node,
			1,
			json!({ "reason": "placementCycle" }),
		),
		(
			vec![fine.clone()],
			vec![json!({ "from": "ok", "to": "anchor" }), json!({ "from": "ok", "to": "ghost" })],
			Element::Edge,
			1,
			json!({ "reason": "unknownReference", "reference": "ghost" }),
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
	let change = |value: Value| -> ChangedNode { serde_json::from_value(value).expect("a change") };

	let updated = changed(
		&board,
		&[
			change(json!({ "id": "n", "text": "Ship", "x": 40 })),
			change(json!({ "id": "lane", "text": "Done" })),
		],
	)
	.expect("the update applies");

	let first = &updated.edit.changed_nodes[0];
	assert_eq!(first.fields, ["text", "x"]);
	assert_eq!(
		(first.node["text"].clone(), first.node["x"].clone(), first.node["y"].clone()),
		(json!("Ship"), json!(40), json!(0))
	);
	assert_eq!(updated.edit.changed_nodes[1].fields, ["label"]);
	let refused = changed(
		&board,
		&[change(json!({ "id": "n", "text": "A" })), change(json!({ "id": "gone" }))],
	)
	.expect_err("an unknown id is refused");
	assert_eq!(
		refused,
		DrawRefusal {
			element: Element::Node,
			index: 1,
			fault: DrawFault::UnknownReference { reference: "gone".to_owned() }
		}
	);
	let refused = changed(&board, &[change(json!({ "id": "n", "fill": "blue" }))])
		.expect_err("a fill on a text is refused");
	assert_eq!(refused.fault, DrawFault::RefusedField { field: "fill".to_owned() });
}

#[test]
fn a_removal_takes_every_edge_attached_to_the_removed_nodes() {
	let board = a_board(
		&[
			("a", a_text(0, 0, 10, 10, "a0")),
			("b", a_text(40, 0, 10, 10, "a1")),
			("c", a_text(80, 0, 10, 10, "a2")),
		],
		&[
			("ab", json!({ "fromNode": "a", "toNode": "b" })),
			("bc", json!({ "fromNode": "b", "toNode": "c" })),
			("ca", json!({ "fromNode": "c", "toNode": "a" })),
		],
	);

	let gone = removed(&board, &["b".to_owned()]).expect("the removal applies");

	assert_eq!(gone.edit.removed_nodes, ["b"]);
	assert_eq!(gone.edit.removed_edges, ["ab", "bc"]);
	assert_eq!(gone.touched, Some(Touched { node_id: None, x: 45, y: 5 }));
	let refused = removed(&board, &["a".to_owned(), "gone".to_owned()]).expect_err("refused");
	assert_eq!(refused.index, 1);
}

#[test]
fn a_read_answers_each_node_with_its_text_and_the_section_that_holds_it() {
	let board = a_board(
		&[
			("lane", a_section(0, 0, 500, 500)),
			(
				"inner",
				json!({ "kind": "section", "label": "Inner", "x": 10, "y": 10, "width": 200, "height": 200, "z": "a1" }),
			),
			(
				"n",
				json!({ "kind": "text", "text": "Hello", "x": 20, "y": 20, "width": 50, "height": 50, "z": "a2" }),
			),
			("out", a_text(900, 0, 10, 10, "a3")),
		],
		&[("e", json!({ "fromNode": "n", "toNode": "out", "label": "goes" }))],
	);

	let read = read_out(&board);

	let sections: Vec<(&str, Option<&str>, Option<&str>)> = read
		.nodes
		.iter()
		.map(|node| (node.id.as_str(), node.text.as_deref(), node.section.as_deref()))
		.collect();
	assert_eq!(
		sections,
		[
			("lane", Some("Lane"), None),
			("inner", Some("Inner"), Some("lane")),
			("n", Some("Hello"), Some("inner")),
			("out", Some(""), None),
		]
	);
	assert_eq!(
		read.edges,
		[EdgeRead {
			id: "e".to_owned(),
			from_node: "n".to_owned(),
			to_node: "out".to_owned(),
			label: Some("goes".to_owned())
		}]
	);
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

fn read_alone(node: Value) -> NodeRead {
	let board = a_board(&[("n", node)], &[]);
	read_out(&board).nodes.into_iter().next().expect("the node reads out")
}

fn opened(node: &NodeRead) -> Value {
	let mut read = serde_json::to_value(node).expect("serializes");
	let read = read.as_object_mut().expect("an object");
	for answered_for_every_kind in ["id", "kind", "x", "y", "width", "height", "section"] {
		read.remove(answered_for_every_kind);
	}
	Value::Object(read.clone())
}

#[test]
fn a_sticky_reads_out_with_its_text() {
	let sticky = placed(json!({
		"kind": "sticky", "text": "Call Ana", "author": { "kind": "person", "id": PERSON }
	}));

	assert_eq!(opened(&read_alone(sticky)), json!({ "text": "Call Ana" }));
}

#[test]
fn a_text_reads_out_with_its_text() {
	assert_eq!(
		opened(&read_alone(placed(json!({ "kind": "text", "text": "Title" })))),
		json!({ "text": "Title" })
	);
}

#[test]
fn a_shape_reads_out_with_its_text() {
	let shape = placed(json!({ "kind": "shape", "text": "Box", "shape": "ellipse" }));

	assert_eq!(opened(&read_alone(shape)), json!({ "text": "Box" }));
}

#[test]
fn a_section_reads_out_with_its_label_as_its_text() {
	assert_eq!(
		opened(&read_alone(placed(json!({ "kind": "section", "label": "Lane" })))),
		json!({ "text": "Lane" })
	);
}

#[test]
fn an_image_reads_out_with_its_library_file_name_and_its_media_type() {
	assert_eq!(
		opened(&read_alone(a_person_image())),
		json!({ "text": null, "file": "cat.png", "mediaType": "image/png" })
	);
}

#[test]
fn an_image_of_a_plain_canvas_reads_out_with_the_last_segment_of_its_file() {
	let plain = placed(json!({ "kind": "image", "file": "attachments/photo.JPG" }));

	assert_eq!(
		opened(&read_alone(plain)),
		json!({ "text": null, "file": "photo.JPG", "mediaType": "image/jpeg" })
	);
}

#[test]
fn a_library_card_reads_out_with_its_library_file_name() {
	let card =
		placed(json!({ "kind": "libraryCard", "file": "Library/plan.md", "item": "plan.md" }));

	assert_eq!(opened(&read_alone(card)), json!({ "text": null, "file": "plan.md" }));
}

#[test]
fn a_link_card_reads_out_with_its_url_and_its_title() {
	let link =
		placed(json!({ "kind": "linkCard", "url": "https://example.com", "title": "Example" }));

	assert_eq!(
		opened(&read_alone(link)),
		json!({ "text": null, "url": "https://example.com", "title": "Example" })
	);
}

#[test]
fn a_foreign_node_reads_out_with_its_kind_and_place_only() {
	let foreign = placed(json!({ "kind": "foreign", "canvas": { "type": "x" } }));

	assert_eq!(opened(&read_alone(foreign)), json!({ "text": null }));
}

#[test]
fn every_kind_of_the_board_schema_has_its_read_out_test() {
	let tested =
		["foreign", "image", "libraryCard", "linkCard", "section", "shape", "sticky", "text"];

	assert_eq!(SCHEMA.kinds.keys().map(String::as_str).collect::<Vec<_>>(), tested);
}

#[test]
fn an_image_a_person_dropped_reads_out_then_moves_resizes_and_leaves_with_its_edges() {
	let card =
		placed(json!({ "kind": "libraryCard", "file": "Library/plan.md", "item": "plan.md" }));
	let sticky = placed(json!({
		"kind": "sticky", "text": "Note", "author": { "kind": "person", "id": PERSON }
	}));
	let board = a_board(
		&[("photo", a_person_image()), ("card", card), ("note", sticky)],
		&[
			("to-card", json!({ "fromNode": "photo", "toNode": "card" })),
			("to-note", json!({ "fromNode": "note", "toNode": "photo" })),
		],
	);
	let change = |value: Value| -> ChangedNode { serde_json::from_value(value).expect("a change") };

	let photo = read_out(&board).nodes.into_iter().find(|node| node.id == "photo").expect("read");
	let updated = changed(
		&board,
		&[
			change(json!({ "id": "photo", "x": 300, "y": 40, "width": 232, "height": 248 })),
			change(json!({ "id": "card", "x": -80, "height": 90 })),
		],
	)
	.expect("the geometry of a person's nodes applies");
	let looked = changed(&board, &[change(json!({ "id": "photo", "text": "A cat" }))])
		.expect_err("an image carries no text");
	let gone = removed(&board, &["photo".to_owned(), "card".to_owned(), "note".to_owned()])
		.expect("a person's nodes are removed");

	assert_eq!(
		(photo.file.as_deref(), photo.media_type.as_deref()),
		(Some("cat.png"), Some("image/png"))
	);
	let [moved, card] = &updated.edit.changed_nodes[..] else {
		panic!("two nodes change");
	};
	assert_eq!(moved.fields, ["height", "width", "x", "y"]);
	assert_eq!(rect_of(&moved.node), (300, 40, 232, 248));
	assert_eq!(moved.node["item"], "cat.png");
	assert_eq!(rect_of(&card.node), (-80, 0, 116, 90));
	assert_eq!(looked.fault, DrawFault::RefusedField { field: "text".to_owned() });
	assert_eq!(gone.edit.removed_nodes, ["photo", "card", "note"]);
	assert_eq!(gone.edit.removed_edges, ["to-card", "to-note"]);
}
