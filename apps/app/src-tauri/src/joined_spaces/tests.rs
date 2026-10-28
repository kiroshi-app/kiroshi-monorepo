use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, RawQuery, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::Router;
use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, AppHandle, Listener, Manager};
use tokio::net::TcpListener;
use tokio::sync::mpsc::{self, UnboundedSender};
use tokio::sync::watch;
use tokio::time::Instant;

use super::commands::{
	joined_space_connect, joined_space_describe, joined_space_remove, joined_spaces_list,
	CHANGED_EVENT, REMOVED_EVENT,
};
use super::contract::{
	JoinedSpace, JoinedSpaceError, JoinedSpaceState, JoinedSpaceWait, JoinedSpaceWaitReason,
};
use super::member_link::{MemberLink, Presence};
use super::members::{self, joined_space_members, MEMBERS_CHANGED_EVENT};
use super::relay::{self, HostCall, RelayGuests, RelayJoinError};
use super::test_host::SealingHost;
use super::wait_reason::{wait_of, Stall};
use super::waiting;
use crate::account::session::{self, AccountSession};
use crate::conversations::contract::Hue;
use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::fingerprint::fingerprint;
use crate::db::connection::temp_dir;
use crate::db::repositories::joined_space_members::JoinedSpaceRole;
use crate::db::{self, DatabaseState};
use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::hosting::bridge::LocalApi;
use crate::hosting::commands::hosting_start;
use crate::hosting::Hosting;
use crate::invitations::{self, Invitations};
use crate::logging::contract::InstallKind;
use crate::removed_on_drop::RemovedOnDrop;
use crate::spaces::commands::space_update;
use crate::spaces::contract::{SpaceDescribed, SpaceError};
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const INSTANCE: &str = "6f1c2b8e-7d3a-4b5e-9c1d-2a3b4c5d6e7f";
const INVITATION: &str = "inv_studio-1";
const OTHER_INSTANCE: &str = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const MEMBER_BEARER: &str = "bearer-of-the-member";
const OWNER_BEARER: &str = "bearer-of-the-owner";
const LOCAL_TOKEN: &str = "host-token-of-the-loopback";
const SPACE: &str = "personal";
const MEMBER_RELAY_ID: &str = "3b0c7a52-1d4e-4f8a-9b6c-0e2f4a6c8d10";
const PATIENCE: Duration = Duration::from_secs(60);
const POLL_EVERY: Duration = Duration::from_millis(50);
const HOST_ANSWER_BOUND: Duration = Duration::from_secs(2);
const RESEND_EVERY: Duration = Duration::from_millis(200);
const HOST_ABSENT: u16 = 4002;
const MEMBERSHIP_ENDED: u16 = 4003;
const SPACE_DELETED: u16 = 4007;
const LONG_PAUSE: Duration = Duration::from_secs(3600);
const ENDING_PAUSE: Duration = Duration::from_secs(90);

#[derive(Clone)]
enum HostSide {
	Absent,
	Closing(u16),
	Silent,
	Leaving(Duration),
	Answering(String),
	GreetingAfterRead { frames: Vec<String>, reads: usize },
	DroppingAfterItsAnswer { host: Arc<SealingHost>, command: &'static str, body: Value },
}

struct Room {
	accept: (StatusCode, Value),
	accepted: Vec<String>,
	host: HostSide,
	joins: Vec<Value>,
	connections: usize,
	socket_devices: Vec<String>,
	other_memberships: Vec<Value>,
	roster_reads: usize,
	me_reads: usize,
	is_roster_open: Arc<watch::Sender<bool>>,
	rosters_in_flight: usize,
	rosters_in_flight_at_most: usize,
	member_refusal: Option<(StatusCode, Value)>,
	next_upgrade_refusal: Option<(StatusCode, Value)>,
	retry_after: Option<&'static str>,
	upgrades: Vec<Instant>,
	instance_reads: usize,
	is_instance_list_stalled: bool,
	is_instance_list_open: Arc<watch::Sender<bool>>,
	leave: (StatusCode, Value),
	is_sign_out_stalled: bool,
	sign_out_calls: Vec<(&'static str, String)>,
}

#[derive(Clone)]
struct Relay(Arc<Mutex<Room>>);

impl Relay {
	fn new() -> Self {
		Self(Arc::new(Mutex::new(Room {
			accept: (StatusCode::OK, json!({ "instanceId": INSTANCE, "name": "Studio" })),
			accepted: Vec::new(),
			host: HostSide::Absent,
			joins: Vec::new(),
			connections: 0,
			socket_devices: Vec::new(),
			other_memberships: Vec::new(),
			roster_reads: 0,
			me_reads: 0,
			is_roster_open: Arc::new(watch::channel(true).0),
			rosters_in_flight: 0,
			rosters_in_flight_at_most: 0,
			member_refusal: None,
			next_upgrade_refusal: None,
			retry_after: None,
			upgrades: Vec::new(),
			instance_reads: 0,
			is_instance_list_stalled: false,
			is_instance_list_open: Arc::new(watch::channel(true).0),
			leave: (StatusCode::NO_CONTENT, Value::Null),
			is_sign_out_stalled: false,
			sign_out_calls: Vec::new(),
		})))
	}

	fn room(&self) -> MutexGuard<'_, Room> {
		self.0.lock().expect("the relay")
	}

	fn hosting(&self, host: HostSide) {
		self.room().host = host;
	}

	fn accepting(&self, status: StatusCode, body: Value) {
		self.room().accept = (status, body);
	}

	fn greets_after_the_next_members_read(&self, frames: Vec<String>) {
		let mut room = self.room();
		room.host = HostSide::GreetingAfterRead { frames, reads: room.roster_reads };
	}

	async fn greeting(&self) -> Vec<String> {
		let (frames, reads) = {
			let mut room = self.room();
			let HostSide::GreetingAfterRead { frames, reads } = &room.host else {
				return Vec::new();
			};
			let greeting = (frames.clone(), *reads);
			room.host = HostSide::Silent;
			greeting
		};
		until("a members read of the session", || async {
			(self.room().roster_reads > reads).then_some(())
		})
		.await;
		frames
	}

	fn joins(&self) -> Vec<Value> {
		self.room().joins.clone()
	}

	fn connections(&self) -> usize {
		self.room().connections
	}

	async fn served(&self) -> String {
		let router = Router::new()
			.route("/me", get(me))
			.route("/devices/challenge", post(device_challenged))
			.route("/devices", post(device_registered))
			.route("/devices/{id}", delete(device_deleted))
			.route("/api/auth/sign-out", post(session_closed))
			.route("/instances", get(instances_listed))
			.route("/instances/{id}/roster", get(roster_read))
			.route("/instances/{id}/membership", delete(membership_left))
			.route("/invitations", get(invitations_listed))
			.route("/invitations/{id}/accept", post(invitation_accepted))
			.route("/instances/{id}/relay/member", get(member_socket))
			.with_state(self.clone());
		served(router).await
	}
}

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tokio::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

async fn a_closed_port() -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
	let address = listener.local_addr().expect("the port is named");
	drop(listener);
	format!("http://{address}")
}

fn is_member(headers: &HeaderMap) -> bool {
	headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok())
		== Some(&format!("Bearer {MEMBER_BEARER}"))
}

