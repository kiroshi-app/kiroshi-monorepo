pub mod commands;
pub mod contract;

use std::borrow::Cow;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use base64::prelude::{Engine as _, BASE64_STANDARD};
use chrono::{DateTime, SecondsFormat, Utc};
use uuid::Uuid;

use crate::db::{Database, DatabaseError};
use crate::file_store::FileStore;
use crate::private_files;
use contract::SubmittedAttachment;

const MAX_BYTES: u64 = 10 * 1024 * 1024;

const MAX_ATTACHMENTS: usize = 20;
const MAX_TOTAL_BYTES: u64 = 30 * 1024 * 1024;

const MAX_EXTENSION_LENGTH: usize = 16;

pub struct SizedFile<'a> {
	pub name: &'a str,
	pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
	TooMany { count: usize, limit: usize },
	TooLarge { name: String, bytes: u64, limit: u64 },
	TooLargeTogether { bytes: u64, limit: u64 },
	Unreadable { name: String, detail: String },
	Unwritable { detail: String },
}

pub struct Attachments;

impl FileStore for Attachments {
	const DIR_NAME: &'static str = "attachments";

	async fn referenced(database: &Database) -> Result<Vec<String>, DatabaseError> {
		database.conversations().conversation_ids().await
	}

	fn kept(_: &Path, referenced: &[String]) -> Vec<OsString> {
		referenced.iter().map(OsString::from).collect()
	}

	fn remove(path: &Path) -> io::Result<()> {
		fs::remove_dir_all(path).or_else(|_| fs::remove_file(path))
	}
}

pub fn conversation_dir(root: &Path, conversation_id: &str) -> PathBuf {
	root.join(conversation_id)
}

fn minted_name(submitted: &str) -> String {
	let id = Uuid::new_v4();
	match plain_extension(submitted) {
		Some(extension) => format!("{id}.{extension}"),
		None => id.to_string(),
	}
}

pub fn store(
	root: &Path,
	conversation_id: &str,
	submitted: &[SubmittedAttachment],
) -> Result<Vec<PathBuf>, Rejection> {
	let contents = submitted.iter().map(content_of).collect::<Result<Vec<_>, _>>()?;
	refuse(submitted, &contents)?;
	let dir = conversation_dir(root, conversation_id);
	let paths: Vec<PathBuf> =
		submitted.iter().map(|attachment| dir.join(minted_name(&attachment.name))).collect();
	for (path, content) in paths.iter().zip(&contents) {
		if let Err(error) = private_files::write(path, content) {
			take_back(&paths);
			return Err(unwritable(error));
		}
	}
	Ok(paths)
}

fn content_of(attachment: &SubmittedAttachment) -> Result<Cow<'_, [u8]>, Rejection> {
	let unreadable =
		|detail: String| Rejection::Unreadable { name: attachment.name.clone(), detail };
	match (&attachment.bytes, &attachment.base64) {
		(Some(bytes), None) => Ok(Cow::Borrowed(bytes)),
		(None, Some(text)) => BASE64_STANDARD.decode(text).map(Cow::Owned).map_err(|error| {
			unreadable(format!("carries base64 text that does not decode: {error}"))
		}),
		(Some(_), Some(_)) => Err(unreadable("carries both base64 and bytes".to_owned())),
		(None, None) => Err(unreadable("carries neither base64 nor bytes".to_owned())),
	}
}

