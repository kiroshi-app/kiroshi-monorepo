use rune::{Align, Cursor, El, Side, col, row, text};

use super::navigation::{sessions, surface};
use super::{OVERLAY, SceneState, line, stage, staged};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::context_menu::{
	Mark, MenuItem, MenuRow, Shortcut, context_menu, context_menu_narrow, submenu,
};
use crate::primitives::dialog::{DialogContent, dialog, scrim};
use crate::primitives::dropdown_menu::dropdown_menu;
use crate::primitives::popover::popover;
use crate::primitives::sheet::sheet;
use crate::primitives::sidebar::{inset, trigger};
use crate::primitives::tooltip::{TooltipSide, tooltip};
use crate::primitives::{FOCUS_RING_WIDTH, ring_tint};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_SM, Tokens};

const MENU_LABEL: &str = "Transcript actions";
const MOVE_TO: &str = "Move to";
const CARD: (f32, f32) = (SPACING * 72.0, SPACING * 40.0);
const CARD_KEY: &str = "card";
const POINTER: (f32, f32) = (OVERLAY.0 / 2.0, OVERLAY.1 / 2.0);
const LONG_LABEL: &str = "Everything this bot was asked to do since the beginning of the week";
const NARROW_MENU: f32 = SPACING * 64.0;
const COPY: Shortcut = Shortcut { command: true, key: "C" };

fn card(t: &Tokens) -> El {
	row()
		.key(CARD_KEY)
		.size(CARD.0, CARD.1)
		.radius(RADIUS_XL)
		.fill(t.card)
		.border(1.0, t.border)
		.border_dash(4.0, 3.0)
		.center()
		.role("button")
		.label("Right-click this card")
		.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
		.child(text("Right-click this card".to_owned()).font(TEXT_SM).color(t.muted_foreground))
}

fn at_pointer(menu: El) -> El {
	menu.absolute(POINTER.0, POINTER.1)
}

fn transcript_rows(highlight_copy: bool, submenu_open: bool) -> [MenuRow<'static>; 5] {
	[
		MenuRow::Item(
			MenuItem::new("Copy transcript")
				.glyph(&icons::COPY)
				.shortcut(COPY)
				.highlighted(highlight_copy),
		),
		MenuRow::Item(MenuItem::new("Rename").glyph(&icons::PEN).disabled()),
		MenuRow::Item(
			MenuItem::new(MOVE_TO)
				.glyph(&icons::FOLDER)
				.mark(Mark::Submenu)
				.highlighted(submenu_open),
		),
		MenuRow::Separator,
		MenuRow::Item(MenuItem::new("Delete").glyph(&icons::BIN).destructive()),
	]
}

fn on_card(t: &Tokens, menu: El) -> El {
	staged(t, card(t), vec![at_pointer(menu)])
}

pub(super) fn context_menu_default(t: &Tokens, _: &SceneState) -> El {
	on_card(t, context_menu(t, MENU_LABEL, transcript_rows(false, false)))
}

pub(super) fn context_menu_closed(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t))
}

pub(super) fn context_menu_view_items(t: &Tokens, _: &SceneState) -> El {
	on_card(
		t,
		context_menu(
			t,
			MENU_LABEL,
			[
				MenuRow::Label("Transcript"),
				MenuRow::Item(MenuItem::new("Wrap long lines").mark(Mark::Check(true))),
				MenuRow::Item(MenuItem::new("Show timestamps").mark(Mark::Check(false))),
				MenuRow::Separator,
				MenuRow::Label("Density"),
				MenuRow::Item(MenuItem::new("Cosy").mark(Mark::Radio(true))),
				MenuRow::Item(MenuItem::new("Compact").mark(Mark::Radio(false))),
			],
		),
	)
}

pub(super) fn context_menu_with_submenu(t: &Tokens, _: &SceneState) -> El {
	let places = ["Inbox", "Later", "Archive"].map(|place| MenuRow::Item(MenuItem::new(place)));
	staged(
		t,
		card(t),
		vec![
			at_pointer(context_menu(t, MENU_LABEL, transcript_rows(false, true))),
			submenu(t, MOVE_TO, places).anchored(
				format!("menu-item-{MOVE_TO}"),
				Side::Right,
				Align::Start,
				0.0,
			),
		],
	)
}

