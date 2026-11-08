mod agent;
mod heard;
mod history;
mod skills;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use kiroshi_core::agent::contract::OfferedModel;
use kiroshi_core::conversations::contract::{
	Bot, BotChangedFile, BotHistoryEntry, BotIdentity, Skill,
};
use rune::{TextEdit, Waker};

use kiroshi_rune_kit::strings::bots::{roster, runtime, spaces};
use kiroshi_rune_kit::strings::{Key, Language};
use kiroshi_rune_kit::surfaces::s10_agent_settings::shell::Entry;
use kiroshi_rune_kit::surfaces::s10_agent_settings::skills::FileFailure;
use kiroshi_rune_kit::surfaces::s10_agent_settings::{Event, Field, Host, Picker};

use crate::app::{App, Workspace};
use crate::host::HostError;
use crate::navigation::Route;
use crate::source::Source;

pub use heard::{Heard, heard_of};
pub use view::{layers, view};
pub use worker::Membership;

use agent::{Fields, hue_from};
use history::Run;
use skills::{Draft, OpenFile};
use worker::{Answer, Call, Range, Worker};

const LAST_SPACE_REFUSAL: &str = "lastSpaceOfBot";

#[derive(Default)]
pub enum Read<T> {
	#[default]
	Unread,
	Loading,
	Failed,
	Loaded(T),
}

impl<T> Read<T> {
	pub fn loaded(&self) -> Option<&T> {
		match self {
			Read::Loaded(value) => Some(value),
			Read::Unread | Read::Loading | Read::Failed => None,
		}
	}

	fn loaded_mut(&mut self) -> Option<&mut T> {
		match self {
			Read::Loaded(value) => Some(value),
			Read::Unread | Read::Loading | Read::Failed => None,
		}
	}

	fn rereading(&mut self) {
		if !matches!(self, Read::Loaded(_)) {
			*self = Read::Loading;
		}
	}

