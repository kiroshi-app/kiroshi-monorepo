use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::surfaces::s02_rail;
use crate::tokens::{self, SPACING, Tokens};

mod feedback;
mod forms;
mod navigation;
mod overlays;
mod primitives;
mod rail;
mod space_avatar;
mod space_picker;

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

const fn hovered(
	id: &'static str,
	size: (f32, f32),
	key: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::EntersAtSnap(key), typed: "", view }
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
	scene("navigation-apprail--a-7-spaces-menu", rail::SPACES_WINDOW, rail::a7_spaces_menu),
	scene(
		"navigation-apprail--a-7-spaces-menu-attention-row",
		rail::SPACES_WINDOW,
		rail::a7_spaces_menu_attention_row,
	),
	scene("navigation-apprail--a-7-spaces-menu-dark", rail::SPACES_WINDOW, rail::a7_spaces_menu),
	scene("navigation-apprail--attention-dot", rail::RAIL_STAGE, rail::attention_dot),
	scene("navigation-apprail--attention-dot-dark", rail::RAIL_STAGE, rail::attention_dot),
	scene("navigation-apprail--conversations", rail::RAIL_STAGE, rail::conversations),
	scene("navigation-apprail--current-beside-idle-dark", rail::RAIL_STAGE, rail::conversations),
	scene("navigation-apprail--dark", rail::RAIL_STAGE, rail::with_dot),
	scene("navigation-apprail--done-dot", rail::RAIL_STAGE, rail::done_dot),
	scene("navigation-apprail--done-dot-dark", rail::RAIL_STAGE, rail::done_dot),
	scene("navigation-apprail--failed-dot", rail::RAIL_STAGE, rail::failed_dot),
	scene("navigation-apprail--failed-dot-dark", rail::RAIL_STAGE, rail::failed_dot),
	scene(
		"navigation-apprail--first-tab-under-title-bar",
		rail::SIDEBAR_STAGE,
		rail::rail_in_sidebar,
	),
	scene(
		"navigation-apprail--icon-states-side-by-side",
		rail::RAIL_STAGE,
		rail::icon_states_side_by_side,
	),
	hovered(
		"navigation-apprail--idle-entry-hovered",
		rail::RAIL_STAGE,
		s02_rail::RailPanel::Missions.key(),
		rail::conversations,
	),
	focused("navigation-apprail--keyboard-reach", rail::RAIL_STAGE, 1, rail::keyboard_reach),
	scene("navigation-apprail--library-dot", rail::RAIL_STAGE, rail::library_dot),
	scene("navigation-apprail--library-selected", rail::RAIL_STAGE, rail::library_selected),
	scene("navigation-apprail--missions-selected", rail::RAIL_STAGE, rail::missions_selected),
	scene("navigation-apprail--on-tinted-space", rail::RAIL_STAGE, rail::on_tinted_space),
	scene(
		"navigation-apprail--removed-panel-falls-back-to-conversations",
		rail::SIDEBAR_STAGE,
		rail::rail_in_sidebar,
	),
	scene("navigation-apprail--search-entry-at-rest", rail::RAIL_STAGE, rail::conversations),
	hovered(
		"navigation-apprail--search-entry-hovered",
		rail::RAIL_STAGE,
		s02_rail::SEARCH_KEY,
		rail::search_entry_hovered,
	),
	scene(
		"navigation-apprail--selection-moves-to-missions",
		rail::RAIL_STAGE,
		rail::missions_selected,
	),
	hovered(
		"navigation-apprail--space-logo-hovered",
		rail::RAIL_STAGE,
		s02_rail::SPACE_LOGO_KEY,
		rail::space_logo_hovered,
	),
	scene(
		"navigation-apprail--space-logo-without-space",
		rail::RAIL_STAGE,
		rail::space_logo_without_space,
	),
	scene(
		"navigation-apprail--space-settings-over-conversations",
		rail::RAIL_STAGE,
		rail::space_settings_over_conversations,
	),
	scene("navigation-apprail--spaces-menu-gestures", rail::RAIL_STAGE, rail::spaces_menu_gestures),
	scene("navigation-apprail--update-downloading", rail::RAIL_STAGE, rail::update_downloading),
	scene("navigation-apprail--update-idle", rail::RAIL_STAGE, rail::update_idle),
	scene("navigation-apprail--update-ready", rail::RAIL_STAGE, rail::update_ready),
	scene("navigation-apprail--update-waiting", rail::RAIL_STAGE, rail::update_waiting),
	scene("navigation-apprail--update-waiting-dark", rail::RAIL_STAGE, rail::update_waiting),
	scene(
		"navigation-apprail--user-settings-over-missions",
		rail::RAIL_STAGE,
		rail::user_settings_over_missions,
	),
	scene("navigation-apprail--with-dot", rail::RAIL_STAGE, rail::with_dot),
	scene(
		"navigation-apprail--without-library-handler",
		rail::RAIL_STAGE,
		rail::without_library_handler,
	),
	scene(
		"navigation-apprail--without-search-handler",
		rail::RAIL_STAGE,
		rail::without_search_handler,
	),
	scene(
		"navigation-appsidebarcarousel--list-per-space",
		rail::SIDEBAR_STAGE,
		rail::carousel_list_per_space,
	),
	scene(
		"navigation-spaceswitcher--badge-and-long-name",
		STORY,
		space_picker::badge_and_long_name,
	),
	scene(
		"navigation-spaceswitcher--badge-done-elsewhere",
		STORY,
		space_picker::badge_done_elsewhere,
	),
	scene(
		"navigation-spaceswitcher--badge-here",
		space_picker::MENU_STAGE,
		space_picker::badge_here,
	),
	scene("navigation-spaceswitcher--badge-ranking", STORY, space_picker::badge_ranking),
	scene("navigation-spaceswitcher--badges", STORY, space_picker::badges),
	scene("navigation-spaceswitcher--colourless", STORY, space_picker::colourless),
	scene("navigation-spaceswitcher--default", STORY, space_picker::default),
	scene("navigation-spaceswitcher--drag-dot-nowhere", STORY, space_picker::with_dots),
	scene("navigation-spaceswitcher--drag-dot-to-place", STORY, space_picker::with_dots),
	scene("navigation-spaceswitcher--free-hue", space_picker::MENU_STAGE, space_picker::free_hue),
	scene(
		"navigation-spaceswitcher--hosted-long-names",
		space_picker::MENU_STAGE,
		space_picker::hosted_long_names,
	),
	scene("navigation-spaceswitcher--invitation-at-rest", STORY, space_picker::invitation_at_rest),
	scene(
		"navigation-spaceswitcher--invitation-expired",
		space_picker::MENU_STAGE,
		space_picker::invitation_expired,
	),
	scene(
		"navigation-spaceswitcher--invitation-host-offline",
		space_picker::MENU_STAGE,
		space_picker::invitation_host_offline,
	),
	scene(
		"navigation-spaceswitcher--invitation-long-content",
		space_picker::MENU_STAGE,
		space_picker::invitation_long_content,
	),
	scene(
		"navigation-spaceswitcher--invitation-over-bot-badge",
		space_picker::MENU_STAGE,
		space_picker::invitation_over_bot_badge,
	),
	scene(
		"navigation-spaceswitcher--invitation-without-join-entry",
		space_picker::MENU_STAGE,
		space_picker::invitation_without_join_entry,
	),
	focused(
		"navigation-spaceswitcher--keyboard",
		space_picker::MENU_STAGE,
		1,
		space_picker::keyboard,
	),
	scene("navigation-spaceswitcher--long-content", STORY, space_picker::long_content),
	scene(
		"navigation-spaceswitcher--m-1-no-invitation",
		space_picker::MENU_STAGE,
		space_picker::m1_no_invitation,
	),
	scene(
		"navigation-spaceswitcher--m-10-failed-offline",
		space_picker::MENU_STAGE,
		space_picker::m10_failed_offline,
	),
	scene(
		"navigation-spaceswitcher--m-11-withdrawn",
		space_picker::MENU_STAGE,
		space_picker::m11_withdrawn,
	),
	scene(
		"navigation-spaceswitcher--m-2-invitation-waiting",
		space_picker::MENU_STAGE,
		space_picker::m2_invitation_waiting,
	),
	scene(
		"navigation-spaceswitcher--m-3-two-invitations-waiting",
		space_picker::MENU_STAGE,
		space_picker::m3_two_invitations_waiting,
	),
	scene(
		"navigation-spaceswitcher--m-4-accepting",
		space_picker::MENU_STAGE,
		space_picker::m4_accepting,
	),
	scene("navigation-spaceswitcher--m-5-joined", STORY, space_picker::m5_joined),
	scene(
		"navigation-spaceswitcher--m-6-unreachable",
		space_picker::MENU_STAGE,
		space_picker::m6_unreachable,
	),
	scene(
		"navigation-spaceswitcher--m-9-failed-servers",
		space_picker::MENU_STAGE,
		space_picker::m9_failed_servers,
	),
	scene("navigation-spaceswitcher--open", space_picker::MENU_STAGE, space_picker::open),
	focused(
		"navigation-spaceswitcher--opened-on-invitation",
		space_picker::MENU_STAGE,
		1,
		space_picker::opened_on_invitation,
	),
	scene(
		"navigation-spaceswitcher--single-space",
		space_picker::MENU_STAGE,
		space_picker::single_space,
	),
	scene(
		"navigation-spaceswitcher--themes-joined-space-menu",
		space_picker::MENU_STAGE,
		space_picker::themes_joined_space_menu,
	),
	scene(
		"navigation-spaceswitcher--themes-local-space-menu",
		space_picker::MENU_STAGE,
		space_picker::themes_local_space_menu,
	),
	scene(
		"navigation-spaceswitcher--themes-title-bar-hosts",
		STORY,
		space_picker::themes_title_bar_hosts,
	),
	scene("navigation-spaceswitcher--with-dots", STORY, space_picker::with_dots),
	scene("navigation-spaceswitcher--wrapped-dots", STORY, space_picker::wrapped_dots),
	scene("branding-spaceavatar--free-hue", STORY, space_avatar::free_hue),
	scene("branding-spaceavatar--local", STORY, space_avatar::local),
	scene("branding-spaceavatar--offline", STORY, space_avatar::offline),
	scene("branding-spaceavatar--rail-mixed-states", STORY, space_avatar::rail_mixed_states),
	scene("branding-spaceavatar--shared-online", STORY, space_avatar::shared_online),
	scene("branding-spaceavatar--sizes", STORY, space_avatar::sizes),
	scene(
		"branding-spaceavatar--spaces-menu-mixed-states",
		STORY,
		space_avatar::spaces_menu_mixed_states,
	),
	scene("branding-spaceavatar--states", space_avatar::STATES_STAGE, space_avatar::states),
	scene("branding-spaceavatar--without-name", STORY, space_avatar::without_name),
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
