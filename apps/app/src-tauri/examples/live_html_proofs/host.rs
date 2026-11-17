use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use kiroshi_app::live_html::watch::{Guard, ReceivedRequest, ViewWatch};

use crate::probe;
use crate::sensors::{locked, SeenRequest, ViewRecord};

#[derive(Clone, Serialize)]
pub struct SecretCall {
	pub webview: String,
	pub while_view_open: bool,
}

#[derive(Clone, Serialize)]
pub struct HandlerEvent {
	pub handler: &'static str,
	pub window: String,
	pub url: String,
	pub allowed: bool,
}

#[derive(Deserialize)]
pub struct Tick {
	pub instance: String,
	pub secret: String,
	pub snapshot: String,
}

#[derive(Clone, Default)]
pub struct Heartbeat {
	pub arrivals: Vec<Instant>,
	pub instances: Vec<MainDocument>,
	pub altered_snapshots: Vec<String>,
}

#[derive(Clone)]
pub struct MainDocument {
	pub instance: String,
	pub secret: String,
	pub first_snapshot: String,
}

#[derive(Clone, Copy)]
pub struct Gap {
	pub started: Instant,
	pub length: Duration,
}

impl Heartbeat {
	pub fn longest_gap(&self, from: Instant, to: Instant) -> Gap {
		let inside =
			self.arrivals.iter().copied().filter(|arrival| *arrival > from && *arrival < to);
		let mut previous = from;
		let mut longest = Gap { started: from, length: Duration::ZERO };
		for instant in inside.chain(std::iter::once(to)) {
			let length = instant.duration_since(previous);
			if length > longest.length {
				longest = Gap { started: previous, length };
			}
			previous = instant;
		}
		longest
	}
}

#[derive(Default)]
pub struct HostState {
	secret_calls: Mutex<Vec<SecretCall>>,
	is_view_open: AtomicBool,
	heartbeat: Mutex<Heartbeat>,
	handler_events: Mutex<Vec<HandlerEvent>>,
	view_requests: Mutex<HashMap<String, Vec<SeenRequest>>>,
}

impl HostState {
	pub fn count_secret_call(&self, webview: &str) -> usize {
		let mut calls = locked(&self.secret_calls);
		calls.push(SecretCall {
			webview: webview.to_owned(),
			while_view_open: self.is_view_open.load(Ordering::SeqCst),
		});
		calls.len()
	}

	pub fn secret_calls(&self) -> Vec<SecretCall> {
		locked(&self.secret_calls).clone()
	}

	pub fn mark_view_open(&self, is_open: bool) {
		self.is_view_open.store(is_open, Ordering::SeqCst);
	}

	pub fn record_tick(&self, tick: Tick) {
		let mut heartbeat = locked(&self.heartbeat);
		heartbeat.arrivals.push(Instant::now());
		let first_snapshot = heartbeat
			.instances
			.iter()
			.find(|document| document.instance == tick.instance)
			.map(|document| document.first_snapshot.clone());
		match first_snapshot {
			None => heartbeat.instances.push(MainDocument {
				instance: tick.instance,
				secret: tick.secret,
				first_snapshot: tick.snapshot,
			}),
			Some(first)
				if first != tick.snapshot
					&& !heartbeat.altered_snapshots.contains(&tick.snapshot) =>
			{
				heartbeat.altered_snapshots.push(tick.snapshot);
			}
			Some(_) => {}
		}
	}

	pub fn heartbeat(&self) -> Heartbeat {
		locked(&self.heartbeat).clone()
	}

	pub fn handler_events(&self) -> Vec<HandlerEvent> {
		locked(&self.handler_events).clone()
	}

	pub fn view_record(&self, view: &str, token: &str) -> ViewRecord {
		let requests = locked(&self.view_requests);
		ViewRecord::of(token, requests.get(view).map_or(&[][..], Vec::as_slice))
	}
}

impl ViewWatch for HostState {
	fn initialization_scripts(&self) -> Vec<String> {
		vec![probe::TRACER.to_owned(), probe::frame_responder()]
	}

	fn guard_answered(&self, view: &str, guard: Guard, url: &str, is_allowed: bool) {
		locked(&self.handler_events).push(HandlerEvent {
			handler: guard.handler(),
			window: view.to_owned(),
			url: url.to_owned(),
			allowed: is_allowed,
		});
	}

	fn request_received(&self, view: &str, request: &ReceivedRequest<'_>) {
		locked(&self.view_requests).entry(view.to_owned()).or_default().push(SeenRequest {
			at: Instant::now(),
			method: request.method.to_owned(),
			target: request.target.to_owned(),
			cookie: request.cookie.map(str::to_owned),
			body: request.body.to_owned(),
		});
	}
}
