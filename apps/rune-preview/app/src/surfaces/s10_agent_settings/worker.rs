use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::agent::contract::OfferedModel;
use kiroshi_core::conversations::contract::{
	Bot, BotChangedFile, BotHistoryEntry, BotIdentity, Skill, SkillDraft,
};
use kiroshi_core::plugins::contract::PluginScope;
use kiroshi_core::spaces::contract::Space;
use rune::Waker;
use serde_json::json;

use crate::host::HostError;
use crate::source::Source;

#[derive(Clone, Debug, PartialEq)]
pub struct Range {
	pub oldest: String,
	pub newest: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Membership {
	pub space: Space,
	pub is_shared: bool,
}

#[derive(Debug, PartialEq)]
pub enum Call {
	ReadAgent { space_id: String, bot_id: String },
	ReadModels,
	Describe { bot_id: String, identity: Box<BotIdentity> },
	ReadSpaces { bot_id: String },
	Share { bot_id: String, space_id: String, is_shared: bool },
	ReadSkills { bot_id: String },
	SaveSkill { bot_id: String, skill_id: Option<String>, draft: Box<SkillDraft> },
	ReadFile { bot_id: String, skill_id: String, path: String },
	WriteFile { bot_id: String, skill_id: String, path: String, text: String },
	ReadHistory { bot_id: String },
	ReadChange { bot_id: String, range: Range },
	Undo { bot_id: String, range: Range },
}

pub enum Answer {
	Agent { bot_id: String, bots: Result<Vec<Bot>, HostError> },
	Models(Result<Vec<OfferedModel>, HostError>),
	Described { bot_id: String, written: Result<Bot, HostError> },
	Spaces { bot_id: String, memberships: Result<Vec<Membership>, HostError> },
	Shared { bot_id: String, space_id: String, is_shared: bool, outcome: Result<(), HostError> },
	Skills { bot_id: String, skills: Result<Vec<Skill>, HostError> },
	SkillSaved { bot_id: String, skill_id: Option<String>, saved: Result<Skill, HostError> },
	File { bot_id: String, skill_id: String, path: String, text: Result<String, HostError> },
	FileWritten { bot_id: String, skill_id: String, path: String, outcome: Result<(), HostError> },
	History { bot_id: String, entries: Result<Vec<BotHistoryEntry>, HostError> },
	Change { bot_id: String, newest: String, files: Result<Vec<BotChangedFile>, HostError> },
	Undone { bot_id: String, entries: Result<Vec<BotHistoryEntry>, HostError> },
}

fn scope_of(bot_id: &str) -> PluginScope {
	PluginScope::Bot { id: bot_id.to_owned() }
}

fn memberships_of(source: &Source, bot_id: &str) -> Result<Vec<Membership>, HostError> {
	let spaces: Vec<Space> = source.invoke("space_list", json!({}))?;
	spaces
		.into_iter()
		.map(|space| {
			let bots: Vec<Bot> =
				source.invoke("conversation_bots", json!({ "spaceId": space.id }))?;
			let is_shared = bots.iter().any(|bot| bot.id == bot_id);
			Ok(Membership { space, is_shared })
		})
		.collect()
}

fn shared(source: &Source, bot_id: &str, space_id: &str, is_shared: bool) -> Result<(), HostError> {
	if is_shared {
		let arguments = json!({ "botId": bot_id, "spaceId": space_id, "sectionId": null });
		source.invoke("bot_add_to_space", arguments)
	} else {
		source.invoke("bot_remove_from_space", json!({ "botId": bot_id, "spaceId": space_id }))
	}
}

fn saved_skill(
	source: &Source,
	bot_id: &str,
	skill_id: Option<&str>,
	draft: SkillDraft,
) -> Result<Skill, HostError> {
	let scope = scope_of(bot_id);
	match skill_id {
		Some(skill_id) => source.invoke(
			"plugin_update_skill",
			json!({ "scope": scope, "skillId": skill_id, "draft": draft }),
		),
		None => source.invoke("plugin_create_skill", json!({ "scope": scope, "draft": draft })),
	}
}

fn ranged(bot_id: &str, range: &Range) -> serde_json::Value {
	json!({
		"scope": scope_of(bot_id),
		"oldestCommitId": range.oldest,
		"newestCommitId": range.newest,
	})
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadAgent { space_id, bot_id } => {
			let bots = source.invoke("conversation_bots", json!({ "spaceId": space_id }));
			Answer::Agent { bot_id, bots }
		}
		Call::ReadModels => Answer::Models(source.invoke("agent_models", json!({}))),
		Call::Describe { bot_id, identity } => {
			let arguments = json!({ "id": bot_id, "identity": identity });
			let written = source.invoke("conversation_update_bot", arguments);
			Answer::Described { bot_id, written }
		}
		Call::ReadSpaces { bot_id } => {
			let memberships = memberships_of(source, &bot_id);
			Answer::Spaces { bot_id, memberships }
		}
		Call::Share { bot_id, space_id, is_shared } => {
			let outcome = shared(source, &bot_id, &space_id, is_shared);
			Answer::Shared { bot_id, space_id, is_shared, outcome }
		}
		Call::ReadSkills { bot_id } => {
			let skills = source.invoke("plugin_skills", json!({ "scope": scope_of(&bot_id) }));
			Answer::Skills { bot_id, skills }
		}
		Call::SaveSkill { bot_id, skill_id, draft } => {
			let saved = saved_skill(source, &bot_id, skill_id.as_deref(), *draft);
			Answer::SkillSaved { bot_id, skill_id, saved }
		}
		Call::ReadFile { bot_id, skill_id, path } => {
			let arguments =
				json!({ "scope": scope_of(&bot_id), "skillId": skill_id, "path": path });
			let text = source.invoke("plugin_skill_file", arguments);
			Answer::File { bot_id, skill_id, path, text }
		}
		Call::WriteFile { bot_id, skill_id, path, text } => {
			let arguments = json!({
				"scope": scope_of(&bot_id),
				"skillId": skill_id,
				"path": path,
				"text": text,
			});
			let outcome = source.invoke::<Skill>("plugin_write_skill_file", arguments).map(|_| ());
			Answer::FileWritten { bot_id, skill_id, path, outcome }
		}
		Call::ReadHistory { bot_id } => {
			let entries = source.invoke("plugin_history", json!({ "scope": scope_of(&bot_id) }));
			Answer::History { bot_id, entries }
		}
		Call::ReadChange { bot_id, range } => {
			let files = source.invoke("plugin_history_diff", ranged(&bot_id, &range));
			Answer::Change { bot_id, newest: range.newest, files }
		}
		Call::Undo { bot_id, range } => {
			let entries = source.invoke("plugin_revert", ranged(&bot_id, &range));
			Answer::Undone { bot_id, entries }
		}
	}
}

struct Reply {
	answers: Sender<Answer>,
	waker: Waker,
}

impl Reply {
	fn deliver(&self, answer: Answer) -> bool {
		let is_heard = self.answers.send(answer).is_ok();
		if is_heard {
			(self.waker)();
		}
		is_heard
	}
}

fn served(source: &Source, calls: &Receiver<Call>, reply: &Reply) {
	for call in calls {
		if !reply.deliver(answered(source, call)) {
			return;
		}
	}
}

pub struct Worker {
	calls: Sender<Call>,
	answers: Receiver<Answer>,
}

impl Worker {
	pub fn spawn(source: Source, waker: Waker) -> Option<Worker> {
		let (calls, waiting) = mpsc::channel();
		let (answering, answers) = mpsc::channel();
		let reply = Reply { answers: answering, waker };
		let spawned = thread::Builder::new()
			.name("agent-settings-calls".into())
			.spawn(move || served(&source, &waiting, &reply));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the agent settings calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("an agent settings call was not sent, the calls stopped: {:?}", unsent.0);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
