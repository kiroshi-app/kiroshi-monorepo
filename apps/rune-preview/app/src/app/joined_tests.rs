use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use kiroshi_core::conversations::contract::{
	TranscriptCompletion, TranscriptMessage, TranscriptPage, TranscriptRole,
};
use kiroshi_core::joined_spaces::contract::JoinedSpaceConnection;
use rune::Waker;
use serde_json::{Value, json};
use tungstenite::Message as Frame;

use super::{App, Inbound, Person, Ready, Workspace};
use crate::events::{HostEvent, JoinedHeard};
use crate::host::Host;
use crate::model;
use crate::source::{JoinedEvent, Source};
use crate::surfaces::s02_rail;
use crate::surfaces::s03_roster::{self, Heard, Load};

const LOCAL_SPACE: &str = "perso";

const REMOTE_SPACE_ID: &str = "remote-space";

const CHAT: &str = "remote-chat";

const PATIENCE: Duration = Duration::from_secs(10);

type Answer = Box<dyn Fn(&str, &Value) -> Option<Value> + Send + Sync>;

#[derive(Clone)]
struct FakeHost {
	port: u16,
	invoked: Arc<Mutex<Vec<(String, Value)>>>,
	sockets: Arc<Mutex<Vec<Sender<String>>>>,
}

impl FakeHost {
	fn start(answer: Answer) -> FakeHost {
		let listener = TcpListener::bind("127.0.0.1:0").expect("the fake host binds");
		let port = listener.local_addr().expect("the fake host has an address").port();
		let host = FakeHost { port, invoked: Arc::default(), sockets: Arc::default() };
		let (served, answer) = (host.clone(), Arc::new(answer));
		thread::spawn(move || {
			for stream in listener.incoming().flatten() {
				let (served, answer) = (served.clone(), Arc::clone(&answer));
				thread::spawn(move || served.serve(stream, &answer));
			}
		});
		host
	}

	fn url(&self) -> String {
		format!("http://127.0.0.1:{}", self.port)
	}

	fn invoked(&self, command: &str) -> Vec<Value> {
		let invoked = self.invoked.lock().expect("the invoked calls are readable");
		invoked
			.iter()
			.filter(|(called, _)| called == command)
			.map(|(_, body)| body.clone())
			.collect()
	}

	fn push(&self, frame: &Value) {
		let sockets = self.sockets.lock().expect("the sockets are readable");
		for socket in sockets.iter() {
			socket.send(frame.to_string()).expect("the socket takes the frame");
		}
	}

	fn has_socket(&self) -> bool {
		!self.sockets.lock().expect("the sockets are readable").is_empty()
	}

	fn serve(&self, stream: TcpStream, answer: &Answer) {
		let mut peeked = [0_u8; 32];
		let read = stream.peek(&mut peeked).expect("the fake host peeks a request");
		if peeked[..read].starts_with(b"GET /api/events") {
			self.stream_events(stream);
		} else {
			self.answer_invoke(stream, answer);
		}
	}

	fn stream_events(&self, stream: TcpStream) {
		let mut socket = tungstenite::accept(stream).expect("the event socket opens");
		let (pushed, pushes) = mpsc::channel::<String>();
		self.sockets.lock().expect("the sockets are writable").push(pushed);
		for frame in pushes {
			socket.send(Frame::text(frame)).expect("the frame is sent");
		}
	}

	fn answer_invoke(&self, stream: TcpStream, answer: &Answer) {
		let mut reader = BufReader::new(stream.try_clone().expect("the stream clones"));
		let mut line = String::new();
		reader.read_line(&mut line).expect("the request line reads");
		let command = line.split_whitespace().nth(1).unwrap_or("").replace("/api/invoke/", "");
		let mut length = 0;
		loop {
			let mut header = String::new();
			reader.read_line(&mut header).expect("a header reads");
			let header = header.trim_end();
			if header.is_empty() {
				break;
			}
			if let Some(value) = header.to_ascii_lowercase().strip_prefix("content-length: ") {
				length = value.parse().expect("the length is a number");
			}
		}
		let mut body = vec![0_u8; length];
		reader.read_exact(&mut body).expect("the body reads");
		let body: Value = serde_json::from_slice(&body).expect("the body is JSON");
		let (status, answered) = match answer(&command, &body) {
			Some(answered) => (200, answered),
			None => (404, json!(format!("{command} is not served here"))),
		};
		self.invoked.lock().expect("the invoked calls are writable").push((command, body));
		let answered = answered.to_string();
		let mut stream = stream;
		write!(
			stream,
			"HTTP/1.1 {status} Answered\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answered}",
			answered.len()
		)
		.expect("the answer writes");
	}
}

