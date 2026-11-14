use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map, ReadTxn, Transact, Update};

use super::{state_dir, state_path, Documents};
use crate::board::{export_canvas, import_canvas, read_board, write_board, Board};
use crate::library::contract::LibraryError;
use crate::library::space_dir;
use crate::removed_on_drop::RemovedOnDrop;

const SPACE: &str = "s1";

const BOARD: &str = "plan.canvas";

type Replaced = Arc<Mutex<Vec<(String, String)>>>;

fn canvas_at(x: i64) -> String {
	format!(
		r#"{{"nodes":[{{"id":"a","type":"text","text":"first","x":{x},"y":0,"width":10,"height":10}}],"edges":[]}}"#
	)
}

fn board_at(x: i64) -> Board {
	import_canvas(&canvas_at(x)).expect("the canvas imports")
}

fn written_at(x: i64) -> String {
	export_canvas(&board_at(x)).expect("the board exports")
}

fn a_root_with_a_board() -> RemovedOnDrop {
	let root =
		RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-board-{}", Uuid::new_v4())));
	let dir = space_dir(&root, SPACE);
	fs::create_dir_all(&dir).expect("the space folder lands");
	fs::write(dir.join(BOARD), canvas_at(0)).expect("the board lands");
	root
}

fn on_disk(root: &Path, name: &str) -> String {
	fs::read_to_string(space_dir(root, SPACE).join(name)).expect("the board reads")
}

fn stored(root: &Path, name: &str) -> Option<Vec<u8>> {
	fs::read(state_path(root, SPACE, name)).ok()
}

fn doc_of(state: &[u8]) -> Doc {
	let doc = Doc::new();
	doc.transact_mut()
		.apply_update(Update::decode_v1(state).expect("the state decodes"))
		.expect("the state applies");
	doc
}

fn board_of(state: &[u8]) -> Board {
	read_board(&doc_of(state)).expect("the board reads")
}

fn moved_to(documents: &Documents, root: &Path, x: i64) -> Vec<u8> {
	let served = documents.open(root, SPACE, BOARD).expect("the board opens").state;
	let member = doc_of(&served);
	let before = member.transact().state_vector();
	write_board(&member, &board_at(x));
	let update = member.transact().encode_state_as_update_v1(&before);
	update
}

fn applied(documents: &Documents, root: &Path, update: &[u8]) {
	documents.apply(root, SPACE, BOARD, update, |_| {}).expect("the update applies");
}

fn recording() -> (Documents, Replaced) {
	let replaced = Replaced::default();
	let heard = Arc::clone(&replaced);
	let documents = Documents::new(
		move |space_id, name| {
			heard.lock().expect("the record locks").push((space_id.to_owned(), name.to_owned()));
		},
		|_, _, _| {},
	);
	(documents, replaced)
}

fn replacements(replaced: &Replaced) -> Vec<(String, String)> {
	replaced.lock().expect("the record locks").clone()
}

async fn after(milliseconds: u64) {
	tokio::time::sleep(Duration::from_millis(milliseconds)).await;
}

#[test]
fn opening_a_board_answers_its_full_state() {
	let root = a_root_with_a_board();

	let opened = Documents::default().open(&root, SPACE, BOARD).expect("the board opens");

	assert_eq!(board_of(&opened.state), board_at(0));
	assert_eq!(opened.host_edit, None);
}

#[test]
fn a_board_without_a_stored_state_is_imported_once() {
	let root = a_root_with_a_board();

	let first = Documents::default().open(&root, SPACE, BOARD).expect("the board opens").state;
	let kept = stored(&root, BOARD).expect("the state is stored");
	let reopened = Documents::default().open(&root, SPACE, BOARD).expect("the board opens").state;

	assert_eq!(board_of(&kept), board_at(0));
	assert_eq!(first, kept);
	assert_eq!(reopened, kept);
	assert_eq!(on_disk(&root, BOARD), canvas_at(0));
}

