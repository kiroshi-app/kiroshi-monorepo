mod common;

use std::sync::mpsc;
use std::time::Duration;

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::agent::host::Host;
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::conversations::contract::UPDATED_EVENT;
use kiroshi_app::db;
use kiroshi_app::missions::commands::CHANGED_EVENT;
use kiroshi_app::missions::contract::{Mission, MissionDraft, Ticket};
use kiroshi_app::missions::host::MissionHost;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const BOT: &str = "default";

struct Home {
	app: AppOfItsOwn,
}

impl Home {
	fn new() -> Self {
		let app =
			an_app_of_its_own("mission-commands", mock_builder().invoke_handler(invoke_handler()));
		app.manage(db::bootstrap(app.handle()));
		Self { app }
	}
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
	.map(|response| response.deserialize::<Value>().expect("the answer is JSON"))
	.map_err(|error| serde_json::to_value(error).expect("the error is JSON"))
}

fn a_mission(home: &Home, window: &WebviewWindow<MockRuntime>) -> String {
	an_open_mission(home, window).id
}

fn an_open_mission(home: &Home, window: &WebviewWindow<MockRuntime>) -> Mission {
	let chat = call(window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let draft = MissionDraft {
		origin_conversation_id: chat["id"].as_str().expect("the chat holds an id").to_owned(),
		bot_id: BOT.to_owned(),
		objective: "Fix the crash".to_owned(),
		ticket: Ticket {
			platform: "github".to_owned(),
			external_id: "42".to_owned(),
			url: "https://kiroshi.test/tickets/42".to_owned(),
			title: "Crash on open".to_owned(),
		},
		tools: vec![],
		source: "bot".to_owned(),
		workspace_path: None,
	};
	let state = home.app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	tauri::async_runtime::block_on(database.missions().open(draft, "a-key".to_owned()))
		.expect("the mission opens")
}

fn changes_of(home: &Home) -> mpsc::Receiver<Value> {
	heard(home, CHANGED_EVENT)
}

fn heard(home: &Home, event_name: &str) -> mpsc::Receiver<Value> {
	let (sender, received) = mpsc::channel();
	home.app.listen(event_name, move |event| {
		let change = serde_json::from_str(event.payload()).expect("the payload is JSON");
		sender.send(change).expect("the test still listens");
	});
	received
}

fn a_topic(window: &WebviewWindow<MockRuntime>) -> String {
	let topic = call(
		window,
		"conversation_create",
		json!({ "spaceId": "personal", "sectionId": null, "title": "Standup", "botIds": [BOT] }),
	)
	.expect("the topic is created");
	topic["id"].as_str().expect("the topic holds an id").to_owned()
}

fn appended(window: &WebviewWindow<MockRuntime>, conversation_id: &str) {
	let turn = format!("t-{conversation_id}");
	call(
		window,
		"conversation_start_turn",
		json!({ "turn": { "id": turn, "conversationId": conversation_id, "startedAt": 1 } }),
	)
	.expect("the turn starts");
	call(
		window,
		"conversation_append_user_message",
		json!({ "message": {
			"id": format!("m-{conversation_id}"),
			"conversationId": conversation_id,
			"turnId": turn,
			"authorBotId": null,
			"repliedToMessageId": null,
			"content": "hello",
			"createdAt": 2
		}}),
	)
	.expect("the message is appended");
}

#[test]
fn a_message_appended_to_a_mission_thread_stays_out_of_the_feed_while_a_topic_one_lands() {
	let home = Home::new();
	let window = window(&home.app);
	let thread_id = an_open_mission(&home, &window).thread_conversation_id;
	let topic_id = a_topic(&window);
	let updates = heard(&home, UPDATED_EVENT);

	appended(&window, &thread_id);
	appended(&window, &topic_id);

	let topic_update =
		updates.recv_timeout(Duration::from_secs(60)).expect("the topic update is announced");
	assert_eq!(topic_update["conversation"]["id"], json!(topic_id));
	assert_eq!(updates.try_recv().ok(), None, "a second feed update was announced");
}

#[test]
fn reopening_a_closed_mission_brings_it_back_to_working_and_tells_the_front() {
	let home = Home::new();
	let window = window(&home.app);
	let mission_id = a_mission(&home, &window);
	let closed = call(&window, "mission_close", json!({ "missionId": mission_id }))
		.expect("the mission closes");
	assert_eq!(closed["state"], json!("closed"));
	let changes = changes_of(&home);

	let reopened =
		call(&window, "mission_reopen", json!({ "missionId": mission_id })).expect("it reopens");

	assert_eq!(reopened["state"], json!("working"));
	assert_eq!(reopened["closedAt"], Value::Null);
	assert!(
		reopened["stateSeq"].as_i64() > closed["stateSeq"].as_i64(),
		"the reopen did not move the state seq: {reopened}"
	);
	assert_eq!(
		changes.try_iter().collect::<Vec<_>>(),
		vec![json!({
			"missionId": mission_id,
			"spaceId": "personal",
			"state": "working",
			"stateSeq": reopened["stateSeq"],
			"isAgentRunning": false,
			"lastActivityAt": null,
		})],
		"the front was not told the mission reopened"
	);
	let detail = call(&window, "mission_detail", json!({ "missionId": mission_id }))
		.expect("the mission reads");
	let last = detail["events"].as_array().and_then(|events| events.last()).cloned();
	assert_eq!(
		last.map(|event| (event["kind"].clone(), event["source"].clone())),
		Some((json!("reopened"), json!("person"))),
	);
}

#[test]
fn reopening_a_mission_still_open_or_unknown_is_refused() {
	let home = Home::new();
	let window = window(&home.app);
	let mission_id = a_mission(&home, &window);

	let still_open = call(&window, "mission_reopen", json!({ "missionId": mission_id }));
	let unknown = call(&window, "mission_reopen", json!({ "missionId": "nobody" }));

	assert_eq!(still_open, Err(json!({ "kind": "missionStillOpen", "id": mission_id })));
	assert_eq!(unknown, Err(json!({ "kind": "unknownMission", "id": "nobody" })));
}

fn a_room(
	window: &WebviewWindow<MockRuntime>,
	space_id: &str,
	title: &str,
	bots: &[&str],
) -> String {
	let room = call(
		window,
		"conversation_create",
		json!({ "spaceId": space_id, "sectionId": null, "title": title, "botIds": bots }),
	)
	.expect("the room is created");
	room["id"].as_str().expect("the room holds an id").to_owned()
}

fn a_bot_in(window: &WebviewWindow<MockRuntime>, space_id: &str) -> String {
	let identity = json!({
		"name": "Stranger",
		"title": "",
		"model": "sonnet",
		"avatarBlot": null,
		"avatarImagePath": null,
		"instructions": "",
		"deniedTools": [],
	});
	let bot = call(
		window,
		"conversation_create_bot",
		json!({ "identity": identity, "spaceId": space_id }),
	)
	.expect("the bot is created");
	bot["id"].as_str().expect("the bot holds an id").to_owned()
}

fn opened_in(home: &Home, conversation_id: &str, bot_id: &str, objective: &str) -> String {
	let draft = MissionDraft {
		origin_conversation_id: conversation_id.to_owned(),
		bot_id: bot_id.to_owned(),
		objective: objective.to_owned(),
		ticket: Ticket {
			platform: "github".to_owned(),
			external_id: objective.to_owned(),
			url: format!("https://kiroshi.test/tickets/{objective}"),
			title: objective.to_owned(),
		},
		tools: vec![],
		source: "bot".to_owned(),
		workspace_path: None,
	};
	let state = home.app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	let id =
		tauri::async_runtime::block_on(database.missions().open(draft, format!("key-{objective}")))
			.expect("the mission opens")
			.id;
	let latest = id.clone();
	tauri::async_runtime::block_on(database.call(move |connection| {
		let sql = "UPDATE missions SET opened_at = (SELECT MAX(opened_at) + 1 FROM missions)
			WHERE id = ?1";
		Ok(connection.execute(sql, [latest])?)
	}))
	.expect("the mission opens after every other");
	id
}

fn closed_long_ago(home: &Home, mission_id: &str) {
	let state = home.app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	let closed = mission_id.to_owned();
	tauri::async_runtime::block_on(database.call(move |connection| {
		Ok(connection.execute("UPDATE missions SET closed_at = 1 WHERE id = ?1", [closed])?)
	}))
	.expect("the closing is backdated");
}

fn closed_at(window: &WebviewWindow<MockRuntime>, mission_id: &str) -> i64 {
	let closed = call(window, "mission_close", json!({ "missionId": mission_id }))
		.expect("the mission closes");
	closed["closedAt"].as_i64().expect("the mission holds its closing time")
}

#[test]
fn the_space_feed_holds_the_open_and_recently_closed_missions_of_that_space_only() {
	let home = Home::new();
	let window = window(&home.app);
	call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let other_space = call(&window, "space_create", json!({ "name": "Elsewhere" }))
		.expect("the space is created")["id"]
		.as_str()
		.expect("the space holds an id")
		.to_owned();
	let stranger = a_bot_in(&window, &other_space);
	let crashes = a_room(&window, "personal", "Crashes", &[BOT]);
	let billing = a_room(&window, "personal", "Billing", &[BOT]);
	let elsewhere = a_room(&window, &other_space, "Elsewhere", &[&stranger]);
	let still_open = opened_in(&home, &crashes, BOT, "open");
	let closed_later = opened_in(&home, &billing, BOT, "closed-later");
	let closed_earlier = opened_in(&home, &crashes, BOT, "closed-earlier");
	opened_in(&home, &elsewhere, &stranger, "other-space");
	closed_at(&window, &closed_earlier);
	closed_long_ago(&home, &closed_earlier);
	let closed_since = 2;
	assert!(closed_at(&window, &closed_later) >= closed_since);

	let feed = call(
		&window,
		"mission_space_feed",
		json!({ "spaceId": "personal", "closedSince": closed_since }),
	)
	.expect("the feed reads");

	let entries = feed
		.as_array()
		.expect("the feed is a list")
		.iter()
		.map(|entry| {
			(
				entry["mission"]["id"].clone(),
				entry["conversationId"].clone(),
				entry["conversationTitle"].clone(),
			)
		})
		.collect::<Vec<_>>();
	assert_eq!(
		entries,
		vec![
			(json!(still_open), json!(crashes), json!("Crashes")),
			(json!(closed_later), json!(billing), json!("Billing")),
		]
	);
}

fn walked_feed(window: &WebviewWindow<MockRuntime>, space_id: &str) -> Vec<Vec<Value>> {
	let mut pages = Vec::new();
	let mut cursor = Value::Null;
	loop {
		let page = call(
			window,
			"mission_space_page",
			json!({ "spaceId": space_id, "closedSince": 0, "cursor": cursor, "limit": null }),
		)
		.expect("the page reads");
		pages.push(page["missions"].as_array().expect("the page holds a list").clone());
		cursor = page["nextCursor"].clone();
		if cursor.is_null() {
			return pages;
		}
	}
}

#[test]
fn a_space_of_65_missions_is_walked_newest_first_in_pages_of_30_30_and_5() {
	let home = Home::new();
	let window = window(&home.app);
	call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let crashes = a_room(&window, "personal", "Crashes", &[BOT]);
	let opened: Vec<String> =
		(0..65).map(|n| opened_in(&home, &crashes, BOT, &format!("objective-{n}"))).collect();

	let pages = walked_feed(&window, "personal");

	let sizes: Vec<usize> = pages.iter().map(Vec::len).collect();
	let walked: Vec<Value> =
		pages.concat().iter().map(|entry| entry["mission"]["id"].clone()).collect();
	let newest_first: Vec<Value> = opened.iter().rev().map(|id| json!(id)).collect();
	assert_eq!(sizes, vec![30, 30, 5]);
	assert_eq!(walked, newest_first);
	assert_eq!(pages[0][0]["conversationTitle"], json!("Crashes"));
}

#[test]
fn a_mission_page_holds_thirty_missions_at_most_and_one_at_least() {
	let home = Home::new();
	let window = window(&home.app);
	call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let crashes = a_room(&window, "personal", "Crashes", &[BOT]);
	for n in 0..31 {
		opened_in(&home, &crashes, BOT, &format!("objective-{n}"));
	}
	let held = |limit: Value| {
		call(
			&window,
			"mission_space_page",
			json!({ "spaceId": "personal", "closedSince": 0, "cursor": null, "limit": limit }),
		)
		.expect("the page reads")["missions"]
			.as_array()
			.map(Vec::len)
	};

	assert_eq!(held(Value::Null), Some(30));
	assert_eq!(held(json!(45)), Some(30));
	assert_eq!(held(json!(0)), Some(1));
	assert_eq!(held(json!(3)), Some(3));
}

#[test]
fn a_mission_cursor_that_does_not_decode_is_refused_by_name_before_any_row_is_read() {
	let app = an_app_of_its_own(
		"mission-commands-no-database",
		mock_builder()
			.invoke_handler(invoke_handler())
			.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir)),
	);
	let window = window(&app);

	let refused = call(
		&window,
		"mission_space_page",
		json!({ "spaceId": "any", "closedSince": 0, "cursor": "not a cursor", "limit": null }),
	);

	assert_eq!(refused, Err(json!({ "kind": "unreadableCursor", "cursor": "not a cursor" })));
}

