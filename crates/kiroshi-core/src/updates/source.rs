use std::env::VarError;
use std::fmt;
use std::path::{Path, PathBuf};

use semver::Version;
use serde::Deserialize;

use super::contract::UpdateChannel;

pub const SOURCE_OVERRIDE_ENV: &str = "KIROSHI_UPDATE_SOURCE";

const STABLE_FEED: &str =
	"https://github.com/kiroshi-app/kiroshi-monorepo/releases/latest/download/latest.json";
const BETA_FEED: &str =
	"https://github.com/kiroshi-app/kiroshi-monorepo/releases/download/beta/latest.json";
const RELEASES_BY_TAG: &str =
	"https://api.github.com/repos/kiroshi-app/kiroshi-monorepo/releases/tags";
const PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDhGMkVBNjdDQ0I1QTc2N0QKUldSOWRsckxmS1l1ajArcW54RTM3R0dWSEJ1YTBMbnhlYjdnakg3MXA4RTFUajlvUFVDT0lJdzMK";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSource {
	pub stable_feed: String,
	pub beta_feed: String,
	pub releases_by_tag: String,
	pub public_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Installer {
	MacBundle,
	DebianPackage,
	WindowsSetup,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunningApp {
	pub version: Version,
	pub location: PathBuf,
	pub platform: String,
	pub installer: Installer,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetupError {
	UnreadableSourceOverride { detail: String },
	InvalidVersion { version: String },
	UnknownLocation { detail: String },
	UnsupportedPlatform,
}

impl fmt::Display for SetupError {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::UnreadableSourceOverride { detail } => {
				write!(formatter, "{SOURCE_OVERRIDE_ENV} is not an update source: {detail}")
			}
			Self::InvalidVersion { version } => {
				write!(formatter, "the running version {version} is not semver")
			}
			Self::UnknownLocation { detail } => {
				write!(formatter, "the installed app was not found: {detail}")
			}
			Self::UnsupportedPlatform => write!(formatter, "no release ships for this platform"),
		}
	}
}

impl std::error::Error for SetupError {}

impl UpdateSource {
	pub fn release() -> Self {
		Self {
			stable_feed: STABLE_FEED.to_owned(),
			beta_feed: BETA_FEED.to_owned(),
			releases_by_tag: RELEASES_BY_TAG.to_owned(),
			public_key: PUBLIC_KEY.to_owned(),
		}
	}

	pub fn of_this_build() -> Result<Self, SetupError> {
		chosen(cfg!(debug_assertions), std::env::var(SOURCE_OVERRIDE_ENV))
	}

	pub(super) fn feed(&self, channel: UpdateChannel) -> &str {
		match channel {
			UpdateChannel::Stable => &self.stable_feed,
			UpdateChannel::Beta => &self.beta_feed,
		}
	}
}

fn chosen(
	is_dev_build: bool,
	overridden: Result<String, VarError>,
) -> Result<UpdateSource, SetupError> {
	if !is_dev_build {
		return Ok(UpdateSource::release());
	}
	match overridden {
		Ok(json) => serde_json::from_str(&json)
			.map_err(|error| SetupError::UnreadableSourceOverride { detail: error.to_string() }),
		Err(VarError::NotPresent) => Ok(UpdateSource::release()),
		Err(error) => Err(SetupError::UnreadableSourceOverride { detail: error.to_string() }),
	}
}

impl RunningApp {
	pub fn current(version: &str) -> Result<Self, SetupError> {
		let version = Version::parse(version)
			.map_err(|_| SetupError::InvalidVersion { version: version.to_owned() })?;
		let (platform, installer) = this_platform().ok_or(SetupError::UnsupportedPlatform)?;
		let executable = std::env::current_exe()
			.map_err(|error| SetupError::UnknownLocation { detail: error.to_string() })?;
		let location = match installer {
			Installer::MacBundle => {
				enclosing_bundle(&executable).ok_or_else(|| SetupError::UnknownLocation {
					detail: "the executable runs from no .app bundle".to_owned(),
				})?
			}
			Installer::DebianPackage | Installer::WindowsSetup => executable,
		};
		Ok(Self { version, location, platform, installer })
	}
}

fn this_platform() -> Option<(String, Installer)> {
	let (os, installer) = if cfg!(target_os = "macos") {
		("darwin", Installer::MacBundle)
	} else if cfg!(target_os = "linux") {
		("linux", Installer::DebianPackage)
	} else if cfg!(target_os = "windows") {
		("windows", Installer::WindowsSetup)
	} else {
		return None;
	};
	let arch = if cfg!(target_arch = "x86_64") {
		"x86_64"
	} else if cfg!(target_arch = "aarch64") {
		"aarch64"
	} else {
		return None;
	};
	Some((format!("{os}-{arch}"), installer))
}

fn enclosing_bundle(executable: &Path) -> Option<PathBuf> {
	executable
		.ancestors()
		.find(|ancestor| ancestor.extension().is_some_and(|extension| extension == "app"))
		.map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn tauri_updater_config() -> serde_json::Value {
		let config: serde_json::Value =
			serde_json::from_str(include_str!("../../../../apps/app/src-tauri/tauri.conf.json"))
				.expect("the config parses");
		config["plugins"]["updater"].clone()
	}

	#[test]
	fn the_release_source_reads_the_feed_and_key_the_tauri_app_reads() {
		let updater = tauri_updater_config();
		let release = UpdateSource::release();

		assert_eq!(updater["endpoints"][0], release.stable_feed);
		assert_eq!(updater["pubkey"], release.public_key);
	}

	#[test]
	fn beta_reads_the_beta_release_feed() {
		assert_eq!(
			UpdateSource::release().feed(UpdateChannel::Beta),
			"https://github.com/kiroshi-app/kiroshi-monorepo/releases/download/beta/latest.json"
		);
	}

	#[test]
	fn a_dev_build_takes_the_overriding_source() {
		let overriding = r#"{"stableFeed":"http://127.0.0.1:1/stable.json","betaFeed":"http://127.0.0.1:1/beta.json","releasesByTag":"http://127.0.0.1:1/tags","publicKey":"a key"}"#;

		let source = chosen(true, Ok(overriding.to_owned())).expect("the override reads");

		assert_eq!(source.feed(UpdateChannel::Stable), "http://127.0.0.1:1/stable.json");
		assert_eq!(source.public_key, "a key");
	}

	#[test]
	fn a_release_build_ignores_the_override() {
		let source = chosen(false, Ok("{}".to_owned())).expect("the release source");

		assert_eq!(source, UpdateSource::release());
	}

	#[test]
	fn a_dev_build_without_an_override_reads_the_release_source() {
		assert_eq!(chosen(true, Err(VarError::NotPresent)), Ok(UpdateSource::release()));
	}

	#[test]
	fn a_malformed_override_is_refused_rather_than_replaced() {
		assert!(matches!(
			chosen(true, Ok("{".to_owned())),
			Err(SetupError::UnreadableSourceOverride { .. })
		));
	}

	#[test]
	fn the_installed_bundle_encloses_the_executable() {
		let executable = Path::new("/Applications/Kiroshi.app/Contents/MacOS/kiroshi");

		assert_eq!(enclosing_bundle(executable), Some(PathBuf::from("/Applications/Kiroshi.app")));
	}
}
