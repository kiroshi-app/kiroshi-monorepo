use std::{env::current_exe, ffi::OsStr, fmt::Display, path::Path};

use mac_usernotifications::{request_auth, Notification};
use tauri::{AppHandle, Runtime};

use super::commands::NotificationTarget;

pub fn show<R: Runtime>(
	app: AppHandle<R>,
	target: NotificationTarget,
	title: String,
	body: String,
) {
	let executable = match current_exe() {
		Ok(path) => Some(path),
		Err(failure) => {
			eprintln!("the executable path was not read: {failure}");
			None
		}
	};

	if executable.is_some_and(|path| is_inside_app_bundle(&path)) {
		through_notification_center(app, target, title, body);
	} else {
		through_notification_sys(app, target, title, body);
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

fn through_notification_center<R: Runtime>(
	app: AppHandle<R>,
	target: NotificationTarget,
	title: String,
	body: String,
) {
	tauri::async_runtime::spawn(async move {
		match request_auth().await {
			Ok(true) => {}
			Ok(false) => {
				return report_unshown("alert and sound authorization was refused");
			}
			Err(failure) => {
				return report_unshown(format!("the authorization was not read: {failure}"));
			}
		}

		let handle = match Notification::new().title(title).message(body).send().await {
			Ok(handle) => handle,
			Err(failure) => {
				return report_unshown(format!("the notification center refused it: {failure}"));
			}
		};

		match handle.response().await {
			Ok(response) if response.is_default_action() => super::activated(&app, target),
			Ok(_) => {}
			Err(failure) => {
				eprintln!("the notification response was not read: {failure}");
			}
		}
	});
}

fn through_notification_sys<R: Runtime>(
	app: AppHandle<R>,
	target: NotificationTarget,
	title: String,
	body: String,
) {
	use mac_notification_sys::{set_application, NotificationResponse};

	let identifier = app.config().identifier.clone();
	tauri::async_runtime::spawn_blocking(move || {
		let _ = set_application(&identifier);
		let response = mac_notification_sys::Notification::new()
			.title(&title)
			.message(&body)
			.wait_for_click(true)
			.send();
		if let Ok(NotificationResponse::Click) = response {
			super::activated(&app, target);
		}
	});
}

fn report_unshown(detail: impl Display) {
	eprintln!("the notification was not shown: {detail}");
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
			"/workspace/apps/app/src-tauri/target/debug/Kiroshi"
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
