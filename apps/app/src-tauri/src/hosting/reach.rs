use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use super::authorship;
use super::replay::Addressee;
use crate::db::repositories::conversations::ChatOwner;
use crate::db::repositories::space_children::SpaceChild::{
	self, Bot, BotHeldAlone, Conversation, Message, Mission, Routine, RoutineRun, Section, Turn,
};
use crate::db::{DatabaseError, DatabaseState};
use crate::events::Frame;

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
	ChildOfEach(SpaceChild, &'static str),
	PluginScope(SpaceChild),
	EnvOwner(SpaceChild),
	Absent,
}

impl Check {
	fn kind(self) -> String {
		match self {
			Check::Child(kind) | Check::ChildOfEach(kind, _) => format!("{kind:?}"),
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

const REPLY_LINKS: Held = Held {
	argument: "/message/replyLinks",
	check: Check::ChildOfEach(Message, "/messageId"),
	is_optional: true,
};

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
const RUNTIME_SCOPE_ON_THE_BOT_TERMS: &[Held] = &[
	child(Conversation, "/scope/conversationId"),
	child(Bot, "/scope/botId"),
	Held { argument: "/cwd", check: Check::Absent, is_optional: true },
	Held { argument: "/permissionMode", check: Check::Absent, is_optional: true },
];
const NEW_MESSAGE: &[Held] = &[
	child(Conversation, "/message/conversationId"),
	child(Turn, "/message/turnId"),
	optional_child(Bot, "/message/authorBotId"),
	optional_child(Message, "/message/repliedToMessageId"),
	optional_child(Message, "/message/repliedToMessageIds"),
	REPLY_LINKS,
];
const OPENING_MESSAGE: &[Held] = &[
	child(Conversation, "/message/conversationId"),
	optional_child(Bot, "/message/authorBotId"),
	optional_child(Message, "/message/repliedToMessageId"),
	optional_child(Message, "/message/repliedToMessageIds"),
	REPLY_LINKS,
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
	("remote_image_read", Reach::HostOnly),
	("library_list", Reach::Scoped(SPACE_ID)),
	("library_read_document", Reach::Scoped(SPACE_ID)),
	("library_read_image", Reach::Scoped(SPACE_ID)),
	("library_read_file", Reach::Scoped(SPACE_ID)),
	("library_templates", Reach::Free),
	("library_create_document", Reach::Scoped(SPACE_ID)),
	("library_create_board", Reach::Scoped(SPACE_ID)),
	("library_board_summary", Reach::Scoped(SPACE_ID)),
	("library_open_document", Reach::Scoped(SPACE_ID)),
	("library_apply_update", Reach::Scoped(SPACE_ID)),
	("library_share_presence", Reach::Scoped(SPACE_ID)),
	("library_stop_writers", Reach::Scoped(SPACE_ID)),
	("library_read_thumbnail", Reach::Scoped(SPACE_ID)),
	("library_import", Reach::Scoped(SPACE_ID)),
	("library_import_url", Reach::Scoped(SPACE_ID)),
	("library_import_paths", Reach::HostOnly),
	("library_read_picked_image", Reach::HostOnly),
	("library_rename_document", Reach::Scoped(SPACE_ID)),
	("library_rename_board", Reach::Scoped(SPACE_ID)),
	("library_save_message", Reach::Scoped(CONVERSATION_AND_MESSAGE)),
	("library_delete", Reach::Scoped(SPACE_ID)),
	("library_comment_threads", Reach::Scoped(SPACE_ID)),
	("library_comment_counts", Reach::Scoped(SPACE_ID)),
	("library_comment_agent_turns", Reach::Scoped(SPACE_ID)),
	("library_comment_create", Reach::Scoped(SPACE_ID)),
	("library_comment_reply", Reach::Scoped(SPACE_ID)),
	("library_comment_resolve", Reach::Scoped(SPACE_ID)),
	("library_comment_reopen", Reach::Scoped(SPACE_ID)),
	("library_save", Reach::HostOnly),
	("library_copy", Reach::HostOnly),
	("library_reveal", Reach::HostOnly),
	("library_save_bytes", Reach::HostOnly),
	("library_copy_bytes", Reach::HostOnly),
	("library_read_link_preview", Reach::HostOnly),
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
	("agent_start_or_resume_session", Reach::Scoped(RUNTIME_SCOPE_ON_THE_BOT_TERMS)),
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
	("agent_pending_questions_in_space", Reach::Scoped(SPACE_ID)),
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
	("window_open", Reach::HostOnly),
	("window_identity", Reach::HostOnly),
	("window_report_space", Reach::HostOnly),
	("window_report_strip", Reach::HostOnly),
	("window_strip_at", Reach::HostOnly),
	("window_tab_drag_start", Reach::HostOnly),
	("window_tab_drag_move", Reach::HostOnly),
	("window_tab_drag_drop", Reach::HostOnly),
	("window_tab_drag_cancel", Reach::HostOnly),
	("window_start_native_move", Reach::HostOnly),
	("window_hide", Reach::HostOnly),
	("window_show", Reach::HostOnly),
	("drag_ghost_show", Reach::HostOnly),
	("drag_ghost_tab", Reach::HostOnly),
	("drag_ghost_move", Reach::HostOnly),
	("drag_ghost_hide", Reach::HostOnly),
	("library_screenshot_job", Reach::HostOnly),
	("library_screenshot_answer", Reach::HostOnly),
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
	("conversation_renew_main_chat", Reach::Scoped(BOT_AND_SPACE)),
	("conversation_solo_states", Reach::Scoped(SPACE_ID)),
	("conversation_agent_rooms", Reach::Scoped(SPACE_ID)),
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
	("conversation_today_of_agent", Reach::Scoped(BOT_AND_SPACE)),
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
			optional_child(Message, "/message/repliedToMessageIds"),
			REPLY_LINKS,
			child(Bot, "/summoned"),
		]),
	),
	("conversation_serve_awaited_runs", Reach::HostOnly),
	("conversation_claim_unseen_drops", Reach::HostOnly),
	(
		"conversation_drop_summons",
		Reach::Scoped(&[
			child(Conversation, "/conversationId"),
			child(Turn, "/turnId"),
			child(Bot, "/botId"),
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
	("joined_space_describe", Reach::HostOnly),
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
	("mission_run_claim", Reach::HostOnly),
	("mission_run_release", Reach::HostOnly),
	("notification_show", Reach::HostOnly),
	("badge_set", Reach::HostOnly),
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
	("space_companion_counts", Reach::Scoped(SPACE_ID)),
	("user_preferences", Reach::HostOnly),
	("user_set_preferences", Reach::HostOnly),
	("user_set_profile_picture", Reach::HostOnly),
	("user_set_onboarding_step", Reach::HostOnly),
	("user_set_sidebar_collapsed", Reach::HostOnly),
	("user_replay_onboarding", Reach::HostOnly),
	("user_set_onboarding_first_companion", Reach::HostOnly),
	("user_mark_onboarding_import_seen", Reach::HostOnly),
	("claude_import_inventory", Reach::HostOnly),
	("claude_import_run", Reach::HostOnly),
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
	(crate::conversations::contract::SUMMONS_DROPPED_EVENT, IN_THE_CONVERSATION),
	(crate::conversations::contract::CREATED_EVENT, IN_THE_SPACE),
	(crate::conversations::contract::DELETED_EVENT, IN_THE_SPACE),
	(crate::conversations::contract::MESSAGE_STORED_EVENT, IN_THE_CONVERSATION),
	(crate::conversations::contract::UPDATED_EVENT, IN_THE_SPACE),
	(crate::conversations::contract::STATE_CHANGED_EVENT, IN_THE_SPACE),
	(crate::conversations::contract::AGENT_ROOMS_CHANGED_EVENT, IN_THE_SPACE),
	(super::contract::CHANGED_EVENT, Audience::Scoped(space("/spaceId"))),
	(super::contract::MEMBERS_CHANGED_EVENT, IN_THE_SPACE),
	(crate::invitations::contract::CHANGED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::commands::CHANGED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::members::MEMBERS_CHANGED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::commands::RECONNECTED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::commands::REMOVED_EVENT, Audience::HostOnly),
	(crate::joined_spaces::deep_link::OPENED_EVENT, Audience::HostOnly),
	(crate::library::contract::DOCUMENT_UPDATED_EVENT, IN_THE_SPACE),
	(crate::library::contract::DOCUMENT_RENAMED_EVENT, IN_THE_SPACE),
	(crate::library::contract::BOARD_FILE_REPLACED_EVENT, IN_THE_SPACE),
	(crate::library::contract::DOCUMENT_PRESENCE_EVENT, IN_THE_SPACE),
	(crate::library::contract::DOCUMENT_WRITER_FINISHED_EVENT, IN_THE_SPACE),
	(crate::library::contract::CHANGED_EVENT, IN_THE_SPACE),
	(crate::library::contract::COMMENT_THREAD_CHANGED_EVENT, IN_THE_SPACE),
	(crate::library::contract::COMMENT_AGENT_TURNS_CHANGED_EVENT, IN_THE_SPACE),
	(crate::library::contract::COMMENT_MENTIONED_EVENT, IN_THE_SPACE),
	(crate::library::contract::COMMENT_MENTION_OPENED_EVENT, Audience::HostOnly),
	(crate::missions::commands::CHANGED_EVENT, Audience::Scoped(child(Mission, "/missionId"))),
	(crate::notifications::commands::ACTIVATED_EVENT, Audience::HostOnly),
	(crate::routines::commands::CHANGED_EVENT, IN_THE_CONVERSATION),
	(crate::spaces::contract::DESCRIBED_EVENT, IN_THE_SPACE),
	(crate::companions::contract::FIRST_RUN_DONE_EVENT, Audience::HostOnly),
	(crate::window_controls::MAXIMIZE_BUTTON_EVENT, Audience::HostOnly),
	(crate::window_controls::drag_ghost::TAB_EVENT, Audience::HostOnly),
	(crate::window_controls::drag_ghost::ENDED_EVENT, Audience::HostOnly),
	(crate::updates::contract::CHANGED_EVENT, Audience::HostOnly),
	(crate::user::contract::PREFERENCES_CHANGED_EVENT, Audience::HostOnly),
	(crate::menu_contract::FILE_MENU_EVENT, Audience::HostOnly),
	(crate::window_controls::tab_drag::TAB_DRAG_EVENT, Audience::HostOnly),
	(crate::window_controls::native_move::NATIVE_MOVE_ENDED_EVENT, Audience::HostOnly),
	(crate::window_controls::native_move::NATIVE_MOVE_FAILED_EVENT, Audience::HostOnly),
	(crate::claude_import::contract::PROGRESS_EVENT, Audience::HostOnly),
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
	NotOwned { held: Held },
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
		Refusal::NotOwned { held } => {
			format!("{} names the main conversation of another person", held.argument)
		}
	};
	format!("the relayed {command} was refused outside shared space {shared_space_id}: {reason}")
}

pub(super) async fn stays_in_the_shared_space<R: Runtime>(
	app: &AppHandle<R>,
	shared_space_id: &str,
	caller: &ChatOwner,
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
	for held in helds {
		if !lookup.is_owned_by(caller, held, args.pointer(held.argument)).await {
			return Err(Refusal::NotOwned { held: *held });
		}
	}
	Ok(())
}

#[derive(Deserialize, Serialize)]
struct Published {
	event: String,
	#[serde(default)]
	payload: Value,
}

impl Published {
	fn with_list(&self, conversation_ids: Vec<Value>) -> serde_json::Result<Frame> {
		let mut payload = self.payload.clone();
		if let Some(listed) = payload.pointer_mut(CONVERSATION_LIST_POINTER) {
			*listed = Value::Array(conversation_ids);
		}
		let tailored = Published { event: self.event.clone(), payload };
		Ok(serde_json::to_string(&tailored)?.into())
	}
}

const CONVERSATION_POINTERS: [&str; 3] =
	["/conversationId", "/conversation/id", "/scope/conversationId"];

const CONVERSATION_LIST_POINTER: &str = "/conversationIds";

#[derive(Clone, Copy)]
enum Naming {
	One(&'static str),
	Each(&'static str),
}

struct AnswerList {
	command: &'static str,
	items: &'static str,
	naming: Naming,
}

const ANSWER_LISTS: &[AnswerList] = &[
	AnswerList {
		command: "conversation_agent_rooms",
		items: "",
		naming: Naming::Each(CONVERSATION_LIST_POINTER),
	},
	AnswerList { command: "mission_space_feed", items: "", naming: Naming::One("/conversationId") },
	AnswerList {
		command: "mission_space_page",
		items: "/missions",
		naming: Naming::One("/conversationId"),
	},
];

pub(super) async fn answer_shown_to<R: Runtime>(
	app: &AppHandle<R>,
	shared_space_id: &str,
	caller: &ChatOwner,
	command: &str,
	mut body: Value,
) -> Option<Value> {
	let Some(list) = ANSWER_LISTS.iter().find(|list| list.command == command) else {
		return Some(body);
	};
	let Some(Value::Array(listed)) = body.pointer_mut(list.items) else {
		log::warn!("the relayed {command} answer holds no list at {}", list.items);
		return None;
	};
	let lookup = Lookup { app, shared_space_id, relayed: command };
	let mut kept = Vec::with_capacity(listed.len());
	for mut item in std::mem::take(listed) {
		if lookup.item_shown_to(caller, list.naming, &mut item).await? {
			kept.push(item);
		}
	}
	*listed = kept;
	Some(body)
}

#[derive(Debug, Clone, PartialEq)]
enum Readers {
	Everyone,
	Owner(String),
	Nobody,
}

impl Readers {
	fn owner(&self) -> Option<&str> {
		match self {
			Readers::Owner(account_id) => Some(account_id),
			_ => None,
		}
	}

	fn is_shown_to(&self, reader: Option<&str>) -> bool {
		match self {
			Readers::Everyone => true,
			Readers::Owner(account_id) => reader == Some(account_id.as_str()),
			Readers::Nobody => false,
		}
	}
}

pub(super) struct GuestEvents {
	shared_space_id: String,
	held_children: HashMap<(SpaceChild, String), bool>,
	main_owners: HashMap<String, Option<ChatOwner>>,
}

impl GuestEvents {
	pub(super) fn new(shared_space_id: &str) -> Self {
		Self {
			shared_space_id: shared_space_id.to_owned(),
			held_children: HashMap::new(),
			main_owners: HashMap::new(),
		}
	}

	pub(super) async fn reach_the_guest<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		frame: &Frame,
	) -> Vec<(Frame, Addressee)> {
		let published = match serde_json::from_str::<Published>(frame) {
			Ok(published) => published,
			Err(error) => {
				self.kept_off("without a readable name", &error.to_string());
				return Vec::new();
			}
		};
		if !self.holds_the_guest(app, &published).await {
			return Vec::new();
		}
		if let Some(Value::Array(listed)) = published.payload.pointer(CONVERSATION_LIST_POINTER) {
			return self.tailored(app, frame, &published, listed).await;
		}
		let addressee = self.addressee(app, &published).await;
		addressee.map(|addressee| (frame.clone(), addressee)).into_iter().collect()
	}

	async fn addressee<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		published: &Published,
	) -> Option<Addressee> {
		let named = CONVERSATION_POINTERS
			.iter()
			.find_map(|pointer| published.payload.pointer(pointer).and_then(Value::as_str));
		let Some(conversation_id) = named else {
			return Some(Addressee::Everyone);
		};
		match self.shown(app, &published.event, conversation_id).await? {
			Readers::Everyone => Some(Addressee::Everyone),
			Readers::Owner(account_id) => Some(Addressee::Account(account_id)),
			Readers::Nobody => None,
		}
	}

	async fn tailored<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		frame: &Frame,
		published: &Published,
		listed: &[Value],
	) -> Vec<(Frame, Addressee)> {
		let Some(shown) = self.all_shown(app, &published.event, listed).await else {
			return Vec::new();
		};
		if shown.iter().all(|(_, seen)| *seen == Readers::Everyone) {
			return vec![(frame.clone(), Addressee::Everyone)];
		}
		let owners: BTreeSet<&str> = shown.iter().filter_map(|(_, seen)| seen.owner()).collect();
		let rest = if owners.is_empty() {
			Addressee::Everyone
		} else {
			Addressee::EveryoneBut(owners.iter().map(|owner| (*owner).to_owned()).collect())
		};
		let mut frames = Vec::with_capacity(owners.len() + 1);
		for reader in owners.iter().map(|owner| Some(*owner)).chain([None]) {
			let ids = shown
				.iter()
				.filter(|(_, seen)| seen.is_shown_to(reader))
				.map(|(conversation_id, _)| Value::from(conversation_id.as_str()))
				.collect();
			let addressee =
				reader.map_or(rest.clone(), |owner| Addressee::Account(owner.to_owned()));
			match published.with_list(ids) {
				Ok(tailored) => frames.push((tailored, addressee)),
				Err(error) => {
					self.kept_off(&published.event, &error.to_string());
					return Vec::new();
				}
			}
		}
		frames
	}

	async fn all_shown<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		event: &str,
		listed: &[Value],
	) -> Option<Vec<(String, Readers)>> {
		let mut shown = Vec::with_capacity(listed.len());
		for conversation_id in listed {
			let Some(conversation_id) = conversation_id.as_str() else {
				self.kept_off(event, "its conversationIds hold a value that is no id");
				return None;
			};
			let seen = self.shown(app, event, conversation_id).await?;
			shown.push((conversation_id.to_owned(), seen));
		}
		Some(shown)
	}

