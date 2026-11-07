use std::fmt;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::sync::Arc;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use kiroshi_core::account::cloud::api_url;
use kiroshi_core::account::session::{AccountSession, restore};
use kiroshi_core::agent::AgentState;
use kiroshi_core::agent::sign_in::SignInState;
use kiroshi_core::bundles;
use kiroshi_core::companions::launch::LaunchOutcomeState;
use kiroshi_core::conversations::awaited_runs::TurnWindows;
use kiroshi_core::conversations::commands::{conversation_bots, list_bundles_at_launch};
use kiroshi_core::conversations::contract::TranscriptStoreError;
use kiroshi_core::conversations::turn_run_deadline::TurnRunDeadlines;
use kiroshi_core::core_context::{ChosenPath, Copied, Core, Desktop, RenderWindow};
use kiroshi_core::db;
use kiroshi_core::environment::store::writable_root;
use kiroshi_core::hosting::authors::install_authors;
use kiroshi_core::hosting::authorship::DesktopAuthors;
use kiroshi_core::invoke::{Answer, dispatch};
use kiroshi_core::missions::run_claims::MissionRunClaims;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::runtime::Runtime;
use tokio::sync::broadcast::error::RecvError;

use crate::app;
use crate::events::{self, HostEvent};
use crate::host::HostError;
use crate::model::{AgentEvent, Role};
use crate::source::Source;
use crate::turn;

pub const IDENTIFIER: &str = "com.kiroshi.rune-preview";

pub const DATA_ENV: &str = "KIROSHI_PREVIEW_DATA";

const REPLY_PATIENCE: Duration = Duration::from_secs(120);

pub enum LocalError {
	Runtime(std::io::Error),
	Store(TranscriptStoreError),
	Host(HostError),
	NoDataFolder,
	NoAgent,
	NoReply { waited: Duration },
	StoredBeforeStreamed,
	Unheard,
}

impl fmt::Display for LocalError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			LocalError::Runtime(failure) => {
				write!(f, "The in-process Kiroshi didn't start: {failure}")
			}
			LocalError::Store(failure) => write!(f, "The conversation store refused: {failure:?}"),
			LocalError::Host(failure) => write!(f, "{} {}", failure.title(), failure.detail()),
			LocalError::NoAgent => write!(f, "No agent with a bundle to talk to"),
			LocalError::NoDataFolder => {
				write!(f, "No data folder for the in-process Kiroshi: set {DATA_ENV}")
			}
			LocalError::NoReply { waited } => {
				write!(f, "No reply event within {}s", waited.as_secs())
			}
			LocalError::StoredBeforeStreamed => {
				write!(f, "The reply was stored before any of it streamed")
			}
			LocalError::Unheard => write!(f, "The Core stopped delivering its events"),
		}
	}
}

impl From<TranscriptStoreError> for LocalError {
	fn from(failure: TranscriptStoreError) -> Self {
		LocalError::Store(failure)
	}
}

impl From<HostError> for LocalError {
	fn from(failure: HostError) -> Self {
		LocalError::Host(failure)
	}
}

pub struct LocalCore {
	core: Core,
	runtime: Runtime,
}

impl LocalCore {
	pub fn open(data_dir: PathBuf) -> Result<LocalCore, LocalError> {
		let runtime = Runtime::new().map_err(LocalError::Runtime)?;
		let core = Core::new(data_dir, IDENTIFIER, runtime.handle().clone());
		db::install(&core);
		core.manage(AgentState::default());
		core.manage(TurnRunDeadlines::default());
		core.manage_client_scoped(TurnWindows::default());
		core.manage(LaunchOutcomeState::default());
		core.manage(SignInState::default());
		core.manage_client_scoped(MissionRunClaims::default());
		core.manage(AccountSession::new(writable_root(&core), &api_url()));
		core.install_desktop(Browser);
		install_authors(&core, DesktopAuthors);
		kiroshi_core::host_services::start(&core);
		let local = LocalCore { core, runtime };
		local.runtime.block_on(list_bundles_at_launch(&local.core));
		local.core.spawn(restore(local.core.clone()));
		Ok(local)
	}

