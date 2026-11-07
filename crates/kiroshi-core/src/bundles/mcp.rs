use std::net::IpAddr;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::{
	declared, dir, recorded, rewrite_manifest, serialised, undeclare_servers, unrecorded,
	write_declared, Keyed, MARKS_KEY, MARKS_NAME, MCP_NAME, SERVERS_KEY, SERVER_SUBJECT,
};
use crate::db::repositories::conversations::Bot;

pub struct McpServer {
	pub name: String,
	pub config: serde_json::Value,
	pub mark: ApplicationMark,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ApplicationMark {
	#[serde(skip_serializing_if = "Option::is_none")]
	pub title: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub logo: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub logo_url: Option<String>,
}

const AUTHORIZATION_HEADER: &str = "authorization";

const EXPANDED_FIELDS: [&str; 5] = ["command", "args", "env", "url", "headers"];

const PLACEHOLDER_OPENING: &str = "${";

const LOOPBACK_NAME: &str = "localhost";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AuthorizationWithheld {
	ServedOverNoUrl,
	LoopbackAddress,
	OwnAuthorizationHeader,
	UnexpandedPlaceholder,
}

impl McpServer {
	pub fn url(&self) -> Option<&str> {
		self.config.get("url").and_then(serde_json::Value::as_str)
	}

	pub fn kiroshi_authorizes(&self) -> bool {
		self.authorization_withheld().is_none()
	}

	pub fn authorization_withheld(&self) -> Option<AuthorizationWithheld> {
		if self.url().is_none() {
			return Some(AuthorizationWithheld::ServedOverNoUrl);
		}
		if self.declares_placeholder() {
			return Some(AuthorizationWithheld::UnexpandedPlaceholder);
		}
		if self.declares_authorization() {
			return Some(AuthorizationWithheld::OwnAuthorizationHeader);
		}
		if self.url().is_some_and(is_loopback) {
			return Some(AuthorizationWithheld::LoopbackAddress);
		}
		None
	}

	fn declares_authorization(&self) -> bool {
		self.config.get("headers").and_then(serde_json::Value::as_object).is_some_and(|headers| {
			headers.keys().any(|name| name.to_lowercase() == AUTHORIZATION_HEADER)
		})
	}

	fn declares_placeholder(&self) -> bool {
		EXPANDED_FIELDS
			.iter()
			.filter_map(|field| self.config.get(*field))
			.any(|declared| declared.to_string().contains(PLACEHOLDER_OPENING))
	}
}

fn is_loopback(url: &str) -> bool {
	let Ok(parsed) = reqwest::Url::parse(url) else {
		return false;
	};
	let Some(host) = parsed.host_str() else {
		return false;
	};
	let bare = host.trim_start_matches('[').trim_end_matches(']');
	bare == LOOPBACK_NAME || bare.parse::<IpAddr>().is_ok_and(|address| address.is_loopback())
}

pub fn mcp_servers(root: &Path, bot_id: &str) -> Vec<McpServer> {
	dir(root, bot_id).map(|bundle| mcp_servers_at(&bundle)).unwrap_or_default()
}

pub fn mcp_servers_at(bundle: &Path) -> Vec<McpServer> {
	let marks = marks_at(bundle);
	declared(&bundle.join(MCP_NAME), SERVERS_KEY)
		.into_iter()
		.map(|(name, config)| McpServer { mark: mark_under(&marks, &name), name, config })
		.collect()
}

fn marks_at(bundle: &Path) -> Keyed {
	declared(&bundle.join(MARKS_NAME), MARKS_KEY)
}

fn mark_under(marks: &Keyed, name: &str) -> ApplicationMark {
	match marks.get(name).cloned().map(serde_json::from_value) {
		Some(Ok(mark)) => mark,
		Some(Err(error)) => {
			eprintln!("the mark kept under {name} was not read: {error}");
			ApplicationMark::default()
		}
		None => ApplicationMark::default(),
	}
}

pub fn set_mcp_server(
	root: &Path,
	bot: &Bot,
	name: &str,
	config: &serde_json::Value,
	mark: Option<&ApplicationMark>,
) -> std::io::Result<McpServer> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	let server = set_mcp_server_at(&bundle, name, config, mark)?;
	rewrite_manifest(root, bot)?;
	recorded(&bundle, SERVER_SUBJECT, name, "saved from settings").map_err(unrecorded)?;
	Ok(server)
}

