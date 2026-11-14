use std::mem;
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex, PoisonError};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{Listener, Manager, WebviewWindowBuilder};

use super::*;
use crate::agent::contract::RuntimeScope;
use crate::agent::host::Host;
use crate::board::{BoardEdit, ElementChange};
use crate::conversations::context::{UNTRUSTED_CLOSE, UNTRUSTED_OPEN};
use crate::db;
use crate::db::repositories::conversations::{BotIdentity, ChatOwner, DEFAULT_BOT_MODEL};
use crate::db::repositories::library::AgentOfThread;
use crate::db::repositories::messages::{NewAssistantMessage, NewTurn, TerminalState};
use crate::library::commands::{
	library_comment_agent_turns, library_comment_counts, library_comment_create,
	library_comment_reopen, library_comment_reply, library_comment_resolve,
	library_comment_threads, library_delete, library_rename_board, library_rename_document,
};
use crate::library::contract::{
	LibraryCommentAgentTurn, LibraryCommentAgentTurnState, LibraryCommentAgentTurnsChanged,
	LibraryCommentCount, LibraryCommentMentioned, LibraryCommentThreadState,
	LibraryCommentTurnFailure, COMMENT_AGENT_TURNS_CHANGED_EVENT, COMMENT_MENTIONED_EVENT,
	COMMENT_MENTION_OPENED_EVENT, COMMENT_THREAD_CHANGED_EVENT,
};
use crate::library::documents::BoardTarget;
use crate::library::host::{LibraryHost, Operation};
use crate::library::root;
use crate::library::tests::{a_host, a_space, put, A_BOARD};
use crate::notifications::{self, Notice, SystemNotifications};
use crate::search::contract::{CatalogueScope, MessageSearchQuery};
use crate::test_app::AppOfItsOwn;
use crate::test_log::{capturing, warnings_naming};

const A_DOCUMENT: &str = "# Launch ^head01\n\nShip the beta on Friday. ^para01\n";

const A_DOCUMENT_REWRITTEN: &str = "Ship the final build on Monday. ^para01\n";

const NOTES: &str = "notes.md";
const COVER: &str = "cover.png";
const PLAN: &str = "plan.canvas";

const BEA: &str = "account-bea";
const NYX: &str = "bot-nyx";

fn person(id: &str) -> LibraryCommentParty {
	LibraryCommentParty { kind: LibraryCommentPartyKind::Person, id: id.to_owned() }
}

fn agent(id: &str) -> LibraryCommentParty {
	LibraryCommentParty { kind: LibraryCommentPartyKind::Agent, id: id.to_owned() }
}

fn said(author: LibraryCommentParty, text: &str, mentions: &[LibraryCommentParty]) -> Said {
	Said { author, text: text.to_owned(), mentions: mentions.to_vec() }
}

fn block(id: &str) -> Anchor {
	Anchor::Block { block_id: id.to_owned() }
}

fn passage(block_id: &str, quote: &str) -> Anchor {
	Anchor::Passage { block_id: block_id.to_owned(), quote: quote.to_owned(), start: 5, end: 13 }
}

fn node(id: &str) -> Anchor {
	Anchor::BoardNode { node_id: id.to_owned() }
}

fn resolved_by_the_host(thread: &LibraryCommentThread, at: Option<i64>) -> LibraryCommentThread {
	LibraryCommentThread {
		state: LibraryCommentThreadState::Resolved,
		resolved_by: Some(person(COMMENT_HOST_AUTHOR_ID)),
		resolved_at: at,
		..thread.clone()
	}
}

