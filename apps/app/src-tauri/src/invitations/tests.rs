use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::{FutureExt, StreamExt};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, watch};

use super::contract::{InvitationError, CHANGED_EVENT};
use super::{accept, decline, read, resumed, Invitations};
use crate::account::contract::{
	AccountState, SignedOutReason, CHANGED_EVENT as ACCOUNT_CHANGED_EVENT,
};
use crate::account::session::{restore, sign_out, AccountSession};
use crate::db::connection::temp_dir;
use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};
use crate::db::{self, DatabaseError, DatabaseState};
use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::joined_spaces::commands::{
	joined_space_connect, CHANGED_EVENT as JOINED_CHANGED, RECONNECTED_EVENT, REMOVED_EVENT,
};
use crate::joined_spaces::contract::{JoinedSpaceConnection, JoinedSpaceError};
use crate::joined_spaces::relay::{reconciled, RelayGuests};
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const BEARER: &str = "bearer-that-never-leaves";
const INSTANCE: &str = "instance-1";
const SHARED_SPACE: &str = "shared-space-of-the-host";
const PATIENCE: Duration = Duration::from_secs(10);
const POLL_EVERY: Duration = Duration::from_millis(100);

#[derive(Clone)]
struct Cloud {
	invitations: Arc<Mutex<Value>>,
	invitations_status: Arc<Mutex<StatusCode>>,
	instances: Arc<Mutex<(StatusCode, Value)>>,
	instances_read: Arc<AtomicUsize>,
	invitations_read: Arc<AtomicUsize>,
	call_answer: Arc<Mutex<(StatusCode, Value)>>,
	called: Arc<Mutex<Vec<String>>>,
	unknown_instances: Arc<Mutex<Vec<String>>>,
	is_call_open: Arc<watch::Sender<bool>>,
	is_member_relay_open: Arc<watch::Sender<bool>>,
	member_relays_asked: Arc<AtomicUsize>,
	is_sign_out_open: Arc<watch::Sender<bool>>,
	sign_outs_asked: Arc<AtomicUsize>,
	is_refusing_members: Arc<AtomicBool>,
	members: mpsc::UnboundedSender<WebSocket>,
	noticed: Arc<watch::Sender<()>>,
}

async fn opened(gate: &watch::Sender<bool>) {
	gate.subscribe().wait_for(|is_open| *is_open).await.map(drop).expect("the cloud opens");
}

fn an_invitation(instance_id: &str, name: &str) -> Value {
	json!({
		"instanceId": instance_id,
		"instanceName": name,
		"inviterEmail": "owner@example.com",
		"invitedAt": "2026-10-01T00:00:00.000Z"
	})
}

fn an_instance(id: &str, name: &str) -> Value {
	json!({ "id": id, "name": name, "role": "member", "createdAt": "2026-10-01T00:00:00.000Z", "online": true })
}