pub(super) fn context_menu_states(t: &Tokens, _: &SceneState) -> El {
	on_card(t, context_menu(t, MENU_LABEL, transcript_rows(true, false)))
}

pub(super) fn context_menu_radius_ladder(t: &Tokens, _: &SceneState) -> El {
	staged(
		t,
		line([card(t), Button::new("Save").variant(ButtonVariant::Outline).view(t)]),
		vec![context_menu(t, MENU_LABEL, transcript_rows(false, false)).anchored(
			CARD_KEY,
			Side::Bottom,
			Align::Center,
			-CARD.1 / 2.0,
		)],
	)
}

pub(super) fn context_menu_long_content(t: &Tokens, _: &SceneState) -> El {
	on_card(
		t,
		context_menu_narrow(
			t,
			MENU_LABEL,
			NARROW_MENU,
			[
				MenuRow::Item(MenuItem::new(LONG_LABEL).glyph(&icons::FOLDER)),
				MenuRow::Item(MenuItem::new("Copy transcript").glyph(&icons::COPY)),
			],
		),
	)
}

pub(super) fn context_menu_minimum_width(t: &Tokens, _: &SceneState) -> El {
	on_card(
		t,
		context_menu(
			t,
			MENU_LABEL,
			["Cut", "Copy", "Paste"].map(|verb| MenuRow::Item(MenuItem::new(verb))),
		),
	)
}

pub(super) fn context_menu_trailing_slots(t: &Tokens, _: &SceneState) -> El {
	on_card(
		t,
		context_menu(
			t,
			MENU_LABEL,
			[
				MenuRow::Item(MenuItem::new("Copy transcript").glyph(&icons::COPY).shortcut(COPY)),
				MenuRow::Item(MenuItem::new(MOVE_TO).glyph(&icons::FOLDER).mark(Mark::Submenu)),
				MenuRow::Item(MenuItem::new("Wrap long lines").mark(Mark::Check(true))),
			],
		),
	)
}

pub(super) fn context_menu_long_label(t: &Tokens, _: &SceneState) -> El {
	on_card(
		t,
		context_menu_narrow(
			t,
			MENU_LABEL,
			NARROW_MENU,
			[MenuRow::Item(
				MenuItem::new(LONG_LABEL)
					.glyph(&icons::FOLDER)
					.shortcut(Shortcut { command: true, key: "L" }),
			)],
		),
	)
}

pub(super) fn context_menu_as_menu_button(t: &Tokens, _: &SceneState) -> El {
	staged(
		t,
		Button::new(MENU_LABEL).variant(ButtonVariant::Outline).expanded(true).view(t),
		vec![context_menu(t, MENU_LABEL, transcript_rows(false, false)).anchored(
			format!("button-{MENU_LABEL}"),
			Side::Bottom,
			Align::Start,
			SPACING,
		)],
	)
}

fn dismissed(_: &mut SceneState) {}

fn agent_settings(t: &Tokens, description: &str, open_trigger: bool) -> El {
	let footer = vec![
		Button::new("Cancel").variant(ButtonVariant::Outline).size(ButtonSize::Sm).view(t),
		Button::new("Save").size(ButtonSize::Sm).view(t),
	];
	let trigger = Button::new("Agent settings")
		.variant(ButtonVariant::Outline)
		.expanded(open_trigger)
		.view(t);
	staged(
		t,
		trigger,
		vec![
			scrim(t),
			dialog(t, DialogContent { title: "Agent settings", description, footer }, dismissed),
		],
	)
}

pub(super) fn dialog_default(t: &Tokens, _: &SceneState) -> El {
	agent_settings(t, "Name the agent and point it at a folder.", true)
}

pub(super) fn dialog_states(t: &Tokens, _: &SceneState) -> El {
	let footer = vec![
		Button::new("Cancel").variant(ButtonVariant::Outline).size(ButtonSize::Sm).view(t),
		Button::new("Delete")
			.variant(ButtonVariant::Destructive)
			.size(ButtonSize::Sm)
			.disabled(true)
			.view(t),
	];
	let content = DialogContent {
		title: "Delete agent",
		description: "This removes the agent and every conversation it holds.",
		footer,
	};
	staged(t, col(), vec![scrim(t), dialog(t, content, dismissed)])
}

