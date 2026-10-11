use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use super::commands::{
	mission_conclude, mission_escalate, mission_note, mission_open, mission_row, mission_status,
	mission_watch,
};
use super::contract::{
	Mission, MissionClosing, MissionDraft, MissionEntry, MissionError, MissionEventKind,
	MissionNote, MissionOutcome, MissionState, MissionStatus, MissionWatch, Ticket,
};
use crate::agent::host::{Host, Refusal};
use crate::conversations::commands::ready;
use crate::db;

const BOT: &str = "bot";

#[derive(Debug)]
pub struct MissionHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
}

impl<R: Runtime> MissionHost<R> {
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		Self { app, conversation_id, bot_id }
	}

	fn draft(&self, asked: Opened) -> MissionDraft {
		MissionDraft {
			origin_conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
			objective: asked.objective,
			ticket: asked.ticket,
			tools: asked.tools,
			source: BOT.to_owned(),
			workspace_path: asked.workspace_path,
		}
	}

	fn runs_in(&self, held: &Mission) -> bool {
		held.origin_conversation_id == self.conversation_id
			|| held.thread_conversation_id == self.conversation_id
	}

	async fn refuse_a_mission_it_does_not_own(
		&self,
		database: &db::Database,
		id: &str,
	) -> Result<(), MissionError> {
		let held = mission_row(database, id).await?;
		if !self.runs_in(&held) {
			return Err(MissionError::MissionOfAnotherConversation {
				id: held.id,
				conversation_id: self.conversation_id.clone(),
			});
		}
		if held.bot_id != self.bot_id {
			return Err(MissionError::MissionOfAnotherBot {
				id: held.id,
				bot_id: self.bot_id.clone(),
			});
		}
		Ok(())
	}
}

impl<R: Runtime> Host for MissionHost<R> {
	const SUBTYPE: &'static str = "mission";

	type Operation = Operation;

	type Error = MissionError;

	async fn served(&self, operation: Operation, payload: Value) -> Result<Value, MissionError> {
		let state = Self::database(&self.app)?;
		let database = ready(&state)?;
		match operation {
			Operation::Open => {
				let asked: Opened = Self::read(payload)?;
				let draft = self.draft(asked);
				Self::answered(mission_open(self.app.clone(), state, draft).await?)
			}
			Operation::Note => {
				let asked: Noted = Self::read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let entry = MissionEntry {
					kind: MissionEventKind::Note,
					source: BOT.to_owned(),
					payload: serde_json::json!({ "line": asked.line }),
				};
				Self::answered(mission_note(self.app.clone(), state, asked.id, entry).await?)
			}
			Operation::Status => {
				let asked: Stated = Self::read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				Self::answered(
					mission_status(self.app.clone(), state, asked.id, BOT.to_owned(), asked.text)
						.await?,
				)
			}
			Operation::Escalate => {
				let asked: Escalated = Self::read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let note = MissionNote {
					source: BOT.to_owned(),
					payload: serde_json::json!({
						"question": asked.question,
						"reason": asked.reason,
					}),
				};
				Self::answered(mission_escalate(self.app.clone(), state, asked.id, note).await?)
			}
			Operation::Close => {
				let asked: Closed = Self::read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let closing = MissionClosing {
					source: BOT.to_owned(),
					outcome: asked.outcome,
					summary: asked.summary,
				};
				Self::answered(mission_conclude(self.app.clone(), state, asked.id, closing).await?)
			}
			Operation::Watch => {
				let asked: Armed = Self::read(payload)?;
				self.refuse_a_mission_it_does_not_own(database, &asked.id).await?;
				let watch = MissionWatch { branch: asked.branch, repository: asked.repository };
				Self::answered(mission_watch(self.app.clone(), state, asked.id, watch).await?)
			}
			Operation::List => {
				let _: Bare = Self::read(payload)?;
				let carried = database
					.missions()
					.still_open_for_bot(self.conversation_id.clone(), self.bot_id.clone())
					.await?;
				Self::answered(carried.into_iter().map(listed).collect::<Vec<_>>())
			}
		}
	}
}

impl Refusal for MissionError {
	fn unreadable(detail: String) -> Self {
		Self::UnreadableRequest { detail }
	}

