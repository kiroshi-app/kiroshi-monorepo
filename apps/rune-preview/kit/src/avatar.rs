use std::collections::HashMap;
use std::f64::consts::{PI, SQRT_2, TAU};
use std::sync::OnceLock;

use rune::color::srgb_decode;
use rune::{Color, El, LineCap, Path, Shape, TextStyle, canvas, el, text};

use crate::hues::Role;
use crate::tokens::{Tokens, srgb, tone};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Activity {
	Thinking,
	Searching,
	Working,
	Writing,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Motion {
	Still,
	Running { activity: Activity, at_ms: f64 },
}

pub struct Face<'a> {
	pub name: &'a str,
	pub hue: Option<f32>,
	pub motion: Motion,
}

impl<'a> Face<'a> {
	pub fn still(name: &'a str, hue: Option<f32>) -> Face<'a> {
		Face { name, hue, motion: Motion::Still }
	}

	pub fn draw(&self, size: f32, t: &Tokens) -> El {
		let dark = t.dark;
		let motion = if t.reduced_motion { Motion::Still } else { self.motion };
		let (ink, ground) = colours(self.name, self.hue, dark);
		let side = f64::from(size);
		let outline = Outline::of_width(side);
		let mut shape = Shape::new().view_box(size, size).fill_path(&outline.path(0.0), ground);
		for (cell, tone) in grid().cells.iter().zip(tones(&field(self.name), motion)) {
			let Some(opacity) = opacity_of(tone) else { continue };
			let corners: Vec<[f32; 2]> = hexagon_corners(*cell, grid().radius * CELL_SHARE)
				.map(|[u, v]| [(u * side) as f32, (v * side) as f32])
				.collect();
			shape = shape.fill(corners, ink.alpha(opacity));
		}
		canvas(glazed(shape, &outline, side, dark)).size(size, size).label(self.name)
	}
}

pub struct Person<'a> {
	pub name: &'a str,
}

impl Person<'_> {
	pub fn draw(&self, size: f32, t: &Tokens) -> El {
		let font_size = (size * INITIALS_RATIO).round();
		let initials = TextStyle { line_height: font_size, ..TextStyle::new(font_size, 500.0) };
		el().size(size, size)
			.radius(size / 2.0)
			.fill(t.sidebar_accent)
			.center()
			.label(display_name(self.name))
			.child(text(initials_of(self.name)).font(initials).color(t.sidebar_accent_foreground))
	}
}

const INITIALS_RATIO: f32 = 0.4;
const FALLBACK_NAME: &str = "You";

fn display_name(name: &str) -> &str {
	match name.trim() {
		"" => FALLBACK_NAME,
		trimmed => trimmed,
	}
}

pub fn initials_of(name: &str) -> String {
	display_name(name)
		.split_whitespace()
		.take(2)
		.filter_map(|word| word.chars().next())
		.collect::<String>()
		.to_uppercase()
}

const FIELD_CELLS: usize = 16;
const LATTICE: usize = 5;
const BLOB_SIGMA: f64 = 0.055;
const COLUMN_STEP: f64 = 0.13;
const ROW_STEP: f64 = 0.1;
const FLOOR: f64 = 0.03;
const NOISE_AMPLITUDE: f64 = 0.2;
const SILHOUETTE_WEIGHT: f64 = 0.95;
const DRIFT_PERIOD: f64 = 9000.0;
const STATE_HOLD: f64 = 0.6;
const HUE_SALT: u32 = 0x51ed_270b;
const HUE_JITTER: f64 = 12.0;
const CELL_SHARE: f64 = 0.9;
const HALF_TONE_OPACITY: f32 = 0.45;

const FNV_OFFSET: u32 = 0x811c_9dc5;
const FNV_PRIME: u32 = 0x0100_0193;
const UINT32_RANGE: f64 = 4_294_967_296.0;

const SILHOUETTE_COLUMNS: i32 = 5;
const SILHOUETTE_ROWS: i32 = 7;
const SILHOUETTE_FAMILIES: f64 = 4.0;
const SILHOUETTE_VARIANTS: f64 = 1024.0;
const FILL_CHANCE: f64 = 0.55;
const MIN_CELLS: usize = 12;
const SPINE: i32 = (SILHOUETTE_COLUMNS - 1) / 2;
const UNSHARED: (i32, i32) = (-1, 0);

