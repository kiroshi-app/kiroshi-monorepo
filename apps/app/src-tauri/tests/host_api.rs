mod common;

use std::fmt::Display;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::contract::TransportError;
use kiroshi_app::agent::AgentState;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::events::{self, BUFFERED_FRAMES, MISSION_CHANGED};
use kiroshi_app::host_api::cors;
use kiroshi_app::host_api::events::SEND_PATIENCE;
use kiroshi_app::host_api::invoke::MAX_BODY_BYTES;
use kiroshi_app::missions::commands::MissionChanged;
use kiroshi_app::missions::contract::MissionState;
use kiroshi_app::routines::webhook::{self, Webhook};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpSocket, TcpStream};
use tokio::time::timeout;

const SPACE: &str = "personal";

const PATIENCE: Duration = Duration::from_secs(60);

const TEXT: u8 = 0x1;

const BINARY: u8 = 0x2;

const CLOSE: u8 = 0x8;

const TRY_AGAIN_LATER: u16 = 1013;

const CHANGED: &str = kiroshi_app::missions::commands::CHANGED_EVENT;

struct Host {
	app: AppOfItsOwn,
	dir: PathBuf,
}

impl Host {
	fn new() -> Self {
		let app = an_app_of_its_own("host-api", mock_builder().invoke_handler(invoke_handler()));
		let dir = app.path().app_data_dir().expect("data dir");
		app.manage(db::bootstrap(app.handle()));
		Self { app, dir }
	}

	fn window(&self) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(self.app.handle(), "main", Default::default())
			.build()
			.expect("window builds")
	}

	fn started(&self) -> Server {
		Server(webhook::start(self.app.handle().clone()))
	}

	fn token_path(&self) -> PathBuf {
		self.dir.join("host").join("token")
	}

	fn token(&self) -> String {
		std::fs::read_to_string(self.token_path()).expect("the token is on disk")
	}

	fn emit(&self, marker: impl Display) {
		events::emit(self.app.handle(), MISSION_CHANGED, changed(marker))
			.expect("the window took the event");
	}

	async fn emit_bulk(&self, count: usize) {
		let handle = self.app.handle().clone();
		let bulk = "x".repeat(8 * 1024);
		let emitting = tokio::task::spawn_blocking(move || {
			for order in 0..count {
				events::emit(&handle, MISSION_CHANGED, changed(format!("{order}{bulk}")))
					.expect("the window took the event");
			}
		});
		timeout(PATIENCE, emitting).await.expect("the emitter never blocked").expect("emitted");
	}

	fn heard_by_the_window(&self, event: &str) -> mpsc::Receiver<String> {
		let (told, hearing) = mpsc::channel();
		self.app.listen_any(event, move |heard| {
			told.send(heard.payload().to_owned()).expect("the test listens");
		});
		hearing
	}
}

struct Server(Webhook);

impl Server {
	fn address(&self) -> String {
		let url = self.0.url().expect("the server bound an address");
		url.trim_start_matches("http://")
			.split('/')
			.next()
			.expect("the url names a host")
			.to_owned()
	}

	async fn invoke(&self, command: &str, token: Option<&str>, body: &str) -> (u16, String) {
		let answer = self.invoke_answer(command, token, body).await;
		(answer.status, answer.body)
	}

	async fn invoke_answer(&self, command: &str, token: Option<&str>, body: &str) -> Answer {
		let mut request = format!(
			"POST /api/invoke/{command} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Length: {}\r\n",
			body.len()
		);
		if let Some(token) = token {
			request.push_str(&format!("Authorization: Bearer {token}\r\n"));
		}
		request.push_str("\r\n");
		request.push_str(body);
		self.exchanged(request.into_bytes()).await
	}

	async fn upgraded(&self, target: &str, header: &str) -> (u16, Client) {
		self.upgraded_over(
			TcpStream::connect(self.address()).await.expect("the listener answers"),
			target,
			header,
		)
		.await
	}

