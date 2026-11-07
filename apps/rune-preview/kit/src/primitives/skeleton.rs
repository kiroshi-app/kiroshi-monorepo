use rune::{Cycle, El, el};

use crate::tokens::{RADIUS_2XL, Tokens};

const PULSE: Cycle = Cycle {
	period: 2.0,
	phase: 0.0,
	stops: &[(0.0, 1.0), (0.5, 0.5), (1.0, 1.0)],
	still: 1.0,
	fps: 30.0,
};

pub fn skeleton(t: &Tokens) -> El {
	let block = el().radius(RADIUS_2XL).fill(t.muted).a11y_hidden();
	if t.reduced_motion { block } else { block.cycle(PULSE) }
}
