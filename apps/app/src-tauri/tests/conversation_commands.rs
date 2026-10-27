mod bundled;
mod common;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use bundled::bundled_bots;
use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::AgentState;
use kiroshi_app::bundles;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::db::repositories::conversations::DEFAULT_BOT_MODEL;
use kiroshi_app::environment::contract::{EnvOwner, ResolvedEnv};
use kiroshi_app::environment::store;
use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const TURN: &str = "t1";
const BOT: &str = "default";

struct Home(AppOfItsOwn);

impl Home {
	fn new() -> Self {
		Self(an_app_of_its_own("conversation-commands", mock_builder()))
	}

	fn app(&self) -> App<MockRuntime> {
		let app = host(&self.0.config().identifier);
		app.manage(db::bootstrap(app.handle()));
		app
	}
}

fn host(identifier: &str) -> App<MockRuntime> {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = identifier.into();
	mock_builder().invoke_handler(invoke_handler()).build(context).expect("app builds")
}

fn app_without_a_database() -> AppOfItsOwn {
	an_app_of_its_own(
		"conversation-commands-no-database",
		mock_builder()
			.invoke_handler(invoke_handler())
			.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir)),
	)
}

fn window(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app, "main", Default::default()).build().expect("window builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

fn a_bot_and_its_chat(window: &WebviewWindow<MockRuntime>) -> (Value, String) {
	let chat = call(window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
	let listed = call(window, "conversation_bots", json!({})).expect("the bots");
	let bot = listed
		.as_array()
		.and_then(|bots| bots.iter().find(|bot| bot["id"] == json!(BOT)))
		.cloned()
		.expect("the chat seated the bot it was asked for");
	(bot, conversation_id)
}

fn a_turn(conversation_id: &str) -> Value {
	json!({ "turn": { "id": TURN, "conversationId": conversation_id, "startedAt": 1 } })
}

fn a_user_message(id: &str, conversation_id: &str, content: &str, created_at: i64) -> Value {
	json!({ "message": {
		"id": id,
		"conversationId": conversation_id,
		"turnId": TURN,
		"authorBotId": null,
		"repliedToMessageId": null,
		"content": content,
		"createdAt": created_at
	}})
}

fn an_answer_to(
	target: &str,
	id: &str,
	conversation_id: &str,
	content: &str,
	created_at: i64,
) -> Value {
	let mut message = a_user_message(id, conversation_id, content, created_at);
	message["message"]["repliedToMessageId"] = json!(target);
	message
}

fn a_streaming_reply(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	index: i64,
) -> String {
	let id = format!("m{index}");
	call(
		window,
		"conversation_open_assistant_message",
		json!({ "message": {
			"id": id,
			"conversationId": conversation_id,
			"turnId": TURN,
			"authorBotId": BOT,
			"repliedToMessageId": null,
			"createdAt": index
		}}),
	)
	.expect("the reply is opened");
	call(
		window,
		"conversation_append_text",
		json!({ "id": id, "delta": format!("message {index}") }),
	)
	.expect("the reply streams");
	id
}

fn said(window: &WebviewWindow<MockRuntime>, conversation_id: &str, index: i64) {
	if index % 2 == 1 {
		call(
			window,
			"conversation_append_user_message",
			a_user_message(
				&format!("m{index}"),
				conversation_id,
				&format!("message {index}"),
				index,
			),
		)
		.expect("the message is appended");
		return;
	}
	let id = a_streaming_reply(window, conversation_id, index);
	call(window, "conversation_finalize_message", json!({ "id": id, "completion": "complete" }))
		.expect("the reply ends");
}

fn a_run(conversation_id: &str, bot: &Value, started_at: i64) -> Value {
	json!({ "conversationId": conversation_id, "botId": bot["id"], "startedAt": started_at })
}

fn a_rotation(
	conversation_id: &str,
	bot: &Value,
	started_at: i64,
	rotating: &Value,
	reason: &str,
) -> Value {
	json!({
		"conversationId": conversation_id,
		"botId": bot["id"],
		"startedAt": started_at,
		"runtimeSessionId": rotating["id"],
		"reason": reason
	})
}

fn a_provider_session(
	conversation_id: &str,
	bot_id: &Value,
	run: &Value,
	provider_session_id: &str,
) -> Value {
	json!({
		"conversationId": conversation_id,
		"botId": bot_id,
		"runtimeSessionId": run["id"],
		"providerSessionId": provider_session_id
	})
}

fn checkpoint(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	bot: &Value,
	runtime_session_id: &str,
	created_at: i64,
) -> Value {
	call(
		window,
		"conversation_capture_checkpoint",
		json!({
			"conversationId": conversation_id,
			"botId": bot["id"],
			"runtimeSessionId": runtime_session_id,
			"createdAt": created_at
		}),
	)
	.expect("the checkpoint is considered")
}

fn a_bot_plugin(bot_id: &str) -> Value {
	json!({ "kind": "bot", "id": bot_id })
}

fn a_reference(conversation_id: &str, message_id: &str) -> Value {
	json!({ "conversationId": conversation_id, "messageId": message_id })
}

fn a_page(conversation_id: &str, before_seq: Option<i64>, limit: u32) -> Value {
	json!({ "conversationId": conversation_id, "beforeSeq": before_seq, "limit": limit })
}

fn a_pin(conversation_id: &str, message_id: &str, block_index: i64, pinned_at: i64) -> Value {
	json!({
		"conversationId": conversation_id,
		"messageId": message_id,
		"blockIndex": block_index,
		"pinnedAt": pinned_at
	})
}

fn a_bubble(conversation_id: &str, message_id: &str, block_index: i64) -> Value {
	json!({
		"conversationId": conversation_id,
		"messageId": message_id,
		"blockIndex": block_index
	})
}

fn pins(window: &WebviewWindow<MockRuntime>, conversation_id: &str) -> Vec<(String, Value, Value)> {
	call(window, "conversation_pinned_messages", json!({ "conversationId": conversation_id }))
		.expect("the pins")
		.as_array()
		.expect("the pins come back as a list")
		.iter()
		.map(|pin| {
			(
				pin["message"]["id"].as_str().expect("an id").to_owned(),
				pin["blockIndex"].clone(),
				pin["pinnedAt"].clone(),
			)
		})
		.collect()
}

fn occurrences(text: &str, needle: &str) -> usize {
	text.matches(needle).count()
}

fn walked_back(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	page: u32,
) -> (Vec<i64>, usize) {
	let mut reached: Vec<i64> = Vec::new();
	let mut cursor: Option<i64> = None;
	let mut crossings = 0;
	loop {
		let crossing =
			call(window, "conversation_message_page", a_page(conversation_id, cursor, page))
				.expect("the page");
		let mut held = seqs(&crossing);
		assert!(!held.is_empty(), "a page that claimed there was more came back empty");
		crossings += 1;
		cursor = held.first().copied();
		held.append(&mut reached);
		reached = held;
		if crossing["hasMore"] == json!(false) {
			return (reached, crossings);
		}
	}
}

fn seqs(page: &Value) -> Vec<i64> {
	page["messages"]
		.as_array()
		.expect("the page holds messages")
		.iter()
		.map(|message| message["seq"].as_i64().expect("a seq"))
		.collect()
}

#[test]
fn a_host_without_a_database_answers_a_registered_command_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_main_chat", json!({ "botId": BOT })),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

#[test]
fn a_turn_written_over_ipc_reads_back_as_the_page_the_reader_displays() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	assert_eq!(bot["id"], json!(BOT));
	assert_eq!(bot["name"], json!("Claude"));
	assert_eq!(bot["model"], json!(DEFAULT_BOT_MODEL));
	assert!(bot["createdAt"].is_i64(), "the bot crossed without a camelCase moment: {bot}");

	assert_eq!(call(&window, "conversation_start_turn", a_turn(&conversation)), Ok(json!(1)));
	assert_eq!(
		call(
			&window,
			"conversation_append_user_message",
			a_user_message("m1", &conversation, "hello", 2)
		),
		Ok(json!(1))
	);
	assert_eq!(
		call(
			&window,
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": "m2",
				"conversationId": conversation,
				"turnId": TURN,
				"authorBotId": BOT,
				"repliedToMessageId": "m1",
				"createdAt": 3
			}})
		),
		Ok(json!(2))
	);
	for delta in ["hi ", "there"] {
		assert_eq!(
			call(&window, "conversation_append_text", json!({ "id": "m2", "delta": delta })),
			Ok(Value::Null)
		);
	}
	assert_eq!(
		call(
			&window,
			"conversation_finalize_message",
			json!({ "id": "m2", "completion": "complete" })
		),
		Ok(Value::Null)
	);
	assert_eq!(
		call(&window, "conversation_complete_turn", json!({ "id": TURN, "completedAt": 4 })),
		Ok(Value::Null)
	);

	let page = call(&window, "conversation_message_page", a_page(&conversation, None, 50));

	assert_eq!(
		page,
		Ok(json!({
			"conversationId": conversation,
			"arrivals": [],
			"hasMore": false,
			"messages": [
				{
					"id": "m1",
					"conversationId": conversation,
					"turnId": TURN,
					"seq": 1,
					"role": "user",
					"content": "hello",
					"completion": "complete",
					"createdAt": 2,
					"authorBotId": null,
					"authorAccountId": null,
					"authorName": null,
					"writtenFrom": "here",
					"repliedToMessageId": null,
					"runtimeSessionId": null,
				},
				{
					"id": "m2",
					"conversationId": conversation,
					"turnId": TURN,
					"seq": 2,
					"role": "assistant",
					"content": "hi there",
					"completion": "complete",
					"createdAt": 3,
					"authorBotId": BOT,
					"authorAccountId": null,
					"authorName": null,
					"writtenFrom": null,
					"repliedToMessageId": "m1",
					"runtimeSessionId": null,
				}
			]
		}))
	);
}

#[test]
fn opening_a_run_answers_with_the_row_a_runtime_scope_is_built_from() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	let opened = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 17))
		.expect("the run opens");
	let replacement =
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 18))
			.expect("the next run opens");

	assert_eq!(opened["conversationId"], json!(conversation));
	assert_eq!(opened["botId"], bot["id"]);
	assert_eq!(opened["seq"], json!(1), "the lineage did not start at 1");
	assert_eq!(opened["startedAt"], json!(17));
	assert!(
		opened["id"].as_str().is_some_and(|id| !id.is_empty()),
		"a run crossed without an id of its own: {opened}"
	);
	assert_eq!(replacement["seq"], json!(2), "the restart did not continue the lineage");
	assert_ne!(replacement["id"], opened["id"], "the restart reused the replaced run's id");
}

#[test]
fn the_id_a_run_answers_under_is_recorded_once_and_only_while_it_is_live() {
	const ANNOUNCED: &str = "claude-9f3c";

	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 1))
		.expect("the run opens");
	let record = |body: Value| call(&window, "conversation_record_provider_session", body);

	let recorded = record(a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED));
	let replayed = record(a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED));
	let disagreed = record(a_provider_session(&conversation, &bot["id"], &run, "claude-0000"));
	let outsider = record(a_provider_session(&conversation, &json!("nobody"), &run, "claude-1111"));

	let replacement = call(
		&window,
		"conversation_open_runtime_session",
		a_rotation(&conversation, &bot, 2, &run, "the context filled up"),
	)
	.expect("the run that replaces it opens");
	let late = record(a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED));
	let fresh = record(a_provider_session(&conversation, &bot["id"], &replacement, "claude-4d2a"));

	let stale_write = Err(json!({ "kind": "storage", "failure": { "kind": "staleWrite" } }));
	assert_eq!(recorded, Ok(Value::Null), "the live run would not take the id it answers under");
	assert_eq!(replayed, Ok(Value::Null), "the same callback twice was not answered as one write");
	assert_eq!(disagreed, stale_write, "a second, different id was not refused: {disagreed:?}");
	assert_eq!(
		outsider.as_ref().err().and_then(|failure| failure["kind"].as_str()),
		Some("storage"),
		"a run named under another bot was refused as something else: {outsider:?}"
	);
	assert_eq!(late, stale_write, "a replaced run still took an id: {late:?}");
	assert_eq!(
		fresh,
		Ok(Value::Null),
		"the replacement had been written by the run it replaced: {fresh:?}"
	);
}

#[test]
fn a_run_opened_after_a_crash_continues_the_lineage_instead_of_reusing_its_names() {
	let home = Home::new();

	let crashed = {
		let app = home.app();
		let window = window(&app);
		let (bot, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 1))
			.expect("the run the host dies under opens")
	};

	let app = home.app();
	let window = window(&app);
	let (bot, conversation) = a_bot_and_its_chat(&window);
	let recovered =
		call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
			.expect("the run after the crash opens");

	assert_eq!(crashed["seq"], json!(1), "the lineage did not start at 1");
	assert_eq!(recovered["seq"], json!(2), "the launch after the crash restarted the lineage");
	assert_ne!(recovered["id"], crashed["id"], "the run after the crash took the crashed one's id");
}

#[test]
fn opening_a_run_for_a_bot_the_conversation_does_not_hold_is_refused_as_storage() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	let refused = call(
		&window,
		"conversation_open_runtime_session",
		json!({ "conversationId": conversation, "botId": "nobody", "startedAt": 1 }),
	);

	assert_eq!(
		refused.as_ref().err().and_then(|failure| failure["kind"].as_str()),
		Some("storage"),
		"a run opened for an outsider was refused as something else: {refused:?}"
	);
}

#[test]
fn the_newest_page_comes_first_and_its_oldest_seq_walks_back_to_the_rest() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	for index in 0..5 {
		call(
			&window,
			"conversation_append_user_message",
			a_user_message(&format!("m{index}"), &conversation, "hello", 1),
		)
		.expect("the message is appended");
	}

	let newest = call(&window, "conversation_message_page", a_page(&conversation, None, 3))
		.expect("the page");
	let oldest_held = seqs(&newest).first().copied().expect("the page holds messages");
	let older =
		call(&window, "conversation_message_page", a_page(&conversation, Some(oldest_held), 3))
			.expect("the older page");

	assert_eq!(seqs(&newest), vec![3, 4, 5], "the first page was not the newest one");
	assert_eq!(newest["hasMore"], json!(true), "a full page claimed there was nothing older");
	assert_eq!(seqs(&older), vec![1, 2], "the cursor skipped or repeated a seq");
	assert_eq!(older["hasMore"], json!(false), "a partial page offered more");
}

#[test]
fn a_refused_write_keeps_the_shape_that_says_what_disagreed() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	)
	.expect("the message is appended");

	let replayed = call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	);
	let claimed = call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "bonjour", 2),
	);
	let reopened = call(
		&window,
		"conversation_finalize_message",
		json!({ "id": "m1", "completion": "failed" }),
	);

	assert_eq!(replayed, Ok(json!(1)), "a replayed append was refused");
	assert_eq!(
		claimed,
		Err(json!({ "kind": "conflict", "id": "m1", "field": "content" })),
		"a second message under one id was not refused as a conflict"
	);
	assert_eq!(
		reopened,
		Err(json!({
			"kind": "invalidTransition",
			"id": "m1",
			"from": "complete",
			"to": "failed"
		})),
		"a message that had already ended was given a second ending"
	);
}

