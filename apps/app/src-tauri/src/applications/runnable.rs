use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use reqwest::{StatusCode, Url};
use serde_json::Value;

use super::contract::{ApplicationsError, InstallRefusal};
use super::registry::{client, endpoint, parsed};

pub(super) const NPX: &str = "npx";

pub(super) const UVX: &str = "uvx";

const NPM_REGISTRY: &str = "https://registry.npmjs.org";

const PYPI_REGISTRY: &str = "https://pypi.org";

const UNPUBLISHED: [StatusCode; 2] = [StatusCode::NOT_FOUND, StatusCode::GONE];

#[derive(Debug, Clone)]
pub struct Runners {
	pub path: OsString,
	pub npm: String,
	pub pypi: String,
}

impl Default for Runners {
	fn default() -> Self {
		Self {
			path: env::var_os("PATH").unwrap_or_default(),
			npm: NPM_REGISTRY.to_owned(),
			pypi: PYPI_REGISTRY.to_owned(),
		}
	}
}

pub async fn refusal(runners: &Runners, config: &Value) -> Option<InstallRefusal> {
	let command = config.get("command").and_then(Value::as_str)?;
	if !on_path(&runners.path, command) {
		return Some(InstallRefusal { field: command.to_owned(), reason: absent(command) });
	}
	package_refusal(runners, command, identifier(config)?).await
}

async fn package_refusal(
	runners: &Runners,
	command: &str,
	identifier: &str,
) -> Option<InstallRefusal> {
	match answered(package_endpoint(runners, command, identifier)?).await {
		Ok(status) if UNPUBLISHED.contains(&status) => Some(InstallRefusal {
			field: identifier.to_owned(),
			reason: unpublished(identifier, status.as_u16()),
		}),
		Ok(StatusCode::OK) => None,
		Ok(status) => {
			eprintln!(
				"the package registry answered {} for {identifier}, which says nothing about whether it runs",
				status.as_u16()
			);
			None
		}
		Err(failure) => {
			eprintln!("the package registry answered nothing for {identifier}: {failure:?}");
			None
		}
	}
}

fn identifier(config: &Value) -> Option<&str> {
	config
		.get("args")?
		.as_array()?
		.iter()
		.filter_map(Value::as_str)
		.find(|held| !held.starts_with('-'))
}

fn package_endpoint(runners: &Runners, command: &str, identifier: &str) -> Option<Url> {
	let (base, segments) = match command {
		NPX => (&runners.npm, vec![identifier]),
		UVX => (&runners.pypi, vec!["pypi", identifier, "json"]),
		_ => return None,
	};
	endpoint(&parsed(base).ok()?, &segments).ok()
}

async fn answered(url: Url) -> Result<StatusCode, ApplicationsError> {
	let answer = client()?.get(url).send().await.map_err(|error| {
		if error.is_timeout() {
			return ApplicationsError::RegistryTimedOut;
		}
		ApplicationsError::RegistryUnreached { detail: error.to_string() }
	})?;
	Ok(answer.status())
}

fn on_path(path: &OsStr, command: &str) -> bool {
	located(path, command).is_some()
}

pub(crate) fn located(path: &OsStr, command: &str) -> Option<PathBuf> {
	let named = candidates(command);
	env::split_paths(path).find_map(|directory| {
		named.iter().map(|candidate| directory.join(candidate)).find(|held| executable(held))
	})
}

#[cfg(windows)]
fn candidates(command: &str) -> Vec<String> {
	const SUFFIXES: &str = ".COM;.EXE;.BAT;.CMD";

	let declared = env::var("PATHEXT").unwrap_or_else(|_| SUFFIXES.to_owned());
	std::iter::once(command.to_owned())
		.chain(
			declared
				.split(';')
				.filter(|suffix| !suffix.is_empty())
				.map(|suffix| format!("{command}{suffix}")),
		)
		.collect()
}