fn the_six_anchors() -> [(&'static str, Anchor); 6] {
	[
		(NOTES, block("head01")),
		(NOTES, passage("para01", "the beta")),
		(COVER, Anchor::ImagePoint { x: 0.25, y: 1.0 }),
		(COVER, Anchor::ImageZone { x: 0.0, y: 0.5, width: 1.0, height: 0.5 }),
		(PLAN, node("a")),
		(PLAN, Anchor::BoardPoint { point: LibraryBoardPoint { x: -120, y: 40 } }),
	]
}

type Started = Arc<Mutex<Vec<CommentTurn>>>;

fn taken(started: &Started) -> Vec<CommentTurn> {
	mem::take(&mut *started.lock().unwrap_or_else(PoisonError::into_inner))
}

fn briefed_in(prompt: &str) -> Value {
	let open = prompt.find(UNTRUSTED_OPEN).expect("the fence opens") + UNTRUSTED_OPEN.len();
	let close = prompt.find(UNTRUSTED_CLOSE).expect("the fence closes");
	serde_json::from_str(&prompt[open..close]).expect("the thread is fenced as JSON")
}

fn working(thread_id: &str, agent_id: &str) -> LibraryCommentAgentTurn {
	LibraryCommentAgentTurn {
		thread_id: thread_id.to_owned(),
		agent_id: agent_id.to_owned(),
		state: LibraryCommentAgentTurnState::Working,
	}
}

struct Shelf {
	app: AppOfItsOwn,
	space_id: String,
	root: PathBuf,
}

impl Shelf {
	async fn of(name: &str) -> Self {
		let app = a_host(&format!("comments-{name}"));
		let space_id = a_space(&app, "Work").await;
		let root = root(app.handle()).expect("the library root resolves");
		put(&root, &space_id, NOTES, A_DOCUMENT.as_bytes());
		put(&root, &space_id, COVER, b"png");
		put(&root, &space_id, PLAN, A_BOARD.as_bytes());
		Self { app, space_id, root }
	}

	fn database(&self) -> &db::Database {
		self.app.state::<db::DatabaseState>().inner().as_ref().expect("the database opens")
	}

	fn recording_turns(&self) -> Started {
		let started = Started::default();
		let kept = Arc::clone(&started);
		self.app.manage(CommentTurns::starting_with(move |turn| {
			kept.lock().unwrap_or_else(PoisonError::into_inner).push(turn);
		}));
		started
	}

	async fn an_agent_of(&self, space_id: &str, name: &str) -> String {
		let identity = BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: DEFAULT_BOT_MODEL.to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: String::new(),
			denied_tools: Vec::new(),
			effort: None,
		};
		self.database()
			.conversations()
			.create_bot(identity, Some(space_id.to_owned()), None)
			.await
			.expect("the agent is created")
			.id
	}

	async fn an_agent(&self, name: &str) -> String {
		self.an_agent_of(&self.space_id, name).await
	}

	async fn mentioning(&self, name: &str, anchor: Anchor, agent_id: &str) -> LibraryCommentThread {
		self.opened_saying(name, anchor, said(person(BEA), "Tighten this", &[agent(agent_id)]))
			.await
			.expect("the thread opens")
	}

	async fn agent_turns(&self) -> Vec<LibraryCommentAgentTurn> {
		library_comment_agent_turns(
			self.app.handle().clone(),
			self.app.state(),
			self.space_id.clone(),
		)
		.await
		.expect("the agent turns read")
	}

	async fn room_of(&self, thread: &LibraryCommentThread, agent_id: &str) -> String {
		self.database()
			.library()
			.agent_turn_started(self.thread(&thread.item_name, &thread.id), agent_id.to_owned(), 7)
			.await
			.expect("the room opens")
			.expect("the thread stands")
	}

	async fn said_in(&self, conversation_id: &str, agent_id: &str, text: &str) {
		let messages = self.database().messages();
		let turn = NewTurn {
			id: "turn-1".to_owned(),
			conversation_id: conversation_id.to_owned(),
			started_at: 1,
		};
		messages.start_turn(turn).await.expect("the turn starts");
		let message = NewAssistantMessage {
			id: "message-1".to_owned(),
			conversation_id: conversation_id.to_owned(),
			turn_id: "turn-1".to_owned(),
			author_bot_id: Some(agent_id.to_owned()),
			replied_to_message_id: None,
			created_at: 1,
		};
		messages.open_assistant_message(message).await.expect("the message opens");
		messages.append_text("message-1".to_owned(), text.to_owned()).await.expect("the text");
		messages
			.finalize_message("message-1".to_owned(), TerminalState::Complete, None)
			.await
			.expect("the message completes");
	}

	fn host_of(&self, room: &str, agent_id: &str) -> LibraryHost<tauri::test::MockRuntime> {
		let scope = RuntimeScope {
			conversation_id: room.to_owned(),
			bot_id: agent_id.to_owned(),
			runtime_session_id: "r1".to_owned(),
			epoch: 0,
		};
		LibraryHost::new(self.app.handle().clone(), scope)
	}

	fn thread(&self, name: &str, id: &str) -> ThreadOfItem {
		ThreadOfItem {
			space_id: self.space_id.clone(),
			item_name: name.to_owned(),
			id: id.to_owned(),
		}
	}

	async fn opened_saying(
		&self,
		name: &str,
		anchor: Anchor,
		said: Said,
	) -> Result<LibraryCommentThread, LibraryError> {
		let (app, database) = (self.app.handle(), self.database());
		open_comment_thread(app, database, &self.root, &self.space_id, name, anchor, said).await
	}

	async fn opened(&self, name: &str, anchor: Anchor) -> LibraryCommentThread {
		self.opened_saying(name, anchor, said(person(BEA), "Tighten this", &[agent(NYX)]))
			.await
			.expect("the thread opens")
	}

	async fn replied(
		&self,
		name: &str,
		id: &str,
		said: Said,
	) -> Result<LibraryCommentThread, LibraryError> {
		let (app, database) = (self.app.handle(), self.database());
		reply_to_comment_thread(app, database, &self.root, self.thread(name, id), said).await
	}

	async fn resolved(&self, name: &str, id: &str) -> Result<LibraryCommentThread, LibraryError> {
		self.resolved_by(Caller::Host, name, id).await
	}

	async fn resolved_by(
		&self,
		caller: Caller,
		name: &str,
		id: &str,
	) -> Result<LibraryCommentThread, LibraryError> {
		library_comment_resolve(
			self.app.handle().clone(),
			caller,
			self.app.state(),
			self.space_id.clone(),
			name.to_owned(),
			id.to_owned(),
		)
		.await
	}

	async fn reopened(&self, name: &str, id: &str) -> Result<LibraryCommentThread, LibraryError> {
		library_comment_reopen(
			self.app.handle().clone(),
			self.app.state(),
			self.space_id.clone(),
			name.to_owned(),
			id.to_owned(),
		)
		.await
	}

	async fn threads(&self, name: &str) -> Result<Vec<LibraryCommentThread>, LibraryError> {
		library_comment_threads(
			self.app.handle().clone(),
			self.app.state(),
			self.space_id.clone(),
			name.to_owned(),
		)
		.await
	}

	async fn counts(&self) -> Vec<(String, u32)> {
		library_comment_counts(self.app.state(), self.space_id.clone())
			.await
			.expect("the open threads count")
			.into_iter()
			.map(|LibraryCommentCount { item_name, open_threads }| (item_name, open_threads))
			.collect()
	}

	fn node_removed(&self, id: &str) {
		self.board_edited(BoardEdit { removed_nodes: vec![id.to_owned()], ..BoardEdit::default() });
	}

	fn node_moved(&self, id: &str, to: LibraryBoardPoint) {
		let element = json!({ "x": to.x, "y": to.y }).as_object().cloned().expect("an object");
		let fields = vec!["x".to_owned(), "y".to_owned()];
		let moved = ElementChange { id: id.to_owned(), element, fields };
		self.board_edited(BoardEdit { changed_nodes: vec![moved], ..BoardEdit::default() });
	}

	fn board_edited(&self, edit: BoardEdit) {
		let target =
			BoardTarget { root: &self.root, space_id: &self.space_id, name: PLAN, writer: 1 };
		documents(self.app.handle())
			.edit_board(&target, |_| Ok::<_, LibraryError>((edit, ())), |_| {})
			.expect("the board is edited");
	}

	async fn board_written(&self) {
		documents(self.app.handle()).write_pending_boards();
		written_boards_followed(self.app.handle()).await;
	}

	async fn created_by(&self, caller: Caller) -> Result<LibraryCommentThread, LibraryError> {
		library_comment_create(
			self.app.handle().clone(),
			caller,
			self.app.state(),
			self.space_id.clone(),
			NOTES.to_owned(),
			block("head01"),
			"Tighten this".to_owned(),
			Vec::new(),
		)
		.await
	}

	async fn replied_by(
		&self,
		caller: Caller,
		thread_id: &str,
	) -> Result<LibraryCommentThread, LibraryError> {
		library_comment_reply(
			self.app.handle().clone(),
			caller,
			self.app.state(),
			self.space_id.clone(),
			NOTES.to_owned(),
			thread_id.to_owned(),
			"Done".to_owned(),
			Vec::new(),
		)
		.await
	}

	async fn stored_rows(&self, table: &'static str) -> i64 {
		self.database()
			.call(move |connection| {
				Ok(connection
					.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))?)
			})
			.await
			.expect("the rows count")
	}
}

