use std::collections::HashMap;

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::account::commands::{account_sign_in, account_sign_out, account_state};
use crate::agent::commands::*;
use crate::agent::contract::{AgentCommand, PermissionDecision, RuntimeScope, SubmittedTurn};
use crate::agent::sign_in::{agent_sign_in, agent_sign_in_cancel, agent_sign_in_code};
use crate::attachments::commands::chat_store_attachments;
use crate::attachments::contract::SubmittedAttachment;
use crate::claude_import::commands::{claude_import_inventory, claude_import_run};
use crate::companions::launch::launch_outcome;
use crate::conversations::awaited_runs::{
	conversation_claim_unseen_drops, conversation_serve_awaited_runs,
};
use crate::conversations::commands::*;
use crate::conversations::contract::{
	BotDraft, BotIdentity, NewAssistantMessage, NewTurn, NewUserMessage, SentMessage,
	SummonsDropReason, TerminalCompletion,
};
use crate::conversations::turn_run_deadline::conversation_drop_summons;
use crate::core_context::{ClientId, Core};
use crate::crypto::commands::get_device_identity;
use crate::environment::commands::{connection_set, env_delete, env_list, env_set};
use crate::environment::contract::{ConnectionKind, EnvOwner, EnvScope};
use crate::hosting::caller::Caller;
use crate::json::JsonValue;
use crate::mcp_oauth::commands::{
	application_status, connect_application, disconnect_application, mcp_oauth_cancel,
};
use crate::missions::commands::*;
use crate::missions::run_claims::{mission_run_claim, mission_run_release};
use crate::sections::commands::*;
use crate::sections::contract::RosterPin;
use crate::spaces::read::list_spaces;
use crate::user::commands::*;
use crate::user::contract::{OnboardingStep, UserPreferences};

pub const PATH: &str = "/api/invoke/{command}";

pub const IN_PROCESS_CLIENT: &str = "in-process";

pub const HOST_API_COMMANDS: [&str; 10] = [
	"space_list",
	"conversation_bots",
	"conversation_list",
	"conversation_page",
	"conversation_message_page",
	"conversation_main_chat",
	"conversation_send_turn",
	"mission_list",
	"mission_board",
	"mission_detail",
];

const JSON: &str = "application/json";

const UNREGISTERED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no command bears this name");

const UNREADABLE: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the call carried no readable JSON arguments");

#[derive(Debug, PartialEq)]
pub enum Answer {
	Answered(Value),
	Refused(Value),
	Unanswerable(String),
}

impl IntoResponse for Answer {
	fn into_response(self) -> Response {
		match self {
			Answer::Answered(json) => {
				(StatusCode::OK, [(header::CONTENT_TYPE, JSON)], json.to_string())
			}
			Answer::Refused(json) => (
				StatusCode::INTERNAL_SERVER_ERROR,
				[(header::CONTENT_TYPE, JSON)],
				json.to_string(),
			),
			Answer::Unanswerable(detail) => (
				StatusCode::INTERNAL_SERVER_ERROR,
				[(header::CONTENT_TYPE, JSON)],
				Value::String(detail).to_string(),
			),
		}
		.into_response()
	}
}

pub fn handles(command: &str) -> bool {
	HOST_API_COMMANDS.contains(&command)
}

macro_rules! decoded {
	($command:ident, $arguments:ident; () => $answer:expr) => {
		$answer
	};
	($command:ident, $arguments:ident; ($($arg:ident: $ty:ty),+) => $answer:expr) => {{
		#[derive(Deserialize)]
		#[serde(rename_all = "camelCase")]
		struct Arguments {
			$($arg: $ty,)+
		}
		match read::<Arguments>($command, $arguments) {
			Ok(Arguments { $($arg,)+ }) => $answer,
			Err(unread) => unread,
		}
	}};
}