fn answered_json(status: StatusCode, body: Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

fn refusal(status: StatusCode, code: &str) -> (StatusCode, Value) {
	(status, json!({ "error": { "code": code, "message": code, "status": status.as_u16() } }))
}

async fn me(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	relay.room().me_reads += 1;
	if !is_member(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let me = json!({ "id": "member", "email": "member@example.com", "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" });
	answered_json(StatusCode::OK, me)
}

async fn device_challenged() -> Response {
	let nonce = BASE64_URL_SAFE_NO_PAD.encode([7; 32]);
	answered_json(
		StatusCode::CREATED,
		json!({ "nonce": nonce, "expiresAt": "2099-10-01T00:00:00.000Z" }),
	)
}

async fn device_registered() -> Response {
	answered_json(
		StatusCode::CREATED,
		json!({ "id": MEMBER_RELAY_ID, "createdAt": "2026-10-01T00:00:00.000Z", "transferred": false, "status": "approved" }),
	)
}

async fn device_deleted(Served(relay): Served<Relay>, headers: HeaderMap) -> StatusCode {
	sign_out_called(&relay, "device deletion", &headers).await
}

async fn session_closed(Served(relay): Served<Relay>, headers: HeaderMap) -> StatusCode {
	sign_out_called(&relay, "session close", &headers).await
}

async fn sign_out_called(relay: &Relay, call: &'static str, headers: &HeaderMap) -> StatusCode {
	let bearer = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok());
	let is_stalled = {
		let mut room = relay.room();
		room.sign_out_calls.push((call, bearer.unwrap_or_default().to_owned()));
		room.is_sign_out_stalled
	};
	if is_stalled {
		std::future::pending::<()>().await;
	}
	StatusCode::NO_CONTENT
}

async fn instances_listed(Served(relay): Served<Relay>) -> Response {
	let (is_stalled, mut is_open) = {
		let mut room = relay.room();
		room.instance_reads += 1;
		(room.is_instance_list_stalled, room.is_instance_list_open.subscribe())
	};
	if is_stalled {
		std::future::pending::<()>().await;
	}
	is_open.wait_for(|is_open| *is_open).await.map(drop).expect("the relay holds the gate");
	let room = relay.room();
	let mut listed = room.other_memberships.clone();
	if !room.accepted.is_empty() {
		listed.insert(0, json!({ "id": INSTANCE, "name": "Studio" }));
	}
	answered_json(StatusCode::OK, Value::Array(listed))
}

async fn membership_left(Served(relay): Served<Relay>) -> Response {
	let (status, body) = relay.room().leave.clone();
	answered_json(status, body)
}

async fn roster_read(Served(relay): Served<Relay>) -> Response {
	let mut is_open = {
		let mut room = relay.room();
		room.roster_reads += 1;
		room.rosters_in_flight += 1;
		room.rosters_in_flight_at_most = room.rosters_in_flight_at_most.max(room.rosters_in_flight);
		room.is_roster_open.subscribe()
	};
	is_open.wait_for(|is_open| *is_open).await.map(drop).expect("the relay holds the gate");
	relay.room().rosters_in_flight -= 1;
	roster_listed().await
}

async fn roster_listed() -> Response {
	let roster = json!([
		{ "userId": "owner", "name": "Ann", "role": "owner" },
		{ "userId": "member", "name": "Bob", "role": "member" },
	]);
	answered_json(StatusCode::OK, roster)
}

async fn invitations_listed() -> Response {
	let invitation = json!({
		"id": INVITATION,
		"instanceId": INSTANCE,
		"instanceName": "Studio",
		"inviterEmail": "owner@example.com",
		"invitedAt": "2026-10-01T00:00:00.000Z",
		"expiresAt": "2026-10-08T00:00:00.000Z",
	});
	answered_json(StatusCode::OK, json!([invitation]))
}

async fn invitation_accepted(
	Served(relay): Served<Relay>,
	Path(id): Path<String>,
	headers: HeaderMap,
) -> Response {
	if !is_member(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let mut room = relay.room();
	let (status, body) = room.accept.clone();
	if status.is_success() || status == StatusCode::CONFLICT {
		room.accepted.push(id);
	}
	answered_json(status, body)
}

async fn member_socket(
	Served(relay): Served<Relay>,
	RawQuery(query): RawQuery,
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	if !is_member(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let Some(device) = device_of(query.as_deref()) else {
		return StatusCode::BAD_REQUEST.into_response();
	};
	let (refusal, retry_after) = {
		let mut room = relay.room();
		room.upgrades.push(Instant::now());
		let refusal = room.next_upgrade_refusal.take().or_else(|| room.member_refusal.clone());
		(refusal, room.retry_after)
	};
	if let Some(retry_after) = retry_after {
		return (StatusCode::TOO_MANY_REQUESTS, [(header::RETRY_AFTER, retry_after)])
			.into_response();
	}
	if let Some((status, body)) = refusal {
		return answered_json(status, body);
	}
	{
		let mut room = relay.room();
		room.connections += 1;
		room.socket_devices.push(device);
	}
	upgrade.on_upgrade(move |socket| membered(relay, socket))
}

fn is_missed_rekey(frame: &Value) -> bool {
	frame["key_id"] == 0 && frame["instance"] == INSTANCE && frame.get("to").is_none()
}

async fn membered(relay: Relay, mut socket: WebSocket) {
	let host = relay.room().host.clone();
	if let HostSide::Leaving(after) = host {
		tokio::time::sleep(after).await;
		let close = CloseFrame { code: HOST_ABSENT, reason: "".into() };
		return socket.send(Message::Close(Some(close))).await.expect("the close leaves");
	}
	while let Some(Ok(frame)) = socket.recv().await {
		let Message::Text(text) = frame else {
			continue;
		};
		let frame: Value = serde_json::from_str(text.as_str()).expect("a json member frame");
		let host = relay.room().host.clone();
		if let HostSide::DroppingAfterItsAnswer { host, command, body } = host {
			let call = host.opened(text.as_str()).plaintext;
			if call["command"] != command {
				continue;
			}
			let answer = json!({ "id": call["id"], "status": 200, "body": body }).to_string();
			let sealed = Message::Text(host.sealed(&answer).into());
			return socket.send(sealed).await.expect("the answer leaves");
		}
		if !is_missed_rekey(&frame) {
			for greeting in relay.greeting().await {
				if socket.send(Message::Text(greeting.into())).await.is_err() {
					return;
				}
			}
			continue;
		}
		let host = {
			let mut room = relay.room();
			room.joins.push(frame);
			room.host.clone()
		};
		let answer = match host {
			HostSide::Absent => {
				let close = CloseFrame { code: HOST_ABSENT, reason: "".into() };
				Message::Close(Some(close))
			}
			HostSide::Closing(code) => Message::Close(Some(CloseFrame { code, reason: "".into() })),
			HostSide::Silent
			| HostSide::Leaving(_)
			| HostSide::GreetingAfterRead { .. }
			| HostSide::DroppingAfterItsAnswer { .. } => continue,
			HostSide::Answering(answer) => Message::Text(answer.into()),
		};
		if socket.send(answer).await.is_err() {
			return;
		}
	}
}

struct Member {
	app: AppOfItsOwn,
	relay: Relay,
	root: PathBuf,
	_temporary: Vec<RemovedOnDrop>,
}

impl Member {
	async fn new(name: &str) -> Self {
		Self::answered_within(name, PATIENCE).await
	}

	async fn facing_a_silent_host(name: &str) -> Self {
		Self::answered_within(name, HOST_ANSWER_BOUND).await
	}

	async fn answered_within(name: &str, answer_bound: Duration) -> Self {
		let relay = Relay::new();
		let cloud = relay.served().await;
		Self::over(name, relay, &cloud, answer_bound)
	}

	fn over(name: &str, relay: Relay, cloud: &str, answer_bound: Duration) -> Self {
		let (app, root, temporary) = signed_in(name, MEMBER_BEARER, cloud, answer_bound);
		Self { app, relay, root, _temporary: temporary }
	}

	fn host(&self) -> SealingHost {
		SealingHost::new(self.app.handle(), INSTANCE)
	}

	async fn accepted(&self) -> Result<JoinedSpace, JoinedSpaceError> {
		invitations::accept(self.app.handle(), INVITATION.to_owned()).await
	}

	async fn listed(&self) -> Vec<JoinedSpace> {
		joined_spaces_list(self.app.handle().clone()).await.expect("the list")
	}

	fn held_key_id(&self) -> Option<u32> {
		let keys = self.app.state::<SpaceKeys>();
		keys.held(&format!("joined-{INSTANCE}")).expect("the key reads").map(|held| held.key_id)
	}

	async fn held_roster(&self) -> Option<String> {
		let state = self.app.state::<DatabaseState>();
		let relay = state.as_ref().expect("the database").joined_space_relay();
		relay.roster(INSTANCE.to_owned()).await.expect("the roster reads").map(|held| held.roster)
	}

	fn key_file(&self, instance_id: &str) -> PathBuf {
		let profile = self.app.path().app_data_dir().expect("the data folder resolves");
		std::fs::create_dir_all(&profile).expect("the profile folder exists");
		profile.join(format!("space-key-joined-{instance_id}"))
	}

	fn signed_out_of_the_store(&self) {
		store::delete(&self.root, &EnvScope::Account, ACCOUNT_BEARER).expect("the bearer leaves");
	}

	fn signed_in_again(&self) {
		store::set(&self.root, &EnvScope::Account, ACCOUNT_BEARER, MEMBER_BEARER)
			.expect("the bearer is kept");
	}

	fn is_waiting(&self, id: &str) -> bool {
		self.app.state::<RelayGuests>().is_waiting(id)
	}

	fn last_wait(&self) -> Option<JoinedSpaceWaitReason> {
		self.app.state::<RelayGuests>().last_wait(INSTANCE).map(|wait| wait.reason)
	}

	fn device(&self) -> DeviceKeys {
		let state = self.app.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the device keys").secret())
	}
}

fn signed_in(
	name: &str,
	bearer: &str,
	cloud: &str,
	answer_bound: Duration,
) -> (AppOfItsOwn, PathBuf, Vec<RemovedOnDrop>) {
	let database = temp_dir();
	let root = temp_dir();
	store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer).expect("the bearer is kept");
	let app = an_app_of_its_own(name, mock_builder());
	app.manage::<DatabaseState>(Ok(db::open(&database)));
	app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
	let profile = app.path().app_data_dir().expect("the data folder resolves");
	let identifier = app.config().identifier.clone();
	app.manage(SpaceKeys::new(InstallKind::Dev, identifier, Some(profile)));
	app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), cloud));
	let guests = RelayGuests::new(cloud).answering_within(answer_bound);
	app.manage(guests.resending_every(RESEND_EVERY));
	app.manage(Invitations::new(cloud));
	let root_path = root.to_path_buf();
	(app, root_path, vec![database, root])
}

async fn until<T, F: std::future::Future<Output = Option<T>>>(
	awaited: &str,
	found: impl Fn() -> F,
) -> T {
	within(PATIENCE, awaited, found).await
}

async fn within<T, F: std::future::Future<Output = Option<T>>>(
	patience: Duration,
	awaited: &str,
	found: impl Fn() -> F,
) -> T {
	tokio::time::timeout(patience, async {
		loop {
			if let Some(found) = found().await {
				return found;
			}
			tokio::time::sleep(POLL_EVERY).await;
		}
	})
	.await
	.unwrap_or_else(|_| panic!("{awaited} did not come within {patience:?}"))
}

fn changes_heard(app: &App<MockRuntime>) -> Arc<Mutex<Vec<Value>>> {
	heard_on(app, CHANGED_EVENT)
}

