use rune::{El, el};

use crate::tokens::Tokens;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Orientation {
	#[default]
	Horizontal,
	Vertical,
}

pub fn separator(t: &Tokens, orientation: Orientation) -> El {
	let line = el().fill(t.border);
	match orientation {
		Orientation::Horizontal => line.w_full().h(1.0),
		Orientation::Vertical => line.w(1.0).self_stretch(),
	}
}
