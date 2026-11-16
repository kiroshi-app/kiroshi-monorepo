use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use crate::host::{HandlerEvent, Heartbeat, SecretCall};
use crate::sensors::{ViewRecord, ALLOWLIST_HOSTS};

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
const NAVIGATION_ATTEMPTS: [&str; 5] = [
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

pub struct TripwireReading {
	pub address: String,
	pub control_connections: usize,
	pub connections: Vec<String>,
}

impl TripwireReading {
	fn view_connections(&self) -> &[String] {
		self.connections.get(self.control_connections..).unwrap_or(&[])
	}

	fn is_silent(&self) -> bool {
		self.control_connections > 0 && self.view_connections().is_empty()
	}

	fn evidence(&self) -> Value {
		json!({
			"address": self.address,
			"control_connections_from_the_harness": self.control_connections,
			"connections_from_views": self.view_connections(),
		})
	}
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

pub struct Observations {
	pub secret_calls: Vec<SecretCall>,
	pub heartbeat: Heartbeat,
	pub baseline: (Instant, Instant),
	pub loopback_tripwire: TripwireReading,
	pub lan_tripwire: Result<TripwireReading, String>,
	pub navigation_sink: Vec<String>,
	pub handler_events: Vec<HandlerEvent>,
	pub window_urls: Vec<WindowUrl>,
	pub writer: ViewObservation,
	pub reader: Option<ViewObservation>,
}

impl Observations {
	pub fn proofs(&self) -> Vec<Proof> {
		vec![
			self.host_commands_unreachable(),
			self.main_window_untouched(),
			self.local_services_unreachable(),
			self.egress_follows_the_allowlist(),
			self.navigation_contained(),
			self.main_window_stays_responsive(),
			self.storage_not_shared_between_views(),
		]
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
		let lan = self
			.lan_tripwire
			.as_ref()
			.map(|tripwire| tripwire.connections.clone())
			.unwrap_or_default();
		from_views
			.chain(self.loopback_tripwire.connections.iter().cloned())
			.chain(lan)
			.chain(self.navigation_sink.iter().cloned())
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
			result: (from_views.is_empty() && !control.is_empty() && unobserved.is_empty()).into(),
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
				&& unobserved.is_empty())
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
			result: (self.are_tripwires_silent() && unobserved.is_empty()).into(),
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
		Proof {
			proof: 4,
			name: "Network egress follows the allowlist",
			result: (self.are_tripwires_silent()
				&& allowed_fetch == Some("ok")
				&& blocked_fetch.is_some_and(|outcome| outcome.starts_with("blocked")))
			.into(),
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
		Proof {
			proof: 5,
			name: "The view cannot navigate, open a window or download",
			result: (self.navigation_sink.is_empty()
				&& moved.is_empty()
				&& !self.window_urls.is_empty()
				&& unobserved.is_empty())
			.into(),
			attempts: NAVIGATION_ATTEMPTS.to_vec(),
			evidence: json!({
				"requests_received_by_the_navigation_sink": self.navigation_sink,
				"windows_whose_url_changed": moved,
				"windows_checked": self.window_urls.iter().map(|url| &url.window).collect::<Vec<_>>(),
				"handler_events": self.handler_events,
				"attempts_never_signalled": unobserved,
			}),
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
		Proof {
			proof: 6,
			name: "The main window stays responsive while the view spins",
			result: (baseline_gap <= HEARTBEAT_GAP_LIMIT
				&& busy_gap.is_some_and(|gap| gap <= HEARTBEAT_GAP_LIMIT))
			.into(),
			attempts: vec![BUSY_LOOP_ATTEMPT],
			evidence: json!({
				"heartbeat_gap_limit_ms": HEARTBEAT_GAP_LIMIT.as_millis(),
				"longest_heartbeat_gap_during_the_busy_loop_ms": busy_gap.map(|gap| gap.as_millis()),
				"busy_loop_observed_ms": busy_loop.map(|(started, finished)| finished.duration_since(started).as_millis()),
				"longest_heartbeat_gap_before_any_view_ms": baseline_gap.as_millis(),
				"heartbeats_received": self.heartbeat.arrivals.len(),
			}),
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
		Proof {
			proof: 7,
			name: "A second view reads nothing the first view stored",
			result: (leaked_reads.is_empty() && leaked_cookies.is_empty() && unobserved.is_empty())
				.into(),
			attempts,
			evidence: json!({
				"value_the_first_view_stored": first_view_value,
				"first_view_write_beacons": Self::outcomes(&self.writer.record, &STORAGE_WRITE_ATTEMPTS),
				"second_view_read_beacons": reads,
				"reads_returning_the_first_view_value": leaked_reads,
				"cookie_headers_received_from_the_second_view": reader.record.cookie_headers,
				"cookie_headers_carrying_the_first_view_value": leaked_cookies,
				"attempts_never_signalled": unobserved,
			}),
		}
	}
}
