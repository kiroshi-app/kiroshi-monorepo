use rune::{El, Icon, LoopSpec, Transition, col, el, icon, row, text};

use super::Emit;
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::elevated;
use crate::strings::{Language, chat, common};
use crate::tokens::{
	RADIUS_2XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, Tokens, faded,
};

const GLYPH: f32 = SPACING * 4.0;
const SPACE_MARK: f32 = SPACING * 2.5;
const SPACE_MARK_RADIUS: f32 = 3.0;
const SPACE_MARK_RING: f32 = 1.5;
const SURFACE_WIDTH: f32 = SPACING * 96.0;
const SURFACE_INSET: f32 = SPACING * 4.0;
const SHOWN: usize = 3;
const PEEK: f32 = SPACING * 3.0;
const SHRINK_PER_STEP: f32 = 0.1;
const ENTRY_TRAVEL: f32 = SURFACE_WIDTH * 1.5;
const SPIN_PERIOD: f64 = 1.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
	Warning,
	Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoticeEvent {
	Retry,
	Dismiss,
}

pub struct NoticeRetry<'a> {
	pub label: Option<&'a str>,
	pub busy: bool,
}

pub struct InlineNotice<'a> {
	pub tone: Tone,
	pub title: &'a str,
	pub description: Option<&'a str>,
	pub retry: Option<NoticeRetry<'a>>,
	pub dismissible: bool,
}

pub fn inline_notice<S: 'static>(
	t: &Tokens,
	language: Language,
	notice: &InlineNotice,
	emit: Emit<S, NoticeEvent>,
) -> El {
	let (ink, mark, glyph) = match notice.tone {
		Tone::Warning => (t.primary, t.bot_badge_attention, &icons::INFO),
		Tone::Error => (t.destructive, t.destructive, &icons::TRIANGLE_ALERT),
	};
	let mut words = col()
		.gap(SPACING)
		.child(text(notice.title.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).wrap());
	if let Some(description) = notice.description {
		words = words.child(
			text(description.to_owned()).font(TEXT_SM).color(faded(t.foreground, 0.8)).wrap(),
		);
	}
	let mut body = col().grow(1.0).shrink().gap(SPACING * 2.0).child(words);
	if let Some(retry) = &notice.retry {
		let label = retry.label.unwrap_or(chat::notice::RETRY.text(language));
		let button = Button::new(label).variant(ButtonVariant::Outline).size(ButtonSize::Sm);
		body = body.child(row().child(if retry.busy {
			button.disabled(true).view(t).a11y_value("busy")
		} else {
			button.view(t).on_press(move |s: &mut S| emit(s, NoticeEvent::Retry))
		}));
	}
	let mut notice_row = row()
		.key("notice")
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 3.0)
		.items_start()
		.radius(RADIUS_2XL)
		.border(1.0, faded(ink, 0.3))
		.fill(faded(ink, 0.1))
		.role(if notice.tone == Tone::Error { "alert" } else { "status" })
		.child(el().pt(SPACING * 0.5).a11y_hidden().child(icon(glyph, GLYPH).color(mark)))
		.child(body);
	if notice.dismissible {
		notice_row = notice_row.child(
			Button::icon(&icons::CLOSE, chat::notice::DISMISS.text(language))
				.variant(ButtonVariant::Ghost)
				.size(ButtonSize::IconSm)
				.view(t)
				.on_press(move |s: &mut S| emit(s, NoticeEvent::Dismiss)),
		);
	}
	notice_row
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoticeKind {
	Error,
	Info,
	Loading,
	Success,
	Warning,
}

impl NoticeKind {
	fn glyph(self) -> &'static Icon {
		match self {
			NoticeKind::Error => &icons::ERROR,
			NoticeKind::Info => &icons::INFO,
			NoticeKind::Loading => &icons::LOADER_CIRCLE,
			NoticeKind::Success => &icons::SUCCESS,
			NoticeKind::Warning => &icons::TRIANGLE_ALERT,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Report {
	Ready,
	Copied,
}

pub struct RaisedNotice<'a> {
	pub kind: NoticeKind,
	pub title: &'a str,
	pub description: Option<&'a str>,
	pub action: Option<&'a str>,
	pub space_hue: Option<f32>,
	pub report: Option<Report>,
}

impl<'a> RaisedNotice<'a> {
	pub fn failure(title: &'a str, description: Option<&'a str>) -> RaisedNotice<'a> {
		RaisedNotice {
			kind: NoticeKind::Error,
			title,
			description,
			action: None,
			space_hue: None,
			report: None,
		}
	}

