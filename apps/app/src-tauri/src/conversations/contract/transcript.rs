use serde::{Deserialize, Serialize};

use crate::agent::contract::TransportError;
use crate::conversations::summons::SummonsDropReason;
use crate::db::repositories::{arrivals, messages};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TranscriptRole {
	User,
	Assistant,
}

impl From<messages::MessageRole> for TranscriptRole {
	fn from(role: messages::MessageRole) -> Self {
		match role {
			messages::MessageRole::User => TranscriptRole::User,
			messages::MessageRole::Assistant => TranscriptRole::Assistant,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum WrittenFrom {
	Here,
	Relay,
}

impl From<messages::WrittenFrom> for WrittenFrom {
	fn from(written_from: messages::WrittenFrom) -> Self {
		match written_from {
			messages::WrittenFrom::Here => WrittenFrom::Here,
			messages::WrittenFrom::Relay => WrittenFrom::Relay,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TranscriptCompletion {
	Pending,
	Streaming,
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl From<messages::MessageState> for TranscriptCompletion {
	fn from(state: messages::MessageState) -> Self {
		match state {
			messages::MessageState::Pending => TranscriptCompletion::Pending,
			messages::MessageState::Streaming => TranscriptCompletion::Streaming,
			messages::MessageState::Complete => TranscriptCompletion::Complete,
			messages::MessageState::Cancelled => TranscriptCompletion::Cancelled,
			messages::MessageState::Failed => TranscriptCompletion::Failed,
			messages::MessageState::Interrupted => TranscriptCompletion::Interrupted,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TerminalCompletion {
	Complete,
	Cancelled,
	Failed,
	Interrupted,
}

impl From<TerminalCompletion> for messages::TerminalState {
	fn from(completion: TerminalCompletion) -> Self {
		match completion {
			TerminalCompletion::Complete => messages::TerminalState::Complete,
			TerminalCompletion::Cancelled => messages::TerminalState::Cancelled,
			TerminalCompletion::Failed => messages::TerminalState::Failed,
			TerminalCompletion::Interrupted => messages::TerminalState::Interrupted,
		}
	}
}

pub const MESSAGE_STORED_EVENT: &str = "conversation://message-stored";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub seq: i64,
	pub role: TranscriptRole,
	pub content: String,
	pub completion: TranscriptCompletion,
	pub created_at: i64,
	pub author_bot_id: Option<String>,
	pub author_account_id: Option<String>,
	pub author_name: Option<String>,
	#[specta(optional)]
	pub written_from: Option<WrittenFrom>,
	pub replied_to_message_id: Option<String>,
	pub runtime_session_id: Option<String>,
}

impl TranscriptMessage {
	pub fn of(conversation_id: &str, stored: messages::StoredMessage) -> Self {
		Self {
			id: stored.id,
			conversation_id: conversation_id.to_owned(),
			turn_id: stored.turn_id,
			seq: stored.seq,
			role: stored.role.into(),
			author_bot_id: stored.author_bot_id,
			author_account_id: stored.author.account_id,
			author_name: stored.author.name,
			written_from: stored.written_from.map(Into::into),
			content: stored.content,
			completion: stored.state.into(),
			created_at: stored.created_at,
			replied_to_message_id: stored.replied_to_message_id,
			runtime_session_id: stored.runtime_session_id,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PinnedBubble {
	pub message: TranscriptMessage,
	pub block_index: i64,
	pub pinned_at: i64,
}

impl PinnedBubble {
	pub fn of(conversation_id: &str, stored: messages::StoredPin) -> Self {
		Self {
			message: TranscriptMessage::of(conversation_id, stored.message),
			block_index: stored.block_index,
			pinned_at: stored.pinned_at,
		}
	}
}

const EXCERPT_LIMIT: usize = 280;

pub(in crate::conversations) fn message_uri(conversation_id: &str, message_id: &str) -> String {
	format!("kiroshi://c/{conversation_id}/m/{message_id}")
}

fn excerpt_of(content: &str) -> String {
	if content.chars().count() <= EXCERPT_LIMIT {
		return content.to_owned();
	}
	let kept: String = content.chars().take(EXCERPT_LIMIT - 1).collect();
	format!("{kept}\u{2026}")
}

pub struct MessageRun {
	pub runtime_session_id: Option<String>,
	pub provider_session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MessageReference {
	pub uri: String,
	pub conversation_id: String,
	pub message_id: String,
	pub role: TranscriptRole,
	pub seq: i64,
	pub created_at: i64,
	pub excerpt: String,
	pub runtime_session_id: Option<String>,
	pub provider_session_id: Option<String>,
}

impl MessageReference {
	pub fn of(conversation_id: String, stored: messages::StoredMessage, run: MessageRun) -> Self {
		Self {
			uri: message_uri(&conversation_id, &stored.id),
			conversation_id,
			message_id: stored.id,
			role: stored.role.into(),
			seq: stored.seq,
			created_at: stored.created_at,
			excerpt: excerpt_of(&stored.content),
			runtime_session_id: run.runtime_session_id,
			provider_session_id: run.provider_session_id,
		}
	}
}

pub const COMPANION_ARRIVED_EVENT: &str = "conversation://companion-arrived";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionArrival {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub invited_by_bot_id: Option<String>,
	pub last_message_seq: i64,
	pub created_at: i64,
}

pub const COMPANION_SPOKE_EVENT: &str = "conversation://companion-spoke";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompanionSpoke {
	pub conversation_id: String,
	pub author_bot_id: String,
	pub text: String,
}

pub const SUMMONS_DROPPED_EVENT: &str = "conversation://summons-dropped";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummonsDropped {
	pub conversation_id: String,
	pub turn_id: String,
	pub bot_id: String,
	pub reason: SummonsDropReason,
	pub error: Option<TransportError>,
}

impl From<arrivals::Arrival> for CompanionArrival {
	fn from(arrival: arrivals::Arrival) -> Self {
		Self {
			id: arrival.id,
			conversation_id: arrival.conversation_id,
			bot_id: arrival.bot_id,
			invited_by_bot_id: arrival.invited_by_bot_id,
			last_message_seq: arrival.last_message_seq,
			created_at: arrival.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPage {
	pub conversation_id: String,
	pub messages: Vec<TranscriptMessage>,
	pub arrivals: Vec<CompanionArrival>,
	pub has_more: bool,
}

impl TranscriptPage {
	pub fn of(conversation_id: String, page: messages::MessagePage) -> Self {
		let messages = page
			.messages
			.into_iter()
			.map(|stored| TranscriptMessage::of(&conversation_id, stored))
			.collect();
		let arrivals = page.arrivals.into_iter().map(Into::into).collect();
		Self { conversation_id, messages, arrivals, has_more: page.has_more }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptWindow {
	pub conversation_id: String,
	pub messages: Vec<TranscriptMessage>,
	pub arrivals: Vec<CompanionArrival>,
	pub has_older: bool,
	pub has_newer: bool,
}

impl TranscriptWindow {
	pub fn of(conversation_id: String, around: messages::MessagesAround) -> Self {
		let messages = around
			.messages
			.into_iter()
			.map(|stored| TranscriptMessage::of(&conversation_id, stored))
			.collect();
		let arrivals = around.arrivals.into_iter().map(Into::into).collect();
		Self {
			conversation_id,
			messages,
			arrivals,
			has_older: around.has_older,
			has_newer: around.has_newer,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewTurn {
	pub id: String,
	pub conversation_id: String,
	pub started_at: i64,
}

impl From<NewTurn> for messages::NewTurn {
	fn from(turn: NewTurn) -> Self {
		Self { id: turn.id, conversation_id: turn.conversation_id, started_at: turn.started_at }
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewUserMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub content: String,
	pub created_at: i64,
}

impl NewUserMessage {
	pub fn written_by(
		self,
		author: messages::AccountAuthor,
		written_from: messages::WrittenFrom,
	) -> messages::NewUserMessage {
		let author = match self.author_bot_id {
			Some(_) => messages::AccountAuthor::default(),
			None => author,
		};
		messages::NewUserMessage {
			id: self.id,
			conversation_id: self.conversation_id,
			turn_id: self.turn_id,
			author_bot_id: self.author_bot_id,
			author,
			written_from,
			replied_to_message_id: self.replied_to_message_id,
			content: self.content,
			created_at: self.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SentMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub content: String,
	pub created_at: i64,
	pub replied_to_message_id: Option<String>,
}

impl From<SentMessage> for NewUserMessage {
	fn from(sent: SentMessage) -> Self {
		Self {
			id: sent.id,
			conversation_id: sent.conversation_id,
			turn_id: sent.turn_id,
			author_bot_id: None,
			replied_to_message_id: sent.replied_to_message_id,
			content: sent.content,
			created_at: sent.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewAssistantMessage {
	pub id: String,
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: Option<String>,
	pub replied_to_message_id: Option<String>,
	pub created_at: i64,
}

impl From<NewAssistantMessage> for messages::NewAssistantMessage {
	fn from(message: NewAssistantMessage) -> Self {
		Self {
			id: message.id,
			conversation_id: message.conversation_id,
			turn_id: message.turn_id,
			author_bot_id: message.author_bot_id,
			replied_to_message_id: message.replied_to_message_id,
			created_at: message.created_at,
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, Value};

	use super::super::tests::{a_message, a_message_wire, assert_crosses_as};
	use super::super::TranscriptStoreError;
	use super::*;

	#[test]
	fn every_role_and_completion_crosses_as_one_camel_case_word() {
		for (role, wire) in
			[(TranscriptRole::User, "user"), (TranscriptRole::Assistant, "assistant")]
		{
			assert_crosses_as(role, json!(wire));
		}
		for (written_from, wire) in [(WrittenFrom::Here, "here"), (WrittenFrom::Relay, "relay")] {
			assert_crosses_as(written_from, json!(wire));
		}
		for (completion, wire) in [
			(TranscriptCompletion::Pending, "pending"),
			(TranscriptCompletion::Streaming, "streaming"),
			(TranscriptCompletion::Complete, "complete"),
			(TranscriptCompletion::Cancelled, "cancelled"),
			(TranscriptCompletion::Failed, "failed"),
			(TranscriptCompletion::Interrupted, "interrupted"),
		] {
			assert_crosses_as(completion, json!(wire));
		}
		for (ending, wire) in [
			(TerminalCompletion::Complete, "complete"),
			(TerminalCompletion::Cancelled, "cancelled"),
			(TerminalCompletion::Failed, "failed"),
			(TerminalCompletion::Interrupted, "interrupted"),
		] {
			assert_crosses_as(ending, json!(wire));
		}
	}

	#[test]
	fn a_message_and_the_page_holding_it_cross_as_camel_case() {
		assert_crosses_as(a_message(), a_message_wire());
		assert_crosses_as(
			TranscriptPage {
				conversation_id: "c1".into(),
				messages: vec![a_message()],
				arrivals: vec![CompanionArrival {
					id: "a1".into(),
					conversation_id: "c1".into(),
					bot_id: "b2".into(),
					invited_by_bot_id: Some("b1".into()),
					last_message_seq: 3,
					created_at: 9,
				}],
				has_more: true,
			},
			json!({
				"conversationId": "c1",
				"messages": [a_message_wire()],
				"arrivals": [{
					"id": "a1",
					"conversationId": "c1",
					"botId": "b2",
					"invitedByBotId": "b1",
					"lastMessageSeq": 3,
					"createdAt": 9
				}],
				"hasMore": true
			}),
		);
	}

	#[test]
	fn a_window_centred_on_a_message_crosses_as_camel_case() {
		assert_crosses_as(
			TranscriptWindow {
				conversation_id: "c1".into(),
				messages: vec![a_message()],
				arrivals: Vec::new(),
				has_older: true,
				has_newer: false,
			},
			json!({
				"conversationId": "c1",
				"messages": [a_message_wire()],
				"arrivals": [],
				"hasOlder": true,
				"hasNewer": false
			}),
		);
		assert_crosses_as(
			TranscriptStoreError::UnknownMessageSeq { conversation_id: "c1".into(), seq: 7 },
			json!({ "kind": "unknownMessageSeq", "conversationId": "c1", "seq": 7 }),
		);
	}

	#[test]
	fn a_bot_authored_user_message_carries_no_account_author() {
		let author = messages::AccountAuthor {
			account_id: Some("owner".into()),
			name: Some("Ada".into()),
			..Default::default()
		};
		let message = |author_bot_id: Option<&str>| NewUserMessage {
			id: "m1".into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: author_bot_id.map(Into::into),
			replied_to_message_id: None,
			content: "hello".into(),
			created_at: 1,
		};

		let written_by = |message: NewUserMessage| {
			message.written_by(author.clone(), messages::WrittenFrom::Here).author
		};
		assert_eq!(written_by(message(Some("b1"))), Default::default());
		assert_eq!(written_by(message(None)), author);
	}

	#[test]
	fn every_write_a_caller_submits_crosses_as_camel_case() {
		assert_crosses_as(
			NewTurn { id: "t1".into(), conversation_id: "c1".into(), started_at: 1 },
			json!({ "id": "t1", "conversationId": "c1", "startedAt": 1 }),
		);
		assert_crosses_as(
			NewUserMessage {
				id: "m1".into(),
				conversation_id: "c1".into(),
				turn_id: "t1".into(),
				author_bot_id: None,
				replied_to_message_id: None,
				content: "hello".into(),
				created_at: 1,
			},
			json!({
				"id": "m1",
				"conversationId": "c1",
				"turnId": "t1",
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": "hello",
				"createdAt": 1
			}),
		);
		assert_crosses_as(
			NewAssistantMessage {
				id: "m2".into(),
				conversation_id: "c1".into(),
				turn_id: "t1".into(),
				author_bot_id: Some("default".into()),
				replied_to_message_id: Some("m1".into()),
				created_at: 2,
			},
			json!({
				"id": "m2",
				"conversationId": "c1",
				"turnId": "t1",
				"authorBotId": "default",
				"repliedToMessageId": "m1",
				"createdAt": 2
			}),
		);
	}

	#[test]
	fn every_ending_a_caller_may_report_maps_onto_the_one_the_transcript_stores() {
		for (reported, stored) in [
			(TerminalCompletion::Complete, messages::TerminalState::Complete),
			(TerminalCompletion::Cancelled, messages::TerminalState::Cancelled),
			(TerminalCompletion::Failed, messages::TerminalState::Failed),
			(TerminalCompletion::Interrupted, messages::TerminalState::Interrupted),
		] {
			assert_eq!(messages::TerminalState::from(reported), stored);
		}
	}

	fn transcript_mirror() -> String {
		let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("..")
			.join("src")
			.join("lib")
			.join("conversations")
			.join("transcript-contract.ts");
		std::fs::read_to_string(&path).expect("the mirror reads")
	}

	fn mirrored_fields(mirror: &str, alias: &str) -> std::collections::BTreeSet<String> {
		let opening = format!("export type {alias} = {{\n");
		let start =
			mirror.find(&opening).unwrap_or_else(|| panic!("the mirror declares no {alias}"))
				+ opening.len();
		let body = &mirror[start..];
		let body = body.split("\n}").next().unwrap_or(body);
		body.lines()
			.filter_map(|line| line.split_once(':'))
			.map(|(name, _)| name.trim().to_owned())
			.collect()
	}

	#[test]
	fn the_companion_spoke_event_is_named_and_shaped_like_its_mirror() {
		let mirror = transcript_mirror();
		let spoke = CompanionSpoke {
			conversation_id: "c1".to_owned(),
			author_bot_id: "b1".to_owned(),
			text: "Hello".to_owned(),
		};
		let fields = match serde_json::to_value(&spoke).expect("the payload serialises") {
			Value::Object(fields) => fields.keys().cloned().collect(),
			other => panic!("the payload crossed as {other}"),
		};

		assert!(
			mirror.contains(&format!(
				"export const COMPANION_SPOKE_EVENT = \"{COMPANION_SPOKE_EVENT}\""
			)),
			"the mirror names the event otherwise"
		);
		assert_eq!(mirrored_fields(&mirror, "CompanionSpoke"), fields);
	}
}
