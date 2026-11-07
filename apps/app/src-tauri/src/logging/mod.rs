pub mod commands;
pub use kiroshi_core::logging::contract;
pub use kiroshi_core::logging::scrub;
pub use kiroshi_core::logging::stderr_lines;

use std::path::PathBuf;

use log::LevelFilter;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub use kiroshi_core::logging::commands::HostFacts;
pub use kiroshi_core::logging::files::{
	clear, kept_private, prepared, tail, LARGEST_LOG_FILE_BYTES, LOG_FILE_NAME,
};

const ROTATED_FILES_KEPT: usize = 2;

const LOG_LEVEL: LevelFilter = LevelFilter::Info;

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
	tauri_plugin_log::attach_logger(level, Box::new(PrivateLog { inner: logger, file }))?;
	Ok(())
}

pub fn current_file<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
	Ok(app.path().app_log_dir()?.join(format!("{LOG_FILE_NAME}.log")))
}

pub fn host_facts<R: Runtime>(app: &AppHandle<R>) -> HostFacts {
	let log_file = current_file(app)
		.inspect_err(|failure| log::warn!("the log file location did not resolve: {failure}"))
		.ok();
	HostFacts {
		app_version: app.package_info().version.to_string(),
		git_commit: env!("KIROSHI_GIT_COMMIT").to_owned(),
		os_name: tauri_plugin_os::type_().to_string(),
		os_build: tauri_plugin_os::version().to_string(),
		arch: tauri_plugin_os::arch().to_owned(),
		log_file,
	}
}

pub struct PrivateLog {
	inner: Box<dyn log::Log>,
	file: PathBuf,
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

#[cfg(test)]
mod tests;
