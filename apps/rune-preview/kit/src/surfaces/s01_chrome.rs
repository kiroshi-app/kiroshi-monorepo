use rune::{Color, Icon, Shadow};

use crate::strings::{Key, Language};
use crate::tokens::Tokens;

mod connection_status;
mod drag_thumbnail;
mod scenes;
mod tab_chip;
mod tab_menu;
#[cfg(test)]
mod tests;
mod title_bar;
mod window_controls;

pub use connection_status::{ConnectionState, ConnectionStatus, connection_status};
pub use drag_thumbnail::{TabDragThumbnail, ThumbnailAuthor, ThumbnailMessage, drag_thumbnail};
pub use scenes::SCENES;
pub use tab_chip::{ChipPlacement, DockTarget, drag_ghost, tab_chip};
pub use tab_menu::{TabMenu, tab_menu};
pub use title_bar::{
	ChromeTab, Incoming, Landing, Lift, TabIcon, TabTitle, TitleBar, incoming_index, title_bar,
};
pub use window_controls::{CaptionState, WindowControls, window_controls};

pub type Emit<S> = fn(&mut S, ChromeEvent);

const NOT_ALLOWED_OPACITY: f32 = 0.75;

static CONVERSATION: Icon = Icon {
	name: "s01-conversation",
	view: 24.0,
	body: r#"<path d="M4.5686 16.353 C2.915 14.8839 2 12.9769 2 11 C2 6.5817 6.4772 3 12 3 C17.5228 3 22 6.5817 22 11 C22 15.4183 17.5228 19 12 19 C11.1845 19 10.3721 18.9202 9.5808 18.7624 L5 21 L4.5686 16.353 Z" fill="none" stroke="currentColor" stroke-width="2.16" stroke-linecap="round" stroke-linejoin="round"></path>"#,
};

#[derive(Clone, Debug, PartialEq)]
pub enum ChromeEvent {
	SelectTab(String),
	CloseTab(String),
	RevealClose(Option<String>),
	OpenTabMenu { id: String, at: (f32, f32) },
	OpenOverflow,
	NewTab,
	GoBack,
	GoForward,
	PinTab(String),
	UnpinTab(String),
	DuplicateTab(String),
	ReopenClosedTab,
	CloseOtherTabs(String),
	MoveTabToNewWindow(String),
	LiftMoved(Lift),
	LiftEnded(String),
	ReorderTabs(Vec<String>),
	AnnounceMove { title: String, position: usize, count: usize },
	TearOffTab { id: String, travel: (f32, f32) },
	Minimize,
	ToggleMaximize,
	CloseWindow,
}

fn copy(key: Key, language: Language, values: &[(&str, &str)]) -> String {
	values.iter().fold(key.text(language).to_owned(), |text, (name, value)| {
		text.replace(&format!("{{{{{name}}}}}"), value)
	})
}

fn reaching(rest: Color, target: Color) -> Color {
	target.alpha(((target.a - rest.a) / (1.0 - rest.a)).max(0.0))
}

fn black(alpha: f32) -> Color {
	Color::BLACK.alpha(alpha)
}

fn drop(y: f32, blur: f32, color: Color) -> Shadow {
	Shadow { x: 0.0, y, blur, spread: 0.0, color, inset: false }
}

fn ring(color: Color) -> Shadow {
	Shadow { x: 0.0, y: 0.0, blur: 0.0, spread: 1.0, color, inset: false }
}

fn lifted_shadow() -> Shadow {
	drop(3.0, 3.0, black(0.12))
}

fn chip_shadows(t: &Tokens) -> [Shadow; 2] {
	if t.dark {
		[drop(8.0, 24.0, black(0.4)), drop(2.0, 6.0, black(0.25))]
	} else {
		[drop(8.0, 24.0, black(0.2)), drop(2.0, 6.0, black(0.08))]
	}
}

fn thumbnail_shadows(t: &Tokens) -> Vec<Shadow> {
	if t.dark {
		vec![ring(Color::WHITE.alpha(0.1)), drop(16.0, 40.0, black(0.7))]
	} else {
		vec![ring(black(0.07)), drop(2.0, 4.0, black(0.08)), drop(16.0, 40.0, black(0.2))]
	}
}
