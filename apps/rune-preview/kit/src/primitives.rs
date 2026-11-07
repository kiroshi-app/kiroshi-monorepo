use rune::{Anim, Color, El, Spring, TextStyle, Transition};

use crate::tokens::Tokens;

pub mod accordion;
pub mod avatar;
pub mod badge;
pub mod button;
pub mod checkbox;
pub mod collapsible;
pub mod context_menu;
pub mod dialog;
pub mod dropdown_menu;
pub mod input;
pub mod input_otp;
pub mod item;
pub mod kbd;
mod menu;
pub mod popover;
pub mod radio_group;
pub mod separator;
pub mod sheet;
pub mod sidebar;
pub mod skeleton;
pub mod slider;
pub mod switch;
pub mod tabs;
pub mod toast;
pub mod toggle;
pub mod toggle_group;
pub mod tooltip;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Interaction {
	#[default]
	Rest,
	Hover,
	Press,
}

pub const DISABLED_OPACITY: f32 = 0.5;
pub const FOCUS_RING_WIDTH: f32 = 3.0;
pub const OVERLAY_SHADOW_Y: f32 = 12.0;
pub const OVERLAY_SHADOW_BLUR: f32 = 28.0;

pub fn tight(style: TextStyle) -> TextStyle {
	TextStyle { line_height: style.size, ..style }
}

pub fn equal_padding(height: f32, content: f32) -> f32 {
	(height - content) / 2.0
}

pub fn focus_ring(t: &Tokens, share: f32) -> Color {
	t.ring.alpha(t.ring.a * share)
}

pub fn instant(control: El) -> El {
	control.motion(Spring::NONE).hover_motion(Anim::INSTANT, Anim::INSTANT)
}

#[derive(Clone, Copy)]
pub struct Paint {
	pub fill: Color,
	pub ink: Color,
	pub hover_fill: Color,
	pub hover_ink: Color,
}

impl Paint {
	pub fn plain(fill: Color, ink: Color) -> Paint {
		Paint { fill, ink, hover_fill: fill, hover_ink: ink }
	}

	pub fn resting(self, interaction: Interaction) -> Paint {
		match interaction {
			Interaction::Rest => self,
			Interaction::Hover | Interaction::Press => {
				Paint { fill: self.hover_fill, ink: self.hover_ink, ..self }
			}
		}
	}

	pub fn apply(self, control: El) -> El {
		let control = control.fill(self.fill);
		let control =
			if self.hover_fill == self.fill { control } else { control.hover(self.hover_fill) };
		instant(control.hover_group())
	}

	pub fn ink(self, part: El) -> El {
		let part = part.color(self.ink);
		if self.hover_ink == self.ink { part } else { part.group_color(self.hover_ink) }
	}
}

pub fn overlay_motion(t: &Tokens, opening: Transition) -> Transition {
	if t.reduced_motion { Transition::none() } else { opening }
}

pub fn popup_motion(t: &Tokens) -> Transition {
	overlay_motion(t, Transition::opacity().combined(Transition::scale(0.95)))
}

pub fn elevated(t: &Tokens, surface: El) -> El {
	surface.shadow(OVERLAY_SHADOW_Y, OVERLAY_SHADOW_BLUR, t.popover_shadow).outline(
		1.0,
		0.0,
		hairline(t),
	)
}

pub fn hairline(t: &Tokens) -> Color {
	t.foreground.alpha(if t.dark { 0.1 } else { 0.05 })
}
