use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::f64::consts::{PI, TAU};

use rune::color::srgb_encode;
use rune::text::icon_coverage;
use rune::{Color, El, Icon, Pixels, TextStyle, el, row, text};

use crate::avatar::companion_seed;
use crate::tokens::{Tokens, srgb};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SpaceAvatarSize {
	Px12,
	Px14,
	Px26,
	Px36,
	Px48,
	Px64,
}

impl SpaceAvatarSize {
	pub const ALL: [SpaceAvatarSize; 6] = [
		SpaceAvatarSize::Px12,
		SpaceAvatarSize::Px14,
		SpaceAvatarSize::Px26,
		SpaceAvatarSize::Px36,
		SpaceAvatarSize::Px48,
		SpaceAvatarSize::Px64,
	];

	pub fn side(self) -> f32 {
		match self {
			SpaceAvatarSize::Px12 => 12.0,
			SpaceAvatarSize::Px14 => 14.0,
			SpaceAvatarSize::Px26 => 26.0,
			SpaceAvatarSize::Px36 => 36.0,
			SpaceAvatarSize::Px48 => 48.0,
			SpaceAvatarSize::Px64 => 64.0,
		}
	}

	fn is_compact(self) -> bool {
		self.side() < COMPACT_BELOW
	}

	fn drawn(self) -> Drawn {
		match self {
			SpaceAvatarSize::Px12 | SpaceAvatarSize::Px14 => Drawn::Px14,
			SpaceAvatarSize::Px26 | SpaceAvatarSize::Px36 => Drawn::Px26,
			SpaceAvatarSize::Px48 | SpaceAvatarSize::Px64 => Drawn::Px48,
		}
	}

	fn state_metrics(self) -> StateMetrics {
		let (gap, width, invitation_stroke, line_stroke) = match self {
			SpaceAvatarSize::Px12 | SpaceAvatarSize::Px14 => (1.0, 1.5, 1.5, 1.0),
			SpaceAvatarSize::Px26 => (1.5, 2.0, 1.5, 1.0),
			SpaceAvatarSize::Px36 => (1.5, 2.0, 2.0, 1.125),
			SpaceAvatarSize::Px48 => (2.0, 2.5, 2.0, 1.5),
			SpaceAvatarSize::Px64 => (2.0, 3.0, 2.5, 2.0),
		};
		StateMetrics { attention_gap: gap, attention_width: width, invitation_stroke, line_stroke }
	}

