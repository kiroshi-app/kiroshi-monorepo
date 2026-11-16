use std::fs::{self, File};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime};

use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{App, Listener, Manager};
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, Transact, Update};

use super::commands::{
	library_apply_update, library_board_summary, library_copy, library_create_board,
	library_create_document, library_delete, library_import, library_import_paths, library_list,
	library_open_document, library_read_document, library_read_file, library_read_image,
	library_read_picked_image, library_read_thumbnail, library_rename_board,
	library_rename_document, library_reveal, library_save, library_save_message, library_templates,
};
use super::contract::{
	LibraryBoardBounds, LibraryBoardNode, LibraryBoardSummary, LibraryChanged,
	LibraryDocumentFormat, LibraryDocumentRenamed, LibraryDocumentUpdated, LibraryError,
	LibraryFile, LibraryImage, LibraryImport, LibraryItem, LibraryItemKind, LibraryTemplate,
};
use super::*;
use crate::attachments::attachment_block;
use crate::attachments::contract::SubmittedAttachment;
use crate::conversations::commands::{conversation_message_page, conversation_send_user_message};
use crate::conversations::contract::{NewUserMessage, TranscriptStoreError};
use crate::db;
use crate::hosting::authorship::Caller;
use crate::removed_on_drop::RemovedOnDrop;
use crate::spaces::commands::space_delete;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const SPACE: &str = "s1";

fn temp_root() -> RemovedOnDrop {
	RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-library-{}", Uuid::new_v4())))
}

pub(crate) fn put(root: &Path, space_id: &str, name: &str, content: &[u8]) {
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

fn read_an_image(root: &Path, name: &str) -> Result<LibraryImage, LibraryError> {
	read_image(root, SPACE, name)
}

#[test]
fn an_image_reads_as_base64_with_the_mime_type_of_its_extension() {
	let root = temp_root();
	let pixels = [0x89, b'P', b'N', b'G', 0x00, 0xff];
	let expected = [
		("a.png", "image/png"),
		("b.jpg", "image/jpeg"),
		("c.jpeg", "image/jpeg"),
		("d.gif", "image/gif"),
		("e.webp", "image/webp"),
		("F.PNG", "image/png"),
	];
	for (name, _) in expected {
		put(&root, SPACE, name, &pixels);
	}

	for (name, mime_type) in expected {
		assert_eq!(
			read_an_image(&root, name),
			Ok(LibraryImage {
				name: name.to_owned(),
				mime_type: mime_type.to_owned(),
				content: "iVBORwD/".to_owned(),
			})
		);
	}
}

#[test]
fn an_image_name_that_leaves_the_folder_is_refused() {
	let root = temp_root();
	put(&root, SPACE, "cover.png", b"png");
	put(&root, "s2", "theirs.png", b"theirs");

	for name in ["", ".", "..", "../s2/theirs.png", "nested/cover.png", "..\\s2\\theirs.png"] {
		assert_eq!(
			read_an_image(&root, name),
			Err(LibraryError::InvalidName { name: name.to_owned() })
		);
	}
}

#[cfg(unix)]
#[test]
fn an_image_link_out_of_the_folder_is_refused() {
	let root = temp_root();
	put(&root, "s2", "theirs.png", b"theirs");
	put(&root, SPACE, "cover.png", b"png");
	let dir = space_dir(&root, SPACE);
	std::os::unix::fs::symlink(space_dir(&root, "s2").join("theirs.png"), dir.join("out.png"))
		.expect("the link lands");
	std::os::unix::fs::symlink(dir.join("cover.png"), dir.join("in.png")).expect("the link lands");

	assert_eq!(
		read_an_image(&root, "out.png"),
		Err(LibraryError::InvalidName { name: "out.png".to_owned() })
	);
	assert_eq!(
		read_an_image(&root, "in.png"),
		Err(LibraryError::Missing { name: "in.png".to_owned() })
	);
}

#[test]
fn each_failed_image_read_says_why() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	put(&root, SPACE, "report.pdf", b"pdf");
	put(&root, SPACE, ".hidden.png", b"hidden");
	fs::create_dir_all(space_dir(&root, SPACE).join("folder.png")).expect("the subfolder lands");

	assert_eq!(
		read_an_image(&root, "notes.md"),
		Err(LibraryError::NotAnImage { name: "notes.md".to_owned() })
	);
	for name in ["gone.png", "report.pdf", ".hidden.png", "folder.png"] {
		assert_eq!(
			read_an_image(&root, name),
			Err(LibraryError::Missing { name: name.to_owned() })
		);
	}
}

#[cfg(unix)]
#[test]
fn an_oversized_image_is_refused_without_reading_its_bytes() {
	use std::os::unix::fs::PermissionsExt;

	let root = temp_root();
	let path = space_dir(&root, SPACE).join("huge.png");
	put(&root, SPACE, "huge.png", b"");
	File::options()
		.write(true)
		.open(&path)
		.expect("the file opens")
		.set_len(MAX_READ_BYTES + 1)
		.expect("the file grows");
	fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).expect("the file locks");

	assert_eq!(
		read_an_image(&root, "huge.png"),
		Err(LibraryError::TooLarge {
			name: "huge.png".to_owned(),
			bytes: MAX_READ_BYTES + 1,
			limit: MAX_READ_BYTES
		})
	);
}

pub(crate) fn a_host(name: &str) -> AppOfItsOwn {
	let app = an_app_of_its_own(&format!("library-{name}"), mock_builder());
	app.manage(db::bootstrap(app.handle()));
	app
}

pub(crate) async fn a_space(app: &App<MockRuntime>, name: &str) -> String {
	let state = app.state::<db::DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	database.spaces().create(name.to_owned()).await.expect("the space lands").id
}

#[tokio::test]
async fn an_unknown_space_is_refused_by_every_command() {
	let app = a_host("unknown");

	let listed = library_list(app.handle().clone(), app.state(), "nowhere".to_owned()).await;
	let read = library_read_document(
		app.handle().clone(),
		app.state(),
		"nowhere".to_owned(),
		"notes.md".to_owned(),
	)
	.await;
	let image = library_read_image(
		app.handle().clone(),
		app.state(),
		"nowhere".to_owned(),
		"cover.png".to_owned(),
	)
	.await;
	let file = library_read_file(
		app.handle().clone(),
		app.state(),
		"nowhere".to_owned(),
		"notes.md".to_owned(),
	)
	.await;

	assert_eq!(listed, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(read, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(image, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(file, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
}

#[tokio::test]
async fn a_known_space_lists_and_reads_from_its_folder_under_app_data() {
	let app = a_host("known");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	assert_eq!(root, app.path().app_data_dir().expect("the data folder").join("library"));
	put(&root, &space_id, "notes.md", b"notes");
	put(&root, &space_id, "cover.png", b"png");
	touch(&root, &space_id, "notes.md", 2_000);
	touch(&root, &space_id, "cover.png", 1_000);

	let listed = library_list(app.handle().clone(), app.state(), space_id.clone())
		.await
		.expect("the library lists");
	let read = library_read_document(
		app.handle().clone(),
		app.state(),
		space_id.clone(),
		"notes.md".to_owned(),
	)
	.await
	.expect("the document reads");
	let image =
		library_read_image(app.handle().clone(), app.state(), space_id, "cover.png".to_owned())
			.await
			.expect("the image reads");

	assert_eq!(
		listed.iter().map(|item| item.name.as_str()).collect::<Vec<_>>(),
		["notes.md", "cover.png"]
	);
	assert_eq!(read.content, "notes");
	assert_eq!(image.content, "cG5n");
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

fn encoded(format: ImageFormat) -> Vec<u8> {
	let picture = DynamicImage::ImageRgb8(RgbImage::from_pixel(3, 2, Rgb([200, 40, 10])));
	let mut bytes = Cursor::new(Vec::new());
	picture.write_to(&mut bytes, format).expect("the picture encodes");
	bytes.into_inner()
}

fn chosen(
	destination: Option<PathBuf>,
) -> impl FnOnce(&str) -> std::future::Ready<Result<Option<PathBuf>, LibraryError>> {
	move |_| std::future::ready(Ok(destination))
}

#[tokio::test]
async fn a_save_opens_the_dialog_on_the_item_name_and_copies_it_where_the_person_chose() {
	let root = temp_root();
	let elsewhere = temp_root();
	fs::create_dir_all(&*elsewhere).expect("the destination folder lands");
	put(&root, SPACE, "cover.png", &encoded(ImageFormat::Png));
	let destination = elsewhere.join("picked.png");
	let mut suggested = None;

	let saved = save(&root, SPACE, "cover.png", |name| {
		suggested = Some(name.to_owned());
		std::future::ready(Ok(Some(destination.clone())))
	})
	.await;

	assert_eq!(saved, Ok(Some(destination.clone())));
	assert_eq!(suggested.as_deref(), Some("cover.png"));
	assert_eq!(fs::read(&destination).expect("the copy reads"), encoded(ImageFormat::Png));
}

#[tokio::test]
async fn a_cancelled_save_writes_nothing() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	let before = fs::read_dir(space_dir(&root, SPACE)).expect("the folder lists").count();

	let saved = save(&root, SPACE, "notes.md", chosen(None)).await;

	assert_eq!(saved, Ok(None));
	assert_eq!(fs::read_dir(space_dir(&root, SPACE)).expect("the folder lists").count(), before);
}

#[tokio::test]
async fn a_destination_that_cannot_be_written_says_why() {
	let root = temp_root();
	let elsewhere = temp_root();
	put(&root, SPACE, "notes.md", b"notes");

	let saved =
		save(&root, SPACE, "notes.md", chosen(Some(elsewhere.join("absent/notes.md")))).await;

	assert!(matches!(saved, Err(LibraryError::Unwritable { detail }) if !detail.is_empty()));
}

#[tokio::test]
async fn saving_an_item_onto_itself_keeps_its_bytes() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	let itself = space_dir(&root, SPACE).join("notes.md");

	let saved = save(&root, SPACE, "notes.md", chosen(Some(itself.clone()))).await;

	assert_eq!(saved, Ok(Some(itself.clone())));
	assert_eq!(fs::read(&itself).expect("the item reads"), b"notes");
}

#[cfg(unix)]
#[tokio::test]
async fn an_item_swapped_for_a_link_out_of_the_folder_while_the_dialog_is_open_is_not_copied() {
	let root = temp_root();
	let elsewhere = temp_root();
	fs::create_dir_all(&*elsewhere).expect("the destination folder lands");
	put(&root, SPACE, "notes.md", b"notes");
	put(&root, "s2", "theirs.md", b"theirs");
	let item = space_dir(&root, SPACE).join("notes.md");
	let destination = elsewhere.join("picked.md");

	let saved = save(&root, SPACE, "notes.md", |_| {
		fs::remove_file(&item).expect("the item goes");
		std::os::unix::fs::symlink(space_dir(&root, "s2").join("theirs.md"), &item)
			.expect("the link lands");
		std::future::ready(Ok(Some(destination.clone())))
	})
	.await;

	assert_eq!(saved, Err(LibraryError::InvalidName { name: "notes.md".to_owned() }));
	assert!(!destination.exists());
}

#[tokio::test]
async fn an_item_deleted_while_the_dialog_is_open_is_missing() {
	let root = temp_root();
	let elsewhere = temp_root();
	fs::create_dir_all(&*elsewhere).expect("the destination folder lands");
	put(&root, SPACE, "notes.md", b"notes");
	let destination = elsewhere.join("picked.md");

	let saved = save(&root, SPACE, "notes.md", |_| {
		fs::remove_file(space_dir(&root, SPACE).join("notes.md")).expect("the item goes");
		std::future::ready(Ok(Some(destination.clone())))
	})
	.await;

	assert_eq!(saved, Err(LibraryError::Missing { name: "notes.md".to_owned() }));
	assert!(!destination.exists());
}

#[tokio::test]
async fn a_refused_name_never_opens_the_save_dialog() {
	let root = temp_root();
	put(&root, "s2", "theirs.md", b"theirs");

	let saved = save(&root, SPACE, "../s2/theirs.md", |_| -> std::future::Ready<_> {
		panic!("the dialog opened for a refused name")
	})
	.await;

	assert_eq!(saved, Err(LibraryError::InvalidName { name: "../s2/theirs.md".to_owned() }));
}

#[test]
fn a_document_copies_as_its_text() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", "# Notes é".as_bytes());

	assert_eq!(
		clipboard_payload(&root, SPACE, "notes.md"),
		Ok(ClipboardPayload::Text("# Notes é".to_owned()))
	);
}

#[test]
fn a_document_copy_keeps_the_read_refusals() {
	let root = temp_root();
	put(&root, SPACE, "broken.txt", &[0xff, 0xfe, 0x00]);
	let big = File::create(space_dir(&root, SPACE).join("big.md")).expect("the file lands");
	big.set_len(MAX_DOCUMENT_BYTES + 1).expect("the file grows");

	assert_eq!(
		clipboard_payload(&root, SPACE, "broken.txt"),
		Err(LibraryError::NotUtf8 { name: "broken.txt".to_owned() })
	);
	assert_eq!(
		clipboard_payload(&root, SPACE, "big.md"),
		Err(LibraryError::TooLarge {
			name: "big.md".to_owned(),
			bytes: MAX_DOCUMENT_BYTES + 1,
			limit: MAX_DOCUMENT_BYTES
		})
	);
}

#[test]
fn each_image_type_copies_as_its_decoded_pixels() {
	let root = temp_root();
	let lossless =
		[("a.png", ImageFormat::Png), ("b.gif", ImageFormat::Gif), ("c.webp", ImageFormat::WebP)];
	for (name, format) in lossless {
		put(&root, SPACE, name, &encoded(format));

		assert_eq!(
			clipboard_payload(&root, SPACE, name),
			Ok(ClipboardPayload::Image { rgba: [200, 40, 10, 255].repeat(6), width: 3, height: 2 }),
			"{name}"
		);
	}
	for name in ["d.jpg", "e.JPEG"] {
		put(&root, SPACE, name, &encoded(ImageFormat::Jpeg));

		let Ok(ClipboardPayload::Image { rgba, width, height }) =
			clipboard_payload(&root, SPACE, name)
		else {
			panic!("{name} copies as an image");
		};
		assert_eq!((width, height, rgba.len()), (3, 2, 24), "{name}");
		assert!(rgba.chunks(4).all(|pixel| pixel[3] == 255), "{name}");
	}
}

#[test]
fn an_image_that_fails_to_decode_or_is_too_large_is_refused_by_name() {
	let root = temp_root();
	put(&root, SPACE, "broken.png", b"not a png");
	put(&root, SPACE, "mislabelled.gif", &encoded(ImageFormat::Png));
	let big = File::create(space_dir(&root, SPACE).join("big.webp")).expect("the file lands");
	big.set_len(MAX_IMAGE_BYTES + 1).expect("the file grows");

	for name in ["broken.png", "mislabelled.gif"] {
		assert!(
			matches!(
				clipboard_payload(&root, SPACE, name),
				Err(LibraryError::Undecodable { name: refused, .. }) if refused == name
			),
			"{name}"
		);
	}
	assert_eq!(
		clipboard_payload(&root, SPACE, "big.webp"),
		Err(LibraryError::TooLarge {
			name: "big.webp".to_owned(),
			bytes: MAX_IMAGE_BYTES + 1,
			limit: MAX_IMAGE_BYTES
		})
	);
}

#[tokio::test]
async fn an_unknown_space_is_refused_by_save_copy_and_reveal() {
	let app = a_host("unknown-actions");
	let refused = Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() });

	assert_eq!(
		refusals_of_each_action(&app, "nowhere", "a.md").await,
		[refused.clone(), refused.clone(), refused]
	);
}

