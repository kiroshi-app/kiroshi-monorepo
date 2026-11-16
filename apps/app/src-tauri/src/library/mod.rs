mod blocks;
mod canvas;
pub mod commands;
mod comments;
pub mod contract;
mod documents;
pub mod host;
pub mod link_preview;
pub(crate) mod presence;
mod templates;
pub(crate) mod url_import;

use std::fs::{self, Metadata};
use std::future::Future;
use std::io::{self, Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use base64::prelude::{Engine as _, BASE64_STANDARD, BASE64_URL_SAFE_NO_PAD};
use chrono::{DateTime, SecondsFormat, Utc};
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime, State};

use contract::{
	LibraryBoardFileReplaced, LibraryChanged, LibraryDocument, LibraryDocumentFormat,
	LibraryDocumentRenamed, LibraryDocumentState, LibraryDocumentUpdated, LibraryError,
	LibraryFile, LibraryImage, LibraryImport, LibraryItem, LibraryItemKind, LibraryOverwritten,
};
use documents::Documents;

pub(crate) use canvas::{create_board, rename_board, summarise_board};
use comments::{board_written, written_boards_followed};
pub(crate) use comments::{
	briefed_comment_thread, comment_agent_turns, comment_threads, fail_comment_turns_cut_by_a_quit,
	listed_comment_threads, open_comment_thread, person_calling, raised_for, reopen_comment_thread,
	reply_to_comment_thread, resolve_comment_thread, PersonHere, Said,
};
#[cfg(test)]
pub(crate) use comments::{CommentTurn, CommentTurns};

use crate::attachments::{self, attached_content, Attachments};
use crate::db;
use crate::db::repositories::messages::TranscriptError;
use crate::file_store::FileStore;
use crate::{events, private_files};

const DIR_NAME: &str = "library";

const MAX_DOCUMENT_BYTES: u64 = 5 * 1024 * 1024;

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

const MAX_DECODED_IMAGE_BYTES: u64 = 256 * 1024 * 1024;

const MAX_READ_BYTES: u64 = 10 * 1024 * 1024;

pub(crate) const MAX_RELAYED_IMPORT_BYTES: u64 = 8 * 1024 * 1024;

const THUMBNAIL_EDGE: u32 = 512;

const THUMBNAILS_DIR: &str = ".thumbnails";

const STAGED_PREFIX: &str = ".import-";

const UNTITLED: &str = "Untitled";

const MAX_TITLE_CHARS: usize = 100;

const UNSAFE_IN_A_NAME: [char; 9] = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

enum AcceptedType {
	Image { mime_type: &'static str },
	Document(LibraryDocumentFormat),
	Board,
}

impl AcceptedType {
	fn mime_type(&self) -> &'static str {
		match self {
			AcceptedType::Image { mime_type } => mime_type,
			AcceptedType::Document(LibraryDocumentFormat::Markdown) => "text/markdown",
			AcceptedType::Document(LibraryDocumentFormat::Text) => "text/plain",
			AcceptedType::Board => "application/json",
		}
	}

	fn item_kind(&self) -> LibraryItemKind {
		match self {
			AcceptedType::Image { .. } => LibraryItemKind::Image,
			AcceptedType::Document(_) => LibraryItemKind::Document,
			AcceptedType::Board => LibraryItemKind::Board,
		}
	}
}

struct ResolvedItem {
	path: PathBuf,
	accepted: AcceptedType,
	bytes: u64,
}

#[derive(Debug, PartialEq, Eq)]
enum ClipboardPayload {
	Text(String),
	Image { rgba: Vec<u8>, width: u32, height: u32 },
}

fn root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, LibraryError> {
	app.path()
		.app_data_dir()
		.map(|data| data.join(DIR_NAME))
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })
}

fn space_dir(root: &Path, space_id: &str) -> PathBuf {
	root.join(space_id)
}

pub(crate) fn list(root: &Path, space_id: &str) -> Result<Vec<LibraryItem>, LibraryError> {
	let entries = match fs::read_dir(space_dir(root, space_id)) {
		Ok(entries) => entries,
		Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
		Err(error) => return Err(unreadable(&error)),
	};
	let mut items = Vec::new();
	for entry in entries {
		let entry = entry.map_err(|error| unreadable(&error))?;
		let Ok(name) = entry.file_name().into_string() else {
			continue;
		};
		if let Some(item) = item_at(&entry.path(), name)? {
			items.push(item);
		}
	}
	items.sort_by(|a, b| b.modified_at.cmp(&a.modified_at).then_with(|| a.name.cmp(&b.name)));
	Ok(items)
}

fn item_at(path: &Path, name: String) -> Result<Option<LibraryItem>, LibraryError> {
	let Some(accepted) = accepted_type(&name) else {
		return Ok(None);
	};
	let metadata = match fs::symlink_metadata(path) {
		Ok(metadata) => metadata,
		Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
		Err(error) => return Err(unreadable(&error)),
	};
	if !metadata.is_file() {
		return Ok(None);
	}
	let modified = metadata.modified().map_err(|error| unreadable(&error))?;
	Ok(Some(LibraryItem {
		name,
		kind: accepted.item_kind(),
		path: path.to_string_lossy().into_owned(),
		bytes: metadata.len(),
		modified_at: epoch_millis(modified),
		created_at: created_where_recorded(&metadata),
	}))
}

