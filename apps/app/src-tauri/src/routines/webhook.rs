use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, TcpListener as StandardListener};
use std::sync::Arc;

use axum::extract::rejection::StringRejection;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::middleware;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::Router;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;
use tokio::sync::watch as signal;
use uuid::Uuid;

use super::commands::declared_source;
use super::contract::{RoutineError, TriggerDecision, TriggerEvent};
use super::core::{self, Clock, RunSink, SystemClock};
use super::rate_limit::RateLimit;
use super::runner::Runner;
use super::silence::Silence;
use crate::conversations::commands::ready;
use crate::db;
use crate::host_api::token::{self, HostToken};
use crate::host_api::{cors, events, files, invoke};
use crate::missions;

pub const SOURCE_ID: &str = "local-webhook";

pub const HEADER: &str = "X-Kiroshi-Delivery";

pub const DELIVERY_ID_HEADER: &str = "X-Kiroshi-Delivery-Id";

pub const MAX_DELIVERY_ID_BYTES: usize = 200;

pub const PREFERRED_PORT: u16 = 45_367;

pub const MAX_BODY_BYTES: usize = 64 * 1024;

const PATH: &str = "/routines/call";

const ACCEPTED: (StatusCode, &str) = (StatusCode::ACCEPTED, "the routine was told");

const REFUSED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no routine answers this call");

const TOO_LARGE: (StatusCode, &str) =
	(StatusCode::PAYLOAD_TOO_LARGE, "the call carried more than the cap");

const FLOODED: (StatusCode, &str) =
	(StatusCode::TOO_MANY_REQUESTS, "the routine was called too often");

const REFUSED_DELIVERY_ID: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the delivery id is unreadable or carried more than 200 bytes");

const FAILED: (StatusCode, &str) = (StatusCode::INTERNAL_SERVER_ERROR, "the call was not carried");

const LOOPBACK_NAMES: [&str; 2] = ["127.0.0.1", "localhost"];

pub struct Webhook {
	address: Option<SocketAddr>,
	stop: signal::Sender<bool>,
}

impl Webhook {
	pub fn url(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}{PATH}"))
	}

	pub fn origin(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}"))
	}

	pub fn mission_url(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}{}", missions::call::PATH))
	}

	pub fn stop(&self) {
		self.stop.send_replace(true);
	}

	#[cfg(test)]
	pub(crate) fn address(&self) -> SocketAddr {
		self.address.expect("the webhook bound an address")
	}
}

pub fn start<R: Runtime>(app: AppHandle<R>) -> Webhook {
	let runs = Arc::new(Runner::new(app.clone()));
	started(app, Arc::new(SystemClock), runs)
}

pub(crate) fn started<R: Runtime>(
	app: AppHandle<R>,
	clock: Arc<dyn Clock>,
	runs: Arc<dyn RunSink + Send + Sync>,
) -> Webhook {
	opened(app, clock, runs, listening())
}

fn opened<R: Runtime>(
	app: AppHandle<R>,
	clock: Arc<dyn Clock>,
	runs: Arc<dyn RunSink + Send + Sync>,
	bound: Result<(StandardListener, SocketAddr), std::io::Error>,
) -> Webhook {
	let (stop, halted) = signal::channel(false);
	legacy_web_link_cleared(&app);
	let token = host_token(&app);
	let calls = Calls {
		app,
		clock,
		runs,
		limit: Arc::new(RateLimit::default()),
		silence: Arc::new(Silence::default()),
		token,
	};
	let address = match bound {
		Ok((listener, address)) => {
			tauri::async_runtime::spawn(answering(calls, listener, halted));
			Some(address)
		}
		Err(failure) => {
			eprintln!("no local webhook call is answered: {failure}");
			None
		}
	};
	Webhook { address, stop }
}

fn host_token<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<HostToken>> {
	match token::loaded(app) {
		Ok(token) => Some(Arc::new(token)),
		Err(failure) => {
			eprintln!("no host api call is answered: the token was not loaded: {failure:?}");
			None
		}
	}
}

fn legacy_web_link_cleared<R: Runtime>(app: &AppHandle<R>) {
	if let Err(failure) = token::legacy_web_link_removed(app) {
		eprintln!("the legacy web link of the host api was left in place: {failure:?}");
	}
}

fn listening() -> Result<(StandardListener, SocketAddr), std::io::Error> {
	let listener = bound()?;
	listener.set_nonblocking(true)?;
	let address = listener.local_addr()?;
	Ok((listener, address))
}

