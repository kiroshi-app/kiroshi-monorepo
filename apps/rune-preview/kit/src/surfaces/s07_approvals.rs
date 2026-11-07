use std::f32::consts::PI;

use rune::image::Image;
use rune::{
	Color, Cursor, El, Icon, Key, KeyEvent, PhysicalKeyCode, SurfaceFit, TextEdit, TextStyle, Tx,
};
use rune::{col, el, icon, row, text, text_input};

use crate::avatar::Person;
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::{
	DISABLED_OPACITY, FOCUS_RING_WIDTH, Paint, equal_padding, instant, ring_tint, tight,
};
use crate::strings::chat::{answered_question, tool_approval, tool_question};
use crate::strings::{Key as Phrase, Language};
use crate::tokens::{
	RADIUS_2XL, RADIUS_CONTROL, RADIUS_MD, RADIUS_SM, RADIUS_XL, SPACING, TEXT_11, TEXT_COMPACT,
	TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO, TEXT_COMPACT_SEMIBOLD, TEXT_READING, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, TEXT_XS_MONO, Tokens, faded, mix,
};

const QUESTION_RADIUS: f32 = 24.0;
const SEGMENTS_RADIUS: f32 = 11.0;
const SEGMENTS_INSET: f32 = 3.0;
const SEGMENT_HEIGHT: f32 = 26.0;
const KEY_CHIP: f32 = SPACING * 5.0;
const MARK_SLOT: f32 = SPACING * 5.0;
const CHECK_GLYPH: f32 = 18.0;
const CHECK_STROKE: f32 = 2.4;
const PILL_HEIGHT: f32 = SPACING * 8.0;
const PILL_GLYPH: f32 = SPACING * 3.5;
const ICON_BUTTON: f32 = SPACING * 7.0;
const OWN_ANSWER_HEIGHT: f32 = SPACING * 11.0;
const OWN_ANSWER_GLYPH: f32 = 15.0;
const WAITING_MARK: f32 = SPACING * 4.0;
const FAILURE_DOT: f32 = SPACING * 1.5;
const APPLICATION_MARK: f32 = 22.0;
const AUTHOR_AVATAR: f32 = SPACING * 5.0;
const PARAMETER_LABEL: f32 = SPACING * 28.0;
const BADGE_HEIGHT: f32 = 22.0;
const ENTRY_HEIGHT: f32 = 36.0;
const CODE_HEIGHT: f32 = 38.0;
const SEGMENT_SHADOW: f32 = 0.1;
const UNCHOSEN_CHIP_LIGHT: f32 = 0.06;
const UNCHOSEN_CHIP_DARK: f32 = 0.08;
const CHOSEN_CHIP_LIGHT: f32 = 0.1;
const CHOSEN_CHIP_DARK: f32 = 0.15;
const CHOSEN_DIGIT: f32 = 0.8;
const CHOSEN_DESCRIPTION_LIGHT: f32 = 0.7;
const WAITING_SEND: f32 = 0.4;
const INVERSE_HOVER: f32 = 0.8;
const CODE_INK: f32 = 0.85;
const CODE_SURFACE: f32 = 0.4;
const DENIED_BORDER: f32 = 0.4;

const OPTION_KEY: &str = "question-option-";
const NAME: &str = "{{name}}";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ApprovalStatus {
	#[default]
	Pending,
	Allowed,
	Denied,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParameterValue<'a> {
	Shown(&'a str),
	Sensitive,
}

#[derive(Clone, Copy, Debug)]
pub struct ApprovalParameter<'a> {
	pub label: &'a str,
	pub value: ParameterValue<'a>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ToolApproval<'a> {
	pub tool: &'a str,
	pub title: Option<&'a str>,
	pub description: Option<&'a str>,
	pub code: Option<&'a str>,
	pub parameters: &'a [ApprovalParameter<'a>],
	pub status: ApprovalStatus,
	pub is_open: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApprovalEvent {
	AllowOnce,
	Deny,
	ToggleInput,
}

#[derive(Clone, Copy, Debug)]
pub struct QuestionOption<'a> {
	pub label: &'a str,
	pub description: &'a str,
	pub preview: Option<&'a str>,
}

impl<'a> QuestionOption<'a> {
	pub const fn new(label: &'a str, description: &'a str) -> QuestionOption<'a> {
		QuestionOption { label, description, preview: None }
	}
}

#[derive(Clone, Copy, Debug)]
pub struct QuestionLink<'a> {
	pub label: &'a str,
	pub url: &'a str,
}

#[derive(Clone, Copy, Debug)]
pub struct QuestionEntry<'a> {
	pub label: &'a str,
	pub placeholder: &'a str,
	pub is_secret: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct QuestionFailure<'a> {
	pub title: &'a str,
	pub detail: Option<&'a str>,
}

#[derive(Clone, Copy)]
pub struct QuestionAction<'a> {
	pub label: &'a str,
	pub glyph: &'static Icon,
}

#[derive(Clone, Copy)]
pub struct Question<'a> {
	pub question: Option<&'a str>,
	pub header: &'a str,
	pub mark: Option<&'a Image>,
	pub is_multi_select: bool,
	pub options: &'a [QuestionOption<'a>],
	pub is_options_only: bool,
	pub link: Option<QuestionLink<'a>>,
	pub entry: Option<QuestionEntry<'a>>,
	pub action: Option<QuestionAction<'a>>,
	pub exit: Option<&'a str>,
	pub failure: Option<QuestionFailure<'a>>,
}

