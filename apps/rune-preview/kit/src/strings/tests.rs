use std::collections::{BTreeMap, BTreeSet};

use super::*;
use crate::generated::{self, PACKAGES_UI, constant_name, words};

const GENERATED: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/strings/catalogue.rs");
const NAMESPACES: [&str; 5] = ["bots", "chat", "common", "search", "settings"];
const PLURAL_ONE: &str = "_one";
const PLURAL_OTHER: &str = "_other";
const PLURAL_MANY: &str = "_many";
const STALE_IN_FRENCH: [&str; 7] = [
	"bots.approvals.directories.add",
	"bots.approvals.directories.empty",
	"bots.approvals.directories.hint",
	"bots.approvals.directories.invalid",
	"bots.approvals.directories.label",
	"bots.approvals.directories.placeholder",
	"bots.approvals.directories.remove",
];

const RUST_KEYWORDS: [&str; 18] = [
	"as", "box", "crate", "fn", "impl", "in", "loop", "match", "mod", "move", "ref", "return",
	"self", "static", "super", "type", "use", "where",
];

type Entries = Vec<(String, String)>;

struct Reader<'a> {
	source: &'a str,
	at: usize,
	file: String,
}

impl Reader<'_> {
	fn rest(&self) -> &str {
		&self.source[self.at..]
	}

	fn peek(&self) -> Option<char> {
		self.rest().chars().next()
	}

	fn fail(&self, what: &str) -> ! {
		let line = self.source[..self.at].lines().count();
		panic!("{}:{line}: {what}", self.file)
	}

	fn skip_space(&mut self) {
		let trimmed = self.rest().trim_start();
		self.at = self.source.len() - trimmed.len();
	}

	fn expect(&mut self, wanted: char) {
		self.skip_space();
		if self.peek() != Some(wanted) {
			self.fail(&format!("expected `{wanted}`"));
		}
		self.at += wanted.len_utf8();
	}

	fn string(&mut self) -> String {
		let Some(quote) = self.peek() else { self.fail("expected a string") };
		self.at += 1;
		let mut text = String::new();
		let mut characters = self.rest().char_indices();
		while let Some((offset, character)) = characters.next() {
			match character {
				c if c == quote => {
					self.at += offset + 1;
					return text;
				}
				'\\' => match characters.next() {
					Some((_, 'n')) => text.push('\n'),
					Some((_, 't')) => text.push('\t'),
					Some((_, escaped @ ('\\' | '"' | '\'' | '`'))) => text.push(escaped),
					_ => self.fail("unknown escape"),
				},
				c => text.push(c),
			}
		}
		self.fail("unterminated string")
	}

	fn key(&mut self) -> String {
		self.skip_space();
		if matches!(self.peek(), Some('"' | '\'')) {
			return self.string();
		}
		let length = self.rest().find(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$'));
		let length = length.unwrap_or_else(|| self.fail("expected a key"));
		let key = self.rest()[..length].to_string();
		self.at += length;
		key
	}

	fn skip_type_assertion(&mut self) {
		self.skip_space();
		if !self.rest().starts_with("as ") {
			return;
		}
		let mut depth = 0;
		for (offset, character) in self.rest().char_indices() {
			match character {
				'<' | '(' => depth += 1,
				'>' | ')' => depth -= 1,
				',' | '}' if depth == 0 => {
					self.at += offset;
					return;
				}
				_ => {}
			}
		}
		self.fail("unterminated type assertion")
	}

	fn object(&mut self, prefix: &str, entries: &mut Entries) {
		self.expect('{');
		loop {
			self.skip_space();
			if self.peek() == Some('}') {
				self.at += 1;
				self.skip_type_assertion();
				return;
			}
			let path = format!("{prefix}.{}", self.key());
			self.expect(':');
			self.skip_space();
			match self.peek() {
				Some('{') => self.object(&path, entries),
				Some('"' | '\'' | '`') => {
					let text = self.string();
					entries.push((path, text));
				}
				_ => self.fail("expected a string or an object"),
			}
			self.skip_space();
			if self.peek() == Some(',') {
				self.at += 1;
			}
		}
	}
}

fn catalogue(language: &str) -> Entries {
	let mut entries = Entries::new();
	for namespace in NAMESPACES {
		let file = format!("{PACKAGES_UI}/src/lib/i18n-{language}/{namespace}.ts");
		let source = generated::read(&file);
		let opening = format!("const {namespace} = ");
		let Some(start) = source.find(&opening) else { panic!("{file} has no `{opening}`") };
		let mut reader = Reader { source: &source, at: start + opening.len(), file };
		reader.object(namespace, &mut entries);
	}
	entries
}

fn module_name(segment: &str) -> String {
	let name = words(segment).join("_");
	if RUST_KEYWORDS.contains(&name.as_str()) { format!("r#{name}") } else { name }
}

