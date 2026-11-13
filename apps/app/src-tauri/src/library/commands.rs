use std::path::PathBuf;

use reqwest::Url;
use tauri::image::Image;
use tauri::{AppHandle, Runtime, State, Webview};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use futures_util::future::join_all;

use super::contract::{
	LibraryBoardSummary, LibraryCommentAnchor, LibraryCommentCount, LibraryCommentParty,
	LibraryCommentThread, LibraryCommentThreadState, LibraryDocument, LibraryDocumentState,
	LibraryError, LibraryFile, LibraryImage, LibraryImport, LibraryImportUrlError, LibraryItem,
	LibraryPresenceAt, LibraryTemplate,
};
use super::host::stop_writers;
use super::presence::{seated_identity, share_presence, unseat_writer, Identity, Seat};
use super::url_import::{admission_for, import_url};
use super::{
	apply_update, clipboard_payload, clipboard_payload_of_bytes, comment_threads, create_board,
	create_document, delete_item, import, import_paths, list, open_comment_thread, open_document,
	read_document, read_file, read_image, read_picked_image, read_thumbnail, rename_board,
	rename_linked_document, reply_to_comment_thread, resolve, root, save, save_bytes, save_message,
	set_comment_thread_state, summarise_board, templates, ClipboardPayload, Said,
};
use crate::agent::commands::cancel_session_turn;
use crate::agent::contract::CancelOutcome;
use crate::agent::AgentState;
use crate::conversations::host_turn::merged;
use crate::db;
use crate::db::repositories::library::ThreadOfItem;
use crate::hosting::authorship::Caller;
use crate::joined_spaces::relay::RelayGuests;
use crate::logging::scrub::scrubbed;

async fn known_space<'a>(
	state: &'a db::DatabaseState,
	space_id: &str,
) -> Result<&'a db::Database, LibraryError> {
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	let spaces = database.spaces().list().await?;
	if !spaces.iter().any(|space| space.id == space_id) {
		return Err(LibraryError::UnknownSpace { id: space_id.to_owned() });
	}
	Ok(database)
}

