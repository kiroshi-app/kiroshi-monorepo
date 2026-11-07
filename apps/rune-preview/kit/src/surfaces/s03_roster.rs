use rune::{Align, Color, Cursor, El, Icon, TextStyle, col, el, icon, row, spacer, text};

use crate::avatar::{Face, hexagon, outlined_hexagon};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::skeleton::skeleton;
use crate::primitives::{FOCUS_RING_WIDTH, Interaction, Paint, tight};
use crate::strings::{Language, bots};
use crate::tokens::{
	RADIUS_2XL, RADIUS_LG, RADIUS_SM, RADIUS_XL, SPACING, TEXT_10_MEDIUM, TEXT_11, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

pub const AVATAR: f32 = SPACING * 10.0;
const ROW_PADDING: f32 = SPACING * 1.5;
const ROW_GAP: f32 = SPACING * 2.5;
const ROW_SPACING: f32 = SPACING * 0.5;
const PINNED_SPACING: f32 = SPACING * 1.5;
const ZONE_SPACING: f32 = SPACING * 2.0;
const STACK_MIN_HEIGHT: f32 = SPACING * 9.0;
const NAME_LINE: f32 = SPACING * 5.0;
const PREVIEW_LINE: f32 = SPACING * 4.0;
const STAMP_WIDTH: f32 = SPACING * 11.0;
const PREVIEW_END: f32 = SPACING * 3.5;
const TITLE_MIN_WIDTH: f32 = SPACING * 6.0;
const BADGE_DOT: f32 = SPACING * 2.0;
const BADGE_DOT_BOTTOM: f32 = SPACING;
const QUESTION_GLYPH: f32 = SPACING * 3.0;
const PILE_MEMBER: f32 = SPACING * 3.5;
const PILE_STEP: f32 = SPACING * 2.5;
const PILE_KNOCKOUT: f32 = 1.5;
const PILE_LIMIT: usize = 3;
const STRIP_HEIGHT: f32 = SPACING * 6.0;
const STRIP_DOT: f32 = SPACING * 1.5;
const STRIP_MARK: f32 = SPACING * 3.0;
const SECTION_HEADER: f32 = SPACING * 2.5;
const SECTION_INSET: f32 = 4.5;
const CHEVRON: f32 = SPACING * 3.5;
const SEPARATOR_INSET: f32 = SPACING * 1.5;
const LIFT_SHADOW_Y: f32 = 10.0;
const LIFT_SHADOW_BLUR: f32 = 15.0;
const LIFT_SHADOW_ALPHA: f32 = 0.1;
const DROP_AVATAR: f32 = SPACING * 7.0;
const DROP_AVATAR_OPACITY: f32 = 0.4;
const RESTING_INK_SHARE: f32 = 0.7;
const CHEVRON_INK_SHARE: f32 = 0.5;
const TITLE_FILL_SHARE: f32 = 0.1;
const TITLE_INK_SHARE: f32 = 0.8;
const STRIP_ID_INK_SHARE: f32 = 0.7;
const STRIP_WORKING_DOT_SHARE: f32 = 0.4;
const OPEN_SECTION_SHARE: f32 = 0.5;
const HOVERED_SECTION_SHARE: f32 = 0.7;
const LANDING_SHARE: f32 = 0.6;
const FAINT_BAR_SHARE: f32 = 0.6;
const PRESSED_SCALE: f32 = 0.98;
const SKELETON_BAR: f32 = SPACING * 3.0;
const SKELETON_FAINT_BAR: f32 = 9.0;
const SKELETON_TITLE_BADGE: (f32, f32) = (SPACING * 14.0, SPACING * 3.5);
const SKELETON_ROW_HEIGHT: f32 = AVATAR + ROW_PADDING * 2.0;
const SKELETON_PINNED_ROWS: usize = 2;
const SKELETON_ROW_GAP: f32 = SPACING * 0.5;
const UNREADABLE_PADDING: f32 = SPACING * 4.0;
const QUESTION_MARK: &str = "?";
const PART_SEPARATOR: &str = "·";

const MEDIUM: f32 = 500.0;
const SEMIBOLD: f32 = 600.0;
const BOLD: f32 = 700.0;
const QUESTION_GLYPH_SIZE: f32 = 9.0;
const TABULAR: &str = "'tnum' 1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RosterEvent {
	Select(String),
	ToggleSection(String),
	Retry,
}

