use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use crate::host::{Gap, HandlerEvent, Heartbeat, SecretCall};
use crate::probe::{self, HostReading, HostTrace, ViewReading};
use kiroshi_app::live_html::server::ALLOWED_HOSTS as ALLOWLIST_HOSTS;

use crate::scenario::FIRST_VIEW_LABEL;
use crate::sensors::{Connection, CspReport, TripwireReading, ViewRecord};

const HEARTBEAT_GAP_LIMIT: Duration = Duration::from_millis(500);
const BLOCKED_HOST: &str = "example.com";
const SECOND_VIEW_NEVER_OPENED: &str = "the second view never opened, so the host read no view";

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
pub const LOOPBACK_TRIPWIRE_ATTEMPTS: [&str; 4] = [
	"tripwire-loopback-fetch",
	"tripwire-loopback-img",
	"tripwire-loopback-websocket",
	"tripwire-loopback-form-post",
];
pub const LAN_TRIPWIRE_ATTEMPTS: [&str; 4] =
	["tripwire-lan-fetch", "tripwire-lan-img", "tripwire-lan-websocket", "tripwire-lan-form-post"];
pub const LOOPBACK_TRIPWIRE_NAVIGATIONS: [&str; 4] = [
	"tripwire-loopback-navigation-window-open",
	"tripwire-loopback-navigation-top",
	"tripwire-loopback-navigation-self",
	"tripwire-loopback-navigation-meta-refresh",
];
pub const LAN_TRIPWIRE_NAVIGATIONS: [&str; 4] = [
	"tripwire-lan-navigation-window-open",
	"tripwire-lan-navigation-top",
	"tripwire-lan-navigation-self",
	"tripwire-lan-navigation-meta-refresh",
];
const ACCEPTING_PLATFORM: &str = "windows";
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

#[derive(PartialEq, Serialize)]
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

impl Proof {
	pub fn is_green(&self) -> bool {
		self.result == Verdict::Green
	}
}

fn signed_ms(reference: Instant, instant: Instant) -> i128 {
	if instant >= reference {
		instant.duration_since(reference).as_millis() as i128
	} else {
		-(reference.duration_since(instant).as_millis() as i128)
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
	pub reached: HostTrace,
}

pub struct AttemptAlone {
	pub attempt: &'static str,
	pub window: String,
	pub page_signal: Option<String>,
	pub open: (Instant, Instant),
	pub csp_reports: Vec<CspReport>,
}

impl AttemptAlone {
	fn was_open_at(&self, instant: Instant) -> bool {
		self.open.0 <= instant && instant <= self.open.1
	}

	fn connections<'a>(&self, listener: &'a TripwireReading) -> Vec<&'a Connection> {
		listener
			.view_connections()
			.iter()
			.filter(|connection| self.was_open_at(connection.accepted_at))
			.collect()
	}

	fn csp_reports_about(&self, listener: &TripwireReading) -> Vec<&CspReport> {
		self.csp_reports
			.iter()
			.filter(|report| report.blocked_uri.contains(&listener.address))
			.collect()
	}
}

#[derive(Serialize)]
struct TripwireAloneReading<'a> {
	attempt: &'static str,
	window: &'a str,
	page_signal: Option<&'a str>,
	tripwire_connections: usize,
	request_bytes_received: usize,
	browser_csp_reports_about_the_tripwire: Vec<&'a CspReport>,
}

#[derive(Serialize)]
struct BlockedNavigation<'a> {
	view: &'a str,
	denied_by_the_handlers: Vec<&'a HandlerEvent>,
	browser_csp_reports_about_the_sink: Vec<&'a CspReport>,
}

#[derive(Serialize)]
struct StrayReading<'a> {
	request: &'a str,
	request_bytes_received: usize,
	opened_by: Vec<&'static str>,
	blocked_navigation_it_followed: Option<BlockedNavigation<'a>>,
	accepted: bool,
}

fn is_stray_accepted(
	platform: &str,
	bytes_received: usize,
	follows_a_blocked_navigation: bool,
) -> bool {
	platform == ACCEPTING_PLATFORM && bytes_received == 0 && follows_a_blocked_navigation
}

#[derive(Serialize)]
struct NavigationAloneReading<'a> {
	attempt: &'static str,
	window: &'a str,
	sink_connections: usize,
	request_bytes_received: usize,
	handler_denied_it: bool,
	handler_answers: Vec<&'a HandlerEvent>,
	browser_csp_reports_about_the_sink: Vec<&'a CspReport>,
}

pub struct HostReadings {
	pub first_view: HostReading,
	pub second_view: Option<HostReading>,
}

