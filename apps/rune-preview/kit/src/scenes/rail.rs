use std::f32::consts::{FRAC_PI_2, TAU};
use std::sync::LazyLock;

use rune::{Cursor, El, LineCap, Shape, canvas, col, el, row, text};

use super::SceneState;
use crate::hues::Preset;
use crate::icons;
use crate::primitives::button::{Button, ButtonSize};
use crate::primitives::sidebar;
use crate::strings::{Language, bots, common, search};
use crate::surfaces::s02_rail::{
	BotBadge, Rail, RailDots, RailMessage, RailPanel, RailSettings, RailUser, SEARCH_KEY,
	SPACE_LOGO_KEY, Space, SpaceCarousel, SpacesMenu, rail_hint,
};
use crate::tokens::{SPACING, TEXT_SM, Tokens};
use crate::widgets::not_drawn;

pub(super) const RAIL_STAGE: (f32, f32) = (320.0, 512.0);
pub(super) const SPACES_WINDOW: (f32, f32) = (1280.0, 512.0);
pub(super) const SIDEBAR_STAGE: (f32, f32) = (480.0, 512.0);

const EN: Language = Language::En;
const READER: &str = "Ada Lovelace";
const TITLE_BAR: f32 = 34.0;
const WINDOW_TOP: f32 = SPACING * 10.0;
const RAILS_GAP: f32 = SPACING * 8.0;
const UPDATE_FRAME: f32 = SPACING * 9.0;
const RING_RADIUS: f32 = 16.0;
const RING_STROKE: f32 = 2.0;
const RING_STEPS: usize = 96;
const DOWNLOADED: f32 = 0.42;
const DISABLED_OPACITY: f32 = 0.5;
const SIDEBAR_BAND: f32 = SPACING * 6.0;

fn rail_sink(_: &mut SceneState, _: RailMessage) {}

fn vocca() -> Space<'static> {
	Space { id: "vocca", name: "Vocca", colour: Some(Preset::Blue.hue()), avatar_seed: "vocca" }
}

static TITLE_BAR_SPACES: LazyLock<[Space<'static>; 4]> = LazyLock::new(|| {
	[
		Space {
			id: "studio",
			name: "Studio",
			colour: Some(Preset::Orange.hue()),
			avatar_seed: "studio",
		},
		vocca(),
		Space {
			id: "atelier",
			name: "Atelier",
			colour: Some(Preset::Green.hue()),
			avatar_seed: "atelier",
		},
		Space { id: "garage", name: "Garage", colour: None, avatar_seed: "garage" },
	]
});

static SIDEBAR_SPACES: LazyLock<[Space<'static>; 2]> = LazyLock::new(|| {
	[
		Space {
			id: "perso",
			name: "Perso",
			colour: Some(Preset::Blue.hue()),
			avatar_seed: "perso",
		},
		Space {
			id: "vocca",
			name: "Vocca",
			colour: Some(Preset::Green.hue()),
			avatar_seed: "vocca",
		},
	]
});

fn rail(selected: RailPanel) -> Rail<'static> {
	Rail {
		space: Some(vocca()),
		user: RailUser { name: Some(READER), image: None },
		..Rail::new(EN, selected)
	}
}

fn on_ground(t: &Tokens, content: El, layers: Vec<El>) -> El {
	rune_kit::root(row().w_full().h_full().fill(t.background).child(content), layers)
}

fn shown(t: &Tokens, rail: Rail) -> El {
	on_ground(t, rail.view(t, rail_sink), Vec::new())
}

fn with_dots(dots: RailDots) -> Rail<'static> {
	Rail { dots, ..rail(RailPanel::Conversations) }
}

fn news() -> RailDots {
	RailDots {
		conversations: Some(BotBadge::Done),
		missions: Some(BotBadge::Attention),
		..RailDots::default()
	}
}

pub(super) fn conversations(t: &Tokens, _: &SceneState) -> El {
	shown(t, rail(RailPanel::Conversations))
}

pub(super) fn missions_selected(t: &Tokens, _: &SceneState) -> El {
	shown(t, rail(RailPanel::Missions))
}

pub(super) fn library_selected(t: &Tokens, _: &SceneState) -> El {
	shown(t, rail(RailPanel::Library))
}

pub(super) fn space_settings_over_conversations(t: &Tokens, _: &SceneState) -> El {
	shown(t, Rail { open_settings: Some(RailSettings::Space), ..rail(RailPanel::Conversations) })
}