	fn marks(self) -> Marks {
		let drawn = self.drawn();
		let scaled = |value: f64| round3(value * f64::from(self.side()) / drawn.side());
		let glyph = |(scale, stroke): (f64, f64)| Glyph { scale: scaled(scale), stroke };
		let marks = drawn.marks();
		Marks {
			initial_size: scaled(marks.initial_size),
			initial_weight: marks.initial_weight,
			badge_diameter: scaled(marks.badge_diameter),
			badge_cut_out: scaled(marks.badge_cut_out),
			laptop: glyph(marks.laptop),
			cross: marks.cross.map(glyph),
			hatch_spacing: scaled(marks.hatch_spacing),
			hatch_stroke: scaled(marks.hatch_stroke),
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum SpaceAvatarState {
	#[default]
	Local,
	Shared,
	Online,
	Connecting,
	Offline,
	Invitation,
	Joining,
}

impl SpaceAvatarState {
	pub fn of_host(host: Option<super::SpaceHost>) -> SpaceAvatarState {
		match host {
			None => SpaceAvatarState::Local,
			Some(super::SpaceHost::Shared) => SpaceAvatarState::Shared,
			Some(super::SpaceHost::Up) => SpaceAvatarState::Online,
			Some(super::SpaceHost::Connecting) => SpaceAvatarState::Connecting,
			Some(super::SpaceHost::Down) => SpaceAvatarState::Offline,
		}
	}

	fn is_filled(self) -> bool {
		matches!(
			self,
			SpaceAvatarState::Local
				| SpaceAvatarState::Shared
				| SpaceAvatarState::Online
				| SpaceAvatarState::Offline
		)
	}

	fn has_dot(self) -> bool {
		matches!(self, SpaceAvatarState::Shared | SpaceAvatarState::Online)
	}

	fn has_badge(self) -> bool {
		matches!(self, SpaceAvatarState::Local | SpaceAvatarState::Offline) || self.has_dot()
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpaceAvatar<'a> {
	pub space_id: &'a str,
	pub name: &'a str,
	pub colour: Option<f32>,
	pub size: SpaceAvatarSize,
	pub state: SpaceAvatarState,
	pub has_attention: bool,
}

impl SpaceAvatar<'_> {
	pub fn draw(&self, t: &Tokens) -> El {
		let side = self.size.side();
		let layers = self.layers(t);
		let framed = |pixels: &Pixels| {
			el().absolute(-OVERFLOW, -OVERFLOW)
				.size(side + 2.0 * OVERFLOW, side + 2.0 * OVERFLOW)
				.pixels(pixels)
		};
		let mut avatar = el().size(side, side).a11y_hidden().child(framed(&layers.base));
		if let Some(initial) = self.initial() {
			avatar = avatar.child(self.initial_view(t, initial));
		}
		if let Some(badges) = &layers.badges {
			avatar = avatar.child(framed(badges));
		}
		avatar
	}

	fn initial(&self) -> Option<String> {
		let first = self.name.trim().chars().next()?;
		self.state.is_filled().then(|| first.to_uppercase().collect())
	}

	fn initial_view(&self, t: &Tokens, initial: String) -> El {
		let marks = self.size.marks();
		let size = marks.initial_size as f32;
		let style = TextStyle {
			line_height: size,
			tracking: INITIAL_TRACKING * size,
			..TextStyle::new(size, marks.initial_weight)
		};
		let ink = ink_of(t.dark, self.shown_colour());
		row()
			.absolute(0.0, 0.0)
			.size(self.size.side(), self.size.side())
			.center()
			.child(text(initial).font(style).color(ink))
	}

	fn shown_colour(&self) -> Option<f32> {
		if self.state == SpaceAvatarState::Offline { None } else { self.colour }
	}

	fn layers(&self, t: &Tokens) -> Layers {
		let key = LayerKey {
			seed: self.space_id.to_owned(),
			colour: self.shown_colour().map(f32::to_bits),
			size: self.size,
			state: self.state,
			has_attention: self.has_attention,
			dark: t.dark,
			warning: bits_of(t.warning),
			online: bits_of(t.presence_online),
		};
		LAYERS.with(|cache| {
			let mut cache = cache.borrow_mut();
			if let Some(layers) = cache.get(&key) {
				return layers.clone();
			}
			if cache.len() >= LAYER_CAP {
				cache.clear();
			}
			let layers = Recipe::new(self, t).layers();
			cache.insert(key, layers.clone());
			layers
		})
	}
}

const LAYER_CAP: usize = 256;

thread_local! {
	static LAYERS: RefCell<HashMap<LayerKey, Layers>> = RefCell::new(HashMap::new());
	static BODIES: RefCell<HashSet<&'static str>> = RefCell::new(HashSet::new());
}

fn interned(body: String) -> &'static str {
	BODIES.with(|bodies| {
		let mut bodies = bodies.borrow_mut();
		if let Some(&held) = bodies.get(body.as_str()) {
			return held;
		}
		let leaked: &'static str = Box::leak(body.into_boxed_str());
		bodies.insert(leaked);
		leaked
	})
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct LayerKey {
	seed: String,
	colour: Option<u32>,
	size: SpaceAvatarSize,
	state: SpaceAvatarState,
	has_attention: bool,
	dark: bool,
	warning: [u32; 4],
	online: [u32; 4],
}

#[derive(Clone)]
struct Layers {
	base: Pixels,
	badges: Option<Pixels>,
}

const COMPACT_BELOW: f32 = 20.0;
const OVERFLOW: f32 = 6.0;
const RASTER_SCALE: f32 = 2.0;
const INITIAL_TRACKING: f32 = -0.02;
const SUPERELLIPSE_EXPONENT: f64 = 4.6;
const OUTLINE_POINTS: usize = 96;
const ANCHOR_OUTSET: f64 = 0.02;
const ANCHORS: [[f64; 2]; 4] = [
	[-ANCHOR_OUTSET, -ANCHOR_OUTSET],
	[1.0 + ANCHOR_OUTSET, -ANCHOR_OUTSET],
	[1.0 + ANCHOR_OUTSET, 1.0 + ANCHOR_OUTSET],
	[-ANCHOR_OUTSET, 1.0 + ANCHOR_OUTSET],
];
const ARC_RANGES: [[f64; 2]; 3] = [[0.36, 0.42], [0.64, 0.76], [0.92, 1.08]];
const COMPACT_RADII: [f64; 2] = [0.44, 0.8];
const CHROMA_STEP: f64 = 0.002;
const GAMUT_TOLERANCE: f64 = 1e-6;
const LIGHT_FULL: [[f64; 2]; 4] = [[0.93, 0.035], [0.85, 0.06], [0.76, 0.09], [0.66, 0.11]];
const LIGHT_COMPACT: [[f64; 2]; 3] = [[0.91, 0.045], [0.72, 0.11], [0.5, 0.13]];
const DARK_FULL: [[f64; 2]; 4] = [[0.36, 0.04], [0.46, 0.06], [0.57, 0.08], [0.68, 0.1]];
const DARK_COMPACT: [[f64; 2]; 3] = [[0.38, 0.05], [0.56, 0.09], [0.78, 0.1]];
const LIGHT_INK: [f64; 2] = [0.36, 0.09];
const DARK_INK: [f64; 2] = [0.96, 0.03];
const ARC_OPACITY: f32 = 0.45;
const LOCAL_BADGE_FILL: u32 = 0x737373;
const LIGHT_OFFLINE_BADGE_FILL: u32 = 0xdc2626;
const DARK_OFFLINE_BADGE_FILL: u32 = 0xef4444;
const HATCH_OPACITY: f32 = 0.2;
const LIGHT_OFFLINE_OPACITY: f32 = 0.8;
const LIGHT_GLAZE_EDGE: f32 = 0.08;
const DARK_GLAZE_EDGE: f32 = 0.1;
const LIGHT_COMPACT_EDGE: f32 = 0.1;
const DARK_COMPACT_EDGE: f32 = 0.12;
const LIGHT_LIP_OPACITY: f32 = 0.55;
const DARK_LIP_OPACITY: f32 = 0.22;
const GLAZE_EDGE_SHARE: f64 = 0.025;
const COMPACT_EDGE_SHARE: f64 = 0.05;
const SHEEN_TOP: f32 = 0.3;
const SHEEN_TURN: f64 = 0.55;
const SHEEN_FOOT: f32 = 0.08;
const HIGHLIGHT_CENTRE: [f64; 2] = [0.3, 0.18];
const HIGHLIGHT_RADIUS: f64 = 0.6;
const HIGHLIGHT_OPACITY: f32 = 0.25;
const GLYPH_GRID: f64 = 24.0;
const LAPTOP_GLYPH: &str = "M4 16V6C4 4.8954 4.8954 4 6 4H18C19.1046 4 20 4.8954 20 6V16M2.5 16H21.5C21.7761 16 22 16.2239 22 16.5V18C22 19.1046 21.1046 20 20 20H4C2.8954 20 2 19.1046 2 18V16.5C2 16.2239 2.2239 16 2.5 16Z";
const CROSS_GLYPH: &str = "M7.5 7.5L16.5 16.5M16.5 7.5L7.5 16.5";
const DOT_CENTRE_INSET: f64 = 0.36;
const DASH_SHARE: f64 = 0.55;
const DASH_PERIOD_PER_STROKE: f64 = 3.2;
const MIN_DASHES: f64 = 8.0;

#[derive(Clone, Copy)]
enum Drawn {
	Px14,
	Px26,
	Px48,
}

struct DrawnMarks {
	initial_size: f64,
	initial_weight: f32,
	badge_diameter: f64,
	badge_cut_out: f64,
	laptop: (f64, f64),
	cross: Option<(f64, f64)>,
	hatch_spacing: f64,
	hatch_stroke: f64,
}

impl Drawn {
	fn side(self) -> f64 {
		match self {
			Drawn::Px14 => 14.0,
			Drawn::Px26 => 26.0,
			Drawn::Px48 => 48.0,
		}
	}

	fn marks(self) -> DrawnMarks {
		match self {
			Drawn::Px14 => DrawnMarks {
				initial_size: 10.0,
				initial_weight: 700.0,
				badge_diameter: 8.0,
				badge_cut_out: 1.5,
				laptop: (0.258, 3.677),
				cross: None,
				hatch_spacing: 3.0,
				hatch_stroke: 0.8,
			},
			Drawn::Px26 => DrawnMarks {
				initial_size: 13.0,
				initial_weight: 600.0,
				badge_diameter: 12.0,
				badge_cut_out: 2.0,
				laptop: (0.35, 3.143),
				cross: Some((0.34, 3.2)),
				hatch_spacing: 4.0,
				hatch_stroke: 1.0,
			},
			Drawn::Px48 => DrawnMarks {
				initial_size: 24.0,
				initial_weight: 600.0,
				badge_diameter: 18.0,
				badge_cut_out: 2.5,
				laptop: (0.51, 2.941),
				cross: Some((0.51, 3.2)),
				hatch_spacing: 6.0,
				hatch_stroke: 1.5,
			},
		}
	}
}

struct StateMetrics {
	attention_gap: f64,
	attention_width: f64,
	invitation_stroke: f64,
	line_stroke: f64,
}

#[derive(Clone, Copy)]
struct Glyph {
	scale: f64,
	stroke: f64,
}

struct Marks {
	initial_size: f64,
	initial_weight: f32,
	badge_diameter: f64,
	badge_cut_out: f64,
	laptop: Glyph,
	cross: Option<Glyph>,
	hatch_spacing: f64,
	hatch_stroke: f64,
}

fn bits_of(colour: Color) -> [u32; 4] {
	[colour.r, colour.g, colour.b, colour.a].map(f32::to_bits)
}

fn encoded(colour: Color) -> [f32; 4] {
	[srgb_encode(colour.r), srgb_encode(colour.g), srgb_encode(colour.b), colour.a]
}

fn round3(value: f64) -> f64 {
	(value * 1000.0).round() / 1000.0
}

fn linear_srgb_of(lightness: f64, chroma: f64, hue: f64) -> [f64; 3] {
	let a = chroma * hue.cos();
	let b = chroma * hue.sin();
	let l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
	let m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
	let s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b).powi(3);
	[
		4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
		-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
		-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
	]
}

fn is_in_srgb(channels: [f64; 3]) -> bool {
	channels.iter().all(|channel| (-GAMUT_TOLERANCE..=1.0 + GAMUT_TOLERANCE).contains(channel))
}

fn colour_of_linear(channels: [f64; 3]) -> Color {
	let [r, g, b] = channels.map(|linear| {
		let clamped = linear.clamp(0.0, 1.0);
		let gamma = if clamped <= 0.003_130_8 {
			clamped * 12.92
		} else {
			1.055 * clamped.powf(1.0 / 2.4) - 0.055
		};
		(gamma * 255.0).round() as u32
	});
	srgb((r << 16) | (g << 8) | b)
}

fn tone(lightness_chroma: [f64; 2], colour: Option<f32>) -> Color {
	let [lightness, chroma] = lightness_chroma;
	let Some(hue) = colour.map(|degrees| f64::from(degrees) * PI / 180.0) else {
		return colour_of_linear(linear_srgb_of(lightness, 0.0, 0.0));
	};
	let mut fitted = chroma;
	while fitted > 0.0 && !is_in_srgb(linear_srgb_of(lightness, fitted, hue)) {
		fitted = (fitted - CHROMA_STEP).max(0.0);
	}
	colour_of_linear(linear_srgb_of(lightness, fitted, hue))
}

fn ink_of(dark: bool, colour: Option<f32>) -> Color {
	tone(if dark { DARK_INK } else { LIGHT_INK }, colour)
}

fn superellipse(centre: f64, half: f64) -> Vec<[f64; 2]> {
	let power = 2.0 / SUPERELLIPSE_EXPONENT;
	(0..OUTLINE_POINTS)
		.map(|index| {
			let angle = index as f64 / OUTLINE_POINTS as f64 * TAU;
			let (sin, cos) = angle.sin_cos();
			[
				centre + half * cos.signum() * cos.abs().powf(power),
				centre + half * sin.signum() * sin.abs().powf(power),
			]
		})
		.collect()
}

fn segments_of(outline: &[[f64; 2]]) -> Vec<([f64; 2], [f64; 2], f64)> {
	outline
		.iter()
		.zip(outline.iter().cycle().skip(1))
		.map(|(&from, &to)| (from, to, (to[0] - from[0]).hypot(to[1] - from[1])))
		.collect()
}

fn dash_array(outline: &[[f64; 2]], stroke: f64) -> [f64; 2] {
	let perimeter: f64 = segments_of(outline).iter().map(|(_, _, length)| length).sum();
	let count = MIN_DASHES.max((perimeter / (DASH_PERIOD_PER_STROKE * stroke)).round());
	let period = perimeter / count;
	[round3(period * DASH_SHARE), round3(period * (1.0 - DASH_SHARE))]
}

fn dashes(outline: &[[f64; 2]], stroke: f64) -> Vec<Vec<[f64; 2]>> {
	let segments = segments_of(outline);
	let [on, off] = dash_array(outline, stroke);
	let mut runs = Vec::new();
	let mut run: Vec<[f64; 2]> = Vec::new();
	let mut is_on = true;
	let mut left = on;
	for (from, to, length) in segments {
		let mut walked = 0.0;
		if is_on && run.is_empty() {
			run.push(from);
		}
		while length - walked > left {
			walked += left;
			let share = walked / length;
			let at = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
			if is_on {
				run.push(at);
				runs.push(std::mem::take(&mut run));
			} else {
				run.push(at);
			}
			is_on = !is_on;
			left = if is_on { on } else { off };
		}
		left -= length - walked;
		if is_on {
			run.push(to);
		}
	}
	if !run.is_empty() {
		runs.push(run);
	}
	runs
}

fn transformed_glyph(path: &str, origin: f64, scale: f64) -> String {
	let mut out = String::new();
	let mut number = String::new();
	let flush = |number: &mut String, out: &mut String| {
		if let Ok(value) = number.parse::<f64>() {
			if !out.is_empty() && !out.ends_with(char::is_alphabetic) {
				out.push(' ');
			}
			out.push_str(&round3(origin + scale * value).to_string());
		}
		number.clear();
	};
	for character in path.chars() {
		match character {
			'0'..='9' | '.' => number.push(character),
			'-' => {
				flush(&mut number, &mut out);
				number.push(character);
			}
			command if command.is_ascii_alphabetic() => {
				flush(&mut number, &mut out);
				out.push(command);
			}
			_ => flush(&mut number, &mut out),
		}
	}
	flush(&mut number, &mut out);
	out
}

struct Recipe {
	size: SpaceAvatarSize,
	side: f64,
	state: SpaceAvatarState,
	has_attention: bool,
	dark: bool,
	colour: Option<f32>,
	anchor: [f64; 2],
	radii: Vec<f64>,
	warning: Color,
	online: Color,
	view: f32,
	px: u32,
}

impl Recipe {
	fn new(avatar: &SpaceAvatar, t: &Tokens) -> Recipe {
		let side = f64::from(avatar.size.side());
		let seed = companion_seed(avatar.space_id);
		let byte = |index: u32| f64::from((seed >> (8 * index)) & 0xff) / 255.0;
		let radii = if avatar.size.is_compact() {
			COMPACT_RADII.to_vec()
		} else {
			ARC_RANGES
				.iter()
				.zip(1..)
				.map(|([min, max], index)| min + (max - min) * byte(index))
				.collect()
		};
		let view = avatar.size.side() + 2.0 * OVERFLOW;
		Recipe {
			size: avatar.size,
			side,
			state: avatar.state,
			has_attention: avatar.has_attention,
			dark: t.dark,
			colour: avatar.shown_colour(),
			anchor: ANCHORS[(seed & 0b11) as usize],
			radii,
			warning: t.warning,
			online: t.presence_online,
			view,
			px: (view * RASTER_SCALE).round() as u32,
		}
	}

	fn at(&self, value: f64) -> f64 {
		value + f64::from(OVERFLOW)
	}

	fn cover(&self, element: String) -> Vec<u8> {
		icon_coverage(
			&Icon { name: "space-avatar", view: self.view, body: interned(element) },
			self.px,
		)
	}

	fn polygon(&self, points: &[[f64; 2]], closed: bool) -> String {
		let mut path = String::new();
		for (index, [x, y]) in points.iter().enumerate() {
			let verb = if index == 0 { 'M' } else { 'L' };
			path.push_str(&format!("{verb}{} {}", round3(self.at(*x)), round3(self.at(*y))));
		}
		if closed {
			path.push('Z');
		}
		path
	}

	fn filled_path(&self, d: &str) -> Vec<u8> {
		self.cover(format!(r#"<path d="{d}" fill="currentColor"/>"#))
	}

	fn stroked_path(&self, d: &str, width: f64, round: bool) -> Vec<u8> {
		let cap = if round { r#" stroke-linecap="round" stroke-linejoin="round""# } else { "" };
		self.cover(format!(
			r#"<path d="{d}" fill="none" stroke="currentColor" stroke-width="{width}"{cap}/>"#
		))
	}

	fn disc(&self, centre: [f64; 2], radius: f64) -> Vec<u8> {
		self.cover(format!(
			r#"<circle cx="{}" cy="{}" r="{radius}" fill="currentColor"/>"#,
			self.at(centre[0]),
			self.at(centre[1])
		))
	}

	fn ring(&self, centre: [f64; 2], radius: f64, width: f64) -> Vec<u8> {
		self.cover(format!(
			r#"<circle cx="{}" cy="{}" r="{radius}" fill="none" stroke="currentColor" stroke-width="{width}"/>"#,
			self.at(centre[0]),
			self.at(centre[1])
		))
	}

	fn shape(&self) -> String {
		let centre = self.side / 2.0;
		self.polygon(&superellipse(centre, centre), true)
	}

	fn tones(&self) -> Vec<Color> {
		let full: &[[f64; 2]] = if self.dark { &DARK_FULL } else { &LIGHT_FULL };
		let compact: &[[f64; 2]] = if self.dark { &DARK_COMPACT } else { &LIGHT_COMPACT };
		let tones = if self.size.is_compact() { compact } else { full };
		tones.iter().map(|&pair| tone(pair, self.colour)).collect()
	}

	fn line_colour(&self) -> Color {
		let compact = if self.dark { DARK_COMPACT } else { LIGHT_COMPACT };
		tone(compact[2], self.colour)
	}

	fn badge_centre(&self) -> [f64; 2] {
		let centre = self.side - DOT_CENTRE_INSET * self.size.marks().badge_diameter;
		[centre, centre]
	}

	fn edge_width(&self) -> f64 {
		if self.size.is_compact() {
			COMPACT_EDGE_SHARE * self.side
		} else {
			(GLAZE_EDGE_SHARE * self.side).max(1.0)
		}
	}

	fn arc_centre(&self) -> [f64; 2] {
		[self.anchor[0] * self.side, self.anchor[1] * self.side]
	}

	fn is_glazed(&self) -> bool {
		!self.size.is_compact() && (self.state == SpaceAvatarState::Local || self.state.has_dot())
	}

	fn layers(&self) -> Layers {
		let mut base = Canvas::new(self.px);
		self.paint_drawing(&mut base);
		if self.has_attention {
			let metrics = self.size.state_metrics();
			let centre = self.side / 2.0;
			let half = centre + metrics.attention_gap + metrics.attention_width / 2.0;
			let ring = self.stroked_path(
				&self.polygon(&superellipse(centre, half), true),
				metrics.attention_width,
				false,
			);
			base.paint(&ring, self.warning, 1.0);
		}
		if self.state.has_badge() {
			let marks = self.size.marks();
			let cut =
				self.disc(self.badge_centre(), marks.badge_diameter / 2.0 + marks.badge_cut_out);
			base.cut(&cut);
		}
		Layers { base: base.into_pixels(), badges: self.badges().map(Canvas::into_pixels) }
	}

	fn paint_drawing(&self, base: &mut Canvas) {
		let tones = self.tones();
		let clip = self.filled_path(&self.shape());
		match self.state {
			state if state.is_filled() => {
				let mut group = Canvas::new(self.px);
				group.flood(tones[0], 1.0);
				let arc_centre = self.arc_centre();
				for (index, radius) in self.radii.iter().enumerate().rev() {
					let arc = self.disc(arc_centre, radius * self.side);
					group.paint(&arc, tones[tones.len() - 1 - index], ARC_OPACITY);
				}
				if state == SpaceAvatarState::Offline {
					self.paint_hatch(&mut group);
				}
				if self.is_glazed() {
					self.paint_glaze(&mut group);
				}
				if self.size.is_compact() {
					let edge = self.stroked_path(&self.shape(), 2.0 * self.edge_width(), false);
					let (ink, opacity) = if self.dark {
						(Color::WHITE, DARK_COMPACT_EDGE)
					} else {
						(Color::BLACK, LIGHT_COMPACT_EDGE)
					};
					group.paint(&edge, ink, opacity);
				}
				let opacity = if state == SpaceAvatarState::Offline && !self.dark {
					LIGHT_OFFLINE_OPACITY
				} else {
					1.0
				};
				base.composite(&group, &clip, opacity);
			}
			SpaceAvatarState::Connecting => {
				let mut group = Canvas::new(self.px);
				group.flood(tones[0], 1.0);
				self.paint_lines(&mut group);
				base.composite(&group, &clip, 1.0);
			}
			_ => {
				let metrics = self.size.state_metrics();
				let centre = self.side / 2.0;
				let half = centre - metrics.invitation_stroke / 2.0;
				let outline = superellipse(centre, half);
				let dashes = dashes(&outline, metrics.invitation_stroke);
				let d: String = dashes.iter().map(|dash| self.polygon(dash, false)).collect();
				let dashed = self.stroked_path(&d, metrics.invitation_stroke, true);
				base.paint(&dashed, self.line_colour(), 1.0);
				if self.state == SpaceAvatarState::Joining {
					let mut group = Canvas::new(self.px);
					self.paint_lines(&mut group);
					base.composite(&group, &clip, 1.0);
				}
			}
		}
	}

	fn paint_lines(&self, group: &mut Canvas) {
		let width = self.size.state_metrics().line_stroke;
		for radius in &self.radii {
			let line = self.ring(self.arc_centre(), radius * self.side, width);
			group.paint(&line, self.line_colour(), 1.0);
		}
	}

	fn paint_hatch(&self, group: &mut Canvas) {
		let marks = self.size.marks();
		let steps = (2.0 * self.side / marks.hatch_spacing).floor() as usize;
		let d: String = (0..=steps)
			.map(|step| {
				let offset = round3(step as f64 * marks.hatch_spacing);
				format!(
					"M{} {}L{} {}",
					self.at(round3(offset - self.side)),
					self.at(self.side),
					self.at(offset),
					self.at(0.0)
				)
			})
			.collect();
		let hatch = self.stroked_path(&d, marks.hatch_stroke, false);
		let ink = if self.dark { Color::WHITE } else { Color::BLACK };
		group.paint(&hatch, ink, HATCH_OPACITY);
	}

	fn paint_glaze(&self, group: &mut Canvas) {
		let origin = f64::from(OVERFLOW);
		let side = self.side;
		group.gradient(|x, y| {
			let v = (y - origin) / side;
			if !(0.0..=1.0).contains(&v) || !(0.0..=1.0).contains(&((x - origin) / side)) {
				return None;
			}
			Some(if v < SHEEN_TURN {
				(Color::WHITE, SHEEN_TOP * (1.0 - (v / SHEEN_TURN) as f32))
			} else {
				(Color::BLACK, SHEEN_FOOT * ((v - SHEEN_TURN) / (1.0 - SHEEN_TURN)) as f32)
			})
		});
		group.gradient(|x, y| {
			let u = (x - origin) / side;
			let v = (y - origin) / side;
			if !(0.0..=1.0).contains(&u) || !(0.0..=1.0).contains(&v) {
				return None;
			}
			let reach = (u - HIGHLIGHT_CENTRE[0]).hypot(v - HIGHLIGHT_CENTRE[1]) / HIGHLIGHT_RADIUS;
			Some((Color::WHITE, HIGHLIGHT_OPACITY * (1.0 - reach.min(1.0) as f32)))
		});
		let edge_width = self.edge_width();
		let edge = self.stroked_path(&self.shape(), 2.0 * edge_width, false);
		let (ink, opacity) = if self.dark {
			(Color::WHITE, DARK_GLAZE_EDGE)
		} else {
			(Color::BLACK, LIGHT_GLAZE_EDGE)
		};
		group.paint(&edge, ink, opacity);
		let centre = self.side / 2.0;
		let lowered: Vec<[f64; 2]> =
			superellipse(centre, centre).into_iter().map(|[x, y]| [x, y + edge_width]).collect();
		let lip = mask_minus(
			&self.filled_path(&self.shape()),
			&self.filled_path(&self.polygon(&lowered, true)),
		);
		group.paint(
			&lip,
			Color::WHITE,
			if self.dark { DARK_LIP_OPACITY } else { LIGHT_LIP_OPACITY },
		);
	}

	fn badges(&self) -> Option<Canvas> {
		let marks = self.size.marks();
		let centre = self.badge_centre();
		let radius = marks.badge_diameter / 2.0;
		let (fill, glyph) = match self.state {
			state if state.has_dot() => (self.online, None),
			SpaceAvatarState::Local => (srgb(LOCAL_BADGE_FILL), Some((LAPTOP_GLYPH, marks.laptop))),
			SpaceAvatarState::Offline => (
				srgb(if self.dark { DARK_OFFLINE_BADGE_FILL } else { LIGHT_OFFLINE_BADGE_FILL }),
				marks.cross.map(|cross| (CROSS_GLYPH, cross)),
			),
			_ => return None,
		};
		let mut canvas = Canvas::new(self.px);
		canvas.paint(&self.disc(centre, radius), fill, 1.0);
		if let Some((path, glyph)) = glyph {
			let origin = self.at(centre[0] - GLYPH_GRID / 2.0 * glyph.scale);
			let d = transformed_glyph(path, origin, glyph.scale);
			canvas.paint(
				&self.stroked_path(&d, glyph.stroke * glyph.scale, true),
				Color::WHITE,
				1.0,
			);
		}
		Some(canvas)
	}
}

fn mask_minus(keep: &[u8], remove: &[u8]) -> Vec<u8> {
	keep.iter()
		.zip(remove)
		.map(|(&k, &r)| ((u32::from(k) * (255 - u32::from(r))) / 255) as u8)
		.collect()
}

struct Canvas {
	side: u32,
	premultiplied: Vec<[f32; 4]>,
}

impl Canvas {
	fn new(side: u32) -> Canvas {
		Canvas { side, premultiplied: vec![[0.0; 4]; (side * side) as usize] }
	}

	fn blend(pixel: &mut [f32; 4], colour: Color, alpha: f32) {
		let [r, g, b, a] = encoded(colour);
		let alpha = alpha * a;
		for (channel, value) in pixel.iter_mut().zip([r, g, b]) {
			*channel = value * alpha + *channel * (1.0 - alpha);
		}
		pixel[3] = alpha + pixel[3] * (1.0 - alpha);
	}

	fn flood(&mut self, colour: Color, alpha: f32) {
		for pixel in &mut self.premultiplied {
			Canvas::blend(pixel, colour, alpha);
		}
	}

	fn paint(&mut self, coverage: &[u8], colour: Color, alpha: f32) {
		for (pixel, &covered) in self.premultiplied.iter_mut().zip(coverage) {
			if covered > 0 {
				Canvas::blend(pixel, colour, alpha * f32::from(covered) / 255.0);
			}
		}
	}

	fn gradient(&mut self, paint_at: impl Fn(f64, f64) -> Option<(Color, f32)>) {
		let step = 1.0 / f64::from(RASTER_SCALE);
		let side = self.side as usize;
		for (index, pixel) in self.premultiplied.iter_mut().enumerate() {
			let x = ((index % side) as f64 + 0.5) * step;
			let y = ((index / side) as f64 + 0.5) * step;
			if let Some((colour, alpha)) = paint_at(x, y) {
				Canvas::blend(pixel, colour, alpha);
			}
		}
	}

	fn composite(&mut self, group: &Canvas, clip: &[u8], opacity: f32) {
		for ((pixel, source), &covered) in
			self.premultiplied.iter_mut().zip(&group.premultiplied).zip(clip)
		{
			let share = opacity * f32::from(covered) / 255.0;
			let kept = 1.0 - source[3] * share;
			for channel in 0..4 {
				pixel[channel] = source[channel] * share + pixel[channel] * kept;
			}
		}
	}

	fn cut(&mut self, coverage: &[u8]) {
		for (pixel, &covered) in self.premultiplied.iter_mut().zip(coverage) {
			let kept = 1.0 - f32::from(covered) / 255.0;
			for channel in pixel.iter_mut() {
				*channel *= kept;
			}
		}
	}

	fn into_pixels(self) -> Pixels {
		let rgba = self
			.premultiplied
			.iter()
			.flat_map(|&[r, g, b, a]| {
				let straight = |channel: f32| {
					if a <= 0.0 { 0 } else { ((channel / a).clamp(0.0, 1.0) * 255.0).round() as u8 }
				};
				[straight(r), straight(g), straight(b), (a.clamp(0.0, 1.0) * 255.0).round() as u8]
			})
			.collect();
		let pixels = Pixels::new();
		pixels.set(self.side, self.side, rgba);
		pixels
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_tones_match_the_recipe_of_main() {
		let hex = |colour: Color| {
			let [r, g, b, _] = encoded(colour).map(|channel| (channel * 255.0).round() as u8);
			format!("#{r:02x}{g:02x}{b:02x}")
		};
		let full: Vec<String> =
			LIGHT_FULL.iter().map(|&pair| hex(tone(pair, Some(210.0)))).collect();
		assert_eq!(full, ["#ceeff5", "#a0d9e3", "#65c1d1", "#19a4b7"]);
		assert_eq!(hex(tone(DARK_COMPACT[2], Some(257.0))), "#8ebaf7");
		assert_eq!(hex(tone(LIGHT_COMPACT[2], None)), "#636363");
		assert_eq!(
			[
				ink_of(false, None),
				ink_of(true, None),
				ink_of(false, Some(257.0)),
				ink_of(true, Some(82.0))
			]
			.map(hex),
			["#3d3d3d", "#f2f2f2", "#1b3d6b", "#fcf0dc"]
		);
	}

	#[test]
	fn a_dragged_hue_keeps_the_cache_under_its_cap_and_leaks_nothing_new() {
		let t = Tokens::new(false);
		let face = |colour: f32| SpaceAvatar {
			space_id: "vocca",
			name: "Vocca",
			colour: Some(colour),
			size: SpaceAvatarSize::Px26,
			state: SpaceAvatarState::Local,
			has_attention: false,
		};
		face(0.0).draw(&t);
		let leaked = BODIES.with(|bodies| bodies.borrow().len());
		for step in 0..1000 {
			face(step as f32 * 0.36).draw(&t);
			assert!(LAYERS.with(|cache| cache.borrow().len()) <= LAYER_CAP);
		}
		assert_eq!(BODIES.with(|bodies| bodies.borrow().len()), leaked);
	}

	#[test]
	fn the_glyph_moves_into_the_badge() {
		assert_eq!(
			transformed_glyph(CROSS_GLYPH, 10.0, 0.5),
			"M13.75 13.75L18.25 18.25M18.25 13.75L13.75 18.25"
		);
	}

	#[test]
	fn the_marks_scale_from_the_nearest_drawn_size() {
		let marks = SpaceAvatarSize::Px36.marks();
		assert_eq!(marks.badge_diameter, 16.615);
		assert_eq!(marks.badge_cut_out, 2.769);
		assert_eq!(marks.initial_size, 18.0);
		assert_eq!(
			(marks.laptop.scale, marks.hatch_spacing, marks.hatch_stroke),
			(0.485, 5.538, 1.385)
		);
		assert!(SpaceAvatarSize::Px12.is_compact());
	}

	#[test]
	fn the_dashes_match_the_dash_array_of_main() {
		let outline = superellipse(13.0, 12.25);
		assert_eq!(dash_array(&outline, 1.5), [2.669, 2.184]);
		assert!(dashes(&outline, 1.5).len() >= MIN_DASHES as usize);
	}

	#[test]
	fn the_arcs_come_from_the_space_id() {
		let avatar = SpaceAvatar {
			space_id: "vocca",
			name: "Vocca",
			colour: None,
			size: SpaceAvatarSize::Px26,
			state: SpaceAvatarState::Local,
			has_attention: false,
		};
		let recipe = Recipe::new(&avatar, &Tokens::new(false));
		assert_eq!(recipe.anchor, [-0.02, 1.02]);
		let main = [0.402_588_235_294_117_64, 0.735_529_411_764_705_9, 0.954_509_803_921_568_7];
		for (radius, expected) in recipe.radii.iter().zip(main) {
			assert!((radius - expected).abs() < 1e-12, "{radius} is not {expected}");
		}
	}
}