#[cfg(not(windows))]
fn candidates(command: &str) -> Vec<String> {
	vec![command.to_owned()]
}

#[cfg(unix)]
fn executable(candidate: &Path) -> bool {
	use std::os::unix::fs::PermissionsExt;

	candidate.metadata().is_ok_and(|held| held.is_file() && held.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn executable(candidate: &Path) -> bool {
	candidate.is_file()
}

fn absent(command: &str) -> String {
	format!(
		"the command {command} is on no directory of your PATH, so this application would not start on this computer"
	)
}

fn unpublished(identifier: &str, status: u16) -> String {
	format!(
		"the package registry answered {status} for {identifier}, so the runner would find nothing to run"
	)
}

#[cfg(test)]
pub(crate) mod tests {
	use std::fs;
	use std::net::{Ipv4Addr, SocketAddr};
	use std::path::Path;
	use std::sync::{Arc, Mutex};

	use axum::extract::State as Extracted;
	use axum::http::Uri;
	use axum::response::{IntoResponse, Response as Answered};
	use axum::routing::any;
	use axum::Router;
	use serde_json::json;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::removed_on_drop::RemovedOnDrop;

	const ABSENT: &str = "a-command-kiroshi-would-never-find";

	pub(crate) struct Held {
		status: StatusCode,
		pub(crate) asked: Mutex<Vec<String>>,
	}

	pub(crate) fn a_path_carrying(home: &Path, commands: &[&str]) -> OsString {
		let directory = home.join(format!("kiroshi-runners-{}", commands.join("-")));
		fs::create_dir_all(&directory).expect("the runner directory is made");
		for command in commands {
			let held = directory.join(command);
			fs::write(&held, "").expect("the runner is written");
			runnable_from_now_on(&held);
		}
		directory.into_os_string()
	}

	#[cfg(unix)]
	fn runnable_from_now_on(held: &Path) {
		use std::os::unix::fs::PermissionsExt;

		fs::set_permissions(held, fs::Permissions::from_mode(0o755))
			.expect("the runner is executable");
	}

	#[cfg(not(unix))]
	fn runnable_from_now_on(_held: &Path) {}

	pub(crate) async fn serving(status: StatusCode) -> (Runners, Arc<Held>, RemovedOnDrop) {
		let held = Arc::new(Held { status, asked: Mutex::new(Vec::new()) });
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address: SocketAddr = listener.local_addr().expect("the stub is named");
		let router = Router::new().fallback(any(asked_of)).with_state(held.clone());
		tokio::spawn(async move { axum::serve(listener, router).await.expect("the stub serves") });
		let base = format!("http://{address}");
		let home = temp_dir();
		let path = a_path_carrying(&home, &[NPX, UVX]);
		(Runners { path, npm: base.clone(), pypi: base }, held, home)
	}

	async fn asked_of(Extracted(held): Extracted<Arc<Held>>, uri: Uri) -> Answered {
		held.asked.lock().expect("the stub records").push(uri.to_string());
		held.status.into_response()
	}

	async fn unreached() -> (Runners, RemovedOnDrop) {
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = listener.local_addr().expect("the port is named");
		drop(listener);
		let base = format!("http://{address}");
		let home = temp_dir();
		let path = a_path_carrying(&home, &[NPX]);
		(Runners { path, npm: base.clone(), pypi: base }, home)
	}

	fn an_npm_config(identifier: &str) -> Value {
		json!({ "type": "stdio", "command": NPX, "args": ["-y", identifier] })
	}

	#[cfg(windows)]
	#[test]
	fn a_command_of_windows_is_read_under_its_bare_name_and_under_each_suffix_of_pathext() {
		let npx = candidates(NPX);
		let uvx = candidates(UVX);

		assert_eq!(npx[0], NPX);
		assert!(npx.iter().any(|held| held.eq_ignore_ascii_case("npx.cmd")), "got {npx:?}");
		assert!(uvx.iter().any(|held| held.eq_ignore_ascii_case("uvx.exe")), "got {uvx:?}");
	}

	#[tokio::test]
	async fn a_config_naming_no_command_runs_and_reads_no_package_registry() {
		let (runners, held, _home) = serving(StatusCode::NOT_FOUND).await;

		let answered =
			refusal(&runners, &json!({ "type": "http", "url": "https://remote.test/mcp" })).await;

		assert_eq!(answered, None);
		assert!(held.asked.lock().expect("the stub records").is_empty());
	}

	#[tokio::test]
	async fn a_command_no_directory_of_path_carries_is_refused_under_its_own_name() {
		let (runners, held, _home) = serving(StatusCode::OK).await;

		let answered = refusal(
			&runners,
			&json!({ "type": "stdio", "command": ABSENT, "args": ["-y", "a-package"] }),
		)
		.await
		.expect("an absent command refuses");

		assert_eq!(answered.field, ABSENT);
		assert!(answered.reason.contains(ABSENT), "got {}", answered.reason);
		assert!(held.asked.lock().expect("the stub records").is_empty());
	}

	#[tokio::test]
	async fn an_npm_identifier_the_registry_serves_runs_and_is_asked_for_under_its_own_name() {
		let (runners, held, _home) = serving(StatusCode::OK).await;

		let answered = refusal(&runners, &an_npm_config("@owner/mcp")).await;

		assert_eq!(answered, None);
		assert_eq!(held.asked.lock().expect("the stub records").clone(), ["/@owner%2Fmcp"]);
	}

	#[tokio::test]
	async fn a_pypi_identifier_is_asked_of_the_pypi_route_and_not_of_the_npm_one() {
		let (runners, held, _home) = serving(StatusCode::OK).await;
		let pypi = Runners { npm: "https://npm.unused.test".to_owned(), ..runners };

		let answered =
			refusal(&pypi, &json!({ "type": "stdio", "command": UVX, "args": ["godot-gut-mcp"] }))
				.await;

		assert_eq!(answered, None);
		assert_eq!(
			held.asked.lock().expect("the stub records").clone(),
			["/pypi/godot-gut-mcp/json"]
		);
	}

	#[tokio::test]
	async fn an_identifier_the_package_registry_publishes_no_more_is_refused_under_that_status() {
		for status in [StatusCode::NOT_FOUND, StatusCode::GONE] {
			let (runners, _, _home) = serving(status).await;

			let answered = refusal(&runners, &an_npm_config("no-such-package"))
				.await
				.expect("an unpublished identifier refuses");

			assert_eq!(answered.field, "no-such-package");
			assert!(answered.reason.contains(status.as_str()), "got {}", answered.reason);
			assert!(answered.reason.contains("no-such-package"), "got {}", answered.reason);
		}
	}

	#[tokio::test]
	async fn a_package_registry_answering_neither_ok_nor_unpublished_leaves_the_config_running() {
		for status in [StatusCode::UNAUTHORIZED, StatusCode::SERVICE_UNAVAILABLE] {
			let (runners, held, _home) = serving(status).await;

			assert_eq!(refusal(&runners, &an_npm_config("a-package")).await, None);
			assert_eq!(held.asked.lock().expect("the stub records").clone(), ["/a-package"]);
		}
	}

	#[tokio::test]
	async fn an_unreached_package_registry_leaves_the_config_running() {
		let (runners, _home) = unreached().await;
		assert_eq!(refusal(&runners, &an_npm_config("a-package")).await, None);
	}

	#[tokio::test]
	async fn a_command_of_path_naming_no_package_runs_and_reads_no_package_registry() {
		let (runners, held, _home) = serving(StatusCode::NOT_FOUND).await;

		let answered =
			refusal(&runners, &json!({ "type": "stdio", "command": NPX, "args": ["-y"] })).await;

		assert_eq!(answered, None);
		assert!(held.asked.lock().expect("the stub records").is_empty());
	}
}
