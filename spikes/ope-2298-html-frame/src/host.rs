use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::sensors::locked;

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

impl Heartbeat {
	pub fn longest_gap(&self, from: Instant, to: Instant) -> Duration {
		let inside =
			self.arrivals.iter().copied().filter(|arrival| *arrival > from && *arrival < to);
		let mut previous = from;
		let mut longest = Duration::ZERO;
		for instant in inside.chain(std::iter::once(to)) {
			longest = longest.max(instant.duration_since(previous));
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
	view: Mutex<ViewAddress>,
	main_window_csps: Mutex<Vec<String>>,
}

#[derive(Clone, Default)]
pub struct ViewAddress {
	pub origin: String,
	pub urls: Vec<String>,
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

	pub fn record_handler_event(&self, event: HandlerEvent) {
		locked(&self.handler_events).push(event);
	}

	pub fn handler_events(&self) -> Vec<HandlerEvent> {
		locked(&self.handler_events).clone()
	}

	pub fn point_at_view(&self, view: ViewAddress) {
		*locked(&self.view) = view;
	}

	pub fn view(&self) -> ViewAddress {
		locked(&self.view).clone()
	}

	pub fn record_main_window_csp(&self, csp: String) {
		locked(&self.main_window_csps).push(csp);
	}

	pub fn main_window_csps(&self) -> Vec<String> {
		locked(&self.main_window_csps).clone()
	}
}
