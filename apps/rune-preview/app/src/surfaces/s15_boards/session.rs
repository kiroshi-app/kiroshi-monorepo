use std::collections::BTreeMap;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use kiroshi_core::board::{BoardEdit, edit_board, parsed_board};
use serde_json::{Map, Value};
use yrs::types::ToJson;
use yrs::undo::Options;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, UndoManager, Update};

const REMOTE: &str = "remote";

const NODES: &str = "nodes";

const EDGES: &str = "edges";

const EXTRAS: &str = "kiroshi";

const CANVAS: &str = "canvas";

const ENDPOINTS: [&str; 2] = ["fromNode", "toNode"];

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Held {
	pub nodes: Map<String, Value>,
	pub edges: Map<String, Value>,
}

pub struct Session {
	doc: Doc,
	history: UndoManager,
	held: Held,
	refusal: Option<String>,
}

impl Session {
	pub fn opened(state: &str) -> Result<Session, String> {
		let doc = Doc::new();
		received_into(&doc, state)?;
		let held = held_of(&doc)?;
		let history = history_of(&doc);
		Ok(Session { doc, history, held, refusal: None })
	}

	pub fn held(&self) -> &Held {
		&self.held
	}

	pub fn refusal(&self) -> Option<&str> {
		self.refusal.as_deref()
	}

	pub fn received(&mut self, update: &str) -> Result<(), String> {
		received_into(&self.doc, update)?;
		self.refresh();
		Ok(())
	}

	pub fn edited(&mut self, edit: &BoardEdit) -> String {
		let before = self.state_vector();
		edit_board(&self.doc, edit);
		self.refresh();
		self.update_since(&before)
	}

	pub fn undone(&mut self) -> Option<String> {
		let before = self.state_vector();
		self.history.undo_blocking().then(|| self.stepped(&before))
	}

	pub fn redone(&mut self) -> Option<String> {
		let before = self.state_vector();
		self.history.redo_blocking().then(|| self.stepped(&before))
	}

	fn stepped(&mut self, before: &StateVector) -> String {
		self.refresh();
		self.update_since(before)
	}

	fn refresh(&mut self) {
		match held_of(&self.doc) {
			Ok(held) => {
				self.held = held;
				self.refusal = None;
			}
			Err(refusal) => self.refusal = Some(refusal),
		}
	}

	fn state_vector(&self) -> StateVector {
		self.doc.transact().state_vector()
	}

	fn update_since(&self, before: &StateVector) -> String {
		BASE64_STANDARD.encode(self.doc.transact().encode_state_as_update_v1(before))
	}
}

fn received_into(doc: &Doc, update: &str) -> Result<(), String> {
	let bytes = BASE64_STANDARD.decode(update).map_err(|failure| failure.to_string())?;
	let update = Update::decode_v1(&bytes).map_err(|failure| failure.to_string())?;
	doc.transact_mut_with(REMOTE).apply_update(update).map_err(|failure| failure.to_string())
}

fn history_of(doc: &Doc) -> UndoManager {
	let mut history =
		UndoManager::with_options(Options { capture_timeout_millis: 0, ..Options::default() });
	history.expand_scope(doc, &doc.get_or_insert_map(NODES));
	history.expand_scope(doc, &doc.get_or_insert_map(EDGES));
	history
}

fn root_of<T: ReadTxn>(txn: &T, name: &str) -> Map<String, Value> {
	let read = txn.get_map(name).map(|map| serde_json::to_value(map.to_json(txn)));
	match read {
		Some(Ok(Value::Object(entries))) => entries,
		_ => Map::new(),
	}
}

fn is_dangling(nodes: &Map<String, Value>, edge: &Value) -> bool {
	ENDPOINTS.iter().any(|field| {
		edge.get(field).and_then(Value::as_str).is_some_and(|node| !nodes.contains_key(node))
	})
}

fn held_of(doc: &Doc) -> Result<Held, String> {
	let txn = doc.transact();
	let nodes = root_of(&txn, NODES);
	let edges: BTreeMap<String, Value> =
		root_of(&txn, EDGES).into_iter().filter(|(_, edge)| !is_dangling(&nodes, edge)).collect();
	let board = parsed_board(
		nodes.into_iter().collect(),
		edges,
		root_of(&txn, EXTRAS),
		root_of(&txn, CANVAS),
	)
	.map_err(|refusal| format!("{refusal:?}"))?;
	let parsed = serde_json::to_value(&board).map_err(|failure| failure.to_string())?;
	let entries = |name: &str| match parsed.get(name) {
		Some(Value::Object(entries)) => entries.clone(),
		_ => Map::new(),
	};
	Ok(Held { nodes: entries(NODES), edges: entries(EDGES) })
}
