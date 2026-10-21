mod common;

use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::account::contract::CHANGED_EVENT;
use kiroshi_app::account::session::AccountSession;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::crypto::commands::DeviceKeysState;
use kiroshi_app::crypto::contract::DeviceKeysError;
use kiroshi_app::crypto::key_store::{load_or_create, FileStore};
use kiroshi_app::environment::contract::{EnvError, EnvScope, ACCOUNT_BEARER};
use kiroshi_app::environment::store;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, WebviewWindow, WebviewWindowBuilder};
use tokio::net::TcpListener;
use tokio::sync::watch;

const BEARER: &str = "integration-bearer";
const EMAIL: &str = "steve@example.com";
const REQUEST_ID: &str = "0b7f3c2a-5d4e-4f6a-9b8c-1d2e3f4a5b6c";
const VERIFICATION_URL: &str =
	"https://kiroshi.app/authorize?request=0b7f3c2a-5d4e-4f6a-9b8c-1d2e3f4a5b6c";
const EXPIRES_AT: &str = "2099-10-12T10:10:00.000Z";
const PATIENCE: Duration = Duration::from_secs(60);

type Callbacks = Arc<Mutex<Vec<String>>>;

async fn cloud(callbacks: Callbacks) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
	let address = listener.local_addr().expect("the stub is named");
	let router = Router::new()
		.route("/authorization-requests", post(created))
		.route(
			"/authorization-requests/{id}/poll",
			post(|| async {
				answered(
					StatusCode::OK,
					json!({ "status": "approved", "token": BEARER, "user": account() }),
				)
			}),
		)
		.route("/me", get(me))
		.route(
			"/api/auth/sign-out",
			post(|| async { answered(StatusCode::OK, json!({ "status": true })) }),
		)
		.with_state(callbacks);
	tauri::async_runtime::spawn(async move {
		axum::serve(listener, router).await.expect("the stub serves");
	});
	format!("http://{address}")
}

