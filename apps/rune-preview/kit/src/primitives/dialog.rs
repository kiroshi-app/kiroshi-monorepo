use rune::{Color, El, Transition, col, el, row, text};

use super::button::{Button, ButtonSize, ButtonVariant};
use super::{elevated, overlay_motion, popup_motion, tight};
use crate::icons;
use crate::tokens::{SPACING, TEXT_BASE_MEDIUM, TEXT_SM, Tokens};

pub const SCRIM_SHARE: f32 = 0.3;
pub const SCRIM_BLUR: f32 = 8.0;
const RADIUS: f32 = 24.0;
const INSET: f32 = SPACING * 6.0;
const CLOSE_INSET: f32 = SPACING * 4.0;
const MAX_WIDTH: f32 = 448.0;
const CLOSE_LABEL: &str = "Close";

pub struct DialogContent<'a> {
	pub title: &'a str,
	pub description: &'a str,
	pub footer: Vec<El>,
}

pub fn scrim(t: &Tokens) -> El {
	el().absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.fill(Color::BLACK.alpha(SCRIM_SHARE))
		.backdrop_blur(SCRIM_BLUR)
		.transition(overlay_motion(t, Transition::opacity()))
}

pub fn header(t: &Tokens, title: &str, description: &str) -> El {
	col()
		.gap(SPACING * 1.5)
		.child(
			text(title.to_owned())
				.font(tight(TEXT_BASE_MEDIUM))
				.color(t.popover_foreground)
				.role("heading"),
		)
		.child(text(description.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap())
}

pub fn dialog<S: 'static>(
	t: &Tokens,
	content: DialogContent,
	dismiss: impl Fn(&mut S) + Clone + 'static,
) -> El {
	let close = Button::icon(&icons::CLOSE, CLOSE_LABEL)
		.variant(ButtonVariant::Secondary)
		.size(ButtonSize::IconSm)
		.view(t)
		.on_press(dismiss.clone());
	let panel = col()
		.key(format!("dialog-{}", content.title))
		.w_full()
		.max_w(MAX_WIDTH)
		.padding(INSET)
		.gap(INSET)
		.radius(RADIUS)
		.fill(t.popover)
		.role("dialog")
		.label(content.title)
		.transition(popup_motion(t))
		.child(header(t, content.title, content.description))
		.child(row().gap(SPACING * 2.0).justify_end().children(content.footer))
		.child(close.pin(None, Some(CLOSE_INSET), Some(CLOSE_INSET), None));
	el().absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.padding(SPACING * 4.0)
		.center()
		.modal(true, dismiss)
		.child(elevated(t, panel))
}
