use std::io::ErrorKind;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::time::Duration;

const REMOVALS_WHILE_A_LATE_WRITE_LANDS: usize = 10;

const PAUSE_FOR_A_LATE_WRITE: Duration = Duration::from_millis(50);

#[must_use = "the path is removed as soon as this guard drops"]
pub struct RemovedOnDrop(pub PathBuf);

impl Deref for RemovedOnDrop {
	type Target = Path;

	fn deref(&self) -> &Path {
		&self.0
	}
}

impl AsRef<Path> for RemovedOnDrop {
	fn as_ref(&self) -> &Path {
		&self.0
	}
}

impl Drop for RemovedOnDrop {
	fn drop(&mut self) {
		let mut removal = remove(&self.0);
		for _ in 1..REMOVALS_WHILE_A_LATE_WRITE_LANDS {
			match &removal {
				Err(failure) if failure.kind() == ErrorKind::DirectoryNotEmpty => {
					std::thread::sleep(PAUSE_FOR_A_LATE_WRITE);
					removal = remove(&self.0);
				}
				_ => break,
			}
		}
		if let Err(failure) = removal {
			if failure.kind() != ErrorKind::NotFound {
				eprintln!("the test path {} was not removed: {failure}", self.0.display());
			}
		}
	}
}

fn remove(path: &Path) -> std::io::Result<()> {
	if path.is_dir() {
		std::fs::remove_dir_all(path)
	} else {
		std::fs::remove_file(path)
	}
}
