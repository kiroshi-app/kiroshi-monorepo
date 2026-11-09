use rune::{Color, El, TextStyle, Transition, col, el, row, text};

use super::device_card::{Device, DeviceCard, device_card, device_failure};
use super::{Emit, say};
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::{DISABLED_OPACITY, elevated, overlay_motion, popup_motion};
use crate::strings::Language;
use crate::strings::common::devices::approval;
use crate::tokens::{SPACING, TEXT_SM, Tokens};

const WIDTH: f32 = SPACING * 110.0;
const INSET: f32 = SPACING * 6.0;
const GAP: f32 = SPACING * 4.5;
const HEADER_GAP: f32 = SPACING * 1.5;
const ACTIONS_GAP: f32 = SPACING * 2.0;
const RADIUS: f32 = SPACING * 5.0;
const OUTLINE_INSET_X: f32 = SPACING * 4.0;
const PRIMARY_INSET_X: f32 = SPACING * 5.0;
const BACKDROP_SHARE: f32 = 0.5;
const BUSY_OPACITY: f32 = 0.7;
const TITLE: TextStyle = TextStyle { line_height: 24.0, ..TextStyle::new(17.0, 600.0) };

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ApprovalStatus {
	#[default]
	Asking,
	Approving,
	Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApprovalEvent {
	Approve,
	Reject,
}

pub fn device_approval_dialog<S: 'static>(
	t: &Tokens,
	language: Language,
	device: &Device,
	status: ApprovalStatus,
	emit: Emit<S, ApprovalEvent>,
) -> El {
	let named = [("device", device.name)];
	let title = say(approval::TITLE, language, &named);
	let body = approval::BODY.text(language);
	let is_approving = status == ApprovalStatus::Approving;
	let primary_label = match status {
		ApprovalStatus::Asking => approval::APPROVE,
		ApprovalStatus::Approving => approval::APPROVING,
		ApprovalStatus::Failed => approval::RETRY,
	}
	.text(language);
	let not_me = Button::new(approval::NOT_ME.text(language))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Lg)
		.view(t)
		.px(OUTLINE_INSET_X);
	let primary = Button::new(primary_label)
		.size(ButtonSize::Lg)
		.view(t)
		.key("device-approval-primary")
		.px(PRIMARY_INSET_X);
	let actions = if is_approving {
		[held(not_me, DISABLED_OPACITY), held(primary, BUSY_OPACITY)]
	} else {
		[
			not_me.on_press(move |s: &mut S| emit(s, ApprovalEvent::Reject)),
			primary.on_press(move |s: &mut S| emit(s, ApprovalEvent::Approve)),
		]
	};
	let mut panel = col()
		.key("device-approval-dialog")
		.w_full()
		.max_w(WIDTH)
		.padding(INSET)
		.gap(GAP)
		.radius(RADIUS)
		.fill(t.popover)
		.role("alertdialog")
		.label(title.clone())
		.description(body)
		.transition(popup_motion(t))
		.child(
			col()
				.w_full()
				.gap(HEADER_GAP)
				.child(text(title).font(TITLE).color(t.foreground).wrap_anywhere().role("heading"))
				.child(text(body.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap()),
		)
		.child(device_card(t, &DeviceCard { device, meta: None, is_name_strong: true }));
	if status == ApprovalStatus::Failed {
		panel = panel.child(device_failure(t, &say(approval::FAILED, language, &named)));
	}
	panel = panel.child(row().w_full().gap(ACTIONS_GAP).justify_end().children(actions));
	el().absolute(0.0, 0.0).w_full().h_full().child(backdrop(t)).child(
		el().w_full()
			.h_full()
			.padding(INSET)
			.center()
			.modal(false, |_: &mut S| {})
			.child(elevated(t, panel)),
	)
}

fn held(action: El, opacity: f32) -> El {
	action.opacity(opacity).a11y_value("busy")
}

fn backdrop(t: &Tokens) -> El {
	el().absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.fill(Color::BLACK.alpha(BACKDROP_SHARE))
		.transition(overlay_motion(t, Transition::opacity()))
		.a11y_hidden()
}
