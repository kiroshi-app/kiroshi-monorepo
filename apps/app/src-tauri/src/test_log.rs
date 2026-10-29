use std::sync::{Mutex, Once, PoisonError};
use std::time::Duration;

const POLL_EVERY: Duration = Duration::from_millis(10);

const PATIENCE: Duration = Duration::from_secs(60);

static WARNINGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

static INFOS: Mutex<Vec<String>> = Mutex::new(Vec::new());

static INSTALLED: Once = Once::new();

struct Captured;

static CAPTURED: Captured = Captured;

impl log::Log for Captured {
	fn enabled(&self, metadata: &log::Metadata) -> bool {
		metadata.level() <= log::Level::Info
	}

	fn log(&self, record: &log::Record) {
		let kept = match record.level() {
			log::Level::Error | log::Level::Warn => &WARNINGS,
			log::Level::Info => &INFOS,
			log::Level::Debug | log::Level::Trace => return,
		};
		kept.lock().unwrap_or_else(PoisonError::into_inner).push(record.args().to_string());
	}

	fn flush(&self) {}
}

pub(crate) fn capturing() {
	INSTALLED.call_once(|| {
		log::set_logger(&CAPTURED).expect("no other logger is installed in the test binary");
		log::set_max_level(log::LevelFilter::Info);
	});
}

pub(crate) async fn warnings_naming(needle: &str) -> Vec<String> {
	lines_naming(&WARNINGS, needle).await
}

pub(crate) async fn infos_naming(needle: &str) -> Vec<String> {
	lines_naming(&INFOS, needle).await
}

async fn lines_naming(kept: &Mutex<Vec<String>>, needle: &str) -> Vec<String> {
	let awaited = async {
		loop {
			let named = named_in(kept, needle);
			if !named.is_empty() {
				return named;
			}
			tokio::time::sleep(POLL_EVERY).await;
		}
	};
	tokio::time::timeout(PATIENCE, awaited)
		.await
		.unwrap_or_else(|_| panic!("no line named {needle} within {PATIENCE:?}"))
}

fn named_in(kept: &Mutex<Vec<String>>, needle: &str) -> Vec<String> {
	let lines = kept.lock().unwrap_or_else(PoisonError::into_inner);
	lines.iter().filter(|line| line.contains(needle)).cloned().collect()
}
