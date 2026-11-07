mod heard;
mod intents;
mod presence;
mod projection;
mod session;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::board::BoardEdit;
use kiroshi_core::library::contract::{
	LibraryBoardSummary, LibraryDocumentState, LibraryImport, LibraryItem, LibraryItemKind,
	LibraryWriter,
};
use kiroshi_core::library::link_preview::contract::LibraryLinkPreview;
use rune::{KeyEvent, TextEdit, Waker};

use kiroshi_rune_kit::primitives::toast::ToastType;
use kiroshi_rune_kit::strings::{Key as Copy, Language, common};
use kiroshi_rune_kit::surfaces::s15_boards::canvas::opening_margin;
use kiroshi_rune_kit::surfaces::s15_boards::model::{
	Event, Frame, Object, Point, Size, Tool, Viewport,
};
use kiroshi_rune_kit::surfaces::s15_boards::viewport::opening_viewport;

use crate::app::App;
use crate::host::HostError;
use crate::navigation::Route;
use crate::source::Source;

pub use heard::{Heard, heard_of};
pub use view::{CANVAS, card, view};

use intents::LibraryObject;
use presence::{PointerShare, Share};
use session::Session;
use worker::{Answer, Call, Target, Worker};

const BOARD_EXTENSION: &str = ".canvas";

const WINDOW_SEAT: &str = "main";

const IMPORTED_OBJECT_STEP: f64 = 260.0;

const WEB_SCHEMES: [&str; 2] = ["http://", "https://"];

#[derive(Clone, Debug, PartialEq)]
struct Notice {
	kind: ToastType,
	title: String,
	description: String,
}

enum Phase {
	Opening,
	Failed,
	Open(Session),
}

struct Open {
	target: Target,
	author: String,
	phase: Phase,
	viewport: Option<Viewport>,
	frame: Frame,
	tool: Tool,
	writers: Vec<LibraryWriter>,
	shelf: Vec<LibraryItem>,
	notice: Option<Notice>,
	pointer: PointerShare,
	heard_early: Vec<String>,
	is_reloading: bool,
}

enum Summary {
	Loading,
	Failed,
	Loaded(LibraryBoardSummary),
}

