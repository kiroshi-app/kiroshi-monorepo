use kiroshi_core::conversations::contract::{
	PinnedBubble, ReplyLink, TranscriptCompletion, TranscriptMessage, TranscriptRole, WrittenFrom,
};
use kiroshi_rune_kit::strings::{Language, chat};
use kiroshi_rune_kit::surfaces::s05_thread::{
	Agent, Author, MissionEvent, PinnedMessage, Quote, Row, ThreadKind, Transcript, Turn,
	TurnState, WorkLine, WorkingAgent,
};

use super::conversation::{Conversation, Live, Phase};
use crate::conversations::roster_timestamp;
use crate::surfaces::s08_missions::is_summons;

pub const WORK_LINE: &str = "work";

pub struct Shown<'a> {
	pub kind: &'a ThreadKind,
	pub roster: &'a [Agent],
	pub events: &'a [MissionEvent],
	pub now: i64,
}

pub fn transcript(open: &Conversation, shown: &Shown) -> Transcript {
	match &open.phase {
		Phase::Loading => Transcript::Loading,
		Phase::Failed(failure) => {
			Transcript::Failed { title: failure.title(), detail: failure.detail() }
		}
		Phase::Loaded => Transcript::Rows(rows(open, shown)),
	}
}

pub fn pinned(open: &Conversation, roster: &[Agent], now: i64) -> Vec<PinnedMessage> {
	open.pins.iter().map(|pin| pinned_message(pin, roster, now)).collect()
}

fn pinned_message(pin: &PinnedBubble, roster: &[Agent], now: i64) -> PinnedMessage {
	PinnedMessage {
		id: pin.message.id.clone(),
		author: author_of(&pin.message, roster),
		time: roster_timestamp(pin.pinned_at, now),
		excerpt: pin.message.content.trim().to_owned(),
	}
}

fn is_summons_of_mission(message: &TranscriptMessage, kind: &ThreadKind) -> bool {
	matches!(kind, ThreadKind::Mission { .. })
		&& message.role == TranscriptRole::User
		&& message.author_bot_id.is_none()
		&& is_summons(message.content.trim())
}

fn held_events<'a>(
	open: &Conversation,
	events: &'a [MissionEvent],
) -> impl Iterator<Item = &'a MissionEvent> {
	let oldest_held =
		open.messages.first().filter(|_| open.has_older).map(|message| message.created_at);
	events.iter().filter(move |event| oldest_held.is_none_or(|oldest| event.created_at >= oldest))
}

fn rows(open: &Conversation, shown: &Shown) -> Vec<Row> {
	let roster = shown.roster;
	let mut rows = Vec::new();
	if !open.has_older && !open.messages.is_empty() {
		rows.push(Row::StartOfHistory);
	}
	let unseen = open.unseen_from.as_deref();
	let mut events = held_events(open, shown.events).peekable();
	let messages =
		open.messages.iter().filter(|message| !is_summons_of_mission(message, shown.kind));
	for message in messages {
		while let Some(event) = events.next_if(|event| event.created_at < message.created_at) {
			rows.push(Row::Event(event.clone()));
		}
		if unseen == Some(message.id.as_str()) {
			rows.push(Row::NewMessages);
		}
		rows.push(Row::Turn(stored_turn(open, message, roster, shown.now)));
	}
	rows.extend(events.cloned().map(Row::Event));
	for live in &open.live {
		if unseen == Some(live.id.as_str()) {
			rows.push(Row::NewMessages);
		}
		rows.push(Row::Turn(live_turn(live, roster)));
	}
	if !open.working.is_empty() {
		rows.push(Row::Work(work_line(open, roster)));
	}
	rows
}

fn agent_of(bot_id: &str, roster: &[Agent]) -> Author {
	roster
		.iter()
		.find(|agent| agent.id == bot_id)
		.map_or(Author::Deleted, |agent| Author::Agent(agent.clone()))
}

fn author_of(message: &TranscriptMessage, roster: &[Agent]) -> Author {
	if let Some(bot_id) = &message.author_bot_id {
		return agent_of(bot_id, roster);
	}
	match (message.role, message.written_from, &message.author_name) {
		(TranscriptRole::Assistant, _, _) => Author::Deleted,
		(TranscriptRole::User, Some(WrittenFrom::Relay), Some(name)) => {
			Author::Person { name: name.clone(), image: None }
		}
		(TranscriptRole::User, _, _) => Author::You,
	}
}

fn name_of(author: &Author) -> String {
	match author {
		Author::You => chat::turn::YOU.text(Language::En).to_owned(),
		Author::Person { name, .. } => name.clone(),
		Author::Agent(agent) => agent.name.clone(),
		Author::Deleted => chat::transcript::author::DELETED.text(Language::En).to_owned(),
	}
}

fn state_of(completion: TranscriptCompletion) -> TurnState {
	match completion {
		TranscriptCompletion::Pending | TranscriptCompletion::Streaming => TurnState::Streaming,
		TranscriptCompletion::Complete => TurnState::Complete,
		TranscriptCompletion::Cancelled | TranscriptCompletion::Interrupted => TurnState::Stopped,
		TranscriptCompletion::Failed => TurnState::Failed,
	}
}

pub fn quote_of(link: &ReplyLink, open: &Conversation, roster: &[Agent]) -> Option<Quote> {
	let quoted = open.messages.iter().find(|message| message.id == link.message_id);
	let excerpt =
		link.excerpt.clone().or_else(|| quoted.map(|message| message.content.trim().to_owned()))?;
	let author = quoted.map(|message| name_of(&author_of(message, roster))).unwrap_or_default();
	Some(Quote { id: link.message_id.clone(), author, excerpt })
}

fn stored_turn(
	open: &Conversation,
	message: &TranscriptMessage,
	roster: &[Agent],
	now: i64,
) -> Turn {
	let state = state_of(message.completion);
	Turn {
		time: Some(roster_timestamp(message.created_at, now)),
		state,
		quotes: message
			.reply_links
			.iter()
			.filter_map(|link| quote_of(link, open, roster))
			.collect(),
		pinned: open.is_pinned(&message.id),
		shows_actions: state != TurnState::Streaming,
		..Turn::new(&message.id, author_of(message, roster), &message.content)
	}
}

fn live_turn(live: &Live, roster: &[Agent]) -> Turn {
	Turn {
		state: TurnState::Streaming,
		..Turn::new(&live.id, agent_of(&live.bot_id, roster), &live.text)
	}
}

fn work_line(open: &Conversation, roster: &[Agent]) -> WorkLine {
	let agents = open
		.working
		.iter()
		.filter_map(|working| {
			let agent = roster.iter().find(|agent| agent.id == working.bot_id)?;
			Some(WorkingAgent {
				agent: agent.clone(),
				state: working.state,
				label: working.label.clone(),
				elapsed: None,
			})
		})
		.collect();
	WorkLine { id: WORK_LINE.to_owned(), agents, open: open.is_work_open }
}
