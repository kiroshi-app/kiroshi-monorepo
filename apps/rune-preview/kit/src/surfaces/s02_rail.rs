use crate::strings::{Key, Language};

mod carousel;
mod invitations;
mod picker;
mod rail;
mod space_avatar;

pub use carousel::SpaceCarousel;
pub use invitations::{InvitationFailure, InvitationState, SpaceInvitation};
pub use picker::PICKER_KEY;
pub use picker::{PickerMessage, SpaceDots, SpacePicker, SpacesMenu};
pub use rail::{
	READER_KEY, Rail, RailDots, RailMessage, RailPanel, RailSettings, RailUser, SEARCH_KEY,
	SPACE_LOGO_KEY, rail_hint,
};
pub use space_avatar::{SpaceAvatar, SpaceAvatarSize, SpaceAvatarState};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Space<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub colour: Option<f32>,
	pub avatar_seed: &'a str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpaceHost {
	Shared,
	Up,
	Connecting,
	Down,
}

impl SpaceHost {
	fn spoken(self) -> Key {
		use crate::strings::bots::spaces::host;
		match self {
			SpaceHost::Shared => host::SHARED,
			SpaceHost::Up => host::UP,
			SpaceHost::Connecting => host::CONNECTING,
			SpaceHost::Down => host::DOWN,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BotBadge {
	Attention,
	Done,
	Failed,
}

pub type Emit<S, M> = fn(&mut S, M);

fn said(language: Language, key: Key, values: &[(&str, &str)]) -> String {
	values.iter().fold(key.text(language).to_owned(), |line, (name, value)| {
		line.replace(&format!("{{{{{name}}}}}"), value)
	})
}

#[cfg(test)]
mod tests;
