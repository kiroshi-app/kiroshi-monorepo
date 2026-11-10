use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

use kiroshi_core::agent::contract::ConnectionState;
use tungstenite::Message as Frame;
use tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tungstenite::http::StatusCode;

use super::*;
use crate::model::KiroshiAccountState;

const JOINED_ID: &str = "joined-1";

const REMOTE_SPACE_ID: &str = "remote-space";

const PATIENCE: Duration = Duration::from_secs(10);

const SIGNED_OUT: &str = r#"{"event":"account://changed","payload":{"kind":"signedOut"}}"#;

#[derive(Clone, Debug)]
struct Invoked {
	command: String,
	bearer: String,
	body: Value,
}

enum Push {
	Frame(String),
	Drop,
}

type Answer = Box<dyn Fn(&Invoked) -> (u16, Value) + Send + Sync>;

type Refusal = Box<dyn Fn(&str) -> bool + Send + Sync>;

struct Fake {
	port: u16,
	invoked: Arc<Mutex<Vec<Invoked>>>,
	sockets: Arc<Mutex<Vec<mpsc::Sender<Push>>>>,
}

impl Fake {
	fn start(answer: Answer, refuses_socket: Refusal) -> Fake {
		let listener = TcpListener::bind("127.0.0.1:0").expect("the fake host binds");
		let port = listener.local_addr().expect("the fake host has an address").port();
		let invoked = Arc::new(Mutex::new(Vec::new()));
		let sockets = Arc::new(Mutex::new(Vec::new()));
		let served = Served {
			answer: Arc::new(answer),
			refuses_socket: Arc::new(refuses_socket),
			invoked: Arc::clone(&invoked),
			sockets: Arc::clone(&sockets),
		};
		thread::spawn(move || {
			for stream in listener.incoming().flatten() {
				let served = served.clone();
				thread::spawn(move || served.serve(stream));
			}
		});
		Fake { port, invoked, sockets }
	}

	fn url(&self) -> String {
		format!("http://127.0.0.1:{}", self.port)
	}

	fn invoked(&self, command: &str) -> Vec<Invoked> {
		let invoked = self.invoked.lock().expect("the invoked calls are readable");
		invoked.iter().filter(|call| call.command == command).cloned().collect()
	}

	fn push(&self, push: impl Fn() -> Push) {
		self.sockets
			.lock()
			.expect("the sockets are readable")
			.retain(|socket| socket.send(push()).is_ok());
	}
}

#[derive(Clone)]
struct Served {
	answer: Arc<Answer>,
	refuses_socket: Arc<Refusal>,
	invoked: Arc<Mutex<Vec<Invoked>>>,
	sockets: Arc<Mutex<Vec<mpsc::Sender<Push>>>>,
}

impl Served {
	fn serve(&self, stream: TcpStream) {
		let mut peeked = [0_u8; 64];
		let read = stream.peek(&mut peeked).expect("the fake host peeks a request");
		if peeked[..read].starts_with(b"GET /api/events") {
			self.stream_events(stream);
		} else {
			self.answer_invoke(stream);
		}
	}

	#[expect(clippy::result_large_err)]
	fn stream_events(&self, stream: TcpStream) {
		let (pushed, pushes) = mpsc::channel();
		let accepted = tungstenite::accept_hdr(stream, |request: &Request, response: Response| {
			let bearer = header(request, "authorization");
			if (self.refuses_socket)(&bearer) {
				let mut refused = ErrorResponse::new(None);
				*refused.status_mut() = StatusCode::UNAUTHORIZED;
				return Err(refused);
			}
			self.sockets.lock().expect("the sockets are writable").push(pushed.clone());
			Ok(response)
		});
		let Ok(mut socket) = accepted else { return };
		for push in pushes {
			match push {
				Push::Frame(text) => {
					if socket.send(Frame::text(text)).is_err() {
						return;
					}
				}
				Push::Drop => return,
			}
		}
	}

	fn answer_invoke(&self, stream: TcpStream) {
		let mut reader = BufReader::new(stream.try_clone().expect("the stream clones"));
		let mut line = String::new();
		reader.read_line(&mut line).expect("the request line reads");
		let command = line.split_whitespace().nth(1).unwrap_or("").replace("/api/invoke/", "");
		let (mut bearer, mut length) = (String::new(), 0);
		loop {
			let mut header = String::new();
			reader.read_line(&mut header).expect("a header reads");
			let header = header.trim_end();
			if header.is_empty() {
				break;
			}
			let (name, value) = header.split_once(": ").unwrap_or((header, ""));
			match name.to_ascii_lowercase().as_str() {
				"authorization" => bearer = value.to_owned(),
				"content-length" => length = value.parse().expect("the length is a number"),
				_ => {}
			}
		}
		let mut body = vec![0_u8; length];
		reader.read_exact(&mut body).expect("the body reads");
		let body = serde_json::from_slice(&body).expect("the body is JSON");
		let invoked = Invoked { command, bearer, body };
		let (status, answer) = (self.answer)(&invoked);
		self.invoked.lock().expect("the invoked calls are writable").push(invoked);
		let answer = answer.to_string();
		let mut stream = stream;
		let written = write!(
			stream,
			"HTTP/1.1 {status} Answered\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answer}",
			answer.len()
		);
		written.expect("the answer writes");
	}
}

