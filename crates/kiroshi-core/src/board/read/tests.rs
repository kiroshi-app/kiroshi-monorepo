use serde_json::{json, Value};

use super::*;
use crate::board::draw::{BoardItem, DrawFault};
use crate::board::fixtures::{a_board, a_section, a_text};

fn nested_board() -> Board {
	a_board(
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
		&[
			("inside", json!({ "fromNode": "n", "toNode": "inner", "label": "up" })),
			("free", json!({ "fromPoint": { "x": 300, "y": 300 }, "toNode": "n" })),
			("across", json!({ "fromNode": "n", "toNode": "out" })),
		],
	)
}

fn ids_of(tree: &BoardTree) -> Vec<(&str, Option<&str>)> {
	tree.nodes.iter().map(|node| (node.id.as_str(), node.parent.as_deref())).collect()
}

#[test]
fn a_tree_lists_each_node_under_the_smallest_section_that_holds_it_in_z_order() {
	let board = nested_board();

	let whole = tree(&board, None, None).expect("the whole board");
	let lane = tree(&board, Some("lane"), None).expect("the lane");

	assert_eq!(
		ids_of(&whole),
		[("lane", None), ("inner", Some("lane")), ("n", Some("inner")), ("out", None)]
	);
	assert!(whole.nodes.iter().all(|node| node.unlisted_children.is_none()));
	assert_eq!(whole.arrows.len(), 3);
	assert_eq!(ids_of(&lane), [("inner", Some("lane")), ("n", Some("inner"))]);
	let arrows: Vec<&str> = lane.arrows.iter().map(|arrow| arrow.id.as_str()).collect();
	assert_eq!(arrows, ["free", "inside"]);
	assert_eq!(
		serde_json::to_value(&lane.nodes[1]).expect("serializes"),
		json!({
			"id": "n", "kind": "text", "text": "Hello",
			"x": 20, "y": 20, "width": 50, "height": 50, "z": "a2", "parent": "inner"
		})
	);
	assert_eq!(
		serde_json::to_value(&lane.arrows[1]).expect("serializes"),
		json!({ "id": "inside", "fromNode": "n", "toNode": "inner", "label": "up" })
	);
}

#[test]
fn a_tree_cut_at_a_depth_counts_the_children_it_leaves_out() {
	let board = nested_board();

	let shallow = tree(&board, None, Some(1)).expect("one level");
	let two = tree(&board, Some("lane"), Some(1)).expect("one level of the lane");

	assert_eq!(ids_of(&shallow), [("lane", None), ("out", None)]);
	let counts: Vec<Option<usize>> =
		shallow.nodes.iter().map(|node| node.unlisted_children).collect();
	assert_eq!(counts, [Some(1), Some(0)]);
	assert_eq!(ids_of(&two), [("inner", Some("lane"))]);
	assert_eq!(two.nodes[0].unlisted_children, Some(1));
}

#[test]
fn a_parent_that_is_absent_or_not_a_section_is_refused_with_its_id() {
	let board = nested_board();

	let absent = tree(&board, Some("ghost"), None).expect_err("refused");
	let not_a_section = under(&board, Some("n")).expect_err("refused");

	assert_eq!((absent.element, absent.index), (BoardItem::Parent, None));
	assert_eq!(absent.fault, DrawFault::UnknownReference { reference: "ghost".to_owned() });
	assert_eq!(not_a_section.fault, DrawFault::NotASection { reference: "n".to_owned() });
}

#[test]
fn two_sections_of_the_same_rect_nest_one_in_the_other_without_a_cycle() {
	let twin =
		|z: &str| json!({ "kind": "section", "x": 0, "y": 0, "width": 100, "height": 100, "z": z });
	let board = a_board(
		&[("first", twin("a0")), ("second", twin("a1")), ("dot", a_text(10, 10, 5, 5, "a2"))],
		&[],
	);

	let listed = tree(&board, None, None).expect("listed");

	assert_eq!(
		ids_of(&listed),
		[("first", None), ("second", Some("first")), ("dot", Some("second"))]
	);
}

