use rune::{El, TextEdit, col, row, text};

use super::agent::panel;
use super::parts::{
	Density, Lines, ListRow, PANEL_GAP, PANEL_INSET, Select, TextField, add_button, bar, button,
	empty, list, notice, outlined_skeleton_row, rule, skeleton_rows, switch_row, tag,
};
use super::shell::{RailItem, pushed};
use super::{Event, Field, Host, Picker, fill, say};
use crate::icons;
use crate::primitives::button::{Button, ButtonVariant};
use crate::primitives::skeleton::skeleton;
use crate::strings::bots::skills;
use crate::tokens::{RADIUS_CONTROL, SPACING, TEXT_SM_MEDIUM, TEXT_XS, Tokens};

pub const DESCRIPTION_LIMIT: usize = 1536;
const EDITOR_HEADER: f32 = SPACING * 14.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SkillField {
	Body,
	ArgumentHint,
	Arguments,
	Name,
	Description,
	WhenToUse,
	Paths,
	Model,
	Shell,
	Agent,
	AllowedTools,
	DisallowedTools,
	Hooks,
	License,
	Compatibility,
	Metadata,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SkillSwitch {
	KeepFromAgent,
	UserInvocable,
	Preloaded,
	Background,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Section {
	Instructions,
	Triggering,
	Execution,
	Tools,
	Files,
	Advanced,
}

impl Section {
	fn rail(self, current: Section) -> RailItem<'static> {
		let (glyphs, label) = match self {
			Section::Instructions => {
				((&icons::BOOK_OPEN, &icons::BOOK_OPEN_FILL), skills::section::INSTRUCTIONS)
			}
			Section::Triggering => {
				((&icons::SPARKLES, &icons::SPARKLES_FILL), skills::section::TRIGGERING)
			}
			Section::Execution => {
				((&icons::TERMINAL, &icons::TERMINAL_FILL), skills::section::EXECUTION)
			}
			Section::Tools => ((&icons::WRENCH, &icons::WRENCH_FILL), skills::section::TOOLS),
			Section::Files => ((&icons::FOLDER, &icons::FOLDER_FILL), skills::section::FILES),
			Section::Advanced => {
				((&icons::SETTINGS, &icons::SETTINGS_FILL), skills::section::ADVANCED)
			}
		};
		RailItem {
			glyphs,
			label: say(label),
			active: self == current,
			danger: false,
			event: Event::SkillSection(self),
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SkillItem<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub description: &'a str,
	pub preloaded: bool,
	pub system: bool,
}

pub fn skills_panel<S: Host>(t: &Tokens, density: Density, skills: Option<&[SkillItem]>) -> El {
	let Some(skills) = skills else {
		return skeleton_rows(
			Some(row().w_full().justify_end().child(bar(t, SPACING * 24.0, SPACING * 7.0))),
			|| {
				outlined_skeleton_row(
					t,
					density,
					vec![
						bar(t, SPACING * 32.0, SPACING * 3.5),
						bar(t, SPACING * 56.0, SPACING * 3.0),
					],
				)
			},
		);
	};
	if skills.is_empty() {
		return empty(
			t,
			&icons::SPARKLES,
			t.muted_foreground,
			Some(say(skills::empty::TITLE)),
			say(skills::empty::DESCRIPTION),
			Some(add_button::<S>(t, say(skills::ADD), ButtonVariant::Default, Event::AddSkill)),
		);
	}
	let rows = skills.iter().map(|skill| {
		let mut tags = Vec::new();
		if skill.system {
			tags.push(tag(t, say(skills::system::TAG), t.muted_foreground));
		}
		if skill.preloaded {
			tags.push(tag(t, say(skills::preloaded::TAG), t.foreground));
		}
		let name = if skill.name.trim().is_empty() { say(skills::UNTITLED) } else { skill.name };
		ListRow {
			key: format!("skill-{}", skill.id),
			glyph: None,
			title: name,
			description: (!skill.description.is_empty()).then_some(skill.description),
			tags,
			event: Event::OpenSkill(skill.id.to_owned()),
		}
		.view::<S>(t, density)
	});
	col()
		.w_full()
		.grow(1.0)
		.gap(PANEL_GAP)
		.child(row().w_full().justify_end().child(add_button::<S>(
			t,
			say(skills::ADD),
			ButtonVariant::Outline,
			Event::AddSkill,
		)))
		.child(list(rows))
}

pub struct SkillTexts {
	pub body: TextEdit,
	pub argument_hint: TextEdit,
	pub arguments: TextEdit,
	pub name: TextEdit,
	pub description: TextEdit,
	pub when_to_use: TextEdit,
	pub paths: TextEdit,
	pub model: TextEdit,
	pub shell: TextEdit,
	pub agent: TextEdit,
	pub allowed_tools: TextEdit,
	pub disallowed_tools: TextEdit,
	pub hooks: TextEdit,
	pub license: TextEdit,
	pub compatibility: TextEdit,
	pub metadata: TextEdit,
}

impl SkillTexts {
	pub fn get(&self, field: SkillField) -> &TextEdit {
		match field {
			SkillField::Body => &self.body,
			SkillField::ArgumentHint => &self.argument_hint,
			SkillField::Arguments => &self.arguments,
			SkillField::Name => &self.name,
			SkillField::Description => &self.description,
			SkillField::WhenToUse => &self.when_to_use,
			SkillField::Paths => &self.paths,
			SkillField::Model => &self.model,
			SkillField::Shell => &self.shell,
			SkillField::Agent => &self.agent,
			SkillField::AllowedTools => &self.allowed_tools,
			SkillField::DisallowedTools => &self.disallowed_tools,
			SkillField::Hooks => &self.hooks,
			SkillField::License => &self.license,
			SkillField::Compatibility => &self.compatibility,
			SkillField::Metadata => &self.metadata,
		}
	}

	pub fn get_mut(&mut self, field: SkillField) -> &mut TextEdit {
		match field {
			SkillField::Body => &mut self.body,
			SkillField::ArgumentHint => &mut self.argument_hint,
			SkillField::Arguments => &mut self.arguments,
			SkillField::Name => &mut self.name,
			SkillField::Description => &mut self.description,
			SkillField::WhenToUse => &mut self.when_to_use,
			SkillField::Paths => &mut self.paths,
			SkillField::Model => &mut self.model,
			SkillField::Shell => &mut self.shell,
			SkillField::Agent => &mut self.agent,
			SkillField::AllowedTools => &mut self.allowed_tools,
			SkillField::DisallowedTools => &mut self.disallowed_tools,
			SkillField::Hooks => &mut self.hooks,
			SkillField::License => &mut self.license,
			SkillField::Compatibility => &mut self.compatibility,
			SkillField::Metadata => &mut self.metadata,
		}
	}

	fn described(&self) -> usize {
		self.description.text.chars().count() + self.when_to_use.text.chars().count()
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SkillEffort {
	Low,
	Medium,
	High,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Switches {
	pub keep_from_agent: bool,
	pub user_invocable: bool,
	pub preloaded: bool,
	pub background: bool,
}

pub struct SkillEditor<'a> {
	pub texts: &'a SkillTexts,
	pub section: Section,
	pub written: bool,
	pub unsaved: bool,
	pub name_refused: bool,
	pub switches: Switches,
	pub effort: Option<SkillEffort>,
	pub fork: Option<bool>,
	pub files: Option<SkillFiles<'a>>,
}

impl SkillEditor<'_> {
	fn name(&self) -> &str {
		let name = self.texts.name.text.trim();
		if name.is_empty() { say(skills::UNTITLED) } else { name }
	}
}

fn text_field<'a>(
	texts: &'a SkillTexts,
	field: SkillField,
	label: crate::strings::Key,
) -> TextField<'a> {
	TextField::new(say(label), texts.get(field), Field::Skill(field))
}

fn editor_header<S: Host>(t: &Tokens, editor: &SkillEditor) -> El {
	let mut title =
		row().grow(1.0).gap(SPACING * 2.0).center_y().child(
			text(editor.name().to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).truncate(),
		);
	if editor.unsaved {
		title = title.child(tag(t, say(skills::UNSAVED), t.muted_foreground));
	}
	let mut actions = row().gap(SPACING * 2.0).center_y();
	if editor.written {
		actions = actions.child(button::<S>(
			t,
			Button::new(say(skills::delete::ACTION))
				.leading(&icons::BIN)
				.variant(ButtonVariant::Destructive),
			Event::DeleteSkill,
		));
	}
	let (save, glyph) = if editor.written {
		(say(skills::SAVE), &icons::CHECK)
	} else {
		(say(skills::CREATE), &icons::PLUS)
	};
	actions = actions.child(button::<S>(t, Button::new(save).leading(glyph), Event::SaveSkill));
	col().w_full().child(
		row()
			.w_full()
			.h(EDITOR_HEADER)
			.padding(SPACING * 3.0)
			.gap(SPACING * 2.0)
			.center_y()
			.child(title)
			.child(actions),
	)
}

pub fn skill_editor<S: Host>(t: &Tokens, editor: &SkillEditor) -> El {
	let sections = [
		Section::Instructions,
		Section::Triggering,
		Section::Execution,
		Section::Tools,
		Section::Files,
		Section::Advanced,
	]
	.into_iter()
	.filter(|section| editor.files.is_some() || *section != Section::Files)
	.map(|section| section.rail(editor.section).view::<S>(t))
	.collect();
	let body = col()
		.w_full()
		.grow(1.0)
		.h_full()
		.child(editor_header::<S>(t, editor))
		.child(rule(t))
		.child(
			col()
				.w_full()
				.grow(1.0)
				.padding(PANEL_INSET)
				.gap(PANEL_GAP)
				.child(section_body::<S>(t, editor)),
		);
	pushed::<S>(t, say(skills::BACK), sections, body)
}

fn section_body<S: Host>(t: &Tokens, editor: &SkillEditor) -> El {
	let texts = editor.texts;
	let d = Density::Dialog;
	match editor.section {
		Section::Instructions => col()
			.w_full()
			.grow(1.0)
			.gap(PANEL_GAP)
			.child(
				text_field(texts, SkillField::Body, skills::body::LABEL)
					.placeholder(say(skills::body::PLACEHOLDER))
					.lines(Lines::Fill)
					.view::<S>(t, d),
			)
			.child(
				text_field(texts, SkillField::ArgumentHint, skills::argument_hint::LABEL)
					.placeholder(say(skills::argument_hint::PLACEHOLDER))
					.hint(say(skills::argument_hint::HINT))
					.view::<S>(t, d),
			)
			.child(
				text_field(texts, SkillField::Arguments, skills::arguments::LABEL)
					.placeholder(say(skills::arguments::PLACEHOLDER))
					.lines(Lines::Rows(2))
					.view::<S>(t, d),
			),
		Section::Triggering => triggering::<S>(t, editor),
		Section::Execution => execution::<S>(t, editor),
		Section::Tools => panel(
			PANEL_GAP,
			[
				text_field(texts, SkillField::AllowedTools, skills::allowed_tools::LABEL)
					.placeholder(say(skills::allowed_tools::PLACEHOLDER))
					.hint(say(skills::allowed_tools::HINT))
					.lines(Lines::Rows(3))
					.view::<S>(t, d),
				text_field(texts, SkillField::DisallowedTools, skills::disallowed_tools::LABEL)
					.placeholder(say(skills::disallowed_tools::PLACEHOLDER))
					.lines(Lines::Rows(3))
					.view::<S>(t, d),
				text_field(texts, SkillField::Hooks, skills::hooks::LABEL)
					.placeholder(say(skills::hooks::PLACEHOLDER))
					.hint(say(skills::hooks::HINT))
					.lines(Lines::Rows(5))
					.mono()
					.view::<S>(t, d),
			],
		),
		Section::Files => match &editor.files {
			Some(files) => files_panel::<S>(t, files),
			None => col(),
		},
		Section::Advanced => panel(
			PANEL_GAP,
			[
				text_field(texts, SkillField::License, skills::license::LABEL)
					.placeholder(say(skills::license::PLACEHOLDER))
					.view::<S>(t, d),
				text_field(texts, SkillField::Compatibility, skills::compatibility::LABEL)
					.placeholder(say(skills::compatibility::PLACEHOLDER))
					.hint(say(skills::compatibility::HINT))
					.view::<S>(t, d),
				text_field(texts, SkillField::Metadata, skills::metadata::LABEL)
					.placeholder(say(skills::metadata::PLACEHOLDER))
					.hint(say(skills::metadata::HINT))
					.lines(Lines::Rows(5))
					.mono()
					.view::<S>(t, d),
			],
		),
	}
}

fn triggering<S: Host>(t: &Tokens, editor: &SkillEditor) -> El {
	let texts = editor.texts;
	let d = Density::Dialog;
	let used = texts.described();
	let over = used.saturating_sub(DESCRIPTION_LIMIT);
	let over_copy = fill(skills::budget::OVER, &[("over", &over.to_string())]);
	let budget = fill(
		skills::budget::LABEL,
		&[("used", &used.to_string()), ("max", &DESCRIPTION_LIMIT.to_string())],
	);
	panel(
		PANEL_GAP,
		[
			text_field(texts, SkillField::Name, skills::name::LABEL)
				.placeholder(say(skills::name::PLACEHOLDER))
				.hint(say(skills::name::HINT))
				.error(editor.name_refused.then(|| say(skills::name::BLANK)))
				.view::<S>(t, d),
			text_field(texts, SkillField::Description, skills::description::LABEL)
				.placeholder(say(skills::description::PLACEHOLDER))
				.lines(Lines::Rows(2))
				.invalid(over > 0)
				.view::<S>(t, d),
			text_field(texts, SkillField::WhenToUse, skills::when_to_use::LABEL)
				.placeholder(say(skills::when_to_use::PLACEHOLDER))
				.hint(&budget)
				.error((over > 0).then_some(over_copy.as_str()))
				.lines(Lines::Rows(3))
				.view::<S>(t, d),
			switch_row::<S>(
				t,
				say(skills::model_invocation::LABEL),
				say(skills::model_invocation::DESCRIPTION),
				editor.switches.keep_from_agent,
				Event::ToggleSkill(SkillSwitch::KeepFromAgent),
			),
			switch_row::<S>(
				t,
				say(skills::user_invocable::LABEL),
				say(skills::user_invocable::DESCRIPTION),
				editor.switches.user_invocable,
				Event::ToggleSkill(SkillSwitch::UserInvocable),
			),
			text_field(texts, SkillField::Paths, skills::paths::LABEL)
				.placeholder(say(skills::paths::PLACEHOLDER))
				.hint(say(skills::paths::HINT))
				.lines(Lines::Rows(3))
				.view::<S>(t, d),
			switch_row::<S>(
				t,
				say(skills::preloaded::LABEL),
				say(skills::preloaded::DESCRIPTION),
				editor.switches.preloaded,
				Event::ToggleSkill(SkillSwitch::Preloaded),
			),
		],
	)
}

fn execution<S: Host>(t: &Tokens, editor: &SkillEditor) -> El {
	let texts = editor.texts;
	let d = Density::Dialog;
	let effort = editor.effort.map_or(say(skills::effort::DEFAULT), |effort| {
		say(match effort {
			SkillEffort::Low => skills::effort::option::LOW,
			SkillEffort::Medium => skills::effort::option::MEDIUM,
			SkillEffort::High => skills::effort::option::HIGH,
		})
	});
	let context = match editor.fork {
		None => say(skills::context::DEFAULT),
		Some(false) => say(skills::context::option::SHARED),
		Some(true) => say(skills::context::option::FORK),
	};
	let mut fields = vec![
		text_field(texts, SkillField::Model, skills::model::LABEL)
			.placeholder(say(skills::model::PLACEHOLDER))
			.hint(say(skills::model::HINT))
			.view::<S>(t, d),
		Select {
			label: say(skills::effort::LABEL),
			shown: Some(effort),
			placeholder: "",
			hint: None,
			disabled: false,
			picker: Picker::SkillEffort,
		}
		.view::<S>(t, d),
		Select {
			label: say(skills::context::LABEL),
			shown: Some(context),
			placeholder: "",
			hint: Some(say(skills::context::HINT)),
			disabled: false,
			picker: Picker::SkillContext,
		}
		.view::<S>(t, d),
		text_field(texts, SkillField::Shell, skills::shell::LABEL)
			.placeholder(say(skills::shell::PLACEHOLDER))
			.hint(say(skills::shell::HINT))
			.view::<S>(t, d),
	];
	if editor.fork == Some(true) {
		fields.push(
			text_field(texts, SkillField::Agent, skills::agent::LABEL)
				.placeholder(say(skills::agent::PLACEHOLDER))
				.hint(say(skills::agent::HINT))
				.view::<S>(t, d),
		);
		fields.push(switch_row::<S>(
			t,
			say(skills::background::LABEL),
			say(skills::background::DESCRIPTION),
			editor.switches.background,
			Event::ToggleSkill(SkillSwitch::Background),
		));
	}
	panel(PANEL_GAP, fields)
}

pub fn system_skill<S: Host>(t: &Tokens, texts: &SkillTexts) -> El {
	let name = texts.name.text.as_str();
	let header = row()
		.w_full()
		.padding(SPACING * 2.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(button::<S>(
			t,
			Button::new(say(skills::BACK)).leading(&icons::PREVIOUS).variant(ButtonVariant::Ghost),
			Event::Back,
		))
		.child(text(name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).grow(1.0).truncate())
		.child(tag(t, say(skills::system::TAG), t.muted_foreground));
	let d = Density::Dialog;
	col().w_full().grow(1.0).h_full().child(header).child(rule(t)).child(
		col()
			.w_full()
			.grow(1.0)
			.padding(PANEL_INSET)
			.gap(PANEL_GAP)
			.child(text(say(skills::system::NOTICE)).font(TEXT_XS).color(t.muted_foreground).wrap())
			.child(
				text_field(texts, SkillField::Name, skills::name::LABEL)
					.read_only()
					.view::<S>(t, d),
			)
			.child(
				text_field(texts, SkillField::Description, skills::description::LABEL)
					.read_only()
					.lines(Lines::Rows(2))
					.view::<S>(t, d),
			)
			.child(
				text_field(texts, SkillField::Body, skills::body::LABEL)
					.read_only()
					.lines(Lines::Fill)
					.view::<S>(t, d),
			),
	)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileFailure {
	Read,
	Write,
	Delete,
}

impl FileFailure {
	fn copy(self) -> &'static str {
		say(match self {
			FileFailure::Read => skills::files::failure::READ,
			FileFailure::Write => skills::files::failure::WRITE,
			FileFailure::Delete => skills::files::failure::DELETE,
		})
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PathRefusal {
	Blank,
	Taken,
}

pub struct OpenedFile<'a> {
	pub path: &'a str,
	pub text: Option<&'a TextEdit>,
	pub failure: Option<FileFailure>,
	pub unsaved: bool,
}

pub struct SkillFiles<'a> {
	pub paths: Option<&'a [&'a str]>,
	pub opened: Option<OpenedFile<'a>>,
	pub new_path: &'a TextEdit,
	pub refusal: Option<PathRefusal>,
}

fn file_header<S: Host>(t: &Tokens, path: &str, actions: Vec<El>) -> El {
	row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.child(button::<S>(
			t,
			Button::new(say(skills::files::BACK))
				.leading(&icons::PREVIOUS)
				.variant(ButtonVariant::Ghost),
			Event::CloseFile,
		))
		.child(text(path.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).grow(1.0).truncate())
		.children(actions)
}

pub fn files_panel<S: Host>(t: &Tokens, files: &SkillFiles) -> El {
	let d = Density::Dialog;
	if let Some(opened) = &files.opened {
		return opened_file::<S>(t, opened);
	}
	let Some(paths) = files.paths else {
		return skeleton_rows(None, || {
			outlined_skeleton_row(t, d, vec![bar(t, SPACING * 48.0, SPACING * 3.5)])
		});
	};
	let refusal = files.refusal.map(|refusal| match refusal {
		PathRefusal::Blank => say(skills::files::add::BLANK),
		PathRefusal::Taken => say(skills::files::add::TAKEN),
	});
	let add = col()
		.w_full()
		.gap(SPACING * 2.0)
		.child(
			TextField::new(say(skills::files::add::LABEL), files.new_path, Field::NewFile)
				.placeholder(say(skills::files::add::PLACEHOLDER))
				.hint(say(skills::files::add::HINT))
				.error(refusal)
				.view::<S>(t, d),
		)
		.child(row().w_full().justify_end().child(add_button::<S>(
			t,
			say(skills::files::add::ACTION),
			ButtonVariant::Outline,
			Event::AddFile,
		)));
	let rows = paths.iter().map(|path| {
		ListRow {
			key: format!("skill-file-{path}"),
			glyph: Some(&icons::FILE),
			title: path,
			description: None,
			tags: Vec::new(),
			event: Event::OpenFile((*path).to_owned()),
		}
		.view::<S>(t, d)
	});
	col()
		.w_full()
		.grow(1.0)
		.gap(PANEL_GAP)
		.child(add)
		.children((!paths.is_empty()).then(|| list(rows)))
}

fn opened_file<S: Host>(t: &Tokens, opened: &OpenedFile) -> El {
	let Some(edit) = opened.text else {
		let body = match opened.failure {
			Some(failure) => notice::<S>(
				t,
				failure.copy(),
				Some((say(skills::files::RETRY), Event::OpenFile(opened.path.to_owned()))),
			),
			None => col()
				.w_full()
				.grow(1.0)
				.h_full()
				.gap(SPACING * 1.5)
				.a11y_hidden()
				.child(bar(t, SPACING * 16.0, SPACING * 3.0))
				.child(skeleton(t).w_full().grow(1.0).radius(RADIUS_CONTROL)),
		};
		return col()
			.w_full()
			.grow(1.0)
			.gap(PANEL_GAP)
			.child(file_header::<S>(t, opened.path, Vec::new()))
			.child(body);
	};
	let mut actions = Vec::new();
	if opened.unsaved {
		actions.push(tag(t, say(skills::UNSAVED), t.muted_foreground));
	}
	actions.push(button::<S>(
		t,
		Button::new(say(skills::files::delete::ACTION))
			.leading(&icons::BIN)
			.variant(ButtonVariant::Destructive),
		Event::DeleteFile,
	));
	actions.push(button::<S>(
		t,
		Button::new(say(skills::files::SAVE)).leading(&icons::CHECK),
		Event::SaveFile,
	));
	col()
		.w_full()
		.grow(1.0)
		.gap(PANEL_GAP)
		.child(file_header::<S>(t, opened.path, actions))
		.children(
			opened
				.failure
				.filter(|failure| *failure != FileFailure::Read)
				.map(|failure| notice::<S>(t, failure.copy(), None)),
		)
		.child(
			TextField::new(say(skills::files::text::LABEL), edit, Field::FileText)
				.placeholder(say(skills::files::text::PLACEHOLDER))
				.lines(Lines::Fill)
				.view::<S>(t, Density::Dialog),
		)
}
