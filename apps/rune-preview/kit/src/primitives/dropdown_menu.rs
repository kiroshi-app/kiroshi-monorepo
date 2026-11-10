use rune::El;

pub use super::menu::{Mark, MenuItem, MenuRow, Shortcut};
use crate::tokens::{SPACING, Tokens};

const MIN_WIDTH: f32 = SPACING * 32.0;

pub fn dropdown_menu<'a>(
	t: &Tokens,
	label: &str,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
) -> El {
	super::menu::panel(t, label, MIN_WIDTH, None, rows)
}

pub fn wired_dropdown_menu<'a>(
	t: &Tokens,
	label: &str,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
	wire: impl Fn(usize, El) -> El,
) -> El {
	super::menu::wired_panel(t, label, MIN_WIDTH, None, rows, wire)
}
