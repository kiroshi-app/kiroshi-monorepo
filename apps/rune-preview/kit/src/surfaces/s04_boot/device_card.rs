use rune::{El, Icon, col, icon, row, text};

use crate::icons;
use crate::tokens::{
	RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, Tokens, faded,
};

const CARD_INSET_X: f32 = SPACING * 3.5;
const CARD_INSET_Y: f32 = SPACING * 3.0;
const CARD_GAP: f32 = SPACING * 3.0;
const CARD_TINT: f32 = 0.4;
const KIND_GLYPH: f32 = SPACING * 5.0;
const FAILURE_GLYPH: f32 = SPACING * 3.5;
const FAILURE_GAP: f32 = SPACING * 1.5;
const FAILURE_GLYPH_DROP: f32 = SPACING * 0.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeviceKind {
	Laptop,
	Phone,
	Desktop,
}

impl DeviceKind {
	fn glyph(self) -> &'static Icon {
		match self {
			DeviceKind::Laptop => &icons::LAPTOP,
			DeviceKind::Phone => &icons::SMARTPHONE,
			DeviceKind::Desktop => &icons::MONITOR,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Device<'a> {
	pub kind: DeviceKind,
	pub name: &'a str,
	pub activity: Option<&'a str>,
}

pub struct DeviceCard<'a> {
	pub device: &'a Device<'a>,
	pub meta: Option<&'a str>,
	pub is_name_strong: bool,
}

pub fn device_card(t: &Tokens, card: &DeviceCard) -> El {
	let device = card.device;
	let name_style = if card.is_name_strong { TEXT_SM_MEDIUM } else { TEXT_SM };
	let mut words = col()
		.grow(1.0)
		.shrink()
		.child(text(device.name.to_owned()).font(name_style).color(t.foreground).wrap_anywhere());
	if let Some(activity) = device.activity {
		words = words.child(
			text(activity.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere(),
		);
	}
	let summary = row()
		.grow(1.0)
		.shrink()
		.gap(CARD_GAP)
		.center_y()
		.child(icon(device.kind.glyph(), KIND_GLYPH).color(t.foreground).a11y_hidden())
		.child(words);
	let mut shown = row()
		.key("device-card")
		.w_full()
		.px(CARD_INSET_X)
		.py(CARD_INSET_Y)
		.gap(CARD_GAP)
		.center_y()
		.radius(RADIUS_XL)
		.fill(faded(t.muted, CARD_TINT))
		.child(summary);
	if let Some(meta) = card.meta {
		shown = shown.child(text(meta.to_owned()).font(TEXT_XS).color(t.muted_foreground));
	}
	shown
}

pub fn device_failure(t: &Tokens, reason: &str) -> El {
	row()
		.w_full()
		.gap(FAILURE_GAP)
		.items_start()
		.role("alert")
		.child(
			icon(&icons::CIRCLE_ALERT, FAILURE_GLYPH)
				.color(t.destructive)
				.mt(FAILURE_GLYPH_DROP)
				.a11y_hidden(),
		)
		.child(text(reason.to_owned()).font(TEXT_COMPACT).color(t.destructive).wrap().shrink())
}
