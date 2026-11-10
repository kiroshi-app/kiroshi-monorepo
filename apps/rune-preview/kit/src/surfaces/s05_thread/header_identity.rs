use rune::image::Image;
use rune::{Cursor, El, icon, row, text};

use super::fill;
use crate::avatar::{Face, Motion};
use crate::icons;
use crate::primitives::button::ButtonVariant;
use crate::primitives::{FOCUS_RING_WIDTH, Paint, ring_tint};
use crate::strings::{Language, chat};
use crate::surfaces::s01_chrome::{ConnectionStatus, connection_status};
use crate::surfaces::s08_missions::title_badge;
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM_MEDIUM, Tokens};

#[cfg(test)]
mod tests;

const HEIGHT: f32 = SPACING * 9.0;
const AVATAR: f32 = SPACING * 6.0;
const GLYPH: f32 = SPACING * 4.0;

#[derive(Clone, Copy, Debug)]
pub struct HeaderIdentity<'a> {
	pub hue: Option<f32>,
	pub title: Option<&'a str>,
	pub image: Option<&'a Image>,
	pub motion: Motion,
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
	let face = Face { name, hue: identity.hue, image: identity.image, motion: identity.motion };
	let title = identity.title.filter(|title| !title.is_empty());
	let ghost = ButtonVariant::Ghost.paint(t);
	let paint = if identity.is_settings_open {
		Paint { fill: t.muted, hover_fill: t.muted, ..ghost }
	} else {
		ghost
	};
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
		.child(face.draw(AVATAR, t).a11y_hidden())
		.child(
			paint.ink(
				text(name.to_owned())
					.key("header-identity-name")
					.font(TEXT_SM_MEDIUM)
					.truncate()
					.shrink(),
			),
		)
		.children(title.map(|title| title_badge(t, title).key("header-identity-title")))
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
