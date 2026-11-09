mod draft;
mod menu;
mod notice;
mod open;
mod prompt_text;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use std::collections::HashMap;
use std::path::PathBuf;

use kiroshi_core::agent::contract::{AgentCommand, CancelOutcome};
use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind};
use rune::{
	ClipboardContent, FileDialogOptions, FileDialogResult, Key, KeyEvent, TextEdit, Tx, Waker,
};

use kiroshi_rune_kit::surfaces::s05_thread::COLUMN;
use kiroshi_rune_kit::surfaces::s06_composer::ComposerIntent;
use kiroshi_rune_kit::surfaces::s06_composer::prompt;

use crate::app::App;
use crate::conversations::now_ms;
use crate::host::HostError;
use crate::source::Source;
use crate::surfaces::Surfaces;

pub use view::{layers, view};

use draft::{Document, Draft, Pending};
use menu::{Menu, Trigger};
use notice::Notice;
use open::{Kind, Open};
use prompt_text::{
	Named, mentioned_ids, prompt_for_command, prompt_with_mention, to_mention_tokens,
};
use worker::{Answer, Call, File, Outgoing, Preparing, Refusal, Unread, Unsent, Worker};

const FIELD_KEY: &str = "composer-field";
const PASTED_IMAGE_NAME: &str = "image.png";

#[derive(Clone, Debug, PartialEq)]
enum Effect {
	Reveal(String),
	FieldToBottom,
	Browse,
}

enum Load<T> {
	Reading,
	Ready(T),
	Failed,
}

pub struct Live<'a> {
	pub working: Option<&'a str>,
	pub holds: &'a dyn Fn(&str) -> bool,
}