impl<'a> Question<'a> {
	pub const fn ask(
		question: &'a str,
		header: &'a str,
		options: &'a [QuestionOption<'a>],
	) -> Question<'a> {
		Question { question: Some(question), options, ..Question::notice(header) }
	}

	pub const fn notice(header: &'a str) -> Question<'a> {
		Question {
			question: None,
			header,
			mark: None,
			is_multi_select: false,
			options: &[],
			is_options_only: false,
			link: None,
			entry: None,
			action: None,
			exit: None,
			failure: None,
		}
	}

	fn is_notice(&self) -> bool {
		self.question.is_none()
	}
}

#[derive(Clone, Copy)]
pub struct Draft<'a> {
	pub chosen: &'a [usize],
	pub edit: &'a TextEdit,
}

impl Draft<'_> {
	fn is_answered(&self) -> bool {
		!self.chosen.is_empty() || !self.edit.text.trim().is_empty()
	}
}

#[derive(Clone, Copy)]
pub struct QuestionPanel<'a> {
	pub questions: &'a [Question<'a>],
	pub drafts: &'a [Draft<'a>],
	pub shown: usize,
	pub companion: Option<&'a str>,
	pub can_skip: bool,
	pub can_minimise: bool,
	pub has_digit_keys: bool,
	pub is_refused: bool,
	pub is_pending: bool,
	pub has_copied: bool,
}

impl QuestionPanel<'_> {
	fn is_answered(&self, index: usize) -> bool {
		self.questions[index].is_notice() || self.drafts.get(index).is_some_and(Draft::is_answered)
	}

	pub fn waiting_after_shown(&self) -> Option<usize> {
		(0..self.questions.len()).find(|&index| index != self.shown && !self.is_answered(index))
	}

	fn chosen(&self, option: usize) -> bool {
		self.drafts.get(self.shown).is_some_and(|draft| draft.chosen.contains(&option))
	}

	fn digit_gesture(&self, digit: usize) -> Option<QuestionEvent> {
		let shown = self.questions.get(self.shown)?;
		if !self.has_digit_keys || shown.is_notice() || shown.entry.is_some() {
			return None;
		}
		let option = digit.checked_sub(1).filter(|&option| option < shown.options.len())?;
		pick(shown, option, self.chosen(option))
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QuestionEvent {
	Choose(usize),
	Toggle(usize),
	Typed,
	Skip,
	Submit,
	Show(usize),
	Minimise,
	Expand,
	Exit,
	Act,
	CopyLink,
}

#[derive(Clone, Copy, Debug)]
pub struct AnsweredQuestion<'a> {
	pub header: &'a str,
	pub options: &'a [QuestionOption<'a>],
	pub chosen: &'a [usize],
	pub free_text: Option<&'a str>,
}

#[derive(Clone, Copy)]
pub struct Answerer<'a> {
	pub name: &'a str,
	pub image: Option<&'a Image>,
	pub is_viewer: bool,
}

const DIGITS: [PhysicalKeyCode; 9] = [
	PhysicalKeyCode::Digit1,
	PhysicalKeyCode::Digit2,
	PhysicalKeyCode::Digit3,
	PhysicalKeyCode::Digit4,
	PhysicalKeyCode::Digit5,
	PhysicalKeyCode::Digit6,
	PhysicalKeyCode::Digit7,
	PhysicalKeyCode::Digit8,
	PhysicalKeyCode::Digit9,
];

fn digit_of(event: &KeyEvent, physical: Option<PhysicalKeyCode>) -> Option<usize> {
	if event.mods.cmd || event.mods.ctrl || event.mods.alt {
		return None;
	}
	if let Some(at) = physical.and_then(|code| DIGITS.iter().position(|&digit| digit == code)) {
		return Some(at + 1);
	}
	let Key::Text(typed) = &event.key else { return None };
	match typed.as_bytes() {
		[digit @ b'1'..=b'9'] => Some(usize::from(digit - b'0')),
		_ => None,
	}
}

fn pick(question: &Question, option: usize, is_chosen: bool) -> Option<QuestionEvent> {
	match (question.is_multi_select, is_chosen) {
		(true, _) => Some(QuestionEvent::Toggle(option)),
		(false, false) => Some(QuestionEvent::Choose(option)),
		(false, true) => None,
	}
}

fn copy(key: Phrase, language: Language) -> String {
	key.text(language).to_owned()
}

fn ringed(t: &Tokens, control: El) -> El {
	control.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}

fn check(size: f32) -> El {
	icon(icons::stroked(&icons::CHECK, CHECK_STROKE), size)
}

fn medium(style: TextStyle) -> TextStyle {
	TextStyle { weight: TEXT_XS_MEDIUM.weight, ..style }
}

fn clear(t: &Tokens) -> Color {
	t.background.alpha(0.0)
}

fn ghost_paint(t: &Tokens) -> Paint {
	Paint {
		fill: clear(t),
		ink: t.muted_foreground,
		hover_fill: if t.dark { faded(t.muted, 0.5) } else { t.muted },
		hover_ink: t.foreground,
	}
}

fn inverse_paint(t: &Tokens) -> Paint {
	Paint {
		fill: t.foreground,
		ink: t.background,
		hover_fill: mix(t.foreground, t.background, INVERSE_HOVER),
		hover_ink: t.background,
	}
}

struct Face<'a> {
	scope: &'a str,
	label: &'a str,
	leading: Option<&'static Icon>,
	trailing: Option<&'static Icon>,
	paint: Paint,
}