async fn refusals_of_each_action(
	app: &App<MockRuntime>,
	space_id: &str,
	name: &str,
) -> [Result<(), LibraryError>; 3] {
	let saved =
		library_save(app.handle().clone(), app.state(), space_id.to_owned(), name.to_owned())
			.await
			.map(|_| ());
	let copied =
		library_copy(app.handle().clone(), app.state(), space_id.to_owned(), name.to_owned()).await;
	let revealed =
		library_reveal(app.handle().clone(), app.state(), space_id.to_owned(), name.to_owned())
			.await;
	[saved, copied, revealed]
}

#[tokio::test]
async fn a_name_that_leaves_the_folder_is_refused_by_save_copy_and_reveal() {
	let app = a_host("escape-actions");
	let mine = a_space(&app, "Mine").await;
	let theirs = a_space(&app, "Theirs").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &mine, "notes.md", b"notes");
	put(&root, &theirs, "theirs.md", b"theirs");

	for name in [
		"".to_owned(),
		".".to_owned(),
		"..".to_owned(),
		format!("../{theirs}/theirs.md"),
		format!("..\\{theirs}\\theirs.md"),
	] {
		let refused = Err(LibraryError::InvalidName { name: name.clone() });
		assert_eq!(
			refusals_of_each_action(&app, &mine, &name).await,
			[refused.clone(), refused.clone(), refused],
			"{name}"
		);
	}
}

#[cfg(unix)]
#[tokio::test]
async fn a_link_out_of_the_folder_is_refused_by_save_copy_and_reveal() {
	let app = a_host("link-actions");
	let mine = a_space(&app, "Mine").await;
	let theirs = a_space(&app, "Theirs").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &theirs, "theirs.png", &encoded(ImageFormat::Png));
	fs::create_dir_all(space_dir(&root, &mine)).expect("the space folder lands");
	std::os::unix::fs::symlink(
		space_dir(&root, &theirs).join("theirs.png"),
		space_dir(&root, &mine).join("out.png"),
	)
	.expect("the link lands");
	let refused = Err(LibraryError::InvalidName { name: "out.png".to_owned() });

	assert_eq!(
		refusals_of_each_action(&app, &mine, "out.png").await,
		[refused.clone(), refused.clone(), refused]
	);
}

fn read_a_file(root: &Path, name: &str) -> Result<LibraryFile, LibraryError> {
	read_file(root, SPACE, name)
}

#[test]
fn any_accepted_item_reads_as_base64_with_the_mime_type_of_its_extension() {
	let root = temp_root();
	let expected = [
		("cover.png", "image/png"),
		("photo.JPG", "image/jpeg"),
		("notes.md", "text/markdown"),
		("long.markdown", "text/markdown"),
		("todo.txt", "text/plain"),
	];
	for (name, _) in expected {
		put(&root, SPACE, name, b"bytes");
	}

	for (name, mime_type) in expected {
		assert_eq!(
			read_a_file(&root, name),
			Ok(LibraryFile {
				name: name.to_owned(),
				mime_type: mime_type.to_owned(),
				content: "Ynl0ZXM=".to_owned(),
			})
		);
	}
}

#[test]
fn a_file_read_refuses_what_an_image_read_refuses() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	put(&root, SPACE, "script.sh", b"echo");
	put(&root, "s2", "theirs.png", b"theirs");

	for name in ["", ".", "..", "../s2/theirs.png", "nested/notes.md", "..\\s2\\theirs.png"] {
		assert_eq!(
			read_a_file(&root, name),
			Err(LibraryError::InvalidName { name: name.to_owned() }),
			"{name}"
		);
	}
	for name in ["script.sh", "absent.md"] {
		assert_eq!(read_a_file(&root, name), Err(LibraryError::Missing { name: name.to_owned() }));
	}
}

#[cfg(unix)]
#[test]
fn a_file_link_out_of_the_folder_is_refused() {
	let root = temp_root();
	put(&root, "s2", "theirs.md", b"theirs");
	fs::create_dir_all(space_dir(&root, SPACE)).expect("the space folder lands");
	std::os::unix::fs::symlink(
		space_dir(&root, "s2").join("theirs.md"),
		space_dir(&root, SPACE).join("out.md"),
	)
	.expect("the link lands");

	assert_eq!(
		read_a_file(&root, "out.md"),
		Err(LibraryError::InvalidName { name: "out.md".to_owned() })
	);
}

#[cfg(unix)]
#[test]
fn an_oversized_file_is_refused_without_reading_its_bytes() {
	use std::os::unix::fs::PermissionsExt;

	let root = temp_root();
	for name in ["huge.md", "huge.png"] {
		let path = space_dir(&root, SPACE).join(name);
		put(&root, SPACE, name, b"");
		File::options()
			.write(true)
			.open(&path)
			.expect("the file opens")
			.set_len(MAX_READ_BYTES + 1)
			.expect("the file grows");
		fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).expect("the file locks");

		assert_eq!(
			read_a_file(&root, name),
			Err(LibraryError::TooLarge {
				name: name.to_owned(),
				bytes: MAX_READ_BYTES + 1,
				limit: MAX_READ_BYTES
			})
		);
	}
}

fn base64_of(bytes: &[u8]) -> String {
	BASE64_STANDARD.encode(bytes)
}

#[test]
fn received_bytes_copy_as_text_for_a_document_and_as_pixels_for_an_image() {
	assert_eq!(
		clipboard_payload_of_bytes("notes.md", &base64_of("# Notes é".as_bytes())),
		Ok(ClipboardPayload::Text("# Notes é".to_owned()))
	);
	assert_eq!(
		clipboard_payload_of_bytes("cover.png", &base64_of(&encoded(ImageFormat::Png))),
		Ok(ClipboardPayload::Image { rgba: [200, 40, 10, 255].repeat(6), width: 3, height: 2 })
	);
}

#[test]
fn received_bytes_keep_the_copy_refusals() {
	let too_big_document = vec![b'a'; MAX_DOCUMENT_BYTES as usize + 1];
	let too_big_image = vec![0; MAX_IMAGE_BYTES as usize + 1];

	assert_eq!(
		clipboard_payload_of_bytes("broken.txt", &base64_of(&[0xff, 0xfe, 0x00])),
		Err(LibraryError::NotUtf8 { name: "broken.txt".to_owned() })
	);
	assert_eq!(
		clipboard_payload_of_bytes("big.md", &base64_of(&too_big_document)),
		Err(LibraryError::TooLarge {
			name: "big.md".to_owned(),
			bytes: MAX_DOCUMENT_BYTES + 1,
			limit: MAX_DOCUMENT_BYTES
		})
	);
	assert_eq!(
		clipboard_payload_of_bytes("big.webp", &base64_of(&too_big_image)),
		Err(LibraryError::TooLarge {
			name: "big.webp".to_owned(),
			bytes: MAX_IMAGE_BYTES + 1,
			limit: MAX_IMAGE_BYTES
		})
	);
	for (name, bytes) in
		[("broken.png", b"not a png".to_vec()), ("mislabelled.gif", encoded(ImageFormat::Png))]
	{
		assert!(
			matches!(
				clipboard_payload_of_bytes(name, &base64_of(&bytes)),
				Err(LibraryError::Undecodable { name: refused, .. }) if refused == name
			),
			"{name}"
		);
	}
	for name in ["script.sh", "../notes.md", "nested/cover.png", ".hidden.md"] {
		assert_eq!(
			clipboard_payload_of_bytes(name, &base64_of(b"notes")),
			Err(LibraryError::InvalidName { name: name.to_owned() })
		);
	}
}

#[test]
fn received_content_that_is_not_base64_is_undecodable() {
	for name in ["notes.md", "cover.png"] {
		assert!(
			matches!(
				clipboard_payload_of_bytes(name, "not base64!"),
				Err(LibraryError::Undecodable { name: refused, .. }) if refused == name
			),
			"{name}"
		);
	}
}

#[tokio::test]
async fn received_bytes_save_where_the_person_chose_under_the_item_name() {
	let elsewhere = temp_root();
	fs::create_dir_all(&*elsewhere).expect("the destination folder lands");
	let destination = elsewhere.join("picked.png");
	let mut suggested = None;

	let saved = save_bytes("cover.png", &base64_of(&encoded(ImageFormat::Png)), |name| {
		suggested = Some(name.to_owned());
		std::future::ready(Ok(Some(destination.clone())))
	})
	.await;

	assert_eq!(saved, Ok(Some(destination.clone())));
	assert_eq!(suggested.as_deref(), Some("cover.png"));
	assert_eq!(fs::read(&destination).expect("the copy reads"), encoded(ImageFormat::Png));
}

#[tokio::test]
async fn a_cancelled_save_of_received_bytes_writes_nothing() {
	assert_eq!(save_bytes("notes.md", &base64_of(b"notes"), chosen(None)).await, Ok(None));
}

#[tokio::test]
async fn received_bytes_that_cannot_be_written_say_why() {
	let missing_folder = temp_root().join("absent").join("notes.md");

	let saved = save_bytes("notes.md", &base64_of(b"notes"), chosen(Some(missing_folder))).await;

	assert!(matches!(saved, Err(LibraryError::Unwritable { .. })), "{saved:?}");
}

