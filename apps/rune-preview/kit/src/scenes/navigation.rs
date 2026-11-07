use rune::{El, col, row, text};

use super::{SceneState, stage};
use crate::icons;
use crate::primitives::sidebar::{SidebarSide, group, inset, menu_button, sidebar, trigger};
use crate::primitives::tabs::{Tab, TabsVariant, tab_panel, tabs, tabs_list};
use crate::tokens::{SPACING, TEXT_SM, Tokens};

const SESSIONS: [&str; 3] = ["Brief", "Handover", "Retro"];
const SURFACE: &str = "Whatever screen the shell hands the room to.";
const LONG_TAB: &str = "Everything this bot was asked to do since the beginning of the week";
const LONG_TABS_WIDTH: f32 = SPACING * 80.0;

pub(super) fn sessions(t: &Tokens) -> El {
	group(
		t,
		"Sessions",
		SESSIONS.map(|session| menu_button(t, &icons::MESSAGE, session, session == SESSIONS[0])),
	)
}

fn panel(t: &Tokens, label: &str, side: SidebarSide) -> El {
	sidebar(
		t,
		label,
		side,
		[
			col().items_start().child(trigger(t, &format!("Toggle {label}"))),
			sessions(t).grow(1.0),
			col(),
		],
	)
}

pub(super) fn surface(t: &Tokens) -> El {
	row()
		.padding(SPACING * 4.0)
		.child(text(SURFACE.to_owned()).font(TEXT_SM).color(t.muted_foreground))
}

pub(super) fn sidebar_expanded(t: &Tokens, _: &SceneState) -> El {
	rune_kit::root(
		row()
			.w_full()
			.h_full()
			.child(panel(t, "Workspace", SidebarSide::Left))
			.child(inset(t, surface(t))),
		Vec::new(),
	)
}

pub(super) fn sidebar_right_side(t: &Tokens, _: &SceneState) -> El {
	rune_kit::root(
		row()
			.w_full()
			.h_full()
			.child(panel(t, "Workspace", SidebarSide::Left))
			.child(inset(t, surface(t)))
			.child(panel(t, "Activity", SidebarSide::Right)),
		Vec::new(),
	)
}

fn transcript_tabs(runs_disabled: bool) -> [Tab<'static>; 3] {
	let runs = Tab::new("Runs");
	[
		Tab::new("Transcript").active(),
		Tab::new("Files"),
		if runs_disabled { runs.disabled() } else { runs },
	]
}

pub(super) fn tabs_default(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		tabs(
			tabs_list(t, TabsVariant::Default, transcript_tabs(false)),
			Some(tab_panel(t, "Every turn, in order.")),
		),
	)
}

pub(super) fn tabs_variants(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		col().gap(SPACING * 6.0).children(TabsVariant::ALL.map(|variant| {
			tabs(tabs_list(t, variant, [Tab::new("Transcript").active(), Tab::new("Files")]), None)
		})),
	)
}

pub(super) fn tabs_states(t: &Tokens, _: &SceneState) -> El {
	stage(t, tabs(tabs_list(t, TabsVariant::Default, transcript_tabs(true)), None))
}

pub(super) fn tabs_long_content(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		col().w(LONG_TABS_WIDTH).child(tabs(
			tabs_list(t, TabsVariant::Default, [Tab::new(LONG_TAB).active(), Tab::new("Files")])
				.flex_wrap(),
			None,
		)),
	)
}
