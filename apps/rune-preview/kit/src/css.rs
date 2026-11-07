use std::collections::BTreeMap;
use std::f64::consts::PI;

use crate::generated::{self, PACKAGES_UI};

const LIGHT_BLOCKS: [(&str, &str); 2] =
	[("tokens.css", ":root,\n[data-hue] {"), ("globals.css", "\n:root {")];
const DARK_BLOCKS: [(&str, &str); 2] =
	[("tokens.css", ".dark,\n.dark [data-hue] {"), ("globals.css", "\n.dark {")];
const THEME_BLOCK: (&str, &str) = ("globals.css", "@theme inline {");

pub type Declarations = BTreeMap<String, String>;

pub struct Sheet {
	light: Declarations,
	dark: Declarations,
	pub theme_inline: Declarations,
}

impl Sheet {
	pub fn read() -> Sheet {
		let light = declarations(&LIGHT_BLOCKS);
		let mut dark = light.clone();
		dark.extend(declarations(&DARK_BLOCKS));
		Sheet { light, dark, theme_inline: declarations(&[THEME_BLOCK]) }
	}

	pub fn theme(&self, dark: bool) -> &Declarations {
		if dark { &self.dark } else { &self.light }
	}
}

fn declarations(blocks: &[(&str, &str)]) -> Declarations {
	let mut found = Declarations::new();
	for (file, selector) in blocks {
		let source = generated::read(&format!("{PACKAGES_UI}/src/styles/{file}"));
		let Some(start) = source.find(selector) else { panic!("{file} has no `{selector}` block") };
		let body = &source[start + selector.len()..];
		let body = &body[..closing_brace(body)];
		for declaration in body.split(';') {
			let Some((name, value)) = declaration.split_once(':') else { continue };
			let name = name.trim();
			if name.starts_with("--") {
				found.insert(
					name.to_string(),
					value.split_whitespace().collect::<Vec<_>>().join(" "),
				);
			}
		}
	}
	found
}

fn closing_brace(body: &str) -> usize {
	let mut depth = 1;
	for (at, character) in body.char_indices() {
		match character {
			'{' => depth += 1,
			'}' => {
				depth -= 1;
				if depth == 0 {
					return at;
				}
			}
			_ => {}
		}
	}
	body.len()
}

#[derive(Clone, Copy, Debug)]
pub struct Rgba {
	pub linear: [f64; 3],
	pub alpha: f64,
}

impl Rgba {
	pub fn bytes(self) -> [u8; 4] {
		let encode = |linear: f64| {
			let clamped = linear.clamp(0.0, 1.0);
			let encoded = if clamped <= 0.003_130_8 {
				clamped * 12.92
			} else {
				1.055 * clamped.powf(1.0 / 2.4) - 0.055
			};
			(encoded * 255.0).round() as u8
		};
		let [r, g, b] = self.linear.map(encode);
		[r, g, b, (self.alpha.clamp(0.0, 1.0) * 255.0).round() as u8]
	}

	fn oklab(self) -> [f64; 3] {
		let [r, g, b] = self.linear;
		let l = (0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b).cbrt();
		let m = (0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b).cbrt();
		let s = (0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b).cbrt();
		[
			0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
			1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
			0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
		]
	}

	fn of_oklab([lightness, a, b]: [f64; 3], alpha: f64) -> Rgba {
		let l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
		let m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
		let s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b).powi(3);
		Rgba {
			linear: [
				4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
				-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
				-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
			],
			alpha,
		}
	}

	fn of_oklch(lightness: f64, chroma: f64, hue: f64, alpha: f64) -> Rgba {
		let radians = hue * PI / 180.0;
		Rgba::of_oklab([lightness, chroma * radians.cos(), chroma * radians.sin()], alpha)
	}
}

pub fn colour(declared: &Declarations, value: &str) -> Option<Rgba> {
	let value = value.trim();
	let starts_as_a_length = value.starts_with(|c: char| c.is_ascii_digit() || c == '.');
	if starts_as_a_length
		|| ["calc(", "drop-shadow(", "light", "dark"].iter().any(|p| value.starts_with(p))
	{
		return None;
	}
	if let Some(hex) = value.strip_prefix('#') {
		return Some(of_hex(hex));
	}
	if value == "transparent" {
		return Some(Rgba { linear: [0.0; 3], alpha: 0.0 });
	}
	let (function, arguments) = call(value);
	match function {
		"var" => {
			let (name, fallback) = match split_top_level(arguments, ',').as_slice() {
				[name] => (name.trim(), None),
				[name, fallback] => (name.trim(), Some(fallback.trim())),
				_ => panic!("unreadable {value}"),
			};
			match declared.get(name) {
				Some(found) => colour(declared, found),
				None => colour(declared, fallback.unwrap_or_else(|| panic!("{name} is undefined"))),
			}
		}
		"oklch" if arguments.starts_with("from ") => {
			Some(relative_oklch(declared, &arguments[5..]))
		}
		"oklch" => {
			let (channels, alpha) = channels_and_alpha(arguments);
			Some(Rgba::of_oklch(channels[0], channels[1], channels[2], alpha))
		}
		"rgb" => {
			let (channels, alpha) = channels_and_alpha(arguments);
			let decode = |byte: f64| {
				let encoded = byte / 255.0;
				if encoded <= 0.040_45 {
					encoded / 12.92
				} else {
					((encoded + 0.055) / 1.055).powf(2.4)
				}
			};
			Some(Rgba { linear: [channels[0], channels[1], channels[2]].map(decode), alpha })
		}
		"color-mix" => Some(mix_in_oklab(declared, arguments)),
		_ => panic!("unknown colour syntax: {value}"),
	}
}

