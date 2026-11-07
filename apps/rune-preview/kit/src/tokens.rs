use rune::color::srgb_decode;
use rune::{Color, Family, TextStyle, oklch, oklcha};
use rune_kit::{Kit, PaletteSeed};

use crate::hues::{self, Role};

#[cfg(test)]
mod tests;

pub const FONTS: &[&[u8]] = &[
	include_bytes!("../../assets/fonts/Geist-Regular.ttf"),
	include_bytes!("../../assets/fonts/Geist-Medium.ttf"),
	include_bytes!("../../assets/fonts/Geist-SemiBold.ttf"),
	include_bytes!("../../assets/fonts/GeistMono-Regular.ttf"),
	include_bytes!("../../assets/fonts/GeistMono-Medium.ttf"),
];

pub const FAMILIES: (&str, &str) = ("Geist", "Geist Mono");

pub const SPACING: f32 = 4.0;
pub const SHELL_INSET: f32 = SPACING * 2.0;
pub const SIDEBAR_RAIL: f32 = 68.0;

pub const ICON_STROKE_EM: f32 = 0.09;
pub const ICON_STROKE_GLYPH_RATIO: f32 = 24.0 / 16.0;
pub const ICON_STROKE: f32 = 2.16;

pub fn icon_stroke_in(text: TextStyle) -> f32 {
	ICON_STROKE_EM * text.size * ICON_STROKE_GLYPH_RATIO
}

pub const RADIUS: f32 = 10.0;
pub const RADIUS_ROOT: f32 = RADIUS;
pub const RADIUS_XS: f32 = RADIUS_ROOT * 0.2;
pub const RADIUS_SM: f32 = RADIUS_ROOT * 0.6;
pub const RADIUS_MD: f32 = RADIUS_ROOT * 0.8;
pub const RADIUS_LG: f32 = RADIUS_ROOT;
pub const RADIUS_XL: f32 = RADIUS_ROOT * 1.4;
pub const RADIUS_2XL: f32 = RADIUS_ROOT * 1.8;
pub const RADIUS_3XL: f32 = RADIUS_ROOT * 2.2;
pub const RADIUS_4XL: f32 = RADIUS_ROOT * 2.6;
pub const RADIUS_BUBBLE: f32 = RADIUS_ROOT * 1.6;
pub const RADIUS_CONTROL: f32 = RADIUS_ROOT * 1.2;

const fn style(size: f32, line_height: f32, weight: f32) -> TextStyle {
	TextStyle { line_height, ..TextStyle::new(size, weight) }
}

const fn mono(text: TextStyle) -> TextStyle {
	TextStyle { family: Family::Mono, ..text }
}

pub const TEXT_10_MEDIUM: TextStyle = style(10.0, 14.0, 500.0);
pub const TEXT_11: TextStyle = style(11.0, 16.0, 400.0);
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
pub const TEXT_READING: TextStyle = style(15.0, 22.0, 400.0);
pub const TEXT_BASE_SEMIBOLD: TextStyle = style(16.0, 22.0, 600.0);
pub const TEXT_INITIALS: TextStyle = style(28.0, 32.0, 600.0);
pub const TEXT_TITLE: TextStyle = TextStyle { tracking: -0.22, ..style(22.0, 28.0, 600.0) };

pub const BLUE: f32 = 257.0;

const SELECTION_SHARE: f32 = 0.3;

macro_rules! colour_tokens {
	($($token:ident),* $(,)?) => {
		#[derive(Clone, Copy)]
		pub struct Tokens {
			pub dark: bool,
			pub reduced_motion: bool,
			pub selection: Color,
			pub popover_shadow: Color,
			$(pub $token: Color,)*
		}

		impl Tokens {
			pub fn colours(&self) -> Vec<(&'static str, Color)> {
				vec![$((stringify!($token), self.$token)),*]
			}
		}
	};
}