const FIELD_FLOOR: f64 = 0.3;
const PULSE_WIDTH: f64 = 0.25;
const REVEAL_SPAN: f64 = 0.6;
const SWEEP_SPAN: f64 = 0.6;
const RIPPLE_SPAN: f64 = 0.5;

const OUTER_HALF_WIDTH: f64 = 200.5;
const OUTER_HALF_HEIGHT: f64 = 181.5;
const OUTLINE_SIDE: f64 = OUTER_HALF_WIDTH * 2.0;
const COS_30: f64 = 0.866_025_403_784_438_6;
const TAN_30: f64 = 0.577_350_269_189_625_8;
const TURN: f64 = PI / 3.0;
const ARC_CONTROL: f64 = 4.0 / 3.0 * 0.267_949_192_431_122_7;
const LIP_STEPS: usize = 8;

const COMPACT_BELOW: f64 = 20.0;
const GLAZE_EDGE_SHARE: f64 = 0.025;
const COMPACT_EDGE_SHARE: f64 = 0.05;

struct Untinted {
	field: u32,
	ground_strength: f64,
	secondary: u32,
}

const LIGHT_UNTINTED: Untinted =
	Untinted { field: 0x1d3ccd, ground_strength: 0.25, secondary: 0xf2f2f2 };
const DARK_UNTINTED: Untinted =
	Untinted { field: 0x75acff, ground_strength: 0.35, secondary: 0x262626 };

pub fn companion_seed(name: &str) -> u32 {
	name.chars()
		.fold(FNV_OFFSET, |hash, character| (hash ^ character as u32).wrapping_mul(FNV_PRIME))
}

struct Random(u32);

impl Random {
	fn next(&mut self) -> f64 {
		self.0 = self.0.wrapping_add(0x6d2b_79f5);
		let state = self.0;
		let mut mixed = (state ^ (state >> 15)).wrapping_mul(state | 1);
		mixed ^= mixed.wrapping_add((mixed ^ (mixed >> 7)).wrapping_mul(mixed | 61));
		f64::from(mixed ^ (mixed >> 14)) / UINT32_RANGE
	}
}

pub fn hue_shift(name: &str) -> f64 {
	let mut random = Random(companion_seed(name) ^ HUE_SALT);
	((random.next() * 2.0 - 1.0) * HUE_JITTER + 0.5).floor()
}

fn colours(name: &str, hue: Option<f32>, dark: bool) -> (Color, Color) {
	if let Some(hue) = hue {
		let shifted = (f64::from(hue) + hue_shift(name)) as f32;
		return (tone(shifted, dark, Role::AvatarInk), tone(shifted, dark, Role::AvatarGround));
	}
	let untinted = if dark { DARK_UNTINTED } else { LIGHT_UNTINTED };
	let field = oklab_of(untinted.field);
	let surface = oklab_of(untinted.secondary);
	let strength = untinted.ground_strength;
	let mixed = [0, 1, 2].map(|at| field[at] * strength + surface[at] * (1.0 - strength));
	(srgb(untinted.field), colour_of_oklab(mixed))
}

fn to_linear(channel: f64) -> f64 {
	if channel <= 0.040_45 { channel / 12.92 } else { ((channel + 0.055) / 1.055).powf(2.4) }
}

fn to_gamma(channel: f64) -> f64 {
	if channel <= 0.003_130_8 { channel * 12.92 } else { 1.055 * channel.powf(1.0 / 2.4) - 0.055 }
}

fn oklab_of(rgb: u32) -> [f64; 3] {
	let channel = |shift: u32| to_linear(f64::from((rgb >> shift) & 0xff) / 255.0);
	let (r, g, b) = (channel(16), channel(8), channel(0));
	let l = (0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b).cbrt();
	let m = (0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b).cbrt();
	let s = (0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b).cbrt();
	[
		0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
		1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
		0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
	]
}

fn colour_of_oklab([lightness, a, b]: [f64; 3]) -> Color {
	let l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b).powi(3);
	let m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b).powi(3);
	let s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b).powi(3);
	let encoded = |linear: f64| {
		let gamma = (to_gamma(linear).clamp(0.0, 1.0) * 255.0).round() / 255.0;
		srgb_decode(gamma as f32)
	};
	Color {
		r: encoded(4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s),
		g: encoded(-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s),
		b: encoded(-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s),
		a: 1.0,
	}
}

