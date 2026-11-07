use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::time::Duration;

use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

use crate::account::session::restore;
use crate::account::session::AccountSession;
use crate::agent::protocol::OauthCredentials;
use crate::agent::protocol::SpaceMember;
use crate::bundles::{self, BotPermissions, DEFAULT_OUTPUT_STYLE};
use crate::conversations::commands::conversation_send_user_message;
use crate::conversations::contract::{BotIdentity, UPDATED_EVENT as CONVERSATION_UPDATED_EVENT};
use crate::conversations::turn_run_deadline::{arm_start_deadlines, TurnRunDeadlines};
use crate::db::repositories::conversations::{a_pending_prompt, PromptKind};
use crate::db::repositories::messages::{
	EndedRun, MessagePageQuery, MessageRole, NewAssistantMessage, NewTurn, WebSource,
};
use crate::db::{self, DatabaseState};
use crate::environment::commands::writable_root;
use crate::environment::contract::{EnvOwner, EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::hosting::authorship::{Caller, CommandCaller};
use crate::hosting::bridge::LocalApi;
use crate::hosting::contract::{HostingState, Member, MemberStatus, SpaceMembers};
use crate::hosting::Hosting;
use crate::mcp_oauth::asking::AuthorizationAnswers;
use crate::mcp_oauth::commands::{mcp_application_status, McpOauthState};
use crate::mcp_oauth::credentials;
use crate::mcp_oauth::reports::ApplicationReports;
use crate::removed_on_drop::RemovedOnDrop;
use crate::routines::webhook::{self, Webhook};
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_core::environment::commands::env_list;

const BEARER: &str = "bearer-that-never-leaves";
const PERSONAL: &str = "personal";
const PATIENCE: Duration = Duration::from_secs(60);
const OWNER_EMAIL: &str = "owner@example.com";
const OWNER_ACCOUNT: &str = "owner";
const OTHER_BEARER: &str = "bearer-of-another-account";
const OTHER_ACCOUNT: &str = "another-account";

async fn me(headers: HeaderMap) -> Response {
	let Some(account_id) = account_of(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	answered_json(
		StatusCode::OK,
		json!({ "id": account_id, "email": OWNER_EMAIL, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" }),
	)
}

fn account_of(headers: &HeaderMap) -> Option<&'static str> {
	match bearer_of(headers) {
		BEARER => Some(OWNER_ACCOUNT),
		OTHER_BEARER => Some(OTHER_ACCOUNT),
		_ => None,
	}
}

fn answered_json(status: StatusCode, body: Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tauri::async_runtime::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

const GUEST: &str = "guest-account";
const GUEST_EMAIL: &str = "guest@example.com";
const HOST_NAME: &str = "Ada on the host";

struct Authoring {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	local: LocalApi,
	conversation_id: String,
	_root: RemovedOnDrop,
}

impl Authoring {
	async fn new(bearer: Option<&str>) -> Self {
		let cloud = served(Router::new().route("/me", get(me))).await;
		let app = an_app_of_its_own(
			"hosting-authorship",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		crate::db::install(crate::events::core(app.handle()));
		let root = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-hosting-authorship-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		crate::events::core(app.app_handle())
			.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		restore(crate::events::core(app.handle()).clone()).await;
		crate::events::core(app.app_handle()).manage(webhook::start(
			crate::events::core(app.handle()).clone(),
			crate::host_api::routes(app.handle().clone()),
		));
		let local = super::local_api(crate::events::core(app.handle()))
			.expect("the local host api listens");
		crate::events::core(app.app_handle()).manage(Hosting::new(&cloud, Some(local.clone())));
		crate::events::core(app.app_handle()).state::<Hosting>().seated(
			PERSONAL,
			None,
			SpaceMembers {
				members: vec![Member {
					user_id: GUEST.to_owned(),
					name: None,
					email: GUEST_EMAIL.to_owned(),
					status: MemberStatus::Joined,
				}],
				invitations: Vec::new(),
			},
		);
		let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
			.build()
			.expect("the window builds");
		let mut preferences = direct(&window, "user_preferences", json!({}));
		preferences["displayName"] = json!(HOST_NAME);
		direct(&window, "user_set_preferences", json!({ "preferences": preferences }));
		let chat = direct(&window, "conversation_main_chat", json!({ "botId": "default" }));
		let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
		Self { app, window, local, conversation_id, _root: root }
	}

	fn turn(&self, turn_id: &str) {
		direct(
			&self.window,
			"conversation_start_turn",
			json!({ "turn": { "id": turn_id, "conversationId": self.conversation_id, "startedAt": 1 } }),
		);
	}

	fn sent(&self, id: &str) -> Value {
		self.turn(id);
		self.unstarted(id)
	}

	fn unstarted(&self, id: &str) -> Value {
		json!({
			"message": {
				"id": id,
				"conversationId": self.conversation_id,
				"turnId": id,
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": "hello",
				"createdAt": 1,
				"authorAccountId": "forged-account",
				"authorName": "Forged",
			},
			"summoned": [],
		})
	}

	async fn relayed(&self, frame: Value) -> Value {
		self.relayed_by(GUEST, frame).await
	}

	async fn relayed_by(&self, account_id: &str, frame: Value) -> Value {
		let answer = self.answered_by(account_id, frame).await;
		assert_eq!(answer["status"], json!(200), "{answer}");
		answer["body"].clone()
	}

	async fn answered(&self, frame: Value) -> Value {
		self.answered_by(GUEST, frame).await
	}

	async fn answered_by(&self, account_id: &str, frame: Value) -> Value {
		let call =
			super::bridge::member_call(&frame.to_string(), account_id).expect("a member call");
		let answer = super::bridge::bridged(
			crate::events::core(self.app.handle()).clone(),
			self.local.clone(),
			PERSONAL.to_owned(),
			call,
		)
		.await;
		serde_json::from_str(&answer).expect("a json answer")
	}

	fn page(&self) -> Value {
		json!({ "conversationId": self.conversation_id, "beforeSeq": null, "limit": 50 })
	}

	fn reopened_store(&self) -> db::Database {
		let file = db::connection::file(crate::events::core(self.app.handle()).data_dir())
			.expect("the store file is known");
		db::open(file.parent().expect("the store lives in a directory"))
	}

	async fn stored_authors(
		database: &db::Database,
		conversation_id: &str,
	) -> Vec<(String, Option<String>, Option<String>)> {
		database
			.messages()
			.page_messages(MessagePageQuery {
				conversation_id: conversation_id.to_owned(),
				before_seq: None,
				limit: 50,
			})
			.await
			.expect("the reopened store reads its page")
			.messages
			.into_iter()
			.filter(|message| message.role == MessageRole::User)
			.map(|message| (message.id, message.author.account_id, message.author.name))
			.collect()
	}

	fn stored_guest(id: &str) -> (String, Option<String>, Option<String>) {
		(id.to_owned(), Some(GUEST.to_owned()), Some(GUEST_EMAIL.to_owned()))
	}

	fn authors(page: &Value) -> Vec<(Value, Value, Value)> {
		page["messages"]
			.as_array()
			.expect("a page of messages")
			.iter()
			.map(|message| {
				(
					message["id"].clone(),
					message["authorAccountId"].clone(),
					message["authorName"].clone(),
				)
			})
			.collect()
	}
}

impl Drop for Authoring {
	fn drop(&mut self) {
		crate::events::core(self.app.app_handle()).state::<Webhook>().stop();
	}
}

fn direct(window: &WebviewWindow<MockRuntime>, command: &str, body: Value) -> Value {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: command.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("a url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.unwrap_or_else(|error| panic!("{command} was refused: {error:?}"))
	.deserialize::<Value>()
	.expect("the answer is JSON")
}

#[test]
fn a_message_typed_on_the_host_and_one_relayed_from_a_guest_carry_two_authors_read_by_either_side()
{
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.sent("relayed"),
		}))
		.await;

		let read_by_the_guest = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page() }),
			)
			.await;
		let read_by_the_host = direct(&host.window, "conversation_message_page", host.page());

		let expected = vec![
			(json!("typed"), json!("owner"), json!(HOST_NAME)),
			(json!("relayed"), json!(GUEST), json!(GUEST_EMAIL)),
		];
		assert_eq!(Authoring::authors(&read_by_the_guest), expected);
		assert_eq!(Authoring::authors(&read_by_the_host), expected);
	});
}

