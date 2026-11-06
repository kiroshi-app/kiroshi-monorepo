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
	Failed {
		error: serde_json::Value,
	},
	#[serde(other)]
	Other,
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