fn pill(face: Face) -> El {
	let style = tight(TEXT_COMPACT_MEDIUM);
	let content = if face.leading.or(face.trailing).is_some() { PILL_GLYPH } else { style.size };
	let mut pill = row()
		.key(format!("pill-{}-{}", face.scope, face.label))
		.padding(equal_padding(PILL_HEIGHT, content))
		.gap(SPACING * 1.5)
		.radius(PILL_HEIGHT / 2.0)
		.center()
		.role("button")
		.label(face.label);
	if let Some(glyph) = face.leading {
		pill = pill.child(face.paint.ink(icon(glyph, PILL_GLYPH)));
	}
	pill = pill.child(face.paint.ink(text(face.label.to_owned()).font(style)));
	if let Some(glyph) = face.trailing {
		pill = pill.child(face.paint.ink(icon(glyph, PILL_GLYPH)));
	}
	face.paint.apply(pill)
}

pub fn tool_approval<S: 'static>(
	t: &Tokens,
	language: Language,
	approval: &ToolApproval,
	on: impl Fn(&mut S, ApprovalEvent) + Clone + 'static,
) -> El {
	let title = approval.title.map_or_else(|| copy(tool_approval::TITLE, language), str::to_owned);
	let head = row()
		.w_full()
		.gap(SPACING * 3.0)
		.items_start()
		.justify_between()
		.child(
			col()
				.shrink()
				.min_w(0.0)
				.child(text(title.clone()).font(TEXT_SM_MEDIUM).color(t.foreground).wrap())
				.child(
					text(approval.tool.to_owned())
						.font(TEXT_XS_MONO)
						.color(t.muted_foreground)
						.truncate(),
				),
		)
		.child(status_badge(t, language, approval.status));
	let mut summary = col().w_full().padding(SPACING * 3.0).gap(SPACING * 2.0).child(head);
	if let Some(description) = approval.description {
		summary = summary
			.child(text(description.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap());
	}
	if let Some(code) = approval.code {
		summary = summary.child(code_block(t, code));
	}
	if !approval.parameters.is_empty() {
		summary = summary.child(input_toggle(t, language, approval.is_open, on.clone()));
	}
	let mut card = col()
		.key(format!("tool-approval-{}", approval.tool))
		.w_full()
		.radius(RADIUS_2XL)
		.border(1.0, t.border)
		.fill(t.card)
		.clip_rounded(RADIUS_2XL)
		.role("group")
		.label(title)
		.child(summary);
	if approval.is_open && !approval.parameters.is_empty() {
		card = card.child(divided(t, parameter_rows(t, language, approval.parameters)));
	}
	if approval.status == ApprovalStatus::Pending {
		card = card.child(divided(t, decisions(t, language, on)));
	}
	card
}

fn status_badge(t: &Tokens, language: Language, status: ApprovalStatus) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	let (key, glyph) = match status {
		ApprovalStatus::Pending => (tool_approval::status::PENDING, &icons::SHIELD),
		ApprovalStatus::Allowed => (tool_approval::status::ALLOWED, &icons::SUCCESS),
		ApprovalStatus::Denied => (tool_approval::status::DENIED, &icons::CLOSE),
	};
	let (fill, ink, border) = match status {
		ApprovalStatus::Denied => (t.card, t.destructive, faded(t.destructive, DENIED_BORDER)),
		_ => (t.muted, t.foreground, t.border),
	};
	row()
		.shrink()
		.padding(equal_padding(BADGE_HEIGHT - 2.0, style.size))
		.gap(SPACING * 1.5)
		.radius(BADGE_HEIGHT / 2.0)
		.center()
		.fill(fill)
		.border(1.0, border)
		.role("status")
		.child(icon(glyph, SPACING * 3.0).color(ink))
		.child(text(copy(key, language)).font(style).color(ink))
}

fn code_block(t: &Tokens, code: &str) -> El {
	row()
		.w_full()
		.padding(equal_padding(CODE_HEIGHT, TEXT_XS_MONO.line_height))
		.radius(RADIUS_XL)
		.border(1.0, t.border)
		.fill(faded(t.muted, CODE_SURFACE))
		.child(text(code.to_owned()).font(TEXT_XS_MONO).color(faded(t.foreground, CODE_INK)).wrap())
}

fn input_toggle<S: 'static>(
	t: &Tokens,
	language: Language,
	is_open: bool,
	on: impl Fn(&mut S, ApprovalEvent) + 'static,
) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	let label = copy(tool_approval::INPUT, language);
	let paint = ghost_paint(t);
	let chevron = icon(&icons::CHEVRON_DOWN, SPACING * 3.0).rotate(if is_open { PI } else { 0.0 });
	let toggle = row()
		.key("tool-approval-input")
		.self_start()
		.padding(equal_padding(SPACING * 6.0, style.size))
		.gap(SPACING)
		.radius(RADIUS_2XL)
		.center()
		.role("button")
		.label(label.clone())
		.expanded(is_open)
		.child(paint.ink(text(label).font(style)))
		.child(paint.ink(chevron));
	ringed(t, paint.apply(toggle)).on_press(move |s: &mut S| on(s, ApprovalEvent::ToggleInput))
}

fn divided(t: &Tokens, section: El) -> El {
	col().w_full().child(el().w_full().h(1.0).fill(t.border)).child(section)
}

