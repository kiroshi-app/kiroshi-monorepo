use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::{Path as Route, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::routing::{delete, get, post};
use axum::Router;
use base64::prelude::BASE64_URL_SAFE_NO_PAD;
use chrono::{SecondsFormat, TimeDelta, Utc};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{Listener, Manager};
use tokio::net::TcpListener;

use super::commands::{
	device_approval, device_approval_code_request, device_approval_code_submit,
	device_approval_retry, device_approve, device_refuse, device_remove, devices_list,
};
use super::contract::{AccountDevice, DeviceApproval, DeviceError, DeviceKind, DeviceStatus};
use super::*;
use crate::account::contract::{AccountState, SignedOutReason};
use crate::account::session::{restore, sign_in, sign_out, AccountSession};
use crate::crypto::device_keys::DeviceKeys;
use crate::db;
use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};
use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::events::{ACCOUNT_CHANGED, HOSTING_CHANGED};
use crate::hosting::contract::HostingState;
use crate::hosting::Hosting;
use crate::joined_spaces::commands::joined_space_connect;
use crate::joined_spaces::contract::JoinedSpaceError;
use crate::joined_spaces::join;
use crate::joined_spaces::relay::RelayGuests;
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const BEARER: &str = "bearer-that-never-leaves";
const ACCOUNT_ID: &str = "u1";
const RELAY_DEVICE_ID: &str = "0b0e6a8e-58a2-4b39-9d55-6f6c2f2a7e11";
const OTHER_DEVICE_ID: &str = "7c9f2d61-0f43-4a5e-9b8d-2a1c3e4f5a6b";
const THIRD_DEVICE_ID: &str = "a3d4e5f6-1b2c-4d3e-8f9a-0b1c2d3e4f5a";
const REQUEST_ID: &str = "6f1c1d4e-7a9b-4c3d-8e2f-0a1b2c3d4e5f";
const CODE: &str = "493817";
const PERSONAL: &str = "personal";
const TICK: Duration = Duration::from_millis(60);
const PATIENCE: Duration = Duration::from_secs(15);

type Answer = (StatusCode, Value);

#[derive(Clone)]
struct Relay {
	registered_status: Arc<Mutex<&'static str>>,
	registration_refusal: Arc<Mutex<Option<Answer>>>,
	current: Arc<Mutex<Answer>>,
	listed: Arc<Mutex<Answer>>,
	refusal: Arc<Mutex<Option<Answer>>>,
	calls: Arc<Mutex<Vec<(String, Instant)>>>,
	bodies: Arc<Mutex<Vec<Value>>>,
}

impl Relay {
	fn answering(registered_status: &'static str, current: Answer) -> Self {
		Self {
			registered_status: Arc::new(Mutex::new(registered_status)),
			registration_refusal: Arc::new(Mutex::new(None)),
			current: Arc::new(Mutex::new(current)),
			listed: Arc::new(Mutex::new((StatusCode::OK, json!([])))),
			refusal: Arc::new(Mutex::new(None)),
			calls: Arc::default(),
			bodies: Arc::default(),
		}
	}

	fn approved() -> Self {
		Self::answering("approved", current_approved())
	}

	fn pending_until(expires_at: &str) -> Self {
		Self::answering("pending", current_pending(expires_at))
	}

	fn answers_current(&self, answer: Answer) {
		*self.current.lock().expect("the relay") = answer;
	}

	fn lists(&self, devices: Value) {
		*self.listed.lock().expect("the relay") = (StatusCode::OK, devices);
	}

	fn refuses(&self, status: StatusCode, code: &str) {
		let body =
			json!({ "error": { "code": code, "message": "refused", "status": status.as_u16() } });
		*self.refusal.lock().expect("the relay") = Some((status, body));
	}

	fn refuses_registration(&self, status: StatusCode, code: &str) {
		let body =
			json!({ "error": { "code": code, "message": "refused", "status": status.as_u16() } });
		*self.registration_refusal.lock().expect("the relay") = Some((status, body));
	}

	fn called(&self, call: &str) {
		self.calls.lock().expect("the relay").push((call.to_owned(), Instant::now()));
	}

