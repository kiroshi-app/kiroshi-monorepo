use std::fs::{self, File};
use std::path::Path;
use std::time::{Duration, SystemTime};

use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Manager};
use uuid::Uuid;

use super::commands::{library_list, library_read_document};
use super::contract::{LibraryDocumentFormat, LibraryError, LibraryItemKind};
use super::*;
use crate::db;
use crate::removed_on_drop::RemovedOnDrop;
use crate::spaces::commands::space_delete;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const SPACE: &str = "s1";

fn temp_root() -> RemovedOnDrop {
	RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-library-{}", Uuid::new_v4())))
}

fn put(root: &Path, space_id: &str, name: &str, content: &[u8]) {
	let dir = space_dir(root, space_id);
	fs::create_dir_all(&dir).expect("the space folder lands");
	fs::write(dir.join(name), content).expect("the file lands");
}

fn touch(root: &Path, space_id: &str, name: &str, seconds: u64) {
	let file = File::options()
		.write(true)
		.open(space_dir(root, space_id).join(name))
		.expect("the file opens");
	file.set_modified(SystemTime::UNIX_EPOCH + Duration::from_secs(seconds))
		.expect("the modified time lands");
}

fn names(root: &Path, space_id: &str) -> Vec<String> {
	list(root, space_id).expect("the library lists").into_iter().map(|item| item.name).collect()
}

fn read(root: &Path, name: &str) -> Result<contract::LibraryDocument, LibraryError> {
	read_document(root, SPACE, name)
}

#[test]
fn an_absent_folder_lists_empty_and_creates_nothing() {
	let root = temp_root();

	assert!(list(&root, SPACE).expect("the library lists").is_empty());
	assert!(!root.exists());
}

#[test]
fn an_empty_folder_lists_empty() {
	let root = temp_root();
	fs::create_dir_all(space_dir(&root, SPACE)).expect("the space folder lands");

	assert!(list(&root, SPACE).expect("the library lists").is_empty());
}

#[test]
fn a_populated_folder_lists_every_accepted_file_and_nothing_else() {
	let root = temp_root();
	let accepted = [
		("a.png", LibraryItemKind::Image),
		("b.jpg", LibraryItemKind::Image),
		("c.jpeg", LibraryItemKind::Image),
		("d.gif", LibraryItemKind::Image),
		("e.webp", LibraryItemKind::Image),
		("f.md", LibraryItemKind::Document),
		("g.markdown", LibraryItemKind::Document),
		("h.txt", LibraryItemKind::Document),
		("I.PNG", LibraryItemKind::Image),
		("J.Md", LibraryItemKind::Document),
	];
	for (name, _) in accepted {
		put(&root, SPACE, name, b"12345");
		touch(&root, SPACE, name, 1_000);
	}
	put(&root, SPACE, ".hidden.md", b"hidden");
	put(&root, SPACE, "report.pdf", b"pdf");
	put(&root, SPACE, "no-extension", b"none");
	fs::create_dir_all(space_dir(&root, SPACE).join("nested.md")).expect("the subfolder lands");
	put(&root, SPACE, "nested.md/inner.md", b"inner");
	#[cfg(unix)]
	std::os::unix::fs::symlink(
		space_dir(&root, SPACE).join("f.md"),
		space_dir(&root, SPACE).join("link.md"),
	)
	.expect("the link lands");

	let items = list(&root, SPACE).expect("the library lists");

	let mut expected: Vec<(String, LibraryItemKind)> =
		accepted.iter().map(|(name, kind)| ((*name).to_owned(), *kind)).collect();
	expected.sort_by(|a, b| a.0.cmp(&b.0));
	assert_eq!(
		items.iter().map(|item| (item.name.clone(), item.kind)).collect::<Vec<_>>(),
		expected
	);
	for item in &items {
		assert_eq!(item.bytes, 5);
		assert_eq!(item.modified_at, 1_000_000);
		assert!(Path::new(&item.path).is_absolute());
		assert_eq!(Path::new(&item.path), space_dir(&root, SPACE).join(&item.name));
	}
}

#[test]
fn the_listing_runs_from_the_newest_then_by_name() {
	let root = temp_root();
	for (name, seconds) in [("old.md", 10), ("b.txt", 20), ("a.png", 20), ("new.md", 30)] {
		put(&root, SPACE, name, b"x");
		touch(&root, SPACE, name, seconds);
	}

	assert_eq!(names(&root, SPACE), ["new.md", "a.png", "b.txt", "old.md"]);
}

#[test]
fn two_spaces_never_see_each_other() {
	let root = temp_root();
	put(&root, "s1", "mine.md", b"mine");
	put(&root, "s2", "theirs.md", b"theirs");

	assert_eq!(names(&root, "s1"), ["mine.md"]);
	assert_eq!(names(&root, "s2"), ["theirs.md"]);
	assert_eq!(
		read_document(&root, "s1", "theirs.md"),
		Err(LibraryError::Missing { name: "theirs.md".to_owned() })
	);
}

#[test]
fn a_document_reads_with_its_format() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", "# Notes é".as_bytes());
	put(&root, SPACE, "plain.TXT", b"plain");

	let markdown = read(&root, "notes.md").expect("the document reads");
	let text = read(&root, "plain.TXT").expect("the document reads");

	assert_eq!(markdown.name, "notes.md");
	assert_eq!(markdown.format, LibraryDocumentFormat::Markdown);
	assert_eq!(markdown.content, "# Notes é");
	assert_eq!(text.format, LibraryDocumentFormat::Text);
	assert_eq!(text.content, "plain");
}