#[test]
fn one_account_reads_as_one_name_on_the_host_or_through_the_relay_and_each_line_names_its_computer()
{
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed_by(
			"owner",
			json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": host.sent("from-harbour"),
				"computer": "Harbour",
			}),
		)
		.await;
		host.relayed(json!({
			"id": 2,
			"command": "conversation_send_user_message",
			"args": host.sent("unnamed-computer"),
		}))
		.await;

		let header = |id: &str| {
			direct(
				&host.window,
				"conversation_message_header",
				json!({ "conversationId": host.conversation_id, "messageId": id }),
			)
		};
		let here = crate::account::session::this_computer().await;
		let at = "1970-01-01T00:00:00Z";

		assert_eq!(
			header("typed"),
			json!(format!("[{HOST_NAME} <{OWNER_EMAIL}> · from {here} · {at}]"))
		);
		assert_eq!(
			header("from-harbour"),
			json!(format!("[{HOST_NAME} <{OWNER_EMAIL}> · from Harbour · {at}]"))
		);
		assert_eq!(
			header("unnamed-computer"),
			json!(format!("[{GUEST_EMAIL} · from another computer · {at}]"))
		);
	});
}

#[test]
fn a_member_replying_with_an_excerpt_through_the_relay_stores_it_as_the_host_would() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		let mut replying = host.sent("relayed");
		replying["message"]["replyLinks"] = json!([{ "messageId": "typed", "excerpt": "hello" }]);
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": replying,
		}))
		.await;

		let page = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page() }),
			)
			.await;

		let relayed = page["messages"]
			.as_array()
			.expect("a page of messages")
			.iter()
			.find(|message| message["id"] == "relayed")
			.expect("the relayed reply is stored");
		assert_eq!(relayed["replyLinks"], json!([{ "messageId": "typed", "excerpt": "hello" }]));
		assert_eq!(relayed["repliedToMessageIds"], json!(["typed"]));
	});
}

