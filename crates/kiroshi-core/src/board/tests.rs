use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use yrs::updates::decoder::Decode;
use yrs::{Doc, Transact, Update};

use super::*;

const FIXTURE_CLIENT_ID: u64 = 1;

fn fixtures() -> PathBuf {
	Path::new(crate::APP_DIR).join("../../../packages/shared/board/fixtures")
}

fn cases() -> Vec<PathBuf> {
	let mut cases: Vec<_> = fs::read_dir(fixtures())
		.expect("the board fixtures are readable")
		.map(|entry| entry.expect("a fixture entry is readable").path())
		.filter(|path| path.is_dir())
		.collect();
	cases.sort();
	assert!(cases.len() >= 11, "the board fixtures cover every v1 object and the import cases");
	cases
}

fn text_at(path: &Path) -> String {
	fs::read_to_string(path)
		.unwrap_or_else(|error| panic!("{} is readable: {error}", path.display()))
}

fn json_at(path: &Path) -> Value {
	serde_json::from_str(&text_at(path)).expect("the fixture is JSON")
}

fn entries(value: &Value, field: &str) -> JsonObject {
	value.get(field).and_then(Value::as_object).cloned().unwrap_or_default()
}

fn board_of(value: &Value) -> Board {
	parsed_board(
		entries(value, "nodes").into_iter().collect(),
		entries(value, "edges").into_iter().collect(),
		entries(value, "kiroshi"),
		entries(value, "canvas"),
	)
	.expect("the fixture board is valid")
}

fn as_json(board: &Board) -> Value {
	serde_json::to_value(board).expect("a board serializes")
}

fn refusal_of(canvas: Value) -> BoardError {
	import_canvas(&canvas.to_string()).expect_err("the import is refused")
}

#[test]
fn every_fixture_board_exports_to_its_canvas_file() {
	for case in cases() {
		let board = board_of(&json_at(&case.join("board.json")));
		let exported = export_canvas(&board).expect("the board exports");
		assert_eq!(exported, text_at(&case.join("board.canvas")), "{}", case.display());
	}
}

#[test]
fn every_fixture_canvas_is_written_back_byte_for_byte() {
	for case in cases() {
		let canvas = text_at(&case.join("board.canvas"));
		let board = import_canvas(&canvas).expect("the canvas imports");
		let exported = export_canvas(&board).expect("the board exports");
		assert_eq!(exported, canvas, "{}", case.display());
	}
}

#[test]
fn every_fixture_canvas_imports_to_its_board() {
	for case in cases() {
		let board =
			import_canvas(&text_at(&case.join("board.canvas"))).expect("the canvas imports");
		assert_eq!(as_json(&board), json_at(&case.join("board.json")), "{}", case.display());
	}
}

#[test]
fn every_fixture_source_canvas_imports_to_its_board() {
	for case in cases().into_iter().filter(|case| case.join("source.canvas").exists()) {
		let board =
			import_canvas(&text_at(&case.join("source.canvas"))).expect("the source imports");
		assert_eq!(as_json(&board), json_at(&case.join("board.json")), "{}", case.display());
	}
}

#[test]
fn every_yjs_encoded_fixture_update_reads_as_its_board() {
	for case in cases() {
		let update = fs::read(case.join("update.bin")).expect("the update is readable");
		let doc = Doc::new();
		doc.transact_mut()
			.apply_update(Update::decode_v1(&update).expect("yrs decodes the yjs update"))
			.expect("the update applies");
		let board = read_board(&doc).expect("the doc reads as a board");
		assert_eq!(as_json(&board), json_at(&case.join("board.json")), "{}", case.display());
	}
}

#[test]
fn every_fixture_board_reads_back_from_the_doc_it_is_written_into() {
	for case in cases() {
		let board = board_of(&json_at(&case.join("board.json")));
		let doc = Doc::with_client_id(FIXTURE_CLIENT_ID);
		write_board(&doc, &board);
		assert_eq!(
			read_board(&doc).expect("the doc reads as a board"),
			board,
			"{}",
			case.display()
		);
	}
}

