use std::cell::Cell;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread;
use std::time::Duration;

use kiroshi_core::agent::contract::{
	AgentEvent as CoreAgentEvent, ConnectionState, RuntimeScope, ScopedEvent as CoreScopedEvent,
};
use serde_json::Value;
use tungstenite::client::IntoClientRequest;
use tungstenite::handshake::HandshakeError;
use tungstenite::handshake::client::Request;
use tungstenite::http::HeaderValue;
use tungstenite::http::header::AUTHORIZATION;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message as Frame, WebSocket};

use crate::host::{Host, Joined};
use crate::model::{KiroshiAccountState, Message, MissionChanged, ScopedEvent};
use crate::surfaces::s10_agent_settings::{self, Heard};
use crate::surfaces::{s02_rail, s03_roster, s04_boot, s07_approvals, s14_library};

const ACCOUNT_CHANGED: &str = "account://changed";

const AGENT_EVENT: &str = "agent://event";

const CONNECTION_CHANGED: &str = "connectionChanged";

const MESSAGE_STORED: &str = "conversation://message-stored";

const MISSION_CHANGED: &str = "mission://changed";

const LIBRARY: &str = "library://";

const DEVICE: &str = "device://";

const CONNECT_PATIENCE: Duration = Duration::from_secs(10);

const READ_POLL: Duration = Duration::from_millis(200);

const FIRST_RECONNECT_DELAY: Duration = Duration::from_millis(500);

const LONGEST_RECONNECT_DELAY: Duration = Duration::from_secs(30);

pub enum HostEvent {
	Listening,
	AccountChanged(KiroshiAccountState),
	Agent(ScopedEvent),
	Connection {
		scope: RuntimeScope,
		state: ConnectionState,
		closing: Option<Box<s07_approvals::Heard>>,
	},
	MessageStored(Message),
	MissionChanged(MissionChanged),
	Companion(Heard),
	Roster(s03_roster::Heard),
	Library(s14_library::Heard),
	Approvals(s07_approvals::Heard),
	Device(s04_boot::Heard),
	Spaces(s02_rail::Heard),
	Lagged,
	Unreadable {
		event: String,
		cause: String,
	},
	Lost(String),
}

pub fn of_joined_space(event: HostEvent, remote_id: &str, joined_id: &str) -> Option<HostEvent> {
	match event {
		HostEvent::AccountChanged(_) | HostEvent::Device(_) | HostEvent::Spaces(_) => None,
		HostEvent::Roster(heard) => Some(HostEvent::Roster(heard.in_space(remote_id, joined_id))),
		HostEvent::Library(heard) => Some(HostEvent::Library(heard.in_space(remote_id, joined_id))),
		heard => Some(heard),
	}
}

pub enum JoinedHeard {
	Host(HostEvent),
	ConnectionChanged(ConnectionState),
}

enum Closed {
	Stopped,
	Refused,
	Lost(String),
}

type Socket = WebSocket<MaybeTlsStream<TcpStream>>;

struct Stop(Receiver<()>);

impl Stop {
	fn is_stopped(&self) -> bool {
		matches!(self.0.try_recv(), Err(TryRecvError::Disconnected))
	}

	fn is_stopped_within(&self, delay: Duration) -> bool {
		matches!(self.0.recv_timeout(delay), Err(RecvTimeoutError::Disconnected))
	}
}

pub fn listen(host: &Host, deliver: impl Fn(HostEvent) + Send + 'static) {
	let url = host.events_url();
	let bearer = host.bearer();
	let spawned = thread::Builder::new().name("host-events".into()).spawn(move || {
		let (_held, stop) = mpsc::channel();
		let lost = match relayed(&url, &bearer, &Stop(stop), &deliver) {
			Closed::Refused => "the host refused the token".to_owned(),
			Closed::Lost(reason) => reason,
			Closed::Stopped => "the event listener stopped".to_owned(),
		};
		deliver(HostEvent::Lost(lost));
	});
	if let Err(failure) = spawned {
		eprintln!("the host event listener did not start: {failure}");
	}
}

pub fn listen_joined(
	joined: &Joined,
	deliver: impl Fn(JoinedHeard) + Send + 'static,
) -> Option<Sender<()>> {
	let (held, stop) = mpsc::channel();
	let joined = joined.clone();
	let spawned = thread::Builder::new()
		.name("joined-space-events".into())
		.spawn(move || streamed(&joined, &Stop(stop), &deliver));
	match spawned {
		Ok(_) => Some(held),
		Err(failure) => {
			eprintln!("the joined Space event listener did not start: {failure}");
			None
		}
	}
}