type Answered = (StatusCode, [(header::HeaderName, &'static str); 1], String);

fn answered(status: StatusCode, body: Value) -> Answered {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string())
}

async fn created(State(callbacks): State<Callbacks>, body: String) -> Answered {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let callback = body["callbackURL"].as_str().expect("a callback url").to_owned();
	callbacks.lock().expect("the stub").push(callback);
	answered(
		StatusCode::CREATED,
		json!({
			"id": REQUEST_ID,
			"pollSecret": "integration-poll-secret",
			"verificationURL": VERIFICATION_URL,
			"expiresAt": EXPIRES_AT,
			"interval": 600
		}),
	)
}

fn account() -> Value {
	json!({ "id": "u1", "email": EMAIL, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" })
}

async fn me(headers: HeaderMap) -> Answered {
	let presented = headers.get("authorization").and_then(|value| value.to_str().ok());
	if presented != Some(&format!("Bearer {BEARER}")) {
		return answered(StatusCode::UNAUTHORIZED, json!({ "message": "no session" }));
	}
	answered(StatusCode::OK, account())
}

async fn closed_port() -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("binds");
	format!("http://{}", listener.local_addr().expect("named"))
}

struct Host {
	_app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	root: PathBuf,
	noticed: Arc<watch::Sender<()>>,
	_folder: Option<RemovedOnDrop>,
}

impl Host {
	fn new(api_url: &str) -> Self {
		static CLAIMED: AtomicUsize = AtomicUsize::new(0);
		let root = RemovedOnDrop(std::env::temp_dir().join(format!(
			"kiroshi-account-it-{}-{}",
			std::process::id(),
			CLAIMED.fetch_add(1, Ordering::Relaxed)
		)));
		Self::holding(Ok(root), api_url)
	}

	fn without_store(api_url: &str) -> Self {
		let unavailable = EnvError::Unwritable {
			detail: "the application data directory is unavailable".to_owned(),
		};
		Self::holding(Err(unavailable), api_url)
	}

	fn holding(folder: Result<RemovedOnDrop, EnvError>, api_url: &str) -> Self {
		let root = folder.as_deref().map(Path::to_path_buf).map_err(EnvError::clone);
		let device_keys = match &root {
			Ok(root) => load_or_create(None, &device_keys_file(root)),
			Err(_) => Err(DeviceKeysError::NoProfileDirectory),
		};
		let app = an_app_of_its_own(
			"account",
			mock_builder()
				.invoke_handler(invoke_handler())
				.manage(AccountSession::new(root.clone(), api_url))
				.manage(DeviceKeysState::new(device_keys)),
		);
		let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
			.build()
			.expect("window builds");
		let noticed = Arc::new(watch::channel(()).0);
		let noticing = noticed.clone();
		app.listen_any(CHANGED_EVENT, move |_| {
			noticing.send_replace(());
		});
		let root = root.unwrap_or_default();
		Self { _app: app, window, root, noticed, _folder: folder.ok() }
	}

	fn call(&self, cmd: &str, body: Value) -> Result<Value, Value> {
		tauri::test::get_ipc_response(
			&self.window,
			InvokeRequest {
				cmd: cmd.into(),
				callback: tauri::ipc::CallbackFn(0),
				error: tauri::ipc::CallbackFn(1),
				url: "tauri://localhost".parse().expect("url"),
				body: body.into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		)
		.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
		.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
	}

	fn state(&self) -> Value {
		self.call("account_state", json!({})).expect("the state answers")
	}

	async fn settled(&self) -> Value {
		let mut noticed = self.noticed.subscribe();
		loop {
			let state = self.state();
			if state["kind"] != "waiting" {
				return state;
			}
			tokio::time::timeout(PATIENCE, noticed.changed())
				.await
				.expect("the account stayed waiting")
				.expect("the host listens");
		}
	}

	fn stored(&self) -> Option<String> {
		store::values(&self.root, &EnvScope::Account)
			.expect("the store reads")
			.remove(ACCOUNT_BEARER)
	}
}

fn device_keys_file(root: &Path) -> FileStore {
	FileStore::at(root.join("device-keys"))
}

async fn signed_in(host: &Host, callbacks: &Callbacks) {
	host.call("account_sign_in", json!({})).expect("the sign-in starts");
	let callback =
		callbacks.lock().expect("the stub").last().cloned().expect("a request was created");
	reqwest::get(format!("{callback}&request={REQUEST_ID}")).await.expect("the callback");
	assert_eq!(host.settled().await["kind"], "signedIn");
}

impl Drop for Host {
	fn drop(&mut self) {
		let _ = std::fs::remove_dir_all(&self.root);
	}
}

#[test]
fn the_callback_polls_signs_the_account_in_and_sign_out_deletes_the_bearer() {
	tauri::async_runtime::block_on(async {
		let callbacks = Callbacks::default();
		let host = Host::new(&cloud(Arc::clone(&callbacks)).await);
		assert_eq!(host.state(), json!({ "kind": "signedOut", "reason": null }));

		host.call("account_sign_in", json!({})).expect("the sign-in starts");
		assert_eq!(
			host.state(),
			json!({ "kind": "waiting", "verificationUrl": VERIFICATION_URL, "expiresAt": EXPIRES_AT })
		);
		let callback =
			callbacks.lock().expect("the stub").last().cloned().expect("a request was created");

		let page =
			reqwest::get(format!("{callback}&request={REQUEST_ID}")).await.expect("the callback");
		assert_eq!(page.status(), StatusCode::OK);
		assert_eq!(
			host.settled().await,
			json!({
				"kind": "signedIn",
				"id": "u1",
				"email": EMAIL,
				"createdAt": "2026-10-01T00:00:00.000Z",
				"plan": "pro"
			})
		);
		assert_eq!(host.stored().as_deref(), Some(BEARER));

		host.call("account_sign_out", json!({})).expect("the sign-out settles");
		assert_eq!(host.stored(), None);
		assert_eq!(host.state(), json!({ "kind": "signedOut", "reason": null }));
	});
}

#[test]
fn a_sign_out_then_a_sign_in_answers_the_same_device_keys() {
	tauri::async_runtime::block_on(async {
		let callbacks = Callbacks::default();
		let host = Host::new(&cloud(Arc::clone(&callbacks)).await);
		signed_in(&host, &callbacks).await;
		let identity = host.call("get_device_identity", json!({})).expect("the identity answers");

		host.call("account_sign_out", json!({})).expect("the sign-out settles");
		signed_in(&host, &callbacks).await;

		assert_eq!(host.call("get_device_identity", json!({})), Ok(identity.clone()));
		let stored = load_or_create(None, &device_keys_file(&host.root)).expect("the keys reload");
		assert_eq!(identity["deviceId"], stored.device_id().to_string());
	});
}

#[test]
fn a_cloud_that_is_down_fails_the_sign_in_unreachable() {
	tauri::async_runtime::block_on(async {
		let host = Host::new(&closed_port().await);

		host.call("account_sign_in", json!({})).expect("the sign-in settles");

		assert_eq!(host.state(), json!({ "kind": "failed", "failure": "unreachable" }));
		assert_eq!(host.stored(), None);
	});
}

#[test]
fn without_a_store_the_three_commands_answer_naming_the_store() {
	tauri::async_runtime::block_on(async {
		let callbacks = Callbacks::default();
		let host = Host::without_store(&cloud(Arc::clone(&callbacks)).await);

		let state = host.state();
		assert_eq!(state["kind"], "unreachable");
		assert!(state["reason"].as_str().is_some_and(|reason| reason.contains("store")));
		let signing_in = host.call("account_sign_in", json!({}));
		assert_eq!(signing_in.expect_err("the sign-in is refused")["kind"], "store");
		let signing_out = host.call("account_sign_out", json!({}));
		assert_eq!(signing_out.expect_err("the sign-out is refused")["kind"], "store");
		assert!(callbacks.lock().expect("the stub").is_empty());
	});
}
