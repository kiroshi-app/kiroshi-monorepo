use rune::El;

pub use super::menu::{COMMAND, Mark, MenuItem, MenuRow, Shortcut};
use crate::tokens::{SPACING, Tokens};

const MIN_WIDTH: f32 = SPACING * 36.0;
const SUBMENU_MIN_WIDTH: f32 = SPACING * 24.0;

pub fn context_menu<'a>(
	t: &Tokens,
	label: &str,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
) -> El {
	super::menu::panel(t, label, MIN_WIDTH, None, rows)
}

pub fn context_menu_narrow<'a>(
	t: &Tokens,
	label: &str,
	max_width: f32,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
) -> El {
	super::menu::panel(t, label, MIN_WIDTH, Some(max_width), rows)
}

pub fn submenu<'a>(t: &Tokens, label: &str, rows: impl IntoIterator<Item = MenuRow<'a>>) -> El {
	super::menu::panel(t, label, SUBMENU_MIN_WIDTH, None, rows)
}

pub fn wired_context_menu<'a>(
	t: &Tokens,
	label: &str,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
	wire: impl Fn(usize, El) -> El,
) -> El {
	super::menu::wired_panel(t, label, MIN_WIDTH, None, rows, wire)
}

pub fn wired_submenu<'a>(
	t: &Tokens,
	label: &str,
	rows: impl IntoIterator<Item = MenuRow<'a>>,
	wire: impl Fn(usize, El) -> El,
) -> El {
	super::menu::wired_panel(t, label, SUBMENU_MIN_WIDTH, None, rows, wire)
}
