use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use super::contract::{Diagnostics, InstallKind, LogFileError, Side};
use crate::account::contract::{AccountPlan, AccountState};
use crate::account::session::AccountSession;
use crate::agent::AgentState;
use crate::hosting::Hosting;
use crate::joined_spaces::relay::RelayGuests;

const DEV_IDENTIFIER_SUFFIX: &str = ".dev";

#[tauri::command]
#[specta::specta]
pub async fn diagnostics<R: Runtime>(app: AppHandle<R>) -> Diagnostics {
	let (agent_version, provider, agent_error) = match app.state::<AgentState>().sidecar().await {
		Ok(sidecar) => {
			(Some(sidecar.version().to_owned()), Some(sidecar.provider().to_owned()), None)
		}
		Err(error) => (None, None, Some(error)),
	};
	Diagnostics {
		app_version: app.package_info().version.to_string(),
		git_commit: env!("KIROSHI_GIT_COMMIT").to_owned(),
		install_kind: install_kind(&app.config().identifier),
		os_name: tauri_plugin_os::type_().to_string(),
		os_build: tauri_plugin_os::version().to_string(),
		arch: tauri_plugin_os::arch().to_owned(),
		ram_bytes: ram_bytes(),
		agent_version,
		provider,
		agent_error,
		side: side(&app),
		plan: plan(&app),
	}
}

#[tauri::command]
#[specta::specta]
pub async fn log_tail<R: Runtime>(
	app: AppHandle<R>,
	lines: u32,
) -> Result<Vec<String>, LogFileError> {
	let file = super::current_file(&app).map_err(|_| LogFileError::Unresolved)?;
	super::tail(&file, lines as usize)
		.map_err(|error| LogFileError::Unreadable { detail: error.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn log_reveal<R: Runtime>(app: AppHandle<R>) -> Result<(), LogFileError> {
	let file = super::current_file(&app).map_err(|_| LogFileError::Unresolved)?;
	app.opener().reveal_item_in_dir(&file).map_err(|error| LogFileError::Unrevealed {
		detail: super::scrub::scrubbed(&error.to_string()),
	})
}

#[tauri::command]
#[specta::specta]
pub async fn log_clear<R: Runtime>(app: AppHandle<R>) -> Result<(), LogFileError> {
	let file = super::current_file(&app).map_err(|_| LogFileError::Unresolved)?;
	super::clear(&file).map_err(|error| LogFileError::Unwritable { detail: error.to_string() })
}

fn install_kind(identifier: &str) -> InstallKind {
	if identifier.ends_with(DEV_IDENTIFIER_SUFFIX) {
		return InstallKind::Dev;
	}
	InstallKind::Installed
}

fn side<R: Runtime>(app: &AppHandle<R>) -> Side {
	if app.try_state::<Hosting>().is_some_and(|hosting| hosting.is_hosting()) {
		return Side::Host;
	}
	if app.try_state::<RelayGuests>().is_some_and(|guests| guests.is_joined()) {
		return Side::Member;
	}
	Side::Local
}

fn plan<R: Runtime>(app: &AppHandle<R>) -> Option<AccountPlan> {
	match app.try_state::<AccountSession>()?.current() {
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

	#[test]
	fn the_dev_identifier_is_a_dev_install_and_the_shipped_one_is_installed() {
		assert_eq!(install_kind("com.kiroshi.app.dev"), InstallKind::Dev);
		assert_eq!(install_kind("com.kiroshi.app"), InstallKind::Installed);
	}

	#[cfg(unix)]
	#[test]
	fn the_machine_reports_its_memory() {
		assert!(ram_bytes().is_some_and(|bytes| bytes > 0));
	}
}
