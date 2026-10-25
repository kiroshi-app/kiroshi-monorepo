use axum::extract::rejection::StringRejection;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde_json::{json, Map, Value};
use tauri::{Manager, Runtime};
use uuid::Uuid;

use super::commands::announce_change;
use super::contract::{MissionActivity, MissionEntry, MissionError, MissionEventKind};
use super::hook;
use crate::conversations::commands::ready;
use crate::db;
use crate::routines::webhook::{self, Calls, DeliveryId};

pub const PATH: &str = "/missions/call";

pub const SOURCE: &str = "agent-hook";

const ACCEPTED: (StatusCode, &str) = (StatusCode::ACCEPTED, "the mission was told");

const REFUSED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no mission answers this call");

const UNREADABLE: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the call carried no readable payload");

const TOO_LARGE: (StatusCode, &str) =
	(StatusCode::PAYLOAD_TOO_LARGE, "the call carried more than the cap");

const FLOODED: (StatusCode, &str) =
	(StatusCode::TOO_MANY_REQUESTS, "the mission was called too often");

const REFUSED_DELIVERY_ID: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the delivery id is unreadable or carried more than 200 bytes");

const ACTIVITY_BUDGET: &str = ":activity";

const FAILED: (StatusCode, &str) = (StatusCode::INTERNAL_SERVER_ERROR, "the call was not carried");

pub(crate) async fn called<R: Runtime>(
	State(calls): State<Calls<R>>,
	headers: HeaderMap,
	body: Result<String, StringRejection>,
) -> (StatusCode, &'static str) {
	if !webhook::named_here(&headers) {
		return REFUSED;
	}
	let delivery_id = match webhook::delivery_id(&headers) {
		DeliveryId::Refused => return REFUSED_DELIVERY_ID,
		DeliveryId::Carried(held) => held,
		DeliveryId::Generated => Uuid::new_v4().to_string(),
	};
	let body = match body {
		Ok(body) => body,
		Err(rejection) => return unread(rejection),
	};
	match carried(&calls, &headers, delivery_id, body).await {
		Ok(answer) => answer,
		Err(failure) => {
			eprintln!("a local hook call reached no mission: {failure:?}");
			FAILED
		}
	}
}

async fn carried<R: Runtime>(
	calls: &Calls<R>,
	headers: &HeaderMap,
	delivery_id: String,
	body: String,
) -> Result<(StatusCode, &'static str), MissionError> {
	let Some(key) = webhook::presented(headers) else {
		return Ok(REFUSED);
	};
	let state = calls.app.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let Some(mission) = database.missions().armed_on_key(key).await? else {
		return Ok(REFUSED);
	};
	if mission.closed_at.is_some() {
		return Ok(REFUSED);
	}
	let Some(held) = parsed(&body) else {
		return Ok(UNREADABLE);
	};
	let is_tool_call = text(&held, "event") == hook::TOOL_USED;
	let activity = activity(&held).filter(|_| is_tool_call);
	if is_tool_call && activity.is_none() {
		return Ok(UNREADABLE);
	}
	let budget = match activity {
		Some(_) => format!("{}{ACTIVITY_BUDGET}", mission.id),
		None => mission.id.clone(),
	};
	if !calls.limit.admits(&budget, calls.clock.as_ref()).await {
		return Ok(FLOODED);
	}
	let written = match activity {
		Some(activity) => {
			database.missions().record_activity(mission.id, activity, calls.clock.now_ms()).await
		}
		None => {
			let entries = entries(payload(&held));
			database.missions().append_delivery(mission.id, entries, delivery_id).await
		}
	};
	match written {
		Ok(written) => {
			if let Err(failure) = announce_change(&calls.app, written) {
				eprintln!("a hook call moved a mission the front was not told about: {failure:?}");
			}
			Ok(ACCEPTED)
		}
		Err(MissionError::UnknownMission { .. } | MissionError::MissionAlreadyClosed { .. }) => {
			Ok(REFUSED)
		}
		Err(failure) => Err(failure),
	}
}

fn entries(payload: Value) -> Vec<MissionEntry> {
	match payload.get("event").and_then(Value::as_str) {
		Some(hook::PROMPT_SUBMITTED) => vec![entry(MissionEventKind::AgentStarted, payload)],
		Some(hook::TURN_STOPPED) => vec![
			entry(MissionEventKind::AgentStopped, payload.clone()),
			entry(MissionEventKind::AgentAsked, payload),
		],
		_ => vec![entry(MissionEventKind::AgentAsked, payload)],
	}
}

