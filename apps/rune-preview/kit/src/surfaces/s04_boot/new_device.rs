use rune::{El, Key as Pressed, TextStyle, col, el, icon, row, text};

use super::device_card::{Device, DeviceCard, device_card};
use super::{Emit, centred, drag_strip, full_window, link, say, status_line};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize};
use crate::primitives::{DISABLED_OPACITY, instant};
use crate::strings::common::devices::new_device;
use crate::strings::{Key, Language};
use crate::tokens::{
	RADIUS_CONTROL, SPACING, TEXT_COMPACT_MEDIUM, TEXT_SM, TEXT_TITLE, Tokens, faded,
};

pub const CODE_LENGTH: usize = 6;
const TABULAR: &str = "'tnum' 1";
const CODE_DIGIT: TextStyle =
	TextStyle { line_height: 28.0, features: TABULAR, ..TextStyle::new(24.0, 500.0) };
const INSET: f32 = SPACING * 6.0;
const GAP: f32 = SPACING * 5.0;
const TILE: f32 = SPACING * 14.0;
const TILE_RADIUS: f32 = SPACING * 4.0;
const TILE_GLYPH: f32 = SPACING * 6.0;
const TINT: f32 = 0.4;
const HEADING_WIDTH: f32 = SPACING * 105.0;
const HEADING_GAP: f32 = SPACING * 2.0;
const CARD_WIDTH: f32 = SPACING * 110.0;
const SLOT: (f32, f32) = (SPACING * 12.0, SPACING * 14.0);
const SLOT_GAP: f32 = SPACING * 2.0;
const ACTIVE_SLOT_EDGE: f32 = 1.5;
const CARET: (f32, f32) = (1.5, SPACING * 6.0);
const PRIMARY_INSET_X: f32 = SPACING * 5.0;
const LINKS_GAP: f32 = SPACING * 5.0;
const LINKS_TOP: f32 = SPACING;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NewDeviceStep {
	Waiting,
	Code,
	Expired,
	Rejected,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NewDeviceEvent {
	UseCode,
	TypeDigit(char),
	EraseDigit,
	ApproveWithCode,
	ResendCode,
	AskAgain,
	SignOut,
	BackToSignIn,
}

pub struct NewDevice<'a> {
	pub step: NewDeviceStep,
	pub email: &'a str,
	pub device: &'a Device<'a>,
	pub code: &'a str,
	pub is_code_focused: bool,
}

impl NewDeviceStep {
	fn words(self) -> (Key, Key) {
		match self {
			NewDeviceStep::Waiting => (new_device::waiting::TITLE, new_device::waiting::BODY),
			NewDeviceStep::Code => (new_device::code::TITLE, new_device::code::BODY),
			NewDeviceStep::Expired => (new_device::expired::TITLE, new_device::expired::BODY),
			NewDeviceStep::Rejected => (new_device::rejected::TITLE, new_device::rejected::BODY),
		}
	}
}

