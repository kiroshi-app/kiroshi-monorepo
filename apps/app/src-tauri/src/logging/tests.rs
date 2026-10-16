use std::fs;
use std::path::{Path, PathBuf};

use log::Log;
use tauri::test::mock_builder;
use tauri_plugin_log::TargetKind;

use super::scrub::{remember_env_values, ENV_MASK};
use super::stderr_lines::StderrLines;
use super::{builder, clear, prepared, tail, PrivateLog, LOG_FILE_NAME};
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::an_app_of_its_own;

const ROTATING_EVERY_BYTES: u128 = 400;

struct LogFolder {
	folder: RemovedOnDrop,
	logger: PrivateLog,
}

impl LogFolder {
	fn file(&self) -> PathBuf {
		self.folder.join(format!("{LOG_FILE_NAME}.log"))
	}

	fn written(&self) -> String {
		fs::read_to_string(self.file()).expect("the log file reads")
	}

	fn line(&self, text: &str) {
		self.logger.log(
			&log::Record::builder()
				.args(format_args!("{text}"))
				.level(log::Level::Info)
				.target("sidecar")
				.build(),
		);
	}

	fn names(&self) -> Vec<String> {
		let mut names: Vec<String> = fs::read_dir(&*self.folder)
			.expect("the log folder lists")
			.map(|entry| entry.expect("an entry reads").file_name().to_string_lossy().into_owned())
			.collect();
		names.sort();
		names
	}
}

fn a_log_folder(name: &str, max_file_size: u128) -> LogFolder {
	let folder = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-log-{name}-{}", uuid::Uuid::new_v4())),
	);
	a_logger_in(folder, max_file_size)
}

fn a_logger_in(folder: RemovedOnDrop, max_file_size: u128) -> LogFolder {
	let file = folder.join(format!("{LOG_FILE_NAME}.log"));
	prepared(&file).expect("the log file is prepared");
	let app = an_app_of_its_own("logging", mock_builder());
	let destination = TargetKind::Folder {
		path: folder.to_path_buf(),
		file_name: Some(LOG_FILE_NAME.to_owned()),
	};
	let (_plugin, _level, inner) = builder(destination)
		.max_file_size(max_file_size)
		.split(app.handle())
		.expect("the logger builds");
	LogFolder { folder, logger: PrivateLog::new(inner, file) }
}

#[cfg(unix)]
fn mode_of(path: &Path) -> u32 {
	use std::os::unix::fs::PermissionsExt;
	fs::metadata(path).expect("the file is there").permissions().mode() & 0o777
}

#[test]
fn a_resolved_env_value_reaches_the_log_as_its_placeholder_only() {
	let folder = a_log_folder("exact", 1 << 20);
	remember_env_values([&"log-exact-secret-value".to_owned()]);

	folder.line("the server said log-exact-secret-value twice: log-exact-secret-value");

	let written = folder.written();
	assert!(!written.contains("log-exact-secret-value"), "{written}");
	assert_eq!(written.matches(ENV_MASK).count(), 2, "{written}");
}

#[test]
fn a_resolved_env_value_split_across_two_stderr_reads_is_still_redacted() {
	let folder = a_log_folder("split", 1 << 20);
	remember_env_values([&"log-split-secret-value".to_owned()]);
	let mut lines = StderrLines::default();

	let mut assembled = lines.fed(b"connecting with log-split-sec");
	assembled.extend(lines.fed(b"ret-value now\n"));
	for line in &assembled {
		folder.line(line);
	}

	let written = folder.written();
	assert!(!written.contains("log-split"), "{written}");
	assert!(written.contains(&format!("connecting with {ENV_MASK} now")), "{written}");
}

#[test]
fn every_line_is_scrubbed_before_it_reaches_the_file() {
	let folder = a_log_folder("shapes", 1 << 20);

	folder.line("GET https://example.com/a for someone@example.com with Bearer abc");

	let written = folder.written();
	assert!(!written.contains("example.com"), "{written}");
	assert!(written.contains("Bearer [redacted]"), "{written}");
}

#[test]
fn a_debug_line_never_reaches_the_file() {
	let folder = a_log_folder("level", 1 << 20);

	folder.logger.log(
		&log::Record::builder()
			.args(format_args!("a debug detail"))
			.level(log::Level::Debug)
			.target("sidecar")
			.build(),
	);

	assert_eq!(folder.written(), "");
}

#[cfg(unix)]
#[test]
fn the_log_file_is_private_on_create_and_after_a_rotation() {
	let folder = a_log_folder("private", ROTATING_EVERY_BYTES);
	assert_eq!(mode_of(&folder.file()), 0o600);

	for turn in 0..20 {
		folder.line(&format!("turn {turn} ended outcome=Completed took_ms=1200 of a long run"));
	}

	assert!(folder.names().len() > 1, "no rotation happened: {:?}", folder.names());
	assert_eq!(mode_of(&folder.file()), 0o600);
}

#[test]
fn the_folder_keeps_at_most_three_log_files() {
	let folder = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-log-kept-{}", uuid::Uuid::new_v4())),
	);
	fs::create_dir_all(&*folder).expect("the folder is created");
	for day in 1..=5 {
		let rotated = folder.join(format!("{LOG_FILE_NAME}_2026-10-0{day}_12-00-00.log"));
		fs::write(rotated, "an older line\n").expect("a rotated file is written");
	}

	let folder = a_logger_in(folder, 1 << 20);

	assert_eq!(
		folder.names(),
		vec![
			format!("{LOG_FILE_NAME}.log"),
			format!("{LOG_FILE_NAME}_2026-10-04_12-00-00.log"),
			format!("{LOG_FILE_NAME}_2026-10-05_12-00-00.log"),
		]
	);
}

#[test]
fn the_tail_returns_at_most_the_lines_asked_for_scrubbed_again() {
	let folder = a_log_folder("tail", 1 << 20);
	for turn in 0..10 {
		folder.line(&format!("turn {turn} started"));
	}
	fs::write(folder.file(), format!("{}leaked someone@example.com\n", folder.written()))
		.expect("a raw line is appended");

	let tailed = tail(&folder.file(), 3).expect("the tail reads");

	assert_eq!(tailed.len(), 3);
	assert!(tailed[0].ends_with("turn 8 started"), "{tailed:?}");
	assert_eq!(tailed[2], "leaked [redacted]");
	assert_eq!(tail(&folder.file(), 100).expect("the tail reads").len(), 11);
}

#[test]
fn clearing_leaves_one_empty_log_file() {
	let folder = a_log_folder("clear", ROTATING_EVERY_BYTES);
	for turn in 0..20 {
		folder.line(&format!("turn {turn} ended outcome=Completed took_ms=1200 of a long run"));
	}
	assert!(folder.names().len() > 1, "no rotation happened: {:?}", folder.names());

	clear(&folder.file()).expect("the log clears");

	assert_eq!(folder.names(), vec![format!("{LOG_FILE_NAME}.log")]);
	assert_eq!(folder.written(), "");
}
