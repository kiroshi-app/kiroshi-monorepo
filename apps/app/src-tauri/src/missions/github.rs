use std::collections::HashMap;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ETAG, IF_NONE_MATCH, LINK, USER_AGENT};
use reqwest::{Client, Response, StatusCode};
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch as signal;

use super::checkout;
use super::commands::announce_change;
use super::contract::{Mission, MissionEntry, MissionError, MissionEventKind, WatchedMission};
use crate::conversations::commands::ready;
use crate::db;
use crate::routines::core::{Clock, SystemClock};

pub const TICK: Duration = Duration::from_secs(120);

pub const SOURCE: &str = "github";

const API: &str = "https://api.github.com";

const AGENT: &str = "Kiroshi";

const TIMEOUT: Duration = Duration::from_secs(15);

const API_VERSION_HEADER: &str = "X-GitHub-Api-Version";

const API_VERSION: &str = "2022-11-28";

const RATE_LIMIT_RESET_HEADER: &str = "x-ratelimit-reset";

const RATE_LIMIT_REMAINING_HEADER: &str = "x-ratelimit-remaining";

const RETRY_AFTER_HEADER: &str = "retry-after";

const FAILED_CONCLUSIONS: [&str; 5] =
	["failure", "timed_out", "action_required", "startup_failure", "cancelled"];

const OPEN: &str = "open";

const DIRTY: &str = "dirty";

const CLEAN: &str = "clean";

const CONFLICTS_WITH_MAIN: &str = "conflicts with main";

const QUEUE_REF_PREFIX: &str = "gh-readonly-queue/";

const ADDED_TO_QUEUE: &str = "added_to_merge_queue";

const REMOVED_FROM_QUEUE: &str = "removed_from_merge_queue";

const TIMELINE_PAGES_READ_BACK: usize = 2;

pub struct Poller {
	stop: signal::Sender<bool>,
}

impl Poller {
	pub fn stop(&self) {
		self.stop.send_replace(true);
	}
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) -> Poller {
	let (stop, halted) = signal::channel(false);
	tauri::async_runtime::spawn(polling(app, API.to_owned(), halted));
	Poller { stop }
}

async fn polling<R: Runtime>(app: AppHandle<R>, base: String, mut halted: signal::Receiver<bool>) {
	let state = app.state::<db::DatabaseState>();
	let database = match ready(&state) {
		Ok(database) => database,
		Err(failure) => return eprintln!("no mission is watched on github: {failure:?}"),
	};
	let reach = match Reach::bearing(base, token()) {
		Ok(reach) => reach,
		Err(failure) => return eprintln!("no mission is watched on github: {failure}"),
	};
	let mut kept = Kept::default();
	let mut ticker = tokio::time::interval(TICK);
	loop {
		tokio::select! {
			_ = halted.changed() => return,
			_ = ticker.tick() => {
				checkout::pass(&app, database).await;
				pass(&app, &reach, database, &mut kept, &SystemClock).await;
			}
		}
	}
}

pub(crate) struct Reach {
	client: Client,
	base: String,
	token: Option<String>,
}

impl Reach {
	pub(crate) fn bearing(base: String, token: Option<String>) -> Result<Self, String> {
		installed_tls_provider();
		let client = Client::builder()
			.timeout(TIMEOUT)
			.default_headers(headers())
			.build()
			.map_err(|error| format!("the http client was not built: {error}"))?;
		Ok(Self { client, base, token })
	}

	async fn sent(&self, url: String, etag: Option<&str>) -> Result<Response, Failure> {
		let mut request = self.client.get(&url);
		if let Some(token) = self.token.as_deref() {
			request = request.bearer_auth(token);
		}
		if let Some(etag) = etag {
			request = request.header(IF_NONE_MATCH, etag);
		}
		request.send().await.map_err(|error| Failure::Unreached(error.to_string()))
	}

	async fn pulls(
		&self,
		mission: &WatchedMission,
		etag: Option<&str>,
	) -> Result<Answer<Vec<Pull>>, Failure> {
		let owner = owner_of(&mission.repository)?;
		let url = format!(
			"{}/repos/{}/pulls?head={}:{}&state=all&sort=updated&direction=desc&per_page=1",
			self.base, mission.repository, owner, mission.branch
		);
		read(self.sent(url, etag).await?).await
	}

	async fn checks(
		&self,
		repository: &str,
		head_sha: &str,
		etag: Option<&str>,
	) -> Result<Answer<Runs>, Failure> {
		let url = format!("{}/repos/{repository}/commits/{head_sha}/check-runs", self.base);
		read(self.sent(url, etag).await?).await
	}

	async fn pull(
		&self,
		repository: &str,
		number: u64,
		etag: Option<&str>,
	) -> Result<Answer<Pull>, Failure> {
		let url = format!("{}/repos/{repository}/pulls/{number}", self.base);
		read(self.sent(url, etag).await?).await
	}

	async fn timeline(
		&self,
		repository: &str,
		number: u64,
	) -> Result<Answer<Vec<TimelineEvent>>, Failure> {
		let url = format!("{}/repos/{repository}/issues/{number}/timeline?per_page=100", self.base);
		let first = self.sent(url, None).await?;
		let Some(last) = self.linked(&first, "last") else {
			return read(first).await;
		};
		let mut tail: Vec<TimelineEvent> = Vec::new();
		let mut page = Some(last);
		for _ in 0..TIMELINE_PAGES_READ_BACK {
			let Some(url) = page.take() else {
				break;
			};
			let answer = self.sent(url, None).await?;
			page = self.linked(&answer, "prev");
			match read::<Vec<TimelineEvent>>(answer).await? {
				Answer::Read { held: mut events, .. } => {
					events.append(&mut tail);
					tail = events;
				}
				Answer::Held { until_ms } => return Ok(Answer::Held { until_ms }),
				Answer::Unchanged => return Ok(Answer::Unchanged),
			}
			if queue_window_read(&tail) {
				break;
			}
		}
		Ok(Answer::Read { etag: None, held: tail })
	}

	fn linked(&self, answer: &Response, relation: &str) -> Option<String> {
		let marker = format!("rel=\"{relation}\"");
		let within = format!("{}/", self.base);
		answer
			.headers()
			.get(LINK)?
			.to_str()
			.ok()?
			.split(',')
			.find(|part| part.contains(&marker))
			.and_then(|part| part.split_once('<')?.1.split_once('>'))
			.map(|(url, _)| url.to_owned())
			.filter(|url| url.starts_with(&within))
	}

	async fn queue_runs(&self, repository: &str) -> Result<Answer<WorkflowRuns>, Failure> {
		let url =
			format!("{}/repos/{repository}/actions/runs?event=merge_group&per_page=50", self.base);
		read(self.sent(url, None).await?).await
	}

	async fn jobs(&self, repository: &str, run_id: u64) -> Result<Answer<Jobs>, Failure> {
		let url =
			format!("{}/repos/{repository}/actions/runs/{run_id}/jobs?per_page=100", self.base);
		read(self.sent(url, None).await?).await
	}
}

#[derive(Default)]
pub(crate) struct Kept {
	etags: HashMap<(String, Resource), String>,
	held_until_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Resource {
	Listing,
	Pull,
	CheckRuns,
}

impl Kept {
	fn held(&self, now_ms: i64) -> bool {
		self.held_until_ms.is_some_and(|until| now_ms < until)
	}

	fn hold_until(&mut self, until_ms: i64) {
		self.held_until_ms = Some(until_ms);
	}

	fn etag(&self, mission_id: &str, resource: Resource) -> Option<String> {
		self.etags.get(&(mission_id.to_owned(), resource)).cloned()
	}

	fn remember(&mut self, mission_id: &str, resource: Resource, etag: Option<String>) {
		if let Some(etag) = etag {
			self.etags.insert((mission_id.to_owned(), resource), etag);
		}
	}
}

enum Answer<T> {
	Unchanged,
	Held { until_ms: i64 },
	Read { etag: Option<String>, held: T },
}

#[derive(Debug)]
enum Failure {
	Unreached(String),
	Unreadable(String),
	Refused(u16),
	Storage(MissionError),
}

impl std::fmt::Display for Failure {
	fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Failure::Unreached(detail) => write!(formatter, "github was not reached: {detail}"),
			Failure::Unreadable(detail) => write!(formatter, "github answered {detail}"),
			Failure::Refused(status) => write!(formatter, "github refused with {status}"),
			Failure::Storage(failure) => {
				write!(formatter, "the mission was not written: {failure:?}")
			}
		}
	}
}

impl From<MissionError> for Failure {
	fn from(error: MissionError) -> Self {
		Failure::Storage(error)
	}
}

