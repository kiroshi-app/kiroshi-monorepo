use std::fmt;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, PhysicalPosition, Position, Runtime, WebviewWindow};

use super::secondary::ScreenPosition;

const FRAME: Duration = Duration::from_millis(16);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GrabOffset {
	pub x: i32,
	pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct Cursor {
	pub(super) physical: PhysicalPosition<f64>,
	pub(super) scale: f64,
	pub(super) is_primary_pressed: bool,
}

#[derive(Debug)]
pub(super) struct Unobservable {
	pub(super) platform: &'static str,
	pub(super) reason: String,
}

#[derive(Debug)]
pub(super) enum FollowFailure {
	Unobservable(Unobservable),
	Unplaced(tauri::Error),
}

#[derive(Debug)]
pub(super) enum Followed {
	Released(Cursor),
	Stopped,
	Lost(FollowFailure),
}

impl GrabOffset {
	pub(super) fn logical(self) -> LogicalPosition<f64> {
		LogicalPosition::new(f64::from(self.x), f64::from(self.y))
	}
}

impl Cursor {
	pub(super) fn logical(&self) -> LogicalPosition<f64> {
		self.physical.to_logical(self.scale)
	}

	pub(super) fn point(&self) -> ScreenPosition {
		rounded(self.logical())
	}

	pub(super) fn grab_from(&self, origin: LogicalPosition<f64>) -> LogicalPosition<f64> {
		let at = self.logical();
		LogicalPosition::new(at.x - origin.x, at.y - origin.y)
	}

	pub(super) fn origin_at(&self, grab: LogicalPosition<f64>) -> LogicalPosition<f64> {
		let at = self.logical();
		LogicalPosition::new(at.x - grab.x, at.y - grab.y)
	}

	#[cfg(windows)]
	pub(super) fn placement(&self, grab: LogicalPosition<f64>) -> Position {
		Position::Physical(self.origin_at(grab).to_physical(self.scale))
	}

	#[cfg(not(windows))]
	pub(super) fn placement(&self, grab: LogicalPosition<f64>) -> Position {
		Position::Logical(self.origin_at(grab))
	}
}

impl fmt::Display for Unobservable {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(formatter, "the cursor is not observable on {}: {}", self.platform, self.reason)
	}
}

impl fmt::Display for FollowFailure {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::Unobservable(unobservable) => unobservable.fmt(formatter),
			Self::Unplaced(failure) => {
				write!(formatter, "the window was not placed or located: {failure}")
			}
		}
	}
}

pub(super) fn rounded(at: LogicalPosition<f64>) -> ScreenPosition {
	ScreenPosition { x: at.x.round() as i32, y: at.y.round() as i32 }
}

pub(super) fn follow(
	is_live: impl Fn() -> bool,
	mut probe: impl FnMut() -> Result<Cursor, Unobservable>,
	mut place: impl FnMut(&Cursor) -> tauri::Result<()>,
) -> Followed {
	while is_live() {
		let started = Instant::now();
		let cursor = match probe() {
			Ok(cursor) => cursor,
			Err(unobservable) => return Followed::Lost(FollowFailure::Unobservable(unobservable)),
		};
		if let Err(failure) = place(&cursor) {
			return Followed::Lost(FollowFailure::Unplaced(failure));
		}
		if !cursor.is_primary_pressed {
			return Followed::Released(cursor);
		}
		thread::sleep(FRAME.saturating_sub(started.elapsed()));
	}
	Followed::Stopped
}

#[cfg(target_os = "macos")]
pub(super) fn read<R: Runtime>(window: &WebviewWindow<R>) -> Result<Cursor, Unobservable> {
	use objc2_app_kit::NSEvent;

	const PRIMARY: usize = 1;

	let physical = window.cursor_position().map_err(|failure| {
		unobservable("macos", format!("the cursor position could not be read: {failure}"))
	})?;
	let primary = window
		.primary_monitor()
		.map_err(|failure| {
			unobservable("macos", format!("the primary monitor could not be read: {failure}"))
		})?
		.ok_or_else(|| unobservable("macos", "no primary monitor is attached".to_owned()))?;
	Ok(Cursor {
		physical,
		scale: primary.scale_factor(),
		is_primary_pressed: NSEvent::pressedMouseButtons() & PRIMARY != 0,
	})
}

