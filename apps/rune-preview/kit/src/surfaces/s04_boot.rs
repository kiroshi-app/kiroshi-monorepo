use rune::{Align, Color, Cursor, El, ScrollSpec, Span, TextStyle, col, el, row, text};

use crate::primitives::{FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::{Key, Language};
use crate::tokens::{RADIUS_XS, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_TITLE, Tokens};
use crate::widgets::{Pill, spinner};

pub mod account;
pub mod boot;
pub mod connect;
pub mod device_approval;
pub mod device_card;
pub mod import;
pub mod layouts;
pub mod new_device;
pub mod notice;
pub mod welcome;

pub type Emit<S, E> = fn(&mut S, E);

const DRAG_STRIP: f32 = SPACING * 12.0;
const CONTENT_HEIGHT: f32 = SPACING * 88.0;
const CONTROLS_HEIGHT: f32 = SPACING * 30.0;
const SPINNER_SIDE: f32 = SPACING * 3.5;

pub fn say(key: Key, language: Language, values: &[(&str, &str)]) -> String {
	values.iter().fold(key.text(language).to_owned(), |said, (name, value)| {
		said.replace(&format!("{{{{{name}}}}}"), value)
	})
}

pub fn counted(one: Key, other: Key, count: usize, language: Language) -> String {
	let key = if count == 1 { one } else { other };
	say(key, language, &[("count", &count.to_string())])
}

pub fn full_window(t: &Tokens, content: El) -> El {
	col()
		.key("full-window-layout")
		.w_full()
		.h_full()
		.fill(t.background)
		.scroll(ScrollSpec { stick_bottom: false })
		.child(col().w_full().grow(1.0).center().child(content))
}

pub fn drag_strip() -> El {
	el().w_full().h(DRAG_STRIP).absolute(0.0, 0.0).window_drag().a11y_hidden()
}

pub struct Frame {
	pub content_gap: f32,
	pub content_bottom: f32,
}

impl Frame {
	pub const WELCOME: Frame = Frame { content_gap: SPACING * 8.0, content_bottom: 0.0 };
}

pub fn onboarding_shell(t: &Tokens, frame: Frame, content: Vec<El>, controls: Vec<El>) -> El {
	let column = col()
		.w_full()
		.px(SPACING * 6.0)
		.items_center()
		.child(
			col()
				.w_full()
				.h(CONTENT_HEIGHT)
				.items_center()
				.justify_end()
				.gap(frame.content_gap)
				.pb(frame.content_bottom)
				.children(content),
		)
		.child(
			col()
				.w_full()
				.h(CONTROLS_HEIGHT)
				.items_center()
				.gap(SPACING * 3.0)
				.pt(SPACING * 3.0)
				.children(controls),
		);
	el().w_full().h_full().child(full_window(t, column)).child(drag_strip())
}

pub fn heading(t: &Tokens, title: &str, body: &str, width: f32) -> El {
	col()
		.w(width)
		.shrink()
		.gap(SPACING * 2.5)
		.items_center()
		.child(centred(text(title.to_owned()).font(TEXT_TITLE).color(t.foreground)).role("heading"))
		.child(centred(text(body.to_owned()).font(TEXT_SM).color(t.muted_foreground)))
}

pub fn centred(line: El) -> El {
	line.w_full().wrap().align(Align::Center)
}

pub fn ringed(t: &Tokens, control: El) -> El {
	instant(control).focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
}

pub fn primary<S: 'static, E: Copy + 'static>(
	t: &Tokens,
	label: &str,
	disabled: bool,
	emit: Emit<S, E>,
	event: E,
) -> El {
	let pill = Pill::new(label).disabled(disabled).primary(t, move |s: &mut S| emit(s, event));
	if disabled { pill } else { ringed(t, pill) }
}

pub fn secondary<S: 'static, E: Copy + 'static>(
	t: &Tokens,
	label: &str,
	emit: Emit<S, E>,
	event: E,
) -> El {
	ringed(t, Pill::new(label).secondary(t, move |s: &mut S| emit(s, event)))
}

pub fn link<S: 'static, E: Copy + 'static>(
	t: &Tokens,
	label: &str,
	style: TextStyle,
	ink: Color,
	emit: Emit<S, E>,
	event: E,
) -> El {
	let underline = Span::new(0, label.len()).underline(ink);
	ringed(
		t,
		el().radius(RADIUS_XS)
			.role("button")
			.label(label)
			.focusable(true)
			.cursor(Cursor::Pointer)
			.on_press(move |s: &mut S| emit(s, event))
			.child(text(label.to_owned()).font(style).color(ink).decorations(vec![underline])),
	)
}

pub fn waiting_mark(t: &Tokens) -> El {
	if t.reduced_motion {
		return el()
			.size(SPINNER_SIDE, SPINNER_SIDE)
			.radius(SPINNER_SIDE / 2.0)
			.border(2.0, t.input)
			.a11y_hidden();
	}
	spinner(t.input, t.muted_foreground).a11y_hidden()
}

pub fn status_line(t: &Tokens, words: &str) -> El {
	row()
		.gap(SPACING * 2.0)
		.center()
		.role("status")
		.child(waiting_mark(t))
		.child(text(words.to_owned()).font(TEXT_COMPACT).color(t.muted_foreground))
}
