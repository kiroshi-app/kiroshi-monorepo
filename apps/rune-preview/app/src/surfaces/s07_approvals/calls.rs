use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::agent::contract::{PermissionDecision, RuntimeScope, ScopedEvent};
use kiroshi_core::conversations::contract::NewUserMessage;
use rune::Waker;
use serde_json::json;

use crate::host::HostError;
use crate::source::Source;

#[derive(Debug, PartialEq)]
pub enum Call {
	Pending { conversation_id: String },
	Respond { scope: RuntimeScope, id: String, decision: PermissionDecision },
	Answer { scope: RuntimeScope, id: String, answers: HashMap<String, String> },
	Write { request_id: String, message: NewUserMessage },
}

pub enum Answer {
	Pending { conversation_id: String, read: Result<Vec<ScopedEvent>, HostError> },
	Responded { id: String, decision: PermissionDecision, outcome: Result<(), HostError> },
	Answered { id: String, outcome: Result<(), HostError> },
	Written { request_id: String, outcome: Result<(), HostError> },
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::Pending { conversation_id } => {
			let arguments = json!({ "conversationId": conversation_id });
			let read = source.invoke("agent_pending_prompts", arguments);
			Answer::Pending { conversation_id, read }
		}
		Call::Respond { scope, id, decision } => {
			let arguments = json!({ "scope": scope, "id": id, "decision": decision });
			let outcome = source.invoke("agent_respond_to_permission", arguments);
			Answer::Responded { id, decision, outcome }
		}
		Call::Answer { scope, id, answers } => {
			let arguments =
				json!({ "scope": scope, "id": id, "answers": answers, "annotations": null });
			let outcome = source.invoke("agent_answer_question", arguments);
			Answer::Answered { id, outcome }
		}
		Call::Write { request_id, message } => {
			let arguments = json!({ "message": message });
			let outcome =
				source.invoke::<i64>("conversation_append_user_message", arguments).map(|_| ());
			Answer::Written { request_id, outcome }
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
			.name("approvals-call".into())
			.spawn(move || reply.deliver(answered(&source, call)));
		if let Err(failure) = spawned {
			eprintln!("an approvals call did not start: {failure}");
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
