use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::http::{Listener, Request, Response};

pub const ALLOWLIST_HOSTS: [&str; 1] = ["cdn.jsdelivr.net"];

const HOSTILE_HTML: &str = include_str!("../hostile.html");
const TARGETS_PLACEHOLDER: &str = "\"__TARGETS__\"";
const DOCUMENT_NAME: &str = "hostile.html";
const WRAPPER_NAME: &str = "view.html";
const WRAPPER_HTML: &str = r#"<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>OPE-2298 view wrapper</title>
	</head>
	<body>
		<iframe src="hostile.html" title="hostile view" width="520" height="360"></iframe>
	</body>
</html>
"#;
pub const WRAPPER_CSP: &str = "default-src 'none'; frame-src 'self'";
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const ROUTING_PROBE_ADDRESS: (Ipv4Addr, u16) = (Ipv4Addr::new(192, 0, 2, 1), 9);
const RECORDED_BODY_CHARS: usize = 512;

pub fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
	mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn non_loopback_ipv4() -> io::Result<Ipv4Addr> {
	let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
	socket.connect(ROUTING_PROBE_ADDRESS)?;
	match socket.local_addr()?.ip() {
		IpAddr::V4(address) if !address.is_loopback() && !address.is_unspecified() => Ok(address),
		address => Err(io::Error::other(format!(
			"the routed address {address} is not a non-loopback IPv4 address"
		))),
	}
}

fn summary(request: Option<&Request>) -> String {
	match request {
		Some(request) => {
			let body: String = request.body.chars().take(RECORDED_BODY_CHARS).collect();
			format!("{} {} {}", request.method, request.target, body).trim_end().to_owned()
		}
		None => "connection without a request".to_owned(),
	}
}

#[derive(Clone)]
pub struct Connection {
	pub accepted_at: Instant,
	pub bytes_received: usize,
	pub target: Option<String>,
	pub summary: String,
}

pub struct Tripwire {
	listener: Listener,
	connections: Arc<Mutex<Vec<Connection>>>,
	control_connections: usize,
}

pub struct TripwireReading {
	pub address: String,
	pub control_connections: usize,
	pub connections: Vec<Connection>,
}

impl TripwireReading {
	pub fn view_connections(&self) -> &[Connection] {
		self.connections.get(self.control_connections..).unwrap_or(&[])
	}

	pub fn is_silent(&self) -> bool {
		self.control_connections > 0 && self.view_connections().is_empty()
	}
}

impl Tripwire {
	pub fn open(ip: IpAddr) -> io::Result<Self> {
		let connections = Arc::new(Mutex::new(Vec::new()));
		let recorded = Arc::clone(&connections);
		let listener = Listener::open(ip, move |incoming| {
			locked(&recorded).push(Connection {
				accepted_at: incoming.accepted_at,
				bytes_received: incoming.bytes_received,
				target: incoming.request.as_ref().map(|request| request.target.clone()),
				summary: summary(incoming.request.as_ref()),
			});
			Response {
				status: "200 OK",
				headers: vec![
					("Access-Control-Allow-Origin", "*".to_owned()),
					("Content-Type", "text/plain".to_owned()),
				],
				body: b"tripwire".to_vec(),
			}
		})?;
		let mut control = TcpStream::connect_timeout(&listener.address(), PROBE_TIMEOUT)?;
		control.set_read_timeout(Some(PROBE_TIMEOUT))?;
		control.write_all(b"GET /control HTTP/1.1\r\nHost: tripwire\r\n\r\n")?;
		control.read_to_end(&mut Vec::new())?;
		let control_connections = locked(&connections).len();
		Ok(Self { listener, connections, control_connections })
	}

	pub fn address(&self) -> SocketAddr {
		self.listener.address()
	}

	pub fn reading(&self) -> TripwireReading {
		TripwireReading {
			address: self.address().to_string(),
			control_connections: self.control_connections,
			connections: locked(&self.connections).clone(),
		}
	}
}

pub const WRITER_ROLE: &str = "writer";
pub const READER_ROLE: &str = "reader";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Targets {
	pub role: &'static str,
	pub loopback_tripwire: String,
	pub lan_tripwire: Option<String>,
	pub navigation_sink: String,
}

#[derive(Clone)]
pub struct Beacon {
	pub at: Instant,
	pub attempt: String,
	pub outcome: String,
}

#[derive(Clone, Serialize)]
pub struct CspReport {
	pub blocked_uri: String,
	pub directive: String,
}

#[derive(Clone, Default)]
pub struct ViewRecord {
	pub document_requests: usize,
	pub first_document_request: Option<Instant>,
	pub beacons: Vec<Beacon>,
	pub csp_reports: Vec<CspReport>,
	pub cookie_headers: Vec<String>,
	pub unrouted_requests: Vec<String>,
}

impl ViewRecord {
	pub fn outcome(&self, attempt: &str) -> Option<&str> {
		self.beacons
			.iter()
			.rev()
			.find(|beacon| beacon.attempt == attempt)
			.map(|beacon| beacon.outcome.as_str())
	}

