use std::path::PathBuf;

use super::contract::{Diagnostics, LogFileError, Side};
use super::files::{clear, tail};
use super::install_kind;
use crate::account::contract::{AccountPlan, AccountState};
use crate::account::session::AccountSession;
use crate::agent::AgentState;
use crate::core_context::Core;
use crate::hosting::Hosting;
use crate::joined_spaces::relay::RelayGuests;
use crate::logging::scrub::scrubbed;

pub struct HostFacts {
	pub app_version: String,
	pub git_commit: String,
	pub os_name: String,
	pub os_build: String,
	pub arch: String,
	pub log_file: Option<PathBuf>,
}

pub async fn diagnostics(core: &Core) -> Diagnostics {
	let facts = core.state::<HostFacts>();
	let (agent_version, provider, agent_error) = match core.state::<AgentState>().sidecar().await {
		Ok(sidecar) => {
			(Some(sidecar.version().to_owned()), Some(sidecar.provider().to_owned()), None)
		}
		Err(error) => (None, None, Some(error)),
	};
	Diagnostics {
		app_version: facts.app_version.clone(),
		git_commit: facts.git_commit.clone(),
		install_kind: install_kind(core.identifier()),
		os_name: facts.os_name.clone(),
		os_build: facts.os_build.clone(),
		arch: facts.arch.clone(),
		ram_bytes: ram_bytes(),
		agent_version,
		provider,
		agent_error,
		side: side(core),
		plan: plan(core),
	}
}

pub async fn log_tail(core: &Core, lines: u32) -> Result<Vec<String>, LogFileError> {
	tail(&log_file(core)?, lines as usize)
		.map_err(|error| LogFileError::Unreadable { detail: error.to_string() })
}

pub async fn log_reveal(core: &Core) -> Result<(), LogFileError> {
	core.reveal(&log_file(core)?)
		.map_err(|error| LogFileError::Unrevealed { detail: scrubbed(&error.to_string()) })
}

pub async fn log_clear(core: &Core) -> Result<(), LogFileError> {
	clear(&log_file(core)?).map_err(|error| LogFileError::Unwritable { detail: error.to_string() })
}

fn log_file(core: &Core) -> Result<PathBuf, LogFileError> {
	core.state::<HostFacts>().log_file.clone().ok_or(LogFileError::Unresolved)
}

fn side(core: &Core) -> Side {
	if core.try_state::<Hosting>().is_some_and(|hosting| hosting.is_hosting()) {
		return Side::Host;
	}
	if core.try_state::<RelayGuests>().is_some_and(|guests| guests.is_joined()) {
		return Side::Member;
	}
	Side::Local
}

fn plan(core: &Core) -> Option<AccountPlan> {
	match core.try_state::<AccountSession>()?.current() {
		AccountState::SignedIn(account) => account.plan,
		_ => None,
	}
}

#[cfg(unix)]
fn ram_bytes() -> Option<u64> {
	let pages = unsafe { libc::sysconf(libc::_SC_PHYS_PAGES) };
	let page_size = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
	let pages = u64::try_from(pages).ok()?;
	let page_size = u64::try_from(page_size).ok()?;
	pages.checked_mul(page_size)
}

#[cfg(not(unix))]
fn ram_bytes() -> Option<u64> {
	None
}

#[cfg(test)]
mod tests {
	use super::*;

	#[cfg(unix)]
	#[test]
	fn the_machine_reports_its_memory() {
		assert!(ram_bytes().is_some_and(|bytes| bytes > 0));
	}
}
