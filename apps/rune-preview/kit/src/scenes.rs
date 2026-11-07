use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::tokens::{self, SPACING, Tokens};

mod approvals;
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
const PANEL: (f32, f32) = (608.0, 520.0);
const PANEL_TALL: (f32, f32) = (608.0, 640.0);
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
	focused("conversation-tools-toolapproval--default", PANEL, 2, approvals::approval_default),
	scene("conversation-tools-toolapproval--with-path", PANEL, approvals::approval_with_path),
	focused("conversation-tools-toolquestion--nothing-chosen", SIDE, 1, approvals::nothing_chosen),
	scene("conversation-tools-toolquestion--option-chosen", SIDE, approvals::option_chosen),
	scene(
		"conversation-tools-toolquestion--chosen-row-follows-space-tint",
		PANEL,
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
		PANEL,
		6,
		approvals::keyboard_focus_rings,
	),
	scene("conversation-tools-toolquestion--single-select", PANEL, approvals::single_select),
	scene("conversation-tools-toolquestion--multi-select", PANEL_TALL, approvals::multi_select),
	keyed(
		"conversation-tools-toolquestion--free-text",
		PANEL,
		0,
		approvals::FREE_TEXT,
		"",
		approvals::free_text,
	),
	keyed(
		"conversation-tools-toolquestion--digit-keys-choose",
		PANEL,
		1,
		"",
		"1",
		approvals::digit_keys_choose,
	),
	keyed(
		"conversation-tools-toolquestion--digit-keys-toggle",
		PANEL,
		1,
		"",
		"22",
		approvals::digit_keys_toggle,
	),
	keyed(
		"conversation-tools-toolquestion--digit-typed-into-own-answer",
		PANEL,
		2,
		"",
		"2",
		approvals::digit_keys_choose,
	),
	focused("conversation-tools-toolquestion--keyboard-only", PANEL, 2, approvals::keyboard_only),
	keyed(
		"conversation-tools-toolquestion--four-questions",
		PANEL,
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
	focused("conversation-tools-toolquestion--arrow-key-tabs", PANEL, 1, approvals::arrow_key_tabs),
	scene(
		"conversation-tools-toolquestion--options-as-whole-answer",
		PANEL,
		approvals::options_as_whole_answer,
	),
	focused("conversation-tools-toolquestion--no-skip", PANEL, 1, approvals::no_skip),
	focused(
		"conversation-tools-toolquestion--entry-with-link",
		NARROW,
		1,
		approvals::entry_with_link,
	),
	keyed(
		"conversation-tools-toolquestion--entry-with-secret",
		PANEL,
		1,
		approvals::SECRET,
		"",
		approvals::entry_with_secret,
	),
	focused("conversation-tools-toolquestion--failure", PANEL, 1, approvals::failure),
	scene("conversation-tools-toolquestion--entry-narrow", NARROW, approvals::entry_narrow),
	scene(
		"conversation-tools-toolquestion--application-scope",
		PANEL,
		approvals::application_scope,
	),
	scene(
		"conversation-tools-toolquestion--failure-with-action",
		PANEL,
		approvals::failure_with_action,
	),
	scene("conversation-tools-toolquestion--notice-in-queue", PANEL, approvals::notice_in_queue),
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

pub struct SceneState {
	pub scene: &'static Scene,
	pub edit: TextEdit,
	pub chosen: Vec<usize>,
	pub picture: Option<Image>,
	pub mark: Option<Image>,
	images: Option<ImageCache>,
}

impl SceneState {
	pub fn new(scene: &'static Scene) -> SceneState {
		SceneState {
			scene,
			edit: TextEdit::new(scene.typed),
			chosen: Vec::new(),
			picture: None,
			mark: None,
			images: None,
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
