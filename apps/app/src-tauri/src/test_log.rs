use std::sync::{Mutex, Once, PoisonError};
use std::time::Duration;

const POLL_EVERY: Duration = Duration::from_millis(10);

const PATIENCE: Duration = Duration::from_secs(60);

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

pub(crate) async fn warnings_naming(needle: &str) -> Vec<String> {
	let awaited = async {
		loop {
			let named = named_in_warnings(needle);
			if !named.is_empty() {
				return named;
			}
			tokio::time::sleep(POLL_EVERY).await;
		}
	};
	tokio::time::timeout(PATIENCE, awaited)
		.await
		.unwrap_or_else(|_| panic!("no warning named {needle} within {PATIENCE:?}"))
}

fn named_in_warnings(needle: &str) -> Vec<String> {
	let warnings = WARNINGS.lock().unwrap_or_else(PoisonError::into_inner);
	warnings.iter().filter(|line| line.contains(needle)).cloned().collect()
}
