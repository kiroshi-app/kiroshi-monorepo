use kiroshi_core::attachments::contract::AttachmentStoreError;
use kiroshi_rune_kit::strings::{Key, Language, chat, common};
use kiroshi_rune_kit::surfaces::s06_composer::filled;
use rune::FileDialogError;

use super::worker::{Refusal, Unread};
use crate::host::HostError;

const MEGABYTE: u64 = 1024 * 1024;

#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
	pub title: String,
	pub description: String,
}

fn said(key: Key) -> &'static str {
	key.text(Language::En)
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn megabytes(bytes: u64) -> String {
	let size = (bytes as f64 / MEGABYTE as f64).round().to_string();
	filled(said(chat::screen::attachment::MEGABYTES), &[("size", &size)])
}

fn described(refusal: &AttachmentStoreError) -> String {
	use chat::screen::attachment as copy;
	match refusal {
		AttachmentStoreError::Unavailable { failure }
		| AttachmentStoreError::Storage { failure } => {
			filled(said(copy::STORAGE), &[("failure", &format!("{failure:?}"))])
		}
		AttachmentStoreError::UnknownConversation { .. } => {
			said(copy::UNKNOWN_CONVERSATION).to_owned()
		}
		AttachmentStoreError::TooMany { count, limit } => filled(
			said(copy::TOO_MANY),
			&[("limit", &limit.to_string()), ("staged", &count.to_string())],
		),
		AttachmentStoreError::TooLarge { name, limit, .. } => {
			filled(said(copy::TOO_LARGE), &[("name", name), ("limit", &megabytes(*limit))])
		}
		AttachmentStoreError::TooLargeTogether { bytes, limit } => filled(
			said(copy::TOO_LARGE_TOGETHER),
			&[("bytes", &megabytes(*bytes)), ("limit", &megabytes(*limit))],
		),
		AttachmentStoreError::Unreadable { name, .. } => {
			filled(said(copy::UNREADABLE), &[("name", name)])
		}
		AttachmentStoreError::Unwritable { detail } => {
			filled(said(copy::UNWRITABLE), &[("detail", detail)])
		}
	}
}

fn store_refusal(failure: &HostError) -> String {
	let HostError::CommandFailed { body, .. } = failure else { return failure_text(failure) };
	match serde_json::from_str::<AttachmentStoreError>(body) {
		Ok(refusal) => described(&refusal),
		Err(_) => failure_text(failure),
	}
}

impl Notice {
	fn of(title: String, description: String) -> Notice {
		Notice { title, description }
	}

	pub fn refused(refusal: &Refusal) -> Notice {
		match refusal {
			Refusal::Seat { name, failure } => Notice::of(
				filled(said(chat::conversation_seating::REFUSED), &[("name", name)]),
				failure_text(failure),
			),
			Refusal::Store(failure) => Notice::of(
				said(chat::screen::ATTACHMENTS_REFUSED).to_owned(),
				store_refusal(failure),
			),
		}
	}

	pub fn unsent(failure: &HostError) -> Notice {
		Notice::of(
			filled(said(chat::screen::transport::WRITE_FAILED), &[("detail", &failure.title())]),
			failure.detail(),
		)
	}

	pub fn unread(unread: &Unread) -> Notice {
		Notice::of(
			said(chat::screen::ATTACHMENTS_REFUSED).to_owned(),
			format!(
				"{} {}",
				filled(said(chat::screen::attachment::UNREADABLE), &[("name", &unread.name)]),
				unread.cause
			),
		)
	}

	pub fn not_browsed(failure: &FileDialogError) -> Notice {
		Notice::of(said(chat::screen::ATTACHMENTS_REFUSED).to_owned(), failure.to_string())
	}

	pub fn commands_unread(failure: &HostError) -> Notice {
		Notice::of(said(chat::screen::notice::UNAVAILABLE).to_owned(), failure_text(failure))
	}

	pub fn library_unread(failure: &HostError) -> Notice {
		Notice::of(said(common::library::failure::LIST).to_owned(), failure_text(failure))
	}

	pub fn not_stopped(failure: Option<&HostError>) -> Notice {
		let description = failure.map(failure_text).unwrap_or_default();
		Notice::of(said(chat::screen::notice::STOP_FAILED).to_owned(), description)
	}
}
