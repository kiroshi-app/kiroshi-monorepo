#[path = "../src/removed_on_drop.rs"]
mod removed_on_drop;

use std::path::PathBuf;
use std::sync::{Arc, Barrier, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State as Served;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use base64::prelude::{Engine as _, BASE64_STANDARD, BASE64_URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use kiroshi_app::account::session::{restore, AccountSession};
use kiroshi_app::agent::commands::{
	agent_cancel_turn, agent_live_sessions, agent_respond_to_permission,
	agent_start_or_resume_session, agent_submit_prompt, shutdown_session, terminate_session,
};
use kiroshi_app::agent::contract::{
	CancelOutcome, LiveSession, PermissionDecision, RuntimeScope, SubmittedTurn,
};
use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use kiroshi_app::agent::AgentState;
use kiroshi_app::bundles;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::conversations::commands::{
	conversation_open_runtime_session, conversation_send_user_message,
};
use kiroshi_app::conversations::contract::NewUserMessage;
use kiroshi_app::conversations::turn_run_deadline::TurnRunDeadlines;
use kiroshi_app::crypto::commands::{DeviceKeysState, SpaceKeys};
use kiroshi_app::crypto::device_keys::{self, DeviceId, DeviceKeys};
use kiroshi_app::crypto::frame::{self, Frame, Header, CHALLENGE_LENGTH};
use kiroshi_app::crypto::sealed_box;
use kiroshi_app::crypto::space_key::HeldSpaceKey;
use kiroshi_app::crypto::subkey::Subkey;
use kiroshi_app::db;
use kiroshi_app::db::repositories::messages::{MessagePageQuery, MessageRole, StoredMessage};
use kiroshi_app::environment::contract::{EnvScope, ACCOUNT_BEARER};
use kiroshi_app::environment::store;
use kiroshi_app::events::{self, BUFFERED_FRAMES, MISSION_CHANGED};
use kiroshi_app::hosting::authorship::Caller;
use kiroshi_app::hosting::commands::hosting_start;
use kiroshi_app::hosting::roster::{signed_row, Enrolled};
use kiroshi_app::hosting::{local_api, Hosting};
use kiroshi_app::logging::contract::InstallKind;
use kiroshi_app::missions::commands::MissionChanged;
use kiroshi_app::missions::contract::{MissionLiveness, MissionState};
use kiroshi_app::routines::webhook::{self, Webhook};
use removed_on_drop::RemovedOnDrop;
use serde_json::{json, Value};
use tauri::async_runtime::block_on;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio::time::timeout;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");
const SCENARIO_ENV: &str = "FAKE_AGENT_SCENARIO_FILE";
const BEARER: &str = "bearer-of-the-host";
const PERSONAL: &str = "personal";
const INSTANCE: &str = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const HOST_DEVICE: &str = "0b7d3c2e-1f4a-4c5d-8e6f-7a8b9c0d1e2f";
const GUEST_DEVICE: &str = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
const GUEST: &str = "guest";
const ROOM: &str = "room-1";
const SECOND_ROOM: &str = "room-2";
const MISSION_THREAD: &str = "mission-thread-1";
const ADA: &str = "b-ada";
const GRACE: &str = "b-grace";
const NYX: &str = "b-nyx";
const AGENT_EVENT: &str = kiroshi_app::agent::commands::EVENT_CHANNEL;
const MESSAGE_STORED: &str = kiroshi_app::conversations::contract::MESSAGE_STORED_EVENT;
const CONVERSATION_UPDATED: &str = kiroshi_app::conversations::contract::UPDATED_EVENT;
const PATIENCE: Duration = Duration::from_secs(60);
const SHORT_START_DEADLINE: Duration = Duration::from_millis(300);

const A_ROOM: &str = "
	INSERT INTO bots (id, name, model, created_at) VALUES
		('b-ada', 'Ada', 'sonnet', 1),
		('b-grace', 'Grace Hopper', 'sonnet', 1),
		('b-nyx', 'Nyx', 'sonnet', 1);
	INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES
		('b-ada', 'personal', 1),
		('b-grace', 'personal', 1);
	INSERT INTO conversations (id, kind, title, created_at, updated_at, space_id)
		VALUES ('room-1', 'topic', 'Shift room', 1, 1, 'personal');
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('room-1', 'b-ada', 'lead', 1, 0),
			('room-1', 'b-grace', 'assistant', 1, 1),
			('room-1', 'b-nyx', 'assistant', 1, 2);
";

#[derive(Clone)]
struct Cloud {
	sockets: mpsc::UnboundedSender<WebSocket>,
}

async fn registered(body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	answered_json(
		StatusCode::CREATED,
		json!({ "id": INSTANCE, "name": body["name"], "role": "owner" }),
	)
}

async fn device_challenged() -> Response {
	let nonce = BASE64_URL_SAFE_NO_PAD.encode([7u8; 32]);
	answered_json(
		StatusCode::CREATED,
		json!({ "nonce": nonce, "expiresAt": "2099-10-01T00:00:00.000Z" }),
	)
}

async fn device_registered() -> Response {
	answered_json(
		StatusCode::CREATED,
		json!({
			"id": HOST_DEVICE,
			"createdAt": "2026-10-01T00:00:00.000Z",
			"transferred": false,
			"status": "approved"
		}),
	)
}

async fn relay_opened(Served(cloud): Served<Cloud>, upgrade: WebSocketUpgrade) -> Response {
	upgrade.on_upgrade(move |socket| async move {
		cloud.sockets.send(socket).expect("the test holds the sockets");
	})
}

async fn members() -> Response {
	answered_json(
		StatusCode::OK,
		json!([
			{ "userId": "owner", "email": "owner@example.com", "name": null, "role": "owner", "state": "joined" },
			{ "userId": GUEST, "email": "guest@example.com", "name": "Guest", "role": "member", "state": "joined" },
		]),
	)
}

async fn me() -> Response {
	answered_json(
		StatusCode::OK,
		json!({ "id": "owner", "email": "owner@example.com", "createdAt": "2026-10-01T00:00:00.000Z" }),
	)
}

async fn guest_rostered(app: &App<MockRuntime>) -> GuestDevice {
	let host_keys = app.state::<DeviceKeysState>();
	let host = host_keys.keys().expect("the host device keys");
	let keys = DeviceKeys::generate().expect("randomness");
	let agreement = keys.agreement_public();
	let enrolled = Enrolled {
		relay_device_id: GUEST_DEVICE,
		account_id: GUEST,
		signing: &keys.signing_public(),
		agreement: agreement.as_bytes(),
		added_at: 1,
	};
	let row = signed_row(host, PERSONAL, &enrolled);
	database_of(app)
		.space_relay()
		.rostered(PERSONAL.to_owned(), row)
		.await
		.expect("the guest is rostered");
	let space = app.state::<SpaceKeys>().held(PERSONAL).expect("the key reads").expect("a key");
	GuestDevice { keys, host: host.signing_public(), space, ctr: 0, challenge: None }
}

fn answered_json(status: StatusCode, body: Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

async fn served(router: Router) -> String {
	let listener = TcpListener::bind(("127.0.0.1", 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tauri::async_runtime::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

fn serial() -> MutexGuard<'static, ()> {
	static SIDECAR_SETTINGS: Mutex<()> = Mutex::new(());
	SIDECAR_SETTINGS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn scenario(name: &str) -> RemovedOnDrop {
	let path = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-host-turn-scenario-{}.txt", std::process::id())),
	);
	std::fs::write(&path, name).expect("the scenario is written");
	std::env::set_var(SCENARIO_ENV, &*path);
	path
}

fn sent(id: &str, turn_id: &str, content: &str) -> Value {
	sent_in(ROOM, id, turn_id, content)
}

fn sent_in(conversation_id: &str, id: &str, turn_id: &str, content: &str) -> Value {
	json!({
		"id": id,
		"conversationId": conversation_id,
		"turnId": turn_id,
		"content": content,
		"createdAt": 1,
		"repliedToMessageId": null,
	})
}

struct GuestDevice {
	keys: DeviceKeys,
	host: VerifyingKey,
	space: HeldSpaceKey,
	ctr: u64,
	challenge: Option<[u8; CHALLENGE_LENGTH]>,
}

impl GuestDevice {
	fn sealed(&mut self, plaintext: &str) -> String {
		self.ctr += 1;
		let header = Header {
			instance: INSTANCE.to_owned(),
			from: self.keys.device_id(),
			to: None,
			key_id: self.space.key_id,
			ctr: self.ctr,
			challenge: self.challenge,
		};
		let subkey = Subkey::derive(&self.space.key, self.space.key_id, &self.keys.device_id());
		let sealed = frame::seal(header, plaintext.as_bytes(), &subkey, &self.keys)
			.expect("the frame seals");
		let mut envelope = json!({
			"from": GUEST_DEVICE,
			"v": 2,
			"instance": INSTANCE,
			"key_id": self.space.key_id,
			"ctr": self.ctr,
			"ct": BASE64_STANDARD.encode(&sealed.ciphertext),
			"sig": BASE64_STANDARD.encode(sealed.sig.to_bytes()),
		});
		if let Some(challenge) = self.challenge {
			envelope["challenge"] = json!(BASE64_STANDARD.encode(challenge));
		}
		envelope.to_string()
	}

	fn opened(&mut self, text: &str) -> Option<Value> {
		let envelope: Value = serde_json::from_str(text).expect("a json frame");
		let to = match envelope.get("to") {
			None => None,
			Some(to) if to == GUEST_DEVICE => Some(self.keys.device_id()),
			Some(_) => return None,
		};
		if envelope.get("rekey").is_some() {
			self.rekeyed(&envelope);
			return None;
		}
		let decoded = |key: &str| decoded(&envelope, key);
		let challenge: Option<[u8; CHALLENGE_LENGTH]> =
			envelope.get("challenge").map(|_| decoded("challenge").try_into().expect("32 bytes"));
		let host = DeviceId::of(&self.host);
		let header = Header {
			instance: INSTANCE.to_owned(),
			from: host,
			to,
			key_id: self.space.key_id,
			ctr: envelope["ctr"].as_u64().expect("a ctr"),
			challenge,
		};
		let sig = Signature::from_bytes(&decoded("sig").try_into().expect("64 bytes"));
		let sealed = Frame { header, ciphertext: decoded("ct"), sig };
		let subkey = Subkey::derive(&self.space.key, self.space.key_id, &host);
		let plaintext = frame::open(&sealed, &subkey, &self.host).expect("the host frame opens");
		let plaintext: Value = serde_json::from_slice(&plaintext).expect("a json plaintext");
		if plaintext == json!({ "hello": {} }) {
			self.challenge = challenge;
			return None;
		}
		Some(plaintext)
	}

	fn rekeyed(&self, envelope: &Value) {
		let sealed = decoded(envelope, "rekey");
		let mut signed = b"kiroshi/v2/rekey".to_vec();
		signed.extend_from_slice(&(INSTANCE.len() as u64).to_be_bytes());
		signed.extend_from_slice(INSTANCE.as_bytes());
		signed.extend_from_slice(self.keys.device_id().as_bytes());
		signed.extend_from_slice(&(sealed.len() as u64).to_be_bytes());
		signed.extend_from_slice(&sealed);
		let sig = Signature::from_bytes(&decoded(envelope, "sig").try_into().expect("64 bytes"));
		device_keys::verify(&self.host, &signed, &sig).expect("the host signed the rekey");
		let handover = sealed_box::open(self.keys.agreement(), &sealed).expect("the rekey opens");
		let handover: Value = serde_json::from_slice(&handover).expect("a json handover");
		assert_eq!(handover["key_id"], self.space.key_id, "a hello rekey hands over the held key");
	}
}

fn decoded(envelope: &Value, key: &str) -> Vec<u8> {
	BASE64_STANDARD.decode(envelope[key].as_str().expect("base64")).expect("base64")
}

struct Host {
	app: App<MockRuntime>,
	_window: WebviewWindow<MockRuntime>,
	member: WebSocket,
	guest: GuestDevice,
	frames: Vec<Value>,
	calls: u64,
	sockets: mpsc::UnboundedReceiver<WebSocket>,
	_scenario: RemovedOnDrop,
}

impl Host {
	async fn hosting(name: &str, played: &str) -> Self {
		std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
		let scenario = scenario(played);
		let (sockets_in, mut sockets) = mpsc::unbounded_channel();
		let cloud = served(
			Router::new()
				.route("/instances", post(registered))
				.route("/devices", post(device_registered))
				.route("/devices/challenge", post(device_challenged))
				.route("/instances/{id}/relay/host", get(relay_opened))
				.route("/instances/{id}/members", get(members))
				.route("/me", get(me))
				.with_state(Cloud { sockets: sockets_in }),
		)
		.await;
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.kiroshi.host-turns-{name}-{}", std::process::id());
		let app = mock_builder()
			.manage(AgentState::default())
			.invoke_handler(invoke_handler())
			.build(context)
			.expect("the app builds");
		let data_dir = app.path().app_data_dir().expect("a data dir");
		if data_dir.exists() {
			std::fs::remove_dir_all(&data_dir).expect("the previous data dir is cleared");
		}
		app.manage(db::bootstrap(app.handle()));
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
		let identifier = app.config().identifier.clone();
		app.manage(SpaceKeys::new(InstallKind::Dev, identifier, Some(data_dir.clone())));
		let root = data_dir.join("environment");
		store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, BEARER).expect("the bearer is kept");
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root), &cloud));
		restore(app.handle().clone()).await;
		app.manage(webhook::start(app.handle().clone()));
		let local = local_api(app.handle()).expect("the local host api listens");
		app.manage(Hosting::new(&cloud, Some(local)));
		let window = WebviewWindowBuilder::new(&app, "main", Default::default())
			.build()
			.expect("the window builds");
		database_of(&app)
			.call_mut(|connection| Ok(connection.execute_batch(A_ROOM)?))
			.await
			.expect("the room is planted");
		bundled(&app, &[ADA, GRACE]).await;
		hosting_start(app.handle().clone(), PERSONAL.to_owned()).await.expect("the hosting starts");
		let member = timeout(PATIENCE, sockets.recv())
			.await
			.expect("the host reached the relay in time")
			.expect("the relay is up");
		let guest = guest_rostered(&app).await;
		let mut hosted = Self {
			app,
			_window: window,
			member,
			guest,
			frames: Vec::new(),
			calls: 0,
			sockets,
			_scenario: scenario,
		};
		hosted.greeted().await;
		hosted
	}

	async fn greeted(&mut self) {
		let hello = self.guest.sealed(r#"{"hello":{}}"#);
		self.member.send(Message::Text(hello.into())).await.expect("the hello leaves");
		while self.guest.challenge.is_none() {
			self.heard_one().await;
		}
	}

	async fn send_turn(&mut self, message: Value, summoned: &[&str]) -> Value {
		let args = json!({ "message": message, "summoned": summoned });
		self.called("conversation_send_turn", args).await
	}

	async fn reconnected(&mut self) {
		self.member = timeout(PATIENCE, self.sockets.recv())
			.await
			.expect("the host came back to the relay in time")
			.expect("the relay is up");
		self.guest.challenge = None;
		self.greeted().await;
	}

	fn flood(&self) {
		for order in 0..BUFFERED_FRAMES + 8 {
			let changed = MissionChanged {
				mission_id: format!("flood-{order}"),
				space_id: None,
				state: MissionState::Working,
				state_seq: 1,
				is_agent_running: true,
				liveness: MissionLiveness::Working,
				pending_prompt: None,
				working_bot_ids: Vec::new(),
				last_activity_at: None,
			};
			events::emit(self.app.handle(), MISSION_CHANGED, changed).expect("the flood is sent");
		}
	}

	async fn session_gone_while_lagging(&self, scope: &RuntimeScope) {
		let stall = Stall::every_worker();
		let state = self.app.state::<AgentState>();
		let mut shutting = std::pin::pin!(shutdown_session(self.app.handle(), &state, scope));
		tokio::select! {
			biased;
			() = &mut shutting => {}
			() = std::future::ready(()) => {}
		}
		self.flood();
		stall.released();
		shutting.await;
	}

	async fn answered(&self, turn_id: &'static str) {
		let closed = async {
			while self.completed_at(turn_id).await.is_none() {
				tokio::time::sleep(Duration::from_millis(20)).await;
			}
		};
		timeout(PATIENCE, closed).await.expect("the turn closed in time");
	}

	async fn called(&mut self, command: &str, args: Value) -> Value {
		self.calls += 1;
		let id = self.calls;
		let frame = json!({ "id": id, "command": command, "args": args });
		let sealed = self.guest.sealed(&frame.to_string());
		self.member.send(Message::Text(sealed.into())).await.expect("the frame leaves");
		self.heard_until(|frames| frames.iter().any(|frame| frame["id"] == id)).await;
		self.frames.iter().find(|frame| frame["id"] == id).cloned().expect("the call is answered")
	}

	async fn heard_until(&mut self, is_heard: impl Fn(&[Value]) -> bool) {
		while !is_heard(&self.frames) {
			self.heard_one().await;
		}
	}

	async fn heard_one(&mut self) {
		let frame = timeout(PATIENCE, self.member.recv())
			.await
			.unwrap_or_else(|_| panic!("waited {PATIENCE:?}, heard {:#?}", self.frames))
			.expect("the socket is open")
			.expect("a readable frame");
		if let Message::Text(text) = frame {
			if let Some(plaintext) = self.guest.opened(text.as_str()) {
				self.frames.push(plaintext);
			}
		}
	}

	async fn turn_ended_for(&mut self, bot_id: &str) {
		self.heard_until(|frames| {
			agent_events_in(frames, bot_id).any(|event| event["type"] == "turnEnded")
		})
		.await;
	}

	async fn speaking(&mut self, bot_id: &str) {
		self.heard_until(|frames| {
			agent_events_in(frames, bot_id).any(|event| event["type"] == "messageDelta")
		})
		.await;
	}

	fn scope_of(&self, bot_id: &str) -> Value {
		published(&self.frames, AGENT_EVENT)
			.find(|payload| payload["scope"]["botId"] == bot_id)
			.map(|payload| payload["scope"].clone())
			.expect("the companion was heard")
	}

	async fn stopped_after_a_handover(&mut self, heard_before_stop: usize) {
		self.turns_closed_for(GRACE, 1).await;
		self.heard_until(|frames| {
			published(&frames[heard_before_stop..], CONVERSATION_UPDATED)
				.any(|updated| updated["conversation"]["activeTurn"].is_null())
		})
		.await;

		let grace_ended: Vec<Value> = self
			.agent_events(GRACE)
			.into_iter()
			.filter(|event| event["type"] == "turnEnded")
			.collect();
		assert_eq!(grace_ended.len(), 1, "heard {grace_ended:#?}");
		assert_eq!(grace_ended[0]["ended"]["outcome"], json!("cancelled"));
		assert!(self.completed_at("t1").await.is_some(), "the stopped turn was left open");
		assert_eq!(self.runs_of("t1").await, 0, "a run of the stopped turn was kept");
		let ada_ended =
			self.agent_events(ADA).iter().filter(|event| event["type"] == "turnEnded").count();
		assert_eq!(ada_ended, 1, "the companion Grace named was summoned again");
		let next = self.send_turn(sent("p2", "t2", "and now?"), &[GRACE]).await;
		assert_eq!(next["status"], json!(200), "the stopped turn still holds the room: {next}");
	}

	async fn runs_of(&self, turn_id: &'static str) -> i64 {
		database_of(&self.app)
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM turn_runs WHERE turn_id = ?1",
					[turn_id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the runs count")
	}

	async fn turns_closed_for(&mut self, bot_id: &str, closed: usize) {
		self.heard_until(|frames| turns_closed_in(frames, bot_id) >= closed).await;
	}

	async fn active_sessions_of(&self, bot_id: &'static str) -> i64 {
		database_of(&self.app)
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT count(*) FROM runtime_sessions
						WHERE conversation_id = ?1 AND bot_id = ?2 AND status = 'active'",
					[ROOM, bot_id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the sessions count")
	}

	async fn host_run(&self, conversation_id: &str, bot_id: &str) -> RuntimeScope {
		let opened = conversation_open_runtime_session(
			self.app.state(),
			conversation_id.to_owned(),
			bot_id.to_owned(),
			1,
			None,
			None,
		)
		.await
		.expect("the host opens a runtime session");
		let scope = RuntimeScope {
			conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
			runtime_session_id: opened.id,
			epoch: opened.seq,
		};
		agent_start_or_resume_session(
			self.app.handle().clone(),
			self.app.state(),
			self.app.state(),
			scope.clone(),
			None,
			None,
			None,
		)
		.await
		.expect("the host run starts");
		scope
	}

	async fn host_says(&self, scope: &RuntimeScope, id: &str, turn_id: &str, content: &str) {
		let message = NewUserMessage {
			id: id.to_owned(),
			conversation_id: scope.conversation_id.clone(),
			turn_id: turn_id.to_owned(),
			author_bot_id: None,
			replied_to_message_id: None,
			content: content.to_owned(),
			created_at: 1,
		};
		let summoned = vec![scope.bot_id.clone()];
		conversation_send_user_message(
			self.app.handle().clone(),
			self.app.state(),
			Caller::Host,
			message,
			summoned,
		)
		.await
		.expect("the host message is stored");
		let turn = SubmittedTurn { turn_id: turn_id.to_owned(), prompt_id: id.to_owned() };
		agent_submit_prompt(self.app.state(), scope.clone(), content.to_owned(), Some(turn))
			.await
			.expect("the host prompt is submitted");
	}

	async fn allow_write(&mut self, bot_id: &str, nth: usize) {
		self.heard_until(|frames| asked_to_write(frames, bot_id).len() >= nth).await;
		let (scope, id) = asked_to_write(&self.frames, bot_id).swap_remove(nth - 1);
		agent_respond_to_permission(self.app.state(), scope, id, PermissionDecision::AllowOnce)
			.await
			.expect("the write is allowed");
	}

	async fn allowed_in_time(&mut self, bot_id: &str, nth: usize) {
		let allowed = self.allow_write(bot_id, nth);
		timeout(PATIENCE, allowed).await.expect("the companion asked to write in time");
	}

	async fn live_runs_of(&self, bot_id: &str) -> Vec<LiveSession> {
		let live = agent_live_sessions(self.app.state()).await.expect("the live runs read");
		live.into_iter().filter(|run| run.bot_id == bot_id).collect()
	}

	fn scopes_heard(&self, bot_id: &str) -> Vec<String> {
		let mut heard: Vec<String> = published(&self.frames, AGENT_EVENT)
			.filter(|payload| payload["scope"]["botId"] == bot_id)
			.filter_map(|payload| payload["scope"]["runtimeSessionId"].as_str())
			.map(str::to_owned)
			.collect();
		heard.dedup();
		heard
	}

	async fn runtime_sessions_of(&self, bot_id: &'static str) -> Vec<(String, String)> {
		database_of(&self.app)
			.call(move |connection| {
				let mut rows = connection.prepare(
					"SELECT id, status FROM runtime_sessions
						WHERE conversation_id = ?1 AND bot_id = ?2 ORDER BY seq",
				)?;
				let read = rows
					.query_map([ROOM, bot_id], |row| Ok((row.get(0)?, row.get(1)?)))?
					.collect::<Result<Vec<_>, _>>()?;
				Ok(read)
			})
			.await
			.expect("the runtime sessions read")
	}

	async fn plant(&self, planted: &'static str) {
		database_of(&self.app)
			.call_mut(move |connection| Ok(connection.execute_batch(planted)?))
			.await
			.expect("the conversation is planted");
	}

	fn agent_events(&self, bot_id: &str) -> Vec<Value> {
		agent_events_in(&self.frames, bot_id).cloned().collect()
	}

	fn stored_ids(&self) -> Vec<Value> {
		published(&self.frames, MESSAGE_STORED).map(|payload| payload["id"].clone()).collect()
	}

	async fn transcript(&self) -> Vec<StoredMessage> {
		let query =
			MessagePageQuery { conversation_id: ROOM.to_owned(), before_seq: None, limit: 50 };
		database_of(&self.app)
			.messages()
			.page_messages(query)
			.await
			.expect("the transcript reads")
			.messages
	}

	async fn turn_rows(&self) -> i64 {
		database_of(&self.app)
			.call(|connection| {
				Ok(connection.query_row("SELECT count(*) FROM turns", [], |row| row.get(0))?)
			})
			.await
			.expect("the turns count")
	}

	async fn completed_at(&self, turn_id: &'static str) -> Option<i64> {
		database_of(&self.app)
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT completed_at FROM turns WHERE id = ?1",
					[turn_id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the turn reads")
	}

	async fn quit(self) {
		terminate_session(self.app.handle(), &self.app.state::<AgentState>()).await;
		self.app.state::<Webhook>().stop();
		if let Ok(dir) = self.app.path().app_data_dir() {
			if let Err(failure) = std::fs::remove_dir_all(&dir) {
				eprintln!("the test data dir was not removed: {failure}");
			}
		}
	}
}

fn published<'a>(frames: &'a [Value], name: &'a str) -> impl Iterator<Item = &'a Value> + 'a {
	frames
		.iter()
		.filter(move |frame| frame["event"]["event"] == name)
		.map(|frame| &frame["event"]["payload"])
}

fn agent_events_in<'a>(
	frames: &'a [Value],
	bot_id: &'a str,
) -> impl Iterator<Item = &'a Value> + 'a {
	published(frames, AGENT_EVENT)
		.filter(move |payload| payload["scope"]["botId"] == bot_id)
		.map(|payload| &payload["event"])
}

fn asked_to_write(frames: &[Value], bot_id: &str) -> Vec<(RuntimeScope, String)> {
	let mut asked: Vec<(RuntimeScope, String)> = Vec::new();
	let requests = published(frames, AGENT_EVENT)
		.filter(|payload| payload["scope"]["botId"] == bot_id)
		.filter(|payload| payload["event"]["type"] == "permissionRequested");
	for payload in requests {
		let scope = serde_json::from_value(payload["scope"].clone()).expect("a runtime scope");
		let id = payload["event"]["request"]["id"].as_str().expect("a request id").to_owned();
		if asked.iter().all(|(_, known)| known != &id) {
			asked.push((scope, id));
		}
	}
	asked
}

fn failures_in_turn<'a>(
	frames: &'a [Value],
	bot_id: &'a str,
	turn_id: &'a str,
) -> impl Iterator<Item = &'a Value> + 'a {
	published(frames, AGENT_EVENT)
		.filter(move |payload| payload["scope"]["botId"] == bot_id)
		.filter(move |payload| payload["turn"]["turnId"] == turn_id)
		.filter(|payload| payload["event"]["type"] == "failed")
		.map(|payload| &payload["event"])
}

struct Stall(Arc<Barrier>);

impl Stall {
	fn every_worker() -> Self {
		let workers = tokio::runtime::Handle::current().metrics().num_workers();
		let entered = Arc::new(Barrier::new(workers + 1));
		let release = Arc::new(Barrier::new(workers + 1));
		for _ in 0..workers {
			let (entered, release) = (entered.clone(), release.clone());
			tauri::async_runtime::spawn(async move {
				entered.wait();
				release.wait();
			});
		}
		entered.wait();
		Self(release)
	}

	fn released(self) {
		self.0.wait();
	}
}

fn shut_downs_in(frames: &[Value], bot_id: &str) -> usize {
	agent_events_in(frames, bot_id)
		.filter(|event| event["type"] == "connectionChanged" && event["state"] == "checking")
		.count()
}

fn turns_closed_in(frames: &[Value], bot_id: &str) -> usize {
	let mut closed = 0;
	let mut has_ended = false;
	for event in agent_events_in(frames, bot_id) {
		if event["type"] == "turnEnded" {
			has_ended = true;
		}
		if has_ended && event["type"] == "connectionChanged" && event["state"] == "checking" {
			closed += 1;
			has_ended = false;
		}
	}
	closed
}

async fn bundled(app: &App<MockRuntime>, bot_ids: &[&str]) {
	let root = bundles::root(app.handle()).expect("the bundles have a root");
	for bot_id in bot_ids {
		let bot = database_of(app)
			.conversations()
			.bot((*bot_id).to_owned())
			.await
			.expect("the bot reads")
			.expect("the bot is planted");
		bundles::lay_down(&root, &bot).expect("the bundle is laid down");
	}
}

fn database_of(app: &App<MockRuntime>) -> &db::Database {
	app.state::<db::DatabaseState>().inner().as_ref().expect("the database is open")
}

fn replies_of<'a>(transcript: &'a [StoredMessage], bot_id: &str) -> Vec<&'a StoredMessage> {
	transcript.iter().filter(|message| message.author_bot_id.as_deref() == Some(bot_id)).collect()
}

