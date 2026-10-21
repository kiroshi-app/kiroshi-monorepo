use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use super::own_write::{
	write_own_file, BundleWrite, BundleWriteRefusal, BundleWritten, RefusalKind,
};
use crate::agent::commands::{announce, learned_block, reconcile_bot, store_a_changed_block};
use crate::agent::contract::{AgentEvent, EvolvedBundle, RuntimeScope};
use crate::agent::host::{Host, Refusal};
use crate::conversations::commands::ready;
use crate::db;

const NO_STORE: &str = "the store of this session is not open";
const UNREAD_BOT: &str = "the bot of this session could not be read";
const NO_BOT: &str = "the bot of this session is gone";
const NO_ROOT: &str = "this session has no bundles directory";
const UNSTORED_MEMORY: &str = "the write was recorded but the memory it holds was not stored";

#[derive(Debug)]
pub struct BundleHost<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
}

impl<R: Runtime> BundleHost<R> {
	pub fn new(app: AppHandle<R>, scope: RuntimeScope) -> Self {
		Self { app, scope }
	}

	async fn written(
		&self,
		database: &db::Database,
		asked: BundleWrite,
	) -> Result<BundleWritten, BundleWriteRefusal> {
		let bot = database
			.conversations()
			.bot(self.scope.bot_id.clone())
			.await
			.map_err(|error| BundleWriteRefusal::unexpected(format!("{UNREAD_BOT}: {error:?}")))?
			.ok_or_else(|| BundleWriteRefusal::unexpected(NO_BOT.to_owned()))?;
		let root = super::root(&self.app)
			.ok_or_else(|| BundleWriteRefusal::unexpected(NO_ROOT.to_owned()))?;
		let held = learned_block(&root, &bot.id);
		let written = write_own_file(&root, &bot, asked)?;
		if let BundleWritten::Recorded { commit_id, title } = &written {
			reconcile_bot(database, &root, &bot).await;
			let stored = store_a_changed_block(database, &root, &bot.id, held).await;
			announce(
				&self.app,
				Some(self.scope.clone()),
				AgentEvent::BotEvolved {
					bundle: EvolvedBundle::Bot,
					commit_id: commit_id.clone(),
					title: title.clone(),
				},
			);
			stored.map_err(|error| {
				BundleWriteRefusal::unexpected(format!("{UNSTORED_MEMORY}: {error:?}"))
			})?;
		}
		Ok(written)
	}
}

impl<R: Runtime> Host for BundleHost<R> {
	const SUBTYPE: &'static str = "bundle";

	type Operation = Operation;

	type Error = BundleWriteRefusal;

	async fn served(
		&self,
		operation: Operation,
		payload: Value,
	) -> Result<Value, BundleWriteRefusal> {
		let state = Self::database(&self.app)?;
		let database = ready(&state)
			.map_err(|error| BundleWriteRefusal::unexpected(format!("{NO_STORE}: {error:?}")))?;
		match operation {
			Operation::Write => {
				let asked: BundleWrite = Self::read(payload)?;
				Self::answered(self.written(database, asked).await?)
			}
		}
	}
}

impl Refusal for BundleWriteRefusal {
	fn unreadable(detail: String) -> Self {
		Self::new(RefusalKind::UnreadableRequest, detail)
	}

