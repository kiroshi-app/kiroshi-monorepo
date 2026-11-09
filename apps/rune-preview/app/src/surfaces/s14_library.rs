mod actions;
mod blocks;
mod document;
mod editing;
mod handle;
mod heard;
mod imports;
mod item_menu;
mod rich;
mod session;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use std::collections::HashMap;
use std::path::PathBuf;

use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::library::contract::{
	LibraryImage, LibraryImport, LibraryItem, LibraryItemKind, LibraryWriteOutcome,
};
use rune::image::{Image, ImageCache};
use rune::{KeyEvent, TextEdit, Tx, Waker};

use kiroshi_rune_kit::strings::{Key as Copy, Language, common};
use kiroshi_rune_kit::surfaces::s14_library::{
	DOCUMENT_PANEL_MIN_WIDTH, DOCUMENT_PANEL_OPENING_WIDTH, DocumentPanelEvent, ItemAction,
	ItemEvent, LibraryEvent, LibraryFilter, LibraryTemplate, LightboxEvent, NewDocumentEvent,
	NewDocumentTemplate, panel_max_width,
};

use crate::app::App;
use crate::app::notice::Notice;
use crate::conversations::now_ms;
use crate::host::HostError;
use crate::navigation::Route;
use crate::source::Source;

pub use heard::{Heard, heard_of};
pub use view::{GRID, layers, panel, view};

use actions::Effect;
use document::Document;
use editing::{LinkState, SlashState};
use handle::BlockMenu;
use imports::Screened;
use item_menu::{ItemMenu, MenuSurface};
use rich::GalleryAdd;
use worker::{Answer, Call, Due, NewDocument, Target, Worker};

const ZOOM_STEP: u32 = 25;

const ZOOM_MIN: u32 = 25;

const ZOOM_MAX: u32 = 400;

const ZOOM_FIT: u32 = 100;

const EXCERPT_CHARS: usize = 280;

const MONTHS: [&str; 12] = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DAY_PLACEHOLDER: &str = "{{date, datetime(day: numeric)}}";

const MONTH_PLACEHOLDER: &str = "{{date, datetime(month: long)}}";

#[derive(Default)]
enum Listing {
	#[default]
	Idle,
	Loading,
	Failed,
	Loaded(Vec<LibraryItem>),
}

enum Preview {
	Reading,
	Image(Image),
	Excerpt(String),
	Failed,
}

struct Lightbox {
	name: String,
	image: Option<Image>,
	zoom_percent: Option<u32>,
}

enum Shown {
	Document(Box<Document>),
	Image(Lightbox),
}

#[derive(Clone, Debug, PartialEq)]
enum Dialog {
	NewDocument(NewDocumentTemplate),
	Delete { target: Target, has_failed: bool },
}

pub struct State {
	space_id: Option<String>,
	is_joined: bool,
	listing: Listing,
	previews: HashMap<String, Preview>,
	filter: LibraryFilter,
	query: TextEdit,
	shown: Option<Shown>,
	beside: Option<Document>,
	kept_width: Option<f32>,
	awaiting_tab: Option<String>,
	wants_library: bool,
	dialog: Option<Dialog>,
	menu: Option<ItemMenu>,
	is_creating: bool,
	importing: Vec<String>,
	to_raise: Vec<Notice>,
	slash: Option<SlashState>,
	link: Option<LinkState>,
	block_menu: Option<BlockMenu>,
	gallery_add_failed: Option<GalleryAdd>,
	is_flush_armed: bool,
	copied: Option<String>,
	effects: Vec<Effect>,
	board_to_open: Option<String>,
	spare: TextEdit,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
	images: Option<ImageCache>,
}

impl Default for State {
	fn default() -> State {
		State {
			space_id: None,
			is_joined: false,
			listing: Listing::Idle,
			previews: HashMap::new(),
			filter: LibraryFilter::All,
			query: TextEdit::default(),
			shown: None,
			beside: None,
			kept_width: None,
			awaiting_tab: None,
			wants_library: false,
			dialog: None,
			menu: None,
			is_creating: false,
			importing: Vec::new(),
			to_raise: Vec::new(),
			slash: None,
			link: None,
			block_menu: None,
			gallery_add_failed: None,
			is_flush_armed: false,
			copied: None,
			effects: Vec::new(),
			board_to_open: None,
			spare: TextEdit::default(),
			queued: Vec::new(),
			source: None,
			waker: None,
			worker: None,
			images: None,
		}
	}
}

