use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use kiroshi_core::search::contract::{Catalogue, CatalogueChat, MessageHit};
use kiroshi_core::updates::contract::UpdateState;
use kiroshi_core::user::contract::UserPreferences;
use rune::Waker;
use serde_json::{Value, json};

use super::account::{DeviceRead, Watched};
use super::diagnostics::Specs;
use super::preferences::Change;
use crate::host::HostError;
use crate::model::{MissionDetail, Space};
use crate::source::Source;

#[derive(Clone, Debug, PartialEq)]
pub struct Scope {
	pub generation: u64,
	pub space_id: String,
	pub query: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Due {
	Search(u64),
	Notice(u64),
	SignInWatch,
	DownloadWatch,
}

#[derive(Debug, PartialEq)]
pub enum Call {
	ReadPreferences,
	Change(Change),
	ReplayOnboarding,
	ReadAccount,
	SignIn,
	CancelSignIn,
	SignOut,
	ReadDevices,
	RemoveDevice(String),
	ReadVersion,
	CopyDiagnostics,
	RevealLog,
	ClearLog,
	ReadUpdate,
	CheckUpdate,
	InstallUpdate,
	RestartToUpdate,
	CountRunning,
	ReadSpaces,
	CreateSpace(String),
	Search(Scope),
	ReadMission(String),
	Wake(Duration, Due),
}

pub struct Found {
	pub messages: Vec<MessageHit>,
	pub catalogue: Catalogue,
	pub recents: Option<Vec<CatalogueChat>>,
}

pub enum Answer {
	Preferences(Result<UserPreferences, HostError>),
	Changed(Result<UserPreferences, HostError>),
	Replayed(Result<UserPreferences, HostError>),
	Account(Result<Watched, HostError>),
	SignedIn(Result<(), HostError>),
	Cancelled(Result<(), HostError>),
	SignedOut(Result<(), HostError>),
	Devices(Result<Vec<DeviceRead>, HostError>),
	Removed { device_id: String, outcome: Result<(), HostError> },
	Version(Result<Specs, HostError>),
	Diagnostics(Result<Specs, HostError>),
	Revealed(Result<(), HostError>),
	Cleared(Result<(), HostError>),
	Update(Result<UpdateState, HostError>),
	Checked(Result<UpdateState, HostError>),
	Installed(Result<UpdateState, HostError>),
	Restarted(Result<UpdateState, HostError>),
	Running(Result<usize, HostError>),
	Spaces(Result<Vec<Space>, HostError>),
	Created(Result<Space, HostError>),
	Searched { scope: Scope, found: Result<Found, HostError> },
	Mission(Result<MissionDetail, HostError>),
	Due(Due),
}

fn none() -> Value {
	json!({})
}

fn changed(source: &Source, change: &Change) -> Result<UserPreferences, HostError> {
	let held: UserPreferences = source.invoke("user_preferences", none())?;
	let preferences = change.written_on(held);
	source.invoke("user_set_preferences", json!({ "preferences": preferences }))
}

fn found(source: &Source, scope: &Scope) -> Result<Found, HostError> {
	let space = json!({ "spaceId": scope.space_id });
	let catalogue = source
		.invoke("search_catalogue", json!({ "query": scope.query, "spaceId": scope.space_id }))?;
	if scope.query.is_empty() {
		let recents = source.invoke("search_recent", space)?;
		return Ok(Found { messages: Vec::new(), catalogue, recents: Some(recents) });
	}
	let query = json!({ "query": { "text": scope.query, "spaceId": scope.space_id } });
	let messages = source.invoke("search_messages", query)?;
	Ok(Found { messages, catalogue, recents: None })
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadPreferences => Answer::Preferences(source.invoke("user_preferences", none())),
		Call::Change(change) => Answer::Changed(changed(source, &change)),
		Call::ReplayOnboarding => Answer::Replayed(source.invoke("user_replay_onboarding", none())),
		Call::ReadAccount => Answer::Account(source.invoke("account_state", none())),
		Call::SignIn => Answer::SignedIn(source.invoke("account_sign_in", none())),
		Call::CancelSignIn => Answer::Cancelled(source.invoke("account_sign_out", none())),
		Call::SignOut => Answer::SignedOut(source.invoke("account_sign_out", none())),
		Call::ReadDevices => Answer::Devices(source.invoke("devices_list", none())),
		Call::RemoveDevice(device_id) => {
			let outcome = source.invoke("device_remove", json!({ "deviceId": device_id }));
			Answer::Removed { device_id, outcome }
		}
		Call::ReadVersion => Answer::Version(source.invoke("diagnostics", none())),
		Call::CopyDiagnostics => Answer::Diagnostics(source.invoke("diagnostics", none())),
		Call::RevealLog => Answer::Revealed(source.invoke("log_reveal", none())),
		Call::ClearLog => Answer::Cleared(source.invoke("log_clear", none())),
		Call::ReadUpdate => Answer::Update(source.invoke("update_state", none())),
		Call::CheckUpdate => Answer::Checked(source.invoke("check_for_updates", none())),
		Call::InstallUpdate => Answer::Installed(source.invoke("install_update", none())),
		Call::RestartToUpdate => Answer::Restarted(source.invoke("restart_to_update", none())),
		Call::CountRunning => Answer::Running(source.invoke("running_companions", none())),
		Call::ReadSpaces => Answer::Spaces(source.invoke("space_list", none())),
		Call::CreateSpace(name) => {
			Answer::Created(source.invoke("space_create", json!({ "name": name })))
		}
		Call::Search(scope) => {
			let found = found(source, &scope);
			Answer::Searched { scope, found }
		}
		Call::ReadMission(mission_id) => {
			Answer::Mission(source.invoke("mission_detail", json!({ "missionId": mission_id })))
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
			.name("settings-call".into())
			.spawn(move || reply.deliver(answered(&source, call)));
		if let Err(failure) = spawned {
			eprintln!("a settings call did not start: {failure}");
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
