use kiroshi_core::companions::contract::{DELETED_EVENT, UPDATED_EVENT};
use kiroshi_core::conversations::contract::Bot;
use serde::de::DeserializeOwned;
use serde_json::Value;

#[derive(Debug, PartialEq)]
pub enum Heard {
	Updated(Box<Bot>),
	Deleted { id: String },
}

fn field<T: DeserializeOwned>(payload: &Value, name: &str) -> Result<T, serde_json::Error> {
	serde_json::from_value(payload.get(name).cloned().unwrap_or(Value::Null))
}

pub fn heard_of(event: &str, payload: Value) -> Option<Result<Heard, serde_json::Error>> {
	match event {
		UPDATED_EVENT => Some(field(&payload, "bot").map(|bot| Heard::Updated(Box::new(bot)))),
		DELETED_EVENT => Some(field(&payload, "id").map(|id| Heard::Deleted { id })),
		_ => None,
	}
}
