mod invitations;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use std::collections::HashMap;

use kiroshi_core::joined_spaces::contract::{
	self as joined_contract, JoinedSpace, JoinedSpaceError, JoinedSpaceRemovalReason,
	JoinedSpaceState,
};
use kiroshi_core::spaces::contract::{DESCRIBED_EVENT, Space};
use kiroshi_core::{hosting, invitations as invitation_contract};
use kiroshi_rune_kit::strings::{Key, Language, chat, common, settings};
use kiroshi_rune_kit::surfaces::s02_rail::{
	PickerMessage, RailMessage, RailPanel, Space as Row, SpaceHost, SpaceInvitation,
};
use kiroshi_rune_kit::surfaces::s06_composer::space_access::SpaceAccess;
use rune::Waker;
use serde::Deserialize;
use serde_json::Value;

use crate::app::notice::Notice;
use crate::app::{App, Pane, SpaceContent, Workspace};
use crate::host::HostError;
use crate::model;
use crate::navigation::Route;
use crate::source::Source;
use crate::surfaces::s06_composer::access::access_reason_of;

use invitations::{Invitations, is_signed_out};
use worker::{Answer, Call, Worker};

pub use view::view;

const LANGUAGE: Language = Language::En;

const SPACES_UNREAD: &str = "Couldn't read your Spaces. Reopen the preview to read them again.";

const JOINED_UNREAD: &str =
	"Couldn't read the Spaces you joined. Reopen the preview to read them again.";

const OPEN_REFUSED: &str = "Couldn't open {name}. Pick it again to try once more.";

const REMEMBER_REFUSED: &str =
	"Couldn't keep {name} as the Space to reopen. The preview opens the first Space next time.";

const HOSTING_ONLINE: &str = "online";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Swipe {
	Previous,
	Next,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Heard {
	Spaces,
	Joined,
	Departed { id: String, reason: JoinedSpaceRemovalReason },
	Invitations,
	Hosting,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum RemovalReason {
	Deleted,
	Removed,
	Left,
	Unknown,
}

#[derive(Deserialize)]
struct Removal {
	id: String,
	reason: RemovalReason,
}

struct Opened {
	space: model::Space,
	content: SpaceContent,
}

struct Departed {
	joined: JoinedSpace,
	reason: JoinedSpaceRemovalReason,
}

#[derive(Default)]
pub struct State {
	spaces: Option<Vec<Space>>,
	joined: Vec<JoinedSpace>,
	departed: Option<Departed>,
	online_hosting: HashMap<String, bool>,
	invitations: Invitations,
	opening: Option<String>,
	is_picker_open: bool,
	to_raise: Vec<Notice>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

pub fn opening_space<'a>(spaces: &'a [Space], last_space_id: Option<&str>) -> Option<&'a Space> {
	spaces.iter().find(|space| Some(space.id.as_str()) == last_space_id).or(spaces.first())
}

pub fn shown_space(space: &Space) -> model::Space {
	model::Space {
		id: space.id.clone(),
		name: space.name.clone(),
		colour: space.colour.map(|hue| f32::from(hue.value())),
	}
}

pub fn heard_of(event: &str, payload: &Value) -> Option<Result<Heard, serde_json::Error>> {
	let heard = match event {
		DESCRIBED_EVENT => Heard::Spaces,
		joined_contract::CHANGED_EVENT | joined_contract::RECONNECTED_EVENT => Heard::Joined,
		joined_contract::REMOVED_EVENT => return Some(departed_of(payload)),
		invitation_contract::contract::CHANGED_EVENT => Heard::Invitations,
		hosting::contract::CHANGED_EVENT => Heard::Hosting,
		_ => return None,
	};
	Some(Ok(heard))
}

fn departed_of(payload: &Value) -> Result<Heard, serde_json::Error> {
	let Removal { id, reason } = Removal::deserialize(payload)?;
	Ok(Heard::Departed { id, reason: removal_reason_of(reason) })
}

fn removal_reason_of(reason: RemovalReason) -> JoinedSpaceRemovalReason {
	match reason {
		RemovalReason::Deleted => JoinedSpaceRemovalReason::Deleted,
		RemovalReason::Removed => JoinedSpaceRemovalReason::Removed,
		RemovalReason::Left => JoinedSpaceRemovalReason::Left,
		RemovalReason::Unknown => JoinedSpaceRemovalReason::Unknown,
	}
}

fn is_waiting_for_host(failure: &HostError) -> bool {
	let HostError::CommandFailed { body, .. } = failure else { return false };
	matches!(serde_json::from_str(body), Ok(JoinedSpaceError::WaitingForHost { .. }))
}

fn said(key: Key) -> String {
	key.text(LANGUAGE).to_owned()
}

fn named(line: &str, name: &str) -> String {
	line.replace("{name}", name)
}

fn is_online(hosting: &Value) -> bool {
	hosting.get("kind").and_then(Value::as_str) == Some(HOSTING_ONLINE)
}

fn row_of(space: &Space) -> Row<'_> {
	Row {
		id: &space.id,
		name: &space.name,
		colour: space.colour.map(|hue| f32::from(hue.value())),
		avatar_seed: space.instance_id.as_deref().unwrap_or(&space.id),
	}
}