#[tauri::command]
#[specta::specta]
pub async fn library_list<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<LibraryItem>, LibraryError> {
	known_space(&state, &space_id).await?;
	list(&root(&app)?, &space_id)
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_document<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryDocument, LibraryError> {
	known_space(&state, &space_id).await?;
	read_document(&root(&app)?, &space_id, &name)
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_image<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryImage, LibraryError> {
	known_space(&state, &space_id).await?;
	read_image(&root(&app)?, &space_id, &name)
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_file<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryFile, LibraryError> {
	known_space(&state, &space_id).await?;
	read_file(&root(&app)?, &space_id, &name)
}

#[tauri::command]
#[specta::specta]
pub fn library_templates() -> Vec<LibraryTemplate> {
	templates::listed()
}

#[tauri::command]
#[specta::specta]
pub async fn library_create_document<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	template_id: Option<String>,
) -> Result<LibraryItem, LibraryError> {
	known_space(&state, &space_id).await?;
	create_document(&root(&app)?, &space_id, &name, template_id.as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn library_create_board<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryItem, LibraryError> {
	known_space(&state, &space_id).await?;
	create_board(&root(&app)?, &space_id, &name)
}

#[tauri::command]
#[specta::specta]
pub async fn library_board_summary<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryBoardSummary, LibraryError> {
	known_space(&state, &space_id).await?;
	summarise_board(&root(&app)?, &space_id, &name)
}

#[tauri::command]
#[specta::specta]
pub async fn library_open_document<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryDocumentState, LibraryError> {
	known_space(&state, &space_id).await?;
	open_document(&app, &root(&app)?, &space_id, &name)
}

#[tauri::command]
#[specta::specta]
pub async fn library_apply_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	update: String,
) -> Result<(), LibraryError> {
	known_space(&state, &space_id).await?;
	apply_update(&app, &root(&app)?, &space_id, &name, &update)
}

#[tauri::command]
#[specta::specta]
pub async fn library_rename_document<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	new_name: String,
) -> Result<LibraryItem, LibraryError> {
	known_space(&state, &space_id).await?;
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	rename_linked_document(&app, database, &root(&app)?, &space_id, &name, &new_name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_rename_board<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	new_name: String,
) -> Result<LibraryItem, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	rename_board(&app, database, &root(&app)?, &space_id, &name, &new_name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_save_message<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	conversation_id: String,
	message_id: String,
) -> Result<LibraryItem, LibraryError> {
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	save_message(&app, database, &conversation_id, &message_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_delete<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	let database = known_space(&state, &space_id).await?;
	delete_item(&app, database, &root(&app)?, &space_id, &name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_comment_threads<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<Vec<LibraryCommentThread>, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	comment_threads(&app, database, &root(&app)?, &space_id, &name).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_comment_counts(
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<LibraryCommentCount>, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	Ok(database.library().open_thread_counts(space_id).await?)
}

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn library_comment_create<R: Runtime>(
	app: AppHandle<R>,
	caller: Caller,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	anchor: LibraryCommentAnchor,
	text: String,
	mentions: Vec<LibraryCommentParty>,
) -> Result<LibraryCommentThread, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	let said = Said::by_the_person_calling(&caller, &app, text, mentions)?;
	open_comment_thread(&app, database, &root(&app)?, &space_id, &name, anchor, said).await
}

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn library_comment_reply<R: Runtime>(
	app: AppHandle<R>,
	caller: Caller,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	thread_id: String,
	text: String,
	mentions: Vec<LibraryCommentParty>,
) -> Result<LibraryCommentThread, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	let said = Said::by_the_person_calling(&caller, &app, text, mentions)?;
	let thread = ThreadOfItem { space_id, item_name: name, id: thread_id };
	reply_to_comment_thread(&app, database, &root(&app)?, thread, said).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_comment_resolve<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	thread_id: String,
) -> Result<LibraryCommentThread, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	let thread = ThreadOfItem { space_id, item_name: name, id: thread_id };
	let resolved = LibraryCommentThreadState::Resolved;
	set_comment_thread_state(&app, database, &root(&app)?, thread, resolved).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_comment_reopen<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	thread_id: String,
) -> Result<LibraryCommentThread, LibraryError> {
	let database = known_space(&state, &space_id).await?;
	let thread = ThreadOfItem { space_id, item_name: name, id: thread_id };
	let open = LibraryCommentThreadState::Open;
	set_comment_thread_state(&app, database, &root(&app)?, thread, open).await
}

#[tauri::command]
#[specta::specta]
pub async fn library_share_presence<R: Runtime>(
	app: AppHandle<R>,
	webview: Webview<R>,
	caller: Caller,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	at: Option<LibraryPresenceAt>,
) -> Result<(), LibraryError> {
	known_space(&state, &space_id).await?;
	let seat = seat_of(&caller, &webview)?;
	let Some(at) = at else {
		unseat_writer(&app, &space_id, &name, &seat);
		return Ok(());
	};
	let identity = match seated_identity(&app, &space_id, &name, &seat) {
		Some(seated) => seated,
		None => {
			let database = state
				.as_ref()
				.map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
			Identity::of_person(caller.author(&app, database).await?, &seat)
		}
	};
	share_presence(&app, &root(&app)?, &space_id, &name, seat, identity, at)
}

#[tauri::command]
#[specta::specta]
pub async fn library_stop_writers<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	agent: State<'_, AgentState>,
	space_id: String,
	name: String,
	agent_id: Option<String>,
) -> Result<CancelOutcome, LibraryError> {
	known_space(&state, &space_id).await?;
	let stopped = stop_writers(&app, &space_id, &name, agent_id.as_deref()).await;
	if stopped.is_empty() {
		return Ok(CancelOutcome::NothingToCancel);
	}
	let mut outcomes =
		join_all(stopped.iter().map(|scope| cancel_session_turn(&app, &agent, scope))).await;
	outcomes.push(CancelOutcome::Cancelled);
	Ok(merged(outcomes))
}

fn seat_of<R: Runtime>(caller: &Caller, webview: &Webview<R>) -> Result<Seat, LibraryError> {
	match caller {
		Caller::Host => Ok(Seat::Window(webview.window().label().to_owned())),
		Caller::Relayed(_) => caller
			.relayed_account()
			.map(|account| Seat::Member(account.to_owned()))
			.ok_or_else(|| LibraryError::Unreadable {
				detail: "the member sending this presence is not vouched for".to_owned(),
			}),
	}
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_thumbnail<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<LibraryImage, LibraryError> {
	known_space(&state, &space_id).await?;
	let root = root(&app)?;
	tokio::task::spawn_blocking(move || read_thumbnail(&root, &space_id, &name))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })?
}

#[tauri::command]
#[specta::specta]
pub async fn library_import<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	content: String,
) -> Result<LibraryItem, LibraryError> {
	known_space(&state, &space_id).await?;
	let root = root(&app)?;
	tokio::task::spawn_blocking(move || import(&root, &space_id, &name, &content))
		.await
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })?
}

