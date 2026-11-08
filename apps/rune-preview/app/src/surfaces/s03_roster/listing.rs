use std::cmp::Reverse;

use kiroshi_core::conversations::contract::{
	Bot, ConversationInPage, ConversationPage, LastWord, ObservedState,
};
use kiroshi_core::sections::contract::{RosterPin, Section};

const LAST_PIN: i64 = i64::MAX;

#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
	pub bots: Vec<Bot>,
	pub conversations: Vec<ConversationInPage>,
	pub sections: Vec<Section>,
	pub collapsed: Vec<String>,
	pub next_cursor: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub enum Line<'a> {
	Agent { bot: &'a Bot, solo: Option<&'a ConversationInPage> },
	Topic(&'a ConversationInPage),
}

pub enum Placed<'a> {
	Line(Line<'a>),
	Section { section: &'a Section, lines: Vec<Line<'a>> },
}

pub type Placement = (Option<String>, Option<i64>);

impl<'a> Line<'a> {
	pub fn id(&self) -> &'a str {
		match self {
			Line::Agent { bot, .. } => &bot.id,
			Line::Topic(topic) => &topic.conversation.id,
		}
	}

	pub fn conversation(&self) -> Option<&'a ConversationInPage> {
		match self {
			Line::Agent { solo, .. } => *solo,
			Line::Topic(topic) => Some(topic),
		}
	}

	fn section_id(&self) -> Option<&'a str> {
		match self {
			Line::Agent { bot, .. } => bot.section_id.as_deref(),
			Line::Topic(topic) => topic.conversation.section_id.as_deref(),
		}
	}

	fn pin_position(&self) -> Option<i64> {
		match self {
			Line::Agent { bot, .. } => bot.pin_position,
			Line::Topic(topic) => topic.conversation.pin_position,
		}
	}

	fn activity(&self) -> i64 {
		match self {
			Line::Agent { bot, solo } => solo.map_or(bot.created_at, |solo| solo.last_activity_at),
			Line::Topic(topic) => topic.last_activity_at,
		}
	}
}

fn rank_of(placed: &Placed) -> i64 {
	match placed {
		Placed::Line(line) => line.pin_position().unwrap_or_default(),
		Placed::Section { section, .. } => section.position,
	}
}

fn position_in(pins: &[RosterPin], id: &str) -> Option<usize> {
	pins.iter().position(|pin| pin.id == id)
}

fn pin_rank(at: usize) -> i64 {
	i64::try_from(at).unwrap_or(LAST_PIN)
}

fn without_repeats(
	held: &[ConversationInPage],
	fresh: Vec<ConversationInPage>,
) -> Vec<ConversationInPage> {
	fresh
		.into_iter()
		.filter(|row| !held.iter().any(|kept| kept.conversation.id == row.conversation.id))
		.collect()
}

pub fn without_pin(pins: &[RosterPin], id: &str) -> Vec<RosterPin> {
	pins.iter().filter(|pin| pin.id != id).cloned().collect()
}

pub fn pinned_last(pins: &[RosterPin], id: &str) -> Vec<RosterPin> {
	let mut pinned = without_pin(pins, id);
	pinned.push(RosterPin { id: id.to_owned(), section_id: None });
	pinned
}

impl Listing {
	pub fn of(
		bots: Vec<Bot>,
		page: ConversationPage,
		sections: Vec<Section>,
		collapsed: Vec<String>,
	) -> Listing {
		let mut listing =
			Listing { bots, conversations: Vec::new(), sections, collapsed, next_cursor: None };
		listing.read_more(page);
		listing.sections.sort_by_key(|section| section.position);
		listing
	}

	pub fn read_more(&mut self, page: ConversationPage) {
		let fresh = page.pinned.into_iter().chain(page.conversations).collect();
		let arrivals = without_repeats(&self.conversations, fresh);
		self.conversations.extend(arrivals);
		self.next_cursor = page.next_cursor;
	}

