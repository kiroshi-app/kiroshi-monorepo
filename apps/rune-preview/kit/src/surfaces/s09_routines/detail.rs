use rune::{Color, El, Icon, col, el, icon, row, text};

use super::row::stopped_badge;
use super::{
	BORDER, Emit, Retry, RoutinesEvent, bar, bar_line, emits, empty_state, faint_bar,
	filling_skeleton, notice, plural, say, tabular,
};
use crate::icons;
use crate::primitives::DISABLED_OPACITY;
use crate::primitives::button::{Button, ButtonVariant};
use crate::strings::{Language, chat};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_BASE_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded};

use chat::routines::detail::{history, run_now};

const RUN_MARK: f32 = SPACING * 3.5;
const RUN_INSET: f32 = SPACING * 2.5 + BORDER;
const RUN_LINE: f32 = SPACING * 4.0;
const SKELETON_ROWS: usize = 16;
const SKELETON_WIDTHS: [(f32, f32); 3] = [
	(SPACING * 20.0, SPACING * 18.0),
	(SPACING * 26.0, SPACING * 16.0),
	(SPACING * 16.0, SPACING * 20.0),
];
const AGGREGATE_SEPARATOR: &str = " \u{b7} ";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
	Reported,
	Nothing,
	Skipped,
	Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunRefusal {
	Disabled,
	Filter,
	DedupeValueMissing,
	AlreadySeen,
}

impl RunRefusal {
	pub const ALL: [RunRefusal; 4] = [
		RunRefusal::Disabled,
		RunRefusal::Filter,
		RunRefusal::DedupeValueMissing,
		RunRefusal::AlreadySeen,
	];

	fn sentence(self, lang: Language) -> &'static str {
		let key = match self {
			RunRefusal::Disabled => run_now::refusal::DISABLED,
			RunRefusal::Filter => run_now::refusal::FILTER,
			RunRefusal::DedupeValueMissing => run_now::refusal::DEDUPE_VALUE_MISSING,
			RunRefusal::AlreadySeen => run_now::refusal::ALREADY_SEEN,
		};
		say(key, lang)
	}
}

#[derive(Clone, Copy, Debug)]
pub struct Run<'a> {
	pub id: &'a str,
	pub outcome: Option<Outcome>,
	pub started: &'a str,
	pub reason: Option<&'a str>,
}

#[derive(Clone, Copy, Debug)]
pub struct History<'a> {
	pub newest_first: &'a [Run<'a>],
	pub reading: bool,
	pub read_failed: bool,
	pub full_page: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct RoutineDetail<'a> {
	pub id: &'a str,
	pub title: &'a str,
	pub trigger: &'a str,
	pub stopped_itself: bool,
	pub running: bool,
	pub refusal: Option<RunRefusal>,
	pub history: History<'a>,
}

fn mark_of(t: &Tokens, outcome: Option<Outcome>) -> (&'static Icon, Color) {
	match outcome {
		Some(Outcome::Reported) => (&icons::SUCCESS, t.foreground),
		Some(Outcome::Nothing) => (&icons::CIRCLE, t.muted_foreground),
		Some(Outcome::Skipped) => (&icons::BAN, t.muted_foreground),
		Some(Outcome::Failed) => (&icons::ERROR, t.destructive),
		None => (&icons::LOADER_CIRCLE, t.muted_foreground),
	}
}

fn outcome_word(outcome: Option<Outcome>, lang: Language) -> &'static str {
	let key = match outcome {
		Some(Outcome::Reported) => history::outcome::REPORTED,
		Some(Outcome::Nothing) => history::outcome::NOTHING,
		Some(Outcome::Skipped) => history::outcome::SKIPPED,
		Some(Outcome::Failed) => history::outcome::FAILED,
		None => history::outcome::RUNNING,
	};
	say(key, lang)
}

fn run_frame(t: &Tokens) -> El {
	col()
		.w_full()
		.gap(SPACING)
		.padding(RUN_INSET)
		.radius(RADIUS_XL)
		.border(BORDER, t.border)
		.fill(faded(t.muted, 0.4))
}

