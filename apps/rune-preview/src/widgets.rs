use rune::{El, col, el, text};

use crate::tokens::{self, RADIUS_LG, SPACING, TEXT_COMPACT, TEXT_COMPACT_MEDIUM, Tokens};

pub fn avatar(name: &str, hue: Option<f32>, size: f32) -> El {
	let colours = tokens::avatar_hue(hue);
	let initial: String =
		name.chars().next().map(|first| first.to_uppercase().collect()).unwrap_or_default();
	let initial_style =
		rune::TextStyle { line_height: size * 0.5, ..rune::TextStyle::new(size * 0.42, 600.0) };
	el().size(size, size)
		.radius(size / 2.0)
		.fill(colours.ground)
		.center()
		.child(text(initial).font(initial_style).color(colours.ink))
}

pub fn not_drawn(t: &Tokens, what: &str, source: &str) -> El {
	let mono = rune::TextStyle { family: rune::Family::SystemMono, ..TEXT_COMPACT };
	let mut placeholder = col()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING)
		.radius(RADIUS_LG)
		.fill(t.muted)
		.border(1.0, t.border)
		.child(text(what.to_owned()).font(TEXT_COMPACT_MEDIUM).color(t.muted_foreground));
	if !source.is_empty() {
		placeholder =
			placeholder.child(text(source.to_owned()).font(mono).color(t.faint_foreground).wrap());
	}
	placeholder
}
