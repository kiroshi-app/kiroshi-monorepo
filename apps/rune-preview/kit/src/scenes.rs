use std::cell::RefCell;
use std::collections::HashMap;

use rune::image::{Image, ImageCache};
use rune::{AppSpec, Cx, El, TextEdit, Waker, row};

use crate::foundations::{self, PICTURE_SCALE, PICTURE_SIDE, UPLOADED_AVATAR_IMAGE};
use crate::surfaces::s10_agent_settings::Field;
use crate::surfaces::s10_agent_settings::agent::{Effort, Mode, OutputStyle};
use crate::surfaces::s10_agent_settings::shell::Entry;
use crate::surfaces::s10_agent_settings::skills::{FileFailure, Section};
use crate::tokens::{self, SPACING, Tokens};
use agent_settings::{
	ChangeCase, DIALOG, EditorCase, FILES, FilesCase, HistoryCase, Look, PAGE, PANEL, RUNTIME,
	RuntimeCase, SCREEN, SkillsCase,
};

mod agent_settings;
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
	scene("settings-bot-companionsettingsscreen--appearance", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Appearance)
	}),
	scene(
		"settings-bot-companionsettingsscreen--appearance-at-free-hue",
		SCREEN,
		agent_settings::screen_free_hue,
	),
	scene("settings-bot-companionsettingsscreen--applications", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Applications)
	}),
	scene("settings-bot-companionsettingsscreen--approvals", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Approvals)
	}),
	scene("settings-bot-companionsettingsscreen--back-to-companions", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene(
		"settings-bot-companionsettingsscreen--back-to-conversations",
		SCREEN,
		agent_settings::screen_back_to_conversations,
	),
	scene("settings-bot-companionsettingsscreen--companion-general", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene("settings-bot-companionsettingsscreen--danger-zone", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Danger)
	}),
	scene("settings-bot-companionsettingsscreen--danger-zone-light", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Danger)
	}),
	scene("settings-bot-companionsettingsscreen--default-width", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene(
		"settings-bot-companionsettingsscreen--delete-failed",
		SCREEN,
		agent_settings::screen_delete_failed,
	),
	scene("settings-bot-companionsettingsscreen--general", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene("settings-bot-companionsettingsscreen--history", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::History)
	}),
	scene("settings-bot-companionsettingsscreen--instructions", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Instructions)
	}),
	focused("settings-bot-companionsettingsscreen--left-column", SCREEN, 1, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	focused("settings-bot-companionsettingsscreen--left-column-dark", SCREEN, 1, |t, s| {
		agent_settings::screen_entry(t, s, Entry::General)
	}),
	scene(
		"settings-bot-companionsettingsscreen--maximum-width",
		SCREEN,
		agent_settings::screen_maximum_width,
	),
	scene(
		"settings-bot-companionsettingsscreen--minimum-width",
		SCREEN,
		agent_settings::screen_minimum_width,
	),
	scene("settings-bot-companionsettingsscreen--runtime", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Runtime)
	}),
	scene("settings-bot-companionsettingsscreen--secrets", SCREEN, |t, s| {
		agent_settings::screen_entry(t, s, Entry::Secrets)
	}),
	scene("settings-bot-companionsettingsscreen--skills", SCREEN, |t, s| {
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
];

pub struct SceneState {
	pub scene: &'static Scene,
	pub edit: TextEdit,
	pub picture: Option<Image>,
	images: Option<ImageCache>,
	fields: RefCell<HashMap<Field, TextEdit>>,
}

impl SceneState {
	pub fn new(scene: &'static Scene) -> SceneState {
		SceneState {
			scene,
			edit: TextEdit::new(scene.typed),
			picture: None,
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