#[test]
fn a_history_longer_than_the_old_snapshot_cap_reads_back_whole_after_a_relaunch() {
	const HISTORY: i64 = 250;
	const PAGE: u32 = 20;

	let home = Home::new();

	{
		let app = home.app();
		let window = window(&app);
		let (_, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_start_turn", a_turn(&conversation))
			.expect("the turn is started");
		for index in 1..=HISTORY {
			call(
				&window,
				"conversation_append_user_message",
				a_user_message(&format!("m{index}"), &conversation, "hello", index),
			)
			.expect("the message is appended");
		}
	}

	let app = home.app();
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);

	let (reached, crossings) = walked_back(&window, &conversation, PAGE);

	assert_eq!(
		reached,
		(1..=HISTORY).collect::<Vec<_>>(),
		"the walk back skipped, repeated or reordered a message the reader had seen"
	);
	assert_eq!(crossings, 13, "the reader paid for more crossings than the history needed");
}

#[test]
fn a_pin_is_read_back_from_any_point_of_the_history_whatever_page_the_reader_holds() {
	const HISTORY: i64 = 120;
	const PAGE: u32 = 20;

	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	for index in 1..=HISTORY {
		said(&window, &conversation, index);
	}

	call(&window, "conversation_pin_message", a_pin(&conversation, "m2", 1, 500))
		.expect("the oldest pin is stored");
	call(&window, "conversation_pin_message", a_pin(&conversation, "m2", 1, 900))
		.expect("a second pin on the same bubble is accepted");
	call(&window, "conversation_pin_message", a_pin(&conversation, "m2", 0, 800))
		.expect("another bubble of the same message is pinned");
	call(&window, "conversation_pin_message", a_pin(&conversation, "m110", 0, 600))
		.expect("the newer pin is stored");
	let newest = call(&window, "conversation_message_page", a_page(&conversation, None, PAGE))
		.expect("the newest page");

	assert!(
		!seqs(&newest).contains(&2),
		"the fixture loaded a page that already holds the oldest pinned message"
	);
	assert_eq!(
		pins(&window, &conversation),
		vec![
			("m110".to_owned(), json!(0), json!(600)),
			("m2".to_owned(), json!(0), json!(800)),
			("m2".to_owned(), json!(1), json!(500)),
		],
		"the pins came back out of order, moved their moment or missed the loaded window"
	);

	call(&window, "conversation_unpin_message", a_bubble(&conversation, "m110", 0))
		.expect("the pin is cleared");
	call(&window, "conversation_unpin_message", a_bubble(&conversation, "m110", 0))
		.expect("a bubble with no pin was refused");
	call(&window, "conversation_unpin_message", a_bubble(&conversation, "m2", 0))
		.expect("one bubble of a message is cleared");

	assert_eq!(
		pins(&window, &conversation),
		vec![("m2".to_owned(), json!(1), json!(500))],
		"clearing one pin took another with it"
	);
	assert_eq!(
		call(&window, "conversation_pin_message", a_pin(&conversation, "m999", 0, 700)),
		Err(json!({ "kind": "unknownMessage", "id": "m999" })),
		"a pin on a message the conversation does not hold was accepted"
	);
	assert_eq!(
		call(&window, "conversation_unpin_message", a_bubble(&conversation, "m999", 0)),
		Err(json!({ "kind": "unknownMessage", "id": "m999" })),
		"an unpin on a message the conversation does not hold was accepted"
	);
	assert_eq!(
		pins(&window, &conversation),
		vec![("m2".to_owned(), json!(1), json!(500))],
		"a refused pin rewrote the pins the conversation holds"
	);
}

#[test]
fn a_chat_past_the_fold_bound_survives_a_dead_host_with_nothing_lost_or_doubled() {
	const HISTORY: i64 = 230;
	const TAIL: i64 = 20;
	const PAGE: u32 = 20;
	const ANSWERED: &str = "m3";
	const PROMPT: &str = "p1";
	const PROMPT_TEXT: &str = "so where does that leave the roof?";

	let home = Home::new();

	{
		let app = home.app();
		let window = window(&app);
		let (_, conversation) = a_bot_and_its_chat(&window);
		call(&window, "conversation_start_turn", a_turn(&conversation))
			.expect("the turn is started");
		for index in 1..HISTORY {
			said(&window, &conversation, index);
		}
		a_streaming_reply(&window, &conversation, HISTORY);
	}

	let app = home.app();
	let window = window(&app);
	let (bot, conversation) = a_bot_and_its_chat(&window);

	let newest = call(&window, "conversation_message_page", a_page(&conversation, None, 1))
		.expect("the newest page");
	assert_eq!(
		newest["messages"][0],
		json!({
			"id": format!("m{HISTORY}"),
			"conversationId": conversation,
			"turnId": TURN,
			"seq": HISTORY,
			"role": "assistant",
			"content": format!("message {HISTORY}"),
			"completion": "interrupted",
			"createdAt": HISTORY,
			"authorBotId": BOT,
			"authorAccountId": null,
			"authorName": null,
			"writtenFrom": null,
			"repliedToMessageId": null,
			"runtimeSessionId": null,
		}),
		"the reply the dead host left came back as something else"
	);

	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 1))
		.expect("the run opens");
	let run = run["id"].as_str().expect("the run holds an id").to_owned();
	let folded = checkpoint(&window, &conversation, &bot, &run, 1);
	assert_eq!(
		folded["lastMessageSeq"],
		json!(HISTORY - TAIL),
		"the first fold stopped somewhere other than the edge of the tail"
	);
	assert!(folded["tokenCount"].as_i64().is_some_and(|count| count > 0));

	call(
		&window,
		"conversation_append_user_message",
		an_answer_to(ANSWERED, PROMPT, &conversation, PROMPT_TEXT, HISTORY + 1),
	)
	.expect("the prompt is appended");

	let again = checkpoint(&window, &conversation, &bot, &run, 2);
	assert_eq!(
		again["lastMessageSeq"],
		json!(HISTORY + 1 - TAIL),
		"the recovery point did not follow the messages the tail could no longer reach"
	);

	let context = call(
		&window,
		"conversation_bounded_context",
		json!({
			"conversationId": conversation,
			"botId": bot["id"],
			"runtimeSessionId": run,
			"promptMessageId": PROMPT
		}),
	)
	.expect("the context is rebuilt");
	let context = context.as_str().expect("the context crosses as text").to_owned();

	assert!(
		context.contains("The conversation so far:\n[elided]"),
		"a fold that could not reach the beginning did not say so: {context}"
	);
	assert_eq!(
		occurrences(&context, "message 211\n"),
		1,
		"the message between the two folds is in neither the summary nor the tail"
	);
	assert_eq!(occurrences(&context, "message 212\n"), 1, "the tail lost the message it opens on");
	assert_eq!(
		occurrences(&context, &format!("message {HISTORY}\n")),
		1,
		"the tail lost what the dead host had been saying"
	);
	assert!(
		context.contains("The message this one replies to:\nuri: kiroshi://c/")
			&& context.lines().any(|line| line.starts_with("from: user · from "))
			&& context.contains("\nclaude session: unknown\nmessage 3"),
		"an answer to an earlier message lost the target it points at: {context}"
	);
	assert_eq!(occurrences(&context, "message 3\n"), 1, "the answered message was carried twice");
	assert_eq!(occurrences(&context, PROMPT_TEXT), 1, "the prompt was carried twice");
	assert!(context.ends_with(PROMPT_TEXT), "the prompt was not the last thing the run is told");

	let (reached, _) = walked_back(&window, &conversation, PAGE);
	assert_eq!(
		reached,
		(1..=HISTORY + 1).collect::<Vec<_>>(),
		"the walk back skipped, repeated or reordered a message the reader had seen"
	);
	assert_eq!(
		call(&window, "conversation_message_page", a_page(&conversation, None, 1))
			.expect("the newest page")["messages"][0]["id"],
		json!(PROMPT),
		"the prompt is not where the reader last left it"
	);
}

fn an_identity(name: &str, model: &str, blot: Value) -> Value {
	json!({
		"name": name,
		"title": "Reviewer",
		"model": model,
		"avatarBlot": blot,
		"avatarImagePath": null,
		"instructions": "Answer with the file you would touch.",
		"deniedTools": []
	})
}

#[test]
fn a_bot_created_over_ipc_is_listed_described_and_deleted_with_its_chat() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", json!(42)) }),
	)
	.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["name"], json!("Nyx"));
	assert_eq!(created["title"], json!("Reviewer"));
	assert_eq!(created["model"], json!("sonnet"));
	assert_eq!(created.get("avatarAnimal"), None, "a bot still crossed with an animal");
	assert_eq!(created["avatarBlot"], json!(42));
	assert_eq!(created["avatarImagePath"], json!(null));
	assert_eq!(created["instructions"], json!("Answer with the file you would touch."));
	assert!(created["createdAt"].is_i64(), "a bot crossed without a camelCase moment: {created}");

	let chat = call(&window, "conversation_main_chat", json!({ "botId": id }))
		.expect("the chat the bot was created with");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	)
	.expect("the message is appended");

	let listed = call(&window, "conversation_bots", json!({})).expect("the bots");
	assert_eq!(
		listed.as_array().expect("a list").iter().map(|bot| bot["id"].clone()).collect::<Vec<_>>(),
		vec![json!(id)],
		"the bot that was created is not the one the list holds"
	);

	let updated = call(
		&window,
		"conversation_update_bot",
		json!({ "id": id, "identity": an_identity("Ada", "opus", Value::Null) }),
	)
	.expect("the bot is updated");
	assert_eq!(updated["name"], json!("Ada"));
	assert_eq!(updated["model"], json!("opus"), "a bot was not moved between models");
	assert_eq!(updated.get("avatarAnimal"), None, "an edited bot still crossed with an animal");
	assert_eq!(updated["avatarBlot"], json!(null), "a mark taken off a bot was kept");
	assert_eq!(updated["createdAt"], created["createdAt"], "an update moved the moment");

	assert_eq!(call(&window, "conversation_delete_bot", json!({ "id": id })), Ok(Value::Null));
	assert_eq!(call(&window, "conversation_bots", json!({})), Ok(json!([])));
	assert_eq!(
		call(
			&window,
			"conversation_message_page",
			json!({
				"conversationId": conversation,
				"beforeSeq": null,
				"limit": 20
			})
		),
		Ok(json!({
			"conversationId": conversation,
			"messages": [],
			"arrivals": [],
			"hasMore": false
		})),
		"the transcript of a deleted bot is still reachable"
	);
}

#[test]
fn a_blot_outside_the_closed_vocabulary_is_refused_before_it_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let blot = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", json!("chartreuse")) }),
	);

	assert!(blot.is_err(), "a colour outside the palette was accepted: {blot:?}");
	assert_eq!(
		call(&window, "conversation_bots", json!({})),
		Ok(json!([])),
		"a bot the boundary refused reached the file anyway"
	);
}

#[test]
fn a_model_label_outside_the_offered_aliases_is_stored_and_read_back_whole() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "claude-opus-4-1-20250805", json!(42)) }),
	)
	.expect("a bot on a label the host does not know");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["model"], json!("claude-opus-4-1-20250805"));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["model"].clone()),
		Ok(json!("claude-opus-4-1-20250805")),
		"a label the file holds came back changed"
	);

	assert_eq!(
		call(
			&window,
			"conversation_update_bot",
			json!({ "id": id, "identity": an_identity("Nyx", "fable", json!(42)) })
		)
		.map(|bot| bot["model"].clone()),
		Ok(json!("fable"))
	);
}

#[test]
fn the_tools_a_bot_denies_are_written_to_its_agent_file_and_read_back_from_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut held_back = an_identity("Nyx", "sonnet", json!(42));
	held_back["deniedTools"] = json!(["Bash", "Edit", "NotebookEdit", "Write"]);

	let created = call(&window, "conversation_create_bot", json!({ "identity": held_back }))
		.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["deniedTools"], json!(["Bash", "Edit", "NotebookEdit", "Task", "Write"]));
	assert_eq!(created["changesNothing"], json!(true));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["changesNothing"].clone()),
		Ok(json!(true)),
		"the file the session is promoted onto denies nothing"
	);

	let mut one_tool = an_identity("Nyx", "sonnet", json!(42));
	one_tool["deniedTools"] = json!(["WebFetch"]);
	let updated =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": one_tool }))
			.expect("the bot is updated");

	assert_eq!(updated["deniedTools"], json!(["WebFetch"]), "a denial outlived the list");
	assert_eq!(updated["changesNothing"], json!(false));
}

#[test]
fn the_rules_a_bot_is_given_are_written_to_its_settings_file_and_read_back_from_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut ruled = an_identity("Nyx", "sonnet", json!(42));
	ruled["permissions"] = json!({
		"defaultMode": "plan",
		"allow": ["Read"],
		"ask": [],
		"deny": ["Bash(rm:*)"]
	});

	let created = call(&window, "conversation_create_bot", json!({ "identity": ruled.clone() }))
		.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	assert_eq!(created["permissions"], ruled["permissions"]);

	let root = bundles::root(app.handle()).expect("the bundle root");
	let path = bundles::dir(&root, &id).expect("the bundle is held").join("settings.json");
	std::fs::write(
		&path,
		json!({ "hooks": "kept", "permissions": { "deny": ["Bash(rm:*)"], "unknown": 1 } })
			.to_string(),
	)
	.expect("a file the bot wrote itself");

	let mut opened = ruled.clone();
	opened["permissions"] = json!({
		"defaultMode": "bypassPermissions",
		"allow": [],
		"ask": ["Edit"],
		"deny": []
	});
	let updated = call(&window, "conversation_update_bot", json!({ "id": id, "identity": opened }))
		.expect("the bot is updated");

	assert_eq!(updated["permissions"]["defaultMode"], json!("auto"), "a refused mode was written");
	assert_eq!(updated["permissions"]["ask"], json!(["Edit"]));
	assert_eq!(updated["permissions"]["deny"], json!([]));

	let written: Value =
		serde_json::from_str(&std::fs::read_to_string(&path).expect("the settings file"))
			.expect("the settings file holds an object");

	assert_eq!(written["hooks"], json!("kept"), "a key the panel does not own was overwritten");
	assert_eq!(written["permissions"]["unknown"], json!(1));
}

#[test]
fn the_rules_the_panel_reads_are_the_stored_ones_and_never_the_file_it_writes() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut held_back = an_identity("Nyx", "sonnet", json!(42));
	held_back["deniedTools"] = json!(["Bash", "Edit", "NotebookEdit", "Write"]);
	held_back["permissions"] = json!({
		"defaultMode": "auto",
		"allow": [],
		"ask": [],
		"deny": ["Bash", "Edit", "Write", "NotebookEdit"]
	});

	let created =
		call(&window, "conversation_create_bot", json!({ "identity": held_back.clone() }))
			.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();

	let root = bundles::root(app.handle()).expect("the bundle root");
	std::fs::remove_file(
		bundles::dir(&root, &id).expect("the bundle is held").join("settings.json"),
	)
	.expect("the file the panel writes goes away");

	let listed = call(&window, "conversation_bots", json!({})).expect("the bots");

	assert_eq!(listed[0]["changesNothing"], json!(true));
	assert_eq!(
		listed[0]["permissions"], held_back["permissions"],
		"a file that is gone took the stored rules with it"
	);
}