#[test]
fn a_canvas_that_fails_to_import_is_refused_and_stores_no_state() {
	let root = a_root_with_a_board();
	fs::write(space_dir(&root, SPACE).join(BOARD), "{ not a board").expect("the file lands");

	let refused = Documents::default().open(&root, SPACE, BOARD).map(|opened| opened.state);

	assert!(
		matches!(&refused, Err(LibraryError::InvalidBoard { name, .. }) if name == BOARD),
		"{refused:?}"
	);
	assert_eq!(stored(&root, BOARD), None);
}

#[tokio::test(start_paused = true)]
async fn an_update_is_announced_before_any_write_and_written_500_ms_after_the_last_one() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	let update = moved_to(&documents, &root, 40);
	let state_before = stored(&root, BOARD);
	let mut announced = Vec::new();
	let mut change = Vec::new();

	documents
		.apply(&root, SPACE, BOARD, &update, |applied| {
			announced.push((applied.name.clone(), on_disk(&root, BOARD), stored(&root, BOARD)));
			change = applied.change.clone();
		})
		.expect("the update applies");
	after(499).await;
	let while_quiet = (on_disk(&root, BOARD), stored(&root, BOARD));
	after(2).await;

	let caught_up = doc_of(state_before.as_deref().expect("the state is stored on open"));
	caught_up
		.transact_mut()
		.apply_update(Update::decode_v1(&change).expect("decodes"))
		.expect("applies");
	assert_eq!(read_board(&caught_up), Ok(board_at(40)));
	assert_eq!(announced, [(BOARD.to_owned(), canvas_at(0), state_before.clone())]);
	assert_eq!(while_quiet, (canvas_at(0), state_before));
	assert_eq!(on_disk(&root, BOARD), written_at(40));
	assert_eq!(import_canvas(&on_disk(&root, BOARD)), Ok(board_at(40)));
	assert_eq!(board_of(&stored(&root, BOARD).expect("the state is stored")), board_at(40));
}

#[tokio::test(start_paused = true)]
async fn steady_updates_are_written_at_most_once_every_2_s() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	let mut seen = canvas_at(0);
	let mut writes = Vec::new();

	for step in 1..=13 {
		applied(&documents, &root, &moved_to(&documents, &root, step * 10));
		after(300).await;
		let now = on_disk(&root, BOARD);
		if now != seen {
			writes.push((step * 300, now.clone()));
			seen = now;
		}
	}
	after(201).await;

	assert_eq!(writes, [(2100, written_at(70))]);
	assert_eq!(on_disk(&root, BOARD), written_at(130));
}

#[tokio::test(start_paused = true)]
async fn an_outside_edit_of_a_stored_board_gives_way_to_its_live_state_on_open() {
	let root = a_root_with_a_board();
	Documents::default().open(&root, SPACE, BOARD).expect("the board opens");
	fs::write(space_dir(&root, SPACE).join(BOARD), canvas_at(99)).expect("the outside edit lands");
	let (documents, replaced) = recording();

	let opened = documents.open(&root, SPACE, BOARD).expect("the board opens").state;
	documents.open(&root, SPACE, BOARD).expect("the board opens again");

	assert_eq!(board_of(&opened), board_at(0));
	assert_eq!(on_disk(&root, BOARD), written_at(0));
	assert_eq!(replacements(&replaced), [(SPACE.to_owned(), BOARD.to_owned())]);
}

#[tokio::test(start_paused = true)]
async fn an_outside_edit_while_a_write_is_pending_gives_way_to_the_live_state() {
	let root = a_root_with_a_board();
	let (documents, replaced) = recording();
	applied(&documents, &root, &moved_to(&documents, &root, 40));
	fs::write(space_dir(&root, SPACE).join(BOARD), canvas_at(99)).expect("the outside edit lands");

	after(501).await;

	assert_eq!(on_disk(&root, BOARD), written_at(40));
	assert_eq!(replacements(&replaced), [(SPACE.to_owned(), BOARD.to_owned())]);
}