fn answered_json(status: StatusCode, body: &Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

fn refusal(status: StatusCode, code: &str) -> (StatusCode, Value) {
	(status, json!({ "error": { "code": code, "message": code, "status": status.as_u16() } }))
}

fn is_bearer(headers: &HeaderMap) -> bool {
	headers.get("authorization").and_then(|value| value.to_str().ok())
		== Some(&format!("Bearer {BEARER}"))
}

async fn invitations_listed(Served(cloud): Served<Cloud>, headers: HeaderMap) -> Response {
	if !is_bearer(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let status = *cloud.invitations_status.lock().expect("the cloud");
	let invitations = cloud.invitations.lock().expect("the cloud").clone();
	cloud.invitations_read.fetch_add(1, Ordering::SeqCst);
	cloud.noticed.send_replace(());
	answered_json(status, &invitations)
}

async fn instances_listed(Served(cloud): Served<Cloud>, headers: HeaderMap) -> Response {
	if !is_bearer(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	cloud.instances_read.fetch_add(1, Ordering::SeqCst);
	cloud.noticed.send_replace(());
	let (status, instances) = cloud.instances.lock().expect("the cloud").clone();
	answered_json(status, &instances)
}

async fn me(headers: HeaderMap) -> Response {
	if !is_bearer(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let account = json!({ "id": "u1", "email": "member@example.com", "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" });
	answered_json(StatusCode::OK, &account)
}

async fn invitation_called(
	Served(cloud): Served<Cloud>,
	Path((instance_id, verb)): Path<(String, String)>,
	headers: HeaderMap,
) -> Response {
	if !is_bearer(&headers) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	cloud.called.lock().expect("the cloud").push(format!("{verb} {instance_id}"));
	cloud.noticed.send_replace(());
	opened(&cloud.is_call_open).await;
	let (status, body) = cloud.call_answer.lock().expect("the cloud").clone();
	if status == StatusCode::NO_CONTENT {
		return status.into_response();
	}
	answered_json(status, &body)
}

async fn member_relay(
	Served(cloud): Served<Cloud>,
	Path(instance_id): Path<String>,
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	if !is_bearer(&headers) || cloud.is_refusing_members.load(Ordering::SeqCst) {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	if cloud.unknown_instances.lock().expect("the cloud").contains(&instance_id) {
		return StatusCode::NOT_FOUND.into_response();
	}
	cloud.member_relays_asked.fetch_add(1, Ordering::SeqCst);
	cloud.noticed.send_replace(());
	opened(&cloud.is_member_relay_open).await;
	upgrade.on_upgrade(move |socket| async move {
		cloud.members.send(socket).expect("the test holds the member sockets");
	})
}

async fn signed_out_of_the_cloud(Served(cloud): Served<Cloud>) -> StatusCode {
	cloud.sign_outs_asked.fetch_add(1, Ordering::SeqCst);
	cloud.noticed.send_replace(());
	opened(&cloud.is_sign_out_open).await;
	StatusCode::OK
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

struct Harness {
	app: AppOfItsOwn,
	cloud: Cloud,
	members: mpsc::UnboundedReceiver<WebSocket>,
	heard: Arc<Mutex<Vec<(String, String)>>>,
	root: RemovedOnDrop,
	_database: RemovedOnDrop,
}

impl Harness {
	async fn new(bearer: Option<&str>) -> Self {
		Self::over(bearer, None, Ok(())).await
	}

	async fn over(
		bearer: Option<&str>,
		api_url: Option<String>,
		database: Result<(), DatabaseError>,
	) -> Self {
		Self::polling(bearer, api_url, database, POLL_EVERY).await
	}

	async fn polling(
		bearer: Option<&str>,
		api_url: Option<String>,
		database: Result<(), DatabaseError>,
		every: Duration,
	) -> Self {
		let (members_in, members) = mpsc::unbounded_channel();
		let cloud = Cloud {
			invitations: Arc::new(Mutex::new(json!([an_invitation(INSTANCE, "Studio")]))),
			invitations_status: Arc::new(Mutex::new(StatusCode::OK)),
			instances: Arc::new(Mutex::new((StatusCode::SERVICE_UNAVAILABLE, json!([])))),
			instances_read: Arc::default(),
			invitations_read: Arc::default(),
			call_answer: Arc::new(Mutex::new((
				StatusCode::OK,
				json!({ "id": INSTANCE, "name": "Studio", "role": "member", "createdAt": "2026-10-01T00:00:00.000Z" }),
			))),
			called: Arc::default(),
			unknown_instances: Arc::default(),
			is_call_open: Arc::new(watch::channel(true).0),
			is_member_relay_open: Arc::new(watch::channel(true).0),
			member_relays_asked: Arc::default(),
			is_sign_out_open: Arc::new(watch::channel(true).0),
			sign_outs_asked: Arc::default(),
			is_refusing_members: Arc::default(),
			members: members_in,
			noticed: Arc::new(watch::channel(()).0),
		};
		let served_url = served(
			Router::new()
				.route("/invitations", get(invitations_listed))
				.route("/invitations/{id}/{verb}", post(invitation_called))
				.route("/instances", get(instances_listed))
				.route("/me", get(me))
				.route("/instances/{id}/relay/member", get(member_relay))
				.route("/api/auth/sign-out", post(signed_out_of_the_cloud))
				.with_state(cloud.clone()),
		)
		.await;
		let api_url = api_url.unwrap_or(served_url);
		let root = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-invitations-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		let app = an_app_of_its_own("invitations", mock_builder());
		let database_dir = temp_dir();
		let database = database.map(|()| db::open(&database_dir));
		app.manage::<DatabaseState>(database);
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &api_url));
		app.manage(Invitations::new(&api_url).polling_every(every));
		app.manage(RelayGuests::new(&api_url));
		let heard = Arc::new(Mutex::new(Vec::new()));
		for event in [CHANGED_EVENT, JOINED_CHANGED, REMOVED_EVENT, RECONNECTED_EVENT] {
			let hearing = Arc::clone(&heard);
			let noticing = Arc::clone(&cloud.noticed);
			app.listen(event, move |heard| {
				let payload = heard.payload().to_owned();
				hearing.lock().expect("the events").push((event.to_owned(), payload));
				noticing.send_replace(());
			});
		}
		let noticing = Arc::clone(&cloud.noticed);
		app.listen(ACCOUNT_CHANGED_EVENT, move |_| {
			noticing.send_replace(());
		});
		Self { app, cloud, members, heard, root, _database: database_dir }
	}

	fn heard(&self, event: &str) -> Vec<Value> {
		self.heard
			.lock()
			.expect("the events")
			.iter()
			.filter(|(name, _)| name == event)
			.map(|(_, payload)| serde_json::from_str(payload).expect("a json payload"))
			.collect()
	}

	fn heard_names(&self) -> Vec<String> {
		self.heard.lock().expect("the events").iter().map(|(name, _)| name.clone()).collect()
	}

	fn every_payload(&self) -> String {
		self.heard.lock().expect("the events").iter().map(|(_, payload)| payload.as_str()).collect()
	}

	async fn noticed(&self, noticed: &mut watch::Receiver<()>, awaited: &str) {
		tokio::time::timeout(PATIENCE, noticed.changed())
			.await
			.unwrap_or_else(|_| panic!("{awaited} was not noticed within {PATIENCE:?}"))
			.expect("the harness listens");
	}

	async fn noticed_until<T>(&self, awaited: &str, found: impl Fn() -> Option<T>) -> T {
		let mut noticed = self.cloud.noticed.subscribe();
		loop {
			if let Some(found) = found() {
				return found;
			}
			self.noticed(&mut noticed, awaited).await;
		}
	}

	async fn heard_until(&self, event: &str, count: usize) -> Vec<Value> {
		let heard = || Some(self.heard(event)).filter(|heard| heard.len() >= count);
		self.noticed_until(&format!("{event} heard {count} times"), heard).await
	}

	fn invitations_read(&self) -> usize {
		self.cloud.invitations_read.load(Ordering::SeqCst)
	}

	fn member_relays_asked(&self) -> usize {
		self.cloud.member_relays_asked.load(Ordering::SeqCst)
	}

	fn answering(&self, status: StatusCode, body: Value) {
		*self.cloud.call_answer.lock().expect("the cloud") = (status, body);
	}

	fn listing(&self, instances: Value) {
		*self.cloud.instances.lock().expect("the cloud") = (StatusCode::OK, instances);
	}

	fn instances_read(&self) -> usize {
		self.cloud.instances_read.load(Ordering::SeqCst)
	}

	async fn stored(&self) -> Vec<JoinedSpace> {
		let state = self.app.state::<DatabaseState>();
		state.as_ref().expect("the database").joined_spaces().list().await.expect("the list")
	}

	async fn stored_until(&self, is_done: impl Fn(&[JoinedSpace]) -> bool) -> Vec<JoinedSpace> {
		let mut noticed = self.cloud.noticed.subscribe();
		loop {
			let stored = self.stored().await;
			if is_done(&stored) {
				return stored;
			}
			self.noticed(&mut noticed, "the awaited joined spaces").await;
		}
	}

	async fn member(&mut self) -> WebSocket {
		tokio::time::timeout(PATIENCE, self.members.recv())
			.await
			.expect("the guest opened the member relay in time")
			.expect("the relay is up")
	}

	async fn accepted(&self) -> String {
		accept(self.app.handle(), INSTANCE.to_owned()).await.expect("the accept").id
	}

	async fn connect(&self, id: &str) -> Result<JoinedSpaceConnection, JoinedSpaceError> {
		connect(&self.app, id).await
	}
}

async fn connect(
	app: &App<MockRuntime>,
	id: &str,
) -> Result<JoinedSpaceConnection, JoinedSpaceError> {
	joined_space_connect(app.handle().clone(), app.state(), id.to_owned()).await
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

async fn call(member: &mut WebSocket) -> Value {
	loop {
		let frame = tokio::time::timeout(PATIENCE, member.recv())
			.await
			.expect("a frame in time")
			.expect("the socket is open")
			.expect("a readable frame");
		if let Message::Text(text) = frame {
			return serde_json::from_str(text.as_str()).expect("a json frame");
		}
	}
}

async fn send(member: &mut WebSocket, frame: Value) {
	member.send(Message::Text(frame.to_string().into())).await.expect("the frame leaves");
}

async fn closed_with(member: &mut WebSocket, code: u16) {
	let close = CloseFrame { code, reason: "".into() };
	member.send(Message::Close(Some(close))).await.expect("the close leaves");
}

async fn shared_space_answered(member: &mut WebSocket) {
	let asked = call(member).await;
	assert_eq!(asked["command"], "relay_shared_space");
	send(member, json!({ "id": asked["id"], "status": 200, "body": { "spaceId": SHARED_SPACE } }))
		.await;
}

async fn proxied(connection: &JoinedSpaceConnection, command: &str) -> reqwest::Response {
	reqwest::Client::new()
		.post(format!("{}/api/invoke/{command}", connection.host_url))
		.bearer_auth(&connection.token)
		.json(&json!({ "spaceId": SHARED_SPACE }))
		.send()
		.await
		.expect("the proxy answers")
}

async fn connected(harness: &mut Harness, id: &str) -> (JoinedSpaceConnection, WebSocket) {
	let Harness { app, members, .. } = harness;
	let connecting = connect(app, id);
	let mut member = None;
	let answering = async {
		let mut socket = members.recv().await.expect("the guest opened the relay");
		shared_space_answered(&mut socket).await;
		member = Some(socket);
	};
	let (connection, ()) = tokio::join!(connecting, answering);
	(connection.expect("the connection"), member.expect("the member socket"))
}

#[test]
fn the_pending_invitations_are_read_oldest_first_as_the_cloud_answers_them() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		*harness.cloud.invitations.lock().expect("the cloud") =
			json!([an_invitation("i-old", "Old"), an_invitation("i-new", "New")]);

		let listed = read(harness.app.handle()).await.expect("the list");

		assert_eq!(
			serde_json::to_value(&listed).expect("serialized"),
			json!([an_invitation("i-old", "Old"), an_invitation("i-new", "New")])
		);
		assert_eq!(harness.heard(CHANGED_EVENT).len(), 1);
	});
}

#[test]
fn every_refusal_of_the_cloud_is_answered_by_its_kind() {
	run(async {
		let unsigned = Harness::new(None).await;
		assert_eq!(read(unsigned.app.handle()).await, Err(InvitationError::NotSignedIn));
		assert_eq!(
			accept(unsigned.app.handle(), INSTANCE.to_owned()).await.map(|joined| joined.id),
			Err(InvitationError::NotSignedIn)
		);

		let revoked = Harness::new(Some("a-bearer-the-cloud-forgot")).await;
		assert_eq!(read(revoked.app.handle()).await, Err(InvitationError::NotSignedIn));

		let offline = Harness::over(Some(BEARER), Some(a_closed_port().await), Ok(())).await;
		assert!(matches!(read(offline.app.handle()).await, Err(InvitationError::Offline { .. })));

		let harness = Harness::new(Some(BEARER)).await;
		*harness.cloud.invitations_status.lock().expect("the cloud") =
			StatusCode::SERVICE_UNAVAILABLE;
		assert!(matches!(
			read(harness.app.handle()).await,
			Err(InvitationError::ServersUnreachable { .. })
		));
		*harness.cloud.invitations_status.lock().expect("the cloud") = StatusCode::OK;
		*harness.cloud.invitations.lock().expect("the cloud") = json!({ "not": "a list" });
		assert!(matches!(
			read(harness.app.handle()).await,
			Err(InvitationError::ServersUnreachable { .. })
		));

		harness.answering(StatusCode::BAD_GATEWAY, json!({}));
		assert!(matches!(
			decline(harness.app.handle(), INSTANCE.to_owned()).await,
			Err(InvitationError::ServersUnreachable { .. })
		));
		for (answer, expected) in [
			(refusal(StatusCode::GONE, "INVITATION_WITHDRAWN"), InvitationError::Withdrawn),
			(refusal(StatusCode::NOT_FOUND, "NOT_FOUND"), InvitationError::UnknownInvitation),
			(refusal(StatusCode::UNAUTHORIZED, "UNAUTHORIZED"), InvitationError::NotSignedIn),
		] {
			harness.answering(answer.0, answer.1);
			assert_eq!(
				accept(harness.app.handle(), INSTANCE.to_owned()).await.map(|joined| joined.id),
				Err(expected.clone())
			);
			assert_eq!(decline(harness.app.handle(), INSTANCE.to_owned()).await, Err(expected));
		}
		assert!(harness.stored().await.is_empty());
		assert!(harness.heard(JOINED_CHANGED).is_empty());
	});
}

#[test]
fn an_accept_the_store_cannot_keep_is_answered_storage() {
	run(async {
		let harness = Harness::over(Some(BEARER), None, Err(DatabaseError::AppDataDir)).await;

		let refused = accept(harness.app.handle(), INSTANCE.to_owned()).await;

		assert!(matches!(refused, Err(InvitationError::Storage { .. })), "{refused:?}");
	});
}

#[test]
fn an_accept_writes_one_relay_entry_named_by_the_instance_and_announces_it() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;

		let joined = accept(harness.app.handle(), INSTANCE.to_owned()).await.expect("the accept");

		assert_eq!(joined.name, "Studio");
		assert_eq!(
			harness.stored().await,
			vec![JoinedSpace {
				id: joined.id.clone(),
				reach: JoinedReach::Relay { instance_id: INSTANCE.to_owned() },
				remote_space_id: None,
				name: "Studio".to_owned(),
			}]
		);
		assert_eq!(harness.heard(JOINED_CHANGED), vec![json!({ "id": joined.id })]);
		assert_eq!(
			harness.cloud.called.lock().expect("the cloud").clone(),
			vec!["accept instance-1"]
		);
	});
}

