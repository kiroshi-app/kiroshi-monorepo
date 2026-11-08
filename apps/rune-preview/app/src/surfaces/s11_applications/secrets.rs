use kiroshi_core::environment::contract::{EnvEntry, EnvScope};
use kiroshi_rune_kit::surfaces::s11_applications::secrets::{Scope, Secret};
use rune::TextEdit;

use super::Reading;

pub struct Secrets {
	pub entries: Vec<EnvEntry>,
	pub read: Reading,
}

impl Default for Secrets {
	fn default() -> Secrets {
		Secrets { entries: Vec::new(), read: Reading::Pending }
	}
}

pub struct Write {
	pub replacing: Option<String>,
	pub name: TextEdit,
	pub value: TextEdit,
	pub is_refused: bool,
	pub has_failed: bool,
	pub is_writing: bool,
}

pub struct Removal {
	pub name: String,
	pub has_failed: bool,
	pub is_removing: bool,
}

pub enum Dialog {
	Write(Box<Write>),
	Remove(Removal),
}

pub fn is_secret_name(name: &str) -> bool {
	let mut chars = name.chars();
	let Some(first) = chars.next() else { return false };
	let is_upper_or_underscore = |held: char| held.is_ascii_uppercase() || held == '_';
	is_upper_or_underscore(first)
		&& chars.all(|held| is_upper_or_underscore(held) || held.is_ascii_digit())
}

fn panel_scope(scope: &EnvScope) -> Option<Scope> {
	match scope {
		EnvScope::User => Some(Scope::User),
		EnvScope::Space { .. } => Some(Scope::Space),
		EnvScope::Bot { .. } => Some(Scope::Agent),
		EnvScope::Server { .. } => Some(Scope::Application),
		EnvScope::Person | EnvScope::Account => None,
	}
}

impl Secrets {
	pub fn is_pending(&self) -> bool {
		self.read == Reading::Pending && self.entries.is_empty()
	}

	pub fn has_failed(&self) -> bool {
		self.read == Reading::Failed
	}

	pub fn rows(&self) -> Vec<Secret> {
		let mut rows: Vec<Secret> = Vec::new();
		for entry in &self.entries {
			let (Some(defined_in), Some(served_from)) =
				(panel_scope(&entry.defined_in), panel_scope(&entry.served_from))
			else {
				continue;
			};
			match rows.iter_mut().find(|row| row.name == entry.name) {
				Some(narrower) => {
					narrower.overrides.get_or_insert(defined_in);
				}
				None => rows.push(Secret {
					name: entry.name.clone(),
					defined_in,
					served_from,
					overrides: None,
					is_unset: entry.is_unset,
				}),
			}
		}
		rows
	}
}

impl Write {
	pub fn new(replacing: Option<String>) -> Write {
		let name = TextEdit::new(replacing.clone().unwrap_or_default());
		Write {
			replacing,
			name,
			value: TextEdit::new(""),
			is_refused: false,
			has_failed: false,
			is_writing: false,
		}
	}

	pub fn submitted(&mut self) -> Option<String> {
		let typed = self.name.text.trim().to_owned();
		self.is_refused = !is_secret_name(&typed);
		if self.is_refused || self.is_writing {
			return None;
		}
		self.has_failed = false;
		self.is_writing = true;
		Some(typed)
	}
}