#[tokio::test(start_paused = true)]
async fn a_refused_update_leaves_the_board_and_both_files_unchanged() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	let served = documents.open(&root, SPACE, BOARD).expect("the board opens").state;
	let state_before = stored(&root, BOARD);
	let member = doc_of(&served);
	let nodes = member.get_or_insert_map("nodes");
	let before = member.transact().state_vector();
	nodes.insert(&mut member.transact_mut(), "broken", "not a node");
	let breaking = member.transact().encode_state_as_update_v1(&before);
	let mut announced = 0;

	let undecodable = documents.apply(&root, SPACE, BOARD, &[1, 2, 3], |_| announced += 1);
	let invalid = documents.apply(&root, SPACE, BOARD, &breaking, |_| announced += 1);
	after(3000).await;

	assert!(matches!(undecodable, Err(LibraryError::Undecodable { .. })), "{undecodable:?}");
	assert!(matches!(invalid, Err(LibraryError::InvalidBoard { .. })), "{invalid:?}");
	assert_eq!(announced, 0);
	assert_eq!(documents.open(&root, SPACE, BOARD).expect("the board opens").state, served);
	assert_eq!(on_disk(&root, BOARD), canvas_at(0));
	assert_eq!(stored(&root, BOARD), state_before);
}

#[tokio::test(start_paused = true)]
async fn a_failed_write_stays_pending_and_lands_on_the_next_flush() {
	use std::os::unix::fs::PermissionsExt;

	let root = a_root_with_a_board();
	let documents = Documents::default();
	applied(&documents, &root, &moved_to(&documents, &root, 40));
	let states = state_dir(&root, SPACE);
	fs::set_permissions(&states, fs::Permissions::from_mode(0o555)).expect("the folder locks");

	after(501).await;
	let while_refused = on_disk(&root, BOARD);
	fs::set_permissions(&states, fs::Permissions::from_mode(0o755)).expect("the folder unlocks");
	documents.write_pending_boards();

	assert_eq!(while_refused, canvas_at(0));
	assert_eq!(on_disk(&root, BOARD), written_at(40));
	assert_eq!(board_of(&stored(&root, BOARD).expect("the state is stored")), board_at(40));
}

#[tokio::test(start_paused = true)]
async fn every_pending_board_is_written_on_exit_without_waiting() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	applied(&documents, &root, &moved_to(&documents, &root, 40));

	documents.write_pending_boards();

	assert_eq!(on_disk(&root, BOARD), written_at(40));
}

#[tokio::test(start_paused = true)]
async fn a_pending_write_follows_a_rename_and_never_lands_under_the_former_name() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	applied(&documents, &root, &moved_to(&documents, &root, 40));

	documents.rename(&root, SPACE, BOARD, "roadmap.canvas", |_| {}).expect("the rename lands");
	after(501).await;

	assert!(!space_dir(&root, SPACE).join(BOARD).exists());
	assert_eq!(stored(&root, BOARD), None);
	assert_eq!(on_disk(&root, "roadmap.canvas"), written_at(40));
	assert_eq!(
		board_of(&stored(&root, "roadmap.canvas").expect("the state is stored")),
		board_at(40)
	);
}

#[tokio::test(start_paused = true)]
async fn a_pending_write_is_dropped_when_its_board_is_deleted() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	applied(&documents, &root, &moved_to(&documents, &root, 40));

	documents.delete(&root, SPACE, BOARD).expect("the board is deleted");
	after(3000).await;
	documents.write_pending_boards();

	assert!(!space_dir(&root, SPACE).join(BOARD).exists());
	assert_eq!(stored(&root, BOARD), None);
}

#[tokio::test(start_paused = true)]
async fn a_pending_write_is_dropped_when_its_space_is_forgotten() {
	let root = a_root_with_a_board();
	let documents = Documents::default();
	applied(&documents, &root, &moved_to(&documents, &root, 40));

	documents.forget(&root, SPACE).expect("the space is forgotten");
	after(3000).await;
	documents.write_pending_boards();

	assert_eq!(on_disk(&root, BOARD), canvas_at(0));
	assert_eq!(stored(&root, BOARD), None);
}