macro_rules! table {
	($core:ident, $client:ident; $($name:ident ($($arg:ident: $ty:ty),*) => $answer:expr;)*) => {
		pub const COMMANDS: &[&str] = &[$(stringify!($name)),*];

		pub async fn dispatch(core: &Core, command: &str, arguments: Value) -> Option<Answer> {
			let $core = core;
			let $client = &ClientId::new(IN_PROCESS_CLIENT);
			Some(match command {
				$(stringify!($name) => decoded!(command, arguments; ($($arg: $ty),*) => $answer),)*
				_ => return None,
			})
		}
	};
}

table! { core, client;
	account_state() => plain(account_state(core));
	account_sign_in() => answered(account_sign_in(core).await);
	account_sign_out() => answered(account_sign_out(core).await);

	get_device_identity() => answered(get_device_identity(core));

	env_set(scope: EnvScope, name: String, value: String) =>
		answered(env_set(core, scope, name, value).await);
	env_delete(scope: EnvScope, name: String) => answered(env_delete(core, scope, name).await);
	env_list(scope: EnvScope) => answered(env_list(core, Caller::Host, scope).await);
	connection_set(kind: ConnectionKind, value: String) =>
		answered(connection_set(core, kind, value).await);

	section_list(space_id: String) => answered(section_list(core, space_id).await);
	section_create(space_id: String, name: String) =>
		answered(section_create(core, space_id, name).await);
	section_rename(id: String, name: String) => answered(section_rename(core, id, name).await);
	roster_pin(space_id: String, pins: Vec<RosterPin>) =>
		answered(roster_pin(core, space_id, pins).await);
	section_delete(id: String) => answered(section_delete(core, id).await);
	bot_move_to_section(bot_id: String, section_id: Option<String>, space_id: Option<String>) =>
		answered(bot_move_to_section(core, bot_id, section_id, space_id).await);

	user_preferences() => answered(user_preferences(core).await);
	user_set_preferences(preferences: UserPreferences) =>
		answered(user_set_preferences(core, preferences).await);
	user_set_profile_picture(bytes: Vec<u8>) =>
		answered(user_set_profile_picture(core, bytes).await);
	user_set_onboarding_step(step: OnboardingStep) =>
		answered(user_set_onboarding_step(core, step).await);
	user_replay_onboarding() => answered(user_replay_onboarding(core).await);
	user_set_onboarding_first_companion(bot_id: String) =>
		answered(user_set_onboarding_first_companion(core, bot_id).await);
	user_mark_onboarding_import_seen() => answered(user_mark_onboarding_import_seen(core).await);

	space_list() => answered(list_spaces(core).await);

	conversation_bots(space_id: Option<String>) =>
		answered(conversation_bots(core, space_id).await);
	conversation_bots_by_presence(space_id: String, excluded_conversation_id: Option<String>) =>
		answered(conversation_bots_by_presence(core, space_id, excluded_conversation_id).await);
	conversation_create_bot(identity: BotIdentity, space_id: Option<String>) =>
		answered(conversation_create_bot(core, identity, space_id).await);
	conversation_create_bot_from_draft(draft: BotDraft, space_id: String) =>
		answered(create_bot_from_draft(core, draft, space_id).await);
	conversation_suggested_bots() => plain(suggested_bots());
	conversation_duplicate_bot(bot_id: String, space_id: Option<String>) =>
		answered(conversation_duplicate_bot(core, bot_id, space_id).await);
	conversation_update_bot(id: String, identity: BotIdentity) =>
		answered(conversation_update_bot(core, id, identity).await);
	conversation_delete_bot(id: String) => answered(conversation_delete_bot(core, id).await);
	conversation_set_bot_avatar_image(id: String, bytes: Vec<u8>) =>
		answered(conversation_set_bot_avatar_image(core, id, bytes).await);
	conversation_set_bot_memory(id: String, memory: String) =>
		answered(conversation_set_bot_memory(core, id, memory).await);
	conversation_record_bot_commands(bot_id: String, commands: Vec<AgentCommand>) =>
		answered(conversation_record_bot_commands(core, bot_id, commands).await);
	conversation_bot_commands(bot_id: String) =>
		answered(conversation_bot_commands(core, bot_id).await);
	conversation_main_chat(bot_id: String, space_id: Option<String>) =>
		answered(main_chat(core, bot_id, space_id).await);
	conversation_solo_states(space_id: String) => answered(solo_states(core, space_id).await);
	conversation_create(
		space_id: String,
		section_id: Option<String>,
		title: String,
		bot_ids: Vec<String>
	) =>
		answered(conversation_create(core, space_id, section_id, title, bot_ids).await);
	conversation_list(space_id: String) => answered(list_conversations(core, space_id).await);
	conversation_mission_thread(conversation_id: String) =>
		answered(conversation_mission_thread(core, conversation_id).await);
	conversation_page(space_id: String, cursor: Option<String>, limit: Option<u32>) =>
		answered(conversations_page(core, space_id, cursor, limit).await);
	conversation_local_ids() => answered(conversation_local_ids(core).await);
	conversation_update(
		conversation_id: String,
		title: String,
		instructions: String,
		section_id: Option<String>,
		icon: Option<String>,
		color: Option<i64>
	) => answered(
		conversation_update(core, conversation_id, title, instructions, section_id, icon, color)
			.await,
	);
	conversation_delete(conversation_id: String) =>
		answered(delete_conversation(core, conversation_id).await);
	conversation_add_participant(
		conversation_id: String,
		bot_id: String,
		invited_by_bot_id: Option<String>
	) => answered(
		conversation_add_participant(core, conversation_id, bot_id, invited_by_bot_id).await,
	);
	conversation_remove_participant(conversation_id: String, bot_id: String) =>
		answered(conversation_remove_participant(core, conversation_id, bot_id).await);
	conversation_set_lead(conversation_id: String, bot_id: String) =>
		answered(conversation_set_lead(core, conversation_id, bot_id).await);
	conversation_open_runtime_session(
		conversation_id: String,
		bot_id: String,
		started_at: i64,
		runtime_session_id: Option<String>,
		reason: Option<String>
	) => answered(
		conversation_open_runtime_session(
			core,
			conversation_id,
			bot_id,
			started_at,
			runtime_session_id,
			reason,
		)
		.await,
	);
	conversation_record_provider_session(
		conversation_id: String,
		bot_id: String,
		runtime_session_id: String,
		provider_session_id: String
	) => answered(
		conversation_record_provider_session(
			core,
			conversation_id,
			bot_id,
			runtime_session_id,
			provider_session_id,
		)
		.await,
	);
	conversation_bounded_context(
		conversation_id: String,
		bot_id: String,
		runtime_session_id: String,
		prompt_message_id: String
	) => answered(
		conversation_bounded_context(
			core,
			conversation_id,
			bot_id,
			runtime_session_id,
			prompt_message_id,
		)
		.await,
	);
	conversation_roster_block(conversation_id: String, bot_id: String) =>
		answered(conversation_roster_block(core, conversation_id, bot_id).await);
	conversation_capture_checkpoint(
		conversation_id: String,
		bot_id: String,
		runtime_session_id: String,
		created_at: i64
	) => answered(
		conversation_capture_checkpoint(
			core,
			conversation_id,
			bot_id,
			runtime_session_id,
			created_at,
		)
		.await,
	);
	conversation_message_page(conversation_id: String, before_seq: Option<i64>, limit: u32) =>
		answered(message_page(core, conversation_id, before_seq, limit).await);
	conversation_message_page_around(conversation_id: String, seq: i64, limit: u32) =>
		answered(conversation_message_page_around(core, conversation_id, seq, limit).await);
	conversation_message_reference(conversation_id: String, message_id: String) =>
		answered(conversation_message_reference(core, conversation_id, message_id).await);
	conversation_message_header(conversation_id: String, message_id: String) =>
		answered(conversation_message_header(core, conversation_id, message_id).await);
	conversation_pin_message(
		conversation_id: String,
		message_id: String,
		block_index: i64,
		pinned_at: i64
	) => answered(
		conversation_pin_message(core, conversation_id, message_id, block_index, pinned_at).await,
	);
	conversation_unpin_message(conversation_id: String, message_id: String, block_index: i64) =>
		answered(conversation_unpin_message(core, conversation_id, message_id, block_index).await);
	conversation_pinned_messages(conversation_id: String) =>
		answered(conversation_pinned_messages(core, conversation_id).await);
	conversation_start_turn(turn: NewTurn) => answered(start_turn(core, turn).await);
	conversation_complete_turn(id: String, completed_at: i64) =>
		answered(complete_turn(core, id, completed_at).await);
	conversation_append_user_message(message: NewUserMessage) =>
		answered(conversation_append_user_message(core, Caller::Host, message).await);
	conversation_send_user_message(message: NewUserMessage, summoned: Vec<String>) =>
		answered(send_user_message(core, Caller::Host, message, summoned).await);
	conversation_send_turn(message: SentMessage, summoned: Vec<String>) =>
		answered(conversation_send_turn(core, Caller::Host, message, summoned).await);
	conversation_serve_awaited_runs() =>
		answered(conversation_serve_awaited_runs(core, client).await);
	conversation_claim_unseen_drops(conversation_id: String) =>
		plain(conversation_claim_unseen_drops(core, conversation_id));
	conversation_drop_summons(
		conversation_id: String,
		turn_id: String,
		bot_id: String,
		reason: SummonsDropReason
	) =>
		answered(conversation_drop_summons(core, conversation_id, turn_id, bot_id, reason).await);
	conversation_open_assistant_message(message: NewAssistantMessage) =>
		answered(open_assistant_message(core, message).await);
	conversation_append_text(id: String, delta: String) =>
		answered(append_text(core, id, delta).await);
	conversation_finalize_message(
		id: String,
		completion: TerminalCompletion,
		settled_text: Option<String>
	) =>
		answered(finalize_message(core, id, completion, settled_text).await);

	companion_launch_outcome() => plain(launch_outcome(core));

	agent_sign_in() => answered(agent_sign_in(core).await);
	agent_sign_in_code(text: String) => answered(agent_sign_in_code(core, text).await);
	agent_sign_in_cancel() => answered(agent_sign_in_cancel(core).await);
	agent_check(scope: Option<RuntimeScope>) => plain(agent_check(core, scope).await);
	agent_account() => plain(agent_account(core).await);
	agent_models() => plain(agent_models(core).await);
	agent_tools() => plain(agent_tools(core).await);
	agent_title(text: String) => plain(agent_title(core, text).await);
	agent_start_or_resume_session(
		scope: RuntimeScope,
		resume: Option<String>,
		cwd: Option<String>,
		output_schema: Option<JsonValue>
	) => answered(start_or_resume_session(core, scope, resume, cwd, output_schema).await);
	agent_submit_prompt(scope: RuntimeScope, text: String, turn: Option<SubmittedTurn>) =>
		answered(agent_submit_prompt(core, client, Caller::Host, scope, text, turn).await);
	agent_cancel_turn(scope: RuntimeScope) => answered(cancel_turn(core, scope).await);
	agent_respond_to_permission(scope: RuntimeScope, id: String, decision: PermissionDecision) =>
		answered(agent_respond_to_permission(core, scope, id, decision).await);
	agent_answer_question(
		scope: RuntimeScope,
		id: String,
		answers: HashMap<String, String>,
		annotations: Option<JsonValue>
	) => answered(agent_answer_question(core, scope, id, answers, annotations).await);
	agent_shutdown(scope: RuntimeScope) => answered(shut_down_agent(core, scope).await);
	agent_live_sessions() => answered(agent_live_sessions(core).await);
	agent_live_sessions_in_space(space_id: String) =>
		answered(agent_live_sessions_in_space(core, space_id).await);
	agent_pending_questions(conversation_id: String) =>
		answered(pending_questions(core, conversation_id).await);
	agent_pending_questions_in_space(space_id: String) =>
		answered(agent_pending_questions_in_space(core, space_id).await);

	mcp_oauth_connect(owner: EnvOwner, name: String, url: String) =>
		answered(connect_application(core, owner, name, url).await);
	mcp_oauth_cancel() => answered(mcp_oauth_cancel(core).await);
	mcp_oauth_disconnect(owner: EnvOwner, name: String, url: String) =>
		answered(disconnect_application(core, Caller::Host, owner, name, url).await);
	mcp_application_status(owner: EnvOwner) =>
		answered(application_status(core, Caller::Host, owner).await);

	mission_close(mission_id: String) => answered(mission_close(core, mission_id).await);
	mission_reopen(mission_id: String) => answered(mission_reopen(core, mission_id).await);
	mission_list(conversation_id: String) => answered(list_missions(core, conversation_id).await);
	mission_detail(mission_id: String) => answered(mission_detail_of(core, mission_id).await);
	mission_board() => answered(missions_board(core).await);
	mission_space_feed(space_id: String, closed_since: i64) =>
		answered(space_feed(core, space_id, closed_since).await);
	mission_space_page(
		space_id: String,
		closed_since: i64,
		cursor: Option<String>,
		limit: Option<u32>
	) =>
		answered(space_page(core, space_id, closed_since, cursor, limit).await);
	mission_unreported() => answered(unreported_missions(core).await);
	mission_reported(mission_id: String, turn_id: Option<String>) =>
		answered(mark_reported(core, mission_id, turn_id).await);
	mission_answered(mission_id: String, seq: i64) =>
		answered(mark_answered(core, mission_id, seq).await);
	mission_run_claim(mission_id: String) => plain(mission_run_claim(core, client, mission_id));
	mission_run_release(token: String) => plain(mission_run_release(core, token));

	chat_store_attachments(conversation_id: String, attachments: Vec<SubmittedAttachment>) =>
		answered(chat_store_attachments(core, conversation_id, attachments).await);

	claude_import_inventory() => answered(claude_import_inventory(core).await);
	claude_import_run(selection: Vec<String>, space_id: String) =>
		answered(claude_import_run(core, selection, space_id).await);
}

