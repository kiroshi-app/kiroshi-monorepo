use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::tokens::{self, SPACING, Tokens};

mod feedback;
mod forms;
mod navigation;
mod overlays;
mod primitives;
mod roster;

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
	scene("feedback-sidebarlistskeleton--light", roster::SKELETON, roster::skeleton),
	scene("navigation-appsidebar--loading-roster", roster::PANEL, roster::panel_loading),
	focused("navigation-appsidebar--roster", roster::PANEL, 2, roster::panel_roster_loaded),
	scene(
		"navigation-appsidebar--roster-reading-next-page",
		roster::PANEL,
		roster::panel_roster_reading_next_page,
	),
	scene("navigation-appsidebar--unreadable-roster", roster::PANEL, roster::panel_unreadable),
	focused(
		"navigation-appsidebar--unreadable-roster-with-retry",
		roster::PANEL,
		1,
		roster::panel_unreadable_with_retry,
	),
	scene("navigation-appsidebarbotrow--bot-answered", roster::ROW, roster::bot_answered),
	scene(
		"navigation-appsidebarbotrow--bot-long-question-stays-on-one-line",
		roster::ROW,
		roster::bot_long_question,
	),
	scene("navigation-appsidebarbotrow--bot-needing-you", roster::ROW, roster::bot_needing_you),
	scene(
		"navigation-appsidebarbotrow--bot-own-row-keeps-its-avatar-and-no-pile",
		roster::ROW,
		roster::bot_answered,
	),
	scene(
		"navigation-appsidebarbotrow--idle-bot-ignores-its-background-tasks",
		roster::ROW,
		roster::bot_idle,
	),
	scene("navigation-appsidebarbotrow--selected-bot", roster::ROW, roster::bot_selected),
	scene(
		"navigation-appsidebarbotrow--working-bot-keeps-its-timestamp",
		roster::ROW,
		roster::bot_working,
	),
	scene(
		"navigation-appsidebarbotrow--working-bot-waiting-on-one-background-task",
		roster::ROW,
		roster::bot_waiting_on_one,
	),
	scene(
		"navigation-appsidebarbotrow--working-bot-waiting-on-two-background-tasks",
		roster::ROW,
		roster::bot_waiting_on_two,
	),
	scene(
		"navigation-appsidebarconversationrow--conversation-answered",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--conversation-long-question-at-the-narrowest-sidebar",
		roster::NARROW_ROW,
		roster::room_long_question_narrow,
	),
	scene(
		"navigation-appsidebarconversationrow--conversation-needing-you",
		roster::ROW,
		roster::room_needing_you,
	),
	scene(
		"navigation-appsidebarconversationrow--idle-conversation-ignores-background-tasks",
		roster::ROW,
		roster::room_idle,
	),
	scene(
		"navigation-appsidebarconversationrow--knockout-wears-the-row-at-rest-and-hovered",
		roster::ROW,
		roster::room_hovered_five_bots,
	),
	scene(
		"navigation-appsidebarconversationrow--long-title-and-preview-truncate",
		roster::ROW,
		roster::room_long_title,
	),
	scene(
		"navigation-appsidebarconversationrow--monochrome-row",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--muted-tint-row",
		roster::ROW,
		roster::room_shield_key,
	),
	scene(
		"navigation-appsidebarconversationrow--muted-tint-row-free-hue",
		roster::ROW,
		roster::room_free_hue,
	),
	scene(
		"navigation-appsidebarconversationrow--not-sent-selected",
		roster::ROW,
		roster::room_not_sent_selected,
	),
	scene(
		"navigation-appsidebarconversationrow--open-row-with-mission-strips",
		roster::ROW_WITH_STRIPS,
		roster::room_with_strips,
	),
	scene(
		"navigation-appsidebarconversationrow--pile-whole-at-the-default-sidebar",
		roster::ROW,
		roster::room_five_bots,
	),
	scene(
		"navigation-appsidebarconversationrow--pile-whole-at-the-narrowest-sidebar",
		roster::NARROW_ROW,
		roster::room_five_bots,
	),
	scene(
		"navigation-appsidebarconversationrow--pinned-conversation-with-a-working-bot",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--red-shield-key-row",
		roster::ROW,
		roster::room_shield_key,
	),
	scene("navigation-appsidebarconversationrow--row-in-blue", roster::ROW, roster::room_in_blue),
	scene("navigation-appsidebarconversationrow--row-in-cyan", roster::ROW, roster::room_in_cyan),
	scene("navigation-appsidebarconversationrow--row-in-green", roster::ROW, roster::room_in_green),
	scene(
		"navigation-appsidebarconversationrow--row-in-orange",
		roster::ROW,
		roster::room_in_orange,
	),
	scene("navigation-appsidebarconversationrow--row-in-pink", roster::ROW, roster::room_in_pink),
	scene(
		"navigation-appsidebarconversationrow--row-in-purple",
		roster::ROW,
		roster::room_in_purple,
	),
	scene("navigation-appsidebarconversationrow--row-in-red", roster::ROW, roster::room_in_red),
	scene(
		"navigation-appsidebarconversationrow--row-in-yellow",
		roster::ROW,
		roster::room_in_yellow,
	),
	scene(
		"navigation-appsidebarconversationrow--row-menu-opens-in-a-new-tab",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--row-with-a-badge-and-a-pile",
		roster::ROW,
		roster::room_badge_and_pile,
	),
	scene(
		"navigation-appsidebarconversationrow--row-with-five-bots",
		roster::ROW,
		roster::room_five_bots,
	),
	scene(
		"navigation-appsidebarconversationrow--row-with-one-bot",
		roster::ROW,
		roster::room_one_bot,
	),
	scene(
		"navigation-appsidebarconversationrow--row-with-three-bots",
		roster::ROW,
		roster::room_three_bots,
	),
	scene(
		"navigation-appsidebarconversationrow--row-with-two-bots",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--row-without-icon-or-colour",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--working-conversation-keeps-its-timestamp",
		roster::ROW,
		roster::room_answered,
	),
	scene(
		"navigation-appsidebarconversationrow--working-conversation-waiting-on-one-background-task",
		roster::ROW,
		roster::room_waiting_on_one,
	),
	scene(
		"navigation-appsidebarconversationrow--working-conversation-waiting-on-two-background-tasks",
		roster::ROW,
		roster::room_waiting_on_two,
	),
	Scene {
		id: "navigation-appsidebarroster--border-on-hovered-and-selected-rows",
		size: roster::ROSTER,
		tabs: 0,
		pointer: Pointer::EntersAtSnap("roster-row-desk-room"),
		typed: "",
		view: roster::roster_complete,
	},
	scene(
		"navigation-appsidebarroster--collapsed-section-skipped",
		roster::COLLAPSED_ROSTER,
		roster::roster_collapsed_section,
	),
	scene("navigation-appsidebarroster--complete", roster::ROSTER, roster::roster_complete),
	scene(
		"navigation-appsidebarroster--drag-over-the-sorted-zone",
		roster::TALL_ROSTER,
		roster::roster_drag_over_sorted,
	),
	scene("navigation-appsidebarroster--idle", roster::ROSTER, roster::roster_complete),
	focused(
		"navigation-appsidebarroster--keyboard-moves-a-pinned-row-or-section",
		roster::TALL_ROSTER,
		2,
		roster::roster_keyboard_moved,
	),
	scene(
		"navigation-appsidebarroster--lifted-row-with-neighbours-shifted",
		roster::TALL_ROSTER,
		roster::roster_lifted_row,
	),
	scene(
		"navigation-appsidebarroster--lifted-section",
		roster::TALL_ROSTER,
		roster::roster_lifted_section,
	),
	scene(
		"navigation-appsidebarroster--pinned-row-lifted-out-of-its-section",
		roster::TALL_ROSTER,
		roster::roster_lifted_out_of_section,
	),
	scene(
		"navigation-appsidebarroster--pinned-zone-then-sorted-zone",
		roster::ROSTER,
		roster::roster_complete,
	),
	scene(
		"navigation-appsidebarroster--reading-more",
		roster::TALL_ROSTER,
		roster::roster_reading_more,
	),
	scene(
		"navigation-appsidebarroster--roster-needing-you",
		roster::TALL_ROSTER,
		roster::roster_needing_you,
	),
	scene(
		"navigation-appsidebarroster--row-renders-only-when-its-own-props-change",
		roster::ROSTER,
		roster::roster_renamed,
	),
	scene(
		"navigation-appsidebarrostermenu--loose-run-section-then-loose-run",
		roster::MENU,
		roster::menu_loose_run,
	),
	scene(
		"navigation-appsidebarrostermenu--pinned-section-then-pinned-conversation",
		roster::MENU,
		roster::menu_pinned_section_then_room,
	),
	scene(
		"navigation-appsidebarrosterparts--empty-section-drop",
		roster::PART,
		roster::parts_empty_section_drop,
	),
	scene(
		"navigation-appsidebarrosterparts--working-bot-avatar",
		roster::PART,
		roster::parts_working_avatar,
	),
	scene(
		"navigation-appsidebarrosterparts--zone-separator",
		roster::PART,
		roster::parts_zone_separator,
	),
	scene(
		"navigation-appsidebarsection--label-around-a-name",
		roster::SECTION,
		roster::section_label,
	),
	scene("navigation-appsidebarsection--open-section", roster::SECTION, roster::section_open),
	scene("navigation-sidebarlistrow--all-slots", roster::LIST_ROW, roster::list_row_all_slots),
	scene("navigation-sidebarlistrow--box-metrics", roster::LIST_ROW, roster::list_row_box_metrics),
	scene(
		"navigation-sidebarlistrow--height-without-a-detail",
		roster::LIST_ROW,
		roster::list_row_height_without_detail,
	),
	scene(
		"navigation-sidebarlistrow--long-content",
		roster::LIST_ROW,
		roster::list_row_long_content,
	),
	scene("navigation-sidebarlistrow--muted-name", roster::LIST_ROW, roster::list_row_muted_name),
	focused(
		"navigation-sidebarlistrow--name-only",
		roster::LIST_ROW,
		1,
		roster::list_row_name_only,
	),
	scene("navigation-sidebarlistrow--pressed", roster::LIST_ROW, roster::list_row_pressed),
	scene(
		"navigation-sidebarlistrow--preview-from-nodes",
		roster::LIST_ROW,
		roster::list_row_preview_from_nodes,
	),
	scene(
		"navigation-sidebarlistrow--skin-matches-menu-button",
		roster::LIST_ROW,
		roster::list_row_skin_matches_menu_button,
	),
	scene(
		"navigation-sidebarlistrow--with-badge-dot",
		roster::LIST_ROW,
		roster::list_row_badge_dot,
	),
	scene(
		"navigation-sidebarlistrow--with-full-title",
		roster::LIST_ROW,
		roster::list_row_full_title,
	),
	scene(
		"navigation-sidebarlistrow--with-preview",
		roster::LIST_ROW,
		roster::list_row_with_preview,
	),
	scene("navigation-sidebarlistrow--with-strips", roster::LIST_ROW, roster::list_row_with_strips),
	scene(
		"navigation-sidebarlistrow--with-title-cut-before-name",
		roster::LIST_ROW,
		roster::list_row_title_cut,
	),
	scene(
		"navigation-sidebarlistrow--with-trailing-badge-and-timestamp",
		roster::LIST_ROW,
		roster::list_row_trailing_badge,
	),
	scene("navigation-sidebarlistrow--working-preview", roster::LIST_ROW, roster::list_row_working),
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
