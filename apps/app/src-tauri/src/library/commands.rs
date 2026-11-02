use tauri::{AppHandle, Runtime, State};

use super::contract::{LibraryDocument, LibraryError, LibraryItem};
use super::{list, read_document, root};
use crate::db;

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