fn parameter_rows(t: &Tokens, language: Language, parameters: &[ApprovalParameter]) -> El {
	col().w_full().padding(SPACING * 3.0).gap(SPACING * 2.0).children(parameters.iter().map(
		|parameter| {
			let value = match parameter.value {
				ParameterValue::Shown(value) => {
					text(value.to_owned()).font(TEXT_XS_MONO).color(t.foreground)
				}
				ParameterValue::Sensitive => text(copy(tool_approval::SENSITIVE, language))
					.font(TEXT_XS)
					.color(t.muted_foreground),
			};
			row()
				.w_full()
				.gap(SPACING * 3.0)
				.items_start()
				.child(
					text(parameter.label.to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.max_w(PARAMETER_LABEL)
						.w(PARAMETER_LABEL)
						.wrap(),
				)
				.child(value.grow(1.0).shrink().min_w(0.0).wrap_anywhere())
		},
	))
}

fn decisions<S: 'static>(
	t: &Tokens,
	language: Language,
	on: impl Fn(&mut S, ApprovalEvent) + Clone + 'static,
) -> El {
	let allow_label = copy(tool_approval::ALLOW_ONCE, language);
	let deny_label = copy(tool_approval::DENY, language);
	let allow = on.clone();
	row()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.flex_wrap()
		.center_y()
		.child(
			Button::new(&allow_label)
				.leading(&icons::SUCCESS)
				.size(ButtonSize::Sm)
				.view(t)
				.on_press(move |s: &mut S| allow(s, ApprovalEvent::AllowOnce)),
		)
		.child(
			Button::new(&deny_label)
				.leading(&icons::CLOSE)
				.variant(ButtonVariant::Outline)
				.size(ButtonSize::Sm)
				.view(t)
				.on_press(move |s: &mut S| on(s, ApprovalEvent::Deny)),
		)
}

fn question_surface(t: &Tokens, base: El) -> El {
	base.w_full().padding(SPACING * 3.0).radius(QUESTION_RADIUS).border(1.0, t.border).fill(t.muted)
}

pub fn tool_question<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &QuestionPanel,
	edit: impl for<'e> Fn(&'e mut S) -> &'e mut TextEdit + Clone + 'static,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let Some(shown) = panel.questions.get(panel.shown) else { return el() };
	let mut card = question_surface(t, col())
		.key(format!("tool-question-{}", shown.header))
		.gap(SPACING * 3.0)
		.role("form")
		.label(
			shown.question.or(shown.failure.map(|failure| failure.title)).unwrap_or(shown.header),
		)
		.child(question_head(t, language, panel, shown, on.clone()));
	if !shown.is_notice() {
		card = card.child(question_fields(t, language, panel, shown, edit, on.clone()));
	}
	card = card.child(question_foot(t, language, panel, shown, on.clone()));
	let digits: Vec<Option<QuestionEvent>> =
		(1..=9).map(|digit| panel.digit_gesture(digit)).collect();
	card.on_key(move |s: &mut S, event: &KeyEvent, tx: &mut Tx| {
		let digit = digit_of(event, tx.physical_key()).filter(|_| !tx.key_repeat());
		if let Some(gesture) = digit.and_then(|digit| digits[digit - 1]) {
			on(s, gesture);
			return true;
		}
		let is_return = event.key == Key::Enter && !event.mods.shift;
		if is_return && tx.focused().is_none_or(|focused| focused.starts_with(OPTION_KEY)) {
			on(s, QuestionEvent::Submit);
			return true;
		}
		false
	})
}

fn question_head<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &QuestionPanel,
	shown: &Question,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let has_segments = panel.questions.len() > 1;
	let mut lines =
		col().grow(1.0).shrink().min_w(0.0).gap(if has_segments { SPACING * 2.5 } else { SPACING });
	lines = if has_segments {
		lines.child(segments(t, panel, on.clone()))
	} else {
		lines.child(
			text(shown.header.to_owned()).font(TEXT_XS_MEDIUM).color(t.muted_foreground).truncate(),
		)
	};
	if let Some(failure) = shown.failure {
		lines = lines.child(failure_block(t, failure));
	}
	if let Some(question) = shown.question {
		lines = lines.child(asked_line(t, shown.mark, question));
		if shown.is_multi_select {
			lines = lines.child(
				text(copy(tool_question::PICK_ANY, language))
					.font(TEXT_COMPACT)
					.color(t.muted_foreground)
					.wrap(),
			);
		}
	}
	let mut head =
		row().w_full().pl(SPACING).pr(SPACING).pt(SPACING).gap(SPACING * 3.0).items_start();
	head = head.child(lines);
	if panel.can_minimise {
		head = head.child(minimise_button(t, language, shown.header, on));
	}
	head
}

fn asked_line(t: &Tokens, mark: Option<&Image>, question: &str) -> El {
	let style = TextStyle { weight: TEXT_COMPACT_SEMIBOLD.weight, ..TEXT_READING };
	let asked = text(question.to_owned()).font(style).color(t.foreground).wrap();
	let Some(mark) = mark else { return asked };
	row()
		.w_full()
		.gap(SPACING * 2.0)
		.center_y()
		.child(
			el().size(APPLICATION_MARK, APPLICATION_MARK)
				.radius(RADIUS_SM)
				.clip_rounded(RADIUS_SM)
				.pixels_fit(mark.pixels(), SurfaceFit::Fill),
		)
		.child(asked.grow(1.0).shrink().min_w(0.0))
}

fn minimise_button<S: 'static>(
	t: &Tokens,
	language: Language,
	scope: &str,
	on: impl Fn(&mut S, QuestionEvent) + 'static,
) -> El {
	let paint = ghost_paint(t);
	let glyph = SPACING * 4.0;
	let button = row()
		.key(format!("tool-question-minimise-{scope}"))
		.padding(equal_padding(ICON_BUTTON, glyph))
		.radius(RADIUS_MD)
		.center()
		.role("button")
		.label(copy(tool_question::MINIMISE, language))
		.child(paint.ink(icon(&icons::CHEVRON_DOWN, glyph)));
	ringed(t, paint.apply(button)).on_press(move |s: &mut S| on(s, QuestionEvent::Minimise))
}