#[test]
fn a_write_naming_a_bot_that_is_gone_crosses_as_an_unknown_bot() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", Value::Null) }),
	)
	.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();
	call(&window, "conversation_delete_bot", json!({ "id": id })).expect("the bot is deleted");

	assert_eq!(
		call(&window, "conversation_delete_bot", json!({ "id": id })),
		Err(json!({ "kind": "unknownBot", "id": id }))
	);
	assert_eq!(
		call(
			&window,
			"conversation_update_bot",
			json!({ "id": id, "identity": an_identity("Ada", "sonnet", Value::Null) })
		),
		Err(json!({ "kind": "unknownBot", "id": id }))
	);
}

fn avatar_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("avatars")
}

fn stored_avatars(app: &App<MockRuntime>) -> Vec<String> {
	let Ok(entries) = std::fs::read_dir(avatar_dir(app)) else {
		return Vec::new();
	};
	let mut names: Vec<String> =
		entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
	names.sort();
	names
}

fn a_picture(width: u32, height: u32, format: image::ImageFormat) -> Vec<u8> {
	let mut canvas = image::RgbImage::new(width, height);
	for (x, y, pixel) in canvas.enumerate_pixels_mut() {
		*pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 64]);
	}
	let mut encoded = std::io::Cursor::new(Vec::new());
	image::DynamicImage::ImageRgb8(canvas)
		.write_to(&mut encoded, format)
		.expect("the fixture encodes");
	encoded.into_inner()
}

fn a_png(width: u32, height: u32) -> Vec<u8> {
	a_picture(width, height, image::ImageFormat::Png)
}

fn an_upload(id: &str, bytes: &[u8]) -> Value {
	json!({ "id": id, "bytes": bytes })
}

fn a_bot(window: &WebviewWindow<MockRuntime>, name: &str) -> String {
	call(
		window,
		"conversation_create_bot",
		json!({ "identity": an_identity(name, "sonnet", json!(42)) }),
	)
	.expect("the bot is created")["id"]
		.as_str()
		.expect("the bot holds an id")
		.to_owned()
}

fn wearing(window: &WebviewWindow<MockRuntime>, id: &str) -> Value {
	call(window, "conversation_bots", json!({}))
		.expect("the bots")
		.as_array()
		.expect("a list")
		.iter()
		.find(|bot| bot["id"] == json!(id))
		.expect("the bot is listed")["avatarImagePath"]
		.clone()
}

#[test]
fn an_uploaded_picture_is_stored_squared_beside_the_database_and_crosses_as_a_path() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	let worn = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(200, 80)))
		.expect("the picture is stored");

	let recorded = worn["avatarImagePath"].as_str().expect("a path crossed").to_owned();
	assert_eq!(
		Path::new(&recorded).parent(),
		Some(avatar_dir(&app).as_path()),
		"a picture was stored somewhere other than the directory the asset scope covers"
	);
	assert_eq!(Path::new(&recorded).extension().and_then(|it| it.to_str()), Some("png"));
	assert_eq!(stored_avatars(&app).len(), 1, "one upload left more than one file");
	let stored = image::load_from_memory_with_format(
		&std::fs::read(&recorded).expect("the stored file is readable"),
		image::ImageFormat::Png,
	)
	.expect("the stored file decodes as png");
	assert_eq!(
		image::GenericImageView::dimensions(&stored),
		(512, 512),
		"a picture reached the disk without being squared and resized"
	);
	assert_eq!(wearing(&window, &id), json!(recorded), "the list answers another path");
	assert_eq!(
		worn["avatarBlot"],
		json!(42),
		"an uploaded picture took the blot the bot falls back to with it"
	);
}

#[test]
fn a_jpeg_is_accepted_and_stored_as_the_one_format() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	let worn = call(
		&window,
		"conversation_set_bot_avatar_image",
		an_upload(&id, &a_picture(64, 90, image::ImageFormat::Jpeg)),
	)
	.expect("the picture is stored");

	let recorded = worn["avatarImagePath"].as_str().expect("a path crossed");
	assert_eq!(
		image::guess_format(&std::fs::read(recorded).expect("readable")).expect("a format"),
		image::ImageFormat::Png
	);
}

#[test]
fn a_picture_the_host_refuses_leaves_nothing_on_the_disk_and_nothing_on_the_bot() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, b"GIF89a\0\0\0\0\0\0")),
		Err(json!({ "kind": "rejectedAvatarImage", "reason": { "kind": "unknownFormat" } })),
		"a format this build cannot decode was accepted"
	);
	assert_eq!(
		call(
			&window,
			"conversation_set_bot_avatar_image",
			an_upload(&id, b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>")
		),
		Err(json!({ "kind": "rejectedAvatarImage", "reason": { "kind": "unknownFormat" } })),
		"markup named an image was accepted"
	);
	let torn =
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(40, 40)[..24]));
	assert!(
		matches!(&torn, Err(refusal) if refusal["kind"] == json!("rejectedAvatarImage")
			&& refusal["reason"]["kind"] == json!("undecodable")),
		"bytes that claimed a format and were not one crossed as something else: {torn:?}"
	);

	assert_eq!(stored_avatars(&app), Vec::<String>::new(), "a refused picture reached the disk");
	assert_eq!(wearing(&window, &id), json!(null), "a refused picture reached the bot");
}

#[test]
fn a_picture_over_the_limit_is_refused_with_the_limit_it_broke() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let limit = 5 * 1024 * 1024;

	let refused =
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &vec![0u8; limit + 1]));

	assert_eq!(
		refused,
		Err(json!({
			"kind": "rejectedAvatarImage",
			"reason": { "kind": "tooLarge", "bytes": limit + 1, "limit": limit }
		}))
	);
	assert_eq!(stored_avatars(&app), Vec::<String>::new());
}

#[test]
fn replacing_a_picture_leaves_exactly_one_file_behind() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");

	let first = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30)))
		.expect("the first picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();
	let second = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(48, 20)))
		.expect("the second picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();

	assert_ne!(first, second, "a replacement was written over the file it replaced");
	assert!(!Path::new(&first).exists(), "the replaced picture stayed behind");
	assert!(Path::new(&second).exists(), "the replacement is not there");
	assert_eq!(stored_avatars(&app).len(), 1);
	assert_eq!(wearing(&window, &id), json!(second));
}

#[test]
fn deleting_a_bot_leaves_no_picture_behind_and_leaves_every_other_bot_its_own() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let doomed = a_bot(&window, "Nyx");
	let spared = a_bot(&window, "Ada");
	call(&window, "conversation_set_bot_avatar_image", an_upload(&doomed, &a_png(30, 30)))
		.expect("the doomed bot's picture is stored");
	let kept =
		call(&window, "conversation_set_bot_avatar_image", an_upload(&spared, &a_png(30, 30)))
			.expect("the spared bot's picture is stored")["avatarImagePath"]
			.as_str()
			.expect("a path")
			.to_owned();

	call(&window, "conversation_delete_bot", json!({ "id": doomed })).expect("the bot is deleted");

	assert_eq!(stored_avatars(&app).len(), 1, "a deleted bot left its picture behind");
	assert!(Path::new(&kept).exists(), "deleting one bot took another bot's picture");
}

#[test]
fn an_identity_written_without_a_path_takes_the_picture_off_and_one_written_with_it_keeps_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let worn = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30)))
		.expect("the picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();

	let mut echoed = an_identity("Nyx", "sonnet", json!(42));
	echoed["avatarImagePath"] = json!(worn);
	let unchanged =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": echoed }))
			.expect("the bot is updated");

	assert_eq!(unchanged["avatarImagePath"], json!(worn), "an unrelated edit dropped the picture");
	assert!(Path::new(&worn).exists(), "an unrelated edit swept the picture");

	let bare = call(
		&window,
		"conversation_update_bot",
		json!({ "id": id, "identity": an_identity("Nyx", "sonnet", json!(42)) }),
	)
	.expect("the bot is updated");

	assert_eq!(bare["avatarImagePath"], json!(null));
	assert_eq!(stored_avatars(&app), Vec::<String>::new(), "the picture taken off stayed on disk");
}

#[test]
fn a_recorded_path_outside_the_avatar_directory_is_refused_rather_than_read() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let outside = app.path().app_data_dir().expect("data dir").join("elsewhere.png");
	std::fs::write(&outside, a_png(20, 20)).expect("the file outside exists");
	std::fs::create_dir_all(avatar_dir(&app)).expect("the avatar directory exists");

	for escaping in [
		outside.to_string_lossy().into_owned(),
		avatar_dir(&app).join("..").join("elsewhere.png").to_string_lossy().into_owned(),
		"/etc/passwd".to_owned(),
	] {
		let mut identity = an_identity("Nyx", "sonnet", json!(42));
		identity["avatarImagePath"] = json!(escaping);
		let updated =
			call(&window, "conversation_update_bot", json!({ "id": id, "identity": identity }))
				.expect("the bot is updated");

		assert_eq!(
			updated["avatarImagePath"],
			json!(null),
			"a path out of the avatar directory was handed to the webview: {escaping}"
		);
		assert_eq!(wearing(&window, &id), json!(null));
	}

	assert!(outside.exists(), "a refused path was read and swept anyway");
	assert!(Path::new("/etc/passwd").exists(), "the sweep reached outside its own directory");
}

#[test]
fn a_picture_missing_from_the_disk_reads_as_no_picture_rather_than_a_broken_one() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let worn = call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30)))
		.expect("the picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned();

	std::fs::remove_file(&worn).expect("the picture is removed from under the row");

	assert_eq!(wearing(&window, &id), json!(null));
	assert!(
		call(&window, "conversation_bots", json!({})).is_ok(),
		"a read of the roster did not survive a missing file"
	);
}

#[test]
fn an_upload_naming_a_bot_that_is_gone_is_refused_before_any_file_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	call(&window, "conversation_delete_bot", json!({ "id": id })).expect("the bot is deleted");

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(&id, &a_png(30, 30))),
		Err(json!({ "kind": "unknownBot", "id": id }))
	);
	assert_eq!(stored_avatars(&app), Vec::<String>::new());
}

#[test]
fn a_host_without_a_database_refuses_an_upload_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_set_bot_avatar_image", an_upload(BOT, &a_png(20, 20))),
		Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }))
	);
}

#[test]
fn a_launch_reads_the_roster_it_finds_and_never_writes_a_bot_back_into_it() {
	let home = Home::new();

	let id = {
		let app = home.app();
		let window = window(&app);
		assert_eq!(
			call(&window, "conversation_bots", json!({})),
			Ok(json!([])),
			"a fresh install came up with a bot nobody created"
		);
		let id = a_bot(&window, "Nyx");
		assert_eq!(
			call(&window, "conversation_bots", json!({})).map(|bots| bots.as_array().map(Vec::len)),
			Ok(Some(1))
		);
		id
	};

	{
		let app = home.app();
		let window = window(&app);
		assert_eq!(
			call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["id"].clone()),
			Ok(json!(id)),
			"a relaunch did not find the bot the last one wrote"
		);
		call(&window, "conversation_delete_bot", json!({ "id": id })).expect("the last bot goes");
		assert_eq!(call(&window, "conversation_bots", json!({})), Ok(json!([])));
	}

	let app = home.app();
	let window = window(&app);
	assert_eq!(
		call(&window, "conversation_bots", json!({})),
		Ok(json!([])),
		"a launch after the last bot was deleted brought one back"
	);
}

fn attachment_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("attachments")
}

fn a_new_bot_and_its_chat(window: &WebviewWindow<MockRuntime>, name: &str) -> (String, String) {
	let id = a_bot(window, name);
	let conversation_id = call(window, "conversation_main_chat", json!({ "botId": id }))
		.expect("the chat")["id"]
		.as_str()
		.expect("the chat holds an id")
		.to_owned();
	(id, conversation_id)
}

fn an_attachment(name: &str, bytes: &[u8]) -> Value {
	json!({ "name": name, "bytes": bytes })
}

fn an_attachment_stored_for(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	bytes: &[u8],
) -> String {
	call(
		window,
		"chat_store_attachments",
		json!({ "conversationId": conversation_id, "attachments": [an_attachment("a.txt", bytes)] }),
	)
	.expect("the attachment is stored")[0]
		.as_str()
		.expect("a path")
		.to_owned()
}

#[test]
fn attachments_submitted_for_a_chat_are_written_under_it_and_cross_as_absolute_paths() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let (_, conversation_id) = a_new_bot_and_its_chat(&window, "Nyx");

	let stored = call(
		&window,
		"chat_store_attachments",
		json!({
			"conversationId": conversation_id,
			"attachments": [
				an_attachment("notes.md", b"first"),
				an_attachment("../../etc/passwd", b"second"),
			]
		}),
	)
	.expect("the attachments are stored");

	let paths: Vec<String> = stored
		.as_array()
		.expect("a list of paths")
		.iter()
		.map(|path| path.as_str().expect("a path").to_owned())
		.collect();
	let dir = attachment_dir(&app).join(&conversation_id);
	assert_eq!(paths.len(), 2, "the answer left a submitted file out");
	assert!(
		paths.iter().all(|path| Path::new(path).parent() == Some(dir.as_path())),
		"a file was stored somewhere other than the directory of its conversation"
	);
	assert_eq!(
		std::fs::read(&paths[0]).expect("the first file is readable"),
		b"first",
		"the answer is not in the order the files were submitted"
	);
	assert_eq!(std::fs::read(&paths[1]).expect("the second file is readable"), b"second");
	assert_eq!(
		Path::new(&paths[0]).extension().and_then(|it| it.to_str()),
		Some("md"),
		"a stored file lost the extension that says what it is"
	);
}

#[test]
fn attachments_for_a_conversation_that_is_not_on_the_record_are_refused_and_nothing_is_written() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_new_bot_and_its_chat(&window, "Nyx");

	assert_eq!(
		call(
			&window,
			"chat_store_attachments",
			json!({
				"conversationId": "not-a-conversation",
				"attachments": [an_attachment("notes.md", b"first")]
			}),
		),
		Err(json!({ "kind": "unknownConversation", "id": "not-a-conversation" }))
	);
	assert!(
		!attachment_dir(&app).join("not-a-conversation").exists(),
		"a refused call made the directory its files would have gone in"
	);
}

#[test]
fn deleting_a_bot_takes_the_attachments_of_its_conversation_and_leaves_every_other_one_its_own() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let (doomed, doomed_chat) = a_new_bot_and_its_chat(&window, "Nyx");
	let (_, spared_chat) = a_new_bot_and_its_chat(&window, "Ada");
	let dropped = an_attachment_stored_for(&window, &doomed_chat, b"gone");
	let kept = an_attachment_stored_for(&window, &spared_chat, b"kept");

	call(&window, "conversation_delete_bot", json!({ "id": doomed })).expect("the bot is deleted");

	assert!(
		!attachment_dir(&app).join(&doomed_chat).exists(),
		"a deleted bot left the directory of its conversation behind"
	);
	assert!(!Path::new(&dropped).exists(), "a deleted bot left its attachments behind");
	assert!(Path::new(&kept).exists(), "deleting one bot took another conversation's attachments");
}

