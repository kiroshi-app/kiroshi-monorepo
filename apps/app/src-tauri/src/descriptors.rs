use std::io;
use std::path::Path;

#[cfg(target_os = "macos")]
const OPEN_MAX: libc::rlim_t = 10_240;

#[cfg(unix)]
pub fn raise_open_file_limit() {
	if let Err(error) = raised_to_the_hard_limit() {
		eprintln!("the open file soft limit was not raised: {error}");
	}
	match open_file_limit() {
		Ok(limit) => eprintln!("the open file soft limit is {}", limit.rlim_cur),
		Err(error) => eprintln!("the open file soft limit could not be read: {error}"),
	}
}

#[cfg(not(unix))]
pub fn raise_open_file_limit() {}

#[cfg(unix)]
fn raised_to_the_hard_limit() -> io::Result<()> {
	let mut limit = open_file_limit()?;
	limit.rlim_cur = ceiling(limit.rlim_max);
	if unsafe { libc::setrlimit(libc::RLIMIT_NOFILE, &limit) } != 0 {
		return Err(io::Error::last_os_error());
	}
	Ok(())
}

#[cfg(unix)]
fn open_file_limit() -> io::Result<libc::rlimit> {
	let mut limit = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
	if unsafe { libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit) } != 0 {
		return Err(io::Error::last_os_error());
	}
	Ok(limit)
}

#[cfg(target_os = "macos")]
fn ceiling(hard: libc::rlim_t) -> libc::rlim_t {
	hard.min(OPEN_MAX)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn ceiling(hard: libc::rlim_t) -> libc::rlim_t {
	hard
}

pub fn note_exhaustion(error: &io::Error, path: &Path) {
	if is_exhaustion(error) {
		eprintln!("descriptor exhaustion (EMFILE) at {}: {error}", path.display());
	}
}

#[cfg(unix)]
fn is_exhaustion(error: &io::Error) -> bool {
	error.raw_os_error() == Some(libc::EMFILE)
}

#[cfg(not(unix))]
fn is_exhaustion(_error: &io::Error) -> bool {
	false
}

#[cfg(all(test, unix))]
mod tests {
	use super::*;

	#[test]
	fn the_soft_limit_ends_at_the_ceiling_of_the_hard_limit() {
		raise_open_file_limit();

		let limit = open_file_limit().expect("the limit reads");
		assert_eq!(limit.rlim_cur, ceiling(limit.rlim_max));
	}

	#[test]
	fn only_an_emfile_error_reads_as_exhaustion() {
		assert!(is_exhaustion(&io::Error::from_raw_os_error(libc::EMFILE)));
		assert!(!is_exhaustion(&io::Error::from_raw_os_error(libc::ENOENT)));
	}
}