	async fn upgraded_over(
		&self,
		mut stream: TcpStream,
		target: &str,
		header: &str,
	) -> (u16, Client) {
		let request = format!(
			"GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n{header}\r\n"
		);
		stream.write_all(request.as_bytes()).await.expect("the upgrade lands");
		let mut head = Vec::new();
		while !head.ends_with(b"\r\n\r\n") {
			head.push(stream.read_u8().await.expect("the answer reads"));
		}
		let head = String::from_utf8_lossy(&head).into_owned();
		let status = head.split_whitespace().nth(1).expect("the answer carries a status");
		(status.parse().expect("the status is a number"), Client(stream))
	}

	async fn slow_listening(&self, token: &str) -> Client {
		let socket = TcpSocket::new_v4().expect("a socket");
		socket.set_recv_buffer_size(4096).expect("a small buffer");
		let stream =
			socket.connect(self.address().parse().expect("an address")).await.expect("connects");
		let (status, client) =
			self.upgraded_over(stream, &format!("/api/events?token={token}"), "").await;
		assert_eq!(status, 101);
		client
	}

	async fn listening(&self, token: &str) -> Client {
		let (status, client) = self.upgraded(&format!("/api/events?token={token}"), "").await;
		assert_eq!(status, 101);
		client
	}

	async fn sent(&self, request: Vec<u8>) -> (u16, String) {
		let answer = self.exchanged(request).await;
		(answer.status, answer.body)
	}

	async fn exchanged(&self, request: Vec<u8>) -> Answer {
		let mut stream = TcpStream::connect(self.address()).await.expect("the listener answers");
		stream.write_all(&request).await.expect("the request lands");
		let mut answer = Vec::new();
		stream.read_to_end(&mut answer).await.expect("the answer reads");
		let answer = String::from_utf8_lossy(&answer).into_owned();
		let (head, body) = answer.split_once("\r\n\r\n").expect("the answer carries a body");
		let status = head.split_whitespace().nth(1).expect("the answer carries a status");
		Answer {
			status: status.parse().expect("the status is a number"),
			head: head.to_ascii_lowercase(),
			body: body.to_owned(),
		}
	}

	async fn requested(&self, method: &str, target: &str, headers: &str) -> Answer {
		let request = format!(
			"{method} {target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n{headers}\r\n"
		);
		self.exchanged(request.into_bytes()).await
	}

	async fn fetched(&self, target: &str, token: &str) -> Answer {
		self.requested("GET", target, &format!("Authorization: Bearer {token}\r\n")).await
	}
}

struct Answer {
	status: u16,
	head: String,
	body: String,
}

impl Answer {
	fn seen(&self) -> (u16, Option<String>, String) {
		(self.status, self.header("content-type").map(str::to_owned), self.body.clone())
	}

	fn header(&self, name: &str) -> Option<&str> {
		self.head.lines().find_map(|line| line.strip_prefix(&format!("{name}: ")))
	}
}

impl Drop for Server {
	fn drop(&mut self) {
		self.0.stop();
	}
}

struct Client(TcpStream);

impl Client {
	async fn frame(&mut self) -> (u8, Vec<u8>) {
		timeout(PATIENCE, self.read_frame()).await.expect("a frame arrives in time")
	}

	async fn read_frame(&mut self) -> (u8, Vec<u8>) {
		let opcode = self.0.read_u8().await.expect("a frame head") & 0x0f;
		let length = match self.0.read_u8().await.expect("a frame length") & 0x7f {
			126 => u64::from(self.0.read_u16().await.expect("a 16 bit length")),
			127 => self.0.read_u64().await.expect("a 64 bit length"),
			short => u64::from(short),
		};
		let mut data = vec![0; usize::try_from(length).expect("a frame that fits")];
		self.0.read_exact(&mut data).await.expect("the frame data");
		(opcode, data)
	}

	async fn text(&mut self) -> String {
		let (opcode, data) = self.frame().await;
		assert_eq!(opcode, TEXT);
		String::from_utf8(data).expect("the frame is UTF-8")
	}

	async fn ended(&mut self) {
		let mut rest = Vec::new();
		timeout(PATIENCE, self.0.read_to_end(&mut rest))
			.await
			.expect("the host closes the connection in time")
			.expect("the connection ends cleanly");
	}