fn resolve(root: &Path, space_id: &str, name: &str) -> Result<ResolvedItem, LibraryError> {
	let missing = || LibraryError::Missing { name: name.to_owned() };
	if !is_plain_name(name) {
		return Err(LibraryError::InvalidName { name: name.to_owned() });
	}
	let dir = space_dir(root, space_id);
	let path = dir.join(name);
	let resolved = fs::canonicalize(&path).map_err(|error| refusal(&error, missing()))?;
	let resolved_dir = fs::canonicalize(&dir).map_err(|error| refusal(&error, missing()))?;
	if resolved.parent() != Some(resolved_dir.as_path()) {
		return Err(LibraryError::InvalidName { name: name.to_owned() });
	}
	let metadata = fs::symlink_metadata(&path).map_err(|error| refusal(&error, missing()))?;
	match (metadata.is_file(), accepted_type(name)) {
		(true, Some(accepted)) => {
			Ok(ResolvedItem { path: resolved, accepted, bytes: metadata.len() })
		}
		_ => Err(missing()),
	}
}

pub(crate) fn read_document(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryDocument, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let AcceptedType::Document(format) = item.accepted else {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	};
	let content = document_text(&item, name)?;
	Ok(LibraryDocument { name: name.to_owned(), format, content })
}

fn a_document(root: &Path, space_id: &str, name: &str) -> Result<(), LibraryError> {
	match resolve(root, space_id, name)?.accepted {
		AcceptedType::Document(_) => Ok(()),
		AcceptedType::Image { .. } | AcceptedType::Board => {
			Err(LibraryError::NotADocument { name: name.to_owned() })
		}
	}
}

pub(crate) fn held_document<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
) -> Result<(), LibraryError> {
	a_document(&root(app)?, space_id, name)
}

pub(crate) fn held_document_or_board<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
) -> Result<(), LibraryError> {
	match resolve(&root(app)?, space_id, name)?.accepted {
		AcceptedType::Document(_) | AcceptedType::Board => Ok(()),
		AcceptedType::Image { .. } => Err(LibraryError::NotADocument { name: name.to_owned() }),
	}
}

fn document_text(item: &ResolvedItem, name: &str) -> Result<String, LibraryError> {
	within(name, item.bytes, MAX_DOCUMENT_BYTES)?;
	utf8_text(name, read_bytes(item, name)?)
}

fn utf8_text(name: &str, bytes: Vec<u8>) -> Result<String, LibraryError> {
	String::from_utf8(bytes).map_err(|_| LibraryError::NotUtf8 { name: name.to_owned() })
}

pub(crate) fn read_image(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryImage, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let AcceptedType::Image { mime_type } = item.accepted else {
		return Err(LibraryError::NotAnImage { name: name.to_owned() });
	};
	Ok(LibraryImage {
		name: name.to_owned(),
		mime_type: mime_type.to_owned(),
		content: encoded_content(&item, name)?,
	})
}

