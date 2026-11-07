use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::contract::{LibraryDocumentFormat, LibraryError, LibraryItemKind};
use crate::core_context::Core;

pub const DIR_NAME: &str = "library";

pub enum AcceptedType {
	Image { mime_type: &'static str },
	Document(LibraryDocumentFormat),
	Board,
}

impl AcceptedType {
	pub fn mime_type(&self) -> &'static str {
		match self {
			AcceptedType::Image { mime_type } => mime_type,
			AcceptedType::Document(LibraryDocumentFormat::Markdown) => "text/markdown",
			AcceptedType::Document(LibraryDocumentFormat::Text) => "text/plain",
			AcceptedType::Board => "application/json",
		}
	}

	pub fn item_kind(&self) -> LibraryItemKind {
		match self {
			AcceptedType::Image { .. } => LibraryItemKind::Image,
			AcceptedType::Document(_) => LibraryItemKind::Document,
			AcceptedType::Board => LibraryItemKind::Board,
		}
	}
}

pub struct ResolvedItem {
	pub path: PathBuf,
	pub accepted: AcceptedType,
	pub bytes: u64,
}

pub fn root(core: &Core) -> Result<PathBuf, LibraryError> {
	Ok(core.data_dir().join(DIR_NAME))
}

pub fn space_dir(root: &Path, space_id: &str) -> PathBuf {
	root.join(space_id)
}

pub fn resolve(root: &Path, space_id: &str, name: &str) -> Result<ResolvedItem, LibraryError> {
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

pub fn a_document(root: &Path, space_id: &str, name: &str) -> Result<(), LibraryError> {
	match resolve(root, space_id, name)?.accepted {
		AcceptedType::Document(_) => Ok(()),
		AcceptedType::Image { .. } | AcceptedType::Board => {
			Err(LibraryError::NotADocument { name: name.to_owned() })
		}
	}
}

pub fn held_document(core: &Core, space_id: &str, name: &str) -> Result<(), LibraryError> {
	a_document(&root(core)?, space_id, name)
}

pub fn held_document_or_board(core: &Core, space_id: &str, name: &str) -> Result<(), LibraryError> {
	match resolve(&root(core)?, space_id, name)?.accepted {
		AcceptedType::Document(_) | AcceptedType::Board => Ok(()),
		AcceptedType::Image { .. } => Err(LibraryError::NotADocument { name: name.to_owned() }),
	}
}

pub fn accepted_type(name: &str) -> Option<AcceptedType> {
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

pub fn is_plain_name(name: &str) -> bool {
	!name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', '\0'])
}

pub fn refusal(error: &io::Error, when_absent: LibraryError) -> LibraryError {
	match error.kind() {
		io::ErrorKind::NotFound => when_absent,
		_ => unreadable(error),
	}
}

pub fn unreadable(error: &io::Error) -> LibraryError {
	LibraryError::Unreadable { detail: error.to_string() }
}
