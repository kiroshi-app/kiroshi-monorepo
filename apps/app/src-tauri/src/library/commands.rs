use std::path::PathBuf;

use tauri::image::Image;
use tauri::{AppHandle, Runtime, State, Webview};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use super::contract::{
	LibraryDocument, LibraryDocumentState, LibraryError, LibraryFile, LibraryImage, LibraryImport,
	LibraryItem, LibraryTemplate,
};
use super::presence::{seated_name, share_caret, unseat_writer, Seat};
use super::{
	apply_update, clipboard_payload, clipboard_payload_of_bytes, create_document, import,
	import_paths, list, open_document, read_document, read_file, read_image, read_thumbnail,
	rename_document, resolve, root, save, save_bytes, templates, ClipboardPayload,
};
use crate::db;
use crate::hosting::authorship::Caller;
use crate::logging::scrub::scrubbed;

async fn known_space(state: &db::DatabaseState, space_id: &str) -> Result<(), LibraryError> {
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	let spaces = database.spaces().list().await?;
	if !spaces.iter().any(|space| space.id == space_id) {
		return Err(LibraryError::UnknownSpace { id: space_id.to_owned() });
	}
	Ok(())
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
	rename_document(&app, &root(&app)?, &space_id, &name, &new_name)
}

#[tauri::command]
#[specta::specta]
pub async fn library_share_caret<R: Runtime>(
	app: AppHandle<R>,
	webview: Webview<R>,
	caller: Caller,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	name: String,
	caret: Option<String>,
) -> Result<(), LibraryError> {
	known_space(&state, &space_id).await?;
	let seat = seat_of(&caller, &webview)?;
	let Some(caret) = caret else {
		unseat_writer(&app, &space_id, &name, &seat);
		return Ok(());
	};
	let writer_name = match seated_name(&app, &space_id, &name, &seat) {
		Some(seated) => seated,
		None => {
			let database = state
				.as_ref()
				.map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
			caller.author(&app, database).await?.name
		}
	};
	share_caret(&app, &root(&app)?, &space_id, &name, seat, writer_name, &caret)
}

fn seat_of<R: Runtime>(caller: &Caller, webview: &Webview<R>) -> Result<Seat, LibraryError> {
	match caller {
		Caller::Host => Ok(Seat::Window(webview.window().label().to_owned())),
		Caller::Relayed(_) => caller
			.relayed_account()
			.map(|account| Seat::Member(account.to_owned()))
			.ok_or_else(|| LibraryError::Unreadable {
				detail: "the member sending this caret is not vouched for".to_owned(),
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