	fn calls(&self) -> Vec<String> {
		self.calls.lock().expect("the relay").iter().map(|(call, _)| call.clone()).collect()
	}

	fn count(&self, call: &str) -> usize {
		self.calls().iter().filter(|called| *called == call).count()
	}

	fn instants_of(&self, call: &str) -> Vec<Instant> {
		let calls = self.calls.lock().expect("the relay");
		calls.iter().filter(|(called, _)| called == call).map(|(_, at)| *at).collect()
	}

	fn bodies(&self) -> Vec<Value> {
		self.bodies.lock().expect("the relay").clone()
	}

	fn refused_or(
		&self,
		answer: Answer,
	) -> (StatusCode, [(header::HeaderName, &'static str); 1], String) {
		let (status, body) = self.refusal.lock().expect("the relay").clone().unwrap_or(answer);
		(status, [(header::CONTENT_TYPE, "application/json")], body.to_string())
	}
}

type Answered = (StatusCode, [(header::HeaderName, &'static str); 1], String);

fn answered_json((status, body): Answer) -> Answered {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string())
}

fn in_minutes(minutes: i64) -> String {
	(Utc::now() + TimeDelta::minutes(minutes)).to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn in_millis(millis: i64) -> String {
	(Utc::now() + TimeDelta::milliseconds(millis)).to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn current_approved() -> Answer {
	(
		StatusCode::OK,
		json!({ "id": RELAY_DEVICE_ID, "status": "approved", "approvalExpiresAt": null }),
	)
}

fn current_pending(expires_at: &str) -> Answer {
	(
		StatusCode::OK,
		json!({ "id": RELAY_DEVICE_ID, "status": "pending", "approvalExpiresAt": expires_at }),
	)
}

fn unauthorized() -> Answer {
	(
		StatusCode::UNAUTHORIZED,
		json!({ "error": { "code": "UNAUTHENTICATED", "message": "no", "status": 401 } }),
	)
}

fn bearer_of(headers: &HeaderMap) -> &str {
	let header = headers.get("authorization").and_then(|value| value.to_str().ok());
	header.unwrap_or_default().trim_start_matches("Bearer ")
}

async fn me(headers: HeaderMap) -> Answered {
	if bearer_of(&headers) != BEARER {
		return answered_json(unauthorized());
	}
	answered_json((
		StatusCode::OK,
		json!({ "id": ACCOUNT_ID, "email": "ada@example.com", "createdAt": "2026-10-01T00:00:00.000Z" }),
	))
}

async fn authorization_created() -> Answered {
	answered_json((
		StatusCode::CREATED,
		json!({
			"id": REQUEST_ID,
			"pollSecret": "poll-secret",
			"verificationURL": format!("https://kiroshi.app/authorize?request={REQUEST_ID}"),
			"expiresAt": in_minutes(10),
			"interval": 0
		}),
	))
}

async fn authorization_polled() -> Answered {
	answered_json((StatusCode::OK, json!({ "status": "approved", "token": BEARER })))
}

async fn challenged(Served(relay): Served<Relay>) -> Answered {
	relay.called("POST /devices/challenge");
	let nonce = BASE64_URL_SAFE_NO_PAD.encode([9u8; 32]);
	answered_json((StatusCode::CREATED, json!({ "nonce": nonce, "expiresAt": in_minutes(1) })))
}

async fn registered(Served(relay): Served<Relay>, body: String) -> Answered {
	relay.called("POST /devices");
	relay.bodies.lock().expect("the relay").push(serde_json::from_str(&body).expect("a json body"));
	if let Some(refusal) = relay.registration_refusal.lock().expect("the relay").clone() {
		return answered_json(refusal);
	}
	let status = *relay.registered_status.lock().expect("the relay");
	answered_json((
		StatusCode::OK,
		json!({
			"id": RELAY_DEVICE_ID,
			"createdAt": "2026-10-01T00:00:00.000Z",
			"transferred": false,
			"status": status
		}),
	))
}

async fn current(Served(relay): Served<Relay>) -> Answered {
	relay.called("GET /devices/current");
	answered_json(relay.current.lock().expect("the relay").clone())
}

async fn listed(Served(relay): Served<Relay>) -> Answered {
	relay.called("GET /devices");
	answered_json(relay.listed.lock().expect("the relay").clone())
}

async fn code_requested(Served(relay): Served<Relay>) -> Answered {
	relay.called("POST /devices/approval-code");
	relay.refused_or((StatusCode::NO_CONTENT, Value::Null))
}

async fn code_verified(Served(relay): Served<Relay>, body: String) -> Answered {
	relay.called("POST /devices/approval-code/verify");
	relay.bodies.lock().expect("the relay").push(serde_json::from_str(&body).expect("a json body"));
	relay.refused_or((StatusCode::NO_CONTENT, Value::Null))
}

async fn decided(
	Served(relay): Served<Relay>,
	Route((id, verb)): Route<(String, String)>,
) -> Answered {
	relay.called(&format!("POST /devices/{id}/{verb}"));
	relay.refused_or((StatusCode::NO_CONTENT, Value::Null))
}

async fn deleted(Served(relay): Served<Relay>, Route(id): Route<String>) -> Answered {
	relay.called(&format!("DELETE /devices/{id}"));
	relay.refused_or((StatusCode::NO_CONTENT, Value::Null))
}

async fn served(relay: Relay) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
	let address = listener.local_addr().expect("the stub is named");
	let router = Router::new()
		.route("/me", get(me))
		.route("/authorization-requests", post(authorization_created))
		.route("/authorization-requests/{id}/poll", post(authorization_polled))
		.route("/devices/challenge", post(challenged))
		.route("/devices", post(registered).get(listed))
		.route("/devices/current", get(current))
		.route("/devices/approval-code", post(code_requested))
		.route("/devices/approval-code/verify", post(code_verified))
		.route("/devices/{id}/{verb}", post(decided))
		.route("/devices/{id}", delete(deleted))
		.with_state(relay);
	tauri::async_runtime::spawn(async move {
		axum::serve(listener, router).await.expect("the stub serves");
	});
	format!("http://{address}")
}

struct Harness {
	app: AppOfItsOwn,
	relay: Relay,
	heard: Arc<Mutex<Vec<(String, Value)>>>,
	_folder: RemovedOnDrop,
}

impl Harness {
	async fn new(relay: Relay, bearer: Option<&str>) -> Self {
		let api = served(relay.clone()).await;
		Self::at(&api, relay, bearer)
	}

	fn at(api: &str, relay: Relay, bearer: Option<&str>) -> Self {
		let app = an_app_of_its_own("devices", mock_builder());
		let folder = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-devices-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&folder, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		app.manage(AccountSession::new(Ok::<PathBuf, _>(folder.to_path_buf()), api));
		app.manage(db::bootstrap(app.handle()));
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
		app.manage(Hosting::new(api, None));
		app.manage(RelayGuests::new(api));
		app.manage(Devices::new(api).polling_every(TICK, TICK));
		let heard = Arc::new(Mutex::new(Vec::new()));
		for name in [
			ACCOUNT_CHANGED.name(),
			DEVICE_APPROVAL_CHANGED.name(),
			DEVICE_APPROVAL_REQUESTED.name(),
			DEVICE_APPROVAL_SETTLED.name(),
			HOSTING_CHANGED.name(),
		] {
			let hearing = Arc::clone(&heard);
			app.listen(name, move |event| {
				let payload = serde_json::from_str(event.payload()).expect("a json payload");
				hearing.lock().expect("the events").push((name.to_owned(), payload));
			});
		}
		Self { app, relay, heard, _folder: folder }
	}

	async fn restored(relay: Relay) -> Self {
		let harness = Self::new(relay, Some(BEARER)).await;
		restore(harness.app.handle().clone()).await;
		harness
	}

	fn handle(&self) -> AppHandle<MockRuntime> {
		self.app.handle().clone()
	}

	fn approval(&self) -> DeviceApproval {
		device_approval(self.app.state())
	}

	async fn approval_until(&self, is_reached: impl Fn(&DeviceApproval) -> bool) -> DeviceApproval {
		until(PATIENCE, || Some(self.approval()).filter(&is_reached)).await
	}

	async fn approved(&self) {
		self.approval_until(|approval| *approval == DeviceApproval::Approved).await;
	}

	async fn pending(&self) -> DeviceApproval {
		self.approval_until(|approval| matches!(approval, DeviceApproval::Pending { .. })).await
	}

	fn heard(&self, name: &str) -> Vec<Value> {
		let heard = self.heard.lock().expect("the events");
		heard
			.iter()
			.filter(|(heard, _)| heard == name)
			.map(|(_, payload)| payload.clone())
			.collect()
	}

	fn every_event(&self) -> String {
		let heard = self.heard.lock().expect("the events");
		heard
			.iter()
			.map(|(name, payload)| format!("{name} {payload}"))
			.collect::<Vec<_>>()
			.join("\n")
	}

	fn account(&self) -> AccountState {
		self.app.state::<AccountSession>().current()
	}

	async fn held_relay_device(&self) -> Option<String> {
		let device_id = self.keys().device_id().to_string();
		let state = self.app.state::<DatabaseState>();
		let devices = state.as_ref().expect("the database").relay_devices();
		devices.relay_device_id(ACCOUNT_ID.to_owned(), device_id).await.expect("the id reads")
	}

	async fn holding_relay_device(&self, relay_device_id: &str) {
		let device_id = self.keys().device_id().to_string();
		let state = self.app.state::<DatabaseState>();
		let devices = state.as_ref().expect("the database").relay_devices();
		devices
			.registered(ACCOUNT_ID.to_owned(), device_id, relay_device_id.to_owned())
			.await
			.expect("the id is held");
	}

	fn keys(&self) -> DeviceKeys {
		let state = self.app.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the device keys").secret())
	}

	fn hosting(&self) -> HostingState {
		self.app.state::<Hosting>().current(PERSONAL)
	}
}

async fn until<T>(patience: Duration, found: impl Fn() -> Option<T>) -> T {
	tokio::time::timeout(patience, async {
		loop {
			if let Some(found) = found() {
				return found;
			}
			tokio::time::sleep(Duration::from_millis(10)).await;
		}
	})
	.await
	.expect("the awaited state came in time")
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

fn listed_device(id: &str, status: &str, expires_at: Option<&str>, key: Option<String>) -> Value {
	json!({
		"id": id,
		"name": format!("Device {id}"),
		"kind": "phone",
		"status": status,
		"approvalExpiresAt": expires_at,
		"lastActiveAt": "2026-10-10T08:00:00.000Z",
		"createdAt": "2026-10-01T00:00:00.000Z",
		"current": false,
		"ed25519PublicKey": key,
	})
}

fn encoded_signing(keys: &DeviceKeys) -> String {
	BASE64_URL_SAFE_NO_PAD.encode(keys.signing_public().as_bytes())
}

fn words_of(keys: &DeviceKeys) -> Vec<String> {
	fingerprint(&keys.signing_public()).map(str::to_owned).to_vec()
}

#[test]
fn the_relay_is_read_every_5_seconds_while_pending_and_every_15_while_approved() {
	let devices = Devices::new("http://localhost");

	assert_eq!((devices.pending_every, devices.approved_every), (PENDING_EVERY, APPROVED_EVERY));
	assert_eq!((PENDING_EVERY, APPROVED_EVERY), (Duration::from_secs(5), Duration::from_secs(15)));
}

#[test]
fn a_launch_signed_in_registers_the_device_and_stores_its_id_even_with_one_held() {
	run(async {
		let harness = Harness::new(Relay::approved(), Some(BEARER)).await;
		harness.holding_relay_device("a-stale-relay-device-id").await;

		restore(harness.handle()).await;
		harness.approved().await;

		assert_eq!(harness.relay.count("POST /devices"), 1);
		assert_eq!(harness.held_relay_device().await.as_deref(), Some(RELAY_DEVICE_ID));
		assert_eq!(
			harness.relay.bodies()[0]["ed25519PublicKey"],
			json!(encoded_signing(&harness.keys()))
		);
	});
}

#[test]
fn a_completed_sign_in_registers_the_device() {
	run(async {
		let harness = Harness::new(Relay::approved(), None).await;

		sign_in(&harness.handle(), |_| Ok(())).await.expect("the sign-in starts");
		harness.approved().await;

		assert!(matches!(harness.account(), AccountState::SignedIn(_)));
		assert_eq!(harness.relay.count("POST /devices"), 1);
		assert_eq!(harness.held_relay_device().await.as_deref(), Some(RELAY_DEVICE_ID));
	});
}

#[test]
fn the_approval_is_none_while_signed_out_and_back_to_none_on_sign_out() {
	run(async {
		let harness = Harness::new(Relay::approved(), None).await;
		restore(harness.handle()).await;

		assert_eq!(harness.approval(), DeviceApproval::None);
		assert!(harness.relay.calls().is_empty());

		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;
		sign_out(&harness.handle()).await.expect("signed out");

		assert_eq!(harness.approval(), DeviceApproval::None);
		assert_eq!(
			harness.heard(DEVICE_APPROVAL_CHANGED.name()),
			vec![json!({ "kind": "approved" }), json!({ "kind": "none" })]
		);
	});
}

#[test]
fn a_pending_registration_reads_its_expiry_and_emits_one_event() {
	run(async {
		let expires_at = in_minutes(30);
		let harness = Harness::restored(Relay::pending_until(&expires_at)).await;

		let pending = harness.pending().await;
		tokio::time::sleep(TICK * 4).await;

		assert_eq!(pending, DeviceApproval::Pending { expires_at: expires_at.clone() });
		assert_eq!(
			harness.heard(DEVICE_APPROVAL_CHANGED.name()),
			vec![json!({ "kind": "pending", "expiresAt": expires_at })]
		);
	});
}

#[test]
fn a_pending_device_reads_its_current_device_each_tick_and_turns_approved() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;
		until(PATIENCE, || (harness.relay.count("GET /devices/current") >= 3).then_some(())).await;

		harness.relay.answers_current(current_approved());
		harness.approved().await;

		let reads = harness.relay.instants_of("GET /devices/current");
		assert!(reads.windows(2).all(|pair| pair[1] - pair[0] >= TICK), "{reads:?}");
		assert_eq!(
			harness.heard(DEVICE_APPROVAL_CHANGED.name()).last(),
			Some(&json!({ "kind": "approved" }))
		);
	});
}

#[test]
fn a_pending_device_expires_once_its_expiry_is_past_and_stops_reading() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_millis(250))).await;

