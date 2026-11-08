mod calls;
mod members;
#[cfg(test)]
mod tests;
mod view;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use kiroshi_core::invitations::contract::Invitation;
use kiroshi_core::joined_spaces::contract::{JoinedSpace, JoinedSpaceConnection};
use kiroshi_core::spaces::contract::Space;
use kiroshi_rune_kit::strings::{Key, Language, chat, settings};
use kiroshi_rune_kit::surfaces::s12_person_settings::shell::Entry as PersonEntry;
use kiroshi_rune_kit::surfaces::s13_space_settings::{Entry, Notice, SpaceEvent};
use rune::{Key as Pressed, KeyEvent, TextEdit, Waker};
use serde_json::Value;

use crate::app::{App, Workspace};
use crate::host::HostError;
use crate::model::{self, KiroshiAccountState};
use crate::navigation::Route;
use crate::source::Source;
use crate::surfaces::s02_rail::{self, Heard};
use crate::surfaces::s12_person_settings;

use calls::{Answer, Call, Calls, Due, MemberCall};
use members::{Refused, Row, Status};

pub use view::{layers, view};

const LANGUAGE: Language = Language::En;

const NOTICE_LIFETIME: Duration = Duration::from_secs(6);

const HOSTING_WATCH: Duration = Duration::from_secs(1);

const SECONDS_PER_DAY: u64 = 86_400;

#[derive(Clone, Debug, PartialEq)]
enum Page {
	Own(String),
	Joined(String),
	Invitation(Invitation),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Hosting {
	Unread,
	Off,
	Connecting,
	Online,
	NeedsSignIn,
	Failed,
}

#[derive(Clone, Debug, PartialEq)]
enum MembersRead {
	Unread,
	Reading,
	Read(Vec<Row>),
	Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Connection {
	Connecting,
	Connected,
	Refused,
}

#[derive(Clone, Debug, PartialEq)]
enum Follow {
	Saved(Space),
	Relist(Heard),
	Elsewhere { deleted: Option<String> },
	Show,
	SignIn,
	Back,
	Close,
}

struct Visit {
	page: Page,
	entry: Entry,
	colour: Option<f32>,
	hosting: Hosting,
	members: MembersRead,
	refused: Option<Refused>,
	removing: Option<String>,
	inviting_again: Option<String>,
	is_asking: bool,
	connection: Option<Connection>,
}

impl Visit {
	fn new(page: Page, colour: Option<f32>) -> Visit {
		Visit {
			page,
			entry: Entry::Space,
			colour,
			hosting: Hosting::Unread,
			members: MembersRead::Unread,
			refused: None,
			removing: None,
			inviting_again: None,
			is_asking: false,
			connection: None,
		}
	}

	fn own_id(&self) -> Option<&str> {
		match &self.page {
			Page::Own(id) => Some(id),
			Page::Joined(_) | Page::Invitation(_) => None,
		}
	}

	fn is_own(&self, space_id: &str) -> bool {
		self.own_id() == Some(space_id)
	}

	fn is_joined(&self, joined_id: &str) -> bool {
		matches!(&self.page, Page::Joined(id) if id == joined_id)
	}

