use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use super::{ACCEPT_BACKOFF, Claim, ClaimError, Forward, STALL_LIMIT};

const SOCKET: &str = "instance.sock";

const LOCK: &str = "instance.lock";

const OWNER_ONLY_FOLDER: u32 = 0o700;

const OWNER_ONLY_FILE: u32 = 0o600;

const GROUP_AND_OTHERS: u32 = 0o077;

pub struct Endpoint {
	folder: PathBuf,
}

impl Endpoint {
	pub fn of_profile(profile: &str) -> Endpoint {
		let base = std::env::var_os("XDG_RUNTIME_DIR")
			.map(PathBuf::from)
			.filter(|runtime| runtime.is_absolute())
			.unwrap_or_else(std::env::temp_dir);
		let name = format!("kiroshi-rune-{}-{}", current_user(), super::key_of(profile));
		Endpoint { folder: base.join(name) }
	}

	pub fn in_folder(folder: PathBuf) -> Endpoint {
		Endpoint { folder }
	}

	fn socket(&self) -> PathBuf {
		self.folder.join(SOCKET)
	}

	fn private_folder(&self) -> io::Result<()> {
		match DirBuilder::new().mode(OWNER_ONLY_FOLDER).create(&self.folder) {
			Err(failure) if failure.kind() == io::ErrorKind::AlreadyExists => {}
			created => return created,
		}
		let held = fs::symlink_metadata(&self.folder)?;
		let is_private =
			held.is_dir() && held.uid() == current_user() && held.mode() & GROUP_AND_OTHERS == 0;
		if !is_private {
			return Err(io::Error::new(
				io::ErrorKind::PermissionDenied,
				"the instance folder is not private to this user",
			));
		}
		Ok(())
	}

	fn locked(&self) -> io::Result<File> {
		let lock = OpenOptions::new()
			.create(true)
			.write(true)
			.truncate(false)
			.mode(OWNER_ONLY_FILE)
			.open(self.folder.join(LOCK))?;
		loop {
			if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX) } == 0 {
				return Ok(lock);
			}
			let failure = io::Error::last_os_error();
			if failure.kind() != io::ErrorKind::Interrupted {
				return Err(failure);
			}
		}
	}
}

fn current_user() -> u32 {
	unsafe { libc::getuid() }
}

pub struct Instance {
	listener: UnixListener,
}

impl Instance {
	pub fn serve(self, on_forward: impl Fn(Forward) + Send + 'static) -> io::Result<()> {
		let serving = move || {
			for connection in self.listener.incoming() {
				match connection {
					Ok(stream) => super::delivered(received(stream), &on_forward),
					Err(failure) => {
						eprintln!("the instance endpoint didn't accept a launch: {failure}");
						thread::sleep(ACCEPT_BACKOFF);
					}
				}
			}
		};
		thread::Builder::new().name("kiroshi-instance".into()).spawn(serving).map(drop)
	}
}

pub(super) fn claim(endpoint: &Endpoint, forward: &Forward) -> Result<Claim, ClaimError> {
	endpoint.private_folder().map_err(ClaimError::Endpoint)?;
	let _claiming = endpoint.locked().map_err(ClaimError::Endpoint)?;
	let socket = endpoint.socket();
	match UnixStream::connect(&socket) {
		Ok(stream) => sent(stream, forward).map(|()| Claim::Forwarded).map_err(ClaimError::Forward),
		Err(failure)
			if matches!(
				failure.kind(),
				io::ErrorKind::ConnectionRefused | io::ErrorKind::NotFound
			) =>
		{
			bound(socket).map(|listener| Claim::First(Instance { listener }))
		}
		Err(failure) => Err(ClaimError::Endpoint(failure)),
	}
}

fn bound(socket: PathBuf) -> Result<UnixListener, ClaimError> {
	if let Err(failure) = fs::remove_file(&socket)
		&& failure.kind() != io::ErrorKind::NotFound
	{
		return Err(ClaimError::Endpoint(failure));
	}
	UnixListener::bind(&socket).map_err(ClaimError::Endpoint)
}

fn sent(mut stream: UnixStream, forward: &Forward) -> io::Result<()> {
	stream.set_write_timeout(Some(STALL_LIMIT))?;
	stream.write_all(&super::payload_of(forward)?)?;
	stream.shutdown(Shutdown::Write)
}

fn received(mut stream: UnixStream) -> Result<Forward, super::Dropped> {
	super::received(|buffer, left| read_within(&mut stream, buffer, left))
}