pub fn set_mcp_server_at(
	bundle: &Path,
	name: &str,
	config: &serde_json::Value,
	mark: Option<&ApplicationMark>,
) -> std::io::Result<McpServer> {
	if !config.is_object() {
		return Err(std::io::Error::new(
			std::io::ErrorKind::InvalidInput,
			"a server configuration must be a JSON object",
		));
	}
	let path = bundle.join(MCP_NAME);
	let mut servers = declared(&path, SERVERS_KEY);
	servers.insert(name.to_owned(), config.clone());
	write_declared(&path, SERVERS_KEY, servers)?;
	let kept = match mark {
		Some(given) => written_mark(bundle, name, given)?,
		None => mark_under(&marks_at(bundle), name),
	};
	Ok(McpServer { name: name.to_owned(), config: config.clone(), mark: kept })
}

fn written_mark(
	bundle: &Path,
	name: &str,
	mark: &ApplicationMark,
) -> std::io::Result<ApplicationMark> {
	let path = bundle.join(MARKS_NAME);
	let mut marks = declared(&path, MARKS_KEY);
	marks.insert(name.to_owned(), serde_json::to_value(mark)?);
	write_declared(&path, MARKS_KEY, marks)?;
	Ok(mark.clone())
}

pub fn remove_mcp_server(root: &Path, bot: &Bot, name: &str) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	remove_mcp_server_at(&bundle, name)?;
	rewrite_manifest(root, bot)?;
	undeclare_servers(root, bot)?;
	recorded(&bundle, SERVER_SUBJECT, name, "removed from settings").map_err(unrecorded)?;
	Ok(())
}

pub fn remove_mcp_server_at(bundle: &Path, name: &str) -> std::io::Result<()> {
	let path = bundle.join(MCP_NAME);
	let mut servers = declared(&path, SERVERS_KEY);
	if servers.remove(name).is_none() {
		return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no such server"));
	}
	write_declared(&path, SERVERS_KEY, servers)?;
	remove_mark(bundle, name)
}