fn segments<S: 'static>(
	t: &Tokens,
	panel: &QuestionPanel,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let style = tight(TEXT_COMPACT_MEDIUM);
	let triggers = panel.questions.iter().enumerate().map(|(index, question)| {
		let is_shown = index == panel.shown;
		let ink = if is_shown { t.foreground } else { t.question_segment_foreground };
		let mut segment = row()
			.key(format!("question-segment-{}-{index}", panel.questions[0].header))
			.shrink()
			.min_w(0.0)
			.padding(equal_padding(SEGMENT_HEIGHT, style.size))
			.gap(SPACING)
			.radius(RADIUS_MD)
			.center_y()
			.role("tab")
			.label(question.header)
			.checked(is_shown)
			.focus_selected(is_shown);
		if !question.is_notice() && panel.is_answered(index) {
			segment = segment.child(icon(&icons::CHECK, SPACING * 3.0).color(t.bot_badge_done));
		}
		segment = segment.child(
			text(question.header.to_owned())
				.font(style)
				.color(ink)
				.group_color(t.foreground)
				.truncate(),
		);
		if is_shown {
			segment = segment.fill(t.card).shadow(1.0, 2.0, Color::BLACK.alpha(SEGMENT_SHADOW));
		}
		let on = on.clone();
		ringed(t, instant(segment.hover_group()))
			.on_press(move |s: &mut S| on(s, QuestionEvent::Show(index)))
	});
	let track = row()
		.key(format!("question-segments-{}", panel.questions[0].header))
		.shrink()
		.min_w(0.0)
		.padding(SEGMENTS_INSET)
		.gap(SPACING * 0.5)
		.radius(SEGMENTS_RADIUS)
		.fill(t.border)
		.role("tablist")
		.focus_group()
		.children(triggers);
	row().w_full().child(track)
}

fn failure_block(t: &Tokens, failure: QuestionFailure) -> El {
	let mut block = col().w_full().gap(SPACING * 1.5).child(
		row()
			.w_full()
			.gap(SPACING * 2.0)
			.items_start()
			.child(
				el().mt(7.0)
					.size(FAILURE_DOT, FAILURE_DOT)
					.radius(FAILURE_DOT / 2.0)
					.fill(t.destructive),
			)
			.child(
				text(failure.title.to_owned())
					.font(TEXT_SM_MEDIUM)
					.color(t.foreground)
					.wrap()
					.grow(1.0)
					.shrink()
					.min_w(0.0),
			),
	);
	if let Some(detail) = failure.detail {
		block =
			block.child(row().self_start().padding(SPACING).radius(RADIUS_MD).fill(t.card).child(
				text(detail.to_owned()).font(TEXT_XS_MONO).color(t.muted_foreground).wrap(),
			));
	}
	block
}

fn question_fields<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &QuestionPanel,
	shown: &Question,
	edit: impl for<'e> Fn(&'e mut S) -> &'e mut TextEdit + Clone + 'static,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let draft_edit = panel.drafts.get(panel.shown).map(|draft| draft.edit);
	let mut fields =
		col().w_full().gap(if shown.entry.is_some() { SPACING * 3.0 } else { SPACING * 1.5 });
	if let Some(link) = shown.link {
		fields = fields.child(link_field(t, language, link, panel.has_copied, on.clone()));
	}
	if let Some(entry) = shown.entry {
		if let Some(typed) = draft_edit {
			fields = fields.child(entry_field(t, entry, panel.is_refused, typed, edit, on.clone()));
		}
	} else {
		let rows = shown.options.iter().enumerate().map(|(index, option)| {
			option_row(t, language, shown, index, option, panel.chosen(index), on.clone())
		});
		let group = col()
			.w_full()
			.gap(SPACING * 1.5)
			.role(if shown.is_multi_select { "group" } else { "radiogroup" })
			.label(shown.question.unwrap_or(shown.header))
			.focus_group()
			.children(rows);
		fields = fields.child(group);
		if !shown.is_options_only
			&& let Some(typed) = draft_edit
		{
			fields = fields.child(own_answer_field(t, language, shown.header, typed, edit, on));
		}
	}
	if panel.is_refused && !panel.is_answered(panel.shown) {
		fields = fields.child(
			row()
				.w_full()
				.pl(SPACING)
				.pr(SPACING)
				.gap(SPACING * 1.5)
				.center_y()
				.role("alert")
				.child(icon(&icons::ERROR, SPACING * 3.5).color(t.destructive))
				.child(
					text(copy(tool_question::BLANK, language)).font(TEXT_XS).color(t.foreground),
				),
		);
	}
	fields
}

