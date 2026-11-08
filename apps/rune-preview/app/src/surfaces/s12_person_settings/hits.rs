use std::collections::HashMap;

use kiroshi_core::missions::contract::{MissionLiveness, MissionState};
use kiroshi_core::search::contract::{
	CatalogueChat, CatalogueMission, CatalogueRoutine, ConversationKind, MessageHit,
};

use kiroshi_rune_kit::surfaces::s12_person_settings::search::{BotBadge, SearchKind, SearchTab};

use super::search::Read;
use crate::conversations::roster_timestamp;
use crate::model::{Agent, Conversation};

const SHOWN_PER_KIND: usize = 3;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Opened {
	Agent(String),
	Conversation(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Landing {
	pub conversation_id: String,
	pub message_id: String,
	pub seq: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Target {
	Chat { opened: Opened, landing: Option<Landing> },
	Mission { mission_id: String, bot_id: String },
	Routine { opened: Opened },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Face {
	Message(String),
	FromYou,
	Group(String),
	Solo(String),
	Mission { bot_id: String, badge: Option<BotBadge>, platform: String },
	Routine(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Part {
	Solo,
	Said(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
	pub id: String,
	pub face: Face,
	pub title: Vec<(String, bool)>,
	pub timestamp: String,
	pub parts: Vec<Part>,
	pub identifier: Option<String>,
	pub target: Target,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Group {
	pub kind: SearchKind,
	pub rows: Vec<Row>,
}

pub struct Lookups<'a> {
	pub agents: &'a [Agent],
	pub conversations: &'a [Conversation],
	pub reader: String,
	pub now: i64,
}

impl Lookups<'_> {
	fn agent_name(&self, bot_id: &str) -> String {
		self.agents
			.iter()
			.find(|agent| agent.id == bot_id)
			.map(|agent| agent.name.clone())
			.unwrap_or_default()
	}

	fn is_listed(&self, conversation_id: &str) -> bool {
		self.conversations.iter().any(|conversation| conversation.id == conversation_id)
	}
}

fn folded(text: &str) -> Vec<(char, usize)> {
	text.chars()
		.enumerate()
		.flat_map(|(origin, char)| char.to_lowercase().map(move |lower| (lower, origin)))
		.collect()
}

pub fn marked_title(title: &str, query: &str) -> Vec<(String, bool)> {
	let whole = vec![(title.to_owned(), false)];
	let needle: Vec<char> = folded(query.trim()).into_iter().map(|(char, _)| char).collect();
	if needle.is_empty() {
		return whole;
	}
	let haystack = folded(title);
	let Some(start) = haystack
		.windows(needle.len())
		.position(|window| window.iter().map(|(char, _)| *char).eq(needle.iter().copied()))
	else {
		return whole;
	};
	let from = haystack[start].1;
	let to = haystack[start + needle.len() - 1].1 + 1;
	let chars: Vec<char> = title.chars().collect();
	[(&chars[..from], false), (&chars[from..to], true), (&chars[to..], false)]
		.into_iter()
		.filter(|(slice, _)| !slice.is_empty())
		.map(|(slice, is_match)| (slice.iter().collect(), is_match))
		.collect()
}

fn opened_by_chat(chat: &CatalogueChat) -> Option<Opened> {
	match (chat.hit.kind, &chat.hit.bot_id) {
		(ConversationKind::Topic, _) => {
			Some(Opened::Conversation(chat.hit.conversation_id.clone()))
		}
		(ConversationKind::Main, Some(bot_id)) => Some(Opened::Agent(bot_id.clone())),
		_ => None,
	}
}

fn chat_face(chat: &CatalogueChat) -> Face {
	match (chat.hit.kind, &chat.hit.bot_id) {
		(ConversationKind::Main, Some(bot_id)) => Face::Solo(bot_id.clone()),
		_ => Face::Group(chat.hit.conversation_id.clone()),
	}
}

fn chat_row(chat: &CatalogueChat, opened: Opened, query: &str) -> Row {
	let part = match chat.hit.kind {
		ConversationKind::Main => Part::Solo,
		ConversationKind::Topic | ConversationKind::Mission => {
			Part::Said(chat.hit.participants.join(", "))
		}
	};
	Row {
		id: format!("chat-{}", chat.hit.conversation_id),
		face: chat_face(chat),
		title: marked_title(&chat.hit.title, query),
		timestamp: String::new(),
		parts: vec![part],
		identifier: None,
		target: Target::Chat { opened, landing: None },
	}
}

fn chat_rows(chats: &[CatalogueChat], query: &str) -> Vec<Row> {
	chats.iter().filter_map(|chat| Some(chat_row(chat, opened_by_chat(chat)?, query))).collect()
}

fn state_of(mission: &CatalogueMission) -> MissionState {
	match mission.liveness {
		MissionLiveness::Idle => mission.state,
		MissionLiveness::Working => MissionState::Working,
		MissionLiveness::NeedsYou => MissionState::WaitingHuman,
		MissionLiveness::ReadyToMerge => MissionState::ReadyToMerge,
		MissionLiveness::Failed => MissionState::Failed,
		MissionLiveness::Done => MissionState::Done,
		MissionLiveness::Closed => MissionState::Closed,
	}
}

fn badge_of(state: MissionState) -> Option<BotBadge> {
	match state {
		MissionState::WaitingHuman => Some(BotBadge::Attention),
		MissionState::ReadyToMerge => Some(BotBadge::Done),
		MissionState::Failed => Some(BotBadge::Failed),
		MissionState::Working
		| MissionState::WaitingBot
		| MissionState::Done
		| MissionState::Closed => None,
	}
}

fn mission_row(mission: &CatalogueMission, query: &str) -> Row {
	Row {
		id: format!("mission-{}", mission.id),
		face: Face::Mission {
			bot_id: mission.bot_id.clone(),
			badge: badge_of(state_of(mission)),
			platform: mission.ticket_platform.clone(),
		},
		title: marked_title(&mission.objective, query),
		timestamp: String::new(),
		parts: vec![Part::Said(mission.ticket_title.clone())],
		identifier: Some(mission.ticket_external_id.clone()),
		target: Target::Mission { mission_id: mission.id.clone(), bot_id: mission.bot_id.clone() },
	}
}

fn routine_row(routine: &CatalogueRoutine, query: &str, lookups: &Lookups) -> Row {
	let opened = if lookups.is_listed(&routine.conversation_id) {
		Opened::Conversation(routine.conversation_id.clone())
	} else {
		Opened::Agent(routine.bot_id.clone())
	};
	Row {
		id: format!("routine-{}", routine.id),
		face: Face::Routine(routine.bot_id.clone()),
		title: marked_title(&routine.title, query),
		timestamp: String::new(),
		parts: vec![Part::Said(routine.expression.clone().unwrap_or_default())],
		identifier: None,
		target: Target::Routine { opened },
	}
}

fn opened_by_message(hit: &MessageHit, solo_bots: &HashMap<&str, &str>) -> Option<Opened> {
	match hit.conversation_kind {
		ConversationKind::Topic => Some(Opened::Conversation(hit.conversation_id.clone())),
		ConversationKind::Mission => None,
		ConversationKind::Main => {
			let bot_id = hit
				.author_bot_id
				.as_deref()
				.or_else(|| solo_bots.get(hit.conversation_id.as_str()).copied())?;
			Some(Opened::Agent(bot_id.to_owned()))
		}
	}
}

fn message_row(hit: &MessageHit, opened: Opened, lookups: &Lookups) -> Row {
	let (face, author) = match &hit.author_bot_id {
		Some(bot_id) => (Face::Message(bot_id.clone()), lookups.agent_name(bot_id)),
		None => (Face::FromYou, lookups.reader.clone()),
	};
	let place = match hit.conversation_kind {
		ConversationKind::Main => Part::Solo,
		ConversationKind::Topic | ConversationKind::Mission => {
			Part::Said(hit.conversation_title.clone())
		}
	};
	Row {
		id: format!("message-{}", hit.message_id),
		face,
		title: hit.snippet.iter().map(|part| (part.text.clone(), part.matched)).collect(),
		timestamp: roster_timestamp(hit.created_at, lookups.now),
		parts: vec![Part::Said(author), place],
		identifier: None,
		target: Target::Chat {
			opened,
			landing: Some(Landing {
				conversation_id: hit.conversation_id.clone(),
				message_id: hit.message_id.clone(),
				seq: hit.seq,
			}),
		},
	}
}

fn solo_bots<'a>(chats: impl Iterator<Item = &'a CatalogueChat>) -> HashMap<&'a str, &'a str> {
	chats
		.filter(|chat| chat.hit.kind == ConversationKind::Main)
		.filter_map(|chat| Some((chat.hit.conversation_id.as_str(), chat.hit.bot_id.as_deref()?)))
		.collect()
}

pub fn found_groups(
	read: &Read,
	recents: &[CatalogueChat],
	query: &str,
	lookups: &Lookups,
) -> Vec<Group> {
	let solo_bots = solo_bots(read.catalogue.chats.iter().chain(recents));
	let messages = read
		.messages
		.iter()
		.filter_map(|hit| Some(message_row(hit, opened_by_message(hit, &solo_bots)?, lookups)))
		.collect();
	vec![
		Group { kind: SearchKind::Messages, rows: messages },
		Group { kind: SearchKind::Chats, rows: chat_rows(&read.catalogue.chats, query) },
		Group {
			kind: SearchKind::Missions,
			rows: read
				.catalogue
				.missions
				.iter()
				.map(|mission| mission_row(mission, query))
				.collect(),
		},
		Group {
			kind: SearchKind::Routines,
			rows: read
				.catalogue
				.routines
				.iter()
				.map(|routine| routine_row(routine, query, lookups))
				.collect(),
		},
	]
}

pub fn resting_groups(read: &Read, recents: &[CatalogueChat], lookups: &Lookups) -> Vec<Group> {
	let groups = [
		Group { kind: SearchKind::Chats, rows: chat_rows(recents, "") },
		Group {
			kind: SearchKind::Missions,
			rows: read.catalogue.missions.iter().map(|mission| mission_row(mission, "")).collect(),
		},
		Group {
			kind: SearchKind::Routines,
			rows: read
				.catalogue
				.routines
				.iter()
				.map(|routine| routine_row(routine, "", lookups))
				.collect(),
		},
	];
	groups.into_iter().filter(|group| !group.rows.is_empty()).collect()
}

pub fn visible(tab: SearchTab, groups: &[Group]) -> Vec<&Row> {
	groups
		.iter()
		.filter(|group| tab == SearchTab::All || tab == SearchTab::Only(group.kind))
		.flat_map(|group| {
			let shown = if tab == SearchTab::All {
				group.rows.len().min(SHOWN_PER_KIND)
			} else {
				group.rows.len()
			};
			&group.rows[..shown]
		})
		.collect()
}
