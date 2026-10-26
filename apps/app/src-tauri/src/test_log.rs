use std::sync::{Mutex, Once, PoisonError};

static WARNINGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

static INSTALLED: Once = Once::new();

struct Captured;

static CAPTURED: Captured = Captured;

impl log::Log for Captured {
	fn enabled(&self, metadata: &log::Metadata) -> bool {
		metadata.level() <= log::Level::Warn
	}

	fn log(&self, record: &log::Record) {
		if self.enabled(record.metadata()) {
			let line = record.args().to_string();
			WARNINGS.lock().unwrap_or_else(PoisonError::into_inner).push(line);
		}
	}

	fn flush(&self) {}
}

pub(crate) fn capturing() {
	INSTALLED.call_once(|| {
		log::set_logger(&CAPTURED).expect("no other logger is installed in the test binary");
		log::set_max_level(log::LevelFilter::Warn);
	});
}

pub(crate) fn warnings_naming(needle: &str) -> Vec<String> {
	let warnings = WARNINGS.lock().unwrap_or_else(PoisonError::into_inner);
	warnings.iter().filter(|line| line.contains(needle)).cloned().collect()
}
