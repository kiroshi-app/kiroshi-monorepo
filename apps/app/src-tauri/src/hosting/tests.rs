use std::collections::HashSet;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::Router;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, watch};

use super::authorship::Caller;
use super::bridge::{belongs_to_the_host, LocalApi};
use super::contract::{
	HostingState, Member, MemberStatus, MembersError, CHANGED_EVENT, MEMBERS_CHANGED_EVENT,
};
use super::members::{invite, list, remove, withdraw};
use super::reach;
use super::replay::{RESUME_COMMAND, RING_FRAMES};
use super::{resumed, signed_out, start, stop, Hosting};
use crate::account::contract::AccountState;
use crate::account::session::restore;
use crate::account::session::AccountSession;
use crate::agent::commands;
use crate::agent::contract as agent;
use crate::agent::protocol::OauthCredentials;
use crate::agent::reply_writer::TurnSink;
use crate::bundles::{self, BotPermissions, DEFAULT_OUTPUT_STYLE};
use crate::companions::contract::{
	CREATED_EVENT as COMPANION_CREATED_EVENT, DELETED_EVENT as COMPANION_DELETED_EVENT,
	UPDATED_EVENT as COMPANION_UPDATED_EVENT,
};
use crate::conversations::commands::{
	conversation_add_participant, conversation_append_user_message, conversation_create,
	conversation_create_bot_from_draft, conversation_delete, conversation_delete_bot,
	conversation_duplicate_bot, conversation_page, conversation_remove_participant,
	conversation_send_user_message, conversation_set_lead, conversation_update,
	conversation_update_bot,
};
use crate::conversations::contract::{
	Bot, BotDraft, BotIdentity, Conversation, ConversationInPage, LastWord, NewUserMessage,
	ParticipantRole, TranscriptStoreError, CREATED_EVENT as CONVERSATION_CREATED_EVENT,
	DELETED_EVENT as CONVERSATION_DELETED_EVENT, MESSAGE_STORED_EVENT,
	UPDATED_EVENT as CONVERSATION_UPDATED_EVENT,
};
use crate::conversations::turn_run_deadline::{arm_start_deadlines, TurnRunDeadlines};
use crate::db::connection::temp_dir;
use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};
use crate::db::repositories::messages::{EndedRun, MessagePageQuery, MessageRole, NewTurn};
use crate::db::{self, DatabaseState};
use crate::environment::commands::{env_list, writable_root};
use crate::environment::connection;
use crate::environment::contract::{ConnectionKind, EnvOwner, EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::events::{self, Event, BUFFERED_FRAMES};
use crate::joined_spaces::contract::JoinedSpaceConnection;
use crate::joined_spaces::relay::RelayGuests;
use crate::mcp_oauth::asking::AuthorizationAnswers;
use crate::mcp_oauth::commands::{mcp_application_status, McpOauthState};
use crate::mcp_oauth::credentials;
use crate::mcp_oauth::reports::ApplicationReports;
use crate::removed_on_drop::RemovedOnDrop;
use crate::routines::commands::CHANGED_EVENT as ROUTINE_CHANGED_EVENT;
use crate::routines::webhook::{self, Webhook};
use crate::search::contract::{CatalogueScope, MessageSearchQuery};
use crate::spaces::commands::{
	bot_add_to_space, bot_move_to_space, bot_remove_from_space, space_delete,
};
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const BEARER: &str = "bearer-that-never-leaves";
const LOCAL_TOKEN: &str = "host-token-of-the-loopback";
const PERSONAL: &str = "personal";
const JOINED_SPACE_TOKEN: &str = "joined-space-token-of-the-host";
const INVOKE_ROUTE: &str = "/api/invoke/{command}";
const PATIENCE: Duration = Duration::from_secs(10);
const OWNER_EMAIL: &str = "owner@example.com";
const POLL_EVERY: Duration = Duration::from_millis(100);

#[derive(Clone)]
struct Relay {
	refusal: Option<StatusCode>,
	is_registration_open: Arc<watch::Sender<bool>>,
	is_registration_down: Arc<AtomicBool>,
	registered: Arc<Mutex<Vec<String>>>,
	known: Arc<Mutex<HashSet<String>>>,
	attempts: Arc<AtomicUsize>,
	sockets: mpsc::UnboundedSender<WebSocket>,
	members: Arc<Mutex<Vec<Value>>>,
	member_calls: Arc<Mutex<Vec<String>>>,
	member_answer: Arc<Mutex<Option<(StatusCode, Value)>>>,
	noticed: Arc<watch::Sender<()>>,
}

fn cloud_member(user_id: &str, email: &str, role: &str, state: &str) -> Value {
	json!({ "userId": user_id, "email": email, "name": null, "role": role, "state": state })
}

fn member_call(relay: &Relay, call: String) -> Option<Response> {
	relay.member_calls.lock().expect("the relay").push(call);
	relay.noticed.send_replace(());
	let forced = relay.member_answer.lock().expect("the relay").clone();
	forced.map(|(status, body)| answered_json(status, body))
}

async fn members_listed(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	if let Some(forced) = member_call(&relay, "GET".to_owned()) {
		return forced;
	}
	answered_json(StatusCode::OK, Value::Array(relay.members.lock().expect("the relay").clone()))
}

async fn member_invited(
	Served(relay): Served<Relay>,
	headers: HeaderMap,
	body: String,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let email = body["email"].as_str().expect("an email").to_owned();
	if let Some(forced) = member_call(&relay, format!("POST {email}")) {
		return forced;
	}
	let invited = cloud_member(&uuid::Uuid::new_v4().to_string(), &email, "member", "pending");
	relay.members.lock().expect("the relay").push(invited.clone());
	answered_json(StatusCode::CREATED, invited)
}

async fn member_removed(
	Served(relay): Served<Relay>,
	Path((_, user_id)): Path<(String, String)>,
	headers: HeaderMap,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	if let Some(forced) = member_call(&relay, format!("DELETE {user_id}")) {
		return forced;
	}
	let mut members = relay.members.lock().expect("the relay");
	let before = members.len();
	members.retain(|member| member["userId"] != user_id.as_str());
	if members.len() == before {
		return StatusCode::NOT_FOUND.into_response();
	}
	StatusCode::NO_CONTENT.into_response()
}

async fn me() -> Response {
	answered_json(
		StatusCode::OK,
		json!({ "id": "owner", "email": OWNER_EMAIL, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" }),
	)
}

fn bearer_of(headers: &HeaderMap) -> &str {
	let header = headers.get("authorization").and_then(|value| value.to_str().ok());
	header.unwrap_or_default().trim_start_matches("Bearer ")
}

async fn registration(Served(relay): Served<Relay>, headers: HeaderMap, body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	if bearer_of(&headers) != BEARER {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	if relay.is_registration_down.load(Ordering::SeqCst) {
		return StatusCode::SERVICE_UNAVAILABLE.into_response();
	}
	let id = uuid::Uuid::new_v4().to_string();
	relay
		.registered
		.lock()
		.expect("the relay")
		.push(body["name"].as_str().unwrap_or("").to_owned());
	relay.noticed.send_replace(());
	let mut is_open = relay.is_registration_open.subscribe();
	is_open.wait_for(|is_open| *is_open).await.expect("the relay opens");
	relay.known.lock().expect("the relay").insert(id.clone());
	answered_json(StatusCode::CREATED, json!({ "id": id, "name": body["name"], "role": "owner" }))
}

async fn host(
	Served(relay): Served<Relay>,
	Path(id): Path<String>,
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	relay.attempts.fetch_add(1, Ordering::SeqCst);
	if bearer_of(&headers) != BEARER {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	if let Some(status) = relay.refusal {
		return status.into_response();
	}
	if !relay.known.lock().expect("the relay").contains(&id) {
		return StatusCode::NOT_FOUND.into_response();
	}
	upgrade.on_upgrade(move |socket| async move {
		relay.sockets.send(socket).expect("the test holds the sockets");
	})
}

async fn invoked(Path(command): Path<String>, headers: HeaderMap, args: String) -> Response {
	let args: Value = serde_json::from_str(&args).expect("json arguments");
	if bearer_of(&headers) != LOCAL_TOKEN {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	answered_json(StatusCode::OK, json!({ "command": command, "args": args }))
}

async fn joined_space_connected(
	Path(command): Path<String>,
	Served(database): Served<PathBuf>,
	headers: HeaderMap,
	args: String,
) -> Response {
	let args: Value = serde_json::from_str(&args).expect("json arguments");
	if bearer_of(&headers) != LOCAL_TOKEN {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	if command != "joined_space_connect" {
		return answered_json(StatusCode::OK, json!({ "command": command, "args": args }));
	}
	let id = args["id"].as_str().expect("a joined space id").to_owned();
	let found = db::open(&database).joined_spaces().find(id).await.expect("the host reads");
	let connection = found.map(|found| {
		JoinedSpaceConnection::over(
			found,
			"http://h.test".to_owned(),
			JOINED_SPACE_TOKEN.to_owned(),
		)
	});
	answered_json(StatusCode::OK, json!(connection))
}

#[derive(Clone)]
struct HostEffects {
	database: PathBuf,
	env_root: PathBuf,
	reached: Arc<Mutex<Vec<String>>>,
}

impl HostEffects {
	fn reached(&self) -> Vec<String> {
		self.reached.lock().expect("the local api").clone()
	}
}

fn typed<T: serde::de::DeserializeOwned>(args: &Value, key: &str) -> T {
	serde_json::from_value(args[key].clone()).expect("a typed argument")
}

async fn host_effect_applied(
	Path(command): Path<String>,
	Served(effects): Served<HostEffects>,
	headers: HeaderMap,
	args: String,
) -> Response {
	let args: Value = serde_json::from_str(&args).expect("json arguments");
	if bearer_of(&headers) != LOCAL_TOKEN {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	effects.reached.lock().expect("the local api").push(command.clone());
	let database = db::open(&effects.database);
	let root = &effects.env_root;
	let text = |key: &str| args[key].as_str().expect("a text argument").to_owned();
	match command.as_str() {
		"search_catalogue" => {
			let scope = CatalogueScope { query: text("query"), space_id: text("spaceId") };
			let found = database.catalogue().search(scope).await.expect("the host searches");
			return answered_json(StatusCode::OK, json!(found));
		}
		"search_recent" => {
			let found = database.catalogue().recent(text("spaceId")).await.expect("the host reads");
			return answered_json(StatusCode::OK, json!(found));
		}
		"search_messages" => {
			let query: MessageSearchQuery = typed(&args, "query");
			let found = database.search().messages(query).await.expect("the host searches");
			return answered_json(StatusCode::OK, json!(found));
		}
		"joined_space_remove" => {
			database.joined_spaces().remove(text("id")).await.expect("the host leaves");
		}
		"env_set" => store::set(root, &typed(&args, "scope"), &text("name"), &text("value"))
			.expect("the host sets"),
		"env_delete" => {
			store::delete(root, &typed(&args, "scope"), &text("name")).expect("the host deletes")
		}
		"connection_set" => {
			connection::hold(root, typed(&args, "kind"), &text("value")).expect("the host connects")
		}
		"mcp_oauth_disconnect" => {
			let scope = EnvScope::Server { name: text("name"), owner: typed(&args, "owner") };
			credentials::forget(root, &scope).expect("the host disconnects");
		}
		_ => {}
	}
	answered_json(StatusCode::OK, Value::Null)
}

fn answered_json(status: StatusCode, body: Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tauri::async_runtime::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

struct Harness {
	app: AppOfItsOwn,
	relay: Relay,
	sockets: mpsc::UnboundedReceiver<WebSocket>,
	heard: Arc<Mutex<Vec<Value>>>,
	heard_members: Arc<Mutex<Vec<Value>>>,
	_temporary: Vec<RemovedOnDrop>,
}

impl Harness {
	async fn new(name: &str, refusal: Option<StatusCode>, bearer: Option<&str>) -> Self {
		Self::polling_members(name, refusal, bearer, super::members::MEMBERS_EVERY).await
	}

	async fn polling_members(
		name: &str,
		refusal: Option<StatusCode>,
		bearer: Option<&str>,
		members_every: Duration,
	) -> Self {
		let local = Router::new().route(INVOKE_ROUTE, post(invoked));
		Self::serving(name, refusal, bearer, members_every, temp_dir(), local).await
	}

	async fn connecting_joined_spaces(name: &str) -> Self {
		let database = temp_dir();
		let local = Router::new()
			.route(INVOKE_ROUTE, post(joined_space_connected))
			.with_state(database.to_path_buf());
		Self::serving(name, None, Some(BEARER), super::members::MEMBERS_EVERY, database, local)
			.await
	}

	async fn applying_host_effects(name: &str) -> (Self, HostEffects) {
		let database = temp_dir();
		let env_root = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-hosting-env-{name}-{}", uuid::Uuid::new_v4())),
		);
		let effects = HostEffects {
			database: database.to_path_buf(),
			env_root: env_root.to_path_buf(),
			reached: Arc::default(),
		};
		let local = Router::new()
			.route(INVOKE_ROUTE, post(host_effect_applied))
			.with_state(effects.clone());
		let every = super::members::MEMBERS_EVERY;
		let mut harness = Self::serving(name, None, Some(BEARER), every, database, local).await;
		harness._temporary.push(env_root);
		(harness, effects)
	}

	async fn serving(
		name: &str,
		refusal: Option<StatusCode>,
		bearer: Option<&str>,
		members_every: Duration,
		database: RemovedOnDrop,
		local: Router,
	) -> Self {
		let (sockets_in, sockets) = mpsc::unbounded_channel();
		let relay = Relay {
			refusal,
			is_registration_open: Arc::new(watch::channel(true).0),
			is_registration_down: Arc::default(),
			registered: Arc::default(),
			known: Arc::default(),
			attempts: Arc::default(),
			sockets: sockets_in,
			members: Arc::new(Mutex::new(vec![cloud_member(
				"owner",
				OWNER_EMAIL,
				"owner",
				"joined",
			)])),
			member_calls: Arc::default(),
			member_answer: Arc::default(),
			noticed: Arc::new(watch::channel(()).0),
		};
		let cloud = served(
			Router::new()
				.route("/instances", post(registration))
				.route("/instances/{id}/relay/host", get(host))
				.route("/instances/{id}/members", get(members_listed).post(member_invited))
				.route("/instances/{id}/members/{user_id}", delete(member_removed))
				.route("/me", get(me))
				.with_state(relay.clone()),
		)
		.await;
		let local = served(local).await;
		let root = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-hosting-{name}-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		let app = an_app_of_its_own(&format!("hosting-{name}"), mock_builder());
		app.manage::<DatabaseState>(Ok(db::open(&database)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		app.manage(RelayGuests::new(&cloud));
		app.manage(
			Hosting::new(
				&cloud,
				Some(
					LocalApi::new(local, LOCAL_TOKEN.to_owned()).expect("the local client builds"),
				),
			)
			.polling_members_every(members_every),
		);
		let heard = Arc::new(Mutex::new(Vec::new()));
		let hearing = Arc::clone(&heard);
		let noticing = Arc::clone(&relay.noticed);
		app.listen(CHANGED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("a json payload");
			hearing.lock().expect("the events").push(payload);
			noticing.send_replace(());
		});
		let heard_members = Arc::new(Mutex::new(Vec::new()));
		let hearing_members = Arc::clone(&heard_members);
		let noticing = Arc::clone(&relay.noticed);
		app.listen(MEMBERS_CHANGED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("a json payload");
			hearing_members.lock().expect("the events").push(payload);
			noticing.send_replace(());
		});
		Self { app, relay, sockets, heard, heard_members, _temporary: vec![database, root] }
	}

	async fn signed_in(name: &str) -> Self {
		Self::new(name, None, Some(BEARER)).await
	}

	fn state(&self) -> HostingState {
		self.app.state::<Hosting>().current(PERSONAL)
	}

	async fn reached(&self, expected: HostingState) {
		self.reached_by(PERSONAL, expected).await;
	}

	async fn noticed_until<T>(&self, awaited: &str, found: impl Fn() -> Option<T>) -> T {
		let mut noticed = self.relay.noticed.subscribe();
		loop {
			if let Some(found) = found() {
				return found;
			}
			tokio::time::timeout(PATIENCE, noticed.changed())
				.await
				.unwrap_or_else(|_| panic!("{awaited} was not noticed within {PATIENCE:?}"))
				.expect("the harness listens");
		}
	}

	async fn reached_by(&self, space_id: &str, expected: HostingState) {
		let current = || self.app.state::<Hosting>().current(space_id);
		let awaited = format!("space {space_id} reaching {expected:?}");
		self.noticed_until(&awaited, || (current() == expected).then_some(())).await;
	}

	async fn failed(&self) -> String {
		let reason = || match self.state() {
			HostingState::Failed { reason } => Some(reason),
			_ => None,
		};
		self.noticed_until("a failed space", reason).await
	}

	fn running_relay(&self) -> watch::Sender<bool> {
		let hosting = self.app.state::<Hosting>();
		let hosts = hosting.hosts();
		let run = hosts.get(PERSONAL).and_then(|host| host.run.as_ref());
		run.map(|run| run.stop.clone()).expect("a relay runs")
	}

	async fn started(&self) -> HostingState {
		start(self.app.handle(), PERSONAL.to_owned()).await.expect("the hosting starts")
	}

	async fn stopped(&self) -> HostingState {
		stop(self.app.handle(), PERSONAL.to_owned()).await.expect("the hosting stops")
	}

	async fn member(&mut self) -> WebSocket {
		tokio::time::timeout(PATIENCE, self.sockets.recv())
			.await
			.expect("the host connected in time")
			.expect("the relay is up")
	}

	fn attempts(&self) -> usize {
		self.relay.attempts.load(Ordering::SeqCst)
	}

	fn registered(&self) -> Vec<String> {
		self.relay.registered.lock().expect("the relay").clone()
	}

	async fn stored(&self) -> (Option<String>, Vec<String>) {
		let state = self.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		let registration = hosting.registration(PERSONAL.to_owned()).await.expect("the row");
		(registration.instance_id, hosting.hosted_space_ids().await.expect("the flags"))
	}

	async fn joined_a_space(&self) -> JoinedSpace {
		let state = self.app.state::<DatabaseState>();
		let candidate = JoinedSpace {
			id: uuid::Uuid::new_v4().to_string(),
			reach: JoinedReach::Relay { instance_id: "joined-instance".to_owned() },
			remote_space_id: None,
			name: "h.test".to_owned(),
		};
		let joined_spaces = state.as_ref().expect("the database").joined_spaces();
		joined_spaces.join(candidate).await.expect("the host joins a space")
	}

	async fn plant(&self, instance_id: &str) {
		let state = self.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.registered(PERSONAL.to_owned(), instance_id.to_owned()).await.expect("planted");
	}

	fn heard_kinds(&self) -> Vec<String> {
		let heard = self.heard.lock().expect("the events");
		heard
			.iter()
			.inspect(|change| assert_eq!(change["spaceId"], PERSONAL))
			.map(|change| change["state"]["kind"].as_str().expect("a kind").to_owned())
			.collect()
	}

	async fn heard_until(&self, is_heard: impl Fn(&[String]) -> bool) -> Vec<String> {
		let heard = || Some(self.heard_kinds()).filter(|kinds| is_heard(kinds));
		self.noticed_until("the awaited hosting changes", heard).await
	}
}

async fn ended_on_its_own(relay: watch::Sender<bool>) {
	tokio::time::timeout(PATIENCE, relay.closed()).await.expect("the relay ended on its own");
}

async fn next_json(member: &mut WebSocket) -> Value {
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

async fn next_stamped(member: &mut WebSocket, wanted: impl Fn(&Value) -> bool) -> Value {
	loop {
		let frame = next_json(member).await;
		if wanted(&frame) {
			return frame;
		}
	}
}

fn unstamped(mut frame: Value) -> Value {
	if let Some(fields) = frame.as_object_mut().filter(|fields| fields.contains_key("event")) {
		let epoch = fields.remove("epoch");
		let seq = fields.remove("seq");
		assert!(
			epoch.as_ref().is_some_and(Value::is_string) && seq.as_ref().is_some_and(Value::is_u64),
			"an event frame carries its epoch {epoch:?} and seq {seq:?}"
		);
	}
	frame
}

async fn next_text(member: &mut WebSocket, wanted: impl Fn(&Value) -> bool) -> Value {
	loop {
		let frame = unstamped(next_json(member).await);
		if wanted(&frame) {
			return frame;
		}
	}
}

async fn members_heard(member: &mut WebSocket) -> Value {
	next_text(member, |frame| frame["event"]["event"] == MEMBERS_CHANGED_EVENT).await
}

async fn answer(member: &mut WebSocket) -> Value {
	next_text(member, |frame| frame.get("event").is_none()).await
}

async fn send(member: &mut WebSocket, text: &str) {
	member.send(Message::Text(text.into())).await.expect("the member frame leaves");
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

#[test]
fn a_first_start_registers_once_and_a_later_start_reuses_the_instance() {
	run(async {
		let mut harness = Harness::signed_in("reuse").await;

		assert_eq!(harness.started().await, HostingState::Connecting);
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (registered, flagged) = harness.stored().await;
		harness.stopped().await;
		harness.started().await;
		let _second = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert_eq!(harness.registered(), vec!["Personal".to_owned()]);
		assert!(harness
			.relay
			.known
			.lock()
			.expect("the relay")
			.contains(&registered.clone().expect("an id")));
		assert_eq!(flagged, vec![PERSONAL.to_owned()]);
		assert_eq!(harness.stored().await.0, registered);
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn an_instance_the_relay_forgot_is_registered_anew_and_replaced() {
	run(async {
		let mut harness = Harness::signed_in("forgotten").await;
		let forgotten = uuid::Uuid::new_v4().to_string();
		harness.plant(&forgotten).await;

		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let (stored, _) = harness.stored().await;
		assert_eq!(harness.registered().len(), 1);
		assert_ne!(stored.as_deref(), Some(forgotten.as_str()));
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn without_a_bearer_the_space_needs_a_sign_in_and_nothing_is_called() {
	run(async {
		let harness = Harness::new("no-bearer", None, None).await;

		assert_eq!(harness.started().await, HostingState::NeedsSignIn);

		assert!(harness.registered().is_empty());
		assert_eq!(harness.attempts(), 0);
		assert_eq!(harness.heard_until(|kinds| !kinds.is_empty()).await, vec!["needsSignIn"]);
	});
}

#[test]
fn a_bearer_the_relay_refuses_needs_a_sign_in_and_is_not_retried() {
	run(async {
		let harness = Harness::new("revoked", Some(StatusCode::UNAUTHORIZED), Some(BEARER)).await;

		harness.started().await;
		let relay = harness.running_relay();
		harness.reached(HostingState::NeedsSignIn).await;
		ended_on_its_own(relay).await;

		assert_eq!(harness.attempts(), 1);
		assert_eq!(harness.state(), HostingState::NeedsSignIn);
	});
}

#[test]
fn an_instance_owned_by_another_account_fails_naming_403_and_is_not_retried() {
	run(async {
		let harness = Harness::new("forbidden", Some(StatusCode::FORBIDDEN), Some(BEARER)).await;

		harness.started().await;
		let relay = harness.running_relay();
		let reason = harness.failed().await;
		ended_on_its_own(relay).await;

		assert!(reason.contains("403"), "{reason}");
		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn a_host_replaced_by_another_fails_naming_4001_and_does_not_reconnect() {
	run(async {
		let mut harness = Harness::signed_in("replaced").await;
		harness.started().await;
		let relay = harness.running_relay();
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let close = CloseFrame { code: 4001, reason: "Host replaced".into() };
		member.send(Message::Close(Some(close))).await.expect("the close leaves");
		let reason = harness.failed().await;
		ended_on_its_own(relay).await;

		assert!(reason.contains("4001"), "{reason}");
		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn a_dropped_socket_reconnects_after_the_first_backoff() {
	run(async {
		let mut harness = Harness::signed_in("dropped").await;
		harness.started().await;
		let member = harness.member().await;
		harness.reached(HostingState::Online).await;

		drop(member);
		harness.reached(HostingState::Connecting).await;
		let _again = harness.member().await;
		harness.reached(HostingState::Online).await;

		let heard = harness.heard_until(|kinds| kinds.len() >= 4).await;

		assert_eq!(heard, vec!["connecting", "online", "connecting", "online"]);
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn a_member_call_reaches_the_local_api_with_the_host_token_and_its_answer_comes_back() {
	run(async {
		let mut harness = Harness::signed_in("invoke").await;
		harness.started().await;
		let mut member = harness.member().await;

		send(&mut member, r#"{"id": "c1", "command": "agent_models", "args": {"a": 1}}"#).await;

		assert_eq!(
			answer(&mut member).await,
			json!({
				"id": "c1",
				"status": 200,
				"body": { "command": "agent_models", "args": { "a": 1 } }
			})
		);
	});
}

#[test]
fn the_shared_space_frame_is_answered_with_the_hosted_space() {
	run(async {
		let mut harness = Harness::signed_in("shared-space").await;
		harness.started().await;
		let mut member = harness.member().await;

		send(&mut member, r#"{"id": "s1", "command": "relay_shared_space"}"#).await;

		assert_eq!(
			answer(&mut member).await,
			json!({ "id": "s1", "status": 200, "body": { "spaceId": PERSONAL } })
		);
	});
}

#[test]
fn a_malformed_member_frame_is_answered_400_and_the_socket_stays_open() {
	run(async {
		let mut harness = Harness::signed_in("malformed").await;
		harness.started().await;
		let mut member = harness.member().await;

		send(&mut member, r#"{"id": "m1", "command": 7}"#).await;
		let refused = answer(&mut member).await;
		send(&mut member, r#"{"id": "m2", "command": "agent_models"}"#).await;
		let answered = answer(&mut member).await;

		assert_eq!((refused["id"].clone(), refused["status"].clone()), (json!("m1"), json!(400)));
		assert_eq!((answered["id"].clone(), answered["status"].clone()), (json!("m2"), json!(200)));
		assert_eq!(harness.state(), HostingState::Online);
	});
}

async fn a_relay_guest_is_refused(command: &str) {
	refused_on(&mut Harness::signed_in(command).await, command).await;
}

async fn refused_on(harness: &mut Harness, command: &str) -> Value {
	refused_with(harness, command, json!({ "spaceId": PERSONAL })).await.1
}

async fn refused_with(harness: &mut Harness, command: &str, args: Value) -> (Value, Value) {
	assert!(belongs_to_the_host(command, &args), "{command} is not host only");
	restore(harness.app.handle().clone()).await;
	harness.started().await;
	let mut member = harness.member().await;
	harness.reached(HostingState::Online).await;

	let frame = json!({ "id": command, "command": command, "args": args });
	send(&mut member, &frame.to_string()).await;
	let refused = answer(&mut member).await;
	send(&mut member, r#"{"id": "after", "command": "agent_models"}"#).await;
	let answered = answer(&mut member).await;

	assert_eq!(
		refused,
		json!({ "id": command, "status": 403, "body": "this command belongs to the host" })
	);
	assert_eq!((answered["id"].clone(), answered["status"].clone()), (json!("after"), json!(200)));
	assert_eq!(harness.state(), HostingState::Online);
	let session = harness.app.state::<AccountSession>();
	assert!(matches!(session.current(), AccountState::SignedIn(_)), "{:?}", session.current());
	assert_eq!(session.bearer().expect("the session store reads").as_deref(), Some(BEARER));
	(refused, answered)
}

#[test]
fn a_relay_guest_cannot_start_the_hosting() {
	run(a_relay_guest_is_refused("hosting_start"));
}

#[test]
fn a_relay_guest_cannot_stop_the_hosting() {
	run(a_relay_guest_is_refused("hosting_stop"));
}

#[test]
fn a_relay_guest_cannot_sign_the_host_account_in() {
	run(a_relay_guest_is_refused("account_sign_in"));
}

#[test]
fn a_relay_guest_cannot_sign_the_host_account_out() {
	run(a_relay_guest_is_refused("account_sign_out"));
}

#[test]
fn a_relay_guest_cannot_sign_the_host_agent_in() {
	run(a_relay_guest_is_refused("agent_sign_in"));
}

#[test]
fn a_relay_guest_cannot_enter_the_host_agent_sign_in_code() {
	run(a_relay_guest_is_refused("agent_sign_in_code"));
}

#[test]
fn a_relay_guest_cannot_cancel_the_host_agent_sign_in() {
	run(a_relay_guest_is_refused("agent_sign_in_cancel"));
}

async fn a_relay_guest_is_refused_before_the_local_api(command: &str) {
	let (mut harness, effects) = Harness::applying_host_effects(command).await;

	refused_on(&mut harness, command).await;

	assert_eq!(effects.reached(), ["agent_models"]);
}

#[test]
fn a_relay_guest_cannot_read_the_host_account() {
	run(a_relay_guest_is_refused_before_the_local_api("account_state"));
}

#[test]
fn a_relay_guest_cannot_read_the_host_preferences() {
	run(a_relay_guest_is_refused_before_the_local_api("user_preferences"));
}

#[test]
fn a_relay_guest_cannot_delete_a_space_and_its_instance_registration() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("space_delete").await;

		refused_on(&mut harness, "space_delete").await;

		let spaces = db::open(&effects.database).spaces().list().await.expect("the host lists");
		assert!(spaces.iter().any(|space| space.id == PERSONAL), "{spaces:?}");
		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_relay_guest_cannot_read_the_stored_token_of_a_joined_space() {
	run(async {
		let mut harness = Harness::connecting_joined_spaces("joined-connect").await;
		let joined = harness.joined_a_space().await;

		let (refused, _) =
			refused_with(&mut harness, "joined_space_connect", json!({ "id": joined.id })).await;

		assert!(!refused.to_string().contains(JOINED_SPACE_TOKEN), "{refused}");
	});
}

#[test]
fn a_relay_guest_cannot_remove_a_joined_space_of_the_host() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("joined-remove").await;
		let joined = harness.joined_a_space().await;

		refused_with(&mut harness, "joined_space_remove", json!({ "id": joined.id })).await;

		let listed = db::open(&effects.database).joined_spaces().list().await.expect("listed");
		assert!(listed.iter().any(|kept| kept.id == joined.id), "{listed:?}");
	});
}

#[test]
fn a_relay_guest_cannot_list_the_joined_spaces_of_the_host() {
	run(a_relay_guest_is_refused("joined_spaces_list"));
}

#[test]
fn a_relay_guest_cannot_read_the_conversation_ids_of_the_host() {
	run(a_relay_guest_is_refused("conversation_local_ids"));
}

#[test]
fn a_relay_guest_cannot_replace_the_host_agent_connection() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("connection-set").await;
		connection::hold(&effects.env_root, ConnectionKind::ApiKey, "host-key")
			.expect("the host connects");
		let before = connection::held(&effects.env_root).expect("the host reads");

		refused_with(
			&mut harness,
			"connection_set",
			json!({ "kind": "apiKey", "value": "guest-key" }),
		)
		.await;

		assert_eq!(connection::held(&effects.env_root).expect("the host reads"), before);
	});
}

#[test]
fn a_relay_guest_cannot_connect_an_application_with_the_host_identity() {
	run(a_relay_guest_is_refused("mcp_oauth_connect"));
}

#[test]
fn a_relay_guest_cannot_cancel_a_host_application_connection() {
	run(a_relay_guest_is_refused("mcp_oauth_cancel"));
}

#[test]
fn a_relay_guest_cannot_create_a_host_space() {
	run(a_relay_guest_is_refused("space_create"));
}

#[test]
fn a_relay_guest_cannot_import_a_host_file_as_a_space() {
	run(a_relay_guest_is_refused("space_import"));
}

#[test]
fn a_relay_guest_cannot_export_a_space_to_a_host_path() {
	run(a_relay_guest_is_refused("space_export"));
}

#[test]
fn a_relay_guest_cannot_reorder_the_host_spaces() {
	run(a_relay_guest_is_refused("space_reorder"));
}

#[test]
fn a_relay_guest_cannot_change_the_host_profile() {
	run(a_relay_guest_is_refused("user_set_preferences"));
}

#[test]
fn a_relay_guest_cannot_change_the_host_profile_picture() {
	run(a_relay_guest_is_refused("user_set_profile_picture"));
}

fn a_stdio_server_on(scope: Value) -> Value {
	json!({
		"scope": scope,
		"name": "spawned",
		"config": { "command": "spawned-by-the-guest" },
		"mark": null
	})
}

#[test]
fn a_relay_guest_cannot_add_a_server_to_the_host_person_plugin() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("plugin-person").await;
		let args = a_stdio_server_on(json!({ "kind": "user" }));

		refused_with(&mut harness, "plugin_set_mcp_server", args).await;

		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_relay_guest_adding_a_server_to_a_space_plugin_reaches_the_host() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("plugin-space").await;
		harness.started().await;
		let mut member = harness.member().await;
		let args = a_stdio_server_on(json!({ "kind": "space", "id": PERSONAL }));

		let frame = json!({
			"id": "p",
			"command": "plugin_set_mcp_server",
			"sender": { "accountId": A_JOINER },
			"args": args,
		});
		send(&mut member, &frame.to_string()).await;
		let answered = answer(&mut member).await;

		assert_eq!((answered["id"].clone(), answered["status"].clone()), (json!("p"), json!(200)));
		assert_eq!(effects.reached(), ["plugin_set_mcp_server"]);
	});
}

#[test]
fn a_local_event_is_forwarded_to_the_relay() {
	run(async {
		let mut harness = Harness::signed_in("event").await;
		harness.started().await;
		let mut member = harness.member().await;
		send(&mut member, r#"{"id": "warm", "command": "agent_models"}"#).await;
		answer(&mut member).await;

		let payload = json!({ "spaceId": PERSONAL, "n": 1 });
		events::emit(harness.app.handle(), Event::untyped(CHANGED_EVENT), payload)
			.expect("emitted");
		let forwarded =
			next_text(&mut member, |frame| frame["event"]["payload"]["n"] == json!(1)).await;

		assert!(forwarded["event"].to_string().contains(r#""n":1"#), "{forwarded}");
	});
}

#[test]
fn the_first_member_announcement_of_an_online_space_crosses_the_relay() {
	run(async {
		let mut harness = Harness::signed_in("members-local").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let first = members_heard(&mut member).await;

		let announced = harness.heard_member_lists();
		assert_eq!(announced.len(), 1);
		let payload = json!({ "spaceId": PERSONAL, "members": announced[0] });
		assert_eq!(first, as_forwarded((MEMBERS_CHANGED_EVENT, payload)));
	});
}

#[test]
fn stopping_closes_with_1000_clears_the_flag_and_keeps_the_instance() {
	run(async {
		let mut harness = Harness::signed_in("stop").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		members_heard(&mut member).await;
		let (registered, _) = harness.stored().await;

		assert_eq!(harness.stopped().await, HostingState::Off);
		let closed = tokio::time::timeout(PATIENCE, member.recv()).await.expect("a frame in time");

		let Some(Ok(Message::Close(Some(close)))) = closed else {
			panic!("the relay took no close frame: {closed:?}");
		};
		assert_eq!(close.code, 1000);
		assert_eq!(harness.stored().await, (registered, Vec::new()));
		let heard =
			harness.heard_until(|kinds| kinds.last().is_some_and(|kind| kind == "off")).await;
		assert_eq!(heard.last().map(String::as_str), Some("off"));
	});
}

#[test]
fn a_lagged_event_broadcast_closes_with_1013_and_reconnects() {
	run(async {
		let mut harness = Harness::signed_in("lagged").await;
		harness.started().await;
		let mut first = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut first, is_a_members_change).await);

		let (held, is_held) = tokio::sync::oneshot::channel();
		let (release, released) = std::sync::mpsc::channel::<()>();
		let app = harness.app.handle().clone();
		let holding = tauri::async_runtime::spawn(async move {
			let state = app.state::<DatabaseState>();
			let database = state.as_ref().expect("the database");
			database
				.call(move |_| {
					held.send(()).expect("the test waits for the lock");
					released.recv().expect("the test releases the lock");
					Ok(())
				})
				.await
		});
		is_held.await.expect("the database lock is held");
		let lookup = json!({ "conversationId": "c-lagged" });
		for _ in 0..BUFFERED_FRAMES + 2 {
			events::emit(
				harness.app.handle(),
				Event::untyped(MESSAGE_STORED_EVENT),
				lookup.clone(),
			)
			.expect("emitted");
		}
		release.send(()).expect("the holder waits");
		holding.await.expect("the holder ends").expect("the lock is released");

		let close = loop {
			let frame =
				tokio::time::timeout(PATIENCE, first.recv()).await.expect("a frame in time");
			match frame {
				Some(Ok(Message::Close(close))) => break close,
				Some(Ok(_)) => continue,
				other => panic!("the relay took no close frame: {other:?}"),
			}
		};
		let mut second = harness.member().await;
		harness.reached(HostingState::Online).await;
		let heard = harness.heard_until(|kinds| kinds.len() >= 4).await;
		let (replayed, answer) = resumed_from(&mut second, &epoch, since).await;

		assert_eq!(close.map(|close| close.code), Some(1013));
		assert_eq!(heard, vec!["connecting", "online", "connecting", "online"]);
		assert_eq!(harness.attempts(), 2);
		assert!(replayed.is_empty());
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "tooOld": true }));
	});
}

const RESUME_TOKEN: &str = "resume-token";

fn is_a_members_change(frame: &Value) -> bool {
	frame["event"]["event"] == MEMBERS_CHANGED_EVENT && frame["event"]["payload"]["n"].is_null()
}

fn stamp_of(frame: &Value) -> (String, u64) {
	let epoch = frame["epoch"].as_str().expect("an epoch").to_owned();
	(epoch, frame["seq"].as_u64().expect("a seq"))
}

fn numbered(harness: &Harness, n: usize) {
	let payload = json!({ "spaceId": PERSONAL, "n": n });
	events::emit(harness.app.handle(), Event::untyped(MEMBERS_CHANGED_EVENT), payload)
		.expect("emitted");
}

async fn numbered_through(harness: &Harness, member: &mut WebSocket, n: usize) -> Value {
	numbered(harness, n);
	next_stamped(member, |frame| frame["event"]["payload"]["n"] == n).await
}

fn number_of(frame: &Value) -> Option<u64> {
	frame["event"]["payload"]["n"].as_u64()
}

async fn resumed_from(member: &mut WebSocket, epoch: &str, since: u64) -> (Vec<Value>, Value) {
	let args = json!({ "epoch": epoch, "since": since, "token": RESUME_TOKEN });
	let call = json!({ "id": "resume", "command": RESUME_COMMAND, "args": args });
	send(member, &call.to_string()).await;
	let mut heard = Vec::new();
	loop {
		let frame = next_json(member).await;
		if frame.get("event").is_some() {
			heard.push(frame);
		} else if frame["id"] == "resume" {
			let count = frame["body"]["replayed"].as_u64().unwrap_or(0) as usize;
			let replayed = heard.split_off(heard.len() - count);
			return (replayed, frame);
		}
	}
}

fn assert_continues(replayed: &[Value], epoch: &str, since: u64) {
	let stamps: Vec<(String, u64)> = replayed.iter().map(stamp_of).collect();
	let expected: Vec<(String, u64)> =
		(since + 1..).take(replayed.len()).map(|seq| (epoch.to_owned(), seq)).collect();
	assert_eq!(stamps, expected);
}

#[test]
fn a_resume_inside_the_ring_replays_every_missed_frame_once_in_seq_order() {
	run(async {
		let mut harness = Harness::signed_in("resume").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);
		for n in 1..5 {
			numbered(&harness, n);
		}
		let mut last = numbered_through(&harness, &mut member, 5).await;

		let (replayed, answer) = resumed_from(&mut member, &epoch, since).await;

		assert_continues(&replayed, &epoch, since);
		assert!(replayed.iter().all(|frame| frame["token"] == RESUME_TOKEN));
		last["token"] = json!(RESUME_TOKEN);
		assert_eq!(replayed.last(), Some(&last));
		assert_eq!(replayed.iter().filter_map(number_of).collect::<Vec<_>>(), vec![1, 2, 3, 4, 5]);
		assert_eq!(answer["status"], 200);
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "replayed": replayed.len() }));
	});
}

#[test]
fn a_resume_from_beyond_the_ring_bound_answers_too_old() {
	run(async {
		let mut harness = Harness::signed_in("resume-too-old").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);
		for n in 1..=RING_FRAMES + 2 {
			numbered_through(&harness, &mut member, n).await;
		}

		let (replayed, answer) = resumed_from(&mut member, &epoch, since).await;

		assert!(replayed.is_empty());
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "tooOld": true }));
	});
}

#[test]
fn a_reopened_host_socket_first_sends_the_frames_recorded_while_it_was_down_in_seq_order() {
	run(async {
		let mut harness = Harness::signed_in("outage-pushed").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);

		drop(member);
		harness.reached(HostingState::Connecting).await;
		numbered(&harness, 1);
		numbered(&harness, 2);
		let mut again = harness.member().await;
		let mut pushed = Vec::new();
		while pushed.last().and_then(number_of) != Some(2) {
			pushed.push(next_stamped(&mut again, |frame| frame.get("event").is_some()).await);
		}

		assert_continues(&pushed, &epoch, since);
		assert_eq!(pushed.iter().filter_map(number_of).collect::<Vec<_>>(), vec![1, 2]);
	});
}

#[test]
fn a_host_socket_reconnection_keeps_the_epoch_and_continues_the_seq() {
	run(async {
		let mut harness = Harness::signed_in("resume-reconnected").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);

		drop(member);
		harness.reached(HostingState::Connecting).await;
		numbered(&harness, 1);
		let mut again = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (replayed, answer) = resumed_from(&mut again, &epoch, since).await;
		let live = numbered_through(&harness, &mut again, 2).await;

		assert_continues(&replayed, &epoch, since);
		assert_eq!(replayed.iter().filter_map(number_of).collect::<Vec<_>>(), vec![1]);
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "replayed": replayed.len() }));
		let (live_epoch, live_seq) = stamp_of(&live);
		assert_eq!(live_epoch, epoch);
		assert!(live_seq > since + replayed.len() as u64, "{live_seq} follows the replay");
	});
}

#[test]
fn a_second_start_answers_the_current_state_without_another_socket() {
	run(async {
		let mut harness = Harness::signed_in("twice").await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert_eq!(harness.started().await, HostingState::Online);

		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn signing_out_closes_the_relay_and_needs_a_sign_in_keeping_the_flag() {
	run(async {
		let mut harness = Harness::signed_in("signed-out").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		members_heard(&mut member).await;

		signed_out(harness.app.handle()).await;
		let closed = tokio::time::timeout(PATIENCE, member.recv()).await.expect("a frame in time");

		assert!(matches!(closed, Some(Ok(Message::Close(_)))), "{closed:?}");
		assert_eq!(harness.state(), HostingState::NeedsSignIn);
		assert_eq!(harness.stored().await.1, vec![PERSONAL.to_owned()]);
	});
}

#[test]
fn a_flagged_space_comes_back_online_when_the_account_is_restored() {
	run(async {
		let mut harness = Harness::signed_in("resumed").await;
		let known = uuid::Uuid::new_v4().to_string();
		harness.relay.known.lock().expect("the relay").insert(known.clone());
		harness.plant(&known).await;

		resumed(harness.app.handle()).await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert!(harness.registered().is_empty());
	});
}

#[test]
fn a_registration_refused_401_needs_a_sign_in_and_opens_no_socket() {
	run(async {
		let harness = Harness::new("register-revoked", None, Some("bearer-the-cloud-forgot")).await;

		harness.started().await;
		harness.reached(HostingState::NeedsSignIn).await;

		assert!(harness.registered().is_empty());
		assert_eq!(harness.attempts(), 0);
		assert_eq!(harness.stored().await, (None, vec![PERSONAL.to_owned()]));
	});
}

#[test]
fn a_stop_during_registration_keeps_the_answered_instance_and_a_later_start_reuses_it() {
	run(async {
		let mut harness = Harness::signed_in("stop-registering").await;
		harness.relay.is_registration_open.send_replace(false);

		harness.started().await;
		let is_registering = || (!harness.registered().is_empty()).then_some(());
		harness.noticed_until("a registration", is_registering).await;
		let mut stopping = harness.running_relay().subscribe();
		let (stopped, ()) = tokio::join!(harness.stopped(), async {
			stopping.wait_for(|is_stopping| *is_stopping).await.expect("the relay is told");
			harness.relay.is_registration_open.send_replace(true);
		});
		assert_eq!(stopped, HostingState::Off);
		let (kept, flagged) = harness.stored().await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let kept = kept.expect("the answered instance was stored");
		assert!(harness.relay.known.lock().expect("the relay").contains(&kept));
		assert!(flagged.is_empty());
		assert_eq!(harness.registered().len(), 1);
		assert_eq!(harness.stored().await.0, Some(kept));
		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn deleting_a_hosted_space_closes_its_relay_with_1000_and_reads_off() {
	run(async {
		let mut harness = Harness::signed_in("deleted").await;
		let work = {
			let state = harness.app.state::<DatabaseState>();
			let database = state.as_ref().expect("the database");
			database.spaces().create("Work".to_owned()).await.expect("the space").id
		};
		start(harness.app.handle(), work.clone()).await.expect("the hosting starts");
		let mut member = harness.member().await;
		harness.reached_by(&work, HostingState::Online).await;
		members_heard(&mut member).await;

		space_delete(harness.app.handle().clone(), harness.app.state(), work.clone())
			.await
			.expect("the space is deleted");
		let closed = tokio::time::timeout(PATIENCE, member.recv()).await.expect("a frame in time");

		let Some(Ok(Message::Close(Some(close)))) = closed else {
			panic!("the relay took no close frame: {closed:?}");
		};
		assert_eq!(close.code, 1000);
		assert_eq!(harness.app.state::<Hosting>().current(&work), HostingState::Off);
		let state = harness.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		assert!(hosting.hosted_space_ids().await.expect("the flags").is_empty());
	});
}

#[test]
fn a_first_start_persists_the_intent_before_registering() {
	run(async {
		let harness = Harness::signed_in("intent").await;
		harness.relay.is_registration_down.store(true, Ordering::SeqCst);

		assert_eq!(harness.started().await, HostingState::Connecting);

		assert_eq!(harness.stored().await, (None, vec![PERSONAL.to_owned()]));
		assert!(harness.registered().is_empty());
	});
}

#[test]
fn a_space_whose_registration_never_succeeded_is_resumed_and_registered() {
	run(async {
		let mut harness = Harness::signed_in("intent-resumed").await;
		let state = harness.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.set_hosted(PERSONAL.to_owned(), true).await.expect("the intent is kept");

		resumed(harness.app.handle()).await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert_eq!(harness.registered(), vec!["Personal".to_owned()]);
		assert!(harness.stored().await.0.is_some());
	});
}

const INSTANCE: &str = "6f1c2a7e-0d4b-4c9a-9a51-2f7f3f1d8c10";

impl Harness {
	async fn hosted(name: &str) -> Self {
		let harness = Self::signed_in(name).await;
		harness.plant(INSTANCE).await;
		harness
	}

	fn seed(&self, members: &[Value]) {
		self.relay.members.lock().expect("the relay").extend_from_slice(members);
	}

	fn member_calls(&self) -> Vec<String> {
		self.relay.member_calls.lock().expect("the relay").clone()
	}

	fn forget_member_calls(&self) {
		self.relay.member_calls.lock().expect("the relay").clear();
	}

	fn cloud_answers(&self, status: StatusCode, body: Value) {
		*self.relay.member_answer.lock().expect("the relay") = Some((status, body));
	}

	fn heard_member_lists(&self) -> Vec<Value> {
		let heard = self.heard_members.lock().expect("the events");
		heard
			.iter()
			.inspect(|change| assert_eq!(change["spaceId"], PERSONAL))
			.map(|change| change["members"].clone())
			.collect()
	}

	async fn listed(&self) -> Result<Vec<Member>, MembersError> {
		list(self.app.handle(), PERSONAL.to_owned()).await
	}

	async fn invited(&self, email: &str) -> Result<Member, MembersError> {
		invite(self.app.handle(), PERSONAL.to_owned(), email.to_owned()).await
	}

	async fn withdrawn(&self, user_id: &str) -> Result<Vec<Member>, MembersError> {
		withdraw(self.app.handle(), PERSONAL.to_owned(), user_id.to_owned()).await
	}

	async fn removed(&self, user_id: &str) -> Result<Vec<Member>, MembersError> {
		remove(self.app.handle(), PERSONAL.to_owned(), user_id.to_owned()).await
	}

	async fn listed_with_a_guest_and_a_joiner(&self) {
		self.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "joined"),
		]);
		self.listed().await.expect("the members list");
		self.forget_member_calls();
	}
}

fn member(user_id: &str, email: &str, status: MemberStatus) -> Member {
	Member { user_id: user_id.to_owned(), name: None, email: email.to_owned(), status }
}

fn user_ids(members: &[Member]) -> Vec<&str> {
	members.iter().map(|member| member.user_id.as_str()).collect()
}

#[test]
fn the_members_are_listed_in_the_cloud_order_with_a_status_each() {
	run(async {
		let harness = Harness::hosted("members-list").await;
		harness.seed(&[
			json!({ "userId": "joiner", "email": "joiner@example.com", "name": "Joiner", "role": "member", "state": "joined" }),
			cloud_member("guest", "guest@example.com", "member", "pending"),
		]);

		let members = harness.listed().await.expect("the members list");

		assert_eq!(
			members,
			vec![
				member("owner", OWNER_EMAIL, MemberStatus::Host),
				Member {
					name: Some("Joiner".to_owned()),
					..member("joiner", "joiner@example.com", MemberStatus::Joined)
				},
				member("guest", "guest@example.com", MemberStatus::Pending),
			]
		);
		assert_eq!(harness.member_calls(), vec!["GET"]);
	});
}

#[test]
fn an_invite_is_trimmed_lowercased_posted_and_answered_pending_with_the_list_read_back() {
	run(async {
		let harness = Harness::hosted("members-invite").await;

		let invited = harness.invited("  Ada@Example.COM ").await.expect("the invite lands");

		assert_eq!(invited.email, "ada@example.com");
		assert_eq!(invited.status, MemberStatus::Pending);
		assert_eq!(harness.member_calls(), vec!["POST ada@example.com", "GET"]);
		let heard = harness.heard_member_lists();
		assert_eq!(heard.len(), 1);
		assert_eq!(heard[0][1]["email"], "ada@example.com");
		assert_eq!(heard[0][1]["status"], "pending");
	});
}

#[test]
fn a_pending_member_is_withdrawn_and_a_joined_one_removed_each_read_back() {
	run(async {
		let harness = Harness::hosted("members-end").await;
		harness.listed_with_a_guest_and_a_joiner().await;

		let withdrawn = harness.withdrawn("guest").await.expect("the invitation is withdrawn");
		let removed = harness.removed("joiner").await.expect("the member is removed");

		assert_eq!(user_ids(&withdrawn), vec!["owner", "joiner"]);
		assert_eq!(user_ids(&removed), vec!["owner"]);
		assert_eq!(
			harness.member_calls(),
			vec!["GET", "DELETE guest", "GET", "GET", "DELETE joiner", "GET"]
		);
		let heard = harness.heard_member_lists();
		assert_eq!(heard.len(), 3);
		assert_eq!(
			heard[2],
			json!([{ "userId": "owner", "name": null, "email": OWNER_EMAIL, "status": "host" }])
		);
	});
}

#[test]
fn what_is_not_an_email_is_refused_before_the_cloud_and_a_cloud_400_alike() {
	run(async {
		let harness = Harness::hosted("members-not-email").await;

		assert_eq!(harness.invited("ada@").await, Err(MembersError::NotAnEmail));
		assert!(harness.member_calls().is_empty());

		harness.cloud_answers(
			StatusCode::BAD_REQUEST,
			json!({ "error": { "code": "INVALID_EMAIL" } }),
		);
		assert_eq!(harness.invited("ada@example.com").await, Err(MembersError::NotAnEmail));
		assert_eq!(harness.member_calls(), vec!["POST ada@example.com"]);
	});
}

#[test]
fn the_own_account_email_is_refused_before_the_cloud() {
	run(async {
		let harness = Harness::hosted("members-own").await;
		restore(harness.app.handle().clone()).await;

		assert_eq!(harness.invited(" Owner@Example.com").await, Err(MembersError::OwnAccount));
		assert!(harness.member_calls().is_empty());
	});
}

#[test]
fn the_cloud_conflicts_are_typed_refusals() {
	run(async {
		let harness = Harness::hosted("members-conflicts").await;

		for (code, refusal) in [
			("ALREADY_MEMBER", MembersError::AlreadyInvited),
			("MEMBER_LIMIT_REACHED", MembersError::LimitReached),
		] {
			harness.cloud_answers(StatusCode::CONFLICT, json!({ "error": { "code": code } }));
			assert_eq!(harness.invited("ada@example.com").await, Err(refusal));
		}
		assert!(harness.heard_member_lists().is_empty());
	});
}

#[test]
fn a_status_mismatch_the_host_or_an_unknown_member_is_refused_from_a_fresh_read_without_delete() {
	run(async {
		let harness = Harness::hosted("members-mismatch").await;
		harness.listed_with_a_guest_and_a_joiner().await;

		assert_eq!(harness.withdrawn("joiner").await, Err(MembersError::NotPending));
		assert_eq!(harness.removed("guest").await, Err(MembersError::NotJoined));
		assert_eq!(harness.withdrawn("owner").await, Err(MembersError::HostNotRemovable));
		assert_eq!(harness.removed("owner").await, Err(MembersError::HostNotRemovable));
		assert_eq!(harness.removed("stranger").await, Err(MembersError::UnknownMember));
		assert_eq!(harness.withdrawn("stranger").await, Err(MembersError::UnknownMember));
		assert_eq!(harness.member_calls(), vec!["GET"; 6]);
	});
}

#[test]
fn withdraw_and_remove_succeed_on_a_space_never_listed_in_this_process() {
	run(async {
		let harness = Harness::hosted("members-never-listed").await;
		harness.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "joined"),
		]);

		let withdrawn = harness.withdrawn("guest").await.expect("the invitation is withdrawn");
		let removed = harness.removed("joiner").await.expect("the member is removed");

		assert_eq!(user_ids(&withdrawn), vec!["owner", "joiner"]);
		assert_eq!(user_ids(&removed), vec!["owner"]);
		assert_eq!(
			harness.member_calls(),
			vec!["GET", "DELETE guest", "GET", "GET", "DELETE joiner", "GET"]
		);
	});
}

#[test]
fn the_status_is_decided_on_the_cloud_list_not_on_a_stale_one() {
	run(async {
		let harness = Harness::hosted("members-stale").await;
		harness.listed_with_a_guest_and_a_joiner().await;
		for member in harness.relay.members.lock().expect("the relay").iter_mut() {
			if member["userId"] == "guest" {
				member["state"] = json!("joined");
			}
		}

		assert_eq!(harness.withdrawn("guest").await, Err(MembersError::NotPending));
		let removed = harness.removed("guest").await.expect("the now joined guest is removed");

		assert_eq!(user_ids(&removed), vec!["owner", "joiner"]);
		assert_eq!(harness.member_calls(), vec!["GET", "GET", "DELETE guest", "GET"]);
	});
}

#[test]
fn a_space_without_an_instance_refuses_every_member_command_before_the_cloud() {
	run(async {
		let harness = Harness::signed_in("members-not-hosting").await;

		assert_eq!(harness.listed().await, Err(MembersError::NotHosting));
		assert_eq!(harness.invited("ada@example.com").await, Err(MembersError::NotHosting));
		assert_eq!(harness.withdrawn("guest").await, Err(MembersError::NotHosting));
		assert_eq!(harness.removed("joiner").await, Err(MembersError::NotHosting));
		assert!(harness.member_calls().is_empty());
	});
}

#[test]
fn a_cloud_401_needs_a_sign_in() {
	run(async {
		let harness = Harness::hosted("members-revoked").await;
		harness.listed_with_a_guest_and_a_joiner().await;
		harness.cloud_answers(StatusCode::UNAUTHORIZED, json!({}));

		assert_eq!(harness.listed().await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.invited("ada@example.com").await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.withdrawn("guest").await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.removed("joiner").await, Err(MembersError::NeedsSignIn));
	});
}

#[test]
fn a_5xx_or_an_unreadable_list_is_unreachable_with_its_cause() {
	run(async {
		let harness = Harness::hosted("members-5xx").await;

		harness.cloud_answers(StatusCode::SERVICE_UNAVAILABLE, json!({}));
		let Err(MembersError::Unreachable { reason }) = harness.listed().await else {
			panic!("a 503 is unreachable");
		};
		assert!(reason.contains("503"), "{reason}");

		harness.cloud_answers(StatusCode::OK, json!({ "members": [] }));
		let Err(MembersError::Unreachable { reason }) = harness.listed().await else {
			panic!("an unreadable list is unreachable");
		};
		assert!(reason.contains("did not parse"), "{reason}");
	});
}

#[test]
fn an_unreachable_cloud_is_unreachable_with_its_cause() {
	run(async {
		let closed = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = closed.local_addr().expect("the port is named");
		drop(closed);
		let root = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-hosting-down-{}", uuid::Uuid::new_v4())),
		);
		store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, BEARER).expect("the bearer is kept");
		let cloud = format!("http://{address}");
		let database = temp_dir();
		let app = an_app_of_its_own("hosting-down", mock_builder());
		app.manage::<DatabaseState>(Ok(db::open(&database)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		app.manage(Hosting::new(&cloud, None));
		let state = app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.registered(PERSONAL.to_owned(), INSTANCE.to_owned()).await.expect("planted");

		let listed = list(app.handle(), PERSONAL.to_owned()).await;

		let Err(MembersError::Unreachable { reason }) = listed else {
			panic!("a closed port is unreachable, not {listed:?}");
		};
		assert!(reason.contains("could not be reached"), "{reason}");
	});
}

#[test]
fn an_online_space_polls_its_members_and_announces_only_a_changed_list() {
	run(async {
		let mut harness =
			Harness::polling_members("members-poll", None, Some(BEARER), POLL_EVERY).await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let polled_a_few_times = || (harness.member_calls().len() >= 4).then_some(());
		harness.noticed_until("four member polls", polled_a_few_times).await;
		assert_eq!(harness.heard_member_lists().len(), 1);

		harness.seed(&[cloud_member("guest", "guest@example.com", "member", "pending")]);
		let changed_twice = || Some(harness.heard_member_lists()).filter(|heard| heard.len() == 2);
		let heard = harness.noticed_until("a second member list", changed_twice).await;
		assert_eq!(heard.len(), 2);
		assert_eq!(heard[1][1]["userId"], "guest");
	});
}

#[test]
fn an_online_space_polls_its_members_at_once_before_the_fifteen_seconds() {
	run(async {
		let mut harness = Harness::signed_in("members-at-once").await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let is_listed = || (!harness.heard_member_lists().is_empty()).then_some(());
		harness.noticed_until("a member list", is_listed).await;

		assert_eq!(harness.heard_member_lists().len(), 1);
		assert_eq!(harness.member_calls(), vec!["GET"]);
	});
}

#[test]
fn the_members_are_polled_every_fifteen_seconds() {
	assert_eq!(Hosting::new("http://127.0.0.1:9", None).members_every, Duration::from_secs(15));
}

#[test]
fn a_space_that_is_not_online_does_not_poll_its_members() {
	run(async {
		let harness =
			Harness::polling_members("members-offline", None, Some(BEARER), POLL_EVERY).await;
		harness.plant(INSTANCE).await;

		let hosts = harness.app.state::<Hosting>();
		assert!(hosts.hosts().get(PERSONAL).and_then(|host| host.run.as_ref()).is_none());
		assert!(harness.member_calls().is_empty());
	});
}

const ELSEWHERE: &str = "elsewhere";
const OTHER_SPACE_REFUSAL: &str = "this command reaches outside the shared space";
const TWO_SPACES: &str = "
	INSERT INTO spaces (id, name, colour, position, created_at)
		VALUES ('elsewhere', 'Elsewhere', 'blue', 1, 1);
	INSERT INTO sections (id, space_id, name, position, created_at)
		VALUES ('s-mine', 'personal', 'Mine', 0, 1), ('s-theirs', 'elsewhere', 'Theirs', 0, 1);
	INSERT INTO bots (id, name, model, created_at)
		VALUES ('b-mine', 'Mine', 'sonnet', 1), ('b-theirs', 'Theirs', 'sonnet', 1),
			('b-shared', 'Shared', 'sonnet', 1);
	INSERT INTO bot_spaces (bot_id, space_id, joined_at)
		VALUES ('b-mine', 'personal', 1), ('b-theirs', 'elsewhere', 1),
			('b-shared', 'elsewhere', 1), ('b-shared', 'personal', 2);
	INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
		VALUES ('c-mine', 'topic', 'personal', 'Mine', 1, 1),
			('c-theirs', 'topic', 'elsewhere', 'Theirs', 1, 1),
			('c-shared', 'topic', 'elsewhere', 'Shared', 1, 1);
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('c-shared', 'b-shared', 'lead', 1, 0);
	INSERT INTO turns (id, conversation_id, seq, started_at, completed_at)
		VALUES ('t-mine', 'c-mine', 1, 1, 1), ('t-theirs', 'c-theirs', 1, 1, 1);
	INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
		VALUES ('m-mine', 'c-mine', 't-mine', 1, 'user', 'mine', 'complete', 1),
			('m-theirs', 'c-theirs', 't-theirs', 1, 'user', 'theirs', 'complete', 1);
";

const A_JOINER: &str = "joiner-account";

struct Guest {
	harness: Harness,
	effects: HostEffects,
	member: WebSocket,
}

impl Guest {
	async fn of_two_spaces(name: &str) -> Self {
		let (mut harness, effects) = Harness::applying_host_effects(name).await;
		db::open(&effects.database)
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the two spaces are planted");
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		members_heard(&mut member).await;
		let mut guest = Self { harness, effects, member };
		guest.relay_listens().await;
		guest
	}

	async fn relay_listens(&mut self) {
		let probed = (CHANGED_EVENT, json!({ "spaceId": PERSONAL, "probe": 0 }));
		events::emit(self.harness.app.handle(), Event::untyped(probed.0), probed.1.clone())
			.expect("emitted");
		let expected = as_forwarded(probed);
		next_text(&mut self.member, |frame| *frame == expected).await;
	}

	async fn called(&mut self, command: &str, args: Value) -> Value {
		self.called_by(Some(A_JOINER), command, args).await
	}

	async fn called_by(&mut self, sender: Option<&str>, command: &str, args: Value) -> Value {
		let mut frame = json!({ "id": command, "command": command, "args": args });
		if let Some(sender) = sender {
			frame["sender"] = json!({ "accountId": sender });
		}
		send(&mut self.member, &frame.to_string()).await;
		answer(&mut self.member).await
	}

	async fn refused(&mut self, command: &str, args: Value) {
		assert_eq!(
			self.called(command, args.clone()).await,
			json!({ "id": command, "status": 403, "body": OTHER_SPACE_REFUSAL }),
			"{command} {args}"
		);
	}

	async fn forwarded(&mut self, command: &str, args: Value) {
		let answered = self.called(command, args.clone()).await;
		assert_eq!(answered["status"], json!(200), "{command} {args} {answered}");
	}
}

async fn kept_in_the_shared_space(command: &str, other: Value, shared: Value) {
	let mut guest = Guest::of_two_spaces(command).await;

	guest.refused(command, other).await;
	guest.forwarded(command, shared).await;

	assert_eq!(guest.effects.reached(), [command]);
	assert_eq!(guest.harness.state(), HostingState::Online);
}

async fn kept_in_the_space_named(command: &str, args: impl Fn(&str) -> Value) {
	kept_in_the_shared_space(command, args(ELSEWHERE), args(PERSONAL)).await;
}

fn space_named(space_id: &str) -> Value {
	json!({ "spaceId": space_id })
}

fn a_turn_summoning_a_bot() -> Value {
	json!({ "message": { "conversationId": "c-mine", "repliedToMessageId": null }, "summoned": ["b-mine"] })
}

fn an_approval_answer() -> Value {
	json!({ "scope": a_runtime_scope("c-mine"), "requestId": "p1", "decision": "allow" })
}

fn an_agent_launch() -> Value {
	json!({ "scope": a_runtime_scope("c-mine") })
}

async fn answered_as_today(command: &str, args: Value) {
	let mut guest = Guest::of_two_spaces(&format!("member-{command}")).await;

	guest.forwarded(command, args).await;

	assert_eq!(guest.effects.reached(), [command]);
}

#[test]
fn a_member_sends_a_turn() {
	run(answered_as_today("conversation_send_turn", a_turn_summoning_a_bot()));
}

#[test]
fn a_member_answers_an_approval() {
	run(answered_as_today("agent_respond_to_permission", an_approval_answer()));
}

#[test]
fn a_member_launches_an_agent() {
	run(answered_as_today("agent_start_or_resume_session", an_agent_launch()));
}

#[test]
fn a_member_reads_a_conversation_page() {
	run(answered_as_today(
		"conversation_message_page",
		json!({ "conversationId": "c-mine", "beforeSeq": null, "limit": 50 }),
	));
}

#[test]
fn a_write_without_a_sender_reaches_the_local_api() {
	run(async {
		let mut guest = Guest::of_two_spaces("write-without-sender").await;

		let answered =
			guest.called_by(None, "conversation_send_turn", a_turn_summoning_a_bot()).await;

		assert_eq!(answered["status"], json!(200), "{answered}");
		assert_eq!(guest.effects.reached(), ["conversation_send_turn"]);
	});
}

fn an_env_scope_of(space_id: &str) -> Value {
	json!({ "kind": "space", "id": space_id })
}

fn a_bot_env_scope(bot_id: &str, space_id: &str) -> Value {
	json!({ "kind": "bot", "id": bot_id, "spaceId": space_id })
}

fn a_search_of(space_id: &str) -> Value {
	json!({ "query": { "text": "mine", "spaceId": space_id } })
}

#[test]
fn a_member_lists_the_members_of_the_shared_space_only() {
	run(kept_in_the_space_named("hosting_members", space_named));
}

#[test]
fn a_member_invites_into_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_invite_member",
		|space_id| json!({ "spaceId": space_id, "email": "friend@example.com" }),
	));
}

#[test]
fn a_member_withdraws_an_invitation_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_withdraw_invitation",
		|space_id| json!({ "spaceId": space_id, "userId": "pending" }),
	));
}

