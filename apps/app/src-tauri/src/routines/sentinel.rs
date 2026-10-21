use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::time::Duration;

use notify_debouncer_full::notify::{self, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{mpsc, watch as signal};

use super::commands::declared_source;
use super::contract::{Routine, RoutineError, TriggerEvent, TriggerSource};
use super::core::{self, Clock, SystemClock};
use super::runner::Runner;
use super::{schedule, watch};
use crate::conversations::commands::ready;
use crate::db;
use crate::db::repositories::routines::EnabledRoutine;

const TICK: Duration = Duration::from_secs(5);

const SETTLED_BATCHES: usize = 64;

pub struct Sentinel {
	stop: signal::Sender<bool>,
}

impl Sentinel {
	pub fn stop(&self) {
		self.stop.send_replace(true);
	}
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) -> Sentinel {
	let (stop, halted) = signal::channel(false);
	tauri::async_runtime::spawn(keeping_watch(app, halted));
	Sentinel { stop }
}

pub(crate) async fn keeping_watch<R: Runtime>(
	app: AppHandle<R>,
	mut halted: signal::Receiver<bool>,
) {
	let state = app.state::<db::DatabaseState>();
	let database = match ready(&state) {
		Ok(database) => database,
		Err(failure) => return eprintln!("no routine is watched for: {failure:?}"),
	};
	let (settled, mut settling) = mpsc::channel(SETTLED_BATCHES);
	// Held past the debouncer: a file watcher that never started would otherwise leave the
	// channel closed, and a closed channel would end the loop the schedule runs in too.
	let mut watched = Watched::new(&settled);
	let mut ticker = tokio::time::interval(TICK);
	loop {
		tokio::select! {
			_ = halted.changed() => return,
			_ = ticker.tick() => on_tick(&app, database, &mut watched).await,
			batch = settling.recv() => match batch {
				Some(batch) => on_settled(&app, database, batch).await,
				None => return,
			},
		}
	}
}

struct Watched {
	debouncer: Option<Debouncer<notify::RecommendedWatcher, RecommendedCache>>,
	paths: BTreeSet<PathBuf>,
}

impl Watched {
	fn new(settled: &mpsc::Sender<DebounceEventResult>) -> Self {
		let settled = settled.clone();
		let debouncer = new_debouncer(watch::SETTLE, None, move |batch: DebounceEventResult| {
			if let Err(failure) = settled.try_send(batch) {
				eprintln!("a settled file change was not carried to the routines: {failure}");
			}
		});
		match debouncer {
			Ok(debouncer) => Self { debouncer: Some(debouncer), paths: BTreeSet::new() },
			Err(failure) => {
				eprintln!("no file change is watched for: {failure}");
				Self { debouncer: None, paths: BTreeSet::new() }
			}
		}
	}

	fn settle_on(&mut self, wanted: BTreeMap<PathBuf, String>) {
		let Some(debouncer) = self.debouncer.as_mut() else {
			return;
		};
		let gone: Vec<PathBuf> =
			self.paths.iter().filter(|path| !wanted.contains_key(*path)).cloned().collect();
		for path in gone {
			if let Err(failure) = debouncer.unwatch(&path) {
				eprintln!("a path stayed watched after its routines left: {failure}");
			}
			self.paths.remove(&path);
		}
		for (path, routine_id) in wanted {
			if self.paths.contains(&path) {
				continue;
			}
			match debouncer.watch(&path, RecursiveMode::Recursive) {
				Ok(()) => {
					self.paths.insert(path);
				}
				Err(failure) => report(&routine_id, &unwatchable(failure)),
			}
		}
	}
}

async fn on_tick<R: Runtime>(app: &AppHandle<R>, database: &db::Database, watched: &mut Watched) {
	fire_due_occurrences(app, database).await;
	match wanted_paths(database).await {
		Ok(wanted) => watched.settle_on(wanted),
		Err(failure) => eprintln!("the watched paths were not read: {failure:?}"),
	}
}

async fn on_settled<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	batch: DebounceEventResult,
) {
	let events = match batch {
		Ok(events) => events,
		Err(failures) => {
			for failure in failures {
				eprintln!("a watched path reported a failure: {failure}");
			}
			return;
		}
	};
	let changes = watch::settled(&watch::observed(&events, SystemClock.now_ms()));
	match database.routines().enabled_on_source(watch::SOURCE_ID.to_owned()).await {
		Ok(held) => fire_changes(app, database, &held, &changes).await,
		Err(failure) => eprintln!("the watching routines were not read: {failure:?}"),
	}
}

async fn fire_due_occurrences<R: Runtime>(app: &AppHandle<R>, database: &db::Database) {
	let held = match database.routines().enabled_on_source(schedule::SOURCE_ID.to_owned()).await {
		Ok(held) => held,
		Err(failure) => return eprintln!("the scheduled routines were not read: {failure:?}"),
	};
	for routine in &held {
		if let Err(failure) = fired(app, database, routine).await {
			report(&routine.routine.id, &failure);
		}
	}
}

