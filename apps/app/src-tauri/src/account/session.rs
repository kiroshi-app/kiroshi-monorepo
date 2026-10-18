use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use chrono::{DateTime, Utc};

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;
use tokio::sync::{MutexGuard, Notify};

use super::callback;
use super::cloud::{AuthorizationRequest, Cloud, MeError, PollError, Polled};
use super::contract::{AccountError, AccountFailure, AccountState, SignedOutReason};
use crate::crypto::commands::DeviceKeysState;
use crate::db::{Database, DatabaseState};
use crate::devices;
use crate::environment::contract::{EnvError, EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::events::{self, ACCOUNT_CHANGED};
use crate::hosting;
use crate::invitations;
use crate::joined_spaces;
use crate::window_controls;

const SIGNED_OUT: AccountState = AccountState::SignedOut { reason: None };

const SIGNED_OUT_ON_SITE: AccountState =
	AccountState::SignedOut { reason: Some(SignedOutReason::SignedOutOnSite) };

const DEVICE_REVOKED: AccountState =
	AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRevoked) };

const DEVICE_REFUSED: AccountState =
	AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRefused) };

const SLOW_DOWN: Duration = Duration::from_secs(5);

const DEVICE_NAME_LIMIT: usize = 64;

const DISPLAY_NAME_LIMIT: usize = 80;

const UNNAMED_DEVICE: &str = "Mac";

pub struct AccountSession {
	cloud: Cloud,
	root: Result<PathBuf, EnvError>,
	current: Mutex<AccountState>,
	turn: tokio::sync::Mutex<Option<JoinHandle<()>>>,
	naming: Mutex<Option<Naming>>,
}

#[derive(Clone, PartialEq)]
struct SentName {
	account_id: String,
	name: String,
}

type Naming = JoinHandle<Option<SentName>>;

impl AccountSession {
	pub fn new(root: Result<PathBuf, EnvError>, api_url: &str) -> Self {
		let first = match &root {
			Ok(_) => SIGNED_OUT,
			Err(error) => unstored(error.clone()),
		};
		Self {
			cloud: Cloud::new(api_url),
			root,
			current: Mutex::new(first),
			turn: tokio::sync::Mutex::new(None),
			naming: Mutex::new(None),
		}
	}

	fn root(&self) -> Result<&Path, EnvError> {
		self.root.as_deref().map_err(Clone::clone)
	}

	pub fn current(&self) -> AccountState {
		self.current.lock().unwrap_or_else(PoisonError::into_inner).clone()
	}

	pub(crate) fn bearer(&self) -> Result<Option<String>, EnvError> {
		Ok(store::values(self.root()?, &EnvScope::Account)?.remove(ACCOUNT_BEARER))
	}

	fn forget_bearer(&self) -> Result<(), EnvError> {
		store::delete(self.root()?, &EnvScope::Account, ACCOUNT_BEARER)
	}

	async fn session_of(&self, bearer: &str) -> AccountState {
		match self.cloud.me(bearer).await {
			Ok(account) => AccountState::SignedIn(account),
			Err(MeError::Unreachable(reason)) => AccountState::Unreachable { reason },
			Err(MeError::Revoked) => match self.forget_bearer() {
				Ok(()) => SIGNED_OUT_ON_SITE,
				Err(error) => unstored(error),
			},
		}
	}

	async fn signed_in_with(&self, bearer: &str) -> AccountState {
		let stored = self
			.root()
			.and_then(|root| store::set(root, &EnvScope::Account, ACCOUNT_BEARER, bearer));
		if let Err(error) = stored {
			return unstored(error);
		}
		self.session_of(bearer).await
	}
}

fn unstored(error: EnvError) -> AccountState {
	AccountState::Unreachable { reason: format!("the session store failed: {error:?}") }
}

fn entered<R: Runtime>(app: &AppHandle<R>, state: AccountState) {
	let session = app.state::<AccountSession>();
	*session.current.lock().unwrap_or_else(PoisonError::into_inner) = state.clone();
	if let Err(error) = events::emit(app, ACCOUNT_CHANGED, state) {
		eprintln!("the account state did not reach the front: {error}");
	}
}

async fn closed(waiting: &mut Option<JoinHandle<()>>) {
	let Some(listening) = waiting.take() else {
		return;
	};
	listening.abort();
	if let Err(error) = listening.await {
		if !is_cancelled(&error) {
			eprintln!("the previous account callback ended abnormally: {error}");
		}
	}
}

fn is_cancelled(error: &tauri::Error) -> bool {
	matches!(error, tauri::Error::JoinError(joined) if joined.is_cancelled())
}

pub async fn sign_in<R: Runtime>(
	app: &AppHandle<R>,
	open: impl FnOnce(&str) -> Result<(), String>,
) -> Result<(), AccountError> {
	let session = app.state::<AccountSession>();
	let mut waiting = session.turn.lock().await;
	closed(&mut waiting).await;
	session.root()?;
	if matches!(session.current(), AccountState::SignedIn(_)) {
		return Err(AccountError::SignedIn);
	}
	let refused = |error: std::io::Error| AccountError::Listener { detail: error.to_string() };
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.map_err(refused)?;
	let port = listener.local_addr().map_err(refused)?.port();
	let nonce =
		callback::nonce().map_err(|error| AccountError::Listener { detail: error.to_string() })?;
	let callback_url = callback::callback_url(port, &nonce);
	let device_name = device_name().await;
	let request =
		match session.cloud.create_authorization_request(&device_name, &callback_url).await {
			Ok(request) => request,
			Err(reason) => {
				drop(listener);
				eprintln!("the authorization request was not created: {reason}");
				entered(app, AccountState::Failed { failure: AccountFailure::Unreachable });
				return Ok(());
			}
		};
	if let Err(reason) = open(&request.verification_url) {
		eprintln!("the browser did not open the authorization page: {reason}");
	}
	entered(
		app,
		AccountState::Waiting {
			verification_url: request.verification_url.clone(),
			expires_at: request.expires_at.clone(),
		},
	);
	*waiting = Some(tauri::async_runtime::spawn(approved(app.clone(), listener, nonce, request)));
	Ok(())
}

async fn device_name() -> String {
	let read =
		tokio::process::Command::new("scutil").args(["--get", "ComputerName"]).output().await;
	let named = match read {
		Ok(output) if output.status.success() => {
			Some(String::from_utf8_lossy(&output.stdout).into_owned())
		}
		Ok(output) => {
			eprintln!("scutil did not read the computer name: {}", output.status);
			None
		}
		Err(error) => {
			eprintln!("scutil did not run to read the computer name: {error}");
			None
		}
	};
	device_name_of(named.as_deref().unwrap_or(UNNAMED_DEVICE))
}