		harness.approval_until(|approval| *approval == DeviceApproval::Expired).await;
		let reads = harness.relay.count("GET /devices/current");
		tokio::time::sleep(TICK * 4).await;

		assert_eq!(harness.relay.count("GET /devices/current"), reads);
		assert_eq!(
			harness.heard(DEVICE_APPROVAL_CHANGED.name()).last(),
			Some(&json!({ "kind": "expired" }))
		);
	});
}

#[test]
fn an_unreachable_read_while_pending_still_expires_on_the_held_expiry() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_millis(5_000))).await;
		harness.pending().await;
		harness.relay.answers_current((StatusCode::SERVICE_UNAVAILABLE, json!({})));

		harness.approval_until(|approval| *approval == DeviceApproval::Expired).await;
	});
}

#[test]
fn a_401_while_pending_signs_out_locally_as_device_refused() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;

		harness.relay.answers_current(unauthorized());
		let refused = AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRefused) };
		until(PATIENCE, || (harness.account() == refused).then_some(())).await;

		assert_eq!(harness.app.state::<AccountSession>().bearer().expect("the store reads"), None);
		assert_eq!(harness.approval(), DeviceApproval::None);
	});
}

#[test]
fn a_401_on_a_command_while_pending_signs_out_as_device_refused() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;
		harness.relay.refuses(StatusCode::UNAUTHORIZED, "UNAUTHENTICATED");

		let requested = device_approval_code_request(harness.handle()).await;

		assert_eq!(requested, Err(DeviceError::SignedOut));
		let refused = AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRefused) };
		until(PATIENCE, || (harness.account() == refused).then_some(())).await;
	});
}

