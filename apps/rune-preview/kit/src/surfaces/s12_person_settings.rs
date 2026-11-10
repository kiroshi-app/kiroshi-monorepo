use rune::{Cursor, El, Icon, el, icon};

use crate::primitives::{FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::{Key, Language};
use crate::tokens::Tokens;

pub mod blocks;
pub mod panes;
pub mod search;
pub mod shell;

pub type Emit<S, E> = fn(&mut S, E);

#[derive(Clone, Debug, PartialEq)]
pub enum SettingsEvent {
	Close,
	Back,
	Select(shell::Entry),
	OpenSpace(String),
	CreateSpace,
	ColorScheme(panes::ColorScheme),
	Notify(panes::Notified, bool),
	Language(Option<Language>),
	CopyDiagnostics,
	RevealLog,
	AskClearLog,
	ClearLog,
	CancelClearLog,
	Check,
	Download,
	Restart,
	Channel(panes::Channel),
	ShowsWhatsNew(bool),
	WhatsNew,
	ReleaseNotes,
	ImportFromClaudeCode,
	ReplayOnboarding,
	SignIn,
	CancelSignIn,
	CopySignInLink,
	ManageAccount,
	SignOut,
	AskRemoval(String),
	Remove(String),
	CancelRemoval,
	PickPicture,
	RemovePicture,
}

#[derive(Clone, Copy)]
pub struct Look<'a> {
	pub t: &'a Tokens,
	pub lang: Language,
}

impl Look<'_> {
	pub fn say(&self, key: Key) -> &'static str {
		key.text(self.lang)
	}

	pub fn fill(&self, key: Key, values: &[(&str, &str)]) -> String {
		values.iter().fold(self.say(key).to_owned(), |filled, (name, value)| {
			filled.replace(&format!("{{{{{name}}}}}"), value)
		})
	}
}

pub fn pressed<S: 'static, E: Clone + 'static>(control: El, emit: Emit<S, E>, event: E) -> El {
	control.on_press(move |s: &mut S| emit(s, event.clone()))
}

pub fn control(t: &Tokens, element: El) -> El {
	instant(element.hover_group()).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}

pub static HEXAGON: Icon = Icon {
	name: "kiroshi-hexagon",
	view: 401.0,
	body: r#"<path fill="currentColor" d="M 393.14 171.16 A 58.68 58.68 0 0 1 393.14 229.84 L 322.23 352.66 A 58.68 58.68 0 0 1 271.41 382.00 L 129.59 382.00 A 58.68 58.68 0 0 1 78.77 352.66 L 7.86 229.84 A 58.68 58.68 0 0 1 7.86 171.16 L 78.77 48.34 A 58.68 58.68 0 0 1 129.59 19.00 L 271.41 19.00 A 58.68 58.68 0 0 1 322.23 48.34 Z"/>"#,
};

pub fn hexagon(side: f32, fill: rune::Color) -> El {
	icon(&HEXAGON, side).color(fill)
}

pub fn dot(side: f32, fill: rune::Color) -> El {
	el().size(side, side).radius(side / 2.0).fill(fill).a11y_hidden()
}
