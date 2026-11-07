use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tokio::time::Instant;
use yrs::updates::decoder::Decode;
use yrs::StickyIndex;

use super::canvas::a_board;
use super::contract::{
	LibraryDocumentPresence, LibraryError, LibraryPresenceAt, LibraryWriter, LibraryWriterKind,
};
use super::{a_document, decoded_content, undecodable};
use crate::core_context::{ClientId, ClientScoped, Core, Managed};
use crate::db::repositories::messages::AccountAuthor;
use crate::events;

type Key = (String, String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Seat {
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

#[derive(Debug)]
pub struct Identity {
	pub name: Option<String>,
	pub hue: Option<u16>,
}

impl Identity {
	pub fn of_person(author: AccountAuthor, seat: &Seat) -> Self {
		let hue = hue_of(author.account_id.as_deref().unwrap_or(seat.id()));
		Identity { name: author.name, hue: Some(hue) }
	}
}

const FNV_OFFSET_BASIS: u32 = 0x811c_9dc5;

const FNV_PRIME: u32 = 0x0100_0193;

pub fn hue_of(key: &str) -> u16 {
	let hash = key
		.bytes()
		.fold(FNV_OFFSET_BASIS, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(FNV_PRIME));
	(hash % 360) as u16
}

pub struct Seated {
	pub seat: Seat,
	pub name: Option<String>,
	pub hue: Option<u16>,
	pub at: LibraryPresenceAt,
	pub lease_ends_at: Option<Instant>,
}

pub enum Lease {
	Gone,
	RunsUntil(Instant),
	Lapsed(LibraryDocumentPresence),
}

#[derive(Default)]
pub struct Presences {
	seats: Mutex<HashMap<Key, Vec<Seated>>>,
	trailing: Mutex<HashSet<Key>>,
}

impl Presences {
	pub fn seated(
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

	pub fn left(&self, space_id: &str, name: &str, seat: &Seat) -> Option<LibraryDocumentPresence> {
		unseated(&mut self.held(), &(space_id.to_owned(), name.to_owned()), seat)
	}

	pub fn window_closed(&self, client: &ClientId) -> Vec<LibraryDocumentPresence> {
		let seat = Seat::Window(client.as_str().to_owned());
		let mut held = self.held();
		let keys: Vec<Key> = held.keys().cloned().collect();
		keys.iter().filter_map(|key| unseated(&mut held, key, &seat)).collect()
	}

	pub fn identity_of(&self, space_id: &str, name: &str, seat: &Seat) -> Option<Identity> {
		self.held()
			.get(&(space_id.to_owned(), name.to_owned()))?
			.iter()
			.find(|held| held.seat == *seat)
			.map(|held| Identity { name: held.name.clone(), hue: held.hue })
	}

	pub fn lease(&self, space_id: &str, name: &str, seat: &Seat, now: Instant) -> Lease {
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

pub const AGENT_BOARD_LEASE: Duration = Duration::from_secs(5);

const BOARD_PRESENCE_PACE: Duration = Duration::from_millis(50);

const MAX_NODE_ID_BYTES: usize = 256;

pub fn share_presence(
	core: &crate::core_context::Core,
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
	let seated = Seated { seat, name: identity.name, hue: identity.hue, at, lease_ends_at };
	if lease_ends_at.is_some() {
		seat_leased(core, space_id, name, seated);
	} else {
		seat_writer(core, space_id, name, seated);
	}
	Ok(())
}

pub fn seat_agent_on_board(
	core: &crate::core_context::Core,
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
	seat_leased(core, space_id, name, seated);
}

fn seat_leased(core: &crate::core_context::Core, space_id: &str, name: &str, seated: Seated) {
	let seat = seated.seat.clone();
	if seat_writer(core, space_id, name, seated) {
		tokio::spawn(lapsing(core.clone(), space_id.to_owned(), name.to_owned(), seat));
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

pub fn seated_identity(
	core: &crate::core_context::Core,
	space_id: &str,
	name: &str,
	seat: &Seat,
) -> Option<Identity> {
	presences(core).identity_of(space_id, name, seat)
}

pub fn seat_writer(
	core: &crate::core_context::Core,
	space_id: &str,
	name: &str,
	seated: Seated,
) -> bool {
	let is_paced = matches!(seated.at, LibraryPresenceAt::Board { .. });
	let presences = presences(core);
	let (presence, is_new) = presences.seated(space_id, name, seated);
	if !is_paced {
		published(core, presence);
	} else if presences.is_first_to_trail(space_id, name) {
		tokio::spawn(trailing(core.clone(), space_id.to_owned(), name.to_owned()));
	}
	is_new
}

pub fn unseat_writer(core: &crate::core_context::Core, space_id: &str, name: &str, seat: &Seat) {
	if let Some(presence) = presences(core).left(space_id, name, seat) {
		published(core, presence);
	}
}

async fn lapsing(core: crate::core_context::Core, space_id: String, name: String, seat: Seat) {
	loop {
		match presences(&core).lease(&space_id, &name, &seat, Instant::now()) {
			Lease::Gone => return,
			Lease::RunsUntil(ends_at) => tokio::time::sleep_until(ends_at).await,
			Lease::Lapsed(presence) => return published(&core, presence),
		}
	}
}

async fn trailing(core: crate::core_context::Core, space_id: String, name: String) {
	tokio::time::sleep(BOARD_PRESENCE_PACE).await;
	published(&core, presences(&core).trailed(&space_id, &name));
}

impl ClientScoped for Presences {
	fn forget_client(&self, core: &Core, client: &ClientId) {
		for presence in self.window_closed(client) {
			published_in(core, presence);
		}
	}
}

fn published(core: &crate::core_context::Core, presence: LibraryDocumentPresence) {
	published_in(core, presence);
}

fn published_in(core: &Core, presence: LibraryDocumentPresence) {
	let space_id = presence.space_id.clone();
	if let Err(error) = core.emit(events::LIBRARY_DOCUMENT_PRESENCE, presence) {
		log::warn!(
			"the writers of a library document of space {space_id} were not published: {error}"
		);
	}
}

fn presences(core: &crate::core_context::Core) -> Managed<'_, Presences> {
	if core.try_state::<Presences>().is_none() {
		core.manage_client_scoped(Presences::default());
	}
	core.state::<Presences>()
}