pub type Emit<S> = fn(&mut S, RosterEvent);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowBadge {
	Attention,
	Done,
	Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MissionState {
	Waiting,
	Failed,
	Ready,
	Working,
}

#[derive(Clone, Copy)]
pub struct Strip<'a> {
	pub mark: &'static Icon,
	pub ticket: &'a str,
	pub title: &'a str,
	pub state: MissionState,
	pub is_live: bool,
}

pub enum Media<'a> {
	Agent(Face<'a>),
	Subject { glyph: &'static Icon, hue: Option<f32> },
}

#[derive(Clone, Copy, Default, PartialEq)]
pub struct Lift {
	pub is_lifted: bool,
	pub shift: f32,
}

pub struct Row<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub media: Option<Media<'a>>,
	pub title: Option<&'a str>,
	pub timestamp: Option<&'a str>,
	pub preview: Option<&'a str>,
	pub preview_lead: Option<&'a str>,
	pub question: Option<&'a str>,
	pub is_not_sent: bool,
	pub is_name_muted: bool,
	pub badge: Option<RowBadge>,
	pub pile: Vec<Face<'a>>,
	pub strips: Vec<Strip<'a>>,
	pub is_selected: bool,
	pub interaction: Interaction,
	pub lift: Lift,
}

impl<'a> Row<'a> {
	pub fn new(id: &'a str, name: &'a str) -> Row<'a> {
		Row {
			id,
			name,
			media: None,
			title: None,
			timestamp: None,
			preview: None,
			preview_lead: None,
			question: None,
			is_not_sent: false,
			is_name_muted: false,
			badge: None,
			pile: Vec::new(),
			strips: Vec::new(),
			is_selected: false,
			interaction: Interaction::Rest,
			lift: Lift::default(),
		}
	}
}

pub struct Section<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub is_open: bool,
	pub is_landing: bool,
	pub rows: Vec<Row<'a>>,
	pub lift: Lift,
}

pub enum Entry<'a> {
	Row(Row<'a>),
	Section(Section<'a>),
}

pub struct Roster<'a> {
	pub space_hue: Option<f32>,
	pub pinned: Vec<Entry<'a>>,
	pub sorted: Vec<Row<'a>>,
	pub is_sorted_landing: bool,
	pub is_reading_more: bool,
}

fn tabular(style: TextStyle) -> TextStyle {
	TextStyle { features: TABULAR, ..style }
}

fn weighted(style: TextStyle, weight: f32) -> TextStyle {
	TextStyle { weight, ..style }
}

fn resting_ink(t: &Tokens) -> Color {
	faded(t.sidebar_foreground, RESTING_INK_SHARE)
}

fn row_paint(t: &Tokens, is_selected: bool) -> Paint {
	let clear = t.sidebar.alpha(0.0);
	Paint {
		fill: if is_selected { t.sidebar_accent } else { clear },
		ink: if is_selected { t.sidebar_accent_foreground } else { resting_ink(t) },
		hover_fill: t.sidebar_accent,
		hover_ink: t.sidebar_accent_foreground,
	}
}

fn row_ground(t: &Tokens, item: &Row) -> Color {
	if item.lift.is_lifted {
		return t.sidebar;
	}
	match (item.is_selected, item.interaction) {
		(true, _) | (_, Interaction::Hover | Interaction::Press) => t.sidebar_accent,
		_ => t.sidebar,
	}
}

fn media_of(t: &Tokens, media: &Media) -> El {
	match media {
		Media::Agent(face) => face.draw(AVATAR, t),
		Media::Subject { glyph, hue } => subject_icon(t, glyph, *hue, AVATAR),
	}
}

