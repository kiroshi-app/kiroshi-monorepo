use std::collections::BTreeSet;

use rune::Color;
use rune::color::srgb_encode;

use super::*;
use crate::css::{self, Declarations, Rgba, Sheet};
use crate::generated::{self, PACKAGES_UI};
use crate::hues::Preset;

const TOLERANCE: i16 = 1;

fn css_name(token: &str) -> String {
	format!("--{}", token.replace('_', "-"))
}

fn bytes_of(colour: Color) -> [u8; 4] {
	let encode = |channel: f32| (srgb_encode(channel) * 255.0).round() as u8;
	[encode(colour.r), encode(colour.g), encode(colour.b), (colour.a * 255.0).round() as u8]
}

fn differs(rust: [u8; 4], css: [u8; 4]) -> bool {
	rust.iter().zip(css).any(|(r, c)| (i16::from(*r) - i16::from(c)).abs() > TOLERANCE)
}

fn colour_tokens(declared: &Declarations) -> Vec<(String, Rgba)> {
	declared
		.iter()
		.filter(|(name, _)| !name.starts_with("--hue-"))
		.filter_map(|(name, value)| {
			css::colour(declared, value).map(|colour| (name.clone(), colour))
		})
		.collect()
}

fn mismatches(tokens: &Tokens, declared: &Declarations) -> Vec<String> {
	let rust: Vec<(String, Color)> =
		tokens.colours().into_iter().map(|(token, colour)| (css_name(token), colour)).collect();
	let mut found = Vec::new();
	for (name, css) in colour_tokens(declared) {
		match rust.iter().find(|(rust_name, _)| *rust_name == name) {
			None => found.push(format!("{name} has no Rust token")),
			Some((_, colour)) if differs(bytes_of(*colour), css.bytes()) => {
				found.push(format!("{name}: Rust {:?}, CSS {:?}", bytes_of(*colour), css.bytes()))
			}
			Some(_) => {}
		}
	}
	for (name, _) in &rust {
		if !declared.contains_key(name) {
			found.push(format!("{name} has no CSS source"));
		}
	}
	found
}

fn with_hue(declared: &Declarations, hue: f32) -> Declarations {
	let mut tinted = declared.clone();
	for (theme, dark) in [("light", false), ("dark", true)] {
		for role in Role::ALL {
			let [r, g, b] = hues::tone(hue, dark, role);
			tinted.insert(
				format!("--hue-{theme}-{}", role.css_name()),
				format!("#{r:02x}{g:02x}{b:02x}"),
			);
		}
		let [r, g, b] = hues::bubble_foreground(dark);
		tinted
			.insert(format!("--hue-{theme}-bubble-foreground"), format!("#{r:02x}{g:02x}{b:02x}"));
	}
	tinted
}

#[test]
fn every_css_colour_token_has_a_rust_token_of_the_same_value_in_both_themes() {
	let sheet = Sheet::read();
	for dark in [false, true] {
		let found = mismatches(&Tokens::new(dark), sheet.theme(dark));
		assert!(found.is_empty(), "dark: {dark}\n{}", found.join("\n"));
	}
}

#[test]
fn a_space_hue_tints_every_token_as_the_css_does_in_both_themes() {
	let sheet = Sheet::read();
	for hue in [BLUE, Preset::Green.hue(), 210.0] {
		for dark in [false, true] {
			let declared = with_hue(sheet.theme(dark), hue);
			let found = mismatches(&Tokens::new(dark).in_space(Some(hue)), &declared);
			assert!(found.is_empty(), "hue {hue}, dark: {dark}\n{}", found.join("\n"));
		}
	}
}

#[test]
fn a_space_hue_paints_primary_user_bubble_and_selection_in_its_tone() {
	let hue = 210.0;
	for dark in [false, true] {
		let tinted = Tokens::new(dark).in_space(Some(hue));
		let accent = tone(hue, dark, Role::Accent);
		assert_eq!(tinted.primary, accent);
		assert_eq!(tinted.selection, accent.alpha(SELECTION_SHARE));
		let bubble = if dark { accent } else { tone(hue, dark, Role::Bubble) };
		assert_eq!(tinted.user_bubble, bubble);
		assert_ne!(tinted.primary, Tokens::new(dark).primary);
	}
}

#[test]
fn every_theme_colour_aliases_a_rust_token() {
	let sheet = Sheet::read();
	let rust: BTreeSet<String> =
		Tokens::new(false).colours().into_iter().map(|(token, _)| css_name(token)).collect();
	let aliased: Vec<String> = sheet
		.theme_inline
		.iter()
		.filter(|(name, _)| name.starts_with("--color-"))
		.filter_map(|(name, value)| {
			let source = value.strip_prefix("var(")?.strip_suffix(')')?.trim().to_string();
			(!rust.contains(&source)).then(|| format!("{name} reads {source}"))
		})
		.collect();
	assert!(aliased.is_empty(), "{}", aliased.join("\n"));
}

