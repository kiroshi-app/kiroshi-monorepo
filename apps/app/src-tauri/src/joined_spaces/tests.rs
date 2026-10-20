use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, RawQuery, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};
use tokio::net::TcpListener;
use tokio::sync::mpsc::{self, UnboundedSender};

use super::commands::{
	joined_space_connect, joined_space_remove, joined_spaces_list, CHANGED_EVENT, REMOVED_EVENT,
};
use super::contract::{
	JoinedSpace, JoinedSpaceError, JoinedSpaceState, JoinedSpaceWait, JoinedSpaceWaitReason,
};
use super::members::{joined_space_members, MEMBERS_CHANGED_EVENT};
use super::relay::{self, RelayGuests};
use super::test_host::SealingHost;
use crate::account::session::AccountSession;
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
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const INSTANCE: &str = "6f1c2b8e-7d3a-4b5e-9c1d-2a3b4c5d6e7f";
const INVITATION: &str = "inv_studio-1";
const OTHER_INSTANCE: &str = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const MEMBER_BEARER: &str = "bearer-of-the-member";
const OWNER_BEARER: &str = "bearer-of-the-owner";
const LOCAL_TOKEN: &str = "host-token-of-the-loopback";
const SPACE: &str = "personal";
const MEMBER_RELAY_ID: &str = "3b0c7a52-1d4e-4f8a-9b6c-0e2f4a6c8d10";
const PATIENCE: Duration = Duration::from_secs(20);
const POLL_EVERY: Duration = Duration::from_millis(50);
const HOST_ANSWER_BOUND: Duration = Duration::from_secs(2);
const RESEND_EVERY: Duration = Duration::from_millis(200);
const HOST_ABSENT: u16 = 4002;
const BEFORE_THE_NEXT_MEMBERS_READ: Duration = Duration::from_secs(5);

#[derive(Clone)]
enum HostSide {
	Absent,
	Silent,
	Answering(String),
	GreetingAfterRead { frames: Vec<String>, reads: usize },
}