#[test]
fn a_member_removes_a_member_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_remove_member",
		|space_id| json!({ "spaceId": space_id, "userId": "joined" }),
	));
}

#[test]
fn a_member_searches_the_messages_of_the_shared_space_only() {
	run(async {
		let command = "search_messages";
		let mut guest = Guest::of_two_spaces(command).await;

		guest.refused(command, a_search_of(ELSEWHERE)).await;
		guest.forwarded(command, a_search_of(PERSONAL)).await;

		assert_eq!(guest.effects.reached(), [command]);
	});
}

#[test]
fn a_member_shuts_down_a_session_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"agent_shutdown",
		json!({ "scope": a_runtime_scope("c-theirs") }),
		json!({ "scope": a_runtime_scope("c-mine") }),
	));
}

#[test]
fn a_member_reads_the_live_sessions_of_the_shared_space_only() {
	run(kept_in_the_space_named("agent_live_sessions_in_space", space_named));
}

#[test]
fn a_member_lists_the_env_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"env_list",
		json!({ "scope": an_env_scope_of(ELSEWHERE) }),
		json!({ "scope": an_env_scope_of(PERSONAL) }),
	));
}

#[test]
fn a_member_sets_an_env_entry_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"env_set",
		json!({ "scope": an_env_scope_of(ELSEWHERE), "name": "GREETING", "value": "member" }),
		json!({ "scope": an_env_scope_of(PERSONAL), "name": "GREETING", "value": "member" }),
	));
}

