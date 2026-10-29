use serde::Serialize;

pub const FILE_MENU_EVENT: &str = "menu-file-chosen";

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