#[test]
fn the_commands_a_session_announced_are_held_against_the_bot_and_replaced_by_the_next() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let id = a_bot(&window, "Nyx");
	let silent = a_bot(&window, "Ada");

	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &id })).expect("the commands"),
		json!([]),
		"a bot no session has announced anything for offers a command"
	);

	call(
		&window,
		"conversation_record_bot_commands",
		json!({ "botId": &id, "commands": ["review", "compact"] }),
	)
	.expect("the first session's commands");

	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &id })).expect("the commands"),
		json!([{ "name": "review" }, { "name": "compact" }])
	);

	call(
		&window,
		"conversation_record_bot_commands",
		json!({
			"botId": &id,
			"commands": [{ "name": "status", "description": "What this session is" }],
		}),
	)
	.expect("the next session's commands");

	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &id })).expect("the commands"),
		json!([{ "name": "status", "description": "What this session is" }]),
		"an announcement was added to the one before it instead of replacing it"
	);
	assert_eq!(
		call(&window, "conversation_bot_commands", json!({ "botId": &silent }))
			.expect("the commands"),
		json!([]),
		"one bot's session announced for another"
	);
	assert_eq!(
		call(
			&window,
			"conversation_record_bot_commands",
			json!({ "botId": "missing", "commands": ["review"] })
		),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
}

#[test]
fn a_bots_skills_are_written_listed_marked_and_taken_away() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_bot_and_its_chat(&window);
	bundled_bots(&app, &["default"]);

	let created = call(
		&window,
		"plugin_create_skill",
		json!({
			"scope": a_bot_plugin(BOT),
			"draft": {
				"name": "Baking Bread",
				"description": "How to bake.",
				"body": "Bake at 220 degrees.",
			},
		}),
	)
	.expect("the skill is written");
	assert_eq!(created["id"], json!("baking-bread"));
	assert_eq!(created["name"], json!("Baking Bread"));
	assert_eq!(created["description"], json!("How to bake."));
	assert_eq!(created["body"], json!("Bake at 220 degrees."));
	assert_eq!(created["isPreloaded"], json!(false));

	assert_eq!(readers_skills(&window, BOT), json!([created]));

	let marked = call(
		&window,
		"plugin_set_skill_preloaded",
		json!({ "scope": a_bot_plugin(BOT), "skillId": "baking-bread", "isPreloaded": true }),
	)
	.expect("the mark lands");
	assert_eq!(marked["isPreloaded"], json!(true));

	let updated = call(
		&window,
		"plugin_update_skill",
		json!({
			"scope": a_bot_plugin(BOT),
			"skillId": "baking-bread",
			"draft": {
				"name": "Baking",
				"description": "Bread.",
				"body": "Bake at 240 degrees.",
				"whenToUse": "When the loaf is flat.",
				"allowedTools": ["Read", "Write"],
				"userInvocable": true,
				"metadata": { "author": "someone" },
			},
		}),
	)
	.expect("the skill is rewritten");
	assert_eq!(updated["id"], json!("baking"), "a rename follows the slug of the new name");
	assert_eq!(updated["name"], json!("Baking"));
	assert_eq!(updated["body"], json!("Bake at 240 degrees."));
	assert_eq!(updated["isPreloaded"], json!(true), "an edit dropped the mark");
	assert_eq!(updated["whenToUse"], json!("When the loaf is flat."));
	assert_eq!(updated["allowedTools"], json!(["Read", "Write"]));
	assert_eq!(updated["userInvocable"], json!(true));
	assert_eq!(updated["metadata"]["author"], json!("someone"));
	assert_eq!(updated["license"], json!(null), "a key the file never carried");
	assert_eq!(
		updated["metadata"]["kiroshi"]["preload"],
		json!("true"),
		"a caller writing the map took the mark with it"
	);

	call(
		&window,
		"plugin_set_skill_preloaded",
		json!({ "scope": a_bot_plugin(BOT), "skillId": "baking", "isPreloaded": false }),
	)
	.expect("the mark goes");
	call(
		&window,
		"plugin_delete_skill",
		json!({ "scope": a_bot_plugin(BOT), "skillId": "baking" }),
	)
	.expect("the skill is taken away");

	assert_eq!(readers_skills(&window, BOT), json!([]));
	assert_eq!(
		call(
			&window,
			"plugin_create_skill",
			json!({
				"scope": a_bot_plugin("missing"),
				"draft": { "name": "Baking", "description": "", "body": "" },
			}),
		),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
}

fn readers_skills(window: &WebviewWindow<MockRuntime>, bot_id: &str) -> Value {
	let listed = call(window, "plugin_skills", json!({ "scope": a_bot_plugin(bot_id) }))
		.expect("the skills");
	let readers = listed
		.as_array()
		.expect("a list of skills")
		.iter()
		.filter(|skill| skill["id"] != json!("learn"))
		.cloned()
		.collect();
	Value::Array(readers)
}

fn bundle_of(app: &App<MockRuntime>, bot_id: &str) -> PathBuf {
	let root = bundles::root(app.handle()).expect("the bundle root");
	bundles::dir(&root, bot_id).expect("the bundle is held")
}

fn json_at(path: &Path) -> Value {
	std::fs::read_to_string(path)
		.ok()
		.and_then(|text| serde_json::from_str(&text).ok())
		.unwrap_or(Value::Null)
}

#[test]
fn a_bots_mcp_servers_are_written_listed_replaced_and_taken_away() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	a_bot_and_its_chat(&window);
	bundled_bots(&app, &["default"]);
	let bundle = bundle_of(&app, BOT);
	let servers = bundle.join(".mcp.json");
	let manifest = bundle.join(".claude-plugin").join("plugin.json");

	let atlas = json!({ "command": "atlas-mcp", "args": ["--stdio"] });
	let ledger = json!({ "command": "ledger-mcp", "env": { "LEDGER_MODE": "read" } });

	let written = call(
		&window,
		"plugin_set_mcp_server",
		json!({ "scope": a_bot_plugin(BOT), "name": "atlas", "config": atlas }),
	)
	.expect("the server is written");
	assert_eq!(written, json!({ "name": "atlas", "config": atlas }));

	call(
		&window,
		"plugin_set_mcp_server",
		json!({ "scope": a_bot_plugin(BOT), "name": "ledger", "config": ledger }),
	)
	.expect("the second server is written");

	assert_eq!(
		call(&window, "plugin_mcp_servers", json!({ "scope": a_bot_plugin(BOT) }))
			.expect("the servers"),
		json!([
			{ "name": "atlas", "config": atlas },
			{ "name": "ledger", "config": ledger },
		])
	);
	assert_eq!(json_at(&servers)["mcpServers"], json!({ "atlas": atlas, "ledger": ledger }));

	assert_eq!(json_at(&manifest)["mcpServers"], json!("./.mcp.json"));

	let mut theirs = json_at(&servers);
	theirs["kiroshiIsNotToTouchThis"] = json!(true);
	std::fs::write(&servers, theirs.to_string()).expect("the hand edit lands");

	let replaced = json!({ "command": "atlas-mcp", "args": ["--http"] });
	call(
		&window,
		"plugin_set_mcp_server",
		json!({ "scope": a_bot_plugin(BOT), "name": "atlas", "config": replaced }),
	)
	.expect("the server is replaced");
	let after = json_at(&servers);
	assert_eq!(after["mcpServers"], json!({ "atlas": replaced, "ledger": ledger }));
	assert_eq!(after["kiroshiIsNotToTouchThis"], json!(true));

	let refused = call(
		&window,
		"plugin_set_mcp_server",
		json!({
			"scope": a_bot_plugin(BOT),
			"name": "atlas",
			"config": "atlas-mcp --secret hunter2",
		}),
	)
	.expect_err("a scalar is not a server");
	assert_eq!(refused["kind"], json!("unwritableBundle"));
	assert!(
		!refused["detail"].as_str().unwrap_or_default().contains("hunter2"),
		"the refusal carried the configuration: {refused}"
	);
	assert_eq!(json_at(&servers)["mcpServers"]["atlas"], replaced, "the refusal wrote anyway");

	let taken = json!({ "scope": a_bot_plugin(BOT), "name": "atlas" });
	call(&window, "plugin_delete_mcp_server", taken).expect("the server is taken away");
	assert_eq!(json_at(&servers)["mcpServers"], json!({ "ledger": ledger }));
	assert_eq!(
		call(
			&window,
			"plugin_delete_mcp_server",
			json!({ "scope": a_bot_plugin(BOT), "name": "atlas" })
		)
		.expect_err("a name the bundle does not declare")["kind"],
		json!("unwritableBundle")
	);

	let taken = json!({ "scope": a_bot_plugin(BOT), "name": "ledger" });
	call(&window, "plugin_delete_mcp_server", taken).expect("the last server is taken away");
	let bare = json_at(&servers);
	assert_eq!(bare["mcpServers"], Value::Null);
	assert_eq!(bare["kiroshiIsNotToTouchThis"], json!(true));

	std::fs::write(&servers, json!({ "mcpServers": { "atlas": atlas } }).to_string())
		.expect("a file with nothing but servers in it");
	let taken = json!({ "scope": a_bot_plugin(BOT), "name": "atlas" });
	call(&window, "plugin_delete_mcp_server", taken).expect("the server is taken away");
	assert_eq!(json_at(&servers), Value::Null, "an empty server file was left behind");
	assert_eq!(json_at(&manifest)["mcpServers"], Value::Null);

	assert_eq!(
		call(
			&window,
			"plugin_set_mcp_server",
			json!({ "scope": a_bot_plugin("missing"), "name": "atlas", "config": atlas }),
		),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
}

#[test]
fn a_duplicated_bot_carries_the_bundle_and_none_of_the_transcript() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let source = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", json!(42)) }),
	)
	.expect("the bot is created");
	let source_id = source["id"].as_str().expect("the bot holds an id").to_owned();

	call(
		&window,
		"plugin_create_skill",
		json!({
			"scope": a_bot_plugin(&source_id),
			"draft": {
				"name": "Baking Bread",
				"description": "How to bake.",
				"body": "Bake at 220 degrees.",
			},
		}),
	)
	.expect("the skill is written");
	let atlas = json!({ "command": "atlas-mcp", "args": ["--stdio"] });
	call(
		&window,
		"plugin_set_mcp_server",
		json!({ "scope": a_bot_plugin(&source_id), "name": "atlas", "config": atlas }),
	)
	.expect("the server is written");

	let source_bundle = bundle_of(&app, &source_id);
	let theirs =
		r#"{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"echo theirs"}]}]}}"#;
	std::fs::create_dir_all(source_bundle.join("hooks")).expect("the hooks directory");
	std::fs::write(source_bundle.join("hooks").join("hooks.json"), theirs).expect("the hook lands");
	std::fs::write(source_bundle.join(".learned.md"), "What the source remembered\n")
		.expect("the memory lands");

	let chat = call(&window, "conversation_main_chat", json!({ "botId": source_id }))
		.expect("the chat the source was created with");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, "hello", 2),
	)
	.expect("the message is appended");

	let duplicate = call(&window, "conversation_duplicate_bot", json!({ "botId": source_id }))
		.expect("the bot is duplicated");
	let duplicate_id = duplicate["id"].as_str().expect("the duplicate holds an id").to_owned();

	assert_ne!(duplicate_id, source_id, "a duplicate answered under the source's id");
	assert_eq!(duplicate["name"], json!("Nyx copy"));
	assert_eq!(duplicate["title"], source["title"]);
	assert_eq!(duplicate["model"], source["model"]);
	assert_eq!(duplicate.get("avatarAnimal"), None, "a duplicate still crossed with an animal");
	assert_eq!(duplicate["avatarBlot"], source["avatarBlot"]);
	assert_eq!(duplicate["avatarImagePath"], source["avatarImagePath"]);
	assert_eq!(duplicate["instructions"], source["instructions"]);
	assert_eq!(duplicate["deniedTools"], source["deniedTools"]);
	assert_eq!(duplicate["outputStyle"], source["outputStyle"]);

	let duplicate_chat = call(&window, "conversation_main_chat", json!({ "botId": duplicate_id }))
		.expect("the chat the duplicate was created with");
	let duplicate_conversation =
		duplicate_chat["id"].as_str().expect("the chat holds an id").to_owned();
	assert_ne!(duplicate_conversation, conversation, "a duplicate was seated in the source's chat");
	assert_eq!(
		call(
			&window,
			"conversation_message_page",
			json!({ "conversationId": duplicate_conversation, "beforeSeq": null, "limit": 20 })
		),
		Ok(json!({
			"conversationId": duplicate_conversation,
			"messages": [],
			"arrivals": [],
			"hasMore": false
		})),
		"a duplicate opened on what the source had said"
	);

	assert_eq!(
		readers_skills(&window, &duplicate_id),
		readers_skills(&window, &source_id),
		"the skills the source carries did not come over"
	);

	let bundle = bundle_of(&app, &duplicate_id);
	assert_eq!(json_at(&bundle.join(".mcp.json"))["mcpServers"], json!({ "atlas": atlas }));
	assert_eq!(
		std::fs::read_to_string(bundle.join("hooks").join("hooks.json")).ok(),
		Some(theirs.to_owned()),
		"a hook the reader gave the source did not come over"
	);
	assert_eq!(
		std::fs::read_to_string(bundle.join(".learned.md")).ok(),
		Some("What the source remembered\n".to_owned()),
		"what the source remembered did not come over"
	);

	let root = bundles::root(app.handle()).expect("the bundle root");
	let manifest = json_at(&bundle.join(".claude-plugin").join("plugin.json"));
	assert_eq!(manifest["name"], json!(bundle.file_name().and_then(|it| it.to_str())));
	assert_eq!(manifest["mcpServers"], json!("./.mcp.json"));
	assert!(
		bundles::agent_file(&root, &duplicate_id).is_some(),
		"the duplicate has no agent file of its own"
	);
	let history = call(&window, "plugin_history", json!({ "scope": a_bot_plugin(&duplicate_id) }))
		.expect("the duplicate's history");
	assert!(
		!history.as_array().expect("a list of writes").is_empty(),
		"the duplicate has no history of its own"
	);

	assert!(source_bundle.join(".learned.md").exists(), "the source lost what it remembered");
	assert_eq!(
		json_at(&source_bundle.join(".mcp.json"))["mcpServers"],
		json!({ "atlas": atlas }),
		"the source lost the server it declares"
	);
	assert_eq!(
		call(&window, "conversation_bots", json!({}))
			.expect("the bots")
			.as_array()
			.expect("a list")
			.iter()
			.map(|bot| bot["name"].clone())
			.collect::<Vec<_>>(),
		vec![json!("Nyx"), json!("Nyx copy")]
	);
}

#[test]
fn a_duplicate_of_a_bot_that_is_gone_crosses_as_an_unknown_bot() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	assert_eq!(
		call(&window, "conversation_duplicate_bot", json!({ "botId": "missing" })),
		Err(json!({ "kind": "unknownBot", "id": "missing" }))
	);
	assert_eq!(call(&window, "conversation_bots", json!({})), Ok(json!([])));
}