#[test]
fn a_member_deletes_an_env_entry_of_a_bot_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"env_delete",
		json!({ "scope": a_bot_env_scope("b-theirs", ELSEWHERE), "name": "GREETING" }),
		json!({ "scope": a_bot_env_scope("b-mine", PERSONAL), "name": "GREETING" }),
	));
}

#[test]
fn a_member_reads_the_application_status_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"mcp_application_status",
		json!({ "owner": an_env_scope_of(ELSEWHERE) }),
		json!({ "owner": an_env_scope_of(PERSONAL) }),
	));
}

#[test]
fn a_member_disconnects_an_application_of_the_shared_space_only() {
	let disconnect = |owner: Value| json!({ "owner": owner, "name": "granola", "url": "https://granola.test/mcp" });
	run(kept_in_the_shared_space(
		"mcp_oauth_disconnect",
		disconnect(an_env_scope_of(ELSEWHERE)),
		disconnect(an_env_scope_of(PERSONAL)),
	));
}

#[test]
fn a_member_reaches_no_env_or_application_of_the_host_person_or_outside_the_shared_space() {
	run(async {
		let mut guest = Guest::of_two_spaces("env-outside").await;
		let outside = [
			json!({ "kind": "user" }),
			a_bot_env_scope("b-theirs", PERSONAL),
			a_bot_env_scope("b-mine", ELSEWHERE),
			json!({ "kind": "server", "name": "clock", "owner": an_env_scope_of(PERSONAL) }),
		];
		let held_with_another_space = a_bot_env_scope("b-shared", PERSONAL);

		for scope in outside.clone() {
			guest.refused("env_list", json!({ "scope": scope })).await;
			guest.refused("mcp_application_status", json!({ "owner": scope })).await;
		}
		for scope in outside.into_iter().chain([held_with_another_space]) {
			guest.refused("env_set", json!({ "scope": scope, "name": "A", "value": "b" })).await;
			guest.refused("env_delete", json!({ "scope": scope, "name": "A" })).await;
			guest
				.refused(
					"mcp_oauth_disconnect",
					json!({ "owner": scope, "name": "granola", "url": "https://granola.test/mcp" }),
				)
				.await;
		}

		assert!(guest.effects.reached().is_empty(), "{:?}", guest.effects.reached());
	});
}

