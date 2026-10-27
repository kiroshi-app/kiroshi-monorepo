use std::fs;
use std::path::Path;

#[cfg(unix)]
const DIR_MODE: u32 = 0o700;
#[cfg(unix)]
const FILE_MODE: u32 = 0o600;

pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if let Some(dir) = path.parent() {
		create_dir(dir)?;
	}
	create_owned(path, bytes)
}

pub fn replace(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if let Some(dir) = path.parent() {
		create_dir(dir)?;
	}
	replace_owned(path, bytes)
}

pub fn replace_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	replace_atomically_with(path, |file| written_whole(file, bytes))
}

pub fn replace_atomically_with(
	path: &Path,
	fill: impl FnOnce(&mut fs::File) -> std::io::Result<()>,
) -> std::io::Result<()> {
	let dir = path.parent().ok_or_else(|| std::io::Error::other("the file has no directory"))?;
	create_dir(dir)?;
	let staged = dir.join(staged_name());
	let renamed = filled_and_synced(&staged, fill).and_then(|()| fs::rename(&staged, path));
	if renamed.is_err() {
		let _ = fs::remove_file(&staged);
	}
	renamed
}

fn staged_name() -> String {
	use std::sync::atomic::{AtomicU64, Ordering};
	static NEXT: AtomicU64 = AtomicU64::new(0);
	format!(".staged-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
}

fn filled_and_synced(
	path: &Path,
	fill: impl FnOnce(&mut fs::File) -> std::io::Result<()>,
) -> std::io::Result<()> {
	let mut file = created_owned_file(path)?;
	fill(&mut file)?;
	file.sync_all()
}

fn written_whole(file: &mut fs::File, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;

	if interrupted() {
		file.write_all(&bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	file.write_all(bytes)
}

#[cfg(unix)]
fn created_owned_file(path: &Path) -> std::io::Result<fs::File> {
	use std::os::unix::fs::OpenOptionsExt;
	fs::OpenOptions::new().write(true).create_new(true).mode(FILE_MODE).open(path)
}

#[cfg(not(unix))]
fn created_owned_file(path: &Path) -> std::io::Result<fs::File> {
	fs::OpenOptions::new().write(true).create_new(true).open(path)
}

#[cfg(unix)]
fn replace_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;
	use std::os::unix::fs::OpenOptionsExt;

	let mut file = fs::OpenOptions::new()
		.write(true)
		.create(true)
		.truncate(true)
		.mode(FILE_MODE)
		.open(path)?;
	file.write_all(bytes)
}

#[cfg(not(unix))]
fn replace_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	fs::write(path, bytes)
}

#[cfg(unix)]
pub fn create_dir(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::DirBuilderExt;
	fs::DirBuilder::new().recursive(true).mode(DIR_MODE).create(path)
}

#[cfg(not(unix))]
pub fn create_dir(path: &Path) -> std::io::Result<()> {
	fs::create_dir_all(path)
}

#[cfg(unix)]
fn create_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;

	let mut file = created_owned_file(path)?;
	if interrupted() {
		file.write_all(&bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	file.write_all(bytes)
}

#[cfg(not(unix))]
fn create_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if interrupted() {
		fs::write(path, &bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	fs::write(path, bytes)
}

fn stopped_partway() -> std::io::Error {
	std::io::Error::other("the write stopped partway")
}

#[cfg(test)]
thread_local! {
	static WRITES_BEFORE_INTERRUPT: std::cell::Cell<Option<usize>> =
		const { std::cell::Cell::new(None) };
}

#[cfg(test)]
pub fn interrupt_the_write_after(writes: usize) {
	WRITES_BEFORE_INTERRUPT.with(|left| left.set(Some(writes)));
}

#[cfg(test)]
fn interrupted() -> bool {
	WRITES_BEFORE_INTERRUPT.with(|left| match left.get() {
		Some(0) => {
			left.set(None);
			true
		}
		Some(remaining) => {
			left.set(Some(remaining - 1));
			false
		}
		None => false,
	})
}

#[cfg(not(test))]
fn interrupted() -> bool {
	false
}