#[test]
fn a_member_reads_the_web_sources_of_a_reply_through_the_relay_as_the_host_does() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		let state = crate::events::core(host.app.app_handle()).state::<DatabaseState>();
		let messages = state.as_ref().expect("the database").messages();
		messages
			.open_assistant_message(NewAssistantMessage {
				id: "answer".to_owned(),
				conversation_id: host.conversation_id.clone(),
				turn_id: "typed".to_owned(),
				author_bot_id: Some("default".to_owned()),
				replied_to_message_id: Some("typed".to_owned()),
				created_at: 2,
			})
			.await
			.expect("the reply is opened");
		let read = vec![
			WebSource {
				url: "https://serde.rs/derive.html".to_owned(),
				domain: "serde.rs".to_owned(),
				title: Some("Serde derive".to_owned()),
			},
			WebSource {
				url: "https://docs.rs/serde".to_owned(),
				domain: "docs.rs".to_owned(),
				title: None,
			},
		];
		messages.keep_web_sources("answer".to_owned(), read).await.expect("the sources are kept");
		let web_sources_of = |page: &Value| {
			page["messages"]
				.as_array()
				.expect("a page of messages")
				.iter()
				.find(|message| message["id"] == "answer")
				.expect("the reply is read")["webSources"]
				.clone()
		};

		let on_the_host = direct(&host.window, "conversation_message_page", host.page());
		let through_the_relay = host
			.relayed(
				json!({ "id": 1, "command": "conversation_message_page", "args": host.page() }),
			)
			.await;

		let expected = json!([
			{ "url": "https://serde.rs/derive.html", "domain": "serde.rs", "title": "Serde derive" },
			{ "url": "https://docs.rs/serde", "domain": "docs.rs", "title": null },
		]);
		assert_eq!(web_sources_of(&on_the_host), expected);
		assert_eq!(web_sources_of(&through_the_relay), expected);
	});
}

#[test]
fn a_hosted_space_with_a_joined_member_names_every_member_to_a_session_and_marks_the_host() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let database = host.reopened_store();
		let members_of = || {
			super::authorship::members_of(
				crate::events::core(host.app.handle()),
				&database,
				PERSONAL,
			)
		};
		let hosted_with = |members: Vec<Member>| {
			let hosting = crate::events::core(host.app.app_handle()).state::<Hosting>();
			let members = SpaceMembers { members, invitations: Vec::new() };
			hosting.seated(PERSONAL, Some(HostingState::Online), members);
		};
		let member =
			|user_id: &str, name: Option<&str>, email: &str, status: MemberStatus| Member {
				user_id: user_id.to_owned(),
				name: name.map(str::to_owned),
				email: email.to_owned(),
				status,
			};
		let owner = member("owner", Some("Cloud Ada"), OWNER_EMAIL, MemberStatus::Host);

		assert_eq!(members_of().await.expect("the members are read"), vec![], "an unhosted space");

		hosted_with(vec![owner.clone()]);
		assert_eq!(members_of().await.expect("the members are read"), vec![], "a host alone");

		hosted_with(vec![owner, member(GUEST, None, GUEST_EMAIL, MemberStatus::Joined)]);
		assert_eq!(
			members_of().await.expect("the members are read"),
			vec![
				SpaceMember {
					name: Some(HOST_NAME.to_owned()),
					email: OWNER_EMAIL.to_owned(),
					is_host: true
				},
				SpaceMember { name: None, email: GUEST_EMAIL.to_owned(), is_host: false },
			]
		);
	});
}

