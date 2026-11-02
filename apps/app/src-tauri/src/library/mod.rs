pub mod commands;
pub mod contract;

use std::fs::{self, Metadata};
use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use tauri::{AppHandle, Manager, Runtime};

use contract::{
	LibraryDocument, LibraryDocumentFormat, LibraryError, LibraryItem, LibraryItemKind,
};

const DIR_NAME: &str = "library";

pub const MAX_DOCUMENT_BYTES: u64 = 5 * 1024 * 1024;

enum AcceptedType {
	Image,
	Document(LibraryDocumentFormat),
}

pub fn root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, LibraryError> {
	app.path()
		.app_data_dir()
		.map(|data| data.join(DIR_NAME))
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })
}

pub fn space_dir(root: &Path, space_id: &str) -> PathBuf {
	root.join(space_id)
}

pub fn list(root: &Path, space_id: &str) -> Result<Vec<LibraryItem>, LibraryError> {
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

pub fn read_document(
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<LibraryDocument, LibraryError> {
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
	let format = match (metadata.is_file(), accepted_type(name)) {
		(true, Some(AcceptedType::Document(format))) => format,
		(true, Some(AcceptedType::Image)) => {
			return Err(LibraryError::NotADocument { name: name.to_owned() })
		}
		_ => return Err(missing()),
	};
	if metadata.len() > MAX_DOCUMENT_BYTES {
		return Err(LibraryError::TooLarge {
			name: name.to_owned(),
			bytes: metadata.len(),
			limit: MAX_DOCUMENT_BYTES,
		});
	}
	let bytes = fs::read(&path).map_err(|error| refusal(&error, missing()))?;
	let content =
		String::from_utf8(bytes).map_err(|_| LibraryError::NotUtf8 { name: name.to_owned() })?;
	Ok(LibraryDocument { name: name.to_owned(), format, content })
}

pub fn forget_space<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let removed = root(app)
		.and_then(|root| remove_space_dir(&root, space_id).map_err(|error| unreadable(&error)));
	if let Err(error) = removed {
		log::warn!("the library of space {space_id} was left on disk: {error:?}");
	}
}

pub fn remove_space_dir(root: &Path, space_id: &str) -> io::Result<()> {
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