pub(super) fn user_settings_over_missions(t: &Tokens, _: &SceneState) -> El {
	shown(t, Rail { open_settings: Some(RailSettings::You), ..rail(RailPanel::Missions) })
}

pub(super) fn without_library_handler(t: &Tokens, _: &SceneState) -> El {
	shown(t, Rail { has_library: false, ..rail(RailPanel::Conversations) })
}

pub(super) fn without_search_handler(t: &Tokens, _: &SceneState) -> El {
	shown(t, Rail { has_search: false, ..rail(RailPanel::Conversations) })
}

pub(super) fn space_logo_without_space(t: &Tokens, _: &SceneState) -> El {
	shown(t, Rail { space: None, ..rail(RailPanel::Conversations) })
}

pub(super) fn with_dot(t: &Tokens, _: &SceneState) -> El {
	shown(t, with_dots(news()))
}

pub(super) fn attention_dot(t: &Tokens, _: &SceneState) -> El {
	let attention = Some(BotBadge::Attention);
	shown(
		t,
		with_dots(RailDots {
			conversations: attention,
			missions: attention,
			..RailDots::default()
		}),
	)
}

pub(super) fn done_dot(t: &Tokens, _: &SceneState) -> El {
	shown(t, with_dots(RailDots { conversations: Some(BotBadge::Done), ..RailDots::default() }))
}

pub(super) fn failed_dot(t: &Tokens, _: &SceneState) -> El {
	shown(t, with_dots(RailDots { conversations: Some(BotBadge::Failed), ..RailDots::default() }))
}

pub(super) fn library_dot(t: &Tokens, _: &SceneState) -> El {
	shown(t, with_dots(RailDots { library: Some(BotBadge::Done), ..RailDots::default() }))
}

pub(super) fn on_tinted_space(t: &Tokens, _: &SceneState) -> El {
	let tinted = t.in_space(Some(Preset::Blue.hue()));
	shown(&tinted, with_dots(news()))
}

pub(super) fn icon_states_side_by_side(t: &Tokens, _: &SceneState) -> El {
	let rails = RailPanel::ALL.map(|panel| row().h_full().child(rail(panel).view(t, rail_sink)));
	on_ground(t, row().h_full().gap(RAILS_GAP).children(rails), Vec::new())
}

pub(super) fn space_logo_hovered(t: &Tokens, _: &SceneState) -> El {
	let rail = Rail {
		dots: RailDots { you: true, ..RailDots::default() },
		..rail(RailPanel::Conversations)
	};
	let hint = rail_hint(t, EN, SPACE_LOGO_KEY, bots::rail::SPACE_SETTINGS.text(EN), false);
	on_ground(t, rail.view(t, rail_sink), vec![hint])
}

pub(super) fn search_entry_hovered(t: &Tokens, _: &SceneState) -> El {
	let hint = rail_hint(t, EN, SEARCH_KEY, search::OPEN.text(EN), true);
	on_ground(t, rail(RailPanel::Conversations).view(t, rail_sink), vec![hint])
}

pub(super) fn keyboard_reach(t: &Tokens, _: &SceneState) -> El {
	let hint = rail_hint(t, EN, SPACE_LOGO_KEY, bots::rail::SPACE_SETTINGS.text(EN), false);
	on_ground(t, rail(RailPanel::Conversations).view(t, rail_sink), vec![hint])
}

fn spaces_menu(badges: &'static [(&'static str, BotBadge)], is_open: bool) -> SpacesMenu<'static> {
	SpacesMenu { spaces: &*TITLE_BAR_SPACES, badges, is_open, ..SpacesMenu::default() }
}

fn spaces_window(t: &Tokens, badges: &'static [(&'static str, BotBadge)]) -> El {
	let rail =
		Rail { spaces_menu: Some(spaces_menu(badges, true)), ..rail(RailPanel::Conversations) };
	let menu: Vec<El> = rail.spaces_menu_layer(t, rail_sink).into_iter().collect();
	let window = col()
		.w_full()
		.h_full()
		.fill(t.background)
		.child(el().h(WINDOW_TOP).w_full())
		.child(row().w_full().grow(1.0).min_h(0.0).child(rail.view(t, rail_sink)));
	rune_kit::root(window, menu)
}

pub(super) fn a7_spaces_menu(t: &Tokens, _: &SceneState) -> El {
	spaces_window(t, &[])
}

