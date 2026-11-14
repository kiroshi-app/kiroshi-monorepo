use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tokio::time::Instant;
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

use super::blocks::Splice;
use super::contract::{LibraryDocumentFormat, LibraryError};
use super::{
	accepted_type, discarded, document_text, is_plain_name, is_the_item_itself,
	linked_under_free_name, read_bytes, resolve, space_dir, stored_thumbnail, thumbnail_name,
	thumbnails_dir, undecodable, unwritable, AcceptedType, ResolvedItem,
};
use crate::board::{Board, BoardEdit};
use crate::private_files;

mod board;
mod markdown;
#[cfg(test)]
mod tests;

pub(crate) use markdown::{carets_at, text_of_state};

const STATE_DIR_NAME: &str = ".documents";

const STATE_EXTENSION: &str = "yjs";

const BOARD_WRITE_QUIET: Duration = Duration::from_millis(500);

const BOARD_WRITE_LONGEST_WAIT: Duration = Duration::from_secs(2);

type Key = (String, String);

type BoardFileReplaced = Arc<dyn Fn(&str, &str) + Send + Sync>;

type BoardWritten = Arc<dyn Fn(&str, &str, &Board) + Send + Sync>;

#[derive(Clone)]
struct BoardWriteHooks {
	on_file_replaced: BoardFileReplaced,
	on_written: BoardWritten,
}

pub(crate) struct Documents {
	held: Arc<Mutex<Held>>,
	board_write_hooks: BoardWriteHooks,
}

#[derive(Default)]
struct Held {
	docs: HashMap<Key, Doc>,
	landed_names: HashMap<Key, String>,
	written_boards: HashMap<Key, Board>,
	pending_boards: HashMap<Key, PendingWrite>,
	last_generation: u64,
}

struct PendingWrite {
	root: PathBuf,
	first: Instant,
	last: Instant,
	armed: Option<u64>,
}

impl PendingWrite {
	fn due(&self) -> Instant {
		(self.last + BOARD_WRITE_QUIET).min(self.first + BOARD_WRITE_LONGEST_WAIT)
	}
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

pub(crate) struct WriteStep<'a> {
	pub(crate) writer: u64,
	pub(crate) caret: &'a [u8],
	pub(crate) text: &'a str,
}

#[derive(Clone, Copy)]
pub(crate) struct BoardTarget<'a> {
	pub(crate) root: &'a Path,
	pub(crate) space_id: &'a str,
	pub(crate) name: &'a str,
	pub(crate) writer: u64,
}

pub(crate) struct RemoveStep<'a> {
	pub(crate) writer: u64,
	pub(crate) start: &'a [u8],
	pub(crate) end: &'a [u8],
}

pub(crate) struct Written {
	pub(crate) name: String,
	pub(crate) change: Vec<u8>,
	pub(crate) caret: Vec<u8>,
}

#[derive(Clone, Copy)]
enum DocumentKind {
	Markdown,
	Board,
}

impl DocumentKind {
	fn of(format: LibraryDocumentFormat) -> Self {
		match format {
			LibraryDocumentFormat::Markdown | LibraryDocumentFormat::Text => Self::Markdown,
		}
	}

	fn reconciled(self, doc: &Doc, file_text: &str) -> bool {
		match self {
			Self::Markdown => markdown::reconciled(doc, file_text),
			Self::Board => false,
		}
	}

	fn exported(self, doc: &Doc, name: &str) -> Result<Vec<u8>, LibraryError> {
		match self {
			Self::Markdown => Ok(markdown::exported(doc)),
			Self::Board => board::exported(doc, name),
		}
	}

	fn bounded(self, doc: &Doc, name: &str) -> Result<(), LibraryError> {
		match self {
			Self::Markdown => markdown::bounded(doc, name),
			Self::Board => board::bounded(doc, name),
		}
	}
}

struct DocumentFile {
	name: String,
	path: PathBuf,
	text: String,
	kind: DocumentKind,
}

struct Loaded {
	doc: Doc,
	was_stored: bool,
}

struct LoadedBoard {
	doc: Doc,
	written: Board,
	was_stored: bool,
}