#[test]
fn an_accept_answered_already_joined_writes_the_entry_once_under_the_same_id() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		read(harness.app.handle()).await.expect("the invitations are read");
		harness.answering(StatusCode::CONFLICT, refusal(StatusCode::CONFLICT, "ALREADY_JOINED").1);

		let first = accept(harness.app.handle(), INSTANCE.to_owned()).await.expect("the accept");
		let second = accept(harness.app.handle(), INSTANCE.to_owned()).await.expect("the replay");

		assert_eq!(first, second);
		assert_eq!(first.name, "Studio");
		assert_eq!(harness.stored().await.len(), 1);
		assert_eq!(harness.heard(JOINED_CHANGED).len(), 2);
	});
}

#[test]
fn a_decline_leaves_the_joined_spaces_unchanged() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		harness.answering(StatusCode::NO_CONTENT, Value::Null);

		decline(harness.app.handle(), INSTANCE.to_owned()).await.expect("the decline");

		assert!(harness.stored().await.is_empty());
		assert!(harness.heard(JOINED_CHANGED).is_empty());
		assert_eq!(
			harness.cloud.called.lock().expect("the cloud").clone(),
			vec!["decline instance-1"]
		);
	});
}

#[test]
fn the_poll_announces_each_change_once_and_sign_out_stops_it_with_an_empty_list() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;

		resumed(harness.app.handle());
		let first = harness.heard_until(CHANGED_EVENT, 1).await;
		let read_at_first = harness.invitations_read();
		let unchanged_poll_settled =
			|| (harness.invitations_read() >= read_at_first + 2).then_some(());
		harness.noticed_until("a poll after an unchanged one", unchanged_poll_settled).await;
		assert_eq!(harness.heard(CHANGED_EVENT).len(), 1);
		*harness.cloud.invitations.lock().expect("the cloud") = json!([]);
		let changed = harness.heard_until(CHANGED_EVENT, 2).await;
		sign_out(harness.app.handle()).await.expect("the sign out");
		*harness.cloud.invitations.lock().expect("the cloud") =
			json!([an_invitation("i-late", "Late")]);

		assert_eq!(first[0], json!({ "invitations": [an_invitation(INSTANCE, "Studio")] }));
		assert_eq!(changed[1], json!({ "invitations": [] }));
		assert_eq!(
			harness.heard(CHANGED_EVENT),
			vec![
				json!({ "invitations": [an_invitation(INSTANCE, "Studio")] }),
				json!({ "invitations": [] }),
				json!({ "invitations": [] }),
			]
		);
	});
}

