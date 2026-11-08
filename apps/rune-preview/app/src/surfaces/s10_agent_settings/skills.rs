use kiroshi_core::bundles::SkillFront;
use kiroshi_core::conversations::contract::{Skill, SkillDraft};
use rune::TextEdit;
use serde_json::Value;

use kiroshi_rune_kit::surfaces::s10_agent_settings::skills::{
	FileFailure, Section, SkillEffort, SkillField, SkillSwitch, SkillTexts, Switches,
};

const MODEL_INVOCATION_DISABLED_BY_DEFAULT: bool = false;

const USER_INVOCABLE_BY_DEFAULT: bool = true;

const BACKGROUND_BY_DEFAULT: bool = true;

const SKILL_EFFORTS: [(&str, SkillEffort); 3] =
	[("low", SkillEffort::Low), ("medium", SkillEffort::Medium), ("high", SkillEffort::High)];

const SKILL_CONTEXTS: [(&str, bool); 2] = [("shared", false), ("fork", true)];

const ALL_FIELDS: [SkillField; 16] = [
	SkillField::Body,
	SkillField::ArgumentHint,
	SkillField::Arguments,
	SkillField::Name,
	SkillField::Description,
	SkillField::WhenToUse,
	SkillField::Paths,
	SkillField::Model,
	SkillField::Shell,
	SkillField::Agent,
	SkillField::AllowedTools,
	SkillField::DisallowedTools,
	SkillField::Hooks,
	SkillField::License,
	SkillField::Compatibility,
	SkillField::Metadata,
];

pub struct OpenFile {
	pub path: String,
	pub text: Option<TextEdit>,
	pub saved: Option<String>,
	pub failure: Option<FileFailure>,
}

impl OpenFile {
	pub fn reading(path: String) -> OpenFile {
		OpenFile { path, text: None, saved: None, failure: None }
	}

	pub fn is_unsaved(&self) -> bool {
		self.text.as_ref().zip(self.saved.as_ref()).is_some_and(|(text, saved)| text.text != *saved)
	}

	pub fn read(&mut self, text: String) {
		self.text = Some(TextEdit::new(&text));
		self.saved = Some(text);
		self.failure = None;
	}
}

pub struct Draft {
	pub kept: Option<Skill>,
	pub texts: SkillTexts,
	pub switches: Switches,
	pub section: Section,
	pub is_saving: bool,
	pub file: Option<OpenFile>,
}

fn lines_of(values: Option<&Vec<String>>) -> String {
	values.map(|values| values.join("\n")).unwrap_or_default()
}

fn list_of(text: &str) -> Option<Vec<String>> {
	let values: Vec<String> =
		text.lines().map(str::trim).filter(|line| !line.is_empty()).map(str::to_owned).collect();
	(!values.is_empty()).then_some(values)
}

fn text_of(value: Option<&Value>) -> String {
	match value {
		None | Some(Value::Null) => String::new(),
		Some(Value::String(text)) => text.clone(),
		Some(value) => serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()),
	}
}

fn value_of(text: &str) -> Option<Value> {
	let trimmed = text.trim();
	if trimmed.is_empty() {
		return None;
	}
	Some(serde_json::from_str(trimmed).unwrap_or_else(|_| Value::String(trimmed.to_owned())))
}

fn filled(text: &str) -> Option<String> {
	(!text.is_empty()).then(|| text.to_owned())
}

fn flag(moved: bool, kept: Option<bool>, fallback: bool) -> Option<bool> {
	match kept {
		None if moved == fallback => None,
		None | Some(_) => Some(moved),
	}
}

fn known_effort(value: Option<&str>) -> Option<&'static str> {
	SKILL_EFFORTS.iter().find(|(name, _)| Some(*name) == value).map(|(name, _)| *name)
}

fn known_context(value: Option<&str>) -> Option<&'static str> {
	SKILL_CONTEXTS.iter().find(|(name, _)| Some(*name) == value).map(|(name, _)| *name)
}

pub fn texts_of(skill: &Skill) -> SkillTexts {
	let front = &skill.front;
	let edit = |text: &str| TextEdit::new(text);
	let optional = |text: &Option<String>| TextEdit::new(text.as_deref().unwrap_or_default());
	SkillTexts {
		body: edit(&skill.body),
		argument_hint: optional(&front.argument_hint),
		arguments: edit(&lines_of(front.arguments.as_ref())),
		name: edit(&skill.name),
		description: edit(&skill.description),
		when_to_use: optional(&front.when_to_use),
		paths: edit(&lines_of(front.paths.as_ref())),
		model: optional(&front.model),
		shell: optional(&front.shell),
		agent: optional(&front.agent),
		allowed_tools: edit(&lines_of(front.allowed_tools.as_ref())),
		disallowed_tools: edit(&lines_of(front.disallowed_tools.as_ref())),
		hooks: edit(&text_of(front.hooks.as_ref())),
		license: optional(&front.license),
		compatibility: edit(&text_of(front.compatibility.as_ref())),
		metadata: edit(&text_of(front.metadata.as_ref())),
	}
}