#[test]
fn a_relayed_frame_stores_its_roster_account_over_a_forged_author() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_append_user_message",
			"args": { "message": host.sent("vouched")["message"] },
		}))
		.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("vouched"), json!(GUEST), json!(GUEST_EMAIL))]
		);
		assert!(
			crate::events::core(host.app.app_handle()).state::<Hosting>().holds_no_vouched_member(),
			"a vouched member outlived its call"
		);
	});
}

#[test]
fn a_human_message_records_whether_it_was_written_here_or_came_through_the_relay() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.sent("vouched"),
		}))
		.await;
		let unvouched = serde_json::from_value(host.unstarted("unvouched")["message"].clone())
			.expect("the message parses");
		conversation_send_user_message(
			host.app.state(),
			CommandCaller(Caller::Relayed(None)),
			unvouched,
			vec![],
		)
		.await
		.expect("the unvouched message is sent");

		let read = direct(&host.window, "conversation_message_page", host.page());

		let origins: Vec<(Value, Value, Value)> = read["messages"]
			.as_array()
			.expect("a page of messages")
			.iter()
			.map(|message| {
				(
					message["id"].clone(),
					message["authorAccountId"].clone(),
					message["writtenFrom"].clone(),
				)
			})
			.collect();
		assert_eq!(
			origins,
			vec![
				(json!("typed"), json!("owner"), json!("here")),
				(json!("vouched"), json!(GUEST), json!("relay")),
				(json!("unvouched"), Value::Null, json!("relay")),
			]
		);
	});
}

#[test]
fn a_message_written_on_a_signed_out_host_carries_no_account() {
	run(async {
		let host = Authoring::new(None).await;
		direct(
			&host.window,
			"conversation_append_user_message",
			json!({ "message": host.sent("typed")["message"] }),
		);

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("typed"), Value::Null, json!(HOST_NAME))]
		);
	});
}

#[test]
fn a_guest_message_sent_on_a_turn_it_opens_lands_on_the_host_with_its_author() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let seq = host
			.relayed(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": host.unstarted("first"),
			}))
			.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert!(seq.is_i64(), "{seq}");
		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("first"), json!(GUEST), json!(GUEST_EMAIL))]
		);
	});
}

#[test]
fn a_guest_message_refused_by_the_host_answers_a_text_naming_the_refusal() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let mut elsewhere = host.unstarted("elsewhere");
		elsewhere["message"]["conversationId"] = json!("a-conversation-of-no-shared-space");

		let answer = host
			.answered(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": elsewhere,
			}))
			.await;

		assert_eq!(answer["status"], json!(403), "{answer}");
		assert_eq!(answer["body"], json!(OTHER_SPACE_REFUSAL));
	});
}

#[test]
fn a_guest_reads_the_same_conversation_page_as_the_host_solo_rows_included() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let args = json!({ "spaceId": PERSONAL, "cursor": null, "limit": null });

		let read_by_the_guest = host
			.relayed(json!({
				"id": 1,
				"command": "conversation_page",
				"args": args,
			}))
			.await;
		let read_by_the_host = direct(&host.window, "conversation_page", args);

		let solo_bot_of = |id: &Value| {
			read_by_the_guest["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == *id)
				.map(|row| row["soloBotId"].clone())
		};
		assert_eq!(read_by_the_guest, read_by_the_host);
		assert_eq!(read_by_the_guest["conversations"].as_array().map(Vec::len), Some(2));
		assert_eq!(solo_bot_of(&room["id"]), Some(Value::Null));
		assert_eq!(solo_bot_of(&json!(host.conversation_id)), Some(json!("default")));
	});
}

#[test]
fn a_guest_reads_the_state_the_host_computed_for_each_conversation() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let room_id = room["id"].as_str().expect("the room has an id");
		let state = crate::events::core(host.app.app_handle()).state::<DatabaseState>();
		let conversations = state.as_ref().expect("the database").conversations();
		let prompt = a_pending_prompt(room_id, PromptKind::Question);
		conversations.hold_prompt(prompt).await.expect("the prompt is held");
		let state_of = |rows: &Value| {
			rows.as_array()
				.expect("the read holds a list")
				.iter()
				.find(|row| row["id"] == room["id"])
				.map(|row| row["state"].clone())
		};

		let listed = host
			.relayed(
				json!({ "id": 1, "command": "conversation_list", "args": { "spaceId": PERSONAL } }),
			)
			.await;
		let paged = host
			.relayed(json!({
				"id": 2,
				"command": "conversation_page",
				"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
			}))
			.await;

		assert_eq!(state_of(&listed), Some(json!("needs_you")));
		assert_eq!(state_of(&paged["conversations"]), Some(json!("needs_you")));
		assert_eq!(
			listed,
			direct(&host.window, "conversation_list", json!({ "spaceId": PERSONAL }))
		);
	});
}