#[test]
fn while_pending_no_host_starts_and_the_approval_resumes_the_hosted_spaces() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;

		let started = crate::hosting::start(&harness.handle(), PERSONAL.to_owned())
			.await
			.expect("the start settles");
		assert_eq!(
			started,
			HostingState::Failed {
				reason: "this device awaits its approval by another device of the account"
					.to_owned()
			}
		);

		harness.relay.answers_current(current_approved());
		harness.approved().await;
		let not_listening =
			HostingState::Failed { reason: "the local host api is not listening".to_owned() };
		until(PATIENCE, || (harness.hosting() == not_listening).then_some(())).await;
	});
}

#[test]
fn while_pending_no_member_socket_opens() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;
		let state = harness.app.state::<DatabaseState>();
		let joined = state
			.as_ref()
			.expect("the database")
			.joined_spaces()
			.join(JoinedSpace {
				id: "j1".to_owned(),
				reach: JoinedReach::Relay { instance_id: "i1".to_owned() },
				remote_space_id: None,
				name: "Remote".to_owned(),
			})
			.await
			.expect("the joined space is stored");

		let connected = joined_space_connect(harness.handle(), joined.id.clone()).await;
		let accepted_join = join::joined(&harness.handle(), "i1".to_owned(), joined.name).await;

		assert_eq!(connected.err(), Some(JoinedSpaceError::HostOffline { id: joined.id }));
		assert!(
			matches!(accepted_join, Err(JoinedSpaceError::RelayRefused { .. })),
			"{accepted_join:?}"
		);
	});
}

