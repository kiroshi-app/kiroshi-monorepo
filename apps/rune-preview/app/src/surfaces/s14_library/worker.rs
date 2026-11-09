use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::library::contract::{
	LibraryDocument, LibraryDocumentState, LibraryError, LibraryImage, LibraryImport, LibraryItem,
	LibraryPresenceAt,
};
use rune::Waker;
use serde_json::json;

use super::rich::GalleryAdd;
use super::session::Session;
use crate::host::HostError;
use crate::source::Source;

const DOCUMENT_EXTENSION: &str = ".md";

const BOARD_EXTENSION_ADDED_BY_HOST: &str = "";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Due {
	Flush,
	Copied,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
	pub space_id: String,
	pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewDocument {
	pub space_id: String,
	pub title: String,
	pub untitled: String,
	pub body: String,
}

#[derive(Debug, PartialEq)]
pub enum Call {
	List { space_id: String },
	Thumbnail(Target),
	Excerpt(Target),
	Image(Target),
	Open(Target),
	Apply { target: Target, update: String },
	Create(NewDocument),
	Rename { target: Target, new_name: String },
	Delete(Target),
	Import { space_id: String, paths: Vec<PathBuf> },
	Share { target: Target, at: Option<LibraryPresenceAt> },
	Stop(Target),
	Download(Target),
	Copy(Target),
	Reveal(Target),
	GalleryImport { target: Target, add: GalleryAdd, path: PathBuf },
	CreateBoard { space_id: String, untitled: String },
	Wake(Duration, Due),
}

pub enum Answer {
	Listed {
		space_id: String,
		items: Result<Vec<LibraryItem>, HostError>,
	},
	Thumbnail {
		target: Target,
		image: Result<LibraryImage, HostError>,
	},
	Excerpt {
		target: Target,
		document: Result<LibraryDocument, HostError>,
	},
	Image {
		target: Target,
		image: Result<LibraryImage, HostError>,
	},
	Opened {
		target: Target,
		state: Result<LibraryDocumentState, HostError>,
	},
	Applied {
		target: Target,
		outcome: Result<(), HostError>,
	},
	Created {
		space_id: String,
		item: Result<LibraryItem, HostError>,
	},
	Renamed {
		target: Target,
		item: Result<LibraryItem, HostError>,
	},
	Deleted {
		target: Target,
		outcome: Result<(), HostError>,
	},
	Imported {
		space_id: String,
		paths: Vec<PathBuf>,
		imports: Result<Vec<LibraryImport>, HostError>,
	},
	Shared(Result<(), HostError>),
	Stopped(Result<CancelOutcome, HostError>),
	Downloaded(Result<Option<String>, HostError>),
	Copied {
		target: Target,
		outcome: Result<(), HostError>,
	},
	Revealed(Result<(), HostError>),
	GalleryImported {
		target: Target,
		add: GalleryAdd,
		path: PathBuf,
		imports: Result<Vec<LibraryImport>, HostError>,
	},
	BoardCreated {
		space_id: String,
		item: Result<LibraryItem, HostError>,
	},
	Due(Due),
}

pub fn refusal_of(failure: &HostError) -> Option<LibraryError> {
	match failure {
		HostError::CommandFailed { body, .. } => serde_json::from_str(body).ok(),
		_ => None,
	}
}

pub fn free_name(base: &str, copy: usize, extension: &str) -> String {
	match copy {
		1 => format!("{base}{extension}"),
		_ => format!("{base} {copy}{extension}"),
	}
}

fn located(target: &Target) -> serde_json::Value {
	json!({ "spaceId": target.space_id, "name": target.name })
}

fn freely_named(
	title: &str,
	untitled: &str,
	create: impl Fn(usize, &str) -> Result<LibraryItem, HostError>,
) -> Result<LibraryItem, HostError> {
	let trimmed = title.trim();
	let mut base = if trimmed.is_empty() { untitled } else { trimmed };
	let mut copy = 1;
	loop {
		let failure = match create(copy, base) {
			Ok(item) => return Ok(item),
			Err(failure) => failure,
		};
		match refusal_of(&failure) {
			Some(LibraryError::AlreadyExists { .. }) => copy += 1,
			Some(LibraryError::InvalidName { .. }) if base != untitled => {
				base = untitled;
				copy = 1;
			}
			_ => return Err(failure),
		}
	}
}

fn created_named(source: &Source, new: &NewDocument) -> Result<LibraryItem, HostError> {
	freely_named(&new.title, &new.untitled, |copy, base| {
		let name = free_name(base, copy, DOCUMENT_EXTENSION);
		let arguments = json!({ "spaceId": new.space_id, "name": name, "templateId": null });
		source.invoke("library_create_document", arguments)
	})
}

fn board_created(
	source: &Source,
	space_id: &str,
	untitled: &str,
) -> Result<LibraryItem, HostError> {
	freely_named(untitled, untitled, |copy, base| {
		let name = free_name(base, copy, BOARD_EXTENSION_ADDED_BY_HOST);
		source.invoke("library_create_board", json!({ "spaceId": space_id, "name": name }))
	})
}

fn seeded(source: &Source, target: &Target, body: &str) -> Result<(), HostError> {
	let state: LibraryDocumentState = source.invoke("library_open_document", located(target))?;
	let mut session = Session::opened(&state.update).map_err(|cause| HostError::Unreadable {
		command: "library_open_document".to_owned(),
		cause,
	})?;
	let Some(update) = session.edited(body) else { return Ok(()) };
	let arguments = json!({ "spaceId": target.space_id, "name": target.name, "update": update });
	source.invoke("library_apply_update", arguments)
}

fn created(source: &Source, new: &NewDocument) -> Result<LibraryItem, HostError> {
	let item = created_named(source, new)?;
	if !new.body.is_empty() {
		let target = Target { space_id: new.space_id.clone(), name: item.name.clone() };
		seeded(source, &target, &new.body)?;
	}
	Ok(item)
}

fn answered(source: &Source, call: Call) -> Answer {
	match call {
		Call::List { space_id } => {
			let items = source.invoke("library_list", json!({ "spaceId": space_id }));
			Answer::Listed { space_id, items }
		}
		Call::Thumbnail(target) => {
			let image = source.invoke("library_read_thumbnail", located(&target));
			Answer::Thumbnail { target, image }
		}
		Call::Excerpt(target) => {
			let document = source.invoke("library_read_document", located(&target));
			Answer::Excerpt { target, document }
		}
		Call::Image(target) => {
			let image = source.invoke("library_read_image", located(&target));
			Answer::Image { target, image }
		}
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
		Call::Create(new) => {
			let item = created(source, &new);
			Answer::Created { space_id: new.space_id, item }
		}
		Call::Rename { target, new_name } => {
			let arguments =
				json!({ "spaceId": target.space_id, "name": target.name, "newName": new_name });
			let item = source.invoke("library_rename_document", arguments);
			Answer::Renamed { target, item }
		}
		Call::Delete(target) => {
			let outcome = source.invoke("library_delete", located(&target));
			Answer::Deleted { target, outcome }
		}
		Call::Import { space_id, paths } => {
			let arguments = json!({ "spaceId": space_id, "paths": paths });
			let imports = source.invoke("library_import_paths", arguments);
			Answer::Imported { space_id, paths, imports }
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
		Call::Download(target) => {
			Answer::Downloaded(source.invoke("library_save", located(&target)))
		}
		Call::Copy(target) => {
			let outcome = source.invoke("library_copy", located(&target));
			Answer::Copied { target, outcome }
		}
		Call::GalleryImport { target, add, path } => {
			let arguments = json!({ "spaceId": target.space_id, "paths": [path] });
			let imports = source.invoke("library_import_paths", arguments);
			Answer::GalleryImported { target, add, path, imports }
		}
		Call::Reveal(target) => Answer::Revealed(source.invoke("library_reveal", located(&target))),
		Call::CreateBoard { space_id, untitled } => {
			let item = board_created(source, &space_id, &untitled);
			Answer::BoardCreated { space_id, item }
		}
		Call::Wake(_, due) => Answer::Due(due),
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

fn woken(reply: Reply, after: Duration, due: Due) {
	let spawned = thread::Builder::new().name("library-wake".into()).spawn(move || {
		thread::sleep(after);
		reply.deliver(Answer::Due(due));
	});
	if let Err(failure) = spawned {
		eprintln!("a library wake did not schedule: {failure}");
	}
}

fn served(source: &Source, calls: &Receiver<Call>, reply: &Reply) {
	for call in calls {
		if let Call::Wake(after, due) = call {
			woken(reply.clone(), after, due);
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
			.name("library-calls".into())
			.spawn(move || served(&source, &waiting, &reply));
		match spawned {
			Ok(_) => Some(Worker { calls, answers }),
			Err(failure) => {
				eprintln!("the library calls did not start: {failure}");
				None
			}
		}
	}

	pub fn send(&self, call: Call) {
		if let Err(unsent) = self.calls.send(call) {
			eprintln!("a library call was not sent, the library calls stopped: {:?}", unsent.0);
		}
	}

	pub fn answers(&self) -> Vec<Answer> {
		self.answers.try_iter().collect()
	}
}