#[tokio::test]
async fn undecodable_content_or_a_refused_name_never_opens_the_save_dialog() {
	let never_opened = |_: &str| -> std::future::Ready<_> { panic!("the dialog opened") };

	let undecodable = save_bytes("notes.md", "not base64!", never_opened).await;
	let refused = save_bytes("../notes.md", &base64_of(b"notes"), never_opened).await;

	assert!(
		matches!(&undecodable, Err(LibraryError::Undecodable { name, .. }) if name == "notes.md"),
		"{undecodable:?}"
	);
	assert_eq!(refused, Err(LibraryError::InvalidName { name: "../notes.md".to_owned() }));
}

pub(crate) struct YjsClient(Doc);

impl YjsClient {
	pub(crate) fn of(state: &str) -> Self {
		let client = Self(Doc::new());
		client.applied(state);
		client
	}

	pub(crate) fn applied(&self, update: &str) {
		let bytes = BASE64_STANDARD.decode(update).expect("a base64 update");
		let update = Update::decode_v1(&bytes).expect("a yjs update");
		self.0.transact_mut().apply_update(update).expect("the update applies");
	}

	pub(crate) fn inserted(&self, index: u32, chunk: &str) -> String {
		let text = self.0.get_or_insert_text("markdown");
		let before = self.0.transact().state_vector();
		text.insert(&mut self.0.transact_mut(), index, chunk);
		BASE64_STANDARD.encode(self.0.transact().encode_state_as_update_v1(&before))
	}

	pub(crate) fn text(&self) -> String {
		self.0.get_or_insert_text("markdown").get_string(&self.0.transact())
	}
}

fn stored_state_of(root: &Path, name: &str) -> Vec<u8> {
	fs::read(root.join(".documents").join(SPACE).join(format!("{name}.yjs")))
		.expect("the state is stored")
}

fn file_text(root: &Path, name: &str) -> String {
	fs::read_to_string(space_dir(root, SPACE).join(name)).expect("the file reads")
}

fn opened_text(documents: &Documents, root: &Path, name: &str) -> String {
	let state = documents.open(root, SPACE, name).expect("opens").state;
	YjsClient::of(&BASE64_STANDARD.encode(state)).text()
}

fn an_update_and_the_one_it_depends_on(documents: &Documents, root: &Path) -> (Vec<u8>, Vec<u8>) {
	put(root, SPACE, "notes.md", b"base");
	let served = documents.open(root, SPACE, "notes.md").expect("opens").state;
	let member = YjsClient::of(&BASE64_STANDARD.encode(served));
	let first = member.inserted(4, " first");
	let second = member.inserted(10, " second");
	(bytes_of(&first), bytes_of(&second))
}

#[test]
fn an_update_ahead_of_the_one_it_depends_on_is_kept_until_that_one_arrives() {
	let root = temp_root();
	let documents = Documents::default();
	let (first, second) = an_update_and_the_one_it_depends_on(&documents, &root);

	documents.apply(&root, SPACE, "notes.md", &second, |_| {}).expect("the update is kept");
	let while_waiting = file_text(&root, "notes.md");
	documents.apply(&root, SPACE, "notes.md", &first, |_| {}).expect("the update merges");

	assert_eq!(while_waiting, "base");
	assert_eq!(file_text(&root, "notes.md"), "base first second");
	assert_eq!(opened_text(&documents, &root, "notes.md"), "base first second");
}

#[test]
fn an_update_ahead_of_the_one_it_depends_on_is_kept_across_a_restart() {
	let root = temp_root();
	let before_restart = Documents::default();
	let (first, second) = an_update_and_the_one_it_depends_on(&before_restart, &root);
	before_restart.apply(&root, SPACE, "notes.md", &second, |_| {}).expect("the update is kept");

	let restarted = Documents::default();
	restarted.apply(&root, SPACE, "notes.md", &first, |_| {}).expect("the update merges");

	assert_eq!(file_text(&root, "notes.md"), "base first second");
	assert_eq!(opened_text(&restarted, &root, "notes.md"), "base first second");
}

#[test]
fn updates_sent_at_once_by_many_members_all_land_in_the_file_and_the_opened_text() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let served = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let base = BASE64_STANDARD.encode(served);
	let inserts_of = |member: usize| (0..8).map(move |turn| format!("[{member}.{turn}]"));

	std::thread::scope(|threads| {
		for member in 0..6 {
			let (documents, root, base) = (&documents, &root, &base);
			threads.spawn(move || {
				let client = YjsClient::of(base);
				for insert in inserts_of(member) {
					let update = client.inserted(client.text().len() as u32, &insert);
					documents
						.apply(root, SPACE, "notes.md", &bytes_of(&update), |_| {})
						.expect("merges");
				}
			});
		}
	});

	let on_disk = file_text(&root, "notes.md");
	let opened = opened_text(&documents, &root, "notes.md");
	for insert in (0..6).flat_map(inserts_of) {
		assert!(on_disk.contains(&insert), "{insert} is missing from {on_disk}");
		assert!(opened.contains(&insert), "{insert} is missing from {opened}");
	}
	assert_eq!(opened, on_disk);
}

#[test]
fn outside_edits_land_on_the_held_document_under_its_one_host_client() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	documents.open(&root, SPACE, "notes.md").expect("opens");
	put(&root, SPACE, "notes.md", b"base, once");
	documents.open(&root, SPACE, "notes.md").expect("opens");
	put(&root, SPACE, "notes.md", b"base, once, twice");
	let served = documents.open(&root, SPACE, "notes.md").expect("opens").state;

	let clients: Vec<_> = state_vector_of(&served).iter().map(|(client, _)| *client).collect();

	assert_eq!(clients.len(), 1, "{clients:?}");
	assert_eq!(opened_text(&documents, &root, "notes.md"), "base, once, twice");
}

fn state_vector_of(state: &[u8]) -> StateVector {
	Update::decode_v1(state).expect("a yjs update").state_vector()
}

fn heard_updates(app: &App<MockRuntime>) -> mpsc::Receiver<LibraryDocumentUpdated> {
	let (told, heard) = mpsc::channel();
	app.listen_any(events::LIBRARY_DOCUMENT_UPDATED.name(), move |event| {
		let updated = serde_json::from_str(event.payload()).expect("an update payload");
		told.send(updated).expect("the test listens");
	});
	heard
}

fn heard_count(
	heard: &mpsc::Receiver<LibraryDocumentUpdated>,
	count: usize,
) -> Vec<LibraryDocumentUpdated> {
	(0..count)
		.map(|_| heard.recv_timeout(Duration::from_secs(5)).expect("an update was announced"))
		.collect()
}

async fn opened(app: &App<MockRuntime>, space_id: &str, name: &str) -> String {
	library_open_document(app.handle().clone(), app.state(), space_id.to_owned(), name.to_owned())
		.await
		.expect("the document opens")
		.update
}

async fn applied(
	app: &App<MockRuntime>,
	space_id: &str,
	name: &str,
	update: &str,
) -> Result<(), LibraryError> {
	library_apply_update(
		app.handle().clone(),
		app.state(),
		space_id.to_owned(),
		name.to_owned(),
		update.to_owned(),
	)
	.await
}

async fn created(
	app: &App<MockRuntime>,
	space_id: &str,
	name: &str,
	template_id: Option<&str>,
) -> Result<contract::LibraryItem, LibraryError> {
	library_create_document(
		app.handle().clone(),
		app.state(),
		space_id.to_owned(),
		name.to_owned(),
		template_id.map(str::to_owned),
	)
	.await
}

#[test]
fn the_templates_list_as_id_and_title() {
	let ids: Vec<(String, String)> =
		library_templates().into_iter().map(|LibraryTemplate { id, title }| (id, title)).collect();

	assert_eq!(
		ids,
		[
			("meeting-notes", "Meeting notes"),
			("project-brief", "Project brief"),
			("decision-record", "Decision record"),
			("weekly-update", "Weekly update"),
		]
		.map(|(id, title)| (id.to_owned(), title.to_owned()))
	);
}

#[tokio::test]
async fn a_blank_document_is_an_empty_markdown_file_listed_as_a_document() {
	let app = a_host("create-blank");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");

	let item = created(&app, &space_id, "Plan.md", None).await.expect("the document lands");

	assert_eq!(
		(item.name.as_str(), item.kind, item.bytes),
		("Plan.md", LibraryItemKind::Document, 0)
	);
	assert_eq!(fs::read_to_string(space_dir(&root, &space_id).join("Plan.md")).expect("read"), "");
	assert_eq!(names(&root, &space_id), ["Plan.md"]);
}

#[tokio::test]
async fn a_document_from_a_template_holds_the_template_markdown() {
	let app = a_host("create-template");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");

	let item = created(&app, &space_id, "Brief.md", Some("project-brief")).await.expect("lands");

	let content = fs::read_to_string(space_dir(&root, &space_id).join("Brief.md")).expect("read");
	assert_eq!(content, templates::markdown_of("project-brief").expect("a template"));
	assert!(content.starts_with("# Project brief\n"), "{content}");
	assert_eq!((item.kind, item.bytes), (LibraryItemKind::Document, content.len() as u64));
	assert_eq!(names(&root, &space_id), ["Brief.md"]);
}

#[tokio::test]
async fn a_taken_unsafe_or_unknown_creation_is_refused_and_writes_nothing() {
	let app = a_host("create-refused");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "Plan.md", b"kept");

	let refusals = [
		("Plan.md", None, LibraryError::AlreadyExists { name: "Plan.md".to_owned() }),
		("../Plan.md", None, LibraryError::InvalidName { name: "../Plan.md".to_owned() }),
		(".hidden.md", None, LibraryError::InvalidName { name: ".hidden.md".to_owned() }),
		("notes.txt", None, LibraryError::InvalidName { name: "notes.txt".to_owned() }),
		("Fresh.md", Some("nope"), LibraryError::UnknownTemplate { id: "nope".to_owned() }),
	];
	for (name, template_id, refusal) in refusals {
		assert_eq!(created(&app, &space_id, name, template_id).await, Err(refusal));
	}
	let unknown = created(&app, "nowhere", "Plan.md", None).await;

	assert_eq!(unknown, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(names(&root, &space_id), ["Plan.md"]);
	assert_eq!(fs::read(space_dir(&root, &space_id).join("Plan.md")).expect("read"), b"kept");
	assert!(!root.join("Plan.md").exists());
}

async fn merged_in_order(is_host_first: bool) {
	let app = a_host(&format!("merge-{is_host_first}"));
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let heard = heard_updates(&app);
	let base = opened(&app, &space_id, "notes.md").await;
	let host = YjsClient::of(&base).inserted(0, "Host. ");
	let member = YjsClient::of(&base).inserted(4, " Member.");

	let ordered = if is_host_first { [&host, &member] } else { [&member, &host] };
	for update in ordered {
		applied(&app, &space_id, "notes.md", update).await.expect("the update merges");
	}

	let merged = "Host. base Member.";
	let read = library_read_document(
		app.handle().clone(),
		app.state(),
		space_id.clone(),
		"notes.md".to_owned(),
	)
	.await
	.expect("the document reads");
	assert_eq!(read.content, merged);
	assert_eq!(
		fs::read_to_string(space_dir(&root, &space_id).join("notes.md")).expect("read"),
		merged
	);
	let announced = heard_count(&heard, 3);
	let observer = YjsClient::of(&base);
	for updated in &announced {
		assert_eq!(
			(updated.space_id.as_str(), updated.name.as_str()),
			(space_id.as_str(), "notes.md")
		);
		observer.applied(&updated.update);
	}
	assert_eq!(observer.text(), merged);
	assert!(heard.try_recv().is_err());
}

#[tokio::test]
async fn host_and_member_edits_on_one_base_merge_with_the_host_first() {
	merged_in_order(true).await;
}

#[tokio::test]
async fn host_and_member_edits_on_one_base_merge_with_the_member_first() {
	merged_in_order(false).await;
}