pub fn router(core: Core) -> Router {
	Router::new().route(PATH, post(invoked)).with_state(core)
}

async fn invoked(State(core): State<Core>, Path(command): Path<String>, body: Bytes) -> Response {
	let arguments = if body.is_empty() {
		Value::Object(Map::new())
	} else {
		match serde_json::from_slice(&body) {
			Ok(arguments) => arguments,
			Err(_) => return UNREADABLE.into_response(),
		}
	};
	match dispatch(&core, &command, arguments).await {
		Some(answer) => answer.into_response(),
		None => UNREGISTERED.into_response(),
	}
}

fn read<T: DeserializeOwned>(command: &str, arguments: Value) -> Result<T, Answer> {
	serde_json::from_value(arguments).map_err(|failure| {
		Answer::Unanswerable(format!("invalid args for command {command}: {failure}"))
	})
}

fn plain<T: Serialize>(answer: T) -> Answer {
	answered(Ok::<T, ()>(answer))
}

fn answered<T: Serialize, E: Serialize>(result: Result<T, E>) -> Answer {
	let encoded = match result {
		Ok(answer) => serde_json::to_value(answer).map(Answer::Answered),
		Err(refusal) => serde_json::to_value(refusal).map(Answer::Refused),
	};
	encoded.unwrap_or_else(|failure| {
		Answer::Unanswerable(format!("the answer did not encode: {failure}"))
	})
}

