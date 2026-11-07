use rune::{Align, El, Side, col, text};

use super::{elevated, popup_motion, tight};
use crate::tokens::{RADIUS_3XL, SPACING, TEXT_BASE_MEDIUM, TEXT_SM, Tokens};

const WIDTH: f32 = SPACING * 72.0;
const INSET: f32 = SPACING * 4.0;
pub const SIDE_OFFSET: f32 = SPACING;

pub fn popover(t: &Tokens, anchor: &str, title: &str, description: Option<&str>) -> El {
	let mut header = col()
		.gap(SPACING)
		.child(text(title.to_owned()).font(tight(TEXT_BASE_MEDIUM)).color(t.popover_foreground));
	if let Some(description) = description {
		header = header
			.child(text(description.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap());
	}
	let panel = col()
		.key(format!("popover-{title}"))
		.w(WIDTH)
		.padding(INSET)
		.gap(INSET)
		.radius(RADIUS_3XL)
		.fill(t.popover)
		.role("dialog")
		.label(title)
		.transition(popup_motion(t))
		.child(header);
	elevated(t, panel).anchored(anchor, Side::Bottom, Align::Center, SIDE_OFFSET)
}