fn device_name_of(named: &str) -> String {
	let cut = trimmed_to(named, DEVICE_NAME_LIMIT);
	if cut.is_empty() {
		UNNAMED_DEVICE.to_owned()
	} else {
		cut
	}
}

fn trimmed_to(named: &str, utf16_limit: usize) -> String {
	let mut utf16_units = 0;
	named
		.trim()
		.chars()
		.take_while(|character| {
			utf16_units += character.len_utf16();
			utf16_units <= utf16_limit
		})
		.collect()
}

fn left_until(expires_at: DateTime<Utc>) -> Duration {
	(expires_at - Utc::now()).to_std().unwrap_or(Duration::ZERO)
}

enum Settled {
	Approved { token: String },
	Failed(AccountFailure),
}

async fn approved<R: Runtime>(
	app: AppHandle<R>,
	listener: TcpListener,
	nonce: String,
	request: AuthorizationRequest,
) {
	let session = app.state::<AccountSession>();
	let called = Arc::new(Notify::new());
	let polling = polled(&session.cloud, &request, &called);
	let settled = callback::served_while(listener, nonce, Arc::clone(&called), polling).await;
	let token = match settled {
		Settled::Approved { token } => token,
		Settled::Failed(failure) => return entered(&app, AccountState::Failed { failure }),
	};
	let next = session.signed_in_with(&token).await;
	let is_signed_in = matches!(next, AccountState::SignedIn(_));
	entered(&app, next);
	window_controls::raise_main(&app);
	if is_signed_in {
		stored_name_sent(&app);
		devices::signed_in(&app).await;
		invitations::resumed(&app);
	}
}

async fn polled(cloud: &Cloud, request: &AuthorizationRequest, called: &Notify) -> Settled {
	let deadline = tokio::time::Instant::now() + left_until(request.deadline);
	let mut interval = request.interval;
	let mut is_unreached = true;
	loop {
		tokio::select! {
			biased;
			() = tokio::time::sleep_until(deadline) => {
				let failure =
					if is_unreached { AccountFailure::Unreachable } else { AccountFailure::Expired };
				return Settled::Failed(failure);
			}
			() = called.notified() => {}
			() = tokio::time::sleep(interval) => {}
		}
		let polled = cloud.poll_authorization_request(request).await;
		is_unreached &= matches!(polled, Err(PollError::Unanswered(_)));
		match polled {
			Ok(Polled::Approved { token }) => return Settled::Approved { token },
			Ok(Polled::Expired) => return Settled::Failed(AccountFailure::Expired),
			Ok(Polled::Cancelled) => return Settled::Failed(AccountFailure::Cancelled),
			Ok(Polled::Pending { interval: answered }) => interval = answered,
			Ok(Polled::SlowedDown) => interval += SLOW_DOWN,
			Err(PollError::Unanswered(reason) | PollError::Unexpected(reason)) => {
				eprintln!("the authorization request poll failed: {reason}");
			}
		}
	}
}

pub async fn restore<R: Runtime>(app: AppHandle<R>) {
	let session = app.state::<AccountSession>();
	let _turn = session.turn.lock().await;
	let next = match session.bearer() {
		Ok(None) => None,
		Ok(Some(bearer)) => Some(session.session_of(&bearer).await),
		Err(error) => Some(unstored(error)),
	};
	if let Some(next) = next {
		entered(&app, next);
	}
	if matches!(session.current(), AccountState::SignedIn(_)) {
		stored_name_sent(&app);
		devices::signed_in(&app).await;
		invitations::resumed(&app);
	} else {
		hosting::resumed(&app).await;
	}
}

pub fn stored_name_sent<R: Runtime>(app: &AppHandle<R>) {
	let Some(session) = app.try_state::<AccountSession>() else {
		return;
	};
	let mut naming = session.naming.lock().unwrap_or_else(PoisonError::into_inner);
	let previous = naming.take();
	*naming = Some(tauri::async_runtime::spawn(sent_after(app.clone(), previous)));
}

async fn sent_after<R: Runtime>(app: AppHandle<R>, previous: Option<Naming>) -> Option<SentName> {
	let last_sent = match previous {
		Some(previous) => previous.await.unwrap_or_else(|error| {
			eprintln!("the previous display name send ended abnormally: {error}");
			None
		}),
		None => None,
	};
	name_sent(&app, last_sent).await
}

async fn name_sent<R: Runtime>(
	app: &AppHandle<R>,
	last_sent: Option<SentName>,
) -> Option<SentName> {
	let session = app.state::<AccountSession>();
	let AccountState::SignedIn(account) = session.current() else {
		return last_sent;
	};
	let Some(display_name) = stored_display_name(app).await else {
		return last_sent;
	};
	let sending =
		SentName { account_id: account.id, name: trimmed_to(&display_name, DISPLAY_NAME_LIMIT) };
	if sending.name.is_empty() || last_sent.as_ref() == Some(&sending) {
		return last_sent;
	}
	let bearer = match session.bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => return last_sent,
		Err(error) => {
			eprintln!("the display name was not sent: the session store failed: {error:?}");
			return last_sent;
		}
	};
	match session.cloud.rename(&bearer, &sending.name).await {
		Ok(()) => {
			hosting::renamed(app);
			Some(sending)
		}
		Err(MeError::Revoked) => {
			revoked(app, &bearer);
			last_sent
		}
		Err(MeError::Unreachable(reason)) => {
			eprintln!("the display name did not reach the cloud: {reason}");
			last_sent
		}
	}
}

async fn stored_display_name<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
	let read = match app.state::<DatabaseState>().as_ref() {
		Ok(database) => database.user().preferences().await,
		Err(failure) => {
			eprintln!("the display name was not sent: the database is unavailable: {failure:?}");
			return None;
		}
	};
	read.map(|preferences| preferences.display_name)
		.inspect_err(|failure| eprintln!("the display name was not read to be sent: {failure:?}"))
		.ok()
}

async fn signed_in_work_stopped<R: Runtime>(app: &AppHandle<R>) -> Option<MutexGuard<'_, ()>> {
	devices::signed_out(app).await;
	hosting::signed_out(app).await;
	invitations::signed_out(app).await;
	joined_spaces::relay::signed_out(app).await
}

