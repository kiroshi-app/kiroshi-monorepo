use rune::{Align, Cursor, El, Icon, TextStyle, col, icon, row, text};

use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::skeleton::skeleton;
use crate::primitives::{DISABLED_OPACITY, FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::{Key, Language, chat};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens, faded};

pub mod detail;
pub mod form;
pub mod panel;
pub mod reported_run;
pub mod row;

pub const PANEL_WIDTH: f32 = 320.0;

pub type Emit<S> = fn(&mut S, RoutinesEvent);

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RoutinesEvent {
	ClosePanel,
	Back,
	OpenRoutines,
	NewRoutine,
	Retry,
	ToggleEarlierToday,
	Open(String),
	SetEnabled(String, bool),
	AskDelete(String),
	Edit,
	RunNow,
	RetryRuns,
	Pick(form::Picker),
	AddFilterRow,
	RemoveFilterRow(usize),
	Copy(form::WebhookPart),
	Save,
	Confirm,
	Cancel,
}

pub const BORDER: f32 = 1.0;

const EMPTY_MARK: f32 = SPACING * 8.0;
const EMPTY_MEASURE: f32 = 448.0;
const EMPTY_TITLE: TextStyle = TextStyle::new(18.0, 600.0).lh(28.0);
const NOTICE_GLYPH: f32 = SPACING * 4.0;
const TABULAR: &str = "'tnum' 1";
const BAR: f32 = SPACING * 3.0;
const FAINT_BAR: f32 = SPACING * 2.25;

fn say(key: Key, lang: Language) -> &'static str {
	key.text(lang)
}

fn fill(template: &str, name: &str, value: &str) -> String {
	template.replace(&format!("{{{{{name}}}}}"), value)
}

fn plural(lang: Language, count: usize, one: Key, other: Key, many: Key) -> String {
	let key = match lang {
		Language::En if count == 1 => one,
		Language::En => other,
		Language::Fr if count <= 1 => one,
		Language::Fr if count.is_multiple_of(1_000_000) => many,
		Language::Fr => other,
	};
	fill(say(key, lang), "count", &count.to_string())
}

fn tabular(style: TextStyle) -> TextStyle {
	TextStyle { features: TABULAR, ..style }
}

fn emits<S: 'static>(control: El, emit: Emit<S>, event: RoutinesEvent) -> El {
	control.on_press(move |s: &mut S| emit(s, event.clone()))
}

fn ringed(t: &Tokens, control: El) -> El {
	instant(control).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}

fn glyph(t: &Tokens, shape: &'static Icon, size: f32) -> El {
	icon(shape, size).color(t.muted_foreground).a11y_hidden()
}

fn icon_button<S: 'static>(
	t: &Tokens,
	shape: &'static Icon,
	label: &str,
	size: ButtonSize,
	emit: Emit<S>,
	event: RoutinesEvent,
) -> El {
	let button = Button::icon(shape, label).variant(ButtonVariant::Ghost).size(size).view(t);
	emits(button, emit, event)
}

struct Retry<S> {
	busy: bool,
	emit: Emit<S>,
	event: RoutinesEvent,
}

fn notice<S: 'static>(
	t: &Tokens,
	lang: Language,
	title: &str,
	description: &str,
	retry: Retry<S>,
) -> El {
	let label = say(chat::notice::RETRY, lang);
	let control = Button::new(label).variant(ButtonVariant::Outline).size(ButtonSize::Sm).view(t);
	let control = if retry.busy {
		control.opacity(DISABLED_OPACITY)
	} else {
		emits(control, retry.emit, retry.event)
	};
	row()
		.w_full()
		.gap(SPACING * 3.0)
		.items_start()
		.padding(SPACING * 3.0 + BORDER)
		.radius(RADIUS_2XL)
		.border(BORDER, faded(t.destructive, 0.3))
		.fill(faded(t.destructive, 0.1))
		.role("alert")
		.label(title)
		.child(
			icon(&icons::TRIANGLE_ALERT, NOTICE_GLYPH)
				.color(t.destructive)
				.mt(SPACING * 0.5)
				.a11y_hidden(),
		)
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(SPACING * 2.0)
				.child(
					col()
						.gap(SPACING)
						.child(
							text(title.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).wrap(),
						)
						.child(
							text(description.to_owned())
								.font(TEXT_SM)
								.color(faded(t.foreground, 0.8))
								.wrap(),
						),
				)
				.child(control.self_start()),
		)
}

fn empty_state(t: &Tokens, mark: &'static Icon, title: &str, description: &str) -> El {
	col()
		.w_full()
		.items_center()
		.gap(SPACING * 5.0)
		.px(SPACING * 6.0)
		.py(SPACING * 12.0)
		.child(glyph(t, mark, EMPTY_MARK))
		.child(
			col()
				.max_w(EMPTY_MEASURE)
				.items_center()
				.gap(SPACING * 2.0)
				.child(
					text(title.to_owned())
						.font(EMPTY_TITLE)
						.color(t.foreground)
						.align(Align::Center)
						.wrap()
						.role("heading")
						.level(2),
				)
				.child(
					text(description.to_owned())
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.align(Align::Center)
						.wrap(),
				),
		)
}

fn bar(t: &Tokens, width: f32) -> El {
	skeleton(t).size(width, BAR).radius(BAR).fill(t.border)
}

fn faint_bar(t: &Tokens, width: f32) -> El {
	skeleton(t).size(width, FAINT_BAR).radius(FAINT_BAR).fill(faded(t.border, 0.6))
}

fn bar_line(height: f32, bar: El) -> El {
	row().h(height).center_y().child(bar)
}

fn filling_skeleton(rows: impl IntoIterator<Item = El>, gap: f32) -> El {
	col().w_full().grow(1.0).gap(gap).clip_rounded(0.0).a11y_hidden().children(rows)
}

#[cfg(test)]
mod tests {
	use super::{fill, plural};
	use crate::strings::Language;
	use crate::strings::chat::routines::detail::history;

	fn runs(lang: Language, count: usize) -> String {
		plural(lang, count, history::COUNTED_ONE, history::COUNTED_OTHER, history::COUNTED_MANY)
	}

	#[test]
	fn a_count_picks_the_plural_form_of_its_language() {
		assert_eq!(runs(Language::En, 1), "1 run");
		assert_eq!(runs(Language::En, 0), "0 runs");
		assert_eq!(runs(Language::En, 6), "6 runs");
		assert_eq!(runs(Language::Fr, 0), "0 exécution");
		assert_eq!(runs(Language::Fr, 1), "1 exécution");
		assert_eq!(runs(Language::Fr, 6), "6 exécutions");
		assert_eq!(runs(Language::Fr, 2_000_000), "2000000 exécutions");
	}

	#[test]
	fn a_placeholder_is_filled_wherever_it_appears() {
		assert_eq!(fill("Delete {{title}}?", "title", "Morning digest"), "Delete Morning digest?");
		assert_eq!(fill("{{field}} copied", "other", "Key"), "{{field}} copied");
	}
}
