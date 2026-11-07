use std::sync::atomic::{AtomicBool, Ordering};

use super::commands::AgentState;
use super::contract::{SignInError, SignInStarted};
use super::protocol::SignedIn;
use super::sidecar::Opening;
pub use crate::agent::contract::SIGN_IN_STARTED_CHANNEL;
use crate::events::SIGN_IN_STARTED;
use crate::mcp_oauth::commands::is_openable;

const NO_REASON: &str = "the sign-in settled with no reason";

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

pub async fn agent_sign_in(core: &crate::core_context::Core) -> Result<(), SignInError> {
	let state = core.state::<SignInState>();
	let _running = state.begin()?;
	let sidecar = core.state::<AgentState>().sidecar().await?;
	let mut flow = sidecar.begin_sign_in()?;
	let settled = match flow.opened().await? {
		Opening::Settled(settled) => settled,
		Opening::Authorization(url) => {
			announce_started(core, url)?;
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

pub async fn agent_sign_in_code(
	core: &crate::core_context::Core,
	text: String,
) -> Result<(), SignInError> {
	if !core.state::<SignInState>().is_running() {
		return Err(SignInError::NotRunning);
	}
	Ok(core.state::<AgentState>().sidecar().await?.enter_sign_in_code(&text)?)
}

pub async fn agent_sign_in_cancel(core: &crate::core_context::Core) -> Result<(), SignInError> {
	if !core.state::<SignInState>().is_running() {
		return Err(SignInError::NotRunning);
	}
	Ok(core.state::<AgentState>().sidecar().await?.cancel_sign_in()?)
}

#[cfg(test)]
mod tests {
	use crate::agent::protocol::{SignInFailure, SignInFailureKind};
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