colour_tokens![
	background,
	foreground,
	conversation_icon,
	conversation_icon_foreground,
	conversation_pile_overflow,
	conversation_pile_overflow_foreground,
	bot_blot_ink,
	bot_avatar_field_untinted,
	brand_mark_cells,
	brand_mark_ground,
	bot_avatar_ink,
	bot_badge_attention,
	bot_badge_done,
	bot_badge_failed,
	warning,
	warning_foreground,
	success,
	state_connected,
	state_needs_authorization,
	presence_online,
	presence_offline,
	title_bar_tab,
	title_bar_tab_hover,
	title_bar_tab_selected,
	title_bar_pinned,
	title_bar_chip,
	title_bar_divider,
	title_bar_highlight,
	title_bar_menu,
	title_bar_menu_border,
	card,
	card_raised,
	popover,
	popover_foreground,
	primary,
	primary_foreground,
	primary_strong,
	secondary,
	secondary_foreground,
	muted,
	muted_foreground,
	soft_foreground,
	placeholder_foreground,
	title_placeholder_foreground,
	sketch_line,
	sketch_mark,
	accent,
	accent_foreground,
	destructive,
	destructive_tint,
	destructive_tint_foreground,
	window_close,
	mark,
	transcript_new_mark,
	border,
	question_option_ring,
	input,
	ring,
	sidebar,
	sidebar_foreground,
	sidebar_primary,
	sidebar_accent,
	sidebar_accent_foreground,
	sidebar_border,
	sidebar_ring,
	scrollbar,
	scrollbar_hover,
	user_bubble,
	user_bubble_foreground,
	user_bubble_tint_ink,
	image_outline,
	shell_border,
	shell_divider,
	rail_item_selected,
	rail_avatar,
	person_avatar,
	bot_avatar_field,
	bot_avatar_ground,
	document_ground,
	on_foreground,
	user_bubble_hover,
	user_bubble_muted_foreground,
	bubble,
	bubble_hover,
	bubble_foreground,
	faint_foreground,
	disabled_foreground,
	waiting_foreground,
	prompt_surface,
	prompt_surface_inert,
	prompt_menu,
	author_line_sticky,
	board_sticky_yellow,
	board_sticky_green,
	board_sticky_pink,
	board_sticky_blue,
	board_sticky_orange,
	board_sticky_foreground,
	board_sticky_author_foreground,
	board_section_blue_surface,
	board_section_blue_border,
	board_section_blue_title_chip,
	board_section_blue_title_foreground,
	board_section_purple_surface,
	board_section_purple_border,
	board_section_purple_title_chip,
	board_section_purple_title_foreground,
	board_surface,
	board_dot,
	board_control,
	board_control_foreground,
	board_control_selected,
	board_selection_bar,
	board_selection_bar_foreground,
	board_foreground,
	board_body_foreground,
	board_muted_foreground,
	board_shape_surface,
	board_shape_border,
	board_move_ghost,
	board_card_surface,
	board_card_border,
	board_card_inset,
	board_card_foreground,
	board_card_soft_foreground,
	board_arrow_marker,
	tab_thumbnail_header,
	selection_toolbar_border,
	selection_toolbar_highlight,
	question_segment_foreground,
];

const USER_BUBBLE_MUTED_STRENGTH: f32 = 0.7;

fn bot_blot_ink() -> Color {
	oklch(0.08, 0.0, 0.0)
}

struct Tint {
	hue: Option<f32>,
	dark: bool,
}

impl Tint {
	fn of(&self, role: Role) -> Option<Color> {
		self.hue.map(|hue| tone(hue, self.dark, role))
	}

	fn or_blue(&self, role: Role) -> Color {
		tone(self.hue.unwrap_or(BLUE), self.dark, role)
	}

	fn blue(&self, role: Role) -> Color {
		tone(BLUE, self.dark, role)
	}
}

impl Tokens {
	pub fn new(dark: bool) -> Tokens {
		Tokens::painted(dark, None)
	}

	pub fn in_space(self, hue: Option<f32>) -> Tokens {
		if hue.is_none() {
			return self;
		}
		Tokens { reduced_motion: self.reduced_motion, ..Tokens::painted(self.dark, hue) }
	}

	fn painted(dark: bool, hue: Option<f32>) -> Tokens {
		let tint = Tint { hue, dark };
		if dark { Tokens::dark(&tint) } else { Tokens::light(&tint) }
	}

