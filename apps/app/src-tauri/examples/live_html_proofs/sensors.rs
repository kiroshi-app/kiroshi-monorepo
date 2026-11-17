use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;

use kiroshi_app::live_html::server::{CONTENT_DOCUMENT, WRAPPER_DOCUMENT};

use crate::http::{Listener, Request, Response};

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
		let listener = Listener::open(SocketAddr::new(ip, 0), move |incoming| {
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

#[derive(Clone)]
pub struct SeenRequest {
	pub at: Instant,
	pub method: String,
	pub target: String,
	pub cookie: Option<String>,
	pub body: String,
}

impl SeenRequest {
	fn summary(&self) -> String {
		let body: String = self.body.chars().take(RECORDED_BODY_CHARS).collect();
		format!("{} {} {}", self.method, self.target, body).trim_end().to_owned()
	}
}

impl ViewRecord {
	pub fn of(token: &str, requests: &[SeenRequest]) -> Self {
		let mut record = Self::default();
		for request in requests {
			record.add(token, request);
		}
		record
	}

	fn add(&mut self, token: &str, request: &SeenRequest) {
		if let Some(cookie) = &request.cookie {
			if !self.cookie_headers.iter().any(|seen| seen == cookie) {
				self.cookie_headers.push(cookie.clone());
			}
		}
		let route = request
			.target
			.strip_prefix('/')
			.and_then(|target| target.strip_prefix(token))
			.and_then(|rest| rest.strip_prefix('/'));
		match (request.method.as_str(), route) {
			("GET", Some(CONTENT_DOCUMENT)) => {
				self.document_requests += 1;
				self.first_document_request.get_or_insert(request.at);
			}
			("GET", Some(WRAPPER_DOCUMENT)) => {}
			("POST", Some("csp-report")) => match csp_report(&request.body) {
				Some(report) => self.csp_reports.push(report),
				None => self.unrouted_requests.push(request.summary()),
			},
			("GET", Some(route)) => {
				match route.strip_prefix("beacon/").and_then(|beacon| beacon.split_once('/')) {
					Some((attempt, outcome)) => self.beacons.push(Beacon {
						at: request.at,
						attempt: attempt.to_owned(),
						outcome: outcome.to_owned(),
					}),
					None => self.unrouted_requests.push(request.summary()),
				}
			}
			_ => self.unrouted_requests.push(request.summary()),
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