pub(crate) fn read_file(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryFile, LibraryError> {
	let item = resolve(root, space_id, name)?;
	Ok(LibraryFile {
		name: name.to_owned(),
		mime_type: item.accepted.mime_type().to_owned(),
		content: encoded_content(&item, name)?,
	})
}

fn encoded_content(item: &ResolvedItem, name: &str) -> Result<String, LibraryError> {
	within(name, item.bytes, MAX_READ_BYTES)?;
	Ok(BASE64_STANDARD.encode(read_bytes(item, name)?))
}

fn read_bytes(item: &ResolvedItem, name: &str) -> Result<Vec<u8>, LibraryError> {
	fs::read(&item.path)
		.map_err(|error| refusal(&error, LibraryError::Missing { name: name.to_owned() }))
}

fn within(name: &str, bytes: u64, limit: u64) -> Result<(), LibraryError> {
	if bytes > limit {
		return Err(LibraryError::TooLarge { name: name.to_owned(), bytes, limit });
	}
	Ok(())
}

fn clipboard_payload(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<ClipboardPayload, LibraryError> {
	let item = resolve(root, space_id, name)?;
	match item.accepted {
		AcceptedType::Document(_) | AcceptedType::Board => {
			document_text(&item, name).map(ClipboardPayload::Text)
		}
		AcceptedType::Image { .. } => decoded_image(&item, name),
	}
}

fn clipboard_payload_of_bytes(name: &str, content: &str) -> Result<ClipboardPayload, LibraryError> {
	let accepted = accepted_name(name)?;
	let bytes = decoded_content(name, content)?;
	let length = bytes.len() as u64;
	match accepted {
		AcceptedType::Document(_) | AcceptedType::Board => {
			within(name, length, MAX_DOCUMENT_BYTES)?;
			utf8_text(name, bytes).map(ClipboardPayload::Text)
		}
		AcceptedType::Image { .. } => {
			within(name, length, MAX_IMAGE_BYTES)?;
			decoded_pixels(name, image_format(Path::new(name), name)?, bytes)
		}
	}
}

fn decoded_image(item: &ResolvedItem, name: &str) -> Result<ClipboardPayload, LibraryError> {
	within(name, item.bytes, MAX_IMAGE_BYTES)?;
	let format = image_format(&item.path, name)?;
	decoded_pixels(name, format, read_bytes(item, name)?)
}

fn image_format(path: &Path, name: &str) -> Result<ImageFormat, LibraryError> {
	ImageFormat::from_path(path).map_err(|error| undecodable(name, error.to_string()))
}

fn decoded_pixels(
	name: &str,
	format: ImageFormat,
	bytes: Vec<u8>,
) -> Result<ClipboardPayload, LibraryError> {
	let rgba = decoded(name, format, &bytes)?.into_rgba8();
	let (width, height) = rgba.dimensions();
	Ok(ClipboardPayload::Image { rgba: rgba.into_raw(), width, height })
}

fn decoded(name: &str, format: ImageFormat, bytes: &[u8]) -> Result<DynamicImage, LibraryError> {
	let mut limits = Limits::no_limits();
	limits.max_alloc = Some(MAX_DECODED_IMAGE_BYTES);
	let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
	reader.limits(limits);
	reader.decode().map_err(|error| undecodable(name, error.to_string()))
}

fn undecodable(name: &str, detail: String) -> LibraryError {
	LibraryError::Undecodable { name: name.to_owned(), detail }
}

fn accepted_name(name: &str) -> Result<AcceptedType, LibraryError> {
	match accepted_type(name) {
		Some(accepted) if is_plain_name(name) => Ok(accepted),
		_ => Err(LibraryError::InvalidName { name: name.to_owned() }),
	}
}

fn decoded_content(name: &str, content: &str) -> Result<Vec<u8>, LibraryError> {
	BASE64_STANDARD.decode(content).map_err(|error| undecodable(name, error.to_string()))
}

async fn save<Choose, Chosen>(
	root: &Path,
	space_id: &str,
	name: &str,
	choose_destination: Choose,
) -> Result<Option<PathBuf>, LibraryError>
where
	Choose: FnOnce(&str) -> Chosen,
	Chosen: Future<Output = Result<Option<PathBuf>, LibraryError>>,
{
	resolve(root, space_id, name)?;
	let Some(destination) = choose_destination(name).await? else {
		return Ok(None);
	};
	let (root, space_id, name) = (root.to_owned(), space_id.to_owned(), name.to_owned());
	let target = destination.clone();
	tokio::task::spawn_blocking(move || {
		let item = resolve(&root, &space_id, &name)?;
		copy_to(&item, &target)
	})
	.await
	.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })??;
	Ok(Some(destination))
}

async fn save_bytes<Choose, Chosen>(
	name: &str,
	content: &str,
	choose_destination: Choose,
) -> Result<Option<PathBuf>, LibraryError>
where
	Choose: FnOnce(&str) -> Chosen,
	Chosen: Future<Output = Result<Option<PathBuf>, LibraryError>>,
{
	accepted_name(name)?;
	let bytes = decoded_content(name, content)?;
	let Some(destination) = choose_destination(name).await? else {
		return Ok(None);
	};
	let target = destination.clone();
	tokio::task::spawn_blocking(move || fs::write(target, bytes))
		.await
		.map_err(unwritable)?
		.map_err(unwritable)?;
	Ok(Some(destination))
}

fn unwritable(error: impl ToString) -> LibraryError {
	LibraryError::Unwritable { detail: error.to_string() }
}

fn copy_to(item: &ResolvedItem, destination: &Path) -> Result<(), LibraryError> {
	if is_the_item_itself(item, destination) {
		return Ok(());
	}
	fs::copy(&item.path, destination)
		.map(|_| ())
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })
}

fn is_the_item_itself(item: &ResolvedItem, destination: &Path) -> bool {
	fs::canonicalize(destination).is_ok_and(|resolved| resolved == item.path)
}

pub(crate) fn create_document(
	root: &Path,
	space_id: &str,
	name: &str,
	template_id: Option<&str>,
) -> Result<LibraryItem, LibraryError> {
	let content = match template_id {
		Some(id) => templates::markdown_of(id)?,
		None => "",
	};
	let is_markdown = matches!(
		accepted_type(name),
		Some(AcceptedType::Document(LibraryDocumentFormat::Markdown))
	);
	if !is_markdown || !is_plain_name(name) {
		return Err(LibraryError::InvalidName { name: name.to_owned() });
	}
	created(root, space_id, name, content.as_bytes())
}