#[tokio::test]
async fn each_of_the_six_anchors_is_commented_replied_to_resolved_reopened_and_read_back() {
	let shelf = Shelf::of("six-anchors").await;

	for (name, anchor) in the_six_anchors() {
		let opened = shelf.opened(name, anchor.clone()).await;
		let reply = said(agent(NYX), "Done", &[person(BEA)]);
		let replied = shelf.replied(name, &opened.id, reply).await.expect("the reply lands");
		let resolved = shelf.resolved(name, &opened.id).await.expect("the thread resolves");
		let reopened = shelf.reopened(name, &opened.id).await.expect("the thread reopens");
		let read = shelf.threads(name).await.expect("the threads read");

		assert_eq!(opened.space_id, shelf.space_id, "{anchor:?}");
		assert_eq!((opened.item_name.as_str(), &opened.anchor), (name, &anchor));
		assert_eq!(opened.state, LibraryCommentThreadState::Open, "{anchor:?}");
		assert!(!opened.target_missing, "{anchor:?}");
		let spoken: Vec<_> = replied
			.comments
			.iter()
			.map(|comment| (&comment.author, comment.text.as_str(), &comment.mentions))
			.collect();
		assert_eq!(
			spoken,
			[
				(&person(BEA), "Tighten this", &vec![agent(NYX)]),
				(&agent(NYX), "Done", &vec![person(BEA)]),
			],
			"{anchor:?}"
		);
		assert!(replied.comments[0].created_at <= replied.comments[1].created_at);
		let on_the_node = matches!(anchor, Anchor::BoardNode { .. });
		let where_the_node_stands = on_the_node.then_some(LibraryBoardPoint { x: -40, y: 10 });
		assert_eq!(opened.last_board_point, where_the_node_stands, "{anchor:?}");
		assert_eq!((&opened.resolved_by, opened.resolved_at), (&None, None), "{anchor:?}");
		assert!(resolved.resolved_at >= Some(replied.comments[1].created_at), "{anchor:?}");
		assert_eq!(resolved, resolved_by_the_host(&replied, resolved.resolved_at), "{anchor:?}");
		assert_eq!(reopened, replied, "{anchor:?}");
		assert_eq!(read.last(), Some(&reopened), "{anchor:?}");
	}

	assert_eq!(
		shelf.counts().await,
		[(COVER.to_owned(), 2), (NOTES.to_owned(), 2), (PLAN.to_owned(), 2)]
	);
}

#[tokio::test]
async fn open_threads_are_counted_per_item_and_a_resolved_thread_leaves_the_count() {
	let shelf = Shelf::of("counts").await;
	let first = shelf.opened(NOTES, block("head01")).await;
	shelf.opened(NOTES, block("para01")).await;
	shelf.opened(PLAN, node("a")).await;

	shelf.resolved(NOTES, &first.id).await.expect("the thread resolves");
	let after_a_resolve = shelf.counts().await;
	shelf.reopened(NOTES, &first.id).await.expect("the thread reopens");

	assert_eq!(after_a_resolve, [(NOTES.to_owned(), 1), (PLAN.to_owned(), 1)]);
	assert_eq!(shelf.counts().await, [(NOTES.to_owned(), 2), (PLAN.to_owned(), 1)]);
}

#[tokio::test]
async fn every_write_announces_the_thread_as_it_stands_once() {
	let shelf = Shelf::of("announced").await;
	let (told, heard) = mpsc::channel();
	shelf.app.listen_any(COMMENT_THREAD_CHANGED_EVENT, move |event| {
		let changed: LibraryCommentThreadChanged =
			serde_json::from_str(event.payload()).expect("a payload");
		told.send(changed).expect("the test listens");
	});

	let opened = shelf.opened(COVER, Anchor::ImagePoint { x: 0.5, y: 0.5 }).await;
	let reply = said(person(BEA), "And here", &[]);
	let replied = shelf.replied(COVER, &opened.id, reply).await.expect("the reply lands");
	let resolved = shelf.resolved(COVER, &opened.id).await.expect("the thread resolves");
	let reopened = shelf.reopened(COVER, &opened.id).await.expect("the thread reopens");

	let announced: Vec<_> = [opened, replied, resolved, reopened]
		.into_iter()
		.map(|thread| LibraryCommentThreadChanged {
			space_id: shelf.space_id.clone(),
			item_name: COVER.to_owned(),
			thread,
		})
		.collect();
	let heard_in_order: Vec<_> = announced
		.iter()
		.map(|_| heard.recv_timeout(Duration::from_secs(5)).expect("a change was announced"))
		.collect();
	assert_eq!(heard_in_order, announced);
	assert!(heard.recv_timeout(Duration::from_millis(100)).is_err());
}

#[tokio::test]
async fn a_renamed_document_and_a_renamed_board_keep_their_threads_under_the_new_name() {
	let shelf = Shelf::of("renamed").await;
	let on_the_document = shelf.opened(NOTES, block("head01")).await;
	let on_the_board = shelf.opened(PLAN, node("a")).await;
	let (app, space_id) = (shelf.app.handle().clone(), shelf.space_id.clone());

	library_rename_document(
		app.clone(),
		shelf.app.state(),
		space_id.clone(),
		NOTES.to_owned(),
		"brief.md".to_owned(),
	)
	.await
	.expect("the document is renamed");
	library_rename_board(
		app,
		shelf.app.state(),
		space_id,
		PLAN.to_owned(),
		"map.canvas".to_owned(),
	)
	.await
	.expect("the board is renamed");

	let moved = |thread: LibraryCommentThread, name: &str| LibraryCommentThread {
		item_name: name.to_owned(),
		..thread
	};
	assert_eq!(shelf.threads("brief.md").await, Ok(vec![moved(on_the_document, "brief.md")]));
	assert_eq!(shelf.threads("map.canvas").await, Ok(vec![moved(on_the_board, "map.canvas")]));
	assert_eq!(shelf.counts().await, [("brief.md".to_owned(), 1), ("map.canvas".to_owned(), 1)]);
}

#[tokio::test]
async fn a_deleted_item_loses_its_threads_and_their_comments() {
	let shelf = Shelf::of("deleted").await;
	let kept = shelf.opened(COVER, Anchor::ImagePoint { x: 0.5, y: 0.5 }).await;
	let lost = shelf.opened(NOTES, block("head01")).await;
	shelf.replied(NOTES, &lost.id, said(agent(NYX), "Done", &[])).await.expect("the reply lands");

	library_delete(
		shelf.app.handle().clone(),
		shelf.app.state(),
		shelf.space_id.clone(),
		NOTES.to_owned(),
	)
	.await
	.expect("the document is deleted");

	assert_eq!(shelf.threads(COVER).await, Ok(vec![kept]));
	assert_eq!(shelf.counts().await, [(COVER.to_owned(), 1)]);
	assert_eq!(shelf.stored_rows("library_comment_threads").await, 1);
	assert_eq!(shelf.stored_rows("library_comments").await, 1);
}