#[test]
fn a_guest_reads_the_same_solo_states_as_the_host() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let state = crate::events::core(host.app.app_handle()).state::<DatabaseState>();
		let conversations = state.as_ref().expect("the database").conversations();
		let prompt = a_pending_prompt(&host.conversation_id, PromptKind::Question);
		conversations.hold_prompt(prompt).await.expect("the prompt is held");
		let args = json!({ "spaceId": PERSONAL });

		let read_by_the_guest = host
			.relayed(json!({ "id": 1, "command": "conversation_solo_states", "args": args }))
			.await;
		let read_by_the_host = direct(&host.window, "conversation_solo_states", args);

		assert_eq!(read_by_the_guest, read_by_the_host);
		assert_eq!(read_by_the_guest.as_array().map(Vec::len), Some(1), "{read_by_the_guest}");
		assert_eq!(read_by_the_guest[0]["botId"], json!("default"));
		assert_eq!(read_by_the_guest[0]["conversationId"], json!(host.conversation_id));
		assert_eq!(read_by_the_guest[0]["state"], json!("needs_you"));
	});
}

#[test]
fn a_guest_reads_the_open_turn_of_a_conversation_until_it_completes() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.turn("t1");
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(host.conversation_id))
				.map(|row| row["activeTurn"].clone())
		};
		direct(
			&host.window,
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": "r1",
				"conversationId": host.conversation_id,
				"turnId": "t1",
				"authorBotId": "default",
				"repliedToMessageId": null,
				"createdAt": 2,
			} }),
		);

		let during_the_turn = read_by_the_guest().await;
		direct(
			&host.window,
			"conversation_finalize_message",
			json!({ "id": "r1", "completion": "complete", "settledText": null }),
		);
		let once_the_reply_settled = read_by_the_guest().await;
		direct(&host.window, "conversation_complete_turn", json!({ "id": "t1", "completedAt": 3 }));
		let after_the_turn = read_by_the_guest().await;

		let speaking = Some(json!({ "bots": [{ "botId": "default", "startedAt": 1 }] }));
		assert_eq!(during_the_turn, speaking);
		assert_eq!(once_the_reply_settled, speaking);
		assert_eq!(after_the_turn, Some(Value::Null));
	});
}

#[test]
fn a_guest_reads_the_open_turn_of_a_room_while_the_second_of_its_two_bots_still_writes() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let ada = direct(
			&host.window,
			"conversation_create_bot",
			json!({ "spaceId": PERSONAL, "identity": as_json(a_bot_identity()) }),
		);
		let ada = ada["id"].as_str().expect("the bot holds an id").to_owned();
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": ["default", ada] }),
		);
		let room_id = room["id"].as_str().expect("the room holds an id").to_owned();
		let state = crate::events::core(host.app.app_handle()).state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		for bot_id in ["default", ada.as_str()] {
			let turn =
				NewTurn { id: "t1".to_owned(), conversation_id: room_id.clone(), started_at: 1 };
			messages.start_run(turn, bot_id.to_owned()).await.expect("the run starts");
		}
		let reply = |id: &str, bot_id: &str| {
			direct(
				&host.window,
				"conversation_open_assistant_message",
				json!({ "message": {
					"id": id,
					"conversationId": room_id,
					"turnId": "t1",
					"authorBotId": bot_id,
					"repliedToMessageId": null,
					"createdAt": 2,
				} }),
			);
		};
		let ended = |bot_id: &str| EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: bot_id.to_owned(),
			handed_to: Vec::new(),
			ended_at: 3,
		};
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(room_id))
				.map(|row| row["activeTurn"].clone())
		};
		reply("r1", "default");
		reply("r2", &ada);

		messages.end_run(ended("default")).await.expect("the first run ends");
		let while_the_second_writes = read_by_the_guest().await;
		messages.end_run(ended(&ada)).await.expect("the second run ends");
		let after_the_last = read_by_the_guest().await;

		let mut both = ["default".to_owned(), ada.clone()];
		both.sort_unstable();
		let both: Vec<_> =
			both.iter().map(|bot_id| json!({ "botId": bot_id, "startedAt": 1 })).collect();
		assert_eq!(while_the_second_writes, Some(json!({ "bots": both })));
		assert_eq!(after_the_last, Some(Value::Null));
	});
}