	pub fn transient(kind: NoticeKind, title: &'a str, description: Option<&'a str>) -> Self {
		RaisedNotice { kind, ..RaisedNotice::failure(title, description) }
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SurfaceEvent {
	Act(usize),
	CopyReport(usize),
	Close(usize),
}

pub fn notice_surface<S: 'static>(
	t: &Tokens,
	language: Language,
	raised: &[RaisedNotice],
	emit: Emit<S, SurfaceEvent>,
) -> El {
	let first_shown = raised.len().saturating_sub(SHOWN);
	let shown = &raised[first_shown..];
	let mut stack = el().key("notice-surface").w_full().role("region");
	stack = stack.label(common::notice::LABEL.text(language));
	for (depth, _) in shown.iter().enumerate().skip(1).rev() {
		let scale = 1.0 - SHRINK_PER_STEP * depth as f32;
		stack = stack.child(
			card(t, el())
				.absolute(0.0, 0.0)
				.w_full()
				.h_full()
				.origin(0.5, 0.0)
				.scale(scale)
				.offset(0.0, -PEEK * depth as f32)
				.a11y_hidden(),
		);
	}
	if let Some(front) = shown.last() {
		let index = raised.len() - 1;
		stack = stack.child(entering(t, card(t, content(t, language, front, index, emit))));
	}
	row()
		.absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.padding(SURFACE_INSET)
		.justify_end()
		.items_end()
		.child(col().w_full().max_w(SURFACE_WIDTH).child(stack))
}

fn entering(t: &Tokens, notice: El) -> El {
	let travel = if t.reduced_motion {
		Transition::opacity()
	} else {
		Transition::offset(ENTRY_TRAVEL, 0.0).combined(Transition::opacity())
	};
	notice.transition(travel)
}

fn card(t: &Tokens, content: El) -> El {
	elevated(
		t,
		el().w_full().radius(RADIUS_2XL).border(1.0, t.border).fill(t.popover).child(content),
	)
}

fn mark(t: &Tokens, notice: &RaisedNotice) -> Option<El> {
	if let Some(hue) = notice.space_hue {
		let ring = t.in_space(Some(hue)).primary_strong;
		return Some(
			el().size(SPACE_MARK, SPACE_MARK)
				.radius(SPACE_MARK_RADIUS)
				.border(SPACE_MARK_RING, ring)
				.a11y_hidden(),
		);
	}
	let ink = if notice.kind == NoticeKind::Error { t.destructive } else { t.popover_foreground };
	let glyph =
		el().size(GLYPH, GLYPH).a11y_hidden().child(icon(notice.kind.glyph(), GLYPH).color(ink));
	Some(if notice.kind == NoticeKind::Loading && !t.reduced_motion {
		glyph.looping(LoopSpec::rotation(SPIN_PERIOD))
	} else {
		glyph
	})
}

fn content<S: 'static>(
	t: &Tokens,
	language: Language,
	notice: &RaisedNotice,
	index: usize,
	emit: Emit<S, SurfaceEvent>,
) -> El {
	let mut words = col().grow(1.0).shrink().gap(SPACING).child(
		text(notice.title.to_owned())
			.font(TEXT_SM_SEMIBOLD)
			.color(t.popover_foreground)
			.wrap_anywhere(),
	);
	if let Some(description) = notice.description {
		words = words.child(
			text(description.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap_anywhere(),
		);
	}
	let mut body = row()
		.w_full()
		.padding(SPACING * 4.0)
		.gap(SPACING * 3.0)
		.center_y()
		.role("alertdialog")
		.label(notice.title);
	if let Some(mark) = mark(t, notice) {
		body = body.child(mark);
	}
	body = body.child(words);
	if let Some(action) = notice.action {
		body = body.child(
			Button::new(action)
				.variant(ButtonVariant::Outline)
				.size(ButtonSize::Sm)
				.view(t)
				.on_press(move |s: &mut S| emit(s, SurfaceEvent::Act(index))),
		);
	}
	if let Some(report) = notice.report {
		let label = match report {
			Report::Ready => common::notice::COPY,
			Report::Copied => common::notice::COPIED,
		};
		body = body.child(
			Button::new(label.text(language))
				.variant(ButtonVariant::Outline)
				.size(ButtonSize::Sm)
				.view(t)
				.on_press(move |s: &mut S| emit(s, SurfaceEvent::CopyReport(index))),
		);
	}
	body.child(
		Button::icon(&icons::CLOSE, common::notice::CLOSE.text(language))
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::IconSm)
			.view(t)
			.on_press(move |s: &mut S| emit(s, SurfaceEvent::Close(index))),
	)
}
