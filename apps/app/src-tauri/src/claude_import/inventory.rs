use std::collections::BTreeSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use super::contract::{ClaudeInventory, ClaudeItem};
use super::source::{
	agent_key, is_agent_file, skill_key, AGENTS_DIR, CLAUDE_MD, SKILLS_DIR, SKILL_FILE,
};
use crate::bundles;

pub(super) fn inventory(root: &Path, imported: &BTreeSet<String>) -> ClaudeInventory {
	match listed(root, imported) {
		Ok(found) => found,
		Err(failure) => ClaudeInventory::Refused { cause: failure.to_string() },
	}
}

fn listed(root: &Path, imported: &BTreeSet<String>) -> std::io::Result<ClaudeInventory> {
	if let Err(failure) = fs::read_dir(root) {
		return match failure.kind() {
			ErrorKind::NotFound => Ok(ClaudeInventory::Absent),
			_ => Err(failure),
		};
	}
	let item = |key: String, path: &Path, fallback: &str| {
		let (name, description) = described(&key, path, fallback);
		ClaudeItem { already_imported: imported.contains(&key), key, name, description }
	};
	let agents = entries(&root.join(AGENTS_DIR))?
		.into_iter()
		.filter(|path| is_agent_file(path) && path.is_file())
		.map(|path| item(agent_key(&file_name(&path)), &path, &stem(&path)))
		.collect();
	let skills = entries(&root.join(SKILLS_DIR))?
		.into_iter()
		.filter(|path| path.join(SKILL_FILE).is_file())
		.map(|path| {
			let dir_name = file_name(&path);
			item(skill_key(&dir_name), &path.join(SKILL_FILE), &dir_name)
		})
		.collect();
	let claude_md = root.join(CLAUDE_MD);
	let claude_md = claude_md.is_file().then(|| item(CLAUDE_MD.to_owned(), &claude_md, CLAUDE_MD));
	Ok(ClaudeInventory::Found { agents, skills, claude_md })
}

fn entries(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
	let read = match fs::read_dir(dir) {
		Ok(read) => read,
		Err(failure) if failure.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
		Err(failure) => return Err(failure),
	};
	let mut paths =
		read.map(|entry| entry.map(|entry| entry.path())).collect::<Result<Vec<_>, _>>()?;
	paths.sort();
	Ok(paths)
}

fn described(key: &str, path: &Path, fallback: &str) -> (String, String) {
	match fs::read_to_string(path).and_then(|text| bundles::fronted(&text)) {
		Ok(fronted) => (fronted.name.unwrap_or_else(|| fallback.to_owned()), fronted.description),
		Err(failure) => {
			log::warn!("{key} is listed by its file name, its frontmatter did not read: {failure}");
			(fallback.to_owned(), String::new())
		}
	}
}

fn file_name(path: &Path) -> String {
	path.file_name().unwrap_or_default().to_string_lossy().into_owned()
}

fn stem(path: &Path) -> String {
	path.file_stem().unwrap_or_default().to_string_lossy().into_owned()
}