#[cfg(test)]
mod tests {
	use serde_json::json;
	use tokio::net::TcpListener;

	use super::*;
	use crate::db::repositories::conversations::DEFAULT_BOT_ID;
	use crate::test_core::a_core_of_its_own;

	async fn served(core: Core) -> String {
		crate::missions::github::installed_tls_provider();
		let listener = TcpListener::bind("127.0.0.1:0").await.expect("a loopback port binds");
		let address = listener.local_addr().expect("the port is named");
		tokio::spawn(async move { axum::serve(listener, router(core)).await });
		format!("http://{address}")
	}

	async fn called(base: &str, command: &str, arguments: Value) -> (u16, Value) {
		let answered = reqwest::Client::new()
			.post(format!("{base}/api/invoke/{command}"))
			.json(&arguments)
			.send()
			.await
			.expect("the router answers");
		let status = answered.status().as_u16();
		(status, answered.json().await.expect("the answer is JSON"))
	}

	#[tokio::test]
	async fn a_process_with_no_tauri_serves_a_write_and_a_read_with_the_json_the_command_answers() {
		let core = a_core_of_its_own("invoke-router");
		crate::db::install(&core);
		let state = core.state::<crate::db::DatabaseState>();
		let database = state.as_ref().expect("the database opens");
		database.conversations().ensure_default_bot().await.expect("the bot is seeded");
		let base = served(core.core().clone()).await;

		let (written, chat) =
			called(&base, "conversation_main_chat", json!({ "botId": DEFAULT_BOT_ID })).await;
		let conversation_id = chat["id"].as_str().expect("the chat names its id").to_owned();
		let (read, page) = called(
			&base,
			"conversation_message_page",
			json!({ "conversationId": conversation_id, "limit": 50 }),
		)
		.await;

		assert_eq!((written, read), (200, 200));
		let direct = main_chat(&core, DEFAULT_BOT_ID.to_owned(), None).await.expect("it reads");
		assert_eq!(chat, serde_json::to_value(direct).expect("it encodes"));
		let direct = message_page(&core, conversation_id, None, 50).await.expect("it reads");
		assert_eq!(page, serde_json::to_value(direct).expect("it encodes"));
	}

