use tauri::{AppHandle, Runtime};

#[tauri::command]
#[specta::specta]
pub fn badge_set<R: Runtime>(app: AppHandle<R>, count: u32) -> Result<(), String> {
	super::wear(&app, count)
		.inspect_err(|failure| eprintln!("the badge {count} was not set: {failure}"))
}