	fn row(&self, id: &str) -> Option<&Row> {
		let MembersRead::Read(rows) = &self.members else { return None };
		rows.iter().find(|row| row.id == id)
	}
}

#[derive(Default)]
pub struct State {
	visit: Option<Visit>,
	name: TextEdit,
	email: TextEdit,
	spaces: Option<Vec<Space>>,
	joined: Vec<JoinedSpace>,
	is_signed_in: Option<bool>,
	is_watching_hosting: bool,
	linked: Option<String>,
	notices: Vec<(u64, Notice)>,
	notices_raised: u64,
	follows: Vec<Follow>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	calls: Option<Calls>,
}

fn said(key: Key) -> String {
	key.text(LANGUAGE).to_owned()
}

fn filled(key: Key, values: &[(&str, &str)]) -> String {
	values
		.iter()
		.fold(said(key), |line, (name, value)| line.replace(&format!("{{{{{name}}}}}"), value))
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn hue_of(colour: Option<f32>) -> Option<i64> {
	colour.map(|hue| hue.round() as i64)
}

fn colour_of(space: &Space) -> Option<f32> {
	space.colour.map(|hue| f32::from(hue.value()))
}

fn today() -> i64 {
	let seconds =
		SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs());
	i64::try_from(seconds / SECONDS_PER_DAY).unwrap_or(i64::MAX)
}

fn hosting_of(state: &Value) -> Hosting {
	match members::kind_of(Some(state)) {
		"connecting" => Hosting::Connecting,
		"online" => Hosting::Online,
		"needsSignIn" => Hosting::NeedsSignIn,
		"failed" => Hosting::Failed,
		_ => Hosting::Off,
	}
}

fn hosting_reason(state: Option<&Value>) -> Key {
	use settings::space::hosting::failed::reasons;
	match state.and_then(|state| state.get("failure")).and_then(Value::as_str) {
		Some("notOwner") => reasons::NOT_OWNER,
		Some("instanceUnknownAfterReregistration" | "instanceGoneAfterReregistration") => {
			reasons::INSTANCE_GONE
		}
		Some("deviceRefused") => reasons::DEVICE_REFUSED,
		Some("deviceAwaitingApproval") => reasons::DEVICE_AWAITING_APPROVAL,
		Some("deviceKeysNotLoaded" | "spaceKeyNotRead") => reasons::KEYS_MISSING,
		Some("takenOverByAnotherHost") => reasons::TAKEN_OVER,
		Some("localEventStreamClosed") => reasons::STREAM_CLOSED,
		_ => reasons::UNKNOWN,
	}
}

fn join_refusal(kind: &str) -> Option<(Key, Key)> {
	use chat::screen::notice::join_refused as refused;
	Some(match kind {
		"badSignature" => (refused::bad_signature::TITLE, refused::bad_signature::DESCRIPTION),
		"couldNotAccept" => {
			(refused::could_not_accept::TITLE, refused::could_not_accept::DESCRIPTION)
		}
		"invitationExpired" => {
			(refused::invitation_expired::TITLE, refused::invitation_expired::DESCRIPTION)
		}
		"invitationOtherEmail" => {
			(refused::invitation_other_email::TITLE, refused::invitation_other_email::DESCRIPTION)
		}
		"invitationUsed" => {
			(refused::invitation_used::TITLE, refused::invitation_used::DESCRIPTION)
		}
		"invitationWithdrawn" => {
			(refused::invitation_withdrawn::TITLE, refused::invitation_withdrawn::DESCRIPTION)
		}
		"needsSignIn" => (refused::needs_sign_in::TITLE, refused::needs_sign_in::DESCRIPTION),
		"noInvitation" => (refused::no_invitation::TITLE, refused::no_invitation::DESCRIPTION),
		"notInRoster" => (refused::not_in_roster::TITLE, refused::not_in_roster::DESCRIPTION),
		"ownerNotRemovable" => {
			(refused::owner_not_removable::TITLE, refused::owner_not_removable::DESCRIPTION)
		}
		"proxyUnavailable" => {
			(refused::proxy_unavailable::TITLE, refused::proxy_unavailable::DESCRIPTION)
		}
		"relayRefused" => (refused::relay_refused::TITLE, refused::relay_refused::DESCRIPTION),
		"relayUnreachable" => {
			(refused::relay_unreachable::TITLE, refused::relay_unreachable::DESCRIPTION)
		}
		"removedByRotation" => {
			(refused::removed_by_rotation::TITLE, refused::removed_by_rotation::DESCRIPTION)
		}
		"sessionRevoked" => {
			(refused::session_revoked::TITLE, refused::session_revoked::DESCRIPTION)
		}
		"sessionStore" => (refused::session_store::TITLE, refused::session_store::DESCRIPTION),
		_ => return None,
	})
}

fn is_waiting(kind: &str) -> bool {
	matches!(kind, "hostOffline" | "waitingForHost")
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
		self.flush();
	}

	fn is_signed_out(&self) -> bool {
		self.is_signed_in == Some(false)
	}

	fn begin(&mut self, visit: Visit, name: &str) {
		self.visit = Some(visit);
		self.name = TextEdit::new(name);
		self.email = TextEdit::new("");
	}