	pub fn invoke<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		let failed = |status: u16, body: String| HostError::CommandFailed {
			command: command.to_owned(),
			status,
			body,
		};
		match self.runtime.block_on(dispatch(&self.core, command, arguments)) {
			Some(Answer::Answered(json)) => serde_json::from_value(json).map_err(|failure| {
				HostError::Unreadable { command: command.to_owned(), cause: failure.to_string() }
			}),
			Some(Answer::Refused(json)) => Err(failed(500, json.to_string())),
			Some(Answer::Unanswerable(detail)) => Err(failed(500, detail)),
			None => Err(failed(404, "the in-process Kiroshi holds no such command".to_owned())),
		}
	}

	pub fn listen(&self, deliver: impl Fn(HostEvent) + Send + Sync + 'static) {
		let mut frames = self.core.subscribe_frames();
		let spawned = thread::Builder::new().name("core-frames".into()).spawn(move || {
			deliver(HostEvent::Listening);
			loop {
				match frames.blocking_recv() {
					Ok(frame) => {
						if let Some(heard) = events::parsed(&frame) {
							deliver(heard);
						}
					}
					Err(RecvError::Lagged(skipped)) => {
						eprintln!("the preview fell behind the core and skipped {skipped} frames");
						deliver(HostEvent::Lagged);
					}
					Err(RecvError::Closed) => {
						return deliver(HostEvent::Lost("the core closed its frames".to_owned()));
					}
				}
			}
		});
		if let Err(failure) = spawned {
			eprintln!("the core frame listener did not start: {failure}");
		}
	}

	pub fn first_agent(&self) -> Result<String, LocalError> {
		let root = bundles::root(&self.core).ok_or(LocalError::NoAgent)?;
		let agents = self.runtime.block_on(conversation_bots(&self.core, None))?;
		agents
			.into_iter()
			.map(|agent| agent.id)
			.find(|id| matches!(bundles::lookup(&root, id), Ok(Some(_))))
			.ok_or(LocalError::NoAgent)
	}
}

pub fn opened() -> Result<Arc<LocalCore>, HostError> {
	let folder =
		data_folder().map_err(|failure| HostError::InProcess { cause: failure.to_string() })?;
	LocalCore::open(folder)
		.map(Arc::new)
		.map_err(|failure| HostError::InProcess { cause: failure.to_string() })
}

#[derive(Deserialize)]
struct Opened {
	id: String,
}

pub fn send_and_read(text: &str) -> ExitCode {
	match exchanged(text) {
		Ok(reply) => {
			println!("reply: {reply}");
			ExitCode::SUCCESS
		}
		Err(failure) => {
			eprintln!("{failure}");
			ExitCode::FAILURE
		}
	}
}

fn exchanged(text: &str) -> Result<String, LocalError> {
	let local = opened()?;
	let agent = local.first_agent()?;
	let ready = app::ready_on(Source::InProcess(local))?;
	let chat: Opened =
		ready.source.invoke("conversation_main_chat", json!({ "botId": agent.clone() }))?;
	println!("opened {} with {} agents in space {}", chat.id, ready.agents.len(), ready.space.id);
	let (heard, hearing) = mpsc::channel();
	ready.source.listen(move |event| {
		if heard.send(event).is_err() {
			eprintln!("an event arrived after the exchange ended");
		}
	});
	turn::send_turn(&ready.source, &chat.id, text, &[agent])
		.map_err(|failure| LocalError::Host(HostError::InProcess { cause: failure.to_string() }))?;
	println!("sent to conversation {}", chat.id);
	completed_reply(&hearing, &chat.id)
}

