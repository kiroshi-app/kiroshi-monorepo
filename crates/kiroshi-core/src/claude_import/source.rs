use std::path::{Component, Path, PathBuf};

pub const AGENTS_DIR: &str = "agents";
pub const SKILLS_DIR: &str = "skills";
pub const SKILL_FILE: &str = "SKILL.md";
pub const CLAUDE_MD: &str = "CLAUDE.md";
pub const AGENT_EXTENSION: &str = "md";

pub enum Source {
	Agent(PathBuf),
	Skill(PathBuf),
	ClaudeMd(PathBuf),
}

pub fn agent_key(file_name: &str) -> String {
	format!("{AGENTS_DIR}/{file_name}")
}

pub fn skill_key(dir_name: &str) -> String {
	format!("{SKILLS_DIR}/{dir_name}")
}

pub fn source_of(root: &Path, key: &str) -> Option<Source> {
	if key == CLAUDE_MD {
		return Some(Source::ClaudeMd(root.join(CLAUDE_MD)));
	}
	let (dir, name) = key.split_once('/')?;
	if !names_one_entry(name) {
		return None;
	}
	match dir {
		AGENTS_DIR if is_agent_file(Path::new(name)) => {
			Some(Source::Agent(root.join(AGENTS_DIR).join(name)))
		}
		SKILLS_DIR => Some(Source::Skill(root.join(SKILLS_DIR).join(name))),
		_ => None,
	}
}

pub fn is_agent_file(path: &Path) -> bool {
	path.extension().is_some_and(|extension| extension == AGENT_EXTENSION)
}

fn names_one_entry(name: &str) -> bool {
	let mut parts = Path::new(name).components();
	matches!((parts.next(), parts.next()), (Some(Component::Normal(_)), None))
}