fn heard_on(app: &App<MockRuntime>, event: &'static str) -> Arc<Mutex<Vec<Value>>> {
	let heard = Arc::new(Mutex::new(Vec::new()));
	let hearing = Arc::clone(&heard);
	app.listen_any(event, move |event| {
		let payload = serde_json::from_str(event.payload()).expect("a json payload");
		hearing.lock().expect("the events").push(payload);
	});
	heard
}

fn words_of(keys: &DeviceKeys) -> Vec<String> {
	fingerprint(&keys.signing_public()).map(str::to_owned).to_vec()
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

#[test]
fn an_accepted_invitation_joins_holds_the_key_feeds_the_members_and_answers_online() {
	run(async {
		let member = Member::new("join-accepted").await;
		let host = member.host();
		member.relay.hosting(HostSide::Answering(host.admitted()));
		let earlier = wait_of(Stall::Unreachable("the relay answered 503".to_owned()));
		member.app.state::<RelayGuests>().waited(INSTANCE, earlier);

		let joined = member.accepted().await.expect("the join");
		let members = until("the roster of two devices", || async {
			let members = joined_space_members(member.app.state(), joined.id.clone()).await;
			let members = members.expect("the members read");
			(members.len() == 2).then_some(members)
		})
		.await;

		assert_eq!(joined.state, JoinedSpaceState::Online);
		assert_eq!(member.last_wait(), None);
		assert_eq!(joined.name, "Studio");
		assert_eq!(member.relay.room().accepted, vec![INVITATION.to_owned()]);
		assert_eq!(member.relay.joins().len(), 1);
		assert_eq!(member.held_key_id(), Some(1));
		let named = JoinedSpace { hosted_by: Some("Ann".to_owned()), ..joined };
		assert_eq!(member.listed().await, vec![named]);
		assert_eq!(
			members.iter().map(|row| (row.role, row.fingerprint.clone())).collect::<Vec<_>>(),
			vec![
				(JoinedSpaceRole::Host, words_of(host.host_keys())),
				(JoinedSpaceRole::Guest, words_of(&member.device())),
			]
		);
	});
}

async fn online_with_two_members(member: &Member, host: &SealingHost) -> JoinedSpace {
	member.relay.hosting(HostSide::Answering(host.admitted()));
	let joined = member.accepted().await.expect("the join");
	until("the roster of two devices", || async {
		let members = joined_space_members(member.app.state(), joined.id.clone()).await;
		(members.expect("the members read").len() == 2).then_some(())
	})
	.await;
	let state = member.app.state::<DatabaseState>();
	let spaces = state.as_ref().expect("the database").joined_spaces();
	spaces.learned(joined.id.clone(), SPACE.to_owned()).await.expect("the space id is learned");
	joined
}

async fn members_listed_within(heard: &Arc<Mutex<Vec<Value>>>, id: &str, count: usize) -> Value {
	until("the members changed event", || async {
		let heard = heard.lock().expect("the events");
		heard
			.iter()
			.find(|payload| {
				payload["id"] == id && payload["members"].as_array().map(Vec::len) == Some(count)
			})
			.cloned()
	})
	.await
}

fn is_listed(changed: &Value, device: &DeviceKeys) -> bool {
	let words = json!(words_of(device));
	let members = changed["members"].as_array().expect("a member list");
	members.iter().any(|member| member["fingerprint"] == words)
}

#[test]
fn a_session_takes_the_roster_sent_before_the_hello_keeps_its_key_and_lists_the_newcomer() {
	run(async {
		let member = Member::new("roster-on-hello").await;
		let host = member.host();
		let joined = online_with_two_members(&member, &host).await;
		let roster_before = member.held_roster().await;
		let heard = heard_on(&member.app, MEMBERS_CHANGED_EVENT);
		let newcomer = DeviceKeys::generate().expect("randomness");
		let greeting = vec![host.roster_admitting(&newcomer, 2), host.hello()];
		member.relay.greets_after_the_next_members_read(greeting);

		let connection = joined_space_connect(member.app.handle().clone(), joined.id.clone()).await;
		let changed = members_listed_within(&heard, &joined.id, 3).await;

		assert_eq!(connection.map(|connection| connection.id), Ok(joined.id.clone()));
		assert!(is_listed(&changed, &newcomer), "{changed}");
		assert_eq!(member.held_key_id(), Some(1));
		let state = member.app.state::<DatabaseState>();
		let relay = state.as_ref().expect("the database").joined_space_relay();
		let roster = relay.roster(INSTANCE.to_owned()).await.expect("the roster reads");
		let roster = roster.expect("a roster is held");
		assert_eq!((roster.key_id, roster.version), (1, 2));
		assert_ne!(Some(roster.roster), roster_before);
	});
}

fn versioned(sealed: &str, v: Option<u64>) -> String {
	let mut envelope: Value = serde_json::from_str(sealed).expect("a json frame");
	match v {
		Some(v) => envelope["v"] = json!(v),
		None => {
			envelope.as_object_mut().expect("an envelope").remove("v");
		}
	}
	envelope.to_string()
}

#[test]
fn a_host_frame_whose_v_is_absent_or_one_is_dropped_without_taking_its_roster() {
	run(async {
		let member = Member::new("v1-host-frames").await;
		let host = member.host();
		let joined = online_with_two_members(&member, &host).await;
		let heard = heard_on(&member.app, MEMBERS_CHANGED_EVENT);
		let unversioned = DeviceKeys::generate().expect("randomness");
		let first = DeviceKeys::generate().expect("randomness");
		let newcomer = DeviceKeys::generate().expect("randomness");
		let greeting = vec![
			versioned(&host.roster_admitting(&unversioned, 2), None),
			versioned(&host.roster_admitting(&first, 2), Some(1)),
			host.roster_admitting(&newcomer, 2),
			host.hello(),
		];
		member.relay.greets_after_the_next_members_read(greeting);

		let connection = joined_space_connect(member.app.handle().clone(), joined.id.clone()).await;
		let changed = members_listed_within(&heard, &joined.id, 3).await;

		assert_eq!(connection.map(|connection| connection.id), Ok(joined.id.clone()));
		assert!(is_listed(&changed, &newcomer), "{changed}");
		assert!(!is_listed(&changed, &unversioned), "{changed}");
		assert!(!is_listed(&changed, &first), "{changed}");
	});
}

#[test]
fn a_session_taking_a_rekey_under_a_greater_key_id_lists_its_roster() {
	run(async {
		let member = Member::new("rekey-members").await;
		let host = member.host();
		let joined = online_with_two_members(&member, &host).await;
		let heard = heard_on(&member.app, MEMBERS_CHANGED_EVENT);
		let newcomer = DeviceKeys::generate().expect("randomness");
		member
			.relay
			.greets_after_the_next_members_read(vec![host.rekey_admitting(&newcomer, 2, 2)]);

		let connection = joined_space_connect(member.app.handle().clone(), joined.id.clone()).await;
		let changed = members_listed_within(&heard, &joined.id, 3).await;

		assert_eq!(connection.map(|connection| connection.id), Ok(joined.id.clone()));
		assert!(is_listed(&changed, &newcomer), "{changed}");
		assert_eq!(member.held_key_id(), Some(2));
	});
}

#[test]
fn every_refusal_of_the_relay_accept_answers_its_kind_and_stores_no_joined_space() {
	run(async {
		let cases = [
			(refusal(StatusCode::GONE, "INVITATION_EXPIRED"), JoinedSpaceError::InvitationExpired),
			(
				refusal(StatusCode::GONE, "INVITATION_WITHDRAWN"),
				JoinedSpaceError::InvitationWithdrawn,
			),
			(refusal(StatusCode::GONE, "INVITATION_USED"), JoinedSpaceError::InvitationUsed),
			(
				refusal(StatusCode::FORBIDDEN, "INVITATION_EMAIL_MISMATCH"),
				JoinedSpaceError::InvitationOtherEmail,
			),
			(
				refusal(StatusCode::NOT_FOUND, "NOT_FOUND"),
				JoinedSpaceError::NoInvitation { inviter_email: None },
			),
		];
		let member = Member::new("join-refused").await;

		for ((status, body), expected) in cases {
			member.relay.accepting(status, body);
			let refused = member.accepted().await.map(|joined| joined.id);
			assert_eq!(refused, Err(expected), "{status}");
		}
		member.relay.accepting(StatusCode::INTERNAL_SERVER_ERROR, json!({}));
		let failing = member.accepted().await.map(|joined| joined.id);
		let unreached =
			Member::over("join-unreached", Relay::new(), &a_closed_port().await, PATIENCE);
		let unreachable = unreached.accepted().await.map(|joined| joined.id);

		assert!(matches!(failing, Err(JoinedSpaceError::CouldNotAccept { .. })), "{failing:?}");
		assert!(
			matches!(unreachable, Err(JoinedSpaceError::CouldNotAccept { .. })),
			"{unreachable:?}"
		);
		assert_eq!(member.relay.joins(), Vec::<Value>::new());
		assert_eq!(member.listed().await, Vec::new());
		assert_eq!(unreached.listed().await, Vec::new());
	});
}

#[test]
fn an_accept_answered_already_joined_continues_the_join_under_the_listed_instance() {
	run(async {
		let member = Member::new("join-already").await;
		member.relay.hosting(HostSide::Answering(member.host().admitted()));
		member
			.relay
			.accepting(StatusCode::CONFLICT, refusal(StatusCode::CONFLICT, "ALREADY_JOINED").1);
		invitations::read(member.app.handle()).await.expect("the invitations are listed");

		let joined = member.accepted().await.expect("the join");

		assert_eq!(joined.state, JoinedSpaceState::Online);
		assert_eq!(joined.name, "Studio");
		assert_eq!(member.relay.joins().len(), 1);
		assert_eq!(member.held_key_id(), Some(1));
	});
}

#[test]
fn a_joined_roster_omitting_this_device_answers_not_in_roster_and_stores_no_key() {
	run(async {
		let member = Member::new("join-not-rostered").await;
		member.relay.hosting(HostSide::Answering(member.host().admitted_without_the_member()));

		let refused = member.accepted().await.map(|joined| joined.id);

		assert_eq!(refused, Err(JoinedSpaceError::NotInRoster));
		assert_eq!(member.held_key_id(), None);
		assert_eq!(member.held_roster().await, None);
		assert_eq!(member.listed().await, Vec::new());
	});
}

#[test]
fn a_joined_host_other_than_the_held_one_answers_bad_signature_and_keeps_the_held_roster() {
	run(async {
		let member = Member::new("join-other-host").await;
		SealingHost::planted(member.app.handle(), INSTANCE).await;
		let held = member.held_roster().await;
		member.relay.hosting(HostSide::Answering(member.host().admitted()));

		let refused = member.accepted().await.map(|joined| joined.id);

		assert_eq!(refused, Err(JoinedSpaceError::BadSignature));
		assert!(held.is_some());
		assert_eq!(member.held_roster().await, held);
	});
}

#[test]
fn an_absent_a_silent_or_a_forged_host_leaves_the_joined_space_waiting_on_its_reason_and_pins_nothing(
) {
	run(async {
		let reasons = [
			JoinedSpaceWaitReason::SocketClosed,
			JoinedSpaceWaitReason::HostSilent,
			JoinedSpaceWaitReason::RekeyNotVerified,
		];
		for (case, reason) in reasons.into_iter().enumerate() {
			let member = Member::facing_a_silent_host("join-waiting").await;
			let stranger = DeviceKeys::generate().expect("randomness");
			let forged = HostSide::Answering(member.host().admitted_signed_by(&stranger));
			member.relay.hosting([HostSide::Absent, HostSide::Silent, forged][case].clone());

			let joined = member.accepted().await.expect("the join waits");
			let connection = joined_space_connect(member.app.handle().clone(), joined.id.clone())
				.await
				.map(|found| found.id);
			let JoinedSpaceWait { reason: waited_on, detail } =
				joined.wait.clone().expect("a wait");

			assert_eq!(joined.state, JoinedSpaceState::WaitingForHost, "case {case}");
			assert_eq!(waited_on, reason, "case {case}");
			assert_eq!(member.listed().await, vec![joined.clone()], "case {case}");
			assert_eq!(
				connection,
				Err(JoinedSpaceError::WaitingForHost {
					id: joined.id,
					instance_id: INSTANCE.to_owned(),
					reason,
					detail
				}),
				"case {case}"
			);
			assert_eq!(member.held_key_id(), None, "case {case}");
			assert_eq!(member.held_roster().await, None, "case {case}");
		}
	});
}

#[test]
fn a_waiting_socket_held_open_asks_again_for_its_rekey_and_comes_online_once_admitted() {
	run(async {
		let member = Member::facing_a_silent_host("join-flip").await;
		let heard = changes_heard(&member.app);
		member.relay.hosting(HostSide::Silent);
		let joined = member.accepted().await.expect("the join waits");
		let answer = member.host().admitted();

		relay::reconciled(member.app.handle()).await;
		until("the missed rekey frame resent on the open socket", || async {
			(member.relay.joins().len() >= 3).then_some(())
		})
		.await;
		let waited_before = member.last_wait();
		member.relay.hosting(HostSide::Answering(answer));
		until("the key handed over", || async { member.held_key_id() }).await;
		until("the waiting socket to stop", || async {
			(!member.is_waiting(&joined.id)).then_some(())
		})
		.await;
		until("the changed events of the accept and of the join", || async {
			let heard = heard.lock().expect("the events");
			let changes = heard.iter().filter(|payload| payload["id"] == joined.id.as_str());
			(changes.count() >= 2).then_some(())
		})
		.await;

		let joins = member.relay.joins();
		assert!(joins.len() >= 4, "{joins:?}");
		assert!(joins.iter().all(is_missed_rekey));
		assert_eq!(member.relay.connections(), 2, "the accept and one waiting connection");
		assert_eq!(member.listed().await[0].state, JoinedSpaceState::Online);
		assert_eq!(waited_before, Some(JoinedSpaceWaitReason::HostSilent));
		assert_eq!(member.last_wait(), None);
	});
}

#[test]
fn an_unreadable_key_still_starts_every_waiting_join_and_its_space_comes_online_once_answered() {
	run(async {
		let member = Member::facing_a_silent_host("join-unreadable-key").await;
		member.relay.hosting(HostSide::Silent);
		let unreadable = member.accepted().await.expect("the join waits");
		std::fs::write(member.key_file(INSTANCE), b"bad").expect("the key file is spoiled");
		let harbour = json!({ "id": OTHER_INSTANCE, "name": "Harbour" });
		member.relay.room().other_memberships.push(harbour);

		relay::reconciled(member.app.handle()).await;
		let listed = member.listed().await;
		let other = listed.iter().find(|joined| joined.name == "Harbour").expect("the other space");
		let is_waiting = [member.is_waiting(&unreadable.id), member.is_waiting(&other.id)];
		member.relay.hosting(HostSide::Answering(member.host().admitted()));
		until("the space listed online", || async {
			let listed = member.listed().await;
			let found = listed.into_iter().find(|joined| joined.id == unreadable.id);
			found.filter(|joined| joined.state == JoinedSpaceState::Online)
		})
		.await;

		assert_eq!(is_waiting, [true, true]);
		assert_eq!(member.held_key_id(), Some(1));
	});
}

#[test]
fn a_waiting_join_the_relay_answers_403_on_settles_waiting_as_not_a_member() {
	run(async {
		let member = Member::facing_a_silent_host("join-forbidden").await;
		member.relay.hosting(HostSide::Silent);
		let joined = member.accepted().await.expect("the join waits");
		let forbidden = refusal(StatusCode::FORBIDDEN, "NOT_A_MEMBER");
		member.relay.room().member_refusal = Some(forbidden);

		relay::reconciled(member.app.handle()).await;
		let listed = until("the wait read as not a member", || async {
			let listed = member.listed().await.into_iter().find(|found| found.id == joined.id);
			listed.filter(|found| {
				found.wait.as_ref().map(|wait| wait.reason)
					== Some(JoinedSpaceWaitReason::NotMember)
			})
		})
		.await;

		assert_eq!(listed.state, JoinedSpaceState::WaitingForHost);
		assert!(member.is_waiting(&joined.id));
	});
}

struct UnlistedDuringAPause {
	host: SealingHost,
	joined: JoinedSpace,
	reconciliation: tauri::async_runtime::JoinHandle<()>,
	pause_ends: Instant,
}

async fn unlisted_during_a_pause(member: &Member, pause: Duration) -> UnlistedDuringAPause {
	let host = member.host();
	let joined = online_with_two_members(member, &host).await;
	let connections = member.relay.connections();
	joined_space_connect(member.app.handle().clone(), joined.id.clone())
		.await
		.expect("the joined space connects");
	until("the guest socket to open", || async {
		(member.relay.connections() > connections).then_some(())
	})
	.await;
	{
		let mut room = member.relay.room();
		room.accepted.clear();
		room.next_upgrade_refusal = Some(refusal(StatusCode::GONE, "MEMBER_REMOVED"));
	}
	let guests = member.app.state::<RelayGuests>();
	assert!(guests.is_running(&joined.id));
	let pause_ends = Instant::now() + pause;
	guests.cloud().rate_limited("/instances", pause);
	let app = member.app.handle().clone();
	let reconciliation = tauri::async_runtime::spawn(async move { relay::reconciled(&app).await });
	until("the unlisted guest to stop", || async {
		(!guests.is_running(&joined.id)).then_some(())
	})
	.await;
	UnlistedDuringAPause { host, joined, reconciliation, pause_ends }
}

#[test]
fn a_join_completes_while_a_reconciliation_waits_on_a_429_pause() {
	run(async {
		let member = Member::new("join-during-pause").await;
		let paused = unlisted_during_a_pause(&member, LONG_PAUSE).await;

		let joined = tokio::time::timeout(
			PATIENCE,
			relay::joined(
				member.app.handle(),
				OTHER_INSTANCE.to_owned(),
				Some("Harbour".into()),
				None,
				Default::default(),
			),
		)
		.await;
		paused.reconciliation.abort();

		assert_eq!(
			joined.expect("the join is not held by the pause").expect("joined").name,
			"Harbour"
		);
	});
}

#[test]
fn a_leave_completes_while_a_reconciliation_waits_on_a_429_pause() {
	run(async {
		let member = Member::new("leave-during-pause").await;
		let paused = unlisted_during_a_pause(&member, LONG_PAUSE).await;

		let left =
			tokio::time::timeout(PATIENCE, relay::left(member.app.handle(), &paused.joined.id))
				.await;
		paused.reconciliation.abort();

		assert_eq!(left.expect("the leave is not held by the pause"), Ok(()));
		assert_eq!(member.listed().await, Vec::new());
	});
}

#[test]
fn a_sign_out_completes_while_a_reconciliation_waits_on_a_429_pause() {
	run(async {
		let member = Member::new("sign-out-during-pause").await;
		let paused = unlisted_during_a_pause(&member, LONG_PAUSE).await;

		let signed_out =
			tokio::time::timeout(PATIENCE, relay::signed_out(member.app.handle())).await;
		paused.reconciliation.abort();

		assert!(signed_out.expect("the sign out is not held by the pause").is_some());
		assert_eq!(member.listed().await, Vec::new());
	});
}

#[test]
fn an_unlisted_space_is_evicted_with_its_departure_reason_once_the_429_pause_ends() {
	run(async {
		let member = Member::new("evicted-after-pause").await;
		let removed = heard_on(&member.app, REMOVED_EVENT);
		let paused = unlisted_during_a_pause(&member, ENDING_PAUSE).await;

		let other = tokio::time::timeout(
			PATIENCE,
			relay::joined(
				member.app.handle(),
				OTHER_INSTANCE.to_owned(),
				Some("Harbour".into()),
				None,
				Default::default(),
			),
		)
		.await;
		paused.reconciliation.await.expect("the reconciliation ends");
		let evicted_at = Instant::now();

		assert!(other.expect("the other join is not held by the pause").is_ok());
		assert!(evicted_at >= paused.pause_ends);
		assert_eq!(
			*removed.lock().expect("the events"),
			vec![json!({ "id": paused.joined.id, "name": "Studio", "reason": "removed" })]
		);
		let listed = member.listed().await;
		assert_eq!(
			listed.iter().map(|joined| joined.name.as_str()).collect::<Vec<_>>(),
			["Harbour"]
		);
	});
}

#[test]
fn an_unlisted_space_joined_again_during_the_429_pause_is_kept() {
	run(async {
		let member = Member::new("joined-again-during-pause").await;
		let removed = heard_on(&member.app, REMOVED_EVENT);
		let paused = unlisted_during_a_pause(&member, ENDING_PAUSE).await;

		let again = tokio::time::timeout(
			PATIENCE,
			relay::joined(member.app.handle(), INSTANCE.to_owned(), None, None, Default::default()),
		)
		.await;
		paused.reconciliation.await.expect("the reconciliation ends");

		assert_eq!(
			again.expect("the join is not held by the pause").expect("joined").id,
			paused.joined.id
		);
		assert!(removed.lock().expect("the events").is_empty());
		assert_eq!(member.listed().await.len(), 1);
		assert!(member.app.state::<RelayGuests>().is_running(&paused.joined.id));
	});
}

#[test]
fn an_unlisted_space_kept_on_a_sign_out_during_the_429_pause_starts_no_guest() {
	run(async {
		let member = Member::new("no-guest-after-sign-out-during-pause").await;
		let paused = unlisted_during_a_pause(&member, ENDING_PAUSE).await;

		member.signed_out_of_the_store();
		paused.reconciliation.await.expect("the reconciliation ends");

		assert!(!member.app.state::<RelayGuests>().is_running(&paused.joined.id));
	});
}

#[test]
fn an_unlisted_space_is_kept_when_the_account_signs_out_during_the_429_pause() {
	run(async {
		let member = Member::new("signed-out-of-the-store-during-pause").await;
		let removed = heard_on(&member.app, REMOVED_EVENT);
		let paused = unlisted_during_a_pause(&member, ENDING_PAUSE).await;

		member.signed_out_of_the_store();
		paused.reconciliation.await.expect("the reconciliation ends");

		assert!(removed.lock().expect("the events").is_empty());
		assert_eq!(member.listed().await.len(), 1);
	});
}

#[test]
fn a_guest_stopped_by_a_reconciliation_runs_again_until_online_once_connected_again() {
	run(async {
		let member = Member::new("guest-runs-again").await;
		let paused = unlisted_during_a_pause(&member, ENDING_PAUSE).await;
		member.signed_out_of_the_store();
		paused.reconciliation.await.expect("the reconciliation ends");
		member.signed_in_again();
		member.relay.greets_after_the_next_members_read(vec![paused.host.hello()]);

		let connection =
			joined_space_connect(member.app.handle().clone(), paused.joined.id.clone()).await;
		let guests = member.app.state::<RelayGuests>();
		until("the restarted link to be online", || async {
			(guests.presence(&paused.joined.id) == Some(Presence::Online)).then_some(())
		})
		.await;

		assert_eq!(connection.map(|connection| connection.id), Ok(paused.joined.id.clone()));
		assert!(guests.is_running(&paused.joined.id));
	});
}

#[test]
fn a_join_a_leave_and_a_sign_out_complete_while_the_instance_list_never_answers() {
	run(async {
		let member = Member::new("gestures-during-a-stalled-list").await;
		let joined = online_with_two_members(&member, &member.host()).await;
		let reads = {
			let mut room = member.relay.room();
			room.is_instance_list_stalled = true;
			room.instance_reads
		};
		let app = member.app.handle().clone();
		let reconciliation =
			tauri::async_runtime::spawn(async move { relay::reconciled(&app).await });
		until("the instance list to be asked", || async {
			(member.relay.room().instance_reads > reads).then_some(())
		})
		.await;

		let app = member.app.handle();
		let other = tokio::time::timeout(
			PATIENCE,
			relay::joined(
				app,
				OTHER_INSTANCE.to_owned(),
				Some("Harbour".into()),
				None,
				Default::default(),
			),
		)
		.await;
		let left = tokio::time::timeout(PATIENCE, relay::left(app, &joined.id)).await;
		let signed_out = tokio::time::timeout(PATIENCE, relay::signed_out(app)).await;
		reconciliation.abort();

		assert!(other.expect("the join is not held by the stalled list").is_ok());
		assert_eq!(left.expect("the leave is not held by the stalled list"), Ok(()));
		assert!(signed_out.expect("the sign out is not held by the stalled list").is_some());
	});
}

#[test]
fn a_join_and_a_leave_answer_while_the_relay_never_answers_a_sign_out() {
	run(async {
		let member = Member::new("sign-out-never-answered").await;
		let joined = online_with_two_members(&member, &member.host()).await;
		session::restore(member.app.handle().clone()).await;
		member.relay.room().is_sign_out_stalled = true;
		let app = member.app.handle().clone();
		let sign_out = tauri::async_runtime::spawn(async move { session::sign_out(&app).await });
		until("the stalled device deletion", || async {
			(!member.relay.room().sign_out_calls.is_empty()).then_some(())
		})
		.await;

		let app = member.app.handle();
		let again = tokio::time::timeout(
			PATIENCE,
			relay::joined(app, INSTANCE.to_owned(), None, None, Default::default()),
		)
		.await;
		let left = tokio::time::timeout(PATIENCE, relay::left(app, &joined.id)).await;
		sign_out.abort();

		let again = again.expect("the join is not held by the stalled sign-out");
		assert!(matches!(again, Err(RelayJoinError::SignedOut)), "{again:?}");
		assert_eq!(
			left.expect("the leave is not held by the stalled sign-out"),
			Err(JoinedSpaceError::UnknownJoinedSpace { id: joined.id.clone() })
		);
		assert_eq!(
			member.relay.room().sign_out_calls,
			vec![("device deletion", format!("Bearer {MEMBER_BEARER}"))]
		);
	});
}

#[test]
fn a_leave_the_relay_fails_keeps_the_space_connectable() {
	run(async {
		let member = Member::new("leave-refused").await;
		let joined = online_with_two_members(&member, &member.host()).await;
		member.relay.room().leave = refusal(StatusCode::SERVICE_UNAVAILABLE, "UNAVAILABLE");

		let left = relay::left(member.app.handle(), &joined.id).await;
		let connection = joined_space_connect(member.app.handle().clone(), joined.id.clone()).await;

		assert!(matches!(left, Err(JoinedSpaceError::RelayRefused { .. })), "{left:?}");
		let guests = member.app.state::<RelayGuests>();
		assert!(!guests.is_removed(&joined.id));
		assert!(!guests.is_unlisted(&joined.id));
		assert_eq!(connection.map(|connection| connection.id), Ok(joined.id.clone()));
		assert_eq!(member.listed().await.len(), 1);
	});
}

const SIMULATED: Duration = Duration::from_secs(600);
const SIMULATED_TICK: Duration = Duration::from_millis(10);
const FIRST_ATTEMPT_YIELDS: usize = 5_000_000;

async fn first_attempt_settled(member: &Member) {
	for _ in 0..FIRST_ATTEMPT_YIELDS {
		if !member.relay.room().upgrades.is_empty() || member.last_wait().is_some() {
			return;
		}
		tokio::task::yield_now().await;
	}
	panic!(
		"the first upgrade never reached the relay and no wait was recorded within {FIRST_ATTEMPT_YIELDS} yields"
	);
}

async fn waited_for_ten_minutes(member: &Member) {
	let (_stop, stopped) = watch::channel(false);
	let id = "joined-space-waiting".to_owned();
	let waiting =
		waiting::waited_for_host(member.app.handle().clone(), id, INSTANCE.to_owned(), stopped);
	let ten_minutes = async {
		first_attempt_settled(member).await;
		for _ in 0..SIMULATED.as_millis() / SIMULATED_TICK.as_millis() {
			tokio::time::advance(SIMULATED_TICK).await;
		}
	};
	tokio::select! {
		() = waiting => panic!("the wait ended before ten minutes"),
		() = ten_minutes => {}
	}
}

#[tokio::test(start_paused = true)]
async fn a_waiting_join_whose_socket_closes_a_second_after_opening_sends_at_most_twenty_upgrades_in_ten_minutes(
) {
	let member = Member::new("join-short-sockets-ten-minutes").await;
	member.relay.hosting(HostSide::Leaving(Duration::from_secs(1)));

	waited_for_ten_minutes(&member).await;

	let room = member.relay.room();
	let upgrades = room.upgrades.len();
	assert!((10..=20).contains(&upgrades), "{upgrades} upgrades");
	assert_eq!(room.me_reads, 1);
}

#[tokio::test(start_paused = true)]
async fn a_waiting_join_answered_429_after_30_seconds_sends_at_most_twenty_one_upgrades_in_ten_minutes(
) {
	let member = Member::new("join-rate-limited-ten-minutes").await;
	member.relay.room().retry_after = Some("30");

	waited_for_ten_minutes(&member).await;

	let room = member.relay.room();
	let gaps: Vec<Duration> = room.upgrades.windows(2).map(|pair| pair[1] - pair[0]).collect();
	assert!((10..=21).contains(&room.upgrades.len()), "{} upgrades", room.upgrades.len());
	assert!(gaps.iter().all(|gap| *gap >= Duration::from_secs(30)), "{gaps:?}");
	drop(room);
	assert_eq!(member.last_wait(), Some(JoinedSpaceWaitReason::RelayUnreachable));
}

#[test]
fn a_waiting_join_refused_on_its_known_relay_device_reads_its_account_again() {
	run(async {
		let member = Member::facing_a_silent_host("join-refused-device").await;
		member.relay.hosting(HostSide::Silent);
		member.accepted().await.expect("the join waits");
		let (upgrades, me_reads) = {
			let mut room = member.relay.room();
			room.member_refusal = Some(refusal(StatusCode::FORBIDDEN, "NOT_A_MEMBER"));
			(room.upgrades.len(), room.me_reads)
		};

		relay::reconciled(member.app.handle()).await;
		until("a second refused upgrade", || async {
			(member.relay.room().upgrades.len() >= upgrades + 2).then_some(())
		})
		.await;

		assert!(member.relay.room().me_reads > me_reads);
	});
}

#[test]
fn a_members_read_asked_during_another_runs_once_right_after_it() {
	run(async {
		let member = Member::new("members-once-at-a-time").await;
		let host = member.host();
		let joined = online_with_two_members(&member, &host).await;
		let state = member.app.state::<DatabaseState>();
		let spaces = state.as_ref().expect("the database").joined_spaces();
		let entry = spaces.find(joined.id.clone()).await.expect("the entry reads");
		let reads = {
			let room = member.relay.room();
			room.is_roster_open.send_replace(false);
			room.roster_reads
		};

		members::read_soon(member.app.handle(), &entry.expect("the joined space is held"));
		until("the members read after the join", || async {
			(member.relay.room().rosters_in_flight > 0).then_some(())
		})
		.await;
		let connections = member.relay.connections();
		joined_space_connect(member.app.handle().clone(), joined.id.clone())
			.await
			.expect("the joined space connects");
		until("the guest socket, opened once its members read was asked", || async {
			(member.relay.connections() > connections).then_some(())
		})
		.await;
		member.relay.room().is_roster_open.send_replace(true);
		until("the members read asked during the first one", || async {
			(member.relay.room().roster_reads == reads + 2).then_some(())
		})
		.await;

		assert_eq!(member.relay.room().rosters_in_flight_at_most, 1);
	});
}

#[test]
fn a_waiting_join_the_relay_answers_410_on_ends_its_wait() {
	run(async {
		let member = Member::facing_a_silent_host("join-gone").await;
		let removed = heard_on(&member.app, REMOVED_EVENT);
		member.relay.hosting(HostSide::Silent);
		let joined = member.accepted().await.expect("the join waits");
		let gone =
			json!({ "error": { "code": "MEMBER_REMOVED", "message": "gone", "status": 410 } });
		member.relay.room().member_refusal = Some((StatusCode::GONE, gone));

		relay::reconciled(member.app.handle()).await;
		let was_waiting = member.is_waiting(&joined.id);
		until("the entry removed", || async { member.listed().await.is_empty().then_some(()) })
			.await;
		until("the removed event", || async {
			(!removed.lock().expect("the events").is_empty()).then_some(())
		})
		.await;

		assert!(was_waiting);
		assert!(!member.is_waiting(&joined.id));
		assert_eq!(member.last_wait(), None);
		assert_eq!(
			*removed.lock().expect("the events"),
			vec![json!({ "id": joined.id, "name": "Studio", "reason": "removed" })]
		);
	});
}

#[test]
fn a_waiting_join_opens_its_member_socket_on_its_relay_device_and_sends_a_v2_missed_rekey_first() {
	run(async {
		let member = Member::facing_a_silent_host("join-handshake").await;
		member.relay.hosting(HostSide::Silent);
		member.accepted().await.expect("the join waits");
		relay::reconciled(member.app.handle()).await;
		until("the waiting socket", || async { (member.relay.connections() >= 2).then_some(()) })
			.await;

		let room = member.relay.room();
		assert!(room.socket_devices.iter().all(|device| device == MEMBER_RELAY_ID));
		assert!(!room.joins.is_empty());
		assert!(room.joins.iter().all(|frame| frame["v"] == 2 && is_missed_rekey(frame)));
	});
}

#[test]
fn a_waiting_socket_the_relay_closes_as_deleted_or_ended_evicts_the_space_and_retries_no_more() {
	for (code, reason) in [(SPACE_DELETED, "deleted"), (MEMBERSHIP_ENDED, "removed")] {
		run(async {
			let member = Member::facing_a_silent_host(&format!("join-closed-{code}")).await;
			let removed = heard_on(&member.app, REMOVED_EVENT);
			member.relay.hosting(HostSide::Silent);
			let joined = member.accepted().await.expect("the join waits");
			relay::reconciled(member.app.handle()).await;
			let was_waiting = member.is_waiting(&joined.id);

			member.relay.hosting(HostSide::Closing(code));
			until("the entry removed", || async { member.listed().await.is_empty().then_some(()) })
				.await;
			let connections = member.relay.connections();
			tokio::time::sleep(Duration::from_millis(1500)).await;

			assert!(was_waiting, "{code}");
			assert!(!member.is_waiting(&joined.id), "{code}");
			assert_eq!(member.relay.connections(), connections, "{code}");
			assert_eq!(
				*removed.lock().expect("the events"),
				vec![json!({ "id": joined.id, "name": "Studio", "reason": reason })],
				"{code}"
			);
		});
	}
}

#[test]
fn a_waiting_join_that_ended_signed_out_starts_again_on_the_next_reconciliation() {
	run(async {
		let member = Member::new("join-ended").await;
		let joined = member.accepted().await.expect("the join waits");
		relay::reconciled(member.app.handle()).await;
		let was_waiting = member.is_waiting(&joined.id);

		member.signed_out_of_the_store();
		until("the waiting join to end", || async {
			(!member.is_waiting(&joined.id)).then_some(())
		})
		.await;
		member.signed_in_again();
		relay::reconciled(member.app.handle()).await;

		assert!(was_waiting);
		assert!(member.is_waiting(&joined.id));
	});
}

#[test]
fn a_waiting_socket_stops_on_removal_and_on_sign_out() {
	run(async {
		let member = Member::facing_a_silent_host("join-stopped").await;
		member.relay.hosting(HostSide::Silent);
		let removed = member.accepted().await.expect("the join waits");
		relay::reconciled(member.app.handle()).await;
		let was_waiting = member.is_waiting(&removed.id);

		joined_space_remove(member.app.handle().clone(), removed.id.clone())
			.await
			.expect("removed");
		let after_removal = member.is_waiting(&removed.id);
		let kept = member.accepted().await.expect("the join waits again");
		relay::reconciled(member.app.handle()).await;
		let was_waiting_again = member.is_waiting(&kept.id);
		let waited_before = member.last_wait();
		drop(relay::signed_out(member.app.handle()).await);

		assert!(was_waiting && !after_removal);
		assert!(was_waiting_again);
		assert!(!member.is_waiting(&kept.id));
		assert!(waited_before.is_some());
		assert_eq!(member.last_wait(), None);
	});
}

#[derive(Default)]
struct Admission {
	is_accepted: bool,
	devices: Vec<(String, &'static str, Value)>,
	host: Option<UnboundedSender<Message>>,
	members: HashMap<String, UnboundedSender<Message>>,
	listing: Value,
}

#[derive(Clone, Default)]
struct AdmittingRelay(Arc<Mutex<Admission>>);

impl AdmittingRelay {
	fn admission(&self) -> MutexGuard<'_, Admission> {
		self.0.lock().expect("the relay")
	}

	fn member_device_approved(&self, device_id: &str) {
		let approved =
			json!({ "event": "device.approved", "deviceId": device_id, "userId": "member" });
		if let Some(host) = &self.admission().host {
			if host.send(Message::Text(approved.to_string().into())).is_err() {
				log::warn!("the fake relay lost its host socket");
			}
		}
	}

	async fn served(&self) -> String {
		let router = Router::new()
			.route("/me", get(admitting_me))
			.route("/instances", post(instance_registered).get(admitting_instances_listed))
			.route("/instances/{id}", patch(admitting_instance_described))
			.route("/devices/challenge", post(device_challenged))
			.route("/devices", post(admitting_device_registered))
			.route("/instances/{id}/devices", get(admitting_devices_listed))
			.route("/instances/{id}/members", get(nothing_listed))
			.route("/instances/{id}/invitations", get(nothing_listed))
			.route("/instances/{id}/roster", get(roster_listed))
			.route("/invitations/{id}/accept", post(admitting_accepted))
			.route("/instances/{id}/relay/host", get(admitting_host_socket))
			.route("/instances/{id}/relay/member", get(admitting_member_socket))
			.with_state(self.clone());
		served(router).await
	}
}

fn admitted_account(headers: &HeaderMap) -> Option<&'static str> {
	let bearer = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok());
	match bearer.unwrap_or_default().trim_start_matches("Bearer ") {
		OWNER_BEARER => Some("owner"),
		MEMBER_BEARER => Some("member"),
		_ => None,
	}
}

