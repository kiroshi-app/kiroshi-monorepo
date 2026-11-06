use rune::{Color, Cursor, El, Icon, col, el, icon, row, text};

use crate::icons;
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_LG, SPACING, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO,
	TEXT_COMPACT_MONO_MEDIUM, TEXT_SM, TEXT_SM_MEDIUM, Tokens,
};

pub fn not_drawn(t: &Tokens, what: &str, source: &str) -> El {
	let mut placeholder = col()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING)
		.radius(RADIUS_LG)
		.fill(t.muted)
		.border(1.0, t.border)
		.child(text(what.to_owned()).font(TEXT_COMPACT_MEDIUM).color(t.muted_foreground));
	if !source.is_empty() {
		placeholder = placeholder.child(
			text(source.to_owned()).font(TEXT_COMPACT_MONO).color(t.faint_foreground).wrap(),
		);
	}
	placeholder
}

pub struct Pill<'a> {
	pub label: &'a str,
	pub trailing: Option<&'static Icon>,
	pub disabled: bool,
}

impl<'a> Pill<'a> {
	pub fn new(label: &'a str) -> Pill<'a> {
		Pill { label, trailing: None, disabled: false }
	}

	pub fn trailing(self, glyph: &'static Icon) -> Pill<'a> {
		Pill { trailing: Some(glyph), ..self }
	}

	pub fn disabled(self, disabled: bool) -> Pill<'a> {
		Pill { disabled, ..self }
	}

	pub fn primary<S: 'static>(self, t: &Tokens, on_press: impl Fn(&mut S) + 'static) -> El {
		let ink = if t.dark { t.primary_foreground } else { Color::WHITE };
		self.shaped(ink, on_press).fill(t.primary).hover(t.foreground.alpha(if self.disabled {
			0.0
		} else {
			0.2
		}))
	}

	pub fn secondary<S: 'static>(self, t: &Tokens, on_press: impl Fn(&mut S) + 'static) -> El {
		self.shaped(t.muted_foreground, on_press).hover(t.muted)
	}

	pub fn outline<S: 'static>(self, t: &Tokens, on_press: impl Fn(&mut S) + 'static) -> El {
		self.shaped(t.foreground, on_press).fill(t.background).border(1.0, t.border).hover(t.muted)
	}

	fn shaped<S: 'static>(&self, ink: Color, on_press: impl Fn(&mut S) + 'static) -> El {
		let mut pill = row()
			.key(format!("pill-{}", self.label))
			.h(SPACING * 10.0)
			.px(SPACING * 6.0)
			.gap(SPACING * 1.5)
			.radius(SPACING * 5.0)
			.center()
			.role("button")
			.label(self.label)
			.child(text(self.label.to_owned()).font(TEXT_SM_MEDIUM).color(ink));
		if let Some(glyph) = self.trailing {
			pill = pill.child(icon(glyph, 16.0).color(ink));
		}
		if self.disabled {
			return pill.opacity(0.45);
		}
		pill.focusable(true).cursor(Cursor::Pointer).on_press(on_press)
	}
}

static SPINNER_ARC: Icon = Icon {
	name: "spinner-arc",
	view: 14.0,
	body: r#"<path d="M7 1A6 6 0 0 1 13 7" fill="none" stroke="currentColor" stroke-width="2"/>"#,
};

pub fn spinner(track: Color, arc: Color) -> El {
	el().size(14.0, 14.0)
		.radius(7.0)
		.border(2.0, track)
		.child(icon(&SPINNER_ARC, 14.0).color(arc).absolute(-2.0, -2.0))
		.looping(rune_motion::LoopSpec::rotation(0.8))
}

pub fn field<S: 'static>(
	t: &Tokens,
	k: &rune_kit::Kit,
	edit: &rune::TextEdit,
	placeholder: &str,
	secure: bool,
	access: impl for<'a> Fn(&'a mut S) -> &'a mut rune::TextEdit + 'static,
) -> El {
	let style = if edit.text.is_empty() { TEXT_SM } else { TEXT_COMPACT_MONO_MEDIUM };
	let mut input = rune_kit::TextInput::new(edit)
		.plain()
		.width(None)
		.placeholder(placeholder)
		.text_style(style)
		.on_edit(access);
	if secure {
		input = input.secure();
	}
	row()
		.w_full()
		.h(44.0)
		.px(14.0)
		.center_y()
		.radius(RADIUS_CONTROL)
		.fill(t.muted)
		.border(1.0, t.input)
		.child(col().grow(1.0).child(input.build(k)))
}

pub fn checkbox(t: &Tokens, checked: bool) -> El {
	let ink = if t.dark { t.primary_foreground } else { Color::WHITE };
	let mut box_ = el().size(18.0, 18.0).radius(5.0).center();
	box_ = if checked {
		box_.fill(t.primary).child(icon(&icons::CHECK, 12.0).color(ink))
	} else {
		box_.fill(t.card).border(1.0, t.input)
	};
	box_
}

pub fn radio(t: &Tokens, checked: bool) -> El {
	let ring = el().size(18.0, 18.0).radius(9.0).center();
	if checked {
		return ring.border(1.5, t.primary).child(el().size(8.0, 8.0).radius(4.0).fill(t.primary));
	}
	ring.border(1.5, t.input)
}
