use rune::{Align, El, Side, col, el, text};

use super::{equal_padding, popup_motion, tight};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_XS, Tokens};

const MAX_WIDTH: f32 = 320.0;
const HEIGHT: f32 = SPACING * 7.0;
const ARROW: f32 = SPACING * 2.5;
const ARROW_RADIUS: f32 = 2.0;
pub const SIDE_OFFSET: f32 = SPACING;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TooltipSide {
	#[default]
	Top,
	Bottom,
}

pub fn tooltip(t: &Tokens, anchor: &str, label: &str, side: TooltipSide) -> El {
	let style = tight(TEXT_XS);
	let bubble = text(label.to_owned())
		.font(style)
		.color(t.background)
		.wrap()
		.max_w(MAX_WIDTH)
		.padding(equal_padding(HEIGHT, style.size))
		.radius(RADIUS_XL)
		.fill(t.foreground);
	let arrow = el()
		.size(ARROW, ARROW)
		.radius(ARROW_RADIUS)
		.fill(t.foreground)
		.rotate(std::f32::consts::FRAC_PI_4)
		.self_center();
	let (layout, rune_side) = match side {
		TooltipSide::Top => (col().child(bubble).child(arrow.mt(-ARROW / 2.0)), Side::Top),
		TooltipSide::Bottom => (col().child(arrow.mb(-ARROW / 2.0)).child(bubble), Side::Bottom),
	};
	layout
		.key(format!("tooltip-{label}"))
		.role("tooltip")
		.label(label)
		.transition(popup_motion(t))
		.anchored(anchor, rune_side, Align::Center, SIDE_OFFSET)
}