fn created(
	root: &Path,
	space_id: &str,
	name: &str,
	content: &[u8],
) -> Result<LibraryItem, LibraryError> {
	let path = space_dir(root, space_id).join(name);
	private_files::write(&path, content).map_err(|error| match error.kind() {
		io::ErrorKind::AlreadyExists => LibraryError::AlreadyExists { name: name.to_owned() },
		_ => unwritable(error),
	})?;
	item_at(&path, name.to_owned())?.ok_or_else(|| LibraryError::Missing { name: name.to_owned() })
}

pub(crate) fn open_document<R: Runtime>(
	app: &AppHandle<R>,
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryDocumentState, LibraryError> {
	let opened = documents(app).open(root, space_id, name)?;
	if let Some(host_edit) = opened.host_edit {
		announce(app, space_id, name, &host_edit);
	}
	Ok(LibraryDocumentState { name: name.to_owned(), update: BASE64_STANDARD.encode(opened.state) })
}

pub(crate) fn apply_update<R: Runtime>(
	app: &AppHandle<R>,
	root: &Path,
	space_id: &str,
	name: &str,
	update: &str,
) -> Result<(), LibraryError> {
	let update = decoded_content(name, update)?;
	documents(app).apply(root, space_id, name, &update, |applied| {
		announce(app, space_id, &applied.name, &applied.change);
	})
}

pub(crate) fn rename_document<R: Runtime>(
	app: &AppHandle<R>,
	root: &Path,
	space_id: &str,
	name: &str,
	new_name: &str,
) -> Result<LibraryItem, LibraryError> {
	let landed = documents(app).rename(root, space_id, name, new_name, |landed| {
		announce_rename(app, space_id, name, landed);
	})?;
	item_at(&space_dir(root, space_id).join(&landed), landed.clone())?
		.ok_or(LibraryError::Missing { name: landed })
}

pub(crate) async fn rename_linked_document<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	root: &Path,
	space_id: &str,
	name: &str,
	new_name: &str,
) -> Result<LibraryItem, LibraryError> {
	let renamed = rename_document(app, root, space_id, name, new_name)?;
	if renamed.name != name {
		database
			.library()
			.item_renamed(space_id.to_owned(), name.to_owned(), renamed.name.clone())
			.await?;
	}
	Ok(renamed)
}

struct AttachedImage {
	name: String,
	bytes: Vec<u8>,
}

pub(crate) async fn save_message<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	conversation_id: &str,
	message_id: &str,
) -> Result<LibraryItem, LibraryError> {
	let space_id = database.conversations().space(conversation_id.to_owned()).await?;
	let message = database
		.messages()
		.message(conversation_id.to_owned(), message_id.to_owned())
		.await
		.map_err(unread_message)?;
	let (Some(space_id), Some(message)) = (space_id, message) else {
		return Err(LibraryError::UnknownMessage {
			conversation_id: conversation_id.to_owned(),
			message_id: message_id.to_owned(),
		});
	};
	let attached = attached_content(&message.content);
	let text = attached.text.to_owned();
	let images = attached_images(app, conversation_id, &attached.paths)?;
	let root = root(app)?;
	let landed_in = space_id.clone();
	let saved =
		tokio::task::spawn_blocking(move || saved_as_document(&root, &landed_in, &text, &images))
			.await
			.map_err(unwritable)??;
	announce_change(app, &space_id);
	Ok(saved)
}

fn unread_message(error: TranscriptError) -> LibraryError {
	match error {
		TranscriptError::Database(failure) => failure.into(),
		refused => LibraryError::Unreadable { detail: format!("{refused:?}") },
	}
}

fn attached_images<R: Runtime>(
	app: &AppHandle<R>,
	conversation_id: &str,
	paths: &[PathBuf],
) -> Result<Vec<AttachedImage>, LibraryError> {
	let images: Vec<&PathBuf> = paths.iter().filter(|path| is_an_image(path)).collect();
	if images.is_empty() {
		return Ok(Vec::new());
	}
	let store = Attachments::dir(app).ok_or_else(|| LibraryError::Unreadable {
		detail: "there is no application data directory holding attachments".to_owned(),
	})?;
	images
		.into_iter()
		.map(|path| {
			let bytes =
				attachments::read_stored(&store, conversation_id, path).map_err(|rejection| {
					LibraryError::Unreadable { detail: format!("{rejection:?}") }
				})?;
			Ok(AttachedImage { name: file_name_of(path), bytes })
		})
		.collect()
}

fn is_an_image(path: &Path) -> bool {
	matches!(accepted_type(&file_name_of(path)), Some(AcceptedType::Image { .. }))
}

fn file_name_of(path: &Path) -> String {
	path.file_name().unwrap_or_default().to_string_lossy().into_owned()
}

fn saved_as_document(
	root: &Path,
	space_id: &str,
	text: &str,
	images: &[AttachedImage],
) -> Result<LibraryItem, LibraryError> {
	let title = document_title(text);
	let mut copied: Vec<LibraryItem> = Vec::with_capacity(images.len());
	let saved = images
		.iter()
		.try_for_each(|image| {
			copied.push(copied_image(root, space_id, &title, image)?);
			Ok::<(), LibraryError>(())
		})
		.and_then(|()| {
			let content = with_images(text, &copied);
			let markdown = AcceptedType::Document(LibraryDocumentFormat::Markdown);
			let name = format!("{title}.md");
			imported(root, space_id, &name, &markdown, content.as_bytes(), import_limit)
		});
	if saved.is_err() {
		copied.iter().for_each(|image| withdrawn(root, space_id, image));
	}
	saved
}