#[derive(Default)]
pub struct State {
	drafts: HashMap<String, Draft>,
	menu: Menu,
	commands: HashMap<String, Load<Vec<AgentCommand>>>,
	library: Option<(String, Load<Vec<LibraryItem>>)>,
	picker: Option<TextEdit>,
	is_drop_target: bool,
	width: Option<f32>,
	notice: Option<Notice>,
	released: Vec<String>,
	effects: Vec<Effect>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

fn named(candidates: &[open::Candidate]) -> Vec<Named<'_>> {
	candidates.iter().map(|candidate| Named { id: &candidate.id, name: &candidate.name }).collect()
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
	}

	pub fn notice(&self) -> Option<(&str, &str)> {
		self.notice.as_ref().map(|notice| (notice.title.as_str(), notice.description.as_str()))
	}

	pub fn dismiss_notice(&mut self) -> bool {
		self.notice.take().is_some()
	}

	fn draft(&self, conversation_id: &str) -> Option<&Draft> {
		self.drafts.get(conversation_id)
	}

	fn draft_mut(&mut self, conversation_id: &str) -> &mut Draft {
		self.drafts.entry(conversation_id.to_owned()).or_default()
	}

	pub(crate) fn edit_of(&mut self, conversation_id: &str) -> &mut TextEdit {
		&mut self.draft_mut(conversation_id).edit
	}

	fn prompt_of(&self, conversation_id: &str) -> &str {
		self.draft(conversation_id).map_or("", |draft| draft.edit.text.as_str())
	}

	fn commands_of(&self, kind: &Kind) -> &[AgentCommand] {
		let Kind::Solo { bot_id, .. } = kind else { return &[] };
		match self.commands.get(bot_id) {
			Some(Load::Ready(commands)) => commands,
			_ => &[],
		}
	}

	fn trigger<'a>(&'a self, open: &Open) -> Option<Trigger<'a>> {
		let prompt = self.prompt_of(&open.conversation_id);
		menu::trigger(prompt, &open.kind, !self.commands_of(&open.kind).is_empty())
	}

	fn prompt_width(&self) -> f32 {
		self.width.map_or(COLUMN, view::width_within)
	}

	fn laid_out(&mut self, row_width: f32) {
		self.width = Some(row_width);
	}

	fn is_menu_open(&self, open: &Open) -> bool {
		let Some(trigger) = self.trigger(open).filter(|trigger| !self.menu.is_dismissed(trigger))
		else {
			return false;
		};
		!menu::rows(&trigger, &open.candidates, self.commands_of(&open.kind)).is_empty()
	}

	fn opened(&mut self, open: &Open) {
		self.menu = Menu::default();
		self.picker = None;
		self.is_drop_target = false;
		if let Kind::Solo { bot_id, .. } = &open.kind
			&& !matches!(self.commands.get(bot_id), Some(Load::Reading | Load::Ready(_)))
		{
			self.commands.insert(bot_id.clone(), Load::Reading);
			self.queue(Call::Commands { bot_id: bot_id.clone() });
		}
		let has_draft =
			self.draft(&open.conversation_id).is_some_and(|draft| !draft.edit.text.is_empty());
		if has_draft {
			self.effects.push(Effect::FieldToBottom);
		}
		self.flush();
	}

	fn can_send(&self, open: &Open) -> bool {
		let Some(draft) = self.draft(&open.conversation_id) else { return false };
		draft.has_payload() && !open.is_closed() && draft.pending.is_none()
	}

	fn send(&mut self, open: &Open, now: i64) {
		if !self.can_send(open) {
			return;
		}
		let named = named(&open.candidates);
		let draft = self.draft_mut(&open.conversation_id);
		let text = draft.edit.text.trim().to_owned();
		let (content, seats) = match open.kind {
			Kind::Solo { .. } => (text.clone(), Vec::new()),
			Kind::Group | Kind::Mission { .. } => {
				let outside = mentioned_ids(&text, &named)
					.into_iter()
					.filter_map(|id| open.outside_name(&id).map(|name| (id, name)))
					.collect();
				(to_mention_tokens(&text, &named), outside)
			}
		};
		let outgoing = Outgoing {
			message_id: uuid::Uuid::new_v4().to_string(),
			turn_id: uuid::Uuid::new_v4().to_string(),
			conversation_id: open.conversation_id.clone(),
			content,
			shown: text.clone(),
			reply_links: open.reply_links.clone(),
			documents: draft.documents.iter().map(|document| document.name.clone()).collect(),
			created_at: now,
		};
		draft.pending = Some(Pending {
			message_id: outgoing.message_id.clone(),
			text,
			file_ids: draft.files.iter().map(|file| file.id.clone()).collect(),
			document_names: outgoing.documents.clone(),
			reply_ids: open.reply_links.iter().map(|link| link.message_id.clone()).collect(),
			queues: matches!(open.kind, Kind::Solo { .. }),
		});
		let files = draft.files.clone();
		self.notice = None;
		self.menu = Menu::default();
		self.queue(Call::Prepare(Preparing { outgoing, seats, files }));
		self.flush();
	}

	fn accept(&mut self, conversation_id: &str, message_id: &str) {
		let Some(draft) = self.drafts.get_mut(conversation_id) else { return };
		if let Some(reply_ids) = draft.accept(message_id) {
			self.released.extend(reply_ids);
		}
	}

	fn is_turn_running(&self, conversation_id: &str, live: &Live) -> bool {
		live.working == Some(conversation_id)
			|| self.draft(conversation_id).is_some_and(Draft::is_running)
	}

	fn prepared(
		&mut self,
		conversation_id: &str,
		message_id: &str,
		prepared: Result<Outgoing, Refusal>,
		live: &Live,
	) {
		let outgoing = match prepared {
			Ok(outgoing) => outgoing,
			Err(refusal) => {
				self.draft_mut(conversation_id).refuse(message_id);
				self.notice = Some(Notice::refused(&refusal));
				return;
			}
		};
		let is_running = self.is_turn_running(conversation_id, live);
		let draft = self.draft_mut(conversation_id);
		let queues = draft.pending.as_ref().is_some_and(|pending| pending.queues);
		if queues && is_running {
			draft.queue.push(outgoing);
			self.accept(conversation_id, message_id);
			return;
		}
		draft.running.push(outgoing.clone());
		self.queue(Call::Send(outgoing));
	}

	fn sent(&mut self, conversation_id: &str, message_id: &str, outcome: Result<(), Unsent>) {
		let draft = self.draft_mut(conversation_id);
		let at = draft.running.iter().position(|running| running.message_id == message_id);
		let outgoing = at.map(|at| draft.running.remove(at));
		let Unsent { failure, reached } = match outcome {
			Ok(()) => return self.accept(conversation_id, message_id),
			Err(unsent) => unsent,
		};
		self.notice = Some(Notice::unsent(&failure, reached.as_ref().err()));
		if matches!(reached, Ok(true)) {
			return self.accept(conversation_id, message_id);
		}
		let draft = self.draft_mut(conversation_id);
		if !draft.refuse(message_id)
			&& let Some(outgoing) = outgoing
		{
			draft.hold_front(outgoing);
			draft.is_queue_held = true;
		}
	}

	fn staged(&mut self, conversation_id: &str, files: Vec<Result<File, Unread>>) {
		let (read, unread): (Vec<_>, Vec<_>) = files.into_iter().partition(Result::is_ok);
		self.draft_mut(conversation_id).stage(read.into_iter().flatten().collect());
		if let Some(Err(unread)) = unread.into_iter().next() {
			self.notice = Some(Notice::unread(&unread));
		}
	}

	fn answered(&mut self, answer: Answer, live: &Live) {
		match answer {
			Answer::Prepared { conversation_id, message_id, prepared } => {
				self.prepared(&conversation_id, &message_id, prepared, live)
			}
			Answer::Sent { conversation_id, message_id, outcome } => {
				self.sent(&conversation_id, &message_id, outcome)
			}
			Answer::Library { space_id, items } => self.library_read(space_id, items),
			Answer::Commands { bot_id, commands } => match commands {
				Ok(commands) => {
					self.commands.insert(bot_id, Load::Ready(commands));
				}
				Err(failure) => {
					self.commands.insert(bot_id, Load::Failed);
					self.notice = Some(Notice::commands_unread(&failure));
				}
			},
			Answer::Read { conversation_id, files } => self.staged(&conversation_id, files),
			Answer::Cancelled { outcome } => match outcome {
				Ok(CancelOutcome::Cancelled | CancelOutcome::NothingToCancel) => {}
				Ok(CancelOutcome::Failed { .. }) => self.notice = Some(Notice::not_stopped(None)),
				Err(failure) => self.notice = Some(Notice::not_stopped(Some(&failure))),
			},
		}
	}

	fn library_read(&mut self, space_id: String, items: Result<Vec<LibraryItem>, HostError>) {
		match items {
			Ok(items) => self.library = Some((space_id, Load::Ready(items))),
			Err(failure) => {
				self.library = Some((space_id, Load::Failed));
				self.notice = Some(Notice::library_unread(&failure));
			}
		}
	}

	fn documents(&self) -> Vec<&LibraryItem> {
		match &self.library {
			Some((_, Load::Ready(items))) => {
				items.iter().filter(|item| item.kind == LibraryItemKind::Document).collect()
			}
			_ => Vec::new(),
		}
	}

	fn toggle_library(&mut self, open: &Open) {
		if self.picker.take().is_some() {
			return;
		}
		self.picker = Some(TextEdit::default());
		let space_id = open.space.0.clone();
		let is_read = matches!(&self.library, Some((read, Load::Ready(_))) if *read == space_id);
		if !is_read {
			self.library = Some((space_id.clone(), Load::Reading));
		}
		self.queue(Call::Library { space_id });
		self.flush();
	}

	fn pick_document(&mut self, open: &Open, name: &str) {
		let picked = self.documents().into_iter().find(|item| item.name == name).map(|item| {
			Document { name: item.name.clone(), title: open::title_of(item), bytes: item.bytes }
		});
		self.picker = None;
		let Some(document) = picked else { return };
		let draft = self.draft_mut(&open.conversation_id);
		draft.stage_document(document);
		draft.edit.focused = true;
	}

	fn browse(&mut self) {
		self.picker = None;
		self.effects.push(Effect::Browse);
	}

	fn read_files(&mut self, open: &Open, paths: Vec<PathBuf>) {
		if paths.is_empty() || open.is_closed() {
			return;
		}
		self.queue(Call::Read { conversation_id: open.conversation_id.clone(), paths });
		self.flush();
	}

	fn pasted(&mut self, open: &Open, content: &ClipboardContent) {
		if open.is_closed() {
			return;
		}
		if let Some(image) = content.image() {
			let file = File {
				id: uuid::Uuid::new_v4().to_string(),
				name: PASTED_IMAGE_NAME.to_owned(),
				bytes: image.png().to_vec(),
			};
			self.draft_mut(&open.conversation_id).stage(vec![file]);
		}
		self.read_files(open, content.files().to_vec());
	}

	fn write(&mut self, open: &Open, text: String) {
		self.menu = Menu::default();
		self.draft_mut(&open.conversation_id).write(text);
	}

	fn pick_mention(&mut self, open: &Open, bot_id: &str) {
		let Some(candidate) = open.candidates.iter().find(|candidate| candidate.id == bot_id)
		else {
			return;
		};
		let text = prompt_with_mention(self.prompt_of(&open.conversation_id), &candidate.name);
		self.write(open, text);
	}

	fn pick_command(&mut self, open: &Open, command: &str) {
		self.write(open, prompt_for_command(command));
	}

	fn travel(&mut self, open: &Open, step: i32) {
		let Some(trigger) = self.trigger(open) else { return };
		let rows = menu::rows(&trigger, &open.candidates, self.commands_of(&open.kind));
		if rows.is_empty() {
			return;
		}
		let active = self.menu.active_for(&trigger, rows.len());
		let moved = (active as i64 + i64::from(step)).rem_euclid(rows.len() as i64) as usize;
		let query = trigger.query().to_owned();
		let key = rows[moved].key.clone();
		self.menu.travelled(query, moved);
		self.effects.push(Effect::Reveal(key));
	}

	fn choose(&mut self, open: &Open) {
		let Some(trigger) = self.trigger(open) else { return };
		let rows = menu::rows(&trigger, &open.candidates, self.commands_of(&open.kind));
		let active = self.menu.active_for(&trigger, rows.len());
		let Some(chosen) = rows.into_iter().nth(active) else { return };
		match trigger {
			Trigger::Mention { .. } => self.pick_mention(open, &chosen.id),
			Trigger::Command { .. } => self.pick_command(open, &chosen.id),
		}
	}

	fn dismiss_menu(&mut self, open: &Open) {
		let at = self.trigger(open).map(|trigger| trigger.at());
		if let Some(at) = at {
			self.menu.dismissed(at);
		}
	}

	fn send_now(&mut self, open: &Open, id: &str, live: &Live) {
		let is_running = self.is_turn_running(&open.conversation_id, live);
		let draft = self.draft_mut(&open.conversation_id);
		let Some(outgoing) = draft.take_queued(id) else { return };
		draft.hold_front(outgoing);
		draft.is_queue_held = false;
		if let (true, Kind::Solo { bot_id, .. }) = (is_running, &open.kind) {
			let conversation_id = open.conversation_id.clone();
			self.queue(Call::Cancel { conversation_id, bot_id: bot_id.clone() });
			self.flush();
		}
	}

	fn remove_queued(&mut self, open: &Open, id: &str) {
		let draft = self.draft_mut(&open.conversation_id);
		if draft.take_queued(id).is_some() {
			draft.is_queue_held = false;
		}
	}

	fn intent(&mut self, open: &Open, intent: ComposerIntent, live: &Live) {
		match intent {
			ComposerIntent::Send => self.send(open, now_ms()),
			ComposerIntent::Attach | ComposerIntent::BrowseFiles => self.browse(),
			ComposerIntent::Paste(content) => self.pasted(open, &content),
			ComposerIntent::OpenLibrary => self.toggle_library(open),
			ComposerIntent::PickDocument(name) => self.pick_document(open, &name),
			ComposerIntent::PickMention { id, .. } => self.pick_mention(open, &id),
			ComposerIntent::PickCommand(command) => self.pick_command(open, &command),
			ComposerIntent::MenuTravel(step) => self.travel(open, step),
			ComposerIntent::MenuChoose => self.choose(open),
			ComposerIntent::MenuDismiss => self.dismiss_menu(open),
			ComposerIntent::RemoveAttachment(id) => {
				self.draft_mut(&open.conversation_id).remove(&id)
			}
			ComposerIntent::SendQueuedNow(id) => self.send_now(open, &id, live),
			ComposerIntent::RemoveQueued(id) => self.remove_queued(open, &id),
			ComposerIntent::RemoveReply(id) => self.released.push(id),
			ComposerIntent::RemoveQuote
			| ComposerIntent::DismissReply
			| ComposerIntent::JumpToReply => {}
		}
	}

	fn settle(&mut self, open: Option<&Open>, live: &Live) {
		if let Some(open) = open {
			if self.trigger(open).is_none() {
				self.menu = Menu::default();
			}
			let pending =
				self.draft(&open.conversation_id).and_then(|draft| draft.pending.as_ref());
			let stored =
				pending.map(|pending| pending.message_id.clone()).filter(|id| (live.holds)(id));
			if let Some(message_id) = stored {
				self.accept(&open.conversation_id, &message_id);
			}
		}
		self.pump(live);
	}

	fn pump(&mut self, live: &Live) {
		let ready: Vec<String> = self
			.drafts
			.iter()
			.filter(|(id, draft)| {
				!draft.queue.is_empty()
					&& !draft.is_queue_held
					&& live.working != Some(id.as_str())
					&& !draft.is_running()
			})
			.map(|(id, _)| id.clone())
			.collect();
		for conversation_id in ready {
			let draft = self.draft_mut(&conversation_id);
			let outgoing = draft.queue.remove(0);
			draft.running.push(outgoing.clone());
			self.queue(Call::Send(outgoing));
		}
		self.flush();
	}

	fn take_answers(&mut self, live: &Live) -> bool {
		let answers = self.worker.as_ref().map(Worker::answers).unwrap_or_default();
		let changed = !answers.is_empty();
		for answer in answers {
			self.answered(answer, live);
		}
		self.flush();
		changed
	}

	fn perform(&mut self, tx: &mut Tx) -> bool {
		let has_effects = !self.effects.is_empty();
		for effect in std::mem::take(&mut self.effects) {
			match effect {
				Effect::Reveal(key) => tx.scroll_into_view(key),
				Effect::FieldToBottom => tx.scroll_to_bottom_instant(FIELD_KEY),
				Effect::Browse => tx.open_file(FileDialogOptions::default(), picked),
			}
		}
		has_effects
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

fn with_live(app: &mut App, act: impl FnOnce(&mut State, &Live)) {
	let Surfaces { s05_thread, s06_composer, .. } = &mut app.surfaces;
	let working = s05_thread.conversation_id().filter(|_| s05_thread.is_working());
	let holds = |message_id: &str| s05_thread.holds(message_id);
	act(s06_composer, &Live { working, holds: &holds });
	for reply_id in std::mem::take(&mut s06_composer.released) {
		s05_thread.release_reply(&reply_id);
	}
}

fn with_open(app: &mut App, act: impl FnOnce(&mut State, &Open, &Live)) {
	let Some(open) = open::of(app) else { return };
	with_live(app, |state, live| act(state, &open, live));
}

pub fn opened(app: &mut App) {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return };
	app.surfaces.s06_composer.use_source(source);
	with_open(app, |state, open, _| state.opened(open));
}