fn joined_row_of(joined: &JoinedSpace) -> Row<'_> {
	Row {
		id: &joined.id,
		name: &joined.name,
		colour: joined.colour.map(|hue| f32::from(hue.value())),
		avatar_seed: &joined.instance_id,
	}
}

fn joined_shown_space(joined: &JoinedSpace) -> model::Space {
	model::Space {
		id: joined.id.clone(),
		name: joined.name.clone(),
		colour: joined.colour.map(|hue| f32::from(hue.value())),
	}
}

fn host_name_of(joined: &JoinedSpace) -> &str {
	let hosted_by = joined.hosted_by.as_deref().filter(|name| !name.is_empty());
	hosted_by.unwrap_or(common::spaces::unnamed::HOST.text(LANGUAGE))
}

fn joined_host_of(joined: &JoinedSpace) -> SpaceHost {
	match joined.state {
		JoinedSpaceState::Online => SpaceHost::Up,
		JoinedSpaceState::WaitingForHost => SpaceHost::Down,
	}
}

fn repositioned(spaces: &[Space], ids: &[String]) -> Vec<Space> {
	ids.iter().filter_map(|id| spaces.iter().find(|space| &space.id == id).cloned()).collect()
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn read_from(&mut self, source: Source) {
		self.source = Some(source);
		self.worker = None;
		self.queued.extend([Call::ListSpaces, Call::ListJoined, Call::ListInvitations]);
		self.flush();
	}

	pub fn heard(&mut self, heard: Heard) {
		match heard {
			Heard::Spaces => self.queue(Call::ListSpaces),
			Heard::Joined => self.queue(Call::ListJoined),
			Heard::Departed { id, reason } => {
				self.depart(&id, reason);
				self.queue(Call::ListJoined);
			}
			Heard::Invitations => self.queue(Call::ListInvitations),
			Heard::Hosting => self.read_hosting(),
		}
	}

	pub fn rows(&self) -> Vec<Row<'_>> {
		let spaces = self.listed().iter().map(row_of);
		spaces.chain(self.joined.iter().map(joined_row_of)).collect()
	}

	pub fn hosts(&self) -> Vec<(&str, SpaceHost)> {
		let shared = self.listed().iter().filter(|space| space.shared).map(|space| {
			let is_up = self.online_hosting.get(&space.id).copied().unwrap_or(false);
			(space.id.as_str(), if is_up { SpaceHost::Up } else { SpaceHost::Down })
		});
		let joined = self.joined.iter().map(|joined| (joined.id.as_str(), joined_host_of(joined)));
		shared.chain(joined).collect()
	}

	pub fn invitation_rows(&self) -> Vec<SpaceInvitation<'_>> {
		self.invitations.rows(&self.joined)
	}

	pub fn selected<'a>(&'a self, shown: &'a str) -> &'a str {
		self.opening.as_deref().unwrap_or(shown)
	}

	pub fn is_opening(&self) -> bool {
		self.opening.is_some()
	}

	pub fn is_picker_open(&self) -> bool {
		self.is_picker_open
	}

	pub fn access_of(&self, shown: &str) -> Option<SpaceAccess<'_>> {
		let (joined, departure) = match &self.departed {
			Some(departed) if departed.joined.id == shown => {
				(&departed.joined, Some(departed.reason))
			}
			_ => (self.joined_space(shown)?, None),
		};
		let reason = access_reason_of(joined, departure)?;
		Some(SpaceAccess { reason, space: &joined.name, host: host_name_of(joined) })
	}

	fn open_joined(&mut self, id: &str, shown: &str) -> Option<Opened> {
		if id == self.selected(shown) {
			return None;
		}
		let space = joined_shown_space(self.joined_space(id)?);
		self.opening = None;
		self.departed = None;
		self.queue(Call::Connect(id.to_owned()));
		Some(Opened {
			space,
			content: SpaceContent { agents: Vec::new(), conversations: Vec::new() },
		})
	}

	pub fn select(&mut self, id: &str, shown: &str) {
		if id == self.selected(shown) {
			return;
		}
		if self.space(id).is_none() {
			return;
		}
		self.opening = Some(id.to_owned());
		self.queue(Call::Load(id.to_owned()));
	}

	pub fn swipe(&mut self, swipe: Swipe, shown: &str) {
		let spaces = self.listed();
		let Some(at) = spaces.iter().position(|space| space.id == self.selected(shown)) else {
			return;
		};
		let landing = match swipe {
			Swipe::Previous => at.checked_sub(1),
			Swipe::Next => Some(at + 1),
		};
		let Some(space) = landing.and_then(|index| spaces.get(index)) else { return };
		let id = space.id.clone();
		self.select(&id, shown);
	}

	pub fn create(&mut self) {
		self.queue(Call::Create(said(settings::space::UNTITLED)));
	}

	pub fn describe(&mut self, id: &str, name: &str, colour: Option<i64>) {
		self.queue(Call::Describe { id: id.to_owned(), name: name.to_owned(), colour });
	}

	pub fn reorder(&mut self, ids: Vec<String>) {
		let Some(spaces) = self.spaces.as_mut() else { return };
		if spaces.iter().map(|space| &space.id).eq(ids.iter()) {
			return;
		}
		*spaces = repositioned(spaces, &ids);
		self.queue(Call::Reorder(ids));
	}

	pub fn delete(&mut self, id: &str) {
		self.queue(Call::Delete(id.to_owned()));
	}

	pub fn set_picker_open(&mut self, is_open: bool) {
		self.is_picker_open = is_open;
		if !is_open {
			self.invitations.sweep_withdrawn(&self.joined);
		}
	}

	pub fn accept(&mut self, instance_id: &str) {
		if let Some(invitation) = self.invitations.accept(instance_id, &self.joined) {
			self.queue(Call::Accept(invitation));
		}
	}

	pub fn decline(&mut self, instance_id: &str) {
		if let Some(invitation) = self.invitations.decline(instance_id, &self.joined) {
			self.queue(Call::Decline(invitation));
		}
	}

	fn listed(&self) -> &[Space] {
		self.spaces.as_deref().unwrap_or_default()
	}

	fn space(&self, id: &str) -> Option<&Space> {
		self.listed().iter().find(|space| space.id == id)
	}

	fn joined_space(&self, id: &str) -> Option<&JoinedSpace> {
		self.joined.iter().find(|joined| joined.id == id)
	}

	fn is_departed(&self, id: &str) -> bool {
		self.departed.as_ref().is_some_and(|departed| departed.joined.id == id)
	}

	fn depart(&mut self, id: &str, reason: JoinedSpaceRemovalReason) {
		if reason == JoinedSpaceRemovalReason::Left {
			return;
		}
		let Some(joined) = self.joined_space(id).cloned() else { return };
		self.departed = Some(Departed { joined, reason });
	}

	fn connection_refused(&mut self, joined_id: &str, failure: &HostError, shown: &str) {
		if is_waiting_for_host(failure) {
			self.queue(Call::ListJoined);
			return;
		}
		if joined_id != shown {
			eprintln!(
				"{joined_id} was left before its connection was refused: {}",
				failure.detail()
			);
			return;
		}
		let name = self.joined_space(joined_id).map_or(joined_id, |joined| &joined.name).to_owned();
		self.raise(named(OPEN_REFUSED, &name), failure);
	}

	fn read_hosting(&mut self) {
		let shared: Vec<Call> = self
			.listed()
			.iter()
			.filter(|space| space.shared)
			.map(|space| Call::Hosting(space.id.clone()))
			.collect();
		self.queued.extend(shared);
		self.flush();
	}

	fn admit(&mut self, joined: JoinedSpace) {
		self.joined.retain(|held| held.id != joined.id);
		self.joined.push(joined);
	}

	fn raise(&mut self, title: String, failure: &HostError) {
		self.to_raise.push(Notice::of_host_failure(&title, failure));
	}

	fn raise_and_relist(&mut self, title: String, failure: &HostError) {
		self.raise(title, failure);
		self.queue(Call::ListSpaces);
	}

	fn followed(&mut self, shown: &str) -> Option<model::Space> {
		let spaces = self.spaces.as_ref()?;
		if let Some(space) = spaces.iter().find(|space| space.id == shown) {
			return Some(shown_space(space));
		}
		if let Some(joined) = self.joined_space(shown) {
			return Some(joined_shown_space(joined));
		}
		if self.is_departed(shown) {
			return None;
		}
		let first = spaces.first()?.id.clone();
		if self.opening.is_none() {
			self.select(&first, shown);
		}
		None
	}

	fn answered(&mut self, answer: Answer, shown: &str) -> Option<Opened> {
		match answer {
			Answer::Spaces(Ok(spaces)) => {
				self.spaces = Some(spaces);
				self.read_hosting();
			}
			Answer::Spaces(Err(failure)) => self.raise(SPACES_UNREAD.to_owned(), &failure),
			Answer::Joined(Ok(joined)) => self.joined = joined,
			Answer::Joined(Err(failure)) => self.raise(JOINED_UNREAD.to_owned(), &failure),
			Answer::Invitations(Ok(invitations)) => self.invitations.listed(invitations),
			Answer::Invitations(Err(failure)) if is_signed_out(&failure) => {
				self.invitations.listed(Vec::new())
			}
			Answer::Invitations(Err(failure)) => {
				self.raise(said(chat::screen::notice::FAILED), &failure)
			}
			Answer::Hosting { space_id, state } => {
				let is_up = state.as_ref().is_ok_and(is_online);
				self.online_hosting.insert(space_id, is_up);
			}
			Answer::Loaded { space_id, content } => return self.loaded(&space_id, content),
			Answer::Connected { outcome: Ok(()), .. } => {}
			Answer::Connected { joined_id, outcome: Err(failure) } => {
				self.connection_refused(&joined_id, &failure, shown)
			}
			Answer::Remembered(Ok(())) => {}
			Answer::Remembered(Err(failure)) => {
				let name = self.space(shown).map_or(shown, |space| &space.name).to_owned();
				self.raise(named(REMEMBER_REFUSED, &name), &failure)
			}
			Answer::Created(Ok(space)) => {
				let id = space.id.clone();
				self.spaces.get_or_insert_with(Vec::new).push(space);
				self.select(&id, shown);
			}
			Answer::Created(Err(failure)) => {
				self.raise_and_relist(said(chat::screen::notice::FAILED), &failure)
			}
			Answer::Described(Ok(described)) => {
				let held = self.spaces.iter_mut().flatten().find(|space| space.id == described.id);
				if let Some(held) = held {
					*held = described;
				}
			}
			Answer::Described(Err(failure)) => {
				self.raise_and_relist(said(chat::screen::notice::describe_refused::TITLE), &failure)
			}
			Answer::Reordered(Ok(())) => {}
			Answer::Reordered(Err(failure)) | Answer::Deleted { outcome: Err(failure), .. } => {
				self.raise_and_relist(said(chat::screen::notice::FAILED), &failure)
			}
			Answer::Deleted { space_id, outcome: Ok(()) } => {
				if let Some(spaces) = self.spaces.as_mut() {
					spaces.retain(|space| space.id != space_id);
				}
			}
			Answer::Accepted { invitation, outcome } => {
				if let Ok(joined) = &outcome {
					self.admit(joined.clone());
				}
				if let Some(failure) = self.invitations.accepted(&invitation, outcome) {
					self.raise(said(chat::screen::notice::FAILED), &failure);
				}
			}
			Answer::Declined { invitation, outcome } => {
				if let Some(failure) = self.invitations.declined(&invitation, outcome) {
					self.raise(said(chat::screen::notice::FAILED), &failure);
				}
			}
		}
		None
	}

	fn loaded(
		&mut self,
		space_id: &str,
		content: Result<SpaceContent, HostError>,
	) -> Option<Opened> {
		if self.opening.as_deref() != Some(space_id) {
			return None;
		}
		self.opening = None;
		let space = shown_space(self.space(space_id)?);
		match content {
			Ok(content) => {
				self.queue(Call::Remember(space_id.to_owned()));
				Some(Opened { space, content })
			}
			Err(failure) => {
				self.raise(named(OPEN_REFUSED, &space.name), &failure);
				None
			}
		}
	}

	fn answers(&self) -> Vec<Answer> {
		self.worker.as_ref().map(Worker::answers).unwrap_or_default()
	}

	fn queue(&mut self, call: Call) {
		self.queued.push(call);
		self.flush();
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

fn shown_id(app: &App) -> Option<String> {
	app.ready().map(|ready| ready.space.id.clone())
}

pub fn connected(app: &mut App) {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return };
	app.surfaces.s02_rail.read_from(source);
}

