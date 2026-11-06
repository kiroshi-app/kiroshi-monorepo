pub mod picture;

use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::db::{Database, DatabaseError};
use crate::file_store::FileStore;
use crate::private_files;

pub use picture::Rejection;

const EXTENSION: &str = "png";

pub struct Avatars;

impl FileStore for Avatars {
	const DIR_NAME: &'static str = "avatars";

	async fn referenced(database: &Database) -> Result<Vec<String>, DatabaseError> {
		database.referenced_avatar_paths().await
	}

	fn kept(dir: &Path, referenced: &[String]) -> Vec<OsString> {
		referenced.iter().filter_map(|path| held_name(dir, path)).collect()
	}

	fn remove(path: &Path) -> io::Result<()> {
		fs::remove_file(path)
	}
}

pub fn minted_path(dir: &Path) -> PathBuf {
	dir.join(format!("{}.{EXTENSION}", Uuid::new_v4()))
}

pub fn write(path: &Path, bytes: &[u8]) -> Result<(), Rejection> {
	private_files::write(path, bytes).map_err(unwritable)
}

pub fn readable(dir: &Path, recorded: &str) -> Option<PathBuf> {
	held_name(dir, recorded)?;
	let inside = dir.canonicalize().ok()?;
	let resolved = Path::new(recorded).canonicalize().ok()?;
	if resolved.parent() != Some(inside.as_path()) || !resolved.is_file() {
		return None;
	}
	Some(dir.join(resolved.file_name()?))
}

fn held_name(dir: &Path, recorded: &str) -> Option<OsString> {
	let path = Path::new(recorded);
	if path.parent() != Some(dir) {
		return None;
	}
	Some(path.file_name()?.to_owned())
}

fn unwritable(error: std::io::Error) -> Rejection {
	Rejection::Unwritable { detail: error.to_string() }
}

#[cfg(test)]
mod tests {
	use super::picture::fixtures::a_png;
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	fn temp_dir() -> RemovedOnDrop {
		let dir =
			RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-avatars-{}", Uuid::new_v4())));
		fs::create_dir_all(&dir).expect("temp dir");
		dir
	}

	fn a_stored_avatar(dir: &Path) -> String {
		let path = minted_path(dir);
		let bytes = picture::normalised(&a_png(24, 24)).expect("the picture is accepted");
		write(&path, &bytes).expect("the picture is written");
		path.to_string_lossy().into_owned()
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

	#[test]
	fn a_stored_picture_is_reachable_under_the_path_it_was_recorded_as() {
		let dir = temp_dir();

		let recorded = a_stored_avatar(&dir);

		assert_eq!(readable(&dir, &recorded), Some(PathBuf::from(&recorded)));
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn two_avatars_stored_in_a_row_are_two_files() {
		let dir = temp_dir();

		let first = a_stored_avatar(&dir);
		let second = a_stored_avatar(&dir);

		assert_ne!(first, second);
		assert_eq!(names_in(&dir).len(), 2);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_path_that_walks_out_of_the_directory_is_refused_rather_than_read() {
		let dir = temp_dir();
		let outside = dir.parent().expect("a parent").join("outside.png");
		fs::write(&outside, a_png(8, 8)).expect("the file outside exists");

		let escaping = dir.join("..").join("outside.png");

		assert_eq!(readable(&dir, &escaping.to_string_lossy()), None);
		assert!(outside.exists(), "the refused path was read anyway");
		fs::remove_file(&outside).expect("cleanup");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn an_absolute_path_somewhere_else_entirely_is_refused() {
		let dir = temp_dir();

		assert_eq!(readable(&dir, "/etc/passwd"), None);
		assert_eq!(readable(&dir, "../../secrets/key.pem"), None);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn a_symlink_out_of_the_directory_is_refused_by_where_it_resolves() {
		let dir = temp_dir();
		let outside = dir.parent().expect("a parent").join("linked.png");
		fs::write(&outside, a_png(8, 8)).expect("the file outside exists");
		let planted = dir.join("planted.png");
		std::os::unix::fs::symlink(&outside, &planted).expect("the symlink is planted");

		assert_eq!(readable(&dir, &planted.to_string_lossy()), None);
		fs::remove_file(&outside).expect("cleanup");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_recorded_path_whose_file_is_gone_reads_as_no_picture() {
		let dir = temp_dir();
		let recorded = a_stored_avatar(&dir);
		fs::remove_file(&recorded).expect("the file is removed");

		assert_eq!(readable(&dir, &recorded), None);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_directory_under_an_accepted_name_is_not_a_picture() {
		let dir = temp_dir();
		let masquerading = dir.join("folder.png");
		fs::create_dir_all(&masquerading).expect("the directory exists");

		assert_eq!(readable(&dir, &masquerading.to_string_lossy()), None);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_sweep_keeps_what_is_referenced_and_removes_the_rest() {
		let dir = temp_dir();
		let kept = a_stored_avatar(&dir);
		let dropped = a_stored_avatar(&dir);

		Avatars::sweep(&dir, std::slice::from_ref(&kept));

		assert!(Path::new(&kept).exists(), "a referenced picture was swept");
		assert!(!Path::new(&dropped).exists(), "an unreferenced picture stayed behind");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_sweep_with_nothing_referenced_empties_the_directory() {
		let dir = temp_dir();
		a_stored_avatar(&dir);
		a_stored_avatar(&dir);

		Avatars::sweep(&dir, &[]);

		assert_eq!(names_in(&dir), Vec::<String>::new());
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_sweep_leaves_a_referenced_name_whose_file_is_not_written_yet() {
		let dir = temp_dir();
		let promised = minted_path(&dir);
		let existing = a_stored_avatar(&dir);

		Avatars::sweep(&dir, &[promised.to_string_lossy().into_owned()]);

		assert!(!Path::new(&existing).exists(), "the replaced picture stayed behind");
		write(&promised, &picture::normalised(&a_png(8, 8)).expect("accepted"))
			.expect("the promised picture is written");
		assert!(promised.exists());
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_sweep_ignores_a_reference_that_points_outside_the_directory() {
		let dir = temp_dir();
		let stored = a_stored_avatar(&dir);

		Avatars::sweep(&dir, &["/etc/passwd".to_owned(), stored.clone()]);

		assert!(Path::new(&stored).exists(), "a referenced picture was swept");
		assert!(Path::new("/etc/passwd").exists(), "the sweep reached outside its directory");
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn what_a_user_uploaded_is_reachable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let parent = temp_dir();
		let dir = parent.join("made-by-the-write");
		let recorded = a_stored_avatar(&dir);

		let mode = |path: &Path| fs::metadata(path).expect("metadata").permissions().mode() & 0o777;

		assert_eq!(mode(Path::new(&recorded)), 0o600, "an uploaded picture is world readable");
		assert_eq!(mode(&dir), 0o700, "the directory of uploaded pictures is world listable");
		fs::remove_dir_all(&parent).expect("cleanup");
	}

	#[test]
	fn the_first_picture_makes_the_directory_that_no_read_created() {
		let parent = temp_dir();
		let dir = parent.join("not-yet");

		assert_eq!(readable(&dir, "anything.png"), None, "a read of a missing directory failed");
		Avatars::sweep(&dir, &[]);
		assert!(!dir.exists(), "resolving or sweeping a directory created it");

		let recorded = a_stored_avatar(&dir);

		assert!(dir.is_dir(), "the first picture did not make the place it goes");
		assert_eq!(readable(&dir, &recorded), Some(PathBuf::from(&recorded)));
		fs::remove_dir_all(dir.parent().expect("a parent")).expect("cleanup");
	}
}