#[test]
fn the_retry_while_expired_registers_again_and_moves_back_to_pending() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_millis(150))).await;
		harness.approval_until(|approval| *approval == DeviceApproval::Expired).await;
		let renewed = in_minutes(30);
		harness.relay.answers_current(current_pending(&renewed));

		let retried = device_approval_retry(harness.handle()).await;

		assert_eq!(retried, Ok(DeviceApproval::Pending { expires_at: renewed }));
		assert_eq!(harness.relay.count("POST /devices"), 2);
	});
}

#[test]
fn the_retry_outside_expired_registers_nothing() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;

		assert_eq!(device_approval_retry(harness.handle()).await, Ok(DeviceApproval::Approved));
		assert_eq!(harness.relay.count("POST /devices"), 1);
	});
}

#[test]
fn the_request_code_command_asks_the_relay_to_email_a_code() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;

		assert_eq!(device_approval_code_request(harness.handle()).await, Ok(()));
		assert_eq!(harness.relay.count("POST /devices/approval-code"), 1);

		harness.relay.refuses(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
		assert_eq!(
			device_approval_code_request(harness.handle()).await,
			Err(DeviceError::EmailUnavailable)
		);
		harness.relay.refuses(StatusCode::TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
		assert_eq!(
			device_approval_code_request(harness.handle()).await,
			Err(DeviceError::TooManyRequests)
		);
	});
}