	fn open_own(&mut self, space: &model::Space) {
		self.begin(Visit::new(Page::Own(space.id.clone()), space.colour), &space.name);
		self.queued.extend([
			Call::ReadSpaces,
			Call::ReadAccount,
			Call::ReadHosting(space.id.clone()),
		]);
	}

	fn close(&mut self) {
		self.visit = None;
	}

	fn open_link(&mut self, invitation_id: String) {
		self.linked = Some(invitation_id);
		self.queued.push(Call::ReadInvitations);
	}

	fn raise(&mut self, failed: bool, title: String, description: String) {
		self.notices_raised += 1;
		self.notices.push((self.notices_raised, Notice { failed, title, description }));
		self.queued.push(Call::Wake(NOTICE_LIFETIME, Due::Notice(self.notices_raised)));
	}

	fn fail(&mut self, title: Key, failure: &HostError) {
		eprintln!("{}: {}", title.path(), failure_text(failure));
		self.raise(true, said(title), failure_text(failure));
	}

	fn refuse_join(&mut self, failure: &HostError) {
		let error = members::refusal_of(failure);
		let kind = members::kind_of(error.as_ref());
		eprintln!("a joined Space call was refused: {}", failure_text(failure));
		if is_waiting(kind) {
			return;
		}
		match join_refusal(kind) {
			Some((title, description)) => self.raise(true, said(title), said(description)),
			None => self.fail(chat::screen::notice::FAILED, failure),
		}
	}

	fn space_named(&self, space_id: &str) -> String {
		let listed = self.spaces.iter().flatten().find(|space| space.id == space_id);
		listed.map_or_else(|| self.name.text.clone(), |space| space.name.clone())
	}

	fn shown_name(&self) -> String {
		let Some(visit) = self.visit.as_ref() else { return String::new() };
		match &visit.page {
			Page::Own(id) => self.space_named(id),
			Page::Joined(id) => self
				.joined
				.iter()
				.find(|joined| &joined.id == id)
				.map_or_else(|| self.name.text.clone(), |joined| joined.name.clone()),
			Page::Invitation(invitation) => invitation.instance_name.clone(),
		}
	}

	fn is_deletable(&self) -> bool {
		self.spaces.as_ref().is_some_and(|spaces| spaces.len() > 1)
	}

	fn event(&mut self, event: SpaceEvent) {
		match event {
			SpaceEvent::Select(entry) => {
				if let Some(visit) = self.visit.as_mut() {
					visit.entry = entry;
				}
				self.read_members_if_wanted();
			}
			SpaceEvent::Save => self.save(),
			SpaceEvent::PickColour(colour) => {
				if let Some(visit) = self.visit.as_mut() {
					visit.colour = colour;
				}
				self.save();
			}
			SpaceEvent::Share(is_on) => self.share(is_on),
			SpaceEvent::SignIn => self.follows.push(Follow::SignIn),
			SpaceEvent::Invite => self.invite(),
			SpaceEvent::Resend(id) => self.resend(&id),
			SpaceEvent::Withdraw(id) => self.withdraw(&id),
			SpaceEvent::Remove(id) => self.ask_removal(id),
			SpaceEvent::ConfirmRemove => self.remove(),
			SpaceEvent::CancelRemove => self.cancel_removal(),
			SpaceEvent::AskDanger => self.set_asking(true),
			SpaceEvent::CancelDanger => self.set_asking(false),
			SpaceEvent::Delete => self.delete(),
			SpaceEvent::Leave => self.leave(),
			SpaceEvent::Accept => self.accept(),
			SpaceEvent::Decline => self.decline(),
			SpaceEvent::Back => self.follows.push(Follow::Back),
			SpaceEvent::Close => self.follows.push(Follow::Close),
			SpaceEvent::Export
			| SpaceEvent::Import
			| SpaceEvent::Open
			| SpaceEvent::SelectAgent(_)
			| SpaceEvent::CreateAgent => {}
		}
	}

	fn save(&mut self) {
		let Some(visit) = self.visit.as_ref() else { return };
		let name = self.name.text.trim().to_owned();
		let colour = hue_of(visit.colour);
		let call = match &visit.page {
			Page::Own(space_id) => Call::Save { space_id: space_id.clone(), name, colour },
			Page::Joined(joined_id) => {
				Call::Describe { joined_id: joined_id.clone(), name, colour }
			}
			Page::Invitation(_) => return,
		};
		self.queued.push(call);
	}