#[test]
fn info_counts_every_kind_and_arrow_and_names_the_top_level_sections_and_the_bounds() {
	let info = info(&nested_board());

	assert_eq!(
		serde_json::to_value(&info).expect("serializes"),
		json!({
			"kinds": { "section": 2, "text": 2 },
			"arrows": 3,
			"bounds": { "x": 0, "y": 0, "width": 910, "height": 500 },
			"sections": [{ "id": "lane", "label": "Lane", "x": 0, "y": 0, "width": 500, "height": 500 }]
		})
	);
	assert_eq!(super::info(&a_board(&[], &[])).bounds, None);
}

#[test]
fn node_info_answers_every_field_with_its_default_and_refuses_an_unknown_id() {
	let board = nested_board();

	let detail = node_info(&board, &["n".to_owned()], &["inside".to_owned()]).expect("detail");
	let refused =
		node_info(&board, &["n".to_owned(), "gone".to_owned()], &[]).expect_err("refused");

	assert_eq!(
		Value::Object(detail.nodes[0].clone()),
		json!({
			"id": "n", "kind": "text", "text": "Hello", "color": null, "canvas": null,
			"x": 20, "y": 20, "width": 50, "height": 50, "z": "a2"
		})
	);
	let arrow = &detail.arrows[0];
	assert_eq!(
		(&arrow["fromSide"], &arrow["toEnd"], &arrow["routing"], &arrow["headSize"]),
		(&Value::Null, &json!("arrow"), &json!("straight"), &json!("medium"))
	);
	assert_eq!((&arrow["labelPosition"], &arrow["bend"]), (&json!(0.5), &json!(0)));
	assert_eq!((refused.element, refused.index), (BoardItem::Node, Some(1)));
}

#[test]
fn under_a_section_keeps_it_its_descendants_and_the_arrows_between_them() {
	let part = under(&nested_board(), Some("inner")).expect("the part");

	assert_eq!(part.nodes.keys().collect::<Vec<_>>(), ["inner", "n"]);
	assert_eq!(part.edges.keys().collect::<Vec<_>>(), ["inside"]);
}

#[test]
fn find_matches_every_criterion_given_and_text_whatever_its_case() {
	let board = a_board(
		&[
			(
				"a",
				json!({ "kind": "shape", "text": "Ship IT", "shape": "ellipse", "x": 0, "y": 0, "width": 1, "height": 1, "z": "a0" }),
			),
			(
				"b",
				json!({ "kind": "shape", "text": "ship", "x": 0, "y": 0, "width": 1, "height": 1, "z": "a1" }),
			),
			(
				"c",
				json!({ "kind": "sticky", "text": "Shipping", "fill": "blue", "author": { "kind": "agent", "id": "b1" }, "x": 0, "y": 0, "width": 1, "height": 1, "z": "a2" }),
			),
		],
		&[],
	);
	let sought = |value: Value| find(&board, &serde_json::from_value(value).expect("criteria"));

	assert_eq!(sought(json!({ "text": "SHIP" })), ["a", "b", "c"]);
	assert_eq!(sought(json!({ "text": "ship", "shape": "rectangle" })), ["b"]);
	assert_eq!(sought(json!({ "kind": "sticky", "fill": "blue" })), ["c"]);
	assert!(sought(json!({ "text": "ship", "color": "1" })).is_empty());
}

#[test]
fn the_content_hash_moves_with_any_node_or_arrow_and_only_with_them() {
	let board = nested_board();
	let moved = a_board(&[("lane", a_section(0, 0, 500, 501))], &[]);

	let hash = content_hash(&board).expect("hashes");

	assert_eq!(content_hash(&nested_board()).expect("hashes"), hash);
	assert_ne!(content_hash(&moved).expect("hashes"), hash);
	assert_ne!(content_hash(&board.kept(|_| true, |_| false)).expect("hashes"), hash);
}

