pub use kiroshi_core::companions::launch::*;

use crate::companions::contract::LaunchOutcome;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn companion_launch_outcome(core: State<'_, crate::core_context::Core>) -> LaunchOutcome {
	launch_outcome(core.inner())
}
