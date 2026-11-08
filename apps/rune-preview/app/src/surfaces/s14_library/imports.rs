use std::path::{Path, PathBuf};

use kiroshi_core::library::contract::{LibraryError, LibraryImport};

use kiroshi_rune_kit::strings::common::library::failure::import;

use super::said;
use super::worker::refusal_of;
use crate::host::HostError;

const MIB: u64 = 1024 * 1024;

pub const JOINED_LIMIT: u64 = 8 * MIB;

pub const HOSTED_LIMIT: u64 = 20 * MIB;

pub struct Screened {
	pub admitted: Vec<PathBuf>,
	pub refused: Vec<(String, String)>,
}

pub fn limit_of(is_joined: bool) -> u64 {
	if is_joined { JOINED_LIMIT } else { HOSTED_LIMIT }
}

pub fn file_name_of(path: &Path) -> String {
	path.file_name()
		.map_or_else(|| path.display().to_string(), |name| name.to_string_lossy().into_owned())
}

pub fn sized(paths: &[PathBuf]) -> Vec<(PathBuf, Result<u64, String>)> {
	paths
		.iter()
		.map(|path| {
			let size = std::fs::metadata(path)
				.map(|meta| meta.len())
				.map_err(|failure| failure.to_string());
			(path.clone(), size)
		})
		.collect()
}

pub fn screened(sized: Vec<(PathBuf, Result<u64, String>)>, limit: u64) -> Screened {
	let mut screened = Screened { admitted: Vec::new(), refused: Vec::new() };
	for (path, size) in sized {
		match size {
			Ok(bytes) if bytes <= limit => screened.admitted.push(path),
			Ok(_) => screened.refused.push((file_name_of(&path), said(import::TOO_LARGE))),
			Err(failure) => {
				eprintln!("a dropped file was not read: {failure}");
				screened.refused.push((file_name_of(&path), said(import::UNREADABLE)));
			}
		}
	}
	screened
}

pub fn reason_of(refusal: &LibraryError) -> String {
	let key = match refusal {
		LibraryError::TooLarge { .. } => import::TOO_LARGE,
		LibraryError::InvalidName { .. } => import::INVALID_NAME,
		LibraryError::Unsupported { .. } => import::UNSUPPORTED,
		LibraryError::Undecodable { .. } => import::UNDECODABLE,
		LibraryError::NotUtf8 { .. } => import::NOT_UTF8,
		LibraryError::Missing { .. } => import::MISSING,
		LibraryError::Unwritable { .. } => import::UNWRITABLE,
		LibraryError::Unreadable { .. } => import::UNREADABLE,
		LibraryError::UnknownSpace { .. } => import::UNKNOWN_SPACE,
		LibraryError::Unavailable { .. } => import::UNAVAILABLE,
		LibraryError::Storage { .. } => import::STORAGE,
		_ => import::REFUSED,
	};
	said(key)
}

fn reason_of_failure(failure: &HostError) -> String {
	refusal_of(failure).map_or_else(|| said(import::GENERIC), |refusal| reason_of(&refusal))
}

pub fn refusals_of(
	names: &[String],
	imports: Result<Vec<LibraryImport>, HostError>,
) -> Vec<(String, String)> {
	let imports = match imports {
		Ok(imports) => imports,
		Err(failure) => {
			let reason = reason_of_failure(&failure);
			return names.iter().map(|name| (name.clone(), reason.clone())).collect();
		}
	};
	names
		.iter()
		.zip(imports)
		.filter_map(|(name, import)| match import {
			LibraryImport::Imported { .. } => None,
			LibraryImport::Refused { error } => Some((name.clone(), reason_of(&error))),
		})
		.collect()
}
