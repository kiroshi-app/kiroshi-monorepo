use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use crate::host::{HandlerEvent, Heartbeat, SecretCall};
use crate::probe::{self, HostReading};
use crate::sensors::{TripwireReading, ViewRecord, ALLOWLIST_HOSTS};
use crate::windows::FIRST_VIEW_LABEL;

const HEARTBEAT_GAP_LIMIT: Duration = Duration::from_millis(500);
const BLOCKED_HOST: &str = "example.com";

const IPC_ATTEMPTS: [&str; 5] = [
	"ipc-tauri-global",
	"ipc-tauri-internals",
	"ipc-forged-postmessage",
	"ipc-forged-fetch-ipc-localhost",
	"ipc-forged-custom-protocol",
];
const PARENT_ATTEMPTS: [&str; 8] = [
	"parent-dom-read",
	"parent-dom-write",
	"top-dom-read",
	"top-dom-write",
	"parent-cookie-read",
	"parent-cookie-write",
	"parent-storage-read",
	"parent-storage-write",
];
const TRIPWIRE_ATTEMPTS: [&str; 8] = [
	"tripwire-loopback-fetch",
	"tripwire-loopback-img",
	"tripwire-loopback-websocket",
	"tripwire-loopback-form-post",
	"tripwire-lan-fetch",
	"tripwire-lan-img",
	"tripwire-lan-websocket",
	"tripwire-lan-form-post",
];
const ALLOWED_FETCH_ATTEMPT: &str = "allowlist-fetch-cdn-jsdelivr";
const BLOCKED_FETCH_ATTEMPT: &str = "allowlist-fetch-example-com";
pub const NAVIGATION_ATTEMPTS: [&str; 5] = [
	"navigation-window-open",
	"navigation-anchor-download",
	"navigation-top",
	"navigation-self",
	"navigation-meta-refresh",
];
const BUSY_LOOP_ATTEMPT: &str = "busy-loop";
const STORAGE_WRITE_ATTEMPTS: [&str; 4] = [
	"storage-write-localstorage",
	"storage-write-indexeddb",
	"storage-write-cookie",
	"storage-write-cache",
];
const STORAGE_READ_ATTEMPTS: [&str; 4] = [
	"storage-read-localstorage",
	"storage-read-indexeddb",
	"storage-read-cookie",
	"storage-read-cache",
];

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
	Green,
	Red,
}

impl From<bool> for Verdict {
	fn from(is_proven: bool) -> Self {
		if is_proven {
			Self::Green
		} else {
			Self::Red
		}
	}
}

#[derive(Serialize)]
pub struct Proof {
	proof: u8,
	name: &'static str,
	result: Verdict,
	attempts: Vec<&'static str>,
	evidence: Value,
}

pub struct WindowUrl {
	pub window: String,
	pub before_the_view: String,
	pub after_the_view: Result<String, String>,
}

pub struct ViewObservation {
	pub token: String,
	pub record: ViewRecord,
}

pub struct NavigationAlone {
	pub attempt: &'static str,
	pub window: String,
	pub open: (Instant, Instant),
}

#[derive(Serialize)]
struct NavigationAloneReading<'a> {
	attempt: &'static str,
	window: &'a str,
	sink_connections: usize,
	request_bytes_received: usize,
	handler_denied_it: bool,
	handler_answers: Vec<&'a HandlerEvent>,
}

pub struct HostReadings {
	pub first_view: HostReading,
	pub second_view: Option<HostReading>,
	pub first_view_open: (Instant, Instant),
	pub navigations_alone: Vec<NavigationAlone>,
}

pub struct Observations {
	pub secret_calls: Vec<SecretCall>,
	pub heartbeat: Heartbeat,
	pub baseline: (Instant, Instant),
	pub loopback_tripwire: TripwireReading,
	pub lan_tripwire: Result<TripwireReading, String>,
	pub navigation_sink: TripwireReading,
	pub handler_events: Vec<HandlerEvent>,
	pub window_urls: Vec<WindowUrl>,
	pub writer: ViewObservation,
	pub reader: Option<ViewObservation>,
	pub host_readings: Option<HostReadings>,
}

impl Observations {
	pub fn proofs(&self) -> Vec<Proof> {
		let mut proofs = vec![
			self.host_commands_unreachable(),
			self.main_window_untouched(),
			self.local_services_unreachable(),
			self.egress_follows_the_allowlist(),
			self.navigation_contained(),
			self.main_window_stays_responsive(),
			self.storage_not_shared_between_views(),
		];
		if self.host_readings.is_some() {
			let has_ended = self.has_first_view_reached_its_last_attempts();
			for proof in &mut proofs {
				proof.evidence["first_view_seen_by_the_handlers_reaching_its_last_attempts"] =
					json!(has_ended);
			}
		}
		proofs
	}