fn excerpt_alone(node: Value) -> Option<String> {
	let mut placed = json!({ "x": 0, "y": 0, "width": 116, "height": 124, "z": "a0" });
	placed.as_object_mut().expect("an object").extend(node.as_object().expect("an object").clone());
	tree(&a_board(&[("n", placed)], &[]), None, None).expect("listed").nodes[0].text.clone()
}

#[test]
fn a_sticky_a_text_and_a_shape_show_their_text_and_a_section_its_label() {
	let sticky =
		json!({ "kind": "sticky", "text": "Call Ana", "author": { "kind": "person", "id": "p1" } });

	assert_eq!(excerpt_alone(sticky).as_deref(), Some("Call Ana"));
	assert_eq!(excerpt_alone(json!({ "kind": "text", "text": "Title" })).as_deref(), Some("Title"));
	assert_eq!(excerpt_alone(json!({ "kind": "shape", "text": "Box" })).as_deref(), Some("Box"));
	assert_eq!(
		excerpt_alone(json!({ "kind": "section", "label": "Lane" })).as_deref(),
		Some("Lane")
	);
}

#[test]
fn an_image_and_a_library_card_show_their_file_a_link_card_its_title_and_a_foreign_node_nothing() {
	let image = json!({ "kind": "image", "file": "Library/cat.png", "item": "cat.png" });
	let plain = json!({ "kind": "image", "file": "attachments/photo.JPG" });
	let card = json!({ "kind": "libraryCard", "file": "Library/plan.md", "item": "plan.md" });
	let link = json!({ "kind": "linkCard", "url": "https://example.com", "title": "Example" });
	let bare_link = json!({ "kind": "linkCard", "url": "https://example.com" });
	let foreign = json!({ "kind": "foreign", "canvas": { "type": "x" } });

	assert_eq!(excerpt_alone(image).as_deref(), Some("cat.png"));
	assert_eq!(excerpt_alone(plain).as_deref(), Some("photo.JPG"));
	assert_eq!(excerpt_alone(card).as_deref(), Some("plan.md"));
	assert_eq!(excerpt_alone(link).as_deref(), Some("Example"));
	assert_eq!(excerpt_alone(bare_link).as_deref(), Some("https://example.com"));
	assert_eq!(excerpt_alone(foreign), None);
}

#[test]
fn a_long_text_shows_on_one_line_cut_to_sixty_characters() {
	let long = format!("{}\n\n{}", "word ".repeat(10), "é".repeat(40));

	let shown = excerpt_alone(json!({ "kind": "text", "text": long })).expect("an excerpt");

	assert_eq!(shown.chars().count(), 60);
	assert!(shown.starts_with("word word") && !shown.contains('\n'), "{shown}");
	assert!(shown.ends_with("é…"), "{shown}");
}

#[test]
fn every_kind_of_the_board_schema_has_its_excerpt_test() {
	let tested =
		["foreign", "image", "libraryCard", "linkCard", "section", "shape", "sticky", "text"];

	assert_eq!(SCHEMA.kinds.keys().map(String::as_str).collect::<Vec<_>>(), tested);
}

#[test]
fn a_frame_holds_every_node_and_free_arrow_end_kept_plus_a_24_px_margin() {
	let board = nested_board();

	let whole = framed(&board, None).expect("the whole board");
	let inner = framed(&board, Some("inner")).expect("the inner section");
	let absent = framed(&board, Some("ghost")).expect_err("refused");

	assert_eq!(whole.frame, Some(Frame { x: -24, y: -24, width: 958, height: 548 }));
	assert_eq!(inner.part.nodes.keys().collect::<Vec<_>>(), ["inner", "n"]);
	assert_eq!(inner.part.edges.keys().collect::<Vec<_>>(), ["inside"]);
	assert_eq!(inner.frame, Some(Frame { x: -14, y: -14, width: 248, height: 248 }));
	assert_eq!((absent.element, absent.index), (BoardItem::Node, Some(0)));
	assert_eq!(absent.fault, DrawFault::UnknownReference { reference: "ghost".to_owned() });
	assert_eq!(framed(&a_board(&[], &[]), None).expect("empty").frame, None);
}