pub async fn sign_out<R: Runtime>(app: &AppHandle<R>) -> Result<(), AccountError> {
	let session = app.state::<AccountSession>();
	let mut waiting = session.turn.lock().await;
	closed(&mut waiting).await;
	let _relay_turn = signed_in_work_stopped(app).await;
	if let Some(bearer) = session.bearer()? {
		if let Err(reason) = relay_device_deleted(app, &bearer).await {
			eprintln!("the relay device was not deleted, the sign-out goes on: {reason}");
		}
		if let Err(reason) = session.cloud.sign_out(&bearer).await {
			eprintln!(
				"the cloud did not close the session, the bearer is deleted anyway: {reason}"
			);
		}
	}
	relay_device_forgotten(app).await;
	session.forget_bearer()?;
	entered(app, SIGNED_OUT);
	Ok(())
}

async fn relay_device_deleted<R: Runtime>(app: &AppHandle<R>, bearer: &str) -> Result<(), String> {
	let Some((account_id, device_id)) = relay_device_owner(app)? else {
		return Ok(());
	};
	let held = signed_in_database(app)?
		.relay_devices()
		.relay_device_id(account_id, device_id)
		.await
		.map_err(|failure| format!("the relay device id did not read: {failure:?}"))?;
	match held {
		Some(relay_device_id) => app
			.state::<AccountSession>()
			.cloud
			.delete_device(bearer, &relay_device_id)
			.await
			.map_err(|failure| failure.to_string()),
		None => Ok(()),
	}
}

async fn relay_device_forgotten<R: Runtime>(app: &AppHandle<R>) {
	if let Err(reason) = held_relay_device_forgotten(app).await {
		eprintln!("the relay device id of the signed-out account was not forgotten: {reason}");
	}
}

async fn held_relay_device_forgotten<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
	let Some((account_id, device_id)) = relay_device_owner(app)? else {
		return Ok(());
	};
	signed_in_database(app)?
		.relay_devices()
		.forgotten(account_id, device_id)
		.await
		.map_err(|failure| format!("{failure:?}"))
}

fn relay_device_owner<R: Runtime>(app: &AppHandle<R>) -> Result<Option<(String, String)>, String> {
	let AccountState::SignedIn(account) = app.state::<AccountSession>().current() else {
		return Ok(None);
	};
	let device_id = app
		.try_state::<DeviceKeysState>()
		.ok_or_else(|| "the device keys are not loaded".to_owned())?
		.keys()
		.map(|keys| keys.device_id().to_string())
		.map_err(|failure| format!("the device keys are unavailable: {failure:?}"))?;
	Ok(Some((account.id, device_id)))
}

fn signed_in_database<R: Runtime>(app: &AppHandle<R>) -> Result<&Database, String> {
	app.try_state::<DatabaseState>()
		.ok_or_else(|| "the database is not loaded".to_owned())?
		.inner()
		.as_ref()
		.map_err(|failure| format!("the database is unavailable: {failure:?}"))
}

pub fn revoked<R: Runtime>(app: &AppHandle<R>, bearer: &str) {
	tauri::async_runtime::spawn(signed_out_locally(
		app.clone(),
		bearer.to_owned(),
		SIGNED_OUT_ON_SITE,
	));
}

pub fn device_revoked<R: Runtime>(app: &AppHandle<R>, bearer: &str) {
	tauri::async_runtime::spawn(signed_out_locally(app.clone(), bearer.to_owned(), DEVICE_REVOKED));
}

pub fn device_refused<R: Runtime>(app: &AppHandle<R>, bearer: &str) {
	tauri::async_runtime::spawn(signed_out_locally(app.clone(), bearer.to_owned(), DEVICE_REFUSED));
}

async fn signed_out_locally<R: Runtime>(
	app: AppHandle<R>,
	refused: String,
	signed_out: AccountState,
) {
	let session = app.state::<AccountSession>();
	let _turn = session.turn.lock().await;
	match session.bearer() {
		Ok(Some(bearer)) if bearer == refused => {}
		Ok(_) => return,
		Err(error) => {
			return eprintln!("the refused bearer was not compared with the stored one: {error:?}")
		}
	}
	let _relay_turn = signed_in_work_stopped(&app).await;
	relay_device_forgotten(&app).await;
	let next = match session.forget_bearer() {
		Ok(()) => signed_out,
		Err(error) => unstored(error),
	};
	entered(&app, next);
}

#[cfg(test)]
mod tests {
	use std::collections::VecDeque;
	use std::sync::{Arc, Mutex};
	use std::time::Instant;

	use tokio::sync::{watch, Semaphore};

	use axum::extract::{Path as Route, State as Served};
	use axum::http::{header, HeaderMap, StatusCode};
	use axum::routing::{get, post};
	use axum::Router;
	use serde_json::{json, Value};
	use tauri::test::mock_builder;
	use tauri::Listener;

	use super::*;
	use crate::account::contract::AccountPlan;
	use crate::db;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
	use crate::user::commands::user_set_preferences;
	use crate::user::contract::UserPreferences;

	const BEARER: &str = "bearer-that-never-leaves";
	const REVOKED: &str = "bearer-the-cloud-forgot";
	const FLAKY: &str = "bearer-the-cloud-cannot-read";
	const EMAIL: &str = "steve@example.com";
	const REQUEST_ID: &str = "6f1c1d4e-7a9b-4c3d-8e2f-0a1b2c3d4e5f";
	const POLL_SECRET: &str = "poll-secret-that-never-leaves";
	const EXPIRES_AT: &str = "2099-10-12T10:10:00.000Z";
	const PATIENCE: Duration = Duration::from_secs(15);
	const PAST_THE_FIRST_POLL: Duration = Duration::from_secs(10);

	#[derive(Clone, Default)]
	struct Cloudy {
		create_status: Option<StatusCode>,
		interval: u64,
		expires_at: Option<String>,
		expires_in: Option<Duration>,
		closes_after_create: bool,
		poll_answers: Arc<Mutex<VecDeque<(StatusCode, Value)>>>,
		sign_out_status: Option<StatusCode>,
		instances_status: Option<StatusCode>,
		account: Option<Value>,
		rename_status: Option<StatusCode>,
		rename_held: Option<Arc<Semaphore>>,
		renamed: Arc<Mutex<Vec<Value>>>,
		created: Arc<Mutex<Vec<Value>>>,
		polls: Arc<Mutex<Vec<Instant>>>,
		signed_out: Arc<Mutex<Vec<String>>>,
		stop: Arc<Notify>,
	}

	impl Cloudy {
		fn polled_with(answers: Vec<(StatusCode, Value)>) -> Self {
			Self { poll_answers: Arc::new(Mutex::new(answers.into())), ..Self::default() }
		}

		fn last_created(&self) -> Value {
			self.created.lock().expect("the stub").last().cloned().expect("a request was created")
		}

		fn callback(&self) -> String {
			let created = self.last_created();
			created["callbackURL"].as_str().expect("a callback url").to_owned()
		}