#[test]
fn the_live_sessions_in_a_space_hold_only_the_sessions_of_its_conversations() {
	run(async {
		let guest = Guest::of_two_spaces("live-sessions-in-space").await;
		let app = guest.harness.app.handle();
		let scope_in = |conversation_id: &str, bot_id: &str| agent::RuntimeScope {
			conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
			runtime_session_id: format!("r-{conversation_id}"),
			epoch: 0,
		};
		commands::a_run_held_by_the_app(app, scope_in("c-mine", "b-mine"));
		commands::a_run_held_by_the_app(app, scope_in("c-theirs", "b-theirs"));
		commands::a_run_held_by_the_app(app, scope_in("c-shared", "b-shared"));

		let listed =
			commands::agent_live_sessions_in_space(app.state(), app.state(), PERSONAL.to_owned())
				.await
				.expect("the sessions read");

		let conversations: Vec<&str> =
			listed.iter().map(|session| session.conversation_id.as_str()).collect();
		assert_eq!(conversations, ["c-mine"]);
		assert_eq!(listed[0].bot_id, "b-mine");
		assert_eq!(listed[0].runtime_session_id, "r-c-mine");
	});
}

fn held_of(command: &str, index: usize) -> reach::Held {
	match reach::reach_of(command) {
		Some(reach::Reach::Scoped(helds)) => helds[index],
		reach => panic!("{command} is not scoped: {reach:?}"),
	}
}

async fn shared_space_refusal(guest: &Guest, command: &str, args: Value) -> reach::Refusal {
	reach::stays_in_the_shared_space(guest.harness.app.handle(), PERSONAL, command, &args)
		.await
		.expect_err("the call is refused")
}