	fn has_first_view_reached_its_last_attempts(&self) -> bool {
		NAVIGATION_ATTEMPTS.iter().all(|attempt| {
			self.handler_events
				.iter()
				.any(|event| event.window == FIRST_VIEW_LABEL && event.url.ends_with(attempt))
		})
	}

	fn is_played(&self, never_signalled: &[&'static str]) -> bool {
		match self.host_readings {
			Some(_) => self.has_first_view_reached_its_last_attempts(),
			None => never_signalled.is_empty(),
		}
	}

	pub fn page_claims(&self) -> Value {
		let claims = |view: &ViewObservation| {
			view.record
				.beacons
				.iter()
				.map(|beacon| (beacon.attempt.clone(), beacon.outcome.clone()))
				.collect::<BTreeMap<_, _>>()
		};
		json!({
			"first_view": claims(&self.writer),
			"second_view": self.reader.as_ref().map(claims),
		})
	}

	fn unobserved(record: &ViewRecord, attempts: &[&'static str]) -> Vec<&'static str> {
		attempts.iter().copied().filter(|attempt| record.outcome(attempt).is_none()).collect()
	}

	fn outcomes<'a>(
		record: &'a ViewRecord,
		attempts: &[&'static str],
	) -> BTreeMap<&'static str, Option<&'a str>> {
		attempts.iter().map(|attempt| (*attempt, record.outcome(attempt))).collect()
	}

	fn received_requests(&self) -> Vec<String> {
		let views = std::iter::once(&self.writer).chain(self.reader.as_ref());
		let from_views = views.flat_map(|view| {
			let beacons = view
				.record
				.beacons
				.iter()
				.map(|beacon| format!("beacon {}/{}", beacon.attempt, beacon.outcome));
			beacons
				.chain(view.record.unrouted_requests.iter().cloned())
				.chain(view.record.cookie_headers.iter().cloned())
		});
		let listeners =
			[&self.loopback_tripwire, &self.navigation_sink].into_iter().chain(&self.lan_tripwire);
		from_views
			.chain(listeners.flat_map(|listener| {
				listener.view_connections().iter().map(|connection| connection.summary.clone())
			}))
			.collect()
	}

	fn are_tripwires_silent(&self) -> bool {
		self.loopback_tripwire.is_silent()
			&& self.lan_tripwire.as_ref().is_ok_and(TripwireReading::is_silent)
	}

	fn tripwire_evidence(&self) -> Value {
		json!({
			"loopback_tripwire": self.loopback_tripwire.evidence(),
			"lan_tripwire": match &self.lan_tripwire {
				Ok(tripwire) => tripwire.evidence(),
				Err(cause) => json!({ "unavailable": cause }),
			},
		})
	}

	fn host_commands_unreachable(&self) -> Proof {
		let (from_views, control): (Vec<_>, Vec<_>) =
			self.secret_calls.iter().partition(|call| call.while_view_open);
		let unobserved = Self::unobserved(&self.writer.record, &IPC_ATTEMPTS);
		Proof {
			proof: 1,
			name: "The view reaches no host command",
			result: (from_views.is_empty() && !control.is_empty() && self.is_played(&unobserved))
				.into(),
			attempts: IPC_ATTEMPTS.to_vec(),
			evidence: json!({
				"spike_secret_calls_counted": self.secret_calls.len(),
				"control_calls_before_a_view_opened": control,
				"calls_while_a_view_was_open": from_views,
				"attempts_never_signalled": unobserved,
			}),
		}
	}

	fn main_window_untouched(&self) -> Proof {
		let requests = self.received_requests();
		let leaked: Vec<&String> = requests
			.iter()
			.filter(|request| {
				self.heartbeat.instances.iter().any(|document| request.contains(&document.secret))
			})
			.collect();
		let unobserved = Self::unobserved(&self.writer.record, &PARENT_ATTEMPTS);
		let is_checked = !self.heartbeat.instances.is_empty();
		Proof {
			proof: 2,
			name: "The view neither reads nor alters the main window",
			result: (is_checked
				&& self.heartbeat.altered_snapshots.is_empty()
				&& leaked.is_empty()
				&& self.is_played(&unobserved))
			.into(),
			attempts: PARENT_ATTEMPTS.to_vec(),
			evidence: json!({
				"main_documents_checked": self.heartbeat.instances.len(),
				"integrity_snapshots_compared": self.heartbeat.arrivals.len(),
				"altered_snapshots": self.heartbeat.altered_snapshots,
				"requests_carrying_a_main_window_secret": leaked,
				"attempts_never_signalled": unobserved,
			}),
		}
	}

	fn local_services_unreachable(&self) -> Proof {
		let unobserved = Self::unobserved(&self.writer.record, &TRIPWIRE_ATTEMPTS);
		let mut evidence = self.tripwire_evidence();
		evidence["attempts_never_signalled"] = json!(unobserved);
		Proof {
			proof: 3,
			name: "The view reaches no local service",
			result: (self.are_tripwires_silent() && self.is_played(&unobserved)).into(),
			attempts: TRIPWIRE_ATTEMPTS.to_vec(),
			evidence,
		}
	}

	fn egress_follows_the_allowlist(&self) -> Proof {
		let record = &self.writer.record;
		let allowed_fetch = record.outcome(ALLOWED_FETCH_ATTEMPT);
		let blocked_fetch = record.outcome(BLOCKED_FETCH_ATTEMPT);
		let reports_about = |host: &str| {
			record
				.csp_reports
				.iter()
				.filter(|report| report.blocked_uri.contains(host))
				.cloned()
				.collect::<Vec<_>>()
		};
		let mut attempts = vec![ALLOWED_FETCH_ATTEMPT, BLOCKED_FETCH_ATTEMPT];
		attempts.extend(TRIPWIRE_ATTEMPTS);
		let mut evidence = self.tripwire_evidence();
		evidence["allowlisted_fetch_beacon"] = json!(allowed_fetch);
		evidence["other_host_fetch_beacon"] = json!(blocked_fetch);
		evidence["browser_csp_reports_about_allowlist_hosts"] =
			json!(ALLOWLIST_HOSTS.map(reports_about).concat());
		evidence["browser_csp_reports_about_the_other_host"] = json!(reports_about(BLOCKED_HOST));
		evidence["view_csp_reports_received"] = json!(record.csp_reports.len());
		let is_allowlist_followed = match &self.host_readings {
			Some(host) => {
				evidence["first_view_read_by_the_host"] = probe::evidence(&host.first_view);
				self.has_first_view_reached_its_last_attempts()
					&& host.first_view.as_ref().is_ok_and(|view| {
						view.allowlisted_fetch == "ok"
							&& view.other_host_fetch.starts_with("blocked")
					})
			}
			None => {
				allowed_fetch == Some("ok")
					&& blocked_fetch.is_some_and(|outcome| outcome.starts_with("blocked"))
			}
		};
		Proof {
			proof: 4,
			name: "Network egress follows the allowlist",
			result: (self.are_tripwires_silent() && is_allowlist_followed).into(),
			attempts,
			evidence,
		}
	}

	fn navigation_contained(&self) -> Proof {
		let moved: Vec<Value> = self
			.window_urls
			.iter()
			.filter(|url| url.after_the_view.as_ref() != Ok(&url.before_the_view))
			.map(|url| json!({ "window": url.window, "before": url.before_the_view, "after": url.after_the_view }))
			.collect();
		let unobserved = Self::unobserved(&self.writer.record, &NAVIGATION_ATTEMPTS);
		let mut evidence = json!({
			"navigation_sink": self.navigation_sink.evidence(),
			"windows_whose_url_changed": moved,
			"windows_checked": self.window_urls.iter().map(|url| &url.window).collect::<Vec<_>>(),
			"handler_events": self.handler_events,
			"attempts_never_signalled": unobserved,
		});
		if let Some(host) = &self.host_readings {
			let alone: Vec<_> =
				host.navigations_alone.iter().map(|view| self.navigation_alone(view)).collect();
			evidence["sink_connections_despite_a_denying_handler"] = alone
				.iter()
				.filter(|view| view.sink_connections > 0 && view.handler_denied_it)
				.map(|view| {
					json!({
						"attempt": view.attempt,
						"sink_connections": view.sink_connections,
						"any_request_bytes": view.request_bytes_received > 0,
					})
				})
				.collect();
			evidence["navigation_attempts_played_alone"] = json!(alone);
		}
		Proof {
			proof: 5,
			name: "The view cannot navigate, open a window or download",
			result: (self.navigation_sink.is_silent()
				&& moved.is_empty()
				&& !self.window_urls.is_empty()
				&& self.is_played(&unobserved))
			.into(),
			attempts: NAVIGATION_ATTEMPTS.to_vec(),
			evidence,
		}
	}

	fn navigation_alone<'a>(&'a self, view: &'a NavigationAlone) -> NavigationAloneReading<'a> {
		let connections: Vec<_> = self
			.navigation_sink
			.view_connections()
			.iter()
			.filter(|connection| {
				connection.accepted_at >= view.open.0 && connection.accepted_at <= view.open.1
			})
			.collect();
		let answers: Vec<_> = self
			.handler_events
			.iter()
			.filter(|event| event.window == view.window && event.url.ends_with(view.attempt))
			.collect();
		NavigationAloneReading {
			attempt: view.attempt,
			window: &view.window,
			sink_connections: connections.len(),
			request_bytes_received: connections
				.iter()
				.map(|connection| connection.bytes_received)
				.sum(),
			handler_denied_it: answers.iter().any(|event| !event.allowed),
			handler_answers: answers,
		}
	}

	fn main_window_stays_responsive(&self) -> Proof {
		let record = &self.writer.record;
		let busy_loop = record
			.beacon_at(BUSY_LOOP_ATTEMPT, "started")
			.zip(record.beacon_at(BUSY_LOOP_ATTEMPT, "finished"));
		let busy_gap =
			busy_loop.map(|(started, finished)| self.heartbeat.longest_gap(started, finished));
		let baseline_gap = self.heartbeat.longest_gap(self.baseline.0, self.baseline.1);
		let mut evidence = json!({
			"heartbeat_gap_limit_ms": HEARTBEAT_GAP_LIMIT.as_millis(),
			"longest_heartbeat_gap_during_the_busy_loop_ms": busy_gap.map(|gap| gap.as_millis()),
			"busy_loop_observed_ms": busy_loop.map(|(started, finished)| finished.duration_since(started).as_millis()),
			"longest_heartbeat_gap_before_any_view_ms": baseline_gap.as_millis(),
			"heartbeats_received": self.heartbeat.arrivals.len(),
		});
		let is_responsive = match &self.host_readings {
			Some(host) => {
				let (opened, settled) = host.first_view_open;
				let gap = self.heartbeat.longest_gap(opened, settled);
				evidence["first_view_open_ms"] = json!(settled.duration_since(opened).as_millis());
				evidence["longest_heartbeat_gap_while_the_first_view_was_open_ms"] =
					json!(gap.as_millis());
				gap <= HEARTBEAT_GAP_LIMIT && self.has_first_view_reached_its_last_attempts()
			}
			None => busy_gap.is_some_and(|gap| gap <= HEARTBEAT_GAP_LIMIT),
		};
		Proof {
			proof: 6,
			name: "The main window stays responsive while the view spins",
			result: (baseline_gap <= HEARTBEAT_GAP_LIMIT && is_responsive).into(),
			attempts: vec![BUSY_LOOP_ATTEMPT],
			evidence,
		}
	}

	fn storage_not_shared_between_views(&self) -> Proof {
		let first_view_value = &self.writer.token;
		let mut attempts = STORAGE_WRITE_ATTEMPTS.to_vec();
		attempts.extend(STORAGE_READ_ATTEMPTS);
		let Some(reader) = &self.reader else {
			return Proof {
				proof: 7,
				name: "A second view reads nothing the first view stored",
				result: Verdict::Red,
				attempts,
				evidence: json!({ "second_view": "never opened" }),
			};
		};
		let reads = Self::outcomes(&reader.record, &STORAGE_READ_ATTEMPTS);
		let leaked_reads: Vec<&str> = reads
			.iter()
			.filter(|(_, outcome)| {
				outcome.is_some_and(|value| value.contains(first_view_value.as_str()))
			})
			.map(|(attempt, _)| *attempt)
			.collect();
		let leaked_cookies: Vec<&String> = reader
			.record
			.cookie_headers
			.iter()
			.filter(|cookie| cookie.contains(first_view_value.as_str()))
			.collect();
		let mut unobserved = Self::unobserved(&self.writer.record, &STORAGE_WRITE_ATTEMPTS);
		unobserved.extend(Self::unobserved(&reader.record, &STORAGE_READ_ATTEMPTS));
		let mut evidence = json!({
			"value_the_first_view_stored": first_view_value,
			"first_view_write_beacons": Self::outcomes(&self.writer.record, &STORAGE_WRITE_ATTEMPTS),
			"second_view_read_beacons": reads,
			"reads_returning_the_first_view_value": leaked_reads,
			"cookie_headers_received_from_the_second_view": reader.record.cookie_headers,
			"cookie_headers_carrying_the_first_view_value": leaked_cookies,
			"attempts_never_signalled": unobserved,
		});
		let is_isolated = match &self.host_readings {
			Some(host) => {
				evidence["first_view_read_by_the_host"] = probe::evidence(&host.first_view);
				let stores = host.second_view.as_ref().and_then(|second| {
					evidence["second_view_read_by_the_host"] = probe::evidence(second);
					second.as_ref().ok().map(|view| view.stores_holding(first_view_value))
				});
				evidence["stores_where_the_host_found_the_first_view_value"] = json!(stores);
				stores.is_some_and(|stores| stores.is_empty())
					&& leaked_cookies.is_empty()
					&& self.has_first_view_reached_its_last_attempts()
			}
			None => leaked_reads.is_empty() && leaked_cookies.is_empty() && unobserved.is_empty(),
		};
		Proof {
			proof: 7,
			name: "A second view reads nothing the first view stored",
			result: is_isolated.into(),
			attempts,
			evidence,
		}
	}
}
