use std::thread;

use serde_json::Value;
use tungstenite::Message as Frame;
use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::http::header::AUTHORIZATION;

use crate::host::Host;
use crate::model::{KiroshiAccountState, Message, MissionChanged, ScopedEvent};
use crate::surfaces::s10_agent_settings::{self, Heard};
use crate::surfaces::{s03_roster, s14_library};

const ACCOUNT_CHANGED: &str = "account://changed";

const AGENT_EVENT: &str = "agent://event";

const MESSAGE_STORED: &str = "conversation://message-stored";

const MISSION_CHANGED: &str = "mission://changed";

const LIBRARY: &str = "library://";

pub enum HostEvent {
	Listening,
	AccountChanged(KiroshiAccountState),
	Agent(ScopedEvent),
	MessageStored(Message),
	MissionChanged(MissionChanged),
	Companion(Heard),
	Roster(s03_roster::Heard),
	Library(s14_library::Heard),
	Lagged,
	Unreadable { event: String, cause: String },
	Lost(String),
}

pub fn listen(host: &Host, deliver: impl Fn(HostEvent) + Send + 'static) {
	let url = host.events_url();
	let bearer = host.bearer();
	let spawned = thread::Builder::new().name("host-events".into()).spawn(move || {
		let lost = relayed(&url, &bearer, &deliver);
		deliver(HostEvent::Lost(lost));
	});
	if let Err(failure) = spawned {
		eprintln!("the host event listener did not start: {failure}");
	}
}

fn relayed(url: &str, bearer: &str, deliver: &impl Fn(HostEvent)) -> String {
	let mut request = match url.into_client_request() {
		Ok(request) => request,
		Err(failure) => return format!("the event address was refused: {failure}"),
	};
	let authorization = match HeaderValue::from_str(bearer) {
		Ok(value) => value,
		Err(failure) => return format!("the token is not a header value: {failure}"),
	};
	request.headers_mut().insert(AUTHORIZATION, authorization);
	let mut socket = match tungstenite::connect(request) {
		Ok((socket, _)) => socket,
		Err(failure) => return format!("the event socket did not open: {failure}"),
	};
	deliver(HostEvent::Listening);
	loop {
		match socket.read() {
			Ok(Frame::Text(text)) => {
				if let Some(event) = parsed(text.as_str()) {
					deliver(event);
				}
			}
			Ok(Frame::Close(frame)) => {
				return frame.map_or_else(
					|| "the host closed the event socket".to_owned(),
					|frame| frame.reason.to_string(),
				);
			}
			Ok(_) => {}
			Err(failure) => return format!("the event socket failed: {failure}"),
		}
	}
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
		AGENT_EVENT => Some(
			serde_json::from_value(payload)
				.map_or_else(|failure| unreadable(event, failure), HostEvent::Agent),
		),
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
		_ => match s03_roster::heard_of(event, &payload) {
			Some(heard) => roster_heard(event, heard),
			None => s10_agent_settings::heard_of(event, payload).map(|heard| {
				heard.map_or_else(|failure| unreadable(event, failure), HostEvent::Companion)
			}),
		},
	}
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