struct Room {
	accept: (StatusCode, Value),
	accepted: Vec<String>,
	host: HostSide,
	joins: Vec<Value>,
	connections: usize,
	other_memberships: Vec<Value>,
	roster_reads: usize,
	member_refusal: Option<(StatusCode, Value)>,
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
			other_memberships: Vec::new(),
			roster_reads: 0,
			member_refusal: None,
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
			.route("/instances", get(instances_listed))
			.route("/instances/{id}/roster", get(roster_read))
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
	tauri::async_runtime::spawn(async move {
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

async fn me(headers: HeaderMap) -> Response {
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

async fn instances_listed(Served(relay): Served<Relay>) -> Response {
	let room = relay.room();
	let mut listed = room.other_memberships.clone();
	if !room.accepted.is_empty() {
		listed.insert(0, json!({ "id": INSTANCE, "name": "Studio" }));
	}
	answered_json(StatusCode::OK, Value::Array(listed))
}

async fn roster_read(Served(relay): Served<Relay>) -> Response {
	relay.room().roster_reads += 1;
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
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	if !is_member(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let refusal = relay.room().member_refusal.clone();
	if let Some((status, body)) = refusal {
		return answered_json(status, body);
	}
	relay.room().connections += 1;
	upgrade.on_upgrade(move |socket| membered(relay, socket))
}

fn is_missed_rekey(frame: &Value) -> bool {
	frame["key_id"] == 0 && frame["instance"] == INSTANCE && frame.get("to").is_none()
}

async fn membered(relay: Relay, mut socket: WebSocket) {
	while let Some(Ok(frame)) = socket.recv().await {
		let Message::Text(text) = frame else {
			continue;
		};
		let frame: Value = serde_json::from_str(text.as_str()).expect("a json member frame");
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
			HostSide::Silent | HostSide::GreetingAfterRead { .. } => continue,
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
		let relay = Relay::new();
		let cloud = relay.served().await;
		Self::over(name, relay, &cloud)
	}

	fn over(name: &str, relay: Relay, cloud: &str) -> Self {
		let (app, root, temporary) = signed_in(name, MEMBER_BEARER, cloud);
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

	fn device(&self) -> DeviceKeys {
		let state = self.app.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the device keys").secret())
	}
}

fn signed_in(name: &str, bearer: &str, cloud: &str) -> (AppOfItsOwn, PathBuf, Vec<RemovedOnDrop>) {
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
	let guests = RelayGuests::new(cloud).answering_within(HOST_ANSWER_BOUND);
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

		let joined = member.accepted().await.expect("the join");
		let members = until("the roster of two devices", || async {
			let members = joined_space_members(member.app.state(), joined.id.clone()).await;
			let members = members.expect("the members read");
			(members.len() == 2).then_some(members)
		})
		.await;

		assert_eq!(joined.state, JoinedSpaceState::Online);
		assert_eq!(joined.name, "Studio");
		assert_eq!(member.relay.room().accepted, vec![INVITATION.to_owned()]);
		assert_eq!(member.relay.joins().len(), 1);
		assert_eq!(member.held_key_id(), Some(1));
		assert_eq!(member.listed().await, vec![joined]);
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
	within(BEFORE_THE_NEXT_MEMBERS_READ, "the members changed event", || async {
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
		let unreached = Member::over("join-unreached", Relay::new(), &a_closed_port().await);
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
			let member = Member::new("join-waiting").await;
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
		let member = Member::new("join-flip").await;
		let heard = changes_heard(&member.app);
		member.relay.hosting(HostSide::Silent);
		let joined = member.accepted().await.expect("the join waits");
		let answer = member.host().admitted();

		relay::reconciled(member.app.handle()).await;
		until("the missed rekey frame resent on the open socket", || async {
			(member.relay.joins().len() >= 3).then_some(())
		})
		.await;
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
	});
}

#[test]
fn an_unreadable_key_still_starts_every_waiting_join_and_its_space_comes_online_once_answered() {
	run(async {
		let member = Member::new("join-unreadable-key").await;
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
		let member = Member::new("join-forbidden").await;
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

#[test]
fn a_waiting_join_the_relay_answers_410_on_ends_its_wait() {
	run(async {
		let member = Member::new("join-gone").await;
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
		assert_eq!(
			*removed.lock().expect("the events"),
			vec![json!({ "id": joined.id, "name": "Studio", "reason": "removed" })]
		);
	});
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
		let member = Member::new("join-stopped").await;
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
		drop(relay::signed_out(member.app.handle()).await);

		assert!(was_waiting && !after_removal);
		assert!(was_waiting_again);
		assert!(!member.is_waiting(&kept.id));
	});
}

#[derive(Default)]
struct Admission {
	is_accepted: bool,
	devices: Vec<(String, &'static str, Value)>,
	host: Option<UnboundedSender<Message>>,
	members: HashMap<String, UnboundedSender<Message>>,
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
			.route("/instances", post(instance_registered))
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

async fn instance_registered(body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
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

async fn admitting_devices_listed(Served(relay): Served<AdmittingRelay>) -> Response {
	let admission = relay.admission();
	let listed = admission
		.devices
		.iter()
		.filter(|(_, account, _)| *account == "owner" || admission.is_accepted)
		.map(|(id, account, body)| {
			json!({
				"deviceId": id,
				"userId": account,
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
		let local =
			served(Router::new().route("/api/invoke/{command}", post(local_answered))).await;
		let (host, _root, temporary) = signed_in("joined-admission-host", OWNER_BEARER, &cloud);
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
			signed_in("joined-admission-member", MEMBER_BEARER, &peers.cloud);

		let joined = invitations::accept(member.handle(), INVITATION.to_owned()).await;
		let listed = joined_spaces_list(member.handle().clone()).await.expect("the list");

		let joined = joined.expect("the join");
		assert_eq!(joined.state, JoinedSpaceState::Online);
		assert_eq!(listed, vec![joined]);
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