#[tokio::test]
async fn an_unknown_space_is_refused_an_open_or_an_update() {
	let app = a_host("documents-unknown");

	let open = library_open_document(
		app.handle().clone(),
		app.state(),
		"nowhere".to_owned(),
		"notes.md".to_owned(),
	)
	.await;
	let update = applied(&app, "nowhere", "notes.md", "AAA=").await;

	assert_eq!(open, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert_eq!(update, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
}

#[test]
fn an_undecodable_update_leaves_the_document_and_the_file_unchanged() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let served = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let stored = stored_state_of(&root, "notes.md");

	let refused = documents.apply(&root, SPACE, "notes.md", &[1, 2, 3], |_| {});

	assert!(
		matches!(&refused, Err(LibraryError::Undecodable { name, .. }) if name == "notes.md"),
		"{refused:?}"
	);
	assert_eq!(documents.open(&root, SPACE, "notes.md").expect("opens").state, served);
	assert_eq!(fs::read(space_dir(&root, SPACE).join("notes.md")).expect("read"), b"base");
	assert_eq!(stored_state_of(&root, "notes.md"), stored);
}

#[test]
fn an_update_past_the_size_limit_leaves_the_document_and_the_file_unchanged() {
	let root = temp_root();
	let base = "a".repeat(MAX_DOCUMENT_BYTES as usize - 2);
	put(&root, SPACE, "big.md", base.as_bytes());
	let documents = Documents::default();
	let served = documents.open(&root, SPACE, "big.md").expect("opens").state;
	let stored = stored_state_of(&root, "big.md");
	let grown = YjsClient::of(&BASE64_STANDARD.encode(&served)).inserted(0, "xyz");

	let refused = documents.apply(
		&root,
		SPACE,
		"big.md",
		&BASE64_STANDARD.decode(grown).expect("base64"),
		|_| {},
	);

	assert_eq!(
		refused,
		Err(LibraryError::TooLarge {
			name: "big.md".to_owned(),
			bytes: MAX_DOCUMENT_BYTES + 1,
			limit: MAX_DOCUMENT_BYTES
		})
	);
	assert_eq!(documents.open(&root, SPACE, "big.md").expect("opens").state, served);
	assert_eq!(fs::read_to_string(space_dir(&root, SPACE).join("big.md")).expect("read"), base);
	assert_eq!(stored_state_of(&root, "big.md"), stored);
}

fn bytes_of(update: &str) -> Vec<u8> {
	BASE64_STANDARD.decode(update).expect("base64")
}

#[test]
fn an_update_made_before_a_restart_still_merges_after_it() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let served = Documents::default().open(&root, SPACE, "notes.md").expect("opens").state;
	let member = YjsClient::of(&BASE64_STANDARD.encode(&served)).inserted(4, " member");

	let restarted = Documents::default();
	restarted
		.apply(&root, SPACE, "notes.md", &bytes_of(&member), |_| {})
		.expect("the update merges");

	assert_eq!(
		fs::read_to_string(space_dir(&root, SPACE).join("notes.md")).expect("read"),
		"base member"
	);
}

#[test]
fn a_file_edited_outside_is_taken_as_one_host_edit_that_still_merges_with_members() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let served = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let member = YjsClient::of(&BASE64_STANDARD.encode(&served)).inserted(0, "Member: ");
	put(&root, SPACE, "notes.md", b"base, edited outside");

	let reopened = documents.open(&root, SPACE, "notes.md").expect("opens");
	documents
		.apply(&root, SPACE, "notes.md", &bytes_of(&member), |_| {})
		.expect("the update merges");

	assert!(reopened.host_edit.is_some());
	assert_eq!(
		YjsClient::of(&BASE64_STANDARD.encode(&reopened.state)).text(),
		"base, edited outside"
	);
	assert_eq!(
		fs::read_to_string(space_dir(&root, SPACE).join("notes.md")).expect("read"),
		"Member: base, edited outside"
	);
}

#[test]
fn an_unchanged_file_opens_without_a_host_edit() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	documents.open(&root, SPACE, "notes.md").expect("opens");

	let reopened = documents.open(&root, SPACE, "notes.md").expect("opens");
	let after_restart = Documents::default().open(&root, SPACE, "notes.md").expect("opens");

	assert!(reopened.host_edit.is_none());
	assert!(after_restart.host_edit.is_none());
	assert_eq!(state_vector_of(&after_restart.state), state_vector_of(&reopened.state));
}

const MARKDOWN_ON_MAIN: &[u8] = include_bytes!("../../tests/vectors/library-markdown-on-main.md");

const STATE_ON_MAIN: &[u8] = include_bytes!("../../tests/vectors/library-markdown-on-main.yjs");

#[test]
fn a_document_and_its_state_stored_before_document_kinds_open_unchanged() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", MARKDOWN_ON_MAIN);
	let state_dir = root.join(".documents").join(SPACE);
	fs::create_dir_all(&state_dir).expect("the state folder lands");
	fs::write(state_dir.join("notes.md.yjs"), STATE_ON_MAIN).expect("the state lands");

	let opened = Documents::default().open(&root, SPACE, "notes.md").expect("opens");

	assert!(opened.host_edit.is_none());
	assert_eq!(opened.state, STATE_ON_MAIN);
	assert_eq!(stored_state_of(&root, "notes.md"), STATE_ON_MAIN);
	assert_eq!(file_text(&root, "notes.md").as_bytes(), MARKDOWN_ON_MAIN);
}

#[test]
fn the_stored_state_stays_out_of_the_library_folder_and_its_listing() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let served = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let member = YjsClient::of(&BASE64_STANDARD.encode(&served)).inserted(4, " member");
	documents
		.apply(&root, SPACE, "notes.md", &bytes_of(&member), |_| {})
		.expect("the update merges");

	let in_the_folder: Vec<String> = fs::read_dir(space_dir(&root, SPACE))
		.expect("the folder reads")
		.map(|entry| entry.expect("an entry").file_name().to_string_lossy().into_owned())
		.collect();

	assert_eq!(names(&root, SPACE), ["notes.md"]);
	assert_eq!(in_the_folder, ["notes.md"]);
}

#[test]
fn a_forgotten_space_drops_its_documents_and_their_stored_state() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	put(&root, "kept", "notes.md", b"kept");
	let documents = Documents::default();
	let first = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let kept = documents.open(&root, "kept", "notes.md").expect("opens").state;
	let stored = fs::read_dir(root.join(".documents")).expect("the state folder reads").count();

	documents.forget(&root, SPACE).expect("the space is forgotten");

	assert_eq!(stored, 2);
	assert!(!root.join(".documents").join(SPACE).exists());
	let second = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	assert_ne!(state_vector_of(&second), state_vector_of(&first));
	assert_eq!(documents.open(&root, "kept", "notes.md").expect("opens").state, kept);
}

#[tokio::test]
async fn deleting_a_space_removes_the_stored_state_of_its_documents() {
	let app = a_host("documents-deleted");
	let space_id = a_space(&app, "Gone").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	opened(&app, &space_id, "notes.md").await;
	assert!(root.join(".documents").join(&space_id).exists());

	space_delete(app.handle().clone(), app.state(), space_id.clone())
		.await
		.expect("the space is deleted");

	assert!(!root.join(".documents").join(&space_id).exists());
}

fn picture(width: u32, height: u32, red: u8) -> Vec<u8> {
	let picture = DynamicImage::ImageRgb8(RgbImage::from_pixel(width, height, Rgb([red, 40, 10])));
	let mut bytes = Cursor::new(Vec::new());
	picture.write_to(&mut bytes, ImageFormat::Png).expect("the picture encodes");
	bytes.into_inner()
}

fn imported_as(root: &Path, name: &str, bytes: &[u8]) -> Result<LibraryItem, LibraryError> {
	import(root, SPACE, name, &base64_of(bytes))
}

fn entries(root: &Path) -> Vec<String> {
	let Ok(listed) = fs::read_dir(space_dir(root, SPACE)) else {
		return Vec::new();
	};
	let mut names: Vec<String> = listed
		.map(|entry| entry.expect("the entry reads").file_name().to_string_lossy().into_owned())
		.collect();
	names.sort();
	names
}

fn thumbnails(root: &Path) -> usize {
	fs::read_dir(space_dir(root, SPACE).join(THUMBNAILS_DIR)).map_or(0, Iterator::count)
}

fn thumbnail_pixels(thumbnail: &LibraryImage) -> DynamicImage {
	let png = BASE64_STANDARD.decode(&thumbnail.content).expect("the thumbnail is base64");
	image::load_from_memory_with_format(&png, ImageFormat::Png).expect("the thumbnail decodes")
}

#[test]
fn an_imported_image_and_document_are_listed_and_the_image_has_a_thumbnail_of_at_most_512() {
	let root = temp_root();

	let image = imported_as(&root, "cover.png", &picture(1200, 800, 200)).expect("the image lands");
	let document = imported_as(&root, "notes.md", b"# notes").expect("the document lands");
	let thumbnail = read_thumbnail(&root, SPACE, "cover.png").expect("the thumbnail reads");

	let mut listed = list(&root, SPACE).expect("the library lists");
	listed.sort_by(|a, b| a.name.cmp(&b.name));
	assert_eq!(listed, [image, document]);
	assert_eq!(thumbnails(&root), 1);
	assert_eq!(entries(&root), [THUMBNAILS_DIR, "cover.png", "notes.md"]);
	assert_eq!(thumbnail.mime_type, "image/png");
	assert_eq!(
		(thumbnail_pixels(&thumbnail).width(), thumbnail_pixels(&thumbnail).height()),
		(512, 341)
	);
	assert_eq!(
		read_document(&root, SPACE, "notes.md").expect("the document reads").content,
		"# notes"
	);
}

#[test]
fn an_image_under_512_keeps_its_size_in_its_thumbnail() {
	let root = temp_root();
	imported_as(&root, "small.png", &picture(30, 20, 9)).expect("the image lands");

	let thumbnail = read_thumbnail(&root, SPACE, "small.png").expect("the thumbnail reads");

	assert_eq!(
		(thumbnail_pixels(&thumbnail).width(), thumbnail_pixels(&thumbnail).height()),
		(30, 20)
	);
}

#[test]
fn a_taken_name_lands_under_the_next_free_number_and_the_older_file_keeps_its_bytes() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"first");

	let second = imported_as(&root, "notes.md", b"second").expect("the second lands");
	let third = imported_as(&root, "notes.md", b"third").expect("the third lands");
	let image = imported_as(&root, "cover.png", &picture(2, 2, 1)).expect("the image lands");
	let image_again = imported_as(&root, "cover.png", &picture(2, 2, 1)).expect("it lands again");

	assert_eq!((second.name.as_str(), third.name.as_str()), ("notes (2).md", "notes (3).md"));
	assert_eq!((image.name.as_str(), image_again.name.as_str()), ("cover.png", "cover (2).png"));
	assert_eq!(read(&root, "notes.md").expect("the first reads").content, "first");
	assert_eq!(read(&root, "notes (2).md").expect("the second reads").content, "second");
	assert_eq!(read(&root, "notes (3).md").expect("the third reads").content, "third");
}

#[test]
fn concurrent_imports_of_one_name_each_land_under_their_own_name() {
	let root = temp_root();
	let landed: Vec<(String, String)> = std::thread::scope(|scope| {
		let imports: Vec<_> = (0..8)
			.map(|index| {
				let root = &root;
				scope.spawn(move || {
					let content = format!("import {index}");
					let item = imported_as(root, "same.md", content.as_bytes()).expect("it lands");
					(item.name, content)
				})
			})
			.collect();
		imports.into_iter().map(|import| import.join().expect("the import ends")).collect()
	});

	let mut names: Vec<&str> = landed.iter().map(|(name, _)| name.as_str()).collect();
	names.sort_unstable();
	names.dedup();
	assert_eq!(names.len(), 8);
	for (name, content) in &landed {
		assert_eq!(&read(&root, name).expect("the import reads").content, content);
	}
	assert_eq!(entries(&root).len(), 8);
}

#[test]
fn each_refused_import_says_why_and_writes_nothing() {
	let root = temp_root();
	let named = |name: &str| name.to_owned();
	let document_limit = MAX_DOCUMENT_BYTES;
	let relayed_limit = MAX_RELAYED_IMPORT_BYTES;

	assert_eq!(
		imported_as(&root, "../escape.md", b"x"),
		Err(LibraryError::InvalidName { name: named("../escape.md") })
	);
	assert_eq!(
		imported_as(&root, "song.mp3", b"x"),
		Err(LibraryError::Unsupported { name: named("song.mp3") })
	);
	assert_eq!(
		imported_as(&root, ".hidden.md", b"x"),
		Err(LibraryError::InvalidName { name: named(".hidden.md") })
	);
	assert_eq!(
		imported_as(&root, "big.md", &vec![b'a'; document_limit as usize + 1]),
		Err(LibraryError::TooLarge {
			name: named("big.md"),
			bytes: document_limit + 1,
			limit: document_limit
		})
	);
	assert_eq!(
		imported_as(&root, "big.png", &vec![0; relayed_limit as usize + 1]),
		Err(LibraryError::TooLarge {
			name: named("big.png"),
			bytes: relayed_limit + 1,
			limit: relayed_limit
		})
	);
	assert!(matches!(
		imported_as(&root, "broken.png", b"not a png"),
		Err(LibraryError::Undecodable { name, .. }) if name == "broken.png"
	));
	assert!(matches!(
		import(&root, SPACE, "notes.md", "not base64!"),
		Err(LibraryError::Undecodable { name, .. }) if name == "notes.md"
	));
	assert_eq!(
		imported_as(&root, "latin.md", &[0xff, 0xfe]),
		Err(LibraryError::NotUtf8 { name: named("latin.md") })
	);
	assert!(entries(&root).is_empty());
}

