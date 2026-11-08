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

use super::Which;
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
	pub owner: EnvOwner,
	pub application: Application,
	pub keys: Vec<(String, Concealed)>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Due {
	Notice(u64),
}

#[derive(Debug, PartialEq)]
pub enum Call {
	ReadServers(Which, EnvOwner),
	ReadStatus(Which, EnvOwner),
	ReadSecrets(Which, EnvScope),
	ReadCatalogue,
	Search { generation: u64, query: String },
	Install(Which, Box<InstallRun>),
	Connect { which: Which, owner: EnvOwner, name: String, url: String },
	CancelConnect,
	Disconnect { which: Which, owner: EnvOwner, name: String, url: String },
	Remove { which: Which, owner: EnvOwner, name: String },
	SetSecret { which: Which, scope: EnvScope, name: String, value: Concealed },
	DeleteSecret { which: Which, scope: EnvScope, name: String },
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
	Servers(Which, Result<Vec<McpServer>, HostError>),
	Status(Which, Result<Vec<StatusRow>, HostError>),
	Secrets(Which, Result<Vec<EnvEntry>, HostError>),
	Catalogue(Result<Vec<Application>, HostError>),
	Searched { generation: u64, found: Result<Found, HostError> },
	Installed { which: Which, name: String, outcome: InstallOutcome },
	Connected { which: Which, name: String, outcome: Result<(), HostError> },
	Cancelled(Result<(), HostError>),
	Disconnected { which: Which, name: String, outcome: Result<(), HostError> },
	Removed { which: Which, name: String, outcome: Result<(), HostError> },
	SecretSet { which: Which, outcome: Result<(), HostError> },
	SecretDeleted { which: Which, outcome: Result<(), HostError> },
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

fn declared_with_keys(source: &Source, run: &InstallRun) -> Result<(), InstallFailure> {
	let application = &run.application;
	let scope = server_scope(&run.owner, &application.name);
	for (secret, value) in &run.keys {
		let arguments = json!({ "scope": scope, "name": secret, "value": value.0 });
		done(source.invoke("env_set", arguments)).map_err(refused_with)?;
	}
	if !matches!(application.install, Install::Oauth) {
		return Ok(());
	}
	let url = url_of(&application.config);
	let arguments = json!({ "owner": run.owner, "name": application.name, "url": url });
	done(source.invoke("mcp_oauth_connect", arguments)).map_err(refused_with)?;
	match connect_refusal(source, &run.owner, &application.name) {
		Some(refusal) => Err(refusal),
		None => Ok(()),
	}
}

fn installed(source: &Source, run: &InstallRun) -> InstallOutcome {
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
	let was_declared = match declared_names(source, &run.owner) {
		Ok(names) => names.contains(&application.name),
		Err(failure) => return refused(refusal_text(&failure)),
	};
	let mut arguments = plugin_scope(&run.owner);
	arguments["name"] = json!(application.name);
	arguments["config"] = application.config.clone();
	arguments["mark"] = mark_of(application);
	if let Err(failure) = done(source.invoke("plugin_set_mcp_server", arguments)) {
		return refused(refusal_text(&failure));
	}
	match declared_with_keys(source, run) {
		Ok(()) => InstallOutcome { refusal: None, rollback_refusal: None },
		Err(refusal) => {
			let rollback_refusal = (!was_declared)
				.then(|| rolled_back(source, &run.owner, &application.name))
				.flatten();
			InstallOutcome { refusal: Some(refusal), rollback_refusal }
		}
	}
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadServers(which, owner) => {
			Answer::Servers(which, source.invoke("plugin_mcp_servers", plugin_scope(&owner)))
		}
		Call::ReadStatus(which, owner) => Answer::Status(
			which,
			source.invoke("mcp_application_status", json!({ "owner": owner })),
		),
		Call::ReadSecrets(which, scope) => {
			Answer::Secrets(which, source.invoke("env_list", json!({ "scope": scope })))
		}
		Call::ReadCatalogue => Answer::Catalogue(source.invoke("application_catalogue", json!({}))),
		Call::Search { generation, query } => {
			let found = source.invoke("application_search", json!({ "query": query }));
			Answer::Searched { generation, found }
		}
		Call::Install(which, run) => {
			let outcome = installed(source, &run);
			Answer::Installed { which, name: run.application.name.clone(), outcome }
		}
		Call::Connect { which, owner, name, url } => {
			let arguments = json!({ "owner": owner, "name": name, "url": url });
			Answer::Connected {
				which,
				name,
				outcome: done(source.invoke("mcp_oauth_connect", arguments)),
			}
		}
		Call::CancelConnect => {
			Answer::Cancelled(done(source.invoke("mcp_oauth_cancel", json!({}))))
		}
		Call::Disconnect { which, owner, name, url } => {
			let arguments = json!({ "owner": owner, "name": name, "url": url });
			let outcome = done(source.invoke("mcp_oauth_disconnect", arguments));
			Answer::Disconnected { which, name, outcome }
		}
		Call::Remove { which, owner, name } => {
			let mut arguments = plugin_scope(&owner);
			arguments["name"] = json!(name);
			let outcome = done(source.invoke("plugin_delete_mcp_server", arguments));
			Answer::Removed { which, name, outcome }
		}
		Call::SetSecret { which, scope, name, value } => {
			let arguments = json!({ "scope": scope, "name": name, "value": value.0 });
			Answer::SecretSet { which, outcome: done(source.invoke("env_set", arguments)) }
		}
		Call::DeleteSecret { which, scope, name } => {
			let arguments = json!({ "scope": scope, "name": name });
			Answer::SecretDeleted { which, outcome: done(source.invoke("env_delete", arguments)) }
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
