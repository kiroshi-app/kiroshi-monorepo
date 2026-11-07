use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::tokens::{self, SPACING, Tokens};

mod feedback;
mod forms;
mod missions;
mod navigation;
mod overlays;
mod primitives;

pub const THEMES: [Theme; 2] = [Theme::Light, Theme::Dark];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Theme {
	Light,
	Dark,
}

impl Theme {
	pub fn name(self) -> &'static str {
		match self {
			Theme::Light => "light",
			Theme::Dark => "dark",
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pointer {
	Away,
	EntersAtSnap(&'static str),
	LeavesAtSnap(&'static str),
}

pub struct Scene {
	pub id: &'static str,
	pub size: (f32, f32),
	pub tabs: usize,
	pub pointer: Pointer,
	pub typed: &'static str,
	pub view: fn(&Tokens, &SceneState) -> El,
}

impl Scene {
	pub fn baseline(&self, theme: Theme) -> String {
		format!("{}-{}.png", self.id, theme.name())
	}
}

const STORY: (f32, f32) = (640.0, 360.0);
const OVERLAY: (f32, f32) = (720.0, 480.0);
const SHELL: (f32, f32) = (960.0, 560.0);
const MOBILE: (f32, f32) = (390.0, 640.0);
const TOASTS: (f32, f32) = (560.0, 640.0);
const COMPARISON: (f32, f32) = (1180.0, 3700.0);

const fn scene(id: &'static str, size: (f32, f32), view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::Away, typed: "", view }
}

const fn focused(
	id: &'static str,
	size: (f32, f32),
	tabs: usize,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size, tabs, pointer: Pointer::Away, typed: "", view }
}

const fn typed(
	id: &'static str,
	tabs: usize,
	text: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: STORY, tabs, pointer: Pointer::Away, typed: text, view }
}

const fn pointed(
	id: &'static str,
	pointer: Pointer,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: STORY, tabs: 0, pointer, typed: "", view }
}

pub static SCENES: &[Scene] = &[
	scene(foundations::SCENE, COMPARISON, |t, s| {
		rune_kit::root(foundations::comparison(t, s.picture.as_ref()), Vec::new())
	}),
	scene("primitives-accordion--default", STORY, primitives::accordion_default),
	scene("primitives-accordion--one-open", STORY, primitives::accordion_one_open),
	focused("primitives-accordion--focus-visible", STORY, 1, primitives::accordion_default),
	scene("primitives-avatar--default", STORY, primitives::avatar_default),
	scene("primitives-avatar--empty", STORY, primitives::avatar_empty),
	scene("primitives-avatar--with-badge", STORY, primitives::avatar_with_badge),
	scene("primitives-avatar--in-group", STORY, primitives::avatar_in_group),
	scene("primitives-badge--default", STORY, primitives::badge_default),
	scene("primitives-badge--variants", STORY, primitives::badge_variants),
	scene("primitives-badge--long-content", STORY, primitives::badge_long_content),
	scene("primitives-button--playground", STORY, primitives::button_playground),
	scene("primitives-button--variants", STORY, primitives::button_variants),
	scene("primitives-button--sizes", STORY, primitives::button_sizes),
	focused("primitives-button--states", STORY, 3, primitives::button_states),
	scene("primitives-button--with-icons", STORY, primitives::button_with_icons),
	pointed(
		"primitives-button--pointer-enters",
		Pointer::EntersAtSnap("button-Button"),
		primitives::button_playground,
	),
	pointed(
		"primitives-button--pointer-leaves",
		Pointer::LeavesAtSnap("button-Button"),
		primitives::button_playground,
	),
	focused("primitives-button--focus-visible", STORY, 1, primitives::button_playground),
	scene("primitives-collapsible--default", STORY, primitives::collapsible_default),
	focused("primitives-collapsible--focus-visible", STORY, 1, primitives::collapsible_default),
	scene("primitives-item--default", STORY, primitives::item_default),
	scene("primitives-item--variants", STORY, primitives::item_variants),
	scene("primitives-item--sizes", STORY, primitives::item_sizes),
	scene("primitives-item--media-variants", STORY, primitives::item_media_variants),
	scene("primitives-kbd--default", STORY, primitives::kbd_default),
	scene("primitives-kbd--long-content", STORY, primitives::kbd_long_content),
	scene("primitives-kbd--in-group", STORY, primitives::kbd_in_group),
	scene("primitives-separator--default", STORY, primitives::separator_default),
	scene("primitives-toast--types", TOASTS, feedback::toast_types),
	scene("forms-checkbox--default", STORY, forms::checkbox_default),
	scene("forms-checkbox--states", STORY, forms::checkbox_states),
	scene("forms-checkbox--with-label", STORY, forms::checkbox_with_label),
	scene("forms-checkbox--on-dark-surface", STORY, forms::checkbox_states),
	focused("forms-checkbox--focus-visible", STORY, 1, forms::checkbox_default),
	typed("forms-input--default", 0, "", forms::input_story),
	typed("forms-input--filled", 0, "migration", forms::input_story),
	typed("forms-input--focused", 1, "migration", forms::input_story),
	typed("forms-input--focus-visible", 1, "", forms::input_story),
	scene("forms-inputotp--default", STORY, forms::input_otp_default),
	focused("forms-inputotp--focus-visible", STORY, 1, forms::input_otp_empty),
	scene("forms-radiogroup--default", STORY, forms::radio_default),
	scene("forms-radiogroup--states", STORY, forms::radio_states),
	focused("forms-radiogroup--keyboard-walk", STORY, 1, forms::radio_keyboard_walk),
	scene("forms-radiogroup--on-dark-surface", STORY, forms::radio_on_dark_surface),
	focused("forms-radiogroup--focus-visible", STORY, 1, forms::radio_default),
	scene("forms-slider--default", STORY, forms::slider_default),
	focused("forms-slider--focus-visible", STORY, 1, forms::slider_default),
	scene("forms-switch--default", STORY, forms::switch_default),
	focused("forms-switch--states", STORY, 3, forms::switch_states),
	scene("forms-switch--long-content", STORY, forms::switch_long_content),
	focused("forms-switch--focus-visible", STORY, 1, forms::switch_default),
	scene("forms-toggle--default", STORY, forms::toggle_default),
	focused("forms-toggle--focus-visible", STORY, 1, forms::toggle_default),
	scene("forms-togglegroup--single-selection", STORY, forms::toggle_group_single_selection),
	focused("forms-togglegroup--focus-visible", STORY, 1, forms::toggle_group_single_selection),
	scene("feedback-skeleton--loading", STORY, feedback::skeleton_loading),
	scene("navigation-sidebar--expanded", SHELL, navigation::sidebar_expanded),
	scene("navigation-sidebar--right-side", SHELL, navigation::sidebar_right_side),
	focused("navigation-sidebar--focus-visible", SHELL, 2, navigation::sidebar_expanded),
	scene("navigation-tabs--default", STORY, navigation::tabs_default),
	scene("navigation-tabs--variants", STORY, navigation::tabs_variants),
	scene("navigation-tabs--states", STORY, navigation::tabs_states),
	scene("navigation-tabs--long-content", STORY, navigation::tabs_long_content),
	scene("navigation-tabs--on-dark-surface", STORY, navigation::tabs_states),
	focused("navigation-tabs--focus-visible", STORY, 1, navigation::tabs_default),
	scene("overlays-contextmenu--default", OVERLAY, overlays::context_menu_default),
	scene("overlays-contextmenu--closed", OVERLAY, overlays::context_menu_closed),
	scene(
		"overlays-contextmenu--with-checkbox-and-radio-items",
		OVERLAY,
		overlays::context_menu_view_items,
	),
	scene("overlays-contextmenu--with-submenu", OVERLAY, overlays::context_menu_with_submenu),
	scene("overlays-contextmenu--states", OVERLAY, overlays::context_menu_states),
	scene("overlays-contextmenu--radius-ladder", OVERLAY, overlays::context_menu_radius_ladder),
	focused(
		"overlays-contextmenu--keyboard-focus-ring",
		OVERLAY,
		2,
		overlays::context_menu_default,
	),
	scene(
		"overlays-contextmenu--pointer-focus-without-ring",
		OVERLAY,
		overlays::context_menu_states,
	),
	scene("overlays-contextmenu--long-content", OVERLAY, overlays::context_menu_long_content),
	scene("overlays-contextmenu--minimum-width", OVERLAY, overlays::context_menu_minimum_width),
	scene(
		"overlays-contextmenu--trailing-slots-aligned",
		OVERLAY,
		overlays::context_menu_trailing_slots,
	),
	scene(
		"overlays-contextmenu--long-label-keeps-trailing-slot",
		OVERLAY,
		overlays::context_menu_long_label,
	),
	scene("overlays-contextmenu--as-menu-button", OVERLAY, overlays::context_menu_as_menu_button),
	scene("overlays-dialog--default", OVERLAY, overlays::dialog_default),
	focused("overlays-dialog--states", OVERLAY, 1, overlays::dialog_states),
	scene("overlays-dialog--long-content", OVERLAY, overlays::dialog_long_content),
	scene("overlays-dropdownmenu--default", OVERLAY, overlays::dropdown_menu_default),
	focused("overlays-dropdownmenu--focus-visible", OVERLAY, 2, overlays::dropdown_menu_default),
	scene("overlays-popover--default", OVERLAY, overlays::popover_default),
	focused("overlays-popover--states", OVERLAY, 1, overlays::popover_states),
	scene("overlays-popover--long-content", OVERLAY, overlays::popover_long_content),
	scene("overlays-sheet--closed", MOBILE, overlays::sheet_closed),
	scene("overlays-sheet--drawer", MOBILE, overlays::sheet_drawer),
	scene("overlays-tooltip--default", OVERLAY, overlays::tooltip_default),
	scene("overlays-tooltip--with-side", OVERLAY, overlays::tooltip_with_side),
	scene("overlays-tooltip--long-content", OVERLAY, overlays::tooltip_long_content),
	scene("overlays-tooltip--on-dark-surface", OVERLAY, overlays::tooltip_default),
	scene("conversation-missions-missionstatepill--states", STORY, missions::state_pill_states),
	scene("conversation-missions-missionmarks--default", STORY, missions::marks_default),
	scene("conversation-missions-missionmarks--as-line", STORY, missions::marks_as_line),
	scene(
		"conversation-missions-missionactivityline--default",
		STORY,
		missions::activity_line_default,
	),
	focused(
		"conversation-missions-missioncard--card-waiting-human",
		STORY,
		2,
		missions::card_waiting_human,
	),
	scene("conversation-missions-missioncard--card-working", STORY, missions::card_working),
	scene("conversation-missions-missioncard--card-waiting-bot", STORY, missions::card_waiting_bot),
	scene(
		"conversation-missions-missioncard--card-ready-to-merge",
		STORY,
		missions::card_ready_to_merge,
	),
	scene("conversation-missions-missioncard--card-failed", STORY, missions::card_failed),
	scene("conversation-missions-missioncard--card-done", STORY, missions::card_done),
	scene("conversation-missions-missioncard--card-closed", STORY, missions::card_closed),
	scene(
		"conversation-missions-missioncard--card-unrecognised",
		STORY,
		missions::card_unrecognised,
	),
	scene(
		"conversation-missions-missioncard--card-identifier-without-title",
		STORY,
		missions::card_identifier_without_title,
	),
	scene(
		"conversation-missions-missioncard--card-without-ticket",
		STORY,
		missions::card_without_ticket,
	),
	scene("conversation-missions-missioncard--card-unlinkable", STORY, missions::card_unlinkable),
	scene(
		"conversation-missions-missioncard--card-activity-line",
		STORY,
		missions::card_activity_line,
	),
	scene(
		"conversation-missions-missioncard--card-long-content",
		missions::THREAD,
		missions::card_long_content,
	),
	scene("conversation-missions-missioncard--card-with-status", STORY, missions::card_with_status),
	scene(
		"conversation-missions-missioncard--card-long-status",
		missions::THREAD,
		missions::card_long_status,
	),
	scene("conversation-missions-missioncard--row-working", STORY, missions::row_working),
	scene(
		"conversation-missions-missioncard--row-working-with-many-tools",
		STORY,
		missions::row_working_with_many_tools,
	),
	scene("conversation-missions-missioncard--row-tool-glyph", STORY, missions::row_tool_glyph),
	scene("conversation-missions-missioncard--row-waiting-bot", STORY, missions::row_waiting_bot),
	scene(
		"conversation-missions-missioncard--row-waiting-human",
		STORY,
		missions::row_waiting_human,
	),
	scene(
		"conversation-missions-missioncard--row-ready-to-merge",
		STORY,
		missions::row_ready_to_merge,
	),
	scene("conversation-missions-missioncard--row-failed", STORY, missions::row_failed),
	scene("conversation-missions-missioncard--row-done", STORY, missions::row_done),
	scene("conversation-missions-missioncard--row-closed", STORY, missions::row_closed),
	scene("conversation-missions-missioncard--row-states", missions::ROWS, missions::row_states),
	scene(
		"conversation-missions-missioncard--row-parts-repeating-the-same-words",
		STORY,
		missions::row_parts_repeating_the_same_words,
	),
	scene(
		"conversation-missions-missioncard--row-without-a-ticket",
		STORY,
		missions::row_without_a_ticket,
	),
	scene(
		"conversation-missions-missioncard--row-activity-line",
		STORY,
		missions::row_activity_line,
	),
	scene("conversation-missions-missioncard--row-long-content", STORY, missions::row_long_content),
	scene("conversation-missions-missioncard--row-with-status", STORY, missions::row_with_status),
	scene("conversation-missions-missioncard--row-long-status", STORY, missions::row_long_status),
	scene(
		"conversation-missions-missioncard--row-with-and-without-pill",
		STORY,
		missions::row_with_and_without_pill,
	),
	scene(
		"conversation-missions-missioncard--card-with-and-without-pill",
		missions::THREAD,
		missions::card_with_and_without_pill,
	),
	scene("conversation-missions-missionturn--working", missions::TURN, missions::turn_working),
	scene("conversation-missions-missionturn--states", missions::TURNS, missions::turn_states),
	focused(
		"conversation-missions-missionturn--waiting-for-the-reader",
		missions::TURN,
		1,
		missions::turn_waiting_for_the_reader,
	),
	scene(
		"conversation-missions-missionturn--ready-to-merge",
		missions::TURN,
		missions::turn_ready_to_merge,
	),
	scene("conversation-missions-missionturn--failed", missions::TURN, missions::turn_failed),
	scene("conversation-missions-missionturn--done", missions::TURN, missions::turn_done),
	scene(
		"conversation-missions-missionturn--long-objective",
		missions::TURN,
		missions::turn_long_objective,
	),
	scene(
		"conversation-missions-missionturn--without-tools",
		missions::TURN,
		missions::turn_without_tools,
	),
	scene(
		"conversation-missions-missionturn--working-without-tools",
		missions::TURN,
		missions::turn_working_without_tools,
	),
	scene(
		"conversation-missions-missionturn--in-a-solo-thread",
		missions::TURN,
		missions::turn_under_an_opening_turn,
	),
	scene(
		"conversation-missions-missionturn--with-an-unknown-tool",
		missions::TURN,
		missions::turn_with_an_unknown_tool,
	),
	scene(
		"conversation-missions-missionturn--under-the-turn-that-opened-it",
		missions::TURN,
		missions::turn_under_an_opening_turn,
	),
	focused("conversation-missions-missionheader--default", STORY, 1, missions::header_default),
	focused("conversation-missions-missionheader--loading", STORY, 1, missions::header_loading),
	scene(
		"conversation-missions-missionheader--states",
		missions::HEADERS,
		missions::header_states,
	),
	scene(
		"conversation-missions-missionheader--without-a-pill",
		STORY,
		missions::header_without_a_pill,
	),
	focused("conversation-missions-missionheader--ticket-link", STORY, 2, missions::header_default),
	scene("conversation-missions-missionheader--empty", STORY, missions::header_empty),
	scene(
		"conversation-missions-missionheader--without-a-tool",
		STORY,
		missions::header_without_a_tool,
	),
	scene(
		"conversation-missions-missionheader--long-content",
		STORY,
		missions::header_long_content,
	),
	scene("conversation-missions-missionheader--with-status", STORY, missions::header_with_status),
	scene("conversation-missions-missionheader--long-status", STORY, missions::header_long_status),
	focused(
		"conversation-missions-missionheader--with-pull-request",
		STORY,
		3,
		missions::header_with_pull_request,
	),
	scene(
		"conversation-missions-missionheader--pull-request-only",
		STORY,
		missions::header_pull_request_only,
	),
	scene(
		"conversation-missions-missioneventrow--machine-line",
		STORY,
		missions::event_machine_line,
	),
	scene(
		"conversation-missions-missioneventrow--with-pull-request-link",
		STORY,
		missions::event_with_pull_request_link,
	),
	scene(
		"conversation-missions-missioneventrow--with-an-unnumbered-link",
		STORY,
		missions::event_with_an_unnumbered_link,
	),
	scene("conversation-missions-missioneventrow--authored-event", STORY, missions::event_authored),
	scene(
		"conversation-missions-missioneventrow--from-the-agent",
		STORY,
		missions::event_from_the_agent,
	),
	scene(
		"conversation-missions-missioneventrow--agent-asked-on-warning",
		STORY,
		missions::event_from_the_agent,
	),
	scene(
		"conversation-missions-missioneventrow--from-the-agent-without-a-tool",
		STORY,
		missions::event_from_the_agent_without_a_tool,
	),
	scene(
		"conversation-missions-missioneventrow--from-git-hub",
		STORY,
		missions::event_from_github,
	),
	scene(
		"conversation-missions-missioneventrow--from-the-reader",
		STORY,
		missions::event_from_the_reader,
	),
	scene(
		"conversation-missions-missioneventrow--closed-by-you",
		STORY,
		missions::event_closed_by_you,
	),
	scene(
		"conversation-missions-missioneventrow--event-kinds",
		missions::EVENTS,
		missions::event_kinds,
	),
	scene(
		"conversation-missions-missioneventrow--authored-events",
		STORY,
		missions::event_authored_events,
	),
	scene(
		"conversation-missions-missioneventrow--without-a-bot",
		STORY,
		missions::event_without_a_bot,
	),
	scene(
		"conversation-missions-missioneventrow--in-a-mission-thread",
		missions::THREAD,
		missions::event_in_a_mission_thread,
	),
	scene(
		"conversation-missions-missioneventrow--long-content",
		STORY,
		missions::event_long_content,
	),
	scene("overlays-missionmenu--working", missions::MENU, missions::menu_working),
	scene(
		"overlays-missionmenu--working-without-a-pull-request",
		missions::MENU,
		missions::menu_working_without_a_pull_request,
	),
	scene(
		"overlays-missionmenu--waiting-on-the-companion",
		missions::MENU,
		missions::menu_waiting_on_the_companion,
	),
	scene(
		"overlays-missionmenu--waiting-on-the-person",
		missions::MENU,
		missions::menu_waiting_on_the_person,
	),
	scene("overlays-missionmenu--ready-to-merge", missions::MENU, missions::menu_ready_to_merge),
	scene("overlays-missionmenu--failed", missions::MENU, missions::menu_failed),
	scene("overlays-missionmenu--done", missions::MENU, missions::menu_done),
	scene("overlays-missionmenu--closed", missions::MENU, missions::menu_closed),
	scene(
		"overlays-missionmenu--done-without-a-pull-request",
		missions::MENU,
		missions::menu_done_without_a_pull_request,
	),
	scene("overlays-missionmenu--copy-choices", missions::MENU, missions::menu_copy_choices),
	scene(
		"overlays-missionmenu--every-copy-choice",
		missions::MENU,
		missions::menu_every_copy_choice,
	),
	focused("overlays-missionmenu--keyboard-trigger", missions::MENU, 1, missions::menu_working),
	scene("navigation-missionspanel--default", missions::PANEL, missions::panel_default),
	scene("navigation-missionspanel--empty", missions::PANEL, missions::panel_empty),
	scene("navigation-missionspanel--loading", missions::PANEL, missions::panel_loading),
	scene("navigation-missionspanel--one-group", missions::PANEL, missions::panel_one_group),
	focused(
		"navigation-missionspanel--earlier-today-unfolded",
		missions::PANEL,
		6,
		missions::panel_earlier_today_unfolded,
	),
	scene("navigation-missionspanel--selected-row", missions::PANEL, missions::panel_selected_row),
	scene("navigation-missionspanel--row-menu", missions::PANEL, missions::panel_row_menu),
	scene("navigation-missionspanel--reading-more", missions::PANEL, missions::panel_reading_more),
	scene("navigation-missionspanel--complete", missions::PANEL, missions::panel_complete),
	scene("navigation-missionspanel--idle", missions::PANEL, missions::panel_idle),
	scene("feedback-missiondetailskeleton--light", missions::FULL, missions::detail_skeleton),
	scene("feedback-missionsfeedskeleton--light", missions::FULL, missions::feed_skeleton),
];

pub struct SceneState {
	pub scene: &'static Scene,
	pub edit: TextEdit,
	pub picture: Option<Image>,
	images: Option<ImageCache>,
}

impl SceneState {
	pub fn new(scene: &'static Scene) -> SceneState {
		SceneState { scene, edit: TextEdit::new(scene.typed), picture: None, images: None }
	}
}

pub fn setup(s: &mut SceneState, waker: Waker) {
	let images = ImageCache::new(waker);
	let picture = images.svg(UPLOADED_AVATAR_IMAGE.as_bytes(), PICTURE_SIDE, PICTURE_SCALE);
	if let Err(failure) = picture.wait() {
		eprintln!("the avatar picture didn't decode: {}", failure.0);
	}
	s.picture = Some(picture);
	s.images = Some(images);
}

pub fn view(s: &SceneState, cx: &mut Cx<SceneState>) -> El {
	let t = Tokens { reduced_motion: cx.is_reduced_motion(), ..Tokens::new(cx.system_dark()) };
	(s.scene.view)(&t, s)
}

pub fn spec(scene: &'static Scene) -> AppSpec<SceneState> {
	AppSpec {
		setup: Some(setup),
		fonts: tokens::FONTS,
		families: tokens::FAMILIES,
		..AppSpec::new("Kiroshi scenes", scene.size, || SceneState::new(&SCENES[0]), view)
	}
}

fn stage(t: &Tokens, content: El) -> El {
	staged(t, content, Vec::new())
}

fn staged(t: &Tokens, content: El, layers: Vec<El>) -> El {
	rune_kit::root(row().w_full().h_full().fill(t.background).center().child(content), layers)
}

fn line(items: impl IntoIterator<Item = El>) -> El {
	row().gap(SPACING * 3.0).center_y().flex_wrap().children(items)
}
