use std::any::type_name;
use std::marker::PhantomData;
use std::sync::Arc;

use serde::Serialize;
use tauri::plugin::TauriPlugin;
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview, Window, WindowEvent};
use tokio::sync::broadcast;

use tauri_plugin_opener::OpenerExt;

use crate::core_context::{Audience, ClientId, ClientScoped, Core, Desktop, EmitError};

use crate::{
	account, agent, applications, claude_import, companions, conversations, devices, hosting,
	invitations, joined_spaces, library, menu_contract, missions, notifications, routines, spaces,
	updates, window_controls,
};

pub const BUFFERED_FRAMES: usize = 1024;

pub type Frame = Arc<str>;

pub struct Event<P> {
	name: &'static str,
	payload: PhantomData<fn() -> P>,
}

impl<P> Event<P> {
	const fn new(name: &'static str) -> Self {
		Self { name, payload: PhantomData }
	}

	pub const fn name(&self) -> &'static str {
		self.name
	}
}

#[cfg(test)]
impl Event<serde_json::Value> {
	pub(crate) const fn untyped(name: &'static str) -> Self {
		Self::new(name)
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

		#[cfg(test)]
		const DECLARED_NAMES: &[&str] = &[$($name),*];
	};
}

declared! {
	ACCOUNT_CHANGED: account::contract::AccountState = account::contract::CHANGED_EVENT,
	AGENT_EVENT: agent::contract::ScopedEvent = agent::commands::EVENT_CHANNEL,
	SIGN_IN_STARTED: agent::contract::SignInStarted = agent::sign_in::SIGN_IN_STARTED_CHANNEL,
	APPLICATION_INSTALLED: applications::contract::ApplicationInstalled =
		applications::contract::INSTALLED_EVENT,
	APPLICATION_DIRECTORY_REFRESHED: () = applications::contract::DIRECTORY_REFRESHED_EVENT,
	CLAUDE_IMPORT_PROGRESS: claude_import::contract::ClaudeImportProgress =
		claude_import::contract::PROGRESS_EVENT,
	COMPANION_CREATED: companions::contract::CompanionCreated = companions::contract::CREATED_EVENT,
	COMPANION_UPDATED: companions::contract::CompanionUpdated = companions::contract::UPDATED_EVENT,
	COMPANION_DELETED: companions::contract::CompanionDeleted = companions::contract::DELETED_EVENT,
	FIRST_RUN_DONE: () = companions::contract::FIRST_RUN_DONE_EVENT,
	SEED_REFUSED: companions::contract::CompanionSeedRefused =
		companions::contract::SEED_REFUSED_EVENT,
	CONVERSATION_CREATED: conversations::contract::ConversationStored =
		conversations::contract::CREATED_EVENT,
	CONVERSATION_UPDATED: conversations::contract::ConversationStored =
		conversations::contract::UPDATED_EVENT,
	CONVERSATION_DELETED: conversations::contract::ConversationDeleted =
		conversations::contract::DELETED_EVENT,
	CONVERSATION_STATE_CHANGED: conversations::contract::ConversationStateChanged =
		conversations::contract::STATE_CHANGED_EVENT,
	MESSAGE_STORED: conversations::contract::TranscriptMessage =
		conversations::contract::MESSAGE_STORED_EVENT,
	COMPANION_ARRIVED: conversations::contract::CompanionArrival =
		conversations::contract::COMPANION_ARRIVED_EVENT,
	COMPANION_SPOKE: conversations::contract::CompanionSpoke =
		conversations::contract::COMPANION_SPOKE_EVENT,
	SUMMONS_DROPPED: conversations::contract::SummonsDropped =
		conversations::contract::SUMMONS_DROPPED_EVENT,
	DEVICE_APPROVAL_CHANGED: devices::contract::DeviceApproval =
		devices::contract::APPROVAL_CHANGED_EVENT,
	DEVICE_APPROVAL_REQUESTED: devices::contract::DeviceApprovalRequested =
		devices::contract::APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED: devices::contract::DeviceApprovalSettled =
		devices::contract::APPROVAL_SETTLED_EVENT,
	HOSTING_CHANGED: hosting::contract::HostingChanged = hosting::contract::CHANGED_EVENT,
	MEMBERS_CHANGED: hosting::contract::MembersChanged = hosting::contract::MEMBERS_CHANGED_EVENT,
	INVITATION_CHANGED: invitations::contract::InvitationsChanged =
		invitations::contract::CHANGED_EVENT,
	JOINED_SPACE_CHANGED: joined_spaces::commands::JoinedSpaceChanged =
		joined_spaces::commands::CHANGED_EVENT,
	JOINED_SPACE_REMOVED: joined_spaces::commands::JoinedSpaceRemoved =
		joined_spaces::commands::REMOVED_EVENT,
	JOINED_SPACE_RECONNECTED: joined_spaces::commands::JoinedSpaceReconnected =
		joined_spaces::commands::RECONNECTED_EVENT,
	JOINED_SPACE_MEMBERS_CHANGED: joined_spaces::members::JoinedSpaceMembersChanged =
		joined_spaces::members::MEMBERS_CHANGED_EVENT,
	JOIN_LINK_OPENED: joined_spaces::deep_link::JoinLinkOpened =
		joined_spaces::deep_link::OPENED_EVENT,
	LIBRARY_DOCUMENT_UPDATED: library::contract::LibraryDocumentUpdated =
		library::contract::DOCUMENT_UPDATED_EVENT,
	LIBRARY_DOCUMENT_RENAMED: library::contract::LibraryDocumentRenamed =
		library::contract::DOCUMENT_RENAMED_EVENT,
	LIBRARY_BOARD_FILE_REPLACED: library::contract::LibraryBoardFileReplaced =
		library::contract::BOARD_FILE_REPLACED_EVENT,
	LIBRARY_DOCUMENT_PRESENCE: library::contract::LibraryDocumentPresence =
		library::contract::DOCUMENT_PRESENCE_EVENT,
	LIBRARY_DOCUMENT_WRITER_FINISHED: library::contract::LibraryDocumentWriterFinished =
		library::contract::DOCUMENT_WRITER_FINISHED_EVENT,
	LIBRARY_CHANGED: library::contract::LibraryChanged = library::contract::CHANGED_EVENT,
	MISSION_CHANGED: missions::commands::MissionChanged = missions::commands::CHANGED_EVENT,
	NOTIFICATION_ACTIVATED: notifications::commands::NotificationTarget =
		notifications::commands::ACTIVATED_EVENT,
	ROUTINE_CHANGED: routines::commands::RoutineChanged = routines::commands::CHANGED_EVENT,
	SPACE_DESCRIBED: spaces::contract::SpaceDescribed = spaces::contract::DESCRIBED_EVENT,
	NATIVE_MOVE_ENDED: window_controls::native_move::NativeMoveEnded =
		window_controls::native_move::NATIVE_MOVE_ENDED_EVENT,
	NATIVE_MOVE_FAILED: window_controls::native_move::NativeMoveFailed =
		window_controls::native_move::NATIVE_MOVE_FAILED_EVENT,
	MAXIMIZE_BUTTON: window_controls::MaximizeButtonPointer =
		window_controls::MAXIMIZE_BUTTON_EVENT,
	DRAG_GHOST_TAB: window_controls::drag_ghost::DragGhostTab =
		window_controls::drag_ghost::TAB_EVENT,
	DRAG_GHOST_ENDED: window_controls::drag_ghost::DragGhostEnded =
		window_controls::drag_ghost::ENDED_EVENT,
	UPDATE_CHANGED: updates::contract::UpdateState = updates::contract::CHANGED_EVENT,
	FILE_MENU: menu_contract::FileMenuChosen = menu_contract::FILE_MENU_EVENT,
	TAB_DRAG: window_controls::tab_drag::TabDrag = window_controls::tab_drag::TAB_DRAG_EVENT,
}

