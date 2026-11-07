use std::path::PathBuf;

use reqwest::Url;

use futures_util::future::join_all;

use super::contract::{
	LibraryBoardSummary, LibraryDocument, LibraryDocumentState, LibraryError, LibraryFile,
	LibraryImage, LibraryImport, LibraryImportUrlError, LibraryItem, LibraryPresenceAt,
	LibraryTemplate,
};
use super::host::stop_writers;
use super::presence::{seated_identity, share_presence, unseat_writer, Identity, Seat};
use super::url_import::{admission_for, import_url};
use super::{
	apply_update, clipboard_payload, clipboard_payload_of_bytes, create_board, create_document,
	delete_item, import, import_paths, list, open_document, read_document, read_file, read_image,
	read_picked_image, read_thumbnail, rename_board, rename_linked_document, resolve, root, save,
	save_bytes, save_message, summarise_board, templates, ClipboardPayload,
};
use crate::agent::commands::cancel_session_turn;
use crate::agent::contract::CancelOutcome;
use crate::agent::AgentState;
use crate::conversations::host_turn::merged;
use crate::db;
use crate::hosting::authors;
use crate::hosting::caller::Caller;
use crate::joined_spaces::relay::RelayGuests;
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

pub async fn library_list(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<Vec<LibraryItem>, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	list(&root(core)?, &space_id)
}

pub async fn library_read_document(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryDocument, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	read_document(&root(core)?, &space_id, &name)
}

pub async fn library_read_image(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryImage, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	read_image(&root(core)?, &space_id, &name)
}

pub async fn library_read_file(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryFile, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	read_file(&root(core)?, &space_id, &name)
}

pub fn library_templates() -> Vec<LibraryTemplate> {
	templates::listed()
}

pub async fn library_create_document(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
	template_id: Option<String>,
) -> Result<LibraryItem, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	create_document(&root(core)?, &space_id, &name, template_id.as_deref())
}

pub async fn library_create_board(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryItem, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	create_board(&root(core)?, &space_id, &name)
}

pub async fn library_board_summary(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryBoardSummary, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	summarise_board(&root(core)?, &space_id, &name)
}

pub async fn library_open_document(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryDocumentState, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	open_document(core, &root(core)?, &space_id, &name)
}

pub async fn library_apply_update(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
	update: String,
) -> Result<(), LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	apply_update(core, &root(core)?, &space_id, &name, &update)
}

pub async fn library_rename_document(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
	new_name: String,
) -> Result<LibraryItem, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	rename_linked_document(core, database, &root(core)?, &space_id, &name, &new_name).await
}

pub async fn library_rename_board(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
	new_name: String,
) -> Result<LibraryItem, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	rename_board(core, &root(core)?, &space_id, &name, &new_name)
}

pub async fn library_save_message(
	core: &crate::core_context::Core,
	conversation_id: String,
	message_id: String,
) -> Result<LibraryItem, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	save_message(core, database, &conversation_id, &message_id).await
}

pub async fn library_delete(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	delete_item(core, &root(core)?, &space_id, &name)
}

pub async fn library_share_presence(
	core: &crate::core_context::Core,
	client: &crate::core_context::ClientId,
	caller: crate::hosting::caller::Caller,
	space_id: String,
	name: String,
	at: Option<LibraryPresenceAt>,
) -> Result<(), LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let seat = seat_of(&caller, client)?;
	let Some(at) = at else {
		unseat_writer(core, &space_id, &name, &seat);
		return Ok(());
	};
	let identity = match seated_identity(core, &space_id, &name, &seat) {
		Some(seated) => seated,
		None => {
			let database = state
				.as_ref()
				.map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
			Identity::of_person(authors::author(caller, core, database).await?, &seat)
		}
	};
	share_presence(core, &root(core)?, &space_id, &name, seat, identity, at)
}

pub async fn library_stop_writers(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
	agent_id: Option<String>,
) -> Result<CancelOutcome, LibraryError> {
	let agent = core.state::<AgentState>();
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let stopped = stop_writers(core, &space_id, &name, agent_id.as_deref()).await;
	if stopped.is_empty() {
		return Ok(CancelOutcome::NothingToCancel);
	}
	let mut outcomes =
		join_all(stopped.iter().map(|scope| cancel_session_turn(core, &agent, scope))).await;
	outcomes.push(CancelOutcome::Cancelled);
	Ok(merged(outcomes))
}