#[test]
fn a_name_that_leaves_the_folder_is_refused() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	put(&root, "s2", "theirs.md", b"theirs");

	for name in ["", ".", "..", "../s2/theirs.md", "nested/notes.md", "..\\s2\\theirs.md"] {
		assert_eq!(read(&root, name), Err(LibraryError::InvalidName { name: name.to_owned() }));
	}
}

#[cfg(unix)]
#[test]
fn a_link_out_of_the_folder_is_refused() {
	let root = temp_root();
	put(&root, "s2", "theirs.md", b"theirs");
	put(&root, SPACE, "notes.md", b"notes");
	let dir = space_dir(&root, SPACE);
	std::os::unix::fs::symlink(space_dir(&root, "s2").join("theirs.md"), dir.join("out.md"))
		.expect("the link lands");
	std::os::unix::fs::symlink(dir.join("notes.md"), dir.join("in.md")).expect("the link lands");

	assert_eq!(read(&root, "out.md"), Err(LibraryError::InvalidName { name: "out.md".to_owned() }));
	assert_eq!(read(&root, "in.md"), Err(LibraryError::Missing { name: "in.md".to_owned() }));
}

#[test]
fn each_failed_read_says_why() {
	let root = temp_root();
	put(&root, SPACE, "cover.png", b"png");
	put(&root, SPACE, "broken.txt", &[0xff, 0xfe, 0x00]);
	put(&root, SPACE, "report.pdf", b"pdf");
	put(&root, SPACE, ".hidden.md", b"hidden");
	fs::create_dir_all(space_dir(&root, SPACE).join("folder.md")).expect("the subfolder lands");
	let big = File::create(space_dir(&root, SPACE).join("big.md")).expect("the file lands");
	big.set_len(MAX_DOCUMENT_BYTES + 1).expect("the file grows");

	assert_eq!(read(&root, "gone.md"), Err(LibraryError::Missing { name: "gone.md".to_owned() }));
	assert_eq!(
		read(&root, "cover.png"),
		Err(LibraryError::NotADocument { name: "cover.png".to_owned() })
	);
	assert_eq!(
		read(&root, "broken.txt"),
		Err(LibraryError::NotUtf8 { name: "broken.txt".to_owned() })
	);
	assert_eq!(
		read(&root, "big.md"),
		Err(LibraryError::TooLarge {
			name: "big.md".to_owned(),
			bytes: MAX_DOCUMENT_BYTES + 1,
			limit: MAX_DOCUMENT_BYTES
		})
	);
	for name in ["report.pdf", ".hidden.md", "folder.md"] {
		assert_eq!(read(&root, name), Err(LibraryError::Missing { name: name.to_owned() }));
	}
}

#[test]
fn a_read_in_an_absent_folder_finds_nothing() {
	let root = temp_root();

	assert_eq!(read(&root, "notes.md"), Err(LibraryError::Missing { name: "notes.md".to_owned() }));
	assert!(!root.exists());
}

fn a_host(name: &str) -> AppOfItsOwn {
	let app = an_app_of_its_own(&format!("library-{name}"), mock_builder());
	app.manage(db::bootstrap(app.handle()));
	app
}

async fn a_space(app: &App<MockRuntime>, name: &str) -> String {
	let state = app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	database.spaces().create(name.to_owned()).await.expect("the space lands").id
}

#[tokio::test]
async fn an_unknown_space_is_refused_by_both_commands() {
	let app = a_host("unknown");

	let listed = library_list(app.handle().clone(), app.state(), "nowhere".to_owned()).await;
	let read = library_read_document(
		app.handle().clone(),
		app.state(),
		"nowhere".to_owned(),
		"notes.md".to_owned(),
	)
	.await;

	assert_eq!(listed, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(read, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
}

#[tokio::test]
async fn a_known_space_lists_and_reads_from_its_folder_under_app_data() {
	let app = a_host("known");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	assert_eq!(root, app.path().app_data_dir().expect("the data folder").join("library"));
	put(&root, &space_id, "notes.md", b"notes");

	let listed = library_list(app.handle().clone(), app.state(), space_id.clone())
		.await
		.expect("the library lists");
	let read =
		library_read_document(app.handle().clone(), app.state(), space_id, "notes.md".to_owned())
			.await
			.expect("the document reads");

	assert_eq!(listed.iter().map(|item| item.name.as_str()).collect::<Vec<_>>(), ["notes.md"]);
	assert_eq!(read.content, "notes");
}

#[tokio::test]
async fn deleting_a_space_removes_its_library_folder_only() {
	let app = a_host("deleted");
	let kept = a_space(&app, "Kept").await;
	let deleted = a_space(&app, "Deleted").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &kept, "kept.md", b"kept");
	put(&root, &deleted, "gone.md", b"gone");

	space_delete(app.handle().clone(), app.state(), deleted.clone())
		.await
		.expect("the space is deleted");

	assert!(!space_dir(&root, &deleted).exists());
	assert_eq!(names(&root, &kept), ["kept.md"]);
}
