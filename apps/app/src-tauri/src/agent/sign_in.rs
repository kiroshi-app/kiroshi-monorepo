use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, Runtime};

use super::commands::AgentState;
use super::contract::{SignInError, SignInStarted, TransportError};
use super::protocol::{SignInFailure, SignInFailureKind, SignedIn};
use super::sidecar::{OauthFlowError, Opening};
use crate::events::SIGN_IN_STARTED;
use crate::mcp_oauth::commands::is_openable;

pub const SIGN_IN_STARTED_CHANNEL: &str = "agent://sign-in-started";

const NO_REASON: &str = "the sign-in settled with no reason";

impl From<TransportError> for SignInError {
	fn from(error: TransportError) -> Self {
		Self::Transport { error }
	}
}

impl From<OauthFlowError> for SignInError {
	fn from(error: OauthFlowError) -> Self {
		match error {
			OauthFlowError::Outlasted { timeout_ms } => Self::FlowTimedOut { timeout_ms },
			OauthFlowError::Transport(error) => Self::Transport { error },
		}
	}
}

impl From<SignInFailure> for SignInError {
	fn from(failure: SignInFailure) -> Self {
		match failure.kind {
			SignInFailureKind::Busy => Self::AlreadyRunning,
			SignInFailureKind::Cancelled => Self::Cancelled,
			SignInFailureKind::TimedOut => Self::TimedOut,
			SignInFailureKind::Failed => {
				Self::Failed { detail: failure.detail.unwrap_or_else(|| NO_REASON.to_owned()) }
			}
		}
	}
}

#[derive(Default)]
pub struct SignInState {
	is_running: AtomicBool,
}

impl SignInState {
	fn begin(&self) -> Result<Running<'_>, SignInError> {
		if self.is_running.swap(true, Ordering::AcqRel) {
			return Err(SignInError::AlreadyRunning);
		}
		Ok(Running { state: self })
	}

	fn is_running(&self) -> bool {
		self.is_running.load(Ordering::Acquire)
	}
}

struct Running<'a> {
	state: &'a SignInState,
}

impl Drop for Running<'_> {
	fn drop(&mut self) {
		self.state.is_running.store(false, Ordering::Release);
	}
}

#[tauri::command]
#[specta::specta]
pub async fn agent_sign_in<R: Runtime>(app: AppHandle<R>) -> Result<(), SignInError> {
	let state = crate::events::core(app.app_handle()).state::<SignInState>();
	let _running = state.begin()?;
	let sidecar = crate::events::core(app.app_handle()).state::<AgentState>().sidecar().await?;
	let mut flow = sidecar.begin_sign_in()?;
	let settled = match flow.opened().await? {
		Opening::Settled(settled) => settled,
		Opening::Authorization(url) => {
			announce_started(crate::events::core(app.app_handle()), url)?;
			flow.settled().await?
		}
	};
	outcome(settled)
}

fn announce_started(core: &crate::core_context::Core, url: String) -> Result<(), SignInError> {
	if !is_openable(&url) {
		return Err(SignInError::RefusedUrl { url });
	}
	core.emit(SIGN_IN_STARTED, SignInStarted { url })
		.map_err(|error| SignInError::Failed { detail: error.to_string() })
}

fn outcome(settled: SignedIn) -> Result<(), SignInError> {
	if settled.signed_in {
		return Ok(());
	}
	Err(settled
		.error
		.map_or_else(|| SignInError::Failed { detail: NO_REASON.to_owned() }, SignInError::from))
}

#[tauri::command]
#[specta::specta]
pub async fn agent_sign_in_code<R: Runtime>(
	app: AppHandle<R>,
	text: String,
) -> Result<(), SignInError> {
	if !crate::events::core(app.app_handle()).state::<SignInState>().is_running() {
		return Err(SignInError::NotRunning);
	}
	Ok(crate::events::core(app.app_handle())
		.state::<AgentState>()
		.sidecar()
		.await?
		.enter_sign_in_code(&text)?)
}

#[tauri::command]
#[specta::specta]
pub async fn agent_sign_in_cancel<R: Runtime>(app: AppHandle<R>) -> Result<(), SignInError> {
	if !crate::events::core(app.app_handle()).state::<SignInState>().is_running() {
		return Err(SignInError::NotRunning);
	}
	Ok(crate::events::core(app.app_handle())
		.state::<AgentState>()
		.sidecar()
		.await?
		.cancel_sign_in()?)
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	fn refused(kind: SignInFailureKind, detail: Option<&str>) -> SignInError {
		SignInError::from(SignInFailure { kind, detail: detail.map(str::to_owned) })
	}

	#[test]
	fn every_failure_the_sidecar_names_becomes_a_kind_of_its_own() {
		assert_eq!(refused(SignInFailureKind::Busy, None), SignInError::AlreadyRunning);
		assert_eq!(refused(SignInFailureKind::Cancelled, None), SignInError::Cancelled);
		assert_eq!(refused(SignInFailureKind::TimedOut, None), SignInError::TimedOut);
		assert_eq!(
			refused(SignInFailureKind::Failed, Some("the code was refused")),
			SignInError::Failed { detail: "the code was refused".to_owned() }
		);
	}

	#[test]
	fn a_refused_sign_in_crosses_under_the_kind_the_front_reads() {
		assert_eq!(
			to_value(SignInError::AlreadyRunning).expect("the error serializes"),
			json!({ "kind": "alreadyRunning" })
		);
		assert_eq!(
			to_value(SignInError::NotRunning).expect("the error serializes"),
			json!({ "kind": "notRunning" })
		);
		assert_eq!(
			to_value(SignInError::RefusedUrl { url: "javascript:alert(1)".to_owned() })
				.expect("the error serializes"),
			json!({ "kind": "refusedUrl", "url": "javascript:alert(1)" })
		);
	}

	#[test]
	fn a_settle_naming_neither_success_nor_a_reason_still_fails_with_one() {
		let settled = SignedIn { signed_in: false, error: None };

		assert_eq!(outcome(settled), Err(SignInError::Failed { detail: NO_REASON.to_owned() }));
	}
}
