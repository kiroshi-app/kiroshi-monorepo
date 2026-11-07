use rune::{El, Transition, col};

use super::{OVERLAY_SHADOW_BLUR, OVERLAY_SHADOW_Y, overlay_motion};
use crate::tokens::{SPACING, Tokens};

pub const DRAWER_WIDTH: f32 = SPACING * 72.0;
const TRAVEL: f32 = SPACING * 10.0;

pub fn sheet<S: 'static>(
	t: &Tokens,
	label: &str,
	body: El,
	dismiss: impl Fn(&mut S) + 'static,
) -> El {
	col()
		.key(format!("sheet-{label}"))
		.absolute(0.0, 0.0)
		.w(DRAWER_WIDTH)
		.h_full()
		.fill(t.sidebar)
		.border(1.0, t.border)
		.shadow(OVERLAY_SHADOW_Y, OVERLAY_SHADOW_BLUR, t.popover_shadow)
		.role("dialog")
		.label(label)
		.modal(true, dismiss)
		.transition(overlay_motion(
			t,
			Transition::offset(-TRAVEL, 0.0).combined(Transition::opacity()),
		))
		.child(body)
}