fn header(request: &Request, name: &str) -> String {
	request.headers().get(name).and_then(|value| value.to_str().ok()).unwrap_or("").to_owned()
}

fn remote(refused_invoke: Option<&'static str>, refused_socket: Option<&'static str>) -> Fake {
	Fake::start(
		Box::new(move |invoked| {
			if Some(invoked.bearer.as_str()) == refused_invoke {
				return (401, json!("refused"));
			}
			(200, json!([]))
		}),
		Box::new(move |bearer| refused_socket.is_some_and(|refused| bearer.starts_with(refused))),
	)
}

fn local_for(remote: &Fake, remote_space_id: Option<&str>) -> Fake {
	local_answering(remote, remote_space_id, JOINED_SPACE_REMOVE, 200)
}

fn local_answering(
	remote: &Fake,
	remote_space_id: Option<&str>,
	answered: &'static str,
	status: u16,
) -> Fake {
	let (host_url, remote_space_id) = (remote.url(), remote_space_id.map(str::to_owned));
	let tokens = AtomicUsize::new(0);
	Fake::start(
		Box::new(move |invoked| {
			if invoked.command == answered {
				return (status, Value::Null);
			}
			let token = format!("token-{}", tokens.fetch_add(1, Ordering::SeqCst) + 1);
			let connection = JoinedSpaceConnection {
				id: invoked.body["id"].as_str().unwrap_or("").to_owned(),
				host_url: host_url.clone(),
				token,
				remote_space_id: remote_space_id.clone(),
				name: "Team".to_owned(),
			};
			(200, serde_json::to_value(connection).expect("the connection serialises"))
		}),
		Box::new(|_| false),
	)
}

struct Joining {
	sources: JoinedSources,
	local: Source,
	heard: Receiver<JoinedEvent>,
}

fn joined_through(local: &Fake) -> Joining {
	let (hear, heard) = mpsc::channel();
	let sources = JoinedSources::default();
	sources.hear(move |event| {
		hear.send(event).expect("the test hears the joined events");
	});
	let local = Source::Running(Host::dev_on(local.port, "local-token"));
	sources.connect(&local, JOINED_ID).expect("the joined Space connects");
	Joining { sources, local, heard }
}

impl Joining {
	fn next_state(&self) -> ConnectionState {
		loop {
			let event = self.heard.recv_timeout(PATIENCE).expect("a joined event arrives");
			assert_eq!(event.space_id, JOINED_ID);
			if let JoinedHeard::ConnectionChanged(state) = event.heard {
				return state;
			}
		}
	}

	fn live_streams(&self) -> usize {
		Arc::strong_count(&self.sources.hearer) - 1
	}

	fn await_no_live_stream(&self) {
		let deadline = Instant::now() + PATIENCE;
		while self.live_streams() > 0 {
			assert!(Instant::now() < deadline, "the joined stream thread did not exit");
			thread::sleep(Duration::from_millis(20));
		}
	}
}

#[test]
fn a_joined_space_reads_and_hears_its_own_host_under_its_remote_space_id() {
	let remote = remote(None, None);
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);

	let source = joining.sources.source_of(&joining.local, JOINED_ID);
	let listed: Vec<Value> = source
		.invoke("conversation_list", json!({ "spaceId": JOINED_ID }))
		.expect("the joined host lists its conversations");

	assert!(listed.is_empty());
	let read = remote.invoked("conversation_list");
	assert_eq!(read.len(), 1);
	assert_eq!(read[0].body, json!({ "spaceId": REMOTE_SPACE_ID }));
	assert_eq!(read[0].bearer, "Bearer token-1");
	assert!(remote.port != local.port);
	assert!(local.invoked("conversation_list").is_empty());
	assert_eq!(source.running_profile(), None);
	assert_eq!(
		joining.sources.source_of(&joining.local, "another-space").running_profile(),
		Some(Profile::Dev)
	);

	assert_eq!(joining.next_state(), ConnectionState::Ready);
	remote.push(|| Push::Frame(SIGNED_OUT.to_owned()));
	let event = joining.heard.recv_timeout(PATIENCE).expect("the pushed event arrives");
	assert_eq!(event.space_id, JOINED_ID);
	assert!(matches!(
		event.heard,
		JoinedHeard::Host(HostEvent::AccountChanged(KiroshiAccountState::SignedOut))
	));
}

