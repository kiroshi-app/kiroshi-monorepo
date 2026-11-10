use std::cell::Cell;
use std::collections::HashMap;
use std::sync::mpsc::Sender;
use std::sync::{Arc, LazyLock, Mutex, PoisonError};

use kiroshi_core::joined_spaces::contract::JoinedSpaceConnection;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::events::{self, HostEvent, JoinedHeard};
use crate::host::{Host, HostError, JOINED_SPACE_CONNECT, Joined, Profile};
use crate::local::LocalCore;

#[cfg(test)]
mod tests;

const JOINED_SPACE_REMOVE: &str = "joined_space_remove";

const LOCAL_COMMANDS: [&str; 95] = [
	"space_list",
	"space_create",
	"space_update",
	"space_reorder",
	"space_delete",
	"space_export",
	"space_import",
	"library_save",
	"library_copy",
	"library_reveal",
	"library_save_bytes",
	"library_copy_bytes",
	"library_import_paths",
	"library_read_picked_image",
	"library_read_link_preview",
	"remote_image_read",
	"joined_spaces_list",
	"joined_space_connect",
	"joined_space_members",
	"joined_space_remove",
	"joined_space_describe",
	"join_link_listen",
	"user_preferences",
	"user_set_preferences",
	"user_set_profile_picture",
	"user_set_onboarding_step",
	"user_replay_onboarding",
	"user_set_onboarding_first_companion",
	"user_mark_onboarding_import_seen",
	"claude_import_inventory",
	"claude_import_run",
	"window_declare_maximize_button",
	"window_open",
	"window_identity",
	"window_report_space",
	"window_report_strip",
	"window_strip_at",
	"window_tab_drag_start",
	"window_tab_drag_move",
	"window_tab_drag_drop",
	"window_tab_drag_cancel",
	"window_start_native_move",
	"window_hide",
	"window_show",
	"drag_ghost_show",
	"drag_ghost_tab",
	"drag_ghost_move",
	"drag_ghost_hide",
	"library_screenshot_job",
	"library_screenshot_answer",
	"diagnostics",
	"log_tail",
	"log_reveal",
	"log_clear",
	"hosting_state",
	"hosting_start",
	"hosting_stop",
	"mcp_oauth_cancel",
	"conversation_mission_thread",
	"mission_board",
	"mission_unreported",
	"mission_run_claim",
	"mission_run_release",
	"conversation_serve_awaited_runs",
	"conversation_claim_unseen_drops",
	"notification_show",
	"badge_set",
	"companion_launch_outcome",
	"get_device_identity",
	"device_approval",
	"device_approval_retry",
	"device_approval_code_request",
	"device_approval_code_submit",
	"device_approve",
	"device_refuse",
	"devices_list",
	"device_remove",
	"account_state",
	"account_sign_in",
	"account_sign_out",
	"agent_account",
	"agent_sign_in",
	"agent_sign_in_code",
	"agent_sign_in_cancel",
	"agent_live_sessions",
	"connection_set",
	"invitations_list",
	"invitation_accept",
	"invitation_decline",
	"update_state",
	"check_for_updates",
	"install_update",
	"release_notes",
	"running_companions",
	"conversation_local_ids",
];

static JOINED_SOURCES: LazyLock<JoinedSources> = LazyLock::new(JoinedSources::default);

#[derive(Clone)]
pub enum Source {
	InProcess(Arc<LocalCore>),
	Running(Host),
}

impl Source {
	pub fn invoke<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		match self.reaching(command) {
			Source::InProcess(core) => core.invoke(command, arguments),
			Source::Running(host) => host.invoke(command, arguments),
		}
	}

	pub fn invoke_turn<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		match self.reaching(command) {
			Source::InProcess(core) => core.invoke(command, arguments),
			Source::Running(host) => host.invoke_turn(command, arguments),
		}
	}

	fn reaching(&self, command: &str) -> &Source {
		match self {
			Source::Running(host) if LOCAL_COMMANDS.contains(&command) => {
				host.joined_space().map_or(self, Joined::local)
			}
			_ => self,
		}
	}

	pub fn running_profile(&self) -> Option<Profile> {
		match self {
			Source::InProcess(_) => None,
			Source::Running(host) => host.profile(),
		}
	}

	pub fn listen(&self, deliver: impl Fn(HostEvent) + Send + Sync + 'static) {
		match self {
			Source::InProcess(core) => core.listen(deliver),
			Source::Running(host) => match host.joined_space() {
				Some(joined) => deliver(HostEvent::Lost(format!(
					"joined Space {} streams its events through joined_sources().hear",
					joined.id()
				))),
				None => events::listen(host, deliver),
			},
		}
	}

	pub fn of_space(&self, space_id: &str) -> Source {
		JOINED_SOURCES.source_of(self, space_id)
	}
}

pub struct JoinedEvent {
	pub space_id: String,
	pub heard: JoinedHeard,
}

type Hearer = Arc<dyn Fn(JoinedEvent) + Send + Sync>;

struct Registered {
	host: Host,
	_stream: Option<Sender<()>>,
}

#[derive(Default)]
pub struct JoinedSources {
	spaces: Mutex<HashMap<String, Registered>>,
	hearer: Arc<Mutex<Option<Hearer>>>,
}

pub fn joined_sources() -> &'static JoinedSources {
	&JOINED_SOURCES
}

impl JoinedSources {
	pub fn hear(&self, deliver: impl Fn(JoinedEvent) + Send + Sync + 'static) {
		*self.hearer.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::new(deliver));
	}

	pub fn source_of(&self, local: &Source, space_id: &str) -> Source {
		let spaces = self.spaces.lock().unwrap_or_else(PoisonError::into_inner);
		spaces
			.get(space_id)
			.map_or_else(|| local.clone(), |registered| Source::Running(registered.host.clone()))
	}

	pub fn connect(
		&self,
		local: &Source,
		joined_id: &str,
	) -> Result<JoinedSpaceConnection, HostError> {
		let connection: JoinedSpaceConnection =
			local.invoke(JOINED_SPACE_CONNECT, json!({ "id": joined_id }))?;
		self.register(local, connection.clone());
		Ok(connection)
	}

	pub fn leave(&self, local: &Source, joined_id: &str) -> Result<(), HostError> {
		local.invoke::<()>(JOINED_SPACE_REMOVE, json!({ "id": joined_id }))?;
		self.spaces.lock().unwrap_or_else(PoisonError::into_inner).remove(joined_id);
		Ok(())
	}

	fn register(&self, local: &Source, connection: JoinedSpaceConnection) {
		let space_id = connection.id.clone();
		let host = Host::joined(local, connection);
		let mut spaces = self.spaces.lock().unwrap_or_else(PoisonError::into_inner);
		spaces.remove(&space_id);
		let stream = host
			.joined_space()
			.and_then(|joined| events::listen_joined(joined, self.delivered_as(&space_id)));
		spaces.insert(space_id, Registered { host, _stream: stream });
	}

	fn delivered_as(&self, space_id: &str) -> impl Fn(JoinedHeard) + Send + 'static {
		let (space_id, hearer) = (space_id.to_owned(), Arc::clone(&self.hearer));
		let has_warned = Cell::new(false);
		move |heard| {
			let held = hearer.lock().unwrap_or_else(PoisonError::into_inner).clone();
			match held {
				Some(hear) => hear(JoinedEvent { space_id: space_id.clone(), heard }),
				None if !has_warned.replace(true) => {
					eprintln!("no one hears the events of joined Space {space_id} yet");
				}
				None => {}
			}
		}
	}
}
