use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use kiroshi_core::account::contract::AccountPlan;
use kiroshi_core::agent::contract::{Account, CheckReport};
use kiroshi_core::user::contract::{OnboardingStep, UserPreferences};
use rune::Waker;
use serde::Deserialize;
use serde_json::{Value, json};

use super::device::{Approval, ListedDevice};
use crate::app::{Ready, ready_on};
use crate::host::HostError;
use crate::model::ClaudeInventory;
use crate::source::Source;

const API_KEY_CONNECTION: &str = "apiKey";

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct ClaudeReport {
	#[serde(flatten)]
	pub report: CheckReport,
	pub account: Option<Account>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ImportResult {
	Imported { name: String },
	Skipped {},
	Failed { cause: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct ImportOutcome {
	pub key: String,
	pub result: ImportResult,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum KiroshiAccount {
	#[serde(rename_all = "camelCase")]
	Waiting {
		verification_url: String,
	},
	SignedIn {
		email: String,
		plan: Option<AccountPlan>,
	},
	#[serde(rename_all = "camelCase")]
	SignedOut {
		reason: Option<SignedOutReason>,
	},
	#[serde(other)]
	Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SignedOutReason {
	DeviceRefused,
	#[serde(other)]
	Elsewhere,
}

#[derive(Deserialize)]
struct Opened {
	id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Due {
	Notice(u64),
	AccountWatch,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Inventoried {
	ToSettle,
	ToShow,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Call {
	ReadPreferences,
	StoreStep(OnboardingStep),
	ReadClaudeAccount,
	SignIn(u64),
	EnterCode(String),
	CancelSignIn,
	HoldKey(String),
	ReadInventory(Inventoried),
	RunImport { keys: Vec<String>, space_id: String },
	MarkImportSeen,
	ReadKiroshiAccount,
	KiroshiSignIn,
	KiroshiCancel,
	KiroshiSignOut,
	Land { bot_id: String, space_id: String },
	ReadDeviceApproval,
	RetryDeviceApproval,
	RequestDeviceCode,
	SubmitDeviceCode(String),
	ReadDevices,
	ApproveDevice(String),
	RefuseDevice(String),
	Wake(Duration, Due),
}

pub enum Answer {
	Preferences(Result<UserPreferences, HostError>),
	Stored { step: OnboardingStep, outcome: Result<UserPreferences, HostError> },
	ClaudeAccount(Result<ClaudeReport, HostError>),
	SignInStarted(String),
	SignedIn { attempt: u64, outcome: Result<(), HostError> },
	CodeEntered(Result<(), HostError>),
	Cancelled(Result<(), HostError>),
	KeyHeld(Result<(), HostError>),
	Inventory { purpose: Inventoried, inventory: Result<ClaudeInventory, HostError> },
	Imported(Result<Vec<ImportOutcome>, HostError>),
	ImportSeen(Result<UserPreferences, HostError>),
	KiroshiAccount(Result<KiroshiAccount, HostError>),
	KiroshiCommanded { call: Call, outcome: Result<(), HostError> },
	Landed { call: Call, landing: Result<(String, Ready), HostError> },
	DeviceApproval { call: Call, outcome: Result<Approval, HostError> },
	DeviceCommanded { call: Call, outcome: Result<(), HostError> },
	Devices(Result<Vec<ListedDevice>, HostError>),
	DeviceAnswered { call: Call, outcome: Result<(), HostError> },
	Due(Due),
}

fn none() -> Value {
	json!({})
}

fn landed(source: &Source, bot_id: &str, space_id: &str) -> Result<(String, Ready), HostError> {
	let opened: Opened =
		source.invoke("conversation_main_chat", json!({ "botId": bot_id, "spaceId": space_id }))?;
	Ok((opened.id, ready_on(source.clone())?))
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadPreferences => Answer::Preferences(source.invoke("user_preferences", none())),
		Call::StoreStep(step) => Answer::Stored {
			step,
			outcome: source.invoke("user_set_onboarding_step", json!({ "step": step })),
		},
		Call::ReadClaudeAccount => Answer::ClaudeAccount(source.invoke("agent_account", none())),
		Call::SignIn(attempt) => {
			Answer::SignedIn { attempt, outcome: source.invoke("agent_sign_in", none()) }
		}
		Call::EnterCode(text) => {
			Answer::CodeEntered(source.invoke("agent_sign_in_code", json!({ "text": text })))
		}
		Call::CancelSignIn => Answer::Cancelled(source.invoke("agent_sign_in_cancel", none())),
		Call::HoldKey(value) => Answer::KeyHeld(
			source.invoke("connection_set", json!({ "kind": API_KEY_CONNECTION, "value": value })),
		),
		Call::ReadInventory(purpose) => Answer::Inventory {
			purpose,
			inventory: source.invoke("claude_import_inventory", none()),
		},
		Call::RunImport { keys, space_id } => Answer::Imported(
			source.invoke("claude_import_run", json!({ "selection": keys, "spaceId": space_id })),
		),
		Call::MarkImportSeen => {
			Answer::ImportSeen(source.invoke("user_mark_onboarding_import_seen", none()))
		}
		Call::ReadKiroshiAccount => Answer::KiroshiAccount(source.invoke("account_state", none())),
		Call::KiroshiSignIn => {
			let outcome = source.invoke("account_sign_in", none());
			Answer::KiroshiCommanded { call, outcome }
		}
		Call::KiroshiCancel | Call::KiroshiSignOut => {
			let outcome = source.invoke("account_sign_out", none());
			Answer::KiroshiCommanded { call, outcome }
		}
		Call::Land { ref bot_id, ref space_id } => {
			let landing = landed(source, bot_id, space_id);
			Answer::Landed { call, landing }
		}
		Call::ReadDeviceApproval => {
			let outcome = source.invoke("device_approval", none());
			Answer::DeviceApproval { call, outcome }
		}
		Call::RetryDeviceApproval => {
			let outcome = source.invoke("device_approval_retry", none());
			Answer::DeviceApproval { call, outcome }
		}
		Call::RequestDeviceCode => {
			let outcome = source.invoke("device_approval_code_request", none());
			Answer::DeviceCommanded { call, outcome }
		}
		Call::SubmitDeviceCode(ref code) => {
			let outcome = source.invoke("device_approval_code_submit", json!({ "code": code }));
			Answer::DeviceCommanded { call, outcome }
		}
		Call::ReadDevices => Answer::Devices(source.invoke("devices_list", none())),
		Call::ApproveDevice(ref device_id) => {
			let outcome = source.invoke("device_approve", json!({ "deviceId": device_id }));
			Answer::DeviceAnswered { call, outcome }
		}
		Call::RefuseDevice(ref device_id) => {
			let outcome = source.invoke("device_refuse", json!({ "deviceId": device_id }));
			Answer::DeviceAnswered { call, outcome }
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
		let calls = Calls { source, reply: Reply { answers: sender, waker }, answers };
		calls.hear_sign_in();
		calls
	}

	fn hear_sign_in(&self) {
		let reply = self.reply.clone();
		let heard = move |url: String| reply.deliver(Answer::SignInStarted(url));
		match &self.source {
			Source::InProcess(core) => core.on_sign_in_started(heard),
			Source::Running(_) => {
				eprintln!(
					"a running host's sign-in link is not heard: its socket event is unparsed"
				)
			}
		}
	}

	pub fn send(&self, call: Call) {
		let (source, reply) = (self.source.clone(), self.reply.clone());
		let spawned = thread::Builder::new()
			.name("onboarding-call".into())
			.spawn(move || reply.deliver(answered(&source, call)));
		if let Err(failure) = spawned {
			eprintln!("an onboarding call did not start: {failure}");
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