	pub fn beacon_at(&self, attempt: &str, outcome: &str) -> Option<Instant> {
		self.beacons
			.iter()
			.find(|beacon| beacon.attempt == attempt && beacon.outcome == outcome)
			.map(|beacon| beacon.at)
	}
}

pub struct ViewServer {
	listener: Listener,
	token: String,
	csp: String,
	record: Arc<Mutex<ViewRecord>>,
}

impl ViewServer {
	pub fn open(targets: &Targets, added_directives: &[&str]) -> io::Result<Self> {
		let token = uuid::Uuid::new_v4().simple().to_string();
		let csp = view_csp(&token, added_directives);
		let document = HOSTILE_HTML.replace(TARGETS_PLACEHOLDER, &serde_json::to_string(targets)?);
		let record = Arc::new(Mutex::new(ViewRecord::default()));
		let recorded = Arc::clone(&record);
		let (route_token, route_csp) = (token.clone(), csp.clone());
		let listener = Listener::open(IpAddr::V4(Ipv4Addr::LOCALHOST), move |incoming| {
			let Some(request) = incoming.request else {
				locked(&recorded).unrouted_requests.push(summary(None));
				return Response::empty("400 Bad Request");
			};
			answer_view_request(
				&request,
				&route_token,
				&route_csp,
				&document,
				&mut locked(&recorded),
			)
		})?;
		Ok(Self { listener, token, csp, record })
	}

	pub fn origin(&self) -> String {
		format!("http://{}", self.listener.address())
	}

	pub fn url(&self) -> String {
		format!("{}/{}/{DOCUMENT_NAME}", self.origin(), self.token)
	}

	pub fn framed_url(&self) -> String {
		format!("{}/{}/{WRAPPER_NAME}", self.origin(), self.token)
	}

	pub fn token(&self) -> &str {
		&self.token
	}

	pub fn csp(&self) -> &str {
		&self.csp
	}

	pub fn record(&self) -> ViewRecord {
		locked(&self.record).clone()
	}
}

fn view_csp(token: &str, added_directives: &[&str]) -> String {
	let allowlist = ALLOWLIST_HOSTS.map(|host| format!("https://{host}")).join(" ");
	let base = format!(
		"default-src 'none'; script-src 'unsafe-inline' {allowlist}; connect-src {allowlist}; img-src 'self'; form-action 'none'; base-uri 'none'; report-uri /{token}/csp-report"
	);
	std::iter::once(base.as_str())
		.chain(added_directives.iter().copied())
		.collect::<Vec<_>>()
		.join("; ")
}

fn answer_view_request(
	request: &Request,
	token: &str,
	csp: &str,
	document: &str,
	record: &mut ViewRecord,
) -> Response {
	if let Some(cookie) = request.header("cookie") {
		if !record.cookie_headers.iter().any(|seen| seen == cookie) {
			record.cookie_headers.push(cookie.to_owned());
		}
	}
	let route = request
		.target
		.strip_prefix('/')
		.and_then(|target| target.strip_prefix(token))
		.and_then(|rest| rest.strip_prefix('/'));
	match (request.method.as_str(), route) {
		("GET", Some(DOCUMENT_NAME)) => {
			record.document_requests += 1;
			record.first_document_request.get_or_insert_with(Instant::now);
			Response {
				status: "200 OK",
				headers: vec![
					("Content-Type", "text/html; charset=utf-8".to_owned()),
					("Content-Security-Policy", csp.to_owned()),
					("Cache-Control", "no-store".to_owned()),
				],
				body: document.as_bytes().to_vec(),
			}
		}
		("GET", Some(WRAPPER_NAME)) => Response {
			status: "200 OK",
			headers: vec![
				("Content-Type", "text/html; charset=utf-8".to_owned()),
				(
					"Content-Security-Policy",
					format!("{WRAPPER_CSP}; report-uri /{token}/csp-report"),
				),
				("Cache-Control", "no-store".to_owned()),
			],
			body: WRAPPER_HTML.as_bytes().to_vec(),
		},
		("POST", Some("csp-report")) => {
			match csp_report(&request.body) {
				Some(report) => record.csp_reports.push(report),
				None => record.unrouted_requests.push(summary(Some(request))),
			}
			Response::empty("204 No Content")
		}
		("GET", Some(route)) => {
			match route.strip_prefix("beacon/").and_then(|beacon| beacon.split_once('/')) {
				Some((attempt, outcome)) => {
					record.beacons.push(Beacon {
						at: Instant::now(),
						attempt: attempt.to_owned(),
						outcome: outcome.to_owned(),
					});
					Response::empty("204 No Content")
				}
				None => {
					record.unrouted_requests.push(summary(Some(request)));
					Response::empty("404 Not Found")
				}
			}
		}
		_ => {
			record.unrouted_requests.push(summary(Some(request)));
			Response::empty("404 Not Found")
		}
	}
}

fn csp_report(body: &str) -> Option<CspReport> {
	let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
	let report = parsed.get("csp-report")?;
	let field = |names: [&str; 2]| {
		names.iter().find_map(|name| report.get(name)?.as_str()).map(str::to_owned)
	};
	Some(CspReport {
		blocked_uri: field(["blocked-uri", "blockedURL"])?,
		directive: field(["effective-directive", "violated-directive"])?,
	})
}
