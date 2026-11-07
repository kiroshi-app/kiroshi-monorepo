use std::collections::BTreeSet;
use std::path::Path;

use super::*;
use crate::generated::{self, PACKAGES_UI, constant_name};
use crate::tokens::ICON_STROKE;

const GENERATED: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/icons/keyline.rs");
const PACKAGE: &str = "@keyline-icons/react";
const GLYPH_SUFFIX: &str = "Icon";
const ROOT_STROKE: &str = "strokeWidth";

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Variant {
	Outline,
	Fill,
}

impl Variant {
	fn module(self) -> String {
		match self {
			Variant::Outline => PACKAGE.to_string(),
			Variant::Fill => format!("{PACKAGE}/fill"),
		}
	}

	fn dist(self) -> String {
		let file = match self {
			Variant::Outline => "index.js",
			Variant::Fill => "fill.js",
		};
		format!("{PACKAGES_UI}/node_modules/{PACKAGE}/dist/{file}")
	}

	fn suffix(self) -> &'static str {
		match self {
			Variant::Outline => "",
			Variant::Fill => "_FILL",
		}
	}

	fn label(self) -> &'static str {
		match self {
			Variant::Outline => "outline",
			Variant::Fill => "fill",
		}
	}
}

fn sources(directory: &Path, found: &mut Vec<String>) {
	let entries = std::fs::read_dir(directory)
		.unwrap_or_else(|error| panic!("{}: {error}", directory.display()));
	for entry in entries.flatten() {
		let path = entry.path();
		if path.is_dir() {
			sources(&path, found);
		} else if path.extension().is_some_and(|extension| extension == "ts" || extension == "tsx")
		{
			found.push(generated::read(&path.to_string_lossy()));
		}
	}
}

fn imported() -> BTreeSet<(Variant, String)> {
	let mut files = Vec::new();
	sources(Path::new(&format!("{PACKAGES_UI}/src")), &mut files);
	let mut glyphs = BTreeSet::new();
	for source in &files {
		for variant in [Variant::Outline, Variant::Fill] {
			let from = format!("}} from \"{}\"", variant.module());
			for (end, _) in source.match_indices(&from) {
				let Some(open) = source[..end].rfind('{') else { continue };
				for name in source[open + 1..end].split(',') {
					let name = name.trim().split(" as ").next().unwrap_or_default().trim();
					if let Some(glyph) = name.strip_suffix(GLYPH_SUFFIX) {
						glyphs.insert((variant, glyph.to_string()));
					}
				}
			}
		}
	}
	glyphs
}

fn attributes(object: &str) -> Vec<(String, String)> {
	let mut pairs = Vec::new();
	let mut rest = object.trim();
	while !rest.is_empty() {
		let Some((key, after)) = rest.split_once(':') else {
			panic!("unreadable attributes {object}")
		};
		let after = after.trim_start();
		let (value, remaining) = match after.strip_prefix('"') {
			Some(quoted) => {
				let Some(end) = quoted.find('"') else { panic!("unterminated {object}") };
				(&quoted[..end], &quoted[end + 1..])
			}
			None => after.split_at(after.find(',').unwrap_or(after.len())),
		};
		pairs.push((key.trim().to_string(), value.trim().to_string()));
		rest = remaining.trim_start().trim_start_matches(',').trim_start();
	}
	pairs
}

fn kebab(attribute: &str) -> String {
	generated::words(attribute).join("-")
}

fn body(dist: &str, glyph: &str) -> String {
	let opening = format!("export function {glyph}(props) {{\n");
	let Some(start) = dist.find(&opening) else { panic!("Keyline has no {glyph}") };
	let line = dist[start + opening.len()..].lines().next().unwrap_or_default();
	let Some(root_start) = line.find("(Icon, {") else { panic!("{glyph} has no Icon root") };
	let Some(props) = line.find("...props") else { panic!("{glyph} spreads no props") };
	let root: Vec<(String, String)> = attributes(&line[root_start + 8..props])
		.into_iter()
		.map(|(key, value)| match key.as_str() {
			ROOT_STROKE => (key, ICON_STROKE.to_string()),
			_ => (key, value),
		})
		.collect();
	let mut paths = String::new();
	for (at, _) in line.match_indices("_jsx(\"") {
		let tag = &line[at + 6..];
		assert!(tag.starts_with("path\""), "{glyph} draws something else than a path");
		let Some(open) = tag.find('{') else { panic!("{glyph}") };
		let Some(close) = tag.find('}') else { panic!("{glyph}") };
		let own = attributes(&tag[open + 1..close]);
		let mut merged: Vec<(String, String)> =
			own.iter().filter(|(key, _)| key == "d").cloned().collect();
		for (key, value) in root.iter().chain(own.iter().filter(|(key, _)| key != "d")) {
			match merged.iter_mut().find(|(existing, _)| existing == key) {
				Some(slot) => slot.1 = value.clone(),
				None => merged.push((key.clone(), value.clone())),
			}
		}
		let attributes: Vec<String> =
			merged.iter().map(|(key, value)| format!("{}=\"{value}\"", kebab(key))).collect();
		paths.push_str(&format!("<path {}></path>", attributes.join(" ")));
	}
	paths
}