#[test]
fn a_board_written_twice_holds_only_the_second() {
	let doc = Doc::with_client_id(FIXTURE_CLIENT_ID);
	write_board(&doc, &board_of(&json_at(&fixtures().join("connector/board.json"))));
	let empty = board_of(&json_at(&fixtures().join("empty/board.json")));
	write_board(&doc, &empty);
	assert_eq!(read_board(&doc).expect("the doc reads as a board"), empty);
}

#[test]
fn unknown_node_types_and_kiroshi_fields_are_written_back_unchanged() {
	let source = text_at(&fixtures().join("unknown-fields/source.canvas"));
	let board = import_canvas(&source).expect("the canvas imports");
	let exported: Value = serde_json::from_str(&export_canvas(&board).expect("the board exports"))
		.expect("the export is JSON");
	assert_eq!(exported, serde_json::from_str::<Value>(&source).expect("the source is JSON"));
}

fn assert_every_field_kept(source: &JsonObject, exported: &JsonObject, at: &str) {
	for (field, value) in source {
		match (field.as_str(), value, exported.get(field)) {
			("kiroshi", Value::Object(source), Some(Value::Object(exported))) => {
				assert_every_field_kept(source, exported, &format!("{at} kiroshi"));
			}
			_ => assert_eq!(exported.get(field), Some(value), "{at}: {field}"),
		}
	}
}

fn by_id(canvas: &Value, list: &str) -> BTreeMap<String, JsonObject> {
	canvas[list]
		.as_array()
		.expect("the canvas holds the list")
		.iter()
		.map(|element| {
			let element = element.as_object().expect("an element is an object").clone();
			(element["id"].as_str().expect("an element has an id").to_owned(), element)
		})
		.collect()
}

#[test]
fn every_top_level_field_of_a_source_canvas_is_exported_unchanged() {
	for case in cases().into_iter().filter(|case| case.join("source.canvas").exists()) {
		let text = text_at(&case.join("source.canvas"));
		let source: Value = serde_json::from_str(&text).expect("the source is JSON");
		let board = import_canvas(&text).expect("the source imports");
		let exported: Value =
			serde_json::from_str(&export_canvas(&board).expect("the board exports"))
				.expect("the export is JSON");
		let at = case.display().to_string();
		let mut root = source.as_object().expect("the source root is an object").clone();
		root.retain(|field, _| field != "nodes" && field != "edges");
		assert_every_field_kept(&root, exported.as_object().expect("the export is an object"), &at);
		for list in ["nodes", "edges"] {
			let exported = by_id(&exported, list);
			for (id, element) in by_id(&source, list) {
				assert_every_field_kept(&element, &exported[&id], &format!("{at} {list} {id}"));
			}
		}
	}
}

fn text_node(id: &str, z: Option<&str>) -> Value {
	let mut node =
		json!({ "id": id, "type": "text", "text": id, "x": 0, "y": 0, "width": 1, "height": 1 });
	if let Some(z) = z {
		node["kiroshi"] = json!({ "z": z });
	}
	node
}

fn zs_of(nodes: Vec<Value>) -> Value {
	let board = import_canvas(&json!({ "nodes": nodes }).to_string()).expect("the canvas imports");
	board.nodes.iter().map(|(id, node)| (id.clone(), node["z"].clone())).collect()
}

#[test]
fn z_values_that_agree_with_the_array_order_are_kept() {
	assert_eq!(
		zs_of(vec![text_node("first", Some("Zz")), text_node("second", Some("a0V"))]),
		json!({ "first": "Zz", "second": "a0V" })
	);
}

