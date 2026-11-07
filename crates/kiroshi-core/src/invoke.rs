use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::conversations::commands::{
	conversation_bots, conversation_send_turn, conversations_page, list_conversations, main_chat,
	message_page,
};
use crate::conversations::contract::SentMessage;
use crate::core_context::Core;
use crate::hosting::caller::Caller;
use crate::missions::commands::{list_missions, mission_detail_of, missions_board};
use crate::spaces::read::list_spaces;

pub const PATH: &str = "/api/invoke/{command}";

pub const COMMANDS: [&str; 10] = [
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InSpace {
	space_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaybeInSpace {
	space_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpacePage {
	space_id: String,
	cursor: Option<String>,
	limit: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessagePage {
	conversation_id: String,
	before_seq: Option<i64>,
	limit: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MainChat {
	bot_id: String,
	space_id: Option<String>,
}

#[derive(Deserialize)]
struct SentTurn {
	message: SentMessage,
	summoned: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InConversation {
	conversation_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfMission {
	mission_id: String,
}

pub fn handles(command: &str) -> bool {
	COMMANDS.contains(&command)
}

pub async fn dispatch(core: &Core, command: &str, arguments: Value) -> Option<Answer> {
	Some(match command {
		"space_list" => answered(list_spaces(core).await),
		"conversation_bots" => match read::<MaybeInSpace>(command, arguments) {
			Ok(asked) => answered(conversation_bots(core, asked.space_id).await),
			Err(unread) => unread,
		},
		"conversation_list" => match read::<InSpace>(command, arguments) {
			Ok(asked) => answered(list_conversations(core, asked.space_id).await),
			Err(unread) => unread,
		},
		"conversation_page" => match read::<SpacePage>(command, arguments) {
			Ok(asked) => {
				answered(conversations_page(core, asked.space_id, asked.cursor, asked.limit).await)
			}
			Err(unread) => unread,
		},
		"conversation_message_page" => match read::<MessagePage>(command, arguments) {
			Ok(asked) => answered(
				message_page(core, asked.conversation_id, asked.before_seq, asked.limit).await,
			),
			Err(unread) => unread,
		},
		"conversation_main_chat" => match read::<MainChat>(command, arguments) {
			Ok(asked) => answered(main_chat(core, asked.bot_id, asked.space_id).await),
			Err(unread) => unread,
		},
		"conversation_send_turn" => match read::<SentTurn>(command, arguments) {
			Ok(asked) => answered(
				conversation_send_turn(core, Caller::Host, asked.message, asked.summoned).await,
			),
			Err(unread) => unread,
		},
		"mission_list" => match read::<InConversation>(command, arguments) {
			Ok(asked) => answered(list_missions(core, asked.conversation_id).await),
			Err(unread) => unread,
		},
		"mission_board" => answered(missions_board(core).await),
		"mission_detail" => match read::<OfMission>(command, arguments) {
			Ok(asked) => answered(mission_detail_of(core, asked.mission_id).await),
			Err(unread) => unread,
		},
		_ => return None,
	})
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
}