fn completed_texts(events: &[Value]) -> Vec<&str> {
	events
		.iter()
		.filter(|event| event["type"] == "messageCompleted")
		.filter_map(|event| event["message"]["text"].as_str())
		.collect()
}

#[test]
fn one_member_call_stores_the_guest_message_and_the_lead_reply_with_their_live_events() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("lead", "room_reply").await;

		let answer = host.send_turn(sent("p1", "t1", "what changed tonight?"), &[]).await;
		host.turn_ended_for(ADA).await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		let transcript = host.transcript().await;
		let prompt =
			transcript.iter().find(|message| message.id == "p1").expect("the prompt is stored");
		assert_eq!(prompt.role, MessageRole::User);
		assert_eq!(prompt.author.account_id.as_deref(), Some(GUEST));
		assert_eq!(prompt.content, "what changed tonight?");
		let replies = replies_of(&transcript, ADA);
		assert_eq!(replies.len(), 1, "the room holds {transcript:#?}");
		assert_eq!(replies[0].content, "noted");
		assert_eq!(replies[0].turn_id, "t1");
		assert_eq!(replies[0].replied_to_message_id.as_deref(), Some("p1"));
		assert!(replies_of(&transcript, GRACE).is_empty(), "a companion nobody named answered");
		assert!(host.stored_ids().contains(&json!("p1")), "the guest heard no stored message");
		assert_eq!(completed_texts(&host.agent_events(ADA)), vec!["noted"]);
		assert!(host.agent_events(GRACE).is_empty(), "the guest heard a session nobody summoned");
		assert_eq!(host.calls, 1);
		host.quit().await;
	});
}

