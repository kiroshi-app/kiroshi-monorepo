use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, Runtime, State, Webview, Window, WindowEvent};
use tokio::time::Instant;
use yrs::updates::decoder::Decode;
use yrs::StickyIndex;

use super::canvas::a_board;
use super::contract::{
	LibraryDocumentPresence, LibraryError, LibraryPresenceAt, LibraryWriter, LibraryWriterKind,
};
use super::{a_document, decoded_content, undecodable};
use crate::db::repositories::messages::AccountAuthor;
use crate::events;

type Key = (String, String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Seat {
	Window(String),
	Member(String),
	Agent(String),
}

impl Seat {
	fn id(&self) -> &str {
		match self {
			Seat::Window(label) => label,
			Seat::Member(account_id) => account_id,
			Seat::Agent(bot_id) => bot_id,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Identity {
	pub(crate) name: Option<String>,
	pub(crate) hue: Option<u16>,
}

impl Identity {
	pub(crate) fn of_person(author: AccountAuthor, seat: &Seat) -> Self {
		let hue = hue_of(author.account_id.as_deref().unwrap_or(seat.id()));
		Identity { name: author.name, hue: Some(hue) }
	}
}

const FNV_OFFSET_BASIS: u32 = 0x811c_9dc5;

const FNV_PRIME: u32 = 0x0100_0193;

pub(crate) fn hue_of(key: &str) -> u16 {
	let hash = key
		.bytes()
		.fold(FNV_OFFSET_BASIS, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(FNV_PRIME));
	(hash % 360) as u16
}

pub(crate) struct Seated {
	pub(crate) seat: Seat,
	pub(crate) name: Option<String>,
	pub(crate) hue: Option<u16>,
	pub(crate) at: LibraryPresenceAt,
	pub(crate) lease_ends_at: Option<Instant>,
}

pub(crate) enum Lease {
	Gone,
	RunsUntil(Instant),
	Lapsed(LibraryDocumentPresence),
}

#[derive(Default)]
pub(crate) struct Presences {
	seats: Mutex<HashMap<Key, Vec<Seated>>>,
	trailing: Mutex<HashSet<Key>>,
}

impl Presences {
	pub(crate) fn seated(
		&self,
		space_id: &str,
		name: &str,
		seated: Seated,
	) -> (LibraryDocumentPresence, bool) {
		let mut held = self.held();
		let key = (space_id.to_owned(), name.to_owned());
		let writers = held.entry(key).or_default();
		let was_there = match writers.iter_mut().find(|held| held.seat == seated.seat) {
			Some(held) => {
				*held = seated;
				true
			}
			None => {
				writers.push(seated);
				false
			}
		};
		(presence_of(space_id, name, writers), !was_there)
	}

	pub(crate) fn left(
		&self,
		space_id: &str,
		name: &str,
		seat: &Seat,
	) -> Option<LibraryDocumentPresence> {
		unseated(&mut self.held(), &(space_id.to_owned(), name.to_owned()), seat)
	}

	pub(crate) fn window_closed(&self, label: &str) -> Vec<LibraryDocumentPresence> {
		let seat = Seat::Window(label.to_owned());
		let mut held = self.held();
		let keys: Vec<Key> = held.keys().cloned().collect();
		keys.iter().filter_map(|key| unseated(&mut held, key, &seat)).collect()
	}

	pub(crate) fn identity_of(&self, space_id: &str, name: &str, seat: &Seat) -> Option<Identity> {
		self.held()
			.get(&(space_id.to_owned(), name.to_owned()))?
			.iter()
			.find(|held| held.seat == *seat)
			.map(|held| Identity { name: held.name.clone(), hue: held.hue })
	}

	pub(crate) fn lease(&self, space_id: &str, name: &str, seat: &Seat, now: Instant) -> Lease {
		let lease_ends_at = self
			.held()
			.get(&(space_id.to_owned(), name.to_owned()))
			.and_then(|writers| writers.iter().find(|held| held.seat == *seat))
			.and_then(|held| held.lease_ends_at);
		match lease_ends_at {
			None => Lease::Gone,
			Some(ends_at) if ends_at > now => Lease::RunsUntil(ends_at),
			Some(_) => self.left(space_id, name, seat).map_or(Lease::Gone, Lease::Lapsed),
		}
	}

	fn is_first_to_trail(&self, space_id: &str, name: &str) -> bool {
		self.trailing().insert((space_id.to_owned(), name.to_owned()))
	}

	fn trailed(&self, space_id: &str, name: &str) -> LibraryDocumentPresence {
		let key = (space_id.to_owned(), name.to_owned());
		self.trailing().remove(&key);
		let held = self.held();
		presence_of(space_id, name, held.get(&key).map_or(&[][..], Vec::as_slice))
	}

	fn held(&self) -> MutexGuard<'_, HashMap<Key, Vec<Seated>>> {
		self.seats.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn trailing(&self) -> MutexGuard<'_, HashSet<Key>> {
		self.trailing.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

fn unseated(
	held: &mut HashMap<Key, Vec<Seated>>,
	key: &Key,
	seat: &Seat,
) -> Option<LibraryDocumentPresence> {
	let writers = held.get_mut(key)?;
	let count = writers.len();
	writers.retain(|held| held.seat != *seat);
	if writers.len() == count {
		return None;
	}
	let presence = presence_of(&key.0, &key.1, writers);
	if writers.is_empty() {
		held.remove(key);
	}
	Some(presence)
}

fn presence_of(space_id: &str, name: &str, writers: &[Seated]) -> LibraryDocumentPresence {
	LibraryDocumentPresence {
		space_id: space_id.to_owned(),
		name: name.to_owned(),
		writers: writers.iter().map(writer_of).collect(),
	}
}

fn writer_of(seated: &Seated) -> LibraryWriter {
	let kind = match &seated.seat {
		Seat::Window(_) => LibraryWriterKind::Person,
		Seat::Member(_) => LibraryWriterKind::Member,
		Seat::Agent(_) => LibraryWriterKind::Agent,
	};
	LibraryWriter {
		id: seated.seat.id().to_owned(),
		kind,
		name: seated.name.clone(),
		hue: seated.hue,
		at: seated.at.clone(),
	}
}

const MEMBER_PRESENCE_LEASE: Duration = Duration::from_secs(30);

pub(crate) const AGENT_BOARD_LEASE: Duration = Duration::from_secs(5);

const BOARD_PRESENCE_PACE: Duration = Duration::from_millis(50);

const MAX_NODE_ID_BYTES: usize = 256;

pub(crate) fn share_presence<R: Runtime>(
	app: &AppHandle<R>,
	root: &Path,
	space_id: &str,
	name: &str,
	seat: Seat,
	identity: Identity,
	at: LibraryPresenceAt,
) -> Result<(), LibraryError> {
	placed(root, space_id, name, &at)?;
	let lease_ends_at =
		matches!(seat, Seat::Member(_)).then(|| Instant::now() + MEMBER_PRESENCE_LEASE);
	let Identity { name: writer_name, hue } = identity;
	let seated = Seated { seat, name: writer_name, hue, at, lease_ends_at };
	if lease_ends_at.is_some() {
		seat_leased(app, space_id, name, seated);
	} else {
		seat_writer(app, space_id, name, seated);
	}
	Ok(())
}

pub(crate) fn seat_agent_on_board<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	agent_id: &str,
	agent_name: &str,
	at: LibraryPresenceAt,
) {
	let seated = Seated {
		seat: Seat::Agent(agent_id.to_owned()),
		name: Some(agent_name.to_owned()),
		hue: None,
		at,
		lease_ends_at: Some(Instant::now() + AGENT_BOARD_LEASE),
	};
	seat_leased(app, space_id, name, seated);
}

fn seat_leased<R: Runtime>(app: &AppHandle<R>, space_id: &str, name: &str, seated: Seated) {
	let seat = seated.seat.clone();
	if seat_writer(app, space_id, name, seated) {
		tokio::spawn(lapsing(app.clone(), space_id.to_owned(), name.to_owned(), seat));
	}
}

fn placed(
	root: &Path,
	space_id: &str,
	name: &str,
	at: &LibraryPresenceAt,
) -> Result<(), LibraryError> {
	match at {
		LibraryPresenceAt::Text { anchor } => {
			a_document(root, space_id, name)?;
			StickyIndex::decode_v1(&decoded_content(name, anchor)?)
				.map(drop)
				.map_err(|error| undecodable(name, error.to_string()))
		}
		LibraryPresenceAt::Board { node_id, .. } => {
			a_board(root, space_id, name)?;
			match node_id {
				Some(node_id) if node_id.len() > MAX_NODE_ID_BYTES => Err(undecodable(
					name,
					format!("a node id is longer than {MAX_NODE_ID_BYTES} bytes"),
				)),
				_ => Ok(()),
			}
		}
	}
}

pub(crate) fn seated_identity<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	seat: &Seat,
) -> Option<Identity> {
	presences(app).identity_of(space_id, name, seat)
}

pub(crate) fn seat_writer<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	seated: Seated,
) -> bool {
	let is_paced = matches!(seated.at, LibraryPresenceAt::Board { .. });
	let presences = presences(app);
	let (presence, is_new) = presences.seated(space_id, name, seated);
	if !is_paced {
		published(app, presence);
	} else if presences.is_first_to_trail(space_id, name) {
		tokio::spawn(trailing(app.clone(), space_id.to_owned(), name.to_owned()));
	}
	is_new
}

pub(crate) fn unseat_writer<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	seat: &Seat,
) {
	if let Some(presence) = presences(app).left(space_id, name, seat) {
		published(app, presence);
	}
}

pub fn forget_on_destroyed<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
	if matches!(event, WindowEvent::Destroyed) {
		forget(window);
	}
}