fn streamed(joined: &Joined, stop: &Stop, deliver: &impl Fn(JoinedHeard)) {
	let shown = Cell::new(None);
	let show = |state| {
		if shown.replace(Some(state)) != Some(state) {
			deliver(JoinedHeard::ConnectionChanged(state));
		}
	};
	let mut failures = 0;
	loop {
		let opened = Cell::new(false);
		let relay = |event| match event {
			HostEvent::Listening => {
				opened.set(true);
				show(ConnectionState::Ready);
			}
			other => deliver(JoinedHeard::Host(other)),
		};
		let closed = attempted(joined, stop, &relay);
		if stop.is_stopped() {
			return;
		}
		let reason = match closed {
			Closed::Stopped => return,
			Closed::Refused => {
				eprintln!("the host of joined Space {} refused a fresh token", joined.id());
				return show(ConnectionState::Unavailable);
			}
			Closed::Lost(reason) => reason,
		};
		if opened.get() {
			failures = 0;
		}
		if shown.get() != Some(ConnectionState::Unavailable) {
			eprintln!("the events of joined Space {} dropped: {reason}", joined.id());
		}
		show(ConnectionState::Unavailable);
		if stop.is_stopped_within(reconnect_delay(failures)) {
			return;
		}
		failures = failures.saturating_add(1);
	}
}

fn reconnect_delay(failures: u32) -> Duration {
	FIRST_RECONNECT_DELAY
		.saturating_mul(2_u32.saturating_pow(failures))
		.min(LONGEST_RECONNECT_DELAY)
}

fn attempted(joined: &Joined, stop: &Stop, relay: &impl Fn(HostEvent)) -> Closed {
	let host = joined.host();
	match relayed(&host.events_url(), &host.bearer(), stop, relay) {
		Closed::Refused => match joined.refresh() {
			Ok(()) => relayed(&host.events_url(), &host.bearer(), stop, relay),
			Err(failure) => Closed::Lost(failure.detail()),
		},
		closed => closed,
	}
}

fn relayed(url: &str, bearer: &str, stop: &Stop, deliver: &impl Fn(HostEvent)) -> Closed {
	let mut socket = match opened(url, bearer) {
		Ok(socket) => socket,
		Err(closed) => return closed,
	};
	deliver(HostEvent::Listening);
	loop {
		let read = socket.read();
		if stop.is_stopped() {
			return Closed::Stopped;
		}
		match read {
			Ok(Frame::Text(text)) => {
				if let Some(event) = parsed(text.as_str()) {
					deliver(event);
				}
			}
			Ok(Frame::Close(frame)) => {
				return Closed::Lost(frame.map_or_else(
					|| "the host closed the event socket".to_owned(),
					|frame| frame.reason.to_string(),
				));
			}
			Ok(_) => {}
			Err(tungstenite::Error::Io(failure))
				if matches!(
					failure.kind(),
					std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
				) => {}
			Err(failure) => return Closed::Lost(format!("the event socket failed: {failure}")),
		}
	}
}

fn opened(url: &str, bearer: &str) -> Result<Socket, Closed> {
	let mut request = url
		.into_client_request()
		.map_err(|failure| Closed::Lost(format!("the event address was refused: {failure}")))?;
	let authorization = HeaderValue::from_str(bearer)
		.map_err(|failure| Closed::Lost(format!("the token is not a header value: {failure}")))?;
	request.headers_mut().insert(AUTHORIZATION, authorization);
	let did_not_open = |failure: &dyn std::fmt::Display| {
		Closed::Lost(format!("the event socket did not open: {failure}"))
	};
	let stream = connected(&request).map_err(|failure| did_not_open(&failure))?;
	let polled = stream.try_clone().map_err(|failure| did_not_open(&failure))?;
	let socket = match tungstenite::client_tls_with_config(request, stream, None, None) {
		Ok((socket, _)) => socket,
		Err(HandshakeError::Failure(tungstenite::Error::Http(response)))
			if response.status() == 401 =>
		{
			return Err(Closed::Refused);
		}
		Err(failure) => return Err(did_not_open(&failure)),
	};
	polled
		.set_read_timeout(Some(READ_POLL))
		.map_err(|failure| Closed::Lost(format!("the event socket did not poll: {failure}")))?;
	Ok(socket)
}

