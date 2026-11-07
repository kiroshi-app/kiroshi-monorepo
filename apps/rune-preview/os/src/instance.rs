use std::fmt;
use std::io;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

#[cfg(unix)]
use unix as platform;
#[cfg(windows)]
use windows as platform;

pub use platform::{Endpoint, Instance};

const FORWARD_LIMIT: usize = 64 * 1024;

const STALL_LIMIT: Duration = Duration::from_secs(2);

const ACCEPT_BACKOFF: Duration = Duration::from_secs(1);

const ACTIVATION_TOKENS: [&str; 2] = ["XDG_ACTIVATION_TOKEN", "DESKTOP_STARTUP_ID"];

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Forward {
	pub links: Vec<String>,
	pub activation_token: Option<String>,
}

impl Forward {
	pub fn of_launch(links: &[String]) -> Forward {
		let activation_token = ACTIVATION_TOKENS
			.iter()
			.filter_map(|name| std::env::var(name).ok())
			.find(|token| !token.is_empty());
		Forward { links: links.to_vec(), activation_token }
	}
}

pub enum Claim {
	First(Instance),
	Forwarded,
}

#[derive(Debug)]
pub enum ClaimError {
	Endpoint(io::Error),
	Forward(io::Error),
	ForeignOwner(io::Error),
}

impl fmt::Display for ClaimError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			ClaimError::Endpoint(cause) => write!(f, "the instance endpoint failed: {cause}"),
			ClaimError::Forward(cause) => {
				write!(f, "the running instance didn't take the launch: {cause}")
			}
			ClaimError::ForeignOwner(cause) => {
				write!(
					f,
					"the instance endpoint is not proven to be this user's, so nothing was sent: {cause}"
				)
			}
		}
	}
}

pub fn claim(endpoint: &Endpoint, forward: &Forward) -> Result<Claim, ClaimError> {
	platform::claim(endpoint, forward)
}

#[derive(Debug)]
enum Dropped {
	TooLarge,
	Stalled,
	Malformed,
	Unread(io::Error),
}

impl fmt::Display for Dropped {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Dropped::TooLarge => write!(f, "it sent more than {FORWARD_LIMIT} bytes"),
			Dropped::Stalled => write!(f, "it stalled past {} seconds", STALL_LIMIT.as_secs()),
			Dropped::Malformed => f.write_str("it was not a launch forward"),
			Dropped::Unread(cause) => write!(f, "it did not read: {cause}"),
		}
	}
}

fn received(
	mut read: impl FnMut(&mut [u8], Duration) -> io::Result<usize>,
) -> Result<Forward, Dropped> {
	let deadline = Instant::now() + STALL_LIMIT;
	let mut payload = Vec::new();
	let mut chunk = [0; 8 * 1024];
	loop {
		let left = deadline.saturating_duration_since(Instant::now());
		if left.is_zero() {
			return Err(Dropped::Stalled);
		}
		match read(&mut chunk, left) {
			Ok(0) => break,
			Ok(count) => payload.extend_from_slice(&chunk[..count]),
			Err(failure) if failure.kind() == io::ErrorKind::Interrupted => continue,
			Err(failure)
				if matches!(
					failure.kind(),
					io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
				) =>
			{
				return Err(Dropped::Stalled);
			}
			Err(failure) => return Err(Dropped::Unread(failure)),
		}
		if payload.len() > FORWARD_LIMIT {
			return Err(Dropped::TooLarge);
		}
	}
	serde_json::from_slice(&payload).map_err(|_| Dropped::Malformed)
}

fn delivered(forward: Result<Forward, Dropped>, on_forward: &impl Fn(Forward)) {
	match forward {
		Ok(forward) => on_forward(forward),
		Err(dropped) => eprintln!("a launch forward was dropped: {dropped}"),
	}
}

fn payload_of(forward: &Forward) -> io::Result<Vec<u8>> {
	serde_json::to_vec(forward).map_err(io::Error::other)
}

fn key_of(profile: &str) -> String {
	let hash = profile.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
		(hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
	});
	format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
	use super::*;

	fn reading(
		chunks: Vec<io::Result<Vec<u8>>>,
	) -> impl FnMut(&mut [u8], Duration) -> io::Result<usize> {
		let mut chunks = chunks.into_iter();
		move |buffer, _| match chunks.next() {
			Some(Ok(bytes)) => {
				buffer[..bytes.len()].copy_from_slice(&bytes);
				Ok(bytes.len())
			}
			Some(Err(failure)) => Err(failure),
			None => Ok(0),
		}
	}

	#[test]
	fn a_forward_reads_whole_until_its_sender_closes() {
		let forward =
			Forward { links: vec!["kiroshi://join?invitation=a".into()], activation_token: None };
		let payload = payload_of(&forward).expect("a payload");
		let (head, tail) = payload.split_at(5);

		let read = received(reading(vec![Ok(head.to_vec()), Ok(tail.to_vec())]));

		assert_eq!(read.ok(), Some(forward));
	}

	#[test]
	fn a_forward_past_the_limit_or_stalled_or_malformed_is_dropped() {
		let flood = (0..9).map(|_| Ok(vec![b' '; 8 * 1024])).collect();
		let stalled = vec![Err(io::ErrorKind::WouldBlock.into())];

		assert!(matches!(received(reading(flood)), Err(Dropped::TooLarge)));
		assert!(matches!(received(reading(stalled)), Err(Dropped::Stalled)));
		assert!(matches!(received(reading(vec![Ok(b"links".to_vec())])), Err(Dropped::Malformed)));
	}

	#[test]
	fn each_profile_keys_its_own_endpoint() {
		assert_eq!(key_of("local a"), key_of("local a"));
		assert_ne!(key_of("local a"), key_of("local b"));
		assert_eq!(key_of("").len(), 16);
	}
}