pub fn switches_of(skill: &Skill) -> Switches {
	let front = &skill.front;
	Switches {
		keep_from_agent: front
			.disable_model_invocation
			.unwrap_or(MODEL_INVOCATION_DISABLED_BY_DEFAULT),
		user_invocable: front.user_invocable.unwrap_or(USER_INVOCABLE_BY_DEFAULT),
		preloaded: skill.is_preloaded,
		background: front.background.unwrap_or(BACKGROUND_BY_DEFAULT),
	}
}

fn blank_skill() -> Skill {
	Skill {
		id: String::new(),
		name: String::new(),
		description: String::new(),
		body: String::new(),
		is_preloaded: false,
		is_system: false,
		files: Vec::new(),
		front: SkillFront::default(),
	}
}

impl Draft {
	pub fn opened(skill: Skill) -> Draft {
		Draft {
			texts: texts_of(&skill),
			switches: switches_of(&skill),
			kept: Some(skill),
			section: Section::Instructions,
			is_saving: false,
			file: None,
		}
	}

	pub fn blank() -> Draft {
		let blank = blank_skill();
		Draft {
			texts: texts_of(&blank),
			switches: switches_of(&blank),
			kept: None,
			section: Section::Instructions,
			is_saving: false,
			file: None,
		}
	}

	pub fn skill_id(&self) -> Option<&str> {
		self.kept.as_ref().map(|skill| skill.id.as_str())
	}

	pub fn is_unsaved(&self) -> bool {
		let kept = self.kept.clone().unwrap_or_else(blank_skill);
		let saved = texts_of(&kept);
		let is_edited =
			ALL_FIELDS.iter().any(|field| self.texts.get(*field).text != saved.get(*field).text);
		is_edited || self.switches != switches_of(&kept)
	}

	pub fn is_unsaved_anywhere(&self) -> bool {
		self.is_unsaved() || self.file.as_ref().is_some_and(OpenFile::is_unsaved)
	}

	pub fn effort(&self) -> Option<SkillEffort> {
		let effort = self.kept.as_ref().and_then(|skill| skill.front.effort.as_deref());
		SKILL_EFFORTS.iter().find(|(name, _)| Some(*name) == effort).map(|(_, effort)| *effort)
	}

	pub fn fork(&self) -> Option<bool> {
		let context = self.kept.as_ref().and_then(|skill| skill.front.context.as_deref());
		SKILL_CONTEXTS.iter().find(|(name, _)| Some(*name) == context).map(|(_, fork)| *fork)
	}

	pub fn toggled(&mut self, switch: SkillSwitch) {
		let switches = &mut self.switches;
		match switch {
			SkillSwitch::KeepFromAgent => switches.keep_from_agent = !switches.keep_from_agent,
			SkillSwitch::UserInvocable => switches.user_invocable = !switches.user_invocable,
			SkillSwitch::Background => switches.background = !switches.background,
			SkillSwitch::Preloaded => {}
		}
	}

	pub fn to_core(&self) -> SkillDraft {
		let texts = &self.texts;
		let text = |field: SkillField| texts.get(field).text.as_str();
		let kept = self.kept.as_ref().map(|skill| &skill.front);
		let kept_flag = |read: fn(&SkillFront) -> Option<bool>| kept.and_then(read);
		let kept_text = |read: fn(&SkillFront) -> Option<&str>| kept.and_then(read);
		SkillDraft {
			name: text(SkillField::Name).to_owned(),
			description: text(SkillField::Description).to_owned(),
			body: text(SkillField::Body).to_owned(),
			front: SkillFront {
				when_to_use: filled(text(SkillField::WhenToUse)),
				argument_hint: filled(text(SkillField::ArgumentHint)),
				arguments: list_of(text(SkillField::Arguments)),
				disable_model_invocation: flag(
					self.switches.keep_from_agent,
					kept_flag(|front| front.disable_model_invocation),
					MODEL_INVOCATION_DISABLED_BY_DEFAULT,
				),
				user_invocable: flag(
					self.switches.user_invocable,
					kept_flag(|front| front.user_invocable),
					USER_INVOCABLE_BY_DEFAULT,
				),
				allowed_tools: list_of(text(SkillField::AllowedTools)),
				disallowed_tools: list_of(text(SkillField::DisallowedTools)),
				model: filled(text(SkillField::Model)),
				effort: known_effort(kept_text(|front| front.effort.as_deref())).map(str::to_owned),
				context: known_context(kept_text(|front| front.context.as_deref()))
					.map(str::to_owned),
				agent: filled(text(SkillField::Agent)),
				background: flag(
					self.switches.background,
					kept_flag(|front| front.background),
					BACKGROUND_BY_DEFAULT,
				),
				hooks: value_of(text(SkillField::Hooks)),
				paths: list_of(text(SkillField::Paths)),
				shell: filled(text(SkillField::Shell)),
				metadata: value_of(text(SkillField::Metadata)),
				license: filled(text(SkillField::License)),
				compatibility: value_of(text(SkillField::Compatibility)),
			},
		}
	}

	pub fn saved(&mut self, skill: Skill) {
		self.texts = texts_of(&skill);
		self.switches = switches_of(&skill);
		self.kept = Some(skill);
		self.is_saving = false;
	}
}