#[test]
fn a_solo_thread_asked_over_ipc_with_the_bot_alone_is_the_one_of_its_oldest_space() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let oldest = the_first_space(&window);
	let bot_id = a_bot(&window, "Nyx");
	let joined = a_space(&window, "Away");
	call(
		&window,
		"bot_add_to_space",
		json!({ "botId": bot_id, "spaceId": joined, "sectionId": null }),
	)
	.expect("the bot joins the second space");

	let alone = call(&window, "conversation_main_chat", json!({ "botId": bot_id }))
		.expect("the thread of the bot alone");
	let again = call(&window, "conversation_main_chat", json!({ "botId": bot_id }))
		.expect("the thread of the bot alone again");
	let at_home =
		call(&window, "conversation_main_chat", json!({ "botId": bot_id, "spaceId": oldest }))
			.expect("the thread of the oldest space");
	let away =
		call(&window, "conversation_main_chat", json!({ "botId": bot_id, "spaceId": joined }))
			.expect("the thread of the space that was joined");

	assert_eq!(alone, again, "asking twice with the bot alone answered two threads");
	assert_eq!(
		alone, at_home,
		"the bot alone did not answer the thread of the space it joined first"
	);
	assert_ne!(alone["id"], away["id"], "one thread answered for two spaces");
}

fn the_first_space(window: &WebviewWindow<MockRuntime>) -> String {
	call(window, "space_list", json!({})).expect("the spaces")[0]["id"]
		.as_str()
		.expect("the space holds an id")
		.to_owned()
}

fn a_space(window: &WebviewWindow<MockRuntime>, name: &str) -> String {
	call(window, "space_create", json!({ "name": name })).expect("the space is created")["id"]
		.as_str()
		.expect("the space holds an id")
		.to_owned()
}

fn names_in(window: &WebviewWindow<MockRuntime>, space_id: &str) -> Vec<Value> {
	call(window, "conversation_bots", json!({ "spaceId": space_id }))
		.expect("the bots")
		.as_array()
		.expect("a list")
		.iter()
		.map(|bot| bot["name"].clone())
		.collect()
}

#[test]
fn a_duplicate_lands_in_the_space_the_reader_named_and_keeps_what_the_source_carries() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let source_id = a_bot(&window, "Nyx");
	let destination = a_space(&window, "Away");

	let duplicate = call(
		&window,
		"conversation_duplicate_bot",
		json!({ "botId": source_id, "spaceId": destination }),
	)
	.expect("the bot is duplicated");
	let duplicate_id = duplicate["id"].as_str().expect("the duplicate holds an id").to_owned();

	assert_eq!(duplicate["name"], json!("Nyx copy"));
	assert_eq!(names_in(&window, &destination), vec![json!("Nyx copy")]);
	assert_eq!(
		readers_skills(&window, &duplicate_id),
		readers_skills(&window, &source_id),
		"the skills the source carries did not come over"
	);
	assert_eq!(duplicate["instructions"], json!("Answer with the file you would touch."));
	assert!(
		bundle_of(&app, &duplicate_id).join(".claude-plugin").join("plugin.json").exists(),
		"the duplicate has no bundle of its own"
	);
}

#[test]
fn a_duplicate_carries_the_section_and_the_pin_the_source_holds_in_the_named_space() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let source_id = a_bot(&window, "Nyx");
	let away = a_space(&window, "Away");
	let writers = call(&window, "section_create", json!({ "spaceId": away, "name": "Writers" }))
		.expect("the section is created")["id"]
		.as_str()
		.expect("the section holds an id")
		.to_owned();
	call(
		&window,
		"bot_add_to_space",
		json!({ "botId": source_id, "spaceId": away, "sectionId": writers }),
	)
	.expect("the source joins the second space");

	let duplicate =
		call(&window, "conversation_duplicate_bot", json!({ "botId": source_id, "spaceId": away }))
			.expect("the bot is duplicated");

	assert_eq!(
		duplicate["sectionId"],
		json!(writers),
		"the copy did not carry the section its source holds in the space it landed in"
	);
	assert!(
		!duplicate["pinPosition"].is_null(),
		"the copy did not carry the pin its source holds there: got {duplicate}"
	);
}

#[test]
fn a_duplicate_into_a_space_the_source_does_not_hold_lands_loose() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let nest = a_space(&window, "Nest");
	let away = a_space(&window, "Away");
	let source_id = a_bot_in(&window, &nest, "Nyx");
	let writers = call(&window, "section_create", json!({ "spaceId": nest, "name": "Writers" }))
		.expect("the section is created")["id"]
		.as_str()
		.expect("the section holds an id")
		.to_owned();
	call(&window, "bot_move_to_section", json!({ "botId": source_id, "sectionId": writers }))
		.expect("the source moves into a section of its own space");

	let duplicate =
		call(&window, "conversation_duplicate_bot", json!({ "botId": source_id, "spaceId": away }))
			.expect("the bot is duplicated");

	assert_eq!(duplicate["sectionId"], Value::Null);
	assert_eq!(duplicate["pinPosition"], Value::Null);
}

#[test]
fn a_duplicate_only_dodges_the_names_the_space_it_lands_in_already_carries() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let source_id = a_bot(&window, "Nyx");
	let away = a_space(&window, "Away");
	call(
		&window,
		"conversation_create_bot",
		json!({
			"identity": an_identity("Nyx copy", "sonnet", json!(42)),
			"spaceId": away,
		}),
	)
	.expect("the namesake is created");

	let duplicate =
		call(&window, "conversation_duplicate_bot", json!({ "botId": source_id, "spaceId": away }))
			.expect("the bot is duplicated");

	assert_eq!(duplicate["name"], json!("Nyx copy 2"));
	assert_eq!(names_in(&window, &away), vec![json!("Nyx copy"), json!("Nyx copy 2")]);
}

#[test]
fn a_duplicate_into_a_space_that_is_gone_leaves_every_bot_and_every_bundle_alone() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let source_id = a_bot(&window, "Nyx");
	let before = call(&window, "conversation_bots", json!({})).expect("the bots");

	let refusal = call(
		&window,
		"conversation_duplicate_bot",
		json!({ "botId": source_id, "spaceId": "missing" }),
	)
	.expect_err("a copy into a space that is gone was taken");

	assert_eq!(refusal["kind"], json!("storage"));
	assert_eq!(call(&window, "conversation_bots", json!({})), Ok(before));
	let root = bundles::root(app.handle()).expect("the bundle root");
	assert_eq!(
		std::fs::read_dir(root.join("plugins")).map(|entries| entries.count()).unwrap_or_default(),
		1,
		"a bundle was left behind by a copy that was refused"
	);
}

fn a_bot_scope(bot_id: &str, space_id: &str) -> Value {
	json!({ "kind": "bot", "id": bot_id, "spaceId": space_id })
}

fn titles_of(window: &WebviewWindow<MockRuntime>, bot_id: &str) -> Vec<Value> {
	call(window, "plugin_history", json!({ "scope": a_bot_plugin(bot_id) }))
		.expect("the history")
		.as_array()
		.expect("a list of writes")
		.iter()
		.map(|entry| entry["title"].clone())
		.collect()
}

fn env_of(app: &App<MockRuntime>, bot_id: &str, space_id: &str) -> ResolvedEnv {
	let root = store::root(app.handle()).expect("the environment root");
	let owner = EnvOwner::Bot { id: bot_id.to_owned(), space_id: space_id.to_owned() };
	store::resolve(&root, &owner).expect("the store reads")
}

fn names_under(root: &Path, kind: &str) -> Vec<String> {
	let mut named: Vec<String> = std::fs::read_dir(root.join(kind))
		.into_iter()
		.flatten()
		.flatten()
		.map(|entry| entry.file_name().to_string_lossy().into_owned())
		.collect();
	named.sort();
	named
}

#[test]
fn a_duplicate_carries_the_history_the_learned_block_and_the_environment_of_its_own_scopes() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let held = a_space(&window, "Home");
	let away = a_space(&window, "Away");
	let source_id = a_bot_in(&window, &held, "Nyx");

	call(
		&window,
		"conversation_set_bot_memory",
		json!({ "id": source_id, "memory": "Nyx bakes on Sundays." }),
	)
	.expect("the memory is written");
	call(
		&window,
		"plugin_create_skill",
		json!({
			"scope": a_bot_plugin(&source_id),
			"draft": {
				"name": "Baking Bread",
				"description": "How to bake.",
				"body": "Bake at 220 degrees.",
			},
		}),
	)
	.expect("the skill is written");
	let clock =
		json!({ "command": "clock-mcp", "args": ["--stdio"], "env": { "TOKEN": "${TOKEN}" } });
	call(
		&window,
		"plugin_set_mcp_server",
		json!({ "scope": a_bot_plugin(&source_id), "name": "clock", "config": clock }),
	)
	.expect("the server is written");
	call(
		&window,
		"env_set",
		json!({ "scope": a_bot_scope(&source_id, &held), "name": "TOKEN", "value": "figs" }),
	)
	.expect("the bot keeps the value the server reads");
	call(
		&window,
		"env_set",
		json!({
			"scope": { "kind": "server", "name": "clock", "owner": a_bot_scope(&source_id, &held) },
			"name": "CLOCK_TOKEN",
			"value": "ticks",
		}),
	)
	.expect("the server scope keeps its value");
	call(
		&window,
		"env_set",
		json!({ "scope": { "kind": "space", "id": held }, "name": "SHARED", "value": "space" }),
	)
	.expect("the space keeps its value");

	let source_titles = titles_of(&window, &source_id);
	let source_servers = json_at(&bundle_of(&app, &source_id).join(".mcp.json"));
	let source_env = env_of(&app, &source_id, &held);
	let before = call(&window, "conversation_bots", json!({ "spaceId": held })).expect("the bots");
	assert!(source_titles.len() > 1, "the source carries a single write in its history");

	let duplicate =
		call(&window, "conversation_duplicate_bot", json!({ "botId": source_id, "spaceId": away }))
			.expect("the bot is duplicated");
	let duplicate_id = duplicate["id"].as_str().expect("the duplicate holds an id").to_owned();

	let titles = titles_of(&window, &duplicate_id);
	assert!(titles.len() > source_titles.len(), "the copy wrote nothing of its own");
	assert_eq!(
		&titles[titles.len() - source_titles.len()..],
		source_titles.as_slice(),
		"the history of the source did not come over"
	);
	assert_eq!(duplicate["memory"], json!("Nyx bakes on Sundays."));
	assert_eq!(
		json_at(&bundle_of(&app, &duplicate_id).join(".mcp.json")),
		source_servers,
		"the servers the source declares did not come over"
	);
	let carried = env_of(&app, &duplicate_id, &away);
	assert_eq!(carried.base.get("TOKEN").map(String::as_str), Some("figs"));
	assert_eq!(carried.per_server["clock"].get("CLOCK_TOKEN").map(String::as_str), Some("ticks"));
	assert_eq!(carried.base.get("SHARED"), None, "the copy took a value it only inherited");

	assert_eq!(call(&window, "conversation_bots", json!({ "spaceId": held })), Ok(before));
	assert_eq!(titles_of(&window, &source_id), source_titles, "the source lost its history");
	assert_eq!(
		json_at(&bundle_of(&app, &source_id).join(".mcp.json")),
		source_servers,
		"the source lost the servers it declares"
	);
	assert_eq!(env_of(&app, &source_id, &held), source_env, "the source lost its environment");
}

#[test]
fn a_duplicate_carries_the_memory_the_source_row_holds_when_its_bundle_carries_no_block() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let held = a_space(&window, "Home");
	let source_id = a_bot_in(&window, &held, "Nyx");
	call(
		&window,
		"conversation_set_bot_memory",
		json!({ "id": source_id, "memory": "Nyx bakes on Sundays." }),
	)
	.expect("the memory is written");
	let root = bundles::root(app.handle()).expect("the bundle root");
	let agent = bundles::agent_file(&root, &source_id).expect("the agent file");
	std::fs::write(
		&agent,
		format!("---\nname: agent\nmetadata:\n  kiroshiBotId: \"{source_id}\"\n---\n\nAnswer briefly.\n"),
	)
	.expect("the block is taken out of the bundle");

	let duplicate = call(&window, "conversation_duplicate_bot", json!({ "botId": source_id }))
		.expect("the bot is duplicated");

	assert_eq!(duplicate["memory"], json!("Nyx bakes on Sundays."));
}

fn pins_in(window: &WebviewWindow<MockRuntime>, space_id: &str, except: &str) -> Vec<Value> {
	let mut taken: Vec<Value> = call(window, "conversation_bots", json!({ "spaceId": space_id }))
		.expect("the bots")
		.as_array()
		.expect("a list")
		.iter()
		.filter(|bot| bot["id"] != json!(except))
		.map(|bot| bot["pinPosition"].clone())
		.filter(|pin| !pin.is_null())
		.collect();
	taken.extend(
		call(window, "section_list", json!({ "spaceId": space_id }))
			.expect("the sections")
			.as_array()
			.expect("a list")
			.iter()
			.map(|section| section["position"].clone()),
	);
	taken
}

#[test]
fn a_duplicate_of_a_pinned_bot_takes_a_place_of_its_own_and_none_when_it_lands_elsewhere() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let held = a_space(&window, "Home");
	let away = a_space(&window, "Away");
	let source_id = a_bot_in(&window, &held, "Nyx");
	let neighbour_id = a_bot_in(&window, &held, "Ada");
	let section = call(&window, "section_create", json!({ "spaceId": held, "name": "Kitchen" }))
		.expect("the section is created")["id"]
		.as_str()
		.expect("the section holds an id")
		.to_owned();
	call(&window, "bot_move_to_section", json!({ "botId": neighbour_id, "sectionId": section }))
		.expect("the neighbour is pinned");
	call(&window, "bot_move_to_section", json!({ "botId": source_id, "sectionId": section }))
		.expect("the source is pinned");

	let duplicate = call(&window, "conversation_duplicate_bot", json!({ "botId": source_id }))
		.expect("the bot is duplicated");
	let duplicate_id = duplicate["id"].as_str().expect("the duplicate holds an id").to_owned();

	assert_eq!(duplicate["sectionId"], json!(section));
	assert!(duplicate["pinPosition"].is_i64(), "the copy of a pinned bot is not pinned");
	assert!(
		!pins_in(&window, &held, &duplicate_id).contains(&duplicate["pinPosition"]),
		"the copy took a place another row of the space already holds"
	);

	let elsewhere =
		call(&window, "conversation_duplicate_bot", json!({ "botId": source_id, "spaceId": away }))
			.expect("the bot is duplicated");

	assert_eq!(elsewhere["sectionId"], Value::Null);
	assert_eq!(elsewhere["pinPosition"], Value::Null);
}