fn copied_image(
	root: &Path,
	space_id: &str,
	title: &str,
	image: &AttachedImage,
) -> Result<LibraryItem, LibraryError> {
	let accepted = accepted_name(&image.name)?;
	let extension = Path::new(&image.name).extension().unwrap_or_default().to_string_lossy();
	let name = format!("{title}.{}", extension.to_ascii_lowercase());
	imported(root, space_id, &name, &accepted, &image.bytes, import_limit)
}

fn withdrawn(root: &Path, space_id: &str, image: &LibraryItem) {
	let path = Path::new(&image.path);
	match thumbnail_name(&image.name, path) {
		Ok(file) => discarded(&thumbnails_dir(&space_dir(root, space_id)).join(file)),
		Err(error) => log::warn!("the thumbnail of a withdrawn library image was kept: {error:?}"),
	}
	discarded(path);
}

fn with_images(text: &str, images: &[LibraryItem]) -> String {
	std::iter::once(text.trim_end().to_owned())
		.chain(images.iter().map(|image| format!("![](<{}>)", image.name)))
		.filter(|part| !part.is_empty())
		.collect::<Vec<_>>()
		.join("\n\n")
}

fn document_title(text: &str) -> String {
	let lines = || text.lines().map(str::trim);
	lines()
		.find_map(heading_text)
		.or_else(|| lines().find(|line| !line.is_empty()))
		.map(name_safe)
		.filter(|title| !title.is_empty())
		.unwrap_or_else(|| UNTITLED.to_owned())
}

fn heading_text(line: &str) -> Option<&str> {
	let text = line.trim_start_matches('#');
	let level = line.len() - text.len();
	let is_heading = (1..=6).contains(&level) && text.starts_with([' ', '\t']);
	let text = text.trim().trim_end_matches('#').trim_end();
	(is_heading && !text.is_empty()).then_some(text)
}

fn name_safe(title: &str) -> String {
	let spaced: String = title
		.chars()
		.map(|c| match c.is_control() || UNSAFE_IN_A_NAME.contains(&c) {
			true => ' ',
			false => c,
		})
		.collect();
	let words = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
	let cut: String = words.trim_matches('.').chars().take(MAX_TITLE_CHARS).collect();
	cut.trim_end().trim_end_matches('.').to_owned()
}

pub(crate) async fn delete_item<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<(), LibraryError> {
	documents(app).delete(root, space_id, name)?;
	announce_change(app, space_id);
	database.library().item_deleted(space_id.to_owned(), name.to_owned()).await?;
	Ok(())
}

fn announce_change<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	announced(app, LibraryChanged { space_id: space_id.to_owned(), overwritten: None });
}

fn announce_overwrite<R: Runtime>(app: &AppHandle<R>, space_id: &str, item: &LibraryItem) {
	let overwritten = LibraryOverwritten { name: item.name.clone(), modified_at: item.modified_at };
	announced(
		app,
		LibraryChanged { space_id: space_id.to_owned(), overwritten: Some(overwritten) },
	);
}

fn announced<R: Runtime>(app: &AppHandle<R>, changed: LibraryChanged) {
	let space_id = changed.space_id.clone();
	if let Err(error) = events::emit(app, events::LIBRARY_CHANGED, changed) {
		log::warn!("a change of the library of space {space_id} was not announced: {error}");
	}
}

fn announce_rename<R: Runtime>(app: &AppHandle<R>, space_id: &str, former_name: &str, name: &str) {
	let renamed = LibraryDocumentRenamed {
		space_id: space_id.to_owned(),
		former_name: former_name.to_owned(),
		name: name.to_owned(),
	};
	if let Err(error) = events::emit(app, events::LIBRARY_DOCUMENT_RENAMED, renamed) {
		log::warn!("a rename of a library document of space {space_id} was not announced: {error}");
	}
}

fn announce<R: Runtime>(app: &AppHandle<R>, space_id: &str, name: &str, update: &[u8]) {
	let updated = LibraryDocumentUpdated {
		space_id: space_id.to_owned(),
		name: name.to_owned(),
		update: BASE64_STANDARD.encode(update),
	};
	if let Err(error) = events::emit(app, events::LIBRARY_DOCUMENT_UPDATED, updated) {
		log::warn!(
			"an update of a library document of space {space_id} was not announced: {error}"
		);
	}
}

fn announce_board_file_replaced<R: Runtime>(app: &AppHandle<R>, space_id: &str, name: &str) {
	let replaced =
		LibraryBoardFileReplaced { space_id: space_id.to_owned(), name: name.to_owned() };
	if let Err(error) = events::emit(app, events::LIBRARY_BOARD_FILE_REPLACED, replaced) {
		log::warn!("a rewritten board file of space {space_id} was not announced: {error}");
	}
}

