use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::Duration;

use chrono::{DateTime, SecondsFormat};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch as signal;
use tokio::sync::Mutex;

use super::contract::{
	Application, ApplicationSearch, ApplicationsError, AuthPosture, Install, InstallField,
};
use super::registry::{client, endpoint, parsed, read, variable};
use super::search::terms;
use crate::account::cloud::api_url;
use crate::db::repositories::catalogue::folded;
use crate::events::{self, APPLICATION_DIRECTORY_REFRESHED};
use crate::routines::core::{Clock, SystemClock};

const SEGMENTS: [&str; 3] = ["api", "directory", "servers"];

const LIMIT: &str = "100";

const SERVED_TIERS: [Tier; 2] = [Tier::Curated, Tier::Partner];

const SCHEMA: u32 = 3;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

const WEEK_MS: i64 = 7 * DAY_MS;

const RETRY_MS: i64 = 60 * 1000;

const REREAD_MS: i64 = 10 * 60 * 1000;

const TICK: Duration = Duration::from_secs(60 * 60);

const FIRST_READ_WAIT: Duration = Duration::from_secs(10);

const REFRESH_BOUND: Duration = Duration::from_secs(60);

const CACHE_DIR: &str = "applications";

const CACHE_FILE: &str = "directory.json";

const UNNAMED: &str = "<unnamed>";

const OTHER: &str = "Other";

pub const BUCKETS: [(&str, &[&str]); 16] = [
	("Commerce & shopping", &["commerce-shopping", "e-commerce"]),
	("Communication", &["communication"]),
	("Consumer health", &["consumer-health"]),
	("Creative", &["creative", "design"]),
	("Data & analytics", &["data-analytics", "data"]),
	("Developer tools", &["developer-tools", "code"]),
	("Education", &["education"]),
	("Financial services", &["financial-services"]),
	("Health & life sciences", &["health-life-sciences", "life-sciences", "health", "healthcare"]),
	("Legal", &["legal"]),
	("Media & entertainment", &["media-entertainment"]),
	("Nonprofit", &["nonprofit"]),
	("Productivity", &["productivity", "business-productivity"]),
	("Sales & marketing", &["sales-and-marketing"]),
	("Travel", &["travel"]),
	(OTHER, &["other", "technology"]),
];

const AUTH_REQUIRED: &str = "auth_required";

const NO_AUTH: &str = "no_auth";

#[derive(Deserialize)]
struct Page {
	servers: Vec<Value>,
	next_cursor: Option<String>,
	stale_feeds: Vec<String>,
}

#[derive(Deserialize)]
struct Entry {
	id: String,
	name: String,
	display_name: String,
	one_liner: Option<String>,
	description: Option<String>,
	icon_url: Option<String>,
	tool_names: Vec<String>,
	categories: Vec<String>,
	popularity_score: Option<f64>,
	rank: Option<i64>,
	tier: Tier,
	config: Map<String, Value>,
	remote: Option<Remote>,
	local: Option<Local>,
}

#[derive(Deserialize)]
struct Remote {
	auth_posture: String,
	required_fields: Vec<RequiredField>,
}

#[derive(Deserialize)]
struct RequiredField {
	field: String,
}

#[derive(Deserialize)]
struct Local {
	packages: Vec<Package>,
}

#[derive(Deserialize)]
struct Package {
	environment_variables: Vec<Variable>,
}

#[derive(Deserialize)]
struct Variable {
	name: String,
	description: Option<String>,
	is_secret: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Tier {
	Curated,
	Partner,
	Community,
}

impl Tier {
	fn named(self) -> &'static str {
		match self {
			Tier::Curated => "curated",
			Tier::Partner => "partner",
			Tier::Community => "community",
		}
	}
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Row {
	id: String,
	tier: Tier,
	rank: Option<i64>,
	application: Application,
}

#[derive(Default)]
struct Listing {
	rows: Vec<Row>,
	is_feed_stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cached {
	schema: u32,
	read_at: i64,
	listed_at: i64,
	is_feed_stale: bool,
	rows: Vec<Row>,
}

#[derive(Default)]
struct Held {
	cached: Option<Cached>,
	failure: Option<Failure>,
	is_disk_read: bool,
}

struct Failure {
	error: ApplicationsError,
	at: i64,
}

pub struct Directory {
	base: String,
	file: Option<PathBuf>,
	clock: Box<dyn Clock>,
	held: RwLock<Held>,
	reading: Arc<Mutex<()>>,
	stop: signal::Sender<bool>,
	landed: signal::Sender<()>,
	first_read_wait: Duration,
	refresh_bound: Duration,
}

impl std::fmt::Debug for Directory {
	fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		formatter
			.debug_struct("Directory")
			.field("base", &self.base)
			.field("is_held", &self.kept().cached.is_some())
			.finish()
	}
}

impl Directory {
	pub fn at(base: String, file: Option<PathBuf>) -> Arc<Self> {
		Self::timed(base, file, Box::new(SystemClock))
	}

	fn timed(base: String, file: Option<PathBuf>, clock: Box<dyn Clock>) -> Arc<Self> {
		Arc::new(Self {
			base,
			file,
			clock,
			held: RwLock::new(Held::default()),
			reading: Arc::new(Mutex::new(())),
			stop: signal::channel(false).0,
			landed: signal::channel(()).0,
			first_read_wait: FIRST_READ_WAIT,
			refresh_bound: REFRESH_BOUND,
		})
	}

	pub fn stop(&self) {
		self.stop.send_replace(true);
	}

	pub async fn searched(
		self: &Arc<Self>,
		query: &str,
	) -> Result<ApplicationSearch, ApplicationsError> {
		self.answered(|cached, failure, is_stale| ApplicationSearch {
			applications: matched(&cached.rows, query),
			registry_failure: failure.cloned(),
			read_at: Some(cached.read_at),
			is_stale: Some(is_stale),
		})
		.await
	}

	pub async fn named(
		self: &Arc<Self>,
		name: &str,
	) -> Result<Option<Application>, ApplicationsError> {
		self.answered(|cached, _, _| {
			cached.rows.iter().map(|row| &row.application).find(|held| held.name == name).cloned()
		})
		.await
	}

	pub async fn curated(self: &Arc<Self>) -> Result<Vec<Application>, ApplicationsError> {
		self.answered(|cached, _, _| {
			distinct(cached.rows.iter().filter(|row| row.tier == Tier::Curated)).cloned().collect()
		})
		.await
	}

	pub async fn refreshed(&self) {
		let _reading = self.reading.lock().await;
		self.kept_file();
		if self.is_fresh() {
			return;
		}
		self.fetched().await;
	}

	async fn answered<T>(
		self: &Arc<Self>,
		answer: impl FnOnce(&Cached, Option<&ApplicationsError>, bool) -> T,
	) -> Result<T, ApplicationsError> {
		self.kept_file();
		if self.is_due() {
			self.renewing();
		}
		if self.kept().cached.is_none() {
			self.first_read().await?;
		}
		let now = self.clock.now_ms();
		let held = self.kept();
		let failure = held.failure.as_ref().map(|failure| &failure.error);
		let Some(cached) = held.cached.as_ref() else {
			return Err(failure.cloned().unwrap_or_else(unread_directory));
		};
		let is_stale = failure.is_some() || is_due(&held, now);
		Ok(answer(cached, failure, is_stale))
	}

	fn renewing(self: &Arc<Self>) {
		let Ok(flight) = self.reading.clone().try_lock_owned() else {
			return;
		};
		let directory = self.clone();
		tokio::spawn(async move {
			let _flight = flight;
			if directory.is_due() {
				directory.fetched().await;
			}
		});
	}

	async fn first_read(&self) -> Result<(), ApplicationsError> {
		match tokio::time::timeout(self.first_read_wait, self.reading.lock()).await {
			Ok(_flight) => Ok(()),
			Err(_) => Err(unread_within(self.first_read_wait)),
		}
	}

	fn kept(&self) -> RwLockReadGuard<'_, Held> {
		self.held.read().unwrap_or_else(PoisonError::into_inner)
	}

	fn keeping(&self) -> RwLockWriteGuard<'_, Held> {
		self.held.write().unwrap_or_else(PoisonError::into_inner)
	}

	fn is_due(&self) -> bool {
		is_due(&self.kept(), self.clock.now_ms())
	}

	fn is_fresh(&self) -> bool {
		let now = self.clock.now_ms();
		self.kept().cached.as_ref().is_some_and(|cached| {
			!is_stale(cached.read_at, now) && !is_unlisted(cached.listed_at, now)
		})
	}

	fn kept_file(&self) {
		if self.kept().is_disk_read {
			return;
		}
		let mut held = self.keeping();
		if held.is_disk_read {
			return;
		}
		held.is_disk_read = true;
		held.cached = self.file.as_deref().and_then(from_file).map(without_community);
	}

	fn mergeable(&self, now: i64) -> Option<(String, Cached)> {
		let cached = self
			.kept()
			.cached
			.clone()
			.filter(|cached| !cached.is_feed_stale && !is_unlisted(cached.listed_at, now))?;
		Some((instant(cached.read_at)?, cached))
	}

	async fn fetched(&self) {
		let now = self.clock.now_ms();
		let read = match self.mergeable(now) {
			Some((since, cached)) => {
				self.listed(Some(&since)).await.map(|listing| merged(cached, listing, now))
			}
			None => self.listed(None).await.and_then(|listing| replaced(listing, now)),
		};
		match read.map(without_community) {
			Ok(cached) => {
				if let Some(file) = self.file.as_deref() {
					to_file(file, &cached);
				}
				let mut held = self.keeping();
				held.cached = Some(cached);
				held.failure = None;
			}
			Err(failure) => {
				eprintln!("the Kiroshi directory was not read: {failure:?}");
				let at = self.clock.now_ms();
				self.keeping().failure = Some(Failure { error: failure, at });
			}
		}
		self.landed.send_replace(());
	}

	async fn listed(&self, since: Option<&str>) -> Result<Listing, ApplicationsError> {
		tokio::time::timeout(self.refresh_bound, listed(&self.base, since))
			.await
			.unwrap_or_else(|_| Err(unlisted_within(self.refresh_bound)))
	}
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) -> Arc<Directory> {
	let directory = Directory::at(api_url(), file(&app));
	tauri::async_runtime::spawn(watching(directory.clone(), directory.stop.subscribe()));
	tauri::async_runtime::spawn(announcing(app, directory.landed.subscribe()));
	directory
}

