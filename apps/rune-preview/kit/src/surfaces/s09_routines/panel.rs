use std::f32::consts::TAU;

use rune::{El, ScrollSpec, Shape, canvas, col, el, icon, row, text};

use super::reported_run::{ACTIVITY_AVATAR, ReportedRun, reported_run_row};
use super::row::{ROW_GAP, RoutineRow, routine_row_skeleton, routine_rows};
use super::{
	Emit, Retry, RoutinesEvent, bar, bar_line, emits, empty_state, faint_bar, filling_skeleton,
	glyph, icon_button, notice, ringed, say, tabular,
};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::scrim;
use crate::primitives::skeleton::skeleton;
use crate::primitives::{elevated, popup_motion};
use crate::strings::{Key, Language, chat, common};
use crate::tokens::{
	RADIUS_2XL, RADIUS_LG, RADIUS_XL, SHELL_INSET, SPACING, TEXT_BASE_SEMIBOLD, TEXT_COMPACT,
	TEXT_SM, TEXT_SM_SEMIBOLD, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

use chat::activity;

const HEADER: f32 = SPACING * 12.0;
const HEADER_INSET: f32 = SHELL_INSET + SPACING * 2.5;
const HEADER_ROW: f32 = SPACING * 7.0;
const GROUP_HEAD: f32 = SPACING * 7.0;
const GROUP_HEAD_INSET: f32 = SPACING * 1.5;
const GROUP_ROW_GAP: f32 = SPACING * 0.5;
const FOLD_GLYPH: f32 = SPACING * 3.5;
const ENTRY: f32 = SPACING * 10.0;
const ENTRY_GLYPH: f32 = SPACING * 4.0;
const SKELETON_ROWS: usize = 16;
const SKELETON_GROUPS: usize = 8;
const GROUP_BAR: f32 = SPACING * 2.25;
const STAMP_BAR: f32 = SPACING * 7.0;
const MISSION_GROUP_SHAPES: [(f32, &[(f32, f32)]); 2] = [
	(SPACING * 23.0, &[(SPACING * 37.5, SPACING * 42.5), (SPACING * 31.0, SPACING * 37.5)]),
	(
		SPACING * 17.5,
		&[
			(SPACING * 42.0, SPACING * 46.0),
			(SPACING * 33.0, SPACING * 24.0),
			(SPACING * 36.0, SPACING * 40.0),
		],
	),
];
const CONFIRM_WIDTH: f32 = SPACING * 88.0;
const CONFIRM_INSET: f32 = SPACING * 5.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
	Activity,
	Routines { can_create: bool },
	Detail,
	Form { written: bool, from_detail: bool },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
	Missions,
	Routines,
	Activity,
	Write,
}

impl Failure {
	fn words(self) -> (Key, Key) {
		use activity::failure;
		match self {
			Failure::Missions => (failure::missions::TITLE, failure::missions::DESCRIPTION),
			Failure::Routines => (failure::routines::TITLE, failure::routines::DESCRIPTION),
			Failure::Activity => (failure::activity::TITLE, failure::activity::DESCRIPTION),
			Failure::Write => (failure::write::TITLE, failure::write::DESCRIPTION),
		}
	}
}

#[derive(Clone, Copy, Debug)]
pub struct PanelChrome {
	pub page: Page,
	pub failure: Option<Failure>,
	pub routines_count: usize,
}

pub enum EarlierToday<'a> {
	Mission(Box<El>),
	Run(ReportedRun<'a>),
}

pub enum Missions<'a> {
	Loading,
	Listed {
		waiting: Vec<El>,
		in_progress: Vec<El>,
		earlier_today: Vec<EarlierToday<'a>>,
		earlier_today_open: bool,
	},
}

#[derive(Clone, Copy, Debug)]
pub enum Routines<'a> {
	Loading,
	Listed(&'a [RoutineRow<'a>]),
}

#[derive(Clone, Copy, Debug)]
pub enum Confirm<'a> {
	Delete { title: &'a str, failed: bool, busy: bool },
	Leave,
}