fn read_within(stream: &mut UnixStream, buffer: &mut [u8], left: Duration) -> io::Result<usize> {
	let mut readable = libc::pollfd { fd: stream.as_raw_fd(), events: libc::POLLIN, revents: 0 };
	let millis = left.as_millis().clamp(1, i32::MAX as u128) as i32;
	match unsafe { libc::poll(&mut readable, 1, millis) } {
		0 => Err(io::ErrorKind::TimedOut.into()),
		-1 => Err(io::Error::last_os_error()),
		_ => stream.read(buffer),
	}
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicUsize, Ordering};
	use std::sync::mpsc::{Receiver, channel};

	use super::*;

	const PATIENCE: Duration = Duration::from_secs(10);

	struct Folder(PathBuf);

	impl Drop for Folder {
		fn drop(&mut self) {
			if let Err(failure) = fs::remove_dir_all(&self.0) {
				eprintln!("a test folder stayed behind: {failure}");
			}
		}
	}

	fn a_profile_of_its_own() -> Folder {
		static NEXT: AtomicUsize = AtomicUsize::new(0);
		let name = format!("kr-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed));
		Folder(std::env::temp_dir().join(name))
	}

	fn endpoint(folder: &Folder) -> Endpoint {
		Endpoint::in_folder(folder.0.join("endpoint"))
	}

	fn launch(links: &[&str], token: Option<&str>) -> Forward {
		Forward {
			links: links.iter().map(|link| link.to_string()).collect(),
			activation_token: token.map(str::to_owned),
		}
	}

	fn serving(endpoint: &Endpoint) -> Receiver<Forward> {
		let Ok(Claim::First(instance)) = claim(endpoint, &launch(&[], None)) else {
			panic!("the first launch owns the endpoint");
		};
		let (told, hearing) = channel();
		instance
			.serve(move |forward| told.send(forward).expect("the test hears"))
			.expect("the instance serves");
		hearing
	}

	#[test]
	fn a_second_launch_forwards_its_links_to_the_first() {
		let folder = a_profile_of_its_own();
		fs::create_dir_all(&folder.0).expect("the profile folder");
		let endpoint = endpoint(&folder);
		let first = serving(&endpoint);
		let second = launch(&["kiroshi://conversation/c1"], Some("token-1"));

		let claimed = claim(&endpoint, &second);

		assert!(matches!(claimed, Ok(Claim::Forwarded)));
		assert_eq!(first.recv_timeout(PATIENCE).ok(), Some(second));
		let mode = fs::metadata(&endpoint.folder).expect("the endpoint folder").mode();
		assert_eq!(mode & 0o777, OWNER_ONLY_FOLDER);
	}

	#[test]
	fn a_stale_endpoint_is_removed_and_the_launch_becomes_first() {
		let folder = a_profile_of_its_own();
		fs::create_dir_all(&folder.0).expect("the profile folder");
		let endpoint = endpoint(&folder);
		endpoint.private_folder().expect("the endpoint folder");
		drop(UnixListener::bind(endpoint.socket()).expect("a socket nobody serves"));
		assert!(endpoint.socket().exists());

		let claimed = claim(&endpoint, &launch(&["kiroshi://conversation/c1"], None));

		assert!(matches!(claimed, Ok(Claim::First(_))));
		assert!(matches!(claim(&endpoint, &launch(&[], None)), Ok(Claim::Forwarded)));
	}

	#[test]
	fn racing_launches_leave_one_first() {
		let folder = a_profile_of_its_own();
		fs::create_dir_all(&folder.0).expect("the profile folder");
		let endpoint = std::sync::Arc::new(endpoint(&folder));

		let racers: Vec<_> = (0..8)
			.map(|_| {
				let endpoint = endpoint.clone();
				thread::spawn(move || claim(&endpoint, &launch(&[], None)))
			})
			.collect();
		let claims: Vec<_> =
			racers.into_iter().map(|racer| racer.join().expect("a racer ends")).collect();

		let firsts = claims.iter().filter(|claimed| matches!(claimed, Ok(Claim::First(_))));
		let forwarded = claims.iter().filter(|claimed| matches!(claimed, Ok(Claim::Forwarded)));
		assert_eq!(firsts.count(), 1);
		assert_eq!(forwarded.count(), 7);
	}

	#[test]
	fn a_flood_or_a_stall_is_dropped_and_the_instance_keeps_serving() {
		let folder = a_profile_of_its_own();
		fs::create_dir_all(&folder.0).expect("the profile folder");
		let endpoint = endpoint(&folder);
		let first = serving(&endpoint);
		let oversized =
			format!(r#"{{"links":["{}"],"activation_token":null}}"#, "a".repeat(70 * 1024));
		let mut flood = UnixStream::connect(endpoint.socket()).expect("a flood connects");
		if let Err(failure) = flood.write_all(oversized.as_bytes()) {
			assert!(matches!(
				failure.kind(),
				io::ErrorKind::BrokenPipe | io::ErrorKind::ConnectionReset
			));
		}
		drop(flood);
		let stall = UnixStream::connect(endpoint.socket()).expect("a stall connects");
		let after = launch(&["kiroshi://conversation/c2"], None);

		let claimed = claim(&endpoint, &after);

		assert!(matches!(claimed, Ok(Claim::Forwarded)));
		assert_eq!(first.recv_timeout(PATIENCE).ok(), Some(after));
		drop(stall);
	}

	#[test]
	fn a_folder_open_to_others_is_refused() {
		use std::os::unix::fs::PermissionsExt;
		let folder = a_profile_of_its_own();
		fs::create_dir_all(&folder.0).expect("the profile folder");
		let endpoint = endpoint(&folder);
		endpoint.private_folder().expect("the endpoint folder");
		fs::set_permissions(&endpoint.folder, fs::Permissions::from_mode(0o755))
			.expect("the folder opens");

		let claimed = claim(&endpoint, &launch(&[], None));

		assert!(matches!(claimed, Err(ClaimError::Endpoint(_))));
	}
}
