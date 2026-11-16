pub mod commands;
pub mod contract;
#[cfg(test)]
mod tests;

use std::fs;
use std::future::Future;
use std::path::PathBuf;

use tauri_plugin_dialog::FilePath;
use tokio::sync::oneshot;

use contract::SaveCsvError;

const FILTER_LABEL: &str = "CSV";
const EXTENSION: &str = "csv";

async fn save_csv<Choose, Chosen>(
	name: &str,
	text: String,
	choose_destination: Choose,
) -> Result<Option<PathBuf>, SaveCsvError>
where
	Choose: FnOnce(&str) -> Chosen,
	Chosen: Future<Output = Result<Option<PathBuf>, SaveCsvError>>,
{
	accepted_name(name)?;
	let Some(destination) = choose_destination(name).await? else {
		return Ok(None);
	};
	let target = destination.clone();
	tokio::task::spawn_blocking(move || fs::write(target, text))
		.await
		.map_err(unwritable)?
		.map_err(unwritable)?;
	Ok(Some(destination))
}

fn accepted_name(name: &str) -> Result<(), SaveCsvError> {
	let is_csv = name.to_ascii_lowercase().ends_with(&format!(".{EXTENSION}"));
	if is_csv && !name.contains(['/', '\\']) {
		return Ok(());
	}
	Err(SaveCsvError::InvalidName { name: name.to_owned() })
}

async fn answered_destination(
	answered: oneshot::Receiver<Option<FilePath>>,
) -> Result<Option<PathBuf>, SaveCsvError> {
	let chosen = answered.await.map_err(|_| SaveCsvError::Unwritable {
		detail: "the save dialog closed without an answer".to_owned(),
	})?;
	chosen.map(|path| path.into_path().map_err(unwritable)).transpose()
}

fn unwritable(error: impl ToString) -> SaveCsvError {
	SaveCsvError::Unwritable { detail: error.to_string() }
}
