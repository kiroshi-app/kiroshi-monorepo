use std::path::PathBuf;

use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use super::contract::SaveCsvError;
use super::{answered_destination, save_csv, EXTENSION, FILTER_LABEL};

#[tauri::command]
#[specta::specta]
pub async fn save_csv_file<R: Runtime>(
	app: AppHandle<R>,
	name: String,
	text: String,
) -> Result<Option<String>, SaveCsvError> {
	let saved =
		save_csv(&name, text, |suggested| chosen_destination(&app, suggested.to_owned())).await?;
	Ok(saved.map(|path| path.to_string_lossy().into_owned()))
}

async fn chosen_destination<R: Runtime>(
	app: &AppHandle<R>,
	suggested: String,
) -> Result<Option<PathBuf>, SaveCsvError> {
	let (answer, answered) = oneshot::channel();
	app.dialog().file().set_file_name(suggested).add_filter(FILTER_LABEL, &[EXTENSION]).save_file(
		move |chosen| {
			if answer.send(chosen).is_err() {
				log::warn!("a csv save dialog answered after its command was dropped");
			}
		},
	);
	answered_destination(answered).await
}
