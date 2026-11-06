use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::private_files;

const HOST_DIR: &str = "host";

const TOKEN_NAME: &str = "token";

const LEGACY_WEB_LINK_NAME: &str = "web-link.txt";

const RANDOM_PARTS: usize = 3;

#[derive(Debug)]
pub enum TokenError {
	NoDataDir,
	Unreadable(std::io::Error),
	Unwritable(std::io::Error),
	Blank,
}

pub struct HostToken(String);

impl HostToken {
	pub(crate) fn random() -> Self {
		Self(fresh())
	}

	pub fn bearer(&self) -> &str {
		&self.0
	}

	pub fn admits(&self, presented: &str) -> bool {
		let expected = self.0.as_bytes();
		let presented = presented.as_bytes();
		let differing = expected
			.iter()
			.zip(presented)
			.fold(expected.len() ^ presented.len(), |held, (a, b)| held | usize::from(a ^ b));
		std::hint::black_box(differing) == 0
	}
}

fn host_file(core: &crate::core_context::Core, name: &str) -> PathBuf {
	core.data_dir().join(HOST_DIR).join(name)
}

pub fn legacy_web_link_removed(core: &crate::core_context::Core) -> Result<(), TokenError> {
	match fs::remove_file(host_file(core, LEGACY_WEB_LINK_NAME)) {
		Err(missing) if missing.kind() == ErrorKind::NotFound => Ok(()),
		removed => removed.map_err(TokenError::Unwritable),
	}
}

pub fn loaded(core: &crate::core_context::Core) -> Result<HostToken, TokenError> {
	let path = host_file(core, TOKEN_NAME);
	match fs::read_to_string(&path) {
		Ok(held) => held_token(&held),
		Err(missing) if missing.kind() == ErrorKind::NotFound => written(&path),
		Err(failure) => Err(TokenError::Unreadable(failure)),
	}
}

fn held_token(held: &str) -> Result<HostToken, TokenError> {
	match held.trim() {
		"" => Err(TokenError::Blank),
		token => Ok(HostToken(token.to_owned())),
	}
}

fn written(path: &Path) -> Result<HostToken, TokenError> {
	let token = fresh();
	private_files::replace_atomically(path, token.as_bytes()).map_err(TokenError::Unwritable)?;
	Ok(HostToken(token))
}

fn fresh() -> String {
	(0..RANDOM_PARTS).map(|_| Uuid::new_v4().simple().to_string()).collect()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_fresh_token_carries_at_least_32_bytes() {
		assert!(fresh().len() >= 32);
		assert_ne!(fresh(), fresh());
	}

	#[test]
	fn only_the_exact_token_is_admitted() {
		let token = HostToken("abc".to_owned());
		assert!(token.admits("abc"));
		assert!(!token.admits("abd"));
		assert!(!token.admits("ab"));
		assert!(!token.admits("abcd"));
		assert!(!token.admits(""));
	}

	#[test]
	fn a_blank_file_holds_no_token() {
		assert!(matches!(held_token(" \n"), Err(TokenError::Blank)));
	}
}