	fn refused(&mut self) {
		if !matches!(self, Read::Loaded(_)) {
			*self = Read::Failed;
		}
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
	pub title: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Leaving {
	Dialog,
	Editor,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum Confirming {
	Leave(Leaving),
	Undo(String),
}

struct Change {
	range: Range,
	files: Read<Vec<BotChangedFile>>,
	chosen: Option<String>,
}

struct Open {
	bot_id: String,
	space_id: String,
	entry: Entry,
	agent: Read<Box<Fields>>,
	picking: Option<Picker>,
	skills: Read<Vec<Skill>>,
	draft: Option<Draft>,
	history: Read<Vec<BotHistoryEntry>>,
	search: Option<TextEdit>,
	change: Option<Change>,
	spaces: Read<Vec<Membership>>,
	confirming: Option<Confirming>,
	notice: Option<Notice>,
}

enum Outcome {
	Stay(Vec<Call>),
	Close,
}

#[derive(Default)]
pub struct State {
	open: Option<Open>,
	models: Read<Vec<OfferedModel>>,
	landed: Vec<Bot>,
	spare: TextEdit,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

fn said(key: Key) -> String {
	key.text(Language::En).to_owned()
}

fn notice_of(key: Key) -> Option<Notice> {
	Some(Notice { title: said(key) })
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn removal_refusal(failure: &HostError) -> Key {
	if failure.detail().contains(LAST_SPACE_REFUSAL) {
		spaces::remove::LAST_SPACE
	} else {
		spaces::remove::FAILED
	}
}

fn run_of(entries: &[BotHistoryEntry], id: &str) -> Option<Run> {
	history::runs_of(entries).into_iter().find(|run: &Run| run.id == id)
}

fn range_of(run: &Run) -> Range {
	Range { oldest: run.oldest_id.clone(), newest: run.id.clone() }
}

impl Open {
	fn new(space_id: &str, bot_id: &str) -> Open {
		Open {
			bot_id: bot_id.to_owned(),
			space_id: space_id.to_owned(),
			entry: Entry::General,
			agent: Read::Loading,
			picking: None,
			skills: Read::Unread,
			draft: None,
			history: Read::Unread,
			search: None,
			change: None,
			spaces: Read::Loading,
			confirming: None,
			notice: None,
		}
	}

	fn read_agent(&self) -> Call {
		Call::ReadAgent { space_id: self.space_id.clone(), bot_id: self.bot_id.clone() }
	}

	fn read_skills(&mut self) -> Call {
		self.skills.rereading();
		Call::ReadSkills { bot_id: self.bot_id.clone() }
	}

	fn read_history(&mut self) -> Call {
		self.history.rereading();
		Call::ReadHistory { bot_id: self.bot_id.clone() }
	}

	fn read_panel(&mut self) -> Vec<Call> {
		match self.entry {
			Entry::Skills => vec![self.read_skills()],
			Entry::History => vec![self.read_history()],
			_ => Vec::new(),
		}
	}

	fn described(&mut self, change: impl FnOnce(&mut BotIdentity)) -> Vec<Call> {
		let Some(fields) = self.agent.loaded_mut() else { return Vec::new() };
		let identity = fields.write(change);
		vec![Call::Describe { bot_id: self.bot_id.clone(), identity: Box::new(identity) }]
	}

	fn is_unsaved(&self) -> bool {
		self.draft.as_ref().is_some_and(Draft::is_unsaved_anywhere)
	}

	fn leave_editor(&mut self) {
		if self.is_unsaved() {
			self.confirming = Some(Confirming::Leave(Leaving::Editor));
		} else {
			self.draft = None;
		}
	}

	fn run(&self, id: &str) -> Option<Run> {
		run_of(self.history.loaded()?, id)
	}

	fn handled(&mut self, event: Event) -> Outcome {
		let calls = match event {
			Event::Entry(entry) => {
				self.entry = entry;
				self.picking = None;
				self.change = None;
				self.read_panel()
			}
			Event::Close if self.is_unsaved() => {
				self.confirming = Some(Confirming::Leave(Leaving::Dialog));
				Vec::new()
			}
			Event::Close => return Outcome::Close,
			Event::Back if self.change.is_some() => {
				self.change = None;
				Vec::new()
			}
			Event::Back if self.draft.is_some() => {
				self.leave_editor();
				Vec::new()
			}
			Event::Back => return Outcome::Close,
			Event::LeaveSkill => {
				self.leave_editor();
				Vec::new()
			}
			Event::Dismiss => {
				self.confirming = None;
				self.picking = None;
				Vec::new()
			}
			Event::ConfirmLeaveSkill => match self.confirming.take() {
				Some(Confirming::Leave(Leaving::Dialog)) => return Outcome::Close,
				Some(Confirming::Leave(Leaving::Editor)) => {
					self.draft = None;
					Vec::new()
				}
				other => {
					self.confirming = other;
					Vec::new()
				}
			},
			Event::Hue(hue) => self.described(|identity| identity.avatar_blot = hue_from(hue)),
			Event::RemovePicture => self.described(|identity| identity.avatar_image_path = None),
			Event::OpenPicker(picker) => {
				self.picking = (self.picking != Some(picker)).then_some(picker);
				Vec::new()
			}
			Event::Pick(Picker::Model, model) => {
				self.picking = None;
				self.described(|identity| identity.model = model)
			}
			Event::Pick(_, _) => {
				self.picking = None;
				Vec::new()
			}
			Event::AddSkill => {
				self.draft = Some(Draft::blank());
				Vec::new()
			}
			Event::OpenSkill(id) => {
				let skill = self
					.skills
					.loaded()
					.and_then(|skills| skills.iter().find(|skill| skill.id == id));
				self.draft = skill.cloned().map(Draft::opened);
				Vec::new()
			}
			Event::SkillSection(section) => {
				if let Some(draft) = self.draft.as_mut() {
					draft.section = section;
				}
				Vec::new()
			}
			Event::ToggleSkill(switch) => {
				if let Some(draft) = self.draft.as_mut() {
					draft.toggled(switch);
				}
				Vec::new()
			}
			Event::SaveSkill => self.save_skill(),
			Event::OpenFile(path) => self.open_file(path),
			Event::CloseFile => {
				if let Some(draft) = self.draft.as_mut() {
					draft.file = None;
				}
				Vec::new()
			}
			Event::SaveFile => self.save_file(),
			Event::OpenSearch => {
				self.search = Some(TextEdit::new(""));
				Vec::new()
			}
			Event::CloseSearch => {
				self.search = None;
				Vec::new()
			}
			Event::OpenChange(id) => self.open_change(&id),
			Event::ChangeFile(path) => {
				if let Some(change) = self.change.as_mut() {
					change.chosen = Some(path);
				}
				Vec::new()
			}
			Event::Undo(id) => {
				self.confirming = Some(Confirming::Undo(id));
				Vec::new()
			}
			Event::ConfirmUndo => self.undo(),
			Event::AddPicture
			| Event::SaveMemory
			| Event::ClearMemory
			| Event::ConfirmClearMemory
			| Event::AddRule(_)
			| Event::RemoveRule(_, _)
			| Event::Delete
			| Event::ConfirmDelete
			| Event::DeleteSkill
			| Event::ConfirmDeleteSkill
			| Event::AddFile
			| Event::DeleteFile
			| Event::ConfirmDeleteFile => Vec::new(),
		};
		Outcome::Stay(calls)
	}

	fn save_skill(&mut self) -> Vec<Call> {
		let Some(draft) = self.draft.as_mut().filter(|draft| !draft.is_saving) else {
			return Vec::new();
		};
		draft.is_saving = true;
		vec![Call::SaveSkill {
			bot_id: self.bot_id.clone(),
			skill_id: draft.skill_id().map(str::to_owned),
			draft: Box::new(draft.to_core()),
		}]
	}

	fn open_file(&mut self, path: String) -> Vec<Call> {
		let Some(draft) = self.draft.as_mut() else { return Vec::new() };
		let Some(skill_id) = draft.skill_id().map(str::to_owned) else { return Vec::new() };
		draft.file = Some(OpenFile::reading(path.clone()));
		vec![Call::ReadFile { bot_id: self.bot_id.clone(), skill_id, path }]
	}

	fn save_file(&mut self) -> Vec<Call> {
		let Some(draft) = self.draft.as_ref() else { return Vec::new() };
		let Some(skill_id) = draft.skill_id() else { return Vec::new() };
		let Some(file) = draft.file.as_ref() else { return Vec::new() };
		let Some(text) = file.text.as_ref() else { return Vec::new() };
		vec![Call::WriteFile {
			bot_id: self.bot_id.clone(),
			skill_id: skill_id.to_owned(),
			path: file.path.clone(),
			text: text.text.clone(),
		}]
	}

	fn open_change(&mut self, id: &str) -> Vec<Call> {
		let Some(run) = self.run(id) else { return Vec::new() };
		let range = range_of(&run);
		self.change = Some(Change { range: range.clone(), files: Read::Loading, chosen: None });
		vec![Call::ReadChange { bot_id: self.bot_id.clone(), range }]
	}

	fn undo(&mut self) -> Vec<Call> {
		let Some(Confirming::Undo(id)) = self.confirming.take() else { return Vec::new() };
		let Some(run) = self.run(&id) else { return Vec::new() };
		vec![Call::Undo { bot_id: self.bot_id.clone(), range: range_of(&run) }]
	}

	fn edit(&mut self, field: Field) -> Option<&mut TextEdit> {
		match field {
			Field::Name | Field::Title => {
				let fields = self.agent.loaded_mut()?;
				fields.is_edited = true;
				Some(if field == Field::Name { &mut fields.name } else { &mut fields.title })
			}
			Field::Skill(skill_field) => Some(self.draft.as_mut()?.texts.get_mut(skill_field)),
			Field::FileText => self.draft.as_mut()?.file.as_mut()?.text.as_mut(),
			Field::HistorySearch => self.search.as_mut(),
			Field::Instructions | Field::Memory | Field::Rule(_) | Field::NewFile => None,
		}
	}

	fn due_text_write(&mut self) -> Option<Call> {
		let identity = self.agent.loaded_mut()?.due_text_write()?;
		Some(Call::Describe { bot_id: self.bot_id.clone(), identity: Box::new(identity) })
	}

	fn agent_read(&mut self, bots: Result<Vec<Bot>, HostError>) -> Option<Bot> {
		let found = match bots {
			Ok(bots) => bots.into_iter().find(|bot| bot.id == self.bot_id),
			Err(failure) => {
				eprintln!("the agent settings were not read: {}", failure_text(&failure));
				None
			}
		};
		let Some(bot) = found else {
			self.agent.refused();
			if matches!(self.agent, Read::Failed) {
				self.notice = notice_of(roster::FAILED);
			}
			return None;
		};
		match self.agent.loaded_mut() {
			Some(fields) => fields.heard(bot.clone()),
			None => self.agent = Read::Loaded(Box::new(Fields::new(bot.clone()))),
		}
		Some(bot)
	}

	fn described_answer(&mut self, written: Result<Bot, HostError>) -> Option<Bot> {
		let fields = self.agent.loaded_mut()?;
		match written {
			Ok(bot) => {
				fields.written(bot.clone());
				Some(bot)
			}
			Err(failure) => {
				eprintln!("the agent settings were not saved: {}", failure_text(&failure));
				fields.refused();
				self.notice = notice_of(roster::SETTINGS_UNSAVED);
				None
			}
		}
	}

	fn shared_answer(&mut self, space_id: &str, is_shared: bool, outcome: Result<(), HostError>) {
		let Err(failure) = outcome else { return };
		eprintln!("the agent's spaces were not changed: {}", failure_text(&failure));
		let membership = self
			.spaces
			.loaded_mut()
			.and_then(|spaces| spaces.iter_mut().find(|held| held.space.id == space_id));
		if let Some(membership) = membership {
			membership.is_shared = !is_shared;
		}
		let title = if is_shared { roster::SETTINGS_UNSAVED } else { removal_refusal(&failure) };
		self.notice = notice_of(title);
	}

	fn skills_answer(&mut self, skills: Result<Vec<Skill>, HostError>) {
		match skills {
			Ok(skills) => self.skills = Read::Loaded(skills),
			Err(failure) => {
				eprintln!("the agent's skills were not read: {}", failure_text(&failure));
				self.skills.refused();
				self.notice = notice_of(roster::SETTINGS_UNSAVED);
			}
		}
	}

	fn skill_saved(
		&mut self,
		skill_id: Option<String>,
		saved: Result<Skill, HostError>,
	) -> Vec<Call> {
		let draft =
			self.draft.as_mut().filter(|draft| draft.skill_id().map(str::to_owned) == skill_id);
		match saved {
			Ok(skill) => {
				if let Some(draft) = draft {
					draft.saved(skill);
				}
				vec![self.read_skills()]
			}
			Err(failure) => {
				eprintln!("the skill was not saved: {}", failure_text(&failure));
				if let Some(draft) = draft {
					draft.is_saving = false;
				}
				self.notice = notice_of(roster::SETTINGS_UNSAVED);
				Vec::new()
			}
		}
	}

	fn open_file_at(&mut self, skill_id: &str, path: &str) -> Option<&mut OpenFile> {
		let draft = self.draft.as_mut().filter(|draft| draft.skill_id() == Some(skill_id))?;
		draft.file.as_mut().filter(|file| file.path == path)
	}

	fn file_read(&mut self, skill_id: &str, path: &str, text: Result<String, HostError>) {
		let Some(file) = self.open_file_at(skill_id, path) else { return };
		match text {
			Ok(text) => file.read(text),
			Err(failure) => {
				eprintln!("the skill file was not read: {}", failure_text(&failure));
				file.failure = Some(FileFailure::Read);
			}
		}
	}

	fn file_written(&mut self, skill_id: &str, path: &str, outcome: Result<(), HostError>) {
		let Some(file) = self.open_file_at(skill_id, path) else { return };
		match outcome {
			Ok(()) => {
				file.saved = file.text.as_ref().map(|text| text.text.clone());
				file.failure = None;
			}
			Err(failure) => {
				eprintln!("the skill file was not saved: {}", failure_text(&failure));
				file.failure = Some(FileFailure::Write);
			}
		}
	}

	fn history_answer(&mut self, entries: Result<Vec<BotHistoryEntry>, HostError>) {
		match entries {
			Ok(entries) => self.history = Read::Loaded(entries),
			Err(failure) => {
				eprintln!("the agent's history was not read: {}", failure_text(&failure));
				self.history.refused();
			}
		}
	}

	fn change_answer(&mut self, newest: &str, files: Result<Vec<BotChangedFile>, HostError>) {
		let Some(change) = self.change.as_mut().filter(|change| change.range.newest == newest)
		else {
			return;
		};
		change.files = match files {
			Ok(files) => Read::Loaded(files),
			Err(failure) => {
				eprintln!("the files of a change were not read: {}", failure_text(&failure));
				Read::Failed
			}
		};
	}

	fn undone(&mut self, entries: Result<Vec<BotHistoryEntry>, HostError>) -> Vec<Call> {
		match entries {
			Ok(entries) => {
				self.history = Read::Loaded(entries);
				let skills = self.read_skills();
				vec![skills, self.read_agent()]
			}
			Err(failure) => {
				eprintln!("the change was not undone: {}", failure_text(&failure));
				self.notice = notice_of(roster::SETTINGS_UNSAVED);
				Vec::new()
			}
		}
	}

	fn heard_update(&mut self, bot: Bot) -> Vec<Call> {
		if let Some(fields) = self.agent.loaded_mut() {
			fields.heard(bot);
		}
		self.read_panel()
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
	}

	pub fn is_open(&self) -> bool {
		self.open.is_some()
	}

	pub fn open(&mut self, space_id: &str, bot_id: &str) {
		let open = Open::new(space_id, bot_id);
		self.queued.push(open.read_agent());
		self.queued.push(Call::ReadSpaces { bot_id: bot_id.to_owned() });
		if !matches!(self.models, Read::Loaded(_) | Read::Loading) {
			self.models = Read::Loading;
			self.queued.push(Call::ReadModels);
		}
		self.open = Some(open);
		self.flush();
	}

	pub fn close(&mut self) {
		self.open = None;
	}

	pub fn spaces(&self) -> Option<&[Membership]> {
		self.open.as_ref()?.spaces.loaded().map(Vec::as_slice)
	}

	pub fn share(&mut self, space_id: &str) {
		let Some(open) = self.open.as_mut() else { return };
		let Some(spaces) = open.spaces.loaded_mut() else { return };
		let Some(membership) = spaces.iter_mut().find(|held| held.space.id == space_id) else {
			return;
		};
		membership.is_shared = !membership.is_shared;
		let call = Call::Share {
			bot_id: open.bot_id.clone(),
			space_id: space_id.to_owned(),
			is_shared: membership.is_shared,
		};
		self.queued.push(call);
		self.flush();
	}

	pub fn handle(&mut self, event: Event) {
		let Some(open) = self.open.as_mut() else { return };
		match open.handled(event) {
			Outcome::Stay(calls) => self.queued.extend(calls),
			Outcome::Close => self.open = None,
		}
		self.flush();
	}

	pub fn edit(&mut self, field: Field) -> &mut TextEdit {
		match self.open.as_mut().and_then(|open| open.edit(field)) {
			Some(edit) => edit,
			None => &mut self.spare,
		}
	}

	pub fn poll(&mut self) -> bool {
		let answers = self.worker.as_ref().map(Worker::answers).unwrap_or_default();
		let is_changed = !answers.is_empty();
		for answer in answers {
			self.answered(answer);
		}
		let due = self.open.as_mut().and_then(Open::due_text_write);
		self.queued.extend(due);
		self.flush();
		is_changed
	}

	pub fn heard(&mut self, heard: Heard) {
		match heard {
			Heard::Updated(bot) => {
				let open = self.open.as_mut().filter(|open| open.bot_id == bot.id);
				let calls = open.map(|open| open.heard_update((*bot).clone())).unwrap_or_default();
				self.queued.extend(calls);
				self.landed.push(*bot);
			}
			Heard::Deleted { id } => {
				if self.open.as_ref().is_some_and(|open| open.bot_id == id) {
					self.open = None;
				}
			}
		}
		self.flush();
	}

	fn answered(&mut self, answer: Answer) {
		if let Answer::Models(models) = answer {
			self.models_answer(models);
			return;
		}
		let Some(open) = self.open.as_mut().filter(|open| open.bot_id == bot_of(&answer)) else {
			return;
		};
		let calls = match answer {
			Answer::Models(_) => Vec::new(),
			Answer::Agent { bots, .. } => {
				self.landed.extend(open.agent_read(bots));
				Vec::new()
			}
			Answer::Described { written, .. } => {
				self.landed.extend(open.described_answer(written));
				Vec::new()
			}
			Answer::Spaces { memberships, .. } => {
				match memberships {
					Ok(memberships) => open.spaces = Read::Loaded(memberships),
					Err(failure) => {
						eprintln!("the agent's spaces were not read: {}", failure_text(&failure));
						open.spaces = Read::Failed;
					}
				}
				Vec::new()
			}
			Answer::Shared { space_id, is_shared, outcome, .. } => {
				open.shared_answer(&space_id, is_shared, outcome);
				Vec::new()
			}
			Answer::Skills { skills, .. } => {
				open.skills_answer(skills);
				Vec::new()
			}
			Answer::SkillSaved { skill_id, saved, .. } => open.skill_saved(skill_id, saved),
			Answer::File { skill_id, path, text, .. } => {
				open.file_read(&skill_id, &path, text);
				Vec::new()
			}
			Answer::FileWritten { skill_id, path, outcome, .. } => {
				open.file_written(&skill_id, &path, outcome);
				Vec::new()
			}
			Answer::History { entries, .. } => {
				open.history_answer(entries);
				Vec::new()
			}
			Answer::Change { newest, files, .. } => {
				open.change_answer(&newest, files);
				Vec::new()
			}
			Answer::Undone { entries, .. } => open.undone(entries),
		};
		self.queued.extend(calls);
	}

	fn models_answer(&mut self, models: Result<Vec<OfferedModel>, HostError>) {
		match models {
			Ok(models) => self.models = Read::Loaded(models),
			Err(failure) => {
				eprintln!("the model catalogue was not read: {}", failure_text(&failure));
				self.models = Read::Failed;
				if let Some(open) = self.open.as_mut() {
					open.notice = notice_of(runtime::model::UNREADABLE);
				}
			}
		}
	}

	fn flush(&mut self) {
		if self.worker.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.worker = Worker::spawn(source.clone(), waker.clone());
		}
		let Some(worker) = self.worker.as_ref() else { return };
		for call in self.queued.drain(..) {
			worker.send(call);
		}
	}
}

fn bot_of(answer: &Answer) -> &str {
	match answer {
		Answer::Models(_) => "",
		Answer::Agent { bot_id, .. }
		| Answer::Described { bot_id, .. }
		| Answer::Spaces { bot_id, .. }
		| Answer::Shared { bot_id, .. }
		| Answer::Skills { bot_id, .. }
		| Answer::SkillSaved { bot_id, .. }
		| Answer::File { bot_id, .. }
		| Answer::FileWritten { bot_id, .. }
		| Answer::History { bot_id, .. }
		| Answer::Change { bot_id, .. }
		| Answer::Undone { bot_id, .. } => bot_id,
	}
}

fn shown_in_roster(app: &mut App, bot: &Bot) {
	let Workspace::Ready(ready) = &mut app.workspace else { return };
	let Some(agent) = ready.agents.iter_mut().find(|agent| agent.id == bot.id) else { return };
	agent.name = bot.name.clone();
	agent.title = bot.title.clone();
	agent.avatar_blot = agent::hue_value(bot.avatar_blot);
}

fn landed_in_roster(app: &mut App) {
	let landed = std::mem::take(&mut app.surfaces.s10_agent_settings.landed);
	for bot in &landed {
		shown_in_roster(app, bot);
	}
}

pub fn open_agent_settings(app: &mut App, bot_id: &str) {
	let Some(ready) = app.ready() else { return };
	let (source, space_id) = (ready.source.clone(), ready.space.id.clone());
	let settings = &mut app.surfaces.s10_agent_settings;
	settings.use_source(source);
	settings.open(&space_id, bot_id);
	app.navigation.navigate_main(Route::AgentSettings);
}

fn left_when_closed(app: &mut App) {
	let is_shown = app.navigation.main_route() == Route::AgentSettings;
	if is_shown && !app.surfaces.s10_agent_settings.is_open() {
		app.navigation.navigate_main(Route::Conversations);
	}
}

pub fn poll(app: &mut App) -> bool {
	let is_changed = app.surfaces.s10_agent_settings.poll();
	landed_in_roster(app);
	is_changed
}

pub fn heard(app: &mut App, heard: Heard) {
	app.surfaces.s10_agent_settings.heard(heard);
	landed_in_roster(app);
	left_when_closed(app);
}

impl Host for App {
	fn edit(&mut self, field: Field) -> &mut TextEdit {
		self.surfaces.s10_agent_settings.edit(field)
	}

	fn emit(&mut self, event: Event) {
		self.surfaces.s10_agent_settings.handle(event);
		left_when_closed(self);
	}
}
