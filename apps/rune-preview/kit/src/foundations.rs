use rune::{El, Icon, ScrollSpec, col, el, icon, row, text};

use crate::avatar::{Face, Person};
use crate::hues::Preset;
use crate::icons::{self, ICONS};
use crate::tokens::{
	RADIUS_2XL, RADIUS_LG, RADIUS_MD, RADIUS_SM, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS,
	TEXT_XS_MONO, Tokens,
};

pub const SCENE: &str = "foundations-comparison";

const TOKEN_SHEET: &str = "foundations-colors--docs";
const HUE_RECIPE: &str = "foundations-hue-recipe--preset-and-arbitrary-hues";
const ICON_STROKE: &str = "foundations-icon-stroke--every-keyline-glyph-draws-the-icon-stroke";
const EVERY_TINT: &str = "branding-botidentityavatar--every-tint";
const EVERY_SIZE: &str = "branding-botidentityavatar--every-size";
const NO_CHOSEN_COLOUR: &str = "branding-botidentityavatar--no-chosen-colour";
const PERSON: &str = "primitives-initialsavatar--default";

const SHOWCASED_TINTS: [Preset; 2] = [Preset::Yellow, Preset::Purple];
const RECIPE_HUES: [f32; 7] = [42.0, 82.0, 186.0, 257.0, 7.0, 150.0, 320.0];
const RECIPE_COLUMNS: [f32; 5] = [48.0, 128.0, 128.0, 96.0, 64.0];
const AVATAR_NAME: &str = "Atlas";
const PERSON_NAME: &str = "Ada Martin";
const EVERY_SIZE_SIDES: [f32; 3] = [40.0, 96.0, 24.0];
const EVERY_TINT_SIDE: f32 = 96.0;
const EVERY_TINT_ORDER: [Preset; 8] = [
	Preset::Red,
	Preset::Yellow,
	Preset::Green,
	Preset::Cyan,
	Preset::Blue,
	Preset::Purple,
	Preset::Pink,
	Preset::Orange,
];
const ICON_STROKE_EXTRAS: [&Icon; 11] = [
	&icons::CHECK,
	&icons::CHEVRON_DOWN,
	&icons::CHEVRON_RIGHT,
	&icons::CHEVRON_UP,
	&icons::CIRCLE_CHECK,
	&icons::INFO,
	&icons::LOADER_CIRCLE,
	&icons::OCTAGON_X,
	&icons::PANEL_LEFT,
	&icons::TRIANGLE_ALERT,
	&icons::X,
];
const GLYPH_SIDE: f32 = 16.0;
const SWATCH_WIDTH: f32 = 264.0;
const STORY_PADDING: f32 = SPACING * 6.0;

pub fn comparison(t: &Tokens) -> El {
	let tinted_primary = if t.dark {
		"foundations-token-contrast--tinted-primary-dark"
	} else {
		"foundations-token-contrast--tinted-primary-light"
	};
	col()
		.w_full()
		.h_full()
		.fill(t.background)
		.padding(STORY_PADDING)
		.gap(SPACING * 10.0)
		.scroll(ScrollSpec { stick_bottom: false })
		.child(block(t, tinted_primary, tinted_primary_rows(t)))
		.child(block(t, HUE_RECIPE, hue_recipe(t)))
		.child(block(t, ICON_STROKE, keyline_glyphs(t)))
		.child(block(t, EVERY_TINT, every_tint(t)))
		.child(block(t, EVERY_SIZE, every_size(t, Some(Preset::Blue.hue()))))
		.child(block(t, NO_CHOSEN_COLOUR, every_size(t, None)))
		.child(block(t, PERSON, people(t)))
		.child(block(t, TOKEN_SHEET, token_sheet(t)))
}

fn block(t: &Tokens, story: &str, content: El) -> El {
	col()
		.gap(SPACING * 3.0)
		.child(text(story.to_owned()).font(TEXT_XS_MONO).color(t.muted_foreground))
		.child(content)
}

fn tinted_primary_rows(t: &Tokens) -> El {
	SHOWCASED_TINTS.iter().fold(col().gap(SPACING * 4.0), |rows, preset| {
		let tinted = Tokens::new(t.dark).in_space(Some(preset.hue()));
		rows.child(
			row()
				.center_y()
				.gap(SPACING * 3.0)
				.child(button(&tinted, "Save memory", true))
				.child(button(&tinted, "Connect", false))
				.child(
					el().size(SPACING * 2.0, SPACING * 2.0)
						.radius(SPACING)
						.fill(tinted.primary_strong),
				)
				.child(switch(&tinted)),
		)
	})
}