fn bound() -> Result<StandardListener, std::io::Error> {
	match StandardListener::bind((Ipv4Addr::LOCALHOST, PREFERRED_PORT)) {
		Err(taken) if taken.kind() == ErrorKind::AddrInUse => {
			StandardListener::bind((Ipv4Addr::LOCALHOST, 0))
		}
		held => held,
	}
}

async fn answering<R: Runtime>(
	calls: Calls<R>,
	listener: StandardListener,
	halted: signal::Receiver<bool>,
) {
	let listener = match TcpListener::from_std(listener) {
		Ok(listener) => listener,
		Err(failure) => return eprintln!("the local webhook kept no socket: {failure}"),
	};
	let served = axum::serve(listener, route(calls)).with_graceful_shutdown(stopping(halted)).await;
	if let Err(failure) = served {
		eprintln!("the local webhook stopped answering: {failure}");
	}
}

async fn stopping(mut halted: signal::Receiver<bool>) {
	if halted.changed().await.is_err() {
		eprintln!("the local webhook lost the signal that stops it");
	}
}

pub(crate) struct Calls<R: Runtime> {
	pub(crate) app: AppHandle<R>,
	pub(crate) clock: Arc<dyn Clock>,
	runs: Arc<dyn RunSink + Send + Sync>,
	pub(crate) limit: Arc<RateLimit>,
	silence: Arc<Silence>,
	pub(crate) token: Option<Arc<HostToken>>,
}

impl<R: Runtime> Clone for Calls<R> {
	fn clone(&self) -> Self {
		Calls {
			app: self.app.clone(),
			clock: self.clock.clone(),
			runs: self.runs.clone(),
			limit: self.limit.clone(),
			silence: self.silence.clone(),
			token: self.token.clone(),
		}
	}
}

pub(crate) enum DeliveryId {
	Carried(String),
	Generated,
	Refused,
}

fn route<R: Runtime>(calls: Calls<R>) -> Router {
	Router::new()
		.route(PATH, post(called::<R>))
		.route(missions::call::PATH, post(missions::call::called::<R>))
		.layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
		.merge(invoke::route(calls.clone()))
		.merge(events::route(calls.clone()))
		.merge(files::route(calls.clone()))
		.layer(middleware::from_fn(cors::shared))
		.with_state(calls)
}

async fn called<R: Runtime>(
	State(calls): State<Calls<R>>,
	headers: HeaderMap,
	body: Result<String, StringRejection>,
) -> (StatusCode, &'static str) {
	if !named_here(&headers) {
		return REFUSED;
	}
	let delivery_id = match delivery_id(&headers) {
		DeliveryId::Refused => return REFUSED_DELIVERY_ID,
		DeliveryId::Carried(held) => Some(held),
		DeliveryId::Generated => None,
	};
	let body = match body {
		Ok(body) => body,
		Err(rejection) => return unread(rejection),
	};
	match carried(&calls, &headers, delivery_id, body).await {
		Ok(answer) => answer,
		Err(failure) => {
			eprintln!("a local webhook call reached no routine: {failure:?}");
			FAILED
		}
	}
}

async fn carried<R: Runtime>(
	calls: &Calls<R>,
	headers: &HeaderMap,
	delivery_id: Option<String>,
	body: String,
) -> Result<(StatusCode, &'static str), RoutineError> {
	let Some(key) = presented(headers) else {
		return Ok(REFUSED);
	};
	let state = calls.app.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let held = database.routines().keyed_on_source(key, SOURCE_ID.to_owned()).await?;
	let Some(routine) = held else {
		return Ok(REFUSED);
	};
	let mut turn = calls.silence.turn(&routine.id, calls.clock.as_ref()).await;
	if turn.holds() {
		return Ok(FLOODED);
	}
	if !calls.limit.admits(&routine.id, calls.clock.as_ref()).await {
		return Ok(FLOODED);
	}
	let app = &calls.app;
	let source = declared_source(
		app,
		database,
		&routine.conversation_id,
		&routine.bot_id,
		&routine.trigger_source_id,
	)
	.await?;
	let event = TriggerEvent {
		routine_id: routine.id,
		source,
		payload: payload(body, delivery_id, calls.clock.now_ms())?,
	};
	let decision =
		core::on_trigger(database, calls.runs.as_ref(), calls.clock.as_ref(), event).await?;
	if let TriggerDecision::Skipped { reason, .. } = decision {
		turn.hold(reason);
		return Ok(FLOODED);
	}
	Ok(ACCEPTED)
}