	fn share(&mut self, is_on: bool) {
		let Some(space_id) = self.visit.as_ref().and_then(Visit::own_id) else { return };
		if is_on && self.is_signed_out() {
			return;
		}
		let space_id = space_id.to_owned();
		self.queued.push(if is_on {
			Call::StartHosting(space_id)
		} else {
			Call::StopHosting(space_id)
		});
	}

	fn send_member_call(&mut self, call: MemberCall) {
		let Some(visit) = self.visit.as_mut() else { return };
		let Some(space_id) = visit.own_id().map(str::to_owned) else { return };
		visit.refused = None;
		self.queued.push(Call::Members { space_id, call });
	}

	fn invite(&mut self) {
		let Some(visit) = self.visit.as_ref() else { return };
		let email = self.email.text.trim().to_lowercase();
		if email.is_empty() {
			return;
		}
		let MembersRead::Read(rows) = &visit.members else {
			return self.send_member_call(MemberCall::Invite { email });
		};
		let expired = rows.iter().find(|row| {
			matches!(row.status, Status::Expired { .. }) && members::same_email(&row.email, &email)
		});
		let call = match expired {
			Some(row) => MemberCall::Resend { invitation_id: row.id.clone() },
			None => MemberCall::Invite { email },
		};
		self.send_member_call(call);
	}

	fn resend(&mut self, id: &str) {
		let Some(visit) = self.visit.as_mut() else { return };
		let Some(row) = visit.row(id) else { return };
		let call = match row.status {
			Status::NeedsInvitation => {
				visit.inviting_again = Some(id.to_owned());
				MemberCall::InviteAgain { user_id: id.to_owned() }
			}
			Status::Expired { .. } => MemberCall::Resend { invitation_id: id.to_owned() },
			Status::Host | Status::Joined | Status::Pending { .. } => return,
		};
		self.send_member_call(call);
	}

	fn withdraw(&mut self, id: &str) {
		if self.visit.as_ref().and_then(|visit| visit.row(id)).is_none() {
			return;
		}
		self.send_member_call(MemberCall::Withdraw { invitation_id: id.to_owned() });
	}

	fn ask_removal(&mut self, id: String) {
		let Some(visit) = self.visit.as_mut() else { return };
		if visit.row(&id).is_some() {
			visit.removing = Some(id);
		}
	}

	fn cancel_removal(&mut self) {
		if let Some(visit) = self.visit.as_mut() {
			visit.removing = None;
		}
	}

	fn remove(&mut self) {
		let Some(user_id) = self.visit.as_mut().and_then(|visit| visit.removing.take()) else {
			return;
		};
		self.send_member_call(MemberCall::Remove { user_id });
	}

	fn set_asking(&mut self, is_asking: bool) {
		if let Some(visit) = self.visit.as_mut() {
			visit.is_asking = is_asking;
		}
	}

	fn delete(&mut self) {
		self.set_asking(false);
		let Some(space_id) = self.visit.as_ref().and_then(Visit::own_id) else { return };
		if self.is_deletable() {
			self.queued.push(Call::Delete(space_id.to_owned()));
		}
	}

	fn leave(&mut self) {
		self.set_asking(false);
		if let Some(Page::Joined(joined_id)) = self.visit.as_ref().map(|visit| &visit.page) {
			self.queued.push(Call::Leave(joined_id.clone()));
		}
	}

	fn accept(&mut self) {
		if let Some(Page::Invitation(invitation)) = self.visit.as_ref().map(|visit| &visit.page) {
			self.queued.push(Call::Accept(invitation.clone()));
		}
	}

	fn decline(&mut self) {
		if let Some(Page::Invitation(invitation)) = self.visit.as_ref().map(|visit| &visit.page) {
			self.queued.push(Call::Decline(invitation.clone()));
		}
	}

	fn read_members_if_wanted(&mut self) {
		let Some(visit) = self.visit.as_mut() else { return };
		let is_wanted = visit.entry == Entry::Members
			&& visit.hosting == Hosting::Online
			&& visit.members == MembersRead::Unread;
		let Some(space_id) = visit.own_id().filter(|_| is_wanted).map(str::to_owned) else {
			return;
		};
		visit.members = MembersRead::Reading;
		self.queued.push(Call::ReadMembers(space_id));
	}

