use serde::Serialize;

pub const PROGRESS_EVENT: &str = "claude-import://progress";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ClaudeInventory {
	Absent,
	Refused {
		cause: String,
	},
	#[serde(rename_all = "camelCase")]
	Found {
		agents: Vec<ClaudeItem>,
		skills: Vec<ClaudeItem>,
		claude_md: Option<ClaudeItem>,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeItem {
	pub key: String,
	pub name: String,
	pub description: String,
	pub already_imported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ClaudeImportResult {
	Imported { id: String, name: String },
	Skipped { reason: ClaudeImportSkip },
	Failed { cause: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ClaudeImportSkip {
	AlreadyImported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeImportOutcome {
	pub key: String,
	pub result: ClaudeImportResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeImportProgress {
	pub key: String,
	pub result: ClaudeImportResult,
	pub done: usize,
	pub total: usize,
}
