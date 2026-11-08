use std::fmt;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use kiroshi_core::applications::contract::{Application, Install, InstallRefusal};
use kiroshi_core::conversations::contract::McpServer;
use kiroshi_core::environment::contract::{EnvEntry, EnvOwner, EnvScope};
use kiroshi_core::plugins::contract::PluginScope;
use kiroshi_rune_kit::surfaces::s11_applications::panel::Connection;
use rune::Waker;
use serde::Deserialize;
use serde_json::{Value, json};

use super::ScopeKey;
use crate::host::HostError;
use crate::source::Source;

#[derive(Clone, PartialEq, Eq)]
pub struct Concealed(pub String);

impl fmt::Debug for Concealed {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.write_str("Concealed")
	}
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusRow {
	pub name: String,
	pub status: String,
	#[serde(default)]
	pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
	pub applications: Vec<Application>,
	#[serde(default)]
	pub registry_failure: Option<Value>,
	#[serde(default)]
	pub is_stale: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct InstallRun {
	pub application: Application,
	pub keys: Vec<(String, Concealed)>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Due {
	Notice(u64),
}

#[derive(Debug, PartialEq)]
pub enum Call {
	ReadServers(ScopeKey),
	ReadStatus(ScopeKey),
	ReadSecrets(ScopeKey),
	ReadCatalogue,
	Search { generation: u64, query: String },
	Install(ScopeKey, Box<InstallRun>),
	Connect { key: ScopeKey, name: String, url: String },
	CancelConnect,
	Disconnect { key: ScopeKey, name: String, url: String },
	Remove { key: ScopeKey, name: String },
	SetSecret { key: ScopeKey, name: String, value: Concealed },
	DeleteSecret { key: ScopeKey, name: String },
	Wake(Duration, Due),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InstallFailure {
	Refused(String),
	Missing(Vec<String>),
	Unconnected(Connection),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstallOutcome {
	pub refusal: Option<InstallFailure>,
	pub rollback_refusal: Option<String>,
}

pub enum Answer {
	Servers(ScopeKey, Result<Vec<McpServer>, HostError>),
	Status(ScopeKey, Result<Vec<StatusRow>, HostError>),
	Secrets(ScopeKey, Result<Vec<EnvEntry>, HostError>),
	Catalogue(Result<Vec<Application>, HostError>),
	Searched { generation: u64, found: Result<Found, HostError> },
	Installed { key: ScopeKey, name: String, outcome: InstallOutcome },
	Connected { key: ScopeKey, name: String, outcome: Result<(), HostError> },
	Cancelled(Result<(), HostError>),
	Disconnected { key: ScopeKey, name: String, outcome: Result<(), HostError> },
	Removed { key: ScopeKey, name: String, outcome: Result<(), HostError> },
	SecretSet { key: ScopeKey, outcome: Result<(), HostError> },
	SecretDeleted { key: ScopeKey, outcome: Result<(), HostError> },
	Due(Due),
}

pub fn refusal_text(failure: &HostError) -> String {
	let HostError::CommandFailed { body, .. } = failure else {
		return format!("{}: {}", failure.title(), failure.detail());
	};
	let Ok(refusal) = serde_json::from_str::<Value>(body) else { return body.clone() };
	let text_of = |field: &str| refusal.get(field).and_then(Value::as_str).map(str::to_owned);
	match (text_of("kind"), text_of("detail")) {
		(Some(kind), Some(detail)) => format!("{kind}: {detail}"),
		(Some(kind), None) => kind,
		(None, _) => body.clone(),
	}
}

pub fn refusal_kind(failure: &HostError) -> Option<String> {
	let HostError::CommandFailed { body, .. } = failure else { return None };
	let refusal = serde_json::from_str::<Value>(body).ok()?;
	refusal.get("kind").and_then(Value::as_str).map(str::to_owned)
}

pub fn url_of(config: &Value) -> String {
	config.get("url").and_then(Value::as_str).unwrap_or_default().trim().to_owned()
}

pub fn env_scope_of(owner: &EnvOwner) -> EnvScope {
	match owner {
		EnvOwner::User => EnvScope::User,
		EnvOwner::Space { id } => EnvScope::Space { id: id.clone() },
		EnvOwner::Bot { id, space_id } => {
			EnvScope::Bot { id: id.clone(), space_id: space_id.clone() }
		}
	}
}

fn server_scope(owner: &EnvOwner, name: &str) -> EnvScope {
	EnvScope::Server { name: name.to_owned(), owner: owner.clone() }
}

fn plugin_scope(owner: &EnvOwner) -> Value {
	json!({ "scope": PluginScope::from(owner) })
}

fn done(outcome: Result<Value, HostError>) -> Result<(), HostError> {
	outcome.map(|_| ())
}

fn mark_of(application: &Application) -> Value {
	json!({
		"title": application.title,
		"logo": application.logo,
		"logoUrl": application.logo_url,
	})
}

fn connect_refusal(source: &Source, owner: &EnvOwner, name: &str) -> Option<InstallFailure> {
	let unconnected = InstallFailure::Unconnected;
	let rows: Vec<StatusRow> =
		match source.invoke("mcp_application_status", json!({ "owner": owner })) {
			Ok(rows) => rows,
			Err(failure) => return Some(InstallFailure::Refused(refusal_text(&failure))),
		};
	let Some(row) = rows.into_iter().find(|row| row.name == name) else {
		return Some(unconnected(Connection::Failed));
	};
	let connection = match row.status.as_str() {
		"needsAuthorization" => Connection::NeedsAuthorization,
		"failed" => Connection::Failed,
		_ => return None,
	};
	Some(row.reason.map_or(unconnected(connection), InstallFailure::Refused))
}

fn declared_names(source: &Source, owner: &EnvOwner) -> Result<Vec<String>, HostError> {
	let servers: Vec<McpServer> = source.invoke("plugin_mcp_servers", plugin_scope(owner))?;
	Ok(servers.into_iter().map(|server| server.name).collect())
}

fn rolled_back(source: &Source, owner: &EnvOwner, name: &str) -> Option<String> {
	let scope = server_scope(owner, name);
	let secrets_refusal = source
		.invoke::<Vec<EnvEntry>>("env_list", json!({ "scope": scope }))
		.and_then(|entries| {
			entries
				.into_iter()
				.filter(|entry| matches!(entry.defined_in, EnvScope::Server { .. }))
				.try_for_each(|entry| {
					let arguments = json!({ "scope": scope, "name": entry.name });
					done(source.invoke("env_delete", arguments))
				})
		})
		.err();
	let mut arguments = plugin_scope(owner);
	arguments["name"] = json!(name);
	let undeclare_refusal = done(source.invoke("plugin_delete_mcp_server", arguments)).err();
	undeclare_refusal.or(secrets_refusal).map(|refusal| refusal_text(&refusal))
}

fn refused_with(failure: HostError) -> InstallFailure {
	InstallFailure::Refused(refusal_text(&failure))
}

fn declared_with_keys(
	source: &Source,
	owner: &EnvOwner,
	run: &InstallRun,
) -> Result<(), InstallFailure> {
	let application = &run.application;
	let scope = server_scope(owner, &application.name);
	for (secret, value) in &run.keys {
		let arguments = json!({ "scope": scope, "name": secret, "value": value.0 });
		done(source.invoke("env_set", arguments)).map_err(refused_with)?;
	}
	if !matches!(application.install, Install::Oauth) {
		return Ok(());
	}
	let url = url_of(&application.config);
	let arguments = json!({ "owner": owner, "name": application.name, "url": url });
	done(source.invoke("mcp_oauth_connect", arguments)).map_err(refused_with)?;
	match connect_refusal(source, owner, &application.name) {
		Some(refusal) => Err(refusal),
		None => Ok(()),
	}
}

fn installed(source: &Source, owner: &EnvOwner, run: &InstallRun) -> InstallOutcome {
	let refused = |refusal: String| InstallOutcome {
		refusal: Some(InstallFailure::Refused(refusal)),
		rollback_refusal: None,
	};
	let application = &run.application;
	let unrunnable: Result<Option<InstallRefusal>, HostError> =
		source.invoke("application_runnable", json!({ "config": application.config }));
	match unrunnable {
		Ok(Some(refusal)) => return refused(refusal.reason),
		Err(failure) => return refused(refusal_text(&failure)),
		Ok(None) => {}
	}
	let was_declared = match declared_names(source, owner) {
		Ok(names) => names.contains(&application.name),
		Err(failure) => return refused(refusal_text(&failure)),
	};
	let mut arguments = plugin_scope(owner);
	arguments["name"] = json!(application.name);
	arguments["config"] = application.config.clone();
	arguments["mark"] = mark_of(application);
	if let Err(failure) = done(source.invoke("plugin_set_mcp_server", arguments)) {
		return refused(refusal_text(&failure));
	}
	match declared_with_keys(source, owner, run) {
		Ok(()) => InstallOutcome { refusal: None, rollback_refusal: None },
		Err(refusal) => {
			let rollback_refusal =
				(!was_declared).then(|| rolled_back(source, owner, &application.name)).flatten();
			InstallOutcome { refusal: Some(refusal), rollback_refusal }
		}
	}
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadServers(key) => {
			let read = source.invoke("plugin_mcp_servers", plugin_scope(&key.owner));
			Answer::Servers(key, read)
		}
		Call::ReadStatus(key) => {
			let read = source.invoke("mcp_application_status", json!({ "owner": key.owner }));
			Answer::Status(key, read)
		}
		Call::ReadSecrets(key) => {
			let read = source.invoke("env_list", json!({ "scope": env_scope_of(&key.owner) }));
			Answer::Secrets(key, read)
		}
		Call::ReadCatalogue => Answer::Catalogue(source.invoke("application_catalogue", json!({}))),
		Call::Search { generation, query } => {
			let found = source.invoke("application_search", json!({ "query": query }));
			Answer::Searched { generation, found }
		}
		Call::Install(key, run) => {
			let outcome = installed(source, &key.owner, &run);
			Answer::Installed { key, name: run.application.name.clone(), outcome }
		}
		Call::Connect { key, name, url } => {
			let arguments = json!({ "owner": key.owner, "name": name, "url": url });
			let outcome = done(source.invoke("mcp_oauth_connect", arguments));
			Answer::Connected { key, name, outcome }
		}
		Call::CancelConnect => {
			Answer::Cancelled(done(source.invoke("mcp_oauth_cancel", json!({}))))
		}
		Call::Disconnect { key, name, url } => {
			let arguments = json!({ "owner": key.owner, "name": name, "url": url });
			let outcome = done(source.invoke("mcp_oauth_disconnect", arguments));
			Answer::Disconnected { key, name, outcome }
		}
		Call::Remove { key, name } => {
			let mut arguments = plugin_scope(&key.owner);
			arguments["name"] = json!(name);
			let outcome = done(source.invoke("plugin_delete_mcp_server", arguments));
			Answer::Removed { key, name, outcome }
		}
		Call::SetSecret { key, name, value } => {
			let scope = env_scope_of(&key.owner);
			let arguments = json!({ "scope": scope, "name": name, "value": value.0 });
			Answer::SecretSet { key, outcome: done(source.invoke("env_set", arguments)) }
		}
		Call::DeleteSecret { key, name } => {
			let arguments = json!({ "scope": env_scope_of(&key.owner), "name": name });
			Answer::SecretDeleted { key, outcome: done(source.invoke("env_delete", arguments)) }
		}
		Call::Wake(after, due) => {
			thread::sleep(after);
			Answer::Due(due)
		}
	}
}

#[derive(Clone)]
struct Reply {
	answers: Sender<Answer>,
	waker: Waker,
}

impl Reply {
	fn deliver(&self, answer: Answer) {
		if self.answers.send(answer).is_ok() {
			(self.waker)();
		}
	}
}

pub struct Calls {
	source: Source,
	reply: Reply,
	answers: Receiver<Answer>,
}

impl Calls {
	pub fn new(source: Source, waker: Waker) -> Calls {
		let (sender, answers) = mpsc::channel();
		Calls { source, reply: Reply { answers: sender, waker }, answers }
	}

	pub fn send(&self, call: Call) {
		let (source, reply) = (self.source.clone(), self.reply.clone());
		let spawned = thread::Builder::new()
			.name("applications-call".into())
			.spawn(move || reply.deliver(answered(&source, call)));
		if let Err(failure) = spawned {
			eprintln!("an applications call did not start: {failure}");
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