async fn fired<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	held: &EnabledRoutine,
) -> Result<(), RoutineError> {
	let Some(occurrence) = schedule::due_for(held, SystemClock.now_ms())? else {
		return Ok(());
	};
	let Some(source) = source_of(app, database, &held.routine).await? else {
		return Ok(());
	};
	let runner = Runner::new(app.clone());
	schedule::fire(database, &runner, &SystemClock, &held.routine, &source, &occurrence)
		.await
		.map(drop)
}

async fn fire_changes<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	held: &[EnabledRoutine],
	changes: &[watch::Settled],
) {
	for routine in held {
		if let Err(failure) = notified(app, database, &routine.routine, changes).await {
			report(&routine.routine.id, &failure);
		}
	}
}

async fn notified<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	routine: &Routine,
	changes: &[watch::Settled],
) -> Result<(), RoutineError> {
	let root = canonical(watch::declared(&routine.trigger_config)?)?;
	let matching: Vec<&watch::Settled> =
		changes.iter().filter(|change| change.path.starts_with(&root)).collect();
	if matching.is_empty() {
		return Ok(());
	}
	let Some(source) = source_of(app, database, routine).await? else {
		return Ok(());
	};
	for change in matching {
		let event = TriggerEvent {
			routine_id: routine.id.clone(),
			source: source.clone(),
			payload: watch::payload(change)?,
		};
		core::on_trigger(database, &Runner::new(app.clone()), &SystemClock, event).await?;
	}
	Ok(())
}

async fn wanted_paths(database: &db::Database) -> Result<BTreeMap<PathBuf, String>, RoutineError> {
	let held = database.routines().enabled_on_source(watch::SOURCE_ID.to_owned()).await?;
	let mut wanted = BTreeMap::new();
	for routine in &held {
		match watch::declared(&routine.routine.trigger_config).and_then(canonical) {
			Ok(path) => {
				wanted.entry(path).or_insert_with(|| routine.routine.id.clone());
			}
			Err(failure) => report(&routine.routine.id, &failure),
		}
	}
	Ok(wanted)
}

async fn source_of<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	routine: &Routine,
) -> Result<Option<TriggerSource>, RoutineError> {
	match declared_source(
		app,
		database,
		&routine.conversation_id,
		&routine.bot_id,
		&routine.trigger_source_id,
	)
	.await
	{
		Ok(source) => Ok(Some(source)),
		Err(RoutineError::UnknownSource { .. }) => Ok(None),
		Err(failure) => Err(failure),
	}
}

fn canonical(declared: &str) -> Result<PathBuf, RoutineError> {
	std::fs::canonicalize(declared).map_err(|failure| RoutineError::Unexpected {
		detail: format!("its watched path was not resolved: {failure}"),
	})
}

fn unwatchable(failure: notify::Error) -> RoutineError {
	RoutineError::Unexpected { detail: format!("its path is not watched: {:?}", failure.kind) }
}

fn report(routine_id: &str, failure: &RoutineError) {
	eprintln!("the routine {routine_id} did not fire: {failure:?}");
}

#[cfg(test)]
mod tests {
	use std::fs;

	use tauri::test::mock_builder;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("sentinel-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app
	}

	#[tokio::test]
	async fn the_task_ends_when_its_stop_signal_fires() {
		let app = a_host("stopped");
		let (stop, halted) = signal::channel(false);
		let task = tokio::spawn(keeping_watch(app.handle().clone(), halted));

		stop.send_replace(true);

		let ended = tokio::time::timeout(Duration::from_secs(60), task).await;

		assert!(ended.is_ok(), "the task outlived its stop signal");
	}

	#[test]
	fn a_path_no_enabled_routine_wants_stops_being_watched() {
		let (settled, _settling) = mpsc::channel(1);
		let mut watched = Watched::new(&settled);
		let dir = temp_dir();

		watched.settle_on(BTreeMap::from([(dir.to_path_buf(), "r1".to_owned())]));
		assert_eq!(watched.paths, BTreeSet::from([dir.to_path_buf()]));

		watched.settle_on(BTreeMap::new());

		assert!(watched.paths.is_empty(), "got {:?}", watched.paths);
		let _ = fs::remove_dir_all(&dir);
	}

	#[test]
	fn a_path_that_cannot_be_watched_leaves_the_other_routines_watching() {
		let (settled, _settling) = mpsc::channel(1);
		let mut watched = Watched::new(&settled);
		let dir = temp_dir();
		let missing = dir.join("gone");

		watched.settle_on(BTreeMap::from([
			(dir.to_path_buf(), "r1".to_owned()),
			(missing, "r2".to_owned()),
		]));

		assert_eq!(watched.paths, BTreeSet::from([dir.to_path_buf()]));
		let _ = fs::remove_dir_all(&dir);
	}
}