#[test]
fn a_guest_reads_the_turn_as_not_working_once_a_handed_bot_misses_its_start_deadline() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		crate::events::core(host.app.app_handle()).manage(TurnRunDeadlines::after(Duration::ZERO));
		let ada = direct(
			&host.window,
			"conversation_create_bot",
			json!({ "spaceId": PERSONAL, "identity": as_json(a_bot_identity()) }),
		);
		let ada = ada["id"].as_str().expect("the bot holds an id").to_owned();
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": ["default", ada] }),
		);
		let room_id = room["id"].as_str().expect("the room holds an id").to_owned();
		let state = crate::events::core(host.app.app_handle()).state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: room_id.clone(), started_at: 1 };
		messages.start_run(turn, "default".to_owned()).await.expect("the run starts");
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(room_id))
				.map(|row| row["activeTurn"].clone())
		};
		let (announced, mut updates) = mpsc::unbounded_channel();
		host.app.listen(CONVERSATION_UPDATED_EVENT, move |event| {
			let payload: Value =
				serde_json::from_str(event.payload()).expect("the payload is JSON");
			announced
				.send(payload["conversation"]["activeTurn"].clone())
				.expect("the test listens");
		});
		let handed = EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: "default".to_owned(),
			handed_to: vec![ada.clone()],
			ended_at: 2,
		};

		messages.end_run(handed).await.expect("the run ends handing over");
		let while_awaited = read_by_the_guest().await;
		arm_start_deadlines(
			crate::events::core(host.app.handle()),
			&room_id,
			"t1",
			std::slice::from_ref(&ada),
		);
		let announced_at_the_deadline = tokio::time::timeout(PATIENCE, updates.recv())
			.await
			.expect("the deadline announced in time");
		let after_the_deadline = read_by_the_guest().await;

		assert_eq!(while_awaited, Some(json!({ "bots": [{ "botId": ada, "startedAt": 1 }] })));
		assert_eq!(announced_at_the_deadline, Some(Value::Null));
		assert_eq!(after_the_deadline, Some(Value::Null));
	});
}

#[test]
fn a_guest_message_naming_a_turn_of_another_conversation_is_refused_and_not_written() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.turn("taken");
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let mut borrowed = host.unstarted("borrowed");
		borrowed["message"]["conversationId"] = room["id"].clone();
		borrowed["message"]["turnId"] = json!("taken");

		let answer = host
			.answered(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": borrowed,
			}))
			.await;
		let mut room_page = host.page();
		room_page["conversationId"] = room["id"].clone();
		let read = direct(&host.window, "conversation_message_page", room_page);

		assert_ne!(answer["status"], json!(200), "{answer}");
		assert_eq!(Authoring::authors(&read), vec![]);
	});
}

#[test]
fn a_relayed_guest_message_keeps_its_author_in_a_reopened_store_read_by_either_side() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.unstarted("relayed"),
		}))
		.await;

		let reopened = host.reopened_store();
		reopened.messages().recover_unfinished().await.expect("the restart sweep runs");
		let read_by_the_restarted_host =
			Authoring::stored_authors(&reopened, &host.conversation_id).await;
		let read_by_the_guest = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page() }),
			)
			.await;

		assert_eq!(read_by_the_restarted_host, vec![Authoring::stored_guest("relayed")]);
		assert_eq!(
			Authoring::authors(&read_by_the_guest),
			vec![(json!("relayed"), json!(GUEST), json!(GUEST_EMAIL))]
		);
	});
}

#[test]
fn every_later_write_on_a_relayed_guest_message_or_its_turn_leaves_its_author_unchanged() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let conversation_id = host.conversation_id.clone();
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.unstarted("relayed"),
		}))
		.await;
		let reply = json!({ "message": {
			"id": "reply",
			"conversationId": conversation_id,
			"turnId": "relayed",
			"authorBotId": null,
			"repliedToMessageId": "relayed",
			"createdAt": 2,
		} });
		direct(&host.window, "conversation_open_assistant_message", reply);
		for id in ["reply", "relayed"] {
			direct(&host.window, "conversation_append_text", json!({ "id": id, "delta": "more" }));
			direct(
				&host.window,
				"conversation_finalize_message",
				json!({ "id": id, "completion": "complete", "settledText": "settled" }),
			);
		}
		direct(
			&host.window,
			"conversation_complete_turn",
			json!({ "id": "relayed", "completedAt": 3 }),
		);
		let pin = json!({
			"conversationId": conversation_id,
			"messageId": "relayed",
			"blockIndex": 0,
			"pinnedAt": 4,
		});
		host.relayed(json!({
			"id": 2,
			"command": "conversation_pin_message",
			"args": pin,
		}))
		.await;
		host.relayed_by(
			"another-account",
			json!({ "id": 3, "command": "conversation_pin_message", "args": pin }),
		)
		.await;
		let state = crate::events::core(host.app.app_handle()).state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		messages
			.replace_content("relayed".to_owned(), "rewritten".to_owned())
			.await
			.expect("the content is rewritten");
		messages
			.ensure_turn(NewTurn {
				id: "relayed".to_owned(),
				conversation_id: conversation_id.clone(),
				started_at: 5,
			})
			.await
			.expect("the turn is kept");
		messages.complete_turn("relayed".to_owned(), 6).await.expect("the turn completes");
		messages.recover_unfinished().await.expect("the restart sweep runs");
		let duplicate = host
			.answered_by(
				"another-account",
				json!({
					"id": 4,
					"command": "conversation_append_user_message",
					"args": { "message": host.unstarted("relayed")["message"] },
				}),
			)
			.await;

		let read = Authoring::stored_authors(&host.reopened_store(), &conversation_id).await;

		assert_ne!(duplicate["status"], json!(200), "{duplicate}");
		assert_eq!(read, vec![Authoring::stored_guest("relayed")]);
	});
}

