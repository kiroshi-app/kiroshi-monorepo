use rune::Color;
use rune::TextStyle;
use rune::color::srgb_decode;
use rune_kit::Kit;
use rune_kit::PaletteSeed;

pub const SPACING: f32 = 4.0;

pub const RADIUS_ROOT: f32 = 10.0;
pub const RADIUS_SM: f32 = RADIUS_ROOT * 0.6;
pub const RADIUS_MD: f32 = RADIUS_ROOT * 0.8;
pub const RADIUS_LG: f32 = RADIUS_ROOT;
pub const RADIUS_XL: f32 = RADIUS_ROOT * 1.4;
pub const RADIUS_2XL: f32 = RADIUS_ROOT * 1.8;
pub const RADIUS_BUBBLE: f32 = RADIUS_ROOT * 1.6;
pub const RADIUS_CONTROL: f32 = RADIUS_ROOT * 1.2;

pub const TEXT_COMPACT: TextStyle = TextStyle { line_height: 18.0, ..TextStyle::new(13.0, 400.0) };
pub const TEXT_COMPACT_MEDIUM: TextStyle =
	TextStyle { line_height: 18.0, ..TextStyle::new(13.0, 500.0) };
pub const TEXT_SM: TextStyle = TextStyle { line_height: 20.0, ..TextStyle::new(14.0, 400.0) };
pub const TEXT_SM_MEDIUM: TextStyle =
	TextStyle { line_height: 20.0, ..TextStyle::new(14.0, 500.0) };
pub const TEXT_READING: TextStyle = TextStyle { line_height: 22.0, ..TextStyle::new(15.0, 400.0) };
pub const TEXT_XL_SEMIBOLD: TextStyle =
	TextStyle { line_height: 28.0, ..TextStyle::new(20.0, 600.0) };
pub const TEXT_2XL_SEMIBOLD: TextStyle =
	TextStyle { line_height: 32.0, ..TextStyle::new(24.0, 600.0) };

#[derive(Clone, Copy)]
pub struct Tokens {
	pub background: Color,
	pub foreground: Color,
	pub card: Color,
	pub muted: Color,
	pub muted_foreground: Color,
	pub faint_foreground: Color,
	pub border: Color,
	pub primary: Color,
	pub user_bubble: Color,
	pub user_bubble_foreground: Color,
	pub bubble: Color,
	pub prompt_surface: Color,
	pub destructive: Color,
	pub image_outline: Color,
}

const BLUE_ACCENT: u32 = 0x2d62ac;

pub fn tokens(dark: bool) -> Tokens {
	if dark {
		return Tokens {
			background: srgb(0x000000),
			foreground: srgb(0xf5f5f5),
			card: srgb(0x121213),
			muted: srgb(0x1c1c1e),
			muted_foreground: srgb(0xa3a3a3),
			faint_foreground: srgb(0x8a8a8e),
			border: srgb(0x212224),
			primary: srgb(BLUE_ACCENT),
			user_bubble: srgb(BLUE_ACCENT),
			user_bubble_foreground: srgb(0xffffff),
			bubble: Color::WHITE.alpha(0.04),
			prompt_surface: srgb(0x1c1c1e),
			destructive: rune::oklch(0.81, 0.191, 22.216),
			image_outline: Color::WHITE.alpha(0.08),
		};
	}
	Tokens {
		background: srgb(0xf5f5f5),
		foreground: srgb(0x0a0a0a),
		card: srgb(0xffffff),
		muted: srgb(0xf2f2f2),
		muted_foreground: srgb(0x6b6b6b),
		faint_foreground: srgb(0x67676c),
		border: srgb(0xe5e5e5),
		primary: srgb(BLUE_ACCENT),
		user_bubble: srgb(0x364f7c),
		user_bubble_foreground: srgb(0xffffff),
		bubble: Color::BLACK.alpha(0.03),
		prompt_surface: srgb(0xffffff),
		destructive: rune::oklch(0.49, 0.245, 27.325),
		image_outline: Color::BLACK.alpha(0.08),
	}
}

pub fn kit(dark: bool) -> Kit {
	let t = tokens(dark);
	let mut k =
		Kit::from_palette(PaletteSeed { bg: t.background, fg: t.foreground, accent: t.primary });
	k.c.page = t.background;
	k.c.bg_base = t.background;
	k.c.layer_01 = t.card;
	k.c.text_base = t.foreground;
	k.c.text_muted = t.muted_foreground;
	k.c.text_faint = t.faint_foreground;
	k.c.border_base = t.border;
	k.radius.sm = RADIUS_SM;
	k.radius.md = RADIUS_MD;
	k.radius.lg = RADIUS_LG;
	k.radius.xl = RADIUS_XL;
	k
}

pub struct AvatarHue {
	pub ink: Color,
	pub ground: Color,
}

const HUE_PRESETS: [(f32, u32, u32); 8] = [
	(42.0, 0xb25630, 0xfee1d6),
	(63.0, 0xa86100, 0xf9e3d1),
	(82.0, 0x966c00, 0xf4e6ce),
	(132.0, 0x578429, 0xdfedd5),
	(186.0, 0x00877d, 0xcff0eb),
	(257.0, 0x3e74bf, 0xdae9ff),
	(296.0, 0x7c62b7, 0xe9e4fd),
	(358.0, 0xaf5074, 0xfddfe8),
];

const UNTINTED_FIELD: u32 = 0x1d3ccd;

pub fn avatar_hue(hue: Option<f32>) -> AvatarHue {
	let Some(hue) = hue else {
		let field = srgb(UNTINTED_FIELD);
		return AvatarHue { ink: field, ground: field.mix(srgb(0xf2f2f2), 0.75) };
	};
	let distance = |preset: f32| {
		let gap = (preset - hue).rem_euclid(360.0);
		gap.min(360.0 - gap)
	};
	let nearest = HUE_PRESETS
		.iter()
		.min_by(|a, b| distance(a.0).total_cmp(&distance(b.0)))
		.unwrap_or(&HUE_PRESETS[5]);
	AvatarHue { ink: srgb(nearest.1), ground: srgb(nearest.2) }
}

fn srgb(rgb: u32) -> Color {
	let channel = |shift: u32| srgb_decode(((rgb >> shift) & 0xff) as f32 / 255.0);
	Color { r: channel(16), g: channel(8), b: channel(0), a: 1.0 }
}
