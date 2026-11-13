use std::collections::{BTreeMap, HashMap, HashSet};
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::{watch, OwnedMutexGuard};

use super::blocks::{
	self, backfill, blocks_of, preview, removal, separated, Block, BlockKind, Splice,
};
use super::canvas::board_holds;
use super::contract::{
	LibraryBoardPoint, LibraryDocumentFormat, LibraryDocumentWriterFinished, LibraryError,
	LibraryItem, LibraryItemKind, LibraryPresenceAt, LibraryWriteOutcome,
};
use super::documents::{carets_at, text_of_state, BoardTarget, RemoveStep, WriteStep};
use super::presence::{seat_agent_on_board, seat_writer, unseat_writer, Seat, Seated};
use super::{
	a_document, announce, announce_change, create_board, create_document, delete_item,
	document_text, documents, encoded_content, import_path, item_at, list, overwrite_path,
	read_document, rename_linked_document, resolve, root, space_dir, AcceptedType,
	OverwriteRefusal,
};
use crate::agent::contract::RuntimeScope;
use crate::agent::host::{Host, Refusal};
use crate::board::{
	content_hash, deleted, duplicated, export_canvas, find, framed, info, moved, node_file,
	node_info, tree, under, updated, written, ArrowPatch, Board, BoardEdit, ChangedNode,
	DrawRefusal, DrawnArrow, DrawnNode, ElementChange, Framed, Group, Sought, Touched, WriteMode,
};
use crate::conversations::commands::{post_document, ready};
use crate::conversations::contract::TranscriptStoreError;
use crate::db::repositories::keyset::{self, Keyset};
use crate::{db, events};
use screenshot::{render, Rendered, Scale, ScreenshotBlock, ScreenshotTarget, Shot};

pub mod screenshot;

const WRITE_STEPS: usize = 40;

const BOARD_EXTENSION: &str = ".canvas";

const LIST_LIMIT_DEFAULT: u32 = 50;

const LIST_LIMIT_MAXIMUM: u32 = 200;

const MAX_SHOWN_IMAGE_BYTES: u64 = 5 * 1024 * 1024 / 4 * 3;

const STEP_PAUSE: Duration = Duration::from_millis(40);

const IMAGE_KIND: &str = "image";

const PNG_MIME_TYPE: &str = "image/png";

const NO_STORE: &str = "the store of this session is not open";

const READ_THE_TREE: &str =
	"no block of this document holds this id: call document_tree for the ids it holds";