fn joined_space(joined_id: &str) -> Value {
	json!({
		"id": joined_id,
		"hostUrl": "https://relay.test/relay/member",
		"remoteSpaceId": REMOTE_SPACE_ID,
		"name": "Studio",
		"state": "online",
		"hostedBy": "Noa",
		"colour": null,
		"instanceId": "instance-studio",
	})
}

fn local_host(remote: &FakeHost, joined_id: &str) -> FakeHost {
	let (host_url, joined) = (remote.url(), joined_space(joined_id));
	FakeHost::start(Box::new(move |command, body| match command {
		"space_list" | "invitations_list" => Some(json!([])),
		"joined_spaces_list" => Some(json!([joined])),
		"joined_space_connect" => Some(json!(JoinedSpaceConnection {
			id: body["id"].as_str().unwrap_or_default().to_owned(),
			host_url: host_url.clone(),
			token: "remote-token".to_owned(),
			remote_space_id: Some(REMOTE_SPACE_ID.to_owned()),
			name: "Studio".to_owned(),
		})),
		_ => None,
	}))
}

fn row(id: &str) -> Value {
	json!({
		"id": id,
		"spaceId": REMOTE_SPACE_ID,
		"sectionId": null,
		"pinPosition": null,
		"title": id,
		"instructions": "",
		"icon": null,
		"color": null,
		"createdAt": 0,
		"updatedAt": 0,
		"participants": [],
		"lastActivityAt": 0,
		"lastWord": null,
		"soloBotId": null,
		"activeTurn": null,
		"state": "idle",
		"workingBotIds": [],
	})
}

fn transcript() -> Value {
	let said = TranscriptMessage {
		id: "remote-message".to_owned(),
		conversation_id: CHAT.to_owned(),
		turn_id: "remote-turn".to_owned(),
		seq: 1,
		role: TranscriptRole::User,
		content: "Hello from the host".to_owned(),
		completion: TranscriptCompletion::Complete,
		created_at: 0,
		author_bot_id: None,
		author_account_id: None,
		author_name: None,
		written_from: None,
		replied_to_message_id: None,
		replied_to_message_ids: Vec::new(),
		reply_links: Vec::new(),
		documents: Vec::new(),
		runtime_session_id: None,
		continues_turn_id: None,
		web_sources: Vec::new(),
	};
	json!(TranscriptPage {
		conversation_id: CHAT.to_owned(),
		messages: vec![said],
		arrivals: Vec::new(),
		has_more: false,
	})
}

fn remote_host() -> FakeHost {
	FakeHost::start(Box::new(|command, _| match command {
		"conversation_bots" | "section_list" | "conversation_pinned_messages" => Some(json!([])),
		"conversation_page" => {
			Some(json!({ "pinned": [], "conversations": [row(CHAT)], "nextCursor": null }))
		}
		"space_preferences" => Some(json!({ "collapsedSectionIds": [] })),
		"conversation_message_page" => Some(transcript()),
		"mission_list" => Some(json!({ "open": [], "done": [] })),
		_ => None,
	}))
}

struct Joined {
	app: App,
	local: FakeHost,
	remote: FakeHost,
	id: &'static str,
}

fn roster_holds(app: &App, conversation_id: &str) -> bool {
	match app.surfaces.s03_roster.shown() {
		Some(Load::Shown(listing)) => listing.line(conversation_id).is_some(),
		_ => false,
	}
}

fn idle() -> Waker {
	Arc::new(|| {})
}

fn unlogged_local(local: &FakeHost) -> Source {
	let reach = JoinedSpaceConnection {
		id: "local-fake".to_owned(),
		host_url: local.url(),
		token: "local-token".to_owned(),
		remote_space_id: None,
		name: "Local".to_owned(),
	};
	Source::Running(Host::joined(&Source::Running(Host::detached()), reach))
}

fn app_on(local: &FakeHost) -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: unlogged_local(local),
		space: model::Space {
			id: LOCAL_SPACE.to_owned(),
			name: "Personal".to_owned(),
			colour: None,
		},
		agents: Vec::new(),
		conversations: Vec::new(),
		person: Person::Unread,
		longest: None,
	});
	app.surfaces.s02_rail.attach(idle());
	app.surfaces.s03_roster.attach(idle());
	app.surfaces.s05_thread.attach(idle());
	app
}