pub fn subject_icon(t: &Tokens, glyph: &'static Icon, hue: Option<f32>, side: f32) -> El {
	let (fill, ink) = crate::tokens::conversation_icon(hue, t.dark);
	el().size(side, side)
		.a11y_hidden()
		.child(outlined_hexagon(side, fill, t).absolute(0.0, 0.0))
		.child(row().size(side, side).center().child(icon(glyph, side / 2.0).color(ink)))
}

fn title_badge(t: &Tokens, title: &str) -> El {
	let pill = row()
		.shrink()
		.min_w(TITLE_MIN_WIDTH)
		.px(SPACING * 1.5)
		.py(SPACING * 0.5)
		.radius(RADIUS_2XL * 2.0)
		.fill(faded(t.foreground, TITLE_FILL_SHARE))
		.child(
			text(title.to_owned())
				.font(tight(TEXT_10_MEDIUM))
				.color(faded(t.foreground, TITLE_INK_SHARE))
				.truncate(),
		);
	row().w(0.0).grow(1.0).min_w(TITLE_MIN_WIDTH).center_y().child(pill)
}

fn timestamp(t: &Tokens, item: &Row, language: Language) -> Option<El> {
	if item.is_not_sent {
		return Some(
			text(bots::roster::conversation::NOT_SENT.text(language).to_owned())
				.font(TEXT_XS_MEDIUM)
				.color(t.destructive)
				.single_line(),
		);
	}
	let ink = if item.question.is_some() { t.warning } else { t.muted_foreground };
	let style = weighted(TEXT_11, MEDIUM);
	let stamp = item.timestamp?;
	Some(
		text(stamp.to_owned())
			.font(tabular(TextStyle { line_height: NAME_LINE, ..style }))
			.color(ink)
			.align(Align::End)
			.truncate()
			.w(STAMP_WIDTH)
			.min_w(STAMP_WIDTH),
	)
}

fn name_line(t: &Tokens, item: &Row, paint: Paint, language: Language) -> El {
	let name = text(item.name.to_owned()).font(TEXT_SM_MEDIUM).truncate().shrink();
	let name = if item.is_name_muted { name.color(t.muted_foreground) } else { paint.ink(name) };
	let line = row().h(NAME_LINE).min_w(0.0).gap(SPACING * 1.5).center_y().child(name);
	let line = match item.title {
		Some(title) => line.child(title_badge(t, title)),
		None => line.child(spacer()),
	};
	line.children(timestamp(t, item, language))
}

fn pile(t: &Tokens, members: &[Face], ground: Color, language: Language) -> Option<El> {
	if members.is_empty() {
		return None;
	}
	let overflow = members.len() > PILE_LIMIT;
	let shown = if overflow { &members[..PILE_LIMIT - 1] } else { members };
	let slots = if overflow { PILE_LIMIT } else { shown.len() };
	let width = PILE_MEMBER + PILE_STEP * (slots - 1) as f32;
	let hole = PILE_MEMBER + PILE_KNOCKOUT * 2.0;
	let mut stack = el().size(width, PREVIEW_LINE).shrink().a11y_hidden();
	for (at, face) in shown.iter().enumerate() {
		let left = at as f32 * PILE_STEP;
		if at > 0 {
			stack = stack
				.child(hexagon(hole, ground).absolute(left - PILE_KNOCKOUT, 1.0 - PILE_KNOCKOUT));
		}
		stack = stack.child(face.draw(PILE_MEMBER, t).absolute(left, 1.0));
	}
	if overflow {
		let left = (PILE_LIMIT - 1) as f32 * PILE_STEP;
		let count = (members.len() - shown.len()).to_string();
		let label = bots::roster::conversation::OTHERS.text(language).replace("{{count}}", &count);
		let counter = TextStyle {
			line_height: PILE_MEMBER,
			..tabular(weighted(TextStyle::new(PILE_MEMBER * 0.45, BOLD), BOLD))
		};
		stack = stack
			.child(hexagon(hole, ground).absolute(left - PILE_KNOCKOUT, 1.0 - PILE_KNOCKOUT))
			.child(
				el().size(PILE_MEMBER, PILE_MEMBER)
					.absolute(left, 1.0)
					.child(
						outlined_hexagon(PILE_MEMBER, t.conversation_pile_overflow, t)
							.absolute(0.0, 0.0),
					)
					.child(row().size(PILE_MEMBER, PILE_MEMBER).center().child(
						text(label).font(counter).color(t.conversation_pile_overflow_foreground),
					)),
			);
	}
	Some(stack)
}

