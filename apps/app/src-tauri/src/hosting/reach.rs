use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::db::repositories::space_children::SpaceChild::{
	self, Bot, BotHeldAlone, Conversation, Message, Mission, Routine, RoutineRun, Section, Turn,
};
use crate::db::{DatabaseError, DatabaseState};

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) enum Reach {
	HostOnly,
	Free,
	Scoped(&'static [Held]),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct Held {
	argument: &'static str,
	check: Check,
	is_optional: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Check {
	Space,
	Child(SpaceChild),
	PluginScope(SpaceChild),
	EnvOwner(SpaceChild),
	Absent,
}

impl Check {
	fn kind(self) -> String {
		match self {
			Check::Child(kind) => format!("{kind:?}"),
			Check::PluginScope(_) => "PluginScope".to_owned(),
			Check::EnvOwner(_) => "EnvOwner".to_owned(),
			check => format!("{check:?}"),
		}
	}
}

const fn space(argument: &'static str) -> Held {
	Held { argument, check: Check::Space, is_optional: false }
}

const fn child(kind: SpaceChild, argument: &'static str) -> Held {
	Held { argument, check: Check::Child(kind), is_optional: false }
}

const fn env_owner(kind: SpaceChild, argument: &'static str) -> Held {
	Held { argument, check: Check::EnvOwner(kind), is_optional: false }
}

const fn optional_child(kind: SpaceChild, argument: &'static str) -> Held {
	Held { argument, check: Check::Child(kind), is_optional: true }
}

const SPACE_ID: &[Held] = &[space("/spaceId")];
const QUERY_FILTER: &[Held] = &[space("/query/spaceId")];
const ENV_SCOPE: &[Held] = &[env_owner(Bot, "/scope")];
const ENV_WRITE_SCOPE: &[Held] = &[env_owner(BotHeldAlone, "/scope")];
const PLUGIN_SCOPE: &[Held] =
	&[Held { argument: "/scope", check: Check::PluginScope(Bot), is_optional: false }];
const PLUGIN_WRITE_SCOPE: &[Held] =
	&[Held { argument: "/scope", check: Check::PluginScope(BotHeldAlone), is_optional: false }];
const CONVERSATION_ID: &[Held] = &[child(Conversation, "/conversationId")];
const CONVERSATION_AND_BOT: &[Held] =
	&[child(Conversation, "/conversationId"), child(Bot, "/botId")];
const CONVERSATION_AND_MESSAGE: &[Held] =
	&[child(Conversation, "/conversationId"), child(Message, "/messageId")];
const RUNTIME_SCOPE: &[Held] =
	&[child(Conversation, "/scope/conversationId"), child(Bot, "/scope/botId")];
const RUNTIME_SCOPE_IN_THE_BOT_DIRECTORY: &[Held] = &[
	child(Conversation, "/scope/conversationId"),
	child(Bot, "/scope/botId"),
	Held { argument: "/cwd", check: Check::Absent, is_optional: true },
];
const NEW_MESSAGE: &[Held] = &[
	child(Conversation, "/message/conversationId"),
	child(Turn, "/message/turnId"),
	optional_child(Bot, "/message/authorBotId"),
	optional_child(Message, "/message/repliedToMessageId"),
];
const OPENING_MESSAGE: &[Held] = &[
	child(Conversation, "/message/conversationId"),
	optional_child(Bot, "/message/authorBotId"),
	optional_child(Message, "/message/repliedToMessageId"),
];
const BOT_ID: &[Held] = &[child(Bot, "/botId")];
const BOT_WRITE_AS_ID: &[Held] = &[child(BotHeldAlone, "/id")];
const BOT_AND_SPACE: &[Held] = &[child(Bot, "/botId"), space("/spaceId")];
const MESSAGE_AS_ID: &[Held] = &[child(Message, "/id")];
const MISSION_ID: &[Held] = &[child(Mission, "/missionId")];
const ROUTINE_AS_ID: &[Held] = &[child(Routine, "/id")];
const ROUTINE_RUN_ID: &[Held] = &[child(RoutineRun, "/runId")];
const SECTION_AS_ID: &[Held] = &[child(Section, "/id")];

pub(super) const REACHES: &[(&str, Reach)] = &[
	("account_state", Reach::HostOnly),
	("account_sign_in", Reach::HostOnly),
	("account_sign_out", Reach::HostOnly),
	("application_catalogue", Reach::Free),
	("application_search", Reach::Free),
	("application_named", Reach::Free),
	("application_installs", Reach::Scoped(CONVERSATION_ID)),
	("application_runnable", Reach::Free),
	("chat_store_attachments", Reach::Scoped(CONVERSATION_ID)),
	(
		"agent_check",
		Reach::Scoped(&[
			optional_child(Conversation, "/scope/conversationId"),
			optional_child(Bot, "/scope/botId"),
		]),
	),
	("agent_account", Reach::HostOnly),
	("agent_sign_in", Reach::HostOnly),
	("agent_sign_in_code", Reach::HostOnly),
	("agent_sign_in_cancel", Reach::HostOnly),
	("agent_models", Reach::Free),
	("agent_tools", Reach::Free),
	("agent_title", Reach::Free),
	("agent_start_or_resume_session", Reach::Scoped(RUNTIME_SCOPE_IN_THE_BOT_DIRECTORY)),
	(
		"agent_submit_prompt",
		Reach::Scoped(&[
			child(Conversation, "/scope/conversationId"),
			child(Bot, "/scope/botId"),
			optional_child(Turn, "/turn/turnId"),
		]),
	),
	("agent_cancel_turn", Reach::Scoped(RUNTIME_SCOPE)),
	("agent_respond_to_permission", Reach::Scoped(RUNTIME_SCOPE)),
	("agent_answer_question", Reach::Scoped(RUNTIME_SCOPE)),
	("agent_shutdown", Reach::Scoped(RUNTIME_SCOPE)),
	("agent_live_sessions", Reach::HostOnly),
	("agent_live_sessions_in_space", Reach::Scoped(SPACE_ID)),
	("agent_pending_questions", Reach::Scoped(CONVERSATION_ID)),
	("conversation_bots", Reach::Scoped(SPACE_ID)),
	(
		"conversation_bots_by_presence",
		Reach::Scoped(&[
			space("/spaceId"),
			optional_child(Conversation, "/excludedConversationId"),
		]),
	),
	("conversation_create_bot", Reach::Scoped(SPACE_ID)),
	("conversation_create_bot_from_draft", Reach::Scoped(SPACE_ID)),
	("conversation_suggested_bots", Reach::Free),
	("companion_launch_outcome", Reach::Free),
	("get_device_identity", Reach::HostOnly),
	("device_approval", Reach::HostOnly),
	("device_approval_retry", Reach::HostOnly),
	("device_approval_code_request", Reach::HostOnly),
	("device_approval_code_submit", Reach::HostOnly),
	("device_approve", Reach::HostOnly),
	("device_refuse", Reach::HostOnly),
	("devices_list", Reach::HostOnly),
	("device_remove", Reach::HostOnly),
	("window_declare_maximize_button", Reach::HostOnly),
	("diagnostics", Reach::HostOnly),
	("log_tail", Reach::HostOnly),
	("log_reveal", Reach::HostOnly),
	("log_clear", Reach::HostOnly),
	("conversation_duplicate_bot", Reach::Scoped(BOT_AND_SPACE)),
	("conversation_update_bot", Reach::Scoped(BOT_WRITE_AS_ID)),
	("conversation_delete_bot", Reach::Scoped(BOT_WRITE_AS_ID)),
	("conversation_set_bot_avatar_image", Reach::Scoped(BOT_WRITE_AS_ID)),
	("conversation_set_bot_memory", Reach::Scoped(BOT_WRITE_AS_ID)),
	("conversation_record_bot_commands", Reach::Scoped(&[child(BotHeldAlone, "/botId")])),
	("conversation_bot_commands", Reach::Scoped(BOT_ID)),
	("conversation_main_chat", Reach::Scoped(BOT_AND_SPACE)),
	(
		"conversation_create",
		Reach::Scoped(&[
			space("/spaceId"),
			optional_child(Section, "/sectionId"),
			child(Bot, "/botIds"),
		]),
	),
	("conversation_list", Reach::Scoped(SPACE_ID)),
	("conversation_mission_thread", Reach::HostOnly),
	("conversation_page", Reach::Scoped(SPACE_ID)),
	("conversation_local_ids", Reach::HostOnly),
	(
		"conversation_update",
		Reach::Scoped(&[
			child(Conversation, "/conversationId"),
			optional_child(Section, "/sectionId"),
		]),
	),
	("conversation_delete", Reach::Scoped(CONVERSATION_ID)),
	(
		"conversation_add_participant",
		Reach::Scoped(&[
			child(Conversation, "/conversationId"),
			child(Bot, "/botId"),
			optional_child(Bot, "/invitedByBotId"),
		]),
	),
	("conversation_remove_participant", Reach::Scoped(CONVERSATION_AND_BOT)),
	("conversation_set_lead", Reach::Scoped(CONVERSATION_AND_BOT)),
	("conversation_open_runtime_session", Reach::Scoped(CONVERSATION_AND_BOT)),
	("conversation_record_provider_session", Reach::Scoped(CONVERSATION_AND_BOT)),
	(
		"conversation_bounded_context",
		Reach::Scoped(&[
			child(Conversation, "/conversationId"),
			child(Bot, "/botId"),
			child(Message, "/promptMessageId"),
		]),
	),
	("conversation_roster_block", Reach::Scoped(CONVERSATION_AND_BOT)),
	("conversation_capture_checkpoint", Reach::Scoped(CONVERSATION_AND_BOT)),
	("conversation_message_page", Reach::Scoped(CONVERSATION_ID)),
	("conversation_message_page_around", Reach::Scoped(CONVERSATION_ID)),
	("conversation_message_reference", Reach::Scoped(CONVERSATION_AND_MESSAGE)),
	("conversation_message_header", Reach::Scoped(CONVERSATION_AND_MESSAGE)),
	("conversation_pin_message", Reach::Scoped(CONVERSATION_AND_MESSAGE)),
	("conversation_unpin_message", Reach::Scoped(CONVERSATION_AND_MESSAGE)),
	("conversation_pinned_messages", Reach::Scoped(CONVERSATION_ID)),
	("conversation_start_turn", Reach::Scoped(&[child(Conversation, "/turn/conversationId")])),
	("conversation_complete_turn", Reach::Scoped(&[child(Turn, "/id")])),
	("conversation_append_user_message", Reach::Scoped(NEW_MESSAGE)),
	("conversation_send_user_message", Reach::Scoped(OPENING_MESSAGE)),
	(
		"conversation_send_turn",
		Reach::Scoped(&[
			child(Conversation, "/message/conversationId"),
			optional_child(Message, "/message/repliedToMessageId"),
			child(Bot, "/summoned"),
		]),
	),
	("conversation_open_assistant_message", Reach::Scoped(NEW_MESSAGE)),
	("conversation_append_text", Reach::Scoped(MESSAGE_AS_ID)),
	("conversation_finalize_message", Reach::Scoped(MESSAGE_AS_ID)),
	("env_set", Reach::Scoped(ENV_WRITE_SCOPE)),
	("env_delete", Reach::Scoped(ENV_WRITE_SCOPE)),
	("env_list", Reach::Scoped(ENV_SCOPE)),
	("connection_set", Reach::HostOnly),
	("hosting_start", Reach::HostOnly),
	("hosting_stop", Reach::HostOnly),
	("hosting_state", Reach::Scoped(SPACE_ID)),
	("hosting_members", Reach::Scoped(SPACE_ID)),
	("hosting_invite_member", Reach::Scoped(SPACE_ID)),
	("hosting_withdraw_invitation", Reach::Scoped(SPACE_ID)),
	("hosting_resend_invitation", Reach::Scoped(SPACE_ID)),
	("hosting_remove_member", Reach::Scoped(SPACE_ID)),
	("hosting_invite_member_again", Reach::Scoped(SPACE_ID)),
	("hosting_devices", Reach::Scoped(SPACE_ID)),
	("hosting_remove_device", Reach::Scoped(SPACE_ID)),
	("invitations_list", Reach::HostOnly),
	("invitation_accept", Reach::HostOnly),
	("invitation_decline", Reach::HostOnly),
	("joined_spaces_list", Reach::HostOnly),
	("joined_space_connect", Reach::HostOnly),
	("joined_space_members", Reach::HostOnly),
	("joined_space_remove", Reach::HostOnly),
	("join_link_listen", Reach::HostOnly),
	("mcp_oauth_connect", Reach::HostOnly),
	("mcp_oauth_cancel", Reach::HostOnly),
	("mcp_oauth_disconnect", Reach::Scoped(&[env_owner(BotHeldAlone, "/owner")])),
	("mcp_application_status", Reach::Scoped(&[env_owner(Bot, "/owner")])),
	("mission_close", Reach::Scoped(MISSION_ID)),
	("mission_reopen", Reach::Scoped(MISSION_ID)),
	("mission_list", Reach::Scoped(CONVERSATION_ID)),
	("mission_detail", Reach::Scoped(MISSION_ID)),
	("mission_board", Reach::HostOnly),
	("mission_space_feed", Reach::Scoped(SPACE_ID)),
	("mission_space_page", Reach::Scoped(SPACE_ID)),
	("mission_unreported", Reach::HostOnly),
	("mission_reported", Reach::Scoped(&[child(Mission, "/missionId"), child(Turn, "/turnId")])),
	("mission_answered", Reach::Scoped(MISSION_ID)),
	("notification_show", Reach::HostOnly),
	("plugin_skills", Reach::Scoped(PLUGIN_SCOPE)),
	("plugin_create_skill", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_update_skill", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_set_skill_preloaded", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_delete_skill", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_skill_file", Reach::Scoped(PLUGIN_SCOPE)),
	("plugin_write_skill_file", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_delete_skill_file", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_mcp_servers", Reach::Scoped(PLUGIN_SCOPE)),
	("plugin_set_mcp_server", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_delete_mcp_server", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("plugin_history", Reach::Scoped(PLUGIN_SCOPE)),
	("plugin_history_diff", Reach::Scoped(PLUGIN_SCOPE)),
	("plugin_revert", Reach::Scoped(PLUGIN_WRITE_SCOPE)),
	("routine_trigger_sources", Reach::Scoped(BOT_ID)),
	("routine_trigger_sources_of_space", Reach::Scoped(SPACE_ID)),
	(
		"routine_create",
		Reach::Scoped(&[child(Conversation, "/draft/conversationId"), child(Bot, "/draft/botId")]),
	),
	("routine_update", Reach::Scoped(ROUTINE_AS_ID)),
	("routine_delete", Reach::Scoped(ROUTINE_AS_ID)),
	("routine_list", Reach::Scoped(CONVERSATION_ID)),
	("routine_runs", Reach::Scoped(&[child(Routine, "/routineId")])),
	("routine_runs_of_space", Reach::Scoped(SPACE_ID)),
	("routine_reported_runs", Reach::Scoped(CONVERSATION_ID)),
	("routine_run_now", Reach::Scoped(ROUTINE_AS_ID)),
	("routine_renew_lease", Reach::Scoped(ROUTINE_RUN_ID)),
	("routine_close_run", Reach::Scoped(ROUTINE_RUN_ID)),
	("routine_key", Reach::Scoped(ROUTINE_AS_ID)),
	("search_catalogue", Reach::Scoped(SPACE_ID)),
	("search_messages", Reach::Scoped(QUERY_FILTER)),
	("search_recent", Reach::Scoped(SPACE_ID)),
	("section_list", Reach::Scoped(SPACE_ID)),
	("section_create", Reach::Scoped(SPACE_ID)),
	("section_rename", Reach::Scoped(SECTION_AS_ID)),
	("roster_pin", Reach::Scoped(SPACE_ID)),
	("section_delete", Reach::Scoped(SECTION_AS_ID)),
	(
		"bot_move_to_section",
		Reach::Scoped(&[
			child(Bot, "/botId"),
			optional_child(Section, "/sectionId"),
			space("/spaceId"),
		]),
	),
	("space_list", Reach::HostOnly),
	("space_create", Reach::HostOnly),
	("space_update", Reach::Scoped(&[space("/id")])),
	("space_reorder", Reach::HostOnly),
	("space_delete", Reach::HostOnly),
	("space_export", Reach::HostOnly),
	("space_import", Reach::HostOnly),
	("bot_move_to_space", Reach::Scoped(&[child(BotHeldAlone, "/botId"), space("/spaceId")])),
	(
		"bot_add_to_space",
		Reach::Scoped(&[
			child(Bot, "/botId"),
			space("/spaceId"),
			optional_child(Section, "/sectionId"),
		]),
	),
	("bot_remove_from_space", Reach::Scoped(BOT_AND_SPACE)),
	("space_preferences", Reach::Scoped(SPACE_ID)),
	("space_set_preferences", Reach::Scoped(SPACE_ID)),
	("user_preferences", Reach::HostOnly),
	("user_set_preferences", Reach::HostOnly),
	("user_set_profile_picture", Reach::HostOnly),
	("update_state", Reach::HostOnly),
	("check_for_updates", Reach::HostOnly),
	("install_update", Reach::HostOnly),
	("release_notes", Reach::HostOnly),
	("running_companions", Reach::HostOnly),
];

#[derive(Clone, Copy)]
pub(super) enum Audience {
	HostOnly,
	Scoped(Held),
	ScopedOrHostWide(Held),
}

const IN_THE_CONVERSATION: Audience = Audience::Scoped(child(Conversation, "/conversationId"));
const IN_THE_SPACE: Audience = Audience::Scoped(space("/spaceId"));

pub(super) const AUDIENCES: &[(&str, Audience)] = &[
	(crate::account::contract::CHANGED_EVENT, Audience::HostOnly),
	(crate::devices::contract::APPROVAL_CHANGED_EVENT, Audience::HostOnly),
	(crate::devices::contract::APPROVAL_REQUESTED_EVENT, Audience::HostOnly),
	(crate::devices::contract::APPROVAL_SETTLED_EVENT, Audience::HostOnly),
	(
		crate::agent::commands::EVENT_CHANNEL,
		Audience::ScopedOrHostWide(child(Conversation, "/scope/conversationId")),
	),
	(crate::agent::sign_in::SIGN_IN_STARTED_CHANNEL, Audience::HostOnly),
	(crate::applications::contract::INSTALLED_EVENT, IN_THE_CONVERSATION),
	(crate::applications::contract::DIRECTORY_REFRESHED_EVENT, Audience::HostOnly),
	(crate::companions::contract::CREATED_EVENT, Audience::Scoped(child(Bot, "/id"))),
	(crate::companions::contract::DELETED_EVENT, IN_THE_SPACE),
	(crate::companions::contract::SEED_REFUSED_EVENT, Audience::HostOnly),
	(crate::companions::contract::UPDATED_EVENT, Audience::Scoped(child(Bot, "/id"))),
	(crate::conversations::contract::COMPANION_ARRIVED_EVENT, IN_THE_CONVERSATION),
	(crate::conversations::contract::COMPANION_SPOKE_EVENT, IN_THE_CONVERSATION),
	(crate::conversations::contract::CREATED_EVENT, IN_THE_SPACE),
	(crate::conversations::contract::DELETED_EVENT, IN_THE_SPACE),
	(crate::conversations::contract::MESSAGE_STORED_EVENT, IN_THE_CONVERSATION),
	(crate::conversations::contract::UPDATED_EVENT, IN_THE_SPACE),
	(super::contract::CHANGED_EVENT, Audience::Scoped(space("/spaceId"))),
	(super::contract::MEMBERS_CHANGED_EVENT, IN_THE_SPACE),
	(crate::invitations::contract::CHANGED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::commands::CHANGED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::members::MEMBERS_CHANGED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::commands::RECONNECTED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::commands::REMOVED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::deep_link::OPENED_EVENT, Audience::HostOnly),
	(crate::missions::commands::CHANGED_EVENT, Audience::Scoped(child(Mission, "/missionId"))),
	(crate::notifications::commands::ACTIVATED_EVENT, Audience::HostOnly),
	(crate::routines::commands::CHANGED_EVENT, IN_THE_CONVERSATION),
	(crate::companions::contract::FIRST_RUN_DONE_EVENT, Audience::HostOnly),
	(crate::window_controls::MAXIMIZE_BUTTON_EVENT, Audience::HostOnly),
	(crate::updates::contract::CHANGED_EVENT, Audience::HostOnly),
];

pub(super) fn reach_of(command: &str) -> Option<Reach> {
	REACHES.iter().find(|(name, _)| *name == command).map(|(_, reach)| *reach)
}

fn audience_of(event: &str) -> Option<Audience> {
	AUDIENCES.iter().find(|(name, _)| *name == event).map(|(_, audience)| *audience)
}

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Refusal {
	NoReach,
	HostOnly,
	Unheld { held: Held, offending: Offending },
}

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Offending {
	Absent,
	Value(Value),
}

const LOGGED_VALUE_LIMIT: usize = 200;

pub(super) fn refusal_line(command: &str, shared_space_id: &str, refusal: &Refusal) -> String {
	let reason = match refusal {
		Refusal::NoReach => "it has no reach".to_owned(),
		Refusal::HostOnly => "its reach is HostOnly".to_owned(),
		Refusal::Unheld { held, offending } => {
			let value = match offending {
				Offending::Absent => "absent".to_owned(),
				Offending::Value(value) => {
					value.to_string().chars().take(LOGGED_VALUE_LIMIT).collect()
				}
			};
			format!("{} failed the {} check with {value}", held.argument, held.check.kind())
		}
	};
	format!("the relayed {command} was refused outside shared space {shared_space_id}: {reason}")
}

pub(super) async fn stays_in_the_shared_space<R: Runtime>(
	app: &AppHandle<R>,
	shared_space_id: &str,
	command: &str,
	args: &Value,
) -> Result<(), Refusal> {
	let helds = match reach_of(command) {
		Some(Reach::Scoped(helds)) => helds,
		Some(Reach::Free) => return Ok(()),
		Some(Reach::HostOnly) => return Err(Refusal::HostOnly),
		None => return Err(Refusal::NoReach),
	};
	let lookup = Lookup { app, shared_space_id, relayed: command };
	for held in helds {
		lookup
			.checked(held, args.pointer(held.argument))
			.await
			.map_err(|offending| Refusal::Unheld { held: *held, offending })?;
	}
	Ok(())
}

#[derive(Deserialize)]
struct Published {
	event: String,
	#[serde(default)]
	payload: Value,
}

pub(super) struct GuestEvents {
	shared_space_id: String,
	held_children: HashMap<(SpaceChild, String), bool>,
}

impl GuestEvents {
	pub(super) fn new(shared_space_id: &str) -> Self {
		Self { shared_space_id: shared_space_id.to_owned(), held_children: HashMap::new() }
	}

	pub(super) async fn reach_the_guest<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		frame: &str,
	) -> bool {
		let published = match serde_json::from_str::<Published>(frame) {
			Ok(published) => published,
			Err(error) => return self.kept_off("without a readable name", &error.to_string()),
		};
		let event = published.event.as_str();
		let (held, scope) = match verdict(event, &published.payload) {
			Verdict::HostOnly => return false,
			Verdict::KeptOff(reason) => return self.kept_off(event, &reason),
			Verdict::Scoped(held, scope) => (held, scope),
		};
		let lookup = Lookup { app, shared_space_id: &self.shared_space_id, relayed: event };
		match (held.check, scope) {
			(Check::Child(kind), Value::String(child_id)) if never_changes_space(kind) => {
				let key = (kind, child_id.to_owned());
				if let Some(is_held) = self.held_children.get(&key) {
					return *is_held;
				}
				let Some(is_held) = lookup.resolved_child(kind, child_id).await else {
					return false;
				};
				self.held_children.insert(key, is_held);
				is_held
			}
			_ => lookup.holds(&held, Some(scope)).await,
		}
	}

	fn kept_off(&self, event: &str, reason: &str) -> bool {
		eprintln!(
			"the event {event} was kept off the relay of space {}: {reason}",
			self.shared_space_id
		);
		false
	}
}

#[derive(Debug, PartialEq)]
pub(super) enum Verdict<'a> {
	HostOnly,
	KeptOff(String),
	Scoped(Held, &'a Value),
}

pub(super) fn verdict<'a>(event: &str, payload: &'a Value) -> Verdict<'a> {
	let Some(audience) = audience_of(event) else {
		return Verdict::KeptOff("no audience classifies it".to_owned());
	};
	let held = match audience {
		Audience::Scoped(held) | Audience::ScopedOrHostWide(held) => held,
		Audience::HostOnly => return Verdict::HostOnly,
	};
	match payload.pointer(held.argument).filter(|scope| !scope.is_null()) {
		Some(scope) => Verdict::Scoped(held, scope),
		None if matches!(audience, Audience::ScopedOrHostWide(_)) => Verdict::HostOnly,
		None => Verdict::KeptOff(format!("its payload carries no {}", held.argument)),
	}
}

