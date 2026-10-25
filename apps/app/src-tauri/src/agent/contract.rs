use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::bundles::EffortLevel;
use crate::conversations::contract::TranscriptStoreError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OfferedModel {
	pub value: String,
	#[serde(default, deserialize_with = "levels_the_app_knows")]
	#[specta(type = Vec<EffortLevel>)]
	pub supported_effort_levels: Vec<EffortLevel>,
}

fn levels_the_app_knows<'de, D>(deserializer: D) -> Result<Vec<EffortLevel>, D::Error>
where
	D: Deserializer<'de>,
{
	Ok(Option::<Vec<Value>>::deserialize(deserializer)?
		.unwrap_or_default()
		.into_iter()
		.filter_map(|named| serde_json::from_value(named).ok())
		.collect())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationNaming {
	pub title: String,
	pub icon: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionState {
	Checking,
	Ready,
	Unavailable,
	Crashed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TurnState {
	Idle,
	Submitting,
	Running,
	Stopping,
	Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
	User,
	Assistant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MessageCompletion {
	Streaming,
	Complete,
	Cancelled,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
	pub id: String,
	pub role: MessageRole,
	pub text: String,
	pub completion: MessageCompletion,
	pub timestamp: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ActivityKind {
	Tool,
	Permission,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ActivityStatus {
	Pending,
	Running,
	Succeeded,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
	pub id: String,
	pub title: String,
	pub kind: ActivityKind,
	pub status: ActivityStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
	pub id: String,
	pub tool_name: String,
	pub title: String,
	pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
	pub label: String,
	pub description: Option<String>,
	pub preview: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AskedQuestion {
	pub header: String,
	pub question: String,
	pub options: Vec<QuestionOption>,
	pub multi_select: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum QuestionSubject {
	#[serde(rename_all = "camelCase")]
	ApplicationScope { application: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRequest {
	pub id: String,
	pub questions: Vec<AskedQuestion>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub subject: Option<QuestionSubject>,
}

impl QuestionRequest {
	pub fn text(&self) -> String {
		self.questions.iter().map(|asked| asked.question.as_str()).collect::<Vec<_>>().join("\n")
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PermissionDecision {
	AllowOnce,
	Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum EvolvedBundle {
	Bot,
	User,
	Space,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TurnEnded {
	pub session_id: Option<String>,
	pub outcome: TurnOutcome,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = Option<crate::json::JsonValue>)]
	pub structured_output: Option<Value>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub total_cost_usd: Option<f64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = Option<crate::json::JsonValue>)]
	pub model_usage: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TurnOutcome {
	Completed,
	Cancelled,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TransportError {
	#[serde(rename_all = "camelCase")]
	BinaryNotFound {
		searched: Vec<String>,
	},
	NotAuthenticated,
	#[serde(rename_all = "camelCase")]
	AuthCheckFailed {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	SpawnFailed {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	StartupTimeout {
		timeout_ms: u64,
	},
	#[serde(rename_all = "camelCase")]
	Crashed {
		code: Option<i32>,
		detail: Option<String>,
	},
	#[serde(rename_all = "camelCase")]
	ResumeFailed {
		forgot_session_id: bool,
	},
	#[serde(rename_all = "camelCase")]
	InvalidFrame {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	SettingsRejected {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	ServerEnvRejected {
		detail: String,
	},
	NotStarted,
	TurnAlreadyRunning,
	TransitionInProgress,
	NoActiveTurn,
	#[serde(rename_all = "camelCase")]
	StaleRuntimeSession {
		runtime_session_id: String,
	},
	#[serde(rename_all = "camelCase")]
	UnknownPermission {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	WriteFailed {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RunLapsed {
		lapse: crate::agent::lease::Lapse,
		bound_ms: u64,
	},
}

impl TransportError {
	pub fn is_fatal(&self) -> bool {
		matches!(
			self,
			TransportError::BinaryNotFound { .. }
				| TransportError::NotAuthenticated
				| TransportError::SpawnFailed { .. }
				| TransportError::StartupTimeout { .. }
				| TransportError::Crashed { .. }
		)
	}
}

impl std::fmt::Display for TransportError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			TransportError::BinaryNotFound { .. } => write!(f, "the agent sidecar was not found"),
			TransportError::NotAuthenticated => write!(f, "the agent is not signed in"),
			TransportError::AuthCheckFailed { detail } => write!(f, "auth check failed: {detail}"),
			TransportError::SpawnFailed { detail } => write!(f, "spawn failed: {detail}"),
			TransportError::StartupTimeout { timeout_ms } => {
				write!(f, "startup timed out after {timeout_ms}ms")
			}
			TransportError::Crashed { code, .. } => write!(f, "the agent exited with {code:?}"),
			TransportError::ResumeFailed { .. } => {
				write!(f, "the stored session could not be resumed")
			}
			TransportError::InvalidFrame { detail } => write!(f, "invalid frame: {detail}"),
			TransportError::SettingsRejected { detail } => {
				write!(f, "the bot's settings were rejected: {detail}")
			}
			TransportError::ServerEnvRejected { detail } => write!(f, "{detail}"),
			TransportError::NotStarted => write!(f, "session not started"),
			TransportError::TurnAlreadyRunning => write!(f, "a turn is already running"),
			TransportError::TransitionInProgress => {
				write!(f, "a session transition is already in progress")
			}
			TransportError::NoActiveTurn => write!(f, "no active turn"),
			TransportError::StaleRuntimeSession { runtime_session_id } => {
				write!(f, "runtime session {runtime_session_id} is no longer the live one")
			}
			TransportError::UnknownPermission { id } => write!(f, "unknown permission {id}"),
			TransportError::WriteFailed { detail } => write!(f, "write failed: {detail}"),
			TransportError::RunLapsed { lapse, bound_ms } => write!(f, "{lapse} ({bound_ms} ms)"),
		}
	}
}

impl std::error::Error for TransportError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CancelOutcome {
	Cancelled,
	NothingToCancel,
	Failed { failures: Vec<CancelFailure> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CancelFailure {
	pub bot_id: String,
	pub reason: CancelFailureReason,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "source", content = "error", rename_all = "camelCase")]
pub enum CancelFailureReason {
	Session(TransportError),
	Store(TranscriptStoreError),
}

impl CancelOutcome {
	pub fn failed(bot_id: &str, reason: CancelFailureReason) -> Self {
		Self::Failed { failures: vec![CancelFailure { bot_id: bot_id.to_owned(), reason }] }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScope {
	pub conversation_id: String,
	pub bot_id: String,
	pub runtime_session_id: String,
	pub epoch: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SubmittedTurn {
	pub turn_id: String,
	pub prompt_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LiveSession {
	pub bot_id: String,
	pub conversation_id: String,
	pub runtime_session_id: String,
	pub started_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScopedEvent {
	pub scope: Option<RuntimeScope>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub turn: Option<EventTurn>,
	pub event: AgentEvent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EventTurn {
	pub turn_id: String,
	pub conversation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CheckReport {
	pub connection: ConnectionState,
	pub binary_version: Option<String>,
	pub authenticated: bool,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub auth_method: Option<String>,
	pub error: Option<TransportError>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccountReport {
	#[serde(flatten)]
	pub report: CheckReport,
	pub account: Option<Account>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Account {
	pub email: Option<String>,
	pub plan: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInStarted {
	pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SignInError {
	AlreadyRunning,
	NotRunning,
	Cancelled,
	TimedOut,
	#[serde(rename_all = "camelCase")]
	RefusedUrl {
		url: String,
	},
	#[serde(rename_all = "camelCase")]
	FlowTimedOut {
		timeout_ms: u64,
	},
	#[serde(rename_all = "camelCase")]
	Failed {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Transport {
		error: TransportError,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionHandle {
	pub resumed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
	pub session_id: Option<String>,
	pub messages: Vec<ChatMessage>,
	pub activities: Vec<ActivityEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommand {
	pub name: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub description: Option<String>,
}

impl AgentCommand {
	pub(crate) fn named(name: impl Into<String>) -> Self {
		Self { name: name.into(), description: None }
	}
}

impl<'de> Deserialize<'de> for AgentCommand {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		#[derive(Deserialize)]
		#[serde(untagged)]
		enum Announced {
			Named(String),
			Described {
				name: String,
				#[serde(default)]
				description: Option<String>,
			},
		}

		Ok(match Announced::deserialize(deserializer)? {
			Announced::Named(name) => Self::named(name),
			Announced::Described { name, description } => Self { name, description },
		})
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
	#[serde(rename_all = "camelCase")]
	ConnectionChanged { state: ConnectionState },
	#[serde(rename_all = "camelCase")]
	TurnChanged { state: TurnState },
	#[serde(rename_all = "camelCase")]
	SessionReady { session_id: String, resumed: bool },
	#[serde(rename_all = "camelCase")]
	CommandsListed { commands: Vec<AgentCommand> },
	#[serde(rename_all = "camelCase")]
	MessageStarted { message: ChatMessage },
	#[serde(rename_all = "camelCase")]
	MessageDelta { id: String, seq: u64, text: String },
	#[serde(rename_all = "camelCase")]
	MessageCompleted { message: ChatMessage },
	#[serde(rename_all = "camelCase")]
	Activity { activity: ActivityEvent },
	#[serde(rename_all = "camelCase")]
	PermissionRequested { request: PermissionRequest },
	#[serde(rename_all = "camelCase")]
	QuestionRequested { request: QuestionRequest },
	#[serde(rename_all = "camelCase")]
	PermissionResolved { id: String, decision: PermissionDecision },
	#[serde(rename_all = "camelCase")]
	TurnEnded { ended: TurnEnded },
	#[serde(rename_all = "camelCase")]
	BotEvolved { bundle: EvolvedBundle, commit_id: String, title: String },
	#[serde(rename_all = "camelCase")]
	BotEvolutionFailed { bundle: EvolvedBundle, detail: String },
	#[serde(rename_all = "camelCase")]
	Failed { error: TransportError },
}
