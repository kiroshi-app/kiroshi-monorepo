use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, Transact, Update};

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

struct DocumentFile {
	path: PathBuf,
	text: String,
}

struct Loaded {
	doc: Doc,
	was_stored: bool,
}

impl Documents {
	pub(crate) fn open(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<Opened, LibraryError> {
		let file = document_file(root, space_id, name)?;
		let mut documents = self.held();
		let key = key(space_id, name);
		let mut loaded = None;
		let (doc, was_stored) = match documents.get(&key) {
			Some(held) => (held, true),
			None => {
				let loaded = loaded.insert(loaded_from_disk(root, space_id, name)?);
				(&loaded.doc, loaded.was_stored)
			}
		};
		let before = doc.transact().state_vector();
		let is_host_edited = took_as_host_edit(doc, &file.text);
		if is_host_edited || !was_stored {
			store_state(root, space_id, name, doc)?;
		}
		let host_edit = is_host_edited.then(|| doc.transact().encode_state_as_update_v1(&before));
		let state = full_state(doc);
		if let Some(loaded) = loaded {
			documents.insert(key, loaded.doc);
		}
		Ok(Opened { state, host_edit })
	}

	pub(crate) fn apply(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		update: &[u8],
	) -> Result<Vec<u8>, LibraryError> {
		let incoming = decoded(name, update)?;
		let file = document_file(root, space_id, name)?;
		let mut documents = self.held();
		let key = key(space_id, name);
		let mut loaded = None;
		let doc = match documents.get(&key) {
			Some(held) => held,
			None => &loaded.insert(loaded_from_disk(root, space_id, name)?).doc,
		};
		checked_on_a_copy(doc, &file.text, update, name)?;
		let before = doc.transact().state_vector();
		took_as_host_edit(doc, &file.text);
		merged_into(doc, name, incoming)?;
		let change = doc.transact().encode_state_as_update_v1(&before);
		store_state(root, space_id, name, doc)?;
		private_files::replace_atomically(&file.path, text_of(doc).as_bytes())
			.map_err(unwritable)?;
		if let Some(loaded) = loaded {
			documents.insert(key, loaded.doc);
		}
		Ok(change)
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

fn document_file(root: &Path, space_id: &str, name: &str) -> Result<DocumentFile, LibraryError> {
	let item = resolve(root, space_id, name)?;
	if !matches!(item.accepted, AcceptedType::Document(_)) {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	}
	let text = document_text(&item, name)?;
	Ok(DocumentFile { path: item.path, text })
}

fn decoded(name: &str, update: &[u8]) -> Result<Update, LibraryError> {
	Update::decode_v1(update).map_err(|error| undecodable(name, error.to_string()))
}

fn merged_into(doc: &Doc, name: &str, update: Update) -> Result<(), LibraryError> {
	doc.transact_mut().apply_update(update).map_err(|error| undecodable(name, error.to_string()))
}

fn loaded_from_disk(root: &Path, space_id: &str, name: &str) -> Result<Loaded, LibraryError> {
	let doc = Doc::new();
	let Some(stored) = stored_state(root, space_id, name)? else {
		return Ok(Loaded { doc, was_stored: false });
	};
	merged_into(&doc, name, decoded(name, &stored)?)?;
	Ok(Loaded { doc, was_stored: true })
}

fn checked_on_a_copy(
	doc: &Doc,
	file_text: &str,
	update: &[u8],
	name: &str,
) -> Result<(), LibraryError> {
	let copy = Doc::with_client_id(doc.client_id().get());
	merged_into(&copy, name, decoded(name, &full_state(doc))?)?;
	took_as_host_edit(&copy, file_text);
	merged_into(&copy, name, decoded(name, update)?)?;
	within(name, text_of(&copy).len() as u64, MAX_DOCUMENT_BYTES)
}

fn full_state(doc: &Doc) -> Vec<u8> {
	doc.transact().encode_state_as_update_v1(&StateVector::default())
}

fn text_of(doc: &Doc) -> String {
	doc.get_or_insert_text(TEXT_NAME).get_string(&doc.transact())
}

fn took_as_host_edit(doc: &Doc, wanted: &str) -> bool {
	let text = doc.get_or_insert_text(TEXT_NAME);
	let mut txn = doc.transact_mut();
	let current = text.get_string(&txn);
	if current == wanted {
		return false;
	}
	let prefix = shared_bytes(current.chars(), wanted.chars());
	let suffix = shared_bytes(current[prefix..].chars().rev(), wanted[prefix..].chars().rev());
	let removed = current.len() - prefix - suffix;
	text.remove_range(&mut txn, prefix as u32, removed as u32);
	text.insert(&mut txn, prefix as u32, &wanted[prefix..wanted.len() - suffix]);
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