async fn announcing<R: Runtime>(app: AppHandle<R>, mut landed: signal::Receiver<()>) {
	while landed.changed().await.is_ok() {
		if let Err(error) = events::emit(&app, APPLICATION_DIRECTORY_REFRESHED, ()) {
			eprintln!("the refreshed Kiroshi directory was not announced: {error}");
		}
	}
}

async fn watching(directory: Arc<Directory>, mut halted: signal::Receiver<bool>) {
	let mut ticker = tokio::time::interval(TICK);
	loop {
		tokio::select! {
			_ = halted.changed() => return,
			_ = ticker.tick() => directory.refreshed().await,
		}
	}
}

fn file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(CACHE_DIR).join(CACHE_FILE))
}

fn unread_directory() -> ApplicationsError {
	ApplicationsError::RegistryUnreadable {
		detail: "the Kiroshi directory was never read and no cache is held".to_owned(),
	}
}

fn unread_within(wait: Duration) -> ApplicationsError {
	ApplicationsError::RegistryUnreadable {
		detail: format!(
			"the Kiroshi directory was not read within the {wait:?} a first read waits"
		),
	}
}

fn unlisted_within(bound: Duration) -> ApplicationsError {
	ApplicationsError::RegistryUnreadable {
		detail: format!("the Kiroshi directory was not read in full within {bound:?}"),
	}
}

fn is_due(held: &Held, now: i64) -> bool {
	held.failure.as_ref().is_none_or(|failure| now - failure.at > RETRY_MS)
		&& held
			.cached
			.as_ref()
			.is_none_or(|cached| cached.is_feed_stale || now - cached.read_at > REREAD_MS)
}

fn is_stale(read_at: i64, now: i64) -> bool {
	now - read_at > DAY_MS
}

fn is_unlisted(listed_at: i64, now: i64) -> bool {
	now - listed_at > WEEK_MS
}

fn instant(ms: i64) -> Option<String> {
	Some(DateTime::from_timestamp_millis(ms)?.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn distinct<'a>(rows: impl Iterator<Item = &'a Row>) -> impl Iterator<Item = &'a Application> {
	let mut seen = HashSet::new();
	rows.map(|row| &row.application).filter(move |held| seen.insert(held.name.as_str()))
}

fn matched(rows: &[Row], query: &str) -> Vec<Application> {
	let wanted = wanted(query);
	distinct(rows.iter()).filter(|held| carries(held, &wanted)).cloned().collect()
}

fn wanted(query: &str) -> Vec<String> {
	let held: Vec<String> = terms(query).iter().map(|term| folded(term)).collect();
	if !held.is_empty() {
		return held;
	}
	let whole = folded(query.trim());
	if whole.is_empty() {
		return Vec::new();
	}
	vec![whole]
}

fn carries(application: &Application, wanted: &[String]) -> bool {
	let searchable = folded(&format!(
		"{} {} {}",
		application.name,
		application.description,
		application.categories.join(" ")
	));
	wanted.iter().all(|term| searchable.contains(term))
}

async fn listed(base: &str, since: Option<&str>) -> Result<Listing, ApplicationsError> {
	let client = client()?;
	let base = parsed(base)?;
	let mut listing = Listing::default();
	for tier in SERVED_TIERS {
		let walked = walked(&client, &base, tier, since).await?;
		listing.is_feed_stale |= walked.is_feed_stale;
		listing.rows.extend(walked.rows);
	}
	Ok(listing)
}

async fn walked(
	client: &Client,
	base: &Url,
	tier: Tier,
	since: Option<&str>,
) -> Result<Listing, ApplicationsError> {
	let mut listing = Listing::default();
	let mut asked = HashSet::new();
	let mut cursor: Option<String> = None;
	loop {
		let page: Page = read(client, page_url(base, tier, since, cursor.as_deref())?).await?;
		listing.is_feed_stale |= !page.stale_feeds.is_empty();
		listing.rows.extend(page.servers.into_iter().filter_map(row));
		let Some(next) = page.next_cursor else {
			return Ok(listing);
		};
		if !asked.insert(next.clone()) {
			return Err(answered_twice(&next));
		}
		cursor = Some(next);
	}
}

fn answered_twice(cursor: &str) -> ApplicationsError {
	ApplicationsError::RegistryUnreadable {
		detail: format!("the Kiroshi directory answered the cursor {cursor} twice"),
	}
}

fn answered_nothing() -> ApplicationsError {
	ApplicationsError::RegistryUnreadable {
		detail: "the Kiroshi directory answered no application this reader serves".to_owned(),
	}
}

fn page_url(
	base: &Url,
	tier: Tier,
	since: Option<&str>,
	cursor: Option<&str>,
) -> Result<Url, ApplicationsError> {
	let mut url = endpoint(base, &SEGMENTS)?;
	{
		let mut query = url.query_pairs_mut();
		query.append_pair("tier", tier.named());
		query.append_pair("limit", LIMIT);
		if let Some(since) = since {
			query.append_pair("updated_since", since);
		}
		if let Some(cursor) = cursor {
			query.append_pair("cursor", cursor);
		}
	}
	Ok(url)
}

fn replaced(listing: Listing, now: i64) -> Result<Cached, ApplicationsError> {
	if listing.rows.is_empty() {
		return Err(answered_nothing());
	}
	Ok(Cached {
		schema: SCHEMA,
		read_at: now,
		listed_at: now,
		is_feed_stale: listing.is_feed_stale,
		rows: listing.rows,
	})
}

fn merged(cached: Cached, listing: Listing, now: i64) -> Cached {
	let mut rows = cached.rows;
	let mut at: HashMap<String, usize> =
		rows.iter().enumerate().map(|(index, row)| (row.id.clone(), index)).collect();
	for row in listing.rows {
		match at.get(&row.id) {
			Some(&index) => rows[index] = row,
			None => {
				at.insert(row.id.clone(), rows.len());
				rows.push(row);
			}
		}
	}
	rows.sort_by(|one, other| position(one).cmp(&position(other)));
	Cached {
		schema: SCHEMA,
		read_at: now,
		listed_at: cached.listed_at,
		is_feed_stale: listing.is_feed_stale,
		rows,
	}
}

fn without_community(mut cached: Cached) -> Cached {
	cached.rows.retain(|row| row.tier != Tier::Community);
	cached
}

fn position(row: &Row) -> (Tier, bool, Option<i64>, &str) {
	(row.tier, row.rank.is_none(), row.rank, row.id.as_str())
}

fn row(value: Value) -> Option<Row> {
	let name = value.get("name").and_then(Value::as_str).unwrap_or(UNNAMED).to_owned();
	match serde_json::from_value::<Entry>(value) {
		Ok(entry) => Some(served(entry)),
		Err(error) => {
			eprintln!("the Kiroshi directory row {name} was skipped: {error}");
			None
		}
	}
}

fn served(entry: Entry) -> Row {
	let config = Value::Object(entry.config);
	let auth_posture = entry.remote.as_ref().and_then(|remote| posture(&remote.auth_posture));
	let fields = asked(entry.remote.as_ref(), entry.local.as_ref());
	Row {
		id: entry.id,
		tier: entry.tier,
		rank: entry.rank,
		application: Application {
			install: installed(fields, auth_posture).covering(&config),
			title: entry.display_name,
			name: entry.name,
			description: described(entry.one_liner, entry.description),
			config,
			tools: Some(entry.tool_names).filter(|held| !held.is_empty()),
			logo: None,
			logo_url: entry.icon_url,
			use_count: entry.popularity_score.map(|score| score.round() as u64),
			verified: (entry.tier != Tier::Community).then_some(true),
			hosted_by: None,
			categories: bucketed(entry.categories),
			auth_posture,
		},
	}
}

fn asked(remote: Option<&Remote>, local: Option<&Local>) -> Vec<InstallField> {
	let required =
		remote.into_iter().flat_map(|remote| &remote.required_fields).map(|held| InstallField {
			name: held.field.clone(),
			secret: variable(&held.field),
			description: None,
			concealed: true,
		});
	let secrets = local
		.into_iter()
		.flat_map(|local| &local.packages)
		.flat_map(|package| &package.environment_variables)
		.filter(|held| held.is_secret)
		.map(|held| InstallField {
			name: held.name.clone(),
			secret: variable(&held.name),
			description: held.description.clone(),
			concealed: true,
		});
	let mut seen = HashSet::new();
	required.chain(secrets).filter(|field| seen.insert(field.name.clone())).collect()
}

fn installed(fields: Vec<InstallField>, posture: Option<AuthPosture>) -> Install {
	if !fields.is_empty() {
		return Install::asking(fields);
	}
	match posture {
		Some(AuthPosture::AuthRequired) => Install::Oauth,
		_ => Install::Nothing,
	}
}