#[tauri::command]
#[specta::specta]
pub async fn library_import_url<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	guests: State<'_, RelayGuests>,
	caller: Caller,
	space_id: String,
	url: String,
) -> Result<LibraryItem, LibraryImportUrlError> {
	let imported = async {
		known_space(&state, &space_id).await?;
		let proxy_bearers = guests.proxy_bearers();
		import_url(root(&app)?, space_id, &url, &admission_for(&caller, &proxy_bearers)).await
	};
	imported.await.inspect_err(|refusal| {
		let parsed = Url::parse(&url).ok();
		let host = parsed.as_ref().and_then(Url::host_str).unwrap_or("none");
		log::warn!("a library import from a url was refused: kind={} host={host}", refusal.kind());
	})
}

#[tauri::command]
#[specta::specta]
pub async fn library_import_paths<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	paths: Vec<PathBuf>,
) -> Result<Vec<LibraryImport>, LibraryError> {
	known_space(&state, &space_id).await?;
	let root = root(&app)?;
	tokio::task::spawn_blocking(move || import_paths(&root, &space_id, &paths))
		.await
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn library_read_picked_image(path: PathBuf) -> Result<LibraryImage, LibraryError> {
	tokio::task::spawn_blocking(move || read_picked_image(&path))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })?
}

#[tauri::command]
#[specta::specta]
pub async fn library_save<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<Option<String>, LibraryError> {
	known_space(&state, &space_id).await?;
	let saved = save(&root(&app)?, &space_id, &name, |suggested| {
		chosen_destination(&app, suggested.to_owned())
	})
	.await?;
	Ok(saved.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
#[specta::specta]
pub async fn library_copy<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	known_space(&state, &space_id).await?;
	let root = root(&app)?;
	let payload = tokio::task::spawn_blocking(move || clipboard_payload(&root, &space_id, &name))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })??;
	put_on_clipboard(&app, payload)
}

#[tauri::command]
#[specta::specta]
pub async fn library_save_bytes<R: Runtime>(
	app: AppHandle<R>,
	name: String,
	content: String,
) -> Result<Option<String>, LibraryError> {
	let saved =
		save_bytes(&name, &content, |suggested| chosen_destination(&app, suggested.to_owned()))
			.await?;
	Ok(saved.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
#[specta::specta]
pub async fn library_copy_bytes<R: Runtime>(
	app: AppHandle<R>,
	name: String,
	content: String,
) -> Result<(), LibraryError> {
	let payload = tokio::task::spawn_blocking(move || clipboard_payload_of_bytes(&name, &content))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })??;
	put_on_clipboard(&app, payload)
}

#[tauri::command]
#[specta::specta]
pub async fn library_reveal<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	known_space(&state, &space_id).await?;
	let item = resolve(&root(&app)?, &space_id, &name)?;
	app.opener()
		.reveal_item_in_dir(&item.path)
		.map_err(|error| LibraryError::Unrevealed { detail: scrubbed(&error.to_string()) })
}

async fn chosen_destination<R: Runtime>(
	app: &AppHandle<R>,
	suggested: String,
) -> Result<Option<PathBuf>, LibraryError> {
	let (answer, answered) = oneshot::channel();
	app.dialog().file().set_file_name(suggested).save_file(move |chosen| {
		if answer.send(chosen).is_err() {
			log::warn!("a library save dialog answered after its command was dropped");
		}
	});
	let chosen = answered.await.map_err(|_| LibraryError::Unwritable {
		detail: "the save dialog closed without an answer".to_owned(),
	})?;
	chosen
		.map(|path| {
			path.into_path().map_err(|error| LibraryError::Unwritable { detail: error.to_string() })
		})
		.transpose()
}

fn put_on_clipboard<R: Runtime>(
	app: &AppHandle<R>,
	payload: ClipboardPayload,
) -> Result<(), LibraryError> {
	let clipboard = app.clipboard();
	let written = match payload {
		ClipboardPayload::Text(text) => clipboard.write_text(text),
		ClipboardPayload::Image { rgba, width, height } => {
			clipboard.write_image(&Image::new_owned(rgba, width, height))
		}
	};
	written.map_err(|error| LibraryError::ClipboardRefused { detail: error.to_string() })
}