fn needs_you_line(t: &Tokens, question: &str, trailing: Option<El>, language: Language) -> El {
	let glyph = row()
		.size(QUESTION_GLYPH, QUESTION_GLYPH)
		.radius(QUESTION_GLYPH / 2.0)
		.fill(t.warning)
		.center()
		.a11y_hidden()
		.child(
			text(QUESTION_MARK)
				.font(TextStyle {
					line_height: QUESTION_GLYPH,
					..TextStyle::new(QUESTION_GLYPH_SIZE, BOLD)
				})
				.color(t.warning_foreground),
		);
	let mut line = row()
		.h(PREVIEW_LINE)
		.min_w(0.0)
		.gap(SPACING)
		.center_y()
		.child(glyph)
		.child(
			text(bots::roster::NEEDS_YOU.text(language).to_owned())
				.font(weighted(TEXT_XS, SEMIBOLD))
				.color(t.warning)
				.single_line(),
		)
		.child(
			text(question.to_owned()).font(TEXT_XS).color(t.muted_foreground).truncate().grow(1.0),
		);
	match trailing {
		Some(trailing) => line = line.child(row().pl(SPACING).child(trailing)),
		None => line = line.pr(SPACING),
	}
	line
}

fn preview_text(t: &Tokens, item: &Row) -> Option<El> {
	let preview = item.preview?;
	let words = text(preview.to_owned()).font(TEXT_XS_MEDIUM).color(t.muted_foreground).truncate();
	let Some(lead) = item.preview_lead else { return Some(words.grow(1.0)) };
	Some(
		row()
			.grow(1.0)
			.min_w(0.0)
			.gap(SPACING)
			.center_y()
			.child(text(lead.to_owned()).font(tabular(TEXT_XS_MEDIUM)).color(t.muted_foreground))
			.child(text(PART_SEPARATOR).font(TEXT_XS_MEDIUM).color(t.muted_foreground))
			.child(words.shrink()),
	)
}

fn preview_line(t: &Tokens, item: &Row, trailing: Option<El>, language: Language) -> Option<El> {
	if let Some(question) = item.question {
		return Some(needs_you_line(t, question, trailing, language));
	}
	let preview = preview_text(t, item);
	match trailing {
		Some(trailing) => {
			let end = if item.badge.is_some() { PREVIEW_END } else { 0.0 };
			Some(
				row()
					.h(PREVIEW_LINE)
					.min_w(0.0)
					.gap(SPACING * 2.0)
					.center_y()
					.justify_end()
					.pr(end)
					.children(preview)
					.child(trailing),
			)
		}
		None => Some(row().h(PREVIEW_LINE).min_w(0.0).center_y().pr(PREVIEW_END).child(preview?)),
	}
}

fn badge_dot(t: &Tokens, badge: RowBadge) -> El {
	let fill = match badge {
		RowBadge::Attention => t.warning,
		RowBadge::Done => t.bot_badge_done,
		RowBadge::Failed => t.bot_badge_failed,
	};
	el().size(BADGE_DOT, BADGE_DOT).radius(BADGE_DOT / 2.0).fill(fill).a11y_hidden().pin(
		None,
		None,
		Some(0.0),
		Some(BADGE_DOT_BOTTOM),
	)
}