fn joined(id: &'static str) -> Joined {
	let remote = remote_host();
	let local = local_host(&remote, id);
	let mut app = app_on(&local);
	s02_rail::connected(&mut app);
	let mut joined = Joined { app, local, remote, id };
	joined.settle(|app| app.surfaces.s02_rail.is_joined(id));
	joined
}

impl Joined {
	fn settle(&mut self, until: impl Fn(&App) -> bool) {
		let deadline = Instant::now() + PATIENCE;
		while !until(&self.app) {
			assert!(Instant::now() < deadline, "the joined Space did not settle");
			thread::sleep(Duration::from_millis(10));
			self.app.poll();
			s02_rail::poll(&mut self.app);
			s03_roster::poll(&mut self.app);
			self.app.surfaces.s05_thread.take_answers();
		}
	}

	fn open(&mut self) {
		s02_rail::select_space(&mut self.app, self.id);
		self.settle(|app| matches!(app.surfaces.s03_roster.shown(), Some(Load::Shown(_))));
	}

	fn read_locally(&self) -> Vec<Value> {
		let invoked = self.local.invoked.lock().expect("the invoked calls are readable");
		let names_joined =
			|body: &&Value| body["spaceId"] == self.id || body["conversationId"] == CHAT;
		invoked.iter().map(|(_, body)| body).filter(names_joined).cloned().collect()
	}
}

#[test]
fn opening_a_joined_space_shows_its_roster_read_through_its_own_host() {
	let mut joined = joined("studio-roster");

	s02_rail::select_space(&mut joined.app, joined.id);
	s03_roster::poll(&mut joined.app);
	assert!(matches!(joined.app.surfaces.s03_roster.shown(), None | Some(Load::Loading)));

	joined.settle(|app| matches!(app.surfaces.s03_roster.shown(), Some(Load::Shown(_))));
	joined.settle(|app| app.ready().is_some_and(|ready| !ready.conversations.is_empty()));
	let ready = joined.app.ready().expect("a ready workspace");
	assert_eq!(ready.space.id, joined.id);
	let conversations: Vec<&str> =
		ready.conversations.iter().map(|held| held.id.as_str()).collect();
	assert_eq!(conversations, [CHAT]);
	assert!(roster_holds(&joined.app, CHAT));
	let pages = joined.remote.invoked("conversation_page");
	assert!(pages.iter().all(|body| body["spaceId"] == REMOTE_SPACE_ID));
	assert!(joined.read_locally().is_empty());
}

#[test]
fn opening_a_conversation_of_a_joined_space_shows_its_thread_from_its_host() {
	let mut joined = joined("studio-thread");
	joined.open();

	joined.app.open(CHAT);
	joined.settle(|app| app.surfaces.s05_thread.holds("remote-message"));

	assert_eq!(joined.app.surfaces.s05_thread.conversation_id(), Some(CHAT));
	let pages = joined.remote.invoked("conversation_message_page");
	assert!(pages.iter().all(|body| body["conversationId"] == CHAT));
	assert!(joined.read_locally().is_empty());
}

#[test]
fn an_event_of_the_joined_space_on_screen_updates_its_roster_under_its_local_id() {
	let mut joined = joined("studio-events");
	joined.app.open_outbox(idle());
	joined.open();
	let remote = joined.remote.clone();
	joined.settle(|_| remote.has_socket());

	let elsewhere = JoinedEvent {
		space_id: "another-joined".to_owned(),
		heard: JoinedHeard::Host(HostEvent::Roster(stored("elsewhere-chat"))),
	};
	joined.app.received(Inbound::Joined(elsewhere));
	assert!(!roster_holds(&joined.app, "elsewhere-chat"));

	joined.remote.push(&json!({
		"event": "conversation://created",
		"payload": { "spaceId": REMOTE_SPACE_ID, "conversation": row("fresh-chat") },
	}));
	joined.settle(|app| roster_holds(app, "fresh-chat"));
}

fn stored(id: &str) -> Heard {
	let mut row = row(id);
	row["spaceId"] = json!("another-joined");
	Heard::Stored(Box::new(serde_json::from_value(row).expect("a conversation row")))
}
