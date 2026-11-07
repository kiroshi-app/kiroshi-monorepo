use std::ffi::OsString;
use std::fs;
use std::future::Future;
use std::io;
use std::path::{Path, PathBuf};

use crate::db::{Database, DatabaseError};

pub trait FileStore {
	const DIR_NAME: &'static str;

	fn referenced(
		database: &Database,
	) -> impl Future<Output = Result<Vec<String>, DatabaseError>> + Send;

	fn kept(dir: &Path, referenced: &[String]) -> Vec<OsString>;

	fn remove(path: &Path) -> io::Result<()>;

	fn dir(core: &crate::core_context::Core) -> Option<PathBuf> {
		Some(core.data_dir().join(Self::DIR_NAME))
	}

	fn sweep_referenced(
		database: &Database,
		dir: Option<&Path>,
	) -> impl Future<Output = ()> + Send {
		async move {
			let Some(dir) = dir else {
				return;
			};
			match Self::referenced(database).await {
				Ok(referenced) => Self::sweep(dir, &referenced),
				Err(error) => {
					eprintln!(
						"the {} sweep kept everything, its references are unread: {error:?}",
						Self::DIR_NAME
					)
				}
			}
		}
	}

	fn sweep(dir: &Path, referenced: &[String]) {
		let kept = Self::kept(dir, referenced);
		let Ok(entries) = fs::read_dir(dir) else {
			return;
		};
		for entry in entries.flatten() {
			let name = entry.file_name();
			if kept.contains(&name) {
				continue;
			}
			if let Err(error) = Self::remove(&entry.path()) {
				eprintln!("the {} sweep left {name:?} in place: {error}", Self::DIR_NAME);
			}
		}
	}
}