#[derive(Debug, Clone, Deserialize)]
struct Pull {
	number: u64,
	state: String,
	html_url: String,
	merged_at: Option<String>,
	head: Head,
	#[serde(default)]
	auto_merge: Option<IgnoredAny>,
	#[serde(default)]
	updated_at: Option<String>,
	#[serde(default)]
	mergeable_state: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Head {
	sha: String,
}

#[derive(Debug, Clone, Deserialize)]
struct TimelineEvent {
	#[serde(default)]
	id: Option<u64>,
	#[serde(default)]
	event: Option<String>,
	#[serde(default)]
	created_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct WorkflowRuns {
	#[serde(default)]
	workflow_runs: Vec<WorkflowRun>,
}

#[derive(Debug, Clone, Deserialize)]
struct WorkflowRun {
	id: u64,
	head_branch: Option<String>,
	status: Option<String>,
	conclusion: Option<String>,
	#[serde(default)]
	created_at: Option<String>,
	#[serde(default)]
	updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Jobs {
	#[serde(default)]
	jobs: Vec<Job>,
}

#[derive(Debug, Clone, Deserialize)]
struct Job {
	name: String,
	conclusion: Option<String>,
	#[serde(default)]
	steps: Vec<Step>,
}

#[derive(Debug, Clone, Deserialize)]
struct Step {
	name: String,
	conclusion: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Runs {
	#[serde(default)]
	check_runs: Vec<CheckRun>,
}

#[derive(Debug, Clone, Deserialize)]
struct CheckRun {
	name: String,
	status: String,
	conclusion: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Checks {
	None,
	Pending,
	Passed,
	Failed,
}

impl Checks {
	fn settled(self) -> bool {
		matches!(self, Checks::Passed | Checks::Failed)
	}
}

struct Settled {
	checks: Checks,
	failed: Vec<String>,
}

impl Settled {
	fn holding(checks: Checks) -> Self {
		Self { checks, failed: Vec::new() }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fingerprint {
	number: u64,
	state: String,
	head_sha: String,
	checks: Checks,
	merged: bool,
	#[serde(default)]
	queue: Option<Queue>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Queue {
	auto_merge: bool,
	updated_at: Option<String>,
	ejected_by_event: Option<u64>,
	conflicted_on: Option<String>,
	blocker: Option<Blocker>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Blocker {
	MergeQueueEjected,
	ConflictsWithMain,
}

enum QueueEvent {
	Added { at: Option<String> },
	Removed(Removal),
}

struct Removal {
	id: u64,
	at: Option<String>,
	added_at: Option<String>,
}

type Heard = (Queue, Option<MissionEntry>);

impl Fingerprint {
	fn held(stored: &str) -> Result<Option<Self>, Failure> {
		if stored.is_empty() {
			return Ok(None);
		}
		serde_json::from_str(stored)
			.map(Some)
			.map_err(|error| Failure::Unreadable(format!("a fingerprint it kept: {error}")))
	}

	fn of(pull: &Pull, checks: Checks, held: Option<&Fingerprint>) -> Self {
		let carried = held.filter(|held| held.number == pull.number);
		let unmoved = carried.is_some_and(|held| held.head_sha == pull.head.sha);
		let standing = carried.and_then(|held| held.queue.clone()).unwrap_or_default();
		Self {
			number: pull.number,
			state: pull.state.clone(),
			head_sha: pull.head.sha.clone(),
			checks,
			merged: pull.merged_at.is_some(),
			queue: Some(Queue {
				blocker: standing.blocker.filter(|_| unmoved),
				..Queue::observed(pull, &standing)
			}),
		}
	}

	fn held_back(&self) -> bool {
		self.queue.as_ref().is_some_and(|queue| queue.blocker.is_some())
	}

	fn green(&self) -> bool {
		self.state == OPEN && self.checks == Checks::Passed
	}
}

impl Queue {
	fn observed(pull: &Pull, standing: &Queue) -> Self {
		Self {
			auto_merge: pull.auto_merge.is_some(),
			updated_at: pull.updated_at.clone(),
			..standing.clone()
		}
	}
}

pub(crate) fn merged_pull_request(stored: &str) -> Result<Option<u64>, MissionError> {
	let held = Fingerprint::held(stored)
		.map_err(|failure| MissionError::Unexpected { detail: failure.to_string() })?;
	Ok(held.filter(|held| held.merged).map(|held| held.number))
}

pub(crate) async fn pass<R: Runtime>(
	app: &AppHandle<R>,
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	clock: &dyn Clock,
) {
	let watched = match database.missions().watched().await {
		Ok(watched) => watched,
		Err(failure) => {
			return eprintln!("the missions watched on github were not read: {failure:?}");
		}
	};
	for mission in watched {
		if kept.held(clock.now_ms()) {
			return;
		}
		let id = mission.id.clone();
		match seen(reach, database, kept, mission).await {
			Ok(Some(written)) => told(app, &written),
			Ok(None) => (),
			Err(failure) => {
				eprintln!("what became of mission {id} on github was not read: {failure}");
			}
		}
	}
}

fn told<R: Runtime>(app: &AppHandle<R>, mission: &Mission) {
	if let Err(failure) = announce_change(app, mission) {
		eprintln!("github moved mission {} and the front was not told: {failure:?}", mission.id);
	}
}

async fn seen(
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	mission: WatchedMission,
) -> Result<Option<Mission>, Failure> {
	let held = Fingerprint::held(&mission.fingerprint)?;
	if let Some(green) = held.clone().filter(Fingerprint::green) {
		return queued(reach, database, kept, &mission, green).await;
	}
	let sent = kept.etag(&mission.id, Resource::Listing);
	match reach.pulls(&mission, sent.as_deref()).await? {
		Answer::Held { until_ms } => {
			kept.hold_until(until_ms);
			Ok(None)
		}
		Answer::Unchanged => settling(reach, database, kept, &mission, held).await,
		Answer::Read { etag, held: pulls } => {
			listed(reach, database, kept, &mission, held, etag, pulls).await
		}
	}
}

async fn settling(
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	mission: &WatchedMission,
	held: Option<Fingerprint>,
) -> Result<Option<Mission>, Failure> {
	let Some(standing) = held.filter(|held| !held.checks.settled()) else {
		return Ok(None);
	};
	let Some(settled) =
		learned_checks(reach, kept, &mission.repository, &standing.head_sha).await?
	else {
		return Ok(None);
	};
	let fresh = Fingerprint { checks: settled.checks, ..standing.clone() };
	recorded(database, &mission.id, Some(&standing), fresh, None, &settled.failed).await
}

async fn listed(
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	mission: &WatchedMission,
	held: Option<Fingerprint>,
	etag: Option<String>,
	pulls: Vec<Pull>,
) -> Result<Option<Mission>, Failure> {
	let Some(pull) = pulls.into_iter().next() else {
		kept.remember(&mission.id, Resource::Listing, etag);
		return Ok(None);
	};
	let settled = match asks_for_checks(held.as_ref(), &pull) {
		false => Settled::holding(held.as_ref().map_or(Checks::None, |held| held.checks)),
		true => match learned_checks(reach, kept, &mission.repository, &pull.head.sha).await? {
			Some(settled) => settled,
			None => return Ok(None),
		},
	};
	let fresh = Fingerprint::of(&pull, settled.checks, held.as_ref());
	let written = recorded(
		database,
		&mission.id,
		held.as_ref(),
		fresh,
		Some(&pull.html_url),
		&settled.failed,
	)
	.await?;
	kept.remember(&mission.id, Resource::Listing, etag);
	Ok(written)
}

async fn learned_checks(
	reach: &Reach,
	kept: &mut Kept,
	repository: &str,
	head_sha: &str,
) -> Result<Option<Settled>, Failure> {
	Ok(heard(kept, reach.checks(repository, head_sha, None).await?).map(|runs| concluded(&runs)))
}

fn heard<T>(kept: &mut Kept, answer: Answer<T>) -> Option<T> {
	match answer {
		Answer::Read { held, .. } => Some(held),
		Answer::Unchanged => None,
		Answer::Held { until_ms } => {
			kept.hold_until(until_ms);
			None
		}
	}
}

async fn queued(
	reach: &Reach,
	database: &db::Database,
	kept: &mut Kept,
	mission: &WatchedMission,
	held: Fingerprint,
) -> Result<Option<Mission>, Failure> {
	let repository = &mission.repository;
	let sent = kept.etag(&mission.id, Resource::Pull);
	let pull = match reach.pull(repository, held.number, sent.as_deref()).await? {
		Answer::Held { until_ms } => {
			kept.hold_until(until_ms);
			return Ok(None);
		}
		Answer::Unchanged => None,
		Answer::Read { etag, held: pull } => Some((etag, pull)),
	};
	if let Some((_, pull)) =
		pull.as_ref().filter(|(_, pull)| pull.state != held.state || pull.head.sha != held.head_sha)
	{
		let moved = vec![pull.clone()];
		return listed(reach, database, kept, mission, Some(held), None, moved).await;
	}
	let sent = kept.etag(&mission.id, Resource::CheckRuns);
	let (checks_etag, settled) =
		match reach.checks(repository, &held.head_sha, sent.as_deref()).await? {
			Answer::Held { until_ms } => {
				kept.hold_until(until_ms);
				return Ok(None);
			}
			Answer::Unchanged => (None, Settled::holding(Checks::Passed)),
			Answer::Read { etag, held: runs } => (etag, concluded(&runs)),
		};
	if settled.checks != Checks::Passed {
		let fresh = Fingerprint { checks: settled.checks, ..held.clone() };
		return recorded(database, &mission.id, Some(&held), fresh, None, &settled.failed).await;
	}
	let Some((pull_etag, pull)) = pull else {
		kept.remember(&mission.id, Resource::CheckRuns, checks_etag);
		return Ok(None);
	};
	let Some((fresh, entry)) = queue_heard(reach, kept, repository, &held, &pull).await? else {
		return Ok(None);
	};
	let stored = match fresh == held && entry.is_none() {
		true => None,
		false => written(database, &mission.id, entry.into_iter().collect(), &fresh, None).await?,
	};
	if held.queue.is_some() {
		kept.remember(&mission.id, Resource::Pull, pull_etag);
	}
	kept.remember(&mission.id, Resource::CheckRuns, checks_etag);
	Ok(stored)
}

async fn queue_heard(
	reach: &Reach,
	kept: &mut Kept,
	repository: &str,
	held: &Fingerprint,
	pull: &Pull,
) -> Result<Option<(Fingerprint, Option<MissionEntry>)>, Failure> {
	let Some(standing) = held.queue.clone() else {
		return Ok(Some((Fingerprint::of(pull, Checks::Passed, Some(held)), None)));
	};
	let moved = queue_moved(reach, kept, repository, pull, standing).await?;
	Ok(moved.map(|(queue, entry)| (Fingerprint { queue: Some(queue), ..held.clone() }, entry)))
}

async fn queue_moved(
	reach: &Reach,
	kept: &mut Kept,
	repository: &str,
	pull: &Pull,
	standing: Queue,
) -> Result<Option<Heard>, Failure> {
	let queue = Queue::observed(pull, &standing);
	if pull.mergeable_state.as_deref() == Some(DIRTY) {
		return Ok(Some(conflicted(pull, queue)));
	}
	match standing.blocker {
		Some(Blocker::ConflictsWithMain) => return Ok(Some(resolved(pull, queue))),
		Some(Blocker::MergeQueueEjected) if queue.auto_merge => {
			return Ok(Some(released(pull.number, queue)));
		}
		_ => (),
	}
	let dropped = standing.auto_merge && !queue.auto_merge;
	let touched = !queue.auto_merge && standing.updated_at != queue.updated_at;
	if !dropped && !touched {
		return Ok(Some((queue, None)));
	}
	let Some(events) = heard(kept, reach.timeline(repository, pull.number).await?) else {
		return Ok(None);
	};
	match last_queue_event(&events) {
		Some(QueueEvent::Removed(removal)) => {
			ejected(reach, kept, repository, pull.number, removal, queue).await
		}
		Some(QueueEvent::Added { at }) if standing.blocker == Some(Blocker::MergeQueueEjected) => {
			requeued(reach, kept, repository, pull.number, at, queue).await
		}
		_ => Ok(Some((queue, None))),
	}
}

fn conflicted(pull: &Pull, queue: Queue) -> Heard {
	if queue.conflicted_on.as_ref() == Some(&pull.head.sha) {
		return (queue, None);
	}
	let blocker = Blocker::ConflictsWithMain;
	let entry = held_back(pull.number, blocker, vec![CONFLICTS_WITH_MAIN.to_owned()]);
	let queue =
		Queue { conflicted_on: Some(pull.head.sha.clone()), blocker: Some(blocker), ..queue };
	(queue, Some(entry))
}

fn resolved(pull: &Pull, queue: Queue) -> Heard {
	match pull.mergeable_state.as_deref() == Some(CLEAN) {
		true => released(pull.number, queue),
		false => (queue, None),
	}
}

fn released(number: u64, queue: Queue) -> Heard {
	let entry = entry(MissionEventKind::Ready, json!({ "pullRequest": number }));
	(Queue { blocker: None, ..queue }, Some(entry))
}

async fn ejected(
	reach: &Reach,
	kept: &mut Kept,
	repository: &str,
	number: u64,
	removal: Removal,
	queue: Queue,
) -> Result<Option<Heard>, Failure> {
	if queue.ejected_by_event == Some(removal.id) {
		return Ok(Some((queue, None)));
	}
	let Some(runs) = heard(kept, reach.queue_runs(repository).await?) else {
		return Ok(None);
	};
	let checks = match ejecting_run(&runs, number, &removal) {
		None => Vec::new(),
		Some(run) => match heard(kept, reach.jobs(repository, run.id).await?) {
			Some(jobs) => red_jobs(&jobs),
			None => return Ok(None),
		},
	};
	let blocker = Blocker::MergeQueueEjected;
	let queue = Queue { ejected_by_event: Some(removal.id), blocker: Some(blocker), ..queue };
	Ok(Some((queue, Some(held_back(number, blocker, checks)))))
}

async fn requeued(
	reach: &Reach,
	kept: &mut Kept,
	repository: &str,
	number: u64,
	added_at: Option<String>,
	queue: Queue,
) -> Result<Option<Heard>, Failure> {
	let Some(runs) = heard(kept, reach.queue_runs(repository).await?) else {
		return Ok(None);
	};
	let green = own_queue_run(&runs, number, added_at.as_deref()).is_some_and(|run| {
		run.status.as_deref() == Some("completed") && run.conclusion.as_deref() == Some("success")
	});
	match green {
		true => Ok(Some(released(number, queue))),
		false => Ok(Some((queue, None))),
	}
}

fn last_queue_event(events: &[TimelineEvent]) -> Option<QueueEvent> {
	let (index, last) = events.iter().enumerate().rev().find(|(_, event)| queued_event(event))?;
	if last.event.as_deref() == Some(ADDED_TO_QUEUE) {
		return Some(QueueEvent::Added { at: last.created_at.clone() });
	}
	let added =
		events[..index].iter().rev().find(|event| event.event.as_deref() == Some(ADDED_TO_QUEUE));
	Some(QueueEvent::Removed(Removal {
		id: last.id.unwrap_or_default(),
		at: last.created_at.clone(),
		added_at: added.and_then(|added| added.created_at.clone()),
	}))
}

fn queue_window_read(events: &[TimelineEvent]) -> bool {
	let Some(index) = events.iter().rposition(queued_event) else {
		return false;
	};
	events[..=index].iter().any(|event| event.event.as_deref() == Some(ADDED_TO_QUEUE))
}

fn queued_event(event: &TimelineEvent) -> bool {
	matches!(event.event.as_deref(), Some(ADDED_TO_QUEUE | REMOVED_FROM_QUEUE))
}

fn ejecting_run<'a>(
	runs: &'a WorkflowRuns,
	number: u64,
	removal: &Removal,
) -> Option<&'a WorkflowRun> {
	let since = removal.added_at.as_deref();
	if let Some(own) = own_queue_run(runs, number, since) {
		return Some(own).filter(|run| red(run.conclusion.as_deref()));
	}
	runs.workflow_runs
		.iter()
		.filter(|run| red(run.conclusion.as_deref()))
		.filter(|run| at_or_after(run.updated_at.as_deref(), since))
		.filter(|run| at_or_after(removal.at.as_deref(), run.updated_at.as_deref()))
		.max_by(|one, other| one.updated_at.cmp(&other.updated_at))
}

fn own_queue_run<'a>(
	runs: &'a WorkflowRuns,
	number: u64,
	since: Option<&str>,
) -> Option<&'a WorkflowRun> {
	let marker = format!("/pr-{number}-");
	runs.workflow_runs.iter().find(|run| {
		let named = run
			.head_branch
			.as_deref()
			.is_some_and(|branch| branch.starts_with(QUEUE_REF_PREFIX) && branch.contains(&marker));
		named && at_or_after(run.created_at.as_deref(), since)
	})
}

fn at_or_after(at: Option<&str>, since: Option<&str>) -> bool {
	match (at, since) {
		(Some(at), Some(since)) => at >= since,
		_ => true,
	}
}

fn red_jobs(jobs: &Jobs) -> Vec<String> {
	jobs.jobs
		.iter()
		.filter(|job| red(job.conclusion.as_deref()))
		.map(|job| match job.steps.iter().find(|step| red(step.conclusion.as_deref())) {
			Some(step) => format!("{}: {}", job.name, step.name),
			None => job.name.clone(),
		})
		.collect()
}

fn held_back(number: u64, blocker: Blocker, checks: Vec<String>) -> MissionEntry {
	entry(
		MissionEventKind::ChecksFailed,
		json!({ "pullRequest": number, "reason": blocker, "checks": checks }),
	)
}

async fn recorded(
	database: &db::Database,
	mission_id: &str,
	held: Option<&Fingerprint>,
	fresh: Fingerprint,
	url: Option<&str>,
	failed: &[String],
) -> Result<Option<Mission>, Failure> {
	if held == Some(&fresh) {
		return Ok(None);
	}
	let entries = appended(held, &fresh, url, failed);
	written(database, mission_id, entries, &fresh, url).await
}

async fn written(
	database: &db::Database,
	mission_id: &str,
	entries: Vec<MissionEntry>,
	fresh: &Fingerprint,
	url: Option<&str>,
) -> Result<Option<Mission>, Failure> {
	let stored = serde_json::to_string(fresh)
		.map_err(|error| Failure::Unreadable(format!("no fingerprint: {error}")))?;
	Ok(database
		.missions()
		.record_github(mission_id.to_owned(), entries, stored, url.map(str::to_owned))
		.await?)
}

fn asks_for_checks(held: Option<&Fingerprint>, pull: &Pull) -> bool {
	held.is_none_or(|held| {
		held.number != pull.number
			|| !held.checks.settled()
			|| held.head_sha != pull.head.sha
			|| held.state != pull.state
	})
}

fn appended(
	held: Option<&Fingerprint>,
	fresh: &Fingerprint,
	url: Option<&str>,
	failed: &[String],
) -> Vec<MissionEntry> {
	let mut entries = Vec::new();
	if let Some(url) = url.filter(|_| held.is_none_or(|held| held.number != fresh.number)) {
		entries.push(entry(
			MissionEventKind::Note,
			json!({ "pullRequest": fresh.number, "url": url }),
		));
	}
	match moved_checks(held, fresh) {
		Some(MissionEventKind::ChecksFailed) => entries.push(entry(
			MissionEventKind::ChecksFailed,
			json!({ "pullRequest": fresh.number, "checks": failed }),
		)),
		Some(kind) => entries.push(entry(kind, json!({ "pullRequest": fresh.number }))),
		None => (),
	}
	if fresh.merged && held.is_none_or(|held| !held.merged) {
		entries.push(entry(
			MissionEventKind::Closed,
			json!({
				"outcome": "done",
				"summary": format!("pull request #{} was merged", fresh.number),
			}),
		));
	}
	entries
}

fn moved_checks(held: Option<&Fingerprint>, fresh: &Fingerprint) -> Option<MissionEventKind> {
	if held.is_some_and(|held| settled_alike(held, fresh)) {
		return None;
	}
	match fresh.checks {
		Checks::Passed if fresh.held_back() => None,
		Checks::Passed => Some(MissionEventKind::Ready),
		Checks::Failed => Some(MissionEventKind::ChecksFailed),
		Checks::None | Checks::Pending => None,
	}
}

fn settled_alike(held: &Fingerprint, fresh: &Fingerprint) -> bool {
	held.checks == fresh.checks && held.head_sha == fresh.head_sha && held.number == fresh.number
}

fn entry(kind: MissionEventKind, payload: serde_json::Value) -> MissionEntry {
	MissionEntry { kind, source: SOURCE.to_owned(), payload }
}

fn concluded(runs: &Runs) -> Settled {
	let failed: Vec<String> = runs
		.check_runs
		.iter()
		.filter(|run| red(run.conclusion.as_deref()))
		.map(|run| run.name.clone())
		.collect();
	if !failed.is_empty() {
		return Settled { checks: Checks::Failed, failed };
	}
	if runs.check_runs.is_empty() {
		return Settled::holding(Checks::None);
	}
	match runs.check_runs.iter().all(|run| run.status == "completed") {
		true => Settled::holding(Checks::Passed),
		false => Settled::holding(Checks::Pending),
	}
}

fn red(conclusion: Option<&str>) -> bool {
	conclusion.is_some_and(|held| FAILED_CONCLUSIONS.contains(&held))
}

async fn read<T: serde::de::DeserializeOwned>(answer: Response) -> Result<Answer<T>, Failure> {
	if answer.status() == StatusCode::NOT_MODIFIED {
		return Ok(Answer::Unchanged);
	}
	if let Some(until_ms) = held_until(&answer) {
		return Ok(Answer::Held { until_ms });
	}
	if !answer.status().is_success() {
		return Err(Failure::Refused(answer.status().as_u16()));
	}
	let etag = answer.headers().get(ETAG).and_then(|held| held.to_str().ok()).map(str::to_owned);
	let held = answer.json::<T>().await.map_err(|error| Failure::Unreadable(error.to_string()))?;
	Ok(Answer::Read { etag, held })
}

fn held_until(answer: &Response) -> Option<i64> {
	let refused = matches!(answer.status(), StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS);
	if !refused {
		return None;
	}
	let headers = answer.headers();
	let spent = seconds(headers, RATE_LIMIT_REMAINING_HEADER) == Some(0);
	if let Some(reset) = seconds(headers, RATE_LIMIT_RESET_HEADER).filter(|_| spent) {
		return Some(reset * 1000);
	}
	seconds(headers, RETRY_AFTER_HEADER).map(|after| SystemClock.now_ms() + after.max(0) * 1000)
}

fn seconds(headers: &HeaderMap, name: &str) -> Option<i64> {
	headers.get(name)?.to_str().ok()?.trim().parse().ok()
}

fn owner_of(repository: &str) -> Result<&str, Failure> {
	repository
		.split_once('/')
		.map(|(owner, _)| owner)
		.ok_or_else(|| Failure::Unreadable("a repository named without an owner".to_owned()))
}

fn token() -> Option<String> {
	["GITHUB_TOKEN", "GH_TOKEN"]
		.into_iter()
		.find_map(|name| std::env::var(name).ok())
		.filter(|held| !held.trim().is_empty())
}

pub(crate) fn installed_tls_provider() {
	static ONCE: std::sync::Once = std::sync::Once::new();
	ONCE.call_once(|| {
		if rustls::crypto::ring::default_provider().install_default().is_err() {
			eprintln!("github is reached through the tls provider already installed");
		}
	});
}

pub(crate) fn headers() -> HeaderMap {
	let mut headers = HeaderMap::new();
	headers.insert(USER_AGENT, HeaderValue::from_static(AGENT));
	headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
	headers.insert(API_VERSION_HEADER, HeaderValue::from_static(API_VERSION));
	headers
}

#[cfg(test)]
mod tests {
	use std::hash::{DefaultHasher, Hash, Hasher};
	use std::net::{Ipv4Addr, SocketAddr};
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::mpsc::channel;
	use std::sync::Arc;