#[test]
fn a_reply_naming_a_seated_companion_starts_it_in_the_next_wave() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("handover", "room_handover").await;

		let answer = host.send_turn(sent("p1", "t1", "<@b-ada> who takes the walls?"), &[]).await;
		host.turn_ended_for(GRACE).await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		let transcript = host.transcript().await;
		let handed = replies_of(&transcript, ADA);
		assert_eq!(handed.len(), 1, "the room holds {transcript:#?}");
		assert_eq!(handed[0].content, "<@b-grace> over to you");
		let answered = replies_of(&transcript, GRACE);
		assert_eq!(answered.len(), 1, "the room holds {transcript:#?}");
		assert_eq!(answered[0].content, "noted");
		assert_eq!(answered[0].turn_id, "t1");
		assert_eq!(answered[0].replied_to_message_id.as_deref(), Some("p1"));
		assert!(handed[0].seq < answered[0].seq, "the handed companion spoke first");
		host.quit().await;
	});
}

#[test]
fn a_bot_outside_the_shared_space_is_refused_and_nothing_is_stored() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("outside", "room_reply").await;

		let answer = host.send_turn(sent("p1", "t1", "<@b-nyx> are you there?"), &[NYX]).await;

		assert_eq!(answer["status"], json!(403), "{answer}");
		assert!(host.transcript().await.is_empty(), "a refused call stored a message");
		assert_eq!(host.turn_rows().await, 0, "a refused call opened a turn");
		host.quit().await;
	});
}