pub fn in_core<R: Runtime, T: Send + Sync + 'static>(value: T) -> TauriPlugin<R> {
	tauri::plugin::Builder::new(type_name::<T>())
		.setup(move |app, _| {
			install_core(app)?.manage(value);
			Ok(())
		})
		.build()
}

pub fn in_core_client_scoped<R: Runtime, T: ClientScoped>(value: T) -> TauriPlugin<R> {
	tauri::plugin::Builder::new(type_name::<T>())
		.setup(move |app, _| {
			install_core(app)?.manage_client_scoped(value);
			Ok(())
		})
		.build()
}

pub fn client_of<R: Runtime>(window: &Window<R>) -> ClientId {
	ClientId::new(window.label())
}

pub fn clear_client_on_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
	clear_client_on_page_event(&webview.window(), payload.event());
}

pub fn clear_client_on_page_event<R: Runtime>(window: &Window<R>, event: PageLoadEvent) {
	if event == PageLoadEvent::Started {
		core(window.app_handle()).clear_client(&client_of(window));
	}
}

pub fn clear_client_on_destroyed<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
	if matches!(event, WindowEvent::Destroyed) {
		core(window.app_handle()).clear_client(&client_of(window));
	}
}

pub fn install_core<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Core> {
	if let Some(core) = app.try_state::<Core>() {
		return Ok(core.inner().clone());
	}
	let core = Core::new(
		app.path().app_data_dir()?,
		app.config().identifier.clone(),
		tauri::async_runtime::handle().inner().clone(),
	);
	core.install_desktop(TauriDesktop(app.clone()));
	let windows = app.clone();
	core.listen(move |event| {
		let sent = match &event.audience {
			Audience::Client(client) => {
				windows.emit_to(client.as_str(), event.name, &event.payload)
			}
			Audience::Everyone | Audience::LocalClients => windows.emit(event.name, &event.payload),
		};
		sent.map_err(|failure| failure.to_string())
	});
	app.manage(core.clone());
	Ok(core)
}