#[tokio::test]
async fn a_thread_whose_block_passage_or_node_is_gone_reads_with_its_target_missing() {
	let shelf = Shelf::of("target-missing").await;
	let on_a_removed_block = shelf.opened(NOTES, block("head01")).await;
	let on_a_rewritten_passage = shelf.opened(NOTES, passage("para01", "the beta")).await;
	let on_a_kept_block = shelf.opened(NOTES, block("para01")).await;
	let on_a_removed_node = shelf.opened(PLAN, node("a")).await;
	let on_a_kept_node = shelf.opened(PLAN, node("b")).await;

	put(&shelf.root, &shelf.space_id, NOTES, A_DOCUMENT_REWRITTEN.as_bytes());
	shelf.node_removed("a");

	let missing =
		|thread: LibraryCommentThread| LibraryCommentThread { target_missing: true, ..thread };
	assert_eq!(
		shelf.threads(NOTES).await,
		Ok(vec![
			missing(on_a_removed_block.clone()),
			missing(on_a_rewritten_passage),
			on_a_kept_block
		])
	);
	assert_eq!(shelf.threads(PLAN).await, Ok(vec![missing(on_a_removed_node), on_a_kept_node]));
	let resolved =
		shelf.resolved(NOTES, &on_a_removed_block.id).await.expect("the thread resolves");
	assert_eq!(resolved, resolved_by_the_host(&missing(on_a_removed_block), resolved.resolved_at));
	assert_eq!(shelf.stored_rows("library_comment_threads").await, 5);
}

#[tokio::test]
async fn a_thread_on_a_node_follows_it_at_each_board_write_and_keeps_its_last_point_once_removed() {
	let shelf = Shelf::of("board-point").await;
	let on_the_node = shelf.opened(PLAN, node("a")).await;
	let beside = Anchor::BoardPoint { point: LibraryBoardPoint { x: 5, y: 5 } };
	let on_a_point = shelf.opened(PLAN, beside).await;
	let moved_to = LibraryBoardPoint { x: 300, y: -75 };

	shelf.node_moved("a", moved_to);
	shelf.board_written().await;
	let after_the_move = shelf.threads(PLAN).await;
	shelf.node_removed("a");
	shelf.board_written().await;
	let after_the_removal = shelf.threads(PLAN).await;

	let followed = LibraryCommentThread { last_board_point: Some(moved_to), ..on_the_node.clone() };
	assert_eq!(on_the_node.last_board_point, Some(LibraryBoardPoint { x: -40, y: 10 }));
	assert_eq!(after_the_move, Ok(vec![followed.clone(), on_a_point.clone()]));
	assert_eq!(
		after_the_removal,
		Ok(vec![LibraryCommentThread { target_missing: true, ..followed }, on_a_point])
	);
}

#[tokio::test]
async fn a_space_an_item_or_a_thread_that_does_not_exist_is_refused_by_name() {
	let shelf = Shelf::of("unknown").await;
	let on_the_document = shelf.opened(NOTES, block("head01")).await;
	let (app, state) = (shelf.app.handle().clone(), shelf.app.state());

	let in_no_space =
		library_comment_threads(app, state, "nowhere".to_owned(), NOTES.to_owned()).await;
	let on_no_item = shelf.threads("absent.md").await;
	let opened_on_no_item =
		shelf.opened_saying("absent.md", block("head01"), said(person(BEA), "Here", &[])).await;
	let reply = said(person(BEA), "Here", &[]);
	let replied_to_no_thread = shelf.replied(NOTES, "no-thread", reply).await;
	let resolved_no_thread = shelf.resolved(NOTES, "no-thread").await;
	let reopened_under_another_item = shelf.reopened(COVER, &on_the_document.id).await;

	let unknown_thread = |id: &str| Err(LibraryError::UnknownThread { id: id.to_owned() });
	let missing = LibraryError::Missing { name: "absent.md".to_owned() };
	assert_eq!(in_no_space, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(on_no_item, Err(missing.clone()));
	assert_eq!(opened_on_no_item, Err(missing));
	assert_eq!(replied_to_no_thread, unknown_thread("no-thread"));
	assert_eq!(resolved_no_thread, unknown_thread("no-thread"));
	assert_eq!(reopened_under_another_item, unknown_thread(&on_the_document.id));
	assert_eq!(shelf.threads(NOTES).await, Ok(vec![on_the_document]));
}

#[tokio::test]
async fn an_anchor_of_another_kind_or_out_of_the_image_and_a_blank_comment_store_nothing() {
	let shelf = Shelf::of("refused").await;
	let opened = |name: &'static str, anchor: Anchor| {
		shelf.opened_saying(name, anchor, said(person(BEA), "Here", &[]))
	};
	let named = |name: &str| name.to_owned();

	assert_eq!(
		opened(COVER, block("head01")).await,
		Err(LibraryError::NotADocument { name: named(COVER) })
	);
	assert_eq!(
		opened(PLAN, passage("para01", "the beta")).await,
		Err(LibraryError::NotADocument { name: named(PLAN) })
	);
	assert_eq!(
		opened(NOTES, Anchor::ImagePoint { x: 0.5, y: 0.5 }).await,
		Err(LibraryError::NotAnImage { name: named(NOTES) })
	);
	assert_eq!(opened(NOTES, node("a")).await, Err(LibraryError::NotABoard { name: named(NOTES) }));
	let out_of_the_image = [
		Anchor::ImagePoint { x: 1.01, y: 0.5 },
		Anchor::ImagePoint { x: 0.5, y: -0.01 },
		Anchor::ImageZone { x: 0.5, y: 0.5, width: 1.5, height: 0.2 },
		Anchor::ImageZone { x: 0.5, y: 0.5, width: 0.2, height: -0.2 },
	];
	for anchor in out_of_the_image {
		assert_eq!(
			opened(COVER, anchor.clone()).await,
			Err(LibraryError::InvalidAnchor { name: named(COVER) }),
			"{anchor:?}"
		);
	}
	let backwards =
		Anchor::Passage { block_id: named("para01"), quote: named("the beta"), start: 13, end: 5 };
	assert_eq!(
		opened(NOTES, backwards).await,
		Err(LibraryError::InvalidAnchor { name: named(NOTES) })
	);
	assert_eq!(
		shelf.opened_saying(NOTES, block("head01"), said(person(BEA), " \n", &[])).await,
		Err(LibraryError::BlankComment)
	);
	assert_eq!(shelf.stored_rows("library_comment_threads").await, 0);
}

