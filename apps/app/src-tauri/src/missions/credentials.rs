use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::process::Command;
use tokio::sync::OnceCell;

use crate::applications::runnable::located;
use crate::environment::contract::EnvScope;
use crate::environment::store;

const SECRET: &str = "GITHUB_TOKEN";

const GH: &str = "gh";

const GH_TIMEOUT: Duration = Duration::from_secs(5);

const INSTALL_DIRECTORIES: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenSource {
	Secrets,
	Gh,
	None,
}

#[derive(Clone, PartialEq, Eq)]
pub enum Credential {
	Secrets(String),
	Gh(String),
	None,
}

impl Credential {
	pub fn source(&self) -> TokenSource {
		match self {
			Credential::Secrets(_) => TokenSource::Secrets,
			Credential::Gh(_) => TokenSource::Gh,
			Credential::None => TokenSource::None,
		}
	}

	pub fn token(&self) -> Option<&str> {
		match self {
			Credential::Secrets(token) | Credential::Gh(token) => Some(token),
			Credential::None => None,
		}
	}
}

pub struct Credentials {
	search_path: OsString,
	gh: OnceCell<Option<String>>,
}

impl Credentials {
	pub fn of_this_computer() -> Self {
		Self::searching(widened(env::var_os("PATH").unwrap_or_default()))
	}

	pub(crate) fn searching(search_path: OsString) -> Self {
		Self { search_path, gh: OnceCell::new() }
	}

	pub(crate) async fn resolved(&self, secrets: Option<&Path>) -> Credential {
		if let Some(token) = from_secrets(secrets) {
			return Credential::Secrets(token);
		}
		match self.gh.get_or_init(|| from_gh(&self.search_path)).await {
			Some(token) => Credential::Gh(token.clone()),
			None => Credential::None,
		}
	}
}

fn widened(path: OsString) -> OsString {
	let directories: Vec<PathBuf> =
		env::split_paths(&path).chain(INSTALL_DIRECTORIES.iter().map(PathBuf::from)).collect();
	env::join_paths(directories).unwrap_or_else(|failure| {
		eprintln!("gh is looked for on PATH alone: {failure}");
		path
	})
}

fn from_secrets(root: Option<&Path>) -> Option<String> {
	let Some(root) = root else {
		eprintln!("no GitHub token is read from Secrets: the app data folder resolves nowhere");
		return None;
	};
	match store::values(root, &EnvScope::User) {
		Ok(values) => non_empty(values.get(SECRET)?),
		Err(failure) => {
			eprintln!("no GitHub token is read from Secrets: {failure:?}");
			None
		}
	}
}

async fn from_gh(search_path: &OsStr) -> Option<String> {
	let gh = located(search_path, GH)?;
	let mut command = Command::new(gh);
	command.args(["auth", "token"]).stdin(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true);

	#[cfg(windows)]
	command.creation_flags(super::checkout::CREATE_NO_WINDOW);

	let output = match tokio::time::timeout(GH_TIMEOUT, command.output()).await {
		Ok(Ok(output)) => output,
		Ok(Err(failure)) => {
			eprintln!("gh auth token did not run: {failure}");
			return None;
		}
		Err(_) => {
			eprintln!("gh auth token answered nothing within {} seconds", GH_TIMEOUT.as_secs());
			return None;
		}
	};
	if !output.status.success() {
		eprintln!("gh auth token ended with {}", output.status);
		return None;
	}
	match String::from_utf8(output.stdout) {
		Ok(answered) => non_empty(answered.lines().next()?),
		Err(failure) => {
			eprintln!("gh auth token answered no text: {failure}");
			None
		}
	}
}

fn non_empty(held: &str) -> Option<String> {
	Some(held.trim().to_owned()).filter(|held| !held.is_empty())
}

#[cfg(all(test, unix))]
pub(crate) mod tests {
	use std::fs;
	use std::os::unix::fs::PermissionsExt;
	use std::path::Path;

	use super::*;
	use crate::db::connection::temp_dir;

	pub(crate) fn a_gh(directory: &Path, script: &str) {
		let gh = directory.join(GH);
		fs::write(&gh, format!("#!/bin/sh\n{script}\n")).expect("the fake gh is written");
		fs::set_permissions(&gh, fs::Permissions::from_mode(0o755)).expect("the fake gh runs");
	}

	pub(crate) fn a_secret(root: &Path, value: &str) {
		store::set(root, &EnvScope::User, SECRET, value).expect("the secret is kept");
	}

	#[tokio::test]
	async fn gh_is_asked_for_its_token_once_per_run_whatever_it_answered() {
		let bin = temp_dir();
		let secrets = temp_dir();
		let asked = bin.join("asked");
		a_gh(&bin, &format!("echo asked >> '{}'\nexit 1", asked.display()));
		let credentials = Credentials::searching(bin.as_os_str().to_owned());

		let first = credentials.resolved(Some(&secrets)).await;
		let second = credentials.resolved(Some(&secrets)).await;

		assert!(first == Credential::None && second == Credential::None);
		assert_eq!(fs::read_to_string(&asked).expect("gh was asked"), "asked\n");
	}

	#[tokio::test]
	async fn gh_answering_an_empty_line_gives_no_token() {
		let bin = temp_dir();
		let secrets = temp_dir();
		a_gh(&bin, "echo ''");

		let credentials = Credentials::searching(bin.as_os_str().to_owned());

		assert!(credentials.resolved(Some(&secrets)).await == Credential::None);
	}

	#[tokio::test(start_paused = true)]
	async fn gh_silent_for_five_seconds_gives_no_token() {
		let bin = temp_dir();
		let secrets = temp_dir();
		a_gh(&bin, "sleep 30\necho too-late");

		let credentials = Credentials::searching(bin.as_os_str().to_owned());

		assert!(credentials.resolved(Some(&secrets)).await == Credential::None);
	}

	#[tokio::test]
	async fn a_secret_entered_while_the_app_runs_wins_at_the_next_resolution() {
		let bin = temp_dir();
		let secrets = temp_dir();
		a_gh(&bin, r#"[ "$1 $2" = "auth token" ] && echo a-token-from-gh"#);
		let credentials = Credentials::searching(bin.as_os_str().to_owned());

		let before = credentials.resolved(Some(&secrets)).await;
		a_secret(&secrets, " a-token-from-secrets ");
		let after = credentials.resolved(Some(&secrets)).await;

		assert!(before == Credential::Gh("a-token-from-gh".to_owned()));
		assert!(after == Credential::Secrets("a-token-from-secrets".to_owned()));
	}

	#[test]
	fn the_install_directories_of_gh_follow_the_path() {
		let widened = widened(OsString::from("/usr/bin"));

		assert_eq!(widened, OsString::from("/usr/bin:/opt/homebrew/bin:/usr/local/bin"));
	}
}