fn run_row(t: &Tokens, lang: Language, run: &Run) -> El {
	let (shape, ink) = mark_of(t, run.outcome);
	let mut frame = run_frame(t).key(format!("run-{}", run.id)).role("listitem").child(
		row()
			.w_full()
			.flex_wrap()
			.gaps(SPACING * 0.5, SPACING * 2.0)
			.center_y()
			.child(
				row()
					.min_w(0.0)
					.gap(SPACING * 1.5)
					.center_y()
					.child(icon(shape, RUN_MARK).color(ink).a11y_hidden())
					.child(
						text(outcome_word(run.outcome, lang))
							.font(TEXT_XS_MEDIUM)
							.color(t.foreground)
							.wrap_anywhere(),
					),
			)
			.child(el().grow(1.0))
			.child(text(run.started.to_owned()).font(tabular(TEXT_XS)).color(t.muted_foreground)),
	);
	if let Some(reason) = run.reason {
		frame = frame
			.child(text(reason.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere());
	}
	frame
}

fn run_skeleton(t: &Tokens, rank: usize) -> El {
	let (outcome, time) = SKELETON_WIDTHS[rank % SKELETON_WIDTHS.len()];
	run_frame(t).a11y_hidden().child(
		row()
			.w_full()
			.justify_between()
			.center_y()
			.child(bar_line(RUN_LINE, bar(t, outcome)))
			.child(bar_line(RUN_LINE, faint_bar(t, time))),
	)
}

fn aggregate(t: &Tokens, lang: Language, history: &History, latest: &Run) -> El {
	let read = history.newest_first.len();
	let reports =
		history.newest_first.iter().filter(|run| run.outcome == Some(Outcome::Reported)).count();
	let counted = if history.full_page {
		plural(lang, read, history::PAGE_ONE, history::PAGE_OTHER, history::PAGE_MANY)
	} else {
		plural(lang, read, history::COUNTED_ONE, history::COUNTED_OTHER, history::COUNTED_MANY)
	};
	let parts = [
		counted,
		plural(
			lang,
			reports,
			history::REPORTED_ONE,
			history::REPORTED_OTHER,
			history::REPORTED_MANY,
		),
		super::fill(say(history::LATEST, lang), "when", latest.started),
	];
	text(parts.join(AGGREGATE_SEPARATOR)).font(tabular(TEXT_XS)).color(t.muted_foreground).wrap()
}

fn run_history<S: 'static>(t: &Tokens, lang: Language, history: &History, emit: Emit<S>) -> El {
	let failure = history.read_failed.then(|| {
		notice(
			t,
			lang,
			say(history::failure::TITLE, lang),
			say(history::failure::DESCRIPTION, lang),
			Retry { busy: history.reading, emit, event: RoutinesEvent::RetryRuns },
		)
	});
	let body = col().w_full().grow(1.0).gap(SPACING * 2.0);
	if let Some(latest) = history.newest_first.first() {
		return body.children(failure).child(aggregate(t, lang, history, latest)).child(
			col()
				.w_full()
				.gap(SPACING * 2.0)
				.role("list")
				.children(history.newest_first.iter().map(|run| run_row(t, lang, run))),
		);
	}
	if let Some(failure) = failure {
		return body.child(failure);
	}
	if history.reading {
		return body.role("status").label(say(history::READING, lang)).child(filling_skeleton(
			(0..SKELETON_ROWS).map(|rank| run_skeleton(t, rank)),
			SPACING * 2.0,
		));
	}
	body.child(empty_state(
		t,
		&icons::HISTORY,
		say(history::empty::TITLE, lang),
		say(history::empty::DESCRIPTION, lang),
	))
}

fn refusal_line(t: &Tokens, lang: Language, refusal: RunRefusal) -> El {
	row()
		.w_full()
		.gap(SPACING * 1.5)
		.items_start()
		.role("status")
		.child(icon(&icons::INFO, RUN_MARK).color(t.muted_foreground).a11y_hidden())
		.child(
			text(refusal.sentence(lang))
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.wrap_anywhere()
				.grow(1.0)
				.min_w(0.0),
		)
}

pub fn routine_detail<S: 'static>(
	t: &Tokens,
	lang: Language,
	detail: &RoutineDetail,
	emit: Emit<S>,
) -> El {
	let mut trigger = row().w_full().flex_wrap().gap(SPACING * 1.5).center_y().child(
		text(detail.trigger.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere(),
	);
	if detail.stopped_itself {
		trigger = trigger.child(stopped_badge(t, lang));
	}
	let edit_label = say(chat::routines::form::EDIT, lang);
	let edit = Button::new(edit_label)
		.variant(ButtonVariant::Outline)
		.leading(&icons::PEN)
		.view(t)
		.key(format!("routine-edit-{}", detail.id))
		.grow(1.0);
	let run_label = say(run_now::ACTION, lang);
	let run = Button::new(run_label)
		.leading(&icons::ROTATE_CW)
		.view(t)
		.key(format!("routine-run-{}", detail.id))
		.grow(1.0);
	let run = if detail.running {
		run.opacity(DISABLED_OPACITY)
	} else {
		emits(run, emit, RoutinesEvent::RunNow)
	};
	let mut surface = col()
		.key(format!("routine-detail-{}", detail.id))
		.w_full()
		.grow(1.0)
		.gap(SPACING * 4.0)
		.child(
			col()
				.w_full()
				.gap(SPACING)
				.child(
					text(detail.title.to_owned())
						.font(TEXT_BASE_MEDIUM)
						.color(t.foreground)
						.wrap_anywhere()
						.role("heading")
						.level(3),
				)
				.child(trigger),
		)
		.child(
			row()
				.w_full()
				.flex_wrap()
				.gap(SPACING * 2.0)
				.child(emits(edit, emit, RoutinesEvent::Edit))
				.child(run),
		);
	if let Some(refusal) = detail.refusal {
		surface = surface.child(refusal_line(t, lang, refusal));
	}
	surface.child(
		col()
			.w_full()
			.grow(1.0)
			.gap(SPACING * 2.0)
			.child(
				text(say(history::LABEL, lang))
					.font(TEXT_XS_MEDIUM)
					.color(t.foreground)
					.role("heading")
					.level(3),
			)
			.child(run_history(t, lang, &detail.history, emit)),
	)
}