#[cfg(windows)]
pub(super) fn read<R: Runtime>(window: &WebviewWindow<R>) -> Result<Cursor, Unobservable> {
	let (physical, is_primary_pressed) = win32::pointer()?;
	let monitor = window
		.monitor_from_point(physical.x, physical.y)
		.map_err(|failure| {
			unobservable("windows", format!("the monitor under the cursor was not read: {failure}"))
		})?
		.ok_or_else(|| unobservable("windows", "no monitor is under the cursor".to_owned()))?;
	Ok(Cursor { physical, scale: monitor.scale_factor(), is_primary_pressed })
}

#[cfg(target_os = "linux")]
pub(super) fn read<R: Runtime>(window: &WebviewWindow<R>) -> Result<Cursor, Unobservable> {
	x11::pointer(window)
}

fn unobservable(platform: &'static str, reason: String) -> Unobservable {
	Unobservable { platform, reason }
}

#[cfg(windows)]
mod win32 {
	use tauri::PhysicalPosition;
	use windows::Win32::Foundation::POINT;
	use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
	use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, SM_SWAPBUTTON};

	use super::{unobservable, Unobservable};

	const IS_DOWN: i16 = i16::MIN;

	pub(super) fn pointer() -> Result<(PhysicalPosition<f64>, bool), Unobservable> {
		let primary =
			if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } == 0 { VK_LBUTTON } else { VK_RBUTTON };
		let is_pressed = unsafe { GetAsyncKeyState(i32::from(primary.0)) } & IS_DOWN != 0;
		let mut at = POINT::default();
		unsafe { GetCursorPos(&mut at) }.map_err(|failure| {
			unobservable("windows", format!("the cursor position could not be read: {failure}"))
		})?;
		Ok((PhysicalPosition::new(f64::from(at.x), f64::from(at.y)), is_pressed))
	}
}

#[cfg(target_os = "linux")]
mod x11 {
	use std::sync::mpsc;
	use std::time::Duration;

	use gtk::gdk::prelude::*;
	use gtk::gdk::{Display, ModifierType};
	use tauri::{LogicalPosition, Runtime, WebviewWindow};

	use super::{unobservable, Cursor, Unobservable};

	const MAIN_THREAD_ANSWER: Duration = Duration::from_secs(1);

	pub(super) fn pointer<R: Runtime>(window: &WebviewWindow<R>) -> Result<Cursor, Unobservable> {
		let (told, heard) = mpsc::channel();
		window
			.run_on_main_thread(move || {
				if told.send(probed()).is_err() {
					log::warn!("the cursor reader stopped before the pointer was probed");
				}
			})
			.map_err(|failure| {
				unobservable("linux", format!("the pointer was not probed: {failure}"))
			})?;
		heard.recv_timeout(MAIN_THREAD_ANSWER).map_err(|failure| {
			unobservable("linux", format!("the pointer probe did not answer: {failure}"))
		})?
	}

	fn probed() -> Result<Cursor, Unobservable> {
		let display = Display::default()
			.ok_or_else(|| unobservable("linux", "no display is open".to_owned()))?;
		if !display.backend().is_x11() {
			return Err(unobservable(
				"linux wayland",
				"the compositor exposes no global cursor position".to_owned(),
			));
		}
		let pointer = display
			.default_seat()
			.and_then(|seat| seat.pointer())
			.ok_or_else(|| unobservable("linux x11", "no pointer is attached".to_owned()))?;
		let root = display
			.default_screen()
			.root_window()
			.ok_or_else(|| unobservable("linux x11", "the screen has no root window".to_owned()))?;
		let (_, x, y, held) = root.device_position_double(&pointer);
		let monitor =
			display.monitor_at_point(x.round() as i32, y.round() as i32).ok_or_else(|| {
				unobservable("linux x11", "no monitor is under the cursor".to_owned())
			})?;
		let scale = f64::from(monitor.scale_factor());
		Ok(Cursor {
			physical: LogicalPosition::new(x, y).to_physical(scale),
			scale,
			is_primary_pressed: held.contains(ModifierType::BUTTON1_MASK),
		})
	}
}