	pub fn line(&self, id: &str) -> Option<Line<'_>> {
		self.lines().find(|line| line.id() == id)
	}

	pub fn bot(&self, id: &str) -> Option<&Bot> {
		self.bots.iter().find(|bot| bot.id == id)
	}

	pub fn is_open(&self, section_id: &str) -> bool {
		!self.collapsed.iter().any(|id| id == section_id)
	}

	pub fn section_name(&self, section_id: &str) -> Option<&str> {
		self.section(section_id).map(|section| section.name.as_str())
	}

	pub fn pinned(&self) -> Vec<Placed<'_>> {
		let mut top: Vec<Placed> = self
			.sections
			.iter()
			.map(|section| Placed::Section { section, lines: self.pinned_in(Some(&section.id)) })
			.chain(self.pinned_in(None).into_iter().map(Placed::Line))
			.collect();
		top.sort_by_key(rank_of);
		top
	}

	pub fn sorted(&self) -> Vec<Line<'_>> {
		let mut sorted: Vec<Line> =
			self.lines().filter(|line| line.pin_position().is_none()).collect();
		sorted.sort_by_key(|line| Reverse(line.activity()));
		sorted
	}

	pub fn pins(&self) -> Vec<RosterPin> {
		let pin = |line: &Line, section_id: Option<&str>| RosterPin {
			id: line.id().to_owned(),
			section_id: section_id.map(str::to_owned),
		};
		self.pinned()
			.iter()
			.flat_map(|placed| match placed {
				Placed::Line(line) => vec![pin(line, None)],
				Placed::Section { section, lines } => {
					let head = RosterPin { id: section.id.clone(), section_id: None };
					let held = lines.iter().map(|line| pin(line, Some(&section.id)));
					std::iter::once(head).chain(held).collect()
				}
			})
			.collect()
	}

	pub fn place(&mut self, pins: &[RosterPin]) {
		let placement = |id: &str| -> Placement {
			match position_in(pins, id) {
				Some(at) => (pins[at].section_id.clone(), Some(pin_rank(at))),
				None => (None, None),
			}
		};
		for bot in &mut self.bots {
			(bot.section_id, bot.pin_position) = placement(&bot.id);
		}
		for row in self.conversations.iter_mut().filter(|row| row.solo_bot_id.is_none()) {
			let topic = &mut row.conversation;
			(topic.section_id, topic.pin_position) = placement(&topic.id);
		}
		for section in &mut self.sections {
			if let Some(at) = position_in(pins, &section.id) {
				section.position = pin_rank(at);
			}
		}
		self.sections.sort_by_key(|section| section.position);
	}

	pub fn placement_of(&self, bot_id: &str) -> Option<Placement> {
		self.bot(bot_id).map(|bot| (bot.section_id.clone(), bot.pin_position))
	}

	pub fn move_bot(&mut self, bot_id: &str, section_id: Option<String>) {
		let pin_position = section_id.as_ref().map(|_| LAST_PIN);
		self.restore_bot(bot_id, (section_id, pin_position));
	}

	pub fn restore_bot(&mut self, bot_id: &str, (section_id, pin_position): Placement) {
		if let Some(bot) = self.bots.iter_mut().find(|bot| bot.id == bot_id) {
			bot.section_id = section_id;
			bot.pin_position = pin_position;
		}
	}

	pub fn name_section(&mut self, section_id: &str, name: &str) {
		if let Some(section) = self.sections.iter_mut().find(|section| section.id == section_id) {
			section.name = name.to_owned();
		}
	}

	pub fn admit_bot(&mut self, bot: Bot) {
		self.bots.retain(|held| held.id != bot.id);
		self.bots.push(bot);
	}

	pub fn drop_bot(&mut self, bot_id: &str) {
		self.bots.retain(|bot| bot.id != bot_id);
	}

	pub fn updated_bot(&mut self, bot: &Bot) {
		if let Some(held) = self.bots.iter_mut().find(|held| held.id == bot.id) {
			*held = bot.clone();
		}
	}

	pub fn stored(&mut self, row: ConversationInPage) {
		self.dropped(&row.conversation.id);
		self.conversations.insert(0, row);
	}

	pub fn dropped(&mut self, conversation_id: &str) {
		self.conversations.retain(|row| row.conversation.id != conversation_id);
	}

	pub fn spoke(&mut self, conversation_id: &str, word: LastWord) {
		let Some(row) = self.conversation_mut(conversation_id) else { return };
		row.last_activity_at = row.last_activity_at.max(word.at);
		row.last_word = Some(word);
	}

	pub fn observed(&mut self, conversation_id: &str, observed: ObservedState) {
		if let Some(row) = self.conversation_mut(conversation_id) {
			row.observed = observed;
		}
	}

	fn conversation_mut(&mut self, conversation_id: &str) -> Option<&mut ConversationInPage> {
		self.conversations.iter_mut().find(|row| row.conversation.id == conversation_id)
	}

	fn section(&self, section_id: &str) -> Option<&Section> {
		self.sections.iter().find(|section| section.id == section_id)
	}

	fn solo_of(&self, bot_id: &str) -> Option<&ConversationInPage> {
		self.conversations.iter().find(|row| row.solo_bot_id.as_deref() == Some(bot_id))
	}

	fn lines(&self) -> impl Iterator<Item = Line<'_>> {
		let agents = self.bots.iter().map(|bot| Line::Agent { bot, solo: self.solo_of(&bot.id) });
		let topics =
			self.conversations.iter().filter(|row| row.solo_bot_id.is_none()).map(Line::Topic);
		agents.chain(topics)
	}

	fn held_section_of<'a>(&self, line: &Line<'a>) -> Option<&'a str> {
		line.section_id().filter(|id| self.section(id).is_some())
	}

	fn pinned_in(&self, section_id: Option<&str>) -> Vec<Line<'_>> {
		let mut lines: Vec<Line> = self
			.lines()
			.filter(|line| {
				line.pin_position().is_some() && self.held_section_of(line) == section_id
			})
			.collect();
		lines.sort_by_key(|line| line.pin_position());
		lines
	}
}