	fn watch_hosting(&mut self) {
		let is_connecting =
			self.visit.as_ref().is_some_and(|visit| visit.hosting == Hosting::Connecting);
		if is_connecting && !self.is_watching_hosting {
			self.is_watching_hosting = true;
			self.queued.push(Call::Wake(HOSTING_WATCH, Due::HostingWatch));
		}
	}

	fn hosting_answered(&mut self, space_id: &str, state: Result<Value, HostError>, is_stop: bool) {
		if !self.visit.as_ref().is_some_and(|visit| visit.is_own(space_id)) {
			return;
		}
		let name = self.space_named(space_id);
		let state = match state {
			Ok(state) => state,
			Err(failure) => {
				eprintln!("the hosting of {space_id} was refused: {}", failure_text(&failure));
				let (title, description) = if is_stop {
					use settings::space::hosting::stop_failed;
					(filled(stop_failed::TITLE, &[("name", &name)]), said(stop_failed::DESCRIPTION))
				} else {
					let title = filled(settings::space::hosting::failed::TITLE, &[("name", &name)]);
					(title, said(hosting_reason(None)))
				};
				return self.raise(true, title, description);
			}
		};
		let next = hosting_of(&state);
		let Some(visit) = self.visit.as_mut() else { return };
		let previous = std::mem::replace(&mut visit.hosting, next);
		if next != Hosting::Online {
			visit.members = MembersRead::Unread;
		}
		if next == Hosting::Failed && previous != Hosting::Failed {
			let title = filled(settings::space::hosting::failed::TITLE, &[("name", &name)]);
			self.raise(true, title, said(hosting_reason(Some(&state))));
		}
		self.follows.push(Follow::Relist(Heard::Hosting));
		self.watch_hosting();
		self.read_members_if_wanted();
	}

	fn members_read(&mut self, space_id: &str, listed: Result<Value, HostError>) {
		let Some(visit) = self.visit.as_mut().filter(|visit| visit.is_own(space_id)) else {
			return;
		};
		match listed.and_then(members::rows_of) {
			Ok(rows) => visit.members = MembersRead::Read(rows),
			Err(failure) => {
				visit.members = MembersRead::Failed;
				self.fail(chat::screen::notice::FAILED, &failure);
			}
		}
	}

	fn sent_notice(&mut self, rows: &[Row], email: &str) {
		let Some(until) = members::sent_until(rows, email).map(str::to_owned) else { return };
		let title = filled(settings::space::members::SENT, &[("email", email)]);
		let description = filled(settings::space::members::SENT_DESCRIPTION, &[("date", &until)]);
		self.raise(false, title, description);
	}

	fn members_changed(
		&mut self,
		space_id: &str,
		call: MemberCall,
		listed: Result<Value, HostError>,
	) {
		let Some(visit) = self.visit.as_mut().filter(|visit| visit.is_own(space_id)) else {
			return;
		};
		if matches!(call, MemberCall::InviteAgain { .. }) {
			visit.inviting_again = None;
		}
		let touched = match &call {
			MemberCall::Resend { invitation_id: id }
			| MemberCall::InviteAgain { user_id: id }
			| MemberCall::Withdraw { invitation_id: id }
			| MemberCall::Remove { user_id: id } => visit.row(id).cloned(),
			MemberCall::Invite { .. } => None,
		};
		match listed.and_then(members::rows_of) {
			Ok(rows) => self.members_landed(call, touched, rows),
			Err(failure) => self.members_refused(space_id, call, touched, &failure),
		}
	}

	fn members_landed(&mut self, call: MemberCall, touched: Option<Row>, rows: Vec<Row>) {
		match (&call, touched.as_ref()) {
			(MemberCall::Invite { email }, _) => {
				self.email = TextEdit::new("");
				self.sent_notice(&rows, email);
			}
			(MemberCall::Resend { .. } | MemberCall::InviteAgain { .. }, Some(row)) => {
				if members::same_email(&self.email.text, &row.email) {
					self.email = TextEdit::new("");
				}
				self.sent_notice(&rows, &row.email);
			}
			(MemberCall::Withdraw { .. }, Some(row)) => {
				let title = filled(settings::space::members::WITHDRAWN, &[("email", &row.email)]);
				self.raise(false, title, said(settings::space::members::WITHDRAWN_DESCRIPTION));
			}
			_ => {}
		}
		if let Some(visit) = self.visit.as_mut() {
			visit.members = MembersRead::Read(rows);
		}
	}