struct TauriDesktop<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Desktop for TauriDesktop<R> {
	fn open_url(&self, url: &str) -> Result<(), String> {
		self.0.opener().open_url(url, None::<&str>).map_err(|failure| failure.to_string())
	}

	fn raise_main_window(&self) {
		window_controls::raise_main(&self.0);
	}
}

pub fn core<R: Runtime>(app: &AppHandle<R>) -> &Core {
	app.state::<Core>().inner()
}

pub fn emit<R: Runtime, P: Serialize>(
	app: &AppHandle<R>,
	event: Event<P>,
	payload: P,
) -> Result<(), EmitError> {
	core(app).emit(event, payload)
}

pub fn emit_to<R: Runtime, P: Serialize>(
	app: &AppHandle<R>,
	label: &str,
	event: Event<P>,
	payload: P,
) -> Result<(), EmitError> {
	core(app).emit_to(&ClientId::new(label), event, payload)
}

pub fn emit_to_windows<R: Runtime, P: Serialize>(
	app: &AppHandle<R>,
	event: Event<P>,
	payload: P,
) -> Result<(), EmitError> {
	core(app).emit_locally(event, payload)
}

pub fn frame<P: Serialize>(event: Event<P>, payload: &P) -> serde_json::Result<Frame> {
	framed(event.name(), payload)
}

pub fn subscribed<R: Runtime>(app: &AppHandle<R>) -> broadcast::Receiver<Frame> {
	core(app).subscribe_frames()
}

