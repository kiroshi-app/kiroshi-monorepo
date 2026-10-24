use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use notify_debouncer_full::notify::event::{EventKind, ModifyKind, RenameMode};
use notify_debouncer_full::DebouncedEvent;
use serde::Serialize;
use serde_json::{json, Map, Value};

use super::contract::RoutineError;
use super::core::moment;

pub const SOURCE_ID: &str = "file-watch";

pub const SETTLE: Duration = Duration::from_millis(500);

const PATH_FIELD: &str = "path";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Change {
	Created,
	Modified,
	Removed,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Observation {
	pub path: PathBuf,
	pub change: Change,
	pub at: i64,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Settled {
	pub path: PathBuf,
	pub change: Change,
	pub changed_at: i64,
}

pub fn declared(trigger_config: &Value) -> Result<&str, RoutineError> {
	trigger_config.get(PATH_FIELD).and_then(Value::as_str).ok_or_else(|| RoutineError::Unexpected {
		detail: format!("the routine declares no {PATH_FIELD}"),
	})
}

pub fn observed(events: &[DebouncedEvent], at: i64) -> Vec<Observation> {
	let mut observations = Vec::new();
	for event in events {
		let Some(change) = change_of(&event.event.kind) else {
			continue;
		};
		for path in &event.event.paths {
			observations.push(Observation { path: path.clone(), change, at });
		}
	}
	observations
}

pub fn settled(observations: &[Observation]) -> Vec<Settled> {
	let mut folded: Vec<Settled> = Vec::new();
	for observation in observations {
		match folded.iter_mut().find(|held| held.path == observation.path) {
			Some(held) => {
				held.change = observation.change;
				held.changed_at = held.changed_at.max(observation.at);
			}
			None => folded.push(Settled {
				path: observation.path.clone(),
				change: observation.change,
				changed_at: observation.at,
			}),
		}
	}
	folded
}

fn change_id(path: &Path, changed_at: i64) -> String {
	format!("{}:{changed_at}", path.display())
}

fn size_bytes(path: &Path) -> Option<u64> {
	fs::metadata(path).ok().filter(|measured| measured.is_file()).map(|measured| measured.len())
}

pub fn payload(settled: &Settled) -> Result<Value, RoutineError> {
	let mut built = Map::new();
	built.insert(PATH_FIELD.to_owned(), json!(settled.path.display().to_string()));
	built.insert("change".to_owned(), json!(settled.change));
	built.insert("changedAt".to_owned(), json!(moment(settled.changed_at)?));
	built.insert("changeId".to_owned(), json!(change_id(&settled.path, settled.changed_at)));
	if let Some(measured) = size_bytes(&settled.path) {
		built.insert("sizeBytes".to_owned(), json!(measured));
	}
	Ok(Value::Object(built))
}

fn change_of(kind: &EventKind) -> Option<Change> {
	match kind {
		EventKind::Create(_) => Some(Change::Created),
		EventKind::Modify(ModifyKind::Name(RenameMode::From)) => Some(Change::Removed),
		EventKind::Modify(_) => Some(Change::Modified),
		EventKind::Remove(_) => Some(Change::Removed),
		EventKind::Access(_) | EventKind::Any | EventKind::Other => None,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const NOON: i64 = 1_800_000_000_000;

	fn writing(path: &str, at: i64) -> Observation {
		Observation { path: PathBuf::from(path), change: Change::Modified, at }
	}

	#[test]
	fn a_burst_of_writes_to_one_path_settles_as_one_change_at_the_last_instant() {
		let burst = [
			Observation { path: PathBuf::from("/notes/a.md"), change: Change::Created, at: NOON },
			writing("/notes/a.md", NOON + 40),
			writing("/notes/a.md", NOON + 120),
		];

		let folded = settled(&burst);

		assert_eq!(
			folded,
			[Settled {
				path: PathBuf::from("/notes/a.md"),
				change: Change::Modified,
				changed_at: NOON + 120,
			}]
		);
	}

	#[test]
	fn writes_to_two_paths_settle_as_one_change_each() {
		let burst = [
			writing("/notes/a.md", NOON),
			writing("/notes/b.md", NOON + 10),
			writing("/notes/a.md", NOON + 20),
		];

		let folded = settled(&burst);

		assert_eq!(folded.len(), 2, "got {folded:?}");
		assert_eq!(folded[0].changed_at, NOON + 20);
		assert_eq!(folded[1].changed_at, NOON + 10);
	}

	#[test]
	fn a_change_the_file_of_which_cannot_be_measured_carries_no_size() {
		let built = payload(&Settled {
			path: PathBuf::from("/notes/gone.md"),
			change: Change::Removed,
			changed_at: NOON,
		})
		.expect("the payload builds");

		assert_eq!(
			built,
			json!({
				"path": "/notes/gone.md",
				"change": "removed",
				"changedAt": "2027-01-15T08:00:00.000Z",
				"changeId": "/notes/gone.md:1800000000000",
			})
		);
	}

	#[test]
	fn a_change_to_a_file_on_disk_carries_its_size() {
		let dir = crate::db::connection::fixture_root("watch-measured");
		fs::create_dir_all(&dir).expect("the directory stands");
		let path = dir.join("a.md");
		fs::write(&path, b"four").expect("the file lands");

		let built =
			payload(&Settled { path: path.clone(), change: Change::Modified, changed_at: NOON })
				.expect("the payload builds");

		assert_eq!(built.get("sizeBytes"), Some(&json!(4)));

		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn an_access_notify_reports_is_no_observation() {
		use notify_debouncer_full::notify::event::{AccessKind, Event};
		use std::time::Instant;

		let events = [DebouncedEvent::new(
			Event::new(EventKind::Access(AccessKind::Read)).add_path(PathBuf::from("/notes/a.md")),
			Instant::now(),
		)];

		assert_eq!(observed(&events, NOON), Vec::new());
	}
}