fn documents<R: Runtime>(app: &AppHandle<R>) -> State<'_, Documents> {
	if app.try_state::<Documents>().is_none() {
		let (announcing, commented) = (app.clone(), app.clone());
		app.manage(Documents::new(
			move |space_id, name| announce_board_file_replaced(&announcing, space_id, name),
			move |space_id, name, board| board_written(&commented, space_id, name, board),
		));
	}
	app.state::<Documents>()
}

pub fn write_pending_boards<R: Runtime>(app: &AppHandle<R>) {
	if let Some(documents) = app.try_state::<Documents>() {
		documents.write_pending_boards();
		tauri::async_runtime::block_on(written_boards_followed(app));
	}
}

pub(crate) fn import(
	root: &Path,
	space_id: &str,
	name: &str,
	content: &str,
) -> Result<LibraryItem, LibraryError> {
	let accepted = importable(name)?;
	encoded_within(name, content, relayed_import_limit(&accepted))?;
	let bytes = decoded_content(name, content)?;
	imported(root, space_id, name, &accepted, &bytes, relayed_import_limit)
}

fn encoded_within(name: &str, content: &str, limit: u64) -> Result<(), LibraryError> {
	if content.len() as u64 <= limit.div_ceil(3) * 4 {
		return Ok(());
	}
	let unpadded = content.trim_end_matches('=').len() as u64;
	Err(LibraryError::TooLarge { name: name.to_owned(), bytes: unpadded * 3 / 4, limit })
}

pub(crate) fn import_paths(root: &Path, space_id: &str, paths: &[PathBuf]) -> Vec<LibraryImport> {
	paths
		.iter()
		.map(|path| match import_path(root, space_id, path) {
			Ok(item) => LibraryImport::Imported { item },
			Err(error) => LibraryImport::Refused { error },
		})
		.collect()
}

fn import_path(root: &Path, space_id: &str, path: &Path) -> Result<LibraryItem, LibraryError> {
	let file = produced_file(path)?;
	imported(root, space_id, &file.name, &file.accepted, &file.bytes, import_limit)
}

struct ProducedFile {
	name: String,
	accepted: AcceptedType,
	bytes: Vec<u8>,
}

fn produced_file(path: &Path) -> Result<ProducedFile, LibraryError> {
	let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
	let accepted = importable(&name)?;
	let missing = || LibraryError::Missing { name: name.clone() };
	let metadata = fs::metadata(path).map_err(|error| refusal(&error, missing()))?;
	within(&name, metadata.len(), import_limit(&accepted))?;
	let bytes = fs::read(path).map_err(|error| refusal(&error, missing()))?;
	Ok(ProducedFile { name, accepted, bytes })
}

#[derive(Debug)]
pub(crate) enum OverwriteRefusal {
	Library(LibraryError),
	FormatMismatch { name: String, mime_type: &'static str, produced_mime_type: &'static str },
}

impl From<LibraryError> for OverwriteRefusal {
	fn from(error: LibraryError) -> Self {
		Self::Library(error)
	}
}

pub(crate) fn overwrite_path<R: Runtime>(
	app: &AppHandle<R>,
	root: &Path,
	space_id: &str,
	path: &Path,
	name: &str,
) -> Result<LibraryItem, OverwriteRefusal> {
	let file = produced_file(path)?;
	let target = resolve(root, space_id, name)?;
	match (file.accepted, target.accepted) {
		(
			AcceptedType::Image { mime_type: produced_mime_type },
			AcceptedType::Image { mime_type },
		) if produced_mime_type != mime_type => {
			return Err(OverwriteRefusal::FormatMismatch {
				name: name.to_owned(),
				mime_type,
				produced_mime_type,
			});
		}
		(AcceptedType::Image { .. }, AcceptedType::Image { .. }) => {
			let thumbnail = thumbnail_of(name, image_format(&target.path, name)?, &file.bytes)?;
			documents(app).overwrite_image(root, space_id, name, &file.bytes, &thumbnail)?;
		}
		(AcceptedType::Document(_), AcceptedType::Document(_)) => {
			let text = utf8_text(&file.name, file.bytes)?;
			let opened = documents(app).overwrite_document(root, space_id, name, &text)?;
			if let Some(host_edit) = opened.host_edit {
				announce(app, space_id, name, &host_edit);
			}
		}
		(AcceptedType::Image { .. }, AcceptedType::Document(_)) => {
			return Err(LibraryError::NotAnImage { name: name.to_owned() }.into());
		}
		(AcceptedType::Document(_), AcceptedType::Image { .. }) => {
			return Err(LibraryError::NotADocument { name: name.to_owned() }.into());
		}
		(_, AcceptedType::Board) | (AcceptedType::Board, _) => {
			return Err(LibraryError::Unsupported { name: name.to_owned() }.into());
		}
	}
	let item = item_at(&space_dir(root, space_id).join(name), name.to_owned())?
		.ok_or_else(|| LibraryError::Missing { name: name.to_owned() })?;
	announce_overwrite(app, space_id, &item);
	Ok(item)
}

