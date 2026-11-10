use kiroshi_core::missions::contract::MissionStatus;
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Space {
	pub id: String,
	pub name: String,
	pub colour: Option<f32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
	pub id: String,
	pub name: String,
	pub title: String,
	pub avatar_blot: Option<f32>,
	pub avatar_image_path: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
	pub bot_id: String,
	pub name: String,
	pub avatar_blot: Option<f32>,
	pub left_at: Option<i64>,
	pub is_deleted: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
	pub id: String,
	pub title: String,
	pub color: Option<f32>,
	pub participants: Vec<Participant>,
	#[serde(default)]
	pub last_activity_at: Option<i64>,
	#[serde(default)]
	pub last_word: Option<LastWord>,
	#[serde(default)]
	pub solo_bot_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LastWord {
	pub text: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPage {
	pub pinned: Vec<Conversation>,
	pub conversations: Vec<Conversation>,
	pub next_cursor: Option<String>,
}

impl Conversation {
	pub fn present(&self) -> impl Iterator<Item = &Participant> {
		self.participants.iter().filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
	}
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
	User,
	Assistant,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
	pub id: String,
	pub conversation_id: String,
	pub seq: i64,
	pub role: Role,
	pub content: String,
	pub author_bot_id: Option<String>,
	pub author_name: Option<String>,
	#[serde(default)]
	pub created_at: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
	pub messages: Vec<Message>,
	pub has_more: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScope {
	pub conversation_id: String,
	pub bot_id: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StreamedMessage {
	pub id: String,
	pub text: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentEvent {
	MessageStarted {
		message: StreamedMessage,
	},
	MessageDelta {
		id: String,
		text: String,
	},
	MessageCompleted {
		message: StreamedMessage,
	},
	TurnEnded {
		ended: TurnEnded,
	},
	TurnChanged {
		state: TurnState,
	},
	Activity {
		activity: ToolActivity,
	},
	Failed {
		error: serde_json::Value,
	},
	#[serde(other)]
	Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TurnState {
	Idle,
	Submitting,
	Running,
	Stopping,
	Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityStatus {
	Pending,
	Running,
	Succeeded,
	Failed,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ToolActivity {
	pub title: String,
	pub status: ActivityStatus,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TurnEnded {
	pub outcome: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ScopedEvent {
	pub scope: Option<RuntimeScope>,
	pub event: AgentEvent,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ClaudeAccountReport {
	pub authenticated: bool,
	pub account: Option<ClaudeAccount>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ClaudeAccount {
	pub email: Option<String>,
	pub plan: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeItem {
	pub key: String,
	pub name: String,
	pub description: String,
	pub already_imported: bool,
}

#[derive(Clone, Debug, Deserialize)]
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

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum KiroshiAccountState {
	SignedIn {
		email: String,
		plan: Option<String>,
	},
	#[serde(other)]
	SignedOut,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MissionState {
	Working,
	WaitingBot,
	WaitingHuman,
	ReadyToMerge,
	Failed,
	Done,
	Closed,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ticket {
	#[serde(default)]
	pub platform: Option<String>,
	#[serde(default)]
	pub external_id: Option<String>,
	#[serde(default)]
	pub url: Option<String>,
	#[serde(default)]
	pub title: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MissionActivity {
	pub tool: String,
	pub target: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
	pub id: String,
	pub origin_conversation_id: String,
	pub bot_id: String,
	pub thread_conversation_id: String,
	pub objective: String,
	pub ticket: Ticket,
	pub tools: Vec<String>,
	pub state: MissionState,
	pub is_agent_running: bool,
	pub opened_at: i64,
	pub status: Option<MissionStatus>,
	pub last_activity: Option<MissionActivity>,
	pub commits_ahead: Option<i64>,
	pub pull_request_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MissionOnBoard {
	pub mission: Mission,
	pub bot: Agent,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MissionDetail {
	pub mission: Mission,
	pub events: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionChanged {
	pub mission_id: String,
	pub state: MissionState,
	pub state_seq: i64,
	pub is_agent_running: bool,
	pub status: Option<MissionStatus>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ConversationMissions {
	pub open: Vec<Mission>,
	pub done: Vec<Mission>,
}
