use std::marker::PhantomData;
use std::sync::Arc;

use crate::{
	account, agent, applications, claude_import, companions, conversations, devices, hosting,
	invitations, joined_spaces, library, missions, routines, spaces, updates,
};
use serde::Serialize;

pub const BUFFERED_FRAMES: usize = 1024;

pub type Frame = Arc<str>;

pub struct Event<P> {
	name: &'static str,
	payload: PhantomData<fn() -> P>,
}

impl<P> Event<P> {
	pub const fn new(name: &'static str) -> Self {
		Self { name, payload: PhantomData }
	}

	pub const fn name(&self) -> &'static str {
		self.name
	}
}

impl<P> Clone for Event<P> {
	fn clone(&self) -> Self {
		*self
	}
}

impl<P> Copy for Event<P> {}

macro_rules! declared {
	($($handle:ident: $payload:ty = $name:expr,)*) => {
		$(pub const $handle: Event<$payload> = Event::new($name);)*

		#[cfg(any(test, feature = "test-support"))]
		pub const DECLARED_NAMES: &[&str] = &[$($name),*];

		#[cfg(test)]
		pub const PAYLOADS: &[(&str, fn(&mut specta::Types) -> specta::datatype::DataType)] =
			&[$(($name, <$payload as specta::Type>::definition)),*];
	};
}

declared! {
	ACCOUNT_CHANGED: account::contract::AccountState = account::contract::CHANGED_EVENT,
	AGENT_EVENT: agent::contract::ScopedEvent = agent::contract::EVENT_CHANNEL,
	SIGN_IN_STARTED: agent::contract::SignInStarted = agent::contract::SIGN_IN_STARTED_CHANNEL,
	APPLICATION_INSTALLED: applications::contract::ApplicationInstalled = applications::contract::INSTALLED_EVENT,
	APPLICATION_DIRECTORY_REFRESHED: () = applications::contract::DIRECTORY_REFRESHED_EVENT,
	CLAUDE_IMPORT_PROGRESS: claude_import::contract::ClaudeImportProgress = claude_import::contract::PROGRESS_EVENT,
	COMPANION_CREATED: companions::contract::CompanionCreated = companions::contract::CREATED_EVENT,
	COMPANION_UPDATED: companions::contract::CompanionUpdated = companions::contract::UPDATED_EVENT,
	COMPANION_DELETED: companions::contract::CompanionDeleted = companions::contract::DELETED_EVENT,
	FIRST_RUN_DONE: () = companions::contract::FIRST_RUN_DONE_EVENT,
	SEED_REFUSED: companions::contract::CompanionSeedRefused = companions::contract::SEED_REFUSED_EVENT,
	CONVERSATION_CREATED: conversations::contract::ConversationStored = conversations::contract::CREATED_EVENT,
	CONVERSATION_UPDATED: conversations::contract::ConversationStored = conversations::contract::UPDATED_EVENT,
	CONVERSATION_DELETED: conversations::contract::ConversationDeleted = conversations::contract::DELETED_EVENT,
	CONVERSATION_STATE_CHANGED: conversations::contract::ConversationStateChanged = conversations::contract::STATE_CHANGED_EVENT,
	MESSAGE_STORED: conversations::contract::TranscriptMessage = conversations::contract::MESSAGE_STORED_EVENT,
	COMPANION_ARRIVED: conversations::contract::CompanionArrival = conversations::contract::COMPANION_ARRIVED_EVENT,
	COMPANION_SPOKE: conversations::contract::CompanionSpoke = conversations::contract::COMPANION_SPOKE_EVENT,
	SUMMONS_DROPPED: conversations::contract::SummonsDropped = conversations::contract::SUMMONS_DROPPED_EVENT,
	DEVICE_APPROVAL_CHANGED: devices::contract::DeviceApproval = devices::contract::APPROVAL_CHANGED_EVENT,
	DEVICE_APPROVAL_REQUESTED: devices::contract::DeviceApprovalRequested = devices::contract::APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED: devices::contract::DeviceApprovalSettled = devices::contract::APPROVAL_SETTLED_EVENT,
	HOSTING_CHANGED: hosting::contract::HostingChanged = hosting::contract::CHANGED_EVENT,
	MEMBERS_CHANGED: hosting::contract::MembersChanged = hosting::contract::MEMBERS_CHANGED_EVENT,
	INVITATION_CHANGED: invitations::contract::InvitationsChanged = invitations::contract::CHANGED_EVENT,
	JOINED_SPACE_CHANGED: joined_spaces::contract::JoinedSpaceChanged = joined_spaces::contract::CHANGED_EVENT,
	JOINED_SPACE_REMOVED: joined_spaces::contract::JoinedSpaceRemoved = joined_spaces::contract::REMOVED_EVENT,
	JOINED_SPACE_RECONNECTED: joined_spaces::contract::JoinedSpaceReconnected = joined_spaces::contract::RECONNECTED_EVENT,
	JOIN_LINK_OPENED: joined_spaces::join_links::JoinLinkOpened = crate::desktop_events::JOIN_LINK_OPENED_EVENT,
	JOINED_SPACE_MEMBERS_CHANGED: joined_spaces::contract::JoinedSpaceMembersChanged = joined_spaces::contract::MEMBERS_CHANGED_EVENT,
	LIBRARY_DOCUMENT_UPDATED: library::contract::LibraryDocumentUpdated = library::contract::DOCUMENT_UPDATED_EVENT,
	LIBRARY_DOCUMENT_RENAMED: library::contract::LibraryDocumentRenamed = library::contract::DOCUMENT_RENAMED_EVENT,
	LIBRARY_BOARD_FILE_REPLACED: library::contract::LibraryBoardFileReplaced = library::contract::BOARD_FILE_REPLACED_EVENT,
	LIBRARY_DOCUMENT_PRESENCE: library::contract::LibraryDocumentPresence = library::contract::DOCUMENT_PRESENCE_EVENT,
	LIBRARY_DOCUMENT_WRITER_FINISHED: library::contract::LibraryDocumentWriterFinished = library::contract::DOCUMENT_WRITER_FINISHED_EVENT,
	LIBRARY_CHANGED: library::contract::LibraryChanged = library::contract::CHANGED_EVENT,
	MISSION_CHANGED: missions::contract::MissionChanged = missions::contract::CHANGED_EVENT,
	ROUTINE_CHANGED: routines::contract::RoutineChanged = routines::contract::CHANGED_EVENT,
	SPACE_DESCRIBED: spaces::contract::SpaceDescribed = spaces::contract::DESCRIBED_EVENT,
	UPDATE_CHANGED: updates::contract::UpdateState = updates::contract::CHANGED_EVENT,
}

pub fn frame<P: Serialize>(event: Event<P>, payload: &P) -> serde_json::Result<Frame> {
	framed(event.name(), payload)
}

pub fn framed<S: Serialize + ?Sized>(event: &str, payload: &S) -> serde_json::Result<Frame> {
	let event = serde_json::to_string(event)?;
	let payload = serde_json::to_string(payload)?;
	Ok(format!(r#"{{"event":{event},"payload":{payload}}}"#).into())
}