#[test]
fn a_dropped_joined_socket_shows_unavailable_then_ready_and_leaves_the_local_source_alone() {
	let remote = remote(None, None);
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);
	assert_eq!(joining.next_state(), ConnectionState::Ready);

	remote.push(|| Push::Drop);

	assert_eq!(joining.next_state(), ConnectionState::Unavailable);
	assert_eq!(joining.next_state(), ConnectionState::Ready);
	let local_read = joining.local.invoke::<Value>("space_list", json!({}));
	assert!(local_read.is_ok());
}

#[test]
fn a_refused_invoke_connects_the_space_again_and_retries_once_with_the_fresh_token() {
	let remote = remote(Some("Bearer token-1"), None);
	let local = local_for(&remote, None);
	let joining = joined_through(&local);

	let source = joining.sources.source_of(&joining.local, JOINED_ID);
	let listed = source.invoke::<Vec<Value>>("conversation_list", json!({ "spaceId": JOINED_ID }));

	assert!(listed.is_ok());
	assert_eq!(local.invoked(JOINED_SPACE_CONNECT).len(), 2);
	let bearers: Vec<String> =
		remote.invoked("conversation_list").into_iter().map(|call| call.bearer).collect();
	assert_eq!(bearers, ["Bearer token-1", "Bearer token-2"]);
	assert!(
		remote
			.invoked("conversation_list")
			.iter()
			.all(|call| call.body == json!({ "spaceId": JOINED_ID }))
	);
}

#[test]
fn a_refused_event_socket_connects_the_space_again_and_opens_with_the_fresh_token() {
	let remote = remote(None, Some("Bearer token-1"));
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);

	assert_eq!(joining.next_state(), ConnectionState::Ready);
	assert_eq!(local.invoked(JOINED_SPACE_CONNECT).len(), 2);
}

#[test]
fn connecting_a_space_again_replaces_its_source_and_stops_the_previous_stream() {
	let remote = remote(None, None);
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);
	assert_eq!(joining.next_state(), ConnectionState::Ready);

	joining.sources.connect(&joining.local, JOINED_ID).expect("the Space connects again");
	assert_eq!(joining.next_state(), ConnectionState::Ready);
	thread::sleep(Duration::from_secs(1));
	remote.push(|| Push::Frame(SIGNED_OUT.to_owned()));

	let event = joining.heard.recv_timeout(PATIENCE).expect("the pushed event arrives once");
	assert!(matches!(event.heard, JoinedHeard::Host(HostEvent::AccountChanged(_))));
	assert!(joining.heard.recv_timeout(Duration::from_secs(1)).is_err());
	let source = joining.sources.source_of(&joining.local, JOINED_ID);
	source.invoke::<Value>("conversation_list", json!({})).expect("the fresh source reads");
	let bearers: Vec<String> =
		remote.invoked("conversation_list").into_iter().map(|call| call.bearer).collect();
	assert_eq!(bearers, ["Bearer token-2"]);
}

#[test]
fn a_joined_host_maps_its_url_to_the_invoke_and_event_addresses() {
	let local = Source::Running(Host::detached());
	let joined = |host_url: &str| {
		Host::joined(
			&local,
			JoinedSpaceConnection {
				id: JOINED_ID.to_owned(),
				host_url: host_url.to_owned(),
				token: "token-1".to_owned(),
				remote_space_id: None,
				name: "Team".to_owned(),
			},
		)
	};

	let secure = joined("https://relay.example/member/instance/");
	let plain = joined("http://127.0.0.1:4321");

	assert_eq!(secure.events_url(), "wss://relay.example/member/instance/api/events");
	assert_eq!(plain.events_url(), "ws://127.0.0.1:4321/api/events");
	assert_eq!(secure.bearer(), "Bearer token-1");
}

#[test]
fn leaving_a_space_drops_its_source_and_ends_its_stream() {
	let remote = remote(None, None);
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);
	assert_eq!(joining.next_state(), ConnectionState::Ready);
	assert_eq!(joining.live_streams(), 1);

	joining.sources.leave(&joining.local, JOINED_ID).expect("the Space is left");

	joining.await_no_live_stream();
	assert_eq!(local.invoked(JOINED_SPACE_REMOVE).len(), 1);
	let source = joining.sources.source_of(&joining.local, JOINED_ID);
	assert_eq!(source.running_profile(), Some(Profile::Dev));
}