pub fn poll(app: &mut App) -> bool {
	let answers = app.surfaces.s02_rail.answers();
	let is_changed = !answers.is_empty();
	for answer in answers {
		landed(app, answer);
	}
	is_changed
}

fn raise_queued(app: &mut App) {
	let to_raise = std::mem::take(&mut app.surfaces.s02_rail.to_raise);
	app.raise_all(to_raise);
}

fn landed(app: &mut App, answer: Answer) {
	let Some(shown) = shown_id(app) else { return };
	if let Some(opened) = app.surfaces.s02_rail.answered(answer, &shown) {
		show(app, opened);
	}
	follow_listing(app);
	raise_queued(app);
}

fn follow_listing(app: &mut App) {
	let Some(shown) = shown_id(app) else { return };
	let Some(space) = app.surfaces.s02_rail.followed(&shown) else { return };
	if let Workspace::Ready(ready) = &mut app.workspace {
		ready.space = space;
	}
}

fn show(app: &mut App, opened: Opened) {
	let Workspace::Ready(ready) = &mut app.workspace else { return };
	ready.space = opened.space;
	ready.agents = opened.content.agents;
	ready.conversations = opened.content.conversations;
	ready.longest = None;
	let first =
		ready.first_conversation_with_an_agent().map(|conversation| conversation.id.clone());
	app.thread = None;
	app.mission = None;
	if let Some(id) = first {
		app.open(&id);
	}
}