pub fn forget_on_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
	if payload.event() == PageLoadEvent::Started {
		forget(&webview.window());
	}
}

fn forget<R: Runtime>(window: &Window<R>) {
	let Some(presences) = window.try_state::<Presences>() else {
		return;
	};
	for presence in presences.window_closed(window.label()) {
		published(window.app_handle(), presence);
	}
}

async fn lapsing<R: Runtime>(app: AppHandle<R>, space_id: String, name: String, seat: Seat) {
	loop {
		match presences(&app).lease(&space_id, &name, &seat, Instant::now()) {
			Lease::Gone => return,
			Lease::RunsUntil(ends_at) => tokio::time::sleep_until(ends_at).await,
			Lease::Lapsed(presence) => return published(&app, presence),
		}
	}
}

async fn trailing<R: Runtime>(app: AppHandle<R>, space_id: String, name: String) {
	tokio::time::sleep(BOARD_PRESENCE_PACE).await;
	published(&app, presences(&app).trailed(&space_id, &name));
}

fn published<R: Runtime>(app: &AppHandle<R>, presence: LibraryDocumentPresence) {
	let space_id = presence.space_id.clone();
	if let Err(error) = events::emit(app, events::LIBRARY_DOCUMENT_PRESENCE, presence) {
		log::warn!(
			"the writers of a library document of space {space_id} were not published: {error}"
		);
	}
}

fn presences<R: Runtime>(app: &AppHandle<R>) -> State<'_, Presences> {
	if app.try_state::<Presences>().is_none() {
		app.manage(Presences::default());
	}
	app.state::<Presences>()
}
