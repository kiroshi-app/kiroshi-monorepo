use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, Transact, Update};

use super::contract::LibraryError;
use super::{
	accepted_type, discarded, document_text, is_plain_name, linked_under_free_name, resolve,
	space_dir, undecodable, unwritable, within, AcceptedType, MAX_DOCUMENT_BYTES,
};
use crate::private_files;

const TEXT_NAME: &str = "markdown";

const STATE_DIR_NAME: &str = ".documents";

const STATE_EXTENSION: &str = "yjs";

type Key = (String, String);

#[derive(Default)]
pub(crate) struct Documents(Mutex<Held>);

#[derive(Default)]
struct Held {
	docs: HashMap<Key, Doc>,
	landed_names: HashMap<Key, String>,
}

pub(crate) struct Opened {
	pub(crate) state: Vec<u8>,
	pub(crate) host_edit: Option<Vec<u8>>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Applied {
	pub(crate) name: String,
	pub(crate) change: Vec<u8>,
}

struct DocumentFile {
	name: String,
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
		let mut held = self.held();
		let file = document_file(root, space_id, name)?;
		let key = key(space_id, name);
		let mut loaded = None;
		let (doc, was_stored) = match held.docs.get(&key) {
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
			held.docs.insert(key, loaded.doc);
		}
		Ok(Opened { state, host_edit })
	}

	pub(crate) fn apply(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		update: &[u8],
	) -> Result<Applied, LibraryError> {
		let incoming = decoded(name, update)?;
		let mut held = self.held();
		let file = held.located(root, space_id, name)?;
		let name = file.name.as_str();
		let key = key(space_id, name);
		let mut loaded = None;
		let doc = match held.docs.get(&key) {
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
			held.docs.insert(key, loaded.doc);
		}
		Ok(Applied { name: file.name, change })
	}

	pub(crate) fn rename(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		new_name: &str,
	) -> Result<Option<String>, LibraryError> {
		let mut held = self.held();
		let item = resolve(root, space_id, name)?;
		let AcceptedType::Document(format) = item.accepted else {
			return Err(LibraryError::Missing { name: name.to_owned() });
		};
		if new_name == name {
			return Ok(None);
		}
		let keeps_the_format = matches!(
			accepted_type(new_name),
			Some(AcceptedType::Document(wanted)) if wanted == format
		);
		if !is_plain_name(new_name) || !keeps_the_format {
			return Err(LibraryError::InvalidName { name: new_name.to_owned() });
		}
		let dir = space_dir(root, space_id);
		let landed = linked_under_free_name(&item.path, &dir, new_name)?;
		if let Err(error) = moved_from(root, space_id, &item.path, name, &landed) {
			discarded(&dir.join(&landed));
			return Err(unwritable(error));
		}
		held.moved(space_id, name, &landed);
		Ok(Some(landed))
	}

	pub(crate) fn forget(&self, root: &Path, space_id: &str) -> io::Result<()> {
		let mut held = self.held();
		held.docs.retain(|(held_space_id, _), _| held_space_id != space_id);
		held.landed_names.retain(|(held_space_id, _), _| held_space_id != space_id);
		match fs::remove_dir_all(state_dir(root, space_id)) {
			Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
			removed => removed,
		}
	}

	fn held(&self) -> MutexGuard<'_, Held> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

impl Held {
	fn located(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<DocumentFile, LibraryError> {
		match (document_file(root, space_id, name), self.landed_names.get(&key(space_id, name))) {
			(Err(LibraryError::Missing { .. }), Some(landed)) => {
				document_file(root, space_id, landed)
			}
			(found, _) => found,
		}
	}

	fn moved(&mut self, space_id: &str, name: &str, landed: &str) {
		let former_key = key(space_id, name);
		let landed_key = key(space_id, landed);
		self.docs.remove(&landed_key);
		if let Some(doc) = self.docs.remove(&former_key) {
			self.docs.insert(landed_key.clone(), doc);
		}
		self.landed_names.remove(&landed_key);
		for ((held_space_id, _), target) in &mut self.landed_names {
			if held_space_id == space_id && target == name {
				landed.clone_into(target);
			}
		}
		self.landed_names.insert(former_key, landed.to_owned());
	}
}

fn moved_from(
	root: &Path,
	space_id: &str,
	former: &Path,
	name: &str,
	landed: &str,
) -> io::Result<()> {
	let state = state_path(root, space_id, name);
	let landed_state = state_path(root, space_id, landed);
	let has_moved_state = match fs::rename(&state, &landed_state) {
		Ok(()) => true,
		Err(error) if error.kind() == io::ErrorKind::NotFound => {
			discarded(&landed_state);
			false
		}
		Err(error) => return Err(error),
	};
	fs::remove_file(former).inspect_err(|_| {
		if has_moved_state {
			if let Err(error) = fs::rename(&landed_state, &state) {
				log::warn!(
					"the stored state of a library document stayed under its new name: {error}"
				);
			}
		}
	})
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
	Ok(DocumentFile { name: name.to_owned(), path: item.path, text })
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