#[test]
fn a_relay_entry_is_reached_through_the_loopback_proxy_end_to_end() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;

		let (connection, mut member) = connected(&mut harness, &id).await;

		assert!(connection.host_url.starts_with("http://127.0.0.1:"));
		assert_eq!(connection.remote_space_id.as_deref(), Some(SHARED_SPACE));
		assert!(connection.token.len() >= 32);
		assert_eq!(harness.stored().await[0].remote_space_id.as_deref(), Some(SHARED_SPACE));

		let events_url = format!(
			"{}/api/events?token={}",
			connection.host_url.replacen("http", "ws", 1),
			connection.token
		);
		let (mut events, _) =
			tokio_tungstenite::connect_async(events_url).await.expect("the events socket opens");
		let invoking = proxied(&connection, "conversation_list");
		let answering = async {
			let invoked = call(&mut member).await;
			assert_eq!(invoked["command"], "conversation_list");
			assert_eq!(invoked["args"], json!({ "spaceId": SHARED_SPACE }));
			send(
				&mut member,
				json!({ "id": invoked["id"], "status": 200, "body": [{ "id": "c1" }] }),
			)
			.await;
		};
		let (answered, ()) = tokio::join!(invoking, answering);
		assert_eq!(answered.status(), StatusCode::OK);
		assert_eq!(answered.json::<Value>().await.expect("a json answer"), json!([{ "id": "c1" }]));

		let frame = json!({ "event": "conversation://changed", "payload": { "id": "c1" } });
		send(&mut member, json!({ "event": frame })).await;
		let forwarded = tokio::time::timeout(PATIENCE, events.next())
			.await
			.expect("an event in time")
			.expect("the socket is open")
			.expect("a readable event");
		assert_eq!(
			serde_json::from_str::<Value>(forwarded.to_text().expect("a text event"))
				.expect("a json event"),
			frame
		);

		let refused = reqwest::Client::new()
			.post(format!("{}/api/invoke/conversation_list", connection.host_url))
			.bearer_auth("not-the-token")
			.send()
			.await
			.expect("the proxy answers");
		assert_eq!(refused.status(), StatusCode::UNAUTHORIZED);
		let again = harness.connect(&id).await.expect("the second connection");
		assert_eq!((again.host_url, again.token), (connection.host_url, connection.token.clone()));
		assert!(!harness.every_payload().contains(&connection.token));
		assert!(!harness.every_payload().contains(BEARER));
	});
}

