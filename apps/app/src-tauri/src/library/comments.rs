use std::path::Path;

use tauri::{AppHandle, Runtime};
use uuid::Uuid;

use super::blocks::{blocks_of, Block};
use super::contract::{
	LibraryComment, LibraryCommentAnchor as Anchor, LibraryCommentParty, LibraryCommentPartyKind,
	LibraryCommentThread, LibraryCommentThreadChanged, LibraryCommentThreadState, LibraryError,
	COMMENT_HOST_AUTHOR_ID,
};
use super::{document_text, documents, resolve, AcceptedType};
use crate::agent::translate::now_ms;
use crate::board::{holds_node, Board};
use crate::db::repositories::conversations::ChatOwner;
use crate::db::repositories::library::{NewThread, StoredThread, ThreadOfItem};
use crate::db::Database;
use crate::events;
use crate::hosting::authorship::Caller;

pub(crate) struct Said {
	pub(crate) author: LibraryCommentParty,
	pub(crate) text: String,
	pub(crate) mentions: Vec<LibraryCommentParty>,
}

impl Said {
	pub(crate) fn by_the_person_calling<R: Runtime>(
		caller: &Caller,
		app: &AppHandle<R>,
		text: String,
		mentions: Vec<LibraryCommentParty>,
	) -> Result<Self, LibraryError> {
		let id = match caller.chat_owner(app).ok_or(LibraryError::UnknownAuthor)? {
			ChatOwner::Host => COMMENT_HOST_AUTHOR_ID.to_owned(),
			ChatOwner::Member(account_id) => account_id,
		};
		let author = LibraryCommentParty { kind: LibraryCommentPartyKind::Person, id };
		Ok(Said { author, text, mentions })
	}

	fn comment(self) -> Result<LibraryComment, LibraryError> {
		if self.text.trim().is_empty() {
			return Err(LibraryError::BlankComment);
		}
		Ok(LibraryComment {
			author: self.author,
			created_at: now_ms(),
			text: self.text,
			mentions: self.mentions,
		})
	}
}

enum Commented {
	Document { text: String, blocks: Vec<Block> },
	Image,
	Board(Board),
}

impl Commented {
	fn read<R: Runtime>(
		app: &AppHandle<R>,
		root: &Path,
		space_id: &str,
		name: &str,
	) -> Result<Self, LibraryError> {
		let item = resolve(root, space_id, name)?;
		match item.accepted {
			AcceptedType::Document(_) => {
				let text = document_text(&item, name)?;
				let blocks = blocks_of(&text);
				Ok(Commented::Document { text, blocks })
			}
			AcceptedType::Image { .. } => Ok(Commented::Image),
			AcceptedType::Board => {
				Ok(Commented::Board(documents(app).board(root, space_id, name)?))
			}
		}
	}

	fn accepts(&self, name: &str, anchor: &Anchor) -> Result<(), LibraryError> {
		let name = name.to_owned();
		match (anchor, self) {
			(Anchor::Block { .. } | Anchor::Passage { .. }, Commented::Document { .. })
			| (Anchor::ImagePoint { .. } | Anchor::ImageZone { .. }, Commented::Image)
			| (Anchor::BoardNode { .. } | Anchor::BoardPoint { .. }, Commented::Board(_)) => {}
			(Anchor::Block { .. } | Anchor::Passage { .. }, _) => {
				return Err(LibraryError::NotADocument { name });
			}
			(Anchor::ImagePoint { .. } | Anchor::ImageZone { .. }, _) => {
				return Err(LibraryError::NotAnImage { name });
			}
			(Anchor::BoardNode { .. } | Anchor::BoardPoint { .. }, _) => {
				return Err(LibraryError::NotABoard { name });
			}
		}
		if !is_well_formed(anchor) {
			return Err(LibraryError::InvalidAnchor { name });
		}
		if let Some(target) = self.missing_target(anchor) {
			return Err(LibraryError::MissingTarget { name, target: target.to_owned() });
		}
		Ok(())
	}

