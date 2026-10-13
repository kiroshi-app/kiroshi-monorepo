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
	let raised = raised_soft(limit.rlim_cur, limit.rlim_max);
	if raised == limit.rlim_cur {
		return Ok(());
	}
	limit.rlim_cur = raised;
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

#[cfg(unix)]
fn raised_soft(current: libc::rlim_t, hard: libc::rlim_t) -> libc::rlim_t {
	current.max(ceiling(hard))
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
	fn the_soft_limit_ends_where_the_raise_puts_it() {
		let before = open_file_limit().expect("the limit reads");

		raise_open_file_limit();

		let after = open_file_limit().expect("the limit reads");
		assert_eq!(after.rlim_cur, raised_soft(before.rlim_cur, before.rlim_max));
	}

	#[test]
	fn a_soft_limit_below_the_ceiling_rises_to_it() {
		assert_eq!(raised_soft(256, 4_096), ceiling(4_096));
	}

	#[test]
	fn a_soft_limit_is_never_lowered() {
		for (current, hard) in
			[(256, 4_096), (4_096, 4_096), (60_000, 120_000), (60_000, libc::RLIM_INFINITY)]
		{
			assert!(raised_soft(current, hard) >= current, "{current} under {hard} was lowered");
		}
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn a_soft_limit_above_the_ceiling_is_left_as_it_is() {
		assert_eq!(raised_soft(OPEN_MAX + 1, libc::RLIM_INFINITY), OPEN_MAX + 1);
	}

	#[test]
	fn only_an_emfile_error_reads_as_exhaustion() {
		assert!(is_exhaustion(&io::Error::from_raw_os_error(libc::EMFILE)));
		assert!(!is_exhaustion(&io::Error::from_raw_os_error(libc::ENOENT)));
	}
}