	#[tokio::test]
	async fn a_command_the_core_does_not_hold_is_refused_as_unregistered() {
		let core = a_core_of_its_own("invoke-unregistered");
		crate::db::install(&core);
		let base = served(core.core().clone()).await;

		let answered = reqwest::Client::new()
			.post(format!("{base}/api/invoke/library_list"))
			.send()
			.await
			.expect("the router answers");

		assert_eq!(answered.status().as_u16(), 404);
	}

	const OS_SHELL_MODULES: [&str; 4] = ["badge", "notifications", "updates", "window_controls"];

	const NOT_YET_IN_CORE: [&str; 109] = [
		"application_catalogue",
		"application_search",
		"application_named",
		"application_installs",
		"application_runnable",
		"remote_image_read",
		"library_list",
		"library_read_document",
		"library_save",
		"library_copy",
		"library_reveal",
		"library_read_image",
		"library_read_file",
		"library_save_bytes",
		"library_copy_bytes",
		"library_templates",
		"library_create_document",
		"library_create_board",
		"library_board_summary",
		"library_open_document",
		"library_apply_update",
		"library_share_presence",
		"library_stop_writers",
		"library_read_thumbnail",
		"library_screenshot_job",
		"library_screenshot_answer",
		"library_import",
		"library_import_url",
		"library_import_paths",
		"library_read_picked_image",
		"library_rename_document",
		"library_rename_board",
		"library_save_message",
		"library_delete",
		"library_read_link_preview",
		"diagnostics",
		"log_tail",
		"log_reveal",
		"log_clear",
		"device_approval",
		"device_approval_retry",
		"device_approval_code_request",
		"device_approval_code_submit",
		"device_approve",
		"device_refuse",
		"devices_list",
		"device_remove",
		"hosting_start",
		"hosting_stop",
		"hosting_state",
		"hosting_members",
		"hosting_invite_member",
		"hosting_withdraw_invitation",
		"hosting_resend_invitation",
		"hosting_remove_member",
		"hosting_invite_member_again",
		"hosting_devices",
		"hosting_remove_device",
		"invitations_list",
		"invitation_accept",
		"invitation_decline",
		"joined_spaces_list",
		"joined_space_connect",
		"joined_space_remove",
		"joined_space_describe",
		"join_link_listen",
		"joined_space_members",
		"plugin_skills",
		"plugin_create_skill",
		"plugin_update_skill",
		"plugin_set_skill_preloaded",
		"plugin_delete_skill",
		"plugin_skill_file",
		"plugin_write_skill_file",
		"plugin_delete_skill_file",
		"plugin_mcp_servers",
		"plugin_set_mcp_server",
		"plugin_delete_mcp_server",
		"plugin_history",
		"plugin_history_diff",
		"plugin_revert",
		"routine_trigger_sources",
		"routine_trigger_sources_of_space",
		"routine_create",
		"routine_update",
		"routine_delete",
		"routine_list",
		"routine_runs",
		"routine_runs_of_space",
		"routine_reported_runs",
		"routine_run_now",
		"routine_renew_lease",
		"routine_close_run",
		"routine_key",
		"search_catalogue",
		"search_messages",
		"search_recent",
		"space_create",
		"space_update",
		"space_reorder",
		"space_delete",
		"space_export",
		"space_import",
		"bot_move_to_space",
		"bot_add_to_space",
		"bot_remove_from_space",
		"space_preferences",
		"space_set_preferences",
		"space_companion_counts",
	];