		fn polls(&self) -> Vec<Instant> {
			self.polls.lock().expect("the stub").clone()
		}

		fn renamed(&self) -> Vec<Value> {
			self.renamed.lock().expect("the stub").clone()
		}

		async fn renamed_once(&self) -> Vec<Value> {
			tokio::time::timeout(PATIENCE, async {
				loop {
					let renamed = self.renamed();
					if !renamed.is_empty() {
						return renamed;
					}
					tokio::time::sleep(Duration::from_millis(10)).await;
				}
			})
			.await
			.expect("a rename reached the relay in time")
		}
	}

	fn approved() -> (StatusCode, Value) {
		(
			StatusCode::OK,
			json!({ "status": "approved", "token": BEARER, "user": account_answered() }),
		)
	}

	fn verification_url() -> String {
		format!("https://kiroshi.app/authorize?request={REQUEST_ID}")
	}

	async fn stub(cloudy: Cloudy) -> String {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address = listener.local_addr().expect("the stub is named");
		let stop = Arc::clone(&cloudy.stop);
		let router = Router::new()
			.route("/authorization-requests", post(created))
			.route("/authorization-requests/{id}/poll", post(poll))
			.route("/me", get(me).patch(renamed))
			.route("/instances", get(instances))
			.route("/api/auth/sign-out", post(signed_out))
			.with_state(cloudy);
		tauri::async_runtime::spawn(async move {
			axum::serve(listener, router)
				.with_graceful_shutdown(async move { stop.notified().await })
				.await
				.expect("the stub serves");
		});
		format!("http://{address}")
	}