#[test]
fn a_host_offline_before_the_shared_space_is_known_answers_host_offline_and_keeps_the_entry() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;

		let Harness { app, members, .. } = &mut harness;
		let connecting = connect(app, &id);
		let closing = async {
			let mut member = members.recv().await.expect("the guest opened the relay");
			let asked = call(&mut member).await;
			assert_eq!(asked["command"], "relay_shared_space");
			closed_with(&mut member, 4002).await;
		};
		let (refused, ()) = tokio::join!(connecting, closing);

		assert_eq!(refused, Err(JoinedSpaceError::HostOffline { id: id.clone() }));
		assert_eq!(harness.stored().await.len(), 1);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
	});
}

#[test]
fn a_live_relay_closed_4002_answers_503_reopens_and_keeps_the_entry() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let (connection, mut member) = connected(&mut harness, &id).await;

		closed_offline(&harness, &id, &mut member, &connection).await;
		let mut reopened = harness.member().await;

		let invoking = proxied(&connection, "conversation_list");
		let answering = async {
			let invoked = call(&mut reopened).await;
			send(&mut reopened, json!({ "id": invoked["id"], "status": 200, "body": [] })).await;
		};
		let (answered, ()) = tokio::join!(invoking, answering);

		assert_eq!(answered.status(), StatusCode::OK);
		assert_eq!(harness.stored().await.len(), 1);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
	});
}

async fn closed_offline(
	harness: &Harness,
	id: &str,
	member: &mut WebSocket,
	connection: &JoinedSpaceConnection,
) {
	let dropped = harness.app.state::<RelayGuests>().link_dropped(id);
	closed_with(member, 4002).await;
	tokio::time::timeout(PATIENCE, dropped).await.expect("the link dropped in time");
	let offline = proxied(connection, "conversation_list").await;
	assert_eq!(offline.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[test]
fn every_open_of_the_member_relay_announces_one_reconnection_and_none_while_down() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let (connection, mut member) = connected(&mut harness, &id).await;
		assert_eq!(harness.heard_until(RECONNECTED_EVENT, 1).await, vec![json!({ "id": id })]);

		harness.cloud.is_member_relay_open.send_replace(false);
		let asked_before = harness.member_relays_asked();
		closed_offline(&harness, &id, &mut member, &connection).await;
		assert_eq!(harness.heard(RECONNECTED_EVENT).len(), 1, "announced while down");
		let is_reconnecting = || (harness.member_relays_asked() > asked_before).then_some(());
		harness.noticed_until("a reconnection attempt", is_reconnecting).await;
		assert_eq!(harness.heard(RECONNECTED_EVENT).len(), 1, "announced while reconnecting");

		harness.cloud.is_member_relay_open.send_replace(true);
		let mut reopened = harness.member().await;
		harness.heard_until(RECONNECTED_EVENT, 2).await;
		let invoking = proxied(&connection, "conversation_list");
		let answering = async {
			let invoked = call(&mut reopened).await;
			send(&mut reopened, json!({ "id": invoked["id"], "status": 200, "body": [] })).await;
		};
		tokio::join!(invoking, answering);

		assert_eq!(harness.heard(RECONNECTED_EVENT), vec![json!({ "id": id }); 2]);
	});
}

#[test]
fn a_row_the_host_wrote_while_the_link_was_down_answers_a_call_made_on_the_reconnection() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let (reconnected_in, mut reconnected) = mpsc::unbounded_channel();
		harness.app.listen(RECONNECTED_EVENT, move |_| {
			reconnected_in.send(()).expect("the test hears the reconnections");
		});
		let id = harness.accepted().await;
		let (connection, mut member) = connected(&mut harness, &id).await;
		reconnected.recv().await.expect("the first open is announced");

		closed_offline(&harness, &id, &mut member, &connection).await;
		let host_rows = json!([{ "id": "c1" }, { "id": "written-while-down" }]);

		let reading = async {
			tokio::time::timeout(PATIENCE, reconnected.recv())
				.await
				.expect("the reopen is announced in time")
				.expect("the reopen is announced");
			proxied(&connection, "conversation_list").await
		};
		let answering = async {
			let mut reopened = harness.member().await;
			let invoked = call(&mut reopened).await;
			send(&mut reopened, json!({ "id": invoked["id"], "status": 200, "body": host_rows }))
				.await;
		};
		let (answered, ()) = tokio::join!(reading, answering);

		assert_eq!(answered.status(), StatusCode::OK);
		assert_eq!(
			answered.json::<Value>().await.expect("a json answer"),
			json!([{ "id": "c1" }, { "id": "written-while-down" }])
		);
	});
}

#[test]
fn every_invoke_sent_right_after_connecting_a_learned_entry_gets_the_host_answer() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let state = harness.app.state::<DatabaseState>();
		let repository = state.as_ref().expect("the database").joined_spaces();
		repository.learned(id.clone(), SHARED_SPACE.to_owned()).await.expect("the shared space");
		harness.cloud.is_member_relay_open.send_replace(false);

		let connection = harness.connect(&id).await.expect("the connection");
		let invoking = futures_util::future::join_all(
			(0..3).map(|_| proxied(&connection, "conversation_list")),
		);
		let answering = async {
			let is_asked = || (harness.member_relays_asked() > 0).then_some(());
			harness.noticed_until("the member relay open", is_asked).await;
			harness.cloud.is_member_relay_open.send_replace(true);
			let mut member = harness.member().await;
			for _ in 0..3 {
				let invoked = call(&mut member).await;
				send(&mut member, json!({ "id": invoked["id"], "status": 200, "body": [] })).await;
			}
		};
		let (answers, ()) = tokio::join!(invoking, answering);

		assert_eq!(connection.remote_space_id.as_deref(), Some(SHARED_SPACE));
		let statuses: Vec<StatusCode> = answers.iter().map(reqwest::Response::status).collect();
		assert_eq!(statuses, vec![StatusCode::OK; 3]);
	});
}

