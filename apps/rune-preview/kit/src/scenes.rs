use std::cell::RefCell;
use std::collections::HashMap;

use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::surfaces::s02_rail;
use crate::surfaces::s10_agent_settings::Field;
use crate::surfaces::s10_agent_settings::agent::{Effort, Mode, OutputStyle};
use crate::surfaces::s10_agent_settings::shell::Entry;
use crate::surfaces::s10_agent_settings::skills::{FileFailure, Section};
use crate::tokens::{self, SPACING, Tokens};
use agent_settings::{
	ChangeCase, DIALOG, EditorCase, FILES, FilesCase, HistoryCase, Look, PAGE, PANEL, RUNTIME,
	RuntimeCase, SCREEN as SETTINGS_SCREEN, SkillsCase,
};

mod agent_settings;
mod approvals;
mod boards;
mod feedback;
mod forms;
mod library;
mod missions;
mod navigation;
mod overlays;
mod person_settings;
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
	pub keys: &'static str,
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
const PALETTE: (f32, f32) = (800.0, 720.0);
const FIELDS: (f32, f32) = (512.0, 520.0);
const ABOUT: (f32, f32) = (640.0, 760.0);
const SETTINGS: (f32, f32) = person_settings::DIALOG_SCENE;
const SCREEN: (f32, f32) = (1180.0, 720.0);
const QUESTION_PANEL: (f32, f32) = (608.0, 520.0);
const QUESTION_PANEL_TALL: (f32, f32) = (608.0, 640.0);
const SIDE: (f32, f32) = (590.0, 480.0);
const SIDE_TALL: (f32, f32) = (590.0, 560.0);
const SIDE_STACK: (f32, f32) = (590.0, 1180.0);
const NARROW: (f32, f32) = (352.0, 640.0);
const ANSWERED: (f32, f32) = (704.0, 420.0);
const ANSWERED_LONG: (f32, f32) = (512.0, 360.0);
const MARK_SIDE: f32 = 22.0;

const fn scene(id: &'static str, size: (f32, f32), view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::Away, typed: "", keys: "", view }
}

const fn focused(
	id: &'static str,
	size: (f32, f32),
	tabs: usize,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size, tabs, pointer: Pointer::Away, typed: "", keys: "", view }
}

const fn typed(
	id: &'static str,
	tabs: usize,
	text: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: STORY, tabs, pointer: Pointer::Away, typed: text, keys: "", view }
}

const fn queried(
	id: &'static str,
	tabs: usize,
	text: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: PALETTE, tabs, pointer: Pointer::Away, typed: text, keys: "", view }
}

const fn keyed(
	id: &'static str,
	size: (f32, f32),
	tabs: usize,
	typed: &'static str,
	keys: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size, tabs, pointer: Pointer::Away, typed, keys, view }
}

const fn hovered(
	id: &'static str,
	size: (f32, f32),
	key: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::EntersAtSnap(key), typed: "", keys: "", view }
}

