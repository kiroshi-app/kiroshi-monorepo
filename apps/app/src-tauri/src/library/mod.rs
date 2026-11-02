pub mod commands;
pub mod contract;

use std::fs::{self, Metadata};
use std::future::Future;
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use image::{ImageFormat, ImageReader, Limits};
use tauri::{AppHandle, Manager, Runtime};

use contract::{
	LibraryDocument, LibraryDocumentFormat, LibraryError, LibraryItem, LibraryItemKind,
};

const DIR_NAME: &str = "library";

const MAX_DOCUMENT_BYTES: u64 = 5 * 1024 * 1024;

const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

const MAX_DECODED_IMAGE_BYTES: u64 = 256 * 1024 * 1024;

enum AcceptedType {
	Image,
	Document(LibraryDocumentFormat),
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

fn list(root: &Path, space_id: &str) -> Result<Vec<LibraryItem>, LibraryError> {
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
		kind: match accepted {
			AcceptedType::Image => LibraryItemKind::Image,
			AcceptedType::Document(_) => LibraryItemKind::Document,
		},
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

fn read_document(root: &Path, space_id: &str, name: &str) -> Result<LibraryDocument, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let AcceptedType::Document(format) = item.accepted else {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	};
	let content = document_text(&item, name)?;
	Ok(LibraryDocument { name: name.to_owned(), format, content })
}

fn document_text(item: &ResolvedItem, name: &str) -> Result<String, LibraryError> {
	if item.bytes > MAX_DOCUMENT_BYTES {
		return Err(LibraryError::TooLarge {
			name: name.to_owned(),
			bytes: item.bytes,
			limit: MAX_DOCUMENT_BYTES,
		});
	}
	let bytes = fs::read(&item.path)
		.map_err(|error| refusal(&error, LibraryError::Missing { name: name.to_owned() }))?;
	String::from_utf8(bytes).map_err(|_| LibraryError::NotUtf8 { name: name.to_owned() })
}

fn clipboard_payload(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<ClipboardPayload, LibraryError> {
	let item = resolve(root, space_id, name)?;
	match item.accepted {
		AcceptedType::Document(_) => document_text(&item, name).map(ClipboardPayload::Text),
		AcceptedType::Image => decoded_image(&item, name),
	}
}

fn decoded_image(item: &ResolvedItem, name: &str) -> Result<ClipboardPayload, LibraryError> {
	if item.bytes > MAX_IMAGE_BYTES {
		return Err(LibraryError::TooLarge {
			name: name.to_owned(),
			bytes: item.bytes,
			limit: MAX_IMAGE_BYTES,
		});
	}
	let undecodable = |detail: String| LibraryError::Undecodable { name: name.to_owned(), detail };
	let format =
		ImageFormat::from_path(&item.path).map_err(|error| undecodable(error.to_string()))?;
	let bytes = fs::read(&item.path)
		.map_err(|error| refusal(&error, LibraryError::Missing { name: name.to_owned() }))?;
	let mut limits = Limits::no_limits();
	limits.max_alloc = Some(MAX_DECODED_IMAGE_BYTES);
	let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
	reader.limits(limits);
	let rgba = reader.decode().map_err(|error| undecodable(error.to_string()))?.into_rgba8();
	let (width, height) = rgba.dimensions();
	Ok(ClipboardPayload::Image { rgba: rgba.into_raw(), width, height })
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
	let item = resolve(root, space_id, name)?;
	let Some(destination) = choose_destination(name).await? else {
		return Ok(None);
	};
	copy_to(&item, &destination)?;
	Ok(Some(destination))
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

pub fn forget_space<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let removed = root(app)
		.and_then(|root| remove_space_dir(&root, space_id).map_err(|error| unreadable(&error)));
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
		"png" | "jpg" | "jpeg" | "gif" | "webp" => Some(AcceptedType::Image),
		"md" | "markdown" => Some(AcceptedType::Document(LibraryDocumentFormat::Markdown)),
		"txt" => Some(AcceptedType::Document(LibraryDocumentFormat::Text)),
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
mod tests;