	use axum::extract::{Path as AxumPath, RawQuery, State as Extracted};
	use axum::response::{IntoResponse, Response as Answered};
	use axum::routing::get;
	use axum::Router;
	use reqwest::header::AUTHORIZATION;
	use serde_json::Value;
	use tauri::test::mock_builder;
	use tauri::Listener as _;
	use tokio::sync::Mutex;

	use super::super::commands::CHANGED_EVENT;
	use super::super::contract::{
		MissionDraft, MissionEvent, MissionNote, MissionState, MissionWatch, Ticket,
	};
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const NOON: i64 = 1_800_000_000_000;

	const TIMELINE_PAGE: usize = 100;

	const A_BRANCH: &str = "feature/ope-27";

	const A_REPOSITORY: &str = "shoto290/kiroshi-monorepo";

	const HIDDEN_REPOSITORY: &str = "shoto290/Hidden";

	const A_CHECK: &str = "build";

	const A_PULL_URL: &str = "https://github.test/shoto290/kiroshi-monorepo/pull/7";

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Self {
			Ticking(AtomicI64::new(now))
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	#[derive(Clone, Debug, PartialEq, Eq)]
	struct Asked {
		path: String,
		repository: String,
		conditional_on: Option<String>,
		bearing: bool,
		not_modified: bool,
	}

	struct Answers {
		base: String,
		pulls: Value,
		checks: Value,
		timeline: Value,
		queue_runs: Value,
		jobs: Value,
		etag: String,
		reset_at_s: Option<i64>,
		refused_repository: Option<String>,
		refused_path: Option<(String, Option<i64>)>,
		asked: Vec<Asked>,
	}

	struct Stub {
		base: String,
		answers: Arc<Mutex<Answers>>,
		stop: signal::Sender<bool>,
	}

	impl Stub {
		async fn holding(pulls: Value, etag: &str) -> Self {
			let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
				.await
				.expect("the stub binds");
			let address: SocketAddr = listener.local_addr().expect("the stub is named");
			let base = format!("http://{address}");
			let answers = Arc::new(Mutex::new(Answers {
				base: base.clone(),
				pulls,
				checks: json!({ "check_runs": [] }),
				timeline: json!([]),
				queue_runs: json!({ "workflow_runs": [] }),
				jobs: json!({ "jobs": [] }),
				etag: etag.to_owned(),
				reset_at_s: None,
				refused_repository: None,
				refused_path: None,
				asked: Vec::new(),
			}));
			let (stop, halted) = signal::channel(false);
			let router = Router::new()
				.route("/repos/{owner}/{name}/pulls", get(pulls_of))
				.route("/repos/{owner}/{name}/pulls/{number}", get(pull_of))
				.route("/repos/{owner}/{name}/commits/{sha}/check-runs", get(checks_of))
				.route("/repos/{owner}/{name}/issues/{number}/timeline", get(timeline_of))
				.route("/repos/{owner}/{name}/actions/runs", get(queue_runs_of))
				.route("/repos/{owner}/{name}/actions/runs/{id}/jobs", get(jobs_of))
				.with_state(answers.clone());
			let mut halting = halted;
			tokio::spawn(async move {
				let _ = axum::serve(listener, router)
					.with_graceful_shutdown(async move {
						let _ = halting.changed().await;
					})
					.await;
			});
			Stub { base, answers, stop }
		}

		async fn answering(&self, pulls: Value, etag: &str) {
			let mut held = self.answers.lock().await;
			held.pulls = pulls;
			held.etag = etag.to_owned();
		}

		async fn checking(&self, checks: Value) {
			self.answers.lock().await.checks = checks;
		}

		async fn queueing(&self, timeline: Value, queue_runs: Value, jobs: Value) {
			let mut held = self.answers.lock().await;
			held.timeline = timeline;
			held.queue_runs = queue_runs;
			held.jobs = jobs;
		}

		async fn refusing_path(&self, path: &str, reset_at_s: Option<i64>) {
			self.answers.lock().await.refused_path = Some((path.to_owned(), reset_at_s));
		}

		async fn accepting(&self) {
			self.answers.lock().await.refused_path = None;
		}

		async fn refusing_until(&self, reset_at_s: i64) {
			self.answers.lock().await.reset_at_s = Some(reset_at_s);
		}

		async fn refusing(&self, repository: &str) {
			self.answers.lock().await.refused_repository = Some(repository.to_owned());
		}

		async fn asked_about(&self, path: &str) -> Vec<String> {
			self.asked()
				.await
				.into_iter()
				.filter(|asked| asked.path == path)
				.map(|asked| asked.repository)
				.collect()
		}

		async fn asked(&self) -> Vec<Asked> {
			self.answers.lock().await.asked.clone()
		}

		fn reach(&self) -> Reach {
			Reach::bearing(self.base.clone(), None).expect("the client builds")
		}
	}

	async fn pulls_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name)): AxumPath<(String, String)>,
		headers: HeaderMap,
	) -> Answered {
		let mut held = answers.lock().await;
		let repository = format!("{owner}/{name}");
		let conditional_on =
			headers.get(IF_NONE_MATCH).and_then(|held| held.to_str().ok()).map(str::to_owned);
		held.asked.push(Asked {
			path: "pulls".to_owned(),
			repository: repository.clone(),
			conditional_on: conditional_on.clone(),
			bearing: bearing(&headers),
			not_modified: false,
		});
		if held.refused_repository.as_deref() == Some(repository.as_str()) {
			return (StatusCode::FORBIDDEN, String::new()).into_response();
		}
		if let Some(reset_at_s) = held.reset_at_s {
			return (
				StatusCode::FORBIDDEN,
				[
					(RATE_LIMIT_REMAINING_HEADER, "0".to_owned()),
					(RATE_LIMIT_RESET_HEADER, reset_at_s.to_string()),
				],
				String::new(),
			)
				.into_response();
		}
		if conditional_on.as_deref() == Some(held.etag.as_str()) {
			if let Some(asked) = held.asked.last_mut() {
				asked.not_modified = true;
			}
			return StatusCode::NOT_MODIFIED.into_response();
		}
		as_json(Some(&held.etag), &held.pulls)
	}

