use std::collections::HashSet;
use std::future::Future;
use std::time::Duration;

use git2::{Repository, StatusOptions};
use tauri::{AppHandle, Runtime};

use super::commands::{announce_change, announce_when};
use super::contract::{CheckoutCounts, Mission, MissionError};
use crate::db;

pub const GIT_TIMEOUT: Duration = Duration::from_secs(5);

const ORIGIN_MAIN: &str = "refs/remotes/origin/main";

#[derive(Debug, PartialEq, Eq)]
enum Read {
	Counted(CheckoutCounts),
	Unread(String),
	Abandoned,
}

pub(crate) async fn pass<R: Runtime>(app: &AppHandle<R>, database: &db::Database) {
	let moved = recounted_all(database).await;
	let open = match database.missions().still_open().await {
		Ok(open) => open,
		Err(failure) => return eprintln!("the open missions were not read: {failure:?}"),
	};
	for mission in open {
		let id = mission.id.clone();
		let has_moved = moved.contains(&id);
		let told = announce_when(app, mission, |_, has_pulse_moved| has_moved || has_pulse_moved);
		if let Err(failure) = told {
			eprintln!("mission {id} moved and the front was not told: {failure:?}");
		}
	}
}

async fn recounted_all(database: &db::Database) -> HashSet<String> {
	let hooked = match database.missions().hooked().await {
		Ok(hooked) => hooked,
		Err(failure) => {
			eprintln!("the checkouts of the open missions were not read: {failure:?}");
			return HashSet::new();
		}
	};
	let mut moved = HashSet::new();
	for mission in hooked {
		match recounted(database, &mission.id, &mission.workspace_path).await {
			Ok(Some(_)) => {
				moved.insert(mission.id);
			}
			Ok(None) => (),
			Err(failure) => {
				eprintln!("the checkout of mission {} was not written: {failure:?}", mission.id);
			}
		}
	}
	moved
}

pub(crate) async fn recounted(
	database: &db::Database,
	mission_id: &str,
	workspace: &str,
) -> Result<Option<Mission>, MissionError> {
	let counts = match read(workspace, GIT_TIMEOUT).await {
		Read::Counted(counts) => Some(counts),
		Read::Unread(detail) => {
			eprintln!("the checkout of mission {mission_id} was not read: {detail}");
			None
		}
		Read::Abandoned => {
			eprintln!("the checkout of mission {mission_id} took too long to read");
			return Ok(None);
		}
	};
	database.missions().record_checkout(mission_id.to_owned(), counts).await
}

pub(crate) fn told<R: Runtime>(app: &AppHandle<R>, mission: &Mission) {
	if let Err(failure) = announce_change(app, mission.clone()) {
		eprintln!("mission {} moved and the front was not told: {failure:?}", mission.id);
	}
}

async fn read(workspace: &str, limit: Duration) -> Read {
	bounded(limit, counts(workspace)).await
}

async fn bounded(
	limit: Duration,
	counting: impl Future<Output = Result<CheckoutCounts, String>>,
) -> Read {
	match tokio::time::timeout(limit, counting).await {
		Ok(Ok(counts)) => Read::Counted(counts),
		Ok(Err(detail)) => Read::Unread(detail),
		Err(_) => Read::Abandoned,
	}
}

async fn counts(workspace: &str) -> Result<CheckoutCounts, String> {
	let workspace = workspace.to_owned();
	tokio::task::spawn_blocking(move || {
		counted(&workspace).map_err(|error| error.message().to_owned())
	})
	.await
	.map_err(|error| format!("the checkout read stopped: {error}"))?
}

