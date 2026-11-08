#[cfg(test)]
mod tests;

use std::collections::HashMap;

use kiroshi_rune_kit::strings::{Language, chat};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{
	NoticeKind, RaisedNotice, SurfaceEvent, notice_surface,
};
use kiroshi_rune_kit::tokens::Tokens;
use rune::El;

use super::App;
use crate::host::HostError;
use crate::surfaces::s04_boot::Retry;

const LANGUAGE: Language = Language::En;

#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
	pub kind: NoticeKind,
	pub title: String,
	pub description: Option<String>,
	pub space_id: Option<String>,
	pub retry: Option<Retry>,
}

impl Notice {
	pub fn failure(title: impl Into<String>, description: impl Into<String>) -> Notice {
		Notice {
			kind: NoticeKind::Error,
			title: title.into(),
			description: Some(description.into()),
			space_id: None,
			retry: None,
		}
	}

	pub fn of_host_failure(title: &str, failure: &HostError) -> Notice {
		Notice::failure(title, format!("{}: {}", failure.title(), failure.detail()))
	}

	pub fn info(title: &str) -> Notice {
		Notice { kind: NoticeKind::Info, ..Notice::error(title) }
	}

	pub fn error(title: impl Into<String>) -> Notice {
		Notice {
			kind: NoticeKind::Error,
			title: title.into(),
			description: None,
			space_id: None,
			retry: None,
		}
	}

	pub fn of_space(self, space_id: String) -> Notice {
		Notice { space_id: Some(space_id), ..self }
	}

	pub fn with_retry(self, retry: Retry) -> Notice {
		Notice { retry: Some(retry), ..self }
	}

	fn raised(&self) -> RaisedNotice<'_> {
		let description = self.description.as_deref();
		let raised = match self.kind {
			NoticeKind::Error => RaisedNotice::failure(&self.title, description),
			kind => RaisedNotice::transient(kind, &self.title, description),
		};
		let action = self.retry.as_ref().map(|_| chat::notice::RETRY.text(LANGUAGE));
		RaisedNotice { action, ..raised }
	}

	fn logged(&self) -> String {
		match &self.description {
			Some(description) => format!("{}: {description}", self.title),
			None => self.title.clone(),
		}
	}
}

#[derive(Debug, Default)]
pub struct NoticeBoard {
	of_window: Option<Notice>,
	of_spaces: HashMap<String, Notice>,
}

impl NoticeBoard {
	fn raise(&mut self, notice: Notice) {
		match notice.space_id.clone() {
			Some(space_id) => {
				self.of_spaces.insert(space_id, notice);
			}
			None => self.of_window = Some(notice),
		}
	}

	fn shown(&self, space_on_screen: Option<&str>) -> Vec<&Notice> {
		let of_space = space_on_screen.and_then(|space_id| self.of_spaces.get(space_id));
		of_space.into_iter().chain(self.of_window.as_ref()).collect()
	}

	fn close(&mut self, index: usize, space_on_screen: Option<&str>) -> Option<Notice> {
		let shown_space = space_on_screen.filter(|space_id| self.of_spaces.contains_key(*space_id));
		match (index, shown_space) {
			(0, Some(space_id)) => self.of_spaces.remove(space_id),
			_ => self.of_window.take(),
		}
	}
}

impl App {
	pub fn raise(&mut self, notice: Notice) {
		if notice.space_id.is_some() && notice.space_id.as_deref() != space_on_screen(self) {
			eprintln!("a notice of a Space not on screen: {}", notice.logged());
		}
		self.notice.raise(notice);
	}

	pub fn raise_all(&mut self, notices: Vec<Notice>) {
		for notice in notices {
			self.raise(notice);
		}
	}
}

fn space_on_screen(app: &App) -> Option<&str> {
	app.ready().map(|ready| ready.space.id.as_str())
}

pub fn shown(app: &App) -> Vec<&Notice> {
	app.notice.shown(space_on_screen(app))
}

pub fn layer(app: &App, t: &Tokens) -> Option<El> {
	let raised: Vec<RaisedNotice> = shown(app).into_iter().map(Notice::raised).collect();
	if raised.is_empty() {
		return None;
	}
	Some(notice_surface(t, LANGUAGE, &raised, closed))
}

pub(crate) fn closed(app: &mut App, event: SurfaceEvent) {
	let (SurfaceEvent::Close(index) | SurfaceEvent::Act(index) | SurfaceEvent::CopyReport(index)) =
		event;
	let space_on_screen = space_on_screen(app).map(str::to_owned);
	let closed = app.notice.close(index, space_on_screen.as_deref());
	if let (SurfaceEvent::Act(_), Some(retry)) = (event, closed.and_then(|notice| notice.retry)) {
		retry.run(app);
	}
}
