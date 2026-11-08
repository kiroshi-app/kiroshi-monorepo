use kiroshi_core::library::contract::{
	CHANGED_EVENT, DOCUMENT_PRESENCE_EVENT, DOCUMENT_RENAMED_EVENT, DOCUMENT_UPDATED_EVENT,
	DOCUMENT_WRITER_FINISHED_EVENT, LibraryChanged, LibraryDocumentPresence,
	LibraryDocumentRenamed, LibraryDocumentUpdated, LibraryDocumentWriterFinished,
};
use serde::de::DeserializeOwned;
use serde_json::Value;

#[derive(Debug, PartialEq)]
pub enum Heard {
	Changed(LibraryChanged),
	Updated(LibraryDocumentUpdated),
	Renamed(LibraryDocumentRenamed),
	Presence(LibraryDocumentPresence),
	Finished(LibraryDocumentWriterFinished),
}

fn read<T: DeserializeOwned>(
	payload: Value,
	heard: fn(T) -> Heard,
) -> Result<Heard, serde_json::Error> {
	serde_json::from_value(payload).map(heard)
}

pub fn heard_of(event: &str, payload: Value) -> Option<Result<Heard, serde_json::Error>> {
	match event {
		CHANGED_EVENT => Some(read(payload, Heard::Changed)),
		DOCUMENT_UPDATED_EVENT => Some(read(payload, Heard::Updated)),
		DOCUMENT_RENAMED_EVENT => Some(read(payload, Heard::Renamed)),
		DOCUMENT_PRESENCE_EVENT => Some(read(payload, Heard::Presence)),
		DOCUMENT_WRITER_FINISHED_EVENT => Some(read(payload, Heard::Finished)),
		_ => None,
	}
}