#[test]
fn a_submitted_code_approves_on_204_and_reaches_no_event() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;

		let submitted = device_approval_code_submit(harness.handle(), CODE.to_owned()).await;

		assert_eq!(submitted, Ok(()));
		assert_eq!(harness.approval(), DeviceApproval::Approved);
		assert!(harness.relay.bodies().contains(&json!({ "code": CODE })));
		assert!(!harness.every_event().contains(CODE), "{}", harness.every_event());
	});
}

#[test]
fn a_wrong_code_is_refused_typed_and_keeps_the_device_pending() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;
		harness.relay.refuses(StatusCode::BAD_REQUEST, "DEVICE_CODE_INVALID");

		let submitted = device_approval_code_submit(harness.handle(), CODE.to_owned()).await;

		assert_eq!(submitted, Err(DeviceError::CodeInvalid));
		assert!(matches!(harness.approval(), DeviceApproval::Pending { .. }));
		assert!(!format!("{submitted:?}").contains(CODE));
	});
}

#[test]
fn the_approve_refuse_and_remove_commands_call_their_routes() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;

		assert_eq!(device_approve(harness.handle(), OTHER_DEVICE_ID.to_owned()).await, Ok(()));
		assert_eq!(device_refuse(harness.handle(), OTHER_DEVICE_ID.to_owned()).await, Ok(()));
		assert_eq!(device_remove(harness.handle(), OTHER_DEVICE_ID.to_owned()).await, Ok(()));

		let calls = harness.relay.calls();
		for call in [
			format!("POST /devices/{OTHER_DEVICE_ID}/approve"),
			format!("POST /devices/{OTHER_DEVICE_ID}/reject"),
			format!("DELETE /devices/{OTHER_DEVICE_ID}"),
		] {
			assert!(calls.contains(&call), "{call} in {calls:?}");
		}
	});
}