#[test]
fn a_relayed_frame_stores_the_roster_account_whatever_its_plaintext_from_or_sender_says() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"from": "another-account",
			"args": host.unstarted("forged-from"),
		}))
		.await;
		host.relayed(json!({
			"id": 2,
			"command": "conversation_send_user_message",
			"sender": { "accountId": "another-account" },
			"args": host.unstarted("forged-sender"),
		}))
		.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![
				(json!("forged-from"), json!(GUEST), json!(GUEST_EMAIL)),
				(json!("forged-sender"), json!(GUEST), json!(GUEST_EMAIL)),
			]
		);
	});
}

fn a_bot_identity() -> BotIdentity {
	BotIdentity {
		name: "Renamed".to_owned(),
		title: String::new(),
		model: "sonnet".to_owned(),
		avatar_blot: None,
		avatar_image_path: None,
		instructions: String::new(),
		denied_tools: Vec::new(),
		permissions: BotPermissions::default(),
		output_style: DEFAULT_OUTPUT_STYLE.to_owned(),
		effort: None,
	}
}

fn as_json(payload: impl serde::Serialize) -> Value {
	serde_json::to_value(payload).expect("the payload serializes")
}

const DEFAULT_BOT: &str = "default";

fn the_default_bot() -> EnvOwner {
	EnvOwner::Bot { id: DEFAULT_BOT.to_owned(), space_id: PERSONAL.to_owned() }
}

fn a_host_grant() -> OauthCredentials {
	OauthCredentials {
		access_token: "host-access".to_owned(),
		refresh_token: Some("host-refresh".to_owned()),
		expires_at: None,
		client_id: "registered".to_owned(),
		client_secret: None,
		redirect_uri: None,
	}
}

fn granted_to_the_host_person(name: &str) -> EnvScope {
	EnvScope::Server { name: name.to_owned(), owner: EnvOwner::User }
}

impl Authoring {
	fn env_root(&self) -> PathBuf {
		writable_root(crate::events::core(self.app.handle())).expect("the env root is writable")
	}

	fn reading_applications(&self) {
		let person = bundles::user::path(crate::events::core(self.app.handle()))
			.expect("the plugin has a home");
		bundles::user::lay_down(&person).expect("the plugin is laid down");
		crate::events::core(self.app.app_handle()).manage(McpOauthState::default());
		crate::events::core(self.app.app_handle()).manage(ApplicationReports::default());
		crate::events::core(self.app.app_handle()).manage(AuthorizationAnswers::default());
	}

	async fn bundled_default_bot(&self) {
		let state = crate::events::core(self.app.app_handle()).state::<DatabaseState>();
		let database = state.as_ref().expect("the database");
		let bot = database
			.conversations()
			.bot(DEFAULT_BOT.to_owned())
			.await
			.expect("the bot reads")
			.expect("the default bot is planted");
		let root =
			bundles::root(crate::events::core(self.app.handle())).expect("the bundles have a root");
		bundles::lay_down(&root, &bot).expect("the bot bundle lands");
	}

	fn declared(&self, plugin: Value, name: &str) {
		direct(
			&self.window,
			"plugin_set_mcp_server",
			json!({ "scope": plugin, "name": name, "config": { "command": name }, "mark": null }),
		);
	}
}

