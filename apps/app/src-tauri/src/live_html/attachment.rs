use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use super::contract::LiveHtmlError;

pub struct AttachedPage {
	attachments: PathBuf,
	path: PathBuf,
}

impl AttachedPage {
	pub(crate) fn checked(attachments: PathBuf, path: PathBuf) -> Result<Self, LiveHtmlError> {
		opened_page(&attachments, &path)?;
		Ok(Self { attachments, path })
	}

	pub(crate) fn read(&self) -> Result<String, LiveHtmlError> {
		read_page(&self.attachments, &self.path)
	}
}

pub(crate) fn read_page(attachments: &Path, path: &Path) -> Result<String, LiveHtmlError> {
	let mut html = String::new();
	opened_page(attachments, path)?.read_to_string(&mut html).map_err(unreadable)?;
	Ok(html)
}

fn opened_page(attachments: &Path, path: &Path) -> Result<File, LiveHtmlError> {
	let folder = attachments.canonicalize().map_err(unreadable)?;
	let resolved = path.canonicalize().map_err(unreadable)?;
	if !resolved.starts_with(&folder) {
		return Err(LiveHtmlError::OutsideAttachments);
	}
	if !is_html(&resolved) {
		return Err(LiveHtmlError::NotHtml);
	}
	let file = File::open(&resolved).map_err(unreadable)?;
	if !file.metadata().map_err(unreadable)?.is_file() {
		return Err(LiveHtmlError::Unreadable { detail: "not a regular file".to_owned() });
	}
	Ok(file)
}

fn is_html(path: &Path) -> bool {
	path.extension()
		.and_then(|extension| extension.to_str())
		.is_some_and(|extension| extension.eq_ignore_ascii_case("html"))
}

fn unreadable(failure: impl ToString) -> LiveHtmlError {
	LiveHtmlError::Unreadable { detail: failure.to_string() }
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;

	use uuid::Uuid;

	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	const PAGE: &str = "<!doctype html><p>stored</p>";

	struct Store {
		_base: RemovedOnDrop,
		attachments: PathBuf,
		outside: PathBuf,
	}

	fn a_store() -> Store {
		let base = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-live-html-{}", Uuid::new_v4())),
		);
		let attachments = base.join("attachments");
		let outside = base.join("outside");
		fs::create_dir_all(attachments.join("c1")).expect("the attachments folder");
		fs::create_dir_all(&outside).expect("the outside folder");
		Store { attachments, outside, _base: base }
	}

	impl Store {
		fn stored(&self, name: &str) -> PathBuf {
			self.attachments.join("c1").join(name)
		}
	}

	fn written(path: PathBuf, content: &[u8]) -> PathBuf {
		fs::write(&path, content).expect("a written file");
		path
	}

	#[test]
	fn an_html_attachment_inside_the_folder_reads_as_its_page() {
		let store = a_store();
		let page = written(store.stored("page.HTML"), PAGE.as_bytes());

		assert_eq!(read_page(&store.attachments, &page), Ok(PAGE.to_owned()));
	}

	#[test]
	fn a_page_far_above_the_former_two_mebibyte_limit_reads_whole() {
		let store = a_store();
		let bytes = 20 * 1024 * 1024;
		let page = written(store.stored("page.html"), &vec![b'a'; bytes]);

		assert_eq!(read_page(&store.attachments, &page).map(|html| html.len()), Ok(bytes));
	}

	#[test]
	fn a_path_climbing_out_through_dot_dot_is_refused() {
		let store = a_store();
		written(store.outside.join("page.html"), PAGE.as_bytes());
		let climbing = store.stored("..").join("..").join("outside").join("page.html");

		assert_eq!(
			read_page(&store.attachments, &climbing),
			Err(LiveHtmlError::OutsideAttachments)
		);
	}

	#[cfg(unix)]
	#[test]
	fn a_symlink_leading_out_of_the_folder_is_refused() {
		let store = a_store();
		let target = written(store.outside.join("page.html"), PAGE.as_bytes());
		let link = store.stored("link.html");
		std::os::unix::fs::symlink(&target, &link).expect("a symlink");

		assert_eq!(read_page(&store.attachments, &link), Err(LiveHtmlError::OutsideAttachments));
	}

	#[test]
	fn a_file_that_is_not_html_is_refused() {
		let store = a_store();
		let text = written(store.stored("page.txt"), PAGE.as_bytes());

		assert_eq!(read_page(&store.attachments, &text), Err(LiveHtmlError::NotHtml));
	}

	#[test]
	fn a_missing_page_is_unreadable() {
		let store = a_store();
		let missing = store.stored("missing.html");

		assert!(matches!(
			read_page(&store.attachments, &missing),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}

	#[test]
	fn a_missing_page_is_refused_at_mount_as_unreadable() {
		let store = a_store();

		assert!(matches!(
			AttachedPage::checked(store.attachments.clone(), store.stored("missing.html")),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}

	#[test]
	fn a_page_removed_after_its_mount_reads_as_unreadable() {
		let store = a_store();
		let path = written(store.stored("page.html"), PAGE.as_bytes());
		let attached = AttachedPage::checked(store.attachments.clone(), path.clone())
			.expect("the page is checked");
		fs::remove_file(&path).expect("the page is removed");

		assert!(matches!(attached.read(), Err(LiveHtmlError::Unreadable { .. })));
	}

	#[test]
	fn a_page_that_is_not_utf8_is_unreadable() {
		let store = a_store();
		let page = written(store.stored("page.html"), &[0xff, 0xfe, 0xfd]);

		assert!(matches!(
			read_page(&store.attachments, &page),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}

	#[test]
	fn a_folder_named_like_a_page_is_unreadable() {
		let store = a_store();
		let folder = store.stored("folder.html");
		fs::create_dir(&folder).expect("a folder");

		assert!(matches!(
			read_page(&store.attachments, &folder),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}
}
