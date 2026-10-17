use std::path::Path;

use serde::{Deserialize, Serialize};

use super::bot::AvatarBlot;
use crate::avatars;
use crate::db::repositories::{conversations, runtime_context};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
	pub id: String,
	pub created_at: i64,
	pub updated_at: i64,
}

impl From<conversations::Chat> for Chat {
	fn from(chat: conversations::Chat) -> Self {
		Self { id: chat.id, created_at: chat.created_at, updated_at: chat.updated_at }
	}
}

pub const CREATED_EVENT: &str = "conversation://created";

pub const UPDATED_EVENT: &str = "conversation://updated";

pub const DELETED_EVENT: &str = "conversation://deleted";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationStored {
	pub space_id: Option<String>,
	pub conversation: ConversationInPage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDeleted {
	pub space_id: Option<String>,
	pub conversation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
	pub id: String,
	pub space_id: Option<String>,
	pub section_id: Option<String>,
	pub pin_position: Option<i64>,
	pub title: String,
	pub instructions: String,
	pub icon: Option<String>,
	pub color: Option<AvatarBlot>,
	pub created_at: i64,
	pub updated_at: i64,
	pub participants: Vec<Participant>,
}

impl Conversation {
	pub fn of(room: conversations::Conversation, avatars: Option<&Path>) -> Self {
		Self {
			id: room.id,
			space_id: room.space_id,
			section_id: room.section_id,
			pin_position: room.pin_position,
			title: room.title,
			instructions: room.instructions,
			icon: room.icon,
			color: room.color.map(Into::into),
			created_at: room.created_at,
			updated_at: room.updated_at,
			participants: room
				.seats
				.into_iter()
				.map(|seat| Participant::of(seat, avatars))
				.collect(),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPage {
	pub pinned: Vec<ConversationInPage>,
	pub conversations: Vec<ConversationInPage>,
	pub next_cursor: Option<String>,
}

impl ConversationPage {
	pub fn of(read: conversations::ActivePage, avatars: Option<&Path>) -> Self {
		let drawn = |rows: Vec<conversations::ActiveConversation>| {
			rows.into_iter().map(|row| ConversationInPage::of(row, avatars)).collect()
		};
		Self {
			pinned: drawn(read.pinned),
			conversations: drawn(read.page.rows),
			next_cursor: read.page.next.map(|keyset| keyset.encoded()),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationInPage {
	#[serde(flatten)]
	pub conversation: Conversation,
	pub last_activity_at: i64,
	pub last_word: Option<LastWord>,
	pub solo_bot_id: Option<String>,
	pub active_turn: Option<ActiveTurn>,
}

impl ConversationInPage {
	pub fn of(row: conversations::ActiveConversation, avatars: Option<&Path>) -> Self {
		Self {
			conversation: Conversation::of(row.conversation, avatars),
			last_activity_at: row.last_activity_at,
			last_word: row.last_word.map(Into::into),
			solo_bot_id: row.solo_bot_id,
			active_turn: row.active_turn.map(Into::into),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTurn {
	pub started_at: i64,
	pub bot_ids: Vec<String>,
}

impl From<conversations::ActiveTurn> for ActiveTurn {
	fn from(turn: conversations::ActiveTurn) -> Self {
		Self { started_at: turn.started_at, bot_ids: turn.bot_ids }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LastWord {
	pub text: Option<String>,
	pub at: i64,
	pub author_bot_id: Option<String>,
	pub author_account_id: Option<String>,
	pub author_name: Option<String>,
}

impl From<conversations::LastWord> for LastWord {
	fn from(word: conversations::LastWord) -> Self {
		Self {
			text: word.text,
			at: word.at,
			author_bot_id: word.author_bot_id,
			author_account_id: word.author.account_id,
			author_name: word.author.name,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
	pub bot_id: String,
	pub role: ParticipantRole,
	pub joined_at: i64,
	pub left_at: Option<i64>,
	pub name: String,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub is_deleted: bool,
}

impl Participant {
	fn of(seat: conversations::Seat, avatars: Option<&Path>) -> Self {
		Self {
			bot_id: seat.bot_id,
			role: ParticipantRole::of(&seat.role),
			joined_at: seat.joined_at,
			left_at: seat.left_at,
			name: seat.name,
			avatar_blot: seat.avatar_blot.map(Into::into),
			avatar_image_path: drawable_avatar(seat.avatar_image_path.as_deref(), avatars),
			is_deleted: seat.is_deleted,
		}
	}
}

pub(super) fn drawable_avatar(recorded: Option<&str>, avatars: Option<&Path>) -> Option<String> {
	recorded
		.zip(avatars)
		.and_then(|(recorded, dir)| avatars::readable(dir, recorded))
		.map(|path| path.to_string_lossy().into_owned())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ParticipantRole {
	Lead,
	Assistant,
}

impl ParticipantRole {
	fn of(role: &str) -> Self {
		match role {
			"lead" => ParticipantRole::Lead,
			_ => ParticipantRole::Assistant,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSession {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub seq: i64,
	pub started_at: i64,
}

impl From<runtime_context::RuntimeSession> for RuntimeSession {
	fn from(session: runtime_context::RuntimeSession) -> Self {
		Self {
			id: session.id,
			conversation_id: session.participant.conversation_id,
			bot_id: session.participant.bot_id,
			seq: session.seq,
			started_at: session.started_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ContextCheckpoint {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub runtime_session_id: Option<String>,
	pub last_message_seq: i64,
	pub token_count: i64,
	pub created_at: i64,
}

impl From<runtime_context::ContextCheckpoint> for ContextCheckpoint {
	fn from(checkpoint: runtime_context::ContextCheckpoint) -> Self {
		Self {
			id: checkpoint.id,
			conversation_id: checkpoint.participant.conversation_id,
			bot_id: checkpoint.participant.bot_id,
			runtime_session_id: checkpoint.runtime_session_id,
			last_message_seq: checkpoint.last_message_seq,
			token_count: checkpoint.token_count,
			created_at: checkpoint.created_at,
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::super::tests::assert_crosses_as;
	use super::*;

	#[test]
	fn an_opened_run_crosses_as_camel_case() {
		assert_crosses_as(
			RuntimeSession {
				id: "r1".into(),
				conversation_id: "c1".into(),
				bot_id: "default".into(),
				seq: 2,
				started_at: 17,
			},
			json!({
				"id": "r1",
				"conversationId": "c1",
				"botId": "default",
				"seq": 2,
				"startedAt": 17
			}),
		);
	}

	#[test]
	fn a_stored_checkpoint_crosses_as_camel_case_without_its_summary() {
		let wire = json!({
			"id": "k1",
			"conversationId": "c1",
			"botId": "default",
			"runtimeSessionId": "r1",
			"lastMessageSeq": 12,
			"tokenCount": 30,
			"createdAt": 17
		});
		assert_crosses_as(
			ContextCheckpoint {
				id: "k1".into(),
				conversation_id: "c1".into(),
				bot_id: "default".into(),
				runtime_session_id: Some("r1".into()),
				last_message_seq: 12,
				token_count: 30,
				created_at: 17,
			},
			wire.clone(),
		);
		assert!(
			!wire.to_string().contains("summary"),
			"a checkpoint carried the conversation's own words across"
		);
	}

	#[test]
	fn a_room_crosses_with_the_seats_it_holds_in_the_order_they_were_taken() {
		assert_crosses_as(
			Conversation::of(
				conversations::Conversation {
					id: "c1".into(),
					space_id: Some("personal".into()),
					section_id: None,
					pin_position: None,
					title: "Launch".into(),
					instructions: String::new(),
					icon: Some("Message".into()),
					color: Some(conversations::AvatarBlot::Cyan),
					created_at: 1,
					updated_at: 2,
					seats: vec![
						conversations::Seat {
							bot_id: "b1".into(),
							role: "lead".into(),
							joined_at: 1,
							left_at: None,
							name: "Nyx".into(),
							avatar_blot: None,
							avatar_image_path: None,
							is_deleted: false,
						},
						conversations::Seat {
							bot_id: "b2".into(),
							role: "assistant".into(),
							joined_at: 2,
							left_at: Some(3),
							name: "Ada".into(),
							avatar_blot: Some(conversations::AvatarBlot::Blue),
							avatar_image_path: None,
							is_deleted: true,
						},
					],
				},
				None,
			),
			json!({
				"id": "c1",
				"spaceId": "personal",
				"sectionId": null,
				"pinPosition": null,
				"title": "Launch",
				"instructions": "",
				"icon": "Message",
				"color": "cyan",
				"createdAt": 1,
				"updatedAt": 2,
				"participants": [
					{
						"botId": "b1",
						"role": "lead",
						"joinedAt": 1,
						"leftAt": null,
						"name": "Nyx",
						"avatarBlot": null,
						"avatarImagePath": null,
						"isDeleted": false
					},
					{
						"botId": "b2",
						"role": "assistant",
						"joinedAt": 2,
						"leftAt": 3,
						"name": "Ada",
						"avatarBlot": "blue",
						"avatarImagePath": null,
						"isDeleted": true
					}
				]
			}),
		);
	}
}
