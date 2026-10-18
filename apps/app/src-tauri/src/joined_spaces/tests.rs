use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, RawQuery, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::Router;
use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};
use tokio::net::TcpListener;
use tokio::sync::mpsc::{self, UnboundedSender};

use super::commands::{join_by_link, joined_space_connect, REMOVED_EVENT};
use super::contract::{JoinedSpace, JoinedSpaceConnection, JoinedSpaceError};
use super::members::joined_space_members;
use super::relay::RelayGuests;
use crate::account::session::AccountSession;
use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::fingerprint::fingerprint;
use crate::db::connection::temp_dir;
use crate::db::repositories::joined_space_members::{JoinedSpaceMember, JoinedSpaceRole};
use crate::db::{self, DatabaseState};
use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::hosting::bridge::LocalApi;
use crate::hosting::commands::{
	hosting_device_link, hosting_invite_member, hosting_join_link, hosting_remove_device,
	hosting_remove_member, hosting_start, hosting_stop,
};
use crate::hosting::Hosting;
use crate::invitations::Invitations;
use crate::logging::contract::InstallKind;
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const INSTANCE: &str = "6f1c2b8e-7d3a-4b5e-9c1d-2a3b4c5d6e7f";
const SPACE: &str = "personal";
const OWNER: &str = "owner";
const MEMBER: &str = "bob";
const OWNER_BEARER: &str = "bearer-of-the-owner";
const MEMBER_BEARER: &str = "bearer-of-bob";
const LOCAL_TOKEN: &str = "host-token-of-the-loopback";
const PATIENCE: Duration = Duration::from_secs(20);
const POLL_EVERY: Duration = Duration::from_millis(50);
const HOST_ANSWER_BOUND: Duration = Duration::from_secs(2);
const MEMBERSHIP_ENDED: u16 = 4003;
const SERVER_RESTARTING: u16 = 4005;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Membership {
	None,
	Pending,
	Joined,
}

struct MemberSocket {
	account_id: &'static str,
	frames: UnboundedSender<Message>,
}

struct Room {
	membership: Membership,
	is_withdrawn: bool,
	accepted: usize,
	devices: Vec<(String, String)>,
	host: Option<UnboundedSender<Message>>,
	members: HashMap<String, MemberSocket>,
}

#[derive(Clone)]
struct Relay(Arc<Mutex<Room>>);

impl Relay {
	fn new() -> Self {
		Self(Arc::new(Mutex::new(Room {
			membership: Membership::None,
			is_withdrawn: false,
			accepted: 0,
			devices: Vec::new(),
			host: None,
			members: HashMap::new(),
		})))
	}

	fn room(&self) -> MutexGuard<'_, Room> {
		self.0.lock().expect("the relay")
	}

	fn closed_for(&self, account_id: &str, code: u16) {
		let room = self.room();
		for socket in room.members.values().filter(|socket| socket.account_id == account_id) {
			let close = CloseFrame { code, reason: "".into() };
			socket.frames.send(Message::Close(Some(close))).expect("the member socket pumps");
		}
	}

	async fn served(&self) -> String {
		let router = Router::new()
			.route("/me", get(me))
			.route("/instances", post(instance_registered).get(instances_listed))
			.route("/devices/challenge", post(device_challenged))
			.route("/devices", post(device_registered))
			.route("/instances/{id}/members", get(members_listed).post(member_invited))
			.route("/instances/{id}/members/{user_id}", delete(member_removed))
			.route("/instances/{id}/roster", get(roster_listed))
			.route("/invitations", get(invitations_listed))
			.route("/invitations/{id}/accept", post(invitation_accepted))
			.route("/instances/{id}/relay/host", get(host_socket))
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

fn account_of(headers: &HeaderMap) -> Option<&'static str> {
	let bearer = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok());
	match bearer.unwrap_or_default().trim_start_matches("Bearer ") {
		OWNER_BEARER => Some(OWNER),
		MEMBER_BEARER => Some(MEMBER),
		_ => None,
	}
}

