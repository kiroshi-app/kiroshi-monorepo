use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use tauri::{Listener, Manager};

use super::*;
use crate::board::BoardEdit;
use crate::db;
use crate::library::commands::{
	library_comment_counts, library_comment_create, library_comment_reopen, library_comment_reply,
	library_comment_resolve, library_comment_threads, library_delete, library_rename_board,
	library_rename_document,
};
use crate::library::contract::{
	LibraryBoardPoint, LibraryCommentCount, COMMENT_THREAD_CHANGED_EVENT,
};
use crate::library::documents::BoardTarget;
use crate::library::root;
use crate::library::tests::{a_host, a_space, put, A_BOARD};
use crate::test_app::AppOfItsOwn;

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
		library_comment_resolve(
			self.app.handle().clone(),
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
		let target =
			BoardTarget { root: &self.root, space_id: &self.space_id, name: PLAN, writer: 1 };
		let removal = BoardEdit { removed_nodes: vec![id.to_owned()], ..BoardEdit::default() };
		documents(self.app.handle())
			.edit_board(&target, |_| Ok::<_, LibraryError>((removal, ())), |_| {})
			.expect("the node is removed");
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
		assert_eq!(
			resolved,
			LibraryCommentThread { state: LibraryCommentThreadState::Resolved, ..replied.clone() }
		);
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
	assert_eq!(
		shelf.resolved(NOTES, &on_a_removed_block.id).await,
		Ok(LibraryCommentThread {
			state: LibraryCommentThreadState::Resolved,
			..missing(on_a_removed_block)
		})
	);
	assert_eq!(shelf.stored_rows("library_comment_threads").await, 5);
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

	assert_eq!(created, Err(LibraryError::UnknownAuthor));
	assert_eq!(replied, Err(LibraryError::UnknownAuthor));
	assert_eq!(shelf.threads(NOTES).await, Ok(vec![by_the_host]));
	assert_eq!(shelf.stored_rows("library_comments").await, 1);
}