#[test]
fn a_link_that_fails_after_staging_removes_the_staged_file() {
	let root = temp_root();
	let longest = format!("{}.md", "a".repeat(252));
	put(&root, SPACE, &longest, b"kept");

	let refused = imported_as(&root, &longest, b"new");

	assert!(matches!(refused, Err(LibraryError::Unwritable { .. })), "{refused:?}");
	assert_eq!(entries(&root), [longest.as_str()]);
	assert_eq!(read(&root, &longest).expect("the older file reads").content, "kept");
}

#[test]
fn a_thumbnail_that_fails_to_store_takes_the_landed_image_back_out() {
	let root = temp_root();
	put(&root, SPACE, THUMBNAILS_DIR, b"a file where the folder goes");

	let refused = imported_as(&root, "cover.png", &picture(4, 4, 1));

	assert!(matches!(refused, Err(LibraryError::Unwritable { .. })), "{refused:?}");
	assert_eq!(entries(&root), [THUMBNAILS_DIR]);
}

#[test]
fn a_missing_thumbnail_is_produced_once_and_a_replaced_image_never_answers_the_older_one() {
	let root = temp_root();
	put(&root, SPACE, "cover.png", &picture(900, 300, 250));
	touch(&root, SPACE, "cover.png", 1_000);

	let first = read_thumbnail(&root, SPACE, "cover.png").expect("the thumbnail is produced");
	let again = read_thumbnail(&root, SPACE, "cover.png").expect("the thumbnail is stored");
	let stored = thumbnails(&root);
	put(&root, SPACE, "cover.png", &picture(900, 300, 5));
	touch(&root, SPACE, "cover.png", 2_000);
	let replaced = read_thumbnail(&root, SPACE, "cover.png").expect("the new thumbnail reads");

	assert_eq!(first, again);
	assert_eq!(stored, 1);
	assert_eq!((thumbnail_pixels(&first).width(), thumbnail_pixels(&first).height()), (512, 171));
	assert_eq!(thumbnail_pixels(&first).to_rgb8().get_pixel(0, 0)[0], 250);
	assert_eq!(thumbnail_pixels(&replaced).to_rgb8().get_pixel(0, 0)[0], 5);
	assert_eq!(names(&root, SPACE), ["cover.png"]);
}

#[test]
fn a_thumbnail_read_keeps_the_image_read_refusals() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	put(&root, SPACE, "broken.png", b"not a png");

	assert_eq!(
		read_thumbnail(&root, SPACE, "notes.md"),
		Err(LibraryError::NotAnImage { name: "notes.md".to_owned() })
	);
	assert_eq!(
		read_thumbnail(&root, SPACE, "absent.png"),
		Err(LibraryError::Missing { name: "absent.png".to_owned() })
	);
	assert_eq!(
		read_thumbnail(&root, SPACE, "../s2/cover.png"),
		Err(LibraryError::InvalidName { name: "../s2/cover.png".to_owned() })
	);
	assert!(matches!(
		read_thumbnail(&root, SPACE, "broken.png"),
		Err(LibraryError::Undecodable { name, .. }) if name == "broken.png"
	));
	assert_eq!(thumbnails(&root), 0);
}

#[test]
fn dropped_paths_answer_one_result_each_in_their_order() {
	let root = temp_root();
	let dropped = temp_root();
	fs::create_dir_all(&*dropped).expect("the drop folder lands");
	fs::write(dropped.join("notes.md"), "dropped notes").expect("the document lands");
	fs::write(dropped.join("song.mp3"), "la").expect("the song lands");
	fs::write(dropped.join("cover.png"), picture(3, 3, 1)).expect("the image lands");
	File::create(dropped.join("huge.md"))
		.expect("the file lands")
		.set_len(MAX_DOCUMENT_BYTES + 1)
		.expect("the file grows");
	let paths = ["notes.md", "song.mp3", "absent.png", "huge.md", "cover.png"]
		.map(|name| dropped.join(name))
		.to_vec();

	let outcomes = import_paths(&root, SPACE, &paths);

	let landed = |name: &str| {
		let item = list(&root, SPACE)
			.expect("the library lists")
			.into_iter()
			.find(|item| item.name == name);
		LibraryImport::Imported { item: item.expect("the import is listed") }
	};
	assert_eq!(
		outcomes,
		[
			landed("notes.md"),
			LibraryImport::Refused {
				error: LibraryError::Unsupported { name: "song.mp3".to_owned() }
			},
			LibraryImport::Refused {
				error: LibraryError::Missing { name: "absent.png".to_owned() }
			},
			LibraryImport::Refused {
				error: LibraryError::TooLarge {
					name: "huge.md".to_owned(),
					bytes: MAX_DOCUMENT_BYTES + 1,
					limit: MAX_DOCUMENT_BYTES
				}
			},
			landed("cover.png"),
		]
	);
	assert_eq!(read(&root, "notes.md").expect("the document reads").content, "dropped notes");
	assert_eq!(thumbnails(&root), 1);
}

#[test]
fn a_dropped_image_takes_the_local_limit_above_the_relayed_one() {
	let root = temp_root();
	let dropped = temp_root();
	fs::create_dir_all(&*dropped).expect("the drop folder lands");
	let huge = dropped.join("huge.png");
	File::create(&huge).expect("the file lands").set_len(MAX_IMAGE_BYTES + 1).expect("it grows");

	let outcomes = import_paths(&root, SPACE, &[huge]);

	assert_eq!(
		outcomes,
		[LibraryImport::Refused {
			error: LibraryError::TooLarge {
				name: "huge.png".to_owned(),
				bytes: MAX_IMAGE_BYTES + 1,
				limit: MAX_IMAGE_BYTES
			}
		}]
	);
}

#[tokio::test]
async fn the_import_commands_refuse_an_unknown_space_and_land_in_a_known_one() {
	let app = a_host("import");
	let space_id = a_space(&app, "Work").await;
	let dropped = temp_root();
	fs::create_dir_all(&*dropped).expect("the drop folder lands");
	fs::write(dropped.join("dropped.md"), "dropped").expect("the document lands");
	let unknown = || LibraryError::UnknownSpace { id: "nowhere".to_owned() };
	let handle = || app.handle().clone();

	let refused = library_import(
		handle(),
		app.state(),
		"nowhere".to_owned(),
		"notes.md".to_owned(),
		base64_of(b"x"),
	)
	.await;
	let refused_paths = library_import_paths(
		handle(),
		app.state(),
		"nowhere".to_owned(),
		vec![dropped.join("dropped.md")],
	)
	.await;
	let refused_thumbnail =
		library_read_thumbnail(handle(), app.state(), "nowhere".to_owned(), "cover.png".to_owned())
			.await;
	let sent = library_import(
		handle(),
		app.state(),
		space_id.clone(),
		"cover.png".to_owned(),
		base64_of(&picture(600, 600, 1)),
	)
	.await
	.expect("the sent image lands");
	let dropped_outcomes = library_import_paths(
		handle(),
		app.state(),
		space_id.clone(),
		vec![dropped.join("dropped.md")],
	)
	.await
	.expect("the drop is read");
	let thumbnail =
		library_read_thumbnail(handle(), app.state(), space_id.clone(), "cover.png".to_owned())
			.await
			.expect("the thumbnail reads");
	let listed = library_list(handle(), app.state(), space_id).await.expect("the library lists");

	assert_eq!(
		(refused, refused_paths, refused_thumbnail),
		(Err(unknown()), Err(unknown()), Err(unknown()))
	);
	assert!(
		matches!(&dropped_outcomes[..], [LibraryImport::Imported { item }] if item.name == "dropped.md")
	);
	assert!(listed.contains(&sent));
	assert_eq!(thumbnail_pixels(&thumbnail).width(), 512);
}

#[test]
fn an_encoded_payload_over_the_relayed_cap_is_refused_before_it_is_decoded() {
	let root = temp_root();
	let bound = MAX_RELAYED_IMPORT_BYTES.div_ceil(3) * 4;
	let undecodable_over_the_bound = "!".repeat(bound as usize + 4);
	let undecodable_at_the_bound = "!".repeat(bound as usize);

	let refused = import(&root, SPACE, "big.png", &undecodable_over_the_bound);
	let decoded = import(&root, SPACE, "big.png", &undecodable_at_the_bound);

	assert_eq!(
		refused,
		Err(LibraryError::TooLarge {
			name: "big.png".to_owned(),
			bytes: (bound + 4) * 3 / 4,
			limit: MAX_RELAYED_IMPORT_BYTES
		})
	);
	assert!(matches!(decoded, Err(LibraryError::Undecodable { .. })), "{decoded:?}");
	assert!(entries(&root).is_empty());
}

#[test]
fn a_name_starting_with_a_dot_is_refused_by_both_imports_and_writes_nothing() {
	let root = temp_root();
	let dropped = temp_root();
	fs::create_dir_all(&*dropped).expect("the drop folder lands");
	let hidden = [".env", THUMBNAILS_DIR, ".import-staged.md"];
	for name in hidden {
		fs::write(dropped.join(name), "hidden").expect("the hidden file lands");
	}
	let paths: Vec<PathBuf> = hidden.iter().map(|name| dropped.join(name)).collect();
	let invalid = |name: &str| LibraryError::InvalidName { name: name.to_owned() };

	let sent: Vec<_> = hidden.map(|name| imported_as(&root, name, b"hidden")).to_vec();
	let outcomes = import_paths(&root, SPACE, &paths);

	assert_eq!(sent, hidden.map(|name| Err(invalid(name))));
	assert_eq!(outcomes, hidden.map(|name| LibraryImport::Refused { error: invalid(name) }));
	assert!(entries(&root).is_empty());
}

#[tokio::test]
async fn a_picked_image_read_then_imported_lands_what_importing_its_path_lands() {
	let picked = temp_root();
	fs::create_dir_all(&*picked).expect("the picked folder lands");
	let path = picked.join("cover.png");
	let bytes = picture(600, 400, 90);
	fs::write(&path, &bytes).expect("the picked image lands");
	let sent_root = temp_root();
	let dropped_root = temp_root();

	let read = library_read_picked_image(path.clone()).await.expect("the picked image reads");
	let sent = import(&sent_root, SPACE, &read.name, &read.content).expect("the sent image lands");
	let dropped = match &import_paths(&dropped_root, SPACE, &[path])[..] {
		[LibraryImport::Imported { item }] => item.clone(),
		outcomes => panic!("the dropped image was refused: {outcomes:?}"),
	};
	let landed_bytes = |root: &Path, item: &LibraryItem| {
		fs::read(space_dir(root, SPACE).join(&item.name)).expect("the landed image reads")
	};

	assert_eq!(
		read,
		LibraryImage {
			name: "cover.png".to_owned(),
			mime_type: "image/png".to_owned(),
			content: base64_of(&bytes),
		}
	);
	assert_eq!((&sent.name, sent.kind), (&dropped.name, dropped.kind));
	assert_eq!(landed_bytes(&sent_root, &sent), landed_bytes(&dropped_root, &dropped));
	assert_eq!(landed_bytes(&sent_root, &sent), bytes);
}