#[cfg(test)]
impl Default for Documents {
	fn default() -> Self {
		Self::new(|_, _| {}, |_, _, _| {})
	}
}

impl Documents {
	pub(crate) fn new(
		on_board_file_replaced: impl Fn(&str, &str) + Send + Sync + 'static,
		on_board_written: impl Fn(&str, &str, &Board) + Send + Sync + 'static,
	) -> Self {
		let board_write_hooks = BoardWriteHooks {
			on_file_replaced: Arc::new(on_board_file_replaced),
			on_written: Arc::new(on_board_written),
		};
		Self { held: Arc::default(), board_write_hooks }
	}

	pub(crate) fn open(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<Opened, LibraryError> {
		let mut held = self.held();
		let file = document_file(root, space_id, name)?;
		match file.kind {
			DocumentKind::Board => {
				held.board_synced(root, space_id, &file, &self.board_write_hooks)
			}
			DocumentKind::Markdown => held.synced(root, space_id, name, file.kind, &file.text),
		}
	}

	pub(crate) fn overwrite_document(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		text: &str,
	) -> Result<Opened, LibraryError> {
		let mut held = self.held();
		let file = document_file(root, space_id, name)?;
		private_files::replace_atomically(&file.path, text.as_bytes()).map_err(unwritable)?;
		held.synced(root, space_id, name, file.kind, text)
	}

	pub(crate) fn overwrite_image(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		bytes: &[u8],
		thumbnail: &[u8],
	) -> Result<(), LibraryError> {
		let _held = self.held();
		let item = resolve(root, space_id, name)?;
		let thumbnails = thumbnails_dir(&space_dir(root, space_id));
		let former = thumbnail_name(name, &item.path)?;
		private_files::replace_atomically(&item.path, bytes).map_err(unwritable)?;
		let current = thumbnail_name(name, &item.path)?;
		stored_thumbnail(&thumbnails, &current, thumbnail)?;
		if former != current {
			discarded(&thumbnails.join(former));
		}
		Ok(())
	}

	pub(crate) fn apply(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		update: &[u8],
		announce: impl FnOnce(&Applied),
	) -> Result<(), LibraryError> {
		decoded(name, update)?;
		if matches!(accepted_type(name), Some(AcceptedType::Board)) {
			return self.applied_to_board(root, space_id, name, update, announce);
		}
		let (applied, ()) =
			self.merged(root, space_id, name, |_, _, _| Ok((update.to_vec(), ())))?;
		announce(&applied);
		Ok(())
	}

	fn applied_to_board(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		update: &[u8],
		announce: impl FnOnce(&Applied),
	) -> Result<(), LibraryError> {
		let mut held = self.held();
		let file = held.located(root, space_id, name)?;
		let name = file.name.as_str();
		let key = key(space_id, name);
		let mut loaded = None;
		let doc = match held.docs.get(&key) {
			Some(held) => held,
			None => &loaded.insert(loaded_board(root, space_id, name, &file.text)?).doc,
		};
		let change = board_change(doc, &file, update)?;
		if let Some(loaded) = loaded {
			held.docs.insert(key.clone(), loaded.doc);
			held.written_boards.insert(key.clone(), loaded.written);
		}
		announce(&Applied { name: name.to_owned(), change });
		self.board_write_scheduled(&mut held, root, key);
		Ok(())
	}

	pub(crate) fn board(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<Board, LibraryError> {
		let mut held = self.held();
		let file = held.located(root, space_id, name)?;
		let doc = held.board_doc(root, space_id, &file, &self.board_write_hooks)?;
		board::read(doc, &file.name)
	}

	pub(crate) fn edit_board<T, E: From<LibraryError>>(
		&self,
		target: &BoardTarget<'_>,
		edit: impl FnOnce(&Board) -> Result<(BoardEdit, T), E>,
		announce: impl FnOnce(&Applied),
	) -> Result<(T, Board), E> {
		let BoardTarget { root, space_id, name, writer } = *target;
		let mut held = self.held();
		let file = held.located(root, space_id, name)?;
		let doc = held.board_doc(root, space_id, &file, &self.board_write_hooks)?;
		let (board_edit, made) = edit(&board::read(doc, &file.name)?)?;
		let update = board::update_of(doc, writer, &file.name, &board_edit)?;
		let change = board_change(doc, &file, &update)?;
		let edited = board::read(doc, &file.name);
		announce(&Applied { name: file.name.clone(), change });
		self.board_write_scheduled(&mut held, root, key(space_id, &file.name));
		Ok((made, edited?))
	}

	fn board_write_scheduled(&self, held: &mut Held, root: &Path, key: Key) {
		if let Some(generation) = held.marked_pending(root, key, Instant::now()) {
			tokio::spawn(written_when_due(
				Arc::clone(&self.held),
				generation,
				self.board_write_hooks.clone(),
			));
		}
	}

	pub(crate) fn write_pending_boards(&self) {
		let mut held = self.held();
		let pending: Vec<(Key, PathBuf)> = held
			.pending_boards
			.iter()
			.map(|(key, pending)| (key.clone(), pending.root.clone()))
			.collect();
		for (key, root) in pending {
			held.board_written_or_kept_pending(&root, &key, &self.board_write_hooks);
		}
	}

	pub(crate) fn write(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		step: &WriteStep<'_>,
	) -> Result<Written, LibraryError> {
		let (applied, caret) = self.merged(root, space_id, name, |kind, doc, name| match kind {
			DocumentKind::Markdown => markdown::inserted_by(doc, name, step),
			DocumentKind::Board => Err(LibraryError::NotADocument { name: name.to_owned() }),
		})?;
		Ok(Written { name: applied.name, change: applied.change, caret })
	}

	pub(crate) fn remove(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		step: &RemoveStep<'_>,
	) -> Result<Written, LibraryError> {
		let (applied, caret) = self.merged(root, space_id, name, |kind, doc, name| match kind {
			DocumentKind::Markdown => markdown::removed_by(doc, name, step),
			DocumentKind::Board => Err(LibraryError::NotADocument { name: name.to_owned() }),
		})?;
		Ok(Written { name: applied.name, change: applied.change, caret })
	}

	pub(crate) fn spliced(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		writer: u64,
		plan: impl FnOnce(&str) -> Vec<Splice>,
	) -> Result<Applied, LibraryError> {
		let (applied, ()) = self.merged(root, space_id, name, |kind, doc, name| match kind {
			DocumentKind::Markdown => Ok((markdown::spliced_by(doc, name, writer, plan)?, ())),
			DocumentKind::Board => Err(LibraryError::NotADocument { name: name.to_owned() }),
		})?;
		Ok(applied)
	}

	fn merged<T>(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		update_of: impl FnOnce(DocumentKind, &Doc, &str) -> Result<(Vec<u8>, T), LibraryError>,
	) -> Result<(Applied, T), LibraryError> {
		let mut held = self.held();
		let file = held.located(root, space_id, name)?;
		let name = file.name.as_str();
		let key = key(space_id, name);
		let mut loaded = None;
		let doc = match held.docs.get(&key) {
			Some(held) => held,
			None => &loaded.insert(loaded_from_disk(root, space_id, name)?).doc,
		};
		let (update, made) = update_of(file.kind, doc, name)?;
		checked_on_a_copy(doc, &file, &update)?;
		let before = doc.transact().state_vector();
		file.kind.reconciled(doc, &file.text);
		merged_into(doc, name, decoded(name, &update)?)?;
		let change = doc.transact().encode_state_as_update_v1(&before);
		store_state(root, space_id, name, doc)?;
		private_files::replace_atomically(&file.path, &file.kind.exported(doc, name)?)
			.map_err(unwritable)?;
		if let Some(loaded) = loaded {
			held.docs.insert(key, loaded.doc);
		}
		Ok((Applied { name: file.name, change }, made))
	}

	pub(crate) fn rename(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		new_name: &str,
		announce: impl FnOnce(&str),
	) -> Result<String, LibraryError> {
		let mut held = self.held();
		let item = resolve(root, space_id, name)?;
		let keeps_the_kind = match (&item.accepted, accepted_type(new_name)) {
			(AcceptedType::Image { .. }, _) => {
				return Err(LibraryError::Missing { name: name.to_owned() });
			}
			(AcceptedType::Document(format), Some(AcceptedType::Document(wanted))) => {
				wanted == *format
			}
			(AcceptedType::Board, Some(AcceptedType::Board)) => true,
			_ => false,
		};
		if new_name == name {
			return Ok(name.to_owned());
		}
		if !is_plain_name(new_name) || !keeps_the_kind {
			return Err(LibraryError::InvalidName { name: new_name.to_owned() });
		}
		let landed = if is_the_item_itself(&item, &space_dir(root, space_id).join(new_name)) {
			recased(root, space_id, &item, name, new_name)?
		} else {
			relinked(root, space_id, &item, name, new_name)?
		};
		held.moved(space_id, name, &landed);
		announce(&landed);
		Ok(landed)
	}

	pub(crate) fn delete(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<(), LibraryError> {
		let mut held = self.held();
		let item = resolve(root, space_id, name)?;
		let thumbnail = match item.accepted {
			AcceptedType::Image { .. } => Some(
				thumbnails_dir(&space_dir(root, space_id)).join(thumbnail_name(name, &item.path)?),
			),
			AcceptedType::Document(_) | AcceptedType::Board => None,
		};
		fs::remove_file(&item.path).map_err(unwritable)?;
		if let Some(thumbnail) = thumbnail {
			discarded(&thumbnail);
		}
		discarded(&state_path(root, space_id, name));
		held.forgot(space_id, name);
		Ok(())
	}

	pub(crate) fn forget(&self, root: &Path, space_id: &str) -> io::Result<()> {
		let mut held = self.held();
		held.docs.retain(|(held_space_id, _), _| held_space_id != space_id);
		held.landed_names.retain(|(held_space_id, _), _| held_space_id != space_id);
		held.written_boards.retain(|(held_space_id, _), _| held_space_id != space_id);
		held.pending_boards.retain(|(held_space_id, _), _| held_space_id != space_id);
		match fs::remove_dir_all(state_dir(root, space_id)) {
			Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
			removed => removed,
		}
	}

	fn held(&self) -> MutexGuard<'_, Held> {
		locked(&self.held)
	}
}

fn locked(held: &Mutex<Held>) -> MutexGuard<'_, Held> {
	held.lock().unwrap_or_else(PoisonError::into_inner)
}

async fn written_when_due(shared: Arc<Mutex<Held>>, generation: u64, hooks: BoardWriteHooks) {
	loop {
		let Some(due) = locked(&shared).armed(generation).map(|(_, pending)| pending.due()) else {
			return;
		};
		tokio::time::sleep_until(due).await;
		let mut held = locked(&shared);
		let Some((key, pending)) = held.armed(generation) else {
			return;
		};
		if pending.due() > Instant::now() {
			continue;
		}
		let (key, root) = (key.clone(), pending.root.clone());
		held.board_written_or_kept_pending(&root, &key, &hooks);
		return;
	}
}

impl Held {
	fn synced(
		&mut self,
		root: &Path,
		space_id: &str,
		name: &str,
		kind: DocumentKind,
		file_text: &str,
	) -> Result<Opened, LibraryError> {
		let key = key(space_id, name);
		let mut loaded = None;
		let (doc, was_stored) = match self.docs.get(&key) {
			Some(held) => (held, true),
			None => {
				let loaded = loaded.insert(loaded_from_disk(root, space_id, name)?);
				(&loaded.doc, loaded.was_stored)
			}
		};
		let before = doc.transact().state_vector();
		let is_host_edited = kind.reconciled(doc, file_text);
		if is_host_edited || !was_stored {
			store_state(root, space_id, name, doc)?;
		}
		let host_edit = is_host_edited.then(|| doc.transact().encode_state_as_update_v1(&before));
		let state = full_state(doc);
		if let Some(loaded) = loaded {
			self.docs.insert(key, loaded.doc);
		}
		Ok(Opened { state, host_edit })
	}

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
			(Ok(file), Some(landed)) if file.path.ends_with(landed) => {
				document_file(root, space_id, landed)
			}
			(found, _) => found,
		}
	}

	fn board_doc(
		&mut self,
		root: &Path,
		space_id: &str,
		file: &DocumentFile,
		hooks: &BoardWriteHooks,
	) -> Result<&Doc, LibraryError> {
		if !matches!(file.kind, DocumentKind::Board) {
			return Err(LibraryError::NotABoard { name: file.name.clone() });
		}
		self.board_synced(root, space_id, file, hooks)?;
		self.docs
			.get(&key(space_id, &file.name))
			.ok_or_else(|| LibraryError::Missing { name: file.name.clone() })
	}

	fn board_synced(
		&mut self,
		root: &Path,
		space_id: &str,
		file: &DocumentFile,
		hooks: &BoardWriteHooks,
	) -> Result<Opened, LibraryError> {
		let key = key(space_id, &file.name);
		let doc = match self.docs.entry(key.clone()) {
			Entry::Occupied(held) => held.into_mut(),
			Entry::Vacant(vacant) => {
				let loaded = loaded_board(root, space_id, &file.name, &file.text)?;
				if !loaded.was_stored {
					store_state(root, space_id, &file.name, &loaded.doc)?;
				}
				self.written_boards.insert(key.clone(), loaded.written);
				vacant.insert(loaded.doc)
			}
		};
		let state = full_state(doc);
		let is_diverged = self
			.written_boards
			.get(&key)
			.is_some_and(|written| board::is_diverged(file.text.as_bytes(), written));
		if is_diverged {
			self.board_written(root, &key, hooks)?;
		}
		Ok(Opened { state, host_edit: None })
	}

	fn marked_pending(&mut self, root: &Path, key: Key, now: Instant) -> Option<u64> {
		let pending = self.pending_boards.entry(key).or_insert_with(|| PendingWrite {
			root: root.to_owned(),
			first: now,
			last: now,
			armed: None,
		});
		pending.last = now;
		if pending.armed.is_some() {
			return None;
		}
		pending.first = now;
		self.last_generation += 1;
		pending.armed = Some(self.last_generation);
		pending.armed
	}

	fn armed(&self, generation: u64) -> Option<(&Key, &PendingWrite)> {
		self.pending_boards.iter().find(|(_, pending)| pending.armed == Some(generation))
	}

	fn board_written_or_kept_pending(&mut self, root: &Path, key: &Key, hooks: &BoardWriteHooks) {
		let Err(error) = self.board_written(root, key, hooks) else {
			return;
		};
		let (space_id, name) = key;
		log::warn!(
			"the board {name} of space {space_id} was not written and stays pending: {error:?}"
		);
		if let Some(pending) = self.pending_boards.get_mut(key) {
			pending.armed = None;
		}
	}

	fn board_written(
		&mut self,
		root: &Path,
		key: &Key,
		hooks: &BoardWriteHooks,
	) -> Result<(), LibraryError> {
		let (space_id, name) = key;
		let (Some(doc), Some(written)) = (self.docs.get(key), self.written_boards.get(key)) else {
			self.pending_boards.remove(key);
			return Ok(());
		};
		let item = match resolve(root, space_id, name) {
			Err(LibraryError::Missing { .. }) => {
				self.pending_boards.remove(key);
				return Ok(());
			}
			resolved => resolved?,
		};
		let is_replaced = board::is_diverged(&read_bytes(&item, name)?, written);
		let current = board::read(doc, name)?;
		let canvas = board::canvas_of(&current, name)?;
		store_state(root, space_id, name, doc)?;
		private_files::replace_atomically(&item.path, canvas.as_bytes()).map_err(unwritable)?;
		if is_replaced {
			log::warn!(
				"the board {name} of space {space_id} changed on disk and was rewritten from its live state"
			);
			(hooks.on_file_replaced)(space_id, name);
		}
		(hooks.on_written)(space_id, name, &current);
		self.written_boards.insert(key.clone(), current);
		self.pending_boards.remove(key);
		Ok(())
	}

	fn forgot(&mut self, space_id: &str, name: &str) {
		let forgotten = key(space_id, name);
		self.docs.remove(&forgotten);
		self.written_boards.remove(&forgotten);
		self.pending_boards.remove(&forgotten);
		self.landed_names.retain(|(held_space_id, former), landed| {
			held_space_id != space_id || (former != name && landed != name)
		});
	}

	fn moved(&mut self, space_id: &str, name: &str, landed: &str) {
		let former_key = key(space_id, name);
		let landed_key = key(space_id, landed);
		rekeyed(&mut self.docs, &former_key, &landed_key);
		rekeyed(&mut self.written_boards, &former_key, &landed_key);
		rekeyed(&mut self.pending_boards, &former_key, &landed_key);
		self.landed_names.remove(&landed_key);
		for ((held_space_id, _), target) in &mut self.landed_names {
			if held_space_id == space_id && target == name {
				landed.clone_into(target);
			}
		}
		self.landed_names.insert(former_key, landed.to_owned());
	}
}