fn posture(held: &str) -> Option<AuthPosture> {
	match held {
		AUTH_REQUIRED => Some(AuthPosture::AuthRequired),
		NO_AUTH => Some(AuthPosture::NoAuth),
		_ => None,
	}
}

fn bucketed(categories: Vec<String>) -> Vec<String> {
	let mut folded: Vec<String> = Vec::new();
	for value in categories {
		let held = bucket(&value);
		if !folded.iter().any(|kept| kept == held) {
			folded.push(held.to_owned());
		}
	}
	if folded.is_empty() {
		folded.push(OTHER.to_owned());
	}
	folded
}

fn bucket(value: &str) -> &'static str {
	BUCKETS
		.iter()
		.find(|(name, values)| name.eq_ignore_ascii_case(value) || values.contains(&value))
		.map_or(OTHER, |(name, _)| *name)
}

fn described(one_liner: Option<String>, description: Option<String>) -> String {
	one_liner.filter(|held| !held.is_empty()).or(description).unwrap_or_default()
}

fn from_file(file: &Path) -> Option<Cached> {
	let bytes = match fs::read(file) {
		Ok(bytes) => bytes,
		Err(error) if error.kind() == ErrorKind::NotFound => return None,
		Err(error) => return unreadable(&error.to_string()),
	};
	match serde_json::from_slice::<Cached>(&bytes) {
		Ok(cached) if cached.schema == SCHEMA => Some(cached),
		Ok(cached) => {
			let schema = cached.schema;
			unreadable(&format!("it carries schema {schema} and this build reads {SCHEMA}"))
		}
		Err(error) => unreadable(&error.to_string()),
	}
}

fn unreadable(reason: &str) -> Option<Cached> {
	eprintln!("the directory cache {CACHE_DIR}/{CACHE_FILE} was not read: {reason}");
	None
}

fn to_file(file: &Path, cached: &Cached) {
	if let Err(reason) = written(file, cached) {
		eprintln!("the directory cache {CACHE_DIR}/{CACHE_FILE} was not written: {reason}");
	}
}

fn written(file: &Path, cached: &Cached) -> Result<(), String> {
	if let Some(parent) = file.parent() {
		fs::create_dir_all(parent).map_err(|error| error.to_string())?;
	}
	let body = serde_json::to_vec(cached).map_err(|error| error.to_string())?;
	fs::write(file, body).map_err(|error| error.to_string())
}

#[cfg(test)]
pub(crate) mod tests {
	use std::net::{Ipv4Addr, SocketAddr};
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::Mutex as Recorded;

	use axum::extract::State as Extracted;
	use axum::http::Uri;
	use axum::response::{IntoResponse, Response as Answered};
	use axum::routing::get;
	use axum::Router;
	use futures_util::FutureExt;
	use reqwest::StatusCode;
	use serde_json::{json, to_value};
	use tauri::test::mock_builder;
	use tauri::Listener;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const NOON: i64 = 1_700_000_000_000;

	const NOON_INSTANT: &str = "2023-11-14T22:13:20.000Z";

	const PATIENCE: Duration = Duration::from_secs(10);

	const HELD_BACK_BOUND: Duration = Duration::from_secs(20);

	struct Stopped(i64);

	impl Clock for Stopped {
		fn now_ms(&self) -> i64 {
			self.0
		}
	}

	#[derive(Clone)]
	struct Moving(Arc<AtomicI64>);

	impl Moving {
		fn at(now: i64) -> Self {
			Self(Arc::new(AtomicI64::new(now)))
		}

		fn set(&self, now: i64) {
			self.0.store(now, Ordering::SeqCst);
		}
	}

	impl Clock for Moving {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	pub(crate) struct Served {
		curated: Recorded<Vec<Value>>,
		partner: Recorded<Vec<Value>>,
		stale_feeds: Recorded<Vec<String>>,
		refusals: Recorded<usize>,
		is_broken: Recorded<bool>,
		is_looping: Recorded<bool>,
		asked: Recorded<Vec<(String, String)>>,
		queried: Recorded<Vec<String>>,
		is_open: signal::Sender<bool>,
		arrivals: signal::Sender<usize>,
	}

	impl Served {
		fn hold_back(&self) {
			self.is_open.send_replace(false);
		}

		fn release(&self) {
			self.is_open.send_replace(true);
		}

		async fn reached(&self) {
			let mut arrivals = self.arrivals.subscribe();
			tokio::time::timeout(PATIENCE, arrivals.wait_for(|count| *count > 0))
				.await
				.expect("the stub was reached in time")
				.expect("the stub records");
		}

		fn refuses_once(&self) -> bool {
			let mut refusals = self.refusals.lock().expect("the stub records");
			let refuses = *refusals > 0;
			*refusals = refusals.saturating_sub(1);
			refuses
		}

		fn serves(&self, pages: Vec<Value>) {
			*self.partner.lock().expect("the stub records") = pages;
		}

		fn tier(&self, tier: &str) -> Option<&Recorded<Vec<Value>>> {
			match tier {
				"curated" => Some(&self.curated),
				"partner" => Some(&self.partner),
				_ => None,
			}
		}

		fn asked(&self) -> Vec<(String, String)> {
			self.asked.lock().expect("the stub records").clone()
		}

		fn queried(&self) -> Vec<String> {
			self.queried.lock().expect("the stub records").clone()
		}

		fn reads(&self) -> Vec<String> {
			let opening = |query: &String| {
				asked_pair(query, "tier").as_deref() == Some("curated")
					&& asked_pair(query, "cursor").is_none()
			};
			self.queried().into_iter().filter(opening).collect()
		}

		fn forget(&self) {
			self.asked.lock().expect("the stub records").clear();
			self.queried.lock().expect("the stub records").clear();
		}
	}

	pub(crate) async fn serving(pages: Vec<Value>) -> (String, Arc<Served>) {
		serving_tiers(Vec::new(), pages).await
	}

	async fn serving_tiers(curated: Vec<Value>, partner: Vec<Value>) -> (String, Arc<Served>) {
		let held = Arc::new(Served {
			curated: Recorded::new(curated),
			partner: Recorded::new(partner),
			stale_feeds: Recorded::new(Vec::new()),
			refusals: Recorded::new(0),
			is_broken: Recorded::new(false),
			is_looping: Recorded::new(false),
			asked: Recorded::new(Vec::new()),
			queried: Recorded::new(Vec::new()),
			is_open: signal::channel(true).0,
			arrivals: signal::channel(0).0,
		});
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address: SocketAddr = listener.local_addr().expect("the stub is named");
		let router =
			Router::new().route("/api/directory/servers", get(page_of)).with_state(held.clone());
		tokio::spawn(async move { axum::serve(listener, router).await.expect("the stub serves") });
		(format!("http://{address}"), held)
	}

	async fn page_of(Extracted(held): Extracted<Arc<Served>>, uri: Uri) -> Answered {
		let query = uri.query().unwrap_or_default().to_owned();
		let cursor = asked_pair(&query, "cursor");
		let tier = asked_pair(&query, "tier").unwrap_or_default();
		let asked = (tier.clone(), cursor.clone().unwrap_or_default());
		held.asked.lock().expect("the stub records").push(asked);
		held.queried.lock().expect("the stub records").push(query);
		held.arrivals.send_modify(|count| *count += 1);
		held.is_open.subscribe().wait_for(|is_open| *is_open).await.expect("the stub opens");
		if held.refuses_once() {
			return StatusCode::INTERNAL_SERVER_ERROR.into_response();
		}
		if *held.is_broken.lock().expect("the stub records") {
			return as_json(&json!({ "rows": [] }));
		}
		let Some(pages) = held.tier(&tier) else {
			return StatusCode::BAD_REQUEST.into_response();
		};
		let pages = pages.lock().expect("the stub records").clone();
		let index = cursor.and_then(|held| held.parse::<usize>().ok()).unwrap_or(0);
		let servers = pages.get(index).cloned().unwrap_or_else(|| json!([]));
		let next = match *held.is_looping.lock().expect("the stub records") {
			true => Some("1".to_owned()),
			false => (index + 1 < pages.len()).then(|| (index + 1).to_string()),
		};
		let stale_feeds = held.stale_feeds.lock().expect("the stub records").clone();
		as_json(&json!({
			"servers": servers, "total": 0, "next_cursor": next, "stale_feeds": stale_feeds,
		}))
	}

	fn pairs(asked: &[(&str, &str)]) -> Vec<(String, String)> {
		asked.iter().map(|(tier, cursor)| (tier.to_string(), cursor.to_string())).collect()
	}

	fn asked_pair(query: &str, name: &str) -> Option<String> {
		Url::parse(&format!("http://stub.test/?{query}"))
			.expect("the query reads")
			.query_pairs()
			.find(|(held, _)| held == name)
			.map(|(_, value)| value.into_owned())
	}

	fn as_json(held: &Value) -> Answered {
		Answered::builder()
			.status(StatusCode::OK)
			.header(reqwest::header::CONTENT_TYPE, "application/json")
			.body(axum::body::Body::from(held.to_string()))
			.expect("the stub answers with a body")
	}

	pub(crate) async fn unreached() -> String {
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = listener.local_addr().expect("the port is named");
		drop(listener);
		format!("http://{address}")
	}