#[test]
fn a_copy_that_fails_leaves_no_row_no_bundle_and_no_environment_under_the_new_id() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let held = a_space(&window, "Home");
	let source_id = a_bot_in(&window, &held, "Nyx");
	call(
		&window,
		"env_set",
		json!({ "scope": a_bot_scope(&source_id, &held), "name": "TOKEN", "value": "figs" }),
	)
	.expect("the bot keeps its value");
	let bundle_root = bundles::root(app.handle()).expect("the bundle root");
	let env_root = store::root(app.handle()).expect("the environment root");
	let agent = bundles::agent_file(&bundle_root, &source_id).expect("the agent file");
	std::fs::write(
		&agent,
		format!("---\nthis names no key\nmetadata:\n  kiroshiBotId: \"{source_id}\"\n---\n\nAnswer briefly.\n"),
	)
	.expect("the agent file is broken");
	let before = call(&window, "conversation_bots", json!({})).expect("the bots");

	let refusal = call(&window, "conversation_duplicate_bot", json!({ "botId": source_id }))
		.expect_err("a copy of a bundle that cannot be written was taken");

	assert_eq!(refusal["kind"], json!("unwritableBundle"));
	assert_eq!(call(&window, "conversation_bots", json!({})), Ok(before));
	assert_eq!(
		names_under(&bundle_root, "plugins").len(),
		1,
		"a bundle was left behind by a copy that failed"
	);
	assert_eq!(names_under(&env_root, "bot"), vec![source_id.clone()]);
	assert_eq!(names_under(&env_root.join("server"), "bot"), Vec::<String>::new());
	assert_eq!(
		env_of(&app, &source_id, &held).base.get("TOKEN").map(String::as_str),
		Some("figs"),
		"the source lost its environment"
	);
}

#[test]
fn a_reference_resolves_a_message_to_the_uri_and_the_run_that_produced_it() {
	const ANNOUNCED: &str = "claude-7b21";

	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
		.expect("the run opens");
	call(
		&window,
		"conversation_record_provider_session",
		a_provider_session(&conversation, &bot["id"], &run, ANNOUNCED),
	)
	.expect("the run takes the id it answers under");
	let reply = a_streaming_reply(&window, &conversation, 2);
	call(
		&window,
		"conversation_finalize_message",
		json!({ "id": reply, "completion": "complete" }),
	)
	.expect("the reply ends");

	let prompt = call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
		.expect("the prompt reference");
	let answer =
		call(&window, "conversation_message_reference", a_reference(&conversation, &reply))
			.expect("the reply reference");

	assert_eq!(prompt["uri"], json!(format!("kiroshi://c/{conversation}/m/m1")));
	assert_eq!(prompt["conversationId"], json!(conversation));
	assert_eq!(prompt["messageId"], json!("m1"));
	assert_eq!(prompt["role"], json!("user"));
	assert_eq!(prompt["seq"], json!(1));
	assert_eq!(prompt["createdAt"], json!(1));
	assert_eq!(prompt["excerpt"], json!("hi"));
	assert_eq!(
		prompt["runtimeSessionId"], run["id"],
		"the prompt did not reach the run its turn was answered by"
	);
	assert_eq!(prompt["providerSessionId"], json!(ANNOUNCED));

	assert_eq!(answer["role"], json!("assistant"));
	assert_eq!(answer["excerpt"], json!("message 2"));
	assert_eq!(answer["runtimeSessionId"], run["id"], "the reply forgot the run that spoke it");
	assert_eq!(answer["providerSessionId"], json!(ANNOUNCED));
}

#[test]
fn a_turn_no_run_ever_answered_leaves_its_prompt_without_one() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	a_streaming_reply(&window, &conversation, 2);

	let prompt = call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
		.expect("the prompt reference");

	assert_eq!(
		prompt["runtimeSessionId"],
		Value::Null,
		"a prompt of a turn no run ever answered took one"
	);
	assert_eq!(prompt["providerSessionId"], Value::Null);
}

#[test]
fn a_prompt_reaches_the_first_run_of_its_turn_and_never_a_later_one() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	let first = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
		.expect("the run opens");
	a_streaming_reply(&window, &conversation, 2);
	let second = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 3))
		.expect("the run that replaces it opens");
	a_streaming_reply(&window, &conversation, 3);

	let prompt = call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
		.expect("the prompt reference");

	assert_ne!(first["id"], second["id"], "the restart reused the replaced run's id");
	assert_eq!(
		prompt["runtimeSessionId"], first["id"],
		"the prompt reached a later run than the one that first answered its turn"
	);
}

#[test]
fn a_reference_to_a_message_outside_the_conversation_comes_back_empty() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");

	assert_eq!(
		call(&window, "conversation_message_reference", a_reference(&conversation, "missing")),
		Ok(Value::Null)
	);
	assert_eq!(
		call(&window, "conversation_message_reference", a_reference("elsewhere", "m1")),
		Ok(Value::Null)
	);
}

#[test]
fn a_long_message_crosses_as_an_excerpt_that_says_it_was_cut() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	let spoken = "é".repeat(400);
	call(
		&window,
		"conversation_append_user_message",
		a_user_message("m1", &conversation, &spoken, 1),
	)
	.expect("the prompt is appended");

	let reference =
		call(&window, "conversation_message_reference", a_reference(&conversation, "m1"))
			.expect("the reference");
	let excerpt = reference["excerpt"].as_str().expect("an excerpt");

	assert_eq!(excerpt.chars().count(), 280, "the excerpt was not capped at 280 characters");
	assert!(excerpt.ends_with('…'), "the cut excerpt did not say it was cut: {excerpt}");
	assert!(spoken.starts_with(&excerpt[..excerpt.len() - '…'.len_utf8()]));
}

#[test]
fn the_page_carries_the_reply_and_the_run_of_every_message_it_holds() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let (bot, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn starts");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the prompt is appended");
	let run = call(&window, "conversation_open_runtime_session", a_run(&conversation, &bot, 2))
		.expect("the run opens");
	call(
		&window,
		"conversation_append_user_message",
		an_answer_to("m1", "m2", &conversation, "again", 2),
	)
	.expect("the answer is appended");
	let reply = a_streaming_reply(&window, &conversation, 3);

	let page = call(&window, "conversation_message_page", a_page(&conversation, None, 50))
		.expect("the page");
	let held = page["messages"].as_array().expect("a list of messages");
	let of = |id: &str| {
		held.iter().find(|message| message["id"] == json!(id)).cloned().expect("the message")
	};

	assert_eq!(of("m1")["repliedToMessageId"], Value::Null);
	assert_eq!(of("m1")["runtimeSessionId"], Value::Null, "a prompt older than the run took it");
	assert_eq!(of("m2")["repliedToMessageId"], json!("m1"));
	assert_eq!(
		of("m2")["runtimeSessionId"],
		run["id"],
		"a prompt spoken into a live run forgot it"
	);
	assert_eq!(of(&reply)["repliedToMessageId"], Value::Null);
	assert_eq!(of(&reply)["runtimeSessionId"], run["id"]);
}

fn a_bot_in(window: &WebviewWindow<MockRuntime>, space_id: &str, name: &str) -> String {
	call(
		window,
		"conversation_create_bot",
		json!({ "identity": an_identity(name, "sonnet", Value::Null), "spaceId": space_id }),
	)
	.expect("the bot is created")["id"]
		.as_str()
		.expect("the bot holds an id")
		.to_owned()
}

fn a_room(
	window: &WebviewWindow<MockRuntime>,
	space_id: &str,
	title: &str,
	bot_ids: Vec<String>,
) -> Value {
	call(
		window,
		"conversation_create",
		json!({ "spaceId": space_id, "sectionId": null, "title": title, "botIds": bot_ids }),
	)
	.expect("the room is created")
}

fn id_of(room: &Value) -> String {
	room["id"].as_str().expect("the room holds an id").to_owned()
}

fn rooms_of(window: &WebviewWindow<MockRuntime>, space_id: &str) -> Vec<Value> {
	call(window, "conversation_list", json!({ "spaceId": space_id }))
		.expect("the rooms")
		.as_array()
		.expect("the rooms come back as a list")
		.clone()
}

fn room_ids_of(window: &WebviewWindow<MockRuntime>, space_id: &str) -> Vec<String> {
	rooms_of(window, space_id).iter().map(id_of).collect()
}

fn room_of(window: &WebviewWindow<MockRuntime>, space_id: &str, id: &str) -> Value {
	rooms_of(window, space_id)
		.into_iter()
		.find(|room| room["id"] == json!(id))
		.expect("the space lists the room it was asked for")
}

fn seats_of(room: &Value) -> &Vec<Value> {
	room["participants"].as_array().expect("the room holds its participants")
}

fn seat_of<'a>(room: &'a Value, bot_id: &str) -> &'a Value {
	seats_of(room)
		.iter()
		.find(|seat| seat["botId"] == json!(bot_id))
		.expect("the room seats the bot it was asked for")
}

fn seated(room: &Value, keep: impl Fn(&Value) -> bool) -> Vec<String> {
	seats_of(room)
		.iter()
		.filter(|seat| keep(seat))
		.map(|seat| seat["botId"].as_str().expect("a seat holds a bot").to_owned())
		.collect()
}

fn present(room: &Value) -> Vec<String> {
	seated(room, |seat| seat["leftAt"] == Value::Null)
}

fn leads(room: &Value) -> Vec<String> {
	seated(room, |seat| seat["leftAt"] == Value::Null && seat["role"] == json!("lead"))
}

#[test]
fn a_room_created_over_ipc_is_listed_in_its_space_with_its_participants_and_its_lead() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let space = a_space(&window, "Nest");
	let first = a_bot_in(&window, &space, "Nyx");
	let second = a_bot_in(&window, &space, "Ada");
	let latecomer = a_bot_in(&window, &space, "Iris");

	let created = a_room(&window, &space, "Standup", vec![first.clone(), second.clone()]);
	let id = id_of(&created);

	assert_eq!(created["title"], json!("Standup"));
	assert_eq!(created["spaceId"], json!(space));
	assert_eq!(created["instructions"], json!(""));
	assert!(created["createdAt"].is_i64(), "a room crossed without a camelCase moment: {created}");

	let listed = room_of(&window, &space, &id);
	assert_eq!(
		present(&listed),
		vec![first.clone(), second.clone()],
		"the list lost the bots the room was opened with"
	);
	assert_eq!(leads(&listed), vec![first.clone()], "the first bot seated is not the one leading");
	assert_eq!(seat_of(&listed, &second)["role"], json!("assistant"));
	assert_eq!(seat_of(&listed, &first)["name"], json!("Nyx"), "a seat crossed without its bot");

	let joined = call(
		&window,
		"conversation_add_participant",
		json!({ "conversationId": id, "botId": latecomer }),
	)
	.expect("the bot joins");
	assert_eq!(present(&joined), vec![first.clone(), second, latecomer.clone()]);
	assert_eq!(seat_of(&joined, &latecomer)["role"], json!("assistant"));
	assert_eq!(leads(&joined), vec![first], "a bot joining a led room took the lead");

	assert_eq!(
		present(&room_of(&window, &space, &id)),
		present(&joined),
		"the seat taken over ipc was not kept"
	);
}

#[test]
fn a_companion_seated_over_ipc_is_announced_and_read_back_on_the_page() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let space = a_space(&window, "Nest");
	let host = a_bot_in(&window, &space, "Nyx");
	let latecomer = a_bot_in(&window, &space, "Iris");
	let room = id_of(&a_room(&window, &space, "Standup", vec![host]));
	let (announced, heard) = mpsc::channel();
	app.listen_any(kiroshi_app::conversations::contract::COMPANION_ARRIVED_EVENT, move |event| {
		announced.send(event.payload().to_owned()).expect("the announcement is kept");
	});

	call(
		&window,
		"conversation_add_participant",
		json!({ "conversationId": room, "botId": latecomer, "invitedByBotId": null }),
	)
	.expect("the bot joins");
	let page = call(&window, "conversation_message_page", a_page(&room, None, 20))
		.expect("the transcript");

	let heard = heard.recv_timeout(Duration::from_secs(60)).expect("the arrival was announced");
	let arrival: Value = serde_json::from_str(&heard).expect("the arrival crosses as json");
	assert_eq!(arrival["botId"], json!(latecomer));
	assert_eq!(arrival["invitedByBotId"], Value::Null);
	assert_eq!(arrival["lastMessageSeq"], json!(0));
	assert_eq!(page["arrivals"], json!([arrival]), "the page and the announcement disagree");
}

#[test]
fn a_name_and_instructions_written_over_ipc_are_read_back_on_the_next_list() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let space = a_space(&window, "Nest");
	let bot = a_bot_in(&window, &space, "Nyx");
	let created = a_room(&window, &space, "Standup", vec![bot]);
	let id = id_of(&created);

	let updated = call(
		&window,
		"conversation_update",
		json!({
			"conversationId": id,
			"title": "Retro",
			"instructions": "Answer with the file you would touch.",
			"sectionId": null
		}),
	)
	.expect("the room is updated");

	assert_eq!(updated["title"], json!("Retro"));
	assert_eq!(updated["instructions"], json!("Answer with the file you would touch."));
	assert_eq!(updated["createdAt"], created["createdAt"], "an update moved the moment");

	let listed = room_of(&window, &space, &id);
	assert_eq!(listed["title"], json!("Retro"), "the name written over ipc was not kept");
	assert_eq!(
		listed["instructions"],
		json!("Answer with the file you would touch."),
		"the instructions written over ipc were not kept"
	);
}

#[test]
fn a_participant_removed_over_ipc_keeps_the_messages_it_wrote_readable() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let space = a_space(&window, "Nest");
	let lead = a_bot_in(&window, &space, "Nyx");
	let leaving = a_bot_in(&window, &space, "Ada");
	let created = a_room(&window, &space, "Standup", vec![lead, leaving.clone()]);
	let id = id_of(&created);

	call(&window, "conversation_start_turn", a_turn(&id)).expect("the turn starts");
	call(
		&window,
		"conversation_open_assistant_message",
		json!({ "message": {
			"id": "m1",
			"conversationId": id,
			"turnId": TURN,
			"authorBotId": leaving,
			"repliedToMessageId": null,
			"createdAt": 1
		}}),
	)
	.expect("the reply is opened");
	call(
		&window,
		"conversation_append_text",
		json!({ "id": "m1", "delta": "said before leaving" }),
	)
	.expect("the reply streams");
	call(&window, "conversation_finalize_message", json!({ "id": "m1", "completion": "complete" }))
		.expect("the reply ends");

	let left = call(
		&window,
		"conversation_remove_participant",
		json!({ "conversationId": id, "botId": leaving }),
	)
	.expect("the bot leaves");

	assert!(!present(&left).contains(&leaving), "a bot that left is still seated");
	assert!(
		seat_of(&left, &leaving)["leftAt"].is_i64(),
		"the seat of a bot that left does not say when: {left}"
	);

	let page =
		call(&window, "conversation_message_page", a_page(&id, None, 20)).expect("the transcript");
	let held = page["messages"].as_array().expect("the page holds messages");

	assert_eq!(held.len(), 1, "the transcript lost the message of a bot that left: {page}");
	assert_eq!(held[0]["content"], json!("said before leaving"));
	assert_eq!(
		held[0]["authorBotId"],
		json!(leaving),
		"a message lost the bot that wrote it when the bot left"
	);
}

