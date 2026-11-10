use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use kiroshi_core::joined_spaces::contract::JoinedSpaceConnection;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::discovery;
use crate::local::platform_data_root;
use crate::source::Source;

const READ_PATIENCE: Duration = Duration::from_secs(20);

const TURN_PATIENCE: Duration = Duration::from_secs(15 * 60);

const PROBE: &str = "space_list";

pub const JOINED_SPACE_CONNECT: &str = "joined_space_connect";

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
	pub const BUILT: Profile =
		if cfg!(debug_assertions) { Profile::Dev } else { Profile::Installed };

	pub const fn identifier(self) -> &'static str {
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
	JoinedOffline { space_id: String },
	JoinedRefused { space_id: String },
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
			HostError::JoinedOffline { .. } => "Couldn't reach the host of this Space".to_owned(),
			HostError::JoinedRefused { .. } => {
				"The host of this Space refused the token".to_owned()
			}
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
			HostError::JoinedOffline { .. } => {
				"The host of this Space didn't answer. Check that it's online, then try again."
					.to_owned()
			}
			HostError::JoinedRefused { .. } => {
				"The host of this Space refused a fresh token. Leave and join the Space again."
					.to_owned()
			}
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
enum Reach {
	Local { profile: Profile, port: u16, token: String },
	Joined(Joined),
}

#[derive(Clone, Debug)]
pub struct Host {
	reach: Reach,
}

struct Endpoint {
	origin: String,
	token: String,
}

impl Host {
	pub fn detached() -> Host {
		Host::local(Profile::Dev, 0, String::new())
	}

	fn local(profile: Profile, port: u16, token: String) -> Host {
		Host { reach: Reach::Local { profile, port, token } }
	}

	#[cfg(test)]
	pub fn dev_on(port: u16, token: &str) -> Host {
		Host::local(Profile::Dev, port, token.to_owned())
	}

	pub fn joined(local: &Source, connection: JoinedSpaceConnection) -> Host {
		let joined =
			Joined { connection: Arc::new(Mutex::new(connection)), local: Arc::new(local.clone()) };
		Host { reach: Reach::Joined(joined) }
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
			let host = Host::local(profile, port, token.clone());
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

	pub fn profile(&self) -> Option<Profile> {
		match self.reach {
			Reach::Local { profile, .. } => Some(profile),
			Reach::Joined(_) => None,
		}
	}

	pub fn joined_space(&self) -> Option<&Joined> {
		match &self.reach {
			Reach::Local { .. } => None,
			Reach::Joined(joined) => Some(joined),
		}
	}

	pub fn events_url(&self) -> String {
		let origin = self.endpoint().origin;
		let socket_origin = match origin.split_once("://") {
			Some(("https", rest)) => format!("wss://{rest}"),
			Some(("http", rest)) => format!("ws://{rest}"),
			_ => origin,
		};
		format!("{socket_origin}/api/events")
	}

	pub fn bearer(&self) -> String {
		format!("Bearer {}", self.endpoint().token)
	}

	fn endpoint(&self) -> Endpoint {
		match &self.reach {
			Reach::Local { port, token, .. } => {
				Endpoint { origin: format!("http://127.0.0.1:{port}"), token: token.clone() }
			}
			Reach::Joined(joined) => {
				let connection = joined.kept();
				let origin = connection.host_url.trim_end_matches('/').to_owned();
				Endpoint { origin, token: connection.token }
			}
		}
	}

	fn refused(&self) -> HostError {
		match &self.reach {
			Reach::Local { profile, .. } => HostError::TokenRefused { profile: *profile },
			Reach::Joined(joined) => HostError::JoinedRefused { space_id: joined.id() },
		}
	}

	fn unreachable(&self) -> HostError {
		match &self.reach {
			Reach::Local { profile, .. } => HostError::NotRunning { profile: *profile },
			Reach::Joined(joined) => HostError::JoinedOffline { space_id: joined.id() },
		}
	}

	fn invoke_within<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
		patience: Duration,
	) -> Result<T, HostError> {
		match &self.reach {
			Reach::Local { profile, .. } => {
				if *profile == Profile::Installed && !is_read(command) {
					return Err(HostError::WriteRefused { command: command.to_owned() });
				}
				SENT.lock()
					.unwrap_or_else(PoisonError::into_inner)
					.push((*profile, command.to_owned()));
				self.posted(command, &arguments, patience)
			}
			Reach::Joined(joined) => {
				let arguments = joined.shared(arguments);
				match self.posted(command, &arguments, patience) {
					Err(HostError::JoinedRefused { .. }) => {
						joined.refresh()?;
						self.posted(command, &arguments, patience)
					}
					answered => answered,
				}
			}
		}
	}

