use std::collections::VecDeque;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use uuid::Uuid;

use super::blocks::{blocks_of, preview, Block, BlockKind};
use super::contract::{
	LibraryBoardPoint, LibraryComment, LibraryCommentAnchor as Anchor, LibraryCommentParty,
	LibraryCommentPartyKind, LibraryCommentThread, LibraryCommentThreadChanged,
	LibraryCommentThreadState, LibraryError, LibraryItemKind, COMMENT_HOST_AUTHOR_ID,
};
use super::{document_text, documents, resolve, AcceptedType};
use crate::agent::translate::now_ms;
use crate::board::{holds_node, node_position, Board};
use crate::db::repositories::conversations::ChatOwner;
use crate::db::repositories::library::{NewThread, Resolution, StoredThread, ThreadOfItem};
use crate::db::{Database, DatabaseState};
use crate::events;
use crate::hosting::authorship::Caller;

pub(crate) use turns::{comment_agent_turns, fail_comment_turns_cut_by_a_quit};
#[cfg(test)]
pub(crate) use turns::{CommentTurn, CommentTurns};

mod turns;

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
		Ok(Said { author: person_calling(caller, app)?, text, mentions })
	}

	pub(crate) fn by_the_agent(id: String, text: String) -> Self {
		let author = LibraryCommentParty { kind: LibraryCommentPartyKind::Agent, id };
		Said { author, text, mentions: Vec::new() }
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

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BriefedThread {
	item_name: String,
	item_kind: LibraryItemKind,
	thread_id: String,
	state: LibraryCommentThreadState,
	target: Anchor,
	target_text: Option<String>,
	target_missing: bool,
	comments: Vec<LibraryComment>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListedThread {
	thread_id: String,
	state: LibraryCommentThreadState,
	target: Anchor,
	target_missing: bool,
	comments: usize,
	opening: String,
}

impl ListedThread {
	fn of(thread: LibraryCommentThread) -> Self {
		let opening =
			thread.comments.first().map(|comment| preview(BlockKind::Paragraph, &comment.text));
		ListedThread {
			thread_id: thread.id,
			state: thread.state,
			target: thread.anchor,
			target_missing: thread.target_missing,
			comments: thread.comments.len(),
			opening: opening.unwrap_or_default(),
		}
	}
}

pub(crate) fn person_calling<R: Runtime>(
	caller: &Caller,
	app: &AppHandle<R>,
) -> Result<LibraryCommentParty, LibraryError> {
	let id = match caller.chat_owner(app).ok_or(LibraryError::UnknownAuthor)? {
		ChatOwner::Host => COMMENT_HOST_AUTHOR_ID.to_owned(),
		ChatOwner::Member(account_id) => account_id,
	};
	Ok(LibraryCommentParty { kind: LibraryCommentPartyKind::Person, id })
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

	fn kind(&self) -> LibraryItemKind {
		match self {
			Commented::Document { .. } => LibraryItemKind::Document,
			Commented::Image => LibraryItemKind::Image,
			Commented::Board(_) => LibraryItemKind::Board,
		}
	}

	fn target_text(&self, anchor: &Anchor) -> Option<String> {
		let Commented::Document { text, blocks } = self else {
			return None;
		};
		let (Anchor::Block { block_id } | Anchor::Passage { block_id, .. }) = anchor else {
			return None;
		};
		block_of(blocks, block_id).map(|block| text[block.content.clone()].to_owned())
	}

	fn briefed(&self, thread: LibraryCommentThread) -> BriefedThread {
		BriefedThread {
			item_name: thread.item_name,
			item_kind: self.kind(),
			thread_id: thread.id,
			state: thread.state,
			target_text: self.target_text(&thread.anchor),
			target: thread.anchor,
			target_missing: thread.target_missing,
			comments: thread.comments,
		}
	}

	fn board_point(&self, anchor: &Anchor) -> Option<LibraryBoardPoint> {
		let (Commented::Board(board), Anchor::BoardNode { node_id }) = (self, anchor) else {
			return None;
		};
		node_point(board, node_id)
	}

	fn as_it_stands(&self, thread: StoredThread) -> LibraryCommentThread {
		let (resolved_by, resolved_at) =
			thread.resolution.map(|resolution| (resolution.by, resolution.at)).unzip();
		LibraryCommentThread {
			target_missing: self.missing_target(&thread.anchor).is_some(),
			id: thread.id,
			space_id: thread.space_id,
			item_name: thread.item_name,
			anchor: thread.anchor,
			state: thread.state,
			comments: thread.comments,
			resolved_by,
			resolved_at,
			last_board_point: thread.last_board_point,
		}
	}
}

fn node_point(board: &Board, node_id: &str) -> Option<LibraryBoardPoint> {
	node_position(board, node_id).map(|(x, y)| LibraryBoardPoint { x, y })
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

pub(crate) async fn listed_comment_threads<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	space_id: &str,
	name: &str,
) -> Result<Vec<ListedThread>, LibraryError> {
	let threads = comment_threads(app, database, root, space_id, name).await?;
	Ok(threads.into_iter().map(ListedThread::of).collect())
}

pub(crate) async fn briefed_comment_thread<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	thread: ThreadOfItem,
) -> Result<BriefedThread, LibraryError> {
	let commented = Commented::read(app, root, &thread.space_id, &thread.item_name)?;
	let threads = database.library().threads(thread.space_id, thread.item_name).await?;
	let held = threads.into_iter().find(|held| held.id == thread.id);
	let held = held.ok_or(LibraryError::UnknownThread { id: thread.id })?;
	Ok(commented.briefed(commented.as_it_stands(held)))
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
	let summoned = turns::mentioned_agents(database, space_id, &said.mentions).await?;
	let thread = NewThread {
		id: Uuid::new_v4().to_string(),
		space_id: space_id.to_owned(),
		item_name: name.to_owned(),
		last_board_point: commented.board_point(&anchor),
		anchor,
		opening: said.comment()?,
	};
	let opened = database.library().open_thread(thread).await?;
	let opened = announced(app, commented.as_it_stands(opened));
	turns::summon(app, &commented, &opened, summoned);
	Ok(opened)
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
	let summoned = turns::mentioned_agents(database, &thread.space_id, &said.mentions).await?;
	let replied = database.library().reply(thread, said.comment()?).await?.ok_or(unknown)?;
	let replied = announced(app, commented.as_it_stands(replied));
	turns::summon(app, &commented, &replied, summoned);
	Ok(replied)
}

pub(crate) async fn resolve_comment_thread<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	thread: ThreadOfItem,
	by: LibraryCommentParty,
) -> Result<LibraryCommentThread, LibraryError> {
	let commented = Commented::read(app, root, &thread.space_id, &thread.item_name)?;
	let unknown = LibraryError::UnknownThread { id: thread.id.clone() };
	let resolution = Resolution { by, at: now_ms() };
	let resolved = database.library().resolve(thread, resolution).await?.ok_or(unknown)?;
	Ok(announced(app, commented.as_it_stands(resolved)))
}

