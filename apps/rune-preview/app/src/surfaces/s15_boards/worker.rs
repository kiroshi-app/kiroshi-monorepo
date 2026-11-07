use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::library::contract::{
	LibraryBoardSummary, LibraryDocumentState, LibraryImport, LibraryItem, LibraryPresenceAt,
};
use kiroshi_core::library::link_preview::contract::LibraryLinkPreview;
use rune::Waker;
use serde_json::json;

use kiroshi_rune_kit::surfaces::s15_boards::model::Point;

use crate::host::HostError;
use crate::source::Source;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
	pub space_id: String,
	pub name: String,
}

#[derive(Debug, PartialEq)]
pub enum Call {
	Open(Target),
	Apply { target: Target, update: String },
	Share { target: Target, at: Option<LibraryPresenceAt> },
	Stop(Target),
	List { space_id: String },
	Import { space_id: String, paths: Vec<PathBuf>, at: Point },
	Preview { id: String, url: String },
	Summarise(Target),
	Wake(Duration),
}

pub enum Answer {
	Opened { target: Target, state: Result<LibraryDocumentState, HostError> },
	Applied { target: Target, outcome: Result<(), HostError> },
	Shared(Result<(), HostError>),
	Stopped(Result<CancelOutcome, HostError>),
	Listed { space_id: String, items: Result<Vec<LibraryItem>, HostError> },
	Imported { paths: Vec<PathBuf>, at: Point, imports: Result<Vec<LibraryImport>, HostError> },
	Previewed { id: String, preview: Result<LibraryLinkPreview, HostError> },
	Summarised { target: Target, summary: Result<LibraryBoardSummary, HostError> },
	Due,
}

fn located(target: &Target) -> serde_json::Value {
	json!({ "spaceId": target.space_id, "name": target.name })
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::Open(target) => {
			let state = source.invoke("library_open_document", located(&target));
			Answer::Opened { target, state }
		}
		Call::Apply { target, update } => {
			let arguments =
				json!({ "spaceId": target.space_id, "name": target.name, "update": update });
			let outcome = source.invoke("library_apply_update", arguments);
			Answer::Applied { target, outcome }
		}
		Call::Share { target, at } => {
			let arguments = json!({ "spaceId": target.space_id, "name": target.name, "at": at });
			Answer::Shared(source.invoke("library_share_presence", arguments))
		}
		Call::Stop(target) => {
			let arguments =
				json!({ "spaceId": target.space_id, "name": target.name, "agentId": null });
			Answer::Stopped(source.invoke("library_stop_writers", arguments))
		}
		Call::List { space_id } => {
			let items = source.invoke("library_list", json!({ "spaceId": space_id }));
			Answer::Listed { space_id, items }
		}
		Call::Import { space_id, paths, at } => {
			let arguments = json!({ "spaceId": space_id, "paths": paths });
			let imports = source.invoke("library_import_paths", arguments);
			Answer::Imported { paths, at, imports }
		}
		Call::Preview { id, url } => {
			let preview = source.invoke("library_read_link_preview", json!({ "url": url }));
			Answer::Previewed { id, preview }
		}
		Call::Summarise(target) => {
			let summary = source.invoke("library_board_summary", located(&target));
			Answer::Summarised { target, summary }
		}
		Call::Wake(_) => Answer::Due,
	}
}

#[derive(Clone)]
struct Reply {
	answers: Sender<Answer>,
	waker: Waker,
}

impl Reply {
	fn deliver(&self, answer: Answer) -> bool {
		let is_heard = self.answers.send(answer).is_ok();
		if is_heard {
			(self.waker)();
		}
		is_heard
	}
}

fn woken(reply: Reply, after: Duration) {
	let spawned = thread::Builder::new().name("board-wake".into()).spawn(move || {
		thread::sleep(after);
		reply.deliver(Answer::Due);
	});
	if let Err(failure) = spawned {
		eprintln!("the board pointer share did not schedule: {failure}");
	}
}

fn served(source: &Source, calls: &Receiver<Call>, reply: &Reply) {
	for call in calls {
		if let Call::Wake(after) = call {
			woken(reply.clone(), after);
			continue;
		}
		if !reply.deliver(answered(source, call)) {
			return;
		}
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
		let reply = Reply { answers: answering, waker };
		let spawned = thread::Builder::new()
			.name("board-calls".into())
			.spawn(move || served(&source, &waiting, &reply));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the board calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("a board call was not sent, the board calls stopped: {:?}", unsent.0);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