#[test]
fn a_refused_leave_keeps_the_joined_source_and_its_stream() {
	let remote = remote(None, None);
	let local = local_answering(&remote, Some(REMOTE_SPACE_ID), JOINED_SPACE_REMOVE, 500);
	let joining = joined_through(&local);
	assert_eq!(joining.next_state(), ConnectionState::Ready);

	let left = joining.sources.leave(&joining.local, JOINED_ID);

	assert!(matches!(left, Err(HostError::CommandFailed { status: 500, .. })));
	assert_eq!(joining.live_streams(), 1);
	let source = joining.sources.source_of(&joining.local, JOINED_ID);
	assert_eq!(source.running_profile(), None);
	remote.push(|| Push::Frame(SIGNED_OUT.to_owned()));
	let event = joining.heard.recv_timeout(PATIENCE).expect("the kept stream still hears");
	assert!(matches!(event.heard, JoinedHeard::Host(HostEvent::AccountChanged(_))));
}

#[test]
fn a_socket_refused_after_a_fresh_token_shows_unavailable_and_stops_connecting() {
	let remote = remote(None, Some("Bearer token-"));
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);

	assert_eq!(joining.next_state(), ConnectionState::Unavailable);
	joining.await_no_live_stream();
	assert_eq!(local.invoked(JOINED_SPACE_CONNECT).len(), 2);
}

#[test]
fn a_joined_host_error_says_this_space_and_never_its_id() {
	let failures = [
		HostError::JoinedOffline { space_id: JOINED_ID.to_owned() },
		HostError::JoinedRefused { space_id: JOINED_ID.to_owned() },
	];

	for failure in failures {
		let (title, detail) = (failure.title(), failure.detail());
		assert!(!title.contains(JOINED_ID) && !detail.contains(JOINED_ID), "{title} {detail}");
		assert!(title.contains("this Space") && detail.contains("this Space"), "{title} {detail}");
	}
}

fn assert_kept_on_this_computer(commands: &[&str]) {
	let remote = remote(None, None);
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);
	let source = joining.sources.source_of(&joining.local, JOINED_ID);

	for command in commands {
		let arguments = json!({ "spaceId": JOINED_ID, "path": "/picked/file.png" });
		source.invoke::<Value>(command, arguments.clone()).expect("the local host answers");

		let kept = local.invoked(command);
		assert_eq!(kept.len(), 1, "{command}");
		assert_eq!(kept[0].body, arguments, "{command}");
		assert_eq!(kept[0].bearer, "Bearer local-token", "{command}");
		assert!(remote.invoked(command).is_empty(), "{command}");
	}
}

#[test]
fn a_joined_space_imports_files_through_this_computer() {
	assert_kept_on_this_computer(&["library_import_paths"]);
}

#[test]
fn a_joined_space_saves_files_through_this_computer() {
	assert_kept_on_this_computer(&["library_save", "library_save_bytes"]);
}

#[test]
fn a_joined_space_copies_files_through_this_computer() {
	assert_kept_on_this_computer(&["library_copy", "library_copy_bytes"]);
}

#[test]
fn a_joined_space_reveals_files_through_this_computer() {
	assert_kept_on_this_computer(&["library_reveal"]);
}

#[test]
fn a_joined_space_sends_every_other_command_to_its_own_host() {
	let remote = remote(None, None);
	let local = local_for(&remote, Some(REMOTE_SPACE_ID));
	let joining = joined_through(&local);
	let source = joining.sources.source_of(&joining.local, JOINED_ID);

	source
		.invoke_turn::<Value>("conversation_send_turn", json!({ "spaceId": JOINED_ID }))
		.expect("the joined host answers the turn");

	let sent = remote.invoked("conversation_send_turn");
	assert_eq!(sent.len(), 1);
	assert_eq!(sent[0].body, json!({ "spaceId": REMOTE_SPACE_ID }));
	assert!(local.invoked("conversation_send_turn").is_empty());
}

#[test]
fn a_local_command_refused_on_this_computer_is_never_retried_on_the_joined_host() {
	let remote = remote(None, None);
	let local = local_answering(&remote, Some(REMOTE_SPACE_ID), "library_save", 401);
	let joining = joined_through(&local);
	let source = joining.sources.source_of(&joining.local, JOINED_ID);

	let refused = source.invoke_turn::<Value>("library_save", json!({ "path": "/picked" }));

	assert!(matches!(refused, Err(HostError::TokenRefused { profile: Profile::Dev })));
	assert_eq!(local.invoked("library_save").len(), 1);
	assert!(remote.invoked("library_save").is_empty());
	assert_eq!(local.invoked(JOINED_SPACE_CONNECT).len(), 1);
}
