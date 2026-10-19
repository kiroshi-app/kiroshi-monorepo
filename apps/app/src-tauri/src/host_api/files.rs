use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use axum::extract::{Path as Segments, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use tauri::Runtime;

use super::events;
use super::invoke::BYTES;
use crate::attachments::Attachments;
use crate::avatars::Avatars;
use crate::file_store::FileStore;
use crate::routines::webhook::Calls;

pub const AVATAR_PATH: &str = "/api/files/avatars/{file}";

pub const ATTACHMENT_PATH: &str = "/api/files/attachments/{conversation_id}/{file}";

const SEPARATORS: [char; 2] = ['/', '\\'];

const SVG: &str = "image/svg+xml";

const TEXT: &str = "text/plain; charset=utf-8";

const CONTENT_TYPES: [(&str, &str); 12] = [
	("png", "image/png"),
	("jpg", "image/jpeg"),
	("jpeg", "image/jpeg"),
	("gif", "image/gif"),
	("webp", "image/webp"),
	("svg", SVG),
	("pdf", "application/pdf"),
	("txt", TEXT),
	("log", TEXT),
	("json", TEXT),
	("md", TEXT),
	("csv", TEXT),
];

pub(crate) const INERT: &str = "default-src 'none'; sandbox";

pub(crate) const NO_SNIFF: &str = "nosniff";

const MISSING: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no file answers this path");

const UNREAD: (StatusCode, &str) = (StatusCode::INTERNAL_SERVER_ERROR, "the file was not read");

pub(crate) fn route<R: Runtime>(calls: Calls<R>) -> Router<Calls<R>> {
	Router::new()
		.route(AVATAR_PATH, get(avatar::<R>))
		.route(ATTACHMENT_PATH, get(attachment::<R>))
		.route_layer(middleware::from_fn_with_state(calls, events::guarded::<R>))
}

async fn avatar<R: Runtime>(
	State(calls): State<Calls<R>>,
	Segments(file): Segments<String>,
) -> Response {
	served(Avatars::dir(&calls.app), vec![file]).await
}

async fn attachment<R: Runtime>(
	State(calls): State<Calls<R>>,
	Segments((conversation_id, file)): Segments<(String, String)>,
) -> Response {
	served(Attachments::dir(&calls.app), vec![conversation_id, file]).await
}

async fn served(root: Option<PathBuf>, segments: Vec<String>) -> Response {
	let Some(root) = root else {
		eprintln!("a host api file was not read: the app has no data directory");
		return UNREAD.into_response();
	};
	match tokio::task::spawn_blocking(move || read(&root, &segments)).await {
		Ok(answer) => answer,
		Err(failure) => {
			eprintln!("a host api file was not read: the read stopped: {failure}");
			UNREAD.into_response()
		}
	}
}

fn read(root: &Path, segments: &[String]) -> Response {
	let Some(path) = confined(root, segments) else {
		return MISSING.into_response();
	};
	match std::fs::read(&path) {
		Ok(bytes) => answered(&path, bytes),
		Err(missing) if missing.kind() == ErrorKind::NotFound => MISSING.into_response(),
		Err(failure) => {
			eprintln!("a host api file was not read: {failure}");
			UNREAD.into_response()
		}
	}
}

fn confined(root: &Path, segments: &[String]) -> Option<PathBuf> {
	if !segments.iter().all(|segment| plain(segment)) {
		return None;
	}
	let (file, dirs) = segments.split_last()?;
	let expected = dirs.iter().fold(root.canonicalize().ok()?, |dir, segment| dir.join(segment));
	let resolved = expected.join(file).canonicalize().ok()?;
	(resolved.parent() == Some(expected.as_path()) && resolved.is_file()).then_some(resolved)
}

fn plain(segment: &str) -> bool {
	!matches!(segment, "" | "." | "..") && !segment.contains(SEPARATORS)
}

fn answered(path: &Path, bytes: Vec<u8>) -> Response {
	let content_type = content_type(path);
	let mut response =
		([(header::CONTENT_TYPE, content_type), (header::X_CONTENT_TYPE_OPTIONS, NO_SNIFF)], bytes)
			.into_response();
	if matches!(content_type, SVG | TEXT) {
		response
			.headers_mut()
			.insert(header::CONTENT_SECURITY_POLICY, HeaderValue::from_static(INERT));
	}
	response
}

fn content_type(path: &Path) -> &'static str {
	let Some(extension) = path.extension().and_then(|extension| extension.to_str()) else {
		return BYTES;
	};
	CONTENT_TYPES
		.iter()
		.find(|(known, _)| known.eq_ignore_ascii_case(extension))
		.map_or(BYTES, |(_, content_type)| content_type)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_segment_that_could_leave_its_directory_is_not_plain() {
		for segment in ["", ".", "..", "a/b", "a\\b", "/"] {
			assert!(!plain(segment), "{segment:?}");
		}
		assert!(plain("a.png"));
		assert!(plain("..a"));
	}

	#[test]
	fn the_content_type_follows_the_extension() {
		assert_eq!(content_type(Path::new("a.png")), "image/png");
		assert_eq!(content_type(Path::new("a.JPG")), "image/jpeg");
		assert_eq!(content_type(Path::new("a.bin")), BYTES);
		assert_eq!(content_type(Path::new("a")), BYTES);
	}

	#[test]
	fn a_stored_text_file_is_answered_as_inert_plain_text() {
		for name in ["a.log", "a.json", "a.md", "a.csv", "a.txt", "a.JSON"] {
			let response = answered(Path::new(name), b"{}".to_vec());
			let headers = response.headers();
			assert_eq!(headers[header::CONTENT_TYPE], TEXT, "{name}");
			assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], NO_SNIFF, "{name}");
			assert_eq!(headers[header::CONTENT_SECURITY_POLICY], INERT, "{name}");
		}
	}
}
