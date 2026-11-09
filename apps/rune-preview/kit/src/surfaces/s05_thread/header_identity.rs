use rune::{Cursor, El, icon, row, text};

use super::fill;
use crate::avatar::Face;
use crate::icons;
use crate::primitives::button::ButtonVariant;
use crate::primitives::{FOCUS_RING_WIDTH, Interaction, ring_tint};
use crate::strings::{Language, chat};
use crate::surfaces::s01_chrome::{ConnectionStatus, connection_status};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM_MEDIUM, Tokens};

#[cfg(test)]
mod tests;

const HEIGHT: f32 = SPACING * 9.0;
const AVATAR: f32 = SPACING * 6.0;
const GLYPH: f32 = SPACING * 4.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HeaderIdentity<'a> {
	pub hue: Option<f32>,
	pub connection: ConnectionStatus<'a>,
	pub is_settings_open: bool,
}

pub fn header_identity<S: 'static>(
	t: &Tokens,
	language: Language,
	identity: &HeaderIdentity,
	open_settings: impl Fn(&mut S) + 'static,
) -> El {
	let name = identity.connection.name;
	let shown = if identity.is_settings_open { Interaction::Hover } else { Interaction::Rest };
	let paint = ButtonVariant::Ghost.paint(t).resting(shown);
	let button = row()
		.key("header-identity")
		.h(HEIGHT)
		.pl(SPACING * 1.5)
		.pr(SPACING * 2.5)
		.gap(SPACING * 2.0)
		.center_y()
		.shrink()
		.radius(RADIUS_2XL)
		.role("button")
		.label(fill(chat::screen::IDENTITY.text(language), &[("name", name)]))
		.expanded(identity.is_settings_open)
		.child(Face::still(name, identity.hue).draw(AVATAR, t).a11y_hidden())
		.child(
			paint.ink(
				text(name.to_owned())
					.key("header-identity-name")
					.font(TEXT_SM_MEDIUM)
					.truncate()
					.shrink(),
			),
		)
		.child(connection_status(t, language, identity.connection))
		.child(
			icon(&icons::SETTINGS, GLYPH)
				.key("header-identity-settings")
				.color(t.muted_foreground)
				.a11y_hidden(),
		);
	paint
		.apply(button)
		.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
		.on_press(open_settings)
}
