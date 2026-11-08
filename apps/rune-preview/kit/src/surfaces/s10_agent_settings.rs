use rune::{El, TextEdit};

use crate::strings::bots::{danger, dialog, history as history_copy, skills as skill_copy};
use crate::strings::{Key, Language};
use crate::tokens::Tokens;

pub mod agent;
pub mod history;
mod parts;
pub mod shell;
pub mod skills;

pub use parts::{Density, Picker, PickerOption, picker_menu};

pub trait Host: 'static {
	fn edit(&mut self, field: Field) -> &mut TextEdit;
	fn emit(&mut self, event: Event);
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum RuleList {
	Allow,
	Ask,
	Deny,
}

impl RuleList {
	pub const ALL: [RuleList; 3] = [RuleList::Allow, RuleList::Ask, RuleList::Deny];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Field {
	Name,
	Title,
	Instructions,
	Memory,
	Rule(RuleList),
	Skill(skills::SkillField),
	NewFile,
	FileText,
	HistorySearch,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
	Entry(shell::Entry),
	Back,
	Close,
	Dismiss,
	Hue(Option<f32>),
	AddPicture,
	RemovePicture,
	SaveMemory,
	ClearMemory,
	ConfirmClearMemory,
	OpenPicker(Picker),
	Pick(Picker, String),
	AddRule(RuleList),
	RemoveRule(RuleList, usize),
	Delete,
	ConfirmDelete,
	AddSkill,
	OpenSkill(String),
	SkillSection(skills::Section),
	ToggleSkill(skills::SkillSwitch),
	SaveSkill,
	DeleteSkill,
	ConfirmDeleteSkill,
	LeaveSkill,
	ConfirmLeaveSkill,
	OpenFile(String),
	CloseFile,
	AddFile,
	SaveFile,
	DeleteFile,
	ConfirmDeleteFile,
	OpenSearch,
	CloseSearch,
	OpenChange(String),
	Undo(String),
	ConfirmUndo,
	ChangeFile(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Confirm<'a> {
	ClearMemory,
	DeleteAgent(&'a str),
	DeleteSkill(&'a str),
	LeaveSkill,
	DeleteFile(&'a str),
	Undo(&'a str),
}

pub fn confirmation<S: Host>(t: &Tokens, confirm: Confirm) -> El {
	let (title, description, action, then) = match confirm {
		Confirm::ClearMemory => (
			say(dialog::memory::clear::TITLE).to_owned(),
			say(dialog::memory::clear::DESCRIPTION),
			say(dialog::memory::clear::CONFIRM),
			Event::ConfirmClearMemory,
		),
		Confirm::DeleteAgent(name) => (
			fill(danger::confirm::TITLE, &[("name", name)]),
			say(danger::DESCRIPTION),
			say(danger::DELETE),
			Event::ConfirmDelete,
		),
		Confirm::DeleteSkill(name) => (
			fill(skill_copy::delete::confirm::TITLE, &[("name", name)]),
			say(skill_copy::delete::DESCRIPTION),
			say(skill_copy::delete::ACTION),
			Event::ConfirmDeleteSkill,
		),
		Confirm::LeaveSkill => (
			say(skill_copy::leave::TITLE).to_owned(),
			say(skill_copy::leave::DESCRIPTION),
			say(skill_copy::leave::ACTION),
			Event::ConfirmLeaveSkill,
		),
		Confirm::DeleteFile(path) => (
			fill(skill_copy::files::delete::confirm::TITLE, &[("path", path)]),
			say(skill_copy::files::delete::DESCRIPTION),
			say(skill_copy::files::delete::ACTION),
			Event::ConfirmDeleteFile,
		),
		Confirm::Undo(title) => (
			fill(history_copy::undo::TITLE, &[("title", title)]),
			say(history_copy::undo::DESCRIPTION),
			say(history_copy::undo::CONFIRM),
			Event::ConfirmUndo,
		),
	};
	parts::confirm::<S>(t, &title, description, action, then)
}

fn say(key: Key) -> &'static str {
	key.text(Language::En)
}

fn fill(key: Key, values: &[(&str, &str)]) -> String {
	values.iter().fold(say(key).to_owned(), |copy, (name, value)| {
		copy.replace(&format!("{{{{{name}}}}}"), value)
	})
}

fn counted(one: Key, other: Key, count: usize, values: &[(&str, &str)]) -> String {
	let shown = count.to_string();
	let mut all = vec![("count", shown.as_str())];
	all.extend_from_slice(values);
	fill(if count == 1 { one } else { other }, &all)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::strings::bots;

	#[test]
	fn fill_replaces_every_named_value() {
		assert_eq!(fill(bots::danger::confirm::TITLE, &[("name", "Juniper")]), "Delete Juniper?");
	}

	#[test]
	fn counted_picks_the_singular_for_one() {
		let one = bots::history::RETOUCHES_ONE;
		let other = bots::history::RETOUCHES_OTHER;
		assert_eq!(counted(one, other, 1, &[]), "(1 go)");
		assert_eq!(counted(one, other, 4, &[]), "(4 goes)");
	}
}
