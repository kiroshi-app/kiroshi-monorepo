use kiroshi_core::agent::contract::OfferedModel;
use kiroshi_core::bundles::{BotPermissions, EffortLevel};
use kiroshi_core::conversations::contract::{Bot, BotIdentity, Hue};
use rune::TextEdit;

use kiroshi_rune_kit::surfaces::s10_agent_settings::agent::Effort;

pub const FALLBACK_MODELS: [&str; 4] = ["opus", "fable", "sonnet", "haiku"];

const UNRUNNABLE_MODEL: &str = "default";

const CHANGING_TOOLS: [&str; 4] = ["Bash", "Edit", "NotebookEdit", "Write"];

#[derive(Clone, Debug, PartialEq)]
pub struct ModelOption {
	pub value: String,
	pub efforts: Vec<Effort>,
}

pub struct Fields {
	pub saved: Bot,
	pub shown: BotIdentity,
	pub name: TextEdit,
	pub title: TextEdit,
	pub is_edited: bool,
	writes: usize,
}

pub fn hue_value(hue: Option<Hue>) -> Option<f32> {
	hue.map(|hue| f32::from(hue.value()))
}

pub fn hue_from(hue: Option<f32>) -> Option<Hue> {
	hue.and_then(|hue| Hue::new(hue.round() as i64))
}

pub fn identity_of(bot: &Bot) -> BotIdentity {
	BotIdentity {
		name: bot.name.clone(),
		title: bot.title.clone(),
		model: bot.model.clone(),
		avatar_blot: bot.avatar_blot,
		avatar_image_path: bot.avatar_image_path.clone(),
		instructions: bot.instructions.clone(),
		denied_tools: without_changing_tools(&bot.denied_tools),
		permissions: bot.permissions.clone(),
		output_style: bot.output_style.clone(),
		effort: bot.effort,
	}
}

fn without_changing_tools(denied: &[String]) -> Vec<String> {
	denied.iter().filter(|tool| !CHANGING_TOOLS.contains(&tool.as_str())).cloned().collect()
}

fn sorted(items: &[String]) -> Vec<String> {
	let mut items = items.to_vec();
	items.sort();
	items
}

fn permissions_key(
	permissions: &BotPermissions,
) -> (String, Vec<String>, Vec<String>, Vec<String>) {
	(
		permissions.default_mode.clone(),
		sorted(&permissions.allow),
		sorted(&permissions.ask),
		sorted(&permissions.deny),
	)
}

pub fn changes_runtime(bot: &Bot, next: &BotIdentity) -> bool {
	next.instructions != bot.instructions
		|| next.model != bot.model
		|| next.effort != bot.effort
		|| sorted(&next.denied_tools) != sorted(&bot.denied_tools)
		|| permissions_key(&next.permissions) != permissions_key(&bot.permissions)
}

pub fn effort_of(level: EffortLevel) -> Effort {
	match level {
		EffortLevel::Low => Effort::Low,
		EffortLevel::Medium => Effort::Medium,
		EffortLevel::High => Effort::High,
		EffortLevel::Xhigh => Effort::XHigh,
		EffortLevel::Max => Effort::Max,
	}
}

fn without_effort(value: &str) -> ModelOption {
	ModelOption { value: value.to_owned(), efforts: Vec::new() }
}

fn option_of(model: &OfferedModel) -> ModelOption {
	ModelOption {
		value: model.value.clone(),
		efforts: model.supported_effort_levels.iter().copied().map(effort_of).collect(),
	}
}

pub fn model_options_for(model: &str, catalogue: &[OfferedModel]) -> Vec<ModelOption> {
	let read: Vec<ModelOption> = catalogue
		.iter()
		.filter(|offered| offered.value != UNRUNNABLE_MODEL)
		.map(option_of)
		.collect();
	let mut offered = if read.is_empty() {
		FALLBACK_MODELS.iter().map(|value| without_effort(value)).collect()
	} else {
		read
	};
	let is_offered =
		model == UNRUNNABLE_MODEL || offered.iter().any(|option| option.value == model);
	if !is_offered {
		offered.push(without_effort(model));
	}
	offered
}

pub struct Write {
	pub identity: BotIdentity,
	pub restarts: bool,
}

impl Fields {
	pub fn new(saved: Bot) -> Fields {
		Fields {
			name: TextEdit::new(&saved.name),
			title: TextEdit::new(&saved.title),
			shown: identity_of(&saved),
			saved,
			is_edited: false,
			writes: 0,
		}
	}

	fn with_texts(&self) -> BotIdentity {
		BotIdentity {
			name: self.name.text.clone(),
			title: self.title.text.clone(),
			..self.shown.clone()
		}
	}

	pub fn write(&mut self, change: impl FnOnce(&mut BotIdentity)) -> Write {
		let mut identity = self.with_texts();
		change(&mut identity);
		self.shown = identity.clone();
		self.is_edited = false;
		self.writes += 1;
		Write { restarts: changes_runtime(&self.saved, &identity), identity }
	}

	pub fn due_text_write(&mut self) -> Option<Write> {
		if !self.is_edited || self.writes > 0 {
			return None;
		}
		self.is_edited = false;
		let is_unchanged = self.name.text == self.shown.name && self.title.text == self.shown.title;
		if is_unchanged {
			return None;
		}
		Some(self.write(|_| {}))
	}

	pub fn written(&mut self, bot: Bot) {
		self.writes = self.writes.saturating_sub(1);
		self.heard(bot);
	}

	pub fn heard(&mut self, bot: Bot) {
		self.saved = bot;
		if self.writes > 0 {
			return;
		}
		self.shown = identity_of(&self.saved);
		if !self.is_edited {
			self.reset_texts();
		}
	}

	pub fn refused(&mut self) {
		self.writes = self.writes.saturating_sub(1);
		self.is_edited = false;
		self.shown = identity_of(&self.saved);
		self.reset_texts();
	}

	fn reset_texts(&mut self) {
		self.name = TextEdit::new(&self.saved.name);
		self.title = TextEdit::new(&self.saved.title);
	}
}