fn heading_of(page: Page) -> Option<(Key, Key)> {
	use chat::routines::{detail, form};
	match page {
		Page::Activity => None,
		Page::Routines { .. } => Some((activity::routines::BACK, activity::routines::TITLE)),
		Page::Detail => Some((form::BACK, detail::TITLE)),
		Page::Form { written, from_detail } => Some((
			if from_detail { detail::BACK } else { form::BACK },
			if written { form::EDIT } else { form::NEW },
		)),
	}
}

fn header<S: 'static>(t: &Tokens, lang: Language, page: Page, emit: Emit<S>) -> El {
	let heading = heading_of(page);
	let title = heading.map_or(activity::panel::TITLE, |(_, title)| title);
	let mut line = row().w_full().h(HEADER_ROW).gap(SPACING * 2.0).center_y();
	if let Some((back, _)) = heading {
		line = line.child(icon_button(
			t,
			&icons::PREVIOUS,
			say(back, lang),
			ButtonSize::IconSm,
			emit,
			RoutinesEvent::Back,
		));
	}
	line = line.child(
		text(say(title, lang))
			.font(TEXT_SM_SEMIBOLD)
			.color(t.foreground)
			.truncate()
			.grow(1.0)
			.min_w(0.0)
			.role("heading")
			.level(2),
	);
	if page == (Page::Routines { can_create: true }) {
		line = line.child(icon_button(
			t,
			&icons::PLUS,
			say(chat::routines::form::NEW, lang),
			ButtonSize::IconSm,
			emit,
			RoutinesEvent::NewRoutine,
		));
	}
	line = line.child(icon_button(
		t,
		&icons::PANEL_RIGHT,
		say(activity::panel::CLOSE, lang),
		ButtonSize::Icon,
		emit,
		RoutinesEvent::ClosePanel,
	));
	row().w_full().h(HEADER).px(HEADER_INSET).center_y().child(line)
}

fn entry<S: 'static>(t: &Tokens, lang: Language, count: usize, emit: Emit<S>) -> El {
	let words = say(activity::routines::TITLE, lang);
	let control = row()
		.key("routines-entry")
		.w_full()
		.h(ENTRY)
		.gap(SPACING * 2.5)
		.center_y()
		.pl(SPACING * 2.5)
		.pr(SPACING * 3.0)
		.radius(RADIUS_XL)
		.role("button")
		.label(words)
		.hover(faded(t.muted, 0.5))
		.child(glyph(t, &icons::REPEAT, ENTRY_GLYPH))
		.child(text(words).font(TEXT_COMPACT).color(t.foreground).truncate().grow(1.0).min_w(0.0))
		.child(text(count.to_string()).font(tabular(TEXT_XS)).color(t.muted_foreground));
	row().w_full().padding(SPACING * 2.0).child(emits(
		ringed(t, control),
		emit,
		RoutinesEvent::OpenRoutines,
	))
}

pub fn panel<S: 'static>(
	t: &Tokens,
	lang: Language,
	chrome: &PanelChrome,
	body: El,
	emit: Emit<S>,
) -> El {
	let failure = chrome.failure.map(|failure| {
		let (title, description) = failure.words();
		notice(
			t,
			lang,
			say(title, lang),
			say(description, lang),
			Retry { busy: false, emit, event: RoutinesEvent::Retry },
		)
	});
	let mut surface = col()
		.key("routines-panel")
		.grow(1.0)
		.h_full()
		.min_w(0.0)
		.fill(t.card)
		.role("complementary")
		.label(say(activity::panel::LABEL, lang))
		.child(header(t, lang, chrome.page, emit))
		.child(
			col()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.gap(SPACING * 4.0)
				.padding(SHELL_INSET)
				.scroll(ScrollSpec { stick_bottom: false })
				.children(failure)
				.child(body),
		);
	if chrome.page == Page::Activity {
		surface = surface.child(entry(t, lang, chrome.routines_count, emit));
	}
	row().w_full().h_full().child(el().w(1.0).h_full().fill(t.shell_divider)).child(surface)
}

fn group_list(rows: Vec<El>) -> El {
	col().w_full().gap(GROUP_ROW_GAP).role("list").children(rows)
}