	fn unexpected(detail: String) -> Self {
		Self::Unexpected { detail }
	}
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	Open,
	Note,
	Status,
	Escalate,
	Close,
	Watch,
	List,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Opened {
	objective: String,
	ticket: Ticket,
	tools: Vec<String>,
	#[serde(default)]
	workspace_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Noted {
	id: String,
	line: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stated {
	id: String,
	text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Escalated {
	id: String,
	question: String,
	reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Closed {
	id: String,
	outcome: MissionOutcome,
	summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Armed {
	id: String,
	branch: String,
	repository: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Bare {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Listed {
	id: String,
	ticket: Ticket,
	state: MissionState,
	opened_at: i64,
	status: Option<MissionStatus>,
}

fn listed(mission: Mission) -> Listed {
	Listed {
		id: mission.id,
		ticket: mission.ticket,
		state: mission.state,
		opened_at: mission.opened_at,
		status: mission.status,
	}
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use serde_json::json;
	use std::sync::mpsc::channel;
	use tauri::test::{mock_builder, MockRuntime};

	use tauri::{App, Listener as _, Manager as _};

	use super::super::commands::{mission_detail, mission_open as opened};
	use super::super::contract::{MissionEvent, MissionState};
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const A_SPACE: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'personal', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'personal', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c1', 'b2', 'assistant', 1, 1),
				('c2', 'b1', 'assistant', 1, 0);
	";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("mission-host-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_SPACE)?))
			.await
			.expect("the space is planted");
		app
	}

	fn serving(app: &App<MockRuntime>, conversation_id: &str) -> MissionHost<MockRuntime> {
		MissionHost::new(app.handle().clone(), conversation_id.to_owned(), "b1".to_owned())
	}

	fn asking(operation: &str, payload: Value) -> Value {
		json!({ "subtype": "mission", "operation": operation, "payload": payload })
	}

	fn an_open() -> Value {
		an_open_in(None)
	}

	fn an_open_in(workspace: Option<&Path>) -> Value {
		asking(
			"open",
			json!({
				"objective": "Ship the mission tools",
				"ticket": {
					"platform": "linear",
					"externalId": "OPE-26",
					"url": "https://linear.test/OPE-26",
					"title": "Mission tools"
				},
				"tools": ["gh"],
				"workspacePath": workspace.map(|path| path.to_string_lossy().into_owned())
			}),
		)
	}

	async fn a_mission_of(app: &App<MockRuntime>, conversation_id: &str, bot_id: &str) -> Mission {
		opened(
			app.handle().clone(),
			app.state(),
			MissionDraft {
				origin_conversation_id: conversation_id.to_owned(),
				bot_id: bot_id.to_owned(),
				objective: "Held".to_owned(),
				ticket: Ticket {
					platform: "linear".to_owned(),
					external_id: "OPE-1".to_owned(),
					url: "https://linear.test/OPE-1".to_owned(),
					title: "Held".to_owned(),
				},
				tools: Vec::new(),
				source: "human".to_owned(),
				workspace_path: None,
			},
		)
		.await
		.expect("the mission opens")
		.mission
	}

	async fn events(app: &App<MockRuntime>, id: &str) -> Vec<MissionEvent> {
		mission_detail(app.state(), id.to_owned()).await.expect("the mission reads").events
	}

	async fn armed_missions(app: &App<MockRuntime>) -> Vec<String> {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.missions()
			.watched()
			.await
			.expect("the armed missions read")
			.into_iter()
			.map(|held| held.id)
			.collect()
	}

	fn ids(answered: &Value) -> Vec<String> {
		answered
			.as_array()
			.expect("a list")
			.iter()
			.filter_map(|row| row["id"].as_str().map(str::to_owned))
			.collect()
	}

	fn an_arming(id: &str) -> Value {
		asking(
			"watch",
			json!({
				"id": id,
				"branch": "feature/ope-37",
				"repository": "shoto290/kiroshi-monorepo"
			}),
		)
	}

	fn a_workspace(name: &str) -> RemovedOnDrop {
		let path = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-mission-host-{name}-{}", std::process::id())),
		);
		let _ = fs::remove_dir_all(&path);
		fs::create_dir_all(&path).expect("the workspace is there");
		fs::write(path.join(".git"), "gitdir: /elsewhere/.git/worktrees/one")
			.expect("the git file lands");
		path
	}

	#[tokio::test]
	async fn a_mission_is_opened_noted_escalated_and_closed_by_the_bot_of_the_session() {
		let app = a_host("lifecycle").await;
		let host = serving(&app, "c1");

		let opened = host.answer(an_open()).await.expect("the mission opens");
		let id = opened["mission"]["id"].as_str().expect("the mission is named").to_owned();
		let noted = host
			.answer(asking("note", json!({ "id": id, "line": "The host answers" })))
			.await
			.expect("the note lands");
		let escalated = host
			.answer(asking(
				"escalate",
				json!({
					"id": id,
					"question": "Which platform?",
					"reason": "The person decides"
				}),
			))
			.await
			.expect("the mission is escalated");
		let closed = host
			.answer(asking(
				"close",
				json!({ "id": id, "outcome": "done", "summary": "The tools are served" }),
			))
			.await
			.expect("the mission is closed");

		assert_eq!(opened["mission"]["originConversationId"], json!("c1"));
		assert_eq!(opened["mission"]["botId"], json!("b1"));
		assert_eq!(opened["mission"]["state"], json!("working"));
		assert!(opened["mission"]["threadConversationId"].is_string(), "got {opened}");
		assert!(opened["reach"].is_string(), "got {opened}");
		assert_eq!(noted["state"], json!("working"));
		assert_eq!(escalated["state"], json!("waiting_human"));
		assert_eq!(closed["state"], json!("done"));
		assert_eq!(
			events(&app, &id)
				.await
				.into_iter()
				.map(|held| (held.kind, held.source, held.payload))
				.collect::<Vec<_>>(),
			vec![
				(MissionEventKind::Opened, BOT.to_owned(), json!({})),
				(MissionEventKind::Note, BOT.to_owned(), json!({ "line": "The host answers" })),
				(
					MissionEventKind::Escalated,
					BOT.to_owned(),
					json!({ "question": "Which platform?", "reason": "The person decides" })
				),
				(
					MissionEventKind::Closed,
					BOT.to_owned(),
					json!({ "outcome": "done", "summary": "The tools are served" })
				),
			]
		);
	}

	#[tokio::test]
	async fn a_mission_is_served_from_its_own_thread_where_its_bot_carries_the_work_out() {
		let app = a_host("own-thread").await;
		let opened = a_mission_of(&app, "c1", "b1").await;
		let host = serving(&app, &opened.thread_conversation_id);

		host.answer(asking("note", json!({ "id": opened.id, "line": "The work moved" })))
			.await
			.expect("the note lands");
		host.answer(asking(
			"escalate",
			json!({ "id": opened.id, "question": "Which platform?", "reason": "The person decides" }),
		))
		.await
		.expect("the mission is escalated");
		let closed = host
			.answer(asking(
				"close",
				json!({ "id": opened.id, "outcome": "done", "summary": "The work is done" }),
			))
			.await
			.expect("the mission is closed");

		assert_eq!(closed["state"], json!("done"));
		assert_eq!(
			events(&app, &opened.id).await.into_iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![
				MissionEventKind::Opened,
				MissionEventKind::Note,
				MissionEventKind::Escalated,
				MissionEventKind::Closed,
			]
		);
	}

	#[tokio::test]
	async fn a_mission_of_another_conversation_is_refused_and_nothing_is_appended() {
		let app = a_host("foreign-conversation").await;
		let held = a_mission_of(&app, "c2", "b1").await;
		let host = serving(&app, "c1");

		for asked in [
			asking("note", json!({ "id": held.id, "line": "Sneaking in" })),
			asking("status", json!({ "id": held.id, "text": "Sneaking in" })),
			asking("escalate", json!({ "id": held.id, "question": "?", "reason": "?" })),
			asking("close", json!({ "id": held.id, "outcome": "done", "summary": "?" })),
			an_arming(&held.id),
		] {
			let refused = host.answer(asked).await.expect_err("the call is refused");

			assert_eq!(refused["kind"], json!("missionOfAnotherConversation"));
			assert_eq!(refused["id"], json!(held.id));
		}
		assert_eq!(
			events(&app, &held.id).await.into_iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened]
		);
		assert!(armed_missions(&app).await.is_empty());
	}

	#[tokio::test]
	async fn a_mission_of_another_bot_is_refused_and_nothing_is_appended() {
		let app = a_host("foreign-bot").await;
		let held = a_mission_of(&app, "c1", "b2").await;
		let host = serving(&app, "c1");

		for asked in [
			asking("note", json!({ "id": held.id, "line": "Sneaking in" })),
			asking("status", json!({ "id": held.id, "text": "Sneaking in" })),
			asking("escalate", json!({ "id": held.id, "question": "?", "reason": "?" })),
			asking("close", json!({ "id": held.id, "outcome": "done", "summary": "?" })),
			an_arming(&held.id),
		] {
			let refused = host.answer(asked).await.expect_err("the call is refused");

			assert_eq!(refused["kind"], json!("missionOfAnotherBot"));
			assert_eq!(refused["id"], json!(held.id));
		}
		assert_eq!(
			events(&app, &held.id).await.into_iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened]
		);
		assert!(armed_missions(&app).await.is_empty());
	}

	#[tokio::test]
	async fn list_answers_the_open_missions_of_the_bot_of_the_session() {
		let app = a_host("listed").await;
		let mine = a_mission_of(&app, "c1", "b1").await;
		let closed = a_mission_of(&app, "c1", "b1").await;
		a_mission_of(&app, "c1", "b2").await;
		let host = serving(&app, "c1");
		host.answer(asking(
			"close",
			json!({ "id": closed.id, "outcome": "done", "summary": "Already served" }),
		))
		.await
		.expect("the mission is closed");

		let answered =
			host.answer(asking("list", json!({}))).await.expect("the missions are listed");

		assert_eq!(ids(&answered), vec![mine.id], "got {answered}");
		let row = &answered.as_array().expect("a list")[0];
		assert_eq!(row["ticket"]["externalId"], json!("OPE-1"));
		assert_eq!(row["state"], json!("working"));
		assert!(row["openedAt"].is_number(), "got {row}");
		assert_eq!(row["status"], Value::Null, "got {row}");
	}

	#[tokio::test]
	async fn a_mission_is_armed_and_listed_from_its_own_thread() {
		let app = a_host("armed").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let opened = a_mission_of(&app, "c1", "b1").await;
		let host = serving(&app, &opened.thread_conversation_id);

		let armed = host.answer(an_arming(&opened.id)).await.expect("the mission is armed");
		let answered =
			host.answer(asking("list", json!({}))).await.expect("the missions are listed");

		assert!(
			armed["url"].as_str().is_some_and(|url| url.starts_with("http://127.0.0.1:")),
			"got {armed}"
		);
		assert_eq!(armed["header"], json!(crate::routines::webhook::HEADER));
		assert!(armed["key"].as_str().is_some_and(|key| !key.is_empty()), "got {armed}");
		assert_eq!(armed_missions(&app).await, vec![opened.id.clone()]);
		assert_eq!(ids(&answered), vec![opened.id]);

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
	}

	#[tokio::test]
	async fn a_mission_opened_on_a_checkout_carries_the_hook_and_the_line_on_its_agent() {
		let app = a_host("opened-hook").await;
		app.manage(crate::routines::webhook::start(app.handle().clone()));
		let workspace = a_workspace("opened-hook");
		let host = serving(&app, "c1");

		let opened = host.answer(an_open_in(Some(&workspace))).await.expect("the mission opens");

		assert!(opened["mission"]["id"].is_string(), "got {opened}");
		assert!(
			opened["reach"].as_str().is_some_and(|line| line.contains("agent hook")),
			"got {opened}"
		);
		let settings = fs::read_to_string(workspace.join(".claude").join("settings.local.json"))
			.expect("the settings of the workspace read");
		assert!(settings.contains("kiroshi-agent-hook.sh"), "got {settings}");

		if let Some(webhook) = app.try_state::<crate::routines::webhook::Webhook>() {
			webhook.stop();
		}
		fs::remove_dir_all(&workspace).expect("cleanup");
	}

	#[tokio::test]
	async fn an_opened_mission_answers_its_thread_and_the_lines_that_end_the_turn() {
		let app = a_host("opened-thread").await;
		let host = serving(&app, "c1");

		let opened = host.answer(an_open()).await.expect("the mission opens");

		let thread = opened["mission"]["threadConversationId"].as_str().unwrap_or_default();
		let carries_on = opened["carriesOn"].as_str().unwrap_or_default();

		assert!(!thread.is_empty(), "the answer named no thread: {opened}");
		assert!(carries_on.contains("carries on"), "got {opened}");
		assert!(carries_on.contains("thread"), "got {opened}");
		assert!(
			opened["acknowledge"].as_str().is_some_and(|line| line.contains("single line")),
			"got {opened}"
		);
	}

	#[tokio::test]
	async fn a_field_the_operation_does_not_declare_is_named_and_refused() {
		let app = a_host("undeclared").await;
		let host = serving(&app, "c1");

		let refused = host
			.answer(asking(
				"open",
				json!({
					"objective": "Ship it",
					"ticket": {
						"platform": "linear",
						"externalId": "OPE-26",
						"url": "https://linear.test/OPE-26",
						"title": "Mission tools"
					},
					"tools": [],
					"botId": "b2"
				}),
			))
			.await
			.expect_err("the call is refused");

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("botId")),
			"got {refused}"
		);
	}

	#[tokio::test]
	async fn a_mission_closed_on_a_failed_outcome_stands_failed_and_carries_a_closing_moment() {
		let app = a_host("derived").await;
		let host = serving(&app, "c1");
		let opened = host.answer(an_open()).await.expect("the mission opens");
		let id = opened["mission"]["id"].as_str().expect("the mission is named").to_owned();

		host.answer(asking(
			"close",
			json!({ "id": id, "outcome": "failed", "summary": "Out of reach" }),
		))
		.await
		.expect("the mission is closed");

		let mission = mission_detail(app.state(), id).await.expect("the mission reads").mission;
		assert_eq!(mission.state, MissionState::Failed);
		assert!(mission.closed_at.is_some(), "the failed close left the mission open");
	}

	#[tokio::test]
	async fn a_status_lands_on_the_mission_from_its_bot_and_moves_nothing_but_itself() {
		let app = a_host("status").await;
		let opened = a_mission_of(&app, "c1", "b1").await;
		let host = serving(&app, &opened.thread_conversation_id);
		let (sender, received) = channel();
		app.handle().listen(super::super::commands::CHANGED_EVENT, move |event| {
			let _ = sender.send(event.payload().to_owned());
		});

		let stated = host
			.answer(asking(
				"status",
				json!({ "id": opened.id, "text": "Paused, the person picks the copy next" }),
			))
			.await
			.expect("the status lands");
		let answered =
			host.answer(asking("list", json!({}))).await.expect("the missions are listed");

		assert_eq!(stated["status"]["text"], json!("Paused, the person picks the copy next"));
		assert!(stated["status"]["writtenAt"].is_number(), "got {stated}");
		assert_eq!(stated["state"], json!("working"));
		assert_eq!(stated["stateSeq"], json!(opened.state_seq));
		assert_eq!(stated["closedAt"], Value::Null);
		assert_eq!(answered[0]["status"], stated["status"], "got {answered}");
		assert!(received.try_recv().is_ok(), "the status was not announced");
		assert_eq!(
			events(&app, &opened.id)
				.await
				.into_iter()
				.map(|held| (held.kind, held.source, held.payload))
				.collect::<Vec<_>>(),
			vec![
				(MissionEventKind::Opened, "human".to_owned(), json!({})),
				(
					MissionEventKind::Status,
					BOT.to_owned(),
					json!({ "text": "Paused, the person picks the copy next" })
				),
			]
		);
	}

	#[tokio::test]
	async fn a_blank_status_and_a_status_on_a_closed_mission_are_refused() {
		let app = a_host("status-refused").await;
		let opened = a_mission_of(&app, "c1", "b1").await;
		let host = serving(&app, "c1");

		let blank = host
			.answer(asking("status", json!({ "id": opened.id, "text": "  " })))
			.await
			.expect_err("the blank status is refused");
		host.answer(asking(
			"close",
			json!({ "id": opened.id, "outcome": "done", "summary": "Shipped" }),
		))
		.await
		.expect("the mission is closed");
		let shut = host
			.answer(asking("status", json!({ "id": opened.id, "text": "Too late" })))
			.await
			.expect_err("the status on a closed mission is refused");

		assert_eq!(blank["kind"], json!("blankField"));
		assert_eq!(blank["field"], json!("text"));
		assert_eq!(shut["kind"], json!("missionAlreadyClosed"));
		assert_eq!(
			events(&app, &opened.id).await.into_iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened, MissionEventKind::Closed]
		);
	}
}
