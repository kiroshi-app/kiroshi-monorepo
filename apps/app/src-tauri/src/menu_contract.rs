use serde::Serialize;

pub use kiroshi_core::desktop_events::FILE_MENU_EVENT;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub enum FileMenuAction {
	NewTab,
	NewWindow,
	ReopenClosedTab,
	CloseTab,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub struct FileMenuChosen {
	pub action: FileMenuAction,
}