fn entry(kind: MissionEventKind, payload: Value) -> MissionEntry {
	MissionEntry { kind, source: SOURCE.to_owned(), payload }
}

fn unread(rejection: StringRejection) -> (StatusCode, &'static str) {
	match rejection.into_response().status() {
		StatusCode::PAYLOAD_TOO_LARGE => TOO_LARGE,
		_ => UNREADABLE,
	}
}

fn parsed(body: &str) -> Option<Map<String, Value>> {
	match serde_json::from_str(body).ok()? {
		Value::Object(held) => Some(held),
		_ => None,
	}
}

fn activity(held: &Map<String, Value>) -> Option<MissionActivity> {
	let tool = text(held, "tool");
	if tool.is_empty() {
		return None;
	}
	Some(MissionActivity { target: text(held, "target"), tool })
}

fn payload(held: &Map<String, Value>) -> Value {
	let mut payload = Map::new();
	payload.insert("event".to_owned(), json!(text(held, "event")));
	payload.insert("branch".to_owned(), json!(text(held, "branch")));
	payload.insert("cwd".to_owned(), json!(text(held, "cwd")));
	for carried in ["message", "notification"] {
		let value = text(held, carried);
		if !value.is_empty() {
			payload.insert(carried.to_owned(), json!(value));
		}
	}
	Value::Object(payload)
}

fn text(held: &Map<String, Value>, name: &str) -> String {
	held.get(name).and_then(Value::as_str).unwrap_or_default().to_owned()
}

