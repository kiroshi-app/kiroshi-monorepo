use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::tokens::{self, SPACING, Tokens};

mod feedback;
mod forms;
mod navigation;
mod overlays;
mod primitives;
mod s11_applications;

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
const SETTINGS_PANEL: (f32, f32) = (576.0, 448.0);
const CATALOGUE: (f32, f32) = (832.0, 544.0);

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
	scene("settings-environment--default", SETTINGS_PANEL, s11_applications::secrets_default),
	scene("settings-environment--empty", SETTINGS_PANEL, s11_applications::secrets_empty),
	scene("settings-environment--loading", SETTINGS_PANEL, s11_applications::secrets_loading),
	scene(
		"settings-environment--long-content",
		SETTINGS_PANEL,
		s11_applications::secrets_long_content,
	),
	scene(
		"settings-environment--server-scope",
		SETTINGS_PANEL,
		s11_applications::secrets_server_scope,
	),
	scene(
		"settings-environment--space-scope",
		SETTINGS_PANEL,
		s11_applications::secrets_space_scope,
	),
	scene("settings-environment--unreadable", SETTINGS_PANEL, s11_applications::secrets_unreadable),
	scene(
		"settings-environment--unreadable-with-entries",
		SETTINGS_PANEL,
		s11_applications::secrets_unreadable_with_entries,
	),
	scene(
		"settings-environment--unset-needs-value",
		SETTINGS_PANEL,
		s11_applications::secrets_unset_needs_value,
	),
	scene(
		"settings-environment--unset-served-elsewhere",
		SETTINGS_PANEL,
		s11_applications::secrets_unset_served_elsewhere,
	),
	scene(
		"settings-plugins-applicationspanel--companion",
		SETTINGS_PANEL,
		s11_applications::applications_agent,
	),
	scene(
		"settings-plugins-applicationspanel--connected",
		SETTINGS_PANEL,
		s11_applications::applications_connected,
	),
	scene(
		"settings-plugins-applicationspanel--connected-dark",
		SETTINGS_PANEL,
		s11_applications::applications_connected,
	),
	scene(
		"settings-plugins-applicationspanel--connecting",
		SETTINGS_PANEL,
		s11_applications::applications_connecting,
	),
	scene(
		"settings-plugins-applicationspanel--empty-companion",
		SETTINGS_PANEL,
		s11_applications::applications_empty_agent,
	),
	scene(
		"settings-plugins-applicationspanel--empty-profile",
		SETTINGS_PANEL,
		s11_applications::applications_empty_profile,
	),
	scene(
		"settings-plugins-applicationspanel--empty-space",
		SETTINGS_PANEL,
		s11_applications::applications_empty_space,
	),
	scene(
		"settings-plugins-applicationspanel--failed",
		SETTINGS_PANEL,
		s11_applications::applications_failed,
	),
	scene(
		"settings-plugins-applicationspanel--failed-with-long-reason",
		SETTINGS_PANEL,
		s11_applications::applications_failed_with_long_reason,
	),
	scene(
		"settings-plugins-applicationspanel--failed-with-reason",
		SETTINGS_PANEL,
		s11_applications::applications_failed_with_reason,
	),
	scene(
		"settings-plugins-applicationspanel--long-content",
		SETTINGS_PANEL,
		s11_applications::applications_long_content,
	),
	focused(
		"settings-plugins-applicationspanel--needs-authorization",
		SETTINGS_PANEL,
		5,
		s11_applications::applications_needs_authorization,
	),
	focused(
		"settings-plugins-applicationspanel--needs-authorization-dark",
		SETTINGS_PANEL,
		5,
		s11_applications::applications_needs_authorization,
	),
	scene(
		"settings-plugins-applicationspanel--profile",
		SETTINGS_PANEL,
		s11_applications::applications_profile,
	),
	scene(
		"settings-plugins-applicationspanel--search-row",
		SETTINGS_PANEL,
		s11_applications::applications_agent,
	),
	Scene {
		id: "settings-plugins-applicationspanel--search-text-is-given",
		size: SETTINGS_PANEL,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "linear",
		view: s11_applications::applications_agent,
	},
	scene(
		"settings-plugins-applicationspanel--space",
		SETTINGS_PANEL,
		s11_applications::applications_space,
	),
	scene(
		"settings-plugins-applicationspanel--unanswered",
		SETTINGS_PANEL,
		s11_applications::applications_unanswered,
	),
	scene(
		"settings-plugins-applicationspanel--unreadable",
		SETTINGS_PANEL,
		s11_applications::applications_unreadable,
	),
	scene(
		"settings-plugins-applicationspanel--without-display-name",
		SETTINGS_PANEL,
		s11_applications::applications_without_display_name,
	),
	scene(
		"settings-plugins-applicationidentity--hosted-result",
		STORY,
		s11_applications::identity_hosted_result,
	),
	scene(
		"settings-plugins-applicationidentity--nothing-to-say",
		STORY,
		s11_applications::identity_nothing_to_say,
	),
	scene(
		"settings-plugins-applicationidentity--one-use",
		STORY,
		s11_applications::identity_one_use,
	),
	scene(
		"settings-plugins-applicationidentity--package-result",
		STORY,
		s11_applications::identity_package_result,
	),
	scene(
		"settings-plugins-applicationidentity--source-and-uses",
		STORY,
		s11_applications::identity_source_and_uses,
	),
	scene(
		"settings-plugins-applicationidentity--verified",
		STORY,
		s11_applications::identity_verified,
	),
	scene("settings-plugins-applicationmark--card", STORY, s11_applications::mark_card),
	scene(
		"settings-plugins-applicationmark--extra-small",
		STORY,
		s11_applications::mark_extra_small,
	),
	scene("settings-plugins-applicationmark--inline", STORY, s11_applications::mark_inline),
	scene("settings-plugins-applicationmark--medium", STORY, s11_applications::mark_with_mark),
	scene("settings-plugins-applicationmark--small", STORY, s11_applications::mark_small),
	scene(
		"settings-plugins-applicationmark--with-drawn-mark",
		STORY,
		s11_applications::mark_with_drawn_mark,
	),
	scene("settings-plugins-applicationmark--with-mark", STORY, s11_applications::mark_with_mark),
	scene(
		"settings-plugins-applicationmark--with-unreachable-mark",
		STORY,
		s11_applications::mark_with_unreachable_mark,
	),
	scene(
		"settings-plugins-applicationmark--without-mark",
		STORY,
		s11_applications::mark_without_mark,
	),
	Scene {
		id: "settings-plugins-applicationssearchfield--at-rest",
		size: STORY,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::search_field_story,
	},
	Scene {
		id: "settings-plugins-applicationssearchfield--typed",
		size: STORY,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "linear",
		view: s11_applications::search_field_story,
	},
	Scene {
		id: "settings-plugins-applicationssearchfield--themes-at-rest",
		size: STORY,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::search_field_theme_cell,
	},
	Scene {
		id: "settings-plugins-applicationssearchfield--themes-filled",
		size: STORY,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "linear",
		view: s11_applications::search_field_theme_cell,
	},
	Scene {
		id: "settings-plugins-applicationssearchfield--themes-focus-visible",
		size: STORY,
		tabs: 1,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::search_field_theme_cell,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--at-rest",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_at_rest,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--card-description-clamps",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_card_description_clamps,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--card-focused",
		size: CATALOGUE,
		tabs: 4,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_at_rest,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--card-hovered",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::EntersAtSnap("catalogue-card-linear"),
		typed: "",
		view: s11_applications::catalogue_at_rest,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--card-name-too-long",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_card_name_too_long,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--card-without-description",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_card_without_description,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--category-empty",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_category_empty,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--category-selected",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_category_selected,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--loading",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_loading,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--nothing-matched",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "zebra",
		view: s11_applications::catalogue_nothing_matched,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--on-this-machine-selected",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_on_this_machine_selected,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--partly-unreadable",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_partly_unreadable,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--rail-scrolls",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_at_rest,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--searching",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "lin",
		view: s11_applications::catalogue_at_rest,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--served-stale",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_served_stale,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--setup-unavailable",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_setup_unavailable,
	},
	Scene {
		id: "settings-plugins-applicationscatalogue--unreadable",
		size: CATALOGUE,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		view: s11_applications::catalogue_unreadable,
	},
	scene(
		"settings-plugins-applicationinstallpage--asks-for-every-value",
		CATALOGUE,
		s11_applications::install_asks_for_every_value,
	),
	scene(
		"settings-plugins-applicationinstallpage--empty-tool-list",
		CATALOGUE,
		s11_applications::install_empty_tool_list,
	),
	scene(
		"settings-plugins-applicationinstallpage--for-space",
		CATALOGUE,
		s11_applications::install_for_space,
	),
	scene(
		"settings-plugins-applicationinstallpage--hosted-nothing-to-set-up",
		CATALOGUE,
		s11_applications::install_hosted_nothing_to_set_up,
	),
	scene(
		"settings-plugins-applicationinstallpage--install-running",
		CATALOGUE,
		s11_applications::install_running,
	),
	scene(
		"settings-plugins-applicationinstallpage--long-content",
		CATALOGUE,
		s11_applications::install_long_content,
	),
	scene(
		"settings-plugins-applicationinstallpage--needs-api-key",
		CATALOGUE,
		s11_applications::install_needs_api_key,
	),
	scene(
		"settings-plugins-applicationinstallpage--nothing-to-set-up",
		CATALOGUE,
		s11_applications::install_nothing_to_set_up,
	),
	scene(
		"settings-plugins-applicationinstallpage--refused",
		CATALOGUE,
		s11_applications::install_refused,
	),
	scene(
		"settings-plugins-applicationinstallpage--runs-on-its-host",
		CATALOGUE,
		s11_applications::install_runs_on_its_host,
	),
	scene(
		"settings-plugins-applicationinstallpage--signs-you-in",
		CATALOGUE,
		s11_applications::install_signs_you_in,
	),
	scene(
		"settings-plugins-applicationinstallpage--themes-key-field-at-rest",
		CATALOGUE,
		s11_applications::install_needs_api_key,
	),
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