async fn refused_for_its_missing_target(name: &str, anchor: Anchor, target: &str) {
	let shelf = Shelf::of("missing-target").await;

	let opened = shelf.opened_saying(name, anchor, said(person(BEA), "Here", &[])).await;

	assert_eq!(
		opened,
		Err(LibraryError::MissingTarget { name: name.to_owned(), target: target.to_owned() })
	);
	assert_eq!(shelf.stored_rows("library_comment_threads").await, 0);
	assert_eq!(shelf.stored_rows("library_comments").await, 0);
}

#[tokio::test]
async fn a_thread_on_a_block_the_document_does_not_hold_is_refused_and_stores_nothing() {
	refused_for_its_missing_target(NOTES, block("absent"), "absent").await;
}

#[tokio::test]
async fn a_thread_on_a_passage_of_a_block_the_document_does_not_hold_is_refused() {
	refused_for_its_missing_target(NOTES, passage("absent", "the beta"), "absent").await;
}

#[tokio::test]
async fn a_thread_on_a_passage_whose_quote_is_not_in_its_block_is_refused() {
	refused_for_its_missing_target(NOTES, passage("head01", "the beta"), "head01").await;
}

#[tokio::test]
async fn a_thread_on_a_node_the_board_does_not_hold_is_refused_and_stores_nothing() {
	refused_for_its_missing_target(PLAN, node("absent"), "absent").await;
}

#[tokio::test]
async fn the_host_comments_without_an_account_as_the_person_standing_for_the_host() {
	let shelf = Shelf::of("host-author").await;

	let created = shelf.created_by(Caller::Host).await.expect("the host comments");
	shelf.replied_by(Caller::Host, &created.id).await.expect("the host replies");
	let read = shelf.threads(NOTES).await.expect("the threads read");

	let authors: Vec<_> = read[0].comments.iter().map(|comment| &comment.author).collect();
	assert_eq!(authors, [&person(COMMENT_HOST_AUTHOR_ID), &person(COMMENT_HOST_AUTHOR_ID)]);
}

#[tokio::test]
async fn a_relayed_caller_nobody_vouches_for_is_refused_and_stores_nothing() {
	let shelf = Shelf::of("unknown-author").await;
	let by_the_host = shelf.created_by(Caller::Host).await.expect("the host comments");

	let created = shelf.created_by(Caller::Relayed(None)).await;
	let replied = shelf.replied_by(Caller::Relayed(None), &by_the_host.id).await;
	let resolved = shelf.resolved_by(Caller::Relayed(None), NOTES, &by_the_host.id).await;

	assert_eq!(created, Err(LibraryError::UnknownAuthor));
	assert_eq!(replied, Err(LibraryError::UnknownAuthor));
	assert_eq!(resolved, Err(LibraryError::UnknownAuthor));
	assert_eq!(shelf.threads(NOTES).await, Ok(vec![by_the_host]));
	assert_eq!(shelf.stored_rows("library_comments").await, 1);
}

#[tokio::test]
async fn a_comment_mentioning_an_agent_of_the_space_starts_one_turn_carrying_the_thread_and_its_target(
) {
	let shelf = Shelf::of("summons").await;
	let started = shelf.recording_turns();
	let nyx = shelf.an_agent("Nyx").await;
	let kinds = [(NOTES, "document"), (COVER, "image"), (PLAN, "board")];
	let target_texts = [Some("Launch"), Some("Ship the beta on Friday."), None, None, None, None];

	for ((name, anchor), target_text) in the_six_anchors().into_iter().zip(target_texts) {
		let opened = shelf.mentioning(name, anchor.clone(), &nyx).await;
		let turns = taken(&started);

		assert_eq!(turns.len(), 1, "{anchor:?}");
		let turn = &turns[0];
		assert_eq!(
			(turn.space_id.as_str(), turn.item_name.as_str(), turn.thread_id.as_str()),
			(shelf.space_id.as_str(), name, opened.id.as_str())
		);
		assert_eq!(turn.agent_id, nyx, "{anchor:?}");
		assert!(turn.prompt.contains(&format!("threadId {:?}", opened.id)), "{}", turn.prompt);
		assert_eq!(turn.prompt.matches(UNTRUSTED_OPEN).count(), 1, "{}", turn.prompt);
		let briefed = briefed_in(&turn.prompt);
		let kind = kinds.iter().find(|(held, _)| *held == name).map(|(_, kind)| *kind);
		assert_eq!(briefed["itemName"], json!(name));
		assert_eq!(briefed["itemKind"], json!(kind));
		assert_eq!(briefed["threadId"], json!(opened.id));
		assert_eq!(briefed["state"], json!("open"));
		assert_eq!(briefed["target"], json!(anchor));
		assert_eq!(briefed["targetMissing"], json!(false));
		assert_eq!(briefed["comments"], json!(opened.comments));
		match target_text {
			Some(text) => assert!(
				briefed["targetText"].as_str().is_some_and(|held| held.contains(text)),
				"{briefed}"
			),
			None => assert_eq!(briefed["targetText"], Value::Null, "{anchor:?}"),
		}
	}
}

#[tokio::test]
async fn a_reply_mentioning_an_agent_starts_one_turn_carrying_every_comment_in_order() {
	let shelf = Shelf::of("summons-reply").await;
	let started = shelf.recording_turns();
	let nyx = shelf.an_agent("Nyx").await;
	let opened = shelf.opened_saying(NOTES, block("para01"), said(person(BEA), "Too long", &[]));
	let opened = opened.await.expect("the thread opens");
	let after_the_opening = taken(&started).len();

	let reply = said(person(BEA), "Shorten it", &[agent(&nyx)]);
	shelf.replied(NOTES, &opened.id, reply).await.expect("the reply lands");
	let turns = taken(&started);

	assert_eq!(after_the_opening, 0, "a comment without a mention started a turn");
	assert_eq!(turns.len(), 1);
	assert_eq!((turns[0].thread_id.as_str(), turns[0].agent_id.as_str()), (&*opened.id, &*nyx));
	let said_in_order: Vec<Value> = briefed_in(&turns[0].prompt)["comments"]
		.as_array()
		.expect("the comments are listed")
		.iter()
		.map(|comment| comment["text"].clone())
		.collect();
	assert_eq!(said_in_order, [json!("Too long"), json!("Shorten it")]);
}