pub(crate) fn framed<S: Serialize + ?Sized>(event: &str, payload: &S) -> serde_json::Result<Frame> {
	let event = serde_json::to_string(event)?;
	let payload = serde_json::to_string(payload)?;
	Ok(format!(r#"{{"event":{event},"payload":{payload}}}"#).into())
}

#[cfg(test)]
pub(crate) mod tests {
	use std::fs;
	use std::path::{Path, PathBuf};

	use serde::ser::Error;
	use serde::Serializer;
	use tauri::test::mock_builder;
	use tauri::Listener;

	use super::*;
	use crate::test_app::an_app_of_its_own;

	const FAN_OUT: &str = "src/events.rs";

	#[derive(Clone)]
	struct Unserializable;

	impl Serialize for Unserializable {
		fn serialize<S: Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
			Err(S::Error::custom("refused"))
		}
	}

	pub(crate) fn rust_files(dir: &Path) -> Vec<PathBuf> {
		fs::read_dir(dir)
			.expect("the source dir reads")
			.map(|entry| entry.expect("an entry").path())
			.flat_map(|path| match path.is_dir() {
				true => rust_files(&path),
				false => vec![path],
			})
			.filter(|path| path.extension().is_some_and(|extension| extension == "rs"))
			.collect()
	}

	fn reaches_the_emitter(source: &str) -> bool {
		let names_it =
			source.split(|c: char| !c.is_alphanumeric() && c != '_').any(|word| word == "Emitter");
		let compact: String = source.split_whitespace().collect();
		names_it || compact.contains("usetauri::*")
	}

	#[test]
	fn only_the_fan_out_reaches_the_emitter() {
		let root = Path::new(env!("CARGO_MANIFEST_DIR"));
		let importers: Vec<PathBuf> = rust_files(&root.join("src"))
			.into_iter()
			.filter(|path| reaches_the_emitter(&fs::read_to_string(path).expect("the file reads")))
			.map(|path| path.strip_prefix(root).expect("under the root").to_owned())
			.collect();

		assert_eq!(importers, vec![PathBuf::from(FAN_OUT)]);
	}

	#[test]
	fn a_multi_line_import_is_seen() {
		assert!(reaches_the_emitter("use tauri::{\n\tAppHandle,\n\tEmitter,\n};"));
		assert!(!reaches_the_emitter("use tauri::{AppHandle, EventEmitter};"));
	}

	#[test]
	fn a_path_call_or_a_glob_is_seen() {
		assert!(reaches_the_emitter("tauri::Emitter::emit(&app, \"x\", 1);"));
		assert!(reaches_the_emitter("use tauri::*;"));
		assert!(reaches_the_emitter("pub use tauri :: * ;"));
		assert!(!reaches_the_emitter("use tauri::{AppHandle, Manager};"));
	}

	#[test]
	fn every_event_name_is_declared_by_one_handle() {
		let mut declared = std::collections::BTreeSet::new();
		let twice: Vec<&str> =
			DECLARED_NAMES.iter().copied().filter(|name| !declared.insert(*name)).collect();

		assert!(twice.is_empty(), "the events {twice:?} are declared by more than one handle");
	}

	#[test]
	fn a_frame_carries_the_name_and_the_payload() {
		let frame =
			framed(crate::missions::commands::CHANGED_EVENT, &serde_json::json!({ "a": 1 }))
				.expect("a frame");
		assert_eq!(&*frame, r#"{"event":"mission://changed","payload":{"a":1}}"#);
	}

	#[test]
	fn an_unserializable_payload_reaches_no_client_and_is_still_handed_to_the_window() {
		let app = an_app_of_its_own("events", mock_builder());
		let mut heard = subscribed(app.handle());

		let unserializable = Event::new(crate::companions::contract::FIRST_RUN_DONE_EVENT);

		assert!(emit(app.handle(), unserializable, Unserializable).is_err());
		assert!(heard.try_recv().is_err());
	}

	#[test]
	fn without_a_client_the_window_still_hears() {
		let app = an_app_of_its_own("events", mock_builder());
		let (told, hearing) = std::sync::mpsc::channel();
		app.listen_any(FIRST_RUN_DONE.name(), move |event| {
			told.send(event.payload().to_owned()).expect("the test listens");
		});

		emit(app.handle(), FIRST_RUN_DONE, ()).expect("emitted");

		assert_eq!(hearing.recv().expect("the window heard"), "null");
	}
}