#[test]
fn a_membership_ended_4003_removes_the_entry_and_announces_its_removal() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let (connection, mut member) = connected(&mut harness, &id).await;

		closed_with(&mut member, 4003).await;
		let stored = harness.stored_until(<[JoinedSpace]>::is_empty).await;
		let is_closed = proxy_closed(&connection).await;
		let removed = harness.heard_until(REMOVED_EVENT, 1).await;

		assert!(stored.is_empty());
		assert_eq!(removed, vec![json!({ "id": id, "name": "Studio" })]);
		let names = harness.heard_names();
		let changed_at = names.iter().rposition(|name| name == JOINED_CHANGED).expect("changed");
		let removed_at = names.iter().position(|name| name == REMOVED_EVENT).expect("removed");
		assert!(changed_at < removed_at);
		assert!(is_closed, "the proxy of a removed entry still answers");
	});
}

#[test]
fn an_instance_the_relay_answers_404_on_open_removes_the_entry_with_the_removed_event() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		harness.cloud.unknown_instances.lock().expect("the cloud").push(INSTANCE.to_owned());

		let refused = harness.connect(&id).await;

		assert_eq!(refused, Err(JoinedSpaceError::UnknownJoinedSpace { id: id.clone() }));
		assert!(harness.stored_until(<[JoinedSpace]>::is_empty).await.is_empty());
		assert_eq!(
			harness.heard_until(REMOVED_EVENT, 1).await,
			vec![json!({ "id": id, "name": "Studio" })]
		);
	});
}

#[test]
fn sign_out_drops_every_relay_entry_and_closes_the_proxy_of_the_connected_one() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let relay_id = harness.accepted().await;
		let (connection, _member) = connected(&mut harness, &relay_id).await;
		let state = harness.app.state::<DatabaseState>();
		let joined_spaces = state.as_ref().expect("the database").joined_spaces();
		let planted = a_relay_entry("planted-1", "i-planted", "Planted");
		joined_spaces.join(planted).await.expect("the planted entry");

		sign_out(harness.app.handle()).await.expect("the sign out");

		let stored = harness.stored().await;
		assert!(stored.is_empty(), "{stored:?}");
		let changed = harness.heard(JOINED_CHANGED);
		assert!(changed.ends_with(&[json!({ "id": relay_id }), json!({ "id": "planted-1" })]));
		assert!(harness.heard(REMOVED_EVENT).is_empty());
		assert!(reqwest::Client::new()
			.post(format!("{}/api/invoke/conversation_list", connection.host_url))
			.bearer_auth(&connection.token)
			.send()
			.await
			.is_err());
		assert!(!harness.every_payload().contains(BEARER));
	});
}

fn is_guest_running(harness: &Harness, id: &str) -> bool {
	harness.app.state::<RelayGuests>().is_running(id)
}

async fn proxy_closed(connection: &JoinedSpaceConnection) -> bool {
	let refused = async {
		loop {
			let attempt = reqwest::Client::new()
				.post(format!("{}/api/invoke/conversation_list", connection.host_url))
				.bearer_auth(&connection.token)
				.send()
				.await;
			if attempt.is_err() {
				return;
			}
			tokio::task::yield_now().await;
		}
	};
	tokio::time::timeout(PATIENCE, refused).await.is_ok()
}

fn stopping(harness: &Harness, id: &str) -> watch::Receiver<bool> {
	harness.app.state::<RelayGuests>().stopping(id).expect("a guest runs")
}

async fn guest_ended(harness: &Harness, id: &str, mut stopping: watch::Receiver<bool>) -> bool {
	let ended = async {
		while stopping.changed().await.is_ok() {
			if *stopping.borrow() {
				return;
			}
		}
	};
	tokio::time::timeout(PATIENCE, ended).await.is_ok() && !is_guest_running(harness, id)
}

#[test]
fn an_accept_in_flight_during_sign_out_answers_not_signed_in_and_leaves_no_relay_entry() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		harness.cloud.is_call_open.send_replace(false);

		let accepting = accept(harness.app.handle(), INSTANCE.to_owned());
		let signing_out = async {
			let is_called =
				|| (!harness.cloud.called.lock().expect("the cloud").is_empty()).then_some(());
			harness.noticed_until("the accept call", is_called).await;
			sign_out(harness.app.handle()).await.expect("the sign out");
			harness.cloud.is_call_open.send_replace(true);
		};
		let (accepted, ()) = tokio::join!(accepting, signing_out);

		assert_eq!(accepted.map(|joined| joined.id), Err(InvitationError::NotSignedIn));
		assert!(harness.stored().await.is_empty());
		assert!(harness.heard(JOINED_CHANGED).is_empty());
	});
}

#[test]
fn a_connect_waiting_on_the_turn_during_sign_out_answers_unknown_and_starts_no_guest() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		harness.cloud.is_sign_out_open.send_replace(false);

		let signing_out = sign_out(harness.app.handle());
		let connecting = async {
			let is_signing_out =
				|| (harness.cloud.sign_outs_asked.load(Ordering::SeqCst) > 0).then_some(());
			harness.noticed_until("the cloud sign out", is_signing_out).await;
			let mut connecting = std::pin::pin!(harness.connect(&id));
			assert!((&mut connecting).now_or_never().is_none(), "the connect skipped the turn");
			harness.cloud.is_sign_out_open.send_replace(true);
			connecting.await
		};
		let (signed_out, connected) = tokio::join!(signing_out, connecting);

		signed_out.expect("the sign out");
		assert_eq!(connected, Err(JoinedSpaceError::UnknownJoinedSpace { id: id.clone() }));
		assert!(!is_guest_running(&harness, &id));
		assert!(harness.members.try_recv().is_err());
		assert!(harness.stored().await.is_empty());
	});
}

