use rune::color::srgb_decode;
use rune::{Color, Family, TextStyle, oklcha};
use rune_kit::{Kit, PaletteSeed};

use crate::hues::{self, Role};

pub const FONTS: &[&[u8]] = &[
	include_bytes!("../assets/fonts/Geist-Regular.ttf"),
	include_bytes!("../assets/fonts/Geist-Medium.ttf"),
	include_bytes!("../assets/fonts/Geist-SemiBold.ttf"),
	include_bytes!("../assets/fonts/GeistMono-Regular.ttf"),
	include_bytes!("../assets/fonts/GeistMono-Medium.ttf"),
];

pub const FAMILIES: (&str, &str) = ("Geist", "Geist Mono");

pub const SPACING: f32 = 4.0;

pub const RADIUS_ROOT: f32 = 10.0;
pub const RADIUS_SM: f32 = RADIUS_ROOT * 0.6;
pub const RADIUS_MD: f32 = RADIUS_ROOT * 0.8;
pub const RADIUS_LG: f32 = RADIUS_ROOT;
pub const RADIUS_XL: f32 = RADIUS_ROOT * 1.4;
pub const RADIUS_2XL: f32 = RADIUS_ROOT * 1.8;
pub const RADIUS_BUBBLE: f32 = RADIUS_ROOT * 1.6;
pub const RADIUS_CONTROL: f32 = RADIUS_ROOT * 1.2;

const fn style(size: f32, line_height: f32, weight: f32) -> TextStyle {
	TextStyle { line_height, ..TextStyle::new(size, weight) }
}

const fn mono(text: TextStyle) -> TextStyle {
	TextStyle { family: Family::Mono, ..text }
}

pub const TEXT_10_MEDIUM: TextStyle = style(10.0, 14.0, 500.0);
pub const TEXT_XS: TextStyle = style(12.0, 16.0, 400.0);
pub const TEXT_XS_MEDIUM: TextStyle = style(12.0, 16.0, 500.0);
pub const TEXT_XS_MONO: TextStyle = mono(TEXT_XS);
pub const TEXT_COMPACT: TextStyle = style(13.0, 18.0, 400.0);
pub const TEXT_COMPACT_MEDIUM: TextStyle = style(13.0, 18.0, 500.0);
pub const TEXT_COMPACT_SEMIBOLD: TextStyle = style(13.0, 18.0, 600.0);
pub const TEXT_COMPACT_MONO: TextStyle = mono(TEXT_COMPACT);
pub const TEXT_COMPACT_MONO_MEDIUM: TextStyle = mono(TEXT_COMPACT_MEDIUM);
pub const TEXT_SM: TextStyle = style(14.0, 20.0, 400.0);
pub const TEXT_SM_MEDIUM: TextStyle = style(14.0, 20.0, 500.0);
pub const TEXT_SM_SEMIBOLD: TextStyle = style(14.0, 20.0, 600.0);
pub const TEXT_BUBBLE: TextStyle = style(14.0, 24.0, 400.0);
pub const TEXT_BASE_SEMIBOLD: TextStyle = style(16.0, 22.0, 600.0);
pub const TEXT_INITIALS: TextStyle = style(28.0, 32.0, 600.0);
pub const TEXT_TITLE: TextStyle = TextStyle { tracking: -0.22, ..style(22.0, 28.0, 600.0) };

#[derive(Clone, Copy)]
pub struct Tokens {
	pub dark: bool,
	pub background: Color,
	pub foreground: Color,
	pub card: Color,
	pub muted: Color,
	pub muted_foreground: Color,
	pub soft_foreground: Color,
	pub faint_foreground: Color,
	pub placeholder_foreground: Color,
	pub border: Color,
	pub input: Color,
	pub primary: Color,
	pub primary_foreground: Color,
	pub user_bubble: Color,
	pub user_bubble_foreground: Color,
	pub bubble: Color,
	pub bubble_hover: Color,
	pub sidebar: Color,
	pub prompt_surface: Color,
	pub person_avatar: Color,
	pub shell_border: Color,
	pub shell_divider: Color,
	pub rail_item_selected: Color,
	pub destructive: Color,
	pub image_outline: Color,
}

pub const BLUE: f32 = 257.0;