#[test]
fn a_second_call_while_a_turn_runs_queues_behind_it_in_the_same_run() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("running", "held_echo").await;

		let first = host.send_turn(sent("p1", "t1", "take your time"), &[ADA]).await;
		let second = host.send_turn(sent("p2", "t2", "and now?"), &[ADA]).await;
		host.allow_write(ADA, 1).await;
		host.allow_write(ADA, 2).await;
		host.turns_closed_for(ADA, 1).await;

		assert_eq!(first["status"], json!(200), "{first}");
		assert_eq!(second["status"], json!(200), "{second}");
		let transcript = host.transcript().await;
		let turns: Vec<&str> =
			replies_of(&transcript, ADA).iter().map(|reply| reply.turn_id.as_str()).collect();
		assert_eq!(turns, vec!["t1", "t2"], "the room holds {transcript:#?}");
		assert_eq!(host.scopes_heard(ADA).len(), 1, "the queued call opened another run");
		host.quit().await;
	});
}

#[test]
fn a_companion_that_cannot_start_fails_its_turn_and_leaves_the_others_to_reply() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("one-fails", "room_grace_cannot_start").await;

		let answer = host.send_turn(sent("p1", "t1", "both of you, please"), &[ADA, GRACE]).await;
		host.turn_ended_for(ADA).await;
		host.heard_until(|frames| {
			agent_events_in(frames, GRACE).any(|event| event["type"] == "failed")
		})
		.await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		let transcript = host.transcript().await;
		assert!(transcript.iter().any(|message| message.id == "p1"), "the prompt was dropped");
		assert_eq!(replies_of(&transcript, ADA).len(), 1, "the room holds {transcript:#?}");
		assert!(
			replies_of(&transcript, GRACE).is_empty(),
			"a companion that never started replied"
		);
		assert!(host.completed_at("t1").await.is_some(), "the failed turn was left open");
		host.quit().await;
	});
}

