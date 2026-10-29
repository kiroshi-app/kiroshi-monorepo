pub const NAME: &str = "Shoto";

pub const TITLE: &str = "Guide";

pub const AVATAR: &[u8] = include_bytes!("../../plugins/shoto/avatar.jpeg");

const PERSONA: &[u8] = include_bytes!("../../plugins/shoto/persona.md");

pub const SKILLS: [(&str, &[u8]); 4] = [
	("connect", include_bytes!("../../plugins/shoto/skills/connect/SKILL.md")),
	("first-companion", include_bytes!("../../plugins/shoto/skills/first-companion/SKILL.md")),
	("how-kiroshi-works", include_bytes!("../../plugins/shoto/skills/how-kiroshi-works/SKILL.md")),
	("hand-off", include_bytes!("../../plugins/shoto/skills/hand-off/SKILL.md")),
];

pub fn persona() -> String {
	String::from_utf8_lossy(PERSONA).trim().to_owned()
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::{Path, PathBuf};

	use super::super::{SKILLS_DIR, SKILL_NAME};
	use super::*;

	const PERSONA_NAME: &str = "persona.md";
	const AVATAR_NAME: &str = "avatar.jpeg";

	fn committed() -> PathBuf {
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join("shoto")
	}

	fn committed_files(dir: &Path) -> Vec<PathBuf> {
		let Ok(entries) = fs::read_dir(dir) else {
			return Vec::new();
		};
		entries
			.flatten()
			.map(|entry| entry.path())
			.flat_map(|path| if path.is_dir() { committed_files(&path) } else { vec![path] })
			.collect()
	}

	fn embedded(name: &str) -> &'static [u8] {
		match name {
			PERSONA_NAME => PERSONA,
			AVATAR_NAME => AVATAR,
			_ => skill_bytes(name).unwrap_or_else(|| panic!("{name} is embedded")),
		}
	}

	fn skill_bytes(name: &str) -> Option<&'static [u8]> {
		let id = name
			.strip_prefix(&format!("{SKILLS_DIR}/"))?
			.strip_suffix(&format!("/{SKILL_NAME}"))?;
		SKILLS.iter().find(|(held, _)| *held == id).map(|(_, bytes)| *bytes)
	}

	#[test]
	fn every_committed_file_is_embedded() {
		let root = committed();
		let files = committed_files(&root);

		assert_eq!(files.len(), SKILLS.len() + 2, "a committed file is not embedded");
		for file in files {
			let name = file
				.strip_prefix(&root)
				.expect("the file sits under the plugin")
				.to_string_lossy()
				.replace('\\', "/");
			assert_eq!(embedded(&name), fs::read(&file).expect("it reads"), "got {name}");
		}
	}

	#[test]
	fn the_persona_is_text_that_names_the_companion() {
		let text = persona();

		assert!(text.starts_with(&format!("# {NAME}")), "got {text}");
		assert_eq!(text, text.trim(), "the persona carries blank edges");
	}

	fn denies_a_browser(sentence: &str) -> bool {
		sentence.contains("browser")
			&& ["does not", "did not", "doesn't", "didn't", "no browser"]
				.iter()
				.any(|missing| sentence.contains(missing))
	}

	#[test]
	fn no_embedded_text_frames_the_pasted_code_as_a_repair() {
		for (id, bytes) in SKILLS.iter().chain(&[(PERSONA_NAME, PERSONA)]) {
			let text = String::from_utf8_lossy(bytes).to_lowercase();

			assert!(!text.contains("fallback"), "{id} names a fallback");
			for sentence in text.split(['.', '\n']) {
				assert!(!denies_a_browser(sentence), "{id} pairs a browser with not opening");
			}
		}
	}

	#[test]
	fn every_skill_carries_its_name_and_its_description() {
		for (id, bytes) in SKILLS {
			let text = String::from_utf8_lossy(bytes);

			assert!(text.starts_with("---\n"), "{id} has no frontmatter");
			assert!(text.contains(&format!("name: \"{id}\"")), "{id} is named otherwise");
			assert!(text.contains("description: \""), "{id} has no description");
			assert!(!text.contains("preload:"), "{id} is preloaded");
		}
	}
}
