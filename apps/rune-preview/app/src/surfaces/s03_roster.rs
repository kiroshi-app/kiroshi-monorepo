mod heard;
mod listing;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use std::collections::{HashMap, HashSet};

use kiroshi_core::conversations::contract::{
	Bot, Chat, ConversationInPage, ConversationPage, Hue, LastWord,
};
use kiroshi_core::sections::contract::RosterPin;
use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s03_roster::RosterEvent;
use kiroshi_rune_kit::surfaces::s04_boot::notice::SurfaceEvent;
use rune::{TextEdit, Waker};

use crate::app::{App, Workspace};
use crate::host::HostError;
use crate::model::{self, Message};
use crate::source::Source;
use crate::surfaces::s10_agent_settings;

use listing::{Listing, pinned_last, without_pin};
use worker::{Answer, Call, Worker, Write};

pub use heard::{Heard, heard_of};
pub use view::{layers, view};

const LANGUAGE: Language = Language::En;

const END_MARGIN: f32 = 120.0;

const MORE_UNREAD: &str = "Couldn't read more of your roster. Scroll to the end again to retry.";

const REFRESH_UNREAD: &str = "Couldn't refresh your roster, so it shows what was read before. Open the Space again to retry.";

const OPEN_REFUSED: &str = "Couldn't open {name}. Select it again to retry.";

const PINS_UNSAVED: &str =
	"Couldn't save the order of your roster. It's back as it was: make the change again to retry.";

const SECTION_UNSAVED: &str =
	"Couldn't save this section. It's back as it was: make the change again to retry.";

const MOVE_UNSAVED: &str = "Couldn't move {name}. It's back where it was: move it again to retry.";

const SHARE_UNSAVED: &str = "Couldn't share {name} with that Space. Share it again to retry.";

const UNSHARE_UNSAVED: &str = "Couldn't remove {name} from that Space. Remove it again to retry.";

pub enum Load {
	Loading,
	Failed(HostError),
	Shown(Listing),
}

#[derive(Clone, Debug, PartialEq)]
struct Notice {
	title: String,
	description: Option<String>,
}