fn answered_json(status: StatusCode, body: Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

async fn me(headers: HeaderMap) -> Response {
	let Some(account_id) = account_of(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	let email = format!("{account_id}@example.com");
	let me = json!({ "id": account_id, "email": email, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" });
	answered_json(StatusCode::OK, me)
}

async fn instance_registered(body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	answered_json(
		StatusCode::CREATED,
		json!({ "id": INSTANCE, "name": body["name"], "role": "owner" }),
	)
}

async fn instances_listed(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	let is_listed = match account_of(&headers) {
		Some(OWNER) => true,
		Some(_) => relay.room().membership == Membership::Joined,
		None => return StatusCode::UNAUTHORIZED.into_response(),
	};
	let listed = if is_listed { json!([{ "id": INSTANCE, "name": "Studio" }]) } else { json!([]) };
	answered_json(StatusCode::OK, listed)
}

async fn device_challenged() -> Response {
	let nonce = BASE64_URL_SAFE_NO_PAD.encode([7; 32]);
	answered_json(
		StatusCode::CREATED,
		json!({ "nonce": nonce, "expiresAt": "2099-10-01T00:00:00.000Z" }),
	)
}

async fn device_registered(Served(relay): Served<Relay>, body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let key = body["ed25519PublicKey"].as_str().expect("a signing key").to_owned();
	let mut room = relay.room();
	let id = match room.devices.iter().find(|(held, _)| *held == key) {
		Some((_, id)) => id.clone(),
		None => {
			let id = uuid::Uuid::new_v4().to_string();
			room.devices.push((key, id.clone()));
			id
		}
	};
	answered_json(
		StatusCode::CREATED,
		json!({ "id": id, "createdAt": "2026-10-01T00:00:00.000Z", "transferred": false }),
	)
}

fn cloud_member(user_id: &str, state: &str) -> Value {
	let email = format!("{user_id}@example.com");
	let role = if user_id == OWNER { "owner" } else { "member" };
	json!({ "userId": user_id, "email": email, "name": null, "role": role, "state": state })
}

async fn members_listed(Served(relay): Served<Relay>) -> Response {
	let mut members = vec![cloud_member(OWNER, "joined")];
	match relay.room().membership {
		Membership::None => {}
		Membership::Pending => members.push(cloud_member(MEMBER, "pending")),
		Membership::Joined => members.push(cloud_member(MEMBER, "joined")),
	}
	answered_json(StatusCode::OK, Value::Array(members))
}

async fn member_invited(Served(relay): Served<Relay>) -> Response {
	relay.room().membership = Membership::Pending;
	answered_json(StatusCode::CREATED, cloud_member(MEMBER, "pending"))
}

async fn member_removed(
	Served(relay): Served<Relay>,
	Path((_, user_id)): Path<(String, String)>,
) -> Response {
	assert_eq!(user_id, MEMBER);
	relay.room().membership = Membership::None;
	relay.closed_for(MEMBER, MEMBERSHIP_ENDED);
	StatusCode::NO_CONTENT.into_response()
}

async fn roster_listed(Served(relay): Served<Relay>) -> Response {
	let mut roster = vec![json!({ "userId": OWNER, "name": "Ann", "role": "owner" })];
	if relay.room().membership == Membership::Joined {
		roster.push(json!({ "userId": MEMBER, "name": "Bob", "role": "member" }));
	}
	answered_json(StatusCode::OK, Value::Array(roster))
}

async fn invitations_listed(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	let is_pending =
		account_of(&headers) == Some(MEMBER) && relay.room().membership == Membership::Pending;
	let invitation = json!({
		"instanceId": INSTANCE,
		"instanceName": "Studio",
		"inviterEmail": "owner@example.com",
		"invitedAt": "2026-10-01T00:00:00.000Z",
	});
	answered_json(StatusCode::OK, if is_pending { json!([invitation]) } else { json!([]) })
}

async fn invitation_accepted(Served(relay): Served<Relay>) -> Response {
	let mut room = relay.room();
	if room.is_withdrawn {
		return StatusCode::GONE.into_response();
	}
	if room.membership != Membership::Pending {
		return StatusCode::NOT_FOUND.into_response();
	}
	room.membership = Membership::Joined;
	room.accepted += 1;
	answered_json(StatusCode::OK, json!({ "name": "Studio" }))
}

async fn host_socket(
	Served(relay): Served<Relay>,
	RawQuery(query): RawQuery,
	upgrade: WebSocketUpgrade,
) -> Response {
	let device = query.as_deref().and_then(|query| query.strip_prefix("device="));
	let Some(device) = device.map(str::to_owned) else {
		return StatusCode::BAD_REQUEST.into_response();
	};
	upgrade.on_upgrade(move |socket| hosted(relay, socket, device))
}

fn spliced(text: &str, from: &str) -> Message {
	Message::Text(format!("{{\"from\":{},{}", json!(from), &text[1..]).into())
}

async fn member_socket(
	Served(relay): Served<Relay>,
	RawQuery(query): RawQuery,
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	let device = query.as_deref().and_then(|query| query.strip_prefix("device="));
	let Some(device) = device.map(str::to_owned) else {
		return StatusCode::BAD_REQUEST.into_response();
	};
	let account_id = match (account_of(&headers), relay.room().membership) {
		(Some(OWNER), _) => OWNER,
		(Some(MEMBER), Membership::Joined) => MEMBER,
		(Some(MEMBER), Membership::Pending) => return StatusCode::FORBIDDEN.into_response(),
		(Some(_), _) => return StatusCode::NOT_FOUND.into_response(),
		(None, _) => return StatusCode::UNAUTHORIZED.into_response(),
	};
	upgrade.on_upgrade(move |socket| membered(relay, socket, device, account_id))
}

fn pumped(
	socket: WebSocket,
) -> (UnboundedSender<Message>, futures_util::stream::SplitStream<WebSocket>) {
	let (mut sink, stream) = socket.split();
	let (frames, mut outgoing) = mpsc::unbounded_channel::<Message>();
	tauri::async_runtime::spawn(async move {
		while let Some(frame) = outgoing.recv().await {
			let is_close = matches!(frame, Message::Close(_));
			if sink.send(frame).await.is_err() || is_close {
				break;
			}
		}
	});
	(frames, stream)
}

async fn hosted(relay: Relay, socket: WebSocket, device: String) {
	let (frames, mut stream) = pumped(socket);
	relay.room().host = Some(frames);
	hosted_until_closed(&relay, &mut stream, &device).await;
	relay.room().host = None;
}

async fn hosted_until_closed(
	relay: &Relay,
	stream: &mut futures_util::stream::SplitStream<WebSocket>,
	device: &str,
) {
	while let Some(Ok(frame)) = stream.next().await {
		let Message::Text(text) = frame else {
			continue;
		};
		let envelope: Value = serde_json::from_str(text.as_str()).expect("a json host frame");
		let room = relay.room();
		let recipients = room
			.members
			.iter()
			.filter(|(id, _)| envelope.get("to").is_none_or(|to| to == id.as_str()));
		for (_, socket) in recipients {
			if socket.frames.send(spliced(text.as_str(), device)).is_err() {
				eprintln!("a fake relay member socket was gone");
			}
		}
	}
}

async fn membered(relay: Relay, socket: WebSocket, device: String, account_id: &'static str) {
	let (frames, mut stream) = pumped(socket);
	relay.room().members.insert(device.clone(), MemberSocket { account_id, frames });
	while let Some(Ok(frame)) = stream.next().await {
		let Message::Text(text) = frame else {
			continue;
		};
		let host = relay.room().host.clone();
		if let Some(host) = host {
			if host.send(spliced(text.as_str(), &device)).is_err() {
				eprintln!("the fake relay host socket was gone");
			}
		}
	}
	relay.room().members.remove(&device);
}

async fn local_answered(Path(command): Path<String>) -> Response {
	answered_json(StatusCode::OK, json!({ "command": command }))
}

fn signed_in(name: &str, bearer: &str, cloud: &str) -> (AppOfItsOwn, Vec<RemovedOnDrop>) {
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
	app.manage(RelayGuests::new(cloud).answering_within(HOST_ANSWER_BOUND));
	app.manage(Invitations::new(cloud));
	(app, vec![database, root])
}

struct Peers {
	relay: Relay,
	cloud: String,
	host: AppOfItsOwn,
	_temporary: Vec<RemovedOnDrop>,
}

impl Peers {
	async fn hosting() -> Self {
		let relay = Relay::new();
		let cloud = relay.served().await;
		let local =
			served(Router::new().route("/api/invoke/{command}", post(local_answered))).await;
		let (host, temporary) = signed_in("joined-v2-host", OWNER_BEARER, &cloud);
		let local = LocalApi::new(local, LOCAL_TOKEN.to_owned()).expect("the local client builds");
		host.manage(Hosting::new(&cloud, Some(local)));
		hosting_start(host.handle().clone(), SPACE.to_owned()).await.expect("the hosting starts");
		let peers = Self { relay, cloud, host, _temporary: temporary };
		peers.until("the host socket", || peers.relay.room().host.is_some().then_some(())).await;
		peers
	}

	async fn until<T>(&self, awaited: &str, found: impl Fn() -> Option<T>) -> T {
		until(awaited, || std::future::ready(found())).await
	}

	fn member(&self, name: &str, bearer: &str) -> (AppOfItsOwn, Vec<RemovedOnDrop>) {
		signed_in(name, bearer, &self.cloud)
	}

	async fn invitation_link(&self) -> String {
		let handle = self.host.handle().clone();
		hosting_invite_member(handle.clone(), SPACE.to_owned(), "bob@example.com".to_owned())
			.await
			.expect("the invitation");
		hosting_join_link(handle, SPACE.to_owned(), MEMBER.to_owned()).await.expect("the link")
	}

	async fn device_link(&self) -> String {
		hosting_device_link(self.host.handle().clone(), SPACE.to_owned()).await.expect("the link")
	}

	fn host_keys(&self) -> DeviceKeys {
		let state = self.host.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the host keys").secret())
	}
}

async fn until<T, F: std::future::Future<Output = Option<T>>>(
	awaited: &str,
	found: impl Fn() -> F,
) -> T {
	tokio::time::timeout(PATIENCE, async {
		loop {
			if let Some(found) = found().await {
				return found;
			}
			tokio::time::sleep(POLL_EVERY).await;
		}
	})
	.await
	.unwrap_or_else(|_| panic!("{awaited} did not come within {PATIENCE:?}"))
}

fn keys_of(app: &App<MockRuntime>) -> DeviceKeys {
	let state = app.state::<DeviceKeysState>();
	DeviceKeys::from_secret(&state.keys().expect("the device keys").secret())
}

fn words_of(keys: &DeviceKeys) -> Vec<String> {
	fingerprint(&keys.signing_public()).map(str::to_owned).to_vec()
}

fn held_key_id(app: &App<MockRuntime>) -> Option<u32> {
	let held = app.state::<SpaceKeys>().held(&format!("joined-{INSTANCE}")).expect("the key reads");
	held.map(|held| held.key_id)
}

async fn joined(app: &App<MockRuntime>, link: String) -> JoinedSpace {
	join_by_link(app.handle().clone(), link).await.expect("the join")
}

async fn connected(
	app: &App<MockRuntime>,
	joined: &JoinedSpace,
) -> Result<JoinedSpaceConnection, JoinedSpaceError> {
	joined_space_connect(app.handle().clone(), joined.id.clone()).await
}

async fn stored_members(app: &App<MockRuntime>, joined: &JoinedSpace) -> Vec<JoinedSpaceMember> {
	joined_space_members(app.state(), joined.id.clone()).await.expect("the members read")
}

async fn proxied(connection: &JoinedSpaceConnection) -> Value {
	let answer = reqwest::Client::new()
		.post(format!("{}/api/invoke/hosting_state", connection.host_url))
		.bearer_auth(&connection.token)
		.json(&json!({ "spaceId": SPACE }))
		.send()
		.await
		.expect("the proxy answers");
	assert_eq!(answer.status(), StatusCode::OK);
	answer.json().await.expect("a json answer")
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

#[test]
fn an_invited_member_joins_by_link_calls_sealed_and_answers_removed_by_rotation_once_removed() {
	run(async {
		let peers = Peers::hosting().await;
		let link = peers.invitation_link().await;
		let (member, _temporary) = peers.member("joined-v2-member", MEMBER_BEARER);
		let removed = Arc::new(Mutex::new(false));
		let hearing = Arc::clone(&removed);
		member.listen_any(REMOVED_EVENT, move |_| *hearing.lock().expect("the flag") = true);

		let joined = joined(&member, link).await;
		let members = until("the roster of two devices", || async {
			let members = stored_members(&member, &joined).await;
			(members.len() == 2).then_some(members)
		})
		.await;
		let connection = connected(&member, &joined).await.expect("the sealed call is answered");
		hosting_remove_member(peers.host.handle().clone(), SPACE.to_owned(), MEMBER.to_owned())
			.await
			.expect("the removal");
		peers.until("the eviction", || (*removed.lock().expect("the flag")).then_some(())).await;
		let after_removal = connected(&member, &joined).await.map(|found| found.id);

		assert_eq!(peers.relay.room().accepted, 1);
		assert_eq!(held_key_id(&member), Some(1));
		assert_eq!(
			members
				.iter()
				.map(|row| (row.role, row.fingerprint.clone(), row.is_present))
				.collect::<Vec<_>>(),
			vec![
				(JoinedSpaceRole::Host, words_of(&peers.host_keys()), true),
				(JoinedSpaceRole::Guest, words_of(&keys_of(&member)), true),
			]
		);
		assert_eq!(members[1].device_id, keys_of(&member).device_id().to_string());
		assert_eq!(connection.remote_space_id.as_deref(), Some(SPACE));
		assert_eq!(after_removal, Err(JoinedSpaceError::RemovedByRotation));
	});
}

#[test]
fn a_device_of_the_host_account_joins_without_acceptance_and_its_removal_rekeys_the_rest() {
	run(async {
		let peers = Peers::hosting().await;
		let (laptop, _laptop_files) = peers.member("joined-v2-laptop", OWNER_BEARER);
		let laptop_space = joined(&laptop, peers.device_link().await).await;
		let (member, _member_files) = peers.member("joined-v2-rekeyed", MEMBER_BEARER);
		let member_space = joined(&member, peers.invitation_link().await).await;
		connected(&laptop, &laptop_space).await.expect("the laptop is greeted");
		let member_connection =
			connected(&member, &member_space).await.expect("the member is greeted");

		let laptop_id = keys_of(&laptop).device_id().to_string();
		hosting_remove_device(peers.host.handle().clone(), SPACE.to_owned(), laptop_id)
			.await
			.expect("the device removal");
		peers.until("the rekey", || (held_key_id(&member) == Some(2)).then_some(())).await;
		let answered_under_the_new_key = proxied(&member_connection).await;
		peers.relay.closed_for(OWNER, SERVER_RESTARTING);
		let removed = until("the unanswered hello", || async {
			let connection = connected(&laptop, &laptop_space).await;
			connection.err().filter(|failure| *failure == JoinedSpaceError::RemovedByRotation)
		})
		.await;

		assert_eq!(peers.relay.room().accepted, 1);
		assert_eq!(held_key_id(&laptop), Some(1));
		assert_eq!(answered_under_the_new_key, json!({ "command": "hosting_state" }));
		assert_eq!(removed, JoinedSpaceError::RemovedByRotation);
	});
}

#[test]
fn a_link_that_does_not_parse_is_refused_before_any_network_call() {
	run(async {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let unreached = format!("http://{}", listener.local_addr().expect("the port is named"));
		drop(listener);
		let (member, _temporary) = signed_in("joined-v2-malformed", MEMBER_BEARER, &unreached);
		let short_key = format!("kiroshi://join#{INSTANCE}.{}.{}", "a".repeat(10), "b".repeat(43));

		for link in ["", "kiroshi://join#nope", short_key.as_str(), "https://evil.test/join#a.b.c"]
		{
			let refused = join_by_link(member.handle().clone(), link.to_owned()).await;
			assert_eq!(
				refused.map(|joined| joined.id),
				Err(JoinedSpaceError::MalformedLink),
				"{link}"
			);
		}
	});
}

#[test]
fn an_uninvited_account_a_withdrawn_invitation_a_used_link_and_an_absent_host_are_refused_typed() {
	run(async {
		let peers = Peers::hosting().await;
		let (first, _first_files) = peers.member("joined-v2-first", MEMBER_BEARER);
		let (second, _second_files) = peers.member("joined-v2-second", MEMBER_BEARER);
		let (laptop, _laptop_files) = peers.member("joined-v2-absent", OWNER_BEARER);
		let refusal = |app: &AppOfItsOwn, link: String| {
			let handle = app.handle().clone();
			async move { join_by_link(handle, link).await.map(|joined| joined.id) }
		};

		let uninvited = refusal(&first, peers.device_link().await).await;
		let link = peers.invitation_link().await;
		peers.relay.room().is_withdrawn = true;
		let withdrawn = refusal(&first, link.clone()).await;
		peers.relay.room().is_withdrawn = false;
		joined(&first, link.clone()).await;
		let used = refusal(&second, link).await;
		let device_link = peers.device_link().await;
		hosting_stop(peers.host.handle().clone(), SPACE.to_owned()).await.expect("the stop");
		peers.until("the host to leave", || peers.relay.room().host.is_none().then_some(())).await;
		let absent = refusal(&laptop, device_link).await;

		assert_eq!(uninvited, Err(JoinedSpaceError::NoInvitation { inviter_email: None }));
		assert_eq!(
			withdrawn,
			Err(JoinedSpaceError::NoInvitation {
				inviter_email: Some("owner@example.com".to_owned())
			})
		);
		assert_eq!(used, Err(JoinedSpaceError::LinkUsed));
		assert_eq!(absent, Err(JoinedSpaceError::HostOffline { id: INSTANCE.to_owned() }));
		assert_eq!(held_key_id(&second), None);
		assert_eq!(held_key_id(&laptop), None);
	});
}
