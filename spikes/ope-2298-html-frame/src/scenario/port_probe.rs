use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use serde::Serialize;
use serde_json::json;

use super::{point_at, wait_until, Failure, Run, MAIN_WINDOW_TIMEOUT, NO_PLACEHOLDER, RUN_SIGNAL};
use crate::port_reading::{Played, Repetition, Summary, Verdict};
use crate::port_target::{closed_port, connect_reading, ConnectReading, ListeningPort};
use crate::sensors::{non_loopback_ipv4, ViewServer};

const TICKET: &str = "OPE-2354";
const PROBE_PREFIX: &str = "probe-";
const REPETITIONS: usize = 10;
const ATTEMPTS: [&str; 2] = ["navigation-self", "navigation-meta-refresh"];
const LOOPBACK: &str = "loopback";
const LAN: &str = "lan";
const LISTENING: &str = "listening";
const CLOSED: &str = "closed";
const PROBE_TIMEOUT: Duration = Duration::from_secs(6);
const REPORT_TIMEOUT: Duration = Duration::from_millis(2500);
const DECISIONS: [&str; 8] = [
	"a case is one target and one attempt: its listening port and its closed port are opened once and kept for its 10 repetitions, and the closed port is proven by a connect from the harness before the first and after the last repetition",
	"the listening and the closed target of one address kind are played in turn, repetition by repetition, the first of the two alternating, so both meet the same machine conditions",
	"the page waits for its own load event and 250 ms more before the attempt, so its loading is not read as an effect of the attempt",
	"the page sends one beacon per event and per performance entry when it happens, as hex-encoded JSON on the existing beacon route, so what fires before a document is replaced still gets out; the performance entries about those beacons are left out",
	"a repetition is silent when the view server received no beacon at all within the probe timeout of 6 s; a page that signalled its attempt and nothing after is not silent: its sequence is empty and its script did not run after 1000 ms",
	"a sequence lists the events on window and document, the performance entries and an exception thrown by the attempt, in the order the page saw them",
	"distinguishable is true when no sequence seen on the listening target was seen on the closed one, or when a timing the page measured in every repetition of both has ranges that do not overlap; the signal names the event sequence or the first such timing; the script still running after 1000 ms and what the service saw are recorded and not read by the rule",
	"the service answers nothing: it counts what arrives and closes the connections still open when the repetition ends, before the view is closed; accept and close are read by a 1 ms poll",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeTargets {
	role: String,
	navigation_sink: String,
}

#[derive(Serialize)]
struct ClosedPortProof {
	connect_before_the_case: ConnectReading,
	connect_after_the_case: ConnectReading,
}

#[derive(Serialize)]
struct Case {
	attempt: &'static str,
	address: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	closed_port_proof: Option<ClosedPortProof>,
	summary: Summary,
	repetitions: Vec<Repetition>,
}

impl Case {
	fn of(
		attempt: &'static str,
		address: SocketAddr,
		closed_port_proof: Option<ClosedPortProof>,
		repetitions: Vec<Repetition>,
	) -> Self {
		Self {
			attempt,
			address: address.to_string(),
			closed_port_proof,
			summary: Summary::of(&repetitions),
			repetitions,
		}
	}
}

struct Pair {
	listening: Case,
	closed: Case,
	verdict: Verdict,
}

impl Run {
	pub(super) fn probe(&self) -> Result<(), Failure> {
		self.wait_for_the_main_window()?;
		let has_a_placeholder = || self.thread_view.latest_report().is_some();
		if self.mode.places_views_in_the_thread()
			&& !wait_until(MAIN_WINDOW_TIMEOUT, has_a_placeholder)
		{
			eprintln!("{NO_PLACEHOLDER}");
		}
		let lan = non_loopback_ipv4().map(IpAddr::V4).map_err(|cause| cause.to_string());
		let mut targets = Vec::new();
		let mut verdicts = Vec::new();
		for (kind, ip) in [(LOOPBACK, Ok(IpAddr::V4(Ipv4Addr::LOCALHOST))), (LAN, lan)] {
			let target = |port: &str| format!("{kind}-{port}");
			match ip {
				Ok(ip) => {
					let (mut listening, mut closed) = (Vec::new(), Vec::new());
					for attempt in ATTEMPTS {
						let pair = self.probe_pair(kind, ip, attempt)?;
						verdicts.push(json!({
							"address_kind": kind,
							"attempt": attempt,
							"distinguishable": pair.verdict.distinguishable,
							"signal": pair.verdict.signal,
						}));
						listening.push(pair.listening);
						closed.push(pair.closed);
					}
					targets.push(json!({ "target": target(LISTENING), "attempts": listening }));
					targets.push(json!({ "target": target(CLOSED), "attempts": closed }));
				}
				Err(reason) => {
					for port in [LISTENING, CLOSED] {
						targets.push(json!({ "target": target(port), "not_measured": reason }));
					}
					for attempt in ATTEMPTS {
						verdicts.push(json!({
							"address_kind": kind,
							"attempt": attempt,
							"not_measured": reason,
						}));
					}
				}
			}
		}
		let mode = format!("{PROBE_PREFIX}{}", self.mode.name());
		let results = json!({
			"ticket": TICKET,
			"os": std::env::consts::OS,
			"mode": mode,
			"tauri": tauri::VERSION,
			"webview": match tauri::webview_version() {
				Ok(version) => version,
				Err(cause) => format!("unavailable: {cause}"),
			},
			"duration_ms": self.started.elapsed().as_millis(),
			"mitigations": self.mode.mitigations(),
			"repetitions_per_target_and_attempt": REPETITIONS,
			"decisions": DECISIONS,
			"distinguishable_by_the_page": verdicts,
			"targets": targets,
		});
		let rendered = serde_json::to_string_pretty(&results)?;
		std::fs::write(format!("results-{}-{mode}.json", std::env::consts::OS), &rendered)?;
		println!("{rendered}");
		Ok(())
	}

	fn probe_pair(&self, kind: &str, ip: IpAddr, attempt: &'static str) -> Result<Pair, Failure> {
		let listening = ListeningPort::open(ip)?;
		let closed = closed_port(ip)?;
		let connect_before_the_case = connect_reading(closed);
		let (mut heard, mut refused) = (Vec::new(), Vec::new());
		for repetition in 1..=REPETITIONS {
			let mut services = [Some(&listening), None];
			if repetition % 2 == 0 {
				services.reverse();
			}
			for service in services {
				let (port, address, readings) = match service {
					Some(service) => (LISTENING, service.address(), &mut heard),
					None => (CLOSED, closed, &mut refused),
				};
				let label = format!("{PROBE_PREFIX}{attempt}-{kind}-{port}-{repetition}");
				readings.push(self.probe_once(repetition, &label, attempt, address, service)?);
			}
		}
		let proof = ClosedPortProof {
			connect_before_the_case,
			connect_after_the_case: connect_reading(closed),
		};
		Ok(Pair {
			verdict: Verdict::of(&heard, &refused),
			listening: Case::of(attempt, listening.address(), None, heard),
			closed: Case::of(attempt, closed, Some(proof), refused),
		})
	}

	fn probe_once(
		&self,
		repetition: usize,
		label: &str,
		attempt: &str,
		target: SocketAddr,
		service: Option<&ListeningPort>,
	) -> Result<Repetition, Failure> {
		let targets = ProbeTargets {
			role: format!("{PROBE_PREFIX}{attempt}"),
			navigation_sink: format!("http://{target}"),
		};
		let server = ViewServer::open(&targets, self.mode.view_csp_directives())?;
		point_at(&self.host, &server, self.mode);
		let view = self.open_view_until(label, server, |server| {
			if wait_until(PROBE_TIMEOUT, || !server.record().beacons.is_empty()) {
				wait_until(REPORT_TIMEOUT, || server.record().outcome(RUN_SIGNAL).is_some());
			}
		})?;
		let connections = service.map(ListeningPort::end_repetition);
		let played = self.close_view(view)?;
		Ok(Repetition::read(Played {
			repetition,
			view: played.label,
			view_error: played.creation_error,
			attempt,
			beacons: &played.observation.record.beacons,
			run_signal: played.observation.record.outcome(RUN_SIGNAL).map(str::to_owned),
			connections,
		}))
	}
}