#[test]
fn the_shared_space_check_names_a_conversation_of_another_space() {
	run(async {
		let guest = Guest::of_two_spaces("refusal-other-space").await;

		let refusal = shared_space_refusal(
			&guest,
			"conversation_message_page",
			json!({ "conversationId": "c-theirs", "beforeSeq": null, "limit": 10 }),
		)
		.await;

		assert_eq!(
			refusal,
			reach::Refusal::Unheld {
				held: held_of("conversation_message_page", 0),
				offending: reach::Offending::Value(json!("c-theirs")),
			}
		);
	});
}

#[test]
fn the_shared_space_check_names_a_missing_required_id_as_absent() {
	run(async {
		let guest = Guest::of_two_spaces("refusal-absent").await;

		let missing = shared_space_refusal(&guest, "conversation_message_page", json!({})).await;
		let null = shared_space_refusal(
			&guest,
			"conversation_message_page",
			json!({ "conversationId": null }),
		)
		.await;

		let absent = reach::Refusal::Unheld {
			held: held_of("conversation_message_page", 0),
			offending: reach::Offending::Absent,
		};
		assert_eq!(missing, absent);
		assert_eq!(null, absent);
	});
}

#[test]
fn the_shared_space_check_names_the_first_unheld_id_of_an_array() {
	run(async {
		let guest = Guest::of_two_spaces("refusal-array").await;

		let refusal = shared_space_refusal(
			&guest,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "botIds": ["b-mine", "b-theirs", "b-other"] }),
		)
		.await;

		assert_eq!(
			refusal,
			reach::Refusal::Unheld {
				held: held_of("conversation_create", 2),
				offending: reach::Offending::Value(json!("b-theirs")),
			}
		);
	});
}

#[test]
fn the_refusal_line_names_the_command_sender_space_argument_check_and_value() {
	let refusal = reach::Refusal::Unheld {
		held: held_of("conversation_message_page", 0),
		offending: reach::Offending::Value(json!("c-theirs")),
	};

	assert_eq!(
		reach::refusal_line("conversation_message_page", Some("acc-1"), PERSONAL, &refusal),
		"the relayed conversation_message_page from sender \"acc-1\" was refused outside shared \
		 space personal: /conversationId failed the Conversation check with \"c-theirs\""
	);
}

#[test]
fn the_refusal_line_logs_a_missing_value_as_absent_and_no_sender_as_none() {
	let refusal = reach::Refusal::Unheld {
		held: held_of("conversation_list", 0),
		offending: reach::Offending::Absent,
	};

	assert_eq!(
		reach::refusal_line("conversation_list", None, PERSONAL, &refusal),
		"the relayed conversation_list from sender none was refused outside shared space \
		 personal: /spaceId failed the Space check with absent"
	);
}

#[test]
fn the_refusal_line_names_the_reach_when_there_is_no_argument() {
	assert_eq!(
		reach::refusal_line("account_get", None, PERSONAL, &reach::Refusal::HostOnly),
		"the relayed account_get from sender none was refused outside shared space personal: \
		 its reach is HostOnly"
	);
	assert_eq!(
		reach::refusal_line("unknown", None, PERSONAL, &reach::Refusal::NoReach),
		"the relayed unknown from sender none was refused outside shared space personal: \
		 it has no reach"
	);
}

#[test]
fn the_refusal_line_caps_the_value_at_200_characters() {
	let refusal = reach::Refusal::Unheld {
		held: held_of("conversation_message_page", 0),
		offending: reach::Offending::Value(json!("x".repeat(500))),
	};

	let line = reach::refusal_line("conversation_message_page", None, PERSONAL, &refusal);

	let value = line.rsplit(" with ").next().expect("a value is logged");
	assert_eq!(value, format!("\"{}", "x".repeat(199)));
}

#[test]
fn a_relay_guest_reads_the_bots_of_the_shared_space_only() {
	run(kept_in_the_space_named("conversation_bots", space_named));
}

#[test]
fn a_relay_guest_reads_the_bots_by_presence_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_bots_by_presence",
		|space_id| json!({ "spaceId": space_id, "excludedConversationId": null }),
	));
}

#[test]
fn a_relay_guest_creates_a_bot_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_create_bot",
		|space_id| json!({ "spaceId": space_id, "identity": {} }),
	));
}

#[test]
fn a_relay_guest_creates_a_bot_from_a_draft_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_create_bot_from_draft",
		|space_id| json!({ "spaceId": space_id, "draft": {} }),
	));
}

#[test]
fn a_relay_guest_duplicates_a_bot_into_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_duplicate_bot",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_opens_a_main_chat_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_main_chat",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_creates_a_conversation_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_create",
		|space_id| json!({ "spaceId": space_id, "sectionId": null, "title": "t", "botIds": ["b-mine"] }),
	));
}

#[test]
fn a_relay_guest_lists_the_conversations_of_the_shared_space_only() {
	run(kept_in_the_space_named("conversation_list", space_named));
}

#[test]
fn a_relay_guest_pages_the_conversations_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_page",
		|space_id| json!({ "spaceId": space_id, "cursor": null, "limit": null }),
	));
}

#[test]
fn a_relay_guest_reads_the_hosting_state_of_the_shared_space_only() {
	run(kept_in_the_space_named("hosting_state", space_named));
}

#[test]
fn a_relay_guest_reads_the_mission_feed_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"mission_space_feed",
		|space_id| json!({ "spaceId": space_id, "closedSince": 0 }),
	));
}

#[test]
fn a_relay_guest_pages_the_mission_feed_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"mission_space_page",
		|space_id| json!({ "spaceId": space_id, "closedSince": 0, "cursor": null, "limit": null }),
	));
}

#[test]
fn a_relay_guest_searches_the_catalogue_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"search_catalogue",
		|space_id| json!({ "query": "q", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_reads_the_recent_chats_of_the_shared_space_only() {
	run(kept_in_the_space_named("search_recent", |space_id| json!({ "spaceId": space_id })));
}

#[test]
fn a_relay_guest_asking_for_every_space_is_answered_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("all-spaces").await;
		let mut messages = a_search_of(PERSONAL);
		messages["query"]["allSpaces"] = json!(true);

		let catalogue = guest
			.called(
				"search_catalogue",
				json!({ "query": "", "spaceId": PERSONAL, "allSpaces": true }),
			)
			.await;
		let recent =
			guest.called("search_recent", json!({ "spaceId": PERSONAL, "allSpaces": true })).await;
		let hits = guest.called("search_messages", messages).await;

		let spaces_of = |rows: &Value| -> Vec<String> {
			rows.as_array()
				.expect("a list of rows")
				.iter()
				.map(|row| row["spaceId"].as_str().expect("a space id").to_owned())
				.collect()
		};
		assert_eq!(spaces_of(&catalogue["body"]["chats"]), [PERSONAL], "{catalogue}");
		assert_eq!(spaces_of(&recent["body"]), [PERSONAL], "{recent}");
		assert_eq!(spaces_of(&hits["body"]), [PERSONAL], "{hits}");
		assert_eq!(
			guest.effects.reached(),
			["search_catalogue", "search_recent", "search_messages"]
		);
	});
}

#[test]
fn a_relay_guest_lists_the_sections_of_the_shared_space_only() {
	run(kept_in_the_space_named("section_list", space_named));
}

#[test]
fn a_relay_guest_creates_a_section_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"section_create",
		|space_id| json!({ "spaceId": space_id, "name": "n" }),
	));
}

#[test]
fn a_relay_guest_pins_the_roster_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"roster_pin",
		|space_id| json!({ "spaceId": space_id, "pins": [] }),
	));
}

#[test]
fn a_relay_guest_moves_a_bot_to_a_section_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"bot_move_to_section",
		|space_id| json!({ "botId": "b-mine", "sectionId": "s-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_updates_the_shared_space_only() {
	run(kept_in_the_space_named(
		"space_update",
		|space_id| json!({ "id": space_id, "name": "n", "colour": null }),
	));
}

#[test]
fn a_relay_guest_cannot_move_a_bot_out_of_the_shared_space() {
	run(kept_in_the_space_named(
		"bot_move_to_space",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_adds_a_bot_to_the_shared_space_only() {
	run(kept_in_the_space_named(
		"bot_add_to_space",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id, "sectionId": null }),
	));
}

#[test]
fn a_relay_guest_removes_a_bot_from_the_shared_space_only() {
	run(kept_in_the_space_named(
		"bot_remove_from_space",
		|space_id| json!({ "botId": "b-shared", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_reads_the_preferences_of_the_shared_space_only() {
	run(kept_in_the_space_named("space_preferences", space_named));
}

#[test]
fn a_relay_guest_sets_the_preferences_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"space_set_preferences",
		|space_id| json!({ "spaceId": space_id, "preferences": {} }),
	));
}

#[test]
fn a_relay_guest_reaches_the_plugin_of_the_shared_space_or_its_bots_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("plugin-scopes").await;
		let plugin_commands: Vec<&str> = super::reach::REACHES
			.iter()
			.map(|(command, _)| *command)
			.filter(|command| command.starts_with("plugin_"))
			.collect();

		for command in &plugin_commands {
			for other in [
				json!({ "kind": "space", "id": ELSEWHERE }),
				json!({ "kind": "bot", "id": "b-theirs" }),
				json!({ "kind": "space" }),
			] {
				guest.refused(command, json!({ "scope": other })).await;
			}
			for shared in [
				json!({ "kind": "space", "id": PERSONAL }),
				json!({ "kind": "bot", "id": "b-mine" }),
			] {
				guest.forwarded(command, json!({ "scope": shared })).await;
			}
			let shared_in = json!({ "scope": { "kind": "bot", "id": "b-shared" } });
			if PLUGIN_READS.contains(command) {
				guest.forwarded(command, shared_in).await;
			} else {
				guest.refused(command, shared_in).await;
			}
		}

		let reached = guest.effects.reached();
		assert_eq!(reached.len(), plugin_commands.len() * 2 + PLUGIN_READS.len());
	});
}

#[test]
fn a_relay_guest_omitting_the_space_id_is_refused() {
	run(async {
		let mut guest = Guest::of_two_spaces("omitted-space").await;

		guest.refused("conversation_list", json!({})).await;
		guest.refused("conversation_list", json!({ "spaceId": null })).await;

		assert!(guest.effects.reached().is_empty());
	});
}

#[test]
fn a_relay_guest_reads_a_conversation_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_message_page",
		json!({ "conversationId": "c-theirs", "beforeSeq": null, "limit": 10 }),
		json!({ "conversationId": "c-mine", "beforeSeq": null, "limit": 10 }),
	));
}

#[test]
fn a_relay_guest_cannot_seat_a_bot_of_another_space_in_a_shared_conversation() {
	run(kept_in_the_shared_space(
		"conversation_add_participant",
		json!({ "conversationId": "c-mine", "botId": "b-theirs", "invitedByBotId": null }),
		json!({ "conversationId": "c-mine", "botId": "b-shared", "invitedByBotId": null }),
	));
}

#[test]
fn a_relay_guest_updates_a_bot_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_update_bot",
		json!({ "id": "b-theirs", "identity": {} }),
		json!({ "id": "b-mine", "identity": {} }),
	));
}

#[test]
fn a_bot_added_to_the_shared_space_from_another_one_belongs_to_the_shared_space() {
	run(kept_in_the_shared_space(
		"conversation_bot_commands",
		json!({ "botId": "b-theirs" }),
		json!({ "botId": "b-shared" }),
	));
}

#[test]
fn a_relay_guest_cannot_start_a_conversation_seating_a_bot_of_another_space() {
	run(kept_in_the_shared_space(
		"conversation_create",
		json!({ "spaceId": PERSONAL, "sectionId": null, "title": "t", "botIds": ["b-mine", "b-theirs"] }),
		json!({ "spaceId": PERSONAL, "sectionId": "s-mine", "title": "t", "botIds": ["b-mine", "b-shared"] }),
	));
}

#[test]
fn a_relay_guest_renames_a_section_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"section_rename",
		json!({ "id": "s-theirs", "name": "n" }),
		json!({ "id": "s-mine", "name": "n" }),
	));
}

#[test]
fn a_relay_guest_completes_a_turn_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_complete_turn",
		json!({ "id": "t-theirs", "completedAt": 1 }),
		json!({ "id": "t-mine", "completedAt": 1 }),
	));
}

#[test]
fn a_relay_guest_writes_a_message_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_append_user_message",
		json!({ "message": {
			"id": "new", "conversationId": "c-mine", "turnId": "t-mine",
			"authorBotId": null, "repliedToMessageId": "m-theirs", "content": "c", "createdAt": 1
		} }),
		json!({ "message": {
			"id": "new", "conversationId": "c-mine", "turnId": "t-mine",
			"authorBotId": "b-mine", "repliedToMessageId": "m-mine", "content": "c", "createdAt": 1
		} }),
	));
}

#[test]
fn a_relay_guest_naming_a_row_the_host_does_not_hold_is_refused() {
	run(async {
		let mut guest = Guest::of_two_spaces("unknown-child").await;

		guest.refused("conversation_delete", json!({ "conversationId": "c-unknown" })).await;
		guest.refused("conversation_delete_bot", json!({ "id": "b-unknown" })).await;
		guest.refused("mission_detail", json!({ "missionId": "mi-unknown" })).await;
		guest.refused("routine_key", json!({ "id": "r-unknown" })).await;
		guest.refused("routine_renew_lease", json!({ "runId": "run-unknown" })).await;

		assert!(guest.effects.reached().is_empty());
	});
}

#[test]
fn a_child_lookup_the_store_fails_is_refused() {
	run(async {
		let mut guest = Guest::of_two_spaces("failed-lookup").await;
		db::open(&guest.effects.database)
			.call_mut(|connection| {
				Ok(connection.execute_batch("ALTER TABLE sections RENAME TO sections_gone")?)
			})
			.await
			.expect("the sections table is moved away");

		guest.refused("section_rename", json!({ "id": "s-mine", "name": "n" })).await;

		assert!(guest.effects.reached().is_empty());
		assert_eq!(guest.harness.state(), HostingState::Online);
	});
}

const PLUGIN_READS: [&str; 5] = [
	"plugin_skills",
	"plugin_skill_file",
	"plugin_mcp_servers",
	"plugin_history",
	"plugin_history_diff",
];

async fn footprint_of(
	database: &std::path::Path,
	bot_id: &str,
) -> (bool, Vec<String>, Vec<String>) {
	let bot_id = bot_id.to_owned();
	db::open(database)
		.call(move |connection| {
			let texts = |query: &str| -> rusqlite::Result<Vec<String>> {
				let mut statement = connection.prepare(query)?;
				let rows = statement.query_map([&bot_id], |row| row.get(0))?;
				rows.collect()
			};
			let is_stored = !texts("SELECT id FROM bots WHERE id = ?1")?.is_empty();
			let spaces =
				texts("SELECT space_id FROM bot_spaces WHERE bot_id = ?1 ORDER BY space_id")?;
			let chats = texts(
				"SELECT conversation_id FROM conversation_participants WHERE bot_id = ?1
					ORDER BY conversation_id",
			)?;
			Ok((is_stored, spaces, chats))
		})
		.await
		.expect("the bot footprint reads")
}

async fn a_write_on_a_bot_in_two_spaces_is_refused(command: &str, args: Value) {
	let mut guest = Guest::of_two_spaces(command).await;
	let before = footprint_of(&guest.effects.database, "b-shared").await;

	guest.refused(command, args).await;

	assert!(guest.effects.reached().is_empty());
	assert_eq!(footprint_of(&guest.effects.database, "b-shared").await, before);
	assert_eq!(
		before,
		(true, vec![ELSEWHERE.to_owned(), PERSONAL.to_owned()], vec!["c-shared".to_owned()])
	);
}

async fn a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(command: &str, args: Value) {
	let mut guest = Guest::of_two_spaces(command).await;

	guest.forwarded(command, args).await;

	assert_eq!(guest.effects.reached(), [command]);
}

fn a_bot_plugin(bot_id: &str) -> Value {
	json!({ "scope": { "kind": "bot", "id": bot_id } })
}

#[test]
fn a_relay_guest_cannot_update_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_update_bot",
		json!({ "id": "b-shared", "identity": {} }),
	));
}

#[test]
fn a_relay_guest_updates_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_update_bot",
		json!({ "id": "b-mine", "identity": {} }),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_delete_bot",
		json!({ "id": "b-shared" }),
	));
}

#[test]
fn a_relay_guest_deletes_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_delete_bot",
		json!({ "id": "b-mine" }),
	));
}

#[test]
fn a_relay_guest_cannot_set_the_avatar_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_set_bot_avatar_image",
		json!({ "id": "b-shared", "bytes": [] }),
	));
}

#[test]
fn a_relay_guest_sets_the_avatar_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_set_bot_avatar_image",
		json!({ "id": "b-mine", "bytes": [] }),
	));
}

#[test]
fn a_relay_guest_cannot_set_the_memory_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_set_bot_memory",
		json!({ "id": "b-shared", "memory": "m" }),
	));
}

#[test]
fn a_relay_guest_sets_the_memory_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_set_bot_memory",
		json!({ "id": "b-mine", "memory": "m" }),
	));
}

#[test]
fn a_relay_guest_cannot_record_the_commands_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_record_bot_commands",
		json!({ "botId": "b-shared", "commands": [] }),
	));
}

#[test]
fn a_relay_guest_records_the_commands_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_record_bot_commands",
		json!({ "botId": "b-mine", "commands": [] }),
	));
}

#[test]
fn a_relay_guest_cannot_create_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_create_skill", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_creates_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_create_skill",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_update_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_update_skill", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_updates_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_update_skill",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_preload_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_set_skill_preloaded",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_preloads_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_set_skill_preloaded",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_delete_skill", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_deletes_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_delete_skill",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_write_a_skill_file_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_write_skill_file",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_writes_a_skill_file_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_write_skill_file",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_skill_file_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_delete_skill_file",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_deletes_a_skill_file_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_delete_skill_file",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_set_a_server_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_set_mcp_server",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_sets_a_server_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_set_mcp_server",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_server_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_delete_mcp_server",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_deletes_a_server_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_delete_mcp_server",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_revert_the_plugin_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_revert", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_reverts_the_plugin_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_revert",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_move_a_bot_also_in_another_space_into_the_shared_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"bot_move_to_space",
		json!({ "botId": "b-shared", "spaceId": PERSONAL }),
	));
}