#[tokio::test]
async fn one_turn_starts_per_agent_of_the_space_mentioned_and_none_for_anyone_else() {
	let shelf = Shelf::of("summons-each").await;
	let started = shelf.recording_turns();
	let nyx = shelf.an_agent("Nyx").await;
	let bean = shelf.an_agent("Bean").await;
	let elsewhere = a_space(&shelf.app, "Elsewhere").await;
	let stranger = shelf.an_agent_of(&elsewhere, "Stranger").await;
	let opened_mentioning = |mentions: Vec<LibraryCommentParty>| {
		shelf.opened_saying(NOTES, block("head01"), said(person(BEA), "Look", &mentions))
	};

	let nobody = opened_mentioning(Vec::new()).await.expect("the thread opens");
	opened_mentioning(vec![person(BEA)]).await.expect("the thread opens");
	opened_mentioning(vec![agent(&stranger), agent("bot-unknown")])
		.await
		.expect("the thread opens");
	let without_an_agent_of_the_space = taken(&started).len();
	let both = opened_mentioning(vec![
		agent(&nyx),
		agent(&bean),
		agent(&nyx),
		person(BEA),
		agent(&stranger),
	])
	.await
	.expect("the thread opens");
	let mut summoned: Vec<(String, String)> =
		taken(&started).into_iter().map(|turn| (turn.thread_id, turn.agent_id)).collect();
	summoned.sort();
	let mut expected = vec![(both.id.clone(), nyx.clone()), (both.id.clone(), bean.clone())];
	expected.sort();
	let mut held = shelf.agent_turns().await;
	held.sort_by(|one, other| one.agent_id.cmp(&other.agent_id));
	let mut held_working = vec![working(&both.id, &nyx), working(&both.id, &bean)];
	held_working.sort_by(|one, other| one.agent_id.cmp(&other.agent_id));

	assert_eq!(without_an_agent_of_the_space, 0);
	assert_eq!(summoned, expected);
	assert_eq!(held, held_working);
	assert!(held.iter().all(|turn| turn.thread_id != nobody.id));
}

#[tokio::test]
async fn the_reply_of_the_agent_lands_in_the_thread_under_its_name_announced_and_starts_no_turn() {
	let shelf = Shelf::of("agent-reply").await;
	let started = shelf.recording_turns();
	let nyx = shelf.an_agent("Nyx").await;
	let opened = shelf.mentioning(NOTES, passage("para01", "the beta"), &nyx).await;
	let summoned = taken(&started);
	let room = shelf.room_of(&opened, &nyx).await;
	let host = shelf.host_of(&room, &nyx);
	let replies = shelf.database().library();
	let of_the_agent = || AgentOfThread { thread_id: opened.id.clone(), agent_id: nyx.clone() };
	let had_replied = replies.agent_replied_from(of_the_agent(), 1).await;
	let (told, heard) = mpsc::channel();
	shelf.app.listen_any(COMMENT_THREAD_CHANGED_EVENT, move |event| {
		let changed: LibraryCommentThreadChanged =
			serde_json::from_str(event.payload()).expect("a payload");
		told.send(changed).expect("the test listens");
	});
	let on_the_thread = json!({ "name": NOTES, "threadId": opened.id });
	let saying = |text: &str| json!({ "name": NOTES, "threadId": opened.id, "text": text });

	let listed = host.served(Operation::CommentList, json!({ "name": NOTES })).await;
	let read = host.served(Operation::CommentRead, on_the_thread).await;
	let replied = host.served(Operation::CommentReply, saying("Done.")).await;
	let blank = host.served(Operation::CommentReply, saying(" ")).await;
	let gone = json!({ "name": NOTES, "threadId": "gone", "text": "Done." });
	let unknown = host.served(Operation::CommentReply, gone).await;

	let threads = shelf.threads(NOTES).await.expect("the threads read");
	let announced = heard.recv_timeout(Duration::from_secs(5)).expect("the reply was announced");
	assert_eq!(
		listed.expect("the threads are listed"),
		json!([{
			"threadId": opened.id,
			"state": "open",
			"target": opened.anchor,
			"targetMissing": false,
			"comments": 1,
			"opening": "Tighten this"
		}])
	);
	assert_eq!(read.expect("the thread is read"), briefed_in(&summoned[0].prompt));
	assert_eq!(replied.expect("the reply lands"), json!({ "threadId": opened.id, "comments": 2 }));
	assert!(blank.is_err(), "a blank reply was stored");
	assert!(unknown.is_err(), "a reply landed in a thread the item does not hold");
	assert_eq!(threads.len(), 1);
	let comments = &threads[0].comments;
	assert_eq!(comments.len(), 2);
	assert_eq!(
		(&comments[1].author, comments[1].text.as_str(), comments[1].mentions.len()),
		(&agent(&nyx), "Done.", 0)
	);
	assert_eq!(announced.thread, threads[0]);
	assert!(heard.recv_timeout(Duration::from_millis(100)).is_err());
	assert!(taken(&started).is_empty(), "the reply of an agent started a turn");
	assert!(!had_replied.expect("the replies read"), "a reply was read before the agent spoke");
	assert!(replies.agent_replied_from(of_the_agent(), 1).await.expect("the replies read"));
	assert!(!replies.agent_replied_from(of_the_agent(), 2).await.expect("the replies read"));
}

