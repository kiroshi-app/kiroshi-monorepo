use std::path::{Path, PathBuf};

pub fn home_dir() -> Option<PathBuf> {
	std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

pub fn path(value: &Path) -> String {
	match home_dir().and_then(|home| value.strip_prefix(home).ok().map(Path::to_path_buf)) {
		Some(rest) => format!("~/{}", rest.display()),
		None => value.display().to_string(),
	}
}

pub fn text(value: &str) -> String {
	match home_dir().map(|home| home.display().to_string()) {
		Some(home) if !home.is_empty() => value.replace(&home, "~"),
		_ => value.to_owned(),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn paths_and_text_both_lose_the_home_prefix() {
		let home = home_dir().expect("home");
		assert_eq!(path(&home.join(".local/bin/agent")), "~/.local/bin/agent");
		assert_eq!(text(&format!("cat {}/notes.txt", home.display())), "cat ~/notes.txt");
	}

	#[test]
	fn paths_outside_home_are_untouched() {
		assert_eq!(path(Path::new("/usr/local/bin/agent")), "/usr/local/bin/agent");
		assert_eq!(text("echo hello"), "echo hello");
	}
}