fn icons_map() -> Vec<(String, String)> {
	let source = generated::read(&format!("{PACKAGES_UI}/src/components/icons.tsx"));
	let opening = "const Icons = {\n";
	let Some(start) = source.find(opening) else { panic!("icons.tsx has no `{opening}`") };
	let body = &source[start + opening.len()..];
	let body = &body[..body.find("\n}").unwrap_or(body.len())];
	body.lines()
		.filter_map(|line| line.trim().trim_end_matches(',').split_once(": "))
		.filter_map(|(name, glyph)| {
			Some((name.to_string(), glyph.strip_suffix(GLYPH_SUFFIX)?.to_string()))
		})
		.collect()
}

fn rendered(glyphs: &BTreeSet<(Variant, String)>) -> String {
	let mut out = String::from("use rune::Icon;\n\n");
	let mut names = Vec::new();
	for variant in [Variant::Outline, Variant::Fill] {
		let dist = generated::read(&variant.dist());
		for (_, glyph) in glyphs.iter().filter(|(of, _)| *of == variant) {
			let name = format!("{}{}", constant_name(glyph), variant.suffix());
			out.push_str(&format!(
				"pub static {name}: Icon = Icon {{\n\tname: \"keyline-{glyph}-{}\",\n\tview: 24.0,\n\tbody: r#\"{}\"#,\n}};\n\n",
				variant.label(),
				body(&dist, glyph)
			));
			names.push(name);
		}
	}
	out.push_str(&format!("pub static KEYLINE: [&Icon; {}] = [\n", names.len()));
	for name in names {
		out.push_str(&format!("\t&{name},\n"));
	}
	out.push_str("];\n");
	let icons = icons_map();
	out.push_str(&format!("\npub static ICONS: [(&str, &Icon); {}] = [\n", icons.len()));
	for (name, glyph) in icons {
		out.push_str(&format!("\t({name:?}, &{}),\n", constant_name(&glyph)));
	}
	out.push_str("];\n");
	out
}

#[test]
fn every_keyline_glyph_packages_ui_imports_is_drawn_from_keyline() {
	generated::matches_or_bless(GENERATED, &rendered(&imported()));
}

#[test]
fn every_stroked_keyline_glyph_draws_the_icon_stroke() {
	let stroke = format!("stroke-width=\"{ICON_STROKE}\"");
	for icon in KEYLINE {
		for element in icon
			.body
			.split("></path>")
			.filter(|element| element.contains("stroke=\"currentColor\""))
		{
			assert!(element.contains(&stroke), "{} strokes another width", icon.name);
		}
	}
}

#[test]
fn the_named_glyphs_are_the_keyline_glyphs_of_packages_ui() {
	let named = [
		(&PREVIOUS, "ChevronLeft"),
		(&NEXT, "ChevronRight"),
		(&SEND, "ArrowUp"),
		(&FILE, "FileText"),
		(&SKILL, "Sparkles"),
		(&EXTERNAL_LINK, "SquareArrowUpRight"),
		(&MISSIONS, "Flag"),
		(&MESSAGE, "MessageSquare"),
		(&CLOSE, "X"),
		(&ERROR, "CircleX"),
		(&SUCCESS, "CircleCheck"),
		(&TOOL, "Wrench"),
	];
	for (icon, glyph) in named {
		assert_eq!(icon.name, format!("keyline-{glyph}-outline"));
	}
	assert_eq!(CONVERSATIONS.name, "keyline-Message-fill");
	assert!(ICONS.iter().any(|(name, icon)| *name == "Previous" && icon.name == PREVIOUS.name));
}

#[test]
fn a_caller_restrokes_any_icon_and_the_default_stays_the_icon_stroke() {
	assert!(std::ptr::eq(stroked(&PREVIOUS, ICON_STROKE), &PREVIOUS));
	let thin = stroked(&PREVIOUS, 1.6);
	assert!(thin.body.contains("stroke-width=\"1.6\""));
	assert!(!thin.body.contains(&format!("stroke-width=\"{ICON_STROKE}\"")));
	assert_eq!(thin.body.replace("1.6", "2.16"), PREVIOUS.body);
	assert_ne!(thin.name, PREVIOUS.name);
	assert!(std::ptr::eq(stroked(&PREVIOUS, 1.6), thin));
	assert!(stroked(&SUPERSET, 1.0).body.contains("stroke-width=\"1\""));
}