	fn members_refused(
		&mut self,
		space_id: &str,
		call: MemberCall,
		touched: Option<Row>,
		failure: &HostError,
	) {
		eprintln!("a member call was refused: {}", failure_text(failure));
		let error = members::refusal_of(failure);
		if members::is_list_not_read_back(error.as_ref())
			&& let Some(visit) = self.visit.as_mut()
		{
			visit.members = MembersRead::Reading;
			self.queued.push(Call::ReadMembers(space_id.to_owned()));
		}
		let refused = match (call, touched) {
			(MemberCall::Invite { email }, _) => Refused::Invite { email, error },
			(MemberCall::Resend { .. }, Some(row)) => Refused::Resend { email: row.email, error },
			(MemberCall::Withdraw { .. }, Some(row)) => Refused::Withdraw { row, error },
			(MemberCall::Remove { .. }, Some(row)) => Refused::Remove { row, error },
			(MemberCall::InviteAgain { .. }, Some(row)) => {
				return self.invite_again_refused(&row, error.as_ref());
			}
			(_, None) => return self.fail(chat::screen::notice::FAILED, failure),
		};
		if let Some(visit) = self.visit.as_mut() {
			visit.refused = Some(refused);
		}
	}

	fn invite_again_refused(&mut self, row: &Row, error: Option<&Value>) {
		use settings::space::members::invited_again_failure::{generic, listed, removed};
		let (title, description) = match members::kind_of(error) {
			"removedButNotInvited" => (removed::TITLE, removed::DESCRIPTION),
			"invitedButNotListed" => (listed::TITLE, listed::DESCRIPTION),
			_ => (generic::TITLE, generic::DESCRIPTION),
		};
		let name = row.name.as_deref().unwrap_or(&row.email);
		let values = [("name", name), ("email", row.email.as_str())];
		self.raise(true, filled(title, &values), filled(description, &values));
	}

	fn saved(&mut self, saved: Result<Space, HostError>) {
		match saved {
			Ok(space) => {
				let held = self.spaces.iter_mut().flatten().find(|held| held.id == space.id);
				if let Some(held) = held {
					*held = space.clone();
				}
				self.follows.push(Follow::Saved(space));
			}
			Err(failure) => self.describe_refused(&failure),
		}
	}

	fn described(&mut self, described: Result<JoinedSpace, HostError>) {
		match described {
			Ok(joined) => {
				self.admit(joined);
				self.follows.push(Follow::Relist(Heard::Joined));
			}
			Err(failure) => self.describe_refused(&failure),
		}
	}

	fn describe_refused(&mut self, failure: &HostError) {
		use chat::screen::notice::describe_refused;
		eprintln!("a Space description was refused: {}", failure_text(failure));
		let description =
			filled(describe_refused::DESCRIPTION, &[("reason", &failure_text(failure))]);
		self.raise(true, said(describe_refused::TITLE), description);
	}

	fn admit(&mut self, joined: JoinedSpace) {
		self.joined.retain(|held| held.id != joined.id);
		self.joined.push(joined);
	}

	fn invitations_read(&mut self, listed: Result<Vec<Invitation>, HostError>) {
		let Some(linked) = self.linked.take() else { return };
		let listed = match listed {
			Ok(listed) => listed,
			Err(failure)
				if members::kind_of(members::refusal_of(&failure).as_ref()) == "notSignedIn" =>
			{
				Vec::new()
			}
			Err(failure) => return self.fail(chat::screen::notice::FAILED, &failure),
		};
		let Some(invitation) = listed.into_iter().find(|invitation| invitation.id == linked) else {
			use chat::screen::notice::join_refused::no_invitation;
			return self.raise(true, said(no_invitation::TITLE), said(no_invitation::DESCRIPTION));
		};
		let name = invitation.instance_name.clone();
		self.begin(Visit::new(Page::Invitation(invitation), None), &name);
		self.follows.push(Follow::Show);
	}