fn seat_of(caller: &Caller, client: &crate::core_context::ClientId) -> Result<Seat, LibraryError> {
	match caller {
		Caller::Host => Ok(Seat::Window(client.as_str().to_owned())),
		Caller::Relayed(_) => caller
			.relayed_account()
			.map(|account| Seat::Member(account.to_owned()))
			.ok_or_else(|| LibraryError::Unreadable {
				detail: "the member sending this presence is not vouched for".to_owned(),
			}),
	}
}

pub async fn library_read_thumbnail(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<LibraryImage, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let root = root(core)?;
	tokio::task::spawn_blocking(move || read_thumbnail(&root, &space_id, &name))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })?
}

pub async fn library_import(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
	content: String,
) -> Result<LibraryItem, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let root = root(core)?;
	tokio::task::spawn_blocking(move || import(&root, &space_id, &name, &content))
		.await
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })?
}

pub async fn library_import_url(
	core: &crate::core_context::Core,
	caller: crate::hosting::caller::Caller,
	space_id: String,
	url: String,
) -> Result<LibraryItem, LibraryImportUrlError> {
	let guests = core.state::<RelayGuests>();
	let state = core.state::<db::DatabaseState>();
	let imported = async {
		known_space(&state, &space_id).await?;
		let proxy_bearers = guests.proxy_bearers();
		import_url(root(core)?, space_id, &url, &admission_for(&caller, &proxy_bearers)).await
	};
	imported.await.inspect_err(|refusal| {
		let parsed = Url::parse(&url).ok();
		let host = parsed.as_ref().and_then(Url::host_str).unwrap_or("none");
		log::warn!("a library import from a url was refused: kind={} host={host}", refusal.kind());
	})
}

pub async fn library_import_paths(
	core: &crate::core_context::Core,
	space_id: String,
	paths: Vec<PathBuf>,
) -> Result<Vec<LibraryImport>, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let root = root(core)?;
	tokio::task::spawn_blocking(move || import_paths(&root, &space_id, &paths))
		.await
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })
}

pub async fn library_read_picked_image(path: PathBuf) -> Result<LibraryImage, LibraryError> {
	tokio::task::spawn_blocking(move || read_picked_image(&path))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })?
}

pub async fn library_save(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<Option<String>, LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let saved = save(&root(core)?, &space_id, &name, |suggested| {
		chosen_destination(core, suggested.to_owned())
	})
	.await?;
	Ok(saved.map(|path| path.to_string_lossy().into_owned()))
}

pub async fn library_copy(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let root = root(core)?;
	let payload = tokio::task::spawn_blocking(move || clipboard_payload(&root, &space_id, &name))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })??;
	put_on_clipboard(core, payload)
}

pub async fn library_save_bytes(
	core: &crate::core_context::Core,
	name: String,
	content: String,
) -> Result<Option<String>, LibraryError> {
	let saved =
		save_bytes(&name, &content, |suggested| chosen_destination(core, suggested.to_owned()))
			.await?;
	Ok(saved.map(|path| path.to_string_lossy().into_owned()))
}

pub async fn library_copy_bytes(
	core: &crate::core_context::Core,
	name: String,
	content: String,
) -> Result<(), LibraryError> {
	let payload = tokio::task::spawn_blocking(move || clipboard_payload_of_bytes(&name, &content))
		.await
		.map_err(|error| LibraryError::Unreadable { detail: error.to_string() })??;
	put_on_clipboard(core, payload)
}

pub async fn library_reveal(
	core: &crate::core_context::Core,
	space_id: String,
	name: String,
) -> Result<(), LibraryError> {
	let state = core.state::<db::DatabaseState>();
	known_space(&state, &space_id).await?;
	let item = resolve(&root(core)?, &space_id, &name)?;
	core.reveal(&item.path)
		.map_err(|error| LibraryError::Unrevealed { detail: scrubbed(&error.to_string()) })
}

async fn chosen_destination(
	core: &crate::core_context::Core,
	suggested: String,
) -> Result<Option<PathBuf>, LibraryError> {
	core.chosen_save_path(suggested)
		.await
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })
}

fn put_on_clipboard(
	core: &crate::core_context::Core,
	payload: ClipboardPayload,
) -> Result<(), LibraryError> {
	core.copy(payload).map_err(|error| LibraryError::ClipboardRefused { detail: error.to_string() })
}
