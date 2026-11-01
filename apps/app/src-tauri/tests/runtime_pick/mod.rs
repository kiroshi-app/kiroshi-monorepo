use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

use kiroshi_app::bundles::{self, EffortLevel};
use kiroshi_app::conversations::contract::BotIdentity;
use kiroshi_app::db::repositories::conversations::Bot;

const OPENED_RUNTIME_ENV: &str = "FAKE_AGENT_OPENED_RUNTIME_FILE";

pub const HELD_FOR: Duration = Duration::from_millis(300);

pub fn picked(bot: Bot, model: &str, effort: EffortLevel) -> BotIdentity {
	BotIdentity {
		name: bot.name,
		title: bot.title,
		model: model.to_owned(),
		avatar_blot: bot.avatar_blot,
		avatar_image_path: bot.avatar_image_path,
		instructions: bot.instructions,
		denied_tools: bot.denied_tools,
		permissions: bot.permissions.unwrap_or_default(),
		output_style: bundles::DEFAULT_OUTPUT_STYLE.to_owned(),
		effort: Some(effort),
	}
}

pub fn record_named(name: &str) -> PathBuf {
	std::env::temp_dir().join(format!("kiroshi-opened-runtimes-{name}-{}.txt", std::process::id()))
}

pub struct OpenedRuntimes<Record: AsRef<Path>>(Record);

impl<Record: AsRef<Path>> OpenedRuntimes<Record> {
	pub fn recorded_in(record: Record) -> Self {
		std::env::set_var(OPENED_RUNTIME_ENV, record.as_ref());
		Self(record)
	}

	pub fn on(&self, bot_id: &str) -> Vec<String> {
		let held = match std::fs::read_to_string(self.0.as_ref()) {
			Ok(held) => held,
			Err(error) if error.kind() == ErrorKind::NotFound => String::new(),
			Err(error) => panic!("the opened runtimes did not read: {error}"),
		};
		let prefix = format!("{bot_id} ");
		held.lines().filter_map(|line| line.strip_prefix(&prefix)).map(str::to_owned).collect()
	}
}

impl<Record: AsRef<Path>> Drop for OpenedRuntimes<Record> {
	fn drop(&mut self) {
		std::env::remove_var(OPENED_RUNTIME_ENV);
	}
}
