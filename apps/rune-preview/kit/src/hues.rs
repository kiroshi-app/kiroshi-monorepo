use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
	Bubble,
	Accent,
	NewLine,
	AvatarInk,
	AvatarGround,
	ConversationIcon,
	ConversationIconForeground,
}

impl Role {
	pub const ALL: [Role; 7] = [
		Role::Bubble,
		Role::Accent,
		Role::NewLine,
		Role::AvatarInk,
		Role::AvatarGround,
		Role::ConversationIcon,
		Role::ConversationIconForeground,
	];

	pub fn css_name(self) -> &'static str {
		match self {
			Role::Bubble => "bubble",
			Role::Accent => "accent",
			Role::NewLine => "new-line",
			Role::AvatarInk => "avatar-ink",
			Role::AvatarGround => "avatar-ground",
			Role::ConversationIcon => "conversation-icon",
			Role::ConversationIconForeground => "conversation-icon-foreground",
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Preset {
	Red,
	Orange,
	Yellow,
	Green,
	Cyan,
	Blue,
	Purple,
	Pink,
}

impl Preset {
	pub const ALL: [Preset; 8] = [
		Preset::Red,
		Preset::Orange,
		Preset::Yellow,
		Preset::Green,
		Preset::Cyan,
		Preset::Blue,
		Preset::Purple,
		Preset::Pink,
	];

	pub fn hue(self) -> f32 {
		match self {
			Preset::Red => 42.0,
			Preset::Orange => 63.0,
			Preset::Yellow => 82.0,
			Preset::Green => 132.0,
			Preset::Cyan => 186.0,
			Preset::Blue => 257.0,
			Preset::Purple => 296.0,
			Preset::Pink => 358.0,
		}
	}

	pub fn css_name(self) -> &'static str {
		match self {
			Preset::Red => "red",
			Preset::Orange => "orange",
			Preset::Yellow => "yellow",
			Preset::Green => "green",
			Preset::Cyan => "cyan",
			Preset::Blue => "blue",
			Preset::Purple => "purple",
			Preset::Pink => "pink",
		}
	}
}

struct Yellow {
	hue: f64,
	lightness: f64,
	chroma: f64,
}

struct Contrast {
	with: [u8; 3],
	ratio: f64,
}

struct ToneSpec {
	lightness: f64,
	chroma: f64,
	contrast: Option<Contrast>,
	yellow: Option<Yellow>,
}

const YELLOW_CENTRE: f64 = 82.0;
const YELLOW_RADIUS: f64 = 20.0;
const LIGHTNESS_STEP: f64 = 0.0025;
const LIGHTNESS_RESOLUTION: f64 = 1e4;
const CHROMA_SEARCH_STEPS: usize = 24;
const GAMUT_TOLERANCE: f64 = 1e-6;

fn spec(dark: bool, role: Role) -> ToneSpec {
	let plain = |lightness, chroma| ToneSpec { lightness, chroma, contrast: None, yellow: None };
	match (dark, role) {
		(false, Role::Bubble) => ToneSpec {
			contrast: Some(Contrast { with: [0x02, 0x02, 0x02], ratio: 7.0 }),
			..plain(0.87, 0.075)
		},
		(false, Role::Accent) => ToneSpec {
			contrast: Some(Contrast { with: [0xff, 0xff, 0xff], ratio: 4.5 }),
			yellow: Some(Yellow { hue: 75.0, lightness: 0.54, chroma: 0.115 }),
			..plain(0.5, 0.13)
		},
		(false, Role::NewLine) => plain(0.8, 0.06),
		(false, Role::AvatarInk) => plain(0.56, 0.13),
		(false, Role::AvatarGround) => plain(0.93, 0.035),
		(false, Role::ConversationIcon) => plain(0.92, 0.033),
		(false, Role::ConversationIconForeground) => plain(0.45, 0.054),
		(true, Role::Bubble) => ToneSpec {
			contrast: Some(Contrast { with: [0xf5, 0xf5, 0xf5], ratio: 7.2 }),
			..plain(0.45, 0.1)
		},
		(true, Role::Accent) => ToneSpec {
			contrast: Some(Contrast { with: [0x12, 0x12, 0x13], ratio: 4.5 }),
			..plain(0.78, 0.12)
		},
		(true, Role::NewLine) => plain(0.4, 0.06),
		(true, Role::AvatarInk) => plain(0.8, 0.12),
		(true, Role::AvatarGround) => plain(0.3, 0.04),
		(true, Role::ConversationIcon) => plain(0.385, 0.033),
		(true, Role::ConversationIconForeground) => plain(0.8, 0.054),
	}
}

pub fn bubble_foreground(dark: bool) -> [u8; 3] {
	spec(dark, Role::Bubble).contrast.map_or([0, 0, 0], |contrast| contrast.with)
}

pub fn tone(hue: f32, dark: bool, role: Role) -> [u8; 3] {
	let spec = spec(dark, role);
	let (lightness, chroma, hue) = corrected(&spec, normalised(f64::from(hue)));
	let at = |lightness: f64| srgb_bytes(lightness, gamut_chroma(lightness, chroma, hue), hue);
	let mut lightness = rounded(lightness);
	let mut bytes = at(lightness);
	let Some(contrast) = spec.contrast else { return bytes };
	let direction = if luminance(contrast.with) > luminance(bytes) { -1.0 } else { 1.0 };
	while contrast_ratio(bytes, contrast.with) < contrast.ratio
		&& lightness > 0.0
		&& lightness < 1.0
	{
		lightness = rounded(lightness + direction * LIGHTNESS_STEP);
		bytes = at(lightness);
	}
	bytes
}

fn normalised(hue: f64) -> f64 {
	hue.rem_euclid(360.0)
}

fn corrected(spec: &ToneSpec, hue: f64) -> (f64, f64, f64) {
	let Some(yellow) = &spec.yellow else { return (spec.lightness, spec.chroma, hue) };
	let distance = ((hue - YELLOW_CENTRE + 540.0).rem_euclid(360.0) - 180.0).abs();
	let weight = if distance < YELLOW_RADIUS {
		(PI / 2.0 * distance / YELLOW_RADIUS).cos().powi(2)
	} else {
		0.0
	};
	let blend = |from: f64, to: f64| from + (to - from) * weight;
	(
		blend(spec.lightness, yellow.lightness),
		blend(spec.chroma, yellow.chroma),
		normalised(blend(hue, hue + yellow.hue - YELLOW_CENTRE)),
	)
}

fn rounded(lightness: f64) -> f64 {
	(lightness * LIGHTNESS_RESOLUTION).round() / LIGHTNESS_RESOLUTION
}

fn linear_srgb(lightness: f64, chroma: f64, hue: f64) -> [f64; 3] {
	let radians = hue * PI / 180.0;
	let (a, b) = (chroma * radians.cos(), chroma * radians.sin());
	let l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
	let m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
	let s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b).powi(3);
	[
		4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
		-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
		-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
	]
}

