use tauri::{ipc::Invoke, Runtime};
use tauri_specta::{collect_commands, Builder, Commands};

use crate::{
	account, agent, applications, attachments, badge, claude_import, companions, conversations,
	crypto, devices, environment, hosting, invitations, joined_spaces, library, logging, mcp_oauth,
	menu_contract, missions, notifications, plugins, remote_image, routines, search, sections,
	spaces, updates, user, window_controls,
};

pub fn builder() -> Builder<tauri::Wry> {
	Builder::new()
		.commands(commands())
		.constant("ARCHIVE_EXTENSION", spaces::archive::ARCHIVE_EXTENSION)
		.constant("ARCHIVE_FILTER_NAME", spaces::archive::ARCHIVE_FILTER_NAME)
		.constant("MAXIMIZE_BUTTON_EVENT", window_controls::MAXIMIZE_BUTTON_EVENT)
		.constant("DRAG_GHOST_ROUTE", window_controls::drag_ghost::DRAG_GHOST_ROUTE)
		.constant("DRAG_GHOST_TAB_EVENT", window_controls::drag_ghost::TAB_EVENT)
		.constant("DRAG_GHOST_ENDED_EVENT", window_controls::drag_ghost::ENDED_EVENT)
		.constant("LIBRARY_SCREENSHOT_ROUTE", library::host::screenshot::SCREENSHOT_ROUTE)
		.constant("LIBRARY_SCREENSHOT_WINDOW_PREFIX", library::host::screenshot::WINDOW_PREFIX)
		.constant("ACCOUNT_CHANGED_EVENT", account::contract::CHANGED_EVENT)
		.constant("DEVICE_APPROVAL_CHANGED_EVENT", devices::contract::APPROVAL_CHANGED_EVENT)
		.constant("DEVICE_APPROVAL_REQUESTED_EVENT", devices::contract::APPROVAL_REQUESTED_EVENT)
		.constant("DEVICE_APPROVAL_SETTLED_EVENT", devices::contract::APPROVAL_SETTLED_EVENT)
		.constant("HOSTING_CHANGED_EVENT", hosting::contract::CHANGED_EVENT)
		.constant("HOSTING_MEMBERS_CHANGED_EVENT", hosting::contract::MEMBERS_CHANGED_EVENT)
		.constant(
			"JOINED_SPACE_MEMBERS_CHANGED_EVENT",
			joined_spaces::members::MEMBERS_CHANGED_EVENT,
		)
		.constant("INVITATION_CHANGED_EVENT", invitations::contract::CHANGED_EVENT)
		.constant("JOINED_SPACE_REMOVED_EVENT", joined_spaces::commands::REMOVED_EVENT)
		.constant("JOINED_SPACE_RECONNECTED_EVENT", joined_spaces::commands::RECONNECTED_EVENT)
		.constant("JOIN_LINK_OPENED_EVENT", joined_spaces::deep_link::OPENED_EVENT)
		.constant("LIBRARY_DOCUMENT_UPDATED_EVENT", library::contract::DOCUMENT_UPDATED_EVENT)
		.constant("LIBRARY_DOCUMENT_RENAMED_EVENT", library::contract::DOCUMENT_RENAMED_EVENT)
		.constant("LIBRARY_BOARD_FILE_REPLACED_EVENT", library::contract::BOARD_FILE_REPLACED_EVENT)
		.constant("LIBRARY_CHANGED_EVENT", library::contract::CHANGED_EVENT)
		.constant(
			"LIBRARY_COMMENT_THREAD_CHANGED_EVENT",
			library::contract::COMMENT_THREAD_CHANGED_EVENT,
		)
		.constant("SPACE_DESCRIBED_EVENT", spaces::contract::DESCRIBED_EVENT)
		.constant("UPDATE_CHANGED_EVENT", updates::contract::CHANGED_EVENT)
		.constant("USER_PREFERENCES_CHANGED_EVENT", user::contract::PREFERENCES_CHANGED_EVENT)
		.constant("FILE_MENU_EVENT", menu_contract::FILE_MENU_EVENT)
		.constant("TAB_DRAG_EVENT", window_controls::tab_drag::TAB_DRAG_EVENT)
		.constant("NATIVE_MOVE_ENDED_EVENT", window_controls::native_move::NATIVE_MOVE_ENDED_EVENT)
		.constant(
			"NATIVE_MOVE_FAILED_EVENT",
			window_controls::native_move::NATIVE_MOVE_FAILED_EVENT,
		)
		.constant("CLAUDE_IMPORT_PROGRESS_EVENT", claude_import::contract::PROGRESS_EVENT)
		.constant("SUMMONS_DROPPED_EVENT", conversations::contract::SUMMONS_DROPPED_EVENT)
		.constant("AGENT_ROOMS_CHANGED_EVENT", conversations::contract::AGENT_ROOMS_CHANGED_EVENT)
		.constant("MAX_SUMMONS_PER_CHAIN", conversations::summons::MAX_SUMMONS_PER_CHAIN)
		.typ::<window_controls::MaximizeButtonPointer>()
		.typ::<window_controls::drag_ghost::DragGhostTab>()
		.typ::<window_controls::drag_ghost::DragGhostEnded>()
		.typ::<devices::contract::DeviceApproval>()
		.typ::<devices::contract::DeviceApprovalRequested>()
		.typ::<devices::contract::DeviceApprovalSettled>()
		.typ::<hosting::contract::HostingChanged>()
		.typ::<hosting::contract::MembersChanged>()
		.typ::<invitations::contract::InvitationsChanged>()
		.typ::<joined_spaces::commands::JoinedSpaceRemoved>()
		.typ::<joined_spaces::commands::JoinedSpaceReconnected>()
		.typ::<joined_spaces::members::JoinedSpaceMembersChanged>()
		.typ::<joined_spaces::deep_link::JoinLinkOpened>()
		.typ::<library::contract::LibraryDocumentUpdated>()
		.typ::<library::contract::LibraryDocumentRenamed>()
		.typ::<library::contract::LibraryBoardFileReplaced>()
		.typ::<library::contract::LibraryDocumentPresence>()
		.typ::<library::contract::LibraryDocumentWriterFinished>()
		.typ::<library::contract::LibraryChanged>()
		.typ::<library::contract::LibraryCommentThreadChanged>()
		.typ::<agent::contract::EventTurn>()
		.typ::<applications::contract::ApplicationInstalled>()
		.typ::<missions::commands::MissionChanged>()
		.typ::<spaces::contract::SpaceDescribed>()
		.typ::<menu_contract::FileMenuChosen>()
		.typ::<window_controls::tab_drag::TabDrag>()
		.typ::<window_controls::native_move::NativeMoveEnded>()
		.typ::<window_controls::native_move::NativeMoveFailed>()
		.typ::<claude_import::contract::ClaudeImportProgress>()
		.typ::<conversations::contract::SummonsDropped>()
		.typ::<conversations::contract::AgentRoomsChanged>()
}

