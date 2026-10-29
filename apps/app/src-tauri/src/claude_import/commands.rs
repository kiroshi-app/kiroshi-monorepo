use std::path::PathBuf;

use tauri::{AppHandle, Runtime, State};

use super::contract::{ClaudeImportOutcome, ClaudeInventory};
use super::import::Importer;
use super::inventory::inventory;
use crate::agent::redact::home_dir;
use crate::bundles;
use crate::conversations::commands::ready;
use crate::conversations::contract::TranscriptStoreError;
use crate::db;

const CLAUDE_DIR: &str = ".claude";
const NO_HOME: &str = "the home directory is unknown";

fn claude_root() -> Option<PathBuf> {
	home_dir().map(|home| home.join(CLAUDE_DIR))
}

#[tauri::command]
#[specta::specta]
pub async fn claude_import_inventory(
	state: State<'_, db::DatabaseState>,
) -> Result<ClaudeInventory, TranscriptStoreError> {
	let imported = ready(&state)?.user().claude_imported().await?;
	Ok(match claude_root() {
		Some(root) => inventory(&root, &imported),
		None => ClaudeInventory::Refused { cause: NO_HOME.to_owned() },
	})
}

#[tauri::command]
#[specta::specta]
pub async fn claude_import_run<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	selection: Vec<String>,
	space_id: String,
) -> Result<Vec<ClaudeImportOutcome>, TranscriptStoreError> {
	let root = claude_root().ok_or_else(|| TranscriptStoreError::UnreadableSources {
		path: format!("~/{CLAUDE_DIR}"),
		reason: NO_HOME.to_owned(),
	})?;
	let person = bundles::user::laid_down(&app);
	let importer = Importer {
		app: &app,
		database: ready(&state)?,
		root: &root,
		person: person.as_deref(),
		space_id: &space_id,
	};
	importer.run(selection).await
}
