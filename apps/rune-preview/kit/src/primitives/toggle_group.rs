use rune::{El, row};

use crate::tokens::SPACING;

pub fn toggle_group(label: &str, items: impl IntoIterator<Item = El>) -> El {
	row().gap(SPACING * 2.0).center_y().role("group").label(label).children(items)
}