#[test]
fn every_relay_refusal_rejects_the_command_typed() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;
		let refusals = [
			(StatusCode::FORBIDDEN, "DEVICE_NOT_APPROVED", DeviceError::NotApproved),
			(StatusCode::CONFLICT, "DEVICE_ALREADY_APPROVED", DeviceError::AlreadyApproved),
			(StatusCode::CONFLICT, "DEVICE_IS_CURRENT", DeviceError::IsCurrent),
			(StatusCode::GONE, "DEVICE_APPROVAL_EXPIRED", DeviceError::ApprovalExpired),
			(StatusCode::NOT_FOUND, "NOT_FOUND", DeviceError::NotFound),
		];

		for (status, code, expected) in refusals {
			harness.relay.refuses(status, code);
			assert_eq!(
				device_approve(harness.handle(), OTHER_DEVICE_ID.to_owned()).await,
				Err(expected)
			);
		}
	});
}

#[test]
fn a_401_on_a_command_while_approved_signs_out_on_site() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;
		harness.relay.refuses(StatusCode::UNAUTHORIZED, "UNAUTHENTICATED");

		let removed = device_remove(harness.handle(), OTHER_DEVICE_ID.to_owned()).await;

		assert_eq!(removed, Err(DeviceError::SignedOut));
		let on_site = AccountState::SignedOut { reason: Some(SignedOutReason::SignedOutOnSite) };
		until(PATIENCE, || (harness.account() == on_site).then_some(())).await;
	});
}

#[test]
fn an_unreachable_relay_rejects_the_command_with_its_detail() {
	run(async {
		let harness = Harness::at("http://127.0.0.1:9", Relay::approved(), Some(BEARER));

		let listed = devices_list(harness.handle()).await;

		assert!(matches!(listed, Err(DeviceError::Unreachable { .. })), "{listed:?}");
	});
}

#[test]
fn the_list_answers_every_device_oldest_first_with_its_fingerprint() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;
		let phone = DeviceKeys::generate().expect("randomness");
		let expires_at = in_minutes(20);
		harness.relay.lists(json!([
			listed_device(OTHER_DEVICE_ID, "approved", None, Some(encoded_signing(&phone))),
			listed_device(THIRD_DEVICE_ID, "pending", Some(&expires_at), None),
		]));

		let listed = devices_list(harness.handle()).await.expect("the devices are listed");

		assert_eq!(
			listed,
			vec![
				AccountDevice {
					id: OTHER_DEVICE_ID.to_owned(),
					name: Some(format!("Device {OTHER_DEVICE_ID}")),
					kind: DeviceKind::Phone,
					status: DeviceStatus::Approved,
					approval_expires_at: None,
					last_active_at: "2026-10-10T08:00:00.000Z".to_owned(),
					current: false,
					fingerprint: Some(words_of(&phone)),
				},
				AccountDevice {
					id: THIRD_DEVICE_ID.to_owned(),
					name: Some(format!("Device {THIRD_DEVICE_ID}")),
					kind: DeviceKind::Phone,
					status: DeviceStatus::Pending,
					approval_expires_at: Some(expires_at),
					last_active_at: "2026-10-10T08:00:00.000Z".to_owned(),
					current: false,
					fingerprint: None,
				},
			]
		);
		assert_eq!(listed[0].fingerprint.as_ref().map(Vec::len), Some(6));
	});
}