#[tokio::test]
async fn the_room_behind_a_thread_is_listed_nowhere_and_leaves_with_the_item() {
	let shelf = Shelf::of("room").await;
	shelf.recording_turns();
	let nyx = shelf.an_agent("Nyx").await;
	let opened = shelf.mentioning(NOTES, block("head01"), &nyx).await;
	let conversations = shelf.database().conversations();

	let room = shelf.room_of(&opened, &nyx).await;
	let again = shelf.room_of(&opened, &nyx).await;
	let kind = conversations.kind(room.clone()).await.expect("the kind reads");
	let of_the_space =
		conversations.conversations(shelf.space_id.clone()).await.expect("the rooms list");
	let in_the_feed =
		conversations.conversation_in_page(room.clone()).await.expect("the feed reads");
	let listed = conversations.listed_conversation(room.clone()).await.expect("the list reads");
	let seats = conversations.seats(room.clone()).await.expect("the seats read");
	shelf.said_in(&room, &nyx, "Tightened the heading").await;
	let found = shelf
		.database()
		.search()
		.messages(
			MessageSearchQuery {
				text: "Tightened".to_owned(),
				space_id: shelf.space_id.clone(),
				kind: None,
			},
			None,
		)
		.await
		.expect("the messages are searched");
	let scope =
		CatalogueScope { query: String::new(), space_id: shelf.space_id.clone(), kind: None };
	let catalogued = shelf.database().catalogue().search(scope, None).await;
	let catalogued = catalogued.expect("the catalogue is searched");
	let is_shown_to_a_member = shelf
		.database()
		.space_children()
		.shows_conversation(shelf.space_id.clone(), room.clone(), ChatOwner::Host)
		.await
		.expect("the reach reads");
	library_delete(
		shelf.app.handle().clone(),
		shelf.app.state(),
		shelf.space_id.clone(),
		NOTES.to_owned(),
	)
	.await
	.expect("the item is deleted");

	assert_eq!(again, room, "a second turn of the agent on the thread opened another room");
	assert_eq!(kind.as_deref(), Some("comment"));
	assert!(of_the_space.iter().all(|held| held.id != room));
	assert!(in_the_feed.is_none(), "the room is in the sidebar feed");
	assert!(listed.is_none(), "the room is in the conversation list");
	assert!(found.is_empty(), "a message of the room is found by the search: {found:?}");
	assert!(catalogued.chats.iter().all(|chat| chat.conversation_id != room));
	assert!(!is_shown_to_a_member, "the room is reachable as a conversation of the Space");
	assert_eq!(seats.iter().map(|seat| seat.bot_id.as_str()).collect::<Vec<_>>(), [nyx.as_str()]);
	assert_eq!(conversations.kind(room).await.expect("the kind reads"), None);
}

#[tokio::test]
async fn a_turn_that_cannot_run_records_a_failure_on_the_thread_and_clears_the_working_state() {
	let shelf = Shelf::of("turn-failed").await;
	let nyx = shelf.an_agent("Nyx").await;
	let (told, heard) = mpsc::channel();
	shelf.app.listen_any(COMMENT_AGENT_TURNS_CHANGED_EVENT, move |event| {
		let changed: LibraryCommentAgentTurnsChanged =
			serde_json::from_str(event.payload()).expect("a payload");
		told.send(changed).expect("the test listens");
	});

	let opened = shelf.mentioning(NOTES, block("head01"), &nyx).await;
	let changed = LibraryCommentAgentTurnsChanged {
		space_id: shelf.space_id.clone(),
		thread_id: opened.id.clone(),
		agent_id: nyx.clone(),
	};
	let announced: Vec<_> = (0..2)
		.map(|_| heard.recv_timeout(Duration::from_secs(5)).expect("a change was announced"))
		.collect();
	let after_the_turn = shelf.agent_turns().await;
	fail_comment_turns_cut_by_a_quit(shelf.app.handle()).await;
	let after_a_start_with_nothing_running = shelf.agent_turns().await;
	let announced_by_that_start = heard.recv_timeout(Duration::from_millis(100));
	shelf.room_of(&opened, &nyx).await;
	let after_a_new_turn_took_the_room = shelf.agent_turns().await;

	assert_eq!(announced, [changed.clone(), changed]);
	assert_eq!(after_a_start_with_nothing_running, after_the_turn);
	assert!(announced_by_that_start.is_err(), "a settled turn was still marked running");
	assert_eq!(after_the_turn.len(), 1, "{after_the_turn:?}");
	assert_eq!(
		(after_the_turn[0].thread_id.as_str(), after_the_turn[0].agent_id.as_str()),
		(opened.id.as_str(), nyx.as_str())
	);
	assert!(matches!(
		after_the_turn[0].state,
		LibraryCommentAgentTurnState::Failed {
			reason: LibraryCommentTurnFailure::TurnFailed,
			failed_at: 1..
		}
	));
	assert_eq!(after_a_new_turn_took_the_room, []);
}

#[tokio::test]
async fn a_turn_left_running_by_a_quit_reads_failed_once_the_app_starts_again() {
	let shelf = Shelf::of("turn-cut").await;
	let nyx = shelf.an_agent("Nyx").await;
	let bean = shelf.an_agent("Bean").await;
	let cut = shelf.opened(NOTES, block("head01")).await;
	let settled = shelf.opened(NOTES, block("para01")).await;
	let (told, heard) = mpsc::channel();
	shelf.app.listen_any(COMMENT_AGENT_TURNS_CHANGED_EVENT, move |event| {
		let changed: LibraryCommentAgentTurnsChanged =
			serde_json::from_str(event.payload()).expect("a payload");
		told.send(changed).expect("the test listens");
	});
	shelf.room_of(&cut, &nyx).await;
	shelf.room_of(&settled, &bean).await;
	let of_the_settled = AgentOfThread { thread_id: settled.id.clone(), agent_id: bean.clone() };
	shelf.database().library().agent_turn_replied(of_the_settled).await.expect("the turn settles");
	let with_no_live_turn = shelf.agent_turns().await;

	fail_comment_turns_cut_by_a_quit(shelf.app.handle()).await;
	let after_the_start = shelf.agent_turns().await;
	fail_comment_turns_cut_by_a_quit(shelf.app.handle()).await;
	let after_another_start = shelf.agent_turns().await;

	assert_eq!(with_no_live_turn, [], "a persisted running mark read as a working turn");
	assert_eq!(after_the_start.len(), 1, "{after_the_start:?}");
	assert_eq!(
		(after_the_start[0].thread_id.as_str(), after_the_start[0].agent_id.as_str()),
		(cut.id.as_str(), nyx.as_str())
	);
	assert!(matches!(
		after_the_start[0].state,
		LibraryCommentAgentTurnState::Failed {
			reason: LibraryCommentTurnFailure::TurnFailed,
			failed_at: 8..
		}
	));
	assert_eq!(after_another_start, after_the_start);
	assert_eq!(
		heard.recv_timeout(Duration::from_secs(5)).expect("the failure was announced"),
		LibraryCommentAgentTurnsChanged {
			space_id: shelf.space_id.clone(),
			thread_id: cut.id.clone(),
			agent_id: nyx.clone(),
		}
	);
	assert!(heard.recv_timeout(Duration::from_millis(100)).is_err());
}

type Raised = Arc<Mutex<Vec<Notice>>>;

fn titles(raised: &Raised) -> Vec<String> {
	let raised = raised.lock().unwrap_or_else(PoisonError::into_inner);
	raised.iter().map(|notice| notice.title.clone()).collect()
}

impl Shelf {
	fn counting_notices(&self) -> Raised {
		let raised = Raised::default();
		let kept = Arc::clone(&raised);
		self.app.manage(SystemNotifications::raising_with(move |notice| {
			kept.lock().unwrap_or_else(PoisonError::into_inner).push(notice);
		}));
		raised
	}

