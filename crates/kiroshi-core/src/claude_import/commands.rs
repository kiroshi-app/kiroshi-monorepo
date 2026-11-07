use std::path::PathBuf;

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

pub async fn claude_import_inventory(
	core: &crate::core_context::Core,
) -> Result<ClaudeInventory, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let imported = ready(&state)?.user().claude_imported().await?;
	Ok(match claude_root() {
		Some(root) => inventory(&root, &imported),
		None => ClaudeInventory::Refused { cause: NO_HOME.to_owned() },
	})
}

pub async fn claude_import_run(
	core: &crate::core_context::Core,
	selection: Vec<String>,
	space_id: String,
) -> Result<Vec<ClaudeImportOutcome>, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let root = claude_root().ok_or_else(|| TranscriptStoreError::UnreadableSources {
		path: format!("~/{CLAUDE_DIR}"),
		reason: NO_HOME.to_owned(),
	})?;
	let person = bundles::user::laid_down(core);
	let importer = Importer {
		core,
		database: ready(&state)?,
		root: &root,
		person: person.as_deref(),
		space_id: &space_id,
	};
	importer.run(selection).await
}