#[test]
fn a_member_lists_a_bot_env_without_any_entry_defined_in_or_served_from_the_host_person() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let root = host.env_root();
		let bot = EnvScope::from(&the_default_bot());
		store::set(&root, &EnvScope::User, "HOST_ONLY", "person").expect("the host sets");
		store::set(&root, &EnvScope::User, "SHADOWED", "person").expect("the host sets");
		store::set(&root, &EnvScope::Space { id: PERSONAL.to_owned() }, "SHARED", "space")
			.expect("the host sets");
		store::set(&root, &bot, "SHADOWED", "bot").expect("the host sets");
		let args = json!({ "scope": bot });

		let relayed = host.relayed(json!({ "id": 1, "command": "env_list", "args": args })).await;
		let on_the_host = direct(&host.window, "env_list", args);

		assert_eq!(names_of(&relayed), ["SHADOWED", "SHARED"]);
		for entry in relayed.as_array().expect("a list") {
			assert_ne!(entry["definedIn"]["kind"], "user", "{entry}");
			assert_ne!(entry["servedFrom"]["kind"], "user", "{entry}");
		}
		assert_eq!(names_of(&on_the_host), ["HOST_ONLY", "SHADOWED", "SHADOWED", "SHARED"]);
	});
}

#[test]
fn a_relayed_env_list_of_a_server_of_the_host_person_answers_no_entry() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let scope = granted_to_the_host_person("granola");
		store::set(&host.env_root(), &scope, "PLANTED", "host").expect("the host sets");
		let listed =
			|caller| env_list(crate::events::core(host.app.handle()), caller, scope.clone());

		let relayed = listed(Caller::Relayed(None)).await.expect("the list reads");
		let on_the_host = listed(Caller::Host).await.expect("the list reads");

		assert_eq!(relayed, Vec::new());
		assert_eq!(
			on_the_host.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>(),
			["PLANTED"]
		);
	});
}

#[test]
fn a_member_reads_no_application_served_by_a_grant_of_the_host_person_nor_one_of_its_plugin() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		host.bundled_default_bot().await;
		let root = host.env_root();
		let bot = json!({ "kind": "bot", "id": DEFAULT_BOT });
		host.declared(bot.clone(), "granola");
		host.declared(bot, "clock");
		host.declared(json!({ "kind": "user" }), "notion");
		credentials::store(&root, &granted_to_the_host_person("granola"), &a_host_grant())
			.expect("the host connects granola");
		credentials::store(&root, &granted_to_the_host_person("notion"), &a_host_grant())
			.expect("the host connects notion");
		let args = json!({ "owner": the_default_bot() });

		let relayed = host
			.relayed(json!({ "id": 1, "command": "mcp_application_status", "args": args }))
			.await;
		let on_the_host = direct(&host.window, "mcp_application_status", args);

		assert_eq!(names_of(&relayed), ["clock"]);
		assert_eq!(names_of(&on_the_host), ["clock", "granola"]);
		assert_eq!(on_the_host[1]["scope"], json!(granted_to_the_host_person("granola")));
	});
}

#[test]
fn a_relayed_status_of_the_host_person_plugin_answers_no_row() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		host.declared(json!({ "kind": "user" }), "notion");
		let status = |caller| {
			mcp_application_status(host.app.handle().clone(), CommandCaller(caller), EnvOwner::User)
		};

		let relayed = status(Caller::Relayed(None)).await.expect("the status reads");
		let on_the_host = status(Caller::Host).await.expect("the status reads");

		assert_eq!(relayed, Vec::new());
		assert_eq!(on_the_host.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(), ["notion"]);
	});
}

#[test]
fn a_member_disconnecting_through_a_bot_served_by_a_grant_of_the_host_person_is_refused() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		let root = host.env_root();
		let grant = granted_to_the_host_person("granola");
		credentials::store(&root, &grant, &a_host_grant()).expect("the host connects");
		let before = store::values(&root, &grant).expect("the grant reads");

		let answered = host
			.answered(json!({
				"id": 1,
				"command": "mcp_oauth_disconnect",
				"args": {
					"owner": the_default_bot(),
					"name": "granola",
					"url": "https://granola.test/mcp",
				},
			}))
			.await;

		assert_eq!(answered["status"], json!(403), "{answered}");
		assert_eq!(answered["body"], json!({ "kind": "refusedToAMember" }));
		assert!(!before.is_empty());
		assert_eq!(store::values(&root, &grant).expect("the grant reads"), before);
	});
}

const OTHER_SPACE_REFUSAL: &str = "this command reaches outside the shared space";

fn bearer_of(headers: &HeaderMap) -> &str {
	let header = headers.get("authorization").and_then(|value| value.to_str().ok());
	header.unwrap_or_default().trim_start_matches("Bearer ")
}

fn names_of(listed: &Value) -> Vec<&str> {
	listed
		.as_array()
		.expect("a list")
		.iter()
		.map(|item| item["name"].as_str().expect("a name"))
		.collect()
}
