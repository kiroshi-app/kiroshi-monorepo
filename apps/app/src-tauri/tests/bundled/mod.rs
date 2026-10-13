use kiroshi_app::bundles;
use kiroshi_app::db;
use kiroshi_app::db::repositories::conversations::{Bot, DEFAULT_BOT_ID};
use tauri::async_runtime::block_on;
use tauri::test::MockRuntime;
use tauri::{App, Manager};

pub fn bundled_bots(app: &App<MockRuntime>, bot_ids: &[&str]) {
	let state = app.state::<db::DatabaseState>();
	let database = state.inner().as_ref().expect("the database is open");
	let root = bundles::root(app.handle()).expect("the bundles have a root");
	for bot_id in bot_ids {
		let bot = block_on(seated(database, bot_id));
		bundles::lay_down(&root, &bot).expect("the bundle is laid down");
	}
}

async fn seated(database: &db::Database, bot_id: &str) -> Bot {
	if bot_id == DEFAULT_BOT_ID {
		return database.conversations().ensure_default_bot().await.expect("the default bot");
	}
	let planted = bot_id.to_owned();
	database
		.call_mut(move |connection| {
			connection.execute(
				"INSERT INTO bots (id, name, model, created_at) VALUES (?1, ?1, 'sonnet', 1)",
				[&planted],
			)?;
			connection.execute(
				"INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES (?1, 'personal', 1)",
				[&planted],
			)?;
			Ok(())
		})
		.await
		.expect("the bot is planted");
	database
		.conversations()
		.bot(bot_id.to_owned())
		.await
		.expect("the bot reads")
		.expect("the bot is seated")
}
