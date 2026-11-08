#[cfg(test)]
mod tests;

use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s04_boot::notice::{
	NoticeKind, RaisedNotice, SurfaceEvent, notice_surface,
};
use kiroshi_rune_kit::tokens::Tokens;
use rune::El;

use super::App;
use crate::host::HostError;

const LANGUAGE: Language = Language::En;

#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
	pub kind: NoticeKind,
	pub title: String,
	pub description: Option<String>,
	pub space_id: Option<String>,
}

impl Notice {
	pub fn failure(title: impl Into<String>, description: impl Into<String>) -> Notice {
		Notice {
			kind: NoticeKind::Error,
			title: title.into(),
			description: Some(description.into()),
			space_id: None,
		}
	}

	pub fn of_host_failure(title: &str, failure: &HostError) -> Notice {
		Notice::failure(title, format!("{}: {}", failure.title(), failure.detail()))
	}

	pub fn info(title: &str) -> Notice {
		Notice {
			kind: NoticeKind::Info,
			title: title.to_owned(),
			description: None,
			space_id: None,
		}
	}

	pub fn of_space(self, space_id: String) -> Notice {
		Notice { space_id: Some(space_id), ..self }
	}

	fn raised(&self) -> RaisedNotice<'_> {
		let description = self.description.as_deref();
		match self.kind {
			NoticeKind::Error => RaisedNotice::failure(&self.title, description),
			kind => RaisedNotice::transient(kind, &self.title, description),
		}
	}

	fn logged(&self) -> String {
		match &self.description {
			Some(description) => format!("{}: {description}", self.title),
			None => self.title.clone(),
		}
	}
}

impl App {
	pub fn raise(&mut self, notice: Notice) {
		if !is_on_screen(self, &notice) {
			eprintln!("a notice of a Space not on screen: {}", notice.logged());
		}
		self.notice = Some(notice);
	}
}

fn is_on_screen(app: &App, notice: &Notice) -> bool {
	match &notice.space_id {
		None => true,
		Some(space_id) => app.ready().is_some_and(|ready| ready.space.id == *space_id),
	}
}

pub fn shown(app: &App) -> Option<&Notice> {
	app.notice.as_ref().filter(|notice| is_on_screen(app, notice))
}

pub fn layer(app: &App, t: &Tokens) -> Option<El> {
	let notice = shown(app)?;
	Some(notice_surface(t, LANGUAGE, &[notice.raised()], closed))
}

fn closed(app: &mut App, event: SurfaceEvent) {
	match event {
		SurfaceEvent::Close(_) | SurfaceEvent::Act(_) | SurfaceEvent::CopyReport(_) => {
			app.notice = None
		}
	}
}
