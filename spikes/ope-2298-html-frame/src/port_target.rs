use std::io::{self, Read};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::sensors::locked;

const POLL: Duration = Duration::from_millis(1);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const READ_BUFFER_BYTES: usize = 4096;
const CLOSED_BY_PEER: &str = "peer";
const CLOSED_BY_SERVICE: &str = "service";

#[derive(Serialize)]
pub struct ConnectionReading {
	pub bytes_received: usize,
	pub ms_from_accept_to_close: f64,
	pub closed_by: &'static str,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub read_error: Option<String>,
}

struct PeerClose {
	at: Instant,
	read_error: Option<String>,
}

struct Watched {
	stream: TcpStream,
	accepted_at: Instant,
	bytes_received: usize,
	peer_close: Option<PeerClose>,
}

impl Watched {
	fn poll(&mut self) {
		if self.peer_close.is_some() {
			return;
		}
		let mut buffer = [0; READ_BUFFER_BYTES];
		loop {
			let read_error = match self.stream.read(&mut buffer) {
				Ok(0) => None,
				Ok(read) => {
					self.bytes_received += read;
					continue;
				}
				Err(cause) if cause.kind() == io::ErrorKind::WouldBlock => return,
				Err(cause) if cause.kind() == io::ErrorKind::Interrupted => continue,
				Err(cause) => Some(cause.to_string()),
			};
			self.peer_close = Some(PeerClose { at: Instant::now(), read_error });
			return;
		}
	}

	fn close(mut self) -> ConnectionReading {
		self.poll();
		let (closed_at, closed_by, read_error) = match self.peer_close {
			Some(close) => (close.at, CLOSED_BY_PEER, close.read_error),
			None => (Instant::now(), CLOSED_BY_SERVICE, None),
		};
		ConnectionReading {
			bytes_received: self.bytes_received,
			ms_from_accept_to_close: closed_at.duration_since(self.accepted_at).as_secs_f64()
				* 1000.0,
			closed_by,
			read_error,
		}
	}
}

pub struct ListeningPort {
	address: SocketAddr,
	is_closed: Arc<AtomicBool>,
	watched: Arc<Mutex<Vec<Watched>>>,
}

impl ListeningPort {
	pub fn open(ip: IpAddr) -> io::Result<Self> {
		let socket = TcpListener::bind((ip, 0))?;
		socket.set_nonblocking(true)?;
		let address = socket.local_addr()?;
		let is_closed = Arc::new(AtomicBool::new(false));
		let watched = Arc::new(Mutex::new(Vec::new()));
		let (poll_closed, polled) = (Arc::clone(&is_closed), Arc::clone(&watched));
		thread::spawn(move || {
			while !poll_closed.load(Ordering::SeqCst) {
				match accept(&socket) {
					Ok(Some(connection)) => locked(&polled).push(connection),
					Ok(None) => {}
					Err(cause) => eprintln!("listening port {address}: accept failed: {cause}"),
				}
				locked(&polled).iter_mut().for_each(Watched::poll);
				thread::sleep(POLL);
			}
		});
		Ok(Self { address, is_closed, watched })
	}

	pub fn address(&self) -> SocketAddr {
		self.address
	}

	pub fn end_repetition(&self) -> Vec<ConnectionReading> {
		let ended = std::mem::take(&mut *locked(&self.watched));
		ended.into_iter().map(Watched::close).collect()
	}
}

impl Drop for ListeningPort {
	fn drop(&mut self) {
		self.is_closed.store(true, Ordering::SeqCst);
	}
}

fn accept(socket: &TcpListener) -> io::Result<Option<Watched>> {
	let stream = match socket.accept() {
		Ok((stream, _)) => stream,
		Err(cause) if cause.kind() == io::ErrorKind::WouldBlock => return Ok(None),
		Err(cause) => return Err(cause),
	};
	let accepted_at = Instant::now();
	stream.set_nonblocking(true)?;
	Ok(Some(Watched { stream, accepted_at, bytes_received: 0, peer_close: None }))
}

pub fn closed_port(ip: IpAddr) -> io::Result<SocketAddr> {
	TcpListener::bind((ip, 0))?.local_addr()
}

#[derive(Serialize)]
pub struct ConnectReading {
	pub refused: bool,
	pub outcome: String,
}

pub fn connect_reading(address: SocketAddr) -> ConnectReading {
	match TcpStream::connect_timeout(&address, CONNECT_TIMEOUT) {
		Ok(_) => ConnectReading {
			refused: false,
			outcome: "the connect was accepted, the port is listening".to_owned(),
		},
		Err(cause) => ConnectReading {
			refused: cause.kind() == io::ErrorKind::ConnectionRefused,
			outcome: cause.to_string(),
		},
	}
}

#[cfg(test)]
mod tests {
	use std::io::Write;
	use std::net::Ipv4Addr;

	use super::*;
	use crate::scenario::wait_until;

	const LOOPBACK: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);
	const ARRIVAL_TIMEOUT: Duration = Duration::from_secs(2);

	fn has_watched(port: &ListeningPort, is_reached: impl Fn(&Watched) -> bool) -> bool {
		wait_until(ARRIVAL_TIMEOUT, || locked(&port.watched).iter().any(&is_reached))
	}

	#[test]
	fn a_connection_the_peer_closes_is_read_with_its_bytes() {
		let port = ListeningPort::open(LOOPBACK).unwrap();
		let mut peer = TcpStream::connect(port.address()).unwrap();
		peer.write_all(b"ping").unwrap();
		drop(peer);
		assert!(has_watched(&port, |connection| connection.peer_close.is_some()));

		let readings = port.end_repetition();

		assert_eq!(readings.len(), 1);
		assert_eq!(readings[0].bytes_received, 4);
		assert_eq!(readings[0].closed_by, CLOSED_BY_PEER);
	}

	#[test]
	fn a_connection_still_open_at_the_end_of_the_repetition_is_closed_by_the_service() {
		let port = ListeningPort::open(LOOPBACK).unwrap();
		let _peer = TcpStream::connect(port.address()).unwrap();
		assert!(has_watched(&port, |_| true));

		let readings = port.end_repetition();

		assert_eq!(readings.len(), 1);
		assert_eq!(readings[0].bytes_received, 0);
		assert_eq!(readings[0].closed_by, CLOSED_BY_SERVICE);
		assert!(port.end_repetition().is_empty());
	}

	#[test]
	fn a_closed_port_refuses_the_connect_and_a_listening_one_does_not() {
		let port = ListeningPort::open(LOOPBACK).unwrap();

		assert!(connect_reading(closed_port(LOOPBACK).unwrap()).refused);
		assert!(!connect_reading(port.address()).refused);
	}
}