fn mission_strip(t: &Tokens, strip: &Strip) -> El {
	let dot = match strip.state {
		MissionState::Waiting => t.warning,
		MissionState::Failed => t.bot_badge_failed,
		MissionState::Ready => t.bot_badge_done,
		MissionState::Working if strip.is_live => {
			faded(t.muted_foreground, STRIP_WORKING_DOT_SHARE)
		}
		MissionState::Working => Color::TRANSPARENT,
	};
	row()
		.h(STRIP_HEIGHT)
		.px(SPACING * 2.0)
		.gap(SPACING * 1.5)
		.radius(RADIUS_SM)
		.fill(faded(t.foreground, TITLE_FILL_SHARE))
		.center_y()
		.child(icon(strip.mark, STRIP_MARK).color(t.muted_foreground))
		.child(
			text(strip.ticket.to_owned())
				.font(tabular(TEXT_XS_MEDIUM))
				.color(faded(t.foreground, STRIP_ID_INK_SHARE))
				.single_line(),
		)
		.child(
			text(strip.title.to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.truncate()
				.grow(1.0)
				.min_w(0.0),
		)
		.child(el().size(STRIP_DOT, STRIP_DOT).radius(STRIP_DOT / 2.0).fill(dot).a11y_hidden())
}

pub fn roster_row<S: 'static>(t: &Tokens, item: &Row, language: Language, emit: Emit<S>) -> El {
	let paint = row_paint(t, item.is_selected).resting(item.interaction);
	let ground = row_ground(t, item);
	let mut stack = col()
		.grow(1.0)
		.min_w(0.0)
		.min_h(STACK_MIN_HEIGHT)
		.justify_center()
		.child(name_line(t, item, paint, language))
		.children(preview_line(t, item, pile(t, &item.pile, ground, language), language));
	if let (Some(badge), None) = (item.badge, item.question) {
		stack = stack.child(badge_dot(t, badge));
	}
	let head = row()
		.w_full()
		.min_w(0.0)
		.gap(ROW_GAP)
		.center_y()
		.children(item.media.as_ref().map(|media| media_of(t, media)))
		.child(stack);
	let body = if item.strips.is_empty() {
		head
	} else {
		col()
			.w_full()
			.gap(SPACING)
			.child(head)
			.children(item.strips.iter().map(|strip| mission_strip(t, strip)))
	};
	let id = item.id.to_owned();
	let button = row()
		.key(format!("roster-row-{}", item.id))
		.w_full()
		.padding(ROW_PADDING)
		.radius(RADIUS_LG)
		.role("button")
		.label(item.name)
		.child(body.grow(1.0))
		.focusable(true)
		.cursor(Cursor::Pointer)
		.press_scale(PRESSED_SCALE)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, t.sidebar_ring)
		.on_press(move |state: &mut S| emit(state, RosterEvent::Select(id.clone())));
	let button =
		if item.interaction == Interaction::Press { button.scale(PRESSED_SCALE) } else { button };
	lifted(t, paint.apply(button), item.lift)
}

fn lifted(t: &Tokens, entry: El, lift: Lift) -> El {
	let entry = if lift.shift == 0.0 { entry } else { entry.offset(0.0, lift.shift) };
	if !lift.is_lifted {
		return entry;
	}
	entry
		.fill(t.sidebar)
		.radius(RADIUS_2XL)
		.shadow(LIFT_SHADOW_Y, LIFT_SHADOW_BLUR, Color::BLACK.alpha(LIFT_SHADOW_ALPHA))
		.raise()
}

pub fn section_label(t: &Tokens, name: &str) -> El {
	text(name.to_owned()).font(weighted(TEXT_XS, SEMIBOLD)).color(t.sidebar_foreground).truncate()
}

pub fn section_header<S: 'static>(
	t: &Tokens,
	id: &str,
	name: &str,
	is_open: bool,
	emit: Emit<S>,
) -> El {
	let chevron = icon(&icons::CHEVRON_RIGHT, CHEVRON)
		.color(faded(t.sidebar_foreground, CHEVRON_INK_SHARE))
		.rotate(if is_open { std::f32::consts::FRAC_PI_2 } else { 0.0 });
	let id = id.to_owned();
	row()
		.key(format!("roster-section-{id}"))
		.w_full()
		.padding(SECTION_HEADER)
		.gap(SPACING * 1.5)
		.radius(RADIUS_XL)
		.center_y()
		.role("button")
		.label(name)
		.expanded(is_open)
		.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, t.sidebar_ring)
		.child(section_label(t, name))
		.child(chevron)
		.on_press(move |state: &mut S| emit(state, RosterEvent::ToggleSection(id.clone())))
}