#[derive(Default)]
struct Module {
	constants: Vec<(String, usize)>,
	children: BTreeMap<String, Module>,
}

impl Module {
	fn insert(&mut self, path: &[&str], index: usize) {
		match path {
			[leaf] => self.constants.push((constant_name(leaf), index)),
			[head, rest @ ..] => {
				self.children.entry(module_name(head)).or_default().insert(rest, index)
			}
			[] => {}
		}
	}

	fn render(&self, depth: usize, out: &mut String) {
		let indent = "\t".repeat(depth);
		if !self.constants.is_empty() {
			out.push_str(&format!("{indent}use crate::strings::Key;\n"));
		}
		let mut names = BTreeSet::new();
		for (name, index) in &self.constants {
			assert!(names.insert(name.clone()), "two keys name {name}");
			out.push_str(&format!("{indent}pub const {name}: Key = Key({index});\n"));
		}
		for (name, child) in &self.children {
			out.push_str(&format!("{indent}pub mod {name} {{\n"));
			child.render(depth + 1, out);
			out.push_str(&format!("{indent}}}\n"));
		}
	}
}

fn rendered(entries: &[(String, String, String)]) -> String {
	let mut out = String::new();
	out.push_str(&format!(
		"pub(super) static ENTRIES: [(&str, &str, &str); {}] = [\n",
		entries.len()
	));
	for (path, en, fr) in entries {
		out.push_str(&format!("\t({path:?}, {en:?}, {fr:?}),\n"));
	}
	out.push_str("];\n\n");
	let mut root = Module::default();
	for (index, (path, _, _)) in entries.iter().enumerate() {
		root.insert(&path.split('.').collect::<Vec<_>>(), index);
	}
	for (name, child) in &root.children {
		out.push_str(&format!("pub mod {name} {{\n"));
		child.render(1, &mut out);
		out.push_str("}\n");
	}
	out
}

fn joined(en: &Entries, fr: &Entries, stale_in_french: &[&str]) -> Vec<(String, String, String)> {
	let english: BTreeMap<&str, &str> = en.iter().map(|(p, t)| (p.as_str(), t.as_str())).collect();
	let french: BTreeMap<&str, &str> = fr.iter().map(|(p, t)| (p.as_str(), t.as_str())).collect();
	let only_english: Vec<&str> =
		english.keys().filter(|path| !french.contains_key(*path)).copied().collect();
	let only_french: Vec<&str> = french
		.keys()
		.filter(|path| !english.contains_key(*path) && !is_french_many(path, &english))
		.copied()
		.collect();
	assert!(only_english.is_empty(), "keys in en and not in fr: {only_english:?}");
	assert_eq!(only_french, stale_in_french, "keys in fr and not in en");
	let mut joined: Vec<(String, String, String)> = en
		.iter()
		.map(|(path, text)| (path.clone(), text.clone(), french[path.as_str()].to_string()))
		.collect();
	for (path, text) in fr.iter().filter(|(path, _)| !english.contains_key(path.as_str())) {
		let Some(stem) = path.strip_suffix(PLURAL_MANY) else { continue };
		let other = english[format!("{stem}{PLURAL_OTHER}").as_str()];
		joined.push((path.clone(), other.to_string(), text.clone()));
	}
	joined
}

fn is_french_many(path: &str, english: &BTreeMap<&str, &str>) -> bool {
	path.strip_suffix(PLURAL_MANY).is_some_and(|stem| {
		english.contains_key(format!("{stem}{PLURAL_ONE}").as_str())
			&& english.contains_key(format!("{stem}{PLURAL_OTHER}").as_str())
	})
}

#[test]
fn the_catalogue_is_the_en_and_fr_catalogues_of_packages_ui() {
	let expected = rendered(&joined(&catalogue("en"), &catalogue("fr"), &STALE_IN_FRENCH));
	generated::matches_or_bless(GENERATED, &expected);
}

#[test]
fn a_typed_key_reads_its_text_in_each_language() {
	assert_eq!(search::OPEN.path(), "search.open");
	assert_eq!(search::OPEN.text(Language::En), "Search");
	assert_eq!(search::OPEN.text(Language::Fr), "Rechercher");
	assert_eq!(search::rest::messages::TITLE.text(Language::En), "Search every message");
}

#[test]
fn a_key_missing_from_one_language_fails_the_join() {
	let en = vec![("a.only".to_string(), "One".to_string())];
	let fr = Entries::new();
	let failure = std::panic::catch_unwind(|| joined(&en, &fr, &[]));
	assert!(failure.is_err());
	let plural = |suffix: &str| (format!("a.count{suffix}"), suffix.to_string());
	let en = vec![plural(PLURAL_ONE), plural(PLURAL_OTHER)];
	let fr = vec![plural(PLURAL_ONE), plural(PLURAL_OTHER), plural(PLURAL_MANY)];
	assert_eq!(joined(&en, &fr, &[]).len(), 3);
}