fn of_hex(hex: &str) -> Rgba {
	let byte =
		|at: usize| u8::from_str_radix(&hex[at..at + 2], 16).unwrap_or_else(|_| panic!("#{hex}"));
	let alpha = if hex.len() == 8 { f64::from(byte(6)) / 255.0 } else { 1.0 };
	let decode = |byte: u8| {
		let encoded = f64::from(byte) / 255.0;
		if encoded <= 0.040_45 { encoded / 12.92 } else { ((encoded + 0.055) / 1.055).powf(2.4) }
	};
	Rgba { linear: [byte(0), byte(2), byte(4)].map(decode), alpha }
}

fn call(value: &str) -> (&str, &str) {
	let Some(open) = value.find('(') else { panic!("unknown colour syntax: {value}") };
	let Some(arguments) = value[open + 1..].strip_suffix(')') else { panic!("unbalanced {value}") };
	(&value[..open], arguments.trim())
}

fn split_top_level(text: &str, separator: char) -> Vec<&str> {
	let (mut parts, mut depth, mut start) = (Vec::new(), 0, 0);
	for (at, character) in text.char_indices() {
		match character {
			'(' => depth += 1,
			')' => depth -= 1,
			c if c == separator && depth == 0 => {
				parts.push(&text[start..at]);
				start = at + c.len_utf8();
			}
			_ => {}
		}
	}
	parts.push(&text[start..]);
	parts.into_iter().map(str::trim).filter(|part| !part.is_empty()).collect()
}

fn number(text: &str) -> f64 {
	match text.strip_suffix('%') {
		Some(percent) => percent.parse::<f64>().unwrap_or_else(|_| panic!("{text}")) / 100.0,
		None => text.parse().unwrap_or_else(|_| panic!("{text}")),
	}
}

fn channels_and_alpha(arguments: &str) -> ([f64; 3], f64) {
	let (channels, alpha) = match arguments.split_once('/') {
		Some((channels, alpha)) => (channels, number(alpha.trim())),
		None => (arguments, 1.0),
	};
	let channels: Vec<f64> = channels.split_whitespace().map(number).collect();
	([channels[0], channels[1], channels[2]], alpha)
}

fn relative_oklch(declared: &Declarations, arguments: &str) -> Rgba {
	let parts = split_top_level(arguments, ' ');
	let [source, lightness, chroma, hue] = parts.as_slice() else {
		panic!("oklch(from {arguments})")
	};
	let Some(source) = colour(declared, source) else { panic!("{source} is no colour") };
	let [l, a, b] = source.oklab();
	let channel = |expression: &str, name: &str, value: f64| {
		if expression == name {
			return value;
		}
		let (_, inner) = call(expression);
		match split_top_level(inner, ' ').as_slice() {
			[left, "+", right] if *left == name => value + number(right),
			[left, "-", right] if *left == name => value - number(right),
			_ => panic!("unreadable channel {expression}"),
		}
	};
	let (c, h) = (a.hypot(b), b.atan2(a).to_degrees());
	Rgba::of_oklch(
		channel(lightness, "l", l),
		channel(chroma, "c", c),
		channel(hue, "h", h),
		source.alpha,
	)
}

fn mix_in_oklab(declared: &Declarations, arguments: &str) -> Rgba {
	let parts = split_top_level(arguments, ',');
	let [space, first, second] = parts.as_slice() else { panic!("color-mix({arguments})") };
	assert_eq!(*space, "in oklab", "only oklab mixes are read");
	let weighed = |part: &str| -> (Rgba, Option<f64>) {
		let pieces = split_top_level(part, ' ');
		let share = pieces.get(1).map(|share| number(share));
		let Some(colour) = colour(declared, pieces[0]) else { panic!("{part} is no colour") };
		(colour, share)
	};
	let ((first, first_share), (second, second_share)) = (weighed(first), weighed(second));
	let first_share = first_share.unwrap_or_else(|| 1.0 - second_share.unwrap_or(0.5));
	let second_share = 1.0 - first_share;
	let alpha = first.alpha * first_share + second.alpha * second_share;
	if alpha == 0.0 {
		return Rgba { linear: [0.0; 3], alpha };
	}
	let (lab_first, lab_second) = (first.oklab(), second.oklab());
	let mixed = [0, 1, 2].map(|at| {
		(lab_first[at] * first.alpha * first_share + lab_second[at] * second.alpha * second_share)
			/ alpha
	});
	Rgba::of_oklab(mixed, alpha)
}