fn last_event(window: &WebviewWindow<MockRuntime>, mission_id: &str) -> (Value, Value) {
	let detail = call(window, "mission_detail", json!({ "missionId": mission_id }))
		.expect("the mission reads");
	let last = detail["events"]
		.as_array()
		.and_then(|events| events.last())
		.cloned()
		.expect("the mission holds events");
	(last["kind"].clone(), last["source"].clone())
}

fn bot_of(home: &Home, window: &WebviewWindow<MockRuntime>) -> MissionHost<MockRuntime> {
	let chat = call(window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let chat_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
	MissionHost::new(home.app.handle().clone(), chat_id, BOT.to_owned())
}

fn bot_close(
	home: &Home,
	window: &WebviewWindow<MockRuntime>,
	mission_id: &str,
	outcome: &str,
) -> Result<Value, Value> {
	let request = json!({
		"subtype": "mission",
		"operation": "close",
		"payload": { "id": mission_id, "outcome": outcome, "summary": "Settled by the bot" },
	});
	tauri::async_runtime::block_on(bot_of(home, window).answer(request))
}

#[test]
fn a_person_closing_a_working_mission_lands_it_in_closed_with_a_dismissed_event() {
	let home = Home::new();
	let window = window(&home.app);
	let mission_id = a_mission(&home, &window);
	let before = call(&window, "mission_detail", json!({ "missionId": mission_id }))
		.expect("the mission reads");
	assert_eq!(before["mission"]["state"], json!("working"));
	let changes = changes_of(&home);

	let closed = call(&window, "mission_close", json!({ "missionId": mission_id }))
		.expect("the mission closes");

	assert_eq!(closed["state"], json!("closed"));
	assert!(closed["closedAt"].as_i64().is_some(), "the close set no closing time: {closed}");
	assert!(
		closed["stateSeq"].as_i64() > before["mission"]["stateSeq"].as_i64(),
		"the close did not move the state seq: {closed}"
	);
	assert_eq!(last_event(&window, &mission_id), (json!("dismissed"), json!("person")));
	assert_eq!(
		changes.try_iter().map(|change| change["state"].clone()).collect::<Vec<_>>(),
		vec![json!("closed")],
		"the front was not told the mission closed"
	);
}

#[test]
fn closing_a_mission_already_closed_is_refused_as_a_bot_close_is() {
	let home = Home::new();
	let window = window(&home.app);
	let mission_id = a_mission(&home, &window);
	call(&window, "mission_close", json!({ "missionId": mission_id })).expect("the mission closes");

	let again = call(&window, "mission_close", json!({ "missionId": mission_id }));
	let by_the_bot = bot_close(&home, &window, &mission_id, "done");

	assert_eq!(again, Err(json!({ "kind": "missionAlreadyClosed", "id": mission_id })));
	assert_eq!(again, by_the_bot);
	assert_eq!(last_event(&window, &mission_id), (json!("dismissed"), json!("person")));
}

#[test]
fn a_bot_closing_on_done_or_failed_keeps_its_outcome() {
	let home = Home::new();
	let window = window(&home.app);
	let chat = call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let chat_id = chat["id"].as_str().expect("the chat holds an id");
	let done = opened_in(&home, chat_id, BOT, "done");
	let failed = opened_in(&home, chat_id, BOT, "failed");

	let settled = bot_close(&home, &window, &done, "done").expect("the bot closes on done");
	let lost = bot_close(&home, &window, &failed, "failed").expect("the bot closes on failed");

	assert_eq!((settled["state"].clone(), settled["closedAt"].is_i64()), (json!("done"), true));
	assert_eq!((lost["state"].clone(), lost["closedAt"].is_i64()), (json!("failed"), true));
	assert_eq!(last_event(&window, &done), (json!("closed"), json!("bot")));
	assert_eq!(last_event(&window, &failed), (json!("failed"), json!("bot")));
}

#[test]
fn a_closed_mission_is_listed_among_the_closed_ones_and_never_on_the_board() {
	let home = Home::new();
	let window = window(&home.app);
	call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	let crashes = a_room(&window, "personal", "Crashes", &[BOT]);
	let still_open = opened_in(&home, &crashes, BOT, "open");
	let dismissed = opened_in(&home, &crashes, BOT, "dismissed");
	let closed_since = closed_at(&window, &dismissed);

	let list = call(&window, "mission_list", json!({ "conversationId": crashes }))
		.expect("the list reads");
	let board = call(&window, "mission_board", json!({})).expect("the board reads");
	let feed = call(
		&window,
		"mission_space_feed",
		json!({ "spaceId": "personal", "closedSince": closed_since }),
	)
	.expect("the feed reads");
	let detail = call(&window, "mission_detail", json!({ "missionId": dismissed }))
		.expect("the mission reads");

	let ids = |missions: &Value| {
		missions
			.as_array()
			.expect("a list")
			.iter()
			.map(|mission| (mission["id"].clone(), mission["state"].clone()))
			.collect::<Vec<_>>()
	};
	let nested = |entries: &Value| {
		entries
			.as_array()
			.expect("a list")
			.iter()
			.map(|entry| (entry["mission"]["id"].clone(), entry["mission"]["state"].clone()))
			.collect::<Vec<_>>()
	};
	assert_eq!(ids(&list["open"]), vec![(json!(still_open), json!("working"))]);
	assert_eq!(ids(&list["done"]), vec![(json!(dismissed), json!("closed"))]);
	assert_eq!(nested(&board), vec![(json!(still_open), json!("working"))]);
	assert_eq!(
		nested(&feed),
		vec![(json!(still_open), json!("working")), (json!(dismissed), json!("closed"))]
	);
	assert_eq!(detail["mission"]["state"], json!("closed"));
}
