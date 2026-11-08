use rune::{Color, Cursor, El, Icon, icon, row};

use crate::primitives::{DISABLED_OPACITY, FOCUS_RING_WIDTH, Paint, ring_tint};
use crate::strings::{Key, Language};
use crate::tokens::{SPACING, Tokens, faded};

pub mod chips;
pub mod menus;
pub mod picker;
pub mod prompt;
pub mod queue;
pub mod quote;
pub mod scenes;

#[cfg(test)]
mod tests;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ComposerIntent {
	Send,
	Attach,
	PickMention { id: String, is_outside: bool },
	PickCommand(String),
	PickDocument(String),
	MenuTravel(i32),
	MenuChoose,
	MenuDismiss,
	OpenLibrary,
	BrowseFiles,
	RemoveAttachment(String),
	RemoveReply(String),
	RemoveQuote,
	DismissReply,
	JumpToReply,
	SendQueuedNow(String),
	RemoveQueued(String),
}

pub type Emit<S> = fn(&mut S, ComposerIntent);

pub struct Scope<'a, S> {
	pub t: &'a Tokens,
	pub language: Language,
	pub emit: Emit<S>,
}

impl<S> Clone for Scope<'_, S> {
	fn clone(&self) -> Self {
		*self
	}
}

impl<S> Copy for Scope<'_, S> {}

impl<S: 'static> Scope<'_, S> {
	pub fn say(&self, key: Key) -> &'static str {
		key.text(self.language)
	}

	pub fn plural(&self, one: Key, other: Key, count: usize) -> &'static str {
		let is_one = match self.language {
			Language::En => count == 1,
			Language::Fr => count <= 1,
		};
		self.say(if is_one { one } else { other })
	}

	pub fn on_press(&self, control: El, intent: ComposerIntent) -> El {
		let emit = self.emit;
		control.on_press(move |s: &mut S| emit(s, intent.clone()))
	}
}

pub fn filled(template: &str, values: &[(&str, &str)]) -> String {
	values.iter().fold(template.to_owned(), |text, (name, value)| {
		text.replace(&format!("{{{{{name}}}}}"), value)
	})
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Reach {
	#[default]
	Live,
	Disabled,
	Inert,
	Blank,
}

pub const CONTROL: f32 = SPACING * 8.0;
pub const SMALL_CONTROL: f32 = SPACING * 6.0;
pub const GLYPH: f32 = SPACING * 4.0;
pub const SMALL_GLYPH: f32 = SPACING * 3.0;
pub const ROW_RING: f32 = 2.0;

pub struct RoundControl<'a> {
	pub key: &'a str,
	pub label: &'a str,
	pub glyph: &'static Icon,
	pub side: f32,
	pub glyph_side: f32,
	pub paint: Paint,
	pub border: Option<Color>,
	pub reach: Reach,
}

impl RoundControl<'_> {
	pub fn view<S: 'static>(self, scope: Scope<S>, intent: Option<ComposerIntent>) -> El {
		let t = scope.t;
		let mut control = row()
			.key(self.key.to_owned())
			.size(self.side, self.side)
			.radius(self.side / 2.0)
			.center()
			.role("button")
			.label(self.label);
		if let Some(border) = self.border {
			control = control.border(1.0, border);
		}
		if self.reach != Reach::Blank {
			control = control.child(self.paint.ink(icon(self.glyph, self.glyph_side)));
		}
		let control = self.paint.apply(control);
		match self.reach {
			Reach::Live => {
				let control = match intent {
					Some(intent) => scope.on_press(control, intent),
					None => control,
				};
				control.focusable(true).cursor(Cursor::Pointer).focus_ring(
					FOCUS_RING_WIDTH,
					0.0,
					ring_tint(t, 0.3),
				)
			}
			Reach::Disabled => control.disabled(true).opacity(DISABLED_OPACITY),
			Reach::Inert | Reach::Blank => control,
		}
	}
}

pub fn ghost_paint(t: &Tokens, ink: Color) -> Paint {
	Paint {
		fill: t.background.alpha(0.0),
		ink,
		hover_fill: if t.dark { faded(t.muted, 0.5) } else { t.muted },
		hover_ink: t.foreground,
	}
}

pub fn remove_control<S: 'static>(
	scope: Scope<S>,
	key: &str,
	label: &str,
	reach: Reach,
	intent: ComposerIntent,
) -> El {
	RoundControl {
		key,
		label,
		glyph: &crate::icons::CLOSE,
		side: SMALL_CONTROL,
		glyph_side: SMALL_GLYPH,
		paint: ghost_paint(scope.t, scope.t.muted_foreground),
		border: None,
		reach,
	}
	.view(scope, Some(intent))
}

pub fn row_highlight(t: &Tokens) -> Color {
	if t.dark { faded(t.foreground, 0.08) } else { t.muted }
}