fn button(t: &Tokens, label: &str, filled: bool) -> El {
	let face = row().h(SPACING * 8.0).px(SPACING * 3.0).radius(RADIUS_LG).center();
	if filled {
		return face
			.fill(t.primary)
			.child(text(label.to_owned()).font(TEXT_SM_MEDIUM).color(t.primary_foreground));
	}
	face.border(1.0, t.border)
		.fill(if t.dark { t.background.alpha(0.0) } else { t.background })
		.child(text(label.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
}

fn switch(t: &Tokens) -> El {
	let (width, height, border) = (SPACING * 8.0, SPACING * 5.0, 2.0);
	let thumb = height - border * 2.0;
	let ground = if t.dark { t.primary_foreground } else { t.background };
	el().size(width, height).radius(height / 2.0).fill(t.primary).child(
		el().size(thumb, thumb)
			.radius(thumb / 2.0)
			.fill(ground)
			.absolute(width - border - thumb, border),
	)
}

fn hue_recipe(t: &Tokens) -> El {
	RECIPE_HUES.iter().fold(col().gap(SPACING * 3.0), |rows, hue| {
		let tinted = Tokens::new(t.dark).in_space(Some(*hue));
		let [number, bubble, accent, new_line, avatar] = RECIPE_COLUMNS;
		rows.child(
			row()
				.center_y()
				.gap(SPACING * 3.0)
				.child(
					el().w(number)
						.child(text(format!("{hue}")).font(TEXT_SM).color(t.muted_foreground)),
				)
				.child(
					el().w(bubble)
						.px(SPACING * 3.0)
						.py(SPACING * 1.5)
						.radius(RADIUS_2XL)
						.fill(tinted.user_bubble)
						.child(
							text(format!("Sent at {hue}"))
								.font(TEXT_SM)
								.color(tinted.user_bubble_foreground),
						),
				)
				.child(
					el().w(accent)
						.px(SPACING * 3.0)
						.py(SPACING * 1.5)
						.radius(RADIUS_MD)
						.fill(tinted.card)
						.child(text("Accent").font(TEXT_SM_MEDIUM).color(tinted.primary_strong)),
				)
				.child(el().w(new_line).h(1.0).fill(tinted.transcript_new_mark))
				.child(
					el().w(avatar).child(
						el().size(SPACING * 10.0, SPACING * 10.0)
							.radius(RADIUS_LG)
							.fill(tinted.bot_avatar_ground)
							.center()
							.child(
								el().size(SPACING * 4.0, SPACING * 4.0)
									.radius(RADIUS_SM)
									.fill(tinted.bot_avatar_field),
							),
					),
				),
		)
	})
}

fn keyline_glyphs(t: &Tokens) -> El {
	ICONS
		.iter()
		.map(|(_, glyph)| *glyph)
		.chain(ICON_STROKE_EXTRAS)
		.fold(row().flex_wrap().gap(SPACING * 3.0), |glyphs, glyph| {
			glyphs.child(icon(glyph, GLYPH_SIDE).color(t.foreground))
		})
}

fn every_tint(t: &Tokens) -> El {
	let hues =
		std::iter::once(None).chain(EVERY_TINT_ORDER.iter().map(|preset| Some(preset.hue())));
	hues.fold(row().flex_wrap().center_y().gap(SPACING * 3.0), |avatars, hue| {
		avatars.child(Face::still(AVATAR_NAME, hue).draw(EVERY_TINT_SIDE, t))
	})
}

fn every_size(t: &Tokens, hue: Option<f32>) -> El {
	EVERY_SIZE_SIDES.iter().fold(row().center_y().gap(SPACING * 3.0), |avatars, side| {
		avatars.child(Face::still(AVATAR_NAME, hue).draw(*side, t))
	})
}

fn people(t: &Tokens) -> El {
	EVERY_SIZE_SIDES.iter().fold(row().center_y().gap(SPACING * 4.0), |avatars, side| {
		avatars.child(Person { name: PERSON_NAME, image: None }.draw(*side, t))
	})
}

fn token_sheet(t: &Tokens) -> El {
	t.colours().into_iter().fold(row().flex_wrap().gap(SPACING * 3.0), |sheet, (token, colour)| {
		sheet.child(
			row()
				.w(SWATCH_WIDTH)
				.center_y()
				.gap(SPACING * 2.0)
				.child(
					el().size(SPACING * 6.0, SPACING * 6.0)
						.radius(RADIUS_SM)
						.border(1.0, t.border)
						.fill(colour),
				)
				.child(
					col()
						.child(
							text(format!("--{}", token.replace('_', "-")))
								.font(TEXT_XS)
								.color(t.foreground),
						)
						.child(text(colour.hex()).font(TEXT_XS_MONO).color(t.muted_foreground)),
				),
		)
	})
}