fn never_changes_space(kind: SpaceChild) -> bool {
	!matches!(kind, Bot | BotHeldAlone)
}

struct Lookup<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	shared_space_id: &'a str,
	relayed: &'a str,
}

impl<R: Runtime> Lookup<'_, R> {
	async fn holds(&self, held: &Held, value: Option<&Value>) -> bool {
		self.checked(held, value).await.is_ok()
	}

	async fn checked(&self, held: &Held, value: Option<&Value>) -> Result<(), Offending> {
		let Some(value) = value.filter(|value| !value.is_null()) else {
			return if held.is_optional { Ok(()) } else { Err(Offending::Absent) };
		};
		let is_held = match (held.check, value) {
			(Check::Absent, _) => false,
			(Check::Space, Value::String(space_id)) => space_id == self.shared_space_id,
			(Check::Child(kind), Value::String(child_id)) => self.holds_child(kind, child_id).await,
			(Check::Child(kind), Value::Array(child_ids)) => {
				return self.holds_children(kind, child_ids).await;
			}
			(Check::PluginScope(bot_kind), scope) => {
				match (scope["kind"].as_str(), scope["id"].as_str()) {
					(Some("space"), Some(space_id)) => space_id == self.shared_space_id,
					(Some("bot"), Some(bot_id)) => self.holds_child(bot_kind, bot_id).await,
					_ => false,
				}
			}
			(Check::EnvOwner(bot_kind), scope) => {
				match (scope["kind"].as_str(), scope["id"].as_str()) {
					(Some("space"), Some(space_id)) => space_id == self.shared_space_id,
					(Some("bot"), Some(bot_id)) => {
						scope["spaceId"] == self.shared_space_id
							&& self.holds_child(bot_kind, bot_id).await
					}
					_ => false,
				}
			}
			_ => false,
		};
		if is_held {
			Ok(())
		} else {
			Err(Offending::Value(value.clone()))
		}
	}

	async fn holds_children(&self, kind: SpaceChild, child_ids: &[Value]) -> Result<(), Offending> {
		for child_id in child_ids {
			let is_held = match child_id.as_str() {
				Some(child_id) => self.holds_child(kind, child_id).await,
				None => false,
			};
			if !is_held {
				return Err(Offending::Value(child_id.clone()));
			}
		}
		Ok(())
	}

	async fn holds_child(&self, kind: SpaceChild, child_id: &str) -> bool {
		self.resolved_child(kind, child_id).await == Some(true)
	}

	async fn resolved_child(&self, kind: SpaceChild, child_id: &str) -> Option<bool> {
		let state = self.app.state::<DatabaseState>();
		let database = match state.as_ref() {
			Ok(database) => database,
			Err(failure) => return self.unresolved(kind, failure),
		};
		let shared_space_id = self.shared_space_id.to_owned();
		match database.space_children().holds(shared_space_id, kind, child_id.to_owned()).await {
			Ok(is_held) => Some(is_held),
			Err(failure) => self.unresolved(kind, &failure),
		}
	}

	fn unresolved(&self, kind: SpaceChild, failure: &DatabaseError) -> Option<bool> {
		eprintln!(
			"the relayed {} was refused: the {kind:?} lookup in shared space {} failed: {failure:?}",
			self.relayed, self.shared_space_id
		);
		None
	}
}
