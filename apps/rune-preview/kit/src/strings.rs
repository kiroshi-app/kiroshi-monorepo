#[rustfmt::skip]
mod catalogue;

#[cfg(test)]
mod tests;

pub use catalogue::{bots, chat, common, search, settings};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Language {
	En,
	Fr,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Key(u16);

impl Key {
	pub fn path(self) -> &'static str {
		catalogue::ENTRIES[usize::from(self.0)].0
	}

	pub fn text(self, language: Language) -> &'static str {
		let (_, en, fr) = catalogue::ENTRIES[usize::from(self.0)];
		match language {
			Language::En => en,
			Language::Fr => fr,
		}
	}
}