pub fn space_access(app: &App) -> Option<SpaceAccess<'_>> {
	let shown = &app.ready()?.space.id;
	app.surfaces.s02_rail.access_of(shown)
}

pub fn select_space(app: &mut App, id: &str) {
	let Some(shown) = shown_id(app) else { return };
	match app.surfaces.s02_rail.open_joined(id, &shown) {
		Some(opened) => show(app, opened),
		None => app.surfaces.s02_rail.select(id, &shown),
	}
	raise_queued(app);
}

pub fn swipe_space(app: &mut App, swipe: Swipe) {
	let Some(shown) = shown_id(app) else { return };
	app.surfaces.s02_rail.swipe(swipe, &shown);
	raise_queued(app);
}

fn picked(app: &mut App, message: PickerMessage) {
	match message {
		PickerMessage::OpenChange(is_open) => app.surfaces.s02_rail.set_picker_open(is_open),
		PickerMessage::SelectSpace(id) => select_space(app, &id),
		PickerMessage::CreateSpace => app.surfaces.s02_rail.create(),
		PickerMessage::OpenSpaceSettings => app.navigation.navigate_main(Route::SpaceSettings),
		PickerMessage::AcceptInvitation(id) | PickerMessage::RetryInvitation(id) => {
			app.surfaces.s02_rail.accept(&id)
		}
		PickerMessage::DeclineInvitation(id) => app.surfaces.s02_rail.decline(&id),
	}
}

pub fn railed(app: &mut App, message: RailMessage) {
	match message {
		RailMessage::SpacesMenu(message) => picked(app, message),
		RailMessage::OpenSpaceSettings => app.navigation.navigate_main(Route::SpaceSettings),
		RailMessage::OpenYou => app.navigation.navigate_main(Route::PersonSettings),
		RailMessage::SelectPanel(RailPanel::Conversations) => app.show_conversations(),
		RailMessage::SelectPanel(RailPanel::Missions) => app.show_missions(),
		RailMessage::SelectPanel(RailPanel::Library) => {
			app.navigation.navigate_main(Route::Library)
		}
		RailMessage::OpenSearch => {}
	}
}

fn panel_of(app: &App) -> RailPanel {
	match (app.navigation.main_route(), &app.pane) {
		(Route::Library, _) => RailPanel::Library,
		(_, Pane::Missions) => RailPanel::Missions,
		(_, Pane::Conversations) => RailPanel::Conversations,
	}
}