fn in_srgb(lightness: f64, chroma: f64, hue: f64) -> bool {
	linear_srgb(lightness, chroma, hue)
		.iter()
		.all(|channel| *channel >= -GAMUT_TOLERANCE && *channel <= 1.0 + GAMUT_TOLERANCE)
}

fn gamut_chroma(lightness: f64, chroma: f64, hue: f64) -> f64 {
	if in_srgb(lightness, chroma, hue) {
		return chroma;
	}
	let (mut inside, mut outside) = (0.0, chroma);
	for _ in 0..CHROMA_SEARCH_STEPS {
		let middle = (inside + outside) / 2.0;
		if in_srgb(lightness, middle, hue) {
			inside = middle;
		} else {
			outside = middle;
		}
	}
	inside
}

fn srgb_bytes(lightness: f64, chroma: f64, hue: f64) -> [u8; 3] {
	linear_srgb(lightness, chroma, hue).map(|linear| {
		let clamped = linear.clamp(0.0, 1.0);
		let encoded = if clamped <= 0.003_130_8 {
			clamped * 12.92
		} else {
			1.055 * clamped.powf(1.0 / 2.4) - 0.055
		};
		(encoded * 255.0).round() as u8
	})
}

fn luminance(bytes: [u8; 3]) -> f64 {
	let linear = |byte: u8| {
		let encoded = f64::from(byte) / 255.0;
		if encoded <= 0.040_45 { encoded / 12.92 } else { ((encoded + 0.055) / 1.055).powf(2.4) }
	};
	0.2126 * linear(bytes[0]) + 0.7152 * linear(bytes[1]) + 0.0722 * linear(bytes[2])
}

fn contrast_ratio(first: [u8; 3], second: [u8; 3]) -> f64 {
	let (a, b) = (luminance(first), luminance(second));
	(a.max(b) + 0.05) / (a.min(b) + 0.05)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::css;

	fn hex(bytes: [u8; 3]) -> String {
		format!("#{:02x}{:02x}{:02x}", bytes[0], bytes[1], bytes[2])
	}

	#[test]
	fn every_preset_tone_is_its_data_hue_value_in_both_themes() {
		let sheet = css::Sheet::read();
		for dark in [false, true] {
			let declared = sheet.theme(dark);
			for preset in Preset::ALL {
				for role in Role::ALL {
					let name = format!("--hue-{}-{}", preset.css_name(), role.css_name());
					let Some(value) = declared.get(&name) else {
						panic!("{name} is missing from tokens.css");
					};
					assert_eq!(&hex(tone(preset.hue(), dark, role)), value, "{name}, dark: {dark}");
				}
			}
		}
	}

	#[test]
	fn arbitrary_hues_follow_the_typescript_recipe() {
		let from_hue_style: [(f32, bool, [&str; 7]); 6] = [
			(
				15.0,
				false,
				["#ffc2c5", "#9f3e4b", "#e2afb1", "#b3505b", "#ffdfe0", "#fadcdd", "#70494c"],
			),
			(
				15.0,
				true,
				["#833b43", "#fa969f", "#643a3d", "#ff9ea6", "#402527", "#543d3e", "#deb0b3"],
			),
			(
				210.0,
				false,
				["#99e2f0", "#00707e", "#90c9d3", "#008394", "#ceeff5", "#ccebf1", "#2d5e66"],
			),
			(
				210.0,
				true,
				["#005a66", "#3ecce2", "#16505a", "#47d2e8", "#113339", "#2e494d", "#95c8d1"],
			),
			(
				320.0,
				false,
				["#ebc5f3", "#834791", "#cfb2d6", "#9558a3", "#f3e1f7", "#efdef3", "#634c68"],
			),
			(
				320.0,
				true,
				["#6d4177", "#d99ee7", "#563d5c", "#e0a4ee", "#37273a", "#4c3e4f", "#ceb3d4"],
			),
		];
		for (hue, dark, expected) in from_hue_style {
			for (role, value) in Role::ALL.into_iter().zip(expected) {
				assert_eq!(hex(tone(hue, dark, role)), value, "hue {hue}, {role:?}, dark: {dark}");
			}
		}
	}

	#[test]
	fn the_bubble_foreground_is_the_contrast_reference_of_the_bubble() {
		assert_eq!(bubble_foreground(false), [0x02, 0x02, 0x02]);
		assert_eq!(bubble_foreground(true), [0xf5, 0xf5, 0xf5]);
	}
}