fn option_row<S: 'static>(
	t: &Tokens,
	language: Language,
	question: &Question,
	index: usize,
	option: &QuestionOption,
	is_chosen: bool,
	on: impl Fn(&mut S, QuestionEvent) + 'static,
) -> El {
	let (fill, ink, chip, digit, description) = if is_chosen {
		let chip_share = if t.dark { CHOSEN_CHIP_DARK } else { CHOSEN_CHIP_LIGHT };
		let description = if t.dark {
			t.user_bubble_muted_foreground
		} else {
			faded(t.user_bubble_foreground, CHOSEN_DESCRIPTION_LIGHT)
		};
		(
			t.user_bubble,
			t.user_bubble_foreground,
			faded(t.user_bubble_foreground, chip_share),
			faded(t.user_bubble_foreground, CHOSEN_DIGIT),
			description,
		)
	} else {
		let chip_share = if t.dark { UNCHOSEN_CHIP_DARK } else { UNCHOSEN_CHIP_LIGHT };
		(
			t.card,
			t.foreground,
			faded(t.foreground, chip_share),
			t.muted_foreground,
			t.muted_foreground,
		)
	};
	let content = row()
		.grow(1.0)
		.shrink()
		.min_w(0.0)
		.flex_wrap()
		.gaps(SPACING * 0.5, SPACING * 2.5)
		.center_y()
		.child(
			text(option.label.to_owned())
				.font(TEXT_SM_MEDIUM)
				.color(ink)
				.wrap()
				.shrink()
				.min_w(0.0),
		)
		.child(
			text(option.description.to_owned())
				.font(TEXT_COMPACT)
				.color(description)
				.wrap()
				.shrink()
				.min_w(0.0),
		);
	let mut row_ = row()
		.key(format!("{OPTION_KEY}{}-{index}", question.header))
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 3.0)
		.items_start()
		.radius(RADIUS_CONTROL)
		.fill(fill)
		.role(if question.is_multi_select { "checkbox" } else { "radio" })
		.label(option.label)
		.description(option.description)
		.checked(is_chosen)
		.focus_selected(is_chosen)
		.child(key_chip(index + 1, chip, digit))
		.child(content)
		.child(option_mark(t, question.is_multi_select, is_chosen));
	if !is_chosen {
		row_ = row_.hover(mix(t.muted, t.card, 0.5)).press(t.muted);
	}
	let gesture = pick(question, index, is_chosen);
	let row_ = ringed(t, instant(row_)).on_press(move |s: &mut S| {
		if let Some(gesture) = gesture {
			on(s, gesture);
		}
	});
	match option.preview.filter(|_| is_chosen) {
		Some(preview) => {
			col().w_full().gap(SPACING * 1.5).child(row_).child(preview_block(t, language, preview))
		}
		None => row_,
	}
}

fn key_chip(position: usize, fill: Color, ink: Color) -> El {
	el().size(KEY_CHIP, KEY_CHIP)
		.radius(RADIUS_SM)
		.center()
		.fill(fill)
		.child(text(position.to_string()).font(tight(medium(TEXT_11))).color(ink))
}

fn option_mark(t: &Tokens, is_multi_select: bool, is_chosen: bool) -> El {
	let slot = el().size(MARK_SLOT, MARK_SLOT).center();
	if !is_multi_select {
		return slot.child(
			check(CHECK_GLYPH).color(t.user_bubble_foreground).opacity(if is_chosen {
				1.0
			} else {
				0.0
			}),
		);
	}
	let circle = el().size(MARK_SLOT, MARK_SLOT).radius(MARK_SLOT / 2.0).center();
	slot.child(if is_chosen {
		circle
			.fill(t.user_bubble_foreground)
			.child(icon(&icons::CHECK, SPACING * 3.0).color(t.user_bubble))
	} else {
		circle.border(1.5, t.question_option_ring)
	})
}

fn preview_block(t: &Tokens, language: Language, preview: &str) -> El {
	col()
		.w_full()
		.pl(SPACING * 3.0)
		.pr(SPACING * 3.0)
		.pb(SPACING)
		.gap(SPACING)
		.child(text(copy(tool_question::PREVIEW, language)).font(TEXT_XS).color(t.muted_foreground))
		.child(text(preview.to_owned()).font(TEXT_XS_MONO).color(t.foreground).wrap_anywhere())
}

fn own_answer_field<S: 'static>(
	t: &Tokens,
	language: Language,
	scope: &str,
	typed: &TextEdit,
	edit: impl for<'e> Fn(&'e mut S) -> &'e mut TextEdit + 'static,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let style = tight(TEXT_SM);
	let inset = equal_padding(OWN_ANSWER_HEIGHT, style.size);
	let glyph_box = SPACING * 5.0;
	let lead = SPACING * 3.0 + glyph_box + SPACING * 3.0;
	let trail = if typed.text.is_empty() { inset } else { lead };
	let typed_on = on.clone();
	let field = text_input(typed, style)
		.single_line()
		.key(format!("tool-question-own-answer-{scope}"))
		.w_full()
		.padding(inset)
		.pl(lead)
		.pr(trail)
		.radius(RADIUS_CONTROL)
		.fill(t.card)
		.color(t.foreground)
		.placeholder(copy(tool_question::FREE_TEXT_PLACEHOLDER, language), t.muted_foreground)
		.caret(t.ring, t.selection)
		.label(copy(tool_question::FREE_TEXT, language))
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
		.on_edit(edit)
		.on_input_change(move |s: &mut S, _: &mut Tx| typed_on(s, QuestionEvent::Typed))
		.on_input_key(move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
			let is_return = event.key == Key::Enter && !event.mods.shift;
			if is_return {
				on(s, QuestionEvent::Submit);
			}
			is_return
		});
	let mut frame = el().w_full().child(instant(field)).child(
		el().size(glyph_box, glyph_box)
			.center()
			.absolute(SPACING * 3.0, (OWN_ANSWER_HEIGHT - glyph_box) / 2.0)
			.inert()
			.child(icon(&icons::PEN, OWN_ANSWER_GLYPH).color(t.muted_foreground)),
	);
	if !typed.text.is_empty() {
		frame = frame.child(
			el().size(glyph_box, glyph_box)
				.center()
				.pin(None, Some((OWN_ANSWER_HEIGHT - glyph_box) / 2.0), Some(inset), None)
				.inert()
				.child(check(CHECK_GLYPH).color(t.ring)),
		);
	}
	frame
}