const fn pointed(
	id: &'static str,
	pointer: Pointer,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: STORY, tabs: 0, pointer, typed: "", keys: "", view }
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
	scene("navigation-searchresultrow--message", STORY, person_settings::row_message),
	scene(
		"navigation-searchresultrow--message-from-you",
		STORY,
		person_settings::row_message_from_you,
	),
	scene("navigation-searchresultrow--chat-group", STORY, person_settings::row_chat_group),
	scene("navigation-searchresultrow--chat-solo", STORY, person_settings::row_chat_solo),
	scene("navigation-searchresultrow--themes-chat-solo", STORY, person_settings::row_chat_solo),
	scene("navigation-searchresultrow--themes-chat-group", STORY, person_settings::row_chat_group),
	scene(
		"navigation-searchresultrow--themes-chat-group-picked-icon",
		STORY,
		person_settings::row_chat_group_picked_icon,
	),
	scene(
		"navigation-searchresultrow--themes-chat-group-free-hue",
		STORY,
		person_settings::row_chat_group_free_hue,
	),
	scene("navigation-searchresultrow--mission", STORY, person_settings::row_mission),
	scene("navigation-searchresultrow--routine", STORY, person_settings::row_routine),
	scene("navigation-searchresultrow--active", STORY, person_settings::row_active),
	scene("navigation-searchresultrow--long-content", STORY, person_settings::row_long_content),
	focused("navigation-searchresultrow--activated", STORY, 1, person_settings::row_message),
	queried("overlays-searchpalette--default", 0, "parser", person_settings::palette_default),
	queried("overlays-searchpalette--one-kind", 0, "parser", person_settings::palette_messages),
	queried("overlays-searchpalette--changing-tab", 0, "parser", person_settings::palette_messages),
	queried("overlays-searchpalette--one-hit", 0, "parser", person_settings::palette_one_hit),
	queried("overlays-searchpalette--many-hits", 0, "parser", person_settings::palette_many_hits),
	queried("overlays-searchpalette--resting", 0, "", person_settings::palette_resting_chats),
	queried(
		"overlays-searchpalette--resting-messages",
		0,
		"",
		person_settings::palette_resting_messages,
	),
	queried(
		"overlays-searchpalette--resting-one-kind",
		0,
		"",
		person_settings::palette_resting_chats,
	),
	queried(
		"overlays-searchpalette--resting-kind-empty",
		0,
		"",
		person_settings::palette_resting_kind_empty,
	),
	queried(
		"overlays-searchpalette--resting-nothing",
		0,
		"",
		person_settings::palette_resting_nothing,
	),
	queried(
		"overlays-searchpalette--resting-loading",
		0,
		"",
		person_settings::palette_resting_loading,
	),
	queried(
		"overlays-searchpalette--resting-all-loading",
		0,
		"",
		person_settings::palette_resting_all_loading,
	),
	queried("overlays-searchpalette--empty", 0, "parser", person_settings::palette_empty),
	queried("overlays-searchpalette--loading", 0, "parser", person_settings::palette_loading),
	queried(
		"overlays-searchpalette--loading-first-query",
		0,
		"parser",
		person_settings::palette_loading_first_query,
	),
	queried(
		"overlays-searchpalette--arrow-key-tabs",
		3,
		"parser",
		person_settings::palette_messages,
	),
	queried(
		"overlays-searchpalette--reduced-motion",
		0,
		"parser",
		person_settings::palette_reduced_motion,
	),
	scene("settings-user-appearancefields--default", FIELDS, person_settings::appearance_default),
	scene(
		"settings-user-appearancefields--in-french",
		FIELDS,
		person_settings::appearance_in_french,
	),
	scene("settings-user-appearancefields--dark", FIELDS, person_settings::appearance_dark),
	scene(
		"settings-user-notificationfields--default",
		FIELDS,
		person_settings::notifications_default,
	),
	scene(
		"settings-user-notificationfields--all-off",
		FIELDS,
		person_settings::notifications_all_off,
	),
	scene(
		"settings-user-notificationfields--in-french",
		FIELDS,
		person_settings::notifications_in_french,
	),
	scene(
		"settings-user-languagefields--following-the-machine",
		FIELDS,
		person_settings::language_machine,
	),
	scene("settings-user-languagefields--chosen", FIELDS, person_settings::language_chosen),
	scene(
		"settings-user-languagefields--back-to-the-machine",
		FIELDS,
		person_settings::language_machine,
	),
	scene("settings-user-languagefields--dark", FIELDS, person_settings::language_english),
	scene("settings-user-diagnosticsfields--idle", FIELDS, person_settings::diagnostics_idle),
	scene(
		"settings-user-diagnosticsfields--clear-log-confirming",
		FIELDS,
		person_settings::diagnostics_confirming,
	),
	scene("settings-user-aboutfields--up-to-date", ABOUT, person_settings::about_up_to_date),
	scene("settings-user-aboutfields--checking", ABOUT, person_settings::about_checking),
	scene("settings-user-aboutfields--update-available", ABOUT, person_settings::about_available),
	scene("settings-user-aboutfields--downloading", ABOUT, person_settings::about_downloading),
	scene("settings-user-aboutfields--ready-to-restart", ABOUT, person_settings::about_ready),
	scene(
		"settings-user-aboutfields--companions-still-running",
		ABOUT,
		person_settings::about_still_running,
	),
	scene("settings-user-aboutfields--download-failed", ABOUT, person_settings::about_failed),
	scene("settings-user-aboutfields--beta-available", ABOUT, person_settings::about_beta),
	scene(
		"settings-user-aboutfields--about-getting-started",
		ABOUT,
		person_settings::about_getting_started,
	),
	scene(
		"settings-user-aboutfields--about-nothing-to-import",
		ABOUT,
		person_settings::about_nothing_to_import,
	),
	scene("forms-profilepicturefield--default", STORY, person_settings::picture_default),
	scene("forms-profilepicturefield--empty", STORY, person_settings::picture_empty),
	scene("forms-profilepicturefield--drawn", STORY, person_settings::picture_drawn),
	scene("settings-user-yourdevices--default", SETTINGS, person_settings::devices_default),
	scene("settings-user-yourdevices--confirming", SETTINGS, person_settings::devices_confirming),
	scene("settings-user-yourdevices--removing", SETTINGS, person_settings::devices_removing),
	scene("settings-user-yourdevices--error", SETTINGS, person_settings::devices_error),
	scene("settings-user-yourdevices--empty", SETTINGS, person_settings::devices_empty),
	scene("settings-user-yourdevices--loading", SETTINGS, person_settings::devices_loading),
	scene("settings-user-usersettingsdialog--default", SETTINGS, person_settings::dialog_default),
	scene(
		"settings-user-usersettingsdialog--opens-on-appearance-without-an-account",
		SETTINGS,
		person_settings::dialog_without_account,
	),
	scene("settings-user-usersettingsdialog--empty", SETTINGS, person_settings::dialog_empty),
	scene(
		"settings-user-usersettingsdialog--appearance",
		SETTINGS,
		person_settings::dialog_appearance,
	),
	scene(
		"settings-user-usersettingsdialog--notifications",
		SETTINGS,
		person_settings::dialog_notifications,
	),
	scene(
		"settings-user-usersettingsdialog--language-tab",
		SETTINGS,
		person_settings::dialog_language,
	),
	scene("settings-user-usersettingsdialog--skills", SETTINGS, person_settings::dialog_skills),
	scene("settings-user-usersettingsdialog--no-skills", SETTINGS, person_settings::dialog_skills),
	scene(
		"settings-user-usersettingsdialog--with-a-long-skill",
		SETTINGS,
		person_settings::dialog_skills,
	),
	scene(
		"settings-user-usersettingsdialog--applications",
		SETTINGS,
		person_settings::dialog_applications,
	),
	scene(
		"settings-user-usersettingsdialog--opens-on-an-application",
		SETTINGS,
		person_settings::dialog_applications,
	),
	scene(
		"settings-user-usersettingsdialog--opens-on-a-missing-application",
		SETTINGS,
		person_settings::dialog_applications,
	),
	scene(
		"settings-user-usersettingsdialog--without-applications",
		SETTINGS,
		person_settings::dialog_without_account,
	),
	scene("settings-user-usersettingsdialog--history", SETTINGS, person_settings::dialog_history),
	scene(
		"settings-user-usersettingsdialog--diagnostics",
		SETTINGS,
		person_settings::dialog_diagnostics,
	),
	scene("settings-user-usersettingsdialog--about", SETTINGS, person_settings::dialog_about),
	scene(
		"settings-user-usersettingsdialog--account-loading",
		SETTINGS,
		person_settings::dialog_account_loading,
	),
	scene(
		"settings-user-usersettingsdialog--signed-out",
		SETTINGS,
		person_settings::dialog_signed_out,
	),
	scene("settings-user-usersettingsdialog--waiting", SETTINGS, person_settings::dialog_waiting),
	scene(
		"settings-user-usersettingsdialog--signed-in",
		SETTINGS,
		person_settings::dialog_signed_in,
	),
	scene(
		"settings-user-usersettingsdialog--signed-in-with-picture",
		SETTINGS,
		person_settings::dialog_signed_in_with_picture,
	),
	scene(
		"settings-user-usersettingsdialog--signed-in-on-the-free-plan",
		SETTINGS,
		person_settings::dialog_free_plan,
	),
	scene(
		"settings-user-usersettingsdialog--signed-in-without-a-plan",
		SETTINGS,
		person_settings::dialog_without_plan,
	),
	scene(
		"settings-user-usersettingsdialog--cant-reach-kiroshi",
		SETTINGS,
		person_settings::dialog_cant_reach,
	),
	scene(
		"settings-user-usersettingsdialog--request-expired",
		SETTINGS,
		person_settings::dialog_request_expired,
	),
	scene(
		"settings-user-usersettingsdialog--signed-out-from-the-site",
		SETTINGS,
		person_settings::dialog_signed_out_from_the_site,
	),
	focused(
		"settings-user-usersettingsdialog--default-focus-visible",
		SETTINGS,
		2,
		person_settings::dialog_default,
	),
	scene("settings-user-settingsscreen--account", SCREEN, person_settings::screen_account),
	scene("settings-user-settingsscreen--spaces", SCREEN, person_settings::screen_spaces),
	scene(
		"settings-user-settingsscreen--spaces-host-states",
		SCREEN,
		person_settings::screen_host_states,
	),
	scene("settings-user-settingsscreen--left-column", SCREEN, person_settings::screen_account),
	scene("settings-user-settingsscreen--rail-space-host", SCREEN, person_settings::screen_account),
	scene(
		"settings-user-settingsscreen--after-leaving-a-space",
		SCREEN,
		person_settings::screen_after_leaving,
	),
	scene(
		"settings-user-settingsscreen--without-optional-entries",
		SCREEN,
		person_settings::screen_without_optional,
	),
	scene("settings-user-settingsscreen--appearance", SCREEN, person_settings::screen_appearance),
	scene(
		"settings-user-settingsscreen--notifications",
		SCREEN,
		person_settings::screen_notifications,
	),
	scene("settings-user-settingsscreen--language", SCREEN, person_settings::screen_language),
	scene("settings-user-settingsscreen--skills", SCREEN, person_settings::screen_skills),
	scene("settings-user-settingsscreen--user-skills", SCREEN, person_settings::screen_skills),
	scene(
		"settings-user-settingsscreen--leaving-an-unsaved-skill-by-the-rail",
		SCREEN,
		person_settings::screen_skills,
	),
	scene(
		"settings-user-settingsscreen--applications",
		SCREEN,
		person_settings::screen_applications,
	),
	scene("settings-user-settingsscreen--history", SCREEN, person_settings::screen_history),
	scene("settings-user-settingsscreen--diagnostics", SCREEN, person_settings::screen_diagnostics),
	scene("settings-user-settingsscreen--about", SCREEN, person_settings::screen_about),
	scene("settings-user-settingsscreen--default-width", SCREEN, person_settings::screen_account),
	scene(
		"settings-user-settingsscreen--minimum-width",
		SCREEN,
		person_settings::screen_minimum_width,
	),
	scene(
		"settings-user-settingsscreen--maximum-width",
		SCREEN,
		person_settings::screen_maximum_width,
	),
	library::library("navigation-librarypanel--grid-all", library::grid_all),
	library::library("navigation-librarypanel--grid-middle-click", library::grid_all),
	library::library("navigation-librarypanel--grid-context-menu", library::grid_context_menu),
	library::library(
		"navigation-librarypanel--grid-actions-per-item",
		library::grid_actions_per_item,
	),
	library::library("navigation-librarypanel--grid-image-menu", library::grid_image_menu),
	library::library("navigation-librarypanel--grid-images", library::grid_images),
	library::library("navigation-librarypanel--grid-documents", library::grid_documents),
	library::library("navigation-librarypanel--new-board-action", library::grid_all),
	library::library("navigation-librarypanel--new-board-action-light", library::grid_all),
	library::library(
		"navigation-librarypanel--grid-document-preview-holds-no-control",
		library::preview_holds_no_control,
	),
	library::library(
		"navigation-librarypanel--grid-documents-across-spaces",
		library::documents_across_spaces,
	),
	library::library(
		"navigation-librarypanel--grid-documents-across-spaces-light",
		library::documents_across_spaces,
	),
	library::library(
		"navigation-librarypanel--filter-with-no-match",
		library::filter_with_no_match,
	),
	library::library(
		"navigation-librarypanel--empty-with-no-callbacks",
		library::empty_with_no_callbacks,
	),
	library::library(
		"navigation-librarypanel--empty-with-every-callback",
		library::empty_with_every_callback,
	),
	library::library(
		"navigation-librarypanel--empty-with-every-callback-light",
		library::empty_with_every_callback,
	),
	library::library("navigation-librarypanel--loading", library::loading),
	library::library("navigation-librarypanel--loading-light", library::loading),
	library::library(
		"navigation-librarypanel--whitespace-name-reads-untitled",
		library::whitespace_name,
	),
	library::library("navigation-librarypanel--long-names", library::long_names),
	library::library("navigation-librarypanel--dropping-files", library::dropping_files),
	library::library("navigation-librarypanel--dropping-one-file", library::dropping_one_file),
	library::library("navigation-librarypanel--added-to-the-grid", library::added_to_the_grid),
	library::library("navigation-librarypanel--import-long-names", library::import_long_names),
	library::library("navigation-librarypanel--import-failures", library::import_failures),
	library::searched(
		"navigation-librarypanel--search-with-no-match",
		"quarterly roadmap",
		library::search,
	),
	library::searched("navigation-librarypanel--search-filled", "dashboard", library::search),
	library::tabbed("navigation-librarypanel--focus-visible", 9, library::grid_all),
	library::library("navigation-librarytabstates--document-loading", library::document_loading),
	library::library(
		"navigation-librarytabstates--document-loading-dark",
		library::document_loading,
	),
	library::library("navigation-librarytabstates--image-loading", library::image_loading),
	library::library("navigation-librarytabstates--missing-item", library::missing_item),
	library::library("navigation-librarytabstates--missing-item-dark", library::missing_item),
	library::library("navigation-librarytabstates--unreadable-item", library::unreadable_item),
	library::library("navigation-librarytabstates--unreadable-item-dark", library::unreadable_item),
	library::library("navigation-librarydocumentview--default", library::document_default),
	library::library(
		"navigation-librarydocumentview--bar-matches-image-bar",
		library::document_default,
	),
	library::library("navigation-librarydocumentview--more-menu", library::document_more_menu),
	library::library(
		"navigation-librarydocumentview--whitespace-name-reads-untitled",
		library::document_whitespace_name,
	),
	library::library("navigation-librarydocumentview--member", library::document_member),
	library::library(
		"navigation-librarydocumentview--agents-writing",
		library::document_agents_writing,
	),
	library::library(
		"navigation-librarydocumentview--gallery-of-stored-images",
		library::document_gallery_of_stored_images,
	),
	library::tabbed(
		"navigation-librarydocumentview--rename-without-focus-target",
		4,
		library::document_default,
	),
	library::tabbed("navigation-librarydocumentview--focus-visible", 1, library::document_default),
	library::library("navigation-librarydocumentstates--empty-document", library::document_empty),
	library::library(
		"navigation-librarydocumentstates--files-dropped-in",
		library::document_files_dropped,
	),
	library::library(
		"navigation-librarydocumentstates--failed-import",
		library::document_failed_import,
	),
	library::library("navigation-librarydocumentstates--read-only", library::document_read_only),
	library::library(
		"navigation-librarynewdocumentdialog--meeting-notes-selected",
		library::meeting_notes_selected,
	),
	library::library(
		"navigation-librarynewdocumentdialog--blank-selected",
		library::blank_selected,
	),
	library::narrow(
		"navigation-librarynewdocumentdialog--narrow-window",
		library::meeting_notes_selected,
	),
	library::library("overlays-librarylightbox--default", library::lightbox_default),
	library::library("overlays-librarylightbox--host-more-menu", library::lightbox_host_more_menu),
	library::library(
		"overlays-librarylightbox--member-more-menu",
		library::lightbox_member_more_menu,
	),
	library::library(
		"overlays-librarylightbox--image-without-rename",
		library::lightbox_without_rename,
	),
	library::library(
		"overlays-librarylightbox--delete-confirmation",
		library::lightbox_delete_confirmation,
	),
	library::library("overlays-librarylightbox--back-button", library::lightbox_back_button),
	library::library("overlays-librarylightbox--backdrop-click", library::lightbox_first),
	library::library("overlays-librarylightbox--copy-check", library::lightbox_copy_check),
	library::library("overlays-librarylightbox--at-the-first-image", library::lightbox_first),
	library::library("overlays-librarylightbox--opened-with-the-panel", library::lightbox_default),
	library::library("overlays-librarylightbox--zoomed", library::lightbox_zoomed),
	library::library(
		"overlays-librarylightbox--image-menu-open",
		library::lightbox_image_menu_open,
	),
	library::library(
		"overlays-librarylightbox--image-menu-saving",
		library::lightbox_image_menu_saving,
	),
	library::threaded("navigation-documentpanel--in-thread", 0, library::document_panel_in_thread),
	library::threaded(
		"navigation-documentpanel--keeps-the-thread-when-toggled",
		0,
		library::document_panel_in_thread,
	),
	library::threaded(
		"navigation-documentpanel--after-a-drag",
		0,
		library::document_panel_after_a_drag,
	),
	library::threaded(
		"navigation-documentpanel--handle-with-keyboard-focus",
		1,
		library::document_panel_in_thread,
	),
	library::threaded(
		"navigation-documentpanel--header-aligned-with-the-thread-header",
		0,
		library::document_panel_in_thread,
	),
	library::threaded(
		"navigation-documentpanel--asked-under-the-room-left",
		0,
		library::document_panel_asked_under_the_room,
	),
	library::threaded(
		"navigation-documentpanel--capped-by-the-room-left",
		0,
		library::document_panel_capped,
	),
	library::threaded(
		"navigation-documentpanel--handle-with-keyboard-focus-dark",
		1,
		library::document_panel_in_thread,
	),
	library::threaded(
		"navigation-documentpanel--consecutive-answers-at-the-thread-floor",
		0,
		library::document_panel_capped,
	),
	library::threaded(
		"navigation-documentpanel--board-one-agent",
		0,
		library::document_board_panel,
	),
	library::threaded(
		"navigation-documentpanel--board-one-agent-dark",
		0,
		library::document_board_panel,
	),
	library::threaded(
		"navigation-documentpanel--board-several-agents",
		0,
		library::document_board_panel,
	),
	library::threaded(
		"navigation-documentpanel--board-several-agents-dark",
		0,
		library::document_board_panel,
	),
	library::threaded(
		"navigation-documentpanel--board-header-aligned-with-the-thread-header",
		0,
		library::document_board_panel,
	),
	library::small_window(
		"navigation-documentpanel--held-at-its-floor-in-the-smallest-window",
		library::document_panel_at_its_floor,
	),
	library::library("navigation-librarydocumenteditor--blank", library::editor),
	library::library(
		"navigation-librarydocumenteditor--whitespace-title-reads-untitled",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--title-at-rest", library::editor),
	library::library("navigation-librarydocumenteditor--title-focused-by-rename", library::editor),
	library::library(
		"navigation-librarydocumenteditor--rename-focuses-title-from-handle",
		library::editor,
	),
	library::library(
		"navigation-librarydocumenteditor--title-enter-moves-to-body",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--title-escape-restores", library::editor),
	library::library("navigation-librarydocumenteditor--title-click-away-keeps", library::editor),
	library::library("navigation-librarydocumenteditor--title-emptied-restores", library::editor),
	library::library(
		"navigation-librarydocumenteditor--title-restored-after-refused-rename",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--from-meeting-notes", library::editor),
	library::library("navigation-librarydocumenteditor--with-typed-text", library::editor),
	library::library("navigation-librarydocumenteditor--existing-document", library::editor),
	library::library("navigation-librarydocumenteditor--column-at-maximum-width", library::editor),
	library::library("navigation-librarydocumenteditor--round-trip-fixture", library::editor),
	library::library("navigation-librarydocumenteditor--blocks-rendered", library::editor),
	library::library("navigation-librarydocumenteditor--blocks-rendered-light", library::editor),
	library::library("navigation-librarydocumenteditor--bold-typed-then-rendered", library::editor),
	library::library("navigation-librarydocumenteditor--task-toggle", library::editor),
	library::library(
		"navigation-librarydocumenteditor--outside-change-while-typing",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--multi-paragraph-paste", library::editor),
	library::library("navigation-librarydocumenteditor--outside-title-change", library::editor),
	library::library("navigation-librarydocumenteditor--caret-moves", library::editor),
	library::library(
		"navigation-librarydocumenteditor--click-below-the-last-line",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--agents-writing", library::editor),
	library::library(
		"navigation-librarydocumenteditor--agent-run-held-then-fades",
		library::editor,
	),
	library::library(
		"navigation-librarydocumenteditor--person-caret-beside-agent",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--presence-people-only", library::editor),
	library::library("navigation-librarydocumenteditor--presence-agents-only", library::editor),
	library::library(
		"navigation-librarydocumenteditor--presence-agents-and-people",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--create-failure", library::editor),
	library::library("navigation-librarydocumenteditor--open-failure", library::editor),
	library::library("navigation-librarydocumenteditor--save-failure", library::editor),
	library::library("navigation-librarydocumenteditor--write-failure", library::editor),
	library::library("navigation-librarydocumenteditor--caret-share-failure", library::editor),
	library::library("navigation-librarydocumenteditor--format-without-change", library::editor),
	library::library(
		"navigation-librarydocumenteditor--a-1-toolbar-above-selection",
		library::editor,
	),
	library::library(
		"navigation-librarydocumenteditor--a-2-toolbar-over-two-lines",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--a-3-toolbar-button-hover", library::editor),
	library::library("navigation-librarydocumenteditor--a-4-toolbar-format-on", library::editor),
	library::library("navigation-librarydocumenteditor--a-5-toolbar-link-field", library::editor),
	library::library(
		"navigation-librarydocumenteditor--a-6-toolbar-flipped-below",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--bold-shortcut", library::editor),
	library::library("navigation-librarydocumenteditor--italic-shortcut", library::editor),
	library::library("navigation-librarydocumenteditor--strikethrough-shortcut", library::editor),
	library::library("navigation-librarydocumenteditor--code-shortcut", library::editor),
	library::library("navigation-librarydocumenteditor--link-shortcut", library::editor),
	library::library("navigation-librarydocumenteditor--escape-closes-toolbar", library::editor),
	library::library("navigation-librarydocumenteditor--toolbar-after-drag", library::editor),
	library::library(
		"navigation-librarydocumenteditor--toolbar-after-keyboard-selection",
		library::editor,
	),
	library::library("navigation-librarydocumenteditor--format-bold", library::editor),
	library::library("navigation-librarydocumenteditor--format-italic", library::editor),
	library::library("navigation-librarydocumenteditor--format-strikethrough", library::editor),
	library::library("navigation-librarydocumenteditor--format-inline-code", library::editor),
	library::library("navigation-librarydocumenteditor--format-link", library::editor),
	library::library("navigation-librarydocumenteditor--format-heading-2", library::editor),
	library::library("navigation-librarydocumenteditor--format-bullet-list", library::editor),
	library::library("navigation-librarydocumenteditor--gallery-images-resolved", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--slash-menu-near-bottom",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--slash-menu-near-bottom-dark",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--slash-menu-filtered", library::editor),
	library::library("navigation-librarydocumentblockeditor--block-handle-menu", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--drag-with-drop-indicator",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--bubble-and-document-parity",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--agents-writing", library::editor),
	library::library("navigation-librarydocumentblockeditor--focused-heading", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--focused-heading-dark",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--focused-list-item", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--focused-list-item-dark",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--focused-to-do-item", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--focused-to-do-item-dark",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--focused-quote", library::editor),
	library::library("navigation-librarydocumentblockeditor--focused-quote-dark", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--focused-every-inline-mark",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--focused-every-inline-mark-dark",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--callout-body-shows-its-marks",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--table-cell-shows-its-marks",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--escape-shows-the-character",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--autolink-shows-its-text",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--inline-image-is-one-node",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--nested-list-keeps-its-indent",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--emptied-blocks-keep-their-type",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--person-caret-at-block-edges",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--gallery-editing", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--gallery-editing-dark",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--gallery-tile-dragged",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--gallery-images-resolved",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--gallery-image-resolving",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--gallery-image-failing",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--checklist-editing", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--checklist-item-moved",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--callout-tone-switch", library::editor),
	library::library("navigation-librarydocumentblockeditor--table-editing", library::editor),
	library::library("navigation-librarydocumentblockeditor--table-editing-dark", library::editor),
	library::library(
		"navigation-librarydocumentblockeditor--code-language-chosen",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--web-page-link-updated",
		library::editor,
	),
	library::library(
		"navigation-librarydocumentblockeditor--web-page-link-failed",
		library::editor,
	),
	library::library("navigation-librarydocumentblockeditor--gallery-beyond-five", library::editor),
	library::narrow("navigation-librarydocumentblockeditor--narrow-column", library::editor),
	library::narrow(
		"navigation-librarydocumentblockeditor--gallery-editing-at-320",
		library::editor,
	),
	library::narrow("navigation-librarydocumentblockeditor--table-editing-at-320", library::editor),
	scene("board-boardcard--at-rest", boards::ANSWER, boards::card_at_rest),
	scene("board-boardcard--drawing", boards::ANSWER, boards::card_drawing),
	scene(
		"board-boardcard--drawing-without-object",
		boards::ANSWER,
		boards::card_drawing_without_object,
	),
	scene("board-boardcard--failed", boards::ANSWER, boards::card_failed),
	scene("board-boardcard--loading", boards::ANSWER, boards::card_loading),
	scene("board-boardcard--long-title", boards::NARROW_ANSWER, boards::card_long_title),
	scene("board-boardcard--open-beside", boards::ANSWER, boards::card_open_beside),
	scene("board-boardcard--owner-without-hue", boards::ANSWER, boards::card_owner_without_hue),
	scene("board-boardconnectorflyout--elbow", STORY, boards::flyout_elbow),
	scene(
		"board-boardconnectorflyout--elbow-in-yellow-space",
		STORY,
		boards::flyout_elbow_in_yellow_space,
	),
	scene("board-boardconnectorflyout--straight", STORY, boards::flyout_straight),
	scene("board-boarddock--connector-active", boards::DOCK_FRAME, boards::dock_connector),
	scene("board-boarddock--hand-active", boards::DOCK_FRAME, boards::dock_hand),
	scene("board-boarddock--image-active", boards::DOCK_FRAME, boards::dock_image),
	scene("board-boarddock--library-picker", boards::DOCK_FRAME, boards::dock_library),
	scene("board-boarddock--library-picker-empty", boards::DOCK_FRAME, boards::dock_library_empty),
	scene("board-boarddock--section-active", boards::DOCK_FRAME, boards::dock_section),
	focused("board-boarddock--select-active", boards::DOCK_FRAME, 1, boards::dock_select),
	scene("board-boarddock--shape-active", boards::DOCK_FRAME, boards::dock_shape),
	scene("board-boarddock--sticky-active", boards::DOCK_FRAME, boards::dock_sticky),
	scene("board-boarddock--text-active", boards::DOCK_FRAME, boards::dock_text),
	scene("board-boardimage--default", STORY, boards::image_default),
	scene("board-boardimage--with-source", STORY, boards::image_with_source),
	scene("board-boardlibrarycard--dragging", STORY, boards::library_card_dragging),
	scene("board-boardlibrarycard--resting", STORY, boards::library_card_resting),
	scene("board-boardlinkcard--default", STORY, boards::link_card_default),
	scene("board-boardlinkcard--long-content", STORY, boards::link_card_long_content),
	scene("board-boardminiature--empty-board", STORY, boards::miniature_empty_board),
	scene("board-boardminiature--every-object-kind", STORY, boards::miniature_every_object_kind),
	scene("board-boardminiature--wide-board", STORY, boards::miniature_wide_board),
	scene(
		"board-boardobjects--document-card-narrower-and-taller",
		boards::CANVAS,
		boards::objects_document_card_narrower,
	),
	scene(
		"board-boardobjects--document-card-wider-and-shorter",
		boards::CANVAS,
		boards::objects_document_card_wider,
	),
	scene(
		"board-boardobjects--image-narrower-and-taller",
		boards::CANVAS,
		boards::objects_image_narrower,
	),
	scene(
		"board-boardobjects--image-wider-and-shorter",
		boards::CANVAS,
		boards::objects_image_wider,
	),
	scene(
		"board-boardobjects--library-card-narrower-and-taller",
		boards::CANVAS,
		boards::objects_library_card_narrower,
	),
	scene(
		"board-boardobjects--library-card-wider-and-shorter",
		boards::CANVAS,
		boards::objects_library_card_wider,
	),
	scene(
		"board-boardobjects--link-and-image-pasted",
		boards::EVERY_OBJECT,
		boards::objects_link_and_image_pasted,
	),
	scene(
		"board-boardobjects--link-card-narrower-and-taller",
		boards::CANVAS,
		boards::objects_link_card_narrower,
	),
	scene(
		"board-boardobjects--link-card-wider-and-shorter",
		boards::CANVAS,
		boards::objects_link_card_wider,
	),
	scene(
		"board-boardobjects--section-narrower-and-taller",
		boards::CANVAS,
		boards::objects_section_narrower,
	),
	scene(
		"board-boardobjects--section-wider-and-shorter",
		boards::CANVAS,
		boards::objects_section_wider,
	),
	scene(
		"board-boardobjects--shape-narrower-and-taller",
		boards::CANVAS,
		boards::objects_shape_narrower,
	),
	scene(
		"board-boardobjects--shape-wider-and-shorter",
		boards::CANVAS,
		boards::objects_shape_wider,
	),
	scene(
		"board-boardobjects--sticky-narrower-and-taller",
		boards::CANVAS,
		boards::objects_sticky_narrower,
	),
	scene(
		"board-boardobjects--sticky-wider-and-shorter",
		boards::CANVAS,
		boards::objects_sticky_wider,
	),
	scene(
		"board-boardobjects--text-narrower-and-taller",
		boards::CANVAS,
		boards::objects_text_narrower,
	),
	scene("board-boardobjects--text-wider-and-shorter", boards::CANVAS, boards::objects_text_wider),
	scene(
		"board-boardpresence--agents-finished",
		boards::PRESENCE,
		boards::presence_agents_finished,
	),
	scene("board-boardpresence--long-content", boards::PRESENCE, boards::presence_long_content),
	scene("board-boardpresence--one-agent", boards::PRESENCE, boards::presence_one_agent),
	scene(
		"board-boardpresence--person-with-agents",
		boards::PRESENCE,
		boards::presence_person_with_agents,
	),
	scene("board-boardpresence--several-agents", boards::PRESENCE, boards::presence_several_agents),
	scene(
		"board-boardpresence--stop-all-failure",
		boards::PRESENCE,
		boards::presence_stop_all_failure,
	),
	scene("board-boardsection--blue", boards::SECTION, boards::section_blue),
	scene("board-boardsection--purple", boards::SECTION, boards::section_purple),
	scene("board-boardselectionbar--default", STORY, boards::selection_bar_default),
	scene("board-boardshape--ellipse", STORY, boards::shape_ellipse),
	scene("board-boardshape--fill-blue", STORY, boards::shape_fill_blue),
	scene("board-boardshape--fill-green", STORY, boards::shape_fill_green),
	scene("board-boardshape--fill-pink", STORY, boards::shape_fill_pink),
	scene("board-boardshape--fill-yellow", STORY, boards::shape_fill_yellow),
	scene("board-boardshape--rounded-rectangle", STORY, boards::shape_rounded_rectangle),
	scene("board-boardsticky--agent-author", STORY, boards::sticky_agent_author),
	scene("board-boardsticky--agent-writing-without-outline", STORY, boards::sticky_agent_writing),
	scene("board-boardsticky--colours", boards::COLOURS, boards::sticky_colours),
	scene("board-boardsticky--long-content", STORY, boards::sticky_long_content),
	scene("board-boardsticky--person-author", STORY, boards::sticky_person_author),
	scene("board-boardtext--body-only", STORY, boards::text_body_only),
	scene("board-boardtext--default", STORY, boards::text_default),
	scene("board-boardtext--heading-only", STORY, boards::text_heading_only),
	scene(
		"foundations-board-palette--stickies-and-sections-in-both-themes",
		boards::PALETTE,
		boards::board_palette,
	),
	scene(
		"navigation-boardcanvas--arrow-aimed-at-shape",
		boards::CANVAS,
		boards::arrow_aimed_at_shape,
	),
	scene("navigation-boardcanvas--arrow-bent-by-hand", boards::CANVAS, boards::arrow_bent_by_hand),
	scene(
		"navigation-boardcanvas--arrow-crossing-shape",
		boards::CANVAS,
		boards::arrow_crossing_shape,
	),
	scene("navigation-boardcanvas--arrow-curve", boards::CANVAS, boards::arrow_curve),
	scene(
		"navigation-boardcanvas--arrow-drawn-with-alt",
		boards::CANVAS,
		boards::arrow_drawn_with_alt,
	),
	scene(
		"navigation-boardcanvas--arrow-drawn-with-ctrl",
		boards::CANVAS,
		boards::arrow_drawn_with_ctrl,
	),
	scene("navigation-boardcanvas--arrow-elbow", boards::CANVAS, boards::arrow_elbow),
	scene("navigation-boardcanvas--arrow-exact-point", boards::CANVAS, boards::arrow_exact_point),
	scene(
		"navigation-boardcanvas--arrow-follows-moved-shape",
		boards::CANVAS,
		boards::arrow_follows_moved_shape,
	),
	scene(
		"navigation-boardcanvas--arrow-gesture-cancelled",
		boards::CANVAS,
		boards::arrow_gesture_cancelled,
	),
	scene("navigation-boardcanvas--arrow-head-sizes", boards::CANVAS, boards::arrow_head_sizes),
	scene(
		"navigation-boardcanvas--arrow-held-on-exact-point",
		boards::CANVAS,
		boards::arrow_held_on_exact_point,
	),
	scene("navigation-boardcanvas--arrow-label", boards::CANVAS, boards::arrow_label),
	scene("navigation-boardcanvas--arrow-label-edited", boards::CANVAS, boards::arrow_label_edited),
	scene("navigation-boardcanvas--arrow-label-slid", boards::CANVAS, boards::arrow_label_slid),
	scene("navigation-boardcanvas--arrow-loose-end", boards::CANVAS, boards::arrow_loose_end),
	scene(
		"navigation-boardcanvas--arrow-quick-release",
		boards::CANVAS,
		boards::arrow_quick_release,
	),
	scene(
		"navigation-boardcanvas--arrow-released-on-centre",
		boards::CANVAS,
		boards::arrow_released_on_centre,
	),
	scene(
		"navigation-boardcanvas--arrow-rerouted-by-hand",
		boards::CANVAS,
		boards::arrow_rerouted_by_hand,
	),
	scene("navigation-boardcanvas--arrows-after-board", boards::LAPTOP, boards::arrows_after_board),
	scene(
		"navigation-boardcanvas--cancel-draft-by-escape",
		boards::LAPTOP,
		boards::canvas_cancel_draft_by_escape,
	),
	scene(
		"navigation-boardcanvas--connector-being-drawn",
		boards::LAPTOP,
		boards::canvas_connector_being_drawn,
	),
	scene(
		"navigation-boardcanvas--connector-by-keyboard",
		boards::LAPTOP,
		boards::canvas_connector_by_keyboard,
	),
	scene(
		"navigation-boardcanvas--connector-with-presence-outline",
		boards::LAPTOP,
		boards::canvas_connector_with_presence_outline,
	),
	scene(
		"navigation-boardcanvas--create-connector",
		boards::LAPTOP,
		boards::canvas_create_connector,
	),
	scene(
		"navigation-boardcanvas--create-straight-connector",
		boards::LAPTOP,
		boards::canvas_create_straight_connector,
	),
	scene(
		"navigation-boardcanvas--draw-connector-with-tool",
		boards::LAPTOP,
		boards::canvas_draw_connector_with_tool,
	),
	Scene {
		id: "navigation-boardcanvas--edit-by-keyboard",
		size: boards::LAPTOP,
		tabs: 1,
		pointer: Pointer::Away,
		typed: boards::EDITED_TEXT,
		keys: "",
		view: boards::canvas_edit,
	},
	Scene {
		id: "navigation-boardcanvas--edit-by-pointer",
		size: boards::LAPTOP,
		tabs: 1,
		pointer: Pointer::Away,
		typed: boards::EDITED_TEXT,
		keys: "",
		view: boards::canvas_edit,
	},
	scene("navigation-boardcanvas--empty", boards::CANVAS, boards::canvas_empty),
	scene(
		"navigation-boardcanvas--files-dragged-over-images",
		boards::CANVAS,
		boards::canvas_files_images,
	),
	scene(
		"navigation-boardcanvas--files-dragged-over-mixed",
		boards::CANVAS,
		boards::canvas_files_mixed,
	),
	scene(
		"navigation-boardcanvas--files-dragged-over-one-file",
		boards::CANVAS,
		boards::canvas_files_one,
	),
	scene(
		"navigation-boardcanvas--files-dragged-over-unknown-count",
		boards::CANVAS,
		boards::canvas_files_unknown,
	),
	scene(
		"navigation-boardcanvas--five-hundred-objects",
		boards::CANVAS,
		boards::canvas_five_hundred_objects,
	),
	scene("navigation-boardcanvas--image-pasted", boards::LAPTOP, boards::canvas_image_pasted),
	scene(
		"navigation-boardcanvas--library-item-picked-on-second-canvas",
		boards::CANVAS,
		boards::canvas_library_picker,
	),
	scene("navigation-boardcanvas--link-pasted", boards::LAPTOP, boards::canvas_link_pasted),
	scene(
		"navigation-boardcanvas--loaded-with-objects",
		boards::CANVAS,
		boards::canvas_loaded_with_objects,
	),
	scene("navigation-boardcanvas--loading", boards::CANVAS, boards::canvas_loading),
	focused(
		"navigation-boardcanvas--move-by-keyboard",
		boards::LAPTOP,
		1,
		boards::canvas_move_by_keyboard,
	),
	scene(
		"navigation-boardcanvas--move-by-pointer",
		boards::LAPTOP,
		boards::canvas_move_by_pointer,
	),
	scene(
		"navigation-boardcanvas--move-connected-object",
		boards::LAPTOP,
		boards::canvas_move_connected_object,
	),
	scene(
		"navigation-boardcanvas--opens-at-full-size-on-two-stickies",
		boards::CANVAS,
		boards::canvas_opens_at_full_size_on_two_stickies,
	),
	scene(
		"navigation-boardcanvas--opens-framed-on-spread-content",
		boards::CANVAS,
		boards::canvas_opens_framed_on_spread_content,
	),
	scene(
		"navigation-boardcanvas--opens-framed-through-consumer-padding",
		boards::CANVAS,
		boards::canvas_opens_framed_through_consumer_padding,
	),
	scene(
		"navigation-boardcanvas--pan-with-hand-tool",
		boards::LAPTOP,
		boards::canvas_pan_with_hand_tool,
	),
	scene(
		"navigation-boardcanvas--place-images-with-tool",
		boards::LAPTOP,
		boards::canvas_place_images,
	),
	scene(
		"navigation-boardcanvas--place-section-with-tool",
		boards::LAPTOP,
		boards::canvas_place_section,
	),
	scene(
		"navigation-boardcanvas--place-shape-with-tool",
		boards::LAPTOP,
		boards::canvas_place_shape,
	),
	scene(
		"navigation-boardcanvas--place-sticky-with-tool",
		boards::LAPTOP,
		boards::canvas_place_sticky,
	),
	focused(
		"navigation-boardcanvas--place-text-with-tool",
		boards::LAPTOP,
		1,
		boards::canvas_place_text,
	),
	focused(
		"navigation-boardcanvas--resize-by-keyboard",
		boards::LAPTOP,
		2,
		boards::canvas_resize_by_keyboard,
	),
	scene(
		"navigation-boardcanvas--resize-by-pointer",
		boards::LAPTOP,
		boards::canvas_resize_by_pointer,
	),
	focused(
		"navigation-boardcanvas--select-by-keyboard",
		boards::LAPTOP,
		1,
		boards::canvas_sticky_selected,
	),
	scene(
		"navigation-boardcanvas--select-by-pointer",
		boards::LAPTOP,
		boards::canvas_sticky_selected,
	),
	scene(
		"navigation-boardcanvas--selected-object-removed-elsewhere",
		boards::LAPTOP,
		boards::canvas_selected_object_removed_elsewhere,
	),
	scene("navigation-boardcanvas--shape-selected", boards::LAPTOP, boards::canvas_shape_selected),
	scene(
		"navigation-boardcanvas--switch-connector-routing",
		boards::LAPTOP,
		boards::canvas_switch_connector_routing,
	),
	scene("navigation-boardcanvas--tile-dragged", boards::CANVAS, boards::canvas_tile_dragged),
	scene(
		"navigation-boardcanvas--tool-picked-while-selected",
		boards::LAPTOP,
		boards::canvas_tool_picked_while_selected,
	),
	scene(
		"navigation-boardcanvas--url-dragged-over",
		boards::CANVAS,
		boards::canvas_url_dragged_over,
	),
	scene(
		"navigation-boardcanvas--zoom-at-maximum",
		boards::CANVAS,
		boards::canvas_zoom_at_maximum,
	),
	scene(
		"navigation-boardcanvas--zoom-at-minimum",
		boards::CANVAS,
		boards::canvas_zoom_at_minimum,
	),
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
	scene("settings-bot-botgeneralfields--default", STORY, agent_settings::general_fields),
	scene("settings-bot-botidentityfields--chooses-the-same-file-twice", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Pictured)
	}),
	scene("settings-bot-botidentityfields--default", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Default)
	}),
	scene("settings-bot-botidentityfields--dropped-and-pasted", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Pictured)
	}),
	scene("settings-bot-botidentityfields--own-hue", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::OwnHue)
	}),
	scene("settings-bot-botidentityfields--picks-a-blot", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Red)
	}),
	scene("settings-bot-botidentityfields--removes-the-picture", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Default)
	}),
	scene("settings-bot-botidentityfields--takes-the-blot-off", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::NoColour)
	}),
	scene("settings-bot-botidentityfields--with-picture", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Pictured)
	}),
	scene("settings-bot-botidentityfields--working", PANEL, |t, s| {
		agent_settings::identity_fields(t, s, Look::Working)
	}),
	scene(
		"settings-bot-botinstructionsfields--default",
		PANEL,
		agent_settings::instructions_fields,
	),
	scene("settings-bot-botsettingsdialog--appearance", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::Appearance)
	}),
	scene("settings-bot-botsettingsdialog--closing", DIALOG, agent_settings::dialog_closed),
	scene(
		"settings-bot-botsettingsdialog--closing-over-an-unsaved-skill",
		DIALOG,
		agent_settings::dialog_leaving_skill,
	),
	scene("settings-bot-botsettingsdialog--danger-zone", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::Danger)
	}),
	scene("settings-bot-botsettingsdialog--default", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::General)
	}),
	scene("settings-bot-botsettingsdialog--empty", DIALOG, agent_settings::dialog_empty),
	scene("settings-bot-botsettingsdialog--free-hue", DIALOG, agent_settings::dialog_free_hue),
	scene("settings-bot-botsettingsdialog--history", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::History)
	}),
	scene(
		"settings-bot-botsettingsdialog--history-change",
		DIALOG,
		agent_settings::dialog_history_change,
	),
	scene("settings-bot-botsettingsdialog--instructions", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::Instructions)
	}),
	scene("settings-bot-botsettingsdialog--opened-on-danger", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::Danger)
	}),
	scene(
		"settings-bot-botsettingsdialog--pushed-pages",
		DIALOG,
		agent_settings::dialog_pushed_pages,
	),
	focused("settings-bot-botsettingsdialog--rail", DIALOG, 2, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::General)
	}),
	scene("settings-bot-botsettingsdialog--runtime", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::Runtime)
	}),
	scene("settings-bot-botsettingsdialog--scrolls-one-tab", DIALOG, |t, s| {
		agent_settings::dialog_entry(t, s, Entry::Approvals)
	}),
	scene(
		"settings-bot-botsettingsdialog--with-a-long-skill",
		DIALOG,
		agent_settings::dialog_long_skill,
	),
	scene(
		"settings-bot-botsettingsdialog--with-memory",
		DIALOG,
		agent_settings::dialog_with_memory,
	),
	scene(
		"settings-bot-botsettingsdialog--with-server-open",
		DIALOG,
		agent_settings::dialog_server_open,
	),
	scene(
		"settings-bot-botsettingsdialog--with-skill-open",
		DIALOG,
		agent_settings::dialog_skill_open,
	),
	scene(
		"settings-bot-botsettingsdialog--without-history",
		DIALOG,
		agent_settings::dialog_without_history,
	),
	scene("settings-bot-botsettingsdialog--working", DIALOG, agent_settings::dialog_working),
	scene("settings-bot-companionsettingsscreen--appearance", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Appearance)
	}),
	scene(
		"settings-bot-companionsettingsscreen--appearance-at-free-hue",
		SETTINGS_SCREEN,
		agent_settings::screen_free_hue,
	),
	scene("settings-bot-companionsettingsscreen--applications", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Applications)
	}),
	scene("settings-bot-companionsettingsscreen--approvals", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Approvals)
	}),
	scene("settings-bot-companionsettingsscreen--back-to-companions", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene(
		"settings-bot-companionsettingsscreen--back-to-conversations",
		SETTINGS_SCREEN,
		agent_settings::screen_back_to_conversations,
	),
	scene("settings-bot-companionsettingsscreen--companion-general", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene("settings-bot-companionsettingsscreen--danger-zone", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Danger)
	}),
	scene("settings-bot-companionsettingsscreen--danger-zone-light", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Danger)
	}),
	scene("settings-bot-companionsettingsscreen--default-width", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene(
		"settings-bot-companionsettingsscreen--delete-failed",
		SETTINGS_SCREEN,
		agent_settings::screen_delete_failed,
	),
	scene("settings-bot-companionsettingsscreen--general", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene("settings-bot-companionsettingsscreen--history", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::History)
	}),
	scene("settings-bot-companionsettingsscreen--instructions", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Instructions)
	}),
	focused("settings-bot-companionsettingsscreen--left-column", SETTINGS_SCREEN, 1, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	focused(
		"settings-bot-companionsettingsscreen--left-column-dark",
		SETTINGS_SCREEN,
		1,
		|t, s| agent_settings::screen_entry(t, s, Entry::General),
	),
	scene(
		"settings-bot-companionsettingsscreen--maximum-width",
		SETTINGS_SCREEN,
		agent_settings::screen_maximum_width,
	),
	scene(
		"settings-bot-companionsettingsscreen--minimum-width",
		SETTINGS_SCREEN,
		agent_settings::screen_minimum_width,
	),
	scene("settings-bot-companionsettingsscreen--runtime", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Runtime)
	}),
	scene("settings-bot-companionsettingsscreen--secrets", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Secrets)
	}),
	scene("settings-bot-companionsettingsscreen--skills", SETTINGS_SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Skills)
	}),
	scene("settings-bot-dangerzone--cancelled", STORY, agent_settings::danger_zone),
	scene("settings-bot-dangerzone--confirming", OVERLAY, agent_settings::danger_zone_confirming),
	scene("settings-bot-dangerzone--default", STORY, agent_settings::danger_zone),
	scene("settings-bot-dangerzone--deleted", STORY, agent_settings::danger_zone),
	scene("settings-bot-dangerzone--inert", STORY, agent_settings::danger_zone_inert),
	scene("settings-bot-dangerzone--playground", STORY, agent_settings::danger_zone),
	focused("settings-bot-dangerzone--focus-visible", STORY, 1, agent_settings::danger_zone),
	scene("settings-bot-memorypanel--clearing", PANEL, agent_settings::memory_clearing),
	scene("settings-bot-memorypanel--default", PANEL, agent_settings::memory_panel),
	scene("settings-bot-memorypanel--empty", PANEL, agent_settings::memory_empty),
	scene("settings-bot-permissionspanel--accept-edits", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, Some(Mode::AcceptEdits), false, false)
	}),
	scene("settings-bot-permissionspanel--ask-every-time", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, Some(Mode::Default), false, false)
	}),
	scene("settings-bot-permissionspanel--decide-alone", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, Some(Mode::Auto), false, false)
	}),
	scene("settings-bot-permissionspanel--never-ask", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, Some(Mode::DontAsk), false, false)
	}),
	focused("settings-bot-permissionspanel--picking-the-mode", PANEL, 1, |t, s| {
		agent_settings::permissions_scene(t, s, None, true, false)
	}),
	scene("settings-bot-permissionspanel--plan-first", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, Some(Mode::Plan), false, false)
	}),
	scene("settings-bot-permissionspanel--playground", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, None, false, false)
	}),
	scene("settings-bot-permissionspanel--refusing-a-malformed-rule", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, None, false, true)
	}),
	scene("settings-bot-permissionspanel--untouched", PANEL, |t, s| {
		agent_settings::permissions_scene(t, s, None, false, false)
	}),
	scene("settings-bot-runtimefields--concise", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RUNTIME)
	}),
	scene("settings-bot-runtimefields--effort-default", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RUNTIME)
	}),
	scene("settings-bot-runtimefields--effort-picked", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { effort: Some(Effort::High), ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--effort-unsupported", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { model: "nest-haiku-4-5", ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--empty", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { model: "", ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--filled", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { effort: Some(Effort::Medium), ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--model-switch-keeps-effort", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { effort: Some(Effort::High), ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--model-switch-resets-effort", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RUNTIME)
	}),
	scene("settings-bot-runtimefields--no-models", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { models: &[], model: "", ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--picking-a-model", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { picking: true, ..RUNTIME })
	}),
	scene("settings-bot-runtimefields--playground", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RUNTIME)
	}),
	scene("settings-bot-runtimefields--standard-answers", PANEL, |t, _| {
		agent_settings::runtime_scene(t, &RuntimeCase { style: OutputStyle::Standard, ..RUNTIME })
	}),
	scene("settings-plugins-commitdiff--added-file", PANEL, |t, _| {
		agent_settings::commit_diff(t, agent_settings::PATCHES[1])
	}),
	scene("settings-plugins-commitdiff--default", PANEL, |t, _| {
		agent_settings::commit_diff(t, agent_settings::PATCHES[0])
	}),
	scene("settings-plugins-commitdiff--long-content", PANEL, |t, _| {
		agent_settings::commit_diff(t, agent_settings::PATCHES[2])
	}),
	scene("settings-plugins-commitdiff--unreadable", PANEL, |t, _| {
		agent_settings::commit_diff(t, agent_settings::PATCHES[3])
	}),
	scene("settings-plugins-historychangepage--default", PAGE, |t, _| {
		agent_settings::change_page(t, ChangeCase::Default)
	}),
	scene("settings-plugins-historychangepage--empty", PAGE, |t, _| {
		agent_settings::change_page(t, ChangeCase::Empty)
	}),
	scene("settings-plugins-historychangepage--error", PAGE, |t, _| {
		agent_settings::change_page(t, ChangeCase::Error)
	}),
	scene("settings-plugins-historychangepage--loading", PAGE, |t, _| {
		agent_settings::change_page(t, ChangeCase::Loading)
	}),
	scene("settings-plugins-historychangepage--long-content", PAGE, |t, _| {
		agent_settings::change_page(t, ChangeCase::Many)
	}),
	scene("settings-plugins-historychangepage--retouched", PAGE, |t, _| {
		agent_settings::change_page(t, ChangeCase::Retouched)
	}),
	scene("settings-plugins-historypanel--default", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Default)
	}),
	scene("settings-plugins-historypanel--empty", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Empty)
	}),
	Scene {
		pointer: Pointer::EntersAtSnap("history-change-change-5"),
		..scene("settings-plugins-historypanel--hovered-row", PANEL, |t, s| {
			agent_settings::history_panel(t, s, HistoryCase::Default)
		})
	},
	scene("settings-plugins-historypanel--loading", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Loading)
	}),
	scene("settings-plugins-historypanel--long-content", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Long)
	}),
	scene("settings-plugins-historypanel--long-content-with-signals", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::LongSignalled)
	}),
	scene("settings-plugins-historypanel--retouched", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Default)
	}),
	focused("settings-plugins-historypanel--search-returns-focus", PANEL, 1, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Default)
	}),
	scene("settings-plugins-historypanel--search-without-match", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::NoMatch)
	}),
	focused("settings-plugins-historypanel--undo-by-keyboard", PANEL, 2, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Openable)
	}),
	scene("settings-plugins-historypanel--undoing", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Undoing)
	}),
	scene("settings-plugins-historypanel--undone", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Default)
	}),
	scene("settings-plugins-historypanel--unreadable", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Unreadable)
	}),
	scene("settings-plugins-historypanel--with-open-callback", PANEL, |t, s| {
		agent_settings::history_panel(t, s, HistoryCase::Openable)
	}),
	scene("settings-plugins-skilleditor--advanced", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Section(Section::Advanced))
	}),
	scene("settings-plugins-skilleditor--default", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Section(Section::Instructions))
	}),
	scene("settings-plugins-skilleditor--empty", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Empty)
	}),
	scene("settings-plugins-skilleditor--execution", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::SharedExecution)
	}),
	scene("settings-plugins-skilleditor--file-opened", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::FileOpened)
	}),
	scene("settings-plugins-skilleditor--files", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Files)
	}),
	scene("settings-plugins-skilleditor--forked-execution", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Section(Section::Execution))
	}),
	scene("settings-plugins-skilleditor--long-content", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Long)
	}),
	scene("settings-plugins-skilleditor--over-budget", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::OverBudget)
	}),
	scene("settings-plugins-skilleditor--system", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::System)
	}),
	scene("settings-plugins-skilleditor--tools", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Section(Section::Tools))
	}),
	scene("settings-plugins-skilleditor--triggering", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Section(Section::Triggering))
	}),
	scene("settings-plugins-skilleditor--with-confirmation", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Confirming)
	}),
	scene("settings-plugins-skilleditor--with-leaving", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::Leaving)
	}),
	scene("settings-plugins-skilleditor--zero-value", PAGE, |t, s| {
		agent_settings::skill_editor(t, s, EditorCase::ZeroValue)
	}),
	scene("settings-plugins-skillfilespanel--default", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Default)
	}),
	scene("settings-plugins-skillfilespanel--empty", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Empty)
	}),
	scene("settings-plugins-skillfilespanel--loading", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::LoadingFile)
	}),
	scene("settings-plugins-skillfilespanel--loading-paths", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::LoadingPaths)
	}),
	scene("settings-plugins-skillfilespanel--opened", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Opened)
	}),
	scene("settings-plugins-skillfilespanel--refused-delete", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Failed(FileFailure::Delete))
	}),
	scene("settings-plugins-skillfilespanel--refused-save", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Failed(FileFailure::Write))
	}),
	scene("settings-plugins-skillfilespanel--unreadable-file", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Failed(FileFailure::Read))
	}),
	scene("settings-plugins-skillfilespanel--with-confirmation", FILES, |t, s| {
		agent_settings::files_panel(t, s, FilesCase::Confirming)
	}),
	scene("settings-plugins-skillspanel--default", PANEL, |t, _| {
		agent_settings::skills_panel(t, SkillsCase::Default)
	}),
	scene("settings-plugins-skillspanel--empty", PANEL, |t, _| {
		agent_settings::skills_panel(t, SkillsCase::Empty)
	}),
	focused("settings-plugins-skillspanel--focus-visible", PANEL, 2, |t, _| {
		agent_settings::skills_panel(t, SkillsCase::Default)
	}),
	scene("settings-plugins-skillspanel--loading", PANEL, |t, _| {
		agent_settings::skills_panel(t, SkillsCase::Loading)
	}),
	scene("settings-plugins-skillspanel--long-content", PANEL, |t, _| {
		agent_settings::skills_panel(t, SkillsCase::Long)
	}),
	scene("settings-plugins-skillspanel--with-system-skill", PANEL, |t, _| {
		agent_settings::skills_panel(t, SkillsCase::WithSystem)
	}),
	focused(
		"conversation-tools-toolapproval--default",
		QUESTION_PANEL,
		2,
		approvals::approval_default,
	),
	scene(
		"conversation-tools-toolapproval--with-path",
		QUESTION_PANEL,
		approvals::approval_with_path,
	),
	focused("conversation-tools-toolquestion--nothing-chosen", SIDE, 1, approvals::nothing_chosen),
	scene("conversation-tools-toolquestion--option-chosen", SIDE, approvals::option_chosen),
	scene(
		"conversation-tools-toolquestion--chosen-row-follows-space-tint",
		QUESTION_PANEL,
		approvals::chosen_row_follows_space_tint,
	),
	hovered(
		"conversation-tools-toolquestion--option-row-hovered",
		SIDE,
		"question-option-Plan-0",
		approvals::option_row_hovered,
	),
	scene("conversation-tools-toolquestion--several-checked", SIDE, approvals::several_checked),
	keyed(
		"conversation-tools-toolquestion--own-answer-typing",
		SIDE,
		3,
		approvals::OWN_ANSWER,
		"",
		approvals::own_answer_typing,
	),
	scene("conversation-tools-toolquestion--several-questions", SIDE, approvals::several_questions),
	focused("conversation-tools-toolquestion--waiting-bar", SIDE, 1, approvals::waiting_bar_wide),
	focused("conversation-tools-toolquestion--answer-pressed", SIDE, 2, approvals::answer_pressed),
	scene(
		"conversation-tools-toolquestion--waiting-bar-narrow",
		NARROW,
		approvals::waiting_bar_narrow,
	),
	focused(
		"conversation-tools-toolquestion--long-question-narrow",
		NARROW,
		2,
		approvals::long_question_narrow,
	),
	focused(
		"conversation-tools-toolquestion--keyboard-focus-rings",
		QUESTION_PANEL,
		6,
		approvals::keyboard_focus_rings,
	),
	scene(
		"conversation-tools-toolquestion--single-select",
		QUESTION_PANEL,
		approvals::single_select,
	),
	scene(
		"conversation-tools-toolquestion--multi-select",
		QUESTION_PANEL_TALL,
		approvals::multi_select,
	),
	keyed(
		"conversation-tools-toolquestion--free-text",
		QUESTION_PANEL,
		0,
		approvals::FREE_TEXT,
		"",
		approvals::free_text,
	),
	keyed(
		"conversation-tools-toolquestion--digit-keys-choose",
		QUESTION_PANEL,
		1,
		"",
		"1",
		approvals::digit_keys_choose,
	),
	keyed(
		"conversation-tools-toolquestion--digit-keys-toggle",
		QUESTION_PANEL,
		1,
		"",
		"22",
		approvals::digit_keys_toggle,
	),
	keyed(
		"conversation-tools-toolquestion--digit-typed-into-own-answer",
		QUESTION_PANEL,
		2,
		"",
		"2",
		approvals::digit_keys_choose,
	),
	focused(
		"conversation-tools-toolquestion--keyboard-only",
		QUESTION_PANEL,
		2,
		approvals::keyboard_only,
	),
	keyed(
		"conversation-tools-toolquestion--four-questions",
		QUESTION_PANEL,
		0,
		approvals::PACKAGE_NAME,
		"",
		approvals::four_questions,
	),
	scene("conversation-tools-toolquestion--narrow", NARROW, approvals::narrow_four),
	scene(
		"conversation-tools-toolquestion--long-header-scrolls",
		NARROW,
		approvals::long_header_scrolls,
	),
	focused(
		"conversation-tools-toolquestion--arrow-key-tabs",
		QUESTION_PANEL,
		1,
		approvals::arrow_key_tabs,
	),
	scene(
		"conversation-tools-toolquestion--options-as-whole-answer",
		QUESTION_PANEL,
		approvals::options_as_whole_answer,
	),
	focused("conversation-tools-toolquestion--no-skip", QUESTION_PANEL, 1, approvals::no_skip),
	focused(
		"conversation-tools-toolquestion--entry-with-link",
		NARROW,
		1,
		approvals::entry_with_link,
	),
	keyed(
		"conversation-tools-toolquestion--entry-with-secret",
		QUESTION_PANEL,
		1,
		approvals::SECRET,
		"",
		approvals::entry_with_secret,
	),
	focused("conversation-tools-toolquestion--failure", QUESTION_PANEL, 1, approvals::failure),
	scene("conversation-tools-toolquestion--entry-narrow", NARROW, approvals::entry_narrow),
	scene(
		"conversation-tools-toolquestion--application-scope",
		QUESTION_PANEL,
		approvals::application_scope,
	),
	scene(
		"conversation-tools-toolquestion--failure-with-action",
		QUESTION_PANEL,
		approvals::failure_with_action,
	),
	scene(
		"conversation-tools-toolquestion--notice-in-queue",
		QUESTION_PANEL,
		approvals::notice_in_queue,
	),
	scene(
		"conversation-tools-toolquestion--inverse-buttons-idle",
		SIDE_STACK,
		approvals::inverse_buttons,
	),
	hovered(
		"conversation-tools-toolquestion--inverse-buttons-hover",
		SIDE_STACK,
		"pill-Framework-Send",
		approvals::inverse_buttons,
	),
	focused(
		"conversation-tools-toolquestion--inverse-buttons-focus-visible",
		SIDE_STACK,
		4,
		approvals::inverse_buttons,
	),
	scene(
		"conversation-tools-toolquestion--inverse-buttons-pending",
		SIDE_TALL,
		approvals::inverse_buttons_pending,
	),
	scene(
		"conversation-tools-toolquestion--themes-link-row-at-rest",
		SIDE,
		approvals::themes_link_row_at_rest,
	),
	scene(
		"conversation-tools-answeredquestioncard--you-answered",
		ANSWERED,
		approvals::you_answered,
	),
	scene(
		"conversation-tools-answeredquestioncard--member-answered",
		ANSWERED,
		approvals::member_answered,
	),
	scene(
		"conversation-tools-answeredquestioncard--multi-select",
		ANSWERED,
		approvals::answered_multi_select,
	),
	scene(
		"conversation-tools-answeredquestioncard--free-text",
		ANSWERED,
		approvals::answered_free_text,
	),
	scene(
		"conversation-tools-answeredquestioncard--long-content",
		ANSWERED_LONG,
		approvals::answered_long_content,
	),
];

