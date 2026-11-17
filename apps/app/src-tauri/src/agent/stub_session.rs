use std::sync::Arc;
use std::time::Duration;

use tauri::test::MockRuntime;
use tauri::AppHandle;

use crate::agent::commands::{a_session_held_by_the_app, announce};
use crate::agent::contract::{AgentEvent, RuntimeScope, TurnOutcome};
use crate::agent::session::{EventSink, Session, SessionOptions};
use crate::agent::sidecar::{Sidecar, SidecarOptions};
use crate::conversations::host_turn::ended_as;
use crate::executable_script::an_executable_script;
use crate::removed_on_drop::RemovedOnDrop;

pub(crate) const OPENING_SIDECAR: &str = r#"#!/bin/sh
printf '%s\n' '{"type":"ready","provider":"stub","version":"0"}'
while IFS= read -r line; do
	case "$line" in
	*'"type":"open"'*)
		key=$(printf '%s' "$line" | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
		printf '{"session":"%s","frame":{"type":"opened"}}\n' "$key"
		;;
	esac
done
"#;

const SETTLING_SIDECAR: &str = r#"#!/bin/sh
printf '%s\n' '{"type":"ready","provider":"stub","version":"0"}'
while IFS= read -r line; do
	key=$(printf '%s' "$line" | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
	case "$line" in
	*'"type":"open"'*)
		printf '{"session":"%s","frame":{"type":"opened"}}\n' "$key"
		;;
	*'"type":"prompt"'*)
		(
			while [ ! -f 'TURN_ENDS' ]; do sleep 0.02; done
			printf '{"session":"%s","frame":{"type":"turn_settled","subtype":"success","session_id":"sdk-1","is_error":false}}\n' "$key"
		) &
		;;
	esac
done
"#;

const SETTLE_BOUND: Duration = Duration::from_secs(5);

const POLL: Duration = Duration::from_millis(20);

struct Unheard;

impl EventSink for Unheard {
	fn emit(&self, _event: AgentEvent) {}
}

pub(crate) struct HeldSession {
	pub(crate) session: Arc<Session>,
	_sidecar: RemovedOnDrop,
}

pub(crate) async fn a_session_held_for(
	app: &AppHandle<MockRuntime>,
	scope: &RuntimeScope,
) -> HeldSession {
	a_session_running(app, scope, OPENING_SIDECAR).await
}

pub(crate) async fn a_session_running(
	app: &AppHandle<MockRuntime>,
	scope: &RuntimeScope,
	sidecar_script: &str,
) -> HeldSession {
	let script = RemovedOnDrop(std::env::temp_dir().join(format!(
		"kiroshi-opening-sidecar-{}-{}.sh",
		std::process::id(),
		uuid::Uuid::new_v4()
	)));
	an_executable_script(&script, sidecar_script);
	let sidecar = Sidecar::start(SidecarOptions::new(script.to_path_buf()))
		.await
		.expect("the sidecar is ready");
	let options = SessionOptions::new(std::env::temp_dir());
	let session =
		Session::start(sidecar, options, Arc::new(Unheard)).await.expect("the session opens");
	let session = Arc::new(session);
	a_session_held_by_the_app(app, scope, session.clone());
	HeldSession { session, _sidecar: script }
}

pub(crate) struct BusySession {
	app: AppHandle<MockRuntime>,
	scope: RuntimeScope,
	held: HeldSession,
	turn_ends: RemovedOnDrop,
}

pub(crate) async fn a_busy_session(
	app: &AppHandle<MockRuntime>,
	scope: &RuntimeScope,
) -> BusySession {
	let turn_ends = RemovedOnDrop(std::env::temp_dir().join(format!(
		"kiroshi-turn-ends-{}-{}",
		std::process::id(),
		uuid::Uuid::new_v4()
	)));
	let script = SETTLING_SIDECAR.replace("TURN_ENDS", &turn_ends.display().to_string());
	let held = a_session_running(app, scope, &script).await;
	held.session.submit_prompt("still at it").await.expect("the turn runs");
	assert!(!held.session.is_idle().await, "the session is not busy");
	BusySession { app: app.clone(), scope: scope.clone(), held, turn_ends }
}

impl BusySession {
	pub(crate) async fn ends_its_turn(&self) {
		std::fs::write(&*self.turn_ends, "").expect("the turn is told to end");
		tokio::time::timeout(SETTLE_BOUND, async {
			while !self.held.session.is_idle().await {
				tokio::time::sleep(POLL).await;
			}
		})
		.await
		.expect("the session settles");
		announce(&self.app, Some(self.scope.clone()), ended_as(TurnOutcome::Completed));
	}
}

pub(crate) async fn until(mut holds: impl FnMut() -> bool) {
	tokio::time::timeout(SETTLE_BOUND, async {
		while !holds() {
			tokio::time::sleep(POLL).await;
		}
	})
	.await
	.expect("the state was reached in time");
}