#[cfg(test)]
mod tests {
	use std::cell::{Cell, RefCell};
	use std::time::Instant;

	use tauri::{LogicalPosition, PhysicalPosition};

	use super::{follow, Cursor, FollowFailure, Followed, Unobservable, FRAME};
	use crate::window_controls::secondary::ScreenPosition;

	const GRAB: LogicalPosition<f64> = LogicalPosition { x: 40.0, y: 12.0 };

	fn held_at(x: f64, y: f64) -> Cursor {
		Cursor { physical: PhysicalPosition::new(x, y), scale: 2.0, is_primary_pressed: true }
	}

	fn released_at(x: f64, y: f64) -> Cursor {
		Cursor { is_primary_pressed: false, ..held_at(x, y) }
	}

	fn probed(mut readings: Vec<Cursor>) -> impl FnMut() -> Result<Cursor, Unobservable> {
		readings.reverse();
		move || Ok(readings.pop().expect("the cursor is read until the release"))
	}

	#[test]
	fn a_cursor_reads_in_logical_screen_coordinates_with_the_scale_it_was_read_under() {
		let cursor = held_at(3001.0, 1200.0);

		assert_eq!(cursor.point(), ScreenPosition { x: 1501, y: 600 });
		assert_eq!(cursor.origin_at(GRAB), LogicalPosition::new(1460.5, 588.0));
		assert_eq!(cursor.grab_from(LogicalPosition::new(1460.5, 588.0)), GRAB);
	}

	#[test]
	fn the_follow_places_every_reading_at_the_grab_offset_and_ends_on_the_release() {
		let placed = RefCell::new(Vec::new());

		let followed = follow(
			|| true,
			probed(vec![held_at(200.0, 100.0), held_at(220.0, 110.0), released_at(260.0, 140.0)]),
			|cursor| {
				placed.borrow_mut().push(cursor.origin_at(GRAB));
				Ok(())
			},
		);

		assert!(
			matches!(followed, Followed::Released(cursor) if cursor == released_at(260.0, 140.0))
		);
		assert_eq!(
			placed.into_inner(),
			vec![
				LogicalPosition::new(60.0, 38.0),
				LogicalPosition::new(70.0, 43.0),
				LogicalPosition::new(90.0, 58.0),
			]
		);
	}

	#[test]
	fn the_follow_reads_the_cursor_once_a_frame_while_the_primary_button_is_held() {
		let readings = Cell::new(0);
		let started = Instant::now();

		follow(
			|| true,
			|| {
				readings.set(readings.get() + 1);
				Ok(if readings.get() < 4 { held_at(0.0, 0.0) } else { released_at(0.0, 0.0) })
			},
			|_| Ok(()),
		);

		assert!(started.elapsed() >= FRAME * 3, "the follow did not wait a frame between readings");
	}

	#[test]
	fn a_follow_no_longer_live_stops_without_reading_the_cursor() {
		let followed = follow(|| false, || panic!("the cursor was read"), |_| Ok(()));

		assert!(matches!(followed, Followed::Stopped));
	}

	#[test]
	fn a_follow_whose_cursor_cannot_be_read_is_lost() {
		let followed = follow(
			|| true,
			|| Err(Unobservable { platform: "test", reason: "no pointer".to_owned() }),
			|_| Ok(()),
		);

		assert!(matches!(followed, Followed::Lost(FollowFailure::Unobservable(_))));
	}

	#[test]
	fn a_follow_whose_window_cannot_be_placed_is_lost() {
		let followed =
			follow(|| true, probed(vec![held_at(0.0, 0.0)]), |_| Err(tauri::Error::WindowNotFound));

		assert!(matches!(followed, Followed::Lost(FollowFailure::Unplaced(_))));
	}
}