	fn light(tint: &Tint) -> Tokens {
		let ink = |alpha: f32| Color::BLACK.alpha(alpha);
		let foreground = srgb(0x0a0a0a);
		let card = srgb(0xffffff);
		let secondary = srgb(0xf2f2f2);
		let muted_foreground = srgb(0x6b6b6b);
		let soft_foreground = srgb(0x404040);
		let warning = oklch(0.64, 0.16, 60.0);
		let primary = tint.or_blue(Role::Accent);
		let user_bubble = tint.of(Role::Bubble).unwrap_or(srgb(0x364f7c));
		let user_bubble_foreground = match tint.hue {
			Some(_) => bytes(hues::bubble_foreground(false)),
			None => srgb(0xffffff),
		};
		let untinted_field = srgb(0x1d3ccd);
		let (conversation_icon, conversation_icon_foreground) = conversation_icon(tint.hue, false);
		Tokens {
			dark: false,
			reduced_motion: false,
			selection: faded(primary, SELECTION_SHARE),
			popover_shadow: ink(0.12),
			background: srgb(0xf5f5f5),
			foreground,
			conversation_icon,
			conversation_icon_foreground,
			conversation_pile_overflow: srgb(0xe5e5e5),
			conversation_pile_overflow_foreground: srgb(0x404040),
			bot_blot_ink: bot_blot_ink(),
			bot_avatar_field_untinted: untinted_field,
			brand_mark_cells: srgb(0xa2b1d0),
			brand_mark_ground: srgb(0xffffff),
			bot_avatar_ink: bot_blot_ink(),
			bot_badge_attention: primary,
			bot_badge_done: oklch(0.68, 0.17, 148.0),
			bot_badge_failed: oklch(0.62, 0.22, 27.0),
			warning,
			warning_foreground: srgb(0xfffffc),
			success: srgb(0x207144),
			state_connected: oklch(0.696, 0.17, 162.48),
			state_needs_authorization: warning,
			presence_online: srgb(0x239f53),
			presence_offline: srgb(0x737373),
			title_bar_tab: ink(0.08),
			title_bar_tab_hover: ink(0.12),
			title_bar_tab_selected: ink(0.16),
			title_bar_pinned: ink(0.08),
			title_bar_chip: ink(0.10),
			title_bar_divider: ink(0.10),
			title_bar_highlight: ink(0.08),
			title_bar_menu: srgb(0xffffff),
			title_bar_menu_border: ink(0.06),
			card,
			card_raised: srgb(0xfafafa),
			popover: srgb(0xffffff),
			popover_foreground: srgb(0x0a0a0a),
			primary,
			primary_foreground: srgb(0xffffff),
			primary_strong: primary,
			secondary,
			secondary_foreground: srgb(0x0a0a0a),
			muted: srgb(0xf2f2f2),
			muted_foreground,
			soft_foreground,
			placeholder_foreground: srgb(0x808080),
			title_placeholder_foreground: srgb(0xa8a8a8),
			sketch_line: srgb(0xe5e5e5),
			sketch_mark: srgb(0xa3a3a3),
			accent: srgb(0xf2f2f2),
			accent_foreground: srgb(0x0a0a0a),
			destructive: oklch(0.49, 0.245, 27.325),
			destructive_tint: srgb(0xfde6e7),
			destructive_tint_foreground: oklch(0.53, 0.216, 27.325),
			window_close: srgb(0xc42b1c),
			mark: faded(primary, 0.4),
			transcript_new_mark: tint.or_blue(Role::NewLine),
			border: srgb(0xe5e5e5),
			question_option_ring: srgb(0x0a0a0a).alpha(0.17),
			input: srgb(0xe5e5e5),
			ring: primary,
			sidebar: srgb(0xf7f7f7),
			sidebar_foreground: srgb(0x0a0a0a),
			sidebar_primary: primary,
			sidebar_accent: srgb(0xf2f2f2),
			sidebar_accent_foreground: srgb(0x0a0a0a),
			sidebar_border: srgb(0xe5e5e5),
			sidebar_ring: primary,
			scrollbar: oklch(0.72, 0.013, 285.938),
			scrollbar_hover: oklch(0.6, 0.014, 285.938),
			user_bubble,
			user_bubble_foreground,
			user_bubble_tint_ink: bot_blot_ink(),
			image_outline: ink(0.08),
			shell_border: ink(0.06),
			shell_divider: ink(0.08),
			rail_item_selected: ink(0.10),
			rail_avatar: srgb(0xe5e5e5),
			person_avatar: srgb(0xe5e5e5),
			bot_avatar_field: tint.of(Role::AvatarInk).unwrap_or(untinted_field),
			bot_avatar_ground: tint
				.of(Role::AvatarGround)
				.unwrap_or_else(|| mix(untinted_field, secondary, 0.25)),
			document_ground: tint.blue(Role::AvatarGround),
			on_foreground: srgb(0xffffff),
			user_bubble_hover: mix(user_bubble, Color::BLACK, 0.92),
			user_bubble_muted_foreground: mix(
				user_bubble_foreground,
				user_bubble,
				USER_BUBBLE_MUTED_STRENGTH,
			),
			bubble: ink(0.03),
			bubble_hover: ink(0.05),
			bubble_foreground: foreground,
			faint_foreground: srgb(0x67676c),
			disabled_foreground: srgb(0xa3a3a8),
			waiting_foreground: srgb(0x8a6400),
			prompt_surface: srgb(0xffffff),
			prompt_surface_inert: srgb(0xf0f0f0),
			prompt_menu: srgb(0xffffff),
			author_line_sticky: srgb(0xf5f5f5),
			board_sticky_yellow: srgb(0xffe58f),
			board_sticky_green: srgb(0xc2ebb4),
			board_sticky_pink: srgb(0xffc9de),
			board_sticky_blue: srgb(0xbcd8ff),
			board_sticky_orange: srgb(0xffd3a8),
			board_sticky_foreground: srgb(0x1a1a1a),
			board_sticky_author_foreground: Color::BLACK.alpha(0.7),
			board_section_blue_surface: srgb(0xeff4fb),
			board_section_blue_border: srgb(0xd5e2f3),
			board_section_blue_title_chip: srgb(0xdae6f6),
			board_section_blue_title_foreground: srgb(0x1f3f6e),
			board_section_purple_surface: srgb(0xf3f0fa),
			board_section_purple_border: srgb(0xe0d8f2),
			board_section_purple_title_chip: srgb(0xe6dff6),
			board_section_purple_title_foreground: srgb(0x45307a),
			board_surface: srgb(0xfafafa),
			board_dot: srgb(0xd4d4d4),
			board_control: card,
			board_control_foreground: soft_foreground,
			board_control_selected: mix(user_bubble, card, 0.12),
			board_selection_bar: srgb(0x1a1a1a),
			board_selection_bar_foreground: srgb(0xffffff),
			board_foreground: srgb(0x1a1a1a),
			board_body_foreground: srgb(0x404040),
			board_muted_foreground: srgb(0x6b6b6b),
			board_shape_surface: srgb(0xffffff),
			board_shape_border: srgb(0x1a1a1a),
			board_move_ghost: srgb(0xa3a3a8),
			board_card_surface: srgb(0xffffff),
			board_card_border: srgb(0xe5e5e5),
			board_card_inset: srgb(0xf2f2f2),
			board_card_foreground: srgb(0x0a0a0a),
			board_card_soft_foreground: srgb(0x404040),
			board_arrow_marker: primary,
			tab_thumbnail_header: srgb(0xf5f5f5),
			selection_toolbar_border: ink(0.08),
			selection_toolbar_highlight: ink(0.06),
			question_segment_foreground: mix(muted_foreground, foreground, 0.9),
		}
	}