	fn posted<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: &Value,
		patience: Duration,
	) -> Result<T, HostError> {
		let Endpoint { origin, token } = self.endpoint();
		let answered = ureq::post(&format!("{origin}/api/invoke/{command}"))
			.timeout(patience)
			.set("Authorization", &format!("Bearer {token}"))
			.set("Content-Type", "application/json")
			.send_string(&arguments.to_string());
		let response = match answered {
			Ok(response) => response,
			Err(ureq::Error::Status(401, _)) => return Err(self.refused()),
			Err(ureq::Error::Status(status, response)) => {
				let body = response
					.into_string()
					.unwrap_or_else(|failure| format!("unreadable body: {failure}"));
				return Err(HostError::CommandFailed { command: command.to_owned(), status, body });
			}
			Err(ureq::Error::Transport(_)) => return Err(self.unreachable()),
		};
		let unreadable =
			|cause: String| HostError::Unreadable { command: command.to_owned(), cause };
		let body = response.into_string().map_err(|failure| unreadable(failure.to_string()))?;
		serde_json::from_str(&body).map_err(|failure| unreadable(failure.to_string()))
	}
}

#[derive(Clone)]
pub struct Joined {
	connection: Arc<Mutex<JoinedSpaceConnection>>,
	local: Arc<Source>,
}

impl fmt::Debug for Joined {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.debug_struct("Joined").field("id", &self.id()).finish_non_exhaustive()
	}
}

impl Joined {
	pub fn id(&self) -> String {
		self.kept().id
	}

	pub fn host(&self) -> Host {
		Host { reach: Reach::Joined(self.clone()) }
	}

	pub fn local(&self) -> &Source {
		&self.local
	}

	pub fn refresh(&self) -> Result<(), HostError> {
		let fresh: JoinedSpaceConnection =
			self.local.invoke(JOINED_SPACE_CONNECT, json!({ "id": self.id() }))?;
		*self.connection.lock().unwrap_or_else(PoisonError::into_inner) = fresh;
		Ok(())
	}

	fn kept(&self) -> JoinedSpaceConnection {
		self.connection.lock().unwrap_or_else(PoisonError::into_inner).clone()
	}

	fn shared(&self, mut arguments: Value) -> Value {
		let connection = self.kept();
		if let Some(space_id) = arguments.get_mut("spaceId")
			&& space_id.as_str() == Some(connection.id.as_str())
		{
			*space_id = Value::String(connection.remote_space_id.unwrap_or(connection.id));
		}
		arguments
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
	use std::io::ErrorKind;
	use std::net::TcpListener;

	use super::*;

	#[test]
	fn the_installed_host_refuses_every_command_outside_the_reads() {
		let listener = TcpListener::bind("127.0.0.1:0").expect("the installed stand-in binds");
		listener.set_nonblocking(true).expect("the installed stand-in polls");
		let port = listener.local_addr().expect("the installed stand-in has an address").port();
		let installed = Host::local(Profile::Installed, port, String::new());
		for write in ["conversation_send_turn", "conversation_main_chat", "mission_close"] {
			let refused = installed.invoke::<Value>(write, json!({}));
			assert!(matches!(refused, Err(HostError::WriteRefused { .. })), "{write}");
		}
		let reached = listener.accept();
		assert!(
			matches!(&reached, Err(failure) if failure.kind() == ErrorKind::WouldBlock),
			"the installed host received {reached:?}"
		);
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