#[test]
fn a_relay_guest_moves_a_bot_of_the_shared_space_alone_into_the_shared_space() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"bot_move_to_space",
		json!({ "botId": "b-mine", "spaceId": PERSONAL }),
	));
}

fn a_runtime_scope(conversation_id: &str) -> Value {
	json!({ "conversationId": conversation_id, "botId": "b-mine", "runtimeSessionId": "r", "epoch": 0 })
}

#[test]
fn a_relay_guest_cannot_pick_the_start_folder_of_a_session() {
	run(async {
		let command = "agent_start_or_resume_session";
		let mut guest = Guest::of_two_spaces("start-folder").await;

		guest.refused(command, json!({ "scope": a_runtime_scope("c-mine"), "cwd": "/" })).await;
		guest.forwarded(command, json!({ "scope": a_runtime_scope("c-mine"), "cwd": null })).await;
		guest.forwarded(command, json!({ "scope": a_runtime_scope("c-mine") })).await;

		assert_eq!(guest.effects.reached(), [command, command]);
	});
}

fn a_shared_space_marker() -> (&'static str, Value) {
	(CHANGED_EVENT, json!({ "spaceId": PERSONAL, "marker": true }))
}

fn as_forwarded((event, payload): (&str, Value)) -> Value {
	json!({ "event": { "event": event, "payload": payload } })
}

fn an_agent_event_of(scope: Value) -> (&'static str, Value) {
	(commands::EVENT_CHANNEL, json!({ "scope": scope, "event": { "type": "turnStarted" } }))
}

impl Guest {
	async fn first_event_after(&mut self, published: Vec<(&'static str, Value)>) -> Value {
		for (event, payload) in published {
			events::emit(self.harness.app.handle(), Event::untyped(event), payload)
				.expect("emitted");
		}
		next_text(&mut self.member, |frame| frame.get("event").is_some()).await
	}

	async fn breaks_the_child_lookups(&self) {
		db::open(&self.effects.database)
			.call_mut(|connection| {
				Ok(connection.execute_batch("ALTER TABLE conversations RENAME TO gone")?)
			})
			.await
			.expect("the conversations table is renamed");
	}
}

fn a_conversation_in(space_id: &str) -> &'static str {
	if space_id == PERSONAL {
		"c-mine"
	} else {
		"c-theirs"
	}
}

async fn only_the_shared_space_frame_is_heard(of_space: impl Fn(&str) -> (&'static str, Value)) {
	let mut guest = Guest::of_two_spaces("scoped-event").await;

	let heard = guest.first_event_after(vec![of_space(ELSEWHERE), of_space(PERSONAL)]).await;

	assert_eq!(heard, as_forwarded(of_space(PERSONAL)));
}

#[test]
fn a_relay_guest_hears_an_agent_event_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		an_agent_event_of(a_runtime_scope(a_conversation_in(space_id)))
	}));
}

#[test]
fn a_relay_guest_hears_a_routine_change_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		(ROUTINE_CHANGED_EVENT, json!({ "conversationId": a_conversation_in(space_id) }))
	}));
}

#[test]
fn a_relay_guest_hears_a_hosting_change_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		(CHANGED_EVENT, json!({ "spaceId": space_id, "state": "online" }))
	}));
}

#[test]
fn a_relay_guest_hears_a_members_change_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		(MEMBERS_CHANGED_EVENT, json!({ "spaceId": space_id, "members": [] }))
	}));
}

#[test]
fn a_relay_guest_hears_no_host_only_event() {
	run(async {
		let mut guest = Guest::of_two_spaces("host-only-events").await;
		let host_only = reach::AUDIENCES
			.iter()
			.filter(|(_, audience)| matches!(audience, reach::Audience::HostOnly))
			.map(|(event, _)| (*event, json!({ "spaceId": PERSONAL, "conversationId": "c-mine" })));

		let heard =
			guest.first_event_after(host_only.chain([a_shared_space_marker()]).collect()).await;

		assert_eq!(heard, as_forwarded(a_shared_space_marker()));
	});
}

async fn kept_off_the_relay(published: (&'static str, Value)) {
	let mut guest = Guest::of_two_spaces("kept-off").await;

	let heard = guest.first_event_after(vec![published, a_shared_space_marker()]).await;

	assert_eq!(heard, as_forwarded(a_shared_space_marker()));
}

#[test]
fn a_relay_guest_hears_no_event_left_unclassified() {
	run(kept_off_the_relay(("test://unclassified", json!({ "spaceId": PERSONAL }))));
}

#[test]
fn a_relay_guest_hears_no_event_whose_payload_misses_its_scope() {
	run(kept_off_the_relay((ROUTINE_CHANGED_EVENT, json!({ "conversationId": null }))));
}

#[test]
fn a_relay_guest_hears_no_event_whose_child_lookup_failed() {
	run(async {
		let mut guest = Guest::of_two_spaces("failed-lookup").await;
		guest.breaks_the_child_lookups().await;

		let published = vec![an_agent_event_of(a_runtime_scope("c-mine")), a_shared_space_marker()];
		let heard = guest.first_event_after(published).await;

		assert_eq!(heard, as_forwarded(a_shared_space_marker()));
	});
}

#[test]
fn a_relay_guest_hears_a_known_child_again_without_another_lookup() {
	run(async {
		let mut guest = Guest::of_two_spaces("cached-child").await;
		let mine = an_agent_event_of(a_runtime_scope("c-mine"));
		assert_eq!(guest.first_event_after(vec![mine.clone()]).await, as_forwarded(mine.clone()));

		guest.breaks_the_child_lookups().await;
		let heard = guest.first_event_after(vec![mine.clone()]).await;

		assert_eq!(heard, as_forwarded(mine));
	});
}

impl Guest {
	async fn events_until_the_marker(&mut self) -> Vec<Value> {
		let marker = a_shared_space_marker();
		events::emit(self.harness.app.handle(), Event::untyped(marker.0), marker.1)
			.expect("emitted");
		let mut heard = Vec::new();
		loop {
			let frame = next_text(&mut self.member, |frame| frame.get("event").is_some()).await;
			if frame == as_forwarded(a_shared_space_marker()) {
				return heard;
			}
			heard.push(frame);
		}
	}
}

fn a_turn_of_the_shared_conversation() -> Vec<agent::AgentEvent> {
	let reply = agent::ChatMessage {
		id: "m-reply".to_owned(),
		role: agent::MessageRole::Assistant,
		text: "hello".to_owned(),
		completion: agent::MessageCompletion::Complete,
		timestamp: 1,
	};
	vec![
		agent::AgentEvent::TurnChanged { state: agent::TurnState::Running },
		agent::AgentEvent::MessageStarted {
			message: agent::ChatMessage {
				text: String::new(),
				completion: agent::MessageCompletion::Streaming,
				..reply.clone()
			},
		},
		agent::AgentEvent::MessageDelta { id: reply.id.clone(), seq: 1, text: reply.text.clone() },
		agent::AgentEvent::MessageCompleted { message: reply },
		agent::AgentEvent::TurnChanged { state: agent::TurnState::Idle },
	]
}

fn a_live_scope_of(conversation_id: &str) -> agent::RuntimeScope {
	serde_json::from_value(a_runtime_scope(conversation_id)).expect("a runtime scope")
}

#[test]
fn a_relay_guest_hears_every_event_of_a_host_turn_in_the_shared_conversation_in_order() {
	run(async {
		let mut guest = Guest::of_two_spaces("live-turn").await;
		let app = guest.harness.app.handle().clone();
		let scope = a_live_scope_of("c-mine");
		let run = commands::a_live_run(&app, scope.clone());
		let turn =
			agent::EventTurn { turn_id: "t-mine".to_owned(), conversation_id: "c-mine".to_owned() };
		let checking =
			agent::AgentEvent::ConnectionChanged { state: agent::ConnectionState::Checking };

		let elsewhere = commands::a_live_run(&app, a_live_scope_of("c-theirs"));
		let turn_elsewhere = agent::EventTurn {
			turn_id: "t-theirs".to_owned(),
			conversation_id: "c-theirs".to_owned(),
		};

		commands::a_host_wide_announce(&app, checking.clone());
		commands::a_host_wide_announce(&app, checking);
		for event in a_turn_of_the_shared_conversation() {
			elsewhere.emit(event.clone(), Some(turn_elsewhere.clone()));
			run.emit(event, Some(turn.clone()));
		}
		let heard = guest.events_until_the_marker().await;

		let expected: Vec<Value> = a_turn_of_the_shared_conversation()
			.into_iter()
			.map(|event| {
				let emitted = agent::ScopedEvent {
					scope: Some(scope.clone()),
					turn: Some(turn.clone()),
					event,
				};
				as_forwarded((
					commands::EVENT_CHANNEL,
					serde_json::to_value(emitted).expect("a payload"),
				))
			})
			.collect();
		assert_eq!(heard, expected);
	});
}

#[test]
fn a_relay_guest_hears_the_end_of_a_host_turn_in_the_shared_conversation() {
	run(async {
		let mut guest = Guest::of_two_spaces("turn-ended").await;
		let app = guest.harness.app.handle().clone();
		let scope = a_live_scope_of("c-mine");
		let run = commands::a_live_run(&app, scope.clone());
		let turn =
			agent::EventTurn { turn_id: "t-mine".to_owned(), conversation_id: "c-mine".to_owned() };
		let ended = agent::AgentEvent::TurnEnded {
			ended: agent::TurnEnded {
				session_id: None,
				outcome: agent::TurnOutcome::Completed,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		};

		run.emit(ended.clone(), Some(turn.clone()));
		let heard = guest.events_until_the_marker().await;

		let emitted = agent::ScopedEvent { scope: Some(scope), turn: Some(turn), event: ended };
		assert_eq!(
			heard,
			[as_forwarded((
				commands::EVENT_CHANNEL,
				serde_json::to_value(emitted).expect("a payload")
			))]
		);
	});
}

#[test]
fn a_host_wide_connection_check_reaches_no_relay_guest_and_is_not_logged_as_kept_off() {
	run(async {
		let mut guest = Guest::of_two_spaces("host-wide-check").await;
		let app = guest.harness.app.handle().clone();
		let mut published = events::subscribed(&app);

		commands::a_host_wide_announce(
			&app,
			agent::AgentEvent::ConnectionChanged { state: agent::ConnectionState::Checking },
		);
		let heard = guest.events_until_the_marker().await;

		assert_eq!(heard, Vec::<Value>::new());
		let frame: Value =
			serde_json::from_str(&published.recv().await.expect("the check is published"))
				.expect("a json frame");
		assert_eq!(frame["event"], json!(commands::EVENT_CHANNEL));
		assert_eq!(
			reach::verdict(commands::EVENT_CHANNEL, &frame["payload"]),
			reach::Verdict::HostOnly
		);
	});
}

const GUEST: &str = "guest-account";
const GUEST_EMAIL: &str = "guest@example.com";
const HOST_NAME: &str = "Ada on the host";

fn guest_sender() -> Value {
	json!({ "accountId": GUEST, "name": "Guest", "image": null })
}

struct Authoring {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	local: LocalApi,
	conversation_id: String,
	_root: RemovedOnDrop,
}

impl Authoring {
	async fn new(bearer: Option<&str>) -> Self {
		let cloud = served(Router::new().route("/me", get(me))).await;
		let app = an_app_of_its_own(
			"hosting-authorship",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		app.manage(db::bootstrap(app.handle()));
		let root = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-hosting-authorship-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		restore(app.handle().clone()).await;
		app.manage(webhook::start(app.handle().clone()));
		let local = super::local_api(app.handle()).expect("the local host api listens");
		app.manage(Hosting::new(&cloud, Some(local.clone())));
		app.state::<Hosting>().hosts().entry(PERSONAL.to_owned()).or_default().members =
			Some(vec![Member {
				user_id: GUEST.to_owned(),
				name: None,
				email: GUEST_EMAIL.to_owned(),
				status: MemberStatus::Joined,
			}]);
		let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
			.build()
			.expect("the window builds");
		let mut preferences = direct(&window, "user_preferences", json!({}));
		preferences["displayName"] = json!(HOST_NAME);
		direct(&window, "user_set_preferences", json!({ "preferences": preferences }));
		let chat = direct(&window, "conversation_main_chat", json!({ "botId": "default" }));
		let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
		Self { app, window, local, conversation_id, _root: root }
	}

	fn turn(&self, turn_id: &str) {
		direct(
			&self.window,
			"conversation_start_turn",
			json!({ "turn": { "id": turn_id, "conversationId": self.conversation_id, "startedAt": 1 } }),
		);
	}

	fn sent(&self, id: &str) -> Value {
		self.turn(id);
		self.unstarted(id)
	}

	fn unstarted(&self, id: &str) -> Value {
		json!({
			"message": {
				"id": id,
				"conversationId": self.conversation_id,
				"turnId": id,
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": "hello",
				"createdAt": 1,
				"authorAccountId": "forged-account",
				"authorName": "Forged",
			},
			"summoned": [],
		})
	}

	async fn relayed(&self, frame: Value) -> Value {
		let answer = self.answered(frame).await;
		assert_eq!(answer["status"], json!(200), "{answer}");
		answer["body"].clone()
	}

	async fn answered(&self, frame: Value) -> Value {
		let call = super::bridge::member_call(&frame.to_string()).expect("a member call");
		let answer = super::bridge::bridged(
			self.app.handle().clone(),
			self.local.clone(),
			PERSONAL.to_owned(),
			call,
		)
		.await;
		serde_json::from_str(&answer).expect("a json answer")
	}

	fn page(&self) -> Value {
		json!({ "conversationId": self.conversation_id, "beforeSeq": null, "limit": 50 })
	}

	fn reopened_store(&self) -> db::Database {
		let file = db::connection::file(self.app.handle()).expect("the store file is known");
		db::open(file.parent().expect("the store lives in a directory"))
	}

	async fn stored_authors(
		database: &db::Database,
		conversation_id: &str,
	) -> Vec<(String, Option<String>, Option<String>)> {
		database
			.messages()
			.page_messages(MessagePageQuery {
				conversation_id: conversation_id.to_owned(),
				before_seq: None,
				limit: 50,
			})
			.await
			.expect("the reopened store reads its page")
			.messages
			.into_iter()
			.filter(|message| message.role == MessageRole::User)
			.map(|message| (message.id, message.author.account_id, message.author.name))
			.collect()
	}

	fn stored_guest(id: &str) -> (String, Option<String>, Option<String>) {
		(id.to_owned(), Some(GUEST.to_owned()), Some(GUEST_EMAIL.to_owned()))
	}

	fn authors(page: &Value) -> Vec<(Value, Value, Value)> {
		page["messages"]
			.as_array()
			.expect("a page of messages")
			.iter()
			.map(|message| {
				(
					message["id"].clone(),
					message["authorAccountId"].clone(),
					message["authorName"].clone(),
				)
			})
			.collect()
	}
}

impl Drop for Authoring {
	fn drop(&mut self) {
		self.app.state::<Webhook>().stop();
	}
}

fn direct(window: &WebviewWindow<MockRuntime>, command: &str, body: Value) -> Value {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: command.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("a url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.unwrap_or_else(|error| panic!("{command} was refused: {error:?}"))
	.deserialize::<Value>()
	.expect("the answer is JSON")
}

#[test]
fn a_message_typed_on_the_host_and_one_relayed_from_a_guest_carry_two_authors_read_by_either_side()
{
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"sender": guest_sender(),
			"args": host.sent("relayed"),
		}))
		.await;

		let read_by_the_guest = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page(), "sender": guest_sender() }),
			)
			.await;
		let read_by_the_host = direct(&host.window, "conversation_message_page", host.page());

		let expected = vec![
			(json!("typed"), json!("owner"), json!(HOST_NAME)),
			(json!("relayed"), json!(GUEST), json!(GUEST_EMAIL)),
		];
		assert_eq!(Authoring::authors(&read_by_the_guest), expected);
		assert_eq!(Authoring::authors(&read_by_the_host), expected);
	});
}

#[test]
fn a_relayed_frame_stores_its_sender_over_a_forged_author_and_none_without_a_sender() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_append_user_message",
			"sender": guest_sender(),
			"args": { "message": host.sent("vouched")["message"] },
		}))
		.await;
		host.relayed(json!({
			"id": 2,
			"command": "conversation_send_user_message",
			"args": host.sent("anonymous"),
		}))
		.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![
				(json!("vouched"), json!(GUEST), json!(GUEST_EMAIL)),
				(json!("anonymous"), Value::Null, Value::Null),
			]
		);
		assert!(
			host.app.state::<Hosting>().relayed.is_empty(),
			"a vouched member outlived its call"
		);
	});
}

#[test]
fn a_message_written_on_a_signed_out_host_carries_no_account() {
	run(async {
		let host = Authoring::new(None).await;
		direct(
			&host.window,
			"conversation_append_user_message",
			json!({ "message": host.sent("typed")["message"] }),
		);

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("typed"), Value::Null, json!(HOST_NAME))]
		);
	});
}

#[test]
fn a_guest_message_sent_on_a_turn_it_opens_lands_on_the_host_with_its_author() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let seq = host
			.relayed(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"sender": guest_sender(),
				"args": host.unstarted("first"),
			}))
			.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert!(seq.is_i64(), "{seq}");
		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("first"), json!(GUEST), json!(GUEST_EMAIL))]
		);
	});
}

#[test]
fn a_guest_message_refused_by_the_host_answers_a_text_naming_the_refusal() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let mut elsewhere = host.unstarted("elsewhere");
		elsewhere["message"]["conversationId"] = json!("a-conversation-of-no-shared-space");

		let answer = host
			.answered(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"sender": guest_sender(),
				"args": elsewhere,
			}))
			.await;

		assert_eq!(answer["status"], json!(403), "{answer}");
		assert_eq!(answer["body"], json!(OTHER_SPACE_REFUSAL));
	});
}