	fn unexpected(detail: String) -> Self {
		Self::new(RefusalKind::Unexpected, detail)
	}
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	Write,
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc::{channel, Receiver};
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener as _, Manager as _};

	use super::*;
	use crate::agent::commands::EVENT_CHANNEL;
	use crate::bundles;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const TWO_BOTS: &str = "
		INSERT INTO bots (id, name, model, created_at, memory)
			VALUES ('b1', 'First', 'sonnet', 1, 'They bake on Sundays.'),
				('b2', 'Second', 'sonnet', 1, '');
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'personal', 1);
	";

	const A_SKILL: &str = "skills/baking/SKILL.md";

	async fn an_app_with_two_bundles(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("bundle-host-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		database
			.call_mut(|connection| Ok(connection.execute_batch(TWO_BOTS)?))
			.await
			.expect("the bots are planted");
		let root = bundles::root(app.handle()).expect("the bundles directory resolves");
		for id in ["b1", "b2"] {
			let bot = database
				.conversations()
				.bot(id.to_owned())
				.await
				.expect("the bot reads")
				.expect("the bot is there");
			bundles::write(&root, &bot).expect("the bundle is written");
		}
		app
	}

	fn serving(app: &App<MockRuntime>, bot_id: &str) -> BundleHost<MockRuntime> {
		BundleHost::new(
			app.handle().clone(),
			RuntimeScope {
				conversation_id: "c1".to_owned(),
				bot_id: bot_id.to_owned(),
				runtime_session_id: "r1".to_owned(),
				epoch: 0,
			},
		)
	}

	fn a_write(text: &str) -> Value {
		json!({
			"subtype": "bundle",
			"operation": "write",
			"payload": { "path": A_SKILL, "text": text, "title": "Kept the oven", "summary": "220 degrees." },
		})
	}

	fn listening(app: &App<MockRuntime>) -> Receiver<Value> {
		let (sender, received) = channel();
		app.handle().listen(EVENT_CHANNEL, move |heard| {
			let payload = serde_json::from_str(heard.payload()).expect("the payload is JSON");
			sender.send(payload).expect("the event is passed on");
		});
		received
	}

	fn skill_of(app: &App<MockRuntime>, bot_id: &str) -> Option<String> {
		let root = bundles::root(app.handle()).expect("the bundles directory resolves");
		let bundle = bundles::dir(&root, bot_id).expect("the bundle is held");
		std::fs::read_to_string(bundle.join(A_SKILL)).ok()
	}

	#[tokio::test]
	async fn a_write_lands_in_the_bundle_of_the_session_bot_and_emits_its_evolution() {
		let app = an_app_with_two_bundles("lands").await;
		let heard = listening(&app);

		let answer = serving(&app, "b1").answer(a_write("Bake at 220 degrees.")).await;

		let answer = answer.expect("the write is served");
		assert_eq!(answer["outcome"], "recorded");
		let commit_id = answer["commitId"].as_str().expect("a commit id is answered");
		assert_eq!(skill_of(&app, "b1").as_deref(), Some("Bake at 220 degrees."));
		assert_eq!(skill_of(&app, "b2"), None);
		let event = heard.recv_timeout(Duration::from_secs(5)).expect("an event is emitted");
		assert_eq!(event["scope"]["botId"], "b1");
		assert_eq!(
			event["event"],
			json!({ "type": "botEvolved", "bundle": "bot", "commitId": commit_id, "title": "Kept the oven" })
		);
	}

	#[tokio::test]
	async fn an_unchanged_write_emits_nothing() {
		let app = an_app_with_two_bundles("unchanged").await;
		let host = serving(&app, "b1");
		host.answer(a_write("Bake.")).await.expect("the first write is served");
		let heard = listening(&app);

		let answer = host.answer(a_write("Bake.")).await.expect("the second write is served");

		assert_eq!(answer, json!({ "outcome": "unchanged" }));
		assert!(heard.recv_timeout(Duration::from_millis(300)).is_err());
	}

	#[tokio::test]
	async fn an_empty_memory_clears_the_block_and_the_stored_memory_of_the_bot() {
		let app = an_app_with_two_bundles("forgotten").await;
		let asked = json!({
			"subtype": "bundle",
			"operation": "write",
			"payload": { "path": "agents/agent.md", "text": "", "title": "Forgot the day", "summary": "" },
		});

		let answer = serving(&app, "b1").answer(asked).await.expect("the write is served");

		assert_eq!(answer["outcome"], "recorded");
		let root = bundles::root(app.handle()).expect("the bundles directory resolves");
		let agent = bundles::agent_file(&root, "b1").expect("the agent file is there");
		let text = std::fs::read_to_string(agent).expect("the agent file reads");
		assert!(!text.contains("They bake on Sundays."), "got {text}");
		let state = app.state::<db::DatabaseState>();
		let stored = ready(&state)
			.expect("the database opens")
			.conversations()
			.bot("b1".to_owned())
			.await
			.expect("the bot reads")
			.expect("the bot is there");
		assert_eq!(stored.memory, "");
	}

	#[tokio::test]
	async fn a_payload_naming_a_bot_is_refused_and_writes_nothing() {
		let app = an_app_with_two_bundles("named").await;
		let mut asked = a_write("Bake.");
		asked["payload"]["botId"] = json!("b2");

		let refusal = serving(&app, "b1").answer(asked).await.expect_err("the write is refused");

		assert_eq!(refusal["kind"], "unreadableRequest");
		assert_eq!(skill_of(&app, "b1"), None);
		assert_eq!(skill_of(&app, "b2"), None);
	}
}