fn field_label(t: &Tokens, label: &str) -> El {
	text(label.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground)
}

fn entry_field<S: 'static>(
	t: &Tokens,
	entry: QuestionEntry,
	is_refused: bool,
	typed: &TextEdit,
	edit: impl for<'e> Fn(&'e mut S) -> &'e mut TextEdit + 'static,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let style = tight(TEXT_COMPACT_MONO);
	let edge = if is_refused { t.destructive } else { t.input };
	let ring = if is_refused { faded(t.destructive, 0.3) } else { ring_tint(t, 0.3) };
	let typed_on = on.clone();
	let mut field = text_input(typed, style)
		.single_line()
		.key(format!("tool-question-entry-{}", entry.label))
		.w_full()
		.padding(equal_padding(ENTRY_HEIGHT, style.size))
		.radius(RADIUS_CONTROL)
		.fill(t.muted)
		.border(1.0, edge)
		.color(t.foreground)
		.placeholder(entry.placeholder, t.muted_foreground)
		.caret(t.foreground, t.selection)
		.label(entry.label)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring)
		.on_edit(edit)
		.on_input_change(move |s: &mut S, _: &mut Tx| typed_on(s, QuestionEvent::Typed))
		.on_input_key(move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
			let is_return = event.key == Key::Enter;
			if is_return {
				on(s, QuestionEvent::Submit);
			}
			is_return
		});
	if entry.is_secret {
		field = field.secure();
	}
	col().w_full().gap(SPACING * 1.5).child(field_label(t, entry.label)).child(instant(field))
}

fn link_field<S: 'static>(
	t: &Tokens,
	language: Language,
	link: QuestionLink,
	has_copied: bool,
	on: impl Fn(&mut S, QuestionEvent) + 'static,
) -> El {
	let (glyph, label) = if has_copied {
		(&icons::CHECK, copy(tool_question::COPIED, language))
	} else {
		(&icons::COPY, copy(tool_question::COPY, language))
	};
	let copy_button = Button::new(&label)
		.leading(glyph)
		.variant(ButtonVariant::Ghost)
		.size(ButtonSize::Sm)
		.view(t)
		.on_press(move |s: &mut S| on(s, QuestionEvent::CopyLink));
	col().w_full().gap(SPACING * 1.5).child(field_label(t, link.label)).child(
		row()
			.w_full()
			.padding(SPACING)
			.gap(SPACING * 2.0)
			.center_y()
			.radius(RADIUS_CONTROL)
			.fill(t.muted)
			.border(1.0, t.input)
			.child(
				text(link.url.to_owned())
					.font(TEXT_COMPACT_MONO)
					.color(t.foreground)
					.truncate()
					.pl(SPACING * 2.0)
					.grow(1.0)
					.shrink()
					.min_w(0.0)
					.label(link.label),
			)
			.child(copy_button),
	)
}

fn question_foot<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &QuestionPanel,
	shown: &Question,
	on: impl Fn(&mut S, QuestionEvent) + Clone + 'static,
) -> El {
	let mut foot = row().w_full().pl(SPACING).gap(SPACING * 3.0).flex_wrap().center_y();
	if panel.can_skip {
		let skip = copy(tool_question::SKIP, language);
		let on = on.clone();
		foot = foot.child(
			ringed(
				t,
				pill(Face {
					scope: shown.header,
					label: &skip,
					leading: None,
					trailing: None,
					paint: ghost_paint(t),
				}),
			)
			.on_press(move |s: &mut S| on(s, QuestionEvent::Skip)),
		);
	}
	if let Some(exit) = shown.exit {
		let on = on.clone();
		foot = foot.child(
			ringed(
				t,
				pill(Face {
					scope: shown.header,
					label: exit,
					leading: None,
					trailing: None,
					paint: ghost_paint(t),
				}),
			)
			.on_press(move |s: &mut S| on(s, QuestionEvent::Exit)),
		);
	}
	let end = match shown.action {
		Some(action) => ringed(
			t,
			pill(Face {
				scope: shown.header,
				label: action.label,
				leading: Some(action.glyph),
				trailing: None,
				paint: inverse_paint(t),
			}),
		)
		.on_press(move |s: &mut S| on(s, QuestionEvent::Act)),
		None => primary_pill(t, language, panel, shown, on),
	};
	foot.child(row().grow(1.0).justify_end().child(end))
}

fn primary_pill<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &QuestionPanel,
	shown: &Question,
	on: impl Fn(&mut S, QuestionEvent) + 'static,
) -> El {
	let is_waiting = panel.waiting_after_shown().is_some();
	let visible = if is_waiting {
		copy(tool_question::NEXT_LABEL, language)
	} else if shown.entry.is_some() {
		copy(tool_question::CONTINUE, language)
	} else {
		copy(tool_question::SEND, language)
	};
	let face = if is_waiting {
		Face {
			scope: shown.header,
			label: &visible,
			leading: None,
			trailing: Some(&icons::ARROW_RIGHT),
			paint: inverse_paint(t),
		}
	} else {
		Face {
			scope: shown.header,
			label: &visible,
			leading: Some(&icons::SEND),
			trailing: None,
			paint: inverse_paint(t),
		}
	};
	let named = if is_waiting {
		Some(tool_question::NEXT)
	} else if shown.entry.is_some() {
		None
	} else {
		Some(tool_question::SUBMIT)
	};
	let mut send = pill(face);
	if let Some(name) = named {
		send = send.label(copy(name, language));
	}
	if panel.is_pending {
		return send.disabled(true).opacity(DISABLED_OPACITY);
	}
	if !panel.is_answered(panel.shown) {
		send = send.opacity(WAITING_SEND);
	}
	ringed(t, send).on_press(move |s: &mut S| on(s, QuestionEvent::Submit))
}

