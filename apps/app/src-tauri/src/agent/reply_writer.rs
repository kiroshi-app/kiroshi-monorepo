use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use super::commands::AgentState;
use super::contract::{
	AgentEvent, AskedQuestion, ChatMessage, EventTurn, MessageCompletion, MessageRole,
	QuestionOption, QuestionRequest, RuntimeScope, SubmittedTurn, TransportError, TurnOutcome,
	TurnState,
};
use super::session::{Drained, EventSink};
use super::translate::now_ms;
use crate::attachments::attachment_block;
use crate::conversations::commands::{announce_conversation, ready};
use crate::conversations::context::mentioned_bot_ids;
use crate::conversations::contract::TranscriptStoreError;
use crate::conversations::host_turn::present_bot_ids;
use crate::conversations::state as conversation_state;
use crate::conversations::turn_run_deadline::arm_start_deadlines;
use crate::db;
use crate::db::repositories::conversations::{PendingPrompt, PromptKind, MISSION_KIND, TOPIC_KIND};
use crate::db::repositories::messages::{EndedRun, NewAssistantMessage, NewTurn, TerminalState};
use crate::db::DatabaseError;
use crate::events::CONVERSATION_UPDATED;

const MENTION_SIGN: char = '@';
const MENTION_OPEN: char = '<';
const QUESTION_ID_PREFIX: &str = "question-";
const OPTION_SEPARATOR: char = '\u{2014}';

#[derive(Default)]
pub struct HostWrites {
	turns: Mutex<HashSet<String>>,
	submitted: Mutex<HashSet<String>>,
	messages: Mutex<HashSet<String>>,
}

impl HostWrites {
	pub fn owns_turn(&self, id: &str) -> bool {
		held(&self.turns).contains(id)
	}

	pub fn was_submitted(&self, turn_id: &str) -> bool {
		held(&self.submitted).contains(turn_id)
	}

	pub fn owns_message(&self, id: &str) -> bool {
		held(&self.messages).contains(id)
	}

	pub(crate) fn claim_turn(&self, id: &str) {
		held(&self.turns).insert(id.to_owned());
	}

	pub(crate) fn record_submitted(&self, turn_id: &str) {
		held(&self.submitted).insert(turn_id.to_owned());
	}

	fn claim_message(&self, id: &str) {
		held(&self.messages).insert(id.to_owned());
	}
}

#[derive(Debug, Clone)]
pub struct HeldAttachment {
	pub path: PathBuf,
	pub bytes: u64,
	pub caption: Option<String>,
}

#[derive(Debug, Default)]
pub struct TurnAttachments {
	held: Mutex<Vec<HeldAttachment>>,
}

impl TurnAttachments {
	pub fn hold_with<E>(
		&self,
		attach: impl FnOnce(&[HeldAttachment]) -> Result<HeldAttachment, E>,
	) -> Result<PathBuf, E> {
		let mut held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
		let attached = attach(&held)?;
		let path = attached.path.clone();
		held.push(attached);
		Ok(path)
	}

	pub(crate) fn take(&self) -> Vec<HeldAttachment> {
		std::mem::take(&mut *self.held.lock().unwrap_or_else(PoisonError::into_inner))
	}
}

pub(crate) fn shown_with_attachments(
	text: &str,
	attached: &[HeldAttachment],
	sent_at: DateTime<Utc>,
) -> String {
	let paths: Vec<PathBuf> = attached.iter().map(|file| file.path.clone()).collect();
	let captions = attached.iter().filter_map(|file| file.caption.as_deref()).map(one_line);
	std::iter::once(text.trim_end().to_owned())
		.chain(captions)
		.chain(std::iter::once(attachment_block(&paths, sent_at)))
		.filter(|part| !part.is_empty())
		.collect::<Vec<_>>()
		.join("\n")
}

fn held(ids: &Mutex<HashSet<String>>) -> MutexGuard<'_, HashSet<String>> {
	ids.lock().unwrap_or_else(PoisonError::into_inner)
}

enum Entry {
	Submitted(SubmittedTurn),
	Withdrawn,
	Event(AgentEvent),
	Drained(oneshot::Sender<()>),
}

pub(crate) enum SettledPrompts<'a> {
	One(&'a str),
	Every,
}

pub(crate) fn prompts_settled_by(event: &AgentEvent) -> Option<SettledPrompts<'_>> {
	match event {
		AgentEvent::PermissionResolved { id, .. } => Some(SettledPrompts::One(id)),
		AgentEvent::TurnEnded { .. } => Some(SettledPrompts::Every),
		AgentEvent::Failed { error } if error.is_fatal() => Some(SettledPrompts::Every),
		_ => None,
	}
}

pub trait TurnSink: Send + Sync + 'static {
	fn emit(&self, event: AgentEvent, turn: Option<EventTurn>);
}

pub struct ReplyWriter {
	entries: mpsc::UnboundedSender<Entry>,
}

impl ReplyWriter {
	pub fn spawn<R: Runtime>(
		app: AppHandle<R>,
		scope: &RuntimeScope,
		owned: Arc<HostWrites>,
		attachments: Arc<TurnAttachments>,
		inner: Arc<dyn TurnSink>,
	) -> Self {
		let (entries, queued) = mpsc::unbounded_channel();
		let store = Store {
			app,
			conversation_id: scope.conversation_id.clone(),
			bot_id: scope.bot_id.clone(),
			runtime_session_id: scope.runtime_session_id.clone(),
			owned,
		};
		tauri::async_runtime::spawn(write_then_forward(
			queued,
			Desk { store, turn: None, attachments, inner },
		));
		Self { entries }
	}

	fn queue(&self, entry: Entry) {
		if self.entries.send(entry).is_err() {
			log::warn!("the reply writer of this run has stopped, an agent event was dropped");
		}
	}
}

impl EventSink for ReplyWriter {
	fn emit(&self, event: AgentEvent) {
		self.queue(Entry::Event(event));
	}

	fn submitted(&self, turn: SubmittedTurn) {
		self.queue(Entry::Submitted(turn));
	}

	fn withdrawn(&self) {
		self.queue(Entry::Withdrawn);
	}

	fn drained(&self) -> Drained {
		let (written, drained) = oneshot::channel();
		self.queue(Entry::Drained(written));
		Box::pin(async move {
			if drained.await.is_err() {
				log::warn!(
					"the reply writer of this run stopped before it wrote what it was handed"
				);
			}
		})
	}
}

async fn write_then_forward<R: Runtime>(
	mut queued: mpsc::UnboundedReceiver<Entry>,
	mut desk: Desk<R>,
) {
	while let Some(entry) = queued.recv().await {
		match entry {
			Entry::Submitted(turn) => desk.open_turn(turn).await,
			Entry::Withdrawn => desk.end(TerminalState::Failed).await,
			Entry::Event(event) => {
				let turn = desk.open_turn_named();
				desk.record(&event).await;
				desk.inner.emit(event, turn);
			}
			Entry::Drained(written) => {
				if written.send(()).is_err() {
					log::warn!("a shutdown stopped waiting for the reply writer of its run");
				}
			}
		}
	}
}

struct OpenTurn {
	id: String,
	prompt_id: String,
	held: Option<ChatMessage>,
	streamed: HashMap<String, u64>,
	written: HashMap<String, String>,
	settled: HashSet<String>,
	last_reply: Option<String>,
	endings: HashMap<String, TerminalState>,
}

impl OpenTurn {
	fn new(turn: SubmittedTurn) -> Self {
		Self {
			id: turn.turn_id,
			prompt_id: turn.prompt_id,
			held: None,
			streamed: HashMap::new(),
			written: HashMap::new(),
			settled: HashSet::new(),
			last_reply: None,
			endings: HashMap::new(),
		}
	}

	fn is_unwritten(&self, id: &str) -> bool {
		!self.streamed.contains_key(id) && !self.settled.contains(id)
	}

	fn take_held(&mut self, id: &str) -> Option<ChatMessage> {
		if self.held.as_ref().is_some_and(|held| held.id == id) {
			return self.held.take();
		}
		None
	}
}

struct Desk<R: Runtime> {
	store: Store<R>,
	turn: Option<OpenTurn>,
	attachments: Arc<TurnAttachments>,
	inner: Arc<dyn TurnSink>,
}

impl<R: Runtime> Desk<R> {
	fn named(&self, turn_id: &str) -> EventTurn {
		EventTurn {
			turn_id: turn_id.to_owned(),
			conversation_id: self.store.conversation_id.clone(),
		}
	}

	fn open_turn_named(&self) -> Option<EventTurn> {
		self.turn.as_ref().map(|turn| self.named(&turn.id))
	}

	async fn open_turn(&mut self, turn: SubmittedTurn) {
		self.end(TerminalState::Cancelled).await;
		match self.store.start_turn(&turn.turn_id).await {
			Ok(()) => self.turn = Some(OpenTurn::new(turn)),
			Err(error) => {
				self.store.report(&turn.turn_id, &error);
				self.turn = None;
			}
		}
	}