fn unread(rejection: StringRejection) -> (StatusCode, &'static str) {
	match rejection.into_response().status() {
		StatusCode::PAYLOAD_TOO_LARGE => TOO_LARGE,
		_ => REFUSED,
	}
}

pub(crate) fn named_here(headers: &HeaderMap) -> bool {
	let Some(host) = headers.get(header::HOST).and_then(|host| host.to_str().ok()) else {
		return false;
	};
	let name = host.split(':').next().unwrap_or(host);
	LOOPBACK_NAMES.contains(&name)
}

pub(crate) fn presented(headers: &HeaderMap) -> Option<String> {
	headers.get(HEADER)?.to_str().ok().map(str::to_owned)
}

pub(crate) fn delivery_id(headers: &HeaderMap) -> DeliveryId {
	let Some(value) = headers.get(DELIVERY_ID_HEADER) else {
		return DeliveryId::Generated;
	};
	if value.len() > MAX_DELIVERY_ID_BYTES {
		return DeliveryId::Refused;
	}
	let Ok(held) = value.to_str() else {
		return DeliveryId::Refused;
	};
	match held.trim() {
		"" => DeliveryId::Generated,
		held => DeliveryId::Carried(held.to_owned()),
	}
}

fn payload(body: String, delivery_id: Option<String>, at: i64) -> Result<Value, RoutineError> {
	Ok(json!({
		"deliveryId": delivery_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
		"receivedAt": core::moment(at)?,
		"body": body,
	}))
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::{Path, PathBuf};
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::mpsc;
	use std::time::Duration;

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::App;
	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpStream;

	use super::super::contract::{
		Filter, FilterMatchMode, RoutineDraft, RoutineRun, RunClosing, RunOutcome, RunRequested,
		SkipReason,
	};
	use super::super::core::{HOURLY_CAP, HOUR_MS, LEASE_MS};
	use super::super::rate_limit::{CALLS_PER_WINDOW, WINDOW_MS};
	use super::*;
	use crate::bundles;
	use crate::db::repositories::routines::MAX_RUNS_PER_PAGE;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const PATIENCE: Duration = Duration::from_secs(60);

	const NOON: i64 = 1_800_000_000_000;

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Arc<Self> {
			Arc::new(Ticking(AtomicI64::new(now)))
		}

		fn moved_by(&self, elapsed: i64) {
			self.0.fetch_add(elapsed, Ordering::SeqCst);
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	const A_TICK: i64 = 1_000;

	const A_HUNDRED_CALLS: usize = 100;

	const A_KEY: &str = "the-webhook-key";

	const ANOTHER_KEY: &str = "the-schedule-key";

	const A_SECOND_KEY: &str = "the-second-webhook-key";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("routine-webhook-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		let system = bundles::system::path(app.handle()).expect("the system bundle is named");
		bundles::system::write(&system).expect("the system bundle lands");
		{
			let state = app.state::<db::DatabaseState>();
			let database = ready(&state).expect("the database opens");
			database
				.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
				.await
				.expect("the participant is planted");
			planted(database, SOURCE_ID, A_KEY).await;
			planted(database, SOURCE_ID, A_SECOND_KEY).await;
			planted(database, "schedule", ANOTHER_KEY).await;
		}
		app
	}

	async fn planted(database: &db::Database, trigger_source_id: &str, key: &str) {
		let draft = RoutineDraft {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			title: "Nightly report".to_owned(),
			instruction: "Read what the call carried.".to_owned(),
			trigger_source_id: trigger_source_id.to_owned(),
			filter: Filter { match_mode: FilterMatchMode::All, rows: Vec::new() },
			trigger_config: json!({ "expression": "0 * * * *" }),
		};
		database.routines().create(draft, key.to_owned(), 1).await.expect("the routine is stored");
	}

	async fn counted(database: &db::Database, statement: &'static str) -> i64 {
		database
			.call(move |connection| Ok(connection.query_row(statement, [], |row| row.get(0))?))
			.await
			.expect("the count reads")
	}

	fn calling(key: Option<&str>, body: &str) -> String {
		reaching("POST", PATH, Some("127.0.0.1"), key, body)
	}

	fn delivering(key: Option<&str>, delivery_id: &str, body: &str) -> Vec<u8> {
		delivering_raw(key, delivery_id.as_bytes(), body)
	}

	fn delivering_raw(key: Option<&str>, delivery_id: &[u8], body: &str) -> Vec<u8> {
		let request = calling(key, body);
		let (head, sent) = request.split_once("\r\n\r\n").expect("the request carries a body");
		let mut raw = format!("{head}\r\n{DELIVERY_ID_HEADER}: ").into_bytes();
		raw.extend_from_slice(delivery_id);
		raw.extend_from_slice(format!("\r\n\r\n{sent}").as_bytes());
		raw
	}

	fn reaching(
		method: &str,
		path: &str,
		host: Option<&str>,
		key: Option<&str>,
		body: &str,
	) -> String {
		let mut request = format!(
			"{method} {path} HTTP/1.1\r\nConnection: close\r\nContent-Length: {}\r\n",
			body.len()
		);
		if let Some(host) = host {
			request.push_str(&format!("Host: {host}\r\n"));
		}
		if let Some(key) = key {
			request.push_str(&format!("{HEADER}: {key}\r\n"));
		}
		request.push_str("\r\n");
		request.push_str(body);
		request
	}

	async fn answered(address: SocketAddr, request: impl Into<Vec<u8>>) -> (u16, String) {
		let request = request.into();
		let mut stream = TcpStream::connect(address).await.expect("the listener answers");
		stream.write_all(&request).await.expect("the request lands");
		let mut answer = Vec::new();
		stream.read_to_end(&mut answer).await.expect("the answer reads");
		let answer = String::from_utf8_lossy(&answer).into_owned();
		let (head, body) = answer.split_once("\r\n\r\n").expect("the answer carries a body");
		let status = head.split_whitespace().nth(1).expect("the answer carries a status");
		(status.parse().expect("the status is a number"), body.to_owned())
	}

	fn address_of(webhook: &Webhook) -> SocketAddr {
		webhook.address.expect("the webhook bound an address")
	}

	struct HeldOpen;

	impl RunSink for HeldOpen {
		fn requested(&self, _event: RunRequested) -> Result<(), RoutineError> {
			Ok(())
		}
	}

	struct Recorded(std::sync::Mutex<mpsc::Sender<RunRequested>>);

	impl RunSink for Recorded {
		fn requested(&self, event: RunRequested) -> Result<(), RoutineError> {
			self.0
				.lock()
				.expect("the sink is readable")
				.send(event)
				.map_err(|error| RoutineError::Undeliverable { detail: error.to_string() })
		}
	}

	fn start(app: AppHandle<MockRuntime>) -> Webhook {
		started(app, Arc::new(SystemClock), Arc::new(HeldOpen))
	}

	fn recording(app: AppHandle<MockRuntime>) -> (Webhook, mpsc::Receiver<RunRequested>) {
		let (requested, arriving) = mpsc::channel();
		let runs = Arc::new(Recorded(std::sync::Mutex::new(requested)));
		(started(app, Arc::new(SystemClock), runs), arriving)
	}

	fn delivery_id_of(arriving: &mpsc::Receiver<RunRequested>) -> String {
		let requested = arriving.recv_timeout(PATIENCE).expect("a run was requested");
		requested.payload["deliveryId"]
			.as_str()
			.expect("the payload names a delivery id")
			.to_owned()
	}

	fn refused() -> (u16, String) {
		(REFUSED.0.as_u16(), REFUSED.1.to_owned())
	}

	fn accepted() -> (u16, String) {
		(ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned())
	}

	fn flooded() -> (u16, String) {
		(FLOODED.0.as_u16(), FLOODED.1.to_owned())
	}

	#[derive(Debug, Default, PartialEq, Eq)]
	struct Answers {
		accepted: usize,
		flooded: usize,
	}

	impl Answers {
		fn counting(&mut self, answer: (u16, String)) {
			match answer {
				held if held == accepted() => self.accepted += 1,
				held if held == flooded() => self.flooded += 1,
				held => panic!("a call was answered {held:?}"),
			}
		}
	}

	async fn calling_with_the_run_left_open(
		address: SocketAddr,
		clock: &Ticking,
		key: &str,
		times: usize,
	) -> Answers {
		let mut answers = Answers::default();
		for _ in 0..times {
			answers.counting(answered(address, calling(Some(key), "{}")).await);
			clock.moved_by(A_TICK);
		}
		answers
	}

	async fn calling_with_each_run_closed(
		app: &App<MockRuntime>,
		address: SocketAddr,
		clock: &Ticking,
		key: &str,
		times: usize,
	) -> Answers {
		let mut answers = Answers::default();
		for _ in 0..times {
			answers.counting(answered(address, calling(Some(key), "{}")).await);
			closed_open_runs(app, key, clock.now_ms()).await;
			clock.moved_by(A_TICK);
		}
		answers
	}

	async fn closed_open_runs(app: &App<MockRuntime>, key: &str, at: i64) {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		let open = runs_of_key(app, key).await.into_iter().filter(|run| run.ended_at.is_none());
		for run in open {
			database.routines().close_run(run.id, closing(), at).await.expect("the run closes");
		}
	}

	async fn runs_of_key(app: &App<MockRuntime>, key: &str) -> Vec<RoutineRun> {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		let routine = database
			.routines()
			.keyed_on_source(key.to_owned(), SOURCE_ID.to_owned())
			.await
			.expect("the routine reads")
			.expect("a routine holds the key");
		database.routines().runs(routine.id, MAX_RUNS_PER_PAGE).await.expect("the runs read")
	}

	fn closing() -> RunClosing {
		RunClosing {
			outcome: RunOutcome::Ok,
			reason: None,
			cost_usd: None,
			model_usage: None,
			reported_turn_id: None,
		}
	}

	async fn skipped_rows(app: &App<MockRuntime>, key: &str, reason: SkipReason) -> usize {
		runs_of_key(app, key)
			.await
			.iter()
			.filter(|run| run.reason.as_deref() == Some(reason.recorded()))
			.count()
	}

	async fn runs_of(app: &App<MockRuntime>) -> i64 {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		counted(database, "SELECT count(*) FROM routine_runs").await
	}

	async fn dedupe_values_of(app: &App<MockRuntime>) -> i64 {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		counted(database, "SELECT count(*) FROM routine_dedupe_values").await
	}

	async fn no_row_was_written(app: &App<MockRuntime>) {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(counted(database, "SELECT count(*) FROM routine_runs").await, 0);
		assert_eq!(counted(database, "SELECT count(*) FROM routine_dedupe_values").await, 0);
	}

	fn host_files_of(host: &Path) -> Vec<String> {
		let mut names: Vec<String> = fs::read_dir(host)
			.expect("the host dir reads")
			.map(|entry| entry.expect("an entry").file_name().to_string_lossy().into_owned())
			.collect();
		names.sort();
		names
	}

	fn seeded_host_dir_of(app: &App<MockRuntime>) -> PathBuf {
		let host = app.path().app_data_dir().expect("the data dir resolves").join("host");
		fs::create_dir_all(&host).expect("the host dir is made");
		fs::write(host.join("token"), "a-held-token").expect("the token is written");
		fs::write(host.join("left-behind"), "stale").expect("a stale file is written");
		host
	}

	fn legacy_link_seeded(host: &Path) {
		fs::write(host.join("web-link.txt"), "a-link-holding-the-token")
			.expect("the legacy link is written");
	}

	#[tokio::test]
	async fn opening_the_listener_bound_or_unbound_removes_only_the_legacy_web_link() {
		let app = a_host("host-dir").await;
		let host = seeded_host_dir_of(&app);
		let taken = std::io::Error::from(ErrorKind::AddrInUse);

		legacy_link_seeded(&host);
		let unbound =
			opened(app.handle().clone(), Arc::new(SystemClock), Arc::new(HeldOpen), Err(taken));
		let after_unbound = host_files_of(&host);
		unbound.stop();
		legacy_link_seeded(&host);
		let bound =
			opened(app.handle().clone(), Arc::new(SystemClock), Arc::new(HeldOpen), listening());
		let after_bound = host_files_of(&host);
		bound.stop();

		assert_eq!(after_unbound, ["left-behind", "token"]);
		assert_eq!(after_bound, ["left-behind", "token"]);
		assert_eq!(fs::read_to_string(host.join("token")).expect("the token"), "a-held-token");
		assert_eq!(host_files_of(&host), ["left-behind", "token"]);
	}

	#[tokio::test]
	async fn a_legacy_web_link_that_cannot_be_removed_keeps_the_listener_serving() {
		let app = a_host("host-dir-blocked").await;
		let host = seeded_host_dir_of(&app);
		fs::create_dir_all(host.join("web-link.txt").join("held")).expect("a directory blocks it");

		let webhook =
			opened(app.handle().clone(), Arc::new(SystemClock), Arc::new(HeldOpen), listening());
		let answer = answered(webhook.address(), calling(None, "{}")).await;
		webhook.stop();

		assert!(host.join("web-link.txt").is_dir());
		assert_eq!(answer, (REFUSED.0.as_u16(), REFUSED.1.to_owned()));
	}

	#[tokio::test]
	async fn a_call_carrying_the_key_of_a_webhook_routine_opens_a_run_from_what_it_carried() {
		let app = a_host("fired").await;
		let (webhook, arriving) = recording(app.handle().clone());

		let answer = answered(address_of(&webhook), calling(Some(A_KEY), "{\"ok\":true}")).await;

		assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		let requested = arriving.recv_timeout(PATIENCE).expect("the run was requested");
		let payload = &requested.payload;
		assert_eq!(payload["body"], json!("{\"ok\":true}"));
		assert!(payload["deliveryId"].as_str().is_some_and(|id| !id.is_empty()), "got {payload}");
		assert!(
			payload["receivedAt"].as_str().is_some_and(|at| at.ends_with('Z')),
			"got {payload}"
		);
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(counted(database, "SELECT count(*) FROM routine_runs").await, 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_no_webhook_routine_holds_the_key_of_opens_nothing() {
		let app = a_host("refused").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for request in [
			calling(None, "{}"),
			calling(Some("no routine holds this"), "{}"),
			calling(Some(ANOTHER_KEY), "{}"),
		] {
			assert_eq!(answered(address, request).await, refused());
		}

		no_row_was_written(&app).await;

		webhook.stop();
	}

	#[tokio::test]
	async fn a_body_longer_than_the_cap_is_answered_its_size_not_the_key_refusal() {
		let app = a_host("capped").await;
		let webhook = start(app.handle().clone());

		let long = "a".repeat(MAX_BODY_BYTES + 1);
		let answer = answered(address_of(&webhook), calling(Some(A_KEY), &long)).await;

		assert_eq!(answer, (TOO_LARGE.0.as_u16(), TOO_LARGE.1.to_owned()));
		no_row_was_written(&app).await;

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_naming_another_host_or_naming_none_is_refused_and_reads_no_routine() {
		let app = a_host("hosted").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for request in [
			reaching("POST", PATH, Some("attacker.example"), Some(A_KEY), "{}"),
			reaching("POST", PATH, Some("127.0.0.1.attacker.example"), Some(A_KEY), "{}"),
			reaching("POST", PATH, None, Some(A_KEY), "{}"),
		] {
			assert_eq!(answered(address, request).await, refused());
		}

		no_row_was_written(&app).await;

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_naming_the_loopback_with_or_without_the_bound_port_is_carried() {
		let app = a_host("loopback").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);

		for host in ["localhost", "127.0.0.1", &format!("localhost:{}", address.port())] {
			let request = reaching("POST", PATH, Some(host), Some(A_KEY), "{}");
			let answer = answered(address, request).await;
			assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()), "{host} was refused");
			closed_open_runs(&app, A_KEY, clock.now_ms()).await;
		}

		webhook.stop();
	}

	#[tokio::test]
	async fn another_method_and_another_path_write_no_row() {
		let app = a_host("elsewhere").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for request in [
			reaching("GET", PATH, Some("127.0.0.1"), Some(A_KEY), ""),
			reaching("POST", "/elsewhere", Some("127.0.0.1"), Some(A_KEY), "{}"),
		] {
			let (status, _) = answered(address, request).await;
			assert!(status >= 400, "the call was answered {status}");
		}

		no_row_was_written(&app).await;

		webhook.stop();
	}

	#[tokio::test]
	async fn the_call_beyond_the_cap_of_a_window_is_refused_and_the_one_after_it_passed_is_carried()
	{
		let app = a_host("flooded").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);
		for _ in 0..CALLS_PER_WINDOW {
			let answer = answered(address, delivering(Some(A_KEY), "delivery-1", "{}")).await;
			assert_eq!(answer, accepted());
			closed_open_runs(&app, A_KEY, clock.now_ms()).await;
		}
		let carried_runs = runs_of(&app).await;
		let carried_dedupe_values = dedupe_values_of(&app).await;

		let refused = answered(address, delivering(Some(A_KEY), "delivery-2", "{}")).await;

		assert_eq!(refused, flooded());
		assert_eq!(runs_of(&app).await, carried_runs, "the refused call wrote a run");
		assert_eq!(
			dedupe_values_of(&app).await,
			carried_dedupe_values,
			"the refused call wrote a dedupe value"
		);

		clock.moved_by(WINDOW_MS);

		let answer = answered(address, delivering(Some(A_KEY), "delivery-2", "{}")).await;
		assert_eq!(answer, accepted());
		assert_eq!(runs_of(&app).await, carried_runs + 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_hundred_calls_inside_one_hour_write_the_cap_in_starts_and_one_skip_naming_the_cap() {
		let app = a_host("hourly-flood").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let started_runs = HOURLY_CAP as usize;
		let silenced = A_HUNDRED_CALLS - started_runs - 1;

		let answers = calling_with_each_run_closed(
			&app,
			address_of(&webhook),
			&clock,
			A_KEY,
			A_HUNDRED_CALLS,
		)
		.await;

		assert_eq!(answers, Answers { accepted: started_runs, flooded: silenced + 1 });
		assert_eq!(runs_of(&app).await, started_runs as i64 + 1);
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::HourlyCap).await, 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_landing_after_the_hour_of_silence_writes_a_second_skip_naming_the_cap() {
		let app = a_host("hourly-forgotten").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);
		let to_the_cap = HOURLY_CAP as usize + 1;
		calling_with_each_run_closed(&app, address, &clock, A_KEY, to_the_cap).await;
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::HourlyCap).await, 1);

		clock.moved_by(HOUR_MS);
		let answers = calling_with_each_run_closed(&app, address, &clock, A_KEY, to_the_cap).await;

		assert_eq!(answers, Answers { accepted: HOURLY_CAP as usize, flooded: 1 });
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::HourlyCap).await, 2);

		webhook.stop();
	}

	#[tokio::test]
	async fn two_routines_flooded_in_the_same_hour_each_keep_their_own_skip_naming_the_cap() {
		let app = a_host("hourly-two").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);
		let to_the_cap = HOURLY_CAP as usize + 1;

		let first = calling_with_each_run_closed(&app, address, &clock, A_KEY, to_the_cap).await;
		let second =
			calling_with_each_run_closed(&app, address, &clock, A_SECOND_KEY, to_the_cap).await;

		assert_eq!(first, Answers { accepted: HOURLY_CAP as usize, flooded: 1 });
		assert_eq!(second, first);
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::HourlyCap).await, 1);
		assert_eq!(skipped_rows(&app, A_SECOND_KEY, SkipReason::HourlyCap).await, 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_hundred_calls_while_the_first_run_stays_open_write_one_start_and_one_skip() {
		let app = a_host("leased-flood").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));

		let answers =
			calling_with_the_run_left_open(address_of(&webhook), &clock, A_KEY, A_HUNDRED_CALLS)
				.await;

		assert_eq!(answers, Answers { accepted: 1, flooded: A_HUNDRED_CALLS - 1 });
		assert_eq!(runs_of(&app).await, 2);
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::LeaseHeld).await, 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn calls_fired_at_once_while_the_first_run_stays_open_write_one_start_and_one_skip() {
		let app = a_host("leased-at-once").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);
		let silenced = CALLS_PER_WINDOW - 2;

		let fired: Vec<_> = (0..CALLS_PER_WINDOW)
			.map(|_| {
				tokio::spawn(async move { answered(address, calling(Some(A_KEY), "{}")).await })
			})
			.collect();

		let mut answers = Answers::default();
		for call in fired {
			answers.counting(call.await.expect("the call is answered"));
		}
		assert_eq!(answers, Answers { accepted: 1, flooded: silenced + 1 });
		assert_eq!(runs_of(&app).await, 2);
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::LeaseHeld).await, 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_landing_after_the_length_of_a_lease_reaches_the_admission_again() {
		let app = a_host("leased-forgotten").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);
		calling_with_the_run_left_open(address, &clock, A_KEY, 2).await;
		assert_eq!(skipped_rows(&app, A_KEY, SkipReason::LeaseHeld).await, 1);
		closed_open_runs(&app, A_KEY, clock.now_ms()).await;
		assert_eq!(calling_with_the_run_left_open(address, &clock, A_KEY, 3).await.accepted, 0);
		assert_eq!(runs_of(&app).await, 2);

		clock.moved_by(LEASE_MS);
		let answer = answered(address, calling(Some(A_KEY), "{}")).await;

		assert_eq!(answer, accepted());
		assert_eq!(runs_of(&app).await, 3);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_flood_carrying_a_key_no_routine_holds_stays_refused_and_is_never_answered_too_many()
	{
		let app = a_host("unheld").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);

		for _ in 0..CALLS_PER_WINDOW + 10 {
			assert_eq!(
				answered(address, calling(Some("no routine holds this"), "{}")).await,
				refused()
			);
		}

		no_row_was_written(&app).await;

		webhook.stop();
	}

	#[tokio::test]
	async fn one_delivery_id_carried_twice_opens_one_run_and_two_delivery_ids_open_two() {
		let app = a_host("delivered").await;
		let clock = Ticking::at(NOON);
		let webhook = started(app.handle().clone(), clock.clone(), Arc::new(HeldOpen));
		let address = address_of(&webhook);

		for _ in 0..2 {
			let answer = answered(address, delivering(Some(A_KEY), "delivery-1", "{}")).await;
			assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
			closed_open_runs(&app, A_KEY, clock.now_ms()).await;
		}

		assert_eq!(runs_of(&app).await, 1);

		for id in ["delivery-2", "delivery-3"] {
			assert_eq!(
				answered(address, delivering(Some(A_KEY), id, "{}")).await,
				(ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned())
			);
			closed_open_runs(&app, A_KEY, clock.now_ms()).await;
		}

		assert_eq!(runs_of(&app).await, 3);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_carried_delivery_id_reaches_the_payload_and_a_blank_one_is_generated() {
		let app = a_host("named").await;
		let (webhook, arriving) = recording(app.handle().clone());
		let address = address_of(&webhook);

		answered(address, delivering(Some(A_KEY), "delivery-1", "{}")).await;
		assert_eq!(delivery_id_of(&arriving), "delivery-1");

		answered(address, delivering(Some(A_SECOND_KEY), "   ", "{}")).await;
		let generated = delivery_id_of(&arriving);
		assert_ne!(generated, "");
		assert_ne!(generated, "delivery-1");

		webhook.stop();
	}

	#[tokio::test]
	async fn a_delivery_id_longer_than_the_cap_is_answered_before_any_routine_is_read() {
		let app = a_host("overlong").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);
		let long = "d".repeat(MAX_DELIVERY_ID_BYTES + 1);

		for key in [Some(A_KEY), Some("no routine holds this"), None] {
			let (status, message) = answered(address, delivering(key, &long, "{}")).await;
			assert_eq!(status, REFUSED_DELIVERY_ID.0.as_u16());
			assert!(
				message.contains(&MAX_DELIVERY_ID_BYTES.to_string()),
				"the answer named no cap: {message}"
			);
		}

		let answer =
			answered(address, delivering(Some(A_KEY), &"d".repeat(MAX_DELIVERY_ID_BYTES), "{}"))
				.await;
		assert_eq!(answer, (ACCEPTED.0.as_u16(), ACCEPTED.1.to_owned()));
		assert_eq!(runs_of(&app).await, 1);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_delivery_id_carrying_a_byte_that_is_not_utf8_is_refused_and_writes_no_row() {
		let app = a_host("undecodable").await;
		let webhook = start(app.handle().clone());
		let request = delivering_raw(Some(A_KEY), &[b'd', 0xff, b'1'], "{}");

		let answer = answered(address_of(&webhook), request).await;

		assert_eq!(answer, (REFUSED_DELIVERY_ID.0.as_u16(), REFUSED_DELIVERY_ID.1.to_owned()));
		no_row_was_written(&app).await;

		webhook.stop();
	}

	#[tokio::test]
	async fn the_listener_stops_answering_once_the_webhook_is_stopped() {
		let app = a_host("stopped").await;
		let webhook = start(app.handle().clone());
		let address = address_of(&webhook);
		assert_eq!(answered(address, calling(None, "{}")).await, refused());

		webhook.stop();

		let refused = async {
			while TcpStream::connect(address).await.is_ok() {
				tokio::task::yield_now().await;
			}
		};
		tokio::time::timeout(PATIENCE, refused)
			.await
			.expect("the listener outlived the signal that stops it");
	}

	#[tokio::test]
	async fn a_taken_preferred_port_sends_the_listener_to_one_the_system_chooses() {
		let taken = StandardListener::bind((Ipv4Addr::LOCALHOST, PREFERRED_PORT));

		let (listener, address) = listening().expect("a listener binds");

		assert_ne!(address.port(), PREFERRED_PORT, "the taken port was handed out twice");
		assert_ne!(address.port(), 0, "the system named the port it chose");
		drop(listener);
		drop(taken);
	}

	#[test]
	fn the_header_and_the_source_are_the_ones_the_committed_bundle_declares() {
		let bundle = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join("kiroshi");
		let declared = super::super::sources::sources_at(&bundle).expect("the bundle reads");

		let source = declared
			.iter()
			.find(|source| source.id == SOURCE_ID)
			.unwrap_or_else(|| panic!("the bundle declares no {SOURCE_ID}"));

		assert_eq!(source.header.as_deref(), Some(HEADER));
	}
}