	type Answered = (StatusCode, [(header::HeaderName, &'static str); 1], String);

	fn answered_json(status: StatusCode, body: Value) -> Answered {
		(status, [(header::CONTENT_TYPE, "application/json")], body.to_string())
	}

	fn expiry_of(cloudy: &Cloudy) -> String {
		match (cloudy.expires_in, &cloudy.expires_at) {
			(Some(expires_in), _) => (Utc::now() + expires_in).to_rfc3339(),
			(None, Some(expires_at)) => expires_at.clone(),
			(None, None) => EXPIRES_AT.to_owned(),
		}
	}

	async fn created(Served(cloudy): Served<Cloudy>, body: String) -> Answered {
		let body: Value = serde_json::from_str(&body).expect("a json body");
		cloudy.created.lock().expect("the stub").push(body);
		if cloudy.closes_after_create {
			cloudy.stop.notify_one();
		}
		if let Some(status) = cloudy.create_status {
			return answered_json(status, json!({}));
		}
		answered_json(
			StatusCode::CREATED,
			json!({
				"id": REQUEST_ID,
				"pollSecret": POLL_SECRET,
				"verificationURL": verification_url(),
				"expiresAt": expiry_of(&cloudy),
				"interval": cloudy.interval
			}),
		)
	}

	async fn poll(
		Served(cloudy): Served<Cloudy>,
		Route(id): Route<String>,
		body: String,
	) -> Answered {
		cloudy.polls.lock().expect("the stub").push(Instant::now());
		let body: Value = serde_json::from_str(&body).expect("a json body");
		if id != REQUEST_ID || body["pollSecret"] != POLL_SECRET {
			return answered_json(StatusCode::NOT_FOUND, json!({}));
		}
		let next = cloudy.poll_answers.lock().expect("the stub").pop_front();
		let (status, answer) =
			next.unwrap_or((StatusCode::OK, json!({ "status": "pending", "interval": 1 })));
		answered_json(status, answer)
	}

	fn bearer_of(headers: &HeaderMap) -> String {
		let header = headers.get("authorization").and_then(|value| value.to_str().ok());
		header.unwrap_or_default().trim_start_matches("Bearer ").to_owned()
	}

	fn account_answered() -> Value {
		json!({ "id": "u1", "email": EMAIL, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" })
	}

	async fn me(Served(cloudy): Served<Cloudy>, headers: HeaderMap) -> Answered {
		match bearer_of(&headers).as_str() {
			BEARER => {
				answered_json(StatusCode::OK, cloudy.account.unwrap_or_else(account_answered))
			}
			FLAKY => answered_json(StatusCode::SERVICE_UNAVAILABLE, json!({})),
			_ => answered_json(StatusCode::UNAUTHORIZED, json!({ "message": "no session" })),
		}
	}

	async fn renamed(Served(cloudy): Served<Cloudy>, headers: HeaderMap, body: String) -> Answered {
		assert_eq!(bearer_of(&headers), BEARER);
		let body: Value = serde_json::from_str(&body).expect("a json body");
		cloudy.renamed.lock().expect("the stub").push(body.clone());
		if let Some(held) = cloudy.rename_held {
			held.acquire().await.expect("the hold stays open").forget();
		}
		answered_json(cloudy.rename_status.unwrap_or(StatusCode::OK), body)
	}

	async fn instances(Served(cloudy): Served<Cloudy>) -> Answered {
		answered_json(cloudy.instances_status.unwrap_or(StatusCode::OK), json!([]))
	}

	async fn signed_out(Served(cloudy): Served<Cloudy>, headers: HeaderMap) -> StatusCode {
		cloudy.signed_out.lock().expect("the stub").push(bearer_of(&headers));
		cloudy.sign_out_status.unwrap_or(StatusCode::OK)
	}

	struct Harness {
		app: AppOfItsOwn,
		root: PathBuf,
		heard: Arc<Mutex<Vec<String>>>,
		noticed: Arc<watch::Sender<()>>,
		opened: Arc<Mutex<Vec<String>>>,
		_folder: Option<RemovedOnDrop>,
	}

	impl Harness {
		fn new(name: &str, api_url: &str) -> Self {
			let root = RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-account-{name}")));
			let _ = std::fs::remove_dir_all(&root);
			Self::holding(Ok(root), api_url)
		}

		fn without_store(api_url: &str) -> Self {
			let unavailable = EnvError::Unwritable {
				detail: "the application data directory is unavailable".to_owned(),
			};
			Self::holding(Err(unavailable), api_url)
		}

		fn holding(folder: Result<RemovedOnDrop, EnvError>, api_url: &str) -> Self {
			let app = an_app_of_its_own("account-session", mock_builder());
			let root = folder.as_deref().map(Path::to_path_buf).map_err(EnvError::clone);
			app.manage(AccountSession::new(root.clone(), api_url));
			app.manage(db::bootstrap(app.handle()));
			let root = root.unwrap_or_default();
			let heard = Arc::new(Mutex::new(Vec::new()));
			let hearing = Arc::clone(&heard);
			let noticed = Arc::new(watch::channel(()).0);
			let noticing = Arc::clone(&noticed);
			app.listen(ACCOUNT_CHANGED.name(), move |event| {
				hearing.lock().expect("the events").push(event.payload().to_owned());
				noticing.send_replace(());
			});
			Self { app, root, heard, noticed, opened: Arc::default(), _folder: folder.ok() }
		}

		async fn sign_in(&self) -> Result<(), AccountError> {
			let opened = Arc::clone(&self.opened);
			sign_in(self.app.handle(), move |url| {
				opened.lock().expect("the browser").push(url.to_owned());
				Ok(())
			})
			.await
		}

		fn database(&self) -> &db::Database {
			self.app.state::<DatabaseState>().inner().as_ref().expect("the database opens")
		}

		async fn preferences(&self) -> UserPreferences {
			let stored = self.database().user().preferences().await.expect("the preferences read");
			UserPreferences::of(stored, None)
		}

		async fn named_as(&self, display_name: &str) {
			let mut preferences = self.preferences().await;
			preferences.display_name = display_name.to_owned();
			self.database().user().set_preferences(preferences.into()).await.expect("stored");
		}

		async fn names_settled(&self) {
			let session = self.app.state::<AccountSession>();
			let naming = session.naming.lock().expect("the naming").take();
			let Some(naming) = naming else {
				return;
			};
			let last_sent = tokio::time::timeout(PATIENCE, naming)
				.await
				.expect("the name was sent in time")
				.expect("the name was sent cleanly");
			*session.naming.lock().expect("the naming") =
				Some(tauri::async_runtime::spawn(async move { last_sent }));
		}

		async fn renamed_to(&self, display_name: &str) -> UserPreferences {
			let mut preferences = self.preferences().await;
			preferences.display_name = display_name.to_owned();
			let handle = self.app.handle();
			user_set_preferences(handle.clone(), handle.state(), preferences)
				.await
				.expect("the preferences are stored")
		}

		fn opened(&self) -> Vec<String> {
			self.opened.lock().expect("the browser").clone()
		}

		fn state(&self) -> AccountState {
			self.app.state::<AccountSession>().current()
		}

		fn stored(&self) -> Option<String> {
			store::values(&self.root, &EnvScope::Account)
				.expect("the store reads")
				.remove(ACCOUNT_BEARER)
		}

		fn store(&self, bearer: &str) {
			store::set(&self.root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the store keeps it");
		}

		async fn entered_until(&self, is_entered: impl Fn(&AccountState) -> bool) -> AccountState {
			let mut noticed = self.noticed.subscribe();
			loop {
				let state = self.state();
				if is_entered(&state) {
					return state;
				}
				tokio::time::timeout(PATIENCE, noticed.changed())
					.await
					.unwrap_or_else(|_| panic!("the account stayed {state:?}"))
					.expect("the harness listens");
			}
		}

		async fn settled(&self) -> AccountState {
			self.entered_until(|state| !matches!(state, AccountState::Waiting { .. })).await
		}

		async fn signed_out(&self) -> AccountState {
			self.entered_until(|state| matches!(state, AccountState::SignedOut { .. })).await
		}

		async fn flow_ended(&self) {
			let flow = self.app.state::<AccountSession>().turn.lock().await.take();
			let flow = flow.expect("a sign-in flow ran");
			let ended = tokio::time::timeout(PATIENCE, flow).await.expect("the flow ended in time");
			ended.expect("the flow ended cleanly");
		}

		fn heard(&self) -> Vec<Value> {
			let heard = self.heard.lock().expect("the events");
			heard
				.iter()
				.map(|payload| serde_json::from_str(payload).expect("a json payload"))
				.collect()
		}

		fn assert_no_secret_was_heard(&self) {
			assert!(self
				.heard
				.lock()
				.expect("the events")
				.iter()
				.all(|payload| !payload.contains("bearer-") && !payload.contains(POLL_SECRET)));
		}
	}

	fn signed_in() -> AccountState {
		AccountState::SignedIn(crate::account::contract::KiroshiAccount {
			id: "u1".to_owned(),
			email: EMAIL.to_owned(),
			created_at: "2026-10-01T00:00:00.000Z".to_owned(),
			plan: Some(AccountPlan::Pro),
		})
	}

	fn waiting() -> AccountState {
		AccountState::Waiting {
			verification_url: verification_url(),
			expires_at: EXPIRES_AT.to_owned(),
		}
	}

	fn failed(failure: AccountFailure) -> AccountState {
		AccountState::Failed { failure }
	}

	async fn called(url: &str) -> StatusCode {
		reqwest::get(url).await.expect("the callback answers").status()
	}

	async fn is_closed(callback: &str) -> bool {
		reqwest::get(callback).await.is_err()
	}

	async fn no_poll_follows(harness: &Harness, cloudy: &Cloudy, count: usize) {
		harness.flow_ended().await;
		assert_eq!(cloudy.polls().len(), count);
	}

	fn run(test: impl std::future::Future<Output = ()>) {
		tauri::async_runtime::block_on(test);
	}

	#[test]
	fn a_sign_in_creates_the_request_opens_its_verification_url_and_waits() {
		run(async {
			let cloudy = Cloudy { interval: 600, ..Cloudy::default() };
			let harness = Harness::new("waits", &stub(cloudy.clone()).await);

			harness.sign_in().await.expect("the sign-in starts");

			let created = cloudy.last_created();
			assert_eq!(created["platform"], "macos");
			let device_name = created["deviceName"].as_str().expect("a device name");
			assert!(!device_name.is_empty() && device_name.encode_utf16().count() <= 64);
			let callback = cloudy.callback();
			let (origin, nonce) = callback.split_once("/callback?state=").expect("the shape");
			assert!(origin.starts_with("http://127.0.0.1:"));
			assert_ne!(origin, "http://127.0.0.1:0");
			assert_eq!(nonce.len(), 64);
			assert!(nonce.chars().all(|character| character.is_ascii_hexdigit()));
			assert_eq!(harness.opened(), vec![verification_url()]);
			assert_eq!(harness.state(), waiting());
			assert_eq!(
				harness.heard(),
				vec![json!({
					"kind": "waiting",
					"verificationUrl": verification_url(),
					"expiresAt": EXPIRES_AT
				})]
			);
			harness.assert_no_secret_was_heard();
		});
	}

	#[test]
	fn an_approved_poll_signs_in_with_no_callback_and_closes_the_listener() {
		run(async {
			let cloudy = Cloudy::polled_with(vec![approved()]);
			let harness = Harness::new("approved-poll", &stub(cloudy.clone()).await);

			harness.sign_in().await.expect("the sign-in starts");

			assert_eq!(harness.settled().await, signed_in());
			assert_eq!(harness.stored().as_deref(), Some(BEARER));
			assert!(is_closed(&cloudy.callback()).await);
			no_poll_follows(&harness, &cloudy, 1).await;
			harness.assert_no_secret_was_heard();
		});
	}

	#[test]
	fn a_callback_polls_at_once_signs_in_and_no_poll_follows() {
		run(async {
			let cloudy = Cloudy { interval: 600, ..Cloudy::polled_with(vec![approved()]) };
			let harness = Harness::new("callback-first", &stub(cloudy.clone()).await);
			harness.sign_in().await.expect("the sign-in starts");
			let callback = cloudy.callback();

			let answered =
				reqwest::get(format!("{callback}&request={REQUEST_ID}")).await.expect("answers");

			assert_eq!(answered.status(), StatusCode::OK);
			assert!(answered
				.headers()
				.get("content-type")
				.is_some_and(|kind| kind.to_str().is_ok_and(|kind| kind.starts_with("text/html"))));
			assert!(answered.text().await.expect("a page").contains("go back to Kiroshi"));
			assert_eq!(harness.settled().await, signed_in());
			assert_eq!(harness.stored().as_deref(), Some(BEARER));
			assert!(is_closed(&callback).await);
			no_poll_follows(&harness, &cloudy, 1).await;
			harness.assert_no_secret_was_heard();
		});
	}

	#[test]
	fn a_429_adds_five_seconds_to_the_interval() {
		run(async {
			let too_many = (StatusCode::TOO_MANY_REQUESTS, json!({}));
			let cloudy = Cloudy::polled_with(vec![too_many, approved()]);
			let harness = Harness::new("slow-down", &stub(cloudy.clone()).await);

			harness.sign_in().await.expect("the sign-in starts");

			assert_eq!(harness.settled().await, signed_in());
			let polls = cloudy.polls();
			assert_eq!(polls.len(), 2);
			let waited = polls[1] - polls[0];
			assert!(waited >= SLOW_DOWN && waited < SLOW_DOWN * 2, "{waited:?}");
		});
	}

	#[test]
	fn an_expired_cancelled_or_unknown_request_fails_and_closes_the_listener() {
		run(async {
			for (name, answer, failure) in [
				(
					"expired",
					(StatusCode::OK, json!({ "status": "expired" })),
					AccountFailure::Expired,
				),
				(
					"cancelled",
					(StatusCode::OK, json!({ "status": "cancelled" })),
					AccountFailure::Cancelled,
				),
				("unknown", (StatusCode::NOT_FOUND, json!({})), AccountFailure::Expired),
				("redeemed", (StatusCode::GONE, json!({})), AccountFailure::Expired),
			] {
				let cloudy = Cloudy::polled_with(vec![answer]);
				let harness = Harness::new(name, &stub(cloudy.clone()).await);

				harness.sign_in().await.expect("the sign-in starts");

				assert_eq!(harness.settled().await, failed(failure), "{name}");
				assert_eq!(harness.stored(), None);
				assert!(is_closed(&cloudy.callback()).await);
				no_poll_follows(&harness, &cloudy, 1).await;
			}
		});
	}

	#[test]
	fn a_request_left_pending_past_its_expiry_fails_expired() {
		run(async {
			let cloudy = Cloudy { expires_in: Some(PAST_THE_FIRST_POLL), ..Cloudy::default() };
			let harness = Harness::new("pending-past-expiry", &stub(cloudy.clone()).await);

			harness.sign_in().await.expect("the sign-in starts");

			assert_eq!(harness.settled().await, failed(AccountFailure::Expired));
			assert!(is_closed(&cloudy.callback()).await);
		});
	}

	#[test]
	fn polls_that_never_connect_until_the_expiry_fail_unreachable() {
		run(async {
			let expires_at = (Utc::now() + Duration::from_millis(500)).to_rfc3339();
			let cloudy = Cloudy {
				expires_at: Some(expires_at),
				closes_after_create: true,
				..Cloudy::default()
			};
			let harness = Harness::new("polls-unreached", &stub(cloudy.clone()).await);

			harness.sign_in().await.expect("the sign-in starts");

			assert_eq!(harness.settled().await, failed(AccountFailure::Unreachable));
			assert!(cloudy.polls().is_empty());
			assert!(is_closed(&cloudy.callback()).await);
		});
	}

	#[test]
	fn a_create_that_does_not_connect_or_answers_other_than_201_fails_unreachable() {
		run(async {
			let closed = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("binds");
			let api = format!("http://{}", closed.local_addr().expect("named"));
			drop(closed);
			let harness = Harness::new("no-cloud", &api);

			harness.sign_in().await.expect("the sign-in settles");

			assert_eq!(harness.state(), failed(AccountFailure::Unreachable));
			assert!(harness.opened().is_empty());

			for (name, status) in
				[("create-200", StatusCode::OK), ("create-429", StatusCode::TOO_MANY_REQUESTS)]
			{
				let cloudy = Cloudy { create_status: Some(status), ..Cloudy::default() };
				let harness = Harness::new(name, &stub(cloudy.clone()).await);

				harness.sign_in().await.expect("the sign-in settles");

				assert_eq!(harness.state(), failed(AccountFailure::Unreachable), "{name}");
				assert!(is_closed(&cloudy.callback()).await);
				assert!(harness.opened().is_empty());
			}
		});
	}

	#[test]
	fn a_mismatched_callback_is_refused_and_the_sign_in_keeps_waiting() {
		run(async {
			let cloudy = Cloudy { interval: 600, ..Cloudy::polled_with(vec![approved()]) };
			let harness = Harness::new("stray", &stub(cloudy.clone()).await);
			harness.sign_in().await.expect("the sign-in starts");
			let callback = cloudy.callback();
			let (origin, _) = callback.split_once("/callback").expect("the shape");

			assert_eq!(called(&format!("{origin}/callback")).await, StatusCode::BAD_REQUEST);
			assert_eq!(
				called(&format!("{origin}/callback?state=other&request={REQUEST_ID}")).await,
				StatusCode::BAD_REQUEST
			);
			assert_eq!(called(&format!("{origin}/elsewhere")).await, StatusCode::NOT_FOUND);

			assert_eq!(harness.state(), waiting());
			assert_eq!(called(&callback).await, StatusCode::OK);
			assert_eq!(harness.settled().await, signed_in());
			no_poll_follows(&harness, &cloudy, 1).await;
		});
	}

	#[test]
	fn a_second_sign_in_stops_the_first_before_creating_its_own() {
		run(async {
			let cloudy = Cloudy { interval: 600, ..Cloudy::polled_with(vec![approved()]) };
			let harness = Harness::new("second", &stub(cloudy.clone()).await);
			harness.sign_in().await.expect("the sign-in starts");
			let first = cloudy.callback();

			harness.sign_in().await.expect("again");
			let second = cloudy.callback();

			assert_ne!(first, second);
			assert!(is_closed(&first).await);
			assert_eq!(harness.state(), waiting());
			assert_eq!(called(&second).await, StatusCode::OK);
			assert_eq!(harness.settled().await, signed_in());
		});
	}

	#[test]
	fn signing_out_while_waiting_stops_polling_and_closes_the_listener() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("out-waiting", &stub(cloudy.clone()).await);
			harness.sign_in().await.expect("the sign-in starts");

			sign_out(harness.app.handle()).await.expect("the sign-out settles");
			let polled = cloudy.polls().len();

			assert!(is_closed(&cloudy.callback()).await);
			assert_eq!(harness.state(), SIGNED_OUT);
			assert!(cloudy.signed_out.lock().expect("the stub").is_empty());
			assert!(harness.app.state::<AccountSession>().turn.lock().await.is_none());
			assert_eq!(cloudy.polls().len(), polled);
		});
	}

	#[test]
	fn the_device_name_is_trimmed_cut_to_64_utf16_units_and_mac_when_empty() {
		assert_eq!(device_name_of("  Studio\n"), "Studio");
		assert_eq!(device_name_of(" \n"), "Mac");
		assert_eq!(device_name_of(&"a".repeat(80)), "a".repeat(64));
		let wide = format!("{}{}", "a".repeat(63), "\u{1F600}");
		assert_eq!(device_name_of(&wide), "a".repeat(63));
	}

	#[test]
	fn the_account_carries_the_plan_the_cloud_answers_and_none_it_does_not_know() {
		run(async {
			let mut planless = account_answered();
			planless.as_object_mut().expect("an account object").remove("plan");
			let plan_answered = |plan: Value| {
				let mut account = account_answered();
				account["plan"] = plan;
				account
			};
			for (answered, plan) in [
				(plan_answered(json!("pro")), Some(AccountPlan::Pro)),
				(plan_answered(json!("free")), Some(AccountPlan::Free)),
				(planless, None),
				(plan_answered(Value::Null), None),
				(plan_answered(json!("team")), None),
				(plan_answered(json!("Pro")), None),
				(plan_answered(json!(1)), None),
				(plan_answered(json!({ "name": "pro" })), None),
			] {
				let cloudy = Cloudy { account: Some(answered.clone()), ..Cloudy::default() };
				let cloud = Cloud::new(&stub(cloudy).await);

				let account = cloud.me(BEARER).await.expect("the account parses");

				assert_eq!(account.plan, plan, "{:?}", answered.get("plan"));
				assert_eq!(
					(account.id.as_str(), account.email.as_str(), account.created_at.as_str()),
					("u1", EMAIL, "2026-10-01T00:00:00.000Z")
				);
			}
		});
	}

	#[test]
	fn a_stored_bearer_signs_in_at_launch() {
		run(async {
			let harness = Harness::new("restore", &stub(Cloudy::default()).await);
			harness.store(BEARER);

			restore(harness.app.handle().clone()).await;

			assert_eq!(harness.state(), signed_in());
			harness.assert_no_secret_was_heard();
		});
	}

	#[test]
	fn a_sign_in_sends_the_trimmed_display_name_to_the_cloud() {
		run(async {
			let cloudy = Cloudy::polled_with(vec![approved()]);
			let harness = Harness::new("named-sign-in", &stub(cloudy.clone()).await);
			harness.named_as("  Ada Lovelace  ").await;

			harness.sign_in().await.expect("the sign-in starts");
			harness.flow_ended().await;
			harness.names_settled().await;

			assert_eq!(harness.state(), signed_in());
			assert_eq!(cloudy.renamed(), vec![json!({ "name": "Ada Lovelace" })]);
		});
	}

	#[test]
	fn a_restore_sends_the_display_name_cut_to_80_characters() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("named-restore", &stub(cloudy.clone()).await);
			harness.named_as(&format!(" {} ", "é".repeat(100))).await;
			harness.store(BEARER);

			restore(harness.app.handle().clone()).await;
			harness.names_settled().await;

			assert_eq!(cloudy.renamed(), vec![json!({ "name": "é".repeat(80) })]);
		});
	}