pub static SURFACES: &[&[Scene]] = &[crate::surfaces::s01_chrome::SCENES];

pub fn every_scene() -> impl Iterator<Item = &'static Scene> {
	SCENES.iter().chain(SURFACES.iter().flat_map(|surface| surface.iter()))
}

pub struct SceneState {
	pub scene: &'static Scene,
	pub edit: TextEdit,
	pub chosen: Vec<usize>,
	pub picture: Option<Image>,
	pub mark: Option<Image>,
	pub library: library::LibraryScene,
	pub board_pictures: Vec<Image>,
	images: Option<ImageCache>,
	fields: RefCell<HashMap<Field, TextEdit>>,
}

impl SceneState {
	pub fn new(scene: &'static Scene) -> SceneState {
		SceneState {
			scene,
			edit: TextEdit::new(scene.typed),
			chosen: Vec::new(),
			picture: None,
			mark: None,
			library: library::LibraryScene::new(scene),
			board_pictures: Vec::new(),
			images: None,
			fields: RefCell::default(),
		}
	}
}

pub fn setup(s: &mut SceneState, waker: Waker) {
	let images = ImageCache::new(waker);
	let picture = images.svg(UPLOADED_AVATAR_IMAGE.as_bytes(), PICTURE_SIDE, PICTURE_SCALE);
	if let Err(failure) = picture.wait() {
		eprintln!("the avatar picture didn't decode: {}", failure.0);
	}
	let mark = images.svg(approvals::LINEAR_MARK.as_bytes(), MARK_SIDE, PICTURE_SCALE);
	if let Err(failure) = mark.wait() {
		eprintln!("the application mark didn't decode: {}", failure.0);
	}
	s.picture = Some(picture);
	s.mark = Some(mark);
	s.library.decode(&images);
	s.board_pictures =
		[boards::fixtures::TERRACE_SVG, boards::fixtures::POOL_SVG, boards::fixtures::PATIO_SVG]
			.map(|svg| {
				let board_picture =
					images.svg(svg.as_bytes(), boards::fixtures::PICTURE_SIDE, PICTURE_SCALE);
				if let Err(failure) = board_picture.wait() {
					eprintln!("a board picture didn't decode: {}", failure.0);
				}
				board_picture
			})
			.to_vec();
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