fn rem(value: &str) -> f32 {
	let Some(rems) = value.strip_suffix("rem") else { panic!("{value} is not in rem") };
	rems.parse::<f32>().unwrap_or_else(|_| panic!("{value}")) * 16.0
}

fn root_share(value: &str) -> f32 {
	if value == "var(--radius-root)" {
		return 1.0;
	}
	let Some(share) =
		value.strip_prefix("calc(var(--radius-root) * ").and_then(|v| v.strip_suffix(')'))
	else {
		panic!("{value} is not a share of the root radius")
	};
	share.parse().unwrap_or_else(|_| panic!("{value}"))
}

#[test]
fn radius_spacing_type_and_stroke_tokens_are_the_css_values() {
	let sheet = Sheet::read();
	let root = sheet.theme(false);
	let theme = &sheet.theme_inline;
	let value = |declared: &Declarations, name: &str| -> String {
		declared.get(name).cloned().unwrap_or_else(|| panic!("{name} is missing"))
	};
	assert_eq!(rem(&value(root, "--radius")), RADIUS);
	assert_eq!(value(root, "--radius-root"), "var(--radius)");
	let radii = [
		("--radius-xs", RADIUS_XS),
		("--radius-sm", RADIUS_SM),
		("--radius-md", RADIUS_MD),
		("--radius-lg", RADIUS_LG),
		("--radius-xl", RADIUS_XL),
		("--radius-2xl", RADIUS_2XL),
		("--radius-3xl", RADIUS_3XL),
		("--radius-4xl", RADIUS_4XL),
		("--radius-bubble", RADIUS_BUBBLE),
		("--radius-control", RADIUS_CONTROL),
	];
	for (name, rust) in radii {
		assert!((RADIUS_ROOT * root_share(&value(theme, name)) - rust).abs() < 1e-4, "{name}");
	}
	let declared_radii = theme.keys().filter(|name| name.starts_with("--radius-")).count();
	assert_eq!(declared_radii, radii.len(), "a radius token of globals.css has no Rust token");
	assert_eq!(rem(&value(root, "--sidebar-rail")), SIDEBAR_RAIL);
	assert_eq!(value(root, "--shell-inset"), "calc(var(--spacing) * 2)");
	assert_eq!(SHELL_INSET, SPACING * 2.0);
	assert_eq!(rem(&value(theme, "--text-compact")), TEXT_COMPACT.size);
	assert_eq!(rem(&value(theme, "--text-reading")), TEXT_READING.size);
	assert_eq!(rem(&value(theme, "--text-reading--line-height")), TEXT_READING.line_height);
	assert_eq!(value(theme, "--font-sans"), format!("\"{} Variable\", sans-serif", FAMILIES.0));
	assert_eq!(value(theme, "--font-heading"), format!("\"{} Variable\", sans-serif", FAMILIES.0));
	assert_eq!(value(theme, "--font-mono"), format!("\"{} Variable\", monospace", FAMILIES.1));
	assert_eq!(value(root, "--icon-stroke"), format!("{ICON_STROKE_EM}em"));
	let story_font_size = 16.0;
	let story_glyph_size = 16.0;
	let stroke = ICON_STROKE_EM * story_font_size * 24.0 / story_glyph_size;
	assert!((ICON_STROKE - stroke).abs() < 1e-4);
}

fn declared_in(block: &str, name: &str) -> String {
	let Some(start) = block.find(&format!("{name}:")) else { panic!("{name} is missing") };
	let value = &block[start + name.len() + 1..];
	value[..value.find(';').unwrap_or(value.len())].trim().to_string()
}

fn quotient(value: &str) -> f32 {
	let Some(inner) = value.strip_prefix("calc(").and_then(|v| v.strip_suffix(')')) else {
		panic!("{value} is not a calc()")
	};
	let Some((dividend, divisor)) = inner.split_once(" / ") else {
		panic!("{value} divides nothing")
	};
	let number = |text: &str| text.trim().parse::<f32>().unwrap_or_else(|_| panic!("{value}"));
	number(dividend) / number(divisor)
}

#[test]
fn the_bubble_text_is_the_chat_typeset_at_48rem_and_up() {
	let globals = generated::read(&format!("{PACKAGES_UI}/src/styles/globals.css"));
	let Some(start) = globals.find(".typeset-chat {") else {
		panic!("globals.css has no .typeset-chat")
	};
	let chat = &globals[start..];
	let Some(wide) = chat.find("@media (min-width: 48rem)") else {
		panic!(".typeset-chat has no 48rem query")
	};
	let size = rem(&declared_in(&chat[wide..], "--typeset-size"));
	let leading = quotient(&declared_in(chat, "--typeset-leading"));
	assert_eq!(TEXT_BUBBLE.size, size);
	assert!((TEXT_BUBBLE.line_height - size * leading).abs() < 1e-4);
}
