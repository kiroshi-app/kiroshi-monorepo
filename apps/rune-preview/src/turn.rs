use std::fmt;
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use serde_json::{Value, json};
use uuid::Uuid;

use crate::host::HostError;
use crate::source::Source;

pub enum SendError {
	Clock(SystemTimeError),
	Host(HostError),
}

impl fmt::Display for SendError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			SendError::Clock(failure) => write!(f, "The clock reads before 1970: {failure}"),
			SendError::Host(failure) => write!(f, "{} {}", failure.title(), failure.detail()),
		}
	}
}

pub fn send_turn(
	host: &Source,
	conversation_id: &str,
	content: &str,
	summoned: &[String],
) -> Result<(), SendError> {
	let created_at =
		SystemTime::now().duration_since(UNIX_EPOCH).map_err(SendError::Clock)?.as_millis() as u64;
	let message = json!({
		"id": Uuid::new_v4().to_string(),
		"conversationId": conversation_id,
		"turnId": Uuid::new_v4().to_string(),
		"content": content,
		"createdAt": created_at,
		"repliedToMessageId": Value::Null,
	});
	host.invoke_turn::<Value>(
		"conversation_send_turn",
		json!({ "message": message, "summoned": summoned }),
	)
	.map(|_| ())
	.map_err(SendError::Host)
}