	fn shows_invitation(&self, invitation: &Invitation) -> bool {
		self.visit.as_ref().is_some_and(
			|visit| matches!(&visit.page, Page::Invitation(shown) if shown == invitation),
		)
	}

	fn accepted(&mut self, invitation: &Invitation, outcome: Result<JoinedSpace, HostError>) {
		if !self.shows_invitation(invitation) {
			return;
		}
		match outcome {
			Ok(joined) => {
				let colour = joined.colour.map(|hue| f32::from(hue.value()));
				let mut visit = Visit::new(Page::Joined(joined.id.clone()), colour);
				visit.connection = Some(Connection::Connecting);
				self.begin(visit, &joined.name);
				self.queued.push(Call::Connect(joined.id.clone()));
				self.admit(joined);
				self.follows
					.extend([Follow::Relist(Heard::Joined), Follow::Relist(Heard::Invitations)]);
			}
			Err(failure) => self.refuse_join(&failure),
		}
	}

	fn declined(&mut self, invitation: &Invitation, outcome: Result<(), HostError>) {
		if !self.shows_invitation(invitation) {
			return;
		}
		match outcome {
			Ok(()) => self.follows.extend([Follow::Relist(Heard::Invitations), Follow::Close]),
			Err(failure) => self.fail(chat::screen::notice::FAILED, &failure),
		}
	}

	fn connected(&mut self, joined_id: &str, outcome: Result<JoinedSpaceConnection, HostError>) {
		let Some(visit) = self.visit.as_mut().filter(|visit| visit.is_joined(joined_id)) else {
			return;
		};
		match outcome {
			Ok(_) => visit.connection = Some(Connection::Connected),
			Err(failure) => {
				visit.connection = Some(Connection::Refused);
				self.refuse_join(&failure);
			}
		}
	}

	fn answered(&mut self, answer: Answer) {
		match answer {
			Answer::Spaces(Ok(spaces)) => self.spaces = Some(spaces),
			Answer::Spaces(Err(failure)) => self.fail(chat::screen::notice::FAILED, &failure),
			Answer::Account(Ok(account)) => {
				self.is_signed_in = Some(matches!(account, KiroshiAccountState::SignedIn { .. }))
			}
			Answer::Account(Err(failure)) => self.fail(settings::account::READ_FAILED, &failure),
			Answer::Hosting { space_id, state, is_stop } => {
				self.hosting_answered(&space_id, state, is_stop)
			}
			Answer::Members { space_id, listed } => self.members_read(&space_id, listed),
			Answer::Changed { space_id, call, listed } => {
				self.members_changed(&space_id, call, listed)
			}
			Answer::Saved(saved) => self.saved(saved),
			Answer::Described(described) => self.described(described),
			Answer::Deleted { space_id, outcome: Ok(()) } => {
				self.follows.push(Follow::Elsewhere { deleted: Some(space_id) })
			}
			Answer::Deleted { outcome: Err(failure), .. } => {
				self.fail(chat::screen::notice::FAILED, &failure)
			}
			Answer::Invitations(listed) => self.invitations_read(listed),
			Answer::Accepted { invitation, outcome } => self.accepted(&invitation, outcome),
			Answer::Declined { invitation, outcome } => self.declined(&invitation, outcome),
			Answer::Connected { joined_id, outcome } => self.connected(&joined_id, outcome),
			Answer::Left { joined_id, outcome: Ok(()) } => {
				self.joined.retain(|joined| joined.id != joined_id);
				self.follows
					.extend([Follow::Relist(Heard::Joined), Follow::Elsewhere { deleted: None }]);
			}
			Answer::Left { outcome: Err(failure), .. } => self.refuse_join(&failure),
			Answer::Due(Due::Notice(raised)) => self.notices.retain(|(held, _)| *held != raised),
			Answer::Due(Due::HostingWatch) => {
				self.is_watching_hosting = false;
				let watched =
					self.visit.as_ref().filter(|visit| visit.hosting == Hosting::Connecting);
				if let Some(space_id) = watched.and_then(Visit::own_id) {
					self.queued.push(Call::ReadHosting(space_id.to_owned()));
				}
			}
		}
	}

	fn take_answers(&self) -> Vec<Answer> {
		self.calls.as_ref().map(Calls::answers).unwrap_or_default()
	}