#[cfg(unix)]
#[test]
fn a_picked_image_is_refused_by_name_type_size_presence_and_permission() {
	use std::os::unix::fs::PermissionsExt;

	let picked = temp_root();
	fs::create_dir_all(&*picked).expect("the picked folder lands");
	for name in ["notes.md", "archive.zip", "locked.png", "huge.png"] {
		fs::write(picked.join(name), "picked").expect("the picked file lands");
	}
	File::options()
		.write(true)
		.open(picked.join("huge.png"))
		.expect("the file opens")
		.set_len(MAX_RELAYED_IMPORT_BYTES + 1)
		.expect("the file grows");
	for name in ["locked.png", "huge.png"] {
		fs::set_permissions(picked.join(name), fs::Permissions::from_mode(0o000))
			.expect("the file locks");
	}
	fs::create_dir(picked.join("folder.png")).expect("the picked folder lands");
	let read = |name: &str| read_picked_image(&picked.join(name));

	assert_eq!(read("notes.md"), Err(LibraryError::NotAnImage { name: "notes.md".to_owned() }));
	assert_eq!(
		read("archive.zip"),
		Err(LibraryError::Unsupported { name: "archive.zip".to_owned() })
	);
	assert_eq!(read("gone.png"), Err(LibraryError::Missing { name: "gone.png".to_owned() }));
	assert!(matches!(read("locked.png"), Err(LibraryError::Unreadable { .. })));
	assert!(matches!(read("folder.png"), Err(LibraryError::Unreadable { .. })));
	assert_eq!(
		read("huge.png"),
		Err(LibraryError::TooLarge {
			name: "huge.png".to_owned(),
			bytes: MAX_RELAYED_IMPORT_BYTES + 1,
			limit: MAX_RELAYED_IMPORT_BYTES
		})
	);
}

#[test]
fn a_picked_image_growing_past_the_limit_is_read_no_further_and_refused() {
	let endless = std::io::repeat(0);

	assert_eq!(
		bytes_within("grown.png", endless, MAX_RELAYED_IMPORT_BYTES),
		Err(LibraryError::TooLarge {
			name: "grown.png".to_owned(),
			bytes: MAX_RELAYED_IMPORT_BYTES + 1,
			limit: MAX_RELAYED_IMPORT_BYTES
		})
	);
}

fn heard_renames(app: &App<MockRuntime>) -> mpsc::Receiver<LibraryDocumentRenamed> {
	let (told, heard) = mpsc::channel();
	app.listen_any(events::LIBRARY_DOCUMENT_RENAMED.name(), move |event| {
		let renamed = serde_json::from_str(event.payload()).expect("a rename payload");
		told.send(renamed).expect("the test listens");
	});
	heard
}

async fn renamed(
	app: &App<MockRuntime>,
	space_id: &str,
	name: &str,
	new_name: &str,
) -> Result<contract::LibraryItem, LibraryError> {
	library_rename_document(
		app.handle().clone(),
		app.state(),
		space_id.to_owned(),
		name.to_owned(),
		new_name.to_owned(),
	)
	.await
}

fn on_disk(root: &Path, space_id: &str, name: &str) -> String {
	fs::read_to_string(space_dir(root, space_id).join(name)).expect("the file reads")
}

#[tokio::test]
async fn a_renamed_document_moves_with_its_shared_state_and_is_announced() {
	let app = a_host("rename");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let heard = heard_renames(&app);
	let before = opened(&app, &space_id, "notes.md").await;

	let item = renamed(&app, &space_id, "notes.md", "plan.md").await.expect("the rename lands");

	assert_eq!(
		(item.name.as_str(), item.kind, item.bytes),
		("plan.md", LibraryItemKind::Document, 4)
	);
	assert_eq!(names(&root, &space_id), ["plan.md"]);
	assert_eq!(on_disk(&root, &space_id, "plan.md"), "base");
	assert_eq!(opened(&app, &space_id, "plan.md").await, before);
	let states = root.join(".documents").join(&space_id);
	assert!(states.join("plan.md.yjs").exists());
	assert!(!states.join("notes.md.yjs").exists());
	let announced = heard.recv_timeout(Duration::from_secs(5)).expect("the rename is announced");
	assert_eq!(
		announced,
		LibraryDocumentRenamed {
			space_id: space_id.clone(),
			former_name: "notes.md".to_owned(),
			name: "plan.md".to_owned(),
		}
	);
}

#[test]
fn a_renamed_document_opens_on_its_stored_state_after_a_restart() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let before_restart = Documents::default();
	let before = before_restart.open(&root, SPACE, "notes.md").expect("opens").state;

	before_restart.rename(&root, SPACE, "notes.md", "plan.md", |_| {}).expect("the rename lands");

	let restarted = Documents::default();
	assert_eq!(restarted.open(&root, SPACE, "plan.md").expect("opens").state, before);
}

#[tokio::test]
async fn a_rename_onto_a_taken_name_lands_on_the_first_free_numbered_name() {
	let app = a_host("rename-taken");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"older");
	put(&root, &space_id, "draft.md", b"draft");
	put(&root, &space_id, "sketch.md", b"sketch");

	let second = renamed(&app, &space_id, "draft.md", "notes.md").await.expect("lands");
	let third = renamed(&app, &space_id, "sketch.md", "notes.md").await.expect("lands");

	assert_eq!((second.name.as_str(), third.name.as_str()), ("notes (2).md", "notes (3).md"));
	assert_eq!(on_disk(&root, &space_id, "notes.md"), "older");
	assert_eq!(on_disk(&root, &space_id, "notes (2).md"), "draft");
	assert_eq!(on_disk(&root, &space_id, "notes (3).md"), "sketch");
	let mut listed = names(&root, &space_id);
	listed.sort();
	assert_eq!(listed, ["notes (2).md", "notes (3).md", "notes.md"]);
}

#[tokio::test]
async fn updates_sent_before_and_to_the_former_name_after_a_rename_both_land_in_the_file() {
	let app = a_host("rename-updates");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let heard = heard_updates(&app);
	let member = YjsClient::of(&opened(&app, &space_id, "notes.md").await);
	let before = member.inserted(4, " before");

	applied(&app, &space_id, "notes.md", &before).await.expect("the update merges");
	renamed(&app, &space_id, "notes.md", "plan.md").await.expect("the rename lands");
	let after = member.inserted(11, " after");
	applied(&app, &space_id, "notes.md", &after).await.expect("the late update merges");

	assert_eq!(on_disk(&root, &space_id, "plan.md"), "base before after");
	assert_eq!(names(&root, &space_id), ["plan.md"]);
	let announced: Vec<String> =
		heard_count(&heard, 3).into_iter().map(|updated| updated.name).collect();
	assert_eq!(announced, ["notes.md", "notes.md", "plan.md"]);
}

#[test]
fn an_update_to_a_former_name_a_new_file_now_holds_lands_in_that_file() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	documents.rename(&root, SPACE, "notes.md", "plan.md", |_| {}).expect("the rename lands");
	put(&root, SPACE, "notes.md", b"fresh");
	let member = YjsClient::of(
		&BASE64_STANDARD.encode(documents.open(&root, SPACE, "notes.md").expect("opens").state),
	);

	let mut announced = Vec::new();
	documents
		.apply(&root, SPACE, "notes.md", &bytes_of(&member.inserted(5, "!")), |applied| {
			announced.push(applied.name.clone());
		})
		.expect("the update merges");

	assert_eq!(announced, ["notes.md"]);
	assert_eq!(file_text(&root, "notes.md"), "fresh!");
	assert_eq!(file_text(&root, "plan.md"), "base");
}

#[test]
fn an_update_to_the_first_name_follows_a_document_renamed_twice() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let member = YjsClient::of(
		&BASE64_STANDARD.encode(documents.open(&root, SPACE, "notes.md").expect("opens").state),
	);
	documents.rename(&root, SPACE, "notes.md", "plan.md", |_| {}).expect("the rename lands");
	documents.rename(&root, SPACE, "plan.md", "final.md", |_| {}).expect("the rename lands");

	let mut announced = Vec::new();
	documents
		.apply(&root, SPACE, "notes.md", &bytes_of(&member.inserted(4, "!")), |applied| {
			announced.push(applied.name.clone());
		})
		.expect("the update merges");

	assert_eq!(announced, ["final.md"]);
	assert_eq!(file_text(&root, "final.md"), "base!");
	assert_eq!(names(&root, SPACE), ["final.md"]);
}

#[tokio::test]
async fn a_rename_to_the_same_name_answers_the_document_and_changes_nothing() {
	let app = a_host("rename-same");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let heard = heard_renames(&app);

	let item = renamed(&app, &space_id, "notes.md", "notes.md").await.expect("answers");

	assert_eq!((item.name.as_str(), item.bytes), ("notes.md", 4));
	assert_eq!(names(&root, &space_id), ["notes.md"]);
	assert_eq!(on_disk(&root, &space_id, "notes.md"), "base");
	assert!(heard.try_recv().is_err());
}

#[tokio::test]
async fn a_refused_rename_answers_why_and_changes_nothing() {
	let app = a_host("rename-refused");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	put(&root, &space_id, "todo.txt", b"todo");
	put(&root, &space_id, "cover.png", b"png");
	let heard = heard_renames(&app);
	let missing = |name: &str| LibraryError::Missing { name: name.to_owned() };
	let invalid = |name: &str| LibraryError::InvalidName { name: name.to_owned() };

	let refusals = [
		("gone.md", "plan.md", missing("gone.md")),
		("cover.png", "plan.png", missing("cover.png")),
		("notes.md", "../plan.md", invalid("../plan.md")),
		("notes.md", "sub/plan.md", invalid("sub/plan.md")),
		("notes.md", "", invalid("")),
		("notes.md", ".plan.md", invalid(".plan.md")),
		("notes.md", "plan.txt", invalid("plan.txt")),
		("notes.md", "plan", invalid("plan")),
		("notes.md", "plan.png", invalid("plan.png")),
		("todo.txt", "todo.md", invalid("todo.md")),
	];
	for (name, new_name, refusal) in refusals {
		assert_eq!(renamed(&app, &space_id, name, new_name).await, Err(refusal), "{new_name}");
	}
	let unknown = renamed(&app, "nowhere", "notes.md", "plan.md").await;

	assert_eq!(unknown, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	let mut listed = names(&root, &space_id);
	listed.sort();
	assert_eq!(listed, ["cover.png", "notes.md", "todo.txt"]);
	assert_eq!(on_disk(&root, &space_id, "notes.md"), "base");
	assert!(!root.join("plan.md").exists());
	assert!(heard.try_recv().is_err());
}

#[test]
fn a_rename_that_cannot_move_the_stored_state_keeps_the_former_file_and_drops_the_claimed_name() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let before = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let blocking = root.join(".documents").join(SPACE).join("plan.md.yjs");
	fs::create_dir_all(blocking.join("taken")).expect("the blocking folder lands");

	let refused = documents.rename(&root, SPACE, "notes.md", "plan.md", |_| {});

	assert!(matches!(refused, Err(LibraryError::Unwritable { .. })), "{refused:?}");
	assert_eq!(names(&root, SPACE), ["notes.md"]);
	assert_eq!(file_text(&root, "notes.md"), "base");
	assert_eq!(stored_state_of(&root, "notes.md"), before);
	assert_eq!(documents.open(&root, SPACE, "notes.md").expect("opens").state, before);
}

fn state_names(root: &Path, space_id: &str) -> Vec<String> {
	let states = fs::read_dir(root.join(".documents").join(space_id)).expect("the states read");
	let mut names: Vec<String> = states
		.map(|entry| entry.expect("an entry").file_name().to_string_lossy().into_owned())
		.collect();
	names.sort();
	names
}

#[tokio::test]
async fn a_case_only_rename_lands_on_the_exact_name_with_its_state_and_takes_late_updates() {
	let app = a_host("rename-case");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let heard = heard_renames(&app);
	let heard_edits = heard_updates(&app);
	let before = opened(&app, &space_id, "notes.md").await;
	let member = YjsClient::of(&before);

	let item = renamed(&app, &space_id, "notes.md", "Notes.md").await.expect("the rename lands");

	assert_eq!(item.name, "Notes.md");
	assert_eq!(names(&root, &space_id), ["Notes.md"]);
	assert_eq!(on_disk(&root, &space_id, "Notes.md"), "base");
	assert_eq!(state_names(&root, &space_id), ["Notes.md.yjs"]);
	assert_eq!(opened(&app, &space_id, "Notes.md").await, before);
	assert_eq!(
		heard.recv_timeout(Duration::from_secs(5)).expect("the rename is announced"),
		LibraryDocumentRenamed {
			space_id: space_id.clone(),
			former_name: "notes.md".to_owned(),
			name: "Notes.md".to_owned(),
		}
	);
	applied(&app, &space_id, "notes.md", &member.inserted(4, "!")).await.expect("merges");
	let reopened = YjsClient::of(&opened(&app, &space_id, "Notes.md").await);

	assert_eq!(on_disk(&root, &space_id, "Notes.md"), "base!");
	assert_eq!(reopened.text(), "base!");
	let announced: Vec<String> =
		heard_count(&heard_edits, 2).into_iter().map(|updated| updated.name).collect();
	assert_eq!(announced, ["notes.md", "Notes.md"]);
	assert!(heard_edits.try_recv().is_err());
}

