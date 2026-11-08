use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::missions::contract::{Mission, MissionDetail, MissionInSpace};
use rune::Waker;
use serde_json::json;

use crate::host::HostError;
use crate::source::Source;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
	Close,
	Reopen,
}

impl Command {
	pub fn name(self) -> &'static str {
		match self {
			Command::Close => "mission_close",
			Command::Reopen => "mission_reopen",
		}
	}
}

#[derive(Debug, PartialEq, Eq)]
pub enum Call {
	Feed { space_id: String, closed_since: i64 },
	Detail(String),
	Write { command: Command, mission_id: String },
}

pub enum Answer {
	Feed { space_id: String, closed_since: i64, feed: Result<Vec<MissionInSpace>, HostError> },
	Detail { mission_id: String, detail: Result<MissionDetail, HostError> },
	Written { command: Command, mission_id: String, outcome: Result<Mission, HostError> },
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::Feed { space_id, closed_since } => {
			let feed = source.invoke(
				"mission_space_feed",
				json!({ "spaceId": space_id, "closedSince": closed_since }),
			);
			Answer::Feed { space_id, closed_since, feed }
		}
		Call::Detail(mission_id) => {
			let detail = source.invoke("mission_detail", json!({ "missionId": mission_id }));
			Answer::Detail { mission_id, detail }
		}
		Call::Write { command, mission_id } => {
			let outcome = source.invoke(command.name(), json!({ "missionId": mission_id }));
			Answer::Written { command, mission_id, outcome }
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
			.name("mission-calls".into())
			.spawn(move || served(&source, &waiting, &answering, &waker));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the mission calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("a mission call was not sent, the mission calls stopped: {:?}", unsent.0);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
