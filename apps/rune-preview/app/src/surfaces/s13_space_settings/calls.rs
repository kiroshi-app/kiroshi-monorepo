use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use kiroshi_core::invitations::contract::Invitation;
use kiroshi_core::joined_spaces::contract::{JoinedSpace, JoinedSpaceConnection};
use kiroshi_core::spaces::contract::Space;
use rune::Waker;
use serde_json::{Value, json};

use crate::host::HostError;
use crate::model::KiroshiAccountState;
use crate::source::{self, Source};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Due {
	Notice(u64),
	HostingWatch,
}

#[derive(Clone, Debug, PartialEq)]
pub enum MemberCall {
	Invite { email: String },
	Resend { invitation_id: String },
	InviteAgain { user_id: String },
	Withdraw { invitation_id: String },
	Remove { user_id: String },
}

#[derive(Debug, PartialEq)]
pub enum Call {
	ReadSpaces,
	ReadAccount,
	ReadHosting(String),
	StartHosting(String),
	StopHosting(String),
	ReadMembers(String),
	Members { space_id: String, call: MemberCall },
	Save { space_id: String, name: String, colour: Option<i64> },
	Describe { joined_id: String, name: String, colour: Option<i64> },
	Delete(String),
	ReadInvitations,
	Accept(Invitation),
	Decline(Invitation),
	Connect(String),
	Leave(String),
	Wake(Duration, Due),
}

pub enum Answer {
	Spaces(Result<Vec<Space>, HostError>),
	Account(Result<KiroshiAccountState, HostError>),
	Hosting { space_id: String, state: Result<Value, HostError>, is_stop: bool },
	Members { space_id: String, listed: Result<Value, HostError> },
	Changed { space_id: String, call: MemberCall, listed: Result<Value, HostError> },
	Saved(Result<Space, HostError>),
	Described(Result<JoinedSpace, HostError>),
	Deleted { space_id: String, outcome: Result<(), HostError> },
	Invitations(Result<Vec<Invitation>, HostError>),
	Accepted { invitation: Invitation, outcome: Result<JoinedSpace, HostError> },
	Declined { invitation: Invitation, outcome: Result<(), HostError> },
	Connected { joined_id: String, outcome: Result<JoinedSpaceConnection, HostError> },
	Left { joined_id: String, outcome: Result<(), HostError> },
	Due(Due),
}

fn none() -> Value {
	json!({})
}

fn member_answer(source: &Source, space_id: &str, call: &MemberCall) -> Result<Value, HostError> {
	let (command, arguments) = match call {
		MemberCall::Invite { email } => {
			("hosting_invite_member", json!({ "spaceId": space_id, "email": email }))
		}
		MemberCall::Resend { invitation_id } => (
			"hosting_resend_invitation",
			json!({ "spaceId": space_id, "invitationId": invitation_id }),
		),
		MemberCall::InviteAgain { user_id } => {
			("hosting_invite_member_again", json!({ "spaceId": space_id, "userId": user_id }))
		}
		MemberCall::Withdraw { invitation_id } => (
			"hosting_withdraw_invitation",
			json!({ "spaceId": space_id, "invitationId": invitation_id }),
		),
		MemberCall::Remove { user_id } => {
			("hosting_remove_member", json!({ "spaceId": space_id, "userId": user_id }))
		}
	};
	source.invoke(command, arguments)
}

fn hosting(source: &Source, command: &str, space_id: String, is_stop: bool) -> Answer {
	let state = source.invoke(command, json!({ "spaceId": space_id }));
	Answer::Hosting { space_id, state, is_stop }
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadSpaces => Answer::Spaces(source.invoke("space_list", none())),
		Call::ReadAccount => Answer::Account(source.invoke("account_state", none())),
		Call::ReadHosting(space_id) => hosting(source, "hosting_state", space_id, false),
		Call::StartHosting(space_id) => hosting(source, "hosting_start", space_id, false),
		Call::StopHosting(space_id) => hosting(source, "hosting_stop", space_id, true),
		Call::ReadMembers(space_id) => {
			let listed = source.invoke("hosting_members", json!({ "spaceId": space_id }));
			Answer::Members { space_id, listed }
		}
		Call::Members { space_id, call } => {
			let listed = member_answer(source, &space_id, &call);
			Answer::Changed { space_id, call, listed }
		}
		Call::Save { space_id, name, colour } => Answer::Saved(
			source
				.invoke("space_update", json!({ "id": space_id, "name": name, "colour": colour })),
		),
		Call::Describe { joined_id, name, colour } => Answer::Described(source.invoke(
			"joined_space_describe",
			json!({ "id": joined_id, "name": name, "colour": colour }),
		)),
		Call::Delete(space_id) => {
			let outcome = source.invoke("space_delete", json!({ "id": space_id }));
			Answer::Deleted { space_id, outcome }
		}
		Call::ReadInvitations => Answer::Invitations(source.invoke("invitations_list", none())),
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
		Call::Connect(joined_id) => {
			let outcome = source::joined_sources().connect(source, &joined_id);
			Answer::Connected { joined_id, outcome }
		}
		Call::Leave(joined_id) => {
			let outcome = source.invoke("joined_space_remove", json!({ "id": joined_id }));
			Answer::Left { joined_id, outcome }
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

fn served(source: &Source, calls: &Receiver<Call>, reply: &Reply) {
	for call in calls {
		reply.deliver(answered(source, call));
	}
}

pub struct Calls {
	source: Source,
	ordered: Sender<Call>,
	reply: Reply,
	answers: Receiver<Answer>,
}

impl Calls {
	pub fn spawn(source: Source, waker: Waker) -> Option<Calls> {
		let (ordered, waiting) = mpsc::channel();
		let (sender, answers) = mpsc::channel();
		let reply = Reply { answers: sender, waker };
		let (serving, served_source) = (reply.clone(), source.clone());
		let spawned = thread::Builder::new()
			.name("space-settings-calls".into())
			.spawn(move || served(&served_source, &waiting, &serving));
		match spawned {
			Ok(_) => Some(Calls { source, ordered, reply, answers }),
			Err(failure) => {
				eprintln!("the Space settings calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if matches!(call, Call::Wake(..)) {
			return self.send_aside(call);
		}
		if let Err(unsent) = self.ordered.send(call) {
			eprintln!("a Space settings call was not sent, its calls stopped: {:?}", unsent.0);
		}
	}

	fn send_aside(&self, call: Call) {
		let (source, reply) = (self.source.clone(), self.reply.clone());
		let spawned = thread::Builder::new()
			.name("space-settings-wake".into())
			.spawn(move || reply.deliver(answered(&source, call)));
		if let Err(failure) = spawned {
			eprintln!("a Space settings wake did not start: {failure}");
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
