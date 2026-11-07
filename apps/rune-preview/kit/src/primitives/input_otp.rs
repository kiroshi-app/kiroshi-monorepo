use rune::{El, el, row, text};

use super::{FOCUS_RING_WIDTH, focus_ring, instant, tight};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM, Tokens, faded};

const SLOT: f32 = SPACING * 8.0;
const CARET: f32 = SPACING * 4.0;

pub fn input_otp(t: &Tokens, label: &str, typed: &str, slots: usize, focused: bool) -> El {
	let digits: Vec<char> = typed.chars().collect();
	let active = focused.then_some(digits.len()).filter(|at| *at < slots);
	let group = row().key(format!("otp-{label}")).role("textbox").label(label).a11y_value(typed);
	instant(group.focusable(true).focus_ring(FOCUS_RING_WIDTH, 0.0, focus_ring(t, 0.3)).children(
		(0..slots).map(|at| {
			let first = if at == 0 { RADIUS_2XL } else { 0.0 };
			let last = if at + 1 == slots { RADIUS_2XL } else { 0.0 };
			let mut slot = el()
				.size(SLOT, SLOT)
				.corners([first, last, last, first])
				.fill(faded(t.input, 0.5))
				.border(1.0, t.input)
				.center();
			if at > 0 {
				slot = slot.ml(-1.0);
			}
			if let Some(digit) = digits.get(at) {
				slot = slot.child(text(digit.to_string()).font(tight(TEXT_SM)).color(t.foreground));
			}
			if active == Some(at) {
				slot = slot
					.border(1.0, t.ring)
					.outline(FOCUS_RING_WIDTH, 0.0, focus_ring(t, 0.3))
					.child(el().w(1.0).h(CARET).fill(t.foreground));
			}
			slot
		}),
	))
}