fn recased(
	root: &Path,
	space_id: &str,
	item: &ResolvedItem,
	name: &str,
	new_name: &str,
) -> Result<String, LibraryError> {
	let target = space_dir(root, space_id).join(new_name);
	moved_from(root, space_id, name, new_name, || fs::rename(&item.path, &target))
		.map_err(unwritable)?;
	Ok(new_name.to_owned())
}

fn relinked(
	root: &Path,
	space_id: &str,
	item: &ResolvedItem,
	name: &str,
	new_name: &str,
) -> Result<String, LibraryError> {
	let dir = space_dir(root, space_id);
	let landed = linked_under_free_name(&item.path, &dir, new_name)?;
	if let Err(error) = moved_from(root, space_id, name, &landed, || fs::remove_file(&item.path)) {
		discarded(&dir.join(&landed));
		return Err(unwritable(error));
	}
	Ok(landed)
}

fn moved_from(
	root: &Path,
	space_id: &str,
	name: &str,
	landed: &str,
	file_moved: impl FnOnce() -> io::Result<()>,
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
	file_moved().inspect_err(|_| {
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

fn rekeyed<V>(held: &mut HashMap<Key, V>, former_key: &Key, landed_key: &Key) {
	held.remove(landed_key);
	if let Some(value) = held.remove(former_key) {
		held.insert(landed_key.clone(), value);
	}
}

fn document_file(root: &Path, space_id: &str, name: &str) -> Result<DocumentFile, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let kind = match item.accepted {
		AcceptedType::Document(format) => DocumentKind::of(format),
		AcceptedType::Board => DocumentKind::Board,
		AcceptedType::Image { .. } => {
			return Err(LibraryError::NotADocument { name: name.to_owned() });
		}
	};
	let text = document_text(&item, name)?;
	Ok(DocumentFile { name: name.to_owned(), path: item.path, text, kind })
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

fn loaded_board(
	root: &Path,
	space_id: &str,
	name: &str,
	file_text: &str,
) -> Result<LoadedBoard, LibraryError> {
	let Loaded { doc, was_stored } = loaded_from_disk(root, space_id, name)?;
	if was_stored {
		let written = board::read(&doc, name)?;
		return Ok(LoadedBoard { doc, written, was_stored });
	}
	let (doc, written) = board::imported(file_text, name)?;
	Ok(LoadedBoard { doc, written, was_stored })
}

fn board_change(doc: &Doc, file: &DocumentFile, update: &[u8]) -> Result<Vec<u8>, LibraryError> {
	let name = file.name.as_str();
	checked_on_a_copy(doc, file, update)?;
	let before = doc.transact().state_vector();
	merged_into(doc, name, decoded(name, update)?)?;
	Ok(doc.transact().encode_state_as_update_v1(&before))
}

fn writer_of(doc: &Doc, writer: u64, name: &str) -> Result<Doc, LibraryError> {
	let copy = Doc::with_client_id(writer);
	merged_into(&copy, name, decoded(name, &full_state(doc))?)?;
	Ok(copy)
}

fn checked_on_a_copy(doc: &Doc, file: &DocumentFile, update: &[u8]) -> Result<(), LibraryError> {
	let name = file.name.as_str();
	let copy = Doc::with_client_id(doc.client_id().get());
	merged_into(&copy, name, decoded(name, &full_state(doc))?)?;
	file.kind.reconciled(&copy, &file.text);
	merged_into(&copy, name, decoded(name, update)?)?;
	file.kind.bounded(&copy, name)
}

fn full_state(doc: &Doc) -> Vec<u8> {
	doc.transact().encode_state_as_update_v1(&StateVector::default())
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