#[test]
fn a_guest_reads_the_same_conversation_page_as_the_host_solo_rows_included() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let args = json!({ "spaceId": PERSONAL, "cursor": null, "limit": null });

		let read_by_the_guest = host
			.relayed(json!({
				"id": 1,
				"command": "conversation_page",
				"args": args,
				"sender": guest_sender(),
			}))
			.await;
		let read_by_the_host = direct(&host.window, "conversation_page", args);

		let solo_bot_of = |id: &Value| {
			read_by_the_guest["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == *id)
				.map(|row| row["soloBotId"].clone())
		};
		assert_eq!(read_by_the_guest, read_by_the_host);
		assert_eq!(read_by_the_guest["conversations"].as_array().map(Vec::len), Some(2));
		assert_eq!(solo_bot_of(&room["id"]), Some(Value::Null));
		assert_eq!(solo_bot_of(&json!(host.conversation_id)), Some(json!("default")));
	});
}

#[test]
fn a_guest_reads_the_open_turn_of_a_conversation_until_it_completes() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.turn("t1");
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
					"sender": guest_sender(),
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(host.conversation_id))
				.map(|row| row["activeTurn"].clone())
		};
		direct(
			&host.window,
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": "r1",
				"conversationId": host.conversation_id,
				"turnId": "t1",
				"authorBotId": "default",
				"repliedToMessageId": null,
				"createdAt": 2,
			} }),
		);

		let during_the_turn = read_by_the_guest().await;
		direct(
			&host.window,
			"conversation_finalize_message",
			json!({ "id": "r1", "completion": "complete", "settledText": null }),
		);
		let once_the_reply_settled = read_by_the_guest().await;
		direct(&host.window, "conversation_complete_turn", json!({ "id": "t1", "completedAt": 3 }));
		let after_the_turn = read_by_the_guest().await;

		let speaking = Some(json!({ "startedAt": 1, "botIds": ["default"] }));
		assert_eq!(during_the_turn, speaking);
		assert_eq!(once_the_reply_settled, speaking);
		assert_eq!(after_the_turn, Some(Value::Null));
	});
}

#[test]
fn a_guest_reads_the_open_turn_of_a_room_while_the_second_of_its_two_bots_still_writes() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let ada = direct(
			&host.window,
			"conversation_create_bot",
			json!({ "spaceId": PERSONAL, "identity": as_json(a_bot_identity()) }),
		);
		let ada = ada["id"].as_str().expect("the bot holds an id").to_owned();
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": ["default", ada] }),
		);
		let room_id = room["id"].as_str().expect("the room holds an id").to_owned();
		let state = host.app.state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		for bot_id in ["default", ada.as_str()] {
			let turn =
				NewTurn { id: "t1".to_owned(), conversation_id: room_id.clone(), started_at: 1 };
			messages.start_run(turn, bot_id.to_owned()).await.expect("the run starts");
		}
		let reply = |id: &str, bot_id: &str| {
			direct(
				&host.window,
				"conversation_open_assistant_message",
				json!({ "message": {
					"id": id,
					"conversationId": room_id,
					"turnId": "t1",
					"authorBotId": bot_id,
					"repliedToMessageId": null,
					"createdAt": 2,
				} }),
			);
		};
		let ended = |bot_id: &str| EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: bot_id.to_owned(),
			handed_to: Vec::new(),
			ended_at: 3,
		};
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
					"sender": guest_sender(),
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(room_id))
				.map(|row| row["activeTurn"].clone())
		};
		reply("r1", "default");
		reply("r2", &ada);

		messages.end_run(ended("default")).await.expect("the first run ends");
		let while_the_second_writes = read_by_the_guest().await;
		messages.end_run(ended(&ada)).await.expect("the second run ends");
		let after_the_last = read_by_the_guest().await;

		let mut both = vec!["default".to_owned(), ada.clone()];
		both.sort_unstable();
		assert_eq!(while_the_second_writes, Some(json!({ "startedAt": 1, "botIds": both })));
		assert_eq!(after_the_last, Some(Value::Null));
	});
}

#[test]
fn a_guest_reads_the_turn_as_not_working_once_a_handed_bot_misses_its_start_deadline() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.app.manage(TurnRunDeadlines::after(Duration::ZERO));
		let ada = direct(
			&host.window,
			"conversation_create_bot",
			json!({ "spaceId": PERSONAL, "identity": as_json(a_bot_identity()) }),
		);
		let ada = ada["id"].as_str().expect("the bot holds an id").to_owned();
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": ["default", ada] }),
		);
		let room_id = room["id"].as_str().expect("the room holds an id").to_owned();
		let state = host.app.state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: room_id.clone(), started_at: 1 };
		messages.start_run(turn, "default".to_owned()).await.expect("the run starts");
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
					"sender": guest_sender(),
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(room_id))
				.map(|row| row["activeTurn"].clone())
		};
		let (announced, mut updates) = mpsc::unbounded_channel();
		host.app.listen(CONVERSATION_UPDATED_EVENT, move |event| {
			let payload: Value =
				serde_json::from_str(event.payload()).expect("the payload is JSON");
			announced
				.send(payload["conversation"]["activeTurn"].clone())
				.expect("the test listens");
		});
		let handed = EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: "default".to_owned(),
			handed_to: vec![ada.clone()],
			ended_at: 2,
		};

		messages.end_run(handed).await.expect("the run ends handing over");
		let while_awaited = read_by_the_guest().await;
		arm_start_deadlines(host.app.handle(), &room_id, "t1", std::slice::from_ref(&ada));
		let announced_at_the_deadline = tokio::time::timeout(PATIENCE, updates.recv())
			.await
			.expect("the deadline announced in time");
		let after_the_deadline = read_by_the_guest().await;

		assert_eq!(while_awaited, Some(json!({ "startedAt": 1, "botIds": [ada] })));
		assert_eq!(announced_at_the_deadline, Some(Value::Null));
		assert_eq!(after_the_deadline, Some(Value::Null));
	});
}

#[test]
fn a_guest_message_naming_a_turn_of_another_conversation_is_refused_and_not_written() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.turn("taken");
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let mut borrowed = host.unstarted("borrowed");
		borrowed["message"]["conversationId"] = room["id"].clone();
		borrowed["message"]["turnId"] = json!("taken");

		let answer = host
			.answered(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"sender": guest_sender(),
				"args": borrowed,
			}))
			.await;
		let mut room_page = host.page();
		room_page["conversationId"] = room["id"].clone();
		let read = direct(&host.window, "conversation_message_page", room_page);

		assert_ne!(answer["status"], json!(200), "{answer}");
		assert_eq!(Authoring::authors(&read), vec![]);
	});
}

#[test]
fn a_relayed_guest_message_keeps_its_author_in_a_reopened_store_read_by_either_side() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"sender": guest_sender(),
			"args": host.unstarted("relayed"),
		}))
		.await;

		let reopened = host.reopened_store();
		reopened.messages().recover_unfinished().await.expect("the restart sweep runs");
		let read_by_the_restarted_host =
			Authoring::stored_authors(&reopened, &host.conversation_id).await;
		let read_by_the_guest = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page(), "sender": guest_sender() }),
			)
			.await;

		assert_eq!(read_by_the_restarted_host, vec![Authoring::stored_guest("relayed")]);
		assert_eq!(
			Authoring::authors(&read_by_the_guest),
			vec![(json!("relayed"), json!(GUEST), json!(GUEST_EMAIL))]
		);
	});
}

#[test]
fn every_later_write_on_a_relayed_guest_message_or_its_turn_leaves_its_author_unchanged() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let conversation_id = host.conversation_id.clone();
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"sender": guest_sender(),
			"args": host.unstarted("relayed"),
		}))
		.await;
		let reply = json!({ "message": {
			"id": "reply",
			"conversationId": conversation_id,
			"turnId": "relayed",
			"authorBotId": null,
			"repliedToMessageId": "relayed",
			"createdAt": 2,
		} });
		direct(&host.window, "conversation_open_assistant_message", reply);
		for id in ["reply", "relayed"] {
			direct(&host.window, "conversation_append_text", json!({ "id": id, "delta": "more" }));
			direct(
				&host.window,
				"conversation_finalize_message",
				json!({ "id": id, "completion": "complete", "settledText": "settled" }),
			);
		}
		direct(
			&host.window,
			"conversation_complete_turn",
			json!({ "id": "relayed", "completedAt": 3 }),
		);
		let pin = json!({
			"conversationId": conversation_id,
			"messageId": "relayed",
			"blockIndex": 0,
			"pinnedAt": 4,
		});
		host.relayed(json!({
			"id": 2,
			"command": "conversation_pin_message",
			"sender": guest_sender(),
			"args": pin,
		}))
		.await;
		host.relayed(json!({
			"id": 3,
			"command": "conversation_pin_message",
			"sender": { "accountId": "another-account" },
			"args": pin,
		}))
		.await;
		let state = host.app.state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		messages
			.replace_content("relayed".to_owned(), "rewritten".to_owned())
			.await
			.expect("the content is rewritten");
		messages
			.ensure_turn(NewTurn {
				id: "relayed".to_owned(),
				conversation_id: conversation_id.clone(),
				started_at: 5,
			})
			.await
			.expect("the turn is kept");
		messages.complete_turn("relayed".to_owned(), 6).await.expect("the turn completes");
		messages.recover_unfinished().await.expect("the restart sweep runs");
		let duplicate = host
			.answered(json!({
				"id": 4,
				"command": "conversation_append_user_message",
				"sender": { "accountId": "another-account" },
				"args": { "message": host.unstarted("relayed")["message"] },
			}))
			.await;

		let read = Authoring::stored_authors(&host.reopened_store(), &conversation_id).await;

		assert_ne!(duplicate["status"], json!(200), "{duplicate}");
		assert_eq!(read, vec![Authoring::stored_guest("relayed")]);
	});
}

#[test]
fn a_member_frame_names_the_conversation_its_reach_reads() {
	let sent = json!({ "message": { "conversationId": "c1" }, "summoned": [] });
	let paged = json!({ "conversationId": "c2", "beforeSeq": null, "limit": 50 });

	assert_eq!(reach::conversation_of("conversation_send_user_message", &sent), Some("c1"));
	assert_eq!(reach::conversation_of("conversation_message_page", &paged), Some("c2"));
	assert_eq!(reach::conversation_of("conversation_message_page", &json!({})), None);
	assert_eq!(reach::conversation_of("an_unknown_command", &paged), None);
}

#[test]
fn a_relayed_frame_ignores_a_forged_from_and_stores_the_account_of_its_sender() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"from": GUEST,
			"args": host.unstarted("from-only"),
		}))
		.await;
		host.relayed(json!({
			"id": 2,
			"command": "conversation_send_user_message",
			"from": "another-account",
			"sender": guest_sender(),
			"args": host.unstarted("from-and-sender"),
		}))
		.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![
				(json!("from-only"), Value::Null, Value::Null),
				(json!("from-and-sender"), json!(GUEST), json!(GUEST_EMAIL)),
			]
		);
	});
}

impl Guest {
	async fn first_event(&mut self) -> Value {
		next_text(&mut self.member, |frame| frame.get("event").is_some()).await
	}

	async fn conversation_created_in(&self, space_id: &str) -> Conversation {
		let app = self.harness.app.handle().clone();
		conversation_create(
			app,
			self.harness.app.state(),
			space_id.to_owned(),
			None,
			"New".to_owned(),
			vec![],
		)
		.await
		.expect("the conversation is created")
	}

	async fn conversation_updated(&self, conversation_id: &str) -> Conversation {
		let app = self.harness.app.handle().clone();
		let state = self.harness.app.state();
		conversation_update(
			app,
			state,
			conversation_id.to_owned(),
			"Renamed".to_owned(),
			String::new(),
			None,
		)
		.await
		.expect("the conversation is updated")
	}

	async fn conversation_deleted(&self, conversation_id: &str) {
		let app = self.harness.app.handle().clone();
		conversation_delete(app, self.harness.app.state(), conversation_id.to_owned())
			.await
			.expect("the conversation is deleted");
	}

	async fn paged_row(&self, conversation_id: &str) -> ConversationInPage {
		let app = self.harness.app.handle().clone();
		let page =
			conversation_page(app, self.harness.app.state(), PERSONAL.to_owned(), None, None)
				.await
				.expect("the page is read");
		page.conversations
			.into_iter()
			.find(|row| row.conversation.id == conversation_id)
			.expect("the conversation is on the page")
	}

	async fn first_conversation_updated(&mut self) -> Value {
		next_text(&mut self.member, |frame| frame["event"]["event"] == CONVERSATION_UPDATED_EVENT)
			.await
	}

	async fn companion_seated(
		&self,
		conversation_id: &str,
		bot_id: &str,
		invited_by_bot_id: Option<&str>,
	) -> Result<Conversation, TranscriptStoreError> {
		let app = self.harness.app.handle().clone();
		conversation_add_participant(
			app,
			self.harness.app.state(),
			conversation_id.to_owned(),
			bot_id.to_owned(),
			invited_by_bot_id.map(str::to_owned),
		)
		.await
	}

	async fn companion_removed(
		&self,
		conversation_id: &str,
		bot_id: &str,
	) -> Result<Conversation, TranscriptStoreError> {
		let app = self.harness.app.handle().clone();
		let state = self.harness.app.state();
		conversation_remove_participant(app, state, conversation_id.to_owned(), bot_id.to_owned())
			.await
	}

	async fn lead_given(
		&self,
		conversation_id: &str,
		bot_id: &str,
	) -> Result<Conversation, TranscriptStoreError> {
		let app = self.harness.app.handle().clone();
		let state = self.harness.app.state();
		conversation_set_lead(app, state, conversation_id.to_owned(), bot_id.to_owned()).await
	}

	async fn user_message_appended(&self, conversation_id: &str, turn_id: &str) -> i64 {
		let app = self.harness.app.handle().clone();
		let message = a_user_message(conversation_id, turn_id);
		conversation_append_user_message(app, self.harness.app.state(), Caller::Host, message)
			.await
			.expect("the message is appended")
	}

	async fn user_message_sent(&self, conversation_id: &str) -> i64 {
		let app = self.harness.app.handle().clone();
		let message = a_user_message(conversation_id, &format!("t-new-{conversation_id}"));
		conversation_send_user_message(app, self.harness.app.state(), Caller::Host, message, vec![])
			.await
			.expect("the message is sent")
	}

	async fn bot_created_in(&self, space_id: &str) -> Bot {
		let app = self.harness.app.handle().clone();
		let draft =
			BotDraft { name: "Fresh".to_owned(), job: String::new(), description: String::new() };
		conversation_create_bot_from_draft(
			app,
			self.harness.app.state(),
			draft,
			space_id.to_owned(),
		)
		.await
		.expect("the bot is created")
	}

	async fn bot_updated(&self, bot_id: &str) -> Bot {
		let app = self.harness.app.handle().clone();
		conversation_update_bot(app, self.harness.app.state(), bot_id.to_owned(), a_bot_identity())
			.await
			.expect("the bot is updated")
	}

	async fn bot_deleted(&self, bot_id: &str) {
		let app = self.harness.app.handle().clone();
		conversation_delete_bot(app, self.harness.app.state(), bot_id.to_owned())
			.await
			.expect("the bot is deleted");
	}
}

fn a_user_message(conversation_id: &str, turn_id: &str) -> NewUserMessage {
	NewUserMessage {
		id: format!("m-new-{conversation_id}"),
		conversation_id: conversation_id.to_owned(),
		turn_id: turn_id.to_owned(),
		author_bot_id: None,
		replied_to_message_id: None,
		content: "hello".to_owned(),
		created_at: 2,
	}
}

fn a_bot_identity() -> BotIdentity {
	BotIdentity {
		name: "Renamed".to_owned(),
		title: String::new(),
		model: "sonnet".to_owned(),
		avatar_blot: None,
		avatar_image_path: None,
		instructions: String::new(),
		denied_tools: Vec::new(),
		permissions: BotPermissions::default(),
		output_style: DEFAULT_OUTPUT_STYLE.to_owned(),
		effort: None,
	}
}

fn as_json(payload: impl serde::Serialize) -> Value {
	serde_json::to_value(payload).expect("the payload serializes")
}

fn the_stored_message(heard: &Value) -> (&Value, &Value, &Value, &Value) {
	let payload = &heard["event"]["payload"];
	(&heard["event"]["event"], &payload["conversationId"], &payload["seq"], &payload["content"])
}

#[test]
fn a_relay_guest_hears_a_message_appended_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("message-appended").await;

		guest.user_message_appended("c-theirs", "t-theirs").await;
		let seq = guest.user_message_appended("c-mine", "t-mine").await;
		let heard = guest.first_event().await;

		assert_eq!(
			the_stored_message(&heard),
			(&json!(MESSAGE_STORED_EVENT), &json!("c-mine"), &json!(seq), &json!("hello"))
		);
	});
}