fn symmetric(family: usize, column: i32, row: i32) -> (i32, i32) {
	let mirrored = column.min(SILHOUETTE_COLUMNS - 1 - column);
	match family {
		0 => (mirrored, row),
		1 if column == SPINE => UNSHARED,
		1 => (mirrored, row),
		2 => (mirrored, row.min(SILHOUETTE_ROWS - 1 - row)),
		_ if row * SILHOUETTE_COLUMNS + column
			<= (SILHOUETTE_ROWS * SILHOUETTE_COLUMNS - 1) / 2 =>
		{
			(column, row)
		}
		_ => (SILHOUETTE_COLUMNS - 1 - column, SILHOUETTE_ROWS - 1 - row),
	}
}

fn silhouette_cells(seed: u32) -> Vec<(i32, i32)> {
	let mut pick = Random(seed);
	let family = (pick.next() * SILHOUETTE_FAMILIES).floor() as u32;
	let variant = (pick.next() * SILHOUETTE_VARIANTS).floor() as u32;
	let mut random =
		Random(variant.wrapping_mul(7919).wrapping_add(family.wrapping_mul(104_729)) + 1);
	let mut lit: HashMap<(i32, i32), bool> = HashMap::new();
	let mut is_lit = |column: i32, row: i32| {
		let key = symmetric(family as usize, column, row);
		*lit.entry(key).or_insert_with(|| key == UNSHARED || random.next() < FILL_CHANCE)
	};
	let every = (0..SILHOUETTE_ROWS)
		.flat_map(|row| (0..SILHOUETTE_COLUMNS).map(move |column| (column, row)));
	let lit_count = every.clone().filter(|&(column, row)| is_lit(column, row)).count();
	let is_sparse = lit_count < MIN_CELLS;
	every.filter(|&(column, row)| is_lit(column, row) || (is_sparse && column == SPINE)).collect()
}

struct Grid {
	cells: Vec<[f64; 2]>,
	ahead: Vec<Vec<(usize, f64)>>,
	radius: f64,
}

const HONEYCOMB_SPILLS: [(i32, i32, f64); 3] =
	[(-1, 1, 3.0 / 8.0), (1, 1, 3.0 / 8.0), (0, 2, 0.25)];

fn grid() -> &'static Grid {
	static GRID: OnceLock<Grid> = OnceLock::new();
	GRID.get_or_init(honeycomb)
}

fn honeycomb() -> Grid {
	let columns = FIELD_CELLS as i32;
	let pitch = 1.0 / FIELD_CELLS as f64;
	let radius = pitch / 1.5;
	let half_row_pitch = 3.0_f64.sqrt() * radius / 2.0;
	let half_rows = (0.5 / half_row_pitch).ceil() as i32;
	let outline = Outline::outer();
	let mut placed: Vec<(i32, i32, [f64; 2])> = Vec::new();
	for half_row in -half_rows..=half_rows {
		for column in 0..columns {
			if (column + half_row) % 2 != 0 {
				continue;
			}
			let cell = [
				0.5 + (f64::from(column) - f64::from(columns - 1) / 2.0) * pitch,
				0.5 + f64::from(half_row) * half_row_pitch,
			];
			let inside = hexagon_corners(cell, radius * CELL_SHARE)
				.all(|[u, v]| outline.contains((u - 0.5) * OUTLINE_SIDE, (v - 0.5) * OUTLINE_SIDE));
			if inside {
				placed.push((column, half_row, cell));
			}
		}
	}
	let index_of: HashMap<(i32, i32), usize> = placed
		.iter()
		.enumerate()
		.map(|(index, &(column, half_row, _))| ((column, half_row), index))
		.collect();
	let ahead = placed
		.iter()
		.map(|&(column, half_row, _)| {
			HONEYCOMB_SPILLS
				.iter()
				.filter_map(|&(step, down, share)| {
					index_of.get(&(column + step, half_row + down)).map(|&to| (to, share))
				})
				.collect()
		})
		.collect();
	Grid { cells: placed.into_iter().map(|(_, _, cell)| cell).collect(), ahead, radius }
}

