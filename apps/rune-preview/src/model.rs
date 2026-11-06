use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
pub struct Space {
	pub id: String,
	pub name: String,
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
	pub participants: Vec<Participant>,
}

impl Conversation {
	pub fn present(&self) -> impl Iterator<Item = &Participant> {
		self.participants.iter().filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
	}
}

#[derive(Clone, Debug, Deserialize)]
pub struct MainChat {
	pub id: String,
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
