use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::math::Typesetter;
use crate::tokens::{self, SPACING, Tokens};

mod feedback;
mod forms;
mod navigation;
mod overlays;
mod primitives;
mod thread;

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
	scene("conversation-markdown-markdown--default", thread::TALLER, thread::markdown_default),
	scene("conversation-markdown-markdown--headings", thread::TALL, thread::markdown_headings),
	scene("conversation-markdown-markdown--emphasis", thread::PROSE, thread::markdown_emphasis),
	scene("conversation-markdown-markdown--lists", thread::PROSE, thread::markdown_lists),
	scene(
		"conversation-markdown-markdown--nested-list",
		thread::PROSE,
		thread::markdown_nested_list,
	),
	scene("conversation-markdown-markdown--task-list", thread::PROSE, thread::markdown_task_list),
	scene("conversation-markdown-markdown--blockquote", thread::PROSE, thread::markdown_blockquote),
	scene(
		"conversation-markdown-markdown--table-in-blockquote",
		thread::PROSE,
		thread::markdown_table_in_blockquote,
	),
	scene("conversation-markdown-markdown--table", thread::PROSE, thread::markdown_table),
	scene("conversation-markdown-markdown--table-wide", thread::PROSE, thread::markdown_table_wide),
	scene(
		"conversation-markdown-markdown--table-narrow",
		thread::PROSE,
		thread::markdown_table_narrow,
	),
	scene("conversation-markdown-markdown--table-copy", thread::PROSE, thread::markdown_table_copy),
	scene(
		"conversation-markdown-markdown--table-in-bubble",
		thread::PROSE,
		thread::markdown_table_in_bubble,
	),
	scene("conversation-markdown-markdown--code-fence", thread::PROSE, thread::markdown_code_fence),
	scene(
		"conversation-markdown-markdown--code-fence-rust",
		thread::PROSE,
		thread::markdown_code_fence_rust,
	),
	scene(
		"conversation-markdown-markdown--code-fence-python",
		thread::PROSE,
		thread::markdown_code_fence_python,
	),
	scene(
		"conversation-markdown-markdown--code-fence-css",
		thread::PROSE,
		thread::markdown_code_fence_css,
	),
	scene(
		"conversation-markdown-markdown--code-fence-html",
		thread::PROSE,
		thread::markdown_code_fence_html,
	),
	scene(
		"conversation-markdown-markdown--code-fence-yaml",
		thread::PROSE,
		thread::markdown_code_fence_yaml,
	),
	scene(
		"conversation-markdown-markdown--code-fence-markdown",
		thread::PROSE,
		thread::markdown_code_fence_markdown,
	),
	scene(
		"conversation-markdown-markdown--code-fence-unknown-language",
		thread::PROSE,
		thread::markdown_code_fence_unknown_language,
	),
	scene(
		"conversation-markdown-markdown--code-fence-overflow",
		thread::PROSE,
		thread::markdown_code_fence_overflow,
	),
	scene(
		"conversation-markdown-markdown--code-fence-copy",
		thread::PROSE,
		thread::markdown_code_fence_copy,
	),
	scene(
		"conversation-markdown-markdown--code-fence-long-source",
		thread::TALLER,
		thread::markdown_code_fence_long_source,
	),
	scene(
		"conversation-markdown-markdown--math-inline",
		thread::PROSE,
		thread::markdown_math_inline,
	),
	scene(
		"conversation-markdown-markdown--math-display",
		thread::PROSE,
		thread::markdown_math_display,
	),
	scene(
		"conversation-markdown-markdown--math-malformed",
		thread::PROSE,
		thread::markdown_math_malformed,
	),
	scene(
		"conversation-markdown-markdown--math-oversized",
		thread::TALL,
		thread::markdown_math_oversized,
	),
	scene(
		"conversation-markdown-markdown--mermaid-flowchart",
		thread::TALL,
		thread::markdown_mermaid_flowchart,
	),
	scene(
		"conversation-markdown-markdown--mermaid-malformed",
		thread::PROSE,
		thread::markdown_mermaid_malformed,
	),
	scene(
		"conversation-markdown-markdown--mermaid-in-bubble",
		thread::TALL,
		thread::markdown_mermaid_in_bubble,
	),
	scene(
		"conversation-markdown-markdown--thematic-break",
		thread::PROSE,
		thread::markdown_thematic_break,
	),
	scene("conversation-markdown-markdown--footnotes", thread::PROSE, thread::markdown_footnotes),
	scene(
		"conversation-markdown-markdown--footnotes-twice",
		thread::TALL,
		thread::markdown_footnotes_twice,
	),
	scene("conversation-markdown-markdown--autolinks", thread::PROSE, thread::markdown_autolinks),
	scene(
		"conversation-markdown-markdown--destinations",
		thread::PROSE,
		thread::markdown_destinations,
	),
	scene(
		"conversation-markdown-markdown--destinations-fetch-nothing",
		thread::TALL,
		thread::markdown_destinations_fetch_nothing,
	),
	scene(
		"conversation-markdown-markdown--deceptive-links",
		thread::PROSE,
		thread::markdown_deceptive_links,
	),
	scene(
		"conversation-markdown-markdown--inert-schemes",
		thread::PROSE,
		thread::markdown_inert_schemes,
	),
	scene("conversation-markdown-markdown--long-url", thread::PROSE, thread::markdown_long_url),
	scene(
		"conversation-markdown-markdown--fragment-link",
		thread::PROSE,
		thread::markdown_fragment_link,
	),
	scene("conversation-markdown-markdown--raw-html", thread::PROSE, thread::markdown_raw_html),
	scene(
		"conversation-markdown-markdown--raw-html-in-list",
		thread::TALL,
		thread::markdown_raw_html_in_list,
	),
	scene(
		"conversation-markdown-markdown--hostile-markup",
		thread::TALL,
		thread::markdown_hostile_markup,
	),
	scene("conversation-markdown-markdown--malformed", thread::PROSE, thread::markdown_malformed),
	scene(
		"conversation-markdown-markdown--in-message-bubble",
		thread::TALLER,
		thread::markdown_in_message_bubble,
	),
	scene(
		"conversation-markdown-markdown--in-solid-bubble",
		thread::PROSE,
		thread::markdown_in_solid_bubble,
	),
	scene(
		"conversation-markdown-markdown--adjacent-blocks",
		thread::TALLER,
		thread::markdown_adjacent_blocks,
	),
	scene(
		"conversation-markdown-markdown--nested-blocks",
		thread::TALL,
		thread::markdown_nested_blocks,
	),
	scene(
		"conversation-markdown-markdown--preserved-whitespace",
		thread::TALL,
		thread::markdown_preserved_whitespace,
	),
	scene(
		"conversation-markdown-markdown--typeset-in-bubble",
		thread::TALL,
		thread::markdown_typeset_in_bubble,
	),
	scene(
		"conversation-markdown-markdown--attachment-image-mid-answer",
		thread::PROSE,
		thread::markdown_attachment_image_mid_answer,
	),
	scene(
		"conversation-markdown-markdown--attachment-file-mid-answer",
		thread::PROSE,
		thread::markdown_attachment_file_mid_answer,
	),
	scene(
		"conversation-markdown-markdown--attachment-file-among-code-paths",
		thread::PROSE,
		thread::markdown_attachment_file_among_code_paths,
	),
	scene(
		"conversation-markdown-markdown--attachment-unresolved",
		thread::PROSE,
		thread::markdown_attachment_image_mid_answer,
	),
	scene(
		"conversation-markdown-markdown--attachment-path-with-spaces",
		thread::PROSE,
		thread::markdown_attachment_path_with_spaces,
	),
	scene(
		"conversation-markdown-markdown--board-link-loaded",
		thread::PROSE,
		thread::markdown_board_link_alone,
	),
	scene(
		"conversation-markdown-markdown--board-link-loaded-dark",
		thread::PROSE,
		thread::markdown_board_link_alone,
	),
	scene(
		"conversation-markdown-markdown--board-link-loading",
		thread::PROSE,
		thread::markdown_board_link_alone,
	),
	scene(
		"conversation-markdown-markdown--board-link-loading-dark",
		thread::PROSE,
		thread::markdown_board_link_alone,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-sentence",
		thread::PROSE,
		thread::markdown_board_link_in_sentence,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-sentence-dark",
		thread::PROSE,
		thread::markdown_board_link_in_sentence,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-checklist",
		thread::PROSE,
		thread::markdown_board_link_in_checklist,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-checklist-dark",
		thread::PROSE,
		thread::markdown_board_link_in_checklist,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-list-sentence",
		thread::PROSE,
		thread::markdown_board_link_in_list_sentence,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-list-sentence-dark",
		thread::PROSE,
		thread::markdown_board_link_in_list_sentence,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-table-cell",
		thread::PROSE,
		thread::markdown_board_link_in_table_cell,
	),
	scene(
		"conversation-markdown-markdown--board-link-in-table-cell-dark",
		thread::PROSE,
		thread::markdown_board_link_in_table_cell,
	),
	scene("conversation-markdown-markdownmermaid--default", thread::TALL, thread::mermaid_default),
	scene(
		"conversation-markdown-markdownmermaid--wider-than-the-block",
		thread::PROSE,
		thread::mermaid_wider_than_the_block,
	),
	scene(
		"conversation-markdown-markdownmermaid--unparseable",
		thread::PROSE,
		thread::mermaid_unparseable,
	),
	scene("conversation-markdown-markdownmath--default", thread::PROSE, thread::math_default),
	scene("conversation-markdown-markdownmath--inline", thread::PROSE, thread::math_inline),
	scene(
		"conversation-markdown-markdownmath--unparseable",
		thread::PROSE,
		thread::math_unparseable,
	),
	scene("conversation-markdown-markdowncode--default", thread::PROSE, thread::code_default),
	scene(
		"conversation-markdown-markdowncode--unknown-language",
		thread::PROSE,
		thread::code_unknown_language,
	),
	scene(
		"conversation-markdown-markdowncode--beyond-highlight-budget",
		thread::TALLER,
		thread::code_beyond_highlight_budget,
	),
	scene(
		"conversation-markdown-markdowncode--inline-code",
		thread::PROSE,
		thread::code_inline_code,
	),
	scene("conversation-markdown-markdowntable--default", thread::PROSE, thread::table_default),
	scene(
		"conversation-markdown-markdowntable--wider-than-the-block",
		thread::PROSE,
		thread::table_wider_than_the_block,
	),
	scene(
		"conversation-markdown-markdowntable--header-only",
		thread::PROSE,
		thread::table_header_only,
	),
	scene("conversation-markdown-markdownlink--default", thread::PROSE, thread::link_default),
	scene(
		"conversation-markdown-markdownlink--deceptive-text",
		thread::PROSE,
		thread::link_deceptive_text,
	),
	scene("conversation-markdown-markdownlink--unsafe-url", thread::PROSE, thread::link_unsafe_url),
	scene("conversation-markdown-markdownlink--fragment", thread::PROSE, thread::link_fragment),
	scene("conversation-markdown-markdownlink--mail-to", thread::PROSE, thread::link_mail_to),
	scene(
		"conversation-markdown-markdownlink--long-destination",
		thread::PROSE,
		thread::link_long_destination,
	),
	scene(
		"conversation-markdown-markdownspan--bot-mention",
		thread::PROSE,
		thread::span_bot_mention,
	),
	scene("conversation-markdown-markdownspan--plain-text", thread::PROSE, thread::span_plain_text),
	scene(
		"conversation-markdown-markdowntaskcheckbox--default",
		thread::PROSE,
		thread::tasks_default,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--loose-checklist",
		thread::PROSE,
		thread::tasks_loose_checklist,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--loose-checklist-dark",
		thread::PROSE,
		thread::tasks_loose_checklist,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--ticks-and-unticks-by-click",
		thread::PROSE,
		thread::tasks_default,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--ticks-and-unticks-by-clicking-the-label",
		thread::PROSE,
		thread::tasks_default,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--ticks-a-loose-row-by-clicking-the-label",
		thread::PROSE,
		thread::tasks_loose_checklist,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--opens-a-link-in-the-label-without-ticking",
		thread::PROSE,
		thread::tasks_linked,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--nested-checklist",
		thread::PROSE,
		thread::tasks_nested_checklist,
	),
	scene(
		"conversation-markdown-markdowntaskcheckbox--ticks-a-sub-task-alone",
		thread::PROSE,
		thread::tasks_nested_checklist,
	),
	scene(
		"conversation-markdown-codeblock--multi-file-patch",
		thread::TALL,
		thread::code_block_patch,
	),
	scene("conversation-markdown-codeblock--copy", thread::PROSE, thread::code_block_copy),
	scene(
		"conversation-markdown-codesnippet--single-line",
		thread::PROSE,
		thread::snippet_single_line,
	),
	scene("conversation-markdown-codesnippet--overflow", thread::PROSE, thread::snippet_overflow),
	scene("feedback-threadtranscriptskeleton--light", thread::PANEL, thread::skeleton),
	scene("feedback-threadtranscriptskeleton--dark", thread::PANEL, thread::skeleton),
	focused(
		"overlays-selectiontoolbar--keyboard-and-pointer",
		thread::LINE,
		1,
		thread::selection_toolbar_keyboard,
	),
	scene("conversation-message-pinnedmessages--default", thread::PROSE, thread::pinned_default),
	scene("conversation-message-pinnedmessages--one-pinned", thread::PROSE, thread::pinned_one),
	scene("conversation-message-pinnedmessages--empty", thread::PROSE, thread::pinned_empty),
	scene(
		"conversation-message-pinnedmessages--overflowing",
		thread::PROSE,
		thread::pinned_overflowing,
	),
	scene(
		"conversation-message-pinnedmessages--unpinning",
		thread::PROSE,
		thread::pinned_unpinning,
	),
	scene("conversation-message-threadworkline--final-7", thread::LINE, thread::work_7),
	scene("conversation-message-threadworkline--final-8", thread::LINE, thread::work_8),
	scene("conversation-message-threadworkline--final-9", thread::LINE, thread::work_9),
	scene("conversation-message-threadworkline--final-10", thread::LINE, thread::work_10),
	scene("conversation-message-threadworkline--final-11", thread::LINE, thread::work_11),
	scene("conversation-message-threadworkline--final-12", thread::LINE, thread::work_12),
	scene("conversation-message-threadworkline--final-13", thread::LINE, thread::work_13),
	scene("conversation-message-threadworkline--final-14", thread::LINE, thread::work_14),
	scene("conversation-message-threadworkline--final-15", thread::LINE, thread::work_15),
	scene("conversation-message-threadworkline--final-16", thread::LINE, thread::work_16),
	scene("conversation-message-threadworkline--final-17", thread::PROSE, thread::work_17),
	scene(
		"conversation-missions-missioneventrow--machine-line",
		thread::LINE,
		thread::event_machine_line,
	),
	scene(
		"conversation-missions-missioneventrow--with-pull-request-link",
		thread::LINE,
		thread::event_with_pull_request_link,
	),
	scene(
		"conversation-missions-missioneventrow--with-an-unnumbered-link",
		thread::LINE,
		thread::event_with_an_unnumbered_link,
	),
	scene(
		"conversation-missions-missioneventrow--authored-event",
		thread::LINE,
		thread::event_authored,
	),
	scene(
		"conversation-missions-missioneventrow--from-the-agent",
		thread::LINE,
		thread::event_from_the_agent,
	),
	scene(
		"conversation-missions-missioneventrow--agent-asked-on-warning",
		thread::LINE,
		thread::event_agent_asked,
	),
	scene(
		"conversation-missions-missioneventrow--agent-asked-on-warning-dark",
		thread::LINE,
		thread::event_agent_asked,
	),
	scene(
		"conversation-missions-missioneventrow--from-the-agent-without-a-tool",
		thread::LINE,
		thread::event_from_the_agent_without_a_tool,
	),
	scene(
		"conversation-missions-missioneventrow--from-git-hub",
		thread::LINE,
		thread::event_from_github,
	),
	scene(
		"conversation-missions-missioneventrow--from-the-reader",
		thread::LINE,
		thread::event_from_the_reader,
	),
	scene(
		"conversation-missions-missioneventrow--closed-by-you",
		thread::LINE,
		thread::event_closed_by_you,
	),
	scene("conversation-missions-missioneventrow--event-kinds", thread::PROSE, thread::event_kinds),
	scene(
		"conversation-missions-missioneventrow--authored-events",
		thread::PROSE,
		thread::event_authored_events,
	),
	scene(
		"conversation-missions-missioneventrow--without-a-bot",
		thread::LINE,
		thread::event_without_a_bot,
	),
	scene(
		"conversation-missions-missioneventrow--in-a-mission-thread",
		thread::PANEL,
		thread::event_in_a_mission_thread,
	),
	scene(
		"conversation-missions-missioneventrow--long-content",
		thread::LINE,
		thread::event_long_content,
	),
	scene("conversation-message-turn--default", thread::LINE, thread::turn_default),
	scene("conversation-message-turn--long-content", thread::LINE, thread::turn_long_content),
	scene(
		"conversation-message-turn--summoned-by-mission",
		thread::LINE,
		thread::turn_summoned_by_mission,
	),
	scene(
		"conversation-message-turn--thread-crossing-a-day",
		thread::PROSE,
		thread::turn_crossing_a_day,
	),
	scene("conversation-message-turn--speakers", thread::PROSE, thread::turn_speakers),
	scene(
		"conversation-message-turn--person-with-custom-image",
		thread::LINE,
		thread::turn_person_with_custom_image,
	),
	scene(
		"conversation-message-turn--person-with-custom-image-dark",
		thread::LINE,
		thread::turn_person_with_custom_image,
	),
	scene("conversation-message-turn--hover-actions", thread::PROSE, thread::turn_hover_actions),
	scene("conversation-message-turn--endings", thread::PROSE, thread::turn_endings),
	scene("conversation-message-turn--working", thread::LINE, thread::turn_working),
	scene("conversation-message-turn--quoted", thread::LINE, thread::turn_quoted),
	scene("conversation-message-turn--replies-to-two", thread::LINE, thread::turn_replies_to_two),
	scene("conversation-message-turn--deleted-author", thread::LINE, thread::turn_deleted_author),
	scene(
		"conversation-message-turn--reported-by-routine",
		thread::LINE,
		thread::turn_reported_by_routine,
	),
	scene("conversation-message-turn--not-sent", thread::LINE, thread::turn_not_sent),
	scene("conversation-message-turn--queued", thread::LINE, thread::turn_queued),
	scene(
		"conversation-message-messageattachments--default",
		thread::PROSE,
		thread::attachments_default,
	),
	scene(
		"conversation-message-messageattachments--two-images",
		thread::PROSE,
		thread::attachments_two_images,
	),
	scene(
		"conversation-message-messageattachments--several-images",
		thread::PROSE,
		thread::attachments_several_images,
	),
	scene(
		"conversation-message-messageattachments--many-images",
		thread::PROSE,
		thread::attachments_many_images,
	),
	scene(
		"conversation-message-messageattachments--mixed-kinds",
		thread::PROSE,
		thread::attachments_mixed_kinds,
	),
	scene(
		"conversation-message-messageattachments--states",
		thread::PROSE,
		thread::attachments_states,
	),
	scene(
		"conversation-message-messageattachments--long-content",
		thread::LINE,
		thread::attachments_long_content,
	),
	scene(
		"conversation-message-messageattachments--error",
		thread::PROSE,
		thread::attachments_error,
	),
	scene(
		"conversation-message-messageattachments--in-transcript",
		thread::PROSE,
		thread::attachments_default,
	),
	scene(
		"conversation-message-messageattachments--empty",
		thread::LINE,
		thread::attachments_empty,
	),
	scene(
		"conversation-message-messagesidecontext--bot-side",
		thread::LINE,
		thread::message_side_bot,
	),
	scene(
		"conversation-message-messagesidecontext--reader-side",
		thread::LINE,
		thread::message_side_reader,
	),
	scene(
		"conversation-message-messagesidecontext--without-provider",
		thread::LINE,
		thread::message_side_bot,
	),
	scene("conversation-message-messagequote--default", thread::LINE, thread::quote_default),
	scene("conversation-message-messagequote--long-content", thread::LINE, thread::quote_default),
	scene("conversation-message-messagequote--tones", thread::LINE, thread::quote_tones),
	scene("conversation-message-messageactions--default", thread::LINE, thread::actions_default),
	scene(
		"conversation-message-messageactions--square-icon-buttons",
		thread::LINE,
		thread::actions_default,
	),
	scene(
		"conversation-message-messageactions--every-label-on-one-line-in-french",
		thread::LINE,
		thread::actions_in_french,
	),
	scene("conversation-message-message--variants", thread::PROSE, thread::message_variants),
	scene("conversation-message-message--with-metadata", thread::PROSE, thread::message_variants),
	scene(
		"conversation-message-message--long-content",
		thread::PROSE,
		thread::message_long_content,
	),
	scene("conversation-message-message--authors", thread::PROSE, thread::message_authors),
	scene(
		"conversation-message-message--author-with-long-title",
		thread::LINE,
		thread::message_author_with_long_title,
	),
	scene("conversation-message-messagebubble--default", thread::LINE, thread::bubble_default),
	scene(
		"conversation-message-messagebubble--agent-surface-in-both-themes",
		thread::LINE,
		thread::bubble_default,
	),
	scene(
		"conversation-message-messagebubble--space-tinted",
		thread::LINE,
		thread::bubble_space_tinted,
	),
	scene(
		"conversation-message-messagebubble--narrow-container",
		thread::PROSE,
		thread::bubble_narrow,
	),
	scene(
		"conversation-message-messagebubble--body-text-size",
		thread::LINE,
		thread::bubble_default,
	),
	scene(
		"conversation-message-messagebubble--content-widths",
		thread::LINE,
		thread::bubble_long_words,
	),
	scene("conversation-message-thread--conversations-1", thread::PANEL, thread::thread_solo),
	scene("conversation-message-thread--conversations-2", thread::PANEL, thread::thread_group),
	scene(
		"conversation-message-thread--user-author-line-mirrored",
		thread::PANEL,
		thread::thread_with_actions,
	),
	scene("conversation-message-thread--work-1", thread::PANEL, thread::thread_working),
	scene("conversation-message-thread--work-2", thread::PANEL, thread::thread_streaming),
	scene("conversation-message-thread--work-4", thread::PANEL, thread::thread_solo),
	scene("conversation-message-transcript--default", thread::PANEL, thread::thread_solo),
	scene(
		"conversation-message-transcript--marks-new-messages",
		thread::PANEL,
		thread::transcript_marks_new_messages,
	),
	scene("layout-threadlayout--default", thread::PANEL, thread::thread_solo),
	scene("layout-threadlayout--empty", thread::PANEL, thread::layout_empty),
	scene("layout-threadlayout--long-content", thread::PANEL, thread::layout_long_content),
	scene(
		"layout-threadlayout--start-of-older-messages",
		thread::PANEL,
		thread::layout_start_of_older_messages,
	),
	scene("layout-threadlayout--error", thread::PANEL, thread::layout_error),
	scene("layout-threadlayout--pending", thread::PANEL, thread::layout_pending),
	focused("conversation-message-turn--focus-visible", thread::LINE, 1, thread::focus_ring),
];

pub struct SceneState {
	pub scene: &'static Scene,
	pub edit: TextEdit,
	pub picture: Option<Image>,
	pub math: Typesetter,
	images: Option<ImageCache>,
}

impl SceneState {
	pub fn new(scene: &'static Scene) -> SceneState {
		SceneState {
			scene,
			edit: TextEdit::new(scene.typed),
			picture: None,
			math: Typesetter::default(),
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
