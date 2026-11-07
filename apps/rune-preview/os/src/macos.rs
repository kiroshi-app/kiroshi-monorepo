use std::cell::OnceCell;
use std::env::current_exe;
use std::ffi::OsStr;
use std::path::Path;

use mac_notification_sys::NotificationResponse;
use mac_notification_sys::error::{ApplicationError, Error as SysError};
use mac_usernotifications::{Notification, block_on, request_auth};
use objc2::rc::Retained;
use objc2::{AnyThread, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSApplicationActivationOptions, NSRunningApplication, NSSound};
use objc2_foundation::{NSData, NSString};

use crate::policy::Notice;
use crate::{BannerOutcome, CHIME, Heard, post_waiting, report};

pub fn holds_focus() -> Result<bool, String> {
	Ok(NSRunningApplication::currentApplication().isActive())
}

pub fn bring_to_front() -> Result<(), String> {
	let activated = NSRunningApplication::currentApplication()
		.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);
	activated.then_some(()).ok_or_else(|| "NSRunningApplication did not activate the app".into())
}

pub fn wear_badge(_app_id: &str, count: u32) -> Result<(), String> {
	let marker =
		MainThreadMarker::new().ok_or("the dock tile is only reachable from the main thread")?;
	let label = (count > 0).then(|| NSString::from_str(&count.to_string()));
	NSApplication::sharedApplication(marker).dockTile().setBadgeLabel(label.as_deref());
	Ok(())
}

thread_local! {
	static CHIME_SOUND: OnceCell<Option<Retained<NSSound>>> = const { OnceCell::new() };
}

pub fn play_chime() -> Result<(), String> {
	CHIME_SOUND.with(|cell| {
		let sound = cell
			.get_or_init(|| NSSound::initWithData(NSSound::alloc(), &NSData::with_bytes(CHIME)))
			.as_ref()
			.ok_or("NSSound did not read the chime")?;
		sound.stop();
		sound.play().then_some(()).ok_or_else(|| "NSSound did not play the chime".into())
	})
}

pub fn post_banner(app_id: &str, notice: Notice, heard: Heard) {
	if runs_inside_app_bundle() {
		through_notification_center(notice, heard);
	} else {
		through_notification_sys(app_id.to_owned(), notice, heard);
	}
}

fn runs_inside_app_bundle() -> bool {
	match current_exe() {
		Ok(path) => is_inside_app_bundle(&path),
		Err(failure) => {
			eprintln!("the executable path was not read: {failure}");
			false
		}
	}
}

fn is_inside_app_bundle(executable: &Path) -> bool {
	let mut ancestors = executable.ancestors().skip(1);
	let (Some(binaries), Some(contents), Some(bundle)) =
		(ancestors.next(), ancestors.next(), ancestors.next())
	else {
		return false;
	};

	binaries.file_name() == Some(OsStr::new("MacOS"))
		&& contents.file_name() == Some(OsStr::new("Contents"))
		&& bundle.extension() == Some(OsStr::new("app"))
}

fn through_notification_center(notice: Notice, heard: Heard) {
	let Notice { title, body, target } = notice;
	post_waiting(heard, target, move |heard, target| {
		match block_on(request_auth()) {
			Ok(true) => {}
			Ok(false) => {
				return report(heard, target, "alert authorization was refused".into());
			}
			Err(failure) => {
				return report(heard, target, format!("the authorization was not read: {failure}"));
			}
		}
		let handle = match block_on(Notification::new().title(title).message(body).send()) {
			Ok(handle) => handle,
			Err(failure) => {
				return report(heard, target, format!("UNUserNotificationCenter: {failure}"));
			}
		};
		match block_on(handle.response()) {
			Ok(response) if response.is_default_action() => heard(BannerOutcome::Clicked(target)),
			Ok(_) => {}
			Err(failure) => eprintln!("the notification response was not read: {failure}"),
		}
	});
}

fn through_notification_sys(app_id: String, notice: Notice, heard: Heard) {
	let Notice { title, body, target } = notice;
	post_waiting(heard, target, move |heard, target| {
		if let Err(answer) = impersonate(&app_id) {
			return report(heard, target, answer);
		}
		let response = mac_notification_sys::Notification::new()
			.title(&title)
			.message(&body)
			.wait_for_click(true)
			.send();
		match response {
			Ok(NotificationResponse::Click) => heard(BannerOutcome::Clicked(target)),
			Ok(_) => {}
			Err(failure) => report(heard, target, format!("NSUserNotificationCenter: {failure}")),
		}
	});
}

fn impersonate(app_id: &str) -> Result<(), String> {
	match mac_notification_sys::set_application(app_id) {
		Ok(()) | Err(SysError::Application(ApplicationError::AlreadySet(_))) => Ok(()),
		Err(failure) => Err(failure.to_string()),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn an_executable_under_contents_macos_of_a_dot_app_is_inside_a_bundle() {
		assert!(is_inside_app_bundle(Path::new(
			"/Applications/Kiroshi.app/Contents/MacOS/Kiroshi"
		)));
	}

	#[test]
	fn an_executable_built_in_the_target_folder_is_outside_a_bundle() {
		assert!(!is_inside_app_bundle(Path::new(
			"/workspace/apps/rune-preview/target/debug/kiroshi-rune-preview"
		)));
	}

	#[test]
	fn an_executable_beside_the_bundle_binaries_is_outside_a_bundle() {
		assert!(!is_inside_app_bundle(Path::new(
			"/Applications/Kiroshi.app/Contents/Resources/Kiroshi"
		)));
	}

	#[test]
	fn an_executable_at_the_root_is_outside_a_bundle() {
		assert!(!is_inside_app_bundle(Path::new("/Kiroshi")));
	}
}