fn connected(request: &Request) -> std::io::Result<TcpStream> {
	let uri = request.uri();
	let unaddressed = || std::io::Error::new(std::io::ErrorKind::InvalidInput, "no host address");
	let host = uri.host().ok_or_else(unaddressed)?;
	let port = uri.port_u16().unwrap_or(if uri.scheme_str() == Some("wss") { 443 } else { 80 });
	let address = (host, port).to_socket_addrs()?.next().ok_or_else(unaddressed)?;
	let stream = TcpStream::connect_timeout(&address, CONNECT_PATIENCE)?;
	stream.set_read_timeout(Some(CONNECT_PATIENCE))?;
	stream.set_write_timeout(Some(CONNECT_PATIENCE))?;
	Ok(stream)
}

pub fn parsed(text: &str) -> Option<HostEvent> {
	let frame: Value = match serde_json::from_str(text) {
		Ok(frame) => frame,
		Err(failure) => return Some(unreadable("frame", failure)),
	};
	let event = frame.get("event")?.as_str()?;
	let payload = frame.get("payload")?.clone();
	named(event, payload)
}

fn named(event: &str, payload: Value) -> Option<HostEvent> {
	match event {
		ACCOUNT_CHANGED => Some(
			serde_json::from_value(payload)
				.map_or_else(|failure| unreadable(event, failure), HostEvent::AccountChanged),
		),
		AGENT_EVENT if is_connection_change(&payload) => connection_heard(event, payload),
		AGENT_EVENT => Some(match s07_approvals::heard_of(&payload) {
			Some(heard) => {
				heard.map_or_else(|failure| unreadable(event, failure), HostEvent::Approvals)
			}
			None => serde_json::from_value(payload)
				.map_or_else(|failure| unreadable(event, failure), HostEvent::Agent),
		}),
		MESSAGE_STORED => Some(
			serde_json::from_value(payload)
				.map_or_else(|failure| unreadable(event, failure), HostEvent::MessageStored),
		),
		MISSION_CHANGED => Some(
			serde_json::from_value(payload)
				.map_or_else(|failure| unreadable(event, failure), HostEvent::MissionChanged),
		),
		_ if event.starts_with(LIBRARY) => s14_library::heard_of(event, payload).map(|heard| {
			heard.map_or_else(|failure| unreadable(event, failure), HostEvent::Library)
		}),
		_ if event.starts_with(DEVICE) => s04_boot::heard_of(event, payload).map(|heard| {
			heard.map_or_else(|failure| unreadable(event, failure), HostEvent::Device)
		}),
		_ => match s03_roster::heard_of(event, &payload) {
			Some(heard) => roster_heard(event, heard),
			None => spaces_heard(event, &payload).or_else(|| companion_heard(event, payload)),
		},
	}
}

fn is_connection_change(payload: &Value) -> bool {
	payload.pointer("/event/type").and_then(Value::as_str) == Some(CONNECTION_CHANGED)
}

fn connection_heard(event: &str, payload: Value) -> Option<HostEvent> {
	let closing = match s07_approvals::heard_of(&payload).transpose() {
		Ok(closing) => closing.map(Box::new),
		Err(failure) => return Some(unreadable(event, failure)),
	};
	match serde_json::from_value::<CoreScopedEvent>(payload) {
		Ok(CoreScopedEvent {
			scope: Some(scope),
			event: CoreAgentEvent::ConnectionChanged { state },
			..
		}) => Some(HostEvent::Connection { scope, state, closing }),
		Ok(_) => None,
		Err(failure) => Some(unreadable(event, failure)),
	}
}

fn spaces_heard(event: &str, payload: &Value) -> Option<HostEvent> {
	s02_rail::heard_of(event, payload)
		.map(|heard| heard.map_or_else(|failure| unreadable(event, failure), HostEvent::Spaces))
}

fn companion_heard(event: &str, payload: Value) -> Option<HostEvent> {
	s10_agent_settings::heard_of(event, payload)
		.map(|heard| heard.map_or_else(|failure| unreadable(event, failure), HostEvent::Companion))
}

fn roster_heard(
	event: &str,
	heard: Result<s03_roster::Heard, serde_json::Error>,
) -> Option<HostEvent> {
	match heard {
		Ok(heard) => Some(HostEvent::Roster(heard)),
		Err(failure) => {
			eprintln!("a {event} event did not reach the roster: {failure}");
			None
		}
	}
}

fn unreadable(event: &str, failure: serde_json::Error) -> HostEvent {
	HostEvent::Unreadable { event: event.to_owned(), cause: failure.to_string() }
}
