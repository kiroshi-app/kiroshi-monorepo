use rune::TextEdit;
use serde_json::Value;

use kiroshi_rune_kit::strings::{Key, chat};
use kiroshi_rune_kit::surfaces::s04_boot::connect::{ConnectMethod, ConnectStep};

use super::calls::{Call, ClaudeReport};
use crate::host::HostError;

const NOT_RUNNING: &str = "notRunning";

const NOT_AUTHENTICATED: &str = "notAuthenticated";

const NO_REASON: &str = "the agent gave no reason";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectFailure {
	Cancelled,
	TimedOut,
	LinkRefused,
	AgentMissing,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Connection {
	Detected { email: String, plan: Option<String> },
	Offer,
	AnotherAccount,
	Waiting { url: String },
	ApiKey,
	SignInFailed(ConnectFailure),
	ApiKeyFailed,
}

#[derive(Debug, PartialEq)]
pub enum Next {
	Call(Call),
	Open(String),
	Settle,
	Failed { title: Key, detail: String },
}

const SIGN_IN_FAILED: Key = chat::onboarding::sign_in_failed::TITLE;

const KEY_FAILED: Key = chat::onboarding::connection::key_failed::TITLE;

pub struct SignIn {
	pub connection: Option<Connection>,
	pub is_busy: bool,
	pub method: ConnectMethod,
	pub code: TextEdit,
	pub api_key: TextEdit,
	attempt: u64,
	running: Option<u64>,
}

impl Default for SignIn {
	fn default() -> SignIn {
		SignIn {
			connection: None,
			is_busy: false,
			method: ConnectMethod::SignIn,
			code: TextEdit::new(""),
			api_key: TextEdit::new(""),
			attempt: 0,
			running: None,
		}
	}
}

fn refusal_of(failure: &HostError) -> Option<Value> {
	match failure {
		HostError::CommandFailed { body, .. } => serde_json::from_str(body).ok(),
		_ => None,
	}
}

fn field_of(refusal: Option<&Value>, field: &str) -> Option<String> {
	refusal?.get(field)?.as_str().map(str::to_owned)
}

pub fn kind_of(failure: &HostError) -> Option<String> {
	field_of(refusal_of(failure).as_ref(), "kind")
}

fn is_not_running(failure: &HostError) -> bool {
	kind_of(failure).as_deref() == Some(NOT_RUNNING)
}

fn sentence_of(kind: &str) -> &'static str {
	match kind {
		"alreadyRunning" => "a sign-in is already running",
		"notRunning" => "no sign-in is running",
		"cancelled" => "the sign-in was cancelled",
		"timedOut" => "the sign-in timed out",
		"refusedUrl" => "the sign-in link was refused",
		"flowTimedOut" => "the sign-in flow timed out",
		"notAuthenticated" => "no Claude account is signed in",
		"binaryNotFound" => "the agent binary wasn’t found",
		"spawnFailed" => "the agent couldn’t be started",
		"startupTimeout" => "the agent didn’t start in time",
		"crashed" => "the agent stopped",
		_ => NO_REASON,
	}
}

fn detail_in(refusal: Option<&Value>) -> String {
	field_of(refusal, "detail")
		.or_else(|| field_of(refusal, "kind").map(|kind| sentence_of(&kind).to_owned()))
		.unwrap_or_else(|| NO_REASON.to_owned())
}

pub fn detail_of(failure: &HostError) -> String {
	match refusal_of(failure) {
		Some(refusal) => detail_in(Some(&refusal)),
		None => failure.detail(),
	}
}

fn connect_failure_of(kind: Option<&str>) -> ConnectFailure {
	match kind {
		Some("timedOut" | "flowTimedOut" | "startupTimeout") => ConnectFailure::TimedOut,
		Some("refusedUrl") => ConnectFailure::LinkRefused,
		Some("binaryNotFound" | "spawnFailed") => ConnectFailure::AgentMissing,
		_ => ConnectFailure::Cancelled,
	}
}

pub fn initials_of(email: &str) -> String {
	let local_part = email.split('@').next().unwrap_or_default();
	let mut parts = local_part.split(['.', '_', '+', '-']).filter(|part| !part.is_empty());
	let first = parts.next().unwrap_or_default();
	let initials: String = match parts.next() {
		Some(second) => first.chars().take(1).chain(second.chars().take(1)).collect(),
		None => first.chars().take(2).collect(),
	};
	initials.to_uppercase()
}

impl SignIn {
	pub fn step(&self) -> Option<ConnectStep> {
		let step = match self.connection.as_ref()? {
			Connection::Detected { .. } => ConnectStep::LoginFound,
			Connection::Offer => ConnectStep::NothingFound,
			Connection::AnotherAccount => ConnectStep::AnotherAccount,
			Connection::Waiting { .. } if self.is_busy => ConnectStep::Connecting,
			Connection::Waiting { .. } => ConnectStep::WaitingForCode,
			Connection::ApiKey => ConnectStep::KeyField,
			Connection::SignInFailed(failure) => match failure {
				ConnectFailure::Cancelled => ConnectStep::Cancelled,
				ConnectFailure::TimedOut => ConnectStep::TimedOut,
				ConnectFailure::LinkRefused => ConnectStep::LinkRefused,
				ConnectFailure::AgentMissing => ConnectStep::AgentMissing,
			},
			Connection::ApiKeyFailed => ConnectStep::KeyRefused,
		};
		Some(step)
	}