	async fn record(&mut self, event: &AgentEvent) {
		self.keep_prompts(event).await;
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		match event {
			AgentEvent::MessageStarted { message } => {
				if turn.is_unwritten(&message.id) {
					turn.held = Some(message.clone());
				}
			}
			AgentEvent::MessageDelta { id, seq, text } => self.stream(id, *seq, text).await,
			AgentEvent::MessageCompleted { message } => self.settle_completed(message).await,
			AgentEvent::QuestionRequested { request } => self.ask(request).await,
			AgentEvent::TurnEnded { ended } => self.end(ending_of(ended.outcome)).await,
			AgentEvent::TurnChanged { state: TurnState::Failed } => {
				self.end(TerminalState::Failed).await
			}
			_ => {}
		}
	}

	async fn open(&mut self, message: &ChatMessage) {
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		if !turn.is_unwritten(&message.id) {
			return;
		}
		match self.store.open_reply(turn, message).await {
			Ok(()) => {
				turn.streamed.insert(message.id.clone(), 0);
				turn.last_reply = Some(message.id.clone());
			}
			Err(error) => {
				self.store.report(&message.id, &error);
				turn.settled.insert(message.id.clone());
				return;
			}
		}
		self.append(&message.id, 1, &message.text).await;
	}

	async fn stream(&mut self, id: &str, seq: u64, text: &str) {
		if text.is_empty() {
			return;
		}
		if let Some(held) = self.turn.as_mut().and_then(|turn| turn.take_held(id)) {
			self.open(&held).await;
		}
		self.append(id, seq, text).await;
	}

	async fn append(&mut self, id: &str, seq: u64, text: &str) {
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		if text.is_empty() {
			return;
		}
		match turn.streamed.get(id) {
			Some(written) if seq > *written => {}
			_ => return,
		}
		turn.streamed.insert(id.to_owned(), seq);
		turn.written.entry(id.to_owned()).or_default().push_str(text);
		if let Err(error) = self.store.append_text(id, text).await {
			self.store.report(id, &error);
		}
	}

	async fn settle(&mut self, id: &str, completion: TerminalState) {
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		if turn.streamed.remove(id).is_none() {
			return;
		}
		turn.settled.insert(id.to_owned());
		turn.endings.insert(id.to_owned(), completion);
		let written = turn.written.get(id).cloned().unwrap_or_default();
		let settled_text = match self.store.settled_mentions(&written).await {
			Ok(settled) => settled,
			Err(error) => {
				self.store.report(id, &error);
				None
			}
		};
		if let Some(settled) = &settled_text {
			turn.written.insert(id.to_owned(), settled.clone());
		}
		if let Err(error) = self.store.finalize(id, completion, settled_text).await {
			self.store.report(id, &error);
		}
	}

	async fn write_reply(&mut self, message: &ChatMessage, completion: TerminalState) {
		self.open(message).await;
		self.settle(&message.id, completion).await;
	}

	async fn settle_completed(&mut self, message: &ChatMessage) {
		let Some(completion) = ending_for(message.completion) else {
			return;
		};
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		if turn.settled.contains(&message.id) {
			return;
		}
		turn.take_held(&message.id);
		if turn.is_unwritten(&message.id) && !is_worth_keeping(message, completion) {
			return;
		}
		self.write_reply(message, completion).await;
	}

	async fn settle_open(&mut self, completion: TerminalState) {
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		if let Some(held) = turn.held.take().filter(|held| is_worth_keeping(held, completion)) {
			self.write_reply(&held, completion).await;
		}
		let open: Vec<String> =
			self.turn.iter().flat_map(|turn| turn.streamed.keys().cloned()).collect();
		for id in open {
			self.settle(&id, completion).await;
		}
	}

	async fn keep_prompts(&self, event: &AgentEvent) {
		if self.store.is_quitting() {
			return;
		}
		let kept = match event {
			AgentEvent::QuestionRequested { request } => {
				self.store.hold_prompt(&request.id, PromptKind::Question, request).await
			}
			AgentEvent::PermissionRequested { request } => {
				self.store.hold_prompt(&request.id, PromptKind::Permission, request).await
			}
			_ => match prompts_settled_by(event) {
				Some(SettledPrompts::One(id)) => self.store.release_prompt(id).await,
				Some(SettledPrompts::Every) => self.store.release_prompts().await,
				None => return,
			},
		};
		if let Err(error) = kept {
			self.store.report("a pending prompt", &error);
		}
	}

	async fn ask(&mut self, request: &QuestionRequest) {
		self.settle_open(TerminalState::Complete).await;
		let Some(turn) = self.turn.as_mut() else {
			return;
		};
		let id = question_message_id_of(&request.id);
		if !turn.settled.insert(id.clone()) {
			return;
		}
		if let Err(error) =
			self.store.write_settled(turn, &id, &question_message_text(request)).await
		{
			self.store.report(&id, &error);
		}
	}

	async fn end(&mut self, completion: TerminalState) {
		self.settle_open(completion).await;
		let Some(turn) = self.turn.take() else {
			return;
		};
		self.show_attachments(&turn).await;
		let handed_to = match completion {
			TerminalState::Cancelled => Vec::new(),
			_ => self.handed_to(&turn).await,
		};
		if let Err(error) = self.store.end_run(&turn.id, handed_to).await {
			self.store.report(&turn.id, &error);
			let detail = format!("the end of turn {} could not be written: {error:?}", turn.id);
			self.inner.emit(
				AgentEvent::Failed { error: TransportError::WriteFailed { detail } },
				Some(self.named(&turn.id)),
			);
		}
	}
}

impl<R: Runtime> Desk<R> {
	async fn handed_to(&self, turn: &OpenTurn) -> Vec<String> {
		match self.store.handed_to(turn.written.values()).await {
			Ok(handed_to) => handed_to,
			Err(error) => {
				self.store.report(&turn.id, &error);
				Vec::new()
			}
		}
	}

	async fn show_attachments(&self, turn: &OpenTurn) {
		let attached = self.attachments.take();
		if attached.is_empty() {
			return;
		}
		let sent_at = Utc::now();
		let named = Some(self.named(&turn.id));
		match &turn.last_reply {
			Some(id) => {
				let written = turn.written.get(id).map(String::as_str).unwrap_or_default();
				let shown = shown_with_attachments(written, &attached, sent_at);
				if let Err(error) = self.store.replace_content(id, shown.clone()).await {
					return self.store.report(id, &error);
				}
				let ending = turn.endings.get(id).copied().unwrap_or(TerminalState::Complete);
				self.inner.emit(
					AgentEvent::MessageCompleted {
						message: reply_of(id, shown, completion_of(ending)),
					},
					named,
				);
			}
			None => {
				let id = Uuid::new_v4().to_string();
				let shown = shown_with_attachments("", &attached, sent_at);
				if let Err(error) = self.store.write_settled(turn, &id, &shown).await {
					return self.store.report(&id, &error);
				}
				self.inner.emit(
					AgentEvent::MessageStarted {
						message: reply_of(&id, String::new(), MessageCompletion::Streaming),
					},
					named.clone(),
				);
				self.inner.emit(
					AgentEvent::MessageCompleted {
						message: reply_of(&id, shown, MessageCompletion::Complete),
					},
					named,
				);
			}
		}
	}
}

struct Store<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
	runtime_session_id: String,
	owned: Arc<HostWrites>,
}

impl<R: Runtime> Store<R> {
	fn database(&self) -> Result<&db::Database, TranscriptStoreError> {
		match self.app.try_state::<db::DatabaseState>() {
			Some(state) => ready(state.inner()),
			None => Err(TranscriptStoreError::Unavailable {
				failure: (&DatabaseError::AppDataDir).into(),
			}),
		}
	}

	fn report(&self, id: &str, error: &TranscriptStoreError) {
		log::warn!(
			"the host could not write {id} of conversation {}: {error:?}",
			self.conversation_id
		);
	}

	fn is_quitting(&self) -> bool {
		self.app.try_state::<AgentState>().is_some_and(|agent| agent.is_quitting())
	}

	async fn hold_prompt(
		&self,
		prompt_id: &str,
		kind: PromptKind,
		request: &impl Serialize,
	) -> Result<(), TranscriptStoreError> {
		let request = serde_json::to_string(request).map_err(|failure| {
			DatabaseError::Sqlite(rusqlite::Error::ToSqlConversionFailure(failure.into()))
		})?;
		let prompt = PendingPrompt {
			runtime_session_id: self.runtime_session_id.clone(),
			prompt_id: prompt_id.to_owned(),
			conversation_id: self.conversation_id.clone(),
			kind,
			request,
			asked_at: now_ms(),
		};
		let database = self.database()?;
		database.conversations().hold_prompt(prompt).await?;
		self.observe_state(database).await;
		Ok(())
	}

	async fn release_prompt(&self, prompt_id: &str) -> Result<(), TranscriptStoreError> {
		let database = self.database()?;
		let (session, prompt) = (self.runtime_session_id.clone(), prompt_id.to_owned());
		database.conversations().release_prompt(session, prompt).await?;
		self.observe_state(database).await;
		Ok(())
	}

