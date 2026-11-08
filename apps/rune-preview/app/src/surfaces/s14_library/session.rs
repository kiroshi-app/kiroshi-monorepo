use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, ReadTxn, StickyIndex, Text, Transact, Update};

const TEXT_NAME: &str = "markdown";

const REMOTE: &str = "remote";

pub struct Session {
	doc: Doc,
}

fn decoded(base64: &str) -> Result<Vec<u8>, String> {
	BASE64_STANDARD.decode(base64).map_err(|failure| failure.to_string())
}

fn shared_bytes(current: impl Iterator<Item = char>, wanted: impl Iterator<Item = char>) -> usize {
	current
		.zip(wanted)
		.take_while(|(held, want)| held == want)
		.map(|(held, _)| held.len_utf8())
		.sum()
}

impl Session {
	pub fn opened(state: &str) -> Result<Session, String> {
		let session = Session { doc: Doc::new() };
		session.apply(state)?;
		Ok(session)
	}

	pub fn markdown(&self) -> String {
		self.doc.get_or_insert_text(TEXT_NAME).get_string(&self.doc.transact())
	}

	pub fn received(&mut self, update: &str) -> Result<(), String> {
		self.apply(update)
	}

	pub fn edited(&mut self, wanted: &str) -> Option<String> {
		let text = self.doc.get_or_insert_text(TEXT_NAME);
		let before = self.doc.transact().state_vector();
		let mut txn = self.doc.transact_mut();
		let current = text.get_string(&txn);
		if current == wanted {
			return None;
		}
		let prefix = shared_bytes(current.chars(), wanted.chars());
		let suffix = shared_bytes(current[prefix..].chars().rev(), wanted[prefix..].chars().rev());
		let removed = current.len() - prefix - suffix;
		if removed > 0 {
			text.remove_range(&mut txn, prefix as u32, removed as u32);
		}
		text.insert(&mut txn, prefix as u32, &wanted[prefix..wanted.len() - suffix]);
		Some(BASE64_STANDARD.encode(txn.encode_state_as_update_v1(&before)))
	}

	pub fn offset_of(&self, anchor: &str) -> Option<usize> {
		let bytes = decoded(anchor).ok()?;
		let caret = StickyIndex::decode_v1(&bytes).ok()?;
		let offset = caret.get_offset(&self.doc.transact())?;
		Some(offset.index as usize)
	}

	fn apply(&self, update: &str) -> Result<(), String> {
		let update = Update::decode_v1(&decoded(update)?).map_err(|failure| failure.to_string())?;
		self.doc
			.transact_mut_with(REMOTE)
			.apply_update(update)
			.map_err(|failure| failure.to_string())
	}
}