fn completed_reply(
	hearing: &mpsc::Receiver<HostEvent>,
	conversation_id: &str,
) -> Result<String, LocalError> {
	let started = Instant::now();
	let mut streamed: Option<String> = None;
	let mut is_streaming = false;
	let mut is_stored = false;
	loop {
		if let (Some(reply), true) = (&streamed, is_stored) {
			return Ok(reply.clone());
		}
		let left = REPLY_PATIENCE.saturating_sub(started.elapsed());
		match hearing.recv_timeout(left) {
			Ok(HostEvent::Agent(scoped)) => {
				let here = scoped
					.scope
					.as_ref()
					.is_some_and(|scope| scope.conversation_id == conversation_id);
				is_streaming |= here;
				if let (true, AgentEvent::MessageCompleted { message }) = (here, scoped.event) {
					streamed = Some(message.text);
				}
			}
			Ok(HostEvent::MessageStored(message))
				if message.conversation_id == conversation_id
					&& matches!(message.role, Role::Assistant) =>
			{
				if !is_streaming {
					return Err(LocalError::StoredBeforeStreamed);
				}
				println!("stored reply: {}", message.content);
				is_stored = true;
			}
			Ok(_) => {}
			Err(RecvTimeoutError::Timeout) => {
				return Err(LocalError::NoReply { waited: REPLY_PATIENCE });
			}
			Err(RecvTimeoutError::Disconnected) => return Err(LocalError::Unheard),
		}
	}
}

pub fn data_folder() -> Result<PathBuf, LocalError> {
	if let Some(explicit) = std::env::var_os(DATA_ENV) {
		return Ok(PathBuf::from(explicit));
	}
	platform_data_root().map(|root| root.join(IDENTIFIER)).ok_or(LocalError::NoDataFolder)
}

#[cfg(target_os = "macos")]
pub fn platform_data_root() -> Option<PathBuf> {
	std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/Application Support"))
}

#[cfg(windows)]
pub fn platform_data_root() -> Option<PathBuf> {
	std::env::var_os("APPDATA").map(PathBuf::from)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn platform_data_root() -> Option<PathBuf> {
	std::env::var_os("XDG_DATA_HOME")
		.map(PathBuf::from)
		.or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
}

struct Browser;

impl Desktop for Browser {
	fn open_url(&self, url: &str) -> Result<(), String> {
		if !(url.starts_with("https://") || url.starts_with("http://")) {
			return Err("the preview opens only web links".to_owned());
		}
		let opened = browser_opening(url).status().map_err(|failure| failure.to_string())?;
		match opened.success() {
			true => Ok(()),
			false => Err(format!("the browser opener answered {opened}")),
		}
	}

	fn raise_main_window(&self) {}

	fn open_render_window(&self, window: &RenderWindow) -> Result<(), String> {
		Err(format!("the preview opens no render window, {} included", window.label))
	}

	fn close_window(&self, _label: &str) -> Result<(), String> {
		Ok(())
	}

	fn reveal(&self, path: &Path) -> Result<(), String> {
		let revealed = revealing(path)?.status().map_err(|failure| failure.to_string())?;
		match revealed.success() {
			true => Ok(()),
			false => Err(format!("the file reveal answered {revealed}")),
		}
	}

	fn copy(&self, _copied: Copied) -> Result<(), String> {
		Err("the preview holds no clipboard".to_owned())
	}

	fn chosen_save_path(&self, _suggested: String) -> ChosenPath {
		Box::pin(async { Err("the preview opens no save dialog".to_owned()) })
	}
}

#[cfg(target_os = "macos")]
fn revealing(path: &Path) -> Result<Command, String> {
	let mut revealing = Command::new("open");
	revealing.arg("-R").arg(path);
	Ok(revealing)
}

#[cfg(not(target_os = "macos"))]
fn revealing(_path: &Path) -> Result<Command, String> {
	Err("the preview reveals files on macOS only".to_owned())
}

#[cfg(target_os = "macos")]
fn browser_opening(url: &str) -> Command {
	let mut opening = Command::new("open");
	opening.arg(url);
	opening
}

#[cfg(windows)]
fn browser_opening(url: &str) -> Command {
	let mut opening = Command::new("rundll32");
	opening.args(["url.dll,FileProtocolHandler", url]);
	opening
}

#[cfg(not(any(target_os = "macos", windows)))]
fn browser_opening(url: &str) -> Command {
	let mut opening = Command::new("xdg-open");
	opening.arg(url);
	opening
}
