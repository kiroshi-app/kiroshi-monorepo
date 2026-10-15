mod common;

use std::path::Path;
use std::time::Duration;

use common::removed_on_drop::RemovedOnDrop;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::commands::terminate_session;
use kiroshi_app::agent::contract::SignInError;
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::sign_in::{
	agent_sign_in, agent_sign_in_cancel, agent_sign_in_code, SignInState, SIGN_IN_STARTED_CHANNEL,
};
use kiroshi_app::agent::AgentState;
use kiroshi_app::environment::contract::Values;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};
use tokio::sync::mpsc;
use tokio::time::timeout;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

const FAKE_URL: &str = "https://claude.test/oauth/authorize?state=fake";

const ACCEPTED_CODE: &str = "accepted-code";

const DEADLINE: Duration = Duration::from_secs(10);

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

struct ScopedEnv(Vec<&'static str>);

impl ScopedEnv {
	fn set(pairs: &[(&'static str, String)]) -> Self {
		std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
		for (key, value) in pairs {
			std::env::set_var(key, value);
		}
		let mut keys: Vec<&'static str> = pairs.iter().map(|(key, _)| *key).collect();
		keys.push(SIDECAR_OVERRIDE_ENV);
		Self(keys)
	}
}

impl Drop for ScopedEnv {
	fn drop(&mut self) {
		for key in &self.0 {
			std::env::remove_var(key);
		}
	}
}

fn an_app() -> AppOfItsOwn {
	an_app_of_its_own(
		"sign-in",
		mock_builder().manage(AgentState::default()).manage(SignInState::default()),
	)
}

fn started_urls(app: &App<MockRuntime>) -> mpsc::UnboundedReceiver<Value> {
	let (tx, rx) = mpsc::unbounded_channel();
	app.listen(SIGN_IN_STARTED_CHANNEL, move |event| {
		let payload = serde_json::from_str(event.payload()).expect("the payload is json");
		tx.send(payload).expect("the test still listens");
	});
	rx
}

async fn first_url(urls: &mut mpsc::UnboundedReceiver<Value>) -> Value {
	timeout(DEADLINE, urls.recv())
		.await
		.expect("the url is emitted in time")
		.expect("the listener is still attached")
}

async fn answered_after_the_cancel(app: &App<MockRuntime>) {
	let sidecar = app.state::<AgentState>().sidecar().await.expect("the sidecar runs");
	sidecar.checked(&Values::new()).await.expect("a later command is answered");
}

async fn wind_down(app: &App<MockRuntime>) {
	terminate_session(app.state::<AgentState>().inner()).await;
}

fn a_received_file(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir()
			.join(format!("kiroshi-sign-in-received-{name}-{}", std::process::id())),
	);
	let _ = std::fs::remove_file(&path);
	path
}

fn records_received(path: &Path) -> (&'static str, String) {
	("FAKE_AGENT_SIGN_IN_RECEIVED_FILE", path.to_str().expect("a printable path").to_owned())
}

#[test]
fn a_sign_in_emits_the_url_and_resolves_once_the_pasted_code_is_accepted() {
	let _serial = serial();
	let _env = ScopedEnv::set(&[]);
	let app = an_app();
	let mut urls = started_urls(&app);
	let handle = app.handle().clone();

	tauri::async_runtime::block_on(async {
		let signing = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		let started = first_url(&mut urls).await;
		agent_sign_in_code(handle.clone(), ACCEPTED_CODE.to_owned())
			.await
			.expect("the code reaches the sidecar");
		let settled = timeout(DEADLINE, signing).await.expect("the sign-in settles");
		wind_down(&app).await;

		assert_eq!(started, json!({ "url": FAKE_URL }));
		assert_eq!(settled.expect("the task joins"), Ok(()));
	});
}

#[test]
fn a_refused_code_resolves_with_the_reason_the_sidecar_gave() {
	let _serial = serial();
	let _env = ScopedEnv::set(&[]);
	let app = an_app();
	let mut urls = started_urls(&app);
	let handle = app.handle().clone();

	tauri::async_runtime::block_on(async {
		let signing = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		first_url(&mut urls).await;
		agent_sign_in_code(handle.clone(), "a-wrong-code".to_owned())
			.await
			.expect("the code reaches the sidecar");
		let settled = timeout(DEADLINE, signing).await.expect("the sign-in settles");
		wind_down(&app).await;

		assert_eq!(
			settled.expect("the task joins"),
			Err(SignInError::Failed { detail: "the code was refused".to_owned() })
		);
	});
}

#[test]
fn a_second_sign_in_is_refused_while_one_runs_and_a_cancel_settles_the_first() {
	let _serial = serial();
	let _env = ScopedEnv::set(&[]);
	let app = an_app();
	let mut urls = started_urls(&app);
	let handle = app.handle().clone();

	tauri::async_runtime::block_on(async {
		let signing = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		first_url(&mut urls).await;
		let second = agent_sign_in(handle.clone()).await;
		agent_sign_in_cancel(handle.clone()).await.expect("the cancel reaches the sidecar");
		let first = timeout(DEADLINE, signing).await.expect("the sign-in settles");
		wind_down(&app).await;

		assert_eq!(second, Err(SignInError::AlreadyRunning));
		assert_eq!(first.expect("the task joins"), Err(SignInError::Cancelled));
	});
}

#[test]
fn a_url_no_browser_may_be_handed_is_refused_and_never_emitted() {
	let _serial = serial();
	let refused = "javascript:alert(1)";
	let _env = ScopedEnv::set(&[("FAKE_AGENT_SIGN_IN_URL", refused.to_owned())]);
	let app = an_app();
	let mut urls = started_urls(&app);
	let handle = app.handle().clone();

	tauri::async_runtime::block_on(async {
		let settled = timeout(DEADLINE, agent_sign_in(handle)).await.expect("the sign-in settles");
		let emitted = urls.try_recv();
		wind_down(&app).await;

		assert_eq!(settled, Err(SignInError::RefusedUrl { url: refused.to_owned() }));
		assert!(emitted.is_err(), "a refused url reached the front");
	});
}

#[test]
fn a_dropped_invoke_leaves_no_sign_in_running_in_the_sidecar() {
	let _serial = serial();
	let received_file = a_received_file("dropped");
	let _env = ScopedEnv::set(&[records_received(&received_file)]);
	let app = an_app();
	let mut urls = started_urls(&app);
	let handle = app.handle().clone();

	tauri::async_runtime::block_on(async {
		let signing = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		first_url(&mut urls).await;
		signing.abort();
		let dropped = timeout(DEADLINE, signing).await.expect("the invoke is dropped in time");
		answered_after_the_cancel(&app).await;
		let again = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		let reopened = first_url(&mut urls).await;
		let cancelled = std::fs::read_to_string(&received_file);
		agent_sign_in_cancel(handle).await.expect("the cancel reaches the sidecar");
		let _ = timeout(DEADLINE, again).await;
		wind_down(&app).await;
		let _ = std::fs::remove_file(&received_file);

		assert!(dropped.is_err(), "the invoke ran to its end instead of being dropped");
		assert!(
			cancelled.is_ok_and(|recorded| recorded.contains("sign_in_cancel")),
			"the dropped invoke left its sign-in running"
		);
		assert_eq!(reopened, json!({ "url": FAKE_URL }));
	});
}

#[test]
fn a_code_and_a_cancel_while_no_sign_in_runs_are_refused_and_reach_no_sidecar() {
	let _serial = serial();
	let received_file = a_received_file("idle");
	let _env = ScopedEnv::set(&[records_received(&received_file)]);
	let app = an_app();
	let mut urls = started_urls(&app);
	let handle = app.handle().clone();

	tauri::async_runtime::block_on(async {
		let signing = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		first_url(&mut urls).await;
		agent_sign_in_cancel(handle.clone()).await.expect("the cancel reaches the sidecar");
		let _ = timeout(DEADLINE, signing).await.expect("the sign-in settles");

		let code = agent_sign_in_code(handle.clone(), ACCEPTED_CODE.to_owned()).await;
		let cancel = agent_sign_in_cancel(handle.clone()).await;
		let after = tauri::async_runtime::spawn(agent_sign_in(handle.clone()));
		first_url(&mut urls).await;
		let recorded =
			std::fs::read_to_string(&received_file).expect("the sidecar recorded what it received");
		after.abort();
		wind_down(&app).await;
		let _ = std::fs::remove_file(&received_file);

		assert_eq!(code, Err(SignInError::NotRunning));
		assert_eq!(cancel, Err(SignInError::NotRunning));
		assert_eq!(recorded, "sign_in_cancel\n", "the sidecar received a frame of an idle flow");
	});
}