fn count_text(t: &Tokens, count: usize) -> El {
	text(count.to_string()).font(tabular(TEXT_XS)).color(t.muted_foreground)
}

fn group(t: &Tokens, title: &str, rows: Vec<El>) -> El {
	let head = row()
		.h(GROUP_HEAD)
		.gap(SPACING * 1.5)
		.px(GROUP_HEAD_INSET)
		.center_y()
		.child(
			text(title.to_owned())
				.font(TEXT_XS_MEDIUM)
				.color(t.foreground)
				.role("heading")
				.level(3),
		)
		.child(count_text(t, rows.len()));
	col().w_full().gap(GROUP_ROW_GAP).child(head).child(group_list(rows))
}

fn folded_group<S: 'static>(
	t: &Tokens,
	title: &str,
	rows: Vec<El>,
	open: bool,
	emit: Emit<S>,
) -> El {
	let chevron = icon(&icons::CHEVRON_DOWN, FOLD_GLYPH).color(t.foreground).a11y_hidden();
	let chevron = if open { chevron } else { chevron.rotate(-TAU / 4.0) };
	let head = row()
		.key(format!("activity-fold-{title}"))
		.w_full()
		.h(GROUP_HEAD)
		.gap(SPACING * 1.5)
		.px(GROUP_HEAD_INSET)
		.center_y()
		.radius(RADIUS_LG)
		.role("button")
		.label(title)
		.expanded(open)
		.hover(faded(t.muted, 0.5))
		.child(chevron)
		.child(text(title.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground))
		.child(count_text(t, rows.len()));
	let head = emits(ringed(t, head), emit, RoutinesEvent::ToggleEarlierToday);
	let group = col().w_full().gap(GROUP_ROW_GAP).child(head);
	if open { group.child(group_list(rows)) } else { group }
}

fn hexagon(t: &Tokens, side: f32) -> El {
	let half = side / 2.0;
	let corners: Vec<[f32; 2]> = (0..6)
		.map(|corner| {
			let angle = corner as f32 * TAU / 6.0;
			[half + half * angle.cos(), half + half * angle.sin()]
		})
		.collect();
	canvas(Shape::new().view_box(side, side).fill(corners, t.border)).size(side, side)
}

fn mission_row_skeleton(t: &Tokens, (title, preview): (f32, f32)) -> El {
	row()
		.w_full()
		.gap(SPACING * 2.5)
		.center_y()
		.py(SPACING * 1.5)
		.pl(SPACING * 1.5)
		.pr(SPACING * 3.0)
		.child(hexagon(t, ACTIVITY_AVATAR))
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.child(
					row()
						.w_full()
						.h(SPACING * 5.0)
						.justify_between()
						.center_y()
						.child(bar(t, title))
						.child(faint_bar(t, STAMP_BAR)),
				)
				.child(bar_line(SPACING * 4.0, faint_bar(t, preview))),
		)
}

fn missions_skeleton(t: &Tokens) -> El {
	let groups = (0..SKELETON_GROUPS).map(|rank| {
		let (head, rows) = MISSION_GROUP_SHAPES[rank % MISSION_GROUP_SHAPES.len()];
		col()
			.w_full()
			.child(
				row()
					.h(GROUP_HEAD)
					.px(GROUP_HEAD_INSET)
					.center_y()
					.child(skeleton(t).size(head, GROUP_BAR).radius(GROUP_BAR).fill(t.border)),
			)
			.child(
				col()
					.w_full()
					.gap(GROUP_ROW_GAP)
					.children(rows.iter().map(|&widths| mission_row_skeleton(t, widths))),
			)
	});
	filling_skeleton(groups, SPACING * 3.0)
}

