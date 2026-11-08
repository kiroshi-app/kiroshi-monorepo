use kiroshi_core::agent::contract::AgentCommand;
use kiroshi_rune_kit::surfaces::s06_composer::menus::{
	Command, MentionFace, Mentionable, command_matches, mention_matches,
};

use super::open::{Candidate, Kind};
use super::prompt_text::{command_query, mention_query};

const COMMAND_MARK: &str = "/";

#[derive(Debug, PartialEq)]
pub enum Trigger<'a> {
	Mention { query: &'a str, at: usize },
	Command { query: &'a str },
}

impl Trigger<'_> {
	pub fn query(&self) -> &str {
		match self {
			Trigger::Mention { query, .. } | Trigger::Command { query } => query,
		}
	}

	pub fn at(&self) -> usize {
		match self {
			Trigger::Mention { at, .. } => *at,
			Trigger::Command { .. } => 0,
		}
	}
}

pub fn trigger<'a>(prompt: &'a str, kind: &Kind, has_commands: bool) -> Option<Trigger<'a>> {
	match kind {
		Kind::Solo { .. } => {
			command_query(prompt, has_commands).map(|query| Trigger::Command { query })
		}
		Kind::Group | Kind::Mission { .. } => mention_query(prompt)
			.map(|query| Trigger::Mention { query, at: prompt.len() - query.len() - 1 }),
	}
}

#[derive(Debug, PartialEq)]
pub struct Row {
	pub id: String,
	pub key: String,
}

pub fn mentionables(candidates: &[Candidate]) -> Vec<Mentionable<'_>> {
	candidates
		.iter()
		.map(|candidate| Mentionable {
			id: &candidate.id,
			name: &candidate.name,
			title: candidate.title.as_deref(),
			face: MentionFace::Agent { hue: candidate.hue },
			is_outside: candidate.is_outside,
		})
		.collect()
}

pub fn command_names(commands: &[AgentCommand]) -> Vec<String> {
	commands.iter().map(|command| format!("{COMMAND_MARK}{}", command.name)).collect()
}

pub fn command_options<'a>(names: &'a [String], commands: &'a [AgentCommand]) -> Vec<Command<'a>> {
	names
		.iter()
		.zip(commands)
		.map(|(name, command)| Command { name, description: command.description.as_deref() })
		.collect()
}

pub fn rows(trigger: &Trigger, candidates: &[Candidate], commands: &[AgentCommand]) -> Vec<Row> {
	match trigger {
		Trigger::Mention { query, .. } => {
			let mentionables = mentionables(candidates);
			let matches = mention_matches(&mentionables, query);
			matches
				.inside
				.iter()
				.chain(&matches.outside)
				.map(|matched| Row {
					id: matched.id.to_owned(),
					key: format!("mention-{}", matched.id),
				})
				.collect()
		}
		Trigger::Command { query } => {
			let names = command_names(commands);
			command_matches(&command_options(&names, commands), query)
				.iter()
				.map(|matched| Row {
					id: matched.name.to_owned(),
					key: format!("command-{}", matched.name),
				})
				.collect()
		}
	}
}

#[derive(Debug, Default, PartialEq)]
pub struct Menu {
	travel: Option<(String, usize)>,
	dismissed_at: Option<usize>,
}

impl Menu {
	pub fn active_for(&self, trigger: &Trigger, len: usize) -> usize {
		let travelled = self.travel.as_ref().filter(|(query, _)| query == trigger.query());
		travelled.map_or(0, |(_, active)| *active).min(len.saturating_sub(1))
	}

	pub fn travelled(&mut self, query: String, active: usize) {
		self.travel = Some((query, active));
	}

	pub fn dismissed(&mut self, at: usize) {
		self.dismissed_at = Some(at);
	}

	pub fn is_dismissed(&self, trigger: &Trigger) -> bool {
		self.dismissed_at == Some(trigger.at())
	}
}
