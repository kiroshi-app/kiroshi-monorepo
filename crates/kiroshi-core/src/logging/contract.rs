use serde::Serialize;

use crate::account::contract::AccountPlan;
use crate::agent::contract::TransportError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
	pub app_version: String,
	pub git_commit: String,
	pub install_kind: InstallKind,
	pub os_name: String,
	pub os_build: String,
	pub arch: String,
	pub ram_bytes: Option<u64>,
	pub agent_version: Option<String>,
	pub provider: Option<String>,
	pub agent_error: Option<TransportError>,
	pub side: Side,
	pub plan: Option<AccountPlan>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum InstallKind {
	Dev,
	Installed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Side {
	Host,
	Member,
	Local,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LogFileError {
	Unresolved,
	#[serde(rename_all = "camelCase")]
	Unreadable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unwritable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unrevealed {
		detail: String,
	},
}