	async fn release_prompts(&self) -> Result<(), TranscriptStoreError> {
		let database = self.database()?;
		database
			.conversations()
			.release_prompts_of_session(self.runtime_session_id.clone())
			.await?;
		self.observe_state(database).await;
		Ok(())
	}

	async fn observe_state(&self, database: &db::Database) {
		conversation_state::observe_reporting(&self.app, database, &self.conversation_id).await;
	}

	async fn start_turn(&self, id: &str) -> Result<(), TranscriptStoreError> {
		let turn = NewTurn {
			id: id.to_owned(),
			conversation_id: self.conversation_id.clone(),
			started_at: now_ms(),
		};
		let database = self.database()?;
		database.messages().start_run(turn, self.bot_id.clone()).await?;
		self.owned.claim_turn(id);
		self.announce_updated(database).await;
		Ok(())
	}

	async fn open_reply(
		&self,
		turn: &OpenTurn,
		message: &ChatMessage,
	) -> Result<(), TranscriptStoreError> {
		self.open_assistant(turn, &message.id, message.timestamp).await?;
		self.announce_updated(self.database()?).await;
		Ok(())
	}

	async fn write_settled(
		&self,
		turn: &OpenTurn,
		id: &str,
		text: &str,
	) -> Result<(), TranscriptStoreError> {
		self.open_assistant(turn, id, now_ms()).await?;
		self.finalize(id, TerminalState::Complete, Some(text.to_owned())).await
	}

	async fn replace_content(&self, id: &str, text: String) -> Result<(), TranscriptStoreError> {
		Ok(self.database()?.messages().replace_content(id.to_owned(), text).await?)
	}

	async fn open_assistant(
		&self,
		turn: &OpenTurn,
		id: &str,
		created_at: i64,
	) -> Result<(), TranscriptStoreError> {
		let reply = NewAssistantMessage {
			id: id.to_owned(),
			conversation_id: self.conversation_id.clone(),
			turn_id: turn.id.clone(),
			author_bot_id: Some(self.bot_id.clone()),
			replied_to_message_id: Some(turn.prompt_id.clone()),
			created_at,
		};
		self.database()?.messages().open_assistant_message(reply).await?;
		self.owned.claim_message(id);
		Ok(())
	}

	async fn append_text(&self, id: &str, text: &str) -> Result<(), TranscriptStoreError> {
		Ok(self.database()?.messages().append_text(id.to_owned(), text.to_owned()).await?)
	}

	async fn finalize(
		&self,
		id: &str,
		completion: TerminalState,
		settled_text: Option<String>,
	) -> Result<(), TranscriptStoreError> {
		let database = self.database()?;
		database.messages().finalize_message(id.to_owned(), completion, settled_text).await?;
		self.announce_updated(database).await;
		Ok(())
	}

	async fn announce_updated(&self, database: &db::Database) {
		announce_conversation(&self.app, database, CONVERSATION_UPDATED, &self.conversation_id)
			.await;
	}

	async fn end_run(&self, id: &str, handed_to: Vec<String>) -> Result<(), TranscriptStoreError> {
		let ended = EndedRun {
			turn_id: id.to_owned(),
			bot_id: self.bot_id.clone(),
			handed_to: handed_to.clone(),
			ended_at: now_ms(),
		};
		let database = self.database()?;
		database.messages().end_run(ended).await?;
		self.announce_updated(database).await;
		arm_start_deadlines(&self.app, &self.conversation_id, id, &handed_to);
		Ok(())
	}

	async fn handed_to(
		&self,
		written: impl Iterator<Item = &String>,
	) -> Result<Vec<String>, TranscriptStoreError> {
		let mut mentioned: Vec<&str> = written
			.flat_map(|text| mentioned_bot_ids(text))
			.filter(|bot_id| *bot_id != self.bot_id)
			.collect();
		if mentioned.is_empty() {
			return Ok(Vec::new());
		}
		let seats = self.database()?.conversations().seats(self.conversation_id.clone()).await?;
		let present = present_bot_ids(&seats);
		mentioned.retain(|bot_id| present.contains(bot_id));
		mentioned.sort_unstable();
		mentioned.dedup();
		Ok(mentioned.into_iter().map(str::to_owned).collect())
	}

	async fn settled_mentions(
		&self,
		written: &str,
	) -> Result<Option<String>, TranscriptStoreError> {
		settled_mentions(self.database()?, &self.conversation_id, written).await
	}
}

pub(crate) async fn settled_mentions(
	database: &db::Database,
	conversation_id: &str,
	written: &str,
) -> Result<Option<String>, TranscriptStoreError> {
	if !written.contains(MENTION_SIGN) {
		return Ok(None);
	}
	let conversations = database.conversations();
	let kind = conversations.kind(conversation_id.to_owned()).await?;
	if !kind.as_deref().is_some_and(|kind| kind == TOPIC_KIND || kind == MISSION_KIND) {
		return Ok(None);
	}
	let seats = conversations.seats(conversation_id.to_owned()).await?;
	let present: Vec<MentionBot<'_>> = seats
		.iter()
		.filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
		.map(|seat| MentionBot { id: &seat.bot_id, name: &seat.name })
		.collect();
	let settled = to_mention_tokens(written, &present);
	Ok((settled != written).then_some(settled))
}

fn reply_of(id: &str, text: String, completion: MessageCompletion) -> ChatMessage {
	ChatMessage {
		id: id.to_owned(),
		role: MessageRole::Assistant,
		text,
		completion,
		timestamp: now_ms(),
	}
}

fn completion_of(ending: TerminalState) -> MessageCompletion {
	match ending {
		TerminalState::Complete => MessageCompletion::Complete,
		TerminalState::Cancelled => MessageCompletion::Cancelled,
		TerminalState::Failed | TerminalState::Interrupted => MessageCompletion::Failed,
	}
}

fn ending_for(completion: MessageCompletion) -> Option<TerminalState> {
	match completion {
		MessageCompletion::Streaming => None,
		MessageCompletion::Complete => Some(TerminalState::Complete),
		MessageCompletion::Cancelled => Some(TerminalState::Cancelled),
		MessageCompletion::Failed => Some(TerminalState::Failed),
	}
}

fn ending_of(outcome: TurnOutcome) -> TerminalState {
	match outcome {
		TurnOutcome::Completed => TerminalState::Complete,
		TurnOutcome::Cancelled => TerminalState::Cancelled,
		TurnOutcome::Failed => TerminalState::Failed,
	}
}

fn is_worth_keeping(message: &ChatMessage, completion: TerminalState) -> bool {
	!message.text.is_empty() || completion != TerminalState::Complete
}

fn question_message_id_of(request_id: &str) -> String {
	format!("{QUESTION_ID_PREFIX}{request_id}")
}

fn question_message_text(request: &QuestionRequest) -> String {
	request.questions.iter().flat_map(asked_lines).collect::<Vec<_>>().join("\n")
}

fn asked_lines(asked: &AskedQuestion) -> impl Iterator<Item = String> + '_ {
	std::iter::once(format!("### {}", one_line(&asked.question)))
		.chain(asked.options.iter().map(option_line))
}

fn option_line(option: &QuestionOption) -> String {
	match option.description.as_deref().filter(|description| !description.is_empty()) {
		Some(description) => {
			format!("- {} {OPTION_SEPARATOR} {}", one_line(&option.label), one_line(description))
		}
		None => format!("- {}", one_line(&option.label)),
	}
}

fn one_line(text: &str) -> String {
	text.split(is_js_whitespace).filter(|word| !word.is_empty()).collect::<Vec<_>>().join(" ")
}

fn is_js_whitespace(character: char) -> bool {
	(character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}

struct MentionBot<'a> {
	id: &'a str,
	name: &'a str,
}

fn to_mention_tokens(text: &str, bots: &[MentionBot<'_>]) -> String {
	let chars: Vec<char> = text.chars().collect();
	let mut written = String::new();
	let mut read = 0;
	while let Some(at) = (read..chars.len()).find(|&index| chars[index] == MENTION_SIGN) {
		written.extend(&chars[read..at]);
		let follows_open = at > 0 && chars[at - 1] == MENTION_OPEN;
		match bot_named_at(&chars, at + 1, bots).filter(|_| !follows_open) {
			Some(bot) => {
				written.push_str(&format!("<@{}>", bot.id));
				read = at + 1 + bot.name.chars().count();
			}
			None => {
				written.push(MENTION_SIGN);
				read = at + 1;
			}
		}
	}
	written.extend(&chars[read..]);
	written
}

fn bot_named_at<'a, 'b>(
	chars: &[char],
	from: usize,
	bots: &'a [MentionBot<'b>],
) -> Option<&'a MentionBot<'b>> {
	let mut found: Option<&MentionBot<'_>> = None;
	for bot in bots {
		if bot.name.is_empty() || !is_named_at(chars, from, bot.name) {
			continue;
		}
		if found.is_none_or(|kept| bot.name.chars().count() > kept.name.chars().count()) {
			found = Some(bot);
		}
	}
	found
}