pub(crate) fn read_picked_image(path: &Path) -> Result<LibraryImage, LibraryError> {
	let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
	let accepted = importable(&name)?;
	let AcceptedType::Image { mime_type } = accepted else {
		return Err(LibraryError::NotAnImage { name });
	};
	let limit = relayed_import_limit(&accepted);
	let missing = || LibraryError::Missing { name: name.clone() };
	let metadata = fs::metadata(path).map_err(|error| refusal(&error, missing()))?;
	if !metadata.is_file() {
		return Err(LibraryError::Unreadable { detail: format!("{name} is not a regular file") });
	}
	within(&name, metadata.len(), limit)?;
	let file = fs::File::open(path).map_err(|error| refusal(&error, missing()))?;
	let bytes = bytes_within(&name, file, limit)?;
	Ok(LibraryImage {
		name,
		mime_type: mime_type.to_owned(),
		content: BASE64_STANDARD.encode(bytes),
	})
}

fn bytes_within(name: &str, content: impl Read, limit: u64) -> Result<Vec<u8>, LibraryError> {
	let mut bytes = Vec::new();
	content.take(limit + 1).read_to_end(&mut bytes).map_err(|error| unreadable(&error))?;
	within(name, bytes.len() as u64, limit)?;
	Ok(bytes)
}

fn importable(name: &str) -> Result<AcceptedType, LibraryError> {
	if !is_plain_name(name) || name.starts_with('.') {
		return Err(LibraryError::InvalidName { name: name.to_owned() });
	}
	accepted_type(name).ok_or_else(|| LibraryError::Unsupported { name: name.to_owned() })
}

fn import_limit(accepted: &AcceptedType) -> u64 {
	match accepted {
		AcceptedType::Image { .. } => MAX_IMAGE_BYTES,
		AcceptedType::Document(_) | AcceptedType::Board => MAX_DOCUMENT_BYTES,
	}
}

fn relayed_import_limit(accepted: &AcceptedType) -> u64 {
	import_limit(accepted).min(MAX_RELAYED_IMPORT_BYTES)
}

fn imported(
	root: &Path,
	space_id: &str,
	name: &str,
	accepted: &AcceptedType,
	bytes: &[u8],
	limit_of: fn(&AcceptedType) -> u64,
) -> Result<LibraryItem, LibraryError> {
	within(name, bytes.len() as u64, limit_of(accepted))?;
	let thumbnail = match accepted {
		AcceptedType::Image { .. } => {
			Some(thumbnail_of(name, image_format(Path::new(name), name)?, bytes)?)
		}
		AcceptedType::Document(_) | AcceptedType::Board => {
			std::str::from_utf8(bytes)
				.map_err(|_| LibraryError::NotUtf8 { name: name.to_owned() })?;
			None
		}
	};
	let dir = space_dir(root, space_id);
	fs::create_dir_all(&dir).map_err(unwritable)?;
	let landed_name = landed(&dir, name, bytes)?;
	let path = dir.join(&landed_name);
	let listed = thumbnail
		.map_or(Ok(()), |png| {
			stored_thumbnail(&thumbnails_dir(&dir), &thumbnail_name(&landed_name, &path)?, &png)
		})
		.and_then(|()| item_at(&path, landed_name.clone()))
		.and_then(|item| item.ok_or(LibraryError::Missing { name: landed_name }));
	if listed.is_err() {
		discarded(&path);
	}
	listed
}

fn landed(dir: &Path, name: &str, bytes: &[u8]) -> Result<String, LibraryError> {
	let staged = staged_path(dir);
	let landed =
		staged_with(&staged, bytes).and_then(|()| linked_under_free_name(&staged, dir, name));
	discarded(&staged);
	landed
}

fn staged_path(dir: &Path) -> PathBuf {
	dir.join(format!("{STAGED_PREFIX}{}", uuid::Uuid::new_v4()))
}

fn staged_with(staged: &Path, bytes: &[u8]) -> Result<(), LibraryError> {
	let mut file =
		fs::OpenOptions::new().write(true).create_new(true).open(staged).map_err(unwritable)?;
	file.write_all(bytes).and_then(|()| file.sync_all()).map_err(unwritable)
}

fn linked_under_free_name(staged: &Path, dir: &Path, name: &str) -> Result<String, LibraryError> {
	let mut copy = 1;
	loop {
		let candidate = numbered(name, copy);
		match fs::hard_link(staged, dir.join(&candidate)) {
			Ok(()) => return Ok(candidate),
			Err(error) if error.kind() == io::ErrorKind::AlreadyExists => copy += 1,
			Err(error) => return Err(unwritable(error)),
		}
	}
}

fn numbered(name: &str, copy: u32) -> String {
	match (copy, name.rsplit_once('.')) {
		(1, _) => name.to_owned(),
		(_, Some((stem, extension))) => format!("{stem} ({copy}).{extension}"),
		(_, None) => format!("{name} ({copy})"),
	}
}