	fn dark(tint: &Tint) -> Tokens {
		let ink = |alpha: f32| Color::WHITE.alpha(alpha);
		let foreground = srgb(0xf5f5f5);
		let secondary = srgb(0x262626);
		let muted_foreground = srgb(0xa3a3a3);
		let destructive = oklch(0.81, 0.191, 22.216);
		let on_foreground = srgb(0x0e0e10);
		let primary = tint.or_blue(Role::Accent);
		let untinted_field = srgb(0x75acff);
		let (conversation_icon, conversation_icon_foreground) = conversation_icon(tint.hue, true);
		Tokens {
			dark: true,
			reduced_motion: false,
			selection: faded(primary, SELECTION_SHARE),
			popover_shadow: Color::BLACK.alpha(0.7),
			background: srgb(0x000000),
			foreground,
			conversation_icon,
			conversation_icon_foreground,
			conversation_pile_overflow: srgb(0x333333),
			conversation_pile_overflow_foreground: srgb(0xededed),
			bot_blot_ink: bot_blot_ink(),
			bot_avatar_field_untinted: untinted_field,
			brand_mark_cells: srgb(0xa2b1d0),
			brand_mark_ground: srgb(0xffffff),
			bot_avatar_ink: oklch(0.995, 0.0, 0.0),
			bot_badge_attention: primary,
			bot_badge_done: oklch(0.68, 0.17, 148.0),
			bot_badge_failed: oklch(0.62, 0.22, 27.0),
			warning: oklch(0.76, 0.16, 72.0),
			warning_foreground: srgb(0x1f1400),
			success: srgb(0x5fbf85),
			state_connected: oklch(0.696, 0.17, 162.48),
			state_needs_authorization: srgb(0xe8b04a),
			presence_online: srgb(0x3fb466),
			presence_offline: srgb(0x737373),
			title_bar_tab: ink(0.08),
			title_bar_tab_hover: ink(0.12),
			title_bar_tab_selected: ink(0.16),
			title_bar_pinned: ink(0.08),
			title_bar_chip: ink(0.10),
			title_bar_divider: ink(0.12),
			title_bar_highlight: ink(0.08),
			title_bar_menu: srgb(0x18181a),
			title_bar_menu_border: ink(0.08),
			card: srgb(0x121213),
			card_raised: srgb(0x18181a),
			popover: srgb(0x121213),
			popover_foreground: srgb(0xf5f5f5),
			primary,
			primary_foreground: bot_blot_ink(),
			primary_strong: primary,
			secondary,
			secondary_foreground: srgb(0xf5f5f5),
			muted: srgb(0x262626),
			muted_foreground,
			soft_foreground: srgb(0xd4d4d4),
			placeholder_foreground: srgb(0x737373),
			title_placeholder_foreground: srgb(0x525252),
			sketch_line: srgb(0x333333),
			sketch_mark: srgb(0x737373),
			accent: srgb(0x262626),
			accent_foreground: srgb(0xf5f5f5),
			destructive,
			destructive_tint: srgb(0x2a1a1b),
			destructive_tint_foreground: destructive,
			window_close: srgb(0xc42b1c),
			mark: faded(primary, 0.4),
			transcript_new_mark: tint.or_blue(Role::NewLine),
			border: srgb(0x212224),
			question_option_ring: srgb(0x525252),
			input: ink(0.15),
			ring: primary,
			sidebar: srgb(0x1a1a1a),
			sidebar_foreground: srgb(0xf5f5f5),
			sidebar_primary: primary,
			sidebar_accent: srgb(0x262626),
			sidebar_accent_foreground: srgb(0xf5f5f5),
			sidebar_border: srgb(0x212224),
			sidebar_ring: primary,
			scrollbar: oklch(0.44, 0.008, 286.033),
			scrollbar_hover: oklch(0.55, 0.01, 286.033),
			user_bubble: primary,
			user_bubble_foreground: on_foreground,
			user_bubble_tint_ink: foreground,
			image_outline: ink(0.08),
			shell_border: ink(0.06),
			shell_divider: ink(0.08),
			rail_item_selected: ink(0.12),
			rail_avatar: srgb(0x3a3a3a),
			person_avatar: srgb(0x333333),
			bot_avatar_field: tint.of(Role::AvatarInk).unwrap_or(untinted_field),
			bot_avatar_ground: tint
				.of(Role::AvatarGround)
				.unwrap_or_else(|| mix(untinted_field, secondary, 0.35)),
			document_ground: tint.blue(Role::AvatarGround),
			on_foreground,
			user_bubble_hover: mix(primary, Color::WHITE, 0.88),
			user_bubble_muted_foreground: mix(on_foreground, primary, USER_BUBBLE_MUTED_STRENGTH),
			bubble: ink(0.04),
			bubble_hover: ink(0.06),
			bubble_foreground: srgb(0xececec),
			faint_foreground: srgb(0x8a8a8e),
			disabled_foreground: srgb(0x6b6b70),
			waiting_foreground: srgb(0xf5d88f),
			prompt_surface: srgb(0x1c1c1e),
			prompt_surface_inert: srgb(0x161618),
			prompt_menu: srgb(0x1f1f22),
			author_line_sticky: srgb(0x1e1e1f),
			board_sticky_yellow: srgb(0xffe58f),
			board_sticky_green: srgb(0xc2ebb4),
			board_sticky_pink: srgb(0xffc9de),
			board_sticky_blue: srgb(0xbcd8ff),
			board_sticky_orange: srgb(0xffd3a8),
			board_sticky_foreground: srgb(0x1a1a1a),
			board_sticky_author_foreground: Color::BLACK.alpha(0.7),
			board_section_blue_surface: srgb(0x18202d),
			board_section_blue_border: srgb(0x2a3a55),
			board_section_blue_title_chip: srgb(0x24344f),
			board_section_blue_title_foreground: srgb(0xb4ccf2),
			board_section_purple_surface: srgb(0x1f1b29),
			board_section_purple_border: srgb(0x352d48),
			board_section_purple_title_chip: srgb(0x2f2843),
			board_section_purple_title_foreground: srgb(0xcdbdf5),
			board_surface: srgb(0x161618),
			board_dot: srgb(0x34343a),
			board_control: srgb(0x1e1e20),
			board_control_foreground: srgb(0xc4c4c4),
			board_control_selected: srgb(0x2a2a2d),
			board_selection_bar: srgb(0x2a2a2d),
			board_selection_bar_foreground: srgb(0xffffff),
			board_foreground: srgb(0xededed),
			board_body_foreground: srgb(0xa3a3a3),
			board_muted_foreground: srgb(0x8f8f8f),
			board_shape_surface: srgb(0x1e1e21),
			board_shape_border: srgb(0xe5e5e5),
			board_move_ghost: srgb(0x4a4a50),
			board_card_surface: srgb(0x1e1e20),
			board_card_border: srgb(0x2b2b2e),
			board_card_inset: srgb(0x2b2b2e),
			board_card_foreground: srgb(0xededed),
			board_card_soft_foreground: srgb(0xc4c4c4),
			board_arrow_marker: shifted(primary, -0.28, 0.018),
			tab_thumbnail_header: srgb(0x101011),
			selection_toolbar_border: ink(0.10),
			selection_toolbar_highlight: ink(0.08),
			question_segment_foreground: muted_foreground,
		}
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

pub fn conversation_icon(hue: Option<f32>, dark: bool) -> (Color, Color) {
	match hue {
		Some(hue) => (
			tone(hue, dark, Role::ConversationIcon),
			tone(hue, dark, Role::ConversationIconForeground),
		),
		None if dark => (srgb(0x303030), srgb(0xd4d4d4)),
		None => (srgb(0xe5e5e5), srgb(0x525252)),
	}
}

pub fn tone(hue: f32, dark: bool, role: Role) -> Color {
	bytes(hues::tone(hue, dark, role))
}

pub fn srgb(rgb: u32) -> Color {
	let channel = |shift: u32| srgb_decode(((rgb >> shift) & 0xff) as f32 / 255.0);
	Color { r: channel(16), g: channel(8), b: channel(0), a: 1.0 }
}

fn bytes([r, g, b]: [u8; 3]) -> Color {
	srgb(u32::from(r) << 16 | u32::from(g) << 8 | u32::from(b))
}

fn faded(colour: Color, share: f32) -> Color {
	colour.alpha(colour.a * share)
}

fn mix(first: Color, second: Color, first_share: f32) -> Color {
	let alpha = first.a * first_share + second.a * (1.0 - first_share);
	if alpha == 0.0 {
		return Color::TRANSPARENT;
	}
	let (a, b) = (first.to_oklab(), second.to_oklab());
	let channel = |at: usize| {
		(a[at] * first.a * first_share + b[at] * second.a * (1.0 - first_share)) / alpha
	};
	Color::from_oklab([channel(0), channel(1), channel(2), alpha])
}

fn shifted(colour: Color, lightness: f32, chroma: f32) -> Color {
	let [l, a, b, alpha] = colour.to_oklab();
	oklcha(l + lightness, a.hypot(b) + chroma, b.atan2(a).to_degrees(), alpha)
}