fn is_named_at(chars: &[char], from: usize, name: &str) -> bool {
	let start = from.min(chars.len());
	let end = (from + name.chars().count()).min(chars.len());
	let spelled: String = chars[start..end].iter().collect();
	spelled.to_lowercase() == name.to_lowercase()
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::Listener;

	use super::super::contract::{ActivityEvent, ActivityKind, ActivityStatus};
	use super::*;
	use crate::agent::commands;
	use crate::conversations::turn_run_deadline::TurnRunDeadlines;
	use crate::db::repositories::conversations::{
		BotIdentity, ConversationDraft, DEFAULT_BOT_ID, DEFAULT_BOT_MODEL,
	};
	use crate::db::repositories::messages::{
		MessageRole, MessageState, NewUserMessage, StoredMessage, WrittenFrom,
	};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const RUNTIME_SESSION_ID: &str = "rs1";

	type Heard = (AgentEvent, Option<EventTurn>);

	const PERSONAL_SPACE: &str = "personal";

	impl TurnSink for mpsc::UnboundedSender<Heard> {
		fn emit(&self, event: AgentEvent, turn: Option<EventTurn>) {
			self.send((event, turn)).expect("the test is listening");
		}
	}

	struct Unheard;

	impl TurnSink for Unheard {
		fn emit(&self, _event: AgentEvent, _turn: Option<EventTurn>) {}
	}

	struct Written {
		app: AppOfItsOwn,
		conversation_id: String,
		attachments: Arc<TurnAttachments>,
	}

	impl Written {
		async fn new(name: &str) -> Self {
			let app = an_app_of_its_own(&format!("reply-writer-{name}"), mock_builder());
			app.manage(db::bootstrap(app.handle()));
			let written = Self { app, conversation_id: String::new(), attachments: Arc::default() };
			let conversations = written.database().conversations();
			conversations.ensure_default_bot().await.expect("the bot is seeded");
			let chat = conversations
				.ensure_chat(DEFAULT_BOT_ID.to_owned(), None)
				.await
				.expect("the chat is seeded");
			Self { conversation_id: chat.id, ..written }
		}

		fn database(&self) -> &db::Database {
			ready(self.app.state::<db::DatabaseState>().inner()).expect("the database opens")
		}

		fn desk(&self) -> Desk<MockRuntime> {
			self.desk_telling(Arc::new(Unheard))
		}

		fn desk_telling(&self, inner: Arc<dyn TurnSink>) -> Desk<MockRuntime> {
			self.desk_of_telling(DEFAULT_BOT_ID, inner)
		}

		fn desk_of(&self, bot_id: &str) -> Desk<MockRuntime> {
			self.desk_of_telling(bot_id, Arc::new(Unheard))
		}

		fn desk_of_telling(&self, bot_id: &str, inner: Arc<dyn TurnSink>) -> Desk<MockRuntime> {
			let store = Store {
				app: self.app.handle().clone(),
				conversation_id: self.conversation_id.clone(),
				bot_id: bot_id.to_owned(),
				runtime_session_id: RUNTIME_SESSION_ID.to_owned(),
				owned: Arc::default(),
			};
			Desk { store, turn: None, attachments: self.attachments.clone(), inner }
		}

		async fn in_a_room_of_two(name: &str) -> (Self, String) {
			let written = Self::new(name).await;
			let conversations = written.database().conversations();
			let identity = BotIdentity {
				name: "Ada".to_owned(),
				title: String::new(),
				model: DEFAULT_BOT_MODEL.to_owned(),
				avatar_blot: None,
				avatar_image_path: None,
				instructions: String::new(),
				denied_tools: Vec::new(),
				effort: None,
			};
			let ada = conversations
				.create_bot(identity, Some(PERSONAL_SPACE.to_owned()), None)
				.await
				.expect("the second bot is created");
			let room = conversations
				.create_conversation(ConversationDraft {
					space_id: PERSONAL_SPACE.to_owned(),
					section_id: None,
					title: "Room".to_owned(),
					icon: None,
					bot_ids: vec![DEFAULT_BOT_ID.to_owned(), ada.id.clone()],
				})
				.await
				.expect("the room is created");
			(Self { conversation_id: room.id, ..written }, ada.id)
		}

		async fn forwarded(&self, entries: Vec<Entry>) -> Vec<AgentEvent> {
			self.forwarded_with_turns(entries).await.into_iter().map(|(event, _)| event).collect()
		}

		async fn forwarded_with_turns(&self, entries: Vec<Entry>) -> Vec<Heard> {
			let (told, mut heard) = mpsc::unbounded_channel::<Heard>();
			let (queue, queued) = mpsc::unbounded_channel();
			for entry in entries {
				queue.send(entry).expect("the entry is queued");
			}
			drop(queue);
			write_then_forward(queued, self.desk_telling(Arc::new(told))).await;
			let mut events = Vec::new();
			while let Ok(event) = heard.try_recv() {
				events.push(event);
			}
			events
		}

		async fn prompt(&self, turn_id: &str, prompt_id: &str) {
			let messages = self.database().messages();
			let turn = NewTurn {
				id: turn_id.to_owned(),
				conversation_id: self.conversation_id.clone(),
				started_at: 1,
			};
			messages.start_turn(turn).await.expect("the turn starts");
			let said = NewUserMessage {
				id: prompt_id.to_owned(),
				conversation_id: self.conversation_id.clone(),
				turn_id: turn_id.to_owned(),
				author_bot_id: None,
				author: Default::default(),
				written_from: WrittenFrom::Here,
				replied_to_message_id: None,
				content: "hello".to_owned(),
				created_at: 1,
			};
			messages.append_user_message(said).await.expect("the prompt is stored");
		}

		async fn completed_at(&self, turn_id: &'static str) -> Option<i64> {
			self.database()
				.messages()
				.call(move |connection| {
					Ok(connection.query_row(
						"SELECT completed_at FROM turns WHERE id = ?1",
						[turn_id],
						|row| row.get(0),
					)?)
				})
				.await
				.expect("the turn reads")
		}
	}

	fn submitted(turn_id: &str, prompt_id: &str) -> SubmittedTurn {
		SubmittedTurn { turn_id: turn_id.to_owned(), prompt_id: prompt_id.to_owned() }
	}

	fn streaming(id: &str) -> ChatMessage {
		ChatMessage {
			id: id.to_owned(),
			role: super::super::contract::MessageRole::Assistant,
			text: String::new(),
			completion: MessageCompletion::Streaming,
			timestamp: 2,
		}
	}

	#[tokio::test]
	async fn a_turn_submitted_over_an_open_one_cancels_its_replies_and_completes_it() {
		let written = Written::new("overlap").await;
		written.prompt("t1", "p1").await;
		let mut desk = written.desk();

		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&AgentEvent::MessageStarted { message: streaming("m1") }).await;
		desk.record(&AgentEvent::MessageDelta { id: "m1".into(), seq: 1, text: "half".into() })
			.await;
		desk.open_turn(submitted("t2", "p2")).await;

		let earlier = written
			.database()
			.messages()
			.message(written.conversation_id.clone(), "m1".into())
			.await
			.expect("the reply reads")
			.expect("the reply is stored");
		assert_eq!(earlier.role, MessageRole::Assistant);
		assert_eq!(earlier.content, "half");
		assert_eq!(earlier.state, MessageState::Cancelled);
		assert!(written.completed_at("t1").await.is_some(), "the earlier turn was left open");
		assert_eq!(written.completed_at("t2").await, None, "the new turn was closed");
	}

	fn option(label: &str, description: Option<&str>) -> QuestionOption {
		QuestionOption {
			label: label.to_owned(),
			description: description.map(str::to_owned),
			preview: None,
		}
	}

	fn asked(question: &str, options: Vec<QuestionOption>) -> AskedQuestion {
		AskedQuestion {
			header: "Pick".to_owned(),
			question: question.to_owned(),
			options,
			multi_select: false,
		}
	}

	fn question(request_id: &str) -> AgentEvent {
		AgentEvent::QuestionRequested {
			request: QuestionRequest {
				id: request_id.to_owned(),
				questions: vec![
					asked(
						"Which  wall\nfirst?",
						vec![option("North", Some(" the cold\tone ")), option("South", None)],
					),
					asked("Paint @Ada?", vec![option(" Yes ", Some("")), option("No", None)]),
				],
				subject: None,
			},
		}
	}

	const QUESTION_TEXT: &str =
		"### Which wall first?\n- North \u{2014} the cold one\n- South\n### Paint @Ada?\n- Yes\n- No";

	impl Written {
		async fn stored(&self, id: &str) -> Option<StoredMessage> {
			self.database()
				.messages()
				.message(self.conversation_id.clone(), id.to_owned())
				.await
				.expect("the message reads")
		}

		async fn assistant_rows(&self) -> i64 {
			self.database()
				.messages()
				.call(|connection| {
					Ok(connection.query_row(
						"SELECT COUNT(*) FROM messages WHERE role = 'assistant'",
						[],
						|row| row.get(0),
					)?)
				})
				.await
				.expect("the rows count")
		}
	}

	#[tokio::test]
	async fn a_question_stores_its_line_after_the_settled_reply_of_the_turn() {
		let written = Written::new("question").await;
		written.prompt("t1", "p1").await;
		let mut desk = written.desk();

		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&AgentEvent::MessageStarted { message: streaming("m1") }).await;
		desk.record(&AgentEvent::MessageDelta {
			id: "m1".into(),
			seq: 1,
			text: "let me ask".into(),
		})
		.await;
		desk.record(&question("r1")).await;

		let reply = written.stored("m1").await.expect("the reply is stored");
		let asked = written.stored("question-r1").await.expect("the question is stored");
		assert_eq!(reply.state, MessageState::Complete);
		assert_eq!(asked.role, MessageRole::Assistant);
		assert_eq!(asked.turn_id, "t1");
		assert_eq!(asked.author_bot_id.as_deref(), Some(DEFAULT_BOT_ID));
		assert_eq!(asked.replied_to_message_id.as_deref(), Some("p1"));
		assert_eq!(asked.state, MessageState::Complete);
		assert!(asked.seq > reply.seq, "the question landed before the reply");
		assert_eq!(asked.content, QUESTION_TEXT);
		assert!(desk.store.owned.owns_message("question-r1"));
	}

	#[tokio::test]
	async fn a_question_asked_twice_in_a_turn_stores_one_line() {
		let written = Written::new("question-twice").await;
		written.prompt("t1", "p1").await;
		let mut desk = written.desk();

		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&question("r1")).await;
		desk.record(&question("r1")).await;

		assert_eq!(written.assistant_rows().await, 1);
	}

	#[tokio::test]
	async fn a_question_whose_line_fails_to_persist_is_still_held_for_a_later_listener() {
		let written = Written::new("question-unpersisted").await;
		written.prompt("t1", "p1").await;
		written
			.database()
			.messages()
			.call(|connection| {
				Ok(connection.execute(
					"CREATE TRIGGER refused BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'refused'); END",
					[],
				)?)
			})
			.await
			.expect("the trigger lands");
		let scope = RuntimeScope {
			conversation_id: written.conversation_id.clone(),
			bot_id: DEFAULT_BOT_ID.to_owned(),
			runtime_session_id: "r1".to_owned(),
			epoch: 1,
		};
		let run = commands::a_run_held_by_the_app(written.app.handle(), scope);
		let (queue, queued) = mpsc::unbounded_channel();
		queue.send(Entry::Submitted(submitted("t1", "p1"))).expect("the turn is queued");
		queue.send(Entry::Event(question("r1"))).expect("the question is queued");
		drop(queue);

		write_then_forward(queued, written.desk_telling(Arc::new(run))).await;

		assert_eq!(written.stored("question-r1").await, None);
		let (pending, _) = commands::subscribed_with_pending_questions(written.app.handle());
		assert_eq!(pending.len(), 1);
	}

	#[tokio::test]
	async fn a_question_without_an_open_turn_stores_nothing() {
		let written = Written::new("question-no-turn").await;
		let mut desk = written.desk();

		desk.record(&question("r1")).await;

		assert_eq!(written.stored("question-r1").await, None);
		assert!(!desk.store.owned.owns_message("question-r1"));
	}

	#[test]
	fn a_question_line_folds_every_javascript_whitespace_and_keeps_the_rest() {
		assert_eq!(one_line("\u{feff}a\u{a0}\u{2028}b\u{85}c "), "a b\u{85}c");
	}

	const BOTS: [MentionBot<'static>; 3] = [
		MentionBot { id: "ada", name: "Ada" },
		MentionBot { id: "adam", name: "Adam Smith" },
		MentionBot { id: "nyx", name: "Nyx" },
	];

	#[test]
	fn a_name_behind_an_arobase_becomes_the_token_of_that_companion() {
		assert_eq!(to_mention_tokens("@Ada take the walls", &BOTS), "<@ada> take the walls");
	}

	#[test]
	fn the_longest_name_wins_so_a_shorter_one_does_not_swallow_it() {
		assert_eq!(to_mention_tokens("@Adam Smith and @Ada", &BOTS), "<@adam> and <@ada>");
	}

	#[test]
	fn a_name_reads_whatever_its_case() {
		assert_eq!(to_mention_tokens("@nyx", &BOTS), "<@nyx>");
	}

	#[test]
	fn an_arobase_naming_nobody_and_a_token_already_written_stay_alone() {
		assert_eq!(to_mention_tokens("write to me@example.com", &BOTS), "write to me@example.com");
		assert_eq!(to_mention_tokens("<@ada> again", &BOTS), "<@ada> again");
	}

	#[test]
	fn a_message_ends_worth_keeping_unless_it_completes_empty() {
		let empty = ChatMessage {
			id: "m1".into(),
			role: super::super::contract::MessageRole::Assistant,
			text: String::new(),
			completion: MessageCompletion::Complete,
			timestamp: 1,
		};
		assert!(!is_worth_keeping(&empty, TerminalState::Complete));
		assert!(is_worth_keeping(&empty, TerminalState::Cancelled));
		assert!(is_worth_keeping(
			&ChatMessage { text: "hi".into(), ..empty },
			TerminalState::Complete
		));
	}

	fn attach(written: &Written, path: &str, caption: Option<&str>) {
		written
			.attachments
			.hold_with(|_| {
				Ok::<_, ()>(HeldAttachment {
					path: PathBuf::from(path),
					bytes: 1,
					caption: caption.map(str::to_owned),
				})
			})
			.expect("the attachment is held");
	}

	fn with_block(text: &str, paths: &[&str]) -> impl Fn(&str) {
		let expected_prefix = text.to_owned();
		let listed: Vec<String> = paths
			.iter()
			.enumerate()
			.map(|(index, path)| format!("{}/{} {path}", index + 1, paths.len()))
			.collect();
		let noun = if paths.len() == 1 { "file" } else { "files" };
		let count = paths.len();
		move |content: &str| {
			let (head, block) = content
				.split_once("Attached to this message, sent ")
				.expect("the message carries a block");
			assert_eq!(head, expected_prefix, "the text above the block moved");
			let mut lines = block.lines();
			let header = lines.next().expect("the header line");
			assert!(header.ends_with(&format!(", {count} {noun}:")), "header {header}");
			assert_eq!(lines.map(str::to_owned).collect::<Vec<_>>(), listed);
		}
	}

	#[tokio::test]
	async fn text_streamed_then_an_attach_ends_the_reply_with_its_block() {
		let written = Written::new("attach-after-text").await;
		written.prompt("t1", "p1").await;
		let mut desk = written.desk();

		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&AgentEvent::MessageStarted { message: streaming("m1") }).await;
		desk.record(&AgentEvent::MessageDelta { id: "m1".into(), seq: 1, text: "Here".into() })
			.await;
		desk.record(&AgentEvent::MessageCompleted {
			message: ChatMessage {
				text: "Here".into(),
				completion: MessageCompletion::Complete,
				..streaming("m1")
			},
		})
		.await;
		attach(&written, "/data/attachments/c/a.png", Some("The  chart\nof May"));
		desk.end(TerminalState::Complete).await;

		let reply = written.stored("m1").await.expect("the reply is stored");
		with_block("Here\nThe chart of May\n", &["/data/attachments/c/a.png"])(&reply.content);
		assert_eq!(reply.state, MessageState::Complete);
	}

	#[tokio::test]
	async fn two_attaches_of_one_turn_share_one_block_in_call_order() {
		let written = Written::new("attach-twice").await;
		written.prompt("t1", "p1").await;
		let mut desk = written.desk();

		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&AgentEvent::MessageStarted { message: streaming("m1") }).await;
		desk.record(&AgentEvent::MessageDelta { id: "m1".into(), seq: 1, text: "Two".into() })
			.await;
		attach(&written, "/data/attachments/c/a.png", None);
		attach(&written, "/data/attachments/c/b.gif", Some("Second"));
		desk.end(TerminalState::Complete).await;

		let reply = written.stored("m1").await.expect("the reply is stored");
		with_block("Two\nSecond\n", &["/data/attachments/c/a.png", "/data/attachments/c/b.gif"])(
			&reply.content,
		);
		assert_eq!(written.assistant_rows().await, 1);
	}

	#[tokio::test]
	async fn a_turn_without_text_still_leaves_a_reply_carrying_the_block() {
		let written = Written::new("attach-silent").await;
		written.prompt("t1", "p1").await;
		let mut desk = written.desk();

		desk.open_turn(submitted("t1", "p1")).await;
		attach(&written, "/data/attachments/c/a.png", None);
		desk.end(TerminalState::Complete).await;

		let content: String = written
			.database()
			.messages()
			.call(|connection| {
				Ok(connection.query_row(
					"SELECT content FROM messages WHERE role = 'assistant' AND turn_id = 't1'",
					[],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the reply is stored");
		with_block("", &["/data/attachments/c/a.png"])(&content);
	}

	#[tokio::test]
	async fn a_turn_cancelled_or_failed_after_an_attach_keeps_the_block_on_its_reply() {
		for (name, ending, state) in [
			("attach-cancelled", TerminalState::Cancelled, MessageState::Cancelled),
			("attach-failed", TerminalState::Failed, MessageState::Failed),
		] {
			let written = Written::new(name).await;
			written.prompt("t1", "p1").await;
			let mut desk = written.desk();

			desk.open_turn(submitted("t1", "p1")).await;
			desk.record(&AgentEvent::MessageStarted { message: streaming("m1") }).await;
			desk.record(&AgentEvent::MessageDelta { id: "m1".into(), seq: 1, text: "half".into() })
				.await;
			attach(&written, "/data/attachments/c/a.png", None);
			desk.end(ending).await;

			let reply = written.stored("m1").await.expect("the reply is stored");
			with_block("half\n", &["/data/attachments/c/a.png"])(&reply.content);
			assert_eq!(reply.state, state);
		}
	}

	fn turn_ended() -> AgentEvent {
		AgentEvent::TurnEnded {
			ended: super::super::contract::TurnEnded {
				session_id: None,
				outcome: TurnOutcome::Completed,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		}
	}

	fn a_spoken_turn() -> Vec<AgentEvent> {
		vec![
			AgentEvent::MessageStarted { message: streaming("m1") },
			AgentEvent::MessageDelta { id: "m1".into(), seq: 1, text: "Here".into() },
			AgentEvent::MessageCompleted {
				message: ChatMessage {
					text: "Here".into(),
					completion: MessageCompletion::Complete,
					..streaming("m1")
				},
			},
			turn_ended(),
		]
	}

	fn entries_of(events: &[AgentEvent]) -> Vec<Entry> {
		std::iter::once(Entry::Submitted(submitted("t1", "p1")))
			.chain(events.iter().cloned().map(Entry::Event))
			.collect()
	}

	#[tokio::test]
	async fn a_run_whose_end_fails_to_persist_tells_the_failure_before_the_turn_ends() {
		let written = Written::new("end-unpersisted").await;
		written.prompt("t1", "p1").await;
		written
			.database()
			.messages()
			.call(|connection| {
				Ok(connection.execute(
					"CREATE TRIGGER refused BEFORE DELETE ON turn_runs BEGIN SELECT RAISE(ABORT, 'refused'); END",
					[],
				)?)
			})
			.await
			.expect("the trigger lands");

		let heard = written.forwarded_with_turns(entries_of(&[turn_ended()])).await;

		let named = Some(EventTurn {
			turn_id: "t1".to_owned(),
			conversation_id: written.conversation_id.clone(),
		});
		assert_eq!(heard.len(), 2, "heard {heard:#?}");
		assert!(
			matches!(
				&heard[0],
				(AgentEvent::Failed { error: TransportError::WriteFailed { detail } }, turn)
					if detail.contains("t1") && turn == &named
			),
			"heard {heard:#?}"
		);
		assert_eq!(heard[1], (turn_ended(), named));
	}

	#[tokio::test]
	async fn a_turn_without_attachments_forwards_exactly_the_events_it_received() {
		let written = Written::new("attach-none-forwarded").await;
		written.prompt("t1", "p1").await;
		let spoken = a_spoken_turn();

		let heard = written.forwarded(entries_of(&spoken)).await;

		assert_eq!(heard, spoken);
	}

	#[tokio::test]
	async fn the_block_on_the_last_reply_is_told_as_its_completion_before_the_turn_ends() {
		let written = Written::new("attach-told").await;
		written.prompt("t1", "p1").await;
		let spoken = a_spoken_turn();
		attach(&written, "/data/attachments/c/a.png", None);

		let heard = written.forwarded(entries_of(&spoken)).await;

		let stored = written.stored("m1").await.expect("the reply is stored").content;
		assert_eq!(heard.len(), spoken.len() + 1);
		assert_eq!(heard[..3], spoken[..3]);
		match &heard[3] {
			AgentEvent::MessageCompleted { message } => {
				assert_eq!(message.id, "m1");
				assert_eq!(message.text, stored);
				assert_eq!(message.completion, MessageCompletion::Complete);
			}
			other => panic!("expected the completion of m1, got {other:?}"),
		}
		assert_eq!(heard[4], turn_ended());
	}

	#[tokio::test]
	async fn a_block_without_a_reply_is_told_as_a_new_reply_before_the_turn_ends() {
		let written = Written::new("attach-told-silent").await;
		written.prompt("t1", "p1").await;
		attach(&written, "/data/attachments/c/a.png", None);

		let heard = written.forwarded(entries_of(&[turn_ended()])).await;

		assert_eq!(heard.len(), 3, "{heard:?}");
		let AgentEvent::MessageStarted { message: started } = &heard[0] else {
			panic!("expected a started reply, got {:?}", heard[0]);
		};
		let AgentEvent::MessageCompleted { message: completed } = &heard[1] else {
			panic!("expected a completed reply, got {:?}", heard[1]);
		};
		assert_eq!(started.id, completed.id);
		assert_eq!(completed.completion, MessageCompletion::Complete);
		let stored = written.stored(&completed.id).await.expect("the reply is stored").content;
		assert_eq!(completed.text, stored);
		with_block("", &["/data/attachments/c/a.png"])(&stored);
		assert_eq!(heard[2], turn_ended());
	}

	#[tokio::test]
	async fn a_block_that_could_not_be_stored_is_told_nowhere() {
		let written = Written::new("attach-unstored").await;
		written.prompt("t1", "p1").await;
		let spoken = a_spoken_turn();
		let (told, mut heard) = mpsc::unbounded_channel::<Heard>();
		let mut desk = written.desk_telling(Arc::new(told));
		desk.open_turn(submitted("t1", "p1")).await;
		for event in &spoken[..3] {
			desk.record(event).await;
		}
		written
			.database()
			.messages()
			.call(|connection| Ok(connection.execute("DELETE FROM messages WHERE id = 'm1'", [])?))
			.await
			.expect("the reply is removed");
		attach(&written, "/data/attachments/c/a.png", None);

		desk.record(&turn_ended()).await;

		assert!(heard.try_recv().is_err(), "a block that was not stored was told");
	}

	#[tokio::test]
	async fn every_event_of_an_open_turn_names_that_turn_and_its_conversation() {
		let written = Written::new("turn-named").await;
		written.prompt("t1", "p1").await;
		let after_the_end = AgentEvent::TurnChanged { state: TurnState::Idle };
		let mut events = a_spoken_turn();
		events.push(after_the_end.clone());

		let heard = written.forwarded_with_turns(entries_of(&events)).await;

		let named = Some(EventTurn {
			turn_id: "t1".to_owned(),
			conversation_id: written.conversation_id.clone(),
		});
		let (spoken, after) = heard.split_at(heard.len() - 1);
		assert!(spoken.iter().any(|(event, _)| matches!(event, AgentEvent::MessageDelta { .. })));
		assert!(spoken.iter().any(|(event, _)| *event == turn_ended()));
		assert!(spoken.iter().all(|(_, turn)| *turn == named), "{spoken:?}");
		assert_eq!(after, [(after_the_end, None)]);
	}

	#[tokio::test]
	async fn a_run_submitted_without_a_turn_names_no_turn() {
		let written = Written::new("turn-unnamed").await;

		let heard = written
			.forwarded_with_turns(a_spoken_turn().into_iter().map(Entry::Event).collect())
			.await;

		assert_eq!(heard.len(), a_spoken_turn().len());
		assert!(heard.iter().all(|(_, turn)| turn.is_none()), "{heard:?}");
	}

	#[tokio::test]
	async fn a_withdrawn_turn_names_no_turn_on_the_events_that_follow() {
		let written = Written::new("turn-withdrawn").await;
		written.prompt("t1", "p1").await;
		let late = AgentEvent::TurnChanged { state: TurnState::Idle };

		let heard = written
			.forwarded_with_turns(vec![
				Entry::Submitted(submitted("t1", "p1")),
				Entry::Withdrawn,
				Entry::Event(late.clone()),
			])
			.await;

		assert_eq!(heard, [(late, None)]);
	}

	fn listen_to_updates(written: &Written) -> Arc<Mutex<Vec<serde_json::Value>>> {
		let heard = Arc::new(Mutex::new(Vec::new()));
		let kept = heard.clone();
		written.app.handle().listen(crate::conversations::contract::UPDATED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("the payload is JSON");
			kept.lock().expect("the list is kept").push(payload);
		});
		heard
	}

	async fn send_prompt(written: &Written, turn_id: &str, prompt_id: &str) {
		let message = crate::conversations::contract::NewUserMessage {
			id: prompt_id.to_owned(),
			conversation_id: written.conversation_id.clone(),
			turn_id: turn_id.to_owned(),
			author_bot_id: None,
			replied_to_message_id: None,
			content: "hello".to_owned(),
			created_at: 1,
		};
		crate::conversations::commands::conversation_send_user_message(
			written.app.handle().clone(),
			written.app.state(),
			crate::hosting::authorship::Caller::Host,
			message,
			vec![DEFAULT_BOT_ID.to_owned()],
		)
		.await
		.expect("the prompt is sent");
	}

	fn a_tool_call(status: ActivityStatus) -> AgentEvent {
		AgentEvent::Activity {
			activity: ActivityEvent {
				id: "tool-1".into(),
				title: "Read a file".into(),
				kind: ActivityKind::Tool,
				status,
			},
		}
	}

	fn completed(id: &str, text: &str, timestamp: i64) -> AgentEvent {
		AgentEvent::MessageCompleted {
			message: ChatMessage {
				text: text.into(),
				completion: MessageCompletion::Complete,
				timestamp,
				..streaming(id)
			},
		}
	}

	fn a_turn_with_ten_deltas_a_tool_call_and_two_replies() -> Vec<Entry> {
		let deltas = (1..=10).map(|seq| AgentEvent::MessageDelta {
			id: "m1".into(),
			seq,
			text: format!("w{seq} "),
		});
		let events = std::iter::once(AgentEvent::MessageStarted { message: streaming("m1") })
			.chain(deltas)
			.chain([
				completed("m1", "", 2),
				a_tool_call(ActivityStatus::Running),
				a_tool_call(ActivityStatus::Succeeded),
				AgentEvent::MessageStarted {
					message: ChatMessage { timestamp: 3, ..streaming("m2") },
				},
				AgentEvent::MessageDelta { id: "m2".into(), seq: 1, text: "Done".into() },
				completed("m2", "Done", 3),
				turn_ended(),
			]);
		std::iter::once(Entry::Submitted(submitted("t1", "p1")))
			.chain(events.map(Entry::Event))
			.collect()
	}

	#[tokio::test]
	async fn one_agent_turn_announces_its_conversation_open_from_its_start_to_its_completion() {
		let written = Written::new("updates-per-turn").await;
		let heard = listen_to_updates(&written);

		send_prompt(&written, "t1", "p1").await;
		written.forwarded(a_turn_with_ten_deltas_a_tool_call_and_two_replies()).await;

		let heard = heard.lock().expect("the list is kept");
		let rows: Vec<_> = heard
			.iter()
			.map(|payload| {
				let conversation = &payload["conversation"];
				(conversation["lastWord"]["text"].clone(), conversation["activeTurn"].clone())
			})
			.collect();
		let started = json!({ "bots": [] });
		let speaking = json!({ "bots": [{ "botId": DEFAULT_BOT_ID, "startedAt": 1 }] });
		let first_reply = json!("w1 w2 w3 w4 w5 w6 w7 w8 w9 w10");
		assert_eq!(
			rows,
			[
				(json!("hello"), started),
				(json!("hello"), speaking.clone()),
				(json!("hello"), speaking.clone()),
				(first_reply.clone(), speaking.clone()),
				(first_reply, speaking.clone()),
				(json!("Done"), speaking),
				(json!("Done"), json!(null)),
			]
		);
		assert_eq!(
			heard.last().map(|payload| &payload["conversation"]["lastWord"]),
			Some(&json!({
				"text": "Done",
				"at": 3,
				"authorBotId": DEFAULT_BOT_ID,
				"authorAccountId": null,
				"authorName": null,
				"writtenFrom": null,
			}))
		);
	}

	async fn last_update_after(name: &str, ending: Entry) -> (serde_json::Value, Option<i64>) {
		let written = Written::new(name).await;
		written.prompt("t1", "p1").await;
		let heard = listen_to_updates(&written);

		written
			.forwarded(vec![
				Entry::Submitted(submitted("t1", "p1")),
				Entry::Event(AgentEvent::MessageStarted { message: streaming("m1") }),
				Entry::Event(AgentEvent::MessageDelta {
					id: "m1".into(),
					seq: 1,
					text: "half".into(),
				}),
				ending,
			])
			.await;

		let last = heard
			.lock()
			.expect("the list is kept")
			.last()
			.cloned()
			.expect("an update was announced");
		(last["conversation"]["activeTurn"].clone(), written.completed_at("t1").await)
	}

	#[tokio::test]
	async fn a_turn_ended_cancelled_or_failed_is_completed_and_announced_closed() {
		let cancelled = AgentEvent::TurnEnded {
			ended: super::super::contract::TurnEnded {
				session_id: None,
				outcome: TurnOutcome::Cancelled,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		};

		let (after_cancel, cancel_completed_at) =
			last_update_after("cancelled-turn", Entry::Event(cancelled)).await;
		let (after_failure, failure_completed_at) =
			last_update_after("failed-turn", Entry::Withdrawn).await;

		assert_eq!(after_cancel, json!(null));
		assert!(cancel_completed_at.is_some(), "the cancelled turn was left open");
		assert_eq!(after_failure, json!(null));
		assert!(failure_completed_at.is_some(), "the failed turn was left open");
	}

	#[tokio::test]
	async fn a_finalized_reply_announces_the_page_row_of_its_conversation() {
		let written = Written::new("update-payload").await;
		written.prompt("t1", "p1").await;
		let heard = listen_to_updates(&written);

		let turn = std::iter::once(Entry::Submitted(submitted("t1", "p1")))
			.chain(a_spoken_turn().into_iter().map(Entry::Event))
			.collect();
		written.forwarded(turn).await;

		let heard = heard.lock().expect("the list is kept");
		let [started, opened, payload, completed] = heard.as_slice() else {
			panic!("four updates were expected, {} were heard", heard.len());
		};
		let bots_of =
			|update: &serde_json::Value| update["conversation"]["activeTurn"]["bots"].clone();
		let speaking = json!([{ "botId": DEFAULT_BOT_ID, "startedAt": 1 }]);
		assert_eq!(bots_of(started), speaking);
		assert_eq!(bots_of(opened), speaking);
		assert_eq!(bots_of(payload), speaking);
		assert_eq!(completed["conversation"]["activeTurn"], json!(null));
		let conversation = &payload["conversation"];
		let mut fields: Vec<&str> = conversation
			.as_object()
			.expect("the conversation is an object")
			.keys()
			.map(String::as_str)
			.collect();
		fields.sort_unstable();
		assert_eq!(payload["spaceId"], json!("personal"));
		assert_eq!(
			fields,
			[
				"activeTurn",
				"color",
				"createdAt",
				"icon",
				"id",
				"instructions",
				"lastActivityAt",
				"lastWord",
				"participants",
				"pinPosition",
				"sectionId",
				"soloBotId",
				"spaceId",
				"state",
				"title",
				"updatedAt"
			]
		);
		assert_eq!(conversation["state"], json!("working"));
		assert_eq!(conversation["id"], json!(written.conversation_id));
		assert_eq!(conversation["spaceId"], json!("personal"));
		assert_eq!(conversation["sectionId"], json!(null));
		assert_eq!(conversation["pinPosition"], json!(null));
		assert_eq!(conversation["soloBotId"], json!(DEFAULT_BOT_ID));
		assert_eq!(conversation["lastActivityAt"], conversation["createdAt"]);
		assert_eq!(
			conversation["lastWord"],
			json!({
				"text": "Here",
				"at": 2,
				"authorBotId": DEFAULT_BOT_ID,
				"authorAccountId": null,
				"authorName": null,
				"writtenFrom": null,
			})
		);
		assert_eq!(conversation["title"], json!("Chat"));
		assert_eq!(conversation["instructions"], json!(""));
		assert_eq!(conversation["updatedAt"], conversation["createdAt"]);
		assert_eq!(conversation["participants"][0]["botId"], json!(DEFAULT_BOT_ID));
	}

	#[tokio::test]
	async fn a_finalize_whose_conversation_row_does_not_read_still_settles_the_message() {
		let written = Written::new("update-unread").await;
		written.prompt("t1", "p1").await;
		let reply = NewAssistantMessage {
			id: "m1".to_owned(),
			conversation_id: written.conversation_id.clone(),
			turn_id: "t1".to_owned(),
			author_bot_id: Some(DEFAULT_BOT_ID.to_owned()),
			replied_to_message_id: Some("p1".to_owned()),
			created_at: 2,
		};
		written.database().messages().open_assistant_message(reply).await.expect("opened");
		let heard = listen_to_updates(&written);
		written
			.database()
			.messages()
			.call_mut(|connection| {
				Ok(connection
					.execute_batch("ALTER TABLE conversation_participants RENAME TO gone")?)
			})
			.await
			.expect("the seats table is renamed");

		let finalized = crate::conversations::commands::conversation_finalize_message(
			written.app.handle().clone(),
			written.app.state(),
			"m1".to_owned(),
			crate::conversations::contract::TerminalCompletion::Complete,
			None,
		)
		.await;

		assert_eq!(finalized, Ok(()));
		assert_eq!(
			written.stored("m1").await.map(|stored| stored.state),
			Some(MessageState::Complete)
		);
		assert!(heard.lock().expect("the list is kept").is_empty(), "an update was announced");
	}

	fn last_active_turn(heard: &Mutex<Vec<serde_json::Value>>) -> serde_json::Value {
		heard
			.lock()
			.expect("the list is kept")
			.last()
			.map(|payload| payload["conversation"]["activeTurn"].clone())
			.expect("an update was announced")
	}

	fn working(bot_ids: &[&str]) -> serde_json::Value {
		let mut bot_ids = bot_ids.to_vec();
		bot_ids.sort_unstable();
		let bots: Vec<_> =
			bot_ids.iter().map(|bot_id| json!({ "botId": bot_id, "startedAt": 1 })).collect();
		json!({ "bots": bots })
	}

	fn cancelled_turn() -> AgentEvent {
		AgentEvent::TurnEnded {
			ended: super::super::contract::TurnEnded {
				session_id: None,
				outcome: TurnOutcome::Cancelled,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		}
	}

	#[tokio::test]
	async fn a_turn_two_bots_run_on_stays_open_until_the_last_of_them_ends_however_it_ends() {
		let endings = [
			("completed", turn_ended()),
			("failed", AgentEvent::TurnChanged { state: TurnState::Failed }),
			("cancelled", cancelled_turn()),
		];
		for (name, ending) in endings {
			let (written, ada) = Written::in_a_room_of_two(&format!("two-bots-{name}")).await;
			written.prompt("t1", "p1").await;
			let heard = listen_to_updates(&written);
			let mut first = written.desk_of(DEFAULT_BOT_ID);
			let mut second = written.desk_of(&ada);
			first.open_turn(submitted("t1", "p1")).await;
			second.open_turn(submitted("t1", "p1")).await;
			second.record(&AgentEvent::MessageStarted { message: streaming("m2") }).await;
			second
				.record(&AgentEvent::MessageDelta { id: "m2".into(), seq: 1, text: "half".into() })
				.await;
			first.record(&completed("m1", "first", 2)).await;

			first.record(&ending).await;
			let after_the_first = last_active_turn(&heard);
			let first_completed_at = written.completed_at("t1").await;
			second.record(&turn_ended()).await;
			let after_the_second = last_active_turn(&heard);

			assert_eq!(after_the_first, working(&[DEFAULT_BOT_ID, &ada]), "{name}");
			assert_eq!(first_completed_at, None, "the first {name} run closed the turn");
			assert_eq!(after_the_second, json!(null), "{name}");
			assert!(written.completed_at("t1").await.is_some(), "the last run left it open");
		}
	}

	#[tokio::test]
	async fn a_bot_handing_over_keeps_the_turn_open_until_the_bot_it_handed_to_ends() {
		let (written, ada) = Written::in_a_room_of_two("handover").await;
		written.prompt("t1", "p1").await;
		let heard = listen_to_updates(&written);
		let mut lead = written.desk_of(DEFAULT_BOT_ID);
		let mut handed = written.desk_of(&ada);
		let handing = format!("<@{ada}> over to you");

		lead.open_turn(submitted("t1", "p1")).await;
		lead.record(&completed("m1", &handing, 2)).await;
		lead.record(&turn_ended()).await;
		let across_the_gap = last_active_turn(&heard);
		let gap_completed_at = written.completed_at("t1").await;
		handed.open_turn(submitted("t1", "m1")).await;
		handed.record(&completed("m2", "done", 3)).await;
		let while_handed_writes = last_active_turn(&heard);
		handed.record(&turn_ended()).await;

		assert_eq!(across_the_gap, working(&[DEFAULT_BOT_ID, &ada]));
		assert_eq!(gap_completed_at, None, "the handover closed the turn");
		assert_eq!(while_handed_writes, working(&[DEFAULT_BOT_ID, &ada]));
		assert_eq!(last_active_turn(&heard), json!(null));
		assert!(written.completed_at("t1").await.is_some(), "the handed run left it open");
	}

	#[tokio::test]
	async fn a_bot_handed_the_turn_that_never_starts_releases_its_turn_run_at_the_start_deadline() {
		let (written, ada) = Written::in_a_room_of_two("unstarted-handover").await;
		written.app.manage(TurnRunDeadlines::after(Duration::ZERO));
		written.prompt("t1", "p1").await;
		let (announced, mut updates) = mpsc::unbounded_channel();
		written.app.handle().listen(crate::conversations::contract::UPDATED_EVENT, move |event| {
			let payload: serde_json::Value =
				serde_json::from_str(event.payload()).expect("the payload is JSON");
			announced
				.send(payload["conversation"]["activeTurn"].clone())
				.expect("the test listens");
		});
		let mut lead = written.desk_of(DEFAULT_BOT_ID);

		lead.open_turn(submitted("t1", "p1")).await;
		lead.record(&completed("m1", &format!("<@{ada}> over to you"), 2)).await;
		lead.record(&turn_ended()).await;
		let before_the_release = tokio::time::timeout(Duration::from_secs(60), async {
			let mut previous = None;
			while let Some(active_turn) = updates.recv().await {
				if active_turn.is_null() {
					return previous;
				}
				previous = Some(active_turn);
			}
			None
		})
		.await
		.expect("the deadline released the turn in time");

		assert_eq!(before_the_release, Some(working(&[DEFAULT_BOT_ID, &ada])));
		assert!(written.completed_at("t1").await.is_some(), "the unstarted bot left it open");
	}

	#[tokio::test]
	async fn a_cancelled_run_hands_over_to_nobody() {
		let (written, ada) = Written::in_a_room_of_two("cancelled-handover").await;
		written.prompt("t1", "p1").await;
		let heard = listen_to_updates(&written);
		let mut lead = written.desk_of(DEFAULT_BOT_ID);

		lead.open_turn(submitted("t1", "p1")).await;
		lead.record(&completed("m1", &format!("<@{ada}> over to you"), 2)).await;
		lead.record(&cancelled_turn()).await;
		let runs_left: i64 = written
			.database()
			.call(|connection| {
				Ok(connection.query_row("SELECT COUNT(*) FROM turn_runs", [], |row| row.get(0))?)
			})
			.await
			.expect("the runs count");

		assert_eq!(last_active_turn(&heard), json!(null));
		assert!(written.completed_at("t1").await.is_some(), "the cancelled turn was left open");
		assert_eq!(runs_left, 0, "the cancelled run left a run behind");
	}

	fn a_permission_request(request_id: &str) -> AgentEvent {
		AgentEvent::PermissionRequested {
			request: super::super::contract::PermissionRequest {
				id: request_id.to_owned(),
				tool_name: "Bash".to_owned(),
				title: "Run the tests".to_owned(),
				detail: None,
			},
		}
	}

	fn resolved(request_id: &str) -> AgentEvent {
		AgentEvent::PermissionResolved {
			id: request_id.to_owned(),
			decision: super::super::contract::PermissionDecision::AllowOnce,
		}
	}

	async fn held_prompts(written: &Written) -> Vec<(String, String, String)> {
		written
			.database()
			.call(|connection| {
				let mut statement = connection.prepare(
					"SELECT runtime_session_id, prompt_id, kind FROM pending_prompts
					ORDER BY prompt_id",
				)?;
				let rows =
					statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
			.expect("the prompts are read")
	}

	fn held(prompt_id: &str, kind: &str) -> (String, String, String) {
		(RUNTIME_SESSION_ID.to_owned(), prompt_id.to_owned(), kind.to_owned())
	}

	#[tokio::test]
	async fn a_question_and_a_permission_request_stay_persisted_until_each_is_resolved() {
		let written = Written::new("prompts-resolved").await;
		let mut desk = written.desk();
		desk.open_turn(submitted("t1", "p1")).await;

		desk.record(&question("q1")).await;
		desk.record(&a_permission_request("w1")).await;
		assert_eq!(
			held_prompts(&written).await,
			[held("q1", "question"), held("w1", "permission")]
		);

		desk.record(&resolved("q1")).await;
		assert_eq!(held_prompts(&written).await, [held("w1", "permission")]);
		desk.record(&resolved("w1")).await;
		assert_eq!(held_prompts(&written).await, []);
	}

	#[tokio::test]
	async fn the_end_of_its_turn_releases_every_prompt_of_the_session() {
		let written = Written::new("prompts-turn-ended").await;
		let mut desk = written.desk();
		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&question("q1")).await;
		desk.record(&a_permission_request("w1")).await;

		desk.record(&turn_ended()).await;

		assert_eq!(held_prompts(&written).await, []);
	}

	#[tokio::test]
	async fn a_quitting_host_keeps_the_prompts_its_shutdown_would_end() {
		let written = Written::new("prompts-quit").await;
		let mut desk = written.desk();
		desk.open_turn(submitted("t1", "p1")).await;
		desk.record(&question("q1")).await;

		commands::a_quitting_host(written.app.handle());
		desk.record(&turn_ended()).await;

		assert_eq!(held_prompts(&written).await, [held("q1", "question")]);
	}

	#[tokio::test]
	async fn a_held_prompt_announces_its_conversation_needs_you_and_its_release_that_it_does_not() {
		let written = Written::new("prompts-announced").await;
		let heard = Arc::new(Mutex::new(Vec::new()));
		let kept = heard.clone();
		written.app.handle().listen(
			crate::conversations::contract::STATE_CHANGED_EVENT,
			move |event| {
				let payload: serde_json::Value =
					serde_json::from_str(event.payload()).expect("the payload is JSON");
				kept.lock().expect("the list is kept").push(payload["state"].clone());
			},
		);
		let mut desk = written.desk();

		desk.record(&question("q1")).await;
		desk.record(&resolved("q1")).await;

		assert_eq!(*heard.lock().expect("the list is kept"), [json!("needs_you"), json!("idle")]);
	}
}