pub struct Observations {
	pub platform: &'static str,
	pub secret_calls: Vec<SecretCall>,
	pub heartbeat: Heartbeat,
	pub baseline: (Instant, Instant),
	pub loopback_tripwire: TripwireReading,
	pub lan_tripwire: Result<TripwireReading, String>,
	pub navigation_sink: TripwireReading,
	pub handler_events: Vec<HandlerEvent>,
	pub window_urls: Vec<WindowUrl>,
	pub first_view_open: (Instant, Instant),
	pub writer: ViewObservation,
	pub reader: Option<ViewObservation>,
	pub host_readings: Option<HostReadings>,
	pub attempts_alone: Vec<AttemptAlone>,
}

fn loopback_attempts() -> Vec<&'static str> {
	[LOOPBACK_TRIPWIRE_ATTEMPTS, LOOPBACK_TRIPWIRE_NAVIGATIONS].concat()
}

fn lan_attempts() -> Vec<&'static str> {
	[LAN_TRIPWIRE_ATTEMPTS, LAN_TRIPWIRE_NAVIGATIONS].concat()
}

fn tripwire_attempts() -> Vec<&'static str> {
	[loopback_attempts(), lan_attempts()].concat()
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
			let (by_the_handlers, by_browser_csp_reports) = self.first_view_navigations_seen();
			for proof in &mut proofs {
				proof.evidence["navigation_attempts_of_the_first_view_seen_by_the_host"] = json!({
					"by_the_handlers": by_the_handlers,
					"by_browser_csp_reports": by_browser_csp_reports,
				});
			}
		}
		proofs
	}

	fn first_view_navigations_seen(&self) -> (usize, usize) {
		let sink = &self.navigation_sink.address;
		let by_the_handlers = self
			.handler_events
			.iter()
			.filter(|event| event.window == FIRST_VIEW_LABEL && event.url.contains(sink))
			.count();
		let by_browser_csp_reports = self
			.writer
			.record
			.csp_reports
			.iter()
			.filter(|report| report.blocked_uri.contains(sink))
			.count();
		(by_the_handlers, by_browser_csp_reports)
	}

	fn has_first_view_reached_its_navigation_attempts(&self) -> bool {
		self.first_view_navigations_seen() != (0, 0)
	}

	fn is_played(&self, never_signalled: &[&'static str]) -> bool {
		match self.host_readings {
			Some(_) => self.has_first_view_reached_its_navigation_attempts(),
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

	fn reach(view: &ViewObservation, never_signalled: &[&'static str]) -> Vec<Value> {
		never_signalled
			.iter()
			.map(|attempt| {
				let reached = match &view.reached {
					Ok(reached) => json!(reached.iter().any(|seen| seen == attempt)),
					Err(cause) => json!(format!("unreadable: {cause}")),
				};
				json!({ "attempt": attempt, "page_script_reached_it": reached })
			})
			.collect()
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

	fn opened_by(
		&self,
		listener: &TripwireReading,
		connection: &Connection,
		attempts: &[&'static str],
	) -> (Vec<&'static str>, &'static str) {
		let alone = || self.attempts_alone.iter().filter(|view| attempts.contains(&view.attempt));
		if let Some(view) = alone().find(|view| view.was_open_at(connection.accepted_at)) {
			return (vec![view.attempt], "the view that played this attempt alone");
		}
		if let Some(target) = &connection.target {
			let named = target.trim_start_matches('/');
			let suffix = format!("-{named}");
			let is_named = |attempt: &&str| *attempt == named || attempt.ends_with(&suffix);
			return (attempts.iter().copied().filter(is_named).collect(), "the request path");
		}
		let without_a_request = |view: &&AttemptAlone| {
			view.connections(listener).iter().any(|connection| connection.target.is_none())
		};
		(
			alone().filter(without_a_request).map(|view| view.attempt).collect(),
			"the attempts that opened a connection without a request when played alone",
		)
	}

	fn listener_evidence(&self, listener: &TripwireReading, attempts: &[&'static str]) -> Value {
		let connections: Vec<Value> = listener
			.view_connections()
			.iter()
			.map(|connection| {
				let (opened_by, attributed_from) = self.opened_by(listener, connection, attempts);
				json!({
					"request": connection.summary,
					"request_bytes_received": connection.bytes_received,
					"opened_by": opened_by,
					"attributed_from": attributed_from,
				})
			})
			.collect();
		json!({
			"address": listener.address,
			"control_connections_from_the_harness": listener.control_connections,
			"connections_from_views": connections,
		})
	}

	fn tripwire_attempts_alone(&self) -> Vec<TripwireAloneReading<'_>> {
		let tripwires = [
			(loopback_attempts(), Some(&self.loopback_tripwire)),
			(lan_attempts(), self.lan_tripwire.as_ref().ok()),
		];
		self.attempts_alone
			.iter()
			.filter_map(|view| {
				let (_, tripwire) =
					tripwires.iter().find(|(attempts, _)| attempts.contains(&view.attempt))?;
				let tripwire = (*tripwire)?;
				let connections = view.connections(tripwire);
				Some(TripwireAloneReading {
					attempt: view.attempt,
					window: &view.window,
					page_signal: view.page_signal.as_deref(),
					tripwire_connections: connections.len(),
					request_bytes_received: connections
						.iter()
						.map(|connection| connection.bytes_received)
						.sum(),
					browser_csp_reports_about_the_tripwire: view.csp_reports_about(tripwire),
				})
			})
			.collect()
	}

	fn tripwire_navigations_never_played(&self) -> Vec<&'static str> {
		let is_played = |attempt: &&str| {
			self.attempts_alone
				.iter()
				.any(|view| view.attempt == *attempt && view.page_signal.is_some())
		};
		let lan = self.lan_tripwire.is_ok().then_some(LAN_TRIPWIRE_NAVIGATIONS);
		LOOPBACK_TRIPWIRE_NAVIGATIONS
			.into_iter()
			.chain(lan.into_iter().flatten())
			.filter(|attempt| !is_played(attempt))
			.collect()
	}

	fn tripwire_evidence(&self) -> Value {
		let mut evidence = json!({
			"loopback_tripwire": self.listener_evidence(&self.loopback_tripwire, &loopback_attempts()),
			"lan_tripwire": match &self.lan_tripwire {
				Ok(tripwire) => self.listener_evidence(tripwire, &lan_attempts()),
				Err(cause) => json!({ "unavailable": cause }),
			},
		});
		let alone = self.tripwire_attempts_alone();
		if !alone.is_empty() {
			evidence["tripwire_attempts_played_alone"] = json!(alone);
		}
		evidence
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
				"never_signalled_attempts_read_by_the_host": Self::reach(&self.writer, &unobserved),
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
				"never_signalled_attempts_read_by_the_host": Self::reach(&self.writer, &unobserved),
			}),
		}
	}

	fn local_services_unreachable(&self) -> Proof {
		let unobserved = Self::unobserved(
			&self.writer.record,
			&[LOOPBACK_TRIPWIRE_ATTEMPTS, LAN_TRIPWIRE_ATTEMPTS].concat(),
		);
		let navigations_never_played = self.tripwire_navigations_never_played();
		let mut evidence = self.tripwire_evidence();
		evidence["navigation_attempts_never_played_alone"] = json!(navigations_never_played);
		evidence["attempts_never_signalled"] = json!(unobserved);
		evidence["never_signalled_attempts_read_by_the_host"] =
			json!(Self::reach(&self.writer, &unobserved));
		Proof {
			proof: 3,
			name: "The view reaches no local service",
			result: (self.are_tripwires_silent()
				&& self.is_played(&unobserved)
				&& navigations_never_played.is_empty())
			.into(),
			attempts: tripwire_attempts(),
			evidence,
		}
	}

	fn fetch_disagreements(
		view: &ViewReading,
		allowed_beacon: Option<&str>,
		blocked_beacon: Option<&str>,
	) -> Vec<Value> {
		[
			(
				ALLOWED_FETCH_ATTEMPT,
				&view.allowlisted_fetch,
				view.allowlisted_fetch_status,
				allowed_beacon,
			),
			(
				BLOCKED_FETCH_ATTEMPT,
				&view.other_host_fetch,
				view.other_host_fetch_status,
				blocked_beacon,
			),
		]
		.into_iter()
		.filter(|(_, host_read, _, page_beacon)| *page_beacon != Some(host_read.as_str()))
		.map(|(fetch, host_read, status, page_beacon)| {
			json!({
				"fetch": fetch,
				"host_read": host_read,
				"page_beacon": page_beacon,
				"host_read_document_url": view.document_url,
				"host_read_response_status": status,
			})
		})
		.collect()
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
		attempts.extend(tripwire_attempts());
		let mut evidence = self.tripwire_evidence();
		evidence["allowlisted_fetch_beacon"] = json!(allowed_fetch);
		evidence["other_host_fetch_beacon"] = json!(blocked_fetch);
		evidence["browser_csp_reports_about_allowlist_hosts"] =
			json!(ALLOWLIST_HOSTS.map(reports_about).concat());
		evidence["browser_csp_reports_about_the_other_host"] = json!(reports_about(BLOCKED_HOST));
		evidence["view_csp_reports_received"] = json!(record.csp_reports.len());
		let is_allowlist_followed = match &self.host_readings {
			Some(host) => {
				let reading = match &host.second_view {
					Some(reading) => reading.as_ref().map_err(String::as_str),
					None => Err(SECOND_VIEW_NEVER_OPENED),
				};
				match reading {
					Ok(view) => {
						evidence["second_view_read_by_the_host"] = json!(view);
						evidence["fetches_where_the_host_read_and_the_page_beacon_disagree"] =
							json!(Self::fetch_disagreements(view, allowed_fetch, blocked_fetch));
					}
					Err(fault) => evidence["sensor_fault"] = json!(fault),
				}
				self.has_first_view_reached_its_navigation_attempts()
					&& reading.is_ok_and(|view| {
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
		let strays = self.sink_strays();
		let mut evidence = json!({
			"navigation_sink": self.listener_evidence(&self.navigation_sink, &NAVIGATION_ATTEMPTS),
			"stray_connections_at_the_sink": strays,
			"windows_whose_url_changed": moved,
			"windows_checked": self.window_urls.iter().map(|url| &url.window).collect::<Vec<_>>(),
			"handler_events": self.handler_events,
			"attempts_never_signalled": unobserved,
			"never_signalled_attempts_read_by_the_host": Self::reach(&self.writer, &unobserved),
		});
		let alone: Vec<_> = self
			.attempts_alone
			.iter()
			.filter(|view| NAVIGATION_ATTEMPTS.contains(&view.attempt))
			.map(|view| self.navigation_alone(view))
			.collect();
		if !alone.is_empty() {
			evidence["attempts_whose_connection_reached_the_sink"] = alone
				.iter()
				.filter(|view| view.sink_connections > 0)
				.map(|view| {
					json!({
						"attempt": view.attempt,
						"sink_connections": view.sink_connections,
						"any_request_bytes": view.request_bytes_received > 0,
						"handler_denied_it": view.handler_denied_it,
					})
				})
				.collect();
			evidence["navigation_attempts_played_alone"] = json!(alone);
		}
		Proof {
			proof: 5,
			name: "The view cannot navigate, open a window or download",
			result: (self.navigation_sink.control_connections > 0
				&& strays.iter().all(|stray| stray.accepted)
				&& moved.is_empty()
				&& !self.window_urls.is_empty()
				&& self.is_played(&unobserved))
			.into(),
			attempts: NAVIGATION_ATTEMPTS.to_vec(),
			evidence,
		}
	}

	fn blocked_navigation_behind(&self, connection: &Connection) -> Option<BlockedNavigation<'_>> {
		let sink = &self.navigation_sink.address;
		let (opened, settled) = self.first_view_open;
		let (view, reports) =
			if opened <= connection.accepted_at && connection.accepted_at <= settled {
				(FIRST_VIEW_LABEL, &self.writer.record.csp_reports)
			} else {
				let alone = self.attempts_alone.iter().find(|view| {
					NAVIGATION_ATTEMPTS.contains(&view.attempt)
						&& view.was_open_at(connection.accepted_at)
				})?;
				(alone.window.as_str(), &alone.csp_reports)
			};
		let denied_by_the_handlers: Vec<_> = self
			.handler_events
			.iter()
			.filter(|event| event.window == view && !event.allowed && event.url.contains(sink))
			.collect();
		let browser_csp_reports_about_the_sink: Vec<_> =
			reports.iter().filter(|report| report.blocked_uri.contains(sink)).collect();
		(!denied_by_the_handlers.is_empty() || !browser_csp_reports_about_the_sink.is_empty())
			.then_some(BlockedNavigation {
				view,
				denied_by_the_handlers,
				browser_csp_reports_about_the_sink,
			})
	}

	fn sink_strays(&self) -> Vec<StrayReading<'_>> {
		self.navigation_sink
			.view_connections()
			.iter()
			.map(|connection| {
				let blocked_navigation = self.blocked_navigation_behind(connection);
				StrayReading {
					request: &connection.summary,
					request_bytes_received: connection.bytes_received,
					opened_by: self
						.opened_by(&self.navigation_sink, connection, &NAVIGATION_ATTEMPTS)
						.0,
					accepted: is_stray_accepted(
						self.platform,
						connection.bytes_received,
						blocked_navigation.is_some(),
					),
					blocked_navigation_it_followed: blocked_navigation,
				}
			})
			.collect()
	}

	fn navigation_alone<'a>(&'a self, view: &'a AttemptAlone) -> NavigationAloneReading<'a> {
		let connections = view.connections(&self.navigation_sink);
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
			browser_csp_reports_about_the_sink: view.csp_reports_about(&self.navigation_sink),
		}
	}

	fn main_window_stays_responsive(&self) -> Proof {
		let record = &self.writer.record;
		let (creation_began, settled) = self.first_view_open;
		let requested = record.first_document_request;
		let busy_started = record.beacon_at(BUSY_LOOP_ATTEMPT, "started");
		let busy_loop = busy_started.zip(record.beacon_at(BUSY_LOOP_ATTEMPT, "finished"));
		let busy_gap =
			busy_loop.map(|(started, finished)| self.heartbeat.longest_gap(started, finished));
		let build_gap =
			requested.map(|requested| self.heartbeat.longest_gap(creation_began, requested));
		let run_gap = requested.map(|requested| self.heartbeat.longest_gap(requested, settled));
		let baseline_gap = self.heartbeat.longest_gap(self.baseline.0, self.baseline.1).length;
		let is_within_the_limit =
			|gap: Option<Gap>| gap.is_some_and(|gap| gap.length <= HEARTBEAT_GAP_LIMIT);
		let gaps_above_the_limit: Vec<Value> = [
			("while the view window was built", build_gap),
			("while the hostile view ran", run_gap),
			("during the busy loop", busy_gap),
		]
		.into_iter()
		.filter_map(|(measured, gap)| {
			let gap = gap.filter(|gap| gap.length > HEARTBEAT_GAP_LIMIT)?;
			Some(json!({
				"measured": measured,
				"gap_ms": gap.length.as_millis(),
				"started_ms_after_the_view_window_creation_began": signed_ms(creation_began, gap.started),
				"started_ms_relative_to_the_busy_loop_start": busy_started.map(|busy| signed_ms(busy, gap.started)),
			}))
		})
		.collect();
		let length_ms = |gap: Option<Gap>| gap.map(|gap| gap.length.as_millis());
		let is_responsive = match self.host_readings {
			Some(_) => {
				is_within_the_limit(run_gap)
					&& self.has_first_view_reached_its_navigation_attempts()
			}
			None => is_within_the_limit(busy_gap),
		};
		Proof {
			proof: 6,
			name: "The main window stays responsive while the view spins",
			result: (baseline_gap <= HEARTBEAT_GAP_LIMIT && is_responsive).into(),
			attempts: vec![BUSY_LOOP_ATTEMPT],
			evidence: json!({
				"heartbeat_gap_limit_ms": HEARTBEAT_GAP_LIMIT.as_millis(),
				"longest_heartbeat_gap_during_the_busy_loop_ms": length_ms(busy_gap),
				"busy_loop_observed_ms": busy_loop.map(|(started, finished)| finished.duration_since(started).as_millis()),
				"longest_heartbeat_gap_before_any_view_ms": baseline_gap.as_millis(),
				"heartbeats_received": self.heartbeat.arrivals.len(),
				"view_window_build_ms": requested.map(|requested| requested.duration_since(creation_began).as_millis()),
				"longest_heartbeat_gap_while_the_view_window_was_built_ms": length_ms(build_gap),
				"hostile_view_ran_ms": requested.map(|requested| settled.duration_since(requested).as_millis()),
				"longest_heartbeat_gap_while_the_hostile_view_ran_ms": length_ms(run_gap),
				"gaps_above_the_limit": gaps_above_the_limit,
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
		let never_written = Self::unobserved(&self.writer.record, &STORAGE_WRITE_ATTEMPTS);
		let never_read = Self::unobserved(&reader.record, &STORAGE_READ_ATTEMPTS);
		let reach =
			[Self::reach(&self.writer, &never_written), Self::reach(reader, &never_read)].concat();
		let unobserved = [never_written, never_read].concat();
		let mut evidence = json!({
			"value_the_first_view_stored": first_view_value,
			"first_view_write_beacons": Self::outcomes(&self.writer.record, &STORAGE_WRITE_ATTEMPTS),
			"second_view_read_beacons": reads,
			"reads_returning_the_first_view_value": leaked_reads,
			"cookie_headers_received_from_the_second_view": reader.record.cookie_headers,
			"cookie_headers_carrying_the_first_view_value": leaked_cookies,
			"attempts_never_signalled": unobserved,
			"never_signalled_attempts_read_by_the_host": reach,
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
					&& self.has_first_view_reached_its_navigation_attempts()
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
