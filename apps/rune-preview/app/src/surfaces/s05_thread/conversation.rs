use kiroshi_core::conversations::contract::{PinnedBubble, TranscriptMessage, TranscriptRole};
use kiroshi_rune_kit::surfaces::s05_thread::WorkState;

use crate::host::HostError;
use crate::model::{ActivityStatus, AgentEvent, TurnState};

pub struct Live {
	pub id: String,
	pub bot_id: String,
	pub text: String,
}

pub struct Working {
	pub bot_id: String,
	pub state: WorkState,
	pub label: Option<String>,
}

pub enum Phase {
	Loading,
	Failed(HostError),
	Loaded,
}

pub struct Conversation {
	pub id: String,
	pub phase: Phase,
	pub messages: Vec<TranscriptMessage>,
	pub has_older: bool,
	pub is_loading_older: bool,
	pub live: Vec<Live>,
	pub working: Vec<Working>,
	pub is_work_open: bool,
	pub pins: Vec<PinnedBubble>,
	pub replies: Vec<String>,
	pub is_at_bottom: bool,
	pub unseen_from: Option<String>,
	pub jumping_to: Option<String>,
}

impl Conversation {
	pub fn new(id: &str) -> Conversation {
		Conversation {
			id: id.to_owned(),
			phase: Phase::Loading,
			messages: Vec::new(),
			has_older: false,
			is_loading_older: false,
			live: Vec::new(),
			working: Vec::new(),
			is_work_open: false,
			pins: Vec::new(),
			replies: Vec::new(),
			is_at_bottom: true,
			unseen_from: None,
			jumping_to: None,
		}
	}

	pub fn is_loaded(&self) -> bool {
		matches!(self.phase, Phase::Loaded)
	}

	pub fn holds(&self, message_id: &str) -> bool {
		self.messages.iter().any(|message| message.id == message_id)
	}

	pub fn oldest_seq(&self) -> Option<i64> {
		self.messages.first().map(|message| message.seq)
	}

	pub fn text_of(&self, id: &str) -> Option<&str> {
		let stored = self.messages.iter().find(|message| message.id == id);
		let streamed = || self.live.iter().find(|live| live.id == id).map(|live| &live.text);
		stored.map(|message| &message.content).or_else(streamed).map(String::as_str)
	}

	pub fn pinned_blocks(&self, message_id: &str) -> Vec<i64> {
		self.pins
			.iter()
			.filter(|pin| pin.message.id == message_id)
			.map(|pin| pin.block_index)
			.collect()
	}

	pub fn is_pinned(&self, message_id: &str) -> bool {
		self.pins.iter().any(|pin| pin.message.id == message_id)
	}

	pub fn hold_reply(&mut self, message_id: &str) {
		if !self.replies.iter().any(|held| held == message_id) {
			self.replies.push(message_id.to_owned());
		}
	}

	pub fn scrolled(&mut self, is_at_bottom: bool) {
		self.is_at_bottom = is_at_bottom;
		if is_at_bottom {
			self.unseen_from = None;
		}
	}

	pub fn landed_newest(&mut self, messages: Vec<TranscriptMessage>, has_more: bool) {
		if !self.is_loaded() {
			self.phase = Phase::Loaded;
			self.has_older = has_more;
		}
		let newest_before = self.messages.last().map(|message| message.seq);
		let newer: Vec<TranscriptMessage> = self
			.merged(messages)
			.into_iter()
			.filter(|message| newest_before.is_none_or(|newest| message.seq > newest))
			.collect();
		self.live.retain(|live| !newer.iter().any(|message| replaces(message, live)));
		if let Some(message) = newer.first().filter(|_| newest_before.is_some()) {
			self.mark_unseen(&message.id);
		}
	}

	pub fn landed_older(&mut self, messages: Vec<TranscriptMessage>, has_more: bool) {
		self.is_loading_older = false;
		self.has_older = has_more;
		self.merged(messages);
	}

	pub fn streamed(&mut self, bot_id: &str, event: AgentEvent) {
		match event {
			AgentEvent::MessageStarted { message } => {
				if !self.live.iter().any(|live| live.id == message.id) {
					self.mark_unseen(&message.id);
					self.live.push(Live {
						id: message.id,
						bot_id: bot_id.to_owned(),
						text: message.text,
					});
				}
				self.work(bot_id, WorkState::Writing, None);
			}
			AgentEvent::MessageDelta { id, text } => {
				match self.live.iter_mut().find(|live| live.id == id) {
					Some(live) => live.text.push_str(&text),
					None => {
						self.mark_unseen(&id);
						self.live.push(Live { id, bot_id: bot_id.to_owned(), text });
					}
				}
				self.work(bot_id, WorkState::Writing, None);
			}
			AgentEvent::MessageCompleted { message } => {
				if let Some(live) = self.live.iter_mut().find(|live| live.id == message.id) {
					live.text = message.text;
				}
			}
			AgentEvent::TurnChanged { state } => self.turn_changed(bot_id, state),
			AgentEvent::Activity { activity } => match activity.status {
				ActivityStatus::Pending | ActivityStatus::Running => {
					self.work(bot_id, WorkState::Tool, Some(activity.title))
				}
				ActivityStatus::Succeeded | ActivityStatus::Failed => {
					self.work(bot_id, WorkState::Thinking, None)
				}
			},
			AgentEvent::TurnEnded { .. } => self.rested(bot_id),
			AgentEvent::Failed { .. } => self.work(bot_id, WorkState::Failed, None),
			AgentEvent::Other => {}
		}
	}

	fn turn_changed(&mut self, bot_id: &str, state: TurnState) {
		match state {
			TurnState::Submitting | TurnState::Running => {
				if !self.working.iter().any(|working| working.bot_id == bot_id) {
					self.work(bot_id, WorkState::Thinking, None);
				}
			}
			TurnState::Stopping => {}
			TurnState::Idle => self.rested(bot_id),
			TurnState::Failed => self.work(bot_id, WorkState::Failed, None),
		}
	}

	fn work(&mut self, bot_id: &str, state: WorkState, label: Option<String>) {
		match self.working.iter_mut().find(|working| working.bot_id == bot_id) {
			Some(working) => {
				working.state = state;
				working.label = label;
			}
			None => self.working.push(Working { bot_id: bot_id.to_owned(), state, label }),
		}
	}

	fn rested(&mut self, bot_id: &str) {
		self.working.retain(|working| working.bot_id != bot_id);
	}

	fn mark_unseen(&mut self, id: &str) {
		if !self.is_at_bottom && self.unseen_from.is_none() {
			self.unseen_from = Some(id.to_owned());
		}
	}

	fn merged(&mut self, messages: Vec<TranscriptMessage>) -> Vec<TranscriptMessage> {
		let mut arrived = Vec::new();
		for message in messages {
			match self.messages.iter().position(|held| held.id == message.id) {
				Some(at) => self.messages[at] = message,
				None => {
					let at = self.messages.partition_point(|held| held.seq <= message.seq);
					self.messages.insert(at, message.clone());
					arrived.push(message);
				}
			}
		}
		arrived.sort_by_key(|message| message.seq);
		self.live.retain(|live| !self.messages.iter().any(|message| message.id == live.id));
		arrived
	}
}

fn replaces(message: &TranscriptMessage, live: &Live) -> bool {
	message.role == TranscriptRole::Assistant
		&& message.author_bot_id.as_deref() == Some(live.bot_id.as_str())
}
