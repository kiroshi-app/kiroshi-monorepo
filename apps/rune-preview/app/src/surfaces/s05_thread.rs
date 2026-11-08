mod conversation;
mod projection;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use kiroshi_core::conversations::contract::{PinnedBubble, ReplyLink, TranscriptPage};
use kiroshi_rune_kit::surfaces::s05_thread::{Agent, Quote};
use rune::{Tx, Waker};

use kiroshi_rune_kit::strings::{Key as Copy, Language, chat};
use kiroshi_rune_kit::surfaces::s05_thread::ThreadEvent;

use crate::app::App;
use crate::events::HostEvent;
use crate::host::HostError;
use crate::source::Source;
use crate::surfaces::{s06_composer, s07_approvals};

pub use view::{pinned_panel, view};

use conversation::{Conversation, Phase};
use worker::{Answer, Call, Worker};

#[derive(Clone, Debug, PartialEq)]
struct Notice {
	title: String,
	description: String,
}

#[derive(Debug, PartialEq)]
enum Effect {
	Copy(String),
	OpenUrl(String),
	Reveal(String),
}

#[derive(Default)]
pub struct State {
	open: Option<Conversation>,
	notice: Option<Notice>,
	effects: Vec<Effect>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

fn said(key: Copy) -> String {
	key.text(Language::En).to_owned()
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn turn_key(message_id: &str) -> String {
	format!("turn-{message_id}")
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
	}

	pub fn conversation_id(&self) -> Option<&str> {
		self.open.as_ref().map(|open| open.id.as_str())
	}

	pub fn reply_links(&self) -> Vec<ReplyLink> {
		let replies = self.open.as_ref().map(|open| open.replies.as_slice()).unwrap_or_default();
		replies.iter().map(|id| ReplyLink { message_id: id.clone(), excerpt: None }).collect()
	}

	pub fn held_quotes(&self, roster: &[Agent]) -> Vec<Quote> {
		let Some(open) = self.open.as_ref() else { return Vec::new() };
		let links = self.reply_links();
		links.iter().filter_map(|link| projection::quote_of(link, open, roster)).collect()
	}

	pub fn release_reply(&mut self, message_id: &str) {
		if let Some(open) = self.open.as_mut() {
			open.replies.retain(|held| held != message_id);
		}
	}

	pub fn holds(&self, message_id: &str) -> bool {
		self.open.as_ref().is_some_and(|open| open.holds(message_id))
	}

	pub fn is_working(&self) -> bool {
		self.open.as_ref().is_some_and(|open| !open.working.is_empty())
	}

	pub fn open(&mut self, conversation_id: &str) {
		if self.conversation_id() == Some(conversation_id) {
			return;
		}
		self.notice = None;
		self.load(conversation_id);
	}

	pub fn scrolled(&mut self, is_at_bottom: bool) {
		if let Some(open) = self.open.as_mut() {
			open.scrolled(is_at_bottom);
		}
	}

	pub fn reached_top(&mut self) {
		self.load_older();
	}

	fn take_answers(&mut self) -> bool {
		let answers = self.worker.as_ref().map(Worker::answers).unwrap_or_default();
		let changed = !answers.is_empty();
		for answer in answers {
			self.answered(answer);
		}
		self.flush();
		changed
	}

	pub fn heard(&mut self, event: &HostEvent) {
		let Some(open) = self.open.as_mut() else { return };
		match event {
			HostEvent::Agent(scoped) => {
				let Some(scope) =
					scoped.scope.as_ref().filter(|scope| scope.conversation_id == open.id)
				else {
					return;
				};
				open.streamed(&scope.bot_id, scoped.event.clone());
			}
			HostEvent::MessageStored(message) if message.conversation_id == open.id => {
				self.refresh()
			}
			HostEvent::Lagged => self.refresh(),
			HostEvent::MessageStored(_)
			| HostEvent::MissionChanged(_)
			| HostEvent::Companion(_)
			| HostEvent::Roster(_)
			| HostEvent::Approvals(_)
			| HostEvent::AccountChanged(_)
			| HostEvent::Listening
			| HostEvent::Unreadable { .. }
			| HostEvent::Lost(_) => {}
		}
	}

	pub fn handle(&mut self, event: ThreadEvent, now: i64) -> Option<ThreadEvent> {
		match event {
			ThreadEvent::Copy(id) => self.copy(&id),
			ThreadEvent::Reply(id) => self.reply(&id),
			ThreadEvent::Pin(id) => self.pin(id, now),
			ThreadEvent::Unpin(id) => self.unpin(id),
			ThreadEvent::OpenLink(url) => self.effects.push(Effect::OpenUrl(url)),
			ThreadEvent::OpenQuote(id) | ThreadEvent::JumpToPinned(id) => self.jump(id),
			ThreadEvent::ToggleWork(_) => self.toggle_work(),
			ThreadEvent::NoticeAction => self.notice = None,
			ThreadEvent::RetryLoad => self.reload(),
			forwarded @ (ThreadEvent::Retry(_)
			| ThreadEvent::CancelQueued(_)
			| ThreadEvent::ToggleTask { .. }
			| ThreadEvent::OpenAttachment { .. }
			| ThreadEvent::QuoteSelection
			| ThreadEvent::ClearSelection
			| ThreadEvent::Mission(_)) => return Some(forwarded),
		}
		self.flush();
		None
	}

	fn perform(&mut self, tx: &mut Tx) -> bool {
		let has_effects = !self.effects.is_empty();
		for effect in std::mem::take(&mut self.effects) {
			match effect {
				Effect::Copy(text) => tx.copy(text),
				Effect::OpenUrl(url) => {
					if let Err(failure) = tx.open_url(&url) {
						self.raise(failure.to_string(), url);
					}
				}
				Effect::Reveal(id) => tx.scroll_into_view(turn_key(&id)),
			}
		}
		has_effects
	}

	fn raise(&mut self, title: String, description: String) {
		self.notice = Some(Notice { title, description });
	}

	fn load(&mut self, conversation_id: &str) {
		self.open = Some(Conversation::new(conversation_id));
		let conversation_id = conversation_id.to_owned();
		self.queue(Call::Page { conversation_id: conversation_id.clone(), before_seq: None });
		self.queue(Call::Pins { conversation_id });
		self.flush();
	}

	fn reload(&mut self) {
		let Some(id) = self.conversation_id().map(str::to_owned) else { return };
		self.load(&id);
	}

	fn refresh(&mut self) {
		let Some(open) = self.open.as_ref().filter(|open| open.is_loaded()) else { return };
		let conversation_id = open.id.clone();
		self.queue(Call::Page { conversation_id, before_seq: None });
		self.flush();
	}

	fn load_older(&mut self) {
		let Some(open) = self.open.as_mut() else { return };
		if !open.is_loaded() || !open.has_older || open.is_loading_older {
			return;
		}
		let Some(oldest) = open.oldest_seq() else { return };
		open.is_loading_older = true;
		let conversation_id = open.id.clone();
		self.queue(Call::Page { conversation_id, before_seq: Some(oldest) });
		self.flush();
	}

	fn copy(&mut self, id: &str) {
		let text = self.open.as_ref().and_then(|open| open.text_of(id)).map(str::to_owned);
		if let Some(text) = text {
			self.effects.push(Effect::Copy(text));
		}
	}

	fn reply(&mut self, id: &str) {
		if let Some(open) = self.open.as_mut().filter(|open| open.holds(id)) {
			open.hold_reply(id);
		}
	}

	fn pin(&mut self, message_id: String, pinned_at: i64) {
		let Some(conversation_id) = self.conversation_id().map(str::to_owned) else { return };
		self.queue(Call::Pin { conversation_id, message_id, pinned_at });
	}

	fn unpin(&mut self, message_id: String) {
		let Some(open) = self.open.as_ref() else { return };
		let block_indexes = open.pinned_blocks(&message_id);
		if block_indexes.is_empty() {
			return;
		}
		let conversation_id = open.id.clone();
		self.queue(Call::Unpin { conversation_id, message_id, block_indexes });
	}

	fn jump(&mut self, message_id: String) {
		let Some(open) = self.open.as_mut() else { return };
		if open.holds(&message_id) {
			open.jumping_to = None;
			self.effects.push(Effect::Reveal(message_id));
			return;
		}
		if !open.has_older {
			open.jumping_to = None;
			return;
		}
		open.jumping_to = Some(message_id);
		self.load_older();
	}

	fn toggle_work(&mut self) {
		if let Some(open) = self.open.as_mut() {
			open.is_work_open = !open.is_work_open;
		}
	}

	fn shown_mut(&mut self, conversation_id: &str) -> Option<&mut Conversation> {
		self.open.as_mut().filter(|open| open.id == conversation_id)
	}

	fn answered(&mut self, answer: Answer) {
		match answer {
			Answer::Paged { conversation_id, before_seq, page } => {
				self.paged(&conversation_id, before_seq, page)
			}
			Answer::Pins { conversation_id, pins } => self.pins_read(&conversation_id, pins),
			Answer::Pinned { conversation_id, outcome } => {
				if self.shown_mut(&conversation_id).is_none() {
					return;
				}
				if let Err(failure) = outcome {
					self.raise(said(chat::pinned::unavailable::TITLE), failure_text(&failure));
				}
				self.queue(Call::Pins { conversation_id });
			}
		}
	}

	fn paged(
		&mut self,
		conversation_id: &str,
		before_seq: Option<i64>,
		page: Result<TranscriptPage, HostError>,
	) {
		let Some(open) = self.shown_mut(conversation_id) else { return };
		match (page, before_seq) {
			(Ok(page), None) => open.landed_newest(page.messages, page.has_more),
			(Ok(page), Some(_)) => {
				open.landed_older(page.messages, page.has_more);
				if let Some(target) = open.jumping_to.take() {
					self.jump(target);
				}
			}
			(Err(failure), None) if !open.is_loaded() => open.phase = Phase::Failed(failure),
			(Err(failure), None) => self.raise(failure.title(), failure.detail()),
			(Err(failure), Some(_)) => {
				open.is_loading_older = false;
				open.jumping_to = None;
				self.raise(said(chat::screen::notice::READ_FAILED), failure_text(&failure));
			}
		}
	}

	fn pins_read(&mut self, conversation_id: &str, pins: Result<Vec<PinnedBubble>, HostError>) {
		let Some(open) = self.shown_mut(conversation_id) else { return };
		match pins {
			Ok(pins) => open.pins = pins,
			Err(failure) => {
				self.raise(said(chat::pinned::unavailable::TITLE), failure_text(&failure))
			}
		}
	}

	fn queue(&mut self, call: Call) {
		self.queued.push(call);
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

pub fn open_conversation(app: &mut App, conversation_id: &str) {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return };
	let thread = &mut app.surfaces.s05_thread;
	thread.use_source(source);
	thread.open(conversation_id);
	s07_approvals::open_conversation(app, conversation_id);
	s06_composer::opened(app);
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	let thread = &mut app.surfaces.s05_thread;
	let has_answers = thread.take_answers();
	thread.perform(tx) || has_answers
}