pub(super) fn a7_spaces_menu_attention_row(t: &Tokens, _: &SceneState) -> El {
	spaces_window(
		t,
		&[("vocca", BotBadge::Done), ("studio", BotBadge::Attention), ("garage", BotBadge::Failed)],
	)
}

pub(super) fn spaces_menu_gestures(t: &Tokens, _: &SceneState) -> El {
	shown(t, Rail { spaces_menu: Some(spaces_menu(&[], false)), ..rail(RailPanel::Conversations) })
}

pub(super) fn rail_in_sidebar(t: &Tokens, _: &SceneState) -> El {
	let shell = col()
		.w_full()
		.h_full()
		.fill(t.background)
		.child(row().h(TITLE_BAR).w_full().padding(SPACING).child(not_drawn(
			t,
			"App title bar",
			"S01",
		)))
		.child(
			row()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.child(rail(RailPanel::Conversations).view(t, rail_sink))
				.child(col().grow(1.0).padding(SPACING * 2.0).child(not_drawn(
					t,
					"App sidebar",
					"S03",
				))),
		);
	rune_kit::root(shell, Vec::new())
}

#[derive(Clone, Copy)]
enum Update {
	Available,
	Downloading,
	Ready,
}

fn update_badge(t: &Tokens, update: Update) -> El {
	let (glyph, label) = match update {
		Update::Available => (&icons::ARROW_UP, common::update::badge::AVAILABLE),
		Update::Downloading => (&icons::ARROW_UP, common::update::badge::DOWNLOADING),
		Update::Ready => (&icons::ROTATE_CW, common::update::badge::READY_VERSION),
	};
	let label = label.text(EN).replace("{{version}}", "1.4.0");
	let button = Button::icon(glyph, &label).size(ButtonSize::IconSm).view(t);
	let frame = row().size(UPDATE_FRAME, UPDATE_FRAME).center();
	let Update::Downloading = update else { return frame.child(button) };
	let centre = UPDATE_FRAME / 2.0;
	let arc = |share: f32| -> Vec<[f32; 2]> {
		(0..=RING_STEPS)
			.map(|step| {
				let angle = step as f32 / RING_STEPS as f32 * share * TAU - FRAC_PI_2;
				[centre + RING_RADIUS * angle.cos(), centre + RING_RADIUS * angle.sin()]
			})
			.collect()
	};
	let ring = Shape::new()
		.stroke_with(arc(1.0), true, RING_STROKE, LineCap::Butt, t.border)
		.stroke_with(arc(DOWNLOADED), false, RING_STROKE, LineCap::Round, t.primary_strong);
	frame
		.child(canvas(ring).absolute(0.0, 0.0).size(UPDATE_FRAME, UPDATE_FRAME).a11y_hidden())
		.child(button.disabled(true).opacity(DISABLED_OPACITY))
}

fn with_update(t: &Tokens, update: Option<Update>) -> El {
	let badge = update.map(|update| update_badge(t, update));
	shown(t, Rail { update_badge: badge, ..rail(RailPanel::Conversations) })
}

pub(super) fn update_waiting(t: &Tokens, _: &SceneState) -> El {
	with_update(t, Some(Update::Available))
}

pub(super) fn update_downloading(t: &Tokens, _: &SceneState) -> El {
	with_update(t, Some(Update::Downloading))
}

pub(super) fn update_ready(t: &Tokens, _: &SceneState) -> El {
	with_update(t, Some(Update::Ready))
}

pub(super) fn update_idle(t: &Tokens, _: &SceneState) -> El {
	with_update(t, None)
}

pub(super) fn carousel_list_per_space(t: &Tokens, _: &SceneState) -> El {
	let carousel = SpaceCarousel {
		list: RailPanel::Conversations,
		spaces: &*SIDEBAR_SPACES,
		selected: Some("perso"),
	};
	let panel = carousel.view(|space| {
		row()
			.w_full()
			.h(SIDEBAR_BAND)
			.center()
			.role("button")
			.label(space.name)
			.focusable(true)
			.cursor(Cursor::Pointer)
			.child(text(space.name.to_owned()).font(TEXT_SM).color(t.sidebar_foreground))
	});
	let roster = col()
		.w(sidebar::WIDTH)
		.h(SIDEBAR_BAND)
		.fill(t.sidebar)
		.role("complementary")
		.label("Roster")
		.child(panel);
	rune_kit::root(col().w_full().h_full().fill(t.background).child(roster), Vec::new())
}