	fn missing_target<'a>(&self, anchor: &'a Anchor) -> Option<&'a str> {
		let (target, is_held) = match (self, anchor) {
			(Commented::Document { blocks, .. }, Anchor::Block { block_id }) => {
				(block_id, block_of(blocks, block_id).is_some())
			}
			(Commented::Document { text, blocks }, Anchor::Passage { block_id, quote, .. }) => {
				let holds_the_quote = block_of(blocks, block_id)
					.is_some_and(|block| text[block.content.clone()].contains(quote.as_str()));
				(block_id, holds_the_quote)
			}
			(Commented::Board(board), Anchor::BoardNode { node_id }) => {
				(node_id, holds_node(board, node_id))
			}
			_ => return None,
		};
		(!is_held).then_some(target.as_str())
	}

	fn as_it_stands(&self, thread: StoredThread) -> LibraryCommentThread {
		LibraryCommentThread {
			target_missing: self.missing_target(&thread.anchor).is_some(),
			id: thread.id,
			space_id: thread.space_id,
			item_name: thread.item_name,
			anchor: thread.anchor,
			state: thread.state,
			comments: thread.comments,
		}
	}
}

fn is_well_formed(anchor: &Anchor) -> bool {
	match anchor {
		Anchor::Passage { start, end, .. } => start <= end,
		Anchor::ImagePoint { x, y } => [x, y].into_iter().all(is_a_ratio),
		Anchor::ImageZone { x, y, width, height } => {
			[x, y, width, height].into_iter().all(is_a_ratio)
		}
		Anchor::Block { .. } | Anchor::BoardNode { .. } | Anchor::BoardPoint { .. } => true,
	}
}

fn is_a_ratio(coordinate: &f64) -> bool {
	(0.0..=1.0).contains(coordinate)
}

fn block_of<'a>(blocks: &'a [Block], id: &str) -> Option<&'a Block> {
	blocks.iter().find(|block| block.id.as_deref() == Some(id))
}

pub(crate) async fn comment_threads<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<Vec<LibraryCommentThread>, LibraryError> {
	let commented = Commented::read(app, root, space_id, name)?;
	let threads = database.library().threads(space_id.to_owned(), name.to_owned()).await?;
	Ok(threads.into_iter().map(|thread| commented.as_it_stands(thread)).collect())
}

pub(crate) async fn open_comment_thread<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	space_id: &str,
	name: &str,
	anchor: Anchor,
	said: Said,
) -> Result<LibraryCommentThread, LibraryError> {
	let commented = Commented::read(app, root, space_id, name)?;
	commented.accepts(name, &anchor)?;
	let thread = NewThread {
		id: Uuid::new_v4().to_string(),
		space_id: space_id.to_owned(),
		item_name: name.to_owned(),
		anchor,
		opening: said.comment()?,
	};
	let opened = database.library().open_thread(thread).await?;
	Ok(announced(app, commented.as_it_stands(opened)))
}

pub(crate) async fn reply_to_comment_thread<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	thread: ThreadOfItem,
	said: Said,
) -> Result<LibraryCommentThread, LibraryError> {
	let commented = Commented::read(app, root, &thread.space_id, &thread.item_name)?;
	let unknown = LibraryError::UnknownThread { id: thread.id.clone() };
	let replied = database.library().reply(thread, said.comment()?).await?.ok_or(unknown)?;
	Ok(announced(app, commented.as_it_stands(replied)))
}

pub(crate) async fn set_comment_thread_state<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	thread: ThreadOfItem,
	state: LibraryCommentThreadState,
) -> Result<LibraryCommentThread, LibraryError> {
	let commented = Commented::read(app, root, &thread.space_id, &thread.item_name)?;
	let unknown = LibraryError::UnknownThread { id: thread.id.clone() };
	let settled = database.library().set_state(thread, state).await?.ok_or(unknown)?;
	Ok(announced(app, commented.as_it_stands(settled)))
}

fn announced<R: Runtime>(app: &AppHandle<R>, thread: LibraryCommentThread) -> LibraryCommentThread {
	let changed = LibraryCommentThreadChanged {
		space_id: thread.space_id.clone(),
		item_name: thread.item_name.clone(),
		thread: thread.clone(),
	};
	if let Err(error) = events::emit(app, events::LIBRARY_COMMENT_THREAD_CHANGED, changed) {
		log::warn!(
			"a change of comment thread {} of space {} was not announced: {error}",
			thread.id,
			thread.space_id
		);
	}
	thread
}

#[cfg(test)]
mod tests;
