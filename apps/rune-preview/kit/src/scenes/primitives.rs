use rune::{El, col, text};

use super::{SceneState, line, stage};
use crate::icons;
use crate::primitives::Interaction;
use crate::primitives::accordion::{Section, accordion};
use crate::primitives::avatar::{Avatar, AvatarSize, avatar_count, avatar_group};
use crate::primitives::badge::{BadgeVariant, badge};
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::collapsible::collapsible;
use crate::primitives::item::{Item, ItemMedia, ItemSize, ItemVariant};
use crate::primitives::kbd::{kbd, kbd_group};
use crate::primitives::separator::{Orientation, separator};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_SM, Tokens};

const SECTIONS: [(&str, &str); 3] = [
	("Shipping", "Orders leave the warehouse within two days."),
	("Returns", "Send an item back within thirty days of delivery."),
	("Warranty", "Every product is covered for one full year."),
];
const ACCORDION_WIDTH: f32 = 400.0;
const NAME: &str = "Ada Martin";
const INITIALS: &str = "AM";
const ITEM_COLUMN: f32 = SPACING * 96.0;
const SEPARATOR_PANEL: f32 = SPACING * 72.0;

fn sections(t: &Tokens, open: Option<&str>) -> El {
	col().w(ACCORDION_WIDTH).child(accordion(
		t,
		SECTIONS.map(|(title, body)| Section { title, body, open: open == Some(title) }),
	))
}

pub(super) fn accordion_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, sections(t, None))
}

pub(super) fn accordion_one_open(t: &Tokens, _: &SceneState) -> El {
	stage(t, sections(t, Some("Returns")))
}

fn person(initials: &str) -> Avatar<'_> {
	Avatar { name: NAME, initials, image: None, size: AvatarSize::Default, badge: false }
}

pub(super) fn avatar_default(t: &Tokens, s: &SceneState) -> El {
	stage(t, Avatar { image: s.picture.as_ref(), ..person(INITIALS) }.view(t))
}

pub(super) fn avatar_empty(t: &Tokens, _: &SceneState) -> El {
	stage(t, person(INITIALS).view(t))
}

pub(super) fn avatar_with_badge(t: &Tokens, _: &SceneState) -> El {
	stage(t, Avatar { badge: true, ..person(INITIALS) }.view(t))
}

pub(super) fn avatar_in_group(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		avatar_group(
			t,
			[
				person(INITIALS).view(t),
				person("LR").view(t),
				avatar_count(t, "+3", AvatarSize::Default),
			],
		),
	)
}

pub(super) fn badge_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, badge(t, "Badge", BadgeVariant::Default))
}

pub(super) fn badge_variants(t: &Tokens, _: &SceneState) -> El {
	stage(t, line(BadgeVariant::ALL.map(|variant| badge(t, variant.name(), variant))))
}

pub(super) fn badge_long_content(t: &Tokens, _: &SceneState) -> El {
	stage(t, badge(t, "Waiting on the release manager", BadgeVariant::Default))
}

pub(super) fn button_playground(t: &Tokens, _: &SceneState) -> El {
	stage(t, Button::new("Button").view(t))
}

pub(super) fn button_variants(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		line(
			ButtonVariant::ALL.map(|variant| Button::new(variant.name()).variant(variant).view(t)),
		),
	)
}

pub(super) fn button_sizes(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		col()
			.gap(SPACING * 4.0)
			.child(line(
				ButtonSize::LABELLED.map(|size| Button::new(size.name()).size(size).view(t)),
			))
			.child(line(
				ButtonSize::ICON
					.map(|size| Button::icon(&icons::PLUS, size.name()).size(size).view(t)),
			)),
	)
}

pub(super) fn button_states(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		line([
			Button::new("Default").view(t),
			Button::new("Hover").interaction(Interaction::Hover).view(t),
			Button::new("Focus").view(t),
			Button::new("Active").interaction(Interaction::Press).view(t),
			Button::new("Disabled").disabled(true).view(t),
		]),
	)
}

pub(super) fn button_with_icons(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		line([
			Button::new("Create").leading(&icons::PLUS).view(t),
			Button::new("Continue").variant(ButtonVariant::Outline).trailing(&icons::NEXT).view(t),
			Button::new("Delete").variant(ButtonVariant::Destructive).leading(&icons::BIN).view(t),
			Button::icon(&icons::SETTINGS, "Settings").variant(ButtonVariant::Ghost).view(t),
		]),
	)
}

pub(super) fn collapsible_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, collapsible(t, "Shipping", "Orders leave the warehouse within two days.", true))
}

fn column(items: impl IntoIterator<Item = El>) -> El {
	col().w(ITEM_COLUMN).gap(SPACING * 3.0).children(items)
}

pub(super) fn item_default(t: &Tokens, _: &SceneState) -> El {
	let open = Button::new("Open").variant(ButtonVariant::Outline).size(ButtonSize::Sm).view(t);
	stage(
		t,
		column([Item {
			description: Some("Sent to the team every Monday at nine."),
			media: Some(ItemMedia::Glyph(&icons::SETTINGS)),
			actions: Some(open),
			variant: ItemVariant::Outline,
			..Item::new("Weekly report")
		}
		.view(t)]),
	)
}

pub(super) fn item_variants(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		column(
			ItemVariant::ALL.map(|variant| Item { variant, ..Item::new(variant.name()) }.view(t)),
		),
	)
}

pub(super) fn item_sizes(t: &Tokens, s: &SceneState) -> El {
	stage(
		t,
		column(ItemSize::ALL.map(|size| {
			Item {
				media: s.picture.as_ref().map(ItemMedia::Picture),
				variant: ItemVariant::Outline,
				size,
				..Item::new(size.name())
			}
			.view(t)
		})),
	)
}

pub(super) fn item_media_variants(t: &Tokens, s: &SceneState) -> El {
	let media = [
		("default", Some(ItemMedia::Glyph(&icons::SETTINGS))),
		("icon", Some(ItemMedia::Glyph(&icons::SETTINGS))),
		("image", s.picture.as_ref().map(ItemMedia::Picture)),
	];
	stage(
		t,
		column(media.map(|(title, media)| {
			Item { media, variant: ItemVariant::Outline, ..Item::new(title) }.view(t)
		})),
	)
}

pub(super) fn kbd_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, kbd(t, "K"))
}

pub(super) fn kbd_long_content(t: &Tokens, _: &SceneState) -> El {
	stage(t, kbd(t, "Shift"))
}

pub(super) fn kbd_in_group(t: &Tokens, _: &SceneState) -> El {
	stage(t, line([kbd_group([kbd(t, "Ctrl"), kbd(t, "K")])]))
}

pub(super) fn separator_default(t: &Tokens, _: &SceneState) -> El {
	let note = |words: &str| text(words.to_owned()).font(TEXT_SM).color(t.muted_foreground);
	stage(
		t,
		col()
			.w(SEPARATOR_PANEL)
			.padding(SPACING * 4.0)
			.gap(SPACING * 3.0)
			.radius(RADIUS_XL)
			.border(1.0, t.border)
			.child(note("Everything the space holds"))
			.child(separator(t, Orientation::Horizontal))
			.child(note("Everything it archived")),
	)
}