	async fn pull_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name, _)): AxumPath<(String, String, String)>,
		headers: HeaderMap,
	) -> Answered {
		answered(&answers, "pull".to_owned(), format!("{owner}/{name}"), &headers, |held| {
			held.pulls[0].clone()
		})
		.await
	}

	async fn checks_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name, _)): AxumPath<(String, String, String)>,
		headers: HeaderMap,
	) -> Answered {
		answered(&answers, "checks".to_owned(), format!("{owner}/{name}"), &headers, |held| {
			held.checks.clone()
		})
		.await
	}

	async fn queue_runs_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name)): AxumPath<(String, String)>,
		headers: HeaderMap,
	) -> Answered {
		answered(&answers, "runs".to_owned(), format!("{owner}/{name}"), &headers, |held| {
			held.queue_runs.clone()
		})
		.await
	}

	async fn jobs_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name, id)): AxumPath<(String, String, String)>,
		headers: HeaderMap,
	) -> Answered {
		answered(&answers, format!("jobs/{id}"), format!("{owner}/{name}"), &headers, |held| {
			held.jobs.clone()
		})
		.await
	}

	async fn timeline_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name, number)): AxumPath<(String, String, String)>,
		RawQuery(query): RawQuery,
		headers: HeaderMap,
	) -> Answered {
		let mut held = answers.lock().await;
		let page = query
			.as_deref()
			.and_then(|query| query.split('&').find_map(|pair| pair.strip_prefix("page=")))
			.and_then(|page| page.parse::<usize>().ok())
			.unwrap_or(1);
		let path = match page {
			1 => "timeline".to_owned(),
			page => format!("timeline/{page}"),
		};
		held.asked.push(Asked {
			path: path.clone(),
			repository: format!("{owner}/{name}"),
			conditional_on: None,
			bearing: bearing(&headers),
			not_modified: false,
		});
		if let Some(refusal) = refusal(&held, &path) {
			return refusal;
		}
		let events = held.timeline.as_array().cloned().expect("the stub timeline is an array");
		let last = events.len().div_ceil(TIMELINE_PAGE).max(1);
		let shown =
			events.into_iter().skip((page - 1) * TIMELINE_PAGE).take(TIMELINE_PAGE).collect();
		let mut answer = as_json(None, &Value::Array(shown));
		if last == 1 {
			return answer;
		}
		let page_url = |page: usize| {
			format!(
				"{}/repos/{owner}/{name}/issues/{number}/timeline?per_page={TIMELINE_PAGE}&page={page}",
				held.base
			)
		};
		let mut links = vec![format!("<{}>; rel=\"last\"", page_url(last))];
		if page > 1 {
			links.push(format!("<{}>; rel=\"prev\"", page_url(page - 1)));
		}
		answer.headers_mut().insert(
			LINK,
			HeaderValue::from_str(&links.join(", ")).expect("the stub link is a header value"),
		);
		answer
	}

	async fn answered(
		answers: &Mutex<Answers>,
		path: String,
		repository: String,
		headers: &HeaderMap,
		body: fn(&Answers) -> Value,
	) -> Answered {
		let mut held = answers.lock().await;
		let conditional_on =
			headers.get(IF_NONE_MATCH).and_then(|held| held.to_str().ok()).map(str::to_owned);
		let body = body(&held);
		let etag = etag_of(&body);
		let refused = refusal(&held, &path);
		let not_modified = refused.is_none() && conditional_on.as_deref() == Some(etag.as_str());
		held.asked.push(Asked {
			path,
			repository,
			conditional_on,
			bearing: bearing(headers),
			not_modified,
		});
		if let Some(refused) = refused {
			return refused;
		}
		if not_modified {
			return StatusCode::NOT_MODIFIED.into_response();
		}
		as_json(Some(&etag), &body)
	}

	fn refusal(held: &Answers, path: &str) -> Option<Answered> {
		let (refused, reset_at_s) = held.refused_path.clone()?;
		if path != refused && !path.starts_with(&format!("{refused}/")) {
			return None;
		}
		Some(match reset_at_s {
			Some(reset_at_s) => (
				StatusCode::FORBIDDEN,
				[
					(RATE_LIMIT_REMAINING_HEADER, "0".to_owned()),
					(RATE_LIMIT_RESET_HEADER, reset_at_s.to_string()),
				],
				String::new(),
			)
				.into_response(),
			None => (StatusCode::INTERNAL_SERVER_ERROR, String::new()).into_response(),
		})
	}

	fn etag_of(body: &Value) -> String {
		let mut hasher = DefaultHasher::new();
		body.to_string().hash(&mut hasher);
		format!("\"{:x}\"", hasher.finish())
	}

	fn bearing(headers: &HeaderMap) -> bool {
		headers
			.get(AUTHORIZATION)
			.and_then(|held| held.to_str().ok())
			.is_some_and(|held| held.starts_with("Bearer "))
	}

	fn as_json(etag: Option<&str>, held: &Value) -> Answered {
		let mut answer = Answered::builder()
			.status(StatusCode::OK)
			.header(reqwest::header::CONTENT_TYPE, "application/json");
		if let Some(etag) = etag {
			answer = answer.header(ETAG, etag);
		}
		answer.body(axum::body::Body::from(held.to_string())).expect("the stub answers with a body")
	}

	fn a_pull(state: &str, head_sha: &str, merged: bool) -> Value {
		json!([{
			"number": 7,
			"state": state,
			"html_url": A_PULL_URL,
			"merged_at": merged.then(|| "2026-09-04T10:00:00Z".to_owned()),
			"head": { "sha": head_sha },
		}])
	}

	fn a_pull_in_queue(auto_merge: bool, mergeable_state: &str, updated_at: &str) -> Value {
		a_pull_numbered(7, auto_merge, mergeable_state, updated_at)
	}

	fn a_pull_numbered(
		number: u64,
		auto_merge: bool,
		mergeable_state: &str,
		updated_at: &str,
	) -> Value {
		json!([{
			"number": number,
			"state": "open",
			"html_url": A_PULL_URL,
			"merged_at": null,
			"head": { "sha": "abc" },
			"auto_merge": auto_merge.then(|| json!({ "merge_method": "squash" })),
			"mergeable_state": mergeable_state,
			"updated_at": updated_at,
		}])
	}

	fn a_timeline(events: &[&str]) -> Value {
		Value::Array(
			events
				.iter()
				.enumerate()
				.map(|(index, event)| json!({ "id": index + 1, "event": event }))
				.collect(),
		)
	}

	fn a_timeline_at(events: &[(&str, Option<u64>, &str)]) -> Value {
		Value::Array(
			events
				.iter()
				.map(|(event, id, at)| json!({ "id": id, "event": event, "created_at": at }))
				.collect(),
		)
	}

	const MERGE_GROUP_RUNS_OF_OCTOBER_20: [(u64, &str, &str, &str, &str); 12] = [
		(
			39502695777,
			"pr-1464-449dc6f3dde1781f5f09425af5938cba43e9e8ea",
			"failure",
			"21:43:45",
			"21:53:13",
		),
		(
			39502670368,
			"pr-1459-9fa22ed84a7356cb0b07424d5e0d7b2fc941c9ca",
			"success",
			"21:43:33",
			"21:54:26",
		),
		(
			39498731185,
			"pr-1461-9fa22ed84a7356cb0b07424d5e0d7b2fc941c9ca",
			"failure",
			"21:14:26",
			"21:24:49",
		),
		(
			39497664694,
			"pr-1463-c54a1ac9ded47859edda764ae587621b4200f3a8",
			"success",
			"21:06:35",
			"21:09:07",
		),
		(
			39493626311,
			"pr-1461-c54a1ac9ded47859edda764ae587621b4200f3a8",
			"failure",
			"20:37:56",
			"20:46:04",
		),
		(
			39493448657,
			"pr-1458-37a4b0bdcb53113991f290b4e46467ef21df8245",
			"success",
			"20:36:41",
			"20:42:36",
		),
		(
			39493075995,
			"pr-1457-ee5e0fab921dda571556d2751f77b3c00d92584d",
			"success",
			"20:34:05",
			"20:44:33",
		),
		(
			39493072332,
			"pr-1460-e84c54ed91b8627da555fb43f10b2bc5e09d3356",
			"success",
			"20:34:03",
			"20:42:36",
		),
		(
			39492927586,
			"pr-1458-5dbeb5e8dc7fc0a360abffab5273ae1356584d3e",
			"success",
			"20:33:03",
			"20:38:50",
		),
		(
			39492582053,
			"pr-1457-b7db962da54fca96ad56a7107ca30e4b124c97fa",
			"failure",
			"20:30:41",
			"20:33:05",
		),
		(
			39492580943,
			"pr-1460-25c31319862d9acb425cf442ae657ee802addde3",
			"failure",
			"20:30:41",
			"20:34:22",
		),
		(
			39492578935,
			"pr-1459-e84c54ed91b8627da555fb43f10b2bc5e09d3356",
			"failure",
			"20:30:40",
			"20:33:36",
		),
	];

	fn merge_group_runs_since(first_id: u64) -> Value {
		let runs = MERGE_GROUP_RUNS_OF_OCTOBER_20
			.iter()
			.skip_while(|(id, ..)| *id != first_id)
			.map(|(id, branch, conclusion, created, updated)| {
				json!({
					"id": id,
					"head_branch": format!("gh-readonly-queue/main/{branch}"),
					"status": "completed",
					"conclusion": conclusion,
					"created_at": format!("2026-10-20T{created}Z"),
					"updated_at": format!("2026-10-20T{updated}Z"),
				})
			})
			.collect::<Vec<_>>();
		json!({ "workflow_runs": runs })
	}

	fn rust_and_verify_red_at_gate() -> Value {
		json!({ "jobs": [
			{ "name": "rust", "conclusion": "failure", "steps": [
				{ "name": "Gate", "conclusion": "failure" },
			] },
			{ "name": "verify", "conclusion": "failure", "steps": [
				{ "name": REQUIRE_RUST, "conclusion": "failure" },
			] },
		] })
	}

	const REQUIRE_RUST: &str =
		"Require rust to succeed when changes selected it, and to be skipped otherwise";

	fn queue_runs(runs: &[(u64, &str)]) -> Value {
		let mut workflow_runs = vec![json!({
			"id": 900,
			"head_branch": "gh-readonly-queue/main/pr-8-0f0f",
			"status": "completed",
			"conclusion": "failure",
		})];
		workflow_runs.extend(runs.iter().map(|(id, conclusion)| {
			json!({
				"id": id,
				"head_branch": format!("gh-readonly-queue/main/pr-7-{id}"),
				"status": "completed",
				"conclusion": conclusion,
			})
		}));
		json!({ "workflow_runs": workflow_runs })
	}

	fn rust_red_at_gate() -> Value {
		json!({ "jobs": [
			{ "name": "lint", "conclusion": "success", "steps": [
				{ "name": "Gate", "conclusion": "success" },
			] },
			{ "name": "rust", "conclusion": "failure", "steps": [
				{ "name": "Install dependencies", "conclusion": "success" },
				{ "name": "Gate", "conclusion": "failure" },
			] },
		] })
	}

	fn a_run(status: &str, conclusion: Option<&str>) -> Value {
		a_run_named(A_CHECK, status, conclusion)
	}

	fn a_run_named(name: &str, status: &str, conclusion: Option<&str>) -> Value {
		json!({ "check_runs": [{ "name": name, "status": status, "conclusion": conclusion }] })
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

	async fn an_armed_mission(database: &Database) -> Mission {
		an_armed_mission_on(database, A_REPOSITORY).await
	}

	async fn an_armed_mission_on(database: &Database, repository: &str) -> Mission {
		let opened = database
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
					tools: vec!["gh".to_owned()],
					source: "bot".to_owned(),
					workspace_path: None,
				},
				uuid::Uuid::new_v4().to_string(),
			)
			.await
			.expect("the mission opens");
		let (armed, _) = database
			.missions()
			.arm(
				opened.id,
				MissionWatch { branch: A_BRANCH.to_owned(), repository: repository.to_owned() },
				uuid::Uuid::new_v4().to_string(),
			)
			.await
			.expect("the mission is armed");
		armed
	}

	async fn events_of(database: &Database, mission_id: &str) -> Vec<MissionEvent> {
		database.missions().detail(mission_id.to_owned()).await.expect("the mission reads").events
	}

	async fn red_checks_of(database: &Database, mission_id: &str) -> usize {
		from_github(database, mission_id)
			.await
			.into_iter()
			.filter(|(kind, _)| *kind == MissionEventKind::ChecksFailed)
			.count()
	}

	async fn from_github(database: &Database, mission_id: &str) -> Vec<(MissionEventKind, Value)> {
		events_of(database, mission_id)
			.await
			.into_iter()
			.filter(|event| event.source == SOURCE)
			.map(|event| (event.kind, event.payload))
			.collect()
	}

	async fn state_seq_of(database: &Database, mission_id: &str) -> i64 {
		database
			.missions()
			.detail(mission_id.to_owned())
			.await
			.expect("the mission reads")
			.mission
			.state_seq
	}

	async fn state_of(database: &Database, mission_id: &str) -> (MissionState, bool) {
		let held = database
			.missions()
			.detail(mission_id.to_owned())
			.await
			.expect("the mission reads")
			.mission;
		(held.state, held.closed_at.is_some())
	}

	fn a_host() -> AppOfItsOwn {
		an_app_of_its_own("mission-github", mock_builder())
	}

	async fn announced_by(
		reach: &Reach,
		database: &Database,
		kept: &mut Kept,
		clock: &Ticking,
	) -> Vec<Value> {
		let app = a_host();
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});
		pass(app.handle(), reach, database, kept, clock).await;
		received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect()
	}

	async fn walked(
		stub: &Stub,
		database: &Database,
		kept: &mut Kept,
		clock: &Ticking,
	) -> Vec<Value> {
		announced_by(&stub.reach(), database, kept, clock).await
	}

	async fn walked_bearing(stub: &Stub, database: &Database, token: Option<&str>) {
		let reach =
			Reach::bearing(stub.base.clone(), token.map(str::to_owned)).expect("the client builds");
		announced_by(&reach, database, &mut Kept::default(), &Ticking::at(NOON)).await;
	}

	#[tokio::test]
	async fn a_pull_request_seen_for_the_first_time_appends_one_note_and_reads_its_check_runs() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await,
			vec![(MissionEventKind::Note, json!({ "pullRequest": 7, "url": A_PULL_URL }))],
		);
		assert_eq!(
			database
				.missions()
				.detail(mission.id.clone())
				.await
				.expect("the mission reads")
				.mission
				.pull_request_url
				.as_deref(),
			Some(A_PULL_URL),
			"the url of the pull request was not kept on the mission"
		);
		assert_eq!(
			stub.asked().await.iter().map(|asked| asked.path.clone()).collect::<Vec<_>>(),
			vec!["pulls".to_owned(), "checks".to_owned()],
			"the first pass did not read the check runs of the pull request it found"
		);

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(from_github(&database, &mission.id).await.len(), 1, "the second pass appended");
		assert_eq!(
			stub.asked_about("pulls").await.len(),
			2,
			"the second pass did not list the pull requests once"
		);
		assert_eq!(
			stub.asked().await[2].conditional_on,
			Some("\"one\"".to_owned()),
			"the second pass was not conditional on the entity tag it kept"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pass_that_writes_tells_the_front_and_a_pass_that_writes_nothing_tells_it_nothing() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();

		let announced = walked(&stub, &database, &mut kept, &clock).await;

		let (state, _) = state_of(&database, &mission.id).await;
		let seq = state_seq_of(&database, &mission.id).await;
		assert_eq!(
			announced,
			vec![json!({
				"missionId": mission.id,
				"spaceId": null,
				"state": state,
				"stateSeq": seq,
				"isAgentRunning": false,
				"lastActivityAt": null,
			})],
			"the front was not told which mission github moved and where it stands"
		);

		let silent = walked(&stub, &database, &mut kept, &clock).await;

		assert!(silent.is_empty(), "a pass that wrote nothing told the front: {silent:?}");

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_listing_answered_not_modified_still_carries_the_checks_to_passed_and_appends_ready()
	{
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;
		stub.checking(a_run("completed", Some("success"))).await;

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			stub.asked().await[2].conditional_on,
			Some("\"one\"".to_owned()),
			"the pass that settled the checks was not answered not modified"
		);
		assert_eq!(
			from_github(&database, &mission.id).await,
			vec![
				(MissionEventKind::Note, json!({ "pullRequest": 7, "url": A_PULL_URL })),
				(MissionEventKind::Ready, json!({ "pullRequest": 7 })),
			],
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_listing_answered_not_modified_carries_the_checks_to_failed_and_appends_checks_failed(
	) {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;
		stub.checking(a_run("completed", Some("failure"))).await;

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({ "pullRequest": 7, "checks": [A_CHECK] }),
			)),
		);
		assert_eq!(
			state_of(&database, &mission.id).await,
			(MissionState::WaitingBot, false),
			"a red check closed the mission instead of handing it back to the bot"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_red_check_state_on_an_unmoved_head_sha_reads_no_check_runs() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.checking(a_run("completed", Some("failure"))).await;
		walked(&stub, &database, &mut kept, &clock).await;
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));
		let read_checks = stub.asked_about("checks").await.len();

		stub.answering(a_pull("open", "abc", false), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			stub.asked_about("checks").await.len(),
			read_checks,
			"a red check state on an unmoved head sha was read again"
		);
		assert_eq!(from_github(&database, &mission.id).await.len(), 2);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_refusal_carrying_no_rate_limit_leaves_the_other_watched_mission_read_on_that_pass() {
		let (database, dir) = planted().await;
		let hidden = an_armed_mission_on(&database, HIDDEN_REPOSITORY).await;
		let read = an_armed_mission_on(&database, A_REPOSITORY).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.refusing(HIDDEN_REPOSITORY).await;

		walked(&stub, &database, &mut kept, &clock).await;

		let listed = stub.asked_about("pulls").await;
		assert!(listed.contains(&HIDDEN_REPOSITORY.to_owned()), "got {listed:?}");
		assert!(
			listed.contains(&A_REPOSITORY.to_owned()),
			"the refused repository ended the pass: {listed:?}"
		);
		assert!(from_github(&database, &hidden.id).await.is_empty());
		assert_eq!(
			from_github(&database, &read.id).await.first(),
			Some(&(MissionEventKind::Note, json!({ "pullRequest": 7, "url": A_PULL_URL }))),
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_token_in_the_environment_is_carried_as_a_bearer_and_the_pass_runs_without_one() {
		let (database, dir) = planted().await;
		an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;

		walked_bearing(&stub, &database, None).await;
		walked_bearing(&stub, &database, Some("a-token-from-the-environment")).await;

		assert_eq!(
			stub.asked().await.iter().map(|asked| asked.bearing).collect::<Vec<_>>(),
			vec![false, false, true, true],
			"a request was made without the bearer the pass was given"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn check_runs_all_concluded_and_none_failed_append_ready() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "def", false), "\"two\"").await;
		stub.checking(a_run("completed", Some("success"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(MissionEventKind::Ready, json!({ "pullRequest": 7 }))),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_check_run_concluded_in_failure_appends_checks_failed_naming_every_red_check() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "def", false), "\"two\"").await;
		stub.checking(json!({
			"check_runs": [
				{ "name": A_CHECK, "status": "completed", "conclusion": "failure" },
				{ "name": "lint", "status": "completed", "conclusion": "success" },
				{ "name": "types", "status": "completed", "conclusion": "timed_out" },
			]
		}))
		.await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({ "pullRequest": 7, "checks": [A_CHECK, "types"] }),
			)),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_same_red_checks_polled_again_on_the_same_head_sha_append_nothing_more() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.checking(a_run("completed", Some("failure"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "abc", false), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;
		stub.answering(a_pull("open", "abc", false), "\"three\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			1,
			"the same red fingerprint was appended more than once"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn red_checks_on_a_head_sha_the_fingerprint_never_held_append_a_second_checks_failed() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.checking(a_run("completed", Some("failure"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "def", false), "\"two\"").await;
		stub.checking(a_run_named("lint", "completed", Some("failure"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			2,
			"a red check on a fresh head sha was swallowed as the settlement already held"
		);
		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({ "pullRequest": 7, "checks": ["lint"] }),
			)),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn checks_passing_after_a_red_check_append_ready_and_the_mission_reads_ready_to_merge() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.checking(a_run("completed", Some("failure"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("open", "def", false), "\"two\"").await;
		stub.checking(a_run("completed", Some("success"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(MissionEventKind::Ready, json!({ "pullRequest": 7 }))),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_merged_pull_request_appends_closed_naming_it_and_the_mission_closes() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull("closed", "abc", true), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::Closed,
				json!({ "outcome": "done", "summary": "pull request #7 was merged" }),
			)),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::Done, true));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_reopened_after_its_pull_request_merged_is_not_closed_again_by_that_merge() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;
		stub.answering(a_pull("closed", "abc", true), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;
		database
			.missions()
			.reopen(mission.id.clone(), "person".to_owned())
			.await
			.expect("the mission reopens");

		walked(&stub, &database, &mut kept, &clock).await;
		stub.answering(a_pull("closed", "abc", true), "\"three\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		let closings = from_github(&database, &mission.id)
			.await
			.into_iter()
			.filter(|(kind, _)| *kind == MissionEventKind::Closed)
			.count();
		assert_eq!(closings, 1, "the merge seen before the reopen closed the mission again");
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::Working, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_closed_between_two_passes_is_neither_read_nor_appended_to() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;
		database
			.missions()
			.append(
				mission.id.clone(),
				MissionEntry::of(
					MissionEventKind::Closed,
					MissionNote { source: "human".to_owned(), payload: json!({}) },
				),
			)
			.await
			.expect("the mission closes");
		let asked = stub.asked().await.len();

		stub.answering(a_pull("closed", "def", true), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.len(),
			1,
			"the closed mission was appended to"
		);
		assert_eq!(stub.asked().await.len(), asked, "the closed mission was read on github");

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_watched_mission_a_person_closed_stays_closed_when_its_pull_request_merges() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &clock).await;
		database
			.missions()
			.dismiss(mission.id.clone(), "person".to_owned())
			.await
			.expect("the mission closes");

		stub.answering(a_pull("closed", "abc", true), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert!(
			!from_github(&database, &mission.id)
				.await
				.iter()
				.any(|(kind, _)| *kind == MissionEventKind::Closed),
			"the merge closed a mission the person had closed"
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::Closed, true));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_refusal_carrying_a_rate_limit_reset_stops_every_request_before_that_reset() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.refusing_until(NOON / 1000 + 600).await;

		walked(&stub, &database, &mut kept, &clock).await;
		let refused = stub.asked().await.len();
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(refused, 1, "the refusal was not the end of the pass");
		assert_eq!(stub.asked().await.len(), 1, "a request landed before the reset");
		assert!(from_github(&database, &mission.id).await.is_empty());

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn ready_in_queue(pull: Value) -> (Database, RemovedOnDrop, Mission, Stub, Kept) {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(pull, "\"one\"").await;
		stub.checking(a_run("completed", Some("success"))).await;
		let mut kept = Kept::default();
		walked(&stub, &database, &mut kept, &Ticking::at(NOON)).await;
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));
		(database, dir, mission, stub, kept)
	}

	async fn fingerprint_of(database: &Database, mission_id: &str) -> Value {
		let watched = database.missions().watched().await.expect("the watched missions read");
		let held = watched
			.into_iter()
			.find(|mission| mission.id == mission_id)
			.expect("the mission is watched")
			.fingerprint;
		serde_json::from_str(&held).expect("the fingerprint is JSON")
	}

	#[tokio::test]
	async fn a_pull_request_whose_auto_merge_drops_after_green_head_checks_appends_one_ejection() {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(
			a_timeline(&["added_to_merge_queue", "removed_from_merge_queue"]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;

		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({
					"pullRequest": 7,
					"reason": "merge_queue_ejected",
					"checks": ["rust: Gate"],
				}),
			)),
		);
		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			1,
			"the same ejection read on two ticks was appended twice"
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pull_request_turned_dirty_by_a_merge_on_main_appends_one_conflict_then_ready_once_clean(
	) {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		stub.answering(a_pull_in_queue(false, "dirty", "t2"), "\"two\"").await;

		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({
					"pullRequest": 7,
					"reason": "conflicts_with_main",
					"checks": ["conflicts with main"],
				}),
			)),
		);
		assert_eq!(red_checks_of(&database, &mission.id).await, 1);
		assert!(
			stub.asked_about("runs").await.is_empty(),
			"the queue dropping a conflicted pull request was read as a second ejection"
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"three\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(MissionEventKind::Ready, json!({ "pullRequest": 7 }))),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_batch_victim_removed_from_the_queue_returns_to_ready_on_a_green_merge_group_run() {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(false, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(
			a_timeline(&["added_to_merge_queue", "removed_from_merge_queue"]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({
					"pullRequest": 7,
					"reason": "merge_queue_ejected",
					"checks": ["rust: Gate"],
				}),
			)),
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.answering(a_pull_in_queue(false, "clean", "t3"), "\"three\"").await;
		stub.queueing(
			a_timeline(&[
				"added_to_merge_queue",
				"removed_from_merge_queue",
				"added_to_merge_queue",
			]),
			queue_runs(&[(102, "success"), (101, "failure")]),
			rust_red_at_gate(),
		)
		.await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(MissionEventKind::Ready, json!({ "pullRequest": 7 }))),
		);
		assert_eq!(red_checks_of(&database, &mission.id).await, 1);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn head_checks_held_as_passed_that_turn_red_on_a_rerun_append_checks_failed_naming_them()
	{
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		stub.checking(a_run("completed", Some("failure"))).await;

		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await.last(),
			Some(&(
				MissionEventKind::ChecksFailed,
				json!({ "pullRequest": 7, "checks": [A_CHECK] }),
			)),
		);
		assert_eq!(red_checks_of(&database, &mission.id).await, 1);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_fingerprint_stored_before_the_queue_was_watched_reads_without_appending_anything() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		database
			.missions()
			.record_github(
				mission.id.clone(),
				vec![entry(MissionEventKind::Ready, json!({ "pullRequest": 7 }))],
				r#"{"number":7,"state":"open","headSha":"abc","checks":"passed","merged":false}"#
					.to_owned(),
				Some(A_PULL_URL.to_owned()),
			)
			.await
			.expect("the legacy fingerprint is kept");
		let stub = Stub::holding(a_pull_in_queue(false, "dirty", "t2"), "\"one\"").await;
		stub.checking(a_run("completed", Some("success"))).await;
		stub.queueing(
			a_timeline(&["removed_from_merge_queue"]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		let before = from_github(&database, &mission.id).await;

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(from_github(&database, &mission.id).await, before, "the legacy read appended");
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));
		assert_eq!(
			fingerprint_of(&database, &mission.id).await["queue"],
			json!({
				"autoMerge": false,
				"updatedAt": "t2",
				"ejectedByEvent": null,
				"conflictedOn": null,
				"blocker": null,
			}),
		);

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			1,
			"the read after the legacy one did not hear the conflict"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_pull_request_with_pending_head_checks_is_read_with_no_extra_request() {
		let (database, dir) = planted().await;
		an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull_in_queue(false, "dirty", "t1"), "\"one\"").await;
		stub.checking(a_run("in_progress", None)).await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();

		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;
		stub.answering(a_pull_in_queue(false, "dirty", "t2"), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			stub.asked().await.iter().map(|asked| asked.path.as_str()).collect::<Vec<_>>(),
			vec!["pulls", "checks", "pulls", "checks", "pulls", "checks"],
			"a pull request with pending head checks was read beyond its listing and checks"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_merge_group_read_answered_an_error_or_a_hold_leaves_state_and_fingerprint_unchanged()
	{
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		let fingerprint = fingerprint_of(&database, &mission.id).await;
		let events = from_github(&database, &mission.id).await;
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(
			a_timeline(&["added_to_merge_queue", "removed_from_merge_queue"]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;

		stub.refusing_path("runs", None).await;
		walked(&stub, &database, &mut kept, &clock).await;
		stub.refusing_path("runs", Some(NOON / 1000 + 600)).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(from_github(&database, &mission.id).await, events);
		assert_eq!(fingerprint_of(&database, &mission.id).await, fingerprint);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));
		assert!(kept.held(NOON), "the hold the merge group read answered was not kept");

		stub.accepting().await;
		walked(&stub, &database, &mut kept, &Ticking::at(NOON + 601_000)).await;

		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			1,
			"the ejection was lost once the merge group read answered again"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_ejection_read_again_on_later_ticks_appends_nothing() {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(false, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		let ejected = a_timeline(&["added_to_merge_queue", "removed_from_merge_queue"]);
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(ejected, queue_runs(&[(101, "failure")]), rust_red_at_gate()).await;
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull_in_queue(false, "clean", "t3"), "\"three\"").await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			1,
			"the same removal from the queue was appended a second time"
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_green_mission_on_an_unmoved_pull_request_costs_two_not_modified_answers_per_tick() {
		let (database, dir, _, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		walked(&stub, &database, &mut kept, &clock).await;
		let before = stub.asked().await.len();

		walked(&stub, &database, &mut kept, &clock).await;

		let tick: Vec<(String, bool, bool)> = stub.asked().await[before..]
			.iter()
			.map(|asked| (asked.path.clone(), asked.conditional_on.is_some(), asked.not_modified))
			.collect();
		assert_eq!(
			tick,
			vec![("pull".to_owned(), true, true), ("checks".to_owned(), true, true)],
			"an unmoved green pull request cost more than two not modified answers"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_blocked_mission_whose_head_checks_go_pending_then_passed_on_the_same_sha_appends_no_ready(
	) {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(
			a_timeline(&["added_to_merge_queue", "removed_from_merge_queue"]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;
		walked(&stub, &database, &mut kept, &clock).await;
		let ejected = from_github(&database, &mission.id).await;

		stub.checking(a_run("in_progress", None)).await;
		walked(&stub, &database, &mut kept, &clock).await;
		stub.checking(a_run("completed", Some("success"))).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			from_github(&database, &mission.id).await,
			ejected,
			"a re-run on the ejected head sha appended an entry"
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_timeline_longer_than_one_page_is_read_for_its_latest_queue_event_from_the_last_page()
	{
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		let mut events = vec!["added_to_merge_queue"];
		events.extend(std::iter::repeat_n("commented", 120));
		events.push("removed_from_merge_queue");
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(a_timeline(&events), queue_runs(&[(101, "failure")]), rust_red_at_gate())
			.await;

		walked(&stub, &database, &mut kept, &clock).await;

		assert!(
			stub.asked().await.iter().any(|asked| asked.path == "timeline/2"),
			"the last page of the timeline was not read"
		);
		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			1,
			"the removal on the last page of the timeline was not heard"
		);

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn ejected_in_batch(
		number: u64,
		queued: Value,
		ejected: Value,
		runs: Value,
	) -> (Vec<(MissionEventKind, Value)>, Vec<String>) {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_numbered(number, false, "clean", "queued")).await;
		stub.queueing(queued, json!({ "workflow_runs": [] }), json!({ "jobs": [] })).await;
		let clock = Ticking::at(NOON);
		walked(&stub, &database, &mut kept, &clock).await;
		stub.answering(a_pull_numbered(number, false, "clean", "ejected"), "\"two\"").await;
		stub.queueing(ejected, runs, rust_and_verify_red_at_gate()).await;

		walked(&stub, &database, &mut kept, &clock).await;

		let jobs_read = stub
			.asked()
			.await
			.into_iter()
			.filter(|asked| asked.path.starts_with("jobs/"))
			.map(|asked| asked.path)
			.collect();
		let events = from_github(&database, &mission.id).await;
		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
		(events, jobs_read)
	}

	fn ejected_by_its_batch(number: u64) -> (MissionEventKind, Value) {
		(
			MissionEventKind::ChecksFailed,
			json!({
				"pullRequest": number,
				"reason": "merge_queue_ejected",
				"checks": ["rust: Gate", format!("verify: {REQUIRE_RUST}")],
			}),
		)
	}

	#[tokio::test]
	async fn a_pull_request_ejected_inside_a_batch_names_the_red_jobs_of_the_run_that_ejected_its_batch(
	) {
		let queue_of_1461 = [
			("added_to_merge_queue", Some(33783317038), "2026-10-20T20:37:41Z"),
			("removed_from_merge_queue", Some(33784016820), "2026-10-20T20:46:19Z"),
			("added_to_merge_queue", Some(33786198713), "2026-10-20T21:14:08Z"),
			("removed_from_merge_queue", Some(33786981687), "2026-10-20T21:24:57Z"),
			("added_to_merge_queue", Some(33788328282), "2026-10-20T21:43:26Z"),
			("removed_from_merge_queue", Some(33789107681), "2026-10-20T21:54:53Z"),
		];
		let (events, jobs_read) = ejected_in_batch(
			1461,
			a_timeline_at(&queue_of_1461[..5]),
			a_timeline_at(&queue_of_1461),
			merge_group_runs_since(39502695777),
		)
		.await;

		assert_eq!(events.last(), Some(&ejected_by_its_batch(1461)));
		assert_eq!(
			jobs_read,
			vec!["jobs/39502695777".to_owned()],
			"#1461 was named after one of its own earlier runs, not the #1464 batch run"
		);

		let queue_of_1462 = [
			("auto_merge_enabled", None, "2026-10-20T20:40:20Z"),
			("added_to_merge_queue", None, "2026-10-20T20:42:07Z"),
			("removed_from_merge_queue", Some(33784017181), "2026-10-20T20:46:20Z"),
		];
		let (events, jobs_read) = ejected_in_batch(
			1462,
			a_timeline_at(&queue_of_1462[..2]),
			a_timeline_at(&queue_of_1462),
			merge_group_runs_since(39493626311),
		)
		.await;

		assert_eq!(events.last(), Some(&ejected_by_its_batch(1462)));
		assert_eq!(
			jobs_read,
			vec!["jobs/39493626311".to_owned()],
			"#1462 was not named after the #1461 run that ejected its batch"
		);
	}

	#[tokio::test]
	async fn auto_merge_dropped_with_no_removal_after_the_last_add_appends_nothing() {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(true, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		let before = from_github(&database, &mission.id).await;
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(
			a_timeline(&[
				"added_to_merge_queue",
				"removed_from_merge_queue",
				"added_to_merge_queue",
			]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;

		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(from_github(&database, &mission.id).await, before);
		assert!(stub.asked_about("runs").await.is_empty(), "a dropped auto merge read the runs");
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_second_ejection_with_no_newer_merge_group_run_still_appends_one_checks_failed() {
		let (database, dir, mission, stub, mut kept) =
			ready_in_queue(a_pull_in_queue(false, "clean", "t1")).await;
		let clock = Ticking::at(NOON);
		stub.answering(a_pull_in_queue(false, "clean", "t2"), "\"two\"").await;
		stub.queueing(
			a_timeline(&["added_to_merge_queue", "removed_from_merge_queue"]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;
		walked(&stub, &database, &mut kept, &clock).await;

		stub.answering(a_pull_in_queue(false, "clean", "t3"), "\"three\"").await;
		stub.queueing(
			a_timeline(&[
				"added_to_merge_queue",
				"removed_from_merge_queue",
				"added_to_merge_queue",
				"removed_from_merge_queue",
			]),
			queue_runs(&[(101, "failure")]),
			rust_red_at_gate(),
		)
		.await;
		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			red_checks_of(&database, &mission.id).await,
			2,
			"a second removal on the same merge group run was swallowed or doubled"
		);
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::WaitingBot, false));

		stub.stop.send_replace(true);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