	pub(crate) fn a_row(name: &str, tier: &str, rank: i64) -> Value {
		json!({
			"id": format!("id-{name}"),
			"slug": null,
			"type": "remote",
			"name": name,
			"display_name": name,
			"one_liner": format!("{name} does things."),
			"description": "The long story.",
			"icon_url": format!("https://{name}.test/icon.png"),
			"tool_names": ["read", "write"],
			"categories": ["productivity"],
			"popularity_score": 42,
			"rank": rank,
			"tier": tier,
			"config": { "type": "http", "url": format!("https://{name}.test/mcp") },
			"remote": {
				"url": format!("https://{name}.test/mcp"),
				"transport": "streamable-http",
				"auth_posture": "auth_required",
				"required_fields": [],
			},
			"local": null,
		})
	}

	pub(crate) fn a_page(names: &[&str]) -> Value {
		Value::Array(
			names
				.iter()
				.enumerate()
				.map(|(index, name)| a_row(name, "partner", index as i64 + 1))
				.collect(),
		)
	}

	pub(crate) fn carrying(mut row: Value, fields: Value) -> Value {
		for (key, value) in fields.as_object().expect("the fields are an object") {
			row[key] = value.clone();
		}
		row
	}

	fn a_row_carrying(name: &str, fields: Value) -> Value {
		carrying(a_row(name, "partner", 1), fields)
	}

	async fn read_from(rows: Vec<Value>) -> Vec<Application> {
		let directory = a_directory_over(vec![Value::Array(rows)]).await;
		directory.searched("").await.expect("the directory reads").applications
	}