	fn tauri_commands() -> Vec<(String, String)> {
		let table = std::fs::read_to_string(format!("{}/src/commands.rs", crate::APP_DIR))
			.expect("the Tauri command table reads");
		let listed = table.split_once("collect_commands![").expect("the table collects").1;
		let listed = listed.split_once(']').expect("the table closes").0;
		listed
			.split(',')
			.map(|entry| entry.trim().trim_end_matches("::<tauri::Wry>"))
			.filter(|entry| !entry.is_empty())
			.map(|entry| {
				let module = entry.split("::").next().expect("a path").to_owned();
				let name = entry.rsplit("::").next().expect("a path").to_owned();
				(module, name)
			})
			.collect()
	}

	#[test]
	fn every_tauri_command_outside_the_os_shell_is_answered_by_the_core_under_its_name() {
		let missing: Vec<String> = tauri_commands()
			.into_iter()
			.filter(|(module, _)| !OS_SHELL_MODULES.contains(&module.as_str()))
			.map(|(_, name)| name)
			.filter(|name| !COMMANDS.contains(&name.as_str()))
			.filter(|name| !NOT_YET_IN_CORE.contains(&name.as_str()))
			.collect();

		assert!(missing.is_empty(), "the core answers none of {missing:?}");
	}

	#[test]
	fn every_core_command_and_every_pending_one_names_a_tauri_command() {
		let tauri: Vec<String> = tauri_commands().into_iter().map(|(_, name)| name).collect();
		let unknown: Vec<&str> = COMMANDS
			.iter()
			.chain(NOT_YET_IN_CORE.iter())
			.copied()
			.filter(|name| !tauri.iter().any(|listed| listed == name))
			.collect();
		let answered_yet_pending: Vec<&str> =
			NOT_YET_IN_CORE.iter().copied().filter(|name| COMMANDS.contains(name)).collect();

		assert!(unknown.is_empty(), "no Tauri command bears {unknown:?}");
		assert!(answered_yet_pending.is_empty(), "{answered_yet_pending:?} left the pending list");
	}

	#[tokio::test]
	async fn arguments_that_do_not_decode_are_unanswerable_naming_the_command() {
		let core = a_core_of_its_own("invoke-undecoded");
		crate::db::install(&core);

		let answer = dispatch(&core, "section_create", json!({ "spaceId": 1 })).await;

		let Some(Answer::Unanswerable(detail)) = answer else {
			panic!("the call was answered: {answer:?}");
		};
		assert!(detail.contains("section_create"), "{detail}");
	}
}