pub fn waiting_bar<S: 'static>(
	t: &Tokens,
	language: Language,
	panel: &QuestionPanel,
	on: impl Fn(&mut S, QuestionEvent) + 'static,
) -> El {
	let Some(shown) = panel.questions.get(panel.shown) else { return el() };
	let asked = shown.question.or(shown.failure.map(|failure| failure.title)).unwrap_or_default();
	let title = match panel.companion {
		Some(name) => tool_question::waiting::TITLE.text(language).replace(NAME, name),
		None => copy(tool_question::waiting::UNNAMED_TITLE, language),
	};
	let mark_style = tight(TextStyle { weight: 700.0, ..TEXT_11 });
	let bar = question_surface(t, row())
		.key("tool-question-waiting")
		.gap(SPACING * 2.5)
		.center_y()
		.role("button")
		.label(format!("{} {title}", tool_question::waiting::ANSWER.text(language)))
		.description(asked)
		.hover(t.border)
		.press(t.border)
		.child(
			el().size(WAITING_MARK, WAITING_MARK)
				.radius(WAITING_MARK / 2.0)
				.center()
				.fill(t.warning)
				.child(
					text(copy(tool_question::waiting::MARK, language))
						.font(mark_style)
						.color(t.background),
				),
		)
		.child(text(title).font(TEXT_COMPACT_MEDIUM).color(t.foreground).truncate().min_w(0.0))
		.child(
			text(asked.to_owned())
				.font(TEXT_COMPACT)
				.color(t.muted_foreground)
				.truncate()
				.grow(1.0)
				.shrink()
				.min_w(0.0),
		);
	ringed(t, instant(bar)).on_press(move |s: &mut S| on(s, QuestionEvent::Expand))
}

pub fn answered_question_card(
	t: &Tokens,
	language: Language,
	answerer: &Answerer,
	answered_at: &str,
	questions: &[AnsweredQuestion],
) -> El {
	col()
		.key("answered-question-card")
		.w_full()
		.gap(SPACING * 2.0)
		.child(
			col()
				.w_full()
				.gap(SPACING * 2.5)
				.children(questions.iter().map(|question| answered_block(t, question))),
		)
		.child(answerer_line(t, language, answerer, answered_at))
}

fn answered_block(t: &Tokens, question: &AnsweredQuestion) -> El {
	let chosen = question
		.options
		.iter()
		.enumerate()
		.filter(|(index, _)| question.chosen.contains(index))
		.map(|(index, option)| {
			let mut content =
				row().grow(1.0).shrink().min_w(0.0).flex_wrap().gaps(0.0, SPACING * 2.5).child(
					text(option.label.to_owned())
						.font(TEXT_SM_MEDIUM)
						.color(t.user_bubble_foreground)
						.wrap()
						.shrink()
						.min_w(0.0),
				);
			if !option.description.is_empty() {
				content = content.child(
					text(option.description.to_owned())
						.font(TEXT_COMPACT)
						.color(t.user_bubble_muted_foreground)
						.wrap()
						.shrink()
						.min_w(0.0),
				);
			}
			chosen_row(t, Some(index + 1), content)
		});
	let written =
		question.free_text.map(str::trim).filter(|written| !written.is_empty()).map(|written| {
			chosen_row(
				t,
				None,
				text(written.to_owned())
					.font(TEXT_SM_MEDIUM)
					.color(t.user_bubble_foreground)
					.wrap()
					.grow(1.0)
					.shrink()
					.min_w(0.0),
			)
		});
	col()
		.w_full()
		.gap(SPACING * 1.5)
		.role("group")
		.label(question.header)
		.child(
			text(question.header.to_owned())
				.font(TEXT_XS_MEDIUM)
				.color(t.muted_foreground)
				.pl(SPACING * 0.5),
		)
		.children(chosen)
		.children(written)
}

fn chosen_row(t: &Tokens, position: Option<usize>, content: El) -> El {
	let chip_share = if t.dark { CHOSEN_CHIP_DARK } else { CHOSEN_CHIP_LIGHT };
	let mut row_ = row()
		.w_full()
		.padding(SPACING * 2.5)
		.gap(SPACING * 3.0)
		.center_y()
		.radius(RADIUS_CONTROL)
		.fill(t.user_bubble);
	if let Some(position) = position {
		row_ = row_.child(key_chip(
			position,
			faded(t.user_bubble_foreground, chip_share),
			faded(t.user_bubble_foreground, CHOSEN_DIGIT),
		));
	}
	row_.child(content).child(
		el().size(MARK_SLOT, MARK_SLOT)
			.center()
			.child(check(CHECK_GLYPH).color(t.user_bubble_foreground)),
	)
}

fn answerer_line(t: &Tokens, language: Language, answerer: &Answerer, answered_at: &str) -> El {
	let label = if answerer.is_viewer {
		copy(answered_question::BY_VIEWER, language)
	} else {
		answered_question::BY_MEMBER.text(language).replace(NAME, answerer.name)
	};
	row()
		.self_start()
		.shrink()
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(Person { name: answerer.name, image: answerer.image }.draw(AUTHOR_AVATAR, t))
		.child(
			text(label).font(TEXT_COMPACT_SEMIBOLD).color(t.soft_foreground).truncate().min_w(0.0),
		)
		.child(text(answered_at.to_owned()).font(TEXT_XS).color(t.muted_foreground))
}

#[cfg(test)]
mod tests;
