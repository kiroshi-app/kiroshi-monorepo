use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::conversations::contract::{Bot, Chat, ConversationPage};
use kiroshi_core::sections::contract::{RosterPin, Section};
use kiroshi_core::spaces::contract::SpacePreferences;
use rune::Waker;
use serde_json::json;

use super::listing::{Listing, Placement};
use crate::host::HostError;
use crate::source::Source;

pub const PAGE_SIZE: u32 = 30;

#[derive(Debug, PartialEq)]
pub enum Call {
	Load(String),
	ReadMore { space_id: String, cursor: String },
	MainChat { space_id: String, bot_id: String },
	Write(Write),
}

#[derive(Debug, PartialEq)]
pub enum Write {
	Pin {
		space_id: String,
		pins: Vec<RosterPin>,
		before: Vec<RosterPin>,
	},
	Collapse {
		space_id: String,
		collapsed: Vec<String>,
		before: Vec<String>,
	},
	Rename {
		space_id: String,
		section_id: String,
		name: String,
		before: String,
	},
	MoveToSection {
		space_id: String,
		bot_id: String,
		section_id: Option<String>,
		before: Placement,
	},
	Share {
		space_id: String,
		bot: Box<Bot>,
	},
	Unshare {
		space_id: String,
		bot: Box<Bot>,
	},
}

pub enum Answer {
	Loaded { space_id: String, listing: Result<Listing, HostError> },
	ReadMore { space_id: String, page: Result<ConversationPage, HostError> },
	MainChat { bot_id: String, chat: Result<Chat, HostError> },
	Written { write: Write, outcome: Result<(), HostError> },
}

fn listing(source: &Source, space_id: &str) -> Result<Listing, HostError> {
	let space = json!({ "spaceId": space_id });
	let bots = source.invoke("conversation_bots", space.clone())?;
	let page = source.invoke(
		"conversation_page",
		json!({ "spaceId": space_id, "cursor": null, "limit": PAGE_SIZE }),
	)?;
	let sections = source.invoke("section_list", space.clone())?;
	let preferences: SpacePreferences = source.invoke("space_preferences", space)?;
	Ok(Listing::of(bots, page, sections, preferences.collapsed_section_ids))
}

fn written(source: &Source, write: &Write) -> Result<(), HostError> {
	match write {
		Write::Pin { space_id, pins, .. } => {
			source.invoke("roster_pin", json!({ "spaceId": space_id, "pins": pins }))
		}
		Write::Collapse { space_id, collapsed, .. } => source
			.invoke::<SpacePreferences>(
				"space_set_preferences",
				json!({ "spaceId": space_id, "preferences": { "collapsedSectionIds": collapsed } }),
			)
			.map(|_| ()),
		Write::Rename { section_id, name, .. } => source
			.invoke::<Section>("section_rename", json!({ "id": section_id, "name": name }))
			.map(|_| ()),
		Write::MoveToSection { space_id, bot_id, section_id, .. } => source.invoke(
			"bot_move_to_section",
			json!({ "botId": bot_id, "sectionId": section_id, "spaceId": space_id }),
		),
		Write::Share { space_id, bot } => source.invoke(
			"bot_add_to_space",
			json!({ "botId": bot.id, "spaceId": space_id, "sectionId": null }),
		),
		Write::Unshare { space_id, bot } => {
			source.invoke("bot_remove_from_space", json!({ "botId": bot.id, "spaceId": space_id }))
		}
	}
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::Load(space_id) => {
			let listing = listing(source, &space_id);
			Answer::Loaded { space_id, listing }
		}
		Call::ReadMore { space_id, cursor } => {
			let page = source.invoke(
				"conversation_page",
				json!({ "spaceId": space_id, "cursor": cursor, "limit": PAGE_SIZE }),
			);
			Answer::ReadMore { space_id, page }
		}
		Call::MainChat { space_id, bot_id } => {
			let chat = source
				.invoke("conversation_main_chat", json!({ "botId": bot_id, "spaceId": space_id }));
			Answer::MainChat { bot_id, chat }
		}
		Call::Write(write) => {
			let outcome = written(source, &write);
			Answer::Written { write, outcome }
		}
	}
}

fn served(calls: &Receiver<(Source, Call)>, answers: &Sender<Answer>, waker: &Waker) {
	for (source, call) in calls {
		if answers.send(answered(&source, call)).is_err() {
			return;
		}
		waker();
	}
}

pub struct Worker {
	calls: Sender<(Source, Call)>,
	answers: Receiver<Answer>,
}

impl Worker {
	pub fn spawn(waker: Waker) -> Option<Worker> {
		let (calls, waiting) = mpsc::channel();
		let (answering, answers) = mpsc::channel();
		let spawned = thread::Builder::new()
			.name("roster-calls".into())
			.spawn(move || served(&waiting, &answering, &waker));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the roster calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, source: Source, call: Call) {
		if let Err(unsent) = self.calls.send((source, call)) {
			eprintln!("a roster call was not sent, the roster calls stopped: {:?}", unsent.0.1);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