pub(crate) async fn reopen_comment_thread<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	root: &Path,
	thread: ThreadOfItem,
) -> Result<LibraryCommentThread, LibraryError> {
	let commented = Commented::read(app, root, &thread.space_id, &thread.item_name)?;
	let unknown = LibraryError::UnknownThread { id: thread.id.clone() };
	let reopened = database.library().reopen(thread).await?.ok_or(unknown)?;
	Ok(announced(app, commented.as_it_stands(reopened)))
}

struct WrittenBoard {
	space_id: String,
	name: String,
	board: Board,
}

#[derive(Default)]
pub(crate) struct WrittenBoards {
	unfollowed: Mutex<VecDeque<WrittenBoard>>,
	turn: tokio::sync::Mutex<()>,
}

impl WrittenBoards {
	fn unfollowed(&self) -> MutexGuard<'_, VecDeque<WrittenBoard>> {
		self.unfollowed.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

fn written_boards<R: Runtime>(app: &AppHandle<R>) -> State<'_, WrittenBoards> {
	if app.try_state::<WrittenBoards>().is_none() {
		app.manage(WrittenBoards::default());
	}
	app.state::<WrittenBoards>()
}

pub(crate) fn board_written<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	board: &Board,
) {
	written_boards(app).unfollowed().push_back(WrittenBoard {
		space_id: space_id.to_owned(),
		name: name.to_owned(),
		board: board.clone(),
	});
	let app = app.clone();
	tauri::async_runtime::spawn(async move { written_boards_followed(&app).await });
}

pub(crate) async fn written_boards_followed<R: Runtime>(app: &AppHandle<R>) {
	let written = written_boards(app);
	let _turn = written.turn.lock().await;
	loop {
		let next = written.unfollowed().pop_front();
		let Some(WrittenBoard { space_id, name, board }) = next else {
			return;
		};
		if let Err(error) = board_nodes_followed(app, &space_id, &name, board).await {
			log::warn!(
				"the comment threads of board {name} of space {space_id} did not follow its write: {error:?}"
			);
		}
	}
}

async fn board_nodes_followed<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	board: Board,
) -> Result<(), LibraryError> {
	let Some(state) = app.try_state::<DatabaseState>() else {
		return Ok(());
	};
	let database =
		state.as_ref().map_err(|failure| LibraryError::Unavailable { failure: failure.into() })?;
	let point_of = move |node_id: &str| node_point(&board, node_id);
	Ok(database
		.library()
		.follow_board_nodes(space_id.to_owned(), name.to_owned(), point_of)
		.await?)
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
