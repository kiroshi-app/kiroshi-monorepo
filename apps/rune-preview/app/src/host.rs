use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::discovery;
use crate::local::platform_data_root;

const READ_PATIENCE: Duration = Duration::from_secs(20);

const TURN_PATIENCE: Duration = Duration::from_secs(15 * 60);

const PROBE: &str = "space_list";

const TOKEN_FILE: [&str; 2] = ["host", "token"];

const INSTALLED_READS: [&str; 10] = [
	"space_list",
	"conversation_bots",
	"conversation_page",
	"conversation_list",
	"conversation_message_page",
	"account_state",
	"mission_board",
	"mission_detail",
	"mission_list",
	"mission_space_feed",
];

static SENT: Mutex<Vec<(Profile, String)>> = Mutex::new(Vec::new());

pub fn sent_commands() -> Vec<(Profile, String)> {
	SENT.lock().unwrap_or_else(PoisonError::into_inner).clone()
}

pub fn is_read(command: &str) -> bool {
	INSTALLED_READS.contains(&command)
}

pub const DEV_START_COMMAND: &str = "cd apps/app/sidecar && bun run build && cd .. && bun run dev";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Profile {
	Dev,
	Installed,
}

impl Profile {
	pub fn identifier(self) -> &'static str {
		match self {
			Profile::Dev => "com.kiroshi.app.dev",
			Profile::Installed => "com.kiroshi.app",
		}
	}

	pub fn app_name(self) -> &'static str {
		match self {
			Profile::Dev => "Kiroshi Dev",
			Profile::Installed => "Kiroshi",
		}
	}

	pub fn hosts(self, executable: &str) -> bool {
		let name = executable.rsplit('/').next().unwrap_or("");
		let bundled = executable.ends_with(".app/Contents/MacOS/Kiroshi");
		let dev_bundle = executable.ends_with("Kiroshi Dev.app/Contents/MacOS/Kiroshi");
		name == "Kiroshi"
			&& match self {
				Profile::Dev => dev_bundle || !bundled,
				Profile::Installed => bundled && !dev_bundle,
			}
	}

	pub fn how_to_start(self) -> &'static str {
		match self {
			Profile::Dev => "Start the dev host from the repo root, then try again.",
			Profile::Installed => "Open Kiroshi from your Applications folder, then try again.",
		}
	}
}

#[derive(Clone, Debug)]
pub enum HostError {
	NoDataDir,
	TokenMissing { profile: Profile },
	TokenUnreadable { profile: Profile, cause: String },
	NotRunning { profile: Profile },
	NotDiscovered { cause: String },
	TokenRefused { profile: Profile },
	CommandFailed { command: String, status: u16, body: String },
	Unreadable { command: String, cause: String },
	WriteRefused { command: String },
	InProcess { cause: String },
}

impl HostError {
	pub fn title(&self) -> String {
		match self {
			HostError::NoDataDir => "Couldn't find the data folder".to_owned(),
			HostError::TokenMissing { profile } => {
				format!("{} hasn't run on this computer", profile.app_name())
			}
			HostError::TokenUnreadable { profile, .. } => {
				format!("Couldn't read the token of {}", profile.app_name())
			}
			HostError::NotRunning { profile } => format!("{} isn't open", profile.app_name()),
			HostError::NotDiscovered { .. } => "Couldn't look for a running Kiroshi".to_owned(),
			HostError::TokenRefused { profile } => {
				format!("{} refused the token", profile.app_name())
			}
			HostError::CommandFailed { .. } => "Kiroshi refused the call".to_owned(),
			HostError::Unreadable { .. } => "Kiroshi answered something unreadable".to_owned(),
			HostError::WriteRefused { .. } => "The preview only reads Kiroshi".to_owned(),
			HostError::InProcess { .. } => "The in-process Kiroshi didn't open".to_owned(),
		}
	}

	pub fn detail(&self) -> String {
		match self {
			HostError::NoDataDir => {
				"Set HOME, or APPDATA on Windows, so the data folder has a path.".to_owned()
			}
			HostError::TokenMissing { profile } => format!(
				"No host/token in the {} data folder. {} writes it when it opens.",
				profile.identifier(),
				profile.app_name()
			),
			HostError::TokenUnreadable { profile, cause } => {
				format!("host/token in the {} data folder: {cause}", profile.identifier())
			}
			HostError::NotRunning { profile } => profile.how_to_start().to_owned(),
			HostError::NotDiscovered { cause } => cause.clone(),
			HostError::TokenRefused { profile } => format!(
				"{} answered but refused the token of {}. Quit and reopen it, then try again.",
				profile.app_name(),
				profile.identifier()
			),
			HostError::CommandFailed { command, status, body } => {
				format!("{command} answered {status}: {body}")
			}
			HostError::Unreadable { command, cause } => format!("{command}: {cause}"),
			HostError::WriteRefused { command } => format!(
				"{command} would change your data, so it isn't sent to the installed Kiroshi."
			),
			HostError::InProcess { cause } => cause.clone(),
		}
	}

	pub fn profile(&self) -> Option<Profile> {
		match self {
			HostError::TokenMissing { profile }
			| HostError::TokenUnreadable { profile, .. }
			| HostError::NotRunning { profile }
			| HostError::TokenRefused { profile } => Some(*profile),
			_ => None,
		}
	}
}

#[derive(Clone, Debug)]
pub struct Host {
	profile: Profile,
	port: u16,
	token: String,
}

impl Host {
	pub fn detached() -> Host {
		Host { profile: Profile::Dev, port: 0, token: String::new() }
	}

