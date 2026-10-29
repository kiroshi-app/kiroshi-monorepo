use std::sync::Arc;

use tauri::test::MockRuntime;
use tauri::AppHandle;

use crate::agent::commands::a_session_held_by_the_app;
use crate::agent::contract::{AgentEvent, RuntimeScope};
use crate::agent::session::{EventSink, Session, SessionOptions};
use crate::agent::sidecar::{Sidecar, SidecarOptions};
use crate::executable_script::an_executable_script;
use crate::removed_on_drop::RemovedOnDrop;

const OPENING_SIDECAR: &str = r#"#!/bin/sh
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
