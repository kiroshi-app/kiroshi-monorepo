use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use kiroshi_core::conversations::contract::{PinnedBubble, TranscriptPage};
use rune::Waker;
use serde_json::json;

use crate::host::HostError;
use crate::source::Source;

pub const PAGE_SIZE: u32 = 20;

#[derive(Debug, PartialEq)]
pub enum Call {
	Page { conversation_id: String, before_seq: Option<i64> },
	Pins { conversation_id: String },
	Pin { conversation_id: String, message_id: String, pinned_at: i64 },
	Unpin { conversation_id: String, message_id: String, block_indexes: Vec<i64> },
}

pub enum Answer {
	Paged {
		conversation_id: String,
		before_seq: Option<i64>,
		page: Result<TranscriptPage, HostError>,
	},
	Pins {
		conversation_id: String,
		pins: Result<Vec<PinnedBubble>, HostError>,
	},
	Pinned {
		conversation_id: String,
		outcome: Result<(), HostError>,
	},
}

const WHOLE_MESSAGE_BLOCK: i64 = 0;

fn unpinned(
	source: &Source,
	conversation_id: &str,
	message_id: &str,
	block_indexes: &[i64],
) -> Result<(), HostError> {
	block_indexes.iter().try_for_each(|block_index| {
		let arguments = json!({
			"conversationId": conversation_id,
			"messageId": message_id,
			"blockIndex": block_index,
		});
		source.invoke("conversation_unpin_message", arguments)
	})
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::Page { conversation_id, before_seq } => {
			let arguments = json!({
				"conversationId": conversation_id,
				"beforeSeq": before_seq,
				"limit": PAGE_SIZE,
			});
			let page = source.invoke("conversation_message_page", arguments);
			Answer::Paged { conversation_id, before_seq, page }
		}
		Call::Pins { conversation_id } => {
			let arguments = json!({ "conversationId": conversation_id });
			let pins = source.invoke("conversation_pinned_messages", arguments);
			Answer::Pins { conversation_id, pins }
		}
		Call::Pin { conversation_id, message_id, pinned_at } => {
			let arguments = json!({
				"conversationId": conversation_id,
				"messageId": message_id,
				"blockIndex": WHOLE_MESSAGE_BLOCK,
				"pinnedAt": pinned_at,
			});
			let outcome = source.invoke("conversation_pin_message", arguments);
			Answer::Pinned { conversation_id, outcome }
		}
		Call::Unpin { conversation_id, message_id, block_indexes } => {
			let outcome = unpinned(source, &conversation_id, &message_id, &block_indexes);
			Answer::Pinned { conversation_id, outcome }
		}
	}
}

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

fn served(source: &Source, calls: &Receiver<Call>, reply: &Reply) {
	for call in calls {
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
			.name("thread-calls".into())
			.spawn(move || served(&source, &waiting, &reply));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the thread calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("a thread call was not sent, the thread calls stopped: {:?}", unsent.0);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
