pub mod commands;
pub mod contract;
pub mod scrub;
pub mod stderr_lines;

use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use log::LevelFilter;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::private_files;

pub const LOG_FILE_NAME: &str = "kiroshi";

pub const LARGEST_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;

const ROTATED_FILES_KEPT: usize = 2;

const LOG_LEVEL: LevelFilter = LevelFilter::Info;

#[cfg(unix)]
const PRIVATE_FILE_MODE: u32 = 0o600;

pub fn builder(file: TargetKind) -> tauri_plugin_log::Builder {
	tauri_plugin_log::Builder::new()
		.clear_targets()
		.target(Target::new(file))
		.level(LOG_LEVEL)
		.max_file_size(LARGEST_LOG_FILE_BYTES.into())
		.rotation_strategy(RotationStrategy::KeepSome(ROTATED_FILES_KEPT))
		.format(|out, message, record| {
			out.finish(format_args!(
				"{} {} {} {}",
				chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ"),
				record.level(),
				record.target(),
				scrub::scrubbed(&message.to_string()),
			))
		})
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
	let file = current_file(app)?;
	prepared(&file)?;
	let (plugin, level, logger) =
		builder(TargetKind::LogDir { file_name: Some(LOG_FILE_NAME.to_owned()) })
			.target(Target::new(TargetKind::Stderr))
			.split(app)?;
	app.plugin(plugin)?;
	tauri_plugin_log::attach_logger(level, Box::new(PrivateLog::new(logger, file)))?;
	Ok(())
}

pub fn current_file<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
	Ok(app.path().app_log_dir()?.join(format!("{LOG_FILE_NAME}.log")))
}

pub fn prepared(file: &Path) -> std::io::Result<()> {
	if let Some(dir) = file.parent() {
		private_files::create_dir(dir)?;
	}
	opened_private(file)?;
	kept_private(file)
}

pub struct PrivateLog {
	inner: Box<dyn log::Log>,
	file: PathBuf,
}

impl PrivateLog {
	pub fn new(inner: Box<dyn log::Log>, file: PathBuf) -> Self {
		Self { inner, file }
	}
}

impl log::Log for PrivateLog {
	fn enabled(&self, metadata: &log::Metadata) -> bool {
		self.inner.enabled(metadata)
	}

	fn log(&self, record: &log::Record) {
		self.inner.log(record);
		if let Err(failure) = kept_private(&self.file) {
			reported_beside_the_log(&failure);
		}
	}

	fn flush(&self) {
		self.inner.flush();
	}
}

fn reported_beside_the_log(failure: &std::io::Error) {
	eprintln!("the log file could not be kept private: {failure}");
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
fn kept_private(file: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	let mode = fs::metadata(file)?.permissions().mode() & 0o777;
	if mode == PRIVATE_FILE_MODE {
		return Ok(());
	}
	fs::set_permissions(file, fs::Permissions::from_mode(PRIVATE_FILE_MODE))
}

#[cfg(not(unix))]
fn kept_private(_file: &Path) -> std::io::Result<()> {
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
	let whole_lines = text.lines().skip(usize::from(skipped > 0));
	let kept: Vec<&str> = whole_lines.collect();
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

#[cfg(test)]
mod tests;