#[tokio::test]
async fn a_rename_onto_the_case_variant_of_another_file_keeps_the_numbered_rule() {
	let app = a_host("rename-case-other");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"older");
	put(&root, &space_id, "draft.md", b"draft");
	let is_case_sensitive = !space_dir(&root, &space_id).join("NOTES.md").exists();

	let item = renamed(&app, &space_id, "draft.md", "NOTES.md").await.expect("the rename lands");

	let landed = if is_case_sensitive { "NOTES.md" } else { "NOTES (2).md" };
	assert_eq!(item.name, landed);
	assert_eq!(on_disk(&root, &space_id, "notes.md"), "older");
	assert_eq!(on_disk(&root, &space_id, landed), "draft");
	assert!(!space_dir(&root, &space_id).join("draft.md").exists());
}

#[cfg(unix)]
#[test]
fn a_case_only_rename_that_cannot_move_the_file_keeps_it_and_its_state_under_the_former_name() {
	use std::os::unix::fs::PermissionsExt;

	let root = temp_root();
	put(&root, SPACE, "notes.md", b"base");
	let documents = Documents::default();
	let before = documents.open(&root, SPACE, "notes.md").expect("opens").state;
	let dir = space_dir(&root, SPACE);
	let set_mode = |mode| {
		fs::set_permissions(&dir, fs::Permissions::from_mode(mode)).expect("the mode lands");
	};

	set_mode(0o500);
	let refused = documents.rename(&root, SPACE, "notes.md", "Notes.md", |_| {});
	set_mode(0o700);

	assert!(matches!(refused, Err(LibraryError::Unwritable { .. })), "{refused:?}");
	assert_eq!(names(&root, SPACE), ["notes.md"]);
	assert_eq!(file_text(&root, "notes.md"), "base");
	assert_eq!(state_names(&root, SPACE), ["notes.md.yjs"]);
	assert_eq!(documents.open(&root, SPACE, "notes.md").expect("opens").state, before);
}

#[tokio::test]
async fn an_update_to_the_landed_name_racing_a_rename_returns_only_after_the_rename_is_announced() {
	let app = a_host("rename-race");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let order = Arc::new(Mutex::new(Vec::new()));
	let (told, applied) = mpsc::channel();
	let (heard, handle, library) = (Arc::clone(&order), app.handle().clone(), root.clone());
	let shared_space = space_id.clone();
	app.listen_any(events::LIBRARY_DOCUMENT_RENAMED.name(), move |event| {
		let renamed: LibraryDocumentRenamed =
			serde_json::from_str(event.payload()).expect("a rename payload");
		let (racing, handle, library) = (Arc::clone(&heard), handle.clone(), library.clone());
		let (space_id, told) = (shared_space.clone(), told.clone());
		let landed = renamed.name.clone();
		std::thread::spawn(move || {
			let result = apply_update(&handle, &library, &space_id, &landed, "AAA=");
			racing.lock().expect("the order").push(format!("updated {landed}"));
			told.send(result).expect("the test listens");
		});
		std::thread::sleep(Duration::from_millis(100));
		heard.lock().expect("the order").push(format!("renamed {}", renamed.name));
	});

	renamed(&app, &space_id, "notes.md", "plan.md").await.expect("the rename lands");

	let raced = applied.recv_timeout(Duration::from_secs(5)).expect("the update returns");
	assert_eq!(raced, Ok(()));
	assert_eq!(*order.lock().expect("the order"), ["renamed plan.md", "updated plan.md"]);
}

async fn deleted(app: &App<MockRuntime>, space_id: &str, name: &str) -> Result<(), LibraryError> {
	library_delete(app.handle().clone(), app.state(), space_id.to_owned(), name.to_owned()).await
}

fn heard_changes(app: &App<MockRuntime>) -> mpsc::Receiver<LibraryChanged> {
	let (told, heard) = mpsc::channel();
	app.listen_any(events::LIBRARY_CHANGED.name(), move |event| {
		let changed = serde_json::from_str(event.payload()).expect("a change payload");
		told.send(changed).expect("the test listens");
	});
	heard
}

#[tokio::test]
async fn a_deleted_item_leaves_the_library_with_its_shared_state_and_is_announced() {
	let app = a_host("delete");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	put(&root, &space_id, "plan.md", b"kept");
	opened(&app, &space_id, "notes.md").await;
	let heard = heard_changes(&app);

	let removed = deleted(&app, &space_id, "notes.md").await;
	let again = deleted(&app, &space_id, "notes.md").await;
	let elsewhere = deleted(&app, "nowhere", "plan.md").await;

	assert_eq!(removed, Ok(()));
	assert_eq!(names(&root, &space_id), ["plan.md"]);
	assert!(!root.join(".documents").join(&space_id).join("notes.md.yjs").exists());
	let announced = heard.recv_timeout(Duration::from_secs(5)).expect("the delete is announced");
	assert_eq!(announced, LibraryChanged { space_id: space_id.clone(), overwritten: None });
	assert_eq!(again, Err(LibraryError::Missing { name: "notes.md".to_owned() }));
	assert_eq!(elsewhere, Err(LibraryError::UnknownSpace { id: "nowhere".to_owned() }));
	assert!(heard.try_recv().is_err());
}

#[cfg(unix)]
#[tokio::test]
async fn a_delete_that_cannot_remove_the_file_keeps_the_item_listed() {
	use std::os::unix::fs::PermissionsExt;

	let app = a_host("delete-locked");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "notes.md", b"base");
	let dir = space_dir(&root, &space_id);
	let set_mode = |mode| {
		fs::set_permissions(&dir, fs::Permissions::from_mode(mode)).expect("the mode lands");
	};

	set_mode(0o500);
	let refused = deleted(&app, &space_id, "notes.md").await;
	set_mode(0o700);

	assert!(matches!(refused, Err(LibraryError::Unwritable { .. })), "{refused:?}");
	assert_eq!(names(&root, &space_id), ["notes.md"]);
}

const A_ROOM: &str = "INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
	VALUES ('c1', 'topic', 'personal', 'Notes', 1, 1);";

const ROOM: &str = "c1";

const PERSONAL: &str = "personal";

async fn a_host_with_a_room(name: &str) -> AppOfItsOwn {
	let app = a_host(name);
	app.state::<db::DatabaseState>()
		.as_ref()
		.expect("the database opens")
		.call_mut(|connection| Ok(connection.execute_batch(A_ROOM)?))
		.await
		.expect("the room is planted");
	app
}

fn a_message(id: &str, content: &str, documents: &[&str]) -> NewUserMessage {
	NewUserMessage {
		id: id.to_owned(),
		conversation_id: ROOM.to_owned(),
		turn_id: format!("t-{id}"),
		author_bot_id: None,
		replied_to_message_id: None,
		replied_to_message_ids: Vec::new(),
		reply_links: Vec::new(),
		documents: documents.iter().map(|name| (*name).to_owned()).collect(),
		content: content.to_owned(),
		created_at: 1,
	}
}

async fn sent(
	app: &App<MockRuntime>,
	message: NewUserMessage,
) -> Result<i64, TranscriptStoreError> {
	conversation_send_user_message(app.handle().clone(), app.state(), Caller::Host, message, vec![])
		.await
}

async fn linked_documents(app: &App<MockRuntime>) -> Vec<(String, Vec<String>)> {
	let page = conversation_message_page(app.state(), ROOM.to_owned(), None, 20)
		.await
		.expect("the page reads");
	page.messages.into_iter().map(|message| (message.id, message.documents)).collect()
}

fn attached(app: &App<MockRuntime>, files: &[(&str, Vec<u8>)]) -> Vec<PathBuf> {
	let store = Attachments::dir(app.handle()).expect("the attachment store resolves");
	let submitted: Vec<SubmittedAttachment> = files
		.iter()
		.map(|(name, bytes)| SubmittedAttachment {
			name: (*name).to_owned(),
			bytes: Some(bytes.clone()),
			base64: None,
		})
		.collect();
	attachments::store(&store, ROOM, &submitted).expect("the attachments are stored")
}

async fn saved_message(
	app: &App<MockRuntime>,
	message_id: &str,
) -> Result<contract::LibraryItem, LibraryError> {
	library_save_message(app.handle().clone(), app.state(), ROOM.to_owned(), message_id.to_owned())
		.await
}

#[tokio::test]
async fn a_message_with_two_images_saves_as_a_document_named_after_its_heading_with_both_images() {
	let app = a_host_with_a_room("save-message").await;
	let root = root(app.handle()).expect("the library root resolves");
	let paths = attached(
		&app,
		&[
			("shot.png", encoded(ImageFormat::Png)),
			("report.pdf", b"pdf".to_vec()),
			("photo.JPG", encoded(ImageFormat::Jpeg)),
		],
	);
	let content =
		format!("# Launch plan\nShip it on Friday.\n{}", attachment_block(&paths, Utc::now()));
	sent(&app, a_message("m1", &content, &[])).await.expect("the message is sent");
	let changes = heard_changes(&app);

	let first = saved_message(&app, "m1").await.expect("the message is saved");
	let second = saved_message(&app, "m1").await.expect("the message is saved again");

	assert_eq!((first.name.as_str(), first.kind), ("Launch plan.md", LibraryItemKind::Document));
	assert_eq!(second.name, "Launch plan (2).md");
	assert_eq!(
		on_disk(&root, PERSONAL, "Launch plan.md"),
		"# Launch plan\nShip it on Friday.\n\n![](<Launch plan.png>)\n\n![](<Launch plan.jpg>)"
	);
	assert!(on_disk(&root, PERSONAL, "Launch plan (2).md")
		.ends_with("![](<Launch plan (2).png>)\n\n![](<Launch plan (2).jpg>)"));
	assert_eq!(
		fs::read(space_dir(&root, PERSONAL).join("Launch plan.png")).expect("the image reads"),
		encoded(ImageFormat::Png)
	);
	let mut listed = names(&root, PERSONAL);
	listed.sort();
	assert_eq!(
		listed,
		[
			"Launch plan (2).jpg",
			"Launch plan (2).md",
			"Launch plan (2).png",
			"Launch plan.jpg",
			"Launch plan.md",
			"Launch plan.png",
		]
	);
	let announced: Vec<LibraryChanged> =
		(0..2).map(|_| changes.recv_timeout(Duration::from_secs(5)).expect("announced")).collect();
	assert_eq!(
		announced,
		vec![LibraryChanged { space_id: PERSONAL.to_owned(), overwritten: None }; 2]
	);
}

#[tokio::test]
async fn a_message_missing_from_the_conversation_or_an_attachment_gone_leaves_the_library_empty() {
	let app = a_host_with_a_room("save-refused").await;
	let root = root(app.handle()).expect("the library root resolves");
	let paths = attached(&app, &[("shot.png", encoded(ImageFormat::Png))]);
	fs::remove_file(&paths[0]).expect("the attachment leaves");
	let content = format!("Look.\n{}", attachment_block(&paths, Utc::now()));
	sent(&app, a_message("m1", &content, &[])).await.expect("the message is sent");
	let changes = heard_changes(&app);

	let missing = saved_message(&app, "nowhere").await;
	let gone = saved_message(&app, "m1").await;

	assert_eq!(
		missing,
		Err(LibraryError::UnknownMessage {
			conversation_id: ROOM.to_owned(),
			message_id: "nowhere".to_owned(),
		})
	);
	assert!(matches!(gone, Err(LibraryError::Unreadable { .. })), "{gone:?}");
	assert!(names(&root, PERSONAL).is_empty());
	assert!(changes.try_recv().is_err());
}

#[test]
fn an_image_that_fails_to_copy_takes_back_every_image_copied_before_it_and_the_document() {
	let root = temp_root();
	let images = [
		AttachedImage { name: "a.png".to_owned(), bytes: encoded(ImageFormat::Png) },
		AttachedImage { name: "b.png".to_owned(), bytes: b"not a png".to_vec() },
	];

	let saved = saved_as_document(&root, SPACE, "# Plan", &images);

	assert!(matches!(saved, Err(LibraryError::Undecodable { .. })), "{saved:?}");
	assert!(names(&root, SPACE).is_empty());
	let thumbnails = fs::read_dir(thumbnails_dir(&space_dir(&root, SPACE)))
		.expect("the thumbnails folder reads")
		.count();
	assert_eq!(thumbnails, 0);
}

