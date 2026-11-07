use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::tokens::{self, SPACING, Tokens};

mod boards;
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
		view: boards::canvas_edit,
	},
	Scene {
		id: "navigation-boardcanvas--edit-by-pointer",
		size: boards::LAPTOP,
		tabs: 1,
		pointer: Pointer::Away,
		typed: boards::EDITED_TEXT,
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
];

pub struct SceneState {
	pub scene: &'static Scene,
	pub edit: TextEdit,
	pub picture: Option<Image>,
	pub board_pictures: Vec<Image>,
	images: Option<ImageCache>,
}

impl SceneState {
	pub fn new(scene: &'static Scene) -> SceneState {
		SceneState {
			scene,
			edit: TextEdit::new(scene.typed),
			picture: None,
			board_pictures: Vec::new(),
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
	s.picture = Some(picture);
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