fn hexagon_corners([u, v]: [f64; 2], radius: f64) -> impl Iterator<Item = [f64; 2]> {
	(0..6).map(move |corner| {
		let angle = f64::from(corner) * TURN;
		[u + radius * angle.cos(), v + radius * angle.sin()]
	})
}

struct Field {
	silhouette: Vec<f32>,
	lattice: Vec<f32>,
}

fn field(name: &str) -> Field {
	let seed = companion_seed(name);
	let blobs: Vec<[f64; 2]> = silhouette_cells(seed)
		.into_iter()
		.map(|(column, row)| {
			[0.5 + f64::from(column - 2) * COLUMN_STEP, 0.5 + f64::from(row - 3) * ROW_STEP]
		})
		.collect();
	let spread = 2.0 * BLOB_SIGMA * BLOB_SIGMA;
	let silhouette = grid()
		.cells
		.iter()
		.map(|&[u, v]| {
			let sum: f64 = blobs
				.iter()
				.map(|[x, y]| (-((u - x).powi(2) + (v - y).powi(2)) / spread).exp())
				.sum();
			sum.clamp(0.0, 1.0) as f32
		})
		.collect();
	let mut random = Random(seed);
	let lattice = (0..LATTICE * LATTICE).map(|_| random.next() as f32).collect();
	Field { silhouette, lattice }
}

fn smooth(value: f64) -> f64 {
	value * value * (3.0 - 2.0 * value)
}

fn noise_at(lattice: &[f32], u: f64, v: f64) -> f64 {
	let size = LATTICE as f64;
	let x = ((u % 1.0) + 1.0) % 1.0 * size;
	let y = ((v % 1.0) + 1.0) % 1.0 * size;
	let (x0, y0) = (x.floor(), y.floor());
	let at = |column: f64, row: f64| {
		f64::from(lattice[(row as usize % LATTICE) * LATTICE + (column as usize % LATTICE)])
	};
	let (fx, fy) = (smooth(x - x0), smooth(y - y0));
	let top = at(x0, y0) + (at(x0 + 1.0, y0) - at(x0, y0)) * fx;
	let bottom = at(x0, y0 + 1.0) + (at(x0 + 1.0, y0 + 1.0) - at(x0, y0 + 1.0)) * fx;
	top + (bottom - top) * fy
}

fn fraction(value: f64) -> f64 {
	value - value.floor()
}

fn across(value: f64) -> f64 {
	(value + 1.0) / 2.0
}

fn pulse(cycle: f64) -> f64 {
	if cycle < PULSE_WIDTH { (PI * cycle / PULSE_WIDTH).sin() } else { 0.0 }
}

impl Activity {
	fn period(self) -> f64 {
		match self {
			Activity::Thinking => 1800.0,
			Activity::Searching => 1400.0,
			Activity::Working => 1000.0,
			Activity::Writing => 2000.0,
		}
	}

	fn phase(self, x: f64, y: f64) -> f64 {
		match self {
			Activity::Thinking => x.hypot(y) / SQRT_2 * RIPPLE_SPAN,
			Activity::Searching => across(x) * SWEEP_SPAN,
			Activity::Working => fraction(y.atan2(x) / TAU),
			Activity::Writing => across(y) * SWEEP_SPAN + across(x) * 0.05,
		}
	}

	fn wave(self, cycle: f64) -> f64 {
		match self {
			Activity::Writing => f64::from(u8::from(cycle < REVEAL_SPAN)),
			_ => pulse(cycle),
		}
	}

	fn intensity(self, x: f64, y: f64, at_ms: f64) -> f64 {
		let cycle = fraction(at_ms / self.period() - self.phase(x, y));
		FIELD_FLOOR + (1.0 - FIELD_FLOOR) * self.wave(cycle)
	}
}

