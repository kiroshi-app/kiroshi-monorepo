mod bot;
mod error;
mod room;
mod transcript;

pub use bot::*;
pub use error::*;
pub use room::*;
pub use transcript::*;

#[cfg(test)]
mod tests {
	use serde::de::DeserializeOwned;
	use serde::Serialize;
	use serde_json::{json, Value};

	use super::*;

	pub(super) fn assert_crosses_as<T>(value: T, wire: Value)
	where
		T: std::fmt::Debug + PartialEq + Serialize + DeserializeOwned,
	{
		assert_eq!(
			serde_json::to_value(&value).expect("the value serializes"),
			wire,
			"the shape crossing to the frontend changed"
		);
		assert_eq!(
			serde_json::from_value::<T>(wire).expect("the wire shape parses"),
			value,
			"what the frontend sends under these names did not come home"
		);
	}

	pub(super) fn a_message() -> TranscriptMessage {
		TranscriptMessage {
			id: "m1".into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			seq: 1,
			role: TranscriptRole::Assistant,
			content: "hi there".into(),
			completion: TranscriptCompletion::Complete,
			created_at: 2,
			author_bot_id: Some("default".into()),
			author_account_id: None,
			author_name: None,
			written_from: None,
			replied_to_message_id: Some("m0".into()),
			runtime_session_id: Some("run-1".into()),
		}
	}

	pub(super) fn a_message_wire() -> Value {
		json!({
			"id": "m1",
			"conversationId": "c1",
			"turnId": "t1",
			"seq": 1,
			"role": "assistant",
			"content": "hi there",
			"completion": "complete",
			"createdAt": 2,
			"authorBotId": "default",
			"authorAccountId": null,
			"authorName": null,
			"writtenFrom": null,
			"repliedToMessageId": "m0",
			"runtimeSessionId": "run-1"
		})
	}
}