#[derive(Debug)]
pub struct LibraryHost<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum DocumentRefusal {
	Library(LibraryError),
	Tool(ToolRefusal),
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ToolRefusal {
	#[serde(rename_all = "camelCase")]
	BlockNotFound {
		id: String,
		detail: &'static str,
	},
	NoBlock,
	#[serde(rename_all = "camelCase")]
	FormatMismatch {
		name: String,
		mime_type: String,
		produced_mime_type: String,
	},
	Stopped,
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	LimitOutOfRange {
		limit: i64,
		minimum: i64,
		maximum: i64,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableCursor {
		cursor: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableRequest {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unexpected {
		detail: String,
	},
	InvalidBoardItem(DrawRefusal),
	#[serde(rename_all = "camelCase")]
	NodeNotShown {
		id: String,
		#[serde(flatten)]
		reason: NotShown,
	},
	NothingToShow,
	#[serde(rename_all = "camelCase")]
	RenderTimedOut {
		seconds: u64,
	},
	#[serde(rename_all = "camelCase")]
	RenderFailed {
		detail: String,
	},
}

#[derive(Debug, Serialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum NotShown {
	UnknownNode,
	#[serde(rename_all = "camelCase")]
	NotAnImage {
		node_kind: String,
	},
	NoFile,
	#[serde(rename_all = "camelCase")]
	NotAnImageFile {
		file: String,
	},
	#[serde(rename_all = "camelCase")]
	MissingFile {
		file: String,
	},
	#[serde(rename_all = "camelCase")]
	OutsideLibrary {
		file: String,
	},
	#[serde(rename_all = "camelCase")]
	TooLarge {
		bytes: u64,
		limit: u64,
	},
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	List,
	Search,
	Read,
	Create,
	Import,
	Rename,
	Delete,
	PostDocument,
	DocumentInfo,
	DocumentTree,
	DocumentReadBlock,
	DocumentInsertAfter,
	DocumentReplaceBlock,
	DocumentDeleteBlock,
	DocumentFind,
	BoardCreate,
	BoardInfo,
	BoardTree,
	BoardNodeInfo,
	BoardCanvas,
	BoardWrite,
	BoardUpdate,
	BoardMove,
	BoardDuplicate,
	BoardDelete,
	BoardFind,
	BoardView,
	Screenshot,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listed {
	kind: Option<LibraryItemKind>,
	limit: Option<i64>,
	cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Searched {
	query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Named {
	name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Created {
	name: String,
	template: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Imported {
	path: PathBuf,
	overwrite: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Renamed {
	name: String,
	new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardViewed {
	name: String,
	id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Screenshotted {
	name: String,
	id: Option<String>,
	#[serde(default)]
	scale: Scale,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardTreed {
	name: String,
	parent: Option<String>,
	depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardElements {
	name: String,
	#[serde(default)]
	nodes: Vec<String>,
	#[serde(default)]
	arrows: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardParented {
	name: String,
	parent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardWritten {
	name: String,
	parent: Option<String>,
	mode: WriteMode,
	#[serde(default)]
	nodes: Vec<DrawnNode>,
	#[serde(default)]
	arrows: Vec<DrawnArrow>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardPatched {
	name: String,
	#[serde(default)]
	nodes: Vec<ChangedNode>,
	#[serde(default)]
	arrows: Vec<ArrowPatch>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardMoved {
	name: String,
	nodes: Vec<String>,
	parent: Option<String>,
	x: i64,
	y: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardDuplicated {
	name: String,
	nodes: Vec<String>,
	x: Option<i64>,
	y: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoardSought {
	name: String,
	text: Option<String>,
	kind: Option<String>,
	color: Option<String>,
	fill: Option<String>,
	shape: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlockNamed {
	name: String,
	id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlocksInserted {
	name: String,
	after: Option<String>,
	markdown: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlockReplaced {
	name: String,
	id: String,
	markdown: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlocksDeleted {
	name: String,
	ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlocksSought {
	name: String,
	text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
	name: String,
	kind: LibraryItemKind,
	updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntriesListed {
	items: Vec<Entry>,
	cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntriesFound {
	items: Vec<Entry>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "form", rename_all = "camelCase")]
enum ItemRead {
	#[serde(rename_all = "camelCase")]
	Text { name: String, kind: LibraryItemKind, text: String },
	#[serde(rename_all = "camelCase")]
	Image { name: String, mime_type: String, content: String },
	#[serde(rename_all = "camelCase")]
	Described { name: String, kind: LibraryItemKind, mime_type: String, bytes: u64 },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Deleted {
	name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentPosted {
	name: String,
	conversation_id: String,
	message_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BoardHeader {
	name: String,
	updated_at: i64,
	hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Headed<T> {
	header: BoardHeader,
	#[serde(flatten)]
	answer: T,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Screenshot<H> {
	header: H,
	rendered: Rendered,
	#[serde(flatten)]
	image: ItemRead,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CanvasShown {
	canvas: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KeysLanded {
	ids: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ElementsTouched {
	nodes: Vec<String>,
	arrows: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NodesFound {
	nodes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopiesMade {
	nodes: BTreeMap<String, String>,
	arrows: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentInfo {
	name: String,
	updated_at: i64,
	blocks: usize,
	first_heading: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentTree {
	name: String,
	blocks: Vec<TreeBlock>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeBlock {
	id: String,
	kind: BlockKind,
	#[serde(skip_serializing_if = "Option::is_none")]
	level: Option<u8>,
	text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlockRead {
	name: String,
	id: String,
	kind: BlockKind,
	markdown: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlocksWritten {
	name: String,
	ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlocksFound {
	name: String,
	matches: Vec<BlockFound>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlockFound {
	id: String,
	kind: BlockKind,
	line: String,
}

struct Identified {
	id: String,
	block: Block,
}

struct Outline {
	state: Vec<u8>,
	text: String,
	blocks: Vec<Identified>,
}

struct Planned {
	splices: Vec<Splice>,
	ids: Vec<String>,
}

struct Agent {
	id: String,
	name: String,
}

impl<R: Runtime> LibraryHost<R> {
	pub fn new(app: AppHandle<R>, scope: RuntimeScope) -> Self {
		Self { app, scope }
	}

	fn changed(&self, space_id: &str, item: LibraryItem) -> Entry {
		announce_change(&self.app, space_id);
		Entry::of(item)
	}

	async fn space(&self, database: &db::Database) -> Result<String, DocumentRefusal> {
		database.conversations().space(self.scope.conversation_id.clone()).await?.ok_or_else(|| {
			DocumentRefusal::Tool(ToolRefusal::ConversationWithoutSpace {
				conversation_id: self.scope.conversation_id.clone(),
			})
		})
	}

	async fn agent(&self, database: &db::Database) -> Result<Agent, DocumentRefusal> {
		let bot = database
			.conversations()
			.bot(self.scope.bot_id.clone())
			.await
			.map_err(|error| DocumentRefusal::unexpected(format!("{error:?}")))?
			.ok_or_else(|| {
				DocumentRefusal::unexpected(format!("the agent {} is gone", self.scope.bot_id))
			})?;
		Ok(Agent { id: bot.id, name: bot.name })
	}

	async fn posted(
		&self,
		database: &db::Database,
		name: String,
	) -> Result<DocumentPosted, DocumentRefusal> {
		let message_id = post_document(
			&self.app,
			database,
			&self.scope.conversation_id,
			&self.scope.bot_id,
			&name,
		)
		.await
		.map_err(|error| match error {
			TranscriptStoreError::DocumentRefused { failure, .. } => {
				DocumentRefusal::Library(*failure)
			}
			unexpected => DocumentRefusal::unexpected(format!("{unexpected:?}")),
		})?;
		Ok(DocumentPosted { name, conversation_id: self.scope.conversation_id.clone(), message_id })
	}

	async fn board_edited<T>(
		&self,
		database: &db::Database,
		root: &Path,
		space_id: &str,
		name: &str,
		edit: impl FnOnce(&Board) -> Result<(BoardEdit, Option<Touched>, T), DrawRefusal>,
	) -> Result<Headed<T>, DocumentRefusal> {
		let agent = self.agent(database).await?;
		let mut writing = BoardWriting::of(&self.app, space_id, name, &agent);
		let target = BoardTarget { root, space_id, name, writer: client_id_of(&agent.id) };
		let ((touched, made), edited) = documents(&self.app).edit_board(
			&target,
			|board| {
				let (edit, touched, made) = edit(board)?;
				Ok::<_, DocumentRefusal>((edit, (touched, made)))
			},
			|applied| announce(&self.app, space_id, &applied.name, &applied.change),
		)?;
		if let Some(touched) = &touched {
			writing.at(touched);
		}
		writing.writing.outcome = LibraryWriteOutcome::Finished;
		Ok(Headed { header: board_header(root, space_id, name, &edited)?, answer: made })
	}

	fn board_answered<T>(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		read: impl FnOnce(&Board) -> Result<T, DocumentRefusal>,
	) -> Result<Headed<T>, DocumentRefusal> {
		let board = documents(&self.app).board(root, space_id, name)?;
		let answer = read(&board)?;
		Ok(Headed { header: board_header(root, space_id, name, &board)?, answer })
	}

	fn opened(&self, root: &Path, space_id: &str, name: &str) -> Result<Outline, LibraryError> {
		let opened = documents(&self.app).open(root, space_id, name)?;
		if let Some(host_edit) = opened.host_edit {
			announce(&self.app, space_id, name, &host_edit);
		}
		Outline::of(opened.state, name)
	}

	fn outline(
		&self,
		root: &Path,
		space_id: &str,
		name: &str,
		agent: &Agent,
		wanted: &[&str],
	) -> Result<Outline, DocumentRefusal> {
		let outline = self.opened(root, space_id, name)?;
		for id in wanted {
			outline.index_of(id)?;
		}
		if backfill(&outline.text).is_empty() {
			return Ok(outline);
		}
		let writer = client_id_of(&agent.id);
		let applied = documents(&self.app).spliced(root, space_id, name, writer, backfill)?;
		announce(&self.app, space_id, &applied.name, &applied.change);
		Ok(self.opened(root, space_id, name)?)
	}

	async fn blocks_read<T>(
		&self,
		database: &db::Database,
		root: &Path,
		space_id: &str,
		name: &str,
		wanted: &[&str],
		answer: impl FnOnce(&Outline) -> Result<T, DocumentRefusal>,
	) -> Result<T, DocumentRefusal> {
		markdown(root, space_id, name)?;
		let agent = self.agent(database).await?;
		let _turn = turn_of(&self.app, space_id, name, &self.scope).await;
		answer(&self.outline(root, space_id, name, &agent, wanted)?)
	}

	async fn blocks_written(
		&self,
		database: &db::Database,
		root: &Path,
		space_id: &str,
		name: &str,
		wanted: &[&str],
		plan: impl FnOnce(&Outline) -> Result<Planned, DocumentRefusal>,
	) -> Result<BlocksWritten, DocumentRefusal> {
		markdown(root, space_id, name)?;
		let agent = self.agent(database).await?;
		let turn = turn_of(&self.app, space_id, name, &self.scope).await;
		if turn.is_stopped() {
			drop(Writing::of(&self.app, space_id, name, &agent));
			return Err(ToolRefusal::Stopped.into());
		}
		let outline = self.outline(root, space_id, name, &agent, wanted)?;
		let planned = plan(&outline)?;
		let offsets: Vec<usize> = planned
			.splices
			.iter()
			.flat_map(|splice| [splice.range.start, splice.range.end])
			.collect();
		let carets = carets_at(&outline.state, name, &offsets)?;
		let mut writing = Writing::of(&self.app, space_id, name, &agent);
		let writer = client_id_of(&agent.id);
		let mut landed = name.to_owned();
		for (splice, [start, end]) in planned.splices.iter().zip(carets.as_chunks::<2>().0) {
			let mut caret = start.clone();
			writing.at(&caret);
			for (index, text) in steps(&splice.text).into_iter().enumerate() {
				if index > 0 {
					tokio::time::sleep(STEP_PAUSE).await;
				}
				if turn.is_stopped() {
					return Err(ToolRefusal::Stopped.into());
				}
				let step = WriteStep { writer, caret: &caret, text };
				let written = documents(&self.app).write(root, space_id, name, &step)?;
				announce(&self.app, space_id, &written.name, &written.change);
				(landed, caret) = (written.name, written.caret);
				writing.at(&caret);
			}
			if splice.range.is_empty() {
				continue;
			}
			if turn.is_stopped() {
				return Err(ToolRefusal::Stopped.into());
			}
			let step = RemoveStep { writer, start: &caret, end };
			let removed = documents(&self.app).remove(root, space_id, name, &step)?;
			announce(&self.app, space_id, &removed.name, &removed.change);
			(landed, caret) = (removed.name, removed.caret);
			writing.at(&caret);
		}
		writing.outcome = LibraryWriteOutcome::Finished;
		Ok(BlocksWritten { name: landed, ids: planned.ids })
	}

	async fn board_shot(
		&self,
		root: &Path,
		space_id: &str,
		asked: Screenshotted,
	) -> Result<Screenshot<BoardHeader>, DocumentRefusal> {
		let board = documents(&self.app).board(root, space_id, &asked.name)?;
		let Framed { part, frame } = framed(&board, asked.id.as_deref())?;
		let frame = frame.ok_or(ToolRefusal::NothingToShow)?;
		let canvas =
			export_canvas(&part).map_err(|error| DocumentRefusal::unexpected(error.to_string()))?;
		let header = board_header(root, space_id, &asked.name, &board)?;
		let target = ScreenshotTarget::board(asked.name.clone(), canvas, frame, asked.scale);
		let shot = render(&self.app, space_id, asked.scale, target).await?;
		Ok(Screenshot::of(header, asked.name, shot))
	}

	async fn document_shot(
		&self,
		database: &db::Database,
		root: &Path,
		space_id: &str,
		asked: Screenshotted,
	) -> Result<Screenshot<DocumentInfo>, DocumentRefusal> {
		let wanted: Vec<&str> = asked.id.iter().map(String::as_str).collect();
		let read = self.blocks_read(database, root, space_id, &asked.name, &wanted, |outline| {
			let header = document_info(root, space_id, &asked.name, outline)?;
			Ok((header, outline.shown(asked.id.as_deref())))
		});
		let (header, blocks) = read.await?;
		if blocks.is_empty() {
			return Err(ToolRefusal::NothingToShow.into());
		}
		let target = ScreenshotTarget::Document { name: asked.name.clone(), blocks };
		let shot = render(&self.app, space_id, asked.scale, target).await?;
		Ok(Screenshot::of(header, asked.name, shot))
	}
}

impl<R: Runtime> Host for LibraryHost<R> {
	const SUBTYPE: &'static str = "library";

	type Operation = Operation;

	type Error = DocumentRefusal;

	async fn served(&self, operation: Operation, payload: Value) -> Result<Value, DocumentRefusal> {
		let state = Self::database(&self.app)?;
		let database = ready(&state)
			.map_err(|error| Self::Error::unexpected(format!("{NO_STORE}: {error:?}")))?;
		let space_id = self.space(database).await?;
		let root = root(&self.app)?;
		match operation {
			Operation::List => Self::answered(listed(&root, &space_id, Self::read(payload)?)?),
			Operation::Search => Self::answered(found(&root, &space_id, &Self::read(payload)?)?),
			Operation::Read => {
				let asked: Named = Self::read(payload)?;
				Self::answered(item_read(&root, &space_id, &asked.name)?)
			}
			Operation::Create => {
				let asked: Created = Self::read(payload)?;
				let created =
					create_document(&root, &space_id, &asked.name, asked.template.as_deref())?;
				Self::answered(self.changed(&space_id, created))
			}
			Operation::Import => {
				let asked: Imported = Self::read(payload)?;
				let Some(name) = asked.overwrite else {
					let imported = import_path(&root, &space_id, &asked.path)?;
					return Self::answered(self.changed(&space_id, imported));
				};
				let overwritten = overwrite_path(&self.app, &root, &space_id, &asked.path, &name)?;
				Self::answered(Entry::of(overwritten))
			}
			Operation::Rename => {
				let asked: Renamed = Self::read(payload)?;
				a_document(&root, &space_id, &asked.name)?;
				let renamed = rename_linked_document(
					&self.app,
					database,
					&root,
					&space_id,
					&asked.name,
					&asked.new_name,
				)
				.await?;
				Self::answered(self.changed(&space_id, renamed))
			}
			Operation::Delete => {
				let asked: Named = Self::read(payload)?;
				delete_item(&self.app, database, &root, &space_id, &asked.name).await?;
				Self::answered(Deleted { name: asked.name })
			}
			Operation::PostDocument => {
				let asked: Named = Self::read(payload)?;
				Self::answered(self.posted(database, asked.name).await?)
			}
			Operation::DocumentInfo => {
				let Named { name } = Self::read(payload)?;
				let read = self.blocks_read(database, &root, &space_id, &name, &[], |outline| {
					document_info(&root, &space_id, &name, outline)
				});
				Self::answered(read.await?)
			}
			Operation::DocumentTree => {
				let Named { name } = Self::read(payload)?;
				let read = self.blocks_read(database, &root, &space_id, &name, &[], |outline| {
					Ok(outline.tree())
				});
				Self::answered(DocumentTree { blocks: read.await?, name })
			}
			Operation::DocumentReadBlock => {
				let BlockNamed { name, id } = Self::read(payload)?;
				let wanted = [id.as_str()];
				let read =
					self.blocks_read(database, &root, &space_id, &name, &wanted, |outline| {
						outline.read_out(&id)
					});
				let (kind, markdown) = read.await?;
				Self::answered(BlockRead { name, id, kind, markdown })
			}
			Operation::DocumentFind => {
				let BlocksSought { name, text } = Self::read(payload)?;
				if text.trim().is_empty() {
					let detail = "give the text to look for, not an empty one".to_owned();
					return Err(ToolRefusal::UnreadableRequest { detail }.into());
				}
				let query = text.to_lowercase();
				let read = self.blocks_read(database, &root, &space_id, &name, &[], |outline| {
					Ok(outline.found(&query))
				});
				Self::answered(BlocksFound { matches: read.await?, name })
			}
			Operation::DocumentInsertAfter => {
				let asked: BlocksInserted = Self::read(payload)?;
				let wanted: Vec<&str> = asked.after.iter().map(String::as_str).collect();
				let written = self.blocks_written(
					database,
					&root,
					&space_id,
					&asked.name,
					&wanted,
					|outline| outline.inserted(asked.after.as_deref(), &asked.markdown),
				);
				Self::answered(written.await?)
			}
			Operation::DocumentReplaceBlock => {
				let asked: BlockReplaced = Self::read(payload)?;
				let wanted = [asked.id.as_str()];
				let written = self.blocks_written(
					database,
					&root,
					&space_id,
					&asked.name,
					&wanted,
					|outline| outline.replaced(&asked.id, &asked.markdown),
				);
				Self::answered(written.await?)
			}
			Operation::DocumentDeleteBlock => {
				let asked: BlocksDeleted = Self::read(payload)?;
				let wanted: Vec<&str> = asked.ids.iter().map(String::as_str).collect();
				let written = self.blocks_written(
					database,
					&root,
					&space_id,
					&asked.name,
					&wanted,
					|outline| outline.deleted(&asked.ids),
				);
				Self::answered(written.await?)
			}
			Operation::BoardCreate => {
				let asked: Named = Self::read(payload)?;
				let stem = asked
					.name
					.strip_suffix(BOARD_EXTENSION)
					.ok_or(LibraryError::InvalidName { name: asked.name.clone() })?;
				let created = self.changed(&space_id, create_board(&root, &space_id, stem)?);
				Self::answered(self.board_answered(&root, &space_id, &asked.name, |_| Ok(created))?)
			}
			Operation::BoardInfo => {
				let asked: Named = Self::read(payload)?;
				Self::answered(
					self.board_answered(&root, &space_id, &asked.name, |board| Ok(info(board)))?,
				)
			}
			Operation::BoardTree => {
				let asked: BoardTreed = Self::read(payload)?;
				Self::answered(self.board_answered(&root, &space_id, &asked.name, |board| {
					Ok(tree(board, asked.parent.as_deref(), asked.depth)?)
				})?)
			}
			Operation::BoardNodeInfo => {
				let asked: BoardElements = Self::read(payload)?;
				Self::answered(self.board_answered(&root, &space_id, &asked.name, |board| {
					Ok(node_info(board, &asked.nodes, &asked.arrows)?)
				})?)
			}
			Operation::BoardCanvas => {
				let asked: BoardParented = Self::read(payload)?;
				Self::answered(self.board_answered(&root, &space_id, &asked.name, |board| {
					let canvas = export_canvas(&under(board, asked.parent.as_deref())?)
						.map_err(|error| DocumentRefusal::unexpected(error.to_string()))?;
					Ok(CanvasShown { canvas })
				})?)
			}
			Operation::BoardWrite => {
				let asked: BoardWritten = Self::read(payload)?;
				let author = self.scope.bot_id.clone();
				let write = Group {
					parent: asked.parent.as_deref(),
					mode: asked.mode,
					nodes: &asked.nodes,
					arrows: &asked.arrows,
				};
				Self::answered(
					self.board_edited(database, &root, &space_id, &asked.name, |board| {
						let drawn = written(board, &author, &write)?;
						Ok((drawn.edit, drawn.touched, KeysLanded { ids: drawn.ids }))
					})
					.await?,
				)
			}
			Operation::BoardUpdate => {
				let asked: BoardPatched = Self::read(payload)?;
				Self::answered(
					self.board_edited(database, &root, &space_id, &asked.name, |board| {
						let changed = updated(board, &asked.nodes, &asked.arrows)?;
						let touched = ElementsTouched {
							nodes: ids_of(&changed.edit.changed_nodes),
							arrows: ids_of(&changed.edit.changed_edges),
						};
						Ok((changed.edit, changed.touched, touched))
					})
					.await?,
				)
			}
			Operation::BoardMove => {
				let asked: BoardMoved = Self::read(payload)?;
				let at = (asked.x, asked.y);
				Self::answered(
					self.board_edited(database, &root, &space_id, &asked.name, |board| {
						let moved = moved(board, &asked.nodes, asked.parent.as_deref(), at)?;
						Ok((moved.edit, moved.touched, NodesFound { nodes: moved.nodes }))
					})
					.await?,
				)
			}
			Operation::BoardDuplicate => {
				let asked: BoardDuplicated = Self::read(payload)?;
				let at = asked.x.zip(asked.y);
				Self::answered(
					self.board_edited(database, &root, &space_id, &asked.name, |board| {
						let copies = duplicated(board, &asked.nodes, at)?;
						let made = CopiesMade { nodes: copies.nodes, arrows: copies.arrows };
						Ok((copies.edit, copies.touched, made))
					})
					.await?,
				)
			}
			Operation::BoardDelete => {
				let asked: BoardElements = Self::read(payload)?;
				Self::answered(
					self.board_edited(database, &root, &space_id, &asked.name, |board| {
						let gone = deleted(board, &asked.nodes, &asked.arrows)?;
						let touched = ElementsTouched {
							nodes: gone.edit.removed_nodes.clone(),
							arrows: gone.edit.removed_edges.clone(),
						};
						Ok((gone.edit, gone.touched, touched))
					})
					.await?,
				)
			}
			Operation::BoardFind => {
				let asked: BoardSought = Self::read(payload)?;
				let sought = Sought {
					text: asked.text,
					kind: asked.kind,
					color: asked.color,
					fill: asked.fill,
					shape: asked.shape,
				};
				Self::answered(self.board_answered(&root, &space_id, &asked.name, |board| {
					Ok(NodesFound { nodes: find(board, &sought) })
				})?)
			}
			Operation::BoardView => {
				let asked: BoardViewed = Self::read(payload)?;
				Self::answered(self.board_answered(&root, &space_id, &asked.name, |board| {
					image_viewed(&root, &space_id, board, asked.id)
				})?)
			}
			Operation::Screenshot => {
				let asked: Screenshotted = Self::read(payload)?;
				match resolve(&root, &space_id, &asked.name)?.accepted {
					AcceptedType::Board => {
						Self::answered(self.board_shot(&root, &space_id, asked).await?)
					}
					_ => {
						Self::answered(self.document_shot(database, &root, &space_id, asked).await?)
					}
				}
			}
		}
	}
}

impl<H> Screenshot<H> {
	fn of(header: H, name: String, shot: Shot) -> Self {
		let Shot { content, rendered } = shot;
		let image = ItemRead::Image { name, mime_type: PNG_MIME_TYPE.to_owned(), content };
		Self { header, rendered, image }
	}
}

impl Entry {
	fn of(item: LibraryItem) -> Self {
		Self { name: item.name, kind: item.kind, updated_at: item.modified_at }
	}
}

impl Outline {
	fn of(state: Vec<u8>, name: &str) -> Result<Self, LibraryError> {
		let text = text_of_state(&state, name)?;
		let mut seen = HashSet::new();
		let blocks = blocks_of(&text)
			.into_iter()
			.filter_map(|block| {
				let id = block.id.clone().filter(|id| seen.insert(id.clone()))?;
				Some(Identified { id, block })
			})
			.collect();
		Ok(Self { state, text, blocks })
	}

	fn index_of(&self, id: &str) -> Result<usize, ToolRefusal> {
		self.blocks
			.iter()
			.position(|held| held.id == id)
			.ok_or_else(|| ToolRefusal::BlockNotFound { id: id.to_owned(), detail: READ_THE_TREE })
	}

	fn block(&self, id: &str) -> Result<&Identified, ToolRefusal> {
		let index = self.index_of(id)?;
		Ok(&self.blocks[index])
	}

	fn source(&self, held: &Identified) -> &str {
		&self.text[held.block.content.clone()]
	}

	fn tree(&self) -> Vec<TreeBlock> {
		self.blocks
			.iter()
			.map(|held| TreeBlock {
				id: held.id.clone(),
				kind: held.block.kind,
				level: held.block.level,
				text: preview(held.block.kind, self.source(held)),
			})
			.collect()
	}

	fn shown(&self, id: Option<&str>) -> Vec<ScreenshotBlock> {
		self.blocks
			.iter()
			.filter(|held| id.is_none_or(|id| held.id == id))
			.map(|held| ScreenshotBlock {
				id: held.id.clone(),
				markdown: self.source(held).to_owned(),
			})
			.collect()
	}

	fn read_out(&self, id: &str) -> Result<(BlockKind, String), DocumentRefusal> {
		let held = self.block(id)?;
		Ok((held.block.kind, self.source(held).to_owned()))
	}

	fn taken(&self) -> HashSet<String> {
		self.blocks.iter().map(|held| held.id.clone()).collect()
	}

	fn found(&self, query: &str) -> Vec<BlockFound> {
		self.blocks
			.iter()
			.filter_map(|held| {
				let line =
					self.source(held).lines().find(|line| line.to_lowercase().contains(query))?;
				Some(BlockFound {
					id: held.id.clone(),
					kind: held.block.kind,
					line: line.trim().to_owned(),
				})
			})
			.collect()
	}

	fn spliced_in(
		&self,
		range: Range<usize>,
		markdown: &str,
		kept_id: Option<&str>,
	) -> Result<Planned, DocumentRefusal> {
		let written =
			blocks::written(markdown, kept_id, &mut self.taken()).ok_or(ToolRefusal::NoBlock)?;
		let text = separated(&self.text[..range.start], &written.text, &self.text[range.end..]);
		Ok(Planned { splices: vec![Splice { range, text }], ids: written.ids })
	}

	fn inserted(&self, after: Option<&str>, markdown: &str) -> Result<Planned, DocumentRefusal> {
		let at = match after {
			Some(id) => self.block(id)?.block.end(),
			None => self.blocks.first().map_or(self.text.len(), |held| held.block.content.start),
		};
		self.spliced_in(at..at, markdown, None)
	}

	fn replaced(&self, id: &str, markdown: &str) -> Result<Planned, DocumentRefusal> {
		let span = self.block(id)?.block.span();
		self.spliced_in(span, markdown, Some(id))
	}

	fn deleted(&self, ids: &[String]) -> Result<Planned, DocumentRefusal> {
		if ids.is_empty() {
			return Err(ToolRefusal::UnreadableRequest {
				detail: "give at least one block id".to_owned(),
			}
			.into());
		}
		let mut indices = ids.iter().map(|id| self.index_of(id)).collect::<Result<Vec<_>, _>>()?;
		indices.sort_unstable();
		indices.dedup();
		let spans: Vec<Range<usize>> = self.blocks.iter().map(|held| held.block.span()).collect();
		let splices =
			runs_of(&indices).into_iter().map(|run| removal(&self.text, &spans, run)).collect();
		let ids = indices.iter().map(|index| self.blocks[*index].id.clone()).collect();
		Ok(Planned { splices, ids })
	}
}

fn runs_of(indices: &[usize]) -> Vec<Range<usize>> {
	let mut runs: Vec<Range<usize>> = Vec::new();
	for index in indices {
		match runs.last_mut() {
			Some(run) if run.end == *index => run.end += 1,
			_ => runs.push(*index..*index + 1),
		}
	}
	runs
}

fn document_info(
	root: &Path,
	space_id: &str,
	name: &str,
	outline: &Outline,
) -> Result<DocumentInfo, DocumentRefusal> {
	let resolved = resolve(root, space_id, name)?;
	let item = item_at(&resolved.path, name.to_owned())?
		.ok_or_else(|| LibraryError::Missing { name: name.to_owned() })?;
	let first_heading = outline
		.blocks
		.iter()
		.find(|held| held.block.kind == BlockKind::Heading)
		.map(|held| held.id.clone());
	Ok(DocumentInfo {
		name: item.name,
		updated_at: item.modified_at,
		blocks: outline.blocks.len(),
		first_heading,
	})
}

fn listed(root: &Path, space_id: &str, asked: Listed) -> Result<EntriesListed, DocumentRefusal> {
	let size = list_limit(asked.limit)?;
	let after =
		keyset::after(asked.cursor).map_err(|cursor| ToolRefusal::UnreadableCursor { cursor })?;
	let rows = list(root, space_id)?
		.into_iter()
		.filter(|item| asked.kind.is_none_or(|kind| item.kind == kind))
		.filter(|item| after.as_ref().is_none_or(|after| is_past(item, after)))
		.take(size as usize + 1)
		.collect();
	let page = keyset::paged(rows, size, |item: &LibraryItem| Keyset {
		sort_key: item.modified_at,
		id: item.name.clone(),
	});
	Ok(EntriesListed {
		items: page.rows.into_iter().map(Entry::of).collect(),
		cursor: page.next.map(|next| next.encoded()),
	})
}

fn list_limit(limit: Option<i64>) -> Result<u32, ToolRefusal> {
	let Some(limit) = limit else {
		return Ok(LIST_LIMIT_DEFAULT);
	};
	u32::try_from(limit).ok().filter(|held| (1..=LIST_LIMIT_MAXIMUM).contains(held)).ok_or(
		ToolRefusal::LimitOutOfRange { limit, minimum: 1, maximum: i64::from(LIST_LIMIT_MAXIMUM) },
	)
}

fn is_past(item: &LibraryItem, after: &Keyset) -> bool {
	item.modified_at < after.sort_key
		|| (item.modified_at == after.sort_key && item.name > after.id)
}

fn found(root: &Path, space_id: &str, asked: &Searched) -> Result<EntriesFound, LibraryError> {
	let query = asked.query.to_lowercase();
	let mut items = Vec::new();
	for item in list(root, space_id)? {
		let is_hit = match item.kind {
			LibraryItemKind::Board => a_board_holds(root, space_id, &item, &query)?,
			_ => {
				item.name.to_lowercase().contains(&query)
					|| text_holds(root, space_id, &item, &query)?
			}
		};
		if is_hit {
			items.push(Entry::of(item));
		}
	}
	Ok(EntriesFound { items })
}

fn a_board_holds(
	root: &Path,
	space_id: &str,
	item: &LibraryItem,
	query: &str,
) -> Result<bool, LibraryError> {
	let resolved = resolve(root, space_id, &item.name)?;
	match board_holds(&resolved, &item.name, query) {
		Err(
			LibraryError::InvalidBoard { .. }
			| LibraryError::NotUtf8 { .. }
			| LibraryError::TooLarge { .. },
		) => {
			log::warn!(
				"a library search of space {space_id} left {} out: it is not a readable board",
				item.name
			);
			Ok(false)
		}
		held => held,
	}
}

fn text_holds(
	root: &Path,
	space_id: &str,
	item: &LibraryItem,
	query: &str,
) -> Result<bool, LibraryError> {
	if item.kind != LibraryItemKind::Document {
		return Ok(false);
	}
	let resolved = resolve(root, space_id, &item.name)?;
	match document_text(&resolved, &item.name) {
		Ok(text) => Ok(text.to_lowercase().contains(query)),
		Err(LibraryError::NotUtf8 { .. } | LibraryError::TooLarge { .. }) => {
			log::warn!(
				"a library search of space {space_id} matched {} on its name only: its text is unreadable",
				item.name
			);
			Ok(false)
		}
		Err(error) => Err(error),
	}
}

fn item_read(root: &Path, space_id: &str, name: &str) -> Result<ItemRead, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let name = name.to_owned();
	Ok(match item.accepted {
		AcceptedType::Document(_) | AcceptedType::Board => ItemRead::Text {
			text: document_text(&item, &name)?,
			kind: item.accepted.item_kind(),
			name,
		},
		AcceptedType::Image { mime_type } if item.bytes <= MAX_SHOWN_IMAGE_BYTES => {
			ItemRead::Image {
				content: encoded_content(&item, &name)?,
				name,
				mime_type: mime_type.to_owned(),
			}
		}
		AcceptedType::Image { mime_type } => ItemRead::Described {
			name,
			kind: LibraryItemKind::Image,
			mime_type: mime_type.to_owned(),
			bytes: item.bytes,
		},
	})
}

fn image_viewed(
	root: &Path,
	space_id: &str,
	board: &Board,
	id: String,
) -> Result<ItemRead, DocumentRefusal> {
	let Some(node) = node_file(board, &id) else {
		return Err(not_shown(id, NotShown::UnknownNode));
	};
	if node.kind != IMAGE_KIND {
		return Err(not_shown(id, NotShown::NotAnImage { node_kind: node.kind }));
	}
	let Some(file) = node.file else {
		return Err(not_shown(id, NotShown::NoFile));
	};
	let item = match resolve(root, space_id, &file) {
		Ok(item) => item,
		Err(LibraryError::Missing { .. }) => {
			return Err(not_shown(id, NotShown::MissingFile { file }))
		}
		Err(LibraryError::InvalidName { .. }) => {
			return Err(not_shown(id, NotShown::OutsideLibrary { file }))
		}
		Err(error) => return Err(error.into()),
	};
	let AcceptedType::Image { mime_type } = item.accepted else {
		return Err(not_shown(id, NotShown::NotAnImageFile { file }));
	};
	if item.bytes > MAX_SHOWN_IMAGE_BYTES {
		let too_large = NotShown::TooLarge { bytes: item.bytes, limit: MAX_SHOWN_IMAGE_BYTES };
		return Err(not_shown(id, too_large));
	}
	Ok(ItemRead::Image {
		content: encoded_content(&item, &file)?,
		name: file,
		mime_type: mime_type.to_owned(),
	})
}

fn board_header(
	root: &Path,
	space_id: &str,
	name: &str,
	board: &Board,
) -> Result<BoardHeader, DocumentRefusal> {
	let item = item_at(&space_dir(root, space_id).join(name), name.to_owned())?
		.ok_or_else(|| LibraryError::Missing { name: name.to_owned() })?;
	let hash = content_hash(board).map_err(|error| {
		DocumentRefusal::unexpected(format!("the board {name} did not hash: {error}"))
	})?;
	Ok(BoardHeader { name: item.name, updated_at: item.modified_at, hash })
}

fn ids_of(changes: &[ElementChange]) -> Vec<String> {
	changes.iter().map(|change| change.id.clone()).collect()
}

fn not_shown(id: String, reason: NotShown) -> DocumentRefusal {
	DocumentRefusal::Tool(ToolRefusal::NodeNotShown { id, reason })
}

struct Writing<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	space_id: &'a str,
	name: &'a str,
	agent: &'a Agent,
	outcome: LibraryWriteOutcome,
}

impl<'a, R: Runtime> Writing<'a, R> {
	fn of(app: &'a AppHandle<R>, space_id: &'a str, name: &'a str, agent: &'a Agent) -> Self {
		Self { app, space_id, name, agent, outcome: LibraryWriteOutcome::Failed }
	}

	fn at(&self, caret: &[u8]) {
		self.seated(LibraryPresenceAt::Text { anchor: BASE64_STANDARD.encode(caret) });
	}

	fn seated(&self, at: LibraryPresenceAt) {
		let seated = Seated {
			seat: Seat::Agent(self.agent.id.clone()),
			name: Some(self.agent.name.clone()),
			hue: None,
			at,
			lease_ends_at: None,
		};
		seat_writer(self.app, self.space_id, self.name, seated);
	}
}

struct BoardWriting<'a, R: Runtime> {
	writing: Writing<'a, R>,
}

impl<'a, R: Runtime> BoardWriting<'a, R> {
	fn of(app: &'a AppHandle<R>, space_id: &'a str, name: &'a str, agent: &'a Agent) -> Self {
		Self { writing: Writing::of(app, space_id, name, agent) }
	}

	fn at(&self, touched: &Touched) {
		let Writing { app, space_id, name, agent, .. } = &self.writing;
		let point = LibraryBoardPoint { x: touched.x, y: touched.y };
		let at = LibraryPresenceAt::Board { point, node_id: touched.node_id.clone() };
		seat_agent_on_board(app, space_id, name, &agent.id, &agent.name, at);
	}
}

impl<R: Runtime> Drop for Writing<'_, R> {
	fn drop(&mut self) {
		let finished = LibraryDocumentWriterFinished {
			space_id: self.space_id.to_owned(),
			name: self.name.to_owned(),
			agent_id: self.agent.id.clone(),
			agent_name: self.agent.name.clone(),
			outcome: self.outcome,
		};
		if let Err(error) =
			events::emit(self.app, events::LIBRARY_DOCUMENT_WRITER_FINISHED, finished)
		{
			log::warn!(
				"the end of a write by agent {} in space {} was not published: {error}",
				self.agent.id,
				self.space_id
			);
		}
	}
}

type WriteKey = (String, String, String);

type WriteQueue = Arc<tokio::sync::Mutex<()>>;

struct Writer {
	scope: RuntimeScope,
	stop: Arc<watch::Sender<bool>>,
}

#[derive(Default)]
struct AgentWrites {
	queues: Mutex<HashMap<WriteKey, WriteQueue>>,
	writers: Mutex<HashMap<WriteKey, Vec<Writer>>>,
}

impl AgentWrites {
	fn held(&self) -> MutexGuard<'_, HashMap<WriteKey, WriteQueue>> {
		self.queues.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn writing(&self) -> MutexGuard<'_, HashMap<WriteKey, Vec<Writer>>> {
		self.writers.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

struct Enlisted<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	key: WriteKey,
	stop: Arc<watch::Sender<bool>>,
	stopped: watch::Receiver<bool>,
}

fn enlisted<'a, R: Runtime>(
	app: &'a AppHandle<R>,
	key: WriteKey,
	scope: &RuntimeScope,
) -> Enlisted<'a, R> {
	let (stop, stopped) = watch::channel(false);
	let stop = Arc::new(stop);
	let writer = Writer { scope: scope.clone(), stop: stop.clone() };
	writes(app).writing().entry(key.clone()).or_default().push(writer);
	Enlisted { app, key, stop, stopped }
}

impl<R: Runtime> Drop for Enlisted<'_, R> {
	fn drop(&mut self) {
		let writes = writes(self.app);
		let mut writing = writes.writing();
		let Some(writers) = writing.get_mut(&self.key) else {
			return;
		};
		writers.retain(|writer| !Arc::ptr_eq(&writer.stop, &self.stop));
		if writers.is_empty() {
			writing.remove(&self.key);
		}
	}
}

struct Turn<'a, R: Runtime> {
	_held: OwnedMutexGuard<()>,
	enlisted: Enlisted<'a, R>,
}

impl<R: Runtime> Turn<'_, R> {
	fn is_stopped(&self) -> bool {
		*self.enlisted.stopped.borrow()
	}
}

async fn turn_of<'a, R: Runtime>(
	app: &'a AppHandle<R>,
	space_id: &str,
	name: &str,
	scope: &RuntimeScope,
) -> Turn<'a, R> {
	let key = (space_id.to_owned(), name.to_owned(), scope.bot_id.clone());
	let enlisted = enlisted(app, key.clone(), scope);
	let queue = writes(app).held().entry(key).or_default().clone();
	let held = queue.lock_owned().await;
	Turn { _held: held, enlisted }
}

pub(crate) async fn stop_writers<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	agent_id: Option<&str>,
) -> Vec<RuntimeScope> {
	let stopping: Vec<_> = writes(app)
		.writing()
		.iter()
		.filter(|((space, document, agent), _)| {
			space == space_id && document == name && agent_id.is_none_or(|asked| asked == agent)
		})
		.flat_map(|(_, writers)| writers)
		.map(|writer| {
			writer.stop.send_replace(true);
			(writer.scope.clone(), writer.stop.clone())
		})
		.collect();
	join_all(stopping.iter().map(|(_, stop)| stop.closed())).await;
	let mut scopes = Vec::new();
	for (scope, _) in stopping {
		if !scopes.contains(&scope) {
			scopes.push(scope);
		}
	}
	scopes
}

impl<R: Runtime> Drop for Turn<'_, R> {
	fn drop(&mut self) {
		let Enlisted { app, key, .. } = &self.enlisted;
		let writes = writes(app);
		let mut held = writes.held();
		let is_another_queued = held.get(key).is_some_and(|queue| Arc::strong_count(queue) > 2);
		if is_another_queued {
			return;
		}
		held.remove(key);
		let (space_id, name, agent_id) = key;
		unseat_writer(app, space_id, name, &Seat::Agent(agent_id.clone()));
	}
}

fn writes<R: Runtime>(app: &AppHandle<R>) -> State<'_, AgentWrites> {
	if app.try_state::<AgentWrites>().is_none() {
		app.manage(AgentWrites::default());
	}
	app.state::<AgentWrites>()
}

fn markdown(root: &Path, space_id: &str, name: &str) -> Result<(), LibraryError> {
	let document = read_document(root, space_id, name)?;
	if document.format != LibraryDocumentFormat::Markdown {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	}
	Ok(())
}

fn client_id_of(bot_id: &str) -> u64 {
	let digest = Sha256::digest(bot_id.as_bytes());
	u64::from(u32::from_be_bytes([digest[0], digest[1], digest[2], digest[3]]))
}

fn steps(text: &str) -> Vec<&str> {
	let per_step = text.chars().count().div_ceil(WRITE_STEPS).max(1);
	let mut bounds: Vec<usize> = text.char_indices().step_by(per_step).map(|(at, _)| at).collect();
	bounds.push(text.len());
	bounds.windows(2).map(|bound| &text[bound[0]..bound[1]]).collect()
}

impl From<LibraryError> for DocumentRefusal {
	fn from(error: LibraryError) -> Self {
		Self::Library(error)
	}
}

impl From<OverwriteRefusal> for DocumentRefusal {
	fn from(refusal: OverwriteRefusal) -> Self {
		match refusal {
			OverwriteRefusal::Library(error) => Self::Library(error),
			OverwriteRefusal::FormatMismatch { name, mime_type, produced_mime_type } => {
				Self::Tool(ToolRefusal::FormatMismatch {
					name,
					mime_type: mime_type.to_owned(),
					produced_mime_type: produced_mime_type.to_owned(),
				})
			}
		}
	}
}

impl From<DrawRefusal> for DocumentRefusal {
	fn from(refusal: DrawRefusal) -> Self {
		Self::Tool(ToolRefusal::InvalidBoardItem(refusal))
	}
}

impl From<ToolRefusal> for DocumentRefusal {
	fn from(refusal: ToolRefusal) -> Self {
		Self::Tool(refusal)
	}
}

impl From<db::DatabaseError> for DocumentRefusal {
	fn from(error: db::DatabaseError) -> Self {
		Self::Library(error.into())
	}
}

impl Refusal for DocumentRefusal {
	fn unreadable(detail: String) -> Self {
		Self::Tool(ToolRefusal::UnreadableRequest { detail })
	}

	fn unexpected(detail: String) -> Self {
		Self::Tool(ToolRefusal::Unexpected { detail })
	}
}

#[cfg(test)]
mod tests;