#[derive(Default)]
pub struct State {
	board: Option<Open>,
	edit: TextEdit,
	summaries: HashMap<String, Summary>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

pub fn title_of(name: &str) -> &str {
	let cut = name.len().saturating_sub(BOARD_EXTENSION.len());
	match name.get(cut..) {
		Some(extension) if cut > 0 && extension.eq_ignore_ascii_case(BOARD_EXTENSION) => {
			&name[..cut]
		}
		_ => name,
	}
}

fn said(key: Copy) -> String {
	key.text(Language::En).to_owned()
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn error_notice(title: String, description: String) -> Notice {
	Notice { kind: ToastType::Error, title, description }
}

fn is_web_link(text: &str) -> bool {
	WEB_SCHEMES.iter().any(|scheme| {
		text.get(..scheme.len()).is_some_and(|head| head.eq_ignore_ascii_case(scheme))
			&& text.len() > scheme.len()
			&& !text.contains(char::is_whitespace)
	})
}

fn file_name_of(path: &Path) -> String {
	path.file_name()
		.map_or_else(|| path.display().to_string(), |name| name.to_string_lossy().into_owned())
}

fn beside(at: Point, index: usize) -> Point {
	Point::new(at.x + index as f64 * IMPORTED_OBJECT_STEP, at.y)
}

fn object_of(item: &LibraryItem) -> LibraryObject {
	match item.kind {
		LibraryItemKind::Image => LibraryObject::Image { item: item.name.clone() },
		LibraryItemKind::Document | LibraryItemKind::Board => {
			LibraryObject::LibraryCard { item: item.name.clone() }
		}
	}
}

fn new_id() -> String {
	uuid::Uuid::new_v4().to_string()
}

impl Open {
	fn new(target: Target, author: String) -> Open {
		Open {
			target,
			author,
			phase: Phase::Opening,
			viewport: None,
			frame: Frame::default(),
			tool: Tool::default(),
			writers: Vec::new(),
			shelf: Vec::new(),
			notice: None,
			pointer: PointerShare::default(),
			heard_early: Vec::new(),
			is_reloading: false,
		}
	}

	fn opened_session(&self) -> Option<&Session> {
		match &self.phase {
			Phase::Open(session) => Some(session),
			Phase::Opening | Phase::Failed => None,
		}
	}

	fn viewport_in(&self, objects: &[Object], area: Size) -> Viewport {
		self.viewport.unwrap_or_else(|| opening_viewport(objects, area, opening_margin()))
	}

	fn session(&mut self) -> Option<&mut Session> {
		match &mut self.phase {
			Phase::Open(session) => Some(session),
			Phase::Opening | Phase::Failed => None,
		}
	}

	fn raise_refused(&mut self, was_refused: bool, is_refused: bool) {
		if is_refused && !was_refused {
			self.notice =
				Some(error_notice(said(common::library::failure::board::REFUSED), String::new()));
		}
	}

	fn received(&mut self, update: &str) {
		let Some(session) = self.session() else { return };
		let was_refused = session.refusal().is_some();
		let received = session.received(update);
		let is_refused = received.is_err() || session.refusal().is_some();
		self.raise_refused(was_refused, is_refused);
	}

	fn applied(&mut self, edit: impl FnOnce(&mut Session) -> Option<String>) -> Option<Call> {
		let session = self.session()?;
		let was_refused = session.refusal().is_some();
		let update = edit(session)?;
		let is_refused = session.refusal().is_some();
		self.raise_refused(was_refused, is_refused);
		Some(Call::Apply { target: self.target.clone(), update })
	}

	fn edited(&mut self, edit: impl FnOnce(&session::Held) -> Option<BoardEdit>) -> Option<Call> {
		self.applied(|session| {
			let change = edit(session.held())?;
			Some(session.edited(&change))
		})
	}

	fn shared(&self, share: Share) -> Option<Call> {
		match share {
			Share::Now(at) => Some(Call::Share { target: self.target.clone(), at }),
			Share::After(after) => Some(Call::Wake(after)),
			Share::Nothing => None,
		}
	}

	fn pasted(&mut self, text: &str, at: Point) -> Vec<Call> {
		if !is_web_link(text) {
			return Vec::new();
		}
		let id = new_id();
		let object = LibraryObject::LinkCard { url: text.to_owned() };
		let Some(placed) =
			self.edited(|held| Some(intents::library_placed(held, &id, &object, at)))
		else {
			return Vec::new();
		};
		self.frame.selected = Some(id.clone());
		vec![placed, Call::Preview { id, url: text.to_owned() }]
	}

	fn heard_update(&mut self, update: String) {
		match self.phase {
			Phase::Opening => self.heard_early.push(update),
			Phase::Open(_) => {
				self.received(&update);
				if self.is_reloading {
					self.heard_early.push(update);
				}
			}
			Phase::Failed => {}
		}
	}

	fn reload(&mut self) -> Call {
		self.is_reloading = true;
		Call::Open(self.target.clone())
	}

	fn opened(&mut self, state: Result<LibraryDocumentState, HostError>) {
		let opened = state
			.map_err(|failure| failure_text(&failure))
			.and_then(|state| Session::opened(&state.update));
		match opened {
			Ok(mut session) => {
				let early = std::mem::take(&mut self.heard_early);
				self.is_reloading = false;
				let caught_up = early.iter().try_for_each(|update| session.received(update));
				self.phase = Phase::Open(session);
				self.raise_refused(false, caught_up.is_err());
			}
			Err(failure) => {
				self.notice =
					Some(error_notice(said(common::library::failure::board::OPEN), failure));
				self.phase = Phase::Failed;
			}
		}
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
	}

	pub fn open(&mut self, space_id: &str, name: &str, author: &str) {
		self.leave();
		let target = Target { space_id: space_id.to_owned(), name: name.to_owned() };
		self.queued.push(Call::Open(target.clone()));
		self.queued.push(Call::List { space_id: space_id.to_owned() });
		self.board = Some(Open::new(target, author.to_owned()));
		self.flush();
	}

	pub fn leave(&mut self) {
		let Some(mut open) = self.board.take() else { return };
		let cleared = open.pointer.closed();
		self.queue(open.shared(cleared));
		self.flush();
	}

	pub fn summarise(&mut self, space_id: &str, name: &str) {
		if self.summaries.contains_key(name) {
			return;
		}
		self.summaries.insert(name.to_owned(), Summary::Loading);
		let target = Target { space_id: space_id.to_owned(), name: name.to_owned() };
		self.queued.push(Call::Summarise(target));
		self.flush();
	}

	pub fn stop_drawers(&mut self) {
		let Some(open) = self.board.as_ref() else { return };
		self.queued.push(Call::Stop(open.target.clone()));
		self.flush();
	}

	pub fn poll(&mut self) -> bool {
		let answers = self.worker.as_ref().map(Worker::answers).unwrap_or_default();
		let is_changed = !answers.is_empty();
		for answer in answers {
			self.answered(answer, Instant::now());
		}
		is_changed
	}

	pub fn heard(&mut self, heard: Heard) {
		match heard {
			Heard::Updated(updated) => {
				let Some(open) = self.board_of(&updated.space_id, &updated.name) else { return };
				open.heard_update(updated.update);
			}
			Heard::Presence(presence) => {
				let Some(open) = self.board_of(&presence.space_id, &presence.name) else { return };
				open.writers = presence
					.writers
					.into_iter()
					.filter(|writer| !presence::is_own_seat(writer))
					.collect();
			}
			Heard::Replaced(replaced) => {
				let Some(open) =
					self.board.as_mut().filter(|open| open.target.space_id == replaced.space_id)
				else {
					return;
				};
				let title = said(common::library::BOARD_FILE_REPLACED)
					.replace("{{name}}", title_of(&replaced.name));
				open.notice =
					Some(Notice { kind: ToastType::Info, title, description: String::new() });
			}
			Heard::Renamed(renamed) => {
				if let Some(summary) = self.summaries.remove(&renamed.former_name) {
					self.summaries.insert(renamed.name.clone(), summary);
				}
				let Some(open) = self.board_of(&renamed.space_id, &renamed.former_name) else {
					return;
				};
				open.target.name = renamed.name;
			}
		}
	}

	pub fn handle(&mut self, event: Event, now: Instant) {
		let Some(open) = self.board.as_mut() else { return };
		let call = match event {
			Event::Frame(next) => {
				let is_newly_edited = next.editing.as_ref().is_some_and(|editing| {
					open.frame.editing.as_ref().is_none_or(|held| held.id != editing.id)
				});
				if let Some(editing) = next.editing.as_ref().filter(|_| is_newly_edited) {
					self.edit = TextEdit::new(&editing.text);
				}
				let share = open.pointer.selected(next.selected.clone(), now);
				open.frame = *next;
				open.shared(share)
			}
			Event::Viewport(viewport) => {
				open.viewport = Some(viewport);
				None
			}
			Event::Tool(tool) => {
				open.tool = tool;
				None
			}
			Event::Place { tool, rect } => {
				let author = open.author.clone();
				open.edited(|held| intents::placed(held, &new_id(), tool, rect, &author))
			}
			Event::Move { id, position } => open.edited(|held| intents::moved(held, &id, position)),
			Event::Resize { id, rect } => open.edited(|held| intents::resized(held, &id, rect)),
			Event::EditText { id, text } => open.edited(|held| intents::retexted(held, &id, &text)),
			Event::Style { id, style } => open.edited(|held| intents::restyled(held, &id, style)),
			Event::SetArrow(arrow) => open.edited(|held| intents::arrow_set(held, &arrow)),
			Event::Delete(id) => open.edited(|held| intents::deleted(held, &id)),
			Event::Paste { text, at } => {
				self.queued.extend(open.pasted(text.trim(), at));
				None
			}
			Event::DropFiles { paths, at } => {
				Some(Call::Import { space_id: open.target.space_id.clone(), paths, at })
			}
			Event::LibraryPick { id, at } | Event::LibraryDrop { id, at } => {
				let object = open.shelf.iter().find(|item| item.name == id).map(object_of);
				object.and_then(|object| {
					open.edited(|held| Some(intents::library_placed(held, &new_id(), &object, at)))
				})
			}
			Event::Pointer(at) => {
				let share = open.pointer.moved(at, now);
				open.shared(share)
			}
			Event::ChooseImages { .. } => None,
		};
		self.queue(call);
		self.flush();
	}

	pub fn pin_viewport(&mut self, viewport: Viewport) {
		if let Some(open) = self.board.as_mut() {
			open.viewport.get_or_insert(viewport);
		}
	}

	pub fn key_pressed(&mut self, key: &KeyEvent) -> bool {
		if !key.is_command('z') {
			return false;
		}
		let Some(open) = self.board.as_mut() else { return false };
		let call = if key.mods.shift {
			open.applied(Session::redone)
		} else {
			open.applied(Session::undone)
		};
		self.queue(call);
		self.flush();
		true
	}

	fn board_of(&mut self, space_id: &str, name: &str) -> Option<&mut Open> {
		self.board
			.as_mut()
			.filter(|open| open.target.space_id == space_id && open.target.name == name)
	}

	fn answered(&mut self, answer: Answer, now: Instant) {
		let call = match answer {
			Answer::Opened { target, state } => {
				let Some(open) = self.board_of(&target.space_id, &target.name) else { return };
				open.opened(state);
				None
			}
			Answer::Applied { target, outcome: Err(failure) } => {
				let Some(open) = self.board_of(&target.space_id, &target.name) else { return };
				open.notice = Some(error_notice(
					said(common::library::failure::board::SAVE),
					failure_text(&failure),
				));
				Some(open.reload())
			}
			Answer::Applied { outcome: Ok(()), .. } => None,
			Answer::Shared(outcome) => {
				if let Err(failure) = outcome {
					eprintln!("the board pointer was not shared: {}", failure_text(&failure));
				}
				None
			}
			Answer::Stopped(outcome) => {
				let failure = match outcome {
					Ok(CancelOutcome::Failed { failures }) => Some(format!("{failures:?}")),
					Ok(CancelOutcome::Cancelled | CancelOutcome::NothingToCancel) => None,
					Err(failure) => Some(failure_text(&failure)),
				};
				if let Some((open, failure)) = self.board.as_mut().zip(failure) {
					eprintln!("the drawers of a board were not stopped: {failure}");
					open.notice = Some(error_notice(
						said(common::library::failure::board::STOP_ALL),
						String::new(),
					));
				}
				None
			}
			Answer::Listed { space_id, items } => {
				let Some(open) =
					self.board.as_mut().filter(|open| open.target.space_id == space_id)
				else {
					return;
				};
				match items {
					Ok(items) => {
						open.shelf = items
							.into_iter()
							.filter(|item| item.name != open.target.name)
							.collect();
					}
					Err(failure) => {
						open.notice = Some(error_notice(
							said(common::library::failure::LIST),
							failure_text(&failure),
						))
					}
				}
				None
			}
			Answer::Imported { paths, at, imports } => {
				self.imported(&paths, at, imports);
				None
			}
			Answer::Previewed { id, preview } => self.previewed(&id, preview),
			Answer::Summarised { target, summary } => {
				let summary = summary.map_or(Summary::Failed, Summary::Loaded);
				self.summaries.insert(target.name, summary);
				None
			}
			Answer::Due => {
				let Some(open) = self.board.as_mut() else { return };
				let share = open.pointer.due(now);
				open.shared(share)
			}
		};
		self.queue(call);
		self.flush();
	}

	fn imported(
		&mut self,
		paths: &[PathBuf],
		at: Point,
		imports: Result<Vec<LibraryImport>, HostError>,
	) {
		let Some(open) = self.board.as_mut() else { return };
		let import_failed = |path: Option<&PathBuf>, detail: String| {
			let name = path.map(|path| file_name_of(path)).unwrap_or_default();
			let title = said(common::library::failure::import::TITLE).replace("{{name}}", &name);
			error_notice(title, detail)
		};
		let imports = match imports {
			Ok(imports) => imports,
			Err(failure) => {
				open.notice = Some(import_failed(paths.first(), failure_text(&failure)));
				return;
			}
		};
		let mut placed = 0;
		for (path, import) in paths.iter().zip(imports) {
			match import {
				LibraryImport::Imported { item } => {
					let object = object_of(&item);
					let centre = beside(at, placed);
					placed += 1;
					let call = open.edited(|held| {
						Some(intents::library_placed(held, &new_id(), &object, centre))
					});
					self.queued.extend(call);
				}
				LibraryImport::Refused { error } => {
					open.notice = Some(import_failed(Some(path), format!("{error:?}")))
				}
			}
		}
	}

	fn previewed(
		&mut self,
		id: &str,
		preview: Result<LibraryLinkPreview, HostError>,
	) -> Option<Call> {
		let preview = match preview {
			Ok(preview) => preview,
			Err(failure) => {
				eprintln!(
					"the link preview of a board card was not read: {}",
					failure_text(&failure)
				);
				return None;
			}
		};
		self.board.as_mut()?.edited(|held| intents::link_described(held, id, &preview))
	}

	fn queue(&mut self, call: Option<Call>) {
		self.queued.extend(call);
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

pub fn open_board(app: &mut App, name: &str) {
	let Some(ready) = app.ready() else { return };
	let (source, space_id) = (ready.source.clone(), ready.space.id.clone());
	app.surfaces.s15_boards.use_source(source);
	show_board(app, &space_id, name);
}

fn show_board(app: &mut App, space_id: &str, name: &str) {
	app.surfaces.s15_boards.open(space_id, name, WINDOW_SEAT);
	app.navigation.navigate_main(Route::Boards);
}

pub fn summarise(app: &mut App, name: &str) {
	let Some(ready) = app.ready() else { return };
	let (source, space_id) = (ready.source.clone(), ready.space.id.clone());
	let boards = &mut app.surfaces.s15_boards;
	boards.use_source(source);
	boards.summarise(&space_id, name);
}

pub fn leave_board(app: &mut App) {
	app.surfaces.s15_boards.leave();
	app.navigation.navigate_main(Route::Library);
}