	fn flush(&mut self) {
		if self.calls.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.calls = Calls::spawn(source.clone(), waker.clone());
		}
		let Some(calls) = self.calls.as_ref() else { return };
		for call in self.queued.drain(..) {
			calls.send(call);
		}
	}
}

fn state(app: &mut App) -> &mut State {
	&mut app.surfaces.s13_space_settings
}

fn use_ready_source(app: &mut App) {
	if let Some(source) = app.ready().map(|ready| ready.source.clone()) {
		state(app).use_source(source);
	}
}

fn is_shown(app: &App) -> bool {
	app.navigation.main_route() == Route::SpaceSettings
}

fn follow_route(app: &mut App) {
	match (is_shown(app), app.surfaces.s13_space_settings.visit.is_some()) {
		(true, false) => {
			let Some(space) = app.ready().map(|ready| ready.space.clone()) else { return };
			state(app).open_own(&space);
		}
		(false, true) => state(app).close(),
		_ => {}
	}
}

pub fn open_join_link(app: &mut App, invitation_id: String) {
	state(app).open_link(invitation_id);
	use_ready_source(app);
	state(app).flush();
}

pub fn space_event(app: &mut App, event: SpaceEvent) {
	state(app).event(event);
	run_follows(app);
	state(app).flush();
}

fn another_space(app: &App, deleted: Option<&str>) -> Option<String> {
	let spaces = app.surfaces.s13_space_settings.spaces.as_ref()?;
	spaces.iter().find(|space| Some(space.id.as_str()) != deleted).map(|space| space.id.clone())
}

fn go_elsewhere(app: &mut App, deleted: Option<&str>) {
	let is_shown_deleted =
		app.ready().is_some_and(|ready| Some(ready.space.id.as_str()) == deleted);
	if is_shown_deleted && let Some(other) = another_space(app, deleted) {
		s02_rail::select_space(app, &other);
	}
	app.surfaces.s02_rail.heard(Heard::Spaces);
	state(app).close();
	app.navigation.navigate_main(Route::Conversations);
}

fn run_follow(app: &mut App, follow: Follow) {
	match follow {
		Follow::Saved(space) => {
			if let Workspace::Ready(ready) = &mut app.workspace
				&& ready.space.id == space.id
			{
				ready.space = model::Space {
					id: space.id.clone(),
					name: space.name.clone(),
					colour: colour_of(&space),
				};
			}
			app.surfaces.s02_rail.heard(Heard::Spaces);
		}
		Follow::Relist(heard) => app.surfaces.s02_rail.heard(heard),
		Follow::Elsewhere { deleted } => go_elsewhere(app, deleted.as_deref()),
		Follow::Show => app.navigation.navigate_main(Route::SpaceSettings),
		Follow::SignIn => s12_person_settings::open_settings(app, Some(PersonEntry::Account)),
		Follow::Back => s12_person_settings::open_settings(app, None),
		Follow::Close => {
			state(app).close();
			app.navigation.navigate_main(Route::Conversations);
		}
	}
}

fn run_follows(app: &mut App) {
	let follows = std::mem::take(&mut state(app).follows);
	for follow in follows {
		run_follow(app, follow);
	}
}

pub fn poll(app: &mut App) -> bool {
	if app.surfaces.s13_space_settings.source.is_none() {
		use_ready_source(app);
	}
	let answers = state(app).take_answers();
	let is_changed = !answers.is_empty();
	for answer in answers {
		state(app).answered(answer);
	}
	run_follows(app);
	let was_open = app.surfaces.s13_space_settings.visit.is_some();
	follow_route(app);
	let is_open = app.surfaces.s13_space_settings.visit.is_some();
	state(app).flush();
	is_changed || was_open != is_open
}

pub fn key_pressed(app: &mut App, key: &KeyEvent) -> bool {
	if !is_shown(app) || key.key != Pressed::Escape {
		return false;
	}
	let Some(visit) = app.surfaces.s13_space_settings.visit.as_ref() else { return false };
	let event = match (visit.removing.is_some(), visit.is_asking) {
		(true, _) => SpaceEvent::CancelRemove,
		(false, true) => SpaceEvent::CancelDanger,
		(false, false) => return false,
	};
	space_event(app, event);
	true
}