	pub fn connect(profile: Profile) -> Result<Host, HostError> {
		let ports =
			discovery::host_ports(profile).map_err(|cause| HostError::NotDiscovered { cause })?;
		if ports.is_empty() {
			return Err(HostError::NotRunning { profile });
		}
		let token = token_of(profile)?;
		let mut refused = false;
		for port in ports {
			let host = Host { profile, port, token: token.clone() };
			match host.invoke::<Value>(PROBE, json!({})) {
				Ok(_) => return Ok(host),
				Err(HostError::TokenRefused { .. }) => refused = true,
				Err(HostError::NotRunning { .. }) => {}
				Err(other) => return Err(other),
			}
		}
		Err(if refused {
			HostError::TokenRefused { profile }
		} else {
			HostError::NotRunning { profile }
		})
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

	pub fn profile(&self) -> Profile {
		self.profile
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
		if self.profile == Profile::Installed && !is_read(command) {
			return Err(HostError::WriteRefused { command: command.to_owned() });
		}
		SENT.lock()
			.unwrap_or_else(PoisonError::into_inner)
			.push((self.profile, command.to_owned()));
		let url = format!("http://127.0.0.1:{}/api/invoke/{command}", self.port);
		let answered = ureq::post(&url)
			.timeout(patience)
			.set("Authorization", &self.bearer())
			.set("Content-Type", "application/json")
			.send_string(&arguments.to_string());
		let response = match answered {
			Ok(response) => response,
			Err(ureq::Error::Status(401, _)) => {
				return Err(HostError::TokenRefused { profile: self.profile });
			}
			Err(ureq::Error::Status(status, response)) => {
				let body = response
					.into_string()
					.unwrap_or_else(|failure| format!("unreadable body: {failure}"));
				return Err(HostError::CommandFailed { command: command.to_owned(), status, body });
			}
			Err(ureq::Error::Transport(_)) => {
				return Err(HostError::NotRunning { profile: self.profile });
			}
		};
		let unreadable =
			|cause: String| HostError::Unreadable { command: command.to_owned(), cause };
		let body = response.into_string().map_err(|failure| unreadable(failure.to_string()))?;
		serde_json::from_str(&body).map_err(|failure| unreadable(failure.to_string()))
	}
}

fn token_of(profile: Profile) -> Result<String, HostError> {
	let path = token_path(profile)?;
	match std::fs::read_to_string(&path) {
		Ok(held) if held.trim().is_empty() => Err(HostError::TokenMissing { profile }),
		Ok(held) => Ok(held.trim().to_owned()),
		Err(missing) if missing.kind() == std::io::ErrorKind::NotFound => {
			Err(HostError::TokenMissing { profile })
		}
		Err(failure) => {
			Err(HostError::TokenUnreadable { profile, cause: failure.kind().to_string() })
		}
	}
}

fn token_path(profile: Profile) -> Result<PathBuf, HostError> {
	let mut path = platform_data_root().ok_or(HostError::NoDataDir)?;
	path.push(profile.identifier());
	path.extend(TOKEN_FILE);
	Ok(path)
}

pub fn data_folders() -> Vec<PathBuf> {
	let Some(root) = platform_data_root() else { return Vec::new() };
	[Profile::Dev, Profile::Installed].map(|profile| root.join(profile.identifier())).to_vec()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_installed_host_refuses_every_command_outside_the_reads() {
		let installed = Host { profile: Profile::Installed, port: 0, token: String::new() };
		for write in ["conversation_send_turn", "conversation_main_chat", "mission_close"] {
			let refused = installed.invoke::<Value>(write, json!({}));
			assert!(matches!(refused, Err(HostError::WriteRefused { .. })), "{write}");
		}
		assert!(sent_commands().iter().all(|(_, command)| is_read(command)));
	}

	#[test]
	fn each_profile_reads_only_its_host_token_under_the_data_root_of_its_os() {
		let root = platform_data_root().expect("the test machine names a data root");
		let dev = token_path(Profile::Dev).expect("the dev token path is built");
		let installed = token_path(Profile::Installed).expect("the installed token path is built");

		assert_eq!(dev, root.join("com.kiroshi.app.dev").join("host").join("token"));
		assert_eq!(installed, root.join("com.kiroshi.app").join("host").join("token"));
		assert_eq!(root, expected_root());
	}

	#[cfg(target_os = "macos")]
	fn expected_root() -> PathBuf {
		PathBuf::from(std::env::var_os("HOME").expect("HOME")).join("Library/Application Support")
	}

	#[cfg(windows)]
	fn expected_root() -> PathBuf {
		PathBuf::from(std::env::var_os("APPDATA").expect("APPDATA"))
	}

	#[cfg(not(any(target_os = "macos", windows)))]
	fn expected_root() -> PathBuf {
		std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| {
			PathBuf::from(std::env::var_os("HOME").expect("HOME")).join(".local/share")
		})
	}

	#[test]
	fn the_installed_host_is_the_bundled_executable_and_the_dev_host_is_not() {
		let bundled = "/Applications/Kiroshi.app/Contents/MacOS/Kiroshi";
		let built = "target/debug/Kiroshi";
		let sidecar = "/Applications/Kiroshi.app/Contents/MacOS/kiroshi-claude";
		assert!(Profile::Installed.hosts(bundled));
		assert!(!Profile::Installed.hosts(built));
		assert!(!Profile::Installed.hosts(sidecar));
		assert!(Profile::Dev.hosts(built));
		assert!(!Profile::Dev.hosts(bundled));
		let dev_release = "/x/bundle/macos/Kiroshi Dev.app/Contents/MacOS/Kiroshi";
		assert!(Profile::Dev.hosts(dev_release));
		assert!(!Profile::Installed.hosts(dev_release));
	}
}
