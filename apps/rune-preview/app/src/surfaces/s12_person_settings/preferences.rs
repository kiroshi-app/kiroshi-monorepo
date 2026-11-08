use std::collections::VecDeque;

use kiroshi_core::updates::contract::UpdateChannel;
use kiroshi_core::user::contract::{self, UserPreferences};

use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s12_person_settings::panes::{
	Channel, ColorScheme, Notifications, Notified,
};

use crate::host::HostError;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Change {
	ColorScheme(ColorScheme),
	Notify(Notified, bool),
	Language(Option<Language>),
	Channel(Channel),
	ShowsWhatsNew(bool),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Shown {
	pub name: String,
	pub scheme: ColorScheme,
	pub notifications: Notifications,
	pub language: Option<Language>,
	pub channel: Channel,
	pub shows_whats_new: bool,
}

impl Default for Shown {
	fn default() -> Shown {
		Shown {
			name: String::new(),
			scheme: ColorScheme::System,
			notifications: Notifications::ALL_ON,
			language: None,
			channel: Channel::Stable,
			shows_whats_new: true,
		}
	}
}

const LANGUAGE_IDS: [(Language, &str); 2] = [(Language::En, "en"), (Language::Fr, "fr")];

fn language_of(id: Option<&str>) -> Option<Language> {
	LANGUAGE_IDS.iter().find(|(_, held)| Some(*held) == id).map(|(language, _)| *language)
}

fn id_of(language: Option<Language>) -> Option<String> {
	let language = language?;
	LANGUAGE_IDS.iter().find(|(held, _)| *held == language).map(|(_, id)| (*id).to_owned())
}

fn scheme_of(scheme: contract::ColorScheme) -> ColorScheme {
	match scheme {
		contract::ColorScheme::System => ColorScheme::System,
		contract::ColorScheme::Light => ColorScheme::Light,
		contract::ColorScheme::Dark => ColorScheme::Dark,
	}
}

fn stored_scheme(scheme: ColorScheme) -> contract::ColorScheme {
	match scheme {
		ColorScheme::System => contract::ColorScheme::System,
		ColorScheme::Light => contract::ColorScheme::Light,
		ColorScheme::Dark => contract::ColorScheme::Dark,
	}
}

fn channel_of(channel: UpdateChannel) -> Channel {
	match channel {
		UpdateChannel::Stable => Channel::Stable,
		UpdateChannel::Beta => Channel::Beta,
	}
}

fn stored_channel(channel: Channel) -> UpdateChannel {
	match channel {
		Channel::Stable => UpdateChannel::Stable,
		Channel::Beta => UpdateChannel::Beta,
	}
}

pub fn shown_of(record: &UserPreferences) -> Shown {
	Shown {
		name: record.display_name.clone(),
		scheme: scheme_of(record.color_scheme),
		notifications: Notifications {
			question: record.notify_on_question,
			permission: record.notify_on_permission,
			turn: record.notify_on_finished_turn,
			sound: record.notify_with_sound,
		},
		language: language_of(record.language.as_deref()),
		channel: channel_of(record.update_channel),
		shows_whats_new: record.show_whats_new,
	}
}

impl Change {
	pub fn shown_on(self, shown: Shown) -> Shown {
		match self {
			Change::ColorScheme(scheme) => Shown { scheme, ..shown },
			Change::Notify(which, is_on) => {
				let mut notifications = shown.notifications;
				match which {
					Notified::Question => notifications.question = is_on,
					Notified::Permission => notifications.permission = is_on,
					Notified::Turn => notifications.turn = is_on,
					Notified::Sound => notifications.sound = is_on,
				}
				Shown { notifications, ..shown }
			}
			Change::Language(language) => Shown { language, ..shown },
			Change::Channel(channel) => Shown { channel, ..shown },
			Change::ShowsWhatsNew(shows_whats_new) => Shown { shows_whats_new, ..shown },
		}
	}

	pub fn written_on(&self, record: UserPreferences) -> UserPreferences {
		match *self {
			Change::ColorScheme(scheme) => {
				UserPreferences { color_scheme: stored_scheme(scheme), ..record }
			}
			Change::Notify(Notified::Question, is_on) => {
				UserPreferences { notify_on_question: is_on, ..record }
			}
			Change::Notify(Notified::Permission, is_on) => {
				UserPreferences { notify_on_permission: is_on, ..record }
			}
			Change::Notify(Notified::Turn, is_on) => {
				UserPreferences { notify_on_finished_turn: is_on, ..record }
			}
			Change::Notify(Notified::Sound, is_on) => {
				UserPreferences { notify_with_sound: is_on, ..record }
			}
			Change::Language(language) => UserPreferences { language: id_of(language), ..record },
			Change::Channel(channel) => {
				UserPreferences { update_channel: stored_channel(channel), ..record }
			}
			Change::ShowsWhatsNew(shows) => UserPreferences { show_whats_new: shows, ..record },
		}
	}
}

#[derive(Default)]
pub struct Preferences {
	answered: Option<Shown>,
	writing: Option<Change>,
	waiting: VecDeque<Change>,
}

impl Preferences {
	pub fn shown(&self) -> Shown {
		let answered = self.answered.clone().unwrap_or_default();
		self.writing
			.iter()
			.chain(&self.waiting)
			.fold(answered, |shown, change| change.shown_on(shown))
	}

	pub fn read(&mut self, record: &UserPreferences) {
		self.answered = Some(shown_of(record));
	}

	pub fn change(&mut self, change: Change) -> Option<Change> {
		if self.shown() == change.shown_on(self.shown()) {
			return None;
		}
		if self.writing.is_some() {
			self.waiting.push_back(change);
			return None;
		}
		self.writing = Some(change);
		Some(change)
	}

	pub fn written(
		&mut self,
		outcome: Result<UserPreferences, HostError>,
	) -> (Option<Change>, Option<HostError>) {
		self.writing = None;
		let failure = match outcome {
			Ok(record) => {
				self.read(&record);
				None
			}
			Err(failure) => Some(failure),
		};
		self.writing = self.waiting.pop_front();
		(self.writing, failure)
	}
}