fn said(key: Copy) -> String {
	key.text(Language::En).to_owned()
}

fn filled(key: Copy, slot: &str, value: &str) -> String {
	said(key).replace(&format!("{{{{{slot}}}}}"), value)
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn is_shown_kind(item: &LibraryItem) -> bool {
	matches!(item.kind, LibraryItemKind::Image | LibraryItemKind::Document)
}

fn excerpt_of(content: &str) -> String {
	let blocks = blocks::blocks_of(content, &[]);
	let markdown = blocks::markdown_of("", &blocks, blocks::Format::Plain);
	markdown.chars().take(EXCERPT_CHARS).collect()
}

fn month_and_day(at_ms: i64) -> (usize, i64) {
	let days = at_ms.div_euclid(86_400_000) + 719_468;
	let era = days.div_euclid(146_097);
	let day_of_era = days - era * 146_097;
	let year_of_era =
		(day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
	let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
	let month_index = (5 * day_of_year + 2) / 153;
	let day = day_of_year - (153 * month_index + 2) / 5 + 1;
	let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
	(month as usize, day)
}

fn meeting_notes_title(at_ms: i64) -> String {
	let (month, day) = month_and_day(at_ms);
	said(common::library::templates::meeting_notes::TITLE)
		.replace(DAY_PLACEHOLDER, &day.to_string())
		.replace(MONTH_PLACEHOLDER, MONTHS[month - 1])
}

fn template_start(template: NewDocumentTemplate, now: i64) -> (String, String) {
	use common::library::templates::{brief, meeting_notes};
	match template {
		NewDocumentTemplate::Blank => (String::new(), String::new()),
		NewDocumentTemplate::Brief => (
			String::new(),
			format!(
				"## {}\n\n## {}\n",
				said(brief::goal::HEADING),
				said(brief::done_when::HEADING)
			),
		),
		NewDocumentTemplate::MeetingNotes => (
			meeting_notes_title(now),
			format!(
				"## {}\n\n## {}\n",
				said(meeting_notes::decisions::HEADING),
				said(meeting_notes::next_steps::HEADING)
			),
		),
		NewDocumentTemplate::Checklist => (String::new(), "- [ ] \n".to_owned()),
	}
}

fn new_document_template(template: LibraryTemplate) -> NewDocumentTemplate {
	match template {
		LibraryTemplate::Brief => NewDocumentTemplate::Brief,
		LibraryTemplate::MeetingNotes => NewDocumentTemplate::MeetingNotes,
		LibraryTemplate::Checklist => NewDocumentTemplate::Checklist,
	}
}

impl Shown {
	fn document_mut(&mut self) -> Option<&mut Document> {
		match self {
			Shown::Document(document) => Some(document.as_mut()),
			Shown::Image(_) => None,
		}
	}

	fn name(&self) -> &str {
		match self {
			Shown::Document(document) => &document.target.name,
			Shown::Image(lightbox) => &lightbox.name,
		}
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.images = Some(ImageCache::new(waker.clone()));
		self.waker = Some(waker);
		self.flush();
	}

	pub fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
	}

	// The joined flag stays false: the preview can't open a joined Space yet (s02_rail
	// JOINED_UNOPENABLE), so every Library it shows is hosted here and takes the 20 MiB limit.
	pub fn enter_space(&mut self, space_id: &str, is_joined: bool) {
		self.is_joined = is_joined;
		if self.space_id.as_deref() == Some(space_id) {
			return;
		}
		self.close_shown();
		self.close_beside();
		self.space_id = Some(space_id.to_owned());
		self.listing = Listing::Idle;
		self.previews.clear();
		self.awaiting_tab = None;
		self.dialog = None;
		self.menu = None;
		self.slash = None;
		self.link = None;
		self.block_menu = None;
	}

	pub fn show_library(&mut self) {
		if matches!(self.listing, Listing::Idle) {
			self.list();
		}
	}

	fn target_of(&self, name: &str) -> Option<Target> {
		let space_id = self.space_id.clone()?;
		Some(Target { space_id, name: name.to_owned() })
	}

	fn items(&self) -> &[LibraryItem] {
		match &self.listing {
			Listing::Loaded(items) => items,
			Listing::Idle | Listing::Loading | Listing::Failed => &[],
		}
	}

	fn listed(&self, name: &str) -> Option<&LibraryItem> {
		self.items().iter().find(|item| item.name == name)
	}

	fn list(&mut self) {
		let Some(space_id) = self.space_id.clone() else { return };
		if !matches!(self.listing, Listing::Loaded(_)) {
			self.listing = Listing::Loading;
		}
		self.queue(Call::List { space_id });
		self.flush();
	}

	pub fn retry_list(&mut self) {
		self.listing = Listing::Loading;
		self.list();
	}

	pub fn handle_library(&mut self, event: LibraryEvent) {
		match event {
			LibraryEvent::Filter(filter) => self.filter = filter,
			LibraryEvent::Open(name) => self.open(&name),
			LibraryEvent::NewDocument => {
				self.dialog = Some(Dialog::NewDocument(NewDocumentTemplate::Blank))
			}
			LibraryEvent::StartTemplate(template) => {
				self.dialog = Some(Dialog::NewDocument(new_document_template(template)))
			}
			LibraryEvent::Import => self.effects.push(Effect::PickFile),
			LibraryEvent::NewBoard => self.create_board(),
			LibraryEvent::Menu { id, anchor } => self.open_menu(id, anchor, MenuSurface::Tile),
			LibraryEvent::Retry => self.retry_list(),
		}
	}

	pub fn act(&mut self, name: &str, action: ItemAction) {
		match action {
			ItemAction::Open => self.open(name),
			ItemAction::OpenInNewTab => self.open_in_new_tab(name),
			ItemAction::Rename => self.open_to_rename(name),
			ItemAction::Delete => self.ask_delete(name),
			ItemAction::Copy | ItemAction::CopyImage => self.copy(name),
			ItemAction::Download => self.download(name),
			ItemAction::ShowInFolder => self.reveal(name),
			ItemAction::SaveToLibrary => self.save_to_library(name),
		}
	}

	pub fn open(&mut self, name: &str) {
		let Some(item) = self.listed(name) else { return };
		let kind = item.kind;
		let Some(target) = self.target_of(name) else { return };
		match kind {
			LibraryItemKind::Document => self.show_document(target),
			LibraryItemKind::Image => self.show_image(target),
			LibraryItemKind::Board => {}
		}
	}

	fn show_document(&mut self, target: Target) {
		if self.shown.as_ref().is_some_and(|shown| shown.name() == target.name) {
			return;
		}
		self.close_shown();
		self.queue(Call::Open(target.clone()));
		self.shown = Some(Shown::Document(Box::new(Document::new(target))));
		self.flush();
	}

	fn show_image(&mut self, target: Target) {
		self.close_shown();
		let lightbox = Lightbox { name: target.name.clone(), image: None, zoom_percent: None };
		self.queue(Call::Image(target));
		self.shown = Some(Shown::Image(lightbox));
		self.flush();
	}

	fn open_in_new_tab(&mut self, name: &str) {
		self.awaiting_tab = Some(name.to_owned());
		self.list();
	}

	fn open_to_rename(&mut self, name: &str) {
		self.open(name);
		if let Some(document) = self.shown.as_mut().and_then(Shown::document_mut) {
			document.title.focused = true;
			document.title.set_caret(document.title.text.len());
		}
	}

	fn ask_delete(&mut self, name: &str) {
		let Some(target) = self.target_of(name) else { return };
		self.dialog = Some(Dialog::Delete { target, has_failed: false });
	}

	pub fn confirm_delete(&mut self, is_confirmed: bool) {
		let Some(Dialog::Delete { target, .. }) = self.dialog.clone() else { return };
		if !is_confirmed {
			self.dialog = None;
			return;
		}
		self.queue(Call::Delete(target));
		self.flush();
	}

	pub fn handle_new_document(&mut self, event: NewDocumentEvent, now: i64) {
		match event {
			NewDocumentEvent::Select(template) => self.dialog = Some(Dialog::NewDocument(template)),
			NewDocumentEvent::Cancel => self.dialog = None,
			NewDocumentEvent::Create(template) => self.create(template, now),
		}
	}

	fn create(&mut self, template: NewDocumentTemplate, now: i64) {
		let Some(space_id) = self.space_id.clone() else { return };
		if self.is_creating {
			return;
		}
		self.is_creating = true;
		let (title, body) = template_start(template, now);
		let untitled = said(common::library::editor::UNTITLED);
		self.queue(Call::Create(NewDocument { space_id, title, untitled, body }));
		self.flush();
	}

	pub fn handle_lightbox(&mut self, event: LightboxEvent) {
		let shown_name = self.shown.as_ref().map(|shown| shown.name().to_owned());
		if let (LightboxEvent::Item(item @ (ItemEvent::Download | ItemEvent::Copy)), Some(name)) =
			(&event, shown_name)
		{
			match item {
				ItemEvent::Download => self.download(&name),
				_ => self.copy(&name),
			}
			return;
		}
		let images = self.shown_images();
		let Some(Shown::Image(lightbox)) = self.shown.as_mut() else { return };
		let position = images.iter().position(|name| *name == lightbox.name);
		match event {
			LightboxEvent::Item(ItemEvent::Close | ItemEvent::Back) => self.close_shown(),
			LightboxEvent::Item(ItemEvent::Download | ItemEvent::Copy) => {}
			LightboxEvent::Item(ItemEvent::More) => {
				let name = Some(lightbox.name.clone());
				self.open_bar_menu(name, MenuSurface::Lightbox);
			}
			LightboxEvent::Previous => {
				let previous = position.and_then(|at| at.checked_sub(1));
				if let Some(name) = previous.and_then(|at| images.get(at)) {
					self.open(&name.clone());
				}
			}
			LightboxEvent::Next => {
				if let Some(name) = position.and_then(|at| images.get(at + 1)) {
					self.open(&name.clone());
				}
			}
			LightboxEvent::ZoomIn => {
				let zoom = lightbox.zoom_percent.unwrap_or(ZOOM_FIT);
				lightbox.zoom_percent = Some((zoom + ZOOM_STEP).min(ZOOM_MAX));
			}
			LightboxEvent::ZoomOut => {
				let zoom = lightbox.zoom_percent.unwrap_or(ZOOM_FIT);
				lightbox.zoom_percent = Some(zoom.saturating_sub(ZOOM_STEP).max(ZOOM_MIN));
			}
			LightboxEvent::Fit => lightbox.zoom_percent = None,
			LightboxEvent::PictureMenuRequested { .. } => {}
		}
	}

	fn shown_images(&self) -> Vec<String> {
		self.items()
			.iter()
			.filter(|item| item.kind == LibraryItemKind::Image)
			.filter(|item| matches_query(item, &self.query.text))
			.map(|item| item.name.clone())
			.collect()
	}

	pub fn handle_document_bar(&mut self, event: ItemEvent) {
		match event {
			ItemEvent::Back | ItemEvent::Close => {
				self.close_shown();
				self.list();
			}
			ItemEvent::Download | ItemEvent::Copy => {
				let Some(name) = self.shown_document().map(|document| document.target.name.clone())
				else {
					return;
				};
				if event == ItemEvent::Download {
					self.download(&name);
				} else {
					self.copy(&name);
				}
			}
			ItemEvent::More => {
				let name = self.shown_document().map(|document| document.target.name.clone());
				self.open_bar_menu(name, MenuSurface::Bar);
			}
		}
	}

	pub fn confirm_title(&mut self) {
		let Some(document) = self.shown.as_mut().and_then(Shown::document_mut) else { return };
		let Some(new_name) = document.new_name() else {
			document.restore_title();
			return;
		};
		let target = document.target.clone();
		self.queue(Call::Rename { target, new_name });
		self.flush();
	}

	fn document_mut(&mut self, is_beside: bool) -> Option<&mut Document> {
		if is_beside {
			self.beside.as_mut()
		} else {
			self.shown.as_mut().and_then(Shown::document_mut)
		}
	}

	fn document(&self, is_beside: bool) -> Option<&Document> {
		if is_beside { self.beside.as_ref() } else { self.shown_document() }
	}

	pub fn field_mut(&mut self, is_beside: bool, block: &str, row: usize) -> &mut TextEdit {
		let document = if is_beside {
			self.beside.as_mut()
		} else {
			self.shown.as_mut().and_then(Shown::document_mut)
		};
		match document.and_then(|document| document.field_mut(block, row)) {
			Some(edit) => edit,
			None => &mut self.spare,
		}
	}

	pub fn title_mut(&mut self) -> &mut TextEdit {
		match self.shown.as_mut().and_then(Shown::document_mut) {
			Some(document) => &mut document.title,
			None => &mut self.spare,
		}
	}

	pub fn query_mut(&mut self) -> &mut TextEdit {
		&mut self.query
	}

	pub fn stop_all(&mut self, is_beside: bool) {
		let Some(target) = self.document(is_beside).map(|document| document.target.clone()) else {
			return;
		};
		self.queue(Call::Stop(target));
		self.flush();
	}

	fn shown_document(&self) -> Option<&Document> {
		match self.shown.as_ref() {
			Some(Shown::Document(document)) => Some(document.as_ref()),
			Some(Shown::Image(_)) | None => None,
		}
	}

	pub fn open_beside(&mut self, name: &str) {
		if self.beside.as_ref().is_some_and(|document| document.target.name == name) {
			return;
		}
		let Some(target) = self.target_of(name) else { return };
		self.close_beside();
		self.queue(Call::Open(target.clone()));
		self.beside = Some(Document::new(target));
		self.flush();
	}

	pub fn handle_panel(&mut self, event: DocumentPanelEvent) {
		match event {
			DocumentPanelEvent::Close => self.close_beside(),
			DocumentPanelEvent::OpenInLibrary => {
				let Some(document) = self.beside.take() else { return };
				self.close_shown();
				self.shown = Some(Shown::Document(Box::new(document)));
				self.wants_library = true;
				self.list();
			}
			DocumentPanelEvent::Resize(width) => self.dragged_panel(width),
		}
	}

	pub fn panel_width(&self, room: f32) -> f32 {
		let widest = panel_max_width(room);
		self.kept_width.map_or(widest.min(DOCUMENT_PANEL_OPENING_WIDTH), |width| {
			width.clamp(DOCUMENT_PANEL_MIN_WIDTH, widest)
		})
	}

	pub fn dragged_panel(&mut self, width: f32) {
		self.kept_width = Some(width.max(DOCUMENT_PANEL_MIN_WIDTH));
	}

	pub fn dropped(&mut self, paths: &[PathBuf]) {
		let Some(space_id) = self.space_id.clone() else { return };
		let Screened { admitted, refused } =
			imports::screened(imports::sized(paths), imports::limit_of(self.is_joined));
		if !refused.is_empty() {
			self.raise_refused_imports(&refused);
		}
		if admitted.is_empty() {
			return;
		}
		self.importing.extend(admitted.iter().map(|path| imports::file_name_of(path)));
		self.queue(Call::Import { space_id, paths: admitted });
		self.flush();
	}

	fn raise_refused_imports(&mut self, refused: &[(String, String)]) {
		let names: Vec<&str> = refused.iter().map(|(name, _)| name.as_str()).collect();
		let lines: Vec<String> =
			refused.iter().map(|(name, reason)| format!("{name}: {reason}")).collect();
		let title = filled(common::library::failure::import::TITLE, "name", &names.join(", "));
		self.raise(title, lines.join("\n"));
	}

	fn close_shown(&mut self) {
		let Some(shown) = self.shown.take() else { return };
		self.slash = self.slash.take().filter(|slash| slash.is_beside);
		self.link = self.link.take().filter(|link| link.is_beside);
		self.block_menu = self.block_menu.take().filter(|menu| menu.is_beside);
		if let Shown::Document(document) = shown {
			self.leave(*document);
		}
	}

	fn close_beside(&mut self) {
		self.slash = self.slash.take().filter(|slash| !slash.is_beside);
		self.link = self.link.take().filter(|link| !link.is_beside);
		self.block_menu = self.block_menu.take().filter(|menu| !menu.is_beside);
		if let Some(document) = self.beside.take() {
			self.leave(document);
		}
	}

	fn leave(&mut self, mut document: Document) {
		if let Some(update) = document.flushed() {
			self.queue(Call::Apply { target: document.target.clone(), update });
		}
		self.queue(Call::Share { target: document.target, at: None });
		self.flush();
	}

	fn documents_of(&mut self, space_id: &str, name: &str) -> Vec<&mut Document> {
		let shown = self.shown.as_mut().and_then(Shown::document_mut);
		shown
			.into_iter()
			.chain(self.beside.as_mut())
			.filter(|document| document.target.space_id == space_id && document.target.name == name)
			.collect()
	}

	pub fn heard(&mut self, heard: Heard, now: i64) {
		match heard {
			Heard::Changed(changed) => {
				if self.space_id.as_deref() == Some(changed.space_id.as_str())
					&& !matches!(self.listing, Listing::Idle)
				{
					self.list();
				}
			}
			Heard::Updated(updated) => {
				let mut refused = Vec::new();
				let mut pending = Vec::new();
				for document in self.documents_of(&updated.space_id, &updated.name) {
					match document.heard_update(updated.update.clone()) {
						Ok(Some(update)) => pending.push((document.target.clone(), update)),
						Ok(None) => {}
						Err(failure) => refused.push((document.target.clone(), failure)),
					}
				}
				for (target, update) in pending {
					self.queue(Call::Apply { target, update });
				}
				for (target, failure) in refused {
					self.raise(said(common::library::failure::document::OPEN), failure);
					self.queue(Call::Open(target));
				}
				self.flush();
			}
			Heard::Renamed(renamed) => {
				for document in self.documents_of(&renamed.space_id, &renamed.former_name) {
					document.moved_to(renamed.name.clone());
				}
				if self.awaiting_tab.as_deref() == Some(renamed.former_name.as_str()) {
					self.awaiting_tab = Some(renamed.name.clone());
				}
				if self.space_id.as_deref() == Some(renamed.space_id.as_str()) {
					self.list();
				}
			}
			Heard::Presence(presence) => {
				for document in self.documents_of(&presence.space_id, &presence.name) {
					document.writers_heard(presence.writers.clone(), now);
				}
			}
			Heard::Finished(finished) => {
				let documents = self.documents_of(&finished.space_id, &finished.name);
				let is_open = !documents.is_empty();
				for document in documents {
					document.writer_finished(&finished.agent_id);
				}
				if is_open && finished.outcome == LibraryWriteOutcome::Failed {
					let title = filled(
						common::library::failure::document::WRITE,
						"name",
						&finished.agent_name,
					);
					self.raise(title, String::new());
				}
			}
		}
	}

	pub fn key_pressed(&mut self, event: &KeyEvent) -> bool {
		use rune::Key as KeyName;
		if event.key == KeyName::Escape
			&& (self.menu.take().is_some() || self.block_menu.take().is_some())
		{
			return true;
		}
		if self.dialog.is_some() && event.key == KeyName::Escape {
			self.dialog = None;
			return true;
		}
		if !matches!(self.shown, Some(Shown::Image(_))) {
			return false;
		}
		let lightbox_event = match event.key {
			KeyName::Escape => LightboxEvent::Item(ItemEvent::Close),
			KeyName::Left => LightboxEvent::Previous,
			KeyName::Right => LightboxEvent::Next,
			_ => return false,
		};
		self.handle_lightbox(lightbox_event);
		true
	}

	fn raise(&mut self, title: String, description: String) {
		let notice = match description.is_empty() {
			true => Notice::error(title),
			false => Notice::failure(title, description),
		};
		let notice = match self.space_id.clone() {
			Some(space_id) => notice.of_space(space_id),
			None => notice,
		};
		self.to_raise.push(notice);
	}

	pub fn take_library_wish(&mut self) -> bool {
		std::mem::take(&mut self.wants_library)
	}

	fn take_answers(&mut self, decode: &dyn Fn(&[u8]) -> Option<Image>) -> bool {
		let answers = self.worker.as_ref().map(Worker::answers).unwrap_or_default();
		let changed = !answers.is_empty();
		for answer in answers {
			self.answered(answer, decode);
		}
		self.flush();
		changed
	}

	fn answered(&mut self, answer: Answer, decode: &dyn Fn(&[u8]) -> Option<Image>) {
		match answer {
			Answer::Listed { space_id, items } => self.listed_answer(&space_id, items),
			Answer::Thumbnail { target, image } => {
				let preview = decoded_image(image, decode).map_or(Preview::Failed, Preview::Image);
				self.previews.insert(target.name, preview);
			}
			Answer::Excerpt { target, document } => {
				let preview = document.map_or(Preview::Failed, |document| {
					Preview::Excerpt(excerpt_of(&document.content))
				});
				self.previews.insert(target.name, preview);
			}
			Answer::Image { target, image } => self.image_read(&target, image, decode),
			Answer::Opened { target, state } => self.opened(&target, state),
			Answer::Applied { target, outcome: Err(failure) } => {
				if self.documents_of(&target.space_id, &target.name).is_empty() {
					return;
				}
				self.raise(said(common::library::failure::document::SAVE), failure_text(&failure));
				self.queue(Call::Open(target));
			}
			Answer::Applied { outcome: Ok(()), .. } => {}
			Answer::Created { space_id, item } => self.created(&space_id, item),
			Answer::Renamed { target, item } => self.renamed(&target, item),
			Answer::Deleted { target, outcome } => self.deleted(&target, outcome),
			Answer::Imported { space_id, paths, imports } => {
				self.imported(&space_id, &paths, imports)
			}
			Answer::Shared(outcome) => {
				if let Err(failure) = outcome {
					eprintln!("the library presence was not cleared: {}", failure_text(&failure));
				}
			}
			Answer::Stopped(outcome) => {
				let failure = match outcome {
					Ok(CancelOutcome::Failed { failures }) => Some(format!("{failures:?}")),
					Ok(CancelOutcome::Cancelled | CancelOutcome::NothingToCancel) => None,
					Err(failure) => Some(failure_text(&failure)),
				};
				if let Some(failure) = failure {
					self.raise(said(common::library::failure::document::STOP_ALL), failure);
				}
			}
			Answer::Downloaded(outcome) => self.downloaded(outcome),
			Answer::Copied { target, outcome } => self.copied_answer(&target, outcome),
			Answer::Revealed(outcome) => self.revealed(outcome),
			Answer::SavedToLibrary { target, item } => self.saved_to_library(&target, item),
			Answer::GalleryImported { target, add, path, imports } => {
				self.gallery_imported(&target, add, &path, imports)
			}
			Answer::BoardCreated { space_id, item } => self.board_created(&space_id, item),
			Answer::Due(Due::Flush) => self.flush_due(),
			Answer::Due(Due::Copied) => self.copied = None,
		}
	}

	fn listed_answer(&mut self, space_id: &str, items: Result<Vec<LibraryItem>, HostError>) {
		if self.space_id.as_deref() != Some(space_id) {
			return;
		}
		let items = match items {
			Ok(items) => items,
			Err(failure) => {
				if matches!(self.listing, Listing::Loaded(_)) {
					self.raise(said(common::library::failure::LIST), failure_text(&failure));
				} else {
					self.listing = Listing::Failed;
				}
				self.awaiting_tab = None;
				return;
			}
		};
		let items: Vec<LibraryItem> = items.into_iter().filter(is_shown_kind).collect();
		self.importing.retain(|name| !items.iter().any(|item| item.name == *name));
		self.listing = Listing::Loaded(items);
		self.read_previews();
		self.open_awaited_tab();
	}

	fn read_previews(&mut self) {
		let unread: Vec<(LibraryItemKind, String)> = self
			.items()
			.iter()
			.filter(|item| !self.previews.contains_key(&item.name))
			.map(|item| (item.kind, item.name.clone()))
			.collect();
		for (kind, name) in unread {
			let Some(target) = self.target_of(&name) else { return };
			self.previews.insert(name, Preview::Reading);
			match kind {
				LibraryItemKind::Image => self.queue(Call::Thumbnail(target)),
				LibraryItemKind::Document => self.queue(Call::Excerpt(target)),
				LibraryItemKind::Board => {}
			}
		}
	}

	fn open_awaited_tab(&mut self) {
		let Some(name) = self.awaiting_tab.take() else { return };
		if self.listed(&name).is_none() {
			use common::library::tab::unavailable::missing;
			return self.raise(said(missing::TITLE), said(missing::BODY));
		}
		self.open(&name);
		self.wants_library = true;
	}

	fn image_read(
		&mut self,
		target: &Target,
		image: Result<LibraryImage, HostError>,
		decode: &dyn Fn(&[u8]) -> Option<Image>,
	) {
		let Some(Shown::Image(lightbox)) = self.shown.as_mut() else { return };
		if lightbox.name != target.name {
			return;
		}
		match image {
			Ok(image) => {
				match BASE64_STANDARD.decode(&image.content).ok().and_then(|bytes| decode(&bytes)) {
					Some(decoded) => lightbox.image = Some(decoded),
					None => self.raise(said(common::library::failure::IMAGE), image.name),
				}
			}
			Err(failure) => {
				self.raise(said(common::library::failure::IMAGE), failure_text(&failure))
			}
		}
	}

	fn opened(
		&mut self,
		target: &Target,
		state: Result<kiroshi_core::library::contract::LibraryDocumentState, HostError>,
	) {
		let state = state.map(|state| state.update).map_err(|failure| failure_text(&failure));
		let mut failures = Vec::new();
		for document in self.documents_of(&target.space_id, &target.name) {
			if let Err(failure) = document.opened(state.clone()) {
				failures.push(failure);
			}
		}
		for failure in failures {
			self.raise(said(common::library::failure::document::OPEN), failure);
		}
	}

	fn created(&mut self, space_id: &str, item: Result<LibraryItem, HostError>) {
		self.is_creating = false;
		let item = match item {
			Ok(item) => item,
			Err(failure) => {
				return self.raise(
					said(common::library::failure::document::CREATE),
					failure_text(&failure),
				);
			}
		};
		self.dialog = None;
		let Some(target) =
			self.target_of(&item.name).filter(|_| self.space_id.as_deref() == Some(space_id))
		else {
			return;
		};
		self.show_document(target);
		self.list();
	}

	fn renamed(&mut self, target: &Target, item: Result<LibraryItem, HostError>) {
		let outcome = item.map(|item| item.name).map_err(|failure| failure_text(&failure));
		let mut was_refused = None;
		for document in self.documents_of(&target.space_id, &target.name) {
			match &outcome {
				Ok(name) => document.moved_to(name.clone()),
				Err(failure) => {
					document.restore_title();
					was_refused = Some(failure.clone());
				}
			}
		}
		if let Some(failure) = was_refused {
			self.raise(said(common::library::failure::document::SAVE), failure);
		}
		self.list();
	}

	fn deleted(&mut self, target: &Target, outcome: Result<(), HostError>) {
		if let Err(failure) = outcome {
			if let Some(Dialog::Delete { has_failed, .. }) = self.dialog.as_mut() {
				*has_failed = true;
			}
			return self.raise(said(common::library::failure::DELETE), failure_text(&failure));
		}
		self.dialog = None;
		if self.shown.as_ref().is_some_and(|shown| shown.name() == target.name) {
			self.close_shown();
		}
		if self.beside.as_ref().is_some_and(|document| document.target.name == target.name) {
			self.close_beside();
		}
		self.previews.remove(&target.name);
		self.list();
	}

	fn imported(
		&mut self,
		space_id: &str,
		paths: &[PathBuf],
		imports: Result<Vec<LibraryImport>, HostError>,
	) {
		let names: Vec<String> = paths.iter().map(|path| imports::file_name_of(path)).collect();
		self.importing.retain(|name| !names.contains(name));
		let refused = imports::refusals_of(&names, imports);
		if !refused.is_empty() {
			self.raise_refused_imports(&refused);
		}
		if self.space_id.as_deref() == Some(space_id) {
			self.list();
		}
	}

	fn queue(&mut self, call: Call) {
		self.queued.push(call);
	}

	fn flush(&mut self) {
		if self.worker.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.worker = Worker::spawn(source.clone(), waker.clone());
		}
		let Some(worker) = self.worker.as_ref() else { return };
		for call in self.queued.drain(..) {
			worker.send(call);
		}
	}
}

