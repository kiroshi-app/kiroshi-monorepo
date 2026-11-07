use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::tokens::{self, SPACING, Tokens};

mod boot;
mod feedback;
mod forms;
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
	scene("feedback-appbootscreen--window-surface", boot::WINDOW, boot::boot_screen_scene),
	scene("feedback-appbootscreen--window-surface-dark", boot::WINDOW, boot::boot_screen_scene),
	scene(
		"feedback-appbootscreen--centred-in-700-px-window",
		boot::SHORT_WINDOW,
		boot::boot_screen_scene,
	),
	scene(
		"feedback-appbootscreen--centred-in-1100-px-window",
		boot::TALL_WINDOW,
		boot::boot_screen_scene,
	),
	focused("feedback-appbootnotice--default", boot::WINDOW, 1, boot::boot_notice_scene),
	scene(
		"feedback-appbootnotice--centred-in-700-px-window",
		boot::SHORT_WINDOW,
		boot::boot_notice_scene,
	),
	scene(
		"feedback-appbootnotice--centred-in-1100-px-window",
		boot::TALL_WINDOW,
		boot::boot_notice_scene,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-companions-light",
		boot::WINDOW,
		boot::welcome_agents,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-companions-dark",
		boot::WINDOW,
		boot::welcome_agents,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-companions-wrapped-role-light",
		boot::WINDOW,
		boot::welcome_agents_wrapped_role,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-companions-wrapped-role-dark",
		boot::WINDOW,
		boot::welcome_agents_wrapped_role,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-conversations-light",
		boot::WINDOW,
		boot::welcome_conversations,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-conversations-dark",
		boot::WINDOW,
		boot::welcome_conversations,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-spaces-light",
		boot::WINDOW,
		boot::welcome_spaces,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-spaces-dark",
		boot::WINDOW,
		boot::welcome_spaces,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-your-tools-light",
		boot::WINDOW,
		boot::welcome_your_tools,
	),
	scene(
		"feedback-onboardingwelcomescreen--welcome-your-tools-dark",
		boot::WINDOW,
		boot::welcome_your_tools,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-login-found-light",
		boot::WINDOW,
		"",
		boot::connect_login_found,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-login-found-dark",
		boot::WINDOW,
		"",
		boot::connect_login_found,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-another-account-light",
		boot::WINDOW,
		"",
		boot::connect_another_account,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-another-account-dark",
		boot::WINDOW,
		"",
		boot::connect_another_account,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-nothing-found-light",
		boot::WINDOW,
		"",
		boot::connect_nothing_found,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-nothing-found-dark",
		boot::WINDOW,
		"",
		boot::connect_nothing_found,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-waiting-for-the-code-light",
		boot::WINDOW,
		"",
		boot::connect_waiting_for_the_code,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-waiting-for-the-code-dark",
		boot::WINDOW,
		"",
		boot::connect_waiting_for_the_code,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-connecting-light",
		boot::WINDOW,
		boot::PASTED_CODE,
		boot::connect_connecting,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-connecting-dark",
		boot::WINDOW,
		boot::PASTED_CODE,
		boot::connect_connecting,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-cancelled-light",
		boot::WINDOW,
		"",
		boot::connect_failed_cancelled,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-cancelled-dark",
		boot::WINDOW,
		"",
		boot::connect_failed_cancelled,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-timed-out-light",
		boot::WINDOW,
		"",
		boot::connect_failed_timed_out,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-timed-out-dark",
		boot::WINDOW,
		"",
		boot::connect_failed_timed_out,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-link-refused-light",
		boot::WINDOW,
		"",
		boot::connect_failed_link_refused,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-link-refused-dark",
		boot::WINDOW,
		"",
		boot::connect_failed_link_refused,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-agent-missing-light",
		boot::WINDOW,
		"",
		boot::connect_failed_agent_missing,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-failed-agent-missing-dark",
		boot::WINDOW,
		"",
		boot::connect_failed_agent_missing,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-key-field-light",
		boot::WINDOW,
		"",
		boot::connect_key_field,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-key-field-dark",
		boot::WINDOW,
		"",
		boot::connect_key_field,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-key-refused-light",
		boot::WINDOW,
		boot::REFUSED_KEY,
		boot::connect_key_refused,
	),
	boot::typed_in(
		"feedback-onboardingconnectscreen--connect-key-refused-dark",
		boot::WINDOW,
		boot::REFUSED_KEY,
		boot::connect_key_refused,
	),
	scene(
		"conversation-onboarding-onboardingaccountscreen--account-empty",
		boot::WINDOW,
		boot::account_empty,
	),
	scene(
		"conversation-onboarding-onboardingaccountscreen--account-waiting",
		boot::WINDOW,
		boot::account_waiting,
	),
	scene(
		"conversation-onboarding-onboardingaccountscreen--account-signed-in",
		boot::WINDOW,
		boot::account_signed_in,
	),
	scene("feedback-importscreen--list", boot::IMPORT_WINDOW, boot::import_list),
	scene("feedback-importscreen--list-dark", boot::IMPORT_WINDOW, boot::import_list),
	scene(
		"feedback-importscreen--list-existing-profile",
		boot::IMPORT_WINDOW,
		boot::import_list_existing_profile,
	),
	scene(
		"feedback-importscreen--list-existing-profile-dark",
		boot::IMPORT_WINDOW,
		boot::import_list_existing_profile,
	),
	scene("feedback-importscreen--importing", boot::IMPORT_WINDOW, boot::import_importing),
	scene("feedback-importscreen--importing-dark", boot::IMPORT_WINDOW, boot::import_importing),
	scene("feedback-importscreen--done", boot::IMPORT_WINDOW, boot::import_done),
	scene("feedback-importscreen--done-dark", boot::IMPORT_WINDOW, boot::import_done),
	scene("feedback-importscreen--only-agents", boot::IMPORT_WINDOW, boot::import_only_agents),
	scene("feedback-importscreen--only-agents-dark", boot::IMPORT_WINDOW, boot::import_only_agents),
	scene(
		"feedback-importscreen--only-instructions-and-skills",
		boot::IMPORT_WINDOW,
		boot::import_only_instructions_and_skills,
	),
	scene(
		"feedback-importscreen--only-instructions-and-skills-dark",
		boot::IMPORT_WINDOW,
		boot::import_only_instructions_and_skills,
	),
	scene(
		"feedback-importscreen--long-list-scrolled",
		boot::IMPORT_WINDOW,
		boot::import_long_list_scrolled,
	),
	scene(
		"feedback-importscreen--long-list-scrolled-dark",
		boot::IMPORT_WINDOW,
		boot::import_long_list_scrolled,
	),
	scene(
		"feedback-importscreen--nothing-selected",
		boot::IMPORT_WINDOW,
		boot::import_nothing_selected,
	),
	scene(
		"feedback-importscreen--nothing-selected-dark",
		boot::IMPORT_WINDOW,
		boot::import_nothing_selected,
	),
	scene(
		"feedback-importscreen--name-already-taken",
		boot::IMPORT_WINDOW,
		boot::import_name_already_taken,
	),
	scene(
		"feedback-importscreen--name-already-taken-dark",
		boot::IMPORT_WINDOW,
		boot::import_name_already_taken,
	),
	scene("feedback-importscreen--unreadable", boot::IMPORT_WINDOW, boot::import_unreadable),
	scene("feedback-importscreen--unreadable-dark", boot::IMPORT_WINDOW, boot::import_unreadable),
	scene("feedback-importscreen--partly-failed", boot::IMPORT_WINDOW, boot::import_partly_failed),
	scene(
		"feedback-importscreen--partly-failed-dark",
		boot::IMPORT_WINDOW,
		boot::import_partly_failed,
	),
	scene(
		"feedback-importscreen--again-from-settings",
		boot::IMPORT_WINDOW,
		boot::import_again_from_settings,
	),
	scene(
		"feedback-importscreen--again-from-settings-dark",
		boot::IMPORT_WINDOW,
		boot::import_again_from_settings,
	),
	scene("feedback-importrow--default", STORY, boot::import_row_default),
	scene("feedback-importrow--states", OVERLAY, boot::import_row_states),
	scene("feedback-importrow--states-dark", OVERLAY, boot::import_row_states),
	scene("feedback-importrow--long-content", STORY, boot::import_row_long_content),
	scene("overlays-noticesurface--error", OVERLAY, boot::notice_surface_error),
	scene(
		"overlays-noticesurface--closed-by-keyboard",
		OVERLAY,
		boot::notice_surface_closed_by_keyboard,
	),
	scene("overlays-noticesurface--repeated-failure", OVERLAY, boot::notice_surface_error),
	scene("overlays-noticesurface--with-report", OVERLAY, boot::notice_surface_with_report),
	scene("overlays-noticesurface--with-full-report", OVERLAY, boot::notice_surface_with_report),
	scene(
		"overlays-noticesurface--with-specs-only-report",
		OVERLAY,
		boot::notice_surface_with_report,
	),
	scene(
		"overlays-noticesurface--with-report-and-action",
		boot::NARROW,
		boot::notice_surface_with_report_and_action,
	),
	scene(
		"overlays-noticesurface--report-copied",
		boot::NARROW,
		boot::notice_surface_report_copied,
	),
	scene(
		"overlays-noticesurface--move-to-new-window-failed",
		OVERLAY,
		boot::notice_surface_move_to_new_window_failed,
	),
	scene(
		"overlays-noticesurface--move-to-new-window-failed-dark",
		OVERLAY,
		boot::notice_surface_move_to_new_window_failed,
	),
	scene(
		"overlays-noticesurface--describe-refused",
		OVERLAY,
		boot::notice_surface_describe_refused,
	),
	scene(
		"overlays-noticesurface--describe-refused-dark",
		OVERLAY,
		boot::notice_surface_describe_refused,
	),
	scene("overlays-noticesurface--stacked", OVERLAY, boot::notice_surface_stacked),
	scene("overlays-noticesurface--long-content", OVERLAY, boot::notice_surface_long_content),
	scene("overlays-noticesurface--dismissing", OVERLAY, boot::notice_surface_error),
	scene("overlays-noticesurface--with-dialog", OVERLAY, boot::notice_surface_with_dialog),
	scene("overlays-noticesurface--dark-theme", OVERLAY, boot::notice_surface_dark_theme),
	scene("overlays-noticesurface--reduced-motion", OVERLAY, boot::notice_surface_reduced_motion),
	scene("overlays-noticesurface--m-13-signed-out", OVERLAY, boot::notice_surface_signed_out),
	scene(
		"overlays-noticesurface--removed-with-space-mark",
		OVERLAY,
		boot::notice_surface_removed_with_space_mark,
	),
	scene(
		"overlays-noticesurface--removed-with-space-mark-at-free-hue",
		OVERLAY,
		boot::notice_surface_removed_at_free_hue,
	),
	scene("overlays-noticesurface--device-approved", OVERLAY, boot::notice_surface_device_approved),
	scene("overlays-noticesurface--device-rejected", OVERLAY, boot::notice_surface_device_rejected),
	scene("overlays-noticesurface--device-removed", OVERLAY, boot::notice_surface_device_removed),
	scene("feedback-notice--default", STORY, boot::notice_default),
	scene("feedback-notice--with-description", STORY, boot::notice_with_description),
	scene("feedback-notice--with-retry", STORY, boot::notice_with_retry),
	scene("feedback-notice--with-retry-label", STORY, boot::notice_with_retry_label),
	scene("feedback-notice--retry-busy", STORY, boot::notice_retry_busy),
	scene("feedback-notice--dismissible", STORY, boot::notice_dismissible),
	scene("feedback-notice--long-content", STORY, boot::notice_long_content),
	scene(
		"feedback-notice--join-waiting-relay-unreachable",
		STORY,
		boot::join_waiting_relay_unreachable,
	),
	scene(
		"feedback-notice--join-waiting-rekey-send-failed",
		STORY,
		boot::join_waiting_rekey_send_failed,
	),
	scene("feedback-notice--join-waiting-host-silent", STORY, boot::join_waiting_host_silent),
	scene("feedback-notice--join-waiting-socket-closed", STORY, boot::join_waiting_socket_closed),
	scene(
		"feedback-notice--join-waiting-rekey-not-verified",
		STORY,
		boot::join_waiting_rekey_not_verified,
	),
	scene("feedback-notice--join-waiting-not-member", STORY, boot::join_waiting_not_member),
	scene(
		"feedback-notice--join-waiting-unknown-instance",
		STORY,
		boot::join_waiting_unknown_instance,
	),
	scene(
		"feedback-notice--join-waiting-device-keys-unreadable",
		STORY,
		boot::join_waiting_device_keys_unreadable,
	),
	scene(
		"feedback-notice--join-waiting-device-awaiting-approval",
		STORY,
		boot::join_waiting_device_awaiting_approval,
	),
	scene(
		"feedback-notice--join-waiting-socket-url-failed",
		STORY,
		boot::join_waiting_socket_url_failed,
	),
	scene("feedback-notice--join-waiting-roster-missing", STORY, boot::join_waiting_roster_missing),
	scene(
		"feedback-notice--join-waiting-keychain-read-failed",
		STORY,
		boot::join_waiting_keychain_read_failed,
	),
	scene("feedback-notice--join-unexpected", STORY, boot::join_unexpected),
	scene("layout-fullwindowlayout--default", boot::WINDOW, boot::full_window_default),
	scene(
		"layout-fullwindowlayout--taller-than-the-window",
		boot::WINDOW,
		boot::full_window_taller,
	),
	scene("layout-screenlayout--header-only", SHELL, boot::screen_header_only),
	scene("layout-screenlayout--header-and-content", SHELL, boot::screen_header_and_content),
	scene(
		"layout-screenlayout--header-content-and-footer",
		SHELL,
		boot::screen_header_content_and_footer,
	),
	scene(
		"layout-screenlayout--column-width-in-wide-card",
		boot::CARD_WINDOW,
		boot::screen_column_width_in_wide_card,
	),
	scene(
		"layout-screenlayout--full-width-in-wide-card",
		boot::CARD_WINDOW,
		boot::screen_full_width_in_wide_card,
	),
	scene("conversation-message-emptystateshell--default", OVERLAY, boot::empty_default),
	scene("conversation-message-emptystateshell--with-action", OVERLAY, boot::empty_with_action),
	scene("conversation-message-emptystateshell--without-hint", OVERLAY, boot::empty_without_hint),
	scene("conversation-message-emptystateshell--long-content", OVERLAY, boot::empty_long_content),
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
