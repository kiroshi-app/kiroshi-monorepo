use kiroshi_core::conversations::contract::{
	CREATED_EVENT, ConversationInPage, DELETED_EVENT, ObservedState, STATE_CHANGED_EVENT,
	UPDATED_EVENT,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

#[derive(Debug)]
pub enum Heard {
	Stored(Box<ConversationInPage>),
	Deleted { conversation_id: String },
	StateChanged { conversation_id: String, observed: ObservedState },
}

fn field<T: DeserializeOwned>(payload: &Value, name: &str) -> Result<T, serde_json::Error> {
	serde_json::from_value(payload.get(name).cloned().unwrap_or(Value::Null))
}

fn state_changed(payload: Value) -> Result<Heard, serde_json::Error> {
	let conversation_id = field(&payload, "conversationId")?;
	let observed = serde_json::from_value(payload)?;
	Ok(Heard::StateChanged { conversation_id, observed })
}

pub fn heard_of(event: &str, payload: Value) -> Option<Result<Heard, serde_json::Error>> {
	match event {
		CREATED_EVENT | UPDATED_EVENT => {
			Some(field(&payload, "conversation").map(|row| Heard::Stored(Box::new(row))))
		}
		DELETED_EVENT => Some(
			field(&payload, "conversationId")
				.map(|conversation_id| Heard::Deleted { conversation_id }),
		),
		STATE_CHANGED_EVENT => Some(state_changed(payload)),
		_ => None,
	}
}
