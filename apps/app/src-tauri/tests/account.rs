mod common;

use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::account::session::AccountSession;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::environment::contract::{EnvError, EnvScope, ACCOUNT_BEARER};
use kiroshi_app::environment::store;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};
use tokio::net::TcpListener;

const BEARER: &str = "integration-bearer";
const EMAIL: &str = "steve@example.com";

type Callbacks = Arc<Mutex<Vec<String>>>;

async fn cloud(callbacks: Callbacks) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
	let address = listener.local_addr().expect("the stub is named");
	let router = Router::new()
		.route("/api/auth/sign-in/magic-link", post(magic_link))
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

async fn magic_link(State(callbacks): State<Callbacks>, body: String) -> Answered {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let callback = body["callbackURL"].as_str().expect("a callback url").to_owned();
	callbacks.lock().expect("the stub").push(callback);
	let expires_at = (chrono::Utc::now() + Duration::from_secs(300)).to_rfc3339();
	answered(StatusCode::OK, json!({ "status": true, "expiresAt": expires_at }))
}

async fn me(headers: HeaderMap) -> Answered {
	let presented = headers.get("authorization").and_then(|value| value.to_str().ok());
	if presented != Some(&format!("Bearer {BEARER}")) {
		return answered(StatusCode::UNAUTHORIZED, json!({ "message": "no session" }));
	}
	answered(
		StatusCode::OK,
		json!({ "id": "u1", "email": EMAIL, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" }),
	)
}

async fn closed_port() -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("binds");
	format!("http://{}", listener.local_addr().expect("named"))
}

struct Host {
	_app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	root: PathBuf,
}

impl Host {
	fn new(api_url: &str) -> Self {
		static CLAIMED: AtomicUsize = AtomicUsize::new(0);
		let root = std::env::temp_dir().join(format!(
			"kiroshi-account-it-{}-{}",
			std::process::id(),
			CLAIMED.fetch_add(1, Ordering::Relaxed)
		));
		Self::holding(Ok(root), api_url)
	}

	fn without_store(api_url: &str) -> Self {
		let unavailable = EnvError::Unwritable {
			detail: "the application data directory is unavailable".to_owned(),
		};
		Self::holding(Err(unavailable), api_url)
	}

	fn holding(root: Result<PathBuf, EnvError>, api_url: &str) -> Self {
		let app = an_app_of_its_own(
			"account",
			mock_builder()
				.invoke_handler(invoke_handler())
				.manage(AccountSession::new(root.clone(), api_url)),
		);
		let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
			.build()
			.expect("window builds");
		Self { _app: app, window, root: root.unwrap_or_default() }
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
		for _ in 0..200 {
			let state = self.state();
			if state["kind"] != "waiting" {
				return state;
			}
			tokio::time::sleep(Duration::from_millis(10)).await;
		}
		panic!("the account stayed waiting");
	}

	fn stored(&self) -> Option<String> {
		store::values(&self.root, &EnvScope::Account)
			.expect("the store reads")
			.remove(ACCOUNT_BEARER)
	}
}

impl Drop for Host {
	fn drop(&mut self) {
		let _ = std::fs::remove_dir_all(&self.root);
	}
}

#[test]
fn a_token_on_the_callback_signs_the_account_in_and_sign_out_deletes_the_bearer() {
	tauri::async_runtime::block_on(async {
		let callbacks = Callbacks::default();
		let host = Host::new(&cloud(Arc::clone(&callbacks)).await);
		assert_eq!(host.state(), json!({ "kind": "signedOut" }));

		host.call("account_sign_in", json!({ "email": EMAIL })).expect("the sign-in starts");
		assert_eq!(host.state(), json!({ "kind": "waiting", "email": EMAIL }));
		let callback =
			callbacks.lock().expect("the stub").last().cloned().expect("a link was asked");

		let page = reqwest::get(format!("{callback}&token={BEARER}")).await.expect("the callback");
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
		assert_eq!(host.state(), json!({ "kind": "signedOut" }));
	});
}

#[test]
fn a_cloud_that_is_down_leaves_the_account_unreachable() {
	tauri::async_runtime::block_on(async {
		let host = Host::new(&closed_port().await);

		host.call("account_sign_in", json!({ "email": EMAIL })).expect("the sign-in settles");

		let state = host.state();
		assert_eq!(state["kind"], "unreachable");
		assert!(state["reason"].as_str().is_some_and(|reason| !reason.is_empty()));
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
		let signing_in = host.call("account_sign_in", json!({ "email": EMAIL }));
		assert_eq!(signing_in.expect_err("the sign-in is refused")["kind"], "store");
		let signing_out = host.call("account_sign_out", json!({}));
		assert_eq!(signing_out.expect_err("the sign-out is refused")["kind"], "store");
		assert!(callbacks.lock().expect("the stub").is_empty());
	});
}