#[test]
fn a_document_is_named_after_its_first_heading_else_its_first_line_else_untitled() {
	for (text, title) in [
		("Intro line\n\n## Plan: Q3 / Q4 ##\nBody", "Plan Q3 Q4"),
		("\n  First words here.\nSecond", "First words here"),
		("#hashtag first\nnext", "#hashtag first"),
		("", UNTITLED),
		("  \n\t\n", UNTITLED),
		("///", UNTITLED),
		("...hidden.", "hidden"),
	] {
		assert_eq!(document_title(text), title, "{text:?}");
	}
	assert_eq!(document_title(&"word ".repeat(40)).chars().count(), MAX_TITLE_CHARS - 1);
}

#[test]
fn a_message_without_text_or_images_saves_as_an_empty_untitled_document() {
	let root = temp_root();

	let saved = saved_as_document(&root, SPACE, "", &[]).expect("the document lands");

	assert_eq!(saved.name, "Untitled.md");
	assert_eq!(on_disk(&root, SPACE, "Untitled.md"), "");
}

#[tokio::test]
async fn a_document_attached_to_a_sent_message_reads_back_with_it_and_follows_its_rename() {
	let app = a_host_with_a_room("attach").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, PERSONAL, "notes.md", b"notes");
	put(&root, PERSONAL, "brief.md", b"brief");
	put(&root, PERSONAL, "cover.png", b"png");

	sent(&app, a_message("m1", "Read these.", &["notes.md", "brief.md", "notes.md"]))
		.await
		.expect("the message is sent");
	let missing = sent(&app, a_message("m2", "And this.", &["notes.md", "gone.md"])).await;
	let image = sent(&app, a_message("m3", "And this.", &["cover.png"])).await;
	let before = linked_documents(&app).await;
	renamed(&app, PERSONAL, "notes.md", "final.md").await.expect("the rename lands");

	assert_eq!(before, [("m1".to_owned(), vec!["notes.md".to_owned(), "brief.md".to_owned()])]);
	assert_eq!(
		missing,
		Err(TranscriptStoreError::DocumentRefused {
			name: "gone.md".to_owned(),
			failure: Box::new(LibraryError::Missing { name: "gone.md".to_owned() }),
		})
	);
	assert_eq!(
		image,
		Err(TranscriptStoreError::DocumentRefused {
			name: "cover.png".to_owned(),
			failure: Box::new(LibraryError::NotADocument { name: "cover.png".to_owned() }),
		})
	);
	assert_eq!(
		linked_documents(&app).await,
		[("m1".to_owned(), vec!["final.md".to_owned(), "brief.md".to_owned()])]
	);
}

pub(crate) const A_BOARD: &str = r#"{
	"nodes": [
		{ "id": "a", "type": "text", "text": "Hello", "x": -40, "y": 10, "width": 100, "height": 50, "color": "3" },
		{ "id": "b", "type": "group", "label": "Launch", "x": 200, "y": -20, "width": 300, "height": 200 }
	],
	"edges": []
}"#;

fn board_fixtures() -> PathBuf {
	Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages/shared/board/fixtures")
}

async fn summary_of(
	app: &App<MockRuntime>,
	space_id: &str,
	name: &str,
) -> Result<LibraryBoardSummary, LibraryError> {
	library_board_summary(app.handle().clone(), app.state(), space_id.to_owned(), name.to_owned())
		.await
}

async fn board_renamed(
	app: &App<MockRuntime>,
	space_id: &str,
	name: &str,
	new_name: &str,
) -> Result<LibraryItem, LibraryError> {
	library_rename_board(
		app.handle().clone(),
		app.state(),
		space_id.to_owned(),
		name.to_owned(),
		new_name.to_owned(),
	)
	.await
}

fn text_node(index: i64) -> serde_json::Value {
	serde_json::json!({
		"id": format!("n{index}"),
		"type": "text",
		"text": "",
		"x": index * 10,
		"y": -index,
		"width": 100,
		"height": 50,
	})
}

#[test]
fn a_canvas_file_is_listed_as_a_board_beside_documents_and_images() {
	let root = temp_root();
	put(&root, SPACE, "notes.md", b"notes");
	put(&root, SPACE, "cover.png", b"png");
	put(&root, SPACE, "plan.canvas", A_BOARD.as_bytes());
	put(&root, SPACE, "broken.canvas", b"{ not json");
	touch(&root, SPACE, "notes.md", 4);
	touch(&root, SPACE, "cover.png", 3);
	touch(&root, SPACE, "plan.canvas", 2);
	touch(&root, SPACE, "broken.canvas", 1);

	let kinds: Vec<_> = list(&root, SPACE)
		.expect("the library lists")
		.into_iter()
		.map(|item| (item.name, item.kind))
		.collect();

	assert_eq!(
		kinds,
		[
			("notes.md".to_owned(), LibraryItemKind::Document),
			("cover.png".to_owned(), LibraryItemKind::Image),
			("plan.canvas".to_owned(), LibraryItemKind::Board),
			("broken.canvas".to_owned(), LibraryItemKind::Board),
		]
	);
}

#[tokio::test]
async fn a_board_created_by_name_is_a_blank_canvas_and_a_taken_name_is_refused() {
	let app = a_host("board-create");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	let create = |name: &str| {
		library_create_board(app.handle().clone(), app.state(), space_id.clone(), name.to_owned())
	};

	let item = create("Plan").await.expect("the board lands");
	let again = create("Plan").await;
	let unnamed = create("").await;
	let escaping = create("../Plan").await;

	assert_eq!((item.name.as_str(), item.kind), ("Plan.canvas", LibraryItemKind::Board));
	assert_eq!(on_disk(&root, &space_id, "Plan.canvas"), r#"{"nodes":[],"edges":[]}"#);
	assert_eq!(again, Err(LibraryError::AlreadyExists { name: "Plan.canvas".to_owned() }));
	assert_eq!(unnamed, Err(LibraryError::InvalidName { name: ".canvas".to_owned() }));
	assert_eq!(escaping, Err(LibraryError::InvalidName { name: "../Plan.canvas".to_owned() }));
	assert_eq!(names(&root, &space_id), ["Plan.canvas"]);
}

#[tokio::test]
async fn a_renamed_board_keeps_its_bytes_and_is_announced_as_a_document_rename_is() {
	let app = a_host("board-rename");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "plan.canvas", A_BOARD.as_bytes());
	put(&root, &space_id, "notes.md", b"notes");
	let renames = heard_renames(&app);
	let changes = heard_changes(&app);

	let item = board_renamed(&app, &space_id, "plan.canvas", "roadmap.canvas")
		.await
		.expect("the rename lands");
	let to_markdown = board_renamed(&app, &space_id, "roadmap.canvas", "roadmap.md").await;
	let a_document = board_renamed(&app, &space_id, "notes.md", "notes.canvas").await;

	assert_eq!((item.name.as_str(), item.kind), ("roadmap.canvas", LibraryItemKind::Board));
	assert_eq!(on_disk(&root, &space_id, "roadmap.canvas"), A_BOARD);
	assert_eq!(to_markdown, Err(LibraryError::InvalidName { name: "roadmap.md".to_owned() }));
	assert_eq!(a_document, Err(LibraryError::NotABoard { name: "notes.md".to_owned() }));
	assert_eq!(names(&root, &space_id).len(), 2);
	let announced = renames.recv_timeout(Duration::from_secs(5)).expect("the rename is announced");
	assert_eq!(
		announced,
		LibraryDocumentRenamed {
			space_id: space_id.clone(),
			former_name: "plan.canvas".to_owned(),
			name: "roadmap.canvas".to_owned(),
		}
	);
	assert!(renames.try_recv().is_err());
	assert!(changes.try_recv().is_err());
}

#[tokio::test]
async fn a_deleted_board_leaves_the_library_and_is_announced_as_a_document_delete_is() {
	let app = a_host("board-delete");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "plan.canvas", A_BOARD.as_bytes());
	let heard = heard_changes(&app);

	let removed = deleted(&app, &space_id, "plan.canvas").await;

	assert_eq!(removed, Ok(()));
	assert!(names(&root, &space_id).is_empty());
	let announced = heard.recv_timeout(Duration::from_secs(5)).expect("the delete is announced");
	assert_eq!(announced, LibraryChanged { space_id: space_id.clone(), overwritten: None });
}

#[tokio::test]
async fn a_board_summary_answers_its_nodes_as_stored_and_their_bounding_box() {
	let app = a_host("board-summary");
	let space_id = a_space(&app, "Work").await;
	let root = root(app.handle()).expect("the library root resolves");
	put(&root, &space_id, "plan.canvas", A_BOARD.as_bytes());
	put(&root, &space_id, "blank.canvas", br#"{"nodes":[],"edges":[]}"#);
	put(&root, &space_id, "notes.md", b"notes");

	let summary = summary_of(&app, &space_id, "plan.canvas").await;
	let blank = summary_of(&app, &space_id, "blank.canvas").await.expect("the blank summarises");
	let a_document = summary_of(&app, &space_id, "notes.md").await;

	assert_eq!(
		summary,
		Ok(LibraryBoardSummary {
			name: "plan.canvas".to_owned(),
			node_count: 2,
			nodes: vec![
				LibraryBoardNode {
					id: "a".to_owned(),
					node_type: "text".to_owned(),
					x: -40,
					y: 10,
					width: 100,
					height: 50,
					colour: Some("3".to_owned()),
				},
				LibraryBoardNode {
					id: "b".to_owned(),
					node_type: "group".to_owned(),
					x: 200,
					y: -20,
					width: 300,
					height: 200,
					colour: None,
				},
			],
			bounds: Some(LibraryBoardBounds { x: -40, y: -20, width: 540, height: 200 }),
		})
	);
	assert_eq!((blank.node_count, blank.nodes.len(), blank.bounds), (0, 0, None));
	assert_eq!(a_document, Err(LibraryError::NotABoard { name: "notes.md".to_owned() }));
}

#[test]
fn a_board_summary_snapshots_at_most_200_nodes_and_bounds_every_node() {
	let root = temp_root();
	let nodes: Vec<_> = (0..250).map(text_node).collect();
	let board = serde_json::json!({ "nodes": nodes, "edges": [] });
	put(&root, SPACE, "crowded.canvas", board.to_string().as_bytes());

	let summary = summarise_board(&root, SPACE, "crowded.canvas").expect("the board summarises");

	assert_eq!(summary.node_count, 250);
	assert_eq!(summary.nodes.len(), 200);
	assert_eq!(summary.nodes.last().map(|node| node.id.as_str()), Some("n199"));
	assert_eq!(
		summary.bounds,
		Some(LibraryBoardBounds { x: 0, y: -249, width: 2590, height: 299 })
	);
}

#[test]
fn an_invalid_board_is_answered_a_refusal_naming_it_never_a_zeroed_summary() {
	let root = temp_root();
	put(&root, SPACE, "broken.canvas", b"{ not json");
	put(&root, SPACE, "shapeless.canvas", br#"{"nodes":[{"id":"a","type":"text"}],"edges":[]}"#);
	put(&root, SPACE, "rootless.canvas", b"[]");

	for name in ["broken.canvas", "shapeless.canvas", "rootless.canvas"] {
		let refused = summarise_board(&root, SPACE, name);

		assert!(
			matches!(&refused, Err(LibraryError::InvalidBoard { name: refused_name, .. }) if refused_name == name),
			"{name}: {refused:?}"
		);
	}
}

#[test]
fn every_fixture_board_is_summarised_with_its_node_count() {
	let root = temp_root();
	let fixtures: Vec<_> = fs::read_dir(board_fixtures())
		.expect("the board fixtures are readable")
		.map(|entry| entry.expect("a fixture entry is readable").path().join("board.canvas"))
		.collect();
	assert!(fixtures.len() >= 11, "every board fixture is summarised");

	for fixture in fixtures {
		let text = fs::read_to_string(&fixture).expect("the fixture reads");
		let stored: serde_json::Value = serde_json::from_str(&text).expect("the fixture is JSON");
		let count = stored["nodes"].as_array().expect("the fixture has nodes").len();
		put(&root, SPACE, "fixture.canvas", text.as_bytes());

		let summary = summarise_board(&root, SPACE, "fixture.canvas")
			.unwrap_or_else(|refusal| panic!("{}: {refusal:?}", fixture.display()));

		assert_eq!(summary.node_count, count as u64, "{}", fixture.display());
		assert_eq!(summary.nodes.len(), count.min(200), "{}", fixture.display());
		assert_eq!(summary.bounds.is_some(), count > 0, "{}", fixture.display());
	}
}
