use std::fs;
use std::future::Future;
use std::io::ErrorKind;
use std::path::Path;
use std::time::Duration;

use reqwest::Client;
use semver::Version;
use serde::Deserialize;

use super::contract::{ReleaseNotes, ReleaseNotesError};
use crate::missions::github::{headers, installed_tls_provider};
use crate::private_files;

pub const DIR_NAME: &str = "release-notes";
const RELEASES_BY_TAG: &str =
	"https://api.github.com/repos/kiroshi-app/kiroshi-monorepo/releases/tags";
const VISUAL_ASSET: &str = "whats-new.png";
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Deserialize)]
struct Release {
	body: Option<String>,
	#[serde(default)]
	assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
	name: String,
	browser_download_url: String,
}

fn notes_of(version: &str, release: Release) -> ReleaseNotes {
	let visual_url = release
		.assets
		.into_iter()
		.find(|asset| asset.name == VISUAL_ASSET)
		.map(|asset| asset.browser_download_url);
	ReleaseNotes { version: version.to_owned(), body: release.body, visual_url }
}

pub async fn release_notes<Fetch, Fetching>(
	cache: Option<&Path>,
	version: &str,
	fetch: Fetch,
) -> Result<ReleaseNotes, ReleaseNotesError>
where
	Fetch: FnOnce(String) -> Fetching,
	Fetching: Future<Output = Result<ReleaseNotes, String>>,
{
	if Version::parse(version).is_err() {
		return Err(ReleaseNotesError::InvalidVersion { version: version.to_owned() });
	}
	let file = cache.map(|dir| dir.join(format!("{version}.json")));
	if let Some(held) = file.as_deref().and_then(|file| cached(file, version)) {
		return Ok(held);
	}
	let notes = fetch(version.to_owned())
		.await
		.map_err(|detail| ReleaseNotesError::Unavailable { version: version.to_owned(), detail })?;
	if let Some(file) = file.as_deref() {
		kept(file, &notes);
	}
	Ok(notes)
}

fn cached(file: &Path, version: &str) -> Option<ReleaseNotes> {
	let bytes = match fs::read(file) {
		Ok(bytes) => bytes,
		Err(error) if error.kind() == ErrorKind::NotFound => return None,
		Err(error) => {
			eprintln!("warn: the cached release notes of {version} were unread: {error}");
			return None;
		}
	};
	match serde_json::from_slice(&bytes) {
		Ok(notes) => Some(notes),
		Err(error) => {
			eprintln!("warn: the cached release notes of {version} did not parse: {error}");
			None
		}
	}
}

fn kept(file: &Path, notes: &ReleaseNotes) {
	let written = serde_json::to_vec(notes)
		.map_err(std::io::Error::other)
		.and_then(|bytes| private_files::replace_atomically(file, &bytes));
	if let Err(error) = written {
		eprintln!("warn: the release notes of {} were not cached: {error}", notes.version);
	}
}

pub async fn fetched(version: String) -> Result<ReleaseNotes, String> {
	installed_tls_provider();
	let client = Client::builder()
		.timeout(TIMEOUT)
		.default_headers(headers())
		.build()
		.map_err(|error| format!("the http client was not built: {error}"))?;
	let release: Release = client
		.get(format!("{RELEASES_BY_TAG}/v{version}"))
		.send()
		.await
		.and_then(|response| response.error_for_status())
		.map_err(|error| error.to_string())?
		.json()
		.await
		.map_err(|error| error.to_string())?;
	Ok(notes_of(&version, release))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;

	fn release(json: serde_json::Value) -> Release {
		serde_json::from_value(json).expect("a release")
	}

	fn the_notes() -> ReleaseNotes {
		ReleaseNotes {
			version: "0.25.0".to_owned(),
			body: Some("What changed".to_owned()),
			visual_url: Some("https://example.test/whats-new.png".to_owned()),
		}
	}

	#[test]
	fn the_visual_is_the_whats_new_asset() {
		let notes = notes_of(
			"0.25.0",
			release(serde_json::json!({
				"body": "What changed",
				"assets": [
					{ "name": "Kiroshi.dmg", "browser_download_url": "https://example.test/Kiroshi.dmg" },
					{ "name": "whats-new.png", "browser_download_url": "https://example.test/whats-new.png" },
				],
			})),
		);

		assert_eq!(notes, the_notes());
	}

	#[test]
	fn a_release_without_the_whats_new_asset_has_no_visual() {
		let notes = notes_of(
			"0.25.0",
			release(serde_json::json!({
				"body": null,
				"assets": [
					{ "name": "Kiroshi.dmg", "browser_download_url": "https://example.test/Kiroshi.dmg" },
				],
			})),
		);

		assert_eq!(
			notes,
			ReleaseNotes { version: "0.25.0".to_owned(), body: None, visual_url: None }
		);
	}

	#[tokio::test]
	async fn notes_answered_once_are_answered_from_the_cache_when_the_fetch_fails() {
		let dir = temp_dir();

		let first = release_notes(Some(&dir), "0.25.0", |_| async { Ok(the_notes()) }).await;
		let second =
			release_notes(Some(&dir), "0.25.0", |_| async { Err("offline".to_owned()) }).await;

		assert_eq!(first, Ok(the_notes()));
		assert_eq!(second, Ok(the_notes()));
	}

	#[tokio::test]
	async fn without_a_cache_a_failed_fetch_names_the_version() {
		let dir = temp_dir();

		let answered =
			release_notes(Some(&dir), "0.25.0", |_| async { Err("offline".to_owned()) }).await;

		assert_eq!(
			answered,
			Err(ReleaseNotesError::Unavailable {
				version: "0.25.0".to_owned(),
				detail: "offline".to_owned(),
			})
		);
	}

	#[tokio::test]
	async fn a_version_that_is_not_semver_never_reaches_the_cache_or_the_network() {
		let dir = temp_dir();

		let answered = release_notes(Some(&dir), "../escape", |_| async { Ok(the_notes()) }).await;

		assert_eq!(
			answered,
			Err(ReleaseNotesError::InvalidVersion { version: "../escape".to_owned() })
		);
		assert!(fs::read_dir(&*dir).expect("the dir reads").next().is_none());
	}
}
