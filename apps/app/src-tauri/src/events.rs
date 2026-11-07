use std::any::type_name;
use std::path::Path;

use serde::Serialize;
use tauri::plugin::TauriPlugin;
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{
	AppHandle, Emitter, Manager, Runtime, Theme, Webview, WebviewUrl, WebviewWindowBuilder, Window,
	WindowEvent,
};
use tokio::sync::{broadcast, oneshot};

use tauri::image::Image;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::core_context::{
	Audience, ChosenPath, ClientId, ClientScoped, Copied, Core, Desktop, EmitError, RenderWindow,
};
pub use kiroshi_core::events::*;

use crate::agent::host::install_session_hosts;
use crate::hosting::authorship::DesktopAuthors;
use crate::session_hosts::DesktopHosts;
use crate::{menu_contract, notifications, window_controls};
use kiroshi_core::hosting::authors::install_authors;

macro_rules! declared {
	($($handle:ident: $payload:ty = $name:expr,)*) => {
		$(pub const $handle: Event<$payload> = Event::new($name);)*

		#[cfg(test)]
		const APP_DECLARED_NAMES: &[&str] = &[$($name),*];
	};
}

declared! {
	NOTIFICATION_ACTIVATED: notifications::commands::NotificationTarget = notifications::commands::ACTIVATED_EVENT,
	NATIVE_MOVE_ENDED: window_controls::native_move::NativeMoveEnded = window_controls::native_move::NATIVE_MOVE_ENDED_EVENT,
	NATIVE_MOVE_FAILED: window_controls::native_move::NativeMoveFailed = window_controls::native_move::NATIVE_MOVE_FAILED_EVENT,
	MAXIMIZE_BUTTON: window_controls::MaximizeButtonPointer = window_controls::MAXIMIZE_BUTTON_EVENT,
	DRAG_GHOST_TAB: window_controls::drag_ghost::DragGhostTab = window_controls::drag_ghost::TAB_EVENT,
	DRAG_GHOST_ENDED: window_controls::drag_ghost::DragGhostEnded = window_controls::drag_ghost::ENDED_EVENT,
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
	install_session_hosts(&core, DesktopHosts);
	install_authors(&core, DesktopAuthors);
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

	fn open_render_window(&self, window: &RenderWindow) -> Result<(), String> {
		let url = WebviewUrl::App(window.route.clone().into());
		WebviewWindowBuilder::new(&self.0, &window.label, url)
			.inner_size(window.width, window.height)
			.visible(false)
			.focused(false)
			.focusable(false)
			.skip_taskbar(true)
			.decorations(false)
			.theme(Some(Theme::Light))
			.build()
			.map(drop)
			.map_err(|failure| failure.to_string())
	}

	fn close_window(&self, label: &str) -> Result<(), String> {
		let Some(window) = self.0.get_webview_window(label) else {
			return Ok(());
		};
		window.destroy().map_err(|failure| failure.to_string())
	}

	fn reveal(&self, path: &Path) -> Result<(), String> {
		self.0.opener().reveal_item_in_dir(path).map_err(|failure| failure.to_string())
	}

	fn copy(&self, copied: Copied) -> Result<(), String> {
		let clipboard = self.0.clipboard();
		let written = match copied {
			Copied::Text(text) => clipboard.write_text(text),
			Copied::Image { rgba, width, height } => {
				clipboard.write_image(&Image::new_owned(rgba, width, height))
			}
		};
		written.map_err(|failure| failure.to_string())
	}

	fn chosen_save_path(&self, suggested: String) -> ChosenPath {
		let (answer, answered) = oneshot::channel();
		self.0.dialog().file().set_file_name(suggested).save_file(move |chosen| {
			if answer.send(chosen).is_err() {
				log::warn!("a save dialog answered after its caller was dropped");
			}
		});
		Box::pin(async move {
			let chosen = answered
				.await
				.map_err(|_| "the save dialog closed without an answer".to_owned())?;
			chosen.map(|path| path.into_path().map_err(|failure| failure.to_string())).transpose()
		})
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

pub fn subscribed<R: Runtime>(app: &AppHandle<R>) -> broadcast::Receiver<Frame> {
	core(app).subscribe_frames()
}

#[cfg(test)]
pub(crate) mod tests {
	use std::fs;
	use std::path::{Path, PathBuf};

	use serde::ser::Error;
	use serde::Serializer;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{Listener, WebviewWindow, WebviewWindowBuilder};

	use super::*;
	use crate::conversations::awaited_runs::TurnWindows;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

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
		let twice: Vec<&str> = kiroshi_core::events::DECLARED_NAMES
			.iter()
			.chain(APP_DECLARED_NAMES)
			.copied()
			.filter(|name| !declared.insert(*name))
			.collect();

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

	fn a_window_that_ran_t1(name: &str) -> (AppOfItsOwn, WebviewWindow<MockRuntime>) {
		let app = an_app_of_its_own(name, mock_builder());
		core(app.handle()).manage_client_scoped(TurnWindows::default());
		let main = WebviewWindowBuilder::new(&*app, "main", Default::default())
			.build()
			.expect("the window builds");
		let windows = core(app.handle()).state::<TurnWindows>();
		windows.submitted_from(&ClientId::new("main"), "t1");
		windows.start_driving(&ClientId::new("main"));
		(app, main)
	}

	#[test]
	fn a_page_that_starts_loading_leaves_its_turns_to_the_host_and_a_finished_load_does_not() {
		let (app, main) = a_window_that_ran_t1("forget-page-load");
		let windows = core(app.handle()).state::<TurnWindows>();
		windows.start_driving(&ClientId::new("window-1"));

		clear_client_on_page_event(&main.as_ref().window(), PageLoadEvent::Finished);
		let after_a_finished_load = windows.is_left_to_the_host("t1");
		clear_client_on_page_event(&main.as_ref().window(), PageLoadEvent::Started);

		assert!(!after_a_finished_load, "a finished load left the turn to the host");
		assert!(windows.is_left_to_the_host("t1"));
	}

	#[test]
	fn a_destroyed_window_leaves_its_turns_to_the_host_and_another_event_does_not() {
		let (app, main) = a_window_that_ran_t1("forget-destroyed");
		let windows = core(app.handle()).state::<TurnWindows>();
		windows.start_driving(&ClientId::new("window-1"));

		clear_client_on_destroyed(&main.as_ref().window(), &WindowEvent::Focused(false));
		let after_a_blur = windows.is_left_to_the_host("t1");
		clear_client_on_destroyed(&main.as_ref().window(), &WindowEvent::Destroyed);

		assert!(!after_a_blur, "a blur left the turn to the host");
		assert!(windows.is_left_to_the_host("t1"));
	}
}