fn refuse(submitted: &[SubmittedAttachment], contents: &[Cow<'_, [u8]>]) -> Result<(), Rejection> {
	let sized: Vec<SizedFile<'_>> = submitted
		.iter()
		.zip(contents)
		.map(|(attachment, content)| SizedFile {
			name: &attachment.name,
			bytes: content.len() as u64,
		})
		.collect();
	refuse_block(&sized)
}

pub fn refuse_file(file: &SizedFile<'_>) -> Result<(), Rejection> {
	match file.bytes > MAX_BYTES {
		true => Err(Rejection::TooLarge {
			name: file.name.to_owned(),
			bytes: file.bytes,
			limit: MAX_BYTES,
		}),
		false => Ok(()),
	}
}

pub fn refuse_block(files: &[SizedFile<'_>]) -> Result<(), Rejection> {
	if files.len() > MAX_ATTACHMENTS {
		return Err(Rejection::TooMany { count: files.len(), limit: MAX_ATTACHMENTS });
	}
	files.iter().try_for_each(refuse_file)?;
	let total: u64 = files.iter().map(|file| file.bytes).sum();
	if total > MAX_TOTAL_BYTES {
		return Err(Rejection::TooLargeTogether { bytes: total, limit: MAX_TOTAL_BYTES });
	}
	Ok(())
}

pub fn attachment_block(paths: &[PathBuf], sent_at: DateTime<Utc>) -> String {
	let count = paths.len();
	let noun = match count {
		1 => "file",
		_ => "files",
	};
	let sent = sent_at.to_rfc3339_opts(SecondsFormat::Millis, true);
	let header = format!("Attached to this message, sent {sent}, {count} {noun}:");
	let lines = paths
		.iter()
		.enumerate()
		.map(|(index, path)| format!("{}/{count} {}", index + 1, path.display()));
	std::iter::once(header).chain(lines).collect::<Vec<_>>().join("\n")
}

fn take_back(stored: &[PathBuf]) {
	for path in stored {
		let _ = fs::remove_file(path);
	}
}

fn plain_extension(submitted: &str) -> Option<String> {
	let extension = Path::new(submitted).extension()?.to_str()?.to_lowercase();
	let is_plain = !extension.is_empty()
		&& extension.len() <= MAX_EXTENSION_LENGTH
		&& extension.chars().all(|character| character.is_ascii_alphanumeric());
	is_plain.then_some(extension)
}

fn unwritable(error: std::io::Error) -> Rejection {
	Rejection::Unwritable { detail: error.to_string() }
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	const CONVERSATION: &str = "c1";

	fn temp_root() -> RemovedOnDrop {
		RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-attachments-{}", Uuid::new_v4())))
	}

	fn an_attachment(name: &str, bytes: &[u8]) -> SubmittedAttachment {
		SubmittedAttachment { name: name.to_owned(), bytes: Some(bytes.to_vec()), base64: None }
	}

	fn a_base64_attachment(name: &str, text: &str) -> SubmittedAttachment {
		SubmittedAttachment { name: name.to_owned(), bytes: None, base64: Some(text.to_owned()) }
	}

	fn names_in(dir: &Path) -> Vec<String> {
		let mut names: Vec<String> = fs::read_dir(dir)
			.expect("the directory is readable")
			.flatten()
			.map(|entry| entry.file_name().to_string_lossy().into_owned())
			.collect();
		names.sort();
		names
	}

	fn extension_of(path: &Path) -> Option<String> {
		path.extension()?.to_str().map(str::to_owned)
	}

	#[test]
	fn every_submitted_file_is_written_under_its_conversation_and_answered_as_a_path() {
		let root = temp_root();

		let stored = store(
			&root,
			CONVERSATION,
			&[an_attachment("notes.md", b"first"), an_attachment("shot.PNG", b"second")],
		)
		.expect("the attachments are stored");

		let dir = conversation_dir(&root, CONVERSATION);
		assert_eq!(stored.len(), 2);
		assert!(stored
			.iter()
			.all(|path| path.is_absolute() && path.parent() == Some(dir.as_path())));
		assert_eq!(fs::read(&stored[0]).expect("the first file"), b"first");
		assert_eq!(fs::read(&stored[1]).expect("the second file"), b"second");
		assert_eq!(names_in(&dir).len(), 2, "two files landed under one name");
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn two_files_submitted_under_one_name_are_two_files() {
		let root = temp_root();

		let stored = store(
			&root,
			CONVERSATION,
			&[an_attachment("a.txt", b"one"), an_attachment("a.txt", b"two")],
		)
		.expect("the attachments are stored");

		assert_ne!(stored[0], stored[1]);
		assert_eq!(fs::read(&stored[0]).expect("the first file"), b"one");
		assert_eq!(fs::read(&stored[1]).expect("the second file"), b"two");
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn two_conversations_store_into_directories_of_their_own() {
		let root = temp_root();

		let first = store(&root, "c1", &[an_attachment("a.txt", b"one")]).expect("stored");
		let second = store(&root, "c2", &[an_attachment("a.txt", b"two")]).expect("stored");

		assert_ne!(first[0].parent(), second[0].parent());
		assert_eq!(names_in(&root), vec!["c1".to_owned(), "c2".to_owned()]);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn a_name_that_names_a_place_stores_under_the_minted_one_anyway() {
		let root = temp_root();
		let dir = conversation_dir(&root, CONVERSATION);

		let stored = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("../../etc/passwd", b"escaping"),
				an_attachment("/etc/hosts", b"absolute"),
				an_attachment("..", b"parent"),
				an_attachment("plain", b"no extension"),
				an_attachment("report.PDF", b"shouting"),
			],
		)
		.expect("the attachments are stored");

		assert!(
			stored.iter().all(|path| path.parent() == Some(dir.as_path())),
			"a name reached the path"
		);
		assert_eq!(extension_of(&stored[0]), None, "a walked path kept an extension");
		assert_eq!(extension_of(&stored[1]), None);
		assert_eq!(extension_of(&stored[2]), None);
		assert_eq!(extension_of(&stored[3]), None);
		assert_eq!(extension_of(&stored[4]), Some("pdf".to_owned()), "an extension was not kept");
		assert_eq!(names_in(&dir).len(), 5);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn an_extension_that_is_not_plain_is_left_off_the_minted_name() {
		let overlong = format!("archive.{}", "z".repeat(MAX_EXTENSION_LENGTH + 1));

		assert_eq!(plain_extension("photo.jpeg"), Some("jpeg".to_owned()));
		assert_eq!(plain_extension("photo.JPEG"), Some("jpeg".to_owned()));
		assert_eq!(plain_extension("archive.tar.gz"), Some("gz".to_owned()));
		assert_eq!(plain_extension(&overlong), None);
		assert_eq!(plain_extension("odd.p g"), None);
		assert_eq!(plain_extension("odd.p/g"), None);
		assert_eq!(plain_extension(".gitignore"), None);
		assert_eq!(plain_extension("plain"), None);
	}

	#[test]
	fn one_oversized_file_refuses_the_whole_call_and_leaves_nothing_behind() {
		let root = temp_root();
		let oversized = vec![0u8; (MAX_BYTES + 1) as usize];

		let rejection = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("small.txt", b"kept out"),
				an_attachment("huge.bin", &oversized),
				an_attachment("other.txt", b"kept out too"),
			],
		)
		.expect_err("the call is refused");

		assert_eq!(
			rejection,
			Rejection::TooLarge {
				name: "huge.bin".to_owned(),
				bytes: MAX_BYTES + 1,
				limit: MAX_BYTES
			}
		);
		assert!(!root.exists(), "a refused call made the place its files would have gone");
	}

	#[test]
	fn a_write_that_stops_partway_takes_back_its_own_file_and_the_ones_before_it() {
		let root = temp_root();
		private_files::interrupt_the_write_after(1);

		let rejection = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("first.txt", b"whole"),
				an_attachment("second.txt", b"stopped partway"),
				an_attachment("third.txt", b"never reached"),
			],
		)
		.expect_err("the call is refused");

		assert!(matches!(rejection, Rejection::Unwritable { .. }));
		assert_eq!(
			names_in(&conversation_dir(&root, CONVERSATION)),
			Vec::<String>::new(),
			"a call that stopped partway left files behind"
		);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn more_files_than_one_prompt_may_carry_are_refused_and_nothing_is_written() {
		let root = temp_root();
		let submitted: Vec<SubmittedAttachment> =
			(0..=MAX_ATTACHMENTS).map(|_| an_attachment("a.txt", b"small")).collect();

		let rejection = store(&root, CONVERSATION, &submitted).expect_err("the call is refused");

		assert_eq!(
			rejection,
			Rejection::TooMany { count: MAX_ATTACHMENTS + 1, limit: MAX_ATTACHMENTS }
		);
		assert!(!root.exists(), "a refused call made the place its files would have gone");
	}

	#[test]
	fn files_that_are_each_accepted_and_too_much_together_are_refused() {
		let root = temp_root();
		let each = MAX_BYTES / 2;
		let count = (MAX_TOTAL_BYTES / each) + 1;
		let submitted: Vec<SubmittedAttachment> =
			(0..count).map(|_| an_attachment("a.bin", &vec![0u8; each as usize])).collect();

		let rejection = store(&root, CONVERSATION, &submitted).expect_err("the call is refused");

		assert_eq!(
			rejection,
			Rejection::TooLargeTogether { bytes: each * count, limit: MAX_TOTAL_BYTES }
		);
		assert!(!root.exists(), "a refused call made the place its files would have gone");
	}

	#[test]
	fn a_block_reads_exactly_as_the_frontend_writes_it() {
		let sent_at = DateTime::parse_from_rfc3339("2026-09-28T10:04:05.123Z")
			.expect("the instant parses")
			.with_timezone(&Utc);

		let single = attachment_block(&[PathBuf::from("/data/attachments/c1/a.png")], sent_at);
		let pair = attachment_block(
			&[
				PathBuf::from("/data/attachments/c1/a.png"),
				PathBuf::from("/data/attachments/c1/b.gif"),
			],
			sent_at,
		);

		assert_eq!(
			single,
			"Attached to this message, sent 2026-09-28T10:04:05.123Z, 1 file:\n1/1 /data/attachments/c1/a.png"
		);
		assert_eq!(
			pair,
			"Attached to this message, sent 2026-09-28T10:04:05.123Z, 2 files:\n1/2 /data/attachments/c1/a.png\n2/2 /data/attachments/c1/b.gif"
		);
	}

	#[test]
	fn a_file_at_the_limit_is_stored() {
		let root = temp_root();
		let at_limit = vec![0u8; MAX_BYTES as usize];

		let stored = store(&root, CONVERSATION, &[an_attachment("edge.bin", &at_limit)])
			.expect("the attachment is stored");

		assert_eq!(stored.len(), 1);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn the_same_content_sent_as_base64_and_as_bytes_is_stored_byte_identical() {
		let root = temp_root();
		let content: Vec<u8> = (0..=255).collect();

		let stored = store(
			&root,
			CONVERSATION,
			&[
				an_attachment("shot.png", &content),
				a_base64_attachment("shot.png", &BASE64_STANDARD.encode(&content)),
			],
		)
		.expect("both forms are stored");

		assert_eq!(fs::read(&stored[0]).expect("the bytes form"), content);
		assert_eq!(fs::read(&stored[1]).expect("the base64 form"), content);
		assert_eq!(stored[0].parent(), stored[1].parent());
		assert_eq!(extension_of(&stored[0]), extension_of(&stored[1]));
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn an_attachment_whose_content_cannot_be_read_refuses_the_whole_call_naming_it() {
		let unreadable = [
			a_base64_attachment("photo.jpg", "not base64!"),
			a_base64_attachment("photo.jpg", "AQI"),
			SubmittedAttachment {
				name: "photo.jpg".to_owned(),
				bytes: Some(vec![1]),
				base64: Some("AQ==".to_owned()),
			},
			SubmittedAttachment { name: "photo.jpg".to_owned(), bytes: None, base64: None },
		];
		for attachment in unreadable {
			let root = temp_root();

			let rejection = store(
				&root,
				CONVERSATION,
				&[an_attachment("first.txt", b"kept out"), attachment.clone()],
			)
			.expect_err("the call is refused");

			match rejection {
				Rejection::Unreadable { name, detail } => {
					assert_eq!(name, "photo.jpg");
					assert!(!detail.is_empty(), "{attachment:?} was refused with no detail");
				}
				other => panic!("{attachment:?} was refused as {other:?}"),
			}
			assert!(!root.exists(), "a refused call wrote {attachment:?}");
		}
	}

	#[test]
	fn the_limits_weigh_the_decoded_bytes_of_a_base64_attachment() {
		let root = temp_root();
		let at_limit = BASE64_STANDARD.encode(vec![0u8; MAX_BYTES as usize]);
		let over_limit = BASE64_STANDARD.encode(vec![0u8; (MAX_BYTES + 1) as usize]);

		let stored = store(&root, CONVERSATION, &[a_base64_attachment("edge.bin", &at_limit)])
			.expect("a decoded file at the limit is stored");
		let rejection = store(&root, CONVERSATION, &[a_base64_attachment("huge.bin", &over_limit)])
			.expect_err("a decoded file over the limit is refused");

		assert_eq!(stored.len(), 1);
		assert_eq!(
			rejection,
			Rejection::TooLarge {
				name: "huge.bin".to_owned(),
				bytes: MAX_BYTES + 1,
				limit: MAX_BYTES
			}
		);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn a_sweep_keeps_the_conversations_on_the_record_and_removes_the_rest() {
		let root = temp_root();
		let kept = store(&root, "c1", &[an_attachment("a.txt", b"kept")]).expect("stored");
		let dropped = store(&root, "c2", &[an_attachment("a.txt", b"dropped")]).expect("stored");

		Attachments::sweep(&root, &["c1".to_owned()]);

		assert!(kept[0].exists(), "a conversation on the record lost its attachments");
		assert!(!dropped[0].exists(), "a deleted conversation kept its attachments");
		assert!(!conversation_dir(&root, "c2").exists(), "an empty directory stayed behind");
		assert_eq!(names_in(&root), vec!["c1".to_owned()]);
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn a_sweep_with_nothing_referenced_empties_the_root() {
		let root = temp_root();
		store(&root, "c1", &[an_attachment("a.txt", b"one")]).expect("stored");
		store(&root, "c2", &[an_attachment("b.txt", b"two")]).expect("stored");

		Attachments::sweep(&root, &[]);

		assert_eq!(names_in(&root), Vec::<String>::new());
		fs::remove_dir_all(&root).expect("cleanup");
	}

	#[test]
	fn a_sweep_of_a_root_that_is_not_there_creates_nothing() {
		let root = temp_root();

		Attachments::sweep(&root, &["c1".to_owned()]);

		assert!(!root.exists(), "sweeping made the directory it had nothing to sweep");
	}

	#[cfg(unix)]
	#[test]
	fn what_a_user_attached_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let root = temp_root();
		let stored = store(&root, CONVERSATION, &[an_attachment("a.txt", b"private")])
			.expect("the attachment is stored");

		let mode = |path: &Path| fs::metadata(path).expect("metadata").permissions().mode() & 0o777;

		assert_eq!(mode(&stored[0]), 0o600, "an attachment is world readable");
		assert_eq!(mode(&conversation_dir(&root, CONVERSATION)), 0o700);
		assert_eq!(mode(&root), 0o700, "the directory of attachments is world listable");
		fs::remove_dir_all(&root).expect("cleanup");
	}
}