#[derive(Default)]
pub struct State {
	rosters: HashMap<String, Load>,
	loading: HashSet<String>,
	shown: Option<String>,
	reading_more: Option<String>,
	opening: Option<String>,
	renaming: Option<String>,
	name_edit: TextEdit,
	viewport: [f32; 4],
	content: [f32; 4],
	notices: Vec<Notice>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

fn named(line: &str, name: &str) -> String {
	line.replace("{name}", name)
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn hue_value(hue: Option<Hue>) -> Option<f32> {
	hue.map(|hue| f32::from(hue.value()))
}

fn bottom_of(rect: [f32; 4]) -> f32 {
	rect[1] + rect[3]
}

fn toggled(collapsed: &[String], section_id: &str) -> Vec<String> {
	let mut toggled: Vec<String> =
		collapsed.iter().filter(|id| *id != section_id).cloned().collect();
	if toggled.len() == collapsed.len() {
		toggled.push(section_id.to_owned());
	}
	toggled
}

fn loose(bot: &Bot) -> Bot {
	Bot { section_id: None, pin_position: None, ..bot.clone() }
}

fn word_of(message: &Message) -> LastWord {
	LastWord {
		text: Some(message.content.clone()),
		at: message.created_at,
		author_bot_id: message.author_bot_id.clone(),
		author_account_id: None,
		author_name: message.author_name.clone(),
		written_from: None,
	}
}

fn conversation_of(row: &ConversationInPage) -> model::Conversation {
	let participants = row
		.conversation
		.participants
		.iter()
		.map(|seat| model::Participant {
			bot_id: seat.bot_id.clone(),
			name: seat.name.clone(),
			avatar_blot: hue_value(seat.avatar_blot),
			left_at: seat.left_at,
			is_deleted: seat.is_deleted,
		})
		.collect();
	model::Conversation {
		id: row.conversation.id.clone(),
		title: row.conversation.title.clone(),
		color: hue_value(row.conversation.color),
		participants,
		last_activity_at: Some(row.last_activity_at),
		last_word: row.last_word.as_ref().map(|word| model::LastWord { text: word.text.clone() }),
		solo_bot_id: row.solo_bot_id.clone(),
	}
}

fn main_chat_of(bot: &Bot, chat: &Chat) -> model::Conversation {
	let seat = model::Participant {
		bot_id: bot.id.clone(),
		name: bot.name.clone(),
		avatar_blot: hue_value(bot.avatar_blot),
		left_at: None,
		is_deleted: false,
	};
	model::Conversation {
		id: chat.id.clone(),
		title: bot.name.clone(),
		color: None,
		participants: vec![seat],
		last_activity_at: None,
		last_word: None,
		solo_bot_id: Some(bot.id.clone()),
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn shown(&self) -> Option<&Load> {
		self.rosters.get(self.shown.as_deref()?)
	}

	pub fn is_reading_more(&self) -> bool {
		self.reading_more.is_some() && self.reading_more == self.shown
	}

	pub fn renaming(&self) -> Option<&str> {
		self.renaming.as_deref()
	}

	pub fn viewport_height(&self) -> f32 {
		self.viewport[3]
	}

	pub fn retry(&mut self) {
		let Some(space_id) = self.shown.clone() else { return };
		self.load(space_id);
	}

	pub fn read_more(&mut self) -> bool {
		if self.reading_more.is_some() {
			return false;
		}
		let Some(space_id) = self.shown.clone() else { return false };
		let Some(cursor) = self.listing(&space_id).and_then(|listing| listing.next_cursor.clone())
		else {
			return false;
		};
		self.reading_more = Some(space_id.clone());
		self.queue(Call::ReadMore { space_id, cursor });
		true
	}

	pub fn scrolled_viewport(&mut self, rect: [f32; 4]) -> bool {
		self.viewport = rect;
		self.read_more_at_end()
	}

	pub fn scrolled_content(&mut self, rect: [f32; 4]) -> bool {
		self.content = rect;
		self.read_more_at_end()
	}

	pub fn pin(&mut self, id: &str) {
		self.repin(|pins| pinned_last(pins, id));
	}

	pub fn unpin(&mut self, id: &str) {
		self.repin(|pins| without_pin(pins, id));
	}

	pub fn reorder(&mut self, pins: Vec<RosterPin>) {
		self.repin(|_| pins);
	}

	pub fn toggle_section(&mut self, section_id: &str) {
		let Some((space_id, listing)) = self.shown_listing_mut() else { return };
		let collapsed = toggled(&listing.collapsed, section_id);
		let before = std::mem::replace(&mut listing.collapsed, collapsed.clone());
		self.queue(Call::Write(Write::Collapse { space_id, collapsed, before }));
	}

	pub fn begin_rename(&mut self, section_id: &str) {
		let Some(name) = self.shown_listing().and_then(|listing| listing.section_name(section_id))
		else {
			return;
		};
		self.name_edit = TextEdit::new(name);
		self.renaming = Some(section_id.to_owned());
	}

	pub fn cancel_rename(&mut self) {
		self.renaming = None;
	}

	pub fn commit_rename(&mut self, section_id: &str, name: &str) {
		self.renaming = None;
		let name = name.trim();
		let Some((space_id, listing)) = self.shown_listing_mut() else { return };
		let Some(before) = listing.section_name(section_id).map(str::to_owned) else { return };
		if name.is_empty() || name == before {
			return;
		}
		listing.name_section(section_id, name);
		let (section_id, name) = (section_id.to_owned(), name.to_owned());
		self.queue(Call::Write(Write::Rename { space_id, section_id, name, before }));
	}

	pub fn move_to_section(&mut self, bot_id: &str, section_id: Option<&str>) {
		let Some((space_id, listing)) = self.shown_listing_mut() else { return };
		let Some(before) = listing.placement_of(bot_id) else { return };
		let section_id = section_id.map(str::to_owned);
		listing.move_bot(bot_id, section_id.clone());
		let bot_id = bot_id.to_owned();
		self.queue(Call::Write(Write::MoveToSection { space_id, bot_id, section_id, before }));
	}

	pub fn share(&mut self, bot_id: &str, space_id: &str) {
		if self.shown.as_deref() == Some(space_id) {
			return;
		}
		let Some(bot) = self.shown_listing().and_then(|listing| listing.bot(bot_id)).map(loose)
		else {
			return;
		};
		if let Some(listing) = self.listing_mut(space_id) {
			listing.admit_bot(bot.clone());
		}
		let space_id = space_id.to_owned();
		self.queue(Call::Write(Write::Share { space_id, bot: Box::new(bot) }));
	}

	pub fn unshare(&mut self, bot_id: &str, space_id: &str) {
		let held = |listing: &Listing| listing.bot(bot_id).cloned();
		let bot =
			self.listing(space_id).and_then(held).or_else(|| self.shown_listing().and_then(held));
		let Some(bot) = bot else { return };
		if let Some(listing) = self.listing_mut(space_id) {
			listing.drop_bot(bot_id);
		}
		let space_id = space_id.to_owned();
		self.queue(Call::Write(Write::Unshare { space_id, bot: Box::new(bot) }));
	}

	pub fn heard(&mut self, heard: Heard) {
		match heard {
			Heard::Stored(row) => {
				let space_id = row.conversation.space_id.clone().unwrap_or_default();
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.stored(*row);
				}
			}
			Heard::Deleted { conversation_id } => {
				self.each_listing(|listing| listing.dropped(&conversation_id))
			}
			Heard::StateChanged { conversation_id, observed } => {
				self.each_listing(|listing| listing.observed(&conversation_id, observed.clone()))
			}
		}
	}

	pub fn heard_message(&mut self, message: &Message) {
		let word = word_of(message);
		self.each_listing(|listing| listing.spoke(&message.conversation_id, word.clone()));
	}

	pub fn heard_companion(&mut self, heard: &s10_agent_settings::Heard) {
		match heard {
			s10_agent_settings::Heard::Updated(bot) => {
				self.each_listing(|listing| listing.updated_bot(bot))
			}
			s10_agent_settings::Heard::Deleted { id } => {
				self.each_listing(|listing| listing.drop_bot(id))
			}
		}
	}

	pub fn dismiss(&mut self, index: usize) {
		if index < self.notices.len() {
			self.notices.remove(index);
		}
	}

	fn follow(&mut self, source: &Source, space_id: &str) {
		if self.source.is_none() {
			self.source = Some(source.clone());
			self.flush();
		}
		if self.shown.as_deref() == Some(space_id) {
			return;
		}
		self.shown = Some(space_id.to_owned());
		self.renaming = None;
		self.opening = None;
		if !matches!(self.rosters.get(space_id), Some(Load::Failed(_))) {
			self.load(space_id.to_owned());
		}
	}

	fn load(&mut self, space_id: String) {
		if !self.loading.insert(space_id.clone()) {
			return;
		}
		if self.listing(&space_id).is_none() {
			self.rosters.insert(space_id.clone(), Load::Loading);
		}
		self.queue(Call::Load(space_id));
	}

	fn loaded(&mut self, space_id: String, listing: Result<Listing, HostError>) {
		self.loading.remove(&space_id);
		match listing {
			Ok(listing) => {
				self.rosters.insert(space_id, Load::Shown(listing));
			}
			Err(failure) if self.listing(&space_id).is_some() => {
				self.raise(REFRESH_UNREAD.to_owned(), &failure)
			}
			Err(failure) => {
				self.rosters.insert(space_id, Load::Failed(failure));
			}
		}
	}

	fn read_more_at_end(&mut self) -> bool {
		let is_laid_out = self.content[3] > 0.0;
		let is_at_end = bottom_of(self.content) - bottom_of(self.viewport) <= END_MARGIN;
		is_laid_out && is_at_end && self.read_more()
	}

	fn repin(&mut self, repinned: impl FnOnce(&[RosterPin]) -> Vec<RosterPin>) {
		let Some((space_id, listing)) = self.shown_listing_mut() else { return };
		let before = listing.pins();
		let pins = repinned(&before);
		if pins == before {
			return;
		}
		listing.place(&pins);
		self.queue(Call::Write(Write::Pin { space_id, pins, before }));
	}

	fn listing(&self, space_id: &str) -> Option<&Listing> {
		match self.rosters.get(space_id)? {
			Load::Shown(listing) => Some(listing),
			Load::Loading | Load::Failed(_) => None,
		}
	}

	fn listing_mut(&mut self, space_id: &str) -> Option<&mut Listing> {
		match self.rosters.get_mut(space_id)? {
			Load::Shown(listing) => Some(listing),
			Load::Loading | Load::Failed(_) => None,
		}
	}

	fn shown_listing(&self) -> Option<&Listing> {
		self.listing(self.shown.as_deref()?)
	}

	fn shown_listing_mut(&mut self) -> Option<(String, &mut Listing)> {
		let space_id = self.shown.clone()?;
		let listing = self.listing_mut(&space_id)?;
		Some((space_id, listing))
	}

	fn each_listing(&mut self, mut change: impl FnMut(&mut Listing)) {
		for load in self.rosters.values_mut() {
			if let Load::Shown(listing) = load {
				change(listing);
			}
		}
	}

	fn bot_name(&self, space_id: &str, bot_id: &str) -> String {
		let held = |listing: &Listing| listing.bot(bot_id).map(|bot| bot.name.clone());
		self.listing(space_id)
			.and_then(held)
			.or_else(|| self.shown_listing().and_then(held))
			.unwrap_or_else(|| bot_id.to_owned())
	}

	fn raise(&mut self, title: String, failure: &HostError) {
		self.notices.push(Notice { title, description: Some(failure_text(failure)) });
	}

	fn select(&mut self, id: &str) -> Option<model::Conversation> {
		self.opening = None;
		let space_id = self.shown.clone()?;
		let line = self.listing(&space_id)?.line(id)?;
		let (conversation, bot_id) =
			(line.conversation().map(conversation_of), line.id().to_owned());
		if conversation.is_none() {
			self.opening = Some(bot_id.clone());
			self.queue(Call::MainChat { space_id, bot_id });
		}
		conversation
	}

	fn answered(&mut self, answer: Answer) -> Option<model::Conversation> {
		match answer {
			Answer::Loaded { space_id, listing } => self.loaded(space_id, listing),
			Answer::ReadMore { space_id, page } => self.read(&space_id, page),
			Answer::MainChat { bot_id, chat } => return self.main_chat(&bot_id, chat),
			Answer::Written { outcome: Ok(()), .. } => {}
			Answer::Written { write, outcome: Err(failure) } => self.undo(write, &failure),
		}
		None
	}

	fn read(&mut self, space_id: &str, page: Result<ConversationPage, HostError>) {
		if self.reading_more.as_deref() == Some(space_id) {
			self.reading_more = None;
		}
		match page {
			Ok(page) => {
				if let Some(listing) = self.listing_mut(space_id) {
					listing.read_more(page);
				}
			}
			Err(failure) => self.raise(MORE_UNREAD.to_owned(), &failure),
		}
	}

	fn main_chat(
		&mut self,
		bot_id: &str,
		chat: Result<Chat, HostError>,
	) -> Option<model::Conversation> {
		if self.opening.as_deref() != Some(bot_id) {
			return None;
		}
		self.opening = None;
		let space_id = self.shown.clone()?;
		match chat {
			Ok(chat) => self.listing(&space_id)?.bot(bot_id).map(|bot| main_chat_of(bot, &chat)),
			Err(failure) => {
				let name = self.bot_name(&space_id, bot_id);
				self.raise(named(OPEN_REFUSED, &name), &failure);
				None
			}
		}
	}

	fn undo(&mut self, write: Write, failure: &HostError) {
		let title = match write {
			Write::Pin { space_id, before, .. } => {
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.place(&before);
				}
				PINS_UNSAVED.to_owned()
			}
			Write::Collapse { space_id, before, .. } => {
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.collapsed = before;
				}
				SECTION_UNSAVED.to_owned()
			}
			Write::Rename { space_id, section_id, before, .. } => {
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.name_section(&section_id, &before);
				}
				SECTION_UNSAVED.to_owned()
			}
			Write::MoveToSection { space_id, bot_id, before, .. } => {
				let name = self.bot_name(&space_id, &bot_id);
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.restore_bot(&bot_id, before);
				}
				named(MOVE_UNSAVED, &name)
			}
			Write::Share { space_id, bot } => {
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.drop_bot(&bot.id);
				}
				named(SHARE_UNSAVED, &bot.name)
			}
			Write::Unshare { space_id, bot } => {
				let name = bot.name.clone();
				if let Some(listing) = self.listing_mut(&space_id) {
					listing.admit_bot(*bot);
				}
				named(UNSHARE_UNSAVED, &name)
			}
		};
		self.raise(title, failure);
	}

	fn answers(&self) -> Vec<Answer> {
		self.worker.as_ref().map(Worker::answers).unwrap_or_default()
	}

	fn queue(&mut self, call: Call) {
		self.queued.push(call);
		self.flush();
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

fn follow_shown(app: &mut App) {
	let Some(ready) = app.ready() else { return };
	let (source, space_id) = (ready.source.clone(), ready.space.id.clone());
	app.surfaces.s03_roster.follow(&source, &space_id);
}

pub fn poll(app: &mut App) -> bool {
	follow_shown(app);
	let answers = app.surfaces.s03_roster.answers();
	let is_changed = !answers.is_empty();
	for answer in answers {
		landed(app, answer);
	}
	is_changed
}

fn landed(app: &mut App, answer: Answer) {
	if let Some(conversation) = app.surfaces.s03_roster.answered(answer) {
		open(app, conversation);
	}
}

fn open(app: &mut App, conversation: model::Conversation) {
	let Workspace::Ready(ready) = &mut app.workspace else { return };
	let id = conversation.id.clone();
	if !ready.conversations.iter().any(|held| held.id == id) {
		ready.conversations.push(conversation);
	}
	app.open(&id);
}

pub fn select(app: &mut App, id: &str) {
	if let Some(conversation) = app.surfaces.s03_roster.select(id) {
		open(app, conversation);
	}
}

pub fn selected_row(app: &App) -> Option<&str> {
	let thread = app.thread.as_ref()?;
	let conversation =
		app.ready()?.conversations.iter().find(|held| held.id == thread.conversation_id)?;
	Some(conversation.solo_bot_id.as_deref().unwrap_or(&conversation.id))
}

fn emitted(app: &mut App, event: RosterEvent) {
	let state = &mut app.surfaces.s03_roster;
	match event {
		RosterEvent::Select(id) => select(app, &id),
		RosterEvent::ToggleSection(id) => state.toggle_section(&id),
		RosterEvent::RenameCommit { section, name } => state.commit_rename(&section, &name),
		RosterEvent::RenameCancel(_) => state.cancel_rename(),
		RosterEvent::Retry => state.retry(),
	}
}

fn noticed(app: &mut App, event: SurfaceEvent) {
	match event {
		SurfaceEvent::Close(index) | SurfaceEvent::Act(index) | SurfaceEvent::CopyReport(index) => {
			app.surfaces.s03_roster.dismiss(index)
		}
	}
}

fn name_edit(app: &mut App) -> &mut TextEdit {
	&mut app.surfaces.s03_roster.name_edit
}
