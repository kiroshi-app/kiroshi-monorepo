use rune::{El, row, text};

use super::{Paint, equal_padding, tight};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_XS_MEDIUM, Tokens, faded};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BadgeVariant {
	#[default]
	Default,
	Secondary,
	Destructive,
	Outline,
	Ghost,
	Link,
}

impl BadgeVariant {
	pub const ALL: [BadgeVariant; 6] = [
		BadgeVariant::Default,
		BadgeVariant::Secondary,
		BadgeVariant::Destructive,
		BadgeVariant::Outline,
		BadgeVariant::Ghost,
		BadgeVariant::Link,
	];

	pub fn name(self) -> &'static str {
		match self {
			BadgeVariant::Default => "default",
			BadgeVariant::Secondary => "secondary",
			BadgeVariant::Destructive => "destructive",
			BadgeVariant::Outline => "outline",
			BadgeVariant::Ghost => "ghost",
			BadgeVariant::Link => "link",
		}
	}

	fn paint(self, t: &Tokens) -> Paint {
		let clear = t.background.alpha(0.0);
		match self {
			BadgeVariant::Default => Paint::plain(t.primary, t.primary_foreground),
			BadgeVariant::Secondary => Paint::plain(t.secondary, t.secondary_foreground),
			BadgeVariant::Destructive => {
				Paint::plain(faded(t.destructive, if t.dark { 0.2 } else { 0.1 }), t.destructive)
			}
			BadgeVariant::Outline => Paint::plain(clear, t.foreground),
			BadgeVariant::Ghost => Paint::plain(clear, t.foreground),
			BadgeVariant::Link => Paint::plain(clear, t.primary),
		}
	}
}

const HEIGHT: f32 = SPACING * 5.0;

pub fn badge(t: &Tokens, label: &str, variant: BadgeVariant) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	let paint = variant.paint(t);
	let mut badge = row()
		.padding(equal_padding(HEIGHT, style.size))
		.gap(SPACING)
		.radius(RADIUS_2XL)
		.center()
		.label(label)
		.child(paint.ink(text(label.to_owned()).font(style)));
	if variant == BadgeVariant::Outline {
		badge = badge.border(1.0, t.border);
	}
	paint.apply(badge)
}