fn densities(field: &Field, motion: Motion) -> Vec<f64> {
	let drift = match motion {
		Motion::Still => 0.0,
		Motion::Running { at_ms, .. } => at_ms / DRIFT_PERIOD,
	};
	grid()
		.cells
		.iter()
		.zip(&field.silhouette)
		.map(|(&[u, v], &shape)| {
			let floor = FLOOR + NOISE_AMPLITUDE * noise_at(&field.lattice, u + drift, v);
			let intensity = match motion {
				Motion::Still => 1.0,
				Motion::Running { activity, at_ms } => {
					activity.intensity(u * 2.0 - 1.0, v * 2.0 - 1.0, at_ms)
				}
			};
			let hold = STATE_HOLD + (1.0 - STATE_HOLD) * intensity;
			((floor + SILHOUETTE_WEIGHT * f64::from(shape)) * hold).clamp(0.0, 1.0)
		})
		.collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Tone {
	Off,
	Half,
	Full,
}

fn opacity_of(tone: Tone) -> Option<f32> {
	match tone {
		Tone::Off => None,
		Tone::Half => Some(HALF_TONE_OPACITY),
		Tone::Full => Some(1.0),
	}
}

fn nearest(value: f64) -> (Tone, f64) {
	[(Tone::Half, 0.5), (Tone::Full, 1.0)].into_iter().fold((Tone::Off, 0.0), |best, next| {
		if (next.1 - value).abs() < (best.1 - value).abs() { next } else { best }
	})
}

fn tones(field: &Field, motion: Motion) -> Vec<Tone> {
	let mut error: Vec<f32> =
		densities(field, motion).into_iter().map(|value| value as f32).collect();
	(0..error.len())
		.map(|index| {
			let value = f64::from(error[index]);
			let (tone, level) = nearest(value);
			for &(to, share) in &grid().ahead[index] {
				error[to] = (f64::from(error[to]) + (value - level) * share) as f32;
			}
			tone
		})
		.collect()
}

struct Outline {
	centre: f64,
	apothem: f64,
	rounding: f64,
}

impl Outline {
	fn outer() -> Outline {
		Outline::of_half(OUTER_HALF_WIDTH, OUTER_HALF_HEIGHT, 0.0)
	}

	fn of_width(width: f64) -> Outline {
		Outline::of_half(width / 2.0, OUTER_HALF_HEIGHT * width / OUTLINE_SIDE, width / 2.0)
	}

	fn of_half(half_width: f64, half_height: f64, centre: f64) -> Outline {
		let apothem = (half_width - half_height) / (1.0 / COS_30 - 1.0);
		Outline { centre, apothem, rounding: half_height - apothem }
	}

	fn contains(&self, x: f64, y: f64) -> bool {
		let (normal_x, normal_y) = (-COS_30, 0.5);
		let (mut px, mut py) = (x.abs(), y.abs());
		let fold = 2.0 * (normal_x * px + normal_y * py).min(0.0);
		px -= fold * normal_x;
		py -= fold * normal_y;
		let reach = self.apothem * TAN_30;
		let dx = px - px.clamp(-reach, reach);
		let dy = py - self.apothem;
		dx.hypot(dy) * dy.signum() <= self.rounding
	}

	fn vertex(&self, index: usize) -> [f64; 2] {
		let reach = self.apothem / COS_30;
		let angle = index as f64 * TURN;
		[self.centre + reach * angle.cos(), self.centre + reach * angle.sin()]
	}

	fn path(&self, inset: f64) -> Path {
		let rounding = self.rounding - inset;
		let at = |[x, y]: [f64; 2], angle: f64, radius: f64| {
			[(x + radius * angle.cos()) as f32, (y + radius * angle.sin()) as f32]
		};
		let tangent = |angle: f64, sign: f64| [-angle.sin() * sign, angle.cos() * sign];
		let mut path = Path::new();
		for index in 0..6 {
			let vertex = self.vertex(index);
			let before = index as f64 * TURN - TURN / 2.0;
			let after = before + TURN;
			let start = at(vertex, before, rounding);
			let end = at(vertex, after, rounding);
			let reach = (ARC_CONTROL * rounding) as f32;
			let [ax, ay] = tangent(before, 1.0);
			let [bx, by] = tangent(after, -1.0);
			path = if index == 0 { path.move_to(start) } else { path.line_to(start) };
			path = path.cubic_to(
				[start[0] + reach * ax as f32, start[1] + reach * ay as f32],
				[end[0] + reach * bx as f32, end[1] + reach * by as f32],
				end,
			);
		}
		path.close()
	}

	fn top_chain(&self, drop: f64) -> Vec<[f32; 2]> {
		let arcs = [
			(3, PI, 7.0 * PI / 6.0),
			(4, 7.0 * PI / 6.0, 1.5 * PI),
			(5, 1.5 * PI, 11.0 * PI / 6.0),
			(0, 11.0 * PI / 6.0, TAU),
		];
		arcs.into_iter()
			.flat_map(|(index, from, to)| {
				let [x, y] = self.vertex(index);
				(0..=LIP_STEPS).map(move |step| {
					let angle = from + (to - from) * step as f64 / LIP_STEPS as f64;
					[
						(x + self.rounding * angle.cos()) as f32,
						(y + drop + self.rounding * angle.sin()) as f32,
					]
				})
			})
			.collect()
	}
}

struct Glaze {
	edge: Color,
	lip: Option<Color>,
	width: f64,
}

fn glaze(side: f64, dark: bool) -> Glaze {
	let ink = if dark { Color::WHITE } else { Color::BLACK };
	if side < COMPACT_BELOW {
		return Glaze {
			edge: ink.alpha(if dark { 0.12 } else { 0.1 }),
			lip: None,
			width: COMPACT_EDGE_SHARE * side,
		};
	}
	Glaze {
		edge: ink.alpha(if dark { 0.1 } else { 0.08 }),
		lip: Some(Color::WHITE.alpha(if dark { 0.22 } else { 0.55 })),
		width: (GLAZE_EDGE_SHARE * side).max(1.0),
	}
}

fn glazed(shape: Shape, outline: &Outline, side: f64, dark: bool) -> Shape {
	let glaze = glaze(side, dark);
	let edged = shape.stroke_path(
		&outline.path(glaze.width / 2.0),
		glaze.width as f32,
		LineCap::Butt,
		glaze.edge,
	);
	let Some(lip) = glaze.lip else { return edged };
	let mut crescent = outline.top_chain(0.0);
	crescent.extend(outline.top_chain(glaze.width).into_iter().rev());
	edged.fill(crescent, lip)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn coded(tones: Vec<Tone>) -> String {
		tones
			.into_iter()
			.map(|tone| match tone {
				Tone::Off => '0',
				Tone::Half => 'h',
				Tone::Full => 'f',
			})
			.collect()
	}

	#[test]
	fn a_person_wears_the_initials_of_two_words_or_of_you() {
		assert_eq!(initials_of("alex martin"), "AM");
		assert_eq!(initials_of("Ana María Lopez"), "AM");
		assert_eq!(initials_of("  "), "Y");
		assert_eq!(initials_of("émile"), "É");
	}

	#[test]
	fn the_seed_and_the_random_stream_match_main() {
		assert_eq!(companion_seed("a"), 3_826_002_220);
		assert!((Random(1).next() - 0.627_073_940_588_161_3).abs() < 1e-15);
		assert_eq!([hue_shift("Wren"), hue_shift("Juniper"), hue_shift("Atlas")], [7.0, -1.0, 6.0]);
	}

	#[test]
	fn the_fields_match_the_canvas_of_main() {
		let thinking = Motion::Running { activity: Activity::Thinking, at_ms: 600.0 };
		assert_eq!(grid().cells.len(), 131);
		assert_eq!(
			coded(tones(&field("Wren"), Motion::Still)),
			"h0hhhhhhffhffffhffffhff0hhfhhhhff000hfffh00fffh0hffffh0hfffffhhfffffh0fffffhhhfffh00hfffh0hffffffhfhfhhfffhfhfhffhfhfh0fhfh0h0hhh00"
		);
		assert_eq!(
			coded(tones(&field("Wren"), thinking)),
			"h0hhhhhhffhhfffhffhhffhhhhfhh0hffh00hffh00hfhfhhhffffh00ffhhfhhfffff00hhhffhhffffh00hfhhhhhhfffhfhfhfhhfhfhfhffffhfhfh0f0hhhhhhh0h0"
		);
		assert_eq!(
			coded(tones(&field("Juniper"), Motion::Still)),
			"0h000hhh0hfh0hhfhh0hffh0hfff0hfffhhhfffff0fffffhhfffff00hffffh0hfff0000fffh00hfffh00hfffhhhhfffhfffffh0fhfhfhffffhfffh0fffh0hhhhhh0"
		);
		assert_eq!(
			coded(tones(&field("Atlas"), thinking)),
			"0hhhh0hhfhffffhffff0fffhfhffffhfffh0hhfff0h0hhfhhhhhhf00fffffhhfhfff00fffhfhhfhhhh00fhfhhhhfhfhffffhfhhfffhffffhffff0ffffhfhhh0hh0h"
		);
	}
}
