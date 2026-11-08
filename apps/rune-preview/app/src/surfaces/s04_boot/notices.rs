use std::time::Duration;

use kiroshi_rune_kit::surfaces::s04_boot::notice::NoticeKind;

use super::calls::Call;

pub const TRANSIENT_LIFETIME: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, PartialEq)]
pub struct Raised {
	pub id: u64,
	pub kind: NoticeKind,
	pub title: String,
	pub description: Option<String>,
	pub retry: Option<Call>,
}

#[derive(Default)]
pub struct Notices {
	raised: Vec<Raised>,
	last_id: u64,
}

impl Notices {
	pub fn raised(&self) -> &[Raised] {
		&self.raised
	}

	pub fn fail(&mut self, title: String, description: String, retry: Option<Call>) {
		let description = Some(description);
		let is_shown = self.raised.iter().any(|held| {
			held.kind == NoticeKind::Error && held.title == title && held.description == description
		});
		if !is_shown {
			self.push(NoticeKind::Error, title, description, retry);
		}
	}

	pub fn tell(&mut self, kind: NoticeKind, title: String, description: Option<String>) -> u64 {
		self.push(kind, title, description, None)
	}

	pub fn expire(&mut self, id: u64) {
		self.raised.retain(|held| held.id != id || held.kind == NoticeKind::Error);
	}

	pub fn close(&mut self, index: usize) -> Option<Raised> {
		(index < self.raised.len()).then(|| self.raised.remove(index))
	}

	fn push(
		&mut self,
		kind: NoticeKind,
		title: String,
		description: Option<String>,
		retry: Option<Call>,
	) -> u64 {
		self.last_id += 1;
		self.raised.push(Raised { id: self.last_id, kind, title, description, retry });
		self.last_id
	}
}