fn remove_mark(bundle: &Path, name: &str) -> std::io::Result<()> {
	let path = bundle.join(MARKS_NAME);
	let mut marks = declared(&path, MARKS_KEY);
	if marks.remove(name).is_none() {
		return Ok(());
	}
	write_declared(&path, MARKS_KEY, marks)
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use super::super::tests::{a_bot, a_root};
	use super::super::write;
	use super::*;
	use crate::private_files;

	fn declared(config: serde_json::Value) -> McpServer {
		McpServer { name: "granola".to_owned(), config, mark: ApplicationMark::default() }
	}

	#[test]
	fn a_remote_server_declaring_no_authorization_header_is_one_kiroshi_authorizes() {
		assert!(declared(serde_json::json!({ "url": "https://mcp.granola.test/mcp" }))
			.kiroshi_authorizes());
		assert!(declared(serde_json::json!({
			"url": "https://mcp.granola.test/mcp",
			"headers": { "X-Trace": "on" }
		}))
		.kiroshi_authorizes());
	}

	#[test]
	fn a_server_served_on_a_loopback_address_is_one_kiroshi_does_not_authorize() {
		for url in [
			"http://127.0.0.1:29979/mcp",
			"http://127.8.0.1/mcp",
			"http://localhost:3000/mcp",
			"http://LOCALHOST/mcp",
			"http://[::1]:29979/mcp",
		] {
			let server = declared(serde_json::json!({ "url": url }));
			assert!(!server.kiroshi_authorizes(), "{url}");
			assert_eq!(
				server.authorization_withheld(),
				Some(AuthorizationWithheld::LoopbackAddress),
				"{url}"
			);
		}
		assert!(declared(serde_json::json!({ "url": "http://10.0.0.2/mcp" })).kiroshi_authorizes());
		assert!(declared(serde_json::json!({ "url": "https://localhost.granola.test/mcp" }))
			.kiroshi_authorizes());
	}

	#[test]
	fn a_server_kiroshi_authorizes_not_names_the_header_or_the_placeholder_it_carries() {
		assert_eq!(
			declared(serde_json::json!({
				"url": "http://127.0.0.1/mcp",
				"headers": { "Authorization": "Bearer held" }
			}))
			.authorization_withheld(),
			Some(AuthorizationWithheld::OwnAuthorizationHeader)
		);
		assert_eq!(
			declared(serde_json::json!({ "url": "https://${GRANOLA_HOST}/mcp" }))
				.authorization_withheld(),
			Some(AuthorizationWithheld::UnexpandedPlaceholder)
		);
		assert_eq!(
			declared(serde_json::json!({ "url": "https://mcp.granola.test/mcp" }))
				.authorization_withheld(),
			None
		);
		assert_eq!(
			declared(serde_json::json!({ "command": "clock", "env": { "T": "${TOKEN}" } }))
				.authorization_withheld(),
			Some(AuthorizationWithheld::ServedOverNoUrl)
		);
	}

	#[test]
	fn a_server_kiroshi_authorizes_not_declares_a_command_a_header_or_a_placeholder() {
		assert!(!declared(serde_json::json!({ "command": "clock" })).kiroshi_authorizes());
		assert!(!declared(serde_json::json!({
			"url": "https://mcp.granola.test/mcp",
			"headers": { "Authorization": "Bearer held" }
		}))
		.kiroshi_authorizes());
		assert!(!declared(serde_json::json!({
			"url": "https://mcp.granola.test/mcp",
			"headers": { "authorization": "Bearer held" }
		}))
		.kiroshi_authorizes());
		assert!(!declared(serde_json::json!({ "url": "https://${GRANOLA_HOST}/mcp" }))
			.kiroshi_authorizes());
		assert!(!declared(serde_json::json!({
			"url": "https://mcp.granola.test/mcp",
			"env": { "TOKEN": "${GRANOLA_TOKEN}" }
		}))
		.kiroshi_authorizes());
	}

	fn a_slack_mark() -> ApplicationMark {
		ApplicationMark {
			title: Some("Slack".to_owned()),
			logo: Some("<svg />".to_owned()),
			logo_url: Some("https://slack.test/logo.png".to_owned()),
		}
	}

	fn a_clock_config() -> serde_json::Value {
		serde_json::json!({ "command": "clock" })
	}

	fn marks_file(root: &Path, bot_id: &str) -> PathBuf {
		dir(root, bot_id).expect("the bundle is held").join(MARKS_NAME)
	}

	#[test]
	fn a_server_declared_with_a_mark_is_listed_back_carrying_it() {
		let root = a_root("marked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		set_mcp_server(&root, &bot, "slack", &a_clock_config(), Some(&a_slack_mark()))
			.expect("the server is written");

		assert_eq!(mcp_servers(&root, &bot.id)[0].mark, a_slack_mark());
		assert!(marks_file(&root, &bot.id).is_file(), "the mark file is beside the declaration");
	}

	#[test]
	fn a_server_declared_with_no_mark_leaves_the_one_already_written_standing() {
		let root = a_root("marked-again");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		set_mcp_server(&root, &bot, "slack", &a_clock_config(), Some(&a_slack_mark()))
			.expect("the server is written");

		let written = set_mcp_server(&root, &bot, "slack", &a_clock_config(), None)
			.expect("the server is written again");

		assert_eq!(written.mark, a_slack_mark());
		assert_eq!(mcp_servers(&root, &bot.id)[0].mark, a_slack_mark());
	}

	#[test]
	fn a_server_no_mark_was_ever_written_for_is_listed_back_with_none_of_the_three() {
		let root = a_root("unmarked");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		set_mcp_server(&root, &bot, "clock", &a_clock_config(), None)
			.expect("the server is written");

		assert_eq!(mcp_servers(&root, &bot.id)[0].mark, ApplicationMark::default());
		assert!(!marks_file(&root, &bot.id).exists(), "a mark file was written");
	}

	#[test]
	fn a_mark_file_that_is_not_json_leaves_the_declared_servers_standing_with_no_mark() {
		let root = a_root("mark-unreadable");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		set_mcp_server(&root, &bot, "slack", &a_clock_config(), Some(&a_slack_mark()))
			.expect("the server is written");
		private_files::replace(&marks_file(&root, &bot.id), b"not json at all")
			.expect("the mark file is overwritten");

		let listed = mcp_servers(&root, &bot.id);

		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].mark, ApplicationMark::default());
	}

	#[test]
	fn the_last_server_removed_takes_the_mark_file_with_it() {
		let root = a_root("mark-removed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		set_mcp_server(&root, &bot, "slack", &a_clock_config(), Some(&a_slack_mark()))
			.expect("the server is written");
		set_mcp_server(&root, &bot, "clock", &a_clock_config(), Some(&a_slack_mark()))
			.expect("the server is written");

		remove_mcp_server(&root, &bot, "slack").expect("the server is removed");

		assert!(marks_file(&root, &bot.id).is_file(), "the file went with the first entry");
		assert_eq!(mcp_servers(&root, &bot.id)[0].mark, a_slack_mark());

		remove_mcp_server(&root, &bot, "clock").expect("the server is removed");

		assert!(!marks_file(&root, &bot.id).exists(), "the mark file stayed");
	}
}
