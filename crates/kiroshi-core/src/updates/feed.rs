use std::collections::BTreeMap;

use semver::Version;
use serde::Deserialize;

use super::source::RunningApp;

#[derive(Debug, Deserialize)]
pub(super) struct Feed {
	version: String,
	platforms: BTreeMap<String, Artifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub(super) struct Artifact {
	pub url: String,
	pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Offer {
	pub version: String,
	pub artifact: Artifact,
}

impl Feed {
	pub fn offer_for(mut self, running: &RunningApp) -> Result<Option<Offer>, String> {
		let version = Version::parse(self.version.trim_start_matches('v'))
			.map_err(|error| format!("the feed names {} as its version: {error}", self.version))?;
		if !is_offered(&running.version, &version) {
			return Ok(None);
		}
		let artifact = self.platforms.remove(&running.platform).ok_or_else(|| {
			format!("the release {version} lists no {} artifact", running.platform)
		})?;
		Ok(Some(Offer { version: version.to_string(), artifact }))
	}
}

fn is_offered(running: &Version, remote: &Version) -> bool {
	remote > running
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use super::*;
	use crate::updates::source::Installer;

	fn version(text: &str) -> Version {
		Version::parse(text).expect("a version")
	}

	fn running(version_text: &str) -> RunningApp {
		RunningApp {
			version: version(version_text),
			location: PathBuf::from("Kiroshi.app"),
			platform: "darwin-aarch64".to_owned(),
			installer: Installer::MacBundle,
		}
	}

	fn the_stable_feed() -> Feed {
		serde_json::from_str(include_str!("../../tests/fixtures/stable-latest.json"))
			.expect("the stable feed parses")
	}

	fn released_platforms() -> Vec<String> {
		let workflow = include_str!("../../../../.github/workflows/release.yml");
		let line = workflow
			.lines()
			.find_map(|line| line.trim().strip_prefix("UPDATER_PLATFORMS:"))
			.expect("the release workflow names its updater platforms");
		line.split_whitespace().map(str::to_owned).collect()
	}

	#[test]
	fn the_real_stable_feed_lists_every_platform_the_release_ships() {
		let feed = the_stable_feed();
		let platforms = released_platforms();

		assert!(!platforms.is_empty());
		for platform in platforms {
			let artifact = feed.platforms.get(&platform);
			assert!(artifact.is_some(), "the stable feed lists no {platform} artifact");
		}
	}

	#[test]
	fn every_signature_of_the_real_stable_feed_decodes_as_minisign() {
		use base64::Engine;

		for (platform, artifact) in the_stable_feed().platforms {
			let text = base64::engine::general_purpose::STANDARD
				.decode(&artifact.signature)
				.expect("the signature is base64");
			let text = String::from_utf8(text).expect("the signature is text");
			assert!(
				minisign_verify::Signature::decode(&text).is_ok(),
				"the {platform} signature decodes"
			);
		}
	}

	#[test]
	fn a_newer_release_offers_the_artifact_of_the_running_platform() {
		let offer = the_stable_feed().offer_for(&running("0.1.0")).expect("the feed reads");

		let offer = offer.expect("a newer release is offered");
		assert_eq!(offer.version, "0.26.1");
		assert!(offer.artifact.url.starts_with("https://"));
	}

	#[test]
	fn the_running_version_is_not_offered_again() {
		let offer = the_stable_feed().offer_for(&running("0.26.1")).expect("the feed reads");

		assert_eq!(offer, None);
	}

	#[test]
	fn a_newer_release_without_the_running_platform_is_refused_by_name() {
		let mut app = running("0.1.0");
		app.platform = "plan9-mips".to_owned();

		let refused = the_stable_feed().offer_for(&app);

		assert_eq!(refused, Err("the release 0.26.1 lists no plan9-mips artifact".to_owned()));
	}

	#[test]
	fn a_stable_release_older_than_the_running_beta_is_not_offered() {
		assert!(!is_offered(&version("0.25.0-beta.1"), &version("0.24.1")));
	}

	#[test]
	fn the_stable_release_of_the_running_beta_is_offered() {
		assert!(is_offered(&version("0.25.0-beta.1"), &version("0.25.0")));
	}
}
