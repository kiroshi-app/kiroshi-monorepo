use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, TextRef, Transact, TransactionMut, Update};

use super::contract::LibraryError;
use super::{
	document_text, resolve, undecodable, unwritable, within, AcceptedType, MAX_DOCUMENT_BYTES,
};
use crate::private_files;

const TEXT_NAME: &str = "markdown";

const STATE_DIR_NAME: &str = ".documents";

const STATE_EXTENSION: &str = "yjs";

type Key = (String, String);

#[derive(Default)]
pub(crate) struct Documents(Mutex<HashMap<Key, Doc>>);

pub(crate) struct Opened {
	pub(crate) state: Vec<u8>,
	pub(crate) host_edit: Option<Vec<u8>>,
}

struct Merged {
	doc: Doc,
	path: PathBuf,
	text: String,
	change: Vec<u8>,
	is_host_edited: bool,
	was_stored: bool,
}

impl Documents {
	pub(crate) fn open(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<Opened, LibraryError> {
		let mut documents = self.held();
		let merged = merged(&documents, root, space_id, name, None)?;
		if merged.is_host_edited || !merged.was_stored {
			store_state(root, space_id, name, &merged.doc)?;
		}
		let state = merged.doc.transact().encode_state_as_update_v1(&StateVector::default());
		let host_edit = merged.is_host_edited.then_some(merged.change);
		documents.insert(key(space_id, name), merged.doc);
		Ok(Opened { state, host_edit })
	}

	pub(crate) fn apply(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		update: &[u8],
	) -> Result<Vec<u8>, LibraryError> {
		let incoming =
			Update::decode_v1(update).map_err(|error| undecodable(name, error.to_string()))?;
		let mut documents = self.held();
		let merged = merged(&documents, root, space_id, name, Some(incoming))?;
		store_state(root, space_id, name, &merged.doc)?;
		private_files::replace_atomically(&merged.path, merged.text.as_bytes())
			.map_err(unwritable)?;
		documents.insert(key(space_id, name), merged.doc);
		Ok(merged.change)
	}

	pub(crate) fn forget(&self, root: &Path, space_id: &str) -> io::Result<()> {
		self.held().retain(|(held_space_id, _), _| held_space_id != space_id);
		match fs::remove_dir_all(state_dir(root, space_id)) {
			Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
			removed => removed,
		}
	}

	fn held(&self) -> MutexGuard<'_, HashMap<Key, Doc>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

fn key(space_id: &str, name: &str) -> Key {
	(space_id.to_owned(), name.to_owned())
}

fn merged(
	documents: &HashMap<Key, Doc>,
	root: &Path,
	space_id: &str,
	name: &str,
	incoming: Option<Update>,
) -> Result<Merged, LibraryError> {
	let item = resolve(root, space_id, name)?;
	if !matches!(item.accepted, AcceptedType::Document(_)) {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	}
	let file_text = document_text(&item, name)?;
	let (base, was_stored) = match documents.get(&key(space_id, name)) {
		Some(held) => {
			(Some(held.transact().encode_state_as_update_v1(&StateVector::default())), true)
		}
		None => {
			let stored = stored_state(root, space_id, name)?;
			let was_stored = stored.is_some();
			(stored, was_stored)
		}
	};
	let doc = Doc::new();
	let text = doc.get_or_insert_text(TEXT_NAME);
	let mut txn = doc.transact_mut();
	if let Some(base) = base {
		let base =
			Update::decode_v1(&base).map_err(|error| undecodable(name, error.to_string()))?;
		txn.apply_update(base).map_err(|error| undecodable(name, error.to_string()))?;
	}
	let before = txn.state_vector();
	let is_host_edited = took_as_host_edit(&text, &mut txn, &file_text);
	if let Some(incoming) = incoming {
		txn.apply_update(incoming).map_err(|error| undecodable(name, error.to_string()))?;
	}
	let merged_text = text.get_string(&txn);
	within(name, merged_text.len() as u64, MAX_DOCUMENT_BYTES)?;
	let change = txn.encode_state_as_update_v1(&before);
	drop(txn);
	Ok(Merged { doc, path: item.path, text: merged_text, change, is_host_edited, was_stored })
}

fn took_as_host_edit(text: &TextRef, txn: &mut TransactionMut, wanted: &str) -> bool {
	let current = text.get_string(txn);
	if current == wanted {
		return false;
	}
	let prefix = shared_bytes(current.chars(), wanted.chars());
	let suffix = shared_bytes(current[prefix..].chars().rev(), wanted[prefix..].chars().rev());
	let removed = current.len() - prefix - suffix;
	text.remove_range(txn, prefix as u32, removed as u32);
	text.insert(txn, prefix as u32, &wanted[prefix..wanted.len() - suffix]);
	true
}

fn shared_bytes(left: impl Iterator<Item = char>, right: impl Iterator<Item = char>) -> usize {
	left.zip(right).take_while(|(a, b)| a == b).map(|(a, _)| a.len_utf8()).sum()
}

fn state_dir(root: &Path, space_id: &str) -> PathBuf {
	root.join(STATE_DIR_NAME).join(space_id)
}

fn state_path(root: &Path, space_id: &str, name: &str) -> PathBuf {
	state_dir(root, space_id).join(format!("{name}.{STATE_EXTENSION}"))
}

fn stored_state(root: &Path, space_id: &str, name: &str) -> Result<Option<Vec<u8>>, LibraryError> {
	match fs::read(state_path(root, space_id, name)) {
		Ok(state) => Ok(Some(state)),
		Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
		Err(error) => Err(LibraryError::Unreadable { detail: error.to_string() }),
	}
}

fn store_state(root: &Path, space_id: &str, name: &str, doc: &Doc) -> Result<(), LibraryError> {
	let state = doc.transact().encode_state_as_update_v1(&StateVector::default());
	private_files::replace_atomically(&state_path(root, space_id, name), &state).map_err(unwritable)
}