pub fn roster_section<S: 'static>(
	t: &Tokens,
	section: &Section,
	language: Language,
	emit: Emit<S>,
) -> El {
	let fill = match (section.is_open, section.is_landing) {
		(true, true) => t.sidebar_accent,
		(true, false) => faded(t.sidebar_accent, OPEN_SECTION_SHARE),
		(false, _) => t.sidebar.alpha(0.0),
	};
	let mut card = col()
		.w_full()
		.radius(RADIUS_XL)
		.fill(fill)
		.role("group")
		.label(section.name)
		.child(section_header(t, section.id, section.name, section.is_open, emit));
	if section.is_open {
		card = card.child(
			col()
				.w_full()
				.px(SECTION_INSET)
				.pb(SECTION_INSET)
				.gap(ROW_SPACING)
				.children(section.rows.iter().map(|item| roster_row(t, item, language, emit))),
		);
	}
	lifted(t, card.hover(faded(t.sidebar_accent, HOVERED_SECTION_SHARE)), section.lift)
}

pub fn zone_separator(t: &Tokens) -> El {
	el().h(1.0).mx(SEPARATOR_INSET).my(SPACING).radius(0.5).fill(t.sidebar_border).a11y_hidden()
}

pub fn section_drop(t: &Tokens, name: &str, language: Language) -> El {
	row()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.radius(RADIUS_XL)
		.border(1.0, t.sidebar_border)
		.border_dash(SPACING, SPACING)
		.center()
		.child(
			Face::still(name, None).draw(DROP_AVATAR, t).opacity(DROP_AVATAR_OPACITY).a11y_hidden(),
		)
		.child(
			text(bots::roster::section::EMPTY.text(language).to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground),
		)
}

fn drop_area(t: &Tokens, is_landing: bool, content: El) -> El {
	let area = col().w_full().gap(ROW_SPACING).radius(RADIUS_2XL).child(content);
	if is_landing { area.fill(faded(t.sidebar_accent, LANDING_SHARE)) } else { area }
}

pub fn roster<S: 'static>(t: &Tokens, roster: &Roster, language: Language, emit: Emit<S>) -> El {
	let t = &t.in_space(roster.space_hue);
	let mut list = col().w_full().gap(ZONE_SPACING);
	if !roster.pinned.is_empty() {
		list = list.child(col().w_full().gap(PINNED_SPACING).children(roster.pinned.iter().map(
			|entry| match entry {
				Entry::Row(item) => roster_row(t, item, language, emit),
				Entry::Section(section) => roster_section(t, section, language, emit),
			},
		)));
		list = list.child(zone_separator(t));
	}
	if !roster.sorted.is_empty() {
		list = list.child(drop_area(
			t,
			roster.is_sorted_landing,
			col()
				.w_full()
				.gap(ROW_SPACING)
				.children(roster.sorted.iter().map(|item| roster_row(t, item, language, emit))),
		));
	}
	if roster.is_reading_more {
		list = list.child(skeleton_row(t, 0));
	}
	list
}

pub fn unreadable<S: 'static>(t: &Tokens, retry: Option<Emit<S>>, language: Language) -> El {
	let ink = resting_ink(t);
	let Some(emit) = retry else {
		return row().w_full().padding(UNREADABLE_PADDING).justify_center().child(
			text(bots::roster::UNAVAILABLE.text(language).to_owned())
				.font(TEXT_SM)
				.color(ink)
				.align(Align::Center)
				.wrap(),
		);
	};
	col()
		.w_full()
		.padding(UNREADABLE_PADDING)
		.gap(SPACING * 2.0)
		.items_center()
		.child(
			text(bots::roster::FAILED.text(language).to_owned())
				.font(TEXT_SM)
				.color(ink)
				.align(Align::Center)
				.wrap(),
		)
		.child(
			Button::new(bots::roster::RETRY.text(language))
				.variant(ButtonVariant::Outline)
				.size(ButtonSize::Xs)
				.view(t)
				.on_press(move |state: &mut S| emit(state, RosterEvent::Retry)),
		)
}

#[derive(Clone, Copy)]
enum SkeletonKind {
	Agent,
	Conversation,
}

