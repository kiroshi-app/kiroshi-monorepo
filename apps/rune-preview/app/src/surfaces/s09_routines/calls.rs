use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::routines::contract::{
	Routine, RoutineDraft, RoutineEdit, RoutineKey, RoutineRun, TriggerDecision, TriggerSource,
};
use rune::Waker;
use serde_json::json;

use crate::host::HostError;
use crate::source::Source;

pub const RUN_PAGE: usize = 50;

#[derive(Debug, PartialEq)]
pub enum Call {
	ReadList { generation: u64, conversation_id: String, lead_bot_id: Option<String> },
	ReadRuns { generation: u64, routine_id: String },
	Toggle { id: String, edit: RoutineEdit },
	Create { placement: u64, draft: RoutineDraft },
	Edit { placement: u64, id: String, edit: RoutineEdit },
	Delete(String),
	RunNow { opened: u64, routine_id: String },
	ReadKey { placement: u64, routine_id: String },
}

pub struct Listed {
	pub routines: Result<Vec<Routine>, HostError>,
	pub sources: Vec<(String, Result<Vec<TriggerSource>, HostError>)>,
}

pub enum Answer {
	Listed { generation: u64, listed: Listed },
	Runs { generation: u64, runs: Result<Vec<RoutineRun>, HostError> },
	Toggled(Result<Routine, HostError>),
	Saved { placement: u64, saved: Result<Routine, HostError> },
	Deleted { id: String, outcome: Result<(), HostError> },
	RanNow { opened: u64, decision: Result<TriggerDecision, HostError> },
	Key { placement: u64, key: Result<RoutineKey, HostError> },
}

fn bots_to_read(lead_bot_id: Option<String>, routines: &[Routine]) -> Vec<String> {
	let mut bots: Vec<String> = lead_bot_id.into_iter().collect();
	for routine in routines {
		if !bots.contains(&routine.bot_id) {
			bots.push(routine.bot_id.clone());
		}
	}
	bots
}

fn listed(source: &Source, conversation_id: &str, lead_bot_id: Option<String>) -> Listed {
	let routines: Result<Vec<Routine>, HostError> =
		source.invoke("routine_list", json!({ "conversationId": conversation_id }));
	let held = routines.as_deref().unwrap_or_default();
	let sources = bots_to_read(lead_bot_id, held)
		.into_iter()
		.map(|bot_id| {
			let declared = source.invoke("routine_trigger_sources", json!({ "botId": bot_id }));
			(bot_id, declared)
		})
		.collect();
	Listed { routines, sources }
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::ReadList { generation, conversation_id, lead_bot_id } => {
			Answer::Listed { generation, listed: listed(source, &conversation_id, lead_bot_id) }
		}
		Call::ReadRuns { generation, routine_id } => Answer::Runs {
			generation,
			runs: source
				.invoke("routine_runs", json!({ "routineId": routine_id, "limit": RUN_PAGE })),
		},
		Call::Toggle { id, edit } => {
			Answer::Toggled(source.invoke("routine_update", json!({ "id": id, "edit": edit })))
		}
		Call::Create { placement, draft } => Answer::Saved {
			placement,
			saved: source.invoke("routine_create", json!({ "draft": draft })),
		},
		Call::Edit { placement, id, edit } => Answer::Saved {
			placement,
			saved: source.invoke("routine_update", json!({ "id": id, "edit": edit })),
		},
		Call::Delete(id) => {
			let outcome = source.invoke("routine_delete", json!({ "id": id }));
			Answer::Deleted { id, outcome }
		}
		Call::RunNow { opened, routine_id } => Answer::RanNow {
			opened,
			decision: source.invoke("routine_run_now", json!({ "id": routine_id })),
		},
		Call::ReadKey { placement, routine_id } => Answer::Key {
			placement,
			key: source.invoke("routine_key", json!({ "id": routine_id })),
		},
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
			.name("routines-call".into())
			.spawn(move || reply.deliver(answered(&source, call)));
		if let Err(failure) = spawned {
			eprintln!("a routines call did not start: {failure}");
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
