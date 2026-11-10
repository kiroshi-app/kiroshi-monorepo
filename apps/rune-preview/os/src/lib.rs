#[cfg(any(windows, test))]
mod badge_icon;
pub mod instance;
pub mod launch;
pub mod link;
pub mod policy;
pub mod scheme;

#[cfg_attr(target_os = "macos", path = "macos.rs")]
#[cfg_attr(windows, path = "windows.rs")]
#[cfg_attr(target_os = "linux", path = "linux.rs")]
mod platform;

use std::fmt;
use std::sync::{Arc, Once};

use policy::{Notice, NoticeTarget};

pub const CHIME: &[u8] = include_bytes!("../../assets/notification-chime.wav");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Gesture {
	Banner,
	Chime,
	Badge,
	Raise,
}

impl fmt::Display for Gesture {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.write_str(match self {
			Gesture::Banner => "banner",
			Gesture::Chime => "chime",
			Gesture::Badge => "badge",
			Gesture::Raise => "raise to the front",
		})
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GestureFailure {
	pub gesture: Gesture,
	pub answer: String,
}

impl GestureFailure {
	fn of(gesture: Gesture) -> impl FnOnce(String) -> GestureFailure {
		move |answer| GestureFailure { gesture, answer }
	}
}

impl fmt::Display for GestureFailure {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(formatter, "the OS refused the {}: {}", self.gesture, self.answer)
	}
}

impl std::error::Error for GestureFailure {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BannerOutcome {
	Clicked(NoticeTarget),
	Refused { target: NoticeTarget, failure: GestureFailure },
}

type Heard = Arc<dyn Fn(BannerOutcome) + Send + Sync>;

pub struct Notifier {
	app_id: String,
	heard: Heard,
}

impl Notifier {
	pub fn new(app_id: &str, heard: impl Fn(BannerOutcome) + Send + Sync + 'static) -> Notifier {
		Notifier { app_id: app_id.to_owned(), heard: Arc::new(heard) }
	}

	pub fn show(&self, notice: Notice) -> Result<(), GestureFailure> {
		if holds_focus() {
			return Ok(());
		}
		platform::post_banner(&self.app_id, notice, Arc::clone(&self.heard));
		platform::play_chime().map_err(GestureFailure::of(Gesture::Chime))
	}

	pub fn set_badge(&self, count: u32) -> Result<(), GestureFailure> {
		platform::wear_badge(&self.app_id, count).map_err(GestureFailure::of(Gesture::Badge))
	}
}

pub fn holds_focus() -> bool {
	platform::holds_focus().unwrap_or_else(|unread_on| {
		static UNREAD: Once = Once::new();
		UNREAD.call_once(|| {
			eprintln!("{unread_on} gives no window focus reading: notices show whatever the focus")
		});
		false
	})
}

pub fn bring_to_front() -> Result<(), GestureFailure> {
	platform::bring_to_front().map_err(GestureFailure::of(Gesture::Raise))
}

fn report(heard: &Heard, target: NoticeTarget, answer: String) {
	heard(BannerOutcome::Refused { target, failure: GestureFailure::of(Gesture::Banner)(answer) });
}

fn post_waiting(
	heard: Heard,
	target: NoticeTarget,
	wait: impl FnOnce(&Heard, NoticeTarget) + Send + 'static,
) {
	let waiting = Arc::clone(&heard);
	let held = target.clone();
	let spawned = std::thread::Builder::new()
		.name("notice-banner".into())
		.spawn(move || wait(&waiting, held));
	if let Err(failure) = spawned {
		report(&heard, target, format!("the banner thread did not start: {failure}"));
	}
}

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
	text.encode_utf16().chain(std::iter::once(0)).collect()
}