	async fn a_directory_over(pages: Vec<Value>) -> Arc<Directory> {
		let (base, _) = serving(pages).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));
		directory.refreshed().await;
		directory
	}

	fn names(applications: &[Application]) -> Vec<&str> {
		applications.iter().map(|held| held.name.as_str()).collect()
	}

	async fn found(directory: &Arc<Directory>, query: &str) -> Vec<String> {
		let answered = directory.searched(query).await.expect("the search answers");
		answered.applications.into_iter().map(|held| held.name).collect()
	}

	fn a_cache_of(directory: &Directory) -> Cached {
		directory.kept().cached.clone().expect("a cache is held")
	}

	pub(crate) async fn settled(directory: &Directory) {
		drop(directory.reading.lock().await);
	}

	async fn held_past_its_bound(held: &Served, directory: &Directory) {
		held.reached().await;
		tokio::time::pause();
		settled(directory).await;
		tokio::time::resume();
	}

	fn bounded(directory: Arc<Directory>, refresh_bound: Duration) -> Arc<Directory> {
		let directory = Arc::into_inner(directory).expect("the directory is held once");
		Arc::new(Directory { refresh_bound, ..directory })
	}

	fn refreshes_heard(app: &AppOfItsOwn) -> tokio::sync::mpsc::UnboundedReceiver<String> {
		let (told, heard) = tokio::sync::mpsc::unbounded_channel();
		app.listen_any(APPLICATION_DIRECTORY_REFRESHED.name(), move |event| {
			told.send(event.payload().to_owned()).expect("the test listens");
		});
		heard
	}

	fn planted(directory: &Directory, cached: Cached) {
		*directory.keeping() = Held { cached: Some(cached), failure: None, is_disk_read: true };
	}

	async fn a_cache_read_at(read_at: i64, names: &[&str]) -> Cached {
		let directory = a_directory_over(vec![a_page(names)]).await;
		Cached { read_at, listed_at: read_at, ..a_cache_of(&directory) }
	}

	pub(crate) fn applications(rows: Vec<Value>) -> Vec<Application> {
		rows.into_iter().filter_map(row).map(|held| held.application).collect()
	}

	pub(crate) fn holding(rows: Vec<Value>) -> Arc<Directory> {
		let directory = Directory::at("http://127.0.0.1:1".to_owned(), None);
		let rows = rows.into_iter().filter_map(row).collect();
		let read_at = SystemClock.now_ms();
		let cached =
			Cached { schema: SCHEMA, read_at, listed_at: read_at, is_feed_stale: false, rows };
		planted(&directory, cached);
		directory
	}

	pub(crate) async fn a_cache_file_read_long_ago(rows: Vec<Value>) -> (PathBuf, RemovedOnDrop) {
		let dir = temp_dir();
		let file = dir.join(CACHE_DIR).join(CACHE_FILE);
		let (base, _) = serving(vec![Value::Array(rows)]).await;
		Directory::timed(base, Some(file.clone()), Box::new(Stopped(0))).refreshed().await;
		(file, dir)
	}

	#[tokio::test]
	async fn a_row_reads_into_the_application_the_front_is_answered() {
		let read = read_from(vec![a_row("notion", "partner", 1)]).await;

		assert_eq!(
			to_value(&read[0]).expect("the application serialises"),
			json!({
				"name": "notion",
				"title": "notion",
				"description": "notion does things.",
				"config": { "type": "http", "url": "https://notion.test/mcp" },
				"tools": ["read", "write"],
				"logoUrl": "https://notion.test/icon.png",
				"useCount": 42,
				"verified": true,
				"categories": ["Productivity"],
				"authPosture": "authRequired",
				"install": { "kind": "oauth" },
			})
		);
	}

	#[tokio::test]
	async fn a_one_liner_that_is_missing_falls_back_to_the_description() {
		let read = read_from(vec![a_row_carrying("quiet", json!({ "one_liner": null }))]).await;

		assert_eq!(read[0].description, "The long story.");
	}

	#[tokio::test]
	async fn a_null_icon_a_null_score_and_an_empty_tool_list_are_left_absent() {
		let read = read_from(vec![a_row_carrying(
			"bare",
			json!({ "icon_url": null, "popularity_score": null, "tool_names": [], "categories": [] }),
		)])
		.await;

		assert_eq!(read[0].logo_url, None);
		assert_eq!(read[0].use_count, None);
		assert_eq!(read[0].tools, None);
		assert_eq!(read[0].categories, ["Other"]);
	}

	#[tokio::test]
	async fn a_curated_or_partner_row_is_verified_and_a_community_row_is_dropped() {
		let read = read_from(vec![
			a_row("one", "curated", 1),
			a_row("two", "partner", 1),
			a_row("three", "community", 1),
		])
		.await;

		assert_eq!(names(&read), ["one", "two"]);
		assert_eq!(read[0].verified, Some(true));
		assert_eq!(read[1].verified, Some(true));
	}

	#[tokio::test]
	async fn a_read_answering_only_community_rows_caches_no_row_and_no_failure() {
		let (base, _) = serving(vec![json!([a_row("odd", "community", 1)])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		let answered = directory.searched("").await.expect("the search answers");

		assert!(answered.applications.is_empty());
		assert_eq!(answered.registry_failure, None);
		assert!(a_cache_of(&directory).rows.is_empty());
	}

	#[tokio::test]
	async fn a_community_row_of_a_cache_written_before_is_never_answered() {
		let dir = temp_dir();
		let file = dir.join(CACHE_DIR).join(CACHE_FILE);
		let written = a_cache_of(&*a_directory_over(vec![a_page(&["one"])]).await);
		let odd = row(a_row("odd", "community", 1)).expect("the row reads");
		to_file(&file, &Cached { rows: [written.rows, vec![odd]].concat(), ..written });
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		let directory = Directory::timed(base, Some(file), Box::new(Stopped(NOON)));

		let answered = directory.searched("").await.expect("the search answers");
		let named = directory.named("odd").await.expect("the name resolves");

		assert!(held.asked().is_empty(), "the directory was read");
		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(named, None);
	}

	#[tokio::test]
	async fn a_no_auth_row_asks_for_nothing_and_an_auth_required_row_signs_in() {
		let open = a_row_carrying(
			"open",
			json!({ "remote": { "auth_posture": "no_auth", "required_fields": [] } }),
		);
		let read = read_from(vec![open, a_row("closed", "partner", 2)]).await;

		assert_eq!(read[0].install, Install::Nothing);
		assert_eq!(read[0].auth_posture, Some(AuthPosture::NoAuth));
		assert_eq!(read[1].install, Install::Oauth);
		assert_eq!(read[1].auth_posture, Some(AuthPosture::AuthRequired));
	}

	#[tokio::test]
	async fn a_required_field_of_the_remote_is_asked_for_under_the_variable_its_config_reads() {
		let read = read_from(vec![a_row_carrying(
			"tenant",
			json!({
				"config": { "type": "http", "url": "https://${WORKSPACE}.tenant.test/mcp" },
				"remote": {
					"auth_posture": "auth_required",
					"required_fields": [{ "field": "workspace", "source_url": null }],
				},
			}),
		)])
		.await;

		assert_eq!(
			to_value(&read[0].install).expect("the install serialises"),
			json!({
				"kind": "key",
				"fields": [{ "name": "workspace", "secret": "WORKSPACE", "concealed": true }],
			})
		);
	}

	fn a_local_row(variables: Value, config: Value) -> Value {
		a_row_carrying(
			"bundle",
			json!({
				"type": "local",
				"remote": null,
				"local": {
					"version": "1.0.0", "size": null, "platforms": [], "repository_url": null,
					"packages": [{
						"registry": "npm", "identifier": "bundle", "runtime_hint": null,
						"environment_variables": variables,
					}],
				},
				"config": config,
			}),
		)
	}

	#[tokio::test]
	async fn a_secret_variable_of_a_local_package_is_asked_for_and_a_plain_one_is_not() {
		let read = read_from(vec![a_local_row(
			json!([
				{ "name": "API_TOKEN", "description": "A token.", "is_secret": true },
				{ "name": "LOG_LEVEL", "description": null, "is_secret": false },
			]),
			json!({
				"type": "stdio", "command": "npx", "args": ["-y", "bundle"],
				"env": { "API_TOKEN": "${API_TOKEN}" },
			}),
		)])
		.await;

		assert_eq!(read[0].auth_posture, None);
		assert_eq!(
			to_value(&read[0].install).expect("the install serialises"),
			json!({
				"kind": "key",
				"fields": [{
					"name": "API_TOKEN", "secret": "API_TOKEN", "description": "A token.",
					"concealed": true,
				}],
			})
		);
	}

	#[tokio::test]
	async fn a_local_package_asking_no_secret_installs_with_nothing() {
		let read = read_from(vec![a_local_row(
			json!([]),
			json!({ "type": "stdio", "command": "npx", "args": ["-y", "bundle"] }),
		)])
		.await;

		assert_eq!(read[0].install, Install::Nothing);
	}

	#[tokio::test]
	async fn a_config_reference_no_field_names_refuses_the_install() {
		let read = read_from(vec![a_row_carrying(
			"leaky",
			json!({ "config": {
				"type": "http", "url": "https://leaky.test/mcp",
				"headers": { "Authorization": "Bearer ${LEAKY_KEY}" },
			} }),
		)])
		.await;

		let Install::Refused(refusal) = &read[0].install else {
			panic!("got {:?}", read[0].install);
		};
		assert_eq!(refusal.field, "LEAKY_KEY");
	}

	#[tokio::test]
	async fn a_malformed_row_is_skipped_and_the_rows_around_it_are_kept() {
		let read = read_from(vec![
			a_row("before", "partner", 1),
			a_row_carrying("configless", json!({ "config": null })),
			json!({ "name": "shapeless" }),
			a_row_carrying("untiered", json!({ "tier": "gold" })),
			a_row("after", "partner", 2),
		])
		.await;

		assert_eq!(names(&read), ["before", "after"]);
	}

	#[tokio::test]
	async fn two_rows_sharing_a_name_answer_the_one_that_comes_first() {
		let read = read_from(vec![
			a_row_carrying("Consensus", json!({ "id": "first", "one_liner": "First." })),
			a_row_carrying("Consensus", json!({ "id": "second", "one_liner": "Second." })),
		])
		.await;

		assert_eq!(read.len(), 1);
		assert_eq!(read[0].description, "First.");
	}

	#[tokio::test]
	async fn the_read_walks_the_curated_then_the_partner_tier_to_its_null_cursor_in_cloud_order() {
		let (base, held) = serving_tiers(
			vec![json!([a_row("first", "curated", 1)]), json!([a_row("second", "curated", 2)])],
			vec![json!([a_row("third", "partner", 1)]), json!([a_row("fourth", "partner", 2)])],
		)
		.await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		let read = directory.searched("").await.expect("the directory reads");

		assert_eq!(names(&read.applications), ["first", "second", "third", "fourth"]);
		assert_eq!(
			held.asked(),
			pairs(&[("curated", ""), ("curated", "1"), ("partner", ""), ("partner", "1")])
		);
		for query in held.queried() {
			assert_eq!(asked_pair(&query, "limit").as_deref(), Some("100"), "got {query}");
			assert_eq!(asked_pair(&query, "updated_since"), None, "got {query}");
		}
	}

	#[tokio::test]
	async fn a_curated_tier_answering_no_row_stores_the_partner_rows_without_a_failure() {
		let (base, _) = serving_tiers(vec![json!([])], vec![a_page(&["one"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		let read = directory.searched("").await.expect("the directory reads");

		assert_eq!(names(&read.applications), ["one"]);
		assert!(directory.kept().failure.is_none(), "a failure was recorded");
	}

	#[tokio::test]
	async fn a_partner_walk_that_fails_stores_no_row_of_the_read_and_records_the_failure() {
		let (base, held) = serving_tiers(
			vec![json!([a_row("first", "curated", 1)])],
			vec![a_page(&["one"]), json!("not a page")],
		)
		.await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		directory.refreshed().await;

		assert!(directory.kept().cached.is_none(), "rows of the failed read were stored");
		assert!(directory.kept().failure.is_some(), "the failure was not recorded");
		assert_eq!(held.asked(), pairs(&[("curated", ""), ("partner", ""), ("partner", "1")]));
	}

	#[tokio::test]
	async fn a_cursor_answered_twice_fails_the_read_instead_of_looping() {
		let (base, held) = serving(vec![a_page(&["one"]), a_page(&["two"])]).await;
		*held.is_looping.lock().expect("the stub records") = true;

		let read = listed(&base, None).await.map(|listing| listing.rows.len());

		assert!(
			matches!(&read, Err(ApplicationsError::RegistryUnreadable { detail }) if detail.contains("cursor 1")),
			"got {read:?}"
		);
		assert_eq!(held.asked(), pairs(&[("curated", ""), ("curated", "1")]));
	}

	#[tokio::test]
	async fn the_catalogue_answers_the_curated_rows_alone_in_cloud_order() {
		let directory = a_directory_over(vec![
			json!([a_row("superset", "curated", 1), a_row("paper", "curated", 2)]),
			json!([a_row("linear", "partner", 1), a_row("odd", "community", 1)]),
		])
		.await;

		let curated = directory.curated().await.expect("the catalogue reads");

		assert_eq!(names(&curated), ["superset", "paper"]);
	}

	#[tokio::test]
	async fn a_name_the_cache_holds_answers_from_it_without_a_network_read() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));
		directory.refreshed().await;
		held.forget();

		let found = directory.named("one").await.expect("the name resolves");
		let absent = directory.named("absent").await.expect("the name resolves");

		assert_eq!(found.map(|application| application.title), Some("one".to_owned()));
		assert_eq!(absent, None);
		assert!(held.asked().is_empty(), "the directory was read");
	}

	#[tokio::test]
	async fn a_name_asked_while_the_cloud_is_down_and_no_cache_is_held_answers_the_failure() {
		let directory = Directory::timed(unreached().await, None, Box::new(Stopped(NOON)));

		let answered = directory.named("one").await;

		assert!(
			matches!(answered, Err(ApplicationsError::RegistryUnreached { .. })),
			"got {answered:?}"
		);
	}

	#[tokio::test]
	async fn a_query_matches_on_the_folded_name_description_and_categories_together() {
		let directory = a_directory_over(vec![json!([
			a_row_carrying(
				"Café",
				json!({ "categories": ["productivity"], "one_liner": "Brews things." })
			),
			a_row_carrying(
				"other",
				json!({ "id": "id-other", "categories": ["design"], "one_liner": "Draws things." })
			),
		])])
		.await;

		assert_eq!(found(&directory, "cafe").await, ["Café"]);
		assert_eq!(found(&directory, "productivity brews").await, ["Café"]);
		assert!(found(&directory, "cafe design").await.is_empty());
		assert_eq!(found(&directory, "").await, ["Café", "other"]);
	}

	#[tokio::test]
	async fn a_query_of_terms_too_short_to_read_matches_on_the_folded_query_as_one_term() {
		let directory = a_directory_over(vec![json!([
			a_row_carrying("ai", json!({ "one_liner": "Thinks." })),
			a_row_carrying("other", json!({ "id": "id-other", "one_liner": "Draws." })),
		])])
		.await;

		let short = directory.searched(" AI ").await.expect("the search answers");
		let none = directory.searched("zz").await.expect("the search answers");

		assert_eq!(names(&short.applications), ["ai"]);
		assert!(none.applications.is_empty());
	}

	#[test]
	fn an_empty_query_wants_no_term_and_a_short_query_wants_the_whole_of_it() {
		assert_eq!(wanted(""), Vec::<String>::new());
		assert_eq!(wanted("   "), Vec::<String>::new());
		assert_eq!(wanted(" an my "), ["an my"]);
		assert_eq!(wanted("My Issues an"), ["issues"]);
	}

	#[tokio::test]
	async fn the_hourly_refresh_leaves_a_cache_read_less_than_a_day_ago_without_a_request() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON + DAY_MS)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		directory.refreshed().await;

		assert!(held.asked().is_empty(), "the directory was read");
		assert_eq!(a_cache_of(&directory).read_at, NOON);
	}

	#[tokio::test]
	async fn a_read_within_ten_minutes_of_the_last_one_answers_the_cache_without_a_request() {
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON + REREAD_MS)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		let answered = directory.searched("").await.expect("the search answers");
		let named = directory.named("one").await.expect("the name resolves");
		directory.curated().await.expect("the catalogue reads");

		assert!(held.asked().is_empty(), "the directory was read");
		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(answered.read_at, Some(NOON));
		assert_eq!(answered.is_stale, Some(false));
		assert!(named.is_some());
	}

	#[tokio::test]
	async fn a_search_more_than_ten_minutes_after_the_last_read_answers_the_cache_stale_and_merges_behind_it(
	) {
		let (base, held) = serving(vec![json!([a_row("fresh", "curated", 1)])]).await;
		let now = NOON + REREAD_MS + 1;
		let directory = Directory::timed(base, None, Box::new(Stopped(now)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		let cached = directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&cached.applications), ["one"]);
		assert_eq!(cached.is_stale, Some(true));
		assert_eq!(cached.registry_failure, None);
		let queried = held.reads();
		assert_eq!(queried.len(), 1, "got {queried:?}");
		assert_eq!(asked_pair(&queried[0], "updated_since").as_deref(), Some(NOON_INSTANT));
		assert_eq!(names(&answered.applications), ["fresh", "one"]);
		assert_eq!(answered.read_at, Some(now));
		assert_eq!(answered.is_stale, Some(false));
	}

	#[tokio::test]
	async fn a_name_or_the_catalogue_asked_more_than_ten_minutes_after_the_last_read_reads_behind_it(
	) {
		let (base, held) = serving(vec![json!([a_row("fresh", "curated", 1)])]).await;
		let clock = Moving::at(NOON + REREAD_MS + 1);
		let directory = Directory::timed(base, None, Box::new(clock.clone()));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		let unmerged = directory.named("fresh").await.expect("the name resolves");
		settled(&directory).await;
		let named = directory.named("fresh").await.expect("the name resolves");
		clock.set(NOON + 2 * (REREAD_MS + 1));
		directory.curated().await.expect("the catalogue reads");
		settled(&directory).await;
		let curated = directory.curated().await.expect("the catalogue reads");

		assert_eq!(unmerged, None);
		assert_eq!(named.map(|application| application.name), Some("fresh".to_owned()));
		assert_eq!(names(&curated), ["fresh"]);
		assert_eq!(held.reads().len(), 2);
	}

	fn feed_stale(cached: Cached) -> Cached {
		Cached { is_feed_stale: true, ..cached }
	}

	#[tokio::test]
	async fn a_feed_stale_cache_of_the_seed_is_read_again_in_full_and_replaced_whatever_its_age() {
		let notion =
			carrying(a_row("notion", "partner", 1), json!({ "categories": ["Productivity"] }));
		let (base, held) = serving(vec![json!([notion]), a_page(&["linear"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));
		let seed = json!([a_row("superset", "curated", 1), a_row("paper", "curated", 2)]);
		let seeded = a_directory_over(vec![seed]).await;
		planted(&directory, feed_stale(a_cache_of(&seeded)));

		let seed_answered = directory.searched("notion").await.expect("the search answers");
		settled(&directory).await;
		let answered = directory.searched("notion").await.expect("the search answers");

		assert_eq!(names(&seed_answered.applications), Vec::<&str>::new());
		assert_eq!(seed_answered.is_stale, Some(true));
		assert_eq!(held.asked(), pairs(&[("curated", ""), ("partner", ""), ("partner", "1")]));
		assert!(held.queried().iter().all(|query| asked_pair(query, "updated_since").is_none()));
		assert_eq!(names(&answered.applications), ["notion"]);
		assert_eq!(answered.applications[0].categories, ["Productivity"]);
		assert_eq!(answered.is_stale, Some(false));
		assert_eq!(answered.registry_failure, None);
		let held_rows: Vec<String> =
			a_cache_of(&directory).rows.into_iter().map(|row| row.application.name).collect();
		assert_eq!(held_rows, ["notion", "linear"]);
	}

	#[tokio::test]
	async fn a_feed_stale_cache_answered_no_row_by_a_full_read_is_kept_with_the_failure() {
		let (base, _) = serving(vec![json!([])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));
		planted(&directory, feed_stale(a_cache_read_at(NOON, &["one"]).await));

		directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(answered.is_stale, Some(true));
		assert!(
			matches!(answered.registry_failure, Some(ApplicationsError::RegistryUnreadable { .. })),
			"got {:?}",
			answered.registry_failure
		);
	}

	#[tokio::test]
	async fn a_refresh_failed_while_a_cache_is_held_answers_it_stale_and_waits_a_minute_to_retry() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		*held.refusals.lock().expect("the stub records") = 1;
		let failed_at = NOON + REREAD_MS + 1;
		let clock = Moving::at(failed_at);
		let directory = Directory::timed(base, None, Box::new(clock.clone()));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		let failed = directory.searched("").await.expect("the search answers");
		clock.set(failed_at + RETRY_MS);
		let held_back = directory.searched("").await.expect("the search answers");
		let asked_within_the_minute = held.reads().len();
		clock.set(failed_at + RETRY_MS + 1);
		let retrying = directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		let retried = directory.searched("").await.expect("the search answers");

		assert_eq!(
			failed.registry_failure,
			Some(ApplicationsError::RegistryRefused { status: 500 })
		);
		assert_eq!(failed.is_stale, Some(true));
		assert_eq!(names(&failed.applications), ["one"]);
		assert_eq!(held_back.registry_failure, failed.registry_failure);
		assert_eq!(asked_within_the_minute, 1);
		assert_eq!(retrying.registry_failure, failed.registry_failure);
		assert_eq!(retrying.is_stale, Some(true));
		assert_eq!(held.reads().len(), 2);
		assert_eq!(retried.registry_failure, None);
		assert_eq!(retried.is_stale, Some(false));
	}

	#[tokio::test]
	async fn a_failed_refresh_keeps_the_catalogue_rows_and_the_search_reports_the_failure() {
		let (base, held) = serving(vec![json!([a_row("superset", "curated", 1)])]).await;
		*held.refusals.lock().expect("the stub records") = 1;
		let clock = Moving::at(NOON);
		let directory = Directory::timed(base, None, Box::new(clock.clone()));
		let seed = json!([a_row("paper", "curated", 1)]);
		planted(&directory, feed_stale(a_cache_of(&*a_directory_over(vec![seed]).await)));

		let kept = directory.curated().await.expect("the catalogue reads");
		settled(&directory).await;
		let searched = directory.searched("").await.expect("the search answers");
		clock.set(NOON + RETRY_MS + 1);
		directory.curated().await.expect("the catalogue reads");
		settled(&directory).await;
		let retried = directory.curated().await.expect("the catalogue reads");

		assert_eq!(names(&kept), ["paper"]);
		assert_eq!(names(&searched.applications), ["paper"]);
		assert_eq!(
			searched.registry_failure,
			Some(ApplicationsError::RegistryRefused { status: 500 })
		);
		assert_eq!(searched.is_stale, Some(true));
		assert_eq!(held.reads().len(), 2);
		assert_eq!(names(&retried), ["superset"]);
	}

	#[tokio::test]
	async fn reads_arriving_while_a_refresh_runs_answer_the_held_rows_and_send_one_request_series()
	{
		let (base, held) = serving(vec![a_page(&["one"]), a_page(&["two"])]).await;
		held.hold_back();
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));
		planted(&directory, feed_stale(a_cache_read_at(NOON, &["seed"]).await));

		let (searched, named, curated) = async {
			tokio::join!(directory.searched(""), directory.named("two"), directory.curated())
		}
		.now_or_never()
		.expect("the reads answer while the refresh is held back");
		held.release();
		settled(&directory).await;
		let refreshed = directory.searched("").await.expect("the search answers");

		assert_eq!(held.asked(), pairs(&[("curated", ""), ("partner", ""), ("partner", "1")]));
		assert_eq!(names(&searched.expect("the search answers").applications), ["seed"]);
		assert_eq!(named.expect("the name resolves"), None);
		curated.expect("the catalogue reads");
		assert_eq!(names(&refreshed.applications), ["one", "two"]);
	}

	#[tokio::test]
	async fn a_read_due_a_refresh_answers_the_held_rows_at_once_and_refreshes_in_the_background() {
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		held.hold_back();
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON + REREAD_MS + 1)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		let answered = directory
			.searched("")
			.now_or_never()
			.expect("the read answers while the refresh is held back")
			.expect("the search answers");
		let is_refreshing = directory.reading.try_lock().is_err();
		held.release();
		settled(&directory).await;
		let refreshed = found(&directory, "").await;

		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(answered.read_at, Some(NOON));
		assert_eq!(answered.is_stale, Some(true));
		assert_eq!(answered.registry_failure, None);
		assert!(is_refreshing, "no refresh was started");
		assert_eq!(refreshed, ["fresh", "one"]);
	}

	#[tokio::test]
	async fn a_refresh_past_its_bound_keeps_the_rows_holds_the_failure_and_waits_a_minute_to_retry()
	{
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		held.hold_back();
		let clock = Moving::at(NOON + REREAD_MS + 1);
		let directory =
			bounded(Directory::timed(base, None, Box::new(clock.clone())), HELD_BACK_BOUND);
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		directory.searched("").await.expect("the search answers");
		let passed_at = NOON + 2 * REREAD_MS;
		clock.set(passed_at);
		held_past_its_bound(&held, &directory).await;
		let passed = directory.searched("").await.expect("the search answers");
		clock.set(passed_at + RETRY_MS);
		directory.searched("").await.expect("the search answers");
		let asked_within_the_minute = held.reads().len();
		held.release();
		clock.set(passed_at + RETRY_MS + 1);
		directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		let retried = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&passed.applications), ["one"]);
		assert_eq!(passed.is_stale, Some(true));
		assert!(
			matches!(
				&passed.registry_failure,
				Some(ApplicationsError::RegistryUnreadable { detail }) if detail.contains("within 20s")
			),
			"got {:?}",
			passed.registry_failure
		);
		assert_eq!(asked_within_the_minute, 1);
		assert_eq!(held.reads().len(), 2);
		assert_eq!(names(&retried.applications), ["fresh", "one"]);
		assert_eq!(retried.registry_failure, None);
	}

	#[tokio::test]
	async fn a_read_with_nothing_held_waits_for_the_first_read_no_longer_than_its_bound() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		held.hold_back();
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		let reading = tokio::spawn({
			let directory = directory.clone();
			async move { directory.searched("").await }
		});
		held.reached().await;
		tokio::time::pause();
		let waited = reading.await.expect("the read ran");
		tokio::time::resume();
		held.release();
		settled(&directory).await;
		let landed = directory.searched("").await.expect("the search answers");

		assert!(
			matches!(
				&waited,
				Err(ApplicationsError::RegistryUnreadable { detail }) if detail.contains("within the 10s")
			),
			"got {waited:?}"
		);
		assert_eq!(names(&landed.applications), ["one"]);
		assert_eq!(held.reads().len(), 1);
	}

	#[tokio::test]
	async fn the_hourly_refresh_joins_the_refresh_a_read_started_instead_of_sending_another() {
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		held.hold_back();
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON + 2 * DAY_MS)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		directory.searched("").await.expect("the search answers");
		tokio::join!(directory.refreshed(), async { held.release() });

		assert_eq!(held.reads().len(), 1);
		assert_eq!(a_cache_of(&directory).read_at, NOON + 2 * DAY_MS);
	}

	#[tokio::test]
	async fn a_background_refresh_that_lands_rows_is_announced_once_to_the_window() {
		let app = an_app_of_its_own("directory-refreshed", mock_builder());
		let mut heard = refreshes_heard(&app);
		let (base, _) = serving(vec![a_page(&["fresh"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON + REREAD_MS + 1)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);
		tokio::spawn(announcing(app.handle().clone(), directory.landed.subscribe()));

		directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		let announced = tokio::time::timeout(PATIENCE, heard.recv()).await.expect("announced");
		let landings = directory.landed.subscribe();
		directory.searched("").await.expect("the search answers");
		settled(&directory).await;

		assert_eq!(announced.as_deref(), Some("null"));
		assert!(
			!landings.has_changed().expect("the directory is held"),
			"a read with nothing due was announced"
		);
	}

	#[tokio::test]
	async fn a_refused_refresh_is_announced_once_after_its_failure_is_held() {
		let app = an_app_of_its_own("directory-refused", mock_builder());
		let mut heard = refreshes_heard(&app);
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		*held.refusals.lock().expect("the stub records") = 1;
		let clock = Moving::at(NOON + REREAD_MS + 1);
		let directory = Directory::timed(base, None, Box::new(clock.clone()));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);
		tokio::spawn(announcing(app.handle().clone(), directory.landed.subscribe()));

		directory.searched("").await.expect("the search answers");
		let announced = tokio::time::timeout(PATIENCE, heard.recv()).await.expect("announced");
		let landings = directory.landed.subscribe();
		clock.set(NOON + REREAD_MS + 1 + RETRY_MS);
		let reread = directory.searched("").await.expect("the search answers");
		settled(&directory).await;

		assert_eq!(announced.as_deref(), Some("null"));
		assert_eq!(names(&reread.applications), ["one"]);
		assert_eq!(reread.is_stale, Some(true));
		assert_eq!(
			reread.registry_failure,
			Some(ApplicationsError::RegistryRefused { status: 500 })
		);
		assert_eq!(held.reads().len(), 1);
		assert!(
			!landings.has_changed().expect("the directory is held"),
			"a read within the retry minute was announced"
		);
	}

	#[tokio::test]
	async fn a_refresh_past_its_bound_is_announced_once_after_its_failure_is_held() {
		let app = an_app_of_its_own("directory-unlisted", mock_builder());
		let mut heard = refreshes_heard(&app);
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		held.hold_back();
		let directory = bounded(
			Directory::timed(base, None, Box::new(Stopped(NOON + REREAD_MS + 1))),
			HELD_BACK_BOUND,
		);
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);
		tokio::spawn(announcing(app.handle().clone(), directory.landed.subscribe()));

		directory.searched("").await.expect("the search answers");
		held_past_its_bound(&held, &directory).await;
		let announced = tokio::time::timeout(PATIENCE, heard.recv()).await.expect("announced");
		let landings = directory.landed.subscribe();
		let reread = directory.searched("").await.expect("the search answers");
		settled(&directory).await;
		held.release();

		assert_eq!(announced.as_deref(), Some("null"));
		assert_eq!(names(&reread.applications), ["one"]);
		assert_eq!(reread.is_stale, Some(true));
		assert!(
			matches!(
				&reread.registry_failure,
				Some(ApplicationsError::RegistryUnreadable { detail }) if detail.contains("within 20s")
			),
			"got {:?}",
			reread.registry_failure
		);
		assert_eq!(held.reads().len(), 1);
		assert!(
			!landings.has_changed().expect("the directory is held"),
			"a read within the retry minute was announced"
		);
	}

	#[tokio::test]
	async fn a_cache_read_days_ago_asks_what_changed_since_and_merges_it_by_id() {
		let (base, held) = serving_tiers(
			vec![json!([a_row("fresh", "curated", 1)])],
			vec![json!([a_row_carrying("one", json!({ "one_liner": "One, renamed." }))])],
		)
		.await;
		let now = NOON + 3 * DAY_MS;
		let directory = Directory::timed(base, None, Box::new(Stopped(now)));
		planted(&directory, a_cache_read_at(NOON, &["one", "two"]).await);

		directory.refreshed().await;
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(held.asked(), pairs(&[("curated", ""), ("partner", "")]));
		for query in held.queried() {
			assert_eq!(asked_pair(&query, "updated_since").as_deref(), Some(NOON_INSTANT));
		}
		assert_eq!(names(&answered.applications), ["fresh", "one", "two"]);
		assert_eq!(answered.applications[1].description, "One, renamed.");
		assert_eq!(answered.read_at, Some(now));
		assert_eq!(answered.is_stale, Some(false));
	}

	#[tokio::test]
	async fn a_merge_answering_no_row_keeps_the_cache_and_moves_its_read_forward() {
		let (base, _) = serving(vec![json!([])]).await;
		let now = NOON + 2 * DAY_MS;
		let directory = Directory::timed(base, None, Box::new(Stopped(now)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		directory.refreshed().await;
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(answered.read_at, Some(now));
		assert_eq!(answered.registry_failure, None);
	}

	#[tokio::test]
	async fn a_cache_read_more_than_a_week_ago_is_read_again_in_full_and_replaced() {
		let (base, held) = serving(vec![a_page(&["fresh"])]).await;
		let now = NOON + WEEK_MS + 1;
		let directory = Directory::timed(base, None, Box::new(Stopped(now)));
		planted(&directory, a_cache_read_at(NOON, &["gone"]).await);

		directory.refreshed().await;
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(asked_pair(&held.reads()[0], "updated_since"), None);
		assert_eq!(names(&answered.applications), ["fresh"]);
		assert_eq!(answered.read_at, Some(now));
	}

	#[tokio::test]
	async fn a_week_of_daily_merges_still_reads_the_whole_list_and_drops_what_it_left_out() {
		let (base, held) = serving(vec![a_page(&["kept", "gone"])]).await;
		let clock = Moving::at(NOON);
		let directory = Directory::timed(base, None, Box::new(clock.clone()));
		directory.refreshed().await;
		held.serves(vec![a_page(&["kept"])]);

		let hour = DAY_MS / 24;
		let merges_at = [1, 2, 3, 4, 5].map(|day| NOON + day * (DAY_MS + 1));
		for at in merges_at.into_iter().chain([NOON + 6 * DAY_MS + 23 * hour]) {
			clock.set(at);
			directory.refreshed().await;
		}
		let merges = held.reads();
		let merged = directory.searched("").await.expect("the search answers");
		held.forget();
		let listed_again = NOON + 7 * DAY_MS + hour;
		clock.set(listed_again);
		directory.refreshed().await;
		let listed = directory.searched("").await.expect("the search answers");

		assert_eq!(merges.len(), 7, "got {merges:?}");
		for merge in &merges[1..] {
			assert!(asked_pair(merge, "updated_since").is_some(), "got {merge}");
		}
		assert_eq!(names(&merged.applications), ["kept", "gone"]);
		assert_eq!(merged.is_stale, Some(false));
		let queried = held.reads();
		assert_eq!(queried.len(), 1, "got {queried:?}");
		assert_eq!(asked_pair(&queried[0], "updated_since"), None);
		assert_eq!(names(&listed.applications), ["kept"]);
		assert_eq!(a_cache_of(&directory).listed_at, listed_again);
	}

	#[tokio::test]
	async fn a_merge_keeps_the_moment_of_the_last_full_read() {
		let (base, _) = serving(vec![a_page(&["one"])]).await;
		let now = NOON + 2 * DAY_MS;
		let directory = Directory::timed(base, None, Box::new(Stopped(now)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);

		directory.refreshed().await;

		let cached = a_cache_of(&directory);
		assert_eq!(cached.read_at, now);
		assert_eq!(cached.listed_at, NOON);
	}

	#[tokio::test]
	async fn a_failed_first_read_is_held_for_a_minute_then_read_again_on_the_next_call() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		*held.refusals.lock().expect("the stub records") = 1;
		let clock = Moving::at(NOON);
		let directory = Directory::timed(base, None, Box::new(clock.clone()));

		let first = directory.searched("").await;
		clock.set(NOON + 30 * 1000);
		let held_back = directory.named("one").await;
		let asked_within_the_minute = held.reads().len();
		clock.set(NOON + 61 * 1000);
		let retried = directory.searched("").await.expect("the search answers");

		assert!(matches!(first, Err(ApplicationsError::RegistryRefused { .. })), "got {first:?}");
		assert!(
			matches!(held_back, Err(ApplicationsError::RegistryRefused { .. })),
			"got {held_back:?}"
		);
		assert_eq!(asked_within_the_minute, 1);
		assert_eq!(held.reads().len(), 2);
		assert_eq!(names(&retried.applications), ["one"]);
		assert_eq!(retried.registry_failure, None);
	}

	#[tokio::test]
	async fn a_cloud_down_while_a_cache_is_held_answers_that_cache_as_stale_with_the_failure() {
		let directory = Directory::timed(unreached().await, None, Box::new(Stopped(NOON + DAY_MS)));
		planted(&directory, a_cache_read_at(NOON - 1, &["one"]).await);

		directory.refreshed().await;
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(answered.is_stale, Some(true));
		assert!(
			matches!(answered.registry_failure, Some(ApplicationsError::RegistryUnreached { .. })),
			"got {:?}",
			answered.registry_failure
		);
	}

	#[tokio::test]
	async fn a_refusal_or_a_body_that_is_no_page_while_a_cache_is_held_names_its_case() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON + WEEK_MS + 1)));
		planted(&directory, a_cache_read_at(NOON, &["one"]).await);
		*held.refusals.lock().expect("the stub records") = 1;

		directory.fetched().await;
		let refused = directory.searched("").await.expect("the search answers");
		*held.is_broken.lock().expect("the stub records") = true;
		directory.fetched().await;
		let unreadable = directory.searched("").await.expect("the search answers");

		assert_eq!(
			refused.registry_failure,
			Some(ApplicationsError::RegistryRefused { status: 500 })
		);
		assert_eq!(refused.is_stale, Some(true));
		assert!(
			matches!(
				unreadable.registry_failure,
				Some(ApplicationsError::RegistryUnreadable { .. })
			),
			"got {:?}",
			unreadable.registry_failure
		);
		assert_eq!(names(&unreadable.applications), ["one"]);
	}

	#[tokio::test]
	async fn a_cloud_down_while_no_cache_is_held_answers_the_failure_and_never_an_empty_list() {
		let directory = Directory::timed(unreached().await, None, Box::new(Stopped(NOON)));

		let searched = directory.searched("").await;
		let curated = directory.curated().await;

		assert!(
			matches!(searched, Err(ApplicationsError::RegistryUnreached { .. })),
			"got {searched:?}"
		);
		assert!(
			matches!(curated, Err(ApplicationsError::RegistryUnreached { .. })),
			"got {curated:?}"
		);
	}

	#[tokio::test]
	async fn a_failure_held_with_no_cache_is_answered_again_without_reaching_the_network() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		*held.refusals.lock().expect("the stub records") = 1;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		let first = directory.searched("").await;
		let second = directory.searched("").await;

		assert!(matches!(first, Err(ApplicationsError::RegistryRefused { .. })), "got {first:?}");
		assert!(matches!(second, Err(ApplicationsError::RegistryRefused { .. })), "got {second:?}");
		assert_eq!(held.reads().len(), 1);
	}

	#[tokio::test]
	async fn the_refresh_reaches_the_network_whatever_the_last_read_answered() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		*held.refusals.lock().expect("the stub records") = 1;
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));
		directory.searched("").await.expect_err("the first read is refused");

		directory.refreshed().await;

		assert_eq!(held.reads().len(), 2);
		let answered = directory.searched("").await.expect("the search answers");
		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(answered.registry_failure, None);
	}

	#[tokio::test]
	async fn a_page_naming_a_stale_feed_answers_the_search_as_stale() {
		let (base, held) = serving(vec![a_page(&["one"])]).await;
		*held.stale_feeds.lock().expect("the stub records") = vec!["anthropic".to_owned()];
		let directory = Directory::timed(base, None, Box::new(Stopped(NOON)));

		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(answered.is_stale, Some(true));
		assert_eq!(answered.registry_failure, None);
	}

	#[tokio::test]
	async fn a_full_read_answering_no_row_is_held_as_a_failure_and_writes_nothing() {
		let dir = temp_dir();
		let file = dir.join(CACHE_DIR).join(CACHE_FILE);
		let (base, held) = serving(vec![json!([])]).await;
		let directory = Directory::timed(base, Some(file.clone()), Box::new(Stopped(NOON)));

		let answered = directory.searched("").await;

		assert!(
			matches!(answered, Err(ApplicationsError::RegistryUnreadable { .. })),
			"got {answered:?}"
		);
		assert!(!file.exists(), "a cache was written");
		assert_eq!(held.reads().len(), 1);
	}

	#[tokio::test]
	async fn a_read_writes_the_rows_the_moment_and_the_schema_and_reads_them_back() {
		let dir = temp_dir();
		let file = dir.join(CACHE_DIR).join(CACHE_FILE);
		let (base, held) = serving(vec![a_page(&["one", "two"])]).await;
		let directory = Directory::timed(base.clone(), Some(file.clone()), Box::new(Stopped(NOON)));
		directory.refreshed().await;

		let written: Value =
			serde_json::from_slice(&fs::read(&file).expect("the cache reads")).expect("it is json");
		assert_eq!(written["schema"], json!(3));
		assert_eq!(written["readAt"], json!(NOON));
		assert_eq!(written["listedAt"], json!(NOON));
		assert_eq!(written["rows"][0]["id"], json!("id-one"));
		assert_eq!(written["rows"][0]["application"]["name"], json!("one"));

		held.forget();
		let reopened =
			Directory::timed(base, Some(file), Box::new(Stopped(NOON + 1))).searched("").await;

		assert_eq!(names(&reopened.expect("the search answers").applications), ["one", "two"]);
		assert!(held.asked().is_empty(), "the directory was read");
	}

	#[tokio::test]
	async fn a_file_written_by_the_previous_build_reads_as_no_cache() {
		let dir = temp_dir();
		let file = dir.join(CACHE_DIR).join(CACHE_FILE);
		fs::create_dir_all(file.parent().expect("the cache has a home")).expect("the home is made");
		let previous = json!({ "schema": 1, "readAt": NOON, "applications": [] });
		fs::write(&file, previous.to_string()).expect("the cache is written");
		let (base, held) = serving(vec![a_page(&["one"])]).await;

		let directory = Directory::timed(base, Some(file), Box::new(Stopped(NOON)));
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&answered.applications), ["one"]);
		assert_eq!(asked_pair(&held.reads()[0], "updated_since"), None);
	}

	#[tokio::test]
	async fn a_file_carrying_another_schema_reads_as_no_cache() {
		let dir = temp_dir();
		let file = dir.join(CACHE_DIR).join(CACHE_FILE);
		fs::create_dir_all(file.parent().expect("the cache has a home")).expect("the home is made");
		let other = json!({ "schema": SCHEMA + 1, "readAt": NOON, "listedAt": NOON, "isFeedStale": false, "rows": [] });
		fs::write(&file, other.to_string()).expect("the cache is written");
		let (base, _) = serving(vec![a_page(&["one"])]).await;

		let directory = Directory::timed(base, Some(file.clone()), Box::new(Stopped(NOON)));
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&answered.applications), ["one"]);
		let written: Value =
			serde_json::from_slice(&fs::read(&file).expect("the cache reads")).expect("it is json");
		assert_eq!(written["schema"], json!(SCHEMA));
	}

	#[tokio::test]
	async fn a_cache_that_cannot_be_written_leaves_the_rows_held_in_memory() {
		let dir = temp_dir();
		let occupied = dir.join(CACHE_DIR);
		fs::write(&occupied, "not a directory").expect("the path is taken");
		let (base, _) = serving(vec![a_page(&["one"])]).await;

		let directory =
			Directory::timed(base, Some(occupied.join(CACHE_FILE)), Box::new(Stopped(NOON)));
		let answered = directory.searched("").await.expect("the search answers");

		assert_eq!(names(&answered.applications), ["one"]);
	}

	#[test]
	fn every_bucket_names_the_directory_values_it_folds() {
		assert_eq!(
			BUCKETS.map(|(name, values)| (name, values.to_vec())),
			[
				("Commerce & shopping", vec!["commerce-shopping", "e-commerce"]),
				("Communication", vec!["communication"]),
				("Consumer health", vec!["consumer-health"]),
				("Creative", vec!["creative", "design"]),
				("Data & analytics", vec!["data-analytics", "data"]),
				("Developer tools", vec!["developer-tools", "code"]),
				("Education", vec!["education"]),
				("Financial services", vec!["financial-services"]),
				(
					"Health & life sciences",
					vec!["health-life-sciences", "life-sciences", "health", "healthcare"]
				),
				("Legal", vec!["legal"]),
				("Media & entertainment", vec!["media-entertainment"]),
				("Nonprofit", vec!["nonprofit"]),
				("Productivity", vec!["productivity", "business-productivity"]),
				("Sales & marketing", vec!["sales-and-marketing"]),
				("Travel", vec!["travel"]),
				("Other", vec!["other", "technology"]),
			]
		);
	}

	#[test]
	fn every_directory_value_the_table_names_folds_into_its_bucket() {
		for (name, values) in BUCKETS {
			for value in values {
				assert_eq!(bucketed(vec![(*value).to_owned()]), [name], "{value} folds elsewhere");
			}
		}
	}

	#[test]
	fn a_bucket_display_name_in_any_case_folds_into_that_bucket() {
		for (name, _) in BUCKETS {
			for value in [name.to_owned(), name.to_lowercase(), name.to_uppercase()] {
				assert_eq!(bucketed(vec![value.clone()]), [name], "{value} folds elsewhere");
			}
		}
	}

	#[test]
	fn a_value_the_table_does_not_name_and_no_value_at_all_fold_into_other() {
		assert_eq!(bucketed(vec!["astrology".to_owned()]), ["Other"]);
		assert_eq!(bucketed(Vec::new()), ["Other"]);
	}

	#[test]
	fn values_of_distinct_buckets_are_all_carried_and_values_of_one_bucket_are_carried_once() {
		assert_eq!(
			bucketed(vec!["design".to_owned(), "code".to_owned()]),
			["Creative", "Developer tools"]
		);
		assert_eq!(bucketed(vec!["creative".to_owned(), "design".to_owned()]), ["Creative"]);
	}
}