pub fn focus_prompt(app: &mut App, conversation_id: &str, is_blocked: bool) {
	prompt::focus_prompt(app.surfaces.s06_composer.edit_of(conversation_id), is_blocked);
}

pub fn intent(app: &mut App, intent: ComposerIntent) {
	with_open(app, |state, open, live| state.intent(open, intent, live));
}

pub fn dropped(app: &mut App, paths: &[PathBuf]) {
	app.surfaces.s06_composer.is_drop_target = false;
	with_open(app, |state, open, _| state.read_files(open, paths.to_vec()));
}

pub fn hovered(app: &mut App, is_over: bool) {
	app.surfaces.s06_composer.is_drop_target = is_over;
}

pub fn pasted(app: &mut App, content: &ClipboardContent) {
	with_open(app, |state, open, _| state.pasted(open, content));
}

fn picked(app: &mut App, result: FileDialogResult, _: &mut Tx) {
	match result {
		Ok(Some(path)) => with_open(app, |state, open, _| state.read_files(open, vec![path])),
		Ok(None) => {}
		Err(failure) => app.surfaces.s06_composer.notice = Some(Notice::not_browsed(&failure)),
	}
}

pub fn key_pressed(app: &mut App, event: &KeyEvent) -> bool {
	let state = &mut app.surfaces.s06_composer;
	if event.key != Key::Escape || state.picker.is_none() {
		return false;
	}
	state.picker = None;
	true
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	let open = open::of(app);
	let mut changed = false;
	with_live(app, |state, live| {
		changed = state.take_answers(live);
		state.settle(open.as_ref(), live);
	});
	app.surfaces.s06_composer.perform(tx) || changed
}