#[test]
fn z_is_assigned_from_the_array_order_when_missing_or_out_of_order() {
	let expected = json!({ "first": "a0", "second": "a1" });
	assert_eq!(
		zs_of(vec![text_node("first", Some("a5")), text_node("second", Some("a1"))]),
		expected
	);
	assert_eq!(zs_of(vec![text_node("first", Some("a5")), text_node("second", None)]), expected);
	assert_eq!(
		zs_of(vec![
			text_node("first", Some("a5")),
			text_node("second", Some("a7")),
			text_node("third", Some("a7")),
		]),
		json!({ "first": "a0", "second": "a1", "third": "a2" })
	);
	let many = zs_of((0..63).map(|index| text_node(&format!("n{index}"), None)).collect());
	assert_eq!(
		[&many["n0"], &many["n61"], &many["n62"]],
		[&json!("a0"), &json!("az"), &json!("b10")]
	);
}

#[test]
fn a_node_missing_its_id_or_geometry_is_refused_by_name() {
	assert_eq!(
		refusal_of(
			json!({ "nodes": [{ "type": "text", "x": 0, "y": 0, "width": 1, "height": 1 }] })
		),
		BoardError::MissingId { element: Element::Node, index: 0 }
	);
	assert_eq!(
		refusal_of(
			json!({ "nodes": [{ "id": "a", "type": "text", "y": 0, "width": 1, "height": 1 }] })
		),
		BoardError::InvalidField { element: Element::Node, id: "a".into(), field: "x".into() }
	);
	assert_eq!(
		refusal_of(
			json!({ "nodes": [{ "id": "a", "type": "text", "x": 0, "y": 0, "width": 1.5, "height": 1 }] })
		),
		BoardError::InvalidField { element: Element::Node, id: "a".into(), field: "width".into() }
	);
}

#[test]
fn an_edge_to_an_absent_node_is_refused_by_name() {
	let group = json!({ "id": "a", "type": "group", "x": 0, "y": 0, "width": 1, "height": 1 });
	assert_eq!(
		refusal_of(
			json!({ "nodes": [group], "edges": [{ "id": "e", "fromNode": "a", "toNode": "gone" }] })
		),
		BoardError::DanglingEdge { id: "e".into(), field: "toNode", node: "gone".into() }
	);
	assert_eq!(
		refusal_of(json!({ "nodes": [group, group] })),
		BoardError::DuplicateId { element: Element::Node, id: "a".into() }
	);
}

#[test]
fn a_sticky_whose_author_is_not_an_identity_is_refused_by_name() {
	let authors = [
		json!("Ichi"),
		json!({ "kind": "robot", "id": "ichi" }),
		json!({ "kind": "agent", "id": "" }),
		json!({ "kind": "agent" }),
		json!({ "kind": "agent", "id": "ichi", "name": "Ichi" }),
	];
	for author in authors {
		let sticky = json!({
			"id": "a", "type": "text", "x": 0, "y": 0, "width": 1, "height": 1,
			"kiroshi": { "kind": "sticky", "author": author },
		});
		assert_eq!(
			refusal_of(json!({ "nodes": [sticky] })),
			BoardError::InvalidField {
				element: Element::Node,
				id: "a".into(),
				field: "author".into()
			},
			"{author}"
		);
	}
}

#[test]
fn an_unreadable_canvas_is_refused() {
	assert!(matches!(import_canvas("{"), Err(BoardError::NotJson { .. })));
	assert_eq!(refusal_of(json!([])), BoardError::InvalidRoot { field: "root" });
	assert_eq!(refusal_of(json!({ "nodes": {} })), BoardError::InvalidRoot { field: "nodes" });
}

#[test]
fn the_schema_names_the_defaults_both_engines_apply() {
	let default_of = |fields: &schema::Fields, name: &str| {
		fields.get(name).and_then(|spec| spec.default.clone()).expect("the field has a default")
	};
	assert_eq!(default_of(&SCHEMA.edge.fields, "fromEnd"), json!("none"));
	assert_eq!(default_of(&SCHEMA.edge.fields, "toEnd"), json!("arrow"));
	assert_eq!(default_of(&SCHEMA.edge.fields, "routing"), json!("straight"));
	assert_eq!(default_of(&SCHEMA.kinds["sticky"].fields, "fill"), json!("yellow"));
	assert_eq!(default_of(&SCHEMA.kinds["shape"].fields, "shape"), json!("rectangle"));
}