fn discarded(path: &Path) {
	match fs::remove_file(path) {
		Err(error) if error.kind() != io::ErrorKind::NotFound => {
			let name = path.file_name().unwrap_or_default().to_string_lossy();
			log::warn!("the library left {name} on disk: {error}");
		}
		_ => {}
	}
}

pub(crate) fn read_thumbnail(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryImage, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let AcceptedType::Image { .. } = item.accepted else {
		return Err(LibraryError::NotAnImage { name: name.to_owned() });
	};
	let thumbnails = thumbnails_dir(&space_dir(root, space_id));
	let file = thumbnail_name(name, &item.path)?;
	let png = match fs::read(thumbnails.join(&file)) {
		Ok(png) => png,
		Err(error) if error.kind() == io::ErrorKind::NotFound => {
			within(name, item.bytes, MAX_IMAGE_BYTES)?;
			let png =
				thumbnail_of(name, image_format(&item.path, name)?, &read_bytes(&item, name)?)?;
			stored_thumbnail(&thumbnails, &file, &png)?;
			png
		}
		Err(error) => return Err(unreadable(&error)),
	};
	Ok(LibraryImage {
		name: name.to_owned(),
		mime_type: "image/png".to_owned(),
		content: BASE64_STANDARD.encode(png),
	})
}

fn thumbnail_of(name: &str, format: ImageFormat, bytes: &[u8]) -> Result<Vec<u8>, LibraryError> {
	let image = decoded(name, format, bytes)?;
	let image = if image.width().max(image.height()) > THUMBNAIL_EDGE {
		image.resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, FilterType::Triangle)
	} else {
		image
	};
	let mut png = Vec::new();
	image.write_to(&mut Cursor::new(&mut png), ImageFormat::Png).map_err(unwritable)?;
	Ok(png)
}

fn thumbnails_dir(space_dir: &Path) -> PathBuf {
	space_dir.join(THUMBNAILS_DIR)
}

fn thumbnail_name(name: &str, image: &Path) -> Result<String, LibraryError> {
	let modified = fs::metadata(image)
		.and_then(|metadata| metadata.modified())
		.map_err(|error| refusal(&error, LibraryError::Missing { name: name.to_owned() }))?;
	let stamp = DateTime::<Utc>::from(modified).to_rfc3339_opts(SecondsFormat::Nanos, true);
	let key = Sha256::new().chain_update(name).chain_update([0]).chain_update(stamp).finalize();
	Ok(format!("{}.png", BASE64_URL_SAFE_NO_PAD.encode(key)))
}

fn stored_thumbnail(thumbnails: &Path, file: &str, png: &[u8]) -> Result<(), LibraryError> {
	fs::create_dir_all(thumbnails).map_err(unwritable)?;
	let staged = staged_path(thumbnails);
	let stored = staged_with(&staged, png)
		.and_then(|()| fs::rename(&staged, thumbnails.join(file)).map_err(unwritable));
	if stored.is_err() {
		discarded(&staged);
	}
	stored
}

pub fn forget_space<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let removed = root(app).and_then(|root| {
		documents(app).forget(&root, space_id).map_err(|error| unreadable(&error))?;
		remove_space_dir(&root, space_id).map_err(|error| unreadable(&error))
	});
	if let Err(error) = removed {
		log::warn!("the library of space {space_id} was left on disk: {error:?}");
	}
}

fn remove_space_dir(root: &Path, space_id: &str) -> io::Result<()> {
	match fs::remove_dir_all(space_dir(root, space_id)) {
		Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
		removed => removed,
	}
}

fn accepted_type(name: &str) -> Option<AcceptedType> {
	if name.starts_with('.') {
		return None;
	}
	let extension = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
	match extension.as_str() {
		"png" => Some(AcceptedType::Image { mime_type: "image/png" }),
		"jpg" | "jpeg" => Some(AcceptedType::Image { mime_type: "image/jpeg" }),
		"gif" => Some(AcceptedType::Image { mime_type: "image/gif" }),
		"webp" => Some(AcceptedType::Image { mime_type: "image/webp" }),
		"md" | "markdown" => Some(AcceptedType::Document(LibraryDocumentFormat::Markdown)),
		"txt" => Some(AcceptedType::Document(LibraryDocumentFormat::Text)),
		"canvas" => Some(AcceptedType::Board),
		_ => None,
	}
}

fn is_plain_name(name: &str) -> bool {
	!name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', '\0'])
}

fn refusal(error: &io::Error, when_absent: LibraryError) -> LibraryError {
	match error.kind() {
		io::ErrorKind::NotFound => when_absent,
		_ => unreadable(error),
	}
}

fn unreadable(error: &io::Error) -> LibraryError {
	LibraryError::Unreadable { detail: error.to_string() }
}

fn epoch_millis(time: SystemTime) -> i64 {
	DateTime::<Utc>::from(time).timestamp_millis()
}

fn created_where_recorded(metadata: &Metadata) -> Option<i64> {
	metadata.created().ok().map(epoch_millis)
}

#[cfg(test)]
pub(crate) mod tests;