#[test]
fn a_relay_guest_hears_a_message_sent_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("message-sent").await;

		guest.user_message_sent("c-theirs").await;
		let seq = guest.user_message_sent("c-mine").await;
		let heard = guest.first_event().await;

		assert_eq!(
			the_stored_message(&heard),
			(&json!(MESSAGE_STORED_EVENT), &json!("c-mine"), &json!(seq), &json!("hello"))
		);
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_created_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("conversation-created").await;

		guest.conversation_created_in(ELSEWHERE).await;
		let created = guest.conversation_created_in(PERSONAL).await;
		let heard = guest.first_event().await;

		let conversation = in_page(&created, created.created_at, None);
		let payload = json!({ "spaceId": PERSONAL, "conversation": conversation });
		assert_eq!(heard, as_forwarded((CONVERSATION_CREATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("conversation-updated").await;

		guest.conversation_updated("c-theirs").await;
		let updated = guest.conversation_updated("c-mine").await;
		let heard = guest.first_event().await;

		let conversation = in_page(&updated, 1, Some(the_last_word_of_mine()));
		let payload = json!({ "spaceId": PERSONAL, "conversation": conversation });
		assert_eq!(heard, as_forwarded((CONVERSATION_UPDATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_whose_last_word_is_the_message_sent() {
	run(async {
		let mut guest = Guest::of_two_spaces("last-word-sent").await;

		guest.user_message_sent("c-theirs").await;
		guest.user_message_sent("c-mine").await;
		let heard = guest.first_conversation_updated().await;
		let paged = guest.paged_row("c-mine").await;

		let conversation = &heard["event"]["payload"]["conversation"];
		assert_eq!(heard["event"]["payload"]["spaceId"], json!(PERSONAL));
		assert_eq!(
			conversation["lastWord"],
			json!({ "text": "hello", "at": 2, "authorBotId": null })
		);
		assert_eq!(conversation["lastActivityAt"], json!(2));
		assert_eq!(*conversation, as_json(paged));
	});
}

fn in_page(
	conversation: &Conversation,
	last_activity_at: i64,
	last_word: Option<LastWord>,
) -> Value {
	as_json(ConversationInPage {
		conversation: conversation.clone(),
		last_activity_at,
		last_word,
		solo_bot_id: None,
		active_turn: None,
	})
}

fn the_last_word_of_mine() -> LastWord {
	LastWord { text: Some("mine".to_owned()), at: 1, author_bot_id: None }
}

fn seated_in(conversation: &Conversation, bot_id: &str) -> bool {
	conversation
		.participants
		.iter()
		.any(|participant| participant.bot_id == bot_id && participant.left_at.is_none())
}

fn led_by(conversation: &Conversation) -> Option<&str> {
	conversation
		.participants
		.iter()
		.find(|participant| participant.role == ParticipantRole::Lead)
		.map(|participant| participant.bot_id.as_str())
}

fn stored_in_the_shared_space(conversation: &Conversation) -> Value {
	let conversation = in_page(conversation, 1, Some(the_last_word_of_mine()));
	let payload = json!({ "spaceId": PERSONAL, "conversation": conversation });
	as_forwarded((CONVERSATION_UPDATED_EVENT, payload))
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_with_the_companion_seated_in_it() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-seated").await;

		let seated = guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		let heard = guest.first_conversation_updated().await;

		assert!(seated_in(&seated, "b-mine"), "the companion is missing from the participants");
		assert_eq!(heard, stored_in_the_shared_space(&seated));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_without_the_companion_removed_from_it() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-removed").await;
		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		guest.first_conversation_updated().await;

		let removed = guest.companion_removed("c-mine", "b-mine").await.expect("removed");
		let heard = guest.first_conversation_updated().await;

		assert!(!seated_in(&removed, "b-mine"), "the removed companion is still seated");
		assert_eq!(heard, stored_in_the_shared_space(&removed));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_with_the_new_lead() {
	run(async {
		let mut guest = Guest::of_two_spaces("lead-changed").await;
		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		guest.companion_seated("c-mine", "b-shared", None).await.expect("seated");
		guest.first_conversation_updated().await;
		guest.first_conversation_updated().await;

		let led = guest.lead_given("c-mine", "b-shared").await.expect("led");
		let heard = guest.first_conversation_updated().await;

		assert_eq!(led_by(&led), Some("b-shared"));
		assert_eq!(heard, stored_in_the_shared_space(&led));
	});
}

#[test]
fn a_relay_guest_hears_nothing_from_a_companion_seated_again() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-seated-again").await;
		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		guest.first_conversation_updated().await;

		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated again");
		let renamed = guest.conversation_updated("c-mine").await;
		let heard = guest.first_conversation_updated().await;

		assert_eq!(heard, stored_in_the_shared_space(&renamed));
	});
}

#[test]
fn a_relay_guest_hears_nothing_from_a_member_change_in_another_space() {
	run(async {
		let mut guest = Guest::of_two_spaces("member-change-elsewhere").await;

		guest.companion_seated("c-theirs", "b-theirs", None).await.expect("seated");
		guest.companion_seated("c-shared", "b-theirs", None).await.expect("seated");
		guest.lead_given("c-shared", "b-theirs").await.expect("led");
		guest.companion_removed("c-shared", "b-shared").await.expect("removed");
		let renamed = guest.conversation_updated("c-mine").await;
		let heard = guest.first_conversation_updated().await;

		assert_eq!(heard, stored_in_the_shared_space(&renamed));
	});
}

#[test]
fn a_relay_guest_hears_nothing_from_a_member_write_that_fails() {
	run(async {
		let mut guest = Guest::of_two_spaces("member-write-fails").await;
		let refused = |bot_id: &str| TranscriptStoreError::UnknownParticipant {
			conversation_id: "c-mine".to_owned(),
			bot_id: bot_id.to_owned(),
		};

		let seated = guest.companion_seated("c-mine", "b-mine", Some("b-shared")).await;
		let removed = guest.companion_removed("c-mine", "b-mine").await;
		let led = guest.lead_given("c-mine", "b-mine").await;
		let renamed = guest.conversation_updated("c-mine").await;
		let heard = guest.first_conversation_updated().await;

		assert_eq!(seated, Err(refused("b-shared")));
		assert_eq!(removed, Err(refused("b-mine")));
		assert_eq!(led, Err(refused("b-mine")));
		assert_eq!(heard, stored_in_the_shared_space(&renamed));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_deleted_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("conversation-deleted").await;

		guest.conversation_deleted("c-theirs").await;
		guest.conversation_deleted("c-mine").await;
		let heard = guest.first_event().await;

		let payload = json!({ "spaceId": PERSONAL, "conversationId": "c-mine" });
		assert_eq!(heard, as_forwarded((CONVERSATION_DELETED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_created_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-created").await;

		guest.bot_created_in(ELSEWHERE).await;
		let created = guest.bot_created_in(PERSONAL).await;
		let heard = guest.first_event().await;

		let payload = json!({ "id": created.id, "name": created.name });
		assert_eq!(heard, as_forwarded((COMPANION_CREATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_updated_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-updated").await;

		guest.bot_updated("b-theirs").await;
		let updated = guest.bot_updated("b-mine").await;
		let heard = guest.first_event().await;

		let payload = json!({ "id": "b-mine", "bot": as_json(updated) });
		assert_eq!(heard, as_forwarded((COMPANION_UPDATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_deleted_from_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-deleted").await;

		guest.bot_deleted("b-theirs").await;
		guest.bot_deleted("b-shared").await;
		let heard = guest.first_event().await;

		let payload = json!({ "id": "b-shared", "spaceId": PERSONAL });
		assert_eq!(heard, as_forwarded((COMPANION_DELETED_EVENT, payload)));
	});
}

impl Guest {
	async fn planted(&self, rows: &'static str) {
		db::open(&self.effects.database)
			.call_mut(move |connection| Ok(connection.execute_batch(rows)?))
			.await
			.expect("the rows are planted");
	}

	async fn bot_duplicated_into(&self, bot_id: &str, space_id: &str) -> Bot {
		let app = self.harness.app.handle().clone();
		let destination = Some(space_id.to_owned());
		conversation_duplicate_bot(app, self.harness.app.state(), bot_id.to_owned(), destination)
			.await
			.expect("the bot is duplicated")
	}

	async fn bot_added(&self, bot_id: &str, space_id: &str) {
		let app = self.harness.app.handle().clone();
		bot_add_to_space(
			app,
			self.harness.app.state(),
			bot_id.to_owned(),
			space_id.to_owned(),
			None,
		)
		.await
		.expect("the bot is added");
	}

	async fn bot_moved(&self, bot_id: &str, space_id: &str) {
		let app = self.harness.app.handle().clone();
		bot_move_to_space(app, self.harness.app.state(), bot_id.to_owned(), space_id.to_owned())
			.await
			.expect("the bot is moved");
	}

	async fn bot_removed(&self, bot_id: &str, space_id: &str) {
		let app = self.harness.app.handle().clone();
		bot_remove_from_space(
			app,
			self.harness.app.state(),
			bot_id.to_owned(),
			space_id.to_owned(),
		)
		.await
		.expect("the bot is removed");
	}
}

fn a_companion_created(id: &str, name: &str) -> Value {
	as_forwarded((COMPANION_CREATED_EVENT, json!({ "id": id, "name": name })))
}

fn a_companion_deleted(id: &str, space_id: &str) -> Value {
	as_forwarded((COMPANION_DELETED_EVENT, json!({ "id": id, "spaceId": space_id })))
}

#[test]
fn a_relay_guest_hears_a_companion_duplicated_into_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-duplicated").await;

		guest.bot_duplicated_into("b-theirs", ELSEWHERE).await;
		let copy = guest.bot_duplicated_into("b-mine", PERSONAL).await;
		let heard = guest.first_event().await;

		assert_eq!(heard, a_companion_created(&copy.id, &copy.name));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_added_to_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-added").await;
		guest
			.planted("INSERT INTO spaces (id, name, colour, position, created_at) VALUES ('third', 'Third', 'red', 2, 1);")
			.await;

		guest.bot_added("b-theirs", "third").await;
		let before = guest.first_event_after(vec![a_shared_space_marker()]).await;
		guest.bot_added("b-theirs", PERSONAL).await;
		let heard = guest.first_event().await;

		assert_eq!(
			(before, heard),
			(as_forwarded(a_shared_space_marker()), a_companion_created("b-theirs", "Theirs"))
		);
	});
}

#[test]
fn a_relay_guest_hears_a_companion_removed_from_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-removed").await;
		guest
			.planted("INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b-theirs', 'personal', 3);")
			.await;

		guest.bot_removed("b-theirs", ELSEWHERE).await;
		guest.bot_removed("b-shared", PERSONAL).await;
		let heard = guest.first_event().await;

		assert_eq!(heard, a_companion_deleted("b-shared", PERSONAL));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_moved_into_and_out_of_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-moved").await;

		guest.bot_moved("b-theirs", PERSONAL).await;
		guest.bot_moved("b-mine", ELSEWHERE).await;
		let arrived = guest.first_event().await;
		let left = guest.first_event().await;

		assert_eq!(
			(arrived, left),
			(a_companion_created("b-theirs", "Theirs"), a_companion_deleted("b-mine", PERSONAL))
		);
	});
}

#[test]
fn a_relay_guest_hears_nothing_of_a_refused_companion_removal() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-removal-refused").await;
		let app = guest.harness.app.handle().clone();

		let refused = bot_remove_from_space(
			app,
			guest.harness.app.state(),
			"b-mine".to_owned(),
			PERSONAL.to_owned(),
		)
		.await;
		let heard = guest.first_event_after(vec![a_shared_space_marker()]).await;

		assert!(refused.is_err());
		assert_eq!(heard, as_forwarded(a_shared_space_marker()));
	});
}

const GUEST_LOCAL_CONVERSATION: &str = "c-guest-local";

#[test]
fn a_guest_reads_the_installs_of_a_shared_conversation_and_not_of_its_own() {
	run(kept_in_the_shared_space(
		"application_installs",
		json!({ "conversationId": GUEST_LOCAL_CONVERSATION }),
		json!({ "conversationId": "c-mine" }),
	));
}

#[test]
fn a_guest_reads_the_pending_questions_of_a_shared_conversation_and_not_of_its_own() {
	run(kept_in_the_shared_space(
		"agent_pending_questions",
		json!({ "conversationId": GUEST_LOCAL_CONVERSATION }),
		json!({ "conversationId": "c-mine" }),
	));
}

#[test]
fn the_installs_refusal_names_the_conversation_the_host_does_not_hold() {
	run(async {
		let guest = Guest::of_two_spaces("installs-refusal").await;
		let args = json!({ "conversationId": GUEST_LOCAL_CONVERSATION });

		let refusal = shared_space_refusal(&guest, "application_installs", args).await;

		assert_eq!(
			reach::refusal_line("application_installs", Some(GUEST), PERSONAL, &refusal),
			format!(
				"the relayed application_installs from sender \"{GUEST}\" was refused outside \
				 shared space {PERSONAL}: /conversationId failed the Conversation check with \
				 \"{GUEST_LOCAL_CONVERSATION}\""
			)
		);
	});
}

const DEFAULT_BOT: &str = "default";

fn the_default_bot() -> EnvOwner {
	EnvOwner::Bot { id: DEFAULT_BOT.to_owned(), space_id: PERSONAL.to_owned() }
}

fn a_host_grant() -> OauthCredentials {
	OauthCredentials {
		access_token: "host-access".to_owned(),
		refresh_token: Some("host-refresh".to_owned()),
		expires_at: None,
		client_id: "registered".to_owned(),
		client_secret: None,
		redirect_uri: None,
	}
}

fn granted_to_the_host_person(name: &str) -> EnvScope {
	EnvScope::Server { name: name.to_owned(), owner: EnvOwner::User }
}

impl Authoring {
	fn env_root(&self) -> PathBuf {
		writable_root(self.app.handle()).expect("the env root is writable")
	}

	fn reading_applications(&self) {
		let person = bundles::user::path(self.app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&person).expect("the plugin is laid down");
		self.app.manage(McpOauthState::default());
		self.app.manage(ApplicationReports::default());
		self.app.manage(AuthorizationAnswers::default());
	}

	async fn bundled_default_bot(&self) {
		let state = self.app.state::<DatabaseState>();
		let database = state.as_ref().expect("the database");
		let bot = database
			.conversations()
			.bot(DEFAULT_BOT.to_owned())
			.await
			.expect("the bot reads")
			.expect("the default bot is planted");
		let root = bundles::root(self.app.handle()).expect("the bundles have a root");
		bundles::lay_down(&root, &bot).expect("the bot bundle lands");
	}

	fn declared(&self, plugin: Value, name: &str) {
		direct(
			&self.window,
			"plugin_set_mcp_server",
			json!({ "scope": plugin, "name": name, "config": { "command": name }, "mark": null }),
		);
	}
}

fn names_of(listed: &Value) -> Vec<&str> {
	listed
		.as_array()
		.expect("a list")
		.iter()
		.map(|item| item["name"].as_str().expect("a name"))
		.collect()
}

#[test]
fn a_member_lists_a_bot_env_without_any_entry_defined_in_or_served_from_the_host_person() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let root = host.env_root();
		let bot = EnvScope::from(&the_default_bot());
		store::set(&root, &EnvScope::User, "HOST_ONLY", "person").expect("the host sets");
		store::set(&root, &EnvScope::User, "SHADOWED", "person").expect("the host sets");
		store::set(&root, &EnvScope::Space { id: PERSONAL.to_owned() }, "SHARED", "space")
			.expect("the host sets");
		store::set(&root, &bot, "SHADOWED", "bot").expect("the host sets");
		let args = json!({ "scope": bot });

		let relayed = host.relayed(json!({ "id": 1, "command": "env_list", "args": args })).await;
		let on_the_host = direct(&host.window, "env_list", args);

		assert_eq!(names_of(&relayed), ["SHADOWED", "SHARED"]);
		for entry in relayed.as_array().expect("a list") {
			assert_ne!(entry["definedIn"]["kind"], "user", "{entry}");
			assert_ne!(entry["servedFrom"]["kind"], "user", "{entry}");
		}
		assert_eq!(names_of(&on_the_host), ["HOST_ONLY", "SHADOWED", "SHADOWED", "SHARED"]);
	});
}

#[test]
fn a_relayed_env_list_of_a_server_of_the_host_person_answers_no_entry() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let scope = granted_to_the_host_person("granola");
		store::set(&host.env_root(), &scope, "PLANTED", "host").expect("the host sets");
		let listed = |caller| env_list(host.app.handle().clone(), caller, scope.clone());

		let relayed = listed(Caller::Relayed(None)).await.expect("the list reads");
		let on_the_host = listed(Caller::Host).await.expect("the list reads");

		assert_eq!(relayed, Vec::new());
		assert_eq!(
			on_the_host.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>(),
			["PLANTED"]
		);
	});
}

#[test]
fn a_member_reads_no_application_served_by_a_grant_of_the_host_person_nor_one_of_its_plugin() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		host.bundled_default_bot().await;
		let root = host.env_root();
		let bot = json!({ "kind": "bot", "id": DEFAULT_BOT });
		host.declared(bot.clone(), "granola");
		host.declared(bot, "clock");
		host.declared(json!({ "kind": "user" }), "notion");
		credentials::store(&root, &granted_to_the_host_person("granola"), &a_host_grant())
			.expect("the host connects granola");
		credentials::store(&root, &granted_to_the_host_person("notion"), &a_host_grant())
			.expect("the host connects notion");
		let args = json!({ "owner": the_default_bot() });

		let relayed = host
			.relayed(json!({ "id": 1, "command": "mcp_application_status", "args": args }))
			.await;
		let on_the_host = direct(&host.window, "mcp_application_status", args);

		assert_eq!(names_of(&relayed), ["clock"]);
		assert_eq!(names_of(&on_the_host), ["clock", "granola"]);
		assert_eq!(on_the_host[1]["scope"], json!(granted_to_the_host_person("granola")));
	});
}

#[test]
fn a_relayed_status_of_the_host_person_plugin_answers_no_row() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		host.declared(json!({ "kind": "user" }), "notion");
		let status =
			|caller| mcp_application_status(host.app.handle().clone(), caller, EnvOwner::User);

		let relayed = status(Caller::Relayed(None)).await.expect("the status reads");
		let on_the_host = status(Caller::Host).await.expect("the status reads");

		assert_eq!(relayed, Vec::new());
		assert_eq!(on_the_host.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(), ["notion"]);
	});
}

#[test]
fn a_member_disconnecting_through_a_bot_served_by_a_grant_of_the_host_person_is_refused() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		let root = host.env_root();
		let grant = granted_to_the_host_person("granola");
		credentials::store(&root, &grant, &a_host_grant()).expect("the host connects");
		let before = store::values(&root, &grant).expect("the grant reads");

		let answered = host
			.answered(json!({
				"id": 1,
				"command": "mcp_oauth_disconnect",
				"sender": guest_sender(),
				"args": {
					"owner": the_default_bot(),
					"name": "granola",
					"url": "https://granola.test/mcp",
				},
			}))
			.await;

		assert_eq!(answered["status"], json!(403), "{answered}");
		assert_eq!(answered["body"], json!({ "kind": "refusedToAMember" }));
		assert!(!before.is_empty());
		assert_eq!(store::values(&root, &grant).expect("the grant reads"), before);
	});
}