#[test]
fn setting_a_lead_over_ipc_leaves_exactly_one_lead_seated_in_the_room() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let space = a_space(&window, "Nest");
	let first = a_bot_in(&window, &space, "Nyx");
	let second = a_bot_in(&window, &space, "Ada");
	let third = a_bot_in(&window, &space, "Iris");
	let created =
		a_room(&window, &space, "Standup", vec![first.clone(), second.clone(), third.clone()]);
	let id = id_of(&created);

	assert_eq!(leads(&created), vec![first.clone()]);

	let led =
		call(&window, "conversation_set_lead", json!({ "conversationId": id, "botId": second }))
			.expect("the lead moves");

	assert_eq!(leads(&led), vec![second.clone()], "the room does not seat exactly one lead");
	assert_eq!(seat_of(&led, &first)["role"], json!("assistant"), "the former lead kept the seat");
	assert_eq!(
		present(&led),
		vec![first, second.clone(), third],
		"moving the lead moved the bots around"
	);

	assert_eq!(
		leads(&room_of(&window, &space, &id)),
		vec![second],
		"the lead set over ipc was not kept"
	);
}

#[test]
fn a_room_deleted_over_ipc_is_absent_from_the_list_of_its_space() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let space = a_space(&window, "Nest");
	let bot = a_bot_in(&window, &space, "Nyx");
	let kept = a_room(&window, &space, "Standup", vec![bot.clone()]);
	let doomed = a_room(&window, &space, "Retro", vec![bot]);
	let doomed_id = id_of(&doomed);

	assert_eq!(
		call(&window, "conversation_delete", json!({ "conversationId": doomed_id })),
		Ok(Value::Null)
	);

	assert_eq!(
		room_ids_of(&window, &space),
		vec![id_of(&kept)],
		"a deleted room is still listed in its space"
	);
}

fn dressed(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	icon: Value,
	color: Value,
) -> Result<Value, Value> {
	call(
		window,
		"conversation_update",
		json!({
			"conversationId": conversation_id,
			"title": "Standup",
			"instructions": "",
			"sectionId": null,
			"icon": icon,
			"color": color
		}),
	)
}

fn look(conversation: &Value) -> (Value, Value) {
	(conversation["icon"].clone(), conversation["color"].clone())
}

#[test]
fn a_room_and_a_main_chat_updated_over_ipc_carry_their_icon_and_colour_on_every_read() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let space = a_space(&window, "Nest");
	let bot = a_bot_in(&window, &space, "Nyx");
	let room = id_of(&a_room(&window, &space, "Standup", vec![bot.clone()]));
	let chat = call(&window, "conversation_main_chat", json!({ "botId": bot, "spaceId": space }))
		.expect("the main chat");
	let chat = chat["id"].as_str().expect("the chat holds an id").to_owned();

	let answered = dressed(&window, &room, json!("MessageSquare"), json!(257)).expect("dressed");
	let main = dressed(&window, &chat, json!("Sparkles"), json!(63)).expect("main dressed");
	let page = call(&window, "conversation_page", json!({ "spaceId": space })).expect("the page")
		["conversations"]
		.clone();
	let paged = |id: &str| {
		page.as_array()
			.and_then(|rows| rows.iter().find(|row| row["id"] == json!(id)))
			.cloned()
			.expect("the page holds the conversation")
	};

	assert_eq!(look(&answered), (json!("MessageSquare"), json!(257)));
	assert_eq!(look(&room_of(&window, &space, &room)), (json!("MessageSquare"), json!(257)));
	assert_eq!(look(&paged(&room)), (json!("MessageSquare"), json!(257)));
	assert_eq!(look(&main), (json!("Sparkles"), json!(63)));
	assert_eq!(look(&paged(&chat)), (json!("Sparkles"), json!(63)));

	let cleared = dressed(&window, &chat, Value::Null, Value::Null).expect("main cleared");
	assert_eq!(look(&cleared), (Value::Null, Value::Null));
}

#[test]
fn an_update_with_a_hue_outside_0_to_359_or_an_icon_off_the_list_is_refused_and_changes_nothing() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let space = a_space(&window, "Nest");
	let bot = a_bot_in(&window, &space, "Nyx");
	let room = id_of(&a_room(&window, &space, "Retro", vec![bot]));
	dressed(&window, &room, json!("MessageSquare"), json!(42)).expect("dressed");
	let before = room_of(&window, &space, &room);

	let beyond = dressed(&window, &room, json!("MessageSquare"), json!(400));
	let below = dressed(&window, &room, json!("MessageSquare"), json!(-1));
	let blank = dressed(&window, &room, json!(" \n"), json!(257));
	let unlisted = dressed(&window, &room, json!("Message"), json!(257));

	assert_eq!(
		beyond,
		Err(json!({ "kind": "unknownColour", "colour": "400", "accepted": ["0 to 359"] }))
	);
	assert_eq!(
		below,
		Err(json!({ "kind": "unknownColour", "colour": "-1", "accepted": ["0 to 359"] }))
	);
	assert_eq!(blank, Err(json!({ "kind": "blankIcon" })));
	let unlisted = unlisted.expect_err("an icon off the list was stored");
	assert_eq!(unlisted["kind"], json!("unlistedIcon"));
	assert_eq!(unlisted["icon"], json!("Message"));
	assert!(
		unlisted["accepted"]
			.as_array()
			.is_some_and(|names| names.contains(&json!("MessageSquare"))),
		"the refusal does not name the list: {unlisted}"
	);
	assert_eq!(room_of(&window, &space, &room), before, "a refused update moved the room");
}

#[test]
fn a_space_update_stores_a_hue_and_refuses_one_outside_0_to_359_changing_nothing() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let space = a_space(&window, "Nest");
	let recoloured = |colour: Value| {
		call(&window, "space_update", json!({ "id": space, "name": "Nest", "colour": colour }))
	};
	let listed = || {
		call(&window, "space_list", json!({}))
			.expect("the spaces")
			.as_array()
			.and_then(|spaces| spaces.iter().find(|held| held["id"] == json!(space)).cloned())
			.expect("the space is listed")
	};

	let stored = recoloured(json!(257)).expect("a hue is stored");
	let before = listed();
	let beyond = recoloured(json!(400));
	let below = recoloured(json!(-1));

	assert_eq!((stored["colour"].clone(), before["colour"].clone()), (json!(257), json!(257)));
	assert_eq!(
		beyond,
		Err(json!({ "kind": "unknownColour", "colour": "400", "accepted": ["0 to 359"] }))
	);
	assert_eq!(
		below,
		Err(json!({ "kind": "unknownColour", "colour": "-1", "accepted": ["0 to 359"] }))
	);
	assert_eq!(listed(), before, "a refused update moved the space");
}

#[test]
fn listing_the_rooms_of_a_space_answers_with_that_space_alone() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let nest = a_space(&window, "Nest");
	let elsewhere = a_space(&window, "Elsewhere");
	let resident = a_bot_in(&window, &nest, "Nyx");
	let stranger = a_bot_in(&window, &elsewhere, "Ada");

	let here = a_room(&window, &nest, "Standup", vec![resident]);
	let there = a_room(&window, &elsewhere, "Retro", vec![stranger]);

	assert_eq!(
		room_ids_of(&window, &nest),
		vec![id_of(&here)],
		"the list of a space carried a room of another one"
	);
	assert_eq!(room_ids_of(&window, &elsewhere), vec![id_of(&there)]);
}

#[test]
fn a_bot_moves_into_a_section_over_ipc_naming_only_the_bot_and_the_section() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let nest = a_space(&window, "Nest");
	let elsewhere = a_space(&window, "Elsewhere");
	let bot = a_bot_in(&window, &nest, "Nyx");
	call(&window, "bot_add_to_space", json!({ "botId": bot, "spaceId": elsewhere }))
		.expect("the bot joins the second space");
	let writers =
		call(&window, "section_create", json!({ "spaceId": elsewhere, "name": "Writers" }))
			.expect("the section is created")["id"]
			.as_str()
			.expect("the section holds an id")
			.to_owned();

	call(&window, "bot_move_to_section", json!({ "botId": bot, "sectionId": writers }))
		.expect("the bot moves without the space being named");

	assert_eq!(
		sections_in(&window, &elsewhere),
		vec![json!(writers)],
		"the move over ipc wrote no section on the membership of that space"
	);
	assert_eq!(
		sections_in(&window, &nest),
		vec![Value::Null],
		"the move over ipc reached the membership of another space"
	);
}

fn sections_in(window: &WebviewWindow<MockRuntime>, space_id: &str) -> Vec<Value> {
	call(window, "conversation_bots", json!({ "spaceId": space_id }))
		.expect("the bots")
		.as_array()
		.expect("a list")
		.iter()
		.map(|bot| bot["sectionId"].clone())
		.collect()
}
fn a_host_with_agents(home: &Home) -> App<MockRuntime> {
	let app = home.app();
	app.manage(AgentState::default());
	app
}

fn a_sent_message(id: &str, turn_id: &str, conversation_id: &str, created_at: i64) -> Value {
	let mut sent = a_message_nobody_is_summoned_to(id, turn_id, conversation_id, created_at);
	sent["summoned"] = json!([BOT]);
	sent
}

fn a_message_nobody_is_summoned_to(
	id: &str,
	turn_id: &str,
	conversation_id: &str,
	created_at: i64,
) -> Value {
	json!({ "summoned": [], "message": {
		"id": id,
		"conversationId": conversation_id,
		"turnId": turn_id,
		"authorBotId": null,
		"repliedToMessageId": null,
		"content": format!("said {id}"),
		"createdAt": created_at
	}})
}

fn a_turn_row(app: &App<MockRuntime>, turn_id: &str) -> Option<(i64, Option<i64>)> {
	let state = app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database is open");
	let turn_id = turn_id.to_owned();
	tauri::async_runtime::block_on(database.messages().call(move |connection| {
		Ok(connection
			.query_row(
				"SELECT started_at, completed_at FROM turns WHERE id = ?1",
				[turn_id],
				|row| Ok((row.get(0)?, row.get(1)?)),
			)
			.optional()?)
	}))
	.expect("the turn reads")
}

fn completed_at(app: &App<MockRuntime>, turn_id: &str) -> Option<i64> {
	a_turn_row(app, turn_id).expect("the turn exists").1
}

fn a_reply_left_streaming(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	turn_id: &str,
	id: &str,
) {
	call(
		window,
		"conversation_open_assistant_message",
		json!({ "message": {
			"id": id,
			"conversationId": conversation_id,
			"turnId": turn_id,
			"authorBotId": BOT,
			"repliedToMessageId": null,
			"createdAt": 2
		}}),
	)
	.expect("the reply is opened");
	call(window, "conversation_append_text", json!({ "id": id, "delta": "half" }))
		.expect("the reply streams");
}

#[test]
fn sending_opens_the_turn_with_the_message_and_hands_the_turn_to_the_host() {
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);

	let seq = call(
		&window,
		"conversation_send_user_message",
		a_sent_message("m1", "t1", &conversation, 7),
	)
	.expect("the message is sent");

	assert_eq!(seq, json!(1));
	assert_eq!(a_turn_row(&app, "t1"), Some((7, None)), "the turn did not open at the send time");
	let page = call(&window, "conversation_message_page", a_page(&conversation, None, 10))
		.expect("the page");
	assert_eq!(seqs(&page), vec![1]);
	assert!(
		app.state::<AgentState>().host_writes().owns_turn("t1"),
		"the host does not own the turn"
	);

	call(
		&window,
		"conversation_start_turn",
		json!({ "turn": { "id": "t1", "conversationId": conversation, "startedAt": 99 } }),
	)
	.expect("the front start is accepted");
	call(&window, "conversation_complete_turn", json!({ "id": "t1", "completedAt": 5 }))
		.expect("the front completion is accepted");
	assert_eq!(
		a_turn_row(&app, "t1"),
		Some((7, None)),
		"a front turn command wrote a host-owned turn"
	);
}

#[test]
fn a_refused_message_leaves_no_turn_behind() {
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the message is appended");

	let refused = call(
		&window,
		"conversation_send_user_message",
		a_sent_message("m1", "t2", &conversation, 2),
	);

	assert_eq!(
		refused,
		Err(json!({ "kind": "conflict", "id": "m1", "field": "turn_id" })),
		"the refusal did not say what disagreed"
	);
	assert_eq!(a_turn_row(&app, "t2"), None, "the refused send left its turn behind");
	assert!(!app.state::<AgentState>().host_writes().owns_turn("t2"));
}

#[test]
fn the_next_send_closes_the_turn_nobody_answered_and_spares_the_one_still_streaming() {
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_send_user_message", a_sent_message("m1", "t1", &conversation, 1))
		.expect("the first message is sent");
	call(
		&window,
		"conversation_start_turn",
		json!({ "turn": { "id": "t2", "conversationId": conversation, "startedAt": 2 } }),
	)
	.expect("the streaming turn is started");
	a_reply_left_streaming(&window, &conversation, "t2", "r2");

	call(&window, "conversation_send_user_message", a_sent_message("m3", "t3", &conversation, 3))
		.expect("the next message is sent");

	assert_eq!(completed_at(&app, "t1"), Some(3), "the unanswered turn was left open");
	assert_eq!(completed_at(&app, "t2"), None, "a turn still streaming was closed");
	assert_eq!(completed_at(&app, "t3"), None, "the turn just opened was closed");
}

#[test]
fn opening_the_database_interrupts_open_replies_then_closes_every_open_turn() {
	let home = Home::new();
	let before = {
		let app = home.app();
		let window = window(&app);
		let (_, conversation) = a_bot_and_its_chat(&window);
		for (turn, started_at) in [("t1", 1), ("t2", 2)] {
			call(
				&window,
				"conversation_start_turn",
				json!({ "turn": { "id": turn, "conversationId": conversation, "startedAt": started_at } }),
			)
			.expect("the turn is started");
		}
		a_reply_left_streaming(&window, &conversation, "t2", "r2");
		std::time::SystemTime::now()
			.duration_since(std::time::UNIX_EPOCH)
			.expect("the clock")
			.as_millis() as i64
	};

	let app = home.app();

	let orphan = completed_at(&app, "t1").expect("the orphan turn was left open");
	let answered = completed_at(&app, "t2").expect("the turn of the streaming reply was left open");
	assert!(orphan >= before && answered >= before, "a turn was not stamped with the open time");
	let state = app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database is open");
	let reply = tauri::async_runtime::block_on(database.messages().call(|connection| {
		Ok(connection.query_row(
			"SELECT completion_state FROM messages WHERE id = 'r2'",
			[],
			|row| row.get::<_, String>(0),
		)?)
	}))
	.expect("the reply reads");
	assert_eq!(reply, "interrupted", "the open reply was not interrupted");
}

#[test]
fn cancelling_before_any_submit_closes_the_turn_the_host_opened() {
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_send_user_message", a_sent_message("m1", "t1", &conversation, 1))
		.expect("the message is sent");
	call(
		&window,
		"conversation_start_turn",
		json!({ "turn": { "id": "t2", "conversationId": conversation, "startedAt": 2 } }),
	)
	.expect("a front turn is started");
	let scope = json!({ "conversationId": conversation, "botId": BOT, "runtimeSessionId": "r1", "epoch": 1 });

	let cancelled = call(&window, "agent_cancel_turn", json!({ "scope": scope }));

	assert_eq!(
		cancelled,
		Ok(json!({ "kind": "nothingToCancel" })),
		"a cancel with nothing submitted was reported as done"
	);
	assert!(completed_at(&app, "t1").is_some(), "the unsubmitted host turn was left open");
	assert_eq!(completed_at(&app, "t2"), None, "a turn the front owns was closed by the host");
}