fn decoded_image(
	image: Result<LibraryImage, HostError>,
	decode: &dyn Fn(&[u8]) -> Option<Image>,
) -> Option<Image> {
	let image = image.ok()?;
	let bytes = BASE64_STANDARD.decode(image.content).ok()?;
	decode(&bytes)
}

fn matches_query(item: &LibraryItem, query: &str) -> bool {
	item.name.to_lowercase().contains(&query.trim().to_lowercase())
}

fn entered(app: &mut App) -> bool {
	let Some(ready) = app.ready() else { return false };
	let (source, space_id) = (ready.source.clone(), ready.space.id.clone());
	let library = &mut app.surfaces.s14_library;
	library.use_source(source);
	library.enter_space(&space_id, false);
	true
}

fn raise_all(app: &mut App) {
	let to_raise = std::mem::take(&mut app.surfaces.s14_library.to_raise);
	app.raise_all(to_raise);
}

pub fn open_beside(app: &mut App, name: &str) {
	if entered(app) {
		app.surfaces.s14_library.open_beside(name);
	}
}

pub fn heard(app: &mut App, heard: Heard) {
	app.surfaces.s14_library.heard(heard, now_ms());
	raise_all(app);
}

pub fn key_pressed(app: &mut App, event: &KeyEvent) -> bool {
	app.navigation.main_route() == Route::Library && app.surfaces.s14_library.key_pressed(event)
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	let is_library = app.navigation.main_route() == Route::Library;
	if is_library && entered(app) {
		app.surfaces.s14_library.show_library();
	}
	let library = &mut app.surfaces.s14_library;
	let images = library.images.take();
	let has_answers =
		library.take_answers(&|bytes| images.as_ref().map(|cache| cache.load(bytes.to_vec())));
	library.images = images;
	let wants_library = app.surfaces.s14_library.take_library_wish();
	if wants_library {
		app.navigation.navigate_main(Route::Library);
	}
	let has_effects = actions::perform(app, tx);
	let has_notices = !app.surfaces.s14_library.to_raise.is_empty();
	raise_all(app);
	has_answers || wants_library || has_effects || has_notices
}