#[test]
fn a_turn_that_ended_for_its_companion_lets_the_next_send_in_and_hands_its_session_over() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("in-a-row", "room_reply").await;

		let first = host.send_turn(sent("p1", "t1", "first round"), &[ADA]).await;
		host.turns_closed_for(ADA, 1).await;
		let second = host.send_turn(sent("p2", "t2", "second round"), &[ADA]).await;
		host.turns_closed_for(ADA, 2).await;

		assert_eq!(first["status"], json!(200), "{first}");
		assert_eq!(second["status"], json!(200), "{second}");
		let transcript = host.transcript().await;
		let turns: Vec<&str> =
			replies_of(&transcript, ADA).iter().map(|reply| reply.turn_id.as_str()).collect();
		assert_eq!(turns, vec!["t1", "t2"], "the room holds {transcript:#?}");
		assert_eq!(host.active_sessions_of(ADA).await, 1, "a host turn left a session active");
		host.quit().await;
	});
}

#[test]
fn a_stop_after_a_handover_cancels_the_companion_handed_the_work_and_closes_the_turn() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("stop-on-host", "room_handover_held").await;

		host.send_turn(sent("p1", "t1", "<@b-ada> who takes the walls?"), &[]).await;
		host.speaking(GRACE).await;
		let heard_before_stop = host.frames.len();
		let handed_over: RuntimeScope =
			serde_json::from_value(host.scope_of(ADA)).expect("a runtime scope");
		let outcome = agent_cancel_turn(
			host.app.handle().clone(),
			host.app.state::<AgentState>(),
			handed_over,
		)
		.await;

		assert_eq!(outcome, Ok(CancelOutcome::Cancelled));

		host.stopped_after_a_handover(heard_before_stop).await;
		host.quit().await;
	});
}