pub fn activity<S: 'static>(
	t: &Tokens,
	lang: Language,
	missions: Missions,
	notice_shown: bool,
	emit: Emit<S>,
) -> El {
	let body = col().w_full().grow(1.0).gap(SPACING * 4.0);
	let Missions::Listed { waiting, in_progress, earlier_today, earlier_today_open } = missions
	else {
		return body.child(missions_skeleton(t));
	};
	if waiting.is_empty() && in_progress.is_empty() && earlier_today.is_empty() {
		if notice_shown {
			return body;
		}
		return body.child(empty_state(
			t,
			&icons::BOOKMARK,
			say(activity::empty::TITLE, lang),
			say(activity::empty::DESCRIPTION, lang),
		));
	}
	use activity::missions::group::{IN_PROGRESS, WAITING};
	let mut body = body;
	for (key, rows) in [(WAITING, waiting), (IN_PROGRESS, in_progress)] {
		if !rows.is_empty() {
			body = body.child(group(t, say(key, lang), rows));
		}
	}
	if !earlier_today.is_empty() {
		let rows = earlier_today
			.into_iter()
			.map(|row| match row {
				EarlierToday::Mission(card) => *card,
				EarlierToday::Run(run) => reported_run_row(t, lang, &run),
			})
			.collect();
		body = body.child(folded_group(
			t,
			say(activity::missions::group::EARLIER_TODAY, lang),
			rows,
			earlier_today_open,
			emit,
		));
	}
	body
}

pub fn routines_page<S: 'static>(
	t: &Tokens,
	lang: Language,
	routines: Routines,
	emit: Emit<S>,
) -> El {
	let body = col().w_full().grow(1.0);
	match routines {
		Routines::Loading => body.child(filling_skeleton(
			(0..SKELETON_ROWS).map(|rank| routine_row_skeleton(t, rank)),
			ROW_GAP,
		)),
		Routines::Listed([]) => body.child(empty_state(
			t,
			&icons::REPEAT,
			say(chat::routines::empty::TITLE, lang),
			say(chat::routines::empty::DESCRIPTION, lang),
		)),
		Routines::Listed(rows) => body.child(routine_rows(t, lang, rows, emit)),
	}
}

pub fn confirm_layer<S: 'static>(
	t: &Tokens,
	lang: Language,
	confirm: Confirm,
	emit: Emit<S>,
) -> El {
	use chat::routines::{confirm as delete, leave};
	let (title, description, action, failure, busy) = match confirm {
		Confirm::Delete { title, failed, busy } => (
			super::fill(say(delete::TITLE, lang), "title", title),
			say(delete::DESCRIPTION, lang),
			say(delete::LABEL, lang),
			failed.then(|| say(delete::FAILURE, lang)),
			busy,
		),
		Confirm::Leave => (
			say(leave::TITLE, lang).to_owned(),
			say(leave::DESCRIPTION, lang),
			say(leave::ACTION, lang),
			None,
			false,
		),
	};
	let cancel = Button::new(say(common::confirm::CANCEL, lang))
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Sm)
		.disabled(busy)
		.view(t);
	let accept = Button::new(action)
		.variant(ButtonVariant::Destructive)
		.size(ButtonSize::Sm)
		.disabled(busy)
		.view(t);
	let (cancel, accept) = if busy {
		(cancel, accept)
	} else {
		(emits(cancel, emit, RoutinesEvent::Cancel), emits(accept, emit, RoutinesEvent::Confirm))
	};
	let popup = col()
		.key("routines-confirm")
		.w(CONFIRM_WIDTH)
		.gap(SPACING * 4.0)
		.padding(CONFIRM_INSET)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.role("alertdialog")
		.label(title.clone())
		.transition(popup_motion(t))
		.child(
			col()
				.w_full()
				.gap(SPACING)
				.child(
					text(title)
						.font(TEXT_BASE_SEMIBOLD)
						.color(t.popover_foreground)
						.wrap()
						.role("heading")
						.level(2),
				)
				.child(text(description).font(TEXT_SM).color(t.muted_foreground).wrap()),
		)
		.children(
			failure
				.map(|words| text(words).font(TEXT_XS).color(t.destructive).wrap().role("alert")),
		)
		.child(row().w_full().gap(SPACING * 2.0).justify_end().child(cancel).child(accept));
	el().absolute(0.0, 0.0).w_full().h_full().child(scrim(t)).child(
		el().absolute(0.0, 0.0)
			.w_full()
			.h_full()
			.padding(SPACING * 6.0)
			.center()
			.modal(true, move |s: &mut S| emit(s, RoutinesEvent::Cancel))
			.child(elevated(t, popup)),
	)
}
