use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use super::scrub;
use crate::private_files;

pub const LOG_FILE_NAME: &str = "kiroshi";

pub const LARGEST_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;

#[cfg(unix)]
const PRIVATE_FILE_MODE: u32 = 0o600;

#[cfg(unix)]
const PRIVATE_DIR_MODE: u32 = 0o700;

pub fn prepared(file: &Path) -> std::io::Result<()> {
	if let Some(dir) = file.parent() {
		private_files::create_dir(dir)?;
		kept_owner_only(dir)?;
	}
	opened_private(file)?;
	kept_private(file)
}

#[cfg(unix)]
fn opened_private(file: &Path) -> std::io::Result<fs::File> {
	use std::os::unix::fs::OpenOptionsExt;
	fs::OpenOptions::new().create(true).append(true).mode(PRIVATE_FILE_MODE).open(file)
}

#[cfg(not(unix))]
fn opened_private(file: &Path) -> std::io::Result<fs::File> {
	fs::OpenOptions::new().create(true).append(true).open(file)
}

#[cfg(unix)]
fn kept_owner_only(dir: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	fs::set_permissions(dir, fs::Permissions::from_mode(PRIVATE_DIR_MODE))
}

#[cfg(not(unix))]
fn kept_owner_only(_dir: &Path) -> std::io::Result<()> {
	Ok(())
}

#[cfg(unix)]
pub fn kept_private(file: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	let mode = fs::metadata(file)?.permissions().mode() & 0o777;
	if mode == PRIVATE_FILE_MODE {
		return Ok(());
	}
	fs::set_permissions(file, fs::Permissions::from_mode(PRIVATE_FILE_MODE))
}

#[cfg(not(unix))]
pub fn kept_private(_file: &Path) -> std::io::Result<()> {
	Ok(())
}

pub fn tail(file: &Path, lines: usize) -> std::io::Result<Vec<String>> {
	let mut opened = fs::File::open(file)?;
	let length = opened.metadata()?.len();
	let skipped = length.saturating_sub(LARGEST_LOG_FILE_BYTES);
	opened.seek(SeekFrom::Start(skipped))?;
	let mut read = Vec::new();
	opened.read_to_end(&mut read)?;
	let text = String::from_utf8_lossy(&read);
	let kept: Vec<&str> = text.lines().skip(usize::from(skipped > 0)).collect();
	let first = kept.len().saturating_sub(lines);
	Ok(kept[first..].iter().map(|line| scrub::scrubbed(line)).collect())
}

pub fn clear(file: &Path) -> std::io::Result<()> {
	prepared(file)?;
	opened_private(file)?.set_len(0)?;
	let Some(dir) = file.parent() else {
		return Ok(());
	};
	for entry in fs::read_dir(dir)? {
		let path = entry?.path();
		if is_rotated(&path) {
			fs::remove_file(&path)?;
		}
	}
	Ok(())
}

fn is_rotated(path: &Path) -> bool {
	let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
		return false;
	};
	name.starts_with(&format!("{LOG_FILE_NAME}_"))
		&& (name.ends_with(".log") || name.ends_with(".log.bak"))
}
