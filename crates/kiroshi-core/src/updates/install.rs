use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;
use uuid::Uuid;

use super::source::{Installer, RunningApp};
use crate::core_context::Core;

const WINDOWS_SETUP_ARGS: [&str; 3] = ["/P", "/UPDATE", "/R"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Relaunch {
	program: PathBuf,
	args: Vec<OsString>,
}

impl Relaunch {
	pub fn spawned(&self) -> io::Result<()> {
		Command::new(&self.program).args(&self.args).spawn().map(drop)
	}
}

pub(super) async fn installed(
	core: &Core,
	running: &RunningApp,
	artifact: Vec<u8>,
) -> Result<Relaunch, String> {
	let location = running.location.clone();
	match running.installer {
		Installer::MacBundle => {
			let bundle = location.clone();
			core.spawn_blocking(move || swapped_bundle(&bundle, &artifact))
				.await
				.map_err(|error| format!("the install stopped: {error}"))??;
			Ok(Relaunch {
				program: "/usr/bin/open".into(),
				args: vec!["-n".into(), location.into()],
			})
		}
		Installer::DebianPackage => {
			let package = staged_file(&artifact, "deb")?;
			let installing = debian_package_installed(&package).await;
			if let Err(error) = fs::remove_file(&package) {
				log::warn!("the downloaded update package was not removed: {error}");
			}
			installing?;
			Ok(Relaunch { program: location, args: Vec::new() })
		}
		Installer::WindowsSetup => Ok(Relaunch {
			program: staged_file(&artifact, "exe")?,
			args: WINDOWS_SETUP_ARGS.iter().map(OsString::from).collect(),
		}),
	}
}

fn swapped_bundle(location: &Path, archive: &[u8]) -> Result<(), String> {
	let refused = |error: io::Error| format!("the app bundle was not replaced: {error}");
	let parent = location.parent().ok_or_else(|| refused(io::Error::other("it has no folder")))?;
	let name = location
		.file_name()
		.ok_or_else(|| refused(io::Error::other("it has no name")))?
		.to_string_lossy();
	let attempt = Uuid::new_v4();
	let staging = parent.join(format!(".{name}.update-{attempt}"));
	let backup = parent.join(format!(".{name}.previous-{attempt}"));
	let swapped = staged_bundle(&staging, archive)
		.and_then(|bundle| replaced(location, &bundle, &backup))
		.map_err(refused);
	removed(&staging, "staged update");
	swapped
}

fn staged_bundle(staging: &Path, archive: &[u8]) -> io::Result<PathBuf> {
	fs::create_dir(staging)?;
	tar::Archive::new(GzDecoder::new(archive)).unpack(staging)?;
	let entries = fs::read_dir(staging)?.collect::<io::Result<Vec<_>>>()?;
	match entries.as_slice() {
		[bundle] if bundle.file_type()?.is_dir() => Ok(bundle.path()),
		_ => Err(io::Error::new(
			io::ErrorKind::InvalidData,
			"the archive holds no single app bundle",
		)),
	}
}

fn replaced(location: &Path, staged: &Path, backup: &Path) -> io::Result<()> {
	fs::rename(location, backup)?;
	if let Err(error) = fs::rename(staged, location) {
		return match fs::rename(backup, location) {
			Ok(()) => Err(error),
			Err(restore) => Err(io::Error::other(format!(
				"{error}, and the previous app stays beside it as a hidden backup: {restore}"
			))),
		};
	}
	removed(backup, "previous app");
	Ok(())
}

fn removed(dir: &Path, what: &str) {
	match fs::remove_dir_all(dir) {
		Ok(()) => {}
		Err(error) if error.kind() == io::ErrorKind::NotFound => {}
		Err(error) => log::warn!("the {what} was not removed: {error}"),
	}
}

fn staged_file(artifact: &[u8], extension: &str) -> Result<PathBuf, String> {
	let file = std::env::temp_dir().join(format!("kiroshi-update-{}.{extension}", Uuid::new_v4()));
	fs::write(&file, artifact).map_err(|error| format!("the update was not staged: {error}"))?;
	Ok(file)
}

async fn debian_package_installed(package: &Path) -> Result<(), String> {
	let status = tokio::process::Command::new("pkexec")
		.arg("dpkg")
		.arg("-i")
		.arg(package)
		.status()
		.await
		.map_err(|error| format!("the package install did not start: {error}"))?;
	if status.success() {
		Ok(())
	} else {
		Err(format!("the package install exited with {status}"))
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_folder() -> RemovedOnDrop {
		let folder =
			RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-install-{}", Uuid::new_v4())));
		fs::create_dir_all(&*folder).expect("the folder is created");
		folder
	}

	fn an_app_at(location: &Path, version: &str) {
		fs::create_dir_all(location.join("Contents")).expect("the bundle is created");
		fs::write(location.join("Contents/version"), version).expect("the version is written");
	}

	fn archived(bundle_name: &str, version: &str) -> Vec<u8> {
		let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
			Vec::new(),
			flate2::Compression::fast(),
		));
		let mut header = tar::Header::new_gnu();
		header.set_size(version.len() as u64);
		header.set_mode(0o644);
		header.set_cksum();
		builder
			.append_data(&mut header, format!("{bundle_name}/Contents/version"), version.as_bytes())
			.expect("the entry is archived");
		builder.into_inner().expect("the tar closes").finish().expect("the gzip closes")
	}

	fn installed_version(location: &Path) -> String {
		fs::read_to_string(location.join("Contents/version")).expect("the version reads")
	}

	fn leftovers(folder: &Path) -> Vec<String> {
		fs::read_dir(folder)
			.expect("the folder reads")
			.map(|entry| entry.expect("an entry").file_name().to_string_lossy().into_owned())
			.collect()
	}

	#[test]
	fn the_archived_bundle_replaces_the_installed_one_and_leaves_nothing_beside_it() {
		let folder = a_folder();
		let location = folder.join("Kiroshi.app");
		an_app_at(&location, "0.1.0");

		let swapped = swapped_bundle(&location, &archived("Kiroshi.app", "0.2.0"));

		assert_eq!(swapped, Ok(()));
		assert_eq!(installed_version(&location), "0.2.0");
		assert_eq!(leftovers(&folder), vec!["Kiroshi.app".to_owned()]);
	}

	#[test]
	fn an_archive_that_is_not_a_bundle_leaves_the_installed_app_untouched() {
		let folder = a_folder();
		let location = folder.join("Kiroshi.app");
		an_app_at(&location, "0.1.0");

		let swapped = swapped_bundle(&location, b"not a gzip");

		assert!(swapped.is_err());
		assert_eq!(installed_version(&location), "0.1.0");
		assert_eq!(leftovers(&folder), vec!["Kiroshi.app".to_owned()]);
	}

	#[test]
	fn a_failed_move_puts_the_previous_app_back() {
		let folder = a_folder();
		let location = folder.join("Kiroshi.app");
		an_app_at(&location, "0.1.0");

		let replacing = replaced(&location, &folder.join("missing.app"), &folder.join("backup"));

		assert!(replacing.is_err());
		assert_eq!(installed_version(&location), "0.1.0");
	}
}
