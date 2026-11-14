use tauri::{AppHandle, Runtime};

use super::{party_id, Commented};
use crate::db::repositories::conversations::ChatOwner;
use crate::db::{Database, DatabaseError};
use crate::events;
use crate::hosting::authorship;
use crate::library::contract::{
	LibraryComment, LibraryCommentMentionOpened, LibraryCommentMentioned, LibraryCommentParty,
	LibraryCommentPartyKind, LibraryCommentThread, COMMENT_HOST_AUTHOR_ID,
};
use crate::notifications::{self, Clicked, Notice};

pub(crate) struct PersonHere {
	pub(crate) person_id: String,
	pub(crate) space_id: String,
}

pub(super) async fn told<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	commented: &Commented,
	thread: &LibraryCommentThread,
	comment: &LibraryComment,
) {
	let people = people_mentioned(app, comment);
	if people.is_empty() {
		return;
	}
	let author_name = match author_name(app, database, &thread.space_id, &comment.author).await {
		Ok(Some(author_name)) => author_name,
		Ok(None) => {
			return log::warn!(
				"the mention in comment thread {} of space {} notified nobody: its author has no name to show",
				thread.id,
				thread.space_id
			);
		}
		Err(failure) => {
			return log::warn!(
				"the mention in comment thread {} of space {} notified nobody: the name of its author was not read: {failure:?}",
				thread.id,
				thread.space_id
			);
		}
	};
	let mentioned = LibraryCommentMentioned {
		space_id: thread.space_id.clone(),
		item_name: thread.item_name.clone(),
		item_kind: commented.kind(),
		thread_id: thread.id.clone(),
		author_name,
		text: comment.text.clone(),
		people,
	};
	if let Err(error) = events::emit(app, events::LIBRARY_COMMENT_MENTIONED, mentioned.clone()) {
		log::warn!(
			"the mention in comment thread {} of space {} did not reach the windows: {error}",
			thread.id,
			thread.space_id
		);
	}
	let host = PersonHere {
		person_id: COMMENT_HOST_AUTHOR_ID.to_owned(),
		space_id: thread.space_id.clone(),
	};
	raised_for(app, &host, mentioned);
}

pub(crate) fn raised_for<R: Runtime>(
	app: &AppHandle<R>,
	here: &PersonHere,
	mentioned: LibraryCommentMentioned,
) {
	if !mentioned.people.contains(&here.person_id) {
		return;
	}
	let title = format!("{} mentioned you in {}", mentioned.author_name, mentioned.item_name);
	let body = first_line(&mentioned.text).to_owned();
	let opened = LibraryCommentMentionOpened {
		space_id: here.space_id.clone(),
		item_name: mentioned.item_name,
		item_kind: mentioned.item_kind,
		thread_id: mentioned.thread_id,
	};
	notifications::raise(app, Notice { title, body, clicked: Clicked::CommentMention(opened) });
}

fn first_line(text: &str) -> &str {
	text.lines().map(str::trim).find(|line| !line.is_empty()).unwrap_or(text)
}

fn people_mentioned<R: Runtime>(app: &AppHandle<R>, comment: &LibraryComment) -> Vec<String> {
	let is_the_author = |person_id: &str| {
		comment.author.kind == LibraryCommentPartyKind::Person && comment.author.id == person_id
	};
	let mut people = Vec::new();
	for mention in &comment.mentions {
		if mention.kind != LibraryCommentPartyKind::Person {
			continue;
		}
		let person_id = party_id(person(app, &mention.id));
		if !is_the_author(&person_id) && !people.contains(&person_id) {
			people.push(person_id);
		}
	}
	people
}

fn person<R: Runtime>(app: &AppHandle<R>, id: &str) -> ChatOwner {
	if id == COMMENT_HOST_AUTHOR_ID {
		return ChatOwner::Host;
	}
	authorship::person_of(app, id)
}

async fn author_name<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	space_id: &str,
	author: &LibraryCommentParty,
) -> Result<Option<String>, DatabaseError> {
	match author.kind {
		LibraryCommentPartyKind::Agent => Ok(None),
		LibraryCommentPartyKind::Person => {
			authorship::name_of(app, database, space_id, &person(app, &author.id)).await
		}
	}
}