fn counted(workspace: &str) -> Result<CheckoutCounts, git2::Error> {
	let repository = Repository::discover(workspace)?;
	let main = repository.refname_to_id(ORIGIN_MAIN)?;
	let head = repository.head()?.peel_to_commit()?.id();
	let (ahead, _) = repository.graph_ahead_behind(head, main)?;
	let mut options = StatusOptions::new();
	options.include_untracked(true).renames_head_to_index(true);
	let dirty_files = repository.statuses(Some(&mut options))?.len();
	Ok(CheckoutCounts { commits_ahead: ahead as i64, dirty_files: dirty_files as i64 })
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::{Path, PathBuf};
	use std::sync::mpsc::channel;

	use serde_json::{json, Value};
	use tauri::test::mock_builder;
	use tauri::{Listener as _, Manager as _};

	use super::super::commands::{AnnouncedLiveness, CHANGED_EVENT};
	use super::super::contract::{
		MissionDraft, MissionEntry, MissionEventKind, MissionNote, Ticket,
	};
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::an_app_of_its_own;

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	fn git(dir: &Path, arguments: &[&str]) {
		let ran = std::process::Command::new("git")
			.arg("-C")
			.arg(dir)
			.args(arguments)
			.env("GIT_AUTHOR_NAME", "Kiroshi")
			.env("GIT_AUTHOR_EMAIL", "kiroshi@kiroshi.test")
			.env("GIT_COMMITTER_NAME", "Kiroshi")
			.env("GIT_COMMITTER_EMAIL", "kiroshi@kiroshi.test")
			.output()
			.expect("git runs");
		assert!(
			ran.status.success(),
			"git {arguments:?}: {}",
			String::from_utf8_lossy(&ran.stderr)
		);
	}

	fn committed(dir: &Path, name: &str) {
		fs::write(dir.join(name), name).expect("the file lands");
		git(dir, &["add", name]);
		git(dir, &["commit", "--quiet", "-m", name]);
	}

	fn a_checkout(root: &Path) -> PathBuf {
		let checkout = root.join("checkout");
		fs::create_dir_all(&checkout).expect("the checkout is there");
		git(&checkout, &["init", "--quiet", "--initial-branch", "main"]);
		committed(&checkout, "base");
		git(&checkout, &["update-ref", "refs/remotes/origin/main", "HEAD"]);
		git(&checkout, &["checkout", "--quiet", "-b", "feature"]);
		committed(&checkout, "one");
		committed(&checkout, "two");
		fs::write(checkout.join("base"), "edited").expect("the edit lands");
		fs::write(checkout.join("loose"), "untracked").expect("the loose file lands");
		checkout
	}

	async fn planted() -> (Database, RemovedOnDrop) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
			.await
			.expect("the participant is planted");
		(database, dir)
	}

	async fn a_mission_in(database: &Database, workspace: Option<&Path>) -> Mission {
		database
			.missions()
			.open(
				MissionDraft {
					origin_conversation_id: "c1".to_owned(),
					bot_id: "b1".to_owned(),
					objective: "Fix the crash".to_owned(),
					ticket: Ticket {
						platform: "github".to_owned(),
						external_id: "42".to_owned(),
						url: "https://kiroshi.test/tickets/42".to_owned(),
						title: "Crash on open".to_owned(),
					},
					tools: Vec::new(),
					source: "bot".to_owned(),
					workspace_path: workspace.map(|path| path.to_string_lossy().into_owned()),
				},
				uuid::Uuid::new_v4().to_string(),
			)
			.await
			.expect("the mission opens")
	}

	async fn events_in(database: &Database) -> i64 {
		database
			.call(|connection| {
				Ok(connection
					.query_row("SELECT count(*) FROM mission_events", [], |row| row.get(0))?)
			})
			.await
			.expect("the events count")
	}

	async fn counts_of(database: &Database, id: &str) -> (Option<i64>, Option<i64>) {
		let held = database.missions().detail(id.to_owned()).await.expect("the mission reads");
		(held.mission.commits_ahead, held.mission.dirty_files)
	}

	#[tokio::test]
	async fn a_checkout_answers_its_commits_ahead_of_origin_main_and_its_dirty_lines() {
		let root = temp_dir();
		let checkout = a_checkout(&root);

		let held = read(&checkout.to_string_lossy(), GIT_TIMEOUT).await;

		assert_eq!(held, Read::Counted(CheckoutCounts { commits_ahead: 2, dirty_files: 2 }));

		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[tokio::test]
	async fn an_absent_checkout_and_one_without_origin_main_are_unread() {
		let root = temp_dir();
		let bare = root.join("no-origin");
		fs::create_dir_all(&bare).expect("the directory is there");
		git(&bare, &["init", "--quiet"]);

		let absent = read(&root.join("nowhere").to_string_lossy(), GIT_TIMEOUT).await;
		let unrooted = read(&bare.to_string_lossy(), GIT_TIMEOUT).await;

		assert!(matches!(absent, Read::Unread(_)), "got {absent:?}");
		assert!(matches!(unrooted, Read::Unread(_)), "got {unrooted:?}");

		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[tokio::test]
	async fn a_read_past_its_limit_is_abandoned() {
		let held = bounded(Duration::from_millis(50), std::future::pending()).await;

		assert_eq!(held, Read::Abandoned);
	}

	#[cfg(unix)]
	#[tokio::test]
	async fn a_checkout_read_never_runs_the_fsmonitor_the_repository_names() {
		use crate::executable_script::an_executable_script;

		let root = temp_dir();
		let checkout = a_checkout(&root);
		let marker = root.join("monitor-ran");
		let monitor = root.join("monitor.sh");
		an_executable_script(&monitor, &format!("#!/bin/sh\ntouch {}\n", marker.display()));
		git(&checkout, &["config", "core.fsmonitor", &monitor.to_string_lossy()]);

		let held = read(&checkout.to_string_lossy(), GIT_TIMEOUT).await;

		assert_eq!(held, Read::Counted(CheckoutCounts { commits_ahead: 2, dirty_files: 2 }));
		assert!(!marker.exists(), "the fsmonitor of the repository ran");

		fs::remove_dir_all(&root).expect("cleanup");
	}

	fn git_answer(dir: &Path, arguments: &[&str]) -> String {
		let ran = std::process::Command::new("git")
			.arg("-C")
			.arg(dir)
			.args(arguments)
			.output()
			.expect("git runs");
		assert!(ran.status.success(), "git {arguments:?} failed");
		String::from_utf8(ran.stdout).expect("git answers text")
	}

	#[cfg(unix)]
	#[tokio::test]
	async fn a_checkout_read_runs_no_clean_filter_and_counts_what_the_git_cli_counts() {
		let root = temp_dir();
		let checkout = a_checkout(&root);
		let marker = root.join("filter-ran");
		let filter = format!("touch {} && cat", marker.display());
		git(&checkout, &["mv", "two", "renamed"]);
		git(&checkout, &["config", "filter.x.clean", &filter]);
		fs::write(checkout.join(".gitattributes"), "one filter=x\n").expect("the attributes land");
		fs::write(checkout.join("one"), "ONE").expect("the same size edit lands");
		fs::create_dir_all(checkout.join("nested/deeper")).expect("the untracked folder lands");
		fs::write(checkout.join("nested/a"), "a").expect("an untracked file lands");
		fs::write(checkout.join("nested/deeper/b"), "b").expect("an untracked file lands");
		fs::create_dir_all(checkout.join("logs")).expect("the ignored folder lands");
		fs::write(checkout.join("logs/run.log"), "log").expect("an ignored file lands");
		fs::write(checkout.join("top.log"), "log").expect("an ignored file lands");
		fs::write(checkout.join(".git/info/exclude"), "*.log\n").expect("the exclude lands");

		let held = read(&checkout.to_string_lossy(), GIT_TIMEOUT).await;

		assert!(!marker.exists(), "the clean filter of the repository ran");
		let status = git_answer(&checkout, &["status", "--porcelain"]);
		let ahead = git_answer(&checkout, &["rev-list", "--count", "origin/main..HEAD"]);
		let expected = CheckoutCounts {
			commits_ahead: ahead.trim().parse().expect("git counts"),
			dirty_files: status.lines().count() as i64,
		};
		assert_eq!(held, Read::Counted(expected), "git status answered {status}");

		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pass_counts_every_checkout_clears_an_absent_one_and_appends_no_event() {
		let (database, dir) = planted().await;
		let checkout = a_checkout(&dir);
		let counted = a_mission_in(&database, Some(&checkout)).await;
		let gone = a_mission_in(&database, Some(&dir.join("gone"))).await;
		database
			.missions()
			.record_checkout(
				gone.id.clone(),
				Some(CheckoutCounts { commits_ahead: 1, dirty_files: 1 }),
			)
			.await
			.expect("stale counts are planted");
		let events_before = events_in(&database).await;
		let app = an_app_of_its_own("mission-checkout", mock_builder());

		pass(app.handle(), &database).await;

		assert_eq!(counts_of(&database, &counted.id).await, (Some(2), Some(2)));
		assert_eq!(counts_of(&database, &gone.id).await, (None, None));
		assert_eq!(events_in(&database).await, events_before);

		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pass_tells_the_front_of_a_mission_whose_liveness_differs_from_what_it_last_heard() {
		let (database, dir) = planted().await;
		let quiet = a_mission_in(&database, None).await;
		let started = a_mission_in(&database, None).await;
		let app = an_app_of_its_own("mission-checkout", mock_builder());
		app.manage(AnnouncedLiveness::default());
		told(app.handle(), &quiet);
		told(app.handle(), &started);
		database
			.missions()
			.append(
				started.id.clone(),
				MissionEntry::of(
					MissionEventKind::AgentStarted,
					MissionNote { source: "agent-hook".to_owned(), payload: json!({}) },
				),
			)
			.await
			.expect("the agent starts");
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		pass(app.handle(), &database).await;
		pass(app.handle(), &database).await;

		let announced: Vec<Value> = received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect();
		assert_eq!(announced.len(), 1, "got {announced:?}");
		assert_eq!(announced[0]["missionId"], json!(started.id));
		assert_eq!(announced[0]["isAgentRunning"], json!(true));

		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