pub(super) fn dialog_long_content(t: &Tokens, _: &SceneState) -> El {
	agent_settings(
		t,
		"A working directory, a model and a set of instructions are what an agent is made of, and every one of them is editable from this dialog, which is why the description alone runs past a single line on a narrow window.",
		true,
	)
}

pub(super) fn dropdown_menu_default(t: &Tokens, _: &SceneState) -> El {
	let more = Button::icon(&icons::MORE_HORIZONTAL, "More")
		.variant(ButtonVariant::Outline)
		.expanded(true);
	staged(
		t,
		more.view(t),
		vec![
			dropdown_menu(
				t,
				MENU_LABEL,
				[
					MenuRow::Item(MenuItem::new("Copy transcript").glyph(&icons::COPY)),
					MenuRow::Item(MenuItem::new("Rename").glyph(&icons::PEN)),
					MenuRow::Separator,
					MenuRow::Item(MenuItem::new("Delete").glyph(&icons::BIN).destructive()),
				],
			)
			.anchored("button-More", Side::Bottom, Align::Start, SPACING),
		],
	)
}

const RELEASE_NOTES: &str = "Release notes";

fn release_notes(t: &Tokens, note: &str, extra: Option<El>) -> El {
	let trigger = Button::new(RELEASE_NOTES).variant(ButtonVariant::Outline).expanded(true).view(t);
	let mut page = line([trigger]);
	if let Some(extra) = extra {
		page = page.child(extra);
	}
	staged(t, page, vec![popover(t, &format!("button-{RELEASE_NOTES}"), RELEASE_NOTES, Some(note))])
}

pub(super) fn popover_default(t: &Tokens, _: &SceneState) -> El {
	release_notes(t, "Agents keep their transcript when the window is reopened.", None)
}

pub(super) fn popover_states(t: &Tokens, _: &SceneState) -> El {
	let unavailable =
		Button::new("Unavailable").variant(ButtonVariant::Outline).disabled(true).view(t);
	release_notes(t, "Agents keep their transcript when the window is reopened.", Some(unavailable))
}

pub(super) fn popover_long_content(t: &Tokens, _: &SceneState) -> El {
	release_notes(
		t,
		"The workspace shell paints its first frame before the roster resolves, so a cold start no longer stares at an empty column, and a tool result arriving after a stop no longer takes the window down with it.",
		None,
	)
}

fn mobile_page(t: &Tokens) -> El {
	inset(
		t,
		col()
			.child(row().padding(SPACING * 2.0).child(trigger(t, "Toggle workspace")))
			.child(surface(t)),
	)
}

pub(super) fn sheet_closed(t: &Tokens, _: &SceneState) -> El {
	rune_kit::root(mobile_page(t), Vec::new())
}

pub(super) fn sheet_drawer(t: &Tokens, _: &SceneState) -> El {
	let drawer =
		sheet(t, "Workspace", col().w_full().padding(SPACING * 2.0).child(sessions(t)), dismissed);
	rune_kit::root(mobile_page(t), vec![scrim(t), drawer])
}

fn send(t: &Tokens) -> El {
	Button::new("Send").variant(ButtonVariant::Outline).view(t)
}

pub(super) fn tooltip_default(t: &Tokens, _: &SceneState) -> El {
	staged(t, send(t), vec![tooltip(t, "button-Send", "Send this prompt", TooltipSide::Top)])
}

pub(super) fn tooltip_with_side(t: &Tokens, _: &SceneState) -> El {
	let add = Button::icon(&icons::PLUS, "New bot")
		.variant(ButtonVariant::Ghost)
		.size(ButtonSize::IconSm);
	staged(t, add.view(t), vec![tooltip(t, "button-New bot", "New bot", TooltipSide::Bottom)])
}

pub(super) fn tooltip_long_content(t: &Tokens, _: &SceneState) -> El {
	staged(
		t,
		send(t),
		vec![tooltip(
			t,
			"button-Send",
			"Sends the prompt to the bot holding the conversation, then waits for its first token",
			TooltipSide::Top,
		)],
	)
}
