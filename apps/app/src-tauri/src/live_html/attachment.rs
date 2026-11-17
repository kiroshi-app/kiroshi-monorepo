use std::fs::File;
use std::io::Read;
use std::path::Path;

use super::contract::LiveHtmlError;

const MAX_PAGE_BYTES: u64 = 2 * 1024 * 1024;

pub(crate) fn read_page(attachments: &Path, path: &Path) -> Result<String, LiveHtmlError> {
	let folder = attachments.canonicalize().map_err(unreadable)?;
	let resolved = path.canonicalize().map_err(unreadable)?;
	if !resolved.starts_with(&folder) {
		return Err(LiveHtmlError::OutsideAttachments);
	}
	if !is_html(&resolved) {
		return Err(LiveHtmlError::NotHtml);
	}
	let file = File::open(&resolved).map_err(unreadable)?;
	let metadata = file.metadata().map_err(unreadable)?;
	if !metadata.is_file() {
		return Err(LiveHtmlError::Unreadable { detail: "not a regular file".to_owned() });
	}
	if metadata.len() > MAX_PAGE_BYTES {
		return Err(LiveHtmlError::TooLarge { bytes: metadata.len(), limit: MAX_PAGE_BYTES });
	}
	let mut html = String::new();
	file.take(MAX_PAGE_BYTES).read_to_string(&mut html).map_err(unreadable)?;
	Ok(html)
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

	fn written(path: PathBuf, content: &[u8]) -> PathBuf {
		fs::write(&path, content).expect("a written file");
		path
	}

	#[test]
	fn an_html_attachment_inside_the_folder_reads_as_its_page() {
		let store = a_store();
		let page = written(store.attachments.join("c1").join("page.HTML"), PAGE.as_bytes());

		assert_eq!(read_page(&store.attachments, &page), Ok(PAGE.to_owned()));
	}

	#[test]
	fn a_page_at_the_limit_reads() {
		let store = a_store();
		let page = written(
			store.attachments.join("c1").join("page.html"),
			&vec![b'a'; MAX_PAGE_BYTES as usize],
		);

		assert_eq!(
			read_page(&store.attachments, &page).map(|html| html.len() as u64),
			Ok(MAX_PAGE_BYTES)
		);
	}

	#[test]
	fn a_path_climbing_out_through_dot_dot_is_refused() {
		let store = a_store();
		written(store.outside.join("page.html"), PAGE.as_bytes());
		let climbing =
			store.attachments.join("c1").join("..").join("..").join("outside").join("page.html");

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
		let link = store.attachments.join("c1").join("link.html");
		std::os::unix::fs::symlink(&target, &link).expect("a symlink");

		assert_eq!(read_page(&store.attachments, &link), Err(LiveHtmlError::OutsideAttachments));
	}

	#[test]
	fn a_file_that_is_not_html_is_refused() {
		let store = a_store();
		let text = written(store.attachments.join("c1").join("page.txt"), PAGE.as_bytes());

		assert_eq!(read_page(&store.attachments, &text), Err(LiveHtmlError::NotHtml));
	}

	#[test]
	fn a_page_above_the_limit_is_refused_with_its_size() {
		let store = a_store();
		let bytes = MAX_PAGE_BYTES + 1;
		let page =
			written(store.attachments.join("c1").join("page.html"), &vec![b'a'; bytes as usize]);

		assert_eq!(
			read_page(&store.attachments, &page),
			Err(LiveHtmlError::TooLarge { bytes, limit: MAX_PAGE_BYTES })
		);
	}

	#[test]
	fn a_missing_page_is_unreadable() {
		let store = a_store();
		let missing = store.attachments.join("c1").join("missing.html");

		assert!(matches!(
			read_page(&store.attachments, &missing),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}

	#[test]
	fn a_page_that_is_not_utf8_is_unreadable() {
		let store = a_store();
		let page = written(store.attachments.join("c1").join("page.html"), &[0xff, 0xfe, 0xfd]);

		assert!(matches!(
			read_page(&store.attachments, &page),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}

	#[test]
	fn a_folder_named_like_a_page_is_unreadable() {
		let store = a_store();
		let folder = store.attachments.join("c1").join("folder.html");
		fs::create_dir(&folder).expect("a folder");

		assert!(matches!(
			read_page(&store.attachments, &folder),
			Err(LiveHtmlError::Unreadable { .. })
		));
	}
}