#[test]
fn while_approved_each_pending_request_is_announced_once_then_settled_once() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;
		let phone = DeviceKeys::generate().expect("randomness");
		let expires_at = in_minutes(20);
		let asked_at = (chrono::DateTime::parse_from_rfc3339(&expires_at).expect("an instant")
			- TimeDelta::minutes(30))
		.with_timezone(&Utc)
		.to_rfc3339_opts(SecondsFormat::Millis, true);
		harness.relay.lists(json!([
			listed_device(
				OTHER_DEVICE_ID,
				"pending",
				Some(&expires_at),
				Some(encoded_signing(&phone))
			),
			listed_device(THIRD_DEVICE_ID, "pending", Some(&in_minutes(-1)), None),
		]));

		until(PATIENCE, || {
			(!harness.heard(DEVICE_APPROVAL_REQUESTED.name()).is_empty()).then_some(())
		})
		.await;
		let reads = harness.relay.count("GET /devices");
		until(PATIENCE, || (harness.relay.count("GET /devices") >= reads + 3).then_some(())).await;

		assert_eq!(
			harness.heard(DEVICE_APPROVAL_REQUESTED.name()),
			vec![json!({
				"deviceId": OTHER_DEVICE_ID,
				"name": format!("Device {OTHER_DEVICE_ID}"),
				"kind": "phone",
				"askedAt": asked_at,
				"expiresAt": expires_at,
				"fingerprint": words_of(&phone),
			})]
		);

		harness.relay.lists(json!([listed_device(OTHER_DEVICE_ID, "approved", None, None)]));
		until(PATIENCE, || {
			(!harness.heard(DEVICE_APPROVAL_SETTLED.name()).is_empty()).then_some(())
		})
		.await;
		let reads = harness.relay.count("GET /devices");
		until(PATIENCE, || (harness.relay.count("GET /devices") >= reads + 3).then_some(())).await;

		assert_eq!(
			harness.heard(DEVICE_APPROVAL_SETTLED.name()),
			vec![json!({ "deviceId": OTHER_DEVICE_ID })]
		);
	});
}

#[test]
fn an_announced_request_no_longer_listed_is_settled() {
	run(async {
		let harness = Harness::restored(Relay::approved()).await;
		harness.approved().await;
		harness.relay.lists(json!([listed_device(
			OTHER_DEVICE_ID,
			"pending",
			Some(&in_minutes(20)),
			None
		)]));
		until(PATIENCE, || {
			(!harness.heard(DEVICE_APPROVAL_REQUESTED.name()).is_empty()).then_some(())
		})
		.await;

		harness.relay.lists(json!([]));

		until(PATIENCE, || {
			(!harness.heard(DEVICE_APPROVAL_SETTLED.name()).is_empty()).then_some(())
		})
		.await;
		assert_eq!(
			harness.heard(DEVICE_APPROVAL_SETTLED.name()),
			vec![json!({ "deviceId": OTHER_DEVICE_ID })]
		);
	});
}

#[test]
fn no_device_list_is_read_while_pending() {
	run(async {
		let harness = Harness::restored(Relay::pending_until(&in_minutes(30))).await;
		harness.pending().await;
		until(PATIENCE, || (harness.relay.count("GET /devices/current") >= 2).then_some(())).await;

		assert_eq!(harness.relay.count("GET /devices"), 0);
	});
}

#[test]
fn a_refused_registration_resumes_the_hosted_spaces_once_and_keeps_the_approval_at_none() {
	run(async {
		let relay = Relay::approved();
		relay.refuses_registration(StatusCode::BAD_REQUEST, "DEVICE_PROOF_INVALID");
		let harness = Harness::new(relay, Some(BEARER)).await;
		let state = harness.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.set_hosted(PERSONAL.to_owned(), true).await.expect("the space is flagged");

		restore(harness.handle()).await;
		let not_listening =
			HostingState::Failed { reason: "the local host api is not listening".to_owned() };
		until(PATIENCE, || (harness.hosting() == not_listening).then_some(())).await;
		tokio::time::sleep(TICK * 4).await;

		assert_eq!(
			harness.heard(HOSTING_CHANGED.name()),
			vec![json!({
				"spaceId": PERSONAL,
				"state": { "kind": "failed", "reason": "the local host api is not listening" }
			})]
		);
		assert_eq!(harness.approval(), DeviceApproval::None);
		assert!(harness.heard(DEVICE_APPROVAL_CHANGED.name()).is_empty());
		assert_eq!(harness.relay.count("POST /devices"), 1);
	});
}
