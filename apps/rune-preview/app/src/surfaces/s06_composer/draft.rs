use rune::TextEdit;

use super::worker::{File, Outgoing};

#[derive(Clone, Debug, PartialEq)]
pub struct Document {
	pub name: String,
	pub title: String,
	pub bytes: u64,
}

#[derive(Debug, PartialEq)]
pub struct Pending {
	pub message_id: String,
	pub text: String,
	pub file_ids: Vec<String>,
	pub document_names: Vec<String>,
	pub reply_ids: Vec<String>,
	pub queues: bool,
}

#[derive(Default)]
pub struct Draft {
	pub edit: TextEdit,
	pub files: Vec<File>,
	pub documents: Vec<Document>,
	pub queue: Vec<Outgoing>,
	pub pending: Option<Pending>,
	pub running: Vec<Outgoing>,
	pub is_queue_held: bool,
}

impl Draft {
	pub fn has_payload(&self) -> bool {
		!self.edit.text.trim().is_empty() || !self.files.is_empty() || !self.documents.is_empty()
	}

	pub fn is_running(&self) -> bool {
		!self.running.is_empty()
	}

	pub fn write(&mut self, text: String) {
		self.edit.replace_text(text);
		self.edit.focused = true;
	}

	pub fn stage(&mut self, files: Vec<File>) {
		self.files.extend(files);
	}

	pub fn stage_document(&mut self, document: Document) {
		if !self.documents.iter().any(|held| held.name == document.name) {
			self.documents.push(document);
		}
	}

	pub fn remove(&mut self, id: &str) {
		self.files.retain(|file| file.id != id);
		self.documents.retain(|document| document.name != id);
	}

	pub fn accept(&mut self, message_id: &str) -> Option<Vec<String>> {
		let pending = self.pending.take_if(|pending| pending.message_id == message_id)?;
		if self.edit.text.trim() == pending.text {
			self.edit.clear();
		}
		self.files.retain(|file| !pending.file_ids.contains(&file.id));
		self.documents.retain(|document| !pending.document_names.contains(&document.name));
		Some(pending.reply_ids)
	}

	pub fn refuse(&mut self, message_id: &str) -> bool {
		self.pending.take_if(|pending| pending.message_id == message_id).is_some()
	}

	pub fn hold_front(&mut self, outgoing: Outgoing) {
		self.queue.insert(0, outgoing);
	}

	pub fn take_queued(&mut self, id: &str) -> Option<Outgoing> {
		let at = self.queue.iter().position(|queued| queued.message_id == id)?;
		Some(self.queue.remove(at))
	}
}
