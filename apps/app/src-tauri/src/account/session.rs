use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use chrono::{DateTime, Utc};

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpListener;

use super::callback::{self, Delivered};
use super::cloud::{Cloud, MagicLinkError, MeError};
use super::contract::{AccountError, AccountFailure, AccountState};
use crate::environment::contract::{EnvError, EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::events::{self, ACCOUNT_CHANGED};
use crate::hosting;
use crate::invitations;
use crate::joined_spaces;

pub struct AccountSession {
	cloud: Cloud,
	root: Result<PathBuf, EnvError>,
	current: Mutex<AccountState>,
	turn: tokio::sync::Mutex<Option<JoinHandle<()>>>,
}

impl AccountSession {
	pub fn new(root: Result<PathBuf, EnvError>, api_url: &str) -> Self {
		let first = match &root {
			Ok(_) => AccountState::SignedOut,
			Err(error) => unstored(error.clone()),
		};
		Self {
			cloud: Cloud::new(api_url),
			root,
			current: Mutex::new(first),
			turn: tokio::sync::Mutex::new(None),
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
				Ok(()) => AccountState::SignedOut,
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

pub async fn sign_in<R: Runtime>(app: &AppHandle<R>, email: String) -> Result<(), AccountError> {
	let session = app.state::<AccountSession>();
	let mut waiting = session.turn.lock().await;
	session.root()?;
	if matches!(session.current(), AccountState::SignedIn(_)) {
		return Err(AccountError::SignedIn);
	}
	closed(&mut waiting).await;
	let refused = |error: std::io::Error| AccountError::Listener { detail: error.to_string() };
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.map_err(refused)?;
	let port = listener.local_addr().map_err(refused)?.port();
	let nonce =
		callback::nonce().map_err(|error| AccountError::Listener { detail: error.to_string() })?;
	let callback_url = callback::callback_url(port, &nonce);
	let expires_at = match session.cloud.request_magic_link(&email, &callback_url).await {
		Ok(expires_at) => expires_at,
		Err(MagicLinkError::Rejected(code)) => {
			drop(listener);
			if matches!(session.current(), AccountState::Waiting { .. }) {
				entered(app, AccountState::SignedOut);
			}
			return Err(AccountError::Rejected { code });
		}
		Err(MagicLinkError::Unreachable(reason)) => {
			drop(listener);
			entered(app, AccountState::Unreachable { reason });
			return Ok(());
		}
	};
	entered(app, AccountState::Waiting { email });
	*waiting = Some(tauri::async_runtime::spawn(settled(app.clone(), listener, nonce, expires_at)));
	Ok(())
}

fn left_until(expires_at: DateTime<Utc>) -> Duration {
	(expires_at - Utc::now()).to_std().unwrap_or(Duration::ZERO)
}

async fn settled<R: Runtime>(
	app: AppHandle<R>,
	listener: TcpListener,
	nonce: String,
	expires_at: DateTime<Utc>,
) {
	let session = app.state::<AccountSession>();
	let next = match callback::awaited(listener, nonce, left_until(expires_at)).await {
		None => AccountState::Failed { failure: AccountFailure::TimedOut },
		Some(Delivered::Refused(failure)) => AccountState::Failed { failure },
		Some(Delivered::Bearer(bearer)) => session.signed_in_with(&bearer).await,
	};
	let is_signed_in = matches!(next, AccountState::SignedIn(_));
	entered(&app, next);
	if is_signed_in {
		hosting::resumed(&app).await;
		invitations::resumed(&app);
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
	hosting::resumed(&app).await;
	if matches!(session.current(), AccountState::SignedIn(_)) {
		invitations::resumed(&app);
	}
}

pub async fn sign_out<R: Runtime>(app: &AppHandle<R>) -> Result<(), AccountError> {
	let session = app.state::<AccountSession>();
	let mut waiting = session.turn.lock().await;
	closed(&mut waiting).await;
	hosting::signed_out(app).await;
	invitations::signed_out(app).await;
	let _relay_turn = joined_spaces::relay::signed_out(app).await;
	if let Some(bearer) = session.bearer()? {
		if let Err(reason) = session.cloud.sign_out(&bearer).await {
			eprintln!(
				"the cloud did not close the session, the bearer is deleted anyway: {reason}"
			);
		}
	}
	session.forget_bearer()?;
	entered(app, AccountState::SignedOut);
	Ok(())
}

#[cfg(test)]
mod tests {
	use std::sync::{Arc, Mutex};

	use axum::extract::State as Served;
	use axum::http::{header, HeaderMap, StatusCode};
	use axum::routing::{get, post};
	use axum::Router;
	use serde_json::{json, Value};
	use tauri::test::mock_builder;
	use tauri::Listener;

	use super::*;
	use crate::account::contract::AccountPlan;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const BEARER: &str = "bearer-that-never-leaves";
	const REVOKED: &str = "bearer-the-cloud-forgot";
	const FLAKY: &str = "bearer-the-cloud-cannot-read";
	const EMAIL: &str = "steve@example.com";

	#[derive(Clone, Default)]
	struct Cloudy {
		magic_link_status: Option<StatusCode>,
		link_lifetime: Option<Duration>,
		expires_at: Option<&'static str>,
		sign_out_status: Option<StatusCode>,
		account: Option<Value>,
		callbacks: Arc<Mutex<Vec<String>>>,
		signed_out: Arc<Mutex<Vec<String>>>,
	}

	impl Cloudy {
		fn last_callback(&self) -> String {
			self.callbacks
				.lock()
				.expect("the stub")
				.last()
				.cloned()
				.expect("a magic link was asked")
		}
	}

	async fn stub(cloudy: Cloudy) -> String {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address = listener.local_addr().expect("the stub is named");
		let router = Router::new()
			.route("/api/auth/sign-in/magic-link", post(magic_link))
			.route("/me", get(me))
			.route("/api/auth/sign-out", post(signed_out))
			.with_state(cloudy);
		tauri::async_runtime::spawn(async move {
			axum::serve(listener, router).await.expect("the stub serves");
		});
		format!("http://{address}")
	}

	type Answered = (StatusCode, [(header::HeaderName, &'static str); 1], String);

	fn answered_json(status: StatusCode, body: Value) -> Answered {
		(status, [(header::CONTENT_TYPE, "application/json")], body.to_string())
	}

	async fn magic_link(Served(cloudy): Served<Cloudy>, body: String) -> Answered {
		let body: Value = serde_json::from_str(&body).expect("a json body");
		let callback = body["callbackURL"].as_str().expect("a callback url").to_owned();
		cloudy.callbacks.lock().expect("the stub").push(callback);
		if !body["email"].as_str().is_some_and(|email| email.contains('@')) {
			return answered_json(
				StatusCode::BAD_REQUEST,
				json!({ "error": { "code": "VALIDATION_ERROR", "message": "Invalid", "status": 400 } }),
			);
		}
		if let Some(status) = cloudy.magic_link_status {
			return answered_json(status, json!({}));
		}
		let lifetime = cloudy.link_lifetime.unwrap_or(Duration::from_secs(300));
		let expires_at = (Utc::now() + lifetime).to_rfc3339();
		answered_json(
			StatusCode::OK,
			json!({ "status": true, "expiresAt": cloudy.expires_at.unwrap_or(&expires_at) }),
		)
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

	async fn signed_out(Served(cloudy): Served<Cloudy>, headers: HeaderMap) -> StatusCode {
		cloudy.signed_out.lock().expect("the stub").push(bearer_of(&headers));
		cloudy.sign_out_status.unwrap_or(StatusCode::OK)
	}

	struct Harness {
		app: AppOfItsOwn,
		root: PathBuf,
		heard: Arc<Mutex<Vec<String>>>,
	}

	impl Harness {
		fn new(name: &str, api_url: &str) -> Self {
			let root = std::env::temp_dir().join(format!("kiroshi-account-{name}"));
			let _ = std::fs::remove_dir_all(&root);
			Self::holding(Ok(root), api_url)
		}

		fn without_store(api_url: &str) -> Self {
			let unavailable = EnvError::Unwritable {
				detail: "the application data directory is unavailable".to_owned(),
			};
			Self::holding(Err(unavailable), api_url)
		}

		fn holding(root: Result<PathBuf, EnvError>, api_url: &str) -> Self {
			let app = an_app_of_its_own("account-session", mock_builder());
			app.manage(AccountSession::new(root.clone(), api_url));
			let root = root.unwrap_or_default();
			let heard = Arc::new(Mutex::new(Vec::new()));
			let hearing = Arc::clone(&heard);
			app.listen(ACCOUNT_CHANGED.name(), move |event| {
				hearing.lock().expect("the events").push(event.payload().to_owned());
			});
			Self { app, root, heard }
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

		async fn settled(&self) -> AccountState {
			for _ in 0..200 {
				let state = self.state();
				if !matches!(state, AccountState::Waiting { .. }) {
					return state;
				}
				tokio::time::sleep(Duration::from_millis(10)).await;
			}
			panic!("the account stayed waiting");
		}

		fn heard(&self) -> Vec<Value> {
			let heard = self.heard.lock().expect("the events");
			heard
				.iter()
				.map(|payload| serde_json::from_str(payload).expect("a json payload"))
				.collect()
		}

		fn assert_the_bearer_was_never_heard(&self) {
			assert!(self
				.heard
				.lock()
				.expect("the events")
				.iter()
				.all(|payload| !payload.contains("bearer-")));
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
		AccountState::Waiting { email: EMAIL.to_owned() }
	}

	async fn called(url: &str) -> StatusCode {
		reqwest::get(url).await.expect("the callback answers").status()
	}

	async fn is_closed(callback: &str) -> bool {
		reqwest::get(callback).await.is_err()
	}

	fn run(test: impl std::future::Future<Output = ()>) {
		tauri::async_runtime::block_on(test);
	}

	#[test]
	fn a_sign_in_binds_the_loopback_with_a_32_byte_nonce_and_waits() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("waits", &stub(cloudy.clone()).await);

			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");

			let callback = cloudy.last_callback();
			let (origin, nonce) = callback.split_once("/callback?state=").expect("the shape");
			assert!(origin.starts_with("http://127.0.0.1:"));
			assert_ne!(origin, "http://127.0.0.1:0");
			assert_eq!(nonce.len(), 64);
			assert!(nonce.chars().all(|character| character.is_ascii_hexdigit()));
			assert_eq!(harness.state(), waiting());
			assert_eq!(harness.heard(), vec![json!({ "kind": "waiting", "email": EMAIL })]);
		});
	}

	#[test]
	fn a_matching_token_stores_the_bearer_signs_in_and_closes_the_listener() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("token", &stub(cloudy.clone()).await);
			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");
			let callback = cloudy.last_callback();

			let answered =
				reqwest::get(format!("{callback}&token={BEARER}")).await.expect("answers");

			assert_eq!(answered.status(), StatusCode::OK);
			assert!(answered
				.headers()
				.get("content-type")
				.is_some_and(|kind| kind.to_str().is_ok_and(|kind| kind.starts_with("text/html"))));
			assert_eq!(harness.settled().await, signed_in());
			assert_eq!(harness.stored().as_deref(), Some(BEARER));
			assert!(is_closed(&callback).await);
			harness.assert_the_bearer_was_never_heard();
		});
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
	fn a_refused_link_stores_nothing_and_fails_with_its_reason() {
		run(async {
			for (error, failure) in [
				("INVALID_TOKEN", AccountFailure::LinkInvalid),
				("SERVER_ERROR", AccountFailure::ServerError),
			] {
				let cloudy = Cloudy::default();
				let harness = Harness::new(error, &stub(cloudy.clone()).await);
				sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");
				let callback = cloudy.last_callback();

				assert_eq!(called(&format!("{callback}&error={error}")).await, StatusCode::OK);

				assert_eq!(harness.settled().await, AccountState::Failed { failure });
				assert_eq!(harness.stored(), None);
				assert!(is_closed(&callback).await);
			}
		});
	}

	#[test]
	fn a_stray_callback_is_refused_and_the_listener_keeps_waiting() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("stray", &stub(cloudy.clone()).await);
			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");
			let callback = cloudy.last_callback();
			let (origin, _) = callback.split_once("/callback").expect("the shape");

			assert_eq!(
				called(&format!("{origin}/callback?token={BEARER}")).await,
				StatusCode::BAD_REQUEST
			);
			assert_eq!(
				called(&format!("{origin}/callback?state=other&token={BEARER}")).await,
				StatusCode::BAD_REQUEST
			);
			assert_eq!(
				called(&format!("{origin}/elsewhere?token={BEARER}")).await,
				StatusCode::NOT_FOUND
			);
			assert_eq!(called(&callback).await, StatusCode::BAD_REQUEST);

			assert_eq!(harness.state(), waiting());
			assert_eq!(harness.stored(), None);
			assert_eq!(called(&format!("{callback}&token={BEARER}")).await, StatusCode::OK);
			assert_eq!(harness.settled().await, signed_in());
		});
	}

	#[test]
	fn no_callback_before_the_link_expires_times_out_and_closes_the_listener() {
		run(async {
			let cloudy =
				Cloudy { link_lifetime: Some(Duration::from_millis(100)), ..Cloudy::default() };
			let harness = Harness::new("timeout", &stub(cloudy.clone()).await);
			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");

			assert_eq!(
				harness.settled().await,
				AccountState::Failed { failure: AccountFailure::TimedOut }
			);
			assert!(is_closed(&cloudy.last_callback()).await);
		});
	}

	#[test]
	fn a_second_sign_in_closes_the_first_listener_before_binding_its_own() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("second", &stub(cloudy.clone()).await);
			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");
			let first = cloudy.last_callback();

			sign_in(harness.app.handle(), "other@example.com".to_owned()).await.expect("again");
			let second = cloudy.last_callback();

			assert_ne!(first, second);
			assert!(is_closed(&first).await);
			assert_eq!(
				harness.state(),
				AccountState::Waiting { email: "other@example.com".to_owned() }
			);
			assert_eq!(called(&format!("{second}&token={BEARER}")).await, StatusCode::OK);
			assert_eq!(harness.settled().await, signed_in());
		});
	}

	#[test]
	fn a_refused_magic_link_closes_the_listener_and_names_the_status() {
		run(async {
			let cloudy = Cloudy {
				magic_link_status: Some(StatusCode::SERVICE_UNAVAILABLE),
				..Cloudy::default()
			};
			let harness = Harness::new("refused-post", &stub(cloudy.clone()).await);

			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in settles");

			let AccountState::Unreachable { reason } = harness.state() else {
				panic!("the account is not unreachable: {:?}", harness.state());
			};
			assert!(reason.contains("503"), "{reason}");
			assert!(is_closed(&cloudy.last_callback()).await);
		});
	}

	#[test]
	fn a_cloud_that_does_not_connect_leaves_the_account_unreachable() {
		run(async {
			let closed = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("binds");
			let api = format!("http://{}", closed.local_addr().expect("named"));
			drop(closed);
			let harness = Harness::new("no-cloud", &api);

			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in settles");

			assert!(matches!(harness.state(), AccountState::Unreachable { .. }));
		});
	}

	#[test]
	fn a_stored_bearer_signs_in_at_launch() {
		run(async {
			let harness = Harness::new("restore", &stub(Cloudy::default()).await);
			harness.store(BEARER);

			restore(harness.app.handle().clone()).await;

			assert_eq!(harness.state(), signed_in());
			harness.assert_the_bearer_was_never_heard();
		});
	}

	#[test]
	fn a_revoked_bearer_is_deleted_and_the_account_signs_out() {
		run(async {
			let harness = Harness::new("revoked", &stub(Cloudy::default()).await);
			harness.store(REVOKED);

			restore(harness.app.handle().clone()).await;

			assert_eq!(harness.state(), AccountState::SignedOut);
			assert_eq!(harness.stored(), None);
			assert_eq!(harness.heard(), vec![json!({ "kind": "signedOut" })]);
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
			harness.assert_the_bearer_was_never_heard();
		});
	}

	#[test]
	fn a_launch_without_a_bearer_stays_signed_out_and_announces_nothing() {
		run(async {
			let harness = Harness::new("nothing", &stub(Cloudy::default()).await);

			restore(harness.app.handle().clone()).await;

			assert_eq!(harness.state(), AccountState::SignedOut);
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
				assert_eq!(harness.state(), AccountState::SignedOut);
				harness.assert_the_bearer_was_never_heard();
			}
		});
	}

	#[test]
	fn signing_out_while_waiting_closes_the_listener() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("out-waiting", &stub(cloudy.clone()).await);
			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");

			sign_out(harness.app.handle()).await.expect("the sign-out settles");

			assert!(is_closed(&cloudy.last_callback()).await);
			assert_eq!(harness.state(), AccountState::SignedOut);
			assert!(cloudy.signed_out.lock().expect("the stub").is_empty());
		});
	}

	#[test]
	fn an_answer_without_a_readable_expiry_closes_the_listener_and_is_unreachable() {
		run(async {
			let cloudy = Cloudy { expires_at: Some("tomorrow"), ..Cloudy::default() };
			let harness = Harness::new("no-expiry", &stub(cloudy.clone()).await);

			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in settles");

			let AccountState::Unreachable { reason } = harness.state() else {
				panic!("the account is not unreachable: {:?}", harness.state());
			};
			assert!(reason.contains("expiresAt"), "{reason}");
			assert!(is_closed(&cloudy.last_callback()).await);
		});
	}

	#[test]
	fn a_rejected_request_answers_the_cloud_code_and_leaves_the_state_alone() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("rejected", &stub(cloudy.clone()).await);

			let answered = sign_in(harness.app.handle(), "not an email".to_owned()).await;

			assert_eq!(
				answered,
				Err(AccountError::Rejected { code: "VALIDATION_ERROR".to_owned() })
			);
			assert_eq!(harness.state(), AccountState::SignedOut);
			assert!(harness.heard().is_empty());
			assert!(is_closed(&cloudy.last_callback()).await);
		});
	}

	#[test]
	fn a_rejected_request_that_closed_a_waiting_link_signs_out_rather_than_wait_forever() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("rejected-waiting", &stub(cloudy.clone()).await);
			sign_in(harness.app.handle(), EMAIL.to_owned()).await.expect("the sign-in starts");
			let first = cloudy.last_callback();

			let answered = sign_in(harness.app.handle(), "not an email".to_owned()).await;

			assert!(matches!(answered, Err(AccountError::Rejected { .. })));
			assert!(is_closed(&first).await);
			assert_eq!(harness.state(), AccountState::SignedOut);
		});
	}

	#[test]
	fn a_signed_in_account_refuses_a_sign_in_without_asking_the_cloud() {
		run(async {
			let cloudy = Cloudy::default();
			let harness = Harness::new("already-in", &stub(cloudy.clone()).await);
			harness.store(BEARER);
			restore(harness.app.handle().clone()).await;

			let answered = sign_in(harness.app.handle(), EMAIL.to_owned()).await;

			assert_eq!(answered, Err(AccountError::SignedIn));
			assert!(cloudy.callbacks.lock().expect("the stub").is_empty());
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
			assert!(matches!(
				sign_in(harness.app.handle(), EMAIL.to_owned()).await,
				Err(AccountError::Store { .. })
			));
			assert!(matches!(
				sign_out(harness.app.handle()).await,
				Err(AccountError::Store { .. })
			));
			assert!(cloudy.callbacks.lock().expect("the stub").is_empty());
		});
	}
}
