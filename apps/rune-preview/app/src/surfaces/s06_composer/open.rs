use kiroshi_core::conversations::contract::ReplyLink;
use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind};

use crate::app::{App, OpenMission};
use crate::model::{Agent, MissionState};

#[derive(Clone, Debug, PartialEq)]
pub enum Kind {
	Solo { bot_id: String, name: String },
	Group,
	Mission { is_closed: bool },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Candidate {
	pub id: String,
	pub name: String,
	pub title: Option<String>,
	pub hue: Option<f32>,
	pub is_outside: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Open {
	pub conversation_id: String,
	pub kind: Kind,
	pub candidates: Vec<Candidate>,
	pub space: (String, String),
	pub reply_links: Vec<ReplyLink>,
}

impl Open {
	pub fn is_closed(&self) -> bool {
		matches!(self.kind, Kind::Mission { is_closed: true })
	}

	pub fn outside_name(&self, bot_id: &str) -> Option<String> {
		let outside = self.candidates.iter().filter(|candidate| candidate.is_outside);
		outside
			.into_iter()
			.find(|candidate| candidate.id == bot_id)
			.map(|candidate| candidate.name.clone())
	}
}

fn is_closed(open: &OpenMission) -> bool {
	matches!(open.mission.state, MissionState::Done | MissionState::Closed)
}

fn candidate(agent: &Agent, is_outside: bool) -> Candidate {
	Candidate {
		id: agent.id.clone(),
		name: agent.name.clone(),
		title: Some(agent.title.clone()).filter(|title| !title.is_empty()),
		hue: agent.avatar_blot,
		is_outside,
	}
}

pub fn candidates(agents: &[Agent], present: &[String]) -> Vec<Candidate> {
	let seated = present
		.iter()
		.filter_map(|bot_id| agents.iter().find(|agent| &agent.id == bot_id))
		.map(|agent| candidate(agent, false));
	let outside = agents
		.iter()
		.filter(|agent| !present.contains(&agent.id))
		.map(|agent| candidate(agent, true));
	seated.chain(outside).collect()
}

pub fn of(app: &App) -> Option<Open> {
	let thread = &app.surfaces.s05_thread;
	let conversation_id = thread.conversation_id()?.to_owned();
	let ready = app.ready()?;
	let conversation =
		ready.conversations.iter().find(|conversation| conversation.id == conversation_id);
	let mut present: Vec<String> = conversation
		.map(|conversation| conversation.present().map(|seat| seat.bot_id.clone()).collect())
		.unwrap_or_default();
	let solo = conversation.and_then(|conversation| conversation.solo_bot_id.as_deref());
	let kind = match (&app.mission, solo) {
		(Some(open), _) => {
			if present.is_empty() {
				present.push(open.bot.id.clone());
			}
			Kind::Mission { is_closed: is_closed(open) }
		}
		(None, Some(bot_id)) => {
			let agent = ready.agents.iter().find(|agent| agent.id == bot_id);
			let name = agent.map(|agent| agent.name.clone()).unwrap_or_default();
			Kind::Solo { bot_id: bot_id.to_owned(), name }
		}
		(None, None) => Kind::Group,
	};
	Some(Open {
		conversation_id,
		kind,
		candidates: candidates(&ready.agents, &present),
		space: (ready.space.id.clone(), ready.space.name.clone()),
		reply_links: thread.reply_links(),
	})
}

pub fn title_of(item: &LibraryItem) -> String {
	let is_extension_shown = item.kind == LibraryItemKind::Image;
	match item.name.rfind('.') {
		Some(at) if at > 0 && !is_extension_shown => item.name[..at].to_owned(),
		_ => item.name.clone(),
	}
}
