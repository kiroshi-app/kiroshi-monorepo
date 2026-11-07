use kiroshi_core::library::contract::{
	BOARD_FILE_REPLACED_EVENT, DOCUMENT_PRESENCE_EVENT, DOCUMENT_RENAMED_EVENT,
	DOCUMENT_UPDATED_EVENT, LibraryBoardFileReplaced, LibraryDocumentPresence,
	LibraryDocumentRenamed, LibraryDocumentUpdated,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

#[derive(Debug, PartialEq)]
pub enum Heard {
	Updated(LibraryDocumentUpdated),
	Presence(LibraryDocumentPresence),
	Replaced(LibraryBoardFileReplaced),
	Renamed(LibraryDocumentRenamed),
}

fn read<T: DeserializeOwned>(
	payload: Value,
	heard: fn(T) -> Heard,
) -> Result<Heard, serde_json::Error> {
	serde_json::from_value(payload).map(heard)
}

pub fn heard_of(event: &str, payload: Value) -> Option<Result<Heard, serde_json::Error>> {
	match event {
		DOCUMENT_UPDATED_EVENT => Some(read(payload, Heard::Updated)),
		DOCUMENT_PRESENCE_EVENT => Some(read(payload, Heard::Presence)),
		BOARD_FILE_REPLACED_EVENT => Some(read(payload, Heard::Replaced)),
		DOCUMENT_RENAMED_EVENT => Some(read(payload, Heard::Renamed)),
		_ => None,
	}
}
