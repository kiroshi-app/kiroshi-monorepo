use std::process::ExitCode;
use std::thread;
use std::time::Duration;

use kiroshi_rune_os::policy::{Notice, NoticeKind, NoticeTarget};
use kiroshi_rune_os::{BannerOutcome, Notifier};

const APP_ID: &str = "com.kiroshi.app.dev";

const CLICK_WINDOW: Duration = Duration::from_secs(8);

fn main() -> ExitCode {
	#[cfg(target_os = "macos")]
	wear_a_dock_tile();
	let notifier = Notifier::new(APP_ID, |outcome| match outcome {
		BannerOutcome::Clicked(target) => println!("clicked: {:?} {}", target.kind, target.id),
		BannerOutcome::Refused { target, failure } => eprintln!("{failure} ({})", target.id),
	});
	let notice = Notice {
		title: "Nyx".to_owned(),
		body: "Finished its turn".to_owned(),
		target: NoticeTarget { kind: NoticeKind::Conversation, id: "c-1".to_owned() },
	};
	let shown = notifier.show(notice);
	let worn = notifier.set_badge(1);
	println!("banner and chime: {shown:?}, badge 1: {worn:?}");
	thread::sleep(CLICK_WINDOW);
	let cleared = notifier.set_badge(0);
	println!("badge cleared: {cleared:?}");
	match (shown, worn, cleared) {
		(Ok(()), Ok(()), Ok(())) => ExitCode::SUCCESS,
		_ => ExitCode::FAILURE,
	}
}

#[cfg(target_os = "macos")]
fn wear_a_dock_tile() {
	use objc2::MainThreadMarker;
	use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};

	let Some(marker) = MainThreadMarker::new() else { return };
	NSApplication::sharedApplication(marker)
		.setActivationPolicy(NSApplicationActivationPolicy::Regular);
}