pub fn new_device_screen<S: 'static>(
	t: &Tokens,
	language: Language,
	screen: &NewDevice,
	emit: Emit<S, NewDeviceEvent>,
) -> El {
	let words = |key: Key| key.text(language);
	let (title, body) = screen.step.words();
	let mark = if screen.step == NewDeviceStep::Code { &icons::MAIL } else { &icons::LAPTOP };
	let tile = el()
		.size(TILE, TILE)
		.radius(TILE_RADIUS)
		.fill(faded(t.muted, TINT))
		.center()
		.child(icon(mark, TILE_GLYPH).color(t.foreground).a11y_hidden());
	let heading = col()
		.w_full()
		.max_w(HEADING_WIDTH)
		.gap(HEADING_GAP)
		.items_center()
		.child(
			centred(text(words(title).to_owned()).font(TEXT_TITLE).color(t.foreground))
				.role("heading"),
		)
		.child(centred(
			text(say(body, language, &[("email", screen.email)]))
				.font(TEXT_SM)
				.color(t.muted_foreground),
		));
	let card = || {
		el().w_full().max_w(CARD_WIDTH).child(device_card(
			t,
			&DeviceCard {
				device: screen.device,
				meta: Some(words(new_device::THIS_DEVICE)),
				is_name_strong: false,
			},
		))
	};
	let screen_link = |key: Key, event: NewDeviceEvent| {
		link(t, words(key), TEXT_COMPACT_MEDIUM, t.foreground, emit, event)
	};
	let (middle, links) = match screen.step {
		NewDeviceStep::Waiting => (
			vec![card(), status_line(t, words(new_device::waiting::STATUS))],
			vec![
				screen_link(new_device::NO_OTHER_DEVICE, NewDeviceEvent::UseCode),
				screen_link(new_device::SIGN_OUT, NewDeviceEvent::SignOut),
			],
		),
		NewDeviceStep::Code => (
			vec![
				code_entry(t, words(new_device::code::LABEL), screen, emit),
				approve_with_code(t, words(new_device::code::APPROVE), screen.code, emit),
			],
			vec![
				screen_link(new_device::code::RESEND, NewDeviceEvent::ResendCode),
				screen_link(new_device::SIGN_OUT, NewDeviceEvent::SignOut),
			],
		),
		NewDeviceStep::Expired => (
			vec![
				card(),
				primary(t, words(new_device::expired::ASK_AGAIN))
					.on_press(move |s: &mut S| emit(s, NewDeviceEvent::AskAgain)),
			],
			vec![
				screen_link(new_device::NO_OTHER_DEVICE, NewDeviceEvent::UseCode),
				screen_link(new_device::SIGN_OUT, NewDeviceEvent::SignOut),
			],
		),
		NewDeviceStep::Rejected => (
			vec![card()],
			vec![screen_link(new_device::rejected::BACK_TO_SIGN_IN, NewDeviceEvent::BackToSignIn)],
		),
	};
	let content = col()
		.key("new-device-screen")
		.w_full()
		.padding(INSET)
		.gap(GAP)
		.items_center()
		.child(tile)
		.child(heading)
		.children(middle)
		.child(row().flex_wrap().justify_center().gap(LINKS_GAP).pt(LINKS_TOP).children(links));
	el().w_full().h_full().child(full_window(t, content)).child(drag_strip())
}

fn primary(t: &Tokens, label: &str) -> El {
	Button::new(label).size(ButtonSize::Lg).view(t).px(PRIMARY_INSET_X)
}

fn approve_with_code<S: 'static>(
	t: &Tokens,
	label: &str,
	code: &str,
	emit: Emit<S, NewDeviceEvent>,
) -> El {
	let approve = primary(t, label);
	if code.chars().count() < CODE_LENGTH {
		return approve.opacity(DISABLED_OPACITY);
	}
	approve.on_press(move |s: &mut S| emit(s, NewDeviceEvent::ApproveWithCode))
}

fn code_entry<S: 'static>(
	t: &Tokens,
	label: &str,
	screen: &NewDevice,
	emit: Emit<S, NewDeviceEvent>,
) -> El {
	let digits: Vec<char> = screen.code.chars().collect();
	let active = screen.is_code_focused.then(|| digits.len().min(CODE_LENGTH - 1));
	let slots = (0..CODE_LENGTH).map(|at| {
		let is_active = active == Some(at);
		let mut slot = el()
			.size(SLOT.0, SLOT.1)
			.radius(RADIUS_CONTROL)
			.fill(faded(t.muted, TINT))
			.border(
				if is_active { ACTIVE_SLOT_EDGE } else { 1.0 },
				if is_active { t.ring } else { t.shell_divider },
			)
			.center();
		slot = match digits.get(at) {
			Some(digit) => slot.child(text(digit.to_string()).font(CODE_DIGIT).color(t.foreground)),
			None if is_active => slot.child(el().size(CARET.0, CARET.1).fill(t.foreground)),
			None => slot,
		};
		slot
	});
	instant(
		row()
			.key("new-device-code")
			.gap(SLOT_GAP)
			.role("textbox")
			.label(label)
			.a11y_value(screen.code)
			.focusable(true)
			.no_focus_ring()
			.on_key(move |s: &mut S, pressed: &rune::KeyEvent, _| match &pressed.key {
				Pressed::Text(typed) => match typed.chars().next() {
					Some(digit) if typed.chars().count() == 1 && digit.is_ascii_digit() => {
						emit(s, NewDeviceEvent::TypeDigit(digit));
						true
					}
					_ => false,
				},
				Pressed::Backspace => {
					emit(s, NewDeviceEvent::EraseDigit);
					true
				}
				_ => false,
			})
			.children(slots),
	)
}
