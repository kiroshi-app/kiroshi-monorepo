use rune::{El, col, el, text};

use super::notice::{InlineNotice, NoticeEvent, NoticeRetry, Tone, inline_notice};
use super::{Emit, drag_strip, full_window};
use crate::avatar::{Activity, Face, Motion};
use crate::strings::{Language, common};
use crate::tokens::{SPACING, TEXT_SM, Tokens};

pub const BRAND_NAME: &str = "Kiroshi";
pub const BOOT_MARK: f32 = SPACING * 24.0;
const NOTICE_WIDTH: f32 = SPACING * 96.0;

pub fn boot_screen(t: &Tokens, language: Language, clock_ms: f64) -> El {
	let status = common::boot::STATUS.text(language);
	let thinking = Motion::Running { activity: Activity::Thinking, at_ms: clock_ms };
	let mark =
		Face { name: BRAND_NAME, hue: None, image: None, motion: thinking }.draw(BOOT_MARK, t);
	let content = col().key("app-boot-screen").items_center().child(mark);
	let content = if t.reduced_motion {
		content
			.gap(SPACING * 6.0)
			.child(text(status.to_owned()).font(TEXT_SM).color(t.muted_foreground).role("status"))
	} else {
		content.child(el().role("status").label(status))
	};
	el().w_full().h_full().child(full_window(t, content)).child(drag_strip())
}

pub struct BootFailure<'a> {
	pub title: &'a str,
	pub description: &'a str,
}

pub fn boot_notice<S: 'static>(
	t: &Tokens,
	language: Language,
	failure: &BootFailure,
	emit: Emit<S, NoticeEvent>,
) -> El {
	let notice = InlineNotice {
		tone: Tone::Error,
		title: failure.title,
		description: Some(failure.description),
		retry: Some(NoticeRetry { label: None, busy: false }),
		dismissible: false,
	};
	let content = col()
		.key("app-boot-notice")
		.w_full()
		.padding(SPACING * 6.0)
		.gap(SPACING * 6.0)
		.items_center()
		.child(Face::still(BRAND_NAME, None).draw(BOOT_MARK, t))
		.child(el().w_full().max_w(NOTICE_WIDTH).child(inline_notice(t, language, &notice, emit)));
	el().w_full().h_full().child(full_window(t, content)).child(drag_strip())
}