#[test]
fn a_member_stop_after_a_handover_ends_the_turn_as_a_stop_on_the_host_does() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("stop-from-member", "room_handover_held").await;

		host.send_turn(sent("p1", "t1", "<@b-ada> who takes the walls?"), &[]).await;
		host.speaking(GRACE).await;
		let heard_before_stop = host.frames.len();
		let scope = host.scope_of(ADA);
		let stop = host.called("agent_cancel_turn", json!({ "scope": scope })).await;

		assert_eq!(stop["status"], json!(200), "{stop}");
		host.stopped_after_a_handover(heard_before_stop).await;
		host.quit().await;
	});
}

#[test]
fn a_stop_starts_none_of_the_companions_still_awaited_in_the_turn() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("stop-awaited", "room_handover_held").await;

		host.send_turn(sent("p1", "t1", "both of you, please"), &[ADA, GRACE]).await;
		host.turn_ended_for(ADA).await;
		host.speaking(GRACE).await;
		let heard_before_stop = host.frames.len();
		let scope = host.scope_of(ADA);
		let stop = host.called("agent_cancel_turn", json!({ "scope": scope })).await;

		assert_eq!(stop["status"], json!(200), "{stop}");
		host.stopped_after_a_handover(heard_before_stop).await;
		host.quit().await;
	});
}

#[test]
fn a_speaker_whose_session_shuts_down_mid_turn_releases_the_turn_for_the_next_send() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("speaker-shut-down", "room_lead_held").await;

		host.send_turn(sent("p1", "t1", "both of you, please"), &[ADA, GRACE]).await;
		host.turn_ended_for(GRACE).await;
		host.speaking(ADA).await;
		let held: RuntimeScope =
			serde_json::from_value(host.scope_of(ADA)).expect("a runtime scope");
		shutdown_session(host.app.handle(), &host.app.state::<AgentState>(), &held).await;
		host.turn_ended_for(ADA).await;

		let ada_ended: Vec<Value> = host
			.agent_events(ADA)
			.into_iter()
			.filter(|event| event["type"] == "turnEnded")
			.collect();
		assert_eq!(ada_ended.len(), 1, "heard {ada_ended:#?}");
		assert_eq!(ada_ended[0]["ended"]["outcome"], json!("cancelled"));
		assert!(
			host.completed_at("t1").await.is_some(),
			"the turn of the shut session was left open"
		);
		assert_eq!(host.runs_of("t1").await, 0, "a run of the shut session was kept");
		let next = host.send_turn(sent("p2", "t2", "and now?"), &[GRACE]).await;
		assert_eq!(next["status"], json!(200), "the shut session still holds the room: {next}");
		host.quit().await;
	});
}

const A_SECOND_ROOM_AND_A_MISSION_THREAD: &str = "
	INSERT INTO conversations (id, kind, title, created_at, updated_at, space_id)
		VALUES ('room-2', 'topic', 'Second room', 1, 1, 'personal'),
			('mission-thread-1', 'mission', 'Mission thread', 1, 1, 'personal');
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('room-2', 'b-ada', 'lead', 1, 0),
			('mission-thread-1', 'b-ada', 'lead', 1, 0);