#[test]
fn a_message_nobody_is_summoned_to_is_written_with_its_turn_already_closed() {
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);

	call(
		&window,
		"conversation_send_user_message",
		a_message_nobody_is_summoned_to("m1", "t1", &conversation, 4),
	)
	.expect("the message is sent");

	assert_eq!(a_turn_row(&app, "t1"), Some((4, Some(4))), "the unaddressed turn was left open");
	let page = call(&window, "conversation_message_page", a_page(&conversation, None, 10))
		.expect("the page");
	assert_eq!(seqs(&page), vec![1], "the message was not written with its closed turn");
}

#[test]
fn a_refused_message_nobody_is_summoned_to_leaves_no_closed_turn_behind() {
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	call(&window, "conversation_start_turn", a_turn(&conversation)).expect("the turn is started");
	call(&window, "conversation_append_user_message", a_user_message("m1", &conversation, "hi", 1))
		.expect("the message is appended");

	let refused = call(
		&window,
		"conversation_send_user_message",
		a_message_nobody_is_summoned_to("m1", "t2", &conversation, 2),
	);

	assert!(refused.is_err(), "a conflicting message was accepted");
	assert_eq!(a_turn_row(&app, "t2"), None, "the refused send left its closed turn behind");
}

#[cfg(feature = "fake-claude")]
fn one_scenario_at_a_time() -> std::sync::MutexGuard<'static, ()> {
	static SCENARIO: std::sync::Mutex<()> = std::sync::Mutex::new(());
	SCENARIO.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[cfg(feature = "fake-claude")]
#[test]
fn a_companion_cancelling_before_its_submit_spares_the_turn_another_companion_was_handed() {
	use kiroshi_app::agent::commands::terminate_session;
	use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;

	let _scenario = one_scenario_at_a_time();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, env!("CARGO_BIN_EXE_fake_sidecar"));
	std::env::set_var("FAKE_AGENT_SCENARIO", "slow");
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let (_, conversation) = a_bot_and_its_chat(&window);
	bundled_bots(&app, &["default"]);
	let speaking = json!({ "conversationId": conversation, "botId": BOT, "runtimeSessionId": "r1", "epoch": 1 });
	let silent = json!({ "conversationId": conversation, "botId": "companion-a", "runtimeSessionId": "r2", "epoch": 1 });
	call(
		&window,
		"agent_start_or_resume_session",
		json!({ "scope": speaking, "resume": null, "cwd": std::env::temp_dir() }),
	)
	.expect("the speaking companion starts");
	call(&window, "conversation_send_user_message", a_sent_message("m1", "t1", &conversation, 1))
		.expect("the message is sent");
	call(
		&window,
		"agent_submit_prompt",
		json!({ "scope": speaking, "text": "hello", "turn": { "turnId": "t1", "promptId": "m1" } }),
	)
	.expect("the prompt is handed to the speaking companion");

	let cancelled = call(&window, "agent_cancel_turn", json!({ "scope": silent }));

	assert_eq!(
		cancelled,
		Ok(json!({ "kind": "nothingToCancel" })),
		"a cancel with nothing submitted was reported as done"
	);
	let writes = app.state::<AgentState>();
	assert!(
		writes.host_writes().was_submitted("t1"),
		"the handed turn was not recorded as submitted"
	);
	assert_eq!(completed_at(&app, "t1"), None, "the cancel closed a turn another companion holds");
	tauri::async_runtime::block_on(terminate_session(app.handle(), &writes));
}

#[cfg(feature = "fake-claude")]
fn a_question_row(app: &App<MockRuntime>) -> Option<(String, i64, String, String)> {
	let state = app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database is open");
	tauri::async_runtime::block_on(database.messages().call(|connection| {
		Ok(connection
			.query_row(
				"SELECT id, seq, content, completion_state FROM messages WHERE id LIKE 'question-%'",
				[],
				|row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
			)
			.optional()?)
	}))
	.expect("the question reads")
}

#[cfg(feature = "fake-claude")]
#[test]
fn a_question_line_the_host_wrote_answers_its_seq_and_refuses_every_front_write() {
	use kiroshi_app::agent::commands::terminate_session;
	use kiroshi_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;

	let _scenario = one_scenario_at_a_time();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, env!("CARGO_BIN_EXE_fake_sidecar"));
	std::env::set_var("FAKE_AGENT_SCENARIO", "question");
	let home = Home::new();
	let app = a_host_with_agents(&home);
	let window = window(&app);
	let chat = call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let conversation = chat["id"].as_str().expect("the chat holds an id").to_owned();
	bundled_bots(&app, &["default"]);
	let scope = json!({ "conversationId": conversation, "botId": BOT, "runtimeSessionId": "r1", "epoch": 1 });
	call(
		&window,
		"agent_start_or_resume_session",
		json!({ "scope": scope, "resume": null, "cwd": std::env::temp_dir() }),
	)
	.expect("the companion starts");
	call(&window, "conversation_send_user_message", a_sent_message("m1", "t1", &conversation, 1))
		.expect("the message is sent");
	call(
		&window,
		"agent_submit_prompt",
		json!({ "scope": scope, "text": "hello", "turn": { "turnId": "t1", "promptId": "m1" } }),
	)
	.expect("the prompt is handed to the companion");

	let deadline = std::time::Instant::now() + Duration::from_secs(60);
	let stored = loop {
		if let Some(stored) = a_question_row(&app).filter(|(_, _, _, state)| state == "complete") {
			break stored;
		}
		assert!(std::time::Instant::now() < deadline, "the host never settled the question line");
		std::thread::sleep(Duration::from_millis(20));
	};
	let (id, seq, content, _) = stored.clone();

	let opened = call(
		&window,
		"conversation_open_assistant_message",
		json!({ "message": {
			"id": id,
			"conversationId": conversation,
			"turnId": "t1",
			"authorBotId": BOT,
			"repliedToMessageId": "m1",
			"createdAt": 99
		}}),
	)
	.expect("the front open is accepted");
	call(&window, "conversation_append_text", json!({ "id": id, "delta": content }))
		.expect("the front append is accepted");
	call(
		&window,
		"conversation_finalize_message",
		json!({ "id": id, "completion": "cancelled", "settledText": "rewritten" }),
	)
	.expect("the front finalize is accepted");

	assert_eq!(opened, json!(seq), "the front open did not answer the stored seq");
	assert_eq!(a_question_row(&app), Some(stored), "a front write reached the host question line");
	tauri::async_runtime::block_on(terminate_session(app.handle(), &app.state::<AgentState>()));
}

fn agent_text(app: &App<MockRuntime>, bot_id: &str) -> String {
	let root = bundles::root(app.handle()).expect("the bundle root");
	let path = bundles::agent_file(&root, bot_id).expect("the agent file is written");
	std::fs::read_to_string(path).expect("the agent file reads")
}

#[test]
fn an_effort_the_update_receives_is_stored_and_written_and_null_takes_the_key_out() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let created = call(
		&window,
		"conversation_create_bot",
		json!({ "identity": an_identity("Nyx", "sonnet", json!(42)) }),
	)
	.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();
	assert_eq!(created["effort"], Value::Null, "a companion was born with an effort");

	let mut high = an_identity("Nyx", "sonnet", json!(42));
	high["effort"] = json!("high");
	let updated = call(&window, "conversation_update_bot", json!({ "id": id, "identity": high }))
		.expect("the effort is saved");

	assert_eq!(updated["effort"], json!("high"));
	assert_eq!(
		call(&window, "conversation_bots", json!({})).map(|bots| bots[0]["effort"].clone()),
		Ok(json!("high")),
		"the effort did not outlive the update"
	);
	assert_eq!(occurrences(&agent_text(&app, &id), "\neffort: high\n"), 1);

	let mut cleared = an_identity("Nyx", "sonnet", json!(42));
	cleared["effort"] = Value::Null;
	let updated =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": cleared }))
			.expect("the effort is cleared");

	assert_eq!(updated["effort"], Value::Null);
	assert!(!agent_text(&app, &id).contains("effort:"), "the cleared effort stayed in the file");
}

#[test]
fn an_effort_outside_the_five_levels_is_refused_and_changes_nothing() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut high = an_identity("Nyx", "sonnet", json!(42));
	high["effort"] = json!("high");
	let created = call(&window, "conversation_create_bot", json!({ "identity": high }))
		.expect("the bot is created");
	let id = created["id"].as_str().expect("the bot holds an id").to_owned();
	let before = agent_text(&app, &id);

	let mut extreme = an_identity("Ada", "opus", json!(257));
	extreme["effort"] = json!("extreme");
	let refused =
		call(&window, "conversation_update_bot", json!({ "id": id, "identity": extreme }));

	assert!(refused.is_err(), "a level outside the five was accepted: {refused:?}");
	let held = call(&window, "conversation_bots", json!({})).expect("the bots read");
	assert_eq!(
		(held[0]["name"].clone(), held[0]["model"].clone(), held[0]["effort"].clone()),
		(json!("Nyx"), json!("sonnet"), json!("high")),
		"a refused update reached the row"
	);
	assert_eq!(agent_text(&app, &id), before, "a refused update reached the agent file");
}

#[test]
fn a_duplicate_carries_the_effort_of_its_source() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut max = an_identity("Nyx", "sonnet", json!(42));
	max["effort"] = json!("max");
	let source = call(&window, "conversation_create_bot", json!({ "identity": max }))
		.expect("the bot is created");

	let duplicate = call(&window, "conversation_duplicate_bot", json!({ "botId": source["id"] }))
		.expect("the bot is duplicated");
	let duplicate_id = duplicate["id"].as_str().expect("the copy holds an id").to_owned();

	assert_eq!(duplicate["effort"], json!("max"));
	assert_eq!(occurrences(&agent_text(&app, &duplicate_id), "\neffort: max\n"), 1);
}

#[test]
fn the_local_ids_are_every_stored_conversation_once_and_sorted() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let space = a_space(&window, "Nest");
	let first = id_of(&a_room(&window, &space, "Standup", vec![]));
	let second = id_of(&a_room(&window, &space, "Retro", vec![]));
	let mut expected = vec![first, second];
	expected.sort();

	assert_eq!(call(&window, "conversation_local_ids", json!({})), Ok(json!(expected)));
}

#[test]
fn an_empty_store_answers_no_local_ids() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	assert_eq!(call(&window, "conversation_local_ids", json!({})), Ok(json!([])));
}

#[test]
fn a_host_without_a_database_answers_the_local_ids_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);
	let unavailable = Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }));

	assert_eq!(call(&window, "conversation_list", json!({ "spaceId": "any" })), unavailable);
	assert_eq!(call(&window, "conversation_local_ids", json!({})), unavailable);
}

fn page_of(
	window: &WebviewWindow<MockRuntime>,
	space_id: &str,
	cursor: Value,
	limit: Value,
) -> Value {
	call(
		window,
		"conversation_page",
		json!({ "spaceId": space_id, "cursor": cursor, "limit": limit }),
	)
	.expect("the page reads")
}

fn walked_rooms(window: &WebviewWindow<MockRuntime>, space_id: &str) -> Vec<Vec<Value>> {
	let mut pages = Vec::new();
	let mut cursor = Value::Null;
	loop {
		let page = page_of(window, space_id, cursor, Value::Null);
		pages.push(page["conversations"].as_array().expect("the page holds a list").clone());
		cursor = page["nextCursor"].clone();
		if cursor.is_null() {
			return pages;
		}
	}
}

fn rooms_in(
	home: &Home,
	count: usize,
) -> (App<MockRuntime>, WebviewWindow<MockRuntime>, String, Vec<String>) {
	let app = home.app();
	let window = window(&app);
	let space = a_space(&window, "Nest");
	let bot = a_bot_in(&window, &space, "Nyx");
	let created = (0..count)
		.map(|n| id_of(&a_room(&window, &space, &format!("Room {n}"), vec![bot.clone()])))
		.collect();
	(app, window, space, created)
}

#[test]
fn a_space_of_65_rooms_and_one_solo_is_walked_newest_first_in_pages_of_30_30_and_6() {
	let home = Home::new();
	let (_app, window, space, mut created) = rooms_in(&home, 65);

	let pages = walked_rooms(&window, &space);

	let sizes: Vec<usize> = pages.iter().map(Vec::len).collect();
	let walked: Vec<Value> = pages.concat();
	let keys: Vec<(i64, String)> = walked
		.iter()
		.map(|room| (room["lastActivityAt"].as_i64().expect("an activity"), id_of(room)))
		.collect();
	let mut newest_first = keys.clone();
	newest_first.sort_by(|left, right| right.cmp(left));
	let (solos, rooms): (Vec<&Value>, Vec<&Value>) =
		walked.iter().partition(|row| !row["soloBotId"].is_null());
	let mut ids: Vec<String> = rooms.into_iter().map(id_of).collect();
	ids.sort();
	created.sort();
	assert_eq!(sizes, vec![30, 30, 6]);
	assert_eq!(keys, newest_first, "the walk was not newest first");
	assert_eq!(ids, created, "the walk did not answer every room exactly once");
	assert_eq!(solos.len(), 1, "the walk did not answer the companion solo exactly once");
	assert_eq!(walked[0]["lastWord"], Value::Null);
	assert_eq!(walked[0]["participants"].as_array().map(Vec::len), Some(1));
}

#[test]
fn the_first_page_holds_each_companion_solo_beside_the_rooms() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let space = a_space(&window, "Nest");
	let bot = a_bot_in(&window, &space, "Nyx");
	let solo = id_of(
		&call(&window, "conversation_main_chat", json!({ "botId": bot, "spaceId": space }))
			.expect("the solo"),
	);
	let room = id_of(&a_room(&window, &space, "Standup", vec![bot.clone()]));

	let page = page_of(&window, &space, Value::Null, Value::Null);

	let rows: BTreeMap<String, Value> = page["conversations"]
		.as_array()
		.expect("the page holds a list")
		.iter()
		.map(|row| (id_of(row), row["soloBotId"].clone()))
		.collect();
	assert_eq!(rows, BTreeMap::from([(room, Value::Null), (solo, json!(bot))]));
	assert_eq!(page["pinned"], json!([]));
	assert_eq!(page["nextCursor"], Value::Null);
}

#[test]
fn a_page_holds_thirty_rooms_at_most_and_one_at_least() {
	let home = Home::new();
	let (_app, window, space, _) = rooms_in(&home, 31);
	let held = |limit: Value| {
		page_of(&window, &space, Value::Null, limit)["conversations"].as_array().map(Vec::len)
	};

	assert_eq!(held(Value::Null), Some(30));
	assert_eq!(held(json!(45)), Some(30));
	assert_eq!(held(json!(0)), Some(1));
	assert_eq!(held(json!(3)), Some(3));
}

#[test]
fn a_cursor_that_does_not_decode_is_refused_by_name_before_any_row_is_read() {
	let app = app_without_a_database();
	let window = window(&app);

	let refused = call(
		&window,
		"conversation_page",
		json!({ "spaceId": "any", "cursor": "not a cursor", "limit": null }),
	);

	assert_eq!(refused, Err(json!({ "kind": "unreadableCursor", "cursor": "not a cursor" })));
}
