use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::surfaces::s06_composer::scenes as s06;
use crate::tokens::{self, SPACING, Tokens};

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
	s06::fixed(
		"conversation-prompt-promptattachbutton--default",
		s06::CONTROL,
		s06::attach_default,
	),
	s06::scene(
		"conversation-prompt-promptattachbutton--states",
		s06::CONTROL,
		"",
		3,
		Pointer::EntersAtSnap(s06::HOVERED_ATTACH_KEY),
		s06::attach_states,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--default",
		s06::COMPOSER,
		s06::attachments_default,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--empty",
		s06::COMPOSER,
		s06::attachments_empty,
	),
	s06::drafted(
		"conversation-prompt-promptattachments--in-composer",
		s06::COMPOSER,
		s06::STAGED_DRAFT,
		s06::input_with_attach,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--long-content",
		s06::COMPOSER,
		s06::attachments_long_content,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--reply-excerpt",
		s06::COMPOSER,
		s06::attachments_reply_excerpt,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--reply-unbreakable-excerpt",
		s06::COMPOSER,
		s06::attachments_reply_unbreakable,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--reply-unbreakable-excerpt-in-narrow-row",
		s06::COMPOSER,
		s06::attachments_reply_unbreakable_narrow,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--reply-whole-message",
		s06::COMPOSER,
		s06::attachments_reply_whole,
	),
	s06::fixed(
		"conversation-prompt-promptattachments--two-replies",
		s06::COMPOSER,
		s06::attachments_two_replies,
	),
	s06::drafted(
		"conversation-prompt-promptcommandmenu--default",
		s06::MENU,
		s06::SLASH,
		s06::commands_default,
	),
	s06::drafted(
		"conversation-prompt-promptcommandmenu--described",
		s06::MENU,
		s06::SLASH,
		s06::commands_described,
	),
	s06::drafted(
		"conversation-prompt-promptcommandmenu--empty",
		s06::MENU,
		s06::SLASH,
		s06::commands_empty,
	),
	s06::drafted(
		"conversation-prompt-promptcommandmenu--filtered",
		s06::MENU,
		s06::SLASH,
		s06::commands_filtered,
	),
	s06::drafted(
		"conversation-prompt-promptcommandmenu--keyboard-travel",
		s06::MENU,
		s06::SLASH,
		s06::commands_keyboard_travel,
	),
	s06::drafted(
		"conversation-prompt-promptcommandmenu--long-content",
		s06::MENU,
		s06::SLASH,
		s06::commands_long_content,
	),
	s06::tabbed(
		"conversation-prompt-promptcommandmenu--query-changed",
		s06::MENU,
		s06::SLASH_QUERY,
		1,
		s06::commands_query_changed,
	),
	s06::tabbed("conversation-prompt-promptinput--default", s06::COMPOSER, "", 1, s06::input_empty),
	s06::drafted(
		"conversation-prompt-promptinput--drag-over",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_with_attach,
	),
	s06::fixed("conversation-prompt-promptinput--empty", s06::COMPOSER, s06::input_empty),
	s06::fixed("conversation-prompt-promptinput--files-only", s06::COMPOSER, s06::input_files_only),
	s06::drafted(
		"conversation-prompt-promptinput--full-width-line",
		s06::COMPOSER,
		s06::FILLING_DRAFT,
		s06::input_with_controls,
	),
	s06::drafted(
		"conversation-prompt-promptinput--long-content",
		s06::COMPOSER,
		s06::WRAPPED_DRAFT,
		s06::input_with_controls,
	),
	s06::drafted(
		"conversation-prompt-promptinput--marked-from-outside",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_marked_from_outside,
	),
	s06::fixed("conversation-prompt-promptinput--offline", s06::COMPOSER, s06::input_offline),
	s06::drafted(
		"conversation-prompt-promptinput--overflow",
		s06::TALL,
		s06::LONG_DRAFT,
		s06::input_with_controls,
	),
	s06::tabbed(
		"conversation-prompt-promptinput--playground",
		s06::COMPOSER,
		"",
		1,
		s06::input_empty,
	),
	s06::drafted(
		"conversation-prompt-promptinput--send-disabled",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_disabled,
	),
	s06::tabbed(
		"conversation-prompt-promptinput--send-focus-visible",
		s06::COMPOSER,
		s06::DRAFT,
		2,
		s06::input_empty,
	),
	s06::hovered(
		"conversation-prompt-promptinput--send-hover",
		s06::COMPOSER,
		s06::DRAFT,
		s06::SEND_KEY,
		s06::input_empty,
	),
	s06::fixed("conversation-prompt-promptinput--send-idle", s06::COMPOSER, s06::input_empty),
	s06::tabbed(
		"conversation-prompt-promptinput--states",
		s06::PAIR,
		s06::DRAFT,
		3,
		s06::input_states,
	),
	s06::fixed(
		"conversation-prompt-promptinput--themes-at-rest",
		s06::COMPOSER,
		s06::input_with_controls,
	),
	s06::drafted(
		"conversation-prompt-promptinput--themes-disabled",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_themes_disabled,
	),
	s06::drafted(
		"conversation-prompt-promptinput--themes-filled",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_with_controls,
	),
	s06::tabbed(
		"conversation-prompt-promptinput--themes-focus-visible",
		s06::COMPOSER,
		s06::DRAFT,
		2,
		s06::input_with_controls,
	),
	s06::drafted(
		"conversation-prompt-promptinput--with-attachments",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_with_attachments,
	),
	s06::drafted(
		"conversation-prompt-promptinput--with-controls",
		s06::COMPOSER,
		s06::DRAFT,
		s06::input_with_controls,
	),
	s06::fixed(
		"conversation-prompt-promptinput--with-long-quote",
		s06::TALL,
		s06::input_with_long_quote,
	),
	s06::drafted(
		"conversation-prompt-promptinput--with-quote",
		s06::COMPOSER,
		s06::QUOTE_REPLY,
		s06::input_with_quote,
	),
	s06::drafted(
		"conversation-prompt-promptinput--with-quote-and-attachments",
		s06::TALL,
		s06::DRAFT,
		s06::input_with_quote_and_attachments,
	),
	s06::drafted(
		"conversation-prompt-promptinput--with-quote-blocked",
		s06::PAIR,
		s06::DRAFT,
		s06::input_with_quote_blocked,
	),
	s06::fixed(
		"conversation-prompt-promptinput--with-replies-and-attachments",
		s06::TALL,
		s06::input_replies_and_attachments,
	),
	s06::fixed(
		"conversation-prompt-promptlibrarypicker--highlighted-row",
		s06::PICKER,
		s06::picker_highlighted_row,
	),
	s06::fixed(
		"conversation-prompt-promptlibrarypicker--picks-on-enter",
		s06::PICKER,
		s06::picker_closed,
	),
	s06::tabbed(
		"conversation-prompt-promptlibrarypicker--reaches-files-by-keyboard",
		s06::PICKER,
		"",
		1,
		s06::picker_closed,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--counted",
		s06::MENU,
		s06::AT,
		s06::mentions_counted,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--counted-again",
		s06::MENU,
		s06::AT,
		s06::mentions_counted_lead,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--counted-lead",
		s06::MENU,
		s06::AT,
		s06::mentions_counted_lead,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--counted-long-name",
		s06::MENU,
		s06::AT,
		s06::mentions_counted_long_name,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--counted-titled",
		s06::MENU,
		s06::AT,
		s06::mentions_counted_titled,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--default",
		s06::MENU,
		s06::AT,
		s06::mentions_default,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--empty",
		s06::MENU,
		s06::AT,
		s06::mentions_empty,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--filtered",
		s06::MENU,
		s06::AT,
		s06::mentions_filtered,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--in-dark-theme",
		s06::MENU,
		s06::AT,
		s06::mentions_space_opened,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--keyboard-travel",
		s06::MENU,
		s06::AT,
		s06::mentions_keyboard_travel,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--lead",
		s06::MENU,
		s06::AT,
		s06::mentions_default,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--lead-filtered-out",
		s06::MENU,
		s06::AT,
		s06::mentions_lead_filtered_out,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--long-content",
		s06::MENU,
		s06::AT,
		s06::mentions_long_content,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--pictured",
		s06::MENU,
		s06::AT,
		s06::mentions_default,
	),
	s06::tabbed(
		"conversation-prompt-promptmentionmenu--query-changed",
		s06::MENU,
		s06::AT_QUERY,
		1,
		s06::mentions_query_changed,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--space-keyboard-travel",
		s06::MENU,
		s06::AT,
		s06::mentions_space_keyboard_travel,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--space-matches-inside",
		s06::MENU,
		s06::AT,
		s06::mentions_space_matches_inside,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--space-opened",
		s06::MENU,
		s06::AT,
		s06::mentions_space_opened,
	),
	s06::drafted(
		"conversation-prompt-promptmentionmenu--space-queried",
		s06::MENU,
		s06::AT,
		s06::mentions_space_queried,
	),
	s06::fixed("conversation-prompt-promptqueue--default", s06::QUEUE, s06::queue_default),
	s06::hovered(
		"conversation-prompt-promptqueue--row-hovered",
		s06::QUEUE,
		"",
		s06::SECOND_QUEUED_KEY,
		s06::queue_row_hovered,
	),
	s06::drafted(
		"conversation-prompt-promptreply--alignment",
		s06::COMPOSER,
		s06::REPLY_PROMPT,
		s06::reply_default,
	),
	s06::drafted(
		"conversation-prompt-promptreply--default",
		s06::COMPOSER,
		s06::REPLY_PROMPT,
		s06::reply_default,
	),
	s06::drafted(
		"conversation-prompt-promptreply--dismissed",
		s06::COMPOSER,
		s06::REPLY_PROMPT,
		s06::reply_dismissed,
	),
	s06::tabbed(
		"conversation-prompt-promptreply--naming",
		s06::COMPOSER,
		s06::NAMED_PROMPT,
		3,
		s06::reply_naming,
	),
	s06::fixed("conversation-prompt-selectionquote--default", s06::QUOTED, s06::selection_default),
	s06::fixed(
		"conversation-prompt-selectionquote--long-content",
		s06::QUOTED,
		s06::selection_long_content,
	),
	s06::fixed(
		"conversation-prompt-selectionquote--narrow-long-content",
		s06::NARROW_CARD,
		s06::selection_narrow_long_content,
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