	async fn heard_until(mut self, last: String) {
		while self.text().await != last {}
	}

	async fn reset_without_reading(&mut self) {
		let payload = [b'x'; u16::MAX as usize];
		let length = u16::MAX.to_be_bytes();
		let mut frame = vec![0x80 | TEXT, 0x80 | 126, length[0], length[1], 0, 0, 0, 0];
		frame.extend_from_slice(&payload);
		while self.0.write_all(&frame).await.is_ok() {}
	}

	async fn send(&mut self, opcode: u8, data: &[u8]) {
		let unmasking_key = [0; 4];
		let mut frame =
			vec![0x80 | opcode, 0x80 | u8::try_from(data.len()).expect("a short frame")];
		frame.extend_from_slice(&unmasking_key);
		frame.extend_from_slice(data);
		self.0.write_all(&frame).await.expect("the frame lands");
	}
}

fn relayed(event: &str, window_payload: &str) -> String {
	format!(r#"{{"event":"{event}","payload":{window_payload}}}"#)
}

fn changed(marker: impl Display) -> MissionChanged {
	MissionChanged {
		mission_id: marker.to_string(),
		space_id: None,
		state: MissionState::Working,
		state_seq: 1,
		is_agent_running: true,
		last_activity_at: None,
	}
}

fn window_payload_of(marker: impl Display) -> String {
	serde_json::to_string(&changed(marker)).expect("a payload")
}

fn relayed_change(marker: impl Display) -> String {
	relayed(CHANGED, &window_payload_of(marker))
}

fn direct(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
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
	.map(|response| response.deserialize::<Value>().expect("the answer is JSON"))
	.map_err(|error| serde_json::to_value(error).expect("the error is JSON"))
}

fn parsed(body: &str) -> Value {
	serde_json::from_str(body).expect("the body is JSON")
}

fn listed() -> String {
	json!({ "spaceId": SPACE }).to_string()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_call_without_authorization_is_refused() {
	let host = Host::new();
	let _window = host.window();
	let server = host.started();

	assert_eq!(server.invoke("conversation_list", None, &listed()).await.0, 401);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_call_with_a_wrong_token_is_refused() {
	let host = Host::new();
	let _window = host.window();
	let server = host.started();
	let wrong = format!("{}x", host.token());

	assert_eq!(server.invoke("conversation_list", Some(&wrong), &listed()).await.0, 401);
	assert_eq!(server.invoke("conversation_list", Some(""), &listed()).await.0, 401);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_unregistered_command_answers_not_found() {
	let host = Host::new();
	let _window = host.window();
	let server = host.started();
	let token = host.token();

	assert_eq!(server.invoke("no_such_command", Some(&token), "{}").await.0, 404);
	assert_eq!(server.invoke("plugin:dialog|open", Some(&token), "{}").await.0, 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_oversized_body_is_refused_before_any_command_runs() {
	let host = Host::new();
	let _window = host.window();
	let server = host.started();
	let request = format!(
		"POST /api/invoke/conversation_create HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n",
		host.token(),
		MAX_BODY_BYTES + 1
	);

	assert_eq!(server.sent(request.into_bytes()).await.0, 413);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_foreign_host_is_refused() {
	let host = Host::new();
	let _window = host.window();
	let server = host.started();
	let body = listed();
	let request = format!(
		"POST /api/invoke/conversation_list HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\nAuthorization: Bearer {}\r\nContent-Length: {}\r\n\r\n{body}",
		host.token(),
		body.len()
	);

	assert_eq!(server.sent(request.into_bytes()).await.0, 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_read_answers_the_json_the_front_receives() {
	let host = Host::new();
	let window = host.window();
	let server = host.started();
	direct(&window, "conversation_main_chat", json!({ "botId": "default" })).expect("a chat");

	let (status, body) = server.invoke("conversation_list", Some(&host.token()), &listed()).await;

	assert_eq!(status, 200);
	assert_eq!(
		parsed(&body),
		direct(&window, "conversation_list", json!({ "spaceId": SPACE })).expect("the rooms")
	);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_write_is_seen_by_the_next_read() {
	let host = Host::new();
	let window = host.window();
	let server = host.started();
	let token = host.token();
	direct(&window, "conversation_main_chat", json!({ "botId": "default" })).expect("a chat");
	let draft =
		json!({ "spaceId": SPACE, "sectionId": null, "title": "Over HTTP", "botIds": ["default"] });

	let (status, created) =
		server.invoke("conversation_create", Some(&token), &draft.to_string()).await;
	assert_eq!(status, 200, "{created}");
	let id = parsed(&created)["id"].as_str().expect("the room holds an id").to_owned();
	let (_, rooms) = server.invoke("conversation_list", Some(&token), &listed()).await;
	assert!(parsed(&rooms).as_array().expect("a list").iter().any(|room| room["id"] == json!(id)));

	let deleted = json!({ "conversationId": id }).to_string();
	assert_eq!(
		server.invoke("conversation_delete", Some(&token), &deleted).await,
		(200, "null".to_owned())
	);
	let (_, rooms) = server.invoke("conversation_list", Some(&token), &listed()).await;
	assert!(!parsed(&rooms).as_array().expect("a list").iter().any(|room| room["id"] == json!(id)));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_rejected_command_answers_the_error_the_front_receives() {
	let host = Host::new();
	let window = host.window();
	let server = host.started();
	let edit =
		json!({ "conversationId": "nowhere", "title": "t", "instructions": "", "sectionId": null });

	let (status, body) =
		server.invoke("conversation_update", Some(&host.token()), &edit.to_string()).await;

	assert_eq!(status, 500);
	assert_eq!(Err(parsed(&body)), direct(&window, "conversation_update", edit));
}

#[tokio::test(flavor = "multi_thread")]
async fn without_any_window_a_command_answers_what_the_window_answers() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	let edit =
		json!({ "conversationId": "nowhere", "title": "t", "instructions": "", "sectionId": null });
	let calls = [
		("conversation_main_chat", json!({ "botId": "default" })),
		("conversation_list", json!({ "spaceId": SPACE })),
		("conversation_update", edit),
		("no_such_command", json!({})),
	];

	let mut windowless = Vec::new();
	for (command, body) in &calls {
		windowless
			.push(server.invoke_answer(command, Some(&token), &body.to_string()).await.seen());
	}
	let window = host.window();

	for ((command, body), answer) in calls.iter().zip(&windowless) {
		let windowed = server.invoke_answer(command, Some(&token), &body.to_string()).await;
		assert_eq!(answer, &windowed.seen(), "{command}");
	}
	let [chat, rooms, rejected, unknown] = windowless.as_slice() else {
		panic!("every call answered");
	};
	assert_eq!(chat.0, 200);
	assert_eq!(parsed(&chat.2), direct(&window, calls[0].0, calls[0].1.clone()).expect("a chat"));
	assert_eq!(rooms.0, 200);
	assert_eq!(parsed(&rooms.2), direct(&window, calls[1].0, calls[1].1.clone()).expect("rooms"));
	assert_eq!(rejected.0, 500);
	assert_eq!(Err(parsed(&rejected.2)), direct(&window, calls[2].0, calls[2].1.clone()));
	assert_eq!(unknown.0, 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_permission_answer_reaches_its_handler_without_any_window() {
	let host = Host::new();
	host.app.manage(AgentState::default());
	let server = host.started();
	let answer = json!({
		"scope": {
			"conversationId": "room",
			"botId": "default",
			"runtimeSessionId": "session",
			"epoch": 1
		},
		"id": "permission",
		"decision": "allowOnce"
	});

	let (status, body) = server
		.invoke("agent_respond_to_permission", Some(&host.token()), &answer.to_string())
		.await;

	let windowed = direct(&host.window(), "agent_respond_to_permission", answer);
	assert_eq!(status, 500);
	assert_eq!(Err(parsed(&body)), windowed);
	assert_eq!(windowed, Err(serde_json::to_value(TransportError::NotStarted).expect("JSON")));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_window_opened_after_a_windowless_call_and_the_api_both_keep_answering() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	assert_eq!(server.invoke("conversation_list", Some(&token), &listed()).await.0, 200);

	let window = host.window();

	direct(&window, "conversation_main_chat", json!({ "botId": "default" })).expect("a chat");
	let (status, body) = server.invoke("conversation_list", Some(&token), &listed()).await;
	assert_eq!(status, 200);
	assert_eq!(
		parsed(&body),
		direct(&window, "conversation_list", json!({ "spaceId": SPACE })).expect("the rooms")
	);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_token_is_private_and_reused_across_starts() {
	let host = Host::new();
	let _window = host.window();
	let first = host.started();
	let token = host.token();
	drop(first);

	let mode = std::fs::metadata(host.token_path()).expect("the token file").permissions().mode();
	assert_eq!(mode & 0o777, 0o600);
	assert!(token.len() >= 32);

	let second = host.started();
	assert_eq!(host.token(), token);
	assert_eq!(second.invoke("conversation_list", Some(&token), &listed()).await.0, 200);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_upgrade_is_admitted_with_the_token_as_query_or_bearer() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();

	assert_eq!(server.upgraded(&format!("/api/events?token={token}"), "").await.0, 101);
	assert_eq!(server.upgraded(&format!("/api/events?a=b&token={token}"), "").await.0, 101);
	assert_eq!(
		server.upgraded("/api/events", &format!("Authorization: Bearer {token}\r\n")).await.0,
		101
	);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_upgrade_without_the_token_is_refused() {
	let host = Host::new();
	let server = host.started();
	let wrong = format!("{}x", host.token());

	assert_eq!(server.upgraded("/api/events", "").await.0, 401);
	assert_eq!(server.upgraded("/api/events?token=", "").await.0, 401);
	assert_eq!(server.upgraded(&format!("/api/events?token={wrong}"), "").await.0, 401);
	assert_eq!(
		server.upgraded("/api/events", &format!("Authorization: Bearer {wrong}\r\n")).await.0,
		401
	);
}

#[tokio::test(flavor = "multi_thread")]
async fn an_upgrade_from_a_foreign_host_answers_the_invoke_refusal() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	let upgrade = format!(
		"GET /api/events?token={token} HTTP/1.1\r\nHost: attacker.example\r\nConnection: Upgrade, close\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
	);
	let invoke = format!(
		"POST /api/invoke/conversation_list HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\nAuthorization: Bearer {token}\r\nContent-Length: 0\r\n\r\n"
	);

	let refused = server.sent(upgrade.into_bytes()).await;

	assert_eq!(refused.0, 404);
	assert_eq!(refused, server.sent(invoke.into_bytes()).await);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_hears_the_payload_the_window_receives() {
	let host = Host::new();
	let server = host.started();
	let mut client = server.listening(&host.token()).await;
	let window = host.heard_by_the_window(CHANGED);

	host.emit("é\n\"quoted\"");

	let window_payload = window.recv_timeout(PATIENCE).expect("the window heard");
	assert_eq!(client.text().await, relayed(CHANGED, &window_payload));
}

#[tokio::test(flavor = "multi_thread")]
async fn every_client_hears_every_event_in_emit_order() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	let mut first = server.listening(&token).await;
	let mut second = server.listening(&token).await;

	for order in 0..50 {
		host.emit(order);
	}

	for order in 0..50 {
		assert_eq!(first.text().await, relayed_change(order));
		assert_eq!(second.text().await, relayed_change(order));
	}
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_that_leaves_is_dropped_and_the_others_keep_hearing() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	let leaving = server.listening(&token).await;
	let mut staying = server.listening(&token).await;
	let window = host.heard_by_the_window(CHANGED);
	drop(leaving);

	for order in 0..20 {
		host.emit(order);
	}

	for order in 0..20 {
		assert_eq!(staying.text().await, relayed_change(order));
		assert_eq!(
			window.recv_timeout(PATIENCE).expect("the window heard"),
			window_payload_of(order)
		);
	}
}

#[tokio::test(flavor = "multi_thread")]
async fn every_frame_a_client_sends_but_close_is_ignored() {
	let host = Host::new();
	let server = host.started();
	let mut client = server.listening(&host.token()).await;

	client.send(TEXT, b"hello").await;
	client.send(BINARY, b"\x00\x01").await;
	host.emit("after");

	assert_eq!(client.text().await, relayed_change("after"));

	client.send(CLOSE, &[]).await;
	host.emit("closed");
	client.ended().await;
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_that_falls_behind_is_closed_without_blocking_the_emitter() {
	let host = Host::new();
	let server = host.started();
	let mut client = server.slow_listening(&host.token()).await;

	host.emit_bulk(BUFFERED_FRAMES + 512).await;

	let closing = loop {
		let (opcode, data) = client.frame().await;
		if opcode == CLOSE {
			break data;
		}
	};
	assert_eq!(u16::from_be_bytes([closing[0], closing[1]]), TRY_AGAIN_LATER);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_that_stops_reading_is_dropped_while_the_others_keep_hearing() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	let mut stalled = server.slow_listening(&token).await;
	let reading = server.listening(&token).await;
	let later = relayed_change("later");
	let hearing = tokio::spawn(reading.heard_until(later));

	host.emit_bulk(BUFFERED_FRAMES - 24).await;
	host.emit("later");

	timeout(PATIENCE, hearing).await.expect("the reading client heard in time").expect("heard");
	timeout(SEND_PATIENCE + PATIENCE, stalled.reset_without_reading())
		.await
		.expect("the host dropped the stalled client in time");
}

fn stored(path: &Path, bytes: &str) {
	std::fs::create_dir_all(path.parent().expect("a parent")).expect("the directory is made");
	std::fs::write(path, bytes).expect("the file is written");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_avatar_is_served_with_the_content_type_of_its_extension() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	stored(&host.dir.join("avatars").join("face.png"), "png bytes");

	let answer = server.fetched("/api/files/avatars/face.png", &token).await;

	assert_eq!(answer.status, 200);
	assert_eq!(answer.header("content-type"), Some("image/png"));
	assert_eq!(answer.body, "png bytes");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_attachment_is_served_from_its_conversation() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	stored(&host.dir.join("attachments").join("c1").join("note.txt"), "hello");

	let answer = server.fetched("/api/files/attachments/c1/note.txt", &token).await;

	assert_eq!(answer.status, 200);
	assert_eq!(answer.header("content-type"), Some("text/plain; charset=utf-8"));
	assert_eq!(answer.body, "hello");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_file_is_served_with_the_token_as_bearer_or_query_and_refused_without() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	stored(&host.dir.join("avatars").join("face.png"), "png bytes");

	assert_eq!(server.fetched("/api/files/avatars/face.png", &token).await.status, 200);
	let queried = format!("/api/files/avatars/face.png?token={token}");
	assert_eq!(server.requested("GET", &queried, "").await.status, 200);
	assert_eq!(server.requested("GET", "/api/files/avatars/face.png", "").await.status, 401);
	assert_eq!(server.fetched("/api/files/avatars/face.png", "wrong").await.status, 401);
	let wrong = "/api/files/avatars/face.png?token=wrong";
	assert_eq!(server.requested("GET", wrong, "").await.status, 401);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_path_that_leaves_its_directory_answers_not_found() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	stored(&host.dir.join("attachments").join("c1").join("note.txt"), "hello");
	std::fs::create_dir_all(host.dir.join("avatars")).expect("the directory is made");
	std::os::unix::fs::symlink(host.token_path(), host.dir.join("avatars").join("out.png"))
		.expect("the link is made");
	std::os::unix::fs::symlink(host.dir.join("host"), host.dir.join("attachments").join("c2"))
		.expect("the link is made");

	for target in [
		"/api/files/avatars/..",
		"/api/files/avatars/%2E%2E",
		"/api/files/avatars/.",
		"/api/files/avatars/..%2Fhost%2Ftoken",
		"/api/files/avatars/out.png",
		"/api/files/attachments/../c1",
		"/api/files/attachments/c1/..",
		"/api/files/attachments/..%2Fhost/token",
		"/api/files/attachments/c2/token",
		"/api/files/attachments/c1/missing.txt",
		"/api/files/attachments/c1/%2E",
	] {
		assert_eq!(server.fetched(target, &token).await.status, 404, "{target}");
	}
}

#[tokio::test(flavor = "multi_thread")]
async fn a_directory_answers_not_found() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	std::fs::create_dir_all(host.dir.join("attachments").join("c1").join("inner"))
		.expect("the directory is made");

	assert_eq!(server.fetched("/api/files/attachments/c1/inner", &token).await.status, 404);
}

#[test]
fn exactly_the_dev_server_and_the_packaged_window_origins_are_accepted() {
	let window = if cfg!(any(windows, target_os = "android")) {
		"http://tauri.localhost"
	} else {
		"tauri://localhost"
	};

	assert_eq!(cors::ACCEPTED_ORIGINS, ["http://127.0.0.1:1420", "http://localhost:1420", window]);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_preflight_from_each_accepted_origin_is_allowed() {
	let host = Host::new();
	let server = host.started();

	for origin in cors::ACCEPTED_ORIGINS {
		let headers = format!(
			"Origin: {origin}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization\r\n"
		);
		let answer = server.requested("OPTIONS", "/api/invoke/conversation_list", &headers).await;

		assert!((200..300).contains(&answer.status), "{origin}");
		assert_eq!(answer.header("access-control-allow-origin"), Some(origin));
		assert_eq!(answer.header("access-control-allow-methods"), Some("get, post, options"));
		assert_eq!(
			answer.header("access-control-allow-headers"),
			Some("authorization, content-type")
		);
	}
}

#[tokio::test(flavor = "multi_thread")]
async fn a_call_from_each_accepted_origin_names_its_origin() {
	let host = Host::new();
	let server = host.started();

	for origin in cors::ACCEPTED_ORIGINS {
		let answer = server
			.requested("GET", "/api/files/avatars/face.png", &format!("Origin: {origin}\r\n"))
			.await;

		assert_eq!(answer.status, 401, "{origin}");
		assert_eq!(answer.header("access-control-allow-origin"), Some(origin));
	}
}

#[tokio::test(flavor = "multi_thread")]
async fn a_foreign_origin_is_given_no_cors_header() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();

	for origin in
		["http://evil.test", "tauri://localhost.evil.test", "https://localhost:1420", "null"]
	{
		let preflight = server
			.requested(
				"OPTIONS",
				"/api/invoke/conversation_list",
				&format!("Origin: {origin}\r\nAccess-Control-Request-Method: POST\r\n"),
			)
			.await;
		let call = server
			.requested(
				"GET",
				"/api/files/avatars/face.png",
				&format!("Origin: {origin}\r\nAuthorization: Bearer {token}\r\n"),
			)
			.await;

		for answer in [preflight, call] {
			assert!(!answer.head.contains("access-control-allow"), "{origin}: {}", answer.head);
		}
	}
}

#[tokio::test(flavor = "multi_thread")]
async fn no_cors_header_is_given_outside_the_api() {
	let host = Host::new();
	let server = host.started();

	let answer =
		server.requested("OPTIONS", "/routines/call", "Origin: http://127.0.0.1:1420\r\n").await;

	assert!(!answer.head.contains("access-control-allow"), "{}", answer.head);
}

#[tokio::test(flavor = "multi_thread")]
async fn only_an_svg_is_served_inert_and_every_file_unsniffed() {
	let host = Host::new();
	let server = host.started();
	let token = host.token();
	stored(&host.dir.join("avatars").join("face.png"), "png bytes");
	stored(&host.dir.join("avatars").join("face.svg"), "<svg/>");

	let svg = server.fetched("/api/files/avatars/face.svg", &token).await;
	let png = server.fetched("/api/files/avatars/face.png", &token).await;

	assert_eq!(svg.header("content-type"), Some("image/svg+xml"));
	assert_eq!(svg.header("content-security-policy"), Some("default-src 'none'; sandbox"));
	assert_eq!(png.header("content-security-policy"), None);
	for answer in [svg, png] {
		assert_eq!(answer.header("x-content-type-options"), Some("nosniff"));
	}
}
