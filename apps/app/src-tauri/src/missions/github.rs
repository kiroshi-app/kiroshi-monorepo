use std::collections::HashMap;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ETAG, IF_NONE_MATCH, USER_AGENT};
use reqwest::{Client, Response, StatusCode};
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

	async fn checks(&self, repository: &str, head_sha: &str) -> Result<Answer<Runs>, Failure> {
		let url = format!("{}/repos/{repository}/commits/{head_sha}/check-runs", self.base);
		read(self.sent(url, None).await?).await
	}
}

#[derive(Default)]
pub(crate) struct Kept {
	etags: HashMap<String, String>,
	held_until_ms: Option<i64>,
}

impl Kept {
	fn held(&self, now_ms: i64) -> bool {
		self.held_until_ms.is_some_and(|until| now_ms < until)
	}

	fn hold_until(&mut self, until_ms: i64) {
		self.held_until_ms = Some(until_ms);
	}

	fn remember(&mut self, mission_id: &str, etag: Option<String>) {
		if let Some(etag) = etag {
			self.etags.insert(mission_id.to_owned(), etag);
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
}

#[derive(Debug, Clone, Deserialize)]
struct Head {
	sha: String,
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
}

impl Fingerprint {
	fn held(stored: &str) -> Result<Option<Self>, Failure> {
		if stored.is_empty() {
			return Ok(None);
		}
		serde_json::from_str(stored)
			.map(Some)
			.map_err(|error| Failure::Unreadable(format!("a fingerprint it kept: {error}")))
	}

	fn of(pull: &Pull, checks: Checks) -> Self {
		Self {
			number: pull.number,
			state: pull.state.clone(),
			head_sha: pull.head.sha.clone(),
			checks,
			merged: pull.merged_at.is_some(),
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
	let sent = kept.etags.get(&mission.id).cloned();
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
		kept.remember(&mission.id, etag);
		return Ok(None);
	};
	let settled = match asks_for_checks(held.as_ref(), &pull) {
		false => Settled::holding(held.as_ref().map_or(Checks::None, |held| held.checks)),
		true => match learned_checks(reach, kept, &mission.repository, &pull.head.sha).await? {
			Some(settled) => settled,
			None => return Ok(None),
		},
	};
	let fresh = Fingerprint::of(&pull, settled.checks);
	let written = recorded(
		database,
		&mission.id,
		held.as_ref(),
		fresh,
		Some(&pull.html_url),
		&settled.failed,
	)
	.await?;
	kept.remember(&mission.id, etag);
	Ok(written)
}

async fn learned_checks(
	reach: &Reach,
	kept: &mut Kept,
	repository: &str,
	head_sha: &str,
) -> Result<Option<Settled>, Failure> {
	match reach.checks(repository, head_sha).await? {
		Answer::Read { held: runs, .. } => Ok(Some(concluded(&runs))),
		Answer::Unchanged => Ok(None),
		Answer::Held { until_ms } => {
			kept.hold_until(until_ms);
			Ok(None)
		}
	}
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
	let stored = serde_json::to_string(&fresh)
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
	let failed: Vec<String> =
		runs.check_runs.iter().filter(|run| failed(run)).map(|run| run.name.clone()).collect();
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

fn failed(run: &CheckRun) -> bool {
	run.conclusion.as_deref().is_some_and(|held| FAILED_CONCLUSIONS.contains(&held))
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
	use std::net::{Ipv4Addr, SocketAddr};
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::mpsc::channel;
	use std::sync::Arc;

	use axum::extract::{Path as AxumPath, State as Extracted};
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
	}

	struct Answers {
		pulls: Value,
		checks: Value,
		etag: String,
		reset_at_s: Option<i64>,
		refused_repository: Option<String>,
		asked: Vec<Asked>,
	}

	struct Stub {
		base: String,
		answers: Arc<Mutex<Answers>>,
		stop: signal::Sender<bool>,
	}

	impl Stub {
		async fn holding(pulls: Value, etag: &str) -> Self {
			let answers = Arc::new(Mutex::new(Answers {
				pulls,
				checks: json!({ "check_runs": [] }),
				etag: etag.to_owned(),
				reset_at_s: None,
				refused_repository: None,
				asked: Vec::new(),
			}));
			let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
				.await
				.expect("the stub binds");
			let address: SocketAddr = listener.local_addr().expect("the stub is named");
			let (stop, halted) = signal::channel(false);
			let router = Router::new()
				.route("/repos/{owner}/{name}/pulls", get(pulls_of))
				.route("/repos/{owner}/{name}/commits/{sha}/check-runs", get(checks_of))
				.with_state(answers.clone());
			let mut halting = halted;
			tokio::spawn(async move {
				let _ = axum::serve(listener, router)
					.with_graceful_shutdown(async move {
						let _ = halting.changed().await;
					})
					.await;
			});
			Stub { base: format!("http://{address}"), answers, stop }
		}

		async fn answering(&self, pulls: Value, etag: &str) {
			let mut held = self.answers.lock().await;
			held.pulls = pulls;
			held.etag = etag.to_owned();
		}

		async fn checking(&self, checks: Value) {
			self.answers.lock().await.checks = checks;
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
			return StatusCode::NOT_MODIFIED.into_response();
		}
		as_json(Some(&held.etag), &held.pulls)
	}

	async fn checks_of(
		Extracted(answers): Extracted<Arc<Mutex<Answers>>>,
		AxumPath((owner, name, _)): AxumPath<(String, String, String)>,
		headers: HeaderMap,
	) -> Answered {
		let mut held = answers.lock().await;
		held.asked.push(Asked {
			path: "checks".to_owned(),
			repository: format!("{owner}/{name}"),
			conditional_on: None,
			bearing: bearing(&headers),
		});
		as_json(None, &held.checks)
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
	async fn a_settled_check_state_on_an_unmoved_head_sha_reads_no_check_runs() {
		let (database, dir) = planted().await;
		let mission = an_armed_mission(&database).await;
		let stub = Stub::holding(a_pull("open", "abc", false), "\"one\"").await;
		let clock = Ticking::at(NOON);
		let mut kept = Kept::default();
		stub.checking(a_run("completed", Some("success"))).await;
		walked(&stub, &database, &mut kept, &clock).await;
		assert_eq!(state_of(&database, &mission.id).await, (MissionState::ReadyToMerge, false));
		let read_checks = stub.asked_about("checks").await.len();

		stub.answering(a_pull("open", "abc", false), "\"two\"").await;
		walked(&stub, &database, &mut kept, &clock).await;
		walked(&stub, &database, &mut kept, &clock).await;

		assert_eq!(
			stub.asked_about("checks").await.len(),
			read_checks,
			"a settled check state on an unmoved head sha was read again"
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
}
