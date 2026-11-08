use kiroshi_core::applications::contract::Application;
use kiroshi_core::conversations::contract::McpServer;
use kiroshi_rune_kit::surfaces::s11_applications::panel::{Connection, ConnectionReason};
use rune::TextEdit;

use super::Reading;
use super::calls::StatusRow;

pub struct Installed {
	pub servers: Vec<McpServer>,
	pub read: Reading,
	pub status: Vec<StatusRow>,
	pub query: TextEdit,
}

impl Default for Installed {
	fn default() -> Installed {
		Installed {
			servers: Vec::new(),
			read: Reading::Pending,
			status: Vec::new(),
			query: TextEdit::new(""),
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConnectFailure {
	pub name: String,
	pub kind: Option<String>,
	pub detail: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
	pub name: String,
	pub display_name: Option<String>,
	pub connection: Option<Connection>,
	pub reason: Option<ConnectionReason>,
}

pub fn connection_reason(failure: &ConnectFailure) -> ConnectionReason {
	match failure.kind.as_deref() {
		None => ConnectionReason::Unknown(failure.detail.clone()),
		Some("alreadyRunning") => ConnectionReason::AlreadyRunning,
		Some("store") => ConnectionReason::Store,
		Some("transport") => ConnectionReason::Transport,
		Some("refusedUrl") => ConnectionReason::RefusedUrl,
		Some("browserRefused") => ConnectionReason::BrowserRefused,
		Some("timedOut" | "flowTimedOut") => ConnectionReason::TimedOut,
		Some(kind) if failure.detail.trim().is_empty() => {
			ConnectionReason::Unknown(kind.to_owned())
		}
		Some(_) => ConnectionReason::Unknown(failure.detail.clone()),
	}
}

fn read_status(status: &str) -> Option<Connection> {
	match status {
		"connected" => Some(Connection::Connected),
		"needsAuthorization" => Some(Connection::NeedsAuthorization),
		"connecting" => Some(Connection::Connecting),
		"failed" => Some(Connection::Failed),
		_ => None,
	}
}

fn matches_query(row: &Row, needle: &str) -> bool {
	let shown = row.display_name.as_deref().unwrap_or_default().to_lowercase();
	needle.is_empty() || row.name.to_lowercase().contains(needle) || shown.contains(needle)
}

impl Installed {
	pub fn is_loading(&self) -> bool {
		self.read == Reading::Pending && self.servers.is_empty()
	}

	pub fn has_failed(&self) -> bool {
		self.read == Reading::Failed
	}

	pub fn declares(&self, name: &str) -> bool {
		self.servers.iter().any(|server| server.name == name)
	}

	pub fn url_of(&self, name: &str) -> Option<String> {
		let server = self.servers.iter().find(|server| server.name == name)?;
		Some(super::calls::url_of(&server.config))
	}

	fn connection_of(
		&self,
		name: &str,
		connecting: Option<&str>,
		failure: Option<&ConnectFailure>,
	) -> (Option<Connection>, Option<ConnectionReason>) {
		if connecting == Some(name) {
			return (Some(Connection::Connecting), None);
		}
		if let Some(failure) = failure.filter(|failure| failure.name == name) {
			return (Some(Connection::Failed), Some(connection_reason(failure)));
		}
		let status = self.status.iter().find(|row| row.name == name);
		(status.and_then(|row| read_status(&row.status)), None)
	}

	pub fn rows(
		&self,
		curated: &[Application],
		connecting: Option<&str>,
		failure: Option<&ConnectFailure>,
	) -> Vec<Row> {
		let needle = self.query.text.trim().to_lowercase();
		self.servers
			.iter()
			.map(|server| {
				let known = curated.iter().find(|held| held.name == server.name);
				let display_name = server
					.mark
					.title
					.clone()
					.or_else(|| known.map(|application| application.title.clone()));
				let (connection, reason) = self.connection_of(&server.name, connecting, failure);
				Row { name: server.name.clone(), display_name, connection, reason }
			})
			.filter(|row| matches_query(row, &needle))
			.collect()
	}
}
