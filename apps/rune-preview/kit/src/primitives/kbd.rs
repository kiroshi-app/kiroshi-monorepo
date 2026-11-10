use rune::{El, row, text};

use super::{equal_padding, tight};
use crate::tokens::{RADIUS_LG, SPACING, TEXT_XS_MEDIUM, Tokens};

const HEIGHT: f32 = SPACING * 5.0;

pub fn kbd(t: &Tokens, key: &str) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	row()
		.min_w(HEIGHT)
		.padding(equal_padding(HEIGHT, style.size))
		.gap(SPACING)
		.radius(RADIUS_LG)
		.fill(t.muted)
		.center()
		.label(key)
		.child(text(key.to_owned()).font(style).color(t.muted_foreground))
}

pub fn kbd_group(keys: impl IntoIterator<Item = El>) -> El {
	row().gap(SPACING).center_y().children(keys)
}