	#[test]
	fn a_rename_while_signed_in_sends_the_new_name_once() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("named-rename", &stub(cloudy.clone()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			harness.renamed_to(" Grace ").await;
			harness.names_settled().await;
			harness.renamed_to("Grace").await;
			harness.names_settled().await;

			assert_eq!(cloudy.renamed(), vec![json!({ "name": "Grace" })]);
		});
	}

	#[test]
	fn an_empty_display_name_is_never_sent() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("named-empty", &stub(cloudy.clone()).await);
			harness.named_as("   ").await;
			harness.store(BEARER);

			restore(harness.app.handle().clone()).await;
			harness.renamed_to("Grace").await;
			harness.renamed_to("  ").await;
			harness.names_settled().await;

			assert_eq!(harness.state(), signed_in());
			assert_eq!(cloudy.renamed(), vec![json!({ "name": "Grace" })]);
		});
	}

	#[test]
	fn a_rename_while_signed_out_sends_nothing() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("named-signed-out", &stub(cloudy.clone()).await);

			harness.renamed_to("Grace").await;
			harness.names_settled().await;

			assert!(cloudy.renamed().is_empty());
		});
	}

	#[test]
	fn a_500_on_the_rename_keeps_the_stored_preferences_and_the_answer() {
		run(async {
			let cloudy = Cloudy {
				rename_status: Some(StatusCode::INTERNAL_SERVER_ERROR),
				..Cloudy::default()
			};
			let harness = Harness::new("named-500", &stub(cloudy.clone()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			let answered = harness.renamed_to("Grace").await;
			harness.names_settled().await;

			assert_eq!(answered.display_name, "Grace");
			assert_eq!(harness.preferences().await, answered);
			assert_eq!(cloudy.renamed(), vec![json!({ "name": "Grace" })]);
			assert_eq!(harness.state(), signed_in());
		});
	}

	#[test]
	fn a_401_on_the_rename_signs_out_on_site_and_deletes_the_bearer() {
		run(async {
			let cloudy =
				Cloudy { rename_status: Some(StatusCode::UNAUTHORIZED), ..Cloudy::default() };
			let harness = Harness::new("named-401", &stub(cloudy.clone()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			let answered = harness.renamed_to("Grace").await;

			assert_eq!(answered.display_name, "Grace");
			assert_eq!(harness.signed_out().await, SIGNED_OUT_ON_SITE);
			assert_eq!(harness.stored(), None);
		});
	}

	#[test]
	fn a_relay_holding_the_rename_holds_neither_the_save_nor_the_restore() {
		run(async {
			let held = Arc::new(Semaphore::new(0));
			let cloudy = Cloudy { rename_held: Some(Arc::clone(&held)), ..Cloudy::default() };
			let harness = Harness::new("named-held", &stub(cloudy.clone()).await);
			harness.named_as("Ada").await;
			harness.store(BEARER);

			tokio::time::timeout(PATIENCE, restore(harness.app.handle().clone()))
				.await
				.expect("the restore answers while the relay holds the rename");
			assert_eq!(cloudy.renamed_once().await, vec![json!({ "name": "Ada" })]);
			let answered = tokio::time::timeout(PATIENCE, harness.renamed_to("Grace"))
				.await
				.expect("the save answers while the relay holds the rename");

			assert_eq!(answered.display_name, "Grace");
			assert_eq!(cloudy.renamed(), vec![json!({ "name": "Ada" })]);
			held.add_permits(2);
			harness.names_settled().await;
			assert_eq!(
				cloudy.renamed(),
				vec![json!({ "name": "Ada" }), json!({ "name": "Grace" })]
			);
		});
	}

	#[test]
	fn two_renames_back_to_back_leave_the_second_name_last_on_the_relay() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("named-twice", &stub(cloudy.clone()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			harness.renamed_to("Ada").await;
			harness.renamed_to("Grace").await;
			harness.names_settled().await;

			assert_eq!(cloudy.renamed().last(), Some(&json!({ "name": "Grace" })));
		});
	}

	#[test]
	fn a_revoked_bearer_is_deleted_and_the_account_is_signed_out_on_site() {
		run(async {
			let harness = Harness::new("revoked", &stub(Cloudy::default()).await);
			harness.store(REVOKED);

			restore(harness.app.handle().clone()).await;

			assert_eq!(harness.state(), SIGNED_OUT_ON_SITE);
			assert_eq!(harness.stored(), None);
			assert_eq!(
				harness.heard(),
				vec![json!({ "kind": "signedOut", "reason": "signedOutOnSite" })]
			);
		});
	}

	#[test]
	fn a_401_on_the_instances_route_signs_out_on_site_and_deletes_the_bearer() {
		run(async {
			let cloudy =
				Cloudy { instances_status: Some(StatusCode::UNAUTHORIZED), ..Cloudy::default() };
			let api = stub(cloudy).await;
			let harness = Harness::new("instances-401", &api);
			harness.app.manage(joined_spaces::relay::RelayGuests::new(&api));
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;
			assert_eq!(harness.state(), signed_in());

			joined_spaces::relay::reconciled(harness.app.handle()).await;

			assert_eq!(harness.signed_out().await, SIGNED_OUT_ON_SITE);
			assert_eq!(harness.stored(), None);
			harness.assert_no_secret_was_heard();
		});
	}

	#[test]
	fn a_401_for_a_bearer_no_longer_stored_leaves_the_account_alone() {
		run(async {
			let harness = Harness::new("stale-401", &stub(Cloudy::default()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			let app = harness.app.handle().clone();
			signed_out_locally(app, REVOKED.to_owned(), SIGNED_OUT_ON_SITE).await;

			assert_eq!(harness.state(), signed_in());
			assert_eq!(harness.stored().as_deref(), Some(BEARER));
		});
	}

	#[test]
	fn an_unreadable_account_keeps_the_bearer_and_names_the_reason() {
		run(async {
			let harness = Harness::new("flaky", &stub(Cloudy::default()).await);
			harness.store(FLAKY);

			restore(harness.app.handle().clone()).await;

			let AccountState::Unreachable { reason } = harness.state() else {
				panic!("the account is not unreachable: {:?}", harness.state());
			};
			assert!(reason.contains("503"), "{reason}");
			assert_eq!(harness.stored().as_deref(), Some(FLAKY));
			harness.assert_no_secret_was_heard();
		});
	}

	#[test]
	fn a_launch_without_a_bearer_stays_signed_out_with_no_reason_and_announces_nothing() {
		run(async {
			let harness = Harness::new("nothing", &stub(Cloudy::default()).await);

			restore(harness.app.handle().clone()).await;

			assert_eq!(harness.state(), SIGNED_OUT);
			assert!(harness.heard().is_empty());
		});
	}

	#[test]
	fn signing_out_closes_the_session_and_deletes_the_bearer_whatever_the_cloud_answers() {
		run(async {
			for (name, status) in
				[("out-ok", StatusCode::OK), ("out-failed", StatusCode::INTERNAL_SERVER_ERROR)]
			{
				let cloudy = Cloudy { sign_out_status: Some(status), ..Cloudy::default() };
				let harness = Harness::new(name, &stub(cloudy.clone()).await);
				harness.store(BEARER);
				restore(harness.app.handle().clone()).await;

				sign_out(harness.app.handle()).await.expect("the sign-out settles");

				assert_eq!(
					cloudy.signed_out.lock().expect("the stub").clone(),
					vec![BEARER.to_owned()]
				);
				assert_eq!(harness.stored(), None);
				assert_eq!(harness.state(), SIGNED_OUT);
				assert_eq!(
					harness.heard().last(),
					Some(&json!({ "kind": "signedOut", "reason": null }))
				);
				harness.assert_no_secret_was_heard();
			}
		});
	}

	#[test]
	fn a_signed_in_account_refuses_a_sign_in_without_asking_the_cloud() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("already-in", &stub(cloudy.clone()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			let answered = harness.sign_in().await;

			assert_eq!(answered, Err(AccountError::SignedIn));
			assert!(cloudy.created.lock().expect("the stub").is_empty());
			assert_eq!(harness.state(), signed_in());
		});
	}

	#[test]
	fn without_a_store_every_command_answers_naming_the_store() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::without_store(&stub(cloudy.clone()).await);

			let AccountState::Unreachable { reason } = harness.state() else {
				panic!("the account is not unreachable: {:?}", harness.state());
			};
			assert!(reason.contains("store"), "{reason}");
			assert!(matches!(harness.sign_in().await, Err(AccountError::Store { .. })));
			assert!(matches!(
				sign_out(harness.app.handle()).await,
				Err(AccountError::Store { .. })
			));
			assert!(cloudy.created.lock().expect("the stub").is_empty());
		});
	}
}
