use tauri::{AppHandle, Runtime};

use super::{party_id, Commented};
use crate::db::repositories::conversations::ChatOwner;
use crate::db::repositories::library::ThreadOfItem;
use crate::events;
use crate::hosting::authorship;
use crate::library::contract::{
	LibraryComment, LibraryCommentMentionOpened, LibraryCommentMentioned, LibraryCommentParty,
	LibraryCommentPartyKind, LibraryCommentThread, LibraryItemKind, COMMENT_HOST_AUTHOR_ID,
};
use crate::notifications::{self, Clicked, Notice};
use crate::routines::runner::{database, detail_of};

pub(crate) struct PersonHere {
	pub(crate) person_id: String,
	pub(crate) space_id: String,
}

pub(super) fn told<R: Runtime>(
	app: &AppHandle<R>,
	commented: &Commented,
	thread: &LibraryCommentThread,
	comment: LibraryComment,
) {
	let people = people_mentioned(app, &comment);
	if people.is_empty() {
		return;
	}
	let mention = Mention {
		thread: ThreadOfItem {
			space_id: thread.space_id.clone(),
			item_name: thread.item_name.clone(),
			id: thread.id.clone(),
		},
		item_kind: commented.kind(),
		comment,
		people,
	};
	tauri::async_runtime::spawn(announced(app.clone(), mention));
}

struct Mention {
	thread: ThreadOfItem,
	item_kind: LibraryItemKind,
	comment: LibraryComment,
	people: Vec<String>,
}

async fn announced<R: Runtime>(app: AppHandle<R>, mention: Mention) {
	let Mention { thread, item_kind, comment, people } = mention;
	let author_name = match author_name(&app, &thread.space_id, &comment.author).await {
		Ok(author_name) => author_name,
		Err(reason) => {
			return log::warn!(
				"the mention in comment thread {} of space {} notified nobody: {reason}",
				thread.id,
				thread.space_id
			);
		}
	};
	let mentioned = LibraryCommentMentioned {
		space_id: thread.space_id.clone(),
		item_name: thread.item_name,
		item_kind,
		thread_id: thread.id.clone(),
		author_name,
		text: comment.text,
		people,
	};
	let host = PersonHere {
		person_id: COMMENT_HOST_AUTHOR_ID.to_owned(),
		space_id: thread.space_id.clone(),
	};
	raised_for(&app, &host, mentioned.clone());
	if let Err(error) = events::emit(&app, events::LIBRARY_COMMENT_MENTIONED, mentioned) {
		log::warn!(
			"the mention in comment thread {} of space {} did not reach the windows: {error}",
			thread.id,
			thread.space_id
		);
	}
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
	space_id: &str,
	author: &LibraryCommentParty,
) -> Result<String, String> {
	let unnamed = || "its author has no name to show".to_owned();
	if author.kind != LibraryCommentPartyKind::Person {
		return Err(unnamed());
	}
	let database = database(app)
		.map_err(|error| format!("the database is not ready: {}", detail_of(&error)))?;
	authorship::name_of(app, database, space_id, &person(app, &author.id))
		.await
		.map_err(|failure| format!("the name of its author was not read: {failure:?}"))?
		.ok_or_else(unnamed)
}
