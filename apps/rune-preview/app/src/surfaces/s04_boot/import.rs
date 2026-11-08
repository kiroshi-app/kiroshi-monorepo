use std::collections::HashMap;

use kiroshi_rune_kit::strings::{Language, common::claude_import as copy};
use kiroshi_rune_kit::surfaces::s04_boot::import::{
	ImportEvent, ImportKind, ImportStatus, ImportStep,
};
use kiroshi_rune_kit::surfaces::s04_boot::{counted, say};

use super::calls::{ImportOutcome, ImportResult};
use crate::model::{ClaudeInventory, ClaudeItem};

const LONG_LIST_AGENT_COUNT: usize = 10;

#[derive(Default)]
pub enum Inventory {
	#[default]
	Reading,
	Held(ClaudeInventory),
	Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Pressed {
	Import(Vec<String>),
	ReadAgain,
	Leave,
}

#[derive(Default)]
struct Picks {
	selection: Vec<String>,
	results: HashMap<String, ImportResult>,
}

#[derive(Default)]
pub struct Session {
	pub inventory: Inventory,
	unchecked: Vec<String>,
	picks: Picks,
	before: Option<Picks>,
	has_marked_seen: bool,
}

pub struct Row {
	pub kind: ImportKind,
	pub title: String,
	pub detail: String,
	pub checked: bool,
	pub in_kiroshi: bool,
	pub status: Option<ImportStatus>,
}

pub struct Shown {
	pub step: ImportStep,
	pub title: String,
	pub subtitle: Option<String>,
	pub rows: Vec<Row>,
	pub primary: String,
	pub secondary: Option<String>,
}

pub fn offers_import(inventory: &ClaudeInventory) -> bool {
	match inventory {
		ClaudeInventory::Refused { .. } => true,
		ClaudeInventory::Found { .. } => !entries(inventory).is_empty(),
		ClaudeInventory::Absent => false,
	}
}

fn entries(inventory: &ClaudeInventory) -> Vec<(ImportKind, &ClaudeItem)> {
	let ClaudeInventory::Found { agents, skills, claude_md } = inventory else {
		return Vec::new();
	};
	let agents = agents.iter().map(|item| (ImportKind::Agent, item));
	let instructions = claude_md.iter().map(|item| (ImportKind::Instructions, item));
	let skills = skills.iter().map(|item| (ImportKind::Skill, item));
	agents.chain(instructions).chain(skills).collect()
}

fn status_of(result: Option<&ImportResult>) -> Option<ImportStatus> {
	match result? {
		ImportResult::Failed { .. } => Some(ImportStatus::Failed),
		ImportResult::Imported { .. } | ImportResult::Skipped {} => Some(ImportStatus::Done),
	}
}

fn renamed_of<'a>(item: &ClaudeItem, result: Option<&'a ImportResult>) -> Option<&'a str> {
	match result? {
		ImportResult::Imported { name } if *name != item.name => Some(name),
		_ => None,
	}
}

impl Session {
	pub fn read(&mut self, inventory: Option<ClaudeInventory>) {
		self.inventory = inventory.map_or(Inventory::Failed, Inventory::Held);
	}

	pub fn read_again(&mut self) {
		self.inventory = Inventory::Reading;
	}

	pub fn is_importing(&self) -> bool {
		self.before.is_some()
	}

	fn inventory(&self) -> Option<&ClaudeInventory> {
		match &self.inventory {
			Inventory::Held(inventory) => Some(inventory),
			Inventory::Reading | Inventory::Failed => None,
		}
	}

	fn is_picked(&self, item: &ClaudeItem) -> bool {
		!item.already_imported && !self.unchecked.contains(&item.key)
	}

	fn picked_keys(&self) -> Vec<String> {
		let Some(inventory) = self.inventory() else { return Vec::new() };
		entries(inventory)
			.into_iter()
			.filter(|(_, item)| self.is_picked(item))
			.map(|(_, item)| item.key.clone())
			.collect()
	}

	fn failed_keys(&self) -> Vec<String> {
		self.picks
			.results
			.iter()
			.filter(|(_, result)| matches!(result, ImportResult::Failed { .. }))
			.map(|(key, _)| key.clone())
			.collect()
	}

	fn toggle(&mut self, key: &str, is_checked: bool) {
		self.unchecked.retain(|held| held != key);
		if !is_checked {
			self.unchecked.push(key.to_owned());
		}
	}

	fn keys_of(&self, wanted: impl Fn(usize, ImportKind) -> bool) -> Vec<String> {
		let Some(inventory) = self.inventory() else { return Vec::new() };
		entries(inventory)
			.into_iter()
			.enumerate()
			.filter(|(index, (kind, _))| wanted(*index, *kind))
			.map(|(_, (_, item))| item.key.clone())
			.collect()
	}

	pub fn event(&mut self, event: ImportEvent) -> Option<Pressed> {
		match event {
			ImportEvent::Toggle { item, checked } => {
				for key in self.keys_of(|index, _| index == item) {
					self.toggle(&key, checked);
				}
				None
			}
			ImportEvent::ToggleSkills { checked } => {
				for key in self.keys_of(|_, kind| kind == ImportKind::Skill) {
					self.toggle(&key, checked);
				}
				None
			}
			ImportEvent::Primary => self.primary(),
			ImportEvent::Secondary => self.secondary(),
		}
	}

	fn primary(&mut self) -> Option<Pressed> {
		match self.step() {
			ImportStep::Select => self.start(self.picked_keys(), None),
			ImportStep::Importing => None,
			ImportStep::Done => Some(Pressed::Leave),
			ImportStep::Unreadable => Some(Pressed::ReadAgain),
		}
	}