async fn admitting_me(headers: HeaderMap) -> Response {
	let Some(account) = admitted_account(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	let me = json!({ "id": account, "email": format!("{account}@example.com"), "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" });
	answered_json(StatusCode::OK, me)
}

async fn instance_registered(Served(relay): Served<AdmittingRelay>, body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	relay.admission().listing = json!({ "name": body["name"], "colour": body["colour"] });
	answered_json(
		StatusCode::CREATED,
		json!({ "id": INSTANCE, "name": body["name"], "role": "owner" }),
	)
}

async fn admitting_device_registered(
	Served(relay): Served<AdmittingRelay>,
	headers: HeaderMap,
	body: String,
) -> Response {
	let Some(account) = admitted_account(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let id = uuid::Uuid::new_v4().to_string();
	let is_listed_now = {
		let mut admission = relay.admission();
		admission.devices.push((id.clone(), account, body));
		account == "member" && admission.is_accepted
	};
	if is_listed_now {
		relay.member_device_approved(&id);
	}
	answered_json(
		StatusCode::CREATED,
		json!({ "id": id, "createdAt": "2026-10-01T00:00:00.000Z", "transferred": false, "status": "approved" }),
	)
}

async fn admitting_instance_described(
	Served(relay): Served<AdmittingRelay>,
	body: String,
) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	relay.admission().listing = json!({ "name": body["name"], "colour": body["colour"] });
	answered_json(StatusCode::OK, json!({ "id": INSTANCE }))
}

async fn admitting_instances_listed(Served(relay): Served<AdmittingRelay>) -> Response {
	let mut listed = relay.admission().listing.clone();
	listed["id"] = json!(INSTANCE);
	answered_json(StatusCode::OK, json!([listed]))
}

async fn admitting_devices_listed(Served(relay): Served<AdmittingRelay>) -> Response {
	let admission = relay.admission();
	let listed = admission
		.devices
		.iter()
		.filter(|(_, account, _)| *account == "owner" || admission.is_accepted)
		.map(|(id, account, body)| {
			json!({
				"id": id,
				"userId": account,
				"status": "approved",
				"ed25519PublicKey": body["ed25519PublicKey"],
				"x25519PublicKey": body["x25519PublicKey"],
			})
		})
		.collect();
	answered_json(StatusCode::OK, Value::Array(listed))
}

async fn nothing_listed() -> Response {
	answered_json(StatusCode::OK, json!([]))
}

async fn admitting_accepted(Served(relay): Served<AdmittingRelay>, headers: HeaderMap) -> Response {
	if admitted_account(&headers) != Some("member") {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let member_devices: Vec<String> = {
		let mut admission = relay.admission();
		admission.is_accepted = true;
		admission
			.devices
			.iter()
			.filter(|(_, account, _)| *account == "member")
			.map(|(id, _, _)| id.clone())
			.collect()
	};
	for device_id in &member_devices {
		relay.member_device_approved(device_id);
	}
	answered_json(StatusCode::OK, json!({ "instanceId": INSTANCE, "name": "Studio" }))
}

fn device_of(query: Option<&str>) -> Option<String> {
	query.and_then(|query| query.strip_prefix("device=")).map(str::to_owned)
}

fn spliced(text: &str, from: &str) -> Message {
	Message::Text(format!("{{\"from\":{},{}", json!(from), &text[1..]).into())
}

fn pumped(
	socket: WebSocket,
) -> (UnboundedSender<Message>, futures_util::stream::SplitStream<WebSocket>) {
	let (mut sink, stream) = socket.split();
	let (frames, mut outgoing) = mpsc::unbounded_channel::<Message>();
	tauri::async_runtime::spawn(async move {
		while let Some(frame) = outgoing.recv().await {
			if sink.send(frame).await.is_err() {
				break;
			}
		}
	});
	(frames, stream)
}

async fn admitting_host_socket(
	Served(relay): Served<AdmittingRelay>,
	RawQuery(query): RawQuery,
	upgrade: WebSocketUpgrade,
) -> Response {
	let Some(device) = device_of(query.as_deref()) else {
		return StatusCode::BAD_REQUEST.into_response();
	};
	upgrade.on_upgrade(move |socket| async move {
		let (frames, mut stream) = pumped(socket);
		relay.admission().host = Some(frames);
		while let Some(Ok(Message::Text(text))) = stream.next().await {
			let envelope: Value = serde_json::from_str(text.as_str()).expect("a json host frame");
			let admission = relay.admission();
			let recipients = admission
				.members
				.iter()
				.filter(|(id, _)| envelope.get("to").is_none_or(|to| to == id.as_str()));
			for (_, member) in recipients {
				if member.send(spliced(text.as_str(), &device)).is_err() {
					log::warn!("a fake relay member socket was gone");
				}
			}
		}
	})
}

async fn admitting_member_socket(
	Served(relay): Served<AdmittingRelay>,
	RawQuery(query): RawQuery,
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	let is_member = admitted_account(&headers) == Some("member") && relay.admission().is_accepted;
	let Some(device) = device_of(query.as_deref()).filter(|_| is_member) else {
		return StatusCode::FORBIDDEN.into_response();
	};
	upgrade.on_upgrade(move |socket| async move {
		let (frames, mut stream) = pumped(socket);
		relay.admission().members.insert(device.clone(), frames);
		while let Some(Ok(Message::Text(text))) = stream.next().await {
			let host = relay.admission().host.clone();
			if let Some(host) = host {
				if host.send(spliced(text.as_str(), &device)).is_err() {
					log::warn!("the fake relay host socket was gone");
				}
			}
		}
		relay.admission().members.remove(&device);
	})
}

async fn local_answered(Path(command): Path<String>) -> Response {
	answered_json(StatusCode::OK, json!({ "command": command }))
}

#[derive(Clone, Default)]
struct HostApp(Arc<OnceLock<AppHandle<MockRuntime>>>);

async fn host_invoked(
	Served(host): Served<HostApp>,
	Path(command): Path<String>,
	body: String,
) -> Response {
	if command != "space_update" {
		return local_answered(Path(command)).await;
	}
	let app = host.0.get().expect("the host app").clone();
	let args: Value = serde_json::from_str(&body).expect("json arguments");
	let text = |key: &str| args[key].as_str().expect("a text argument").to_owned();
	let colour = args["colour"].as_i64();
	match space_update(app.clone(), app.state(), text("id"), text("name"), colour).await {
		Ok(space) => answered_json(StatusCode::OK, json!(space)),
		Err(refusal) => answered_json(StatusCode::INTERNAL_SERVER_ERROR, json!(refusal)),
	}
}

struct Peers {
	relay: AdmittingRelay,
	cloud: String,
	host: AppOfItsOwn,
	_temporary: Vec<RemovedOnDrop>,
}

impl Peers {
	async fn hosting() -> Self {
		let relay = AdmittingRelay::default();
		let cloud = relay.served().await;
		let host_app = HostApp::default();
		let invoked = Router::new().route("/api/invoke/{command}", post(host_invoked));
		let local = served(invoked.with_state(host_app.clone())).await;
		let (host, _root, temporary) =
			signed_in("joined-admission-host", OWNER_BEARER, &cloud, PATIENCE);
		assert!(host_app.0.set(host.handle().clone()).is_ok());
		let local = LocalApi::new(local, LOCAL_TOKEN.to_owned()).expect("the local client builds");
		host.manage(Hosting::new(&cloud, Some(local)));
		hosting_start(host.handle().clone(), SPACE.to_owned()).await.expect("the hosting starts");
		let peers = Self { relay, cloud, host, _temporary: temporary };
		until("the host socket", || async { peers.relay.admission().host.is_some().then_some(()) })
			.await;
		peers
	}

	fn host_device_id(&self) -> String {
		let state = self.host.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the host keys").secret())
			.device_id()
			.to_string()
	}
}

#[test]
fn a_member_the_host_admits_from_the_device_list_joins_on_its_first_rekey_and_pins_that_host() {
	run(async {
		let peers = Peers::hosting().await;
		let (member, _root, _temporary) =
			signed_in("joined-admission-member", MEMBER_BEARER, &peers.cloud, PATIENCE);

		let joined = invitations::accept(member.handle(), INVITATION.to_owned()).await;
		let joined = joined.expect("the join");
		until("the roster of two devices", || async {
			let members = joined_space_members(member.state(), joined.id.clone()).await;
			(members.expect("the members read").len() == 2).then_some(())
		})
		.await;
		let listed = joined_spaces_list(member.handle().clone()).await.expect("the list");

		assert_eq!(joined.state, JoinedSpaceState::Online);
		let named = JoinedSpace { hosted_by: Some("Ann".to_owned()), ..joined };
		assert_eq!(listed, vec![named]);
		let keys = member.state::<SpaceKeys>();
		let held = keys.held(&format!("joined-{INSTANCE}")).expect("the key reads");
		assert_eq!(held.map(|held| held.key_id), Some(1));
		let state = member.state::<DatabaseState>();
		let relay = state.as_ref().expect("the database").joined_space_relay();
		let roster = relay.roster(INSTANCE.to_owned()).await.expect("the roster reads");
		let roster: Value = serde_json::from_str(&roster.expect("a pinned roster").roster)
			.expect("a json roster set");
		assert_eq!(roster["host"], peers.host_device_id());
	});
}

async fn joined_by(peers: &Peers, name: &str) -> (AppOfItsOwn, JoinedSpace, Vec<RemovedOnDrop>) {
	let (member, _root, temporary) = signed_in(name, MEMBER_BEARER, &peers.cloud, PATIENCE);
	let joined = invitations::accept(member.handle(), INVITATION.to_owned()).await;
	(member, joined.expect("the join"), temporary)
}

async fn described(
	member: &AppOfItsOwn,
	joined: &JoinedSpace,
	colour: Option<i64>,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let (app, id) = (member.handle().clone(), joined.id.clone());
	joined_space_describe(app, id, "Lab".to_owned(), colour).await
}

async fn host_space(peers: &Peers) -> (String, Option<Hue>) {
	let state = peers.host.state::<DatabaseState>();
	let spaces = state.as_ref().expect("the database").spaces().list().await.expect("the spaces");
	let space = spaces.into_iter().find(|space| space.id == SPACE).expect("the shared space");
	(space.name, space.colour)
}

async fn named_and_coloured(member: &AppOfItsOwn) -> Vec<(String, Option<Hue>)> {
	let listed = joined_spaces_list(member.handle().clone()).await.expect("the list");
	listed.into_iter().map(|joined| (joined.name, joined.colour)).collect()
}

async fn listed_as(member: &AppOfItsOwn, expected: &[(String, Option<Hue>)]) {
	until("the description of the joined space", || async {
		(named_and_coloured(member).await == expected).then_some(())
	})
	.await;
}

#[test]
fn a_member_describes_its_joined_space_and_the_host_and_every_member_take_it_through_a_reconciliation(
) {
	run(async {
		let peers = Peers::hosting().await;
		let (member, joined, _member_files) = joined_by(&peers, "described-member").await;
		let (other, other_joined, _other_files) = joined_by(&peers, "described-other").await;
		joined_space_connect(other.handle().clone(), other_joined.id.clone())
			.await
			.expect("the other member connects");
		let other_changes = changes_heard(&other);
		let host_before = host_space(&peers).await;
		let before = named_and_coloured(&member).await;

		let refused = described(&member, &joined, Some(360)).await;
		let host_after_refusal = host_space(&peers).await;
		let after_refusal = named_and_coloured(&member).await;
		let answered = described(&member, &joined, Some(200)).await.expect("the description");
		let lab = vec![("Lab".to_owned(), Hue::new(200))];
		listed_as(&other, &lab).await;
		listed_as(&member, &lab).await;
		relay::reconciled(other.handle()).await;
		relay::reconciled(member.handle()).await;

		assert_eq!(joined.remote_space_id, None);
		assert_eq!(
			refused,
			Err(JoinedSpaceError::SpaceRefused { refusal: SpaceError::unknown_colour(360) })
		);
		assert_eq!((host_after_refusal, after_refusal), (host_before, before));
		let expected = JoinedSpace {
			remote_space_id: Some(SPACE.to_owned()),
			name: "Lab".to_owned(),
			colour: Hue::new(200),
			hosted_by: answered.hosted_by.clone(),
			..joined
		};
		assert_eq!(answered, expected);
		assert_eq!(host_space(&peers).await, ("Lab".to_owned(), Hue::new(200)));
		let heard = other_changes.lock().expect("the events").clone();
		assert!(
			heard
				.iter()
				.any(|changed| changed["id"] == other_joined.id && changed["colour"] == 200),
			"{heard:?}"
		);
		assert_eq!(peers.relay.admission().listing, json!({ "name": "Lab", "colour": 200 }));
		assert_eq!(named_and_coloured(&other).await, lab);
		assert_eq!(named_and_coloured(&member).await, lab);
	});
}

#[test]
fn a_description_without_colour_of_a_coloured_space_answers_and_lists_it_with_null() {
	run(async {
		let peers = Peers::hosting().await;
		let (member, joined, _member_files) = joined_by(&peers, "uncoloured-member").await;
		described(&member, &joined, Some(200)).await.expect("the coloured description");
		listed_as(&member, &[("Lab".to_owned(), Hue::new(200))]).await;

		let answered = described(&member, &joined, None).await.expect("the uncoloured description");
		listed_as(&member, &[("Lab".to_owned(), None)]).await;

		assert_eq!(serde_json::to_value(&answered).expect("json")["colour"], Value::Null);
		assert_eq!(host_space(&peers).await, ("Lab".to_owned(), None));
	});
}

#[test]
fn a_description_the_host_never_answers_is_host_offline_and_leaves_the_row_unchanged() {
	run(async {
		let member = Member::facing_a_silent_host("described-silent").await;
		let host = member.host();
		let joined = online_and_greeted(&member, &host).await;
		let before = member.listed().await;

		let app = member.app.handle().clone();
		let silent =
			joined_space_describe(app, joined.id.clone(), "Lab".to_owned(), Some(200)).await;

		assert_eq!(silent, Err(JoinedSpaceError::HostOffline { id: joined.id.clone() }));
		assert_eq!(member.listed().await, before);
	});
}

#[test]
fn a_call_over_a_link_that_is_down_is_host_offline_without_being_sent() {
	run(async {
		let member = Member::new("described-down").await;
		let link = MemberLink::new(INSTANCE, "Studio".to_owned());
		link.closed(Presence::Down);
		let call = HostCall { command: "space_update", args: json!({}), bound: PATIENCE };

		let answered = relay::host_answered(member.app.handle(), "joined-1", &link, call).await;

		assert_eq!(
			answered.err(),
			Some(JoinedSpaceError::HostOffline { id: "joined-1".to_owned() })
		);
	});
}

#[test]
fn a_description_taken_while_a_reconciliation_reads_the_older_listing_is_kept() {
	run(async {
		let member = Member::new("described-while-reconciling").await;
		let host = member.host();
		let joined = online_with_two_members(&member, &host).await;
		let gate = Arc::clone(&member.relay.room().is_instance_list_open);
		gate.send_replace(false);
		let reads = member.relay.room().instance_reads;
		let app = member.app.handle().clone();
		let reconciling = tauri::async_runtime::spawn(async move { relay::reconciled(&app).await });
		until("the listing read", || async {
			(member.relay.room().instance_reads > reads).then_some(())
		})
		.await;

		let lab = SpaceDescribed {
			space_id: SPACE.to_owned(),
			name: "Lab".to_owned(),
			colour: Hue::new(200),
		};
		relay::description_adopted(member.app.handle(), &joined.id, lab)
			.await
			.expect("the description is taken");
		gate.send_replace(true);
		reconciling.await.expect("the reconciliation");

		let lab = vec![("Lab".to_owned(), Hue::new(200))];
		assert_eq!(named_and_coloured(&member.app).await, lab);
	});
}

async fn online_and_greeted(member: &Member, host: &SealingHost) -> JoinedSpace {
	let joined = online_with_two_members(member, host).await;
	member.relay.greets_after_the_next_members_read(vec![host.hello()]);
	joined_space_connect(member.app.handle().clone(), joined.id.clone())
		.await
		.expect("the connection");
	let guests = member.app.state::<RelayGuests>();
	until("the link online", || async {
		(guests.presence(&joined.id) == Some(Presence::Online)).then_some(())
	})
	.await;
	joined
}

#[test]
fn a_description_the_link_drops_before_its_event_still_lists_the_answered_name_and_hue() {
	run(async {
		let member = Member::new("described-then-dropped").await;
		let host = Arc::new(member.host());
		let joined = online_and_greeted(&member, &host).await;
		let changes = changes_heard(&member.app);
		let body = json!({
			"id": SPACE, "name": "Lab", "colour": 200, "position": 0, "createdAt": 0,
			"shared": true, "instanceId": INSTANCE,
		});
		let dropping = HostSide::DroppingAfterItsAnswer { host, command: "space_update", body };
		member.relay.hosting(dropping);

		let app = member.app.handle().clone();
		let answered = joined_space_describe(app, joined.id.clone(), "Lab".to_owned(), Some(200))
			.await
			.expect("the description");

		let lab = vec![("Lab".to_owned(), Hue::new(200))];
		assert_eq!((answered.name.clone(), answered.colour), lab[0].clone());
		assert_eq!(named_and_coloured(&member.app).await, lab);
		assert_eq!(member.listed().await, vec![answered]);
		let heard = changes.lock().expect("the events").clone();
		assert_eq!(heard, vec![json!({ "id": joined.id, "hostedBy": "Ann", "colour": 200 })]);
	});
}

#[test]
fn a_description_heard_again_with_the_same_name_and_hue_writes_nothing_and_announces_nothing() {
	run(async {
		let member = Member::new("described-twice").await;
		let host = member.host();
		let joined = online_with_two_members(&member, &host).await;
		let changes = changes_heard(&member.app);
		let lab = || SpaceDescribed {
			space_id: SPACE.to_owned(),
			name: "Lab".to_owned(),
			colour: Hue::new(200),
		};

		relay::description_adopted(member.app.handle(), &joined.id, lab()).await.expect("first");
		relay::description_adopted(member.app.handle(), &joined.id, lab()).await.expect("again");

		let heard = changes.lock().expect("the events").clone();
		assert_eq!(heard, vec![json!({ "id": joined.id, "hostedBy": "Ann", "colour": 200 })]);
		let lab = vec![("Lab".to_owned(), Hue::new(200))];
		assert_eq!(named_and_coloured(&member.app).await, lab);
	});
}