	pub fn sign_in_url(&self) -> Option<&str> {
		match &self.connection {
			Some(Connection::Waiting { url }) => Some(url),
			_ => None,
		}
	}

	pub fn has_entered(&self) -> bool {
		self.connection.is_some() || self.is_busy
	}

	fn show(&mut self, connection: Connection) {
		self.connection = Some(connection);
		self.is_busy = false;
	}

	fn show_failed(&mut self, failure: ConnectFailure, detail: String) -> Vec<Next> {
		self.show(Connection::SignInFailed(failure));
		vec![Next::Failed { title: SIGN_IN_FAILED, detail }]
	}

	fn show_refused(&mut self, failure: &HostError) -> Vec<Next> {
		self.show_failed(connect_failure_of(kind_of(failure).as_deref()), detail_of(failure))
	}

	fn is_signing_in(&self) -> bool {
		self.running == Some(self.attempt)
	}

	fn end_sign_in(&mut self) -> Call {
		self.attempt += 1;
		Call::CancelSignIn
	}

	pub fn read_account(&mut self) -> Vec<Next> {
		self.is_busy = true;
		vec![Next::Call(Call::ReadClaudeAccount)]
	}

	pub fn account_read(&mut self, report: Result<ClaudeReport, HostError>) -> Vec<Next> {
		self.is_busy = false;
		let report = match report {
			Ok(report) => report,
			Err(failure) => return self.show_refused(&failure),
		};
		let error = report.report.error.as_ref().and_then(|error| serde_json::to_value(error).ok());
		let error_kind = field_of(error.as_ref(), "kind");
		if error.is_some() && error_kind.as_deref() != Some(NOT_AUTHENTICATED) {
			let failure = connect_failure_of(error_kind.as_deref());
			return self.show_failed(failure, detail_in(error.as_ref()));
		}
		if !report.report.authenticated {
			self.show(Connection::Offer);
			return Vec::new();
		}
		let Some(account) = report.account else { return vec![Next::Settle] };
		match account.email {
			Some(email) => {
				self.show(Connection::Detected { email, plan: account.plan });
				Vec::new()
			}
			None => vec![Next::Settle],
		}
	}

	pub fn change_account(&mut self) {
		self.show(Connection::AnotherAccount);
	}

	pub fn pick(&mut self, method: ConnectMethod) {
		self.method = method;
	}

	pub fn sign_in(&mut self) -> Vec<Next> {
		self.code = TextEdit::new("");
		let mut next = Vec::new();
		if self.is_signing_in() {
			next.push(Next::Call(self.end_sign_in()));
		}
		self.attempt += 1;
		self.running = Some(self.attempt);
		self.is_busy = true;
		next.push(Next::Call(Call::SignIn(self.attempt)));
		next
	}

	pub fn sign_in_started(&mut self, url: String) -> Vec<Next> {
		if !self.is_signing_in() {
			return Vec::new();
		}
		self.show(Connection::Waiting { url: url.clone() });
		vec![Next::Open(url)]
	}

	pub fn link_refused(&mut self, detail: String) -> Vec<Next> {
		if !self.is_signing_in() {
			return Vec::new();
		}
		self.show_failed(ConnectFailure::Cancelled, detail)
	}

	pub fn signed_in(&mut self, attempt: u64, outcome: Result<(), HostError>) -> Vec<Next> {
		let is_live = attempt == self.attempt;
		if self.running == Some(attempt) {
			self.running = None;
		}
		if !is_live {
			return Vec::new();
		}
		self.is_busy = false;
		match outcome {
			Ok(()) => vec![Next::Settle],
			Err(failure) => self.show_refused(&failure),
		}
	}

	pub fn submit_code(&mut self) -> Vec<Next> {
		self.is_busy = true;
		vec![Next::Call(Call::EnterCode(self.code.text.clone()))]
	}

	pub fn code_entered(&mut self, outcome: Result<(), HostError>) -> Vec<Next> {
		let next = self.ignoring_not_running(outcome);
		self.is_busy = false;
		next
	}

	pub fn cancelled(&mut self, outcome: Result<(), HostError>) -> Vec<Next> {
		self.ignoring_not_running(outcome)
	}

	fn ignoring_not_running(&mut self, outcome: Result<(), HostError>) -> Vec<Next> {
		match outcome {
			Err(failure) if !is_not_running(&failure) => self.show_refused(&failure),
			_ => Vec::new(),
		}
	}

	pub fn paste_key(&mut self) -> Vec<Next> {
		self.show(Connection::ApiKey);
		vec![Next::Call(self.end_sign_in())]
	}

	pub fn try_another_key(&mut self) {
		self.api_key = TextEdit::new("");
		self.show(Connection::ApiKey);
	}

	pub fn submit_key(&mut self) -> Vec<Next> {
		self.is_busy = true;
		let mut next = Vec::new();
		if self.is_signing_in() {
			next.push(Next::Call(self.end_sign_in()));
		}
		next.push(Next::Call(Call::HoldKey(self.api_key.text.clone())));
		next
	}

	pub fn key_held(&mut self, outcome: Result<(), HostError>) -> Vec<Next> {
		match outcome {
			Ok(()) => self.read_account(),
			Err(failure) => {
				self.show(Connection::ApiKeyFailed);
				vec![Next::Failed { title: KEY_FAILED, detail: detail_of(&failure) }]
			}
		}
	}
}