	fn secondary(&mut self) -> Option<Pressed> {
		match self.step() {
			ImportStep::Done => {
				let selection = self.picks.selection.clone();
				self.start(self.failed_keys(), Some(selection))
			}
			ImportStep::Importing => None,
			ImportStep::Select | ImportStep::Unreadable => Some(Pressed::Leave),
		}
	}

	fn start(&mut self, keys: Vec<String>, selection: Option<Vec<String>>) -> Option<Pressed> {
		if self.is_importing() || keys.is_empty() {
			return None;
		}
		let selection = selection.unwrap_or_else(|| keys.clone());
		let picks = Picks { selection, results: self.picks.results.clone() };
		self.before = Some(std::mem::replace(&mut self.picks, picks));
		Some(Pressed::Import(keys))
	}

	pub fn imported(&mut self, outcomes: Option<Vec<ImportOutcome>>) {
		let Some(before) = self.before.take() else { return };
		match outcomes {
			Some(outcomes) => self
				.picks
				.results
				.extend(outcomes.into_iter().map(|outcome| (outcome.key, outcome.result))),
			None => self.picks = before,
		}
	}

	pub fn mark_seen(&mut self) -> bool {
		!std::mem::replace(&mut self.has_marked_seen, true)
	}

	fn step(&self) -> ImportStep {
		if self.is_importing() {
			return ImportStep::Importing;
		}
		if !self.picks.selection.is_empty() {
			return ImportStep::Done;
		}
		match &self.inventory {
			Inventory::Held(ClaudeInventory::Refused { .. }) | Inventory::Failed => {
				ImportStep::Unreadable
			}
			Inventory::Held(_) | Inventory::Reading => ImportStep::Select,
		}
	}

	fn rows(&self, language: Language) -> Vec<Row> {
		let Some(inventory) = self.inventory() else { return Vec::new() };
		let has_picks = !self.picks.selection.is_empty();
		entries(inventory)
			.into_iter()
			.map(|(kind, item)| match has_picks {
				true => self.imported_row(kind, item, language),
				false => Row {
					kind,
					title: item.name.clone(),
					detail: item.description.clone(),
					checked: self.is_picked(item),
					in_kiroshi: item.already_imported,
					status: None,
				},
			})
			.collect()
	}

	fn imported_row(&self, kind: ImportKind, item: &ClaudeItem, language: Language) -> Row {
		let result = self.picks.results.get(&item.key);
		let renamed = renamed_of(item, result);
		let detail = match (result, renamed) {
			(Some(ImportResult::Failed { cause }), _) => cause.clone(),
			(_, Some(renamed)) => {
				say(copy::row::NAME_TAKEN, language, &[("name", &item.name), ("renamed", renamed)])
			}
			(_, None) => item.description.clone(),
		};
		Row {
			kind,
			title: renamed.unwrap_or(&item.name).to_owned(),
			detail,
			checked: self.picks.selection.contains(&item.key),
			in_kiroshi: false,
			status: status_of(result),
		}
	}

	pub fn shown(&self, language: Language) -> Shown {
		let said = |key: kiroshi_rune_kit::strings::Key| key.text(language).to_owned();
		let rows = self.rows(language);
		let step = self.step();
		let (title, subtitle, primary, secondary) = match step {
			ImportStep::Importing => {
				(said(copy::importing::TITLE), None, said(copy::importing::ACTION), None)
			}
			ImportStep::Done => {
				match rows.iter().find(|row| row.status == Some(ImportStatus::Failed)) {
					None => (said(copy::done::TITLE), None, said(copy::done::CONTINUE), None),
					Some(failed) => (
						said(copy::partly_failed::TITLE),
						None,
						said(copy::done::CONTINUE),
						Some(say(copy::partly_failed::RETRY, language, &[("name", &failed.title)])),
					),
				}
			}
			ImportStep::Unreadable => (
				said(copy::unreadable::TITLE),
				Some(said(copy::unreadable::BODY)),
				said(copy::unreadable::RETRY),
				Some(said(copy::select::SKIP)),
			),
			ImportStep::Select => (
				said(copy::select::TITLE),
				Some(self.select_subtitle(language)),
				self.import_label(language),
				Some(said(copy::select::SKIP)),
			),
		};
		Shown { step, title, subtitle, rows, primary, secondary }
	}

	fn select_subtitle(&self, language: Language) -> String {
		if self.picked_keys().is_empty() {
			return copy::select::NOTHING_SELECTED.text(language).to_owned();
		}
		let agents = self.keys_of(|_, kind| kind == ImportKind::Agent).len();
		match agents >= LONG_LIST_AGENT_COUNT {
			true => say(copy::select::BODY_MANY, language, &[("count", &agents.to_string())]),
			false => copy::select::BODY.text(language).to_owned(),
		}
	}

	fn import_label(&self, language: Language) -> String {
		let picked = self.picked_keys();
		if picked.is_empty() {
			return copy::select::IMPORT.text(language).to_owned();
		}
		let agents = self.keys_of(|_, kind| kind == ImportKind::Agent);
		let (one, other) = match picked.iter().all(|key| agents.contains(key)) {
			true => (copy::select::IMPORT_COMPANIONS_ONE, copy::select::IMPORT_COMPANIONS_OTHER),
			false => (copy::select::IMPORT_ITEMS_ONE, copy::select::IMPORT_ITEMS_OTHER),
		};
		counted(one, other, picked.len(), language)
	}
}