#[test]
fn a_guest_left_without_an_account_ends_closes_its_proxy_and_keeps_the_entry() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let (connection, mut member) = connected(&mut harness, &id).await;
		store::delete(&harness.root, &EnvScope::Account, ACCOUNT_BEARER).expect("signed out");
		let stopping = stopping(&harness, &id);

		closed_with(&mut member, 4002).await;

		assert!(guest_ended(&harness, &id, stopping).await, "the guest still runs");
		assert!(proxy_closed(&connection).await, "the proxy still answers");
		assert_eq!(harness.stored().await.len(), 1);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
		assert!(harness.members.try_recv().is_err());

		store::set(&harness.root, &EnvScope::Account, ACCOUNT_BEARER, BEARER).expect("signed in");
		let again = harness.connect(&id).await.expect("the new connection");
		let _reopened = harness.member().await;

		assert!(is_guest_running(&harness, &id));
		assert_ne!(again.host_url, connection.host_url);
	});
}

#[test]
fn a_guest_refused_401_signs_the_account_out_on_site_and_a_new_sign_in_connects_anew() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let (first, mut member) = connected(&mut harness, &id).await;
		harness.cloud.is_refusing_members.store(true, Ordering::SeqCst);
		let stopping = stopping(&harness, &id);

		closed_with(&mut member, 4002).await;

		assert!(guest_ended(&harness, &id, stopping).await, "the guest still runs");
		assert!(proxy_closed(&first).await, "the proxy still answers");
		assert!(harness.stored_until(<[JoinedSpace]>::is_empty).await.is_empty());
		let session = harness.app.state::<AccountSession>();
		let signed_out_on_site =
			AccountState::SignedOut { reason: Some(SignedOutReason::SignedOutOnSite) };
		let is_signed_out_on_site = || (session.current() == signed_out_on_site).then_some(());
		harness.noticed_until("the sign out on site", is_signed_out_on_site).await;
		assert!(session.bearer().expect("the store reads").is_none());

		harness.cloud.is_refusing_members.store(false, Ordering::SeqCst);
		store::set(&harness.root, &EnvScope::Account, ACCOUNT_BEARER, BEARER).expect("signed in");
		let id = harness.accepted().await;
		let (second, _reopened) = connected(&mut harness, &id).await;

		assert!(is_guest_running(&harness, &id));
		assert_ne!(second.host_url, first.host_url);
		assert_ne!(second.token, first.token);
		assert_eq!(second.remote_space_id.as_deref(), Some(SHARED_SPACE));
	});
}

fn a_relay_entry(id: &str, instance_id: &str, name: &str) -> JoinedSpace {
	JoinedSpace {
		id: id.to_owned(),
		reach: JoinedReach::Relay { instance_id: instance_id.to_owned() },
		remote_space_id: None,
		name: name.to_owned(),
	}
}

#[test]
fn a_restored_bearer_follows_the_cloud_memberships_before_the_first_poll_tick() {
	run(async {
		let harness = Harness::polling(Some(BEARER), None, Ok(()), Duration::from_secs(3600)).await;
		harness.listing(json!([an_instance("i-remote", "Remote")]));

		restore(harness.app.handle().clone()).await;
		let stored = harness.stored_until(|stored| !stored.is_empty()).await;

		assert_eq!(stored, vec![a_relay_entry(&stored[0].id, "i-remote", "Remote")]);
		assert_eq!(harness.instances_read(), 1);
		assert_eq!(harness.heard(JOINED_CHANGED), vec![json!({ "id": stored[0].id })]);
	});
}

#[test]
fn every_poll_tick_reads_the_memberships_and_follows_them() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		harness.listing(json!([an_instance("i-remote", "Remote")]));

		resumed(harness.app.handle());
		let first = harness.stored_until(|stored| !stored.is_empty()).await;
		harness.listing(json!([an_instance("i-remote", "Renamed")]));
		let renamed = harness.stored_until(|stored| stored[0].name == "Renamed").await;
		sign_out(harness.app.handle()).await.expect("the sign out");

		assert_eq!(renamed, vec![a_relay_entry(&first[0].id, "i-remote", "Renamed")]);
		assert!(harness.instances_read() >= 2);
	});
}

#[test]
fn a_listed_instance_without_an_entry_is_added_under_its_listed_name_and_announced() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		harness.listing(json!([an_instance("i-a", "Alpha"), an_instance("i-b", "Beta")]));

		reconciled(harness.app.handle()).await;
		let stored = harness.stored().await;

		assert_eq!(
			stored,
			vec![
				a_relay_entry(&stored[0].id, "i-a", "Alpha"),
				a_relay_entry(&stored[1].id, "i-b", "Beta"),
			]
		);
		assert_eq!(
			harness.heard(JOINED_CHANGED),
			vec![json!({ "id": stored[0].id }), json!({ "id": stored[1].id })]
		);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
	});
}

#[test]
fn a_held_entry_listed_under_another_name_is_renamed_in_place_and_announced() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		harness.listing(json!([an_instance(INSTANCE, "Atelier")]));

		reconciled(harness.app.handle()).await;

		assert_eq!(harness.stored().await, vec![a_relay_entry(&id, INSTANCE, "Atelier")]);
		assert_eq!(harness.heard(JOINED_CHANGED), vec![json!({ "id": id }), json!({ "id": id })]);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
	});
}