struct SkeletonShape {
	kind: SkeletonKind,
	title: f32,
	stamp: f32,
	preview: f32,
}

const SKELETON_CYCLE: [SkeletonShape; 6] = [
	SkeletonShape { kind: SkeletonKind::Conversation, title: 66.0, stamp: 30.0, preview: 172.0 },
	SkeletonShape { kind: SkeletonKind::Agent, title: 48.0, stamp: 26.0, preview: 138.0 },
	SkeletonShape { kind: SkeletonKind::Agent, title: 74.0, stamp: 34.0, preview: 184.0 },
	SkeletonShape { kind: SkeletonKind::Conversation, title: 54.0, stamp: 26.0, preview: 126.0 },
	SkeletonShape { kind: SkeletonKind::Agent, title: 62.0, stamp: 30.0, preview: 160.0 },
	SkeletonShape { kind: SkeletonKind::Conversation, title: 44.0, stamp: 24.0, preview: 146.0 },
];

fn bar(fill: Color, width: f32, height: f32) -> El {
	el().size(width, height).radius(height / 2.0).fill(fill)
}

fn skeleton_row(t: &Tokens, at: usize) -> El {
	let shape = &SKELETON_CYCLE[at % SKELETON_CYCLE.len()];
	let faint = faded(t.border, FAINT_BAR_SHARE);
	let mut title =
		row().gap(SPACING * 1.5).center_y().child(bar(t.border, shape.title, SKELETON_BAR));
	let mut preview = row()
		.h(PREVIEW_LINE)
		.gap(SPACING * 2.0)
		.center_y()
		.justify_between()
		.child(bar(faint, shape.preview, SKELETON_FAINT_BAR));
	match shape.kind {
		SkeletonKind::Agent => {
			title = title.child(bar(faint, SKELETON_TITLE_BADGE.0, SKELETON_TITLE_BADGE.1));
		}
		SkeletonKind::Conversation => {
			preview = preview.child(
				el().size(PILE_MEMBER + PILE_STEP, PREVIEW_LINE)
					.child(hexagon(PILE_MEMBER, t.border).absolute(0.0, 1.0))
					.child(hexagon(PILE_MEMBER, t.border).absolute(PILE_STEP, 1.0)),
			);
		}
	}
	row()
		.w_full()
		.padding(ROW_PADDING)
		.gap(ROW_GAP)
		.center_y()
		.child(hexagon(AVATAR, t.border))
		.child(
			col()
				.grow(1.0)
				.child(row().h(NAME_LINE).center_y().justify_between().child(title).child(bar(
					faint,
					shape.stamp,
					SKELETON_FAINT_BAR,
				)))
				.child(preview),
		)
}

const SKELETON_PITCH: f32 = SKELETON_ROW_HEIGHT + SKELETON_ROW_GAP;

fn recent_skeleton_rows(height: f32) -> usize {
	let room = height - SKELETON_PITCH * SKELETON_PINNED_ROWS as f32;
	(room / SKELETON_PITCH).ceil().max(0.0) as usize
}

pub fn loading(t: &Tokens, height: f32) -> El {
	let recent = recent_skeleton_rows(height);
	let pulse = skeleton(t).radius(0.0).fill(Color::TRANSPARENT).w_full().h_full();
	pulse.child(
		col()
			.w_full()
			.h_full()
			.gap(SPACING)
			.child(
				col()
					.w_full()
					.gap(SKELETON_ROW_GAP)
					.children((0..SKELETON_PINNED_ROWS).map(|at| skeleton_row(t, at))),
			)
			.child(zone_separator(t))
			.child(
				col()
					.w_full()
					.gap(SKELETON_ROW_GAP)
					.children((0..recent).map(|at| skeleton_row(t, SKELETON_PINNED_ROWS + at))),
			),
	)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_skeleton_fills_the_height_it_is_given() {
		for height in [0.0, 120.0, 560.0, 800.0, 1440.0] {
			let rows = SKELETON_PINNED_ROWS + recent_skeleton_rows(height);
			assert!(rows as f32 * SKELETON_PITCH >= height, "{rows} rows leave {height} unfilled");
		}
	}
}