	async fn shown<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		event: &str,
		conversation_id: &str,
	) -> Option<Readers> {
		let owner = match self.main_owners.get(conversation_id) {
			Some(owner) => owner.clone(),
			None => {
				let lookup = Lookup { app, shared_space_id: &self.shared_space_id, relayed: event };
				let owner = lookup.resolved_owner(Conversation, conversation_id).await?;
				self.main_owners.insert(conversation_id.to_owned(), owner.clone());
				owner
			}
		};
		Some(match owner {
			None => Readers::Everyone,
			Some(owner) => {
				authorship::account_of(app, &owner).map_or(Readers::Nobody, Readers::Owner)
			}
		})
	}

	async fn holds_the_guest<R: Runtime>(
		&mut self,
		app: &AppHandle<R>,
		published: &Published,
	) -> bool {
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
		log::warn!(
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
				return self.holds_children(kind, child_ids, "").await;
			}
			(Check::ChildOfEach(kind, child_id), Value::Array(items)) => {
				return self.holds_children(kind, items, child_id).await;
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

	async fn is_owned_by(&self, caller: &ChatOwner, held: &Held, value: Option<&Value>) -> bool {
		let (Check::Child(kind), Some(Value::String(child_id))) = (held.check, value) else {
			return true;
		};
		self.is_shown_to(caller, kind, child_id).await == Some(true)
	}

	async fn is_shown_to(
		&self,
		caller: &ChatOwner,
		kind: SpaceChild,
		child_id: &str,
	) -> Option<bool> {
		let owner = self.resolved_owner(kind, child_id).await?;
		Some(owner.is_none_or(|owner| &owner == caller))
	}

	async fn item_shown_to(
		&self,
		caller: &ChatOwner,
		naming: Naming,
		item: &mut Value,
	) -> Option<bool> {
		match naming {
			Naming::One(pointer) => match item.pointer(pointer).and_then(Value::as_str) {
				Some(conversation_id) => {
					self.is_shown_to(caller, Conversation, conversation_id).await
				}
				None => Some(false),
			},
			Naming::Each(pointer) => {
				let Some(Value::Array(listed)) = item.pointer_mut(pointer) else {
					return Some(false);
				};
				let mut kept = Vec::with_capacity(listed.len());
				for named in std::mem::take(listed) {
					let Some(conversation_id) = named.as_str() else {
						continue;
					};
					if self.is_shown_to(caller, Conversation, conversation_id).await? {
						kept.push(named);
					}
				}
				let is_shown = !kept.is_empty();
				*listed = kept;
				Some(is_shown)
			}
		}
	}

	async fn resolved_owner(&self, kind: SpaceChild, child_id: &str) -> Option<Option<ChatOwner>> {
		let state = self.app.state::<DatabaseState>();
		let database = match state.as_ref() {
			Ok(database) => database,
			Err(failure) => {
				self.unresolved(kind, failure);
				return None;
			}
		};
		match database.space_children().main_owner(kind, child_id.to_owned()).await {
			Ok(owner) => Some(owner),
			Err(failure) => {
				self.unresolved(kind, &failure);
				None
			}
		}
	}

	async fn holds_children(
		&self,
		kind: SpaceChild,
		items: &[Value],
		child_id: &str,
	) -> Result<(), Offending> {
		for item in items {
			let is_held = match item.pointer(child_id).and_then(Value::as_str) {
				Some(child_id) => self.holds_child(kind, child_id).await,
				None => false,
			};
			if !is_held {
				return Err(Offending::Value(item.clone()));
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
		log::warn!(
			"the relayed {} was refused: the {kind:?} lookup in shared space {} failed: {failure:?}",
			self.relayed, self.shared_space_id
		);
		None
	}
}