impl Tokens {
	pub fn new(dark: bool) -> Tokens {
		let ink = if dark { Color::WHITE } else { Color::BLACK };
		let blue = tone(BLUE, dark, Role::Accent);
		if dark {
			return Tokens {
				dark,
				background: srgb(0x000000),
				foreground: srgb(0xf5f5f5),
				card: srgb(0x121213),
				muted: srgb(0x262626),
				muted_foreground: srgb(0xa3a3a3),
				soft_foreground: srgb(0xd4d4d4),
				faint_foreground: srgb(0x8a8a8e),
				placeholder_foreground: srgb(0x737373),
				border: srgb(0x212224),
				input: ink.alpha(0.15),
				primary: blue,
				primary_foreground: srgb(0x0e0e10),
				user_bubble: blue,
				user_bubble_foreground: srgb(0x0e0e10),
				bubble: ink.alpha(0.04),
				bubble_hover: ink.alpha(0.06),
				sidebar: srgb(0x1a1a1a),
				prompt_surface: srgb(0x1c1c1e),
				person_avatar: srgb(0x333333),
				shell_border: ink.alpha(0.06),
				shell_divider: ink.alpha(0.08),
				rail_item_selected: ink.alpha(0.12),
				destructive: oklcha(0.81, 0.191, 22.216, 1.0),
				image_outline: ink.alpha(0.08),
			};
		}
		Tokens {
			dark,
			background: srgb(0xf5f5f5),
			foreground: srgb(0x0a0a0a),
			card: srgb(0xffffff),
			muted: srgb(0xf2f2f2),
			muted_foreground: srgb(0x6b6b6b),
			soft_foreground: srgb(0x404040),
			faint_foreground: srgb(0x67676c),
			placeholder_foreground: srgb(0x808080),
			border: srgb(0xe5e5e5),
			input: srgb(0xe5e5e5),
			primary: blue,
			primary_foreground: srgb(0xffffff),
			user_bubble: srgb(0x364f7c),
			user_bubble_foreground: srgb(0xffffff),
			bubble: ink.alpha(0.03),
			bubble_hover: ink.alpha(0.05),
			sidebar: srgb(0xf7f7f7),
			prompt_surface: srgb(0xffffff),
			person_avatar: srgb(0xe5e5e5),
			shell_border: ink.alpha(0.06),
			shell_divider: ink.alpha(0.08),
			rail_item_selected: ink.alpha(0.10),
			destructive: oklcha(0.49, 0.245, 27.325, 1.0),
			image_outline: ink.alpha(0.08),
		}
	}

	pub fn in_space(mut self, hue: Option<f32>) -> Tokens {
		let Some(hue) = hue else { return self };
		self.primary = tone(hue, self.dark, Role::Accent);
		if self.dark {
			self.user_bubble = self.primary;
		} else {
			self.user_bubble = tone(hue, false, Role::Bubble);
			self.user_bubble_foreground = srgb(0x020202);
		}
		self
	}

	pub fn kit(&self) -> Kit {
		let mut k = Kit::from_palette(PaletteSeed {
			bg: self.background,
			fg: self.foreground,
			accent: self.primary,
		});
		k.c.page = self.background;
		k.c.bg_base = self.background;
		k.c.layer_01 = self.card;
		k.c.text_base = self.foreground;
		k.c.text_muted = self.muted_foreground;
		k.c.text_faint = self.faint_foreground;
		k.c.border_base = self.border;
		k.radius.sm = RADIUS_SM;
		k.radius.md = RADIUS_MD;
		k.radius.lg = RADIUS_LG;
		k.radius.xl = RADIUS_XL;
		k
	}
}

pub struct AvatarHue {
	pub ink: Color,
	pub ground: Color,
}

const UNTINTED_FIELD: u32 = 0x1d3ccd;

pub fn avatar_hue(hue: Option<f32>, dark: bool) -> AvatarHue {
	match hue {
		Some(hue) => AvatarHue {
			ink: tone(hue, dark, Role::AvatarInk),
			ground: tone(hue, dark, Role::AvatarGround),
		},
		None => {
			let field = srgb(UNTINTED_FIELD);
			let secondary = srgb(if dark { 0x262626 } else { 0xf2f2f2 });
			AvatarHue { ink: field, ground: field.mix(secondary, 0.75) }
		}
	}
}

pub fn conversation_icon(hue: Option<f32>, dark: bool) -> (Color, Color) {
	match hue {
		Some(hue) => (
			tone(hue, dark, Role::ConversationIcon),
			tone(hue, dark, Role::ConversationIconForeground),
		),
		None if dark => (srgb(0x262626), srgb(0xa3a3a3)),
		None => (srgb(0xe5e5e5), srgb(0x525252)),
	}
}

pub fn tone(hue: f32, dark: bool, role: Role) -> Color {
	let [r, g, b] = hues::tone(hue, dark, role);
	srgb(u32::from(r) << 16 | u32::from(g) << 8 | u32::from(b))
}

pub fn srgb(rgb: u32) -> Color {
	let channel = |shift: u32| srgb_decode(((rgb >> shift) & 0xff) as f32 / 255.0);
	Color { r: channel(16), g: channel(8), b: channel(0), a: 1.0 }
}
