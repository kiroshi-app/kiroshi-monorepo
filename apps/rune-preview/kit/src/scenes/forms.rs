use rune::{El, col, row, text};

use super::{SceneState, line, stage};
use crate::icons;
use crate::primitives::checkbox::{checkbox, labelled};
use crate::primitives::input::{InputSize, input};
use crate::primitives::input_otp::input_otp;
use crate::primitives::radio_group::{radio_group, radio_item};
use crate::primitives::slider::slider;
use crate::primitives::switch::{SwitchSize, switch};
use crate::primitives::toggle::{ToggleFace, ToggleVariant, toggle};
use crate::primitives::toggle_group::toggle_group;
use crate::tokens::{SPACING, TEXT_SM, TEXT_XS_MEDIUM, Tokens};

const SEARCH_LABEL: &str = "Search the history";
const SEARCH_HEAD: f32 = SPACING * 80.0;
const CODE_LABEL: &str = "6-digit code";
const CODE_SLOTS: usize = 6;
const CHOICES: [&str; 3] = ["Now", "Next week", "Never"];
const SLIDER_WIDTH: f32 = SPACING * 72.0;
const SWITCH_ROW: f32 = SPACING * 80.0;
const RANGES: [&str; 3] = ["Day", "Week", "Month"];

pub(super) fn checkbox_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, checkbox(t, "Send a summary", false, false))
}

pub(super) fn checkbox_states(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		line([
			checkbox(t, "Unchecked", false, false),
			checkbox(t, "Checked", true, false),
			checkbox(t, "Disabled unchecked", false, true),
			checkbox(t, "Disabled checked", true, true),
		]),
	)
}

pub(super) fn checkbox_with_label(t: &Tokens, _: &SceneState) -> El {
	let label = "Send a summary after every run";
	stage(t, labelled(t, checkbox(t, label, false, false), label))
}

pub(super) fn input_story(t: &Tokens, s: &SceneState) -> El {
	let field = input(t, &s.edit, SEARCH_LABEL, InputSize::Sm, |s: &mut SceneState| &mut s.edit);
	stage(t, row().w(SEARCH_HEAD).padding(SPACING * 4.0).child(field))
}

pub(super) fn input_otp_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, input_otp(t, CODE_LABEL, "123", CODE_SLOTS, true))
}

pub(super) fn input_otp_empty(t: &Tokens, _: &SceneState) -> El {
	stage(t, input_otp(t, CODE_LABEL, "", CODE_SLOTS, false))
}

fn choices(t: &Tokens, label: &str, selected: Option<&str>, disabled: bool) -> El {
	radio_group(
		label,
		CHOICES.map(|choice| {
			let item =
				radio_item(t, &format!("{label} {choice}"), selected == Some(choice), disabled);
			row()
				.gap(SPACING * 3.0)
				.center_y()
				.child(item)
				.child(text(choice.to_owned()).font(TEXT_SM).color(t.foreground))
		}),
	)
}

pub(super) fn radio_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, choices(t, "Ship the release", None, false))
}

pub(super) fn radio_states(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		row()
			.gap(SPACING * 8.0)
			.child(choices(t, "Enabled", Some("Next week"), false))
			.child(choices(t, "Disabled", Some("Next week"), true)),
	)
}

pub(super) fn radio_keyboard_walk(t: &Tokens, _: &SceneState) -> El {
	stage(t, choices(t, "Ship the release", Some("Now"), false))
}

pub(super) fn radio_on_dark_surface(t: &Tokens, _: &SceneState) -> El {
	stage(t, choices(t, "Ship the release", Some("Next week"), false))
}

pub(super) fn slider_default(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		col()
			.w(SLIDER_WIDTH)
			.gap(SPACING * 2.0)
			.child(text("Volume".to_owned()).font(TEXT_SM).color(t.foreground))
			.child(slider(t, "Volume", 0.4, SLIDER_WIDTH, false)),
	)
}

pub(super) fn switch_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, switch(t, "Preload this skill", false, false, SwitchSize::Default))
}

pub(super) fn switch_states(t: &Tokens, _: &SceneState) -> El {
	let control = |label: &str, checked: bool, disabled: bool| {
		switch(t, label, checked, disabled, SwitchSize::Default)
	};
	stage(
		t,
		line([
			control("Off", false, false),
			control("On", true, false),
			control("Focused", true, false),
			control("Disabled off", false, true),
			control("Disabled on", true, true),
		]),
	)
}

pub(super) fn switch_long_content(t: &Tokens, _: &SceneState) -> El {
	let label = "Preload every skill this agent owns into the prompt on every single turn";
	stage(
		t,
		row()
			.w(SWITCH_ROW)
			.gap(SPACING * 4.0)
			.items_start()
			.justify_between()
			.child(text(label.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground).wrap().shrink())
			.child(switch(t, label, false, false, SwitchSize::Default)),
	)
}

pub(super) fn toggle_default(t: &Tokens, _: &SceneState) -> El {
	stage(t, toggle(t, ToggleFace::Glyph(&icons::PIN, "Pin"), ToggleVariant::Outline, false))
}

pub(super) fn toggle_group_single_selection(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		toggle_group(
			"Range",
			RANGES.map(|range| {
				toggle(t, ToggleFace::Label(range), ToggleVariant::Outline, range == "Day")
			}),
		),
	)
}
