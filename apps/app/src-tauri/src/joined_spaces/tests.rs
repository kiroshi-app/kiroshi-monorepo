use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};
use tokio::net::TcpListener;

use super::commands::{
	joined_space_connect, joined_space_remove, joined_spaces_list, CHANGED_EVENT,
};
use super::contract::{JoinedSpace, JoinedSpaceError, JoinedSpaceState};
use super::members::joined_space_members;
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
use crate::invitations::{self, Invitations};
use crate::logging::contract::InstallKind;
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const INSTANCE: &str = "6f1c2b8e-7d3a-4b5e-9c1d-2a3b4c5d6e7f";
const INVITATION: &str = "inv_studio-1";
const MEMBER_BEARER: &str = "bearer-of-the-member";
const MEMBER_RELAY_ID: &str = "3b0c7a52-1d4e-4f8a-9b6c-0e2f4a6c8d10";
const PATIENCE: Duration = Duration::from_secs(20);
const POLL_EVERY: Duration = Duration::from_millis(50);
const HOST_ANSWER_BOUND: Duration = Duration::from_secs(2);
const HOST_ABSENT: u16 = 4002;

#[derive(Clone)]
enum HostSide {
	Absent,
	Silent,
	Answering(String),
}

struct Room {
	accept: (StatusCode, Value),
	accepted: Vec<String>,
	host: HostSide,
	joins: Vec<Value>,
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

	fn joins(&self) -> Vec<Value> {
		self.room().joins.clone()
	}

	async fn served(&self) -> String {
		let router = Router::new()
			.route("/me", get(me))
			.route("/devices/challenge", post(device_challenged))
			.route("/devices", post(device_registered))
			.route("/instances", get(instances_listed))
			.route("/instances/{id}/roster", get(roster_listed))
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
		json!({ "id": MEMBER_RELAY_ID, "createdAt": "2026-10-01T00:00:00.000Z", "transferred": false }),
	)
}

async fn instances_listed(Served(relay): Served<Relay>) -> Response {
	let is_joined = !relay.room().accepted.is_empty();
	let listed = if is_joined { json!([{ "id": INSTANCE, "name": "Studio" }]) } else { json!([]) };
	answered_json(StatusCode::OK, listed)
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
	upgrade.on_upgrade(move |socket| membered(relay, socket))
}

async fn membered(relay: Relay, mut socket: WebSocket) {
	while let Some(Ok(frame)) = socket.recv().await {
		let Message::Text(text) = frame else {
			continue;
		};
		let frame: Value = serde_json::from_str(text.as_str()).expect("a json member frame");
		if frame.get("join").is_none() {
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
			HostSide::Silent => continue,
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
	_temporary: Vec<RemovedOnDrop>,
}

impl Member {
	async fn new(name: &str) -> Self {
		let relay = Relay::new();
		let cloud = relay.served().await;
		Self::over(name, relay, &cloud)
	}

	fn over(name: &str, relay: Relay, cloud: &str) -> Self {
		let database = temp_dir();
		let root = temp_dir();
		store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, MEMBER_BEARER)
			.expect("the bearer is kept");
		let app = an_app_of_its_own(name, mock_builder());
		app.manage::<DatabaseState>(Ok(db::open(&database)));
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
		let profile = app.path().app_data_dir().expect("the data folder resolves");
		let identifier = app.config().identifier.clone();
		app.manage(SpaceKeys::new(InstallKind::Dev, identifier, Some(profile)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), cloud));
		app.manage(RelayGuests::new(cloud).answering_within(HOST_ANSWER_BOUND));
		app.manage(Invitations::new(cloud));
		Self { app, relay, _temporary: vec![database, root] }
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

	fn is_waiting(&self, id: &str) -> bool {
		self.app.state::<RelayGuests>().is_waiting(id)
	}

	fn device(&self) -> DeviceKeys {
		let state = self.app.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the device keys").secret())
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

fn changes_heard(app: &App<MockRuntime>) -> Arc<Mutex<Vec<Value>>> {
	let heard = Arc::new(Mutex::new(Vec::new()));
	let hearing = Arc::clone(&heard);
	app.listen_any(CHANGED_EVENT, move |event| {
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
		member.relay.hosting(HostSide::Answering(host.joined()));

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
		assert_eq!(member.relay.joins(), vec![json!({ "v": 2, "instance": INSTANCE, "join": {} })]);
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
		member.relay.hosting(HostSide::Answering(member.host().joined()));
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
		member.relay.hosting(HostSide::Answering(member.host().joined_without_the_member()));

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
		member.relay.hosting(HostSide::Answering(member.host().joined()));

		let refused = member.accepted().await.map(|joined| joined.id);

		assert_eq!(refused, Err(JoinedSpaceError::BadSignature));
		assert!(held.is_some());
		assert_eq!(member.held_roster().await, held);
	});
}

#[test]
fn an_absent_a_pending_or_a_silent_host_stores_the_joined_space_waiting_for_its_host() {
	run(async {
		for case in 0..3 {
			let member = Member::new("join-waiting").await;
			let pending = HostSide::Answering(member.host().pending());
			member.relay.hosting([HostSide::Absent, pending, HostSide::Silent][case].clone());

			let joined = member.accepted().await.expect("the join waits");
			let connection = joined_space_connect(member.app.handle().clone(), joined.id.clone())
				.await
				.map(|found| found.id);

			assert_eq!(joined.state, JoinedSpaceState::WaitingForHost, "case {case}");
			assert_eq!(member.listed().await, vec![joined.clone()], "case {case}");
			assert_eq!(
				connection,
				Err(JoinedSpaceError::WaitingForHost { id: joined.id }),
				"case {case}"
			);
			assert_eq!(member.held_key_id(), None, "case {case}");
		}
	});
}

#[test]
fn a_waiting_space_resends_its_join_on_every_connection_and_comes_online_once_answered() {
	run(async {
		let member = Member::new("join-flip").await;
		let heard = changes_heard(&member.app);
		let joined = member.accepted().await.expect("the join waits");
		let answer = member.host().joined();

		relay::reconciled(member.app.handle()).await;
		until("a join resent on a second connection", || async {
			(member.relay.joins().len() >= 2).then_some(())
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
		assert!(joins.len() >= 3, "{joins:?}");
		assert!(joins
			.iter()
			.all(|join| *join == json!({ "v": 2, "instance": INSTANCE, "join": {} })));
		assert_eq!(member.listed().await[0].state, JoinedSpaceState::Online);
	});
}

#[test]
fn a_waiting_socket_stops_on_removal_and_on_sign_out() {
	run(async {
		let member = Member::new("join-stopped").await;
		member.relay.hosting(HostSide::Answering(member.host().pending()));
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
