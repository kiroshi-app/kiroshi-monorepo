use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::invitations::contract::Invitation;
use kiroshi_core::joined_spaces::contract::JoinedSpace;
use kiroshi_core::spaces::contract::Space;
use kiroshi_core::user::contract::UserPreferences;
use rune::Waker;
use serde_json::{Value, json};

use crate::app::{self, SpaceContent};
use crate::host::HostError;
use crate::source::Source;

#[derive(Debug, PartialEq)]
pub enum Call {
	ListSpaces,
	ListJoined,
	ListInvitations,
	Hosting(String),
	Load(String),
	Remember(String),
	Create(String),
	Describe { id: String, name: String, colour: Option<i64> },
	Reorder(Vec<String>),
	Delete(String),
	Accept(Invitation),
	Decline(Invitation),
}

pub enum Answer {
	Spaces(Result<Vec<Space>, HostError>),
	Joined(Result<Vec<JoinedSpace>, HostError>),
	Invitations(Result<Vec<Invitation>, HostError>),
	Hosting { space_id: String, state: Result<Value, HostError> },
	Loaded { space_id: String, content: Result<SpaceContent, HostError> },
	Remembered(Result<(), HostError>),
	Created(Result<Space, HostError>),
	Described(Result<Space, HostError>),
	Reordered(Result<(), HostError>),
	Deleted { space_id: String, outcome: Result<(), HostError> },
	Accepted { invitation: Invitation, outcome: Result<JoinedSpace, HostError> },
	Declined { invitation: Invitation, outcome: Result<(), HostError> },
}

fn remembered(source: &Source, space_id: String) -> Result<(), HostError> {
	let mut preferences: UserPreferences = source.invoke("user_preferences", json!({}))?;
	preferences.last_space_id = Some(space_id);
	source
		.invoke::<UserPreferences>("user_set_preferences", json!({ "preferences": preferences }))
		.map(|_| ())
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ListSpaces => Answer::Spaces(source.invoke("space_list", json!({}))),
		Call::ListJoined => Answer::Joined(source.invoke("joined_spaces_list", json!({}))),
		Call::ListInvitations => Answer::Invitations(source.invoke("invitations_list", json!({}))),
		Call::Hosting(space_id) => {
			let state = source.invoke("hosting_state", json!({ "spaceId": space_id }));
			Answer::Hosting { space_id, state }
		}
		Call::Load(space_id) => {
			let content = app::space_content(source, &space_id);
			Answer::Loaded { space_id, content }
		}
		Call::Remember(space_id) => Answer::Remembered(remembered(source, space_id)),
		Call::Create(name) => {
			Answer::Created(source.invoke("space_create", json!({ "name": name })))
		}
		Call::Describe { id, name, colour } => Answer::Described(
			source.invoke("space_update", json!({ "id": id, "name": name, "colour": colour })),
		),
		Call::Reorder(ids) => {
			Answer::Reordered(source.invoke("space_reorder", json!({ "ids": ids })))
		}
		Call::Delete(space_id) => {
			let outcome = source.invoke("space_delete", json!({ "id": space_id }));
			Answer::Deleted { space_id, outcome }
		}
		Call::Accept(invitation) => {
			let outcome =
				source.invoke("invitation_accept", json!({ "invitationId": invitation.id }));
			Answer::Accepted { invitation, outcome }
		}
		Call::Decline(invitation) => {
			let outcome =
				source.invoke("invitation_decline", json!({ "invitationId": invitation.id }));
			Answer::Declined { invitation, outcome }
		}
	}
}

fn served(source: &Source, calls: &Receiver<Call>, answers: &Sender<Answer>, waker: &Waker) {
	for call in calls {
		if answers.send(answered(source, call)).is_err() {
			return;
		}
		waker();
	}
}

pub struct Worker {
	calls: Sender<Call>,
	answers: Receiver<Answer>,
}

impl Worker {
	pub fn spawn(source: Source, waker: Waker) -> Option<Worker> {
		let (calls, waiting) = mpsc::channel();
		let (answering, answers) = mpsc::channel();
		let spawned = thread::Builder::new()
			.name("space-calls".into())
			.spawn(move || served(&source, &waiting, &answering, &waker));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the Space calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("a Space call was not sent, the Space calls stopped: {:?}", unsent.0);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
