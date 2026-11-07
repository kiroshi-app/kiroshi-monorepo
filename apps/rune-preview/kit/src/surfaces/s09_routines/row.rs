use rune::{El, col, row, text};

use super::{
	BORDER, Emit, RoutinesEvent, bar, bar_line, emits, faint_bar, icon_button, ringed, say,
};
use crate::icons;
use crate::primitives::badge::{BadgeVariant, badge};
use crate::primitives::button::ButtonSize;
use crate::primitives::skeleton::skeleton;
use crate::primitives::switch::{SwitchSize, switch};
use crate::strings::{Language, chat};
use crate::tokens::{RADIUS_LG, RADIUS_XL, SPACING, TEXT_SM_MEDIUM, TEXT_XS, Tokens, faded};

pub const ROW_GAP: f32 = SPACING * 2.0;

const INSET: f32 = SPACING * 2.5 + BORDER;
const TITLE_LINE: f32 = SPACING * 5.0;
const TRIGGER_LINE: f32 = SPACING * 4.0;
const SWITCH: (f32, f32) = (SPACING * 8.0, SPACING * 5.0);
const DELETE_ROOM: f32 = SPACING * 7.0;
const SKELETON_WIDTHS: [(f32, f32); 3] = [
	(SPACING * 28.0, SPACING * 24.0),
	(SPACING * 35.0, SPACING * 32.0),
	(SPACING * 24.5, SPACING * 27.5),
];

#[derive(Clone, Copy, Debug)]
pub struct RoutineRow<'a> {
	pub id: &'a str,
	pub title: &'a str,
	pub trigger: &'a str,
	pub enabled: bool,
	pub stopped_itself: bool,
}

fn frame(t: &Tokens) -> El {
	row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.padding(INSET)
		.radius(RADIUS_XL)
		.border(BORDER, t.border)
		.fill(faded(t.muted, 0.4))
}

pub(super) fn stopped_badge(t: &Tokens, lang: Language) -> El {
	badge(t, say(chat::routines::row::STOPPED, lang), BadgeVariant::Destructive)
}

pub fn routine_row<S: 'static>(
	t: &Tokens,
	lang: Language,
	routine: &RoutineRow,
	emit: Emit<S>,
) -> El {
	let mut trigger =
		row().min_w(0.0).gap(SPACING * 1.5).center_y().child(
			text(routine.trigger.to_owned()).font(TEXT_XS).color(t.muted_foreground).truncate(),
		);
	if routine.stopped_itself {
		trigger = trigger.child(stopped_badge(t, lang));
	}
	let opener = col()
		.key(format!("routine-open-{}", routine.id))
		.grow(1.0)
		.min_w(0.0)
		.gap(SPACING)
		.radius(RADIUS_LG)
		.role("button")
		.label(routine.title)
		.child(text(routine.title.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).truncate())
		.child(trigger);
	let opener = emits(ringed(t, opener), emit, RoutinesEvent::Open(routine.id.to_owned()));
	let toggle = emits(
		switch(t, routine.title, routine.enabled, false, SwitchSize::Default),
		emit,
		RoutinesEvent::SetEnabled(routine.id.to_owned(), !routine.enabled),
	);
	let delete = icon_button(
		t,
		&icons::BIN,
		&super::fill(say(chat::routines::row::DELETE, lang), "title", routine.title),
		ButtonSize::IconSm,
		emit,
		RoutinesEvent::AskDelete(routine.id.to_owned()),
	);
	frame(t)
		.key(format!("routine-{}", routine.id))
		.role("listitem")
		.child(opener)
		.child(toggle)
		.child(delete)
}

pub(super) fn routine_row_skeleton(t: &Tokens, rank: usize) -> El {
	let (title, trigger) = SKELETON_WIDTHS[rank % SKELETON_WIDTHS.len()];
	frame(t)
		.a11y_hidden()
		.child(
			col()
				.grow(1.0)
				.gap(SPACING)
				.child(bar_line(TITLE_LINE, bar(t, title)))
				.child(bar_line(TRIGGER_LINE, faint_bar(t, trigger))),
		)
		.child(
			skeleton(t).size(SWITCH.0, SWITCH.1).radius(SWITCH.1 / 2.0).fill(faded(t.border, 0.6)),
		)
		.child(row().size(DELETE_ROOM, DELETE_ROOM))
}

pub fn routine_rows<S: 'static>(
	t: &Tokens,
	lang: Language,
	routines: &[RoutineRow],
	emit: Emit<S>,
) -> El {
	col()
		.w_full()
		.gap(ROW_GAP)
		.role("list")
		.children(routines.iter().map(|routine| routine_row(t, lang, routine, emit)))
}