";

#[test]
fn a_member_turn_joins_the_live_host_run_without_a_new_row_or_a_new_process() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("join-host-run", "normal").await;
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.turn_ended_for(ADA).await;

		let answer = host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;
		host.heard_until(|frames| {
			agent_events_in(frames, ADA).filter(|event| event["type"] == "turnEnded").count() >= 2
		})
		.await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		assert_eq!(host.scopes_heard(ADA), vec![held.runtime_session_id.clone()]);
		let live = host.live_runs_of(ADA).await;
		assert_eq!(live.len(), 1, "the member turn opened another process: {live:#?}");
		assert_eq!(live[0].runtime_session_id, held.runtime_session_id);
		assert_eq!(
			host.runtime_sessions_of(ADA).await,
			vec![(held.runtime_session_id.clone(), "active".to_owned())],
			"the member turn moved the host row"
		);
		let transcript = host.transcript().await;
		let replies = replies_of(&transcript, ADA);
		assert_eq!(replies.len(), 2, "the room holds {transcript:#?}");
		assert_eq!(replies[1].turn_id, "t1");
		assert!(replies[1].content.starts_with("echo :: ["), "{}", replies[1].content);
		assert!(replies[1].content.ends_with("]\nmember second"), "{}", replies[1].content);
		host.quit().await;
	});
}

#[test]
fn a_member_turn_during_a_running_host_turn_queues_and_both_answers_land_in_order() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("queue-behind-host", "held_echo").await;
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.heard_until(|frames| !asked_to_write(frames, ADA).is_empty()).await;

		let answer = host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;
		host.allow_write(ADA, 1).await;
		host.allow_write(ADA, 2).await;
		host.heard_until(|frames| {
			agent_events_in(frames, ADA).filter(|event| event["type"] == "turnEnded").count() >= 2
		})
		.await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		let transcript = host.transcript().await;
		let replies = replies_of(&transcript, ADA);
		let turns: Vec<&str> = replies.iter().map(|reply| reply.turn_id.as_str()).collect();
		assert_eq!(turns, vec!["t0", "t1"], "the room holds {transcript:#?}");
		assert_eq!(replies[0].content, "echo :: host first");
		assert!(replies[1].content.ends_with("]\nmember second"), "{}", replies[1].content);
		assert_eq!(host.scopes_heard(ADA), vec![held.runtime_session_id.clone()]);
		assert_eq!(host.live_runs_of(ADA).await.len(), 1);
		assert_eq!(
			host.runtime_sessions_of(ADA).await,
			vec![(held.runtime_session_id.clone(), "active".to_owned())]
		);
		host.quit().await;
	});
}

#[test]
fn a_member_turn_with_no_live_run_resumes_the_stored_session_under_the_same_row() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("resume-stored", "unmentioned_echo").await;

		host.send_turn(sent("p1", "t1", "first round"), &[ADA]).await;
		host.turns_closed_for(ADA, 1).await;
		let rows = host.runtime_sessions_of(ADA).await;
		host.send_turn(sent("p2", "t2", "second round"), &[ADA]).await;
		host.turns_closed_for(ADA, 2).await;

		assert_eq!(rows.len(), 1, "{rows:?}");
		assert_eq!(host.runtime_sessions_of(ADA).await, rows, "the resume moved the row");
		assert_eq!(host.scopes_heard(ADA), vec![rows[0].0.clone()]);
		let transcript = host.transcript().await;
		let replies = replies_of(&transcript, ADA);
		assert_eq!(replies.len(), 2, "the room holds {transcript:#?}");
		assert!(replies[0].content.contains("The new message:"), "{}", replies[0].content);
		assert!(
			replies[1].content.starts_with("resumed fake-session-0001 :: ["),
			"{}",
			replies[1].content
		);
		assert!(replies[1].content.ends_with("]\nsecond round"), "{}", replies[1].content);
		assert!(host.live_runs_of(ADA).await.is_empty(), "the resumed run outlived its turn");
		host.quit().await;
	});
}

#[test]
fn another_conversation_and_a_mission_thread_of_the_same_bot_each_keep_their_own_run() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("two-conversations", "held_echo").await;
		host.plant(A_SECOND_ROOM_AND_A_MISSION_THREAD).await;
		let held = host.host_run(ROOM, ADA).await;

		let elsewhere = host.send_turn(sent_in(SECOND_ROOM, "p1", "t1", "over here"), &[ADA]).await;
		let threaded =
			host.send_turn(sent_in(MISSION_THREAD, "p2", "t2", "and here"), &[ADA]).await;
		host.heard_until(|frames| asked_to_write(frames, ADA).len() >= 2).await;
		let live = host.live_runs_of(ADA).await;
		host.allow_write(ADA, 1).await;
		host.allow_write(ADA, 2).await;
		host.heard_until(|frames| shut_downs_in(frames, ADA) >= 2).await;

		assert_eq!(elsewhere["status"], json!(200), "{elsewhere}");
		assert_eq!(threaded["status"], json!(200), "{threaded}");
		let mut conversations: Vec<&str> =
			live.iter().map(|run| run.conversation_id.as_str()).collect();
		conversations.sort_unstable();
		assert_eq!(conversations, vec![MISSION_THREAD, ROOM, SECOND_ROOM], "{live:#?}");
		let distinct: std::collections::HashSet<&str> =
			live.iter().map(|run| run.runtime_session_id.as_str()).collect();
		assert_eq!(distinct.len(), 3, "two conversations shared a run: {live:#?}");
		let still_live = host.live_runs_of(ADA).await;
		assert_eq!(still_live.len(), 1, "{still_live:#?}");
		assert_eq!(still_live[0].runtime_session_id, held.runtime_session_id);
		host.quit().await;
	});
}

#[test]
fn a_companion_named_by_a_bot_rides_the_host_run_through_the_same_path() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("mention-joins", "room_handover").await;
		let held = host.host_run(ROOM, GRACE).await;

		let answer = host.send_turn(sent("p1", "t1", "<@b-ada> who takes the walls?"), &[]).await;
		host.turn_ended_for(GRACE).await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		assert_eq!(host.scopes_heard(GRACE), vec![held.runtime_session_id.clone()]);
		let grace = host.live_runs_of(GRACE).await;
		assert_eq!(grace.len(), 1, "{grace:#?}");
		assert_eq!(grace[0].runtime_session_id, held.runtime_session_id);
		let transcript = host.transcript().await;
		assert_eq!(replies_of(&transcript, GRACE).len(), 1, "the room holds {transcript:#?}");
		host.quit().await;
	});
}

