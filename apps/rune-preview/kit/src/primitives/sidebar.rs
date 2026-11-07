use rune::{Cursor, El, Icon, col, el, icon, row, text};

use super::button::{Button, ButtonSize, ButtonVariant};
use super::{FOCUS_RING_WIDTH, Paint, equal_padding, focus_ring, tight};
use crate::icons;
use crate::tokens::{RADIUS_XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS_MEDIUM, Tokens, faded};

pub const WIDTH: f32 = SPACING * 64.0;
const SECTION_INSET: f32 = SPACING * 2.0;
const ROW_HEIGHT: f32 = SPACING * 8.0;
const GLYPH: f32 = SPACING * 4.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SidebarSide {
	#[default]
	Left,
	Right,
}

pub fn sidebar(
	t: &Tokens,
	label: &str,
	side: SidebarSide,
	sections: impl IntoIterator<Item = El>,
) -> El {
	let edge = el().w(1.0).h_full().fill(t.sidebar_border);
	let panel = col()
		.key(format!("sidebar-{label}"))
		.w(WIDTH)
		.h_full()
		.fill(t.sidebar)
		.role("complementary")
		.label(label)
		.children(
			sections
				.into_iter()
				.map(|section| section.w_full().padding(SECTION_INSET).gap(SPACING * 2.0)),
		);
	match side {
		SidebarSide::Left => row().h_full().child(panel).child(edge),
		SidebarSide::Right => row().h_full().child(edge).child(panel),
	}
}

pub fn trigger(t: &Tokens, label: &str) -> El {
	Button::icon(&icons::PANEL_LEFT, label)
		.variant(ButtonVariant::Ghost)
		.size(ButtonSize::IconSm)
		.view(t)
}

pub fn group(t: &Tokens, label: &str, rows: impl IntoIterator<Item = El>) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	col()
		.role("group")
		.label(label)
		.child(
			row()
				.padding(equal_padding(ROW_HEIGHT, style.size))
				.child(text(label.to_owned()).font(style).color(faded(t.sidebar_foreground, 0.7))),
		)
		.child(col().gap(SPACING * 0.5).children(rows))
}

pub fn menu_button(t: &Tokens, glyph: &'static Icon, label: &str, active: bool) -> El {
	let clear = t.sidebar.alpha(0.0);
	let paint = Paint {
		fill: if active { t.sidebar_accent } else { clear },
		ink: if active { t.sidebar_accent_foreground } else { t.sidebar_foreground },
		hover_fill: t.sidebar_accent,
		hover_ink: t.sidebar_accent_foreground,
	};
	let style = tight(if active { TEXT_SM_MEDIUM } else { TEXT_SM });
	let button = row()
		.key(format!("sidebar-row-{label}"))
		.w_full()
		.padding(equal_padding(ROW_HEIGHT, GLYPH))
		.gap(SPACING * 2.0)
		.radius(RADIUS_XL)
		.center_y()
		.role("button")
		.label(label)
		.child(paint.ink(icon(glyph, GLYPH)))
		.child(paint.ink(text(label.to_owned()).font(style).truncate()));
	paint.apply(button).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		focus_ring(t, 0.3),
	)
}

pub fn inset(t: &Tokens, body: El) -> El {
	col().grow(1.0).h_full().fill(t.background).child(body)
}