	fn hearing_mentions(&self) -> mpsc::Receiver<LibraryCommentMentioned> {
		let (told, heard) = mpsc::channel();
		self.app.listen_any(COMMENT_MENTIONED_EVENT, move |event| {
			let mentioned = serde_json::from_str(event.payload()).expect("a payload");
			told.send(mentioned).expect("the test listens");
		});
		heard
	}

	async fn host_named(&self, display_name: &str) {
		let user = self.database().user();
		let mut preferences = user.preferences().await.expect("the preferences read");
		preferences.display_name = display_name.to_owned();
		user.set_preferences(preferences).await.expect("the host is named");
	}
}

#[tokio::test]
async fn a_host_comment_mentioning_a_person_tells_the_space_once_per_comment_and_notifies_nobody_on_the_host(
) {
	let shelf = Shelf::of("mention-told").await;
	shelf.host_named("Ada").await;
	let (raised, heard) = (shelf.counting_notices(), shelf.hearing_mentions());
	let host = person(COMMENT_HOST_AUTHOR_ID);
	let named_twice = [person(BEA), agent(NYX), person(BEA)];

	let patience = Duration::from_secs(5);
	let opening = said(host.clone(), "Look here\nand there", &named_twice);
	let opened = shelf.opened_saying(NOTES, block("head01"), opening).await.expect("it opens");
	let told_of_the_opening = heard.recv_timeout(patience);
	let reply = said(host, "Again", &[person(BEA)]);
	shelf.replied(NOTES, &opened.id, reply).await.expect("the reply lands");
	let told_of_the_reply = heard.recv_timeout(patience);
	shelf.resolved(NOTES, &opened.id).await.expect("the thread resolves");
	let reopened = shelf.reopened(NOTES, &opened.id).await.expect("the thread reopens");

	let told = |text: &str| LibraryCommentMentioned {
		space_id: shelf.space_id.clone(),
		item_name: NOTES.to_owned(),
		item_kind: LibraryItemKind::Document,
		thread_id: opened.id.clone(),
		author_name: "Ada".to_owned(),
		text: text.to_owned(),
		people: vec![BEA.to_owned()],
	};
	assert_eq!(told_of_the_opening, Ok(told("Look here\nand there")));
	assert_eq!(told_of_the_reply, Ok(told("Again")));
	assert!(heard.recv_timeout(Duration::from_millis(100)).is_err());
	assert_eq!(titles(&raised), Vec::<String>::new());
	assert_eq!(shelf.counts().await, [(NOTES.to_owned(), 1)]);
	assert_eq!(reopened.comments[0].mentions, named_twice);
}

#[tokio::test]
async fn a_comment_naming_no_other_person_tells_and_notifies_nobody() {
	let shelf = Shelf::of("mention-silent").await;
	shelf.host_named("Ada").await;
	let (raised, heard) = (shelf.counting_notices(), shelf.hearing_mentions());
	let host = person(COMMENT_HOST_AUTHOR_ID);
	let naming = |named: &[LibraryCommentParty]| said(host.clone(), "Tighten this", named);

	let opened = shelf.opened_saying(NOTES, block("head01"), naming(&[])).await.expect("it opens");
	shelf.replied(NOTES, &opened.id, naming(&[agent(NYX)])).await.expect("the reply lands");
	shelf
		.replied(NOTES, &opened.id, naming(std::slice::from_ref(&host)))
		.await
		.expect("the reply lands");

	assert!(heard.recv_timeout(Duration::from_millis(100)).is_err());
	assert_eq!(titles(&raised), Vec::<String>::new());
}

#[tokio::test]
async fn a_mention_whose_author_has_no_name_to_show_stays_stored_is_logged_and_tells_nobody() {
	capturing();
	let shelf = Shelf::of("mention-unnamed").await;
	let (raised, heard) = (shelf.counting_notices(), shelf.hearing_mentions());

	let opening = said(person(BEA), "Look here", &[person(COMMENT_HOST_AUTHOR_ID)]);
	let opened = shelf.opened_saying(NOTES, block("head01"), opening).await.expect("it opens");
	let logged = warnings_naming(&opened.id).await;

	let unnamed = format!(
		"the mention in comment thread {} of space {} notified nobody: its author has no name to show",
		opened.id, shelf.space_id
	);
	assert_eq!(logged, [unnamed]);
	assert!(heard.try_recv().is_err());
	assert_eq!(titles(&raised), Vec::<String>::new());
	assert_eq!(shelf.threads(NOTES).await, Ok(vec![opened]));
}

#[tokio::test]
async fn the_person_a_mention_names_gets_one_notice_and_its_click_hands_the_thread_to_the_window() {
	let shelf = Shelf::of("mention-raised").await;
	let raised = shelf.counting_notices();
	let window = WebviewWindowBuilder::new(shelf.app.handle(), "main", Default::default())
		.build()
		.expect("the window builds");
	let (told, clicked) = mpsc::channel();
	window.listen(COMMENT_MENTION_OPENED_EVENT, move |event| {
		told.send(event.payload().to_owned()).expect("the test listens");
	});
	let mentioned = LibraryCommentMentioned {
		space_id: "work".to_owned(),
		item_name: NOTES.to_owned(),
		item_kind: LibraryItemKind::Document,
		thread_id: "t-1".to_owned(),
		author_name: "Ada".to_owned(),
		text: "\n  Look here  \nand there".to_owned(),
		people: vec![BEA.to_owned()],
	};
	let on_the_computer_of = |person_id: &str| PersonHere {
		person_id: person_id.to_owned(),
		space_id: "joined-1".to_owned(),
	};

	raised_for(shelf.app.handle(), &on_the_computer_of("account-cyd"), mentioned.clone());
	raised_for(shelf.app.handle(), &on_the_computer_of(BEA), mentioned);

	let mut raised = mem::take(&mut *raised.lock().unwrap_or_else(PoisonError::into_inner));
	assert_eq!(raised.len(), 1);
	let notice = raised.remove(0);
	assert_eq!(notice.title, "Ada mentioned you in notes.md");
	assert_eq!(notice.body, "Look here");
	notifications::activated(shelf.app.handle(), notice.clicked);
	let clicked = clicked.recv_timeout(Duration::from_secs(5)).expect("the window hears");
	assert_eq!(
		serde_json::from_str::<Value>(&clicked).expect("a payload"),
		json!({
			"spaceId": "joined-1",
			"itemName": NOTES,
			"itemKind": "document",
			"threadId": "t-1"
		})
	);
}
