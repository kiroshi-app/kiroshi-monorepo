use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const ACCEPT_POLL: Duration = Duration::from_millis(5);
const READ_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_BODY_BYTES: u64 = 64 * 1024;

pub struct Request {
	pub method: String,
	pub target: String,
	pub headers: Vec<(String, String)>,
	pub body: String,
}

impl Request {
	pub fn header(&self, name: &str) -> Option<&str> {
		self.headers
			.iter()
			.find(|(header, _)| header.eq_ignore_ascii_case(name))
			.map(|(_, value)| value.as_str())
	}
}

pub struct Response {
	pub status: &'static str,
	pub headers: Vec<(&'static str, String)>,
	pub body: Vec<u8>,
}

impl Response {
	pub fn empty(status: &'static str) -> Self {
		Self { status, headers: Vec::new(), body: Vec::new() }
	}
}

pub struct Listener {
	address: SocketAddr,
	is_closed: Arc<AtomicBool>,
}

impl Listener {
	pub fn open<H>(ip: IpAddr, answer: H) -> io::Result<Self>
	where
		H: Fn(Option<Request>) -> Response + Send + Sync + 'static,
	{
		let socket = TcpListener::bind((ip, 0))?;
		socket.set_nonblocking(true)?;
		let address = socket.local_addr()?;
		let is_closed = Arc::new(AtomicBool::new(false));
		let accept_closed = Arc::clone(&is_closed);
		let answer = Arc::new(answer);
		thread::spawn(move || {
			while !accept_closed.load(Ordering::SeqCst) {
				match socket.accept() {
					Ok((stream, _)) => {
						let answer = Arc::clone(&answer);
						thread::spawn(move || {
							if let Err(cause) = serve(stream, answer.as_ref()) {
								eprintln!("listener {address}: {cause}");
							}
						});
					}
					Err(cause) if cause.kind() == io::ErrorKind::WouldBlock => {
						thread::sleep(ACCEPT_POLL)
					}
					Err(cause) => eprintln!("listener {address}: accept failed: {cause}"),
				}
			}
		});
		Ok(Self { address, is_closed })
	}

	pub fn address(&self) -> SocketAddr {
		self.address
	}
}

impl Drop for Listener {
	fn drop(&mut self) {
		self.is_closed.store(true, Ordering::SeqCst);
	}
}

fn serve<H>(stream: TcpStream, answer: &H) -> io::Result<()>
where
	H: Fn(Option<Request>) -> Response,
{
	stream.set_nonblocking(false)?;
	stream.set_read_timeout(Some(READ_TIMEOUT))?;
	let request = match read_request(&stream) {
		Ok(request) => request,
		Err(cause) if is_silent_peer(&cause) => None,
		Err(cause) => return Err(cause),
	};
	let response = answer(request);
	let mut head = format!(
		"HTTP/1.1 {}\r\nConnection: close\r\nContent-Length: {}\r\n",
		response.status,
		response.body.len()
	);
	for (name, value) in &response.headers {
		head.push_str(&format!("{name}: {value}\r\n"));
	}
	head.push_str("\r\n");
	let mut stream = stream;
	stream.write_all(head.as_bytes())?;
	stream.write_all(&response.body)?;
	stream.flush()
}

fn is_silent_peer(cause: &io::Error) -> bool {
	matches!(
		cause.kind(),
		io::ErrorKind::WouldBlock
			| io::ErrorKind::TimedOut
			| io::ErrorKind::UnexpectedEof
			| io::ErrorKind::InvalidData
	)
}

fn read_request(stream: &TcpStream) -> io::Result<Option<Request>> {
	let mut reader = BufReader::new(stream);
	let mut request_line = String::new();
	if reader.read_line(&mut request_line)? == 0 {
		return Ok(None);
	}
	let mut parts = request_line.split_whitespace();
	let (Some(method), Some(target)) = (parts.next(), parts.next()) else {
		return Ok(None);
	};
	let mut headers = Vec::new();
	loop {
		let mut line = String::new();
		if reader.read_line(&mut line)? == 0 {
			break;
		}
		let line = line.trim_end();
		if line.is_empty() {
			break;
		}
		if let Some((name, value)) = line.split_once(':') {
			headers.push((name.trim().to_owned(), value.trim().to_owned()));
		}
	}
	let mut request = Request {
		method: method.to_owned(),
		target: target.to_owned(),
		headers,
		body: String::new(),
	};
	let body_length =
		request.header("content-length").and_then(|value| value.parse::<u64>().ok()).unwrap_or(0);
	let mut body = Vec::new();
	reader.take(body_length.min(MAX_BODY_BYTES)).read_to_end(&mut body)?;
	request.body = String::from_utf8_lossy(&body).into_owned();
	Ok(Some(request))
}