// `tauri::test::mock_builder` only ever yields a `Builder<MockRuntime>`, so the handler the
// integration tests mount cannot come from the `tauri::Wry` builder the exporter needs.
pub fn invoke_handler<R: Runtime>() -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
	let builder = Builder::<R>::new().commands(commands());
	move |invoke| builder.invoke_handler()(invoke)
}

fn commands<R: Runtime>() -> Commands<R> {
	collect_commands![
		account::commands::account_state,
		account::commands::account_sign_in::<tauri::Wry>,
		account::commands::account_sign_out::<tauri::Wry>,
		applications::commands::application_catalogue,
		applications::commands::application_search,
		applications::commands::application_named,
		applications::commands::application_installs,
		applications::commands::application_runnable,
		attachments::commands::chat_store_attachments::<tauri::Wry>,
		remote_image::commands::remote_image_read,
		library::commands::library_list::<tauri::Wry>,
		library::commands::library_read_document::<tauri::Wry>,
		library::commands::library_save::<tauri::Wry>,
		library::commands::library_copy::<tauri::Wry>,
		library::commands::library_reveal::<tauri::Wry>,
		library::commands::library_read_image::<tauri::Wry>,
		library::commands::library_read_file::<tauri::Wry>,
		library::commands::library_save_bytes::<tauri::Wry>,
		library::commands::library_copy_bytes::<tauri::Wry>,
		library::commands::library_templates,
		library::commands::library_create_document::<tauri::Wry>,
		library::commands::library_create_board::<tauri::Wry>,
		library::commands::library_board_summary::<tauri::Wry>,
		library::commands::library_open_document::<tauri::Wry>,
		library::commands::library_apply_update::<tauri::Wry>,
		library::commands::library_share_presence::<tauri::Wry>,
		library::commands::library_stop_writers::<tauri::Wry>,
		library::commands::library_read_thumbnail::<tauri::Wry>,
		library::host::screenshot::library_screenshot_job::<tauri::Wry>,
		library::host::screenshot::library_screenshot_answer::<tauri::Wry>,
		library::commands::library_import::<tauri::Wry>,
		library::commands::library_import_url::<tauri::Wry>,
		library::commands::library_import_paths::<tauri::Wry>,
		library::commands::library_read_picked_image,
		library::commands::library_rename_document::<tauri::Wry>,
		library::commands::library_rename_board::<tauri::Wry>,
		library::commands::library_save_message::<tauri::Wry>,
		library::commands::library_delete::<tauri::Wry>,
		library::commands::library_comment_threads::<tauri::Wry>,
		library::commands::library_comment_counts,
		library::commands::library_comment_create::<tauri::Wry>,
		library::commands::library_comment_reply::<tauri::Wry>,
		library::commands::library_comment_resolve::<tauri::Wry>,
		library::commands::library_comment_reopen::<tauri::Wry>,
		library::link_preview::commands::library_read_link_preview,
		badge::commands::badge_set::<tauri::Wry>,
		claude_import::commands::claude_import_inventory,
		claude_import::commands::claude_import_run::<tauri::Wry>,
		agent::commands::agent_check::<tauri::Wry>,
		agent::commands::agent_account::<tauri::Wry>,
		agent::sign_in::agent_sign_in::<tauri::Wry>,
		agent::sign_in::agent_sign_in_code::<tauri::Wry>,
		agent::sign_in::agent_sign_in_cancel::<tauri::Wry>,
		agent::commands::agent_models::<tauri::Wry>,
		agent::commands::agent_tools::<tauri::Wry>,
		agent::commands::agent_title::<tauri::Wry>,
		agent::commands::agent_start_or_resume_session::<tauri::Wry>,
		agent::commands::agent_submit_prompt::<tauri::Wry>,
		agent::commands::agent_cancel_turn::<tauri::Wry>,
		logging::commands::diagnostics::<tauri::Wry>,
		logging::commands::log_tail::<tauri::Wry>,
		logging::commands::log_reveal::<tauri::Wry>,
		logging::commands::log_clear::<tauri::Wry>,
		agent::commands::agent_respond_to_permission,
		agent::commands::agent_answer_question,
		agent::commands::agent_shutdown::<tauri::Wry>,
		agent::commands::agent_live_sessions,
		agent::commands::agent_live_sessions_in_space::<tauri::Wry>,
		agent::commands::agent_pending_questions,
		agent::commands::agent_pending_questions_in_space::<tauri::Wry>,
		conversations::commands::conversation_bots::<tauri::Wry>,
		conversations::commands::conversation_bots_by_presence::<tauri::Wry>,
		conversations::commands::conversation_create_bot::<tauri::Wry>,
		conversations::commands::conversation_create_bot_from_draft::<tauri::Wry>,
		conversations::commands::conversation_suggested_bots,
		companions::launch::companion_launch_outcome,
		crypto::commands::get_device_identity,
		devices::commands::device_approval,
		devices::commands::device_approval_retry::<tauri::Wry>,
		devices::commands::device_approval_code_request::<tauri::Wry>,
		devices::commands::device_approval_code_submit::<tauri::Wry>,
		devices::commands::device_approve::<tauri::Wry>,
		devices::commands::device_refuse::<tauri::Wry>,
		devices::commands::devices_list::<tauri::Wry>,
		devices::commands::device_remove::<tauri::Wry>,
		window_controls::window_declare_maximize_button::<tauri::Wry>,
		window_controls::secondary::window_open::<tauri::Wry>,
		window_controls::secondary::window_identity::<tauri::Wry>,
		window_controls::secondary::window_report_space::<tauri::Wry>,
		window_controls::secondary::window_report_strip::<tauri::Wry>,
		window_controls::secondary::window_strip_at::<tauri::Wry>,
		window_controls::tab_drag::window_tab_drag_start::<tauri::Wry>,
		window_controls::tab_drag::window_tab_drag_move::<tauri::Wry>,
		window_controls::tab_drag::window_tab_drag_drop::<tauri::Wry>,
		window_controls::tab_drag::window_tab_drag_cancel::<tauri::Wry>,
		window_controls::tab_drag::window_start_native_move::<tauri::Wry>,
		window_controls::tab_drag::window_hide::<tauri::Wry>,
		window_controls::tab_drag::window_show::<tauri::Wry>,
		window_controls::drag_ghost::drag_ghost_show::<tauri::Wry>,
		window_controls::drag_ghost::drag_ghost_tab::<tauri::Wry>,
		window_controls::drag_ghost::drag_ghost_move::<tauri::Wry>,
		window_controls::drag_ghost::drag_ghost_hide::<tauri::Wry>,
		conversations::commands::conversation_duplicate_bot::<tauri::Wry>,
		conversations::commands::conversation_update_bot::<tauri::Wry>,
		conversations::commands::conversation_delete_bot::<tauri::Wry>,
		conversations::commands::conversation_set_bot_avatar_image::<tauri::Wry>,
		conversations::commands::conversation_set_bot_memory::<tauri::Wry>,
		conversations::commands::conversation_record_bot_commands,
		conversations::commands::conversation_bot_commands,
		conversations::commands::conversation_main_chat::<tauri::Wry>,
		conversations::commands::conversation_renew_main_chat::<tauri::Wry>,
		conversations::commands::conversation_solo_states::<tauri::Wry>,
		conversations::commands::conversation_agent_rooms,
		conversations::commands::conversation_create::<tauri::Wry>,
		conversations::commands::conversation_list::<tauri::Wry>,
		conversations::commands::conversation_mission_thread::<tauri::Wry>,
		conversations::commands::conversation_page::<tauri::Wry>,
		conversations::commands::conversation_today_of_agent::<tauri::Wry>,
		conversations::commands::conversation_local_ids,
		conversations::commands::conversation_update::<tauri::Wry>,
		conversations::commands::conversation_delete::<tauri::Wry>,
		conversations::commands::conversation_add_participant::<tauri::Wry>,
		conversations::commands::conversation_remove_participant::<tauri::Wry>,
		conversations::commands::conversation_set_lead::<tauri::Wry>,
		conversations::commands::conversation_open_runtime_session,
		conversations::commands::conversation_record_provider_session,
		conversations::commands::conversation_bounded_context,
		conversations::commands::conversation_roster_block,
		conversations::commands::conversation_capture_checkpoint,
		conversations::commands::conversation_message_page,
		conversations::commands::conversation_message_page_around,
		conversations::commands::conversation_message_reference,
		conversations::commands::conversation_message_header,
		conversations::commands::conversation_pin_message,
		conversations::commands::conversation_unpin_message,
		conversations::commands::conversation_pinned_messages,
		conversations::commands::conversation_start_turn::<tauri::Wry>,
		conversations::commands::conversation_complete_turn::<tauri::Wry>,
		conversations::commands::conversation_append_user_message::<tauri::Wry>,
		conversations::commands::conversation_send_user_message::<tauri::Wry>,
		conversations::commands::conversation_send_turn::<tauri::Wry>,
		conversations::awaited_runs::conversation_serve_awaited_runs::<tauri::Wry>,
		conversations::awaited_runs::conversation_claim_unseen_drops,
		conversations::turn_run_deadline::conversation_drop_summons::<tauri::Wry>,
		conversations::commands::conversation_open_assistant_message::<tauri::Wry>,
		conversations::commands::conversation_append_text::<tauri::Wry>,
		conversations::commands::conversation_finalize_message::<tauri::Wry>,
		environment::commands::env_set::<tauri::Wry>,
		environment::commands::env_delete::<tauri::Wry>,
		environment::commands::env_list::<tauri::Wry>,
		environment::commands::connection_set::<tauri::Wry>,
		hosting::commands::hosting_start::<tauri::Wry>,
		hosting::commands::hosting_stop::<tauri::Wry>,
		hosting::commands::hosting_state,
		hosting::commands::hosting_members::<tauri::Wry>,
		hosting::commands::hosting_invite_member::<tauri::Wry>,
		hosting::commands::hosting_withdraw_invitation::<tauri::Wry>,
		hosting::commands::hosting_resend_invitation::<tauri::Wry>,
		hosting::commands::hosting_remove_member::<tauri::Wry>,
		hosting::commands::hosting_invite_member_again::<tauri::Wry>,
		hosting::commands::hosting_devices::<tauri::Wry>,
		hosting::commands::hosting_remove_device::<tauri::Wry>,
		invitations::commands::invitations_list::<tauri::Wry>,
		invitations::commands::invitation_accept::<tauri::Wry>,
		invitations::commands::invitation_decline::<tauri::Wry>,
		joined_spaces::commands::joined_spaces_list::<tauri::Wry>,
		joined_spaces::commands::joined_space_connect::<tauri::Wry>,
		joined_spaces::commands::joined_space_remove::<tauri::Wry>,
		joined_spaces::commands::joined_space_describe::<tauri::Wry>,
		joined_spaces::commands::join_link_listen::<tauri::Wry>,
		joined_spaces::members::joined_space_members,
		mcp_oauth::commands::mcp_oauth_connect::<tauri::Wry>,
		mcp_oauth::commands::mcp_oauth_cancel::<tauri::Wry>,
		mcp_oauth::commands::mcp_oauth_disconnect::<tauri::Wry>,
		mcp_oauth::commands::mcp_application_status::<tauri::Wry>,
		missions::commands::mission_close::<tauri::Wry>,
		missions::commands::mission_reopen::<tauri::Wry>,
		missions::commands::mission_list::<tauri::Wry>,
		missions::commands::mission_detail::<tauri::Wry>,
		missions::commands::mission_board::<tauri::Wry>,
		missions::commands::mission_space_feed::<tauri::Wry>,
		missions::commands::mission_space_page::<tauri::Wry>,
		missions::commands::mission_unreported::<tauri::Wry>,
		missions::commands::mission_reported,
		missions::run_claims::mission_run_claim::<tauri::Wry>,
		missions::run_claims::mission_run_release,
		missions::commands::mission_answered::<tauri::Wry>,
		notifications::commands::notification_show::<tauri::Wry>,
		plugins::commands::plugin_skills::<tauri::Wry>,
		plugins::commands::plugin_create_skill::<tauri::Wry>,
		plugins::commands::plugin_update_skill::<tauri::Wry>,
		plugins::commands::plugin_set_skill_preloaded::<tauri::Wry>,
		plugins::commands::plugin_delete_skill::<tauri::Wry>,
		plugins::commands::plugin_skill_file::<tauri::Wry>,
		plugins::commands::plugin_write_skill_file::<tauri::Wry>,
		plugins::commands::plugin_delete_skill_file::<tauri::Wry>,
		plugins::commands::plugin_mcp_servers::<tauri::Wry>,
		plugins::commands::plugin_set_mcp_server::<tauri::Wry>,
		plugins::commands::plugin_delete_mcp_server::<tauri::Wry>,
		plugins::commands::plugin_history::<tauri::Wry>,
		plugins::commands::plugin_history_diff::<tauri::Wry>,
		plugins::commands::plugin_revert::<tauri::Wry>,
		routines::commands::routine_trigger_sources::<tauri::Wry>,
		routines::commands::routine_trigger_sources_of_space::<tauri::Wry>,
		routines::commands::routine_create::<tauri::Wry>,
		routines::commands::routine_update::<tauri::Wry>,
		routines::commands::routine_delete::<tauri::Wry>,
		routines::commands::routine_list,
		routines::commands::routine_runs,
		routines::commands::routine_runs_of_space,
		routines::commands::routine_reported_runs,
		routines::commands::routine_run_now::<tauri::Wry>,
		routines::commands::routine_renew_lease,
		routines::commands::routine_close_run,
		routines::commands::routine_key::<tauri::Wry>,
		search::commands::search_catalogue::<tauri::Wry>,
		search::commands::search_messages::<tauri::Wry>,
		search::commands::search_recent::<tauri::Wry>,
		sections::commands::section_list,
		sections::commands::section_create,
		sections::commands::section_rename,
		sections::commands::roster_pin,
		sections::commands::section_delete,
		sections::commands::bot_move_to_section,
		spaces::commands::space_list,
		spaces::commands::space_create::<tauri::Wry>,
		spaces::commands::space_update::<tauri::Wry>,
		spaces::commands::space_reorder,
		spaces::commands::space_delete::<tauri::Wry>,
		spaces::commands::space_export::<tauri::Wry>,
		spaces::commands::space_import::<tauri::Wry>,
		spaces::commands::bot_move_to_space::<tauri::Wry>,
		spaces::commands::bot_add_to_space::<tauri::Wry>,
		spaces::commands::bot_remove_from_space::<tauri::Wry>,
		spaces::commands::space_preferences,
		spaces::commands::space_set_preferences,
		spaces::commands::space_companion_counts::<tauri::Wry>,
		user::commands::user_preferences::<tauri::Wry>,
		user::commands::user_set_preferences::<tauri::Wry>,
		user::commands::user_set_profile_picture::<tauri::Wry>,
		user::commands::user_set_onboarding_step::<tauri::Wry>,
		user::commands::user_set_sidebar_collapsed::<tauri::Wry>,
		user::commands::user_replay_onboarding::<tauri::Wry>,
		user::commands::user_set_onboarding_first_companion::<tauri::Wry>,
		user::commands::user_mark_onboarding_import_seen::<tauri::Wry>,
		updates::commands::update_state,
		updates::commands::check_for_updates::<tauri::Wry>,
		updates::commands::install_update::<tauri::Wry>,
		updates::commands::release_notes::<tauri::Wry>,
		updates::commands::running_companions,
	]
}
