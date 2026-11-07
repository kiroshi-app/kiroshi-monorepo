use std::fmt;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::{Duration, Instant, SystemTime, SystemTimeError, UNIX_EPOCH};

use kiroshi_core::agent::AgentState;
use kiroshi_core::bundles;
use kiroshi_core::companions::launch::LaunchOutcomeState;
use kiroshi_core::conversations::awaited_runs::TurnWindows;
use kiroshi_core::conversations::commands::{
	conversation_bots, conversation_send_turn, list_bundles_at_launch, main_chat, message_page,
};
use kiroshi_core::conversations::contract::{
	Chat, SentMessage, TranscriptCompletion, TranscriptMessage, TranscriptRole,
	TranscriptStoreError,
};
use kiroshi_core::conversations::turn_run_deadline::TurnRunDeadlines;
use kiroshi_core::core_context::Core;
use kiroshi_core::db;
use kiroshi_core::hosting::caller::Caller;
use tokio::runtime::Runtime;
use uuid::Uuid;

pub const IDENTIFIER: &str = "com.kiroshi.rune-preview";

pub const DATA_ENV: &str = "KIROSHI_PREVIEW_DATA";

const PAGE_LIMIT: u32 = 100;

const REPLY_PATIENCE: Duration = Duration::from_secs(120);

const REPLY_POLL: Duration = Duration::from_millis(50);

pub enum LocalError {
	Runtime(std::io::Error),
	Store(TranscriptStoreError),
	Clock(SystemTimeError),
	NoDataFolder,
	NoAgent,
	NoReply { waited: Duration, heard: Vec<String> },
}

impl fmt::Display for LocalError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			LocalError::Runtime(failure) => {
				write!(f, "The in-process Kiroshi didn't start: {failure}")
			}
			LocalError::Store(failure) => write!(f, "The conversation store refused: {failure:?}"),
			LocalError::Clock(failure) => write!(f, "The clock reads before 1970: {failure}"),
			LocalError::NoAgent => write!(f, "No agent with a bundle to talk to"),
			LocalError::NoDataFolder => {
				write!(f, "No data folder for the in-process Kiroshi: set {DATA_ENV}")
			}
			LocalError::NoReply { waited, heard } => {
				write!(
					f,
					"No reply settled within {}s; the thread holds: {heard:?}",
					waited.as_secs()
				)
			}
		}
	}
}

impl From<TranscriptStoreError> for LocalError {
	fn from(failure: TranscriptStoreError) -> Self {
		LocalError::Store(failure)
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
		let local = LocalCore { core, runtime };
		local.launched();
		Ok(local)
	}

	fn launched(&self) {
		self.runtime.block_on(list_bundles_at_launch(&self.core));
	}

	pub fn open_conversation(&self) -> Result<(Chat, String), LocalError> {
		self.runtime.block_on(async {
			let agent = self.first_agent().await?;
			let chat = main_chat(&self.core, agent.clone(), None).await?;
			Ok((chat, agent))
		})
	}

	async fn first_agent(&self) -> Result<String, LocalError> {
		let root = bundles::root(&self.core).ok_or(LocalError::NoAgent)?;
		let agents = conversation_bots(&self.core, None).await?;
		agents
			.into_iter()
			.map(|agent| agent.id)
			.find(|id| matches!(bundles::lookup(&root, id), Ok(Some(_))))
			.ok_or(LocalError::NoAgent)
	}

	pub fn send(
		&self,
		conversation_id: &str,
		content: &str,
		summoned: &[String],
	) -> Result<String, LocalError> {
		let created_at =
			SystemTime::now().duration_since(UNIX_EPOCH).map_err(LocalError::Clock)?.as_millis();
		let turn_id = Uuid::new_v4().to_string();
		let message = SentMessage {
			id: Uuid::new_v4().to_string(),
			conversation_id: conversation_id.to_owned(),
			turn_id: turn_id.clone(),
			content: content.to_owned(),
			created_at: created_at as i64,
			replied_to_message_id: None,
			replied_to_message_ids: Vec::new(),
			reply_links: Vec::new(),
			documents: Vec::new(),
		};
		self.runtime.block_on(conversation_send_turn(
			&self.core,
			Caller::Host,
			message,
			summoned.to_vec(),
		))?;
		Ok(turn_id)
	}

	pub fn reply_to(
		&self,
		conversation_id: &str,
		turn_id: &str,
	) -> Result<TranscriptMessage, LocalError> {
		let started = Instant::now();
		loop {
			let thread = self.thread(conversation_id)?;
			let settled = thread.iter().find(|message| {
				message.turn_id == turn_id
					&& message.role == TranscriptRole::Assistant
					&& !matches!(
						message.completion,
						TranscriptCompletion::Pending | TranscriptCompletion::Streaming
					)
			});
			if let Some(reply) = settled {
				return Ok(reply.clone());
			}
			if started.elapsed() > REPLY_PATIENCE {
				let heard = thread.iter().map(described).collect();
				return Err(LocalError::NoReply { waited: REPLY_PATIENCE, heard });
			}
			std::thread::sleep(REPLY_POLL);
		}
	}

	pub fn thread(&self, conversation_id: &str) -> Result<Vec<TranscriptMessage>, LocalError> {
		let mut messages: Vec<TranscriptMessage> = Vec::new();
		let mut before: Option<i64> = None;
		loop {
			let page = self.runtime.block_on(message_page(
				&self.core,
				conversation_id.to_owned(),
				before,
				PAGE_LIMIT,
			))?;
			let oldest = page.messages.iter().map(|message| message.seq).min();
			messages.extend(page.messages);
			match oldest {
				Some(oldest) if page.has_more => before = Some(oldest),
				_ => break,
			}
		}
		messages.sort_by_key(|message| message.seq);
		Ok(messages)
	}
}

fn described(message: &TranscriptMessage) -> String {
	format!("{:?} {:?}: {}", message.role, message.completion, message.content)
}

pub fn send_and_read(text: &str) -> ExitCode {
	match exchanged(text) {
		Ok(reply) => {
			println!("reply ({:?}): {}", reply.completion, reply.content);
			ExitCode::SUCCESS
		}
		Err(failure) => {
			eprintln!("{failure}");
			ExitCode::FAILURE
		}
	}
}

fn exchanged(text: &str) -> Result<TranscriptMessage, LocalError> {
	let local = LocalCore::open(data_folder()?)?;
	let (chat, agent) = local.open_conversation()?;
	let turn_id = local.send(&chat.id, text, &[agent])?;
	println!("sent to conversation {} in turn {turn_id}", chat.id);
	local.reply_to(&chat.id, &turn_id)
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
