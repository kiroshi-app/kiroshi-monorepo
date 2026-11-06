use std::path::PathBuf;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::discovery;

const DEV_IDENTIFIER: &str = "com.kiroshi.app.dev";

const PREFERRED_PORT: u16 = 45_367;

const PORT_OVERRIDE: &str = "KIROSHI_HOST_PORT";

const READ_PATIENCE: Duration = Duration::from_secs(20);

const TURN_PATIENCE: Duration = Duration::from_secs(15 * 60);

const PROBE: &str = "space_list";

pub const START_COMMAND: &str = "cd apps/app && bun run dev";

#[derive(Clone, Debug)]
pub enum HostError {
	NoDataDir,
	TokenMissing,
	TokenUnreadable { cause: String },
	NotRunning { port: u16 },
	TokenRefused { port: u16 },
	CommandFailed { command: String, status: u16, body: String },
	Unreadable { command: String, cause: String },
}

impl HostError {
	pub fn title(&self) -> &'static str {
		match self {
			HostError::NoDataDir => "Couldn't find the dev data folder",
			HostError::TokenMissing => "Kiroshi Dev hasn't run on this computer",
			HostError::TokenUnreadable { .. } => "Couldn't read the dev host token",
			HostError::NotRunning { .. } => "Kiroshi Dev isn't running",
			HostError::TokenRefused { .. } => "Kiroshi Dev refused the token",
			HostError::CommandFailed { .. } => "Kiroshi Dev refused the call",
			HostError::Unreadable { .. } => "Kiroshi Dev answered something unreadable",
		}
	}

	pub fn detail(&self) -> String {
		match self {
			HostError::NoDataDir => {
				"Neither HOME nor APPDATA is set, so the dev data folder has no path.".to_owned()
			}
			HostError::TokenMissing => format!(
				"No host/token in the {DEV_IDENTIFIER} data folder. The dev host writes it when it starts."
			),
			HostError::TokenUnreadable { cause } => {
				format!("host/token in the {DEV_IDENTIFIER} data folder: {cause}")
			}
			HostError::NotRunning { port } => format!("Nothing answers on 127.0.0.1:{port}."),
			HostError::TokenRefused { port } => format!(
				"127.0.0.1:{port} answered but refused the dev token. No other dev host was found; if the installed Kiroshi holds that port, set {PORT_OVERRIDE} to the dev host's port."
			),
			HostError::CommandFailed { command, status, body } => {
				format!("{command} answered {status}: {body}")
			}
			HostError::Unreadable { command, cause } => format!("{command}: {cause}"),
		}
	}
}

#[derive(Clone, Debug)]
pub struct Host {
	port: u16,
	token: String,
}

impl Host {
	pub fn detached() -> Host {
		Host { port: PREFERRED_PORT, token: String::new() }
	}

	pub fn connect() -> Result<Host, HostError> {
		let token = dev_token()?;
		let mut refused = None;
		for port in candidate_ports() {
			let host = Host { port, token: token.clone() };
			match host.invoke::<Value>(PROBE, json!({})) {
				Ok(_) => return Ok(host),
				Err(HostError::TokenRefused { port }) => refused = Some(port),
				Err(HostError::NotRunning { .. }) => {}
				Err(other) => return Err(other),
			}
		}
		Err(refused.map_or(HostError::NotRunning { port: PREFERRED_PORT }, |port| {
			HostError::TokenRefused { port }
		}))
	}

	pub fn invoke<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		self.invoke_within(command, arguments, READ_PATIENCE)
	}

	pub fn invoke_turn<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		self.invoke_within(command, arguments, TURN_PATIENCE)
	}

	pub fn events_url(&self) -> String {
		format!("ws://127.0.0.1:{}/api/events", self.port)
	}

	pub fn bearer(&self) -> String {
		format!("Bearer {}", self.token)
	}

	fn invoke_within<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
		patience: Duration,
	) -> Result<T, HostError> {
		let url = format!("http://127.0.0.1:{}/api/invoke/{command}", self.port);
		let answered = ureq::post(&url)
			.timeout(patience)
			.set("Authorization", &self.bearer())
			.set("Content-Type", "application/json")
			.send_string(&arguments.to_string());
		let response = match answered {
			Ok(response) => response,
			Err(ureq::Error::Status(401, _)) => {
				return Err(HostError::TokenRefused { port: self.port });
			}
			Err(ureq::Error::Status(status, response)) => {
				let body = response
					.into_string()
					.unwrap_or_else(|failure| format!("unreadable body: {failure}"));
				return Err(HostError::CommandFailed { command: command.to_owned(), status, body });
			}
			Err(ureq::Error::Transport(_)) => {
				return Err(HostError::NotRunning { port: self.port });
			}
		};
		let unreadable =
			|cause: String| HostError::Unreadable { command: command.to_owned(), cause };
		let body = response.into_string().map_err(|failure| unreadable(failure.to_string()))?;
		serde_json::from_str(&body).map_err(|failure| unreadable(failure.to_string()))
	}
}

fn candidate_ports() -> Vec<u16> {
	if let Some(port) = std::env::var(PORT_OVERRIDE).ok().and_then(|held| held.trim().parse().ok())
	{
		return vec![port];
	}
	match discovery::dev_host_ports() {
		Ok(ports) if !ports.is_empty() => ports,
		Ok(_) => vec![PREFERRED_PORT],
		Err(failure) => {
			eprintln!("no dev host port was discovered, trying {PREFERRED_PORT}: {failure}");
			vec![PREFERRED_PORT]
		}
	}
}

fn dev_token() -> Result<String, HostError> {
	let path = dev_data_dir()?.join("host").join("token");
	match std::fs::read_to_string(&path) {
		Ok(held) if held.trim().is_empty() => Err(HostError::TokenMissing),
		Ok(held) => Ok(held.trim().to_owned()),
		Err(missing) if missing.kind() == std::io::ErrorKind::NotFound => {
			Err(HostError::TokenMissing)
		}
		Err(failure) => Err(HostError::TokenUnreadable { cause: failure.kind().to_string() }),
	}
}

fn dev_data_dir() -> Result<PathBuf, HostError> {
	data_root().map(|root| root.join(DEV_IDENTIFIER)).ok_or(HostError::NoDataDir)
}

#[cfg(target_os = "macos")]
fn data_root() -> Option<PathBuf> {
	std::env::var_os("HOME")
		.map(|home| PathBuf::from(home).join("Library").join("Application Support"))
}

#[cfg(target_os = "windows")]
fn data_root() -> Option<PathBuf> {
	std::env::var_os("APPDATA").map(PathBuf::from)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn data_root() -> Option<PathBuf> {
	std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(|| {
		std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local").join("share"))
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_token_path_names_only_the_dev_profile() {
		let path = dev_data_dir().expect("a data root on the test machine");
		assert!(path.ends_with(DEV_IDENTIFIER));
		assert_ne!(path.file_name().and_then(|name| name.to_str()), Some("com.kiroshi.app"));
	}
}
