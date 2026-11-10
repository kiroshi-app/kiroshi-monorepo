pub const PACKAGES_UI: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../packages/ui");

const BLESS: &str = "KIROSHI_BLESS";

pub fn read(path: &str) -> String {
	std::fs::read_to_string(path).unwrap_or_else(|error| panic!("{path}: {error}"))
}

pub fn words(name: &str) -> Vec<String> {
	let mut words: Vec<String> = Vec::new();
	let mut previous_lower = false;
	for character in name.chars() {
		if character == '-' || character == '_' {
			words.push(String::new());
			previous_lower = false;
			continue;
		}
		if character.is_uppercase() && previous_lower || words.is_empty() {
			words.push(String::new());
		}
		previous_lower = character.is_lowercase() || character.is_ascii_digit();
		if let Some(word) = words.last_mut() {
			word.extend(character.to_lowercase());
		}
	}
	words.retain(|word| !word.is_empty());
	words
}

pub fn constant_name(name: &str) -> String {
	words(name).join("_").to_uppercase()
}

pub fn matches_or_bless(path: &str, expected: &str) {
	if std::env::var_os(BLESS).is_some() {
		std::fs::write(path, expected).unwrap_or_else(|error| panic!("{path}: {error}"));
		return;
	}
	let committed = std::fs::read_to_string(path).unwrap_or_default();
	let first_difference = committed.lines().zip(expected.lines()).position(|(a, b)| a != b);
	assert!(
		committed == expected,
		"{path} is stale from line {:?}: rerun this test with {BLESS}=1",
		first_difference.map(|line| line + 1)
	);
}