#[test]
fn a_held_entry_the_listing_omits_stops_its_guest_and_is_removed_with_both_events() {
	run(async {
		let mut harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let (connection, _member) = connected(&mut harness, &id).await;
		harness.listing(json!([]));

		reconciled(harness.app.handle()).await;

		assert!(!is_guest_running(&harness, &id));
		assert!(proxy_closed(&connection).await, "the proxy still answers");
		assert!(harness.stored().await.is_empty());
		assert_eq!(harness.heard(JOINED_CHANGED), vec![json!({ "id": id }), json!({ "id": id })]);
		assert_eq!(harness.heard(REMOVED_EVENT), vec![json!({ "id": id, "name": "Studio" })]);
	});
}

#[test]
fn a_held_entry_keeps_its_id_and_learned_space_when_renamed_until_the_listing_omits_it() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		let held = JoinedSpace {
			remote_space_id: Some("remote-1".to_owned()),
			..a_relay_entry("held-1", "i-held", "Held")
		};
		let state = harness.app.state::<DatabaseState>();
		let joined_spaces = state.as_ref().expect("the database").joined_spaces();
		joined_spaces.join(held.clone()).await.expect("the held entry");

		harness.listing(json!([an_instance("i-held", "Renamed")]));
		reconciled(harness.app.handle()).await;
		let after_rename = harness.stored().await;
		harness.listing(json!([]));
		reconciled(harness.app.handle()).await;

		assert_eq!(after_rename, vec![JoinedSpace { name: "Renamed".to_owned(), ..held }]);
		assert!(harness.stored().await.is_empty());
		assert_eq!(
			harness.heard(REMOVED_EVENT),
			vec![json!({ "id": "held-1", "name": "Renamed" })]
		);
	});
}

#[test]
fn an_instance_this_machine_hosts_is_never_added() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		let state = harness.app.state::<DatabaseState>();
		let database = state.as_ref().expect("the database");
		database
			.space_hosting()
			.registered("personal".to_owned(), "i-hosted".to_owned())
			.await
			.expect("the hosting is registered");
		harness.listing(json!([an_instance("i-hosted", "Personal")]));

		reconciled(harness.app.handle()).await;

		assert_eq!(harness.instances_read(), 1);
		assert!(harness.stored().await.is_empty());
		assert!(harness.heard(JOINED_CHANGED).is_empty());
	});
}

#[test]
fn a_failed_listing_leaves_the_entries_unchanged_and_its_failure_carries_no_bearer() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let held = harness.stored().await;

		for answer in [
			(StatusCode::SERVICE_UNAVAILABLE, json!([])),
			(StatusCode::OK, json!({ "not": "a list" })),
		] {
			*harness.cloud.instances.lock().expect("the cloud") = answer;
			reconciled(harness.app.handle()).await;
			let failure = harness
				.app
				.state::<RelayGuests>()
				.cloud()
				.instances(BEARER)
				.await
				.err()
				.expect("the listing fails");
			assert!(!format!("{failure:?}").contains(BEARER), "{failure:?}");
		}
		let offline = Harness::over(Some(BEARER), Some(a_closed_port().await), Ok(())).await;
		let failure = offline
			.app
			.state::<RelayGuests>()
			.cloud()
			.instances(BEARER)
			.await
			.err()
			.expect("the listing fails");
		reconciled(offline.app.handle()).await;

		assert!(!format!("{failure:?}").contains(BEARER), "{failure:?}");
		assert_eq!(harness.stored().await, held);
		assert_eq!(harness.heard(JOINED_CHANGED), vec![json!({ "id": id })]);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
	});
}

#[test]
fn a_reconciliation_holds_the_relay_turn_and_a_concurrent_accept_yields_one_entry() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		harness.listing(json!([an_instance(INSTANCE, "Studio")]));
		let guests = harness.app.state::<RelayGuests>();
		let held = guests.turn().lock().await;

		let mut reconciling = std::pin::pin!(reconciled(harness.app.handle()));
		assert!((&mut reconciling).now_or_never().is_none(), "the reconciliation skipped the turn");
		let read_while_held = harness.instances_read();
		drop(held);
		reconciling.await;
		assert_eq!(read_while_held, 0);

		harness.listing(json!([an_instance(INSTANCE, "Studio"), an_instance("i-b", "Beta")]));
		harness.cloud.is_call_open.send_replace(false);
		let reconciling_first = async {
			reconciled(harness.app.handle()).await;
			harness.cloud.is_call_open.send_replace(true);
		};
		let (accepted, ()) = tokio::join!(harness.accepted(), reconciling_first);
		let stored = harness.stored().await;

		let studio: Vec<_> = stored
			.iter()
			.filter(|joined| {
				joined.reach == JoinedReach::Relay { instance_id: INSTANCE.to_owned() }
			})
			.collect();
		assert_eq!(studio, vec![&a_relay_entry(&accepted, INSTANCE, "Studio")]);
		assert_eq!(stored.len(), 2);
	});
}

#[test]
fn a_sign_out_drops_every_relay_entry_and_stops_the_reconciliation() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		harness.listing(json!([an_instance("i-remote", "Remote")]));
		resumed(harness.app.handle());
		harness.stored_until(|stored| !stored.is_empty()).await;

		sign_out(harness.app.handle()).await.expect("the sign out");
		let read_at_sign_out = harness.instances_read();
		reconciled(harness.app.handle()).await;

		assert!(harness.stored().await.is_empty());
		assert_eq!(harness.instances_read(), read_at_sign_out);
	});
}

#[test]
fn an_accepted_invitation_is_kept_in_place_by_the_next_reconciliation() {
	run(async {
		let harness = Harness::new(Some(BEARER)).await;
		let id = harness.accepted().await;
		let accepted = harness.stored().await;
		harness.listing(json!([an_instance(INSTANCE, "Studio")]));

		reconciled(harness.app.handle()).await;

		assert_eq!(accepted, vec![a_relay_entry(&id, INSTANCE, "Studio")]);
		assert_eq!(harness.stored().await, accepted);
		assert_eq!(harness.heard(JOINED_CHANGED), vec![json!({ "id": id })]);
		assert!(harness.heard(REMOVED_EVENT).is_empty());
	});
}