#[test]
fn a_member_turn_queued_past_its_start_deadline_keeps_its_run_until_it_is_answered() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("queued-past-deadline", "held_echo").await;
		host.app.manage(TurnRunDeadlines::after(SHORT_START_DEADLINE));
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.heard_until(|frames| !asked_to_write(frames, ADA).is_empty()).await;

		let answer = host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;
		tokio::time::sleep(SHORT_START_DEADLINE * 3).await;
		let awaited = host.runs_of("t1").await;
		let completed_while_queued = host.completed_at("t1").await;
		host.allow_write(ADA, 1).await;
		host.allow_write(ADA, 2).await;
		host.heard_until(|frames| {
			agent_events_in(frames, ADA).filter(|event| event["type"] == "turnEnded").count() >= 2
		})
		.await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		assert_eq!(awaited, 1, "the queued run expired at its start deadline");
		assert_eq!(completed_while_queued, None, "the queued turn closed before it was answered");
		let transcript = host.transcript().await;
		let answered: Vec<&StoredMessage> = replies_of(&transcript, ADA)
			.into_iter()
			.filter(|reply| reply.turn_id == "t1")
			.collect();
		assert_eq!(answered.len(), 1, "the room holds {transcript:#?}");
		assert!(answered[0].content.ends_with("]\nmember second"), "{}", answered[0].content);
		host.quit().await;
	});
}

#[test]
fn a_queued_member_turn_withdrawn_by_a_stop_leaves_its_run_cancelled_and_not_awaited() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("withdrawn-by-stop", "held_echo").await;
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.heard_until(|frames| !asked_to_write(frames, ADA).is_empty()).await;
		host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;

		let outcome =
			agent_cancel_turn(host.app.handle().clone(), host.app.state::<AgentState>(), held)
				.await;

		assert_eq!(outcome, Ok(CancelOutcome::Cancelled));
		assert_eq!(host.runs_of("t1").await, 0, "the withdrawn run was left awaited");
		assert!(host.completed_at("t1").await.is_some(), "the withdrawn turn was left open");
		let transcript = host.transcript().await;
		assert!(
			replies_of(&transcript, ADA).iter().all(|reply| reply.turn_id != "t1"),
			"the withdrawn prompt was answered: {transcript:#?}"
		);
		host.quit().await;
	});
}

#[test]
fn a_queued_member_turn_survives_a_lagged_reader_and_its_reply_is_stored_once() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("queued-reader-lagged", "held_echo").await;
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.heard_until(|frames| !asked_to_write(frames, ADA).is_empty()).await;
		let answer = host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;

		let stall = Stall::every_worker();
		host.flood();
		stall.released();
		host.reconnected().await;
		let kept = host.runs_of("t1").await;
		host.allow_write(ADA, 1).await;
		host.allowed_in_time(ADA, 2).await;
		host.answered("t1").await;

		assert_eq!(answer["status"], json!(200), "{answer}");
		assert_eq!(kept, 1, "the lagged reader ended the queued run");
		let transcript = host.transcript().await;
		let answered: Vec<&StoredMessage> = replies_of(&transcript, ADA)
			.into_iter()
			.filter(|reply| reply.turn_id == "t1")
			.collect();
		assert_eq!(answered.len(), 1, "the room holds {transcript:#?}");
		assert!(answered[0].content.ends_with("]\nmember second"), "{}", answered[0].content);
		assert_eq!(host.runs_of("t1").await, 0, "the answered run was kept");
		let live = host.live_runs_of(ADA).await;
		assert_eq!(live.len(), 1, "{live:#?}");
		assert_eq!(live[0].runtime_session_id, held.runtime_session_id);
		assert_eq!(
			host.runtime_sessions_of(ADA).await,
			vec![(held.runtime_session_id.clone(), "active".to_owned())]
		);
		host.quit().await;
	});
}

#[test]
fn queued_member_turns_resubscribed_after_a_lag_are_each_written_once_in_order() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("queued-resubscribed", "held_echo").await;
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.heard_until(|frames| !asked_to_write(frames, ADA).is_empty()).await;
		host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;
		host.send_turn(sent("p2", "t2", "member third"), &[ADA]).await;

		let stall = Stall::every_worker();
		host.flood();
		stall.released();
		host.reconnected().await;
		host.allow_write(ADA, 1).await;
		host.allowed_in_time(ADA, 2).await;
		host.allowed_in_time(ADA, 3).await;
		host.answered("t2").await;

		assert_eq!(asked_to_write(&host.frames, ADA).len(), 3, "a queued prompt was written twice");
		let transcript = host.transcript().await;
		let replies = replies_of(&transcript, ADA);
		let turns: Vec<&str> = replies.iter().map(|reply| reply.turn_id.as_str()).collect();
		assert_eq!(turns, vec!["t0", "t1", "t2"], "the room holds {transcript:#?}");
		assert!(replies[1].content.ends_with("]\nmember second"), "{}", replies[1].content);
		assert!(replies[2].content.ends_with("]\nmember third"), "{}", replies[2].content);
		assert_eq!(host.scopes_heard(ADA), vec![held.runtime_session_id.clone()]);
		host.quit().await;
	});
}

#[test]
fn a_queued_member_turn_whose_session_is_gone_after_a_lag_fails_to_the_member() {
	let _serial = serial();
	block_on(async {
		let mut host = Host::hosting("queued-session-gone", "held_echo").await;
		let held = host.host_run(ROOM, ADA).await;
		host.host_says(&held, "h1", "t0", "host first").await;
		host.heard_until(|frames| !asked_to_write(frames, ADA).is_empty()).await;
		host.send_turn(sent("p1", "t1", "member second"), &[ADA]).await;

		host.session_gone_while_lagging(&held).await;
		host.reconnected().await;
		let failed =
			host.heard_until(|frames| failures_in_turn(frames, ADA, "t1").next().is_some());
		timeout(PATIENCE, failed).await.expect("the member heard the failure in time");

		let failure = failures_in_turn(&host.frames, ADA, "t1").next().cloned();
		let failure = failure.expect("the member heard the failure");
		assert!(failure["error"]["kind"].is_string(), "the failure carries no reason: {failure}");
		host.answered("t1").await;
		assert_eq!(host.runs_of("t1").await, 0, "the failed run was kept");
		let transcript = host.transcript().await;
		assert!(
			replies_of(&transcript, ADA).iter().all(|reply| reply.turn_id != "t1"),
			"the failed turn was answered: {transcript:#?}"
		);
		host.quit().await;
	});
}
