use rune::{Cursor, El, Icon, col, el, icon, row, spacer, text};

use super::{DISABLED_OPACITY, elevated, equal_padding, instant, popup_motion, tight};
use crate::icons;
use crate::tokens::{RADIUS_2XL, RADIUS_XL, SPACING, TEXT_SM, TEXT_XS, Tokens, faded};

pub static COMMAND: Icon = Icon {
	name: "kit-command",
	view: 24.0,
	body: r#"<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" fill="none" stroke="currentColor" stroke-width="2.16" stroke-linecap="round" stroke-linejoin="round"></path>"#,
};

const ROW_HEIGHT: f32 = SPACING * 7.0;
const GLYPH: f32 = SPACING * 3.5;
const INDICATOR: f32 = SPACING * 4.0;
const SHORTCUT_GLYPH: f32 = SPACING * 3.0;
const ITEM_RING: f32 = 2.0;
const SHORTCUT_TRACKING: f32 = 0.1;

#[derive(Clone, Copy, Debug)]
pub struct Shortcut<'a> {
	pub command: bool,
	pub key: &'a str,
}

#[derive(Clone, Copy, Debug)]
pub enum Mark {
	None,
	Check(bool),
	Radio(bool),
	Submenu,
}

#[derive(Clone, Copy, Debug)]
pub struct MenuItem<'a> {
	pub label: &'a str,
	pub glyph: Option<&'static Icon>,
	pub shortcut: Option<Shortcut<'a>>,
	pub mark: Mark,
	pub destructive: bool,
	pub disabled: bool,
	pub highlighted: bool,
}

impl<'a> MenuItem<'a> {
	pub fn new(label: &'a str) -> MenuItem<'a> {
		MenuItem {
			label,
			glyph: None,
			shortcut: None,
			mark: Mark::None,
			destructive: false,
			disabled: false,
			highlighted: false,
		}
	}

	pub fn glyph(self, glyph: &'static Icon) -> MenuItem<'a> {
		MenuItem { glyph: Some(glyph), ..self }
	}

	pub fn shortcut(self, shortcut: Shortcut<'a>) -> MenuItem<'a> {
		MenuItem { shortcut: Some(shortcut), ..self }
	}

	pub fn mark(self, mark: Mark) -> MenuItem<'a> {
		MenuItem { mark, ..self }
	}

	pub fn destructive(self) -> MenuItem<'a> {
		MenuItem { destructive: true, ..self }
	}

	pub fn disabled(self) -> MenuItem<'a> {
		MenuItem { disabled: true, ..self }
	}

	pub fn highlighted(self, highlighted: bool) -> MenuItem<'a> {
		MenuItem { highlighted, ..self }
	}
}

#[derive(Clone, Copy, Debug)]
pub enum MenuRow<'a> {
	Item(MenuItem<'a>),
	Label(&'a str),
	Separator,
}

pub fn panel<'a>(
	t: &Tokens,
	label: &str,
	min_width: f32,
	max_width: Option<f32>,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
) -> El {
	let panel = col()
		.key(format!("menu-{label}"))
		.min_w(min_width)
		.items_stretch()
		.padding(SPACING)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.role("menu")
		.label(label)
		.focus_group()
		.transition(popup_motion(t))
		.children(rows.into_iter().map(|menu_row| match menu_row {
			MenuRow::Item(item) => item_row(t, item, max_width.is_some()),
			MenuRow::Label(text_label) => label_row(t, text_label),
			MenuRow::Separator => {
				el().h(1.0).fill(faded(t.border, 0.5)).my(SPACING).role("separator")
			}
		}));
	let panel = match max_width {
		Some(width) => panel.max_w(width),
		None => panel,
	};
	elevated(t, panel)
}

fn label_row(t: &Tokens, label: &str) -> El {
	let style = tight(TEXT_XS);
	row()
		.padding(equal_padding(SPACING * 6.0, style.size))
		.child(text(label.to_owned()).font(style).color(t.muted_foreground))
}

fn item_row(t: &Tokens, item: MenuItem, truncates: bool) -> El {
	let style = tight(TEXT_SM);
	let (rest_ink, highlight_fill, highlight_ink) = if item.destructive {
		(t.destructive, faded(t.destructive, if t.dark { 0.2 } else { 0.1 }), t.destructive)
	} else {
		(t.popover_foreground, t.accent, t.accent_foreground)
	};
	let ink = if item.highlighted { highlight_ink } else { rest_ink };
	let role = match item.mark {
		Mark::Check(_) => "menuitemcheckbox",
		Mark::Radio(_) => "menuitemradio",
		Mark::None | Mark::Submenu => "menuitem",
	};
	let mut menu_row = row()
		.key(format!("menu-item-{}", item.label))
		.padding(equal_padding(ROW_HEIGHT, style.size))
		.gap(SPACING * 2.0)
		.radius(RADIUS_XL)
		.center_y()
		.role(role)
		.label(item.label);
	if let Some(glyph) = item.glyph {
		menu_row = menu_row.child(icon(glyph, GLYPH).color(ink).group_color(highlight_ink));
	}
	let label = text(item.label.to_owned()).font(style).color(ink).group_color(highlight_ink);
	menu_row =
		menu_row.child(if truncates { label.truncate().shrink() } else { label }).child(spacer());
	if let Some(shortcut) = item.shortcut {
		menu_row = menu_row.child(shortcut_view(t, shortcut, item.highlighted));
	}
	menu_row = match item.mark {
		Mark::Check(checked) | Mark::Radio(checked) => {
			let indicator = el().size(INDICATOR, INDICATOR).center();
			let indicator = if checked {
				indicator.child(icon(&icons::CHECK, INDICATOR).color(ink))
			} else {
				indicator
			};
			menu_row.checked(checked).child(indicator)
		}
		Mark::Submenu => menu_row.child(icon(&icons::CHEVRON_RIGHT, INDICATOR).color(ink)),
		Mark::None => menu_row,
	};
	if item.highlighted {
		menu_row = menu_row.fill(highlight_fill);
	}
	let menu_row = instant(menu_row.hover_group());
	if item.disabled {
		return menu_row.disabled(true).opacity(DISABLED_OPACITY);
	}
	menu_row
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_highlight(highlight_fill)
		.focus_ring(ITEM_RING, -ITEM_RING, t.ring)
}

fn shortcut_view(t: &Tokens, shortcut: Shortcut, highlighted: bool) -> El {
	let ink = if highlighted { t.accent_foreground } else { t.muted_foreground };
	let style = rune::TextStyle { tracking: SHORTCUT_TRACKING * TEXT_XS.size, ..tight(TEXT_XS) };
	let mut keys = row().gap(SPACING * 0.5).center_y().ml(SPACING * 2.0);
	if shortcut.command {
		keys =
			keys.child(icon(&COMMAND, SHORTCUT_GLYPH).color(ink).group_color(t.accent_foreground));
	}
	keys.child(
		text(shortcut.key.to_owned()).font(style).color(ink).group_color(t.accent_foreground),
	)
}