#[cfg(test)]
mod tests {
	use std::net::SocketAddr;
	use std::sync::atomic::{AtomicI64, Ordering};
	use std::sync::mpsc::{channel, Receiver};
	use std::sync::Arc;

	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener as _};
	use tokio::io::{AsyncReadExt, AsyncWriteExt};
	use tokio::net::TcpStream;

	use super::super::commands::CHANGED_EVENT;
	use super::super::contract::{
		Mission, MissionDraft, MissionEvent, MissionNote, MissionState, MissionWatch, Ticket,
	};
	use super::*;
	use crate::routines::core::Clock;
	use crate::routines::rate_limit::{CALLS_PER_WINDOW, WINDOW_MS};
	use crate::routines::runner::Runner;
	use crate::routines::webhook::{started, Webhook, DELIVERY_ID_HEADER, HEADER};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const NOON: i64 = 1_800_000_000_000;

	const A_KEY: &str = "the-mission-delivery-key";

	const A_BODY: &str = r#"{"event":"Notification","sessionId":"s1","cwd":"/tmp/workspace",
		"branch":"feature/ope-27","excerpt":"","message":"Claude needs your permission"}"#;

	const A_PARTICIPANT: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Arc<Self> {
			Arc::new(Ticking(AtomicI64::new(now)))
		}

		fn moved_by(&self, elapsed: i64) {
			self.0.fetch_add(elapsed, Ordering::SeqCst);
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("mission-call-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		{
			let state = app.state::<db::DatabaseState>();
			ready(&state)
				.expect("the database opens")
				.call_mut(|connection| Ok(connection.execute_batch(A_PARTICIPANT)?))
				.await
				.expect("the participant is planted");
		}
		app
	}

	async fn an_armed_mission(app: &App<MockRuntime>, key: &str) -> Mission {
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		let opened = database
			.missions()
			.open(
				MissionDraft {
					origin_conversation_id: "c1".to_owned(),
					bot_id: "b1".to_owned(),
					objective: "Fix the crash".to_owned(),
					ticket: Ticket {
						platform: "github".to_owned(),
						external_id: "42".to_owned(),
						url: "https://kiroshi.test/tickets/42".to_owned(),
						title: "Crash on open".to_owned(),
					},
					tools: vec!["gh".to_owned()],
					source: "bot".to_owned(),
					workspace_path: None,
				},
				key.to_owned(),
			)
			.await
			.expect("the mission opens");
		let watch = MissionWatch {
			branch: "feature/ope-27".to_owned(),
			repository: "shoto290/kiroshi-monorepo".to_owned(),
		};
		let (armed, _) = database
			.missions()
			.arm(opened.id.clone(), watch, uuid::Uuid::new_v4().to_string())
			.await
			.expect("the mission is armed");
		armed
	}

	async fn closed(app: &App<MockRuntime>, mission_id: &str) {
		let state = app.state::<db::DatabaseState>();
		ready(&state)
			.expect("the database opens")
			.missions()
			.append(
				mission_id.to_owned(),
				MissionEntry::of(
					MissionEventKind::Closed,
					MissionNote { source: "human".to_owned(), payload: json!({}) },
				),
			)
			.await
			.expect("the mission closes");
	}

	async fn events_of(app: &App<MockRuntime>, mission_id: &str) -> Vec<MissionEvent> {
		let state = app.state::<db::DatabaseState>();
		ready(&state)
			.expect("the database opens")
			.missions()
			.detail(mission_id.to_owned())
			.await
			.expect("the mission reads")
			.events
	}

	async fn hook_events_of(app: &App<MockRuntime>, mission_id: &str) -> Vec<MissionEvent> {
		events_of(app, mission_id)
			.await
			.into_iter()
			.filter(|event| event.source == SOURCE)
			.collect()
	}

	fn calling(key: Option<&str>, delivery_id: Option<&str>, body: &str) -> String {
		let mut request = format!(
			"POST {PATH} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1\r\n\
				Content-Length: {}\r\n",
			body.len()
		);
		if let Some(key) = key {
			request.push_str(&format!("{HEADER}: {key}\r\n"));
		}
		if let Some(delivery_id) = delivery_id {
			request.push_str(&format!("{DELIVERY_ID_HEADER}: {delivery_id}\r\n"));
		}
		request.push_str("\r\n");
		request.push_str(body);
		request
	}

	async fn answered(address: SocketAddr, request: String) -> (u16, String) {
		let mut stream = TcpStream::connect(address).await.expect("the listener answers");
		stream.write_all(request.as_bytes()).await.expect("the request lands");
		let mut answer = Vec::new();
		stream.read_to_end(&mut answer).await.expect("the answer reads");
		let answer = String::from_utf8_lossy(&answer).into_owned();
		let (head, body) = answer.split_once("\r\n\r\n").expect("the answer carries a body");
		let status = head.split_whitespace().nth(1).expect("the answer carries a status");
		(status.parse().expect("the status is a number"), body.to_owned())
	}

	fn answer(held: (StatusCode, &str)) -> (u16, String) {
		(held.0.as_u16(), held.1.to_owned())
	}

	fn listening(app: &App<MockRuntime>, clock: Arc<Ticking>) -> Webhook {
		started(app.handle().clone(), clock, Arc::new(Runner::new(app.handle().clone())))
	}

	#[tokio::test]
	async fn a_call_carrying_the_key_of_an_armed_mission_appends_one_agent_asked_event() {
		let app = a_host("told").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		let held = answered(webhook.address(), calling(Some(A_KEY), None, A_BODY)).await;

		assert_eq!(held, answer(ACCEPTED));
		let appended = hook_events_of(&app, &mission.id).await;
		assert_eq!(appended.len(), 1, "got {appended:?}");
		assert_eq!(appended[0].kind, MissionEventKind::AgentAsked);
		assert_eq!(
			appended[0].payload,
			json!({
				"event": "Notification",
				"branch": "feature/ope-27",
				"cwd": "/tmp/workspace",
				"message": "Claude needs your permission",
			}),
		);

		webhook.stop();
	}

	fn heard(app: &App<MockRuntime>) -> Receiver<String> {
		let (sender, received) = channel();
		app.handle().listen(CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});
		received
	}

	fn announced(received: &Receiver<String>) -> Vec<Value> {
		received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload is JSON"))
			.collect()
	}

	async fn state_of(app: &App<MockRuntime>, mission_id: &str) -> (MissionState, i64) {
		let state = app.state::<db::DatabaseState>();
		let held = ready(&state)
			.expect("the database opens")
			.missions()
			.detail(mission_id.to_owned())
			.await
			.expect("the mission reads")
			.mission;
		(held.state, held.state_seq)
	}

	#[tokio::test]
	async fn a_carried_call_tells_the_front_which_mission_moved_and_where_it_stands() {
		let app = a_host("announced").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let received = heard(&app);

		let held = answered(webhook.address(), calling(Some(A_KEY), None, A_BODY)).await;

		assert_eq!(held, answer(ACCEPTED));
		let (state, state_seq) = state_of(&app, &mission.id).await;
		assert_eq!(
			announced(&received),
			vec![json!({
				"missionId": mission.id,
				"spaceId": null,
				"state": state,
				"stateSeq": state_seq,
				"isAgentRunning": false,
				"liveness": "idle",
				"lastActivityAt": null,
				"pendingPrompt": null,
				"workingBotIds": [],
			})],
			"the front was not told the hook moved the mission"
		);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_refused_call_tells_the_front_nothing() {
		let app = a_host("unannounced").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let received = heard(&app);

		let refused =
			answered(webhook.address(), calling(Some("no mission holds this"), None, A_BODY)).await;
		let unreadable = answered(webhook.address(), calling(Some(A_KEY), None, "not json")).await;
		closed(&app, &mission.id).await;
		let shut = answered(webhook.address(), calling(Some(A_KEY), None, A_BODY)).await;

		assert_eq!(
			(refused, unreadable, shut),
			(answer(REFUSED), answer(UNREADABLE), answer(REFUSED))
		);
		assert!(announced(&received).is_empty(), "a refused call told the front");

		webhook.stop();
	}

	async fn kinds_of(app: &App<MockRuntime>, mission_id: &str) -> Vec<MissionEventKind> {
		let state = app.state::<db::DatabaseState>();
		let mission_id = mission_id.to_owned();
		ready(&state)
			.expect("the database opens")
			.call(move |connection| {
				let mut statement = connection.prepare(
					"SELECT kind FROM mission_events WHERE mission_id = ?1 AND source = ?2
						ORDER BY seq",
				)?;
				let rows =
					statement.query_map(rusqlite::params![mission_id, SOURCE], |row| row.get(0))?;
				Ok(rows.collect::<rusqlite::Result<Vec<MissionEventKind>>>()?)
			})
			.await
			.expect("the kinds read")
	}

	fn a_body(event: &str) -> String {
		json!({
			"event": event,
			"sessionId": "s1",
			"cwd": "/tmp/workspace",
			"branch": "feature/ope-27",
		})
		.to_string()
	}

	#[tokio::test]
	async fn a_prompt_submitted_appends_one_agent_started_and_a_stop_appends_a_stopped_then_an_asked(
	) {
		let app = a_host("liveness").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		for event in [hook::PROMPT_SUBMITTED, hook::TURN_STOPPED] {
			let held =
				answered(webhook.address(), calling(Some(A_KEY), None, &a_body(event))).await;
			assert_eq!(held, answer(ACCEPTED));
		}

		assert_eq!(
			kinds_of(&app, &mission.id).await,
			vec![
				MissionEventKind::AgentStarted,
				MissionEventKind::AgentStopped,
				MissionEventKind::AgentAsked,
			],
		);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_stop_carrying_a_delivery_id_already_written_appends_neither_of_its_two_events() {
		let app = a_host("redelivered").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		for _ in 0..2 {
			let request = calling(Some(A_KEY), Some("delivery-1"), &a_body(hook::TURN_STOPPED));
			assert_eq!(answered(webhook.address(), request).await, answer(ACCEPTED));
		}

		assert_eq!(
			kinds_of(&app, &mission.id).await,
			vec![MissionEventKind::AgentStopped, MissionEventKind::AgentAsked],
		);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_prompt_submitted_leaves_a_mission_waiting_on_its_human_where_it_stands() {
		let app = a_host("still-waiting").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		{
			let state = app.state::<db::DatabaseState>();
			ready(&state)
				.expect("the database opens")
				.missions()
				.append(
					mission.id.clone(),
					MissionEntry::of(
						MissionEventKind::Escalated,
						MissionNote { source: "bot".to_owned(), payload: json!({}) },
					),
				)
				.await
				.expect("the mission escalates");
		}
		let stood = state_of(&app, &mission.id).await;
		let webhook = listening(&app, Ticking::at(NOON));

		let held = answered(
			webhook.address(),
			calling(Some(A_KEY), None, &a_body(hook::PROMPT_SUBMITTED)),
		)
		.await;

		assert_eq!(held, answer(ACCEPTED));
		assert_eq!(stood.0, MissionState::WaitingHuman);
		assert_eq!(state_of(&app, &mission.id).await, stood);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_carrying_no_message_leaves_the_message_out_of_the_payload() {
		let app = a_host("silent").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let body = r#"{"event":"Stop","cwd":"/tmp/workspace","branch":"main","message":""}"#;

		let held = answered(webhook.address(), calling(Some(A_KEY), None, body)).await;

		assert_eq!(held, answer(ACCEPTED));
		assert_eq!(
			hook_events_of(&app, &mission.id).await[0].payload,
			json!({ "event": "Stop", "branch": "main", "cwd": "/tmp/workspace" }),
		);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_no_mission_holds_the_key_of_appends_nothing() {
		let app = a_host("unheld").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		for key in [None, Some("no mission holds this")] {
			assert_eq!(
				answered(webhook.address(), calling(key, None, A_BODY)).await,
				answer(REFUSED),
			);
		}

		assert!(hook_events_of(&app, &mission.id).await.is_empty());

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_naming_a_closed_mission_is_refused_and_appends_nothing() {
		let app = a_host("shut").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		closed(&app, &mission.id).await;
		let webhook = listening(&app, Ticking::at(NOON));

		let held = answered(webhook.address(), calling(Some(A_KEY), None, A_BODY)).await;

		assert_eq!(held, answer(REFUSED));
		assert!(hook_events_of(&app, &mission.id).await.is_empty());

		webhook.stop();
	}

	#[tokio::test]
	async fn one_delivery_id_carried_twice_appends_one_event_and_two_append_two() {
		let app = a_host("delivered").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));

		for _ in 0..2 {
			let held =
				answered(webhook.address(), calling(Some(A_KEY), Some("delivery-1"), A_BODY)).await;
			assert_eq!(held, answer(ACCEPTED));
		}
		assert_eq!(hook_events_of(&app, &mission.id).await.len(), 1);

		answered(webhook.address(), calling(Some(A_KEY), Some("delivery-2"), A_BODY)).await;

		assert_eq!(hook_events_of(&app, &mission.id).await.len(), 2);

		webhook.stop();
	}

	#[tokio::test]
	async fn the_call_beyond_the_cap_of_a_window_is_refused_and_the_one_after_it_passed_is_carried()
	{
		let app = a_host("flooded").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let clock = Ticking::at(NOON);
		let webhook = listening(&app, clock.clone());
		for call in 0..CALLS_PER_WINDOW {
			let request = calling(Some(A_KEY), Some(&format!("delivery-{call}")), A_BODY);
			assert_eq!(answered(webhook.address(), request).await, answer(ACCEPTED));
		}

		let refused =
			answered(webhook.address(), calling(Some(A_KEY), Some("delivery-over"), A_BODY)).await;

		assert_eq!(refused, answer(FLOODED));
		assert_eq!(hook_events_of(&app, &mission.id).await.len(), CALLS_PER_WINDOW);

		clock.moved_by(WINDOW_MS);
		let carried =
			answered(webhook.address(), calling(Some(A_KEY), Some("delivery-after"), A_BODY)).await;

		assert_eq!(carried, answer(ACCEPTED));
		assert_eq!(hook_events_of(&app, &mission.id).await.len(), CALLS_PER_WINDOW + 1);

		webhook.stop();
	}

	fn a_tool_body(tool: &str, target: &str) -> String {
		json!({
			"event": hook::TOOL_USED,
			"sessionId": "s1",
			"cwd": "/tmp/workspace",
			"branch": "feature/ope-27",
			"tool": tool,
			"target": target,
		})
		.to_string()
	}

	#[tokio::test]
	async fn a_tool_call_writes_the_activity_on_the_row_at_the_app_clock_and_appends_no_event() {
		let app = a_host("active").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let before = events_of(&app, &mission.id).await;
		let now = crate::routines::core::SystemClock.now_ms();
		let webhook = listening(&app, Ticking::at(now));
		let received = heard(&app);

		let held = answered(
			webhook.address(),
			calling(Some(A_KEY), None, &a_tool_body("Edit", "/w/a.rs")),
		)
		.await;

		assert_eq!(held, answer(ACCEPTED));
		assert_eq!(events_of(&app, &mission.id).await, before, "a tool call wrote a thread line");
		let state = app.state::<db::DatabaseState>();
		let written = ready(&state)
			.expect("the database opens")
			.missions()
			.detail(mission.id.clone())
			.await
			.expect("the mission reads")
			.mission;
		assert_eq!(written.last_activity_at, Some(now));
		assert_eq!(
			written.last_activity,
			Some(MissionActivity { tool: "Edit".to_owned(), target: "/w/a.rs".to_owned() }),
		);
		assert!(written.is_agent_running);
		let announced = announced(&received);
		assert_eq!(announced.len(), 1, "got {announced:?}");
		assert_eq!(announced[0]["lastActivityAt"], json!(now));
		assert_eq!(announced[0]["isAgentRunning"], json!(true));

		webhook.stop();
	}

	#[tokio::test]
	async fn a_tool_call_naming_no_tool_leaves_the_thread_and_the_state_as_they_stood() {
		let app = a_host("nameless-tool").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let before = events_of(&app, &mission.id).await;
		let stood = state_of(&app, &mission.id).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let nameless = json!({ "event": hook::TOOL_USED, "tool": 42, "target": "/w/a.rs" });
		let blank = json!({ "event": hook::TOOL_USED, "tool": "", "target": "" });

		for body in [nameless, blank] {
			let held =
				answered(webhook.address(), calling(Some(A_KEY), None, &body.to_string())).await;
			assert_eq!(held, answer(UNREADABLE));
		}

		assert_eq!(events_of(&app, &mission.id).await, before, "a nameless tool call wrote a line");
		assert_eq!(state_of(&app, &mission.id).await, stood, "a nameless tool call moved it");

		webhook.stop();
	}

	#[tokio::test]
	async fn a_stop_carrying_a_tool_field_appends_the_rows_its_event_names_and_no_activity() {
		let app = a_host("stop-with-tool").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let body = json!({ "event": hook::TURN_STOPPED, "tool": "Edit", "target": "/w/a.rs" });

		let held = answered(webhook.address(), calling(Some(A_KEY), None, &body.to_string())).await;

		assert_eq!(held, answer(ACCEPTED));
		assert_eq!(
			kinds_of(&app, &mission.id).await,
			vec![MissionEventKind::AgentStopped, MissionEventKind::AgentAsked],
		);
		let state = app.state::<db::DatabaseState>();
		let written = ready(&state)
			.expect("the database opens")
			.missions()
			.detail(mission.id.clone())
			.await
			.expect("the mission reads")
			.mission;
		assert_eq!((written.last_activity_at, written.last_activity), (None, None));

		webhook.stop();
	}

	#[tokio::test]
	async fn tool_calls_past_their_budget_leave_the_thread_calls_of_that_mission_answered() {
		let app = a_host("tool-flood").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		for call in 0..CALLS_PER_WINDOW {
			let request = calling(Some(A_KEY), None, &a_tool_body("Read", &format!("/w/{call}")));
			assert_eq!(answered(webhook.address(), request).await, answer(ACCEPTED));
		}
		let over = calling(Some(A_KEY), None, &a_tool_body("Read", "/w/over"));
		assert_eq!(answered(webhook.address(), over).await, answer(FLOODED));

		for event in ["Notification", hook::PROMPT_SUBMITTED, hook::TURN_STOPPED] {
			let request = calling(Some(A_KEY), None, &a_body(event));
			let held = answered(webhook.address(), request).await;
			assert_eq!(held, answer(ACCEPTED), "the {event} call was refused");
		}
		assert_eq!(
			kinds_of(&app, &mission.id).await,
			vec![
				MissionEventKind::AgentAsked,
				MissionEventKind::AgentStarted,
				MissionEventKind::AgentStopped,
				MissionEventKind::AgentAsked,
			],
		);

		webhook.stop();
	}

	#[tokio::test]
	async fn a_call_naming_another_host_or_carrying_a_body_beyond_the_cap_appends_nothing() {
		let app = a_host("guarded").await;
		let mission = an_armed_mission(&app, A_KEY).await;
		let webhook = listening(&app, Ticking::at(NOON));
		let long = "a".repeat(crate::routines::webhook::MAX_BODY_BYTES + 1);

		let elsewhere =
			calling(Some(A_KEY), None, A_BODY).replace("Host: 127.0.0.1", "Host: attacker.example");
		assert_eq!(answered(webhook.address(), elsewhere).await, answer(REFUSED));
		assert_eq!(
			answered(webhook.address(), calling(Some(A_KEY), None, &long)).await,
			answer(TOO_LARGE),
		);

		assert!(hook_events_of(&app, &mission.id).await.is_empty());

		webhook.stop();
	}
}
