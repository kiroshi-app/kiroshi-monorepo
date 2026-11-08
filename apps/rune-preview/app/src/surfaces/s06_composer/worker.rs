use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use kiroshi_core::agent::contract::{AgentCommand, CancelOutcome};
use kiroshi_core::attachments::contract::SubmittedAttachment;
use kiroshi_core::conversations::contract::ReplyLink;
use kiroshi_core::library::contract::LibraryItem;
use rune::Waker;
use serde_json::{Value, json};

use super::prompt_text::with_attachments;
use crate::host::HostError;
use crate::source::Source;

#[derive(Clone, Debug, PartialEq)]
pub struct Outgoing {
	pub message_id: String,
	pub turn_id: String,
	pub conversation_id: String,
	pub content: String,
	pub shown: String,
	pub reply_links: Vec<ReplyLink>,
	pub documents: Vec<String>,
	pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct File {
	pub id: String,
	pub name: String,
	pub bytes: Vec<u8>,
}

#[derive(Debug, PartialEq)]
pub struct Preparing {
	pub outgoing: Outgoing,
	pub seats: Vec<(String, String)>,
	pub files: Vec<File>,
}

#[derive(Debug, PartialEq)]
pub enum Call {
	Prepare(Preparing),
	Send(Outgoing),
	Library { space_id: String },
	Commands { bot_id: String },
	Read { conversation_id: String, paths: Vec<PathBuf> },
	Cancel { conversation_id: String, bot_id: String },
}

#[derive(Debug)]
pub enum Refusal {
	Seat { name: String, failure: HostError },
	Store(HostError),
}

#[derive(Debug)]
pub struct Unread {
	pub name: String,
	pub cause: String,
}

pub enum Answer {
	Prepared { conversation_id: String, message_id: String, prepared: Result<Outgoing, Refusal> },
	Sent { conversation_id: String, message_id: String, outcome: Result<(), HostError> },
	Library { space_id: String, items: Result<Vec<LibraryItem>, HostError> },
	Commands { bot_id: String, commands: Result<Vec<AgentCommand>, HostError> },
	Read { conversation_id: String, files: Vec<Result<File, Unread>> },
	Cancelled { outcome: Result<CancelOutcome, HostError> },
}

fn seated(source: &Source, conversation_id: &str, bot_id: &str) -> Result<(), HostError> {
	let arguments =
		json!({ "conversationId": conversation_id, "botId": bot_id, "invitedByBotId": null });
	source.invoke::<Value>("conversation_add_participant", arguments).map(|_| ())
}

fn submitted(file: &File) -> SubmittedAttachment {
	SubmittedAttachment {
		name: file.name.clone(),
		bytes: None,
		base64: Some(STANDARD.encode(&file.bytes)),
	}
}

fn stored(
	source: &Source,
	conversation_id: &str,
	files: &[File],
) -> Result<Vec<String>, HostError> {
	if files.is_empty() {
		return Ok(Vec::new());
	}
	let attachments: Vec<SubmittedAttachment> = files.iter().map(submitted).collect();
	let arguments = json!({ "conversationId": conversation_id, "attachments": attachments });
	source.invoke("chat_store_attachments", arguments)
}

fn prepared(source: &Source, preparing: Preparing) -> Result<Outgoing, Refusal> {
	let Preparing { mut outgoing, seats, files } = preparing;
	for (bot_id, name) in seats {
		if let Err(failure) = seated(source, &outgoing.conversation_id, &bot_id) {
			return Err(Refusal::Seat { name, failure });
		}
	}
	let paths = stored(source, &outgoing.conversation_id, &files).map_err(Refusal::Store)?;
	outgoing.content = with_attachments(&outgoing.content, &paths, outgoing.created_at);
	Ok(outgoing)
}

fn sent(source: &Source, outgoing: &Outgoing) -> Result<(), HostError> {
	let message = json!({
		"id": outgoing.message_id,
		"conversationId": outgoing.conversation_id,
		"turnId": outgoing.turn_id,
		"content": outgoing.content,
		"createdAt": outgoing.created_at,
		"repliedToMessageId": outgoing.reply_links.first().map(|link| &link.message_id),
		"replyLinks": outgoing.reply_links,
		"documents": outgoing.documents,
	});
	let arguments = json!({ "message": message, "summoned": [] });
	source.invoke_turn::<Value>("conversation_send_turn", arguments).map(|_| ())
}

fn read(path: PathBuf) -> Result<File, Unread> {
	let name = path
		.file_name()
		.map_or_else(|| path.display().to_string(), |name| name.to_string_lossy().into_owned());
	match std::fs::read(&path) {
		Ok(bytes) => Ok(File { id: uuid::Uuid::new_v4().to_string(), name, bytes }),
		Err(failure) => Err(Unread { name, cause: failure.to_string() }),
	}
}

fn cancelled(
	source: &Source,
	conversation_id: &str,
	bot_id: &str,
) -> Result<CancelOutcome, HostError> {
	let scope = json!({
		"conversationId": conversation_id,
		"botId": bot_id,
		"runtimeSessionId": "",
		"epoch": 0,
	});
	source.invoke("agent_cancel_turn", json!({ "scope": scope }))
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::Prepare(preparing) => {
			let conversation_id = preparing.outgoing.conversation_id.clone();
			let message_id = preparing.outgoing.message_id.clone();
			Answer::Prepared { conversation_id, message_id, prepared: prepared(source, preparing) }
		}
		Call::Send(outgoing) => {
			let outcome = sent(source, &outgoing);
			let Outgoing { conversation_id, message_id, .. } = outgoing;
			Answer::Sent { conversation_id, message_id, outcome }
		}
		Call::Library { space_id } => {
			let items = source.invoke("library_list", json!({ "spaceId": space_id }));
			Answer::Library { space_id, items }
		}
		Call::Commands { bot_id } => {
			let commands = source.invoke("conversation_bot_commands", json!({ "botId": bot_id }));
			Answer::Commands { bot_id, commands }
		}
		Call::Read { conversation_id, paths } => {
			Answer::Read { conversation_id, files: paths.into_iter().map(read).collect() }
		}
		Call::Cancel { conversation_id, bot_id } => {
			Answer::Cancelled { outcome: cancelled(source, &conversation_id, &bot_id) }
		}
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

fn served(source: &Source, calls: &Receiver<Call>, reply: &Reply) {
	for call in calls {
		if !reply.deliver(answered(source, call)) {
			return;
		}
	}
}

pub struct Worker {
	source: Source,
	reply: Reply,
	calls: Sender<Call>,
	answers: Receiver<Answer>,
}

impl Worker {
	pub fn spawn(source: Source, waker: Waker) -> Option<Worker> {
		let (calls, waiting) = mpsc::channel();
		let (answering, answers) = mpsc::channel();
		let reply = Reply { answers: answering, waker };
		let serving = (source.clone(), reply.clone());
		let spawned = thread::Builder::new()
			.name("composer-calls".into())
			.spawn(move || served(&serving.0, &waiting, &serving.1));
		match spawned {
			Ok(_) => Some(Worker { source, reply, calls, answers }),
			Err(failure) => {
				eprintln!("the composer calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Call::Send(outgoing) = call {
			return self.send_turn(outgoing);
		}
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("a composer call was not sent, the composer calls stopped: {:?}", unsent.0);
		}
	}

	fn send_turn(&self, outgoing: Outgoing) {
		let (source, reply) = (self.source.clone(), self.reply.clone());
		let conversation_id = outgoing.conversation_id.clone();
		let message_id = outgoing.message_id.clone();
		let spawned = thread::Builder::new()
			.name("composer-turn".into())
			.spawn(move || reply.deliver(answered(&source, Call::Send(outgoing))));
		if let Err(failure) = spawned {
			let outcome = Err(HostError::InProcess { cause: failure.to_string() });
			self.reply.deliver(Answer::Sent { conversation_id, message_id, outcome });
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
